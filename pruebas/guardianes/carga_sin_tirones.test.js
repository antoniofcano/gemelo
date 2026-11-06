"use strict";
// AG-1.5 «carga sin tirones»: el reloj de carga compartido, en Node (sin Chrome ni Docker). Desde A1-10 la Cola y CargaPuro viven en
// apps/web/src/nucleo/cola.ts y sus pruebas puras (presupuesto por fotograma, equivalencia con la Cola de antes, deuda, dueño, parseTiles y
// prioridadRed) están en Vitest, en apps/web/src/nucleo/cola.test.ts. Aquí queda lo que cruza con el legado:
//   · CargaPuro.base con la política real del Aparato (01a_aparato) y que 07b_arboles toma de ahí su presupuesto y descuenta la deuda de la Cola;
//   · la cola propia de los generados (07ab_generados: corre y compiladoG): sin renderer el lote sale en el mismo next() (lo montado no cambia); con
//     un compileAsync que tarda, el trabajo duerme sin gastar el presupuesto en vueltas vacías, los demás siguen, y al acabar sale el mismo lote;
//   · que 04b_escena3d usa CargaPuro.parseTiles y CargaPuro.prioridadRed (la pista de red de la descarga de teselas) y cobra como deuda lo que hace en load-model.
// HONESTIDAD: los ms son de un reloj de mentira (deterministas), no de Chrome ni de un aparato (doc/sistema/MEDIDAS.md).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { modulo } = require("./_aparato");

const MOTOR = path.join(RAIZ, "apps", "web", "motor"), lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");
const G07 = require("./_fuente").fuenteMotor("07ab_generados.js")   /* A3-2a: talón + generados*.ts */, B04 = require("./_fuente").fuenteMotor("04b_escena3d.js")   /* A3-1b: talón + escena-tiles.ts */, A07 = lee("07b_arboles.js");
const { AparatoPuro } = modulo({});

const { pathToFileURL } = require("url");

// CargaPuro vive ahora en apps/web/src/nucleo/cola.ts (A1-10); node lo importa tal cual (TypeScript sin tipos, sin paso de compilación)
let CargaPuro, ColaGen;
test.before(async () => {
  ({ CargaPuro } = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "src", "nucleo", "cola.ts")).href));
  ColaGen = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "src", "mundos", "exterior", "generados-cola.ts")).href);   // A3-2a: la cola propia de los generados
});
// la regla de siempre de 07b_arboles.presupuestoBase (antes de AG-1.5)
const baseAntes = o => { const justo = o.emaDt > 0.034; if (o.faltan > 0 && !justo) return o.paseando ? 8 : 12; return justo ? (o.paseando ? 3 : 4.5) : (o.paseando ? 3.5 : 6); };

test("CargaPuro.base con la política real del Aparato: escritorio, lo de siempre; móvil y gafas ≤ cargaMs, VR ≤ cargaMsVr; y 07b_arboles la usa", () => {
  const esc = AparatoPuro.politica("escritorio", false), mov = AparatoPuro.politica("movil", false), q = AparatoPuro.politica("quest", false);
  assert.deepStrictEqual([esc.cargaMs, mov.cargaMs, q.cargaMs, esc.cargaMsVr], [12, 6, 6, 3]);
  for (const emaDt of [0.011, 0.03, 0.09]) for (const faltan of [0, 3]) for (const paseando of [false, true]) {
    const o = { emaDt, faltan, paseando }, b0 = baseAntes(o);
    assert.strictEqual(CargaPuro.base(Object.assign({ pol: esc }, o)), b0, "escritorio fuera de VR: igual que antes " + JSON.stringify(o));
    assert.strictEqual(CargaPuro.base(Object.assign({ pol: mov }, o)), Math.min(b0, 6));
    for (const pol of [esc, mov, q]) assert.strictEqual(CargaPuro.base(Object.assign({ pol, vr: true }, o)), Math.min(b0, 3), "en VR, el tope de VR");
  }
  assert.match(A07, /CargaPuro\.base\(oBase\)/, "07b_arboles toma su presupuesto de CargaPuro.base");
  assert.match(A07, /oBase\.vr = Aparato\.vr\(\); oBase\.deuda = Cola\.deuda\(\)/, "con la VR del Aparato y la deuda de la Cola");
});

