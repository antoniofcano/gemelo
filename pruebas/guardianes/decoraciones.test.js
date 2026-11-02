"use strict";
// Las decoraciones de los olivos (P7g D3; apps/web/motor/50_decoraciones.js, componente «decoraciones-olivo»), en Node y sin navegador:
//   · lo puro (DecoracionesPuro): el catálogo es el del contrato (contratos/decoraciones.json); la lista entra por su lista blanca y un código desconocido
//     se ignora; qué olivos se dibujan (los K más cercanos al foco con decoración válida, a menos de CERCA_M, en orden estable; con fast-check frente a la
//     cuenta a lo bruto); dónde va la pieza (en la copa a 0,62-0,78 de la altura, a 0,85 del radio dibujado; siempre la misma por olivo); el foco (VR,
//     paseo, vista aérea); el reparto por pieza y su firma; y la fila de la ficha (ILUSTRATIVA, regla 5);
//   · las mallas con el three de verdad (el de apps/web) y su mergeGeometries: cada pieza cabe en los triángulos del catálogo, con color en los vértices;
//   · el componente con el three de verdad y un mundo de mentira: sin servidor no crea nada ni pide nada; con servidor pide la lista por el Bus, crea UNA
//     InstancedMesh por pieza con algo cerca, con el tope de instancias, dentro de su presupuesto (llamadas y triángulos contados), sigue al foco,
//     reescribe al cambiar la exageración, complementa la ficha del olivo y libera() lo suelta todo (dispose) y deja la escena como estaba.
// El registro (con y sin el componente, ?decoraciones=0 y genera_motor.mjs --sin) y el catálogo de eventos los comprueba componentes.test.js; lo de Chrome
// (llamadas y triángulos de verdad, renderer.info.memory) está escrito en decoraciones_chrome.test.js, sin ejecutar (por el banco).
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const fc = require("fast-check");
const { RAIZ, fs, lee } = require("./_util");

const FICHERO = "apps/web/motor/50_decoraciones.js", FUENTE = lee(FICHERO);
const trozo = (ini, fin) => { const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return FUENTE.slice(i, f); };
const P = new Function("\"use strict\";\n" + trozo("// [puro:inicio]", "// [puro:fin]") + "\nreturn DecoracionesPuro;")();
const CATALOGO = JSON.parse(lee("contratos/decoraciones.json"));
const IMPORTA = 'import("three/addons/utils/BufferGeometryUtils.js")';

const DIR_THREE = path.join(RAIZ, "apps/web/node_modules/three");
const HAY_THREE = fs.existsSync(path.join(DIR_THREE, "build/three.module.js"));
const SIN_THREE = HAY_THREE ? false : "sin apps/web/node_modules (npm ci en apps/web)";
let THREE, U;
test.before(async () => {
  if (!HAY_THREE) return;
  THREE = await import(pathToFileURL(path.join(DIR_THREE, "build/three.module.js")).href);
  U = await import(pathToFileURL(path.join(DIR_THREE, "examples/jsm/utils/BufferGeometryUtils.js")).href);
});

// ---------- lo puro
test("puro: el catálogo es el de contratos/decoraciones.json (ids, nombres, épocas y triángulos) y cada pieza tiene su forma", () => {
  assert.strictEqual(CATALOGO.v, 1);
  assert.deepStrictEqual(P.CATALOGO.map(p => ({ id: p.id, nombre: p.nombre, epoca: p.epoca, triangulos: p.triangulos })),
    CATALOGO.piezas.map(p => ({ id: p.id, nombre: p.nombre, epoca: p.epoca, triangulos: p.triangulos })), "el motor y el contrato dicen lo mismo");
  assert.ok(CATALOGO.piezas.every(p => p.ilustrativa === true), "todas ilustrativas en el contrato");
  assert.deepStrictEqual(Object.keys(P.FORMAS).sort(), P.CATALOGO.map(p => p.id).sort(), "una forma por pieza, ninguna de más");
  assert.strictEqual(P.MAX_TRI, 40); assert.strictEqual(P.pieza("luces").nombre, "Luces"); assert.strictEqual(P.pieza("cohete"), null); assert.strictEqual(P.pieza("hasOwnProperty"), null);
});

