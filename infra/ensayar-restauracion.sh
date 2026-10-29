#!/usr/bin/env bash
# Ensayo de restauración: una copia de infra/respaldo.sh se descifra y se restaura en una base de usar y tirar (la MISMA
# imagen de infra/compose.yml), y se comprueba que está entera. NUNCA toca la base de producción.
# Se corre FUERA del VPS (donde está la clave privada de age), al menos una vez al mes y tras cada cambio de esquema.
# Uso: infra/ensayar-restauracion.sh <copia.dump.age | ultima> <clave-privada-age>
#   «ultima» baja la más reciente de GEMELO_RESPALDO_REMOTO con rclone.
# Sale con 0 si la restauración y las comprobaciones pasan.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1   # Git Bash en Windows: no traducir las rutas del contenedor

COPIA="${1:?uso: ensayar-restauracion.sh <copia.dump.age|ultima> <clave-privada-age>}"
CLAVE="${2:?falta la clave privada de age}"
AGE="${GEMELO_AGE:-age}"
IMAGEN=$(sed -n 's/^\s*image:\s*\(postgis\/postgis:[^ ]*\)\s*$/\1/p' compose.yml | head -1)
[ -n "$IMAGEN" ] || { echo "no encuentro la imagen de la base en compose.yml" >&2; exit 2; }
NOMBRE="gemelo-ensayo-$$"
TMP=$(mktemp -d)
limpia() { docker rm -f "$NOMBRE" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpia EXIT

if [ "$COPIA" = "ultima" ]; then
  REMOTO="${GEMELO_RESPALDO_REMOTO:?falta GEMELO_RESPALDO_REMOTO}"
  ULTIMA=$(rclone lsf "$REMOTO" --include 'gemelo-*.dump.age' | sort | tail -1)
  [ -n "$ULTIMA" ] || { echo "no hay copias en $REMOTO" >&2; exit 1; }
  rclone copy "$REMOTO/$ULTIMA" "$TMP/"; rclone copy "$REMOTO/$ULTIMA.sha256" "$TMP/"
  (cd "$TMP" && sha256sum -c "$ULTIMA.sha256" >/dev/null) || { echo "la suma SHA-256 no cuadra" >&2; exit 1; }
  COPIA="$TMP/$ULTIMA"
fi

echo "== descifrar $(basename "$COPIA")"
"$AGE" --decrypt --identity "$CLAVE" --output "$TMP/copia.dump" "$COPIA"

echo "== base de ensayo ($IMAGEN)"
docker run -d --name "$NOMBRE" -e POSTGRES_PASSWORD=ensayo -e POSTGRES_USER=gemelo_dueno -e POSTGRES_DB=gemelo "$IMAGEN" >/dev/null
# la imagen arranca, se inicializa y se REINICIA: hay que esperar a que acabe la inicialización, no solo a pg_isready
for _ in $(seq 1 120); do
  docker logs "$NOMBRE" 2>&1 | grep -q "init process complete" && docker exec "$NOMBRE" pg_isready -U gemelo_dueno -d gemelo >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NOMBRE" pg_isready -U gemelo_dueno -d gemelo >/dev/null
# el rol de la aplicación existe en producción: se crea para que los permisos de la copia se restauren tal cual
docker exec "$NOMBRE" psql -q -v ON_ERROR_STOP=1 -U gemelo_dueno -d gemelo -c "CREATE ROLE gemelo_api LOGIN"

echo "== restaurar"
# en una base NUEVA desde template0: la imagen de PostGIS ya instala sus extensiones en la base inicial y chocarían
docker exec "$NOMBRE" createdb -U gemelo_dueno -T template0 restaurada
docker exec -i "$NOMBRE" pg_restore --exit-on-error --no-password -U gemelo_dueno -d restaurada < "$TMP/copia.dump"

echo "== comprobar"
consulta() { docker exec "$NOMBRE" psql -tA -v ON_ERROR_STOP=1 -U gemelo_dueno -d restaurada -c "$1"; }
fallos=0
mira() { if [ "$2" = "$3" ]; then echo "  ok  $1"; else echo "  MAL $1: «$2», se esperaba «$3»"; fallos=$((fallos + 1)); fi; }
mira "migraciones registradas" "$(consulta "SELECT count(*) > 0 FROM esquema_migraciones")" "t"
mira "PostGIS en marcha" "$(consulta "SELECT postgis_full_version() IS NOT NULL")" "t"
mira "geometrías válidas" "$(consulta "SELECT count(*) FROM hazas WHERE NOT ST_IsValid(geom)")" "0"
mira "SRID 25830" "$(consulta "SELECT Find_SRID('public','hazas','geom')")" "25830"
mira "eventos con su reparto haza-parcela" "$(consulta "SELECT count(*) FROM eventos_haza e LEFT JOIN haza_parcela p USING (haza_id, parcela_ot) WHERE p.haza_id IS NULL")" "0"
mira "permisos del rol de la api" "$(consulta "SELECT has_table_privilege('gemelo_api','hogares','SELECT') AND NOT has_table_privilege('gemelo_api','auditoria','DELETE')")" "t"
echo "  filas: $(consulta "SELECT 'hogares=' || (SELECT count(*) FROM hogares) || ' hazas=' || (SELECT count(*) FROM hazas) || ' olivos=' || (SELECT count(*) FROM olivos) || ' eventos=' || (SELECT count(*) FROM eventos_haza)")"

echo
if [ "$fallos" -eq 0 ]; then echo "ensayo de restauración: todo bien"; else echo "ensayo de restauración: $fallos fallos"; exit 1; fi
