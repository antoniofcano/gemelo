"use strict";
// Q0k (doc/sistema/VR.md#tope-de-triangulos-del-tileset-q0k): el lazo que sube el error del tileset 3D cuando sus triángulos pasan del tope del nivel
// de VR y lo baja cuando sobra. MU5-n (A3-8a): vive en apps/web/src/nucleo/tope-tiles.ts (talón apps/web/motor/02l_tope_tiles.js) y sus pruebas puras
// (el modelo de escena y las propiedades con fast-check), en apps/web/src/nucleo/tope-tiles.test.ts. Aquí queda lo que cruza con el legado:
//   · las perillas ?xrtri= y ?xrtrierr= (02f) y que 04b y 02f lo enganchan (texto); que el talón da el lazo del núcleo.
// Lo que NO dice: fps ni triángulos en un casco. No probado en Quest (la medida: ?debug&mide=60 con y sin ?xrtri=0, desde la llegada, sin girar).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const Nucleo = require("./_nucleo");

const T = new Function("Nucleo", "\"use strict\";\n" + lee("apps/web/motor/02l_tope_tiles.js") + "\nreturn TopeTilesPuro;")(Nucleo);   // el talón, con el núcleo de verdad
const XP = Nucleo.XrPerillasPuro;   // 02f_xr_perillas.js es un talón del núcleo (A1-11)
const D = T.DEF;

test("el talón de 02l da el lazo del núcleo", () => { assert.strictEqual(T, Nucleo.TopeTilesPuro); assert.strictEqual(typeof T.paso, "function"); });

test("perillas (02f): ?xrtri=0 apaga, ?xrtri=N fija el tope, ?xrtrierr=, con recortes dichos", () => {
  assert.deepStrictEqual(XP.leeTiles(""), { tri: null, err: null, ignorados: [] });
  assert.strictEqual(XP.leeTiles("?xrtri=0").tri, 0);
  assert.strictEqual(XP.leeTiles("?xrtri=150000&xrtrierr=96").tri, 150000);
  assert.strictEqual(XP.leeTiles("?xrtri=150000&xrtrierr=96").err, 96);
  const bajo = XP.leeTiles("?xrtri=100"); assert.strictEqual(bajo.tri, 20000); assert.match(bajo.ignorados[0].motivo, /recortado a 20000/);
  assert.strictEqual(XP.leeTiles("?xrtrierr=999").err, 256);
  assert.strictEqual(XP.leeTiles("?xrtri=mucho").tri, null); assert.strictEqual(XP.leeTiles("?xrtri=mucho").ignorados[0].motivo, "no es un número");
  assert.strictEqual(XP.DEFT.err, D.ERR_MAX, "el defecto de la perilla y el del lazo son el mismo");
});

test("enganche (texto): 04b mide solo en VR y pone el error; 02f da el tope y la línea; 29_vr no cambia", () => {
  const E = require("./_fuente").fuenteMotor("04b_escena3d.js");
  assert.match(E, /if \(errorPerfil\) muestraTope\(cx\);/, "solo con el perfil de VR puesto (en pantalla y móvil no corre)");
  assert.match(E, /TopeTilesPuro\.paso\(tope, mm\)/);
  assert.match(E, /XrPerillas\.topeTiles\(triNivel\)/);
  assert.match(E, /XrPerillas\.lineaTiles = function/);
  assert.match(E, /tiles\.visibleTiles\.forEach\(sumaVisible\)/);
  assert.match(lee("apps/web/src/nucleo/xr-perillas.ts"), /X\.lineaTiles \? X\.lineaTiles\(\) : ""/);
  assert.match(require("./_fuente").fuenteMotor("29_vr.js"), /Escena3D\.perfil\(p\)/, "el nivel de VR sigue llegando por Escena3D.perfil");
});
