// Construye la app de Fastify con sus piezas (inyectadas: así las pruebas usan el buzón y la grabación de OlivarTrack).
import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySession from "@fastify/session";
import Fastify, { type FastifyInstance } from "fastify";
import { rutasAdmin } from "./admin/rutas.ts";
import { AlmacenPg } from "./auth/almacen.ts";
import { NOMBRE_COOKIE, rutasAuth, TEXTO_LIMITE, TEXTO_LIMITE_VINCULO } from "./auth/rutas.ts";
import type { Contexto } from "./contexto.ts";
import { rutasHazas } from "./hazas/rutas.ts";
import { rutasPresencia } from "./presencia/rutas.ts";
import { opcionesRegistro } from "./registro.ts";
import { rutasSalud } from "./salud/rutas.ts";
import { nuevoToken } from "./seguridad/cripto.ts";
import { compruebaOrigen } from "./seguridad/origen.ts";
import { rutasTiempo } from "./vigia/rutas.ts";
import { rutasYo } from "./yo/rutas.ts";

/** El código corto de las gafas tiene su propio texto de límite (el del enlace habla de enlaces). */
const esVinculo = (url: string) => url.startsWith("/api/auth/vincula") || url.startsWith("/api/yo/dispositivos/");

export interface OpcionesApp {
  destinoRegistro?: NodeJS.WritableStream;
  /** para las pruebas: se llama con cada ruta registrada (método y ruta), p. ej. para compararlas con el OpenAPI */
  alRegistrarRuta?: (metodo: string, ruta: string) => void;
}

export async function construyeApp(ctx: Contexto, o: OpcionesApp = {}): Promise<FastifyInstance> {
  const { config } = ctx;
  const app = Fastify({
    logger: opcionesRegistro(config.nivelRegistro, o.destinoRegistro),
    // confía en los N saltos más cercanos (borde + Caddy interno): la IP del hogar sale de X-Forwarded-For
    trustProxy: (_dir: string, salto: number) => salto < config.saltosProxy,
    bodyLimit: 64 * 1024,
    // validación ESTRICTA: lo que sobra se rechaza (no se quita en silencio); solo se convierten tipos en ruta y consulta
    ajv: { customOptions: { removeAdditional: false, useDefaults: false, coerceTypes: "array", allErrors: false } },
    routerOptions: { ignoreTrailingSlash: false },
  });

  if (o.alRegistrarRuta) {
    const fn = o.alRegistrarRuta;
    app.addHook("onRoute", r => { for (const m of [r.method].flat()) if (m !== "HEAD") fn(m, r.url); });
  }

  // Solo JSON (y formulario en /api/auth/entrar). text/plain es un tipo «simple» de CSRF: fuera.
  app.removeContentTypeParser("text/plain");
  app.addContentTypeParser(["application/csp-report", "application/reports+json"], { parseAs: "string", bodyLimit: 8192 },
    (_req, cuerpo, hecho) => { try { hecho(null, JSON.parse(cuerpo as string)); } catch { hecho(null, {}); } });
  await app.register(fastifyFormbody, { bodyLimit: 2048 });

  app.addHook("onRequest", compruebaOrigen(config.origenes));

  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (req, ctxLimite) => ({ statusCode: ctxLimite.statusCode, error: "demasiadas_peticiones", mensaje: esVinculo(req.url) ? TEXTO_LIMITE_VINCULO : TEXTO_LIMITE }),
  });

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: config.sesion.secreto,
    cookieName: NOMBRE_COOKIE,
    cookie: { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: config.sesion.diasAbsolutos * 86_400_000 },
    store: new AlmacenPg(ctx.bd, config.sesion.diasInactividad),
    saveUninitialized: false,
    rolling: false,
    idGenerator: () => nuevoToken(),
  });

  app.addHook("onSend", async (_req, rep, cuerpo) => {
    if (!rep.hasHeader("cache-control")) rep.header("cache-control", "no-store");
    rep.header("x-content-type-options", "nosniff");
    return cuerpo;
  });

  app.setErrorHandler((err: { validation?: unknown; statusCode?: number; message: string }, req, rep) => {
    if (err.validation) return rep.code(400).send({ error: "entrada_no_valida", mensaje: "La petición no tiene la forma esperada." });
    // el límite de @fastify/rate-limit llega como error: mismo texto para todos (sin delatar a nadie)
    if (err.statusCode === 429) return rep.code(429).send({ error: "demasiadas_peticiones", mensaje: esVinculo(req.url) ? TEXTO_LIMITE_VINCULO : TEXTO_LIMITE });
    const codigo = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (codigo >= 500) req.log.error({ evento: "error_interno", error: err.message }, "error interno");
    return rep.code(codigo).send({ error: codigo >= 500 ? "interno" : "peticion_no_valida" });
  });
  app.setNotFoundHandler((_req, rep) => rep.code(404).send({ error: "no_existe" }));

  await rutasSalud(app, ctx);
  await rutasAuth(app, ctx);
  await rutasHazas(app, ctx);
  await rutasYo(app, ctx);
  await rutasAdmin(app, ctx);
  await rutasPresencia(app, ctx);
  await rutasTiempo(app, ctx);
  return app;
}
