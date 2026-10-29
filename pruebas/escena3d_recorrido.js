"use strict";
// Criterios 3 y 4 del ADR-0015 con cualquier finca servida (p. ej. Hituelo real con su tileset al lado, fuera del repo):
//   node pruebas/escena3d_recorrido.js <carpeta servida (index.html + t/ + tileset/)> [--pasos 60] [--salida <resultado.json>]
// Abre la página con ?escena=tiles en UN Chrome dentro del turno del banco (lanza() de _navegador.js lo pide; TESTING.md §«Banco de pruebas»),
// y mide: (3) vuelos de punta a punta sin esperar a la carga contando rayos desde la cámara sin relieve dentro de los datos, empezando como un
// visitante (vista de lejos cargada) y, aparte, en frío (de cerca en una punta, sin vista de lejos); (4) el relieve dibujado frente a Mundo.suelo
// de cerca y de lejos, por lado de tesela. Con SwiftShader: rayos y alturas (CPU), nada de fps.
const fs = require("fs"), path = require("path");
const { sirve, lanza } = require("./guardianes/_navegador");
const { vuela, cajaDatos, comparaRelieve } = require("./guardianes/_recorrido");

const arg = process.argv.slice(2), RAIZ = path.resolve(arg[0] || ""), op = k => { const i = arg.indexOf("--" + k); return i > 0 ? arg[i + 1] : null; };
const PASOS = Number(op("pasos") || 60);
if (!arg[0] || !fs.existsSync(path.join(RAIZ, "index.html")) || !fs.existsSync(path.join(RAIZ, "tileset", "tileset.json"))) { console.error("uso: node pruebas/escena3d_recorrido.js <carpeta con index.html y tileset/tileset.json>"); process.exit(2); }

const rejilla = (cx, cy, r, paso) => { const P = []; for (let y = cy - r; y <= cy + r + 1e-9; y += paso) for (let x = cx - r; x <= cx + r + 1e-9; x += paso) P.push([+x.toFixed(3), +y.toFixed(3)]); return P; };
function resumeRelieve(filas) {
  const porLado = {};
  for (const [, , uri, L, err, dI, dV] of filas.filter(f => f[2])) {
    const q = porLado[L] || (porLado[L] = { puntos: 0, vertices: 0, maxInterior: 0, maxVertice: 0, maxError: 0, sobreError: 0 });
    q.puntos++; q.maxInterior = Math.max(q.maxInterior, dI); q.maxError = Math.max(q.maxError, err); if (dI > err + 0.01) q.sobreError++;
    if (dV !== null) { q.vertices++; q.maxVertice = Math.max(q.maxVertice, dV); }
  }
  return { sinRelieve: filas.filter(f => !f[2]).length, porLado };
}

(async () => {
  const srv = await sirve(RAIZ), url = "http://127.0.0.1:" + srv.address().port + "/index.html?debug&escena=tiles", nav = await lanza(), res = { raiz: path.basename(RAIZ), pasos: PASOS };
  const abre = async () => {
    const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
    await p.goto(url); await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 120000, polling: 500 });
    return { p, errores };
  };
  const espera = p => p.waitForFunction(() => window.__g.Escena3D.listo(), null, { timeout: 240000, polling: 500 }).then(() => true, () => false);
  const coloca = (p, e) => p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; }, e);
  try {
    // 1. como un visitante: vista de lejos cargada y vuelos
    let { p, errores } = await abre();
    const [x0, y0, x1, y1] = await cajaDatos(p), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, m = 16;
    res.caja = [x0, y0, x1, y1];
    await coloca(p, { az: -0.55, el: 0.62, dist: 600, ox: 0, oy: -130 }); res.lejosCargado = await espera(p);
    res.vueloBajo = await vuela(p, { A: [x0 + m, cy], B: [x1 - m, cy], pasos: PASOS, dist: 45, el: 0.5 });
    res.vueloNS = await vuela(p, { A: [cx, y0 + m], B: [cx, y1 - m], pasos: PASOS, dist: 45, el: 0.5, az: 1.2 });
    res.vueloAlto = await vuela(p, { A: [x1 - m, y0 + m], B: [x0 + m, y1 - m], pasos: PASOS, dist: 160, el: 0.7, az: 0.6 });
    // 4. relieve: de cerca (hojas) en tres sitios con datos y de lejos
    const cerca = [];
    for (const [ox, oy] of [[-130, -125], [128.9, 328.7], [cx, cy]]) {
      await coloca(p, { az: -0.4, el: 0.5, dist: 45, ox, oy }); await espera(p);
      cerca.push(...await comparaRelieve(p, rejilla(ox, oy, 30, 6)));
    }
    res.relieveCerca = resumeRelieve(cerca);
    await coloca(p, { az: -0.55, el: 0.62, dist: 600, ox: 0, oy: -130 }); await espera(p);
    res.relieveLejos = resumeRelieve(await comparaRelieve(p, rejilla(0, -130, 400, 41)));
    res.errores = errores.slice(0, 10);
    await p.close();
    // 3 en frío: sin vista de lejos, de cerca en una punta y vuelo a la otra
    ({ p, errores } = await abre());
    await coloca(p, { az: -0.4, el: 0.5, dist: 45, ox: x0 + m, oy: cy }); res.frioCargado = await espera(p);
    res.vueloFrio = await vuela(p, { A: [x0 + m, cy], B: [x1 - m, cy], pasos: PASOS, dist: 45, el: 0.5 });
    res.erroresFrio = errores.slice(0, 10);
    await p.close();
  } finally { await nav.close(); srv.close(); }
  const s = JSON.stringify(res, null, 1);
  if (op("salida")) fs.writeFileSync(op("salida"), s);
  console.log(s);
})().catch(e => { console.error(e); process.exit(1); });
