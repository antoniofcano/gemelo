// Aparatos confiables de la oficina (ADR-0024, contratos/sesion.md § Oficina; tabla `aparatos_oficina`, migración 0005).
// En el navegador, un secreto de 256 bits en la cookie `__Host-gemelo-aparato`; en la base, solo su SHA-256.
import type { Bd } from "../bd/pool.ts";
import { audita } from "../auth/servicio.ts";
import { hashToken, nuevoToken, pareceToken } from "../seguridad/cripto.ts";

export const COOKIE_APARATO = "__Host-gemelo-aparato";
/** Un año: el aparato se recuerda; lo que caduca es la sesión. Strict: solo viaja en peticiones del propio sitio (el POST del botón «Entrar» lo es). */
export const OPCIONES_COOKIE_APARATO = { path: "/", secure: true, httpOnly: true, sameSite: "strict", maxAge: 365 * 86_400 } as const;
/** Un aparato pendiente que nadie aprueba en un día deja de poder aprobarse (el siguiente enlace crea otro). */
export const HORAS_PENDIENTE = 24;

export type EstadoAparato = "pendiente" | "aprobado";
export interface AparatoAlEntrar {
  id: number;
  estado: EstadoAparato;
  /** si hay que dejar (o cambiar) la cookie del aparato: el secreto en claro, solo para el Set-Cookie */
  secretoNuevo?: string;
}

/**
 * Al entrar con un enlace una cuenta de oficina: reconoce el aparato por su cookie o crea uno pendiente.
 * Si el aparato ya estaba pendiente, es de la misma cuenta y tiene entre `minSegundoEnlace` minutos y 24 h, este segundo
 * enlace lo aprueba (aprobado_como = 'segundo_enlace'). Una cookie de otra cuenta, revocada o desconocida no sirve: aparato nuevo.
 */
export async function aparatoAlEntrar(bd: Bd, hogarId: number, cookie: string | undefined, agente: string | undefined, minSegundoEnlace: number): Promise<AparatoAlEntrar> {
  if (pareceToken(cookie)) {
    const r = await bd.query<{ id: number; hogar_id: number; aprobado: boolean; revocado: boolean; maduro: boolean; vigente: boolean }>(
      `SELECT id, hogar_id, aprobado_en IS NOT NULL AS aprobado, revocado_en IS NOT NULL AS revocado,
              creado_en <= now() - make_interval(mins => $2) AS maduro, creado_en > now() - make_interval(hours => $3) AS vigente
         FROM aparatos_oficina WHERE hash = $1`, [hashToken(cookie), minSegundoEnlace, HORAS_PENDIENTE]);
    const a = r.rows[0];
    if (a && Number(a.hogar_id) === hogarId && !a.revocado) {
      const id = Number(a.id);
      if (a.aprobado) {
        await bd.query("UPDATE aparatos_oficina SET ultimo_uso_en = now() WHERE id = $1", [id]);
        return { id, estado: "aprobado" };
      }
      if (a.vigente && a.maduro) {
        const ok = await bd.query(
          `UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'segundo_enlace', aprobado_por = $2, ultimo_uso_en = now()
            WHERE id = $1 AND aprobado_en IS NULL AND revocado_en IS NULL`, [id, hogarId]);
        if (ok.rowCount) await audita(bd, hogarId, "oficina.aparato_aprobado", { aparato: id, como: "segundo_enlace" });
        return { id, estado: "aprobado" };
      }
      if (a.vigente) return { id, estado: "pendiente" };
      // pendiente de hace más de un día: se da por perdido y se empieza otro
      await bd.query("UPDATE aparatos_oficina SET revocado_en = now() WHERE id = $1 AND revocado_en IS NULL", [id]);
    }
  }
  const secreto = nuevoToken();
  const r = await bd.query<{ id: number }>("INSERT INTO aparatos_oficina (hogar_id, nombre, hash) VALUES ($1, $2, $3) RETURNING id",
    [hogarId, nombreDeAparato(agente), hashToken(secreto)]);
  const id = Number(r.rows[0]!.id);
  await audita(bd, hogarId, "oficina.aparato_nuevo", { aparato: id });
  return { id, estado: "pendiente", secretoNuevo: secreto };
}

/** Nombre deducido del agente («Windows · Chrome»): para reconocer el aparato en la lista, sin guardar el agente entero. */
export function nombreDeAparato(agente: string | undefined): string {
  const a = agente ?? "";
  const so = /iPhone/.test(a) ? "iPhone" : /iPad/.test(a) ? "iPad" : /Android/.test(a) ? "Android" : /Windows/.test(a) ? "Windows"
    : /Mac OS X|Macintosh/.test(a) ? "Mac" : /CrOS/.test(a) ? "ChromeOS" : /Linux/.test(a) ? "Linux" : "";
  const nav = /Edg\//.test(a) ? "Edge" : /Firefox\//.test(a) ? "Firefox" : /OPR\//.test(a) ? "Opera" : /Chrome\//.test(a) ? "Chrome"
    : /Safari\//.test(a) ? "Safari" : "";
  return [so, nav].filter(Boolean).join(" · ") || "Aparato";
}

/** Revoca un aparato y cierra en el acto las sesiones que salieron de él. Devuelve cuántas sesiones cerró (null si no existía o ya estaba revocado). */
export async function revocaAparato(bd: Bd, id: number): Promise<number | null> {
  const r = await bd.query("UPDATE aparatos_oficina SET revocado_en = now() WHERE id = $1 AND revocado_en IS NULL", [id]);
  if (!r.rowCount) return null;
  const s = await bd.query("UPDATE sesiones SET revocada_en = now() WHERE aparato_id = $1 AND revocada_en IS NULL", [id]);
  return s.rowCount ?? 0;
}
