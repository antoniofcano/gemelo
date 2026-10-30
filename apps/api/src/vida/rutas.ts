// La «vida» de las hazas (decisiones 91-97; contrato: contratos/vida.md y api.openapi.yaml; datos personales:
// doc/sistema/VIDA.md): el titular personaliza los olivos de SU haza (nombre y una foto o pintura), cualquier hogar lo ve
// al momento con lista blanca y puede denunciarlo, y la oficina lo atiende desde su bandeja (retirar en un clic, pasar a
// OlivarTrack). Permisos:
//  - escribir (personalizar, subir, sugerir): sesión de TITULAR (nacida del enlace mágico, no de unas gafas vinculadas:
//    decisión 96) y solo en olivos que caen dentro de una haza asignada a su hogar;
//  - ver y denunciar: cualquier sesión (decisión 16);
//  - bandeja y retirar: rol admin (la oficina).
// Límites: por IP en cada ruta y, además, por hogar y hora (subidas y escrituras), con el mismo texto para todos.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requiereRol, requiereSesion } from "../auth/roles.ts";
import { audita, esOficina } from "../auth/servicio.ts";
import { enTransaccion } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { esquemaContrato } from "../hazas/rutas.ts";
import { limpia, revisaNombre, revisaTexto } from "./filtro.ts";
import { AVISO_VERSION, guardaFichero, borraFicheros, ImagenNoValida, procesaImagen, TIPOS_ADMITIDOS } from "./medios.ts";

export const TEXTO_SOLO_TITULAR = "Solo la persona titular del hogar, entrando con su enlace, puede cambiar los árboles de su haza.";
export const TEXTO_LIMITE_VIDA = "Has hecho muchos cambios seguidos. Espera un rato y vuelve a probar.";
const TEXTO_NOMBRE = "Ese nombre no se puede usar. Prueba con otro, sin enlaces, números de teléfono ni palabras gruesas.";
const TEXTO_TEXTO = "Quita los enlaces y los números largos (teléfonos, cuentas) del texto.";
const TEXTO_IMAGEN = "Solo se admiten fotos JPEG, PNG o WebP.";
const TEXTO_APAGADO = { error: "subidas_apagadas", mensaje: "Este servidor no admite fotos todavía." } as const;

const ID = { type: "integer", minimum: 1, maximum: 9007199254740991 } as const;
const PARAM_ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: ID } } as const;
const PARAM_OLIVO = {
  type: "object", additionalProperties: false, required: ["finca", "copas_id"],
  properties: { finca: { type: "string", pattern: "^[a-z0-9_-]{1,32}$" }, copas_id: { type: "integer", minimum: 0, maximum: 4294967295 } },
} as const;
export const MOTIVOS_DENUNCIA = ["menores", "datos_personales", "ofensivo", "no_es_del_olivar", "otro"] as const;
const url = (clave: string) => "/api/medios/" + clave;

interface FilaPublica { id: number; finca: string; copas_id: number; nombre: string | null; objeto_tipo: "foto" | "pintura" | null; clave: string | null; ancho: number | null; alto: number | null }

/** Lista blanca de lo que ve cualquier hogar de un olivo personalizado (contratos/olivos-haza.schema.json). */
export function olivoPublico(f: FilaPublica) {
  return {
    id: f.id, finca: f.finca, copas_id: f.copas_id, nombre: f.nombre,
    objeto: f.objeto_tipo && f.clave && f.ancho && f.alto ? { tipo: f.objeto_tipo, url: url(f.clave), ancho: f.ancho, alto: f.alto } : null,
  };
}

/** Sesión de titular: con sesión (401 si no) y nacida del enlace mágico (403 si es de un aparato vinculado). */
export async function soloTitular(req: FastifyRequest, rep: FastifyReply): Promise<void> {
  await requiereSesion(req, rep);
  if (rep.sent) return;
  if (req.session.origen === "vinculo") await rep.code(403).send({ error: "solo_titular", mensaje: TEXTO_SOLO_TITULAR });
}

type Respuesta = { codigo: number; cuerpo?: unknown };
const falla = (codigo: number, error: string, mensaje?: string): Respuesta => ({ codigo, cuerpo: mensaje ? { error, mensaje } : { error } });

