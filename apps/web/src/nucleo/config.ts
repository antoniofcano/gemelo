// La configuración versionada del servidor (C6 y OF6; contratos/config.schema.json): GET /api/config del mismo origen, con caída a lo del código.
// MU5-n (A3-8a): antes vivía en apps/web/motor/02c_componentes.js, que queda de talón (`var ConfigPuro = Nucleo.ConfigPuro;`,
// `var Config = Nucleo.creaConfig({ … })`). Nada de aquí lee globales al cargarse: fetch, la URL, la base de las teselas (D.base), el registro de componentes,
// la ventana (donde publica window.__config) y la consola entran por argumento de creaConfig.
// Precedencia de cada parámetro: URL (pruebas) > configuración > código; el motor RECORTA cada valor a sus límites aunque la api ya los haya
// validado, y los presupuestos de gafas solo pueden bajar respecto al código. La respuesta se espera como mucho ESPERA ms al arrancar: si llega
// tarde, se ignora (nada cambia en caliente con alguien dentro); sin servidor, con 401/404/503, sin red o con una respuesta rara, los defectos, sin
// avisar en consola (las pruebas cuentan los errores).
import { ComponentesPuro } from "./componentes.ts";
import type { ConfigComponentes } from "./componentes.ts";

export type Origen = "url" | "config" | "codigo";
export interface Param<T = unknown> { v: T; origen: Origen; motivo?: string }
export interface EstadoConfig { origen: string; motivo?: string; version?: string | null; estadoVersion?: string | null; ms?: number }
export interface LecturaConfig { cfg: any; estado: EstadoConfig; tarde?: boolean }
export interface Ventana { desde: string; hasta: string }
export type TablaEpocas = Record<string, Ventana>;
/** Lo que se usa de fetch y de su respuesta. */
export type Trae = (url: string, o?: any) => Promise<{ status: number; json(): Promise<any> }>;

