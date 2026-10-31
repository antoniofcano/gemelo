#!/usr/bin/env bash
# Comprobación POSTERIOR al despliegue del gemelo (doc/operacion/RUNBOOK-VPS.md). SOLO LEE: peticiones GET y HEAD
# sin cookie de sesión válida, un apretón TLS y, con --en-vps, consultas a Docker y a la base en modo solo lectura.
# No escribe en ningún sitio, no reinicia nada, no pide enlaces (eso manda un correo y escribe en la base).
# Mira lo mismo que infra/probar-caddy.sh pero contra el servidor de verdad, a través del borde de Oficultor.
#
# Uso:
#   bash infra/comprobar-despliegue.sh [URL]        desde cualquier equipo (por defecto https://gemelo.canoydamas.es)
#   bash infra/comprobar-despliegue.sh --en-vps     en el VPS, desde la raíz del repo: además Docker, base y registros
# Variables (opcionales):
#   GEMELO_VECINOS="https://… https://…"  webs del mismo borde que deben seguir respondiendo (no se inventan: las
#                                          pone quien despliega); basta con que no den error 5xx ni fallen al conectar
#   GEMELO_IP_ESPERADA=<ip>                comprobar que el dominio resuelve a la IP del VPS
#   GEMELO_DIAS_CERTIFICADO=14             días mínimos de vida del certificado
#   GEMELO_CON_LIVEKIT=1                   LiveKit encendido (perfil presencia): /rtc/ debe responder y, con --en-vps, estar sano
# Sale con 0 si todo pasa; con 1 si algo falla.
set -uo pipefail

EN_VPS=0; URL="https://gemelo.canoydamas.es"
for a in "$@"; do
  case "$a" in
    --en-vps) EN_VPS=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    http://*|https://*) URL="${a%/}" ;;
    *) echo "argumento desconocido: $a" >&2; exit 2 ;;
  esac
done
command -v curl >/dev/null || { echo "falta curl" >&2; exit 2; }
ESQUEMA="${URL%%://*}"; HOST="${URL#*://}"; HOST="${HOST%%/*}"; NOMBRE="${HOST%%:*}"
DIAS="${GEMELO_DIAS_CERTIFICADO:-14}"
fallos=0
ok() { echo "  ok  $1"; }
mal() { echo "  MAL $1"; fallos=$((fallos + 1)); }
info() { echo "  --  $1"; }

# cabeceras de respuesta de un GET (código en la primera línea); nunca -k: el certificado se verifica
# (comparaciones con [[ =~ ]] de bash y no con grep: cada proceso de más cuesta mucho en Git Bash de Windows)
pide() { local ruta="$1" o; shift; o=$(curl -sS --max-time 15 -o /dev/null -D - "$@" "$URL$ruta" 2>&1); printf '%s' "${o//$'\r'/}"; }
cuerpo() { curl -sS --max-time 15 "$URL$1" 2>/dev/null; }
primera() { printf '%s' "${1%%$'\n'*}"; }
# tiene <texto> <regex ERE>: alguna línea casa (sin distinguir mayúsculas)
tiene() {
  local l r=1; shopt -s nocasematch
  while IFS= read -r l; do if [[ $l =~ $2 ]]; then r=0; break; fi; done <<<"$1"
  shopt -u nocasematch; return $r
}
# cuantas <texto> <cabecera>: deja en N cuántas veces viene esa cabecera
cuantas() {
  local l n=0; shopt -s nocasematch
  while IFS= read -r l; do [[ $l == "$2:"* ]] && n=$((n + 1)); done <<<"$1"
  shopt -u nocasematch; N=$n
}

echo "== $URL"
ip=$(curl -sS --max-time 15 -o /dev/null -w '%{remote_ip}' "$URL/" 2>/dev/null || true)
if [ -n "$ip" ]; then ok "responde desde $ip"; else mal "no conecta con $URL"; fi
if [ -n "${GEMELO_IP_ESPERADA:-}" ]; then
  [ "$ip" = "$GEMELO_IP_ESPERADA" ] && ok "el dominio resuelve a la IP esperada" || mal "resuelve a $ip, no a $GEMELO_IP_ESPERADA"
fi

