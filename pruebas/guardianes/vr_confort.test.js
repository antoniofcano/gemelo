"use strict";
// Q9: el confort anti-mareo de VR (VrConfortPuro en 29_vr.js), en Node y sin navegador: velocidades humanas, viñeta según la velocidad real,
// rampa de subida corta y frenado en seco; y que el código la usa (sin viñeta fija) y que ningún sombreador usa parámetros GLSL con nombre de matriz de three.
// NO probado en unas Quest.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const VR = lee("apps/web/motor/29_vr.js");
const i = VR.indexOf("var VrConfortPuro = (function"), f = VR.indexOf("var VrFichaPuro = (function");
assert.ok(i >= 0 && f > i);
const P = new Function("\"use strict\";\n" + VR.slice(i, f) + "\nreturn VrConfortPuro;")();

test("velocidades: andar a paso humano y sin pasar de trote a pie", () => {
  assert.ok(P.VEL.anda <= 1.4 && P.VEL.corre <= 3.0 && P.VEL.anda < P.VEL.corre && P.VEL.corre < P.VEL.vuela && P.VEL.vuela < P.VEL.vuelaRapido);
  assert.ok(P.VEL.vuelaRapido <= 20);
});
test("viñeta: parada = 0, crece con la velocidad, 'fuerte' cierra más, tope < 1", () => {
  assert.strictEqual(P.vineta(0, "suave", false).k, 0);
  let ant = -1; for (const v of [0, 0.5, 1.4, 3, 8, 20, 60]) { const k = P.vineta(v, "suave", false).k; assert.ok(k >= ant, "monótona en " + v); ant = k; }
  for (const v of [1.4, 3, 8, 20]) { assert.ok(P.vineta(v, "fuerte", false).k > P.vineta(v, "suave", false).k); assert.ok(P.vineta(v, "fuerte", false).k <= 0.95); }
  assert.ok(P.vineta(3, "suave", false).abre < P.vineta(1.4, "suave", false).abre, "la abertura se cierra al ir más rápido");
  assert.ok(P.vineta(1.4, "suave", false).k > 0 && P.vineta(1.4, "suave", false).k < P.vineta(8, "suave", false).k);
});
test("viñeta: en un giro o salto hay un mínimo aunque estés quieto; tipo desconocido = suave", () => {
  assert.ok(P.vineta(0, "suave", true).k >= 0.4);
  assert.deepStrictEqual(P.vineta(3, "rara", false), P.vineta(3, "suave", false));
});
test("rampa: sube en ~0,15 s y frena de golpe; la viñeta cierra rápido y abre despacio", () => {
  let f = 0, t = 0; while (f < 1) { f = P.rampa(f, 1, 1 / 72); t += 1 / 72; assert.ok(t < 0.2); }
  assert.ok(t >= 0.14 && t <= 0.17);
  assert.strictEqual(P.rampa(0.8, 0, 0.0139), 0);
  assert.strictEqual(P.rampa(0.3, 0.2, 0.0139), 0.2);
  assert.ok(P.sigue(0, 1, 0.1) > 1 - P.sigue(1, 0, 0.1), "cierra más deprisa de lo que abre");
});
test("el motor usa el Puro y la viñeta de siempre (sin llamadas de dibujo nuevas ni nombres reservados en GLSL)", () => {
  assert.ok(/VrConfortPuro\.vineta\(/.test(VR) && /VrConfortPuro\.rampa\(/.test(VR) && /VrConfortPuro\.VEL/.test(VR));
  assert.ok(!/\? 0\.55 : 0\)/.test(VR), "ya no hay viñeta fija a 0,55");
  const sh = VR.slice(VR.indexOf("var vrVineta = new THREE.Mesh"), VR.indexOf("vrVineta.position.set"));
  assert.ok(!/\b(vec[234]|mat[34]|float)\s+(viewMatrix|modelViewMatrix|projectionMatrix|normalMatrix)\b/.test(sh));
  assert.strictEqual((VR.match(/sombreador\("vineta-vr"/g) || []).length, 1);
});
