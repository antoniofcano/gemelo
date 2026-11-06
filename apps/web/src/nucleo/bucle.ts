// El bucle del fotograma (MUNDOS §3 y §9.4, fila 8; A1-14 = MU1-10). Antes vivía entero en apps/web/motor/90_final.js (`cuadro()` y `bucle()`);
// ahora 90_final.js da la LISTA de pasos (las mismas llamadas, en el mismo orden) y este módulo los recorre: el dt recortado, la pausa, el reparto
// del JS (Q0h), el ms de renderer.render() (F0), el ahorro de batería y el «cuadro:fin». Sin cambio visible en el caso normal.
// Lo nuevo es lo que pasa cuando algo va mal (auditoría de noviembre, lente 7):
//   · L7-01: cada fotograma va dentro de try/catch. Un fallo no para el bucle (ni el de la ventana ni el de las gafas). En pantalla se registra y se
//     sigue, con los mensajes limitados (MAX_DETALLE con detalle y luego un resumen cada RESUMEN_MS); al FALLOS_SEGUIDOS seguido, un aviso visible.
//     En VR, al FALLOS_SEGUIDOS seguido se sale limpio de la sesión (session.end(): la salida de siempre, 29_vr vrSale) con un aviso en la página.
//   · L7-02: visibilitychange de la página y de la sesión XR. Oculta (o la sesión «visible-blurred»: el menú del sistema del Quest delante) no corren
//     los pasos marcados «caro» (la carga de teselas, la Cola, la escena 3D Tiles); al volver, el primer dt es el del último fotograma bueno y no el
//     tiempo que estuvo oculta, así el controlador de nivel de VR no ve un tirón que no fue. Y el «reset» del espacio de referencia (recentrar en el
//     casco): en el primer fotograma tras el evento se llama a xr.recoloca(), que deja la cabeza donde estaba y mirando a lo mismo (BuclePuro.recoloca).
//   · L7-10: webglcontextlost (preventDefault, el bucle se para, aviso; en VR se cierra la sesión) y webglcontextrestored: se REHACE, no se pide
//     recargar, porque el WebGLRenderer de three escucha el mismo evento y reconstruye su estado (initGLContext), y las geometrías, texturas y
//     programas se vuelven a subir en el siguiente render desde sus copias en memoria (el motor no las suelta tras subirlas: no usa onUploadCallback).
//     Como eso no está probado en un aparato, el aviso dice «si falta algo, recarga». Si el contexto no vuelve en ESPERA_CONTEXTO_MS, aviso de recargar.
// Nada de aquí lee globales al cargarse: el reloj, requestAnimationFrame, la sesión XR, el documento, el lienzo y los avisos entran por argumento de
// creaBucle({ … }). Presupuesto (regla 6): sin medir no hay lecturas de reloj nuevas (solo las dos de renderer.render(), como antes) ni reservas por fotograma.

/** Un paso del fotograma, en el orden en que se llama. */
export interface PasoBucle {
  fn(dt: number, t: number): void;
  /** el bloque del reparto del JS (Reparto.reg) que cierra este paso; null = se mide por dentro (las fases de Componentes): solo se rehace la marca */
  bloque?: number | null;
  /** trabajo caro que se salta con la página o la sesión oculta (la carga, la Cola) */
  caro?: boolean;
  /** el render: se cronometra en fin.r (lo lee el medidor de fotogramas) */
  render?: boolean;
}
/** El reparto del JS por bloque (02c Reparto, Q0h). */
export interface RepartoBucle { readonly on: boolean; ini(t: number): number; pasa(bloque: number, q: number): number }
export interface Oyente { addEventListener(tipo: string, fn: (e: unknown) => void): void; removeEventListener?(tipo: string, fn: (e: unknown) => void): void }
export interface SesionXr extends Oyente { readonly visibilityState?: string; end(): unknown }
export interface XrBucle {
  /** ¿hay una sesión inmersiva en marcha? (29_vr: VRX.on) */
  activa(): boolean;
  sesion(): SesionXr | null;
  /** el espacio de referencia de la sesión (29_vr: VRX.base), del que se escucha «reset» */
  base(): Oyente | null;
  /** recoloca el rig tras un «reset» (29_vr: vrRecoloca) */
  recoloca?(): void;
}
export interface FinCuadro { t: number; r: number }
export interface DepsBucle {
  ahora(): number;
  /** requestAnimationFrame de la ventana */
  pideCuadro(fn: (ts?: number) => void): unknown;
  pasos: readonly PasoBucle[];
  /** ¿el mundo está en pausa? (02c Pausa, y nunca en VR) y lo único que corre entonces */
  enPausa?(): boolean;
  pausa?(dt: number, t: number): void;
  /** el fotograma acabó (Bus «cuadro:fin»); siempre el mismo objeto */
  alFin?(fin: FinCuadro): void;
  reparto?: RepartoBucle | null;
  /** Configuración → Gráficos → Ahorro de batería: salta los fotogramas que llegan antes de AHORRO_MS */
  ahorro?(): boolean;
  xr?: XrBucle | null;
  /** un aviso visible (31_hud: Hud.aviso) */
  aviso?(texto: string, ms?: number): void;
  consola?: { error(...a: unknown[]): void } | null;
  documento?: (Oyente & { readonly visibilityState?: string }) | null;
  /** el lienzo del renderizador: de él llegan webglcontextlost/restored */
  lienzo?: Oyente | null;
  temporizador?(fn: () => void, ms: number): unknown;
  alOcultar?(): void;
  alVolver?(): void;
}
export interface EstadoBucle {
  fallos: number; seguidos: number; salidasVr: number; oculto: boolean; perdido: boolean; perdidas: number; recuperadas: number; reinicios: number;
}

