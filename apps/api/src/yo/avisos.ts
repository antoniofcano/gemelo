// El interruptor «Avisos por correo» del hogar (OF11f): leer y cambiar hogares.avisos_correo (migración 0016). Cada llamada lleva el id del
// hogar de la SESIÓN; no hay forma de nombrar otro. La auditoría guarda solo el valor, nunca el correo.
import { audita } from "../auth/servicio.ts";
import type { Bd } from "../bd/pool.ts";

export async function leeAvisosCorreo(bd: Bd, hogarId: number): Promise<boolean | null> {
  const r = await bd.query("SELECT avisos_correo FROM hogares WHERE id = $1", [hogarId]);
  return r.rows[0] ? Boolean(r.rows[0].avisos_correo) : null;
}

/** Devuelve el valor guardado, o null si el hogar ya no existe. */
export async function fijaAvisosCorreo(bd: Bd, hogarId: number, valor: boolean): Promise<boolean | null> {
  const r = await bd.query("UPDATE hogares SET avisos_correo = $1 WHERE id = $2", [valor, hogarId]);
  if (!r.rowCount) return null;
  await audita(bd, hogarId, "hogar.avisos_correo", { avisos_correo: valor });
  return valor;
}
