"use strict";
// La escena 3D Tiles del motor (apps/web/motor/04b_escena3d.js, ADR-0015): desde T8 fase 2 (decisión 79) la ÚNICA. Con D.tileset en el índice
// (o ?tileset= relativo) la carga; sin él o si falla (otro origen, error de carga, la librería), la finca se queda sin escena: estado «sin»,
// UN console.error que empieza por «escena 3D Tiles:» y el aviso #sinEscena visible, con el Mundo cargado igual (pacto de T8 fase 2, §1).
// Sin navegador: versión fijada y única de 3DTilesRendererJS (apps/web y el visor de tuberia/tiles3d), que su build solo importe three (así usa
// la misma), los perfiles VR con su errorTarget, los enganches del motor y 04c_olivos_tiles.js evaluado con dobles.
// Con navegador (Chrome headless + SwiftShader: llamadas, triángulos y memoria, NUNCA fps): el fixture de Hituelo con el cliente web
// (pruebas/guardianes/_pagina.js) tres veces: con tileset, sin él y con uno de otro host; y la de con tileset servida sin tileset/ (fallo de
// carga). Servidas con la CSP de infra/Caddyfile en modo solo informe, como en producción.
// Sin Chrome, playwright-core, Python, Vite o las dependencias de tuberia/tiles3d, lo de navegador se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, propia, python, fixture, ejecuta, fs, path } = require("./_util");
const { ESCENARIOS, motivoSalto, lanza, sirve, esCsp } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");
const { vuela, cajaDatos, comparaRelieve } = require("./_recorrido");

const WEB = path.join(RAIZ, "apps", "web"), MOTOR = path.join(WEB, "motor"), T3D = path.join(RAIZ, "tuberia", "tiles3d");
const lee = f => fs.readFileSync(f, "utf8"), json = f => JSON.parse(lee(f));
const V = json(path.join(WEB, "package.json")).dependencies["3d-tiles-renderer"];
const MIDE = !!process.env.GEMELO_MIDE;
const PRES = json(path.join(RAIZ, "pruebas", "presupuesto.json"));
const DEPS_T3D = ["@gltf-transform/core", "meshoptimizer", "sharp", "three", "proj4"].filter(d => !fs.existsSync(path.join(T3D, "node_modules", d, "package.json")));
const SALTO = motivoSalto("la escena 3D Tiles en el motor") || saltoPagina("la escena 3D Tiles en el motor") || (DEPS_T3D.length ? "faltan dependencias de tuberia/tiles3d (" + DEPS_T3D.join(", ") + "): la escena 3D Tiles en el motor NO se ha comprobado" : null);
// los avisos que da cualquier tileset 1.1 con 3DTilesRendererJS 0.5.3 y los del driver de SwiftShader (como tiles3d.test.js)
const CONOCIDOS = [/GL Driver Message/, /tiles versions at 1\.1 or higher have limited support/];

test("3DTilesRendererJS: versión exacta en apps/web/package.json, la misma que el visor de tuberia/tiles3d y la del package-lock", () => {
  assert.match(V || "", /^\d+\.\d+\.\d+$/, "3d-tiles-renderer debe ir con versión exacta en apps/web/package.json");
  assert.strictEqual(json(path.join(T3D, "visor", "package.json")).dependencies["3d-tiles-renderer"], V, "el visor y el motor deben usar la misma");
  const lock = json(path.join(WEB, "package-lock.json"));
  assert.strictEqual(lock.packages["node_modules/3d-tiles-renderer"].version, V, "package-lock.json no está al día (npm install --package-lock-only)");
});

test("su build ES solo importa «three» y «three/addons/…» (Vite se los resuelve a la three del motor) y exporta TilesRenderer y Scheduler", t => {
  const dirs = [path.join(WEB, "node_modules", "3d-tiles-renderer"), path.join(T3D, "visor", "node_modules", "3d-tiles-renderer")].filter(d => fs.existsSync(path.join(d, "package.json")) && json(path.join(d, "package.json")).version === V);
  if (!dirs.length) return t.skip("3d-tiles-renderer " + V + " no instalado (cd apps/web && npm i): sus importaciones NO se han comprobado");
  const b = path.join(dirs[0], "build"), vistos = new Set(), externos = new Set();
  (function sigue(f) {
    if (vistos.has(f)) return; vistos.add(f);
    for (const m of lee(path.join(b, f)).matchAll(/(?:from|import)\s*"([^"]+)"/g)) { if (m[1].startsWith("./")) sigue(m[1].slice(2)); else externos.add(m[1]); }
  })("index.js");
  assert.deepStrictEqual([...externos].filter(x => x !== "three" && !x.startsWith("three/addons/")), [], "importaciones que el importmap no resuelve");
  const idx = lee(path.join(b, "index.js"));
  for (const n of ["TilesRenderer", "Scheduler"]) assert.ok(new RegExp("as " + n + "\\b").test(idx), "el build no exporta " + n);
});

