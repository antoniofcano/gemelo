"use strict";
// F3e en Chrome sin pantalla (SwiftShader: vale para recuentos, no para fps; regla 6), por el turno del banco (npm run banco:encarga; NO la ejecuta quien la escribe):
//   · el componente «habla-guiada» (47_habla.js) se monta con la página y, FUERA de una sala guiada, no crea nada: ni caja #hablaCaja, ni pestaña «Hablar» en
//     Configuración, ni fila en el panel; __habla() dice «no visible»; la tecla T no se come (el evento sigue sin defaultPrevented) y no da errores;
//   · ?habla=0 lo apaga (sin gancho), y sin «visita-guiada» (?guia=0) o sin la voz (?voz=0) no se monta, con su motivo;
//   · el motor sigue dibujando lo mismo (llamadas y triángulos de un fotograma con el componente y sin él: ?habla=0), porque el DOM no dibuja;
//   · 0 errores de consola.
// NO prueba (queda para F3g, con LiveKit y tres Chrome, y para una persona con un dispositivo): la caja dentro de una sala guiada (tamaño real de los botones,
// foco, el lector de pantalla con la región aria-live), el micrófono simulado de verdad, ni nada de VR (el gatillo izquierdo, la háptica, la lámina de 3 s y la
// fila del panel solo se prueban en Node con un 29_vr de mentira); ni iPhone ni Quest.
// Uso: node --test pruebas/guardianes/habla_chrome.test.js (GEMELO_MIDE=1 imprime las cifras).
const test = require("node:test"), assert = require("node:assert");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const MIDE = !!process.env.GEMELO_MIDE;
const SALTO = motivoSalto("hablar en la visita guiada en navegador") || saltoPagina("hablar en la visita guiada en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  srv = await sirve(montaPagina({ finca: "hituelo" }).carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

async function abre(consulta) {
  const p = await navegador.newPage({ viewport: { width: 1000, height: 700 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|favicon|AudioContext/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  // el dibujo depende de lo que la Cola ya haya cargado (teselas y generados): se espera a que se vacíe y se estabilice antes de comparar
  await p.waitForFunction(() => { const g = window.__g, E = g.Escena3D; return g.pendientes() === 0 && (!E || E.resumen().estado !== "activo" || E.listo()); }, null, { timeout: 120000, polling: 500 });
  await p.waitForTimeout(1500);
  return { p, errores };
}
const comp = (p, id) => p.evaluate(id => (window.__componentes() || []).find(c => c.id === id) || null, id);
const dibujo = p => p.evaluate(() => { const g = window.__g; g.renderer.render(g.scene, g.camera); return { llamadas: g.renderer.info.render.calls, triangulos: g.renderer.info.render.triangles }; });

test("en Chrome: fuera de una sala guiada «habla-guiada» está montado y no crea nada; la tecla T no se come; no cambia el dibujo", { skip: SALTO || false, timeout: 300000 }, async () => {
  const { p, errores } = await abre("?debug");
  try {
    const c = await comp(p, "habla-guiada"); assert.ok(c, "el componente está registrado"); assert.strictEqual(c.activo, true, JSON.stringify(c));
    const e = await p.evaluate(() => ({ gancho: typeof window.__habla, vista: window.__habla && window.__habla(), caja: !!document.getElementById("hablaCaja"), tira: !!document.getElementById("hablaEstado") }));
    assert.strictEqual(e.gancho, "function"); assert.strictEqual(e.vista.visible, false); assert.strictEqual(e.vista.accion, "ninguna"); assert.strictEqual(e.caja, false); assert.strictEqual(e.tira, false);
    // T: fuera de la guiada no hay micro que abrir: el componente la deja pasar (no preventDefault)
    const pd = await p.evaluate(() => { const ev = new KeyboardEvent("keydown", { code: "KeyT", key: "t", bubbles: true, cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });
    assert.strictEqual(pd, false);
    const con = await dibujo(p);
    await p.waitForTimeout(500);
    assert.deepStrictEqual(errores, []);
    // el dibujo es el mismo con el componente apagado
    const q = await abre("?debug&habla=0");
    try {
      const sin = await dibujo(q.p);
      assert.deepStrictEqual(con, sin, "el DOM no dibuja: " + JSON.stringify({ con, sin }));
      if (MIDE) console.log("MEDIDO habla " + JSON.stringify({ con, sin }));
      assert.deepStrictEqual(q.errores, []);
    } finally { await q.p.close(); }
  } finally { await p.close(); }
});

test("en Chrome: ?habla=0 lo apaga; sin la visita guiada (?guia=0) o sin la voz (?voz=0) no se monta y dice por qué", { skip: SALTO || false, timeout: 300000 }, async () => {
  for (const [consulta, activo, origen, motivo] of [["?habla=0", false, "url", /apagado/], ["?guia=0", false, "defecto", /falta visita-guiada/], ["?voz=0", false, "defecto", /falta voz-guiada|falta visita-guiada/]]) {
    const { p, errores } = await abre(consulta);
    try {
      const c = await comp(p, "habla-guiada"); assert.strictEqual(c.activo, activo, consulta + " " + JSON.stringify(c)); assert.strictEqual(c.origen, origen, consulta);
      assert.match(c.motivo, motivo, consulta); assert.strictEqual(await p.evaluate(() => typeof window.__habla), "undefined", consulta);
      assert.deepStrictEqual(errores, [], consulta);
    } finally { await p.close(); }
  }
});
