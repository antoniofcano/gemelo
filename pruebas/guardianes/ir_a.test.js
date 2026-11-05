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
  assert.ok(!/new THREE\.Mesh/.test(FUENTE), "reusa el anillo de la llegada: ninguna malla nueva (solo la línea de puntos)");
  assert.ok(!/addEventListener/.test(FUENTE), "sin oyentes propios: lo llama 09_camara");
});

// ---- rodear troncos y línea de puntos (EV2-B3)
function marco(n, m, sep) { const c = []; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) c.push({ x: i * sep, y: j * sep, oliv: true }); return c; }
function camina(st, pos, tope, copas) {   // simula actualizaPaseo: avanza y empuja fuera de los troncos (0,55 m)
  let t = 0, fin = null, minD = Infinity;
  for (; t < tope && !fin; t += 0.016) {
    const r = P.paso(st, pos, 0.016, 1.7); if (!r) break; fin = r.fin; pos.ang = r.ang;
    pos.x += Math.sin(pos.ang) * r.av * 1.7 * 0.016; pos.y += Math.cos(pos.ang) * r.av * 1.7 * 0.016;
    for (const c of copas) { const dx = pos.x - c.x, dy = pos.y - c.y, d = Math.hypot(dx, dy); if (d < 0.55) { pos.x = c.x + dx / d * 0.55; pos.y = c.y + dy / d * 0.55; } minD = Math.min(minD, d); }
  }
  return { fin, t, minD };
}

test("planifica: camino libre = solo el destino; con un tronco en medio, un punto por el lado libre", () => {
  assert.deepStrictEqual(P.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, [{ x: 5, y: 5, oliv: true }]), [{ x: 0, y: 10 }]);
  const ruta = P.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, [{ x: 0, y: 5, oliv: true }]);
  assert.strictEqual(ruta.length, 2); assert.deepStrictEqual(ruta[1], { x: 0, y: 10 });
  assert.ok(Math.hypot(ruta[0].x - 0, ruta[0].y - 5) >= P.R_TRONCO, "pasa a más de 1 m del tronco");
  const alto = P.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, [{ x: 0, y: 5, oliv: true }, { x: -1.3, y: 5, oliv: true }]);
  assert.ok(alto[0].x > 0, "si un lado está tapado por otro tronco, va por el otro");
  assert.ok(P.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, [{ x: 0, y: 5, oliv: false }]).length === 1, "lo que no es olivo no estorba");
});

test("andar a través de un marco de olivos de 6 m llega sin rendirse y sin pegarse al tronco", () => {
  const copas = marco(8, 8, 6), pos = { x: 3, y: 3, ang: 0.7 }, d = { x: 33, y: 33 };
  const ruta = P.planifica(pos, d, copas); assert.ok(ruta, "hay rodeo");
  const st = P.crea(); P.ir(st, d.x, d.y, ruta.slice(0, -1), copas);
  const r = camina(st, pos, 80, copas);
  assert.strictEqual(r.fin, "llego", JSON.stringify([r, pos, ruta]));
  assert.ok(r.minD > 0.55 - 1e-9);
});

test("sin rodeo posible no se cuelga (tope) y se rinde: atascado tras replanificar una vez", () => {
  const copas = []; for (let i = -3; i <= 3; i++) copas.push({ x: i * 0.9, y: 5, oliv: true });   // un muro de troncos
  const ext = [-50, 50, 50, -50], t0 = Date.now(); const ruta = P.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, copas, 1.0, [-50, 50, 50, -50]);
  assert.ok(Date.now() - t0 < 100, "el tope de tramos acota el tiempo");
  const st = P.crea(), pos = { x: 0, y: 0, ang: 0 }; P.ir(st, 0, 10, [], copas, ext);
  const r = camina(st, pos, 8, copas); assert.strictEqual(r.fin, "atascado", JSON.stringify([ruta, r]));
});

test("línea de puntos: sobre el camino, cada 1,2 m desde el destino, sin el del destino, se acorta al avanzar y respeta el tope", () => {
  const st = P.crea(); P.ir(st, 0, 12.5, [{ x: 3, y: 6 }]);
  const v = P.puntosLinea({ x: 0, y: 0 }, st, 1.2, 80);
  assert.ok(v.length >= 8 && v.length <= 14, String(v.length));
  assert.ok(v.every(p => Math.hypot(p.x - 0, p.y - 12.5) > 1.0), "ninguno sobre el destino");
  const w = P.puntosLinea({ x: 3, y: 6 }, st, 1.2, 80);
  assert.ok(w.length < v.length, "al avanzar quedan menos");
  assert.ok(Math.abs(w[w.length - 1].x - v[v.length - 1].x) < 1e-6 && Math.abs(w[w.length - 1].y - v[v.length - 1].y) < 1e-6, "los de delante no se mueven");
  st.dest = { x: 0, y: 500 }; assert.strictEqual(P.puntosLinea({ x: 0, y: 0 }, st, 1.2, 80).length, 80);
  P.cancela(st); assert.deepStrictEqual(P.puntosLinea({ x: 0, y: 0 }, st, 1.2, 80), []);
});

test("la línea de puntos es una sola malla, creada una vez, con dispose", () => {
  assert.strictEqual((FUENTE.match(/new THREE\.Points\(/g) || []).length, 1);
  assert.match(FUENTE, /geoP\.dispose\(\); matP\.dispose\(\)/);
});
