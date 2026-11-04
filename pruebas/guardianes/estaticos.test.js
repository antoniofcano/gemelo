"use strict";
// AG-1.15: objetos estáticos sin recomponer la matriz (apps/web/motor/02j_estaticos.js), en Node y sin navegador, con el three de verdad.
//   · equivalencia: tras colocar y tras cambiar la exageración (1 → 3 → 1,5 → 1), la matriz del mundo de cada objeto congelado es la MISMA que con
//     matrixAutoUpdate = true. Se comprueba con el código de verdad de 18_paisaje (colocaPaisaje), 15_tiempo (barreras) y 39_oficina_mundo (balizas
//     oficiales), cada uno dos veces: con Estaticos de verdad y con un Estaticos que no congela nada;
//   · lo que se mueve cada fotograma (el rombo y el anillo de las balizas) sigue en automático dentro de un grupo congelado y sigue su movimiento;
//   · el inventario: qué ficheros congelan (y solo esos), qué queda en automático y por qué, y lo que ya iba congelado antes (04b, 04e, 44);
//   · un micro-banco de Node de updateMatrixWorld de la escena con todo en automático frente a todo congelado (RELATIVO, no son fps).
// No toca Chrome, Docker ni el banco. Ni Quest ni iPhone: no probado en dispositivo.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ, fs } = require("./_util");
const { conFabrica } = require("./_materiales");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const trozo = (fuente, ini, fin) => { const i = fuente.indexOf(ini), f = fuente.indexOf(fin, i + 1); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return fuente.slice(i, f); };
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const estaticosReal = () => conFabrica({ THREE }).Estaticos;
/** el mismo contrato que Estaticos, pero sin congelar nada: three recompone todo en cada render() */
const estaticosNulo = () => ({ congela: o => o, congelados: () => ({ congelados: 0, automaticos: 0 }) });
/** lo que hace render(): scene.updateMatrixWorld() (sin forzar) */
const render = scene => scene.updateMatrixWorld();
const lista = raiz => { const l = []; raiz.traverse(o => l.push(o)); return l; };
function igualesMundo(a, b, que) {
  const la = lista(a), lb = lista(b);
  assert.strictEqual(la.length, lb.length, que + ": mismo número de objetos");
  la.forEach((o, i) => {
    const p = lb[i];
    for (let k = 0; k < 16; k++) assert.ok(Math.abs(o.matrixWorld.elements[k] - p.matrixWorld.elements[k]) < 1e-9, que + ": " + (o.name || o.type) + " #" + i + " matrixWorld[" + k + "]");
    if (o.isInstancedMesh) assert.deepStrictEqual(Array.from(o.instanceMatrix.array), Array.from(p.instanceMatrix.array), que + ": instancias de " + (o.name || o.type));
  });
}
const EXAG = [1, 3, 1.5, 1];

// ---------------------------------------------------------------- el módulo suelto
test("Estaticos.congela: congela el subárbol, deja la matriz del mundo al día y es idempotente; excepto deja en automático lo que se mueve", () => {
  const E = estaticosReal(), raiz = new THREE.Group(), hijo = new THREE.Group(), nieto = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), movil = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  raiz.add(hijo); hijo.add(nieto); hijo.add(movil);
  raiz.position.set(1, 2, 3); hijo.position.set(10, 0, 0); hijo.rotation.y = 0.5; nieto.position.set(0, 5, 0); nieto.scale.set(2, 3, 4);
  const ref = raiz.clone(); ref.updateMatrixWorld(true);
  assert.strictEqual(E.congela(raiz, [movil]), raiz);
  assert.ok(!raiz.matrixAutoUpdate && !hijo.matrixAutoUpdate && !nieto.matrixAutoUpdate && movil.matrixAutoUpdate);
  assert.strictEqual(JSON.stringify(E.congelados(raiz)), JSON.stringify({ congelados: 3, automaticos: 1 }));
  const rn = ref.children[0].children[0];
  for (let k = 0; k < 16; k++) assert.ok(Math.abs(nieto.matrixWorld.elements[k] - rn.matrixWorld.elements[k]) < 1e-12);
  // el móvil sigue su movimiento aunque su padre esté congelado
  movil.position.set(7, 0, 0); raiz.updateMatrixWorld(); assert.ok(Math.abs(movil.matrixWorld.elements[12] - (1 + 10 + 7 * Math.cos(0.5))) < 1e-9);
  // recolocar + congela otra vez: lo congelado sigue lo que se le cambió (y solo entonces)
  nieto.position.set(0, 9, 0); raiz.updateMatrixWorld(); assert.strictEqual(nieto.matrixWorld.elements[13], 7, "sin congela, el cambio no se ve (por eso cada sitio llama a congela al colocar)");
  E.congela(raiz, [movil]); assert.strictEqual(nieto.matrixWorld.elements[13], 11);
  E.congela(null);   // tolerante
});

