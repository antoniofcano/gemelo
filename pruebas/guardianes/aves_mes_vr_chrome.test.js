"use strict";
// La fila «Aves del mes» del panel de VR (EV-1g; apps/web/motor/52_aves_mes.js) en Chrome con el WebXR simulado: ESCRITA, NO EJECUTADA por quien la escribió; la pasa el
// banco (npm run banco:encarga), como agenda_mundo_chrome.test.js. Opcional (GEMELO_VR=1: el WebXR simulado es inestable con SwiftShader, como vr.test.js).
// Comprueba: con biodiversidad.json servido (el índice lo anuncia; page.route) la fila sale en la pestaña Mundo con 3 aves, «deducido», la nota de que no se ha
// observado en la finca y las licencias; sin el fichero no hay fila; 0 errores de consola; y no pone botones. Los fps y la comodidad en el Quest: NO PROBADOS.
// [SUPUESTO] que D.base sea no vacío con montaPagina (si no, el componente no pide nada y el banco debe servir la página con D.base; ajustar aquí, no el motor).
const test = require("node:test"), assert = require("node:assert");
const { describe, before } = test;
const { RAIZ, fs, path, lee } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("las aves del mes en VR") || saltoPagina("las aves del mes en VR");
const CAPS = path.join(RAIZ, "pruebas", "salida", "capturas-aves");
const EJ = lee("contratos/biodiversidad-ejemplo.json");
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza(); fs.mkdirSync(CAPS, { recursive: true });
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

describe("en el navegador", () => {
  before(async () => { if (!SALTO) await prepara(); });
  for (const conDatos of [true, false]) test("VR simulada: " + (conDatos ? "la fila «Aves del mes» del panel (pestaña Mundo) enseña 3 aves, «deducido», la nota y las licencias; sin botones" : "sin biodiversidad.json no hay fila"), { timeout: 400000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 para la fila en el panel VR con el WebXR simulado");
    const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
    await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    if (conDatos) {
      await p.route("**/indice.json", async r => { const resp = await r.fetch(), j = await resp.json(); j.biodiversidad = "biodiversidad.json"; await r.fulfill({ response: resp, body: JSON.stringify(j) }); });
      await p.route("**/biodiversidad.json", r => r.fulfill({ status: 200, contentType: "application/json", body: EJ }));
    }
    try {
      await p.goto(url + "?debug&hora=12:00");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__vrDebug, null, { timeout: 120000, polling: 500 });
      await p.waitForSelector("#btnVR", { timeout: 120000 }); await p.click("#btnVR", { timeout: 120000 });
      await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 120000, polling: 200 });
      if (conDatos) {
        await p.waitForFunction(() => window.__vrDebug().aves, null, { timeout: 30000, polling: 200 });
        const d = await p.evaluate(() => window.__vrDebug().aves);
        assert.strictEqual(d.nombres.length, 3); assert.match(d.cab, /deducido/); assert.match(d.nota, /no se ha observado en la finca/); assert.match(d.fuente, /^Licencias: CC0/);
        const botones = await p.evaluate(() => window.__vrBotones().map(b => b.id)); assert.ok(!botones.some(id => /aves/.test(id)), "la fila no pone botones: " + botones);
        await p.screenshot({ path: path.join(CAPS, "vr_aves.png"), timeout: 120000 }).catch(e => console.log("   (captura no hecha: " + String(e.message).split("\n")[0] + ")"));
      } else assert.ok(!(await p.evaluate(() => window.__vrDebug().aves)), "sin fichero, sin fila");
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });
});
