-- 0010_hazas_versiones.sql — la sección Hazas de la oficina (OF3, doc/sistema/OFICINA.md §4, decisiones 12 y 95):
-- cada guardado de una haza es una VERSIÓN y la historia no se reescribe nunca. (La 0009 es de C9a; esta va detrás.)
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0011_….

-- Up Migration

-- ---------------------------------------------------------------- la versión vigente de cada haza
-- Sube sola (disparador) cada vez que cambia la geometría: la oficina guarda «sobre la versión N» y, si otra persona guardó
-- antes, la api contesta 409 en vez de pisarla (PUT /api/admin/hazas/:id/geom con `version`).
ALTER TABLE hazas ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1);

-- ---------------------------------------------------------------- el historial
-- Una fila por versión: la geometría de ese momento, las parcelas de OlivarTrack que tenía, quién, cuándo, qué se hizo y una
-- nota. SIN clave ajena a `hazas`: la historia de una haza juntada con otra (o borrada) sobrevive a la haza. «Volver» a una
-- versión vieja es guardar una copia de su geometría como versión nueva (accion 'volver', desde_version = la vieja).
-- Lo escribe el disparador de `hazas` (no la api a mano), así que también la tubería (tuberia/hazas, que recarga por
-- `codigo`) deja su versión. La api cuenta el porqué en variables de la transacción (set_config(..., true)):
--   gemelo.autor  id de la cuenta de oficina    gemelo.accion  una de las de abajo    gemelo.nota  texto corto
--   gemelo.desde  la versión a la que se vuelve (solo 'volver')
CREATE TABLE hazas_versiones (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  haza_id       bigint NOT NULL,
  codigo        text NOT NULL,
  finca         text NOT NULL,
  version       integer NOT NULL CHECK (version >= 1),
  accion        text NOT NULL CHECK (accion IN ('inicial', 'carga', 'crear', 'editar', 'partir', 'partida_de', 'juntar', 'juntada_en', 'volver', 'borrar')),
  geom          geometry(MultiPolygon, 25830) NOT NULL,
  superficie_ha numeric(10, 4) GENERATED ALWAYS AS (round((ST_Area(geom) / 10000.0)::numeric, 4)) STORED,
  parcelas      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(parcelas) = 'array'),
  autor_id      bigint REFERENCES hogares (id) ON DELETE SET NULL,
  cuando        timestamptz NOT NULL DEFAULT now(),
  nota          text CHECK (char_length(nota) <= 200),
  desde_version integer CHECK (desde_version >= 1),
  UNIQUE (haza_id, version),
  CHECK ((accion = 'volver') = (desde_version IS NOT NULL))
);
CREATE INDEX hazas_versiones_cuando ON hazas_versiones (haza_id, version DESC);

CREATE FUNCTION hazas_parcelas_json(h bigint) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', parcela_ot, 'ha', ha_compartidas) ORDER BY parcela_ot), '[]'::jsonb)
    FROM haza_parcela WHERE haza_id = h
$$;

CREATE FUNCTION hazas_version_sube() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.geom IS DISTINCT FROM OLD.geom THEN
    NEW.version := OLD.version + 1;
    NEW.actualizada_en := now();
  ELSE
    NEW.version := OLD.version;   -- la versión no se toca a mano
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER hazas_version_sube BEFORE UPDATE ON hazas FOR EACH ROW EXECUTE FUNCTION hazas_version_sube();

CREATE FUNCTION hazas_version_apunta() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  autor  bigint  := nullif(current_setting('gemelo.autor', true), '')::bigint;
  accion text    := nullif(current_setting('gemelo.accion', true), '');
  nota   text    := nullif(current_setting('gemelo.nota', true), '');
  desde  integer := nullif(current_setting('gemelo.desde', true), '')::integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO hazas_versiones (haza_id, codigo, finca, version, accion, geom, parcelas, autor_id, nota)
    VALUES (OLD.id, OLD.codigo, OLD.finca, OLD.version + 1, CASE WHEN accion = 'juntada_en' THEN accion ELSE 'borrar' END,
            OLD.geom, hazas_parcelas_json(OLD.id), autor, nota);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.version = OLD.version THEN RETURN NEW; END IF;   -- sin cambio de geometría, sin versión
  IF accion IS NULL OR accion NOT IN ('crear', 'editar', 'partir', 'partida_de', 'juntar', 'volver') THEN
    accion := 'carga';   -- lo que no viene de la oficina (la tubería, la consola)
    desde := NULL;
  END IF;
  IF accion <> 'volver' THEN desde := NULL; END IF;
  INSERT INTO hazas_versiones (haza_id, codigo, finca, version, accion, geom, parcelas, autor_id, nota, desde_version)
  VALUES (NEW.id, NEW.codigo, NEW.finca, NEW.version, accion, NEW.geom, hazas_parcelas_json(NEW.id), autor, nota, desde);
  RETURN NEW;
END
$$;
CREATE TRIGGER hazas_version_apunta AFTER INSERT OR UPDATE ON hazas FOR EACH ROW EXECUTE FUNCTION hazas_version_apunta();
-- BEFORE DELETE: a esa hora las parcelas de la haza aún están (el borrado en cascada de haza_parcela va después)
CREATE TRIGGER hazas_version_borra BEFORE DELETE ON hazas FOR EACH ROW EXECUTE FUNCTION hazas_version_apunta();

-- las hazas que ya estaban: su versión 1
INSERT INTO hazas_versiones (haza_id, codigo, finca, version, accion, geom, parcelas, cuando)
SELECT id, codigo, finca, 1, 'inicial', geom, hazas_parcelas_json(id), actualizada_en FROM hazas;

-- ---------------------------------------------------------------- permisos
-- El historial es solo-añadir para la api (como la auditoría): ni cambiar ni borrar versiones.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT ON hazas_versiones TO gemelo_api;
    REVOKE UPDATE, DELETE, TRUNCATE ON hazas_versiones FROM gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
