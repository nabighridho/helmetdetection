"""Helmet Detection - API Python (FastAPI), hanya untuk PENGUJIAN.
Versi utama berjalan di browser (Pyodide) memakai helmet_web.py yang sama persis."""
import json
import os
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import helmet_web as hw  # noqa: E402

app = FastAPI(title="Helmet Detection API (uji)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/info")
def info():
    return json.loads(hw.info())


@app.post("/api/reset")
def reset():
    hw.reset()
    return {"ok": True}


@app.post("/api/analisis")
async def analisis(request: Request, fx: int = -1, fy: int = -1, fw: int = -1, fh: int = -1,
                   t: float | None = None, gerak: int = 1):
    cadangan = (fx, fy, fw, fh) if min(fx, fy, fw, fh) >= 0 else None
    return json.loads(hw.analisis(await request.body(), cadangan, t, bool(gerak)))


@app.post("/api/tahapan")
async def tahapan(request: Request):
    return json.loads(hw.tahapan(await request.body()))
