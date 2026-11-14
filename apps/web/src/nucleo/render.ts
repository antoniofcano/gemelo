// El renderizador elegido y la lectura de lo dibujado (antes apps/web/motor/02h_render.js; MUNDOS §6 y §9.4, pieza 2).
// AG-3a / F1 (doc/sistema/MULTIVIEW.md §4, ADR-0031): qué renderizador y qué build, y la lectura de lo dibujado con la misma forma para los dos.
// Hoy siempre el WebGLRenderer clásico (03_escena); la build la fija el empaquetado: pantalla (three 0.186.1) o, en el Quest, VR (super-three 0.185.0, publicada). Lo que ofrece:
//   Render.pedido / Render.tipo   ?render=nuevo (o ?renderer=webgpu, el nombre de MU5/MU6: MATERIALES.md §4) queda RESERVADO para el WebGPURenderer (MU6): se apunta y se avisa de que aún no existe; tipo sigue «clasico»
//   Render.build                  «pantalla» (three) o «vr» (super-three, la build del Quest: apps/web/herramientas/builds.mjs); lo inyecta Vite (__GEMELO_BUILD__)
//   Render.tono                   AG-2.5: { tono, constante, expo, pedido, advertencia, origen } de ?tono=neutro|agx|aces|neutral (la URL, luego el ajuste «vista.tono», luego neutro) y ?expo= (solo URL)
//   Render.arranca(rd, fn)        el primer fotograma, tolerante a un `await rd.init()` futuro: el clásico no tiene init() y fn corre ya, como siempre
//   InfoDibujo.lee(rd, o?)        { renderizador, fotograma, llamadas, triangulos, puntos, lineas, geometrias, texturas, programas } del clásico
//                                 (info.render.calls, info.render.frame, info.programs = array) y del nuevo (info.render.drawCalls, info.frame, info.memory.programs = número)
// Ojo con las cifras: con multiview el nuevo cuenta UNA llamada por objeto para los dos ojos; el clásico, dos. Se rotulan por renderizador (MULTIVIEW §2.4).
// Lo nuevo, aditivo (MUNDOS §6): Render.enlaza(...) guarda el renderizador, y con él Render.info(), Render.memoria() (L1-07) y Render.compila(obj) (L7-04).
// Nada de aquí lee globales al cargarse (ni location, ni localStorage, ni __GEMELO_BUILD__): entran por argumento de creaRender. Presupuesto (regla 6): no dibuja ni reserva nada.
// three/webgpu y three/tsl solo podrán importarse desde este fichero o desde nucleo/materiales (dependency-cruiser); hoy no se importa three.

export type TipoRender = "clasico" | "nuevo";
export type BuildRender = "pantalla" | "vr";
export type ClaveTono = "neutro" | "agx" | "aces" | "neutral";
export interface EleccionTipo { pedido: string; tipo: TipoRender; advertencia: string }
export interface EleccionTono { pedido: string; tono: ClaveTono; constante: string; expo: number; advertencia: string; origen: "url" | "ajuste" | "defecto" }
export interface InfoDibujoLeida { renderizador: TipoRender; fotograma: number; llamadas: number; triangulos: number; puntos: number; lineas: number; geometrias: number; texturas: number; programas: number }
export interface MemoriaRender { geometrias: number; texturas: number; bytesEstimados: number }

/** lo que se necesita de renderer.info (WebGLInfo del clásico, common/Info del nuevo), sin depender de three */
export interface InfoRd {
  frame?: number;
  render?: { frame?: number; calls?: number; drawCalls?: number; triangles?: number; points?: number; lines?: number };
  memory?: { geometries?: number; textures?: number; programs?: number };
  programs?: { length?: number } | null;
}
/** lo que se necesita del renderizador */
export interface RenderizadorMinimo {
  info?: InfoRd;
  init?: () => unknown;
  compileAsync?: (obj: unknown, camara: unknown, escena?: unknown) => Promise<unknown>;
  compile?: (obj: unknown, camara: unknown, escena?: unknown) => unknown;
}

