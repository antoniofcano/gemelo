"use strict";
// F3l, la tarjeta «tu micrófono, en pocas palabras» (46b_primera_vez.js): la lógica pura, sin navegador. Quién la ve, qué dice según la sala y la forma del
// micro, que las cifras salen de donde deben (VozPuro.DIST_CORRO) y que lo que afirma es lo que dicen el ADR-0026/0032 (no se graba) y el motor (cómo cortar).
// El montaje (cuándo sale, el foco, la lámina de VR) está en habla.test.js; lo de Chrome, iPhone y Quest, sin probar.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return s.slice(i, f); };
const PV = new Function("\"use strict\";\n" + trozo(lee("apps/web/motor/46b_primera_vez.js"), "// [puro:inicio]", "// [puro:fin]") + "\nreturn PrimeraVezPuro;")();
const VozPuro = new Function("\"use strict\";\n" + trozo(lee("apps/web/motor/45_voz.js"), "// [puro:inicio]", "// [puro:fin]") + "\nreturn VozPuro;")();
const todo = t => t.lineas.map(l => l.t + " " + l.txt).join(" ") + " " + t.pie;

test("PrimeraVezPuro: sale la primera vez (y solo a familias y miembros de un corro), no la segunda", () => {
  assert.strictEqual(PV.debeVerse(false, "familia"), true); assert.strictEqual(PV.debeVerse(false, "miembro"), true);
  assert.strictEqual(PV.debeVerse(true, "familia"), false, "ya vista: no vuelve"); assert.strictEqual(PV.debeVerse(true, "miembro"), false);
  for (const p of ["guia", "oficina", "", undefined, null]) assert.strictEqual(PV.debeVerse(false, p), false, "el guía y la oficina hablan por su cargo: " + p);
  for (const x of [undefined, null, 0, "si", {}]) assert.strictEqual(PV.debeVerse(x, "familia"), true, "solo un «true» exacto la da por vista: " + JSON.stringify(x));
  assert.strictEqual(PV.CLAVE, "habla.tarjeta");
});

test("PrimeraVezPuro: la sala decide el ámbito", () => {
  assert.strictEqual(PV.ambitoDe({ corro: true, guiada: false }), "corro"); assert.strictEqual(PV.ambitoDe({ guiada: true }), "guiada");
  assert.strictEqual(PV.ambitoDe({}), ""); assert.strictEqual(PV.ambitoDe(null), "");
});

test("PrimeraVezPuro: el «con quién» cambia con el modo real (guiada o corro) y el alcance sale del número que se le da", () => {
  const g = PV.tarjeta({ ambito: "guiada", forma: "pulsar" }), c = PV.tarjeta({ ambito: "corro", forma: "pulsar", corte: VozPuro.DIST_CORRO.corte });
  const qg = g.lineas.find(l => l.k === "quien").txt, qc = c.lineas.find(l => l.k === "quien").txt;
  assert.match(qg, /Te oyen el guía y las demás familias de esta visita guiada/); assert.match(qg, /cuando el guía te da la palabra/); assert.doesNotMatch(qg, /corro| m /);
  assert.match(qc, /Te oyen solo las personas de tu corro \(hasta 5 hogares\)/); assert.match(qc, new RegExp("a más de " + VozPuro.DIST_CORRO.corte + " m dejáis de oíros")); assert.match(qc, /Nadie más te oye/); assert.doesNotMatch(qc, /guía/);
  assert.notStrictEqual(qg, qc);
  assert.strictEqual(PV.ALCANCE_CORRO, VozPuro.DIST_CORRO.corte, "la cifra del texto es la de 45_voz.js (ADR-0032 b): si una cambia, la otra y el texto con ella"); assert.strictEqual(PV.ALCANCE_CORRO, 20);
  const sinCifra = PV.tarjeta({ ambito: "corro", forma: "pulsar" }).lineas[0].txt; assert.doesNotMatch(sinCifra, /\d+ m/, "si no hay cifra, no se inventa");
  for (const x of [NaN, Infinity, -5, "20", null]) assert.doesNotMatch(PV.tarjeta({ ambito: "corro", corte: x }).lineas[0].txt, /\d+ m/, "cifra no válida: " + x);
});

test("PrimeraVezPuro: cómo cortar el micro (pantalla, táctil y VR) según pulsar o mantener; en un corro, también el cierre solo", () => {
  const p = PV.tarjeta({ ambito: "guiada", forma: "pulsar" }), m = PV.tarjeta({ ambito: "guiada", forma: "mantener" }), c = PV.tarjeta({ ambito: "corro", forma: "pulsar", corte: 20 });
  const cp = p.lineas.find(l => l.k === "corta").txt, cm = m.lineas.find(l => l.k === "corta").txt, cc = c.lineas.find(l => l.k === "corta").txt;
  assert.match(cp, /«Silenciarme»/); assert.match(cp, /tecla T/); assert.match(cp, /gatillo izquierdo/);
  assert.match(cm, /Deja de apretar el botón «Hablar»/); assert.match(cm, /tecla T/); assert.match(cm, /gatillo izquierdo/);
  assert.match(cc, /un minuto sin hablar/); assert.match(cc, /salir del corro/); assert.doesNotMatch(cp, /minuto/);
  // lo que dice es lo que de verdad hay en el motor: el botón «Silenciarme» y la tecla T (47_habla.js) y el minuto de silencio (SILENCIO_S = 60)
  const hab = lee("apps/web/motor/47_habla.js"); assert.ok(hab.includes('"Silenciarme"') && hab.includes('"KeyT"') && hab.includes("var SILENCIO_S = 60"), "los gestos que nombra existen en el motor");
});

test("PrimeraVezPuro: dice que no se graba (ADR-0026 §5, ADR-0032) y no promete lo que no hay", () => {
  const t = PV.tarjeta({ ambito: "corro", forma: "pulsar", corte: 20 }), tx = todo(t);
  assert.match(t.lineas.find(l => l.k === "graba").txt, /No se graba ni se transcribe nada de lo que dices/);
  const adr = lee("doc/adr/0032-voz-por-cercania-en-la-visita-libre.md"); assert.match(adr, /Sin grabación\*\* Ni Egress, ni `MediaRecorder`, ni transcripción|\*\*4\. Sin grabación\.\*\* Ni Egress/);
  assert.doesNotMatch(tx, /moderad|se guarda|archiv/i, "nada de lo que no se dice en el ADR");
  assert.strictEqual(t.lineas.length, 3, "tres líneas: quién, cómo cortar y qué no pasa"); assert.strictEqual(t.boton, "Entendido"); assert.ok(t.titulo.length > 0);
});

test("PrimeraVezPuro: el pie dice dónde volver a verla (pantalla o VR) y todo el texto se enseña como texto", () => {
  assert.match(PV.tarjeta({ ambito: "guiada" }).pie, /Configuración → Hablar/); assert.match(PV.tarjeta({ ambito: "guiada", vr: true }).pie, /fila «Micrófono»/);
  for (const o of [{ ambito: "guiada" }, { ambito: "corro", corte: 20, forma: "mantener", vr: true }, null, undefined, {}]) {
    const t = PV.tarjeta(o); assert.doesNotMatch(todo(t), /[<>]|&[a-z]+;/, "sin marcas: el motor lo pinta con textContent");
    for (const l of t.lineas) assert.ok(l.txt.length <= 260, "cada línea es breve (" + l.k + ": " + l.txt.length + ")");
  }
});