test("el motor: 04b_escena3d.js es la única escena (sin ESC3D ni ?escena=), arranca con D.tileset o ?tileset= y si no falla con «falta el tileset»; cada perfil VR trae su errorTarget", () => {
  const m = lee(path.join(MOTOR, "04b_escena3d.js")), vr = lee(path.join(MOTOR, "29_vr.js")), fin = lee(path.join(MOTOR, "90_final.js"));
  assert.ok(!fs.existsSync(path.join(MOTOR, "04_terreno.js")), "04_terreno.js se borró en T8 fase 2 (decisión 79)");
  const todo = fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).map(f => lee(path.join(MOTOR, f))).join("\n");
  assert.ok(!/\bESC3D\b|\bTerreno\.|escena=clasica/.test(todo), "quedan ESC3D, Terreno o ?escena=clasica en el motor");
  assert.match(m, /if \(pedida\) arranca\(\); else falla\(new Error\("falta el tileset"\)\)/);
  assert.match(m, /console\.error\("escena 3D Tiles: "/, "el fallo se dice con UN console.error que empieza por «escena 3D Tiles:»");
  assert.ok(!/fetch\(/.test(m), "la escena 3D Tiles no hace fetch propio (lo hace la librería, al mismo origen)");
  assert.match(m, /import\("3d-tiles-renderer"\)/, "la librería se pide con import()");
  const P = /var VR_PERFILES = (\[.*?\]);/.exec(vr); assert.ok(P, "no encuentro VR_PERFILES");
  const perfiles = Function("return " + P[1])();
  assert.ok(perfiles.every(p => p.e > 0), "cada perfil VR necesita e (errorTarget en px)");
  assert.ok(perfiles.every((p, i) => i === 0 || p.e > perfiles[i - 1].e), "el errorTarget debe crecer al bajar de perfil");
  assert.match(vr, /Escena3D\.perfil\(p\)/); assert.match(vr, /Escena3D\.perfil\(null\)/);
  assert.match(fin, /Escena3D\.actualiza\(\);\s*\n\s*renderer\.render/, "Escena3D.actualiza() va justo antes de dibujar");
});

// ---------------------------------------------------------------- los olivos del tileset (04c_olivos_tiles.js), sin navegador
// El módulo entero (no solo su trozo puro) se evalúa en Node con dobles de lo que consume (D, copas, Escena3D, gArboles) y mallas falsas hechas
// con los atributos de instancia de los glb del fixture (leídos con @gltf-transform): resolución por huella, máscara, tipos, huellas que no casan y
// el camino sin crypto.subtle. Lo que el motor de verdad hace con three (count, needsUpdate, visibilidad) se mira en el navegador, más abajo.
const FUENTE_OT = lee(path.join(MOTOR, "04c_olivos_tiles.js"));
const DEPS_OT = ["@gltf-transform/core", "@gltf-transform/extensions"].filter(d => !fs.existsSync(path.join(T3D, "node_modules", d, "package.json")));
const SALTO_OT = !python() ? "No hay Python 3: los olivos del tileset NO se han comprobado" : DEPS_OT.length ? "faltan dependencias de tuberia/tiles3d (" + DEPS_OT.join(", ") + "): los olivos del tileset NO se han comprobado" : null;
let tilesetOT = null;
async function tilesetFixture() {   // fixture + tileset + atributos de instancia de cada glb con olivos, una vez
  if (tilesetOT) return tilesetOT;
  const { pathToFileURL } = require("url");
  const FIX = fixture(), SAL = propia("olivos-tiles");
  const g = ejecuta(process.execPath, [path.join(T3D, "genera.mjs"), "--entrada", path.join(FIX, "hituelo"), "--salida", SAL, "--catalogo", path.join(RAIZ, "modelos", "olivos", "fixture", "catalogo.json")]);
  assert.strictEqual(g.status, 0, "genera.mjs falló:\n" + g.stdout + g.stderr);
  const gen = await import(pathToFileURL(path.join(T3D, "genera.mjs")).href), I = gen.leeContrato(path.join(FIX, "hituelo")).I, TS = json(path.join(SAL, "tileset.json"));
  const req = m => require(require.resolve(m, { paths: [T3D] })), core = req("@gltf-transform/core"), ext = req("@gltf-transform/extensions");
  const io = new core.NodeIO().registerExtensions([ext.EXTMeshGPUInstancing]), nodos = [];
  (function recorre(n) { if (n.content && n.extras && n.extras.gemelo) nodos.push(n); (n.children || []).forEach(recorre); })(TS.root);
  const glb = [];
  for (const n of nodos) {
    const doc = await io.readBinary(new Uint8Array(fs.readFileSync(path.join(SAL, n.content.uri))));
    const nodo = doc.getRoot().listNodes().find(x => x.getExtension("EXT_mesh_gpu_instancing")), X = nodo.getExtension("EXT_mesh_gpu_instancing"), A = k => X.getAttribute(k);
    const tri = nodo.getMesh().listPrimitives()[0].getIndices().getCount() / 3;
    glb.push({ nodo: n, tri, T: A("TRANSLATION").getArray(), C: A("_COLOR_0").getArray(), IX: A("_INDICE_COPA").getArray(), TI: A("_TIPO").getArray() });
  }
  return (tilesetOT = { I, TS, glb, gen });
}
// una InstancedMesh de mentira con lo que lee 04c: count, instanceMatrix, instanceColor y los atributos de instancia de la geometría
function mallaFalsa(x) {
  const n = x.IX.length, M = new Float32Array(16 * n);
  for (let i = 0; i < n; i++) { M[i * 16] = M[i * 16 + 5] = M[i * 16 + 10] = M[i * 16 + 15] = 1; M.set(x.T.subarray(i * 3, i * 3 + 3), i * 16 + 12); }
  const at = (a, s) => ({ array: a.slice(), itemSize: s, isInstancedBufferAttribute: true, needsUpdate: false });
  const geo = { attributes: { position: { array: new Float32Array(3), itemSize: 3 }, _INDICE_COPA: at(x.IX, 1), _TIPO: at(x.TI, 1) }, index: { count: x.tri * 3 }, getAttribute(k) { return this.attributes[k]; }, dispose() { this.liberada = true; } };
  return { isInstancedMesh: true, count: n, visible: true, instanceMatrix: at(M, 16), instanceColor: at(x.C, 3), geometry: geo, material: { dispose() {} }, fuera: false, removeFromParent() { this.fuera = true; }, dispose() {}, computeBoundingSphere() {} };
}
function cargaOT(o) {   // evalúa 04c_olivos_tiles.js con sus dependencias de mentira; o: {I, pedida (false: la escena está «sin»), copasId, subtle}
  const { I } = o, ganchos = {}, avisos = [];
  const copas = I.copas.map((c, i) => { const rm = c[3].reduce((a, b) => a + b, 0) / 8; return { i, x: c[0], y: c[1], h: c[2], oliv: !(c[2] > 8 || (c[2] > 6.5 && rm < 2.2)) }; });   // la regla de 02_mundo.js
  const f = new Function("D", "copas", "Escena3D", "gArboles", "crypto", "console", "\"use strict\";\n" + FUENTE_OT + "\nreturn { OlivosTiles: OlivosTiles, IdTiles: IdTiles };");
  const r = f({ copas: I.copas, copas_id: o.copasId === undefined ? I.copas_id : o.copasId }, copas, { engancha: g => Object.assign(ganchos, g), resumen: () => ({ estado: o.pedida === false ? "sin" : "cargando" }) }, { visible: true },
    o.subtle === null ? undefined : { subtle: require("crypto").webcrypto.subtle }, { warn: s => avisos.push(s) });
  return Object.assign(r, { ganchos, avisos, copas });
}
const espera = async (cond, ms = 5000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("tiempo agotado"); await new Promise(r => setTimeout(r, 10)); } };
function cargaTeselas(ot, F, cambia) {   // como 3DTilesRendererJS: la raíz y luego un load-model por glb
  ot.ganchos.alRaiz(F.TS);
  return F.glb.map(x => { const m = mallaFalsa(x), tile = { extras: cambia ? cambia(x) : x.nodo.extras, content: { uri: x.nodo.content.uri }, traversal: { visible: true } }; return { x, m, tile, seQueda: ot.ganchos.alModelo({ traverse: fn => fn(m) }, tile) }; });
}

