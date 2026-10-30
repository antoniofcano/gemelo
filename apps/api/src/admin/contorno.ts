// El contorno de cada finca (OF3b, decisión 140; migración 0011): la unión de sus parcelas SIGPAC o catastrales, que sale de
// tuberia/contorno/contorno_finca.py y limita el editor de hazas. Sin contorno vigente, el límite sigue siendo la caja de los olivos
// medidos + MARGEN_FINCA_M (lo de OF3). La comprobación que manda es la de validaEnFinca (src/admin/hazas.ts); la del cliente es aviso.
//   GET    /api/admin/fincas/:finca/limite     el límite de hoy (contorno o caja), para el editor; con las hazas que se salen del contorno
//   PUT    /api/admin/fincas/:finca/contorno   carga un contorno y retira el vigente (solo admin, con confirmación reciente)
//   DELETE /api/admin/fincas/:finca/contorno   retira el vigente: la finca vuelve a la caja (solo admin, con confirmación reciente)
// La tubería también puede cargarlo con psql (contorno_finca.py --sql), por la misma función fincas_contorno_carga. Todo queda en la auditoría.
import type { FastifyInstance } from "fastify";
import { audita } from "../auth/servicio.ts";
import { type Bd, enTransaccion } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { compruebaGeometria, CONTORNO_HOLGURA_M, ESQUEMA_CONTORNO, type Geometria, MARGEN_FINCA_M, MAX_VERTICES_CONTORNO } from "../hazas/geometria.ts";
import { OFICINA, requiereConfirmacionReciente, requiereRol } from "../oficina/acceso.ts";

const FINCA = { type: "object", additionalProperties: false, required: ["finca"], properties: { finca: { type: "string", pattern: "^[a-z0-9_-]{1,32}$" } } } as const;
const SOLO_ADMIN_CONFIRMADO = [requiereRol("admin"), requiereConfirmacionReciente()];
/** Fuentes públicas oficiales admitidas (doc/operacion/DATOS.md § Contorno de la finca). Cuál se usa es decisión de Antonio (decisión 140). */
export const FUENTES_CONTORNO = ["sigpac", "catastro"] as const;

export interface Limite {
  finca: string; srs: "EPSG:25830"; tipo: "contorno" | "caja" | "ninguno"; holgura_m: number; margen_m: number | null;
  geometria: { type: "MultiPolygon"; coordinates: number[][][][] } | null;
  fuente: string | null; consultado_en: string | null; parcelas: number | null; superficie_ha: number | null; cargado_en: string | null;
  hazas_fuera: { id: number; codigo: string; m2: number }[];
}

/** El límite de la finca: su contorno vigente o, si no tiene, la caja de sus olivos medidos con MARGEN_FINCA_M (o nada si tampoco hay olivos). */
export async function leeLimite(bd: Bd, finca: string): Promise<Limite> {
  const base = { finca, srs: "EPSG:25830" as const, holgura_m: CONTORNO_HOLGURA_M };
  const k = (await bd.query<{ geometria: Limite["geometria"]; fuente: string; consultado_en: string; parcelas: number; superficie_ha: number; cargado_en: string; hazas_fuera: Limite["hazas_fuera"] }>(
    `SELECT ST_AsGeoJSON(k.geom, 2)::json AS geometria, k.fuente, to_char(k.consultado_en, 'YYYY-MM-DD') AS consultado_en, k.parcelas,
            k.superficie_ha::float AS superficie_ha, k.cargado_en,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'codigo', h.codigo, 'm2', round(ST_Area(ST_Difference(h.geom, k.geom))::numeric, 1)) ORDER BY h.codigo), '[]'::jsonb)
               FROM hazas h WHERE h.finca = k.finca AND NOT ST_CoveredBy(h.geom, ST_Buffer(k.geom, $2))) AS hazas_fuera
       FROM fincas_contorno k WHERE k.finca = $1 AND k.retirado_en IS NULL`, [finca, CONTORNO_HOLGURA_M])).rows[0];
  if (k) return { ...base, tipo: "contorno", margen_m: null, ...k };
  const c = (await bd.query<{ geometria: Limite["geometria"] }>(
    `SELECT CASE WHEN count(*) > 0 THEN ST_AsGeoJSON(ST_Multi(ST_SetSRID(ST_Expand(ST_Extent(geom), $2)::geometry, 25830)), 2)::json END AS geometria
       FROM olivos WHERE finca = $1`, [finca, MARGEN_FINCA_M])).rows[0]!;
  return { ...base, tipo: c.geometria ? "caja" : "ninguno", margen_m: MARGEN_FINCA_M, geometria: c.geometria ?? null,
    fuente: null, consultado_en: null, parcelas: null, superficie_ha: null, cargado_en: null, hazas_fuera: [] };
}

