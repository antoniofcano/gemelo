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

let THREE, M, MF;   // M: lo que devuelve el motor evaluado; MF: lo mismo con ?suelo=fotos (EV-1s, 04f_suelo_fotos.js)
// el trozo puro de 04f y una maqueta de SueloFotos (sin cargar texturas): apagado, como sin la bandera, o encendido
function sueloFotos(activo) {
  const f = lee("04f_suelo_fotos.js"), P = new Function("\"use strict\";\n" + f.slice(f.indexOf("// [puro:inicio]"), f.indexOf("// [puro:fin]")) + "\nreturn SueloFotosPuro;")();
  const neutro = new THREE.DataTexture(new Uint8Array(4), 1, 1), campos = [];
  return { P, S: { activo, U: { uFot: { value: null }, uFotK: { value: 0 } }, rueNeutro: () => neutro, campo: () => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1); campos.push(t); return t; }, actualiza() {}, libera() {}, campos } };
}
test.before(async () => {
  if (SALTO) return;
  THREE = await import(pathToFileURL(THREE_JS).href);
  M = evalua(false); MF = evalua(true);
});
function evalua(conFotos) {
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
  const sf = sueloFotos(conFotos);
  const f = Function("THREE", "D", "RES", "ANCHO", "ALTO", "Mundo", "Cola", "scene", "camera", "x0", "yN", "suelo", "vn2", "SueloFotosPuro", "SueloFotos", cuerpo);
  const m = f(THREE, D, 1, 1000, 1000, Mundo, { add: (k, prio, gen, alAcabar) => cola.push({ k, gen, alAcabar }) }, new THREE.Scene(), new THREE.PerspectiveCamera(), 0, 0, () => 0, () => 0, sf.P, sf.S);
  m.Mundo = Mundo; m.cola = cola; m.SF = sf.S;
  return m;
}

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

test("con ?suelo=fotos (EV-1s): el GLSL de 04f entra por sus anclas, con sus uniformes, el campo del ruedo de la tesela y un programa aparte", t => {
  if (SALTO) return t.skip(SALTO);
  const g = glb(128, 0, 0); MF.SombreadoTiles.modelo(g.raiz, g.tile);
  const { sh, susts } = compila(g.ter.material);
  assert.deepStrictEqual(susts.filter(s => !s.hallado).map(s => s.trozo), [], "sustituciones que no encuentran su trozo");
  for (const s of ["uniform highp sampler2DArray uFot;", "float fotA = uFotK", "cercaM * (1.0 - fotA);", "if (fotA > 0.003)", "vec4 fotVar("]) assert.ok(sh.fragmentShader.includes(s), "fragmento sin «" + s + "»");
  assert.ok(sh.fragmentShader.indexOf("vec4 fotVar(") > sh.fragmentShader.indexOf("float dn(vec2 p)"), "fotVar usa dn: va después");
  assert.ok(sh.fragmentShader.indexOf("if (fotA > 0.003)") < sh.fragmentShader.indexOf("diffuseColor.rgb *= sRGBTransferEOTF("), "la foto modula antes de pasar a lineal");
  assert.strictEqual(sh.uniforms.uFot, MF.SF.U.uFot); assert.strictEqual(sh.uniforms.uFotK, MF.SF.U.uFotK);
  assert.strictEqual(sh.uniforms.uRue, MF.Mundo.tesela(64, 64).uni.uRue, "el campo del ruedo es el de la tesela del Mundo");
  assert.strictEqual(MF.SF.campos.length, 1, "un campo por tesela");
  assert.strictEqual(g.ter.material.customProgramCacheKey(), "terreno-3dtiles-fotos");
  // y sin la bandera, nada de eso
  const g0 = glb(128, 0, 0); M.SombreadoTiles.modelo(g0.raiz, g0.tile); const { sh: s0 } = compila(g0.ter.material);
  assert.ok(!/fotA|uFot|uRue/.test(s0.fragmentShader) && !("uFot" in s0.uniforms) && !("uRue" in s0.uniforms)); assert.strictEqual(g0.ter.material.customProgramCacheKey(), "terreno-3dtiles");
});

