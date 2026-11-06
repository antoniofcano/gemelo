/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/decoraciones.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * Catálogo de decoraciones de temporada de un olivo (contratos/decoraciones.json)
 */
export interface Decoraciones {
  v: 1;
  $comment?: string;
  /**
   * @minItems 1
   * @maxItems 64
   */
  piezas: [
    {
      id: string;
      nombre: string;
      epoca: "primavera" | "verano" | "otono" | "invierno";
      triangulos: number;
      ilustrativa: true;
    },
    ...{
      id: string;
      nombre: string;
      epoca: "primavera" | "verano" | "otono" | "invierno";
      triangulos: number;
      ilustrativa: true;
    }[]
  ];
}
