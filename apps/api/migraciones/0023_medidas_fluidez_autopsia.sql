-- 0023_medidas_fluidez_autopsia.sql — la telemetría de fluidez lleva la autopsia de los fotogramas lentos, el coste de renderer.render() y el reparto del JS por bloque
-- (Q0i; contrato v3 de contratos/medidas.md). Solo ADD COLUMN nulas: nada destructivo, y las medidas de antes (y las de un cliente que no manda estos campos) siguen valiendo con NULL.
-- Sigue sin haber nada personal: ni hogar, ni IP, ni posición, ni agente de usuario entero. Los nombres de bloque (`reparto`) son identificadores del motor («olivo (estación)», «c:fauna»),
-- no datos de nadie; la api los valida con el mismo patrón y como mucho 16 por medida. Los permisos de la tabla (solo SELECT e INSERT para gemelo_api) no cambian.
-- Solo hacia arriba (src/bd/migra.ts).

-- Up Migration

ALTER TABLE medidas_fluidez
  ADD COLUMN render_mediana_ms real CHECK (render_mediana_ms BETWEEN 0 AND 10000),
  ADD COLUMN render_p95_ms     real CHECK (render_p95_ms BETWEEN 0 AND 10000),
  ADD COLUMN lentos_n          integer CHECK (lentos_n BETWEEN 0 AND 1000000),
  ADD COLUMN lentos_cola       integer CHECK (lentos_cola BETWEEN 0 AND 1000000),
  ADD COLUMN lentos_tesela     integer CHECK (lentos_tesela BETWEEN 0 AND 1000000),
  ADD COLUMN lentos_lote       integer CHECK (lentos_lote BETWEEN 0 AND 1000000),
  ADD COLUMN lentos_tarea      integer CHECK (lentos_tarea BETWEEN 0 AND 1000000),
  ADD COLUMN lentos_compila    integer CHECK (lentos_compila BETWEEN 0 AND 1000000),
  ADD COLUMN lentos_textura    integer CHECK (lentos_textura BETWEEN 0 AND 1000000),
  ADD COLUMN lentos_sin_causa  integer CHECK (lentos_sin_causa BETWEEN 0 AND 1000000),
  ADD COLUMN lentos_cola_ms    real CHECK (lentos_cola_ms BETWEEN 0 AND 10000),
  ADD COLUMN reparto           jsonb CHECK (reparto IS NULL OR CASE WHEN jsonb_typeof(reparto) = 'array' THEN jsonb_array_length(reparto) <= 16 ELSE false END),
  ADD COLUMN otros_p95_ms      real CHECK (otros_p95_ms BETWEEN 0 AND 10000);
