// Récords de los juegos casuales (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md; contrato: contratos/api.openapi.yaml; tabla:
// migraciones/0009_juegos.sql). El motor (apps/web/motor/40_juegos.js) guarda aquí cada partida acabada y lee el récord de la familia.
//  - POST /api/juegos/:id/partidas (cualquier sesión del hogar, también la de unas gafas vinculadas: juegan los nietos): { puntos, duracion_s }.
//    Se rechaza lo que no es creíble (más puntos de los que caben en esa duración: TOPES, el mismo cálculo que el juego) y hay límite de
//    frecuencia por IP y por hogar. No pretende parar a quien se empeñe (el juego corre en su aparato): solo las trampas groseras.
//  - GET /api/juegos/:id/records: el récord del PROPIO hogar y cuántas partidas lleva. Nada de otras familias.
//  - GET /api/juegos/:id/clasificacion?n=: (C9c, decisión 137, opción «por alias») la mejor puntuación de cada hogar activo, ordenada: las n primeras y el
//    puesto del propio hogar. De cada fila solo sale el puesto, los puntos y el alias SI el hogar lo hizo visible (alias_visible); sin alias, null (la pantalla
//    dice «Otra familia»). Nunca nombre real, correo, ni id del hogar o de la base: la fila propia se marca con es_mia.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import type { Contexto } from "../contexto.ts";

/** Los juegos que existen y su tope de puntos creíbles: base + porSegundo × duración (= CaeLaCosechaPuro.TOPE del motor; lo comprueba
 *  pruebas/guardianes/juego_cosecha.test.js). */
export const TOPES: Record<string, { base: number; porSegundo: number }> = {
  "cae-la-cosecha": { base: 1000, porSegundo: 200 },
};
export const DURACION = { min: 3, max: 3600 } as const;
export const PARTIDAS_POR_HORA = 60;
export const TEXTO_LIMITE_JUEGOS = "Llevas muchas partidas seguidas. Descansa un rato y vuelve a probar.";
const TEXTO_NO_CREIBLE = "Esa partida no cuadra (duración o puntos fuera de lo posible) y no se ha guardado.";

/** ¿Es creíble una partida? Devuelve el motivo si no lo es. */
export function motivoNoCreible(juego: string, puntos: number, duracion: number): string | null {
  const t = TOPES[juego];
  if (!t) return "juego";
  if (!Number.isInteger(puntos) || puntos < 0) return "puntos";
  if (!Number.isInteger(duracion) || duracion < DURACION.min || duracion > DURACION.max) return "duracion";
  if (puntos > t.base + t.porSegundo * duracion) return "puntos";
  return null;
}

export const CLASIFICACION = { porDefecto: 5, max: 20 } as const;

const PARAM = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", pattern: "^[a-z][a-z0-9-]{1,31}$" } } } as const;
const CONSULTA = { type: "object", additionalProperties: false, properties: { n: { type: "integer", minimum: 1, maximum: CLASIFICACION.max, default: CLASIFICACION.porDefecto } } } as const;
const CUERPO = {
  type: "object", additionalProperties: false, required: ["puntos", "duracion_s"],
  properties: { puntos: { type: "integer", minimum: 0, maximum: 10_000_000 }, duracion_s: { type: "integer", minimum: 1, maximum: 86_400 } },
} as const;

interface FilaPuesto { puesto: string; puntos: number; hogar_id: string; alias: string | null; total: string }
export interface PuestoClasificacion { puesto: number; alias: string | null; puntos: number; es_mia: boolean }

/** Da forma pública a las filas de la consulta: nada del id del hogar sale de aquí (solo si la fila es la propia). Pura, para probarla sin base. */
export function formaClasificacion(filas: FilaPuesto[], hogar: number, n: number): { total: number; puestos: PuestoClasificacion[]; mia: PuestoClasificacion | null } {
  const todas = filas.map(f => ({ puesto: Number(f.puesto), alias: f.alias, puntos: f.puntos, es_mia: Number(f.hogar_id) === hogar }));
  return { total: filas.length ? Number(filas[0]!.total) : 0, puestos: todas.filter(f => f.puesto <= n).slice(0, n), mia: todas.find(f => f.es_mia) ?? null };
}

interface FilaRecord { puntos: number; duracion_s: number; jugada_en: Date }

