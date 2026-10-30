#!/usr/bin/env bash
# Prueba el Caddyfile INTERNO con la misma imagen que producción, sin tocar ningún servidor:
# una red de Docker de usar y tirar, una api simulada (otro Caddy que imita /api/interno/autoriza) y curl dentro de la red.
# Comprueba: validez, cabeceras de seguridad (CSP Report-Only, Permissions-Policy con xr-spatial-tracking, HSTS…),
# caché inmutable de estáticos, portada pública, finca y teselas solo con sesión, /oficina/ solo con sesión de oficina
# (forward_auth con ?para=oficina, ADR-0024), /api/interno cerrado desde fuera, y que
# /api/medios admite ~9 MB (V7) y el resto de /api/* sigue cortando a 1 MB, también en el bloque de borde (2 MB / 9 MB), y que los registros NO contienen cookies, Authorization ni el token del enlace.
# Uso: bash infra/probar-caddy.sh   (necesita Docker; sale con 0 si todo pasa)
set -euo pipefail
cd "$(dirname "$0")"

CADDY=$(sed -n 's/^\s*image:\s*\(caddy:[^ ]*\)\s*$/\1/p' compose.yml | head -1)
CURL="curlimages/curl:8.23.0@sha256:3fb7e13e5d179a845c97d78204f3f1064d1907037f26a3ebf91710571151fd93"
[ -n "$CADDY" ] || { echo "no encuentro la imagen de Caddy en compose.yml"; exit 2; }
NODE="node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53"   # la misma imagen que apps/api/Dockerfile
SUFIJO="$$"
RED="gemelo-prueba-$SUFIJO"; WEB="gemelo-prueba-web-$SUFIJO"; BORDE="gemelo-prueba-borde-$SUFIJO"; API="gemelo-prueba-api-$SUFIJO"; SUMI="gemelo-prueba-sumidero-$SUFIJO"
TMP=$(mktemp -d)
# en Git Bash (Windows): que no traduzca las rutas del contenedor, y ruta nativa para las del anfitrión
export MSYS_NO_PATHCONV=1
anfitrion() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
fallos=0
limpia() { docker rm -f "$WEB" "$BORDE" "$API" "$SUMI" >/dev/null 2>&1 || true; docker network rm "$RED" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpia EXIT

ok() { echo "  ok  $1"; }
mal() { echo "  MAL $1"; fallos=$((fallos + 1)); }

# ---- contenido estático de prueba (sintético)
mkdir -p "$TMP/srv/portada" "$TMP/srv/finca/assets" "$TMP/srv/oficina/assets" "$TMP/srv/teselas/hituelo"
echo '<!doctype html><title>portada</title>' > "$TMP/srv/portada/index.html"
echo '<!doctype html><title>finca</title>' > "$TMP/srv/finca/index.html"
echo 'console.log(1)' > "$TMP/srv/finca/assets/motor-abc123.js"
echo '<!doctype html><title>oficina</title>' > "$TMP/srv/oficina/index.html"
echo 'console.log(2)' > "$TMP/srv/oficina/assets/oficina-abc123.js"
echo '{"v":2}' > "$TMP/srv/teselas/hituelo/indice.json"

# ---- api simulada: 204 con la cookie «valida» (un hogar) o «oficina»; con ?para=oficina, solo «oficina» (el hogar, 403);
#      sin sesión, 303 a / si es navegación y 401 si no. Así se comprueba que Caddy le pasa la consulta ?para=oficina.
#      El resto de /api/* va a un «sumidero» (node) que LEE el cuerpo entero y responde 200: un `respond` de Caddy no lo lee y el tope
#      de request_body nunca se dispararía (el límite se aplica al leer el cuerpo, no al ver Content-Length).
cat > "$TMP/Caddyfile.api" <<'EOF'
{
	admin off
	auto_https off
}
:8000 {
	route /api/interno/autoriza {
		@oficina_ok {
			query para=oficina
			header Cookie *__Host-gemelo=oficina*
		}
		respond @oficina_ok 204
		@oficina_no {
			query para=oficina
			header Cookie *__Host-gemelo=valida*
		}
		respond @oficina_no 403
		@ok header Cookie *__Host-gemelo=valida*
		respond @ok 204
		@nav header Sec-Fetch-Mode navigate
		redir @nav / 303
		respond 401
	}
	header /api/* Set-Cookie "__Host-gemelo=SECRETO-DE-RESPUESTA; Path=/; HttpOnly; Secure; SameSite=Lax"
	reverse_proxy sumidero:9000
}
EOF

cat > "$TMP/sumidero.js" <<'JS'
require("http").createServer((q, r) => { q.on("error", () => {}); q.resume(); q.on("end", () => { r.setHeader("Content-Type", "application/json"); r.end('{"ok":true}'); }); }).listen(9000);
JS

echo "== validar el Caddyfile ($CADDY)"
docker network create "$RED" >/dev/null
docker create --name "$SUMI" --network "$RED" --network-alias sumidero "$NODE" node /sumidero.js >/dev/null
docker cp "$(anfitrion "$TMP/sumidero.js")" "$SUMI:/sumidero.js"
docker create --name "$API" --network "$RED" --network-alias api "$CADDY" caddy run --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
docker cp "$(anfitrion "$TMP/Caddyfile.api")" "$API:/etc/caddy/Caddyfile"
docker create --name "$WEB" --network "$RED" --network-alias gemelo-web "$CADDY" >/dev/null
docker cp "$(anfitrion "$PWD/Caddyfile")" "$WEB:/etc/caddy/Caddyfile"
docker cp "$(anfitrion "$TMP/srv")/." "$WEB:/srv/"
# el bloque de BORDE (infra/bloque-borde.txt) tal cual, con el dominio cambiado por un puerto de prueba (sin TLS), delante del Caddy interno
{ printf '{\n\tadmin off\n\tauto_https off\n}\n'; grep -v '^#' "$PWD/bloque-borde.txt" | sed 's/^gemelo\.canoydamas\.es {/:8081 {/'; } > "$TMP/Caddyfile.borde"
docker create --name "$BORDE" --network "$RED" "$CADDY" >/dev/null
docker cp "$(anfitrion "$TMP/Caddyfile.borde")" "$BORDE:/etc/caddy/Caddyfile"
docker start "$SUMI" "$API" "$WEB" "$BORDE" >/dev/null
if docker exec "$WEB" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then ok "configuración válida"; else mal "configuración NO válida"; fi
if docker exec "$BORDE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then ok "bloque de borde válido"; else mal "bloque de borde NO válido"; fi
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

echo "== oficina, solo con sesión de oficina"
r=$(pide /oficina/ -H "Sec-Fetch-Mode: navigate")
tiene "$r" "^HTTP/1.1 303" && tiene "$r" "^location: /$" && ok "sin sesión, /oficina/ manda a la portada (303)" || mal "sin sesión /oficina/ no redirige: $(head -1 <<<"$r")"
r=$(pide /oficina/ -H "Cookie: __Host-gemelo=valida")
tiene "$r" "^HTTP/1.1 403" && ok "con sesión de hogar, /oficina/ da 403 (Caddy pasa ?para=oficina a la api)" || mal "con sesión de hogar /oficina/ no da 403: $(head -1 <<<"$r")"
r=$(pide /oficina/assets/oficina-abc123.js -H "Cookie: __Host-gemelo=valida")
tiene "$r" "^HTTP/1.1 403" && ok "con sesión de hogar, los assets de la oficina tampoco" || mal "assets de la oficina con sesión de hogar: $(head -1 <<<"$r")"
r=$(pide /oficina/ -H "Cookie: __Host-gemelo=oficina")
tiene "$r" "^HTTP/1.1 200" && tiene "$r" "^cache-control: no-cache" && ok "con sesión de oficina, /oficina/ responde 200 y se revalida" || mal "con sesión de oficina /oficina/: $(head -1 <<<"$r")"
r=$(pide /oficina/assets/oficina-abc123.js -H "Cookie: __Host-gemelo=oficina")
tiene "$r" "^cache-control: private, max-age=31536000, immutable" && ok "assets de la oficina: inmutables y privados" || mal "assets de la oficina sin caché privada inmutable"

echo "== api"
r=$(pide /api/interno/autoriza -H "Cookie: __Host-gemelo=valida")
tiene "$r" "^HTTP/1.1 404" && ok "/api/interno cerrado desde fuera" || mal "/api/interno accesible desde fuera: $(head -1 <<<"$r")"
r=$(pide "/api/auth/entrar?t=SECRETO-DEL-ENLACE" -H "Cookie: __Host-gemelo=SECRETO-DE-COOKIE" -H "Authorization: Bearer SECRETO-DE-CABECERA")
tiene "$r" "^HTTP/1.1 200" && ok "/api pasa a la api" || mal "/api no llega a la api: $(head -1 <<<"$r")"

echo "== cuerpos grandes: /api/medios hasta ~9 MB, el resto de /api/* a 1 MB (interno) y 2 MB (borde)"
# Caddy corta con 413 al leer el cuerpo de más (el sumidero lo lee); el fichero se crea y se usa DENTRO de la red de Docker.
# Con el 413, Caddy puede cortar la conexión y curl salir con 55 (fallo al enviar) aunque ya imprimió el código: `|| true`, que `set -e` no tumbe el script.
sube() {  # sube <host:puerto> <ruta> <MB> (admite decimales vía KB: 0.9 = 921 KB) → código HTTP de un POST con un cuerpo de ese tamaño
  docker run --rm --network "$RED" --entrypoint sh "$CURL" -c "head -c $(awk "BEGIN{printf \"%d\", $3 * 1048576}") /dev/zero > /tmp/c; curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/octet-stream' --data-binary @/tmp/c http://$1$2 || true"
}
c=$(sube "$WEB:8080" /api/medios 5); [ "$c" = 200 ] && ok "interno: POST /api/medios de 5 MB pasa" || mal "interno: POST /api/medios de 5 MB da $c"
c=$(sube "$WEB:8080" /api/medios 8); [ "$c" = 200 ] && ok "interno: POST /api/medios de 8 MB (el tope por defecto) pasa" || mal "interno: POST /api/medios de 8 MB da $c"
c=$(sube "$WEB:8080" /api/medios 10); [ "$c" = 413 ] && ok "interno: POST /api/medios de 10 MB, 413" || mal "interno: POST /api/medios de 10 MB da $c"
c=$(sube "$WEB:8080" /api/sesion 2); [ "$c" = 413 ] && ok "interno: el resto de /api/* sigue cortando a 1 MB" || mal "interno: POST /api/sesion de 2 MB da $c (se esperaba 413)"
c=$(sube "$WEB:8080" /api/medios-x 2); [ "$c" = 413 ] && ok "interno: /api/medios-x no hereda el tope grande" || mal "interno: POST /api/medios-x de 2 MB da $c"
c=$(sube "$BORDE:8081" /api/medios 8); [ "$c" = 200 ] && ok "borde: POST /api/medios de 8 MB pasa hasta la api" || mal "borde: POST /api/medios de 8 MB da $c"
c=$(sube "$BORDE:8081" /api/medios 10); [ "$c" = 413 ] && ok "borde: POST /api/medios de 10 MB, 413" || mal "borde: POST /api/medios de 10 MB da $c"
c=$(sube "$BORDE:8081" /api/sesion 3); [ "$c" = 413 ] && ok "borde: el resto corta a 2 MB" || mal "borde: POST /api/sesion de 3 MB da $c (se esperaba 413)"
c=$(sube "$BORDE:8081" /api/sesion 0.9); [ "$c" = 200 ] && ok "borde: 0,9 MB al resto sigue pasando" || mal "borde: POST /api/sesion de 0,9 MB da $c"

echo "== registros sin credenciales"
sleep 1
registro=$(docker logs "$WEB" 2>&1)
for s in SECRETO-DEL-ENLACE SECRETO-DE-COOKIE SECRETO-DE-CABECERA SECRETO-DE-RESPUESTA; do
  grep -q "$s" <<<"$registro" && mal "el registro contiene $s" || ok "el registro no contiene $s"
done
grep -q '"uri":"/api/auth/entrar?t=REDACTADO"' <<<"$registro" && ok "el token del enlace sale como REDACTADO" || mal "no veo la URI con el token redactado"

echo
if [ "$fallos" -eq 0 ]; then echo "probar-caddy: todo bien"; else echo "probar-caddy: $fallos fallos"; exit 1; fi