test("puro: la lista entra por su lista blanca; un código desconocido o malformado se ignora; un olivo, una vez; orden estable", () => {
  const l = [
    { finca: "hituelo", copas_id: 20, pieza: "luces", mia: true },
    { finca: "hituelo", copas_id: 3, pieza: "cohete", mia: false },               // no está en el catálogo
    { finca: "hituelo", copas_id: 4, pieza: "LUCES" }, { finca: "Mal!", copas_id: 5, pieza: "lazo" }, { finca: "hituelo", copas_id: -1, pieza: "lazo" },
    { finca: "hituelo", copas_id: 1.5, pieza: "lazo" }, null, 7, { finca: "hituelo", copas_id: 6, pieza: null },
    { finca: "hituelo", copas_id: 20, pieza: "lazo" },                            // el mismo olivo otra vez: gana el primero
    { finca: "cerro", copas_id: 1, pieza: "flores", mia: "sí" },
  ];
  const r = P.indexa(l);
  assert.deepStrictEqual(r.map(x => [x.clave, x.pieza, x.mia]), [["cerro:1", "flores", false], ["hituelo:20", "luces", true]]);
  assert.deepStrictEqual(P.indexa(l.slice().reverse()).map(x => x.clave), ["cerro:1", "hituelo:20"], "el mismo orden venga como venga");
  assert.deepStrictEqual(P.indexa(null), []); assert.deepStrictEqual(P.indexa({ lista: 1 }), []);
});

test("puro: la pieza va en la copa, a 0,62-0,78 de la altura y a 0,85 del radio dibujado, siempre igual para el mismo olivo", () => {
  const copa = { x: 100, y: 50, h: 4, perfil: [2, 2, 2, 2, 2, 2, 2, 2] }, radio = p => p[0];
  for (const n of [0, 1, 7, 900001, 4294967295]) {
    const o = P.coloca(copa, n, radio, 0.5, 10, 1);
    assert.deepStrictEqual(P.coloca(copa, n, radio, 0.5, 10, 1), o, "determinista");
    assert.ok(o.alto >= 0.62 && o.alto <= 0.78, "altura relativa " + o.alto);
    assert.ok(Math.abs(o.y - (10 + 4 * o.alto)) < 1e-9, "sobre el suelo, a alto × h");
    assert.ok(Math.abs(Math.hypot(o.x - 100, -o.z - 50) - 2 * 0.5 * 0.85) < 1e-9, "a 0,85 del radio dibujado (radio × factor)");
    assert.ok(Math.abs(Math.atan2(-o.z - 50, o.x - 100) - Math.atan2(Math.sin(o.giro), Math.cos(o.giro))) < 1e-9, "mirando hacia fuera de la copa");
    assert.strictEqual(o.escala, 1);
  }
  const ex = P.coloca(copa, 7, radio, 1, 10, 2), sin = P.coloca(copa, 7, radio, 1, 10, 1);
  assert.ok(Math.abs(ex.y - 2 * sin.y) < 1e-9, "la exageración escala la altura de la escena");
  assert.strictEqual(P.coloca(Object.assign({}, copa, { h: 12 }), 1, radio, 1, 0, 1).escala, 1.5, "olivo grande: pieza algo mayor, con tope");
  assert.strictEqual(P.coloca(Object.assign({}, copa, { h: 1 }), 1, radio, 1, 0, 1).escala, 0.8, "olivo chico: con suelo");
  assert.ok(Math.hypot(...(o => [o.x - 100, -o.z - 50])(P.coloca(copa, 1, () => 0, 1, 0, 1))) >= 0.3 - 1e-9, "sin radio, a 0,3 m del eje (no dentro del tronco)");
  const angs = new Set([1, 2, 3, 4, 5, 6].map(n => P.coloca(copa, n, radio, 1, 0, 1).giro.toFixed(3))); assert.strictEqual(angs.size, 6, "cada olivo, su lado");
});

