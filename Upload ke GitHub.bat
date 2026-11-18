@echo off
title Upload Helmet Detection ke GitHub
cd /d "%~dp0"
echo.
echo   Mengunggah perubahan Helmet Detection ke https://github.com/nabighridho/helmetdetection ...
echo.
git add -A
git commit -m "Perbarui Helmet Detection"
git push -u origin main
echo.
echo   Selesai. Web diperbarui otomatis sekitar 2 menit lagi.
echo   Tutup jendela ini dan kembali ke Claude.
pause
