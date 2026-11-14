/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/indice.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * @minItems 2
 */
export type CentroUtm = [number, number];
/**
 * @minItems 3
 */
export type Punto3 = [number, number, number];
/**
 * @minItems 2
 */
export type PuntoEje = [number, number, ...number[]];

/**
 * indice
 */
export interface Indice {
  v: 2;
  ts: 256;
  res: 1;
  srs: 2;
  orto_px: number;
  finca_id: string;
  centro_utm: CentroUtm;
  z0: number;
  zmax?: number;
  cobertura_nube?: number;
  /**
   * @minItems 4
   */
  ext: [number, number, number, number];
  titulo_vr?: string;
  config?: {
    factorR8?: number;
  };
  base?: string;
  tileset?: string;
  parcelas: Parcela[];
  fincas?: {
    nombre: string;
    parcelas: number[];
    ha: number;
    olivos: number;
  }[];
  copas: [
    number,
    number,
    number,
    [number, number, number, number, number, number, number, number, ...number[]],
    number
  ][];
  copas_id?: number[];
  copas_tipo?: number[];
  copas_semilla?: (number | null)[];
  copas_param?: (null | [number, number, number, number, number, number, number, number])[];
  marcados: [number, number, number, number][];
  ndvi?: {
    [k: string]: unknown;
  } & {
    w: number;
    h: number;
    fechas: string[];
    media: number[];
    u8?: string;
    b64?: string;
    codigo?: string;
  };
  suelo_ndvi?: {
    w: number;
    h: number;
    a: number[];
    b: number[];
    f: string;
    fechas: string[];
  };
  /**
   * Opcional (EV-1g): fichero de biodiversidad publicado junto al índice (contrato biodiversidad v1). Lo añade tuberia/biodiversidad/gbif_aves.py --marca-indice; sin él, el motor no lo pide.
   */
  biodiversidad?: string;
  ot: {
    fuente: "instantanea" | "vivo";
    fecha_consulta: string | null;
    pases_finca?: number;
    entregas_finca?: number;
    analiticas_finca?: number;
    parcelas: {
      [k: string]: {
        tareas: OtTarea[];
        fenologia: OtFenologia[];
      };
    };
  };
  avance: {};
  paisaje?: {
    fuente?: string;
    centro_utm?: CentroUtm;
    z0?: number;
    edificios: Edificio[];
    tendido: {
      linea: Punto3[];
      postes: Poste[];
      derivaciones?: {
        postes: Poste[];
        linea: Punto3[];
        nota?: string;
      }[];
    };
    arroyo: {
      ejes: PuntoEje[][];
      eje?: PuntoEje[];
      nota?: string;
    };
    arboles: Arbol[];
  };
  teselas: {
    [k: string]: {
      kx: number;
      ky: number;
      /**
       * @minItems 4
       */
      v: [number, number, number, number];
      np: number;
    };
  };
  grueso: {
    x0: number;
    yN: number;
    res: number;
    w: number;
    h: number;
    b64: string;
  };
  mosaico: {
    jpg: string;
    w: number;
    h: number;
    x0: number;
    yN: number;
    res: number;
  };
  textos?: {
    sin_historia?: boolean;
    finca: string;
    fincas?: number;
    parcelas?: number;
    ha?: number;
    olivos?: number;
    desfase_txt?: string;
    puntos_m2?: number;
    intro_historia?: string;
  };
}
export interface Parcela {
  id: string;
  nombre: string;
  ha: number;
  /**
   * @minItems 3
   */
  linde: [[number, number], [number, number], [number, number], ...[number, number][]];
  /**
   * @minItems 2
   */
  centro: [number, number];
  desfase?: unknown[];
  suelo?: {}[] | null;
  finca?: number;
  decl?: number;
  pasto?: boolean;
}
export interface OtTarea {
  tipo?: string | null;
  titulo?: string | null;
  fecha?: string | null;
  estado?: string | null;
  avance?: number | null;
  fuente?: string | null;
  andados?: number | null;
  objetivo?: number | null;
}
export interface OtFenologia {
  fecha: string;
  bbch: number | string | null;
}
export interface Edificio {
  x: number;
  y: number;
  largo: number;
  ancho: number;
  ang: number;
  zBase?: number;
  hAlero: number;
  hCumbrera: number;
  /**
   * @minItems 3
   */
  color: [number, number, number];
}
export interface Poste {
  x: number;
  y: number;
  zBase: number;
  zAlto: number;
  puntos?: number;
}
export interface Arbol {
  x: number;
  y: number;
  h: number;
  r: number;
  tipo?: string;
  zBase?: number;
  enCauce?: boolean;
}
