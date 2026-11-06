/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/config.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

export type Fecha = string;

/**
 * config
 */
export interface Config {
  v: 1;
  componentes?: {
    [k: string]: {
      activo: boolean;
      parametros?: {};
    };
  };
  escalera?: {
    umbralesPx?: {
      e0: number;
      e1: number;
      e2: number;
    };
    bandaM?: number;
    histeresis?: number;
    maxPropios?: number;
    maxPropiosGafas?: number;
    maxVariantes?: number;
    triangulos?: {
      escritorio?: number;
      movil?: number;
      /**
       * @minItems 4
       * @maxItems 4
       */
      gafas?: [number, number, number, number];
    };
    fraccionE0Gafas?: number;
    vrJsMs?: number;
    factorCopa?: number;
  };
  epocas?: {
    comun: Tabla;
    fincas?: {
      [k: string]: Tabla1;
    };
  };
}
export interface Tabla {
  reposo: Ventana;
  boton: Ventana;
  flor: Ventana;
  cuajado: Ventana;
  verde: Ventana;
  envero: Ventana;
  madura: Ventana;
}
export interface Ventana {
  desde: Fecha;
  hasta: Fecha;
}
export interface Tabla1 {
  reposo: Ventana;
  boton: Ventana;
  flor: Ventana;
  cuajado: Ventana;
  verde: Ventana;
  envero: Ventana;
  madura: Ventana;
}
