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
const { conFabrica } = require("./_materiales");   // Materiales e InfoDibujo (02h/02i, F1) en el contexto del módulo

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

// ---------------------------------------------------------------- 18_paisaje: tendido, árboles que no son olivos, cauces y sombras
const PAISAJE = {
  edificios: [{ x: 10, y: 20, largo: 12, ancho: 8, hAlero: 3, hCumbrera: 5, ang: 0.3, color: [200, 180, 160] }],
  tendido: { linea: [[-100, -50, 95], [0, 0, 112], [120, 60, 131]], postes: [{ x: -100, y: -50, zBase: 80, zAlto: 92 }],
    derivaciones: [{ postes: [{ x: 20, y: 30, zBase: 88, zAlto: 96 }], linea: [[0, 0, 112], [20, 30, 98]] }] },
  arroyo: { ejes: [[[-50, -80, 0, 3], [-20, -60, 0, 4], [10, -40, 0, 3], [40, -10, 0, 2]], [[200, 200, 0, 2], [210, 230, 0, 2], [205, 260, 0, 3]]] },
  arboles: [{ x: 30, y: -30, h: 8, r: 3, tipo: "encina" }, { x: -60, y: 70, h: 3, r: 2, tipo: "arbusto" }, { x: 150, y: -120, h: 10, r: 4, tipo: "frutal" }]
};
function mundoPaisaje(ejesExtra) {
  const sol = { alt: 0.8, az: 0.4 };
  const g = {
    THREE, D: { paisaje: JSON.parse(JSON.stringify(PAISAJE)) }, $: () => ({ checked: true, addEventListener() {} }), ESC_R8: 1,
    suelo: (x, y) => 80 + 0.2 * x + 0.1 * y, desp: () => 0, copas: [], scene: new THREE.Scene(), SRGB: THREE.SRGBColorSpace, sol: {}, exag: 1, hash,
    gSombras: new THREE.Group(), tronco: null, matSombra: new THREE.MeshBasicMaterial({ transparent: true }), geoSombra: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    pon() {}, lista: [], lluvia: null, cur: { ms: 0, nub: 0, lluvia: 0, dir: 0, viento: 0 }, tMundo: 0, nivel: () => ({ s: { alt: sol.alt, az: sol.az }, d: 1 }), esfera: null, EST: { activa: false }
  };
  g.scene.add(g.gSombras);
  if (ejesExtra) g.D.paisaje.arroyo.ejes.push(...ejesExtra);
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/18_paisaje.js"), vm.createContext(conFabrica(g)), { filename: "18_paisaje.js" });
  return { g, sol };
}
const recortados = raiz => { const l = []; raiz.traverse(o => { if ((o.isMesh || o.isLine || o.isPoints) && o.frustumCulled) l.push(o); }); return l; };

test("18_paisaje: cables, árboles que no son olivos, cauces y sombras se recortan y su esfera los contiene tras colocaPaisaje y sombrasSol, con la exageración 1 y la 3", () => {
  const { g, sol } = mundoPaisaje(), gP = g.scene.getObjectByName("paisaje");
  assert.ok(gP, "el grupo del paisaje");
  // el primer fotograma llega antes de colocar nada: three calcula ya las esferas (vértices a cero, instancias en el origen)
  recortados(gP).forEach(primerFotograma);
  assert.strictEqual(recortados(gP).filter(o => o.isInstancedMesh).length, 4, "el tronco y las tres masas de copa, recortados");
  assert.strictEqual(recortados(gP).filter(o => o.isLine).length, 2, "el cable principal y el de la derivación, recortados");
  assert.strictEqual(recortados(gP).filter(o => o.material && o.material.isShaderMaterial).length, 2, "los dos cauces, recortados");
  for (const e of [1, 3]) {
    g.exag = e; g.colocaPaisaje();
    const sombra = g.gSombras.children.find(o => o.isInstancedMesh);
    assert.ok(sombra && sombra.frustumCulled, "las sombras de los árboles y edificios, recortadas");
    if (e === 1) primerFotograma(sombra);
    recortados(gP).concat([sombra]).forEach(o => contiene(o, (o.name || o.type) + " (exag " + e + ")"));
    // el sol se mueve: las sombras se recolocan (más largas y hacia otro lado) y la esfera las sigue
    sol.alt = 0.25; sol.az = 2.1; g.sombrasSol(false);
    contiene(sombra, "sombras con el sol bajo (exag " + e + ")");
    sol.alt = 0.8; sol.az = 0.4;
  }
});

