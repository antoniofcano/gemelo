-- 0024_medidas_fluidez_perdidos.sql — la telemetría de fluidez lleva los fotogramas perdidos y los vsync perdidos (contrato v3.1 de contratos/medidas.md).
-- Perdido = intervalo de más de 1,5 periodos de refresco (la fluctuación del reloj no cuenta); vsync perdidos = suma de round(intervalo/periodo) - 1 en esos fotogramas.
-- Solo ADD COLUMN nulas: nada destructivo, y las medidas de antes (y las de un cliente que no manda estos campos) siguen valiendo con NULL. Son recuentos: nada personal.
-- Los permisos de la tabla (solo SELECT e INSERT para gemelo_api) no cambian. Solo hacia arriba (src/bd/migra.ts).

-- Up Migration

ALTER TABLE medidas_fluidez
  ADD COLUMN perdidos_n      integer CHECK (perdidos_n BETWEEN 0 AND 1000000),
  ADD COLUMN vsync_perdidos  integer CHECK (vsync_perdidos BETWEEN 0 AND 10000000);
