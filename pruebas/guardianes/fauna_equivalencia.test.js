"use strict";
// AG-1.4b · la fauna y el nivel del sol dan EXACTAMENTE lo mismo que antes. En Node, sin navegador:
//  1. nivelEn(ms, salida) de 15_tiempo.js == nivel(ms) de antes (copia en _fauna_mundo.js), bit a bit, con y sin el recuerdo de la última posición del sol.
//  2. 16b_fauna.js de ahora == su copia anterior (referencias/16b_fauna_antes.js), con la misma semilla, fotograma a fotograma: la posición, el giro y la escala de
//     cada ave y cada conejo, su estado, y los búferes de las dos mallas instanciadas de aves (cada byte; los conejos tienen su propia comparación, más abajo), en un día que se hace de noche y una noche que amanece,
//     con el jugador paseando, parado, en quad, con lluvia y con perros que asustan.
// Es una comparación de resultados, no de tiempos: los tiempos están en pruebas/medida_fauna.js (Node, relativo, no Chrome).
const test = require("node:test"), assert = require("node:assert"), vm = require("vm");
const F = require("./_fauna_mundo");

let THREE;
test.before(async () => { THREE = await F.cargaThree(); });

test("nivelEn(ms, salida) da lo mismo que el nivel(ms) de antes, y el recuerdo no se equivoca al repetir ni al cambiar de ms", () => {
  const nuevo = vm.createContext({ Math }), antes = vm.createContext({ Math });
  vm.runInContext("var LAT = 37.73, LON = -4.006;\n" + F.nivelNuevo(), nuevo); vm.runInContext("var LAT = 37.73, LON = -4.006;\n" + F.NIVEL_ANTES, antes);
  const sal = { s: { alt: 0, az: 0 }, d: 0 }, sal2 = { s: { alt: 0, az: 0 }, d: 0 }, r = F.semilla(7);
  const mss = [0, 1, Date.UTC(2026, 5, 21, 12), Date.UTC(2026, 11, 21, 0, 30), NaN];
  for (let i = 0; i < 4000; i++) mss.push(Date.UTC(2026, 0, 1) + Math.floor(r() * 365 * 86400000));
  for (let i = 0; i < 200; i++) mss.push(mss[5 + (i % 3)]);   // repetidos seguidos: aquí actúa el recuerdo
  for (const ms of mss) {
    const a = antes.nivel(ms), b = nuevo.nivelEn(ms, sal), c = nuevo.nivel(ms);
    assert.ok(Object.is(a.d, b.d) && Object.is(a.s.alt, b.s.alt) && Object.is(a.s.az, b.s.az), "nivelEn distinto para ms=" + ms);
    assert.ok(Object.is(a.d, c.d) && Object.is(a.s.alt, c.s.alt) && Object.is(a.s.az, c.s.az), "nivel distinto para ms=" + ms);
    assert.strictEqual(b, sal, "devuelve el objeto de salida que se le dio");
    nuevo.nivelEn(ms, sal2); assert.ok(Object.is(sal2.d, b.d), "dos salidas distintas con el mismo ms");
  }
  assert.notStrictEqual(nuevo.nivel(1), nuevo.nivel(1), "nivel(ms) sigue devolviendo un objeto nuevo cada vez (quien lo guarda no se pisa)");
});

/** lo observable de la fauna en este instante, plano: lo que debe ser igual en las dos versiones */
function foto(m) {
  const o = [], v3 = (p) => o.push(p.x, p.y, p.z);
  for (const a of m.api.aves()) { o.push(a.visible, a.userData.ang, a.userData.est, a.userData.t); v3(a.position); o.push(a.rotation.x, a.rotation.y, a.rotation.z); v3(a.scale); o.push(...a.matrix.elements); }
  for (const c of m.api.conejos()) {
    const u = c.userData; o.push(c.visible, u.est, u.t, u.x, u.y, u.dir, u.fase, u.salta, c.rotation.x, c.rotation.y, u.cab.position.y, u.cab.rotation.x, u.orejas[0].rotation.x, u.orejas[1].rotation.x); v3(c.position);
  }
  const ms = m.mallas().filter(im => /^aves/.test(im.name)).map(im => ({ n: im.name, count: im.count, visible: im.visible, buf: Buffer.from(im.instanceMatrix.array.buffer.slice(0)).toString("base64") }));
  return { o, ms };
}

const GUION = (f) => ({
  paseando: f % 700 < 540, enQuad: f % 500 > 300, lluvia: f % 900 > 600 ? 2.5 : 0, viento: 1 + (f % 400) / 80,
  emite: f === 0 ? "paseo:entra" : (f % 700 === 540 ? "paseo:sale" : (f % 700 === 0 ? "paseo:entra" : undefined))
});

