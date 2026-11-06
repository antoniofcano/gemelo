"use strict";
// Q0c-a (apps/web/src/nucleo/presupuesto.ts desde A1-12, con el talón apps/web/motor/02g_vr_presupuesto.js; doc/sistema/VR.md#perfil-de-rendimiento-vr):
// el escalón de VR manda en todo lo que pesa, no solo en los olivos. Las pruebas puras (la tabla y la regla 5, el recorte por distancia, qué recibe
// cada fuente con mallas falsas, la restauración byte a byte, renueva) están en Vitest, en apps/web/src/nucleo/presupuesto.test.ts. Aquí, en Node y
// con el three de verdad (el de apps/web), queda lo que cruza con el legado:
//   · una fila de la tabla por perfil de VR_PERFILES (29_vr);
//   · los módulos de verdad (18_paisaje, 08b_marcadores_lidar, 04e_suelo_fondo) se apuntan al VrPresupuesto del talón y responden; 29_vr llama en sus tres sitios.
// Lo que NO dice: fps ni triángulos en un casco (eso, el banco con la VR simulada y el Quest con ?debug&mide=60&xrnivel=N). No probado en Quest.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");
const { conFabrica } = require("./_materiales");   // Materiales e InfoDibujo (02h/02i, F1) en el contexto del módulo

// three y el núcleo (node lee TypeScript tal cual): el talón 02g toma de Nucleo lo que expone
let THREE, Nucleo, P;
test.before(async () => {
  THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href);
  Nucleo = require("./_nucleo");
  P = Nucleo.VrPresupuestoPuro;
});

const FUENTE = lee("apps/web/motor/02g_vr_presupuesto.js");
const VR = lee("apps/web/motor/29_vr.js");
const PERFILES = Function("return " + /var VR_PERFILES = (\[.*?\]);/.exec(VR)[1])();

test("tabla: una fila por perfil de VR_PERFILES (29_vr); por encima del último, el último", () => {
  assert.strictEqual(P.ESCALONES.length, PERFILES.length, "un escalón por perfil de 29_vr");
  assert.deepStrictEqual(P.reparto(9), P.reparto(PERFILES.length - 1), "por encima, el último");
});

const foto = m => ({ count: m.count, visible: m.visible, mat: Array.from(m.instanceMatrix.array), col: m.instanceColor ? Array.from(m.instanceColor.array) : null });
const enRadio = (n, paso, cx, r) => { let k = 0; for (let i = 0; i < n; i++) if (Math.abs(i * paso - cx) <= r) k++; return k; };

// ---------------------------------------------------------------- los módulos de verdad
function ctx(extra) { const g = Object.assign({ THREE, Nucleo, location: { search: "" } }, extra); const c = vm.createContext(conFabrica(g)); vm.runInContext(FUENTE, c, { filename: "02g_vr_presupuesto.js" }); return c; }
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
