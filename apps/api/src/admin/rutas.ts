// Panel de la oficina (roles oficina y admin, ADR-0024): asignar hazas (decisión 12: la haza la asigna la oficina), cerrar todas las
// sesiones de un hogar y lanzar la sincronía con OlivarTrack. Lo de las familias (lista, alta, baja, borrado RGPD…) vive en familias.ts.
// Dar de alta o borrar una cuenta de OFICINA (rol oficina o admin) es cambiar roles: solo `admin`, con confirmación reciente.
import type { FastifyInstance } from "fastify";
import { audita, revocaTodas } from "../auth/servicio.ts";
import { OFICINA } from "../oficina/acceso.ts";
import type { Contexto } from "../contexto.ts";
import { sincroniza } from "../ot/sincronia.ts";
import { rutasBandeja } from "./bandeja.ts";
import { rutasFamilias } from "./familias.ts";
import { rutasHazasOficina } from "./hazas.ts";
import { rutasSistema } from "./sistema.ts";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;

export async function rutasAdmin(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const soloAdmin = OFICINA;

  await rutasFamilias(app, ctx);
  await rutasBandeja(app, ctx);
  await rutasHazasOficina(app, ctx);
  await rutasSistema(app, ctx);

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
