"use strict";
// Ventanas movibles (34_movibles.js, UX-FINCA-JUEGO §6), en Node y sin navegador: el cálculo del sitio libre con rectángulos, la forma de pantalla, el guardado
// (con un almacén que falla) y que el chat y el minimapa usan la pieza y conservan los ids que buscan otras pruebas. La prueba con arrastre real es la de
// Chrome por el banco (pruebas/guardianes/movibles_chrome.js, bajo petición).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/34_movibles.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i);
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn MoviblesPuro;")();
}
const M = puro();
const MG0 = { t: 0, b: 0, l: 0, r: 0 };
const cruzan = (a, b) => M.seCruzan(a, b);

// móvil vertical 390 × 844 con la cruceta abajo a la izquierda (como en UX §4) y la barra arriba a la derecha
const W = 390, H = 844;
const CRUCETA = M.engorda({ x: 12, y: 700, w: 150, h: 132 }, 6), BARRA = M.engorda({ x: 220, y: 12, w: 160, h: 44 }, 6), ESTADO = M.engorda({ x: 12, y: 12, w: 150, h: 44 }, 6);
const ZONAS = [CRUCETA, BARRA, ESTADO];

test("sin zonas en medio, la ventana se queda donde se pidió, dentro de los límites con 6 px de aire", () => {
  const t = { w: 300, h: 300 };
  let q = M.libre(t, 40, 200, ZONAS, W, H, MG0); assert.deepStrictEqual([q.x, q.y, q.libre], [40, 200, true]);
  q = M.libre(t, -50, -50, [], W, H, MG0); assert.deepStrictEqual([q.x, q.y], [6, 6]);
  q = M.libre(t, 999, 999, [], W, H, MG0); assert.deepStrictEqual([q.x, q.y], [W - 300 - 6, H - 300 - 6]);
});

test("encima de la cruceta: el chat acaba fuera de ella, en el hueco más cercano", () => {
  const t = { w: 300, h: 300 };
  const q = M.libre(t, 20, 640, ZONAS, W, H, MG0), r = { x: q.x, y: q.y, w: t.w, h: t.h };
  assert.strictEqual(q.libre, true);
  ZONAS.forEach(z => assert.ok(!cruzan(r, z), "no debe tapar " + JSON.stringify(z)));
  assert.ok(Math.hypot(q.x - 20, q.y - 640) < 300, "y no se va lejos: " + JSON.stringify(q));
});

test("la burbuja (56 px) arrastrada sobre la cruceta y sobre la barra también se aparta", () => {
  const t = { w: 56, h: 56 };
  for (const [x, y] of [[60, 740], [100, 790], [260, 20], [20, 20]]) {
    const q = M.libre(t, x, y, ZONAS, W, H, MG0), r = { x: q.x, y: q.y, w: 56, h: 56 };
    assert.ok(q.libre); ZONAS.forEach(z => assert.ok(!cruzan(r, z), "(" + x + "," + y + ") → " + JSON.stringify(q)));
  }
});

test("horizontal 844 × 390: cruceta a la izquierda, acciones a la derecha, estado arriba; el chat de 300 × 180 cabe en el centro", () => {
  const Wh = 844, Hh = 390, z = [{ x: 12, y: 150, w: 150, h: 228 }, { x: 690, y: 250, w: 142, h: 128 }, { x: 12, y: 12, w: 150, h: 44 }, { x: 600, y: 12, w: 232, h: 44 }].map(r => M.engorda(r, 6));
  const t = { w: 300, h: 180 }, q = M.libre(t, 20, 200, z, Wh, Hh, MG0), r = { x: q.x, y: q.y, w: 300, h: 180 };
  assert.ok(q.libre); z.forEach(zz => assert.ok(!cruzan(r, zz), JSON.stringify(q)));
});

test("sin hueco en ninguna parte: libre=false y la ventana queda dentro de los límites (no desaparece)", () => {
  const q = M.libre({ w: 200, h: 200 }, 10, 10, [{ x: 0, y: 0, w: 400, h: 400 }], 300, 300, MG0);
  assert.strictEqual(q.libre, false); assert.ok(q.x >= 6 && q.y >= 6);
});

test("las zonas seguras (muesca, barra de inicio) acotan el sitio", () => {
  const q = M.libre({ w: 100, h: 100 }, 0, 0, [], 400, 800, { t: 47, b: 34, l: 0, r: 0 });
  assert.strictEqual(q.y, 47 + 6);
  assert.strictEqual(M.libre({ w: 100, h: 100 }, 0, 9999, [], 400, 800, { t: 47, b: 34, l: 0, r: 0 }).y, 800 - 34 - 100 - 6);
});

test("la forma de pantalla: escritorio, vertical y horizontal (solo el táctil distingue)", () => {
  assert.strictEqual(M.forma(1280, 720, false), "escritorio"); assert.strictEqual(M.forma(720, 1280, false), "escritorio");
  assert.strictEqual(M.forma(390, 844, true), "vertical"); assert.strictEqual(M.forma(844, 390, true), "horizontal");
});

test("las esquinas de «Llevar a…» son las cuatro, dentro de los límites", () => {
  const t = { w: 100, h: 50 };
  assert.deepStrictEqual(M.esquina("ai", t, 400, 800, MG0), { x: 6, y: 6 });
  assert.deepStrictEqual(M.esquina("ad", t, 400, 800, MG0), { x: 294, y: 6 });
  assert.deepStrictEqual(M.esquina("bi", t, 400, 800, MG0), { x: 6, y: 744 });
  assert.deepStrictEqual(M.esquina("bd", t, 400, 800, MG0), { x: 294, y: 744 });
});

