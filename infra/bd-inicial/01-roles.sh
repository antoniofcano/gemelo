#!/bin/sh
# Solo corre la PRIMERA vez que arranca la base (volumen vacío), antes de las migraciones.
# Crea el rol de la aplicación (sin DDL; los permisos de fila se los da la migración 0001) y cierra el esquema public.
set -eu
clave="$(cat "$GEMELO_PG_API_CLAVE_FICHERO")"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v clave="$clave" <<'SQL'
CREATE ROLE gemelo_api LOGIN PASSWORD :'clave' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE gemelo FROM PUBLIC;
GRANT CONNECT ON DATABASE gemelo TO gemelo_api;
SQL