// ---- un punto del mundo y su «color ancho» (uGnd): ¿cae en el mismo texel por los dos caminos?
// Camino 1 (CPU): detalleG() de 04d reparte la ortofoto de la tesela del Mundo (256 m, la fila 0 de la imagen al NORTE) en celdas de 2 m;
// la DataTexture que sale tiene la fila 0 al SUR (flipY = false: la fila 0 de los datos es v = 0). Camino 2 (GPU): la coordenada con la que
// el GLSL del glb lee uGnd, sacada del propio sombreador y evaluada aquí con una calculadora de expresiones vec2 mínima.
// La ortofoto sintética lleva escrita su posición: R = 80 + 150·x/256, G = 80 + 150·y/256 (x, y en metros dentro de la tesela).
function evaluaGlsl(expr, entorno, defs) {
  const tk = expr.match(/\d+\.?\d*(?:e-?\d+)?|[A-Za-z_]\w*|[-+*/(),.]/g); let i = 0;
  const op = (a, b, f) => { const n = Math.max(a.length, b.length); return Array.from({ length: n }, (_, k) => f(a.length === 1 ? a[0] : a[k], b.length === 1 ? b[0] : b[k])); };
  const SW = { x: 0, y: 1, z: 2, w: 3 };
  function prim() {
    const t = tk[i++];
    if (t === "(") { const v = suma(); i++; return v; }
    if (/^\d/.test(t)) return [Number(t)];
    if (tk[i] === "(") { i++; const args = []; while (tk[i] !== ")") { args.push(suma()); if (tk[i] === ",") i++; } i++; if (!/^vec[234]$/.test(t)) throw new Error("función GLSL no prevista: " + t); return [].concat(...args); }
    if (t in entorno) return entorno[t];
    if (defs[t]) return evaluaGlsl(defs[t], entorno, defs);
    throw new Error("identificador GLSL sin valor: " + t);
  }
  function post() { let v = prim(); while (tk[i] === ".") { i++; const sw = tk[i++]; v = [...sw].map(c => v[SW[c]]); } return v; }
  function un() { if (tk[i] === "-") { i++; return un().map(x => -x); } return post(); }
  function prod() { let v = un(); while (tk[i] === "*" || tk[i] === "/") { const o = tk[i++], w = un(); v = op(v, w, o === "*" ? (a, b) => a * b : (a, b) => a / b); } return v; }
  function suma() { let v = prod(); while (tk[i] === "+" || tk[i] === "-") { const o = tk[i++], w = prod(); v = op(v, w, o === "+" ? (a, b) => a + b : (a, b) => a - b); } return v; }
  const r = suma(); if (i !== tk.length) throw new Error("expresión GLSL sin leer entera: " + expr); return r;
}
function argumento(src, inicio) {   // el texto desde «inicio» hasta su paréntesis, coma o punto y coma de cierre, al mismo nivel
  let k = src.indexOf(inicio); assert.ok(k >= 0, "no está «" + inicio + "» en el sombreador"); k += inicio.length; let n = 0, a = k;
  for (; a < src.length; a++) { const c = src[a]; if (c === "(") n++; else if (c === ")") { if (n === 0) break; n--; } else if ((c === ";" || c === ",") && n === 0) break; }
  return src.slice(k, a).trim();
}
test("el color ancho del suelo abierto (uGnd) se lee en el texel del mismo punto del mundo, en hojas de 128 m y de 256 m (norte arriba)", t => {
  if (SALTO) return t.skip(SALTO);
  const Mx = evalua(false), TS = 256, W = 512, t0 = Mx.Mundo.tesela(1, 1), px = new Uint8Array(W * W * 4);
  for (let row = 0; row < W; row++) for (let col = 0; col < W; col++) {
    const x = (col + 0.5) / W * TS, y = TS - (row + 0.5) / W * TS, o = (row * W + col) * 4;
    px[o] = Math.round(80 + 150 * x / TS); px[o + 1] = Math.round(80 + 150 * y / TS); px[o + 2] = 255; px[o + 3] = 255;
  }
  Object.assign(t0, { suel: new Uint8Array(Mx.Mundo.NS2 * Mx.Mundo.NS2 * 3), ortImg: { naturalWidth: W }, ortPix: px, ortW: W, ortH: W });
  const hojas = [glb(128, 128, 0), glb(256, 0, 0), glb(128, 0, 128)];
  for (const g of hojas) Mx.SombreadoTiles.modelo(g.raiz, g.tile);
  Mx.SombreadoTiles.actualiza();
  const tarea = Mx.cola.find(c => c.k === "D" + t0.key); assert.ok(tarea, "actualiza() no pidió el color ancho de la tesela");
  let s; while (!(s = tarea.gen.next()).done); tarea.alAcabar(s.value);
  const tg = t0.uni.uGnd.value, GN = tg.image.width, dat = tg.image.data;
  assert.strictEqual(tg.flipY, false, "la DataTexture no se voltea: la fila 0 de los datos es v = 0");
  const casos = [[hojas[0], 200, 40], [hojas[0], 150, 110], [hojas[1], 30, 220], [hojas[1], 230, 15], [hojas[2], 60, 200]];
  for (const [g, x, y] of casos) {
    const { sh } = compila(g.ter.material), f = sh.fragmentShader, defs = {};
    for (const nom of ["lc", "uvO"]) { const d = "vec2 " + nom + " = "; if (f.includes(d)) defs[nom] = argumento(f, d); }
    const uni = sh.uniforms, entorno = { vWP: [x, 0, -y], uTile: uni.uTile.value.toArray(), uCua: uni.uCua.value.toArray() };
    const uv = evaluaGlsl(argumento(f, "texture2D(uGnd, "), entorno, defs);
    const i = Math.min(GN - 1, Math.max(0, Math.floor(uv[0] * GN))), j = Math.min(GN - 1, Math.max(0, Math.floor(uv[1] * GN))), o = (j * GN + i) * 4;
    const xg = (dat[o] - 80) / 150 * TS, yg = (dat[o + 1] - 80) / 150 * TS;
    assert.ok(Math.abs(xg - x) < 4 && Math.abs(yg - y) < 4, "hoja de " + g.tile.boundingVolume.box[3] * 2 + " m: el punto (" + x + ", " + y + ") lee el color ancho de (" + xg.toFixed(1) + ", " + yg.toFixed(1) + ")");
  }
});

test("04b_escena3d.js engancha SombreadoTiles en load-model, dispose-model, actualiza y al liberar o fallar", () => {
  const m = lee("04b_escena3d.js");
  // AG-1.5: envuelto en Cola.cobra (lo que tarda se apunta como deuda del reloj de carga)
  assert.match(m, /addEventListener\("load-model", (Cola\.cobra\("T", )?function \(e\) \{ SombreadoTiles\.modelo\(e\.scene, e\.tile\); \}\)/);
  assert.match(m, /addEventListener\("dispose-model", function \(e\) \{ SombreadoTiles\.suelta\(e\.scene\); \}\)/);
  assert.match(m, /tiles\.update\(\);\s*\n\s*SombreadoTiles\.actualiza\(\);/);
  assert.ok((m.match(/SombreadoTiles\.libera\(\)/g) || []).length >= 2, "libera() en falla() y en libera()");
});
