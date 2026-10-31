// La Agenda (OF11, doc/sistema/OFICINA.md §7; contrato: contratos/api.openapi.yaml; tablas: `visitas` y `visitas_asistentes`, migraciones 0001, 0004 y 0012).
// Un evento tiene aforo en PERSONAS (`plazas`, null = sin aforo); cada hogar se inscribe una vez, con su número de personas; si no cabe, queda en la
// lista de espera y pasa a apuntado solo cuando se libera plaza (promoción dentro de la misma transacción, con el evento bloqueado: dos inscripciones
// a la vez no pasan del aforo). Los avisos son filas de `avisos`/`avisos_hogar` (la campana del gemelo); el CORREO (con el .ics del evento) lo manda aparte,
// en segundo plano, el repartidor de src/avisos/correo.ts a los hogares con `avisos_correo` (OF11c): estas rutas solo escriben las filas.
//  Oficina (rol oficina o admin, aparato aprobado):
//   GET  /api/admin/eventos                 la lista, con lo apuntado y la espera de cada uno
//   POST /api/admin/eventos                 crear
//   PUT  /api/admin/eventos/:id             editar (subir el aforo promueve a la espera; no se baja por debajo de lo apuntado;
//                                           cambiar fecha o lugar avisa solo a apuntados y espera, aviso de sistema que no cuenta para el tope: OF11b)
//   POST /api/admin/eventos/:id/cancelar    cancelar, con aviso a apuntados y en espera
//   GET  /api/admin/eventos/:id/inscritos   inscritos: familia (alias, nombre interno, hazas) y personas; NUNCA el correo
//   POST /api/admin/eventos/:id/avisar      aviso a apuntados y/o espera, con tope semanal por hogar
//  Hogar (sesión de enlace; las gafas vinculadas ven, no se inscriben):
//   GET    /api/agenda                      los próximos eventos y mi inscripción
//   POST   /api/agenda/:id/inscripcion      apuntarse (personas) o quedar en espera
//   DELETE /api/agenda/:id/inscripcion      borrarse (libera plaza y promueve a la espera)
//   GET    /api/agenda/:id/evento.ics       la invitación de calendario del evento (OF11c)
// Los textos que escribe la oficina salen tal cual como datos; la web los pinta con textContent.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { audita, esOficina } from "../auth/servicio.ts";
import { ventanaEntrada } from "../presencia/voz.ts";
import type { TipoIcs } from "../avisos/correo.ts";
import { requiereSesion } from "../auth/roles.ts";
import type { Cliente } from "../bd/pool.ts";
import { enTransaccion } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { OFICINA } from "../oficina/acceso.ts";
import { limpia } from "../vida/filtro.ts";
import { icsDeEvento } from "./ics.ts";
import { aPromover, cambiosDeCita, estadoNuevo, libres, textoDeCambios, TOPE_AVISOS_SEMANA } from "./cupo.ts";

export const TIPOS = ["guiada", "libre", "evento", "taller", "recoleccion", "cata", "directo"] as const;
export const ESTADOS_EDITABLES = ["borrador", "abierta", "cerrada"] as const;
export const INSCRIPCIONES_POR_HORA = 30;
export const TEXTO_LIMITE_AGENDA = "Llevas muchas inscripciones seguidas. Espera un rato y vuelve a probar.";
export const TEXTO_SOLO_TITULAR = "Solo se puede apuntar a la familia con el enlace de su correo, no desde unas gafas vinculadas.";

