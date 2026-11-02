"use strict";
// P7g D3 en Chrome sin pantalla (SwiftShader: vale para recuentos y memoria, no para fps; regla 6), por el turno del banco (npm run banco:encarga; NO la
// ejecuta quien la escribe: escrita el 2026-11-02 sin ejecutar):
//   · con la api simulada (?api=/api/ y page.route: GET /api/hazas con 4 hazas, las mitades de las dos parcelas del fixture, una tuya; GET /api/sesion; GET /api/hazas/{id}/olivos con «decoracion» en
//     los 12 olivos más cercanos al centro de H-P1 (la vista se lleva allí: al arrancar se mira al centro de la finca, a > 80 m de todo olivo), de las seis piezas, más uno con un código que no existe), el componente
//     «decoraciones-olivo» (50_decoraciones.js) dibuja el grupo «decoraciones de los olivos»: ≤ 6 llamadas y ≤ 2.560 triángulos (los contados en Node:
//     decoraciones.test.js), de lejos (la distancia de la vista de arranque) y de cerca; la ficha del olivo dice «Decoración» e «ilustrativa»; 0 errores;
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

/** las cajas (coordenadas locales) de las 4 hazas de prueba, sacadas de las parcelas del fixture como en personalizacion_e2e.test.js: la mitad oeste y la
 *  este de las dos primeras parcelas (en el fixture de hituelo los olivos están en las parcelas, no en el centro de la finca). La primera (H-P1) es tuya. */
function cajas() {
  const out = [];
  indice.parcelas.slice(0, 2).forEach(p => {
    const xs = p.linde.map(q => q[0]), ys = p.linde.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), xm = (x0 + x1) / 2;
    out.push([x0, y0, xm, y1], [xm, y0, x1, y1]);
  });
  return out;
}
/** las hazas de prueba como las da GET /api/hazas (EPSG:25830). Nada de esto es real. */
function hazas() {
  const [cx, cy] = indice.centro_utm, f = indice.finca_id;
  const q = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  return { type: "FeatureCollection", srs: "EPSG:25830", features: cajas().map(([x0, y0, x1, y1], i) =>
    ({ type: "Feature", id: i + 1, geometry: { type: "MultiPolygon", coordinates: [[q(cx + x0, cy + y0, cx + x1, cy + y1)]] }, properties: { codigo: "H-P" + (i + 1), nombre: "Haza de prueba " + (i + 1), finca: f, es_mia: i === 0 } })) };
}
// el punto que se mira en la prueba: el centro de H-P1 (coordenadas locales x, y norte). Al arrancar, la vista aérea mira al centro de la finca y en el fixture de
// hituelo el olivo más cercano está a más de CERCA_M (80 m) de ahí, así que de arranque no se dibuja ninguna decoración (es lo decidido: solo las cercanas al foco).
const centroH1 = () => { const [x0, y0, x1, y1] = cajas()[0]; return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }; };
// los k olivos más cercanos al centro de H-P1 (se leen de la página cuando la personalización pide la lista: el motor ya está montado)
const cercanos = (p, k) => p.evaluate(([k, o]) => {
  const g = window.__g;
  return g.copas.filter(c => c.oliv && c.id >= 0).map(c => ({ id: c.id, d: Math.hypot(c.x - o.x, c.y - o.y) })).sort((a, b) => a.d - b.d).slice(0, k).map(c => c.id);
}, [k, centroH1()]);
// mira al centro de H-P1 desde lejos (la distancia de la vista de arranque: el foco de la vista aérea es lo que se mira, no la cámara)
const miraH1 = p => p.evaluate(o => { const g = window.__g; g.objetivo.x = o.x; g.objetivo.z = -o.y; g.objetivo.y = g.suelo(o.x, o.y); g.pon("gem"); }, centroH1());