for (const [nombre, ini] of [["de la tarde a la noche", Date.UTC(2026, 5, 21, 15, 0)], ["de la noche al amanecer", Date.UTC(2026, 5, 21, 2, 30)], ["en invierno, con el sol bajo", Date.UTC(2026, 11, 21, 14, 0)]]) {
  test("16b_fauna.js == su copia anterior, fotograma a fotograma, " + nombre, () => {
    const copas = F.disenoOlivos(500, 11), dtR = F.semilla(99), sem = 1234;
    const a = F.construye(THREE, "pruebas/guardianes/referencias/16b_fauna_antes.js", copas, sem), b = F.construye(THREE, "apps/web/motor/16b_fauna.js", copas, sem);
    a.g.cur.ms = b.g.cur.ms = ini;
    let huyo = 0, volaron = 0, cerrado = 0;
    for (let f = 0; f < 1500; f++) {
      const dt = 0.008 + dtR() * 0.05, paso = 20000;
      a.fotograma(f, dt, paso, GUION); b.fotograma(f, dt, paso, GUION);
      const fa = foto(a), fb = foto(b);
      assert.deepStrictEqual(fb, fa, "fotograma " + f + ": la fauna de ahora difiere de la de antes");
      if (a.api.conejos().some(c => c.userData.est === "huye")) huyo++;
      if (a.api.aves().some(x => x.userData.est === "vuela")) volaron++;
      if (a.mallas()[0].count === 0) cerrado++;
    }
    assert.ok(huyo > 20, "el guion debe hacer huir a algún conejo (huyó en " + huyo + " fotogramas)");
    assert.ok(volaron > 20, "y espantar a alguna ave posada (" + volaron + ")");
    assert.ok(cerrado > 100, "y dejar la bandada en tierra una parte del tiempo (" + cerrado + ")");
  });
}

test("el recuerdo de olivos de cerca da lo mismo que recorrer todos aunque el conejo cruce el corro de olivos pegados", () => {
  const copas = F.disenoOlivos(300, 5);
  for (let i = 0; i < 18; i++) for (let j = 0; j < 18; j++) copas.push({ x: 33 + i * 0.9 + (j % 2) * 0.3, y: -37 + j * 0.9, h: 4, oliv: true });   // una cuadrícula de olivos a 0,9 m: los empujones se encadenan
  const a = F.construye(THREE, "pruebas/guardianes/referencias/16b_fauna_antes.js", copas, 3), b = F.construye(THREE, "apps/web/motor/16b_fauna.js", copas, 3);
  for (const m of [a, b]) { m.Bus.emite("paseo:entra"); m.api.conejos().forEach((c, i) => { const u = c.userData; u.est = "huye"; u.t = 1e9; u.x = 36 + i * 2.1; u.y = -34 + i * 1.7; u.dir = i * 1.1; c.visible = true; }); m.g.pp.x = 40; m.g.pp.y = -30; }
  const r = F.semilla(21), enGrid = copas.slice(copas.length - 324);
  for (let f = 0; f < 1500; f++) {
    if (f % 5 === 0) { const i = Math.floor(r() * 6), t = enGrid[Math.floor(r() * enGrid.length)], dx = (r() - 0.5) * 0.4, dy = (r() - 0.5) * 0.4;   // el conejo cae casi encima de un olivo: el empujón es grande y encadena
      for (const m of [a, b]) { const u = m.api.conejos()[i].userData; u.x = t.x + dx; u.y = t.y + dy; u.est = "huye"; } }
    for (const m of [a, b]) { m.E.tVida += 0.003; m.g.pp.x = 40; m.g.pp.y = -30; m.g.cur.ms += 1000; m.pon(m.E.paseando, m.E.enQuad, m.E.tVida); m.api.actualiza(0.003); }
    assert.deepStrictEqual(foto(b), foto(a), "fotograma " + f);
  }
});

