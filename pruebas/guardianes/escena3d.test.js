"use strict";
// F1d paso 3b (ADR-0015, Propuesto): la escena 3D Tiles DENTRO del motor, solo con ?escena=tiles (apps/web/motor/04b_escena3d.js).
// Sin navegador: versión fijada y única de 3DTilesRendererJS (apps/web y el visor de tuberia/tiles3d), importmap de la salida artefacto, que
// su build solo importe three (así usa la misma), los perfiles VR con su errorTarget y los enganches del motor.
// Con navegador (Chrome headless + SwiftShader: llamadas, triángulos y memoria, NUNCA fps): el fixture de Hituelo montado con su tileset al
// lado, con y sin la bandera, servido con una CSP parecida a la de la plataforma [SUPUESTO: aproximación, no la CSP real de claude.ai].
// Sin Chrome, playwright-core, Python o las dependencias de tuberia/tiles3d, lo de navegador se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const http = require("http");
const { RAIZ, propia, python, fixture, ejecuta, fs, path } = require("./_util");
const { ESCENARIOS, motivoSalto, lanza } = require("./_navegador");

const WEB = path.join(RAIZ, "apps", "web"), MOTOR = path.join(WEB, "motor"), T3D = path.join(RAIZ, "tuberia", "tiles3d");
const lee = f => fs.readFileSync(f, "utf8"), json = f => JSON.parse(lee(f));
const V = json(path.join(WEB, "package.json")).dependencies["3d-tiles-renderer"];
const MIDE = !!process.env.GEMELO_MIDE;
const DEPS_T3D = ["@gltf-transform/core", "meshoptimizer", "sharp", "three", "proj4"].filter(d => !fs.existsSync(path.join(T3D, "node_modules", d, "package.json")));
const SALTO = motivoSalto("la escena 3D Tiles en el motor") || (DEPS_T3D.length ? "faltan dependencias de tuberia/tiles3d (" + DEPS_T3D.join(", ") + "): la escena 3D Tiles en el motor NO se ha comprobado" : null);
// los avisos que da cualquier tileset 1.1 con 3DTilesRendererJS 0.5.3 y los del driver de SwiftShader (como tiles3d.test.js)
const CONOCIDOS = [/GL Driver Message/, /tiles versions at 1\.1 or higher have limited support/];

test("3DTilesRendererJS: versión exacta en apps/web/package.json, la misma que el visor de tuberia/tiles3d y la del package-lock", () => {
  assert.match(V || "", /^\d+\.\d+\.\d+$/, "3d-tiles-renderer debe ir con versión exacta en apps/web/package.json");
  assert.strictEqual(json(path.join(T3D, "visor", "package.json")).dependencies["3d-tiles-renderer"], V, "el visor y el motor deben usar la misma");
  const lock = json(path.join(WEB, "package-lock.json"));
  assert.strictEqual(lock.packages["node_modules/3d-tiles-renderer"].version, V, "package-lock.json no está al día (npm install --package-lock-only)");
});

test("su build ES solo importa «three» y «three/addons/…» (el importmap le da la three del motor) y exporta TilesRenderer y Scheduler", t => {
  const dirs = [path.join(WEB, "node_modules", "3d-tiles-renderer"), path.join(T3D, "visor", "node_modules", "3d-tiles-renderer")].filter(d => fs.existsSync(path.join(d, "package.json")) && json(path.join(d, "package.json")).version === V);
  if (!dirs.length) return t.skip("3d-tiles-renderer " + V + " no instalado (cd apps/web && npm i): sus importaciones NO se han comprobado");
  const b = path.join(dirs[0], "build"), vistos = new Set(), externos = new Set();
  (function sigue(f) {
    if (vistos.has(f)) return; vistos.add(f);
    for (const m of lee(path.join(b, f)).matchAll(/(?:from|import)\s*"([^"]+)"/g)) { if (m[1].startsWith("./")) sigue(m[1].slice(2)); else externos.add(m[1]); }
  })("index.js");
  assert.deepStrictEqual([...externos].filter(x => x !== "three" && !x.startsWith("three/addons/")), [], "importaciones que el importmap no resuelve");
  const idx = lee(path.join(b, "index.js"));
  for (const n of ["TilesRenderer", "Scheduler"]) assert.ok(new RegExp("as " + n + "\\b").test(idx), "el build no exporta " + n);
});

test("la salida artefacto pide 3DTilesRendererJS a jsDelivr con la versión de package.json, en el mismo importmap que three", t => {
  const py = python(); if (!py) return t.skip("No hay Python 3: el importmap NO se ha comprobado");
  const prog = "import sys; sys.path.insert(0, 'tuberia/salida_artefacto'); import montar_v2 as m; print(m.importmap(m.version_three(), m.version_web('3d-tiles-renderer')))";
  const r = ejecuta(py, ["-c", prog], { cwd: RAIZ }); assert.strictEqual(r.status, 0, r.stderr);
  const im = JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(r.stdout)[1]).imports;
  assert.strictEqual(im["3d-tiles-renderer"], "https://cdn.jsdelivr.net/npm/3d-tiles-renderer@" + V + "/build/index.js");
  assert.ok(im["three/addons/"], "falta three/addons/ (lo importa el build de 3DTilesRendererJS)");
});

