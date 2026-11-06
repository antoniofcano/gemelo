/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/avatares.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * avatares
 */
export type Avatares = CatalogoV1 | CatalogoV2;

export interface CatalogoV1 {
  v: 1;
  compresion: "cuantizacion" | "meshopt" | "ninguna";
  topes: Topes;
  /**
   * @minItems 1
   * @maxItems 12
   */
  avatares: [Avatar, ...Avatar[]];
}
export interface Topes {
  triangulos_objetivo: number;
  triangulos_max: number;
  bytes_max: number;
  textura_px_max: number;
  texturas_max: number;
  materiales_max: number;
}
export interface Avatar {
  id: string;
  nombre: string;
  descripcion?: string;
  fichero: string;
  sha256: string;
  bytes: number;
  vrm_version: "1.0" | "0.x";
  triangulos: number;
  primitivas: number;
  materiales: number;
  texturas: number;
  contornos_quitados?: number;
  autor: string;
  licencia: Licencia;
  fuente: Fuente;
  colores_muneco: {
    camisa: string;
    piel: string;
    sombrero: "ninguno" | "paja" | "gorra";
  };
}
export interface Licencia {
  spdx: string;
  url: string;
  credito_obligatorio: boolean;
  texto_credito: string;
}
export interface Fuente {
  nombre: string;
  url?: string;
}
export interface CatalogoV2 {
  v: 2;
  compresion: "cuantizacion" | "meshopt" | "ninguna";
  topes: Topes1;
  topes_combinacion: {
    triangulos: number;
    primitivas: number;
  };
  paletas: {
    /**
     * @minItems 10
     * @maxItems 10
     */
    piel: [
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ...ColorNombrado[]
    ];
    /**
     * @minItems 10
     * @maxItems 10
     */
    ropa: [
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ...ColorNombrado[]
    ];
    /**
     * @minItems 7
     * @maxItems 10
     */
    pelo: [
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ColorNombrado,
      ...ColorNombrado[]
    ];
  };
  /**
   * @minItems 1
   * @maxItems 32
   */
  cuerpos: [Cuerpo, ...Cuerpo[]];
  /**
   * @maxItems 64
   */
  piezas: Pieza[];
  /**
   * @maxItems 12
   */
  avatares?: Avatar[];
}
export interface Topes1 {
  triangulos_objetivo: number;
  triangulos_max: number;
  bytes_max: number;
  textura_px_max: number;
  texturas_max: number;
  materiales_max: number;
}
export interface ColorNombrado {
  id: string;
  nombre: string;
  color: string;
}
export interface Cuerpo {
  id: string;
  nombre: string;
  descripcion?: string;
  edad: "peque" | "joven" | "adulta" | "mayor";
  complexion: "delgada" | "media" | "ancha";
  ofrecer: boolean;
  fichero: string;
  sha256: string;
  bytes: number;
  vrm_version: "1.0" | "0.x";
  triangulos: number;
  primitivas: number;
  materiales: number;
  texturas: number;
  autor: string;
  licencia: Licencia;
  fuente: Fuente;
  /**
   * @maxItems 64
   */
  piezas: string[];
  mirada: "huesos" | "expresion" | "ninguna";
}
export interface Pieza {
  id: string;
  tipo: "pelo" | "vello" | "ropa" | "accesorio";
  nombre: string;
  malla: string;
  /**
   * @minItems 1
   * @maxItems 4
   */
  materiales: [
    "pelo" | "ropa_base" | "ropa_abajo" | "sombrero",
    ...("pelo" | "ropa_base" | "ropa_abajo" | "sombrero")[]
  ];
  triangulos: number;
  cubre_ropa_base?: boolean;
  sombrero?: "paja" | "gorra";
  color?: string;
  /**
   * @minItems 1
   */
  edades?: ["peque" | "joven" | "adulta" | "mayor", ...("peque" | "joven" | "adulta" | "mayor")[]];
}
