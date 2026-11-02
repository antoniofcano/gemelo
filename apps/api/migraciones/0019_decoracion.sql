-- 0019_decoracion.sql — P7g «decorar un olivo» (decisiones 175-179; contrato contratos/decoraciones.md): una columna
-- `decoracion` en la tabla de lo que cuelga cada hogar de un olivo (0004). Una sola decoración por olivo y hogar: la nueva
-- sustituye a la anterior (basta la columna, no hay tabla nueva). Puede ir sola o con nombre/foto.
-- El catálogo (seis piezas de temporada) vive en contratos/decoraciones.json y lo valida la api, incluida la época. Aquí solo se
-- exige la FORMA de slug del código (no la lista de seis): así ampliar el catálogo es una línea de contrato y no una migración.
-- Los permisos de 0004 no cambian (la tabla ya la escribe gemelo_api; el titular y la haza los comprueba la api).
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada.

-- Up Migration

ALTER TABLE personalizaciones
  ADD COLUMN decoracion text CHECK (decoracion ~ '^[a-z]{1,16}$');

-- «Una fila visible tiene algo»: antes nombre o foto; ahora también decoración. La restricción de 0004 no tiene nombre
-- propio (lo puso Postgres): se busca la que lleva `nombre IS NOT NULL` y se sustituye. Las otras dos (foto y medio a la
-- par; retirado con fecha y motivo) se quedan.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'personalizaciones'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%nombre IS NOT NULL%' AND pg_get_constraintdef(oid) ILIKE '%medio_id IS NOT NULL%'
  LOOP
    EXECUTE format('ALTER TABLE personalizaciones DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$$;
ALTER TABLE personalizaciones
  ADD CONSTRAINT personalizaciones_algo_visible CHECK (estado = 'retirado' OR nombre IS NOT NULL OR medio_id IS NOT NULL OR decoracion IS NOT NULL);
