"use strict";
// U3 · las ventanas (apps/web/motor/32_ventanas.js y la plantilla; doc/sistema/UX-FINCA-JUEGO.md §4.4, decisiones 87 y 88): en Node, sin navegador.
// El trozo puro (forma según el tamaño, pestañas con el patrón ARIA) y, sobre la plantilla, que cada ventana sea un diálogo no modal con título enfocable y ×,
// que cada icono abra una ventana que existe, que los controles de antes estén dentro de su ventana y que cada capa diga de dónde sale (regla 5).
// Abrir cada ventana con su tecla y su icono, Esc y el foco que vuelve: en Chrome, por el banco (el mapa de teclas, en Node: ux_teclas.test.js).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/32_ventanas.js"), PL = lee("apps/web/plantilla.html");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "32_ventanas.js debe marcar su trozo puro");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn VentanasPuro;")();
}
const P = puro();
const seccion = id => { const i = PL.indexOf('<section class="ventana" id="' + id + '"'); assert.ok(i >= 0, "falta la ventana #" + id); return PL.slice(i, PL.indexOf("</section>", i)); };

test("la forma de la ventana según el visor: lateral en escritorio, hoja en vertical, lateral alto en horizontal", () => {
  assert.strictEqual(P.forma(1280, 800), "lateral");
  assert.strictEqual(P.forma(900, 650), "lateral");
  assert.strictEqual(P.forma(390, 844), "hoja");
  assert.strictEqual(P.forma(844, 390), "alto");
  assert.strictEqual(P.forma(560, 300), "hoja", "estrecha y baja: hoja");
});

test("pestañas con el patrón ARIA: flechas en círculo, Inicio y Fin", () => {
  assert.strictEqual(P.pestanaSig("ArrowRight", 2, 3), 0);
  assert.strictEqual(P.pestanaSig("ArrowLeft", 0, 3), 2);
  assert.strictEqual(P.pestanaSig("Home", 2, 3), 0);
  assert.strictEqual(P.pestanaSig("End", 0, 3), 2);
  assert.strictEqual(P.pestanaSig("KeyA", 0, 3), -1);
});

test("cada ventana es un diálogo no modal con título enfocable y una × con nombre", () => {
  for (const [nombre, id] of Object.entries(P.IDS)) {
    const s = seccion(id);
    assert.match(s, new RegExp('role="dialog" aria-modal="false" aria-labelledby="' + id + 'T"'), nombre);
    assert.match(s, new RegExp('<h2 id="' + id + 'T" tabindex="-1">'), "título enfocable: " + nombre);
    assert.match(s, /<button type="button" class="cerrar" data-cierra aria-label="Cerrar">×<\/button>/, "× de " + nombre);
    assert.match(s, / hidden>/, "cerrada al empezar: " + nombre);
  }
});

test("cada icono que abre algo apunta a una ventana que existe (el chat es flotante: 34_movibles.js)", () => {
  const abre = new Set([...PL.matchAll(/data-abre="(\w+)"/g)].map(m => m[1]));
  for (const a of abre) if (a !== "chat") assert.ok(P.IDS[a], "data-abre=" + a + " sin ventana");
  for (const a of Object.keys(P.IDS)) assert.ok(abre.has(a), "la ventana " + a + " no tiene icono");
});

test("los controles de antes viven en su ventana (se movieron; los módulos que los usan no se reescribieron)", () => {
  const dentro = {
    ventanaMapa: ["chips", "reiniciar", "tMedido", "kCopas", "sueloCuerpo"],
    ventanaCapas: ["mNube", "mGem", "mOrto", "cLinde", "cCopas", "cMarc", "cDesf", "cNdvi", "cTinte", "bNdvi", "cPaisaje", "cHierba", "cFauna", "cSolo"],
    ventanaTiempo: ["tiempo", "tLeer", "tEstado", "tMomento", "tAhora", "tPlay", "tEst", "tPrev", "ndviSel", "hFecha", "tEstac", "tDemo"],
    ventanaHistoria: ["historia", "hIni", "hIntro", "hCuerpo", "hAnt", "hSig", "hFin"],
  };
  for (const [v, ids] of Object.entries(dentro)) { const s = seccion(v); for (const id of ids) assert.ok(s.includes('id="' + id + '"'), "#" + id + " debía estar en #" + v); }
});

test("una sola fecha del campo (decisión 88): el deslizador #ndviSel está en Tiempo → El olivo, y nada más elige fecha", () => {
  const olivo = PL.slice(PL.indexOf('id="tPanOlivo"'), PL.indexOf('id="tEstac"'));
  assert.match(olivo, /<label for="ndviSel">Fecha del campo<\/label>/);
  assert.strictEqual((PL.match(/type="range" id="(ndviSel|hSel)"/g) || []).length, 1, "un solo deslizador de fecha");
  assert.match(lee("apps/web/motor/21_suelo.js"), /var s = \$\("ndviSel"\);/, "la hierba escucha la fecha del campo");
  assert.match(lee("apps/web/motor/23_estacion.js"), /var h = \$\("ndviSel"\); if \(h\) h\.addEventListener\("input"/, "la estación escucha la fecha del campo");
});

test("cada capa dice de dónde sale (medido / deducido / ilustrativo / guardado), salvo los interruptores que no son datos", () => {
  const capas = seccion("ventanaCapas");
  let n = 0;
  for (const [, id, resto] of capas.matchAll(/<label class="capa"><input type="checkbox" id="(\w+)"[^>]*>([\s\S]*?)<\/label>/g)) {
    n++; if (id === "cSolo" || id === "cSonido") continue;
    assert.match(resto, /class="pill p-(medido|deducido|ilustrativo|guardado)"/, "sin etiqueta de procedencia: " + id);
  }
  assert.ok(n >= 10, "pocas capas: " + n);
  assert.match(seccion("ventanaMapa"), /Suelo · SoilGrids <span class="pill p-modelo">modelo<\/span>/);
});

test("el tiempo, en pestañas con su patrón (tablist, tab con aria-controls, tabpanel)", () => {
  const t = seccion("ventanaTiempo");
  const tabs = [...t.matchAll(/role="tab" id="\w+" aria-controls="(\w+)"/g)];
  assert.strictEqual(tabs.length, 3);
  for (const [, ctl] of tabs) assert.match(t, new RegExp('role="tabpanel" id="' + ctl + '"'), "panel " + ctl);
  assert.match(t, /<summary>Probar un efecto \(no es el tiempo real\)<\/summary>/, "el efecto de ejemplo, plegado y rotulado");
});

test("32_ventanas.js expone el API del pacto y cierra una al abrir otra", () => {
  assert.match(FUENTE, /abre: abre, cierra: function \(\) \{ return cierra\(false\); \}, abierta: function \(\) \{ return actual; \}/);
  assert.match(FUENTE, /if \(actual\) cierra\(true\);/, "una grande a la vez");
  assert.match(FUENTE, /new MutationObserver\(mudaRecorrido\)\.observe\(hc/, "la tarjeta del recorrido sigue a #hCuerpo");
});
