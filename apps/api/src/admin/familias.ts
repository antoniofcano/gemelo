// Familias de la oficina (OF2, doc/sistema/OFICINA.md §3, decisiones 108 y 109). Rutas, todas con `requiereRol("oficina", "admin")`:
//   GET    /api/admin/hogares                  lista con búsqueda (correo, alias, nombre interno, haza), filtro de estado y paginación
//   POST   /api/admin/hogares                  alta (correo, rol, nombre interno, haza) y enlace de bienvenida; una cuenta de oficina: admin + confirmación reciente
//   PATCH  /api/admin/hogares/:id              nombre interno, quitar alias, cambiar rol (admin + confirmación reciente)
//   POST   /api/admin/hogares/:id/enlace       reenvía el enlace (mismos límites por correo que la entrada normal)
//   GET    /api/admin/hogares/:id/sesiones     sesiones abiertas (y aparatos de oficina, si es una cuenta de oficina)
//   DELETE /api/admin/sesiones/:id             cierra una sesión
//   PUT    /api/admin/hogares/:id/haza         asigna o quita su haza (si la tenía otra familia, se la quita y lo dice)
//   POST   /api/admin/hogares/:id/baja         baja: contenido oculto al momento, borrado a los 30 días (decisión 108)
//   POST   /api/admin/hogares/:id/reactivar    devuelve la cuenta y sus hazas (si siguen libres)
//   GET    /api/admin/hogares/:id/exportar     todos sus datos en JSON (RGPD)
//   DELETE /api/admin/hogares/:id              borra ya (RGPD): confirmación reciente y el correo escrito en el cuerpo
//   GET    /api/admin/hazas                    las hazas con su titular (solo oficina), para elegir
// El nombre interno (decisión 109) no sale por ninguna ruta de los hogares. Todo queda en la auditoría, sin correos en el detalle.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { enTransaccion } from "../bd/pool.ts";
import { mensajeDeBienvenida, mensajeDeEnlace } from "../auth/correo.ts";
import { TEXTO_LIMITE } from "../auth/rutas.ts";
import { audita, creaEnlace, esOficina, normalizaCorreo, ROLES, revocaTodas, type Rol } from "../auth/servicio.ts";
import type { Contexto } from "../contexto.ts";
import { huella } from "../seguridad/cripto.ts";
import { datosDelHogar } from "../yo/datos.ts";
import { borraFicheros, clavesDelHogar } from "../vida/medios.ts";
import { CONFIRMACION_REQUERIDA, OFICINA, OFICINA_CONFIRMADA, SIN_PERMISO } from "../oficina/acceso.ts";
import { DIAS_DE_BAJA } from "./bajas.ts";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;
/** Sin caracteres de control (ni saltos de línea): el nombre interno es una línea. */
const NOMBRE_INTERNO = { type: ["string", "null"], pattern: "^[^\\u0000-\\u001f\\u007f]{0,60}$" } as const;
export const ESTADOS = ["activa", "pendiente", "baja"] as const;
export type Estado = (typeof ESTADOS)[number];

/** Escapa % _ \ para usar el texto de la búsqueda dentro de un ILIKE ... ESCAPE '\'. */
export const escapaLike = (s: string): string => s.replace(/[\\%_]/g, c => "\\" + c);

/** Estado de una cuenta para la oficina: de baja; sin primer acceso (aún no aceptó las normas; las cuentas de oficina no lo hacen); activa. */
export function estadoDeCuenta(c: { activo: boolean; rol: Rol; normas_version: number | null }): Estado {
  if (!c.activo) return "baja";
  return !esOficina(c.rol) && c.normas_version === null ? "pendiente" : "activa";
}

const MENSAJE_ULTIMO_ADMIN = { error: "ultimo_admin", mensaje: "Es la única cuenta admin activa: sin ella nadie podría cambiar los roles. Da de alta otra antes." } as const;
const MENSAJE_A_TI_MISMO = { error: "a_ti_mismo", mensaje: "No puedes hacerlo con tu propia cuenta." } as const;

class HazaNoExiste extends Error {}
interface Objetivo { id: number; correo: string; rol: Rol; activo: boolean; normas_version: number | null }

