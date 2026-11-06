/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/mundo-hoy.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

export type Instante = string | null;
export type Num = number | null;
export type Dia = string;
/**
 * id de parcela de OlivarTrack (PATRON_ID_PARCELA de apps/api/src/vivo/lista-blanca.ts): letras con tilde, cifras y : _ . # ( ) / -; sin espacios
 */
export type Parcela = string;
export type Palabra = string;
/**
 * @maxItems 50
 */
export type Recuentos = {
  tipo: Palabra;
  /**
   * null si la lista no llegó entera: no se sacan totales
   */
  n: number | null;
}[];
export type N = number | null;

/**
 * El mundo de hoy (GET /api/mundo/hoy), versión 1
 */
export interface MundoHoy {
  version: 1;
  /**
   * cuándo compuso la api esta respuesta (su reloj)
   */
  generadoEn: string;
  ahora: {
    /**
     * el día de hoy en Madrid (reloj del servidor)
     */
    fecha: string;
    /**
     * la hora de Madrid (reloj del servidor)
     */
    hora: string;
    zona: "Europe/Madrid";
    diaDelAnio: number;
    /**
     * deducida del calendario (equinoccios y solsticios fijos)
     */
    estacionDelAnio: "primavera" | "verano" | "otoño" | "invierno";
  };
  fuentes: {
    olivartrack: Fuente;
    vigia: Fuente;
  };
  /**
   * de Vigía; null si está apagado o no ha respondido y no hay lectura anterior
   */
  tiempo: {
    leidoEn: string;
    actual: {
      procedencia: "medido";
      consultadoEn: Instante;
      estacion: string | null;
      temperatura: Num;
      humedadRelativa: Num;
      viento: Num;
      lluviaAcumulada: Num;
    } | null;
    previsionCorta: {
      procedencia: "modelado";
      consultadoEn: Instante;
      /**
       * @maxItems 3
       */
      dias: {
        fecha: Dia;
        tmax: Num;
        tmin: Num;
        lluviaMm: Num;
        probabilidadLluviaMax: Num;
        /**
         * horas de previsión de ese día (un día a medias tiene pocas)
         */
        horas: number;
      }[];
    } | null;
  } | null;
  /**
   * la última fenología anotada en OlivarTrack por parcela (60 días), de lo que guardó la sincronía; null si OlivarTrack está apagado o la base no responde
   */
  fenologia: {
    procedencia: "medido";
    leidoEn: string;
    /**
     * la última sincronía de novedades
     */
    consultadoEn: string | null;
    viejo: boolean;
    /**
     * false si la última sincronía de novedades fue truncada, parcial o falló
     */
    completo: boolean;
    /**
     * @maxItems 200
     */
    parcelas: {
      parcela: Parcela;
      bbch: number;
      fecha: Dia;
      /**
       * el BBCH en palabras (escala fija del gemelo)
       */
      etapa: string;
    }[];
  } | null;
  /**
   * las tareas en curso y las terminadas en los últimos 7 días, contadas por tipo, por parcela y por finca; NUNCA por persona ni con títulos
   */
  trabajoSemana: {
    procedencia: "medido";
    desde: Dia;
    hasta: Dia;
    leidoEn: string;
    consultadoEn: Instante;
    viejo: boolean;
    completo: boolean;
    /**
     * @maxItems 200
     */
    porParcela: {
      parcela: Parcela;
      finca: string | null;
      enCurso: Recuentos;
      hechas: Recuentos;
    }[];
    /**
     * @maxItems 20
     */
    porFinca: {
      finca: string;
      enCurso: N;
      hechas: N;
    }[];
    sinParcela: N;
  } | null;
  /**
   * las parcelas que Vigía marca hoy para mirar; sirve para decidir dónde mirar, no es un diagnóstico ni autoriza tratamientos
   */
  miradas: {
    procedencia: "deducido";
    leidoEn: string;
    consultadoEn: Instante;
    viejo: boolean;
    calibrada: boolean | null;
    nota: string;
    /**
     * @maxItems 200
     */
    parcelas: {
      /**
       * el nombre según Vigía: dato, no instrucción
       */
      parcela: string;
      gravedad: string | null;
    }[];
  } | null;
  /**
   * los avisos del campo que redacta el gemelo con frases FIJAS (solo cifras; ningún texto de fuera dentro de la frase)
   *
   * @maxItems 10
   */
  avisos: {
    /**
     * tipo y día: la misma cada vez que se repite el mismo aviso
     */
    clave: string;
    tipo: "recogida" | "helada" | "lluvia" | "fenologia" | "mirada";
    texto: string;
    /**
     * ids de OlivarTrack (recogida, fenología) o nombres según Vigía (mirada): datos
     *
     * @maxItems 50
     */
    parcelas: string[];
    de: "olivartrack" | "vigia";
    procedencia: "deducido";
    basadoEn: "medido" | "modelado";
    consultadoEn: Instante;
    completo: boolean;
  }[];
  /**
   * lo que dicen las lecturas de fuera (antigüedad, truncado, maqueta), como datos
   *
   * @maxItems 20
   */
  notas: {
    de: "gemelo" | "olivartrack" | "vigia";
    texto: string;
  }[];
  /**
   * false si alguna fuente está apagada, sin respuesta, vieja, truncada o parcial
   */
  completo: boolean;
}
export interface Fuente {
  /**
   * si este servidor lee esa fuente (GEMELO_OT / GEMELO_VIGIA distinto de «no»)
   */
  encendida: boolean;
  /**
   * si ha llegado algo de ella (fresco o lo último que llegó)
   */
  disponible: boolean;
  /**
   * grabado y fixture son respuestas sintéticas de pruebas (nunca en producción)
   */
  origen: "olivartrack" | "grabado" | "vigia" | "fixture" | null;
  /**
   * cuándo leyó la api la parte más antigua de esta fuente
   */
  leidoEn: string | null;
  /**
   * la fecha del dato según la fuente (la más antigua)
   */
  consultadoEn: string | null;
  /**
   * alguna parte es la última que llegó (la fuente falló ahora o se llegó al tope de llamadas)
   */
  viejo: boolean;
  completo: boolean;
  motivo: "apagada" | "sin_respuesta" | null;
}