// [puro:inicio] (sin DOM ni THREE: lo prueba en Node apps/web/src/nucleo/config.test.ts; los límites, contra el esquema, pruebas/guardianes/config_motor.test.js y oficina_olivos.test.js)
export var ConfigPuro = (function () {
  var ESPERA = 2000;
  // los límites de contratos/config.schema.json (pruebas/guardianes/config_motor.test.js comprueba que son los mismos): [mín, máx, entero?, soloBaja?]
  var LIMITES: Record<string, [number, number, boolean?, boolean?]> = {
    "escalera.umbralesPx.e0": [300, 2000], "escalera.umbralesPx.e1": [100, 1000], "escalera.umbralesPx.e2": [30, 400],
    "escalera.bandaM": [0, 3], "escalera.histeresis": [0.03, 0.2],
    "escalera.maxPropios": [1, 8, true], "escalera.maxPropiosGafas": [1, 4, true], "escalera.maxVariantes": [0, 64, true],
    "escalera.triangulos.escritorio": [300000, 700000, true], "escalera.triangulos.movil": [120000, 300000, true],
    "escalera.triangulos.gafas": [50000, 380000, true, true],
    "escalera.fraccionE0Gafas": [0, 0.5], "escalera.factorCopa": [0.5, 1.5], "escalera.vrJsMs": [4, 16]
  };
  var EPOCAS = ["reposo", "boton", "flor", "cuajado", "verde", "envero", "madura"];
  function esObj(v: unknown): v is Record<string, any> { return !!v && typeof v === "object" && !Array.isArray(v); }
  // el valor de una ruta «a.b.c» (o «a.b.2» en una lista); undefined si no está
  function busca(cfg: unknown, ruta: string) {
    var v: any = cfg; ruta.split(".").forEach(function (k) { v = v !== null && typeof v === "object" ? v[k] : undefined; });
    return v;
  }
  // recorta un valor de la configuración a sus límites (ruta sin el índice: «escalera.triangulos.gafas.1» usa los de «…gafas»); undefined si no es número
  function recorta(ruta: string, v: unknown, codigo?: unknown) {
    var L = LIMITES[ruta] || LIMITES[ruta.replace(/\.\d+$/, "")];
    if (!L || typeof v !== "number" || !isFinite(v)) return undefined;
    v = Math.min(L[1], Math.max(L[0], v)); if (L[2]) v = Math.round(v as number);
    if (L[3] && typeof codigo === "number" && isFinite(codigo)) v = Math.min(v as number, codigo);
    return v as number;
  }
  // un parámetro: { v, origen: "url" | "config" | "codigo" }. url: lo que dio la URL (undefined o null si nada; la URL ya trae sus propios topes)
  function param(cfg: unknown, ruta: string, codigo: unknown, url?: unknown): Param {
    if (url !== undefined && url !== null && !(typeof url === "number" && isNaN(url))) return { v: url, origen: "url" };
    var c = cfg ? recorta(ruta, busca(cfg, ruta), codigo) : undefined;
    return c !== undefined ? { v: c, origen: "config" } : { v: codigo, origen: "codigo" };
  }
  // los tres umbrales van juntos: con e1 ≤ e0 / 1,5 y e2 ≤ e1 / 1,5 (tras recortar) o ninguno
  function umbrales(cfg: unknown, codigo: unknown, url?: unknown): Param {
    if (url) return { v: url, origen: "url" };
    var u = cfg ? busca(cfg, "escalera.umbralesPx") : undefined;
    if (!esObj(u)) return { v: codigo, origen: "codigo" };
    var e = ["e0", "e1", "e2"].map(function (k) { return recorta("escalera.umbralesPx." + k, u[k]); });
    if (e.some(function (x) { return x === undefined; }) || e[1]! > e[0]! / 1.5 || e[2]! > e[1]! / 1.5) return { v: codigo, origen: "codigo", motivo: "umbrales de la configuración incoherentes" };
    return { v: e, origen: "config" };
  }
  // las épocas (como apps/web/olivo/epocas.js): «MM-DD» en UTC, ventanas con ambos extremos dentro; si desde > hasta, cruza el fin de año
  function mmdd(f: Date | number | string) { var d = f instanceof Date ? f : new Date(f); return ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2); }
  function dentro(m: string, v: Ventana) { return v.desde <= v.hasta ? m >= v.desde && m <= v.hasta : m >= v.desde || m <= v.hasta; }
  function validaTabla(t: unknown) {
    if (!esObj(t)) return ["la tabla no es un objeto"];
    var err = EPOCAS.filter(function (e) { return !esObj(t[e]) || typeof t[e].desde !== "string" || typeof t[e].hasta !== "string"; }).map(function (e) { return "falta la época " + e; });
    if (err.length) return err;
    for (var d = 0; d < 366; d++) {
      var m = mmdd(new Date(Date.UTC(2024, 0, 1 + d))), n = EPOCAS.filter(function (e) { return dentro(m, t[e]); }).length;
      if (n !== 1) err.push(m + (n ? ": en varias épocas" : ": sin época"));
    }
    return err.slice(0, 10);
  }
  // la tabla de épocas de una finca (la suya o la común), solo si cubre los 366 días con una época por día; si no, null
  function tablaEpocas(cfg: any, finca?: string): TablaEpocas | null {
    var ep = cfg && cfg.epocas; if (!esObj(ep)) return null;
    var t = (esObj(ep.fincas) && ep.fincas[finca as string]) || ep.comun;
    return validaTabla(t).length ? null : t;
  }
  function epocaDeFecha(t: TablaEpocas, fecha: Date | number | string) { var m = mmdd(fecha); for (var i = 0; i < EPOCAS.length; i++) if (dentro(m, t[EPOCAS[i]!]!)) return EPOCAS[i]!; return null; }
  // de dónde pedirla: ?api=<prefijo> (pruebas; ruta relativa del mismo origen acabada en «/») o «/api/» si la página la sirve el servidor (D.base /teselas/…)
  function prefijoApi(busqueda?: string, base?: string) {
    var m = /[?&]api=([^&#]*)/.exec(busqueda || "");
    if (m) { var p = decodeURIComponent(m[1]!); return /^\/?[A-Za-z0-9_\-.][A-Za-z0-9_\-./]*\/$/.test(p) && p.indexOf("//") < 0 && p.indexOf("..") < 0 ? p : null; }
    return /^\/teselas\//.test(base || "") ? "/api/" : null;
  }
  // la forma mínima de la respuesta { version, estado, config: { v: 1, … } }; lo fino (límites) se recorta al usarlo
  function validaRespuesta(j: unknown) {
    if (!esObj(j) || !esObj(j.config) || j.config.v !== 1) return "la respuesta no trae config v1";
    var c = j.config;
    if (c.componentes !== undefined && ComponentesPuro.validaConfig(c.componentes).length) return "componentes no válidos";
    if (c.escalera !== undefined && !esObj(c.escalera)) return "escalera no es un objeto";
    if (c.epocas !== undefined && !esObj(c.epocas)) return "epocas no es un objeto";
    return "";
  }
  /** pide la configuración: o = { fetch, prefijo, espera?, ahora? } → Promise de { cfg (o null), estado: { origen, version?, estadoVersion?, motivo?, ms? } }.
   *  Nunca falla ni escribe en la consola. */
  function lee(o: { fetch: Trae | null; prefijo: string | null; espera?: number; ahora?: () => number }): Promise<LecturaConfig> {
    var ahora = o.ahora || Date.now, t0 = ahora();
    if (!o.prefijo || typeof o.fetch !== "function") return Promise.resolve({ cfg: null, estado: { origen: "codigo", motivo: "sin servidor" } });
    var pide: Promise<LecturaConfig> = Promise.resolve().then(function () {
      return o.fetch!(o.prefijo + "config", { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" } });
    }).then(function (r): LecturaConfig | Promise<LecturaConfig> {
      if (!r || r.status !== 200) return { cfg: null, estado: { origen: "codigo", motivo: "http " + (r ? r.status : "?") } };
      return r.json().then(function (j) {
        var mal = validaRespuesta(j);
        if (mal) return { cfg: null, estado: { origen: "codigo", motivo: mal } };
        return { cfg: j.config, estado: { origen: j.version ? "servidor" : "codigo", motivo: j.version ? "" : "sin versión publicada", version: j.version || null, estadoVersion: j.estado || null } };
      });
    }).catch(function () { return { cfg: null, estado: { origen: "codigo", motivo: "sin red o respuesta ilegible" } }; });
    var reloj: ReturnType<typeof setTimeout> | null = null, espera = new Promise<LecturaConfig>(function (res) { reloj = setTimeout(function () { res({ cfg: null, estado: { origen: "codigo", motivo: "tarde (más de " + (o.espera || ESPERA) + " ms)" }, tarde: true }); }, o.espera || ESPERA); });
    return Promise.race([pide, espera]).then(function (r) { clearTimeout(reloj as ReturnType<typeof setTimeout>); r.estado.ms = Math.round(ahora() - t0); return r; });
  }
  return { ESPERA: ESPERA, LIMITES: LIMITES, EPOCAS: EPOCAS, busca: busca, recorta: recorta, param: param, umbrales: umbrales, validaTabla: validaTabla, tablaEpocas: tablaEpocas,
    epocaDeFecha: epocaDeFecha, prefijoApi: prefijoApi, validaRespuesta: validaRespuesta, lee: lee };
})();
// [puro:fin]

/** Lo que el talón da del legado. */
export interface DepsConfig {
  fetch: Trae | null;
  /** location.search */
  busqueda: string;
  /** D.base (la carpeta de las teselas): con «/teselas/…» la página la sirve el servidor */
  base: string;
  /** el registro de componentes: su bloque «componentes» entra por configura */
  componentes: { configura(c: ConfigComponentes): unknown };
  /** donde se publica window.__config (?debug y pruebas); null: no se publica */
  ventana?: any;
  consola?: { error(...a: unknown[]): void } | null;
}

// la configuración del servidor, pedida UNA vez al cargar (ConfigPuro.lee): Config.listo (promesa que nunca falla, con la configuración o null),
// Config.al(fn) (fn(cfg) al llegar, o ya si llegó), Config.param(ruta, código, url) y Config.umbrales(código, url) para los parámetros (la escalera:
// 01_datos, 07ab, 07b; los perfiles VR: 29_vr), Config.tablaEpocas(finca) y Config.estado() (lo enseña ?debug con window.__config). Su bloque
// «componentes» va a Componentes.configura.
export function creaConfig(deps: DepsConfig) {
  var P = ConfigPuro, cfg: any = null, est: EstadoConfig = { origen: "codigo", motivo: "pidiendo" }, hecho = false, esperan: ((c: any) => void)[] = [], usados: Record<string, unknown> = {};
  var consola = deps.consola || null;
  var listo = P.lee({ fetch: deps.fetch, prefijo: P.prefijoApi(deps.busqueda, deps.base) }).then(function (r) {
    cfg = r.cfg; est = r.estado; hecho = true;
    if (cfg && cfg.componentes) deps.componentes.configura(cfg.componentes);
    esperan.splice(0).forEach(function (fn) { try { fn(cfg); } catch (e) { try { if (consola) consola.error("[Config]", e); } catch (e2) {} } });
    return cfg;
  });
  function al(fn: (c: any) => void) { if (hecho) fn(cfg); else esperan.push(fn); }
  function param(ruta: string, codigo: unknown, url?: unknown): any { var r = P.param(cfg, ruta, codigo, url); usados[ruta] = { v: r.v, origen: r.origen }; return r.v; }
  function umbrales(codigo: unknown, url?: unknown): any { var r = P.umbrales(cfg, codigo, url); usados["escalera.umbralesPx"] = r; return r.v; }
  function tablaEpocas(finca?: string) { return P.tablaEpocas(cfg, finca); }
  function estado() { return Object.assign({ hecho: hecho, usados: usados }, est); }
  var ventana = deps.ventana;
  if (ventana) ventana.__config = function () { return estado(); };   // ?debug y pruebas
  return { listo: listo, al: al, param: param, umbrales: umbrales, tablaEpocas: tablaEpocas, epocaDeFecha: P.epocaDeFecha, estado: estado };
}
export type Config = ReturnType<typeof creaConfig>;
