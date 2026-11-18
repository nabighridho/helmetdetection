import { tahapan } from "./mesin";
// Fungsi bantu bersama

export const AMBANG_AWAL = { lebar: 1.2, tinggi: 0.4, tekstur: 0.06, dagu: 0.15, tinggi_dagu: 0.45 };

export function fmt(v, d = 2) {
  return Number(v).toFixed(d).replace(".", ",");
}

export function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

// Keputusan dari median beberapa pengukuran terakhir (sama dengan versi Python)
export function putuskan(f, a) {
  const ok = { lebar: f.lebar > a.lebar, tinggi: f.tinggi > a.tinggi, tekstur: f.tekstur < a.tekstur };
  const helm = ok.lebar && ok.tinggi && ok.tekstur;
  const alasan = helm
    ? "Ketiga syarat terpenuhi"
    : !ok.lebar
      ? "Kepala tidak lebih lebar dari wajah"
      : !ok.tinggi
        ? "Tidak ada penutup yang menjulang di atas dahi"
        : "Penutup kepala berlipat, bukan helm";
  return { helm, ok, alasan };
}

export async function kirimTahapan(blob) {
  try {
    return await tahapan(blob);
  } catch (e) {
    return { wajah: false, pesan: `Mesin Python belum siap: ${e.message}` };
  }
}

// Foto HP bisa 12 MP: perkecil dulu supaya cepat dikirim
export function kecilkan(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1280 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(res, "image/jpeg", 0.9);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => res(file);
    img.src = URL.createObjectURL(file);
  });
}
