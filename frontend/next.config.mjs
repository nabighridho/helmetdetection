// Web statis (bisa dipublish di GitHub Pages). Python berjalan di browser lewat Pyodide.
// NEXT_PUBLIC_VERSI ditempel di alamat file Python & worker -> setiap publish, browser memuat kode terbaru
// (tidak memakai salinan lama dari cache).
const versi = (process.env.GITHUB_SHA || "").slice(0, 8) || String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_VERSI: versi },
};

export default nextConfig;
