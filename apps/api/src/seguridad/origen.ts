// Comprobación de Origin en todo método que cambia estado (POST, PUT, PATCH, DELETE): segunda barrera contra CSRF
// además de SameSite=Lax. Sin cabecera Origin se rechaza (los navegadores actuales la mandan siempre en esos métodos).
import type { FastifyReply, FastifyRequest } from "fastify";

const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Rutas que reciben peticiones sin Origin fiable y no cambian datos de nadie (informes CSP del navegador). */
export const EXENTAS_DE_ORIGEN = new Set(["/api/csp-informe"]);

export function compruebaOrigen(origenes: string[]) {
  const admitidos = new Set(origenes);
  return async function (req: FastifyRequest, rep: FastifyReply): Promise<void> {
    if (SEGUROS.has(req.method)) return;
    const ruta = req.routeOptions.url ?? req.url.split("?")[0] ?? "";
    if (EXENTAS_DE_ORIGEN.has(ruta)) return;
    const o = req.headers.origin;
    if (typeof o !== "string" || !admitidos.has(o)) {
      req.log.warn({ evento: "origen_rechazado", metodo: req.method, ruta }, "origen no admitido");
      await rep.code(403).send({ error: "origen_no_admitido", mensaje: "Esta petición no viene de la web del gemelo." });
    }
  };
}
