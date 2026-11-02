// Las llaves de acceso de la PROPIA cuenta, para cualquier sesión (OF13b-4, ADR-0029, doc/sistema/LLAVES-DE-ACCESO.md): la lista que enseña
// Configuración → Mis dispositivos, la baja de una llave y el correo de aviso. Las reglas de quién puede dar de alta y la ceremonia son de
// ../oficina/llaves.ts (OF13b-3); aquí solo lo que se lee y se quita. Cada función lleva el id del hogar de la SESIÓN: no hay forma de nombrar
// la llave de otra cuenta (una ajena y una inexistente son la misma respuesta).
import type { FastifyRequest } from "fastify";
import { type Cartero, mensajeDeLlaveAnadida, mensajeDeLlaveQuitada } from "../auth/correo.ts";
import { audita, esOficina, type Rol } from "../auth/servicio.ts";
import { type Bd, enTransaccion } from "../bd/pool.ts";
import { estadoLlaves, MAX_LLAVES, revocaLlave } from "../oficina/llaves.ts";

/** Lo que se enseña de una llave: nunca el id de credencial ni la clave pública ni el contador. */
export interface LlaveVisible {
  id: number; nombre: string; creada_en: Date; ultima_vez_en: Date | null;
  /** residente: sirve para «Entrar con mi llave» sin escribir el correo (las anteriores a OF13b, no) */
  descubrible: boolean;
  /** respaldada (sincronizada) en el gestor de la persona: iCloud, Google… */
  sincronizada: boolean;
  /** es la llave con la que se abrió o se confirmó la sesión de esta petición */
  es_esta: boolean;
}

/** Las llaves vivas de la cuenta (las revocadas no se enseñan; quedan en la base para la auditoría). `sesionId`: la sesión de la petición, para `es_esta`. */
export async function llavesDeLaCuenta(bd: Bd, hogarId: number, sesionId: number | undefined): Promise<LlaveVisible[]> {
  const r = await bd.query<{ id: string; nombre: string; creada_en: Date; ultima_vez_en: Date | null; descubrible: boolean; respaldada: boolean; es_esta: boolean }>(
    `SELECT l.id, l.nombre, l.creada_en, l.ultima_vez_en, l.descubrible, l.respaldada,
            l.id = (SELECT s.llave_id FROM sesiones s WHERE s.id = $2 AND s.hogar_id = $1) AS es_esta
       FROM llaves_acceso l WHERE l.hogar_id = $1 AND l.revocada_en IS NULL ORDER BY l.id DESC LIMIT ${MAX_LLAVES * 2}`, [hogarId, sesionId ?? null]);
  return r.rows.map(f => ({
    id: Number(f.id), nombre: f.nombre, creada_en: f.creada_en, ultima_vez_en: f.ultima_vez_en,
    descubrible: f.descubrible === true, sincronizada: f.respaldada === true, es_esta: f.es_esta === true,
  }));
}

/** El correo de la cuenta (el destino de los avisos de seguridad); null si la cuenta ya no existe. */
export async function correoDeLaCuenta(bd: Bd, hogarId: number): Promise<string | null> {
  const r = await bd.query<{ correo: string }>("SELECT correo FROM hogares WHERE id = $1 AND activo", [hogarId]);
  return r.rows[0]?.correo ?? null;
}

export type Quitada =
  | { ok: true; nombre: string; sesiones: number; eraEsta: boolean; quedan: number; tipo: "familia" | "oficina" }
  | { ok: false; error: "no_existe" | "ultima_llave" | "confirmacion_requerida" };

/**
 * Quita (revoca) una llave viva de la cuenta, en una transacción y con la cuenta bloqueada (dos bajas a la vez no la dejan sin la última), y cierra en el
 * acto las sesiones abiertas o confirmadas con ella. Una familia puede quitar hasta la última: el enlace del correo sigue siendo la entrada y la
 * recuperación. Una cuenta de OFICINA no se queda sin su última llave por aquí (lo hace la ruta propia de la oficina, `/api/oficina/llaves/:id/revocar`, con
 * el mismo criterio: la sesión confirmada y nunca la última; si no, solo un admin) y pide la confirmación reciente que esa ruta también pide.
 * Auditoría `llave.quitada` (la llave, las sesiones cerradas y cuántas quedan; nunca el id de credencial ni el correo).
 */
export async function quitaLlave(bd: Bd, hogarId: number, llaveId: number, sesionId: number | undefined, confirmada: boolean): Promise<Quitada> {
  return enTransaccion(bd, async (t): Promise<Quitada> => {
    await t.query("SELECT id FROM hogares WHERE id = $1 FOR UPDATE", [hogarId]);
    const l = await t.query<{ nombre: string }>("SELECT nombre FROM llaves_acceso WHERE id = $1 AND hogar_id = $2 AND revocada_en IS NULL", [llaveId, hogarId]);
    if (!l.rows[0]) return { ok: false, error: "no_existe" };
    const e = await estadoLlaves(t, hogarId);
    const tipo = e.rol !== null && esOficina(e.rol as Rol) ? "oficina" : "familia";
    if (tipo === "oficina") {
      if (!confirmada) return { ok: false, error: "confirmacion_requerida" };
      if (e.activas <= 1) return { ok: false, error: "ultima_llave" };
    }
    // ¿la sesión de esta petición se abrió o se confirmó con ella? (al revocarla, esta sesión también se cierra)
    const eraEsta = typeof sesionId === "number" && ((await t.query("SELECT 1 FROM sesiones WHERE id = $1 AND hogar_id = $2 AND llave_id = $3 AND revocada_en IS NULL", [sesionId, hogarId, llaveId])).rowCount ?? 0) > 0;
    const n = await revocaLlave(t, llaveId, hogarId);
    if (n === null) return { ok: false, error: "no_existe" };
    await audita(t, hogarId, "llave.quitada", { llave: llaveId, sesiones: n, quedan: e.activas - 1, tipo });
    return { ok: true, nombre: l.rows[0].nombre, sesiones: n, eraEsta, quedan: e.activas - 1, tipo };
  });
}

/**
 * El aviso de seguridad por correo (decisión 187) a la cuenta `hogar`: se busca su correo, se manda en SEGUNDO PLANO y un fallo (la búsqueda, el SMTP) se
 * registra sin la dirección ni el texto del error y NO tumba la petición ni deshace el cambio. Lo usan las rutas de `/api/yo/llaves` y las de la oficina.
 */
export async function avisaLlave(req: FastifyRequest, bd: Bd, cartero: Cartero, tipo: "anadida" | "quitada", hogar: number, nombre: string): Promise<void> {
  const correo = await correoDeLaCuenta(bd, hogar).catch(() => null);
  if (!correo) return;
  const evento = tipo === "anadida" ? "correo_llave_anadida_fallido" : "correo_llave_quitada_fallido";
  Promise.resolve().then(() => cartero.envia((tipo === "anadida" ? mensajeDeLlaveAnadida : mensajeDeLlaveQuitada)(correo, nombre))).catch((e: unknown) => {
    req.log.error({ evento, hogar, error: e instanceof Error ? e.name : "?" }, "no se pudo mandar el aviso de la llave");
  });
}
