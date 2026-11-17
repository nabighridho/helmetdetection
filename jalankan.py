"""Menjalankan Helmet Detection di laptop sendiri (tanpa GitHub).

Web-nya statis: Python + OpenCV berjalan di browser lewat Pyodide, jadi tidak perlu server Python.
Program ini hanya: memasang paket Next.js (sekali), membangun web ke folder frontend/out,
lalu menyajikannya di http://localhost:3000 dan membuka browser.

Catatan: butuh internet saat halaman dibuka (Pyodide + OpenCV diunduh dari CDN, lalu disimpan cache browser).
Untuk HP, pakai link GitHub Pages (lihat README.md)."""
import argparse
import functools
import http.server
import os
import shutil
import socket
import subprocess
import sys
import webbrowser

AKAR = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(AKAR, "frontend")
OUT = os.path.join(FRONTEND, "out")


def info(t):
    print(f"  {t}", flush=True)


def cari_npm():
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        sys.exit("  Node.js belum terpasang. Unduh versi LTS dari https://nodejs.org lalu jalankan lagi.")
    return npm


def waktu_terbaru(*folder):
    t = 0
    for f in folder:
        for akar, dirs, files in os.walk(os.path.join(FRONTEND, f)):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".next", "out")]
            for n in files:
                t = max(t, os.path.getmtime(os.path.join(akar, n)))
    for n in ("next.config.mjs", "package.json"):
        t = max(t, os.path.getmtime(os.path.join(FRONTEND, n)))
    return t


def siapkan(npm, paksa):
    kunci = os.path.join(FRONTEND, "node_modules", ".package-lock.json")
    if not os.path.exists(kunci) or os.path.getmtime(os.path.join(FRONTEND, "package.json")) > os.path.getmtime(kunci):
        info("Memasang paket Next.js (sekali saja, butuh internet)...")
        subprocess.run([npm, "install"], cwd=FRONTEND, check=True)
    tanda = os.path.join(OUT, "index.html")
    if paksa or not os.path.exists(tanda) or waktu_terbaru("app", "components", "public") > os.path.getmtime(tanda):
        info("Membangun web (sekitar 1 menit)...")
        env = {k: v for k, v in os.environ.items() if not k.startswith("NEXT_PUBLIC_")}
        subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True, env=env)


def port_kosong(mulai):
    for p in range(mulai, mulai + 50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    raise RuntimeError("Tidak ada port kosong")


class Penyaji(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
                      ".py": "text/plain; charset=utf-8", ".xml": "application/xml"}

    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser(description="Jalankan Helmet Detection di laptop")
    ap.add_argument("--build", action="store_true", help="paksa bangun ulang web")
    a = ap.parse_args()
    print("\n  HELMET DETECTION\n")
    siapkan(cari_npm(), a.build)
    port = port_kosong(3000)
    url = f"http://localhost:{port}"
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Penyaji, directory=OUT))
    print()
    info(f"Web berjalan di  {url}")
    info("Pertama kali membuka, browser mengunduh Python + OpenCV (butuh internet, sekali saja).")
    info("Untuk memakai kamera HP, buka web dari link GitHub Pages (lihat README.md).")
    info("Tutup jendela ini (atau tekan Ctrl+C) untuk berhenti.\n")
    webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
