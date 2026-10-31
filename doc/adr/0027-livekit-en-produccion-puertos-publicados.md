# ADR-0027 — LiveKit en producción: red de Docker y dos puertos publicados

- **Estado:** Aceptado
- **Fecha:** 2026-10-31

## Contexto
ADR-0011 dejó LiveKit como la excepción a «ningún puerto publicado», y RUNBOOK-VPS suponía `network_mode: host` para que mandaran las reglas de `ufw`. Con la presencia (F2) y la voz (F3) hechas en local, producción seguía sin servicio LiveKit ni ruta `/rtc`. La inspección del VPS (solo lectura, 2026-10-31) dio dos hechos: `ufw` solo permite OpenSSH y los 80/443 del borde funcionan porque Docker se lo salta; y hay más vecinos de los previstos.

## Decisión
LiveKit va en `infra/compose.yml` con el perfil `presencia` (un `up -d` normal no lo arranca), en la red `interna` y con **dos únicos puertos publicados**: `7881/tcp` (ICE por TCP) y `7882/udp` (medios, un solo puerto multiplexado, como en `infra/dev`). La señalización entra por el mismo origen (`/rtc`, a través del borde y del Caddy interno). La IP pública llega por `NODE_IP` y las claves por `key_file` (secreto `livekit_claves`).

## Alternativas consideradas
- **`network_mode: host`**: las reglas de `ufw` mandarían, pero `web` y `api` dejarían de llegar a `livekit:7880` por nombre, habría que abrir el puente de Docker hacia el anfitrión en `ufw`, y LiveKit escucharía en todas las interfaces de una máquina compartida.
- **Rango 50000-60000/udp** (el de la documentación de LiveKit): 10.000 puertos abiertos a Internet sin que `ufw` los filtre, y una regla de `iptables` por puerto con Docker. Un puerto multiplexado basta para las visitas previstas; ya se usa en local (P4).
- **`use_external_ip: true`**: descubre la IP por STUN contra un tercero en cada arranque; `NODE_IP` no depende de nadie.
- **`LIVEKIT_KEYS` en variable**: el secreto saldría en `docker inspect`, contra la regla de los secretos por fichero.

## Consecuencias
- **Positivas:** una sola forma de LiveKit en local y en producción; el resto del compose sigue sin puertos.
- **Negativas / coste:** esos dos puertos quedan abiertos a Internet **aunque `ufw` no los liste**: Docker escribe sus reglas por delante. Lo único que puede filtrarlos fuera de la máquina es el cortafuegos de red de OVH, si está activo (no se sabe). Un puerto UDP multiplexado concentra el tráfico en un solo proceso: con 40 visitantes **no está medido**. Sin TURN: una red que corte UDP y también el 7881/tcp se queda sin voz; lo evalúa la EIPD (decisión 165).
- **Enmienda** a [ADR-0011](0011-alojamiento-en-el-vps-de-ovh.md): la excepción de LiveKit se resuelve así, no con reglas de `ufw` ni con la red del anfitrión.

## Comprobación
`pruebas/guardianes/api.test.js` vigila que solo LiveKit publique, en su perfil, los puertos del contrato, y que las claves vayan por fichero. El formato y los permisos de `key_file` se leyeron en la fuente de LiveKit (`pkg/service/wire.go`: YAML `clave: secreto`, rechaza solo los permisos de «otros»; 2026-10-31). **No probado:** LiveKit fuera del equipo, `key_file` en la práctica (en local se usa `LIVEKIT_KEYS`), ni contra el VPS.
