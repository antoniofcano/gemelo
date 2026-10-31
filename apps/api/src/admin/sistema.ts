// Sistema, lo mínimo (OF5, doc/sistema/OFICINA.md §10), para las cuentas de oficina y admin; todo de SOLO LECTURA salvo el correo de prueba:
//   GET  /api/admin/sistema        salud de cada servicio + OlivarTrack + Vigía + hornero + correo, juntos y sin secretos
//   GET  /api/admin/auditoria      la auditoría, filtrable por acción y paginada hacia atrás (cursor = id)
//   POST /api/admin/correo/prueba  manda un correo de prueba a la propia cuenta (nunca a otra) y lo deja en la auditoría
//   POST /api/admin/hornero/rehornear  (OF9, admin + confirmación reciente) deja la petición de una vuelta ya al hornero (fichero en el volumen compartido)
// «Sincronizar ahora» ya existe (POST /api/admin/sincronia, en rutas.ts).
// Nada de lo que sale lleva tokens, claves, URLs ni rutas del servidor: el modo y el estado, sí.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { mensajeDePrueba } from "../auth/correo.ts";
import { audita } from "../auth/servicio.ts";
import type { Contexto } from "../contexto.ts";
import { huella } from "../seguridad/cripto.ts";
import { OFICINA, SIN_SESION, requiereConfirmacionReciente, requiereRol } from "../oficina/acceso.ts";
import { escribePedido, leeHornero, limpiaMensaje } from "./hornero.ts";

export type EstadoSalud = "ok" | "aviso" | "mal" | "apagado";
export interface Servicio { id: string; nombre: string; estado: EstadoSalud; detalle: string }

const ACCION = "^[a-z_.]{1,64}$";
const TEXTO_PRUEBA_OK = "Correo de prueba mandado a tu cuenta.";

/** Un servicio de HTTP que responde algo (cualquier respuesta vale: LiveKit contesta «OK» en la raíz) antes de 2 s. */
async function respondeHttp(url: string): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  try { await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "manual" }); return { ok: true, ms: Date.now() - t0 }; } catch { return { ok: false, ms: Date.now() - t0 }; }
}

