// Rutas del enlace mágico, de la entrada con llave sin correo (OF13b-5) y de la sesión (contratos/sesion.md, contratos/api.openapi.yaml).
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Contexto } from "../contexto.ts";
import { huella, PATRON_TOKEN } from "../seguridad/cripto.ts";
import { entradaDe } from "./almacen.ts";
import { mensajeDeEnlace } from "./correo.ts";
import { paginaEnlaceMalo, paginaEntrar, POLITICA_REFERENTE } from "./paginas.ts";
import { aparatoPendiente, llaveRequerida } from "../oficina/acceso.ts";
import { aparatoAlEntrar, COOKIE_APARATO, nombreDeAparato, OPCIONES_COOKIE_APARATO } from "../oficina/aparatos.ts";
import { entraConLlave, gastaRetoDeAcceso, MIN_RETO, opcionesDeAcceso } from "../oficina/llaves.ts";
import { requiereSesion } from "./roles.ts";
import { audita, consumeEnlace, creaEnlace, esOficina, estadoEnlace, normalizaCorreo, primerAcceso, revocaTodas } from "./servicio.ts";
import { creaCodigo, SONDEO_S, sondea } from "./vinculo.ts";

export const NOMBRE_COOKIE = "__Host-gemelo";
export const OPCIONES_COOKIE = { path: "/", secure: true, httpOnly: true, sameSite: "lax" } as const;
export const TEXTO_ACEPTADO = "Si ese correo tiene cuenta, te llegará un enlace. Caduca en 15 minutos y sirve una sola vez.";
export const TEXTO_LIMITE = "Has pedido varios enlaces seguidos. Por seguridad, espera unos minutos antes de pedir otro. Si ya te ha llegado uno, úsalo.";
export const TEXTO_LIMITE_VINCULO = "Demasiados intentos seguidos. Por seguridad, espera unos minutos y vuelve a probar.";
/** Adónde va quien acaba de entrar: la primera vez (o si cambiaron las normas), al primer acceso de la portada; si no, al mundo. */
export const DESTINO_PRIMER_ACCESO = "/#bienvenida";
export const DESTINO_MUNDO = "/finca/";
/** Adónde va una cuenta de oficina (ADR-0024): a la oficina si el aparato está aprobado; si no, a la página de «aparato pendiente». */
export const DESTINO_OFICINA = "/oficina/";
export const DESTINO_APARATO_PENDIENTE = "/api/oficina/pendiente";

/**
 * Entrar con una llave sin sesión ni correo (OF13b-5, ADR-0029, contratos/sesion.md § Entrar con llave): la cookie que ata el reto
 * a ESTE navegador (32 bytes al azar; en la base, solo su SHA-256). Strict: solo viaja en peticiones del propio sitio. 5 minutos,
 * lo que vive el reto.
 */
