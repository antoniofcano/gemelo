// Caché de recetas de olivos generados (apps/web/olivo/cache.js, O5, contratos/olivo-generado.md §5), en Node:
//   - la clave es estable (orden de los parámetros, ruido de flotantes por debajo de 1e-6) y distinta por época, semilla, nivel, tipo y parámetros,
//     y lleva GEN_VERSION y CACHE_VERSION;
//   - memoria: LRU con tope en MB (suelta las más antiguas; usar una la hace la más reciente);
//   - sin IndexedDB (Node a secas) o con un IndexedDB que falla al abrir: solo memoria, con aviso, y todo sigue igual;
//   - disco (fake-indexeddb): lo escrito se lee desde otra caché (otra sesión), igual byte a byte; LRU con tope en MB.
// Escribe una línea JSON {mal: [...], diag} (la lee pruebas/guardianes/olivo.test.js).
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const mal = [], diag = {};
const exige = (c, m) => { if (!c) mal.push(m); };
const C = await import(pathToFileURL(path.join(OLIVO, "cache.js")).href);
const { GEN_VERSION } = await import(pathToFileURL(path.join(OLIVO, "version.js")).href);
const MB = 1048576, receta = (mb, s) => ({ v: "olivo-2", semilla: s, padre: new Int32Array(4), piezas: [{ atrib: { position: new Float32Array(Math.round(mb * MB / 4)) } }] });
const sinRetraso = { diferido: fn => fn() };

// ---- clave
const e = { tipo: "centenario3", epoca: "envero", semilla: 7, parametros: { altura: 4.5, copa: 3.2, rumbo: 45 } };
const k = C.claveReceta(e, "E0");
exige(k === C.claveReceta({ semilla: 7, epoca: "envero", tipo: "centenario3", parametros: { rumbo: 45, copa: 3.2 + 1e-9, altura: 4.5 } }, "E0"), "la clave cambia con el orden de los parámetros o con ruido < 1e-6");
exige(k.includes(GEN_VERSION) && k.includes("|c" + C.CACHE_VERSION + "|"), "la clave no lleva GEN_VERSION y CACHE_VERSION: " + k);
const otras = [C.claveReceta(Object.assign({}, e, { epoca: "flor" }), "E0"), C.claveReceta(Object.assign({}, e, { semilla: 8 }), "E0"), C.claveReceta(e, "E1"),
  C.claveReceta(Object.assign({}, e, { tipo: "adulto1" }), "E0"), C.claveReceta(Object.assign({}, e, { parametros: { altura: 4.5, copa: 6.4, rumbo: 45 } }), "E0")];
exige(new Set([k].concat(otras)).size === 6, "dos entradas distintas (época, semilla, nivel, tipo, copa) dan la misma clave");
exige(C.claveReceta(Object.assign({}, e, { semilla: 2 ** 32 - 1 }), "E0").includes("|4294967295|"), "semilla ≥ 2^31 mal en la clave");
diag.clave = k;

// ---- memoria (Node sin IndexedDB)
{
  const c = C.creaCache(Object.assign({ memMB: 1 }, sinRetraso));
  exige(!c.estado().enDisco && /sin IndexedDB/.test(c.estado().aviso), "sin IndexedDB debe quedarse en memoria y decirlo: " + JSON.stringify(c.estado()));
  c.pon("a", receta(0.4, 1)); c.pon("b", receta(0.4, 2));
  exige(c.mem("a") && c.mem("a").semilla === 1, "la receta a debe estar en memoria");
  c.pon("c", receta(0.4, 3));   // 1,2 MB > 1 MB: sale la menos usada (b, porque a se acaba de usar)
  exige(!c.mem("b") && c.mem("a") && c.mem("c"), "LRU en memoria: debía salir b (la menos reciente) y quedar a y c");
  exige(c.estado().memoria === 2 && c.estado().memoriaMB <= 1, "memoria por encima del tope: " + JSON.stringify(c.estado()));
  c.pon("enorme", receta(2, 9)); exige(!c.mem("enorme"), "una receta mayor que el tope no debe entrar");
  exige((await c.lee("nada")) === undefined && (await c.lee("a")).semilla === 1, "lee() sin disco: de memoria o undefined");
  exige((await c.pon("d", receta(0.1, 4))) === false, "sin disco, pon() devuelve false");
  diag.memoria = c.estado();
}
// ---- un IndexedDB que falla al abrir (modo privado, marco de artefacto): solo memoria
{
  globalThis.indexedDB = { open() { throw new Error("SecurityError: prohibido en este marco"); } };
  const c = C.creaCache(Object.assign({ memMB: 1 }, sinRetraso)); await new Promise(r => setTimeout(r, 10));
  exige(!c.estado().enDisco && /no disponible|falló/.test(c.estado().aviso), "IndexedDB que falla: debe quedarse en memoria: " + JSON.stringify(c.estado()));
  exige((await c.pon("a", receta(0.1, 1))) === false && c.mem("a") && (await c.lee("b")) === undefined, "con IndexedDB roto, la memoria sigue funcionando y no lanza");
  delete globalThis.indexedDB;
}
// ---- disco (fake-indexeddb)
try { await import("fake-indexeddb/auto"); } catch (e2) {
  try { await import(pathToFileURL(path.join(OLIVO, "node_modules", "fake-indexeddb", "auto", "index.mjs")).href); } catch (e3) { mal.push("sin fake-indexeddb (cd apps/web/olivo && npm i): el disco NO se ha comprobado"); }
}
if (globalThis.indexedDB) {
  const c1 = C.creaCache(Object.assign({ memMB: 10, discoMB: 1, nombre: "prueba-olivos" }, sinRetraso));
  exige(c1.estado().enDisco, "con IndexedDB, la caché debe ir a disco: " + JSON.stringify(c1.estado()));
  const r = receta(0.3, 11); r.piezas[0].atrib.position[5] = 3.25;
  await c1.pon("x", r); await c1.pon("y", receta(0.3, 12));
  const c2 = C.creaCache(Object.assign({ memMB: 10, discoMB: 1, nombre: "prueba-olivos" }, sinRetraso));   // otra sesión: memoria vacía
  exige(!c2.mem("x"), "una caché nueva no debe tener nada en memoria");
  const x = await c2.lee("x");
  exige(x && x.semilla === 11 && x.piezas[0].atrib.position instanceof Float32Array && x.piezas[0].atrib.position[5] === 3.25 && x.piezas[0].atrib.position.length === r.piezas[0].atrib.position.length,
    "lo leído del disco no es la receta escrita");
  exige(c2.mem("x"), "lo leído del disco pasa a memoria");
  await c2.pon("z", receta(0.3, 13)); await c2.pon("w", receta(0.3, 14));   // 1,2 MB > 1 MB: sale la más antigua del disco
  const c3 = C.creaCache(Object.assign({ memMB: 10, discoMB: 1, nombre: "prueba-olivos" }, sinRetraso));
  const hay = {}; for (const kk of ["x", "y", "z", "w"]) hay[kk] = !!(await c3.lee(kk));
  exige(hay.w && hay.z && !(hay.x && hay.y), "LRU en disco: con 4 × 0,3 MB y tope 1 MB debía salir alguna de las antiguas: " + JSON.stringify(hay));
  exige(c3.estado().discoMB <= 1, "disco por encima del tope: " + JSON.stringify(c3.estado()));
  diag.disco = { hay, estado: c3.estado() };
  await c3.vacia();
}
console.log(JSON.stringify({ mal, diag }));
