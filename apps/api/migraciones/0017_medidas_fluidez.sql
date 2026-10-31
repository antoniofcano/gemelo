-- 0017_medidas_fluidez.sql — telemetría de fluidez en aparatos (PB9, doc/sistema/VR.md#medir-con-el-medidor; contrato: contratos/medidas.md).
-- Una fila por medida de 60 s (mediana, p95 y peor intervalo entre fotogramas) que la persona decide mandar a la oficina con un botón.
-- NADA PERSONAL, por diseño: no hay hogar_id, ni IP, ni agente de usuario entero (solo navegador y versión mayor), ni posición. La api limita
-- el envío por hogar y día en memoria (sin guardar quién fue), así que la tabla no sabe de quién es cada medida ni puede enlazarse con un hogar.
-- Es MEDIDO (CLAUDE.md, regla 5): lo que el aparato midió de sí mismo; en Chrome sin GPU (SwiftShader) no valdría como fps y no se manda desde allí
-- (el motor no distingue: lo dice la oficina con el aparato y el navegador). Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada.

-- Up Migration

CREATE TABLE medidas_fluidez (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recibida_en  timestamptz NOT NULL DEFAULT now(),
  medida_en    timestamptz NOT NULL,
  aparato      text NOT NULL CHECK (aparato IN ('escritorio', 'movil', 'quest')),
  navegador    text NOT NULL CHECK (navegador ~ '^[A-Za-z][A-Za-z ]{0,23}$'),
  nav_mayor    smallint NOT NULL CHECK (nav_mayor BETWEEN 0 AND 999),
  perfil       smallint NOT NULL CHECK (perfil BETWEEN -1 AND 9),
  finca        text NOT NULL CHECK (finca ~ '^[A-Za-z0-9_-]{1,40}$'),
  modo         text NOT NULL CHECK (modo ~ '^[A-Za-z0-9_-]{1,24}$'),
  vr           boolean NOT NULL,
  mediana_ms   real NOT NULL CHECK (mediana_ms BETWEEN 0 AND 10000),
  p95_ms       real NOT NULL CHECK (p95_ms BETWEEN 0 AND 10000),
  peor_ms      real NOT NULL CHECK (peor_ms BETWEEN 0 AND 100000),
  fotogramas   integer NOT NULL CHECK (fotogramas BETWEEN 10 AND 1000000),
  duracion_s   smallint NOT NULL CHECK (duracion_s BETWEEN 1 AND 600),
  version      text NOT NULL CHECK (version ~ '^[0-9A-Za-z.+-]{1,24}$')
);
CREATE INDEX medidas_fluidez_aparato_dia ON medidas_fluidez (aparato, medida_en DESC);
CREATE INDEX medidas_fluidez_recibida ON medidas_fluidez (recibida_en DESC);

-- la api solo añade y lee: una medida no se cambia ni se borra desde la api
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    REVOKE ALL ON medidas_fluidez FROM gemelo_api;
    GRANT SELECT, INSERT ON medidas_fluidez TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
