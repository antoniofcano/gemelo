"use strict";
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const VERSION = lee("VERSION").trim();
const LINEA = /\*\*Versión: v(\d+\.\d+\.\d+)\.?\*\*/;

test("VERSION es SemVer", () => assert.match(VERSION, /^\d+\.\d+\.\d+$/));

test("package.json dice la misma versión que VERSION", () => assert.strictEqual(JSON.parse(lee("package.json")).version, VERSION));

test("la primera versión publicada del CHANGELOG es VERSION y arriba hay un «No publicado»", () => {
  const c = lee("CHANGELOG.md");
  assert.match(c, /^## \[No publicado\]/m, "falta la sección «[No publicado]»");
  const primera = /^## \[(\d+\.\d+\.\d+)\]/m.exec(c);
  assert.ok(primera, "no hay ninguna versión en el CHANGELOG");
  assert.strictEqual(primera[1], VERSION, "el CHANGELOG llega a " + primera[1] + " y VERSION es " + VERSION + " (¿falta bajar «No publicado» a su versión en la release?)");
  assert.ok(c.indexOf("## [No publicado]") < c.indexOf("## [" + primera[1] + "]"), "«No publicado» debe ir arriba");
});

for (const f of ["CLAUDE.md", "README.md", "doc/ESTADO.md"]) {
  test("la línea «Versión» de " + f + " dice " + VERSION, () => {
    const m = LINEA.exec(lee(f));
    assert.ok(m, f + " no tiene la línea «**Versión: vX.Y.Z**»");
    assert.strictEqual(m[1], VERSION);
  });
}
