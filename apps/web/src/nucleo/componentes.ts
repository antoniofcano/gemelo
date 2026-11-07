// El registro de componentes y su ciclo de vida (ADR-0023; doc/sistema/COMPONENTES.md §3; MU2-5). Antes vivía entero en apps/web/motor/02c_componentes.js
// (ComponentesPuro y Componentes); el módulo del motor conserva el Bus, el Reparto, la Pausa, las Teclas y la configuración del servidor, y crea el
// registro con creaComponentes({ … }), dándole por argumento lo que necesita del legado. Mismo comportamiento que antes:
//   · un componente se registra con su manifiesto (ComponentesPuro.valida); nada se monta al registrarse hasta arranca(), que decide quién se enciende
//     (URL > configuración del servidor > defecto del manifiesto) y los monta en orden de dependencias (quien consume lo que otro expone, después);
//   · el bucle llama a actualiza(fase, dt, t): «mundo», «tarde» (a su ritmo, repartidos entre fotogramas), «trasRender» y «pausa»; un componente que
//     falla en una fase se libera (y lo dice) para no romper el fotograma de los demás; uno que falla al montar no queda a medias;
//   · lo que un componente engancha por su contexto (n.on, n.limpia) se suelta solo al liberarlo; al liberar uno, antes se liberan los que dependen de él.
// Lo nuevo (MU2-5), el filtro por mundo: el manifiesto puede llevar mundos: IdMundo[] (sin el campo, el componente es del exterior, lo de hoy).
//   · Las fases solo corren para los componentes del mundo activo. El mundo activo lo dicen los eventos «mundo:entra» y «mundo:sale» del Bus
//     (contratos/eventos.json, los emite el gestor de mundos, nucleo/mundos.ts, por deps.avisa): tras «mundo:sale» y hasta el «mundo:entra»
//     siguiente no hay mundo activo (a oscuras) y no corre ninguna fase. Al arrancar, el activo es el exterior.
//   · Un componente se monta solo si alguno de sus mundos está vivo (cargado: activo o congelado). Al entrar en un mundo que no lo estaba, se montan los
//     suyos; liberaMundo(id) (quien libere el mundo, MU2-6) libera los componentes que se quedan sin ningún mundo vivo.
//   · MU5-n (A3-6a): «mundos: "todos"» es un componente de TODO mundo (la red, la presencia, los avatares, el menú de muñeca): vive en cada uno de los de
//     MUNDOS, también en los que se añadan después, así que sus fases corren en el que esté activo y solo se libera cuando no queda ningún mundo vivo.
//   Hoy casi todos los componentes son del exterior y nadie emite esos eventos: no cambia nada visible.
// Nada de aquí lee globales al cargarse: el Bus, el Reparto, el reloj, la URL, el documento y la consola entran por argumento de creaComponentes.
import type { IdMundo } from "./mundos.ts";

export type Fase = "mundo" | "tarde" | "trasRender" | "pausa";
const FASES: readonly Fase[] = ["mundo", "tarde", "trasRender", "pausa"];
/** Los mundos que puede nombrar un manifiesto (los de IdMundo, nucleo/mundos.ts). */
const MUNDOS = ["exterior", "molino", "bodega", "vacio"] as const satisfies readonly IdMundo[];
type FaltaEnMundos = Exclude<IdMundo, (typeof MUNDOS)[number]>;
const _todos: [FaltaEnMundos] extends [never] ? true : never = true;   // si IdMundo gana un mundo, MUNDOS tiene que nombrarlo
void _todos;
/** Sin «mundos» en el manifiesto, el componente es del exterior. */
const DEFECTO_MUNDOS: readonly IdMundo[] = ["exterior"];
/** MU5-n (A3-6a): el valor de «mundos» de un componente de todo mundo (la presencia, la red y los avatares siguen al entrar en un interior). Es una palabra y no
 *  la lista de todos para que un mundo nuevo de IdMundo lo herede sin tocar su manifiesto (una lista escrita a mano se quedaría corta en silencio). */
