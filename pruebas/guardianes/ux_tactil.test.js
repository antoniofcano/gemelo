"use strict";
// U5 · pulgares (decisión 85; doc/sistema/UX-FINCA-JUEGO.md §4.3 y §4.8): en Node, sin navegador. La cruceta y las acciones salen solo en pantallas
// táctiles (pointer: coarse, o el ajuste «tactil»: siempre / nunca) y fuera de la vista aérea; cruceta a la izquierda y acciones a la derecha, al revés
// con «mano zurda». Una ventana en hoja (móvil vertical) esconde las dos; el lateral alto (horizontal) solo las acciones.
// Que no se crucen con nada en 390 × 844 y 844 × 390: capturas por el banco.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/31_hud.js"), PL = lee("apps/web/plantilla.html");
const P = (() => {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn HudPuro;")();
})();
const css = PL.slice(PL.indexOf("<style>"), PL.indexOf("</style>"));
const grupo = id => { const i = PL.indexOf('id="' + id + '"'); return PL.slice(i, PL.indexOf("</div>", i)); };

test("táctil: el ajuste manda y, en automático, la pantalla con dedo", () => {
  assert.strictEqual(P.tactil("auto", true), true);
  assert.strictEqual(P.tactil("auto", false), false);
  assert.strictEqual(P.tactil(undefined, true), true, "sin 33_ajustes.js: automático");
  assert.strictEqual(P.tactil("siempre", false), true);
  assert.strictEqual(P.tactil("nunca", true), false);
  assert.strictEqual(P.zurda("zurda"), true);
  assert.strictEqual(P.zurda("diestra"), false);
  assert.strictEqual(P.zurda(undefined), false);
});

test("31_hud.js lee pointer: coarse y los ajustes «tactil» y «mano» (con respaldo si 33_ajustes.js no está)", () => {
  assert.match(FUENTE, /matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(FUENTE, /ajuste\("tactil", "auto"\)/);
  assert.match(FUENTE, /ajuste\("mano", "diestra"\)/);
  assert.match(FUENTE, /typeof Ajustes !== "undefined"/, "sin ReferenceError si 33_ajustes.js no existe");
  assert.match(FUENTE, /Ajustes\.alCambiar/);
});

test("la cruceta (pulgar izquierdo) y las acciones (pulgar derecho), cada una con lo suyo", () => {
  const mov = grupo("padMov"), acc = grupo("padAcc");
  for (const id of ["pad-up", "pad-left", "pad-right", "pad-down"]) assert.ok(mov.includes('id="' + id + '"'), id + " en la cruceta");
  for (const id of ["padRun", "padCam", "padQuad", "padDron", "padSube", "padBaja"]) assert.ok(acc.includes('id="' + id + '"'), id + " en las acciones");
  assert.ok(grupo("bPasear").includes('id="padAterriza"'), "«Aterrizar» es la acción principal, abajo en el centro (también con ratón)");
  assert.match(mov, /role="group" aria-label="Moverse"/); assert.match(acc, /role="group" aria-label="Acciones"/);
});

test("CSS: solo en táctil y al pasear; izquierda/derecha y al revés con mano zurda; las ventanas las apartan", () => {
  assert.match(css, /\.pad-mov, \.pad-acc \{[^}]*display: none;/, "escondidas por defecto (en el ordenador no salen)");
  assert.match(css, /\.tactil \.visor\.paseo \.pad-mov, \.tactil \.visor\.paseo \.pad-acc \{ display: grid; \}/);
  assert.match(css, /\.pad-mov \{ left: calc\(var\(--sa-l\) \+ 14px\)/);
  assert.match(css, /\.pad-acc \{ right: calc\(var\(--sa-r\) \+ 14px\)/);
  assert.match(css, /\.zurda \.pad-mov \{ left: auto; right:/);
  assert.match(css, /\.zurda \.pad-acc \{ right: auto; left:/);
  assert.match(css, /\.visor\.con-hoja \.pad-mov, \.visor\.con-hoja \.pad-acc, \.visor\.con-lateral \.pad-acc \{ display: none !important; \}/);
  assert.match(css, /bottom: calc\(var\(--sa-b\) \+ 14px\)/, "por encima de la zona segura de abajo");
});

test("los botones de los pulgares no seleccionan texto ni abren el menú de pulsación larga", () => {
  assert.match(css, /\.pad-mov button, \.pad-acc button \{[^}]*touch-action: none;[^}]*user-select: none;[^}]*-webkit-touch-callout: none/);
  assert.match(lee("apps/web/motor/12_paseo.js"), /\["pointerup", "pointercancel", "lostpointercapture"\]/, "soltar en todos los casos (12_paseo.js)");
});
