// Almacén de sesiones para @fastify/session sobre la tabla `sesiones`. La librería maneja la cookie (firma, regenerar al
// entrar, destruir al salir); aquí solo se decide qué es una sesión viva:
//  - en la base va el SHA-256 del id de sesión, nunca el id (una copia de la base no permite entrar);
//  - caducidad ABSOLUTA (expira_en no se alarga), por INACTIVIDAD (ultima_actividad_en), por REVOCACIÓN y si el hogar
//    se desactiva;
//  - solo se guarda una sesión con hogar: las anónimas no tocan la base;
//  - una cuenta de OFICINA (rol oficina o admin, ADR-0024) tiene su propia caducidad (12 h absolutas, 2 h sin actividad, por
//    defecto) y su sesión solo vale si viene de un aparato de oficina suyo y no revocado; si está pendiente de aprobar, la
//    sesión existe pero marcada (las guardas de oficina/acceso.ts la paran). Las de antes de la 0005 o de unas gafas, sin aparato: no valen.
//  - con la llave de acceso obligatoria (OF13), una sesión de oficina que no se abrió ni se confirmó con una llave viva queda
//    marcada `llaveRequerida` (solo sirve para dar de alta la llave o entrar con ella) y su «confirmación reciente» es la última
//    aserción WebAuthn (confirmada_en solo la pone la llave).
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
    /** versión de las normas que aceptó el hogar (null: aún no; primer acceso, contratos/sesion.md) */
    normasVersion?: number | null;
    /** de dónde nació (decisión 96): «enlace» = el adulto titular con el enlace mágico; «vinculo» = un aparato vinculado */
    origen?: "enlace" | "vinculo";
    /** id de la fila en `sesiones` (para apuntar desde qué sesión se subió algo); falta en la petición que la crea */
    idBd?: number;
    /** solo en cuentas de oficina: el aparato desde el que se entró y si ya está aprobado (contratos/sesion.md § Oficina) */
    aparatoId?: number;
    aparatoAprobado?: boolean;
    /** nombre deducido del agente («Windows · Chrome»; «Gafas (código corto)»), solo para que la oficina reconozca la sesión */
    aparatoNombre?: string;
    /** solo en cuentas de oficina: cuándo se confirmó por última vez (entrar con un enlace) y si eso fue hace poco */
    confirmadaEn?: Date;
    confirmacionVigente?: boolean;
    /** solo en cuentas de oficina (OF13): la llave viva con la que se abrió o se confirmó la sesión (sesiones.llave_id) */
    llaveId?: number;
    /** solo en cuentas de oficina con la llave obligatoria: true si la sesión aún no se abrió con una llave (las guardas la paran) */
    llaveRequerida?: boolean;
  }
}

type Cb = (err?: unknown) => void;
type CbSesion = (err: unknown, sesion?: Session | null) => void;

/** Caducidad de las sesiones de oficina (config.oficina). */
export interface PlazosOficina { horasSesion: number; minInactividad: number; minConfirmacion: number; llaveObligatoria?: boolean }

export class AlmacenPg implements SessionStore {
  private readonly bd: Bd;
  private readonly diasInactividad: number;
  private readonly oficina: PlazosOficina;
  constructor(bd: Bd, diasInactividad: number, oficina: PlazosOficina) {
    this.bd = bd; this.diasInactividad = diasInactividad; this.oficina = oficina;
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
    const o = this.oficina;
    const r = await this.bd.query<{ sid: number; hogar_id: number; rol: Rol; alias: string | null; alias_visible: boolean; normas_version: number | null; origen: "enlace" | "vinculo"; expira_en: Date; refrescar: boolean;
      de_oficina: boolean; aparato_id: number | null; aparato_aprobado: boolean; confirmada_en: Date | null; confirmacion_vigente: boolean; llave_id: number | null }>(
      `SELECT s.id AS sid, s.origen, h.id AS hogar_id, h.rol, h.alias, h.alias_visible, h.normas_version, s.expira_en,
              s.ultima_actividad_en < now() - interval '5 minutes' AS refrescar,
              h.rol::text IN ('oficina', 'admin') AS de_oficina, a.id AS aparato_id, a.aprobado_en IS NOT NULL AS aparato_aprobado,
              s.confirmada_en, coalesce(s.confirmada_en > now() - make_interval(mins => $5), false) AS confirmacion_vigente, l.id AS llave_id
         FROM sesiones s JOIN hogares h ON h.id = s.hogar_id
         LEFT JOIN aparatos_oficina a ON a.id = s.aparato_id AND a.hogar_id = s.hogar_id AND a.revocado_en IS NULL
         LEFT JOIN llaves_oficina l ON l.id = s.llave_id AND l.hogar_id = s.hogar_id AND l.revocada_en IS NULL
        WHERE s.hash = $1 AND s.revocada_en IS NULL AND s.expira_en > now() AND h.activo
          AND CASE WHEN h.rol::text IN ('oficina', 'admin')
                   THEN a.id IS NOT NULL AND s.origen = 'enlace'
                        AND s.creada_en > now() - make_interval(hours => $3)
                        AND s.ultima_actividad_en > now() - make_interval(mins => $4)
                   ELSE s.ultima_actividad_en > now() - make_interval(days => $2) END`,
      [hashToken(id), this.diasInactividad, o.horasSesion, o.minInactividad, o.minConfirmacion]);
    const f = r.rows[0];
    if (!f) return null;
    if (f.refrescar) {
      await this.bd.query("UPDATE sesiones SET ultima_actividad_en = now() WHERE id = $1", [f.sid]);
      if (f.aparato_id !== null && f.aparato_aprobado) await this.bd.query("UPDATE aparatos_oficina SET ultimo_uso_en = now() WHERE id = $1", [f.aparato_id]);
    }
    // la cookie se reconstruye con la caducidad absoluta guardada (no se alarga al usarla)
    const s = { hogarId: f.hogar_id, rol: f.rol, alias: f.alias, aliasVisible: f.alias_visible, normasVersion: f.normas_version, origen: f.origen, idBd: f.sid, cookie: { expires: f.expira_en } } as unknown as Session;
    if (f.de_oficina) {
      s.aparatoId = f.aparato_id!;
      s.aparatoAprobado = f.aparato_aprobado;
      if (f.confirmada_en) s.confirmadaEn = f.confirmada_en;
      if (f.llave_id !== null) s.llaveId = Number(f.llave_id);
      const conLlave = f.llave_id !== null;
      s.llaveRequerida = o.llaveObligatoria === true && !conLlave;
      // con la llave obligatoria, la confirmación reciente solo la da una aserción WebAuthn (y en una sesión con llave viva)
      s.confirmacionVigente = f.confirmacion_vigente && (o.llaveObligatoria !== true || conLlave);
    }
    return s;
  }

  private async guarda(id: string, s: Session): Promise<void> {
    if (typeof s.hogarId !== "number") return;
    const expira = s.cookie?.expires instanceof Date ? s.cookie.expires : new Date(Date.now() + 86_400_000);
    await this.bd.query(
      `INSERT INTO sesiones (hogar_id, hash, expira_en, origen, aparato_id, confirmada_en, aparato_nombre) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (hash) DO UPDATE SET ultima_actividad_en = now() WHERE sesiones.revocada_en IS NULL`,
      [s.hogarId, hashToken(id), expira, s.origen === "vinculo" ? "vinculo" : "enlace", s.aparatoId ?? null, s.confirmadaEn ?? null, s.aparatoNombre ?? null]);
  }
}
