// Enlace mágico (ADR-0013, contratos/sesion.md). El token se guarda como SHA-256; en claro solo existe en el correo.
// Las sesiones las lleva @fastify/session con el almacén de almacen.ts.
import type { Bd, Cliente } from "../bd/pool.ts";
import { hashToken, nuevoToken } from "../seguridad/cripto.ts";

export type Rol = "hogar" | "guia" | "corresponsal" | "oficina" | "admin";
export const ROLES: readonly Rol[] = ["hogar", "guia", "corresponsal", "oficina", "admin"];
/** Roles de la oficina (ADR-0024, decisión 104): su sesión es más corta y exige un aparato confiable (contratos/sesion.md § Oficina). */
export const ROLES_OFICINA: readonly Rol[] = ["oficina", "admin"];
export const esOficina = (rol: Rol | null | undefined): boolean => rol === "oficina" || rol === "admin";

/** Versión vigente de las normas y la privacidad del primer acceso (UX.md §4.5). Si cambian, se sube y se vuelven a pedir. */
export const NORMAS_VERSION = 1;
/** ¿Le toca al hogar el primer acceso (normas sin aceptar o de una versión vieja)? */
export const primerAcceso = (normasVersion: number | null | undefined): boolean => !(typeof normasVersion === "number" && normasVersion >= NORMAS_VERSION);

const RE_CORREO = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** Correo normalizado (sin espacios, en minúsculas) o null. Sin comentarios, comillas ni grupos: lo más estricto posible. */
export function normalizaCorreo(s: string): string | null {
  const c = s.trim().toLowerCase();
  if (c.length < 3 || c.length > 254 || !RE_CORREO.test(c)) return null;
  if (c.indexOf("@") > 64) return null;
  return c;
}

type Detalle = Record<string, string | number | boolean | null>;
export async function audita(bd: Bd | Cliente, hogarId: number | null, accion: string, detalle: Detalle = {}): Promise<void> {
  await bd.query("INSERT INTO auditoria (hogar_id, accion, detalle) VALUES ($1, $2, $3)", [hogarId, accion, JSON.stringify(detalle)]);
}

/** Una sola sentencia para pedir un enlace: busca la cuenta y, solo si la hay, guarda el token y lo audita (OF13b-5). */
export const SQL_CREA_ENLACE =
  `WITH h AS (SELECT id FROM hogares WHERE correo = $1 AND activo),
        t AS (INSERT INTO tokens_acceso (hogar_id, hash, expira_en) SELECT id, $2, now() + make_interval(mins => $3) FROM h RETURNING hogar_id),
        a AS (INSERT INTO auditoria (hogar_id, accion, detalle) SELECT hogar_id, 'enlace.pedido', '{}'::jsonb FROM t)
   SELECT hogar_id FROM t`;

/**
 * Crea un enlace de un solo uso si el correo es de un hogar activo y devuelve el token (para mandarlo), o null.
 * Quien llama responde IGUAL en los dos casos: no se revela quién tiene cuenta. Para que el tiempo tampoco lo diga, exista o no
 * la cuenta se hace LO MISMO: un token al azar y UNA sola sentencia (buscar, guardar el hash y auditar van juntos en un CTE; sin
 * cuenta no inserta nada). Antes eran una consulta sin cuenta y tres con ella (OF13b-1, OF13b-5). Queda la diferencia de dentro de
 * la base (dos filas y el volcado del WAL al confirmar), sin medir en tiempo real (contratos/sesion.md § Enlace).
 */
export async function creaEnlace(bd: Bd, correo: string, minutos: number): Promise<{ token: string; hogarId: number } | null> {
  const token = nuevoToken();
  const r = await bd.query<{ hogar_id: number | string }>(SQL_CREA_ENLACE, [correo, hashToken(token), minutos]);
  const fila = r.rows[0];
  return fila ? { token, hogarId: Number(fila.hogar_id) } : null;
}

export type MotivoEnlace = "caducado" | "usado" | "no_valido";

/** Cómo está un enlace, SIN gastarlo (la página intermedia evita que un escáner de correo lo consuma con un GET). */
export async function estadoEnlace(bd: Bd, token: string): Promise<"valido" | MotivoEnlace> {
  const r = await bd.query<{ usado: boolean; caducado: boolean }>(
    `SELECT t.usado_en IS NOT NULL AS usado, t.expira_en <= now() AS caducado
       FROM tokens_acceso t JOIN hogares h ON h.id = t.hogar_id WHERE t.hash = $1 AND h.activo`, [hashToken(token)]);
  const f = r.rows[0];
  if (!f) return "no_valido";
  return f.usado ? "usado" : f.caducado ? "caducado" : "valido";
}

/** Gasta el enlace de forma atómica: con dos peticiones a la vez y el mismo token, solo una entra. */
export async function consumeEnlace(bd: Bd, token: string): Promise<{ ok: true; hogarId: number; rol: Rol; primerAcceso: boolean } | { ok: false; motivo: MotivoEnlace }> {
  const r = await bd.query<{ hogar_id: number; rol: Rol; normas_version: number | null }>(
    `UPDATE tokens_acceso t SET usado_en = now() FROM hogares h
      WHERE t.hash = $1 AND t.usado_en IS NULL AND t.expira_en > now() AND h.id = t.hogar_id AND h.activo
      RETURNING t.hogar_id, h.rol, h.normas_version`, [hashToken(token)]);
  const f = r.rows[0];
  if (f) {
    await audita(bd, f.hogar_id, "enlace.usado");
    return { ok: true, hogarId: f.hogar_id, rol: f.rol, primerAcceso: primerAcceso(f.normas_version) };
  }
  const e = await estadoEnlace(bd, token);
  return { ok: false, motivo: e === "valido" ? "usado" : e };
}

/** Cierra todas las sesiones de un hogar («salir de todos los dispositivos», o la oficina ante un robo). */
export async function revocaTodas(bd: Bd | Cliente, hogarId: number): Promise<number> {
  const r = await bd.query("UPDATE sesiones SET revocada_en = now() WHERE hogar_id = $1 AND revocada_en IS NULL", [hogarId]);
  return r.rowCount ?? 0;
}

/** Limpieza periódica: enlaces y sesiones muertos hace más de un día. */
export async function purga(bd: Bd): Promise<void> {
  await bd.query("DELETE FROM tokens_acceso WHERE expira_en < now() - interval '1 day'");
  await bd.query("DELETE FROM codigos_vinculo WHERE expira_en < now() - interval '1 day'");
  await bd.query("DELETE FROM sesiones WHERE expira_en < now() - interval '1 day' OR revocada_en < now() - interval '1 day'");
  await bd.query("DELETE FROM llaves_retos WHERE expira_en < now()");   // los retos de la llave de acceso (OF13), de 5 min
}
