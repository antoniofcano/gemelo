// El gestor de mundos (MUNDOS §2-§3, ADR-0033; MU2-1). Mantiene exactamente UN mundo activo y hace el cambio a oscuras:
//   en → cerrando (el fundido cierra y se QUEDA a negro) → saliendo (sale() y congela() del que estaba; sus trabajos de la Cola, cancelados)
//      → cargando (import() perezoso y carga(), con tope de tiempo) → entrando (entra() del nuevo) → abriendo (libera() del viejo si su política
//      lo pide; el fundido abre) → en.
// Si la carga falla o agota el tiempo, o si entra() del nuevo falla, se vuelve al mundo de antes (que estaba congelado, no liberado) y se abre el
// velo: nunca se queda nadie a oscuras ni nada a medias (la Cola y la señal del nuevo se cancelan y el nuevo se libera).
// Vive en nucleo/ y no en mundos/ (cambio respecto a MUNDOS §1, explicado en §3): el legado solo ve @gemelo/nucleo por el puente, y el gestor
// es maquinaria genérica, como el Bucle, que no sabe nada de ningún mundo concreto. El World completo (sala, marco, presupuesto, ambiente) está en
// mundos/mundo.ts y extiende el MundoBase de aquí.
// Nada de aquí lee globales al cargarse ni toca renderer, scene ni renderer.xr: el fundido, la Cola, el reloj, el tope de tiempo, el permiso y el
// contexto de cada mundo entran por argumento de creaWorldManager({ … }). Presupuesto (regla 6): no dibuja ni reserva nada por fotograma.
import { creaColaDeMundo } from "./cola.ts";
import type { ColaConDueno, ColaDeMundo } from "./cola.ts";
import type { Ambiente } from "./ambiente.ts";

/** Los mundos. «vacio» es el interior de prueba de MU2-8 (`?mundo=vacio`), para medir el exterior congelado sin ningún modelo. */
export type IdMundo = "exterior" | "molino" | "bodega" | "vacio";
/** En el marco del mundo: x este, y norte (m), ang (rad); como hoy pp.x/pp.y/pp.ang de 12_paseo. */
export interface Pose2 { x: number; y: number; ang: number }

/** Una puerta entre dos mundos (MUNDOS §5). Su posición sale del índice o de la configuración del servidor, nunca del código. */
export interface Puerta {
  readonly id: string;
  readonly de: IdMundo;
  readonly a: IdMundo;
  /** en el marco de «de» */
  readonly pos: { x: number; y: number };
  /** radio de cercanía (m) */
  readonly radio: number;
  /** hay que alejarse ≥ radio + histeresis para que se rearme */
  readonly histeresis: number;
  /** en el marco de «a»: 1,5-2 m dentro y mirando hacia dentro */
  readonly llegada: Pose2;
  readonly requiere?: "sesion" | "invitacion" | "aforo";
}

/** Lo que el gestor presta a cada mundo; el Contexto entero de MUNDOS §6 (mundos/mundo.ts) lo extiende. */
export interface ContextoBase {
  readonly id: IdMundo;
  /** se aborta si la carga falla o agota el tiempo, y al liberar el mundo (no al congelarlo: congelado, el mundo conserva su contexto) */
  readonly senal: AbortSignal;
  /** la Cola con dueño = id: cancelaTodo() no toca a otros mundos */
  readonly cola: ColaDeMundo;
  /** como n.limpia de Componentes (02c_componentes.js): se llama al liberar, después de libera() */
  limpia(fn: () => void): void;
}

