// Presencia compartida (F2): el token para entrar a la sala libre de LiveKit y la moderación mínima (decisión 42: la
// oficina expulsa desde el servidor y queda en la auditoría). Contrato: contratos/api.openapi.yaml,
// contratos/livekit-roles.json. Con sesión; el Origin lo comprueba app.ts como en todo POST.
import type { FastifyInstance } from "fastify";
import { requiereRol, requiereSesion } from "../auth/roles.ts";
import { audita } from "../auth/servicio.ts";
import type { Bd } from "../bd/pool.ts";
import type { ConfigLiveKit } from "../config.ts";
import type { Contexto } from "../contexto.ts";
import { AVATAR_POR_DEFECTO, type Avatar, DISPOSITIVOS, type Dispositivo, Expulsados, firmaToken, identidadOpaca, ModeradorLiveKit, type ModeradorSala, SALA_LIBRE } from "./livekit.ts";

const APAGADA = { error: "presencia_apagada", mensaje: "La visita compartida no está disponible en este servidor." } as const;

export interface DepsExpulsion { bd: Pick<Bd, "query">; lk: ConfigLiveKit; moderador: ModeradorSala; expulsados: Expulsados }
export type ResultadoExpulsion = { ok: true; estaba_en_sala: boolean } | { ok: false; motivo: "no_existe" };

/**
 * Expulsión (solo la oficina): no se le dan tokens nuevos durante 15 min, se le saca de la sala con RoomService y se
 * apunta en la auditoría (quién, a qué hogar, si estaba y el motivo). Si LiveKit falla, la marca se queda y el error sube
 * (500): la oficina lo ve y puede repetir.
 */
export async function expulsa(d: DepsExpulsion, adminId: number, hogarId: number, motivo: string | null): Promise<ResultadoExpulsion> {
  const r = await d.bd.query("SELECT 1 FROM hogares WHERE id = $1", [hogarId]);
  if (!r.rowCount) return { ok: false, motivo: "no_existe" };
  d.expulsados.marca(hogarId);
  const estaba = await d.moderador.expulsa(SALA_LIBRE, identidadOpaca(d.lk, hogarId));
  await audita(d.bd as Bd, adminId, "admin.presencia_expulsado", { hogar: hogarId, sala: SALA_LIBRE, estaba, ...(motivo ? { motivo } : {}) });
  return { ok: true, estaba_en_sala: estaba };
}

export async function rutasPresencia(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const expulsados = new Expulsados();
  const lk = ctx.config.livekit;
  const moderador: ModeradorSala | null = ctx.moderador ?? (lk ? new ModeradorLiveKit(lk) : null);

  app.post<{ Body: { dispositivo: Dispositivo } }>("/api/presencia/token", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["dispositivo"], properties: { dispositivo: { type: "string", enum: [...DISPOSITIVOS] } } } },
  }, async (req, rep) => {
    if (!lk) return rep.code(503).send(APAGADA);
    const id = req.session.hogarId!;
    if (expulsados.esta(id)) return rep.code(403).send({ error: "expulsado", mensaje: "La oficina te ha sacado de la visita compartida. Podrás volver a entrar más tarde." });
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

  app.post<{ Body: { hogar_id: number; motivo?: string } }>("/api/admin/presencia/expulsar", {
    preHandler: requiereRol("admin"),
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["hogar_id"],
        properties: { hogar_id: { type: "integer", minimum: 1, maximum: 2147483647 }, motivo: { type: "string", minLength: 1, maxLength: 200 } },
      },
    },
  }, async (req, rep) => {
    if (!lk || !moderador) return rep.code(503).send(APAGADA);
    const motivo = req.body.motivo?.trim().replace(/\s+/g, " ") || null;
    const r = await expulsa({ bd, lk, moderador, expulsados }, req.session.hogarId!, req.body.hogar_id, motivo);
    if (!r.ok) return rep.code(404).send({ error: "no_existe" });
    return { estaba_en_sala: r.estaba_en_sala };
  });
}