const TODOS = "todos";
export type MundosComponente = IdMundo[] | typeof TODOS;

const ID = /^[a-z][a-z0-9-]*$/, URLN = /^[a-z][a-z0-9]*$/;

/** Lo que el componente devuelve de monta(): su api (Componentes.api(id)); {} si no devuelve un objeto. */
export type ApiComponente = object;
export type FnFase = (dt: number, t: number, api: ApiComponente) => void;

/** El contexto que recibe monta(n): lo que se engancha por aquí se suelta solo al liberar. */
export interface ContextoComponente {
  readonly id: string;
  readonly parametros: Record<string, unknown>;
  limpia<F>(fn: F): F;
  on(ev: string, fn: (datos?: any) => void): () => void;
  emite(ev: string, datos?: unknown): number;
  api(id: string): ApiComponente | null;
}

export interface Bandera { defecto: boolean; url?: string; valor?: string }
export interface PresupuestoComponente { llamadas: number; triangulos: number; texturasMB?: number }

/** El manifiesto de un componente (ADR-0023; COMPONENTES.md §3). */
export interface Manifiesto {
  id: string;
  version?: number;
  consume: string[];
  expone: string[];
  eventos: { escucha?: string[]; emite?: string[] };
  bandera: Bandera;
  presupuesto: PresupuestoComponente;
  /** periodo en segundos de cada fase (0 = cada fotograma) */
  fases?: Partial<Record<Fase, number>>;
  actualiza?: Partial<Record<Fase, FnFase>>;
  monta(n: ContextoComponente): unknown;
  libera(api: ApiComponente | null): void;
  cultivo?: string | string[];
  /** MU2-5: los mundos en los que vive; sin el campo, el exterior; «todos» (A3-6a): en cada mundo, también los que se añadan */
  mundos?: MundosComponente;
}

/** El bloque «componentes» de la configuración (contratos/config.schema.json). */
export type ConfigComponentes = Record<string, { activo: boolean; parametros?: Record<string, unknown> }>;
export interface Encendido { activo: boolean; origen: "url" | "servidor" | "defecto" }
export interface Orden { orden: string[]; ciclos: string[][]; depende: Record<string, string[]> }
export interface EstadoFase { acum: number }

type Suelto = Record<string, unknown>;
const esObjeto = (v: unknown): v is Suelto => !!v && typeof v === "object";
function esLista(v: unknown): v is string[] { return Array.isArray(v) && v.every(x => typeof x === "string" && x.length > 0); }
function num(v: unknown): v is number { return typeof v === "number" && isFinite(v) && v >= 0; }
const esMundo = (v: unknown): v is IdMundo => typeof v === "string" && (MUNDOS as readonly string[]).indexOf(v) >= 0;