// AG-1.13 · los conejos, antes 6 mallas sueltas por conejo (36 llamadas) y ahora 4 mallas instanciadas: cada pieza queda EXACTAMENTE donde la dejaba la jerarquía de antes.
// Se compara un vértice (el primero y el último de la pieza) pasado por la matriz del mundo de la malla vieja con el mismo vértice de la geometría nueva pasado por la matriz de su casilla.
test("AG-1.13 los conejos instanciados dejan cada pieza donde la jerarquía de antes (cuerpo, cola, cabeza, orejas y sombra)", () => {
  const copas = F.disenoOlivos(500, 11), dtR = F.semilla(99);
  const a = F.construye(THREE, "pruebas/guardianes/referencias/16b_fauna_antes.js", copas, 1234), b = F.construye(THREE, "apps/web/motor/16b_fauna.js", copas, 1234);
  const por = nom => b.mallas().find(im => im.name === nom), V = new THREE.Vector3(), W = new THREE.Vector3(), M = new THREE.Matrix4();
  const vert = (geo, i, mat) => V.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(mat).toArray();
  const cerca = (x, y, que) => x.forEach((v, k) => assert.ok(Math.abs(v - y[k]) < 2e-5, que + ": " + x + " vs " + y));
  let comparados = 0, maxVis = 0;
  a.g.cur.ms = b.g.cur.ms = Date.UTC(2026, 5, 21, 15, 0);
  for (let f = 0; f < 1200; f++) {
    const dt = 0.008 + dtR() * 0.05;
    a.fotograma(f, dt, 20000, GUION); b.fotograma(f, dt, 20000, GUION);
    const viejos = a.api.conejos(), nuevos = b.api.conejos(), vis = viejos.filter(c => c.visible), nvis = nuevos.filter(c => c.visible).length;
    assert.strictEqual(nvis, vis.length, "mismos conejos visibles");
    maxVis = Math.max(maxVis, nvis);
    for (const nom of ["conejos", "conejos-cabeza", "conejos-sombra"]) assert.strictEqual(por(nom).count, nvis, nom); assert.strictEqual(por("conejos-orejas").count, nvis * 2);
    for (const nom of ["conejos", "conejos-cabeza", "conejos-orejas", "conejos-sombra"]) assert.strictEqual(por(nom).visible, nvis > 0, nom + " vacía no se dibuja");
    vis.forEach((c, n) => {
      c.updateMatrixWorld(true);
      const [cuerpo, cabeza, cola, o0, o1, sombra] = c.children, gc = por("conejos").geometry, nvC = cuerpo.geometry.attributes.position.count;
      const pieza = (nom, k, vieja, geoN, iN) => { M.fromArray(por(nom).instanceMatrix.array, k * 16); for (const [iv, ivn] of [[0, iN], [vieja.geometry.attributes.position.count - 1, iN + vieja.geometry.attributes.position.count - 1]]) cerca(vert(vieja.geometry, iv, vieja.matrixWorld), vert(geoN, ivn, M), nom); comparados++; };
      pieza("conejos", n, cuerpo, gc, 0); pieza("conejos", n, cola, gc, nvC);
      pieza("conejos-cabeza", n, cabeza, por("conejos-cabeza").geometry, 0);
      pieza("conejos-orejas", n * 2, o0, por("conejos-orejas").geometry, 0); pieza("conejos-orejas", n * 2 + 1, o1, por("conejos-orejas").geometry, 0);
      pieza("conejos-sombra", n, sombra, por("conejos-sombra").geometry, 0);
    });
  }
  assert.ok(maxVis >= 4 && comparados > 2000, "el guion debe sacar conejos (" + maxVis + " a la vez, " + comparados + " piezas comparadas)");
});

// AG-1.13 · llamadas de dibujo de la fauna por fotograma, antes → después, con todo a la vista (paseando, de día): lo que se cuenta es lo que three enviaría (mallas visibles
// y, de las instanciadas, solo las que tienen casillas).
test("AG-1.13 las llamadas de dibujo de la fauna bajan de 38 a 6 con los mismos triángulos", () => {
  const cuenta = (m) => { let llamadas = 0, tri = 0; (function anda(o) {
    if (o.visible === false) return;
    if (o.isMesh) { if (!(o.isInstancedMesh && o.count === 0)) { llamadas++; const g = o.geometry, k = (g.index ? g.index.count : g.attributes.position.count) / 3; tri += k * (o.isInstancedMesh ? o.count : 1); } }
    o.children.forEach(anda);
  })(m.gFauna); return { llamadas, tri }; };
  const copas = F.disenoOlivos(500, 11), a = F.construye(THREE, "pruebas/guardianes/referencias/16b_fauna_antes.js", copas, 1234), b = F.construye(THREE, "apps/web/motor/16b_fauna.js", copas, 1234);
  let maxA = { llamadas: 0 }, maxB = { llamadas: 0 };
  for (let f = 0; f < 40; f++) {
    for (const m of [a, b]) m.fotograma(f, 0.03, 0, () => ({ paseando: true, emite: f === 0 ? "paseo:entra" : undefined }));
    const ca = cuenta(a), cb = cuenta(b); assert.strictEqual(cb.tri, ca.tri, "mismos triángulos en el fotograma " + f);
    if (ca.llamadas > maxA.llamadas) maxA = ca; if (cb.llamadas > maxB.llamadas) maxB = cb;
  }
  console.log("llamadas de la fauna, todo a la vista: antes " + maxA.llamadas + " → ahora " + maxB.llamadas + " (triángulos " + maxB.tri + ")");
  assert.strictEqual(maxA.llamadas, 38); assert.strictEqual(maxB.llamadas, 6);
});
