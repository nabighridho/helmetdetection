"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import HelmLogo from "./HelmLogo";
import Meter from "./Meter";
import Tombol from "./Tombol";
import { NAIK, PEGAS, URUT } from "./gerak";
import { alamatLokal, bukaPenerima, linkHP } from "./hp";
import { analisis, pantauMesin, siapkanMesin } from "./mesin";
import { median, putuskan, tunggu } from "./util";

const SKALA = { lebar: [0, 2], tinggi: [0, 1], tekstur: [0, 0.15] };
const STATUS_AWAL = { kelas: "", teks: "Kamera belum aktif", sub: "Tekan “Mulai kamera”, lalu hadap ke kamera" };

// HP/tablet (layar sentuh): "Ganti kamera" = depan/belakang. Laptop: webcam lain atau kamera HP.
const layarSentuh = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export default function Kamera({ info, onLihatTahap, mintaHP }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const st = useRef({
    stream: null, jalan: false, riwayat: [], terakhir: null, gen: 0, hp: null, deviceId: null,
    wajahTerakhir: null, waktuWajah: 0, waktuGerak: 0, gerakLalu: null,
  });
  const infoRef = useRef(info);
  infoRef.current = info;

  const [aktif, setAktif] = useState(false);
  const [sumber, setSumber] = useState("lokal");          // "lokal" | "hp"
  const [hadap, setHadap] = useState("user");
  const [galat, setGalat] = useState("");
  const [status, setStatus] = useState(STATUS_AWAL);
  const [fitur, setFitur] = useState(null);
  const [latensi, setLatensi] = useState(null);
  const [mesin, setMesin] = useState({ tahap: "belum" });
  const [tungguHP, setTungguHP] = useState(null);         // { link, qr } saat menunggu HP
  const [sentuh, setSentuh] = useState(false);
  const [berikut, setBerikut] = useState("");             // nama kamera tujuan "Ganti kamera"

  useEffect(() => { setSentuh(layarSentuh()); return pantauMesin(setMesin); }, []);

  // ------------------------------------------------------------ kirim frame
  const frameJpeg = useCallback((lebar = 640, kualitas = 0.75) => {
    const v = videoRef.current;
    const c = document.createElement("canvas");
    c.width = lebar;
    c.height = Math.round((v.videoHeight * lebar) / v.videoWidth);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, "image/jpeg", kualitas));
  }, []);

  // ------------------------------------------------------------ keputusan
  const perbaruiKeputusan = useCallback((now) => {
    const s = st.current, inf = infoRef.current;
    s.riwayat = s.riwayat.filter((r) => now - r.t < 2000).slice(-7);
    if (!s.riwayat.length) {
      s.terakhir = null;
      setFitur(null);
      if (now - s.waktuGerak > inf.detik_diam * 1000) setStatus({ kelas: "", teks: "Tidak ada orang", sub: "Belum ada pengendara di depan kamera" });
      else if (now - s.waktuWajah > inf.detik_tertutup * 1000) setStatus({ kelas: "ok", teks: "PAKAI HELM", sub: "Wajah tertutup kaca helm gelap" });
      else setStatus({ kelas: "info", teks: "Mencari wajah…", sub: "Hadap ke kamera" });
      return;
    }
    const f = {
      lebar: median(s.riwayat.map((r) => r.lebar)),
      tinggi: median(s.riwayat.map((r) => r.tinggi)),
      tekstur: median(s.riwayat.map((r) => r.tekstur)),
    };
    const k = putuskan(f, inf.ambang);
    setFitur({ ...f, ok: k.ok });
    setStatus({ kelas: k.helm ? "ok" : "no", teks: k.helm ? "PAKAI HELM" : "PELANGGARAN", sub: k.alasan });
  }, []);

  // ------------------------------------------------------------ loop analisis (Python di browser)
  const loopAnalisis = useCallback(async () => {
    const s = st.current, gen = s.gen;
    try {
      await siapkanMesin();
    } catch (e) {
      setStatus({ kelas: "info", teks: "Mesin Python gagal dimuat", sub: "Periksa koneksi internet, lalu muat ulang halaman" });
      return;
    }
    while (s.jalan && s.gen === gen) {
      const v = videoRef.current;
      if (!v?.videoWidth) { await tunggu(120); continue; }
      try {
        const t0 = performance.now();
        const blob = await frameJpeg();
        const cadangan = s.wajahTerakhir && performance.now() - s.waktuWajah < 1000 ? s.wajahTerakhir : null;
        const j = await analisis(blob, cadangan);
        if (!s.jalan || s.gen !== gen) break;      // kamera sudah dimatikan saat menunggu hasil
        const t = performance.now();
        s.latensi = s.latensi == null ? t - t0 : s.latensi * 0.7 + (t - t0) * 0.3;
        setLatensi(Math.round(s.latensi));
        if (j.wajah) {
          // overlay hanya dari deteksi asli; kotak "cadangan" (posisi lama) tidak digambar
          if (!j.pakai_cadangan) { s.terakhir = { ...j, t }; s.wajahTerakhir = j.wajah_px; s.waktuWajah = t; }
          s.riwayat.push({ t, ...j.fitur });
        }
        perbaruiKeputusan(t);
      } catch {
        if (!s.jalan || s.gen !== gen) break;
        setStatus({ kelas: "info", teks: "Analisis gagal", sub: "Mencoba lagi…" });
        await tunggu(500);
      }
      await tunggu(30);
    }
  }, [frameJpeg, perbaruiKeputusan]);

  // ------------------------------------------------------------ deteksi gerakan (ada orang atau tidak)
  const loopGerak = useCallback(async () => {
    const s = st.current, gen = s.gen;
    const c = document.createElement("canvas");
    c.width = 160; c.height = 120;
    const g2 = c.getContext("2d", { willReadFrequently: true });
    while (s.jalan && s.gen === gen) {
      const v = videoRef.current;
      if (v?.videoWidth) {
        g2.drawImage(v, 0, 0, 160, 120);
        const d = g2.getImageData(0, 0, 160, 120).data;
        const g = new Uint8Array(160 * 120);
        for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
        if (s.gerakLalu) {
          let n = 0, total = 0;
          for (let y = 12; y < 120; y++) for (let x = 24; x < 136; x++) {
            const i = y * 160 + x; total++;
            if (Math.abs(g[i] - s.gerakLalu[i]) > 14) n++;
          }
          if (n / total > 0.002) s.waktuGerak = performance.now();
        }
        s.gerakLalu = g;
      }
      await tunggu(500);
    }
  }, []);

  // ------------------------------------------------------------ overlay di atas video
  const gambar = useCallback(() => {
    const s = st.current, o = overlayRef.current, v = videoRef.current;
    if (!o || !v) return;
    const ctx = o.getContext("2d");
    const r = o.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (o.width !== Math.round(r.width * dpr)) { o.width = Math.round(r.width * dpr); o.height = Math.round(r.height * dpr); }
    ctx.clearRect(0, 0, o.width, o.height);
    const vw = v.videoWidth, vh = v.videoHeight, h = s.terakhir;
    const umur = h ? performance.now() - h.t : Infinity;
    if (h && vw && umur < 700) {
      ctx.globalAlpha = umur < 350 ? 1 : 1 - (umur - 350) / 350;   // memudar kalau hasil sudah lama
      const sk = Math.max(o.width / vw, o.height / vh);            // object-fit: cover
      const ox = (o.width - vw * sk) / 2, oy = (o.height - vh * sk) / 2;
      const X = (nx) => ox + nx * vw * sk, Y = (ny) => oy + ny * vh * sk;
      ctx.lineWidth = 3 * dpr;
      const [fx, fy, fw, fh] = h.kotak_wajah;
      ctx.strokeStyle = "#3CE07A"; ctx.strokeRect(X(fx), Y(fy), fw * vw * sk, fh * vh * sk);
      const [kx1, ky, kx2] = h.garis_lebar;
      ctx.strokeStyle = "#FFE14D"; ctx.beginPath(); ctx.moveTo(X(kx1), Y(ky)); ctx.lineTo(X(kx2), Y(ky)); ctx.stroke();
      const [tx, ty1, ty2] = h.garis_tinggi;
      ctx.strokeStyle = "#E15BFF"; ctx.beginPath(); ctx.moveTo(X(tx), Y(ty1)); ctx.lineTo(X(tx), Y(ty2)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (s.jalan) requestAnimationFrame(gambar);
  }, []);

  // ------------------------------------------------------------ jalankan analisis untuk video yang sedang tampil
  const mulaiAnalisis = useCallback(() => {
    const s = st.current;
    s.riwayat = []; s.terakhir = null; s.wajahTerakhir = null; s.gerakLalu = null; s.latensi = null;
    s.waktuWajah = s.waktuGerak = performance.now();
    setAktif(true); setFitur(null); setLatensi(null);
    setStatus({ kelas: "info", teks: "Mencari wajah…", sub: "Hadap ke kamera" });
    if (!s.jalan) { s.jalan = true; s.gen += 1; loopAnalisis(); loopGerak(); requestAnimationFrame(gambar); }
  }, [loopAnalisis, loopGerak, gambar]);

  const hentikanAnalisis = useCallback(() => {
    const s = st.current;
    s.jalan = false;
    s.gen += 1;                                     // hentikan loop yang masih berjalan
    const o = overlayRef.current;
    o?.getContext("2d").clearRect(0, 0, o.width, o.height);
    s.terakhir = null;
    setAktif(false); setFitur(null); setLatensi(null);
  }, []);

  const lepasKameraLokal = () => {
    const s = st.current;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
  };

  const lepasHP = () => {
    const s = st.current;
    s.hp?.tutup();
    s.hp = null;
    setTungguHP(null);
  };

  // ------------------------------------------------------------ kamera di perangkat ini
  const mulaiLokal = useCallback(async ({ arah = "user", deviceId = null } = {}) => {
    setGalat("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setGalat("Kamera hanya bisa dibuka lewat https atau localhost. Buka web dari link GitHub Pages, atau pakai tab Unggah foto.");
      return;
    }
    const s = st.current;
    try {
      lepasHP();
      lepasKameraLokal();
      s.stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 960 }, height: { ideal: 720 } }
          : { facingMode: arah, width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      s.deviceId = s.stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId;
      const v = videoRef.current;
      v.srcObject = s.stream;
      await v.play();
      setSumber("lokal");
      setHadap(arah);
      mulaiAnalisis();
    } catch (e) {
      setGalat(e.name === "NotAllowedError"
        ? "Izin kamera ditolak. Izinkan kamera di pengaturan browser, lalu coba lagi."
        : `Kamera tidak bisa dibuka: ${e.message}`);
    }
  }, [mulaiAnalisis]);

  // ------------------------------------------------------------ kamera HP sebagai kamera laptop
  const pilihHP = useCallback(async () => {
    const s = st.current;
    setGalat("");
    hentikanAnalisis();
    lepasKameraLokal();
    if (videoRef.current) videoRef.current.srcObject = null;
    setSumber("hp");
    setStatus({ kelas: "info", teks: "Menunggu HP…", sub: "Pindai QR code dengan kamera HP" });
    if (s.hp) return;
    setGalat("");
    setTungguHP({ link: "", qr: "" });
    setTimeout(() => {   // server sambungan (PeerJS) tidak menjawab
      setTungguHP((t) => {
        if (t && !t.link) setGalat("Server sambungan HP belum menjawab. Pastikan laptop terhubung internet, lalu tekan Ganti kamera lagi.");
        return t;
      });
    }, 12000);
    try {
      s.hp = await bukaPenerima({
        onSiap: async (id) => {
          const link = linkHP(id);
          const qr = await QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#15171C", light: "#F4F1E8" } });
          setTungguHP({ link, qr });
        },
        onVideo: async (stream) => {
          const v = videoRef.current;
          v.srcObject = stream;
          try { await v.play(); } catch {}
          setTungguHP((t) => (t ? { ...t, tersambung: true } : t));
          mulaiAnalisis();
        },
        onPutus: () => {
          if (st.current.hp == null) return;
          hentikanAnalisis();
          if (videoRef.current) videoRef.current.srcObject = null;
          setTungguHP((t) => (t ? { ...t, tersambung: false } : t));
          setStatus({ kelas: "info", teks: "HP terputus", sub: "Pindai QR code lagi untuk menyambung" });
        },
        onGalat: (e) => {
          setGalat(`Sambungan HP bermasalah (${e.type || e.message}). Pastikan laptop terhubung internet, lalu coba lagi.`);
          if (["network", "server-error", "socket-error", "socket-closed", "unavailable-id"].includes(e.type)) {
            const h = st.current.hp;                 // buang sambungan rusak supaya bisa dicoba lagi
            st.current.hp = null;
            h?.tutup();
          }
        },
      });
    } catch (e) {
      setGalat(`Sambungan HP tidak bisa dibuat: ${e.message}`);
      setTungguHP(null);
    }
  }, [hentikanAnalisis, mulaiAnalisis]);

  // tombol "Hubungkan HP" di header
  useEffect(() => { if (mintaHP) pilihHP(); }, [mintaHP, pilihHP]);

  // kirim hasil ke HP supaya pengendara juga melihat label di HP-nya
  useEffect(() => { st.current.hp?.kirim({ status, fitur }); }, [status, fitur]);

  // daftar kamera untuk tombol "Ganti kamera" (laptop): webcam1, webcam2, ..., Kamera HP
  const daftarTujuan = useCallback(async () => {
    let cams = [];
    try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"); } catch {}
    return [...cams.map((d, i) => ({ jenis: "lokal", deviceId: d.deviceId, nama: d.label || `Webcam ${i + 1}` })),
      { jenis: "hp", nama: "Kamera HP" }];
  }, []);

  const tujuanBerikut = useCallback(async () => {
    const d = await daftarTujuan();
    const s = st.current;
    const i = sumber === "hp" ? d.length - 1 : Math.max(0, d.findIndex((x) => x.deviceId && x.deviceId === s.deviceId));
    return d[(i + 1) % d.length];
  }, [daftarTujuan, sumber]);

  useEffect(() => {
    if (sentuh) { setBerikut(hadap === "user" ? "kamera belakang" : "kamera depan"); return; }
    tujuanBerikut().then((t) => setBerikut(t.jenis === "hp" ? "Kamera HP" : "Webcam")).catch(() => {});
  }, [sentuh, hadap, sumber, aktif, tujuanBerikut]);

  async function gantiKamera() {
    if (sentuh) return mulaiLokal({ arah: hadap === "user" ? "environment" : "user" });
    const t = await tujuanBerikut();
    if (t.jenis === "hp") return pilihHP();
    return mulaiLokal({ deviceId: t.deviceId });
  }

  function matikan() {
    hentikanAnalisis();
    lepasKameraLokal();
    lepasHP();
    if (videoRef.current) videoRef.current.srcObject = null;
    setSumber("lokal");
    st.current.riwayat = []; st.current.wajahTerakhir = null;
    setStatus({ kelas: "", teks: "Kamera mati", sub: "Tekan “Mulai kamera” untuk memeriksa lagi" });
  }

  useEffect(() => () => {   // bersihkan saat halaman ditutup
    const s = st.current;
    s.jalan = false;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.hp?.tutup();
  }, []);

  async function lihatTahap() {
    onLihatTahap(await frameJpeg(640, 0.9));
  }

  const cermin = aktif && sumber === "lokal" && hadap === "user" ? "cermin" : "";
  const menyala = aktif || sumber === "hp";
  const a = info.ambang;
  const jumlahLolos = fitur ? Object.values(fitur.ok).filter(Boolean).length : null;
  const memuatMesin = mesin.tahap === "memuat";
  return (
    <div className="tata">
      <div className="kiri">
        <div className="layar">
          <video ref={videoRef} className={cermin} playsInline muted autoPlay />
          <canvas ref={overlayRef} id="overlay" className={cermin} />

          {/* garis pindai saat mencari wajah */}
          <AnimatePresence>
            {aktif && status.kelas === "info" && (
              <motion.div className="pindai" key="pindai"
                initial={{ opacity: 0 }} animate={{ opacity: 1, top: ["8%", "92%", "8%"] }} exit={{ opacity: 0 }}
                transition={{ top: { duration: 2.6, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.3 } }} />
            )}
          </AnimatePresence>

          {menyala && (
            <motion.div layout className={`status-bar ${status.kelas}`} transition={PEGAS}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p key={status.teks} className="status-teks"
                  initial={{ y: 18, opacity: 0, filter: "blur(6px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: -18, opacity: 0, filter: "blur(6px)" }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}>
                  {status.teks}
                </motion.p>
              </AnimatePresence>
              <motion.p key={status.sub} className="status-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {aktif && memuatMesin ? `${mesin.teks} (${mesin.persen}%)` : status.sub}
              </motion.p>
            </motion.div>
          )}

          {aktif && (
            <div className="info-bawah">
              <span className="chip-langsung"><span className="denyut" />{sumber === "hp" ? "KAMERA HP" : "LANGSUNG"}</span>
              {latensi != null && (
                <span className="latensi" title="Waktu dari pengambilan gambar sampai hasil analisis kembali">
                  analisis ≈ {latensi} ms
                </span>
              )}
            </div>
          )}

          {/* menunggu HP: QR code */}
          <AnimatePresence>
            {sumber === "hp" && tungguHP && !aktif && (
              <motion.div className="sambut tunggu-hp" key="qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="sambut-isi" variants={URUT} initial="awal" animate="tampil">
                  <motion.p variants={NAIK} className="eyebrow">Kamera HP</motion.p>
                  <motion.p variants={NAIK} className="sambut-judul">Pindai dengan HP</motion.p>
                  <motion.div variants={NAIK} className="qr-kotak kecil">
                    {tungguHP.qr
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={tungguHP.qr} alt={`QR code menuju ${tungguHP.link}`} />
                      : <span className="putar" />}
                  </motion.div>
                  <motion.p variants={NAIK} className="sambut-teks">
                    Buka kamera HP, arahkan ke QR, lalu ketuk <b>Mulai kirim</b>. Video HP tampil dan dianalisis di layar ini.
                  </motion.p>
                  {tungguHP.link && alamatLokal() && (
                    <motion.p variants={NAIK} className="sambut-galat">
                      Web ini dibuka dari localhost, jadi HP tidak bisa membukanya. Buka web dari link GitHub Pages agar QR bisa dipakai.
                    </motion.p>
                  )}
                  {galat && <motion.p variants={NAIK} className="sambut-galat">{galat}</motion.p>}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!menyala && (
              <motion.div className="sambut" key="sambut" exit={{ opacity: 0, scale: 1.03 }} transition={{ duration: 0.35 }}>
                <motion.div className="sambut-isi" variants={URUT} initial="awal" animate="tampil">
                  <motion.div variants={NAIK} className="sambut-cincin">
                    <motion.span className="cincin" animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
                    <HelmLogo className="sambut-helm" animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
                  </motion.div>
                  <motion.p variants={NAIK} className="sambut-judul">Siap memeriksa helm</motion.p>
                  <motion.p variants={NAIK} className="sambut-teks">
                    Wajah menghadap kamera. Untuk helm kaca gelap, kaca boleh ditutup.
                  </motion.p>
                  <motion.div variants={NAIK} className="sambut-tombol">
                    <Tombol utama onClick={() => mulaiLokal({ arah: hadap })}>Mulai kamera</Tombol>
                    {!sentuh && <Tombol onClick={pilihHP}>Pakai kamera HP</Tombol>}
                  </motion.div>
                  {galat && <motion.p variants={NAIK} className="sambut-galat">{galat}</motion.p>}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="kendali">
          {menyala ? (
            <Tombol className="tombol-mati" onClick={matikan}>
              <span className="ikon-daya" aria-hidden="true" />{sumber === "hp" ? "Putuskan HP" : "Matikan kamera"}
            </Tombol>
          ) : (
            <Tombol onClick={() => mulaiLokal({ arah: hadap })}>
              <span className="ikon-kamera" aria-hidden="true" />Mulai kamera
            </Tombol>
          )}
          <Tombol disabled={sentuh && !aktif} onClick={gantiKamera} title={berikut ? `Pindah ke ${berikut}` : undefined}>
            <span className="ikon-putar" aria-hidden="true">⟲</span>
            <span className="tombol-dua">Ganti kamera{berikut && <small>ke {berikut}</small>}</span>
          </Tombol>
          <Tombol utama disabled={!aktif} onClick={lihatTahap}>Lihat 8 tahap</Tombol>
        </div>
      </div>

      <motion.aside className="kanan" variants={URUT} initial="awal" animate="tampil">
        <motion.div variants={NAIK} className="kanan-kepala">
          <h2 className="judul-kecil">Tiga syarat helm</h2>
          <AnimatePresence mode="popLayout">
            {jumlahLolos != null && (
              <motion.span key={jumlahLolos} className={`skor ${jumlahLolos === 3 ? "ok" : "no"}`}
                initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
                transition={PEGAS}>
                {jumlahLolos}/3 terpenuhi
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
        <motion.div variants={NAIK}>
          <Meter no={1} nama="Lebar kepala ÷ wajah" ket="Helm lebih lebar dari wajah" nilai={fitur?.lebar}
            ambang={a.lebar} skala={SKALA.lebar} lolos={fitur?.ok.lebar} />
        </motion.div>
        <motion.div variants={NAIK}>
          <Meter no={2} nama="Tinggi di atas wajah" ket="Helm menjulang di atas dahi" nilai={fitur?.tinggi}
            ambang={a.tinggi} skala={SKALA.tinggi} lolos={fitur?.ok.tinggi} />
        </motion.div>
        <motion.div variants={NAIK}>
          <Meter no={3} nama="Tekstur penutup kepala" ket="Helm mulus, kain berlipat" nilai={fitur?.tekstur}
            ambang={a.tekstur} skala={SKALA.tekstur} lolos={fitur?.ok.tekstur} desimal={3} tandaAmbang="<" />
        </motion.div>
        <motion.div variants={NAIK} className="kartu-ide">
          <p className="ide-judul">Cara kerja</p>
          <p className="ide-teks">
            Helm membuat kepala <b>lebih lebar</b>, <b>lebih tinggi</b>, dan <b>lebih mulus</b> daripada wajah.
            Ketiganya terpenuhi berarti pakai helm.
          </p>
          <p className="ide-legenda">
            <span><i className="titik hijau" />wajah</span>
            <span><i className="titik kuning" />lebar kepala</span>
            <span><i className="titik ungu" />tinggi</span>
          </p>
        </motion.div>
      </motion.aside>
    </div>
  );
}
