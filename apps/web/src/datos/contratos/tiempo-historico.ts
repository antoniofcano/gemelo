/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/tiempo-historico.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * El histórico meteorológico de la explotación (GET /api/tiempo/historico), versión 1
 */
export interface TiempoHistorico {
  version: 1;
  /**
   * vigia = leído por MCP; fixture = respuestas sintéticas de pruebas (nunca en producción)
   */
  origen: "vigia" | "fixture";
  /**
   * cuándo leyó la api a Vigía (la caché guarda cada rango 1 h)
   */
  consultadoEn: string;
  /**
   * primer día pedido, incluido
   */
  desde: string;
  /**
   * último día pedido, incluido
   */
  hasta: string;
  /**
   * una por estación o fuente de Vigía, con las cifras del rango (medido)
   *
   * @maxItems 10
   */
  fuentes: {
    id: string;
    /**
     * °C, máxima del rango
     */
    temperaturaMaxima: number | null;
    /**
     * °C, mínima del rango
     */
    temperaturaMinima: number | null;
    /**
     * mm, total del rango
     */
    lluviaTotalMm: number | null;
    /**
     * días del rango que cuenta Vigía
     */
    dias: number | null;
    /**
     * días del rango sin dato de esa fuente
     */
    diasSinDato: number | null;
  }[];
  frescura: {
    generadoEn: string | null;
    horasDeAntiguedad: number | null;
    datosDeMaqueta: boolean | null;
  };
  /**
   * @maxItems 20
   */
  avisos: {
    de: "vigia" | "gemelo";
    texto: string;
  }[];
}
