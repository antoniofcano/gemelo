// GET /api/tiempo: el tiempo de la explotación (contratos/tiempo.md), tras sesión como el resto del mundo y para todos los
// roles. Sin Vigía configurado (GEMELO_VIGIA=no) o sin respuesta y sin lectura anterior: 503, y el motor se queda con el
// tiempo simulado y lo dice. La respuesta se serializa con contratos/tiempo.schema.json (lista blanca).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import type { Contexto } from "../contexto.ts";

const CONTRATOS = process.env["GEMELO_CONTRATOS"] ?? fileURLToPath(new URL("../../../../contratos/", import.meta.url));
export function esquemaTiempo(): Record<string, unknown> {
  const e = JSON.parse(readFileSync(CONTRATOS.replace(/[\\/]?$/, "/") + "tiempo.schema.json", "utf8")) as Record<string, unknown>;
  delete e["$schema"]; delete e["$id"]; delete e["$comment"];
  return e;
}

export const TEXTO_APAGADO = "El servidor no está leyendo el tiempo de Vigía: el mundo usa un tiempo simulado.";
export const TEXTO_SIN_RESPUESTA = "Vigía no ha respondido y no hay una lectura reciente: el mundo usa un tiempo simulado.";

export async function rutasTiempo(app: FastifyInstance, ctx: Contexto): Promise<void> {
  app.get("/api/tiempo", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: {
      response: {
        200: esquemaTiempo(),
        503: { type: "object", additionalProperties: false, required: ["error", "mensaje"], properties: { error: { type: "string" }, mensaje: { type: "string" } } },
      },
    },
  }, async (req, rep) => {
    const s = ctx.tiempo;
    if (!s) return rep.code(503).send({ error: "tiempo_apagado", mensaje: TEXTO_APAGADO });
    const r = await s.lee();
    if (!r) {
      req.log.warn({ evento: "vigia_sin_respuesta" }, "Vigía no responde");
      return rep.code(503).send({ error: "vigia_no_responde", mensaje: TEXTO_SIN_RESPUESTA });
    }
    // privado (va tras la sesión); el navegador puede reutilizarlo un minuto: la api ya guarda lo de Vigía
    rep.header("cache-control", "private, max-age=60");
    return r;
  });
}
