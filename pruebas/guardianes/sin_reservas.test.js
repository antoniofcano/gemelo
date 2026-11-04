"use strict";
// AG-1.4 · cero reservas por fotograma: en Node, sin navegador. Dos cosas:
//  1. Las funciones del bucle que lista _reservas.js (15_tiempo: nivelEn; 16_vida; 16b_fauna; 38_presencia_compartida) no reservan memoria: ni `new`, ni cierres,
//     ni literales de objeto o de array, ni .map/.filter/.slice…, ni cadenas concatenadas. Lo reutilizable va en temporales del módulo.
//  2. El texto del HUD y el de ?debug se refrescan a 4 Hz como mucho (no cada fotograma).
// Esto cuenta lo que SE RESERVA, no lo que cuesta: los milisegundos y los tirones solo los da un dispositivo real (?debug), y en el casco, no probado.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const R = require("./_reservas");

// ---------- el propio analizador (que no falle en falso ni calle de más) ----------
const qs = (cuerpoFn) => R.reservas("function f(dt) {\n" + cuerpoFn + "\n}", "f", "function f(") || [];
const quees = (cuerpoFn) => qs(cuerpoFn).map(r => r.que);

test("el analizador ve lo que siempre reserva", () => {
  assert.deepStrictEqual(quees("var v = new THREE.Vector3(1, 2, 3);"), ["new"]);
  assert.ok(quees("a.forEach(function (x) { x.y = 1; });").includes("cierre"));
  assert.ok(quees("a.forEach(x => x.go());").includes("cierre"));
  assert.ok(quees("var o = { x: 1 };").includes("literal de objeto"));
  assert.ok(quees("return { x: 1 };").includes("literal de objeto"));
  assert.ok(quees("var l = [1, 2];").includes("literal de array"));
  assert.ok(quees("[a, b].forEach(g);").includes("literal de array"));
  assert.ok(quees("var m = l.map(g);").includes("método que reserva"));
  assert.ok(quees("var m = l.slice(1);").includes("método que reserva"));
  assert.ok(quees("t.textContent = 'a ' + n;").includes("cadena concatenada"));
  assert.ok(quees("var k = Object.keys(o);").includes("Object/JSON/Array.from/String()"));
});

test("el analizador no se queja de lo que no reserva", () => {
  assert.deepStrictEqual(qs("if (a) { b(); } else { c(); }\nfor (var i = 0; i < n; i++) { v[i] = w[i + 1]; }\nvar x = a[0] + b[i][2];\ntry { f(); } catch (e) { }"), []);
  assert.deepStrictEqual(qs("v.set(1, 2, 3).applyQuaternion(q); m.compose(p, q, s);"), []);
  assert.deepStrictEqual(qs("var s = a ? b : c; switch (k) { case 1: x(); break; }"), []);
  assert.deepStrictEqual(qs("// new THREE.Vector3() y [1, 2] y { x: 1 } en un comentario\nvar z = 1; /* function () {} */"), []);
  assert.deepStrictEqual(qs("var t = \"{ [new X] } function\"; f(t);"), [], "el contenido de las cadenas no cuenta");
  assert.deepStrictEqual(qs("foo(a, b); // una llave } suelta en un comentario"), []);
});

test("una línea con «reserva-ok» queda fuera; el resto de la función, no", () => {
  assert.deepStrictEqual(qs("var o = { x: 1 };   // reserva-ok: un suceso raro, no por fotograma"), []);
  assert.strictEqual(qs("var o = { x: 1 };   // reserva-ok: raro\nvar p = new Q();").length, 1);
});

test("cuerpo() corta la función entera aunque haya llaves en cadenas y bloques anidados", () => {
  const src = "function g(a, b) { if (a) { x(\"}\"); } return b; }\nfunction h() { return 1; }";
  assert.strictEqual(R.cuerpo(src, "function g(").trim(), "if (a) { x(\"}\"); } return b;");
  assert.strictEqual(R.cuerpo(src, "function nada("), null);
});

// ---------- los módulos del bucle ----------
const total = R.recuenta();
for (const f of Object.keys(total)) {
  test("[" + f + "] las funciones del bucle no reservan por fotograma", () => {
    assert.deepStrictEqual(total[f].faltan, [], "función del bucle que ya no se encuentra: actualiza BUCLE en pruebas/guardianes/_reservas.js");
    const malas = total[f].detalle.map(d => d.fn + ":" + d.linea + " [" + d.que + "] " + d.txt);
    assert.deepStrictEqual(malas, [], "reservas por fotograma (usa un temporal del módulo; si es un suceso raro, «// reserva-ok: motivo»)");
  });
}

// ---------- el HUD y ?debug: a 4 Hz como mucho ----------
test("el HUD refresca su estado a 4 Hz como mucho (31_hud.js)", () => {
  const m = /setInterval\(refresca,\s*(\d+)\)/.exec(lee("apps/web/motor/31_hud.js"));
  assert.ok(m, "31_hud.js debe refrescar su estado con setInterval(refresca, ms)");
  assert.ok(Number(m[1]) >= 250, "refresca() va cada " + m[1] + " ms: como mucho 4 Hz");
});

test("el texto del dron se escribe a 4 Hz como mucho (16_vida.js)", () => {
  const cu = R.cuerpo(lee("apps/web/motor/16_vida.js"), "function vidaDron(");
  assert.ok(/if \(ins\.d > 0\.25\) \{[^}]*textContent = textoDron\(/.test(cu), "tDron solo se escribe cuando ins.d pasa de 0,25 s");
});

test("el contador de ?debug refresca su texto cada 500 ms como mucho (28_depura.js)", () => {
  const cu = R.cuerpo(lee("apps/web/motor/28_depura.js"), "function depuraCuadro(");
  const i = cu.indexOf("if (ahora - dep.t0 < 500) return;"), j = cu.indexOf(".textContent");
  assert.ok(i > 0 && j > i, "el texto del contador debe escribirse después de la puerta de 500 ms");
});

// ---------- el nivel del sol y los llamadores de 16_vida (AG-1.4b) ----------
test("16_vida.js pide el nivel del sol por fotograma con nivelEn (un temporal del módulo), no con nivel(), que reserva", () => {
  const v = lee("apps/web/motor/16_vida.js");
  assert.ok(!/nivel\(/.test(v), "16_vida.js no debe llamar a nivel(ms) (reserva dos objetos por llamada): usa nivelEn(ms, lvVida)");
  assert.ok(/nivelEn\(cur\.ms, lvVida\)/.test(v));
  assert.ok(!/nivel\(/.test(lee("apps/web/motor/16b_fauna.js")), "16b_fauna.js tampoco");
});

test("nivel(ms) reserva (es la de siempre) y nivelEn no: el analizador lo ve en las dos", () => {
  const src = lee("apps/web/motor/15_tiempo.js");
  assert.ok(R.reservas(src, "nivel", "function nivel(").length > 0, "nivel(ms) devuelve objetos nuevos");
  assert.deepStrictEqual(R.reservas(src, "nivelEn", "function nivelEn("), []);
});
