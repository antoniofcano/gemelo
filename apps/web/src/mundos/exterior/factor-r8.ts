// El radio dibujado de la copa de los olivos del exterior (A3-8c, MU5-n; antes FACTOR_R8 y FACTOR_R8_GEN, variables de apps/web/motor/01_datos.js que
// reescribía factorCopaDeConfig). Radio dibujado = r8 × factor (decisiones 48 y 81, ADR-0017 y ADR-0022); r8 es el RADIO medido (centro → borde de la
// cuenca). UNA sola fuente para los dos dibujos de olivo:
//   E.gen (antes FACTOR_R8_GEN), los olivos del constructor (?olivos=escalera y ?olivos=gen: propios E0/E1, variantes E2/E2-VR e impostores), 1 (decisión 81):
//     copa = 2 × r8 medio, la misma que copas_param.copa_m; todos con la copa que pide el propio (07ab medidasDe).
//   E.r8 (antes FACTOR_R8), el nivel de siempre (06_arboles, 07b niveles 1 y 2), 0,5 hasta que la cinta de campo (O4) confirme el 1 (decisión 48).
// ?factorR8=<v> (o D.config.factorR8) fija LOS DOS a la vez: así la cinta los afina juntos. La configuración del servidor (escalera.factorCopa,
// contratos/config.schema.json, recortado a 0,5-1,5) cambia SOLO E.gen, y la pone 07ab con deConfig() antes de generar nada;
// precedencia: ?factorR8= > configuración > D.config > código.
// Sin THREE ni DOM: lo prueba factor-r8.test.ts.

/** Lo que leen los olivos: el factor del nivel de siempre (r8) y el de los olivos del constructor (gen). gen lo cambia deConfig() */
export interface EstadoFactorR8 { r8: number; gen: number }

export interface DepsFactorR8 {
  /** location.search */
  busqueda: string;
  /** el índice de la finca (D.config.factorR8, si lo trae) */
  D: { config?: { factorR8?: number } | null } | null;
  /** Config.param(ruta, código, url) de la configuración del servidor (02c; se pide al llamar a deConfig, ya con todo montado) */
  param(ruta: string, codigo: number, url: number | null): number;
}

/** El factor que fija la URL o el índice: { v: 0 si ninguno (o fuera de 0-2), url: el de ?factorR8= o null } */
export function leeFactorR8(busqueda: string, D: DepsFactorR8["D"]): { v: number; url: number | null } {
  const m = /[?&]factorR8=([0-9.]+)/.exec(busqueda), v = m ? Number(m[1]) : (D && D.config && D.config.factorR8) || 0;
  return v > 0 && v <= 2 ? { v, url: m ? v : null } : { v: 0, url: null };
}

export function creaFactorR8(d: DepsFactorR8) {
  const E: EstadoFactorR8 = { r8: 0.5, gen: 1 }, L = leeFactorR8(d.busqueda, d.D);
  if (L.v) { E.r8 = E.gen = L.v; }
  /** la configuración del servidor (escalera.factorCopa) pone E.gen, salvo que mande ?factorR8=; devuelve el que queda */
  function deConfig(): number { E.gen = d.param("escalera.factorCopa", E.gen, L.url); return E.gen; }
  return { E, url: L.url, deConfig };
}
export type FactorR8 = ReturnType<typeof creaFactorR8>;
