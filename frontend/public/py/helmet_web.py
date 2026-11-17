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


def analisis(data, cadangan=None):
    """Analisis cepat satu frame kamera. cadangan = posisi wajah terakhir [x, y, w, h] atau None."""
    img = _baca(data)
    if hasattr(cadangan, "to_py"):          # array dari JavaScript (Pyodide)
        cadangan = cadangan.to_py()
    cad = tuple(int(v) for v in cadangan) if cadangan else None
    try:
        h = hg.proses_gambar(img, wajah_cadangan=cad)
    except hg.TidakAdaWajah:
        return json.dumps({"wajah": False})
    hasil = _ringkas(h)
    hasil["pakai_cadangan"] = bool(h.get("cadangan"))
    return json.dumps(hasil)


def tahapan(data):
    """Analisis lengkap 8 tahap (tombol 'Lihat 8 tahap' dan unggah foto)."""
    img = _baca(data)
    try:
        h = hg.proses_gambar(img)
    except hg.TidakAdaWajah:
        return json.dumps({"wajah": False, "pesan": "Wajah tidak terlihat. Jika memakai helm kaca gelap, "
                                                    "buka kacanya untuk melihat proses pengukuran."})
    hasil = _ringkas(h)
    hasil["panel"] = [{"judul": judul, "keterangan": ket, "gambar": _jpeg64(im)}
                      for (judul, im), ket in zip(hg.gambar_panel(h), PENJELASAN)]
    return json.dumps(hasil)
