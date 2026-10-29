"use strict";
// Avatares VRM (P7c, ADR-0020). En Node: el trozo puro de apps/web/motor/26b_avatares.js (cuántos VRM por aparato, el reparto con histéresis, los huesos
// con la fórmula del muñeco, el IK de los brazos, el parpadeo, la lectura del catálogo y la caída al muñeco), el campo avatar.vrm de los metadatos
// (SalaPose.leeInfo de 26_presencia.js), y @pixiv/three-vrm 3.5.5 con la three 0.186.1 del cliente sobre el VRM sintético (tuberia/avatares/sintetico.mjs, de P7b):
// que lo carga, que los huesos normalizados mueven los de verdad y que dos análisis del mismo búfer dan la misma estructura (lo que permite compartir
// geometría y texturas, porque three-vrm no clona). La medida en Chrome (llamadas, triángulos, memoria) va por el banco (TESTING.md).
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), { pathToFileURL } = require("url");
const { RAIZ, lee, path } = require("./_util");
const OBLIGATORIOS = ["hips", "spine", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"];   // los obligatorios de VRM 1.0

function trozo(fich, devuelve) {
  const s = lee(fich), i = s.indexOf("// [puro:inicio]"), f = s.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, fich + " debe marcar su trozo puro");
  return new Function("\"use strict\";\n" + s.slice(i, f) + "\nreturn " + devuelve + ";")();
}
const AP = trozo("apps/web/motor/26b_avatares.js", "AvataresPuro");
const { Muneco, SalaPose } = trozo("apps/web/motor/26_presencia.js", "{ Muneco: Muneco, SalaPose: SalaPose }");
const cerca = (a, b, e, m) => assert.ok(Math.abs(a - b) <= (e || 1e-9), (m || "") + " " + a + " ≠ " + b);

