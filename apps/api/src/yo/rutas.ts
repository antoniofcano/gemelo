// Lo del propio hogar: alias (y si se muestra en sus hazas), avatar, descargar sus datos y borrar la cuenta (RGPD).
import type { FastifyInstance } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import { NOMBRE_COOKIE, OPCIONES_COOKIE } from "../auth/rutas.ts";
import { audita } from "../auth/servicio.ts";
import type { Contexto } from "../contexto.ts";

// 3–20 letras, números, espacios y guiones (doc/sistema/UX.md §4.6)
const PATRON_ALIAS = "^[\\p{L}\\p{N}][\\p{L}\\p{N} -]{1,18}[\\p{L}\\p{N}]$";
const RESERVADOS = /^(guia|guía|admin|administracion|administración|oficina|corresponsal|olivartrack)$/i;

export async function rutasYo(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;

  app.put<{ Body: { alias: string; visible: boolean } }>("/api/yo/alias", {
    preHandler: requiereSesion,
    schema: { body: { type: "object", additionalProperties: false, required: ["alias", "visible"], properties: { alias: { type: "string", pattern: PATRON_ALIAS }, visible: { type: "boolean" } } } },
  }, async (req, rep) => {
    const alias = req.body.alias.trim().replace(/\s+/g, " ");
    // nada que parezca un teléfono (6 cifras o más seguidas) ni nombres reservados
    if (RESERVADOS.test(alias) || /\d{6,}/.test(alias.replace(/[ -]/g, ""))) {
      return rep.code(400).send({ error: "alias_no_valido", mensaje: "Ese alias no se puede usar. Prueba con otro." });
    }
    try {
      await bd.query("UPDATE hogares SET alias = $1, alias_visible = $2 WHERE id = $3", [alias, req.body.visible, req.session.hogarId]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return rep.code(409).send({ error: "alias_ocupado", mensaje: "Ese alias ya lo usa otro hogar." });
      throw e;
    }
    await audita(bd, req.session.hogarId!, "yo.alias");
    return rep.code(204).send();
  });

  app.put<{ Body: { camisa: number; sombrero: string; piel: number } }>("/api/yo/avatar", {
    preHandler: requiereSesion,
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["camisa", "sombrero", "piel"],
        properties: { camisa: { type: "integer", minimum: 0, maximum: 5 }, sombrero: { type: "string", enum: ["ninguno", "paja", "gorra"] }, piel: { type: "integer", minimum: 0, maximum: 4 } },
      },
    },
  }, async (req, rep) => {
    await bd.query(
      `INSERT INTO avatares (hogar_id, camisa, sombrero, piel) VALUES ($1, $2, $3, $4)
       ON CONFLICT (hogar_id) DO UPDATE SET camisa = $2, sombrero = $3, piel = $4, actualizado_en = now()`,
      [req.session.hogarId, req.body.camisa, req.body.sombrero, req.body.piel]);
    return rep.code(204).send();
  });

  // Derecho de acceso y portabilidad: todo lo que se guarda del hogar, en JSON.
  app.get("/api/yo/datos", { preHandler: requiereSesion }, async (req, rep) => {
    const id = req.session.hogarId!;
    const [h, av, hz, pr, vi, se] = await Promise.all([
      bd.query("SELECT correo, rol, alias, alias_visible, creado_en FROM hogares WHERE id = $1", [id]),
      bd.query("SELECT camisa, sombrero, piel, actualizado_en FROM avatares WHERE hogar_id = $1", [id]),
      bd.query("SELECT codigo, nombre FROM hazas WHERE hogar_id = $1 ORDER BY codigo", [id]),
      bd.query("SELECT texto, creada_en, respuesta, respondida_en FROM preguntas WHERE hogar_id = $1 ORDER BY creada_en", [id]),
      bd.query("SELECT v.titulo, v.empieza_en FROM visitas_asistentes a JOIN visitas v ON v.id = a.visita_id WHERE a.hogar_id = $1 ORDER BY v.empieza_en", [id]),
      bd.query("SELECT creada_en, ultima_actividad_en, expira_en, revocada_en FROM sesiones WHERE hogar_id = $1 ORDER BY creada_en", [id]),
    ]);
    await audita(bd, id, "yo.datos_descargados");
    rep.header("cache-control", "no-store").header("content-disposition", "attachment; filename=\"mis-datos-gemelo.json\"");
    return { hogar: h.rows[0], avatar: av.rows[0] ?? null, hazas: hz.rows, preguntas: pr.rows, visitas: vi.rows, sesiones: se.rows };
  });

  // Derecho de supresión: se borra el hogar y, en cascada, todo lo suyo (migraciones/0001_inicial.sql).
  app.delete("/api/yo", { preHandler: requiereSesion }, async (req, rep) => {
    await bd.query("DELETE FROM hogares WHERE id = $1", [req.session.hogarId]);
    await audita(bd, null, "hogar.borrado", { por: "el_propio_hogar" });
    req.session = null as never;
    return rep.clearCookie(NOMBRE_COOKIE, OPCIONES_COOKIE).code(204).send();
  });
}