export const COOKIE_RETO = "__Host-gemelo-reto";
export const OPCIONES_COOKIE_RETO = { path: "/", secure: true, httpOnly: true, sameSite: "strict", maxAge: MIN_RETO * 60 } as const;
const BORRA_COOKIE_RETO = { path: "/", secure: true, httpOnly: true, sameSite: "strict" } as const;
/** El ÚNICO fallo de la entrada con llave, sea cual sea la causa (no dice si la llave existe: LLAVES-DE-ACCESO §10). */
export const TEXTO_LLAVE_FALLO = "Esa llave no sirve aquí o no se pudo comprobar. Vuelve a intentarlo o entra con un enlace por correo.";
export const FALLO_LLAVE = { error: "llave_no_valida", mensaje: TEXTO_LLAVE_FALLO } as const;
/** La respuesta del navegador (PublicKeyCredential en JSON). La forma fina la comprueba @simplewebauthn/server; aquí, tamaños. */
const RESPUESTA_LLAVE = {
  type: "object", required: ["id", "rawId", "type", "response"], additionalProperties: true,
  properties: {
    id: { type: "string", pattern: "^[A-Za-z0-9_-]{16,1366}$" },
    rawId: { type: "string", pattern: "^[A-Za-z0-9_-]{16,1366}$" },
    type: { type: "string", enum: ["public-key"] },
    response: { type: "object", additionalProperties: true },
  },
} as const;

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
    // cuenta de oficina: el aparato (cookie aparte) decide si la sesión sirve ya o queda pendiente de aprobar (ADR-0024)
    const aparato = esOficina(r.rol)
      ? await aparatoAlEntrar(bd, r.hogarId, req.cookies[COOKIE_APARATO], req.headers["user-agent"], config.oficina.minSegundoEnlace)
      : null;
    // rotación: la sesión que trajera el navegador se destruye y nace otra con id nuevo (contra la fijación de sesión)
    await req.session.regenerate();
    req.session.hogarId = r.hogarId;
    req.session.origen = "enlace";
    req.session.aparatoNombre = nombreDeAparato(req.headers["user-agent"]);
    if (aparato) {
      req.session.aparatoId = aparato.id;
      // con la llave obligatoria (OF13) el enlace ya no confirma: la confirmación reciente la da la llave
      if (!config.llave.obligatoria) req.session.confirmadaEn = new Date();
      req.session.cookie.maxAge = config.oficina.horasSesion * 3_600_000;   // 12 h, no 30 días
      if (aparato.secretoNuevo) rep.setCookie(COOKIE_APARATO, aparato.secretoNuevo, OPCIONES_COOKIE_APARATO);
      return html ? rep.code(303).header("location", aparato.estado === "aprobado" ? DESTINO_OFICINA : DESTINO_APARATO_PENDIENTE).send()
        : rep.send({ ok: true, primer_acceso: false, aparato: aparato.estado });
    }
    return html ? rep.code(303).header("location", r.primerAcceso ? DESTINO_PRIMER_ACCESO : DESTINO_MUNDO).send()
      : rep.send({ ok: true, primer_acceso: r.primerAcceso });
  });

  // ---- entrar con una llave SIN sesión ni correo (OF13b-5; contratos/sesion.md § Entrar con llave). Las dos, sin sesión.
  const ventanaLlave = config.accesoLlave.ventanaMin * 60_000;

  // las opciones no dependen de ninguna cuenta (sin allowCredentials): la misma forma para cualquiera
  app.post<{ Body: Record<string, never> }>("/api/auth/llave/opciones", {
    config: { rateLimit: { max: config.accesoLlave.opcionesPorIp, timeWindow: ventanaLlave } },
    schema: { body: { type: "object", additionalProperties: false, properties: {} } },
  }, async (_req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const { opciones, claveEnClaro } = await opcionesDeAcceso(bd, config.llave);
    rep.setCookie(COOKIE_RETO, claveEnClaro, OPCIONES_COOKIE_RETO);
    return opciones;
  });

  app.post<{ Body: { respuesta: AuthenticationResponseJSON } }>("/api/auth/llave", {
    config: { rateLimit: { max: config.accesoLlave.entradasPorIp, timeWindow: ventanaLlave } },
    schema: { body: { type: "object", additionalProperties: false, required: ["respuesta"], properties: { respuesta: RESPUESTA_LLAVE } } },
    // una respuesta mal formada da el MISMO fallo que una llave que no sirve (y gasta el reto igual)
    attachValidation: true,
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const clave = req.cookies[COOKIE_RETO];
    // el reto es de un solo uso: la cookie se borra pase lo que pase
    rep.clearCookie(COOKIE_RETO, BORRA_COOKIE_RETO);
    if (req.validationError) { await gastaRetoDeAcceso(bd, clave); return rep.code(401).send(FALLO_LLAVE); }
    const r = await entraConLlave(bd, config.llave, clave, req.body.respuesta);
    if (!r.ok) return rep.code(401).send(FALLO_LLAVE);
    const agente = req.headers["user-agent"];
    // cuenta de oficina: el aparato decide, como con el enlace, pero una llave NUNCA aprueba un aparato pendiente (decisiones 152 y 184):
    // aparato nuevo o pendiente → la sesión nace «aparato pendiente» y se aprueba como siempre (otro aparato, segundo enlace, consola)
    const aparato = esOficina(r.rol)
      ? await aparatoAlEntrar(bd, r.hogarId, req.cookies[COOKIE_APARATO], agente, config.oficina.minSegundoEnlace, false)
      : null;
    const normas = await bd.query<{ normas_version: number | null }>("SELECT normas_version FROM hogares WHERE id = $1", [r.hogarId]);
    // rotación: la sesión que trajera el navegador se destruye y nace otra con id nuevo (contra la fijación de sesión)
    await req.session.regenerate();
    req.session.hogarId = r.hogarId;
    req.session.origen = "llave";
    req.session.llaveId = r.llaveId;
    req.session.aparatoNombre = nombreDeAparato(agente);
    if (aparato) {
      req.session.aparatoId = aparato.id;
      // la llave (con verificación de la persona) es la confirmación reciente (LLAVES-DE-ACCESO §3.4), solo con el aparato aprobado
      if (aparato.estado === "aprobado") req.session.confirmadaEn = new Date();
      req.session.cookie.maxAge = config.oficina.horasSesion * 3_600_000;   // 12 h, no 30 días
      if (aparato.secretoNuevo) rep.setCookie(COOKIE_APARATO, aparato.secretoNuevo, OPCIONES_COOKIE_APARATO);
    }
    await audita(bd, r.hogarId, "sesion.entrada_llave", { llave: r.llaveId, tipo: aparato ? "oficina" : "familia", aparato: aparato?.estado ?? null });
    const primer = !aparato && primerAcceso(normas.rows[0]?.normas_version);
    const destino = aparato ? (aparato.estado === "aprobado" ? DESTINO_OFICINA : DESTINO_APARATO_PENDIENTE) : primer ? DESTINO_PRIMER_ACCESO : DESTINO_MUNDO;
    return { ok: true, destino, primer_acceso: primer, ...(aparato ? { aparato: aparato.estado } : {}) };
  });

  // ---- código corto para las gafas (contratos/sesion.md § Código corto). Sin sesión: lo piden unas gafas que aún no la tienen.
  app.post<{ Body: Record<string, never> }>("/api/auth/vincula", {
    config: { rateLimit: { max: config.vinculo.porIp, timeWindow: config.vinculo.ventanaMin * 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, properties: {} } },
  }, async (_req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const c = await creaCodigo(bd, config.sesion.secreto);
    return rep.code(201).send({ codigo: c.codigo, sondeo: c.sondeo, expira_en: c.expiraEn.toISOString(), cada_s: SONDEO_S });
  });

  app.post<{ Body: { sondeo: string } }>("/api/auth/vincula/sondeo", {
    config: { rateLimit: { max: config.vinculo.sondeosPorMin, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["sondeo"], properties: { sondeo: esquemaToken } } },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const e = await sondea(bd, req.body.sondeo);
    if (e.estado !== "aprobado") return { estado: e.estado };
    // como al entrar con el enlace: la sesión que trajera el navegador se destruye y nace otra (rotación)
    await req.session.regenerate();
    req.session.hogarId = e.hogarId;
    req.session.origen = "vinculo";
    req.session.aparatoNombre = "Gafas (código corto)";
    // ADR-0028 (decisión 182): las gafas aprobadas desde una cuenta de oficina viven 12 h, como una sesión de oficina, y entran como
    // visitante (el rol efectivo `hogar` lo pone el almacén al leerla; aquí no se fija ningún rol)
    if (esOficina(e.rol)) req.session.cookie.maxAge = config.oficina.horasSesion * 3_600_000;
    return { estado: "aprobado", primer_acceso: primerAcceso(e.normasVersion) };
  });

  app.get("/api/sesion", { preHandler: requiereSesion }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    return { rol: req.session.rol, alias: req.session.alias ?? null, alias_visible: req.session.aliasVisible ?? false, primer_acceso: primerAcceso(req.session.normasVersion), titular: req.session.origen !== "vinculo", entrada: entradaDe(req.session.origen) };
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
  // `?para=oficina` (lo pone el Caddy en /oficina/): además, rol oficina o admin (ADR-0024); con sesión de hogar, 403.
  // Una cuenta de oficina con el aparato pendiente no pasa a ningún sitio: navegando, a la página que lo explica.
  // Una cuenta de oficina que aún no entró con su llave (OF13) solo pasa a /oficina/, que es donde se da de alta o se usa;
  // navegando a otro sitio (el mundo), allí; lo demás, 403. La api sigue parando cada ruta (requiereRol, requiereSesion).
  app.get<{ Querystring: { para?: "oficina" } }>("/api/interno/autoriza", {
    // additionalProperties: true a propósito: el forward_auth de Caddy conserva la consulta de la petición original (/finca/?debug,
    // ?olivos=gen…), que no es de esta ruta; con false, cualquier /finca/?algo daba 400 y el mundo no cargaba
    schema: { querystring: { type: "object", additionalProperties: true, properties: { para: { type: "string", enum: ["oficina"] } } } },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const navega = req.headers["sec-fetch-mode"] === "navigate";
    // una navegación (abrir /finca/ sin sesión) va a la portada; una carga (teselas, fetch) recibe 401
    if (typeof req.session?.hogarId !== "number") return navega ? rep.code(303).header("location", "/").send() : rep.code(401).send();
    if (aparatoPendiente(req.session)) return navega ? rep.code(303).header("location", DESTINO_APARATO_PENDIENTE).send() : rep.code(403).send();
    if (req.query.para === "oficina" && !esOficina(req.session.rol)) return rep.code(403).send();
    if (llaveRequerida(req.session) && req.query.para !== "oficina") return navega ? rep.code(303).header("location", DESTINO_OFICINA).send() : rep.code(403).send();
    return rep.code(204).send();
  });
}

function malo(rep: FastifyReply, html: boolean, motivo: "caducado" | "usado" | "no_valido") {
  return html
    ? rep.code(400).type("text/html; charset=utf-8").send(paginaEnlaceMalo(motivo))
    : rep.code(400).send({ error: "enlace_" + motivo });
}
