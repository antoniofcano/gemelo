// Lo que los componentes de la vida del olivar (fauna, perros, huellas y polvo) leen del paseo y del quad/dron (A3-5, MU5-n). El estado vive en 16_vida.js (desde A3-5, en vida.ts):
// tVida (segundos de vida del paseo), enQuad, vq (velocidad del quad), enDron. Cambian cada fotograma, así que se leen por función y no por valor (el legado las espeja en sus `var`).
// Solo tipos: este fichero no tiene código.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type T3 = any;

/** Lo que se lee del estado del paseo, por función (un valor que cambia no puede viajar por argumento) */
export interface LecturaVida {
  /** segundos acumulados de la vida ambiental (los acumula actualizaVida) */
  tVida(): number;
  enQuad(): boolean;
  /** velocidad del quad, m/s con signo */
  vq(): number;
  enDron(): boolean;
}

/** El paseo del muñequito (12_paseo): un campo que cambia (paseando) y objetos que viven toda la sesión (pp, el dron dr) */
export interface LecturaPaseo {
  paseando(): boolean;
  /** el estado del muñequito: x, y (este, norte), ang, paso */
  pp: { x: number; y: number; ang: number; paso: number };
}

/** El sol y el tiempo (15_tiempo): nivelEn rellena el temporal que se le pasa (sin reservas por fotograma) */
export interface DepsTiempo {
  cur: { ms: number; viento: number; dir: number; lluvia: number; hr: number };
  nivelEn(ms: number, tmp: T3): { s: { alt: number; az: number }; d: number };
}
