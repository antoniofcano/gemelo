/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/hornero-manifiesto.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

export type Epoca = "reposo" | "boton" | "flor" | "cuajado" | "verde" | "envero" | "madura";
export type Fecha = string;
export type Huella = string;
/**
 * @minItems 3
 */
export type Vec3 = [number, number, number];
/**
 * @minItems 3
 */
export type Vec31 = [number, number, number];

/**
 * hornero-manifiesto
 */
export interface HorneroManifiesto {
  v: 1;
  finca: string;
  formato: 1;
  gen_version: string;
  cache_version: number;
  horneado_en: string;
  brotli: number;
  actual: "reposo" | "boton" | "flor" | "cuajado" | "verde" | "envero" | "madura";
  /**
   * @minItems 1
   * @maxItems 7
   */
  epocas: [
    {
      epoca: Epoca;
      desde: Fecha;
      hasta: Fecha;
    },
    ...{
      epoca: Epoca;
      desde: Fecha;
      hasta: Fecha;
    }[]
  ];
  variantes: {
    tipo: "planton" | "adulto1" | "adulto2" | "adulto3" | "centenario" | "centenario2" | "centenario3";
    semilla: number;
    nivel: "E0" | "E1" | "E2" | "E2VR";
    epoca: Epoca;
    huella: Huella;
    bytes: number;
    bytes_br: number;
  }[];
  propios: {
    activos: boolean;
    /**
     * @minItems 1
     */
    combinaciones?: [
      {
        nivel: "E0" | "E1";
        epoca: Epoca;
      },
      ...{
        nivel: "E0" | "E1";
        epoca: Epoca;
      }[]
    ];
    manifiesto_tesela?: string;
  };
  /**
   * @maxItems 7
   */
  impostores?: {
    formato: 1;
    epoca: Epoca;
    nivel: "E2";
    rejilla: 8;
    vista: 128;
    vista_normal: 64;
    clave: string;
    color: Imagen;
    normales: Imagen1;
    /**
     * @minItems 1
     * @maxItems 4
     */
    variantes: [
      {
        celda: number;
        tipo: "planton" | "adulto1" | "adulto2" | "adulto3" | "centenario" | "centenario2" | "centenario3";
        semilla: number;
        fuente: string;
        /**
         * @minItems 2
         */
        caja: [Vec3, Vec3];
        centro: Vec31;
        semilado: number;
        copa: {
          centro: Vec3;
          semiejes: Vec3;
        };
        medidas: {
          altura_m: number;
          copa_m: number;
        };
      },
      ...{
        celda: number;
        tipo: "planton" | "adulto1" | "adulto2" | "adulto3" | "centenario" | "centenario2" | "centenario3";
        semilla: number;
        fuente: string;
        /**
         * @minItems 2
         */
        caja: [Vec3, Vec3];
        centro: Vec31;
        semilado: number;
        copa: {
          centro: Vec3;
          semiejes: Vec3;
        };
        medidas: {
          altura_m: number;
          copa_m: number;
        };
      }[]
    ];
    horneado: {
      three: string;
      chrome: string;
      ms: number;
    };
    siluetas?: {
      vertices: number;
      umbral: number;
      ensancha: number;
      /**
       * @maxItems 256
       */
      poligonos: [number, number, number, number, number, number, ...number[]][];
    };
  }[];
}
export interface Imagen {
  huella: string;
  bytes: number;
  lado: 1024 | 2048;
  imagen: "webp";
  sin_perdida: boolean;
}
export interface Imagen1 {
  huella: string;
  bytes: number;
  lado: 1024 | 2048;
  imagen: "webp";
  sin_perdida: boolean;
}
