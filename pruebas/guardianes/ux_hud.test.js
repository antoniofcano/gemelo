"use strict";
// U2 · el HUD (apps/web/motor/31_hud.js y apps/web/plantilla.html; doc/sistema/UX-FINCA-JUEGO.md §4.3): en Node, sin navegador.
// El trozo puro (modo, rumbo de la brújula, zonas que no se tapan) y, sobre la plantilla, que cada botón del HUD tenga nombre accesible y un tamaño
// declarado de al menos 44 × 44 px (la cruceta y las acciones, 52). Que Intro pasee e Inicio vuelva lo comprueba ux_teclas.test.js; en Chrome, por el banco.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/31_hud.js"), PL = lee("apps/web/plantilla.html");
function puro(nombre) {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "31_hud.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn " + nombre + ";")();
}
const P = puro("HudPuro");
const css = PL.slice(PL.indexOf("<style>"), PL.indexOf("</style>"));
const hud = PL.slice(PL.indexOf('<div class="hud" id="hud">'), PL.indexOf('<section class="ventana"'));

test("el modo sale de los indicadores del motor", () => {
  assert.strictEqual(P.modoDe(false, false, false), "aereo");
  assert.strictEqual(P.modoDe(false, true, true), "aereo", "sin pasear no hay quad ni dron");
  assert.strictEqual(P.modoDe(true, false, false), "pie");
  assert.strictEqual(P.modoDe(true, true, false), "quad");
  assert.strictEqual(P.modoDe(true, false, true), "dron");
  for (const m of ["aereo", "pie", "quad", "dron"]) assert.ok(P.MODOS[m].ico && P.MODOS[m].txt, "icono y texto de " + m);
});

test("la brújula: el norte del mundo es −z y el este +x", () => {
  const cerca = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(cerca(P.rumboCamara(0, -1), 0), "mirando a −z: norte");
  assert.ok(cerca(P.rumboCamara(1, 0), 90), "mirando a +x: este");
  assert.ok(cerca(P.rumboCamara(0, 1), 180), "mirando a +z: sur");
  assert.ok(cerca(P.rumboCamara(-1, 0), 270), "mirando a −x: oeste");
});

test("zonas que no se tapan: en coordenadas del visor y sin las ocultas", () => {
  const base = { left: 100, top: 50 };
  const z = P.zonas([
    { id: "padMov", r: { left: 110, top: 600, width: 168, height: 168 } },
    { id: "padAcc", r: { left: 0, top: 0, width: 0, height: 0 } },      // oculta (display: none)
    { id: "hudBarra", r: null },                                          // no está
    { id: "bPasear", r: { left: 400, top: 700, width: 120, height: 48 } },
  ], base);
  assert.deepStrictEqual(z, [{ id: "padMov", x: 10, y: 550, w: 168, h: 168 }, { id: "bPasear", x: 300, y: 650, w: 120, h: 48 }]);
});

test("31_hud.js expone el API del pacto: Hud.aviso, Hud.zonasProhibidas", () => {
  assert.match(FUENTE, /return \{ aviso: aviso, zonasProhibidas: zonasProhibidas/);
  assert.match(FUENTE, /\["padMov", "padAcc", "hudBarra", "hudEstado", "bPasear"\]/, "las zonas: cruceta, acciones, barra, estado y «Pasear»");
});

test("cada botón del HUD tiene nombre accesible (texto, aria-label o title)", () => {
  const botones = [...hud.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.ok(botones.length >= 25, "pocos botones en el HUD: " + botones.length);
  for (const [, at, dentro] of botones) {
    const texto = dentro.replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "").trim();
    assert.ok(/aria-label="[^"]+"/.test(at) || /title="[^"]+"/.test(at) || /[a-záéíóúñ]{2}/i.test(texto), "sin nombre accesible: <button" + at + ">" + dentro);
  }
});

test("los iconos de la barra dicen su tecla y qué abren (aria-controls o aria-pressed)", () => {
  const barra = hud.slice(hud.indexOf('id="hudBarra"'), hud.indexOf('id="hudMas"'));
  for (const [, at] of barra.matchAll(/<button\b([^>]*)>/g)) {
    if (/id="bMas"/.test(at)) continue;
    assert.match(at, /title="[^"]*·[^"]*"/, "el title lleva la tecla: " + at);
    assert.match(at, /aria-(controls|pressed|haspopup)=/, "dice qué hace: " + at);
  }
});

test("tamaños: botones del HUD ≥ 44 px y la cruceta y las acciones, 52", () => {
  assert.match(css, /--toque: 44px; --pad: 52px;/);
  assert.match(css, /\.boton \{ min-width: var\(--toque\); min-height: var\(--toque\);/);
  assert.match(css, /\.norte \{ width: var\(--toque\); height: var\(--toque\);/);
  assert.match(css, /\.t-ins \{ min-height: var\(--toque\);/);
  assert.match(css, /\.pad-mov \{[^}]*grid-template-columns: repeat\(3, var\(--pad\)\); grid-template-rows: repeat\(3, var\(--pad\)\)/);
  assert.match(css, /\.pad-acc \{[^}]*grid-template-columns: repeat\(2, var\(--pad\)\); grid-auto-rows: var\(--pad\)/);
  assert.match(css, /\.ficha > button \{[^}]*min-width: 44px; min-height: 44px/, "la × de la ficha");
  assert.match(css, /\.ventana \.cerrar \{ min-width: var\(--toque\); min-height: var\(--toque\)/, "la × de las ventanas");
});

test("los avisos se anuncian (role=status, aria-live) y no se comen los toques", () => {
  assert.match(hud, /id="hudAvisos" role="status" aria-live="polite"/);
  assert.match(css, /\.hud-avisos \{[^}]*pointer-events: none/);
});
