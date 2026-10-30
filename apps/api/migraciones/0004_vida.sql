-- 0004_vida.sql — la «vida» antes del VPS (decisiones 91-97): olivos con id congelado, personalización de árboles por el
-- hogar titular, ficheros subidos, denuncias, bandeja de la oficina, diario de la haza, avisos al hogar, trazabilidad del
-- aceite por lote, eventos y visitas con inscripción. Las pantallas llegan después; las tablas, ya, para no migrar con
-- gente dentro. Contrato: contratos/vida.md, vida.schema.json y api.openapi.yaml. Datos personales: doc/sistema/VIDA.md.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0005_….

-- Up Migration

-- ---------------------------------------------------------------- olivos: id congelado (decisión 92)
-- El id del árbol es el `copas_id` del gemelo (ADR-0012) y, desde aquí, DEFINITIVO: identidad global = (finca, copas_id).
-- La tubería (tuberia/hazas) sigue cargando `id_estable` = «finca:copas_id»; el disparador rellena finca y copas_id de ahí,
-- y una vez puestos no cambian nunca (el disparador lo impide). De ellos cuelgan las personalizaciones de los hogares.
-- Vuelo LiDAR nuevo (no implementado; ver doc/sistema/VIDA.md § Vuelo nuevo): se casa por POSICIÓN, uno a uno, la copa
-- nueva con el olivo vivo más cercano a ≤ 1,5 m (la misma regla que tuberia/semillas_copas.py); lo casado conserva su
-- copas_id y actualiza geom, altura_m y visto_en_vuelo; lo no casado del vuelo nuevo nace con copas_id nuevo; el olivo
-- viejo que no casa NO se borra (tiene historia y personalización): se marca retirado_en. Las columnas que lo permiten
-- son visto_en_vuelo, retirado_en y el índice GiST de geom (ya existe).
ALTER TABLE olivos
  ADD COLUMN finca            text CHECK (finca ~ '^[a-z0-9_-]{1,32}$'),
  ADD COLUMN copas_id         bigint CHECK (copas_id BETWEEN 0 AND 4294967295),
  ADD COLUMN id_ot            text CHECK (id_ot ~ '^[A-Za-z0-9:_.-]{1,64}$'),
  ADD COLUMN id_ot_enlazado_en timestamptz,
  ADD COLUMN visto_en_vuelo   text CHECK (visto_en_vuelo ~ '^[a-z0-9_-]{1,32}$'),
  ADD COLUMN retirado_en      timestamptz,
  ADD CONSTRAINT olivos_finca_y_id CHECK ((finca IS NULL) = (copas_id IS NULL)),
  ADD CONSTRAINT olivos_ot_con_fecha CHECK ((id_ot IS NULL) = (id_ot_enlazado_en IS NULL));
CREATE UNIQUE INDEX olivos_finca_copas_id ON olivos (finca, copas_id) WHERE copas_id IS NOT NULL;
CREATE UNIQUE INDEX olivos_id_ot ON olivos (id_ot) WHERE id_ot IS NOT NULL;

CREATE FUNCTION olivos_congela_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m text[];
BEGIN
  IF NEW.copas_id IS NULL THEN
    m := regexp_match(NEW.id_estable, '^([a-z0-9_-]{1,32}):([0-9]{1,10})$');
    IF m IS NOT NULL AND m[2]::bigint <= 4294967295 THEN
      NEW.finca := m[1];
      NEW.copas_id := m[2]::bigint;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.copas_id IS NOT NULL
     AND (NEW.copas_id IS DISTINCT FROM OLD.copas_id OR NEW.finca IS DISTINCT FROM OLD.finca OR NEW.id_estable <> OLD.id_estable) THEN
    RAISE EXCEPTION 'el id de un olivo está congelado (decisión 92): % no se cambia', OLD.id_estable USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER olivos_congela_id BEFORE INSERT OR UPDATE ON olivos FOR EACH ROW EXECUTE FUNCTION olivos_congela_id();
-- los que ya estaban (la carga de tuberia/hazas): el disparador rellena finca y copas_id al tocarlos
UPDATE olivos SET id_estable = id_estable WHERE copas_id IS NULL;

-- ---------------------------------------------------------------- sesiones: de dónde nació (decisión 96)
-- «enlace»: la abrió el adulto titular con el enlace mágico; «vinculo»: un aparato vinculado con el código corto (las
-- gafas, que puede usar cualquiera en casa). Solo una sesión «enlace» cuelga contenido. Las sesiones de antes, «enlace».
ALTER TABLE sesiones ADD COLUMN origen text NOT NULL DEFAULT 'enlace' CHECK (origen IN ('enlace', 'vinculo'));

