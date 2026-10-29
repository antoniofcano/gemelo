// Calibración de tuberia/parametros_copas.py con datos SINTÉTICOS (nada real en el repo): se generan olivos con el módulo apps/web/olivo/ y
// parámetros conocidos, se convierten en una nube de puntos (centros y puntas de las ramitas, el relleno y los vértices de la madera, con la
// escala final del árbol), se miden con el mismo cálculo que se usará con el LiDAR y se compara lo medido con lo pedido.
//   node pruebas/olivo/calibracion.mjs [carpeta]     (por defecto pruebas/salida/olivo-calibracion-<pid>; se borra al acabar)
// Imprime JSON con los errores; sale con 1 si alguno pasa de su tope. Lo usa pruebas/guardianes/olivo.test.js.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const O = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "olivo", "index.js")).href);
const dir = path.resolve(process.argv[2] || path.join(RAIZ, "pruebas", "salida", "olivo-calibracion-" + process.pid));
fs.mkdirSync(dir, { recursive: true });

// Topes de REGRESIÓN (medidos el 2026-10-29 con +25 % de margen): los árboles son ILUSTRATIVOS y la nube es un muestreo de su geometría, no
// un LiDAR real. altura y copa: error tras corregir con el factor k (pedido / medido, ajustado aquí); rumbo: solo árboles con asimetría ≥ 0,3.
export const TOPES = { altura_m: 0.46, copa_m: 1.0, rumbo_gr: 60, asim: 0.45 };
const CASOS = [];
const tipos = ["centenario3", "adulto1", "centenario", "adulto2"], rumbos = [0, 90, 180, 270, 45, 135, 225, 315];
for (let i = 0; i < 12; i++) CASOS.push({ tipo: tipos[i % 4], semilla: 101 + i * 7, parametros: { altura: 4 + (i % 5) * 0.5, copa: 5.5 + (i % 4) * 1.1, rumbo: rumbos[i % 8], asim: i % 3 === 2 ? 0.1 : 0.45 } });

const X = [], Y = [], Hh = [], arboles = [];
CASOS.forEach((c, i) => {
  const r = O.receta({ tipo: c.tipo, parametros: c.parametros, epoca: "reposo", semilla: c.semilla });
  const ox = (i % 4) * 16, oy = Math.floor(i / 4) * 16, [fx, fy, fz] = r.escala;
  const mete = (x, y, z) => { X.push(ox + x * fx); Y.push(oy - z * fz); Hh.push(y * fy); };   // motor: +X este, −Z norte, +Y arriba
  for (const p of r.piezas) {
    if (p.clase === "instancias" && (p.geo === "ramita" || p.geo === "relleno")) {
      for (let k = 0; k < p.n; k++) { const m = p.matrices.subarray(k * 16, k * 16 + 16); mete(m[12], m[13], m[14]);
        if (p.geo === "ramita") mete(m[12] + m[4] * 0.54, m[13] + m[5] * 0.54, m[14] + m[6] * 0.54); }   // la punta de la tarjeta
    } else if (p.clase === "malla") {
      const a = p.atrib.position; for (let v = 0; v < a.length; v += 9) mete(a[v], a[v + 1], a[v + 2]);
    }
  }
  arboles.push({ x: ox, y: oy, pedido: c.parametros, tipo: c.tipo, medidas: r.medidas });
});
// LiDAR aéreo simulado: de cada celda de 0,25 m, el punto más alto (el primer retorno) y uno de cada 8 de los demás (lo que penetra)
const CEL = 0.25, alto = new Map();
X.forEach((x, i) => { const k = Math.floor(x / CEL) + "," + Math.floor(Y[i] / CEL), j = alto.get(k); if (j === undefined || Hh[j] < Hh[i]) alto.set(k, i); });
const quedan = new Set(alto.values()); X.forEach((x, i) => { if (i % 8 === 0) quedan.add(i); });
const sel = [...quedan].sort((a, b) => a - b);
const f = path.join(dir, "arboles.json");
fs.writeFileSync(f, JSON.stringify({ arboles, puntos: { x: sel.map(i => +X[i].toFixed(3)), y: sel.map(i => +Y[i].toFixed(3)), h: sel.map(i => +Hh[i].toFixed(3)) } }));
const py = [process.env.PYTHON, "python", "python3"].filter(Boolean).find(c => spawnSync(c, ["-c", "import numpy, scipy"]).status === 0);
if (!py) { console.log(JSON.stringify({ salto: "sin Python con numpy y scipy" })); process.exit(0); }
const pr = spawnSync(py, [path.join(RAIZ, "tuberia", "parametros_copas.py"), "--calibracion", f], { encoding: "utf8" });
if (pr.status !== 0) { console.log(JSON.stringify({ error: pr.stderr })); process.exit(1); }
const M = JSON.parse(fs.readFileSync(path.join(dir, "arboles.medido.json"), "utf8"));
const err = { altura_m: [], copa_m: [], rumbo_gr: [], asim: [] }, sinCorregir = { altura_m: [], copa_m: [] }, filas = [];
// factor k por mínimos cuadrados (pedido ≈ k · medido): p95 y radio medio quedan por debajo del máximo y de la caja que usa el generador
const ajusta = j => { let a = 0, b = 0; arboles.forEach((t, i) => { const m = M.filas[i]; if (m) { a += m[j] * (j ? t.pedido.copa : t.pedido.altura); b += m[j] * m[j]; } }); return a / b; };
const k = { altura: +ajusta(0).toFixed(3), copa: +ajusta(1).toFixed(3) };
arboles.forEach((a, i) => {
  const m = M.filas[i]; if (!m) { err.altura_m.push(Infinity); return; }
  const P = O.parametrosDeCopa([a.x, a.y, 0, null, 1], m, a.tipo).parametros;
  sinCorregir.altura_m.push(Math.abs(m[0] - a.pedido.altura)); sinCorregir.copa_m.push(Math.abs(m[1] - a.pedido.copa));
  err.altura_m.push(Math.abs(k.altura * m[0] - a.pedido.altura)); err.copa_m.push(Math.abs(k.copa * m[1] - a.pedido.copa));
  if (a.pedido.asim >= 0.3) { const d = Math.abs(((m[3] - a.pedido.rumbo) % 360 + 540) % 360 - 180); err.rumbo_gr.push(d); }
  err.asim.push(Math.abs((P.asim || 0) - a.pedido.asim));
  filas.push({ pedido: a.pedido, real: { altura_m: +a.medidas.altura_m.toFixed(2), copa_m: +a.medidas.copa_m.toFixed(2) }, medido: Object.fromEntries(M.campos.map((k, j) => [k, m[j]])), asim_deducida: +(P.asim || 0).toFixed(2) });
});
const res = {}, mal = [], resume = v => { const s = v.slice().sort((a, b) => a - b); return { medio: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3), max: +s[s.length - 1].toFixed(3), n: v.length }; };
for (const [c, v] of Object.entries(err)) { res[c] = resume(v); if (res[c].max > TOPES[c]) mal.push(c + ": error máx. " + res[c].max + " > " + TOPES[c]); }
res.sin_corregir = { altura_m: resume(sinCorregir.altura_m), copa_m: resume(sinCorregir.copa_m) };
res.k = k;
if (!process.argv[2]) fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ puntos: sel.length, muestreados: X.length, arboles: arboles.length, errores: res, topes: TOPES, mal, filas }));
process.exit(mal.length ? 1 : 0);
