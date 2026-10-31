"use strict";
// A4 en Chrome sin pantalla (SwiftShader: vale para recuentos, no para fps; regla 6), por el turno del banco (npm run banco:encarga; NO la ejecuta quien la escribe):
//   · con la api simulada (?api=/api/ y page.route: GET /api/hazas con 4 hazas del fixture de Hituelo, una tuya), el componente «lindes-hazas» (44_lindes.js)
//     dibuja el grupo «linde de las hazas» con DOS LineSegments2 de three (propias y ajenas): 2 llamadas y 6 triángulos por tramo, los contados en Node, de
//     lejos (la vista de arranque) y de cerca (cámara a 25 m de una linde); la propia más ancha que las ajenas; 0 errores (tampoco al tocar la pantalla,
//     que lanza el rayo de las hazas: la línea no se deja preguntar por rayos);
//   · ?lindes=0: las hazas siguen (Hazas, la ficha), sin dibujo: 0 llamadas;
//   · libera(): el grupo fuera de la escena y sus dos geometrías soltadas (renderer.info.memory);
//   · sin hazas (la api da 0), nada.
// No prueba: el parpadeo (z-fighting) ni la legibilidad, que son de ojo (capturas en pruebas/salida/capturas-lindes/ para Antonio); el ancho en unas gafas
// reales (el viewport por ojo solo lo da una sesión WebXR de verdad); ni iPhone ni Quest.
// Uso: node --test pruebas/guardianes/lindes_chrome.test.js (GEMELO_MIDE=1 imprime las cifras para MEDIDAS).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const MIDE = !!process.env.GEMELO_MIDE;
const SALTO = motivoSalto("las lindes de las hazas en navegador") || saltoPagina("las lindes de las hazas en navegador");
const CAPS = path.join(RAIZ, "pruebas", "salida", "capturas-lindes");
let srv, navegador, base, indice;
test.before(async () => {
  if (SALTO) return;
  const m = montaPagina({ finca: "hituelo" }); indice = m.indice;
  srv = await sirve(m.carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza(); fs.mkdirSync(CAPS, { recursive: true });
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

/** n hazas (como las da GET /api/hazas, contratos/api.openapi.yaml «Hazas») en rejilla alrededor del centro de la finca; la primera es tuya.
 *  Comparten lados (las vecinas): el componente los dibuja una vez. Nada de esto es real. */
function hazas(n) {
  const [cx, cy] = indice.centro_utm, f = indice.finca_id;
  const q = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  return { type: "FeatureCollection", srs: "EPSG:25830", features: Array.from({ length: n }, (_, i) => {
    const x0 = cx - 90 + 90 * (i % 2), y0 = cy - 70 + 70 * Math.floor(i / 2);
    return { type: "Feature", id: i + 1, geometry: { type: "MultiPolygon", coordinates: [[q(x0, y0, x0 + 90, y0 + 70)]] }, properties: { codigo: "H-P" + (i + 1), nombre: "Haza de prueba " + (i + 1), finca: f, es_mia: i === 0 } };
  }) };
}
async function abre(consulta, n) {
  const p = await navegador.newPage({ viewport: { width: 1000, height: 700 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  // con ?api= otros componentes (personalización, agenda, configuración) preguntan a una api que aquí no existe: sus 404 no son errores de esta prueba
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.route(/\/api\/hazas(\?|$)/, r => r.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify(hazas(n)) }));
  await p.route("**/api/config**", r => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0, null, { timeout: 60000, polling: 500 }).catch(() => {});
  await p.waitForTimeout(2500);
  return { p, errores };
}
// las llamadas y los triángulos de un grupo de la escena en un fotograma: se dibuja la escena con y sin él (renderer.info se pone a cero en cada render)
const coste = (p, nombre) => p.evaluate(nombre => {
  const g = window.__g, o = g.scene.getObjectByName(nombre); if (!o) return null;
  const mide = () => { g.renderer.render(g.scene, g.camera); return { l: g.renderer.info.render.calls, t: g.renderer.info.render.triangles }; };
  const v = o.visible; o.visible = true; const con = mide(); o.visible = false; const sin = mide(); o.visible = v;
  return { llamadas: con.l - sin.l, triangulos: con.t - sin.t, total: { llamadas: con.l, triangulos: con.t } };
}, nombre);
// la cámara a 25 m (en planta) del primer vértice de la linde propia, 12 m por encima, mirándolo (el bucle la devuelve luego: se mide en el acto)
const deCerca = p => p.evaluate(() => {
  const g = window.__g, o = g.scene.getObjectByName("lindes propias"), a = o.geometry.getAttribute("instanceStart").data.array, c = g.camera;
  c.position.set(a[0] - 25, a[1] + 12, a[2] + 5); c.lookAt(a[0], a[1], a[2]); c.updateMatrixWorld();
});

test("en Chrome: 4 hazas (una tuya) cuestan 2 llamadas y 6 triángulos por tramo, de lejos y de cerca; la propia más ancha; tocar la pantalla no da errores", { skip: SALTO || false, timeout: 600000 }, async () => {
  const { p, errores } = await abre("?api=/api/&debug", 4);
  try {
    await p.waitForFunction(() => window.__lindes && window.__lindes().llamadas > 0, null, { timeout: 30000, polling: 250 });
    const e = await p.evaluate(() => window.__lindes());
    const g = await p.evaluate(() => { const o = window.__g.scene.getObjectByName("linde de las hazas"); return o.children.map(x => ({ n: x.name, t: x.type, tramos: x.geometry.instanceCount, ancho: x.material.linewidth, transp: x.material.transparent })); });
    assert.deepStrictEqual(g.map(x => [x.n, x.t]), [["lindes propias", "LineSegments2"], ["lindes ajenas", "LineSegments2"]]);
    assert.ok(g[0].ancho > g[1].ancho && !g[0].transp && g[1].transp, JSON.stringify(g));
    // la rejilla de 2 × 2 hazas de 90 × 70 m: 12 lados distintos (los comunes una vez: 6 de 90 m y 6 de 70 m), 960 m de linde → 480 tramos de 2 m más
    // los cortes de tesela (unos pocos); de ellos, la propia: 320 m → 160
    assert.ok(Math.abs(e.longitud - 960) < 1e-6, "960 m de linde: " + e.longitud);
    assert.strictEqual(g[0].tramos + g[1].tramos, e.tramos.propia + e.tramos.ajena);
    assert.ok(e.tramos.propia >= 160 && e.tramos.propia <= 170 && e.tramos.propia + e.tramos.ajena >= 480 && e.tramos.propia + e.tramos.ajena <= 500, JSON.stringify(e.tramos));
    assert.strictEqual(e.acerca, true, "el sombreador de three tenía la línea de referencia");
    const lejos = await coste(p, "linde de las hazas");
    await p.screenshot({ path: path.join(CAPS, "lejos.png") });
    await deCerca(p); const cerca = await coste(p, "linde de las hazas");
    await p.evaluate(() => { const g = window.__g; g.renderer.render(g.scene, g.camera); }); await p.screenshot({ path: path.join(CAPS, "cerca.png") });
    const tri = 6 * (e.tramos.propia + e.tramos.ajena);
    for (const [k, c] of [["lejos", lejos], ["cerca", cerca]]) {
      assert.ok(c.llamadas >= 1 && c.llamadas <= 2, k + ": " + JSON.stringify(c));
      // instanciadas: o se dibujan enteras (6 por tramo) o no se dibujan (fuera de la vista)
      assert.ok(c.triangulos === tri || c.triangulos === 6 * e.tramos.propia || c.triangulos === 6 * e.tramos.ajena, k + ": " + c.triangulos + " frente a " + tri);
    }
    assert.strictEqual(lejos.llamadas, 2, "de lejos se ven las dos");
    // el toque en la pantalla: el rayo de las hazas va al suelo; la línea no se deja preguntar (LineSegments2 sin cámara en el rayo avisaría en la consola)
    await p.mouse.click(500, 350); await p.waitForTimeout(500);
    await p.waitForFunction(() => /Lindes: 2 llamadas/.test(document.body.innerText), null, { timeout: 10000, polling: 250 }).catch(() => {});
    assert.match(await p.evaluate(() => document.body.innerText), /Lindes: 2 llamadas · \d+ tramos · \d+ triángulos/, "la línea de ?debug");
    assert.deepStrictEqual(errores, []);
    if (MIDE) console.log("MEDIDO lindes " + JSON.stringify({ tramos: e.tramos, triangulos: e.triangulos, paso: e.paso, lejos, cerca }));
  } finally { await p.close(); }
});

test("en Chrome: ?lindes=0 deja las hazas sin dibujo; sin hazas, nada; libera() suelta el grupo y sus dos geometrías", { skip: SALTO || false, timeout: 600000 }, async () => {
  {
    const { p, errores } = await abre("?api=/api/&lindes=0", 4);
    try {
      const r = await p.evaluate(() => ({ comp: (window.__componentes() || []).find(c => c.id === "lindes-hazas"), gancho: typeof window.__lindes, grupo: !!window.__g.scene.getObjectByName("linde de las hazas") }));
      assert.deepStrictEqual([r.comp.activo, r.comp.origen, r.gancho, r.grupo], [false, "url", "undefined", false]);
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  }
  {
    const { p, errores } = await abre("?api=/api/", 0);
    try {
      const r = await p.evaluate(() => ({ e: window.__lindes && window.__lindes(), grupo: !!window.__g.scene.getObjectByName("linde de las hazas") }));
      assert.ok(r.e && r.e.llamadas === 0 && !r.grupo, JSON.stringify(r)); assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  }
  {
    const { p, errores } = await abre("?api=/api/", 4);
    try {
      await p.waitForFunction(() => window.__lindes && window.__lindes().llamadas === 2, null, { timeout: 30000, polling: 250 });
      const antes = await p.evaluate(() => window.__g.renderer.info.memory.geometries);
      await p.evaluate(() => window.__lindes("libera")); await p.waitForTimeout(300);
      const desp = await p.evaluate(() => { const g = window.__g; g.renderer.render(g.scene, g.camera); return { g: g.renderer.info.memory.geometries, grupo: !!g.scene.getObjectByName("linde de las hazas"), gancho: typeof window.__lindes }; });
      assert.deepStrictEqual([desp.grupo, desp.gancho], [false, "undefined"]); assert.strictEqual(antes - desp.g, 2, "las dos geometrías (propias y ajenas)");
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  }
});
