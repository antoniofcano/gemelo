// O9b (ADR-0022 §3): masa visual de las tarjetas de racimo de E1/E2 frente al E0 del mismo olivo y frente a los escalones de ANTES (otro niveles.js,
// p. ej. `git show <commit>:apps/web/olivo/niveles.js`), en la misma corrida; y las constantes de tarjetas.js medidas (PHI_RAMITA: fracción opaca
// de las ramitas; PHI_CELDA: la de las celdas del atlas), lo que tarda el atlas y sus bytes. Chrome sin pantalla con el three 0.186.1 del motor, por
// el TURNO del banco (lanza() de _navegador.js). SwiftShader vale aquí: áreas y colores de una imagen fija, no fps. Métricas: o9a_masa_pagina.mjs.
//   node pruebas/olivo/o9b_tarjetas.mjs [--antes <niveles.js de antes>] [--capturas <carpeta>] [--lados 512,128]   → JSON por stdout (resumen, stderr)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { sirve, lanza } = require(path.join(RAIZ, "pruebas", "guardianes", "_navegador.js"));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const CAP = arg("--capturas") ? path.resolve(arg("--capturas")) : null, LADOS = (arg("--lados") || "512,128").split(",").map(Number);
const say = m => process.stderr.write(m + "\n");

const DIR = path.join(RAIZ, "pruebas", "salida", "o9b"); fs.mkdirSync(DIR, { recursive: true });
let ANTES = null;
if (arg("--antes")) { fs.writeFileSync(path.join(DIR, "niveles_antes.js"), fs.readFileSync(path.resolve(arg("--antes")), "utf8").replace(/^﻿/, "")); ANTES = "/pruebas/salida/o9b/niveles_antes.js"; }
const NM = "/apps/web/olivo/node_modules/";
fs.writeFileSync(path.join(DIR, "pagina.html"), '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">\n<script type="importmap">' +
  JSON.stringify({ imports: { three: NM + "three-r186/build/three.module.js", "three-gen": NM + "three-gen/build/three.module.js", "idb-keyval": NM + "idb-keyval/dist/index.js" } }) +
  '</script>\n<script type="module" src="/pruebas/olivo/o9a_masa_pagina.mjs"></script>\n');

const MEDIDO = { tipo: "centenario3", epoca: "envero", semilla: 1003, parametros: { altura: 3.8, copa: 4.3, densidad: 0.85, falda: 0.7, relieve: 0.22, asim: 0 } };
const CFG = { lados: LADOS, antes: ANTES, olivos: [
  { nombre: "medido-1003", entrada: MEDIDO, variantes: [{ etiqueta: "var11-E2 copa del propio (motor)", semilla: 11, copa: 4.3, altura: 4.0 }]
    .concat(ANTES ? [{ etiqueta: "var11-E2 copa del propio (motor) antes", semilla: 11, copa: 4.3, altura: 4.0, antes: true }] : []) },
  { nombre: "centenario3-7", entrada: { tipo: "centenario3", epoca: "envero", semilla: 7 } },
  { nombre: "adulto1-1003", entrada: { tipo: "adulto1", epoca: "envero", semilla: 1003 } },
  { nombre: "medido-1003 reposo", entrada: Object.assign({}, MEDIDO, { epoca: "reposo" }) }
] };

const s = await sirve(RAIZ), nav = await lanza();
let out;
try {
  const p = await nav.newPage({ viewport: { width: 600, height: 600 } }), errores = [];
  p.on("pageerror", e => errores.push(String(e).slice(0, 300))); p.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
  await p.route("**/*.mjs", async r => { const resp = await r.fetch(); await r.fulfill({ response: resp, headers: Object.assign({}, resp.headers(), { "content-type": "text/javascript" }) }); });
  await p.goto("http://127.0.0.1:" + s.address().port + "/pruebas/salida/o9b/pagina.html");
  await p.waitForFunction(() => window.listo === true, null, { timeout: 120000 }).catch(() => { throw new Error("la página no arrancó: " + errores.join(" | ")); });
  const t0 = Date.now();
  out = await p.evaluate(cfg => window.mide(cfg), CFG);
  out.phi = await p.evaluate(() => window.phi(["envero", "reposo", "flor", "madura"]));
  out.segundos = Math.round((Date.now() - t0) / 1000); out.errores = errores;
} finally { await nav.close(); s.close(); }

if (CAP) {
  fs.mkdirSync(CAP, { recursive: true });
  for (const [k, u] of Object.entries(out.hojas)) fs.writeFileSync(path.join(CAP, "o9b-" + k.replace(/[^a-z0-9@-]/gi, "_") + ".png"), Buffer.from(u.split(",")[1], "base64"));
  const im = out.phi.epocas.envero.imagen; if (im) fs.writeFileSync(path.join(CAP, "o9b-atlas-envero.png"), Buffer.from(im.split(",")[1], "base64"));
}
delete out.hojas; for (const e of Object.values(out.phi.epocas)) delete e.imagen;
const H = Object.keys(out.res[0].vistas).filter(v => v !== "cenital"), media = (f, k) => H.reduce((a, v) => a + f.vistas[v][k], 0) / H.length;
out.resumen = out.res.map(f => {
  const e0 = out.res.find(g => g.olivo === f.olivo && g.lado === f.lado && g.escalon === "E0");
  const o = { olivo: f.olivo, lado: f.lado, escalon: f.escalon, tri: f.tri };
  for (const k of ["cobertura", "iou", "huecos_pct", "luz", "contraste"]) { o[k] = +media(f, k).toFixed(3); o[k + "_cenital"] = f.vistas.cenital[k]; }
  o.iou_min = +Math.min(...H.map(v => f.vistas[v].iou)).toFixed(3);
  o.cobertura_vs_E0_pct = +(100 * (o.cobertura / media(e0, "cobertura") - 1)).toFixed(1);
  o.cobertura_cenital_vs_E0_pct = +(100 * (o.cobertura_cenital / e0.vistas.cenital.cobertura - 1)).toFixed(1);
  return o;
});
out.resumen.forEach(o => say([o.olivo, o.lado, o.escalon, o.tri, "cob " + o.cobertura + " (" + o.cobertura_vs_E0_pct + " %)", "IoU " + o.iou + " (mín " + o.iou_min + ")", "huecos " + o.huecos_pct + " %", "luz " + o.luz, "contr " + o.contraste, "cen: cob " + o.cobertura_cenital + " (" + o.cobertura_cenital_vs_E0_pct + " %) IoU " + o.iou_cenital].join(" | ")));
say("phi: " + JSON.stringify(out.phi));
if (out.errores.length) say("errores: " + out.errores.join(" | "));
console.log(JSON.stringify(out));
