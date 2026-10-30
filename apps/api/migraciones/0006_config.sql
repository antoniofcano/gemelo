-- 0006_config.sql — configuración versionada del mundo (C6 de ADR-0023 y OF6 de doc/sistema/OFICINA.md; decisiones 111-113
-- y 118): interruptores de componentes, parámetros de la escalera de olivos y calendario de épocas. El cuerpo cumple
-- contratos/config.schema.json (lo valida la api antes de guardarlo: apps/api/src/config/valida.ts). Va detrás de la 0005
-- (acceso de la oficina, OF1).
-- Una versión NUNCA se reescribe: el cuerpo, el número y el autor son inmutables (lo impide el disparador) y no se borra
-- (gemelo_api no tiene DELETE). Solo cambia su estado, y solo hacia delante:
--   borrador → en_prueba → publicada → retirada; borrador y en_prueba también → retirada (descartar).
-- «Volver atrás» es publicar una COPIA de una versión vieja como versión nueva (copia_de), que nace publicada.
-- A lo sumo una publicada y una en prueba a la vez (índices únicos parciales).
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0007_….

-- Up Migration

CREATE TABLE config_versiones (
  version    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estado     text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'en_prueba', 'publicada', 'retirada')),
  esquema    smallint NOT NULL DEFAULT 1 CHECK (esquema >= 1),
  cuerpo     jsonb NOT NULL CHECK (jsonb_typeof(cuerpo) = 'object' AND (cuerpo ->> 'v') = '1'),
  nota       text CHECK (char_length(nota) <= 500),
  autor_id   bigint REFERENCES hogares (id) ON DELETE SET NULL,
  copia_de   integer REFERENCES config_versiones (version),
  creada_en  timestamptz NOT NULL DEFAULT now(),
  estado_en  timestamptz NOT NULL DEFAULT now(),
  estado_por bigint REFERENCES hogares (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX config_una_publicada ON config_versiones ((true)) WHERE estado = 'publicada';
CREATE UNIQUE INDEX config_una_en_prueba ON config_versiones ((true)) WHERE estado = 'en_prueba';

CREATE FUNCTION config_versiones_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version <> OLD.version OR NEW.cuerpo IS DISTINCT FROM OLD.cuerpo OR NEW.esquema <> OLD.esquema OR NEW.nota IS DISTINCT FROM OLD.nota
     OR NEW.autor_id IS DISTINCT FROM OLD.autor_id OR NEW.copia_de IS DISTINCT FROM OLD.copia_de OR NEW.creada_en <> OLD.creada_en THEN
    RAISE EXCEPTION 'una versión de la configuración no se reescribe (v%): se crea otra', OLD.version USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.estado <> OLD.estado AND NOT (
       (OLD.estado = 'borrador' AND NEW.estado IN ('en_prueba', 'retirada'))
    OR (OLD.estado = 'en_prueba' AND NEW.estado IN ('publicada', 'retirada'))
    OR (OLD.estado = 'publicada' AND NEW.estado = 'retirada')) THEN
    RAISE EXCEPTION 'la configuración v% no puede pasar de % a %', OLD.version, OLD.estado, NEW.estado USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER config_versiones_inmutable BEFORE UPDATE ON config_versiones FOR EACH ROW EXECUTE FUNCTION config_versiones_inmutable();

-- ---------------------------------------------------------------- permisos
-- Filas sí, borrar no: el historial es la memoria de qué se publicó y quién (además de la auditoría).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT, UPDATE ON config_versiones TO gemelo_api;
    REVOKE DELETE, TRUNCATE ON config_versiones FROM gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