// ---------------------------------------------------------------- 18_paisaje: el código de verdad, con y sin congelar
const PAISAJE = {
  edificios: [{ x: 10, y: 20, largo: 12, ancho: 8, hAlero: 3, hCumbrera: 5, ang: 0.3, color: [200, 180, 160] }],
  tendido: { linea: [[-100, -50, 95], [0, 0, 112], [120, 60, 131]], postes: [{ x: -100, y: -50, zBase: 80, zAlto: 92 }],
    derivaciones: [{ postes: [{ x: 20, y: 30, zBase: 88, zAlto: 96 }], linea: [[0, 0, 112], [20, 30, 98]] }] },
  arroyo: { ejes: [[[-50, -80, 0, 3], [-20, -60, 0, 4], [10, -40, 0, 3], [40, -10, 0, 2]]] },
  arboles: [{ x: 30, y: -30, h: 8, r: 3, tipo: "encina" }, { x: -60, y: 70, h: 3, r: 2, tipo: "arbusto" }, { x: 150, y: -120, h: 10, r: 4, tipo: "frutal" }]
};
function mundoPaisaje(Estaticos) {
  const g = {
    THREE, Estaticos, D: { paisaje: JSON.parse(JSON.stringify(PAISAJE)) }, $: () => ({ checked: true, addEventListener() {} }), ESC_R8: 1,
    suelo: (x, y) => 80 + 0.2 * x + 0.1 * y, desp: () => 0, copas: [], scene: new THREE.Scene(), SRGB: THREE.SRGBColorSpace, sol: {}, exag: 1, hash,
    gSombras: new THREE.Group(), tronco: null, matSombra: new THREE.MeshBasicMaterial({ transparent: true }), geoSombra: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    pon() {}, lista: [], lluvia: null, cur: { ms: 0, nub: 0, lluvia: 0, dir: 0, viento: 0 }, tMundo: 0, nivel: () => ({ s: { alt: 0.8, az: 0.4 }, d: 1 }), esfera: null, EST: { activa: false }
  };
  g.scene.add(g.gSombras);
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/18_paisaje.js"), vm.createContext(conFabrica(g)), { filename: "18_paisaje.js" });
  return g;
}
test("18_paisaje: tras colocaPaisaje y al cambiar la exageración (1 → 3 → 1,5 → 1), la matriz del mundo de cada objeto es la de matrixAutoUpdate = true", () => {
  const A = mundoPaisaje(estaticosReal()), B = mundoPaisaje(estaticosNulo());
  const gA = A.scene.getObjectByName("paisaje"), gB = B.scene.getObjectByName("paisaje");
  assert.ok(gA && gB);
  for (const e of EXAG) {
    A.exag = e; B.exag = e; A.colocaPaisaje(); B.colocaPaisaje(); render(A.scene); render(B.scene);
    igualesMundo(A.scene, B.scene, "exag " + e);
  }
  const n = lista(gA).length, c = lista(gA).filter(o => !o.matrixAutoUpdate).length;
  assert.strictEqual(c, n, "todo el paisaje (grupo, edificios, postes, hilos, árboles, cauces) está congelado: " + c + " de " + n);
  assert.strictEqual(lista(gB).filter(o => !o.matrixAutoUpdate).length, 0, "el control no congela nada");
  // las sombras de los árboles y edificios (instSombraPA) también
  const sombra = A.gSombras.children.find(o => o.isInstancedMesh); assert.ok(sombra && !sombra.matrixAutoUpdate);
  // tras mover el sol, las sombras se recolocan (instancias) y la equivalencia sigue
  A.nivel = B.nivel = () => ({ s: { alt: 0.25, az: 2.1 }, d: 1 }); A.sombrasSol(true); B.sombrasSol(true); render(A.scene); render(B.scene); igualesMundo(A.scene, B.scene, "sol bajo");
});

