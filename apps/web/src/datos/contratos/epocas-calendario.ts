/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/epocas-calendario.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

export type Fecha = string;

/**
 * epocas-calendario
 */
export interface EpocasCalendario {
  v: 1;
  estado: string;
  origen: string;
  formato_fechas?: string;
  comun: Tabla;
  fincas: {
    [k: string]: Tabla1;
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
