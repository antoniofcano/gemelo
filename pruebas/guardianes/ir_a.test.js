"use strict";
// Tocar para ir andando (apps/web/motor/12c_ir_a.js): el trozo puro, en Node y sin navegador. Toque corto frente a arrastre, URL > ajuste,
// girar hacia el punto, avanzar sin pasarse, llegar, atascarse, y que la costura con el paseo y la cámara sigue puesta en las fuentes.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/12c_ir_a.js");
const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
assert.ok(i >= 0 && f > i, "12c_ir_a.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
const P = new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn IrAPuro;")();

test("toque corto sí; arrastre o pulsación larga no (según el puntero)", () => {
  assert.ok(P.esToque(0, 120, "mouse") && P.esToque(5, 399, "mouse"));
  assert.ok(!P.esToque(7, 100, "mouse"), "7 px con ratón ya es arrastre");
  assert.ok(P.esToque(11, 100, "touch") && !P.esToque(13, 100, "touch"), "el dedo tiembla más");
  assert.ok(!P.esToque(2, 401, "mouse"), "pulsación larga");
  assert.ok(P.esToque(6, 100, "otro"), "tipo desconocido: como el ratón");
});

test("URL > ajuste > encendido por defecto", () => {
  assert.strictEqual(P.activa(undefined, ""), true);
  assert.strictEqual(P.activa(true, "?debug"), true);
  assert.strictEqual(P.activa(false, ""), false);
  assert.strictEqual(P.activa(true, "?tocar=0"), false);
  assert.strictEqual(P.activa(false, "?a=1&tocar=1"), true);
  assert.strictEqual(P.activa(true, "?tocar=10"), true, "valor no válido: se ignora");
});

test("rumbo: 0 = norte, π/2 = este; la diferencia de ángulos va por el lado corto", () => {
  assert.ok(Math.abs(P.rumbo(0, 0, 0, 10)) < 1e-9);
  assert.ok(Math.abs(P.rumbo(0, 0, 10, 0) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(P.difAng(3.0, -3.0) - (2 * Math.PI - 6)) < 1e-9, "de 3 a −3 rad son 0,28 rad hacia delante");
  assert.ok(Math.abs(P.difAng(0, 0.5) - 0.5) < 1e-9);
});

test("gira a lo sumo GIRO·dt y no se pasa de la meta", () => {
  assert.ok(Math.abs(P.gira(0, 3, 0.1) - P.GIRO * 0.1) < 1e-9);
  assert.strictEqual(P.gira(0, 0.01, 0.1), 0.01);
  assert.ok(P.gira(0, -1, 0.1) < 0);
});

test("avance: entero de frente, nada de espaldas, justo lo que falta al llegar", () => {
  assert.ok(Math.abs(P.avance(50, 0, 0.016, 1.7) - 1) < 1e-9);
  assert.strictEqual(P.avance(50, Math.PI, 0.016, 1.7), 0);
  assert.strictEqual(P.avance(50, Math.PI / 2 + 0.1, 0.016, 1.7), 0);
  assert.ok(P.avance(0.01, 0, 0.016, 1.7) < 0.5, "casi en el punto: frena");
});

test("caminar hasta el punto: llega, sin pasarse, a la velocidad de paseo y recto", () => {
  const st = P.crea(), pos = { x: 0, y: 0, ang: 0 }; P.ir(st, 3, 20);
  let t = 0, fin = null, vmax = 0;
  for (; t < 60 && !fin; t += 0.016) {
    const r = P.paso(st, pos, 0.016, 1.7); if (!r) break; fin = r.fin; pos.ang = r.ang;
    const v = r.av * 1.7; vmax = Math.max(vmax, v);
    pos.x += Math.sin(pos.ang) * v * 0.016; pos.y += Math.cos(pos.ang) * v * 0.016;
  }
  assert.strictEqual(fin, "llego");
  assert.ok(Math.hypot(pos.x - 3, pos.y - 20) < P.LLEGA + 0.05, JSON.stringify(pos));
  assert.ok(vmax <= 1.7 + 1e-9, "nunca más rápido que andar");
  assert.ok(t > 20.2 / 1.7 - 0.5 && t < 20.2 / 1.7 + 2.5, "tarda lo que andar esa distancia (más el giro): " + t);
  assert.strictEqual(st.dest, null, "al llegar no queda destino");
});

test("de espaldas al destino primero gira (sin andar hacia atrás) y luego anda", () => {
  const st = P.crea(), pos = { x: 0, y: 0, ang: Math.PI }; P.ir(st, 0, 30);
  const r1 = P.paso(st, pos, 0.016, 1.7); assert.strictEqual(r1.av, 0, "aún de espaldas");
  let r = r1; for (let k = 0; k < 70; k++) { r = P.paso(st, pos, 0.016, 1.7); pos.ang = r.ang; }
  assert.ok(r.av > 0.9 && Math.abs(P.difAng(pos.ang, 0)) < 0.05, "tras ~1 s (π a 3,2 rad/s) mira al destino y anda");
});

test("otro toque cambia el destino; cancelar lo borra; sin destino no hay paso", () => {
  const st = P.crea(), pos = { x: 0, y: 0, ang: 0 };
  assert.strictEqual(P.paso(st, pos, 0.016, 1.7), null);
  P.ir(st, 10, 10); P.ir(st, -5, 8); assert.deepStrictEqual(st.dest, { x: -5, y: 8 });
  P.cancela(st); assert.strictEqual(P.paso(st, pos, 0.016, 1.7), null);
});

test("atascado: si andando no se acerca (un tronco) se rinde en ~1,2 s", () => {
  const st = P.crea(), pos = { x: 0, y: 0, ang: 0 }; P.ir(st, 0, 30);
  let fin = null, t = 0; for (; t < 5 && !fin; t += 0.016) fin = P.paso(st, pos, 0.016, 1.7).fin;   // la posición no cambia: algo lo para
  assert.strictEqual(fin, "atascado"); assert.ok(t > 1.1 && t < 1.6, String(t));
});

test("la costura: 09_camara solo camina si no se eligió nada, 12_paseo cancela con mandos y al salir, el ajuste existe", () => {
  const cam = lee("apps/web/motor/09_camara.js"), paseo = lee("apps/web/motor/12_paseo.js"), aj = lee("apps/web/motor/33_ajustes.js");
  assert.match(cam, /if \(!elige\(e\.clientX, e\.clientY\)\) IrA\.toca\(/, "el toque sobre un olivo/baliza/persona sigue eligiendo y no camina");
  assert.match(cam, /function elige\(cx, cy\) \{ return Usables\.toque/);
  assert.match(paseo, /IrA\.paso\(dt, !!\(teclas\.up \|\| teclas\.down \|\| teclas\.left \|\| teclas\.right \|\| mandoPalanca\.av \|\| mandoPalanca\.lat \|\| mandoPalanca\.giro\)\)/);
  assert.match(paseo, /paseando = false; IrA\.cancela\(\)/);
  assert.match(aj, /"controles\.tocarIr": bool\(true\)/);
  assert.ok(!/new THREE\.Mesh/.test(FUENTE), "reusa el anillo de la llegada: ninguna malla nueva");
  assert.ok(!/addEventListener/.test(FUENTE), "sin oyentes propios: lo llama 09_camara");
});