echo "== certificado y https"
if [ "$ESQUEMA" = https ]; then
  if command -v openssl >/dev/null; then
    cert=$(openssl s_client -connect "$HOST$([ "$HOST" = "$NOMBRE" ] && echo :443)" -servername "$NOMBRE" </dev/null 2>/dev/null | openssl x509 2>/dev/null)
    if [ -n "$cert" ]; then
      info "$(openssl x509 -noout -issuer <<<"$cert")"
      info "$(openssl x509 -noout -enddate <<<"$cert")"
      openssl x509 -noout -ext subjectAltName <<<"$cert" 2>/dev/null | grep -q "DNS:$NOMBRE" && ok "el certificado nombra $NOMBRE" || mal "el certificado no nombra $NOMBRE"
      openssl x509 -noout -checkend $((DIAS * 86400)) <<<"$cert" >/dev/null && ok "le quedan más de $DIAS días" || mal "caduca en menos de $DIAS días"
    else mal "no pude leer el certificado"; fi
  else info "sin openssl: certificado sin mirar (curl sí lo verifica)"; fi
  r=$(URL="http://$HOST" pide /)
  tiene "$r" "^HTTP/[0-9.]* 30[178]" && tiene "$r" "^location: https://$NOMBRE" && ok "http redirige a https" || mal "http no redirige a https: $(primera "$r")"
else info "no es https: certificado y redirección sin mirar (solo vale para pruebas)"; fi

echo "== portada pública y cabeceras"
r=$(pide /)
tiene "$r" "^HTTP/[0-9.]* 200" && ok "/ responde 200 sin sesión" || mal "/ no responde 200: $(primera "$r")"
tiene "$r" "^content-security-policy-report-only: default-src 'self'; script-src 'self'" && ok "CSP estricta en Report-Only" || mal "falta la CSP Report-Only"
tiene "$r" "^content-security-policy:" && mal "hay CSP impuesta (en F1a es solo informe; ¿la pone el borde?)" || ok "la CSP no se impone todavía"
tiene "$r" "^permissions-policy:.*xr-spatial-tracking=\(self\)" && ok "Permissions-Policy con xr-spatial-tracking=(self)" || mal "Permissions-Policy sin xr-spatial-tracking"
tiene "$r" "^permissions-policy:.*microphone=\(self\)" && ok "Permissions-Policy con microphone=(self) (la voz)" || mal "Permissions-Policy niega el micrófono: la voz no abrirá"
tiene "$r" "^strict-transport-security: max-age=31536000" && ok "HSTS" || mal "falta HSTS"
tiene "$r" "^x-content-type-options: nosniff" && ok "nosniff" || mal "falta nosniff"
tiene "$r" "^x-frame-options: DENY" && ok "X-Frame-Options DENY" || mal "falta X-Frame-Options"
tiene "$r" "^referrer-policy: strict-origin-when-cross-origin" && ok "Referrer-Policy strict-origin-when-cross-origin (decisión 53)" || mal "falta Referrer-Policy"
tiene "$r" "^cross-origin-opener-policy: same-origin" && ok "COOP" || mal "falta COOP"
tiene "$r" "^server:" && mal "se anuncia el servidor (¿lo añade el borde?)" || ok "sin cabecera Server"
tiene "$r" "^cache-control: no-cache" && ok "la portada no se cachea a ciegas" || mal "portada sin Cache-Control no-cache"
# el borde no debe duplicar ni pisar las cabeceras del Caddy interno
repes=""
for c in strict-transport-security x-content-type-options x-frame-options referrer-policy permissions-policy content-security-policy-report-only; do
  cuantas "$r" "$c"; [ "$N" -le 1 ] || repes="$repes $c×$N"
done
[ -z "$repes" ] && ok "ninguna cabecera de seguridad repetida" || mal "cabeceras repetidas (¿las añade también el borde?):$repes"

echo "== salud"
b=$(cuerpo /api/salud)
[ "$b" = '{"estado":"ok","bd":"ok"}' ] && ok "/api/salud: api y base bien" || mal "/api/salud responde: ${b:0:80}"
r=$(pide /api/salud)
tiene "$r" "^cache-control: no-store" && ok "/api/salud no se guarda en caché" || mal "/api/salud sin no-store"

