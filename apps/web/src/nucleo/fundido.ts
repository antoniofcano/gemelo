// El fundido a negro de la VR, partido en dos gestos (MUNDOS §3, MU2-2; L7-05 y L7-06): `cierra()` oscurece y devuelve una promesa que se cumple al estar
// a negro, y `abre()` vuelve a ver. Entre los dos puede pasar el tiempo que haga falta (cargar un mundo) sin volver a ver a medias: el velo se QUEDA opaco.
// Aquí vive solo el estado y los tiempos (sin THREE ni DOM); el velo (un plano pegado a la cabeza) y el rig siguen en apps/web/motor/29_vr.js, que
// llama a `paso(dt)` cada fotograma y pinta `opacidad`. `funde(fn)` es el de siempre (cierra, `fn` a oscuras, abre) y se queda para quien ya lo usa.

/** Lo que dura cada mitad del fundido (s). */
export const FUNDIDO_S = 0.15;
/** Un salto de más de estos metros pasa por el fundido (L7-05); uno menor, no (un paso de teletransporte corto no marea). */
export const SALTO_FUNDIDO_M = 5;

export type FaseFundido = "abierto" | "cerrando" | "negro" | "abriendo";

export interface Fundido {
  readonly fase: FaseFundido;
  /** 0 = se ve todo, 1 = negro */
  readonly opacidad: number;
  /** el velo tiene que estar en la escena (cualquier fase menos «abierto») */
  readonly visible: boolean;
  /** Oscurece. La promesa se cumple al estar a negro; `alNegro`, si se da, se llama en ese instante, dentro de `paso` (lo que mueva cuenta para el resto del fotograma). Si ya se cierra o está a negro, devuelve la misma promesa y no pisa nada. */
  cierra(alNegro?: () => void): Promise<void>;
  /** Vuelve a ver. Solo tiene efecto tras un `cierra`: si estaba cerrando, abre en cuanto llegue a negro. Abierto, se cumple en el acto. La promesa se cumple al estar abierto del todo. */
  abre(): Promise<void>;
  /** El de siempre: cierra, llama a `fn` a oscuras y abre. `false` (y no hace nada) si ya hay un fundido en curso. Si `fn` lanza, abre igualmente. */
  funde(fn?: () => void): boolean;
  /** Avanza `dt` segundos (al principio de cada fotograma de VR). */
  paso(dt: number): void;
  /** Corta en seco y deja todo abierto (al entrar y salir de VR); las promesas pendientes se cumplen para que nadie se quede esperando. */
  reinicia(): void;
}

export const FundidoPuro = {
  /** ¿pide fundido un salto de `distancia` metros? (L7-05) */
  necesitaFundido(distancia: number, umbral: number = SALTO_FUNDIDO_M): boolean { return !(distancia <= umbral); },
};

export function creaFundido(duracion: number = FUNDIDO_S): Fundido {
  let fase: FaseFundido = "abierto", t = 0, opacidad = 0, abrirAlNegro = false;
  let hooks: Array<() => void> = [];
  let pCierra: Promise<void> | null = null, rCierra: (() => void) | null = null;
  let pAbre: Promise<void> | null = null, rAbre: (() => void) | null = null;

  function cierra(alNegro?: () => void): Promise<void> {
    if (fase === "abriendo") { const p = abre(); return p.then(() => cierra(alNegro)); }   // no se pisa: primero acaba de abrir
    if (fase === "negro") { if (alNegro) alNegro(); return pCierra || Promise.resolve(); }
    if (fase === "cerrando") { if (alNegro) hooks.push(alNegro); return pCierra as Promise<void>; }
    fase = "cerrando"; t = 0; opacidad = 0; abrirAlNegro = false; hooks = alNegro ? [alNegro] : [];
    pCierra = new Promise<void>((res) => { rCierra = res; });
    return pCierra;
  }
  function abre(): Promise<void> {
    if (fase === "abierto") return Promise.resolve();
    if (!pAbre) pAbre = new Promise<void>((res) => { rAbre = res; });
    if (fase === "cerrando") { abrirAlNegro = true; return pAbre; }
    if (fase === "negro") { fase = "abriendo"; t = 0; }
    return pAbre;
  }
  function funde(fn?: () => void): boolean {
    if (fase !== "abierto") return false;
    cierra(() => { try { if (fn) fn(); } finally { abre(); } });
    return true;
  }
  function paso(dt: number): void {
    if (fase === "abierto" || fase === "negro") return;
    t += dt; const k = Math.min(1, t / duracion);
    if (fase === "cerrando") {
      opacidad = k;
      if (k >= 1) {
        fase = "negro"; t = 0; const hs = hooks; hooks = []; const r = rCierra; rCierra = null;
        try { for (const h of hs) h(); } finally { if (r) r(); if (abrirAlNegro) { abrirAlNegro = false; abre(); } }
      }
    } else {
      opacidad = 1 - k;
      if (k >= 1) { fase = "abierto"; opacidad = 0; const r = rAbre; rAbre = null; pAbre = null; if (r) r(); }
    }
  }
  function reinicia(): void {
    fase = "abierto"; t = 0; opacidad = 0; abrirAlNegro = false; hooks = [];
    const a = rCierra, b = rAbre; rCierra = rAbre = null; pCierra = pAbre = null;
    if (a) a();
    if (b) b();
  }
  return {
    get fase() { return fase; }, get opacidad() { return opacidad; }, get visible() { return fase !== "abierto"; },
    cierra, abre, funde, paso, reinicia,
  };
}

