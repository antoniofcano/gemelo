// Decorar un olivo (P7g; decisiones 175-179; contrato contratos/decoraciones.md): una pieza de un catálogo cerrado de
// temporada, una sola por olivo y hogar (columna personalizaciones.decoracion, migración 0019). Aquí vive lo que no es HTTP:
// el catálogo, la época actual (función pura) y las operaciones sobre la base, para que las rutas (rutas.ts) sean finas y
// esto se pruebe sin servidor. Ilustrativo (regla 5): nada de esto es un dato medido.
import { readFileSync } from "node:fs";
import type { Cliente } from "../bd/pool.ts";
import { audita } from "../auth/servicio.ts";
import { CONTRATOS } from "../hazas/rutas.ts";
import { limpia } from "./filtro.ts";

export type Epoca = "primavera" | "verano" | "otono" | "invierno";
export interface Pieza { id: string; nombre: string; epoca: Epoca; triangulos: number; ilustrativa: true }
export interface Catalogo { v: 1; piezas: Pieza[] }
export type Respuesta = { codigo: number; cuerpo?: unknown };
/** Lo mínimo de la base que usan las operaciones: un cliente de transacción o una conexión de mentira en las pruebas. */
export type Consulta = Pick<Cliente, "query">;

const falla = (codigo: number, error: string, mensaje: string): Respuesta => ({ codigo, cuerpo: { error, mensaje } });

let enMemoria: Catalogo | null = null;
/** El catálogo de contratos/decoraciones.json (la única fuente; GEMELO_CONTRATOS lo mueve en la imagen). */
export function catalogo(): Catalogo {
  enMemoria ??= JSON.parse(readFileSync(CONTRATOS.replace(/[\\/]?$/, "/") + "decoraciones.json", "utf8")) as Catalogo;
  return enMemoria;
}

const ZONA = "Europe/Madrid";
const PARTES = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, month: "numeric", day: "numeric" });

/**
 * La época de la fiesta (no la fenología del olivo, que es contratos/epocas-calendario.json): la estación astronómica
 * del día en hora de Madrid, con fechas fijas. Primavera 21-mar a 20-jun; verano 21-jun a 22-sep; otoño 23-sep a
 * 20-dic; invierno 21-dic a 20-mar.
 */
export function epocaDeLaFecha(fecha: Date): Epoca {
  const p = PARTES.formatToParts(fecha);
  const mes = Number(p.find(x => x.type === "month")!.value), dia = Number(p.find(x => x.type === "day")!.value);
  const mmdd = mes * 100 + dia;
  if (mmdd >= 321 && mmdd <= 620) return "primavera";
  if (mmdd >= 621 && mmdd <= 922) return "verano";
  if (mmdd >= 923 && mmdd <= 1220) return "otono";
  return "invierno";
}

export const piezasDeLaEpoca = (epoca: Epoca, cat: Catalogo = catalogo()): Pieza[] => cat.piezas.filter(p => p.epoca === epoca);

/** ¿Se puede poner esta pieza hoy? Pura: ni base ni sesión. */
export function validaPieza(pieza: string, ahora: Date, cat: Catalogo = catalogo()): { ok: true; pieza: Pieza } | { ok: false; respuesta: Respuesta } {
  const p = cat.piezas.find(x => x.id === pieza);
  if (!p) return { ok: false, respuesta: falla(400, "pieza_no_existe", "Esa decoración no existe.") };
  const epoca = epocaDeLaFecha(ahora);
  if (p.epoca !== epoca) {
    const hoy = piezasDeLaEpoca(epoca, cat).map(x => x.nombre.toLowerCase()).join(" y ");
    return { ok: false, respuesta: falla(422, "fuera_de_epoca", "Esa decoración no es de esta época del año. Ahora toca: " + hoy + ".") };
  }
  return { ok: true, pieza: p };
}

