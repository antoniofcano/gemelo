// Baja de los avisos por correo con un clic (OF11c; contratos/api.openapi.yaml). Sin sesión: el enlace lleva una firma (HMAC del hogar con el secreto
// de sesión) y solo sirve para esto. GET enseña un botón (un escáner de correo que abra el enlace no da de baja a nadie); POST la hace, y es también
// lo que manda un cliente de correo con «List-Unsubscribe=One-Click» (RFC 8058), que no trae Origin (por eso la ruta está en EXENTAS_DE_ORIGEN).
import type { FastifyInstance } from "fastify";
import { paginaBajaAvisos, paginaBajaHecha, paginaBajaMala } from "../auth/paginas.ts";
import { audita } from "../auth/servicio.ts";
import type { Contexto } from "../contexto.ts";
import { hogarDeBaja } from "./correo.ts";

const TOKEN = { type: "string", minLength: 3, maxLength: 64, pattern: "^[0-9]{1,15}\\.[A-Za-z0-9_-]{32}$" } as const;

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
}