export async function rutasVida(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const cfg = ctx.config.medios;
  const HORA = 3600_000;
  const limSubidas = app.createRateLimit({ max: cfg.subidasPorHora, timeWindow: HORA, keyGenerator: (r: FastifyRequest) => "subida:" + String(r.session?.hogarId ?? "?") });
  const limEscrituras = app.createRateLimit({ max: cfg.escriturasPorHora, timeWindow: HORA, keyGenerator: (r: FastifyRequest) => "vida:" + String(r.session?.hogarId ?? "?") });
  async function pasaLimite(lim: typeof limSubidas, req: FastifyRequest, rep: FastifyReply): Promise<boolean> {
    const r = await lim(req);
    if (!r.isAllowed && r.isExceeded) { await rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_VIDA }); return false; }
    return true;
  }
  const responde = (rep: FastifyReply, r: Respuesta) => (r.cuerpo === undefined ? rep.code(r.codigo).send() : rep.code(r.codigo).send(r.cuerpo));

  // ---------------------------------------------------------------- ver (cualquier sesión)
  app.get<{ Params: { id: number } }>("/api/hazas/:id/olivos", {
    preHandler: requiereSesion,
    schema: { params: PARAM_ID, response: { 200: esquemaContrato("olivos-haza.schema.json") } },
  }, async (req, rep) => {
    const h = await bd.query<{ id: number; es_mia: boolean }>("SELECT id, coalesce(hogar_id = $2, false) AS es_mia FROM hazas WHERE id = $1", [req.params.id, req.session.hogarId]);
    if (!h.rows[0]) return rep.code(404).send({ error: "no_existe" });
    // solo lo del titular ACTUAL de la haza: si la oficina la reasigna, lo del anterior deja de verse
    const r = await bd.query<FilaPublica>(
      `SELECT p.id, o.finca, o.copas_id, p.nombre, p.objeto_tipo, m.clave, m.ancho, m.alto
         FROM personalizaciones p JOIN hazas h ON h.id = p.haza_id JOIN olivos o ON o.id = p.olivo_id
         LEFT JOIN medios m ON m.id = p.medio_id
        WHERE p.haza_id = $1 AND p.estado = 'visible' AND p.hogar_id = h.hogar_id AND o.retirado_en IS NULL
        ORDER BY o.finca, o.copas_id LIMIT 5000`, [req.params.id]);
    rep.header("cache-control", "private, no-cache");
    return { haza_id: h.rows[0].id, es_mia: h.rows[0].es_mia, olivos: r.rows.map(olivoPublico) };
  });

  // El fichero, tras sesión y solo si se puede ver: colgado y visible en la haza de su titular actual, del diario visible,
  // subido por el propio hogar (para verlo antes de colgarlo) o pedido por la oficina. Retirar corta el acceso en el acto.
  app.get<{ Params: { clave: string } }>("/api/medios/:clave", {
    preHandler: requiereSesion,
    schema: { params: { type: "object", additionalProperties: false, required: ["clave"], properties: { clave: { type: "string", pattern: "^[a-f0-9]{32}\\.webp$" } } } },
  }, async (req, rep) => {
    if (!cfg.carpeta) return rep.code(404).send({ error: "no_existe" });
    const r = await bd.query<{ clave: string; tipo_mime: string }>(
      `SELECT m.clave, m.tipo_mime FROM medios m
        WHERE m.clave = $1 AND (m.hogar_id = $2 OR $3
           OR EXISTS (SELECT 1 FROM personalizaciones p JOIN hazas h ON h.id = p.haza_id
                       WHERE p.medio_id = m.id AND p.estado = 'visible' AND p.hogar_id = h.hogar_id)
           OR EXISTS (SELECT 1 FROM diario_haza d WHERE d.medio_id = m.id AND d.visible))`,
      [req.params.clave, req.session.hogarId, esOficina(req.session.rol)]);
    const f = r.rows[0];
    if (!f) return rep.code(404).send({ error: "no_existe" });
    let datos: Buffer;
    try { datos = await readFile(join(cfg.carpeta, f.clave)); } catch { return rep.code(404).send({ error: "no_existe" }); }
    return rep.type(f.tipo_mime).header("cache-control", "private, max-age=300")
      .header("content-security-policy", "default-src 'none'; sandbox").header("content-disposition", "inline").send(datos);
  });

  // ---------------------------------------------------------------- subir (titular)
  // Cuerpo: la imagen tal cual (Content-Type image/jpeg, image/png o image/webp), sin multipart. El aviso «sin caras de
  // menores ni datos personales» se acepta en la propia petición (?acepto=true): sin él, 400. Se mira la sesión ANTES de
  // leer el cuerpo (onRequest), para no recibir megas de quien no puede subir.
  await app.register(async sub => {
    sub.addContentTypeParser([...TIPOS_ADMITIDOS], { parseAs: "buffer", bodyLimit: cfg.maxBytes }, (_req, cuerpo, hecho) => hecho(null, cuerpo));
    sub.post<{ Querystring: { acepto: boolean } }>("/api/medios", {
      onRequest: soloTitular,
      bodyLimit: cfg.maxBytes,
      config: { rateLimit: { max: 30, timeWindow: 60_000 } },
      schema: { querystring: { type: "object", additionalProperties: false, required: ["acepto"], properties: { acepto: { type: "boolean", const: true } } } },
    }, async (req, rep) => {
      if (!cfg.carpeta) return rep.code(503).send(TEXTO_APAGADO);
      if (!(await pasaLimite(limSubidas, req, rep))) return rep;
      const tipo = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (!Buffer.isBuffer(req.body)) return rep.code(415).send({ error: "tipo_no_admitido", mensaje: TEXTO_IMAGEN });
      let img;
      try { img = await procesaImagen(req.body, tipo); } catch (e) {
        if (e instanceof ImagenNoValida) {
          return e.motivo === "demasiado_grande" ? rep.code(413).send({ error: "imagen_demasiado_grande", mensaje: "La imagen es demasiado grande." })
            : rep.code(415).send({ error: e.motivo, mensaje: TEXTO_IMAGEN });
        }
        throw e;
      }
      const clave = await guardaFichero(cfg.carpeta, img.datos);
      let id: number;
      try {
        id = (await bd.query<{ id: number }>(
          `INSERT INTO medios (clave, tipo_mime, bytes, ancho, alto, sha256, hogar_id, sesion_id, aviso_version, aviso_aceptado_en)
           VALUES ($1, 'image/webp', $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
          [clave, img.datos.length, img.ancho, img.alto, img.sha256, req.session.hogarId, req.session.idBd ?? null, AVISO_VERSION])).rows[0]!.id;
      } catch (e) { await borraFicheros(cfg.carpeta, [clave]); throw e; }
      await audita(bd, req.session.hogarId!, "vida.medio_subido", { medio: id, bytes: img.datos.length, aviso_version: AVISO_VERSION });
      return rep.code(201).send({ id, url: url(clave), ancho: img.ancho, alto: img.alto, bytes: img.datos.length });
    });
  });

  // ---------------------------------------------------------------- personalizar un olivo (titular, en su haza)
  type CuerpoOlivo = { nombre: string | null; objeto: { tipo: "foto" | "pintura"; medio_id: number } | null };
  app.put<{ Params: { finca: string; copas_id: number }; Body: CuerpoOlivo }>("/api/olivos/:finca/:copas_id", {
    preHandler: soloTitular,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: {
      params: PARAM_OLIVO,
      body: {
        type: "object", additionalProperties: false, required: ["nombre", "objeto"],
        properties: {
          nombre: { type: ["string", "null"], minLength: 1, maxLength: 40 },
          objeto: { type: ["object", "null"], additionalProperties: false, required: ["tipo", "medio_id"], properties: { tipo: { type: "string", enum: ["foto", "pintura"] }, medio_id: ID } },
        },
      },
    },
  }, async (req, rep) => {
    if (!(await pasaLimite(limEscrituras, req, rep))) return rep;
    const nombre = req.body.nombre === null ? null : limpia(req.body.nombre);
    if (nombre !== null && (nombre.length === 0 || nombre.length > 40 || revisaNombre(nombre))) return rep.code(400).send({ error: "nombre_no_valido", mensaje: TEXTO_NOMBRE });
    if (nombre === null && req.body.objeto === null) return rep.code(400).send({ error: "vacio", mensaje: "Para quitarlo todo, borra la personalización." });
    const yo = req.session.hogarId!;
    const r = await enTransaccion(bd, async c => {
      const o = (await c.query<{ id: number }>("SELECT id FROM olivos WHERE finca = $1 AND copas_id = $2 AND retirado_en IS NULL", [req.params.finca, req.params.copas_id])).rows[0];
      if (!o) return falla(404, "olivo_no_existe", "No hay ningún olivo con ese número.");
      const h = (await c.query<{ id: number }>(
        "SELECT h.id FROM hazas h JOIN olivos o ON ST_Intersects(h.geom, o.geom) WHERE o.id = $1 AND h.hogar_id = $2 ORDER BY h.id LIMIT 1", [o.id, yo])).rows[0];
      if (!h) return falla(403, "no_es_tu_haza", "Ese olivo no está en tu haza.");
      if (req.body.objeto) {
        const m = await c.query("SELECT 1 FROM medios WHERE id = $1 AND hogar_id = $2", [req.body.objeto.medio_id, yo]);
        if (!m.rowCount) return falla(400, "medio_no_valido", "Esa foto no es tuya o ya no existe.");
      }
      const tipo = req.body.objeto?.tipo ?? null, medio = req.body.objeto?.medio_id ?? null;
      const previa = (await c.query<{ id: number }>("SELECT id FROM personalizaciones WHERE olivo_id = $1 AND hogar_id = $2 AND estado = 'visible' FOR UPDATE", [o.id, yo])).rows[0];
      let id: number;
      if (previa) {
        await c.query("UPDATE personalizaciones SET nombre = $2, objeto_tipo = $3, medio_id = $4, haza_id = $5, sesion_id = $6, actualizada_en = now() WHERE id = $1",
          [previa.id, nombre, tipo, medio, h.id, req.session.idBd ?? null]);
        id = previa.id;
      } else {
        id = (await c.query<{ id: number }>(
          "INSERT INTO personalizaciones (olivo_id, haza_id, hogar_id, sesion_id, nombre, objeto_tipo, medio_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
          [o.id, h.id, yo, req.session.idBd ?? null, nombre, tipo, medio])).rows[0]!.id;
      }
      // a la bandeja como contenido nuevo (a la oficina le sirve de sugerencia, decisión 91), sin repetir si ya hay uno sin ver
      await c.query(
        `INSERT INTO bandeja (tipo, hogar_id, haza_id, olivo_id, personalizacion_id)
         SELECT 'contenido_nuevo', $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM bandeja WHERE personalizacion_id = $4 AND tipo = 'contenido_nuevo' AND estado = 'nueva')`,
        [yo, h.id, o.id, id]);
      await audita(c, yo, "vida.personalizacion", { personalizacion: id, olivo: o.id, objeto: tipo });
      return { codigo: 200, cuerpo: { id } };
    }).catch((e: { code?: string }) => { if (e.code === "23505") return falla(409, "a_la_vez", "Otro cambio en el mismo olivo se ha cruzado con este. Vuelve a probar."); throw e; });
    return responde(rep, r);
  });

  app.delete<{ Params: { finca: string; copas_id: number } }>("/api/olivos/:finca/:copas_id", {
    preHandler: soloTitular,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { params: PARAM_OLIVO },
  }, async (req, rep) => {
    const r = await bd.query<{ id: number }>(
      `UPDATE personalizaciones p SET estado = 'retirado', retirada_en = now(), retirada_por = $3, motivo_retirada = 'quitada por el hogar'
         FROM olivos o WHERE p.olivo_id = o.id AND o.finca = $1 AND o.copas_id = $2 AND p.hogar_id = $3 AND p.estado = 'visible' RETURNING p.id`,
      [req.params.finca, req.params.copas_id, req.session.hogarId]);
    if (!r.rows[0]) return rep.code(404).send({ error: "no_existe" });
    await audita(bd, req.session.hogarId!, "vida.personalizacion_quitada", { personalizacion: r.rows[0].id });
    return rep.code(204).send();
  });

  // ---------------------------------------------------------------- denunciar (cualquier sesión) y sugerir (titular)
  app.post<{ Params: { id: number }; Body: { motivo: (typeof MOTIVOS_DENUNCIA)[number]; texto?: string } }>("/api/personalizaciones/:id/denuncias", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: {
      params: PARAM_ID,
      body: { type: "object", additionalProperties: false, required: ["motivo"], properties: { motivo: { type: "string", enum: [...MOTIVOS_DENUNCIA] }, texto: { type: "string", minLength: 1, maxLength: 500 } } },
    },
  }, async (req, rep) => {
    if (!(await pasaLimite(limEscrituras, req, rep))) return rep;
    const texto = req.body.texto === undefined ? null : limpia(req.body.texto) || null;
    if (texto && revisaTexto(texto)) return rep.code(400).send({ error: "texto_no_valido", mensaje: TEXTO_TEXTO });
    const yo = req.session.hogarId!;
    const r = await enTransaccion(bd, async c => {
      const p = (await c.query<{ id: number; haza_id: number; olivo_id: number }>(
        `SELECT p.id, p.haza_id, p.olivo_id FROM personalizaciones p JOIN hazas h ON h.id = p.haza_id
          WHERE p.id = $1 AND p.estado = 'visible' AND p.hogar_id = h.hogar_id`, [req.params.id])).rows[0];
      if (!p) return falla(404, "no_existe");
      const d = (await c.query<{ id: number }>(
        "INSERT INTO denuncias (personalizacion_id, hogar_id, motivo, texto) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id",
        [p.id, yo, req.body.motivo, texto])).rows[0];
      if (!d) return falla(409, "ya_denunciado", "Ya lo habías denunciado: la oficina lo está mirando.");
      await c.query("INSERT INTO bandeja (tipo, hogar_id, haza_id, olivo_id, personalizacion_id, denuncia_id, texto) VALUES ('denuncia', $1, $2, $3, $4, $5, $6)",
        [yo, p.haza_id, p.olivo_id, p.id, d.id, texto]);
      await audita(c, yo, "vida.denuncia", { personalizacion: p.id, denuncia: d.id, motivo: req.body.motivo });
      return { codigo: 201, cuerpo: { id: d.id } };
    });
    return responde(rep, r);
  });

  app.post<{ Params: { id: number }; Body: { texto: string; finca?: string; copas_id?: number } }>("/api/hazas/:id/sugerencias", {
    preHandler: soloTitular,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: {
      params: PARAM_ID,
      body: {
        type: "object", additionalProperties: false, required: ["texto"],
        properties: { texto: { type: "string", minLength: 1, maxLength: 1000 }, finca: PARAM_OLIVO.properties.finca, copas_id: PARAM_OLIVO.properties.copas_id },
      },
    },
  }, async (req, rep) => {
    if (!(await pasaLimite(limEscrituras, req, rep))) return rep;
    const texto = limpia(req.body.texto);
    if ((req.body.finca === undefined) !== (req.body.copas_id === undefined) || !texto) return rep.code(400).send({ error: "entrada_no_valida", mensaje: "La petición no tiene la forma esperada." });
    if (revisaTexto(texto)) return rep.code(400).send({ error: "texto_no_valido", mensaje: TEXTO_TEXTO });
    const yo = req.session.hogarId!;
    const h = await bd.query("SELECT 1 FROM hazas WHERE id = $1 AND hogar_id = $2", [req.params.id, yo]);
    if (!h.rowCount) return rep.code(403).send({ error: "no_es_tu_haza", mensaje: "Solo puedes sugerir sobre tu haza." });
    let olivo: number | null = null;
    if (req.body.finca !== undefined) {
      const o = await bd.query<{ id: number }>(
        "SELECT o.id FROM olivos o JOIN hazas h ON ST_Intersects(h.geom, o.geom) WHERE h.id = $1 AND o.finca = $2 AND o.copas_id = $3", [req.params.id, req.body.finca, req.body.copas_id]);
      if (!o.rows[0]) return rep.code(400).send({ error: "olivo_no_valido", mensaje: "Ese olivo no está en tu haza." });
      olivo = o.rows[0].id;
    }
    const id = (await bd.query<{ id: number }>("INSERT INTO bandeja (tipo, hogar_id, haza_id, olivo_id, texto) VALUES ('sugerencia', $1, $2, $3, $4) RETURNING id",
      [yo, req.params.id, olivo, texto])).rows[0]!.id;
    await audita(bd, yo, "vida.sugerencia", { bandeja: id, haza: req.params.id });
    return rep.code(201).send({ id });
  });

  // ---------------------------------------------------------------- la oficina
  const soloAdmin = requiereRol("oficina", "admin");
  const ESTADOS = ["nueva", "vista", "pasada_ot", "descartada"] as const;

  app.get<{ Querystring: { estado?: (typeof ESTADOS)[number]; limite?: number } }>("/api/admin/bandeja", {
    preHandler: soloAdmin,
    schema: { querystring: { type: "object", additionalProperties: false, properties: { estado: { type: "string", enum: [...ESTADOS] }, limite: { type: "integer", minimum: 1, maximum: 500 } } } },
  }, async (req, rep) => {
    const r = await bd.query(
      `SELECT b.id, b.tipo, b.estado, b.creada_en, b.vista_en, b.decidida_en, b.ot_propuesta_id, b.texto, b.hogar_id, g.alias AS hogar_alias,
              hz.id AS haza_id, hz.codigo AS haza_codigo, o.finca, o.copas_id, d.motivo AS denuncia_motivo,
              p.id AS p_id, p.nombre AS p_nombre, p.objeto_tipo AS p_objeto_tipo, p.estado AS p_estado, p.motivo_retirada AS p_motivo, m.clave AS p_clave,
              (SELECT count(*)::int FROM denuncias x WHERE x.personalizacion_id = p.id AND x.resuelta_en IS NULL) AS p_denuncias
         FROM bandeja b
         LEFT JOIN hogares g ON g.id = b.hogar_id LEFT JOIN hazas hz ON hz.id = b.haza_id LEFT JOIN olivos o ON o.id = b.olivo_id
         LEFT JOIN denuncias d ON d.id = b.denuncia_id LEFT JOIN personalizaciones p ON p.id = b.personalizacion_id LEFT JOIN medios m ON m.id = p.medio_id
        WHERE ($1::text IS NULL OR b.estado = $1) ORDER BY b.id DESC LIMIT $2`, [req.query.estado ?? null, req.query.limite ?? 100]);
    rep.header("cache-control", "no-store");
    return {
      bandeja: r.rows.map(f => ({
        id: f.id, tipo: f.tipo, estado: f.estado, creada_en: f.creada_en, vista_en: f.vista_en, decidida_en: f.decidida_en, ot_propuesta_id: f.ot_propuesta_id,
        texto: f.texto, hogar_id: f.hogar_id, hogar_alias: f.hogar_alias,
        haza: f.haza_id === null ? null : { id: f.haza_id, codigo: f.haza_codigo },
        olivo: f.copas_id === null ? null : { finca: f.finca, copas_id: f.copas_id },
        denuncia_motivo: f.denuncia_motivo,
        contenido: f.p_id === null ? null : {
          id: f.p_id, nombre: f.p_nombre, objeto_tipo: f.p_objeto_tipo, url: f.p_clave ? url(f.p_clave) : null,
          estado: f.p_estado, motivo_retirada: f.p_motivo, denuncias_abiertas: f.p_denuncias,
        },
      })),
    };
  });

  // Cambiar el estado de una entrada. «pasada_ot» exige el id de la propuesta creada en OlivarTrack (el gemelo no escribe
  // allí por su cuenta, decisión 94). Descartar una denuncia la da por resuelta con «se mantiene».
  app.post<{ Params: { id: number }; Body: { estado: "vista" | "pasada_ot" | "descartada"; ot_propuesta_id?: string } }>("/api/admin/bandeja/:id/estado", {
    preHandler: soloAdmin,
    schema: {
      params: PARAM_ID,
      body: {
        type: "object", additionalProperties: false, required: ["estado"],
        properties: { estado: { type: "string", enum: ["vista", "pasada_ot", "descartada"] }, ot_propuesta_id: { type: "string", pattern: "^[A-Za-z0-9:_.-]{1,64}$" } },
      },
    },
  }, async (req, rep) => {
    const { estado } = req.body, ot = req.body.ot_propuesta_id ?? null;
    if ((estado === "pasada_ot") !== (ot !== null)) return rep.code(400).send({ error: "entrada_no_valida", mensaje: "«Pasada a OlivarTrack» lleva el id de la propuesta, y solo ella." });
    const yo = req.session.hogarId!;
    const r = await enTransaccion(bd, async c => {
      const b = (await c.query<{ tipo: string; denuncia_id: number | null }>(
        `UPDATE bandeja SET estado = $2, ot_propuesta_id = $3, vista_en = coalesce(vista_en, now()),
                decidida_en = CASE WHEN $2 = 'vista' THEN NULL ELSE now() END, decidida_por = CASE WHEN $2 = 'vista' THEN NULL ELSE $4::bigint END
          WHERE id = $1 RETURNING tipo, denuncia_id`, [req.params.id, estado, ot, yo])).rows[0];
      if (!b) return falla(404, "no_existe");
      if (b.tipo === "denuncia" && b.denuncia_id !== null && estado === "descartada") {
        await c.query("UPDATE denuncias SET resuelta_en = now(), resolucion = 'se_mantiene' WHERE id = $1 AND resuelta_en IS NULL", [b.denuncia_id]);
      }
      await audita(c, yo, "admin.bandeja", { bandeja: req.params.id, estado, ...(ot ? { ot_propuesta_id: ot } : {}) });
      return { codigo: 204 };
    });
    return responde(rep, r);
  });

  // Retirar en un clic (decisión 93): deja de verse y de servirse al momento; las denuncias quedan resueltas, lo pendiente
  // de la bandeja sobre ese contenido pasa a «vista», el hogar recibe un aviso y queda en la auditoría.
  app.post<{ Params: { id: number }; Body: { motivo: string } }>("/api/admin/personalizaciones/:id/retirar", {
    preHandler: soloAdmin,
    schema: { params: PARAM_ID, body: { type: "object", additionalProperties: false, required: ["motivo"], properties: { motivo: { type: "string", minLength: 1, maxLength: 200 } } } },
  }, async (req, rep) => {
    const motivo = limpia(req.body.motivo);
    if (!motivo) return rep.code(400).send({ error: "entrada_no_valida", mensaje: "Hace falta un motivo." });
    const yo = req.session.hogarId!;
    const r = await enTransaccion(bd, async c => {
      const p = (await c.query<{ id: number; hogar_id: number; haza_id: number }>(
        `UPDATE personalizaciones SET estado = 'retirado', retirada_en = now(), retirada_por = $2, motivo_retirada = $3
          WHERE id = $1 AND estado = 'visible' RETURNING id, hogar_id, haza_id`, [req.params.id, yo, motivo])).rows[0];
      if (!p) return falla(404, "no_existe");
      await c.query("UPDATE denuncias SET resuelta_en = now(), resolucion = 'retirado' WHERE personalizacion_id = $1 AND resuelta_en IS NULL", [p.id]);
      await c.query("UPDATE bandeja SET estado = 'vista', vista_en = coalesce(vista_en, now()) WHERE personalizacion_id = $1 AND estado = 'nueva'", [p.id]);
      const aviso = (await c.query<{ id: number }>(
        "INSERT INTO avisos (tipo, titulo, texto, haza_id, autor_id) VALUES ('contenido', 'La oficina ha retirado algo que colgaste en un olivo', $1, $2, $3) RETURNING id",
        ["Motivo: " + motivo, p.haza_id, yo])).rows[0]!.id;
      await c.query("INSERT INTO avisos_hogar (aviso_id, hogar_id) VALUES ($1, $2)", [aviso, p.hogar_id]);
      await audita(c, yo, "admin.contenido_retirado", { personalizacion: p.id, motivo });
      return { codigo: 204 };
    });
    return responde(rep, r);
  });
}