// ---------------------------------------------------------------- 15_tiempo (barreras) y 39_oficina_mundo (balizas oficiales): su código de verdad
function barreras(Estaticos) {
  const F = lee("apps/web/motor/15_tiempo.js"), T = trozo(F, "  function creaBarrera(pr)", "  function pintaFondoTiempo()");
  const f = new Function("THREE", "Estaticos", "suelo", "matBarrera", "gLinde",
    "\"use strict\";\nvar BARRERA_ALTO = 5.5, BARRERAS = [], exag = 1;\n" + T + "\nreturn { crea: creaBarrera, coloca: colocaBarrera, pon: function (e) { exag = e; }, n: function () { return BARRERAS.length; } };");
  const gLinde = new THREE.Group(); Estaticos.congela(gLinde); const escena = new THREE.Scene(); escena.add(gLinde);
  return Object.assign(f(THREE, Estaticos, (x, y) => 60 + 0.3 * x - 0.2 * y, new THREE.MeshBasicMaterial(), gLinde), { escena });
}
test("15_tiempo: la barrera de luz de cada linde (malla congelada) da la misma matriz del mundo que en automático con cada exageración", () => {
  const A = barreras(estaticosReal()), B = barreras(estaticosNulo());
  for (const M of [A, B]) { M.crea({ linde: [[-120, -80], [140, -60], [150, 110], [-90, 130]] }); M.crea({ linde: [[200, 0], [260, 40], [240, 90]] }); }
  for (const e of EXAG) { for (const M of [A, B]) { M.pon(e); for (let k = 0; k < M.n(); k++) M.coloca(k); render(M.escena); } igualesMundo(A.escena, B.escena, "barreras, exag " + e); }
  assert.ok(lista(A.escena).slice(1).every(o => !o.matrixAutoUpdate), "grupo y mallas congelados");
});
function balizasOficiales(Estaticos) {
  const F = lee("apps/web/motor/39_oficina_mundo.js"), T = trozo(F, "    function montaGrafica()", "    function refresca()");
  const scene = new THREE.Scene();
  const f = new Function("THREE", "Estaticos", "scene", "suelo", "OP", "ALTO", "COLOR", "CLARO",
    "\"use strict\";\nvar gB = null, mCol = null, mBan = null, geos = [], mats = [], m4 = null, v1 = null, v2 = null, q0 = null, vS = null, w0 = null, balizas = [], exag = 1;\n" + T +
    "\nreturn { coloca: coloca, pon: function (b, e) { balizas = b; exag = e; } };");
  return Object.assign(f(THREE, Estaticos, scene, (x, y) => 60 + 0.3 * x - 0.2 * y, { BALIZAS_MAX: 20 }, 18, 0xffcc00, 0xffffff), { scene });
}
test("39_oficina_mundo: las balizas oficiales (grupo y dos mallas congeladas) dan la misma matriz del mundo que en automático con cada exageración", () => {
  const A = balizasOficiales(estaticosReal()), B = balizasOficiales(estaticosNulo());
  const bs = n => Array.from({ length: n }, (_, i) => ({ x: -150 + 37 * i, y: 90 - 23 * (i % 5) }));
  for (const e of EXAG) for (const n of [3, 12]) { for (const M of [A, B]) { M.pon(bs(n), e); M.coloca(); render(M.scene); } igualesMundo(A.scene, B.scene, "balizas " + n + ", exag " + e); }
  assert.ok(lista(A.scene).slice(1).every(o => !o.matrixAutoUpdate));
});

