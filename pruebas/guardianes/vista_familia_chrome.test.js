"use strict";
// U9 en Chrome sin pantalla, por el turno del banco (npm run banco:encarga; NO la ejecuta quien la escribe): la vista simple para las familias
// (apps/web/motor/48_vista_familia.js, componente «vista-familia») con los controles de verdad de «Capas y vista» y «Mapa y parcelas»:
//   · rol «hogar» (GET /api/sesion simulado con page.route): fuera el selector de modo, «Guardados», «Desfase», «Guardados» y «Desfase medio» del mapa y la nota
//     del desfase; «Copas del LiDAR» se lee «Olivos»; queda el modo Gemelo; se quedan Linde, NDVI (Vigor y Copas coloreadas) y Ambiente;
//   · rol «oficina», sin sesión (404) y ?vista=completa: todo como hoy (selector, Guardados, Desfase, «Copas del LiDAR»);
//   · ?vista=familia: lo de la familia sin sesión; ?vista=0: el componente apagado, lo de siempre;
//   · 0 errores de página.
// No prueba: el aspecto ni la legibilidad (de ojo), ni iPhone ni Quest.
// Uso: node --test pruebas/guardianes/vista_familia_chrome.test.js
const test = require("node:test"), assert = require("node:assert");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la vista de familia en navegador") || saltoPagina("la vista de familia en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  const m = montaPagina({ finca: "hituelo" });
  srv = await sirve(m.carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

async function abre(consulta, rol) {
  const p = await navegador.newPage({ viewport: { width: 1000, height: 700 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.route(/\/api\/sesion$/, r => rol
    ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rol, alias: null, alias_visible: false, primer_acceso: false, titular: true }) })
    : r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await p.route("**/api/config**", r => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  return { p, errores };
}
// qué controles quedan a la vista: ninguno de sus ancestros tiene display:none puesto por el componente (las ventanas cerradas llevan hidden: no se miran)
const controles = p => p.evaluate(() => {
  const vis = id => { const e = document.getElementById(id); if (!e) return null; for (let x = e; x && x !== document.body; x = x.parentElement) if (x.style.display === "none") return false; return true; };
  const txt = id => { const l = document.getElementById(id).closest("label"); return l ? l.textContent.replace(/\s+/g, " ").trim() : ""; };
  const modo = ["mNube", "mGem", "mOrto"].find(id => document.getElementById(id).getAttribute("aria-pressed") === "true");
  return {
    selector: vis("mNube"), marc: vis("cMarc"), desf: vis("cDesf"), kMarc: vis("kMarc"), kDes: vis("kDes"), nota: vis("notaDesfase"),
    linde: vis("cLinde"), copas: vis("cCopas"), ndvi: vis("cNdvi"), tinte: vis("cTinte"), paisaje: vis("cPaisaje"), sonido: vis("cSonido"), kAlt: vis("kAlt"),
    rotulo: txt("cCopas"), modo
  };
});
const FAMILIA = { selector: false, marc: false, desf: false, kMarc: false, kDes: false, nota: false, linde: true, copas: true, ndvi: true, tinte: true, paisaje: true, sonido: true, kAlt: true };
const COMPLETA = { selector: true, marc: true, desf: true, kMarc: true, kDes: true, nota: true, linde: true, copas: true, ndvi: true, tinte: true, paisaje: true, sonido: true, kAlt: true };
const sinTexto = c => { const o = Object.assign({}, c); delete o.rotulo; delete o.modo; return o; };

for (const [nombre, consulta, rol, esFamilia] of [
  ["rol hogar (sesión)", "?api=/api/", "hogar", true],
  ["rol oficina (sesión)", "?api=/api/", "oficina", false],
  ["sin sesión (404)", "?api=/api/", null, false],
  ["?vista=completa con rol hogar", "?api=/api/&vista=completa", "hogar", false],
  ["?vista=familia sin sesión", "?vista=familia", null, true],
  ["?vista=0 (componente apagado) con rol hogar", "?api=/api/&vista=0", "hogar", false]
]) {
  test("en Chrome: " + nombre + (esFamilia ? ": solo lo de la familia" : ": todo como hoy"), { skip: SALTO || false, timeout: 300000 }, async () => {
    const { p, errores } = await abre(consulta, rol);
    try {
      const c = await controles(p);
      assert.deepStrictEqual(sinTexto(c), esFamilia ? FAMILIA : COMPLETA, JSON.stringify(c));
      if (esFamilia) { assert.match(c.rotulo, /^Olivos\b/); assert.strictEqual(c.modo, "mGem", "el modo Gemelo, forzado"); }
      else assert.match(c.rotulo, /^Copas del LiDAR\b/);
      assert.deepStrictEqual(errores, [], "errores de página");
    } finally { await p.close(); }
  });
}
