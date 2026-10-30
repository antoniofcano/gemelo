-- 0009_juegos.sql — partidas de los juegos casuales (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md): una fila por partida acabada
-- de un hogar, para su récord familiar. La api (apps/api/src/juegos/rutas.ts) solo guarda partidas creíbles (puntos dentro del tope
-- por duración) y solo enseña al hogar lo suyo: el récord entre familias, si llega, lo decide Antonio. Sin nombres ni personas: el
-- hogar. Si el hogar se borra (derecho de supresión), sus partidas se van con él (ON DELETE CASCADE); salen en /api/yo/datos.
-- Va detrás de la 0008 (OF2). Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0010_….

-- Up Migration

CREATE TABLE juegos_partidas (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hogar_id    bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  juego       text NOT NULL CHECK (juego ~ '^[a-z][a-z0-9-]{1,31}$'),
  puntos      integer NOT NULL CHECK (puntos BETWEEN 0 AND 10000000),
  duracion_s  integer NOT NULL CHECK (duracion_s BETWEEN 1 AND 86400),
  jugada_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX juegos_partidas_record ON juegos_partidas (hogar_id, juego, puntos DESC);

-- la api solo lee y añade: una partida no se cambia ni se borra (salvo con el hogar, en cascada)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    REVOKE ALL ON juegos_partidas FROM gemelo_api;
    GRANT SELECT, INSERT ON juegos_partidas TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