/** El manifiesto: devuelve la lista de errores (vacía si vale). */
function valida(d: unknown): string[] {
  const e: string[] = [];
  if (!esObjeto(d)) return ["el manifiesto no es un objeto"];
  if (typeof d.id !== "string" || !ID.test(d.id)) e.push("id: minúsculas, cifras y guiones, empezando por letra");
  if (d.version !== undefined && !(Number.isInteger(d.version) && (d.version as number) >= 1)) e.push("version: entero ≥ 1");
  for (const k of ["consume", "expone"]) if (!esLista(d[k])) e.push(k + ": lista de nombres (puede ser vacía)");
  const ev = d.eventos;
  if (!esObjeto(ev) || !esLista(ev.escucha || []) || !esLista(ev.emite || [])) e.push("eventos: { escucha: [...], emite: [...] }");
  const b = d.bandera;
  if (!esObjeto(b) || typeof b.defecto !== "boolean") e.push("bandera: { defecto: true|false, url?: nombre }");
  else if (b.url !== undefined && (typeof b.url !== "string" || !URLN.test(b.url))) e.push("bandera.url: minúsculas y cifras");
  else if (b.valor !== undefined && (typeof b.valor !== "string" || !URLN.test(b.valor) || !b.url)) e.push("bandera.valor: minúsculas y cifras (con bandera.url)");
  const p = d.presupuesto;
  if (!esObjeto(p) || !num(p.llamadas) || !num(p.triangulos) || (p.texturasMB !== undefined && !num(p.texturasMB))) e.push("presupuesto: { llamadas, triangulos, texturasMB? } ≥ 0 (regla 6)");
  const f = (d.fases || {}) as Suelto, a = (d.actualiza || {}) as Suelto;
  if (typeof f !== "object") e.push("fases: objeto");
  for (const k of Object.keys(f)) {
    if ((FASES as readonly string[]).indexOf(k) < 0) e.push("fases." + k + ": fase desconocida (hay " + FASES.join(", ") + ")");
    else if (!num(f[k])) e.push("fases." + k + ": segundos ≥ 0 (0 = cada fotograma)");
    if (typeof a[k] !== "function") e.push("actualiza." + k + ": falta la función de la fase");
  }
  for (const k of Object.keys(a)) if (!(k in f)) e.push("actualiza." + k + ": fase no declarada en fases");
  if (typeof d.monta !== "function") e.push("monta: función");
  if (typeof d.libera !== "function") e.push("libera: función (obligatoria: todo recurso se suelta)");
  if (d.cultivo !== undefined && !(typeof d.cultivo === "string" || esLista(d.cultivo))) e.push("cultivo: nombre o lista");
  const m = d.mundos;
  if (m !== undefined && m !== TODOS && !(Array.isArray(m) && m.length > 0 && m.every(esMundo) && new Set(m).size === m.length))
    e.push("mundos: lista sin repetir de " + MUNDOS.join(", ") + " o \"" + TODOS + "\" (sin el campo, el exterior)");
  return e;
}

/** El orden de montaje: quien consume lo que otro expone va después. Con ciclos, esos no se ordenan. */
function orden(defs: readonly Pick<Manifiesto, "id" | "consume" | "expone">[]): Orden {
  const quien: Record<string, string> = {}, ids = defs.map(d => d.id), dep: Record<string, string[]> = {};
  for (const d of defs) for (const n of d.expone || []) quien[n] = d.id;
  for (const d of defs) dep[d.id] = (d.consume || []).map(n => quien[n]).filter((q): q is string => !!q && q !== d.id);
  const out: string[] = [], estado: Record<string, number> = {}, ciclos: string[][] = [];
  function visita(id: string, pila: string[]): void {
    if (estado[id] === 2) return;
    if (estado[id] === 1) { ciclos.push(pila.slice(pila.indexOf(id)).concat(id)); return; }
    estado[id] = 1; pila.push(id);
    for (const q of dep[id] || []) visita(q, pila);
    pila.pop(); estado[id] = 2; out.push(id);
  }
  for (const id of ids) visita(id, []);
  return { orden: out, ciclos, depende: dep };
}

/** ?<nombre>=0|no|false|off apaga; =1|si|sí|true|on (o sin valor) enciende; si no está, undefined. Con valor (EV2: ?ui=capas), enciende si el
 *  parámetro lo nombra (?ui=capas o ?ui=capas,otra), apaga con 0|no|false|off y, si nombra otra cosa o va sin valor, undefined. */
function valorUrl(busqueda: string | null | undefined, nombre: string | undefined, valor?: string): boolean | undefined {
  if (!nombre) return undefined;
  const m = new RegExp("[?&]" + nombre + "(?:=([^&#]*))?(?:[&#]|$)").exec(busqueda || "");
  if (!m) return undefined;
  const v = decodeURIComponent(m[1] || "").toLowerCase();
  const apaga = v === "0" || v === "no" || v === "false" || v === "off";
  if (valor) return v.split(",").indexOf(valor) >= 0 ? true : apaga ? false : undefined;
  return v === "" || v === "1" || v === "si" || v === "sí" || v === "true" || v === "on" ? true : apaga ? false : undefined;
}

