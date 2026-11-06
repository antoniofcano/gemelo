/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/ot-hoy.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * huella opaca del id de tarea de OlivarTrack: solo sirve para cruzar las dos listas
 */
export type Clave = string;
/**
 * id de parcela de OlivarTrack (PATRON_ID_PARCELA de apps/api/src/vivo/lista-blanca.ts): letras con tilde, cifras y : _ . # ( ) / -; sin espacios. Formas comprobadas en solo lectura el 2026-11-05
 */
export type Parcela = string | null;
export type Palabra = string;
export type Dia = string | null;

/**
 * Lo de hoy en OlivarTrack y Vigía (GET /api/ot/hoy), versión 1
 */
export interface OtHoy {
  version: 1;
  origen: {
    /**
     * olivartrack = leído por MCP; grabado = respuestas sintéticas de pruebas (nunca en producción); null = apagado
     */
    ot: "olivartrack" | "grabado" | null;
    vigia: "vigia" | "fixture" | null;
  };
  /**
   * cuándo leyó la api la parte más antigua de las que se sirven
   */
  consultadoEn: string;
  /**
   * false si falta alguna parte, si alguna es la última que llegó (fallo o tope), si viene truncada o parcial, o si se descartó algo
   */
  completo: boolean;
  tareasAbiertas: {
    leidoEn: string;
    /**
     * el consultadoEn de OlivarTrack
     */
    consultadoEn: string | null;
    /**
     * true: OlivarTrack no respondió (o se llegó al tope) y es la última lectura
     */
    viejo: boolean;
    descartadas: number;
    truncado: boolean;
    /**
     * @maxItems 500
     */
    tareas: {
      clave: Clave;
      parcela: Parcela;
      finca: string | null;
      tipo: Palabra;
      nombre: string | null;
      fecha: Dia;
      estado: "pendiente" | "activo" | "pausada";
    }[];
  } | null;
  trabajoRealizado: {
    leidoEn: string;
    consultadoEn: string | null;
    viejo: boolean;
    descartadas: number;
    desde: string;
    hasta: Dia;
    truncado: boolean;
    /**
     * @maxItems 500
     */
    tareas: {
      clave: Clave;
      parcela: Parcela;
      finca: string | null;
      tipo: Palabra;
      titulo: string | null;
      completadaEn: Dia;
      estado: Palabra;
      avance: {
        /**
         * hecho sobre objetivo, en %; pasa de 100 si se hizo más de lo previsto
         */
        pct: number | null;
        /**
         * olivos hechos
         */
        hecho: number | null;
        /**
         * olivos de la tarea
         */
        objetivo: number | null;
      } | null;
    }[];
  } | null;
  atencion: {
    leidoEn: string;
    consultadoEn: string | null;
    viejo: boolean;
    descartadas: number;
    parcial: boolean;
    total: number | null;
    /**
     * @maxItems 30
     */
    puntos: {
      tipo: Palabra;
      n: number;
      severidad: string | null;
      /**
       * el recuento en palabras de OlivarTrack (sin nombres, según la herramienta)
       */
      texto: string | null;
    }[];
  } | null;
  vigia: {
    leidoEn: string;
    /**
     * frescura.generadoEn de Vigía
     */
    consultadoEn: string | null;
    viejo: boolean;
    descartadas: number;
    fecha: Dia;
    /**
     * Vigía: ninguna capa está calibrada contra observación de campo. Hoy Vigía da la calibración como texto (`calibracion`): esto queda null, no se deduce de la prosa
     */
    calibrada: boolean | null;
    /**
     * lo que dice Vigía de la calibración, como texto (DATO; el motor lo escapa). Opcional: un servidor anterior no lo manda
     */
    calibracion?: string | null;
    /**
     * cómo se lee lo que marca Vigía, una vez para todas las parcelas (DATO). Opcional: un servidor anterior no lo manda
     */
    comoSeLee?: string | null;
    frescura: {
      generadoEn: string | null;
      horasDeAntiguedad: number | null;
      datosDeMaqueta: boolean | null;
    };
    /**
     * @maxItems 100
     */
    pidenUnaMirada: {
      /**
       * nombre de la parcela según Vigía
       */
      parcela: string;
      gravedad: string | null;
      motivo: string | null;
      /**
       * por parcela, si Vigía lo diera así; hoy va una vez arriba (vigia.comoSeLee) y aquí queda null
       */
      comoSeLee: string | null;
    }[];
  } | null;
  /**
   * @maxItems 20
   */
  avisos: {
    de: "gemelo" | "olivartrack" | "vigia";
    texto: string;
  }[];
}