async function abre(consulta, { decoradas = 12 } = {}) {
  const p = await navegador.newPage({ viewport: { width: 1000, height: 700 } }), errores = [], estado = { ids: [] };
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  // con ?api= otros componentes (agenda, configuración, avisos) preguntan a una api que aquí no existe: sus 404 no son errores de esta prueba
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.route(/\/api\/hazas(\?|$)/, r => r.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify(hazas()) }));
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
  await miraH1(p);
  await p.waitForTimeout(2500);
  return { p, errores, estado };
}
// las llamadas y los triángulos de un grupo de la escena en un fotograma: se dibuja la escena con y sin él (renderer.info se pone a cero en cada render).
// Con cerca, la cámara se pone antes a 6 m de la primera pieza, 2 m por encima, mirándola, y se devuelve donde estaba al acabar: TODO en la misma evaluación,
// porque el bucle del motor recoloca la cámara en el fotograma siguiente (medir en otra evaluación mediría la vista de antes). Devuelve también la imagen
// de ese fotograma (toDataURL justo después de dibujar, en la misma tarea) para la captura.
const coste = (p, nombre, cerca) => p.evaluate(([nombre, cerca]) => {
  const g = window.__g, o = g.scene.getObjectByName(nombre); if (!o) return null;
  const c = g.camera, pos = c.position.clone(), rot = c.quaternion.clone();
  if (cerca) {
    // desde fuera de la copa: la pieza mira hacia su +x local (girada por su matriz), así que la cámara se pone 6 m en esa dirección
    const im = o.children.find(x => x.count > 0), m = new im.matrix.constructor(), v = c.position.clone(), fuera = c.position.clone().set(1, 0, 0), qq = c.quaternion.clone(), s = c.position.clone();
    im.getMatrixAt(0, m); m.decompose(v, qq, s); fuera.applyQuaternion(qq);
    c.position.set(v.x + fuera.x * 6, v.y + 2, v.z + fuera.z * 6); c.lookAt(v); c.updateMatrixWorld();
  }
  const mide = () => { g.renderer.render(g.scene, c); return { l: g.renderer.info.render.calls, t: g.renderer.info.render.triangles }; };
  const v = o.visible; o.visible = false; const sin = mide(); o.visible = true; const con = mide(); const imagen = g.renderer.domElement.toDataURL("image/png"); o.visible = v;
  c.position.copy(pos); c.quaternion.copy(rot); c.updateMatrixWorld();
  return { llamadas: con.l - sin.l, triangulos: con.t - sin.t, con: { llamadas: con.l, triangulos: con.t }, sin: { llamadas: sin.l, triangulos: sin.t }, imagen };
}, [nombre, !!cerca]);
const guardaImagen = (c, fichero) => { fs.writeFileSync(path.join(CAPS, fichero), Buffer.from(c.imagen.split(",")[1], "base64")); delete c.imagen; };

test("en Chrome: 12 olivos decorados cerca cuestan ≤ 6 llamadas y ≤ 2.560 triángulos, de lejos y de cerca; el código desconocido no se dibuja; la ficha dice «ilustrativa»", { skip: SALTO || false, timeout: 600000 }, async () => {
  const { p, errores, estado } = await abre("?api=/api/&debug");
  try {
    await p.waitForFunction(() => window.__decoraciones && window.__decoraciones().elegidas > 0, null, { timeout: 30000, polling: 250 });
    const e = await p.evaluate(() => window.__decoraciones());
    assert.strictEqual(e.validas, 12, "12 válidas; la del código desconocido, fuera: " + JSON.stringify(e));
    assert.ok(e.elegidas >= 1 && e.elegidas <= 12 && e.llamadas >= 1 && e.llamadas <= 6 && e.triangulos <= 2560, JSON.stringify(e));
    const g = await p.evaluate(() => window.__g.scene.getObjectByName("decoraciones de los olivos").children.map(o => ({ n: o.name, inst: o.isInstancedMesh === true, count: o.count, visible: o.visible })));   // en three 0.186 una InstancedMesh tiene type «Mesh»: se mira isInstancedMesh
    assert.ok(g.every(x => x.inst && /^decoración (flores|cinta|farolillo|cosecha|luces|lazo)$/.test(x.n)), JSON.stringify(g));
    const lejos = await coste(p, "decoraciones de los olivos"); guardaImagen(lejos, "lejos.png");
    await p.screenshot({ path: path.join(CAPS, "lejos-pagina.png") });
    const cerca = await coste(p, "decoraciones de los olivos", true); guardaImagen(cerca, "cerca.png");
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
