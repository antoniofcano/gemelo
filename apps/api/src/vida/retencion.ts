// Plazo de lo que se guarda por hogar (decisión 100: «la campaña y un año más»; después se borra). Qué se borra, tal cual lo dice la decisión:
//   · sugerencias        → `bandeja` con tipo 'sugerencia' y YA decididas (pasada_ot o descartada), de más de una campaña y un año. Las que la oficina aún no ha
//                          mirado (nueva, vista) NO se tocan: borrarlas sería perder algo sin atender. Contenido nuevo y denuncias de la bandeja: no son «sugerencias».
//   · avisos             → `avisos_hogar` (la entrega a cada hogar) de avisos creados antes del corte y ya caducados (o sin caducidad). El aviso en sí no es de un hogar.
//   · inscripciones      → `visitas_asistentes` de eventos que empezaron antes del corte.
//   · lotes por hogar    → `lote_hogar` de lotes de campañas anteriores al año del corte (`lotes.campana` «AAAA/AA»). El lote y su trazabilidad por haza se quedan.
// «Se borra o se anonimiza»: se BORRA (son filas que solo significan algo con el hogar al lado; anonimizadas no sirven de nada).
// El corte es el de la auditoría de voz (corteAuditoriaVoz, UTC): la campaña Y/Y+1 se guarda hasta el 1 de octubre de Y+2. [SUPUESTO] campaña de octubre a
// septiembre (lo valida Antonio con la EIPD). Nada de lo vigente cae: el corte queda siempre más de un año atrás. `gemelo_api` ya tiene DELETE en estas
// tablas (0004), así que no hace falta función SECURITY DEFINER ni migración. Auditoría: cuántas filas, sin contenido ni hogares.
import type { Bd } from "../bd/pool.ts";
import { audita } from "../auth/servicio.ts";
import { corteAuditoriaVoz } from "../presencia/consentimiento_voz.ts";

export interface Purgado { sugerencias: number; avisos: number; inscripciones: number; lotes: number }

export const SQL_PURGA_CAMPANA = `
WITH s AS (DELETE FROM bandeja WHERE tipo = 'sugerencia' AND estado IN ('pasada_ot', 'descartada') AND creada_en < $1::timestamptz RETURNING 1),
     a AS (DELETE FROM avisos_hogar ah USING avisos av WHERE av.id = ah.aviso_id AND av.creado_en < $1::timestamptz
             AND (av.caduca_en IS NULL OR av.caduca_en < $2::timestamptz) RETURNING 1),
     i AS (DELETE FROM visitas_asistentes va USING visitas v WHERE v.id = va.visita_id AND v.empieza_en < $1::timestamptz RETURNING 1),
     l AS (DELETE FROM lote_hogar lh USING lotes lo WHERE lo.id = lh.lote_id AND substr(lo.campana, 1, 4)::int < $3::int RETURNING 1)
SELECT (SELECT count(*) FROM s)::int AS sugerencias, (SELECT count(*) FROM a)::int AS avisos,
       (SELECT count(*) FROM i)::int AS inscripciones, (SELECT count(*) FROM l)::int AS lotes`;

/** Borra lo que ya cumplió «la campaña y un año más» (una sola sentencia, atómica) y audita cuántas filas, sin contenido. */
export async function purgaCampana(bd: Bd, ahora: Date = new Date()): Promise<Purgado> {
  const corte = corteAuditoriaVoz(ahora);
  const r = await bd.query<Purgado>(SQL_PURGA_CAMPANA, [corte, ahora, corte.getUTCFullYear()]);
  const p = r.rows[0];
  const n: Purgado = { sugerencias: Number(p?.sugerencias ?? 0), avisos: Number(p?.avisos ?? 0), inscripciones: Number(p?.inscripciones ?? 0), lotes: Number(p?.lotes ?? 0) };
  if (n.sugerencias + n.avisos + n.inscripciones + n.lotes > 0)
    await audita(bd, null, "retencion.campana", { ...n, corte: corte.toISOString().slice(0, 10) });
  return n;
}
