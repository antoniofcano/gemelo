// Configuración versionada del mundo (C6 de ADR-0023, OF6 de doc/sistema/OFICINA.md; decisiones 111-113 y 118; contrato:
// contratos/config.schema.json, doc/sistema/CONTRATOS.md § Configuración, api.openapi.yaml; tabla: migraciones/0006_config.sql).
//  - GET /api/config (cualquier sesión): la versión publicada; a una sesión de la oficina (rol oficina o admin, con su aparato
//    aprobado: ADR-0024), la «en prueba» si hay una (decisión 113: primero se prueba con las cuentas de la oficina). Sin nada publicado, 200 con { v: 1 } (el
//    motor sigue con lo del código; un 404 ensuciaría la consola de cada carga).
//  - /api/admin/config… (solo admin): historial, crear borrador (validado), pasarlo a prueba, publicarlo para todos, retirar
//    un borrador o una prueba, y «volver» (publicar una COPIA de una versión vieja como versión nueva). Una versión nunca se
//    reescribe (lo impide también la base). Publicar para todos y volver piden además confirmación reciente (OF1, ADR-0024).
//    Cada paso queda en la auditoría.
import { renameSync, writeFileSync } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";
import { esSesionDeOficina, requiereConfirmacionReciente, requiereRol, requiereSesion } from "../oficina/acceso.ts";
import { audita } from "../auth/servicio.ts";
import { type Cliente, enTransaccion } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { validaConfig } from "./valida.ts";

export type EstadoConfig = "borrador" | "en_prueba" | "publicada" | "retirada";
interface Fila { version: number; estado: EstadoConfig; nota: string | null; autor_id: number | null; copia_de: number | null; creada_en: Date; estado_en: Date; cuerpo?: Record<string, unknown> }

