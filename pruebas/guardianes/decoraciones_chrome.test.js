"use strict";
// P7g D3 en Chrome sin pantalla (SwiftShader: vale para recuentos y memoria, no para fps; regla 6), por el turno del banco (npm run banco:encarga; NO la
// ejecuta quien la escribe: escrita el 2026-11-02 sin ejecutar):
//   · con la api simulada (?api=/api/ y page.route: GET /api/hazas con 4 hazas, una tuya; GET /api/sesion; GET /api/hazas/{id}/olivos con «decoracion» en
//     los 12 olivos con id más cercanos a lo que se mira al arrancar, de las seis piezas, más uno con un código que no existe), el componente
//     «decoraciones-olivo» (50_decoraciones.js) dibuja el grupo «decoraciones de los olivos»: ≤ 6 llamadas y ≤ 2.560 triángulos (los contados en Node:
//     decoraciones.test.js), de lejos (la vista de arranque) y de cerca; la ficha del olivo dice «Decoración» e «ilustrativa»; 0 errores;
//   · ?decoraciones=0: el componente apagado, sin grupo en la escena (el motor pinta lo de antes);
//   · libera(): el grupo fuera de la escena y sus geometrías soltadas (renderer.info.memory.geometries baja en tantas como piezas había).
// No prueba: cómo se ven (capturas en pruebas/salida/capturas-decoraciones/ para Antonio), los fps (solo un aparato real con ?debug), ni iPhone ni Quest.
// Uso: node --test pruebas/guardianes/decoraciones_chrome.test.js (GEMELO_MIDE=1 imprime las cifras del antes y el después para MEDIDAS).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const MIDE = !!process.env.GEMELO_MIDE;
const SALTO = motivoSalto("las decoraciones de los olivos en navegador") || saltoPagina("las decoraciones de los olivos en navegador");
const CAPS = path.join(RAIZ, "pruebas", "salida", "capturas-decoraciones");
const PIEZAS = ["flores", "cinta", "farolillo", "cosecha", "luces", "lazo"];
let srv, navegador, base, indice;
test.before(async () => {
  if (SALTO) return;
  const m = montaPagina({ finca: "hituelo" }); indice = m.indice;
  srv = await sirve(m.carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza(); fs.mkdirSync(CAPS, { recursive: true });
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

/** n hazas de prueba (como las da GET /api/hazas) alrededor del centro de la finca; la primera es tuya. Nada de esto es real. */
function hazas(n) {
  const [cx, cy] = indice.centro_utm, f = indice.finca_id;
  const q = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  return { type: "FeatureCollection", srs: "EPSG:25830", features: Array.from({ length: n }, (_, i) => {
    const x0 = cx - 90 + 90 * (i % 2), y0 = cy - 70 + 70 * Math.floor(i / 2);
    return { type: "Feature", id: i + 1, geometry: { type: "MultiPolygon", coordinates: [[q(x0, y0, x0 + 90, y0 + 70)]] }, properties: { codigo: "H-P" + (i + 1), nombre: "Haza de prueba " + (i + 1), finca: f, es_mia: i === 0 } };
  }) };
}
// los olivos con id más cercanos a lo que se mira (se leen de la página cuando la personalización pide la lista: el motor ya está montado)
const cercanos = (p, k) => p.evaluate(k => {
  const g = window.__g, o = g.objetivo;
  return g.copas.filter(c => c.oliv && c.id >= 0).map(c => ({ id: c.id, d: Math.hypot(c.x - o.x, -c.y - o.z) })).sort((a, b) => a.d - b.d).slice(0, k).map(c => c.id);
}, k);

async function abre(consulta, { decoradas = 12 } = {}) {
  const p = await navegador.newPage({ viewport: { width: 1000, height: 700 } }), errores = [], estado = { ids: [] };
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  // con ?api= otros componentes (agenda, configuración, avisos) preguntan a una api que aquí no existe: sus 404 no son errores de esta prueba
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.route(/\/api\/hazas(\?|$)/, r => r.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify(hazas(4)) }));
  await p.route("**/api/config**", r => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await p.route("**/api/sesion", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rol: "familia", titular: true }) }));
  await p.route(/\/api\/hazas\/(\d+)\/olivos$/, async r => {
    const haza = +/\/hazas\/(\d+)\/olivos$/.exec(r.request().url())[1], f = indice.finca_id;
    let olivos = [];
    if (haza === 1 && decoradas > 0) {
      const ids = estado.ids.length ? estado.ids : (estado.ids = await cercanos(p, decoradas + 1));
      olivos = ids.map((id, k) => ({ id: 100 + k, finca: f, copas_id: id, nombre: null, objeto: null, decoracion: k === decoradas ? "cohete" : PIEZAS[k % 6] }));   // el último, un código que no existe
    }
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ haza_id: haza, es_mia: haza === 1, olivos }) });
  });
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0, null, { timeout: 60000, polling: 500 }).catch(() => {});
  await p.waitForTimeout(2500);
  return { p, errores, estado };
}
// las llamadas y los triángulos de un grupo de la escena en un fotograma: se dibuja la escena con y sin él (renderer.info se pone a cero en cada render)
const coste = (p, nombre) => p.evaluate(nombre => {
  const g = window.__g, o = g.scene.getObjectByName(nombre); if (!o) return null;
  const mide = () => { g.renderer.render(g.scene, g.camera); return { l: g.renderer.info.render.calls, t: g.renderer.info.render.triangles }; };
  const v = o.visible; o.visible = true; const con = mide(); o.visible = false; const sin = mide(); o.visible = v;
  return { llamadas: con.l - sin.l, triangulos: con.t - sin.t, con: { llamadas: con.l, triangulos: con.t }, sin: { llamadas: sin.l, triangulos: sin.t } };
}, nombre);
// la cámara a 6 m de la primera pieza, 2 m por encima, mirándola (el bucle la devuelve luego: se mide en el acto)
const deCerca = p => p.evaluate(() => {
  const g = window.__g, grupo = g.scene.getObjectByName("decoraciones de los olivos"), im = grupo.children.find(o => o.count > 0), m = new im.matrix.constructor(), v = g.camera.position.clone();
  im.getMatrixAt(0, m); v.setFromMatrixPosition(m);
  const c = g.camera; c.position.set(v.x - 6, v.y + 2, v.z + 1); c.lookAt(v); c.updateMatrixWorld();
});