const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;
const INSTANTE = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})$" } as const;
const UNA_LINEA = (min: number, max: number) => ({ type: "string", minLength: min, maxLength: max, pattern: "^[^\\u0000-\\u001f\\u007f]*$" }) as const;
const TEXTO_LIBRE = (min: number, max: number) => ({ type: "string", minLength: min, maxLength: max, pattern: "^[^\\u0000-\\u0008\\u000b-\\u001f\\u007f]*$" }) as const;
const CAMPOS_EVENTO = {
  titulo: UNA_LINEA(1, 120), tipo: { enum: TIPOS }, descripcion: { anyOf: [TEXTO_LIBRE(1, 2000), { type: "null" }] }, lugar: { anyOf: [UNA_LINEA(1, 120), { type: "null" }] },
  finca: { anyOf: [{ type: "string", pattern: "^[a-z0-9_-]{1,32}$" }, { type: "null" }] }, haza_id: { type: ["integer", "null"], minimum: 1, maximum: 9007199254740991 },
  presencial: { type: "boolean" }, empieza_en: INSTANTE, termina_en: { anyOf: [INSTANTE, { type: "null" }] }, plazas: { type: ["integer", "null"], minimum: 1, maximum: 5000 },
  inscripcion_hasta: { anyOf: [INSTANTE, { type: "null" }] }, estado: { enum: ESTADOS_EDITABLES },
} as const;

interface Evento {
  id: number; titulo: string; tipo: string; descripcion: string | null; lugar: string | null; finca: string | null; haza_id: number | null; presencial: boolean;
  empieza_en: Date; termina_en: Date | null; plazas: number | null; inscripcion_hasta: Date | null; estado: string; guia_id?: number | null;
}
type CuerpoEvento = Partial<Record<Exclude<keyof typeof CAMPOS_EVENTO, never>, unknown>>;

const fechaOk = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));

/** Lo apuntado (personas de hogares activos) y la espera de un evento. */
async function cuentas(c: Pick<Cliente, "query">, id: number): Promise<{ apuntadas: number; hogares: number; espera: number; personas_espera: number }> {
  const r = await c.query<{ apuntadas: number; hogares: number; espera: number; personas_espera: number }>(
    `SELECT coalesce(sum(a.personas) FILTER (WHERE a.estado = 'apuntado'), 0)::int AS apuntadas,
            (count(*) FILTER (WHERE a.estado = 'apuntado'))::int AS hogares,
            (count(*) FILTER (WHERE a.estado = 'en_espera'))::int AS espera,
            coalesce(sum(a.personas) FILTER (WHERE a.estado = 'en_espera'), 0)::int AS personas_espera
       FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id AND g.activo WHERE a.visita_id = $1`, [id]);
  return r.rows[0]!;
}

/**
 * Inserta un aviso de evento y lo entrega a esos hogares. `autor` null = lo genera el sistema (promoción, cancelación): no cuenta para el tope.
 * `ics`: el aviso viene de ese evento y su correo (si el hogar lo pidió) lleva la invitación de calendario (OF11c; la manda el repartidor, no esta petición).
 */
async function avisaA(c: Cliente, hogares: number[], titulo: string, texto: string, autor: number | null, ics?: { evento: number; tipo: TipoIcs }): Promise<number | null> {
  if (!hogares.length) return null;
  const id = (await c.query<{ id: number }>("INSERT INTO avisos (tipo, titulo, texto, autor_id, evento_id, ics) VALUES ('evento', $1, $2, $3, $4, $5) RETURNING id",
    [titulo, texto, autor, ics?.evento ?? null, ics?.tipo ?? null])).rows[0]!.id;
  await c.query("INSERT INTO avisos_hogar (aviso_id, hogar_id) SELECT $1, unnest($2::bigint[])", [id, hogares]);
  return id;
}
const descripcionDe = (e: Pick<Evento, "titulo" | "empieza_en">) => e.titulo + " · " + e.empieza_en.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });

/**
 * Con el evento YA bloqueado (FOR UPDATE) y en estado abierta o cerrada: pasa de la espera a apuntado a quien quepa, en orden, y les avisa.
 * Devuelve cuántos hogares se promovieron. Un evento cancelado o ya empezado no promueve.
 */