test("puro: el foco es la cabeza en VR, la cámara paseando y lo que se mira en la vista aérea", () => {
  const camara = { x: 1, z: 2 }, objetivo = { x: 30, z: 40 }, cab = { x: -5, z: -6 };
  assert.deepStrictEqual(P.foco({ vr: true, cab, paseando: true, camara, objetivo }), { x: -5, z: -6 });
  assert.deepStrictEqual(P.foco({ vr: false, paseando: true, camara, objetivo }), { x: 1, z: 2 });
  assert.deepStrictEqual(P.foco({ vr: false, paseando: false, camara, objetivo }), { x: 30, z: 40 });
  assert.deepStrictEqual(P.foco({ vr: false, paseando: false, camara, objetivo: null }), { x: 1, z: 2 });
  assert.ok(!P.seMovio({ x: 0, z: 0 }, { x: 1, z: 1 }) && P.seMovio({ x: 0, z: 0 }, { x: 3, z: 0 }) && P.seMovio(null, { x: 0, z: 0 }));
});

// las decoraciones en una rejilla: posDe da la posición de la escena (x, z = −norte) o null si el olivo no está en este mundo
const azarItems = fc.array(fc.record({ id: fc.integer({ min: 0, max: 400 }), pieza: fc.constantFrom("flores", "cinta", "farolillo", "cosecha", "luces", "lazo", "cohete"), fuera: fc.boolean() }), { maxLength: 300 });
test("puro (fast-check): se dibujan los K más cercanos a menos de CERCA_M con decoración válida, como la cuenta a lo bruto, en orden estable", () => {
  fc.assert(fc.property(azarItems, fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }), fc.integer({ min: 1, max: 80 }), (raw, fx, fz, max) => {
    const items = P.indexa(raw.map(r => ({ finca: "f", copas_id: r.id, pieza: r.pieza })));
    const fuera = new Set(raw.filter(r => r.fuera).map(r => r.id));
    const posDe = it => (fuera.has(it.copas_id) ? null : { x: (it.copas_id % 20) * 7 - 70, z: Math.floor(it.copas_id / 20) * 7 - 70 });
    const f = { x: fx, z: fz }, sel = P.eligeCercanas(items, posDe, f, P.CERCA_M, max);
    assert.ok(items.every(it => it.pieza !== "cohete"));
    const bruto = items.map(it => ({ it, p: posDe(it) })).filter(o => o.p).map(o => ({ k: o.it.clave, d2: (o.p.x - fx) ** 2 + (o.p.z - fz) ** 2 }))
      .filter(o => o.d2 < P.CERCA_M ** 2).sort((a, b) => a.d2 - b.d2 || (a.k < b.k ? -1 : 1)).slice(0, max);
    assert.deepStrictEqual(sel.map(s => s.item.clave), bruto.map(o => o.k));
    assert.ok(sel.length <= max);
    // la misma selección venga en el orden que venga
    assert.deepStrictEqual(P.reparte(P.eligeCercanas(items.slice().reverse(), posDe, f, P.CERCA_M, max)).firma, P.reparte(sel).firma);
  }), { numRuns: 200 });
});

