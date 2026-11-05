// F3k-1 (ADR-0032; migración 0025; contratos/voz-consentimiento.md): lo que la voz por cercanía guarda en la base, en un solo sitio. Los corros NO se guardan
// (corro.ts, en memoria). Aquí: el interruptor general (apagado por omisión), el ajuste de cada cuenta (apagado por omisión, decisión 210), quién está
// disponible (interruptor + ajuste + consentimiento «cercania» vigente + sin suspensión + cuenta activa), los bloqueos de voz, los avisos a la oficina con la
// suspensión automática (avisos de 3 hogares distintos en 7 días), las suspensiones y la purga (la campaña y un año más, como la 164).
import type { Bd } from "../bd/pool.ts";
import { corteAuditoriaVoz, VOZ_CERCANIA_AVISO_VERSION } from "./consentimiento_voz.ts";

type Q = Pick<Bd, "query">;

/** Los motivos de un aviso (lista cerrada, ADR-0032 e). */
export const MOTIVOS_AVISO = ["insultos", "acoso", "contenido_sexual", "parece_menor", "otro"] as const;
export type MotivoAviso = (typeof MOTIVOS_AVISO)[number];
export const TEXTO_AVISO_MAX = 280;
/** Mo1 [PROPUESTA, provisional]: con avisos de 3 hogares DISTINTOS en 7 días, la voz por cercanía de ese hogar se suspende sola hasta que la oficina lo revise. */
export const AVISOS_SUSPENDEN = 3, AVISOS_VENTANA_DIAS = 7;
/** Mo1 [PROPUESTA, provisional]: lo que dura una suspensión de la oficina (null = hasta nuevo aviso). */
export const DIAS_SUSPENSION = [7, 30] as const;
export const ESTADOS_AVISO = ["nuevo", "visto", "resuelto", "descartado"] as const;

// ---------------------------------------------------------------- interruptor y ajuste

export interface Interruptor { activa: boolean; cambiada_en: string | null }
export async function interruptor(bd: Q): Promise<Interruptor> {
  const f = (await bd.query<{ activa: boolean; cambiada_en: Date }>("SELECT activa, cambiada_en FROM voz_cercania_interruptor WHERE id")).rows[0];
  return { activa: !!f?.activa, cambiada_en: f ? new Date(f.cambiada_en).toISOString() : null };
}
/** Devuelve si cambió (encender lo encendido no escribe). */
export async function poneInterruptor(bd: Q, activa: boolean, por: number): Promise<boolean> {
  const r = await bd.query("UPDATE voz_cercania_interruptor SET activa = $1, cambiada_en = now(), cambiada_por = $2 WHERE id AND activa <> $1", [activa, por]);
  return (r.rowCount ?? 0) > 0;
}
export async function ajuste(bd: Q, hogar: number): Promise<{ activa: boolean; cambiada_en: string | null }> {
  const f = (await bd.query<{ activa: boolean; cambiada_en: Date }>("SELECT activa, cambiada_en FROM voz_cercania_ajustes WHERE hogar_id = $1", [hogar])).rows[0];
  return { activa: !!f?.activa, cambiada_en: f ? new Date(f.cambiada_en).toISOString() : null };
}
export async function poneAjuste(bd: Q, hogar: number, activa: boolean): Promise<boolean> {
  const r = await bd.query(
    `INSERT INTO voz_cercania_ajustes (hogar_id, activa) VALUES ($1, $2)
     ON CONFLICT (hogar_id) DO UPDATE SET activa = EXCLUDED.activa, cambiada_en = now() WHERE voz_cercania_ajustes.activa <> EXCLUDED.activa RETURNING 1`, [hogar, activa]);
  return (r.rowCount ?? 0) > 0;
}

/** De esos hogares, los que pueden hablar por cercanía ahora (sin mirar el interruptor: eso lo hace quien llama, una vez). */
export const SQL_DISPONIBLES = `
SELECT g.id FROM hogares g
  JOIN voz_cercania_ajustes a ON a.hogar_id = g.id AND a.activa
  JOIN voz_consentimientos c ON c.hogar_id = g.id AND c.ambito = 'cercania' AND c.version = $2
 WHERE g.id = ANY($1::bigint[]) AND g.activo
   AND NOT EXISTS (SELECT 1 FROM voz_cercania_suspensiones s WHERE s.hogar_id = g.id AND (s.hasta IS NULL OR s.hasta > now()))`;
export async function disponibles(bd: Q, hogares: number[]): Promise<Set<number>> {
  if (!hogares.length) return new Set();
  if (!(await interruptor(bd)).activa) return new Set();
  const r = await bd.query<{ id: string | number }>(SQL_DISPONIBLES, [hogares, VOZ_CERCANIA_AVISO_VERSION]);
  return new Set(r.rows.map(f => Number(f.id)));
}

// ---------------------------------------------------------------- bloqueos

