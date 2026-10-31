// Caché de recetas (O5), lo que no cubre cache.mjs: expulsar libera (gancho + dispose), invalidación por versión en disco, fallos del almacén
// (cuota llena, IndexedDB que no responde, que falla a mitad de sesión), propiedades con fast-check (la memoria nunca pasa del tope, es LRU de verdad,
// el disco nunca pasa de su tope) y una medida: acierto en memoria / en disco de una receta del tamaño de una E1.
// Escribe una línea JSON {mal, diag} (la lee pruebas/guardianes/olivo.test.js).
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OLIVO = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), "apps", "web", "olivo");
const mal = [], diag = {};
const exige = (c, m) => { if (!c) mal.push(m); };
const modulo = (...ruta) => import(pathToFileURL(path.join(OLIVO, "node_modules", ...ruta)).href);
let fc = null;
try { const m = await modulo("fast-check", "lib", "fast-check.js"); fc = m.default && m.default.assert ? m.default : m; } catch (e) { mal.push("sin fast-check (cd apps/web/olivo && npm ci): " + e.message); }
try { await modulo("fake-indexeddb", "auto", "index.mjs"); } catch (e) { mal.push("sin fake-indexeddb (cd apps/web/olivo && npm ci): " + e.message); }
const C = await import(pathToFileURL(path.join(OLIVO, "cache.js")).href);
const MB = 1048576, KB = 1024, receta = (kb, s) => ({ semilla: s, piezas: [{ atrib: { position: new Float32Array(Math.round(kb * KB / 4)) } }] });
const sinRetraso = { diferido: fn => fn() };
let n = 0; const nombre = () => "prueba-props-" + (++n);

