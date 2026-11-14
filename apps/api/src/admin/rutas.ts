// Panel de la oficina (roles oficina y admin, ADR-0024): asignar hazas (decisión 12: la haza la asigna la oficina), cerrar todas las
// sesiones de un hogar y lanzar la sincronía con OlivarTrack. Lo de las familias (lista, alta, baja, borrado RGPD…) vive en familias.ts.
// Dar de alta o borrar una cuenta de OFICINA (rol oficina o admin) es cambiar roles: solo `admin`, con confirmación reciente.
import type { FastifyInstance } from "fastify";
import { audita, revocaTodas, type Rol } from "../auth/servicio.ts";
import { OFICINA, SIN_PERMISO, vetado } from "../oficina/acceso.ts";
import type { Contexto } from "../contexto.ts";
import { sincroniza } from "../ot/sincronia.ts";
import { rutasBandeja } from "./bandeja.ts";
import { rutasContornoFinca } from "./contorno.ts";
import { asignaHaza, leeObjetivo, rutasFamilias } from "./familias.ts";
import { rutasHazasOficina } from "./hazas.ts";
import { rutasLlavesDeHogar } from "./llaves_hogar.ts";
import { rutasOlivosOficina } from "./olivos.ts";
import { rutasSistema } from "./sistema.ts";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;

export async function rutasAdmin(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;

  await rutasFamilias(app, ctx);
  await rutasLlavesDeHogar(app, ctx);
  await rutasBandeja(app, ctx);
  await rutasHazasOficina(app, ctx);
  await rutasOlivosOficina(app, ctx);
  await rutasContornoFinca(app, ctx);
  await rutasSistema(app, ctx);

  // Cerrar todas las sesiones de una cuenta (oficina: rol oficina o admin). Las de otra cuenta de oficina, solo admin (A-03, como
  // DELETE /api/admin/sesiones/:id y la baja): una cuenta oficina no deja fuera a un admin; las propias, sí.
  app.post<{ Params: { id: number } }>("/api/admin/hogares/:id/revocar", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const o = await leeObjetivo(bd, req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    if (vetado(req, o.rol) && o.id !== req.session.hogarId) return rep.code(403).send(SIN_PERMISO);
    const n = await revocaTodas(bd, o.id);
    await audita(bd, req.session.hogarId!, "admin.sesiones_revocadas", { hogar: o.id, sesiones: n });
    return rep.code(204).send();
  });

  // Asignar (o quitar, con null) una haza desde su ficha. Con un hogar, las mismas reglas que PUT /api/admin/hogares/:id/haza (A-04):
  // la cuenta no está de baja (decisión 108: su contenido, oculto al momento, no vuelve a verse por aquí), el veto de oficina y una haza
  // por hogar (decisión 91: suelta las otras que tuviera). La respuesta sigue siendo 204 (contrato).
  app.put<{ Params: { id: number }; Body: { hogar_id: number | null } }>("/api/admin/hazas/:id/hogar", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["hogar_id"], properties: { hogar_id: { type: ["integer", "null"], minimum: 1, maximum: 2147483647 } } } },
  }, async (req, rep) => {
    if (req.body.hogar_id === null) {
      const r = await bd.query<{ rol: Rol | null }>("SELECT h.rol FROM hazas z LEFT JOIN hogares h ON h.id = z.hogar_id WHERE z.id = $1", [req.params.id]);
      if (!r.rows[0]) return rep.code(404).send({ error: "no_existe" });
      if (r.rows[0].rol && vetado(req, r.rows[0].rol)) return rep.code(403).send(SIN_PERMISO);
      await bd.query("UPDATE hazas SET hogar_id = NULL, actualizada_en = now() WHERE id = $1", [req.params.id]);
      await audita(bd, req.session.hogarId!, "admin.haza_asignada", { haza: req.params.id, hogar: null });
      return rep.code(204).send();
    }
    const o = await leeObjetivo(bd, req.body.hogar_id);
    if (!o) return rep.code(400).send({ error: "hogar_no_existe" });
    if (vetado(req, o.rol)) return rep.code(403).send(SIN_PERMISO);
    if (!o.activo) return rep.code(409).send({ error: "de_baja", mensaje: "La cuenta está de baja: reactívala antes de asignarle una haza." });
    const res = await asignaHaza(bd, req.session.hogarId!, o.id, req.params.id);
    if (res === "no_existe") return rep.code(404).send({ error: "no_existe" });
    return rep.code(204).send();
  });

  app.post("/api/admin/sincronia", { preHandler: OFICINA }, async (req, rep) => {
    if (!ctx.lector) return rep.code(503).send({ error: "olivartrack_apagado", mensaje: "La lectura de OlivarTrack no está configurada (GEMELO_OT=no)." });
    const resumen = await sincroniza(bd, ctx.lector);
    await audita(bd, req.session.hogarId!, "admin.sincronia");
    return { resumen };
  });
}
