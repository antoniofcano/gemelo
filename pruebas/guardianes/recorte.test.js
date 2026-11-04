"use strict";
// AG-1.3 (doc/rumbo/MEJORAS-TECNICAS.md): el recorte por el campo de visión (frustumCulled) de apps/web/motor/, en Node y sin navegador, con el three de verdad.
//   · cada objeto al que se le ha encendido el recorte tiene una esfera que CONTIENE lo que dibuja (vértices o instancias), con la exageración 1 y la 3,
//     después de colocarlo y aunque three la hubiera calculado antes de tiempo (Frustum.intersectsObject la calcula UNA vez si vale null: la de una
//     InstancedMesh con count 0 queda vacía para siempre). Es lo que protege de que algo desaparezca al mirar hacia él;
//   · el inventario de los `frustumCulled = false` que quedan, cada uno con su motivo: uno nuevo, o uno de los que ya se recortan que vuelve, falla aquí;
//   · lo que se recorta por visibilidad (sin pasada vacía): las flores y aceitunas fuera del BBCH que pinta el sombreador.
// No mide llamadas ni fps: eso lo hace el banco (escenarios paseo, paseoE, paseoS, paseoO, en Chrome). Ni Quest ni iPhone: no probado.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ, fs } = require("./_util");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

// ---------------------------------------------------------------- utilidades
/** como lo haría three en el primer fotograma: la esfera se calcula si vale null (y ya no se recalcula sola) */
function primerFotograma(o) { new THREE.Frustum().intersectsObject(o); }
/** la esfera del mundo de o (la de la InstancedMesh si la tiene; si no, la de su geometría), sin calcular nada nuevo */
function esferaMundo(o) {
  o.updateWorldMatrix(true, false);
  const s = o.isInstancedMesh ? o.boundingSphere : o.geometry.boundingSphere;
  assert.ok(s, (o.name || o.type) + ": sin esfera");
  return s.clone().applyMatrix4(o.matrixWorld);
}
/** todos los puntos del mundo que dibuja o (cada vértice de cada instancia); escalaY: lo que el sombreador multiplica la y local (uExag) */
function puntosMundo(o, escalaY) {
  o.updateWorldMatrix(true, false);
  const pos = o.geometry.attributes.position, v = new THREE.Vector3(), mi = new THREE.Matrix4(), out = [];
  const n = o.isInstancedMesh ? o.count : 1;
  for (let k = 0; k < n; k++) {
    if (o.isInstancedMesh) o.getMatrixAt(k, mi);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); if (escalaY) v.y *= escalaY;
      if (o.isInstancedMesh) v.applyMatrix4(mi);
      out.push(v.clone().applyMatrix4(o.matrixWorld));
    }
  }
  return out;
}
/** la esfera de o contiene todo lo que dibuja, con margen m (lo que el sombreador desplaza) */
function contiene(o, que, m, escalaY) {
  const s = esferaMundo(o), ps = puntosMundo(o, escalaY), tol = 1e-4 * (1 + s.radius);
  assert.ok(ps.length > 0, que + ": nada que dibujar");
  let peor = -Infinity;
  for (const p of ps) peor = Math.max(peor, p.distanceTo(s.center) + (m || 0) - s.radius);
  assert.ok(peor <= tol, que + ": un punto queda " + peor.toFixed(3) + " m fuera de la esfera (radio " + s.radius.toFixed(2) + ")");
}
const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };   // el de 04d_sombreado_tiles.js
const trozo = (fuente, ini, fin) => { const i = fuente.indexOf(ini), f = fuente.indexOf(fin, i + 1); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return fuente.slice(i, f); };
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// ---------------------------------------------------------------- 14_historia: la capa de una parcela (el sombreador multiplica la y por uExag)
test("14_historia: la capa de la parcela se recorta y su esfera la contiene con uExag 1 y 3 (el sombreador escala la y)", () => {
  const F = lee("apps/web/motor/14_historia.js");
  assert.match(F, /transformed\.y \*= uExag;/, "el sombreador de la capa sigue multiplicando la y por la exageración");
  assert.match(lee("apps/web/plantilla.html"), /id="exag" min="1" max="3"/, "el deslizador de la exageración va de 1 a 3 (lo que cubre la esfera)");
  const T = trozo(F, "  function creaOverlay(k)", "  parcelas.forEach(function (pr, k) {");
  const parcelas = [{ linde: [[-120, -40], [60, -55], [90, 70], [-80, 95], [-120, -40]] }, { linde: [[300, 300], [340, 300], [340, 320], [300, 320], [300, 300]] }];
  const overlays = parcelas.map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); m.frustumCulled = true; return m; });
  const crea = new Function("THREE", "parcelas", "overlays", "suelo", "\"use strict\";\n" + T + "\nreturn creaOverlay;")(THREE, parcelas, overlays, (x, y) => 140 + 0.4 * x + 0.3 * y);
  const sinRecorte = /new THREE\.Mesh\(new THREE\.BufferGeometry\(\), mat\);[^\n]*frustumCulled = false/.test(F);
  assert.ok(!sinRecorte, "la capa de la parcela ya no apaga el recorte");
  parcelas.forEach((p, k) => {
    crea(k);
    for (const e of [1, 3]) contiene(overlays[k], "parcela " + k + " (uExag " + e + ")", 0, e);
  });
});

