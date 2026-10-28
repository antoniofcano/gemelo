-- 0001_inicial.sql — esquema de partida del servidor del gemelo (fase F1a).
-- Geometría en ETRS89 / UTM 30N (EPSG:25830), la misma que el motor (contratos/indice.schema.json).
-- Borrar un hogar (derecho de supresión, RGPD) arrastra en cascada todo lo suyo: sesiones, enlaces,
-- avatar, preguntas y asistencias; sus hazas quedan sin asignar y la auditoría pierde la referencia.
-- La aplica src/bd/migra.ts dentro de una transacción; no se edita una vez publicada: se añade 0002_….

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE rol_hogar AS ENUM ('hogar', 'guia', 'corresponsal', 'admin');

-- ---------------------------------------------------------------- personas (una cuenta por hogar)
CREATE TABLE hogares (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  correo        citext NOT NULL UNIQUE
                CHECK (length(correo) BETWEEN 3 AND 254 AND correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  rol           rol_hogar NOT NULL DEFAULT 'hogar',
  alias         text CHECK (alias IS NULL OR char_length(alias) BETWEEN 3 AND 20),
  alias_visible boolean NOT NULL DEFAULT false,
  activo        boolean NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hogares_alias_unico ON hogares (lower(alias)) WHERE alias IS NOT NULL;

-- Sesiones: en la cookie viaja el token; aquí solo su SHA-256.
CREATE TABLE sesiones (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hogar_id            bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  hash                bytea NOT NULL UNIQUE CHECK (octet_length(hash) = 32),
  creada_en           timestamptz NOT NULL DEFAULT now(),
  ultima_actividad_en timestamptz NOT NULL DEFAULT now(),
  expira_en           timestamptz NOT NULL,
  revocada_en         timestamptz,
  CHECK (expira_en > creada_en)
);
CREATE INDEX sesiones_hogar ON sesiones (hogar_id);

-- Enlaces mágicos: un solo uso, 15 min; solo el SHA-256 del token.
CREATE TABLE tokens_acceso (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hogar_id  bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  hash      bytea NOT NULL UNIQUE CHECK (octet_length(hash) = 32),
  creado_en timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz NOT NULL,
  usado_en  timestamptz,
  CHECK (expira_en > creado_en AND expira_en <= creado_en + interval '1 hour')
);
CREATE INDEX tokens_acceso_hogar ON tokens_acceso (hogar_id);

CREATE TABLE avatares (
  hogar_id       bigint PRIMARY KEY REFERENCES hogares (id) ON DELETE CASCADE,
  camisa         smallint NOT NULL CHECK (camisa BETWEEN 0 AND 5),
  sombrero       text NOT NULL CHECK (sombrero IN ('ninguno', 'paja', 'gorra')),
  piel           smallint NOT NULL CHECK (piel BETWEEN 0 AND 4),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- el olivar
-- Haza: zona dibujada por la oficina (decisión 12), que abarca una o varias parcelas de OlivarTrack o un trozo.
-- hogar_id es el titular: NUNCA sale por la api (contratos/haza.schema.json).
CREATE TABLE hazas (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                   text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Za-z0-9_-]{1,32}$'),
  nombre                   text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 60),
  finca                    text NOT NULL CHECK (finca ~ '^[a-z0-9_-]{1,32}$'),
  hogar_id                 bigint REFERENCES hogares (id) ON DELETE SET NULL,
  geom                     geometry(MultiPolygon, 25830) NOT NULL CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
  superficie_ha            numeric(10, 4) GENERATED ALWAYS AS (round((ST_Area(geom) / 10000.0)::numeric, 4)) STORED,
  olivos_declarados        integer CHECK (olivos_declarados >= 0),
  olivos_declarados_fuente text CHECK (char_length(olivos_declarados_fuente) <= 80),
  ndvi_relativo            numeric(5, 3) CHECK (ndvi_relativo BETWEEN -1 AND 1),
  ndvi_fecha               date,
  ndvi_fuente              text CHECK (char_length(ndvi_fuente) <= 80),
  creada_en                timestamptz NOT NULL DEFAULT now(),
  actualizada_en           timestamptz NOT NULL DEFAULT now(),
  CHECK ((ndvi_relativo IS NULL) = (ndvi_fecha IS NULL)),
  CHECK (olivos_declarados IS NULL OR olivos_declarados_fuente IS NOT NULL)
);
CREATE INDEX hazas_geom ON hazas USING gist (geom);
CREATE INDEX hazas_hogar ON hazas (hogar_id);

-- Relación n:m con las parcelas de OlivarTrack (su id global «finca:parcela»).
CREATE TABLE haza_parcela (
  haza_id        bigint NOT NULL REFERENCES hazas (id) ON DELETE CASCADE,
  parcela_ot     text NOT NULL CHECK (parcela_ot ~ '^[A-Za-z0-9:_.-]{1,64}$'),
  ha_compartidas numeric(10, 4) CHECK (ha_compartidas > 0),
  PRIMARY KEY (haza_id, parcela_ot)
);
CREATE INDEX haza_parcela_parcela ON haza_parcela (parcela_ot);

-- Olivos con posición (LiDAR medido, dron o campo). El recuento «declarado» va en hazas.olivos_declarados.
-- id_estable y tipo dejan el hueco del constructor de olivos-tipo (fase F1b): tipo = -1 es «sin tipo».
CREATE TABLE olivos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_estable text NOT NULL UNIQUE CHECK (id_estable ~ '^[A-Za-z0-9:_.-]{1,64}$'),
  geom       geometry(Point, 25830) NOT NULL,
  tipo       smallint NOT NULL DEFAULT -1 CHECK (tipo >= -1),
  fuente     text NOT NULL CHECK (fuente IN ('lidar', 'dron', 'campo')),
  altura_m   numeric(5, 2) CHECK (altura_m >= 0 AND altura_m < 40)
);
CREATE INDEX olivos_geom ON olivos USING gist (geom);

