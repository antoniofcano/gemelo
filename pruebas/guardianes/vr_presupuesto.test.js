"use strict";
// Q0c-a (apps/web/motor/02g_vr_presupuesto.js; doc/sistema/VR.md#perfil-de-rendimiento-vr): el escalón de VR manda en todo lo que pesa, no solo en los
// olivos. En Node y sin navegador, con el three de verdad (el de apps/web):
//   · la tabla: una fila por perfil de VR_PERFILES (29_vr), el escalón 0 es lo de pantalla, cada escalón quita lo mismo o más que el anterior y lo
//     medido (octaedros del LiDAR, relieve) cae después que lo deducido e ilustrativo (regla 5);
//   · qué recibe cada fuente en cada escalón, con mallas instanciadas falsas (recuento exacto por distancia, colores con su instancia);
//   · fuera de VR no cambia nada (ni se llama a nadie) y al volver al escalón 0 o salir se restaura todo, byte a byte;
//   · los módulos de verdad (18_paisaje, 08b_marcadores_lidar, 04e_suelo_fondo) se apuntan y responden; 29_vr llama en sus tres sitios.
// Lo que NO dice: fps ni triángulos en un casco (eso, el banco con la VR simulada y el Quest con ?debug&mide=60&xrnivel=N). No probado en Quest.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

