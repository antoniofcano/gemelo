"use strict";
// Las láminas del mundo (apps/web/motor/02d_laminas.js, ADR-0023 C8): un lienzo 2D como textura de un cartel anclado al mundo. En Node y sin navegador:
// la parte pura (coordenadas del toque, giro, medidas, validación) y, con un THREE de mentira, que abrir crea UNA malla y UNA textura, que solo se repinta
// si cambia la firma, que cerrar (a mano, por distancia, al salir de VR o al reabrir) libera todo, y que el rayo y el gatillo llegan a alTocar(u, v) con
// las coordenadas de la lámina (u de izquierda a derecha, v de arriba abajo). Chrome (1 llamada y 1 textura de verdad): fichas_tiempo.test.js.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/02d_laminas.js");
function trozo(ini, fin) {
  const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin);
  assert.ok(i >= 0 && f > i, "02d_laminas.js debe marcar " + ini + " … " + fin);
  return FUENTE.slice(i, f);
}
const P = new Function("\"use strict\";\n" + trozo("// [puro:inicio]", "// [puro:fin]") + "\nreturn LaminasPuro;")();

test("puro: la uv de three pasa a (u, v) con v de ARRIBA a abajo y a píxeles del lienzo", () => {
  assert.deepStrictEqual(P.toque({ x: 0, y: 1 }, 1024, 704), { u: 0, v: 0, x: 0, y: 0 }, "arriba a la izquierda");
  assert.deepStrictEqual(P.toque({ x: 1, y: 0 }, 1024, 704), { u: 1, v: 1, x: 1024, y: 704 }, "abajo a la derecha");
  const t = P.toque({ x: 0.25, y: 0.75 }, 400, 200); assert.deepStrictEqual([t.u, t.v, t.x, t.y], [0.25, 0.25, 100, 50]);
});

test("puro: el giro empieza pasados 8°, acaba cerca de 1°, no pasa de 60°/s y no gira si está quieta", () => {
  assert.deepStrictEqual(P.giro(0.1, 0.016, false), { girando: false, paso: 0 }, "menos de 8°: quieta");
  const g = P.giro(0.5, 0.016, false); assert.ok(g.girando && g.paso > 0 && g.paso <= 1.05 * 0.016 + 1e-12, JSON.stringify(g));
  assert.ok(P.giro(-2, 0.016, true).paso < 0, "gira hacia el lado corto");
  assert.strictEqual(P.giro(0.01, 0.016, true).girando, false, "llegó");
  assert.ok(P.giro(0.05, 0.016, true).girando, "ya girando, sigue hasta ~1°");
});

test("puro: medidas del lienzo (px dados o ancho·800) y validación", () => {
  assert.deepStrictEqual(P.medidas({ ancho: 1.3, alto: 0.9, w: 1024, h: 704 }), { w: 1024, h: 704 });
  assert.deepStrictEqual(P.medidas({ ancho: 1, alto: 0.5 }), { w: 800, h: 400 });
  assert.deepStrictEqual(P.medidas({ ancho: 1, alto: 0.5, pxPorM: 1000 }), { w: 1000, h: 500 });
  assert.deepStrictEqual(P.valida({ id: "a", ancho: 1, alto: 1, pinta() {} }), []);
  assert.ok(P.valida({ id: "", ancho: 0, alto: 1 }).length >= 3);
  assert.ok(P.valida({ id: "a", ancho: 1, alto: 1, pinta() {}, alTocar: 3 }).length === 1);
});

// ---------- con un THREE de mentira
function mundo() {
  const reg = { creadas: [], liberadas: [], escena: new Set(), bus: {} };
  class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); }
    setFromMatrixPosition(m) { return this.set(m.p[0], m.p[1], m.p[2]); } lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; } normalize() { const l = Math.sqrt(this.lengthSq()) || 1; return this.set(this.x / l, this.y / l, this.z / l); } }
  const recurso = tipo => class { constructor(a) { this.tipo = tipo; this.a = a; reg.creadas.push(this); } dispose() { reg.liberadas.push(this); } };
  const THREE = { Vector3: V3, LinearFilter: 1006, CanvasTexture: recurso("textura"), PlaneGeometry: recurso("geometria"), MeshBasicMaterial: recurso("material"),
    Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.position = new V3(); this.rotation = new V3(); this.rotation.set = (x, y, z) => { this.rotation.x = x; this.rotation.y = y; this.rotation.z = z; }; } updateMatrixWorld() {} } };
  const camera = { matrixWorld: { p: [0, 1.6, 0] }, updateMatrixWorld() {}, getWorldDirection: v => v.set(0, 0, -1) };
  const scene = { add: o => reg.escena.add(o), remove: o => reg.escena.delete(o) }, lienzos = [];
  const documento = { createElement: () => { const cx = { n: 0 }, cv = { width: 0, height: 0, getContext: () => cx }; lienzos.push(cv); return cv; } };
  const VRX = { on: false, cab: new V3() }, renderer = { info: { render: { frame: 0 } } }, errores = [];
  const Bus = { on: (ev, f) => { (reg.bus[ev] = reg.bus[ev] || []).push(f); return () => {}; } };
  const L = new Function("THREE", "scene", "camera", "renderer", "texColor", "VRX", "document", "performance", "Bus", "console",
    "\"use strict\";\n" + trozo("// [puro:inicio]", "// [puro:fin]") + trozo("// [motor:inicio]", "// [motor:fin]") + "\nreturn Laminas;")(THREE, scene, camera, renderer, t => t, VRX, documento, { now: () => 0 }, Bus,
    { error: (...a) => errores.push(a.join(" ")) });
  return { L, reg, lienzos, VRX, camera, renderer, errores };
}
// una lámina de 1 × 0,5 m con su firma en una variable
function def(extra) { const e = { v: "a", pintadas: 0, cierres: [] }; return Object.assign(e, { id: "l1", ancho: 1, alto: 0.5, firma: () => e.v, pinta: () => { e.pintadas++; } }, extra); }

