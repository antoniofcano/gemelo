// Guardas de sesión, de rol y de confirmación reciente (preHandler de Fastify), para cualquier ruta (ADR-0024,
// contratos/sesion.md § Oficina). Se encadenan en un array: `preHandler: [requiereRol("oficina", "admin"), requiereConfirmacionReciente()]`.
//   sin sesión                           → 401 sin_sesion
//   cuenta de oficina con aparato pendiente → 403 aparato_pendiente (la sesión existe, pero no sirve hasta que se aprueba el aparato)
//   con sesión y sin el rol              → 403 sin_permiso
//   sin confirmación reciente            → 403 confirmacion_requerida (entrar otra vez con un enlace: POST /api/oficina/confirmar)
// La página de la oficina y Caddy (`forward_auth`) también filtran, pero la api comprueba en cada ruta: nunca son la única barrera.
import type { FastifyReply, FastifyRequest } from "fastify";
import { esOficina, type Rol } from "../auth/servicio.ts";

export const SIN_SESION = { error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." } as const;
export const SIN_PERMISO = { error: "sin_permiso", mensaje: "Tu cuenta no tiene este permiso." } as const;
export const APARATO_PENDIENTE = { error: "aparato_pendiente", mensaje: "Este aparato aún no está aprobado para la oficina. Pide que lo aprueben desde otro aparato de la oficina, o vuelve a entrar con otro enlace pasados unos minutos." } as const;
export const CONFIRMACION_REQUERIDA = { error: "confirmacion_requerida", mensaje: "Para esto hace falta haber entrado hace poco. Pide un enlace nuevo, entra con él y vuelve a intentarlo." } as const;

type Sesion = FastifyRequest["session"] | undefined;
const conSesion = (s: Sesion): boolean => typeof s?.hogarId === "number";
/** ¿Es la sesión de una cuenta de oficina cuyo aparato aún no está aprobado? (sin sesión: false) */
export const aparatoPendiente = (s: Sesion): boolean => conSesion(s) && esOficina(s!.rol) && s!.aparatoAprobado !== true;
/** ¿Sesión de oficina (rol oficina o admin) con su aparato aprobado? */
export const esSesionDeOficina = (s: Sesion): boolean => conSesion(s) && esOficina(s!.rol) && s!.aparatoAprobado === true;

/** Cualquier sesión válida (un hogar, o una cuenta de oficina con su aparato aprobado). */
export async function requiereSesion(req: FastifyRequest, rep: FastifyReply): Promise<void> {
  if (!conSesion(req.session)) { await rep.code(401).send(SIN_SESION); return; }
  if (aparatoPendiente(req.session)) await rep.code(403).send(APARATO_PENDIENTE);
}

/** Sesión válida con uno de estos roles. Para la oficina: `requiereRol("oficina", "admin")`; lo que es solo de Antonio: `requiereRol("admin")`. */
export function requiereRol(...roles: Rol[]) {
  return async function (req: FastifyRequest, rep: FastifyReply): Promise<void> {
    if (!conSesion(req.session)) { await rep.code(401).send(SIN_SESION); return; }
    if (aparatoPendiente(req.session)) { await rep.code(403).send(APARATO_PENDIENTE); return; }
    if (!req.session.rol || !roles.includes(req.session.rol)) await rep.code(403).send(SIN_PERMISO);
  };
}

/**
 * Lo delicado (borrar una familia, cambiar un rol, aprobar un aparato, publicar parámetros, re-hornear): haber entrado con un
 * enlace hace menos de GEMELO_OFICINA_CONFIRMACION_MIN (15 min por defecto; lo calcula el almacén al leer la sesión).
 * Va DESPUÉS de requiereRol en el array de preHandler (por sí sola no comprueba el rol).
 */
export function requiereConfirmacionReciente() {
  return async function (req: FastifyRequest, rep: FastifyReply): Promise<void> {
    if (!conSesion(req.session)) { await rep.code(401).send(SIN_SESION); return; }
    if (req.session.confirmacionVigente !== true) await rep.code(403).send(CONFIRMACION_REQUERIDA);
  };
}

/** Las dos guardas de oficina juntas, ya en array (azúcar para las rutas /api/admin/*). */
export const OFICINA = [requiereRol("oficina", "admin")];
export const OFICINA_CONFIRMADA = [requiereRol("oficina", "admin"), requiereConfirmacionReciente()];