test("18_paisaje: un cauce sin anchura (puntos [x, y], como el del fixture) no da una esfera NaN ni el error de three: no se recorta, como antes", () => {
  const errores = [], antes = console.error; console.error = (...a) => errores.push(a.join(" "));
  try {
    const { g } = mundoPaisaje([[[0, 0], [10, 10], [20, 5]]]);   // el mundo de siempre, con un tercer cauce sin anchura
    g.colocaPaisaje();
    const cauces = []; g.scene.getObjectByName("paisaje").traverse(o => { if (o.material && o.material.isShaderMaterial && o.geometry.attributes.aV) cauces.push(o); });
    const sinAncho = cauces.filter(o => !Number.isFinite(o.geometry.attributes.position.array[0]));
    assert.ok(sinAncho.length >= 1, "el cauce sin anchura existe y tiene vértices no finitos");
    for (const o of sinAncho) assert.strictEqual(o.geometry.boundingSphere.radius, Infinity, "su esfera es infinita: nunca se recorta");
    for (const o of cauces.filter(c => !sinAncho.includes(c))) assert.ok(Number.isFinite(o.geometry.boundingSphere.radius), "los cauces con anchura siguen con su esfera ajustada");
    assert.deepStrictEqual(errores, [], "three no emite 'Computed radius is NaN'");
  } finally { console.error = antes; }
});

// ---------------------------------------------------------------- 39_oficina_mundo: las balizas oficiales (columna y bandera instanciadas)
function balizasOficiales() {
  const F = lee("apps/web/motor/39_oficina_mundo.js"), T = trozo(F, "    function montaGrafica()", "    function refresca()");
  const f = new Function("THREE", "scene", "suelo", "OP", "ALTO", "COLOR", "CLARO",
    "\"use strict\";\nvar gB = null, mCol = null, mBan = null, geos = [], mats = [], m4 = null, v1 = null, v2 = null, q0 = null, vS = null, w0 = null, balizas = [], exag = 1;\n" + T +
    "\nreturn { coloca: coloca, monta: montaGrafica, pon: function (b, e) { balizas = b; exag = e; }, mallas: function () { return [mCol, mBan]; } };");
  return f(THREE, new THREE.Scene(), (x, y) => 60 + 0.3 * x - 0.2 * y, { BALIZAS_MAX: 20 }, 18, 0xffcc00, 0xffffff);
}
test("39_oficina_mundo: las balizas oficiales se recortan y su esfera las contiene tras coloca(), aunque three la calculara con 0 instancias", () => {
  const B = balizasOficiales();
  B.monta(); const [col, ban] = B.mallas();
  assert.ok(col.frustumCulled && ban.frustumCulled, "columna y bandera, recortadas");
  primerFotograma(col); primerFotograma(ban);   // count 0: la esfera de three queda vacía
  for (const e of [1, 3]) for (const n of [1, 7, 20]) {
    B.pon(Array.from({ length: n }, (_, i) => ({ x: -150 + 37 * i, y: 90 - 23 * (i % 5) })), e); B.coloca();
    contiene(col, "columnas (" + n + ", exag " + e + ")"); contiene(ban, "banderas (" + n + ", exag " + e + ")");
  }
});

