"use strict";
// La nube LiDAR del exterior (apps/web/motor/05_nube.js, que es un talón de apps/web/src/mundos/exterior/nube.ts; A3-3, MU5-n), en Node y sin navegador, con el three
// de verdad, la fábrica de materiales de verdad y un Mundo y una Cola de mentira. Es el guardián que pedía la auditoría de noviembre de 2026 (PLAN, L1-01, L1-02 y L2-02):
//   · L1-01 y L2-02: en modo Gemelo, tras 2 s, cero mallas de nube montadas y ninguna geometría viva; y se suelta a la distancia a la que el Mundo carga;
//   · L1-02: con una nube densa el total dibujado nunca pasa de 1,4 M (PRESUPUESTO_NUBE), también en los niveles 0 y 1, y se recalcula al cambiar la cámara.
// Sin GPU: las geometrías vivas se cuentan por los eventos «dispose» de three (lo que renderer.info.memory.geometries contaría al dibujarlas). Lo que se ve lo dice el
// banco (carga.test.js, con Chrome) y el Quest; aquí no se abre Chrome. Las pruebas de la pieza (con dobles y todos los casos) son nube.test.ts de Vitest.
const test = require("node:test"), assert = require("node:assert"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");
const { pasoArranque } = require("./_pasos");   // A3-8c: los pasos de apps/web/src/arranque.ts (antes, los ficheros de apps/web/motor/)
const { fuenteMotor } = require("./_fuente");
const Mundos = require("./_mundos"), { conFabrica } = require("./_materiales");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
function tesela(k, n, dist) {
  const pts = new Int16Array(n * 3);
  for (let i = 0; i < n; i++) { pts[i * 3] = (i * 37) % 25600; pts[i * 3 + 1] = (i * 91) % 25600; pts[i * 3 + 2] = 50 + (i % 200); }
  return { key: "t" + k, np: n, pts, ox: k * 256, oy: 0, dist, nubeEst: 0, nubeMalla: null };
}
/** el mundo de mentira: una Cola que corre cada trabajo en el acto, y un contador de geometrías vivas */
function monta(teselas, modo) {
  const vivas = { n: 0 }, cancela = [];
  class Geo extends THREE.BufferGeometry { constructor() { super(); vivas.n++; let ya = false; this.addEventListener("dispose", () => { if (!ya) { ya = true; vivas.n--; } }); } }
  const T = Object.assign({}, THREE, { BufferGeometry: Geo }), scene = new THREE.Scene(), Estado = { exag: 1, modo }, { Materiales, Estaticos } = conFabrica({ THREE: T });
  const nube = Mundos.creaNube({
    THREE: T, Mundo: { TS: 256, lista: teselas, *aseguraOrto() {}, dist: t => t.dist }, suelo: () => 0, copaAlta: () => 0, kcor: () => 1, tinte: () => false, ndviIdx: () => 0,
    aviva() {}, colorEn: (x, y, h, o) => { o[0] = 0.4; o[1] = 0.5; o[2] = 0.3; }, hash, parcheTiempo() {},
    ColaExt: { pon(c, p, g, fin) { let r = g.next(); while (!r.done) r = g.next(); if (fin) fin(r.value); return true; }, cancela: c => cancela.push(c), hay: () => false },
    Materiales, Estaticos, scene, camera: { position: { x: 0, y: 0, z: 0 } }, Estado
  });
  return { nube, vivas, scene, Estado, cancela };
}

test("el talón: 05_nube.js lleva el componente «nube-lidar» del exterior y el motor sigue viendo los mismos cinco nombres", () => {
  const talon = pasoArranque("05_nube.js");
  assert.match(talon, /\/\/ \[talón\] apps\/web\/src\/mundos\/exterior\/nube\.ts/);
  assert.match(talon, /Componentes\.registra\(Mundos\.manifiestoNube\(Nube\)\);/);
  for (const n of ["ALTO_MAX", "nube", "pintaNube", "actualizaNubeTeselas", "actualizaNube"]) assert.match(talon, new RegExp("\\b" + n + " = Nube\\."), n);
  const fuente = fuenteMotor("05_nube.js");
  assert.match(fuente, /id: ID_NUBE/); assert.match(fuente, /mundos: \["exterior"\]/);
  // lo que cambia el comportamiento (L1-01, L1-02, L2-02) está en el código
  assert.match(fuente, /Estado\.modo !== "nube"/); assert.match(fuente, /SUELTA_FUERA_S/); assert.match(fuente, /RADIO_CARGA \* 1\.2/); assert.match(fuente, /PRESUPUESTO_NUBE/);
});

test("L1-01 y L2-02: en modo Gemelo, tras 2 s, cero mallas de nube montadas y ninguna geometría viva", () => {
  const T = Array.from({ length: 6 }, (_, k) => tesela(k, 4000, 100 + k * 120)), { nube, vivas, Estado, scene, cancela } = monta(T, "nube");
  nube.actualizaNubeTeselas(0, 0, 0); nube.actualizaNubeTeselas(0, 0, 0);
  assert.strictEqual(T.filter(t => t.nubeMalla).length, 6); assert.strictEqual(vivas.n, 6);
  Estado.modo = "gem";
  for (let s = 0; s < 2.4; s += 0.2) nube.actualizaNube(0.2);
  assert.strictEqual(T.filter(t => t.nubeMalla).length, 0, "ninguna malla montada");
  assert.strictEqual(vivas.n, 0, "ninguna geometría viva (info.memory.geometries sin ellas)");
  assert.strictEqual(nube.nube.g.children.length, 0);
  assert.ok(cancela.includes("Nt0") && cancela.includes("NPt5"), "y sin trabajos pendientes en la Cola");
  for (let s = 0; s < 3; s += 0.2) nube.actualizaNube(0.2);
  assert.strictEqual(vivas.n, 0, "y en modo Gemelo no se vuelve a montar nada");
  nube.libera(); assert.strictEqual(scene.children.length, 0);
});

test("L2-02: la distancia de liberación es coherente con la de carga (1.800 m del Mundo): nada se monta más allá de ella y lo de más de 2.160 m se suelta", () => {
  const T = [tesela(0, 3000, 1700), tesela(1, 3000, 1900), tesela(2, 3000, 2200)], { nube } = monta(T, "nube");
  nube.actualizaNubeTeselas(0, 0, 0);
  assert.deepStrictEqual(T.map(t => !!t.nubeMalla), [true, false, false]);
  T[0].dist = 2200; nube.actualizaNubeTeselas(0, 0, 0); assert.strictEqual(T[0].nubeMalla, null, "a 2.200 m se suelta (antes, hasta 2.760 m)");
});

test("L1-02: con el fixture denso nunca se dibujan más de 1,4 M puntos, en ningún nivel, y se recalcula al mover la cámara", () => {
  const T = Array.from({ length: 14 }, (_, k) => tesela(k, 140000, 50 + k * 40)), { nube } = monta(T, "nube");   // 14 × 140 k a escala 1 serían ~1,5 M solo en los 600 m más cercanos
  nube.actualizaNubeTeselas(0, 0, 0); nube.actualizaNubeTeselas(0, 0, 0);
  let r = nube.resumen();
  assert.ok(r.puntos <= 1400000, "dibuja " + r.puntos);
  assert.ok(T.slice(0, 7).every(t => t.nubeMalla.geometry.drawRange.count < t.nubeN * (t.nubeNivel === 0 ? 1 : 0.5) + 1), "también los niveles 0 y 1 (antes solo el 2 y el 3)");
  // la cámara se aleja y cada tesela cambia de distancia, no necesariamente de nivel: el total sigue sin pasarse
  for (let paso = 1; paso <= 4; paso++) {
    T.forEach((t, k) => { t.dist = 40 + k * 35 + paso * 25; });
    nube.actualizaNubeTeselas(0, 0, 0);
    r = nube.resumen(); assert.ok(r.puntos <= 1400000, "paso " + paso + ": dibuja " + r.puntos);
  }
  // y cuando casi todo se aleja, lo que queda recupera sus puntos (el reparto se rehace aunque ninguno cambie de nivel)
  T.slice(2).forEach(t => { t.dist = 3000; });
  nube.actualizaNubeTeselas(0, 0, 0);
  r = nube.resumen(); assert.strictEqual(r.visibles, 2); assert.strictEqual(r.escala, 1); assert.ok(r.puntos > 100000);
});

test("montar y liberar deja las geometrías vivas como estaban", () => {
  const T = [tesela(0, 3000, 100), tesela(1, 3000, 900)], { nube, vivas, scene } = monta(T, "nube");
  for (let v = 0; v < 3; v++) {
    nube.monta(); nube.actualizaNubeTeselas(0, 0, 0); assert.strictEqual(vivas.n, 2); assert.strictEqual(scene.children.length, 1);
    nube.libera(); assert.strictEqual(vivas.n, 0); assert.strictEqual(scene.children.length, 0);
  }
});
