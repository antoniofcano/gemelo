"use strict";
// OF10 en Chrome sin pantalla (SwiftShader: vale para recuentos y sitios, no para fps; regla 6), por el turno del banco (una sola prueba pesada a la vez):
//   · la oficina en la simulación (?presencia=sim&oficial=1): el primero lleva chaleco e insignia y su etiqueta «◆ Oficina»; cuesta UNA caja más del
//     instanciado del sombrero (0 llamadas nuevas) frente a la misma simulación sin oficina;
//   · las balizas oficiales con la api simulada (?api=/api/ y page.route: GET /api/balizas-oficiales): se dibujan las que vienen, cuestan 2 llamadas
//     (columna y bandera instanciadas) tengas 2 o 20, y sus triángulos son los contados en Node (32 por baliza); sin balizas, 0 llamadas; libera() las suelta;
//   · el tipo «baliza-oficial» sale en Entidades con su ficha (sin «Quitar»: sin sala no eres oficina).
// No prueba: la sala de verdad con LiveKit (anuncio, invitación, panel de la oficina): eso es presencia_dev.test.js con Docker; ni iPhone ni Quest reales.
// Uso: node --test pruebas/guardianes/oficina_mundo_chrome.test.js (GEMELO_MIDE=1 imprime las cifras para MEDIDAS).
const test = require("node:test"), assert = require("node:assert");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const MIDE = !!process.env.GEMELO_MIDE;
const SALTO = motivoSalto("la oficina en el mundo en navegador") || saltoPagina("la oficina en el mundo en navegador");
let srv, navegador, base, indice;
test.before(async () => {
  if (SALTO) return;
  const m = montaPagina({ finca: "hituelo" }); indice = m.indice;
  srv = await sirve(m.carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

/** n balizas oficiales alrededor del centro de la finca, como las da la api */
function balizas(n) {
  const c = indice.centro_utm, f = indice.finca_id;
  return { finca: f, srs: "EPSG:25830", balizas: Array.from({ length: n }, (_, i) => ({ id: i + 1, finca: f, x: c[0] + 20 * (i % 5) - 40, y: c[1] + 20 * Math.floor(i / 5) - 40, titulo: "Baliza " + (i + 1), texto: i ? null : "Aquí se recoge hoy", hasta: "2030-01-01T10:00:00Z" })) };
}
async function abre(consulta, n) {
  const p = await navegador.newPage({ viewport: { width: 1000, height: 700 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  // con ?api= otros componentes (personalización, configuración) preguntan a una api que aquí no existe: sus 404 no son errores de esta prueba
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.route("**/api/balizas-oficiales**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(balizas(n || 0)) }));
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
  return { llamadas: con.l - sin.l, triangulos: con.t - sin.t };
}, nombre);

test("en Chrome: las balizas oficiales cuestan 2 llamadas tengas 2 o 20 y 32 triángulos cada una; sin balizas, nada; libera() las suelta", { skip: SALTO || false, timeout: 600000 }, async () => {
  const res = {};
  for (const n of [0, 2, 20]) {
    const { p, errores } = await abre("?api=/api/&debug", n);
    try {
      const e = await p.evaluate(() => window.__oficinaMundo && window.__oficinaMundo());
      assert.ok(e, "el componente oficina-mundo montado");
      assert.strictEqual(e.balizas.length, n, "las balizas que da la api"); assert.strictEqual(e.panel, false, "sin sala no hay panel de oficina");
      const c = await coste(p, "balizas-oficiales");
      if (n === 0) assert.strictEqual(c, null, "sin balizas, ni el grupo"); else {
        assert.deepStrictEqual(e.mallas, [n, n]);
        // con la cámara de arranque se ven todas o casi (frustumCulled está apagado en las instanciadas): 2 llamadas
        assert.strictEqual(c.llamadas, 2, JSON.stringify(c)); assert.strictEqual(c.triangulos, 32 * n, JSON.stringify(c));
      }
      res[n] = c;
      if (n === 2) {   // libera(): el grupo fuera de la escena y sus dos geometrías soltadas
        const antes = await p.evaluate(() => window.__g.renderer.info.memory.geometries);
        await p.evaluate(() => window.__oficinaMundo("libera")); await p.waitForTimeout(300);
        const desp = await p.evaluate(() => ({ g: window.__g.renderer.info.memory.geometries, grupo: !!window.__g.scene.getObjectByName("balizas-oficiales"), gancho: typeof window.__oficinaMundo }));
        assert.deepStrictEqual([desp.grupo, desp.gancho], [false, "undefined"]); assert.strictEqual(antes - desp.g, 2, "las dos geometrías (columna y bandera)");
      }
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  }
  if (MIDE) console.log("MEDIDO balizas-oficiales " + JSON.stringify(res));
});

test("en Chrome: la oficina en la simulación lleva chaleco e insignia (una caja más, 0 llamadas nuevas) y su etiqueta; sin errores", { skip: SALTO || false, timeout: 600000 }, async () => {
  const m = {};
  for (const [k, q] of [["sin", "?presencia=sim&n=6&aspecto=0"], ["con", "?presencia=sim&n=6&aspecto=0&oficial=1"]]) {
    const { p, errores } = await abre(q, 0);
    try {
      const pres = await p.evaluate(() => window.__presencia());
      assert.strictEqual(pres.activo, true); assert.strictEqual(pres.vistos, 6);
      m[k] = { cajas: pres.aspecto.cajas, coste: await coste(p, "presencia") };
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  }
  if (MIDE) console.log("MEDIDO oficina en la simulación " + JSON.stringify(m));
  assert.strictEqual(m.con.cajas, m.sin.cajas + 1, "la insignia: una caja más del instanciado del sombrero");
  assert.strictEqual(m.con.coste.llamadas, m.sin.coste.llamadas, "0 llamadas nuevas");
  assert.strictEqual(m.con.coste.triangulos - m.sin.coste.triangulos, 12, "una caja: 12 triángulos");
});
