-- 0014_llaves_credencial.sql — arreglo de la 0013 (OF13): la restricción de `llaves_oficina.credencial_id` usaba la expresión
-- '^[A-Za-z0-9_-]{16,1366}$', pero las expresiones regulares de PostgreSQL no admiten repeticiones de más de 255 (RE_DUP_MAX): la
-- tabla se creó (la expresión se compila al usarla) y CUALQUIER inserción fallaba con «invalid regular expression: invalid repetition
-- count(s)», es decir, nadie podía dar de alta una llave. Misma regla, partida en dos: el alfabeto (base64url) con la expresión y el largo
-- (16 a 1366, el de la api y el contrato) con char_length. Sin datos que comprobar: con la restricción vieja no pudo entrar ninguna fila.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0015_….

-- Up Migration

ALTER TABLE llaves_oficina DROP CONSTRAINT llaves_oficina_credencial_id_check;
ALTER TABLE llaves_oficina ADD CONSTRAINT llaves_oficina_credencial_id_check
  CHECK (credencial_id ~ '^[A-Za-z0-9_-]+$' AND char_length(credencial_id) BETWEEN 16 AND 1366);
