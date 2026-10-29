// Servicio hornero (ADR-0018 §4, O7f): mantiene horneadas las variantes de olivos de cada finca servida, sin hornear de más.
//   GEMELO_HORNERO_FINCAS=hituelo node tuberia/olivos/servicio.mjs [--una]
// Política (decisión de Antonio): NO hay vuelta diaria. Una vuelta al arrancar (idempotente: con todo al día, ~1 s y no escribe nada) y después
// duerme hasta el próximo cambio del par época actual/siguiente (calendario, `epocaDeFecha`) a la hora GEMELO_HORNERO_HORA (03:00 UTC por defecto).
// Mientras duerme, cada GEMELO_HORNERO_COMPRUEBA_S (600) mira los sellos baratos de sus entradas —fecha y tamaño del índice de la finca, huella del
// calendario de épocas, GEN_VERSION/CACHE_VERSION/formato frente al manifiesto— y solo si alguno cambió lanza una vuelta. Sin inotify.
// Un candado por finca (proper-lockfile, en el volumen de estado) impide dos hornos a la vez sobre la misma finca. Un fallo se reintenta
// pasados GEMELO_HORNERO_REINTENTO_S (300), no en cada comprobación.
//   GEMELO_HORNERO_FINCAS   ids separados por comas (obligatorio)
//   GEMELO_HORNERO_DATOS    <datos>/<finca>/indice.json, de solo lectura (por defecto /datos)
//   GEMELO_HORNERO_SALIDA   se escribe en <salida>/<finca>/olivos/ (por defecto /salida)
//   GEMELO_HORNERO_ESTADO   <estado>/<finca>.json (estado del hornero), <finca>.lock y servicio.json (el latido); por defecto /estado
//   GEMELO_HORNERO_CALENDARIO  otro epocas-calendario.json; GEMELO_HORNERO_RELEASE=1 brotli 11
//   GEMELO_HORNERO_IMPOSTORES=1  además hornea los impostores (O8b: Chrome; la imagen Dockerfile.impostores lo trae y lo pone)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import lockfile from "proper-lockfile";
import { hornea as horneaReal, generadorReal } from "./hornero.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..", "..");
const ahoraISO = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const leeJson = r => { try { return JSON.parse(fs.readFileSync(r, "utf8")); } catch (e) { return null; } };
const escribeAtomico = (r, t) => { const tmp = r + ".tmp-" + process.pid; fs.writeFileSync(tmp, t); fs.renameSync(tmp, r); };

/** Sello barato de un fichero: tamaño y fecha de modificación (null si no existe) */
export function sello(ruta) { try { const s = fs.statSync(ruta); return s.size + ":" + Math.round(s.mtimeMs); } catch (e) { return null; } }
/** Huella de un fichero pequeño (el calendario) */
export function huella(ruta) { try { return crypto.createHash("sha256").update(fs.readFileSync(ruta)).digest("hex").slice(0, 16); } catch (e) { return null; } }

/**
 * La próxima fecha en que cambia el par (época actual, siguiente), es decir, el primer día después de `fecha` cuya época es otra.
 * Devuelve { desde: "AAAA-MM-DD", epoca } o null si la tabla no cambia en un año. Pura (recibe `epocaDeFecha`).
 */
export function proximoCambioDeEpoca(tabla, fecha, epocaDeFecha) {
  const hoy = epocaDeFecha(tabla, fecha), base = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  for (let d = 1; d <= 400; d++) {
    const f = new Date(base + d * 86400000), e = epocaDeFecha(tabla, f);
    if (e !== hoy) return { desde: f.toISOString().slice(0, 10), epoca: e };
  }
  return null;
}

/** «HH:MM» → minutos del día (UTC) */
export function minutosDe(hora) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora)); if (!m || +m[1] > 23 || +m[2] > 59) throw new Error("GEMELO_HORNERO_HORA debe ser HH:MM (UTC): " + hora);
  return +m[1] * 60 + +m[2];
}
/** El instante (ms) en que despertar para el cambio de época: ese día a la hora dada (UTC) */
export const despertarEn = (desde, hora) => Date.parse(desde + "T00:00:00Z") + minutosDe(hora) * 60000;