export async function promueve(c: Cliente, e: Pick<Evento, "id" | "titulo" | "empieza_en" | "plazas" | "estado">): Promise<number> {
  if (e.estado === "cancelada" || e.estado === "borrador" || e.empieza_en.getTime() <= Date.now()) return 0;
  const { apuntadas } = await cuentas(c, e.id);
  const espera = (await c.query<{ hogar_id: number; personas: number }>(
    `SELECT a.hogar_id, a.personas FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id AND g.activo
      WHERE a.visita_id = $1 AND a.estado = 'en_espera' ORDER BY a.apuntado_en, a.hogar_id`, [e.id])).rows;
  const ids = aPromover(e.plazas, apuntadas, espera.map(f => ({ hogar: f.hogar_id, personas: f.personas })));
  if (!ids.length) return 0;
  await c.query("UPDATE visitas_asistentes SET estado = 'apuntado', promovida_en = now() WHERE visita_id = $1 AND hogar_id = ANY($2::bigint[]) AND estado = 'en_espera'", [e.id, ids]);
  await avisaA(c, ids, "Ha quedado una plaza libre y es tuya", descripcionDe(e) + ". Estabas en la lista de espera y ya estás apuntado. Si no puedes ir, bórrate para dejar el sitio a otra familia.", null, { evento: e.id, tipo: "inscripcion" });
  await audita(c, null, "agenda.espera_promovida", { evento: e.id, hogares: ids.length });
  return ids.length;
}

/** Código legible de una haza (o null), para el texto de «qué cambió». */
const codigoHaza = async (c: Pick<Cliente, "query">, id: number | null): Promise<string | null> =>
  id === null ? null : ((await c.query<{ codigo: string }>("SELECT codigo FROM hazas WHERE id = $1", [id])).rows[0]?.codigo ?? "id " + id);

const bloquea = async (c: Cliente, id: number): Promise<Evento | null> => (await c.query<Evento>("SELECT * FROM visitas WHERE id = $1 FOR UPDATE", [id])).rows[0] ?? null;
const pasaAFila = (f: Evento & { haza_codigo?: string | null }) => ({
  id: Number(f.id), titulo: f.titulo, tipo: f.tipo, descripcion: f.descripcion, lugar: f.lugar, finca: f.finca,
  haza: f.haza_id === null ? null : { id: Number(f.haza_id), codigo: f.haza_codigo ?? null }, presencial: f.presencial,
  empieza_en: f.empieza_en, termina_en: f.termina_en, plazas: f.plazas, inscripcion_hasta: f.inscripcion_hasta, estado: f.estado,
});

