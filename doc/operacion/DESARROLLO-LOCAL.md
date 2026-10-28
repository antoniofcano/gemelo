# Desarrollo local con Docker

El mundo y los servicios base de la fase 1a y la fase 2 corriendo en tu equipo, con un solo comando y siempre igual. Todo vive en [`infra/dev/`](../../infra/dev/compose.yml) y lo comprueba `pruebas/guardianes/dev.test.js`. **No es producción**: lo que cambia está en [Qué NO es producción](#qué-no-es-producción).

## Requisitos

- Docker con Compose v2 (probado con Docker 29.6 y Compose v5 en Windows 10 con Docker Desktop). Unas imágenes de ≈ 1 GB la primera vez (PostGIS 733 MB, LiveKit 132 MB, Caddy 93 MB, Mailpit 51 MB).
- Lo de la puerta ([ONBOARDING](ONBOARDING.md)): Node ≥ 24, Python 3 (para generar el fixture) y `cd apps/web && npm i` (si falta, `levanta.mjs` hace `npm ci`).
- Las dependencias de los scripts (`infra/dev/herramientas/package.json`, versiones exactas: `livekit-server-sdk`, `pg`, `nodemailer`) las instala `levanta.mjs` con `npm ci` la primera vez.

## Levantar, mirar y parar

| Quiero… | Comando |
|---|---|
| Levantarlo todo | `npm run dev:arriba` (`-- --sin-build` para no reconstruir la web) |
| Ver la salud de cada servicio | `npm run dev:estado` (sale con 1 si algo falla) |
| Pararlo (los datos de la db se conservan) | `npm run dev:abajo` |
| Pararlo y borrar la db | `npm run dev:abajo -- --borra-datos` |
| Ver los registros | `docker compose -f infra/dev/compose.yml logs -f web` (o `db`, `livekit`, `correo`) |
| Una consola SQL | `docker compose -f infra/dev/compose.yml exec db psql -U gemelo` |
| La prueba completa (levanta, prueba y baja) | `GEMELO_DOCKER=1 node --test pruebas/guardianes/dev.test.js` |

`dev:arriba` hace, en orden: crea `infra/dev/.env` con **claves aleatorias** si no existe (git lo ignora; nunca se sobrescribe); genera el fixture sintético si falta (`pruebas/salida/fixture/`); copia el `indice.json` de la finca con `base: "/teselas/<finca>/"` (campo del contrato) y construye la web con Vite contra él (`npm run build` de `apps/web` con `GEMELO_DATOS`); deja junto a cada fichero de `apps/web/dist/` su `.br` y su `.gz`; y hace `docker compose up -d --wait`, que espera a los healthchecks. Tarda unos 40 s con las imágenes ya descargadas (medido el 2026-10-28: 39,4 s, con el build de Vite).

## Servicios y puertos

Todos los puertos se publican **solo en 127.0.0.1** (el guardián lo vigila). Se cambian en `infra/dev/.env`.

Las imágenes van fijadas por **versión estable y digest** (`imagen:versión@sha256:…`); el digest completo está en el compose. Versiones comprobadas el 2026-10-28 en Docker Hub y en las releases oficiales: cada una es la última estable publicada, sin rc, beta ni dev.

| Servicio | Imagen (versión fija + digest) | Puerto del anfitrión | Para qué |
|---|---|---|---|
| `web` | `caddy:2.11.7-alpine@sha256:eb4d35b7…` (oficial; 2.11.7 es la última release estable de Caddy, 2026-10-03) | `http://localhost:8780` y `https://localhost:8743` | la web (`apps/web/dist`) y las teselas en `/teselas/<finca>/…` |
| `db` | `postgis/postgis:18-3.6-alpine@sha256:c53a483f…` (la del proyecto PostGIS; PostgreSQL 18 es la estable vigente, la 19 va por rc1; PostGIS 3.6, la 3.7 va por rc3) | `127.0.0.1:55432` | PostgreSQL 18 + PostGIS 3.6; usuario y base `gemelo`, clave en `.env`; volumen `gemelo-dev_pg_datos` |
| `livekit` | `livekit/livekit-server:v1.13.11@sha256:25cd902d…` (oficial; última release estable, 2026-10-25) | `ws://localhost:7880`, TCP 7881, UDP 7882 | tiempo real (fase 2), claves de `.env`; `--dev` solo en local |
| `correo` | `axllent/mailpit:v1.32.0@sha256:0790692b…` (oficial, basada en Alpine; última release estable, 2026-10-22) | `http://localhost:8025` (buzón), SMTP `127.0.0.1:1025` | recibe el correo del enlace mágico; no envía nada fuera |

Lo que lleva cada uno:

- **Todos**: `restart: unless-stopped`, límite de memoria (web 128 MB, db 512 MB, LiveKit 256 MB, correo 128 MB), red propia `interna`, `no-new-privileges`, registros con rotación. Caddy, LiveKit y Mailpit corren como uid 1000, con el sistema de ficheros de solo lectura y sin capacidades (Caddy conserva `NET_BIND_SERVICE`: su binario la lleva y sin ella no arranca). Postgres arranca como root y su entrada baja a `postgres` (uid 999), como en la imagen oficial.
- **Caddy** ([`infra/dev/Caddyfile`](../../infra/dev/Caddyfile)): `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, COOP/CORP `same-origin`, `Permissions-Policy` (WebXR, micrófono, cámara y geolocalización solo para el propio origen), sin cabecera `Server`; **CSP en Report-Only**; `assets/` con `immutable` de un año y la página con `no-cache`; las teselas con `max-age=300`; compresión zstd/gzip al vuelo y brotli **precomprimido** (la imagen oficial de Caddy no trae brotli dinámico); los errores sin caché. HTTPS con `tls internal` (una CA local que se crea en cada arranque y **no** se instala en el sistema).
- **LiveKit** ([`infra/dev/livekit.yaml`](../../infra/dev/livekit.yaml)): un solo puerto UDP multiplexado (7882) y `node_ip: 127.0.0.1`. `--dev` solo sube el registro a depuración: las claves son siempre las aleatorias de `.env` (comprobado: el par conocido `devkey/secret` se **rechaza**). Para arrancarlo como en producción, sin `--dev`: `GEMELO_DEV_LIVEKIT_ARGS="--config /etc/livekit.yaml"` en `.env`.

## Datos reales sin versionarlos

Por defecto se sirve el fixture sintético. Para ver una finca real, apunta a una carpeta **fuera del repo** con la forma `<finca>/indice.json` y `<finca>/t/<kx>_<ky>.json|jpg` (lo que exporta `tuberia/finca_8_teselas.py` en modo ficheros; ver [DATOS](DATOS.md)):

```
# en infra/dev/.env (que git ignora), o como variables de entorno
GEMELO_DEV_TESELAS=<ruta absoluta a tu carpeta de datos>
GEMELO_DEV_FINCA=hituelo
```

y `npm run dev:arriba`. `levanta.mjs` **se niega** si la carpeta cae dentro del repo (salvo en `pruebas/salida/`, que está ignorada). La carpeta se monta de solo lectura. La web construida lleva el índice dentro (como hoy en la salida artefacto), así que `apps/web/dist/` con datos reales tampoco se publica: está ignorado por git.

## Las Quest y el móvil

Todo escucha en 127.0.0.1, así que otro dispositivo de la red no llega. Para las Quest por USB: `adb reverse tcp:8780 tcp:8780` (y `tcp:7880`, `tcp:7881` para LiveKit) y abrir `http://localhost:8780` en el navegador del casco: `localhost` cuenta como contexto seguro y WebXR funciona sin certificado. **No probado** en un casco real con este entorno. Para el iPhone no hay atajo equivalente sin abrir puertos a la red; queda fuera de este entorno.

## Cómo se enchufará la api

`apps/api/` la escribe otro trabajo. En [`infra/dev/compose.yml`](../../infra/dev/compose.yml) hay un servicio `api` **comentado** y en el Caddyfile un `handle /api/*` comentado. Para enchufarla basta con descomentar los dos bloques. Lo que el bloque espera de la api:

- un `Dockerfile` en `apps/api/`, un proceso que escucha en el **8000** dentro de la red `interna` y no publica ningún puerto (entra por Caddy en `/api/`);
- `GET /api/salud` → 200 (el healthcheck lo pide con `wget`, que la imagen tiene que traer, o se cambia por el equivalente);
- su configuración por variables de entorno: `GEMELO_DB_URL` (`postgresql://gemelo@db:5432/gemelo`) y `GEMELO_DB_CLAVE`; `GEMELO_SMTP_HOST=correo`, `GEMELO_SMTP_PUERTO=1025` (Mailpit acepta cualquier usuario y clave); `GEMELO_URL_PUBLICA` (para armar el enlace mágico); `GEMELO_LIVEKIT_URL=ws://livekit:7880`, `GEMELO_LIVEKIT_CLAVE` y `GEMELO_LIVEKIT_SECRETO` (para firmar los tokens de sala); `GEMELO_TESELAS=/srv/teselas` (la misma carpeta, de solo lectura);
- arranca después de `db` y `correo` sanos (`depends_on … service_healthy`).

Si la api de producción elige otros nombres, manda la suya: se ajusta este bloque, no al revés.

## Problemas conocidos

- **La CSP es Report-Only y deja pasar las fuentes de Google** (`fonts.googleapis.com`, `fonts.gstatic.com`), porque `apps/web/plantilla.html` las pide. Producción debería servirlas desde el propio origen y endurecer la CSP. `style-src` lleva `'unsafe-inline'` porque el motor escribe `style="…"` en el HTML de los paneles. La e2e comprueba que Chrome no avisa de **ninguna** violación con la CSP actual.
- **Sin favicon**: `apps/web` no trae icono; Caddy responde 204 a `/favicon.ico` para no ensuciar la consola (como el servidor de pruebas de los guardianes). Se quita cuando la web tenga su icono.
- **La CA local se pierde al parar** (tmpfs): el navegador avisa del certificado en cada arranque. Es a propósito; para no ver el aviso usa `http://localhost:8780`, que ya es contexto seguro.
- `postgis/postgis` solo se publica para **amd64**: en un Mac con Apple Silicon corre emulada (más lenta). Su etiqueta `18-3.6-alpine` avanza con cada parche; el digest es lo que la deja fija.
- **PostgreSQL 18 monta el volumen en `/var/lib/postgresql`** (no en `…/data`): un volumen creado con la 17 no sirve. En desarrollo, `npm run dev:abajo -- --borra-datos` y volver a levantar; en producción haría falta `pg_upgrade` o volcado y restauración.
- Si cambias el `Caddyfile` con el entorno levantado: `docker compose -f infra/dev/compose.yml restart web` (la api de administración de Caddy está apagada).
- Si un puerto ya está ocupado en tu equipo, cámbialo en `infra/dev/.env` y vuelve a levantar.

## Cómo se actualizan las versiones

Las versiones no se suben solas: se cambian a mano, con la puerta y la e2e. Para cada imagen:

1. Mirar la última release **estable** en su repositorio oficial (Caddy, LiveKit, Mailpit, PostGIS) y que la etiqueta exista en Docker Hub; nunca `latest`, `edge`, `master`, `dev`, `rc`, `beta`, `alpha` ni `nightly` (el guardián las rechaza). Preferir la variante `-alpine` cuando la imagen oficial la ofrece.
2. Sacar el digest del índice multiarquitectura: `docker buildx imagetools inspect <imagen>:<versión>` (línea `Digest:`), o `docker pull <imagen>:<versión>` y `docker image inspect --format "{{index .RepoDigests 0}}" <imagen>:<versión>`.
3. Cambiar `imagen:versión@sha256:…` en `infra/dev/compose.yml`, y la tabla y la fecha de comprobación de este documento. Leer las notas de la release: un salto de versión mayor de PostgreSQL cambia el formato de los datos (ver [Problemas conocidos](#problemas-conocidos)).
4. `npm run puerta` y `GEMELO_DOCKER=1 node --test pruebas/guardianes/dev.test.js`, y un commit que diga qué se subió y por qué.

Los paquetes de npm de `infra/dev/herramientas/` van con versión exacta y su `package-lock.json` (el guardián lo exige); se suben con `npm install <paquete>@<versión> --save-exact` en esa carpeta.

Producción debería usar **las mismas imágenes base con el mismo digest** que este entorno, para que lo probado aquí sea lo que corre allí; lo que cambia entre los dos está en la tabla de abajo.

## Qué NO es producción

La producción es la de [ADR-0011](../adr/0011-alojamiento-en-el-vps-de-ovh.md) (VPS de OVH, la escribe otro trabajo en `infra/` fuera de `infra/dev/`). Diferencias que hay que tener presentes:

| | Desarrollo (`infra/dev/`) | Producción (`infra/`, VPS de OVH) |
|---|---|---|
| Entrada | Caddy propio en 127.0.0.1:8780/8743 | sin puertos web: el Caddy de borde de Oficultor enruta `gemelo.canoydamas.es` a la red `borde` |
| TLS | `tls internal`, CA local no instalada, sin HSTS | certificado público del borde, HSTS |
| CSP | Report-Only, con las fuentes de Google | aplicada (a decidir con la api y las fuentes propias) |
| Claves | aleatorias por equipo en `infra/dev/.env` | secretos del VPS, fuera del repo |
| LiveKit | `--dev` (se quita con `GEMELO_DEV_LIVEKIT_ARGS`), un solo UDP en 127.0.0.1, sin TURN | puertos UDP/TCP abiertos con `ufw`, TURN, IP pública |
| Correo | Mailpit (no sale nada) | SMTP de OVH (decisión 15) |
| Datos | fixture sintético o una carpeta local | teselas del servidor (formato v3, ADR propio de la fase 1a) |
| Copias y registros | ninguna; registros locales con rotación | copias nocturnas y restauración ensayada |
| Imágenes | oficiales, versión estable + digest, sin construir nada | las mismas bases con su digest; las propias (web, api) construidas en CI, despliegue con aprobación manual |
