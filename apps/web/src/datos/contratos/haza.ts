/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/haza.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * Ficha pública de una haza (GET /api/hazas/{id})
 */
export interface Haza {
  id: number;
  codigo: string;
  nombre: string;
  finca: string;
  /**
   * true si la haza está asignada al hogar de la sesión
   */
  es_mia: boolean;
  /**
   * alias del hogar titular SOLO si ese hogar lo hizo visible; si no, null
   */
  alias: string | null;
  superficie_ha: number;
  olivos: {
    lidar: {
      n: number;
      fuente: string;
      naturaleza: "detectado";
    };
    declarado: {
      n: number | null;
      fuente: string | null;
      naturaleza: "declarado";
    };
  };
  /**
   * @maxItems 50
   */
  tratamientos: {
    fecha: string;
    /**
     * @maxItems 12
     */
    componentes: {
      tipo: "fitosanitario" | "nutricion" | "corrector" | "otro";
      producto: string;
      n_registro: string | null;
      dosis: number | null;
      unidad: "l/ha" | "kg/ha" | "%" | "cc/hl" | "g/hl" | null;
    }[];
    plazo_seguridad_dias: number | null;
  }[];
  /**
   * @maxItems 20
   */
  analiticas: {
    fecha: string;
    tipo: "suelo" | "foliar" | "agua" | "otra";
    resultados: {
      /**
       * This interface was referenced by `undefined`'s JSON-Schema definition
       * via the `patternProperty` "^[A-Za-z0-9_]{1,24}$".
       */
      [k: string]: number;
    };
  }[];
  /**
   * @maxItems 20
   */
  fenologia: {
    fecha: string;
    bbch: number;
  }[];
  /**
   * porcentaje recogido (solo el %, nunca kilos); null si ninguna parcela tiene aforo con el que comparar
   */
  avance: {
    pct: number | null;
    parcelas_con_dato: number;
    parcelas: number;
    fecha: string | null;
  };
  ndvi_relativo: null | {
    /**
     * desviación del NDVI de la haza respecto al resto de la finca en la misma fecha
     */
    valor: number;
    fecha: string;
    fuente: string;
    naturaleza: "relativo";
  };
  /**
   * la lectura de OlivarTrack más antigua de las que componen la ficha (consultadoEn)
   */
  datos_de: string | null;
  /**
   * false si alguna lectura llegó truncada, parcial, con error o no se ha hecho: no se sacan totales
   */
  completo: boolean;
  /**
   * @maxItems 4
   */
  avisos: ("ot_sin_sincronia" | "ot_truncado" | "ot_parcial" | "ot_error")[];
}
