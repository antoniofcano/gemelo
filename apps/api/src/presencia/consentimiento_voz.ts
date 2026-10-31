// F3j (ADR-0026; decisiones 163 y 164; EIPD-VOZ §3 y §7; contrato contratos/voz-consentimiento.md): el consentimiento de VOZ por hogar y el plazo de la
// auditoría de voz.
//  · CONSENTIMIENTO. Antes de que una familia hable en una visita guiada, el hogar acepta un aviso (qué se trata, que no se graba, que puede dejar de hablar
//    cuando quiera, dónde está la privacidad). Se guarda UNA fila por hogar con la versión del aviso aceptada (tabla voz_consentimientos, migración 0018).
//    VOZ_AVISO_VERSION es la versión VIGENTE del texto: el texto vive en el motor (apps/web/motor/47_habla.js, HablaPuro.AVISO) y un guardián comprueba que
//    las dos versiones coinciden. Si cambia el texto, se sube la versión en los dos sitios y todos los hogares vuelven a ver el aviso (su fila, de otra
//    versión, ya no vale). Retirar = borrar la fila. Quién manda es esta api: la palabra no se da a un hogar sin consentimiento vigente (voz.ts, Palabra).
//  · PLAZO (decisión 164, como la 100: «la campaña y un año más»). La campaña de aceituna va de octubre a septiembre; una fila de la auditoría de voz se
//    guarda hasta el 1 de octubre del segundo año tras la campaña en que se escribió y entonces se borra (corteAuditoriaVoz). Lo borrado: las acciones
//    `guiada.*` (manos, palabra, silenciar, expulsar, cerrar) y las de consentimiento retirado (y los «dado» de quien ya no tiene consentimiento vigente).
//    Es una función SECURITY DEFINER de la base, porque `gemelo_api` no puede borrar de `auditoria` (solo-añadir, migración 0001). [SUPUESTO] campaña de
//    octubre a septiembre (las zonas horarias no importan: el corte es un día de margen); la valida Antonio con la EIPD.
import type { Bd } from "../bd/pool.ts";
import { audita } from "../auth/servicio.ts";

/** La versión VIGENTE del aviso de voz. Súbela (y el texto del motor) cuando el texto cambie: todos los hogares lo vuelven a aceptar. */
export const VOZ_AVISO_VERSION = 1;

export interface EstadoConsentimiento { version: number; aceptada: boolean; version_aceptada: number | null; aceptada_en: string | null }
type Q = Pick<Bd, "query">;

/** El estado del consentimiento de ese hogar frente a la versión vigente */
export async function estadoConsentimiento(bd: Q, hogar: number): Promise<EstadoConsentimiento> {
  const f = (await bd.query<{ version: number; aceptado_en: Date }>("SELECT version, aceptado_en FROM voz_consentimientos WHERE hogar_id = $1", [hogar])).rows[0];
  return { version: VOZ_AVISO_VERSION, aceptada: !!f && f.version === VOZ_AVISO_VERSION, version_aceptada: f ? f.version : null, aceptada_en: f ? new Date(f.aceptado_en).toISOString() : null };
}
/** ¿Tiene ese hogar consentimiento VIGENTE? (lo que mira la api antes de dar la palabra) */
export async function consiente(bd: Q, hogar: number): Promise<boolean> {
  return (await bd.query("SELECT 1 FROM voz_consentimientos WHERE hogar_id = $1 AND version = $2", [hogar, VOZ_AVISO_VERSION])).rows.length > 0;
}
/** Acepta la versión vigente (idempotente: volver a aceptarla no escribe nada ni toca la auditoría). Quien llama ya comprobó que `version` es la vigente. */
export async function aceptaVoz(bd: Bd, hogar: number): Promise<boolean> {
  const r = await bd.query(
    `INSERT INTO voz_consentimientos (hogar_id, version) VALUES ($1, $2)
     ON CONFLICT (hogar_id) DO UPDATE SET version = EXCLUDED.version, aceptado_en = now() WHERE voz_consentimientos.version <> EXCLUDED.version
     RETURNING 1`, [hogar, VOZ_AVISO_VERSION]);
  if (!r.rows.length) return false;
  await audita(bd, hogar, "voz.consentimiento_dado", { version: VOZ_AVISO_VERSION });
  return true;
}
/** Retira el consentimiento (borra la fila; idempotente). Devuelve si había. */
export async function retiraVoz(bd: Bd, hogar: number): Promise<boolean> {
  const r = await bd.query<{ version: number }>("DELETE FROM voz_consentimientos WHERE hogar_id = $1 RETURNING version", [hogar]);
  const f = r.rows[0];
  if (!f) return false;
  await audita(bd, hogar, "voz.consentimiento_retirado", { version: f.version });
  return true;
}

// ---------------------------------------------------------------- el plazo de la auditoría de voz

/**
 * El corte de la auditoría de voz (decisión 164: la campaña y un año más): se borra lo anterior a este instante. La campaña Y/Y+1 va del 1 de octubre de Y
 * al 30 de septiembre de Y+1; sus filas se guardan hasta el 1 de octubre de Y+2. Así, el 5 de octubre de 2028 el corte es el 1 de octubre de 2027
 * (la campaña 2026/27 se borra; la 2027/28, que acaba de cerrar, queda un año más). En UTC.
 */
export function corteAuditoriaVoz(ahora: Date): Date {
  const y = ahora.getUTCFullYear(), m = ahora.getUTCMonth();   // m: 0 = enero … 9 = octubre
  return new Date(Date.UTC(m >= 9 ? y - 1 : y - 2, 9, 1));
}
/** Borra la auditoría de voz fuera de plazo (la función de la base). Devuelve cuántas filas. */
export async function purgaAuditoriaVoz(bd: Q, ahora: Date = new Date()): Promise<number> {
  const r = await bd.query<{ n: number }>("SELECT purga_auditoria_voz($1) AS n", [corteAuditoriaVoz(ahora)]);
  return Number(r.rows[0]?.n ?? 0);
}
