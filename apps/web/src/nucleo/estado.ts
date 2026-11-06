// El estado mutable que comparte el motor legado (MUNDOS §9.4, fila 7; A1-13 = MU1-9). Antes eran primitivas sueltas de la IIFE
// (`var exag = 1, modo = "nube", calidad = 1;` en 03_escena.js) que varios módulos reescribían; una primitiva no se puede importar
// (las importaciones son de solo lectura), así que el legado y el código nuevo comparten UN objeto y leen y escriben sus campos:
// `Estado.exag`, `Estado.modo`, `Estado.calidad`. Lo crea el legado en 03_escena.js (`var Estado = Nucleo.creaEstado();`).
// Es el paso previo de §4: cada mundo tendrá su `exag` (el exterior, la del usuario; un interior, 1 fijo) y el WorldManager podrá dar a
// cada uno el suyo sin tocar a sus lectores. Lo vigila pruebas/guardianes/estado_mutable.test.js: nadie vuelve a declarar ni a
// reasignar esas variables sueltas en el legado.

/** Cómo se ve el mundo: la nube LiDAR, el gemelo (olivos, suelo) o la ortofoto. Lo cambia `pon(m)` de 09_camara.js. */
export type Modo = "nube" | "gem" | "orto";

export interface Estado {
  /** exageración vertical del relieve (1-3; el deslizador #exag, 09_camara.js). Multiplica toda cota del suelo. */
  exag: number;
  /** la vista activa (los botones Nube / Gemelo / Ortofoto; en VR siempre «gem» mientras dura la sesión) */
  modo: Modo;
  /** calidad del gemelo (el selector #calidad, 13_parcelas.js; 0 en VR mientras dura la sesión) */
  calidad: number;
}

/** Los valores con que arranca el motor (los de la antigua línea de 03_escena.js). */
export const ESTADO_INICIAL: Readonly<Estado> = Object.freeze({ exag: 1, modo: "nube", calidad: 1 });

/** Un estado nuevo, con los valores iniciales y, si se dan, los de `inicial` encima. Cada llamada devuelve un objeto distinto. */
export function creaEstado(inicial?: Partial<Estado>): Estado {
  return { exag: ESTADO_INICIAL.exag, modo: ESTADO_INICIAL.modo, calidad: ESTADO_INICIAL.calidad, ...(inicial || {}) };
}
