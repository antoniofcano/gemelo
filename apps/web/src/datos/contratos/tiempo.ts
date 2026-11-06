/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/tiempo.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

export type Num = number | null;
export type Texto = string;

/**
 * El tiempo de la explotación (GET /api/tiempo), versión 1
 */
export interface Tiempo {
  version: 1;
  /**
   * vigia = leído por MCP; fixture = respuestas sintéticas de pruebas (nunca en producción)
   */
  origen: "vigia" | "fixture";
  /**
   * cuándo leyó la api a Vigía la parte más antigua de las dos (la caché guarda el actual 10 min y la previsión 1 h)
   */
  consultadoEn: string;
  /**
   * Lo medido por la estación de Vigía (no está en la finca). null si Vigía no tiene lectura o no respondió.
   */
  actual: null | {
    naturaleza: "medido";
    estacion: {
      id: string | null;
      distanciaKm: number | null;
      advertencia: string | null;
    };
    /**
     * °C
     */
    temperatura: number | null;
    /**
     * %
     */
    humedadRelativa: number | null;
    /**
     * m/s (Vigía pone en duda el anemómetro: ver la advertencia de la dirección)
     */
    viento: number | null;
    /**
     * m/s
     */
    racha: number | null;
    direccion: {
      /**
       * de dónde viene el viento; 0 = norte, 90 = este
       */
      grados: number | null;
      advertencia: string | null;
    };
    /**
     * mm acumulados (no es intensidad)
     */
    lluviaAcumulada: number | null;
    /**
     * °C
     */
    deltaT: number | null;
    /**
     * @maxItems 20
     */
    inhabilitados: string[];
    frescura: Frescura;
  };
  /**
   * Previsión modelada de Vigía, una por finca (rejilla de ~5 km), hora a hora. null si Vigía no la tiene o no respondió.
   */
  prevision: null | {
    naturaleza: "modelado";
    ambito: string | null;
    /**
     * @minItems 1
     * @maxItems 96
     */
    horas: [
      {
        /**
         * UTC, en orden creciente
         */
        instante: string;
        temperatura: Num;
        humedadRelativa: Num;
        viento: Num;
        racha: Num;
        direccion: number | null;
        nubosidad: number | null;
        /**
         * mm en esa hora
         */
        lluvia: number | null;
        probabilidadLluvia: number | null;
        deltaT: Num;
      },
      ...{
        /**
         * UTC, en orden creciente
         */
        instante: string;
        temperatura: Num;
        humedadRelativa: Num;
        viento: Num;
        racha: Num;
        direccion: number | null;
        nubosidad: number | null;
        /**
         * mm en esa hora
         */
        lluvia: number | null;
        probabilidadLluvia: number | null;
        deltaT: Num;
      }[]
    ];
    frescura: Frescura;
  };
  /**
   * @maxItems 20
   */
  avisos: {
    /**
     * vigia = texto de Vigía (dato, se escapa); gemelo = lo añade la api (antigüedad, una parte que no respondió)
     */
    de: "vigia" | "gemelo";
    texto: Texto;
  }[];
}
export interface Frescura {
  /**
   * cuándo generó Vigía el dato
   */
  generadoEn: string | null;
  /**
   * la que dice Vigía al responder
   */
  horasDeAntiguedad: number | null;
  /**
   * Vigía avisa de que el dato es de maqueta
   */
  datosDeMaqueta: boolean | null;
}