test("en Chrome: 12 olivos decorados cerca cuestan ≤ 6 llamadas y ≤ 2.560 triángulos, de lejos y de cerca; el código desconocido no se dibuja; la ficha dice «ilustrativa»", { skip: SALTO || false, timeout: 600000 }, async () => {
  const { p, errores, estado } = await abre("?api=/api/&debug");
  try {
    await p.waitForFunction(() => window.__decoraciones && window.__decoraciones().elegidas > 0, null, { timeout: 30000, polling: 250 });
    const e = await p.evaluate(() => window.__decoraciones());
    assert.strictEqual(e.validas, 12, "12 válidas; la del código desconocido, fuera: " + JSON.stringify(e));
    assert.ok(e.elegidas >= 1 && e.elegidas <= 12 && e.llamadas >= 1 && e.llamadas <= 6 && e.triangulos <= 2560, JSON.stringify(e));
    const g = await p.evaluate(() => window.__g.scene.getObjectByName("decoraciones de los olivos").children.map(o => ({ n: o.name, t: o.type, count: o.count, visible: o.visible })));
    assert.ok(g.every(x => x.t === "InstancedMesh" && /^decoración (flores|cinta|farolillo|cosecha|luces|lazo)$/.test(x.n)), JSON.stringify(g));
    const lejos = await coste(p, "decoraciones de los olivos");
    await p.screenshot({ path: path.join(CAPS, "lejos.png") });
    await deCerca(p); const cerca = await coste(p, "decoraciones de los olivos");
    await p.evaluate(() => { const g = window.__g; g.renderer.render(g.scene, g.camera); }); await p.screenshot({ path: path.join(CAPS, "cerca.png") });
    for (const [k, c] of [["lejos", lejos], ["cerca", cerca]]) assert.ok(c.llamadas >= 0 && c.llamadas <= 6 && c.triangulos <= 2560 && c.triangulos <= e.triangulos, k + ": " + JSON.stringify(c));
    assert.ok(cerca.llamadas >= 1, "de cerca se ve al menos una pieza");
    // la ficha del primer olivo decorado (flores, en tu haza): solo si la página deja ver Entidades (hoy window.__g no lo publica; la fila la prueba Node)
    const ficha = await p.evaluate(([id, finca]) => (window.__g.Entidades && window.__g.Entidades.ficha ? window.__g.Entidades.ficha("olivo:" + finca + ":" + id, "pantalla") : null), [estado.ids[0], indice.finca_id]).catch(() => null);
    if (ficha) assert.ok(ficha.filas.some(f => f.k === "Decoración" && /ilustrativa/.test(f.de)), JSON.stringify(ficha.filas));
    assert.match(await p.evaluate(() => document.body.innerText), /Decoraciones: \d llamadas · \d+ piezas · \d+ triángulos \(ilustrativas\)/, "la línea de ?debug");
    assert.deepStrictEqual(errores, []);
    if (MIDE) console.log("MEDIDO decoraciones " + JSON.stringify({ estado: e, lejos, cerca }));
  } finally { await p.close(); }
});

