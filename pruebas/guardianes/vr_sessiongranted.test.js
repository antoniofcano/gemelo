"use strict";
// Q2c: entrar en VR con «sessiongranted» SOLO con ?mide o ?debug (apps/web/motor/29_vr.js, sección 8). En Node, sin navegador: la decisión pura y el
// cableado real (el texto de vrConcedida() se evalúa con el WebXR de mentira pruebas/mock_xr.js, que se carga con window/navigator falsos y al que se
// le dispara «sessiongranted»). Comprueban la LÓGICA; entrar en VR sin pulsar en unas Quest reales NO está probado.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/29_vr.js");
const SEC = FUENTE.indexOf("----- 8) Q2c");
const i = FUENTE.indexOf("// [puro:inicio]", SEC), f = FUENTE.indexOf("// [puro:fin]", i);
assert.ok(SEC >= 0 && i > SEC && f > i, "29_vr.js debe marcar el trozo puro de Q2c");
const A = FUENTE.indexOf("  var vrDeteccion = null;"), B = FUENTE.indexOf("  window.__vrDebug = function");
assert.ok(A > f && B > A, "falta el cableado vrConcedida()");
const PURO = FUENTE.slice(i, f), CABLEADO = FUENTE.slice(A, B);
const P = new Function("\"use strict\";\n" + PURO + "\nreturn VrConcedidaPuro;")();
const base = { busqueda: "?mide", xr: true, on: false, entrando: false, soporta: true };
const con = o => Object.assign({}, base, o);

test("decide: con ?mide, con ?debug y con ambos entra; sin ellos, no", () => {
  assert.strictEqual(P.decide(con({ busqueda: "?mide" })), true);
  assert.strictEqual(P.decide(con({ busqueda: "?mide=60" })), true);
  assert.strictEqual(P.decide(con({ busqueda: "?debug" })), true);
  assert.strictEqual(P.decide(con({ busqueda: "?debug&mide=60" })), true);
  assert.strictEqual(P.decide(con({ busqueda: "?a=1&mide" })), true);
  for (const b of ["", "?", "?finca=x", "?midelo", "?debugger=1", "?xr=mide", null, undefined]) assert.strictEqual(P.decide(con({ busqueda: b })), false, "no debe entrar con " + b);
});

test("decide: sin navegador XR, sin soporte, con sesión abierta o entrando, no hace nada", () => {
  assert.strictEqual(P.decide(con({ xr: false })), false);
  assert.strictEqual(P.decide(con({ soporta: false })), false);
  assert.strictEqual(P.decide(con({ on: true })), false);
  assert.strictEqual(P.decide(con({ entrando: true })), false);
  assert.strictEqual(P.decide(null), false);
});

// ----- cableado: vrConcedida() real, con el mock de WebXR del repo
function monta(busqueda, soporta) {
  const g = globalThis, nav = new EventTarget(), ant = { navigator: Object.getOwnPropertyDescriptor(g, "navigator"), window: g.window };
  Object.defineProperty(g, "navigator", { configurable: true, value: nav }); g.window = g;
  new Function(lee("pruebas/mock_xr.js"))();   // define navigator.xr y window.__mockXR
  const xr = nav.xr, ev = new EventTarget(); xr.addEventListener = ev.addEventListener.bind(ev); xr.dispatchEvent = ev.dispatchEvent.bind(ev);   // el xr del mock no es EventTarget; el navegador real sí
  g.__mockXR.soporta = soporta !== false;
  const log = { entra: 0, estados: [] }, VRX = { on: false, entrando: false, soporta: soporta !== false };
  new Function("VRX", "log", "location", "navigator", PURO + "\n" + CABLEADO +
    "\nfunction vrEstado(t) { log.estados.push(t); } function entraVR() { log.entra++; VRX.entrando = true; }\nvrConcedida(); vrDeteccion = Promise.resolve();")(VRX, log, { search: busqueda }, nav);
  return { xr, log, VRX, resto() { if (ant.navigator) Object.defineProperty(g, "navigator", ant.navigator); else delete g.navigator; if (ant.window === undefined) delete g.window; delete g.__mockXR; } };
}
const espera = () => new Promise(r => setTimeout(r, 5));

test("con ?mide, «sessiongranted» entra una sola vez (por entraVR, el camino del botón)", async () => {
  const m = monta("?mide=60");
  try { m.xr.dispatchEvent(new Event("sessiongranted")); m.xr.dispatchEvent(new Event("sessiongranted")); await espera(); assert.strictEqual(m.log.entra, 1, "el segundo aviso, ya entrando, no hace nada"); } finally { m.resto(); }
});
test("con ?debug también; con sesión ya abierta no", async () => {
  const m = monta("?debug");
  try { m.VRX.on = true; m.xr.dispatchEvent(new Event("sessiongranted")); await espera(); assert.strictEqual(m.log.entra, 0); m.VRX.on = false; m.xr.dispatchEvent(new Event("sessiongranted")); await espera(); assert.strictEqual(m.log.entra, 1); } finally { m.resto(); }
});
test("sin ?mide ni ?debug no se escucha nada y no entra", async () => {
  const m = monta("?finca=cerro");
  try { m.xr.dispatchEvent(new Event("sessiongranted")); await espera(); assert.strictEqual(m.log.entra, 0); } finally { m.resto(); }
});
test("con ?mide pero sin soporte de VR no entra", async () => {
  const m = monta("?mide", false);
  try { m.xr.dispatchEvent(new Event("sessiongranted")); await espera(); assert.strictEqual(m.log.entra, 0); } finally { m.resto(); }
});
test("sin navigator.xr no revienta", () => {
  const run = new Function("location", "navigator", "VRX", "vrEstado", "entraVR", PURO + "\n" + CABLEADO + "\nvrConcedida();");
  assert.doesNotThrow(() => run({ search: "?mide" }, {}, {}, () => {}, () => {}));
});
