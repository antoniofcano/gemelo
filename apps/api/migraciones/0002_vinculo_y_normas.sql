-- 0002_vinculo_y_normas.sql — código corto para vincular un aparato (Quest) y consentimiento del primer acceso (F1a).
-- Contrato: contratos/sesion.md (§ Código corto, § Primer acceso). Decisiones 46 y 61 (código corto), UX.md §4.4–4.5.
-- No se edita una vez publicada: se añade 0003_….

-- Up Migration

-- Códigos de vínculo: las gafas (sin sesión) piden uno y lo enseñan; un aparato con sesión lo aprueba tecleándolo; las
-- gafas, que sondean con su propio secreto, reciben entonces su sesión. Nada en claro:
--   codigo_hash = HMAC-SHA256(secreto de la sesión, código normalizado): con 30 bits de código, un SHA-256 a secas se
--                 sacaría por fuerza bruta de una copia de la base; con el HMAC hace falta además el secreto del servidor;
--   sondeo_hash = SHA-256 del secreto de sondeo (256 bits) que solo tienen las gafas.
-- hogar_id es quién lo aprobó (NULL mientras espera). Borrar el hogar arrastra sus códigos.
CREATE TABLE codigos_vinculo (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_hash  bytea NOT NULL UNIQUE CHECK (octet_length(codigo_hash) = 32),
  sondeo_hash  bytea NOT NULL UNIQUE CHECK (octet_length(sondeo_hash) = 32),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  expira_en    timestamptz NOT NULL,
  hogar_id     bigint REFERENCES hogares (id) ON DELETE CASCADE,
  aprobado_en  timestamptz,
  rechazado_en timestamptz,
  usado_en     timestamptz,
  CHECK (expira_en > creado_en AND expira_en <= creado_en + interval '10 minutes'),
  CHECK (aprobado_en IS NULL OR rechazado_en IS NULL),
  CHECK ((aprobado_en IS NULL) = (hogar_id IS NULL)),
  CHECK (usado_en IS NULL OR aprobado_en IS NOT NULL)
);
CREATE INDEX codigos_vinculo_hogar ON codigos_vinculo (hogar_id);

-- Primer acceso (UX.md §4.5): qué versión de las normas aceptó el hogar y cuándo, y si quiere avisos por correo
-- (opcional y desmarcado por defecto). Sin normas aceptadas (o con una versión vieja), la web enseña el primer acceso.
ALTER TABLE hogares
  ADD COLUMN normas_version      smallint CHECK (normas_version >= 1),
  ADD COLUMN normas_aceptadas_en timestamptz,
  ADD COLUMN avisos_correo       boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT hogares_normas_con_fecha CHECK ((normas_version IS NULL) = (normas_aceptadas_en IS NULL));

-- Permisos: la 0001 dejó los privilegios por defecto (filas) para las tablas nuevas; se repite aquí explícito para que
-- no dependa de quién creó la tabla.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON codigos_vinculo TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