echo "== lo cerrado sigue cerrado"
r=$(pide /api/interno/autoriza)
tiene "$r" "^HTTP/[0-9.]* 404" && ok "/api/interno da 404 desde fuera" || mal "/api/interno accesible desde fuera: $(primera "$r")"
r=$(pide /api/interno/autoriza -H "Cookie: __Host-gemelo=inventada")
tiene "$r" "^HTTP/[0-9.]* 404" && ok "/api/interno da 404 también con cookie" || mal "/api/interno con cookie: $(primera "$r")"
r=$(pide /finca/ -H "Sec-Fetch-Mode: navigate")
tiene "$r" "^HTTP/[0-9.]* 303" && tiene "$r" "^location: /$" && ok "sin sesión, /finca/ manda a la portada (303)" || mal "sin sesión /finca/ no redirige: $(primera "$r")"
r=$(pide /oficina/ -H "Sec-Fetch-Mode: navigate")
tiene "$r" "^HTTP/[0-9.]* 303" && ok "sin sesión, /oficina/ manda a la portada (303)" || mal "sin sesión /oficina/: $(primera "$r")"
r=$(pide /avatares/catalogo.json)
tiene "$r" "^HTTP/[0-9.]* 401" && ok "sin sesión, los avatares dan 401" || mal "sin sesión /avatares/: $(primera "$r")"
r=$(pide /teselas/hituelo/indice.json)
tiene "$r" "^HTTP/[0-9.]* 401" && ok "sin sesión, las teselas dan 401" || mal "sin sesión las teselas no dan 401: $(primera "$r")"
r=$(pide /api/sesion)
tiene "$r" "^HTTP/[0-9.]* 401" && ok "sin sesión, /api/sesion da 401" || mal "sin sesión /api/sesion: $(primera "$r")"
r=$(pide /api/hazas)
tiene "$r" "^HTTP/[0-9.]* 401" && ok "sin sesión, /api/hazas da 401" || mal "sin sesión /api/hazas: $(primera "$r")"
r=$(pide /api/admin/hogares)
tiene "$r" "^HTTP/[0-9.]* 40[13]" && ok "sin sesión, el panel de la oficina está cerrado" || mal "sin sesión /api/admin/hogares: $(primera "$r")"

echo "== lo que va sin sesión a propósito"
# la baja de los avisos abre desde el correo, sin sesión: sin token válido la api contesta 400 con su página (ni 401 ni la portada)
r=$(pide /api/avisos/baja)
tiene "$r" "^HTTP/[0-9.]* 400" && ok "/api/avisos/baja llega a la api sin sesión" || mal "/api/avisos/baja sin sesión: $(primera "$r")"
r=$(pide /rtc/)
if [ "${GEMELO_CON_LIVEKIT:-0}" = 1 ]; then
  tiene "$r" "^HTTP/[0-9.]* 200" && ok "/rtc/ llega a LiveKit" || mal "/rtc/ no llega a LiveKit: $(primera "$r")"
else info "/rtc/ responde $(primera "$r") (LiveKit apagado: se espera 502)"; fi

if [ -n "${GEMELO_VECINOS:-}" ]; then
  echo "== vecinos del borde (solo el código de respuesta)"
  for v in $GEMELO_VECINOS; do
    c=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$v" 2>/dev/null || echo 000)
    case "$c" in 000|5??) mal "$v responde $c" ;; *) ok "$v responde $c" ;; esac
  done
fi

