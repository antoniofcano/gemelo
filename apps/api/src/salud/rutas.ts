// /api/salud: viva y con base. Sin versiones ni detalles internos (no ayuda a nadie de fuera).
// /api/csp-informe: recibe los informes de la CSP en modo Report-Only y deja en el registro solo la directiva y el origen.
import type { FastifyInstance } from "fastify";
import type { Contexto } from "../contexto.ts";

export async function rutasSalud(app: FastifyInstance, ctx: Contexto): Promise<void> {
  app.get("/api/salud", { config: { rateLimit: false } }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    try {
      await ctx.bd.query("SELECT 1");
      return { estado: "ok", bd: "ok" };
    } catch {
      req.log.error({ evento: "salud_bd" }, "la base no responde");
      return rep.code(503).send({ estado: "mal", bd: "mal" });
    }
  });

  // Los navegadores mandan el informe sin un Origin fiable: esta ruta está exenta de la comprobación de origen
  // (seguridad/origen.ts) porque no cambia datos de nadie; tiene su límite y un cuerpo máximo de 8 KB.
  app.post("/api/csp-informe", { bodyLimit: 8192, config: { rateLimit: { max: 30, timeWindow: 60_000 } } }, async (req, rep) => {
    const b = req.body as Record<string, unknown> | unknown[] | undefined;
    const uno = (Array.isArray(b) ? b[0] : b) as Record<string, unknown> | undefined;
    const r = (uno?.["csp-report"] ?? uno?.["body"] ?? {}) as Record<string, unknown>;
    const dir = String(r["effective-directive"] ?? r["effectiveDirective"] ?? r["violated-directive"] ?? "?").slice(0, 60);
    const bloq = String(r["blocked-uri"] ?? r["blockedURL"] ?? "?");
    let origen = bloq;
    try { origen = new URL(bloq).origin; } catch { origen = bloq.slice(0, 20); }
    req.log.warn({ evento: "csp", directiva: dir, bloqueado: origen }, "informe CSP");
    return rep.code(204).send();
  });
}
