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

// ---------------------------------------------------------------- fluidez en aparatos (PB9, contratos/medidas.md)
export const NOMBRE_APARATO = { escritorio: "escritorio", movil: "móvil", quest: "Quest" };
const ms1 = v => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—");

/** El p95 contra su objetivo: [clase de la pastilla, palabra]. Sin objetivo escrito (escritorio, móvil) no se juzga: solo la cifra. */
export function juicioFluidez(fila) {
  if (fila.objetivo_p95_ms === null || fila.objetivo_p95_ms === undefined) return ["p-info", "sin objetivo escrito"];
  return fila.p95_mediano_ms <= fila.objetivo_p95_ms ? ["p-ok", "cumple"] : ["p-mal", "no cumple"];
}

/** Las celdas de texto de una fila de la tabla «Fluidez en aparatos» (la api ya manda las cifras redondeadas a 0,1 ms). */
export function celdasFluidez(f) {
  return {
    dia: f.dia, aparato: (NOMBRE_APARATO[f.aparato] || f.aparato) + (f.vr ? " · VR" : ""), medidas: String(f.medidas),
    p95: ms1(f.p95_mediano_ms) + " ms" + (f.medidas > 1 ? " (peor " + ms1(f.p95_peor_ms) + " ms)" : ""),
    objetivo: f.objetivo_p95_ms === null || f.objetivo_p95_ms === undefined ? "—" : ms1(f.objetivo_p95_ms) + " ms",
    mediana: ms1(f.mediana_ms) + " ms", peor: ms1(f.peor_ms) + " ms", navegadores: (f.navegadores || []).join(", ") || "—", versiones: (f.versiones || []).join(", ") || "—",
    // Q0e: por qué va como va (todo puede faltar: una medida de antes, o de un cliente antiguo, no lo trae)
    js: textoJs(f), render: textoRender(f), bloque: textoBloqueCaro(f), nivel: textoNivel(f), perillas: typeof f.perillas === "string" && f.perillas ? f.perillas : "—", olivosGen: textoOlivosGen(f),
  };
}

/** Si el JS pasa de este valor (ms por fotograma), manda la CPU; si no, se mira la GPU (resolución, triángulos, teselas). Q0e. */
export const UMBRAL_JS_MS = 13;
/** La frase de lectura bajo la tabla «Fluidez en aparatos». */
export const LECTURA_FLUIDEZ = "Si el JS pasa de 13 ms, manda la CPU; si no, mira la GPU (resolución, triángulos, teselas).";

const num = v => typeof v === "number" && Number.isFinite(v);
/** «6,8 / 11,2 ms» (mediana / p95 del JS por fotograma); «—» si no llegó. */
export function textoJs(f) {
  if (!num(f.js_mediana_ms) && !num(f.js_p95_ms)) return "—";
  return ms1(f.js_mediana_ms) + " / " + ms1(f.js_p95_ms) + " ms";
}
/** «2,1 / 3,4 ms» (mediana / p95 de renderer.render() por fotograma, Q0i); «—» si no llegó. */
export function textoRender(f) {
  if (!num(f.render_mediana_ms) && !num(f.render_p95_ms)) return "—";
  return ms1(f.render_mediana_ms) + " / " + ms1(f.render_p95_ms) + " ms";
}
/** «olivo (estación) 3,8 ms»: el bloque del motor que más cuesta (p95 mediano del día, Q0i); «—» si ninguna medida traía el reparto. */
export function textoBloqueCaro(f) {
  if (typeof f.bloque_caro !== "string" || !f.bloque_caro) return "—";
  return f.bloque_caro + (num(f.bloque_caro_p95_ms) ? " " + ms1(f.bloque_caro_p95_ms) + " ms" : "");
}
/** ¿Manda la CPU? true si el p95 del JS pasa de 13 ms, false si no, null si no hay dato. */
export function mandaLaCpu(f) { return num(f.js_p95_ms) ? f.js_p95_ms > UMBRAL_JS_MS : null; }
/** «3 → 3» (nivel de VR_PERFILES al empezar y al terminar; -1 = no es VR, se enseña «—»). */
export function textoNivel(f) {
  const n = v => (num(v) && v >= 0 ? String(v) : "—");
  if (!num(f.nivel_ini) && !num(f.nivel_fin)) return "—";
  return n(f.nivel_ini) + " → " + n(f.nivel_fin);
}
/** «sí» / «no» / «mixto (2 de 3)» / «—» según cuántas medidas con dato traían los olivos generados activos. */
export function textoOlivosGen(f) {
  const de = Number(f.olivos_gen_de) || 0, si = Number(f.olivos_gen_si) || 0;
  if (!de) return "—";
  return si === de ? "sí" : si === 0 ? "no" : "mixto (" + si + " de " + de + ")";
}

/** La consulta de GET /api/admin/medidas con los filtros que no están vacíos. */
export function consultaMedidas({ aparato, desde, hasta } = {}) {
  const q = new URLSearchParams();
  if (aparato) q.set("aparato", aparato);
  if (desde) q.set("desde", desde);
  if (hasta) q.set("hasta", hasta);
  const s = q.toString();
  return "/api/admin/medidas" + (s ? "?" + s : "");
}