const TIPOS: readonly string[] = ["clasico", "nuevo"], BUILDS: readonly string[] = ["pantalla", "vr"];
const TONOS: Readonly<Record<ClaveTono, string>> = { neutro: "NoToneMapping", agx: "AgXToneMapping", aces: "ACESFilmicToneMapping", neutral: "NeutralToneMapping" };
const tieneTono = (k: string): k is ClaveTono => Object.prototype.hasOwnProperty.call(TONOS, k);

function num(v: unknown): number { return typeof v === "number" && isFinite(v) ? v : 0; }

// MU5-0 (doc/sistema/MATERIALES.md §4): ?renderer=webgl|webgpu es el nombre de MU5/MU6 y manda; ?render=clasico|nuevo, el de F1 (ADR-0031), sigue valiendo
// igual. webgpu = nuevo, webgl = clasico. Lo traduce a ?render= y sigue como siempre
const RENDERER: Readonly<Record<string, TipoRender>> = { webgl: "clasico", webgpu: "nuevo" };
function pedidoDe(q: string): string {
  const r = /[?&]renderer=([^&#]*)/.exec(q);
  if (r) { const v = decodeURIComponent(r[1] as string).toLowerCase(); return Object.prototype.hasOwnProperty.call(RENDERER, v) ? (RENDERER[v] as string) : v ? "renderer=" + v : ""; }
  const m = /[?&]render=([^&#]*)/.exec(q);
  return m ? decodeURIComponent(m[1] as string).toLowerCase() : "";
}
// ?render=clasico|nuevo (o ?renderer=webgl|webgpu). hayNuevo: ¿esta build trae el WebGPURenderer? (hasta MU6, no). Devuelve { pedido, tipo, advertencia }
function eligeTipo(busqueda: unknown, hayNuevo: boolean): EleccionTipo {
  const p = pedidoDe(typeof busqueda === "string" ? busqueda : "");
  if (p.indexOf("renderer=") === 0) return { pedido: p, tipo: "clasico", advertencia: "?" + p + " no existe (webgl | webgpu): se usa el clásico" };
  if (!p) return { pedido: "", tipo: "clasico", advertencia: "" };
  if (TIPOS.indexOf(p) < 0) return { pedido: p, tipo: "clasico", advertencia: "?render=" + p + " no existe (clasico | nuevo): se usa el clásico" };
  if (p === "nuevo" && !hayNuevo) return { pedido: p, tipo: "clasico", advertencia: "?render=nuevo (o ?renderer=webgpu) está reservado para el WebGPURenderer (ADR-0031; MU6), que aún no existe en el motor: se usa el clásico" };
  return { pedido: p, tipo: p as TipoRender, advertencia: "" };
}

// AG-2.5: ?tono=neutro|agx|aces|neutral (+ ?expo=0.1..4). «neutro» = NoToneMapping, lo de siempre (por defecto y ante cualquier valor desconocido o ausente).
// constante es el NOMBRE de la constante de three (THREE[constante]), para no depender de THREE aquí.
// ajuste: el guardado de Configuración → Vista («vista.tono», una de las cuatro claves) o undefined. Orden de mando: la URL, luego el ajuste, luego neutro. origen: "url" | "ajuste" | "defecto"
function eligeTono(busqueda: unknown, ajuste?: unknown): EleccionTono {
  const q = typeof busqueda === "string" ? busqueda : "", mt = /[?&]tono=([^&#]*)/.exec(q), me = /[?&]expo=([^&#]*)/.exec(q);
  const r: EleccionTono = { pedido: "", tono: "neutro", constante: TONOS.neutro, expo: 1, advertencia: "", origen: "defecto" };
  const aj: ClaveTono | "" = typeof ajuste === "string" && tieneTono(ajuste) ? ajuste : "";
  if (mt) {
    const p = decodeURIComponent(mt[1] as string).toLowerCase(); r.pedido = p;
    if (p && tieneTono(p)) { r.tono = p; r.constante = TONOS[p]; r.origen = "url"; }
    else if (p) r.advertencia = "?tono=" + p + " no existe (neutro | agx | aces | neutral): se usa " + (aj ? "el ajuste" : "neutro");
  }
  if (r.origen === "defecto" && aj) { r.tono = aj; r.constante = TONOS[aj]; r.origen = aj === "neutro" ? "defecto" : "ajuste"; }
  if (me && r.tono !== "neutro") {
    const v = Number(decodeURIComponent(me[1] as string).replace(",", "."));
    if (isFinite(v) && me[1] !== "") r.expo = Math.min(4, Math.max(0.1, v)); else r.advertencia = (r.advertencia ? r.advertencia + "; " : "") + "?expo=" + me[1] + " no es un número: se usa 1";
  }
  return r;
}

function buildDe(b: unknown): BuildRender { return BUILDS.indexOf(b as string) >= 0 ? (b as BuildRender) : "pantalla"; }
function esNuevo(info?: InfoRd | null): boolean { return !!(info && info.render && typeof info.render.drawCalls === "number"); }
function fotograma(info?: InfoRd | null): number { if (!info) return 0; return esNuevo(info) ? num(info.frame) : num(info.render && info.render.frame); }
function llamadas(info?: InfoRd | null): number { if (!info || !info.render) return 0; return esNuevo(info) ? num(info.render.drawCalls) : num(info.render.calls); }
function triangulos(info?: InfoRd | null): number { return num(info && info.render && info.render.triangles); }

// la misma forma para los dos renderizadores; o: objeto donde escribir (para no crear uno por llamada)
function lee(info?: InfoRd | null, o?: Partial<InfoDibujoLeida>): InfoDibujoLeida {
  const s = (o || {}) as InfoDibujoLeida;
  const r = (info && info.render) || {}, m = (info && info.memory) || {}, nuevo = esNuevo(info);
  s.renderizador = nuevo ? "nuevo" : "clasico";
  s.fotograma = fotograma(info);
  s.llamadas = llamadas(info);
  s.triangulos = num(r.triangles); s.puntos = num(r.points); s.lineas = num(r.lines);
  s.geometrias = num(m.geometries); s.texturas = num(m.textures);
  s.programas = nuevo ? num(m.programs) : info && info.programs && typeof info.programs.length === "number" ? info.programs.length : 0;
  return s;
}

/** L1-07: lo que cuenta renderer.info.memory. bytesEstimados es 0 («no estimado») hasta que L1-07 lo alimente con los tamaños reales de las texturas: three no los da. */
function memoria(info?: InfoRd | null): MemoriaRender {
  const m = (info && info.memory) || {};
  return { geometrias: num(m.geometries), texturas: num(m.textures), bytesEstimados: 0 };
}

// el primer fotograma: si el renderizador pide init() (el nuevo: render() lanza sin él) se espera; si no, fn corre ahora mismo, como siempre
function arranca(rd: RenderizadorMinimo | null | undefined, fn: () => void, alFallar?: (e: unknown) => void): Promise<void> | null {
  if (!rd || typeof rd.init !== "function") { fn(); return null; }
  return Promise.resolve(rd.init()).then(function () { fn(); }, function (e: unknown) { if (alFallar) alFallar(e); else throw e; });
}

export const RenderPuro = { TIPOS, BUILDS, RENDERER, eligeTipo, TONOS, eligeTono, buildDe, esNuevo, fotograma, llamadas, triangulos, lee, arranca, memoria };

export const InfoDibujo = {
  lee: function (rd?: RenderizadorMinimo | null, o?: Partial<InfoDibujoLeida>): InfoDibujoLeida { return lee(rd && rd.info, o); },
  fotograma: function (rd?: RenderizadorMinimo | null): number { return fotograma(rd && rd.info); },
  llamadas: function (rd?: RenderizadorMinimo | null): number { return llamadas(rd && rd.info); },
  triangulos: function (rd?: RenderizadorMinimo | null): number { return triangulos(rd && rd.info); }
};

/** Lo que el legado presta a la fábrica: nada se lee de globales aquí. */
export interface DepsRender {
  /** location.search ("" si no hay) */
  busqueda?: string;
  /** __GEMELO_BUILD__ (lo inyecta Vite) */
  build?: unknown;
  /** el almacén del navegador (window.localStorage), como función porque pedirlo puede lanzar: de él se lee UNA vez «gemelo.ajustes.vista.tono» (33_ajustes se monta mucho después) */
  almacen?: (() => { getItem(clave: string): string | null }) | null;
  /** console, para los avisos */
  consola?: { warn(...a: unknown[]): void; error(...a: unknown[]): void } | null;
}

/** Con lo que el núcleo compila: el renderizador, la escena, la cámara y, si hay sesión XR, la cámara de la sesión. */
export interface EnlaceRender {
  rd: RenderizadorMinimo;
  escena?: unknown;
  camara?: unknown;
  /** la cámara XR si hay sesión (L7-04: precompilar con la variante multiview), o null */
  camaraXr?: () => unknown;
}

/** el ajuste guardado: «gemelo.ajustes.<clave>» (JSON) o undefined (sin almacén, sin clave o con basura) */
function ajusteGuardado(almacen: DepsRender["almacen"], clave: string): unknown {
  try { const s = almacen ? almacen().getItem("gemelo.ajustes." + clave) : null; return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; }
}

export function creaRender(deps: DepsRender) {
  const d = deps || {}, consola = d.consola || null;
  const e = eligeTipo(d.busqueda || "", false);
  if (e.advertencia && consola) consola.warn("render: " + e.advertencia);
  const b = buildDe(d.build);
  const t = eligeTono(d.busqueda || "", ajusteGuardado(d.almacen, "vista.tono"));   // AG-2.5; la URL, luego el ajuste (Configuración → Vista), luego neutro
  if (t.advertencia && consola) consola.warn("tono: " + t.advertencia);
  let enlace: EnlaceRender | null = null;
  return {
    pedido: e.pedido, tipo: e.tipo, advertencia: e.advertencia, build: b, tono: t,
    arranca: function (rd: RenderizadorMinimo | null | undefined, fn: () => void): Promise<void> | null {
      return arranca(rd, fn, function (err) { if (consola) consola.error("render: init() falló", err); });
    },
    /** guarda el renderizador (y la escena y las cámaras) para info(), memoria() y compila(); lo llama 03_escena tras crearlo */
    enlaza: function (en: EnlaceRender): void { enlace = en; },
    info: function (o?: Partial<InfoDibujoLeida>): InfoDibujoLeida { return lee(enlace && enlace.rd && enlace.rd.info, o); },
    memoria: function (): MemoriaRender { return memoria(enlace && enlace.rd && enlace.rd.info); },
    /** compileAsync con la cámara XR si hay sesión; sin compileAsync, compile; si falla, sigue sin romper */
    compila: function (obj: unknown): Promise<void> {
      const en = enlace;
      if (!en || !en.rd) return Promise.resolve();
      const rd = en.rd, xr = en.camaraXr ? en.camaraXr() : null, cam = xr || en.camara;
      try {
        if (typeof rd.compileAsync === "function") return Promise.resolve(rd.compileAsync(obj, cam, en.escena)).then(function () {}, function () {});
        if (typeof rd.compile === "function") rd.compile(obj, cam, en.escena);
      } catch (err) { /* sin compilar: el primer fotograma compila, como siempre */ }
      return Promise.resolve();
    }
  };
}
