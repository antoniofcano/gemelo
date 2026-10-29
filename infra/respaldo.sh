#!/usr/bin/env bash
# Copia de la base del gemelo, CIFRADA y FUERA del VPS (ADR-0011; ensayo: infra/ensayar-restauracion.sh).
#   1. pg_dump (formato custom) dentro del contenedor de la base, con el usuario dueño;
#   2. cifrado con age a la clave PÚBLICA (en el VPS no está la privada: una intrusión no lee las copias viejas);
#   3. subida con rclone a GEMELO_RESPALDO_REMOTO (otro proveedor u otra región);
#   4. se conservan GEMELO_RESPALDO_DIAS_LOCALES días en local.
# Herramientas: docker, age (https://age-encryption.org), rclone. Se programa con un temporizador de systemd (RUNBOOK-VPS).
# Uso: infra/respaldo.sh [--sin-subir]   (lee /etc/gemelo/entorno o las variables ya puestas)
set -euo pipefail
umask 077

ENTORNO="${GEMELO_ENTORNO:-/etc/gemelo/entorno}"
if [ -r "$ENTORNO" ]; then set -a; . "$ENTORNO"; set +a; fi
SUBIR=1; [ "${1:-}" = "--sin-subir" ] && SUBIR=0

CONTENEDOR="${GEMELO_RESPALDO_CONTENEDOR:-gemelo-db-1}"
DESTINATARIO="${GEMELO_RESPALDO_DESTINATARIO_FICHERO:?falta GEMELO_RESPALDO_DESTINATARIO_FICHERO (clave pública de age)}"
LOCAL="${GEMELO_RESPALDO_LOCAL:-/var/backups/gemelo}"
DIAS="${GEMELO_RESPALDO_DIAS_LOCALES:-7}"
BASE="${GEMELO_RESPALDO_BASE:-gemelo}"
USUARIO="${GEMELO_RESPALDO_USUARIO:-gemelo_dueno}"
AGE="${GEMELO_AGE:-age}"

for h in docker "$AGE"; do command -v "$h" >/dev/null || { echo "falta la herramienta: $h" >&2; exit 2; }; done
[ "$SUBIR" = 0 ] || command -v rclone >/dev/null || { echo "falta rclone (o usa --sin-subir)" >&2; exit 2; }
[ -r "$DESTINATARIO" ] || { echo "no puedo leer la clave pública $DESTINATARIO" >&2; exit 2; }

mkdir -p "$LOCAL"
SELLO=$(date -u +%Y%m%dT%H%M%SZ)
FICHERO="$LOCAL/gemelo-$SELLO.dump.age"
TMP="$FICHERO.parcial"
trap 'rm -f "$TMP"' EXIT

# el volcado nunca toca el disco sin cifrar: pg_dump | age > fichero
docker exec "$CONTENEDOR" pg_dump --format=custom --compress=6 --no-password -U "$USUARIO" -d "$BASE" \
  | "$AGE" --encrypt --recipients-file "$DESTINATARIO" --output "$TMP"
[ -s "$TMP" ] || { echo "la copia ha salido vacía" >&2; exit 1; }
mv "$TMP" "$FICHERO"
SUMA=$(sha256sum "$FICHERO" | cut -d' ' -f1)
echo "$SUMA  $(basename "$FICHERO")" > "$FICHERO.sha256"
echo "copia: $(basename "$FICHERO") ($(wc -c < "$FICHERO") bytes, sha256 $SUMA)"

if [ "$SUBIR" = 1 ]; then
  REMOTO="${GEMELO_RESPALDO_REMOTO:?falta GEMELO_RESPALDO_REMOTO (destino de rclone fuera del VPS)}"
  rclone copy --immutable "$FICHERO" "$REMOTO/"
  rclone copy --immutable "$FICHERO.sha256" "$REMOTO/"
  # comprobación de que llegó entera
  rclone check --one-way --download "$LOCAL" "$REMOTO" --include "$(basename "$FICHERO")" >/dev/null
  echo "subida y comprobada en $REMOTO"
fi

find "$LOCAL" -maxdepth 1 -name 'gemelo-*.dump.age*' -mtime +"$DIAS" -delete
