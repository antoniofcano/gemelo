// Enlace mágico (ADR-0012, contratos/sesion.md). El token se guarda como SHA-256; en claro solo existe en el correo.
// Las sesiones las lleva @fastify/session con el almacén de almacen.ts.
import type { Bd, Cliente } from "../bd/pool.ts";
import { hashToken, nuevoToken } from "../seguridad/cripto.ts";

export type Rol = "hogar" | "guia" | "corresponsal" | "admin";
export const ROLES: readonly Rol[] = ["hogar", "guia", "corresponsal", "admin"];

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

/**
 * Crea un enlace de un solo uso si el correo es de un hogar activo y devuelve el token (para mandarlo), o null.
 * Quien llama responde IGUAL en los dos casos: no se revela quién tiene cuenta.
 */
export async function creaEnlace(bd: Bd, correo: string, minutos: number): Promise<{ token: string; hogarId: number } | null> {
  const h = await bd.query<{ id: number }>("SELECT id FROM hogares WHERE correo = $1 AND activo", [correo]);
  const fila = h.rows[0];
  if (!fila) return null;
  const token = nuevoToken();
  await bd.query(
    "INSERT INTO tokens_acceso (hogar_id, hash, expira_en) VALUES ($1, $2, now() + make_interval(mins => $3))",
    [fila.id, hashToken(token), minutos]);
  await audita(bd, fila.id, "enlace.pedido");
  return { token, hogarId: fila.id };
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
export async function consumeEnlace(bd: Bd, token: string): Promise<{ ok: true; hogarId: number } | { ok: false; motivo: MotivoEnlace }> {
  const r = await bd.query<{ hogar_id: number }>(
    `UPDATE tokens_acceso t SET usado_en = now() FROM hogares h
      WHERE t.hash = $1 AND t.usado_en IS NULL AND t.expira_en > now() AND h.id = t.hogar_id AND h.activo
      RETURNING t.hogar_id`, [hashToken(token)]);
  const f = r.rows[0];
  if (f) {
    await audita(bd, f.hogar_id, "enlace.usado");
    return { ok: true, hogarId: f.hogar_id };
  }
  const e = await estadoEnlace(bd, token);
  return { ok: false, motivo: e === "valido" ? "usado" : e };
}

/** Cierra todas las sesiones de un hogar («salir de todos los dispositivos», o la oficina ante un robo). */
export async function revocaTodas(bd: Bd, hogarId: number): Promise<number> {
  const r = await bd.query("UPDATE sesiones SET revocada_en = now() WHERE hogar_id = $1 AND revocada_en IS NULL", [hogarId]);
  return r.rowCount ?? 0;
}

/** Limpieza periódica: enlaces y sesiones muertos hace más de un día. */
export async function purga(bd: Bd): Promise<void> {
  await bd.query("DELETE FROM tokens_acceso WHERE expira_en < now() - interval '1 day'");
  await bd.query("DELETE FROM sesiones WHERE expira_en < now() - interval '1 day' OR revocada_en < now() - interval '1 day'");
}
