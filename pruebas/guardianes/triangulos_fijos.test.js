"use strict";
// AG-1.12: triángulos por instancia de los dos grupos fijos que más pesaban en cada vista de Hituelo (marcas y árboles del paisaje), en Node, con el three de verdad.
//   · marcas (08b): anillo de 8 lados = 16 triángulos (antes 20 lados = 40); ≈6.000 marcas: 96.000 (antes 240.000);
//   · árbol del paisaje (18): tronco de 5 lados (20) + 3 masas de icosaedro de detalle 0 (3 × 20) = 80 (antes 28 + 3 × 80 = 268); ≈770 árboles: 61.600 (antes 206.360).
// Y que el aspecto básico se conserva: radios del anillo y caja de las masas de copa (sus puntas llegan a ±1 como las del detalle 1). Ni Quest ni iPhone: no probado.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");
const { conFabrica } = require("./_materiales");   // Materiales e InfoDibujo (02h/02i, F1) en el contexto del módulo

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const tri = o => o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;

function mundoPaisaje() {
  const g = {
    THREE, D: { paisaje: { edificios: [], tendido: { linea: [], postes: [], derivaciones: [] }, arroyo: { ejes: [] },
      arboles: [{ x: 30, y: -30, h: 8, r: 3, tipo: "encina" }, { x: -60, y: 70, h: 3, r: 2, tipo: "arbusto" }] } },
    $: () => ({ checked: true, addEventListener() {} }), ESC_R8: 1, suelo: () => 80, desp: () => 0, copas: [], scene: new THREE.Scene(), SRGB: THREE.SRGBColorSpace,
    sol: {}, exag: 1, hash, gSombras: new THREE.Group(), tronco: null, matSombra: new THREE.MeshBasicMaterial({ transparent: true }),
    geoSombra: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pon() {}, lista: [], lluvia: null, cur: { ms: 0, nub: 0, lluvia: 0, dir: 0, viento: 0 },
    tMundo: 0, nivel: () => ({ s: { alt: 0.8, az: 0.4 }, d: 1 }), esfera: null, EST: { activa: false }
  };
  g.scene.add(g.gSombras);
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/18_paisaje.js"), vm.createContext(conFabrica(g)), { filename: "18_paisaje.js" });
  return g;
}

test("18_paisaje (AG-1.12): 80 triángulos por árbol y la misma caja de copa que el icosaedro de detalle 1, con normales suaves", () => {
  const gP = mundoPaisaje().scene.getObjectByName("paisaje"), inst = [];
  gP.traverse(o => { if (o.isInstancedMesh) inst.push(o); });
  const tronco = inst.find(o => o.geometry.type === "CylinderGeometry"), blobs = inst.filter(o => o.geometry.type === "IcosahedronGeometry");
  assert.strictEqual(tri(tronco), 20); assert.strictEqual(blobs.length, 3); blobs.forEach(b => assert.strictEqual(tri(b), 20));
  const porArbol = tri(tronco) + blobs.reduce((s, b) => s + tri(b), 0);
  assert.strictEqual(porArbol, 80);
  assert.strictEqual(porArbol * 770, 61600, "≈770 árboles de Hituelo (antes 268 por árbol = 206.360)");
  const ref = new THREE.IcosahedronGeometry(1, 1); ref.computeBoundingBox();
  const bb = blobs[0].geometry; bb.computeBoundingBox();
  for (const e of ["x", "y", "z"]) {
    assert.ok(Math.abs(bb.boundingBox.max[e] - ref.boundingBox.max[e]) < 0.01, "caja máx " + e);
    assert.ok(Math.abs(bb.boundingBox.min[e] - ref.boundingBox.min[e]) < 0.01, "caja mín " + e);
  }
  const p = bb.attributes.position, n = bb.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); w.fromBufferAttribute(n, i); assert.ok(v.distanceTo(w) < 1e-4, "normal radial"); }
  // el tronco conserva sus radios 0,16-0,26 (los vértices del cilindro están en ellos)
  const t = tronco.geometry.attributes.position; let rmax = 0; for (let i = 0; i < t.count; i++) rmax = Math.max(rmax, Math.hypot(t.getX(i), t.getZ(i)));
  assert.ok(Math.abs(rmax - 0.26) < 1e-6);
});

test("08b_marcadores_lidar (AG-1.12): el anillo de las marcas es de 8 lados (16 triángulos, antes 40) y conserva sus radios y su caja", () => {
  assert.ok(/new THREE\.RingGeometry\(0\.55, 0\.95, 8\)/.test(lee("apps/web/motor/08b_marcadores_lidar.js")), "el motor usa ese anillo");
  const a = new THREE.RingGeometry(0.55, 0.95, 8).rotateX(-Math.PI / 2), vieja = new THREE.RingGeometry(0.55, 0.95, 20).rotateX(-Math.PI / 2);
  assert.strictEqual(tri({ geometry: a }), 16); assert.strictEqual(tri({ geometry: vieja }), 40);
  a.computeBoundingBox(); vieja.computeBoundingBox();
  for (const e of ["x", "z"]) {
    assert.ok(Math.abs(a.boundingBox.max[e] - 0.95) < 1e-6 && Math.abs(a.boundingBox.min[e] + 0.95) < 1e-6, "caja " + e);
    assert.ok(Math.abs(a.boundingBox.max[e] - vieja.boundingBox.max[e]) < 1e-6);
  }
  assert.strictEqual(16 * 6000, 96000, "≈6.000 marcas de Hituelo (antes 240.000)");
});
