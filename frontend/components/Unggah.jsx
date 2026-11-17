"use client";
import { motion } from "motion/react";
import { useState } from "react";
import Tahapan from "./Tahapan";
import { kecilkan, kirimTahapan } from "./util";

export default function Unggah() {
  const [hasil, setHasil] = useState(null);
  const [seret, setSeret] = useState(false);

  async function proses(file) {
    if (!file || !file.type.startsWith("image/")) return;
    setHasil({ memuat: true });
    setHasil(await kirimTahapan(await kecilkan(file)));
  }

  return (
    <>
      <motion.label className={`unggah ${seret ? "seret" : ""}`}
        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
        onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
        onDragLeave={() => setSeret(false)}
        onDrop={(e) => { e.preventDefault(); setSeret(false); proses(e.dataTransfer.files?.[0]); }}>
        <input type="file" accept="image/*" onChange={(e) => { proses(e.target.files?.[0]); e.target.value = ""; }} />
        <motion.span className="unggah-ikon" aria-hidden="true" animate={{ y: seret ? -6 : 0, rotate: seret ? 90 : 0 }}>＋</motion.span>
        <span className="unggah-judul">{seret ? "Lepaskan foto di sini" : "Pilih, seret, atau ambil foto"}</span>
        <span className="unggah-teks">Satu pengendara, wajah menghadap kamera. Di HP bisa langsung memotret.</span>
      </motion.label>
      <div id="hasilUnggah">
        <Tahapan hasil={hasil} />
      </div>
    </>
  );
}