// ---------------------------------------------------------------- 19_balizas: lo que late se queda en automático dentro del grupo congelado
test("19_balizas: la baliza (grupo y columna) se congela con colocaBalizas; el rombo y el anillo siguen en automático y siguen su movimiento", () => {
  const F = lee("apps/web/motor/19_balizas.js"), T = trozo(F, "  function congelaBalizas()", "  var PILL_TXT");
  assert.match(sinComentarios(F), /function colocaBalizas\(\) \{[^}]*\}[^}]*congelaBalizas\(\); refrescaBalizas\(\);/s, "colocaBalizas congela justo después de colocar");
  const E = estaticosReal(), gBal = new THREE.Group(), escena = new THREE.Scene(); escena.add(gBal);
  const BAL = [0, 1, 2].map(k => {
    const g = new THREE.Group(), col = new THREE.Mesh(new THREE.CylinderGeometry(), new THREE.MeshBasicMaterial()), rombo = new THREE.Mesh(new THREE.OctahedronGeometry(), new THREE.MeshBasicMaterial()), anillo = new THREE.Mesh(new THREE.RingGeometry(1, 2), new THREE.MeshBasicMaterial());
    g.add(col, rombo, anillo); g.userData = { k, rombo, anillo }; gBal.add(g); return g;
  });
  const colocar = e => BAL.forEach(g => g.position.set(10 * g.userData.k, 3 * e, -5));
  const f = new Function("Estaticos", "gBal", "BAL", "\"use strict\";\n" + T + "\nreturn congelaBalizas;")(E, gBal, BAL);
  colocar(1); f(); render(escena);
  assert.ok(!gBal.matrixAutoUpdate && BAL.every(g => !g.matrixAutoUpdate && !g.children[0].matrixAutoUpdate && g.userData.rombo.matrixAutoUpdate && g.userData.anillo.matrixAutoUpdate));
  for (const e of EXAG) {
    colocar(e); f();
    BAL.forEach((g, i) => { g.userData.rombo.rotation.y += 0.7; g.userData.rombo.position.y = 27.5 + Math.sin(i + e); g.userData.anillo.scale.setScalar(1 + 0.12 * Math.sin(i * 2)); });
    render(escena);
    BAL.forEach((g, i) => {
      assert.ok(Math.abs(g.userData.rombo.matrixWorld.elements[13] - (3 * e + 27.5 + Math.sin(i + e))) < 1e-9, "el rombo sube y baja sobre su baliza, exag " + e);
      assert.ok(Math.abs(g.userData.anillo.matrixWorld.elements[0] - (1 + 0.12 * Math.sin(i * 2))) < 1e-9, "el anillo late");
      assert.ok(Math.abs(g.children[0].matrixWorld.elements[12] - 10 * i) < 1e-9 && Math.abs(g.children[0].matrixWorld.elements[13] - 3 * e) < 1e-9, "la columna sigue a la baliza");
    });
  }
});

