"use strict";
// Ronda del banco (TESTING.md §«Banco de pruebas»): dentro de UN turno abre UN Chrome sin pantalla y hace, uno detrás de otro, todos los
// encargos de la cola (pruebas/banco/encarga.js). Cada encargo sirve su carpeta en 127.0.0.1, mide cada variante con mide() de
// _navegador.js (escenarios fijos, tope de tiempo: si se pasa, «parcial») y deja <banco>/resultados/<id>/resultado.json (+ capturas).
// Un encargo que falla no para la ronda.   node pruebas/banco/ronda.js [--vigila]   (--vigila: sigue mirando la cola cada 30 s)
const fs = require("fs"), path = require("path");
const { pide } = require("./turno");
const { ENCARGOS, RESULTADOS } = require("./encarga");
const { sirve, lanza, mide, ESCENARIOS } = require("../guardianes/_navegador");

const pendientes = () => fs.existsSync(ENCARGOS) ? fs.readdirSync(ENCARGOS).filter(f => f.endsWith(".json")).sort() : [];

async function hazEncargo(nav, f) {
  const e = JSON.parse(fs.readFileSync(path.join(ENCARGOS, f), "utf8")), dir = path.join(RESULTADOS, e.id), t0 = Date.now();
  fs.mkdirSync(dir, { recursive: true });
  const res = { id: e.id, de: e.de, raiz: e.raiz, empezado: new Date().toISOString(), variantes: {} };
  const escenarios = e.escenarios ? Object.fromEntries(e.escenarios.map(n => [n, ESCENARIOS[n]]).filter(([, v]) => v)) : ESCENARIOS;
  const srv = await sirve(e.raiz);
  try {
    for (const v of e.variantes) {
      const url = "http://127.0.0.1:" + srv.address().port + "/" + e.pagina + (v.consulta ? (v.consulta.startsWith("?") ? v.consulta : "?" + v.consulta) : "");
      try { res.variantes[v.nombre] = await mide(nav, url, { escenarios, tope: e.tope_s * 1000, capturas: e.capturas ? path.join(dir, v.nombre) : null }); }
      catch (err) { res.variantes[v.nombre] = { error: String(err.message || err).slice(0, 500) }; }
    }
  } finally { srv.close(); }
  res.segundos = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(dir, "resultado.json"), JSON.stringify(res, null, 2));
  fs.renameSync(path.join(ENCARGOS, f), path.join(dir, "encargo.json"));
  console.log("hecho " + e.id + " (" + e.de + ", " + res.segundos + " s)");
}

async function ronda() {
  if (!pendientes().length) return 0;
  const suelta = await pide("ronda del banco");
  let n = 0;
  try {
    const nav = await lanza();
    try { for (let fs_; (fs_ = pendientes()).length; n++) await hazEncargo(nav, fs_[0]).catch(err => { console.error("encargo " + fs_[0] + ": " + err.message); fs.renameSync(path.join(ENCARGOS, fs_[0]), path.join(ENCARGOS, fs_[0] + ".fallido")); }); }
    finally { await nav.close(); }
  } finally { await suelta(); }
  return n;
}

if (require.main === module) {
  (async () => {
    const vigila = process.argv.includes("--vigila");
    do { const n = await ronda(); if (n) console.log("ronda: " + n + " encargos"); if (vigila) await new Promise(ok => setTimeout(ok, 30000)); } while (vigila);
  })().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { ronda, pendientes };