/** ¿Encendido? Precedencia: URL > servidor (bloque «componentes» de la configuración) > defecto del manifiesto. */
function encendido(d: Pick<Manifiesto, "id" | "bandera">, busqueda: string, servidor: ConfigComponentes | null): Encendido {
  const u = valorUrl(busqueda, d.bandera && d.bandera.url, d.bandera && d.bandera.valor);
  if (u !== undefined) return { activo: u, origen: "url" };
  const s = servidor && servidor[d.id];
  if (s && typeof s.activo === "boolean") return { activo: s.activo, origen: "servidor" };
  return { activo: !!(d.bandera && d.bandera.defecto), origen: "defecto" };
}

/** El bloque «componentes» de la configuración (contratos/config.schema.json): { "<id>": { activo: bool, parametros?: {} } }. */
function validaConfig(c: unknown): string[] {
  const e: string[] = [];
  if (!esObjeto(c) || Array.isArray(c)) return ["componentes: objeto { id: { activo, parametros? } }"];
  for (const id of Object.keys(c)) {
    const x = c[id];
    if (!ID.test(id)) e.push(id + ": id no válido");
    if (!esObjeto(x) || typeof x.activo !== "boolean") e.push(id + ": falta activo (true|false)");
    else for (const k of Object.keys(x)) if (k !== "activo" && k !== "parametros") e.push(id + "." + k + ": campo desconocido");
    if (esObjeto(x) && x.parametros !== undefined && (typeof x.parametros !== "object" || x.parametros === null || Array.isArray(x.parametros))) e.push(id + ".parametros: objeto");
  }
  return e;
}

/** Cuándo toca una fase con periodo: acumula dt; devuelve el dt acumulado si toca (y lo pone a cero) o −1. */
function toca(est: EstadoFase, periodo: number, dt: number): number {
  est.acum += dt;
  if (est.acum < periodo) return -1;
  const a = est.acum; est.acum = 0; return a;
}

/** MU2-5: los mundos de un componente (sin el campo, el exterior; con «todos», cada uno de MUNDOS) y si es de un mundo. */
function mundosDe(d: Pick<Manifiesto, "mundos">): readonly IdMundo[] { return d.mundos === TODOS ? MUNDOS : d.mundos && d.mundos.length ? d.mundos : DEFECTO_MUNDOS; }
/** A3-6a: ¿es de todo mundo? */
function deTodos(d: Pick<Manifiesto, "mundos">): boolean { return d.mundos === TODOS; }
function deMundo(d: Pick<Manifiesto, "mundos">, id: IdMundo | null): boolean { return id !== null && mundosDe(d).indexOf(id) >= 0; }

export const ComponentesPuro = { FASES, MUNDOS, TODOS, valida, orden, valorUrl, encendido, validaConfig, toca, mundosDe, deMundo, deTodos };

/** El Bus del legado (02c_componentes.js; contratos/eventos.json). */
export interface BusComponentes {
  on(ev: string, fn: (datos?: any) => void): () => void;
  emite(ev: string, datos?: unknown): number;
}
/** El reparto del JS por bloque (02c Reparto, Q0h): solo se lee el reloj si está encendido. */
export interface RepartoComponentes { readonly on: boolean; reg(nombre: string): number; pasa(bloque: number, q: number): number }
export interface DepsComponentes {
  bus: BusComponentes;
  reparto?: RepartoComponentes | null;
  /** el reloj en ms (performance.now): solo se lee midiendo (reparto.on) */
  ahora(): number;
  /** location.search, leída al arrancar */
  busqueda?(): string;
  /** para el <script type="application/json" id="config"> de la página (su bloque «componentes») */
  documento?: { getElementById(id: string): { textContent: string | null } | null } | null;
  consola?: { error(...a: unknown[]): void; warn(...a: unknown[]): void } | null;
  /** MU5-n (A3-8a): donde se publica window.__componentes (el resumen, para las pruebas y ?debug); sin ella, no se publica */
  ventana?: { __componentes?: () => FilaResumen[] } | null;
}

