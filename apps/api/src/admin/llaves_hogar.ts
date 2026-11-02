// Las llaves de acceso de UNA familia, desde su ficha en la oficina (OF13b-6, ADR-0029, doc/sistema/LLAVES-DE-ACCESO.md §5.4 «Me robaron el móvil»):
//   GET    /api/admin/hogares/:id/llaves              la lista (vivas y revocadas): nombre, fechas y banderas; nunca el id de credencial, la clave ni el contador
//   DELETE /api/admin/hogares/:id/llaves/:llaveId     quita una llave (confirmación reciente), cierra sus sesiones y avisa a la familia por correo
//   DELETE /api/admin/hogares/:id/llaves              quita todas (la familia perdió el aparato y llama): lo mismo, con un solo aviso
// Guarda `OFICINA` como las demás rutas /api/admin: una sesión de oficina de verdad (unas gafas vinculadas desde una cuenta de oficina entran como
// `hogar`, ADR-0028, y reciben 403). Las cuentas de OFICINA (rol oficina o admin) solo las toca un admin, como en el resto de la ficha, y por sus rutas de
// siempre (/api/admin/llaves…, con la regla de la última llave): aquí una cuenta de oficina responde 404, igual que una inexistente. El enlace del correo
// sigue siendo la entrada de la familia: quitar llaves no la deja fuera. Auditoría `admin.llave_quitada` (la llave o cuántas, las sesiones, el motivo
// opcional; nunca el id de credencial ni el correo). El aviso a la familia dice «la oficina», no el nombre de quien actúa.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { audita, esOficina, type Rol } from "../auth/servicio.ts";
import { enTransaccion } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { OFICINA, OFICINA_CONFIRMADA } from "../oficina/acceso.ts";
import { MAX_LLAVES, revocaLlave } from "../oficina/llaves.ts";
import { avisaLlavesQuitadasPorLaOficina, revocaTodasLasLlaves } from "../yo/llaves.ts";
import { TEXTO_LIMITE_LLAVES } from "../yo/llaves_rutas.ts";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;
const IDS = {
  type: "object", additionalProperties: false, required: ["id", "llaveId"],
  properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 }, llaveId: { type: "integer", minimum: 1, maximum: 2147483647 } },
} as const;
/** Motivo opcional de quien actúa: una línea, sin caracteres de control, para la auditoría (no sale a la familia). */
const MOTIVO = /^[^\u0000-\u001f\u007f]{0,200}$/;
const FORMA_MALA = { error: "entrada_no_valida", mensaje: "La petición no tiene la forma esperada." } as const;
/** El cuerpo de la baja es opcional (un DELETE sin cuerpo vale): vacío, o `{ motivo? }` y nada más. Devuelve el motivo limpio, o `false` si la forma es mala. */
function motivoDe(cuerpo: unknown): string | null | false {
  if (cuerpo === undefined || cuerpo === null) return null;
  if (typeof cuerpo !== "object" || Array.isArray(cuerpo)) return false;
  const c = cuerpo as Record<string, unknown>;
  if (Object.keys(c).some(k => k !== "motivo")) return false;
  if (c["motivo"] === undefined) return null;
  return typeof c["motivo"] === "string" && MOTIVO.test(c["motivo"]) ? c["motivo"].trim() || null : false;
}

