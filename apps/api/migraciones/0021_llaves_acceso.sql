-- 0021_llaves_acceso.sql — llaves de acceso para TODAS las cuentas (OF13b-2, ADR-0029, decisión 174; doc/sistema/LLAVES-DE-ACCESO.md §5.1).
-- Solo estructura: ninguna lógica nueva de entrada con llave (eso es OF13b-3 y siguientes). Contrato: contratos/sesion.md § Llave de acceso.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada.
--
-- Vuelta atrás: las migraciones NO se deshacen. Para volver a la imagen anterior de la api basta la vista de compatibilidad
-- `llaves_oficina` del final (la imagen anterior sigue leyendo y escribiendo «llaves_oficina»); si hiciera falta el esquema
-- anterior de verdad, se restaura la copia de la base hecha antes de desplegar (RUNBOOK-VPS). Cuando ya no se vuelva atrás,
-- una migración posterior hará DROP VIEW llaves_oficina.
--
-- NO se ha ejecutado contra una base de verdad al escribirla (sin Docker): la prueba de integración
-- apps/api/pruebas/integracion/migracion_llaves_acceso.test.ts la comprueba y queda por lanzar.

-- Up Migration

-- ---------------------------------------------------------------- la tabla, renombrada con sus filas
-- La llave real de producción (la de Antonio) se queda tal cual: RENAME no reescribe filas. Los FK que apuntan a la tabla
-- (sesiones.llave_id) siguen a la tabla solos. Se renombran la secuencia de la identidad, el índice y las restricciones con nombre propio.
ALTER TABLE llaves_oficina RENAME TO llaves_acceso;
ALTER SEQUENCE llaves_oficina_id_seq RENAME TO llaves_acceso_id_seq;
ALTER INDEX llaves_oficina_pkey RENAME TO llaves_acceso_pkey;
ALTER INDEX llaves_oficina_hogar RENAME TO llaves_acceso_hogar;
ALTER INDEX llaves_oficina_credencial_id_key RENAME TO llaves_acceso_credencial_id_key;
ALTER TABLE llaves_acceso RENAME CONSTRAINT llaves_oficina_credencial_id_check TO llaves_acceso_credencial_id_check;
ALTER TABLE llaves_acceso RENAME CONSTRAINT llaves_oficina_clave_publica_check TO llaves_acceso_clave_publica_check;
ALTER TABLE llaves_acceso RENAME CONSTRAINT llaves_oficina_contador_check TO llaves_acceso_contador_check;
ALTER TABLE llaves_acceso RENAME CONSTRAINT llaves_oficina_nombre_check TO llaves_acceso_nombre_check;
ALTER TABLE llaves_acceso RENAME CONSTRAINT llaves_oficina_hogar_id_fkey TO llaves_acceso_hogar_id_fkey;
ALTER TABLE llaves_acceso RENAME CONSTRAINT llaves_oficina_aparato_id_fkey TO llaves_acceso_aparato_id_fkey;
ALTER TABLE llaves_acceso RENAME CONSTRAINT llaves_oficina_revocada_por_fkey TO llaves_acceso_revocada_por_fkey;

-- descubrible: la llave es una credencial residente (la entrada sin escribir el correo la necesita). Las llaves que ya existen
-- NO se sabe si lo son (OF13 las pedía `preferred`): por defecto falso; las nuevas lo dirán con la extensión credProps.
ALTER TABLE llaves_acceso ADD COLUMN descubrible boolean NOT NULL DEFAULT false;
-- El «user handle» por cuenta ya existe: hogares.llave_usuario (0013, 32 bytes al azar, único). No hace falta nada más para
-- identificar la cuenta al entrar sin correo: se compara el userHandle de la respuesta con él.

-- ---------------------------------------------------------------- los retos, también sin sesión
-- La entrada con llave no tiene sesión: el reto se ata al NAVEGADOR por el SHA-256 de la cookie `__Host-gemelo-reto` (solo el hash
-- en la base, nunca la cookie). Un solo uso y 5 min (expira_en); la purga de caducados ya borra por expira_en (src/auth/servicio.ts).
ALTER TABLE llaves_retos ALTER COLUMN sesion_id DROP NOT NULL;
ALTER TABLE llaves_retos ADD COLUMN clave bytea UNIQUE CHECK (clave IS NULL OR octet_length(clave) = 32);
ALTER TABLE llaves_retos DROP CONSTRAINT llaves_retos_tipo_check;
ALTER TABLE llaves_retos ADD CONSTRAINT llaves_retos_tipo_check CHECK (tipo IN ('alta', 'entrada', 'acceso'));
ALTER TABLE llaves_retos ADD CONSTRAINT llaves_retos_sesion_o_clave CHECK (sesion_id IS NOT NULL OR clave IS NOT NULL);
-- el reto sin sesión ('acceso') va solo por clave; los de sesión, como hasta ahora
ALTER TABLE llaves_retos ADD CONSTRAINT llaves_retos_acceso_con_clave CHECK (tipo <> 'acceso' OR (clave IS NOT NULL AND sesion_id IS NULL));
CREATE INDEX llaves_retos_expira ON llaves_retos (expira_en);

-- ---------------------------------------------------------------- el origen de la sesión
-- 'llave': sesión abierta con una llave de acceso. Las filas existentes ('enlace', 'vinculo') siguen cumpliendo la restricción nueva.
-- Sin rama de validez nueva en almacen.ts todavía (OF13b-5): ninguna sesión se crea aún con este origen.
ALTER TABLE sesiones DROP CONSTRAINT sesiones_origen_check;
ALTER TABLE sesiones ADD CONSTRAINT sesiones_origen_check CHECK (origen IN ('enlace', 'vinculo', 'llave'));

-- ---------------------------------------------------------------- vista de compatibilidad (vuelta atrás)
-- Simple (una tabla, sin joins ni agregados), por tanto actualizable: INSERT, UPDATE y DELETE de la imagen anterior de la api
-- pasan a la tabla. Columnas explícitas (no «*»): una columna nueva de la tabla no cambia la vista.
CREATE VIEW llaves_oficina AS
  SELECT id, hogar_id, credencial_id, clave_publica, contador, transports, nombre, respaldada, creada_en, aparato_id,
         ultima_vez_en, revocada_en, revocada_por
    FROM llaves_acceso;

-- ---------------------------------------------------------------- permisos
-- La api: lo mismo que tenía sobre la tabla vieja (el RENAME conserva los privilegios de la tabla y de llaves_retos); la vista los
-- necesita aparte. Sobre las columnas nuevas no hay nada más que dar: los privilegios son de tabla.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON llaves_acceso, llaves_retos TO gemelo_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON llaves_oficina TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;
