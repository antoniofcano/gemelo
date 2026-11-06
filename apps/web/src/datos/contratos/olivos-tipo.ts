/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/olivos-tipo.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * olivos-tipo
 */
export interface OlivosTipo {
  v: 1;
  id: string;
  nombre: string;
  fuente: "ilustrativo";
  unidades: "m";
  arriba: "+Y";
  licencia: Licencia;
  generador?: string;
  /**
   * @minItems 1
   * @maxItems 16
   */
  tipos: [Tipo, ...Tipo[]];
}
export interface Licencia {
  spdx: string;
  autor: string;
  atribucion: string;
}
export interface Tipo {
  id: number;
  nombre: string;
  descripcion?: string;
  fuente: "ilustrativo";
  altura_m: number;
  radio_m: number;
  licencia?: Licencia1;
  niveles: {
    L0?: Nivel;
    L1: Nivel;
    L2: Nivel;
  };
}
export interface Licencia1 {
  spdx: string;
  autor: string;
  atribucion: string;
}
export interface Nivel {
  glb: string;
  triangulos: number;
  /**
   * @minItems 1
   * @maxItems 3
   */
  piezas: ["copa" | "tronco", ...("copa" | "tronco")[]];
}
