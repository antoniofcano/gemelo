// OF10: el mundo en modo oficina, del lado del servidor (doc/sistema/OFICINA.md §6; contratos: api.openapi.yaml, livekit-roles.json v4, presencia.md).
// Los poderes de la oficina en el mundo los ejecuta la api con su clave de servidor y quedan en la auditoría (ADR-0024; decisión 107); ningún token de
// cliente lleva roomAdmin. LiveKit NO deja restringir un tema de datos por rol (el permiso es canPublishData para todo o nada), así que:
//  · lo que manda la oficina (anuncio, invitación a otra sala, «hay balizas nuevas») lo manda ESTA api con RoomService.sendData: llega a los clientes sin
//    participante, y el motor solo acepta esos temas si no traen participante (un hogar que publique «anuncio» desde su navegador llega con su identidad
//    y se descarta). Que el servidor de LiveKit ponga la identidad del emisor en los datos de un cliente (y no la que diga el cliente) NO se ha
//    comprobado contra LiveKit real; es lo que dice su documentación y lo que comprueba presencia_dev.test.js (pendiente por el banco);
//  · las balizas oficiales se guardan en la base (migración 0014): se ven aunque entres después y caducan solas.
//  Oficina (rol oficina o admin, aparato aprobado y llave; OFICINA de oficina/acceso.ts):
//   POST   /api/admin/presencia/anuncio   { texto, sala: general|visita|todas }   aviso de texto (como el chat: ≤ 280, sin control ni dirección)
//   POST   /api/admin/presencia/llevar    { de, a }                               invita a quien está en la sala «de» a pasar a la sala «a»
//   POST   /api/admin/balizas             { finca, x, y, titulo, texto?, horas? }  pone una baliza oficial (EPSG:25830)
//   PUT    /api/admin/balizas/:id         { x, y }                                 la mueve
//   DELETE /api/admin/balizas/:id                                                  la quita (queda retirada, no se borra)
//  Cualquiera con sesión:
//   GET    /api/balizas-oficiales?finca=…                                          las vigentes de esa finca
import type { FastifyInstance } from "fastify";
import { audita } from "../auth/servicio.ts";
import { requiereSesion } from "../auth/roles.ts";
import type { Bd } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { CONTORNO_HOLGURA_M, MARGEN_FINCA_M } from "../hazas/geometria.ts";
import { OFICINA } from "../oficina/acceso.ts";
import { type ClaveSala, CLAVES_SALA, type ModeradorSala, SALAS, TEMAS_OFICINA } from "./livekit.ts";