test("04c_olivos_tiles: el trozo puro (huella, copas de cada tesela) da lo mismo que el generador", async t => {
  if (SALTO_OT) return t.skip(SALTO_OT);
  const F = await tilesetFixture(), { IdTiles, copas } = cargaOT({ I: F.I }), subtle = require("crypto").webcrypto.subtle, ids = Uint32Array.from(F.gen.idsDe(F.I));
  assert.strictEqual(await IdTiles.huella(IdTiles.ids(F.I.copas.length, F.I.copas_id), subtle), F.TS.extras.gemelo.huella_registro, "huella del registro");
  assert.ok(F.glb.length >= 2, "el fixture debería dar varias teselas con olivos");
  for (const x of F.glb) {
    const e = x.nodo.extras.gemelo, lst = IdTiles.copasDe(copas, e.cuadro);
    assert.deepStrictEqual([...lst], F.gen.listaCopas(F.I, ...e.cuadro), x.nodo.content.uri + ": la lista de copas del motor no es la del generador");
    assert.strictEqual(await IdTiles.huella(IdTiles.de(ids, lst), subtle), e.huella, x.nodo.content.uri + ": huella");
  }
});

test("04c_olivos_tiles: sin escena (estado «sin») no se engancha; con ella resuelve cada instancia por huella, guarda _TIPO y la máscara aparta los de cerca sin perder ninguno", async t => {
  if (SALTO_OT) return t.skip(SALTO_OT);
  const F = await tilesetFixture();
  const off = cargaOT({ I: F.I, pedida: false });
  assert.deepStrictEqual(Object.keys(off.ganchos), [], "sin escena no debe engancharse a Escena3D");
  assert.strictEqual(off.OlivosTiles.dibuja(), false); assert.strictEqual(off.OlivosTiles.resumen().estado, "apagado");

  const ot = cargaOT({ I: F.I }), O = ot.OlivosTiles, L = cargaTeselas(ot, F);
  assert.ok(L.every(c => c.seQueda), "con el registro correcto, 04c se queda con los olivos de cada glb");
  assert.ok(L.every(c => !c.m.visible), "hasta comprobar la huella, las mallas no se ven");
  await espera(() => O.resumen().hechas === L.length);
  assert.deepStrictEqual(ot.avisos, []); assert.strictEqual(O.dibuja(), true); assert.strictEqual(O.resumen().porHuella, true);
  ot.ganchos.fotograma(); assert.ok(L.every(c => c.m.visible), "comprobadas, se ven");
  const nombre = F.TS.extras.gemelo.tipos;
  for (const { x, m } of L) {
    const lst = F.gen.listaCopas(F.I, ...x.nodo.extras.gemelo.cuadro);
    for (let i = 0; i < m.count; i++) {   // instancia → k → g: el sitio de la instancia es el del olivo g del registro
      const k = m.geometry.attributes._INDICE_COPA.array[i], g = lst[k], c = F.I.copas[g], p = m.instanceMatrix.array.subarray(i * 16 + 12, i * 16 + 15);
      assert.ok(Math.abs(p[0] - c[0]) < 1e-3 && Math.abs(p[2] + c[1]) < 1e-3, x.nodo.content.uri + ": instancia " + i + " no está en su olivo");
      const tp = O.tipo(g), tc = F.I.copas_tipo ? F.I.copas_tipo[g] : -1;
      assert.strictEqual(tp.nombre, nombre[String(tp.n)]); assert.strictEqual(tp.nombre, tc < 0 ? null : "fixture-sintetico:" + tc, "tipo del olivo " + g);
    }
  }
  assert.deepStrictEqual(O.tipos().nombres, nombre);
  // la máscara: los olivos a menos de 40 m de uno los dibuja el motor de cerca
  const triAntes = O.triangulos(), base = L.map(c => ({ M: c.m.instanceMatrix.array.slice(), C: c.m.instanceColor.array.slice(), IX: c.m.geometry.attributes._INDICE_COPA.array.slice() }));
  const c0 = ot.copas.find(c => c.oliv), cerca = ot.copas.filter(c => c.oliv && Math.hypot(c.x - c0.x, c.y - c0.y) < 40).map(c => c.i), marcados = new Set(cerca);
  assert.ok(cerca.length >= 3, "el fixture debería tener olivos juntos");
  O.cerca(cerca);
  let apartados = 0;
  L.forEach(({ x, m }, j) => {
    const lst = F.gen.listaCopas(F.I, ...x.nodo.extras.gemelo.cuadro), n = x.IX.length, ix = m.geometry.attributes._INDICE_COPA.array;
    for (let i = 0; i < n; i++) assert.strictEqual(marcados.has(lst[ix[i]]), i >= m.count, x.nodo.content.uri + ": hueco " + i + " (count " + m.count + ")");
    apartados += n - m.count;
    assert.deepStrictEqual([...ix].sort((a, b) => a - b), [...base[j].IX].sort((a, b) => a - b), "la máscara no pierde ni repite instancias");
    for (let i = 0; i < n; i++) { const i0 = base[j].IX.indexOf(ix[i]);   // cada instancia se lleva su matriz y su color
      assert.deepStrictEqual([...m.instanceMatrix.array.subarray(i * 16, i * 16 + 16)], [...base[j].M.subarray(i0 * 16, i0 * 16 + 16)]);
      assert.deepStrictEqual([...m.instanceColor.array.subarray(i * 3, i * 3 + 3)], [...base[j].C.subarray(i0 * 3, i0 * 3 + 3)]); }
    if (n > m.count) assert.ok(m.instanceMatrix.needsUpdate && m.instanceColor.needsUpdate && m.geometry.attributes._TIPO.needsUpdate, "needsUpdate en todos los atributos de instancia");
  });
  assert.ok(apartados >= cerca.length, "cada olivo de cerca debe apartarse al menos en una tesela (en las hojas está una vez)");
  for (const g of cerca) assert.ok(O.instanciasDe(g).length && O.instanciasDe(g).every(r => r.apartado), "olivo " + g + " de cerca sin apartar");
  assert.strictEqual(O.resumen().apartadas, apartados);
  const triTras = O.triangulos(); assert.ok(triTras < triAntes, "los apartados no cuentan en el tope: " + triAntes + " → " + triTras);
  O.cerca([]);   // vuelve exactamente a lo del glb
  L.forEach(({ m }, j) => { assert.strictEqual(m.count, base[j].IX.length); assert.deepStrictEqual(m.instanceMatrix.array, base[j].M); assert.deepStrictEqual(m.geometry.attributes._INDICE_COPA.array, base[j].IX); });
  assert.strictEqual(O.triangulos(), triAntes);
  // la librería descarga una tesela: se olvida (la libera ella)
  ot.ganchos.alSoltar({ traverse() {} }); assert.strictEqual(O.resumen().teselas, L.length, "soltar otra escena no olvida ninguna");
});

