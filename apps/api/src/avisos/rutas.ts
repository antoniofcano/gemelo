// Baja de los avisos por correo con un clic (OF11c; contratos/api.openapi.yaml). Sin sesión: el enlace lleva una firma (HMAC del hogar con el secreto
// de sesión) y solo sirve para esto. GET enseña un botón (un escáner de correo que abra el enlace no da de baja a nadie); POST la hace, y es también
// lo que manda un cliente de correo con «List-Unsubscribe=One-Click» (RFC 8058), que no trae Origin (por eso la ruta está en EXENTAS_DE_ORIGEN).
import type { FastifyInstance } from "fastify";
import { paginaBajaAvisos, paginaBajaHecha, paginaBajaMala } from "../auth/paginas.ts";
import { requiereSesion } from "../auth/roles.ts";
import { audita } from "../auth/servicio.ts";
import type { Contexto } from "../contexto.ts";
import { hogarDeBaja } from "./correo.ts";

const TOKEN = { type: "string", minLength: 3, maxLength: 64, pattern: "^[0-9]{1,15}\\.[A-Za-z0-9_-]{32}$" } as const;

/** Los avisos que un hogar ve en el mundo (OF11g): como mucho estos, los más nuevos primero. */
export const MAX_AVISOS_MUNDO = 50;

/** La fila de la base → lo que sale por la api. Solo lo del propio aviso y su evento; nada de otras familias ni del autor. */
export function avisoDeFila(f: { id: number | string; evento_id: number | string; evento_titulo: string; texto: string | null; titulo: string; creado_en: Date | string; leido_en: Date | string | null }) {
  return { id: Number(f.id), evento_id: Number(f.evento_id), evento: f.evento_titulo, titulo: f.titulo, texto: f.texto ?? "", fecha: new Date(f.creado_en).toISOString(), leido: f.leido_en !== null };
}

export async function rutasAvisos(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, config } = ctx;
  const html = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "strict-origin" };

  app.get<{ Querystring: { t?: string } }>("/api/avisos/baja", {
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { querystring: { type: "object", additionalProperties: false, properties: { t: TOKEN } } },
  }, async (req, rep) => {
    const t = req.query.t;
    if (!t || hogarDeBaja(config.sesion.secreto, t) === null) return rep.code(400).headers(html).send(paginaBajaMala());
    return rep.headers(html).send(paginaBajaAvisos(t));
  });

  app.post<{ Body: { t?: string } | undefined; Querystring: { t?: string } }>("/api/avisos/baja", {
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: {
      querystring: { type: "object", additionalProperties: false, properties: { t: TOKEN } },
      // formulario del botón (t) o POST de un clic del cliente de correo (List-Unsubscribe=One-Click, con t en la URL)
      body: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, properties: { t: TOKEN, "List-Unsubscribe": { const: "One-Click" } } }] },
    },
  }, async (req, rep) => {
    const t = req.body?.t ?? req.query.t;
    const hogar = t ? hogarDeBaja(config.sesion.secreto, t) : null;
    if (hogar === null) return rep.code(400).headers(html).send(paginaBajaMala());
    const r = await bd.query("UPDATE hogares SET avisos_correo = false WHERE id = $1 AND avisos_correo", [hogar]);
    if (r.rowCount) await audita(bd, hogar, "avisos.baja_correo", {});
    return rep.headers(html).send(paginaBajaHecha());
  });

  // OF11g: los avisos de eventos que le han llegado a ESTE hogar (el hogar sale de la sesión, nunca de un parámetro). Los que la oficina mandó a otras familias no
  // aparecen: la fila de `avisos_hogar` es la entrega. Solo avisos ligados a un evento que aún existe; lo caducado, fuera.
  app.get("/api/avisos", { preHandler: requiereSesion, config: { rateLimit: { max: 60, timeWindow: 60_000 } } }, async (req, rep) => {
    const r = await bd.query(
      `SELECT a.id, a.evento_id, v.titulo AS evento_titulo, a.titulo, a.texto, a.creado_en, ah.leido_en
         FROM avisos_hogar ah JOIN avisos a ON a.id = ah.aviso_id JOIN visitas v ON v.id = a.evento_id
        WHERE ah.hogar_id = $1 AND a.tipo = 'evento' AND (a.caduca_en IS NULL OR a.caduca_en > now())
        ORDER BY a.creado_en DESC, a.id DESC LIMIT ${MAX_AVISOS_MUNDO}`, [req.session.hogarId]);
    rep.header("cache-control", "private, no-cache");
    const avisos = r.rows.map(avisoDeFila);
    return { avisos, sin_leer: avisos.filter(a => !a.leido).length };
  });

  // marcar un aviso como leído por este hogar: idempotente; 404 si no es suyo (o no existe: no se distingue). Sin correos, sin cuerpo (se acepta `{}`).
  app.post<{ Params: { id: number } }>("/api/avisos/:id/leido", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 120, timeWindow: 60_000 } },
    schema: {
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 9_007_199_254_740_991 } } },
      body: { type: "object", additionalProperties: false, properties: {} },
    },
  }, async (req, rep) => {
    const hogar = req.session.hogarId!;
    const nuevo = await bd.query("UPDATE avisos_hogar SET leido_en = now() WHERE aviso_id = $1 AND hogar_id = $2 AND leido_en IS NULL", [req.params.id, hogar]);
    if (nuevo.rowCount) { await audita(bd, hogar, "avisos.leido", { aviso: req.params.id }); return rep.code(204).send(); }
    const suyo = await bd.query("SELECT 1 FROM avisos_hogar WHERE aviso_id = $1 AND hogar_id = $2", [req.params.id, hogar]);
    return suyo.rowCount ? rep.code(204).send() : rep.code(404).send({ error: "no_existe" });
  });
}
