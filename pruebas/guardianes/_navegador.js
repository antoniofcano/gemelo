// Utilidades de navegador de los guardianes: servidor estático mínimo y medida de una página del gemelo con escenarios fijos.
// SwiftShader vale para contar llamadas, triángulos, puntos y memoria; NO para fps (doc/operacion/TESTING.md).
// Banco de pruebas (TESTING.md §«Banco de pruebas»): un solo Chrome sin pantalla a la vez en el equipo. Con GEMELO_CHROME_WS (lo pone
// `npm run puerta`) todas las pruebas se conectan al MISMO Chrome; sin él, `lanza()` pide el turno (pruebas/banco/turno.js) y lo suelta al cerrar.
"use strict";
const http = require("http");
const { chrome, playwright, python, fs, path } = require("./_util");

const TIPOS = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".js": "text/javascript", ".css": "text/css" };
const ESPERA_MS = Number(process.env.GEMELO_ESPERA || 45000);
const ESPERA_GEN_MS = Number(process.env.GEMELO_ESPERA_GEN || 180000);   // con ?olivos=gen, lo que se espera a los generados en un escenario (en SwiftShader, una receta E0 tarda decenas de s)
const TOPE_MEDIDA_MS = Number(process.env.GEMELO_TOPE_MEDIDA || 240000);   // una medida entera (carga + escenarios); si se pasa, sale «parcial»
const ARGS_CHROME = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--enable-precise-memory-info"];
const ESCENARIOS = {
  lejos: { az: -0.55, el: 0.62, dist: 600, ox: 0, oy: -130, modo: "gem" },
  cerca: { az: -0.4, el: 0.5, dist: 45, ox: -130, oy: -125, modo: "gem" },
  nube: { az: -0.55, el: 0.62, dist: 350, ox: 0, oy: -130, modo: "nube" },
};
// Escenarios del PASEO (opcionales: no están en ESCENARIOS, así que las rondas de siempre no cambian). Se piden por nombre (--escenarios paseo,paseoAnda).
// paseo: entra en (x, y) del fixture (cerca de los olivos del escenario «cerca»), mirando a ang; anda: s segundos con la tecla de avance; gira: vuelta completa en el sitio.
const ESCENARIOS_PASEO = {
  paseo: { paseo: { x: -130, y: -125, ang: 0 } },
  paseoAnda: { paseo: { x: -130, y: -125, ang: 0, anda: 6 } },
  paseoGira: { paseo: { x: -130, y: -125, ang: 0, gira: true } },
};
const TODOS_ESCENARIOS = Object.assign({}, ESCENARIOS, ESCENARIOS_PASEO);

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

/** El Chrome de las pruebas: el compartido de la puerta si lo hay; si no, uno propio dentro del turno (close() lo cierra y suelta el turno) */
async function lanza() {
  const pw = playwright().chromium;
  if (process.env.GEMELO_CHROME_WS) return pw.connect(process.env.GEMELO_CHROME_WS);
  const suelta = await require("../banco/turno").pide("chrome: " + path.basename(process.argv[1] || "prueba"));
  try {
    const nav = await pw.launch({ executablePath: chrome(), args: ARGS_CHROME }), cierra = nav.close.bind(nav);
    nav.close = async () => { try { await cierra(); } finally { await suelta(); } };
    return nav;
  } catch (e) { await suelta(); throw e; }
}

/** Desglose de las llamadas de dibujo de UN fotograma, por objeto (en la página: p.evaluate(desgloseLlamadas)). Envuelve
 *  renderer.renderBufferDirect (por donde pasan la pasada principal y la de sombras de three 0.186.1; en la de sombras scene === null) durante
 *  un fotograma y agrupa por «pasada · #i hijo de la escena [pista] › objeto · material». La pista dice si el hijo es el grupo de la escena
 *  3D Tiles, el del Terreno o el de los árboles; el resto, por su posición en scene.children (el orden de montaje de apps/web/motor/).
 *  Devuelve { total, info, filas: [[clave, llamadas]] } (info = renderer.info.render.calls del mismo fotograma, para contrastar). */
function desgloseLlamadas() {
  const g = window.__g, R = g.renderer, S = g.scene, orig = R.renderBufferDirect, cuenta = {};
  const tiles = g.Escena3D && g.Escena3D.grupo ? g.Escena3D.grupo() : null, pista = t => t === tiles ? " [3dtiles]" : t === g.Terreno.grupo ? " [terreno]" : g.Arboles && g.Arboles.grupo === t ? " [arboles]" : "";
  const arriba = o => { let p = o; while (p.parent && p.parent !== S) p = p.parent; return p; };
  const nombre = o => (o.name ? o.name + ":" : "") + o.type;
  const espia = function (cam, sc, geo, mat, obj) {
    const t = arriba(obj), k = (sc === null ? "sombra" : "principal") + " · #" + S.children.indexOf(t) + " " + nombre(t) + pista(t) + (t === obj ? "" : " › " + nombre(obj)) + " · " + (mat && mat.type);
    cuenta[k] = (cuenta[k] || 0) + 1;
    return orig.apply(this, arguments);
  };
  // se pone en un requestAnimationFrame (detrás del del motor, que ya ha dibujado ese fotograma) y se quita en el siguiente: un fotograma justo
  return new Promise(ok => requestAnimationFrame(() => { R.renderBufferDirect = espia; requestAnimationFrame(() => {
    R.renderBufferDirect = orig;
    const filas = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
    ok({ total: filas.reduce((s, f) => s + f[1], 0), info: R.info.render.calls, filas });
  }); }));
}

