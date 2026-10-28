// Utilidades de navegador de los guardianes: servidor estático mínimo y medida de una página del gemelo con escenarios fijos.
// SwiftShader vale para contar llamadas, triángulos, puntos y memoria; NO para fps (doc/operacion/TESTING.md).
"use strict";
const http = require("http");
const { chrome, playwright, python, fs, path } = require("./_util");

const TIPOS = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".js": "text/javascript", ".css": "text/css" };
const ESPERA_MS = Number(process.env.GEMELO_ESPERA || 45000);
const ESCENARIOS = {
  lejos: { az: -0.55, el: 0.62, dist: 600, ox: 0, oy: -130, modo: "gem" },
  cerca: { az: -0.4, el: 0.5, dist: 45, ox: -130, oy: -125, modo: "gem" },
  nube: { az: -0.55, el: 0.62, dist: 350, ox: 0, oy: -130, modo: "nube" },
};

function sirve(raiz) {
  return new Promise(ok => {
    const s = http.createServer((q, r) => {
      const url = decodeURIComponent(q.url.split("?")[0]);
      if (url === "/favicon.ico") { r.statusCode = 204; return r.end(); }
      const f = path.join(raiz, url);
      if (!f.startsWith(raiz)) { r.statusCode = 403; return r.end(); }
      fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); } else { r.setHeader("content-type", TIPOS[path.extname(f)] || "application/octet-stream"); r.end(d); } });
    }).listen(0, "127.0.0.1", () => ok(s));
  });
}

/** Motivo para saltar las pruebas de navegador, o null si se pueden ejecutar */
function motivoSalto(que) {
  if (!chrome()) return "Chrome no encontrado (define CHROME): " + que + " NO se ha comprobado";
  if (!playwright()) return "falta playwright-core (npm i): " + que + " NO se ha comprobado";
  if (!python()) return "falta Python 3 para generar el fixture: " + que + " NO se ha comprobado";
  return null;
}

function lanza() {
  return playwright().chromium.launch({ executablePath: chrome(), args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--enable-precise-memory-info"] });
}

/** Abre una URL, espera a __g.listo() y mide cada escenario. Devuelve { errores, fallos, medidas } */
async function mide(navegador, url) {
  const p = await navegador.newPage({ viewport: { width: 900, height: 650 } }), errores = [], fallos = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
  p.on("requestfailed", r => fallos.push(r.url()));
  p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
  await p.goto(url + (url.includes("?") ? "&" : "?") + "debug");
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: ESPERA_MS });
  const medidas = {};
  for (const [nombre, e] of Object.entries(ESCENARIOS)) {
    await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
    await p.waitForFunction(() => window.__g.Cola.pendientes() === 0, null, { timeout: ESPERA_MS, polling: 500 }).catch(() => {});
    await p.waitForTimeout(1500);
    medidas[nombre] = await p.evaluate(() => { const g = window.__g, r = g.renderer.info; return { llamadas: r.render.calls, triangulos: r.render.triangles, puntos: r.render.points, geometrias: r.memory.geometries, texturas: r.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, olivos: g.Arboles.resumen() }; });
  }
  await p.close();
  return { errores, fallos, medidas };
}

module.exports = { ESCENARIOS, sirve, motivoSalto, lanza, mide };
