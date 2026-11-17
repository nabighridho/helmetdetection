"use client";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";
import { fmt } from "./util";

// Angka yang bergulir halus ke nilai baru
function Angka({ nilai, desimal }) {
  const mv = useMotionValue(nilai ?? 0);
  const teks = useTransform(mv, (v) => fmt(v, desimal));
  useEffect(() => {
    if (nilai == null) return;
    const c = animate(mv, nilai, { type: "spring", stiffness: 140, damping: 22 });
    return () => c.stop();
  }, [nilai, mv]);
  return nilai == null ? "–" : <motion.span>{teks}</motion.span>;
}

// Indikator satu syarat helm: nilai, batang, dan garis ambang
export default function Meter({ no, nama, ket, nilai, ambang, skala, lolos, desimal = 2, tandaAmbang = ">" }) {
  const [lo, hi] = skala;
  const persen = (v) => `${Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100}%`;
  const kelas = nilai == null ? "" : lolos ? "lolos" : "gagal";
  return (
    <div className={`meter ${kelas}`}>
      <div className="meter-atas">
        <p className="meter-nama"><span className="meter-no">{no}</span>{nama}</p>
        <p className="meter-nilai"><Angka nilai={nilai} desimal={desimal} /></p>
      </div>
      <div className="batang">
        <motion.div className="isi" initial={false}
          animate={{ width: nilai == null ? "0%" : persen(nilai) }}
          transition={{ type: "spring", stiffness: 160, damping: 24 }} />
        <div className="ambang" style={{ left: persen(ambang) }} />
      </div>
      <p className="meter-ket">
        <span>{ket}</span>
        <span className="meter-syarat">syarat {tandaAmbang} {fmt(ambang, desimal)}</span>
      </p>
    </div>
  );
}
