// «hace N min / h / días»: la regla ÚNICA de cuánto hace que se leyó un dato (L3-22, regla 12). La usan la historia, el tiempo (lo puro y sus fichas),
// el mundo de hoy y los carteles de las hazas; antes había cinco copias, una de ellas con otros umbrales. Minutos hasta 90, horas enteras hasta 36 h, luego
// días; al menos «hace 1 min» (también un instante hasta 5 min en el futuro, por relojes desacompasados; más allá, «»: no se afirma). Pura: sin DOM ni reloj propio.

/** hasta cuántos minutos «en el futuro» se toma por un desajuste de relojes entre el servidor y el navegador (y se dice «hace 1 min») [SUPUESTO: 5 min] */
export const FUTURO_MIN = 5;

/** de un lapso en minutos; «» si no es un número o si cae más de FUTURO_MIN en el futuro */
export function haceMinutos(min: number): string {
  if (typeof min !== "number" || !Number.isFinite(min)) return "";
  if (min < -FUTURO_MIN) return "";   // un dato fechado más allá de un desajuste de relojes: no se afirma cuánto hace
  const m = Math.max(1, Math.round(min));
  return m < 90 ? "hace " + m + " min" : m < 36 * 60 ? "hace " + Math.round(m / 60) + " h" : "hace " + Math.round(m / 1440) + " días";
}

/** desde un instante ISO hasta `ahora` (ms); «» si el instante no es un texto con fecha o `ahora` no es un número */
export function haceDesde(iso: unknown, ahora: unknown): string {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t) || typeof ahora !== "number" || !Number.isFinite(ahora)) return "";
  return haceMinutos((ahora - t) / 60000);
}
