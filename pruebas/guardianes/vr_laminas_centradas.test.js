"use strict";
// VR-L1: las láminas de VR (el panel, las fichas de olivo y de baliza, la previsión del tiempo y las de Laminas) nacen CENTRADAS en la mirada horizontal y se
// pueden agarrar con el grip y dejar en otro sitio. En Node y sin navegador: las funciones puras de 02d_laminas.js (LaminasPuro.miradaH, nace, desvio, ang,
// agarra, arrastra), el motor de Laminas con un THREE de mentira (nace delante de VRX.mira aunque la cámara mire a otro lado; bajoRayo y mueve) y, leyendo
// el código, que ninguna lámina de VR toma la mirada de camera.getWorldDirection (la causa de que el panel naciera de lado: tras actualizaPaseo() la cámara
// lleva la posición del mundo como si fuera local al rig y su lookAt apunta hacia el centro de la finca). NO probado en unas Quest.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const LAM = lee("apps/web/motor/02d_laminas.js"), VR = lee("apps/web/motor/29_vr.js");
function trozo(fuente, ini, fin) { const i = fuente.indexOf(ini), f = fuente.indexOf(fin); assert.ok(i >= 0 && f > i, ini); return fuente.slice(i, f); }
const P = new Function("\"use strict\";\n" + trozo(LAM, "// [puro:inicio]", "// [puro:fin]") + "\nreturn LaminasPuro;")();
const cerca = (a, b, e, msg) => assert.ok(Math.abs(a - b) < (e || 1e-9), (msg || "") + ": " + a + " ≠ " + b);

// la orientación de una cabeza que gira yaw (rad, en torno a la vertical, como three: 0 = mira a −z) y cabecea pitch (rad, positivo = arriba)
function cuat(yaw, pitch) {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos((pitch || 0) / 2), sp = Math.sin((pitch || 0) / 2);
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };   // qYaw · qPitch (orden YXZ, el de una cabeza)
}
// la dirección horizontal que se espera: −z girado yaw del rig + yaw de la cabeza
const espera = a => ({ x: -Math.sin(a), z: -Math.cos(a) });

test("ang lleva cualquier ángulo a −π…π (sin errores de vuelta completa)", () => {
  for (const [a, r] of [[0, 0], [Math.PI / 2, Math.PI / 2], [3 * Math.PI, Math.PI], [-3 * Math.PI / 2, Math.PI / 2], [7, 7 - 2 * Math.PI], [-7, -7 + 2 * Math.PI], [20 * Math.PI + 0.1, 0.1]])
    cerca(Math.abs(P.ang(a)), Math.abs(r), 1e-9, "ang(" + a + ")");
  for (let k = -50; k <= 50; k++) { const v = P.ang(k * 0.77); assert.ok(v >= -Math.PI - 1e-12 && v <= Math.PI + 1e-12); }
});

test("miradaH: la mirada horizontal en el mundo para varias orientaciones de cabeza y giros del rig", () => {
  const giros = [0, 0.3, Math.PI / 2, -Math.PI / 2, 2.5, Math.PI, -3, 5.9, 4 * Math.PI + 0.2];
  for (const yr of giros) for (const yc of giros) for (const pitch of [0, 0.4, -0.6, 1.2, -1.3]) {
    const g = P.miradaH(cuat(yc, pitch), yr), e = espera(yr + yc);
    cerca(Math.hypot(g.x, g.z), 1, 1e-9, "largo 1");
    assert.ok(g.x * e.x + g.z * e.z > 1 - 1e-9, `rig ${yr} cabeza ${yc} cabeceo ${pitch}: ${JSON.stringify(g)} ≠ ${JSON.stringify(e)}`);
  }
  // sin orientación (o la identidad): al norte (−z)
  const nada = P.miradaH(null, 0); cerca(nada.x, 0); cerca(nada.z, -1);
  const id = P.miradaH({ x: 0, y: 0, z: 0, w: 1 }, 0); cerca(id.x, 0); cerca(id.z, -1);
});