test("04c_olivos_tiles: un json que no es el del tileset no resuelve nada (vuelven los olivos del motor); una tesela con otra huella se retira; sin crypto.subtle, por índice y con aviso", async t => {
  if (SALTO_OT) return t.skip(SALTO_OT);
  const F = await tilesetFixture(), I = F.I;
  // registro cambiado: dos ids intercambiados (Hituelo del fixture trae copas_id)
  assert.ok(I.copas_id, "el fixture de Hituelo debería traer copas_id");
  const ids = I.copas_id.slice(); [ids[0], ids[1]] = [ids[1], ids[0]];
  const otro = cargaOT({ I, copasId: ids }), Lo = cargaTeselas(otro, F);
  await espera(() => otro.OlivosTiles.resumen().estado === "sin");
  assert.strictEqual(otro.OlivosTiles.dibuja(), false); assert.ok(Lo.every(c => c.m.fuera), "con un registro que no casa, las mallas del tileset se retiran");
  assert.ok(otro.avisos.some(a => /huella del registro/.test(a)), otro.avisos.join("\n"));
  const m = mallaFalsa(F.glb[0]); assert.strictEqual(otro.ganchos.alModelo({ traverse: fn => fn(m) }, { extras: F.glb[0].nodo.extras, content: { uri: "x" } }), false, "tras apagarse, 04b retira los olivos de los glb nuevos");
  // un json sin copas_id con un tileset que identifica por copas_id
  const sinId = cargaOT({ I, copasId: null }); sinId.ganchos.alRaiz(F.TS); assert.strictEqual(sinId.OlivosTiles.resumen().estado, "sin");
  // una tesela con otra huella
  const una = cargaOT({ I }), mala = F.glb[0].nodo.content.uri;
  const L2 = cargaTeselas(una, F, x => x.nodo.content.uri === mala ? { gemelo: Object.assign({}, x.nodo.extras.gemelo, { huella: "sha256:" + "0".repeat(64) }) } : x.nodo.extras);
  await espera(() => una.OlivosTiles.resumen().hechas === L2.length - 1 && una.OlivosTiles.resumen().teselas === L2.length - 1);
  assert.ok(L2.find(c => c.tile.content.uri === mala).m.fuera, "la tesela con otra huella se retira");
  assert.ok(L2.filter(c => c.tile.content.uri !== mala).every(c => !c.m.fuera)); assert.strictEqual(una.OlivosTiles.dibuja(), true);
  assert.ok(una.avisos.some(a => a.includes(mala)), una.avisos.join("\n"));
  // sin crypto.subtle
  const sin = cargaOT({ I, subtle: null }), L3 = cargaTeselas(sin, F);
  await espera(() => sin.OlivosTiles.resumen().hechas === L3.length);
  assert.strictEqual(sin.OlivosTiles.resumen().porHuella, false); assert.ok(sin.avisos.some(a => /crypto\.subtle/.test(a)));
});