test("puro: el reparto por pieza (cada grupo en orden de clave), su firma y su coste; la fila de la ficha dice que es ilustrativa", () => {
  const it = (k, p) => ({ item: { clave: k, pieza: p } });
  const r = P.reparte([it("f:9", "luces"), it("f:2", "lazo"), it("f:1", "luces")]);
  assert.deepStrictEqual(Object.keys(r.por).sort(), ["lazo", "luces"]); assert.deepStrictEqual(r.por.luces.map(x => x.clave), ["f:1", "f:9"]);
  assert.strictEqual(r.firma, "luces=f:1,f:9;lazo=f:2", "en el orden del catálogo");
  assert.deepStrictEqual(P.coste(r.por, { luces: 40, lazo: 24 }), { llamadas: 2, triangulos: 104 });
  assert.deepStrictEqual(P.reparte([]), { por: {}, firma: "" });
  assert.deepStrictEqual(P.fila({ pieza: "luces", mia: true }), { k: "Decoración", v: "Luces", de: "ilustrativa: la eligió tu familia; no la mide el gemelo" });
  assert.match(P.fila({ pieza: "lazo", mia: false }).de, /^ilustrativa: la eligió la familia de esa haza/);
  assert.strictEqual(P.fila({ pieza: "cohete" }), null); assert.strictEqual(P.fila(undefined), null);
  assert.ok(P.MAX * P.MAX_TRI <= 2560 && P.MAX === 64, "el tope de instancias del presupuesto");
});

// ---------- las mallas, con el three de verdad
test("mallas (three de verdad): cada pieza cabe en los triángulos del catálogo, sin índice ni uv, con color en los vértices", { skip: SIN_THREE }, () => {
  const ctx = vm.createContext({ THREE, Componentes: { registra: () => true }, console, Math });
  vm.runInContext("\"use strict\";\n" + FUENTE + "\nthis.geo = decoracionesGeometria;", ctx, { filename: FICHERO });
  const medido = {};
  for (const p of P.CATALOGO) {
    const g = ctx.geo(p.id, U);
    assert.ok(g, p.id); assert.strictEqual(g.index, null, p.id + ": sin índice");
    assert.ok(!g.getAttribute("uv") && g.getAttribute("color") && g.getAttribute("normal"), p.id + ": position, normal y color");
    const t = g.getAttribute("position").count / 3; medido[p.id] = t;
    assert.ok(t > 0 && t <= p.triangulos, p.id + ": " + t + " triángulos frente a " + p.triangulos);
    g.computeBoundingBox(); const b = g.boundingBox;
    assert.ok(b.max.y <= 0.05 && b.min.y >= -0.9 && Math.max(Math.abs(b.min.z), Math.abs(b.max.z)) <= 0.5, p.id + ": pequeña y colgando del punto (≤ 0,9 m)");
    g.dispose();
  }
  console.log("medido decoraciones (triángulos por pieza):", JSON.stringify(medido));
  assert.deepStrictEqual(medido, { flores: 30, cinta: 24, farolillo: 30, cosecha: 40, luces: 40, lazo: 24 }, "los del comentario del manifiesto");
  assert.strictEqual(ctx.geo("cohete", U), null);
});

