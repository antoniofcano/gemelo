-- 0026_parcela_ot_con_tildes.sql — OT-V: el id de parcela de OlivarTrack trae tildes, paréntesis y «/» (formas comprobadas en solo lectura el
-- 2026-11-05; p. ej. «loma-(polígono-9-parcela-8)», «huerta/pozo»). El CHECK de la 0001 (^[A-Za-z0-9:_.-]{1,64}$) los rechazaba.
-- Equivalente en Postgres de PATRON_ID_PARCELA (apps/api/src/vivo/lista-blanca.ts: ^[\p{L}\p{N}:_.#()/-]{1,120}$):
--  · [[:alnum:]] da letras y cifras de cualquier alfabeto SOLO si la collation de la base clasifica Unicode (glibc/ICU o el proveedor
--    builtin C.UTF-8). Con la collation «C» de libc, Postgres la limita a ASCII; por eso van además, explícitos y por punto de código
--    (los rangos de una expresión de Postgres no dependen de la collation), Latin-1 (À-Ö, Ø-ö, ø-ÿ: tildes, «ñ», «ü», «ç») y Latin
--    Extended-A (Ā-ſ). Con cualquier collation, el castellano cabe; fuera de esos alfabetos manda la collation de la base.
--  · Sin espacios ni caracteres de control (no están en la clase); de 1 a 120 caracteres (no bytes).
-- Solo amplía: toda fila que cumplía el CHECK de la 0001 cumple este. Solo hacia arriba (src/bd/migra.ts).

-- Up Migration

ALTER TABLE haza_parcela DROP CONSTRAINT haza_parcela_parcela_ot_check;
ALTER TABLE haza_parcela ADD CONSTRAINT haza_parcela_parcela_ot_check
  CHECK (parcela_ot ~ '^[[:alnum:]À-ÖØ-öø-ÿĀ-ſ:_.#()/-]{1,120}$');
