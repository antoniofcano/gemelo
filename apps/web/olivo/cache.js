// Caché de recetas de olivos generados (O5, contratos/olivo-generado.md §5): en memoria (LRU con tope en MB) y, si se puede, en disco (IndexedDB con
// idb-keyval, LRU con tope en MB). La receta es la misma para la misma clave: entrada canónica + nivel + GEN_VERSION + CACHE_VERSION.
// Sin IndexedDB (Node, modo privado, marco que lo prohíbe, cuota llena) solo hay memoria y se calcula como siempre; el motivo queda en estado().aviso.
import { createStore, get as get0, set as set0, delMany as delMany0, keys as keys0 } from "idb-keyval";
import { GEN_VERSION } from "./version.js";

/** Sube si cambia lo que da una receta sin que cambie GEN_VERSION (p. ej. niveles.js, que no entra en la huella olivo-2) o el formato guardado */
export const CACHE_VERSION = 2;   // 2: E1/E2 con tarjetas de racimo (O9b)
const INDICE = "__indice";
// idb-keyval abre la base al primer uso y puede lanzar ahí mismo (marco que prohíbe IndexedDB): todo pasa a promesa rechazada
// y cada operación lleva un plazo: un IndexedDB bloqueado (otra pestaña con una versión vieja, disco colgado) no abre ni falla nunca, y sin plazo la lectura no volvería
const PLAZO_MS = 4000;
const p = fn => (...a) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error("IndexedDB no responde (" + PLAZO_MS + " ms)")), PLAZO_MS); Promise.resolve().then(() => fn(...a)).then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); }); });
const get = p(get0), set = p(set0), delMany = p(delMany0), keys = p(keys0);   // en disco: { clave: [bytes, último uso en ms] }

/** Prefijo de las claves de ESTA versión del generador: lo guardado con otro (otro GEN_VERSION o CACHE_VERSION) ya no sirve y se borra del disco al abrir */
export const PREFIJO_CLAVE = "olivo|" + GEN_VERSION + "|c" + CACHE_VERSION + "|";

// número canónico: 6 decimales (lo que llega por JSON o por cálculo da la misma clave)
const num = v => (typeof v === "number" ? Number(v.toFixed(6)) : v);
function canon(o) {
  if (o === null || typeof o !== "object") return num(o);
  if (Array.isArray(o)) return o.map(canon);
  const r = {}; for (const k of Object.keys(o).sort()) if (o[k] !== undefined) r[k] = canon(o[k]);
  return r;
}
/** Clave de una receta: todo lo que la cambia (tipo, parámetros —altura y copa ya llevan factorR8—, época, semilla, nivel) y las versiones */
export function claveReceta(entrada, nivel) {
  const e = entrada || {};
  return PREFIJO_CLAVE + (nivel || "E0") + "|" + e.tipo + "|" + e.epoca + "|" + (e.semilla >>> 0) + "|" + JSON.stringify(canon(e.parametros || {}));
}
/** Bytes de los arrays tipados de una receta (lo que pesa de verdad) */
export function bytesReceta(r) {
  let n = 0; const vistos = new Set();
  (function anda(o) {
    if (!o || typeof o !== "object" || vistos.has(o)) return;
    if (ArrayBuffer.isView(o)) { if (!vistos.has(o.buffer)) { vistos.add(o.buffer); n += o.byteLength; } return; }
    vistos.add(o); for (const k in o) anda(o[k]);
  })(r);
  return n;
}

/**
 * @param o { memMB (150), discoMB (300), disco (true: intentar IndexedDB), nombre ("gemelo-olivos"), ahora () → ms, diferido (fn) → ejecuta fn sin bloquear,
 *   alExpulsar (receta, clave, motivo) → se llama al sacar una receta de la memoria ("lru" | "sustituida" | "vaciada"; además se llama a receta.dispose() si lo tiene) }
 * @returns { mem(clave) → receta|undefined (síncrono), lee(clave) → Promise<receta|undefined> (memoria y luego disco), pon(clave, receta), estado(), vacia() }
 */