test("el motor: 04b_escena3d.js solo actúa con ?escena=tiles, el Terreno de siempre se apaga con ESC3D.activa y cada perfil VR trae su errorTarget", () => {
  const m = lee(path.join(MOTOR, "04b_escena3d.js")), datos = lee(path.join(MOTOR, "01_datos.js")), ter = lee(path.join(MOTOR, "04_terreno.js")), vr = lee(path.join(MOTOR, "29_vr.js")), fin = lee(path.join(MOTOR, "90_final.js"));
  assert.match(datos, /escena=tiles/); assert.match(m, /if \(ESC3D\.pedida\)/, "sin la bandera no debe arrancar nada");
  assert.ok(!/fetch\(/.test(m), "la escena 3D Tiles no hace fetch propio (lo hace la librería, al mismo origen)");
  assert.match(m, /import\("3d-tiles-renderer"\)/, "la librería se pide con import() solo con la bandera");
  for (const f of ["monta", "montaTodas", "actualiza", "tileCargada", "iniciaMosaico"]) assert.match(ter, new RegExp("function " + f + "\\([^)]*\\) \\{[^\\n]*\\n?[^\\n]*ESC3D\\.activa"), "04_terreno.js: " + f + " no mira ESC3D.activa");
  const P = /var VR_PERFILES = (\[.*?\]);/.exec(vr); assert.ok(P, "no encuentro VR_PERFILES");
  const perfiles = Function("return " + P[1])();
  assert.ok(perfiles.every(p => p.e > 0), "cada perfil VR necesita e (errorTarget en px)");
  assert.ok(perfiles.every((p, i) => i === 0 || p.e > perfiles[i - 1].e), "el errorTarget debe crecer al bajar de perfil");
  assert.match(vr, /Escena3D\.perfil\(p\)/); assert.match(vr, /Escena3D\.perfil\(null\)/);
  assert.match(fin, /Escena3D\.actualiza\(\);\s*\n\s*renderer\.render/, "Escena3D.actualiza() va justo antes de dibujar");
});

// ---------------------------------------------------------------- en el navegador
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:";
const TIPOS = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".glb": "model/gltf-binary" };
function sirveConCsp(raiz, peticiones) {
  return new Promise(ok => {
    const s = http.createServer((q, r) => {
      const url = decodeURIComponent(q.url.split("?")[0]); peticiones.push(url);
      if (url === "/favicon.ico") { r.statusCode = 204; return r.end(); }
      const f = path.join(raiz, url); if (!f.startsWith(raiz)) { r.statusCode = 403; return r.end(); }
      fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", TIPOS[path.extname(f)] || "application/octet-stream"); r.setHeader("content-security-policy", CSP); r.end(d); });
    }).listen(0, "127.0.0.1", () => ok(s));
  });
}

// se prepara (fixture, tileset, página y Chrome) solo cuando la primera prueba de navegador lo pide: con --test-name-pattern sobre las de
// arriba no se arranca Chrome
let srv, nav, base, peticiones = [], preparado = null;
const prepara = () => preparado || (preparado = preparaYa());
async function preparaYa() {
  const FIX = fixture(), W = propia("escena3d"), py = python();
  const g = ejecuta(process.execPath, [path.join(T3D, "genera.mjs"), "--entrada", path.join(FIX, "hituelo"), "--salida", path.join(W, "hituelo", "tileset"), "--catalogo", path.join(RAIZ, "modelos", "olivos", "fixture", "catalogo.json")]);
  assert.strictEqual(g.status, 0, "genera.mjs falló:\n" + g.stdout + g.stderr);
  const m = ejecuta(py, ["-I", "tuberia/salida_artefacto/montar_v2.py", "--finca", "hituelo", "--modo", "ficheros", "--datos", path.relative(RAIZ, path.join(FIX, "hituelo", "indice.json")), "--salida", path.relative(RAIZ, path.join(W, "hituelo", "index.html"))]);
  assert.strictEqual(m.status, 0, m.stdout + m.stderr);
  srv = await sirveConCsp(W, peticiones); base = "http://127.0.0.1:" + srv.address().port + "/hituelo/index.html";
  nav = await lanza();
}
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