// ---------------------------------------------------------------- inventario
const MOTOR = path.join(RAIZ, "apps/web/motor");
// quién congela (y con qué motivo es estático)
const CONGELAN = {
  "05_nube.js": "mallas de puntos por tesela: se colocan al crearlas y en exagNube()",
  "06_arboles.js": "los grupos de olivos y sus sombras: identidad, nunca se mueven",
  "07_follaje.js": "la malla de sombras de los olivos: solo sus instancias",
  "07b_arboles.js": "cada celda de olivos y las mallas de instancias: identidad; todo va en vértices e instancias",
  "08_marcadores.js": "gLinde: grupo vacío en identidad al que cuelgan la linde y las barreras",
  "08b_marcadores_lidar.js": "copas LiDAR, marcas OlivarTrack y desfase: la exageración va en las matrices de instancia",
  "14_historia.js": "avance árbol a árbol y las mallas de resalte de parcela: instancias y uniforme de exageración",
  "15_tiempo.js": "barreras de luz de las lindes: identidad, los vértices llevan la exageración (colocaBarrera)",
  "18_paisaje.js": "paisaje entero: edificios, postes, hilos, árboles y cauces, tras colocaPaisaje (cada vez que cambia la exageración) y la malla de sombras",
  "19_balizas.js": "baliza (grupo y columna) tras colocaBalizas; el rombo y el anillo se quedan en automático",
  "21_suelo.js": "matas, piedras y contactos del suelo: instancias",
  "22b_huellas_polvo.js": "huellas: instancias (el polvo, Points, queda en automático)",
  "39_oficina_mundo.js": "balizas oficiales: instancias",
  "50_decoraciones.js": "decoraciones de los olivos: instancias"
};
// lo que ya iba congelado antes de AG-1.15 (con matrixAutoUpdate = false a mano)
const YA_ESTATICOS = { "04b_escena3d.js": "tiles.group: la matriz la pone Escena3D.exagera(); 3d-tiles-renderer gestiona sus propias matrices", "04e_suelo_fondo.js": "malla del suelo de fondo: makeScale(1, exag, 1)", "44_lindes.js": "mallas de la linde" };
// lo que se queda en automático, con su motivo (el guardián comprueba que existen y que no congelan)
const AUTOMATICO = {
  "02d_laminas.js": "láminas: giran y miran a la cámara",
  "02e_entidades.js": "anillo de resaltado: se mueve y escala con lo señalado",
  "12_paseo.js": "persona y muñeco: andan",
  "12b_llegada.js": "anillo de llegada: se mueve",
  "15_tiempo.js#cielo": "sol (sprite), estrellas, lluvia y grupos de nubes: siguen a la cámara o derivan cada fotograma",
  "16_vida.js": "fauna, quad y dron: se mueven",
  "16b_fauna.js": "aves y demás fauna: se mueven",
  "25_perros.js": "perros: se mueven",
  "26b_avatares.js": "avatares VRM: se mueven",
  "29_vr.js": "rig, cámara y mandos: los lleva el visor",
  "38_presencia_compartida.js": "personas de la sala: se mueven",
  "07ab_generados.js": "olivos generados: con matrices propias; no inspeccionado a fondo, queda en automático",
  "07ac_lejanos.js": "olivos lejanos: la malla se escala con la exageración (exagM); no inspeccionado a fondo, queda en automático",
  "19_balizas.js#late": "rombo y anillo de cada baliza: giran, suben y bajan, laten"
};
const motores = () => fs.readdirSync(MOTOR).filter(f => f.endsWith(".js"));

test("inventario: congelan exactamente los ficheros registrados aquí (uno nuevo hay que añadirlo, con su motivo) y cada uno recoloca con congela tras colocar", () => {
  const usan = motores().filter(f => f !== "02j_estaticos.js" && /Estaticos\.congela\(/.test(sinComentarios(lee("apps/web/motor/" + f)))).sort();
  assert.deepStrictEqual(usan, Object.keys(CONGELAN).sort());
  const S = f => sinComentarios(lee("apps/web/motor/" + f));
  assert.match(S("18_paisaje.js"), /Estaticos\.congela\(gPaisaje\);[\s\S]{0,200}sombrasSol\(true\)/, "colocaPaisaje congela el paisaje antes de las sombras");
  assert.ok(S("18_paisaje.js").indexOf("Estaticos.congela(gPaisaje)") > S("18_paisaje.js").indexOf("esferaSegura(geoCable)"), "después de escribir vértices e instancias");
  assert.match(S("05_nube.js"), /function exagNube\(\) \{[^}]*Estaticos\.congela\(m\)/, "exagNube recoloca y congela de nuevo");
  assert.match(S("19_balizas.js"), /function colocaBalizas\(\) \{[\s\S]{0,260}\}\); congelaBalizas\(\); refrescaBalizas\(\)/, "colocaBalizas congela tras colocar");
});

