"use strict";
// Perillas de rendimiento VR por URL (Q0b, apps/web/motor/02f_xr_perillas.js; doc/sistema/VR.md#perillas-de-rendimiento-por-url). Solo Node: la función pura
// XrPerillasPuro.lee/plan/linea sobre una tabla de casos, el estado XrPerillas con un renderer y una sesión de mentira (llegan al factor de escala, la foveación,
// updateTargetFrameRate y fijan el nivel sin controlador) y el cableado en 29_vr, 03_escena, 28_depura y 30_mide (por texto). Nada de esto dice cómo rinde un casco real.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/02f_xr_perillas.js");
function trozo(ini, fin) {
  const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin);
  assert.ok(i >= 0 && f > i, "02f_xr_perillas.js debe marcar " + ini + " … " + fin);
  return FUENTE.slice(i, f);
}
const PURO = trozo("// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo("// [motor:inicio]", "// [motor:fin]");
const P = new Function("\"use strict\";\n" + PURO + "\nreturn XrPerillasPuro;")();
function estado(busqueda) { return new Function("location", "\"use strict\";\n" + PURO + MOTOR + "\nreturn XrPerillas;")({ search: busqueda }); }
const QUEST = { frameRates: [72, 80, 90] };

test("sin parámetros: nada pedido, nada ignorado y los valores de siempre", () => {
  for (const q of ["", "?debug", "?a=1&xr=2", undefined]) {
    const r = P.lee(q, QUEST);
    assert.deepStrictEqual(r, { fov: null, escala: null, hz: null, aa: null, nivel: null, ignorados: [] }, String(q));
  }
  const pl = P.plan(P.lee("", QUEST), QUEST);
  assert.deepStrictEqual([pl.fov, pl.escala, pl.hz, pl.aa, pl.nivel, pl.tocadas.length], [1, 0.9, 72, true, null, 0]);
  assert.strictEqual(P.linea(pl), "VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto");
});

test("valores válidos, con coma decimal y en cualquier orden", () => {
  const r = P.lee("?debug&xrescala=1.2&xrfov=0.5&xrhz=90&xraa=0&xrnivel=2", QUEST);
  assert.deepStrictEqual(r, { fov: 0.5, escala: 1.2, hz: 90, aa: false, nivel: 2, ignorados: [] });
  assert.strictEqual(P.lee("?xrescala=0,7", null).escala, 0.7);
  assert.strictEqual(P.lee("?xrfov=0", null).fov, 0, "0 es un valor, no ausencia");
  assert.strictEqual(P.lee("?xrnivel=0", null).nivel, 0);
  assert.strictEqual(P.lee("?xraa=1", null).aa, true);
});

test("fuera de rango: se recorta y se anota con el motivo", () => {
  const r = P.lee("?xrfov=3&xrescala=0.1&xrnivel=9", null);
  assert.deepStrictEqual([r.fov, r.escala, r.nivel], [1, 0.5, 3]);
  assert.deepStrictEqual(r.ignorados.map(i => i.param), ["xrfov", "xrescala", "xrnivel"]);
  assert.ok(r.ignorados.every(i => /fuera de rango/.test(i.motivo)));
  assert.strictEqual(P.lee("?xrescala=9", null).escala, 1.5);
  assert.strictEqual(P.lee("?xrfov=-1", null).fov, 0);
  const n = P.lee("?xrnivel=1.4", null); assert.strictEqual(n.nivel, 1); assert.strictEqual(n.ignorados.length, 1, "un nivel no entero se redondea y se anota");
});

test("no numérico o inválido: sin efecto y con motivo", () => {
  const r = P.lee("?xrfov=mucho&xrescala=&xrnivel=NaN&xraa=2&xrhz=60", null);
  assert.deepStrictEqual([r.fov, r.escala, r.nivel, r.aa, r.hz], [null, null, null, null, null]);
  assert.deepStrictEqual(r.ignorados.map(i => i.param), ["xrfov", "xrescala", "xrnivel", "xrhz", "xraa"]);
});

test("xrhz: solo 72/80/90/120 y solo si el casco la anuncia", () => {
  assert.strictEqual(P.lee("?xrhz=120", null).hz, 120, "sin sesión todavía no se puede saber: se acepta");
  assert.strictEqual(P.lee("?xrhz=90", QUEST).hz, 90);
  const r = P.lee("?xrhz=120", QUEST);
  assert.strictEqual(r.hz, null); assert.match(r.ignorados[0].motivo, /no soportado/);
  const s = P.lee("?xrhz=90", { frameRates: null });
  assert.strictEqual(s.hz, null); assert.match(s.ignorados[0].motivo, /no soportado/);
  const pl = P.plan(r, QUEST);
  assert.strictEqual(pl.hz, 72, "no soportada la pedida: queda la de siempre (72) si el casco la admite");
  assert.strictEqual(P.plan(P.lee("", { frameRates: [90] }), { frameRates: [90] }).hz, null, "si ni los 72 Hz están, no se pide ninguna");
});

test("la línea del informe dice las perillas efectivas y lo ignorado", () => {
  const so = QUEST, pl = P.plan(P.lee("?xrfov=0.5&xrescala=1&xrhz=120&xraa=0&xrnivel=2", so), so);
  const l = P.linea(pl);
  assert.match(l, /^VR: fov 0,5 · escala 1 · 72 Hz · MSAA no · nivel 2 fijo · ignorado: xrhz=120 \(no soportado/);
});

test("motor: sin perillas llegan 0,9, foveación 1 y 72 Hz, y el controlador sigue activo", () => {
  const X = estado(""), llamadas = [];
  const renderer = { xr: { setFoveation: v => llamadas.push(["fov", v]) } };
  const ses = { supportedFrameRates: [72, 90], renderState: { baseLayer: { fixedFoveation: 0 } }, updateTargetFrameRate: f => llamadas.push(["hz", f]) };
  assert.strictEqual(X.aa, true); assert.strictEqual(X.efectivas.escala, 0.9);
  X.antes(renderer); X.despues(ses);
  assert.deepStrictEqual(llamadas, [["fov", 1], ["hz", 72]]);
  assert.strictEqual(ses.renderState.baseLayer.fixedFoveation, 1);
  assert.strictEqual(X.fijo(), false); assert.strictEqual(X.entro, true);
  assert.strictEqual(X.linea(), "VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto");
});

test("motor: las perillas llegan a la escala, la foveación, la frecuencia y el nivel fijo", () => {
  const X = estado("?xrescala=1.1&xrfov=0.3&xrhz=90&xraa=0&xrnivel=3"), llamadas = [];
  const renderer = { xr: { setFoveation: v => llamadas.push(["fov", v]) } };
  const ses = { supportedFrameRates: [72, 90], renderState: { baseLayer: { fixedFoveation: 0 } }, updateTargetFrameRate: f => llamadas.push(["hz", f]) };
  assert.strictEqual(X.aa, false, "se lee antes de crear el renderer"); assert.strictEqual(X.efectivas.escala, 1.1, "setFramebufferScaleFactor(efectivas.escala) en 29_vr");
  X.antes(renderer); X.despues(ses);
  assert.deepStrictEqual(llamadas, [["fov", 0.3], ["hz", 90]]);
  assert.strictEqual(ses.renderState.baseLayer.fixedFoveation, 0.3);
  assert.strictEqual(X.fijo(), true); assert.strictEqual(X.efectivas.nivel, 3);
});

test("motor: una frecuencia no soportada no llama a updateTargetFrameRate si el casco no admite ni los 72 Hz, y se anota", () => {
  const X = estado("?xrhz=120"), llamadas = [];
  const ses = { supportedFrameRates: [90], updateTargetFrameRate: f => llamadas.push(f), renderState: {} };
  X.despues(ses);
  assert.deepStrictEqual(llamadas, []); assert.strictEqual(X.efectivas.hz, null);
  assert.strictEqual(X.efectivas.ignorados[0].param, "xrhz"); assert.match(X.linea(), /Hz sin cambiar.*ignorado: xrhz=120/);
  const sinApi = estado(""); assert.doesNotThrow(() => sinApi.despues({ renderState: {} }), "un casco sin supportedFrameRates ni updateTargetFrameRate no rompe");
});

test("cableado: 29_vr usa XrPerillas en un solo sitio, 03_escena el MSAA, y el informe y el panel dicen la línea", () => {
  const vr = lee("apps/web/motor/29_vr.js");
  assert.match(vr, /setFramebufferScaleFactor\(XrPerillas\.efectivas\.escala\)/); assert.match(vr, /XrPerillas\.antes\(renderer\)/); assert.match(vr, /XrPerillas\.despues\(ses\)/);
  assert.doesNotMatch(vr, /setFramebufferScaleFactor\(0\.9\)/, "el 0,9 ya no está repartido: vive en XrPerillasPuro.DEF");
  assert.match(vr, /if \(XrPerillas\.fijo\(\)\) return;/, "el controlador adaptativo no actúa con ?xrnivel=");
  assert.match(vr, /vrPerfil\(XrPerillas\.fijo\(\) \? XrPerillas\.efectivas\.nivel : 0\)/);
  assert.match(vr, /xr: \{ fov: /, "window.__vrDebug() trae las perillas");
  assert.match(lee("apps/web/motor/03_escena.js"), /antialias: XrPerillas\.aa/);
  assert.match(lee("apps/web/motor/28_depura.js"), /XrPerillas\.linea\(\)/);
  const mide = lee("apps/web/motor/30_mide.js");
  assert.match(mide, /perillas: modoIni === "VR" \? XrPerillas\.linea\(\)/); assert.match(mide, /r\.perillas/);
  // las banderas xr* solo se leen en 02f
  const otros = require("fs").readdirSync(require("path").join(__dirname, "..", "..", "apps/web/motor")).filter(f => f.endsWith(".js") && f !== "02f_xr_perillas.js");
  for (const f of otros) assert.doesNotMatch(lee("apps/web/motor/" + f), /xr(fov|escala|hz|aa|nivel)=/, f + " no debe leer las perillas por su cuenta");
});
