-- 0014_balizas_oficiales.sql — las balizas que pone la oficina en el mundo (OF10, doc/sistema/OFICINA.md §6; decisión 107: los poderes de la
-- oficina los ejecuta la api y quedan en la auditoría). Un punto de la finca con un título y un texto cortos, visible para todos los que tienen
-- sesión y con caducidad (`hasta`). Quitar una baliza la RETIRA (retirada_en) en vez de borrarla: la historia no se reescribe, como en
-- fincas_contorno. Sin datos de personas: solo qué cuenta de oficina la puso y la quitó. Las rutas: src/presencia/oficina_mundo.ts.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0015_….

-- Up Migration

CREATE TABLE balizas_oficiales (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finca         text NOT NULL CHECK (finca ~ '^[a-z0-9_-]{1,32}$'),
  punto         geometry(Point, 25830) NOT NULL,
  titulo        text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 60),
  texto         text CHECK (texto IS NULL OR char_length(texto) BETWEEN 1 AND 280),
  desde         timestamptz NOT NULL DEFAULT now(),
  hasta         timestamptz NOT NULL,
  autor_id      bigint REFERENCES hogares (id) ON DELETE SET NULL,
  creada_en     timestamptz NOT NULL DEFAULT now(),
  retirada_en   timestamptz,
  retirada_por  bigint REFERENCES hogares (id) ON DELETE SET NULL,
  CHECK (hasta > desde AND hasta <= desde + interval '7 days'),
  CHECK (retirada_en IS NOT NULL OR retirada_por IS NULL)
);
CREATE INDEX balizas_oficiales_vigentes ON balizas_oficiales (finca, hasta) WHERE retirada_en IS NULL;

-- ---------------------------------------------------------------- permisos
-- La api lee, añade, MUEVE (solo el punto) y RETIRA (solo esas dos columnas); ni cambia el texto de una baliza puesta ni borra la historia.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    REVOKE ALL ON balizas_oficiales FROM gemelo_api;
    GRANT SELECT, INSERT ON balizas_oficiales TO gemelo_api;
    GRANT UPDATE (punto, retirada_en, retirada_por) ON balizas_oficiales TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