// ---------------------------------------------------------------- 15_tiempo: las barreras de luz de las lindes (nacen con los vértices a cero; el sombreador no los mueve)
function barreras() {
  const F = lee("apps/web/motor/15_tiempo.js"), T = trozo(F, "  function creaBarrera(pr)", "  function pintaFondoTiempo()");
  const f = new Function("THREE", "suelo", "matBarrera", "gLinde",
    "\"use strict\";\nvar BARRERA_ALTO = 5.5, BARRERAS = [], exag = 1;\n" + T +
    "\nreturn { crea: creaBarrera, coloca: colocaBarrera, pon: function (e) { exag = e; }, mallas: function () { return gLinde.children; }, n: function () { return BARRERAS.length; } };");
  return f(THREE, (x, y) => 60 + 0.3 * x - 0.2 * y, new THREE.MeshBasicMaterial(), new THREE.Group());
}
test("15_tiempo: la barrera de luz de cada linde se recorta y su esfera la contiene tras colocaBarrera, aunque three la calculara con los vértices a cero", () => {
  const B = barreras();
  B.crea({ linde: [[-120, -80], [140, -60], [150, 110], [-90, 130]] });
  B.crea({ linde: [[300, 300], [380, 310], [360, 400]] });
  const ms = B.mallas(); assert.strictEqual(ms.length, 2);
  for (const m of ms) assert.strictEqual(m.frustumCulled, true, "la barrera se recorta");
  ms.forEach(primerFotograma);   // el primer fotograma ANTES de colocar: la esfera de three sale de los ceros
  for (const e of [1, 3, 1.5]) {
    B.pon(e); for (let k = 0; k < B.n(); k++) B.coloca(k);
    ms.forEach((m, k) => contiene(m, "barrera " + k + " (exag " + e + ")"));
  }
  // y con el relieve movido (la exageración sube y luego baja): la esfera sigue a los vértices, no se queda con la vieja
  B.pon(3); B.coloca(0); B.pon(1); B.coloca(0);
  contiene(ms[0], "barrera 0 tras volver a exag 1");
});
test("15_tiempo: las estrellas no pasan por el dibujo de día (visible = opacity > 0) y siguen a la cámara", () => {
  const F = sinComentarios(lee("apps/web/motor/15_tiempo.js"));
  assert.match(F, /estrellas\.visible\s*=\s*estrellas\.material\.opacity\s*>\s*0/, "estrellas.visible depende de su opacidad");
  assert.match(F, /estrellas\.position\.copy\(camera\.position\)/, "las estrellas siguen a la cámara");
});

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
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/23_estacion.js"), vm.createContext(conFabrica(g)), { filename: "23_estacion.js" });
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

// ---------------------------------------------------------------- 08b_marcadores_lidar: las líneas de desfase (se reescriben con cada «mundo:aplica»)
test("08b_marcadores_lidar: las líneas de desfase se recortan y su esfera las contiene tras coloca(), aunque three la calculara antes o con otra exageración", () => {
  const F = lee("apps/web/motor/08b_marcadores_lidar.js"), T = trozo(F, "    var tmpMarc = new THREE.Object3D();", "    function ponCapas()");
  const cIn = [], copas = [], marc = [];
  for (let i = 0; i < 12; i++) { copas.push({ x: -100 + 19 * i, y: 80 - 13 * i, h: 4 }); cIn.push(copas[i]); marc.push({ x: -95 + 19 * i, y: 78 - 13 * i, par: i % 4 ? i : -1 }); }
  const mCopas = { setMatrixAt() {}, instanceMatrix: {} }, mMarc = { setMatrixAt() {}, instanceMatrix: {} };
  const desfGeo = new THREE.BufferGeometry(), linea = new THREE.LineSegments(desfGeo, new THREE.LineBasicMaterial());
  const f = new Function("THREE", "cIn", "copas", "marc", "suelo", "mCopas", "mMarc", "desfGeo",
    "\"use strict\";\nvar exag = 1;\n" + T + "\nreturn { coloca: coloca, pon: function (e) { exag = e; } };");
  const M = f(THREE, cIn, copas, marc, (x, y) => 60 + 0.3 * x - 0.2 * y, mCopas, mMarc, desfGeo);
  assert.strictEqual(linea.frustumCulled, true, "las líneas de desfase se recortan");
  primerFotograma(linea);   // antes de colocar: la geometría está vacía
  for (const e of [1, 3, 1.5]) { M.pon(e); M.coloca(); contiene(linea, "desfase (exag " + e + ")"); }
  M.pon(3); M.coloca(); primerFotograma(linea); M.pon(1); M.coloca(); contiene(linea, "desfase tras volver a exag 1");
});

