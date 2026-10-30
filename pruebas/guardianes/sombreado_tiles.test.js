"use strict";
// El relieve del tileset se sombrea con el parche de apps/web/motor/04d_sombreado_tiles.js (desde T8 fase 2, decisión 79, la única escena: ya no
// hay Terreno de siempre con el que compararlo): el material de cada glb pasa a un Lambert con ese parche y los uniformes compartidos (UN, uSombra).
// Sin navegador: se evalúan 04d_sombreado_tiles.js y el parche del tiempo de 15_tiempo.js con la three instalada y unas maquetas del resto del motor,
// y se llama a onBeforeCompile como lo hace three. Lo que se comprueba: que CADA sustitución del parche encuentra su trozo en el sombreador de la
// three instalada (un trozo que cambia de nombre falla en silencio), que los uniformes son los mismos objetos y qué hace modelo() con un glb.
// Lo que se VE solo lo dice un navegador (encargo al banco). Sin three (cd apps/web && npm ci) se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, fs, path } = require("./_util");

const WEB = path.join(RAIZ, "apps", "web"), MOTOR = path.join(WEB, "motor"), THREE_JS = path.join(WEB, "node_modules", "three", "build", "three.module.js");
const SALTO = fs.existsSync(THREE_JS) ? null : "three no instalado (cd apps/web && npm ci): el sombreado del tileset NO se ha comprobado";
const lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");

let THREE, M;   // M: lo que devuelve el motor evaluado
test.before(async () => {
  if (SALTO) return;
  THREE = await import(pathToFileURL(THREE_JS).href);
  const tie = lee("15_tiempo.js");
  const sombra = /  var uSombra = [\s\S]*?\n(?=  function conTiempo)/.exec(tie), pt = /  function parcheTiempo\(sh, viento\) \{[\s\S]*?\n  \}\n/.exec(tie);
  assert.ok(sombra && pt, "no encuentro uSombra/GLSL_SOMBRA o parcheTiempo en 15_tiempo.js");
  const cuerpo = "\"use strict\";\nvar uViento = { uT: {}, uAmp: {}, uDir: {} }; function colorVertSRGB() {}\n" + sombra[0] + pt[0] + lee("04d_sombreado_tiles.js") +
    "\nreturn { UN: UN, uSombra: uSombra, matSuelo: matSuelo, SombreadoTiles: SombreadoTiles };";
  const TS = 256, teselas = {};
  const Mundo = {
    TS, N2: TS + 2, NS2: TS / 2 + 2, SRS: 2, lista: [], mosaico: { img: null },
    tesela: (x, y) => { const k = Math.floor(x / TS) + "_" + Math.floor(y / TS); return teselas[k] || (teselas[k] = { key: k, kx: Math.floor(x / TS), ky: Math.floor(y / TS), ox: Math.floor(x / TS) * TS, oy: Math.floor(y / TS) * TS, v: [0, 0, TS, TS], suel: null }); },
    dist: () => 0
  };
  const D = { ts: TS, orto_px: 512, mosaico: { x0: 0, yN: 0, w: 1, h: 1, res: 1 } }, cola = [];
  const f = Function("THREE", "D", "RES", "ANCHO", "ALTO", "Mundo", "Cola", "scene", "camera", "x0", "yN", "suelo", "vn2", cuerpo);
  M = f(THREE, D, 1, 1000, 1000, Mundo, { add: (k) => cola.push(k) }, new THREE.Scene(), new THREE.PerspectiveCamera(), 0, 0, () => 0, () => 0);
  M.Mundo = Mundo; M.cola = cola;
});

const lambert = () => ({ vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} });
function glb(lado, x0, y0) {   // un modelo como el que entrega 3DTilesRendererJS: la malla del terreno con su ortofoto y un nodo de olivos instanciado
  const raiz = new THREE.Group(), map = new THREE.Texture({ width: 256, height: 256 }); map.colorSpace = THREE.SRGBColorSpace;
  const ter = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map })), ol = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial(), 2);
  raiz.add(ter, ol);
  const tile = { boundingVolume: { box: [x0 + lado / 2, y0 + lado / 2, 0, lado / 2, 0, 0, 0, lado / 2, 0, 0, 0, 5] }, content: { uri: lado + "/a.glb" } };
  return { raiz, tile, ter, ol, map };
}
/** onBeforeCompile del material del glb apuntando cada sustitución de texto (String.prototype.replace con un trozo literal) y si lo encontró */
function compila(material) {
  const sh = lambert(), orig = String.prototype.replace, susts = [];
  String.prototype.replace = function (a, b) { if (typeof a === "string") susts.push({ trozo: a, hallado: this.includes(a) }); return orig.call(this, a, b); };
  try { material.onBeforeCompile(sh); } finally { String.prototype.replace = orig; }
  return { sh, susts };
}

test("el parche del glb aplica TODAS sus sustituciones sobre los sombreadores de la three instalada (y las del tiempo)", t => {
  if (SALTO) return t.skip(SALTO);
  const g = glb(128, 0, 0); M.SombreadoTiles.modelo(g.raiz, g.tile);
  const { sh, susts } = compila(g.ter.material);
  assert.ok(susts.length >= 8, "se esperaban más sustituciones en el parche: " + susts.length);
  assert.deepStrictEqual(susts.filter(s => !s.hallado).map(s => s.trozo), [], "sustituciones que no encuentran su trozo (fallarían en silencio)");
  const OP = M.SombreadoTiles.OP;
  for (const s of ["vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWP.y /= uExag;", "ot_sombra(vWP.xz)", "vVPz = -mvPosition.xyz;"]) assert.ok(sh.vertexShader.includes(s), "vértice sin «" + s + "»");
  assert.ok(!sh.vertexShader.includes("ot_sombra(position.xz)"), "la sombra de nubes del glb va en el mundo (vWP), no en la posición local");
  assert.ok(!sh.vertexShader.includes("objectNormal.y / uExag"), "la normal del glb ya la corrige normalMatrix (la exageración va en la matriz del grupo)");
  for (const s of [OP.cab, "uniform vec2 uTile;", "vec2 uvO = " + OP.uvO, "float dg = " + OP.dg, "pBump(-vViewPosition", "uNdviOn * dentro", "uHielo * 0.6", "sRGBTransferEOTF", "texture2D(uOrt, " + OP.uvO + ")"])
    assert.ok(sh.fragmentShader.includes(s), "fragmento sin «" + s + "»");
});

test("los uniformes son los mismos objetos que los compartidos (NDVI, escarcha, nubes, uBumpK de la VR, modo Ortofoto) y los de tesela salen del Mundo", t => {
  if (SALTO) return t.skip(SALTO);
  const g = glb(128, 128, 0);
  M.SombreadoTiles.modelo(g.raiz, g.tile);
  const { sh: b } = compila(g.ter.material);
  for (const k of Object.keys(M.UN)) assert.strictEqual(b.uniforms[k] === M.UN[k] || k === "uBias2", true, k + " no es el de UN");
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
  assert.strictEqual(g1.ter.material.customProgramCacheKey(), g2.ter.material.customProgramCacheKey());
  const { sh: b } = compila(g3.ter.material);
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
  assert.ok((m.match(/SombreadoTiles\.libera\(\)/g) || []).length >= 2, "libera() en falla() y en libera()");
});