const FUENTE = lee("apps/web/motor/02g_vr_presupuesto.js");
function trozo(ini, fin) { const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin); assert.ok(i >= 0 && f > i, "02g debe marcar " + ini + " … " + fin); return FUENTE.slice(i, f); }
const PURO = trozo("// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo("// [motor:inicio]", "// [motor:fin]");
const P = new Function("\"use strict\";\n" + PURO + "\nreturn VrPresupuestoPuro;")();
const nuevo = () => new Function("\"use strict\";\n" + PURO + MOTOR + "\nreturn VrPresupuesto;")();
const VR = lee("apps/web/motor/29_vr.js");
const PERFILES = Function("return " + /var VR_PERFILES = (\[.*?\]);/.exec(VR)[1])();
const inf = v => v === null || v === undefined ? Infinity : v;

// ---------------------------------------------------------------- la tabla
test("tabla: una fila por perfil de VR_PERFILES, el escalón 0 es lo de pantalla y fuera de VR es la base", () => {
  assert.strictEqual(P.ESCALONES.length, PERFILES.length, "un escalón por perfil de 29_vr");
  assert.deepStrictEqual(P.reparto(0), P.base(), "el escalón 0 no cambia nada respecto a pantalla");
  for (const n of [null, undefined, NaN, "2"]) assert.deepStrictEqual(P.reparto(n), P.base(), "fuera de VR: " + n);
  assert.deepStrictEqual(P.reparto(9), P.reparto(PERFILES.length - 1), "por encima, el último");
  assert.deepStrictEqual(P.reparto(-3), P.reparto(0));
  assert.deepStrictEqual(Object.keys(P.FUENTES).sort(), P.ORDEN.slice().sort(), "cada fuente está en el orden de sacrificio");
  P.ESCALONES.forEach((f, i) => assert.deepStrictEqual(Object.keys(f).sort(), P.ORDEN.slice().sort(), "fila " + i + " completa"));
});

test("tabla: cada escalón quita lo mismo o más que el anterior, y lo medido cae después que lo deducido e ilustrativo (regla 5)", () => {
  for (let i = 1; i < P.ESCALONES.length; i++) {
    const a = P.ESCALONES[i - 1], b = P.ESCALONES[i];
    for (const k of P.ORDEN) {
      const q = P.FUENTES[k].que;
      if (q === "radio") assert.ok(inf(b[k]) <= inf(a[k]), k + " no crece al bajar de " + (i - 1) + " a " + i);
      if (q === "si") assert.ok(!(b[k] && !a[k]), k + " no vuelve al bajar");
      if (q === "celdas") assert.ok(b[k] <= a[k], k + " no gana celdas al bajar");
    }
  }
  P.ESCALONES.forEach((f, i) => {
    if (f.copasLidar !== null) assert.ok(f.sombras === false && inf(f.arbolesPaisaje) < inf(f.copasLidar) && inf(f.marcasOT) < inf(f.copasLidar), "escalón " + i + ": antes de recortar lo medido se recorta lo deducido y se apaga lo ilustrativo");
    if (f.sueloFondo < P.FUENTES.sueloFondo.base) assert.ok(f.copasLidar !== null, "el relieve se pide más grueso solo en el último recurso");
    assert.ok(f.sueloFondo >= 32, "el relieve nunca se apaga");
  });
  for (const k of ["copasLidar", "sueloFondo"]) assert.strictEqual(P.FUENTES[k].clase, "medido");
  assert.strictEqual(P.FUENTES.arbolesPaisaje.clase, "deducido"); assert.strictEqual(P.FUENTES.sombras.clase, "ilustrativo");
  assert.ok(P.ORDEN.indexOf("copasLidar") > P.ORDEN.indexOf("arbolesPaisaje") && P.ORDEN.indexOf("sueloFondo") > P.ORDEN.indexOf("sombras"));
});

test("puro: paso, recorte por distancia y hundimiento", () => {
  assert.strictEqual(P.paso(P.base()), null, "sin radios no hay umbral");
  assert.strictEqual(P.paso(P.reparto(3)), Math.max(P.PASO_MIN, 100 / 4));
  assert.strictEqual(P.paso({ arbolesPaisaje: 400, marcasOT: null, copasLidar: null }), 100);
  const mat = new Float32Array(16 * 5), idx = new Int32Array(5);
  [[0, 0], [3, 4], [6, 8], [-5, 0], [100, 100]].forEach(([x, z], i) => { mat[i * 16 + 12] = x; mat[i * 16 + 14] = z; });
  assert.strictEqual(P.recorta(mat, 5, 0, 0, 5, idx), 3); assert.deepStrictEqual([...idx.slice(0, 3)], [0, 1, 3], "a ≤ 5 m, en su orden");
  assert.strictEqual(P.recorta(mat, 5, 100, 100, 1, idx), 1); assert.strictEqual(idx[0], 4);
  assert.strictEqual(P.hundimiento(128, 128, 1.5), 1.5); assert.strictEqual(P.hundimiento(64, 128, 1.5), 3);
});

// ---------------------------------------------------------------- el motor con mallas falsas
/** n instancias en fila sobre el eje x (x = i·paso, z = 0), con color por instancia si se pide */
function malla(n, paso, color) {
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), n), o = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < n; i++) { o.position.set(i * paso, 1, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (color) m.setColorAt(i, c.setRGB(i / n, 0, 0)); }
  return m;
}
const foto = m => ({ count: m.count, visible: m.visible, mat: Array.from(m.instanceMatrix.array), col: m.instanceColor ? Array.from(m.instanceColor.array) : null });
function apunta(V) {
  const s = { arb: [malla(300, 5, true), malla(300, 5, true)], marc: [malla(600, 1)], cop: [malla(600, 1)], llamadas: { sombras: [], sueloFondo: [] } };
  V.instancias("arbolesPaisaje", s.arb); V.instancias("marcasOT", s.marc); V.instancias("copasLidar", s.cop);
  V.fuente("sombras", v => s.llamadas.sombras.push(v)); V.fuente("sueloFondo", v => s.llamadas.sueloFondo.push(v));
  s.todas = () => s.arb.concat(s.marc, s.cop); s.antes = s.todas().map(foto);
  return s;
}
const enRadio = (n, paso, cx, r) => { let k = 0; for (let i = 0; i < n; i++) if (Math.abs(i * paso - cx) <= r) k++; return k; };

test("fuera de VR no cambia nada: apuntarse, moverse y salir sin haber entrado no tocan ni una instancia ni llaman a nadie", () => {
  const V = nuevo(), s = apunta(V);
  V.mueve(0, 0); V.mueve(500, 0); V.ponEscalon(null); V.mueve(900, 0);
  assert.deepStrictEqual(s.todas().map(foto), s.antes);
  assert.deepStrictEqual(s.llamadas, { sombras: [], sueloFondo: [] }, "las fuentes de valor no reciben nada");
  assert.strictEqual(V.estado().recortes, 0);
});

