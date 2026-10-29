// Rutas del enlace mágico y de la sesión (contratos/sesion.md, contratos/api.openapi.yaml).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Contexto } from "../contexto.ts";
import { huella, PATRON_TOKEN } from "../seguridad/cripto.ts";
import { mensajeDeEnlace } from "./correo.ts";
import { paginaEnlaceMalo, paginaEntrar, POLITICA_REFERENTE } from "./paginas.ts";
import { requiereSesion } from "./roles.ts";
import { audita, consumeEnlace, creaEnlace, estadoEnlace, normalizaCorreo, revocaTodas } from "./servicio.ts";

export const NOMBRE_COOKIE = "__Host-gemelo";
export const OPCIONES_COOKIE = { path: "/", secure: true, httpOnly: true, sameSite: "lax" } as const;
export const TEXTO_ACEPTADO = "Si ese correo puede entrar, te acabamos de mandar un enlace. Caduca en 15 minutos y sirve una sola vez.";
export const TEXTO_LIMITE = "Has pedido varios enlaces seguidos. Por seguridad, espera unos minutos antes de pedir otro. Si ya te ha llegado uno, úsalo.";

const NO_GUARDAR = "no-store";

export async function rutasAuth(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, config, cartero } = ctx;
  const ventana = config.enlace.ventanaMin * 60_000;
  const limite = { error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE };

  // límite por correo: la clave es una huella del correo normalizado, exista o no la cuenta (el límite no delata a nadie)
  const porCorreo = app.createRateLimit({
    max: config.enlace.porCorreo, timeWindow: ventana,
    keyGenerator: (req: FastifyRequest) => "correo:" + huella(normalizaCorreo((req.body as { correo: string }).correo) ?? "?"),
  });

  app.post<{ Body: { correo: string } }>("/api/auth/enlace", {
    config: { rateLimit: { max: config.enlace.porIp, timeWindow: ventana } },
    schema: {
      body: { type: "object", additionalProperties: false, required: ["correo"], properties: { correo: { type: "string", minLength: 3, maxLength: 254 } } },
    },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const correo = normalizaCorreo(req.body.correo);
    if (!correo) return rep.code(400).send({ error: "correo_no_valido", mensaje: "Ese correo no parece completo. Revisa que tenga @ y un dominio." });
    const lim = await porCorreo(req);
    // isAllowed = está en la lista de permitidos (no hay ninguna); isExceeded = se pasó del límite
    if (!lim.isAllowed && lim.isExceeded) return rep.code(429).send(limite);
    const enlace = await creaEnlace(bd, correo, config.enlace.minutos);
    if (enlace) {
      const url = config.urlPublica + "/api/auth/entrar?t=" + enlace.token;
      // sin esperar al SMTP: la respuesta tarda lo mismo exista o no la cuenta, y un SMTP lento no bloquea
      cartero.envia(mensajeDeEnlace(correo, url, config.enlace.minutos)).catch((e: unknown) => {
        req.log.error({ evento: "correo_fallido", hogar: enlace.hogarId, error: e instanceof Error ? e.message : "?" }, "no se pudo mandar el enlace");
      });
    }
    return rep.code(202).send({ mensaje: TEXTO_ACEPTADO });
  });

  const esquemaToken = { type: "string", pattern: PATRON_TOKEN };

  app.get<{ Querystring: { t: string } }>("/api/auth/entrar", {
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { querystring: { type: "object", additionalProperties: false, required: ["t"], properties: { t: esquemaToken } } },
    attachValidation: true,
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR).header("referrer-policy", POLITICA_REFERENTE).type("text/html; charset=utf-8");
    if (req.validationError) return rep.code(400).send(paginaEnlaceMalo("no_valido"));
    const e = await estadoEnlace(bd, req.query.t);
    if (e !== "valido") return rep.code(400).send(paginaEnlaceMalo(e));
    return rep.send(paginaEntrar(req.query.t));
  });

  app.post<{ Body: { t: string } }>("/api/auth/entrar", {
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["t"], properties: { t: esquemaToken } } },
    attachValidation: true,
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR).header("referrer-policy", POLITICA_REFERENTE);
    const html = !req.headers["content-type"]?.startsWith("application/json");
    if (req.validationError) return malo(rep, html, "no_valido");
    const r = await consumeEnlace(bd, req.body.t);
    if (!r.ok) return malo(rep, html, r.motivo);
    // rotación: la sesión que trajera el navegador se destruye y nace otra con id nuevo (contra la fijación de sesión)
    await req.session.regenerate();
    req.session.hogarId = r.hogarId;
    return html ? rep.code(303).header("location", "/finca/").send() : rep.send({ ok: true });
  });

  app.get("/api/sesion", { preHandler: requiereSesion }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    return { rol: req.session.rol, alias: req.session.alias ?? null, alias_visible: req.session.aliasVisible ?? false };
  });

  app.post("/api/sesion/salir", async (req, rep) => {
    const id = req.session?.hogarId ?? null;
    if (req.session?.sessionId) await req.session.destroy();
    if (id !== null) await audita(bd, id, "sesion.cerrada");
    return rep.clearCookie(NOMBRE_COOKIE, OPCIONES_COOKIE).code(204).send();
  });

  app.post("/api/sesion/salir-todas", { preHandler: requiereSesion }, async (req, rep) => {
    const id = req.session.hogarId!;
    const n = await revocaTodas(bd, id);
    await audita(bd, id, "sesion.todas_cerradas", { sesiones: n });
    req.session = null as never;
    return rep.clearCookie(NOMBRE_COOKIE, OPCIONES_COOKIE).code(204).send();
  });

  // Para el forward_auth del Caddy interno: sin sesión, nada fuera de la portada (decisión 16). Caddy no lo expone fuera.
  app.get("/api/interno/autoriza", async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    if (typeof req.session?.hogarId === "number") return rep.code(204).send();
    // una navegación (abrir /finca/ sin sesión) va a la portada; una carga (teselas, fetch) recibe 401
    return req.headers["sec-fetch-mode"] === "navigate" ? rep.code(303).header("location", "/").send() : rep.code(401).send();
  });
}

function malo(rep: FastifyReply, html: boolean, motivo: "caducado" | "usado" | "no_valido") {
  return html
    ? rep.code(400).type("text/html; charset=utf-8").send(paginaEnlaceMalo(motivo))
    : rep.code(400).send({ error: "enlace_" + motivo });
}
