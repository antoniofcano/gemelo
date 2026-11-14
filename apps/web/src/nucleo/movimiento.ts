// L6-03: ¿se reduce el movimiento? La regla ÚNICA de todo el cliente (regla 12): manda el ajuste «Movimiento» de la Configuración (Ajustes.movimientoReducido(),
// que ya respeta «Como el sistema»); sin Configuración (los pasos del arranque anteriores a 33_ajustes, o si no está), la preferencia del sistema
// (prefers-reduced-motion). Quien lo lee una vez al crearse se entera de los cambios por Ajustes.alMovimiento o por el oyente `movimiento` de creaAjustes.

/** la media query del sistema */
export const CONSULTA_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

/** ¿lo pide el sistema? (sin matchMedia, o si falla: no) */
export function sistemaReduceMovimiento(ventana: unknown): boolean {
  const v = ventana as { matchMedia?: (q: string) => { matches: boolean } } | null | undefined;
  try { return !!(v && typeof v.matchMedia === "function" && v.matchMedia(CONSULTA_MOVIMIENTO).matches); } catch (e) { return false; }
}

/** el ajuste de la aplicación si hay Configuración; si no, el sistema */
export function movimientoReducido(aj: { movimientoReducido?(): boolean } | null | undefined, ventana: unknown): boolean {
  try { if (aj && typeof aj.movimientoReducido === "function") return !!aj.movimientoReducido(); } catch (e) { /* sigue con el sistema */ }
  return sistemaReduceMovimiento(ventana);
}