test("miradaH: mirando casi en vertical vale hacia dónde apunta la coronilla (abajo) o la nuca (arriba), no una dirección cualquiera", () => {
  for (const yc of [0, 1, -2, 3]) {
    const abajo = P.miradaH(cuat(yc, -Math.PI / 2 + 0.01), 0), arriba = P.miradaH(cuat(yc, Math.PI / 2 - 0.01), 0), e = espera(yc);
    assert.ok(abajo.x * e.x + abajo.z * e.z > 0.999, "mirando al suelo, delante sigue siendo delante: " + JSON.stringify(abajo));
    assert.ok(arriba.x * e.x + arriba.z * e.z > 0.999, "mirando al cielo, igual: " + JSON.stringify(arriba));
  }
});

test("nace: centrada en la mirada, a su distancia y altura, mirando a la cabeza (para varias cabezas, miradas y giros del rig)", () => {
  const cabezas = [{ x: 0, y: 1.6, z: 0 }, { x: 120, y: 301.2, z: -40 }, { x: -200, y: 5, z: 150 }];
  for (const cab of cabezas) for (const yr of [0, 0.52, -1.6, 3]) for (const yc of [0, 1, -2.2]) for (const [dist, dy] of [[1.05, -0.2], [0.95, -0.38], [1.4, -0.05]]) {
    const g = P.miradaH(cuat(yc, 0.2), yr), n = P.nace(cab, g, dist, dy);
    cerca(Math.hypot(n.x - cab.x, n.z - cab.z), dist, 1e-9, "a su distancia");
    cerca(n.y, cab.y + dy, 1e-9, "a su altura");
    cerca(P.desvio(cab, n, g), 0, 1e-9, "centrada en la mirada (0° de desvío)");
    // la cara (+z del plano girado rotY) apunta a la cabeza
    const cara = { x: Math.sin(n.rotY), z: Math.cos(n.rotY) }, h = { x: (cab.x - n.x) / dist, z: (cab.z - n.z) / dist };
    cerca(cara.x * h.x + cara.z * h.z, 1, 1e-9, "mira a la cabeza");
  }
});

test("desvio: cuánto se aparta una lámina de la mirada (0…π), sin errores de vuelta completa", () => {
  const cab = { x: 0, y: 0, z: 0 }, norte = { x: 0, z: -1 };
  cerca(P.desvio(cab, { x: 0, z: -1 }, norte), 0);
  cerca(P.desvio(cab, { x: 1, z: 0 }, norte), Math.PI / 2);
  cerca(P.desvio(cab, { x: 0, z: 1 }, norte), Math.PI);
  // a ambos lados del sur (donde atan2 salta de +π a −π) el desvío es pequeño, no ~2π
  const sur = { x: 0, z: 1 };
  assert.ok(P.desvio(cab, { x: 0.05, z: 1 }, sur) < 0.06 && P.desvio(cab, { x: -0.05, z: 1 }, sur) < 0.06);
  assert.ok(P.desvio(cab, { x: 0.05, z: 1 }, { x: -0.05, z: 1 }) < 0.11);
});