export async function rutasJuegos(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const porHogar = app.createRateLimit({ max: PARTIDAS_POR_HORA, timeWindow: 3600_000, keyGenerator: (r: FastifyRequest) => "juegos:" + String(r.session?.hogarId ?? "?") });

  async function record(hogar: number, juego: string) {
    const [m, n] = await Promise.all([
      bd.query<FilaRecord>("SELECT puntos, duracion_s, jugada_en FROM juegos_partidas WHERE hogar_id = $1 AND juego = $2 ORDER BY puntos DESC, jugada_en ASC LIMIT 1", [hogar, juego]),
      bd.query<{ n: string }>("SELECT count(*) AS n FROM juegos_partidas WHERE hogar_id = $1 AND juego = $2", [hogar, juego]),
    ]);
    const f = m.rows[0];
    return { record: f ? { puntos: f.puntos, duracion_s: f.duracion_s, fecha: f.jugada_en } : null, partidas: Number(n.rows[0]?.n ?? 0) };
  }
  const noExiste = (rep: FastifyReply) => rep.code(404).send({ error: "no_existe" });

  app.post<{ Params: { id: string }; Body: { puntos: number; duracion_s: number } }>("/api/juegos/:id/partidas", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { params: PARAM, body: CUERPO },
  }, async (req, rep) => {
    const juego = req.params.id;
    if (!TOPES[juego]) return noExiste(rep);
    const motivo = motivoNoCreible(juego, req.body.puntos, req.body.duracion_s);
    if (motivo) {
      req.log.warn({ evento: "juego_partida_no_creible", juego, motivo }, "partida no creíble");
      return rep.code(422).send({ error: "partida_no_creible", mensaje: TEXTO_NO_CREIBLE });
    }
    const lim = await porHogar(req);
    if (!lim.isAllowed && lim.isExceeded) return rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_JUEGOS });
    const hogar = req.session.hogarId!;
    const antes = await record(hogar, juego);
    await bd.query("INSERT INTO juegos_partidas (hogar_id, juego, puntos, duracion_s) VALUES ($1, $2, $3, $4)", [hogar, juego, req.body.puntos, req.body.duracion_s]);
    const ahora = await record(hogar, juego);
    return rep.code(201).send({ juego, es_record: req.body.puntos > 0 && (!antes.record || req.body.puntos > antes.record.puntos), ...ahora });
  });

  app.get<{ Params: { id: string } }>("/api/juegos/:id/records", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { params: PARAM },
  }, async (req, rep) => {
    const juego = req.params.id;
    if (!TOPES[juego]) return noExiste(rep);
    rep.header("cache-control", "private, no-cache");
    return { juego, ...(await record(req.session.hogarId!, juego)) };
  });

  // la mejor puntuación de cada hogar activo (> 0), empates con el mismo puesto; las n primeras y la del propio hogar, vengan de donde vengan
  app.get<{ Params: { id: string }; Querystring: { n?: number } }>("/api/juegos/:id/clasificacion", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { params: PARAM, querystring: CONSULTA },
  }, async (req, rep) => {
    const juego = req.params.id;
    if (!TOPES[juego]) return noExiste(rep);
    const n = req.query.n ?? CLASIFICACION.porDefecto, hogar = req.session.hogarId!;
    const r = await bd.query<FilaPuesto>(
      `WITH mejores AS (
         SELECT DISTINCT ON (p.hogar_id) p.hogar_id, p.puntos, p.jugada_en
           FROM juegos_partidas p JOIN hogares g ON g.id = p.hogar_id
          WHERE p.juego = $1 AND g.activo AND p.puntos > 0
          ORDER BY p.hogar_id, p.puntos DESC, p.jugada_en ASC),
       puestos AS (SELECT m.*, rank() OVER (ORDER BY m.puntos DESC) AS puesto, count(*) OVER () AS total FROM mejores m)
       SELECT q.puesto, q.puntos, q.hogar_id, q.total, CASE WHEN g.alias_visible THEN g.alias END AS alias
         FROM puestos q JOIN hogares g ON g.id = q.hogar_id
        WHERE q.puesto <= $2 OR q.hogar_id = $3
        ORDER BY q.puesto, q.jugada_en, q.hogar_id`, [juego, n, hogar]);
    rep.header("cache-control", "private, no-cache");
    return { juego, ...formaClasificacion(r.rows, hogar, n) };
  });
}
