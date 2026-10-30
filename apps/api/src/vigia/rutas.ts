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

export function esquemaHistorico(): Record<string, unknown> {
  const e = JSON.parse(readFileSync(CONTRATOS.replace(/[\\/]?$/, "/") + "tiempo-historico.schema.json", "utf8")) as Record<string, unknown>;
  delete e["$schema"]; delete e["$id"]; delete e["$comment"];
  return e;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 31;
/** «AAAA-MM-DD» válido (fecha real) → ms UTC; si no, null */
function dia(s: unknown): number | null {
  if (typeof s !== "string" || !DIA.test(s)) return null;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? t : null;
}

/** GET /api/tiempo/historico?desde=AAAA-MM-DD&hasta=AAAA-MM-DD: el histórico de Vigía (historico_meteo), hasta 31 días; mismas reglas que /api/tiempo. */
export async function rutasTiempoHistorico(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const error = { type: "object", additionalProperties: false, required: ["error", "mensaje"], properties: { error: { type: "string" }, mensaje: { type: "string" } } };
  app.get("/api/tiempo/historico", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { response: { 200: esquemaHistorico(), 400: error, 503: error } },
  }, async (req, rep) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const d0 = dia(q["desde"]), d1 = dia(q["hasta"]);
    if (d0 === null || d1 === null || d1 < d0 || (d1 - d0) / 86_400_000 + 1 > MAX_DIAS)
      return rep.code(400).send({ error: "rango_no_valido", mensaje: "desde y hasta son días AAAA-MM-DD, hasta no antes que desde, como mucho " + MAX_DIAS + " días." });
    const s = ctx.tiempo;
    if (!s) return rep.code(503).send({ error: "tiempo_apagado", mensaje: TEXTO_APAGADO });
    const r = await s.historico(q["desde"] as string, q["hasta"] as string);
    if (!r) {
      req.log.warn({ evento: "vigia_sin_respuesta" }, "Vigía no responde (histórico)");
      return rep.code(503).send({ error: "vigia_no_responde", mensaje: TEXTO_SIN_RESPUESTA });
    }
    rep.header("cache-control", "private, max-age=300");
    return r;
  });
}
