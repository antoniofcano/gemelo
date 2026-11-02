// Las llaves de acceso de la propia cuenta, para CUALQUIER sesión (OF13b-4, ADR-0029, contratos/sesion.md § Llave de acceso):
//   GET    /api/yo/llaves            las llaves vivas de la cuenta (sin id de credencial ni clave pública) y si puede añadir otra
//   POST   /api/yo/llaves/opciones   opciones para crear una llave (WebAuthn), con el reto atado a esta sesión
//   POST   /api/yo/llaves            verifica la respuesta, guarda la llave y avisa por correo (decisión 187)
//   DELETE /api/yo/llaves/:id        quita una llave propia, cierra sus sesiones y avisa por correo (decisión 187)
// La ceremonia y la regla de quién puede dar de alta son las de OF13b-3 (`oficina/llaves.ts`: permisoAlta, opcionesDeAlta, verificaAlta,
// registraLlave); las rutas de la oficina de OF13 (`/api/oficina/llaves…`) se mantienen para su pantalla (la primera llave con la sesión
// «sin llave» de la oficina, la entrada con llave y las de admin: con la llave obligatoria, esta sesión aún no pasa `requiereSesion`).
// El hogar sale SIEMPRE de la sesión. Nunca desde unas gafas vinculadas (`origen = 'vinculo'`).
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { audita, esOficina } from "../auth/servicio.ts";
import type { Contexto } from "../contexto.ts";
import { CONFIRMACION_REQUERIDA, requiereSesion, SIN_SESION } from "../oficina/acceso.ts";
import { nombreDeAparato } from "../oficina/aparatos.ts";
import {
  estadoLlaves, gastaReto, guardaReto, llavesVivas, MAX_LLAVES, nombreDeLlave, opcionesDeAlta, permisoAlta, registraLlave, type SesionDeAlta,
  usuarioDeLlave, verificaAlta,
} from "../oficina/llaves.ts";
import { avisaLlave, llavesDeLaCuenta, quitaLlave } from "./llaves.ts";

export const TEXTO_SOLO_TITULAR_LLAVES = "Las llaves se gestionan desde tu móvil u ordenador con tu enlace, no desde unas gafas ya vinculadas.";
export const TEXTO_LIMITE_LLAVES = "Demasiados intentos con las llaves. Espera unos minutos y vuelve a probarlo.";
export const TEXTO_FALLO_ALTA = "La llave no se pudo comprobar. Vuelve a intentarlo; si sigue fallando, prueba con otra o pide ayuda a la oficina.";
export const TEXTO_SIN_RETO_ALTA = "Ha pasado demasiado tiempo o se abrió otra petición. Vuelve a pulsar el botón.";
const TEXTO_ENTRA_CON_LLAVE = "Esta cuenta ya tiene una llave de acceso. Entra con ella para añadir otra; si las has perdido todas, pide a un admin que te rehabilite el alta.";
const NO_GUARDAR = "no-store";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;
const VACIO = { type: "object", additionalProperties: false, properties: {} } as const;
/** La respuesta del navegador (PublicKeyCredential en JSON). La forma fina la comprueba @simplewebauthn/server; aquí, tamaños. */
const RESPUESTA = {
  type: "object", required: ["id", "rawId", "type", "response"], additionalProperties: true,
  properties: {
    id: { type: "string", pattern: "^[A-Za-z0-9_-]{16,1366}$" },
    rawId: { type: "string", pattern: "^[A-Za-z0-9_-]{16,1366}$" },
    type: { type: "string", enum: ["public-key"] },
    response: { type: "object", additionalProperties: true },
  },
} as const;

