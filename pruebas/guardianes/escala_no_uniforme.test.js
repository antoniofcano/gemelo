"use strict";
// AG-1.11 (doc/sistema/ESCALA-NO-UNIFORME.md): fija en Node, sin navegador, (1) las propiedades de la cuenta que reproduce pruebas/medida_escala_no_uniforme.js y
// (2) que el motor sigue aplicando la exageración como escala no uniforme en la matriz del grupo; si eso cambia, el documento hay que revisarlo.
const test = require("node:test"), assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const M = require("../medida_escala_no_uniforme.js");
const k = 2 * Math.tan(Math.PI / 6) / 1080, deg = Math.PI / 180;

test("con exag > 1 la librería pide el mismo detalle a ras y hasta exag veces más desde arriba", () => {
  for (const e of [1.25, 2, 3]) {
    const est = th => M.errorLibreria(8, 300, th, e, k) / M.errorLibreria(8, 300, th, 1, k);
    assert.ok(Math.abs(est(0) - 1) < 1e-12, "a ras, igual que sin exagerar");
    assert.ok(Math.abs(est(90 * deg) - e) < 1e-9, "desde arriba, ×exag");
    let prev = 1; for (let t = 5; t <= 90; t += 5) { const v = est(t * deg); assert.ok(v >= prev - 1e-12 && v <= e + 1e-9); prev = v; }
  }
});

test("el cruce con el error visto es exacto y deja a ras corto y arriba largo", () => {
  for (const e of [1.25, 2, 3]) {
    const c = M.elevacionDeCruce(e);
    assert.ok(Math.abs(M.errorLibreria(8, 300, c, e, k) - M.errorVisto(8, 300, c, e, k)) < 1e-9);
    assert.ok(M.errorLibreria(8, 300, 0, e, k) < M.errorVisto(8, 300, 0, e, k));
    assert.ok(M.errorLibreria(8, 300, 80 * deg, e, k) > M.errorVisto(8, 300, 80 * deg, e, k));
  }
  assert.ok(Math.abs(M.elevacionDeCruce(3) / deg - 57.0) < 0.1);
});

test("el motor sigue poniendo la exageración como escala no uniforme del grupo (si cambia, revisar el doc)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "apps", "web", "motor", "04b_escena3d.js"), "utf8");
  assert.match(src, /makeScale\(1, exag, 1\)/);
  assert.match(src, /tiles\.group\.matrix\.copy\(M\)/);
});
