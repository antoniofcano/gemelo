/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/olivo-generado.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

export type CopasParamFila = null | [number, number, number, number, number, number, number, number];

/**
 * Entrada del generador de olivos y fila de copas_param (contratos/olivo-generado.md, ADR-0017)
 */
export interface OlivoGenerado {
  entrada?: Entrada;
  copas_param?: CopasParamFila[];
}
export interface Entrada {
  tipo?: "planton" | "adulto1" | "adulto2" | "adulto3" | "centenario" | "centenario2" | "centenario3" | null;
  parametros?: {};
  epoca: "reposo" | "boton" | "flor" | "cuajado" | "verde" | "envero" | "madura";
  semilla: number;
}
