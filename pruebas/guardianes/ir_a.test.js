"use strict";
// Tocar para ir andando (apps/web/motor/12c_ir_a.js). La lógica pura (IrAPuro: toque frente a arrastre, URL > ajuste, girar, avanzar, llegar, atascarse, rodear troncos,
// línea de puntos) vive en apps/web/src/nucleo/locomocion.ts y sus pruebas pasaron a Vitest (A1-11): locomocion.test.ts. Aquí queda lo que cruza con el legado: que la costura
// con el paseo y la cámara sigue puesta en las fuentes y que la línea de puntos es una sola malla con dispose.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = require("./_fuente").fuenteMotor("12c_ir_a.js");   // A3-6c: el talón y mundos/comun/ir-a.ts

test("12c_ir_a.js toma su lógica pura del núcleo (IrAPuro = Nucleo.IrAPuro)", () => {
  assert.match(FUENTE, /^  var IrAPuro = Nucleo\.IrAPuro;$/m);
  assert.ok(!/\[puro:inicio\]/.test(FUENTE), "ya no lleva trozo puro propio");
});

test("la costura: 09_camara solo camina si no se eligió nada, 12_paseo cancela con mandos y al salir, el ajuste existe", () => {
  const cam = lee("apps/web/motor/09_camara.js"), paseo = lee("apps/web/motor/12_paseo.js"), aj = lee("apps/web/motor/33_ajustes.js");
  assert.match(cam, /if \(!elige\(e\.clientX, e\.clientY\)\) IrA\.toca\(/, "el toque sobre un olivo/baliza/persona sigue eligiendo y no camina");
  assert.match(cam, /function elige\(cx, cy\) \{ return Usables\.toque/);
  assert.match(paseo, /IrA\.paso\(dt, !!\(teclas\.up \|\| teclas\.down \|\| teclas\.left \|\| teclas\.right \|\| mandoPalanca\.av \|\| mandoPalanca\.lat \|\| mandoPalanca\.giro\)\)/);
  assert.match(paseo, /paseando = false; IrA\.cancela\(\)/);
  assert.match(aj, /"controles\.tocarIr": bool\(true\)/);
  assert.ok(!/new THREE\.Mesh/.test(FUENTE), "reusa el anillo de la llegada: ninguna malla nueva (solo la línea de puntos)");
  assert.ok(!/addEventListener/.test(FUENTE), "sin oyentes propios: lo llama 09_camara");
});


test("la línea de puntos es una sola malla, creada una vez, con dispose", () => {
  assert.strictEqual((FUENTE.match(/new THREE\.Points\(/g) || []).length, 1);
  assert.match(FUENTE, /geoP\.dispose\(\); matP\.dispose\(\)/);
});
