"use strict";
// O10a: los olivos generados son el valor por defecto (Antonio, 2026-11-02). La decisión es UNA función pura (GeneradosPuro.activo, en el trozo
// [puro] de apps/web/motor/07ab_generados.js); aquí, en Node y sin navegador, sus combinaciones: la bandera manda (gen/escalera/0/no), y sin ella
// se activa solo si el build, el aparato y la finca (copas, copas_param, copas_id) lo permiten; si no, lo de siempre con su motivo (lo que dice ?debug).
// Que el motor sin bandera se comporta como con ?olivos=gen con una finca completa y, con ?olivos=0 o sin datos, como siempre, lo comprueba además
// pruebas/olivo/generados_motor.mjs (olivo.test.js); lo de Chrome (recuentos, presupuesto) lo mide el banco.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/07ab_generados.js");
const i = FUENTE.indexOf("var GeneradosPuro"), f = FUENTE.indexOf("// [puro:fin]");
assert.ok(i >= 0 && f > i, "07ab_generados.js debe definir GeneradosPuro dentro de [puro]");
const GP = new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn GeneradosPuro;")();

const COMPLETA = { copas: [[0, 0, 5, [1, 1, 1, 1, 1, 1, 1, 1]]], copas_param: [[5, 4, 0, 0, 0.8, 1, 0.1, 0]], copas_id: [7] };
const bandera = (b, d, c) => GP.activo(b, d, c).bandera;

test("la bandera manda: gen y escalera siempre (aunque falten datos), 0 y no apagan", () => {
  for (const d of [COMPLETA, {}, null, { copas: [[0]] }]) {
    assert.strictEqual(bandera("?olivos=gen", d, { constructor: false }), "gen");
    assert.strictEqual(bandera("?debug&olivos=escalera", d), "escalera");
    assert.strictEqual(GP.activo("?olivos=gen", d).defecto, false);
  }
  for (const v of ["0", "no"]) {
    const r = GP.activo("?olivos=" + v + "&debug", COMPLETA, {});
    assert.strictEqual(r.bandera, null); assert.strictEqual(r.defecto, false); assert.match(r.motivo, /a mano/);
  }
});

test("sin bandera y con todo: como ?olivos=gen, marcado como valor por defecto", () => {
  for (const b of ["", "?", "?debug", "?otra=1&olivosEscalera=0", undefined, "?olivos=", "?olivos=raro"]) {
    const r = GP.activo(b, COMPLETA, { batched: true, webgl2: true });
    assert.deepStrictEqual([r.bandera, r.defecto], ["gen", true], String(b));
  }
  assert.strictEqual(bandera("?x=1", COMPLETA), "gen", "las capacidades que no se saben no la niegan");
});

test("plan B: sin constructor, sin BatchedMesh, sin WebGL2 o sin datos de la finca, lo de siempre y con su motivo", () => {
  const casos = [
    [COMPLETA, { constructor: false }, /constructor/],
    [COMPLETA, { batched: false }, /BatchedMesh/],
    [COMPLETA, { webgl2: false }, /WebGL2/],
    [{ copas: [], copas_param: [], copas_id: [] }, {}, /copas/],
    [{ copas: COMPLETA.copas, copas_id: [7] }, {}, /copas_param/],
    [{ copas: COMPLETA.copas, copas_param: [null] }, {}, /copas_id/],
    [{ copas: COMPLETA.copas, copas_param: COMPLETA.copas_param }, {}, /copas_id/],
    [null, {}, /copas/], [undefined, undefined, /copas/],
  ];
  for (const [d, c, re] of casos) {
    const r = GP.activo("?debug", d, c);
    assert.strictEqual(r.bandera, null); assert.strictEqual(r.defecto, true); assert.match(r.motivo, re);
  }
});

test("el motor lee la bandera solo en ese punto (no se esparcen lecturas de ?olivos= por los módulos)", () => {
  const fs = require("node:fs"), path = require("node:path"), dir = path.join(__dirname, "..", "..", "apps", "web", "motor");
  const lee1 = n => fs.readFileSync(path.join(dir, n), "utf8");
  const lecturas = fs.readdirSync(dir).filter(n => /\.js$/.test(n) && /\[\?&\]olivos=/.test(lee1(n)));
  assert.deepStrictEqual(lecturas, ["07ab_generados.js"]);
});
