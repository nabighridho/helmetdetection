"use client";
import { motion } from "motion/react";
import { NAIK, PEGAS, URUT } from "./gerak";
import { fmt } from "./util";

// Hasil lengkap 8 tahap (dipakai tombol "Lihat 8 tahap" dan tab Unggah foto)
export default function Tahapan({ hasil }) {
  if (!hasil) return null;
  if (hasil.memuat) {
    return (
      <div className="memuat">
        <div className="grid-tahap">
          {Array.from({ length: 8 }, (_, i) => (
            <motion.div key={i} className="tahap kerangka" animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.08 }} />
          ))}
        </div>
        <p className="memuat-teks"><span className="putar" />Menganalisis gambar…</p>
      </div>
    );
  }
  if (!hasil.wajah) return <motion.p className="pesan" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{hasil.pesan}</motion.p>;
  const ok = hasil.label === "PAKAI HELM";
  const f = hasil.fitur;
  return (
    <>
      <motion.div className={`hasil-kepala ${ok ? "ok" : "no"}`}
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={PEGAS}>
        <p className="hasil-label">{hasil.label}</p>
        <p className="hasil-angka">
          lebar {fmt(f.lebar)} · tinggi {fmt(f.tinggi)} · tekstur {fmt(f.tekstur, 3)}
        </p>
      </motion.div>
      <motion.div className="grid-tahap" variants={URUT} initial="awal" animate="tampil">
        {hasil.panel.map((p, i) => (
          <motion.figure className="tahap" key={p.judul} variants={NAIK} whileHover={{ y: -4 }}>
            <span className="tahap-no">{i + 1}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.gambar} alt={p.judul} />
            <figcaption className="tahap-teks">
              <p className="tahap-judul">{p.judul}</p>
              <p className="tahap-ket">{p.keterangan}</p>
            </figcaption>
          </motion.figure>
        ))}
      </motion.div>
    </>
  );
}