export async function rutasFamilias(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, config, cartero } = ctx;
  const ventana = config.enlace.ventanaMin * 60_000;

  const objetivo = async (id: number): Promise<Objetivo | null> =>
    (await bd.query<Objetivo>("SELECT id, correo::text AS correo, rol, activo, normas_version FROM hogares WHERE id = $1", [id])).rows[0] ?? null;
  /** Tocar una cuenta de oficina (rol oficina o admin) es cosa de admin. */
  const vetado = (req: FastifyRequest, o: Objetivo): boolean => esOficina(o.rol) && req.session.rol !== "admin";
  const hayOtroAdmin = async (id: number): Promise<boolean> =>
    ((await bd.query<{ n: number }>("SELECT count(*)::int AS n FROM hogares WHERE rol = 'admin' AND activo AND id <> $1", [id])).rows[0]?.n ?? 0) > 0;

  // ---------------------------------------------------------------- lista
  app.get<{ Querystring: { q?: string; estado?: Estado; limite?: number; desde?: number } }>("/api/admin/hogares", {
    preHandler: OFICINA,
    schema: { querystring: { type: "object", additionalProperties: false, properties: {
      q: { type: "string", maxLength: 80 }, estado: { type: "string", enum: [...ESTADOS] },
      limite: { type: "integer", minimum: 1, maximum: 200 }, desde: { type: "integer", minimum: 0, maximum: 1_000_000 } } } },
  }, async (req, rep) => {
    const q = (req.query.q ?? "").trim();
    const r = await bd.query(
      `WITH f AS (
         SELECT g.id, g.correo::text AS correo, g.rol, g.alias, g.alias_visible, g.activo, g.nombre_interno, g.creado_en, g.baja_en,
                g.avisos_correo, g.normas_version, g.normas_aceptadas_en,
                CASE WHEN NOT g.activo THEN 'baja' WHEN g.rol::text NOT IN ('oficina', 'admin') AND g.normas_version IS NULL THEN 'pendiente' ELSE 'activa' END AS estado,
                CASE WHEN g.baja_en IS NOT NULL THEN g.baja_en + make_interval(days => $5) END AS borrado_en,
                coalesce((SELECT array_agg(h.codigo ORDER BY h.codigo) FROM hazas h WHERE h.hogar_id = g.id), '{}') AS hazas,
                (SELECT count(*)::int FROM sesiones s WHERE s.hogar_id = g.id AND s.revocada_en IS NULL AND s.expira_en > now()) AS sesiones
           FROM hogares g)
       SELECT *, (count(*) OVER ())::int AS total FROM f
        WHERE ($1::text = '' OR correo ILIKE '%' || $1 || '%' ESCAPE '\\' OR alias ILIKE '%' || $1 || '%' ESCAPE '\\' OR nombre_interno ILIKE '%' || $1 || '%' ESCAPE '\\'
               OR EXISTS (SELECT 1 FROM hazas h WHERE h.hogar_id = f.id AND (h.codigo ILIKE '%' || $1 || '%' ESCAPE '\\' OR h.nombre ILIKE '%' || $1 || '%' ESCAPE '\\')))
          AND ($2::text IS NULL OR estado = $2)
        ORDER BY creado_en DESC, id DESC LIMIT $3 OFFSET $4`,
      [escapaLike(q), req.query.estado ?? null, req.query.limite ?? 100, req.query.desde ?? 0, DIAS_DE_BAJA]);
    rep.header("cache-control", "no-store");
    const filas = r.rows as { total: number }[];
    return { hogares: filas.map(({ total: _t, ...fila }) => fila), total: filas[0]?.total ?? 0 };
  });

  app.get("/api/admin/hazas", { preHandler: OFICINA }, async (_req, rep) => {
    const r = await bd.query(
      `SELECT h.id, h.codigo, h.nombre, h.finca, h.hogar_id, g.correo::text AS hogar_correo
         FROM hazas h LEFT JOIN hogares g ON g.id = h.hogar_id ORDER BY h.codigo`);
    rep.header("cache-control", "no-store");
    return { hazas: r.rows };
  });

  // ---------------------------------------------------------------- alta
  app.post<{ Body: { correo: string; rol: Rol; nombre_interno?: string | null; haza_id?: number | null; enviar?: boolean } }>("/api/admin/hogares", {
    preHandler: OFICINA,
    schema: { body: { type: "object", additionalProperties: false, required: ["correo", "rol"], properties: {
      correo: { type: "string", maxLength: 254 }, rol: { type: "string", enum: [...ROLES] }, nombre_interno: NOMBRE_INTERNO,
      haza_id: { type: ["integer", "null"], minimum: 1, maximum: 2147483647 }, enviar: { type: "boolean" } } } },
  }, async (req, rep) => {
    if (esOficina(req.body.rol)) {
      if (req.session.rol !== "admin") return rep.code(403).send(SIN_PERMISO);
      if (req.session.confirmacionVigente !== true) return rep.code(403).send(CONFIRMACION_REQUERIDA);
    }
    const correo = normalizaCorreo(req.body.correo);
    if (!correo) return rep.code(400).send({ error: "correo_no_valido", mensaje: "Ese correo no parece completo. Revisa que tenga @ y un dominio." });
    const nombre = req.body.nombre_interno?.trim() || null;
    let hogarId: number, quitadaA: number | null = null;
    try {
      const res = await enTransaccion(bd, async c => {
        const ins = await c.query<{ id: number }>("INSERT INTO hogares (correo, rol, nombre_interno) VALUES ($1, $2, $3) RETURNING id", [correo, req.body.rol, nombre]);
        const id = ins.rows[0]!.id;
        let otra: number | null = null;
        if (req.body.haza_id) {
          const h = await c.query<{ hogar_id: number | null }>("SELECT hogar_id FROM hazas WHERE id = $1 FOR UPDATE", [req.body.haza_id]);
          if (!h.rows[0]) throw new HazaNoExiste();   // lanzar (no devolver): así la transacción deshace también el alta
          otra = h.rows[0].hogar_id;
          await c.query("UPDATE hazas SET hogar_id = $1, actualizada_en = now() WHERE id = $2", [id, req.body.haza_id]);
        }
        await audita(c, req.session.hogarId!, "admin.hogar_creado", { hogar: id, rol: req.body.rol, haza: req.body.haza_id ?? null });
        return { id, otra };
      });
      hogarId = res.id; quitadaA = res.otra;
    } catch (e) {
      if (e instanceof HazaNoExiste) return rep.code(400).send({ error: "haza_no_existe", mensaje: "Esa haza no existe." });
      if ((e as { code?: string }).code === "23505") return rep.code(409).send({ error: "ya_existe", mensaje: "Ya hay una cuenta con ese correo." });
      throw e;
    }
    let enlaceEnviado = false;
    if (req.body.enviar !== false) enlaceEnviado = await mandaEnlace(correo, true, req);
    return rep.code(201).send({ id: hogarId, enlace_enviado: enlaceEnviado, haza_quitada_a: quitadaA });
  });

  /** Crea un enlace y lo manda. false si el correo falla (la cuenta ya está creada: la oficina puede reenviar). */
  async function mandaEnlace(correo: string, bienvenida: boolean, req: FastifyRequest): Promise<boolean> {
    const enlace = await creaEnlace(bd, correo, config.enlace.minutos);
    if (!enlace) return false;
    const url = config.urlPublica + "/api/auth/entrar?t=" + enlace.token;
    try {
      await cartero.envia((bienvenida ? mensajeDeBienvenida : mensajeDeEnlace)(correo, url, config.enlace.minutos));
      return true;
    } catch (e) {
      req.log.error({ evento: "correo_fallido", hogar: enlace.hogarId, error: e instanceof Error ? e.message : "?" }, "no se pudo mandar el enlace");
      return false;
    }
  }

  // ---------------------------------------------------------------- cambios en la ficha
  app.patch<{ Params: { id: number }; Body: { nombre_interno?: string | null; quitar_alias?: true; rol?: Rol } }>("/api/admin/hogares/:id", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, minProperties: 1, properties: {
      nombre_interno: NOMBRE_INTERNO, quitar_alias: { type: "boolean", enum: [true] }, rol: { type: "string", enum: [...ROLES] } } } },
  }, async (req, rep) => {
    const o = await objetivo(req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    if (vetado(req, o)) return rep.code(403).send(SIN_PERMISO);
    const b = req.body;
    if (b.rol !== undefined && b.rol !== o.rol) {
      // cambiar un rol: solo admin y con confirmación reciente (ADR-0024); nunca el propio, y siempre queda un admin
      if (req.session.rol !== "admin") return rep.code(403).send(SIN_PERMISO);
      if (req.session.confirmacionVigente !== true) return rep.code(403).send(CONFIRMACION_REQUERIDA);
      if (o.id === req.session.hogarId) return rep.code(409).send(MENSAJE_A_TI_MISMO);
      if (o.rol === "admin" && !(await hayOtroAdmin(o.id))) return rep.code(409).send(MENSAJE_ULTIMO_ADMIN);
      await bd.query("UPDATE hogares SET rol = $1 WHERE id = $2", [b.rol, o.id]);
      const n = await revocaTodas(bd, o.id);   // entra con el rol nuevo (y, si pasa a oficina, con su aparato)
      await audita(bd, req.session.hogarId!, "admin.rol_cambiado", { hogar: o.id, de: o.rol, a: b.rol, sesiones: n });
    }
    if (b.nombre_interno !== undefined) {
      await bd.query("UPDATE hogares SET nombre_interno = $1 WHERE id = $2", [b.nombre_interno?.trim() || null, o.id]);
      await audita(bd, req.session.hogarId!, "admin.nombre_interno", { hogar: o.id });
    }
    if (b.quitar_alias) {
      await bd.query("UPDATE hogares SET alias = NULL, alias_visible = false WHERE id = $1", [o.id]);
      await audita(bd, req.session.hogarId!, "admin.alias_quitado", { hogar: o.id });
    }
    return rep.code(204).send();
  });

  // ---------------------------------------------------------------- enlace
  const porCuenta = app.createRateLimit({
    max: config.enlace.porCorreo, timeWindow: ventana,
    keyGenerator: (req: FastifyRequest) => "reenvio:" + huella(String((req.params as { id: number }).id)),
  });
  app.post<{ Params: { id: number } }>("/api/admin/hogares/:id/enlace", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const o = await objetivo(req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    if (vetado(req, o)) return rep.code(403).send(SIN_PERMISO);
    if (!o.activo) return rep.code(409).send({ error: "de_baja", mensaje: "La cuenta está de baja: reactívala antes de mandarle un enlace." });
    const lim = await porCuenta(req);
    if (!lim.isAllowed && lim.isExceeded) return rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE });
    const ok = await mandaEnlace(o.correo, estadoDeCuenta(o) === "pendiente", req);
    if (!ok) return rep.code(502).send({ error: "correo_no_enviado", mensaje: "No se pudo mandar el correo. Inténtalo de nuevo en unos minutos." });
    await audita(bd, req.session.hogarId!, "admin.enlace_reenviado", { hogar: o.id });
    return rep.code(202).send({ mensaje: "Enlace mandado; caduca en " + config.enlace.minutos + " minutos." });
  });

  // ---------------------------------------------------------------- sesiones y aparatos
  app.get<{ Params: { id: number } }>("/api/admin/hogares/:id/sesiones", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const o = await objetivo(req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    const s = await bd.query(
      `SELECT id, coalesce(aparato_nombre, 'Aparato') AS aparato, origen = 'vinculo' AS por_codigo_corto, creada_en, ultima_actividad_en, expira_en
         FROM sesiones WHERE hogar_id = $1 AND revocada_en IS NULL AND expira_en > now() ORDER BY ultima_actividad_en DESC`, [o.id]);
    const ap = esOficina(o.rol)
      ? (await bd.query(
          `SELECT id, nombre, CASE WHEN aprobado_en IS NULL THEN 'pendiente' ELSE 'aprobado' END AS estado, creado_en, ultimo_uso_en
             FROM aparatos_oficina WHERE hogar_id = $1 AND revocado_en IS NULL ORDER BY id DESC`, [o.id])).rows
      : [];
    rep.header("cache-control", "no-store");
    return { sesiones: s.rows, aparatos_oficina: ap };
  });

  app.delete<{ Params: { id: number } }>("/api/admin/sesiones/:id", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const r = await bd.query<{ hogar_id: number; rol: Rol }>(
      "SELECT s.hogar_id, h.rol FROM sesiones s JOIN hogares h ON h.id = s.hogar_id WHERE s.id = $1 AND s.revocada_en IS NULL", [req.params.id]);
    const f = r.rows[0];
    if (!f) return rep.code(404).send({ error: "no_existe" });
    if (esOficina(f.rol) && req.session.rol !== "admin" && f.hogar_id !== req.session.hogarId) return rep.code(403).send(SIN_PERMISO);
    await bd.query("UPDATE sesiones SET revocada_en = now() WHERE id = $1 AND revocada_en IS NULL", [req.params.id]);
    await audita(bd, req.session.hogarId!, "admin.sesion_cerrada", { hogar: f.hogar_id, sesion: req.params.id });
    return rep.code(204).send();
  });

  // ---------------------------------------------------------------- haza
  app.put<{ Params: { id: number }; Body: { haza_id: number | null } }>("/api/admin/hogares/:id/haza", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["haza_id"], properties: { haza_id: { type: ["integer", "null"], minimum: 1, maximum: 2147483647 } } } },
  }, async (req, rep) => {
    const o = await objetivo(req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    if (!o.activo) return rep.code(409).send({ error: "de_baja", mensaje: "La cuenta está de baja: reactívala antes de asignarle una haza." });
    const res = await enTransaccion(bd, async c => {
      let quitadaA: { id: number; correo: string } | null = null;
      if (req.body.haza_id !== null) {
        const h = await c.query<{ hogar_id: number | null }>("SELECT hogar_id FROM hazas WHERE id = $1 FOR UPDATE", [req.body.haza_id]);
        if (!h.rows[0]) return "no_existe" as const;
        const otra = h.rows[0].hogar_id;
        if (otra !== null && otra !== o.id) {
          quitadaA = { id: otra, correo: (await c.query<{ correo: string }>("SELECT correo::text AS correo FROM hogares WHERE id = $1", [otra])).rows[0]?.correo ?? "" };
        }
      }
      // un hogar tiene su haza (decisión 91): asignar una suelta las que tuviera
      const suelta = await c.query("UPDATE hazas SET hogar_id = NULL, actualizada_en = now() WHERE hogar_id = $1 AND id IS DISTINCT FROM $2", [o.id, req.body.haza_id]);
      if (req.body.haza_id !== null) await c.query("UPDATE hazas SET hogar_id = $1, actualizada_en = now() WHERE id = $2", [o.id, req.body.haza_id]);
      await audita(c, req.session.hogarId!, "admin.haza_asignada", { hogar: o.id, haza: req.body.haza_id, quitada_a: quitadaA?.id ?? null });
      return { quitada_a: quitadaA, soltadas: suelta.rowCount ?? 0 };
    });
    if (res === "no_existe") return rep.code(404).send({ error: "haza_no_existe", mensaje: "Esa haza no existe." });
    return rep.header("cache-control", "no-store").send({ haza_id: req.body.haza_id, ...res });
  });

  // ---------------------------------------------------------------- baja y reactivación (decisión 108)
  app.post<{ Params: { id: number } }>("/api/admin/hogares/:id/baja", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const o = await objetivo(req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    if (vetado(req, o)) return rep.code(403).send(SIN_PERMISO);
    if (o.id === req.session.hogarId) return rep.code(409).send(MENSAJE_A_TI_MISMO);
    if (!o.activo) return rep.code(409).send({ error: "ya_de_baja", mensaje: "La cuenta ya está de baja." });
    if (o.rol === "admin" && !(await hayOtroAdmin(o.id))) return rep.code(409).send(MENSAJE_ULTIMO_ADMIN);
    const res = await enTransaccion(bd, async c => {
      const hz = await c.query<{ id: number }>("SELECT id FROM hazas WHERE hogar_id = $1 ORDER BY id FOR UPDATE", [o.id]);
      await c.query("UPDATE hogares SET activo = false, baja_en = now(), baja_hazas = $2 WHERE id = $1", [o.id, hz.rows.map(h => h.id)]);
      await c.query("UPDATE hazas SET hogar_id = NULL, actualizada_en = now() WHERE hogar_id = $1", [o.id]);   // lo que se ve del mundo cuelga de la haza: oculto al momento
      const s = await c.query("UPDATE sesiones SET revocada_en = now() WHERE hogar_id = $1 AND revocada_en IS NULL", [o.id]);
      await c.query("UPDATE aparatos_oficina SET revocado_en = now() WHERE hogar_id = $1 AND revocado_en IS NULL", [o.id]);
      await c.query("UPDATE tokens_acceso SET usado_en = now() WHERE hogar_id = $1 AND usado_en IS NULL", [o.id]);
      await audita(c, req.session.hogarId!, "admin.hogar_baja", { hogar: o.id, hazas: hz.rows.length, sesiones: s.rowCount ?? 0 });
      return (await c.query<{ borrado_en: string }>("SELECT baja_en + make_interval(days => $2) AS borrado_en FROM hogares WHERE id = $1", [o.id, DIAS_DE_BAJA])).rows[0]!;
    });
    return rep.header("cache-control", "no-store").send(res);
  });

  app.post<{ Params: { id: number } }>("/api/admin/hogares/:id/reactivar", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const o = await objetivo(req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    if (vetado(req, o)) return rep.code(403).send(SIN_PERMISO);
    if (o.activo) return rep.code(409).send({ error: "no_esta_de_baja", mensaje: "La cuenta no está de baja." });
    const n = await enTransaccion(bd, async c => {
      const b = await c.query<{ baja_hazas: number[] }>("SELECT baja_hazas FROM hogares WHERE id = $1 FOR UPDATE", [o.id]);
      await c.query("UPDATE hogares SET activo = true, baja_en = NULL, baja_hazas = '{}' WHERE id = $1", [o.id]);
      // las hazas que tenía vuelven si siguen sin titular (si la oficina se la dio a otra familia, no se pisa)
      const ids = (b.rows[0]?.baja_hazas ?? []).map(Number);
      const dev = ids.length ? await c.query("UPDATE hazas SET hogar_id = $1, actualizada_en = now() WHERE id = ANY($2::bigint[]) AND hogar_id IS NULL", [o.id, ids]) : null;
      await audita(c, req.session.hogarId!, "admin.hogar_reactivado", { hogar: o.id, hazas: dev?.rowCount ?? 0 });
      return dev?.rowCount ?? 0;
    });
    return rep.header("cache-control", "no-store").send({ hazas_devueltas: n });
  });

  // ---------------------------------------------------------------- RGPD
  app.get<{ Params: { id: number } }>("/api/admin/hogares/:id/exportar", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const o = await objetivo(req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    if (vetado(req, o)) return rep.code(403).send(SIN_PERMISO);
    const datos = await datosDelHogar(bd, o.id);
    if (!datos) return rep.code(404).send({ error: "no_existe" });
    const interno = (await bd.query<{ nombre_interno: string | null; baja_en: string | null }>("SELECT nombre_interno, baja_en FROM hogares WHERE id = $1", [o.id])).rows[0];
    await audita(bd, req.session.hogarId!, "admin.datos_exportados", { hogar: o.id });
    rep.header("cache-control", "no-store").header("content-disposition", "attachment; filename=\"datos-hogar-" + o.id + ".json\"");
    return { ...datos, hogar: { ...(datos["hogar"] as object), nombre_interno: interno?.nombre_interno ?? null, baja_en: interno?.baja_en ?? null } };
  });

  app.delete<{ Params: { id: number }; Body: { correo: string } }>("/api/admin/hogares/:id", {
    preHandler: OFICINA_CONFIRMADA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["correo"], properties: { correo: { type: "string", maxLength: 254 } } } },
  }, async (req, rep) => {
    const o = await objetivo(req.params.id);
    if (!o) return rep.code(404).send({ error: "no_existe" });
    if (vetado(req, o)) return rep.code(403).send(SIN_PERMISO);
    if (normalizaCorreo(req.body.correo) !== o.correo.toLowerCase()) {
      return rep.code(400).send({ error: "correo_no_coincide", mensaje: "El correo escrito no es el de la cuenta. Para borrar hay que escribirlo tal cual." });
    }
    if (o.id === req.session.hogarId) return rep.code(409).send(MENSAJE_A_TI_MISMO);
    if (o.rol === "admin" && o.activo && !(await hayOtroAdmin(o.id))) return rep.code(409).send(MENSAJE_ULTIMO_ADMIN);
    const claves = await clavesDelHogar(bd, o.id);
    const r = await bd.query("DELETE FROM hogares WHERE id = $1", [o.id]);
    if (!r.rowCount) return rep.code(404).send({ error: "no_existe" });
    await borraFicheros(ctx.config.medios.carpeta, claves);
    await audita(bd, req.session.hogarId!, "hogar.borrado", { por: "oficina" });
    return rep.code(204).send();
  });
}