test("abrir crea UNA malla y UNA textura delante de la mirada, a la altura de los ojos; cerrar libera geometría, material, textura y lienzo", () => {
  const { L, reg, lienzos } = mundo(), d = def({ alCierra: m => d.cierres.push(m) });
  assert.strictEqual(L.abre(d), true);
  assert.strictEqual(reg.escena.size, 1, "una malla en la escena (una llamada de dibujo)");
  assert.deepStrictEqual(reg.creadas.map(x => x.tipo).sort(), ["geometria", "material", "textura"]);
  const i = L.info("l1"); assert.ok(i.abierta && i.modo === "pantalla" && i.w === 800 && i.h === 400, JSON.stringify(i));
  assert.ok(Math.abs(i.pos[2] + 2.4) < 1e-9 && Math.abs(i.pos[1] - 1.5) < 1e-9, "a 2,4 m y 10 cm bajo los ojos: " + i.pos);
  assert.strictEqual(d.pintadas, 1);
  assert.strictEqual(L.cierra("l1"), true);
  assert.strictEqual(reg.escena.size, 0); assert.deepStrictEqual(reg.liberadas.map(x => x.tipo).sort(), ["geometria", "material", "textura"]);
  assert.strictEqual(lienzos[0].width, 0, "el lienzo se suelta"); assert.deepStrictEqual(d.cierres, ["cerrada"]);
  assert.strictEqual(L.cierra("l1"), false, "cerrar dos veces no rompe nada");
  assert.deepStrictEqual(L.cuenta(), { abiertas: 1, cerradas: 1, pintadas: 1, vivas: 0 });
});

test("con «en» se cuelga de un sitio del mundo (P7f: la imagen de un olivo) en vez de ponerse delante de la mirada; se libera igual", () => {
  const { L, reg } = mundo(), d = def({ en: { x: 30, y: 4, z: -10 } });
  assert.strictEqual(L.abre(d), true); const i = L.info("l1");
  assert.deepStrictEqual(i.pos, [30, 4, -10], "en el sitio dado, no a 2,4 m de la cabeza"); assert.strictEqual(reg.escena.size, 1, "sigue siendo UNA malla");
  L.cierra("l1"); assert.strictEqual(reg.escena.size, 0); assert.deepStrictEqual(reg.liberadas.map(x => x.tipo).sort(), ["geometria", "material", "textura"]);
});

test("se repinta SOLO si cambia la firma (o se fuerza); sin firma, repinta(id) pinta siempre y revisa nunca", () => {
  const { L } = mundo(), d = def();
  L.abre(d); L.revisa(); L.revisa(); assert.strictEqual(d.pintadas, 1, "nada cambió");
  assert.strictEqual(L.repinta("l1"), false); d.v = "b"; assert.strictEqual(L.repinta("l1"), true); assert.strictEqual(d.pintadas, 2);
  d.v = "c"; L.revisa(); assert.strictEqual(d.pintadas, 3, "revisa repinta si cambió"); L.revisa(); assert.strictEqual(d.pintadas, 3);
  assert.strictEqual(L.repinta("l1", true), true); assert.strictEqual(d.pintadas, 4, "forzado");
  assert.strictEqual(L.repinta("no-existe"), false);
  L.cierraTodas();
  const s = { n: 0 }, ds = { id: "s", ancho: 1, alto: 1, pinta: () => { s.n++; } };
  L.abre(ds); L.revisa(); L.revisa(); assert.strictEqual(s.n, 1, "sin firma, revisa no repinta"); L.repinta("s"); assert.strictEqual(s.n, 2, "sin firma, repinta pinta siempre");
});

test("revisa(dt) hace el repaso cada 0,5 s, no cada fotograma", () => {
  const { L } = mundo(), d = def(); L.abre(d); d.v = "x";
  for (let i = 0; i < 20; i++) L.revisa(0.016); assert.strictEqual(d.pintadas, 1, "0,32 s: aún no");
  for (let i = 0; i < 12; i++) L.revisa(0.016); assert.strictEqual(d.pintadas, 2, "pasados 0,5 s: repinta");
});

