// Penghubung ke mesin Python. Default: Python berjalan di browser (Web Worker + Pyodide).
// Untuk pengujian bisa diarahkan ke server FastAPI lewat NEXT_PUBLIC_MESIN_URL.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const PYODIDE = process.env.NEXT_PUBLIC_PYODIDE_URL || "https://cdn.jsdelivr.net/pyodide/v314.0.8/full/";
const SERVER = process.env.NEXT_PUBLIC_MESIN_URL || "";

let worker = null, siapP = null, nomor = 0;
const antre = new Map();
const pendengar = new Set();
let keadaan = { tahap: "belum", teks: "", persen: 0, info: null };

function ubah(baru) {
  keadaan = { ...keadaan, ...baru };
  pendengar.forEach((f) => f(keadaan));
}

export function pantauMesin(f) {
  pendengar.add(f);
  f(keadaan);
  return () => pendengar.delete(f);
}

export function siapkanMesin() {
  if (siapP) return siapP;
  if (SERVER) {
    siapP = fetch(SERVER + "/api/info").then((r) => r.json()).then((info) => {
      info.versi = "server Python (mode uji)";
      ubah({ tahap: "siap", info, persen: 100 });
      return info;
    });
    return siapP;
  }
  siapP = new Promise((res, rej) => {
    worker = new Worker(`${BASE}/mesin.js`, { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.jenis === "progres") ubah({ tahap: "memuat", teks: m.teks, persen: m.persen });
      else if (m.jenis === "siap") { ubah({ tahap: "siap", info: m.info, persen: 100 }); res(m.info); }
      else if (m.jenis === "gagal") { ubah({ tahap: "gagal", teks: m.pesan }); rej(new Error(m.pesan)); }
      else if (m.jenis === "hasil") {
        const t = antre.get(m.id);
        antre.delete(m.id);
        if (!t) return;
        if (m.galat) t.rej(new Error(m.galat)); else t.res(m.hasil);
      }
    };
    worker.onerror = (e) => { ubah({ tahap: "gagal", teks: e.message || "Mesin gagal dimuat" }); rej(e); };
    ubah({ tahap: "memuat", teks: "Menyiapkan mesin…", persen: 3 });
    worker.postMessage({ jenis: "mulai", pyodide: PYODIDE, base: `${location.origin}${BASE}/` });
  });
  return siapP;
}

async function kirim(jenis, blob, cadangan) {
  await siapkanMesin();
  if (SERVER) {
    let url = `${SERVER}/api/${jenis}`;
    if (cadangan) url += `?fx=${cadangan[0]}&fy=${cadangan[1]}&fw=${cadangan[2]}&fh=${cadangan[3]}`;
    return (await fetch(url, { method: "POST", body: blob })).json();
  }
  const data = await blob.arrayBuffer();
  const id = ++nomor;
  return new Promise((res, rej) => {
    antre.set(id, { res, rej });
    worker.postMessage({ jenis, id, data, cadangan }, [data]);
  });
}

export const analisis = (blob, cadangan) => kirim("analisis", blob, cadangan);
export const tahapan = (blob) => kirim("tahapan", blob);
