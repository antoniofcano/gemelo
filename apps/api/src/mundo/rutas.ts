// GET /api/mundo/hoy (contratos/mundo-hoy.md): el mundo de hoy para el motor, tras sesión y para todos los roles. SIEMPRE 200: con las fuentes
// apagadas o sin respuesta, las partes van en null y cada fuente dice `disponible: false` (el motor no ve ni un 404 ni un 503 en la consola:
// aprendido en la tanda 9). Se serializa con contratos/mundo-hoy.schema.json (lista blanca). Caché corta y privada: la api ya guarda lo de fuera.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import type { Contexto } from "../contexto.ts";
import { ServicioMundoHoy } from "./hoy.ts";

const CONTRATOS = process.env["GEMELO_CONTRATOS"] ?? fileURLToPath(new URL("../../../../contratos/", import.meta.url));
export function esquemaMundoHoy(): Record<string, unknown> {
  const e = JSON.parse(readFileSync(CONTRATOS.replace(/[\\/]?$/, "/") + "mundo-hoy.schema.json", "utf8")) as Record<string, unknown>;
  delete e["$schema"]; delete e["$id"]; delete e["$comment"];
  return e;
}

export async function rutasMundoHoy(app: FastifyInstance, ctx: Contexto): Promise<void> {
  // sin servicio (todo apagado, o las pruebas de rutas): uno sin fuentes, que responde «no disponible» con 200
  const s = ctx.mundoHoy ?? new ServicioMundoHoy();
  app.get("/api/mundo/hoy", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { response: { 200: esquemaMundoHoy() } },
  }, async (_req, rep) => {
    const r = await s.lee();
    // privado (va tras la sesión) y corto: lo de fuera ya lo guarda la api, y «hoy» cambia con la hora
    rep.header("cache-control", "private, max-age=60");
    return r;
  });
}