// ---------------------------------------------------------------- 38_presencia_compartida (AG-1.3b): los avatares instanciados se recortan con una esfera rehecha cada fotograma
function esferaInstDe() {
  const F = lee("apps/web/motor/38_presencia_compartida.js"), T = trozo(F, "    var esS = null, esM = null;", "    // las cajas y ruedas de a según");
  return new Function("THREE", "\"use strict\";\n" + T + "\nreturn esferaInst;")(THREE);
}
/** los vértices en el mundo de las instancias vivas (no a escala 0): lo que de verdad se dibuja */
function puntosVivos(im) {
  im.updateWorldMatrix(true, false);
  const pos = im.geometry.attributes.position, v = new THREE.Vector3(), mi = new THREE.Matrix4(), out = [];
  for (let k = 0; k < im.count; k++) {
    im.getMatrixAt(k, mi); if (!(mi.getMaxScaleOnAxis() > 0)) continue;
    for (let i = 0; i < pos.count; i++) out.push(v.fromBufferAttribute(pos, i).clone().applyMatrix4(mi).applyMatrix4(im.matrixWorld));
  }
  return out;
}
function dentro(im, que) {
  const s = im.boundingSphere.clone().applyMatrix4(im.matrixWorld), ps = puntosVivos(im), tol = 1e-4 * (1 + s.radius);
  assert.ok(ps.length > 0, que + ": nada vivo");
  let peor = -Infinity; for (const p of ps) peor = Math.max(peor, p.distanceTo(s.center) - s.radius);
  assert.ok(peor <= tol, que + ": un vértice queda " + peor.toFixed(3) + " m fuera de la esfera (radio " + s.radius.toFixed(2) + ")");
}
test("38_presencia: los avatares (cuerpo, cabeza, nombre, vehículos) se recortan; su esfera los contiene tras colocarlos y tras moverlos, y las ocultas (escala 0) no la ensanchan", () => {
  const F = sinComentarios(lee("apps/web/motor/38_presencia_compartida.js")), A = trozo(F, "    function actualiza(dt) {", "    function cierraVentana()");
  assert.ok(!/frustumCulled\s*=\s*false/.test(F), "38: ya no hay frustumCulled = false");
  assert.ok(A.indexOf("esferaInst(mallasInst[i])") > A.indexOf("coloca(V[i]"), "38: actualiza rehace la esfera después de colocar los avatares");
  assert.ok(/esferaInst\(mQuad\)/.test(A) && /esferaInst\(mDron\)/.test(A), "38: también las del quad y el dron");
  const esferaInst = esferaInstDe(), geos = [new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), new THREE.IcosahedronGeometry(0.135, 0), new THREE.PlaneGeometry(1.6, 0.3)];
  for (const g of geos) {
    const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial(), 12);
    primerFotograma(im);   // three la calcula una vez, con las matrices de identidad de antes de colocar nada (el caso malo)
    const m = new THREE.Matrix4(), cero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const vuelta of [0, 1]) {   // colocados y, después, movidos
      for (let k = 0; k < 12; k++) {
        if (k % 4 === 3) im.setMatrixAt(k, cero);   // oculta: sin pose
        else im.setMatrixAt(k, m.compose(new THREE.Vector3(2000 + 900 * k + 500 * vuelta, 80 + 3 * k, -3000 + 400 * vuelta * k), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, k, 0)), new THREE.Vector3(0.3 + 0.1 * k, 0.5 + 0.2 * (k % 3), 1)));
      }
      esferaInst(im); im.position.set(10, 0, -5); im.updateMatrixWorld(true);
      dentro(im, g.type + " vuelta " + vuelta);
      assert.ok(im.boundingSphere.radius < 12000, g.type + ": la esfera no llega hasta el origen por las ocultas");
    }
  }
  const vacia = new THREE.InstancedMesh(geos[1], new THREE.MeshBasicMaterial(), 4); vacia.count = 0; esferaInst(vacia);   // nadie: una esfera de un punto, sin NaN
  assert.strictEqual(vacia.boundingSphere.radius, 0); assert.ok(Number.isFinite(vacia.boundingSphere.center.x));
});
test("38_presencia: con la esfera de three sin rehacer (calculada una vez antes de colocar) los avatares quedarían fuera de ella: la prueba de arriba muerde", () => {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 4); primerFotograma(im);
  for (let k = 0; k < 4; k++) im.setMatrixAt(k, new THREE.Matrix4().makeTranslation(3000 + k * 500, 80, -2000));
  assert.throws(() => dentro(im, "sin rehacer"), /fuera de la esfera/);
});

