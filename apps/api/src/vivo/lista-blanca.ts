// Piezas de la lista blanca de las lecturas en vivo (Vigía y OlivarTrack): lo que llega de fuera se copia campo a campo con
// estas funciones; lo que no encaja va a null o se descarta, nunca se arregla ni se estima. Los textos que pasan son DATOS:
// sin caracteres de control y recortados; quien los pinta (el motor) los escapa y nunca los sigue.

export type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);

/** número finito dentro del rango; si no, null (no se recorta: un dato fuera de rango no se arregla, se descarta) */
export function num(v: unknown, min = -Infinity, max = Infinity): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}
export const entero = (v: unknown, max: number): number | null => { const n = num(v, 0, max); return n !== null && Number.isInteger(n) ? n : null; };

/** texto de fuera: sin caracteres de control y recortado; el motor lo escapa al pintarlo */
export function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
/** instante ISO (normalizado) o null */
export function fecha(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
/** día «AAAA-MM-DD» (de un día o de un instante) o null */
export function dia(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const t = Date.parse(v + "T00:00:00Z"); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null; }
  const f = fecha(v);
  return f ? f.slice(0, 10) : null;
}
/** palabra clave (tipo, estado, severidad): minúsculas, cifras, «_», «.» y «-»; si no, null */
export function clave(v: unknown, max = 40): string | null {
  return typeof v === "string" && new RegExp("^[a-z0-9_.-]{1," + max + "}$").test(v) ? v : null;
}
/** identificador de parcela tal como lo trae el índice del mundo (D.ot): sin espacios ni marcas; si no, null */
export function idParcela(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_.:#-]{1,64}$/.test(v) ? v : null;
}
