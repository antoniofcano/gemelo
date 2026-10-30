// Hazas de la oficina (OF3, doc/sistema/OFICINA.md §4, decisiones 12 y 95). La geometría MANDA EN EL SERVIDOR: PostGIS valida
// (ST_IsValid), comprueba que cae dentro de la finca (su contorno, OF3b; sin él, la caja de sus olivos + 150 m) y que no pisa otra haza, parte (ST_Split), junta (ST_Union) y cuenta los olivos
// medidos (ST_Intersects con el índice GiST de `olivos`, lo mismo que la ficha pública). El recuento del cliente es orientativo.
// Cada guardado es una VERSIÓN (tabla hazas_versiones, migración 0010, escrita por el disparador de `hazas`); «volver» guarda una
// copia de una versión vieja como versión nueva: el historial no se reescribe nunca. Rutas, todas con `requiereRol("oficina", "admin")`:
//   GET    /api/admin/hazas                        todas (o ?finca=) con geometría, versión, superficie, recuento, borde, solapes y titular
//   POST   /api/admin/hazas                        crea una haza dibujada (código, nombre, finca, geometría)
//   PUT    /api/admin/hazas/:id/geom               guarda la geometría editada SOBRE la versión `version` (si otra persona guardó antes: 409)
//   POST   /api/admin/hazas/:id/partir             parte por la línea entre dos de sus vértices: la parte mayor se queda, la otra es una haza nueva
//   POST   /api/admin/hazas/juntar                 junta dos vecinas (confirmación reciente): la primera se queda con todo, la segunda desaparece
//   DELETE /api/admin/hazas/:id?version=N          borra una haza sin titular ni nada colgado (confirmación reciente)
//   GET    /api/admin/hazas/:id/versiones          el historial (con la geometría de cada versión)
//   POST   /api/admin/hazas/:id/volver/:version    guarda como versión nueva la geometría de una vieja
// Asignar la haza a una familia NO es de aquí: la ficha usa las rutas de OF2 (PUT /api/admin/hogares/:id/haza y PUT /api/admin/hazas/:id/hogar).
// Todo queda en la auditoría (sin correos en el detalle).
import type { FastifyInstance, FastifyReply } from "fastify";
import { audita } from "../auth/servicio.ts";
import { type Bd, type Cliente, enTransaccion } from "../bd/pool.ts";
import type { Contexto } from "../contexto.ts";
import { AREA_MINIMA_M2, BORDE_M, compruebaCorte, compruebaGeometria, CONTORNO_HOLGURA_M, ESQUEMA_GEOMETRIA, type Geometria, MARGEN_FINCA_M, SOLAPE_TOLERADO_M2 } from "../hazas/geometria.ts";
import { OFICINA, OFICINA_CONFIRMADA } from "../oficina/acceso.ts";

const ENTERO = { type: "integer", minimum: 1, maximum: 2147483647 } as const;
const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: ENTERO } } as const;
const CODIGO = { type: "string", pattern: "^[A-Za-z0-9_-]{1,32}$" } as const;
const NOMBRE = { type: "string", minLength: 1, maxLength: 60, pattern: "^[^\\u0000-\\u001f\\u007f]+$" } as const;
const FINCA = { type: "string", pattern: "^[a-z0-9_-]{1,32}$" } as const;
const NOTA = { type: "string", maxLength: 200, pattern: "^[^\\u0000-\\u001f\\u007f]*$" } as const;
const PUNTO = { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } } as const;

/** Una respuesta que deshace la transacción en curso (se lanza dentro y se contesta fuera). */
class Rechazo extends Error {
  readonly codigo: number;
  readonly cuerpo: Record<string, unknown>;
  constructor(codigo: number, cuerpo: Record<string, unknown>) { super(String(cuerpo["error"])); this.codigo = codigo; this.cuerpo = cuerpo; }
}
const rechaza = (codigo: number, error: string, mensaje: string, extra: Record<string, unknown> = {}): never => { throw new Rechazo(codigo, { error, mensaje, ...extra }); };