/** El titular decora un olivo de SU haza (sustituye a la anterior). Los guardianes (sesión de titular, época) ya pasaron. */
export async function ponDecoracion(c: Consulta, a: { finca: string; copasId: number; hogarId: number; sesionId: number | null; pieza: string }): Promise<Respuesta> {
  const o = (await c.query<{ id: number }>("SELECT id FROM olivos WHERE finca = $1 AND copas_id = $2 AND retirado_en IS NULL", [a.finca, a.copasId])).rows[0];
  if (!o) return falla(404, "olivo_no_existe", "No hay ningún olivo con ese número.");
  const h = (await c.query<{ id: number }>(
    "SELECT h.id FROM hazas h JOIN olivos o ON ST_Intersects(h.geom, o.geom) WHERE o.id = $1 AND h.hogar_id = $2 ORDER BY h.id LIMIT 1", [o.id, a.hogarId])).rows[0];
  if (!h) return falla(403, "no_es_tu_haza", "Ese olivo no está en tu haza.");
  const previa = (await c.query<{ id: number }>(
    "SELECT id FROM personalizaciones WHERE olivo_id = $1 AND hogar_id = $2 AND estado = 'visible' FOR UPDATE", [o.id, a.hogarId])).rows[0];
  let id: number;
  if (previa) {
    await c.query("UPDATE personalizaciones SET decoracion = $2, haza_id = $3, sesion_id = $4, actualizada_en = now() WHERE id = $1", [previa.id, a.pieza, h.id, a.sesionId]);
    id = previa.id;
  } else {
    id = (await c.query<{ id: number }>(
      "INSERT INTO personalizaciones (olivo_id, haza_id, hogar_id, sesion_id, decoracion) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [o.id, h.id, a.hogarId, a.sesionId, a.pieza])).rows[0]!.id;
  }
  // sin entrada en la bandeja: no hay texto ni imagen que revisar (catálogo cerrado, decisión 175)
  await audita(c as Cliente, a.hogarId, "vida.decoracion", { personalizacion: id, olivo: o.id, pieza: a.pieza });
  return { codigo: 200, cuerpo: { id, pieza: a.pieza } };
}

// Quitar la decoración: si la fila no tiene nada más (ni nombre ni foto) queda retirada entera (con su decoración, que ya no se ve: así «restaurar»
// de la oficina la puede devolver, y la fila cumple su restricción); si tiene nombre o foto, solo pierde la decoración.
const QUITA = `decoracion = CASE WHEN nombre IS NULL AND medio_id IS NULL THEN decoracion ELSE NULL END, actualizada_en = now(),
  estado = CASE WHEN nombre IS NULL AND medio_id IS NULL THEN 'retirado' ELSE estado END,
  retirada_en = CASE WHEN nombre IS NULL AND medio_id IS NULL THEN now() ELSE retirada_en END,
  retirada_por = CASE WHEN nombre IS NULL AND medio_id IS NULL THEN $2::bigint ELSE retirada_por END,
  motivo_retirada = CASE WHEN nombre IS NULL AND medio_id IS NULL THEN $3::text ELSE motivo_retirada END`;

/** El titular quita la suya. 404 si no había. */
export async function quitaDecoracion(c: Consulta, a: { finca: string; copasId: number; hogarId: number }): Promise<Respuesta> {
  const r = await c.query<{ id: number }>(
    `UPDATE personalizaciones p SET ${QUITA}
       FROM olivos o WHERE p.olivo_id = o.id AND o.finca = $1 AND o.copas_id = $4 AND p.hogar_id = $2 AND p.estado = 'visible' AND p.decoracion IS NOT NULL RETURNING p.id`,
    [a.finca, a.hogarId, "quitada por el hogar", a.copasId]);
  if (!r.rows[0]) return { codigo: 404, cuerpo: { error: "no_existe" } };
  await audita(c as Cliente, a.hogarId, "vida.decoracion_quitada", { personalizacion: r.rows[0].id });
  return { codigo: 204 };
}

/** La oficina retira la decoración de una personalización visible (no pone: decisión 178). Avisa al hogar y queda en la auditoría. */
export async function retiraDecoracionOficina(c: Consulta, a: { personalizacion: number; oficinaId: number; motivo: string }): Promise<Respuesta> {
  const motivo = limpia(a.motivo);
  if (!motivo) return falla(400, "entrada_no_valida", "Hace falta un motivo.");
  const p = (await c.query<{ id: number; hogar_id: number; haza_id: number }>(
    `UPDATE personalizaciones SET ${QUITA} WHERE id = $1 AND estado = 'visible' AND decoracion IS NOT NULL RETURNING id, hogar_id, haza_id`,
    [a.personalizacion, a.oficinaId, motivo])).rows[0];
  if (!p) return { codigo: 404, cuerpo: { error: "no_existe" } };
  const aviso = (await c.query<{ id: number }>(
    "INSERT INTO avisos (tipo, titulo, texto, haza_id, autor_id) VALUES ('contenido', 'La oficina ha retirado la decoración de un olivo', $1, $2, $3) RETURNING id",
    ["Motivo: " + motivo, p.haza_id, a.oficinaId])).rows[0]!.id;
  await c.query("INSERT INTO avisos_hogar (aviso_id, hogar_id) VALUES ($1, $2)", [aviso, p.hogar_id]);
  await audita(c as Cliente, a.oficinaId, "admin.decoracion_retirada", { personalizacion: p.id, motivo });
  return { codigo: 204 };
}