// ---------- el componente, con el three de verdad y un mundo de mentira
function mundo({ sinApi = false, falla = false } = {}) {
  const E = { exag: 1, paseando: true, vr: false };
  const scene = new THREE.Scene(), bus = {}, log = [], complementos = [], libera = [];
  const Bus = { on(ev, fn) { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = (bus[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { log.push(ev); (bus[ev] || []).slice().forEach(f => f(d)); return (bus[ev] || []).length; }, hay: ev => !!(bus[ev] && bus[ev].length) };
  // 30 × 30 olivos cada 7 m (centro en 0), de 4 m de alto y 2 m de radio; ids 1000 + i; el 5 no es olivo (oliv: false)
  const copas = Array.from({ length: 900 }, (_, i) => ({ i, id: 1000 + i, x: (i % 30) * 7 - 105, y: Math.floor(i / 30) * 7 - 105, h: 4, perfil: [2, 2, 2, 2, 2, 2, 2, 2], oliv: i !== 5 }));
  const defs = [], g = {
    THREE, scene, Bus, console, Math, JSON, Promise, setTimeout,
    Componentes: { registra: d => { defs.push(d); return true; }, libera: id => libera.push(id) },
    ConfigPuro: { prefijoApi: () => (sinApi ? null : "/api/") }, location: { search: "" }, D: { base: "/teselas/hituelo/", finca_id: "hituelo" },
    copas, suelo: () => 10, FACTOR_R8: 0.5, FACTOR_R8_GEN: 1, radioEn: p => p[0], Generados: { rotulo: i => (i % 2 ? { forma: "ilustrativa" } : null) },
    objetivo: new THREE.Vector3(0, 0, 0), camera: new THREE.PerspectiveCamera(), VRX: { on: false, cab: new THREE.Vector3() },
    Entidades: { complementa: (t, fn) => { assert.strictEqual(t, "olivo"); complementos.push(fn); return () => complementos.splice(complementos.indexOf(fn), 1); } },
    window: {}
  };
  for (const k of ["exag", "paseando"]) Object.defineProperty(g, k, { get: () => E[k], enumerable: true });
  let pedido = 0;
  const fuente = FUENTE.replace(IMPORTA, "(pedidoUtiles(), " + (falla ? "Promise.reject(new Error(\"sin red\"))" : "Promise.resolve(UTILES)") + ")");
  assert.notStrictEqual(fuente, FUENTE, "el import() de mergeGeometries está donde se espera");
  g.UTILES = U; g.pedidoUtiles = () => { pedido++; };
  const ctx = vm.createContext(g);
  vm.runInContext("\"use strict\";\n" + fuente, ctx, { filename: FICHERO });
  assert.strictEqual(defs.length, 1);
  const sueltas = [], n = { on: (ev, fn) => (sueltas.push(Bus.on(ev, fn)), fn), emite: (ev, d) => Bus.emite(ev, d), limpia: fn => (sueltas.push(fn), fn), api: () => null, parametros: {} };
  n.suelta = () => sueltas.splice(0).forEach(f => f());
  const ficha = id => { const f = { titulo: "Olivo", filas: [{ k: "Altura", v: "4 m" }] }; complementos.forEach(fn => fn(f, id, "pantalla")); return f; };
  return { E, g, d: defs[0], n, Bus, log, scene, complementos, libera, ficha, pedidos: () => pedido, listo: () => new Promise(r => setTimeout(r, 5)) };
}
/** lo que se dibuja: mallas visibles (1 llamada cada una) y sus triángulos (por sus instancias) */
function dibujo(raiz) {
  let llamadas = 0, tri = 0;
  (function anda(o) {
    if (o.visible === false) return;
    if (o.isMesh) { llamadas++; const gm = o.geometry, k = gm.index ? gm.index.count / 3 : gm.attributes.position.count / 3; tri += k * (o.isInstancedMesh ? o.count : 1); }
    o.children.forEach(anda);
  })(raiz);
  return { llamadas, triangulos: tri };
}
const lista = (ids, pieza, extra) => ids.map((id, k) => Object.assign({ finca: "hituelo", copas_id: 1000 + id, pieza: typeof pieza === "function" ? pieza(k) : pieza, mia: k % 2 === 0 }, extra || {}));
const PIEZAS = ["flores", "cinta", "farolillo", "cosecha", "luces", "lazo"];

test("componente: manifiesto; sin servidor no crea nada, no pide las utilidades de three ni toca la ficha", { skip: SIN_THREE }, async () => {
  const m = mundo({ sinApi: true });
  assert.strictEqual(m.d.id, "decoraciones-olivo"); assert.strictEqual(m.d.bandera.url, "decoraciones"); assert.strictEqual(m.d.bandera.defecto, true);
  assert.deepStrictEqual({ ...m.d.presupuesto }, { llamadas: 6, triangulos: 2560 }); assert.strictEqual(JSON.stringify(m.d.fases), "{\"tarde\":0.5}");
  const api = m.d.monta(m.n); await m.listo();
  m.Bus.emite("decoraciones:cambian", { lista: lista([0, 1, 2], "luces") }); api.tarde(0.5);
  assert.strictEqual(m.pedidos(), 0, "no pide mergeGeometries"); assert.strictEqual(m.scene.children.length, 0);
  assert.strictEqual(m.complementos.length, 0, "no complementa la ficha"); assert.ok(!m.log.includes("decoraciones:pide"), "ni pregunta por el Bus");
  assert.deepStrictEqual([api.estado().api, api.estado().lib], [false, "sin servidor"]);
  m.d.libera(api); m.n.suelta();
});

test("componente: con servidor pide la lista al montarse; sin decoraciones, nada en la escena; sin las utilidades de three, nada (y lo dice)", { skip: SIN_THREE }, async () => {
  const m = mundo(), api = m.d.monta(m.n);
  assert.ok(m.log.includes("decoraciones:pide"), "la última lista, por el Bus"); assert.strictEqual(m.pedidos(), 1);
  await m.listo(); api.tarde(0.5);
  assert.strictEqual(m.scene.children.length, 0, "sin decoraciones no se crea nada"); assert.strictEqual(api.estado().lib, "lista");
  m.d.libera(api); m.n.suelta();
  const ko = mundo({ falla: true }), a2 = ko.d.monta(ko.n); await ko.listo();
  ko.Bus.emite("decoraciones:cambian", { lista: lista([0, 1], "luces") }); a2.tarde(0.5);
  assert.strictEqual(ko.scene.children.length, 0); assert.match(a2.estado().lib, /^sin utilidades de three: sin red/);
  ko.d.libera(a2); ko.n.suelta();
});

test("componente: una InstancedMesh por pieza con algo cerca, como mucho 64 en total (las más cercanas), dentro del presupuesto; lo desconocido y lo de otra finca, fuera", { skip: SIN_THREE }, async () => {
  const m = mundo(), api = m.d.monta(m.n); await m.listo();
  // 450 olivos decorados (de las seis piezas), uno con un código desconocido, uno de otra finca y uno que no es olivo (el 5)
  const l = lista(Array.from({ length: 450 }, (_, i) => i * 2 + 1), k => PIEZAS[k % 6]).concat(
    [{ finca: "hituelo", copas_id: 1000 + 434, pieza: "cohete", mia: false }, { finca: "cerro", copas_id: 1000 + 435, pieza: "luces", mia: false }, { finca: "hituelo", copas_id: 1005, pieza: "lazo", mia: true }]);
  m.Bus.emite("decoraciones:cambian", { lista: l }); api.tarde(0.5);
  const grupo = m.scene.getObjectByName("decoraciones de los olivos");
  assert.ok(grupo, "un grupo en la escena");
  assert.deepStrictEqual(grupo.children.map(o => [o.name, o.isInstancedMesh]), PIEZAS.map(p => ["decoración " + p, true]), "una por pieza, en el orden del catálogo");
  const e = api.estado(), dib = dibujo(m.scene);
  console.log("medido decoraciones (64 a la vista, las seis piezas):", JSON.stringify(dib));
  assert.strictEqual(e.validas, 451, "450 + la de otra finca (válida, pero no en este mundo); la desconocida, fuera; la del no olivo es válida");
  assert.strictEqual(e.enMundo, 449, "ni la de otra finca ni la del no olivo están en este mundo");
  assert.strictEqual(e.elegidas, 64, "el tope");
  assert.strictEqual(grupo.children.reduce((a, o) => a + o.count, 0), 64);
  assert.ok(dib.llamadas <= m.d.presupuesto.llamadas && dib.triangulos <= m.d.presupuesto.triangulos, JSON.stringify(dib) + " frente a " + JSON.stringify(m.d.presupuesto));
  assert.deepStrictEqual([e.llamadas, e.triangulos], [dib.llamadas, dib.triangulos], "el estado cuenta lo mismo que la escena");
  // las 64 son las más cercanas al foco (paseando: la cámara, en el origen)
  const d2 = id => { const c = m.g.copas[id - 1000]; return c.x * c.x + c.y * c.y; };
  const puestas = l.filter(x => x.finca === "hituelo" && x.pieza !== "cohete" && x.copas_id !== 1005).map(x => d2(x.copas_id)).sort((a, b) => a - b);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  let peor = 0; grupo.children.forEach(o => { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); peor = Math.max(peor, v.x * v.x + v.z * v.z); } });
  assert.ok(Math.sqrt(peor) <= Math.sqrt(puestas[63]) + 2 + 1e-6, "ninguna más lejos que la 64.ª más cercana (más el radio de copa): " + Math.sqrt(peor) + " / " + Math.sqrt(puestas[63]));
  // cada instancia, en la copa de su olivo, a 0,62-0,78 de su altura sobre el suelo (10 m)
  grupo.children.forEach(o => { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); assert.ok(v.y >= 10 + 4 * 0.62 - 1e-6 && v.y <= 10 + 4 * 0.78 + 1e-6, "altura " + v.y); } });
  assert.ok(grupo.children.every(o => o.castShadow === false && o.raycast() === undefined), "sin sombras ni rayos");
  assert.ok(grupo.children.every(o => o.boundingSphere && o.boundingSphere.radius > 0), "el volumen de las instancias, recalculado");
  m.d.libera(api); m.n.suelta();
});