if [ "$EN_VPS" = 1 ]; then
  echo "== dentro del VPS"
  cd "$(dirname "$0")/.." || exit 2
  C="docker compose -f infra/compose.yml"
  estado=$($C ps -a --format '{{.Service}} {{.State}} {{.Health}} {{.ExitCode}}' 2>&1)
  for s in db api web; do
    grep -q "^$s running" <<<"$estado" && ok "$s en marcha" || mal "$s no está en marcha"
  done
  for s in db api; do grep -q "^$s running healthy" <<<"$estado" && ok "$s sano" || mal "$s no está healthy"; done
  grep -Eq "^migra exited +0$" <<<"$estado" && ok "migra terminó bien" || mal "migra: $(grep '^migra' <<<"$estado")"
  # solo LiveKit publica, y solo sus dos puertos de medios (ADR-0027)
  pub=$(docker ps --filter label=com.docker.compose.project=gemelo --format '{{.Names}} {{.Ports}}' | grep -- '->' | grep -v '^gemelo-livekit-' || true)
  [ -z "$pub" ] && ok "ningún contenedor web, api ni base del gemelo publica puertos" || mal "puertos publicados: $pub"
  lk=$(docker ps --filter label=com.docker.compose.project=gemelo --filter name=livekit --format '{{.Ports}}' | tr ',' '\n' | grep -- '->' | grep -Ev -- '->(7881/tcp|7882/udp)$' || true)
  [ -z "$lk" ] && ok "LiveKit publica como mucho 7881/tcp y 7882/udp" || mal "LiveKit publica de más: $lk"
  if [ "${GEMELO_CON_LIVEKIT:-0}" = 1 ]; then grep -q "^livekit running healthy" <<<"$estado" && ok "LiveKit sano" || mal "LiveKit no está healthy"; fi
  info "hornero: $(grep '^hornero' <<<"$estado" || echo 'sin arrancar (perfil hornero)')"
  docker network inspect borde --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -q 'gemelo-web' \
    && ok "el Caddy interno está en la red borde" || mal "gemelo-web no está en la red borde"
  info "en la red borde: $(docker network inspect borde --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null)"
  # la base, en solo lectura: el rol de la api no es superusuario ni dueño, y la api se conecta con él
  q() { $C exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db psql -U gemelo_dueno -d gemelo -tAc "$1" 2>/dev/null | tr -d '\r'; }
  [ "$(q "SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = 'gemelo_api'")" = f ] \
    && ok "gemelo_api sin superusuario, CREATEROLE ni CREATEDB" || mal "gemelo_api tiene permisos de más (o no existe)"
  [ "$(q "SELECT count(*) FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = 'gemelo_api'")" = 0 ] \
    && ok "gemelo_api no es dueño de ninguna tabla" || mal "gemelo_api es dueño de algo"
  u=$(q "SELECT string_agg(DISTINCT usename, ',') FROM pg_stat_activity WHERE application_name = 'gemelo-api'")
  [ "$u" = gemelo_api ] && ok "la api se conecta como gemelo_api" || mal "la api se conecta como: ${u:-nadie}"
  esperadas=$(find apps/api/migraciones -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
  [ "$(q "SELECT count(*) FROM esquema_migraciones")" = "$esperadas" ] && ok "las $esperadas migraciones aplicadas" || mal "migraciones aplicadas: $(q "SELECT count(*) FROM esquema_migraciones"), en el repo: $esperadas"
  if [ -r /etc/gemelo/secretos ]; then
    abiertos=$(find /etc/gemelo/secretos -type f -perm /o=rwx)
    [ -z "$abiertos" ] && ok "ningún secreto legible por «otros»" || mal "secretos abiertos: $abiertos"
  else info "secretos sin mirar (hace falta root)"; fi
  [ -n "$(q "SELECT extversion FROM pg_extension WHERE extname = 'postgis'")" ] && ok "PostGIS instalado (por la migración 0001)" || mal "falta PostGIS"
  # registros de la última hora: ni cookies, ni Authorization, ni el token del enlace sin redactar
  reg=$($C logs --since 1h api web 2>&1)   # (el token de LiveKit va en la URL de /rtc: access_token)
  fuga=$( { grep -Eo '__Host-gemelo=[A-Za-z0-9]|Bearer [A-Za-z0-9]' <<<"$reg"; grep -Eo '[?&](t|access_token)=[A-Za-z0-9_.-]{8,}' <<<"$reg" | grep -v '=REDACTADO$'; } | head -1)
  [ -z "$fuga" ] && ok "registros sin credenciales" || mal "los registros contienen credenciales (cookie, Authorization o token del enlace)"
  command -v ufw >/dev/null && [ "$(id -u)" = 0 ] && info "ufw: $(ufw status | head -1)"
fi

echo
if [ "$fallos" -eq 0 ]; then echo "comprobar-despliegue: todo bien"; else echo "comprobar-despliegue: $fallos fallos"; exit 1; fi
