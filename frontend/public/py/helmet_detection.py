"""Helmet Detection - otak deteksi pelanggaran helm pada pengendara motor."""
import argparse
import os
import threading
import time
from collections import deque
import cv2
import numpy as np

# Ambang (setel ulang dari foto asli dengan --evaluasi)
MIN_LEBAR = 1.20       # lebar kepala / lebar wajah  (tanpa helm 0.85-0.98, helm 1.41-1.64)
MIN_TINGGI = 0.40      # tinggi kepala di atas wajah / tinggi wajah (tanpa helm 0.14-0.31, helm 0.49-0.78)
MAKS_TEKSTUR = 0.06    # kepadatan tepi penutup kepala (helm mulus 0.01-0.04, kerudung berlipat ~0.09)
MAKS_KULIT_DAGU = 0.15 # porsi warna kulit di area dagu (helm full face 0.00-0.01, kerudung/rambut 0.41-1.00)
MIN_TINGGI_DAGU = 0.45 # jalur "dagu tertutup" hanya berlaku jika penutup kepala cukup tinggi (masker + kerudung ~0.40)
MIN_YAKIN = 0.5        # keyakinan minimal deteksi wajah
MAKS_LEBAR_WAJAH = 0.5 # kotak wajah lebih lebar dari 50% gambar dianggap salah deteksi
DETIK_TERTUTUP = 1.5   # wajah tidak terlihat selama ini -> periksa apakah tertutup kaca helm
DETIK_DIAM = 3.0       # tidak ada gerakan selama ini -> dianggap tidak ada orang
MIN_GERAK = 0.002      # proporsi piksel berubah (selisih antar-frame) agar dianggap ada gerakan

# Penstabil keputusan (supaya label tidak berkedip)
DETIK_RIWAYAT = 2.0    # keputusan diambil dari median pengukuran selama 2 detik terakhir
ZONA_RAGU = 0.25       # margin < 0.25 dari ambang -> "kurang yakin"
HISTERESIS = 0.15      # label baru berganti bila melewati ambang lebih dari margin ini
DETIK_GANTI = 0.6      # label baru harus bertahan selama ini sebelum ditampilkan
DETIK_INGAT_HELM = 5.0 # wajah hilang < 5 detik setelah terdeteksi helm -> kaca helm baru ditutup
SKALA_MARGIN = dict(lebar=0.20, tinggi=0.20, tekstur=0.03, dagu=0.10)   # 1 margin = jarak sebesar ini dari ambang

# Pemeriksa helm saat wajah tidak terlihat (transformasi Hough, Chapter 10)
MAKS_TEPI_TANPA_WAJAH = 0.05  # kepadatan tepi di dalam lingkaran helm (helm kaca gelap 0.015-0.041)

_DIR = os.path.dirname(os.path.abspath(__file__))


def _muat_detektor(nama, wajib=True):
    # OpenCV 4: cv2.CascadeClassifier. OpenCV 5: ada di paket opencv-contrib-python.
    Cascade = getattr(cv2, "CascadeClassifier", None) or getattr(getattr(cv2, "xobjdetect", None),
                                                                "CascadeClassifier", None)
    if Cascade is None:
        raise ImportError("Detektor wajah tidak tersedia di OpenCV ini. Jalankan:\n"
                          "  pip uninstall -y opencv-python\n  pip install opencv-contrib-python")
    for folder in (_DIR, getattr(getattr(cv2, "data", None), "haarcascades", "")):
        p = os.path.join(folder, nama)
        if os.path.exists(p):
            c = Cascade(p)
            if not c.empty():
                return c
    if wajib:
        raise FileNotFoundError(f"File {nama} tidak ditemukan. Letakkan file itu di folder yang sama dengan program.")
    return None


# Pendukung (di luar Chapter 1-10): detektor wajah Viola-Jones berlapis.
# Utama = wajah depan; cadangan = model wajah depan kedua (alt2); terakhir = wajah dari samping.
DETEKTOR_WAJAH = _muat_detektor("haarcascade_frontalface_default.xml")
DETEKTOR_CADANGAN = _muat_detektor("haarcascade_frontalface_alt2.xml", wajib=False)
DETEKTOR_SAMPING = _muat_detektor("haarcascade_profileface.xml", wajib=False)


class TidakAdaWajah(Exception):
    pass


def praproses(img):
    # Chapter 2: resize + konversi ke grayscale
    h, w = img.shape[:2]
    img = cv2.resize(img, (640, int(h * 640 / w)))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Chapter 3: CLAHE -> kontras wajah naik, detektor wajah lebih andal di cahaya redup
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return img, gray, clahe.apply(gray)


