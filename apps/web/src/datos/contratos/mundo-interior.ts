/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/mundo-interior.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * @minItems 2
 */
export type Xz = [number, number];
/**
 * @minItems 3
 */
export type Xyz = [number, number, number];
/**
 * @minItems 3
 */
export type Xyz1 = [number, number, number];
/**
 * @minItems 3
 */
export type Xyz2 = [number, number, number];
/**
 * @minItems 3
 */
export type Xyz3 = [number, number, number];
/**
 * @minItems 9
 * @maxItems 9
 */
export type Sonda = [Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, ...Rgb[]];
/**
 * @minItems 3
 */
export type Rgb = [number, number, number];
/**
 * @minItems 3
 */
export type Xyz4 = [number, number, number];
/**
 * @minItems 3
 */
export type Xyz5 = [number, number, number];
/**
 * @minItems 9
 * @maxItems 9
 */
export type Sonda1 = [Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, ...Rgb[]];

/**
 * mundo-interior
 */
export interface MundoInterior {
  v: 1;
  id: string;
  nombre: string;
  fuente: "medido" | "ilustrativo" | "mixto";
  notas?: string;
  licencia: Licencia;
  glb: string;
  unidades: "m";
  arriba: "+Y";
  aforo?: number;
  /**
   * @minItems 1
   * @maxItems 64
   */
  zonas: [Zona, ...Zona[]];
  /**
   * @minItems 1
   * @maxItems 8
   */
  puertas: [Puerta, ...Puerta[]];
  /**
   * @maxItems 32
   */
  animaciones?: Animacion[];
  /**
   * @maxItems 64
   */
  puntos?: Punto[];
  anclaje?: Anclaje;
  /**
   * @minItems 1
   * @maxItems 16
   */
  paradas?: [Parada, ...Parada[]];
  /**
   * @minItems 1
   * @maxItems 32
   */
  fuentes?: [Fuente, ...Fuente[]];
  luz?: Luz;
  /**
   * @maxItems 64
   */
  maquinas?: Maquina[];
}
export interface Licencia {
  spdx: string;
  autor: string;
  atribucion: string;
}
export interface Zona {
  id: string;
  /**
   * @minItems 3
   * @maxItems 256
   */
  anillo: [Xz, Xz, Xz, ...Xz[]];
  y: number;
}
export interface Puerta {
  id: string;
  a: string;
  pos: Xyz;
  rumbo: number;
  ancho: number;
  alto: number;
  llegada: {
    pos: Xyz1;
    rumbo: number;
  };
}
export interface Animacion {
  nombre: string;
  bucle: boolean;
  fuente: "ilustrativo" | "deducido";
}
export interface Punto {
  id: string;
  titulo: string;
  pos: Xyz1;
}
export interface Anclaje {
  /**
   * @minItems 2
   */
  pos: [number, number];
  giro: number;
}
export interface Parada {
  id: string;
  pos: Xyz2;
  radio: number;
  ancla: {
    pos: Xyz3;
    nodo?: string;
    aprox: boolean;
  };
  puerta?: string;
  ficha: Ficha;
}
export interface Ficha {
  titulo: string;
  texto: string;
  dato_curioso?: string;
  nota_visible?: string;
  procedencia_visible: "medido" | "deducido" | "ilustrativo";
  /**
   * @minItems 1
   * @maxItems 3
   */
  procedencia_texto: ["documentado" | "testimonio" | "sin_fuente", ...("documentado" | "testimonio" | "sin_fuente")[]];
  /**
   * @maxItems 16
   */
  fuentes: string[];
  /**
   * @maxItems 16
   */
  pendiente?: string[];
}
export interface Fuente {
  id: string;
  cita: string;
  url?: string;
  verificada: boolean;
}
export interface Luz {
  modo: "base" | "mapa";
  escala?: number;
  sonda?: Sonda;
  nota?: string;
}
export interface Maquina {
  id: string;
  nombre?: string;
  nodo: string;
  tipo: "giro" | "vaiven" | "traslacion" | "textura";
  pivote?: Xyz4;
  eje?: Xyz5;
  recorrido?: number;
  pausa_s?: number;
  material?: string;
  /**
   * @minItems 2
   */
  uv?: [number, number];
  velocidad?: number;
  relacion?: {
    con: string;
    factor: number;
  };
  luz: "propia" | "horneada";
  fuente: "ilustrativo" | "deducido";
  sonda?: Sonda1;
  nota?: string;
}