/** Lo que el gestor necesita de un mundo: el ciclo de vida y los delegados de la locomoción (MUNDOS §2). */
export interface MundoBase<C extends ContextoBase = ContextoBase> {
  readonly id: IdMundo;
  /** qué hacer con él al salir (la política de §3; decisión 218: en MU2 se congela; se libera cuando sepa, MU5). Por defecto «congela». */
  readonly alSalir?: "congela" | "libera";
  /** import() de assets, glb, KTX2; puede tardar; abortable con ctx.senal. No toca la escena. */
  carga(ctx: C): Promise<void>;
  /** cuelga su raíz y registra sus entidades; síncrono, a oscuras. Su Ambiente lo aplica el gestor justo después (MU2-7: deps.aplicaAmbiente) */
  entra(desde: Puerta | null, llegada: Pose2 | null): void;
  /** cada fotograma, solo si está activo */
  actualiza(dt: number, t: number): void;
  /** MU2-6, opcional: lo último del mundo en el fotograma, tras los pasos de todo mundo (componentes, láminas, Cola) y justo antes del render, con las
   *  mismas reglas que actualiza(). El exterior: Escena3D.actualiza, que tiene que ver la cámara de este fotograma y apuntar su deuda tras Cola.corre. */
  antesDelRender?(dt: number, t: number): void;
  /** descuelga la raíz y quita sus entidades; devuelve dónde estaba quien mira. Su Ambiente no se deshace: lo sustituye el del mundo que entra */
  sale(): Pose2;
  /** sigue en memoria, sin actualizar, sin Cola y sin pedir teselas; puede volver a entra() sin carga() */
  congela(): void;
  /** dispose de todo; tras esto hace falta carga(). Ha de poder llamarse dos veces (una carga que llega tarde se vuelve a liberar) */
  libera(): void;
  /** cota del suelo en su marco (m, sin exagerar) */
  suelo(x: number, y: number): number;
  /** ¿se puede estar aquí? */
  dentro(x: number, y: number): boolean;
  /** el punto corregido si choca, o null */
  obstaculo(x: number, y: number, radio: number): Pose2 | null;
  /** MU2-7, opcional aquí (World lo exige): su cielo, fondo, niebla, luces, near/far y exag (nucleo/ambiente.ts). El gestor lo aplica tras entra() */
  ambiente?(): Ambiente;
}

export type EstadoCambio = "en" | "cerrando" | "saliendo" | "cargando" | "entrando" | "abriendo";
export type EventoCambio = "pide" | "arranca" | "cerrado" | "salido" | "cargado" | "entrado" | "abierto" | "falla";
/** mismo: ya se está en ese mundo · ocupado: hay un cambio en curso · sin_registrar: nadie registró ese id · sin_permiso: la api (o quien sea) dice que
 *  no · fallo_sale / fallo_carga / fallo_entra: lanzó una excepción sale() del viejo, el import() o carga() del nuevo, o entra() del nuevo · tiempo: la
 *  carga pasó del tope. En todos los fallos se vuelve al mundo de antes. */
export type MotivoCambio = "mismo" | "ocupado" | "sin_registrar" | "sin_permiso" | "fallo_sale" | "fallo_carga" | "fallo_entra" | "tiempo";
export interface ResultadoCambio {
  ok: boolean;
  /** el mundo activo al terminar (el nuevo si ok; el de antes si no; null si no hay ninguno) */
  mundo: IdMundo | null;
  motivo?: MotivoCambio;
  error?: unknown;
  /** lo que tardó, con el reloj de deps.ahora (0 si no se dio) */
  ms: number;
}
/** Cómo está un mundo registrado: sin cargar (o liberado), cargado y congelado («listo»), o el activo. */
export type FichaEstado = "sin_registrar" | "sin_cargar" | "listo" | "activo";