def cari_wajah(gray_eq, dengan_sumber=False):
    """Cari satu wajah. Lapisan: wajah depan -> wajah depan (model kedua) -> wajah samping."""
    W = gray_eq.shape[1]
    wajar = lambda b: b[2] <= MAKS_LEBAR_WAJAH * W          # kotak raksasa biasanya helm dikira wajah

    def hasil(kotak, sumber):
        kotak = tuple(int(v) for v in kotak)
        return (kotak, sumber) if dengan_sumber else kotak

    wajah, _, yakin = DETEKTOR_WAJAH.detectMultiScale3(gray_eq, scaleFactor=1.1, minNeighbors=5,
                                                       minSize=(60, 60), outputRejectLevels=True)
    # Tolak deteksi meragukan: keyakinan rendah atau kotak terlalu besar
    calon = [(b, float(k)) for b, k in zip(wajah, np.ravel(yakin)) if float(k) >= MIN_YAKIN and wajar(b)]
    if calon:
        return hasil(max(calon, key=lambda c: c[1])[0], "depan")   # wajah paling meyakinkan
    if DETEKTOR_CADANGAN is not None:                           # mis. wajah di dalam helm yang gelap
        calon = [b for b in DETEKTOR_CADANGAN.detectMultiScale(gray_eq, 1.1, 4, minSize=(60, 60)) if wajar(b)]
        if calon:
            return hasil(max(calon, key=lambda b: b[2]), "depan")
    if DETEKTOR_SAMPING is not None:                            # kepala menoleh ke kiri / kanan
        calon = [b for b in DETEKTOR_SAMPING.detectMultiScale(gray_eq, 1.1, 5, minSize=(60, 60)) if wajar(b)]
        calon += [(W - x - w, y, w, h) for x, y, w, h in
                  DETEKTOR_SAMPING.detectMultiScale(cv2.flip(gray_eq, 1), 1.1, 5, minSize=(60, 60)) if wajar((x, y, w, h))]
        if calon:
            return hasil(max(calon, key=lambda b: b[2]), "samping")
    raise TidakAdaWajah("Wajah tidak terdeteksi")