test("cupo: escritorio 6, móvil 3, Quest 3; con gafas según el nivel de VR_PERFILES (3/2/1/0)", () => {
  assert.strictEqual(AP.cupo("escritorio", false), 6); assert.strictEqual(AP.cupo("movil", false), 3); assert.strictEqual(AP.cupo("quest", false), 3);
  assert.deepStrictEqual([0, 1, 2, 3].map(n => AP.cupo("quest", true, n)), [3, 2, 1, 0]);
  assert.strictEqual(AP.cupo("escritorio", true, 9), 0, "un nivel de más se queda en el último");
  const vr = lee("apps/web/motor/29_vr.js"); assert.strictEqual((/var VR_PERFILES = \[(.*?)\];/.exec(vr)[1].match(/\{ n:/g) || []).length, AP.CUPO_VR.length, "un cupo por perfil de VR");
});

test("catálogo (contratos/avatares.md v1): lee id, fichero, sha256 y colores_muneco; descarta lo que no cuadra; sin catálogo u otra versión, null (el muñeco)", () => {
  const sha = "a".repeat(64);
  const c = AP.leeCatalogo({ v: 1, avatares: [{ id: "pastora", fichero: "pastora.vrm", sha256: sha, bytes: 10, colores_muneco: { camisa: "#336699", piel: "#e0b090", sombrero: "paja" } },
    { id: "Malo", fichero: "x.vrm" }, { id: "sin-fichero" }, { id: "ruta", fichero: "../x.vrm" }, { id: "pastora", fichero: "otra.vrm" }, null, { id: "corto", fichero: "corto.vrm", sha256: "no" }] });
  assert.deepStrictEqual(c.todos.map(a => a.id), ["pastora", "sin-fichero", "corto"]);
  assert.strictEqual(c.porId.pastora.camisa, 0x336699); assert.strictEqual(c.porId.pastora.piel, 0xe0b090); assert.strictEqual(c.porId.pastora.sha256, sha);
  assert.strictEqual(c.porId["sin-fichero"].fichero, "sin-fichero.vrm"); assert.strictEqual(c.porId.corto.sha256, null);
  for (const x of [null, undefined, {}, { v: 1, avatares: [] }, { v: 1, avatares: [{ id: "../a" }] }, { v: 2, avatares: [{ id: "a" }] }, [{ id: "a" }], "texto", 3]) assert.strictEqual(AP.leeCatalogo(x), null, JSON.stringify(x));
  // el ejemplo del contrato se lee entero
  const ej = AP.leeCatalogo(JSON.parse(lee("contratos/avatares-ejemplo.json")));
  assert.deepStrictEqual(ej.todos.map(a => a.id), ["ejemplo-cc0", "ejemplo-cc-by"]); assert.strictEqual(ej.porId["ejemplo-cc0"].camisa, 0x3f7cc2);
});

test("metadatos: avatar.vrm (id del catálogo) llega a leeInfo; si no cuadra, null (el muñeco); lo de antes no cambia", () => {
  const m = v => SalaPose.leeInfo(JSON.stringify({ alias: "Mirlo", avatar: { camisa: 2, sombrero: "gorra", piel: 3, vrm: v }, rol: "hogar", dispositivo: "quest" }));
  assert.strictEqual(m("pastora-1").vrm, "pastora-1");
  for (const v of [undefined, null, "", "Pastora", "a/b", "x".repeat(33), 7, { id: "a" }]) assert.strictEqual(m(v).vrm, null, JSON.stringify(v));
  const i = m("pastora-1"); assert.deepStrictEqual([i.camisa, i.piel, i.sombrero, i.alias], [2, 3, 2, "Mirlo"]);
  assert.strictEqual(SalaPose.leeInfo("").vrm, null, "un cliente sin avatar (o de antes): null");
});

test("reparto: los n más cercanos a menos de 40 m; nunca más de n; con n = 0, ninguno", () => {
  const cand = [12, 3, 50, 8, 30, 1, 41, 20].map((d, i) => ({ id: "p" + i, d }));
  assert.deepStrictEqual(Object.keys(AP.reparte({}, cand, 3)).sort(), ["p1", "p3", "p5"]);
  assert.deepStrictEqual(Object.keys(AP.reparte({}, cand, 6)).sort(), ["p0", "p1", "p3", "p4", "p5", "p7"], "a más de 40 m no entra aunque haya plaza");
  assert.deepStrictEqual(AP.reparte({ p1: true }, cand, 0), {});
  for (let n = 0; n < 9; n++) assert.ok(Object.keys(AP.reparte({ p0: true, p2: true, p4: true, p6: true }, cand, n)).length <= n);
});

test("reparto con histéresis: quien lo lleva sigue hasta caer del puesto n + 2 o pasar de 44 m; uno nuevo lo quita si está un 10 % más cerca; no oscila", () => {
  // n = 2: A y B lo llevan; C llega por delante de B pero solo un 5 % más cerca → B sigue
  let t = { A: true, B: true };
  let r = AP.reparte(t, [{ id: "A", d: 5 }, { id: "C", d: 9.5 }, { id: "B", d: 10 }], 2);
  assert.deepStrictEqual(Object.keys(r).sort(), ["A", "B"]);
  // C un 20 % más cerca que B → entra C y sale B
  r = AP.reparte(t, [{ id: "A", d: 5 }, { id: "C", d: 8 }, { id: "B", d: 10 }], 2);
  assert.deepStrictEqual(Object.keys(r).sort(), ["A", "C"]);
  // B cae al puesto 4 (n + 2) → sale aunque nadie nuevo esté más cerca de un 10 %
  r = AP.reparte(t, [{ id: "A", d: 5 }, { id: "C", d: 9.8 }, { id: "D", d: 9.9 }, { id: "B", d: 10 }], 2);
  assert.ok(!r.B, "en el puesto n + 2 sale");
  // de 39 a 43 m sigue (histéresis de distancia); a 45, sale; uno nuevo a 43 no entra
  assert.ok(AP.reparte({ A: true }, [{ id: "A", d: 43 }], 2).A); assert.ok(!AP.reparte({ A: true }, [{ id: "A", d: 45 }], 2).A); assert.ok(!AP.reparte({}, [{ id: "A", d: 43 }], 2).A);
  // dos que se cruzan a la misma distancia dentro del margen: ninguno cambia en 200 recálculos
  t = { A: true }; let cambios = 0;
  for (let k = 0; k < 200; k++) { const dA = 10 + 0.3 * Math.sin(k), dB = 10 - 0.3 * Math.sin(k); const n = AP.reparte(t, [{ id: "A", d: dA }, { id: "B", d: dB }], 1); if (!!n.A !== !!t.A) cambios++; t = n; }
  assert.strictEqual(cambios, 0, "con un 3 % de diferencia no debe cambiar nunca");
});

test("huesos: la fórmula de Muneco.avanza sobre los huesos normalizados (andar, quieto); brazos abajo desde la T", () => {
  const st = Muneco.crea(), o = {};
  Muneco.avanza(st, 0, 0, 0, 1 / 60, 0, 1, NaN, false, o, 0);
  let maxSw = 0;
  for (let i = 1; i <= 240; i++) {
    Muneco.avanza(st, 0, -i * 1.4 / 60, 0, 1 / 60, 0, 1, NaN, false, o, 0);
    const h = AP.huesos(o, { L: 0.9 }, null, {});
    cerca(h.leftUpperLeg[0], -o.piernaI, 1e-12, "muslo izq."); cerca(h.rightUpperLeg[0], -o.piernaD, 1e-12, "muslo der.");
    cerca(h.leftUpperArm[0], -o.brazoI, 1e-12, "brazo izq."); cerca(h.rightUpperArm[0], -o.brazoD, 1e-12, "brazo der.");
    cerca(h.leftUpperArm[2], -AP.BAJA, 1e-12); cerca(h.rightUpperArm[2], AP.BAJA, 1e-12);
    assert.ok(h.leftLowerLeg[0] >= 0 && h.rightLowerLeg[0] >= 0, "la rodilla solo se dobla hacia atrás");
    maxSw = Math.max(maxSw, Math.abs(h.leftUpperLeg[0]));
  }
  assert.ok(maxSw > 0.4 && maxSw <= 0.75 + 1e-9, "a 1,4 m/s el muslo llega a " + maxSw + " rad (fórmula: 0,75 × min(1, v/1,7))");
  const q = AP.huesos({ piernaI: 0, piernaD: 0, brazoI: 0, brazoD: 0, agacho: 0 }, { L: 0.9 }, null, {});
  for (const n of ["leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg", "spine"]) assert.deepStrictEqual(q[n].map(v => v + 0), [0, 0, 0], "quieto: " + n);
  assert.strictEqual(q.baja, 0);
});

test("huesos: sentado en el quad (1,15 y 1,05 rad de 16_vida.js) con las espinillas en vertical; con el dron, brazos al mando; agachado, la cadera baja lo que dice la pose", () => {
  const o = {}, st = Muneco.crea();
  Muneco.avanza(st, 0, 0, 0, 1 / 60, 0, 1, NaN, false, o, 1);
  let h = AP.huesos(o, { L: 0.9 }, null, {});
  cerca(h.leftUpperLeg[0], -Muneco.SENTADO_P); cerca(h.leftUpperLeg[0] + h.leftLowerLeg[0], 0, 1e-12, "espinilla vertical");
  cerca(h.leftUpperArm[0], -Muneco.SENTADO_B); cerca(h.rightUpperArm[0], -Muneco.SENTADO_B);
  Muneco.avanza(Muneco.crea(), 0, 0, 0, 1 / 60, 0, 1, NaN, false, o, 2);
  h = AP.huesos(o, { L: 0.9 }, null, {});
  cerca(h.leftUpperArm[0], -Muneco.MANDO_B); assert.deepStrictEqual(h.leftUpperLeg.map(v => v + 0), [0, 0, 0]);
  // con gafas y la cabeza a 1,1 m del suelo: agacho 0,5 → la cadera baja 0,5 m doblando muslo (α) y espinilla (2α) con L (1 − cos α) = 0,5
  Muneco.avanza(Muneco.crea(), 0, 0, 0, 1 / 60, 0, 1, 1.1, true, o, 0);
  h = AP.huesos(o, { L: 0.9 }, null, {});
  cerca(h.baja, 0.5, 1e-9); const al = -h.leftUpperLeg[0]; cerca(0.9 * (1 - Math.cos(al)), 0.5, 1e-9, "caída de la cadera"); cerca(h.leftLowerLeg[0], 2 * al, 1e-9);
  assert.ok(h.spine[0] > 0, "agachado, el tronco se inclina adelante");
  // la cabeza: giro relativo repartido cuello 40 % / cabeza 60 %, con tope; mirar arriba es x negativo; VRM 0.x, x y z al revés
  h = AP.huesos(o, { L: 0.9 }, { yaw: 0.5, pitch: 0.2 }, {});
  cerca(h.neck[1] + h.head[1], 0.5, 1e-12); cerca(h.neck[0] + h.head[0], -0.2, 1e-12);
  h = AP.huesos(o, { L: 0.9 }, { yaw: 3, pitch: -2 }, {}); cerca(h.neck[1] + h.head[1], 1.1, 1e-12, "tope del giro"); cerca(h.neck[0] + h.head[0], 0.6, 1e-12, "tope del cabeceo");
  const v1 = AP.huesos({ piernaI: 0.3, brazoI: 0.2 }, {}, null, {}), v0 = AP.huesos({ piernaI: 0.3, brazoI: 0.2 }, { v0: true }, null, {});
  cerca(v0.leftUpperLeg[0], -v1.leftUpperLeg[0]); cerca(v0.leftUpperArm[2], -v1.leftUpperArm[2]); cerca(v0.leftLowerArm[1], v1.leftLowerArm[1]);
});

test("IK de dos huesos: largos exactos, la muñeca en la mano si llega (estirado hacia ella si no), el codo hacia el polo", () => {
  const S = [0, 1.4, 0], a = 0.28, b = 0.26, P = [0.3, 0.9, 0.2];
  for (const T of [[0.2, 1.1, -0.3], [0.1, 1.0, -0.1], [0, 1.4, -2], [0, 1.4, 0], [0.05, 1.38, 0]]) {
    const r = AP.ik(S, T, a, b, P), d = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    cerca(d(S, r.E), a, 1e-6, "brazo"); cerca(d(r.E, r.H), b, 1e-6, "antebrazo");
    const l = d(S, T); if (l <= a + b - 1e-3 && l >= Math.abs(a - b) + 1e-3) cerca(d(r.H, T), 0, 1e-6, "la muñeca en la mano");
    else if (l > a + b) cerca(d(r.H, T), l - (a + b), 1e-3, "estirado hacia la mano");
  }
  const r = AP.ik(S, [0.2, 1.1, -0.3], a, b, P); assert.ok(r.E[1] < 1.4 && r.E[0] > 0, "con el polo abajo y afuera, el codo baja y sale");
});

test("parpadeo: cierres de 0,15 s cada 2-6 s, del 0 al 1 y vuelta", () => {
  let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const st = {}, dt = 1 / 120; let n = 0, cerr = 0, max = 0, prev = 0;
  for (let i = 0; i < 120 * 600; i++) { const v = AP.parpadeo(st, dt, r); max = Math.max(max, v); if (v > 0) cerr += dt; if (v > 0 && prev === 0) n++; prev = v; assert.ok(v >= 0 && v <= 1); }
  assert.ok(n >= 600 / 6.2 && n <= 600 / 2, n + " parpadeos en 10 min"); assert.ok(max > 0.95); cerca(cerr / n, 0.15, 0.02, "duración");
});

test("motor: @pixiv/three-vrm con versión exacta, pedido con import() solo dentro de Avatares (con presencia); el importmap de la salida artefacto la lleva", () => {
  const p = JSON.parse(lee("apps/web/package.json")); assert.strictEqual(p.dependencies["@pixiv/three-vrm"], "3.5.5");
  const f = lee("apps/web/motor/26b_avatares.js");
  assert.match(f, /import\("@pixiv\/three-vrm"\)/); assert.ok(f.indexOf('import("@pixiv/three-vrm")', f.indexOf("[puro:fin]")) > f.indexOf("if (!Presencia.activo()) return null;"), "solo con presencia");
  assert.ok(!/fetch\("http|fetch\('http|https?:\/\//.test(f.replace(/\/\/.*$/gm, "")), "el motor no pide a otros hosts");
  assert.match(lee("apps/web/vite.config.js"), /@pixiv\\\/three-vrm/);
  assert.match(lee("tuberia/salida_artefacto/montar_v2.py"), /@pixiv\/three-vrm@%s\/lib\/three-vrm\.module\.js/);
});

// three-vrm de verdad (si apps/web y tuberia/avatares están instalados: npm i en cada una)
const NM = path.join(RAIZ, "apps", "web", "node_modules"), AV = path.join(RAIZ, "tuberia", "avatares");
const HAY = fs.existsSync(path.join(NM, "@pixiv", "three-vrm", "lib", "three-vrm.module.js")) && fs.existsSync(path.join(AV, "node_modules", "@gltf-transform", "core"));
// en Node no hay decodificador de imágenes (GLTFLoader se quedaría esperando): se quitan las texturas del GLB; la geometría, los huesos, las expresiones y el
// MToon se cargan igual. Las texturas de verdad (y los VRM 0.x de 100Avatars) se ven en Chrome, por el banco
function sinTexturas(glb) {
  const lj = glb.readUInt32LE(12), j = JSON.parse(glb.subarray(20, 20 + lj).toString("utf8")), resto = glb.subarray(20 + lj);
  delete j.textures; delete j.images; delete j.samplers;
  const limpia = o => { if (!o || typeof o !== "object") return; for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === "object" && !Array.isArray(v) && typeof v.index === "number" && /Texture$/.test(k)) delete o[k]; else limpia(v); } };
  limpia(j.materials); limpia(j.extensions);
  let js = Buffer.from(JSON.stringify(j), "utf8"); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const cab = Buffer.alloc(20); glb.copy(cab, 0, 0, 12); cab.writeUInt32LE(20 + js.length + resto.length, 8); cab.writeUInt32LE(js.length, 12); cab.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([cab, js, resto]);
}
async function carga() {
  const u = p => pathToFileURL(path.join(NM, p)).href;
  const THREE = await import(u("three/build/three.module.js")), { GLTFLoader } = await import(u("three/examples/jsm/loaders/GLTFLoader.js")), V = await import(u("@pixiv/three-vrm/lib/three-vrm.module.js"));
  const { generaVRM } = await import(pathToFileURL(path.join(AV, "sintetico.mjs")).href);
  const b = sinTexturas(generaVRM({ subdivision: 2, pixeles: 64 })), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  async function analiza() {
    const l = new GLTFLoader(); l.register(p => new V.VRMLoaderPlugin(p));
    const g = await l.parseAsync(ab, "");
    V.VRMUtils.removeUnnecessaryVertices(g.scene); V.VRMUtils.combineSkeletons(g.scene); return g; }
  return { THREE, V, analiza, ab };
}

test("three-vrm 3.5.5 con three 0.186.1: carga el VRM sintético, los huesos normalizados mueven los de verdad, el parpadeo mueve su morph target", { skip: !HAY && "apps/web o tuberia/avatares sin instalar" }, async () => {
  const { THREE, analiza, V } = await carga(), g = await analiza(), vrm = g.userData.vrm;
  assert.ok(vrm && vrm.humanoid && vrm.lookAt && vrm.expressionManager, "VRM con humanoide, mirada y expresiones");
  assert.strictEqual(vrm.meta.metaVersion, "1");
  for (const n of OBLIGATORIOS) assert.ok(vrm.humanoid.getNormalizedBoneNode(n), "hueso " + n);
  const h = AP.huesos({ piernaI: 0.5, piernaD: -0.5, brazoI: -0.4, brazoD: 0.4, agacho: 0 }, { L: 0.9 }, { yaw: 0.3, pitch: 0 }, {});
  for (const n in h) { const b = vrm.humanoid.getNormalizedBoneNode(n); if (b && Array.isArray(h[n])) b.rotation.set(h[n][0], h[n][1], h[n][2]); }
  vrm.expressionManager.setValue("blink", 1); vrm.update(1 / 60); g.scene.updateMatrixWorld(true);
  // la pierna izquierda va hacia delante (+Z en el VRM 1.0): su pie, por delante de la cadera
  const pie = vrm.humanoid.getRawBoneNode("leftFoot").getWorldPosition(new THREE.Vector3()), cad = vrm.humanoid.getRawBoneNode("leftUpperLeg").getWorldPosition(new THREE.Vector3());
  assert.ok(pie.z - cad.z > 0.3, "con piernaI = 0,5 el pie izquierdo va adelante (" + (pie.z - cad.z).toFixed(3) + " m)");
  const mano = vrm.humanoid.getRawBoneNode("leftHand").getWorldPosition(new THREE.Vector3()), hombro = vrm.humanoid.getRawBoneNode("leftUpperArm").getWorldPosition(new THREE.Vector3());
  assert.ok(hombro.y - mano.y > 0.4, "los brazos, abajo desde la T (" + (hombro.y - mano.y).toFixed(3) + " m)");
  let inf = 0; g.scene.traverse(o => { if (o.isMesh && o.morphTargetInfluences) inf = Math.max(inf, o.morphTargetInfluences[0]); });
  assert.ok(inf > 0.99, "el parpadeo cierra el ojo");
  assert.ok(!Object.keys(V.VRMUtils).some(k => /clon/i.test(k)) && !Object.keys(V).some(k => /clon/i.test(k)), "three-vrm 3.5.5 no trae clon de un VRM (si un día lo trae, revisar 26b_avatares.js)");
});

test("varias personas con el mismo avatar: dos análisis del mismo búfer dan la misma estructura (mallas, materiales y texturas en el mismo orden): se comparte geometría y texturas", { skip: !HAY && "apps/web o tuberia/avatares sin instalar" }, async () => {
  const { analiza } = await carga(), a = await analiza(), b = await analiza();
  const lm = g => { const l = []; g.scene.traverse(o => { if (o.isMesh) l.push(o); }); return l; };
  const A = lm(a), B = lm(b);
  assert.strictEqual(A.length, B.length); assert.ok(A.length >= 2);
  for (let i = 0; i < A.length; i++) {
    assert.notStrictEqual(A[i].geometry, B[i].geometry, "cada análisis trae su geometría (sin compartir, duplicada)");
    assert.strictEqual(A[i].geometry.index.count, B[i].geometry.index.count); assert.deepStrictEqual(Object.keys(A[i].geometry.attributes), Object.keys(B[i].geometry.attributes));
    assert.strictEqual(A[i].material.type, B[i].material.type);
    assert.notStrictEqual(A[i].skeleton, B[i].skeleton, "el esqueleto es de cada copia (se anima por separado)");
  }
});

// ---------------------------------------------------------------- en Chrome (SwiftShader: recuentos y memoria, no fps), con dos VRM sintéticos de la tubería
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { propia, python, fixture, ejecuta } = require("./_util");
const crypto = require("crypto");
const SALTO = motivoSalto("los avatares VRM en navegador") || (!fs.existsSync(path.join(RAIZ, "node_modules", "@gltf-transform", "core")) && "falta @gltf-transform/core (npm i en la raíz): los avatares VRM en navegador NO se han comprobado");
let srv, nav, base, baseSin;
test.before(async () => {
  if (SALTO) return;
  const FIX = path.relative(RAIZ, fixture()), WEB = propia("web-avatares");
  const r = ejecuta(python(), ["-I", "tuberia/salida_artefacto/montar_v2.py", "--datos", FIX + "/cerro/embebido.json", "--salida", path.relative(RAIZ, path.join(WEB, "cerro", "index.html"))]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  // el catálogo (contratos/avatares.md v1) con dos sintéticos distintos, en /avatares/ del mismo origen; y una copia de la página sin catálogo
  const { generaVRM } = await import(pathToFileURL(path.join(AV, "sintetico.mjs")).href), dA = path.join(WEB, "avatares"); fs.mkdirSync(dA);
  const avatares = ["sint-a", "sint-b"].map((id, k) => {
    const b = generaVRM({ subdivision: 4, pixeles: 256, meta: { name: "Sintético " + k } }); fs.writeFileSync(path.join(dA, id + ".vrm"), b);
    return { id, nombre: id, fichero: id + ".vrm", sha256: crypto.createHash("sha256").update(b).digest("hex"), bytes: b.length, vrm_version: "1.0", colores_muneco: { camisa: k ? "#b07050" : "#5f7fb0", piel: "#e0b090", sombrero: "ninguno" } };
  });
  fs.writeFileSync(path.join(dA, "catalogo.json"), JSON.stringify({ v: 1, compresion: "ninguna", avatares }));
  const SIN = propia("web-avatares-sin"); fs.mkdirSync(path.join(SIN, "cerro")); fs.copyFileSync(path.join(WEB, "cerro", "index.html"), path.join(SIN, "cerro", "index.html"));
  srv = [await sirve(WEB), await sirve(SIN)]; base = "http://127.0.0.1:" + srv[0].address().port + "/cerro/index.html"; baseSin = "http://127.0.0.1:" + srv[1].address().port + "/cerro/index.html";
  nav = await lanza();
});
test.after(async () => { if (nav) await nav.close(); if (srv) srv.forEach(s => s.close()); });

// abre, deja la cámara en órbita baja a 14 m del punto de partida (donde pasea la mitad de los simulados) y espera a que el reparto se asiente
async function abre(url, consulta, espera) {
  const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.goto(url + "?debug" + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  await p.evaluate(() => { const g = window.__g; g.orb.dist = 14; g.orb.el = 0.35; });
  if (espera) await p.waitForFunction(espera, null, { timeout: 120000, polling: 500 }).catch(() => {});
  await p.waitForTimeout(2500);
  return { p, errores };
}
const medir = p => p.evaluate(() => { const r = window.__g.renderer.info, e = window.__presencia(); return { llamadas: r.render.calls, triangulos: r.render.triangles, geometrias: r.memory.geometries, texturas: r.memory.textures, vrm: e.vrm, n: e.n, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 }; });
const CAPS = path.join(RAIZ, "pruebas", "salida", "capturas-avatares");
const asentado = () => { const v = window.__presencia().vrm; return v && v.catalogo > 0 && v.cargando === 0 && v.fundiendo === 0 && v.conVrm > 0; };

test("en Chrome: con catálogo, los N más cercanos (6 en escritorio) con su VRM y el resto muñeco; 10 y 40 visitantes; compartir geometría y texturas; tu paseante en tercera persona; libera() suelta la GPU", { timeout: 900000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  fs.mkdirSync(CAPS, { recursive: true });
  const res = {};
  for (const [nombre, q] of [["muneco10", "&presencia=sim&n=10"], ["vrm10", "&presencia=sim&n=10&vrm=1&yo=no"], ["muneco40", "&presencia=sim&n=40"], ["vrm40", "&presencia=sim&n=40&vrm=1&yo=no"], ["vrm40sinComp", "&presencia=sim&n=40&vrm=1&yo=no&vrmcomparte=no"]]) {
    const { p, errores } = await abre(base, q, /vrm=1/.test(q) ? asentado : null);
    res[nombre] = await medir(p); res[nombre].errores = errores;
    await p.screenshot({ path: path.join(CAPS, nombre + ".png") });
    if (nombre === "vrm40") {
      const antes = res[nombre];
      await p.evaluate(() => window.__presencia("libera")); await p.waitForTimeout(800);
      res.libera = await p.evaluate(() => ({ g: window.__g.renderer.info.memory.geometries, t: window.__g.renderer.info.memory.textures, vrm: !!window.__g.scene.getObjectByName("avatares-vrm") }));
      res.libera.antes = { g: antes.geometrias, t: antes.texturas };
    }
    await p.close();
  }
  // tu paseante: en tercera persona, tu avatar (el primero del catálogo); andando, con el paso; en primera persona (V), nada
  const pp = await abre(base, "&presencia=sim&n=10&vrm=1", null);
  await pp.p.evaluate(() => { const o = window.__g.objetivo; window.__g.paseoEn(o.x, -o.z, 0); });
  await pp.p.waitForFunction(() => window.__presencia().vrm.propio, null, { timeout: 120000, polling: 500 }).catch(() => {});
  await pp.p.waitForTimeout(1500);
  res.paseo = await medir(pp.p); await pp.p.screenshot({ path: path.join(CAPS, "paseo.png") });
  await pp.p.evaluate(() => window.__g.paseoTecla("up", true)); await pp.p.waitForTimeout(3000);
  res.paseoAnda = await medir(pp.p); await pp.p.screenshot({ path: path.join(CAPS, "paseoAnda.png") }); await pp.p.evaluate(() => window.__g.paseoTecla("up", false));
  await pp.p.keyboard.press("KeyV"); await pp.p.waitForTimeout(800);
  res.primera = await medir(pp.p); res.paseo.errores = pp.errores; await pp.p.close();
  console.log("MEDIDO avatares " + JSON.stringify(res));
  for (const k in res) if (res[k].errores) assert.deepStrictEqual(res[k].errores, [], k);
  for (const k of ["vrm10", "vrm40", "vrm40sinComp"]) {
    const v = res[k].vrm;
    assert.strictEqual(v.catalogo, 2); assert.strictEqual(v.cupo, 6); assert.strictEqual(v.fallos, 0, k + ": ningún VRM falla");
    assert.ok(v.conVrm >= 1 && v.conVrm <= 6, k + ": entre 1 y 6 con VRM (" + v.conVrm + ")");
    assert.ok(v.instancias <= 6, k + ": nunca más instancias que el cupo (" + v.instancias + ")");
  }
  assert.ok(res.vrm40.texturas < res.vrm40sinComp.texturas || res.vrm40.geometrias < res.vrm40sinComp.geometrias, "compartir debe ahorrar geometrías o texturas de la GPU");
  assert.ok(res.paseo.vrm.propio, "en tercera persona, tu paseante es tu avatar");
  assert.ok(!res.primera.vrm.propio, "en primera persona, nada del cuerpo");
  assert.ok(!res.libera.vrm && res.libera.t <= res.libera.antes.t && res.libera.g < res.libera.antes.g, "libera() suelta los VRM: " + JSON.stringify(res.libera));
});

test("en Chrome: con &vrm=1 y nada en /avatares, todos son el muñeco, sin errores ni three-vrm; sin &vrm=1 (ni nadie con avatar) no se pide el catálogo", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const a = await abre(baseSin, "&presencia=sim&n=10&vrm=1", () => window.__presencia().vrm && window.__presencia().vrm.catalogo === 0);
  const m = await medir(a.p); await a.p.close();
  assert.deepStrictEqual(a.errores, []); assert.strictEqual(m.vrm.catalogo, 0); assert.strictEqual(m.vrm.conVrm + m.vrm.cargando + m.vrm.instancias, 0); assert.strictEqual(m.vrm.libreria, false, "sin catálogo no se baja three-vrm");
  const pedidas = [], p = await nav.newPage(); p.on("request", r => pedidas.push(r.url()));
  await p.goto(base + "?debug&presencia=sim&n=10"); await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 }); await p.waitForTimeout(3000);
  const mb = await medir(p); await p.close();
  assert.strictEqual(mb.vrm.catalogo, -1, "sin &vrm=1 no se pide el catálogo"); assert.ok(!pedidas.some(u => /avatares/.test(u)), pedidas.filter(u => /avatares/.test(u)).join(" "));
});
