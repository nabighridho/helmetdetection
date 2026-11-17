"use client";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import HelmLogo from "./HelmLogo";
import Kamera from "./Kamera";
import Modal from "./Modal";
import Tahapan from "./Tahapan";
import Tombol from "./Tombol";
import Unggah from "./Unggah";
import { pantauMesin, siapkanMesin } from "./mesin";
import { AMBANG_AWAL, kirimTahapan } from "./util";

const INFO_AWAL = { ambang: AMBANG_AWAL, detik_tertutup: 1.5, detik_diam: 3 };

function Logo() {
  return (
    <HelmLogo className="logo"
      initial={{ x: -24, rotate: -12, opacity: 0 }} animate={{ x: 0, rotate: 0, opacity: 1 }}
      whileHover={{ rotate: [0, -8, 6, 0], transition: { duration: 0.5 } }}
      transition={{ type: "spring", stiffness: 240, damping: 15 }} />
  );
}

// Penanda kecil: mesin Python di browser sedang dimuat / siap
function ChipMesin({ mesin }) {
  const teks = mesin.tahap === "siap" ? mesin.info?.versi || "Python siap"
    : mesin.tahap === "gagal" ? "Python gagal dimuat"
      : `Memuat Python… ${mesin.persen || 0}%`;
  return (
    <motion.span layout className={`chip-mesin ${mesin.tahap}`} title={mesin.tahap === "gagal" ? mesin.teks : "Analisis berjalan di browser ini"}>
      <span className="chip-titik" />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={mesin.tahap} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          {teks}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

export default function HelmetDetection() {
  const [info, setInfo] = useState(INFO_AWAL);
  const [mesin, setMesin] = useState({ tahap: "belum" });
  const [tab, setTab] = useState("kamera");
  const [tahap, setTahap] = useState(null);       // hasil 8 tahap di modal
  const [mintaHP, setMintaHP] = useState(0);

  useEffect(() => {
    siapkanMesin().then(setInfo).catch(() => {});   // mulai memuat Python sejak halaman dibuka
    return pantauMesin(setMesin);
  }, []);

  const lihatTahap = useCallback(async (blob) => {
    setTahap({ memuat: true });
    setTahap(await kirimTahapan(blob));
  }, []);

  function hubungkanHP() {
    setTab("kamera");
    setMintaHP((n) => n + 1);
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="marka" aria-hidden="true"
        animate={{ backgroundPositionX: ["0px", "104px"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
      <header className="atas">
        <div className="merek">
          <Logo />
          <div>
            <h1>Helmet Detection</h1>
            <p className="tagline">Pengolahan Citra Digital · Kelompok 3</p>
          </div>
        </div>
        <div className="atas-kanan">
          <ChipMesin mesin={mesin} />
          <Tombol id="btnHubung" onClick={hubungkanHP}>
            <span className="ikon-hp" aria-hidden="true" />Hubungkan HP
          </Tombol>
        </div>
      </header>

      <nav className="tab" role="tablist">
        {[["kamera", "Kamera langsung"], ["unggah", "Unggah foto"]].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? "aktif" : ""}`} role="tab"
            aria-selected={tab === id} type="button" onClick={() => setTab(id)}>
            {tab === id && (
              <motion.span layoutId="tab-pil" className="tab-pil"
                transition={{ type: "spring", stiffness: 420, damping: 34 }} />
            )}
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </nav>

      <main>
        {/* Kamera tetap terpasang saat pindah tab supaya stream tidak putus */}
        {[["kamera", <Kamera key="k" info={info} onLihatTahap={lihatTahap} mintaHP={mintaHP} />], ["unggah", <Unggah key="u" />]].map(([id, isi]) => (
          <motion.section key={id} className="panel" initial={false}
            style={{ display: tab === id ? "block" : "none" }}
            animate={tab === id ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}>
            {isi}
          </motion.section>
        ))}
      </main>

      <footer className="bawah">
        <p>Bab 2 · 3 · 9 · 10 Gonzalez &amp; Woods — Python + OpenCV (berjalan di browser lewat Pyodide) · Next.js</p>
      </footer>

      <Modal buka={!!tahap} tutup={() => setTahap(null)} eyebrow="Proses lengkap" judul="8 tahap" lebar>
        <Tahapan hasil={tahap} />
      </Modal>
    </MotionConfig>
  );
}
