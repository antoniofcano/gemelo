"use strict";
// AG-1.13b · los perros, antes 9 o 10 cajas sueltas cada uno (42 llamadas con sombras y rótulos) y ahora InstancedMesh de geometría fusionada: cada caja queda EXACTAMENTE donde
// la dejaba la jerarquía de antes (referencias/25_perros_antes.js, que las conserva sueltas), con la misma semilla, fotograma a fotograma, y las llamadas bajan de 42 a 11.
// En Node con el three de verdad; lo de Chrome (que se vea igual, la textura del pelaje) va por el banco y la VR en Quest sigue sin probar.
const test = require("node:test"), assert = require("node:assert"), path = require("path"), { pathToFileURL } = require("url");
const { RAIZ } = require("./_util");
const F = require("./_fauna_mundo");
const { mundoPerros } = require("./_perros_mundo");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

const cuenta = (raiz) => { let llamadas = 0, tri = 0; (function anda(o) {
  if (o.visible === false) return;
  if (o.isMesh || o.isSprite) { llamadas++; if (o.isMesh && !(o.isInstancedMesh && o.count === 0)) { const g = o.geometry; tri += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } }
  o.children.forEach(anda);
})(raiz); return { llamadas, tri }; };

test("AG-1.13b los perros instanciados dejan cada caja donde la dejaba la jerarquía de antes y las llamadas bajan de 42 a 11", () => {
  const a = mundoPerros(THREE, "pruebas/guardianes/referencias/25_perros_antes.js", 77), b = mundoPerros(THREE, "apps/web/motor/25_perros.js", 77), r = F.semilla(5);
  const V = new THREE.Vector3(), M = new THREE.Matrix4();
  const vert = (geo, i, mat) => V.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(mat).toArray();
  const cerca = (x, y, que) => x.forEach((v, k) => assert.ok(Math.abs(v - y[k]) < 3e-5, que + ": " + x + " vs " + y));
  const gA = a.g.gFauna.children[0], gB = b.g.gFauna.children[0];
  let comparadas = 0, maxA = 0, maxB = 0, trisA = 0, trisB = 0;
  for (let f = 0; f < 900; f++) {
    const dt = 0.008 + r() * 0.04, x = 10 + 40 * Math.sin(f * 0.004), y = 10 + 30 * Math.cos(f * 0.0053);
    for (const m of [a, b]) {
      Object.assign(m.E, { paseando: f % 700 < 650, enQuad: false, enDron: f % 500 > 400 }); m.E.tVida += dt; m.g.pp.x = x; m.g.pp.y = y; m.g.pp.ang = f * 0.01; m.g.camera.position.set(x + 5, 6, -y + 8);
      if (m.E.paseando && (f === 0 || f % 700 === 0)) m.api.llegan();
      m.api.actualiza(dt);
    }
    a.g.scene.updateMatrixWorld(true);
    const ca = cuenta(gA), cb = cuenta(gB); maxA = Math.max(maxA, ca.llamadas); maxB = Math.max(maxB, cb.llamadas); trisA = Math.max(trisA, ca.tri); trisB = Math.max(trisB, cb.tri);
    assert.strictEqual(cb.tri, ca.tri, "mismos triángulos en el fotograma " + f);
    const pa = a.api.perros(), pb = b.api.perros(); let sombras = 0;
    pa.forEach((da, i) => {
      const db = pb[i]; assert.strictEqual(db.malla.visible, da.malla.visible); if (!da.malla.visible) return;
      const ua = da.malla.userData, ub = db.malla.userData, p = ub.piezas;
      const cajas = (nodoA, im, ini, k) => {   // las cajas (mallas) que cuelgan de nodoA contra el bloque de 24 vértices que les toca en la geometría fusionada, en la casilla k
        M.fromArray(im.instanceMatrix.array, k * 16);
        nodoA.children.filter(o => o.isMesh).forEach((me, j) => { for (const iv of [0, 23]) cerca(vert(me.geometry, iv, me.matrixWorld), vert(im.geometry, (ini + j) * 24 + iv, M), da.nombre + " " + im.name + " caja " + (ini + j)); comparadas++; });
      };
      cajas(ua.cuerpo, p[0], 0, 0); cajas(ua.cab, p[1], 0, 0); cajas(ua.cola, p[2], 0, 0); ua.patas.forEach((pv, k) => cajas(pv, p[3], 0, k));
      assert.strictEqual(p[0].geometry.attributes.position.count, 3 * 24); assert.strictEqual(p[1].geometry.attributes.position.count, 7 * 24);
      sombras++;
      const sa = da.malla.children[da.malla.children.length - 1];   // la sombra es el último hijo de la jerarquía anterior
      M.fromArray(gB.children.find(o => o.name === "perros-sombra").instanceMatrix.array, (sombras - 1) * 16);
      cerca(vert(sa.geometry, 0, sa.matrixWorld), vert(sa.geometry, 0, M), "sombra");
    });
    assert.strictEqual(gB.children.find(o => o.name === "perros-sombra").count, sombras, "una casilla de sombra por perro a la vista");
  }
  console.log("llamadas de los perros, los dos a la vista: antes " + maxA + " → ahora " + maxB + " (triángulos " + trisB + "); cajas comparadas " + comparadas);
  assert.ok(comparadas > 2000, "el guion debe sacar a los perros (" + comparadas + ")");
  assert.strictEqual(maxA, 42); assert.strictEqual(maxB, 11);
});