export async function rutasContornoFinca(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;

  app.get<{ Params: { finca: string } }>("/api/admin/fincas/:finca/limite", { preHandler: OFICINA, schema: { params: FINCA } }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    return await leeLimite(bd, req.params.finca);
  });

  app.put<{ Params: { finca: string }; Body: { geometria: Geometria; fuente: string; consultado_en: string; parcelas: number } }>("/api/admin/fincas/:finca/contorno", {
    preHandler: SOLO_ADMIN_CONFIRMADO,
    bodyLimit: 4 * 1024 * 1024,
    schema: { params: FINCA, body: { type: "object", additionalProperties: false, required: ["geometria", "fuente", "consultado_en", "parcelas"], properties: {
      geometria: ESQUEMA_CONTORNO, fuente: { type: "string", enum: [...FUENTES_CONTORNO] },
      consultado_en: { type: "string", pattern: "^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$" },
      parcelas: { type: "integer", minimum: 1, maximum: 100000 } } } },
  }, async (req, rep) => {
    const b = req.body, finca = req.params.finca, mal = compruebaGeometria(b.geometria, MAX_VERTICES_CONTORNO);
    if (mal) return rep.code(400).send(mal);
    const autor = req.session.hogarId!;
    try {
      await enTransaccion(bd, async c => {
        await c.query("SELECT fincas_contorno_carga($1, $2, $3, $4::date, $5, $6)", [finca, JSON.stringify(b.geometria), b.fuente, b.consultado_en, b.parcelas, autor]);
        const s = (await c.query<{ ha: number }>("SELECT superficie_ha::float AS ha FROM fincas_contorno WHERE finca = $1 AND retirado_en IS NULL", [finca])).rows[0]!;
        await audita(c, autor, "admin.contorno_cargado", { finca, fuente: b.fuente, consultado_en: b.consultado_en, parcelas: b.parcelas, superficie_ha: s.ha });
      });
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      // 22023: lo rechaza fincas_contorno_carga; XX000 / 22P02 / 22023: PostGIS no sabe leer el GeoJSON; 23514: un CHECK de la tabla
      if (codigo === "22023" || codigo === "XX000" || codigo === "22P02" || codigo === "23514" || codigo === "22007" || codigo === "22008") {
        return rep.code(400).send({ error: "contorno_no_valido", mensaje: "El contorno no es un polígono válido en EPSG:25830 (o la fecha no existe).", motivo: String((e as Error).message).slice(0, 200) });
      }
      throw e;
    }
    return rep.code(201).send(await leeLimite(bd, finca));
  });

  app.delete<{ Params: { finca: string } }>("/api/admin/fincas/:finca/contorno", { preHandler: SOLO_ADMIN_CONFIRMADO, schema: { params: FINCA } }, async (req, rep) => {
    const autor = req.session.hogarId!, finca = req.params.finca;
    const r = await enTransaccion(bd, async c => {
      const u = await c.query<{ id: number }>("UPDATE fincas_contorno SET retirado_en = now(), retirado_por = $2 WHERE finca = $1 AND retirado_en IS NULL RETURNING id::int AS id", [finca, autor]);
      if (u.rows.length) await audita(c, autor, "admin.contorno_retirado", { finca, contorno: u.rows[0]!.id });
      return u.rows.length;
    });
    if (!r) return rep.code(404).send({ error: "sin_contorno", mensaje: "Esa finca no tiene contorno cargado: ya usa la caja de sus olivos." });
    return rep.code(204).send();
  });
}
