"use client";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect } from "react";

// Modal: di laptop muncul di tengah, di HP berupa "sheet" dari bawah yang bisa diseret turun untuk menutup
export default function Modal({ buka, tutup, eyebrow, judul, lebar = false, children }) {
  const seret = useDragControls();
  useEffect(() => {
    if (!buka) return;
    const esc = (e) => e.key === "Escape" && tutup();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [buka, tutup]);

  return (
    <AnimatePresence>
      {buka && (
        <motion.div className="modal" key="modal"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          onClick={(e) => e.target === e.currentTarget && tutup()}>
          <motion.div className={`modal-isi ${lebar ? "lebar" : ""}`} role="dialog" aria-modal="true" aria-label={judul}
            initial={{ y: 60, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            drag="y" dragControls={seret} dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => (i.offset.y > 110 || i.velocity.y > 600) && tutup()}>
            <div className="pegangan" onPointerDown={(e) => seret.start(e)} aria-hidden="true"><span /></div>
            <div className="modal-kepala">
              <div>
                <p className="eyebrow">{eyebrow}</p>
                <h2 className="modal-judul">{judul}</h2>
              </div>
              <motion.button className="tutup" type="button" aria-label="Tutup" onClick={tutup}
                whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }}>✕</motion.button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
