// La ficha de un olivo para la oficina (OF15b, doc/sistema/OFICINA.md §4 y §9): lo medido (posición UTM y altura del LiDAR), la haza que lo
// contiene y su titular ACTUAL (solo el id del hogar: nunca correo ni nombre) y lo que la familia le ha puesto (nombre, decoración, foto o
// pintura). Es solo lectura y solo para roles oficina y admin (el mismo guardián que las demás /api/admin/*).
// Lo medido y lo que puso la familia no se mezclan: `personalizacion` es ilustrativo y de la familia, no un dato de la explotación (regla 5).
// FOTOS (EIPD pendiente, decisión 165): la ficha NO sirve la imagen ni su url: devuelve solo {tipo, medio_id}. La imagen, para moderar, sigue
// saliendo únicamente por la bandeja (`contenido.url` → GET /api/medios/:clave, con sesión); esta ruta no abre un segundo camino a las fotos.
import type { FastifyInstance } from "fastify";
import type { Cliente } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { OFICINA } from "../oficina/acceso.ts";
import { catalogo, type Catalogo } from "../vida/decoraciones.ts";

/** Lo mínimo de la base que usa la ficha: una conexión o una de mentira en las pruebas. */
export type Consulta = Pick<Cliente, "query">;

const PARAM_OLIVO = {
  type: "object", additionalProperties: false, required: ["finca", "copas_id"],
  properties: { finca: { type: "string", pattern: "^[a-z0-9_-]{1,32}$" }, copas_id: { type: "integer", minimum: 0, maximum: 4294967295 } },
} as const;

export interface FichaOlivo {
  finca: string; copas_id: number;
  posicion: { e: number; n: number };
  altura_m: number | null; tipo: number;
  haza: { id: number; codigo: string; titular: { hogar_id: number } | null } | null;
  personalizacion: {
    personalizacion_id: number; estado: "visible" | "retirado"; nombre: string | null;
    decoracion: { id: string; nombre: string | null; epoca: string | null } | null;
    objeto: { tipo: "foto" | "pintura"; medio_id: number } | null;
  } | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** La ficha de un olivo vivo (no retirado) de una finca, o null si no existe. Tres consultas como mucho, todas de solo lectura. */
export async function fichaDelOlivo(c: Consulta, finca: string, copasId: number, cat: Catalogo = catalogo()): Promise<FichaOlivo | null> {
  const o = (await c.query<{ id: number | string; x: number | string; y: number | string; altura_m: number | string | null; tipo: number | string }>(
    "SELECT id, round(ST_X(geom)::numeric, 2) AS x, round(ST_Y(geom)::numeric, 2) AS y, altura_m, tipo FROM olivos WHERE finca = $1 AND copas_id = $2 AND retirado_en IS NULL",
    [finca, copasId])).rows[0];
  if (!o) return null;
  // la haza que contiene el olivo: la misma regla (ST_Intersects olivo→haza, la de menor id) que usa vida/rutas.ts
  const z = (await c.query<{ id: number | string; codigo: string; hogar_id: number | string | null }>(
    "SELECT h.id, h.codigo, h.hogar_id FROM hazas h JOIN olivos o ON ST_Intersects(h.geom, o.geom) WHERE o.id = $1 ORDER BY h.id LIMIT 1", [o.id])).rows[0];
  let personalizacion: FichaOlivo["personalizacion"] = null;
  if (z && z.hogar_id !== null) {
    // solo lo del titular ACTUAL de la haza (si se reasigna, lo del anterior deja de ser de este olivo); la visible manda sobre una retirada
    const p = (await c.query<{ id: number | string; estado: "visible" | "retirado"; nombre: string | null; decoracion: string | null; objeto_tipo: "foto" | "pintura" | null; medio_id: number | string | null }>(
      `SELECT id, estado, nombre, decoracion, objeto_tipo, medio_id FROM personalizaciones
        WHERE olivo_id = $1 AND hogar_id = $2 ORDER BY (estado = 'visible') DESC, actualizada_en DESC, id DESC LIMIT 1`, [o.id, z.hogar_id])).rows[0];
    if (p) {
      const pieza = p.decoracion ? cat.piezas.find(x => x.id === p.decoracion) : undefined;
      personalizacion = {
        personalizacion_id: Number(p.id), estado: p.estado, nombre: p.nombre,
        decoracion: p.decoracion ? { id: p.decoracion, nombre: pieza?.nombre ?? null, epoca: pieza?.epoca ?? null } : null,
        objeto: p.objeto_tipo && p.medio_id !== null ? { tipo: p.objeto_tipo, medio_id: Number(p.medio_id) } : null,
      };
    }
  }
  return {
    finca, copas_id: copasId, posicion: { e: Number(o.x), n: Number(o.y) }, altura_m: num(o.altura_m), tipo: Number(o.tipo),
    haza: z ? { id: Number(z.id), codigo: z.codigo, titular: z.hogar_id === null ? null : { hogar_id: Number(z.hogar_id) } } : null,
    personalizacion,
  };
}

export async function rutasOlivosOficina(app: FastifyInstance, ctx: Contexto): Promise<void> {
  app.get<{ Params: { finca: string; copas_id: number } }>("/api/admin/olivos/:finca/:copas_id", { preHandler: OFICINA, schema: { params: PARAM_OLIVO } }, async (req, rep) => {
    const f = await fichaDelOlivo(ctx.bd, req.params.finca, req.params.copas_id);
    if (!f) return rep.code(404).send({ error: "olivo_no_existe", mensaje: "No hay ningún olivo con ese número en esa finca." });
    rep.header("cache-control", "no-store");
    return f;
  });
}