-- ---------------------------------------------------------------- ficheros subidos (fotos y pinturas)
-- Nada de binarios en la base: el fichero vive en la carpeta GEMELO_MEDIOS (volumen del VPS, entra en las copias) con
-- un nombre al azar (`clave`, 128 bits) y lo sirve la api tras sesión, SOLO si su contenido está visible (al retirarlo
-- deja de servirse en el acto, aunque el fichero espere a la purga). Siempre re-codificado por la api (sharp): WebP,
-- ≤ 1600 px de lado, sin EXIF/GPS/ICC. sha256 es el del fichero ya re-codificado.
CREATE TABLE medios (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave           text NOT NULL UNIQUE CHECK (clave ~ '^[a-f0-9]{32}\.(webp|jpg|png)$'),
  tipo_mime       text NOT NULL CHECK (tipo_mime IN ('image/webp', 'image/jpeg', 'image/png')),
  bytes           integer NOT NULL CHECK (bytes BETWEEN 1 AND 16777216),
  ancho           smallint NOT NULL CHECK (ancho BETWEEN 1 AND 4096),
  alto            smallint NOT NULL CHECK (alto BETWEEN 1 AND 4096),
  sha256          bytea NOT NULL CHECK (octet_length(sha256) = 32),
  hogar_id        bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  sesion_id       bigint REFERENCES sesiones (id) ON DELETE SET NULL,
  aviso_version   smallint NOT NULL CHECK (aviso_version >= 1),
  aviso_aceptado_en timestamptz NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX medios_hogar ON medios (hogar_id);

-- ---------------------------------------------------------------- personalización de árboles (decisiones 91, 93, 96)
-- Por olivo y hogar: nombre y un objeto colgado (foto o pintura). Lo escribe SOLO el titular de la haza que contiene el
-- olivo, desde una sesión «enlace» (la api lo comprueba; aquí se guarda quién y desde qué sesión). Se ve al momento
-- (decisión 93) y cualquier hogar puede denunciarlo; la oficina lo retira en un clic: estado «retirado» con motivo.
-- Una sola visible por (olivo, hogar); las retiradas quedan como registro (y su fichero se purga a los N días).
CREATE TABLE personalizaciones (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  olivo_id       bigint NOT NULL REFERENCES olivos (id) ON DELETE RESTRICT,
  haza_id        bigint NOT NULL REFERENCES hazas (id) ON DELETE CASCADE,
  hogar_id       bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  sesion_id      bigint REFERENCES sesiones (id) ON DELETE SET NULL,
  nombre         text CHECK (char_length(nombre) BETWEEN 1 AND 40),
  objeto_tipo    text CHECK (objeto_tipo IN ('foto', 'pintura')),
  medio_id       bigint REFERENCES medios (id) ON DELETE SET NULL,
  estado         text NOT NULL DEFAULT 'visible' CHECK (estado IN ('visible', 'retirado')),
  creada_en      timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now(),
  retirada_en    timestamptz,
  retirada_por   bigint REFERENCES hogares (id) ON DELETE SET NULL,
  motivo_retirada text CHECK (char_length(motivo_retirada) BETWEEN 1 AND 200),
  CHECK ((objeto_tipo IS NULL) = (medio_id IS NULL) OR estado = 'retirado'),
  CHECK (estado = 'visible' OR (retirada_en IS NOT NULL AND motivo_retirada IS NOT NULL)),
  CHECK (estado = 'retirado' OR nombre IS NOT NULL OR medio_id IS NOT NULL)
);
CREATE UNIQUE INDEX personalizaciones_visible ON personalizaciones (olivo_id, hogar_id) WHERE estado = 'visible';
CREATE INDEX personalizaciones_haza ON personalizaciones (haza_id) WHERE estado = 'visible';
CREATE INDEX personalizaciones_hogar ON personalizaciones (hogar_id);
CREATE INDEX personalizaciones_medio ON personalizaciones (medio_id);

-- ---------------------------------------------------------------- denuncias (decisión 93)
-- De cualquier hogar sobre un contenido visible, con motivo. Una por (contenido, hogar). Si el denunciante borra su
-- cuenta, la denuncia queda anónima (sigue sirviendo a la oficina).
CREATE TABLE denuncias (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  personalizacion_id bigint NOT NULL REFERENCES personalizaciones (id) ON DELETE CASCADE,
  hogar_id           bigint REFERENCES hogares (id) ON DELETE SET NULL,
  motivo             text NOT NULL CHECK (motivo IN ('menores', 'datos_personales', 'ofensivo', 'no_es_del_olivar', 'otro')),
  texto              text CHECK (char_length(texto) BETWEEN 1 AND 500),
  creada_en          timestamptz NOT NULL DEFAULT now(),
  resuelta_en        timestamptz,
  resolucion         text CHECK (resolucion IN ('retirado', 'se_mantiene')),
  CHECK ((resuelta_en IS NULL) = (resolucion IS NULL))
);
CREATE UNIQUE INDEX denuncias_una_por_hogar ON denuncias (personalizacion_id, hogar_id) WHERE hogar_id IS NOT NULL;

-- ---------------------------------------------------------------- bandeja de la oficina (decisión 94)
-- Lo que la oficina tiene que mirar: contenido nuevo (cada personalización creada o cambiada: a la oficina le sirve de
-- sugerencia, decisión 91), sugerencias explícitas de un hogar sobre su haza y denuncias. Estado: nueva → vista →
-- pasada_ot (con el id de la propuesta en OlivarTrack) o descartada. El gemelo NO escribe en OlivarTrack por su cuenta:
-- «pasar a OlivarTrack» lo pide la oficina y el id de la propuesta se apunta aquí.
CREATE TABLE bandeja (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo               text NOT NULL CHECK (tipo IN ('contenido_nuevo', 'sugerencia', 'denuncia')),
  estado             text NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'vista', 'pasada_ot', 'descartada')),
  hogar_id           bigint REFERENCES hogares (id) ON DELETE SET NULL,
  haza_id            bigint REFERENCES hazas (id) ON DELETE SET NULL,
  olivo_id           bigint REFERENCES olivos (id) ON DELETE SET NULL,
  personalizacion_id bigint REFERENCES personalizaciones (id) ON DELETE SET NULL,
  denuncia_id        bigint REFERENCES denuncias (id) ON DELETE SET NULL,
  texto              text CHECK (char_length(texto) BETWEEN 1 AND 1000),
  creada_en          timestamptz NOT NULL DEFAULT now(),
  vista_en           timestamptz,
  decidida_en        timestamptz,
  decidida_por       bigint REFERENCES hogares (id) ON DELETE SET NULL,
  ot_propuesta_id    text CHECK (ot_propuesta_id ~ '^[A-Za-z0-9:_.-]{1,64}$'),
  CHECK ((estado = 'pasada_ot') = (ot_propuesta_id IS NOT NULL)),
  CHECK (estado IN ('nueva', 'vista') OR decidida_en IS NOT NULL),
  CHECK (tipo <> 'sugerencia' OR texto IS NOT NULL)
);
CREATE INDEX bandeja_estado ON bandeja (estado, creada_en DESC);
CREATE INDEX bandeja_personalizacion ON bandeja (personalizacion_id);