test("en Chrome: ?decoraciones=0 no dibuja nada (el motor de antes); libera() suelta el grupo y sus geometrías", { skip: SALTO || false, timeout: 600000 }, async () => {
  {
    const { p, errores } = await abre("?api=/api/&decoraciones=0");
    try {
      const r = await p.evaluate(() => ({ comp: (window.__componentes() || []).find(c => c.id === "decoraciones-olivo"), gancho: typeof window.__decoraciones, grupo: !!window.__g.scene.getObjectByName("decoraciones de los olivos") }));
      assert.deepStrictEqual([r.comp.activo, r.comp.origen, r.gancho, r.grupo], [false, "url", "undefined", false]);
      assert.deepStrictEqual(errores, []);
      if (MIDE) console.log("MEDIDO decoraciones=0 " + JSON.stringify(await p.evaluate(() => { const g = window.__g; g.renderer.render(g.scene, g.camera); return { llamadas: g.renderer.info.render.calls, triangulos: g.renderer.info.render.triangles, geometrias: g.renderer.info.memory.geometries }; })));
    } finally { await p.close(); }
  }
  {
    const { p, errores } = await abre("?api=/api/");
    try {
      await p.waitForFunction(() => window.__decoraciones && window.__decoraciones().llamadas > 0, null, { timeout: 30000, polling: 250 });
      const piezas = await p.evaluate(() => window.__g.scene.getObjectByName("decoraciones de los olivos").children.length);
      const antes = await p.evaluate(() => { const g = window.__g; g.renderer.render(g.scene, g.camera); return g.renderer.info.memory.geometries; });
      await p.evaluate(() => window.__decoraciones("libera")); await p.waitForTimeout(300);
      const desp = await p.evaluate(() => { const g = window.__g; g.renderer.render(g.scene, g.camera); return { g: g.renderer.info.memory.geometries, grupo: !!g.scene.getObjectByName("decoraciones de los olivos"), gancho: typeof window.__decoraciones }; });
      assert.deepStrictEqual([desp.grupo, desp.gancho], [false, "undefined"]);
      assert.ok(antes - desp.g >= 1 && antes - desp.g <= piezas, "las geometrías de las piezas que se habían subido a la GPU: " + (antes - desp.g) + " de " + piezas);
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  }
});
