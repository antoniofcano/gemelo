-- 0022_medidas_fluidez_porque.sql — la telemetría de fluidez dice POR QUÉ va mal, no solo cuánto (Q0e; contrato v2 de contratos/medidas.md).
-- Solo ADD COLUMN nulas: nada destructivo, y las medidas de antes (y las de un cliente antiguo que no manda estos campos) siguen valiendo con NULL.
-- Sigue sin haber nada personal: ni hogar, ni IP, ni posición, ni agente de usuario entero. `perillas` es el texto corto de las perillas de VR
-- (XrPerillas.linea() sin el prefijo), con el mismo patrón que valida la api. `perfil` sigue siendo el nivel FINAL de VR_PERFILES; nivel_ini/nivel_fin lo detallan.
-- Los permisos de la tabla (solo SELECT e INSERT para gemelo_api) no cambian. Solo hacia arriba (src/bd/migra.ts).

-- Up Migration

ALTER TABLE medidas_fluidez
  ADD COLUMN js_mediana_ms real CHECK (js_mediana_ms BETWEEN 0 AND 10000),
  ADD COLUMN js_p95_ms     real CHECK (js_p95_ms BETWEEN 0 AND 10000),
  ADD COLUMN nivel_ini     smallint CHECK (nivel_ini BETWEEN -1 AND 9),
  ADD COLUMN nivel_fin     smallint CHECK (nivel_fin BETWEEN -1 AND 9),
  ADD COLUMN perillas      text CHECK (perillas ~ '^[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ ,.:;=()+_%·-]{1,80}$'),
  ADD COLUMN olivos_gen    boolean,
  ADD COLUMN llamadas_med  integer CHECK (llamadas_med BETWEEN 0 AND 100000),
  ADD COLUMN triangulos_med integer CHECK (triangulos_med BETWEEN 0 AND 100000000),
  ADD COLUMN personas      smallint CHECK (personas BETWEEN 0 AND 500);