def segmentasi_kepala(img, wajah):
    """Chapter 10: segmentasi region (GrabCut) di sekitar wajah, Chapter 9: morfologi."""
    fx, fy, fw, fh = wajah
    H, W = img.shape[:2]
    x0, x1 = max(0, int(fx - 0.7 * fw)), min(W, int(fx + 1.7 * fw))
    y0, y1 = max(0, int(fy - 0.9 * fh)), min(H, int(fy + 0.9 * fh))
    area = img[y0:y1, x0:x1]
    m = np.full(area.shape[:2], cv2.GC_PR_BGD, np.uint8)
    cx, cy = fx + fw // 2 - x0, fy + fh // 2 - y0
    # perkiraan awal kepala = elips dari dagu sampai jauh di atas dahi (mungkin kepala).
    # Pusatnya digeser ke atas karena helm/rambut ada DI ATAS wajah; dengan begitu kubah helm
    # yang warnanya mirip latar (abu-abu) tetap ikut tersegmentasi.
    cv2.ellipse(m, (cx, cy - int(0.45 * fh)), (int(0.75 * fw), int(1.05 * fh)), 0, 0, 360, cv2.GC_PR_FGD, -1)
    # bagian tengah wajah pasti kepala
    m[fy - y0 + int(0.2 * fh):fy - y0 + int(0.8 * fh), fx - x0 + int(0.2 * fw):fx - x0 + int(0.8 * fw)] = cv2.GC_FGD
    # tepi kiri/kanan area pasti latar (juga tepi atas, kecuali area menyentuh batas foto)
    m[:, :3] = cv2.GC_BGD
    m[:, -3:] = cv2.GC_BGD
    if y0 > 0:
        m[:3, :] = cv2.GC_BGD
    # GrabCut dijalankan pada area yang diperkecil supaya cepat (cocok untuk webcam)
    skala = min(1.0, 160 / area.shape[1])
    kecil = cv2.resize(area, None, fx=skala, fy=skala, interpolation=cv2.INTER_AREA)
    m_kecil = cv2.resize(m, (kecil.shape[1], kecil.shape[0]), interpolation=cv2.INTER_NEAREST)
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    # GrabCut memakai k-means (ada unsur acak). Seed dikunci -> gambar yang sama selalu memberi hasil sama.
    cv2.setRNGSeed(0)
    cv2.grabCut(kecil, m_kecil, None, bgd, fgd, 3, cv2.GC_INIT_WITH_MASK)
    mask = np.where((m_kecil == cv2.GC_FGD) | (m_kecil == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    mask = cv2.resize(mask, (area.shape[1], area.shape[0]), interpolation=cv2.INTER_NEAREST)
    # Chapter 9: opening (buang bintik), closing (tutup celah), komponen terhubung terbesar
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    bersih = cv2.morphologyEx(cv2.morphologyEx(mask, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)
    n, lbl, stat, _ = cv2.connectedComponentsWithStats(bersih)
    if n > 1:
        bersih = np.where(lbl == 1 + np.argmax(stat[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
    return (x0, y0, x1, y1), mask, bersih


def kulit_dagu(img, wajah):
    """Pendukung (Chapter 6, ruang warna YCrCb): seberapa banyak area dagu berwarna kulit.
    Warna kulit acuan diambil dari pipi/hidung orang itu sendiri, jadi tidak bergantung warna kulit.
    Helm full face menutup dagu dengan chin bar -> hampir tidak ada kulit di area dagu."""
    fx, fy, fw, fh = wajah
    H = img.shape[0]
    ycc = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb).astype(np.float32)
    acuan = ycc[fy + int(0.45 * fh):fy + int(0.62 * fh), fx + int(0.3 * fw):fx + int(0.7 * fw), 1:].reshape(-1, 2)
    y1, y2 = fy + int(0.85 * fh), min(H, fy + int(1.05 * fh))
    dagu = ycc[y1:y2, fx + int(0.3 * fw):fx + int(0.7 * fw), 1:].reshape(-1, 2)
    if len(acuan) == 0 or len(dagu) == 0:
        return 1.0, (fx, fy, fw, fh)
    jarak = np.linalg.norm(dagu - np.median(acuan, axis=0), axis=1)
    return float(np.mean(jarak < 8)), (fx + int(0.3 * fw), y1, fx + int(0.7 * fw), y2)


def fitur(wajah, kotak, kepala, gray, img=None):
    fx, fy, fw, fh = wajah
    x0, y0 = kotak[:2]
    fyr = fy - y0                                       # posisi atas wajah di dalam area
    atas = kepala[:fyr + fh // 2]                      # kepala di atas tengah wajah
    ys = np.where(atas.any(axis=1))[0]
    puncak = int(ys.min()) if len(ys) else fyr
    lebar_baris = np.count_nonzero(atas, axis=1)
    baris_terlebar = puncak + int(np.argmax(lebar_baris[puncak:])) if len(ys) else fyr
    lebar_kepala = int(lebar_baris.max()) if len(ys) else fw
    # Tekstur penutup kepala (Chapter 10, deteksi tepi Canny):
    # area kepala di atas tengah wajah, tanpa kotak wajah, dikecilkan sedikit (erosi, Chapter 9)
    H, W = gray.shape
    tutup = np.zeros((H, W), np.uint8)
    tutup[kotak[1]:kotak[3], kotak[0]:kotak[2]] = kepala
    tutup[fy:fy + fh, fx:fx + fw] = 0
    tutup[fy + fh // 2:, :] = 0
    tutup = cv2.erode(tutup, np.ones((7, 7), np.uint8))
    s = 150 / fw                                       # samakan skala: wajah selebar 150 px
    g_s = cv2.resize(gray, None, fx=s, fy=s)
    t_s = cv2.resize(tutup, None, fx=s, fy=s, interpolation=cv2.INTER_NEAREST)
    tepi = cv2.Canny(cv2.GaussianBlur(g_s, (3, 3), 0), 40, 100)
    tekstur = np.count_nonzero(tepi[t_s > 0]) / max(np.count_nonzero(t_s), 1)
    dagu, kotak_dagu = kulit_dagu(img, wajah) if img is not None else (1.0, None)
    f = dict(lebar=lebar_kepala / fw, tinggi=(fyr - puncak) / fh, tekstur=tekstur, dagu=dagu)
    ukur = dict(puncak=puncak + y0, baris=baris_terlebar + y0, kotak_dagu=kotak_dagu,
                kiri=x0 + int(np.where(kepala[baris_terlebar])[0].min()) if lebar_kepala else fx,
                kanan=x0 + int(np.where(kepala[baris_terlebar])[0].max()) if lebar_kepala else fx + fw)
    return f, ukur


def penutup_helm(f):
    """Syarat 3: penutup kepala mulus (tekstur rendah) ATAU dagu tertutup chin bar (helm full face
    yang banyak ventilasi/logo bisa bertekstur tinggi, tetapi dagunya pasti tertutup)."""
    return f["tekstur"] < MAKS_TEKSTUR or (f.get("dagu", 1.0) < MAKS_KULIT_DAGU and f["tinggi"] > MIN_TINGGI_DAGU)


def putuskan(f):
    # Helm = kepala jauh lebih lebar DAN lebih tinggi daripada wajah, DAN (penutupnya mulus ATAU dagu tertutup)
    helm = f["lebar"] > MIN_LEBAR and f["tinggi"] > MIN_TINGGI and penutup_helm(f)
    return "PAKAI HELM" if helm else "PELANGGARAN"


def margin(f):
    """Seberapa jauh fitur dari ambang (positif = memenuhi syarat helm). Margin keputusan = yang terkecil."""
    m = dict(lebar=(f["lebar"] - MIN_LEBAR) / SKALA_MARGIN["lebar"],
             tinggi=(f["tinggi"] - MIN_TINGGI) / SKALA_MARGIN["tinggi"],
             tekstur=(MAKS_TEKSTUR - f["tekstur"]) / SKALA_MARGIN["tekstur"],
             dagu=min((MAKS_KULIT_DAGU - f.get("dagu", 1.0)) / SKALA_MARGIN["dagu"],
                      (f["tinggi"] - MIN_TINGGI_DAGU) / SKALA_MARGIN["tinggi"]))
    # syarat 3 terpenuhi oleh salah satu: tekstur mulus ATAU dagu tertutup (dengan penutup yang cukup tinggi)
    return min(m["lebar"], m["tinggi"], max(m["tekstur"], m["dagu"])), m


def alasan(f):
    if putuskan(f) == "PAKAI HELM":
        return "Ketiga syarat terpenuhi" if f["tekstur"] < MAKS_TEKSTUR else "Helm full face: dagu tertutup chin bar"
    if f["lebar"] <= MIN_LEBAR:
        return "Kepala tidak lebih lebar dari wajah"
    if f["tinggi"] <= MIN_TINGGI:
        return "Tidak ada penutup yang menjulang di atas dahi"
    return "Penutup kepala berlipat dan dagu terlihat, bukan helm"


def cek_helm_tanpa_wajah(img, gray):
    """Saat wajah tidak terlihat (mis. kaca helm gelap): cari bentuk helm.
    Chapter 10: transformasi Hough mencari lingkaran besar (cangkang helm),
    lalu kepadatan tepi Canny di dalamnya harus rendah (permukaan helm mulus)."""
    H, W = gray.shape
    c = cv2.HoughCircles(cv2.medianBlur(gray, 7), cv2.HOUGH_GRADIENT, dp=1.5, minDist=W // 3,
                         param1=90, param2=40, minRadius=int(0.12 * W), maxRadius=int(0.35 * W))
    if c is None:
        return dict(helm=False, lingkaran=None, tepi=None)
    c = [t for t in np.round(c[0]).astype(int) if 0.2 * W < t[0] < 0.8 * W and t[1] < 0.7 * H]
    if not c:
        return dict(helm=False, lingkaran=None, tepi=None)
    x, y, r = (int(v) for v in c[0])
    s = 100 / r                                            # samakan skala: jari-jari 100 px
    g = cv2.resize(gray, None, fx=s, fy=s)
    m = np.zeros(g.shape, np.uint8)
    cv2.circle(m, (int(x * s), int(y * s)), 88, 255, -1)
    tepi_img = cv2.Canny(cv2.GaussianBlur(g, (3, 3), 0), 40, 100)
    tepi = float(np.count_nonzero(tepi_img[m > 0]) / max(np.count_nonzero(m), 1))
    return dict(helm=tepi < MAKS_TEPI_TANPA_WAJAH, lingkaran=(x, y, r), tepi=tepi)


class Penstabil:
    """Menstabilkan keputusan dari frame ke frame (dipakai webcam terminal dan web).
    - median pengukuran 2 detik terakhir
    - histeresis + jeda ganti label -> label tidak berkedip saat nilai dekat ambang
    - wajah hilang: PAKAI HELM hanya jika baru saja terdeteksi helm (kaca ditutup)
      atau bentuk helm bulat-mulus ditemukan; selain itu "Wajah tidak terlihat"."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.riwayat = deque(maxlen=7)
        self.tanpa_wajah = deque(maxlen=6)
        self.waktu_wajah = None
        self.waktu_gerak = None
        self.label = None
        self.calon, self.waktu_calon = None, 0.0
        self.waktu_helm = -1e9

    def perbarui(self, t, h=None, tanpa_wajah=None, gerak=True):
        """t = waktu (detik). h = hasil proses_gambar (None jika tidak ada wajah)."""
        if self.waktu_gerak is None:
            self.waktu_gerak = self.waktu_wajah = t
        if gerak:
            self.waktu_gerak = t
        if h is not None:
            self.riwayat.append((t, h["fitur"]))
            if not h.get("cadangan"):
                self.waktu_wajah = t
        if tanpa_wajah is not None:
            self.tanpa_wajah.append((t, tanpa_wajah["helm"]))
        baru = [f for w, f in self.riwayat if t - w < DETIK_RIWAYAT]

        if not baru:
            return self._tanpa_wajah(t)

        f = {k: float(np.median([x.get(k, 1.0) for x in baru])) for k in ("lebar", "tinggi", "tekstur", "dagu")}
        m, per = margin(f)
        # histeresis: label sekarang dipertahankan sampai nilai jelas melewati ambang
        batas = -HISTERESIS if self.label == "helm" else HISTERESIS if self.label == "pelanggaran" else 0.0
        target = "helm" if m > batas else "pelanggaran"
        ragu = abs(m) < ZONA_RAGU
        if self.label is None:
            if not ragu or len(baru) >= 3:
                self.label = target
        elif target != self.label:
            if self.calon != target:
                self.calon, self.waktu_calon = target, t
            elif t - self.waktu_calon >= DETIK_GANTI:
                self.label, self.calon = target, None
        else:
            self.calon = None
        if self.label == "helm":
            self.waktu_helm = t
        ok = {k: v > 0 for k, v in per.items()}
        ok["penutup"] = ok["tekstur"] or ok["dagu"]
        yakin = round(min(1.0, abs(m)), 2)
        if self.label is None:
            return dict(kelas="info", teks="Memeriksa…", sub="Tahan posisi, hadap lurus ke kamera",
                        fitur=f, ok=ok, yakin=yakin, ragu=True)
        helm = self.label == "helm"
        sub = alasan(f) if (m > 0) == helm else ("Syarat helm terpenuhi" if helm else "Belum memenuhi syarat helm")
        if ragu:
            sub += " · kurang yakin, dekatkan wajah"
        return dict(kelas="ok" if helm else "no", teks="PAKAI HELM" if helm else "PELANGGARAN", sub=sub,
                    fitur=f, ok=ok, yakin=yakin, ragu=ragu)

    def _tanpa_wajah(self, t):
        tanpa = dict(fitur=None, ok=None, yakin=None, ragu=False)
        if t - self.waktu_gerak > DETIK_DIAM:
            self.label = None
            return dict(kelas="", teks="Tidak ada orang", sub="Belum ada pengendara di depan kamera", **tanpa)
        if t - self.waktu_wajah <= DETIK_TERTUTUP:
            return dict(kelas="info", teks="Mencari wajah…", sub="Hadap ke kamera", **tanpa)
        if t - self.waktu_helm < DETIK_INGAT_HELM:
            return dict(kelas="ok", teks="PAKAI HELM", sub="Kaca helm ditutup (sebelumnya terdeteksi helm)", **tanpa)
        cek = [helm for w, helm in self.tanpa_wajah if t - w < DETIK_RIWAYAT]
        if len(cek) >= 2 and sum(cek) / len(cek) >= 0.6:
            return dict(kelas="ok", teks="PAKAI HELM", sub="Wajah tertutup kaca helm; bentuk helm terdeteksi", **tanpa)
        self.label = None
        return dict(kelas="info", teks="Wajah tidak terlihat", sub="Hadap ke kamera atau buka kaca helm sebentar", **tanpa)


def proses_gambar(img0, wajah_cadangan=None):
    """wajah_cadangan: posisi wajah terakhir (dipakai webcam) jika wajah sesaat tidak terdeteksi."""
    img, gray, gray_eq = praproses(img0)
    cadangan, sumber = False, "cadangan"
    try:
        wajah, sumber = cari_wajah(gray_eq, dengan_sumber=True)
    except TidakAdaWajah:
        if wajah_cadangan is None:
            raise
        wajah, cadangan = tuple(int(v) for v in wajah_cadangan), True
    kotak, mask, kepala = segmentasi_kepala(img, wajah)
    f, ukur = fitur(wajah, kotak, kepala, gray, img)
    return dict(img=img, gray=gray, gray_eq=gray_eq, wajah=wajah, kotak=kotak, cadangan=cadangan, sumber=sumber,
                mask=mask, kepala=kepala, fitur=f, ukur=ukur, label=putuskan(f))


def proses(path):
    img0 = cv2.imread(path)
    if img0 is None:
        raise ValueError(f"Gagal membaca gambar: {path}")
    return proses_gambar(img0)


# ---------------------------------------------------------------- tampilan
def gambar_panel(h):
    """8 tahap proses sebagai daftar (judul, gambar BGR/gray)."""
    img, (fx, fy, fw, fh), (x0, y0, x1, y1) = h["img"], h["wajah"], h["kotak"]
    label, u = h["label"], h["ukur"]
    warna = (0, 200, 0) if label == "PAKAI HELM" else (0, 0, 255)
    p4 = img.copy()
    cv2.rectangle(p4, (fx, fy), (fx + fw, fy + fh), (0, 255, 0), 3)
    cv2.rectangle(p4, (x0, y0), (x1, y1), (255, 200, 0), 2)
    full_mask = np.zeros(img.shape[:2], np.uint8)
    full_mask[y0:y1, x0:x1] = h["mask"]
    full_kep = np.zeros(img.shape[:2], np.uint8)
    full_kep[y0:y1, x0:x1] = h["kepala"]
    p7 = img.copy()
    p7[full_kep == 0] = (p7[full_kep == 0] * 0.35).astype(np.uint8)
    cv2.rectangle(p7, (fx, fy), (fx + fw, fy + fh), (0, 255, 0), 2)
    cv2.line(p7, (u["kiri"], u["baris"]), (u["kanan"], u["baris"]), (0, 255, 255), 3)   # lebar kepala
    cv2.line(p7, (fx + fw // 2, u["puncak"]), (fx + fw // 2, fy), (255, 0, 255), 3)    # tinggi di atas wajah
    if u.get("kotak_dagu"):                                                            # area dagu (warna kulit?)
        a1, b1, a2, b2 = u["kotak_dagu"]
        cv2.rectangle(p7, (a1, b1), (a2, b2), (255, 255, 0), 2)
    p8 = img.copy()
    cv2.rectangle(p8, (x0, max(u["puncak"], 0)), (x1, fy + fh), warna, 3)
    return [("1. Asli", img), ("2. Grayscale", h["gray"]), ("3. CLAHE", h["gray_eq"]),
            ("4. Deteksi wajah", p4), ("5. Segmentasi GrabCut", full_mask),
            ("6. Morfologi", full_kep), ("7. Pengukuran", p7), ("8. Hasil", p8)]


def teks_fitur(f):
    return f"lebar {f['lebar']:.2f}  tinggi {f['tinggi']:.2f}  tekstur {f['tekstur']:.3f}  kulit dagu {f.get('dagu', 1.0):.2f}"


def tampilkan(path, h, simpan=False, tampil=True):
    import matplotlib.pyplot as plt   # hanya untuk versi terminal (tidak dipakai di browser)
    label = h["label"]
    fig = plt.figure(figsize=(16, 7.5))
    for i, (judul, im) in enumerate(gambar_panel(h), 1):
        plt.subplot(2, 4, i)
        if im.ndim == 3:
            plt.imshow(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))
        else:
            plt.imshow(im, cmap="gray", vmin=0, vmax=255)
        plt.title(judul); plt.axis("off")
    fig.suptitle(f"{os.path.basename(path)}  ->  {label}   |   {teks_fitur(h['fitur'])}",
                 fontsize=13, fontweight="bold", color="green" if label == "PAKAI HELM" else "red")
    plt.tight_layout()
    if simpan:
        os.makedirs("output", exist_ok=True)
        nama = os.path.join("output", "hasil_" + os.path.splitext(os.path.basename(path))[0] + ".png")
        plt.savefig(nama, dpi=90, bbox_inches="tight")
        print("Disimpan:", nama)
    if tampil:
        plt.show()
    plt.close(fig)


def _label(im, teks, warna=(255, 255, 255)):
    im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGR) if im.ndim == 2 else im.copy()
    im = cv2.resize(im, (320, 240))
    cv2.rectangle(im, (0, 0), (320, 26), (0, 0, 0), -1)
    cv2.putText(im, teks, (6, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.55, warna, 1, cv2.LINE_AA)
    return im


def panel_8(h):
    """8 tahap dalam satu gambar OpenCV (dipakai mode webcam)."""
    label = h["label"]
    warna = (0, 200, 0) if label == "PAKAI HELM" else (0, 0, 255)
    p = [_label(im, judul, warna if judul.startswith("8") else (255, 255, 255)) for judul, im in gambar_panel(h)]
    grid = np.vstack([np.hstack(p[:4]), np.hstack(p[4:])])
    info = np.zeros((60, grid.shape[1], 3), np.uint8)
    cv2.putText(info, label, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, warna, 3, cv2.LINE_AA)
    cv2.putText(info, teks_fitur(h["fitur"]), (330, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                (255, 255, 255), 2, cv2.LINE_AA)
    return np.vstack([info, grid])


# ---------------------------------------------------------------- evaluasi
def evaluasi(folder, simpan=False):
    """Uji semua foto di folder/helm dan folder/pelanggaran, lalu hitung confusion matrix."""
    import matplotlib.pyplot as plt
    kelas = {"helm": "PAKAI HELM", "pelanggaran": "PELANGGARAN"}
    tp = tn = fp = fn = 0
    salah, gagal = [], []
    print(f"{'File':40} {'Asli':12} {'Prediksi':12} lebar  tinggi  tekstur")
    for sub, label_asli in kelas.items():
        d = os.path.join(folder, sub)
        if not os.path.isdir(d):
            print(f"(folder {d} tidak ada, dilewati)")
            continue
        for nama in sorted(os.listdir(d)):
            if not nama.lower().endswith((".jpg", ".jpeg", ".png", ".bmp")):
                continue
            path = os.path.join(d, nama)
            try:
                h = proses(path)
            except (ValueError, TidakAdaWajah) as e:
                print(f"{sub + '/' + nama:40} {e}")
                gagal.append(path)
                continue
            pred, f = h["label"], h["fitur"]
            print(f"{sub + '/' + nama:40} {label_asli:12} {pred:12} {f['lebar']:.2f}   {f['tinggi']:.2f}   {f['tekstur']:.3f}")
            if simpan:
                tampilkan(path, h, simpan=True, tampil=False)
            if label_asli == "PAKAI HELM":
                tp, fn = (tp + 1, fn) if pred == label_asli else (tp, fn + 1)
            else:
                tn, fp = (tn + 1, fp) if pred == label_asli else (tn, fp + 1)
            if pred != label_asli:
                salah.append(path)
    total = tp + tn + fp + fn
    if total == 0:
        print("Tidak ada foto yang berhasil diuji.")
        return
    akurasi = (tp + tn) / total * 100
    print("\nConfusion matrix")
    print(f"{'':22}{'Pred: Helm':>12}{'Pred: Langgar':>15}")
    print(f"{'Asli: Pakai helm':22}{tp:>12}{fn:>15}")
    print(f"{'Asli: Pelanggaran':22}{fp:>12}{tn:>15}")
    print(f"\nAkurasi = ({tp} + {tn}) / {total} = {akurasi:.1f}%")
    if salah:
        print("Foto yang salah diklasifikasi:")
        for s in salah:
            print("  -", s)
    if gagal:
        print(f"{len(gagal)} foto dilewati karena wajah tidak terdeteksi.")
    fig, ax = plt.subplots(figsize=(5, 4.5))
    m = np.array([[tp, fn], [fp, tn]])
    ax.imshow(m, cmap="Blues")
    for (i, j), v in np.ndenumerate(m):
        ax.text(j, i, str(v), ha="center", va="center", fontsize=20,
                color="white" if v > m.max() / 2 else "black")
    ax.set_xticks([0, 1], ["Pakai helm", "Pelanggaran"]); ax.set_yticks([0, 1], ["Pakai helm", "Pelanggaran"])
    ax.set_xlabel("Prediksi"); ax.set_ylabel("Asli")
    ax.set_title(f"Confusion matrix  (akurasi {akurasi:.1f}%)")
    plt.tight_layout()
    os.makedirs("output", exist_ok=True)
    plt.savefig(os.path.join("output", "confusion_matrix.png"), dpi=100)
    print("Disimpan: output/confusion_matrix.png")
    plt.close(fig)


# ---------------------------------------------------------------- webcam
def ada_gerakan(sebelum, sekarang):
    """Chapter 2 (aritmetika citra): selisih dua frame. Orang di depan kamera selalu bergerak sedikit,
    ruangan kosong praktis diam. Hanya area tengah yang diperiksa."""
    a = cv2.GaussianBlur(cv2.resize(cv2.cvtColor(sebelum, cv2.COLOR_BGR2GRAY), (160, 120)), (5, 5), 0)
    b = cv2.GaussianBlur(cv2.resize(cv2.cvtColor(sekarang, cv2.COLOR_BGR2GRAY), (160, 120)), (5, 5), 0)
    beda = cv2.absdiff(a, b)[12:120, 24:136]
    return np.count_nonzero(beda > 12) / beda.size > MIN_GERAK


def webcam(kamera=0):
    """Mode webcam: SPASI = 8 tahap, L = label, H/P = simpan dataset, S = simpan hasil, Q = keluar."""
    cap = cv2.VideoCapture(kamera, cv2.CAP_DSHOW) if os.name == "nt" else cv2.VideoCapture(kamera)
    if not cap.isOpened():
        print("Webcam tidak bisa dibuka. Coba --kamera 1 atau tutup aplikasi lain yang memakai kamera.")
        return
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    print(webcam.__doc__)

    # Analisis berjalan di thread terpisah supaya tampilan kamera tetap lancar
    bersama = {"frame": None, "label": "Menunggu...", "warna": (255, 255, 255), "jalan": True, "langsung": True,
               "gerak_terakhir": 0.0}
    kunci = threading.Lock()

    def pekerja():
        penstabil = Penstabil()                           # aturan stabilisasi yang sama dengan versi web
        wajah_terakhir, waktu_wajah = None, 0.0
        while bersama["jalan"]:
            with kunci:
                frame = None if bersama["frame"] is None else bersama["frame"].copy()
            if frame is None or not bersama["langsung"]:
                time.sleep(0.05)
                continue
            sekarang = time.time()
            cadangan = wajah_terakhir if sekarang - waktu_wajah < 1.0 else None
            h = tanpa = None
            try:
                h = proses_gambar(frame, wajah_cadangan=cadangan)
                if not h["cadangan"]:
                    wajah_terakhir, waktu_wajah = h["wajah"], sekarang
            except TidakAdaWajah:
                img, gray, _ = praproses(frame)
                tanpa = cek_helm_tanpa_wajah(img, gray)
            st = penstabil.perbarui(sekarang, h, tanpa, gerak=sekarang - bersama["gerak_terakhir"] < 0.7)
            label = st["teks"] + (f"  ({teks_fitur(st['fitur'])})" if st["fitur"] else f"  - {st['sub']}")
            warna = {"ok": (0, 200, 0), "no": (0, 0, 255), "info": (0, 200, 255)}.get(st["kelas"], (200, 200, 200))
            with kunci:
                bersama["label"], bersama["warna"] = label, warna
            time.sleep(0.05)

    t = threading.Thread(target=pekerja, daemon=True)
    t.start()
    hasil_8 = None
    frame_lalu, waktu_lalu = None, 0.0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)                        # seperti cermin
        if time.time() - waktu_lalu > 0.5:               # cek gerakan tiap 0,5 detik
            if frame_lalu is not None and ada_gerakan(frame_lalu, frame):
                bersama["gerak_terakhir"] = time.time()
            frame_lalu, waktu_lalu = frame, time.time()
        with kunci:
            bersama["frame"] = frame
            label, warna = bersama["label"], bersama["warna"]
        tampil = frame.copy()
        if bersama["langsung"]:
            cv2.rectangle(tampil, (0, 0), (tampil.shape[1], 40), (0, 0, 0), -1)
            cv2.putText(tampil, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, warna, 2, cv2.LINE_AA)
        cv2.putText(tampil, "SPASI: analisis  L: label  H/P: simpan dataset  S: simpan hasil  Q: keluar",
                    (10, tampil.shape[0] - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.imshow("HelmetGuard - Webcam", tampil)

        k = cv2.waitKey(1) & 0xFF
        if k in (ord("q"), 27):
            break
        elif k == ord("l"):
            bersama["langsung"] = not bersama["langsung"]
        elif k == 32:                                     # spasi
            try:
                hasil_8 = panel_8(proses_gambar(frame))
                cv2.imshow("HelmetGuard - Hasil 8 tahap", hasil_8)
            except TidakAdaWajah:
                print("Wajah tidak terlihat. Buka kaca helm / hadap ke kamera untuk melihat 8 tahap.")
        elif k in (ord("h"), ord("p")):
            sub = "helm" if k == ord("h") else "pelanggaran"
            d = os.path.join("dataset", sub)
            os.makedirs(d, exist_ok=True)
            nama = os.path.join(d, f"{sub}_{len(os.listdir(d)) + 1:03d}.jpg")
            cv2.imwrite(nama, frame)
            print("Foto disimpan:", nama)
        elif k == ord("s") and hasil_8 is not None:
            os.makedirs("output", exist_ok=True)
            nama = os.path.join("output", f"webcam_{len(os.listdir('output')) + 1:03d}.png")
            cv2.imwrite(nama, hasil_8)
            print("Hasil disimpan:", nama)
    bersama["jalan"] = False
    t.join(timeout=1)
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="HelmetGuard - deteksi pelanggaran helm")
    ap.add_argument("foto", nargs="?", help="path satu foto")
    ap.add_argument("--evaluasi", metavar="FOLDER", help="folder berisi subfolder helm/ dan pelanggaran/")
    ap.add_argument("--simpan", action="store_true", help="simpan gambar 8 panel ke folder output/")
    ap.add_argument("--webcam", action="store_true", help="uji langsung dengan webcam")
    ap.add_argument("--kamera", type=int, default=0, help="nomor kamera (default 0)")
    a = ap.parse_args()
    if a.webcam:
        webcam(a.kamera)
    elif a.evaluasi:
        evaluasi(a.evaluasi, simpan=a.simpan)
    elif a.foto:
        h = proses(a.foto)
        print(f"{a.foto}: {h['label']}  ({teks_fitur(h['fitur'])})")
        tampilkan(a.foto, h, simpan=a.simpan)
    else:
        ap.print_help()