// ---------- El fundido del gestor de mundos, en pantalla y en VR (MU2-3)
// WorldManager pide cierra() y abre() (nucleo/mundos.ts, Fundido). En VR los lleva el velo pegado a la cabeza (el de arriba, por 29_vr: vrCierra y vrAbre).
// Fuera de VR no había un fundido que se quedara a negro: el de 12b_llegada (fundePantalla) es de ida y vuelta, privado y con su propio estado. Este es
// un velo de DOM mínimo, con el mismo CSS y la misma duración que ese (0,15 s por mitad), que se crea la primera vez que se cierra (hasta entonces el
// documento no cambia) y se queda opaco hasta abre(). Si en el momento de cerrar hay una sesión de VR, las dos mitades de ese cambio van por el velo de VR.

/** Lo mínimo del velo de DOM (un div). */
export interface ElementoVelo { style: { cssText: string; opacity: string }; setAttribute(nombre: string, valor: string): void }
export interface DepsFundidoPantalla {
  documento: { createElement(etiqueta: string): ElementoVelo } | null;
  /** donde se cuelga el velo (el visor) */
  contenedor: { appendChild(e: ElementoVelo): unknown } | null;
  /** el velo de VR de 29_vr */
  vr?: { activa(): boolean; cierra(): Promise<void>; abre(): Promise<void> } | null;
  temporizador(fn: () => void, ms: number): unknown;
  /** s por mitad; por defecto FUNDIDO_S */
  duracion?: number;
}

export function creaFundidoPantalla(deps: DepsFundidoPantalla): { cierra(): Promise<void>; abre(): Promise<void> } {
  const dur = typeof deps.duracion === "number" && deps.duracion >= 0 ? deps.duracion : FUNDIDO_S;
  const ms = dur * 1000;
  let velo: ElementoVelo | null = null, modo: "vr" | "pantalla" | null = null;
  const espera = (): Promise<void> => new Promise<void>(r => { deps.temporizador(r, ms); });
  function elVelo(): ElementoVelo | null {
    if (velo || !deps.documento || !deps.contenedor) return velo;
    const v = deps.documento.createElement("div");
    v.setAttribute("aria-hidden", "true");
    v.style.cssText = "position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity " + dur + "s linear;z-index:5";
    deps.contenedor.appendChild(v); velo = v;
    return v;
  }
  function cierra(): Promise<void> {
    if (modo === "vr" && deps.vr) return deps.vr.cierra();
    if (modo === "pantalla") return espera();
    if (deps.vr && deps.vr.activa()) { modo = "vr"; return deps.vr.cierra(); }
    modo = "pantalla";
    const v = elVelo(); if (!v) return Promise.resolve();
    v.style.opacity = "1";
    return espera();
  }
  function abre(): Promise<void> {
    const m = modo; modo = null;
    if (m === "vr" && deps.vr) return deps.vr.abre();
    if (m !== "pantalla" || !velo) return Promise.resolve();
    velo.style.opacity = "0";
    return espera();
  }
  return { cierra, abre };
}