// ---------------------------------------------------------------- 23_estacion: flores y aceitunas (Points; el sombreador las acerca 1 m a la cámara)
function mundoEstacion(fechas) {
  const matHojaG = new THREE.MeshLambertMaterial(), matHojaP = new THREE.MeshLambertMaterial();
  const g = {
    THREE, $: () => null, parcelas: [], OT: null, NDV: fechas ? { fechas } : null, SN: null, ndviIdx: 0, hash, matHojaG, matHojaP, renderer: { domElement: { height: 600 } },
    SRGB: THREE.SRGBColorSpace, gFollaje: new THREE.Group(), window: {}, setTimeout, clearTimeout, fmtClaveDia: { format: () => "2026-11-04" }, fmtHora: { format: () => "12:00" },
    TM: {}, TiempoPuro: {}, esc: s => s, num1: x => String(x), objetivoMundoBase: () => ({}), aplicaMundo: null, lluvia: null, modo: "gem", Event: function () {}
  };
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/23_estacion.js"), vm.createContext(g), { filename: "23_estacion.js" });
  return g;
}
test("23_estacion: las flores y aceitunas se recortan con su esfera (1 m más por lo que las acerca el sombreador) y la contiene", () => {
  const g = mundoEstacion(null), grupo = new THREE.Group(), pos = [];
  for (let i = 0; i < 400; i++) pos.push(-30 + 0.17 * i, 80 + (i % 9) * 0.6, 20 - 0.11 * i);
  grupo.add(new THREE.Mesh(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)), g.matHojaG));
  grupo.position.set(500, 0, -300);
  g.construyeFrutosLista(grupo);
  const p = grupo.children.find(o => o.isPoints);
  assert.ok(p && p.frustumCulled, "los puntos de los frutos, recortados");
  assert.match(sinComentarios(lee("apps/web/motor/23_estacion.js")), /mv\.z \+= 1\.0;/, "el sombreador las acerca 1 m (lo que suma la esfera)");
  contiene(p, "flores y aceitunas", 1);
});
test("23_estacion: fuera del BBCH que pinta el sombreador (b = BBCH ± 3,5 entre 58 y 91) los frutos no se dibujan; dentro, sí", () => {
  const F = sinComentarios(lee("apps/web/motor/23_estacion.js"));
  // las cifras del sombreador de las que sale el rango: si cambian, esta prueba lo dice
  for (const t of ["float b = uBBCH + (aR - 0.5) * 7.0;", "if (b >= 58.0 && b < 70.5)", "smoothstep(58.0, 62.0, b)", "else if (b >= 70.5 && b < 91.0)", "if (aS < 0.55)"]) assert.ok(F.includes(t), "el sombreador de los frutos: falta «" + t + "»");
  const g = mundoEstacion(["2026-01-15", "2026-03-01", "2026-06-15", "2026-10-20"]);
  // el sombreador, en JS: ¿algún punto (aR en [0, 1), aS cualquiera) tendría tamaño con este BBCH?
  // flores: dens > 0 solo con 58 < b < 70,5 (y aS pequeño); aceitunas: 70,5 ≤ b < 91 (aS < 0,55)
  const pinta = bb => { for (let k = 0; k < 2000; k++) { const b = bb + (k / 2000 - 0.5) * 7; if (b > 58 && b < 91) return true; } return false; };
  for (let bb = 0; bb <= 100; bb += 0.25) {
    if (pinta(bb)) assert.ok(g.frutosVisibles(bb), "BBCH " + bb + ": el sombreador pinta algo y se ocultaría");
  }
  assert.ok(!g.frutosVisibles(0) && !g.frutosVisibles(30) && !g.frutosVisibles(50) && !g.frutosVisibles(97), "en reposo, brotación y crecimiento de brotes no hay pasada");
  // y con la fecha del campo: enero (BBCH 89, aceitunas maduras) y junio (floración-cuajado) se ven; marzo (reposo, ~9) no
  const grupo = new THREE.Group(); grupo.add(new THREE.Mesh(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(48), 3)), g.matHojaG));
  g.construyeFrutosLista(grupo); const matFruto = grupo.children.find(o => o.isPoints).material;
  const vis = i => { g.ndviIdx = i; g.actualizaOlivo(0.016); return matFruto.visible; };
  assert.strictEqual(vis(0), true, "15 de enero: aceitunas");
  assert.strictEqual(vis(1), false, "1 de marzo: reposo, sin pasada");
  assert.strictEqual(vis(2), true, "15 de junio: flores y cuajado");
  assert.strictEqual(vis(3), true, "20 de octubre: envero");
});

