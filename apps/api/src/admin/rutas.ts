// Panel de la oficina (rol admin): dar de alta hogares, asignar hazas (decisión 12: la haza la asigna la oficina),
// cerrar sesiones, borrar un hogar (RGPD) y lanzar la sincronía con OlivarTrack.
import type { FastifyInstance } from "fastify";
import { requiereRol } from "../auth/roles.ts";
import { audita, normalizaCorreo, revocaTodas, ROLES } from "../auth/servicio.ts";
import type { Contexto } from "../contexto.ts";
import { sincroniza } from "../ot/sincronia.ts";
import { borraFicheros, clavesDelHogar } from "../vida/medios.ts";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;

export async function rutasAdmin(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const soloAdmin = requiereRol("admin");

  app.get("/api/admin/hogares", { preHandler: soloAdmin }, async (_req, rep) => {
    const r = await bd.query(
      `SELECT g.id, g.correo, g.rol, g.alias, g.alias_visible, g.activo, g.creado_en,
              coalesce(array_agg(h.codigo ORDER BY h.codigo) FILTER (WHERE h.id IS NOT NULL), '{}') AS hazas
         FROM hogares g LEFT JOIN hazas h ON h.hogar_id = g.id GROUP BY g.id ORDER BY g.id`);
    rep.header("cache-control", "no-store");
    return { hogares: r.rows };
  });

  app.post<{ Body: { correo: string; rol: string } }>("/api/admin/hogares", {
    preHandler: soloAdmin,
    schema: { body: { type: "object", additionalProperties: false, required: ["correo", "rol"], properties: { correo: { type: "string", maxLength: 254 }, rol: { type: "string", enum: [...ROLES] } } } },
  }, async (req, rep) => {
    const correo = normalizaCorreo(req.body.correo);
    if (!correo) return rep.code(400).send({ error: "correo_no_valido" });
    try {
      const r = await bd.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [correo, req.body.rol]);
      await audita(bd, req.session.hogarId!, "admin.hogar_creado", { hogar: r.rows[0]!.id, rol: req.body.rol });
      return rep.code(201).send({ id: r.rows[0]!.id });
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return rep.code(409).send({ error: "ya_existe" });
      throw e;
    }
  });

  app.delete<{ Params: { id: number } }>("/api/admin/hogares/:id", { preHandler: soloAdmin, schema: { params: ID } }, async (req, rep) => {
    const claves = await clavesDelHogar(bd, req.params.id);
    const r = await bd.query("DELETE FROM hogares WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return rep.code(404).send({ error: "no_existe" });
    await borraFicheros(ctx.config.medios.carpeta, claves);
    await audita(bd, req.session.hogarId!, "hogar.borrado", { por: "oficina" });
    return rep.code(204).send();
  });

  app.post<{ Params: { id: number } }>("/api/admin/hogares/:id/revocar", { preHandler: soloAdmin, schema: { params: ID } }, async (req, rep) => {
    const n = await revocaTodas(bd, req.params.id);
    await audita(bd, req.session.hogarId!, "admin.sesiones_revocadas", { hogar: req.params.id, sesiones: n });
    return rep.code(204).send();
  });

  app.put<{ Params: { id: number }; Body: { hogar_id: number | null } }>("/api/admin/hazas/:id/hogar", {
    preHandler: soloAdmin,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["hogar_id"], properties: { hogar_id: { type: ["integer", "null"], minimum: 1 } } } },
  }, async (req, rep) => {
    try {
      const r = await bd.query("UPDATE hazas SET hogar_id = $1, actualizada_en = now() WHERE id = $2", [req.body.hogar_id, req.params.id]);
      if (!r.rowCount) return rep.code(404).send({ error: "no_existe" });
    } catch (e) {
      if ((e as { code?: string }).code === "23503") return rep.code(400).send({ error: "hogar_no_existe" });
      throw e;
    }
    await audita(bd, req.session.hogarId!, "admin.haza_asignada", { haza: req.params.id, hogar: req.body.hogar_id });
    return rep.code(204).send();
  });

  app.post("/api/admin/sincronia", { preHandler: soloAdmin }, async (req, rep) => {
    if (!ctx.lector) return rep.code(503).send({ error: "olivartrack_apagado", mensaje: "La lectura de OlivarTrack no está configurada (GEMELO_OT=no)." });
    const resumen = await sincroniza(bd, ctx.lector);
    await audita(bd, req.session.hogarId!, "admin.sincronia");
    return { resumen };
  });
}
