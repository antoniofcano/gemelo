// Lo del propio hogar: alias (y si se muestra en sus hazas), avatar, descargar sus datos y borrar la cuenta (RGPD).
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import { NOMBRE_COOKIE, OPCIONES_COOKIE, TEXTO_LIMITE_VINCULO } from "../auth/rutas.ts";
import { audita, esOficina, NORMAS_VERSION } from "../auth/servicio.ts";
import { decideCodigo, PATRON_ENTRADA } from "../auth/vinculo.ts";
import type { Contexto } from "../contexto.ts";
import { borraFicheros, clavesDelHogar } from "../vida/medios.ts";

// 3–20 letras, números, espacios y guiones (doc/sistema/UX.md §4.6)
const PATRON_ALIAS = "^[\\p{L}\\p{N}][\\p{L}\\p{N} -]{1,18}[\\p{L}\\p{N}]$";
const RESERVADOS = /^(guia|guía|admin|administracion|administración|oficina|corresponsal|olivartrack)$/i;

export const TEXTO_CODIGO_MALO = "Ese código no sirve: puede que haya caducado o que tenga un error. Escribe el que enseñan ahora las gafas.";

export async function rutasYo(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd, config } = ctx;
  const ventanaVinculo = config.vinculo.ventanaMin * 60_000;
  // intentos de aprobar por hogar (además del límite por IP de la ruta): con 31^6 códigos posibles, adivinar uno vivo es inviable
  const porHogar = app.createRateLimit({
    max: config.vinculo.intentosPorHogar, timeWindow: ventanaVinculo,
    keyGenerator: (req: FastifyRequest) => "vinculo:" + String(req.session?.hogarId ?? "?"),
  });

  // Primer acceso (UX.md §4.5): el hogar acepta la versión vigente de las normas y dice si quiere avisos por correo.
  app.put<{ Body: { version: number; avisos_correo: boolean } }>("/api/yo/normas", {
    preHandler: requiereSesion,
    schema: { body: { type: "object", additionalProperties: false, required: ["version", "avisos_correo"], properties: { version: { type: "integer", minimum: 1, maximum: 32767 }, avisos_correo: { type: "boolean" } } } },
  }, async (req, rep) => {
    if (req.body.version !== NORMAS_VERSION) {
      return rep.code(409).send({ error: "normas_cambiaron", mensaje: "Las normas han cambiado mientras las leías. Vuelve a cargar la página para ver las nuevas." });
    }
    await bd.query("UPDATE hogares SET normas_version = $1, normas_aceptadas_en = now(), avisos_correo = $2 WHERE id = $3",
      [NORMAS_VERSION, req.body.avisos_correo, req.session.hogarId]);
    await audita(bd, req.session.hogarId!, "yo.normas", { version: NORMAS_VERSION, avisos_correo: req.body.avisos_correo });
    return rep.code(204).send();
  });

  // Configuración → Mis dispositivos → Vincular (contratos/sesion.md § Código corto): aprobar o rechazar el código de unas gafas.
  app.post<{ Body: { codigo: string; aprobar: boolean } }>("/api/yo/dispositivos/vincular", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: config.vinculo.intentosPorIp, timeWindow: ventanaVinculo } },
    schema: { body: { type: "object", additionalProperties: false, required: ["codigo", "aprobar"], properties: { codigo: { type: "string", pattern: PATRON_ENTRADA }, aprobar: { type: "boolean" } } } },
  }, async (req, rep) => {
    // la oficina no vincula gafas con el código corto: su sesión exige un aparato confiable y el enlace (ADR-0024)
    if (esOficina(req.session.rol)) return rep.code(403).send({ error: "sin_permiso", mensaje: "Las cuentas de la oficina no vinculan aparatos con el código corto." });
    const lim = await porHogar(req);
    if (!lim.isAllowed && lim.isExceeded) return rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_VINCULO });
    const ok = await decideCodigo(bd, config.sesion.secreto, req.session.hogarId!, req.body.codigo, req.body.aprobar);
    // la misma respuesta si no existe, si caducó o si ya se decidió: no se puede averiguar qué códigos hay
    if (!ok) return rep.code(404).send({ error: "codigo_no_valido", mensaje: TEXTO_CODIGO_MALO });
    return rep.code(204).send();
  });

  app.put<{ Body: { alias: string; visible: boolean } }>("/api/yo/alias", {
    preHandler: requiereSesion,
    schema: { body: { type: "object", additionalProperties: false, required: ["alias", "visible"], properties: { alias: { type: "string", pattern: PATRON_ALIAS }, visible: { type: "boolean" } } } },
  }, async (req, rep) => {
    const alias = req.body.alias.trim().replace(/\s+/g, " ");
    // nada que parezca un teléfono (6 cifras o más seguidas) ni nombres reservados
    if (RESERVADOS.test(alias) || /\d{6,}/.test(alias.replace(/[ -]/g, ""))) {
      return rep.code(400).send({ error: "alias_no_valido", mensaje: "Ese alias no se puede usar. Prueba con otro." });
    }
    try {
      await bd.query("UPDATE hogares SET alias = $1, alias_visible = $2 WHERE id = $3", [alias, req.body.visible, req.session.hogarId]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return rep.code(409).send({ error: "alias_ocupado", mensaje: "Ese alias ya lo usa otro hogar." });
      throw e;
    }
    await audita(bd, req.session.hogarId!, "yo.alias");
    return rep.code(204).send();
  });

  // Lo que el hogar tiene elegido (la portada lo lee de vuelta); sin fila, 404 y la portada parte de los valores por defecto.
  app.get("/api/yo/avatar", { preHandler: requiereSesion }, async (req, rep) => {
    const r = await bd.query("SELECT camisa, sombrero, piel, vrm FROM avatares WHERE hogar_id = $1", [req.session.hogarId]);
    if (!r.rows[0]) return rep.code(404).send({ error: "sin_avatar", mensaje: "Todavía no has elegido avatar." });
    return rep.header("cache-control", "no-store").send(r.rows[0]);
  });

  // `vrm` (opcional): id del catálogo de avatares; ausente o null = el muñeco de bloque. camisa/sombrero/piel se guardan
  // siempre: son el muñeco lejano y la caída cuando el VRM no carga.
  app.put<{ Body: { camisa: number; sombrero: string; piel: number; vrm?: string | null } }>("/api/yo/avatar", {
    preHandler: requiereSesion,
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["camisa", "sombrero", "piel"],
        properties: {
          camisa: { type: "integer", minimum: 0, maximum: 5 }, sombrero: { type: "string", enum: ["ninguno", "paja", "gorra"] }, piel: { type: "integer", minimum: 0, maximum: 4 },
          vrm: { type: ["string", "null"], pattern: "^[a-z0-9-]{1,32}$" },
        },
      },
    },
  }, async (req, rep) => {
    await bd.query(
      `INSERT INTO avatares (hogar_id, camisa, sombrero, piel, vrm) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (hogar_id) DO UPDATE SET camisa = $2, sombrero = $3, piel = $4, vrm = $5, actualizado_en = now()`,
      [req.session.hogarId, req.body.camisa, req.body.sombrero, req.body.piel, req.body.vrm ?? null]);
    return rep.code(204).send();
  });

  // Derecho de acceso y portabilidad: todo lo que se guarda del hogar, en JSON.
  app.get("/api/yo/datos", { preHandler: requiereSesion }, async (req, rep) => {
    const id = req.session.hogarId!;
    const [h, av, hz, pr, vi, se, cv] = await Promise.all([
      bd.query("SELECT correo, rol, alias, alias_visible, normas_version, normas_aceptadas_en, avisos_correo, creado_en FROM hogares WHERE id = $1", [id]),
      bd.query("SELECT camisa, sombrero, piel, vrm, actualizado_en FROM avatares WHERE hogar_id = $1", [id]),
      bd.query("SELECT codigo, nombre FROM hazas WHERE hogar_id = $1 ORDER BY codigo", [id]),
      bd.query("SELECT texto, creada_en, respuesta, respondida_en FROM preguntas WHERE hogar_id = $1 ORDER BY creada_en", [id]),
      bd.query("SELECT v.titulo, v.empieza_en, a.personas, a.estado FROM visitas_asistentes a JOIN visitas v ON v.id = a.visita_id WHERE a.hogar_id = $1 ORDER BY v.empieza_en", [id]),
      bd.query("SELECT creada_en, ultima_actividad_en, expira_en, revocada_en FROM sesiones WHERE hogar_id = $1 ORDER BY creada_en", [id]),
      bd.query("SELECT creado_en, aprobado_en, usado_en FROM codigos_vinculo WHERE hogar_id = $1 ORDER BY creado_en", [id]),
    ]);
    // la vida (0004): lo que colgó, subió, denunció, sugirió, sus avisos, inscripciones y lotes
    const [pe, me, de, su, avi, lo] = await Promise.all([
      bd.query(`SELECT o.finca, o.copas_id, p.nombre, p.objeto_tipo, p.estado, p.creada_en, p.actualizada_en, p.retirada_en, p.motivo_retirada
                  FROM personalizaciones p JOIN olivos o ON o.id = p.olivo_id WHERE p.hogar_id = $1 ORDER BY p.id`, [id]),
      bd.query("SELECT '/api/medios/' || clave AS url, bytes, ancho, alto, aviso_version, aviso_aceptado_en, creado_en FROM medios WHERE hogar_id = $1 ORDER BY id", [id]),
      bd.query("SELECT motivo, texto, creada_en, resolucion FROM denuncias WHERE hogar_id = $1 ORDER BY id", [id]),
      bd.query("SELECT texto, estado, creada_en FROM bandeja WHERE hogar_id = $1 AND tipo = 'sugerencia' ORDER BY id", [id]),
      bd.query("SELECT a.titulo, a.texto, a.creado_en, ah.leido_en FROM avisos_hogar ah JOIN avisos a ON a.id = ah.aviso_id WHERE ah.hogar_id = $1 ORDER BY a.id", [id]),
      bd.query("SELECT l.codigo, l.campana FROM lote_hogar lh JOIN lotes l ON l.id = lh.lote_id WHERE lh.hogar_id = $1 ORDER BY l.codigo", [id]),
    ]);
    await audita(bd, id, "yo.datos_descargados");
    rep.header("cache-control", "no-store").header("content-disposition", "attachment; filename=\"mis-datos-gemelo.json\"");
    return {
      hogar: h.rows[0], avatar: av.rows[0] ?? null, hazas: hz.rows, preguntas: pr.rows, visitas: vi.rows, sesiones: se.rows, aparatos_vinculados: cv.rows,
      olivos_personalizados: pe.rows, fotos_subidas: me.rows, denuncias: de.rows, sugerencias: su.rows, avisos: avi.rows, lotes: lo.rows,
    };
  });

  // Derecho de supresión: se borra el hogar y, en cascada, todo lo suyo (migraciones/0001_inicial.sql).
  app.delete("/api/yo", { preHandler: requiereSesion }, async (req, rep) => {
    const claves = await clavesDelHogar(bd, req.session.hogarId!);
    await bd.query("DELETE FROM hogares WHERE id = $1", [req.session.hogarId]);
    await borraFicheros(config.medios.carpeta, claves);   // la cascada borra las filas; los ficheros, aquí (y la purga, si falla)
    await audita(bd, null, "hogar.borrado", { por: "el_propio_hogar" });
    req.session = null as never;
    return rep.clearCookie(NOMBRE_COOKIE, OPCIONES_COOKIE).code(204).send();
  });
}