// el mando: origen o y dirección d (largo 1), girando la muñeca un ángulo a en horizontal
const rayo = (o, a) => ({ o, d: { x: -Math.sin(a), y: 0, z: -Math.cos(a) } });
test("agarra + arrastra: al agarrar no salta; sigue al mando a la misma distancia del mando y mirando a la cabeza; al soltar, se queda", () => {
  const cab = { x: 10, y: 1.6, z: 20 }, o = { x: 10.25, y: 1.2, z: 19.8 };
  const g = P.miradaH(cuat(0.3, 0), 0.5), lam = P.nace(cab, g, 1.05, -0.2);
  // el rayo apunta al centro de la lámina (más o menos): la toca a t m
  const dx = lam.x - o.x, dy = lam.y - o.y, dz = lam.z - o.z, t = Math.hypot(dx, dy, dz), d = { x: dx / t, y: dy / t, z: dz / t };
  // y un punto que no es el centro: 10 cm a la izquierda y 5 cm arriba (dónde se agarró se conserva)
  const izq = P.rotaY(-0.1, 0, lam.rotY), c = { x: lam.x + izq.x, y: lam.y + 0.05, z: lam.z + izq.z };
  const a = P.agarra(o, d, t, c, lam.rotY, cab);
  const p0 = P.arrastra(a, o, d, cab);
  cerca(p0.x, c.x, 1e-9, "sin salto x"); cerca(p0.y, c.y, 1e-9, "sin salto y"); cerca(p0.z, c.z, 1e-9, "sin salto z");
  // girar la muñeca 40° en tres pasos: el punto agarrado sigue al rayo a t m del mando
  const a0 = Math.atan2(-d.x, -d.z);
  let prev = p0;
  for (const paso of [0.2, 0.45, 0.7]) {
    const r = rayo(o, a0 + paso), p = P.arrastra(a, r.o, r.d, cab), hit = { x: o.x + r.d.x * t, y: o.y + r.d.y * t, z: o.z + r.d.z * t };
    const off = Math.hypot(p.x - hit.x, p.y - hit.y, p.z - hit.z), off0 = Math.hypot(c.x - (o.x + d.x * t), c.y - (o.y + d.y * t), c.z - (o.z + d.z * t));
    cerca(off, off0, 1e-6, "el sitio por donde se agarró se conserva");
    const cara = { x: Math.sin(p.rotY), z: Math.cos(p.rotY) }, h = Math.hypot(cab.x - p.x, cab.z - p.z);
    cerca(cara.x * (cab.x - p.x) / h + cara.z * (cab.z - p.z) / h, 1, 1e-9, "mira a la cabeza");
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) > 0.05, "se ha movido con el mando"); prev = p;
  }
  // con suavizado (prev + dt): da pasos hacia el objetivo, sin pasarse
  const r = rayo(o, a0 + 1), obj = P.arrastra(a, r.o, r.d, cab), med = P.arrastra(a, r.o, r.d, cab, prev, 1 / 72);
  const dObj = Math.hypot(obj.x - prev.x, obj.z - prev.z), dMed = Math.hypot(med.x - prev.x, med.z - prev.z);
  assert.ok(dMed > 0 && dMed < dObj, "suavizado: un paso de " + dMed.toFixed(3) + " m hacia un objetivo a " + dObj.toFixed(3));
  // soltar: quien la mueve deja la última posición; arrastra no tiene estado escondido (el mismo rayo da el mismo sitio)
  const fin = P.arrastra(a, r.o, r.d, cab), otra = P.arrastra(a, r.o, r.d, cab);
  assert.deepStrictEqual(fin, otra);
});

test("arrastra: no se la puede meter en la cabeza ni mandar lejísimos (entre AGARRE.dmin y AGARRE.dmax m, en horizontal)", () => {
  const cab = { x: 0, y: 1.6, z: 0 }, o = { x: 0.2, y: 1.2, z: -0.2 }, c = { x: 0, y: 1.4, z: -1 };
  const t0 = Math.hypot(c.x - o.x, c.y - o.y, c.z - o.z), d0 = { x: (c.x - o.x) / t0, y: (c.y - o.y) / t0, z: (c.z - o.z) / t0 };
  const a = P.agarra(o, d0, t0, c, P.mirando(cab, c), cab);
  for (const ang of [0, 1, 2, 2.6, 3.1, -2.5]) {   // girando la muñeca hacia atrás el punto pasa por la cabeza
    const r = rayo(o, ang), p = P.arrastra(a, r.o, r.d, cab), dh = Math.hypot(p.x - cab.x, p.z - cab.z);
    assert.ok(dh >= P.AGARRE.dmin - 1e-9 && dh <= P.AGARRE.dmax + 1e-9, ang + ": " + dh);
  }
  const lejos = P.agarra(o, d0, 30, { x: o.x + d0.x * 30, y: o.y + d0.y * 30, z: o.z + d0.z * 30 }, 0, cab), pl = P.arrastra(lejos, o, d0, cab);
  cerca(Math.hypot(pl.x - cab.x, pl.z - cab.z), P.AGARRE.dmax, 1e-9, "a lo sumo dmax");
});