export async function hayBloqueo(bd: Q, h: number, otros: number[]): Promise<boolean> {
  if (!otros.length) return false;
  return ((await bd.query("SELECT 1 FROM voz_bloqueos WHERE (hogar_id = $1 AND bloqueado_id = ANY($2::bigint[])) OR (bloqueado_id = $1 AND hogar_id = ANY($2::bigint[])) LIMIT 1", [h, otros])).rowCount ?? 0) > 0;
}
export async function bloquea(bd: Q, hogar: number, bloqueado: number): Promise<boolean> {
  return ((await bd.query("INSERT INTO voz_bloqueos (hogar_id, bloqueado_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1", [hogar, bloqueado])).rowCount ?? 0) > 0;
}
export async function desbloquea(bd: Q, hogar: number, bloqueado: number): Promise<boolean> {
  return ((await bd.query("DELETE FROM voz_bloqueos WHERE hogar_id = $1 AND bloqueado_id = $2", [hogar, bloqueado])).rowCount ?? 0) > 0;
}
export async function bloqueados(bd: Q, hogar: number): Promise<{ hogar: number; alias: string | null; rol: string; desde: string }[]> {
  const r = await bd.query<{ id: string | number; alias: string | null; rol: string; creado_en: Date }>(
    "SELECT g.id, g.alias, g.rol, b.creado_en FROM voz_bloqueos b JOIN hogares g ON g.id = b.bloqueado_id WHERE b.hogar_id = $1 ORDER BY b.creado_en", [hogar]);
  return r.rows.map(f => ({ hogar: Number(f.id), alias: f.alias, rol: f.rol, desde: new Date(f.creado_en).toISOString() }));
}

// ---------------------------------------------------------------- avisos y suspensiones

export interface Suspension { hasta: string | null; automatica: boolean; desde: string }
export async function suspension(bd: Q, hogar: number): Promise<Suspension | null> {
  const f = (await bd.query<{ desde: Date; hasta: Date | null; automatica: boolean }>(
    "SELECT desde, hasta, automatica FROM voz_cercania_suspensiones WHERE hogar_id = $1 AND (hasta IS NULL OR hasta > now())", [hogar])).rows[0];
  return f ? { desde: new Date(f.desde).toISOString(), hasta: f.hasta ? new Date(f.hasta).toISOString() : null, automatica: f.automatica } : null;
}
/** Suspende (o cambia la suspensión de) un hogar: `dias` null = hasta nuevo aviso. */
export async function suspende(bd: Q, hogar: number, dias: number | null, automatica: boolean, por: number | null): Promise<void> {
  await bd.query(
    `INSERT INTO voz_cercania_suspensiones (hogar_id, hasta, automatica, por_id) VALUES ($1, CASE WHEN $2::int IS NULL THEN NULL ELSE now() + make_interval(days => $2::int) END, $3, $4)
     ON CONFLICT (hogar_id) DO UPDATE SET desde = now(), hasta = EXCLUDED.hasta, automatica = EXCLUDED.automatica, por_id = EXCLUDED.por_id`, [hogar, dias, automatica, por]);
}
export async function levantaSuspension(bd: Q, hogar: number): Promise<boolean> {
  return ((await bd.query("DELETE FROM voz_cercania_suspensiones WHERE hogar_id = $1", [hogar])).rowCount ?? 0) > 0;
}

/**
 * Guarda un aviso y dice si con él el hogar avisado llega a AVISOS_SUSPENDEN hogares distintos en AVISOS_VENTANA_DIAS (y no estaba ya suspendido): entonces
 * quien llama lo suspende (automática, hasta que la oficina lo revise). Una sola sentencia para el aviso; la cuenta va después.
 */
export async function guardaAviso(bd: Q, a: { avisa: number; avisado: number; corro: string | null; motivo: MotivoAviso; texto: string | null }): Promise<{ id: number; suspender: boolean }> {
  const id = Number((await bd.query<{ id: string | number }>(
    "INSERT INTO voz_avisos (avisa_id, avisado_id, corro, motivo, texto) VALUES ($1, $2, $3, $4, $5) RETURNING id", [a.avisa, a.avisado, a.corro, a.motivo, a.texto])).rows[0]!.id);
  const n = Number((await bd.query<{ n: number }>(
    `SELECT count(DISTINCT avisa_id)::int AS n FROM voz_avisos
      WHERE avisado_id = $1 AND avisa_id IS NOT NULL AND creado_en > now() - make_interval(days => $2::int)`, [a.avisado, AVISOS_VENTANA_DIAS])).rows[0]?.n ?? 0);
  const ya = await suspension(bd, a.avisado);
  return { id, suspender: n >= AVISOS_SUSPENDEN && !ya };
}

// ---------------------------------------------------------------- plazo (decisión 212, provisional: como la 164)

/**
 * Borra los avisos YA atendidos (resueltos o descartados) de antes del corte de la voz (la campaña y un año más; los que la oficina no ha mirado no se tocan,
 * como las sugerencias de la decisión 100) y las suspensiones vencidas (su historia queda en la auditoría). La auditoría corro.* la borra purga_auditoria_voz.
 */
export async function purgaVozCercania(bd: Q, ahora: Date = new Date()): Promise<{ avisos: number; suspensiones: number }> {
  const corte = corteAuditoriaVoz(ahora);
  const a = await bd.query("DELETE FROM voz_avisos WHERE estado IN ('resuelto', 'descartado') AND creado_en < $1", [corte]);
  const s = await bd.query("DELETE FROM voz_cercania_suspensiones WHERE hasta IS NOT NULL AND hasta < $1", [ahora]);
  return { avisos: a.rowCount ?? 0, suspensiones: s.rowCount ?? 0 };
}