async function abre(q) {
  const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [], avisos = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", x => { const s = x.text(); if (/Content Security Policy|Refused to/i.test(s)) errores.push("CSP " + s.slice(0, 300)); else if (x.type() === "error") errores.push("CONSOLE " + s.slice(0, 300)); else if (x.type() === "warning" && !CONOCIDOS.some(re => re.test(s))) avisos.push(s.slice(0, 300)); });
  p.on("response", r => { if (r.status() >= 400) errores.push(r.status() + " " + r.url()); });
  await p.goto(base + "?debug" + q);
  await p.waitForFunction(() => window.__g && window.__g.listo() && window.__g.Escena3D.listo(), null, { timeout: 90000, polling: 500 });
  return { p, errores, avisos };
}
async function escena(p, nombre) {
  const e = ESCENARIOS[nombre];
  await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
  await p.waitForTimeout(800);
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && window.__g.Escena3D.listo(), null, { timeout: 90000, polling: 500 });
  await p.waitForTimeout(800);
  return p.evaluate(() => { const g = window.__g, r = g.renderer.info; return { llamadas: r.render.calls, triangulos: r.render.triangles, puntos: r.render.points, geometrias: r.memory.geometries, texturas: r.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, escena3d: g.Escena3D.resumen(), mallasTerreno: g.Terreno.grupo.children.length }; });
}

test("sin ?escena=tiles: la escena 3D Tiles no arranca, no se pide el tileset y el Terreno de siempre construye sus mallas", { timeout: 240000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  await prepara();
  peticiones.length = 0;
  const { p, errores } = await abre("");
  try {
    const m = await escena(p, "lejos");
    if (MIDE) t.diagnostic("sin bandera, lejos: " + JSON.stringify(m));
    assert.deepStrictEqual(errores, []);
    assert.strictEqual(m.escena3d.estado, "apagado"); assert.ok(m.mallasTerreno > 0, "sin mallas de terreno");
    assert.ok(!peticiones.some(u => /tileset|\.glb$/.test(u)), "sin la bandera no se pide nada del tileset");
  } finally { await p.close(); }
});

test("con ?escena=tiles: carga el tileset sin errores ni CSP, desde lejos baja de la raíz vacía, el Terreno de siempre no construye nada y el relieve dibujado casa con el de la CPU", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  await prepara();
  peticiones.length = 0;
  const { p, errores, avisos } = await abre("&escena=tiles");
  try {
    const med = {};
    for (const n of ["lejos", "cerca"]) med[n] = await escena(p, n);
    if (MIDE) t.diagnostic("con bandera: " + JSON.stringify(med));
    assert.deepStrictEqual(errores, [], "errores de consola, de página o de CSP");
    assert.deepStrictEqual(avisos, [], "avisos no conocidos");
    for (const [n, m] of Object.entries(med)) {
      assert.strictEqual(m.escena3d.estado, "activo", n + ": " + m.escena3d.motivo);
      assert.ok(m.escena3d.visibles > 0, n + ": ninguna tesela visible (¿se queda en la raíz sin contenido?)");
      assert.strictEqual(m.mallasTerreno, 0, n + ": el Terreno de siempre ha construido mallas");
    }
    assert.ok(peticiones.some(u => u.endsWith("/tileset/tileset.json")) && peticiones.some(u => u.endsWith(".glb")), "no se pidió el tileset");
    assert.ok(peticiones.some(u => /\/t\/[^/]+\.json$/.test(u)), "el json de las teselas se sigue pidiendo (decisión 38)");
    const r = await p.evaluate(() => { const g = window.__g, E = g.Escena3D, out = []; let inst = 0;
      E.grupo().traverse(o => { if (o.isInstancedMesh) inst++; });
      for (const [x, y] of [[-130, -125], [-60, -100], [100, -180], [0, -130]]) out.push([x, y, E.alturaEn(x, y), g.suelo(x, y)]);
      return { inst, out }; });
    assert.strictEqual(r.inst, 0, "los olivos del glb no se dibujan todavía");
    const conDato = r.out.filter(([, , h]) => h !== null);
    assert.ok(conDato.length >= 2, "el rayo no encuentra el relieve dibujado: " + JSON.stringify(r.out));
    // el terreno de la tesela visible frente al de la CPU: dentro del error de rejilla + simplificación de los niveles gruesos del fixture (≤ 1,3 m)
    for (const [x, y, h, s] of conDato) assert.ok(Math.abs(h - s) <= 1.5, "relieve dibujado en " + x + "," + y + ": " + h + " m; CPU " + s + " m");
  } finally { await p.close(); }
});

test("con ?escena=tiles y un tileset de otro host: se rechaza sin pedirlo y vuelve el Terreno de siempre", { timeout: 240000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  await prepara();
  const { p, errores } = await abre("&escena=tiles&tileset=" + encodeURIComponent("https://ejemplo.invalid/tileset.json"));
  try {
    const m = await escena(p, "lejos");
    assert.deepStrictEqual(errores, []);
    assert.strictEqual(m.escena3d.estado, "sin"); assert.match(m.escena3d.motivo, /mismo origen/);
    assert.ok(m.mallasTerreno > 0, "no volvió el Terreno de siempre");
  } finally { await p.close(); }
});