// ---------- el motor de Laminas con un THREE de mentira: en VR nace delante de VRX.mira, no de la cámara; bajoRayo y mueve
function mundo(VRX, dirCam) {
  class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); }
    setFromMatrixPosition(m) { return this.set(m.p[0], m.p[1], m.p[2]); } lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; } normalize() { const l = Math.sqrt(this.lengthSq()) || 1; return this.set(this.x / l, this.y / l, this.z / l); } }
  const recurso = () => class { dispose() {} };
  const THREE = { Vector3: V3, LinearFilter: 1006, CanvasTexture: recurso(), PlaneGeometry: recurso(), MeshBasicMaterial: recurso(),
    Mesh: class { constructor() { this.position = new V3(); this.rotation = new V3(); this.rotation.set = (x, y, z) => { this.rotation.x = x; this.rotation.y = y; this.rotation.z = z; }; } updateMatrixWorld() {} } };
  const camera = { matrixWorld: { p: [0, 1.6, 0] }, updateMatrixWorld() {}, getWorldDirection: v => v.set(dirCam.x, 0, dirCam.z) };
  const scene = { add() {}, remove() {} }, documento = { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) };
  const Bus = { on: () => () => {} };
  return new Function("THREE", "scene", "camera", "renderer", "texColor", "VRX", "document", "performance", "Bus", "console",
    "\"use strict\";\n" + trozo(LAM, "// [puro:inicio]", "// [puro:fin]") + trozo(LAM, "// [motor:inicio]", "// [motor:fin]") + "\nreturn Laminas;")(THREE, scene, camera, { info: { render: { frame: 0 } } }, t => t, VRX, documento, { now: () => 0 }, Bus, console);
}
test("Laminas.abre en VR: nace delante de VRX.mira aunque la cámara (corrompida tras actualizaPaseo) mire a otro lado; fuera de VR, la cámara", () => {
  const VRX = { on: true, cab: { x: 120, y: 300, z: -40 }, mira: P.miradaH(cuat(2, 0), 0.5) };
  const L = mundo(VRX, { x: 1, z: 0 }), def = { id: "t", ancho: 1, alto: 0.5, pinta() {} };
  assert.ok(L.abre(def)); const i = L.info("t"), pos = { x: i.pos[0], z: i.pos[2] };
  cerca(P.desvio(VRX.cab, pos, VRX.mira), 0, 1e-9, "centrada en la mirada de la cabeza");
  cerca(Math.hypot(pos.x - VRX.cab.x, pos.z - VRX.cab.z), P.DIST.vr, 1e-9, "a 1,4 m"); cerca(i.pos[1], VRX.cab.y - P.BAJO.vr, 1e-9, "a la altura de los ojos");
  const L2 = mundo({ on: false, cab: { x: 0, y: 0, z: 0 } }, { x: 1, z: 0 }); L2.abre(def);
  const j = L2.info("t"); cerca(j.pos[0], P.DIST.pantalla, 1e-9, "en pantalla, delante de la cámara (+x)"); cerca(j.pos[2], 0, 1e-9);
});
test("Laminas.bajoRayo da la más cercana que toca el rayo (tenga alTocar o no) y mueve la deja en otro sitio, mirando adonde se diga", () => {
  const VRX = { on: true, cab: { x: 0, y: 1.6, z: 0 }, mira: { x: 0, z: -1 } }, L = mundo(VRX, { x: 0, z: -1 });
  L.abre({ id: "a", ancho: 1, alto: 1, pinta() {} }); L.abre({ id: "b", ancho: 1, alto: 1, pinta() {}, dist: { vr: 3 } });
  const rr = { intersectObject: m => (m.position.z < -2 ? [{ distance: 3 }] : [{ distance: 1.4 }]) };
  const t = L.bajoRayo(rr); assert.strictEqual(t.id, "a"); cerca(t.distancia, 1.4); assert.strictEqual(t.pos.length, 3);
  assert.strictEqual(L.bajoRayo({ intersectObject: () => [] }), null, "sin tocar ninguna, null");
  assert.ok(L.mueve("a", 2, 1.5, -1, 0.7)); assert.deepStrictEqual(L.info("a").pos, [2, 1.5, -1]);
  assert.strictEqual(L.mueve("nadie", 0, 0, 0, 0), false); assert.strictEqual(L.mueve("a", NaN, 0, 0, 0), false);
});

