"use strict";
// Carga real en Chrome headless (SwiftShader) del fixture montado: 0 errores de consola y recuentos de dibujo bajo los topes de pruebas/presupuesto.json.
// SwiftShader vale para contar llamadas, triángulos, puntos y memoria; NO vale para fps (doc/operacion/TESTING.md). Sin Chrome o sin playwright-core el test se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const http = require("http");
const { RAIZ, propia, python, chrome, playwright, fixture, ejecuta, fs, path } = require("./_util");

const PRES = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "presupuesto.json"), "utf8"));
const TIPOS = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".js": "text/javascript" };
const ESPERA_MS = Number(process.env.GEMELO_ESPERA || 45000);
const MIDE = !!process.env.GEMELO_MIDE;                       // GEMELO_MIDE=1: imprime las cifras medidas (para ajustar presupuesto.json)

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

const motivoSalto = (() => {
  if (!chrome()) return "Chrome no encontrado (define CHROME): la carga en navegador NO se ha comprobado";
  if (!playwright()) return "falta playwright-core (npm i): la carga en navegador NO se ha comprobado";
  if (!python()) return "falta Python 3 para generar y montar el fixture: la carga en navegador NO se ha comprobado";
  return null;
})();

let srv, navegador, base;
test.before(async () => {
  if (motivoSalto) return;
  const py = python(), FIX = path.relative(RAIZ, fixture()), WEB = propia("web-carga"), rw = p => path.relative(RAIZ, path.join(WEB, p));
  const m = (args) => { const r = ejecuta(py, ["-I", "montar_v2.py"].concat(args)); assert.strictEqual(r.status, 0, r.stdout + r.stderr); };
  m(["--datos", FIX + "/cerro/embebido.json", "--salida", rw("cerro/index.html")]);
  m(["--finca", "hituelo", "--modo", "ficheros", "--datos", FIX + "/hituelo/indice.json", "--salida", rw("hituelo/index.html")]);
  srv = await sirve(WEB); base = "http://127.0.0.1:" + srv.address().port;
  navegador = await playwright().chromium.launch({ executablePath: chrome(), args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--enable-precise-memory-info"] });
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

for (const finca of ["cerro", "hituelo"]) {
  test("[" + finca + "] carga sin errores y cada escenario cabe en el presupuesto de dibujo", { timeout: 240000 }, async t => {
    if (motivoSalto) return t.skip(motivoSalto);
    const p = await navegador.newPage({ viewport: { width: 900, height: 650 } }), errores = [], fallos = [];
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
    p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
    p.on("requestfailed", r => fallos.push(r.url()));
    p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
    await p.goto(base + "/" + finca + "/index.html?debug");
    await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: ESPERA_MS });
    const medidas = {};
    for (const [nombre, e] of Object.entries(ESCENARIOS)) {
      await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
      await p.waitForFunction(() => window.__g.Cola.pendientes() === 0, null, { timeout: ESPERA_MS, polling: 500 }).catch(() => {});
      await p.waitForTimeout(1500);
      medidas[nombre] = await p.evaluate(() => { const g = window.__g, r = g.renderer.info; return { llamadas: r.render.calls, triangulos: r.render.triangles, puntos: r.render.points, geometrias: r.memory.geometries, texturas: r.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, olivos: g.Arboles.resumen() }; });
    }
    await p.close();
    if (MIDE) console.log("MEDIDO " + finca + " " + JSON.stringify(medidas));
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    assert.deepStrictEqual(fallos, [], "peticiones fallidas");
    for (const [nombre, m] of Object.entries(medidas)) {
      const tope = PRES.fixture[nombre], dis = PRES.diseno;
      for (const k of ["llamadas", "triangulos", "puntos"]) assert.ok(m[k] <= tope[k], finca + "/" + nombre + ": " + k + " " + m[k] + " > tope " + tope[k] + " (si sube a propósito, explícalo y sube pruebas/presupuesto.json)");
      if (m.heapMB >= 0) assert.ok(m.heapMB <= tope.heapMB, finca + "/" + nombre + ": heap " + m.heapMB + " MB > tope " + tope.heapMB);
      assert.ok(m.triangulos <= dis.triangulos && m.puntos <= dis.puntos && m.heapMB <= dis.heapMB, nombre + ": se pasa del presupuesto de DISEÑO (ADR-0002)");
    }
  });
}
