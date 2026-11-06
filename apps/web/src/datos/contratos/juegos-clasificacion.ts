/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/juegos-clasificacion.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * Clasificación de un juego casual entre familias, por alias (GET /api/juegos/{id}/clasificacion)
 */
export interface JuegosClasificacion {
  juego: string;
  /**
   * hogares activos con alguna partida de más de 0 puntos
   */
  total: number;
  /**
   * los n primeros puestos; los empates comparten puesto
   *
   * @maxItems 20
   */
  puestos: Puesto[];
  /**
   * el puesto del propio hogar, esté o no en la tabla; null si no ha puntuado
   */
  mia: Puesto | null;
}
export interface Puesto {
  puesto: number;
  alias: string | null;
  puntos: number;
  es_mia: boolean;
}