/**
 * Pura: ¿hay que lanzar una vuelta, y por qué? c: { primera, ahora (ms), fallo: { en (ms) } | null, reintentoMs, manifiesto, G: {GEN_VERSION, CACHE_VERSION},
 * formato, epocaHoy, sellos, previos, despertarEn (ms | null) }. Devuelve el motivo o null (seguir durmiendo).
 */
export function motivoDeVuelta(c) {
  if (c.fallo) return c.ahora - c.fallo.en >= c.reintentoMs ? "reintento tras un fallo" : null;
  if (c.primera) return "arranque";
  const m = c.manifiesto;
  if (!m) return "sin manifiesto";
  if (m.gen_version !== c.G.GEN_VERSION || m.cache_version !== c.G.CACHE_VERSION || m.formato !== c.formato) return "GEN_VERSION/CACHE_VERSION/formato distintos";
  if (c.sellos.indice !== c.previos.indice) return "cambió el índice de la finca";
  if (c.sellos.calendario !== c.previos.calendario) return "cambió el calendario de épocas";
  // el cambio de época espera a la hora configurada (no al cambio de día); sin despertar programado, se compara la época del manifiesto con la de hoy
  if (c.despertarEn != null ? c.ahora >= c.despertarEn : m.actual !== c.epocaHoy) return "llegó el cambio de época (" + m.actual + " → " + c.epocaHoy + ")";
  return null;
}

/** Candado por finca: devuelve la función que lo libera, o null si otro proceso ya lo tiene. Caduca si su dueño muere (stale) */
export async function tomaCandado(ruta, { stale = 30000, update = 10000, onCompromised } = {}) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  try { return await lockfile.lock(ruta, { realpath: false, stale, update, retries: 0, onCompromised: onCompromised || (e => { process.stderr.write("hornero: candado comprometido: " + e.message + "\n"); }) }); }
  catch (e) { if (e && e.code === "ELOCKED") return null; throw e; }
}

export function configDe(env = process.env) {
  const fincas = (env.GEMELO_HORNERO_FINCAS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!fincas.length) throw new Error("falta GEMELO_HORNERO_FINCAS");
  for (const f of fincas) if (!/^[a-z0-9_]+$/.test(f)) throw new Error("finca inválida: " + f);
  const n = (k, d) => Number(env[k] || d);
  return { fincas, datos: env.GEMELO_HORNERO_DATOS || "/datos", salida: env.GEMELO_HORNERO_SALIDA || "/salida", estado: env.GEMELO_HORNERO_ESTADO || "/estado",
    hora: env.GEMELO_HORNERO_HORA || "03:00", compruebaMs: n("GEMELO_HORNERO_COMPRUEBA_S", 600) * 1000, reintentoMs: n("GEMELO_HORNERO_REINTENTO_S", 300) * 1000,
    calendario: env.GEMELO_HORNERO_CALENDARIO || path.join(RAIZ, "contratos", "epocas-calendario.json"), release: env.GEMELO_HORNERO_RELEASE === "1", limpia: env.GEMELO_HORNERO_LIMPIA !== "0", impostores: env.GEMELO_HORNERO_IMPOSTORES === "1" };
}

/**
 * El servicio. `o.hornea` y `o.generador` se pueden sustituir (pruebas); `o.parar` es una señal ({ parado: bool }); `o.una` hace una sola pasada y vuelve.
 * Devuelve cuando se para o, con `una`, tras la pasada: { fincas: { finca: { motivo, resumen | error } } }.
 */
