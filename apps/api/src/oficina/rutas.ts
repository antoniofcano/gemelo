// Rutas de la sesión de oficina (OF1, ADR-0024, contratos/sesion.md § Oficina, api.openapi.yaml):
//   GET  /api/oficina/sesion             qué sesión de oficina tengo (aparato, caducidad, confirmación reciente); vale con el aparato pendiente
//   GET  /api/oficina/pendiente          página HTML «este aparato está pendiente» (a donde va el enlace si el aparato es nuevo)
//   POST /api/oficina/confirmar          manda un enlace nuevo a la propia cuenta: entrar con él es la «confirmación reciente»
//   GET  /api/admin/aparatos             aparatos de las cuentas de oficina
//   POST /api/admin/aparatos/:id/aprobar desde un aparato ya aprobado, con confirmación reciente (los de `admin`, solo `admin`)
//   POST /api/admin/aparatos/:id/revocar cierra además sus sesiones (los de `admin`, solo `admin` o la propia cuenta)
import type { FastifyInstance, FastifyRequest } from "fastify";
import { mensajeDeEnlace } from "../auth/correo.ts";
import { paginaAparatoPendiente } from "../auth/paginas.ts";
import { TEXTO_LIMITE } from "../auth/rutas.ts";
import { audita, creaEnlace, esOficina, type Rol } from "../auth/servicio.ts";
import type { Contexto } from "../contexto.ts";
import { huella } from "../seguridad/cripto.ts";
import { OFICINA, OFICINA_CONFIRMADA, SIN_PERMISO, SIN_SESION } from "./acceso.ts";
import { HORAS_PENDIENTE, revocaAparato } from "./aparatos.ts";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;
const NO_GUARDAR = "no-store";
export const TEXTO_CONFIRMAR = "Te hemos mandado un enlace nuevo. Ábrelo en este mismo navegador para confirmar que eres tú; vale 15 minutos.";