test("en el código: ninguna lámina de VR toma la mirada de la cámara; todas nacen por LaminasPuro.nace; el grip agarra y el izquierdo no corre mientras agarra", () => {
  // 29_vr.js: vrSigue y vrQueda usan vrNace → LaminasPuro.nace con VRX.mira; vrCabeza calcula VRX.mira de la pose del XRFrame
  const sigue = trozo(VR, "  function vrNace(", "  function vrTexto(");
  assert.ok(!/getWorldDirection/.test(sigue), "vrSigue, vrQueda y el agarre no leen la cámara");
  assert.match(sigue, /LaminasPuro\.nace\(VRX\.cab, VRX\.mira, dist, bajo\)/);
  assert.match(VR, /VRX\.frame\.getViewerPose\(VRX\.base\)/, "la mirada sale de la pose del fotograma");
  assert.match(VR, /VRX\.mira = LaminasPuro\.miradaH\(q, r\.yaw\);/);
  assert.match(VR, /var h = vrCabeza\(\), g = VRX\.mira, d = Math\.atan2\(g\.x, -g\.z\) - ang/, "vrAparece gira el rig con la mirada de la cabeza");
  // 02d: Laminas.abre nace por P.nace con la mirada de VRX en VR
  const abre = trozo(LAM, "    function abre(o) {", "    function cierra(id, motivo) {");
  assert.match(abre, /P\.nace\(h, g, dist, -bajo\)/); assert.ok(!/getWorldDirection/.test(abre));
  assert.match(LAM, /if \(enVR\(\) && VRX\.mira\) return \{ x: VRX\.mira\.x, z: VRX\.mira\.z \};/);
  // 35 y 51: la tapa de la previsión y las fichas del mundo, con VRX.mira en VR
  assert.match(lee("apps/web/motor/35_fichas_tiempo.js"), /g = VRX\.mira \|\| camera\.getWorldDirection\(vD\)/);
  assert.match(lee("apps/web/motor/51_fichas_mundo.js"), /function miradaH\(\) \{ if \(VRX\.on && VRX\.mira\) return/);
  // el grip: botón 1 de cada mando, por flanco; correr no mientras el izquierdo agarra; la ficha del olivo no se cierra sola en la mano
  assert.match(VR, /vrFlanco\("G" \+ o\.i, !!o\.src && vrBoton\(o\.src, 1\)\) && !vrAg\) vrAgarra\(o\)/);
  assert.match(VR, /VRX\.correr = vrBoton\(L\.src, 1\) && !\(vrAg && vrAg\.o === L\);/);
  assert.match(VR, /if \(!ficha\.agarrada\) VRX\.fichaT -= dt;/);
  // el giro por saltos gira las tres láminas de aquí (con y sin ?ui=capas)
  assert.match(VR, /\[panel, ficha, fichaB\]\.forEach\(function \(l\) \{ if \(!l\.ini \|\| !l\.m\.visible\) return; var pg = VrFichaPuro\.gira\(/);
});
