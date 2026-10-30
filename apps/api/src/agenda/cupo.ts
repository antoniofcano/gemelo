// Aforo de un evento de la Agenda (OF11), sin base de datos: quién cabe y a quién le toca plaza al liberarse una. El aforo cuenta PERSONAS
// (`visitas.plazas`); `null` = sin aforo. Lo usa src/agenda/rutas.ts dentro de la transacción que bloquea el evento.

export interface Espera { hogar: number; personas: number }

/** ¿Entra una inscripción de `personas` con `ocupadas` ya apuntadas? Sin aforo, siempre. */
export function cabe(plazas: number | null, ocupadas: number, personas: number): boolean {
  return plazas === null || ocupadas + personas <= plazas;
}

/** Estado de una inscripción nueva: apuntado si cabe, en espera si no. */
export function estadoNuevo(plazas: number | null, ocupadas: number, personas: number): "apuntado" | "en_espera" {
  return cabe(plazas, ocupadas, personas) ? "apuntado" : "en_espera";
}

/**
 * A quién promover de la espera (ya ordenada, la más antigua primero) con las plazas libres que hay. Se recorre en orden y se promueve a
 * quien CABE: un grupo grande que no cabe no bloquea a los pequeños que vienen detrás (y sigue primero en la cola para la plaza siguiente).
 * Decisión abierta para Antonio: cola estricta (nadie pasa por delante) frente a «el primero que quepa» (rellena más plazas). Hoy, lo segundo.
 */
export function aPromover(plazas: number | null, ocupadas: number, espera: readonly Espera[]): number[] {
  const ids: number[] = [];
  let n = ocupadas;
  for (const e of espera) {
    if (!cabe(plazas, n, e.personas)) continue;
    ids.push(e.hogar);
    n += e.personas;
  }
  return ids;
}

/** Plazas libres (null = sin aforo). Nunca negativas. */
export const libres = (plazas: number | null, ocupadas: number): number | null => (plazas === null ? null : Math.max(0, plazas - ocupadas));

/** Cuántos avisos de la oficina sobre eventos puede recibir un hogar por semana (OFICINA.md §7: valor de partida 3). */
export const TOPE_AVISOS_SEMANA = 3;
