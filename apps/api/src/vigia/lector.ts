// Lectura de Vigía detrás de una interfaz (contratos/tiempo.md): el cliente MCP de verdad (lector-mcp.ts) o las respuestas
// sintéticas de pruebas (lector-fixture.ts). SOLO dos herramientas de lectura, sin argumentos: la lista es cerrada.

export const HERRAMIENTAS_TIEMPO = ["tiempo_en_la_explotacion", "prevision_72_horas"] as const;
export type HerramientaTiempo = (typeof HERRAMIENTAS_TIEMPO)[number];

export interface LectorVigia {
  /** Llama a una herramienta del tiempo y devuelve su salida estructurada (objeto JSON), sin interpretar. */
  llama(herramienta: HerramientaTiempo): Promise<unknown>;
  cierra(): Promise<void>;
  /** «vigia» (MCP) o «fixture» (sintético): se dice en la respuesta */
  readonly origen: "vigia" | "fixture";
}

export class ErrorDeVigia extends Error {}

export function esHerramientaTiempo(h: string): h is HerramientaTiempo {
  return (HERRAMIENTAS_TIEMPO as readonly string[]).includes(h);
}