-- Lo que llega de OlivarTrack, ya pasado por la lista blanca (src/ot/mapeo.ts) y repartido a cada haza por su parcela.
-- La clave natural hace idempotente la sincronía; quitar una parcela de una haza borra sus eventos (FK compuesta).
CREATE TABLE eventos_haza (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  haza_id       bigint NOT NULL,
  parcela_ot    text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('tratamiento', 'analitica', 'fenologia', 'avance')),
  fecha         date NOT NULL,
  clave_natural text NOT NULL CHECK (char_length(clave_natural) BETWEEN 1 AND 200),
  datos         jsonb NOT NULL CHECK (jsonb_typeof(datos) = 'object'),
  origen        text NOT NULL DEFAULT 'olivartrack',
  consultado_en timestamptz NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (haza_id, clave_natural),
  FOREIGN KEY (haza_id, parcela_ot) REFERENCES haza_parcela (haza_id, parcela_ot) ON DELETE CASCADE
);
CREATE INDEX eventos_haza_tipo ON eventos_haza (haza_id, tipo, fecha DESC);

-- Cada lectura de una herramienta: su estado (ok / truncado / parcial / error), de cuándo es y el cursor de novedades.
CREATE TABLE sincronias_ot (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  herramienta   text NOT NULL,
  empezada_en   timestamptz NOT NULL DEFAULT now(),
  terminada_en  timestamptz,
  estado        text NOT NULL CHECK (estado IN ('ok', 'truncado', 'parcial', 'error')),
  consultado_en timestamptz,
  recibidos     integer NOT NULL DEFAULT 0,
  guardados     integer NOT NULL DEFAULT 0,
  cursor        text,
  avisos        jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX sincronias_ot_herramienta ON sincronias_ot (herramienta, empezada_en DESC);

-- ---------------------------------------------------------------- comunidad
CREATE TABLE preguntas (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hogar_id     bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  haza_id      bigint REFERENCES hazas (id) ON DELETE SET NULL,
  texto        text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 1000),
  creada_en    timestamptz NOT NULL DEFAULT now(),
  respuesta    text CHECK (char_length(respuesta) <= 4000),
  respondida_en timestamptz
);
CREATE INDEX preguntas_hogar ON preguntas (hogar_id);

CREATE TABLE visitas (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo     text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 120),
  tipo       text NOT NULL CHECK (tipo IN ('guiada', 'libre')),
  empieza_en timestamptz NOT NULL,
  termina_en timestamptz,
  guia_id    bigint REFERENCES hogares (id) ON DELETE SET NULL,
  creada_en  timestamptz NOT NULL DEFAULT now(),
  CHECK (termina_en IS NULL OR termina_en > empieza_en)
);

CREATE TABLE visitas_asistentes (
  visita_id bigint NOT NULL REFERENCES visitas (id) ON DELETE CASCADE,
  hogar_id  bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  apuntado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visita_id, hogar_id)
);

-- Auditoría sin datos personales en «detalle» (lo comprueba la api al escribir). Al borrar el hogar queda anónima.
CREATE TABLE auditoria (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuando   timestamptz NOT NULL DEFAULT now(),
  hogar_id bigint REFERENCES hogares (id) ON DELETE SET NULL,
  accion   text NOT NULL CHECK (accion ~ '^[a-z_.]{1,64}$'),
  detalle  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detalle) = 'object')
);
CREATE INDEX auditoria_cuando ON auditoria (cuando DESC);

-- ---------------------------------------------------------------- permisos mínimos
-- Si existe el rol de la aplicación (lo crea infra/bd-inicial/01-roles.sh), solo puede leer y escribir filas:
-- ni DDL, ni borrar o cambiar la auditoría.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT USAGE ON SCHEMA public TO gemelo_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hogares, sesiones, tokens_acceso, avatares, hazas, haza_parcela, olivos,
      eventos_haza, sincronias_ot, preguntas, visitas, visitas_asistentes TO gemelo_api;
    GRANT SELECT, INSERT ON auditoria TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
