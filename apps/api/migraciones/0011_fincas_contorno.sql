-- 0011_fincas_contorno.sql — el contorno de cada finca (OF3b, decisión 140): la unión de sus parcelas SIGPAC o catastrales, que
-- sustituye a la «caja de los olivos medidos + 150 m» como límite del editor de hazas (src/admin/hazas.ts, validaEnFinca).
-- Sin contorno vigente de una finca, el límite sigue siendo la caja de hoy. Solo hacia arriba (src/bd/migra.ts): no se edita; se añade 0012_….

-- Up Migration

-- ---------------------------------------------------------------- los contornos (con su historia)
-- Una fila por carga. Cargar uno nuevo RETIRA el vigente (retirado_en) en vez de borrarlo: la historia no se reescribe, como en
-- hazas_versiones. Quitar el contorno (volver a la caja) es retirarlo sin poner otro. Lo cargan la tubería
-- (tuberia/contorno/contorno_finca.py --sql, con psql) y la api (PUT /api/admin/fincas/:finca/contorno, solo admin con confirmación
-- reciente), las dos por la misma función de abajo; la auditoría la escribe quien llama (admin.contorno_cargado / tuberia.contorno_cargado).
-- No guarda las referencias de las parcelas (son datos de la explotación): solo cuántas fueron, de qué fuente y cuándo se consultó.
CREATE TABLE fincas_contorno (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finca         text NOT NULL CHECK (finca ~ '^[a-z0-9_-]{1,32}$'),
  geom          geometry(MultiPolygon, 25830) NOT NULL CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
  superficie_ha numeric(12, 4) GENERATED ALWAYS AS (round((ST_Area(geom) / 10000.0)::numeric, 4)) STORED,
  fuente        text NOT NULL CHECK (fuente IN ('sigpac', 'catastro')),
  consultado_en date NOT NULL,
  parcelas      integer NOT NULL CHECK (parcelas >= 1),
  cargado_por   bigint REFERENCES hogares (id) ON DELETE SET NULL,   -- null: la tubería
  cargado_en    timestamptz NOT NULL DEFAULT now(),
  retirado_en   timestamptz,
  retirado_por  bigint REFERENCES hogares (id) ON DELETE SET NULL,
  CHECK (retirado_en IS NOT NULL OR retirado_por IS NULL)
);
-- un solo contorno vigente por finca
CREATE UNIQUE INDEX fincas_contorno_vigente ON fincas_contorno (finca) WHERE retirado_en IS NULL;
CREATE INDEX fincas_contorno_geom ON fincas_contorno USING gist (geom);

-- Carga un contorno (GeoJSON Polygon|MultiPolygon en EPSG:25830, sin crs) y retira el vigente de esa finca. Devuelve el id nuevo.
-- Rechaza lo ilegible o no válido con un error (SQLSTATE 22023) que la api convierte en 400.
CREATE FUNCTION fincas_contorno_carga(p_finca text, p_geojson text, p_fuente text, p_consultado date, p_parcelas integer, p_autor bigint)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  g  geometry;
  n  bigint;
BEGIN
  g := ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(p_geojson), 25830));
  IF GeometryType(g) <> 'MULTIPOLYGON' THEN
    RAISE EXCEPTION 'contorno_no_valido: no es un polígono' USING ERRCODE = '22023';
  END IF;
  IF NOT ST_IsValid(g) THEN
    RAISE EXCEPTION 'contorno_no_valido: %', ST_IsValidReason(g) USING ERRCODE = '22023';
  END IF;
  IF ST_Area(g) < 100 THEN
    RAISE EXCEPTION 'contorno_no_valido: menos de 100 m²' USING ERRCODE = '22023';
  END IF;
  UPDATE fincas_contorno SET retirado_en = now(), retirado_por = p_autor WHERE finca = p_finca AND retirado_en IS NULL;
  INSERT INTO fincas_contorno (finca, geom, fuente, consultado_en, parcelas, cargado_por)
  VALUES (p_finca, g, p_fuente, p_consultado, p_parcelas, p_autor) RETURNING id INTO n;
  RETURN n;
END
$$;

-- ---------------------------------------------------------------- permisos
-- La api lee, añade y RETIRA (solo esas dos columnas); ni cambia la geometría de una carga ni borra la historia.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    REVOKE ALL ON fincas_contorno FROM gemelo_api;
    GRANT SELECT, INSERT ON fincas_contorno TO gemelo_api;
    GRANT UPDATE (retirado_en, retirado_por) ON fincas_contorno TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