test("componente: solo se reescribe si cambia algo; sigue al foco (paseo, vista aérea, VR); la exageración reescribe; una lista nueva quita lo que ya no está", { skip: SIN_THREE }, async () => {
  const m = mundo(), api = m.d.monta(m.n); await m.listo();
  // el olivo 0 (−105, −105) con luces y el 465 (0, 0 en la rejilla: 15 + 15·30) con un lazo
  m.Bus.emite("decoraciones:cambian", { lista: lista([0], "luces").concat(lista([465], "lazo")) }); api.tarde(0.5);
  let e = api.estado(); assert.deepStrictEqual([e.elegidas, { ...e.porPieza }], [1, { lazo: 1 }], "paseando en el origen, solo el lazo cerca (las luces, a 148 m)");
  const r0 = e.reescrituras; api.tarde(0.5); api.tarde(0.5); assert.strictEqual(api.estado().reescrituras, r0, "nada nuevo, nada que escribir");
  api.tarde(4); assert.strictEqual(api.estado().reescrituras, r0 + 1, "cada 4 s se repega (relieve fino recién llegado)");
  // vista aérea mirando a las luces
  m.E.paseando = false; m.g.objetivo.set(-105, 0, 105); api.tarde(0.5);
  e = api.estado(); assert.deepStrictEqual({ ...e.porPieza }, { luces: 1 }, "en la vista aérea manda lo que se mira");
  const luces = m.scene.getObjectByName("decoración luces"), lazo = m.scene.getObjectByName("decoración lazo");
  assert.ok(luces.visible && luces.count === 1 && !lazo.visible && lazo.count === 0, "la malla sin instancias, oculta (0 llamadas)");
  assert.deepStrictEqual(dibujo(m.scene), { llamadas: 1, triangulos: 40 });
  // en VR, la cabeza
  m.g.VRX.on = true; m.g.VRX.cab.set(0, 1.6, 0); api.tarde(0.5); assert.deepStrictEqual({ ...api.estado().porPieza }, { lazo: 1 }); m.g.VRX.on = false; m.E.paseando = true;
  // la exageración: a la altura de la escena
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  api.tarde(0.5); lazo.getMatrixAt(0, m4); const y1 = v.setFromMatrixPosition(m4).y;
  m.E.exag = 2; api.tarde(0.5); lazo.getMatrixAt(0, m4); assert.ok(Math.abs(v.setFromMatrixPosition(m4).y - 2 * y1) < 1e-4, "× exag");
  // la familia quita el lazo: la lista nueva ya no lo trae
  m.Bus.emite("decoraciones:cambian", { lista: lista([0], "luces") }); api.tarde(0.5);
  assert.deepStrictEqual([api.estado().elegidas, lazo.visible, dibujo(m.scene).llamadas], [0, false, 0]);
  m.d.libera(api); m.n.suelta();
});