test("inventario: lo que ya iba congelado a mano sigue así, y lo que se queda en automático existe y no se congela", () => {
  for (const f of Object.keys(YA_ESTATICOS)) assert.match(sinComentarios(lee("apps/web/motor/" + f)), /matrixAutoUpdate = false/, f + ": sigue con matrixAutoUpdate = false");
  for (const k of Object.keys(AUTOMATICO)) {
    const f = k.split("#")[0]; assert.ok(fs.existsSync(path.join(MOTOR, f)), f + ": existe");
    if (!(f in CONGELAN)) assert.ok(!/Estaticos\.congela\(|matrixAutoUpdate = false/.test(sinComentarios(lee("apps/web/motor/" + f))), f + ": se queda en automático, no se congela");
  }
  // nada de lo que se mueve se congela por descuido: el rombo y el anillo de las balizas van en la lista de excepciones
  assert.match(sinComentarios(lee("apps/web/motor/19_balizas.js")), /mov\.push\(g\.userData\.rombo, g\.userData\.anillo\)/);
  // lo que 3d-tiles-renderer gestiona no se toca desde Estaticos
  assert.ok(!/Estaticos\.congela\([^)]*tiles/.test(sinComentarios(lee("apps/web/motor/04b_escena3d.js"))));
});

// ---------------------------------------------------------------- micro-banco (relativo)
test("micro-banco: updateMatrixWorld de la escena, todo en automático frente a todo congelado (relativo; no son fps)", t => {
  const E = estaticosReal();
  function escena(n) {   // celdas de olivos (grupo + 5 mallas), balizas, paisaje y lindes; n objetos en total, aproximadamente
    const s = new THREE.Scene(), geo = new THREE.BoxGeometry(), mat = new THREE.MeshBasicMaterial();
    while (lista(s).length < n) {
      const g = new THREE.Group(); g.position.set(Math.random() * 100, 0, Math.random() * 100); g.rotation.y = Math.random();
      for (let j = 0; j < 5; j++) { const m = new THREE.Mesh(geo, mat); m.position.set(j, 1, 0); m.scale.set(1, 2, 1); m.rotation.y = j; g.add(m); }
      s.add(g);
    }
    return s;
  }
  const N = 1200, medianas = [];
  const mide = (s, veces) => { const r = []; for (let i = 0; i < 9; i++) { const t0 = process.hrtime.bigint(); for (let k = 0; k < veces; k++) s.updateMatrixWorld(); r.push(Number(process.hrtime.bigint() - t0) / 1e6 / veces); } r.sort((a, b) => a - b); return r[4]; };
  const A = escena(N), C = escena(N); C.children.forEach(g => E.congela(g));
  mide(A, 50); mide(C, 50);   // calentar
  const auto = mide(A, 200), cong = mide(C, 200), n = lista(A).length;
  assert.ok(lista(C).slice(1).every(o => !o.matrixAutoUpdate));
  t.diagnostic("objetos " + n + " · updateMatrixWorld por llamada: automático " + auto.toFixed(4) + " ms, congelado " + cong.toFixed(4) + " ms · relación " + (auto / cong).toFixed(2) + "× (relativo, en Node: no son fps)");
  assert.ok(cong < auto, "congelado cuesta menos que automático (" + cong + " < " + auto + ")");
});
