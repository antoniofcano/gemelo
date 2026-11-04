"use strict";
// AG-1.6: BVH (three-mesh-bvh) para los rayos contra mallas del relieve (RayosPuro, apps/web/motor/04b_escena3d.js), en Node y sin navegador:
//   · equivalencia: los mismos impactos (distancia, cara, punto) con y sin BVH en un terreno de 256×256 celdas y en copas, con la matriz de la tesela (exageración),
//     rayos verticales, oblicuos y por los vértices de la malla (las aristas);
//   · no cambia lo que ve la GPU (el índice de la geometría queda intacto) y las mallas pequeñas y las InstancedMesh no llevan árbol;
//   · se libera al soltar la tesela (quita) y es idempotente;
//   · micro-banco del tiempo por rayo antes y después: RELATIVO, en Node (V8 en CPU), no es Chrome ni un Quest.
// Sin las dependencias de apps/web (cd apps/web && npm ci) se SALTA con aviso: el BVH NO se ha comprobado.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, fs, path } = require("./_util");

const WEB = path.join(RAIZ, "apps", "web"), MODS = path.join(WEB, "node_modules");
const falta = ["three", "three-mesh-bvh"].filter(d => !fs.existsSync(path.join(MODS, d, "package.json")));
const SALTO = falta.length ? "faltan dependencias de apps/web (" + falta.join(", ") + "; cd apps/web && npm ci): el BVH NO se ha comprobado" : false;
if (SALTO) console.warn("[AVISO] " + SALTO);

const FUENTE = lee("apps/web/motor/04b_escena3d.js");
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return s.slice(i, f); };
const RP = new Function("\"use strict\";\n" + trozo(FUENTE, "// [puro:inicio]", "// [puro:fin]") + "\nreturn RayosPuro;")();
const imp = m => import(pathToFileURL(m).href);

let THREE, LIB;
test.before(async () => {
  if (SALTO) return;
  THREE = await imp(path.join(MODS, "three", "build", "three.module.js"));   // el mismo three (ESM) que importa three-mesh-bvh: un solo juego de clases
  const p = path.join(MODS, "three-mesh-bvh", "package.json"), pj = JSON.parse(fs.readFileSync(p, "utf8"));
  LIB = await import(pathToFileURL(path.join(MODS, "three-mesh-bvh", "src", "index.js")).href);   // el mismo que empaqueta Vite (campo module/exports)
  assert.ok(pj.peerDependencies.three, "three-mesh-bvh declara su compatibilidad con three");
});

// pseudoaleatorio con semilla fija (mulberry32): las pruebas y el banco son reproducibles
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// un terreno de n×n celdas de 1 m (n² · 2 triángulos), relieve ondulado y con ruido; z hacia el sur como en el motor (y arriba)
function terreno(n, sem) {
  const r = rng(sem), g = new THREE.PlaneGeometry(n, n, n, n); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 8 * Math.sin(x / 23) * Math.cos(z / 31) + 0.6 * r()); }
  g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
const malla = (g, exag) => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); m.position.set(1234.5, 0, -987.25); m.scale.set(1, exag, 1); m.updateMatrixWorld(true); return m; };
const rayos = (n, sem, l) => {
  const r = rng(sem), a = [];
  for (let i = 0; i < n; i++) {
    const o = new THREE.Vector3(1234.5 + (r() - 0.5) * l, 300, -987.25 + (r() - 0.5) * l), d = i % 3 === 0 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3((r() - 0.5) * 0.6, -1, (r() - 0.5) * 0.6).normalize();
    a.push([o, d]);
  }
  return a;
};
function impacta(obj, o, d, primero) { const rc = new THREE.Raycaster(o, d, 0, Infinity); rc.firstHitOnly = !!primero; return rc.intersectObject(obj, true); }
const igual = (a, b, msg) => {
  assert.strictEqual(!!a, !!b, msg + ": uno acierta y el otro no");
  if (!a) return;
  assert.ok(Math.abs(a.distance - b.distance) < 1e-6, msg + ": distancia " + a.distance + " vs " + b.distance);
  if (a.faceIndex !== b.faceIndex) assert.ok(a.distance === b.distance || Math.abs(a.distance - b.distance) < 1e-9, msg + ": cara distinta solo vale en empate exacto (rayo por un vértice o una arista compartida)"); assert.ok(a.point.distanceTo(b.point) < 1e-6, msg + ": punto");
};