export async function rutasSistema(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, config, cartero } = ctx;

  app.get("/api/admin/sistema", { preHandler: OFICINA }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    const salud: Servicio[] = [{ id: "api", nombre: "api", estado: "ok", detalle: "responde" }];

    // base
    const t0 = Date.now();
    try { await bd.query("SELECT 1"); salud.push({ id: "base", nombre: "base de datos", estado: "ok", detalle: "responde en " + (Date.now() - t0) + " ms" }); }
    catch { salud.push({ id: "base", nombre: "base de datos", estado: "mal", detalle: "no responde" }); }

    // LiveKit
    if (!config.livekit) salud.push({ id: "livekit", nombre: "LiveKit", estado: "apagado", detalle: "presencia apagada (sin GEMELO_LIVEKIT_URL)" });
    else { const r = await respondeHttp(config.livekit.url); salud.push({ id: "livekit", nombre: "LiveKit", estado: r.ok ? "ok" : "mal", detalle: r.ok ? "responde en " + r.ms + " ms" : "no responde" }); }

    // correo: no se abre una conexión SMTP por cada vistazo; se dice el modo y cómo fue la última prueba
    const prueba = (await bd.query<{ cuando: Date; ok: boolean }>(
      "SELECT cuando, coalesce((detalle->>'ok')::boolean, false) AS ok FROM auditoria WHERE accion = 'oficina.correo_prueba' ORDER BY id DESC LIMIT 1")).rows[0];
    const correo = { modo: config.correo.modo, ultima_prueba: prueba ? { cuando: prueba.cuando.toISOString(), ok: prueba.ok } : null };
    salud.push({
      id: "correo", nombre: "correo", estado: !prueba ? "aviso" : prueba.ok ? "ok" : "mal",
      detalle: (config.correo.modo === "smtp" ? "SMTP" : "buzón de pruebas (no sale nada)") + (prueba ? (prueba.ok ? ": la última prueba salió bien" : ": la última prueba falló") : ": sin probar todavía"),
    });

    // hornero
    const hornero = leeHornero(config.hornero);
    salud.push({ id: "hornero", nombre: "hornero", estado: hornero.salud, detalle: hornero.detalle });

    // OlivarTrack: la última sincronía de cada herramienta
    const ot = (await bd.query<{ herramienta: string; estado: string; empezada_en: Date; consultado_en: Date | null; recibidos: number; guardados: number; avisos: unknown }>(
      `SELECT DISTINCT ON (herramienta) herramienta, estado, empezada_en, consultado_en, recibidos, guardados, avisos
         FROM sincronias_ot ORDER BY herramienta, empezada_en DESC`)).rows;
    const olivartrack = {
      modo: config.ot.modo,
      puede_sincronizar: config.ot.modo !== "no" && !!ctx.lector,
      herramientas: ot.map(f => {
        const av = Array.isArray(f.avisos) ? (f.avisos[0] as Record<string, unknown> | undefined) : undefined;
        return {
          herramienta: f.herramienta, estado: f.estado, intentada_en: f.empezada_en.toISOString(), consultado_en: f.consultado_en ? f.consultado_en.toISOString() : null,
          recibidos: f.recibidos, guardados: f.guardados,
          // «truncado» y «parcial» = no está completo: la pantalla lo dice y no se sacan totales de ahí
          completa: f.estado === "ok", aviso: f.estado === "error" ? limpiaMensaje(av?.["error"]) : null,
        };
      }),
    };

    // Vigía: el modo y de cuándo es lo último que llegó (la caché del servicio; no se llama a Vigía por mirar)
    const sv = ctx.tiempo ? ctx.tiempo.instantanea() : null;
    const vigia = { modo: config.vigia.modo, conector: config.vigia.modo !== "no" && !!sv, origen: sv ? sv.origen : null, herramientas: sv ? sv.herramientas : [] };

    return { generado_en: new Date().toISOString(), salud, correo, olivartrack, vigia, hornero };
  });

  // Re-hornear (OF9): el hornero es otro contenedor y la api no le habla; le deja una petición en el volumen que ya comparten (el de la configuración
  // publicada: la api lo escribe, él lo monta de solo lectura) y él la recoge en su comprobación (≤ GEMELO_HORNERO_COMPRUEBA_S, 10 min) como un sello más.
  app.post("/api/admin/hornero/rehornear", { preHandler: [requiereRol("admin"), requiereConfirmacionReciente()], config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (req, rep) => {
    const ruta = config.hornero.pedido, h = leeHornero(config.hornero);
    if (!ruta || !config.hornero.estado) return rep.code(503).send({ error: "hornero_no_conectado", mensaje: "La api no está conectada al hornero (falta su estado o el volumen de la petición)." });
    if (h.pedido?.estado === "pendiente") return rep.code(409).send({ error: "ya_pedido", mensaje: "Ya hay una petición esperando al hornero: espera a que la atienda (mira hasta 10 minutos).", pedido: h.pedido });
    let p: { id: string; pedido_en: string };
    try { p = escribePedido(ruta, req.session.hogarId!); }
    catch (e) { app.log.error({ evento: "hornero_pedido", error: (e as Error).message }, "no se pudo dejar la petición de re-hornear"); return rep.code(503).send({ error: "pedido_no_escrito", mensaje: "No se pudo dejar la petición al hornero." }); }
    await audita(bd, req.session.hogarId!, "hornero.rehornear", { pedido: p.id });
    return rep.code(202).send({ id: p.id, pedido_en: p.pedido_en, estado: "pendiente" });
  });

  app.get<{ Querystring: { accion?: string; antes?: number; limite?: number } }>("/api/admin/auditoria", {
    preHandler: OFICINA,
    schema: { querystring: { type: "object", additionalProperties: false, properties: {
      accion: { type: "string", pattern: ACCION }, antes: { type: "integer", minimum: 1 }, limite: { type: "integer", minimum: 1, maximum: 100, default: 50 } } } },
  }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    const { accion, antes } = req.query, limite = req.query.limite ?? 50;
    const r = await bd.query<{ id: string; cuando: Date; accion: string; detalle: Record<string, unknown>; hogar_id: string | null; rol: string | null }>(
      `SELECT a.id, a.cuando, a.accion, a.detalle, a.hogar_id, h.rol::text AS rol
         FROM auditoria a LEFT JOIN hogares h ON h.id = a.hogar_id
        WHERE ($1::text IS NULL OR a.accion = $1) AND ($2::bigint IS NULL OR a.id < $2)
        ORDER BY a.id DESC LIMIT $3`, [accion ?? null, antes ?? null, limite + 1]);
    const hay = r.rows.length > limite, filas = r.rows.slice(0, limite);
    // la primera página trae también las acciones que existen, para el filtro
    const acciones = antes ? undefined : (await bd.query<{ accion: string }>("SELECT DISTINCT accion FROM auditoria ORDER BY accion LIMIT 300")).rows.map(f => f.accion);
    return {
      filas: filas.map(f => ({ id: Number(f.id), cuando: f.cuando.toISOString(), accion: f.accion, quien: f.hogar_id ? { hogar: Number(f.hogar_id), rol: f.rol } : null, detalle: f.detalle })),
      siguiente: hay ? Number(filas[filas.length - 1]!.id) : null,
      ...(acciones ? { acciones } : {}),
    };
  });

  // como el enlace de confirmación: por cuenta, no por IP
  const porCuenta = app.createRateLimit({ max: 5, timeWindow: 10 * 60_000, keyGenerator: (req: FastifyRequest) => "correo-prueba:" + huella(String(req.session.hogarId)) });
  app.post<{ Body: Record<string, never> }>("/api/admin/correo/prueba", {
    preHandler: OFICINA, schema: { body: { type: "object", additionalProperties: false, properties: {} } },
  }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    const lim = await porCuenta(req);
    if (!lim.isAllowed && lim.isExceeded) return rep.code(429).send({ error: "demasiadas_peticiones", mensaje: "Demasiadas pruebas seguidas: espera unos minutos." });
    const c = await bd.query<{ correo: string }>("SELECT correo FROM hogares WHERE id = $1 AND activo", [req.session.hogarId]);
    const para = c.rows[0]?.correo;
    if (!para) return rep.code(401).send(SIN_SESION);
    try {
      await cartero.envia(mensajeDePrueba(para));
    } catch (e) {
      req.log.error({ evento: "correo_prueba_fallido", error: e instanceof Error ? e.message : "?" }, "el correo de prueba no salió");
      await audita(bd, req.session.hogarId!, "oficina.correo_prueba", { ok: false });
      return rep.code(502).send({ error: "correo_fallido", mensaje: "El correo de prueba no salió. Mira el registro del servidor." });
    }
    await audita(bd, req.session.hogarId!, "oficina.correo_prueba", { ok: true });
    return { mensaje: TEXTO_PRUEBA_OK };
  });
}