export interface HazaOficina {
  id: number; codigo: string; nombre: string; finca: string; hogar_id: number | null; hogar_correo: string | null; version: number;
  superficie_ha: number; olivos: number; olivos_borde: number; olivos_declarados: number | null; olivos_declarados_fuente: string | null;
  parcelas: { id: string; ha: number | null }[]; solapes: { id: number; codigo: string; m2: number }[]; actualizada_en: string;
  geometria?: { type: "MultiPolygon"; coordinates: number[][][][] };
}

/**
 * Las hazas tal como las ve la oficina. El recuento es el de la ficha pública (olivos medidos por LiDAR dentro o en la linde);
 * `olivos_borde`, los de esos a menos de BORDE_M de la linde; `solapes`, las otras hazas de la finca que pisa (más de SOLAPE_TOLERADO_M2).
 */
export async function leeHazas(bd: Bd | Cliente, filtro: { id?: number; finca?: string | null; geometria: boolean }): Promise<HazaOficina[]> {
  const r = await bd.query<HazaOficina>(
    `SELECT h.id::int AS id, h.codigo, h.nombre, h.finca, h.hogar_id::int AS hogar_id, g.correo::text AS hogar_correo, h.version,
            h.superficie_ha::float AS superficie_ha, h.olivos_declarados, h.olivos_declarados_fuente, h.actualizada_en,
            o.olivos, o.olivos_borde, hazas_parcelas_json(h.id) AS parcelas,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo, 'm2', x.m2) ORDER BY x.codigo), '[]'::jsonb)
               FROM (SELECT v.id::int AS id, v.codigo, round(ST_Area(ST_Intersection(v.geom, h.geom))::numeric, 1)::float AS m2
                       FROM hazas v WHERE v.id <> h.id AND v.finca = h.finca AND v.geom && h.geom AND ST_Intersects(v.geom, h.geom)) x
              WHERE x.m2 > $4) AS solapes,
            CASE WHEN $3 THEN ST_AsGeoJSON(h.geom, 2)::json END AS geometria
       FROM hazas h
       LEFT JOIN hogares g ON g.id = h.hogar_id
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS olivos, count(*) FILTER (WHERE ST_DWithin(ol.geom, ST_Boundary(h.geom), $5))::int AS olivos_borde
           FROM olivos ol WHERE ol.fuente = 'lidar' AND ST_Intersects(ol.geom, h.geom)) o
      WHERE ($1::bigint IS NULL OR h.id = $1) AND ($2::text IS NULL OR h.finca = $2)
      ORDER BY h.finca, h.codigo`,
    [filtro.id ?? null, filtro.finca ?? null, filtro.geometria, SOLAPE_TOLERADO_M2, BORDE_M]);
  return r.rows.map(f => { if (!filtro.geometria) delete f.geometria; return f; });
}

/** El porqué de lo que va a cambiar en `hazas`: lo lee el disparador que escribe hazas_versiones (migración 0010). */
async function motivo(c: Cliente, autor: number, accion: string, nota: string | null, desde: number | null = null): Promise<void> {
  await c.query("SELECT set_config('gemelo.autor', $1, true), set_config('gemelo.accion', $2, true), set_config('gemelo.nota', $3, true), set_config('gemelo.desde', $4, true)",
    [String(autor), accion, nota ?? "", desde === null ? "" : String(desde)]);
}

/**
 * Valida en PostGIS una geometría (GeoJSON en EPSG:25830): válida, con superficie, dentro de la finca (su contorno vigente con
 * CONTORNO_HOLGURA_M, ST_CoveredBy; sin contorno, la caja de sus olivos medidos con MARGEN_FINCA_M) y sin pisar otras hazas de la finca
 * (salvo las de `excluir`). Lanza un Rechazo si no.
 */
