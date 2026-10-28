// Almacén de sesiones para @fastify/session sobre la tabla `sesiones`. La librería maneja la cookie (firma, regenerar al
// entrar, destruir al salir); aquí solo se decide qué es una sesión viva:
//  - en la base va el SHA-256 del id de sesión, nunca el id (una copia de la base no permite entrar);
//  - caducidad ABSOLUTA (expira_en no se alarga), por INACTIVIDAD (ultima_actividad_en), por REVOCACIÓN y si el hogar
//    se desactiva;
//  - solo se guarda una sesión con hogar: las anónimas no tocan la base.
import type { SessionStore } from "@fastify/session";
import type { Session } from "fastify";
import type { Bd } from "../bd/pool.ts";
import { hashToken } from "../seguridad/cripto.ts";
import type { Rol } from "./servicio.ts";

declare module "fastify" {
  interface Session {
    hogarId?: number;
    rol?: Rol;
    alias?: string | null;
    aliasVisible?: boolean;
  }
}

type Cb = (err?: unknown) => void;
type CbSesion = (err: unknown, sesion?: Session | null) => void;

export class AlmacenPg implements SessionStore {
  private readonly bd: Bd;
  private readonly diasInactividad: number;
  constructor(bd: Bd, diasInactividad: number) {
    this.bd = bd; this.diasInactividad = diasInactividad;
  }

  get(id: string, cb: CbSesion): void {
    this.lee(id).then(s => cb(null, s), e => cb(e));
  }
  set(id: string, sesion: Session, cb: Cb): void {
    this.guarda(id, sesion).then(() => cb(), e => cb(e));
  }
  destroy(id: string, cb: Cb): void {
    this.bd.query("UPDATE sesiones SET revocada_en = now() WHERE hash = $1 AND revocada_en IS NULL", [hashToken(id)])
      .then(() => cb(), e => cb(e));
  }

  private async lee(id: string): Promise<Session | null> {
    const r = await this.bd.query<{ sid: number; hogar_id: number; rol: Rol; alias: string | null; alias_visible: boolean; expira_en: Date; refrescar: boolean }>(
      `SELECT s.id AS sid, h.id AS hogar_id, h.rol, h.alias, h.alias_visible, s.expira_en,
              s.ultima_actividad_en < now() - interval '5 minutes' AS refrescar
         FROM sesiones s JOIN hogares h ON h.id = s.hogar_id
        WHERE s.hash = $1 AND s.revocada_en IS NULL AND s.expira_en > now() AND h.activo
          AND s.ultima_actividad_en > now() - make_interval(days => $2)`, [hashToken(id), this.diasInactividad]);
    const f = r.rows[0];
    if (!f) return null;
    if (f.refrescar) await this.bd.query("UPDATE sesiones SET ultima_actividad_en = now() WHERE id = $1", [f.sid]);
    // la cookie se reconstruye con la caducidad absoluta guardada (no se alarga al usarla)
    return { hogarId: f.hogar_id, rol: f.rol, alias: f.alias, aliasVisible: f.alias_visible, cookie: { expires: f.expira_en } } as unknown as Session;
  }

  private async guarda(id: string, s: Session): Promise<void> {
    if (typeof s.hogarId !== "number") return;
    const expira = s.cookie?.expires instanceof Date ? s.cookie.expires : new Date(Date.now() + 86_400_000);
    await this.bd.query(
      `INSERT INTO sesiones (hogar_id, hash, expira_en) VALUES ($1, $2, $3)
       ON CONFLICT (hash) DO UPDATE SET ultima_actividad_en = now() WHERE sesiones.revocada_en IS NULL`,
      [s.hogarId, hashToken(id), expira]);
  }
}
