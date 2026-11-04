"use strict";
// EV2-A4 · lo tuyo en pantalla (apps/web/motor/31b_hud_personal.js, #hudPersonal en plantilla.html): en Node, sin navegador.
// El trozo puro (hora, tu haza, hablar, volver) y, sobre la plantilla y el CSS, que cada botón tenga nombre accesible que contenga su texto visible
// (WCAG 2.5.3), que no haya estilos en línea, que el HUD lo oculte con su ajuste y que el cableado use lo que ya existe (Hud, Bus, Hazas).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/31b_hud_personal.js"), PL = lee("apps/web/plantilla.html"), css = lee("apps/web/plantilla.css");
function puro(nombre) {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "31b_hud_personal.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn " + nombre + ";")();
}
const P = puro("HudPersonalPuro");
const bloque = PL.slice(PL.indexOf('id="hudPersonal"'), PL.indexOf("</div>", PL.indexOf('id="hudPersonal"')));

test("la hora: HH:MM o un guion, nunca un dato inventado", () => {
  assert.deepStrictEqual(P.hora("12:30").texto, "12:30");
  assert.match(P.hora("12:30").nombre, /12:30/);
  for (const malo of ["", null, undefined, "7:5", "25:99", 12]) assert.strictEqual(P.hora(malo).texto, "--:--", String(malo));
  assert.match(P.hora(null).nombre, /sin dato/);
});

test("tu haza: sin hazas leídas no sale; dentro dice si es tuya; fuera lo dice", () => {
  assert.strictEqual(P.haza(null, false).visible, false);
  assert.strictEqual(P.haza({ id: "a", es_mia: true }, true).texto, "Tu haza");
  assert.strictEqual(P.haza({ id: "b", es_mia: false }, true).texto, "Otra haza");
  assert.strictEqual(P.haza(null, true).texto, "Sin haza");
  for (const v of [P.haza(null, true), P.haza({ id: "a", es_mia: true }, true), P.haza({ id: "b", es_mia: false }, true)])
    assert.ok(v.visible && v.nombre.startsWith(v.texto), "el nombre accesible empieza por el texto visible: " + v.nombre);
});

test("hablar: solo dentro de una guiada y con permiso; alterna Hablar / Callar", () => {
  assert.strictEqual(P.hablar(null).visible, false);
  assert.strictEqual(P.hablar({ dentro: true, guiada: false, puede: true, micro: "cerrado" }).visible, false, "sin guiada no hay voz");
  assert.strictEqual(P.hablar({ dentro: true, guiada: true, puede: false, micro: "cerrado" }).visible, false, "sin la palabra no se muestra");
  const c = P.hablar({ dentro: true, guiada: true, puede: true, micro: "cerrado" });
  assert.ok(c.visible && c.texto === "Hablar" && c.pulsado === false);
  const a = P.hablar({ dentro: true, guiada: true, puede: true, micro: "abierto" });
  assert.ok(a.visible && a.texto === "Callar" && a.pulsado === true);
  const b = P.hablar({ dentro: true, guiada: true, puede: true, micro: "abriendo" });
  assert.ok(b.visible && b.pulsado === true);
  for (const v of [c, a, b]) assert.ok(v.nombre.startsWith(v.texto), "el nombre accesible empieza por el texto visible: " + v.nombre);
});

test("volver: a la vista aérea; ya en ella, al inicio", () => {
  assert.match(P.volver("pie").nombre, /vista aérea/);
  assert.match(P.volver("aereo").nombre, /inicio/);
  assert.ok(P.volver("pie").nombre.startsWith(P.volver("pie").texto));
});

test("la plantilla: cuatro botones con nombre accesible y sin estilos en línea", () => {
  assert.ok(bloque.includes('role="group"') && /aria-label="Lo tuyo/.test(bloque), "el grupo lleva rol y nombre");
  for (const id of ["hpHora", "hpHaza", "hpHablar", "hpVolver"]) {
    const m = new RegExp('<button[^>]*id="' + id + '"[^>]*>').exec(bloque);
    assert.ok(m, id + " existe");
    assert.match(m[0], /type="button"/, id + " es type=button");
    assert.match(m[0], /aria-label="[^"]{4,}"/, id + " tiene nombre accesible");
    assert.match(m[0], /class="boton hp-btn"/, id + " usa .boton (44 px de objetivo: --toque)");
    assert.ok(!/\sstyle\s*=/.test(m[0]), id + " sin style en línea");
  }
  assert.match(bloque, /id="hpHaza"[^>]*hidden/, "tu haza nace oculta (sin hazas leídas no sale)");
  assert.match(bloque, /id="hpHablar"[^>]*hidden/, "hablar nace oculto (solo en una guiada)");
  assert.ok(PL.indexOf('id="hudPersonal"') > PL.indexOf('id="hudEstado"') && PL.indexOf('id="hudPersonal"') < PL.indexOf('id="hudBarra"'), "va dentro de #hudEstado, que Movibles ya protege");
});

test("el CSS: clases (sin estilos creados por el motor), el ajuste lo oculta y los objetivos no bajan de --toque", () => {
  assert.match(css, /:root\[data-personal="no"\] #hudPersonal \{ display: none; \}/, "el ajuste vista.personal oculta el bloque");
  assert.match(css, /\.hud-personal \.hp-btn/, "tiene su clase");
  assert.match(css, /\.boton \{ min-width: var\(--toque\); min-height: var\(--toque\)/, ".boton fija el objetivo táctil en --toque");
  const regla = /\.hud-personal \.hp-btn \{([^}]*)\}/.exec(css);
  assert.ok(regla && !/(?<![\w-])(min-height|height)\s*:/.test(regla[1]), "la regla del botón no fija una altura propia: manda .boton (--toque)");
  assert.ok(!/createElement\(\s*["']style["']\s*\)|\.style\.cssText|setAttribute\(\s*["']style["']/.test(FUENTE), "el módulo no crea estilos ni los pone en línea");
});

test("el cableado reusa lo que ya existe y el ajuste está registrado", () => {
  assert.match(FUENTE, /Hud\.alInicio\(\)/); assert.match(FUENTE, /Hud\.alterna\("tiempo"/);
  assert.match(FUENTE, /Hazas\.enPunto/); assert.match(FUENTE, /Usables\.elige\("haza:"/); assert.match(FUENTE, /horaMundoTexto\(\)/);
  assert.match(FUENTE, /Bus\.emite\("habla:alterna"/); assert.match(FUENTE, /Bus\.on\("voz:estado"/);
  assert.match(lee("apps/web/motor/31_hud.js"), /alInicio: alInicio/, "31_hud.js expone alInicio");
  assert.match(lee("apps/web/motor/47_habla.js"), /n\.on\("habla:alterna"/, "47_habla.js atiende habla:alterna");
  const aj = lee("apps/web/motor/33_ajustes.js");
  assert.match(aj, /"vista\.personal": bool\(true\)/); assert.match(aj, /"vista\.personal": function \(v\) \{ raiz\.setAttribute\("data-personal"/);
  assert.match(aj, /i2\.id = "aj-c-" \+ c\.k; i2\.name = i2\.id/, "cada casilla de Configuración lleva id y name");
});