test("qué recibe cada fuente en cada escalón (recuento exacto) y al volver al 0 y al salir se restaura todo", () => {
  const V = nuevo(), s = apunta(V), cx = 400;
  for (let n = 0; n < P.ESCALONES.length; n++) {
    V.ponEscalon(n); V.mueve(cx, 0);
    const f = P.ESCALONES[n];
    const esp = { arbolesPaisaje: f.arbolesPaisaje === null ? 300 : enRadio(300, 5, cx, f.arbolesPaisaje), marcasOT: f.marcasOT === null ? 600 : enRadio(600, 1, cx, f.marcasOT), copasLidar: f.copasLidar === null ? 600 : enRadio(600, 1, cx, f.copasLidar) };
    assert.strictEqual(s.arb[0].count, esp.arbolesPaisaje, "paisaje, escalón " + n); assert.strictEqual(s.arb[1].count, esp.arbolesPaisaje, "las mallas hermanas, igual");
    assert.strictEqual(s.marc[0].count, esp.marcasOT, "marcas, escalón " + n); assert.strictEqual(s.cop[0].count, esp.copasLidar, "copas, escalón " + n);
    const e = V.estado();
    assert.strictEqual(e.escalon, n); assert.strictEqual(e.fuentes.sombras.valor, f.sombras); assert.strictEqual(e.fuentes.sueloFondo.valor, f.sueloFondo);
    assert.strictEqual(e.fuentes.marcasOT.dibujadas, esp.marcasOT);
    // cada instancia que queda es de verdad una de las que están a ≤ r, con SU color
    if (f.arbolesPaisaje !== null) for (let q = 0; q < s.arb[0].count; q++) {
      const x = s.arb[0].instanceMatrix.array[q * 16 + 12], i = Math.round(x / 5);
      assert.ok(Math.abs(x - cx) <= f.arbolesPaisaje); assert.ok(Math.abs(s.arb[1].instanceColor.array[q * 3] - i / 300) < 1e-6, "el color viaja con su instancia");
    }
  }
  // las fuentes de valor solo se llaman cuando su valor cambia
  const vals = P.ESCALONES.map(f => f.sombras), cambios = vals.filter((v, i) => v !== (i ? vals[i - 1] : true));
  assert.deepStrictEqual(s.llamadas.sombras, cambios);
  const cel = P.ESCALONES.map(f => f.sueloFondo); assert.deepStrictEqual(s.llamadas.sueloFondo, cel.filter((v, i) => v !== (i ? cel[i - 1] : 128)));
  V.ponEscalon(0);
  assert.deepStrictEqual(s.todas().map(foto), s.antes, "escalón 0: todo como estaba, byte a byte");
  assert.strictEqual(s.llamadas.sombras[s.llamadas.sombras.length - 1], true); assert.strictEqual(s.llamadas.sueloFondo[s.llamadas.sueloFondo.length - 1], 128);
  V.ponEscalon(3); V.mueve(cx, 0); V.ponEscalon(null);
  assert.deepStrictEqual(s.todas().map(foto), s.antes, "al salir de VR: todo como estaba");
  assert.deepStrictEqual(V.estado().centro, null, "al salir se olvida dónde estaba la cabeza");
});

test("moverse: por debajo del umbral no recorta; por encima, sí; sin nada en el radio la malla no se dibuja y vuelve al restaurar", () => {
  const V = nuevo(), s = apunta(V);
  V.ponEscalon(3); V.mueve(0, 0); const r0 = V.estado().recortes;
  V.mueve(P.paso(P.reparto(3)) - 1, 0); assert.strictEqual(V.estado().recortes, r0, "a menos del umbral, nada");
  V.mueve(5000, 0); assert.ok(V.estado().recortes > r0, "pasado el umbral, recorta otra vez");
  for (const m of s.todas()) { assert.strictEqual(m.count, 0); assert.strictEqual(m.visible, false, "sin instancias cerca no se pide la llamada"); }
  V.ponEscalon(null); for (const m of s.todas()) assert.strictEqual(m.visible, true);
  // la cabeza aún sin conocer: el escalón no recorta hasta el primer mueve
  const V2 = nuevo(), s2 = apunta(V2); V2.ponEscalon(3); assert.strictEqual(s2.marc[0].count, 600); V2.mueve(0, 0); assert.ok(s2.marc[0].count < 600);
});

