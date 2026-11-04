"use strict";
// EV2-A2 (doc/sistema/VIABILIDAD-INTERACCION.md §A.5, paso 3): el panel VR que nace delante y se queda en el mundo, tras ?ui=capas (apps/web/motor/29_vr.js).
// En Node y sin navegador: la decisión pura (VrFichaPuro.queda: nace, se queda o espera al fotograma siguiente tras un salto), el giro en torno a la
// cabeza (el mismo que el del rig en un giro por saltos) y, leyendo el código, que sin la bandera el panel sigue a la cabeza como siempre (vrSigue).
// La comprobación con el WebXR simulado está en pruebas/prueba_vr_capas.js (escrita, sin ejecutar). Nada de esto está probado en unas Quest.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const VR = lee("apps/web/motor/29_vr.js");
function trozo(fuente, ini, fin) { const i = fuente.indexOf(ini), f = fuente.indexOf(fin); assert.ok(i >= 0 && f > i, ini); return fuente.slice(i, f); }
const VF = new Function("\"use strict\";\n" + trozo(VR, "// [puro:fichas:inicio]", "// [puro:fichas:fin]") + "\nreturn VrFichaPuro;")();

test("queda: nace al abrirse, espera un fotograma tras un salto, nace si te alejaste más de 2,5 m y ya estás quieto; si no, se queda", () => {
  assert.strictEqual(VF.ALCANCE, 2.5);
  assert.strictEqual(VF.queda({ ini: false, salto: false, d: 0, quieto: true }), "nace", "recién abierto (Y)");
  assert.strictEqual(VF.queda({ ini: true, salto: true, d: 1, quieto: true }), "espera", "teletransporte: la cabeza del mundo aún es la de antes");
  assert.strictEqual(VF.queda({ ini: false, salto: true, d: 1, quieto: true }), "espera");
  assert.strictEqual(VF.queda({ ini: true, salto: false, d: 1.1, quieto: true }), "queda", "a ~1 m: quieto en el mundo");
  assert.strictEqual(VF.queda({ ini: true, salto: false, d: 2.4, quieto: true }), "queda", "dentro del alcance del rayo");
  assert.strictEqual(VF.queda({ ini: true, salto: false, d: 6, quieto: false }), "queda", "mientras andas no se mueve");
  assert.strictEqual(VF.queda({ ini: true, salto: false, d: 6, quieto: true }), "nace", "lejos y quieto: vuelve delante");
});

test("gira: el panel gira en torno a la cabeza igual que el rig en un giro por saltos (applyAxisAngle en Y)", () => {
  const h = { x: 10, z: -5 }, p = { x: 10, z: -6 };   // panel 1 m delante (−z)
  const ay = (x, z, a) => ({ x: x * Math.cos(a) + z * Math.sin(a), z: -x * Math.sin(a) + z * Math.cos(a) });   // three: Vector3.applyAxisAngle((0,1,0), a)
  for (const a of [Math.PI / 6, -Math.PI / 6, Math.PI / 2, 1]) {
    const g = VF.gira(p.x, p.z, h.x, h.z, a), r = ay(p.x - h.x, p.z - h.z, a);
    assert.ok(Math.abs(g.x - h.x - r.x) < 1e-12 && Math.abs(g.z - h.z - r.z) < 1e-12, "a = " + a);
    assert.ok(Math.abs(Math.hypot(g.x - h.x, g.z - h.z) - 1) < 1e-12, "a la misma distancia");
  }
});

test("en el código: la bandera es ?ui=capas; sin ella el panel sigue a la cabeza (vrSigue); el giro por saltos gira las láminas con y sin ella (VR-L1)", () => {
  assert.match(VR, /var VR_CAPAS = ComponentesPuro\.valorUrl\([^)]*"ui", "capas"\) === true;/);
  assert.match(VR, /if \(VR_CAPAS\) vrQueda\(panel, vrMed\.panel\.dist, vrMed\.panel\.bajo, !mueve\); else vrSigue\(panel, dt, vrMed\.panel\.dist, vrMed\.panel\.bajo\);/);
  assert.match(VR, /\[panel, ficha, fichaB\]\.forEach\(function \(l\) \{ if \(!l\.ini \|\| !l\.m\.visible\) return; var pg = VrFichaPuro\.gira\(/, "VR-L1: el giro por saltos gira las tres láminas (antes, solo el panel con la bandera: sin ella quedaba 30° de lado)");
  assert.match(VR, /if \(VR_CAPAS\) Laminas\.apunta\(rr\);/, "el rayo de más, solo con la bandera");
  // VRX.salto solo lo lee vrQueda (con la bandera): sin ella es un campo que nadie mira
  const lee_ = [...VR.matchAll(/VRX\.salto(?!\s*=)/g)].length; assert.strictEqual(lee_, 1, "VRX.salto se lee en un solo sitio (vrQueda)");
});