export async function rutasYoLlaves(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, config, cartero } = ctx;
  const limite = { max: 20, timeWindow: 15 * 60_000 };
  // por cuenta y por IP (las dos con el mismo texto): una ceremonia de alta o una baja no se repite sin fin
  const porCuenta = app.createRateLimit({ ...limite, keyGenerator: (req: FastifyRequest) => "yo-llaves:" + String(req.session?.hogarId ?? "?") });
  const porIp = app.createRateLimit({ ...limite, keyGenerator: (req: FastifyRequest) => "yo-llaves-ip:" + req.ip });
  const pasaLimite = async (req: FastifyRequest, rep: FastifyReply): Promise<boolean> => {
    for (const l of [await porCuenta(req), await porIp(req)]) {
      if (!l.isAllowed && l.isExceeded) { await rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_LLAVES }); return false; }
    }
    return true;
  };
  const sesionDeAlta = (req: FastifyRequest): SesionDeAlta =>
    ({ origen: req.session.origen ?? "enlace", conLlave: typeof req.session.llaveId === "number", aparatoAprobado: req.session.aparatoAprobado === true });
  /** el permiso se traduce a su respuesta; null si puede */
  const niega = (permiso: ReturnType<typeof permisoAlta>["permiso"]): { codigo: number; cuerpo: Record<string, string> } | null => {
    switch (permiso) {
      case "si": return null;
      case "maximo": return { codigo: 409, cuerpo: { error: "demasiadas_llaves", mensaje: "Ya tienes " + MAX_LLAVES + " llaves. Quita alguna antes de añadir otra." } };
      case "no_titular": return { codigo: 403, cuerpo: { error: "solo_titular", mensaje: TEXTO_SOLO_TITULAR_LLAVES } };
      case "entra_con_llave": return { codigo: 403, cuerpo: { error: "entra_con_llave", mensaje: TEXTO_ENTRA_CON_LLAVE } };
      case "aparato_pendiente": return { codigo: 403, cuerpo: { error: "aparato_pendiente", mensaje: "Este aparato aún no está aprobado para la oficina." } };
      default: return { codigo: 401, cuerpo: { ...SIN_SESION } };   // sin_cuenta: la cuenta ya no existe
    }
  };

  // ---------------------------------------------------------------- lista
  app.get("/api/yo/llaves", { preHandler: requiereSesion, config: { rateLimit: { max: 60, timeWindow: 60_000 } } }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const hogar = req.session.hogarId!;
    const [llaves, estado] = await Promise.all([llavesDeLaCuenta(bd, hogar, req.session.idBd), estadoLlaves(bd, hogar)]);
    if (estado.rol === null) return rep.code(401).send(SIN_SESION);
    const d = permisoAlta(sesionDeAlta(req), estado);
    return { llaves, maximo: MAX_LLAVES, puede_anadir: d.permiso === "si" };
  });

  // ---------------------------------------------------------------- alta, paso 1: opciones y reto
  app.post<{ Body: Record<string, never> }>("/api/yo/llaves/opciones", { preHandler: requiereSesion, schema: { body: VACIO } }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const sid = req.session.idBd, hogar = req.session.hogarId!;
    if (typeof sid !== "number") return rep.code(401).send(SIN_SESION);
    if (!await pasaLimite(req, rep)) return;
    const no = niega(permisoAlta(sesionDeAlta(req), await estadoLlaves(bd, hogar)).permiso);
    if (no) return rep.code(no.codigo).send(no.cuerpo);
    const cuenta = await usuarioDeLlave(bd, hogar);
    if (!cuenta) return rep.code(401).send(SIN_SESION);
    const o = await opcionesDeAlta(config.llave, cuenta, await llavesVivas(bd, hogar));
    await guardaReto(bd, sid, "alta", o.challenge);
    return o;
  });

  // ---------------------------------------------------------------- alta, paso 2: verificar y guardar
  app.post<{ Body: { nombre?: string; respuesta: RegistrationResponseJSON } }>("/api/yo/llaves", {
    preHandler: requiereSesion,
    schema: { body: { type: "object", additionalProperties: false, required: ["respuesta"], properties: { nombre: { type: "string", maxLength: 80 }, respuesta: RESPUESTA } } },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const sid = req.session.idBd, hogar = req.session.hogarId!;
    if (typeof sid !== "number") return rep.code(401).send(SIN_SESION);
    if (!await pasaLimite(req, rep)) return;
    // desde las gafas, nunca (ni siquiera con un reto): antes de gastar nada
    if (req.session.origen === "vinculo") return rep.code(403).send({ error: "solo_titular", mensaje: TEXTO_SOLO_TITULAR_LLAVES });
    const reto = await gastaReto(bd, sid, "alta");
    if (!reto) return rep.code(409).send({ error: "sin_reto", mensaje: TEXTO_SIN_RETO_ALTA });
    const v = await verificaAlta(config.llave, req.body.respuesta, reto);
    if (!v.ok) {
      await audita(bd, hogar, esOficina(req.session.rol) ? "oficina.llave_fallida" : "llave.alta_fallida", { ceremonia: "alta", motivo: v.motivo });
      return rep.code(400).send({ error: "llave_no_valida", mensaje: TEXTO_FALLO_ALTA });
    }
    const nombre = nombreDeLlave(req.body.nombre, nombreDeAparato(req.headers["user-agent"]));
    // en una transacción y con la cuenta bloqueada: el permiso se vuelve a mirar (entre las opciones y el alta pudo cambiar)
    const r = await registraLlave(bd, { hogarId: hogar, sesionId: sid, sesion: sesionDeAlta(req), llave: v.llave, nombre, aparatoId: req.session.aparatoId ?? null });
    if (!r.ok) {
      if (r.error === "repetida") return rep.code(409).send({ error: "llave_repetida", mensaje: "Esa llave ya está dada de alta." });
      const no = niega(r.error);
      return rep.code(no!.codigo).send(no!.cuerpo);
    }
    if (r.avisar) await avisaLlave(req, bd, cartero, "anadida", hogar, nombre);
    return rep.code(201).send({ id: r.id, nombre });
  });

  // ---------------------------------------------------------------- quitar
  app.delete<{ Params: { id: number } }>("/api/yo/llaves/:id", { preHandler: requiereSesion, schema: { params: ID } }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const hogar = req.session.hogarId!;
    if (req.session.origen === "vinculo") return rep.code(403).send({ error: "solo_titular", mensaje: TEXTO_SOLO_TITULAR_LLAVES });
    if (!await pasaLimite(req, rep)) return;
    const q = await quitaLlave(bd, hogar, req.params.id, req.session.idBd, req.session.confirmacionVigente === true);
    if (!q.ok) {
      if (q.error === "confirmacion_requerida") return rep.code(403).send(CONFIRMACION_REQUERIDA);
      if (q.error === "ultima_llave") return rep.code(409).send({ error: "ultima_llave", mensaje: "Es la única llave de la cuenta de la oficina: añade otra antes de quitar esta (o pide a un admin que lo haga)." });
      return rep.code(404).send({ error: "no_existe" });
    }
    await avisaLlave(req, bd, cartero, "quitada", hogar, q.nombre);
    return { sesiones_cerradas: q.sesiones, era_esta: q.eraEsta, quedan: q.quedan };
  });
}