/** El mismo límite que el chat (contratos/presencia.md; Chat de apps/web/motor/26_presencia.js): 280 caracteres. */
export const ANUNCIO_MAX = 280;
export const BALIZA_TITULO_MAX = 60, BALIZA_TEXTO_MAX = 280, BALIZAS_MAX_POR_FINCA = 20, BALIZA_HORAS = { min: 1, max: 168, defecto: 8 } as const;
/** Los caracteres que se quitan (los mismos que el Chat del motor): de control y de dirección, para que nadie disfrace un mensaje. */
const rango = (a: number, b: number) => String.fromCharCode(a) + "-" + String.fromCharCode(b);
const RARO = new RegExp("[" + rango(0x00, 0x1f) + rango(0x7f, 0x9f) + rango(0x200b, 0x200f) + rango(0x2028, 0x202e) + rango(0x2066, 0x2069) + String.fromCharCode(0xfeff) + "]", "g");
/** Como Chat.limpia del motor: quita lo raro, junta los espacios y corta a `max` caracteres. null si queda vacío. */
export function limpiaTexto(t: unknown, max: number): string | null {
  if (typeof t !== "string") return null;
  const s = t.replace(RARO, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const c = Array.from(s);
  return c.length > max ? c.slice(0, max).join("").trim() : s;
}
const enc = new TextEncoder();
/** Lo que viaja por la sala (JSON en UTF-8, versión 1): lo lee OficinaMundoPuro de apps/web/motor/39_oficina_mundo.js. */
export const mensaje = {
  anuncio: (texto: string) => enc.encode(JSON.stringify({ v: 1, texto })),
  sala: (a: ClaveSala) => enc.encode(JSON.stringify({ v: 1, a })),
  balizas: (finca: string) => enc.encode(JSON.stringify({ v: 1, finca })),
};
/** «todas» o una clave → los nombres de sala de LiveKit */
export const salasDe = (s: ClaveSala | "todas"): string[] => (s === "todas" ? CLAVES_SALA.map(k => SALAS[k]) : [SALAS[s]]);

const APAGADA = { error: "presencia_apagada", mensaje: "La visita compartida no está disponible en este servidor." } as const;
const FINCA = { type: "string", pattern: "^[a-z0-9_-]{1,32}$" } as const;
const UTM_X = { type: "number", minimum: 100_000, maximum: 900_000 } as const, UTM_Y = { type: "number", minimum: 3_900_000, maximum: 4_900_000 } as const;
const UNA_LINEA = (max: number) => ({ type: "string", minLength: 1, maxLength: max }) as const;
const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;

export interface BalizaOficial { id: number; finca: string; x: number; y: number; titulo: string; texto: string | null; hasta: string }

/** Las vigentes de una finca (desde ≤ ahora < hasta, sin retirar), de la más nueva a la más vieja. Coordenadas EPSG:25830, al centímetro. */
export async function balizasVigentes(bd: Pick<Bd, "query">, finca: string): Promise<BalizaOficial[]> {
  const r = await bd.query<{ id: string | number; finca: string; x: number; y: number; titulo: string; texto: string | null; hasta: Date }>(
    `SELECT id, finca, round(ST_X(punto)::numeric, 2)::float AS x, round(ST_Y(punto)::numeric, 2)::float AS y, titulo, texto, hasta
       FROM balizas_oficiales WHERE finca = $1 AND retirada_en IS NULL AND desde <= now() AND hasta > now()
      ORDER BY id DESC LIMIT ${BALIZAS_MAX_POR_FINCA}`, [finca]);
  return r.rows.map(b => ({ id: Number(b.id), finca: b.finca, x: b.x, y: b.y, titulo: b.titulo, texto: b.texto, hasta: new Date(b.hasta).toISOString() }));
}

/**
 * ¿Cae el punto en la finca? Con contorno vigente (OF3b), dentro de él con su holgura; si no, dentro de la caja de sus olivos medidos + MARGEN_FINCA_M
 * (el mismo límite que el editor de hazas). null si la finca no tiene ni contorno ni olivos (no se sabe dónde está).
 */
export async function puntoEnFinca(bd: Pick<Bd, "query">, finca: string, x: number, y: number): Promise<boolean | null> {
  const r = (await bd.query<{ en_contorno: boolean | null; en_caja: boolean | null }>(
    `SELECT (SELECT ST_DWithin(k.geom, p.g, $4) FROM fincas_contorno k WHERE k.finca = $3 AND k.retirado_en IS NULL) AS en_contorno,
            (SELECT CASE WHEN count(*) > 0 THEN ST_Within(p.g, ST_SetSRID(ST_Expand(ST_Extent(o.geom), $5)::geometry, 25830)) END FROM olivos o WHERE o.finca = $3) AS en_caja
       FROM (SELECT ST_SetSRID(ST_MakePoint($1, $2), 25830) AS g) p`, [x, y, finca, CONTORNO_HOLGURA_M, MARGEN_FINCA_M])).rows[0];
  if (!r) return null;
  return r.en_contorno ?? r.en_caja ?? null;
}

/** Avisa a las salas de que las balizas de la finca han cambiado (el motor vuelve a pedirlas). Si LiveKit falla, no pasa nada: el motor las repide cada 5 min. */
async function avisaBalizas(moderador: ModeradorSala | null, finca: string, log: { warn: (o: unknown, m: string) => void }): Promise<void> {
  if (!moderador) return;
  for (const s of salasDe("todas")) {
    try { await moderador.envia(s, TEMAS_OFICINA.balizas, mensaje.balizas(finca)); } catch (e) { log.warn({ err: (e as Error).message, sala: s }, "balizas: no se pudo avisar a la sala"); }
  }
}

export async function rutasOficinaMundo(app: FastifyInstance, ctx: Contexto, moderador: ModeradorSala | null): Promise<void> {
  const { bd } = ctx;
  const lk = ctx.config.livekit;

  // ---- anunciar (decisión 114: texto; la voz, solo de la guía en las guiadas, F3)
  app.post<{ Body: { texto: string; sala: ClaveSala | "todas" } }>("/api/admin/presencia/anuncio", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 6, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["texto", "sala"], properties: { texto: UNA_LINEA(ANUNCIO_MAX), sala: { type: "string", enum: [...CLAVES_SALA, "todas"] } } } },
  }, async (req, rep) => {
    if (!lk || !moderador) return rep.code(503).send(APAGADA);
    const texto = limpiaTexto(req.body.texto, ANUNCIO_MAX);
    if (!texto) return rep.code(400).send({ error: "texto_vacio", mensaje: "El anuncio no puede ir vacío." });
    const salas = salasDe(req.body.sala), datos = mensaje.anuncio(texto), llegaron: string[] = [];
    for (const s of salas) if (await moderador.envia(s, TEMAS_OFICINA.anuncio, datos)) llegaron.push(s);
    // se apunta después de mandarlo: si LiveKit falla, el error sube (500) y no queda apuntado lo que no se hizo
    await audita(bd, req.session.hogarId!, "admin.presencia_anuncio", { sala: req.body.sala, salas: llegaron.join(","), texto });
    return { salas: llegaron };
  });

  // ---- llevar a la gente a otra sala: la api INVITA (cada uno decide en su pantalla si va; decisión pendiente de Antonio si un día se lleva sin preguntar)
  app.post<{ Body: { de: ClaveSala; a: ClaveSala } }>("/api/admin/presencia/llevar", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 6, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["de", "a"], properties: { de: { type: "string", enum: [...CLAVES_SALA] }, a: { type: "string", enum: [...CLAVES_SALA] } } } },
  }, async (req, rep) => {
    if (!lk || !moderador) return rep.code(503).send(APAGADA);
    if (req.body.de === req.body.a) return rep.code(400).send({ error: "misma_sala", mensaje: "La sala de destino es la misma." });
    const llego = await moderador.envia(SALAS[req.body.de], TEMAS_OFICINA.sala, mensaje.sala(req.body.a));
    await audita(bd, req.session.hogarId!, "admin.presencia_llevar", { de: req.body.de, a: req.body.a, habia_sala: llego });
    return { enviado: llego };
  });

  // ---- balizas oficiales (OFICINA.md §6: título y texto, visibles para todos y con caducidad)
  app.get<{ Querystring: { finca: string } }>("/api/balizas-oficiales", {
    preHandler: requiereSesion,
    schema: { querystring: { type: "object", additionalProperties: false, required: ["finca"], properties: { finca: FINCA } } },
  }, async req => ({ finca: req.query.finca, srs: "EPSG:25830", balizas: await balizasVigentes(bd, req.query.finca) }));

  app.post<{ Body: { finca: string; x: number; y: number; titulo: string; texto?: string; horas?: number } }>("/api/admin/balizas", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["finca", "x", "y", "titulo"],
        properties: { finca: FINCA, x: UTM_X, y: UTM_Y, titulo: UNA_LINEA(BALIZA_TITULO_MAX), texto: UNA_LINEA(BALIZA_TEXTO_MAX), horas: { type: "integer", minimum: BALIZA_HORAS.min, maximum: BALIZA_HORAS.max } },
      },
    },
  }, async (req, rep) => {
    const b = req.body, titulo = limpiaTexto(b.titulo, BALIZA_TITULO_MAX), texto = b.texto === undefined ? null : limpiaTexto(b.texto, BALIZA_TEXTO_MAX);
    if (!titulo) return rep.code(400).send({ error: "titulo_vacio", mensaje: "La baliza necesita un título." });
    const dentro = await puntoEnFinca(bd, b.finca, b.x, b.y);
    if (dentro === null) return rep.code(400).send({ error: "finca_desconocida", mensaje: "No se sabe dónde está esa finca (ni contorno ni olivos medidos)." });
    if (!dentro) return rep.code(400).send({ error: "fuera_de_finca", mensaje: "Ese punto cae fuera de la finca." });
    const n = (await bd.query<{ n: number }>("SELECT count(*)::int AS n FROM balizas_oficiales WHERE finca = $1 AND retirada_en IS NULL AND hasta > now()", [b.finca])).rows[0]!.n;
    if (n >= BALIZAS_MAX_POR_FINCA) return rep.code(409).send({ error: "demasiadas", mensaje: "Ya hay " + BALIZAS_MAX_POR_FINCA + " balizas oficiales en esta finca: quita alguna antes." });
    const id = Number((await bd.query<{ id: string }>(
      `INSERT INTO balizas_oficiales (finca, punto, titulo, texto, hasta, autor_id)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 25830), $4, $5, now() + make_interval(hours => $6), $7) RETURNING id`,
      [b.finca, b.x, b.y, titulo, texto, b.horas ?? BALIZA_HORAS.defecto, req.session.hogarId])).rows[0]!.id);
    await audita(bd, req.session.hogarId!, "admin.baliza_puesta", { id, finca: b.finca, horas: b.horas ?? BALIZA_HORAS.defecto });
    await avisaBalizas(moderador, b.finca, req.log);
    return rep.code(201).send({ id });
  });

  app.put<{ Params: { id: number }; Body: { x: number; y: number } }>("/api/admin/balizas/:id", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: UTM_X, y: UTM_Y } } },
  }, async (req, rep) => {
    const f = (await bd.query<{ finca: string }>("SELECT finca FROM balizas_oficiales WHERE id = $1 AND retirada_en IS NULL AND hasta > now()", [req.params.id])).rows[0];
    if (!f) return rep.code(404).send({ error: "no_existe", mensaje: "Esa baliza no existe, ya caducó o se quitó." });
    const dentro = await puntoEnFinca(bd, f.finca, req.body.x, req.body.y);
    if (!dentro) return rep.code(400).send({ error: "fuera_de_finca", mensaje: "Ese punto cae fuera de la finca." });
    await bd.query("UPDATE balizas_oficiales SET punto = ST_SetSRID(ST_MakePoint($2, $3), 25830) WHERE id = $1", [req.params.id, req.body.x, req.body.y]);
    await audita(bd, req.session.hogarId!, "admin.baliza_movida", { id: req.params.id, finca: f.finca });
    await avisaBalizas(moderador, f.finca, req.log);
    return { id: req.params.id };
  });

  app.delete<{ Params: { id: number } }>("/api/admin/balizas/:id", {
    preHandler: OFICINA,
    schema: { params: ID },
  }, async (req, rep) => {
    const f = (await bd.query<{ finca: string }>(
      "UPDATE balizas_oficiales SET retirada_en = now(), retirada_por = $2 WHERE id = $1 AND retirada_en IS NULL RETURNING finca", [req.params.id, req.session.hogarId])).rows[0];
    if (!f) return rep.code(404).send({ error: "no_existe", mensaje: "Esa baliza no existe o ya se quitó." });
    await audita(bd, req.session.hogarId!, "admin.baliza_quitada", { id: req.params.id, finca: f.finca });
    await avisaBalizas(moderador, f.finca, req.log);
    return rep.code(204).send();
  });
}
