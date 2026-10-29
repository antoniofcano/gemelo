"use strict";
// F1d (T5): con ?escena=tiles el relieve del tileset se sombrea como el Terreno de siempre (apps/web/motor/04d_sombreado_tiles.js): el material de
// cada glb pasa a un Lambert con el MISMO parche de 04_terreno.js (Terreno.parche) y los mismos uniformes compartidos.
// Sin navegador: se evalúan 04_terreno.js, 04d_sombreado_tiles.js y el parche del tiempo de 15_tiempo.js con la three instalada y unas maquetas del
// resto del motor, y se llama a onBeforeCompile como lo hace three. Lo que se comprueba: que cada sustitución del parche se aplica (un trozo que
// cambia de nombre falla en silencio), que el GLSL del glb es el del Terreno salvo lo que declara SombreadoTiles.OP, que los uniformes son los mismos
// objetos (cambiar uno en UN cambia las dos escenas), y qué hace modelo() con un glb. Lo que se VE solo lo dice un navegador (encargo al banco).
// Sin three (cd apps/web && npm i) se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, fs, path } = require("./_util");

const WEB = path.join(RAIZ, "apps", "web"), MOTOR = path.join(WEB, "motor"), THREE_JS = path.join(WEB, "node_modules", "three", "build", "three.module.js");
const SALTO = fs.existsSync(THREE_JS) ? null : "three no instalado (cd apps/web && npm i): el sombreado del tileset NO se ha comprobado";
const lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");

let THREE, M;   // M: lo que devuelve el motor evaluado
test.before(async () => {
  if (SALTO) return;
  THREE = await import(pathToFileURL(THREE_JS).href);
  const tie = lee("15_tiempo.js");
  const sombra = /  var uSombra = [\s\S]*?\n(?=  function conTiempo)/.exec(tie), pt = /  function parcheTiempo\(sh, viento\) \{[\s\S]*?\n  \}\n/.exec(tie);
  assert.ok(sombra && pt, "no encuentro uSombra/GLSL_SOMBRA o parcheTiempo en 15_tiempo.js");
  const cuerpo = "\"use strict\";\nvar uViento = { uT: {}, uAmp: {}, uDir: {} }; function colorVertSRGB() {}\n" + sombra[0] + pt[0] + lee("04_terreno.js") + lee("04d_sombreado_tiles.js") +
    "\nreturn { Terreno: Terreno, UN: UN, uSombra: uSombra, matSuelo: matSuelo, SombreadoTiles: SombreadoTiles };";
  const TS = 256, teselas = {};
  const Mundo = {
    TS, N2: TS + 2, NS2: TS / 2 + 2, SRS: 2, lista: [], mosaico: { img: null },
    tesela: (x, y) => { const k = Math.floor(x / TS) + "_" + Math.floor(y / TS); return teselas[k] || (teselas[k] = { key: k, kx: Math.floor(x / TS), ky: Math.floor(y / TS), ox: Math.floor(x / TS) * TS, oy: Math.floor(y / TS) * TS, v: [0, 0, TS, TS], suel: null }); },
    dist: () => 0
  };
  const D = { ts: TS, orto_px: 512, mosaico: { x0: 0, yN: 0, w: 1, h: 1, res: 1 } }, cola = [];
  const f = Function("THREE", "D", "RES", "ANCHO", "ALTO", "ESTAD", "ESC3D", "Mundo", "Cola", "scene", "camera", "x0", "yN", "suelo", "vn2", cuerpo);
  M = f(THREE, D, 1, 1000, 1000, { terreno: { n: 0, ms: 0, max: 0 } }, { pedida: false, activa: false }, Mundo, { add: (k) => cola.push(k) },
    new THREE.Scene(), new THREE.PerspectiveCamera(), 0, 0, () => 0, () => 0);
  M.Mundo = Mundo; M.cola = cola;
});

const lambert = () => ({ vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} });
function shTerreno() {   // el material de una tesela del Terreno de siempre, compilado como lo hace three
  const t = { key: "0_0", kx: 0, ky: 0, ox: 0, oy: 0, v: [0, 0, 256, 256] }; M.Terreno.monta(t);
  const sh = lambert(); t.mat.onBeforeCompile(sh); return { sh, t };
}
function glb(lado, x0, y0) {   // un modelo como el que entrega 3DTilesRendererJS: la malla del terreno con su ortofoto y un nodo de olivos instanciado
  const raiz = new THREE.Group(), map = new THREE.Texture({ width: 256, height: 256 }); map.colorSpace = THREE.SRGBColorSpace;
  const ter = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map })), ol = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial(), 2);
  raiz.add(ter, ol);
  const tile = { boundingVolume: { box: [x0 + lado / 2, y0 + lado / 2, 0, lado / 2, 0, 0, 0, lado / 2, 0, 0, 0, 5] }, content: { uri: lado + "/a.glb" } };
  return { raiz, tile, ter, ol, map };
}

test("el parche del Terreno de siempre sigue aplicando todas sus sustituciones (sin ?escena=tiles nada cambia)", t => {
  if (SALTO) return t.skip(SALTO);
  const { sh } = shTerreno();
  for (const s of ["vWP = position; transformed.y *= uExag;", "objectNormal.y / uExag", "vVPz = -mvPosition.xyz;", "ot_sombra(position.xz)"]) assert.ok(sh.vertexShader.includes(s), "vértice sin «" + s + "»");
  for (const s of ["uniform vec2 uTile;", "vec2 uvO = lc / 256.0;", "float dg = 3.0 / 256.0;", "uvO + vec2(0.0, dg)", "texture2D(uOrt, lc / 256.0)", "pBump(-vViewPosition", "uNdviOn * dentro", "uHielo * 0.6", "sRGBTransferEOTF"])
    assert.ok(sh.fragmentShader.includes(s), "fragmento sin «" + s + "»");
});

