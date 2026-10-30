// GET /api/hazas (GeoJSON, solo lindes y lo justo para pintarlas) y GET /api/hazas/:id (ficha con lista blanca).
// Ambas tras sesión (decisión 16) y para todos los roles: la comunidad es abierta (las hazas ajenas se ven, sin titular).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import type { Contexto } from "../contexto.ts";
import { construyeFicha, type FilaEvento, type FilaHaza, type FilaParcela, type FilaSincronia, HERRAMIENTAS_FICHA } from "./ficha.ts";

const CONTRATOS = process.env["GEMELO_CONTRATOS"] ?? fileURLToPath(new URL("../../../../contratos/", import.meta.url));
/** Un esquema de contratos/ (la única fuente): la api lo lee del repo (o de la imagen, GEMELO_CONTRATOS). */
export function esquemaContrato(fichero: string): Record<string, unknown> {
  const e = JSON.parse(readFileSync(CONTRATOS.replace(/[\\/]?$/, "/") + fichero, "utf8")) as Record<string, unknown>;
  delete e["$schema"]; delete e["$id"]; delete e["$comment"];
  return e;
}
/** El esquema de la ficha de haza (contratos/haza.schema.json). */
export const esquemaFicha = (): Record<string, unknown> => esquemaContrato("haza.schema.json");

const coleccion = {
  type: "object", additionalProperties: false, required: ["type", "srs", "features"],
  properties: {
    type: { type: "string", enum: ["FeatureCollection"] },
    srs: { type: "string", enum: ["EPSG:25830", "EPSG:4326"] },
    features: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["type", "id", "geometry", "properties"],
        properties: {
          type: { type: "string", enum: ["Feature"] },
          id: { type: "integer" },
          geometry: {
            type: "object", additionalProperties: false, required: ["type", "coordinates"],
            properties: { type: { type: "string", enum: ["MultiPolygon"] }, coordinates: { type: "array", items: { type: "array", items: { type: "array", items: { type: "array", items: { type: "number" } } } } } },
          },
          properties: {
            type: "object", additionalProperties: false, required: ["codigo", "nombre", "finca", "es_mia"],
            properties: { codigo: { type: "string" }, nombre: { type: "string" }, finca: { type: "string" }, es_mia: { type: "boolean" } },
          },
        },
      },
    },
  },
} as const;

export async function rutasHazas(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;

  app.get<{ Querystring: { srs?: "25830" | "4326"; finca?: string } }>("/api/hazas", {
    preHandler: requiereSesion,
    schema: {
      querystring: { type: "object", additionalProperties: false, properties: { srs: { type: "string", enum: ["25830", "4326"] }, finca: { type: "string", pattern: "^[a-z0-9_-]{1,32}$" } } },
      response: { 200: coleccion },
    },
  }, async (req, rep) => {
    const srs = req.query.srs === "4326" ? 4326 : 25830;
    const r = await bd.query<{ id: number; codigo: string; nombre: string; finca: string; es_mia: boolean; geometria: { type: "MultiPolygon"; coordinates: number[][][][] } }>(
      `SELECT id, codigo, nombre, finca, coalesce(hogar_id = $1, false) AS es_mia,
              ST_AsGeoJSON(CASE WHEN $2::int = 4326 THEN ST_Transform(geom, 4326) ELSE geom END, CASE WHEN $2::int = 4326 THEN 7 ELSE 2 END)::json AS geometria
         FROM hazas WHERE ($3::text IS NULL OR finca = $3) ORDER BY codigo`,
      [req.session.hogarId, srs, req.query.finca ?? null]);
    rep.header("cache-control", "private, no-cache");
    return {
      type: "FeatureCollection", srs: "EPSG:" + srs,
      features: r.rows.map(f => ({ type: "Feature", id: f.id, geometry: f.geometria, properties: { codigo: f.codigo, nombre: f.nombre, finca: f.finca, es_mia: f.es_mia } })),
    };
  });

  app.get<{ Params: { id: number } }>("/api/hazas/:id", {
    preHandler: requiereSesion,
    schema: {
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } },
      response: { 200: esquemaFicha() },
    },
  }, async (req, rep) => {
    const id = req.params.id;
    const h = await bd.query<FilaHaza>(
      `SELECT h.id, h.codigo, h.nombre, h.finca, coalesce(h.hogar_id = $2, false) AS es_mia,
              CASE WHEN g.alias_visible THEN g.alias END AS alias,
              h.superficie_ha, h.olivos_declarados, h.olivos_declarados_fuente, h.ndvi_relativo, h.ndvi_fecha, h.ndvi_fuente,
              (SELECT count(*)::int FROM olivos o WHERE o.fuente = 'lidar' AND ST_Intersects(o.geom, h.geom)) AS olivos_lidar
         FROM hazas h LEFT JOIN hogares g ON g.id = h.hogar_id WHERE h.id = $1`, [id, req.session.hogarId]);
    const haza = h.rows[0];
    if (!haza) return rep.code(404).send({ error: "no_existe", mensaje: "No hay ninguna haza con ese número." });
    const [ev, pa, si] = await Promise.all([
      bd.query<FilaEvento>("SELECT tipo, fecha, parcela_ot, datos FROM eventos_haza WHERE haza_id = $1 ORDER BY fecha DESC, id DESC LIMIT 1000", [id]),
      bd.query<FilaParcela>("SELECT parcela_ot, ha_compartidas FROM haza_parcela WHERE haza_id = $1 ORDER BY parcela_ot", [id]),
      bd.query<FilaSincronia>(
        `SELECT DISTINCT ON (herramienta) herramienta, estado, consultado_en FROM sincronias_ot
          WHERE herramienta = ANY($1) AND terminada_en IS NOT NULL ORDER BY herramienta, empezada_en DESC`, [HERRAMIENTAS_FICHA as unknown as string[]]),
    ]);
    rep.header("cache-control", "private, no-cache");
    return construyeFicha(haza, ev.rows, pa.rows, si.rows);
  });
}
