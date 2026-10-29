# Desarrollo local con Docker

El mundo, la api y los servicios base de la fase 1a y la fase 2 corriendo en tu equipo, con un solo comando y siempre igual (decisión 21: nada va al VPS hasta que funcione y esté probado aquí). Todo vive en [`infra/dev/`](../../infra/dev/compose.yml) y lo comprueba `pruebas/guardianes/dev.test.js`. **No es producción**: lo que cambia está en [Qué NO es producción](#qué-no-es-producción).

## Requisitos

- Docker con Compose v2 (probado con Docker 29.6 y Compose v5 en Windows 10 con Docker Desktop). Unas imágenes de ≈ 1 GB la primera vez (PostGIS 733 MB, LiveKit 132 MB, Caddy 93 MB, Mailpit 51 MB).
- Lo de la puerta ([ONBOARDING](ONBOARDING.md)): Node ≥ 24, Python 3 (para generar el fixture) y `cd apps/web && npm i` (si falta, `levanta.mjs` hace `npm ci`).
- Para la siembra de hazas: `jsonschema` de Python (`pip install -r tuberia/hazas/requirements.txt`). La imagen de la api se construye sola (no hace falta `npm ci` en `apps/api` para levantar; sí para sus pruebas).
- Las dependencias de los scripts (`infra/dev/herramientas/package.json`, versiones exactas: `livekit-server-sdk`, `pg`, `nodemailer`) las instala `levanta.mjs` con `npm ci` la primera vez.

## Levantar, mirar y parar

| Quiero… | Comando |
|---|---|
| Levantarlo todo | `npm run dev:arriba` (`-- --sin-build` para no reconstruir la web) |
| Abrir el https a la WiFi para probar en aparatos | `npm run dev:arriba -- --red-local` ([Prueba en aparatos](#prueba-en-aparatos)) |
| Ver la salud de cada servicio | `npm run dev:estado` (sale con 1 si algo falla) |
| Pararlo (los datos de la db se conservan) | `npm run dev:abajo` |
| Pararlo y borrar la db | `npm run dev:abajo -- --borra-datos` |
| Ver los registros | `docker compose -f infra/dev/compose.yml logs -f api` (o `web`, `db`, `livekit`, `correo`, `migra`) |
| Una consola SQL (como dueño) | `docker compose -f infra/dev/compose.yml exec db psql -U gemelo_dueno -d gemelo` |
| Volver a sembrar los datos de prueba | `node infra/dev/herramientas/siembra.mjs` (idempotente; con el entorno levantado) |
| La prueba completa (levanta, hace el recorrido de entrada y baja) | `GEMELO_DOCKER=1 node --test pruebas/guardianes/dev.test.js` |

`dev:arriba` hace, en orden: crea `infra/dev/.env` con **claves aleatorias** si no existe (git lo ignora; nunca se sobrescribe); genera el fixture sintético si falta (`pruebas/salida/fixture/`); copia el `indice.json` de la finca con `base: "/teselas/<finca>/"` (campo del contrato) y construye la web con Vite contra él (`npm run build` de `apps/web` con `GEMELO_DATOS`); deja junto a cada fichero de `apps/web/dist/` su `.br` y su `.gz`; arranca la base y comprueba que tiene los [roles de producción](#los-roles-de-la-base); hace `docker compose up -d --build --wait`, que construye la imagen de la api (`apps/api/Dockerfile`; con la caché de Docker, rápido si no cambió nada), aplica las migraciones (servicio `migra`) y espera a los healthchecks; y **siembra** las hazas, los olivos y los hogares de prueba sintéticos ([La siembra](#la-siembra-datos-sintéticos)). Si `.env` es de antes y le falta una clave nueva de la plantilla (como `GEMELO_DEV_SESION_SECRETO`), la **añade** sin tocar las demás. Tiempos medidos: ver [El recorrido de entrada](#el-recorrido-de-entrada).

## Servicios y puertos

Todos los puertos se publican **solo en 127.0.0.1** (el guardián lo vigila). Se cambian en `infra/dev/.env`. La única excepción es el interruptor `--red-local`, que abre solo el https de la web en la IP de la red local ([Prueba en aparatos](#prueba-en-aparatos)).

Las imágenes van fijadas por **versión estable y digest** (`imagen:versión@sha256:…`); el digest completo está en el compose. Versiones comprobadas el 2026-10-28 en Docker Hub y en las releases oficiales: cada una es la última estable publicada, sin rc, beta ni dev.

| Servicio | Imagen (versión fija + digest) | Puerto del anfitrión | Para qué |
|---|---|---|---|
| `web` | `caddy:2.11.7-alpine@sha256:eb4d35b7…` (oficial; 2.11.7 es la última release estable de Caddy, 2026-10-03) | `https://localhost:8743` (y `http://localhost:8780`, que solo da `/salud` y redirige lo demás a https) | portada, mundo (`apps/web/dist` en `/finca/`), teselas en `/teselas/<finca>/…` y la api en `/api/` |
| `db` | `postgis/postgis:18-3.6-alpine@sha256:c53a483f…` (la del proyecto PostGIS; PostgreSQL 18 es la estable vigente, la 19 va por rc1; PostGIS 3.6, la 3.7 va por rc3) | `127.0.0.1:55432` | PostgreSQL 18 + PostGIS 3.6; base `gemelo` con los roles de producción (`gemelo_dueno` y `gemelo_api`, [abajo](#los-roles-de-la-base)), claves en `.env`; volumen `gemelo-dev_pg_datos` |
| `livekit` | `livekit/livekit-server:v1.13.11@sha256:25cd902d…` (oficial; última release estable, 2026-10-25) | `ws://localhost:7880`, TCP 7881, UDP 7882 | tiempo real (fase 2), claves de `.env`; `--dev` solo en local |
| `correo` | `axllent/mailpit:v1.32.0@sha256:0790692b…` (oficial, basada en Alpine; última release estable, 2026-10-22) | `http://localhost:8025` (buzón), SMTP `127.0.0.1:1025` | recibe el correo del enlace mágico; no envía nada fuera |
| `migra` | `gemelo-api:local`, construida aquí de `apps/api/Dockerfile` (base `node:24.22.1-alpine3.24@sha256:06d7adf3…`, la del contrato `contratos/publicacion-vps.json`) | ninguno | aplica `apps/api/migraciones/` y termina (salida 0); la api espera a que acabe |
| `api` | la misma `gemelo-api:local` | ninguno: se entra por Caddy en `/api/` | el servidor de la fase 1a (enlace mágico, sesión, hazas); escucha en 8000 dentro de la red `interna` |

Lo que lleva cada uno:

- **Todos**: `restart: unless-stopped`, límite de memoria (web 128 MB, db 512 MB, LiveKit 256 MB, correo 128 MB), red propia `interna`, `no-new-privileges`, registros con rotación. Caddy, LiveKit y Mailpit corren como uid 1000, con el sistema de ficheros de solo lectura y sin capacidades (Caddy conserva `NET_BIND_SERVICE`: su binario la lleva y sin ella no arranca). Postgres arranca como root y su entrada baja a `postgres` (uid 999), como en la imagen oficial.
- **Caddy** ([`infra/dev/Caddyfile`](../../infra/dev/Caddyfile)): **la misma forma que producción** ([`infra/Caddyfile`](../../infra/Caddyfile)): la portada pública en `/` (provisional: [`infra/dev/portada/`](../../infra/dev/portada/index.html)), el mundo en `/finca/` y las teselas en `/teselas/` **solo con sesión** (`forward_auth` a `/api/interno/autoriza`: sin sesión, una navegación va a la portada con 303 y una carga recibe 401; decisión 16), la api en `/api/` y `/api/interno/*` cerrada desde fuera (404). Además: `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, COOP/CORP `same-origin`, `Permissions-Policy` (WebXR, micrófono, cámara y geolocalización solo para el propio origen), sin cabecera `Server`; **CSP en Report-Only**; `assets/` con `immutable` de un año y la página con `no-cache`; las teselas con `private, max-age=300`; compresión zstd/gzip al vuelo y brotli **precomprimido** (la imagen oficial de Caddy no trae brotli dinámico); los errores sin caché. HTTPS con `tls internal` (una CA local que se crea en cada arranque y **no** se instala en el sistema).
- **LiveKit** ([`infra/dev/livekit.yaml`](../../infra/dev/livekit.yaml)): un solo puerto UDP multiplexado (7882) y `node_ip: 127.0.0.1`. `--dev` solo sube el registro a depuración: las claves son siempre las aleatorias de `.env` (comprobado: el par conocido `devkey/secret` se **rechaza**). Para arrancarlo como en producción, sin `--dev`: `GEMELO_DEV_LIVEKIT_ARGS="--config /etc/livekit.yaml"` en `.env`.

## Datos reales sin versionarlos

Por defecto se sirve el fixture sintético. Para ver una finca real, apunta a una carpeta **fuera del repo** con la forma `<finca>/indice.json` y `<finca>/t/<kx>_<ky>.json|jpg` (lo que exporta `tuberia/finca_8_teselas.py` en modo ficheros; ver [DATOS](DATOS.md)):

```
# en infra/dev/.env (que git ignora), o como variables de entorno
GEMELO_DEV_TESELAS=<ruta absoluta a tu carpeta de datos>
GEMELO_DEV_FINCA=hituelo
```

y `npm run dev:arriba`. `levanta.mjs` **se niega** si la carpeta cae dentro del repo (salvo en `pruebas/salida/`, que está ignorada). La carpeta se monta de solo lectura. La web construida lleva el índice dentro (como hoy en la salida artefacto), así que `apps/web/dist/` con datos reales tampoco se publica: está ignorado por git.

## Prueba en aparatos

Decisión de Antonio (2026-10-29): la primera prueba en aparatos (otro navegador, el móvil, las Quest) es **cada uno por su cuenta, sin presencia**, y el acceso es **por la WiFi de casa y solo mientras dura la prueba**. Por defecto todo escucha en 127.0.0.1 y ningún otro aparato llega.

### El interruptor de red local

```
npm run dev:arriba -- --red-local          # o con la IP a mano: GEMELO_DEV_IP=<ip> npm run dev:arriba -- --red-local
npm run dev:estado                         # dice «ABIERTO A LA RED LOCAL … solo el https de la web» o «todo en 127.0.0.1»
npm run dev:abajo                          # al acabar (o volver a levantar sin --red-local: cierra el puerto)
```

Qué hace ([`infra/dev/compose.red-local.yml`](../../infra/dev/compose.red-local.yml), que solo se suma con el interruptor):

- **Solo el https de Caddy** (`https://<IP>:8743`) escucha además en la IP de la red local del equipo. El http (8780), la base, Mailpit, LiveKit y la api siguen en 127.0.0.1 o sin puerto (comprobado por TCP desde la IP de la red: 8780, 55432, 7880, 7881, 8025 y 1025, cerrados; el UDP 7882 sigue publicado solo en 127.0.0.1 en el compose).
- La IP sale de `GEMELO_DEV_IP` o se detecta: la primera IPv4 privada (RFC 1918) de una interfaz física, primero la WiFi; se saltan las virtuales (Docker, WSL, Hyper-V, VirtualBox, VMware, VPN) y la red 192.168.56.x que VirtualBox crea por defecto con un nombre que no la delata. Si hay varias, `dev:arriba` las enseña; una IP que no sea privada se rechaza.
- Caddy emite con su CA local un certificado **también para la IP** (y `default_sni` la elige, porque a una IP el navegador no le manda SNI). El aparato avisa del certificado y se acepta (decisión 54).
- La api arma el enlace del correo con `https://<IP>:8743` y admite los POST de los dos orígenes (`localhost` y la IP).
- `dev:estado` falla si algo **que no sea** el https de la web está publicado fuera de 127.0.0.1. La e2e comprueba que, sin el interruptor, Docker no publica nada fuera de 127.0.0.1; y el guardián, con `docker compose config`, que sin el interruptor nada sale de 127.0.0.1 (aunque `GEMELO_DEV_IP` esté puesta) y con él solo el https de la web.

**El enlace mágico en el aparato.** Mailpit sigue solo en el ordenador. El camino más sencillo, sin código nuevo: pide el enlace desde el aparato (o desde el ordenador) en la portada; en el ordenador, abre el correo en `http://localhost:8025` y pulsa el enlace (lleva la IP de la red; **abrirlo no lo gasta**: es la página intermedia con el botón «Entrar»); en esa página, «Crear código QR» de Chrome (menú de compartir) y léelo con el móvil; pulsa «Entrar» **en el aparato** (la cookie es de cada navegador). En las Quest no hay lector de QR en el navegador: o se teclea el enlace, o se usa el camino por USB de abajo. Propuesta, **sin hacer**: un código corto de un solo uso (6 cifras, 10 min) que la api acepte junto al enlace, para teclearlo en las gafas; o `dev:enlace <correo>`, que pida el enlace y lo pinte como QR en la terminal. Lo decide Antonio.

**Por USB (Quest, sin abrir nada a la red):** `adb reverse tcp:8743 tcp:8743` (y `tcp:8025` para ver Mailpit en el casco) y abrir `https://localhost:8743` en el navegador del casco, aceptando el aviso del certificado. Por http no hay sesión (la cookie es `Secure`).

### Hituelo real en local

Ya existe: `GEMELO_DEV_TESELAS` (la carpeta de datos, **fuera del repo**, con `hituelo/indice.json` y `hituelo/t/`) y `GEMELO_DEV_FINCA=hituelo`, en el entorno o en `infra/dev/.env` (ignorado); ver [Datos reales sin versionarlos](#datos-reales-sin-versionarlos). Sin `--sin-build`, porque la web lleva el índice dentro. Se puede juntar con el interruptor. Las **hazas siguen siendo las sintéticas del fixture**: caen en las coordenadas del fixture y no encima del Hituelo real (hoy el mundo aún no pinta lindes, así que no se ve). Comprobado montando una copia del fixture desde una carpeta fuera del repo; **no probado con los datos reales**, que no están en esta máquina.

### Lo no probado

- **Ningún aparato real**: ni otro equipo, ni un Android, ni el iPhone, ni las Quest han abierto `https://<IP>:8743`. Lo probado (2026-10-29, Windows 10 con Docker Desktop) es desde el propio equipo contra su IP de la WiFi: certificado verificado con la CA local (SAN = la IP), pedir el enlace con `Origin` de la IP (202), el enlace del correo con la IP, la página intermedia (200), «Entrar» (303 a `/finca/` con la cookie) y `/finca/` con esa sesión (200).
- El cortafuegos de Windows (o el del router) puede bloquear la entrada desde otro aparato: no comprobado. Si pasa, Windows suele preguntar al abrir el puerto la primera vez.
- WebXR en las Quest con un certificado aceptado a mano (no instalado): no comprobado.
- El QR de Chrome y el camino por USB con este entorno: no probados.

## La api

Servicio `api` de [`infra/dev/compose.yml`](../../infra/dev/compose.yml), construido de [`apps/api/Dockerfile`](../../apps/api/Dockerfile) (contexto: la raíz del repo, porque la imagen lleva `contratos/haza.schema.json`). Corre como `node` (uid 1000), con el sistema de ficheros de solo lectura, sin capacidades, `/tmp` en memoria, 256 MB y sin puertos publicados. El healthcheck pide `GET /api/salud` con el `fetch` de Node (como producción). Arranca cuando `db` y `correo` están sanos y `migra` ha terminado bien.

Su configuración (todo por variables de entorno; la lista completa, en `apps/api/src/config.ts` y `contratos/publicacion-vps.json`):

| Variable | Valor en local | Por qué |
|---|---|---|
| `NODE_ENV` | `development` | fuera de producción `config.ts` deja los secretos en variable y el SMTP sin TLS ni usuario |
| `GEMELO_API_PUERTO` | `8000` | el del contrato |
| `GEMELO_DB_URL` + `GEMELO_DB_CLAVE` | `postgresql://gemelo_api@db:5432/gemelo` + `GEMELO_DEV_PG_API_CLAVE` de `.env` | el rol de permisos mínimos de producción (decisión 55); la URL nunca lleva la clave |
| `GEMELO_SESION_SECRETO` | `GEMELO_DEV_SESION_SECRETO` de `.env` (aleatorio) | firma de la cookie; con él las sesiones sobreviven a reiniciar la api |
| `GEMELO_URL_PUBLICA` | `https://localhost:8743` | con ella se arma el enlace del correo; https porque la cookie es `Secure` |
| `GEMELO_API_ORIGENES` | `https://localhost:8743` | el único `Origin` admitido en los POST (CSRF): con `127.0.0.1` en la barra el POST se rechaza; usa `localhost` |
| `GEMELO_API_PROXIES` | `1` | delante solo está el Caddy de dev (en producción, borde + Caddy interno = 2) |
| `GEMELO_CORREO`, `GEMELO_SMTP_HOST`, `_PUERTO`, `_TLS` | `smtp`, `correo`, `1025`, `no` (sin usuario) | hacia Mailpit |
| `GEMELO_OT` | `no` | sin OlivarTrack en local: las fichas salen con el aviso `ot_sin_sincronia` |

### Los roles de la base

Los mismos que en producción (decisión 55), para que un fallo de permisos salga aquí y no en el VPS:

| Rol | Lo usa | Permisos | Clave en `.env` |
|---|---|---|---|
| `gemelo_dueno` | `migra` (migraciones), la siembra y la consola SQL | dueño del esquema (es el `POSTGRES_USER` de la imagen: superusuario, como en producción) | `GEMELO_DEV_PG_CLAVE` |
| `gemelo_api` | la api | solo filas de sus tablas; la auditoría, solo leer y añadir; sin DDL | `GEMELO_DEV_PG_API_CLAVE` |

No hay SQL propio de desarrollo: el rol lo crea **el mismo** [`infra/bd-inicial/01-roles.sh`](../../infra/bd-inicial/01-roles.sh) de producción (montado en `/docker-entrypoint-initdb.d`, corre solo al crear el volumen) y los permisos los da la migración `0001_inicial`. Las claves llegan a la base como secretos de Docker (`/run/secrets/pg_dueno` y `pg_api`, como en producción) tomados de las variables de `.env`. La siembra entra con el dueño porque en producción la carga de hazas y la primera cuenta también van con él ([RUNBOOK-VPS](RUNBOOK-VPS.md), pasos 8 y 9); lo que escribe la api (enlaces, sesiones, auditoría) lo prueba la e2e con `gemelo_api`. La e2e comprueba además que las conexiones de la api son de `gemelo_api` y que a ese rol se le niegan (`42501`) crear tablas o esquemas, cambiar, borrar o vaciar tablas, cambiar o borrar la auditoría y escribir en el registro de migraciones; `dev:estado` mira que no sea superusuario ni dueño de nada.

LiveKit aún no lo usa la api (fase 2): sus claves no se le pasan. Si cambias el código de `apps/api`, `npm run dev:arriba -- --sin-build` reconstruye la imagen (y no la web).

## La siembra (datos sintéticos)

`dev:arriba` acaba con [`infra/dev/herramientas/siembra.mjs`](../../infra/dev/herramientas/siembra.mjs), que se puede repetir (deja siempre lo mismo):

- **Hazas y olivos**: [`tuberia/hazas/desde_fixture.py`](../../tuberia/hazas/desde_fixture.py) parte cada parcela del Hituelo del fixture en dos hazas (`H-D01`…`H-D04`, en coordenadas absolutas EPSG:25830, encima del mundo que pinta el motor) y convierte sus 140 copas en olivos; el SQL idempotente lo escribe `carga_hazas.py`. Se **niega** con un índice que no sea sintético. Necesita Python 3 con `jsonschema` (`pip install -r tuberia/hazas/requirements.txt`). Las hazas salen siempre del fixture, aunque `GEMELO_DEV_TESELAS` apunte a datos reales: entonces no caen encima de ese mundo.
- **Hogares de prueba** (dominio reservado `example.com`), con su haza:

| Correo | Alias | ¿Alias visible? | Haza |
|---|---|---|---|
| `hogar.prueba@example.com` | Abubilla | sí | `H-D01` |
| `vecino.prueba@example.com` | Vecino | no | `H-D02` |
| `mirlo.prueba@example.com` | Mirlo | sí | `H-D03` |
| (ninguno) | | | `H-D04` |

Nada de esto es real (CLAUDE.md regla 4). Los olivos del fixture se cargan con `fuente = lidar`, así que la ficha los cuenta como «medido (LiDAR PNOA 2024)»: es el texto fijo de la api; en local son inventados.

## El recorrido de entrada

### A mano

Con el entorno levantado (`npm run dev:arriba`):

1. Abre **`https://localhost:8743/`** (con `localhost`, no `127.0.0.1`: es el origen que admite la api). El navegador avisa del certificado: es la CA local de Caddy, que no se instala y cambia en cada arranque; acepta el aviso («Avanzado → Continuar»). `http://localhost:8780` te trae aquí. Es la portada provisional; sin sesión es lo único que se ve: `/finca/` te devuelve aquí.
2. Pide el enlace para `hogar.prueba@example.com` con el formulario (responde un JSON con el mismo texto exista o no la cuenta). Por terminal: `curl -k -X POST -H "Origin: https://localhost:8743" -H "Content-Type: application/json" -d "{\"correo\":\"hogar.prueba@example.com\"}" https://localhost:8743/api/auth/enlace`.
3. Abre el buzón de Mailpit en **`http://localhost:8025/`**: llega «Tu enlace para entrar», solo texto. Pulsa el enlace (`https://localhost:8743/api/auth/entrar?t=…`, caduca en 15 min y sirve una vez), en el **mismo navegador**.
4. La página intermedia tiene un botón **Entrar** (el GET no gasta el enlace). Al pulsarlo se crea la cookie `__Host-gemelo` (HttpOnly, Secure, SameSite=Lax) y vas a **`https://localhost:8743/finca/`**: el mundo.
5. Con esa sesión, en la misma pestaña: `https://localhost:8743/api/hazas` (GeoJSON de las cuatro hazas, `es_mia` en la tuya), `https://localhost:8743/api/hazas/<id>` (la ficha; mira la tuya y una ajena: sin titular salvo el alias visible, sin kilos ni personas) y `https://localhost:8743/api/sesion`.

Límite: 3 enlaces por correo cada 15 minutos (y 10 por IP); se reinicia con `docker compose -f infra/dev/compose.yml restart api`.

### La prueba (e2e)

`GEMELO_DOCKER=1 node --test pruebas/guardianes/dev.test.js` hace el recorrido entero sin manos: levanta el entorno; comprueba que http solo da `/salud` y redirige a https; que sin sesión solo responde la portada (`/finca/` → 303 a `/`, teselas y `/api/hazas` → 401, `/api/interno` → 404); que un POST sin `Origin` se rechaza; pide el enlace para el hogar de prueba y para un correo sin cuenta (misma respuesta, y a este no le llega nada); lee el correo en la API de Mailpit; lo abre en Chrome headless y pulsa **Entrar**; comprueba la cookie (HttpOnly, Secure, Lax, invisible para JS); carga el mundo en `/finca/` con 0 errores, sin avisos de la CSP y con las teselas pedidas a `/teselas/`; consulta `/api/sesion`, `/api/hazas` y las fichas de las cuatro hazas (la propia, una ajena con alias oculto, una con alias visible y una sin asignar) contra `contratos/haza.schema.json` y una lista de claves prohibidas (titular, correo, kilos, personas, GPS); que el enlace usado ya no sirve; y que tras salir la cookie no vale. Al final lo baja (si ya estaba levantado, lo deja).

Todo por `https://localhost:8743`, verificando el certificado con la CA local de Caddy. Tiempos de una pasada (2026-10-29, Windows 10 con Docker Desktop 29.6, imágenes base ya descargadas y la capa de `npm ci` de la api en caché; una sola medida, no una media):

| Paso | Tiempo |
|---|---|
| `levanta()`: build de Vite, build de la imagen de la api, `up --wait` (migraciones incluidas) y siembra | 31,8 s |
| Pedir el enlace en la portada → correo en Mailpit | 0,50 s |
| Abrir el enlace y pulsar «Entrar» → `/finca/` | 2,89 s |
| El mundo listo y medido en los tres escenarios (SwiftShader: vale para recuentos, no para fps) | 28,1 s |
| Con sesión: web, teselas, `/api/sesion`, `/api/hazas` y 4 fichas | 0,61 s |
| Bajarlo (`docker compose down`) | 3,6 s |
| La prueba entera (`dev.test.js`, 8 pruebas) | 89,4 s |

La primera vez tarda más: descargar las imágenes y construir la de la api desde cero (en esta máquina, una pasada que tuvo que reconstruir la imagen de la api tras cambiar su código tardó 97 s en `levanta()`).

### Qué falta para la pantalla de entrada

La parte de servidor del recorrido está entera; lo que falta es de la UX ([UX.md](../sistema/UX.md) §3 y §4.1–4.4) y va con ella:

- **La portada de verdad** (§4.1) en lugar de `infra/dev/portada/` (que es un formulario sin estilos y enseña el JSON de la api al pedir el enlace). Hace falta saber qué carpeta la produce (¿`apps/web` construye también la portada, o una app aparte?) y dónde se monta (`/srv/portada` en producción).
- **«Revisa tu correo»** (§4.3) y los textos de error de la api (`correo_no_valido`, límite, enlace caducado o usado) en pantallas, no en JSON.
- **El primer acceso** (normas, alias, avatar: §3) tras el enlace: hoy `POST /api/auth/entrar` lleva directo a `/finca/`.
- **«Seguir a la finca»** en la portada con sesión viva (§4.1, estados), que pediría `GET /api/sesion` desde la portada.
- **Vincular las Quest** con otro dispositivo (§4.2): no hay ruta en la api.
- ✅ **La política de referente de producción** (decisión 53, 2026-10-29): `infra/Caddyfile` pasa a `strict-origin-when-cross-origin`, como el de dev; un formulario POST de la portada manda su origen. Las páginas del enlace llevan además su propia `<meta name="referrer" content="strict-origin">`.
- El mundo **no sabe todavía** que hay sesión ni hazas: no pinta las lindes de `/api/hazas` ni abre la ficha (es trabajo de `apps/web`, fuera de este cambio).

## Problemas conocidos

- **Un volumen de base de otra copia del repo no acepta tu clave.** Postgres fija la clave al crear el volumen (`gemelo-dev_pg_datos`); si lo creó otra copia del repo (otra carpeta con su propio `infra/dev/.env`), `dev:arriba` falla con «la base no acepta las claves de infra/dev/.env». Es de desarrollo: `npm run dev:abajo -- --borra-datos` y vuelve a levantar, o usa un proyecto aparte con `COMPOSE_PROJECT_NAME=<otro>` (cambia el nombre de los contenedores y del volumen; los puertos siguen siendo los mismos, así que no a la vez).
- **Un volumen de antes de la decisión 55 no tiene los roles de producción** (tenía el dueño `gemelo`, sin `gemelo_dueno` ni `gemelo_api`; `01-roles.sh` solo corre al crear el volumen). `dev:arriba` lo detecta antes de migrar y lo dice: `npm run dev:abajo -- --borra-datos` y vuelve a levantar. Un `.env` de antes sirve: se le **añade** `GEMELO_DEV_PG_API_CLAVE` y `GEMELO_DEV_PG_CLAVE` pasa a ser la del dueño.
- **PostGIS lo crea la migración, no la imagen** (igual que en producción): `infra/bd-inicial/` ocupa `/docker-entrypoint-initdb.d` y tapa el `10_postgis.sh` de la imagen, así que es la `0001` (`CREATE EXTENSION postgis`) la que lo instala. Con el disco lento eso pasó de los 15 s de tope por sentencia de la api (2026-10-29, en esta máquina); por eso `migra` corre con un tope de 10 min (`apps/api/src/bd/migra-cli.ts`). Lo destapó este cambio: antes, en local, PostGIS ya venía de la imagen y la migración no lo creaba.
- **`Referrer-Policy: no-referrer` rompe los formularios POST**: con ella Chrome manda `Origin: null` en el POST de un formulario (no en un `fetch` del mismo origen; comprobado el 2026-10-29 con Chrome headless) y la api lo rechaza con 403. Lo destapó esta e2e en el botón «Entrar» de la página del enlace: la api ahora usa `strict-origin` (manda el origen, nunca la ruta ni el `?t=`). Desde la decisión 53, el Caddy de **producción** (`infra/Caddyfile`) usa también `strict-origin-when-cross-origin`.
- **Por http no hay sesión.** La cookie es `Secure` y `__Host-`: la api no la emite si la petición no llega por https (`@fastify/session` mira `X-Forwarded-Proto`) y, aunque la emita, Chrome no la guarda desde `http://localhost` (comprobado el 2026-10-29 con Chrome 131 headless: el botón «Entrar» llevaba a `/finca/` sin cookie y de vuelta a la portada). Por eso el http de dev solo da `/salud` y redirige lo demás a `https://localhost:8743`.
- **`fetch` de Node no deja poner `Sec-Fetch-Mode`**: para comprobar la redirección de una navegación sin sesión, `estado.mjs` y la e2e usan `node:http` (`getHttp` de `_comun.mjs`).
- **La CSP es Report-Only y deja pasar las fuentes de Google** (`fonts.googleapis.com`, `fonts.gstatic.com`), porque `apps/web/plantilla.html` las pide. Producción debería servirlas desde el propio origen y endurecer la CSP. `style-src` lleva `'unsafe-inline'` porque el motor escribe `style="…"` en el HTML de los paneles. La e2e comprueba que Chrome no avisa de **ninguna** violación con la CSP actual.
- **Sin favicon**: `apps/web` no trae icono; Caddy responde 204 a `/favicon.ico` para no ensuciar la consola (como el servidor de pruebas de los guardianes). Se quita cuando la web tenga su icono.
- **La CA local se pierde al parar** (tmpfs): el navegador avisa del certificado en cada arranque. Es a propósito (no se instala nada en tu sistema). Las herramientas (`estado.mjs`, la e2e) leen la CA del contenedor (`caLocal()` de `_comun.mjs`) y **verifican** el certificado; Chrome headless lo acepta con `ignoreHTTPSErrors`.
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
| TLS | `tls internal`, CA local no instalada, sin HSTS; http solo para `/salud` | certificado público del borde, HSTS |
| CSP | Report-Only, con las fuentes de Google | aplicada (a decidir con la api y las fuentes propias) |
| Claves | aleatorias por equipo en `infra/dev/.env` | secretos del VPS, fuera del repo |
| LiveKit | `--dev` (se quita con `GEMELO_DEV_LIVEKIT_ARGS`), un solo UDP en 127.0.0.1, sin TURN | puertos UDP/TCP abiertos con `ufw`, TURN, IP pública |
| Correo | Mailpit (no sale nada), SMTP sin TLS ni usuario | SMTP de OVH (decisión 15), TLS y usuario obligatorios |
| Api | `NODE_ENV=development`, secretos en variables de entorno, un solo proxy delante (`GEMELO_API_PROXIES=1`), sin OlivarTrack | `production`: secretos solo por fichero (`/run/secrets`), borde + Caddy interno (2), MCP de OlivarTrack |
| Usuario de la base | **igual**: `gemelo_dueno` para `migra` y `gemelo_api` (solo filas; la auditoría, solo añadir) para la api, creados por el mismo `infra/bd-inicial/` (decisión 55) | `gemelo_dueno` para `migra` y `gemelo_api` para la api |
| Portada | provisional (`infra/dev/portada/`), con un formulario sin estilos | la de la UX (pendiente) |
| Datos | fixture sintético o una carpeta local | teselas del servidor (formato v3, ADR propio de la fase 1a) |
| Copias y registros | ninguna; registros locales con rotación | copias nocturnas y restauración ensayada |
| Imágenes | oficiales, versión estable + digest; la de la api se construye aquí (`gemelo-api:local`) sobre la base del contrato | las mismas bases con su digest; las propias (web, api) construidas en CI, despliegue con aprobación manual |