const DT_MAX = 0.1;              // s: el dt de un fotograma nunca pasa de aquí (como siempre)
const AHORRO_MS = 25;            // ahorro de batería: unos 30 fotogramas por segundo
const FALLOS_SEGUIDOS = 3;       // L7-01: al tercero seguido, fuera de VR (y en pantalla, el aviso)
const MAX_DETALLE = 3;           // fallos que se registran con su pila; luego solo un resumen
const RESUMEN_MS = 10000;        // como mucho un resumen cada 10 s
const ESPERA_CONTEXTO_MS = 10000;   // L7-10: si el contexto no vuelve en este tiempo, aviso de recargar

const TEXTOS = {
  vr: "La sesión de VR se ha cerrado porque algo ha fallado al dibujar. Puedes volver a entrar.",
  pantalla: "Algo falla al dibujar la vista 3D. Si no se mueve, recarga la página.",
  perdido: "El navegador ha perdido la vista 3D (memoria gráfica). Esperando a que vuelva…",
  noVuelve: "La vista 3D no ha vuelto. Recarga la página para seguir.",
  recuperado: "Vista 3D recuperada. Si falta algo, recarga la página."
};

/** cuaternión y punto mínimos (los de THREE y los de XRRigidTransform valen) */
export interface Cuat { x: number; y: number; z: number; w: number }
export interface Punto { x: number; y: number; z: number }
export interface RigXr { x: number; y: number; z: number; yaw: number }

/** el rumbo (giro alrededor de +Y, en radianes) hacia el que mira -Z rotado por q; 0 = mirando a -Z, como el `yaw` del rig de 29_vr */
function rumbo(q: Cuat): number { return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)); }
/** (x, z) girado `a` alrededor de +Y (lo mismo que Vector3.applyAxisAngle(eje Y, a)) */
function giraXZ(x: number, z: number, a: number): { x: number; z: number } {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c + z * s, z: -x * s + z * c };
}
/** L7-02: el rig nuevo tras un «reset» del espacio de referencia, para que la cabeza siga en el mismo sitio del mundo (en planta) y mirando al mismo
 *  rumbo. viejo = la pose local de la cabeza antes del reset (la de la cámara del último render), nuevo = la de este fotograma (ya en el origen nuevo).
 *  La altura del rig no se toca: la pone el suelo (y en «local-floor» el reset no cambia la altura del suelo). */
function recoloca(rig: RigXr, viejo: { p: Punto; q: Cuat }, nuevo: { p: Punto; q: Cuat }): RigXr {
  const yaw = rig.yaw + rumbo(viejo.q) - rumbo(nuevo.q);
  const hv = giraXZ(viejo.p.x, viejo.p.z, rig.yaw), hn = giraXZ(nuevo.p.x, nuevo.p.z, yaw);
  return { x: rig.x + hv.x - hn.x, y: rig.y, z: rig.z + hv.z - hn.z, yaw: yaw };
}

export const BuclePuro = { DT_MAX, AHORRO_MS, FALLOS_SEGUIDOS, MAX_DETALLE, RESUMEN_MS, ESPERA_CONTEXTO_MS, TEXTOS, rumbo, giraXZ, recoloca };

function textoDe(e: unknown): string {
  const x = e as { stack?: unknown; message?: unknown } | null;
  if (x && typeof x.stack === "string" && x.stack) return x.stack;
  if (x && typeof x.message === "string") return x.message;
  return String(e);
}