// ---- la cola propia de los generados: corre y compiladoG de apps/web/src/mundos/exterior/generados-cola.ts (A3-2a; antes, sacados del texto de 07ab tal cual)
function colaGenerados(reloj, renderer) {
  const cola = ColaGen.creaColaPropia(reloj), entorno = () => ({ renderer, camara: {}, escena: {} });
  return { corre: cola.corre, compiladoG: g => ColaGen.compiladoG(g, entorno), encola: cola.encola, trabajos: { get length() { return cola.cuantos(); } }, gastado: cola.gastado };
}
function* construye(reloj, g, n) { for (let i = 0; i < n; i++) { reloj.t += 1; yield; } return g; }

test("generados: sin renderer (Node) el lote sale en el mismo next(); con compileAsync, duerme sin gastar y sale el MISMO lote", async () => {
  const reloj = { t: 0, now() { return this.t; } }, lote = { nombre: "lote" };
  // sin compileAsync: igual que construyeG solo (mismo número de rebanadas, mismo lote)
  let G = colaGenerados(reloj, undefined), sale = null;
  G.encola("Glote", -1, G.compiladoG(construye(reloj, lote, 5)), v => { sale = v; });
  let vueltas = 0; while (G.trabajos.length && vueltas < 100) { G.corre(1); vueltas++; }
  assert.strictEqual(sale, lote); assert.strictEqual(vueltas, 6, "5 yield + la vuelta final, como sin compiladoG");
  // con un compileAsync que no acaba hasta que se le dice
  let suelta, llamadas = [];
  const renderer = { compileAsync(o, c, s) { llamadas.push(o); return new Promise(r => { suelta = r; }); } };
  G = colaGenerados(reloj, renderer); sale = null; const otros = [];
  G.encola("Glote", -1, G.compiladoG(construye(reloj, lote, 3)), v => { sale = v; });
  G.encola("Gp1", 5, construye(reloj, "receta", 40), v => otros.push(v));
  for (let f = 0; f < 4; f++) G.corre(2);
  assert.deepStrictEqual(llamadas, [lote], "el lote acabado se compila una vez, antes de entrar en la escena");
  assert.strictEqual(sale, null, "mientras compila, el lote no se coloca");
  const t0 = reloj.t; G.corre(2); assert.ok(reloj.t - t0 > 0, "los demás trabajos siguen mientras el lote espera");
  // solo el lote esperando: corre no da vueltas vacías (el reloj no se mueve y vuelve enseguida)
  while (G.trabajos.length > 1) G.corre(50);
  const t1 = reloj.t; G.corre(5); assert.strictEqual(reloj.t, t1); assert.strictEqual(G.gastado(), 0, "esperar no gasta presupuesto");
  suelta(); await new Promise(r => setTimeout(r, 0));
  G.corre(2); assert.strictEqual(sale, lote, "acabada la compilación, sale el mismo lote"); assert.strictEqual(G.trabajos.length, 0);
  // si compileAsync falla (o lanza), el lote entra igual
  G = colaGenerados(reloj, { compileAsync() { throw new Error("sin contexto"); } }); sale = null;
  G.encola("Glote", -1, G.compiladoG(construye(reloj, lote, 1)), v => { sale = v; }); for (let f = 0; f < 4; f++) G.corre(5);
  assert.strictEqual(sale, lote);
  G = colaGenerados(reloj, { compileAsync() { return Promise.reject(new Error("no")); } }); sale = null;
  G.encola("Glote", -1, G.compiladoG(construye(reloj, lote, 1)), v => { sale = v; }); G.corre(5); await new Promise(r => setTimeout(r, 0)); G.corre(5);
  assert.strictEqual(sale, lote);
  assert.strictEqual((G07.match(/seguro\(compiladoG\(LT\.construyeG\(items\)\)\)/g) || []).length, 2, "los dos sitios que montan el lote pasan por compiladoG");
});

