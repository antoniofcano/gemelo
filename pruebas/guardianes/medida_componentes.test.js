"use strict";
// C11 + O2 (pruebas/medida_componentes.js): el generador de encargos del banco y el lector «con menos sin», con resultados SINTÉTICOS (no son medidas: números
// inventados para comprobar el cálculo). Sin Chrome ni banco. Las cifras reales las da quien coordina con `npm run medida:componentes` y el banco.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, propia, lee, fs, path } = require("./_util");
const M = require(path.join(RAIZ, "pruebas", "medida_componentes.js"));

const COMPS = [
  { id: "fauna-olivar", fichero: "x", url: "fauna", defecto: true, presupuesto: { llamadas: 40, triangulos: 13000 } },
  { id: "ruidoso", fichero: "x", url: "ruido", defecto: true, presupuesto: { llamadas: 1, triangulos: 100 } },
  { id: "extra", fichero: "x", url: "extra", defecto: false, presupuesto: { llamadas: 5, triangulos: 500 } },
  { id: "libre", fichero: "x", url: "libre", defecto: true, presupuesto: null },
  { id: "interno", fichero: "x", url: null, defecto: true, presupuesto: { llamadas: 0, triangulos: 0 } },
];
const med = (llamadas, triangulos, heapMB, extra) => Object.assign({ llamadas, triangulos, puntos: 0, heapMB }, extra);
const var_ = (lejos, cerca) => ({ errores: [], fallos: [], parcial: false, csp: [], medidas: { lejos, cerca } });

test("los manifiestos salen del código del motor, con su bandera y su presupuesto", () => {
  const ms = M.manifiestos();
  assert.ok(ms.length >= 10, "hay componentes");
  const f = ms.find(c => c.id === "suelo-fondo");
  assert.deepStrictEqual([f.url, f.defecto, f.presupuesto.llamadas], ["fondo", true, 1]);
  for (const c of ms) assert.ok(c.url, c.id + " tiene bandera de URL (si no, no se puede medir con y sin)");
});

test("el generador de encargos: base + una variante por componente con su bandera cambiada, y el encargo de O2", () => {
  const e = M.encargos({ raiz: RAIZ, comps: COMPS, escenarios: ["lejos", "cerca"], de: "prueba" });
  assert.deepStrictEqual(e.componentes.variantes, [
    { nombre: "base", consulta: "" }, { nombre: "sin-fauna-olivar", consulta: "?fauna=0" }, { nombre: "sin-ruidoso", consulta: "?ruido=0" },
    { nombre: "con-extra", consulta: "?extra=1" }, { nombre: "sin-libre", consulta: "?libre=0" }]);   // «interno» no tiene bandera: no se mide
  assert.deepStrictEqual(e.componentes.escenarios, ["lejos", "cerca"]); assert.strictEqual(e.componentes.desglose, true);
  assert.deepStrictEqual(e.olivos.variantes, [{ nombre: "olivos0", consulta: "?olivos=0" }, { nombre: "gen", consulta: "?olivos=gen" }]);
  assert.ok(e.olivos.escenarios.includes("cerca") && e.olivos.desglose);
  assert.strictEqual(M.encargos({ raiz: RAIZ, comps: COMPS, solo: ["fauna", "extra"] }).componentes.variantes.length, 3, "--solo por id o por bandera");
  assert.throws(() => M.encargos({ raiz: RAIZ, comps: COMPS, solo: ["no-existe"] }), /desconocido/);
});