// ---- expulsar libera
{
  const caidas = [], c = C.creaCache(Object.assign({ memMB: 1, disco: false, alExpulsar: (r, k, m) => caidas.push(k + ":" + m) }, sinRetraso));
  let disposes = 0; const r1 = receta(400, 1); r1.dispose = () => { disposes++; };
  c.pon("a", r1); c.pon("b", receta(400, 2)); c.pon("c", receta(400, 3));
  exige(caidas.join() === "a:lru" && disposes === 1, "expulsar 'a' debía llamar al gancho y a dispose() una vez: " + caidas + " " + disposes);
  c.pon("b", receta(400, 22));
  exige(caidas.join() === "a:lru,b:sustituida", "sustituir 'b' por otra receta debía soltar la vieja: " + caidas);
  c.pon("c", c.mem("c"));   // la misma receta otra vez: no se suelta a sí misma
  exige(caidas.length === 2, "poner la misma receta no debe soltarla: " + caidas);
  await c.vacia();
  exige(caidas.length === 4 && c.estado().memoria === 0 && c.estado().memoriaMB === 0, "vacia() debía soltar todo: " + caidas + JSON.stringify(c.estado()));
  const c2 = C.creaCache(Object.assign({ memMB: 1, disco: false, alExpulsar: () => { throw new Error("fallo del anfitrión"); } }, sinRetraso));
  c2.pon("a", receta(600, 1)); c2.pon("b", receta(600, 2));
  exige(!c2.mem("a") && c2.mem("b"), "un gancho que lanza no debe romper la caché");
}
// ---- invalidación por versión en disco: lo de otro GEN_VERSION / CACHE_VERSION se borra al abrir
{
  const nom = nombre(), vieja = "olivo|olivo-1|c1|E0|x|y|1|{}", otraC = C.PREFIJO_CLAVE.replace(/c\d+\|$/, "c" + (C.CACHE_VERSION + 7) + "|") + "E0|x|y|2|{}", buena = C.PREFIJO_CLAVE + "E0|x|y|3|{}";
  exige(otraC !== buena && vieja !== buena, "construcción de la prueba");
  const c1 = C.creaCache(Object.assign({ memMB: 5, nombre: nom }, sinRetraso));
  await c1.pon(buena, receta(100, 3));
  // se cuelan dos de otras versiones a mano, como las dejaría una versión anterior del código
  const { createStore, get, set } = await modulo("idb-keyval", "dist", "index.js");
  const st = createStore(nom, "recetas"), ix = await get("__indice", st);
  await set(vieja, receta(100, 1), st); await set(otraC, receta(100, 2), st); ix[vieja] = [102400, 1]; ix[otraC] = [102400, 2]; await set("__indice", ix, st);
  const c2 = C.creaCache(Object.assign({ memMB: 5, nombre: nom }, sinRetraso));
  exige((await c2.lee(buena)) && (await c2.lee(vieja)) === undefined && (await c2.lee(otraC)) === undefined, "tras abrir, la de esta versión se lee y las de otras no");
  exige(c2.estado().purgadas === 2 && c2.estado().disco === 1, "debía purgar 2 y quedar 1: " + JSON.stringify(c2.estado()));
  exige((await get(vieja, st)) === undefined && (await get(otraC, st)) === undefined, "las de otra versión debían salir del disco, no solo del índice");
}
// ---- fallos del almacén
{
  // cuota llena a mitad de sesión: la escritura falla, el disco se apaga con aviso y la memoria sigue
  const put0 = IDBObjectStore.prototype.put; let falla = false;
  IDBObjectStore.prototype.put = function (...a) { if (falla) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } return put0.apply(this, a); };
  const c = C.creaCache(Object.assign({ memMB: 5, nombre: nombre() }, sinRetraso));
  exige((await c.pon("ok", receta(50, 1))) === true && c.estado().enDisco, "con el almacén sano, pon() escribe");
  falla = true;
  exige((await c.pon("lleno", receta(50, 2))) === false, "con la cuota llena, pon() devuelve false sin lanzar");
  const e = c.estado(); exige(!e.enDisco && /Quota|falló/.test(e.aviso) && c.mem("lleno") && c.mem("ok"), "tras la cuota llena: sin disco, con aviso y con memoria: " + JSON.stringify(e));
  exige((await c.lee("nada")) === undefined, "tras apagarse, lee() sigue respondiendo");
  IDBObjectStore.prototype.put = put0;
  // lectura que falla
  const nom = nombre(), c1 = C.creaCache(Object.assign({ memMB: 5, nombre: nom }, sinRetraso)); await c1.pon("k", receta(50, 1));
  const get0 = IDBObjectStore.prototype.get; IDBObjectStore.prototype.get = function () { throw new Error("DataError de prueba"); };
  const c2 = C.creaCache(Object.assign({ memMB: 5, nombre: nom }, sinRetraso));
  exige((await c2.lee("k")) === undefined && !c2.estado().enDisco, "una lectura que falla da undefined y apaga el disco: " + JSON.stringify(c2.estado()));
  IDBObjectStore.prototype.get = get0;
  // IndexedDB que no responde nunca (bloqueado por otra pestaña): el plazo lo corta y se calcula como siempre
  const open0 = indexedDB.open; indexedDB.open = () => ({}); const t0 = performance.now();
  const c3 = C.creaCache(Object.assign({ memMB: 5, nombre: nombre() }, sinRetraso));
  const r = await c3.lee("loquesea"); const ms = performance.now() - t0;
  exige(r === undefined && !c3.estado().enDisco && /no responde/.test(c3.estado().aviso), "IndexedDB colgado: debe rendirse con aviso: " + JSON.stringify(c3.estado()));
  diag.colgado_ms = Math.round(ms); indexedDB.open = open0;
}
// ---- propiedades
if (fc) {
  const ops = fc.array(fc.record({ k: fc.integer({ min: 0, max: 9 }), kb: fc.integer({ min: 1, max: 600 }), uso: fc.boolean() }), { minLength: 1, maxLength: 60 });
  // la memoria nunca pasa del tope y los residentes coinciden con un modelo LRU de referencia, en bytes
  fc.assert(fc.property(ops, fc.integer({ min: 1, max: 3 }), (lista, tope) => {
    const c = C.creaCache(Object.assign({ memMB: tope, disco: false }, sinRetraso)), modelo = [];
    for (const o of lista) {
      const r = receta(o.kb, o.k), b = r.piezas[0].atrib.position.byteLength;
      if (o.uso) { c.mem("k" + o.k); const i = modelo.findIndex(m => m.k === "k" + o.k); if (i >= 0) modelo.push(modelo.splice(i, 1)[0]); }
      c.pon("k" + o.k, r);
      const i = modelo.findIndex(m => m.k === "k" + o.k); if (i >= 0) modelo.splice(i, 1);
      if (b <= tope * MB) { modelo.push({ k: "k" + o.k, b }); while (modelo.reduce((s, m) => s + m.b, 0) > tope * MB) modelo.shift(); }
      if (c.estado().memoriaMB > tope + 0.05) return false;
    }
    const dentro = []; for (let i = 0; i < 10; i++) if (c.mem("k" + i)) dentro.push("k" + i);
    return dentro.sort().join() === modelo.map(m => m.k).sort().join();
  }), { numRuns: 300, seed: 20261030 });
  // el disco nunca pasa de su tope y lo último escrito siempre está
  let corridas = 0;
  await fc.assert(fc.asyncProperty(fc.array(fc.record({ k: fc.integer({ min: 0, max: 7 }), kb: fc.integer({ min: 50, max: 400 }) }), { minLength: 1, maxLength: 14 }), async lista => {
    corridas++; const nom = nombre(), c = C.creaCache(Object.assign({ memMB: 20, discoMB: 1, nombre: nom }, sinRetraso));
    for (const o of lista) await c.pon("k" + o.k, receta(o.kb, o.k + 1));
    const c2 = C.creaCache(Object.assign({ memMB: 20, discoMB: 1, nombre: nom }, sinRetraso)), ult = lista[lista.length - 1];
    const hay = await c2.lee("k" + ult.k);
    return c2.estado().discoMB <= 1.05 && !!hay;
  }), { numRuns: 40, seed: 20261030 });
  diag.propiedades = { memoria: 300, disco: corridas };
}
// ---- medida: acierto de una receta del tamaño de una E1 (la generación real la mide generados_motor.mjs / el banco)
{
  const r = receta(2300, 7), k = C.claveReceta({ tipo: "centenario3", epoca: "envero", semilla: 7, parametros: { altura: 4.5 } }, "E1"), nom = nombre();
  const c = C.creaCache({ memMB: 150, discoMB: 300, nombre: nom, diferido: fn => fn() });
  const t0 = performance.now(); await c.pon(k, r); const escribe = performance.now() - t0;
  const med = async (f, veces) => { const t = []; for (let i = 0; i < veces; i++) { const a = performance.now(); await f(); t.push(performance.now() - a); } t.sort((x, y) => x - y); return +t[t.length >> 1].toFixed(3); };
  const mem = await med(() => c.lee(k), 200);
  const disco = await med(async () => { const f = C.creaCache({ memMB: 150, discoMB: 300, nombre: nom }); await f.lee(k); }, 15);
  diag.medida = { recetaMB: +(C.bytesReceta(r) / MB).toFixed(2), escribe_ms: +escribe.toFixed(1), acierto_memoria_ms: mem, acierto_disco_ms: disco, nota: "fake-indexeddb (memoria de Node): el disco real es más lento; Chrome en el banco lo mide" };
}
console.log(JSON.stringify({ mal, diag }));
