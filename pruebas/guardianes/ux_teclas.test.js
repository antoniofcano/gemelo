"use strict";
// U7 · pantalla completa y teclado (decisiones 84 y 90; doc/sistema/UX-FINCA-JUEGO.md §4.6 y §4.7): en Node, sin navegador.
// El mapa de teclas (1–6, F1, F, Inicio o 0, Intro, Esc como en un juego) del trozo puro de 31_hud.js, la pantalla completa (Fullscreen API con
// gesto, Keyboard Lock en Chrome/Edge, aviso en el iPhone) y el manifiesto web que sirve Vite. En el iPhone: NO probado.
const test = require("node:test"), assert = require("node:assert");
const { lee, RAIZ } = require("./_util");
const fs = require("fs"), path = require("path");

const HUD = lee("apps/web/motor/31_hud.js"), PANT = lee("apps/web/motor/24_pantalla.js"), PL = lee("apps/web/plantilla.html");
const P = (() => {
  const i = HUD.indexOf("// [puro:inicio]"), f = HUD.indexOf("// [puro:fin]");
  return new Function("\"use strict\";\n" + HUD.slice(i, f) + "\nreturn HudPuro;")();
})();
const T = (code, est, mod) => P.accionTecla(Object.assign({ code }, mod || {}), Object.assign({ campo: false, paseando: false, boton: false }, est || {}));

test("1–6 abren las ventanas (y el teclado numérico), F1 la ayuda, F la pantalla completa", () => {
  assert.deepStrictEqual(["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].map(c => T(c)), ["v:mapa", "v:capas", "v:tiempo", "v:historia", "v:gente", "v:chat"]);
  assert.strictEqual(T("Numpad3"), "v:tiempo");
  assert.strictEqual(T("F1"), "v:ayuda");
  assert.strictEqual(T("KeyF"), "pantalla");
});

test("Inicio o 0 vuelven a la vista aérea; Intro pasea en vista aérea, pero no al pasear ni sobre un botón", () => {
  assert.strictEqual(T("Home"), "aereo"); assert.strictEqual(T("Digit0"), "aereo"); assert.strictEqual(T("Numpad0", { paseando: true }), "aereo");
  assert.strictEqual(T("Enter"), "pasear");
  assert.strictEqual(T("Enter", { paseando: true }), null, "al pasear, Intro es del dron (12b_llegada.js)");
  assert.strictEqual(T("Enter", { boton: true }), null, "Intro sobre un botón es su clic");
});

test("escribiendo en un campo o con Ctrl/Alt/Cmd, las teclas no hacen nada (WCAG 2.1.4); Esc sí", () => {
  for (const c of ["Digit1", "KeyF", "Home", "Enter", "F1"]) assert.strictEqual(T(c, { campo: true }), null, c);
  assert.strictEqual(T("Digit1", {}, { ctrl: true }), null);
  assert.strictEqual(T("KeyF", {}, { meta: true }), null);
  assert.strictEqual(T("Escape", { campo: true }), "esc");
  assert.strictEqual(T("KeyW"), null, "andar es de 12_paseo.js");
});

test("Esc como en un juego: cierra lo último abierto y, si no hay nada, abre el menú", () => {
  const E = o => P.ordenEsc(Object.assign({ desplegable: false, ficha: false, baliza: false, ventana: false, recorrido: false }, o));
  assert.strictEqual(E({ desplegable: true, ficha: true, ventana: true }), "desplegable");
  assert.strictEqual(E({ ficha: true, ventana: true, recorrido: true }), "ficha");
  assert.strictEqual(E({ baliza: true, ventana: true }), "baliza");
  assert.strictEqual(E({ ventana: true, recorrido: true }), "ventana");
  assert.strictEqual(E({ recorrido: true }), "recorrido");
  assert.strictEqual(E({}), "menu");
  assert.doesNotMatch(lee("apps/web/motor/12_paseo.js"), /e\.code === "Escape"\) \{ salePaseo/, "Esc ya no sale del paseo");
});

test("pantalla completa: Fullscreen API sobre la página con gesto, Keyboard Lock para Esc y aviso en el iPhone", () => {
  assert.match(PANT, /raiz\.requestFullscreen \? raiz\.requestFullscreen\(\{ navigationUI: "hide" \}\) : raiz\.webkitRequestFullscreen\(\)/);
  assert.match(PANT, /k\.lock\(\["Escape"\]\)/);
  assert.match(PANT, /Compartir → «Añadir a pantalla de inicio»/);
  assert.match(PANT, /b\.addEventListener\("click", function \(\) \{ ponPantalla\(\); \}\)/, "solo con un gesto (clic o tecla F, que hace clic)");
  assert.doesNotMatch(PANT, /orientation\.lock/, "la orientación no se bloquea");
});

test("manifiesto web servido por Vite (apps/web/public) y enlazado en la plantilla", () => {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, "apps", "web", "public", "manifest.webmanifest"), "utf8"));
  assert.strictEqual(m.display, "fullscreen"); assert.deepStrictEqual(m.display_override, ["fullscreen", "standalone"]);
  assert.strictEqual(m.lang, "es"); assert.strictEqual(m.start_url, "./");
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(RAIZ, "apps", "web", "public", i.src)), "falta el icono " + i.src);
  assert.match(lee("apps/web/vite.config.js"), /publicDir: path\.join\(WEB, "public"\)/);
  assert.match(PL, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(PL, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(lee("apps/web/herramientas/genera_motor.mjs"), /viewport-fit=cover/, "zonas seguras con muesca");
});