/** Paseo: entra en el punto, deja asentar la transición y, si se pide, anda `anda` s en línea recta o gira 360° (teclas simuladas por __g.paseoTecla) */
async function entraYMueve(p, c, queda) {
  await p.evaluate(c => window.__g.paseoEn(c.x, c.y, c.ang), c);
  await p.waitForTimeout(1500);
  if (c.anda) { await p.evaluate(() => window.__g.paseoTecla("up", true)); await p.waitForTimeout(c.anda * 1000); await p.evaluate(() => window.__g.paseoTecla("up", false)); }
  if (c.gira) {
    const a0 = await p.evaluate(() => window.__g.paseoEstado().ang);
    await p.evaluate(() => window.__g.paseoTecla("right", true));
    await p.waitForFunction(a => Math.abs(window.__g.paseoEstado().ang - a) >= 2 * Math.PI, a0, { timeout: Math.min(60000, queda()), polling: 250 }).catch(() => {});
    await p.evaluate(() => window.__g.paseoTecla("right", false));
  }
}

/** Abre una URL, espera a __g.listo() y mide cada escenario. Devuelve { errores, fallos, medidas, parcial }.
 *  Con un tope (GEMELO_TOPE_MEDIDA, ms): si se pasa, devuelve lo medido hasta entonces con parcial = true (y no deja la página colgada).
 *  Con desglose: además, las llamadas de un fotograma por objeto (desgloseLlamadas) en cada escenario. */
async function mide(navegador, url, { escenarios = ESCENARIOS, tope = TOPE_MEDIDA_MS, capturas = null, desglose = false } = {}) {   // capturas: carpeta para un PNG por escenario
  const p = await navegador.newPage({ viewport: { width: 900, height: 650 } }), errores = [], fallos = [], t0 = Date.now(), queda = () => Math.max(1000, tope - (Date.now() - t0));
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
  p.on("requestfailed", r => fallos.push(r.url()));
  p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
  const medidas = {};
  let parcial = false;
  try {
  await p.goto(url + (url.includes("?") ? "&" : "?") + "debug");
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: Math.min(ESPERA_MS, queda()) });
  for (const [nombre, e] of Object.entries(escenarios)) {
    if (Date.now() - t0 > tope) { parcial = true; break; }
    if (e.paseo) await entraYMueve(p, e.paseo, queda); else await p.evaluate(() => window.__g.paseoSale && window.__g.paseoSale());
    if (!e.paseo) await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
    // la Cola y, con ?olivos=gen, la cola propia de los generados (que en SwiftShader tarda más: ESPERA_GEN_MS); si no termina, se mide igual y se dice
    const t1 = Date.now(), conGen = await p.evaluate(() => !!(window.__g.Generados && window.__g.Generados.activo()));
    const acabo = await p.waitForFunction(() => (window.__g.pendientes ? window.__g.pendientes() : window.__g.Cola.pendientes()) === 0, null, { timeout: Math.min(conGen ? ESPERA_GEN_MS : ESPERA_MS, queda()), polling: 500 }).then(() => true, () => false);
    await p.waitForTimeout(1500);
    medidas[nombre] = await p.evaluate(() => { const g = window.__g, r = g.renderer.info; return { llamadas: r.render.calls, triangulos: r.render.triangles, puntos: r.render.points, geometrias: r.memory.geometries, texturas: r.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, olivos: g.Arboles.resumen(), generados: window.__olivosGen ? window.__olivosGen() : undefined, paseo: g.paseoEstado && g.paseoEstado().paseando ? g.paseoEstado() : undefined, vrm: window.__presencia && window.__presencia().vrm || undefined }; });   // vrm: avatares VRM (P7c), solo con presencia
    medidas[nombre].espera = { ms: Date.now() - t1, termino: acabo, pendientes: await p.evaluate(() => window.__g.pendientes ? window.__g.pendientes() : window.__g.Cola.pendientes()) };
    if (desglose) medidas[nombre].desglose = await p.evaluate(desgloseLlamadas);
    if (desglose) medidas[nombre].escena3d = await p.evaluate(() => window.__g.Escena3D ? window.__g.Escena3D.resumen() : null);
    if (capturas) { fs.mkdirSync(capturas, { recursive: true }); await p.screenshot({ path: path.join(capturas, nombre + ".png") }); }
  }
  } catch (e) { if (Date.now() - t0 < tope) throw e; parcial = true; errores.push("TOPE " + Math.round(tope / 1000) + " s: " + String(e.message).slice(0, 200)); }
  finally { await p.close().catch(() => {}); }
  return { errores, fallos, medidas, parcial };
}

module.exports = { ESCENARIOS, ESCENARIOS_PASEO, TODOS_ESCENARIOS, ARGS_CHROME, sirve, motivoSalto, lanza, mide, desgloseLlamadas };