test("renueva: el módulo reescribe sus instancias (otra exageración) con el recorte puesto; se recorta con las nuevas y al salir quedan las nuevas", () => {
  const V = nuevo(), s = apunta(V), m = s.marc[0], o = new THREE.Object3D();
  V.ponEscalon(3); V.mueve(0, 0); const k = m.count;
  for (let i = 0; i < 600; i++) { o.position.set(i, 7, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }   // lo que hace coloca(): las 600, en su orden
  V.renueva("marcasOT");
  assert.strictEqual(m.count, k, "el mismo recorte"); assert.strictEqual(m.instanceMatrix.array[13], 7, "con la altura nueva");
  V.ponEscalon(null); assert.strictEqual(m.count, 600); assert.strictEqual(m.instanceMatrix.array[599 * 16 + 13], 7, "restaurado con lo nuevo, no con lo viejo");
  V.olvida("marcasOT"); V.ponEscalon(3); V.mueve(0, 0); assert.strictEqual(m.count, 600, "olvidada, ya no se toca");
});

test("entrar en VR con una fuente apuntada más tarde: recibe ya su escalón", () => {
  const V = nuevo(); V.ponEscalon(3); V.mueve(0, 0);
  const vistos = []; V.fuente("sombras", v => vistos.push(v)); assert.deepStrictEqual(vistos, [false]);
  const m = malla(600, 1); V.instancias("marcasOT", [m]); assert.strictEqual(m.count, enRadio(600, 1, 0, 100));
});

// ---------------------------------------------------------------- los módulos de verdad
function ctx(extra) { const g = Object.assign({ THREE, location: { search: "" } }, extra); const c = vm.createContext(g); vm.runInContext(FUENTE, c, { filename: "02g_vr_presupuesto.js" }); return c; }
const corre = (c, f) => vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/" + f), c, { filename: f });

test("18_paisaje: los árboles que no son olivo se apuntan y el escalón los recorta (tronco y las tres masas a la vez); al salir, todos", () => {
  const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const arboles = []; for (let i = 0; i < 50; i++) arboles.push({ x: i * 20, y: 0, h: 6, r: 2, tipo: i % 7 ? "encina" : "arbusto" });
  const c = ctx({ D: { paisaje: { edificios: [], tendido: { linea: [], postes: [], derivaciones: [] }, arroyo: { ejes: [] }, arboles } },
    $: () => ({ checked: true, addEventListener() {} }), ESC_R8: 1, suelo: () => 80, desp: () => 0, copas: [], scene: new THREE.Scene(), SRGB: THREE.SRGBColorSpace,
    sol: {}, exag: 1, hash, gSombras: new THREE.Group(), tronco: null, matSombra: new THREE.MeshBasicMaterial({ transparent: true }),
    geoSombra: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pon() {}, lista: [], lluvia: null, cur: { ms: 0, nub: 0, lluvia: 0 }, tMundo: 0,
    nivel: () => ({ s: { alt: 0.8, az: 0.4 }, d: 1 }), esfera: null, EST: { activa: false } });
  corre(c, "18_paisaje.js"); vm.runInContext("colocaPaisaje()", c);
  const V = vm.runInContext("VrPresupuesto", c), insts = vm.runInContext("gPaisaje", c).children.filter(o => o.isInstancedMesh);
  assert.strictEqual(insts.length, 4, "tronco y tres masas");
  const antes = insts.map(foto);
  V.ponEscalon(3); V.mueve(0, 0);   // r = 120 m: x = 0..120 → 7 árboles
  insts.forEach(m => assert.strictEqual(m.count, 7));
  vm.runInContext("colocaPaisaje()", c); insts.forEach(m => assert.strictEqual(m.count, 7, "recolocar (exageración) mantiene el recorte"));
  V.ponEscalon(0); assert.deepStrictEqual(insts.map(foto), antes);
});

test("08b_marcadores_lidar: anillos y octaedros se apuntan, recortan por su radio y se olvidan al liberar", () => {
  const copas = [], marc = []; for (let i = 0; i < 400; i++) { copas.push({ x: i * 2, y: 0, h: 4 }); marc.push({ x: i * 2 + 1, y: 0, par: -1 }); }
  const defs = [], Bus = { on() { return () => {}; } }, scene = new THREE.Scene();
  const c = ctx({ scene, $: () => ({ checked: true }), colorCss: () => 0x58b6e8, cIn: copas, marc, copas, suelo: () => 100, exag: 1, listo: true, Componentes: { registra: d => defs.push(d) } });
  corre(c, "08b_marcadores_lidar.js");
  defs[0].monta({ on: () => () => {} });
  const V = vm.runInContext("VrPresupuesto", c), mc = scene.children[0].children[0], mm = scene.children[1].children[0];
  V.ponEscalon(2); V.mueve(0, 0); assert.strictEqual(mc.count, 400, "escalón 2: las copas del LiDAR enteras (medido)"); assert.strictEqual(mm.count, enRadio(400, 2, -1, 180), "anillos a ≤ 180 m");
  V.ponEscalon(3); V.mueve(0, 0); assert.strictEqual(mc.count, enRadio(400, 2, 0, 250), "escalón 3: copas a ≤ 250 m");
  V.ponEscalon(null); assert.strictEqual(mc.count, 400); assert.strictEqual(mm.count, 400);
  defs[0].libera(); assert.deepStrictEqual(Object.keys(V.estado().fuentes), [], "liberado, ninguna fuente apuntada");
});

test("04e_suelo_fondo: en el escalón 3 la rejilla tiene 64 celdas y baja el doble; al volver, 128 y 1,5 m; fuera de VR, como siempre", () => {
  const scene = new THREE.Scene(), defs = [];
  const c = ctx({ scene, D: { mosaico: { x0: 0, yN: 10000, w: 5000, h: 5000, res: 1 }, grueso: { x0: 0, yN: 10000, w: 5000, h: 5000, res: 8 } }, Mundo: { grueso: () => 100 },
    UN: { uMos: { value: new THREE.Texture() } }, matSuelo: new THREE.MeshLambertMaterial({}), Escena3D: { estado: () => "activo" }, exag: 1, Componentes: { registra: d => defs.push(d) } });
  corre(c, "04e_suelo_fondo.js");
  const api = defs[0].monta({}), V = vm.runInContext("VrPresupuesto", c), tri = () => api.malla().geometry.index.count / 3;
  api.actualiza(); assert.strictEqual(tri(), 128 * 128 * 2, "fuera de VR, la de siempre"); assert.strictEqual(api.baja(), 1.5);
  const g0 = api.malla().geometry;
  V.ponEscalon(2); api.actualiza(); assert.strictEqual(api.malla().geometry, g0, "escalón 2: ni se rehace");
  V.ponEscalon(3); api.actualiza(); assert.strictEqual(tri(), 64 * 64 * 2); assert.strictEqual(api.baja(), 3);
  assert.ok(Math.abs(api.malla().geometry.attributes.position.array[1] - 97) < 1e-6, "baja 3 m bajo el relieve grueso");
  V.ponEscalon(0); api.actualiza(); assert.strictEqual(tri(), 128 * 128 * 2); assert.strictEqual(api.baja(), 1.5);
  defs[0].libera(); assert.ok(!("sueloFondo" in V.estado().fuentes));
});

test("cableado: 29_vr pone el escalón en vrPerfil, lo quita al salir y avisa de la cabeza cada fotograma; 07_follaje apunta las sombras", () => {
  assert.match(VR, /function vrPerfil\(n\) \{[^\n]*VrPresupuesto\.ponEscalon\(n\);/);
  assert.match(VR, /Arboles\.perfil\(null\); Escena3D\.perfil\(null\); VrPresupuesto\.ponEscalon\(null\);/);
  assert.match(VR, /vrAplicaRig\(\);\n\s*VrPresupuesto\.mueve\(nx, nz\);/);
  assert.match(lee("apps/web/motor/07_follaje.js"), /VrPresupuesto\.fuente\("sombras", function \(v\) \{ matSombra\.visible = v !== false; \}\)/);
  const todo = require("fs").readdirSync(path.join(RAIZ, "apps/web/motor")).filter(f => f.endsWith(".js") && f !== "02g_vr_presupuesto.js").map(f => lee("apps/web/motor/" + f)).join("\n");
  assert.strictEqual((todo.match(/VrPresupuesto\.ponEscalon\(/g) || []).length, 2, "solo 29_vr pone el escalón (al cambiar de perfil y al salir)");
});
