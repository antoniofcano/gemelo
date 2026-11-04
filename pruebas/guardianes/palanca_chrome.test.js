"use strict";
// La palanca táctil (EV2-B2, 34b_palanca.js) en Chrome sin pantalla con la emulación táctil de un móvil (390 × 844): al entrar a pasear SIN pulsar
// el botón «Pasear» (como al ir andando a un punto: entraPaseo() directo) la palanca nace donde se apoya el dedo en la mitad izquierda y el paseante
// avanza; arrastrar la mitad derecha gira; con ?palanca=0 vuelve la cruceta. Fallo visto en un móvil el 2026-11-04: solo se podía girar.
// No prueba iPhone ni Android reales (gestos del sistema, temblor del pulgar): eso es la nota de comodidad. Chrome, dentro del turno del banco.
const test = require("node:test"), assert = require("node:assert");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la palanca táctil en navegador") || saltoPagina("la palanca táctil en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

async function abre(consulta) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }), p = await ctx.newPage(), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  await p.evaluate(() => window.__g.paseoEn(-130, -125, 0));   // entraPaseo() directo, sin el botón (el caso del fallo); el sitio del escenario «paseo» del banco
  await p.waitForFunction(() => document.getElementById("visor").classList.contains("paseo"), null, { timeout: 30000 });
  await p.evaluate(() => window.__g.sinDibujo(true));
  await p.waitForTimeout(1500);   // nipplejs llega con import() al empezar a pasear
  return { p, ctx, errores, cdp: await ctx.newCDPSession(p) };
}
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; }, sel);
async function arrastra(cdp, x0, y0, dx, dy, ms) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0, id: 1 }] });
  const pasos = 12;
  for (let i = 1; i <= pasos; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + dx * i / pasos, y: y0 + dy * i / pasos, id: 1 }] }); await new Promise(r => setTimeout(r, 30)); }
  await new Promise(r => setTimeout(r, ms));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("palanca táctil: nace sin pulsar «Pasear», avanza con la mitad izquierda, gira con la derecha; con ?palanca=0 vuelve la cruceta", { skip: SALTO || false, timeout: 600000 }, async () => {
  const a = await abre("?palanca=1&hora=2026-06-15T12:00");
  try {
    assert.strictEqual(await a.p.evaluate(() => document.documentElement.getAttribute("data-palanca")), "si", "encendida");
    assert.ok(await visible(a.p, "#palanca"), "la zona de la palanca se ve al pasear");
    assert.ok(!(await visible(a.p, ".pad-mov")), "con la palanca, la cruceta se oculta");
    const e0 = await a.p.evaluate(() => window.__g.paseoEstado());
    await arrastra(a.cdp, 90, 650, 0, -60, 1500);   // la mitad izquierda, hacia arriba: avanzar
    const e1 = await a.p.evaluate(() => window.__g.paseoEstado());
    const avance = Math.hypot(e1.x - e0.x, e1.y - e0.y);
    console.log("   palanca: avance " + avance.toFixed(2) + " m, giro " + (e1.ang - e0.ang).toFixed(3) + " rad");
    assert.ok(avance > 0.5, "la palanca hace andar: " + JSON.stringify([e0, e1]));
    await arrastra(a.cdp, 300, 500, 80, 0, 300);   // la mitad derecha: girar
    const e2 = await a.p.evaluate(() => window.__g.paseoEstado());
    assert.ok(Math.abs(e2.ang - e1.ang) > 0.05, "arrastrar la mitad derecha gira: " + JSON.stringify([e1, e2]));
    assert.deepStrictEqual(a.errores, [], "sin errores en la página");
  } finally { await a.ctx.close(); }
  const b = await abre("?palanca=0&hora=2026-06-15T12:00");
  try {
    assert.strictEqual(await b.p.evaluate(() => document.documentElement.getAttribute("data-palanca")), "no");
    assert.ok(await visible(b.p, ".pad-mov"), "con ?palanca=0 vuelve la cruceta");
    assert.ok(!(await visible(b.p, "#palanca")), "y la zona de la palanca no se ve");
    assert.deepStrictEqual(b.errores, [], "sin errores en la página");
  } finally { await b.ctx.close(); }
});
