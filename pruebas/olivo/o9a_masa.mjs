// O9a (decisión 80): masa visual por escalón (E0, E1, E2, E2-VR, variante estirada e impostor emulado) en Chrome sin pantalla con el three
// 0.186.1 del motor. Pide el TURNO del banco (lanza() de _navegador.js; TESTING.md §Banco). SwiftShader vale aquí: son áreas y colores de una
// imagen fija, no fps. Las métricas las explica pruebas/olivo/o9a_masa_pagina.mjs.
//   node pruebas/olivo/o9a_masa.mjs [--capturas <carpeta>] [--lados 512,128]   → JSON por stdout (resumen legible por stderr)
// Olivos (envero, semillas fijas): adulto1 1003 y centenario3 7 con los parámetros de su tipo, y un centenario3 «medido» como lo pide el motor
// (copas_param del fixture de Hituelo: h 3,8, copa_m 4,3 = 2 × r8 medio) con, además, lo que el motor dibuja de él lejos: la variante E2
// (semilla 11) a la copa del propio (4,3 m, O9b-0, decisión 81) y altura 4,0, la de antes (2 × r8 × 0,5 = 2,15 m), su E2-VR, y el impostor
// emulado de esa variante. Las hojas llevan los mipmaps que conservan la cobertura (ADR-0022 §6); «… GPU» repite el olivo con los de la GPU.
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

// la página: en pruebas/salida (no se versiona), con el mapa de importaciones a los paquetes fijados de apps/web/olivo
const DIR = path.join(RAIZ, "pruebas", "salida", "o9a"); fs.mkdirSync(DIR, { recursive: true });
const NM = "/apps/web/olivo/node_modules/";
fs.writeFileSync(path.join(DIR, "pagina.html"), '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">\n<script type="importmap">' +
  JSON.stringify({ imports: { three: NM + "three-r186/build/three.module.js", "three-gen": NM + "three-gen/build/three.module.js", "idb-keyval": NM + "idb-keyval/dist/index.js" } }) +
  '</script>\n<script type="module" src="/pruebas/olivo/o9a_masa_pagina.mjs"></script>\n');

const CFG = { lados: LADOS, olivos: [
  { nombre: "adulto1-1003", entrada: { tipo: "adulto1", epoca: "envero", semilla: 1003 } },
  { nombre: "centenario3-7", entrada: { tipo: "centenario3", epoca: "envero", semilla: 7 } },
  { nombre: "medido-1003", entrada: { tipo: "centenario3", epoca: "envero", semilla: 1003, parametros: { altura: 3.8, copa: 4.3, densidad: 0.85, falda: 0.7, relieve: 0.22, asim: 0 } },
    variantes: [
      { etiqueta: "var11-E2 copa del propio (motor)", semilla: 11, copa: 4.3, altura: 4.0 },
      { etiqueta: "var11-E2 r8×0,5 (antes)", semilla: 11, copa: 2.15, altura: 4.0 },
      { etiqueta: "var11-E2VR copa del propio (motor)", semilla: 11, nivel: "E2VR", copa: 4.3, altura: 4.0 },
      { etiqueta: "impostor var11 copa del propio (motor)", semilla: 11, copa: 4.3, altura: 4.0, impostor: true }
    ] },
  { nombre: "centenario3-7 GPU", mipsGPU: true, entrada: { tipo: "centenario3", epoca: "envero", semilla: 7 } },
  { nombre: "medido-1003 GPU", mipsGPU: true, entrada: { tipo: "centenario3", epoca: "envero", semilla: 1003, parametros: { altura: 3.8, copa: 4.3, densidad: 0.85, falda: 0.7, relieve: 0.22, asim: 0 } },
    variantes: [{ etiqueta: "var11-E2 copa del propio (motor)", semilla: 11, copa: 4.3, altura: 4.0 }] }
] };

const s = await sirve(RAIZ), nav = await lanza();
let out;
try {
  const p = await nav.newPage({ viewport: { width: 600, height: 600 } }), errores = [];
  p.on("pageerror", e => errores.push(String(e).slice(0, 300))); p.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
  // el servidor de las pruebas no conoce .mjs: se sirve como JavaScript (los módulos lo exigen)
  await p.route("**/*.mjs", async r => { const resp = await r.fetch(); await r.fulfill({ response: resp, headers: Object.assign({}, resp.headers(), { "content-type": "text/javascript" }) }); });
  await p.goto("http://127.0.0.1:" + s.address().port + "/pruebas/salida/o9a/pagina.html");
  await p.waitForFunction(() => window.listo === true, null, { timeout: 120000 }).catch(() => { throw new Error("la página no arrancó: " + errores.join(" | ")); });
  const t0 = Date.now();
  out = await p.evaluate(cfg => window.mide(cfg), CFG);
  out.segundos = Math.round((Date.now() - t0) / 1000); out.errores = errores;
} finally { await nav.close(); s.close(); }

if (CAP) { fs.mkdirSync(CAP, { recursive: true }); for (const [k, u] of Object.entries(out.hojas)) fs.writeFileSync(path.join(CAP, "o9a-" + k.replace(/[^a-z0-9@-]/gi, "_") + ".png"), Buffer.from(u.split(",")[1], "base64")); }
delete out.hojas;
// resumen: media de las 8 horizontales y la cenital, y diferencia con el E0 del mismo olivo y lado
const H = Object.keys(out.res[0].vistas).filter(v => v !== "cenital"), media = (f, k) => H.reduce((a, v) => a + f.vistas[v][k], 0) / H.length;
out.resumen = out.res.map(f => {
  const e0 = out.res.find(g => g.olivo === f.olivo && g.lado === f.lado && g.escalon === "E0");
  const o = { olivo: f.olivo, lado: f.lado, escalon: f.escalon, tri: f.tri };
  for (const k of ["cobertura", "iou", "huecos_pct", "agujeros_10k", "luz", "contraste"]) { o[k] = +media(f, k).toFixed(3); o[k + "_cenital"] = f.vistas.cenital[k]; }
  o.area_vs_E0_pct = +(100 * (media(f, "area_arbol") / media(e0, "area_arbol") - 1)).toFixed(1);
  o.cobertura_vs_E0_pct = +(100 * (o.cobertura / media(e0, "cobertura") - 1)).toFixed(1);
  o.color = f.vistas.az0.color;
  return o;
});
out.resumen.forEach(o => say([o.olivo, o.lado, o.escalon, o.tri, "cob " + o.cobertura + " (" + o.cobertura_vs_E0_pct + " %)", "IoU " + o.iou, "huecos " + o.huecos_pct + " %", "aguj " + o.agujeros_10k, "luz " + o.luz, "contr " + o.contraste, "cen: cob " + o.cobertura_cenital + " IoU " + o.iou_cenital].join(" | ")));
console.log(JSON.stringify(out));