test("el teclado: flechas 16 px, con Mayús 64 px; las demás teclas no mueven", () => {
  assert.deepStrictEqual(M.mueve("ArrowLeft", false, 100, 100), { x: 84, y: 100 });
  assert.deepStrictEqual(M.mueve("ArrowDown", true, 100, 100), { x: 100, y: 164 });
  assert.strictEqual(M.mueve("a", false, 1, 1), null); assert.strictEqual(M.mueve("Home", false, 1, 1), null);
});

// ---------- el guardado
function almacen(roto) {
  const d = {};
  return { d, setItem: (k, v) => { if (roto) throw new Error("cuota"); d[k] = String(v); }, getItem: k => { if (roto) throw new Error("bloqueado"); return k in d ? d[k] : null; }, removeItem: k => { if (roto) throw new Error("bloqueado"); delete d[k]; } };
}

test("guardar y leer por forma de pantalla, en fracciones del contenedor (no vale el de otra forma)", () => {
  const a = almacen();
  assert.strictEqual(M.guarda(a, "chat", "vertical", 39, 211, 390, 844), true);
  assert.ok("gemelo.chat.pos.vertical" in a.d, Object.keys(a.d).join());
  assert.deepStrictEqual(M.lee(a, "chat", "vertical", 390, 844), { x: 39, y: 211 });
  assert.deepStrictEqual(M.lee(a, "chat", "vertical", 780, 1688), { x: 78, y: 422 }, "fracciones: sirve si cambia el tamaño");
  assert.strictEqual(M.lee(a, "chat", "horizontal", 844, 390), null);
  assert.strictEqual(M.lee(a, "burbuja", "vertical", 390, 844), null);
});

test("un almacén que falla o un valor roto no rompen nada: se devuelve null/false", () => {
  const roto = almacen(true);
  assert.strictEqual(M.guarda(roto, "chat", "escritorio", 1, 1, 100, 100), false);
  assert.strictEqual(M.lee(roto, "chat", "escritorio", 100, 100), null);
  assert.strictEqual(M.olvida(roto, ["chat"]), false);
  assert.strictEqual(M.guarda(null, "chat", "escritorio", 1, 1, 100, 100), false); assert.strictEqual(M.lee(null, "chat", "escritorio", 1, 1), null);
  const a = almacen(); a.d["gemelo.chat.pos.escritorio"] = "{no es json"; assert.strictEqual(M.lee(a, "chat", "escritorio", 1, 1), null);
  a.d["gemelo.chat.pos.escritorio"] = JSON.stringify({ fx: "x", fy: 2 }); assert.strictEqual(M.lee(a, "chat", "escritorio", 1, 1), null);
  assert.strictEqual(M.guarda(a, "chat", "escritorio", 1, 1, 0, 100), false, "contenedor sin medidas");
});

test("«Devolver a su sitio» borra lo guardado de las tres formas", () => {
  const a = almacen();
  ["escritorio", "vertical", "horizontal"].forEach(f => M.guarda(a, "mapa", f, 5, 5, 100, 100)); M.guarda(a, "chat", "vertical", 5, 5, 100, 100);
  assert.strictEqual(M.olvida(a, ["mapa"]), true);
  assert.deepStrictEqual(Object.keys(a.d), ["gemelo.chat.pos.vertical"]);
});

// ---------- lo que el chat y el minimapa guardan de siempre
test("el chat usa Movibles, sigue con sus ids (#presenciaGente, «Volver a entrar», ol, input) y mete el texto con textContent", () => {
  const P = lee("apps/web/motor/26_presencia.js");
  assert.match(P, /Movibles\.hazMovible\(raiz, asa, "chat"/); assert.match(P, /Movibles\.hazMovible\(burbuja, burbuja, "burbuja"/);
  assert.match(P, /id: "presenciaGente"/); assert.match(P, /"Volver a entrar"/); assert.match(P, /getElementById\("ventanaGente"\)/);
  assert.match(P, /"aria-live": "polite", "aria-label": "Chat de la visita"/); assert.match(P, /type: "text", maxLength: Chat\.MAX/);
  assert.match(P, /function irCon\(id\)/); assert.match(P, /"Ir con " \+ m\.alias/); assert.match(P, /bloqueados\[x\.id\]/);
  assert.doesNotMatch(P, /innerHTML/);
});

test("el minimapa usa Movibles, la brújula ya no lo oculta y M lo pliega", () => {
  const S = lee("apps/web/motor/17_minimapa.js");
  assert.match(S, /Movibles\.hazMovible\(wrap, asa, "mapa"/);
  assert.doesNotMatch(S, /bru\.addEventListener/);
  assert.match(S, /e\.code !== "KeyM"[\s\S]{0,200}plega\(!mini\.oculto\)/);
});

test("el módulo recorre solo lo que debe: Pointer Events, touch-action solo en el asa, Intro/Espacio por clic sin detalle, y sin red", () => {
  assert.match(FUENTE, /touchAction = "none"/); assert.match(FUENTE, /pointerdown/); assert.match(FUENTE, /setPointerCapture/);
  assert.match(FUENTE, /e\.detail === 0/); assert.match(FUENTE, /Hud\.zonasProhibidas/);
  assert.doesNotMatch(FUENTE, /fetch\(|innerHTML|import\(/);
});