-- ---------------------------------------------------------------- diario de la haza (decisión 97)
-- Lo que pasa en una haza contado para el hogar: labor, nota, foto, hito. Lo escriben la oficina o el corresponsal (o
-- llega de OlivarTrack con su clave natural para no duplicarse). Visible para quien vea la haza (lista blanca en la api,
-- cuando llegue la pantalla). autor_id no sale nunca por la api.
CREATE TABLE diario_haza (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  haza_id       bigint NOT NULL REFERENCES hazas (id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('labor', 'nota', 'foto', 'hito')),
  titulo        text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 120),
  texto         text CHECK (char_length(texto) <= 4000),
  medio_id      bigint REFERENCES medios (id) ON DELETE SET NULL,
  origen        text NOT NULL CHECK (origen IN ('oficina', 'corresponsal', 'olivartrack')),
  clave_natural text CHECK (char_length(clave_natural) BETWEEN 1 AND 200),
  autor_id      bigint REFERENCES hogares (id) ON DELETE SET NULL,
  visible       boolean NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (haza_id, clave_natural)
);
CREATE INDEX diario_haza_fecha ON diario_haza (haza_id, fecha DESC);

-- ---------------------------------------------------------------- avisos al hogar (decisión 97)
-- Un aviso (de la oficina o del sistema) y a quién va: avisos_hogar es la entrega a cada hogar (en el gemelo y, si el
-- hogar lo quiso en el primer acceso —hogares.avisos_correo—, por correo). haza_id: si va a los de una haza.
CREATE TABLE avisos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo       text NOT NULL CHECK (tipo IN ('labor', 'visita', 'evento', 'aceite', 'contenido', 'sistema')),
  titulo     text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 120),
  texto      text CHECK (char_length(texto) <= 2000),
  haza_id    bigint REFERENCES hazas (id) ON DELETE SET NULL,
  enlace     text CHECK (enlace ~ '^/[A-Za-z0-9/_#?=&.-]{0,200}$'),
  autor_id   bigint REFERENCES hogares (id) ON DELETE SET NULL,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  caduca_en  timestamptz
);
CREATE TABLE avisos_hogar (
  aviso_id          bigint NOT NULL REFERENCES avisos (id) ON DELETE CASCADE,
  hogar_id          bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  leido_en          timestamptz,
  correo_enviado_en timestamptz,
  PRIMARY KEY (aviso_id, hogar_id)
);
CREATE INDEX avisos_hogar_hogar ON avisos_hogar (hogar_id, leido_en);