test("componente: la ficha del olivo dice la decoración y que es ilustrativa; libera() lo suelta todo y deja la escena como estaba", { skip: SIN_THREE }, async () => {
  const m = mundo(), api = m.d.monta(m.n); await m.listo();
  m.Bus.emite("decoraciones:cambian", { lista: lista([465, 466, 467, 468, 469, 470], k => PIEZAS[k]) }); api.tarde(0.5);
  assert.strictEqual(m.complementos.length, 1, "un complemento de la ficha común (no hay ficha propia)");
  const f = m.ficha("olivo:hituelo:1465");
  assert.deepStrictEqual({ ...f.filas[1] }, { k: "Decoración", v: "Flores", de: "ilustrativa: la eligió tu familia; no la mide el gemelo" });
  assert.match(m.ficha("olivo:hituelo:1466").filas[1].de, /familia de esa haza/);
  assert.strictEqual(m.ficha("olivo:hituelo:1").filas.length, 1, "sin decoración, nada"); assert.strictEqual(m.ficha("olivo:hituelo:i5").filas.length, 1, "id provisional, nada");
  assert.strictEqual(dibujo(m.scene).llamadas, 6, "las seis piezas a la vista: 6 llamadas");
  // ?debug
  const d = { lineas: [] }; m.Bus.emite("depura:lineas", d); assert.match(d.lineas[0], /^Decoraciones: 6 llamadas · 6 piezas · 188 triángulos \(ilustrativas\)$/);
  assert.strictEqual(typeof m.g.window.__decoraciones, "function"); assert.strictEqual(m.g.window.__decoraciones().elegidas, 6);
  m.g.window.__decoraciones("libera"); assert.deepStrictEqual(m.libera, ["decoraciones-olivo"], "el gancho de las pruebas libera por el registro");
  // libera: 6 geometrías, 6 InstancedMesh y 2 materiales (con luz y sin ella)
  let n = 0; const orig = THREE.EventDispatcher.prototype.dispatchEvent;
  THREE.EventDispatcher.prototype.dispatchEvent = function (e) { if (e && e.type === "dispose") n++; return orig.call(this, e); };
  try { m.d.libera(api); m.n.suelta(); } finally { THREE.EventDispatcher.prototype.dispatchEvent = orig; }
  assert.strictEqual(n, 6 + 6 + 2, "dispose de geometrías, mallas instanciadas y materiales: " + n);
  assert.strictEqual(m.scene.children.length, 0, "la escena como estaba"); assert.strictEqual(m.complementos.length, 0, "la ficha como estaba");
  assert.ok(!m.Bus.hay("decoraciones:cambian") && !m.Bus.hay("depura:lineas")); assert.strictEqual(m.g.window.__decoraciones, undefined);
  api.tarde(0.5); assert.strictEqual(m.scene.children.length, 0, "liberado, no vuelve a crear nada"); assert.doesNotThrow(() => m.d.libera(api));
});

test("el módulo no habla con la api ni con otro host, no usa HTML ni tiene globales fuera de lo suyo, y rotula lo ilustrativo", () => {
  const codigo = FUENTE.replace(/\/\/.*$/gm, "");
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|https?:\/\//.test(codigo), "sin peticiones: la lista llega por el Bus");
  assert.ok(!/innerHTML|document\.|eval\(|new Function/.test(codigo));
  assert.ok((codigo.match(/import\(/g) || []).length === 1 && codigo.includes(IMPORTA), "un solo import(): mergeGeometries de three");
  assert.match(FUENTE, /ILUSTRATIVA/);
});
