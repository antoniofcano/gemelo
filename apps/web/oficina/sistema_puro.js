// Sistema (OF5): las piezas puras, sin DOM (se prueban con node). Todo es texto para quien lee: nada de HTML.

/** «hace 2 h», «hace 40 s»; con la fecha en el futuro o inválida, null. `ahora` en ms. */
export function hace(iso, ahora) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.round(((ahora ?? Date.now()) - t) / 1000);
  if (s < -60) return null;
  if (s < 90) return "hace " + Math.max(s, 1) + " s";
  const m = Math.round(s / 60);
  if (m < 90) return "hace " + m + " min";
  const hh = Math.round(m / 60);
  if (hh < 48) return "hace " + hh + " h";
  return "hace " + Math.round(hh / 24) + " días";
}

export function bytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " KB";
  return (n / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " MB";
}

/** El estado de un servicio: [clase de la pastilla, palabra]. La palabra va siempre: el color solo no cuenta. */
export const ESTADO_SALUD = { ok: ["p-ok", "en marcha"], aviso: ["p-aviso", "atención"], mal: ["p-mal", "falla"], apagado: ["p-info", "apagado"] };
/** El estado de una lectura de OlivarTrack. */
export const ESTADO_OT = { ok: ["p-ok", "ok"], truncado: ["p-aviso", "truncado"], parcial: ["p-aviso", "parcial"], error: ["p-mal", "error"] };
export const ESTADO_APARATO = { aprobado: ["p-ok", "confiable"], pendiente: ["p-aviso", "pendiente"], revocado: ["p-mal", "revocado"], caducado: ["p-info", "caducado"] };

/** El resumen de una sincronía (lista de { herramienta, estado }): «3 ok, 1 truncada…». */
export function resumenSincronia(resumen) {
  const n = { ok: 0, truncado: 0, parcial: 0, error: 0 };
  for (const r of resumen || []) if (r && r.estado in n) n[r.estado]++;
  const partes = [];
  if (n.ok) partes.push(n.ok + " ok");
  if (n.truncado) partes.push(n.truncado + " truncada" + (n.truncado > 1 ? "s" : ""));
  if (n.parcial) partes.push(n.parcial + " parcial" + (n.parcial > 1 ? "es" : ""));
  if (n.error) partes.push(n.error + " con error");
  const incompleta = n.truncado + n.parcial > 0;
  return partes.join(", ") + (incompleta ? " (no está completo: no se sacan totales de ahí)" : "");
}

/** El «sobre qué» de una fila de auditoría: «clave: valor · …», corto. El detalle ya llega sin datos personales. */
export function sobreQue(detalle, max) {
  if (!detalle || typeof detalle !== "object") return "";
  const s = Object.entries(detalle).map(([k, v]) => k + ": " + (v === null ? "—" : String(v))).join(" · ");
  return s.length > (max || 120) ? s.slice(0, (max || 120) - 1) + "…" : s;
}