export async function rutasAgenda(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const porHogar = app.createRateLimit({ max: INSCRIPCIONES_POR_HORA, timeWindow: 3600_000, keyGenerator: (r: FastifyRequest) => "agenda:" + String(r.session?.hogarId ?? "?") });

  /** Errores de base de datos que son culpa de la entrada, no del servidor. */
  const errorDeEntrada = (e: unknown) => {
    const codigo = (e as { code?: string }).code;
    if (codigo === "23503") return { error: "haza_no_existe", mensaje: "Esa haza no existe." };
    if (codigo === "23514") return { error: "entrada_no_valida", mensaje: "Las fechas no cuadran: el evento acaba antes de empezar, o el plazo de inscripción pasa del inicio." };
    return null;
  };

  // ================================================================ oficina
  app.get<{ Querystring: { desde?: string; limite?: number } }>("/api/admin/eventos", {
    preHandler: OFICINA,
    schema: { querystring: { type: "object", additionalProperties: false, properties: { desde: INSTANTE, limite: { type: "integer", minimum: 1, maximum: 500 } } } },
  }, async (req, rep) => {
    const desde = req.query.desde && fechaOk(req.query.desde) ? req.query.desde : null;
    const r = await bd.query<Evento & { haza_codigo: string | null; apuntadas: number; hogares: number; espera: number; personas_espera: number }>(
      `SELECT v.*, hz.codigo AS haza_codigo,
              coalesce(sum(a.personas) FILTER (WHERE a.estado = 'apuntado' AND g.activo), 0)::int AS apuntadas,
              (count(a.hogar_id) FILTER (WHERE a.estado = 'apuntado' AND g.activo))::int AS hogares,
              (count(a.hogar_id) FILTER (WHERE a.estado = 'en_espera' AND g.activo))::int AS espera,
              coalesce(sum(a.personas) FILTER (WHERE a.estado = 'en_espera' AND g.activo), 0)::int AS personas_espera
         FROM visitas v LEFT JOIN hazas hz ON hz.id = v.haza_id
         LEFT JOIN visitas_asistentes a ON a.visita_id = v.id LEFT JOIN hogares g ON g.id = a.hogar_id
        WHERE ($1::timestamptz IS NULL OR v.empieza_en >= $1) GROUP BY v.id, hz.codigo ORDER BY v.empieza_en DESC, v.id DESC LIMIT $2`, [desde, req.query.limite ?? 200]);
    rep.header("cache-control", "no-store");
    return { eventos: r.rows.map(f => ({ ...pasaAFila(f), apuntadas: f.apuntadas, hogares: f.hogares, en_espera: f.espera, personas_en_espera: f.personas_espera, plazas_libres: libres(f.plazas, f.apuntadas) })) };
  });

  const invalida = (rep: { code: (n: number) => { send: (b: unknown) => unknown } }, mensaje: string) => rep.code(400).send({ error: "entrada_no_valida", mensaje });

  app.post<{ Body: CuerpoEvento }>("/api/admin/eventos", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["titulo", "tipo", "empieza_en"], properties: CAMPOS_EVENTO } },
  }, async (req, rep) => {
    const b = req.body;
    const titulo = limpia(String(b.titulo));
    if (!titulo) return invalida(rep, "Hace falta un título.");
    if (!fechaOk(b.empieza_en) || Date.parse(b.empieza_en) <= Date.now()) return invalida(rep, "El evento tiene que empezar en el futuro.");
    if (fechaOk(b.inscripcion_hasta) && Date.parse(b.inscripcion_hasta) > Date.parse(b.empieza_en)) return invalida(rep, "El plazo de inscripción no puede acabar después de empezar el evento.");
    try {
      const id = await enTransaccion(bd, async c => {
        const f = (await c.query<{ id: number }>(
          `INSERT INTO visitas (titulo, tipo, descripcion, lugar, finca, haza_id, presencial, empieza_en, termina_en, plazas, inscripcion_hasta, estado, creada_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
          [titulo, b.tipo, b.descripcion ?? null, b.lugar ?? null, b.finca ?? null, b.haza_id ?? null, b.presencial ?? false, b.empieza_en, b.termina_en ?? null,
            b.plazas ?? null, b.inscripcion_hasta ?? null, b.estado ?? "abierta", req.session.hogarId])).rows[0]!.id;
        await audita(c, req.session.hogarId!, "admin.evento_creado", { evento: f, tipo: String(b.tipo) });
        return f;
      });
      return rep.code(201).send({ id: Number(id) });
    } catch (e) {
      const m = errorDeEntrada(e);
      if (m) return rep.code(400).send(m);
      throw e;
    }
  });

  app.put<{ Params: { id: number }; Body: CuerpoEvento }>("/api/admin/eventos/:id", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 120, timeWindow: 60_000 } },
    schema: { params: ID, body: { type: "object", additionalProperties: false, minProperties: 1, properties: CAMPOS_EVENTO } },
  }, async (req, rep) => {
    const b = req.body;
    if (typeof b.titulo === "string" && !limpia(b.titulo)) return invalida(rep, "El título no puede quedar vacío.");
    try {
      const r = await enTransaccion(bd, async c => {
        const e = await bloquea(c, req.params.id);
        if (!e) return { codigo: 404 as const };
        if (e.estado === "cancelada") return { codigo: 409 as const, error: "cancelado", mensaje: "El evento está cancelado: no se puede editar." };
        const n = { ...e, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) } as Evento & Record<string, unknown>;
        if (typeof b.titulo === "string") n.titulo = limpia(b.titulo);
        if (b.empieza_en !== undefined) n.empieza_en = new Date(String(b.empieza_en));
        if (b.termina_en !== undefined) n.termina_en = b.termina_en === null ? null : new Date(String(b.termina_en));
        if (b.inscripcion_hasta !== undefined) n.inscripcion_hasta = b.inscripcion_hasta === null ? null : new Date(String(b.inscripcion_hasta));
        if (n.inscripcion_hasta && n.inscripcion_hasta.getTime() > n.empieza_en.getTime()) return { codigo: 400 as const, error: "entrada_no_valida", mensaje: "El plazo de inscripción no puede acabar después de empezar el evento." };
        const { apuntadas } = await cuentas(c, e.id);
        if (n.plazas !== null && n.plazas < apuntadas) return { codigo: 409 as const, error: "plazas_menores_que_apuntadas", mensaje: "Hay " + apuntadas + " personas apuntadas: no se puede bajar el aforo de ahí (nadie se desapunta solo)." };
        await c.query(
          `UPDATE visitas SET titulo = $2, tipo = $3, descripcion = $4, lugar = $5, finca = $6, haza_id = $7, presencial = $8, empieza_en = $9, termina_en = $10,
                  plazas = $11, inscripcion_hasta = $12, estado = $13, actualizada_en = now() WHERE id = $1`,
          [e.id, n.titulo, n.tipo, n.descripcion, n.lugar, n.finca, n.haza_id, n.presencial, n.empieza_en, n.termina_en, n.plazas, n.inscripcion_hasta, n.estado]);
        const promovidos = await promueve(c, { id: e.id, titulo: n.titulo, empieza_en: n.empieza_en, plazas: n.plazas, estado: n.estado });
        // cambió la fecha o el lugar: aviso solo, en esta transacción, a apuntados y en espera; autor null = de sistema, no cuenta para el tope semanal
        const cambios = cambiosDeCita(
          { empieza_en: e.empieza_en, termina_en: e.termina_en, lugar: e.lugar, finca: e.finca, haza: await codigoHaza(c, e.haza_id) },
          { empieza_en: n.empieza_en, termina_en: n.termina_en, lugar: n.lugar, finca: n.finca, haza: await codigoHaza(c, n.haza_id) });
        let avisados = 0;
        if (cambios.length && n.estado !== "borrador") {
          const dest = (await c.query<{ hogar_id: number }>(
            "SELECT a.hogar_id FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id AND g.activo WHERE a.visita_id = $1 AND a.estado IN ('apuntado', 'en_espera')", [e.id])).rows.map(f => f.hogar_id);
          await avisaA(c, dest, "Cambia la fecha o el lugar de un evento", textoDeCambios(n.titulo, cambios), null, { evento: e.id, tipo: "cambio" });
          avisados = dest.length;
        }
        const { hogares, espera } = await cuentas(c, e.id);
        await audita(c, req.session.hogarId!, "admin.evento_editado", { evento: e.id, campos: Object.keys(b).length, promovidos, cambios: cambios.map(x => x.campo).join(","), avisados });
        return { codigo: 200 as const, promovidos, con_inscritos: hogares + espera, avisados };
      });
      if (r.codigo === 404) return rep.code(404).send({ error: "no_existe" });
      if (r.codigo !== 200) return rep.code(r.codigo).send({ error: r.error, mensaje: r.mensaje });
      return { promovidos: r.promovidos, con_inscritos: r.con_inscritos, avisados: r.avisados };
    } catch (e) {
      const m = errorDeEntrada(e);
      if (m) return rep.code(400).send(m);
      throw e;
    }
  });

  app.post<{ Params: { id: number }; Body: Record<string, never> }>("/api/admin/eventos/:id/cancelar", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, properties: {} } },
  }, async (req, rep) => {
    const r = await enTransaccion(bd, async c => {
      const e = await bloquea(c, req.params.id);
      if (!e) return { codigo: 404 as const };
      if (e.estado === "cancelada") return { codigo: 409 as const };
      await c.query("UPDATE visitas SET estado = 'cancelada', cancelada_en = now(), actualizada_en = now() WHERE id = $1", [e.id]);
      const dest = (await c.query<{ hogar_id: number }>(
        "SELECT a.hogar_id FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id AND g.activo WHERE a.visita_id = $1 AND a.estado IN ('apuntado', 'en_espera')", [e.id])).rows.map(f => f.hogar_id);
      await avisaA(c, dest, "Se cancela un evento al que estabas apuntado", descripcionDe(e) + ". La oficina lo ha cancelado; sentimos las molestias.", null, { evento: e.id, tipo: "cancelacion" });
      await audita(c, req.session.hogarId!, "admin.evento_cancelado", { evento: e.id, avisados: dest.length });
      return { codigo: 204 as const };
    });
    if (r.codigo === 404) return rep.code(404).send({ error: "no_existe" });
    if (r.codigo === 409) return rep.code(409).send({ error: "ya_cancelado", mensaje: "El evento ya estaba cancelado." });
    return rep.code(204).send();
  });

  app.get<{ Params: { id: number } }>("/api/admin/eventos/:id/inscritos", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const e = (await bd.query<Evento>("SELECT * FROM visitas WHERE id = $1", [req.params.id])).rows[0];
    if (!e) return rep.code(404).send({ error: "no_existe" });
    const r = await bd.query(
      `SELECT a.hogar_id, g.alias, g.nombre_interno, g.activo, a.personas, a.estado, a.apuntado_en, a.promovida_en, a.anulado_en,
              coalesce((SELECT array_agg(hz.codigo ORDER BY hz.codigo) FROM hazas hz WHERE hz.hogar_id = g.id), '{}') AS hazas
         FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id
        WHERE a.visita_id = $1 ORDER BY (a.estado = 'anulado'), (a.estado = 'en_espera'), a.apuntado_en, a.hogar_id`, [e.id]);
    const c = await cuentas(bd, e.id);
    rep.header("cache-control", "no-store");
    return {
      evento: { id: Number(e.id), titulo: e.titulo, plazas: e.plazas, estado: e.estado, apuntadas: c.apuntadas, plazas_libres: libres(e.plazas, c.apuntadas), en_espera: c.espera },
      inscritos: r.rows.map(f => ({
        hogar_id: Number(f.hogar_id), alias: f.alias, nombre_interno: f.nombre_interno, de_baja: !f.activo, hazas: f.hazas, personas: f.personas, estado: f.estado,
        apuntado_en: f.apuntado_en, promovida_en: f.promovida_en, anulado_en: f.anulado_en,
      })),
    };
  });

  app.post<{ Params: { id: number }; Body: { titulo: string; texto?: string; a?: "apuntados" | "espera" | "todos" } }>("/api/admin/eventos/:id/avisar", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: {
      params: ID,
      body: { type: "object", additionalProperties: false, required: ["titulo"], properties: { titulo: UNA_LINEA(1, 120), texto: TEXTO_LIBRE(1, 2000), a: { enum: ["apuntados", "espera", "todos"] } } },
    },
  }, async (req, rep) => {
    const titulo = limpia(req.body.titulo), texto = req.body.texto?.normalize("NFC").trim() || null;
    if (!titulo) return invalida(rep, "Hace falta un título.");
    const estados = req.body.a === "apuntados" ? ["apuntado"] : req.body.a === "espera" ? ["en_espera"] : ["apuntado", "en_espera"];
    const r = await enTransaccion(bd, async c => {
      const e = await bloquea(c, req.params.id);
      if (!e) return null;
      const dest = (await c.query<{ hogar_id: number; avisos_correo: boolean; recientes: number }>(
        `SELECT a.hogar_id, g.avisos_correo,
                (SELECT count(*)::int FROM avisos_hogar ah JOIN avisos av ON av.id = ah.aviso_id
                  WHERE ah.hogar_id = g.id AND av.tipo = 'evento' AND av.autor_id IS NOT NULL AND av.creado_en > now() - interval '7 days') AS recientes
           FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id AND g.activo WHERE a.visita_id = $1 AND a.estado = ANY($2::text[])`, [e.id, estados])).rows;
      const van = dest.filter(f => f.recientes < TOPE_AVISOS_SEMANA);
      const id = await avisaA(c, van.map(f => f.hogar_id), titulo, texto ?? descripcionDe(e), req.session.hogarId!);
      await audita(c, req.session.hogarId!, "admin.evento_avisado", { evento: e.id, aviso: id, enviados: van.length, omitidos_por_tope: dest.length - van.length });
      return { aviso: id === null ? null : Number(id), enviados: van.length, omitidos_por_tope: dest.length - van.length, correo_pendiente: van.filter(f => f.avisos_correo).length };
    });
    return r === null ? rep.code(404).send({ error: "no_existe" }) : rep.code(r.enviados ? 201 : 200).send(r);
  });

  // ================================================================ hogar
  app.get("/api/agenda", { preHandler: requiereSesion, config: { rateLimit: { max: 60, timeWindow: 60_000 } } }, async (req, rep) => {
    const r = await bd.query<Evento & { haza_codigo: string | null; apuntadas: number; mi_estado: string | null; mis_personas: number | null }>(
      `SELECT v.*, hz.codigo AS haza_codigo,
              (SELECT coalesce(sum(a.personas), 0)::int FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id AND g.activo WHERE a.visita_id = v.id AND a.estado = 'apuntado') AS apuntadas,
              mi.estado AS mi_estado, mi.personas AS mis_personas
         FROM visitas v LEFT JOIN hazas hz ON hz.id = v.haza_id
         LEFT JOIN visitas_asistentes mi ON mi.visita_id = v.id AND mi.hogar_id = $1 AND mi.estado <> 'anulado'
        WHERE v.estado IN ('abierta', 'cerrada') AND (v.empieza_en > now()
              OR (v.tipo IN ('guiada', 'directo') AND coalesce(v.termina_en, v.empieza_en + interval '3 hours') + interval '30 minutes' > now()))   -- OF11e: la guiada en curso sigue en la lista hasta que cierra su sala
        ORDER BY v.empieza_en, v.id LIMIT 50`, [req.session.hogarId]);
    rep.header("cache-control", "private, no-cache");
    const ofi = esOficina(req.session.rol), hogar = req.session.hogarId!;
    return {
      puede_inscribirse: req.session.origen !== "vinculo",
      eventos: r.rows.map(f => ({
        id: Number(f.id), titulo: f.titulo, tipo: f.tipo, descripcion: f.descripcion, lugar: f.lugar, finca: f.finca, haza: f.haza_id === null ? null : f.haza_codigo, presencial: f.presencial,
        empieza_en: f.empieza_en, termina_en: f.termina_en, plazas: f.plazas, plazas_libres: libres(f.plazas, f.apuntadas), inscripcion_hasta: f.inscripcion_hasta,
        inscripcion_abierta: f.estado === "abierta" && (!f.inscripcion_hasta || f.inscripcion_hasta.getTime() > Date.now()),
        mia: f.mi_estado ? { estado: f.mi_estado, personas: f.mis_personas } : null,
        entrada: ventanaEntrada({ ...f, guia_id: f.guia_id ?? null }, { hogarId: hogar, esOficina: ofi, apuntado: f.mi_estado === "apuntado" }),   // OF11e: desde/hasta cuándo puede entrar en la sala guiada (null si no)
      })),
    };
  });

  // La invitación de calendario de un evento visible (abierto o cerrado, no borrador ni cancelado). Zona Europe/Madrid (src/agenda/ics.ts).
  app.get<{ Params: { id: number } }>("/api/agenda/:id/evento.ics", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { params: ID },
  }, async (req, rep) => {
    const e = (await bd.query<Evento & { actualizada_en: Date }>(
      "SELECT * FROM visitas WHERE id = $1 AND estado IN ('abierta', 'cerrada')", [req.params.id])).rows[0];
    if (!e) return rep.code(404).send({ error: "no_existe" });
    rep.header("content-type", "text/calendar; charset=utf-8");
    rep.header("content-disposition", "attachment; filename=\"evento-" + Number(e.id) + ".ics\"");
    rep.header("cache-control", "private, no-cache");
    return icsDeEvento({ ...e, id: Number(e.id) }, { metodo: "PUBLISH", urlPublica: ctx.config.urlPublica });
  });

  app.post<{ Params: { id: number }; Body: { personas: number } }>("/api/agenda/:id/inscripcion", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["personas"], properties: { personas: { type: "integer", minimum: 1, maximum: 10 } } } },
  }, async (req, rep) => {
    if (req.session.origen === "vinculo") return rep.code(403).send({ error: "solo_titular", mensaje: TEXTO_SOLO_TITULAR });
    const lim = await porHogar(req);
    if (!lim.isAllowed && lim.isExceeded) return rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_AGENDA });
    const hogar = req.session.hogarId!, personas = req.body.personas;
    const r = await enTransaccion(bd, async c => {
      const e = await bloquea(c, req.params.id);
      if (!e || e.estado === "borrador" || e.estado === "cancelada") return { codigo: 404 as const };
      if (e.estado === "cerrada" || e.empieza_en.getTime() <= Date.now() || (e.inscripcion_hasta && e.inscripcion_hasta.getTime() <= Date.now()))
        return { codigo: 409 as const, error: "inscripcion_cerrada", mensaje: "La inscripción de este evento está cerrada." };
      if (e.plazas !== null && personas > e.plazas) return { codigo: 422 as const, error: "supera_el_aforo", mensaje: "Sois más personas que plazas tiene el evento." };
      const ya = (await c.query<{ estado: string }>("SELECT estado FROM visitas_asistentes WHERE visita_id = $1 AND hogar_id = $2", [e.id, hogar])).rows[0];
      if (ya && ya.estado !== "anulado") return { codigo: 409 as const, error: "ya_inscrito", mensaje: "Ya estáis apuntados (o en la lista de espera). Si queréis cambiar el número de personas, borraos y volved a apuntaros." };
      const { apuntadas } = await cuentas(c, e.id);
      // el orden de la espera manda: si hay familias esperando, quien llega no se les cuela aunque quepa
      const hayEspera = (await c.query("SELECT 1 FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id AND g.activo WHERE a.visita_id = $1 AND a.estado = 'en_espera' LIMIT 1", [e.id])).rowCount! > 0;
      const estado = hayEspera ? "en_espera" : estadoNuevo(e.plazas, apuntadas, personas);
      await c.query(
        `INSERT INTO visitas_asistentes (visita_id, hogar_id, personas, estado) VALUES ($1, $2, $3, $4)
         ON CONFLICT (visita_id, hogar_id) DO UPDATE SET personas = $3, estado = $4, apuntado_en = now(), anulado_en = NULL, promovida_en = NULL`, [e.id, hogar, personas, estado]);
      await audita(c, hogar, "agenda.inscripcion", { evento: e.id, personas, estado });
      // confirmación por correo con la invitación de calendario, solo si ya está apuntado y pidió los avisos por correo (el envío es del repartidor, en segundo plano)
      if (estado === "apuntado" && (await c.query<{ avisos_correo: boolean }>("SELECT avisos_correo FROM hogares WHERE id = $1", [hogar])).rows[0]?.avisos_correo)
        await avisaA(c, [hogar], "Estás apuntado: " + e.titulo, descripcionDe(e) + ". Sois " + personas + (personas === 1 ? " persona" : " personas") + ". Si no podéis ir, borraos desde el gemelo para dejar el sitio a otra familia.", null, { evento: e.id, tipo: "inscripcion" });
      const ocupadas = apuntadas + (estado === "apuntado" ? personas : 0);
      return { codigo: 201 as const, estado, personas, plazas_libres: libres(e.plazas, ocupadas) };
    });
    if (r.codigo === 404) return rep.code(404).send({ error: "no_existe" });
    if (r.codigo !== 201) return rep.code(r.codigo).send({ error: r.error, mensaje: r.mensaje });
    return rep.code(201).send({ estado: r.estado, personas: r.personas, plazas_libres: r.plazas_libres });
  });

  app.delete<{ Params: { id: number } }>("/api/agenda/:id/inscripcion", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { params: ID },
  }, async (req, rep) => {
    if (req.session.origen === "vinculo") return rep.code(403).send({ error: "solo_titular", mensaje: TEXTO_SOLO_TITULAR });
    const hogar = req.session.hogarId!;
    const r = await enTransaccion(bd, async c => {
      const e = await bloquea(c, req.params.id);
      if (!e) return 404;
      const u = await c.query("UPDATE visitas_asistentes SET estado = 'anulado', anulado_en = now() WHERE visita_id = $1 AND hogar_id = $2 AND estado <> 'anulado'", [e.id, hogar]);
      if (!u.rowCount) return 404;
      const promovidos = await promueve(c, e);
      await audita(c, hogar, "agenda.baja", { evento: e.id, promovidos });
      return 204;
    });
    return r === 204 ? rep.code(204).send() : rep.code(404).send({ error: "no_existe", mensaje: "No estáis apuntados a ese evento." });
  });
}
