// Preset animasi Motion yang dipakai bersama
export const PEGAS = { type: "spring", stiffness: 380, damping: 30 };
export const URUT = { awal: {}, tampil: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
export const NAIK = {
  awal: { opacity: 0, y: 14 },
  tampil: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 28 } },
};
