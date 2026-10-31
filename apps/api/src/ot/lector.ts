// Lectura de OlivarTrack detrás de una interfaz (contratos/olivartrack-sync.md): el cliente MCP de verdad (lector-mcp.ts)
// o una grabación sintética para las pruebas (lector-grabado.ts). SOLO lectura: la lista de herramientas es cerrada, y
// el lector MCP además se niega a trabajar si el token deja ver herramientas de escritura.

/** las que lee la sincronía hacia la base (la ficha de haza, contratos/olivartrack-sync.md) */
export const HERRAMIENTAS_SINCRONIA = ["pases_del_periodo", "novedades", "aforo_y_avance_de_recoleccion"] as const;
export type HerramientaSincronia = (typeof HERRAMIENTAS_SINCRONIA)[number];
/** las que lee en vivo GET /api/ot/hoy (contratos/ot-hoy.md), con memoria y lista blanca */
export const HERRAMIENTAS_HOY = ["tareas_abiertas", "trabajo_realizado", "atencion_de_hoy"] as const;
export type HerramientaHoy = (typeof HERRAMIENTAS_HOY)[number];
export const HERRAMIENTAS_LECTURA = [...HERRAMIENTAS_SINCRONIA, ...HERRAMIENTAS_HOY] as const;
export type HerramientaLectura = (typeof HERRAMIENTAS_LECTURA)[number];

/** Prefijos de las herramientas de escritura conocidas del MCP de OlivarTrack (contratos/mcp.md). */
export const PREFIJOS_ESCRITURA = ["registrar_", "proponer_", "anotar_", "reportar_", "anadir_"];

export interface LectorOlivarTrack {
  /** Llama a una herramienta de lectura y devuelve su salida estructurada (objeto JSON), sin interpretar. */
  llama(herramienta: HerramientaLectura, entrada: Record<string, string | number>): Promise<unknown>;
  cierra(): Promise<void>;
}

export class ErrorDeLectura extends Error {}

export function esHerramientaDeLectura(h: string): h is HerramientaLectura {
  return (HERRAMIENTAS_LECTURA as readonly string[]).includes(h);
}
