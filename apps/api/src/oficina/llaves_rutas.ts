// Rutas de la llave de acceso de la oficina (OF13, contratos/sesion.md § Llave de acceso, api.openapi.yaml):
//   POST /api/oficina/llaves/alta/opciones      opciones para crear una llave (la primera vez, con la sesión del enlace)
//   POST /api/oficina/llaves/alta               verifica y guarda la llave; la sesión queda abierta con ella
//   POST /api/oficina/llaves/entrada/opciones   opciones para usar una llave de la propia cuenta
//   POST /api/oficina/llaves/entrada            verifica la aserción: abre la sesión de oficina y es la «confirmación reciente»
//   GET  /api/oficina/llaves                    las llaves de la propia cuenta
//   POST /api/oficina/llaves/:id/revocar        revoca una llave propia (con confirmación reciente; nunca la última)
//   GET  /api/admin/llaves                      (admin) las llaves de todas las cuentas de oficina
//   POST /api/admin/llaves/:id/revocar          (admin, confirmación reciente) revoca la llave de otra cuenta y cierra sus sesiones
//   POST /api/admin/hogares/:id/rehabilitar-llave (admin, confirmación reciente; nunca la propia) deja dar de alta una llave
//                                               con el enlace durante 24 h: el camino de recuperación, sin puerta trasera
// Las cuatro de la ceremonia valen con la sesión de oficina aún sin llave (requiereOficinaSinLlave); el resto, con la sesión entera.
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { FastifyInstance } from "fastify";
import { audita, esOficina, type Rol } from "../auth/servicio.ts";
import { enTransaccion } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { requiereConfirmacionReciente, requiereOficinaSinLlave, requiereRol, SIN_SESION } from "./acceso.ts";
import { nombreDeAparato } from "./aparatos.ts";
import {
  estadoLlaves, gastaReto, guardaReto, HORAS_REHABILITADA, llavesVivas, marcaSesionConLlave, MAX_LLAVES, nombreDeLlave,
  opcionesDeAlta, opcionesDeEntrada, permisoAlta, revocaLlave, usuarioDeLlave, verificaAlta, verificaEntrada,
} from "./llaves.ts";

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
const LIMITE_CEREMONIA = { rateLimit: { max: 20, timeWindow: 15 * 60_000 } };

export const TEXTO_ENTRA_CON_LLAVE = "Esta cuenta ya tiene una llave de acceso. Entra con ella para añadir otra; si las has perdido todas, pide a un admin que te rehabilite el alta.";
export const TEXTO_FALLO = "La llave no se pudo comprobar. Vuelve a intentarlo; si sigue fallando, usa otra llave o pide ayuda a un admin.";
export const TEXTO_SIN_RETO = "Ha pasado demasiado tiempo o se abrió otra petición. Vuelve a pulsar el botón.";