export async function rutasLlavesDeHogar(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, cartero } = ctx;

  // por quien actúa y por IP (el patrón de /api/yo/llaves): una baja masiva de llaves no se repite sin fin
  const limite = { max: 20, timeWindow: 15 * 60_000 };
  const porCuenta = app.createRateLimit({ ...limite, keyGenerator: (req: FastifyRequest) => "adm-llaves:" + String(req.session?.hogarId ?? "?") });
  const porIp = app.createRateLimit({ ...limite, keyGenerator: (req: FastifyRequest) => "adm-llaves-ip:" + req.ip });
  const pasaLimite = async (req: FastifyRequest, rep: FastifyReply): Promise<boolean> => {
    for (const l of [await porCuenta(req), await porIp(req)]) {
      if (!l.isAllowed && l.isExceeded) { await rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_LLAVES }); return false; }
    }
    return true;
  };

  /** ¿Es una cuenta de familia viva en el sentido de esta ficha? Una inexistente y una de oficina (que aquí no se toca) son lo mismo: null. */
  const familia = async (id: number): Promise<{ id: number; rol: Rol } | null> => {
    const r = await bd.query<{ id: string; rol: Rol }>("SELECT id, rol FROM hogares WHERE id = $1", [id]);
    const f = r.rows[0];
    return f && !esOficina(f.rol) ? { id: Number(f.id), rol: f.rol } : null;
  };
  const NO_EXISTE = { error: "no_existe" } as const;

  // ---------------------------------------------------------------- lista
  app.get<{ Params: { id: number } }>("/api/admin/hogares/:id/llaves", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    if (!await familia(req.params.id)) return rep.code(404).send(NO_EXISTE);
    const r = await bd.query<{ id: string; nombre: string; creada_en: Date; ultima_vez_en: Date | null; revocada_en: Date | null; respaldada: boolean; descubrible: boolean }>(
      `SELECT id, nombre, creada_en, ultima_vez_en, revocada_en, respaldada, descubrible
         FROM llaves_acceso WHERE hogar_id = $1 ORDER BY revocada_en IS NOT NULL, id DESC LIMIT ${MAX_LLAVES * 4}`, [req.params.id]);
    return {
      llaves: r.rows.map(f => ({
        id: Number(f.id), nombre: f.nombre, creada_en: f.creada_en, ultima_vez_en: f.ultima_vez_en, revocada_en: f.revocada_en,
        viva: f.revocada_en === null, descubrible: f.descubrible === true, sincronizada: f.respaldada === true,
      })),
    };
  });

  // ---------------------------------------------------------------- quitar una
  app.delete<{ Params: { id: number; llaveId: number }; Body?: unknown }>("/api/admin/hogares/:id/llaves/:llaveId", {
    preHandler: OFICINA_CONFIRMADA, schema: { params: IDS },
  }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    if (!await pasaLimite(req, rep)) return;
    const yo = req.session.hogarId!, motivo = motivoDe(req.body);
    if (motivo === false) return rep.code(400).send(FORMA_MALA);
    if (!await familia(req.params.id)) return rep.code(404).send(NO_EXISTE);
    // con la cuenta bloqueada y la llave buscada POR LA CUENTA de la ruta: la llave de otra familia y la inexistente son la misma respuesta
    const r = await enTransaccion(bd, async t => {
      await t.query("SELECT id FROM hogares WHERE id = $1 FOR UPDATE", [req.params.id]);
      const l = await t.query<{ nombre: string }>("SELECT nombre FROM llaves_acceso WHERE id = $1 AND hogar_id = $2 AND revocada_en IS NULL", [req.params.llaveId, req.params.id]);
      if (!l.rows[0]) return null;
      const n = await revocaLlave(t, req.params.llaveId, yo);
      if (n === null) return null;
      await audita(t, yo, "admin.llave_quitada", { hogar: req.params.id, llave: req.params.llaveId, sesiones: n, motivo });
      return { sesiones: n, nombre: l.rows[0].nombre };
    });
    if (!r) return rep.code(404).send(NO_EXISTE);
    const aviso = await avisaLlavesQuitadasPorLaOficina(req, bd, cartero, req.params.id, [r.nombre]);
    if (aviso === "fallido") await audita(bd, yo, "admin.llave_aviso_fallido", { hogar: req.params.id });
    return { sesiones_cerradas: r.sesiones, aviso_enviado: aviso === "enviado" };
  });

  // ---------------------------------------------------------------- quitar todas
  app.delete<{ Params: { id: number }; Body?: unknown }>("/api/admin/hogares/:id/llaves", {
    preHandler: OFICINA_CONFIRMADA, schema: { params: ID },
  }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    if (!await pasaLimite(req, rep)) return;
    const yo = req.session.hogarId!, motivo = motivoDe(req.body);
    if (motivo === false) return rep.code(400).send(FORMA_MALA);
    if (!await familia(req.params.id)) return rep.code(404).send(NO_EXISTE);
    const r = await enTransaccion(bd, async t => {
      await t.query("SELECT id FROM hogares WHERE id = $1 FOR UPDATE", [req.params.id]);
      const q = await revocaTodasLasLlaves(t, req.params.id, yo);
      if (q.nombres.length) await audita(t, yo, "admin.llave_quitada", { hogar: req.params.id, llaves: q.nombres.length, todas: true, sesiones: q.sesiones, motivo });
      return q;
    });
    // sin llaves vivas no hay nada que avisar (y nada que auditar): la respuesta lo dice
    const aviso = await avisaLlavesQuitadasPorLaOficina(req, bd, cartero, req.params.id, r.nombres);
    if (aviso === "fallido") await audita(bd, yo, "admin.llave_aviso_fallido", { hogar: req.params.id });
    return { llaves_quitadas: r.nombres.length, sesiones_cerradas: r.sesiones, aviso_enviado: aviso === "enviado" };
  });
}
