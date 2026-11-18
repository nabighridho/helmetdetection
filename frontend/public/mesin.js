/* Mesin Helmet Detection: Web Worker (module) yang menjalankan Python (Pyodide) + OpenCV di browser.
   Kode Python-nya sama dengan versi terminal: py/helmet_detection.py */
let hw = null;

function lapor(teks, persen) {
  postMessage({ jenis: "progres", teks, persen });
}

async function mulai({ pyodide, base }) {
  lapor("Memuat Python…", 10);
  const { loadPyodide } = await import(pyodide + "pyodide.mjs");
  const py = await loadPyodide({ indexURL: pyodide });
  lapor("Memuat NumPy dan OpenCV…", 45);
  await py.loadPackage(["numpy", "opencv-python"]);
  lapor("Memuat kode deteksi helm…", 85);
  const folder = "/home/pyodide/helm";
  py.FS.mkdirTree(folder);
  const berkas = ["helmet_detection.py", "helmet_web.py", "haarcascade_frontalface_default.xml",
    "haarcascade_frontalface_alt2.xml", "haarcascade_profileface.xml"];
  for (const f of berkas) {
    const r = await fetch(base + "py/" + f);
    if (!r.ok) throw new Error("Berkas " + f + " tidak ditemukan");
    py.FS.writeFile(folder + "/" + f, new Uint8Array(await r.arrayBuffer()));
  }
  py.runPython(`import sys; sys.path.insert(0, "${folder}")`);
  hw = py.pyimport("helmet_web");
  const info = JSON.parse(hw.info());
  info.versi = py.runPython("import sys, cv2; f'Python {sys.version.split()[0]} · OpenCV {cv2.__version__}'");
  postMessage({ jenis: "siap", info });
}

onmessage = async (e) => {
  const m = e.data;
  if (m.jenis === "mulai") {
    try { await mulai(m); } catch (err) { postMessage({ jenis: "gagal", pesan: String(err && err.message || err) }); }
    return;
  }
  try {
    if (m.jenis === "reset") {
      hw.reset();
      postMessage({ jenis: "hasil", id: m.id, hasil: { ok: true } });
      return;
    }
    const data = new Uint8Array(m.data);
    const teks = m.jenis === "tahapan" ? hw.tahapan(data)
      : hw.analisis(data, m.cadangan || null, m.t ?? null, m.gerak ?? true);
    postMessage({ jenis: "hasil", id: m.id, hasil: JSON.parse(teks) });
  } catch (err) {
    postMessage({ jenis: "hasil", id: m.id, galat: String(err && err.message || err) });
  }
};
