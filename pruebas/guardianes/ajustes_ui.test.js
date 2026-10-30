"use strict";
// Configuración en Chrome (U4): abre la página con un <dialog id="menu"> + #menuAjustes inyectado (la plantilla de UA lo traerá; aquí se simula), recorre las pestañas,
// cambia CADA ajuste por la interfaz sin errores de consola, comprueba su efecto (controles de la página, atributos de <html>, contador), que se guardan y que ?debug manda.
// Los fps no se miden aquí (SwiftShader no mide fps); en iPhone y en Quest no está probado.
const test = require("node:test"), assert = require("node:assert");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la Configuración en navegador") || saltoPagina("la Configuración en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

// el motor es un módulo diferido: cuando el documento pasa a «interactive» (antes de que corran los módulos) ya se puede colgar el diálogo
const INIT = "(function(){function ponDialogo(){if(!document.body||document.getElementById('menu'))return;var d=document.createElement('dialog');d.id='menu';var s=document.createElement('div');s.id='menuAjustes';d.appendChild(s);document.body.appendChild(d);}" +
  "document.addEventListener('readystatechange',ponDialogo);ponDialogo();})();";

async function abre(consulta) {
  const p = await navegador.newPage({ viewport: { width: 900, height: 700 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error" && !/favicon|404|AudioContext/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.addInitScript({ content: INIT });
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
  return { p, errores };
}
const IDS = ["graficos", "vista", "controles", "vr", "acc", "sonido", "avanzado"];

test("en Chrome: las siete pestañas, cada ajuste cambia sin errores, se guarda y ?debug manda", { timeout: 240000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const { p, errores } = await abre("");
  await p.evaluate(() => document.getElementById("menu").show());   // abierto (sin modal) para que se pueda enfocar
  const n = await p.evaluate(() => document.querySelectorAll("#menuAjustes [role=tab]").length); assert.strictEqual(n, 7);
  // pestañas con flechas, Inicio y Fin (patrón ARIA)
  await p.evaluate(() => document.getElementById("aj-t-graficos").click()); await p.focus("#aj-t-graficos");
  await p.keyboard.press("ArrowRight"); assert.strictEqual(await p.evaluate(() => document.activeElement.id), "aj-t-vista");
  await p.keyboard.press("End"); assert.strictEqual(await p.evaluate(() => document.activeElement.id), "aj-t-avanzado");
  await p.keyboard.press("Home"); assert.strictEqual(await p.evaluate(() => document.activeElement.id), "aj-t-graficos");
  // cambia cada control: las opciones por su valor, las casillas con un clic, los rangos al valor del medio
  const cambios = await p.evaluate(() => {
    const hechos = [];
    document.querySelectorAll("#menuAjustes [data-aj]").forEach(i => {
      const k = i.getAttribute("data-aj");
      if (i.type === "radio") { if (!i.checked) { i.click(); hechos.push(k + "=" + i.value); } }
      else if (i.type === "checkbox") { i.click(); hechos.push(k + "=" + i.checked); }
      else if (i.type === "range") { i.value = String((Number(i.min) + Number(i.max)) / 2); i.dispatchEvent(new Event("input", { bubbles: true })); hechos.push(k + "=" + i.value); }
    });
    return hechos;
  });
  assert.ok(cambios.length >= 25, "debe haber tocado todos los ajustes: " + cambios.length);
  await p.waitForTimeout(800);
  const e = await p.evaluate(() => ({
    h: Object.fromEntries(["data-brujula", "data-unidades", "data-tactil", "data-mano", "data-contraste", "data-movimiento", "data-texto"].map(a => [a, document.documentElement.getAttribute(a)])),
    escalaTexto: document.documentElement.style.getPropertyValue("--escala-texto"), calidad: document.getElementById("calidad").value, exag: document.getElementById("exag").value, corr: document.getElementById("corr").value,
    btnSonido: !!document.getElementById("btnSonido"), contador: !!document.querySelector("div[style*='a8f0b0']"),
    guardado: Object.keys(localStorage).filter(k => k.indexOf("gemelo.ajustes.") === 0).length
  }));
  assert.strictEqual(e.h["data-brujula"], "no"); assert.strictEqual(e.h["data-unidades"], "m2"); assert.strictEqual(e.h["data-mano"], "zurda"); assert.strictEqual(e.h["data-contraste"], "alto");
  assert.strictEqual(e.h["data-movimiento"], "normal", "la última opción de cada grupo es la que queda"); assert.strictEqual(e.h["data-tactil"], "no"); assert.strictEqual(e.h["data-texto"], "mayor");
  assert.strictEqual(e.calidad, "2"); assert.strictEqual(e.exag, "2"); assert.strictEqual(e.corr, "0.75");
  assert.strictEqual(e.btnSonido, false, "el 🔊 duplicado ya no está (decisión 89)");
  assert.ok(e.guardado >= 15, "los ajustes se guardan en localStorage: " + e.guardado);
  // restablecer: todo vuelve a su valor
  await p.evaluate(() => document.getElementById("ajReinicia").click()); await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ b: document.documentElement.getAttribute("data-brujula"), q: Object.keys(localStorage).filter(k => k.indexOf("gemelo.ajustes.") === 0).length, calidad: document.getElementById("calidad").value, exag: document.getElementById("exag").value }));
  assert.deepStrictEqual(r, { b: "si", q: 0, calidad: "1", exag: "1" });
  assert.deepStrictEqual(errores, []);
  await p.close();

  // un ajuste guardado se recupera al recargar; ?debug manda sobre el contador
  const q = await abre(""); await q.p.evaluate(() => { document.getElementById("aj-t-vr").click(); document.querySelector("#menuAjustes input[name='aj-vr.giro'][value='45']").click(); });
  await q.p.reload(); await q.p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
  assert.strictEqual(await q.p.evaluate(() => document.querySelector("#menuAjustes input[name='aj-vr.giro'][value='45']").checked), true);
  await q.p.evaluate(() => localStorage.clear()); await q.p.close();
  const d = await abre("?debug"); await d.p.waitForTimeout(1500);
  const c = await d.p.evaluate(() => { const i = document.querySelector("#menuAjustes input[data-aj='avanzado.contador']"); return { marcada: i.checked, bloqueada: i.disabled }; });
  assert.deepStrictEqual(c, { marcada: true, bloqueada: true }); assert.deepStrictEqual(d.errores, []);
  await d.p.close();
  void IDS;
});