// ---------------------------------------------------------------- 02e_entidades y 29_vr: geometría fija (anillo y láminas): la esfera que calcula three vale siempre
test("02e_entidades y 29_vr: el anillo de resaltado y las láminas VR se recortan y su geometría no se reescribe (la esfera de three vale siempre)", () => {
  const E = sinComentarios(lee("apps/web/motor/02e_entidades.js")), V = sinComentarios(lee("apps/web/motor/29_vr.js"));
  assert.match(E, /anillo\.name = "resaltado";/); assert.ok(!/anillo\.frustumCulled = false/.test(E), "el anillo se recorta");
  assert.ok(!/anillo\.geometry\s*=|anillo\.geometry\.(setAttribute|attributes)/.test(E), "la geometría del anillo es fija (solo se escala y se mueve)");
  const L = trozo(V, "function creaLamina(", "function creaDe(");
  assert.match(L, /new THREE\.PlaneGeometry\(pw, ph\)/); assert.ok(!/frustumCulled = false/.test(L), "las láminas se recortan");
  assert.ok(!/\b(panel|ficha|fichaB)\.m\.geometry\s*=|\.m\.geometry\.(setAttribute|attributes)/.test(V), "la geometría de las láminas es fija");
  // y la esfera del plano, en la posición de cualquier lámina, contiene sus esquinas
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.06), new THREE.MeshBasicMaterial()); m.position.set(3, 1.4, -2); m.rotation.set(0, 0.7, 0); primerFotograma(m); contiene(m, "lámina");
  const a = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial()); a.position.set(-40, 120, 33); a.scale.setScalar(2.4); primerFotograma(a); contiene(a, "anillo");
});

