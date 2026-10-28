// Guardas de sesión y de rol para las rutas (preHandler). Sin sesión: 401; con sesión y sin el rol: 403.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Rol } from "./servicio.ts";

export async function requiereSesion(req: FastifyRequest, rep: FastifyReply): Promise<void> {
  if (typeof req.session?.hogarId !== "number") {
    await rep.code(401).send({ error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." });
  }
}

export function requiereRol(...roles: Rol[]) {
  return async function (req: FastifyRequest, rep: FastifyReply): Promise<void> {
    if (typeof req.session?.hogarId !== "number") {
      await rep.code(401).send({ error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." });
      return;
    }
    if (!req.session.rol || !roles.includes(req.session.rol)) {
      await rep.code(403).send({ error: "sin_permiso", mensaje: "Tu cuenta no tiene este permiso." });
    }
  };
}
