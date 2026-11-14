// Visita guiada compartida en los interiores (decisiones 233-238): el estado de la visita (en qué mundo está el grupo, en qué parada, si las máquinas están
// en marcha) lo escribe SOLO la api en los metadatos de la sala `guiada-<evento>` de LiveKit (RoomService.UpdateRoomMetadata); el cliente los lee. Aquí, la
// parte pura: la forma de los metadatos, su lectura tolerante y la mezcla con lo que pide el guía. La ruta es POST /api/presencia/guiadas/:evento/visita (voz_rutas.ts).
import { readFileSync } from "node:fs";

/** Los mundos de la pose (contratos/livekit-roles.json, `mundos_pose.lista`; el índice es el código de 2 bits de la pose). «otro» (3) lo publica el cliente para un
 *  mundo no listado, pero no es un mundo al que se pueda llevar al grupo. La api lee la clave del contrato si el fichero está junto al código (en desarrollo y
 *  en las pruebas); en la imagen de Docker, que no lleva contratos/, usa la lista literal del acuerdo del 2026-11-14 (la prueba de unidad compara las dos). */
export const MUNDOS_POSE_LITERAL: readonly string[] = ["exterior", "patios", "fabrica", "otro"];
function mundosDelContrato(): readonly string[] {
  try {
    const j = JSON.parse(readFileSync(new URL("../../../../contratos/livekit-roles.json", import.meta.url), "utf8")) as { mundos_pose?: { lista?: unknown } };
    const m = j.mundos_pose && j.mundos_pose.lista;   // livekit-roles v9: { $comment, lista }
    if (Array.isArray(m) && m.length > 0 && m.every(x => typeof x === "string")) return m as string[];
  } catch { /* sin contrato a mano: la lista literal */ }
  return MUNDOS_POSE_LITERAL;
}
export const MUNDOS_POSE: readonly string[] = mundosDelContrato();
/** Los mundos a los que se puede llevar a la visita: los de la pose menos «otro». */
export const MUNDOS_VISITA: readonly string[] = MUNDOS_POSE.filter(m => m !== "otro");
export const PARADA_MAX = 63;
export const VISITA_MAX_BYTES = 512;

export interface VisitaMaquinas { marcha: boolean; desde: number }
export interface Visita { v: 1; mundo: string; parada: number | null; maquinas: VisitaMaquinas | null; n: number }
export interface CuerpoVisita { mundo?: string; parada?: number | null; maquinas?: { marcha: boolean } }

/** Metadatos vacíos o ilegibles. */
export const VISITA_POR_DEFECTO: Visita = { v: 1, mundo: "exterior", parada: null, maquinas: null, n: 0 };

/** Lee los metadatos de la sala como dato (nunca como orden): lo que no cuadra se sustituye por el valor por defecto, campo a campo. */
export function leeVisita(texto: string | null | undefined): Visita {
  if (!texto) return { ...VISITA_POR_DEFECTO };
  let o: unknown;
  try { o = JSON.parse(texto); } catch { return { ...VISITA_POR_DEFECTO }; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ...VISITA_POR_DEFECTO };
  const x = o as Record<string, unknown>;
  const mundo = typeof x.mundo === "string" && MUNDOS_VISITA.includes(x.mundo) ? x.mundo : VISITA_POR_DEFECTO.mundo;
  const parada = typeof x.parada === "number" && Number.isInteger(x.parada) && x.parada >= 0 && x.parada <= PARADA_MAX ? x.parada : null;
  const m = x.maquinas as Record<string, unknown> | null | undefined;
  const maquinas = m && typeof m === "object" && typeof m.marcha === "boolean" && typeof m.desde === "number" && Number.isFinite(m.desde) ? { marcha: m.marcha, desde: m.desde } : null;
  const n = typeof x.n === "number" && Number.isInteger(x.n) && x.n >= 0 ? x.n : 0;
  return { v: 1, mundo, parada, maquinas, n };
}

/** El esquema JSON del cuerpo de la ruta (additionalProperties false; al menos un campo). */
export const ESQUEMA_CUERPO_VISITA = {
  type: "object", additionalProperties: false, minProperties: 1,
  properties: {
    mundo: { type: "string", enum: [...MUNDOS_VISITA] },
    parada: { type: ["integer", "null"], minimum: 0, maximum: PARADA_MAX },
    maquinas: { type: "object", additionalProperties: false, required: ["marcha"], properties: { marcha: { type: "boolean" } } },
  },
} as const;

/** Mezcla lo pedido con el estado actual: cambiar de mundo pone la parada a null salvo que venga en el mismo cuerpo; `desde` solo cambia si cambia `marcha`
 *  (o si las máquinas no se habían tocado); `n` sube 1 en cada escritura. */
export function mezclaVisita(actual: Visita, c: CuerpoVisita, ahora: number): Visita {
  const sig: Visita = { ...actual, v: 1 };
  if (c.mundo !== undefined && c.mundo !== actual.mundo) { sig.mundo = c.mundo; sig.parada = null; }
  if (c.parada !== undefined) sig.parada = c.parada;
  if (c.maquinas !== undefined) {
    sig.maquinas = actual.maquinas && actual.maquinas.marcha === c.maquinas.marcha ? actual.maquinas : { marcha: c.maquinas.marcha, desde: ahora };
  }
  sig.n = actual.n + 1;
  return sig;
}
export const visitaATexto = (v: Visita): string => JSON.stringify(v);
export const visitaCabe = (texto: string): boolean => Buffer.byteLength(texto, "utf8") <= VISITA_MAX_BYTES;
