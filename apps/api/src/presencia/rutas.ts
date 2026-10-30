// Presencia compartida (F2): el token para entrar a la sala libre de LiveKit y la moderación mínima (decisión 42: la
// oficina expulsa desde el servidor y queda en la auditoría). Contrato: contratos/api.openapi.yaml,
// contratos/livekit-roles.json. Con sesión; el Origin lo comprueba app.ts como en todo POST.
import type { FastifyInstance } from "fastify";
import { requiereRol, requiereSesion } from "../auth/roles.ts";
import { audita } from "../auth/servicio.ts";
import type { Bd } from "../bd/pool.ts";
import type { ConfigLiveKit } from "../config.ts";
import type { Contexto } from "../contexto.ts";
import { AVATAR_POR_DEFECTO, type Avatar, type ClaveSala, CLAVES_SALA, DISPOSITIVOS, limpiaAspecto, type Dispositivo, Expulsados, esRolOficina, firmaToken, ModeradorLiveKit, type ModeradorSala, prefijoHogar, SALA_LIBRE, SALAS } from "./livekit.ts";
import { LigaduraVisita, puedeEntrar } from "./acceso_visita.ts";
import { rutasOficinaMundo } from "./oficina_mundo.ts";

const APAGADA = { error: "presencia_apagada", mensaje: "La visita compartida no está disponible en este servidor." } as const;

export interface DepsExpulsion { bd: Pick<Bd, "query">; lk: ConfigLiveKit; moderador: ModeradorSala; expulsados: Expulsados }
export type ResultadoExpulsion = { ok: true; estaba_en_sala: boolean; conexiones: number } | { ok: false; motivo: "no_existe" };

/**
 * Expulsión (solo la oficina): no se le dan tokens nuevos durante 15 min, se sacan con RoomService TODAS sus conexiones (una por aparato) de TODAS las
 * salas del mundo (OF10: la general y la de la visita) y se apunta en la auditoría (quién, a qué hogar, de qué salas, si estaba, cuántas y el motivo;
 * `sala` lleva las salas donde estaba, separadas por comas, o la libre si no estaba en ninguna). Si LiveKit falla, la marca se queda y el error sube
 * (500): la oficina lo ve y puede repetir.
 */
export async function expulsa(d: DepsExpulsion, adminId: number, hogarId: number, motivo: string | null): Promise<ResultadoExpulsion> {
  const r = await d.bd.query("SELECT 1 FROM hogares WHERE id = $1", [hogarId]);
  if (!r.rowCount) return { ok: false, motivo: "no_existe" };
  d.expulsados.marca(hogarId);
  const prefijo = prefijoHogar(d.lk, hogarId), donde: string[] = [];
  let conexiones = 0;
  for (const k of CLAVES_SALA) { const n = await d.moderador.expulsaHogar(SALAS[k], prefijo); if (n > 0) donde.push(SALAS[k]); conexiones += n; }
  const estaba = conexiones > 0;
  await audita(d.bd as Bd, adminId, "admin.presencia_expulsado", { hogar: hogarId, sala: donde.length ? donde.join(",") : SALA_LIBRE, estaba, conexiones, ...(motivo ? { motivo } : {}) });
  return { ok: true, estaba_en_sala: estaba, conexiones };
}

export async function rutasPresencia(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const expulsados = new Expulsados();
  const ligadura = new LigaduraVisita();   // OF10b: el evento de la agenda al que está ligada la sala de la visita (null = abierta a quien invite la oficina)
  const lk = ctx.config.livekit;
  const moderador: ModeradorSala | null = ctx.moderador ?? (lk ? new ModeradorLiveKit(lk) : null);

  // OF10: `sala` (opcional) elige la sala del mundo: «general» (la de siempre, por omisión) o «visita» (a la que invita la oficina)
  app.post<{ Body: { dispositivo: Dispositivo; sala?: ClaveSala } }>("/api/presencia/token", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["dispositivo"], properties: { dispositivo: { type: "string", enum: [...DISPOSITIVOS] }, sala: { type: "string", enum: [...CLAVES_SALA] } } } },
  }, async (req, rep) => {
    if (!lk) return rep.code(503).send(APAGADA);
    const id = req.session.hogarId!;
    if (expulsados.esta(id)) return rep.code(403).send({ error: "expulsado", mensaje: "La oficina te ha sacado de la visita compartida. Podrás volver a entrar más tarde." });
    // OF10b (decisión 154): la sala de la visita ligada a un evento es solo de la oficina y de los hogares apuntados (no en espera) a ese evento
    const evento = req.body.sala === "visita" ? ligadura.vigente() : null;
    if (evento !== null && !esRolOficina(req.session.rol!)) {
      const apuntado = ((await bd.query(
        `SELECT 1 FROM visitas_asistentes a JOIN visitas v ON v.id = a.visita_id JOIN hogares g ON g.id = a.hogar_id AND g.activo
          WHERE a.visita_id = $1 AND a.hogar_id = $2 AND a.estado = 'apuntado' AND v.estado <> 'cancelada'`, [evento, id])).rowCount ?? 0) > 0;
      const d = puedeEntrar({ sala: "visita", esOficina: false, evento, apuntado });
      if (!d.ok) return rep.code(403).send({ error: d.codigo, mensaje: d.mensaje });
    }
    const r = await bd.query<{ alias: string | null; camisa: number | null; sombrero: Avatar["sombrero"] | null; piel: number | null; vrm: string | null; aspecto: unknown }>(
      "SELECT g.alias, a.camisa, a.sombrero, a.piel, a.vrm, a.aspecto FROM hogares g LEFT JOIN avatares a ON a.hogar_id = g.id WHERE g.id = $1", [id]);
    const f = r.rows[0];
    if (!f) return rep.code(401).send({ error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." });
    // sin alias, un nombre neutro con un trozo del prefijo opaco del hogar (nada del correo ni del id de la base)
    const alias = f.alias ?? "Visitante " + prefijoHogar(lk, id).slice(2, 6);
    const avatar: Avatar = f.camisa === null || f.sombrero === null || f.piel === null ? AVATAR_POR_DEFECTO : { camisa: f.camisa, sombrero: f.sombrero, piel: f.piel, ...(f.vrm ? { vrm: f.vrm } : {}), ...limpiaAspecto(f.aspecto) };
    return firmaToken(lk, id, req.session.sessionId, { alias, avatar, rol: req.session.rol!, dispositivo: req.body.dispositivo }, Date.now(), req.body.sala ?? "general");
  });

  app.post<{ Body: { hogar_id: number; motivo?: string } }>("/api/admin/presencia/expulsar", {
    preHandler: requiereRol("oficina", "admin"),
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
    return { estaba_en_sala: r.estaba_en_sala, conexiones: r.conexiones };
  });

  // OF10: el mundo en modo oficina (anunciar, llevar a otra sala, balizas oficiales): src/presencia/oficina_mundo.ts
  await rutasOficinaMundo(app, ctx, moderador, ligadura);
}
