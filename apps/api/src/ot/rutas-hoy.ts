// GET /api/ot/hoy: lo de hoy de OlivarTrack y Vigía para la historia (contratos/ot-hoy.md), tras sesión como el resto del
// mundo y para todos los roles. Apagado (GEMELO_OT=no y GEMELO_VIGIA=no) o sin respuesta y sin lectura anterior: 503, y el
// motor se queda con la instantánea del índice (D.ot) y lo dice. Se serializa con contratos/ot-hoy.schema.json (lista blanca).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import type { Contexto } from "../contexto.ts";

const CONTRATOS = process.env["GEMELO_CONTRATOS"] ?? fileURLToPath(new URL("../../../../contratos/", import.meta.url));
export function esquemaHoy(): Record<string, unknown> {
  const e = JSON.parse(readFileSync(CONTRATOS.replace(/[\\/]?$/, "/") + "ot-hoy.schema.json", "utf8")) as Record<string, unknown>;
  delete e["$schema"]; delete e["$id"]; delete e["$comment"];
  return e;
}

export const TEXTO_HOY_APAGADO = "El servidor no está leyendo OlivarTrack ni Vigía en vivo: la historia usa la instantánea.";
export const TEXTO_HOY_SIN_RESPUESTA = "OlivarTrack y Vigía no han respondido y no hay una lectura reciente: la historia usa la instantánea.";

export async function rutasOtHoy(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const error = { type: "object", additionalProperties: false, required: ["error", "mensaje"], properties: { error: { type: "string" }, mensaje: { type: "string" } } };
  app.get("/api/ot/hoy", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { response: { 200: esquemaHoy(), 503: error } },
  }, async (req, rep) => {
    const s = ctx.hoy;
    if (!s || !s.activo) return rep.code(503).send({ error: "hoy_apagado", mensaje: TEXTO_HOY_APAGADO });
    const r = await s.lee();
    if (!r) {
      req.log.warn({ evento: "hoy_sin_respuesta" }, "OlivarTrack y Vigía no responden (hoy)");
      return rep.code(503).send({ error: "hoy_no_responde", mensaje: TEXTO_HOY_SIN_RESPUESTA });
    }
    // privado (va tras la sesión); el navegador puede reutilizarlo dos minutos: la api ya guarda lo de fuera
    rep.header("cache-control", "private, max-age=120");
    return r;
  });
}