const VERSION = { type: "object", additionalProperties: false, required: ["version"], properties: { version: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;
const LIMITE = { rateLimit: { max: 60, timeWindow: 60_000 } };
const COLUMNAS = "version, estado, nota, autor_id, copia_de, creada_en, estado_en";

type Resultado = { codigo: number; cuerpo?: unknown };
const falla = (codigo: number, error: string, mensaje: string): Resultado => ({ codigo, cuerpo: { error, mensaje } });

export async function rutasConfig(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const soloAdmin = requiereRol("admin"), adminConfirmado = [requiereRol("admin"), requiereConfirmacionReciente()];

  /** La publicada va también a un fichero (GEMELO_CONFIG_SALIDA) para quien no habla con la api: el hornero lee de ahí el calendario de épocas. */
  function escribeFichero(cuerpo: unknown): void {
    const ruta = ctx.config.configFichero; if (!ruta) return;
    try { const tmp = ruta + ".tmp-" + process.pid; writeFileSync(tmp, JSON.stringify(cuerpo, null, 2) + "\n"); renameSync(tmp, ruta); }
    catch (e) { app.log.error({ evento: "config_fichero", error: (e as Error).message }, "no se pudo escribir la configuración publicada"); }
  }
  async function retiraOtra(c: Cliente, estado: EstadoConfig, hogar: number): Promise<number | null> {
    const r = await c.query<{ version: number }>("UPDATE config_versiones SET estado = 'retirada', estado_en = now(), estado_por = $2 WHERE estado = $1 RETURNING version", [estado, hogar]);
    return r.rows[0]?.version ?? null;
  }

  // ---------------------------------------------------------------- el motor
  app.get("/api/config", { preHandler: requiereSesion, config: { rateLimit: { max: 120, timeWindow: 60_000 } } }, async (req, rep) => {
    const r = await bd.query<{ version: number; estado: EstadoConfig; cuerpo: Record<string, unknown>; estado_en: Date }>(
      `SELECT version, estado, cuerpo, estado_en FROM config_versiones
        WHERE estado = 'publicada' OR ($1 AND estado = 'en_prueba') ORDER BY (estado = 'en_prueba') DESC LIMIT 1`, [esSesionDeOficina(req.session)]);
    const f = r.rows[0];
    const etag = "\"cfg-" + (f ? f.version + "-" + f.estado : "0") + "\"";
    rep.header("cache-control", "private, no-cache").header("vary", "cookie").header("etag", etag);
    if (req.headers["if-none-match"] === etag) return rep.code(304).send();
    return f ? { version: f.version, estado: f.estado, desde: f.estado_en, config: f.cuerpo } : { version: null, estado: null, desde: null, config: { v: 1 } };
  });

  // ---------------------------------------------------------------- la oficina (admin)
  app.get("/api/admin/config", { preHandler: soloAdmin, config: LIMITE }, async (_req, rep) => {
    const r = await bd.query<Fila>(`SELECT ${COLUMNAS} FROM config_versiones ORDER BY version DESC LIMIT 200`);
    rep.header("cache-control", "no-store");
    const de = (e: EstadoConfig) => r.rows.find(f => f.estado === e)?.version ?? null;
    return { publicada: de("publicada"), en_prueba: de("en_prueba"), versiones: r.rows };
  });

  app.get<{ Params: { version: number } }>("/api/admin/config/:version", { preHandler: soloAdmin, config: LIMITE, schema: { params: VERSION } }, async (req, rep) => {
    const f = (await bd.query<Fila>(`SELECT ${COLUMNAS}, cuerpo FROM config_versiones WHERE version = $1`, [req.params.version])).rows[0];
    if (!f) return rep.code(404).send({ error: "no_existe" });
    rep.header("cache-control", "no-store");
    return f;
  });

  app.post<{ Body: { cuerpo: Record<string, unknown>; nota?: string } }>("/api/admin/config", {
    preHandler: soloAdmin, config: LIMITE, bodyLimit: 32 * 1024,
    schema: { body: { type: "object", additionalProperties: false, required: ["cuerpo"], properties: { cuerpo: { type: "object" }, nota: { type: "string", maxLength: 500 } } } },
  }, async (req, rep) => {
    const err = validaConfig(req.body.cuerpo);
    if (err.length) return rep.code(400).send({ error: "config_no_valida", mensaje: "La configuración no cumple el contrato o se sale de sus límites.", detalles: err });
    const r = await bd.query<{ version: number }>("INSERT INTO config_versiones (cuerpo, nota, autor_id) VALUES ($1, $2, $3) RETURNING version",
      [JSON.stringify(req.body.cuerpo), req.body.nota ?? null, req.session.hogarId]);
    const version = r.rows[0]!.version;
    await audita(bd, req.session.hogarId!, "config.borrador", { version });
    return rep.code(201).send({ version, estado: "borrador" });
  });

  // cambia el estado de una versión: desde → hacia, retirando antes la que ocupe ese sitio (una publicada, una en prueba)
  async function pasa(version: number, hogar: number, desde: EstadoConfig[], hacia: EstadoConfig, accion: string): Promise<Resultado> {
    try {
      const r = await enTransaccion(bd, async c => {
        const f = (await c.query<{ estado: EstadoConfig; cuerpo: Record<string, unknown> }>("SELECT estado, cuerpo FROM config_versiones WHERE version = $1 FOR UPDATE", [version])).rows[0];
        if (!f) return falla(404, "no_existe", "No hay ninguna versión con ese número.");
        if (!desde.includes(f.estado)) return falla(409, "estado_no_permitido", "La versión " + version + " está «" + f.estado + "» y no puede pasar a «" + hacia + "».");
        const antes = hacia === "retirada" ? null : await retiraOtra(c, hacia, hogar);
        await c.query("UPDATE config_versiones SET estado = $2, estado_en = now(), estado_por = $3 WHERE version = $1", [version, hacia, hogar]);
        await audita(c, hogar, accion, antes ? { version, retira: antes } : { version });
        return { codigo: 200, cuerpo: { version, estado: hacia, retirada: antes }, publicar: hacia === "publicada" ? f.cuerpo : undefined };
      });
      if ("publicar" in r && r.publicar) escribeFichero(r.publicar);
      return { codigo: r.codigo, cuerpo: r.cuerpo };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return falla(409, "a_la_vez", "Otra persona ha cambiado la configuración a la vez. Vuelve a cargar el historial.");
      throw e;
    }
  }
  const responde = (rep: FastifyReply, r: Resultado) => rep.code(r.codigo).send(r.cuerpo);

  app.post<{ Params: { version: number } }>("/api/admin/config/:version/prueba", { preHandler: soloAdmin, config: LIMITE, schema: { params: VERSION } },
    async (req, rep) => responde(rep, await pasa(req.params.version, req.session.hogarId!, ["borrador"], "en_prueba", "config.en_prueba")));
  app.post<{ Params: { version: number } }>("/api/admin/config/:version/publicar", { preHandler: adminConfirmado, config: LIMITE, schema: { params: VERSION } },
    async (req, rep) => responde(rep, await pasa(req.params.version, req.session.hogarId!, ["en_prueba"], "publicada", "config.publicada")));
  app.post<{ Params: { version: number } }>("/api/admin/config/:version/retirar", { preHandler: soloAdmin, config: LIMITE, schema: { params: VERSION } },
    async (req, rep) => responde(rep, await pasa(req.params.version, req.session.hogarId!, ["borrador", "en_prueba"], "retirada", "config.retirada")));

  // volver: una COPIA de una versión vieja (no un borrador) nace publicada como versión nueva; la vieja no se toca
  app.post<{ Params: { version: number } }>("/api/admin/config/:version/volver", { preHandler: adminConfirmado, config: LIMITE, schema: { params: VERSION } }, async (req, rep) => {
    const yo = req.session.hogarId!, desde = req.params.version;
    try {
      const r = await enTransaccion(bd, async c => {
        const f = (await c.query<{ estado: EstadoConfig; cuerpo: Record<string, unknown> }>("SELECT estado, cuerpo FROM config_versiones WHERE version = $1", [desde])).rows[0];
        if (!f) return falla(404, "no_existe", "No hay ninguna versión con ese número.");
        if (f.estado === "borrador") return falla(409, "estado_no_permitido", "Un borrador no se publica volviendo a él: pásalo antes a prueba.");
        const err = validaConfig(f.cuerpo);
        if (err.length) return { codigo: 409, cuerpo: { error: "config_no_valida", mensaje: "Esa versión ya no cumple el contrato de hoy.", detalles: err } };
        const antes = await retiraOtra(c, "publicada", yo);
        const n = (await c.query<{ version: number }>(
          "INSERT INTO config_versiones (estado, cuerpo, nota, autor_id, copia_de, estado_por) VALUES ('publicada', $1, $2, $3, $4, $3) RETURNING version",
          [JSON.stringify(f.cuerpo), "vuelta a la v" + desde, yo, desde])).rows[0]!.version;
        await audita(c, yo, "config.vuelta", { version: n, copia_de: desde, retira: antes });
        return { codigo: 201, cuerpo: { version: n, estado: "publicada", copia_de: desde, retirada: antes }, publicar: f.cuerpo };
      });
      if ("publicar" in r && r.publicar) escribeFichero(r.publicar);
      return rep.code(r.codigo).send(r.cuerpo);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return rep.code(409).send({ error: "a_la_vez", mensaje: "Otra persona ha cambiado la configuración a la vez. Vuelve a cargar el historial." });
      throw e;
    }
  });
}