// La máquina de estados, sin efectos. null = evento que no vale en ese estado (error de programación: el gestor lo convierte en excepción).
// «falla» desde saliendo o cargando lleva a entrando (se vuelve a entrar en el de antes); desde entrando (falló entra() del nuevo) se queda en
// entrando para hacer esa misma vuelta. «arranca» es el primer mundo, sin fundido ni mundo de antes.
const TABLA: Readonly<Record<EstadoCambio, Partial<Record<EventoCambio, EstadoCambio>>>> = {
  en: { pide: "cerrando", arranca: "cargando" },
  cerrando: { cerrado: "saliendo" },
  saliendo: { salido: "cargando", falla: "entrando" },
  cargando: { cargado: "entrando", falla: "entrando" },
  entrando: { entrado: "abriendo", falla: "entrando" },
  abriendo: { abierto: "en" },
};
const ESTADOS: readonly EstadoCambio[] = ["en", "cerrando", "saliendo", "cargando", "entrando", "abriendo"];
/** con estos estados el mundo activo se actualiza cada fotograma (en cerrando y abriendo se ve a través del fundido) */
const ACTUALIZA_EN: readonly EstadoCambio[] = ["en", "cerrando", "abriendo"];
/** tope de import() + carga() por defecto [SUPUESTO: sin medir; la bodega por 4G en la finca se mide en MU3] */
const TIEMPO_MAX_MS = 20000;

function transicion(estado: EstadoCambio, evento: EventoCambio): EstadoCambio | null {
  return TABLA[estado][evento] ?? null;
}

export const WorldManagerPuro = { ESTADOS, TABLA, ACTUALIZA_EN, TIEMPO_MAX_MS, transicion };

/** El fundido de 29_vr / 12b_llegada partido en dos (MU2-2): cierra() resuelve con el velo opaco y así se queda hasta abre(). */
export interface Fundido { cierra(): Promise<void>; abre(): Promise<void> }

/** «mundo:entra» y «mundo:sale»: qué mundo entra o sale, y el cambio entero (de dónde viene y adónde va; null = ninguno). En una vuelta atrás,
 *  el de antes «entra» desde el que no pudo entrar. */
export interface AvisoMundo { id: IdMundo; desde: IdMundo | null; hacia: IdMundo | null }

export interface DepsWorldManager<C extends ContextoBase, W extends MundoBase<C>> {
  fundido: Fundido;
  /** la Cola del núcleo (creaCola): de ella sale la ColaDeMundo de cada uno y con ella se cancelan sus trabajos al salir */
  cola: ColaConDueno;
  /** setTimeout de la ventana, devolviendo cómo cancelarlo */
  temporizador(fn: () => void, ms: number): () => void;
  /** tope de import() + carga(), en ms (por defecto WorldManagerPuro.TIEMPO_MAX_MS) */
  tiempoMax?: number;
  /** el reloj en ms (performance.now), solo para ResultadoCambio.ms */
  ahora?(): number;
  /** el Contexto entero de cada mundo, montado sobre lo que da el gestor (por defecto, solo eso) */
  contexto?(base: ContextoBase): C;
  /** la política al salir de un mundo (por defecto, su alSalir, y si no lo dice, «congela») */
  politica?(mundo: W): "congela" | "libera";
  /** ¿se puede entrar? (Puerta.requiere: la api). Se pregunta antes de cerrar el fundido: si no, no se oscurece nada */
  permiso?(a: IdMundo, puerta: Puerta | null): boolean | Promise<boolean>;
  /** MU2-7: aplica el Ambiente del mundo que acaba de entrar (nucleo/ambiente.ts: aplicaAmbiente con la scene, la cámara…). El gestor no toca la
   *  escena: quien lo crea le da esto. Se llama a oscuras, tras entra() (también al volver al de antes y al arrancar); si lanza, cuenta como fallo de entra() */
  aplicaAmbiente?(ambiente: Ambiente, id: IdMundo): void;
  /** «mundo:entra» y «mundo:sale» (contratos/eventos.json, MU2-5) */
  avisa?(evento: "mundo:entra" | "mundo:sale", datos: AvisoMundo): void;
  consola?: { error(...a: unknown[]): void } | null;
}

interface Ficha<C extends ContextoBase, W extends MundoBase<C>> {
  id: IdMundo;
  def: () => Promise<W>;
  mundo: W | null;
  estado: Exclude<FichaEstado, "sin_registrar">;
  ctrl: AbortController | null;
  limpiezas: Array<() => void>;
  intento: number;
  retorno: Pose2 | null;
}

class ErrorTiempo extends Error { constructor(ms: number) { super("la carga pasó de " + ms + " ms"); this.name = "ErrorTiempo"; } }