export async function servicio(cfg, o = {}) {
  const hornea = o.hornea || horneaReal, log = o.log || (m => process.stderr.write(m + "\n")), parar = o.parar || { parado: false };
  const E = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "olivo", "epocas.js")).href), F = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "olivo", "horneado.js")).href);
  const G = o.generador || await generadorReal(), ahora = o.ahora || (() => Date.now());
  fs.mkdirSync(cfg.estado, { recursive: true });
  const rutaLatido = path.join(cfg.estado, "servicio.json"), iniciado = ahoraISO();
  const por = Object.fromEntries(cfg.fincas.map(f => [f, { primera: true, fallo: null, previos: {}, durmiendo_hasta: null, ultimo_motivo: null, ultima_vuelta_en: null }]));
  const latido = () => { try { escribeAtomico(rutaLatido, JSON.stringify({ v: 1, pid: process.pid, iniciado_en: iniciado, latido_en: ahoraISO(), comprueba_s: cfg.compruebaMs / 1000,
    fincas: Object.fromEntries(cfg.fincas.map(f => [f, { durmiendo_hasta: por[f].durmiendo_hasta, ultimo_motivo: por[f].ultimo_motivo, ultima_vuelta_en: por[f].ultima_vuelta_en, fallo: por[f].fallo ? por[f].fallo.mensaje : null }])) }, null, 2) + "\n"); } catch (e) { /* el latido nunca tumba el trabajo */ } };
  const resultado = { fincas: {} };

  const pasada = async finca => {
    const s = por[finca], rutaCal = cfg.calendario, rutaIndice = path.join(cfg.datos, finca, "indice.json"), t = ahora();
    const cal = JSON.parse(fs.readFileSync(rutaCal, "utf8")), tabla = E.tablaDe(cal, finca), fecha = new Date(t);
    const sellos = { indice: sello(rutaIndice), calendario: huella(rutaCal) };
    const manifiesto = leeJson(path.join(cfg.salida, finca, "olivos", "manifiesto.json"));
    const motivo = motivoDeVuelta({ primera: s.primera, ahora: t, fallo: s.fallo, reintentoMs: cfg.reintentoMs, manifiesto, G, formato: F.FORMATO, epocaHoy: E.epocaDeFecha(tabla, fecha),
      sellos, previos: s.previos, despertarEn: s.despertarEn ?? null });
    if (!motivo) return;
    const libera = await tomaCandado(path.join(cfg.estado, finca), { onCompromised: e => log("hornero: candado de " + finca + " comprometido: " + e.message) });
    if (!libera) { log("[hornero " + finca + "] otro hornero trabaja en esta finca: no lanzo " + motivo); s.fallo = null; s.primera = false; resultado.fincas[finca] = { motivo, ocupada: true }; return; }
    s.durmiendo_hasta = null; s.ultimo_motivo = motivo; latido(); log("[hornero " + finca + "] vuelta: " + motivo);
    try {
      const resumen = await hornea({ finca, salida: cfg.salida, fecha: fecha.toISOString(), release: cfg.release, limpia: cfg.limpia, impostores: !!cfg.impostores, estado: path.join(cfg.estado, finca + ".json"),
        calendario: cal, generador: G, log });
      s.fallo = null; s.primera = false; s.previos = sellos; s.ultima_vuelta_en = ahoraISO();
      const prox = proximoCambioDeEpoca(tabla, fecha, E.epocaDeFecha);
      s.despertarEn = prox ? despertarEn(prox.desde, cfg.hora) : null;
      s.durmiendo_hasta = s.despertarEn ? new Date(s.despertarEn).toISOString().replace(/\.\d+Z$/, "Z") : null;
      resultado.fincas[finca] = { motivo, resumen };
      log("[hornero " + finca + "] listo en " + resumen.ms + " ms (" + resumen.horneadas + " horneadas, " + resumen.reutilizadas + " reutilizadas); duerme hasta " + (s.durmiendo_hasta || "(sin cambio de época a la vista)") + ", mirando los sellos cada " + cfg.compruebaMs / 1000 + " s");
    } catch (e) {
      s.fallo = { en: ahora(), mensaje: String(e && e.message || e) }; s.primera = false;
      resultado.fincas[finca] = { motivo, error: s.fallo.mensaje };
      log("[hornero " + finca + "] FALLÓ: " + s.fallo.mensaje + " (reintento en " + cfg.reintentoMs / 1000 + " s)");
    } finally { await libera().catch(() => {}); latido(); }
  };

  for (;;) {
    for (const f of cfg.fincas) { if (parar.parado) break; await pasada(f); }
    latido();
    if (o.una || parar.parado) return resultado;
    await new Promise(r => { const id = setTimeout(r, cfg.compruebaMs); parar.despierta = () => { clearTimeout(id); r(); }; });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parar = { parado: false };
  const salir = () => { parar.parado = true; if (parar.despierta) parar.despierta(); setTimeout(() => process.exit(0), 3000).unref(); };   // lo horneado es atómico: salir a medias no deja nada roto
  process.on("SIGTERM", salir); process.on("SIGINT", salir);
  servicio(configDe(), { parar, una: process.argv.includes("--una") }).then(r => { if (process.argv.includes("--una")) console.log(JSON.stringify(r)); process.exit(0); },
    e => { process.stderr.write("hornero: " + (e && e.message || e) + "\n"); process.exit(1); });
}
