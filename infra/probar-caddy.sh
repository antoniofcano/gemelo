#!/usr/bin/env bash
# Prueba el Caddyfile INTERNO con la misma imagen que producción, sin tocar ningún servidor:
# una red de Docker de usar y tirar, una api simulada (otro Caddy que imita /api/interno/autoriza) y curl dentro de la red.
# Comprueba: validez, cabeceras de seguridad (CSP Report-Only, Permissions-Policy con xr-spatial-tracking, HSTS…),
# caché inmutable de estáticos, portada pública, finca y teselas solo con sesión, /api/interno cerrado desde fuera, y que
# los registros NO contienen cookies, Authorization ni el token del enlace.
# Uso: bash infra/probar-caddy.sh   (necesita Docker; sale con 0 si todo pasa)
set -euo pipefail
cd "$(dirname "$0")"

CADDY=$(sed -n 's/^\s*image:\s*\(caddy:[^ ]*\)\s*$/\1/p' compose.yml | head -1)
CURL="curlimages/curl:8.23.0@sha256:3fb7e13e5d179a845c97d78204f3f1064d1907037f26a3ebf91710571151fd93"
[ -n "$CADDY" ] || { echo "no encuentro la imagen de Caddy en compose.yml"; exit 2; }
SUFIJO="$$"
RED="gemelo-prueba-$SUFIJO"; WEB="gemelo-prueba-web-$SUFIJO"; API="gemelo-prueba-api-$SUFIJO"
TMP=$(mktemp -d)
# en Git Bash (Windows): que no traduzca las rutas del contenedor, y ruta nativa para las del anfitrión
export MSYS_NO_PATHCONV=1
anfitrion() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
fallos=0
limpia() { docker rm -f "$WEB" "$API" >/dev/null 2>&1 || true; docker network rm "$RED" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpia EXIT

ok() { echo "  ok  $1"; }
mal() { echo "  MAL $1"; fallos=$((fallos + 1)); }

# ---- contenido estático de prueba (sintético)
mkdir -p "$TMP/srv/portada" "$TMP/srv/finca/assets" "$TMP/srv/teselas/hituelo"
echo '<!doctype html><title>portada</title>' > "$TMP/srv/portada/index.html"
echo '<!doctype html><title>finca</title>' > "$TMP/srv/finca/index.html"
echo 'console.log(1)' > "$TMP/srv/finca/assets/motor-abc123.js"
echo '{"v":2}' > "$TMP/srv/teselas/hituelo/indice.json"

# ---- api simulada: 204 con la cookie «valida», 303 a / si es navegación, 401 si no
cat > "$TMP/Caddyfile.api" <<'EOF'
{
	admin off
	auto_https off
}
:8000 {
	route /api/interno/autoriza {
		@ok header Cookie *__Host-gemelo=valida*
		respond @ok 204
		@nav header Sec-Fetch-Mode navigate
		redir @nav / 303
		respond 401
	}
	header /api/* Set-Cookie "__Host-gemelo=SECRETO-DE-RESPUESTA; Path=/; HttpOnly; Secure; SameSite=Lax"
	respond /api/* `{"ok":true}` 200
}
EOF

echo "== validar el Caddyfile ($CADDY)"
docker network create "$RED" >/dev/null
docker create --name "$API" --network "$RED" --network-alias api "$CADDY" caddy run --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
docker cp "$(anfitrion "$TMP/Caddyfile.api")" "$API:/etc/caddy/Caddyfile"
docker create --name "$WEB" --network "$RED" "$CADDY" >/dev/null
docker cp "$(anfitrion "$PWD/Caddyfile")" "$WEB:/etc/caddy/Caddyfile"
docker cp "$(anfitrion "$TMP/srv")/." "$WEB:/srv/"
docker start "$API" "$WEB" >/dev/null
if docker exec "$WEB" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then ok "configuración válida"; else mal "configuración NO válida"; fi
sleep 2

pide() {  # pide <ruta> [cabeceras curl…] → cabeceras de respuesta (código en la primera línea)
  local ruta="$1"; shift
  docker run --rm --network "$RED" "$CURL" -s -o /dev/null -D - "$@" "http://$WEB:8080$ruta" | tr -d '\r'
}
tiene() { grep -qi -- "$2" <<<"$1"; }

echo "== portada pública"
r=$(pide /)
tiene "$r" "^HTTP/1.1 200" && ok "/ responde 200 sin sesión" || mal "/ no responde 200: $(head -1 <<<"$r")"
tiene "$r" "^content-security-policy-report-only: default-src 'self'; script-src 'self'" && ok "CSP estricta en Report-Only" || mal "falta la CSP Report-Only"
tiene "$r" "^content-security-policy:" && mal "hay CSP impuesta (debe ser solo informe en F1a)" || ok "la CSP no se impone todavía"
tiene "$r" "^permissions-policy:.*xr-spatial-tracking=(self)" && ok "Permissions-Policy con xr-spatial-tracking=(self)" || mal "Permissions-Policy sin xr-spatial-tracking"
tiene "$r" "^strict-transport-security: max-age=31536000" && ok "HSTS" || mal "falta HSTS"
tiene "$r" "^x-content-type-options: nosniff" && ok "nosniff" || mal "falta nosniff"
tiene "$r" "^x-frame-options: DENY" && ok "X-Frame-Options DENY" || mal "falta X-Frame-Options"
tiene "$r" "^referrer-policy: strict-origin-when-cross-origin" && ok "Referrer-Policy strict-origin-when-cross-origin" || mal "falta Referrer-Policy"
tiene "$r" "^cross-origin-opener-policy: same-origin" && ok "COOP" || mal "falta COOP"
tiene "$r" "^server:" && mal "se anuncia el servidor" || ok "sin cabecera Server"
tiene "$r" "^cache-control: no-cache" && ok "la portada no se cachea a ciegas" || mal "portada sin Cache-Control no-cache"

echo "== finca y teselas, solo con sesión"
r=$(pide /finca/ -H "Sec-Fetch-Mode: navigate")
tiene "$r" "^HTTP/1.1 303" && tiene "$r" "^location: /$" && ok "sin sesión, /finca/ manda a la portada (303)" || mal "sin sesión /finca/ no redirige: $(head -1 <<<"$r")"
r=$(pide /teselas/hituelo/indice.json)
tiene "$r" "^HTTP/1.1 401" && ok "sin sesión, las teselas dan 401" || mal "sin sesión las teselas no dan 401: $(head -1 <<<"$r")"
r=$(pide /finca/ -H "Cookie: __Host-gemelo=valida")
tiene "$r" "^HTTP/1.1 200" && ok "con sesión, /finca/ responde 200" || mal "con sesión /finca/ no responde 200: $(head -1 <<<"$r")"
r=$(pide /finca/assets/motor-abc123.js -H "Cookie: __Host-gemelo=valida")
tiene "$r" "^cache-control: public, max-age=31536000, immutable" && ok "estáticos con hash: caché inmutable" || mal "estáticos sin caché inmutable"
r=$(pide /teselas/hituelo/indice.json -H "Cookie: __Host-gemelo=valida")
tiene "$r" "^HTTP/1.1 200" && tiene "$r" "^cache-control: private" && ok "teselas con sesión: 200 y caché privada" || mal "teselas con sesión: $(head -1 <<<"$r")"

echo "== api"
r=$(pide /api/interno/autoriza -H "Cookie: __Host-gemelo=valida")
tiene "$r" "^HTTP/1.1 404" && ok "/api/interno cerrado desde fuera" || mal "/api/interno accesible desde fuera: $(head -1 <<<"$r")"
r=$(pide "/api/auth/entrar?t=SECRETO-DEL-ENLACE" -H "Cookie: __Host-gemelo=SECRETO-DE-COOKIE" -H "Authorization: Bearer SECRETO-DE-CABECERA")
tiene "$r" "^HTTP/1.1 200" && ok "/api pasa a la api" || mal "/api no llega a la api: $(head -1 <<<"$r")"

echo "== registros sin credenciales"
sleep 1
registro=$(docker logs "$WEB" 2>&1)
for s in SECRETO-DEL-ENLACE SECRETO-DE-COOKIE SECRETO-DE-CABECERA SECRETO-DE-RESPUESTA; do
  grep -q "$s" <<<"$registro" && mal "el registro contiene $s" || ok "el registro no contiene $s"
done
grep -q '"uri":"/api/auth/entrar?t=REDACTADO"' <<<"$registro" && ok "el token del enlace sale como REDACTADO" || mal "no veo la URI con el token redactado"

echo
if [ "$fallos" -eq 0 ]; then echo "probar-caddy: todo bien"; else echo "probar-caddy: $fallos fallos"; exit 1; fi
