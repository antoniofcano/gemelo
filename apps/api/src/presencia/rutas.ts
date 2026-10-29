// Presencia compartida (F2): el token para entrar a la sala libre de LiveKit. Contrato: contratos/api.openapi.yaml,
// contratos/livekit-roles.json. Con sesión; el Origin lo comprueba app.ts como en todo POST.
import type { FastifyInstance } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import type { Contexto } from "../contexto.ts";
import { AVATAR_POR_DEFECTO, type Avatar, DISPOSITIVOS, type Dispositivo, firmaToken, identidadOpaca } from "./livekit.ts";

const APAGADA = { error: "presencia_apagada", mensaje: "La visita compartida no está disponible en este servidor." } as const;

export async function rutasPresencia(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;

  app.post<{ Body: { dispositivo: Dispositivo } }>("/api/presencia/token", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["dispositivo"], properties: { dispositivo: { type: "string", enum: [...DISPOSITIVOS] } } } },
  }, async (req, rep) => {
    const lk = ctx.config.livekit;
    if (!lk) return rep.code(503).send(APAGADA);
    const id = req.session.hogarId!;
    const r = await bd.query<{ alias: string | null; camisa: number | null; sombrero: Avatar["sombrero"] | null; piel: number | null }>(
      "SELECT g.alias, a.camisa, a.sombrero, a.piel FROM hogares g LEFT JOIN avatares a ON a.hogar_id = g.id WHERE g.id = $1", [id]);
    const f = r.rows[0];
    if (!f) return rep.code(401).send({ error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." });
    const identidad = identidadOpaca(lk, id);
    // sin alias, un nombre neutro con un trozo de la identidad opaca (nada del correo ni del id de la base)
    const alias = f.alias ?? "Visitante " + identidad.slice(2, 6);
    const avatar: Avatar = f.camisa === null || f.sombrero === null || f.piel === null ? AVATAR_POR_DEFECTO : { camisa: f.camisa, sombrero: f.sombrero, piel: f.piel };
    return firmaToken(lk, id, { alias, avatar, rol: req.session.rol!, dispositivo: req.body.dispositivo });
  });
}
