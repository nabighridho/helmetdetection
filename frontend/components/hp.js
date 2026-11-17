// Sambungan HP <-> laptop lewat WebRTC (PeerJS). Video HP dikirim langsung ke laptop.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function opsiPeer() {
  const host = process.env.NEXT_PUBLIC_PEER_HOST;      // hanya untuk pengujian; default: server PeerJS publik
  return host
    ? { host, port: Number(process.env.NEXT_PUBLIC_PEER_PORT || 9000), path: process.env.NEXT_PUBLIC_PEER_PATH || "/", secure: false }
    : {};
}

// Alamat yang dibuka HP saat memindai QR
export function linkHP(id) {
  const situs = (process.env.NEXT_PUBLIC_SITUS || `${location.origin}${BASE}`).replace(/\/$/, "");
  return `${situs}/?kamera=${id}`;
}

export function alamatLokal() {
  return /^(localhost|127\.|\[::1\])/.test(location.hostname) && !process.env.NEXT_PUBLIC_SITUS;
}

// Laptop: tunggu HP menelepon dengan video
export async function bukaPenerima({ onSiap, onVideo, onPutus, onGalat }) {
  const { default: Peer } = await import("peerjs");
  const id = "helmetdet-" + Math.random().toString(36).slice(2, 8);
  const peer = new Peer(id, opsiPeer());
  let conn = null, call = null;
  peer.on("open", () => onSiap(id));
  peer.on("disconnected", () => !peer.destroyed && peer.reconnect());
  peer.on("call", (c) => {
    call?.close();
    call = c;
    c.answer();
    c.on("stream", onVideo);
    c.on("close", onPutus);
    c.peerConnection?.addEventListener("connectionstatechange", () => {
      if (["failed", "disconnected", "closed"].includes(c.peerConnection.connectionState)) onPutus();
    });
  });
  peer.on("connection", (c) => { conn = c; });
  peer.on("error", (e) => onGalat(e));
  return {
    kirim: (data) => { if (conn?.open) conn.send(data); },
    tutup: () => { call?.close(); peer.destroy(); },
  };
}
