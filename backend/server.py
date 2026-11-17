"""Helmet Detection - API Python (FastAPI). Tampilan web ada di folder frontend (Next.js)."""
import base64
import io
import os
import sys

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

FOLDER_WEB = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, FOLDER_WEB)
import helmet_detection as hg  # noqa: E402

app = FastAPI(title="Helmet Detection API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.state.link_publik = os.environ.get("HELMET_LINK", "")

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


def baca_gambar(data: bytes):
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Gambar tidak bisa dibaca")
    return img


def ke_jpeg64(im, kualitas=82):
    ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, kualitas])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def ringkas(h):
    """Hasil analisis dalam koordinat 0-1 supaya bisa digambar di atas video ukuran apa pun."""
    H, W = h["img"].shape[:2]
    fx, fy, fw, fh = h["wajah"]
    u = h["ukur"]
    return {
        "wajah": True,
        "label": h["label"],
        "fitur": {k: round(float(v), 4) for k, v in h["fitur"].items()},
        "kotak_wajah": [fx / W, fy / H, fw / W, fh / H],
        "wajah_px": [int(fx), int(fy), int(fw), int(fh)],
        "garis_lebar": [u["kiri"] / W, u["baris"] / H, u["kanan"] / W],
        "garis_tinggi": [(fx + fw / 2) / W, u["puncak"] / H, fy / H],
    }


@app.get("/api/info")
def info():
    return {
        "nama": "Helmet Detection",
        "ambang": {"lebar": hg.MIN_LEBAR, "tinggi": hg.MIN_TINGGI, "tekstur": hg.MAKS_TEKSTUR},
        "detik_tertutup": hg.DETIK_TERTUTUP,
        "detik_diam": hg.DETIK_DIAM,
        "link_publik": app.state.link_publik,
    }


@app.post("/api/analisis")
async def analisis(request: Request, fx: int = -1, fy: int = -1, fw: int = -1, fh: int = -1):
    """Analisis cepat satu frame kamera. fx..fh = posisi wajah terakhir (cadangan) dari browser."""
    img = baca_gambar(await request.body())
    cadangan = (fx, fy, fw, fh) if min(fx, fy, fw, fh) >= 0 else None
    try:
        h = hg.proses_gambar(img, wajah_cadangan=cadangan)
    except hg.TidakAdaWajah:
        return {"wajah": False}
    hasil = ringkas(h)
    hasil["pakai_cadangan"] = bool(h.get("cadangan"))
    return hasil


@app.post("/api/tahapan")
async def tahapan(request: Request):
    """Analisis lengkap 8 tahap (untuk tombol 'Lihat 8 tahap' dan unggah foto)."""
    img = baca_gambar(await request.body())
    try:
        h = hg.proses_gambar(img)
    except hg.TidakAdaWajah:
        return JSONResponse({"wajah": False, "pesan": "Wajah tidak terlihat. Jika memakai helm kaca gelap, "
                                                     "buka kacanya untuk melihat proses pengukuran."})
    panel = []
    for (judul, im), ket in zip(hg.gambar_panel(h), PENJELASAN):
        panel.append({"judul": judul, "keterangan": ket, "gambar": ke_jpeg64(im)})
    hasil = ringkas(h)
    hasil["panel"] = panel
    return hasil


@app.get("/api/qr")
def qr(link: str = ""):
    import qrcode
    link = link or app.state.link_publik
    if not link:
        raise HTTPException(404, "Belum ada link publik")
    gambar = qrcode.make(link, border=2, box_size=10)
    buf = io.BytesIO()
    gambar.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")