test("el glb usa el mismo GLSL que el Terreno: solo cambian la posición en el mundo y las coordenadas de la ortofoto (SombreadoTiles.OP)", t => {
  if (SALTO) return t.skip(SALTO);
  const { sh: a } = shTerreno(), g = glb(128, 0, 0);
  M.SombreadoTiles.modelo(g.raiz, g.tile);
  const b = lambert(); g.ter.material.onBeforeCompile(b);
  assert.ok(b.vertexShader.includes("vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWP.y /= uExag;"), "la posición del glb sale de modelMatrix");
  assert.ok(b.vertexShader.includes("ot_sombra(vWP.xz)") && !b.vertexShader.includes("ot_sombra(position.xz)"), "la sombra de nubes del glb, en el mundo");
  assert.ok(!b.vertexShader.includes("objectNormal.y / uExag"), "la normal del glb ya la corrige normalMatrix (la exageración va en la matriz del grupo)");
  // el fragmento: deshechas las sustituciones de OP, es el del Terreno carácter a carácter
  const OP = M.SombreadoTiles.OP, T = { uvO: "lc / 256.0", dg: "3.0 / 256.0", dy: "vec2(0.0, dg)" };
  let fb = b.fragmentShader.replace(OP.cab, "");
  for (const k of ["uvO", "dg", "dy"]) fb = fb.split(OP[k]).join(T[k]);
  assert.strictEqual(fb, a.fragmentShader);
});

test("los uniformes son los mismos objetos en las dos escenas (NDVI, escarcha, nubes, uBumpK de la VR, modo Ortofoto) y los de tesela salen del Mundo", t => {
  if (SALTO) return t.skip(SALTO);
  const { sh: a } = shTerreno(), g = glb(128, 128, 0);
  M.SombreadoTiles.modelo(g.raiz, g.tile);
  const b = lambert(); g.ter.material.onBeforeCompile(b);
  for (const k of Object.keys(M.UN)) { assert.strictEqual(b.uniforms[k] === M.UN[k] || k === "uBias2", true, k + " no es el de UN"); assert.strictEqual(a.uniforms[k], M.UN[k]); }
  for (const k of ["uDrift", "uCov", "uSomb", "uHielo"]) assert.strictEqual(b.uniforms[k], M.uSombra[k], k + " no es el de uSombra");
  const mt = M.Mundo.tesela(192, 64);
  for (const k of ["uTile", "uSue", "uRui", "uGnd", "uTiene"]) assert.strictEqual(b.uniforms[k], mt.uni[k], k + " no es el de la tesela del Mundo (decisión 38: del json, no del glb)");
  assert.strictEqual(b.uniforms.uOrt.value, g.map, "la ortofoto es la del glb");
  assert.strictEqual(b.uniforms.uBias2.value, Math.log(2 / (128 / 256)) / Math.LN2, "muestreo a ~2 m con la textura del glb");
  assert.deepStrictEqual(b.uniforms.uCua.value.toArray(), [128, 0, 128, 0]);
  M.UN.uBumpK.value = 0; assert.strictEqual(b.uniforms.uBumpK.value, 0); M.UN.uBumpK.value = 1;
});

test("modelo(): solo la malla con ortofoto cambia de material; los olivos no se tocan; un programa para todos los glb y suelta() libera", t => {
  if (SALTO) return t.skip(SALTO);
  const g1 = glb(128, 0, 0), g2 = glb(256, 256, 0), g3 = glb(512, 0, 0), olMat = g1.ol.material;
  for (const g of [g1, g2, g3]) M.SombreadoTiles.modelo(g.raiz, g.tile);
  for (const g of [g1, g2, g3]) { assert.ok(g.ter.material.isMeshLambertMaterial); assert.strictEqual(g.ter.material.color, M.matSuelo.color); assert.strictEqual(g.map.colorSpace, THREE.NoColorSpace, "la ortofoto, sin convertir (ADR-0016)"); }
  assert.strictEqual(g1.ol.material, olMat, "el material de los olivos instanciados no se toca");
  const { t: tt } = shTerreno();
  assert.strictEqual(g1.ter.material.customProgramCacheKey(), g2.ter.material.customProgramCacheKey());
  assert.notStrictEqual(g1.ter.material.customProgramCacheKey(), tt.mat.customProgramCacheKey(), "el programa del glb no puede confundirse con el del Terreno");
  const b = lambert(); g3.ter.material.onBeforeCompile(b);
  assert.strictEqual(b.uniforms.uTiene.value, 0, "un glb de 512 m (más que una tesela) pinta la tierra con el mosaico");
  let liberado = false; g1.ter.material.addEventListener("dispose", () => { liberado = true; });
  const antes = M.SombreadoTiles.resumen().glb; M.SombreadoTiles.suelta(g1.raiz);
  assert.ok(liberado, "suelta() libera el material"); assert.strictEqual(M.SombreadoTiles.resumen().glb, antes - 1);
});

test("04b_escena3d.js engancha SombreadoTiles en load-model, dispose-model, actualiza y al liberar o fallar", () => {
  const m = lee("04b_escena3d.js");
  assert.match(m, /addEventListener\("load-model", function \(e\) \{ SombreadoTiles\.modelo\(e\.scene, e\.tile\); \}\)/);
  assert.match(m, /addEventListener\("dispose-model", function \(e\) \{ SombreadoTiles\.suelta\(e\.scene\); \}\)/);
  assert.match(m, /tiles\.update\(\);\s*\n\s*SombreadoTiles\.actualiza\(\);/);
  assert.strictEqual((m.match(/SombreadoTiles\.libera\(\)/g) || []).length, 2, "libera() en falla() y en libera()");
});
