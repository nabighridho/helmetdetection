"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import HelmLogo from "./HelmLogo";
import Tombol from "./Tombol";
import { opsiPeer } from "./hp";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Dibuka HP dari QR laptop (?kamera=ID): HP hanya mengirim video, analisis berjalan di laptop
export default function PengirimHP({ idLaptop }) {
  const videoRef = useRef(null);
  const r = useRef({ peer: null, call: null, stream: null });
  const [keadaan, setKeadaan] = useState("siap");      // siap | menyambung | terkirim | putus
  const [pesan, setPesan] = useState("");
  const [hadap, setHadap] = useState("environment");
  const [hasil, setHasil] = useState(null);             // status yang dikirim balik oleh laptop

  async function ambilKamera(arah) {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: arah, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false,
    });
  }

  async function mulai() {
    setPesan("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setPesan("Kamera hanya bisa dibuka lewat https. Pindai QR dari laptop yang membuka link GitHub Pages.");
      return;
    }
    try {
      setKeadaan("menyambung");
      const stream = await ambilKamera(hadap);
      r.current.stream = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
      const { default: Peer } = await import("peerjs");
      const peer = new Peer(opsiPeer());
      r.current.peer = peer;
      peer.on("open", () => {
        const call = peer.call(idLaptop, stream);
        r.current.call = call;
        call.on("close", () => setKeadaan("putus"));
        call.peerConnection?.addEventListener("connectionstatechange", () => {
          const s = call.peerConnection.connectionState;
          if (s === "connected") setKeadaan("terkirim");
          if (s === "failed" || s === "disconnected") setKeadaan("putus");
        });
        const conn = peer.connect(idLaptop);
        conn.on("data", (d) => setHasil(d));
      });
      peer.on("error", (e) => {
        setKeadaan("putus");
        setPesan(e.type === "peer-unavailable"
          ? "Laptop tidak ditemukan. Pastikan web di laptop masih terbuka, lalu pindai QR lagi."
          : `Sambungan gagal (${e.type || e.message}).`);
      });
    } catch (e) {
      setKeadaan("siap");
      setPesan(e.name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan kamera, lalu coba lagi." : `Kamera tidak bisa dibuka: ${e.message}`);
    }
  }

  async function gantiKamera() {
    const arah = hadap === "user" ? "environment" : "user";
    try {
      const baru = await ambilKamera(arah);
      const trek = baru.getVideoTracks()[0];
      const pengirim = r.current.call?.peerConnection?.getSenders().find((s) => s.track?.kind === "video");
      await pengirim?.replaceTrack(trek);
      r.current.stream?.getTracks().forEach((t) => t.stop());
      r.current.stream = baru;
      videoRef.current.srcObject = baru;
      setHadap(arah);
    } catch (e) {
      setPesan(`Tidak bisa ganti kamera: ${e.message}`);
    }
  }

  function berhenti() {
    r.current.call?.close();
    r.current.peer?.destroy();
    r.current.stream?.getTracks().forEach((t) => t.stop());
    r.current = { peer: null, call: null, stream: null };
    if (videoRef.current) videoRef.current.srcObject = null;
    setKeadaan("siap"); setHasil(null);
  }

  useEffect(() => () => berhenti(), []);   // eslint-disable-line react-hooks/exhaustive-deps

  const st = hasil?.status;
  const jalan = keadaan === "menyambung" || keadaan === "terkirim";
  return (
    <div className="pengirim">
      <header className="atas">
        <div className="merek">
          <HelmLogo className="logo" />
          <div>
            <h1>Helmet Detection</h1>
            <p className="tagline">Mode kamera HP · video dikirim ke laptop</p>
          </div>
        </div>
      </header>
      <main>
        <div className="layar">
          <video ref={videoRef} className={hadap === "user" ? "cermin" : ""} playsInline muted autoPlay />
          <AnimatePresence>
            {jalan && (
              <motion.div className={`status-bar ${st?.kelas || "info"}`} key="st"
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="status-teks">{st?.teks || (keadaan === "terkirim" ? "Tersambung" : "Menyambung…")}</p>
                <p className="status-sub">{st?.sub || "Hasil analisis dari laptop akan tampil di sini"}</p>
              </motion.div>
            )}
          </AnimatePresence>
          {keadaan === "terkirim" && (
            <div className="info-bawah"><span className="chip-langsung"><span className="denyut" />TERKIRIM KE LAPTOP</span></div>
          )}
          {!jalan && (
            <div className="sambut">
              <div className="sambut-isi">
                <div className="sambut-cincin">
                  <motion.span className="cincin" animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
                  <HelmLogo className="sambut-helm" />
                </div>
                <p className="sambut-judul">{keadaan === "putus" ? "Sambungan terputus" : "Jadikan HP kamera laptop"}</p>
                <p className="sambut-teks">
                  Video dari HP ini tampil dan dianalisis di layar laptop. Arahkan kamera ke wajah pengendara.
                </p>
                <Tombol utama onClick={mulai}>{keadaan === "putus" ? "Sambung lagi" : "Mulai kirim"}</Tombol>
                {pesan && <p className="sambut-galat">{pesan}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="kendali">
          <Tombol className="tombol-mati" disabled={!jalan} onClick={berhenti}>
            <span className="ikon-daya" aria-hidden="true" />Berhenti
          </Tombol>
          <Tombol disabled={!jalan} onClick={gantiKamera}>
            <span className="ikon-putar" aria-hidden="true">⟲</span>Ganti kamera
          </Tombol>
        </div>
        <p className="catatan-hp">
          Ingin memeriksa langsung di HP ini saja? <a href={`${BASE}/`}>Buka Helmet Detection biasa</a>
        </p>
      </main>
    </div>
  );
}