test("se cierra sola si te alejas (60 m en pantalla, 40 en VR, o lo que diga cierraA), al salir de VR y al reabrirla; dice por qué", () => {
  const { L, reg, VRX, camera } = mundo(), d = def({ alCierra: m => d.cierres.push(m) });
  L.abre(d); camera.matrixWorld.p = [0, 1.6, 50]; L.revisa(); assert.ok(L.hay("l1"), "a 52 m aún");
  camera.matrixWorld.p = [0, 1.6, 70]; L.revisa(); assert.ok(!L.hay("l1")); assert.deepStrictEqual(d.cierres.splice(0), ["lejos"]);
  camera.matrixWorld.p = [0, 1.6, 0];
  L.abre(Object.assign({}, d, { cierraA: { pantalla: 3 } })); L.revisa(); assert.ok(L.hay("l1"), "a 2,4 m de una que cierra a 3 m: sigue");
  camera.matrixWorld.p = [0, 1.6, 10]; L.revisa(); assert.ok(!L.hay("l1")); d.cierres.length = 0;
  camera.matrixWorld.p = [0, 1.6, 0];
  VRX.on = true; assert.strictEqual(L.abre(d), true); assert.strictEqual(L.info("l1").modo, "vr"); assert.ok(Math.abs(L.info("l1").pos[2] + 1.4) < 1e-9, "1,4 m en VR");
  VRX.on = false; L.revisa(); assert.ok(!L.hay("l1")); assert.deepStrictEqual(d.cierres.splice(0), ["sale-vr"]);
  VRX.on = true; L.abre(d); reg.bus["vr:sale"][0](); assert.ok(!L.hay("l1"), "vr:sale la cierra de inmediato"); assert.deepStrictEqual(d.cierres.splice(0), ["sale-vr"]); VRX.on = false;
  L.abre(d); L.abre(d); assert.deepStrictEqual(d.cierres.splice(0), ["reabierta"], "reabrir la misma id cierra la anterior");
  L.abre(def({ id: "pant", modo: "pantalla" })); VRX.on = true; L.revisa(); assert.ok(L.hay("pant"), "una de pantalla no se cierra al estar en VR");
  VRX.on = false; L.cierraTodas(); assert.deepStrictEqual(L.ids(), []);
  assert.strictEqual(reg.creadas.length, reg.liberadas.length, "ni geometría, ni material, ni textura vivas");
});

test("lo que no es una lámina válida no se abre y lo dice en la consola", () => {
  const { L, reg, errores } = mundo();
  assert.strictEqual(L.abre({ id: "x" }), false); assert.strictEqual(reg.escena.size, 0); assert.ok(errores.length === 1 && /no válida/.test(errores[0]));
});

test("el rayo y el gatillo: alTocar(u, v, t) con las coordenadas de la lámina; la más cercana gana; false deja pasar el gatillo", () => {
  const { L } = mundo(), toques = [];
  const rayo = (...hits) => ({ intersectObject: o => (hits.find(h => h.id === o.name.slice(7)) ? [hits.find(h => h.id === o.name.slice(7)).ix] : []) });
  L.abre(def({ id: "a", alTocar: (u, v, t) => { toques.push(["a", u, v, t.x, t.y, t.lam.id]); } }));
  L.abre(def({ id: "b", alTocar: () => false }));
  L.abre(def({ id: "c" }));   // sin alTocar: no recibe
  assert.strictEqual(L.toca(rayo()), false, "el rayo no toca nada");
  assert.strictEqual(L.toca(rayo({ id: "c", ix: { distance: 1, uv: { x: 0.5, y: 0.5 } } })), false, "una lámina sin alTocar no consume el gatillo");
  assert.strictEqual(L.toca(rayo({ id: "a", ix: { distance: 2, uv: { x: 0.25, y: 0.75 } } })), true);
  assert.deepStrictEqual(toques, [["a", 0.25, 0.25, 200, 100, "a"]], "u de izquierda a derecha, v de arriba abajo, y píxeles del lienzo de 800 × 400");
  assert.strictEqual(L.toca(rayo({ id: "b", ix: { distance: 1, uv: { x: 0.5, y: 0.5 } } })), false, "alTocar devolvió false: el gatillo sigue con lo demás");
  toques.length = 0;
  assert.strictEqual(L.toca(rayo({ id: "a", ix: { distance: 3, uv: { x: 0.1, y: 0.1 } } }, { id: "b", ix: { distance: 1, uv: { x: 0.5, y: 0.5 } } })), false, "gana la más cercana (b), que no lo usa");
  assert.deepStrictEqual(toques, []);
});

test("en el código: sin setInterval ni setTimeout ni escuchas propias (su reloj es el bucle), y 29_vr y 90_final la usan", () => {
  const codigo = FUENTE.replace(/\/\/.*$/gm, "");
  assert.ok(!/setInterval|setTimeout|addEventListener|requestAnimationFrame/.test(codigo));
  assert.match(lee("apps/web/motor/90_final.js"), /Laminas\.revisa\(dt\)/);
  assert.match(lee("apps/web/motor/29_vr.js"), /if \(Laminas\.toca\(rr\)\)/);
});
