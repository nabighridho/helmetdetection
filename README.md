# Helmet Detection

Deteksi pelanggaran helm pada pengendara motor. Pengolahan Citra Digital, Kelompok 3.

Web ini **statis**. Kode Python + OpenCV (`helmet_detection.py`) dijalankan **langsung di browser** lewat
[Pyodide](https://pyodide.org), jadi tidak butuh server Python dan bisa dipublish gratis di **GitHub Pages**.
Bisa dibuka di laptop maupun HP (iPhone dan Android).

```
HelmetDetection/
  frontend/                 tampilan web (Next.js)
    public/py/              kode Python yang dijalankan di browser
      helmet_detection.py   otak deteksi (sama dengan versi terminal)
      helmet_web.py         penghubung web <-> Python
    public/mesin.js         Web Worker yang memuat Pyodide + OpenCV
  backend/                  versi server (FastAPI), hanya untuk pengujian
  publish.yml               alur publish otomatis ke GitHub Pages (taruh di .github/workflows/)
  jalankan.py               menjalankan web di laptop tanpa GitHub
```

## Publish ke GitHub Pages (sekali saja)

1. Buat repository baru di GitHub, `helmetdetection` (Public), yaitu https://github.com/nabighridho/helmetdetection.
2. Unggah **isi** folder `HelmetDetection` ke repository itu (GitHub Desktop, `git push`, atau
   *Add file → Upload files*). Folder `node_modules`, `.next`, `out`, dan `_versi_lama_html` tidak perlu diunggah.
3. Pasang alur publish: di repository klik **Add file → Create new file**, isi nama file
   `.github/workflows/publish.yml`, lalu tempelkan seluruh isi file `publish.yml` dari folder ini. Klik **Commit changes**.
4. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Buka tab **Actions**, jalankan ulang "Publish ke GitHub Pages" bila perlu, tunggu selesai (±2 menit).
6. Web bisa dibuka di https://nabighridho.github.io/helmetdetection/.

Setiap kali ada perubahan yang di-push ke branch `main`, web diperbarui otomatis.

## Memakai

| Di mana | Cara |
| --- | --- |
| Laptop | Buka link GitHub Pages, tekan **Mulai kamera** (webcam laptop) |
| HP saja | Buka link yang sama di HP, tekan **Mulai kamera**. Analisis berjalan di HP itu sendiri |
| HP jadi kamera laptop | Di laptop tekan **Ganti kamera** sampai "Kamera HP" (atau **Hubungkan HP**), pindai QR dengan HP, ketuk **Mulai kirim**. Video HP tampil dan dianalisis di layar laptop, hasilnya juga muncul di HP |

- Pertama kali membuka, browser mengunduh Python + OpenCV (±30 MB, butuh internet). Berikutnya lebih cepat karena tersimpan di cache.
- Penanda di kanan atas menunjukkan status mesin: "Memuat Python…" lalu "Python 3.x · OpenCV 4.x".
- Sambungan HP ke laptop memakai WebRTC (PeerJS). Paling lancar bila laptop dan HP di **Wi-Fi atau hotspot yang sama**.

## Menjalankan di laptop tanpa GitHub

Butuh Python 3 dan Node.js 20.9+ (https://nodejs.org). Klik dua kali **Jalankan Helmet Detection.bat**
(atau `python jalankan.py`). Web terbuka di `http://localhost:3000`. Tetap butuh internet untuk mengunduh Python + OpenCV.
Fitur kamera HP butuh link GitHub Pages, karena HP tidak bisa membuka `localhost` laptop.

## Fitur

| Fitur | Keterangan |
| --- | --- |
| Kamera langsung | Kotak wajah (hijau), lebar kepala (kuning), tinggi di atas wajah (ungu), status besar beserta alasannya |
| Tiga syarat helm | Indikator lebar, tinggi, dan tekstur beserta garis ambangnya |
| Lihat 8 tahap | Proses lengkap dari citra asli sampai keputusan, dengan keterangan bab |
| Unggah foto | Pilih, seret, atau potret langsung di HP |
| Ganti kamera | Laptop: webcam ↔ kamera HP. HP: kamera depan ↔ belakang |
| Matikan kamera | Menghentikan kamera dan analisis |

## Agar hasil stabil

Metode utama tetap Bab 2, 3, 9, 10. Bagian pendukung berikut dipakai supaya program tidak mudah salah:

| Bagian | Fungsi |
| --- | --- |
| Detektor wajah berlapis (pendukung) | Wajah depan → model wajah depan kedua (`alt2`) → wajah dari samping |
| Pemeriksa helm tanpa wajah (Bab 10, transformasi Hough) | Saat wajah tertutup kaca gelap, cari lingkaran besar (cangkang helm) yang permukaannya mulus |
| Penstabil keputusan | Median 2 detik, histeresis, dan jeda 0,6 detik sebelum label berganti; nilai dekat ambang ditandai "kurang yakin" |
| Ingatan kaca ditutup | Wajah hilang ≤ 5 detik setelah terdeteksi helm tetap dianggap PAKAI HELM |
| GrabCut deterministik | Seed acak k-means dikunci dan elips awal kepala diperbesar, sehingga gambar yang sama selalu memberi hasil yang sama |

Jika wajah tidak terlihat dan bentuk helm tidak ditemukan, status menjadi "Wajah tidak terlihat"
(tidak lagi otomatis dianggap pakai helm).

## Bab yang dipakai (Gonzalez & Woods)

| Bab | Metode |
| --- | --- |
| 2 | Resize, konversi grayscale |
| 3 | CLAHE (ekualisasi histogram lokal) |
| 9 | Opening, closing, komponen terhubung |
| 10 | Segmentasi region (GrabCut), deteksi tepi Canny untuk tekstur |
