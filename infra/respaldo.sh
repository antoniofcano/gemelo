#!/usr/bin/env bash
# Copia de la base del gemelo, CIFRADA y FUERA del VPS (ADR-0011; ensayo: infra/ensayar-restauracion.sh).
#   1. pg_dump (formato custom) dentro del contenedor de la base, con el usuario dueño;
#   2. cifrado con age a la clave PÚBLICA (en el VPS no está la privada: una intrusión no lee las copias viejas);
#   3. subida con rclone a GEMELO_RESPALDO_REMOTO (otro proveedor u otra región);
#   3b. V7: el volumen de medios (fotos de los hogares, /datos/medios de la api) se empaqueta con tar DESPUÉS de la base (así ninguna fila
#       apunta a una foto ausente; una foto sin fila es huérfana inofensiva), se cifra igual y se sube junto a ella (gemelo-medios-<sello>.tar.age);
#   4. se conservan GEMELO_RESPALDO_DIAS_LOCALES días en local.
# Herramientas: docker, age (https://age-encryption.org), rclone. Se programa con un temporizador de systemd (RUNBOOK-VPS).
# Uso: infra/respaldo.sh [--sin-subir]   (lee /etc/gemelo/entorno o las variables ya puestas)
set -euo pipefail
umask 077

ENTORNO="${GEMELO_ENTORNO:-/etc/gemelo/entorno}"
# solo las líneas GEMELO_RESPALDO_*, leídas como texto: el entorno es para env_file de Docker, no es shell (el remitente lleva espacios y <…>, y cargarlo tumbaría la copia)
if [ -r "$ENTORNO" ]; then
  while IFS='=' read -r nombre valor; do
    case "$nombre" in GEMELO_RESPALDO_[A-Z_]*) export "$nombre=$valor" ;; esac
  done < "$ENTORNO"
fi
SUBIR=1; [ "${1:-}" = "--sin-subir" ] && SUBIR=0

CONTENEDOR="${GEMELO_RESPALDO_CONTENEDOR:-gemelo-db-1}"
DESTINATARIO="${GEMELO_RESPALDO_DESTINATARIO_FICHERO:?falta GEMELO_RESPALDO_DESTINATARIO_FICHERO (clave pública de age)}"
LOCAL="${GEMELO_RESPALDO_LOCAL:-/var/backups/gemelo}"
DIAS="${GEMELO_RESPALDO_DIAS_LOCALES:-7}"
BASE="${GEMELO_RESPALDO_BASE:-gemelo}"
USUARIO="${GEMELO_RESPALDO_USUARIO:-gemelo_dueno}"
AGE="${GEMELO_AGE:-age}"
MEDIOS="${GEMELO_RESPALDO_MEDIOS:-si}"
CONTENEDOR_API="${GEMELO_RESPALDO_CONTENEDOR_API:-gemelo-api-1}"
CARPETA_MEDIOS="${GEMELO_RESPALDO_CARPETA_MEDIOS:-/datos/medios}"

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

# V7: las fotos. tar dentro del contenedor de la api (busybox) y cifrado al vuelo, como la base: nada sin cifrar toca el disco
MEDIOS_FICHERO="$LOCAL/gemelo-medios-$SELLO.tar.age"
if [ "$MEDIOS" != "no" ]; then
  MTMP="$MEDIOS_FICHERO.parcial"
  trap 'rm -f "$TMP" "$MTMP"' EXIT
  docker exec "$CONTENEDOR_API" tar -C "$CARPETA_MEDIOS" -cf - .     | "$AGE" --encrypt --recipients-file "$DESTINATARIO" --output "$MTMP"
  [ -s "$MTMP" ] || { echo "la copia de medios ha salido vacía" >&2; exit 1; }
  mv "$MTMP" "$MEDIOS_FICHERO"
  MSUMA=$(sha256sum "$MEDIOS_FICHERO" | cut -d' ' -f1)
  echo "$MSUMA  $(basename "$MEDIOS_FICHERO")" > "$MEDIOS_FICHERO.sha256"
  echo "copia de medios: $(basename "$MEDIOS_FICHERO") ($(wc -c < "$MEDIOS_FICHERO") bytes, sha256 $MSUMA)"
fi

if [ "$SUBIR" = 1 ]; then
  REMOTO="${GEMELO_RESPALDO_REMOTO:?falta GEMELO_RESPALDO_REMOTO (destino de rclone fuera del VPS)}"
  rclone copy --immutable "$FICHERO" "$REMOTO/"
  rclone copy --immutable "$FICHERO.sha256" "$REMOTO/"
  # comprobación de que llegó entera
  rclone check --one-way --download "$LOCAL" "$REMOTO" --include "$(basename "$FICHERO")" >/dev/null
  if [ "$MEDIOS" != "no" ]; then
    rclone copy --immutable "$MEDIOS_FICHERO" "$REMOTO/"
    rclone copy --immutable "$MEDIOS_FICHERO.sha256" "$REMOTO/"
    rclone check --one-way --download "$LOCAL" "$REMOTO" --include "$(basename "$MEDIOS_FICHERO")" >/dev/null
  fi
  echo "subida y comprobada en $REMOTO"
fi

find "$LOCAL" -maxdepth 1 \( -name 'gemelo-*.dump.age*' -o -name 'gemelo-medios-*.tar.age*' \) -mtime +"$DIAS" -delete