// ---------------------------------------------------------------- el inventario de los frustumCulled = false que quedan
// Cada uno, con su motivo. La clase C (MEJORAS-TECNICAS, AG-1.3): su esfera abarca la finca o la cabeza (la cámara está dentro y three la daría siempre por visible:
// recortar no ahorra nada) o se mueve cada fotograma. «tanda 2»: pendientes de otra tanda con sus pruebas de bandera. Un `frustumCulled = false` nuevo, o más de
// los que hay aquí en un fichero, falla: o se calcula la esfera (computeBoundingSphere DESPUÉS de escribir posiciones o matrices) o se anota aquí por qué no.
const SIN_RECORTE = {
  "07_follaje.js": [1, "las sombras de los olivos: una InstancedMesh con toda la finca (la cámara siempre dentro)"],
  "07ac_lejanos.js": [1, "los olivos lejanos: instancias por toda la finca (hasta 1,6 km) que se rehacen al moverse; vacía no se dibuja (visible = count > 0)"],
  "07b_arboles.js": [1, "niveles 1 y 2: instancias por toda la finca que se rehacen al moverse; vacías no se dibujan (visible = count > 0)"],
  "08b_marcadores_lidar.js": [2, "copas y marcadores LiDAR: instancias por toda la finca"],
  "14_historia.js": [1, "el avance de tareas: instancias por toda la finca, rehechas al cambiar de tarea"],
  "15_tiempo.js": [3, "nubes, estrellas y lluvia van con la cámara (las estrellas, además, no se dibujan de día: visible = opacity > 0)"],
  "16_vida.js": [1, "las estelas: se reescriben cada fotograma; vacías no se dibujan"],
  "16b_fauna.js": [1, "las aves: se mueven cada fotograma; vacías no se dibujan"],
  "21_suelo.js": [3, "matas, piedras y contornos: instancias alrededor de quien mira, rehechas al moverse"],
  "22b_huellas_polvo.js": [2, "huellas y polvo alrededor de quien pasea, escritas sueltas en un anillo; sin nada vivo no se dibujan (visible)"],
  "26b_avatares.js": [1, "mallas con esqueleto (VRM): three calcula su volumen una vez, con la pose de reposo, y los huesos se animan cada fotograma; rehacerlo por avatar costaría más de lo que ahorra (AG-1.3b: se queda)"],
  "29_vr.js": [4, "el arco y la línea del teletransporte (se reescriben cada fotograma), y el fundido a negro y la viñeta, pegados a la cámara"]
};
test("inventario: los frustumCulled = false que quedan en el motor son los anotados, cada uno con su motivo", () => {
  const dir = path.join(RAIZ, "apps/web/motor"), hay = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
    const n = (sinComentarios(fs.readFileSync(path.join(dir, f), "utf8")).match(/frustumCulled\s*=\s*false/g) || []).length;
    if (n) hay[f] = n;
  }
  const mal = [];
  for (const [f, n] of Object.entries(hay)) {
    const a = SIN_RECORTE[f];
    if (!a) mal.push(f + ": " + n + " sin motivo anotado");
    else if (n > a[0]) mal.push(f + ": " + n + " y hay anotados " + a[0]);
  }
  assert.deepStrictEqual(mal, [], "frustumCulled = false sin motivo: calcula la esfera tras escribir posiciones o matrices, o anota aquí por qué no (clase C)\n" + mal.join("\n"));
  for (const [f, a] of Object.entries(SIN_RECORTE)) {
    assert.ok(typeof a[1] === "string" && a[1].length > 20, f + ": el motivo");
    assert.ok((hay[f] || 0) === a[0], f + ": anotados " + a[0] + " y hay " + (hay[f] || 0) + " (si se activó el recorte, baja la cuenta aquí)");
  }
  // los que se recortan desde AG-1.3, con el patrón que les toca
  const M = f => sinComentarios(lee("apps/web/motor/" + f));
  const P = M("18_paisaje.js"), co = trozo(P, "function colocaPaisaje()", "function sombrasSol("), ss = trozo(P, "function sombrasSol(", "var aguaNivel");
  assert.ok(/computeBoundingSphere\(\)/.test(co.slice(co.lastIndexOf("needsUpdate"))), "18: colocaPaisaje calcula las esferas después de escribir");
  assert.ok(/instSombraPA\.computeBoundingSphere\(\)/.test(ss.slice(ss.lastIndexOf("instSombraPA.count = n"))), "18: sombrasSol calcula la esfera después de escribir");
  const O = trozo(M("39_oficina_mundo.js"), "function coloca()", "function refresca()");
  assert.ok(O.indexOf("computeBoundingSphere()") > O.indexOf("mCol.count = mBan.count"), "39: coloca() calcula las esferas después de escribir");
});