test("terreno de 256×256: mismos impactos con y sin BVH (rayos verticales, oblicuos y por los vértices)", { skip: SALTO }, () => {
  const A = new THREE.Group(), B = new THREE.Group(); A.add(malla(terreno(256, 1), 1.5)); B.add(malla(terreno(256, 1), 1.5));
  const r = RP.pon(B, LIB); assert.strictEqual(r.mallas, 1); assert.strictEqual(r.triangulos, 256 * 256 * 2);
  A.updateMatrixWorld(true); B.updateMatrixWorld(true);
  const lista = rayos(150, 7, 250);
  // por los vértices: x, z enteros (la malla va de -128 a 128 en su marco) = por las aristas y esquinas de los triángulos
  for (let i = 0; i < 40; i++) lista.push([new THREE.Vector3(1234.5 + (i % 9) * 13 - 52, 300, -987.25 + Math.floor(i / 9) * 11 - 50), new THREE.Vector3(0, -1, 0)]);
  let aciertos = 0;
  lista.forEach(([o, d], i) => {
    const a = impacta(A, o, d, true)[0], b = impacta(B, o, d, true)[0]; igual(a, b, "rayo " + i); if (a) aciertos++;
    const todos = impacta(A, o, d, false), tb = impacta(B, o, d, false);   // sin firstHitOnly: todos los impactos (el rayo puede cruzar una cresta dos veces)
    assert.strictEqual(todos.length, tb.length, "rayo " + i + ": nº de impactos"); if (todos.length) igual(todos[0], tb[0], "rayo " + i + " (primero de todos)");
  });
  assert.ok(aciertos > lista.length * 0.8, "la prueba da en el terreno (" + aciertos + "/" + lista.length + ")");
  assert.ok(impacta(B, new THREE.Vector3(1e5, 300, 0), new THREE.Vector3(0, -1, 0), true).length === 0, "fuera del terreno, ninguno");
});

test("copas: mallas de ~8000 triángulos (icosferas) con y sin BVH, y las pequeñas se quedan sin árbol", { skip: SALTO }, () => {
  const A = new THREE.Group(), B = new THREE.Group(), r = rng(3), pos = [];
  for (let i = 0; i < 12; i++) pos.push([(r() - 0.5) * 60, 2 + r() * 2, (r() - 0.5) * 60, 1.5 + r() * 1.5]);
  const mk = G => { pos.forEach(p => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(p[3], 20), new THREE.MeshBasicMaterial()); m.position.set(p[0], p[1], p[2]); G.add(m); }); G.updateMatrixWorld(true); };
  mk(A); mk(B);
  const peq = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshBasicMaterial()); B.add(peq);   // 1280 triángulos: bajo el mínimo
  const res = RP.pon(B, LIB); assert.strictEqual(res.mallas, 12); assert.ok(!peq.geometry.boundsTree, "la malla pequeña no lleva árbol");
  assert.ok(res.triangulos >= 12 * 8000, "triángulos cubiertos: " + res.triangulos);
  rayos(400, 9, 60).forEach(([o, d], i) => { o.y = 20; const a = impacta(A, o, d, true)[0], b = impacta(B, o, d, true)[0]; igual(a, b, "copa " + i); });
});

test("no toca lo que ve la GPU: el índice y los atributos quedan idénticos; las InstancedMesh no llevan árbol y no se recorren", { skip: SALTO }, () => {
  const g = terreno(64, 2), idx = Array.from(g.index.array), posA = Array.from(g.attributes.position.array), m = malla(g, 1);
  const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 20), new THREE.MeshBasicMaterial(), 50), G = new THREE.Group(); G.add(m, inst); G.updateMatrixWorld(true);
  const r = RP.pon(G, LIB); assert.strictEqual(r.mallas, 1);
  assert.deepStrictEqual(Array.from(g.index.array), idx, "índice intacto (indirect: true no lo reordena)"); assert.deepStrictEqual(Array.from(g.attributes.position.array), posA);
  assert.ok(!inst.geometry.boundsTree, "la InstancedMesh no lleva árbol (three-mesh-bvh no lo da por instancia)");
  assert.strictEqual(impacta(inst, new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0)).length, 0, "su raycast se apaga: el relieve ya descartaba sus impactos");
  assert.strictEqual(RP.pon(G, LIB).mallas, 0, "idempotente: no reconstruye");
});