async function validaEnFinca(c: Cliente, geojson: string, finca: string, excluir: number[]): Promise<void> {
  let v: { valida: boolean; motivo: string; area: number } | undefined;
  try {
    v = (await c.query<{ valida: boolean; motivo: string; area: number }>(
      "SELECT ST_IsValid(g) AS valida, ST_IsValidReason(g) AS motivo, ST_Area(g) AS area FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 25830) AS g) x", [geojson])).rows[0];
  } catch {
    rechaza(400, "geometria_no_valida", "La geometría no se puede leer.");
  }
  if (!v!.valida) rechaza(400, "geometria_no_valida", "La linde se cruza consigo misma o tiene un pico: corrígela antes de guardar.", { motivo: v!.motivo });
  if (v!.area < AREA_MINIMA_M2) rechaza(400, "demasiado_pequena", "La haza es demasiado pequeña (menos de " + AREA_MINIMA_M2 + " m²).");
  // el límite: el contorno vigente de la finca (OF3b, migración 0011) si lo hay; si no, la caja de sus olivos medidos + MARGEN_FINCA_M
  const k = (await c.query<{ fuente: string | null; dentro_contorno: boolean | null; fuera_m2: number | null }>(
    `SELECT k.fuente, ST_CoveredBy(x.g, ST_Buffer(k.geom, $3)) AS dentro_contorno,
            round(ST_Area(ST_Difference(x.g, k.geom))::numeric, 1)::float AS fuera_m2
       FROM fincas_contorno k, (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 25830) AS g) x
      WHERE k.finca = $2 AND k.retirado_en IS NULL`, [geojson, finca, CONTORNO_HOLGURA_M])).rows[0];
  if (k) {
    if (!k.dentro_contorno) {
      rechaza(400, "fuera_de_contorno", "La haza se sale del contorno de la finca (" + k.fuente + "): unos " + k.fuera_m2 + " m² quedan fuera. Ajusta la linde a la de la finca.",
        { fuera_m2: k.fuera_m2 });
    }
  } else {
    const f = (await c.query<{ hay: boolean; dentro: boolean | null }>(
      `SELECT count(*) > 0 AS hay,
              ST_Within(ST_SetSRID(ST_GeomFromGeoJSON($1), 25830), ST_SetSRID(ST_Expand(ST_Extent(geom), $3)::geometry, 25830)) AS dentro
         FROM olivos WHERE finca = $2`, [geojson, finca, MARGEN_FINCA_M])).rows[0]!;
    if (!f.hay) rechaza(400, "finca_desconocida", "No hay olivos medidos de esa finca en la base ni contorno cargado: sin ellos no se sabe dónde está.");
    if (!f.dentro) rechaza(400, "fuera_de_finca", "La haza se sale de la finca (más de " + MARGEN_FINCA_M + " m más allá de sus olivos medidos).");
  }
  const s = await c.query<{ id: number; codigo: string; m2: number }>(
    `SELECT h.id::int AS id, h.codigo, round(ST_Area(ST_Intersection(h.geom, x.g))::numeric, 1)::float AS m2
       FROM hazas h, (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 25830) AS g) x
      WHERE h.finca = $2 AND NOT (h.id = ANY($3::bigint[])) AND h.geom && x.g AND ST_Intersects(h.geom, x.g)
        AND ST_Area(ST_Intersection(h.geom, x.g)) > $4 ORDER BY h.codigo`, [geojson, finca, excluir, SOLAPE_TOLERADO_M2]);
  if (s.rows.length) rechaza(409, "solape", "La haza pisa a " + s.rows.map(x => x.codigo + " (" + x.m2 + " m²)").join(", ") + ". Ajusta la linde a la de la vecina.", { solapes: s.rows });
}

