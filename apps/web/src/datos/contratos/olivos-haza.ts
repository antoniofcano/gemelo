/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/olivos-haza.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * Olivos personalizados de una haza (GET /api/hazas/{id}/olivos)
 */
export interface OlivosHaza {
  haza_id: number;
  es_mia: boolean;
  /**
   * @maxItems 5000
   */
  olivos: {
    id: number;
    finca: string;
    copas_id: number;
    nombre: string | null;
    decoracion: string | null;
    objeto: null | {
      tipo: "foto" | "pintura";
      url: string;
      ancho: number;
      alto: number;
    };
  }[];
}