export function creaWorldManager<C extends ContextoBase = ContextoBase, W extends MundoBase<C> = MundoBase<C>>(deps: DepsWorldManager<C, W>) {
  const fichas = new Map<IdMundo, Ficha<C, W>>();
  const tiempoMax = typeof deps.tiempoMax === "number" && deps.tiempoMax > 0 ? deps.tiempoMax : TIEMPO_MAX_MS;
  const ahora = (): number => (deps.ahora ? deps.ahora() : 0);
  let estado: EstadoCambio = "en", actual: Ficha<C, W> | null = null, enCurso = false;

  function log(...a: unknown[]): void { if (deps.consola) deps.consola.error("[mundos]", ...a); }
  function paso(ev: EventoCambio): void {
    const s = transicion(estado, ev);
    if (s === null) throw new Error("WorldManager: «" + ev + "» no vale en «" + estado + "»");
    estado = s;
  }
  const politicaDe = (w: W): "congela" | "libera" => (deps.politica ? deps.politica(w) : w.alSalir || "congela");
  const intenta = (que: string, fn: () => unknown): void => { try { fn(); } catch (e) { log(que, e); } };

  function registra(def: () => Promise<W>, id: IdMundo): void {
    if (fichas.has(id)) throw new Error("WorldManager: «" + id + "» ya está registrado");
    fichas.set(id, { id, def, mundo: null, estado: "sin_cargar", ctrl: null, limpiezas: [], intento: 0, retorno: null });
  }

  // libera de verdad: libera(), las limpiezas del contexto, la señal abortada y sus trabajos fuera de la Cola. Queda «sin_cargar».
  function libera(f: Ficha<C, W>): void {
    const w = f.mundo;
    if (w) intenta("libera " + f.id, () => w.libera());
    const ls = f.limpiezas; f.limpiezas = [];
    for (const fn of ls) intenta("limpia " + f.id, fn);
    if (f.ctrl) f.ctrl.abort();
    f.ctrl = null;
    deps.cola.cancelaDe(f.id);
    f.estado = "sin_cargar";
  }

  // import() perezoso (una vez) + carga(), con tope de tiempo. Un mundo «listo» (congelado) no se vuelve a cargar.
  function carga(f: Ficha<C, W>): Promise<void> {
    if (f.estado !== "sin_cargar") return Promise.resolve();
    const n = ++f.intento, ctrl = new AbortController();
    f.ctrl = ctrl;
    return new Promise<void>((resuelve, rechaza) => {
      let hecho = false;
      const cancelaT = deps.temporizador(() => {
        if (hecho) return;
        hecho = true; ctrl.abort(); rechaza(new ErrorTiempo(tiempoMax));
      }, tiempoMax);
      (async () => {
        const w = f.mundo || await f.def();
        if (!w || w.id !== f.id) throw new Error("WorldManager: el talón de «" + f.id + "» dio un mundo «" + (w && w.id) + "»");
        f.mundo = w;
        if (ctrl.signal.aborted) return;   // el import() llegó después del tope: ni se empieza carga()
        const base: ContextoBase = { id: f.id, senal: ctrl.signal, cola: creaColaDeMundo(deps.cola, f.id), limpia: fn => { f.limpiezas.push(fn); } };
        const ctx = deps.contexto ? deps.contexto(base) : (base as C);
        await w.carga(ctx);
      })().then(() => {
        if (hecho) {   // llegó después del tope: si nadie lo ha vuelto a pedir, se libera lo que haya hecho mientras tanto
          if (f.intento === n && f.estado === "sin_cargar") libera(f);
          return;
        }
        hecho = true; cancelaT(); f.estado = "listo"; resuelve();
      }, (e: unknown) => {
        if (hecho) return;
        hecho = true; cancelaT(); rechaza(e);
      });
    });
  }

  // entra() y, si el mundo tiene Ambiente y alguien sabe aplicarlo, su Ambiente (MU2-7): siempre juntos, a oscuras
  function entraEn(w: W, desde: Puerta | null, llegada: Pose2 | null): void {
    w.entra(desde, llegada);
    if (deps.aplicaAmbiente && w.ambiente) deps.aplicaAmbiente(w.ambiente(), w.id);
  }

  // Vuelve a entrar en el de antes (estaba congelado: no hace falta cargarlo) y deja el estado en «abriendo».
  function vuelve(viejo: Ficha<C, W> | null, desde: IdMundo): void {
    paso("falla");   // → entrando
    actual = null;
    if (viejo && viejo.mundo && viejo.estado === "listo") {
      const w = viejo.mundo;
      try {
        entraEn(w, null, viejo.retorno);
        viejo.estado = "activo"; actual = viejo;
        if (deps.avisa) deps.avisa("mundo:entra", { id: viejo.id, desde, hacia: viejo.id });
      } catch (e) { log("no se pudo volver a «" + viejo.id + "»", e); }
    }
    paso("entrado");   // → abriendo
  }

  function resultado(t0: number) {
    return (ok: boolean, motivo?: MotivoCambio, error?: unknown): ResultadoCambio => {
      const r: ResultadoCambio = { ok, mundo: actual ? actual.id : null, ms: ahora() - t0 };
      if (motivo) r.motivo = motivo;
      if (error !== undefined) r.error = error;
      return r;
    };
  }

  async function abre(): Promise<void> { try { await deps.fundido.abre(); } catch (e) { log("abre", e); } }

  async function cambia(a: IdMundo, llegada?: Pose2 | null, puerta?: Puerta | null): Promise<ResultadoCambio> {
    const res = resultado(ahora());
    if (enCurso || estado !== "en") return res(false, "ocupado");
    if (actual && actual.id === a) return res(false, "mismo");
    const f = fichas.get(a);
    if (!f) return res(false, "sin_registrar");
    enCurso = true;
    try {
      if (deps.permiso) {
        let si = false;
        try { si = await deps.permiso(a, puerta || null); } catch (e) { log("permiso", e); }
        if (!si) return res(false, "sin_permiso");
      }
      paso("pide");   // → cerrando
      try { await deps.fundido.cierra(); } catch (e) { log("cierra", e); }
      paso("cerrado");   // → saliendo: a negro
      const viejo = actual, desde = viejo ? viejo.id : null;
      if (viejo && viejo.mundo) {
        const w = viejo.mundo;
        try { viejo.retorno = w.sale(); } catch (e) {
          intenta("congela " + viejo.id, () => w.congela());
          deps.cola.cancelaDe(viejo.id); viejo.estado = "listo";
          vuelve(viejo, a); await abre(); paso("abierto");
          return res(false, "fallo_sale", e);
        }
        intenta("congela " + viejo.id, () => w.congela());
        deps.cola.cancelaDe(viejo.id);
        viejo.estado = "listo";
        if (deps.avisa) deps.avisa("mundo:sale", { id: viejo.id, desde: viejo.id, hacia: a });
      }
      actual = null;
      paso("salido");   // → cargando
      try { await carga(f); } catch (e) {
        libera(f);
        vuelve(viejo, a); await abre(); paso("abierto");
        return res(false, e instanceof ErrorTiempo ? "tiempo" : "fallo_carga", e);
      }
      paso("cargado");   // → entrando
      const w = f.mundo as W;
      try { entraEn(w, puerta || null, llegada || f.retorno); } catch (e) {
        intenta("sale " + a, () => w.sale());
        libera(f);
        vuelve(viejo, a); await abre(); paso("abierto");
        return res(false, "fallo_entra", e);
      }
      f.estado = "activo"; actual = f;
      if (deps.avisa) deps.avisa("mundo:entra", { id: a, desde, hacia: a });
      paso("entrado");   // → abriendo
      // libera() del viejo solo ahora, con el nuevo ya dentro: liberar no tiene vuelta atrás, y así un fallo de carga siempre puede volver al de antes
      if (viejo && viejo.estado === "listo" && viejo.mundo && politicaDe(viejo.mundo) === "libera") libera(viejo);
      await abre();
      paso("abierto");   // → en
      return res(true);
    } finally { enCurso = false; }
  }

  /** El primer mundo, al arrancar: sin fundido (el velo de carga de la página ya tapa) y sin mundo de antes. */
  async function arranca(a: IdMundo, llegada?: Pose2 | null): Promise<ResultadoCambio> {
    const res = resultado(ahora());
    if (enCurso || estado !== "en" || actual) return res(false, actual && actual.id === a ? "mismo" : "ocupado");
    const f = fichas.get(a);
    if (!f) return res(false, "sin_registrar");
    enCurso = true;
    try {
      paso("arranca");   // → cargando
      try { await carga(f); } catch (e) {
        libera(f); vuelve(null, a); paso("abierto");
        return res(false, e instanceof ErrorTiempo ? "tiempo" : "fallo_carga", e);
      }
      paso("cargado");
      const w = f.mundo as W;
      try { entraEn(w, null, llegada || f.retorno); } catch (e) {
        intenta("sale " + a, () => w.sale());
        libera(f); vuelve(null, a); paso("abierto");
        return res(false, "fallo_entra", e);
      }
      f.estado = "activo"; actual = f;
      if (deps.avisa) deps.avisa("mundo:entra", { id: a, desde: null, hacia: a });
      paso("entrado"); paso("abierto");
      return res(true);
    } finally { enCurso = false; }
  }

  function actualiza(dt: number, t: number): void {
    if (actual && actual.mundo && ACTUALIZA_EN.indexOf(estado) >= 0) actual.mundo.actualiza(dt, t);
  }
  // MU2-6: el trozo del mundo que va justo antes del render (si lo tiene), con la misma regla que actualiza
  function antesDelRender(dt: number, t: number): void {
    const w = actual && actual.mundo;
    if (w && w.antesDelRender && ACTUALIZA_EN.indexOf(estado) >= 0) w.antesDelRender(dt, t);
  }

  return {
    registra,
    cambia,
    arranca,
    actualiza,
    antesDelRender,
    get actual(): IdMundo | null { return actual ? actual.id : null; },
    /** MU2-7: el Ambiente del mundo activo (null sin mundo o si no tiene); 29_vr saca de aquí el near/far al entrar y salir de la VR */
    ambiente(): Ambiente | null { const w = actual && actual.mundo; return w && w.ambiente ? w.ambiente() : null; },
    /** MU2-7: vuelve a aplicar el Ambiente del activo (al cambiar el tema claro/oscuro, el fondo y la niebla de partida salen de --sky) */
    reaplicaAmbiente(): void { const w = actual && actual.mundo; if (w && w.ambiente && deps.aplicaAmbiente) deps.aplicaAmbiente(w.ambiente(), w.id); },
    get estado(): EstadoCambio { return estado; },
    /** dónde se dejó cada mundo (lo que devolvió su sale()); en memoria, se pierde al recargar */
    retorno(id: IdMundo): Pose2 | null { const f = fichas.get(id); return f && f.retorno ? { x: f.retorno.x, y: f.retorno.y, ang: f.retorno.ang } : null; },
    /** cómo está cada mundo registrado (para ?debug y las pruebas) */
    fichaDe(id: IdMundo): FichaEstado { const f = fichas.get(id); return f ? f.estado : "sin_registrar"; },
    // delegados de la locomoción (12_paseo, 12b, 12c, 29_vr, 16_vida; MU2-4): los del mundo activo; sin mundo, nadie puede estar en ningún sitio
    suelo(x: number, y: number): number { return actual && actual.mundo ? actual.mundo.suelo(x, y) : 0; },
    dentro(x: number, y: number): boolean { return actual && actual.mundo ? actual.mundo.dentro(x, y) : false; },
    obstaculo(x: number, y: number, radio: number): Pose2 | null { return actual && actual.mundo ? actual.mundo.obstaculo(x, y, radio) : null; },
  };
}

export type WorldManager = ReturnType<typeof creaWorldManager>;
