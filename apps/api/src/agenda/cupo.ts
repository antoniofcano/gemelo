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

// ---- Cambios de fecha o lugar (OF11b, decisión 148): avisan solos a apuntados y en espera, como aviso de sistema (autor null), que no cuenta para el tope.

/** Los campos de un evento que, al cambiar, avisan solos: la fecha (empieza_en, termina_en) y el lugar (lugar, finca, haza). `haza` es su código legible. */
export interface Cita { empieza_en: Date; termina_en: Date | null; lugar: string | null; finca: string | null; haza: string | null }
export interface Cambio { campo: "empieza_en" | "termina_en" | "lugar" | "finca" | "haza"; antes: string; ahora: string }

const NOMBRE_CAMPO: Record<Cambio["campo"], string> = { empieza_en: "Empieza", termina_en: "Termina", lugar: "Lugar", finca: "Finca", haza: "Haza" };
const fechaTexto = (d: Date | null): string => (d === null ? "sin hora de fin" : d.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }));
const textoOVacio = (s: string | null): string => (s === null || s === "" ? "sin indicar" : s);

/** Qué cambió entre dos versiones de la cita, en orden fijo. Vacío si no cambió ni la fecha ni el lugar (título, descripción o aforo no avisan solos). */
export function cambiosDeCita(antes: Cita, ahora: Cita): Cambio[] {
  const r: Cambio[] = [];
  if (antes.empieza_en.getTime() !== ahora.empieza_en.getTime()) r.push({ campo: "empieza_en", antes: fechaTexto(antes.empieza_en), ahora: fechaTexto(ahora.empieza_en) });
  if ((antes.termina_en?.getTime() ?? null) !== (ahora.termina_en?.getTime() ?? null)) r.push({ campo: "termina_en", antes: fechaTexto(antes.termina_en), ahora: fechaTexto(ahora.termina_en) });
  for (const c of ["lugar", "finca", "haza"] as const)
    if ((antes[c] ?? null) !== (ahora[c] ?? null)) r.push({ campo: c, antes: textoOVacio(antes[c]), ahora: textoOVacio(ahora[c]) });
  return r;
}

/** El texto del aviso: «Campo: antes → ahora» por cada cambio. */
export function textoDeCambios(titulo: string, cambios: readonly Cambio[]): string {
  return titulo + ". La oficina ha cambiado la fecha o el lugar. " + cambios.map(c => NOMBRE_CAMPO[c.campo] + ": " + c.antes + " → " + c.ahora).join(". ") +
    ". Sigues apuntado; si ya no puedes, bórrate para dejar el sitio a otra familia.";
}