test("se libera al soltar la tesela: sin árbol, con el raycast de three y sin dejar marcas; idempotente", { skip: SALTO }, () => {
  const G = new THREE.Group(), m = malla(terreno(64, 4), 1), inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial(), 3); G.add(m, inst);
  const o = new THREE.Vector3(1234.5, 300, -987.25), d = new THREE.Vector3(0, -1, 0);
  const antes = impacta(G, o, d, true)[0];
  RP.pon(G, LIB); assert.strictEqual(RP.cuenta(G), 1); assert.ok(Object.prototype.hasOwnProperty.call(m, "raycast"));
  assert.strictEqual(RP.quita(G), 1); assert.strictEqual(RP.cuenta(G), 0); assert.strictEqual(m.geometry.boundsTree, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(m, "raycast") && !Object.prototype.hasOwnProperty.call(inst, "raycast"), "vuelve al raycast de la clase");
  assert.deepStrictEqual(m.userData, {}); assert.strictEqual(RP.quita(G), 0, "idempotente");
  igual(antes, impacta(G, o, d, true)[0], "tras quitar, el mismo impacto");
});

test("micro-banco en Node del tiempo por rayo: terreno de 256×256 (131 072 triángulos), RELATIVO (no es Chrome ni el Quest)", { skip: SALTO }, () => {
  const A = new THREE.Group(), B = new THREE.Group(); A.add(malla(terreno(256, 1), 1.5)); B.add(malla(terreno(256, 1), 1.5));
  const t0 = performance.now(); RP.pon(B, LIB); const construye = performance.now() - t0;
  A.updateMatrixWorld(true); B.updateMatrixWorld(true);
  const lista = rayos(60, 11, 250), rc = new THREE.Raycaster(); rc.firstHitOnly = true;
  const mide = (obj, rep) => { let n = 0; const t = performance.now(); for (let k = 0; k < rep; k++) for (const [o, d] of lista) { rc.set(o, d); n += rc.intersectObject(obj, true).length; } return { us: (performance.now() - t) * 1000 / (rep * lista.length), n }; };
  mide(B, 3);   // calentar el JIT
  const sin = mide(A, 2), con = mide(B, 100), x = sin.us / con.us;
  const mem = LIB.estimateMemoryInBytes(B.children[0].geometry.boundsTree);
  console.log("[micro-banco Node, relativo] sin BVH " + sin.us.toFixed(1) + " µs/rayo · con BVH " + con.us.toFixed(2) + " µs/rayo · x" + x.toFixed(0) +
    " · construir " + construye.toFixed(0) + " ms (una vez por tesela) · memoria del árbol " + (mem / 1048576).toFixed(2) + " MiB · triángulos " + 256 * 256 * 2);
  assert.ok(x > 5, "el BVH debe ser claramente más rápido en una malla de 131 072 triángulos (x" + x.toFixed(1) + ")");
  assert.ok(mem < 8 * 1048576, "memoria del árbol de una tesela por debajo de 8 MiB: " + mem);
});

test("el motor lo enchufa solo con ?bvh y lo suelta al descargar la tesela", () => {
  assert.ok(/\[\?&\]bvh/.test(FUENTE), "opt-in por ?bvh");
  assert.ok(/addEventListener\("dispose-model", function \(e\) \{ RayosPuro\.quita\(e\.scene\)/.test(FUENTE), "dispose-model libera el árbol");
  assert.ok(/if \(BVH\) RayosPuro\.quita\(tiles\.group\)/.test(FUENTE), "libera() lo suelta");
  assert.ok(/Cola\.cobra\("T", function \(e\) \{ if \(bvhLib\)/.test(FUENTE), "se construye al llegar la tesela, como deuda «T» de la Cola");
  const pk = JSON.parse(fs.readFileSync(path.join(WEB, "package.json"), "utf8")).dependencies;
  assert.ok(/^\d+\.\d+\.\d+$/.test(pk["three-mesh-bvh"]), "three-mesh-bvh con versión fijada exacta: " + pk["three-mesh-bvh"]);
});