/** La haza bloqueada para cambiarla, comprobando que nadie la guardó después de la versión que se editó. */
async function bloquea(c: Cliente, id: number, version: number | null): Promise<{ id: number; codigo: string; finca: string; version: number; hogar_id: number | null }> {
  const h = (await c.query<{ id: number; codigo: string; finca: string; version: number; hogar_id: number | null }>(
    "SELECT id::int AS id, codigo, finca, version, hogar_id::int AS hogar_id FROM hazas WHERE id = $1 FOR UPDATE", [id])).rows[0];
  if (!h) return rechaza(404, "no_existe", "No hay ninguna haza con ese número.");
  if (version !== null && h.version !== version) {
    rechaza(409, "version_cambiada", "Otra persona guardó " + h.codigo + " mientras la editabas (ahora va por la versión " + h.version + "). Mira su versión y vuelve a aplicar tu cambio.",
      { actual: (await leeHazas(c, { id, geometria: true }))[0] });
  }
  return h;
}

/** Olivos personalizados por la familia que, con la geometría nueva, quedan fuera de la haza (aviso, no se impide). */
const personalizadosFuera = async (c: Cliente, id: number): Promise<number> =>
  (await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM personalizaciones p JOIN olivos o ON o.id = p.olivo_id JOIN hazas h ON h.id = p.haza_id
      WHERE p.haza_id = $1 AND p.estado = 'visible' AND NOT ST_Intersects(o.geom, h.geom)`, [id])).rows[0]!.n;

const codigoRepetido = (e: unknown): boolean => (e as { code?: string }).code === "23505";
const MENSAJE_CODIGO = { error: "codigo_repetido", mensaje: "Ya hay una haza con ese código." } as const;

async function responde(rep: FastifyReply, fn: () => Promise<unknown>): Promise<unknown> {
  try { return await fn(); } catch (e) {
    if (e instanceof Rechazo) return rep.code(e.codigo).send(e.cuerpo);
    if (codigoRepetido(e)) return rep.code(409).send(MENSAJE_CODIGO);
    throw e;
  }
}

export async function rutasHazasOficina(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;

  // ---------------------------------------------------------------- lista
  app.get<{ Querystring: { finca?: string; geometria?: boolean } }>("/api/admin/hazas", {
    preHandler: OFICINA,
    schema: { querystring: { type: "object", additionalProperties: false, properties: { finca: FINCA, geometria: { type: "boolean" } } } },
  }, async (req, rep) => {
    rep.header("cache-control", "no-store");
    return { srs: "EPSG:25830", hazas: await leeHazas(bd, { finca: req.query.finca ?? null, geometria: req.query.geometria === true }) };
  });

  // ---------------------------------------------------------------- crear
  app.post<{ Body: { codigo: string; nombre: string; finca: string; geometria: Geometria; nota?: string } }>("/api/admin/hazas", {
    preHandler: OFICINA,
    schema: { body: { type: "object", additionalProperties: false, required: ["codigo", "nombre", "finca", "geometria"],
      properties: { codigo: CODIGO, nombre: NOMBRE, finca: FINCA, geometria: ESQUEMA_GEOMETRIA, nota: NOTA } } },
  }, async (req, rep) => responde(rep, async () => {
    const b = req.body, mal = compruebaGeometria(b.geometria);
    if (mal) return rep.code(400).send(mal);
    const autor = req.session.hogarId!;
    const id = await enTransaccion(bd, async c => {
      const g = JSON.stringify(b.geometria);
      await validaEnFinca(c, g, b.finca, []);
      await motivo(c, autor, "crear", b.nota?.trim() || null);
      const ins = await c.query<{ id: number }>(
        "INSERT INTO hazas (codigo, nombre, finca, geom) VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 25830))) RETURNING id::int AS id",
        [b.codigo, b.nombre.trim(), b.finca, g]);
      const nueva = ins.rows[0]!.id;
      await audita(c, autor, "admin.haza_creada", { haza: nueva, codigo: b.codigo, finca: b.finca });
      return nueva;
    });
    return rep.code(201).send({ haza: (await leeHazas(bd, { id, geometria: true }))[0] });
  }));

  // ---------------------------------------------------------------- guardar la geometría editada
  app.put<{ Params: { id: number }; Body: { geometria: Geometria; version: number; nota?: string } }>("/api/admin/hazas/:id/geom", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["geometria", "version"],
      properties: { geometria: ESQUEMA_GEOMETRIA, version: ENTERO, nota: NOTA } } },
  }, async (req, rep) => responde(rep, async () => {
    const mal = compruebaGeometria(req.body.geometria);
    if (mal) return rep.code(400).send(mal);
    const autor = req.session.hogarId!, id = req.params.id;
    const r = await enTransaccion(bd, async c => {
      const h = await bloquea(c, id, req.body.version);
      const g = JSON.stringify(req.body.geometria);
      await validaEnFinca(c, g, h.finca, [id]);
      await motivo(c, autor, "editar", req.body.nota?.trim() || null);
      const u = await c.query<{ version: number }>("UPDATE hazas SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 25830)) WHERE id = $2 RETURNING version", [g, id]);
      const version = u.rows[0]!.version;
      if (version === h.version) return { sin_cambios: true, personalizados_fuera: 0 };
      await audita(c, autor, "admin.haza_editada", { haza: id, codigo: h.codigo, version });
      return { sin_cambios: false, personalizados_fuera: await personalizadosFuera(c, id) };
    });
    return { haza: (await leeHazas(bd, { id, geometria: true }))[0], ...r };
  }));

  // ---------------------------------------------------------------- partir por dos vértices
  app.post<{ Params: { id: number }; Body: { a: [number, number]; b: [number, number]; version: number; codigo: string; nombre: string; nota?: string } }>("/api/admin/hazas/:id/partir", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["a", "b", "version", "codigo", "nombre"],
      properties: { a: PUNTO, b: PUNTO, version: ENTERO, codigo: CODIGO, nombre: NOMBRE, nota: NOTA } } },
  }, async (req, rep) => responde(rep, async () => {
    const b = req.body, mal = compruebaCorte(b.a, b.b);
    if (mal) return rep.code(400).send(mal);
    const autor = req.session.hogarId!, id = req.params.id;
    const nueva = await enTransaccion(bd, async c => {
      const h = await bloquea(c, id, b.version);
      // los dos puntos se llevan al vértice más cercano (a menos de 5 cm: el cliente manda vértices redondeados al centímetro)
      const partes = (await c.query<{ n: number; trozos: number; dentro: boolean; area_a: number; area_b: number; geo_a: string; geo_b: string }>(
        `WITH h AS (SELECT geom FROM hazas WHERE id = $1),
              v AS (SELECT (ST_DumpPoints(geom)).geom AS p FROM h),
              a AS (SELECT p FROM v ORDER BY p <-> ST_SetSRID(ST_MakePoint($2, $3), 25830) LIMIT 1),
              b AS (SELECT p FROM v ORDER BY p <-> ST_SetSRID(ST_MakePoint($4, $5), 25830) LIMIT 1),
              l AS (SELECT ST_MakeLine(a.p, b.p) AS l,
                           ST_Distance(a.p, ST_SetSRID(ST_MakePoint($2, $3), 25830)) < 0.05 AND ST_Distance(b.p, ST_SetSRID(ST_MakePoint($4, $5), 25830)) < 0.05 AS cerca
                      FROM a, b),
              s AS (SELECT (ST_Dump(ST_Split(h.geom, l.l))).geom AS g FROM h, l WHERE l.cerca AND ST_Length(l.l) > 0.01),
              o AS (SELECT g, row_number() OVER (ORDER BY ST_Area(g) DESC) AS i FROM s)
         SELECT (SELECT ST_NumGeometries(geom) FROM h) AS n, (SELECT count(*)::int FROM o) AS trozos,
                coalesce((SELECT ST_Covers(h.geom, l.l) FROM h, l), false) AS dentro,
                (SELECT ST_Area(g) FROM o WHERE i = 1) AS area_a, (SELECT ST_Area(g) FROM o WHERE i = 2) AS area_b,
                (SELECT ST_AsGeoJSON(g) FROM o WHERE i = 1) AS geo_a, (SELECT ST_AsGeoJSON(g) FROM o WHERE i = 2) AS geo_b`,
        [id, b.a[0], b.a[1], b.b[0], b.b[1]])).rows[0]!;
      if (partes.n !== 1) rechaza(400, "corte_no_valido", "Solo se puede partir una haza de un único polígono.");
      if (partes.trozos !== 2 || !partes.dentro) rechaza(400, "corte_no_valido", "El corte tiene que ir de un vértice a otro de la haza por dentro de ella y dejarla en dos trozos.");
      if (partes.area_b < AREA_MINIMA_M2) rechaza(400, "demasiado_pequena", "Uno de los dos trozos es demasiado pequeño (menos de " + AREA_MINIMA_M2 + " m²).");
      await motivo(c, autor, "partir", "partida: la otra parte es " + b.codigo);
      await c.query("UPDATE hazas SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 25830)) WHERE id = $2", [partes.geo_a, id]);
      await motivo(c, autor, "partida_de", (b.nota?.trim() ? b.nota.trim() + " · " : "") + "sale de " + h.codigo);
      const ins = await c.query<{ id: number }>(
        "INSERT INTO hazas (codigo, nombre, finca, geom) VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 25830))) RETURNING id::int AS id",
        [b.codigo, b.nombre.trim(), h.finca, partes.geo_b]);
      const n = ins.rows[0]!.id;
      // las parcelas de OlivarTrack siguen siendo las mismas en los dos trozos (las hectáreas compartidas, sin saber: null)
      await c.query("INSERT INTO haza_parcela (haza_id, parcela_ot) SELECT $1, parcela_ot FROM haza_parcela WHERE haza_id = $2", [n, id]);
      await audita(c, autor, "admin.haza_partida", { haza: id, codigo: h.codigo, nueva: n, codigo_nueva: b.codigo });
      return n;
    });
    const [haza, otra] = await Promise.all([leeHazas(bd, { id, geometria: true }), leeHazas(bd, { id: nueva, geometria: true })]);
    return rep.code(201).send({ haza: haza[0], nueva: otra[0] });
  }));

  // ---------------------------------------------------------------- juntar dos vecinas
  app.post<{ Body: { a: number; b: number; version_a: number; version_b: number; nota?: string } }>("/api/admin/hazas/juntar", {
    preHandler: OFICINA_CONFIRMADA,
    schema: { body: { type: "object", additionalProperties: false, required: ["a", "b", "version_a", "version_b"],
      properties: { a: ENTERO, b: ENTERO, version_a: ENTERO, version_b: ENTERO, nota: NOTA } } },
  }, async (req, rep) => responde(rep, async () => {
    const { a, b } = req.body, autor = req.session.hogarId!;
    if (a === b) return rep.code(400).send({ error: "misma_haza", mensaje: "Elige dos hazas distintas." });
    const r = await enTransaccion(bd, async c => {
      // siempre en el mismo orden (por id) para que dos juntar cruzados no se esperen el uno al otro
      const [p, q] = a < b ? [a, b] : [b, a];
      const hp = await bloquea(c, p, p === a ? req.body.version_a : req.body.version_b);
      const hq = await bloquea(c, q, q === a ? req.body.version_a : req.body.version_b);
      const [ha, hb] = p === a ? [hp, hq] : [hq, hp];
      if (ha.finca !== hb.finca) rechaza(400, "otra_finca", "Las dos hazas son de fincas distintas.");
      if (ha.hogar_id !== null && hb.hogar_id !== null && ha.hogar_id !== hb.hogar_id) {
        rechaza(409, "titulares_distintos", "Las dos hazas son de familias distintas: quita la familia de una de ellas antes de juntarlas.");
      }
      const u = (await c.query<{ vecinas: boolean; geo: string; valida: boolean }>(
        `SELECT ST_DWithin(x.geom, y.geom, 0.05) AS vecinas, ST_AsGeoJSON(ST_Multi(ST_Union(x.geom, y.geom))) AS geo, ST_IsValid(ST_Union(x.geom, y.geom)) AS valida
           FROM hazas x, hazas y WHERE x.id = $1 AND y.id = $2`, [a, b])).rows[0]!;
      if (!u.vecinas) rechaza(409, "no_vecinas", "Las dos hazas no se tocan: solo se juntan vecinas.");
      if (!u.valida) rechaza(400, "geometria_no_valida", "La unión de las dos hazas no es una geometría válida.");
      // lo que colgaba de la segunda pasa a la primera (lo que se repetiría, como el mismo apunte del diario, se queda una vez)
      await c.query("INSERT INTO haza_parcela (haza_id, parcela_ot, ha_compartidas) SELECT $1, parcela_ot, ha_compartidas FROM haza_parcela WHERE haza_id = $2 ON CONFLICT DO NOTHING", [a, b]);
      await c.query("UPDATE personalizaciones SET haza_id = $1 WHERE haza_id = $2", [a, b]);
      await c.query("DELETE FROM diario_haza d WHERE d.haza_id = $2 AND EXISTS (SELECT 1 FROM diario_haza e WHERE e.haza_id = $1 AND e.clave_natural = d.clave_natural)", [a, b]);
      await c.query("UPDATE diario_haza SET haza_id = $1 WHERE haza_id = $2", [a, b]);
      await c.query("DELETE FROM lote_haza d WHERE d.haza_id = $2 AND EXISTS (SELECT 1 FROM lote_haza e WHERE e.haza_id = $1 AND e.lote_id = d.lote_id AND e.recogida_desde = d.recogida_desde)", [a, b]);
      await c.query("UPDATE lote_haza SET haza_id = $1 WHERE haza_id = $2", [a, b]);
      for (const t of ["bandeja", "avisos", "visitas", "preguntas"]) await c.query("UPDATE " + t + " SET haza_id = $1 WHERE haza_id = $2", [a, b]);
      if (ha.hogar_id === null && hb.hogar_id !== null) await c.query("UPDATE hazas SET hogar_id = $1 WHERE id = $2", [hb.hogar_id, a]);
      const nota = req.body.nota?.trim() || null;
      await motivo(c, autor, "juntada_en", (nota ? nota + " · " : "") + "juntada en " + ha.codigo);
      await c.query("DELETE FROM hazas WHERE id = $1", [b]);
      await motivo(c, autor, "juntar", (nota ? nota + " · " : "") + "se le junta " + hb.codigo);
      await c.query("UPDATE hazas SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 25830) WHERE id = $2", [u.geo, a]);
      await audita(c, autor, "admin.hazas_juntadas", { haza: a, codigo: ha.codigo, quitada: b, codigo_quitada: hb.codigo });
      return { quitada: { id: b, codigo: hb.codigo }, titular_de_la_segunda: ha.hogar_id === null && hb.hogar_id !== null };
    });
    return { haza: (await leeHazas(bd, { id: a, geometria: true }))[0], ...r };
  }));

  // ---------------------------------------------------------------- borrar
  app.delete<{ Params: { id: number }; Querystring: { version: number } }>("/api/admin/hazas/:id", {
    preHandler: OFICINA_CONFIRMADA,
    schema: { params: ID, querystring: { type: "object", additionalProperties: false, required: ["version"], properties: { version: ENTERO } } },
  }, async (req, rep) => responde(rep, async () => {
    const autor = req.session.hogarId!, id = req.params.id;
    await enTransaccion(bd, async c => {
      const h = await bloquea(c, id, req.query.version);
      if (h.hogar_id !== null) rechaza(409, "con_titular", "La haza tiene familia: quítasela antes de borrarla.");
      const colgado = (await c.query<{ n: number }>(
        `SELECT (SELECT count(*) FROM personalizaciones WHERE haza_id = $1) + (SELECT count(*) FROM diario_haza WHERE haza_id = $1)
              + (SELECT count(*) FROM lote_haza WHERE haza_id = $1) AS n`, [id])).rows[0]!;
      if (Number(colgado.n) > 0) rechaza(409, "con_contenido", "De la haza cuelgan árboles con nombre, apuntes del diario o lotes: júntala con una vecina en vez de borrarla.");
      await motivo(c, autor, "borrar", null);
      await c.query("DELETE FROM hazas WHERE id = $1", [id]);
      await audita(c, autor, "admin.haza_borrada", { haza: id, codigo: h.codigo });
    });
    return rep.code(204).send();
  }));

  // ---------------------------------------------------------------- historial
  app.get<{ Params: { id: number } }>("/api/admin/hazas/:id/versiones", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const r = await bd.query(
      `SELECT v.version, v.accion, v.cuando, v.nota, v.desde_version, v.superficie_ha::float AS superficie_ha, v.parcelas,
              g.correo::text AS autor, ST_AsGeoJSON(v.geom, 2)::json AS geometria
         FROM hazas_versiones v LEFT JOIN hogares g ON g.id = v.autor_id
        WHERE v.haza_id = $1 ORDER BY v.version DESC LIMIT 200`, [req.params.id]);
    if (!r.rows.length) return rep.code(404).send({ error: "no_existe", mensaje: "No hay ninguna haza con ese número." });
    rep.header("cache-control", "no-store");
    return { versiones: r.rows };
  });

  // ---------------------------------------------------------------- volver a una versión (una copia: versión nueva)
  app.post<{ Params: { id: number; version: number }; Body: { version_actual: number; nota?: string } }>("/api/admin/hazas/:id/volver/:version", {
    preHandler: OFICINA,
    schema: { params: { type: "object", additionalProperties: false, required: ["id", "version"], properties: { id: ENTERO, version: ENTERO } },
      body: { type: "object", additionalProperties: false, required: ["version_actual"], properties: { version_actual: ENTERO, nota: NOTA } } },
  }, async (req, rep) => responde(rep, async () => {
    const autor = req.session.hogarId!, { id, version } = req.params;
    const r = await enTransaccion(bd, async c => {
      const h = await bloquea(c, id, req.body.version_actual);
      const vieja = (await c.query<{ geo: string }>("SELECT ST_AsGeoJSON(geom) AS geo FROM hazas_versiones WHERE haza_id = $1 AND version = $2", [id, version])).rows[0];
      if (!vieja) rechaza(404, "version_no_existe", "Esa versión no existe.");
      await validaEnFinca(c, vieja!.geo, h.finca, [id]);
      await motivo(c, autor, "volver", req.body.nota?.trim() || "vuelta a la versión " + version, version);
      const u = await c.query<{ version: number }>("UPDATE hazas SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 25830)) WHERE id = $2 RETURNING version", [vieja!.geo, id]);
      if (u.rows[0]!.version === h.version) rechaza(409, "sin_cambios", "La haza ya tiene esa misma linde.");
      await audita(c, autor, "admin.haza_vuelta", { haza: id, codigo: h.codigo, desde: version, version: u.rows[0]!.version });
      return { personalizados_fuera: await personalizadosFuera(c, id) };
    });
    return { haza: (await leeHazas(bd, { id, geometria: true }))[0], ...r };
  }));
}