export async function rutasOficina(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, config, cartero } = ctx;

  app.get("/api/oficina/sesion", async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const s = req.session;
    if (typeof s?.hogarId !== "number") return rep.code(401).send(SIN_SESION);
    if (!esOficina(s.rol)) return rep.code(403).send(SIN_PERMISO);
    const a = await bd.query<{ nombre: string }>("SELECT nombre FROM aparatos_oficina WHERE id = $1", [s.aparatoId]);
    return {
      rol: s.rol,
      aparato: { id: s.aparatoId, nombre: a.rows[0]?.nombre ?? "Aparato", estado: s.aparatoAprobado ? "aprobado" : "pendiente" },
      caduca_en: s.cookie.expires instanceof Date ? s.cookie.expires.toISOString() : null,
      inactividad_min: config.oficina.minInactividad,
      confirmada_en: s.confirmadaEn instanceof Date ? s.confirmadaEn.toISOString() : null,
      confirmacion_vigente: s.confirmacionVigente === true,
      ot_proponer: config.oficina.otProponer,
    };
  });

  app.get("/api/oficina/pendiente", async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const s = req.session;
    if (typeof s?.hogarId !== "number" || !esOficina(s.rol)) return rep.code(303).header("location", "/").send();
    if (s.aparatoAprobado) return rep.code(303).header("location", "/oficina/").send();
    const a = await bd.query<{ nombre: string }>("SELECT nombre FROM aparatos_oficina WHERE id = $1", [s.aparatoId]);
    return rep.type("text/html; charset=utf-8").send(paginaAparatoPendiente(a.rows[0]?.nombre ?? "Aparato", config.oficina.minSegundoEnlace));
  });

  // como el enlace de la portada: mismos límites (por cuenta, no por correo: aquí ya se sabe quién es)
  const porCuenta = app.createRateLimit({
    max: config.enlace.porCorreo, timeWindow: config.enlace.ventanaMin * 60_000,
    keyGenerator: (req: FastifyRequest) => "confirmar:" + huella(String(req.session.hogarId)),
  });
  app.post<{ Body: Record<string, never> }>("/api/oficina/confirmar", {
    preHandler: OFICINA,
    schema: { body: { type: "object", additionalProperties: false, properties: {} } },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const lim = await porCuenta(req);
    if (!lim.isAllowed && lim.isExceeded) return rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE });
    const c = await bd.query<{ correo: string }>("SELECT correo FROM hogares WHERE id = $1 AND activo", [req.session.hogarId]);
    const correo = c.rows[0]?.correo;
    const enlace = correo ? await creaEnlace(bd, correo, config.enlace.minutos) : null;
    if (!correo || !enlace) return rep.code(401).send(SIN_SESION);
    cartero.envia(mensajeDeEnlace(correo, config.urlPublica + "/api/auth/entrar?t=" + enlace.token, config.enlace.minutos)).catch((e: unknown) => {
      req.log.error({ evento: "correo_fallido", hogar: enlace.hogarId, error: e instanceof Error ? e.message : "?" }, "no se pudo mandar el enlace de confirmación");
    });
    await audita(bd, req.session.hogarId!, "oficina.confirmacion_pedida");
    return rep.code(202).send({ mensaje: TEXTO_CONFIRMAR });
  });

  app.get("/api/admin/aparatos", { preHandler: OFICINA }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const r = await bd.query(
      `SELECT a.id, a.hogar_id, h.correo, h.rol, a.nombre, a.creado_en, a.aprobado_en, a.aprobado_como, a.ultimo_uso_en, a.revocado_en,
              CASE WHEN a.revocado_en IS NOT NULL THEN 'revocado' WHEN a.aprobado_en IS NOT NULL THEN 'aprobado'
                   WHEN a.creado_en > now() - make_interval(hours => $1) THEN 'pendiente' ELSE 'caducado' END AS estado
         FROM aparatos_oficina a JOIN hogares h ON h.id = a.hogar_id
        WHERE h.rol::text IN ('oficina', 'admin') ORDER BY a.id DESC LIMIT 200`, [HORAS_PENDIENTE]);
    return { aparatos: r.rows.map(f => ({ ...f, id: Number(f.id), hogar_id: Number(f.hogar_id), es_este: Number(f.id) === req.session.aparatoId })) };
  });

  /** El aparato con su cuenta; null si no existe o no es de una cuenta de oficina. */
  async function aparato(id: number) {
    const r = await bd.query<{ hogar_id: number; rol: Rol; pendiente: boolean }>(
      `SELECT a.hogar_id, h.rol, (a.aprobado_en IS NULL AND a.revocado_en IS NULL AND a.creado_en > now() - make_interval(hours => $2)) AS pendiente
         FROM aparatos_oficina a JOIN hogares h ON h.id = a.hogar_id WHERE a.id = $1 AND h.rol::text IN ('oficina', 'admin')`, [id, HORAS_PENDIENTE]);
    const f = r.rows[0];
    return f ? { hogarId: Number(f.hogar_id), rol: f.rol, pendiente: f.pendiente } : null;
  }

  app.post<{ Params: { id: number } }>("/api/admin/aparatos/:id/aprobar", { preHandler: OFICINA_CONFIRMADA, schema: { params: ID } }, async (req, rep) => {
    const a = await aparato(req.params.id);
    if (!a || !a.pendiente) return rep.code(404).send({ error: "no_existe", mensaje: "No hay ningún aparato pendiente con ese número (puede que ya se aprobara, se revocara o caducara)." });
    if (a.rol === "admin" && req.session.rol !== "admin") return rep.code(403).send(SIN_PERMISO);
    const r = await bd.query(
      `UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'aparato', aprobado_por = $2
        WHERE id = $1 AND aprobado_en IS NULL AND revocado_en IS NULL`, [req.params.id, req.session.hogarId]);
    if (!r.rowCount) return rep.code(404).send({ error: "no_existe" });
    await audita(bd, req.session.hogarId!, "oficina.aparato_aprobado", { aparato: req.params.id, hogar: a.hogarId, como: "aparato", desde: req.session.aparatoId ?? null });
    return rep.code(204).send();
  });

  app.post<{ Params: { id: number } }>("/api/admin/aparatos/:id/revocar", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const a = await aparato(req.params.id);
    if (!a) return rep.code(404).send({ error: "no_existe" });
    if (a.rol === "admin" && req.session.rol !== "admin" && a.hogarId !== req.session.hogarId) return rep.code(403).send(SIN_PERMISO);
    const n = await revocaAparato(bd, req.params.id);
    if (n === null) return rep.code(404).send({ error: "no_existe" });
    await audita(bd, req.session.hogarId!, "oficina.aparato_revocado", { aparato: req.params.id, hogar: a.hogarId, sesiones: n });
    return rep.code(204).send();
  });
}
