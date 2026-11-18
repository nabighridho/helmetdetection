"""Jembatan antara web (JavaScript) dan helmet_detection.py.
Berjalan di browser lewat Pyodide: kode Python + OpenCV yang sama dengan versi terminal."""
import base64
import json

import cv2
import numpy as np

import helmet_detection as hg

PENJELASAN = [
    "Citra asli dari kamera, diperkecil ke lebar 640 px (Bab 2).",
    "Konversi ke grayscale: satu kanal intensitas (Bab 2).",
    "CLAHE: ekualisasi histogram lokal agar wajah di dalam helm tetap jelas (Bab 3).",
    "Viola-Jones menemukan wajah (hijau); kotak biru = area pencarian kepala.",
    "Segmentasi kepala berbasis region dengan GrabCut (Bab 10).",
    "Opening, closing, dan komponen terhubung terbesar (Bab 9).",
    "Pengukuran: kuning = lebar kepala, ungu = tinggi di atas wajah.",
    "Keputusan dari tiga fitur: lebar, tinggi, dan tekstur.",
]


def info():
    return json.dumps({
        "nama": "Helmet Detection",
        "ambang": {"lebar": hg.MIN_LEBAR, "tinggi": hg.MIN_TINGGI, "tekstur": hg.MAKS_TEKSTUR},
        "detik_tertutup": hg.DETIK_TERTUTUP,
        "detik_diam": hg.DETIK_DIAM,
        "zona_ragu": hg.ZONA_RAGU,
    })


def _baca(data):
    if hasattr(data, "to_bytes"):          # Uint8Array dari JavaScript (Pyodide)
        data = data.to_bytes()
    img = cv2.imdecode(np.frombuffer(bytes(data), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Gambar tidak bisa dibaca")
    return img


def _jpeg64(im, kualitas=82):
    ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, kualitas])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def _ringkas(h):
    """Hasil dalam koordinat 0-1 supaya bisa digambar di atas video ukuran apa pun."""
    H, W = h["img"].shape[:2]
    fx, fy, fw, fh = (int(v) for v in h["wajah"])
    u = h["ukur"]
    return {
        "wajah": True,
        "label": h["label"],
        "fitur": {k: round(float(v), 4) for k, v in h["fitur"].items()},
        "kotak_wajah": [fx / W, fy / H, fw / W, fh / H],
        "wajah_px": [fx, fy, fw, fh],
        "garis_lebar": [float(u["kiri"]) / W, float(u["baris"]) / H, float(u["kanan"]) / W],
        "garis_tinggi": [(fx + fw / 2) / W, float(u["puncak"]) / H, fy / H],
    }


PENSTABIL = hg.Penstabil()      # keputusan stabil antar-frame (aturan sama dengan versi terminal)


def reset():
    """Dipanggil saat kamera dinyalakan ulang atau berganti sumber."""
    PENSTABIL.reset()


def _status(st):
    hasil = dict(st)
    if st.get("fitur"):
        hasil["fitur"] = {k: round(float(v), 4) for k, v in st["fitur"].items()}
    return hasil


def _nilai(v):
    """null/undefined dari JavaScript -> None."""
    return None if v is None or type(v).__name__ in ("JsNull", "JsUndefined") else v


def analisis(data, cadangan=None, t=None, gerak=True):
    """Analisis cepat satu frame kamera.
    cadangan = posisi wajah terakhir [x, y, w, h] atau None; t = waktu (detik); gerak = ada gerakan."""
    img = _baca(data)
    cadangan, t, gerak = _nilai(cadangan), _nilai(t), _nilai(gerak)
    if hasattr(cadangan, "to_py"):          # array dari JavaScript (Pyodide)
        cadangan = cadangan.to_py()
    cad = tuple(int(v) for v in cadangan) if cadangan else None
    t = float(t) if t is not None else None
    gerak = True if gerak is None else bool(gerak)
    try:
        h = hg.proses_gambar(img, wajah_cadangan=cad)
    except hg.TidakAdaWajah:
        im, gray, _ = hg.praproses(img)
        cek = hg.cek_helm_tanpa_wajah(im, gray)
        hasil = {"wajah": False}
        if cek["lingkaran"]:
            H, W = im.shape[:2]
            x, y, r = cek["lingkaran"]
            hasil["lingkaran"] = [x / W, y / H, r / W]
            hasil["helm_tanpa_wajah"] = bool(cek["helm"])
        if t is not None:
            hasil["status"] = _status(PENSTABIL.perbarui(t, None, cek, bool(gerak)))
        return json.dumps(hasil)
    hasil = _ringkas(h)
    hasil["pakai_cadangan"] = bool(h.get("cadangan"))
    hasil["sumber"] = h.get("sumber")
    if t is not None:
        hasil["status"] = _status(PENSTABIL.perbarui(t, h, None, bool(gerak)))
    return json.dumps(hasil)


def tahapan(data):
    """Analisis lengkap 8 tahap (tombol 'Lihat 8 tahap' dan unggah foto)."""
    img = _baca(data)
    try:
        h = hg.proses_gambar(img)
    except hg.TidakAdaWajah:
        im, gray, _ = hg.praproses(img)
        cek = hg.cek_helm_tanpa_wajah(im, gray)
        pesan = ("Wajah tidak terlihat, tetapi bentuk helm yang bulat dan mulus terdeteksi (transformasi Hough). "
                 "Buka kaca helm untuk melihat 8 tahap pengukuran." if cek["helm"] else
                 "Wajah tidak terlihat. Hadapkan wajah ke kamera, atau buka kaca helm untuk melihat proses pengukuran.")
        return json.dumps({"wajah": False, "pesan": pesan})
    hasil = _ringkas(h)
    hasil["panel"] = [{"judul": judul, "keterangan": ket, "gambar": _jpeg64(im)}
                      for (judul, im), ket in zip(hg.gambar_panel(h), PENJELASAN)]
    return json.dumps(hasil)
