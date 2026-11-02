"use strict";
// F3j en Chrome sin pantalla (SwiftShader: vale para recuentos, no para fps; regla 6), por el turno del banco. Con la api de mentira (page.route sobre
// /api/presencia/voz/consentimiento) en la página estática con ?api=/api/ (como agenda_mundo_chrome): sin servidor no se pregunta nada (lo comprueba la tercera prueba):
//   · fuera de una visita guiada, el componente «habla-guiada» mira UNA vez el consentimiento de voz (GET); si ya está dado, la pestaña «Hablar» de Configuración
//     existe y trae el botón «Retirar mi permiso de voz» activo; pulsarlo manda DELETE, deja el botón desactivado con «Permiso de voz: no dado» y no hay errores;
//   · si no está dado, no hay pestaña (no se ensucia la Configuración de quien nunca habla);
//   · el dibujo (llamadas y triángulos de un fotograma) es el mismo con el componente apagado (?habla=0): el DOM no dibuja;
//   · 0 errores de consola.
// NO prueba (queda para una visita real con LiveKit, o voz_guiada_dev.test.js, y para una persona con un dispositivo): el aviso dentro de una sala guiada (foco real,
// Esc, el lector de pantalla, el tamaño real de los botones), la lámina de VR del aviso ni el panel de VR; ni iPhone ni Quest.
// Uso: node --test pruebas/guardianes/habla_consentimiento_chrome.test.js (GEMELO_MIDE=1 imprime las cifras).
const test = require("node:test"), assert = require("node:assert");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const MIDE = !!process.env.GEMELO_MIDE;
const SALTO = motivoSalto("consentimiento de voz en navegador") || saltoPagina("consentimiento de voz en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  srv = await sirve(montaPagina({ finca: "hituelo" }).carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

// una página con la api del consentimiento de mentira: `estado.aceptada` manda y las peticiones quedan en `visto`
async function abre(consulta, estado) {
  const p = await navegador.newPage({ viewport: { width: 1000, height: 700 } }), errores = [], visto = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|favicon|AudioContext/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.route("**/api/presencia/voz/consentimiento", ruta => {
    const m = ruta.request().method(); visto.push(m);
    if (m === "DELETE") { estado.aceptada = false; return ruta.fulfill({ status: 204 }); }
    return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 1, aceptada: !!estado.aceptada, version_aceptada: estado.aceptada ? 1 : null, aceptada_en: null }) });
  });
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  await p.waitForFunction(() => { const g = window.__g, E = g.Escena3D; return g.pendientes() === 0 && (!E || E.resumen().estado !== "activo" || E.listo()); }, null, { timeout: 120000, polling: 500 });
  await p.waitForTimeout(1500);
  return { p, errores, visto };
}
const dibujo = p => p.evaluate(() => { const g = window.__g; g.renderer.render(g.scene, g.camera); return { llamadas: g.renderer.info.render.calls, triangulos: g.renderer.info.render.triangles }; });
// PB10: «cola vacía y Escena3D lista» no basta: las teselas y sus niveles de detalle siguen entrando fotograma a fotograma, y dos páginas medidas en etapas distintas
// de esa carga (28/21.374 frente a 27/9.530) no son comparables. Se mide cuando el dibujo está QUIETO de verdad: lo mismo en `n` lecturas seguidas, separadas por
// `cadaMs`, con la cola aún vacía. Si no se aquieta en `maxMs`, falla con las lecturas (no se compara lo que aún se mueve).
async function dibujoQuieto(p, { n = 4, cadaMs = 800, maxMs = 90000 } = {}) {
  const t0 = Date.now(), lecturas = [];
  for (;;) {
    const pend = await p.evaluate(() => window.__g.pendientes()), d = await dibujo(p);
    lecturas.push(pend === 0 ? d : null);
    const u = lecturas.slice(-n);
    if (u.length === n && u.every(x => x && x.llamadas === u[0].llamadas && x.triangulos === u[0].triangulos)) return u[0];
    if (Date.now() - t0 > maxMs) throw new Error("el dibujo no se aquieta en " + maxMs + " ms: " + JSON.stringify(lecturas.slice(-8)));
    await p.waitForTimeout(cadaMs);
  }
}

test("en Chrome: con el permiso de voz dado hay pestaña «Hablar» con «Retirar mi permiso de voz»; retirarlo manda DELETE y lo desactiva; el dibujo no cambia", { skip: SALTO || false, timeout: 420000 }, async () => {
  const estado = { aceptada: true }, { p, errores, visto } = await abre("?debug&api=/api/", estado);
  try {
    assert.deepStrictEqual(visto, ["GET"], "mira su consentimiento una sola vez");
    await p.waitForFunction(() => !!document.getElementById("aj-t-habla"), null, { timeout: 20000 });
    const antes = await p.evaluate(() => { const b = document.getElementById("ajVozRetira"); return { texto: b && b.textContent, off: b && b.disabled, tab: document.getElementById("aj-t-habla").textContent }; });
    assert.deepStrictEqual(antes, { texto: "Retirar mi permiso de voz", off: false, tab: "Hablar" });
    const con = await dibujoQuieto(p);
    await p.evaluate(() => document.getElementById("ajVozRetira").click());
    await p.waitForFunction(() => document.getElementById("ajVozRetira").disabled === true, null, { timeout: 10000 });
    const despues = await p.evaluate(() => document.getElementById("ajVozRetira").textContent);
    assert.strictEqual(despues, "Permiso de voz: no dado"); assert.deepStrictEqual(visto, ["GET", "DELETE"]); assert.strictEqual(estado.aceptada, false);
    assert.deepStrictEqual(errores, []);
    const q = await abre("?debug&api=/api/&habla=0", { aceptada: true });
    try {
      const sin = await dibujoQuieto(q.p);
      assert.deepStrictEqual(con, sin, "el DOM no dibuja: " + JSON.stringify({ con, sin }));
      assert.deepStrictEqual(q.visto, [], "apagado, ni mira el consentimiento"); assert.strictEqual(await q.p.evaluate(() => !!document.getElementById("aj-t-habla")), false);
      if (MIDE) console.log("MEDIDO habla-consentimiento " + JSON.stringify({ con, sin }));
      assert.deepStrictEqual(q.errores, []);
    } finally { await q.p.close(); }
  } finally { await p.close(); }
});

test("en Chrome: sin permiso de voz dado no hay pestaña «Hablar» ni petición de más", { skip: SALTO || false, timeout: 300000 }, async () => {
  const { p, errores, visto } = await abre("?debug&api=/api/", { aceptada: false });
  try {
    assert.deepStrictEqual(visto, ["GET"]);
    assert.strictEqual(await p.evaluate(() => !!document.getElementById("aj-t-habla") || !!document.getElementById("ajVozRetira")), false);
    assert.deepStrictEqual(errores, []);
  } finally { await p.close(); }
});

test("en Chrome: sin servidor (ni D.base ni ?api=) no se pregunta el consentimiento ni hay pestaña «Hablar»", { skip: SALTO || false, timeout: 300000 }, async () => {
  const { p, errores, visto } = await abre("?debug", { aceptada: true });
  try {
    assert.deepStrictEqual(visto, [], "sin servidor no hay a quién preguntar");
    assert.strictEqual(await p.evaluate(() => !!document.getElementById("aj-t-habla")), false);
    assert.deepStrictEqual(errores, []);
  } finally { await p.close(); }
});