export async function rutasLlaves(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, config } = ctx;
  const c = config.llave;
  const sesionId = (req: { session: { idBd?: number } }) => req.session.idBd;

  // ---------------------------------------------------------------- alta
  app.post<{ Body: Record<string, never> }>("/api/oficina/llaves/alta/opciones", {
    preHandler: requiereOficinaSinLlave, config: LIMITE_CEREMONIA, schema: { body: VACIO },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const sid = sesionId(req), hogar = req.session.hogarId!;
    if (typeof sid !== "number") return rep.code(401).send(SIN_SESION);
    const permiso = permisoAlta(typeof req.session.llaveId === "number", await estadoLlaves(bd, hogar));
    if (permiso === "maximo") return rep.code(409).send({ error: "demasiadas_llaves", mensaje: "Ya tienes " + MAX_LLAVES + " llaves. Revoca alguna antes de añadir otra." });
    if (permiso !== "si") return rep.code(403).send({ error: "entra_con_llave", mensaje: TEXTO_ENTRA_CON_LLAVE });
    const cuenta = await usuarioDeLlave(bd, hogar);
    if (!cuenta) return rep.code(401).send(SIN_SESION);
    const o = await opcionesDeAlta(c, cuenta, await llavesVivas(bd, hogar));
    await guardaReto(bd, sid, "alta", o.challenge);
    return o;
  });

  app.post<{ Body: { nombre?: string; respuesta: RegistrationResponseJSON } }>("/api/oficina/llaves/alta", {
    preHandler: requiereOficinaSinLlave, config: LIMITE_CEREMONIA,
    schema: { body: { type: "object", additionalProperties: false, required: ["respuesta"], properties: { nombre: { type: "string", maxLength: 80 }, respuesta: RESPUESTA } } },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const sid = sesionId(req), hogar = req.session.hogarId!;
    if (typeof sid !== "number") return rep.code(401).send(SIN_SESION);
    const reto = await gastaReto(bd, sid, "alta");
    if (!reto) return rep.code(409).send({ error: "sin_reto", mensaje: TEXTO_SIN_RETO });
    const v = await verificaAlta(c, req.body.respuesta, reto);
    if (!v.ok) {
      await audita(bd, hogar, "oficina.llave_fallida", { ceremonia: "alta", motivo: v.motivo });
      return rep.code(400).send({ error: "llave_no_valida", mensaje: TEXTO_FALLO });
    }
    const nombre = nombreDeLlave(req.body.nombre, nombreDeAparato(req.headers["user-agent"]));
    // en una transacción y con la cuenta bloqueada: el permiso se vuelve a mirar (dos altas a la vez no se cuelan)
    const r = await enTransaccion(bd, async t => {
      await t.query("SELECT id FROM hogares WHERE id = $1 FOR UPDATE", [hogar]);
      const permiso = permisoAlta(typeof req.session.llaveId === "number", await estadoLlaves(t, hogar));
      if (permiso !== "si") return { error: permiso } as const;
      const ya = await t.query("SELECT 1 FROM llaves_oficina WHERE credencial_id = $1", [v.llave.credencialId]);
      if (ya.rowCount) return { error: "repetida" } as const;
      const i = await t.query<{ id: string }>(
        `INSERT INTO llaves_oficina (hogar_id, credencial_id, clave_publica, contador, transports, nombre, respaldada, aparato_id, ultima_vez_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
        [hogar, v.llave.credencialId, Buffer.from(v.llave.clavePublica), v.llave.contador, v.llave.transports, nombre, v.llave.respaldada, req.session.aparatoId ?? null]);
      const id = Number(i.rows[0]!.id);
      await t.query("UPDATE hogares SET llave_rehabilitada_hasta = NULL WHERE id = $1", [hogar]);
      await marcaSesionConLlave(t, sid, hogar, id);
      await audita(t, hogar, "oficina.llave_alta", { llave: id, aparato: req.session.aparatoId ?? null, respaldada: v.llave.respaldada });
      return { id } as const;
    });
    if ("error" in r) {
      if (r.error === "repetida") return rep.code(409).send({ error: "llave_repetida", mensaje: "Esa llave ya está dada de alta." });
      if (r.error === "maximo") return rep.code(409).send({ error: "demasiadas_llaves", mensaje: "Ya tienes " + MAX_LLAVES + " llaves." });
      return rep.code(403).send({ error: "entra_con_llave", mensaje: TEXTO_ENTRA_CON_LLAVE });
    }
    return rep.code(201).send({ id: r.id, nombre });
  });

  // ---------------------------------------------------------------- entrada (y confirmación reciente)
  app.post<{ Body: Record<string, never> }>("/api/oficina/llaves/entrada/opciones", {
    preHandler: requiereOficinaSinLlave, config: LIMITE_CEREMONIA, schema: { body: VACIO },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const sid = sesionId(req), hogar = req.session.hogarId!;
    if (typeof sid !== "number") return rep.code(401).send(SIN_SESION);
    const llaves = await llavesVivas(bd, hogar);
    if (!llaves.length) return rep.code(409).send({ error: "sin_llave", mensaje: "Esta cuenta no tiene ninguna llave de acceso viva." });
    const o = await opcionesDeEntrada(c, llaves);
    await guardaReto(bd, sid, "entrada", o.challenge);
    return o;
  });

  app.post<{ Body: { respuesta: AuthenticationResponseJSON } }>("/api/oficina/llaves/entrada", {
    preHandler: requiereOficinaSinLlave, config: LIMITE_CEREMONIA,
    schema: { body: { type: "object", additionalProperties: false, required: ["respuesta"], properties: { respuesta: RESPUESTA } } },
  }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const sid = sesionId(req), hogar = req.session.hogarId!;
    if (typeof sid !== "number") return rep.code(401).send(SIN_SESION);
    const reto = await gastaReto(bd, sid, "entrada");
    if (!reto) return rep.code(409).send({ error: "sin_reto", mensaje: TEXTO_SIN_RETO });
    // solo una llave viva DE ESTA CUENTA: la de otra cuenta (aunque sea válida) no abre esta sesión
    const llave = (await llavesVivas(bd, hogar)).find(l => l.credencialId === req.body.respuesta.id);
    const v = llave ? await verificaEntrada(c, req.body.respuesta, reto, llave) : { ok: false as const, motivo: "otra_llave" };
    if (!v.ok || !llave) {
      await audita(bd, hogar, "oficina.llave_fallida", { ceremonia: "entrada", motivo: v.ok ? "otra_llave" : v.motivo, llave: llave?.id ?? null });
      return rep.code(400).send({ error: "llave_no_valida", mensaje: TEXTO_FALLO });
    }
    await bd.query("UPDATE llaves_oficina SET contador = $2, ultima_vez_en = now() WHERE id = $1", [llave.id, v.contador]);
    await marcaSesionConLlave(bd, sid, hogar, llave.id);
    await audita(bd, hogar, "oficina.llave_entrada", { llave: llave.id, aparato: req.session.aparatoId ?? null, ya_tenia: typeof req.session.llaveId === "number" });
    return { ok: true, confirmacion_min: config.oficina.minConfirmacion };
  });

  // ---------------------------------------------------------------- gestión de las propias
  const OFICINA = [requiereRol("oficina", "admin")];
  const listaSql = `SELECT id, hogar_id, nombre, transports, respaldada, creada_en, ultima_vez_en, revocada_en, aparato_id
                      FROM llaves_oficina WHERE hogar_id = $1 ORDER BY revocada_en IS NOT NULL, id DESC LIMIT 50`;
  const fila = (f: Record<string, unknown>, esta?: number) => ({
    id: Number(f["id"]), nombre: f["nombre"], transports: f["transports"] ?? [], respaldada: f["respaldada"] === true,
    creada_en: f["creada_en"], ultima_vez_en: f["ultima_vez_en"], revocada_en: f["revocada_en"], es_esta: esta !== undefined && Number(f["id"]) === esta,
  });

  app.get("/api/oficina/llaves", { preHandler: OFICINA }, async (req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const r = await bd.query(listaSql, [req.session.hogarId]);
    return { obligatoria: c.obligatoria, llaves: r.rows.map(f => fila(f, req.session.llaveId)) };
  });

  app.post<{ Params: { id: number } }>("/api/oficina/llaves/:id/revocar", {
    preHandler: [requiereRol("oficina", "admin"), requiereConfirmacionReciente()], schema: { params: ID },
  }, async (req, rep) => {
    const hogar = req.session.hogarId!;
    const r = await enTransaccion(bd, async t => {
      await t.query("SELECT id FROM hogares WHERE id = $1 FOR UPDATE", [hogar]);
      const l = await t.query("SELECT 1 FROM llaves_oficina WHERE id = $1 AND hogar_id = $2 AND revocada_en IS NULL", [req.params.id, hogar]);
      if (!l.rowCount) return { error: "no_existe" } as const;
      // nunca la última propia: dejaría la cuenta fuera hasta que un admin la rehabilite
      if ((await estadoLlaves(t, hogar)).activas <= 1) return { error: "ultima_llave" } as const;
      const n = await revocaLlave(t, req.params.id, hogar);
      await audita(t, hogar, "oficina.llave_revocada", { llave: req.params.id, hogar, sesiones: n ?? 0 });
      return { sesiones: n ?? 0 } as const;
    });
    if ("error" in r) {
      if (r.error === "ultima_llave") return rep.code(409).send({ error: "ultima_llave", mensaje: "Es tu única llave: añade otra antes de revocar esta (o pide a un admin que lo haga)." });
      return rep.code(404).send({ error: "no_existe" });
    }
    return { sesiones_cerradas: r.sesiones, era_esta: req.session.llaveId === req.params.id };
  });

  // ---------------------------------------------------------------- admin
  const ADMIN = [requiereRol("admin")], ADMIN_CONFIRMADO = [requiereRol("admin"), requiereConfirmacionReciente()];

  app.get("/api/admin/llaves", { preHandler: ADMIN }, async (_req, rep) => {
    rep.header("cache-control", NO_GUARDAR);
    const cuentas = await bd.query<{ id: string; correo: string; rol: Rol; llave_rehabilitada_hasta: Date | null }>(
      "SELECT id, correo, rol, llave_rehabilitada_hasta FROM hogares WHERE rol::text IN ('oficina', 'admin') AND activo ORDER BY id LIMIT 100");
    const llaves = await bd.query(
      `SELECT id, hogar_id, nombre, transports, respaldada, creada_en, ultima_vez_en, revocada_en FROM llaves_oficina
        WHERE hogar_id = ANY($1::bigint[]) ORDER BY revocada_en IS NOT NULL, id DESC`, [cuentas.rows.map(f => f.id)]);
    return {
      obligatoria: c.obligatoria,
      cuentas: cuentas.rows.map(f => ({
        hogar_id: Number(f.id), correo: f.correo, rol: f.rol,
        rehabilitada_hasta: f.llave_rehabilitada_hasta && f.llave_rehabilitada_hasta > new Date() ? f.llave_rehabilitada_hasta : null,
        llaves: llaves.rows.filter(l => Number(l["hogar_id"]) === Number(f.id)).slice(0, 20).map(l => fila(l)),
      })),
    };
  });

  app.post<{ Params: { id: number } }>("/api/admin/llaves/:id/revocar", { preHandler: ADMIN_CONFIRMADO, schema: { params: ID } }, async (req, rep) => {
    const l = await bd.query<{ hogar_id: string; rol: Rol }>(
      "SELECT l.hogar_id, h.rol FROM llaves_oficina l JOIN hogares h ON h.id = l.hogar_id WHERE l.id = $1 AND l.revocada_en IS NULL", [req.params.id]);
    const f = l.rows[0];
    if (!f || !esOficina(f.rol)) return rep.code(404).send({ error: "no_existe" });
    const n = await revocaLlave(bd, req.params.id, req.session.hogarId!);
    if (n === null) return rep.code(404).send({ error: "no_existe" });
    await audita(bd, req.session.hogarId!, "oficina.llave_revocada", { llave: req.params.id, hogar: Number(f.hogar_id), sesiones: n });
    return { sesiones_cerradas: n, era_esta: req.session.llaveId === req.params.id };
  });

  app.post<{ Params: { id: number }; Body: { revocar_llaves?: boolean } }>("/api/admin/hogares/:id/rehabilitar-llave", {
    preHandler: ADMIN_CONFIRMADO,
    schema: { params: ID, body: { type: "object", additionalProperties: false, properties: { revocar_llaves: { type: "boolean" } } } },
  }, async (req, rep) => {
    const yo = req.session.hogarId!;
    // nunca la propia: quien ha perdido sus llaves no puede abrirse la puerta a sí mismo (otro admin, o la consola del servidor)
    if (req.params.id === yo) return rep.code(403).send({ error: "no_a_ti_mismo", mensaje: "No puedes rehabilitar tu propia llave: pídeselo a otro admin (o, si no lo hay, se hace desde la consola del servidor)." });
    const h = await bd.query<{ rol: Rol }>("SELECT rol FROM hogares WHERE id = $1 AND activo", [req.params.id]);
    if (!h.rows[0] || !esOficina(h.rows[0].rol)) return rep.code(404).send({ error: "no_existe" });
    const r = await enTransaccion(bd, async t => {
      let revocadas = 0, sesiones = 0;
      if (req.body?.revocar_llaves) {
        for (const l of await llavesVivas(t, req.params.id)) {
          const n = await revocaLlave(t, l.id, yo);
          if (n !== null) { revocadas++; sesiones += n; }
        }
      }
      const u = await t.query<{ hasta: Date }>(
        "UPDATE hogares SET llave_rehabilitada_hasta = now() + make_interval(hours => $2) WHERE id = $1 RETURNING llave_rehabilitada_hasta AS hasta", [req.params.id, HORAS_REHABILITADA]);
      await audita(t, yo, "oficina.llave_rehabilitada", { hogar: req.params.id, llaves_revocadas: revocadas, sesiones });
      return { hasta: u.rows[0]!.hasta, revocadas, sesiones };
    });
    return { rehabilitada_hasta: r.hasta, llaves_revocadas: r.revocadas, sesiones_cerradas: r.sesiones };
  });
}