/** Una fila del resumen (window.__componentes, ?debug). */
export interface FilaResumen {
  id: string; activo: boolean; origen: string; motivo: string; montajes: number; fases: string[];
  presupuesto: PresupuestoComponente; cultivo: string | string[] | null; mundos: IdMundo[];
}

interface Registro {
  def: Manifiesto; activo: boolean; api: ApiComponente | null; motivo: string; origen: string;
  limpia: (() => void)[]; est: Partial<Record<Fase, EstadoFase>>; n: number; ciclo?: string; rp?: number;
}

/** Datos de «mundo:entra» y «mundo:sale» (contratos/eventos.json; AvisoMundo de nucleo/mundos.ts). */
interface AvisoLeido { id?: unknown }

export function creaComponentes(deps: DepsComponentes) {
  const P = ComponentesPuro, bus = deps.bus, defs: Manifiesto[] = [], C = new Map<string, Registro>();
  let ordenIds: string[] = [], arrancado = false, servidor: ConfigComponentes | null = null, busqueda = "";
  // MU2-5: el mundo activo (null entre «mundo:sale» y «mundo:entra») y los vivos (cargados: el activo y los congelados)
  let activoMundo: IdMundo | null = "exterior";
  const vivos = new Set<IdMundo>(["exterior"]);

  function error(...a: unknown[]): void { try { if (deps.consola) deps.consola.error(...a); } catch { /* sin consola */ } }
  function aviso(...a: unknown[]): void { try { if (deps.consola) deps.consola.warn(...a); } catch { /* sin consola */ } }
  const reg = (id: string): Registro => C.get(id) as Registro;
  const vivo = (d: Manifiesto): boolean => P.mundosDe(d).some(m => vivos.has(m));

  function registra(def: Manifiesto): boolean {
    let e = P.valida(def);
    if (!e.length && C.has(def.id)) e = ["id repetido: " + def.id];
    if (e.length) { error("[Componentes] manifiesto no válido (" + (def && def.id) + "): " + e.join("; ")); return false; }
    defs.push(def); C.set(def.id, { def, activo: false, api: null, motivo: "sin arrancar", origen: "", limpia: [], est: {}, n: 0 });
    if (arrancado) { ordena(); decide(def.id); }   // un componente que llega tarde (import() perezoso) se monta al registrarse
    return true;
  }
  function ordena(): void {
    const o = P.orden(defs); ordenIds = o.orden;
    for (const c of o.ciclos) for (const id of c) { const r = C.get(id); if (r) r.ciclo = c.join(" → "); }
  }
  // el contexto que recibe monta(n): lo que se engancha por aquí se suelta solo al liberar
  function contexto(c: Registro): ContextoComponente {
    const s = servidor && servidor[c.def.id];
    const n: ContextoComponente = {
      id: c.def.id,
      parametros: (s && s.parametros) || {},
      limpia<F>(fn: F): F { if (typeof fn === "function") c.limpia.push(fn as () => void); return fn; },
      on(ev, fn) { return n.limpia(bus.on(ev, fn)); },
      emite(ev, datos) { return bus.emite(ev, datos); },
      api,
    };
    return n;
  }
  function dependencias(c: Registro): string[] {   // los componentes de los que consume (por su expone) y que no están montados
    const falta: string[] = [];
    for (const nm of c.def.consume || []) for (const d of defs) if (d.id !== c.def.id && d.expone.indexOf(nm) >= 0 && !(C.has(d.id) && reg(d.id).activo)) falta.push(d.id);
    return falta;
  }
  function monta(id: string): boolean {
    const c = C.get(id);
    if (!c || c.activo) return !!(c && c.activo);
    if (c.ciclo) { c.motivo = "ciclo: " + c.ciclo; return false; }
    const falta = dependencias(c);
    if (falta.length) { c.motivo = "falta " + falta.join(", "); return false; }
    const n = contexto(c);
    try {
      const r = c.def.monta(n);
      c.api = r && typeof r === "object" ? r : {}; c.activo = true; c.motivo = ""; c.n++;
      const fs = c.def.fases || {}, k = ordenIds.indexOf(id);
      for (const f of Object.keys(fs) as Fase[]) { const per = fs[f] as number; c.est[f] = { acum: per > 0 ? per * ((k + 1) % 4) / 4 : 0 }; }   // repartir los «tarde» entre fotogramas
    } catch (e) {
      for (const fn of c.limpia.splice(0)) { try { fn(); } catch { /* sigue */ } }
      c.motivo = "error al montar: " + ((e && (e as Error).message) || e); error("[Componentes] " + id, e);
      return false;
    }
    bus.emite("componentes:cambia", { id, activo: true });
    return true;
  }
  function libera(id: string, motivo?: string): boolean {
    const c = C.get(id);
    if (!c || !c.activo) return false;
    // primero, los que dependen de este
    for (const d of defs) if (d.id !== id && reg(d.id).activo && (d.consume || []).some(nm => c.def.expone.indexOf(nm) >= 0)) libera(d.id, "sin " + id);
    try { c.def.libera(c.api); } catch (e) { error("[Componentes] libera " + id, e); }
    for (const fn of c.limpia.splice(0).reverse()) { try { fn(); } catch { /* sigue */ } }
    c.activo = false; c.api = null; c.motivo = motivo || "apagado";
    bus.emite("componentes:cambia", { id, activo: false });
    return true;
  }
  function decide(id: string): void {
    const c = reg(id), q = P.encendido(c.def, busqueda, servidor); c.origen = q.origen;
    if (q.activo && !vivo(c.def)) {   // MU2-5: encendido, pero ninguno de sus mundos está cargado
      const m = "fuera de su mundo (" + P.mundosDe(c.def).join(", ") + ")";
      if (c.activo) libera(id, m); else c.motivo = m;
      return;
    }
    if (q.activo) monta(id); else if (c.activo) libera(id, "apagado (" + q.origen + ")"); else c.motivo = "apagado (" + q.origen + ")";
  }
  function leeConfigPagina(): unknown {   // si la página trae <script type="application/json" id="config"> (el servidor puede dejarla ahí), su bloque «componentes»
    try {
      const el = deps.documento ? deps.documento.getElementById("config") : null;
      if (el && el.textContent && el.textContent.trim()) { const j = JSON.parse(el.textContent); return j && j.componentes; }
    } catch { /* sin configuración en la página */ }
    return null;
  }
  function configura(bloque: unknown): boolean {   // el bloque «componentes» de /api/config (C6) o de la página; enciende y apaga en caliente (la URL sigue mandando)
    const e = P.validaConfig(bloque);
    if (e.length) { aviso("[Componentes] configuración no válida: " + e.join("; ")); return false; }
    servidor = bloque as ConfigComponentes;
    if (arrancado) ordenIds.forEach(decide);
    return true;
  }
  function arranca(): void {
    if (arrancado) return;
    arrancado = true; busqueda = (deps.busqueda && deps.busqueda()) || "";
    const cfg = leeConfigPagina(); if (cfg) configura(cfg);
    ordena(); ordenIds.forEach(decide);
  }
  // el bucle (nucleo/bucle.ts por 90_final.js): una fase para todos los encendidos del mundo activo, en orden de dependencias. Un componente que falla
  // en su fase se apaga (y lo dice) para no romper el fotograma de los demás
  function actualiza(fase: Fase, dt: number, t: number): void {
    for (let i = 0; i < ordenIds.length; i++) {
      const c = reg(ordenIds[i] as string);
      if (!c.activo || !P.deMundo(c.def, activoMundo)) continue;
      const fn = c.def.actualiza && c.def.actualiza[fase];
      if (!fn) continue;
      const per = (c.def.fases as Partial<Record<Fase, number>>)[fase] as number;
      let d = dt;
      if (per > 0) { d = P.toca(c.est[fase] as EstadoFase, per, dt); if (d < 0) continue; }
      const R = deps.reparto;
      if (R && R.on) {
        if (c.rp === undefined) c.rp = R.reg("c:" + c.def.id);
        const q = deps.ahora();
        try { fn(d, t, c.api as ApiComponente); } catch (e) { falla(c, fase, e); }
        R.pasa(c.rp, q);
        continue;
      }
      try { fn(d, t, c.api as ApiComponente); } catch (e) { falla(c, fase, e); }
    }
  }
  function falla(c: Registro, fase: Fase, e: unknown): void {
    error("[Componentes] " + c.def.id + " en «" + fase + "»", e);
    libera(c.def.id, "error en «" + fase + "»: " + ((e && (e as Error).message) || e));
  }
  function api(id: string): ApiComponente | null { const c = C.get(id); return c && c.activo ? c.api : null; }
  function activo(id: string): boolean { const c = C.get(id); return !!(c && c.activo); }
  function enciende(id: string, si: boolean): boolean { if (!C.has(id)) return false; return si ? monta(id) : libera(id, "apagado a mano"); }
  function resumen(): FilaResumen[] {
    return (ordenIds.length ? ordenIds : defs.map(d => d.id)).map(id => {
      const c = reg(id), d = c.def;
      return { id, activo: c.activo, origen: c.origen, motivo: c.motivo, montajes: c.n, fases: Object.keys(d.fases || {}), presupuesto: d.presupuesto, cultivo: d.cultivo || null, mundos: P.mundosDe(d).slice() };
    });
  }

  // ---------- MU2-5: el filtro por mundo
  // «mundo:entra»: ese mundo pasa a ser el activo (sus componentes vuelven a correr sus fases) y, si no estaba cargado, se montan los suyos
  function alEntrar(datos?: AvisoLeido): void {
    const id = datos && datos.id;
    if (!esMundo(id)) return;
    activoMundo = id;
    if (vivos.has(id)) return;
    vivos.add(id);
    if (arrancado) for (const cid of ordenIds.slice()) { const c = reg(cid); if (!c.activo && P.deMundo(c.def, id)) decide(cid); }
  }
  // «mundo:sale»: el que sale queda congelado (sus componentes, montados pero sin fases) y, hasta el siguiente «mundo:entra», no hay mundo activo
  function alSalir(datos?: AvisoLeido): void {
    const id = datos && datos.id;
    if (esMundo(id) && activoMundo === id) activoMundo = null;
  }
  /** El mundo se ha liberado (dispose de todo; MU2-6 lo llama al liberar un mundo): se liberan los componentes que se quedan sin ningún mundo vivo. */
  function liberaMundo(id: IdMundo): number {
    if (!vivos.delete(id)) return 0;
    if (activoMundo === id) activoMundo = null;
    let n = 0;
    for (const cid of ordenIds.slice().reverse()) { const c = reg(cid); if (c.activo && !vivo(c.def) && libera(cid, "su mundo se liberó (" + id + ")")) n++; }
    return n;
  }
  function mundo(): IdMundo | null { return activoMundo; }

  bus.on("mundo:entra", alEntrar);
  bus.on("mundo:sale", alSalir);

  // MU5-n (A3-8a): pruebas (antes lo publicaba 02c_componentes.js)
  var ventana = deps.ventana;
  if (ventana) ventana.__componentes = function () { return resumen(); };
  return {
    registra,
    arranca,
    actualiza,
    configura,
    api,
    activo,
    enciende,
    libera: (id: string): boolean => libera(id, "apagado a mano"),
    resumen,
    mundo,
    liberaMundo,
  };
}

export type Componentes = ReturnType<typeof creaComponentes>;