export function creaCache(o) {
  const op = Object.assign({ memMB: 150, discoMB: 300, disco: true, nombre: "gemelo-olivos" }, o || {});
  const ahora = op.ahora || (() => Date.now());
  const diferido = op.diferido || (fn => (typeof requestIdleCallback === "function" ? requestIdleCallback(() => fn(), { timeout: 2000 }) : setTimeout(fn, 50)));
  const M = new Map();   // clave → { r, b }; el orden de inserción es el de uso (LRU)
  let memB = 0, aviso = "", store = null, indice = null, discoB = 0, escribiendo = Promise.resolve(), aciertos = { mem: 0, disco: 0, fallos: 0 }, expulsadas = 0, purgadas = 0, leyendo = null;
  const topeMem = op.memMB * 1048576, topeDisco = op.discoMB * 1048576;
  if (op.disco) {
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) aviso = "sin IndexedDB: caché solo en memoria";
      else store = createStore(op.nombre, "recetas");
    } catch (e) { aviso = "IndexedDB no disponible (" + String(e && e.message || e).slice(0, 60) + "): caché solo en memoria"; store = null; }
  } else aviso = "caché en disco apagada";
  const apaga = e => { if (store) { store = null; aviso = "IndexedDB falló (" + String(e && e.message || e).slice(0, 60) + "): caché solo en memoria"; } };
  if (store) cargaIndice();   // al empezar: si la base no abre, aquí se apaga el disco (y queda el aviso)
  // el índice del disco se lee una vez (al primer uso) y se guarda junto con cada escritura
  function cargaIndice() {
    if (indice || !store) return Promise.resolve(indice || {});
    if (leyendo) return leyendo;   // una sola lectura aunque lleguen varias a la vez (el arranque y la primera lectura)
    return leyendo = get(INDICE, store).then(i => {
      indice = i || {};
      // de otra versión del generador o de la caché: no sirve y ocuparía cuota para siempre
      const viejas = Object.keys(indice).filter(k => k.startsWith("olivo|") && !k.startsWith(PREFIJO_CLAVE));
      for (const k of viejas) delete indice[k];
      discoB = Object.values(indice).reduce((s, x) => s + x[0], 0);
      if (!viejas.length) return indice;
      purgadas += viejas.length;
      return delMany(viejas, store).then(() => set(INDICE, indice, store)).then(() => indice, e => { apaga(e); return indice; });
    }, e => { apaga(e); indice = {}; return indice; });
  }
  // lo que sale de la memoria se libera: el gancho del anfitrión (sus mallas, texturas) y dispose() de la receta; un fallo ahí no rompe la caché
  function suelta(clave, v, motivo) {
    memB -= v.b; M.delete(clave); expulsadas++;
    try { if (op.alExpulsar) op.alExpulsar(v.r, clave, motivo); if (v.r && typeof v.r.dispose === "function") v.r.dispose(); } catch (e) { /* nada que hacer */ }
  }
  function enMemoria(clave, r, b) {
    const antes = M.get(clave);
    if (antes && antes.r !== r) suelta(clave, antes, "sustituida"); else if (antes) { memB -= antes.b; M.delete(clave); }
    if (b > topeMem) return;
    M.set(clave, { r, b }); memB += b;
    for (const [k, v] of M) { if (memB <= topeMem || k === clave) break; suelta(k, v, "lru"); }   // suelta las más antiguas (nunca la recién puesta)
  }
  function mem(clave) {
    const x = M.get(clave); if (!x) return undefined;
    M.delete(clave); M.set(clave, x); aciertos.mem++;   // pasa a la más reciente
    if (indice && indice[clave]) indice[clave][1] = ahora();
    return x.r;
  }
  function lee(clave) {
    const r = mem(clave); if (r) return Promise.resolve(r);
    if (!store) { aciertos.fallos++; return Promise.resolve(undefined); }
    return cargaIndice().then(ix => {
      if (!store || !ix[clave]) { aciertos.fallos++; return undefined; }
      return get(clave, store).then(r2 => {
        if (!r2) { delete ix[clave]; aciertos.fallos++; return undefined; }
        ix[clave][1] = ahora(); aciertos.disco++; enMemoria(clave, r2, bytesReceta(r2)); return r2;
      }, e => { apaga(e); aciertos.fallos++; return undefined; });
    });
  }
  function pon(clave, r) {
    const b = bytesReceta(r); enMemoria(clave, r, b);
    if (!store || b > topeDisco) return Promise.resolve(false);
    // la escritura (copia estructurada de los arrays) va diferida y en fila: no en el fotograma, una cada vez
    escribiendo = escribiendo.then(() => new Promise(ok => diferido(ok))).then(cargaIndice).then(ix => {
      if (!store || ix[clave]) return false;
      ix[clave] = [b, ahora()]; discoB += b;
      const fuera = [];
      if (discoB > topeDisco) for (const [k, v] of Object.entries(ix).sort((a, z) => a[1][1] - z[1][1])) { if (discoB <= topeDisco) break; if (k === clave) continue; fuera.push(k); discoB -= v[0]; delete ix[k]; }
      return (fuera.length ? delMany(fuera, store) : Promise.resolve()).then(() => set(clave, r, store)).then(() => set(INDICE, ix, store)).then(() => true);
    }).catch(e => { apaga(e); return false; });
    return escribiendo;
  }
  function estado() {
    return { memoria: M.size, memoriaMB: +(memB / 1048576).toFixed(1), topeMemMB: op.memMB, disco: indice ? Object.keys(indice).length : (store ? null : 0), discoMB: +(discoB / 1048576).toFixed(1),
      topeDiscoMB: op.discoMB, enDisco: !!store, aviso, aciertos: Object.assign({}, aciertos), expulsadas, purgadas };
  }
  function vacia() { for (const [k, v] of Array.from(M)) suelta(k, v, "vaciada"); memB = 0; if (!store) return Promise.resolve(); return keys(store).then(k => delMany(k, store)).then(() => { indice = {}; discoB = 0; }, apaga); }
  return { mem, lee, pon, estado, vacia, espera: () => escribiendo };
}