test("los enganches de 04c: 04b solo retira los olivos si 04c no se queda con ellos, 07b no dibuja sus niveles 1 y 2 con el tileset y le pasa los de cerca", () => {
  const b = lee(path.join(MOTOR, "04b_escena3d.js")), a = lee(path.join(MOTOR, "07b_arboles.js"));
  assert.match(b, /if \(!\(ganchos\.alModelo && ganchos\.alModelo\(e\.scene, e\.tile\)\)\) quitaOlivos\(e\.scene\)/);
  assert.match(b, /"dispose-model"/); assert.match(b, /ganchos\.alApagar/); assert.match(b, /ganchos\.fotograma\(\)/);
  assert.match(FUENTE_OT, /if \(estado === "esperando"\) Escena3D\.engancha\(/, "04c solo se engancha si la escena no está «sin»");
  assert.match(a, /if \(TIL\) return;/, "07b: con el tileset, los olivos de media y larga distancia no van a sus niveles 1 y 2");
  assert.match(a, /OlivosTiles\.cerca\(cerca\)/); assert.match(a, /TOPE_TRI - triTil/, "los triángulos del tileset se restan del tope de los generados");
});

// ---------------------------------------------------------------- en el navegador
// se prepara (fixture, tileset, páginas y Chrome) solo cuando la primera prueba de navegador lo pide: con --test-name-pattern sobre las de
// arriba no se arranca Chrome. Cuatro servidores: la página con tileset; la misma sin tileset/ (404: fallo de carga); una sin tileset en el
// índice; una con un tileset de otro host en el índice.
let nav, peticiones = [], preparado = null;
const srv = {}, base = {};
const prepara = () => preparado || (preparado = preparaYa());
async function preparaYa() {
  const con = montaPagina({ finca: "hituelo" }), sin = montaPagina({ finca: "hituelo", conTileset: false }), otro = montaPagina({ finca: "hituelo", tileset: "https://ejemplo.invalid/tileset.json" });
  for (const [k, carpeta, opc] of [["con", con.carpeta, { peticiones }], ["falla", con.carpeta, { peticiones, bloquea: /^\/tileset\// }], ["sin", sin.carpeta, { peticiones }], ["otro", otro.carpeta, { peticiones }]]) {
    srv[k] = await sirve(carpeta, opc); base[k] = "http://127.0.0.1:" + srv[k].address().port + "/";
  }
  const n = await lanza();
  if (cerrado) { await n.close(); throw new Error("las pruebas acabaron (por tiempo) mientras se esperaba el turno del banco"); }
  nav = n;
}
// Si las pruebas acaban por tiempo mientras prepara() aún espera el turno del banco, el Chrome que llega después no debe quedarse abierto con el
// turno cogido (pasó el 2026-10-29: el proceso se quedó una hora parado con el turno y bloqueó el banco). `cerrado` hace que se cierre al llegar.
let cerrado = false;
test.after(async () => { cerrado = true; if (nav) await nav.close(); for (const s of Object.values(srv)) s.close(); });

// abre una de las páginas (k: con, falla, sin, otro); espera al Mundo y a que la escena cargue o se quede «sin». errores: de página, de consola
// (salvo los «[Report Only]» de la CSP, que van a csp) y respuestas ≥ 400
async function abre(q, mockXR, k = "con") {
  const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [], avisos = [], csp = [];
  if (mockXR) await p.addInitScript({ content: lee(path.join(RAIZ, "pruebas", "mock_xr.js")) });
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", x => { const s = x.text(); if (esCsp(s)) csp.push(s.slice(0, 300)); else if (x.type() === "error") errores.push("CONSOLE " + s.slice(0, 300)); else if (x.type() === "warning" && !CONOCIDOS.some(re => re.test(s))) avisos.push(s.slice(0, 300)); });
  p.on("response", r => { if (r.status() >= 400) errores.push(r.status() + " " + r.url()); });
  await p.goto(base[k] + "index.html?debug" + q);
  await p.waitForFunction(() => window.__g && window.__g.listo() && (window.__g.Escena3D.resumen().estado === "sin" || window.__g.Escena3D.listo()), null, { timeout: 90000, polling: 500 });
  return { p, errores, avisos, csp };
}
// lo que la CSP de Caddy, al imponerse, rompería de la escena: scripts o conexiones a otro sitio (las fuentes y estilos de la plantilla, no)
const cspEscena = csp => csp.filter(s => /script-src|connect-src|worker-src/.test(s));
async function escena(p, nombre) {
  const e = ESCENARIOS[nombre];
  await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
  await p.waitForTimeout(800);
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && (window.__g.Escena3D.resumen().estado === "sin" || window.__g.Escena3D.listo()), null, { timeout: 90000, polling: 500 });
  await p.waitForTimeout(800);
  return p.evaluate(() => { const g = window.__g, r = g.renderer.info; return { llamadas: r.render.calls, triangulos: r.render.triangles, puntos: r.render.points, geometrias: r.memory.geometries, texturas: r.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, escena3d: g.Escena3D.resumen() }; });
}

// Criterio 4 del ADR-0015: el relieve dibujado frente a Mundo.suelo. De dónde sale la diferencia (medido con este fixture y con Hituelo real,
// doc/sistema/MEDIDAS.md): NO del marco (transform de la raíz, giro de ejes, exageración, z0), que en los vértices de borde de cada glb (no se
// simplifican y son la misma interpolación que Mundo.suelo) da < 1 cm en todos los niveles; sino de la geometría de cada nivel: paso de la
// rejilla (1 m en hojas, 2 m, 4 m) y simplificación de meshoptimizer (0,05 m en hojas, el doble por nivel), que el generador mide y declara
// en el geometricError de la tesela. Así que: vértice de borde < 1 cm siempre; un punto cualquiera, ≤ el geometricError de la tesela que lo
// dibuja (+ 1 cm de redondeo); y en las hojas eso es ≤ 0,05 m (el error de simplificación de las hojas, --error-hoja).
const TOL_MARCO = 0.01, ERROR_HOJA = 0.05;
function rejilla(cx, cy, r, paso) { const P = []; for (let y = cy - r; y <= cy + r + 1e-9; y += paso) for (let x = cx - r; x <= cx + r + 1e-9; x += paso) P.push([+x.toFixed(3), +y.toFixed(3)]); return P; }
function casaRelieve(t, cmp) {
  const porLado = {};
  for (const [n, filas] of Object.entries(cmp)) {
    const con = filas.filter(f => f[2]);
    assert.ok(con.length >= 4, n + ": el rayo no encuentra el relieve dibujado en casi ningún punto: " + JSON.stringify(filas.slice(0, 6)));
    for (const [x, y, uri, L, err, dI, dV] of con) {
      const q = porLado[L] || (porLado[L] = { puntos: 0, vertices: 0, maxInterior: 0, maxVertice: 0, maxError: 0 });
      q.puntos++; q.maxInterior = Math.max(q.maxInterior, dI); q.maxError = Math.max(q.maxError, err);
      assert.ok(dI <= err + TOL_MARCO, n + ": relieve dibujado en " + x + "," + y + " (" + uri + ") a " + dI.toFixed(3) + " m de la CPU, más que el geometricError de su tesela (" + err + " m)");
      if (dV !== null) { q.vertices++; q.maxVertice = Math.max(q.maxVertice, dV); assert.ok(dV < TOL_MARCO, n + ": en el vértice de borde junto a " + x + "," + y + " (" + uri + ") el relieve dibujado está a " + dV.toFixed(4) + " m de la CPU (≥ 1 cm: el marco no casa)"); }
    }
  }
  if (MIDE) t.diagnostic("relieve dibujado frente a Mundo.suelo, por lado de tesela (m): " + JSON.stringify(porLado));
  const hojas = Object.keys(porLado).map(Number).sort((a, b) => a - b)[0];
  assert.strictEqual(hojas, 128, "de cerca, el relieve debería dibujarlo una hoja de 128 m: " + JSON.stringify(porLado));
  assert.ok(porLado[128].maxInterior <= ERROR_HOJA + TOL_MARCO, "en las hojas, el relieve dibujado se separa " + porLado[128].maxInterior + " m de la CPU (> error de hoja " + ERROR_HOJA + " m)");
  assert.ok(Object.values(porLado).reduce((s, q) => s + q.vertices, 0) >= 4, "casi ningún vértice de borde comprobado: " + JSON.stringify(porLado));
}

// Sin escena (pacto de T8 fase 2, §1): sin tileset en el índice, con uno de otro host (se rechaza sin pedirlo) o si no se puede leer (404). En los
// tres: estado «sin» con su motivo, el aviso #sinEscena visible, el Mundo cargado (el suelo de la CPU responde y el panel está) y la escena de
// siempre no vuelve (no existe). Sin tileset y con otro host: EXACTAMENTE un console.error, el de 04b; con el 404, además el del fallo de la tesela.
const SIN_ESCENA = [
  ["sin tileset en el índice", "sin", /falta el tileset/, 1],
  ["con un tileset de otro host", "otro", /mismo origen/, 1],
  ["con el tileset que no se puede leer (404)", "falla", /no se pudo leer|tileset/, null],
];
for (const [nombre, k, motivo, nErrores] of SIN_ESCENA) {
  test(nombre + ": la finca se queda sin escena (estado «sin», un console.error, aviso #sinEscena) y el Mundo se carga igual", { timeout: 240000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    await prepara();
    peticiones.length = 0;
    const { p, errores, csp } = await abre("", false, k);
    try {
      const m = await escena(p, "lejos");
      if (MIDE) t.diagnostic(nombre + ", lejos: " + JSON.stringify(m));
      assert.strictEqual(m.escena3d.estado, "sin"); assert.match(m.escena3d.motivo, motivo);
      const consola = errores.filter(e => e.startsWith("CONSOLE "));
      assert.ok(consola.length >= 1 && consola.every(e => /^CONSOLE escena 3D Tiles: /.test(e) || /Failed to load resource/.test(e)), "errores de consola: " + JSON.stringify(errores));
      assert.ok(consola.some(e => motivo.test(e)), "el console.error debe decir el motivo: " + JSON.stringify(consola));
      if (nErrores !== null) assert.deepStrictEqual(errores.length, nErrores, "exactamente un error (el console.error de 04b): " + JSON.stringify(errores));
      assert.ok(!errores.some(e => e.startsWith("PAGEERROR")), "el motor no se rompe");
      const aviso = await p.evaluate(() => { const el = document.getElementById("sinEscena"); return el ? { visible: !el.hidden, texto: el.textContent } : null; });
      assert.ok(aviso && aviso.visible, "el aviso #sinEscena debe verse: " + JSON.stringify(aviso));
      assert.match(aviso.texto, /Esta finca no tiene escena/);
      if (k === "sin") assert.match(aviso.texto, /falta el tileset/);
      const mundo = await p.evaluate(() => { const g = window.__g; return { suelo: g.suelo(-130, -125), olivos: g.Arboles.resumen() }; });
      assert.ok(Number.isFinite(mundo.suelo), "el Mundo (CPU) responde: " + JSON.stringify(mundo));
      assert.deepStrictEqual(cspEscena(csp), [], "la CSP de Caddy rompería la escena");
      if (k !== "falla") assert.ok(!peticiones.some(u => /tileset|\.glb$/.test(u)), nombre + ": no se pide nada del tileset");
      assert.ok(peticiones.some(u => /\/t\/[^/]+\.json$/.test(u)), "el Mundo pide sus teselas (decisión 38)");
    } finally { await p.close(); }
  });
}

test("con D.tileset en el índice: carga el tileset sin errores, desde lejos baja de la raíz vacía, cabe en el presupuesto y el relieve dibujado casa con el de la CPU", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  await prepara();
  peticiones.length = 0;
  const { p, errores, avisos, csp } = await abre("");
  try {
    const med = {};
    for (const n of ["lejos", "cerca", "nube"]) med[n] = await escena(p, n);
    if (MIDE) t.diagnostic("escena 3D Tiles: " + JSON.stringify(med));
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    assert.deepStrictEqual(cspEscena(csp), [], "la CSP de Caddy rompería la escena");
    assert.deepStrictEqual(avisos, [], "avisos no conocidos");
    for (const [n, m] of Object.entries(med)) {
      assert.strictEqual(m.escena3d.estado, "activo", n + ": " + m.escena3d.motivo);
      assert.ok(m.escena3d.visibles > 0, n + ": ninguna tesela visible (¿se queda en la raíz sin contenido?)");
    }
    // presupuesto de dibujo (pruebas/presupuesto.json, «fixture» de Hituelo; los mismos topes que carga.test.js)
    for (const [n, m] of Object.entries(med)) {
      const tope = PRES.fixture.hituelo[n];
      for (const k of ["llamadas", "triangulos", "puntos"]) assert.ok(m[k] <= tope[k], n + ": " + k + " " + m[k] + " > tope " + tope[k] + " (si sube a propósito, explícalo y sube pruebas/presupuesto.json)");
      if (m.heapMB >= 0) assert.ok(m.heapMB <= tope.heapMB, n + ": heap " + m.heapMB + " MB > tope " + tope.heapMB);
    }
    assert.ok(peticiones.some(u => u.endsWith("/tileset/tileset.json")) && peticiones.some(u => u.endsWith(".glb")), "no se pidió el tileset");
    assert.ok(peticiones.some(u => /\/t\/[^/]+\.json$/.test(u)), "el json de las teselas se sigue pidiendo (decisión 38)");
    const r = await p.evaluate(() => { let inst = 0; window.__g.Escena3D.grupo().traverse(o => { if (o.isInstancedMesh) inst++; }); return { inst }; });
    // F1d paso 4 (04c_olivos_tiles.js): de media y larga distancia, los olivos del glb; de cerca, los del motor y, en el tileset, apartados
    assert.ok(r.inst > 0, "los olivos del glb deberían quedarse en la escena");
    await escena(p, "cerca");   // la última medida es la de Nube (sin árboles): se vuelve a la de cerca, en modo Gemelo
    await p.waitForTimeout(1600);   // una vuelta de reclasifica (07b) tras la última cámara
    const ot = await p.evaluate(() => { const g = window.__g, dobles = []; let deCerca = 0;
      Object.keys(g.Arboles.celdas).forEach(k => { const c = g.Arboles.celdas[k]; if (c.g && c.g.visible) c.arr.forEach(o => { deCerca++; g.OlivosTiles.instanciasDe(o.i).forEach(x => { if (!x.apartado) dobles.push(o.i + "@" + x.uri); }); }); });
      return { resumen: g.OlivosTiles.resumen(), arboles: g.Arboles.resumen(), deCerca, dobles: dobles.slice(0, 20) }; });
    if (MIDE) t.diagnostic("olivos del tileset (cerca): " + JSON.stringify(ot));
    assert.strictEqual(ot.resumen.estado, "activo", ot.resumen.motivo); assert.strictEqual(ot.resumen.porHuella, true, "en 127.0.0.1 hay crypto.subtle");
    assert.ok(ot.resumen.hechas > 0 && ot.resumen.dibujadas > 0, "ningún olivo del tileset dibujado: " + JSON.stringify(ot.resumen));
    assert.strictEqual(ot.arboles.nivel1 + ot.arboles.nivel2, 0, "con el tileset, 07b no dibuja sus niveles 1 y 2");
    assert.ok(ot.deCerca > 0, "de cerca, el motor debería dibujar su nivel 0");
    assert.deepStrictEqual(ot.dobles, [], "olivos dibujados dos veces (motor de cerca y tileset)");
    assert.ok(ot.resumen.apartadas > 0, "de cerca, alguna instancia del tileset debería estar apartada");
    // criterio 4 del ADR-0015 (el relieve casa con Mundo.suelo), de cerca (hojas de 128 m) y desde lejos (niveles gruesos): ver casaRelieve
    const cmp = { cerca: await comparaRelieve(p, rejilla(-130, -125, 30, 6)) };
    await escena(p, "lejos"); cmp.lejos = await comparaRelieve(p, rejilla(0, -128, 250, 37));
    casaRelieve(t, cmp);
  } finally { await p.close(); }
});

// Criterio 3 del ADR-0015: ningún fotograma sin relieve en los datos mientras llegan las teselas. Como empieza quien abre la página: vista de
// lejos hasta que carga; luego un vuelo bajo (órbita a 45 m) de punta a punta de la finca y otro más alto en diagonal, SIN esperar a que carguen
// las teselas (2 fotogramas por salto). En cada salto, Escena3D.sondea(): 7 × 5 rayos desde la cámara y dos verticales (bajo la cámara y bajo
// el objetivo); cada rayo que en la CPU corta el relieve dentro de los datos debe dar con el relieve dibujado. Objetivo: 0 sin relieve.
test("en un vuelo de punta a punta sin esperar a la carga, ningún rayo desde la cámara se queda sin relieve dentro de los datos (criterio 3)", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  await prepara();
  const { p, errores } = await abre("");
  try {
    await escena(p, "lejos");
    // el vuelo bajo va por y = −128, el borde entre hojas del fixture: sus rayos verticales pasan por la arista común de dos glb (ver sondea)
    const [x0, y0, x1, y1] = await cajaDatos(p), m = 16;
    const bajo = await vuela(p, { A: [x0 + m, (y0 + y1) / 2], B: [x1 - m, (y0 + y1) / 2], pasos: 40, dist: 45, el: 0.5 });
    const alto = await vuela(p, { A: [x1 - m, y0 + m], B: [x0 + m, y1 - m], pasos: 30, dist: 160, el: 0.7, az: 0.6 });
    if (MIDE) t.diagnostic("vuelo: " + JSON.stringify({ bajo, alto }));
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    for (const [n, v] of Object.entries({ bajo, alto })) {
      assert.ok(v.enDatos >= v.pasos * 5, n + ": muy pocos rayos caen en los datos (" + v.enDatos + "): el vuelo no pasa por la finca");
      assert.strictEqual(v.sinRelieve, 0, n + ": " + v.sinRelieve + " rayos sin relieve dibujado dentro de los datos en " + v.pasosConHueco + " de " + v.pasos + " saltos: " + JSON.stringify(v.fallos));
    }
  } finally { await p.close(); }
});

// VR con el WebXR simulado (pruebas/mock_xr.js) y la escena por defecto, que con D.tileset es la 3D Tiles (F1d paso 7; T8 fase 1). Comprueba la LÓGICA (cada perfil de 29_vr.js aplica su errorTarget a la escena 3D Tiles,
// el relieve fino se apaga con el perfil bajo, se anda y se sale restaurando); no dice nada de fps ni de comodidad en un casco. OPCIONAL (GEMELO_VR=1): con
// SwiftShader la VR completa es inestable ("Target crashed", ver vr.test.js), por eso no bloquea la puerta; pide el turno del banco como cualquier prueba de navegador.
test("VR simulada con la escena por defecto (3D Tiles): entra, anda, cada perfil aplica su errorTarget y apaga el relieve fino, y sale restaurando", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 para la VR simulada con la escena 3D Tiles (inestable con SwiftShader)");
  await prepara();
  const perfiles = [...lee(path.join(MOTOR, "29_vr.js")).match(/var VR_PERFILES = \[(.*?)\];/)[1].matchAll(/[ {,]e: (\d+)/g)].map(x => +x[1]);
  assert.ok(perfiles.length >= 2, "no se leyeron los errorTarget de VR_PERFILES");
  const { p, errores } = await abre("", true);
  const dbg = () => p.evaluate(() => window.__vrDebug()), et = () => p.evaluate(() => window.__g.Escena3D.resumen().errorTarget);
  const fot = async n => { const f0 = await p.evaluate(() => window.__mockXR.fotogramas); await p.waitForFunction(f => window.__mockXR.fotogramas >= f, f0 + n, { timeout: 60000, polling: 100 }); };
  try {
    const fuera = await et();
    assert.strictEqual(await p.evaluate(() => window.__g.Escena3D.resumen().estado), "activo");
    await p.waitForSelector("#btnVR", { timeout: 30000 }); await p.click("#btnVR");
    await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 60000, polling: 200 });
    let d = await dbg();
    assert.strictEqual(d.nivel, 0); assert.strictEqual(d.perfiles, perfiles.length); assert.strictEqual(d.bump, 1, "perfil 0: relieve fino encendido");
    assert.strictEqual(await et(), perfiles[0], "perfil 0: errorTarget");
    await p.evaluate(() => window.__mockXR.ejes("left", 0, -1)); await fot(10); await p.evaluate(() => window.__mockXR.ejes("left", 0, 0)); await fot(2);
    const d1 = await dbg(); assert.ok(Math.hypot(d1.cabeza[0] - d.cabeza[0], d1.cabeza[2] - d.cabeza[2]) > 0.3, "no se movió al andar");
    for (let n = 1; n < perfiles.length; n++) {
      await p.evaluate(k => window.__vrPerfil(k), n); await fot(2);
      d = await dbg(); assert.strictEqual(d.nivel, n);
      assert.strictEqual(await et(), perfiles[n], "perfil " + n + ": errorTarget");
      assert.strictEqual(d.bump, 0, "perfil " + n + ": el relieve fino debe estar apagado");
    }
    await p.evaluate(() => window.__vrPerfil(0)); await fot(2);
    assert.strictEqual(await et(), perfiles[0], "al volver al perfil 0"); assert.strictEqual((await dbg()).bump, 1);
    await p.evaluate(k => window.__vrPerfil(k), perfiles.length - 1); await fot(2);
    await p.waitForFunction(() => window.__g.Escena3D.resumen().visibles > 0, null, { timeout: 60000, polling: 500 });
    await p.evaluate(() => window.__mockXR.sesion.end()); await p.waitForFunction(() => !window.__vrDebug().on, null, { timeout: 30000, polling: 200 });
    d = await dbg(); assert.strictEqual(d.bump, 1, "al salir, relieve fino restaurado");
    assert.strictEqual(await et(), fuera, "al salir, el errorTarget de escritorio");
    assert.deepStrictEqual(errores, [], "errores de consola, de página o de CSP");
  } finally { await p.close(); }
});