test("tileset: teselas analizadas a la vez por aparato y VR, y 04b usa CargaPuro", () => {
  const esc = AparatoPuro.politica("escritorio", false), mov = AparatoPuro.politica("movil", false), q = AparatoPuro.politica("quest", false);
  assert.deepStrictEqual([CargaPuro.parseTiles(esc, false), CargaPuro.parseTiles(mov, false), CargaPuro.parseTiles(q, false), CargaPuro.parseTiles(q, true), CargaPuro.parseTiles(null, false)], [5, 3, 3, 2, 5]);
  assert.match(B04, /tiles\.parseQueue\.maxJobs = d\.CargaPuro\.parseTiles\(POL, false\)/);
  assert.match(B04, /tiles\.parseQueue\.maxJobs = d\.CargaPuro\.parseTiles\(POL, !!s\)/, "al entrar y salir de VR");
  assert.match(B04, /tiles\.registerPlugin\(prioridadRed\(\)\)/);
  assert.match(B04, /return tiles\.fetchData\(u, /, "la descarga la sigue haciendo la librería (mismo origen)");
  // todas las escuchas de load-model (el relieve, el sombreado y, con ?bvh, el árbol de rayos de AG-1.6) se cobran como deuda
  const escuchas = (B04.match(/addEventListener\("load-model", /g) || []).length, cobradas = (B04.match(/addEventListener\("load-model", Cola\.cobra\("T", /g) || []).length;
  assert.ok(escuchas >= 2 && cobradas === escuchas, "lo que el motor hace en load-model se cobra como deuda: " + cobradas + " de " + escuchas);
});

test("el complemento de red de 04b: apunta la tesela de cada dirección, pide con su prioridad y suelta lo apuntado", async () => {
  // A3-1b: 04b vive en apps/web/src/mundos/exterior/escena-tiles.ts; se monta la escena entera con un TilesRenderer de mentira y se toma el complemento que registra
  const MUNDOS = require("./_mundos"), pedidas = [];
  class TilesFalso {
    constructor() { this.plugins = []; this.parseQueue = {}; this.group = {}; this.lruCache = { constructor: class { } }; TilesFalso.ultimo = this; }
    registerPlugin(p) { this.plugins.push(p); } setCamera() {} setResolutionFromRenderer() {} addEventListener() {} dispose() {}
    fetchData(u, op) { pedidas.push([u, op]); return Promise.resolve("ok"); }
  }
  const nada = () => {};
  MUNDOS.creaEscena3D({ THREE: { Vector3: class { }, Vector2: class { }, Raycaster: class { } , Matrix4: class { } }, D: { tileset: "tileset.json" }, Aparato: { politica: () => ({ clase: "escritorio" }) }, CargaPuro,
    TopeTilesPuro: { nuevo: () => ({}), DEF: {}, paso: nada }, TopeOlivos: {}, XrPerillas: {}, Cola: { cobra: (k, f) => f }, Mundo: {}, suelo: nada, renderer: {}, scene: { add: nada, remove: nada }, camera: {}, Estado: { exag: 1 },
    SombreadoTiles: () => null, OlivosTiles: () => null, busqueda: "", consola: { warn: nada, error: nada }, cargaTiles: () => Promise.resolve({ TilesRenderer: TilesFalso }) });
  for (let i = 0; i < 10 && !TilesFalso.ultimo; i++) await Promise.resolve();
  const P = TilesFalso.ultimo.plugins.find(p => p.name === "GEMELO_PRIORIDAD_RED"), tiles = TilesFalso.ultimo;
  assert.ok(P, "registra el complemento");
  assert.ok(!("priority" in P), "«priority» es el orden de los complementos en la librería: no se usa");
  const cerca = { traversal: { inFrustum: true, distanceFromCamera: 10 } }, fuera = { traversal: { inFrustum: false, distanceFromCamera: 10 } };
  assert.strictEqual(P.preprocessURL("a.glb", cerca), "a.glb"); assert.strictEqual(P.preprocessURL("b.glb", fuera), "b.glb");
  const op = { signal: "s" };
  await P.fetchData("a.glb", op); await P.fetchData("b.glb", op); await P.fetchData("tileset.json", op); await P.fetchData("a.glb", op);
  assert.deepStrictEqual(pedidas.map(p => p[1].priority), ["high", "low", undefined, undefined], "la raíz y lo ya pedido van con lo de la librería");
  assert.strictEqual(pedidas[0][1].signal, "s", "conserva las opciones de la librería (signal)"); assert.strictEqual(pedidas[2][1], op);
  assert.ok(!/(^|[^.\w])fetch\(/.test(B04), "04b no hace fetch propio");
  assert.ok(tiles);
});