test("con --dry no deja nada en la cola y los escenarios son los del banco", () => {
  const r = require("child_process").spawnSync(process.execPath, [path.join(RAIZ, "pruebas", "medida_componentes.js"), "encarga", "--raiz", RAIZ, "--dry", "--solo", "fondo"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stderr);
  const e = JSON.parse(r.stdout);
  assert.strictEqual(e.componentes.variantes[1].consulta, "?fondo=0");
  assert.deepStrictEqual(e.componentes.escenarios, ["lejos", "cerca"]);
  const { TODOS_ESCENARIOS } = require("./_navegador");
  for (const k of ["componentes", "olivos"]) for (const n of e[k].escenarios) assert.ok(TODOS_ESCENARIOS[n], "escenario conocido: " + n);
});

test("«con menos sin»: encendido por defecto = base − sin; apagado por defecto = con − base; ruido y huecos", () => {
  const vars = {
    base: var_(med(100, 50000, 40), med(200, 90000, 60)),
    "sin-fauna-olivar": var_(med(90, 47000, 38), med(170, 80000, 59)),     // fauna cuesta 10/3000/2 y 30/10000/1
    "sin-ruidoso": var_(med(98, 49000, 40), med(190, 85000, 60)),          // 2 llamadas: por encima de su 1 declarada
    "con-extra": var_(med(104, 50400, 41), med(203, 90450, 61)),           // extra: +4/+400, +3/+450: dentro de 5/500
  };
  const d = M.delta(COMPS[0], vars, ["lejos", "cerca"]);
  assert.deepStrictEqual([d.lejos.llamadas, d.lejos.triangulos, d.lejos.heapMB, d.cerca.llamadas, d.cerca.triangulos], [10, 3000, 2, 30, 10000]);
  assert.strictEqual(M.veredicto(COMPS[0], d), "ok");
  assert.strictEqual(M.veredicto(COMPS[1], M.delta(COMPS[1], vars, ["lejos", "cerca"])), "por encima");
  const de = M.delta(COMPS[2], vars, ["lejos", "cerca"]);
  assert.deepStrictEqual([de.lejos.llamadas, de.cerca.triangulos], [4, 450]); assert.strictEqual(M.veredicto(COMPS[2], de), "ok");
  assert.strictEqual(M.veredicto(COMPS[3], M.delta(COMPS[3], vars, ["lejos", "cerca"])), "sin declarar");
  assert.strictEqual(M.delta(COMPS[3], vars, ["lejos"]).lejos.llamadas, null, "variante sin medir: null, no 0");
  assert.strictEqual(M.veredicto(Object.assign({}, COMPS[3], { presupuesto: { llamadas: 1, triangulos: 1 } }), M.delta(COMPS[3], vars, ["lejos"])), "sin medida");
});

test("la tabla Markdown de componentes: una fila por componente con bandera, deltas con signo y veredicto", () => {
  const vars = {
    base: var_(med(100, 50000, 40), med(200, 90000, 60)),
    "sin-fauna-olivar": var_(med(90, 47000, 38), med(170, 80000, 59)),
    "sin-ruidoso": Object.assign(var_(med(98, 49000, 40), med(190, 85000, 60)), { parcial: true }),
  };
  const t = M.tablaComponentes(vars, COMPS);
  const filas = t.split("\n").filter(l => l.startsWith("| `"));
  assert.strictEqual(filas.length, 4, "interno no sale; los demás sí");
  assert.ok(filas[0].startsWith("| `fauna-olivar` | `?fauna=0` | 40 / 13.000 |"), filas[0]);
  assert.ok(filas[0].includes("| +10 | +3000 | 0 | +2 | +30 | +10000 | 0 | +1 | ok |"), filas[0]);
  assert.ok(filas[1].includes("(parcial)") && filas[1].endsWith("por encima |"), filas[1]);
  assert.ok(filas[2].endsWith("sin medida |"), "sin variante medida: lo dice: " + filas[2]);
  assert.match(t, /Base: lejos 100\/50\.000\/0\/40/);
  assert.match(M.tablaComponentes({}, COMPS), /Falta la variante «base»/);
});

test("el lector junta resultados de una carpeta o de un fichero, y la tabla completa trae C11 y O2", () => {
  const dir = propia("medida-comp");
  const res = (id, variantes) => { const d = path.join(dir, id); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "resultado.json"), JSON.stringify({ id, variantes })); return d; };
  const filas = [
    ["principal · #9 Group [arboles] › gen-corteza:BatchedMesh · MeshStandardMaterial", 1], ["sombra · #9 Group [arboles] › gen-corteza:BatchedMesh · MeshDepthMaterial", 1],
    ["principal · #9 Group [arboles] › gen-olivas:BatchedMesh · MeshStandardMaterial", 1], ["principal · #3 Mesh [3dtiles] · MeshBasicMaterial", 12]];
  const gen = var_(med(150, 90000, 50), med(160, 700000, 70, { generados: { estado: "activo", info: { llamadas: 6, triangulos: 135000, arboles: 2 } },
    desglose: { total: 15, info: 15, filas }, piezasGen: { piezas: [{ pieza: "gen-corteza", tipo: "BatchedMesh", instancias: 40, triangulos: 80000, puntos: 0, llamadas: 2, sombra: true }, { pieza: "gen-olivas", tipo: "BatchedMesh", instancias: 9000, triangulos: 20000, puntos: 0, llamadas: 1, sombra: false }],
      niveles: { E0: { olivos: 1, triangulos: 100000 }, E1: { olivos: 1, triangulos: 35000 } }, info: {} } }));
  const c = res("a", { base: var_(med(100, 50000, 40), med(200, 90000, 60)), "sin-fauna-olivar": var_(med(90, 47000, 38), med(170, 80000, 59)) });
  const o = res("b", { olivos0: var_(med(150, 90000, 49), med(120, 300000, 55)), gen });
  assert.deepStrictEqual(Object.keys(M.leeResultados([c, o]).variantes).sort(), ["base", "gen", "olivos0", "sin-fauna-olivar"]);
  assert.deepStrictEqual(Object.keys(M.leeResultados([dir]).variantes).sort(), ["base", "gen", "olivos0", "sin-fauna-olivar"], "carpeta de carpetas");
  assert.deepStrictEqual(Object.keys(M.leeResultados([path.join(c, "resultado.json")]).variantes).sort(), ["base", "sin-fauna-olivar"]);
  assert.throws(() => M.leeResultados([path.join(dir, "nada")]), /no existe/);
  assert.deepStrictEqual(M.desglosePorPieza(gen.medidas.cerca), { "gen-corteza": { principal: 1, sombra: 1 }, "gen-olivas": { principal: 1, sombra: 0 } });
  const t = M.tabla([c, o], "2099-01-01", COMPS);
  assert.match(t, /^### Medida por componente \(C11\) y por objeto \(O2\) \(2099-01-01/);
  assert.match(t, /\| cerca \| 120 → 160 \(\+40\) \| 300\.000 → 700\.000 \(\+400000\)/);
  assert.match(t, /\| `gen-corteza` \| BatchedMesh \| 40 \| 80\.000 \| 0 \| 1 \| 1 \|/);
  assert.match(t, /\| E0 \| 1 \| 100\.000 \|/);
  assert.match(M.tablaOlivos({ gen }), /Faltan las variantes/);
});

test("el gancho de las piezas existe en Generados y en el desglose del banco; el guion y la documentación lo mencionan", () => {
  assert.match(lee("apps/web/motor/07ab_generados.js"), /piezas: piezas, estado:/);
  assert.match(lee("pruebas/guardianes/_navegador.js"), /piezasGen = await p\.evaluate/);
  assert.strictEqual(JSON.parse(lee("package.json")).scripts["medida:componentes"], "node pruebas/medida_componentes.js");
  assert.match(lee("doc/operacion/TESTING.md"), /medida:componentes/);
  assert.match(lee("doc/sistema/MEDIDAS.md"), /Medida por componente \(C11\) y por objeto \(O2\)/);
});