-- ---------------------------------------------------------------- trazabilidad del aceite (decisión 97)
-- Lote ↔ hazas (con las fechas de recolección que entraron en él) ↔ hogares que reciben aceite de ese lote. Sin kilos ni
-- litros (decisión 13): eso es de OlivarTrack. ot_ref enlaza la entrega o lote de OlivarTrack si llega.
CREATE TABLE lotes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo      text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Za-z0-9_-]{1,32}$'),
  campana     text NOT NULL CHECK (campana ~ '^[0-9]{4}/[0-9]{2}$'),
  molturado_en date,
  almazara    text CHECK (char_length(almazara) BETWEEN 1 AND 80),
  descripcion text CHECK (char_length(descripcion) <= 500),
  ot_ref      text CHECK (ot_ref ~ '^[A-Za-z0-9:_.-]{1,64}$'),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lote_haza (
  lote_id         bigint NOT NULL REFERENCES lotes (id) ON DELETE CASCADE,
  haza_id         bigint NOT NULL REFERENCES hazas (id) ON DELETE CASCADE,
  recogida_desde  date NOT NULL,
  recogida_hasta  date NOT NULL,
  PRIMARY KEY (lote_id, haza_id, recogida_desde),
  CHECK (recogida_hasta >= recogida_desde)
);
CREATE INDEX lote_haza_haza ON lote_haza (haza_id);
CREATE TABLE lote_hogar (
  lote_id     bigint NOT NULL REFERENCES lotes (id) ON DELETE CASCADE,
  hogar_id    bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  asignado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lote_id, hogar_id)
);
CREATE INDEX lote_hogar_hogar ON lote_hogar (hogar_id);

-- ---------------------------------------------------------------- eventos y visitas con inscripción (decisión 97)
-- La tabla `visitas` (0001) pasa a ser la de eventos en general: visita guiada o libre, evento, taller, recolección.
-- Inscripción: plazas, hasta cuándo, cuántas personas lleva cada hogar y si está apuntado, en espera o lo anuló.
ALTER TABLE visitas DROP CONSTRAINT visitas_tipo_check;
ALTER TABLE visitas
  ADD CONSTRAINT visitas_tipo_check CHECK (tipo IN ('guiada', 'libre', 'evento', 'taller', 'recoleccion')),
  ADD COLUMN descripcion       text CHECK (char_length(descripcion) <= 2000),
  ADD COLUMN lugar             text CHECK (char_length(lugar) <= 120),
  ADD COLUMN finca             text CHECK (finca ~ '^[a-z0-9_-]{1,32}$'),
  ADD COLUMN haza_id           bigint REFERENCES hazas (id) ON DELETE SET NULL,
  ADD COLUMN presencial        boolean NOT NULL DEFAULT false,
  ADD COLUMN plazas            smallint CHECK (plazas >= 1),
  ADD COLUMN inscripcion_hasta timestamptz,
  ADD COLUMN estado            text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('borrador', 'abierta', 'cerrada', 'cancelada'));
ALTER TABLE visitas_asistentes
  ADD COLUMN personas smallint NOT NULL DEFAULT 1 CHECK (personas BETWEEN 1 AND 10),
  ADD COLUMN estado   text NOT NULL DEFAULT 'apuntado' CHECK (estado IN ('apuntado', 'en_espera', 'anulado')),
  ADD COLUMN anulado_en timestamptz,
  ADD CONSTRAINT visitas_asistentes_anulado CHECK ((estado = 'anulado') = (anulado_en IS NOT NULL));

-- ---------------------------------------------------------------- permisos
-- Los privilegios por defecto de la 0001 ya dan filas a gemelo_api en las tablas nuevas; se repite explícito (como la
-- 0002) para que no dependa de quién las creó.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON medios, personalizaciones, denuncias, bandeja, diario_haza, avisos, avisos_hogar,
      lotes, lote_haza, lote_hogar TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