export function creaBucle(deps: DepsBucle) {
  const pasos = deps.pasos, fin: FinCuadro = { t: 0, r: 0 };
  let tAnt = deps.ahora(), dtPrev = 1 / 60, retoma = false, tAhorro = 0, ultimoTs = -1;
  let seguidos = 0, fallos = 0, detallados = 0, callados = 0, tResumen = -Infinity, avisadoPantalla = false, salidasVr = 0;
  let sesionVista: SesionXr | null = null, sesionCerrada: SesionXr | null = null, baseVista: Oyente | null = null, recolocar = false, reinicios = 0;
  let visDoc = "visible", visXr = "visible", oculto = false;
  let perdido = false, perdidas = 0, recuperadas = 0;

  function aviso(texto: string, ms: number): void { try { if (deps.aviso) deps.aviso(texto, ms); } catch (e) { /* un aviso que falla no tumba el bucle */ } }
  function llama(fn?: () => void): void { try { if (fn) fn(); } catch (e) { registra(e); } }

  // ---------- L7-01: el registro limitado
  function registra(e: unknown): void {
    const c = deps.consola; if (!c) return;
    if (detallados < MAX_DETALLE) { detallados++; c.error("bucle: fallo en el fotograma (" + fallos + "): " + textoDe(e)); return; }
    callados++;
    const ahora = deps.ahora();
    if (ahora - tResumen >= RESUMEN_MS) { tResumen = ahora; c.error("bucle: " + callados + " fallos más en el fotograma (sin detalle); el último: " + textoDe(e).split("\n")[0]); callados = 0; }
  }
  function cierraSesion(s: SesionXr | null): void {
    if (!s || s === sesionCerrada) return;
    sesionCerrada = s;
    try { const r = s.end() as { catch?: (f: (e: unknown) => void) => unknown } | undefined; if (r && typeof r.catch === "function") r.catch(function () { /* ya cerrada */ }); } catch (e) { /* ya cerrada */ }
  }
  function falla(e: unknown): void {
    seguidos++; fallos++;
    registra(e);
    const x = deps.xr;
    if (x && x.activa()) {
      if (seguidos >= FALLOS_SEGUIDOS && x.sesion() !== sesionCerrada) { salidasVr++; aviso(TEXTOS.vr, 10000); cierraSesion(x.sesion()); }
    } else if (seguidos >= FALLOS_SEGUIDOS && !avisadoPantalla) { avisadoPantalla = true; aviso(TEXTOS.pantalla, 8000); }
  }

  // ---------- L7-02: lo oculto y el «reset»
  function recalculaOculto(): void {
    const o = visDoc === "hidden" || visXr !== "visible";
    if (o === oculto) return;
    oculto = o;
    if (o) llama(deps.alOcultar); else { retoma = true; llama(deps.alVolver); }
  }
  function alVisDoc(): void { const d = deps.documento; visDoc = d && d.visibilityState === "hidden" ? "hidden" : "visible"; recalculaOculto(); }
  function alVisXr(): void { const s = sesionVista; visXr = s && s.visibilityState ? s.visibilityState : "visible"; recalculaOculto(); }
  function alReset(): void { recolocar = true; reinicios++; }
  function alFinSesion(): void {
    // la salida de siempre la hace 29_vr (vrSale, que escucha «end» antes que el bucle y relanza el de la ventana); si vrSale falló a medias, esto lo
    // relanza igual. Dos peticiones en el mismo fotograma no dan dos bucles: el segundo ve la misma marca de tiempo y no sigue (bucle()).
    visXr = "visible"; recalculaOculto(); retoma = true;
    if (!perdido) deps.pideCuadro(bucle);
  }
  function quita(o: Oyente | null, tipo: string, fn: (e: unknown) => void): void { if (o && typeof o.removeEventListener === "function") o.removeEventListener(tipo, fn); }
  function pon(o: Oyente | null, tipo: string, fn: (e: unknown) => void): void { if (o && typeof o.addEventListener === "function") o.addEventListener(tipo, fn); }
  // una comparación por fotograma: si cambió la sesión o su espacio de referencia, se cambian las escuchas
  function vigilaXr(): void {
    const x = deps.xr; if (!x) return;
    const s = x.activa() ? x.sesion() : null;
    if (s !== sesionVista) {
      quita(sesionVista, "visibilitychange", alVisXr); quita(sesionVista, "end", alFinSesion);
      sesionVista = s; pon(s, "visibilitychange", alVisXr); pon(s, "end", alFinSesion);
      seguidos = 0; alVisXr();
    }
    const b = s ? x.base() : null;
    if (b !== baseVista) { quita(baseVista, "reset", alReset); baseVista = b; pon(b, "reset", alReset); recolocar = false; }
  }

  // ---------- L7-10: el contexto de WebGL
  function alPerdido(ev: unknown): void {
    const e = ev as { preventDefault?: () => void } | null;
    if (e && typeof e.preventDefault === "function") e.preventDefault();   // sin esto el navegador no lo devuelve nunca
    if (perdido) return;
    perdido = true; perdidas++;
    aviso(TEXTOS.perdido, 12000);
    const x = deps.xr; if (x && x.activa()) cierraSesion(x.sesion());   // en VR no hay nada que presentar: fuera de la sesión, a la página
    const n = perdidas;
    if (deps.temporizador) deps.temporizador(function () { if (perdido && perdidas === n) aviso(TEXTOS.noVuelve, 20000); }, ESPERA_CONTEXTO_MS);
  }
  function alRecuperado(): void {
    if (!perdido) return;
    perdido = false; recuperadas++; retoma = true; seguidos = 0; avisadoPantalla = false;
    aviso(TEXTOS.recuperado, 8000);
    const x = deps.xr; if (!(x && x.activa())) deps.pideCuadro(bucle);
  }

  // ---------- un fotograma
  function pasa(t: number): void {
    fin.t = t;
    const dt = retoma ? dtPrev : Math.min(DT_MAX, (t - tAnt) / 1000); retoma = false; tAnt = t; dtPrev = dt;
    // el mundo en pausa (02c Pausa: un juego a pantalla completa): ni cámara, ni módulos, ni Cola, ni render; solo la fase «pausa» y el contador de ?debug
    if (deps.enPausa && deps.enPausa()) { if (deps.pausa) deps.pausa(dt, t); if (deps.alFin) deps.alFin(fin); return; }
    if (recolocar) { recolocar = false; const x = deps.xr; if (x && x.activa() && x.recoloca) x.recoloca(); }
    const R = deps.reparto, rp = !!(R && R.on);
    corre(pasos, dt, t, rp, rp ? (R as RepartoBucle).ini(t) : 0);
    if (deps.alFin) deps.alFin(fin);
  }
  // Recorre una lista de pasos con las reglas del bucle (los «caro» no corren oculto, el render se cronometra en fin.r y cada bloque suma al reparto).
  // q = la marca de tiempo del reparto (solo se lee si rp). Sin reservas: es lo que corre a cada fotograma.
  function corre(lista: readonly PasoBucle[], dt: number, t: number, rp: boolean, q: number): void {
    const R = deps.reparto;
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i] as PasoBucle;
      if (p.caro && oculto) continue;
      if (p.render) { const tR = deps.ahora(); p.fn(dt, t); fin.r = deps.ahora() - tR; if (rp) q = deps.ahora(); continue; }
      p.fn(dt, t);
      if (rp) q = typeof p.bloque === "number" ? (R as RepartoBucle).pasa(p.bloque, q) : deps.ahora();
    }
  }
  /** MU2-3: una sublista de pasos dentro de UN paso del bucle (los del mundo activo, que le da WorldManager.actualiza). Con las mismas reglas que
   *  la lista del bucle: un paso «caro» no corre oculto y cada bloque suma al reparto del fotograma en curso. El paso del bucle que la llama es «bloque: null». */
  function recorre(lista: readonly PasoBucle[], dt: number, t: number): void {
    const R = deps.reparto, rp = !!(R && R.on);
    corre(lista, dt, t, rp, rp ? deps.ahora() : 0);
  }
  /** un fotograma, protegido: lo llama bucle() en pantalla y 29_vr (vrAnimacion) en VR */
  function cuadro(t: number): void {
    if (perdido) return;
    try { vigilaXr(); pasa(t); seguidos = 0; avisadoPantalla = false; } catch (e) { falla(e); }
  }
  /** el bucle de la ventana (requestAnimationFrame); en VR no hace nada (lo lleva la sesión) y con el contexto perdido se para */
  function bucle(ts?: number): void {
    if (typeof ts === "number") { if (ts === ultimoTs) return; ultimoTs = ts; }
    if (perdido) return;
    const x = deps.xr; if (x && x.activa()) return;
    const ahora = deps.ahora();
    let ah = false; try { ah = !!(deps.ahorro && deps.ahorro()); } catch (e) { ah = false; }
    if (ah && ahora - tAhorro < AHORRO_MS) { deps.pideCuadro(bucle); return; }
    tAhorro = ahora; cuadro(ahora); deps.pideCuadro(bucle);
  }
  function estado(): EstadoBucle {
    return { fallos: fallos, seguidos: seguidos, salidasVr: salidasVr, oculto: oculto, perdido: perdido, perdidas: perdidas, recuperadas: recuperadas, reinicios: reinicios };
  }

  pon(deps.documento || null, "visibilitychange", alVisDoc);
  if (deps.documento) alVisDoc();
  pon(deps.lienzo || null, "webglcontextlost", alPerdido);
  pon(deps.lienzo || null, "webglcontextrestored", alRecuperado);

  return { cuadro: cuadro, bucle: bucle, estado: estado, fin: fin, recorre: recorre };
}
export type Bucle = ReturnType<typeof creaBucle>;
