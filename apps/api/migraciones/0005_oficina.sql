-- 0005_oficina.sql — acceso de la oficina (OF1, ADR-0024, decisiones 104-106; doc/sistema/OFICINA.md §2):
-- el rol `oficina`, los aparatos confiables de oficina (con su aprobación) y lo que la sesión necesita para ser «de oficina»
-- (de qué aparato viene y cuándo se confirmó por última vez). Contrato: contratos/sesion.md § Oficina.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0006_….

-- Up Migration

-- ---------------------------------------------------------------- el rol (decisión 104)
-- `oficina` para el día a día; `admin` además para parámetros, roles y re-hornear. Postgres admite ADD VALUE dentro de la
-- transacción de la migración, pero el valor nuevo no se puede USAR en ella: por eso nada de lo de abajo lo nombra.
ALTER TYPE rol_hogar ADD VALUE IF NOT EXISTS 'oficina';

-- ---------------------------------------------------------------- aparatos confiables de oficina
-- Un navegador de una cuenta de oficina (rol oficina o admin). En el navegador vive un secreto de 256 bits en la cookie
-- `__Host-gemelo-aparato`; aquí solo su SHA-256. Nace PENDIENTE al entrar con el enlace desde un aparato nuevo y se aprueba:
--   'aparato'        desde otro aparato de oficina ya aprobado (aprobado_por = la cuenta que aprobó);
--   'segundo_enlace' la misma persona vuelve a entrar con otro enlace, desde este aparato, pasados ≥ 5 min (y < 24 h);
--   'consola'        desde la consola del servidor (RUNBOOK-VPS: recuperar el acceso si se pierden todos los aparatos).
-- Revocarlo cierra sus sesiones (la api lo hace al revocar; además, una sesión de oficina sin aparato vivo no vale).
CREATE TABLE aparatos_oficina (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hogar_id      bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  nombre        text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 40),
  hash          bytea NOT NULL UNIQUE CHECK (octet_length(hash) = 32),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  aprobado_en   timestamptz,
  aprobado_por  bigint REFERENCES hogares (id) ON DELETE SET NULL,
  aprobado_como text CHECK (aprobado_como IN ('aparato', 'segundo_enlace', 'consola')),
  ultimo_uso_en timestamptz,
  revocado_en   timestamptz,
  -- aprobado_por puede quedar NULL si se borra la cuenta que aprobó: el aparato sigue aprobado y la auditoría guarda el hecho
  CONSTRAINT aparatos_oficina_aprobacion CHECK ((aprobado_en IS NULL) = (aprobado_como IS NULL))
);
CREATE INDEX aparatos_oficina_hogar ON aparatos_oficina (hogar_id);

-- ---------------------------------------------------------------- sesiones de oficina
-- aparato_id: el aparato de oficina desde el que se entró (NULL en las de los hogares). Una sesión de una cuenta de oficina sin
--   aparato (p. ej. una de antes de esta migración, o una de unas gafas vinculadas con el código corto) NO vale: la api la ignora.
-- confirmada_en: la última vez que la persona demostró ser ella (entrar con un enlace; con OF13, también la llave de acceso).
--   «Confirmación reciente» = confirmada_en hace menos de 15 min [valor de partida]. NULL en las de los hogares.
-- La caducidad de oficina (12 h absolutas, 2 h sin actividad) no necesita columnas: expira_en se fija al crearla y la
-- inactividad se mide con ultima_actividad_en, como en las de los hogares, con otro umbral según el rol.
ALTER TABLE sesiones
  ADD COLUMN aparato_id    bigint REFERENCES aparatos_oficina (id) ON DELETE CASCADE,
  ADD COLUMN confirmada_en timestamptz;
CREATE INDEX sesiones_aparato ON sesiones (aparato_id) WHERE aparato_id IS NOT NULL;

-- ---------------------------------------------------------------- permisos
-- Los privilegios por defecto de la 0001 ya dan filas a gemelo_api en la tabla nueva; se repite explícito (como la 0002 y
-- la 0004) para que no dependa de quién la creó.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON aparatos_oficina TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
