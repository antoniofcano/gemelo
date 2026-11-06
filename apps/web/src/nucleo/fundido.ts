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
