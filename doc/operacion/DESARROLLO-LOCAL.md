# Desarrollo local con Docker

El mundo, la api y los servicios base de la fase 1a y la fase 2 corriendo en tu equipo, con un solo comando y siempre igual (decisión 21: nada va al VPS hasta que funcione y esté probado aquí). Todo vive en [`infra/dev/`](../../infra/dev/compose.yml) y lo comprueba `pruebas/guardianes/dev.test.js`. **No es producción**: lo que cambia está en [Qué NO es producción](#qué-no-es-producción).

## Requisitos

- Docker con Compose v2 (probado con Docker 29.6 y Compose v5 en Windows 10 con Docker Desktop). Unas imágenes de ≈ 1 GB la primera vez (PostGIS 733 MB, LiveKit 132 MB, Caddy 93 MB, Mailpit 51 MB).
- Lo de la puerta ([ONBOARDING](ONBOARDING.md)): Node ≥ 24, Python 3 (para generar el fixture) y `cd apps/web && npm i`. `levanta.mjs` hace `npm ci` en `apps/web`, `apps/web/olivo` y `infra/dev/herramientas` si falta `node_modules` **o si su `package-lock.json` ya no corresponde a lo instalado** (p. ej. tras añadir una dependencia; compara con el lock oculto de npm y deja el sello `node_modules/.gemelo-lock-sello`).
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

`dev:arriba` hace, en orden: crea `infra/dev/.env` con **claves aleatorias** si no existe (git lo ignora; nunca se sobrescribe); genera el fixture sintético si falta (`pruebas/salida/fixture/`); copia el `indice.json` de la finca con `base: "/teselas/<finca>/"` (campo del contrato) y construye la web con Vite contra él (`npm run build` de `apps/web` con `GEMELO_DATOS`) y la portada (`npm run build:portada`, de `apps/web/portada/` a `apps/web/dist-portada/`); deja junto a cada fichero de `apps/web/dist/` y `dist-portada/` su `.br` y su `.gz`; arranca la base y comprueba que tiene los [roles de producción](#los-roles-de-la-base); hace `docker compose up -d --build --wait`, que construye la imagen de la api (`apps/api/Dockerfile`; con la caché de Docker, rápido si no cambió nada), aplica las migraciones (servicio `migra`) y espera a los healthchecks; y **siembra** las hazas, los olivos y los hogares de prueba sintéticos ([La siembra](#la-siembra-datos-sintéticos)). Si `.env` es de antes y le falta una clave nueva de la plantilla (como `GEMELO_DEV_SESION_SECRETO`), la **añade** sin tocar las demás. Tiempos medidos: ver [El recorrido de entrada](#el-recorrido-de-entrada).

## Servicios y puertos

Todos los puertos se publican **solo en 127.0.0.1** (el guardián lo vigila). Se cambian en `infra/dev/.env`. La única excepción es el interruptor `--red-local`, que abre el https de la web y los medios de LiveKit (7881/tcp, 7882/udp) en la IP de la red local ([Prueba en aparatos](#prueba-en-aparatos)).

Las imágenes van fijadas por **versión estable y digest** (`imagen:versión@sha256:…`); el digest completo está en el compose. Versiones comprobadas el 2026-10-28 en Docker Hub y en las releases oficiales: cada una es la última estable publicada, sin rc, beta ni dev.

| Servicio | Imagen (versión fija + digest) | Puerto del anfitrión | Para qué |
|---|---|---|---|
| `web` | `caddy:2.11.7-alpine@sha256:eb4d35b7…` (oficial; 2.11.7 es la última release estable de Caddy, 2026-10-03) | `https://localhost:8743` (y `http://localhost:8780`, que solo da `/salud` y redirige lo demás a https) | portada y entrada (`apps/web/dist-portada` en `/`), mundo (`apps/web/dist` en `/finca/`), teselas en `/teselas/<finca>/…` y la api en `/api/` |
| `db` | `postgis/postgis:18-3.6-alpine@sha256:c53a483f…` (la del proyecto PostGIS; PostgreSQL 18 es la estable vigente, la 19 va por rc1; PostGIS 3.6, la 3.7 va por rc3) | `127.0.0.1:55432` | PostgreSQL 18 + PostGIS 3.6; base `gemelo` con los roles de producción (`gemelo_dueno` y `gemelo_api`, [abajo](#los-roles-de-la-base)), claves en `.env`; volumen `gemelo-dev_pg_datos` |
| `livekit` | `livekit/livekit-server:v1.13.11@sha256:25cd902d…` (oficial; última release estable, 2026-10-25) | el navegador entra por Caddy en `wss://localhost:8743/rtc`; `ws://localhost:7880` (herramientas), TCP 7881, UDP 7882 | tiempo real (fase 2), claves de `.env`; `--dev` solo en local ([Presencia](#presencia-compartida-en-local-p4)) |
| `correo` | `axllent/mailpit:v1.32.0@sha256:0790692b…` (oficial, basada en Alpine; última release estable, 2026-10-22) | `http://localhost:8025` (buzón), SMTP `127.0.0.1:1025` | recibe el correo del enlace mágico; no envía nada fuera |
| `migra` | `gemelo-api:local`, construida aquí de `apps/api/Dockerfile` (base `node:24.22.1-alpine3.24@sha256:06d7adf3…`, la del contrato `contratos/publicacion-vps.json`) | ninguno | aplica `apps/api/migraciones/` y termina (salida 0); la api espera a que acabe |
| `api` | la misma `gemelo-api:local` | ninguno: se entra por Caddy en `/api/` | el servidor de la fase 1a (enlace mágico, sesión, hazas); escucha en 8000 dentro de la red `interna` |
| `hornero` | `gemelo-hornero:local`, construida aquí de `tuberia/olivos/Dockerfile` (la misma base `node:24.22.1-alpine3.24@sha256:06d7adf3…` que la api) | ninguno | hornea las variantes de olivos de la finca servida (ADR-0018; [§ El hornero](#el-hornero-o7f)) |

Lo que lleva cada uno:

- **Todos**: `restart: unless-stopped`, límite de memoria (web 128 MB, db 512 MB, LiveKit 256 MB, correo 128 MB), red propia `interna`, `no-new-privileges`, registros con rotación. Caddy, LiveKit y Mailpit corren como uid 1000, con el sistema de ficheros de solo lectura y sin capacidades (Caddy conserva `NET_BIND_SERVICE`: su binario la lleva y sin ella no arranca). Postgres arranca como root y su entrada baja a `postgres` (uid 999), como en la imagen oficial.
- **Caddy** ([`infra/dev/Caddyfile`](../../infra/dev/Caddyfile)): **la misma forma que producción** ([`infra/Caddyfile`](../../infra/Caddyfile)): la portada pública y las pantallas de entrada en `/` ([`apps/web/portada/`](../../apps/web/portada/index.html), construida en `apps/web/dist-portada/`; `assets/` inmutable y precomprimida, como el mundo), el mundo en `/finca/` y las teselas en `/teselas/` **solo con sesión** (`forward_auth` a `/api/interno/autoriza`: sin sesión, una navegación va a la portada con 303 y una carga recibe 401; decisión 16), la api en `/api/` y `/api/interno/*` cerrada desde fuera (404). Además: `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, COOP/CORP `same-origin`, `Permissions-Policy` (WebXR, micrófono, cámara y geolocalización solo para el propio origen), sin cabecera `Server`; **CSP en Report-Only**; `assets/` con `immutable` de un año y la página con `no-cache`; las teselas con `private, max-age=300`; compresión zstd/gzip al vuelo y brotli **precomprimido** (la imagen oficial de Caddy no trae brotli dinámico); los errores sin caché. HTTPS con `tls internal` (una CA local que se crea en cada arranque y **no** se instala en el sistema).
- **LiveKit** ([`infra/dev/livekit.yaml`](../../infra/dev/livekit.yaml)): un solo puerto UDP multiplexado (7882); el candidato ICE que anuncia llega por `NODE_IP` (127.0.0.1; con `--red-local`, la IP de la red), no por el fichero. La señalización del navegador va por Caddy (`/rtc`, el mismo origen que la página, como en producción); la api da al navegador la ruta `/rtc` y el cliente la resuelve contra su página. `--dev` solo sube el registro a depuración: las claves son siempre las aleatorias de `.env` (comprobado: el par conocido `devkey/secret` se **rechaza**). Para arrancarlo como en producción, sin `--dev`: `GEMELO_DEV_LIVEKIT_ARGS="--config /etc/livekit.yaml"` en `.env`.

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

- **El https de Caddy** (`https://<IP>:8743`) escucha además en la IP de la red local del equipo, y desde P4 también **los dos puertos de medios de LiveKit** (7882/udp y 7881/tcp; LiveKit anuncia esa IP como candidato ICE con `NODE_IP`): sin ellos el aparato entra en la sala pero no le llega ni sale la pose ni el chat, que viajan por WebRTC y no por la señalización. La señalización (7880) **no** se abre: va por el https de Caddy (`wss://<IP>:8743/rtc`). El http (8780), la base, Mailpit y la api siguen en 127.0.0.1 o sin puerto (comprobado por TCP desde la IP de la red antes de P4: 8780, 55432, 7880, 8025 y 1025, cerrados).
- La IP sale de `GEMELO_DEV_IP` o se detecta: la primera IPv4 privada (RFC 1918) de una interfaz física, primero la WiFi; se saltan las virtuales (Docker, WSL, Hyper-V, VirtualBox, VMware, VPN) y la red 192.168.56.x que VirtualBox crea por defecto con un nombre que no la delata. Si hay varias, `dev:arriba` las enseña; una IP que no sea privada se rechaza.
- Caddy emite con su CA local un certificado **también para la IP** (y `default_sni` la elige, porque a una IP el navegador no le manda SNI). El aparato avisa del certificado y se acepta (decisión 54).
- La api arma el enlace del correo con `https://<IP>:8743` y admite los POST de los dos orígenes (`localhost` y la IP).
- `dev:estado` falla si algo **que no sea** el https de la web o los medios de LiveKit está publicado fuera de 127.0.0.1. La e2e comprueba que, sin el interruptor, Docker no publica nada fuera de 127.0.0.1; y el guardián, con `docker compose config`, que sin el interruptor nada sale de 127.0.0.1 (aunque `GEMELO_DEV_IP` esté puesta) y con él solo el https de la web y 7881/tcp y 7882/udp de LiveKit.

**Las Quest: código corto** (decisiones 46 y 61; [contratos/sesion.md](../../contratos/sesion.md#código-corto-vincular-unas-gafas)). En el navegador de las gafas, abre `https://<IP>:8743/`, acepta el aviso del certificado, **Entrar → Vincular unas gafas con un código**: las gafas enseñan un código como `K7Q-4M2` (5 min, un solo uso). En el ordenador o el móvil, con sesión: **Mis dispositivos → Vincular unas gafas**, teclea el código y **Aprobar**; en unos 3 s las gafas tienen su propia sesión y el botón «Seguir a la finca». Si caduca, las gafas piden otro solas (hasta 3 veces). Comprobado desde el propio equipo contra la IP de la WiFi ([Lo no probado](#lo-no-probado)); **no con unas Quest reales**.

**El enlace mágico en el aparato.** Mailpit sigue solo en el ordenador. El camino más sencillo, sin código nuevo: pide el enlace desde el aparato (o desde el ordenador) en la portada; en el ordenador, abre el correo en `http://localhost:8025` y pulsa el enlace (lleva la IP de la red; **abrirlo no lo gasta**: es la página intermedia con el botón «Entrar»); en esa página, «Crear código QR» de Chrome (menú de compartir) y léelo con el móvil; pulsa «Entrar» **en el aparato** (la cookie es de cada navegador). En las Quest, mejor el código corto de arriba.

**Por USB (Quest, sin abrir nada a la red):** `adb reverse tcp:8743 tcp:8743` (y `tcp:8025` para ver Mailpit en el casco) y abrir `https://localhost:8743` en el navegador del casco, aceptando el aviso del certificado. Por http no hay sesión (la cookie es `Secure`).

### Presencia compartida en local (P4)

**En este equipo, a mano.** `npm run dev:arriba`, entra con un hogar de prueba (portada → enlace → buzón) y abre `https://localhost:8743/finca/?presencia=red`. Para verte con otro, abre otra ventana **de incógnito** (otro tarro de cookies) y entra con otro hogar (`vecino.prueba@example.com`) **o con el mismo**: desde P4 cada sesión (aparato) tiene su propia identidad en la sala, así que el mismo hogar puede estar a la vez en el ordenador, el móvil y las gafas sin echarse (dos pestañas de la **misma** sesión sí se sustituyen). Pulsa «Pasear por el olivar» en las dos: en órbita no se publica la pose y el otro te ve «en vista aérea» (decisión 60). El panel Gente (abajo a la derecha) tiene el chat. Para expulsar, la oficina: `POST /api/admin/presencia/expulsar {"hogar_id": …}` con una sesión de rol `admin` (en local no hay ninguna sembrada: crea una con `INSERT INTO hogares (correo, rol) VALUES ('oficina.prueba@example.com', 'admin')` como `gemelo_dueno`).

**Cómo llega el navegador a LiveKit.** La api da `url: "/rtc"` (la ruta del mismo origen) y el motor la resuelve contra su página: `wss://localhost:8743/rtc` (o `wss://<IP>:8743/rtc` con `--red-local`), que Caddy pasa a LiveKit. Así la CSP queda en `connect-src 'self'` (como en producción) y no hace falta abrir 7880. La pose y el chat **no** van por esa conexión sino por WebRTC (UDP 7882, o TCP 7881 si se corta el UDP), directos a LiveKit. Comprobado en Chrome headless que también abre `ws://localhost:7880` desde `https://localhost:8743` (localhost es origen seguro), pero eso no vale desde otro aparato.

**Con ordenador, móvil y Quest a la vez (`--red-local`).** `npm run dev:arriba -- --red-local` abre en la IP de la WiFi el https de Caddy **y** los medios de LiveKit (7882/udp y 7881/tcp; LiveKit anuncia esa IP con `NODE_IP`). Nada más: ni 7880, ni la base, ni Mailpit. En cada aparato: `https://<IP>:8743/`, aceptar el aviso del certificado, entrar (las Quest con el código corto) y abrir `/finca/?presencia=red`. El ordenador, mejor también por `https://<IP>:8743` (es la dirección que trae el enlace del correo); por `https://localhost:8743` también funciona. Al acabar, `npm run dev:abajo` (o levantar sin `--red-local`). **Sin probar:** ningún aparato real ha entrado aún en la sala por la WiFi; que el cortafuegos de Windows deje pasar el UDP 7882 y el TCP 7881 que publica Docker Desktop **[NO PROBADO]** (si el aparato entra en la sala y en Gente sale «conectado» pero no llega la pose, es lo primero que mirar: regla de entrada para esos puertos solo en la red privada); que LiveKit anuncie la IP de la WiFi sí está comprobado (con la IP de documentación 192.0.2.10 en un contenedor suelto, en su registro de arranque: `nodeIP`), y también que con `node_ip` en `livekit.yaml` el fichero manda sobre `NODE_IP` y sobre `--node-ip`: por eso `livekit.yaml` ya no lo lleva.

**La prueba (e2e).** `GEMELO_DOCKER=1 node --test pruebas/guardianes/presencia_dev.test.js` (pide el turno del banco; con `COMPOSE_PROJECT_NAME=gemelo-dev-p4` usa su propio proyecto y volumen). Levanta el entorno, entra con tres hogares de prueba y una oficina sintética por el camino de verdad (enlace → Mailpit → `POST /api/auth/entrar`) y comprueba en Chrome headless: transporte con p95 < 250 ms (dos páginas ligeras), el motor con dos hogares (vista aérea, avatares, chat), el mismo hogar en dos sesiones, la expulsión de sus dos conexiones, sin bandera y `?presencia=sim`; contra LiveKit, los permisos del token y `RemoveParticipant` de quien no está; y la carga con 40 clientes en Node (`@livekit/rtc-node`, 4 procesos). Cifras en [MEDIDAS](../sistema/MEDIDAS.md#presencia-con-livekit-real-p4-2026-10-29). Unos 5 min con el entorno ya construido.

### Hituelo real en local

`GEMELO_DEV_TESELAS` (la carpeta de datos, **fuera del repo**, con `hituelo/indice.json` y `hituelo/t/`) y `GEMELO_DEV_FINCA=hituelo`, en el entorno o en `infra/dev/.env` (ignorado); ver [Datos reales sin versionarlos](#datos-reales-sin-versionarlos). Sin `--sin-build`, porque la web lleva el índice dentro. Se puede juntar con el interruptor. Las salidas de referencia de una sola finca (`hituelo-v3`) se sirven mejor con las variables de la sección siguiente. Con cualquier finca que no sea el fixture, las hazas pasan a ser las **de prueba** ([abajo](#hazas-de-prueba-sobre-la-finca-real)).

### Prueba en aparatos con Hituelo v3

Para la prueba de Antonio (decisión 57: navegador, móvil y Quest, cada uno por su cuenta): Hituelo v3 en `/teselas/hituelo/`, su tileset 3D Tiles 0.3.0 en `/teselas/hituelo/tileset/`, la web construida **con el constructor de olivos** (`?olivos=gen`) y con 3DTilesRendererJS (`?escena=tiles`), y unas hazas de prueba para ver lindes.

**Variables** (en el entorno o en `infra/dev/.env`; nunca rutas en el repo; las dos carpetas van **fuera** del repo o en `pruebas/salida/`, y `levanta.mjs` se niega si no):

| Variable | Qué es |
|---|---|
| `GEMELO_DEV_FINCA_CARPETA` | la carpeta de **una** finca con `indice.json` y `t/` directamente dentro (la salida de referencia `hituelo-v3`); se monta de solo lectura y se sirve en `/teselas/<GEMELO_DEV_FINCA>/` |
| `GEMELO_DEV_TILESET` | la carpeta del tileset (con `tileset.json` directamente dentro); se sirve en `/teselas/<GEMELO_DEV_FINCA>/tileset/` |
| `GEMELO_DEV_OLIVOS` | la carpeta `olivos/` que escribe el hornero (`<salida>/<finca>/olivos/`, con `manifiesto.json`, `t/` y los `<huella>.br` directamente dentro); se sirve en `/teselas/<GEMELO_DEV_FINCA>/olivos/` (objetos `<huella de 32 hex>.br` con `Content-Encoding: br` e `immutable`; `manifiesto.json` con `no-cache`; el resto de la carpeta, p. ej. `estado.json`, 404). Sin ella, esa ruta da 404 |
| `GEMELO_DEV_PUERTO_LIVEKIT_TCP` / `_UDP` | 7881 / 7882; solo para levantar un **segundo** entorno a la vez (con otro `COMPOSE_PROJECT_NAME` y los demás `GEMELO_DEV_PUERTO_*`): el audio de ese segundo no vale |
| `GEMELO_DEV_FINCA` | `hituelo` (el valor por defecto) |
| `GEMELO_DEV_IP` | solo si la IP detectada no es la de la WiFi (con `--red-local`) |

**El tileset** (no está en el repo; sale de la salida de referencia con el generador 0.3.0, [TILES3D](../sistema/TILES3D.md#cómo-regenerar)):

```
cd tuberia/tiles3d && npm i                                        # una vez
GEMELO_DATOS=<carpeta hituelo-v3>/indice.json node tuberia/tiles3d/genera.mjs --salida pruebas/salida/tiles3d-hituelo-v3-030
```

(`GEMELO_DATOS` es la variable del generador; `pruebas/salida/` está ignorada por git. Una pasada dio 5859 olivos y 39 MB; el tiempo de generación no está medido aquí.)

**La orden** (PowerShell; en Git Bash, `export VAR=…` antes):

```
$env:GEMELO_DEV_FINCA_CARPETA = "<ruta a hituelo-v3>"
$env:GEMELO_DEV_TILESET       = "<ruta a tiles3d-hituelo-v3-030>"
npm run dev:arriba -- --red-local
```

La primera vez, `levanta.mjs` hace `npm ci` en `apps/web` (incluye 3DTilesRendererJS) y en `apps/web/olivo` (`--omit=dev`: solo `three-gen`, el `three` 0.128 del constructor) si faltan, y lo dice en el paso «build de la web» (`con constructor de olivos`, `con 3DTilesRendererJS`). Sin ellos Vite pondría sustitutos vacíos y `?olivos=gen` / `?escena=tiles` no harían nada. Al acabar: `npm run dev:abajo`.

**URL** (`https://localhost:8743` en el ordenador, `https://<IP>:8743` en los aparatos; hace falta sesión):

| Para ver… | URL |
|---|---|
| el mundo de siempre | `/finca/` |
| con los olivos generados | `/finca/?olivos=gen` |
| con la escena 3D Tiles | `/finca/?olivos=gen&escena=tiles` |
| con fps, ms de JS, llamadas y triángulos | añadir `&debug` |

**Entrar desde el móvil**: pide el enlace en la portada del ordenador, ábrelo en el ordenador desde Mailpit (`http://localhost:8025`; abrirlo no lo gasta), «Crear código QR» en Chrome, escanéalo con el móvil y pulsa «Entrar» **en el móvil** (detalle en [El interruptor de red local](#el-interruptor-de-red-local)). **Desde las Quest**: abre `https://<IP>:8743/`, acepta el aviso del certificado, **Entrar → Vincular unas gafas con un código**; en el ordenador o el móvil con sesión, **Mis dispositivos** → teclea el código → **Aprobar** (las gafas entran solas en unos 3 s). Luego `/finca/?olivos=gen&escena=tiles` y el botón de VR.

#### Hazas de prueba sobre la finca real

La siembra normal pone hazas sobre el Hituelo sintético del fixture, que no caen sobre el real. Si la finca servida **no** es el fixture, `siembra.mjs` usa [`tuberia/hazas/de_prueba.py`](../../tuberia/hazas/de_prueba.py): 4 rectángulos de 90 × 60 m **inventados**, centrados en copas del índice servido (puntos fijos del reparto de las copas, siempre los mismos), con los códigos `H-D01`…`H-D04` para que casen con los hogares de prueba. Nombres «(de prueba, inventada)», `"sintetico": true`, sin recuentos declarados, sin NDVI y **sin olivos** (la siembra borra los de la base: los del fixture no pintan nada sobre otra finca). No son las hazas de la oficina (decisión 12) ni nada de la explotación; del índice solo se usa dónde hay copas. Quitar las variables y volver a `npm run dev:arriba` devuelve las del fixture.

#### Lo no probado con Hituelo v3

- **Los aparatos reales**, como abajo: ni el móvil ni las Quest han abierto esta combinación. `?olivos=gen` y `?escena=tiles` sobre Hituelo v3 en un navegador de verdad (fps, memoria, calidad del olivo) están **sin medir**; lo que hay son recuentos en Chrome headless con SwiftShader, que no da fps.
- El tiempo de carga del tileset (39 MB) por la WiFi hacia un móvil o las Quest, y el peso del ordenador con Docker y la generación de olivos a la vez.
- Que las hazas de prueba caigan sobre olivar y no sobre un claro: se centran en una copa medida, pero no se han mirado a ojo en el mundo.

### Lo no probado

- **Ningún aparato real**: ni otro equipo, ni un Android, ni el iPhone, ni las Quest han abierto `https://<IP>:8743`. Lo probado (2026-10-29, Windows 10 con Docker Desktop) es desde el propio equipo contra su IP de la WiFi: certificado verificado con la CA local (SAN = la IP), pedir el enlace con `Origin` de la IP (202), el enlace del correo con la IP, la página intermedia (200), «Entrar» (303 a `/finca/` con la cookie) y `/finca/` con esa sesión (200).
- El cortafuegos de Windows (o el del router) puede bloquear la entrada desde otro aparato: no comprobado. Si pasa, Windows suele preguntar al abrir el puerto la primera vez.
- WebXR en las Quest con un certificado aceptado a mano (no instalado): no comprobado.
- El código corto en unas Quest reales (leerlo en el casco, el teclado del navegador de Meta, el sondeo con la pantalla en reposo): no probado; solo con Chrome headless y el agente de usuario del navegador de Meta, y por la IP de la WiFi desde el propio equipo.
- El QR de Chrome y el camino por USB con este entorno: no probados.

## El hornero (O7f)

`npm run dev:arriba` lo levanta con el resto. Hornea las variantes E2/E2-VR de la finca servida (`GEMELO_DEV_FINCA`; con `GEMELO_DEV_FINCA_CARPETA` hornea esa finca: su `indice.json` se monta de solo lectura en `/datos/<finca>`) en la carpeta que Caddy sirve como `/teselas/<finca>/olivos/`: `GEMELO_DEV_OLIVOS` o, si no se da, `pruebas/salida/olivos-dev/<finca>/` (la crea `levanta.mjs`; en Linux, con permiso de escritura para el uid 1000). Así `/finca/?olivos=gen` encuentra el manifiesto en `<D.base>olivos/manifiesto.json` sin hacer nada más. Su `estado.json`, su candado y su latido viven en un volumen propio (`hornero_estado`), **fuera** de la carpeta servida: Caddy no puede servirlos.

**Política (no hay vuelta diaria):** una vuelta al arrancar —idempotente: con todo al día tarda ~1 s y no escribe nada— y después duerme hasta el **próximo cambio del par época actual/siguiente** (calendario `contratos/epocas-calendario.json`), ese día a las 03:00 UTC (`GEMELO_DEV_HORNERO_HORA`). Mientras duerme, cada 10 min (`GEMELO_DEV_HORNERO_COMPRUEBA_S`) mira sellos baratos —fecha y tamaño del índice de la finca, huella del calendario, `GEN_VERSION`/`CACHE_VERSION`/formato frente al manifiesto— y solo si alguno cambió lanza una vuelta. Un candado por finca (`proper-lockfile`, en el volumen de estado) impide dos hornos a la vez; un fallo se reintenta a los 5 min. Para forzar una vuelta: `docker compose -f infra/dev/compose.yml restart hornero`.

**Salud:** el healthcheck de Docker ejecuta `tuberia/olivos/salud.mjs`: sano si la última vuelta terminó en `listo` (el estado dice «durmiendo hasta <fecha>») o hay una en curso que se movió hace menos de 15 min; enfermo si acabó en `error`, está atascada o el servicio dejó de latir. `npm run dev:estado` lo enseña (fase, hechas/total, época). **Seguridad:** sin puertos, usuario 1000, sistema de ficheros de solo lectura salvo su salida y su estado, sin capacidades, 512 MB. Medido en esta máquina: la primera vuelta con el fixture y los tiempos de la e2e, en la sección de la e2e.

## Los avatares VRM (P7b)

Caddy sirve el catálogo de avatares tras sesión en `/avatares/catalogo.json` y `/avatares/<id>.vrm` ([contratos/avatares.md](../../contratos/avatares.md), ADR-0020) desde la carpeta `GEMELO_AVATARES` (fuera del repo; por defecto `pruebas/salida/avatares/`, que `levanta.mjs` crea vacía: sin catálogo, `/avatares/catalogo.json` da 404). Los `.vrm` no se versionan. Para tener los 4 CC0 provisionales (decisión 74) en local:

```
export GEMELO_AVATARES_ORIGEN=<carpeta fuera del repo>     # los VRM tal como se bajan
export GEMELO_AVATARES=<otra carpeta fuera del repo>       # la salida, la que sirve Caddy
node tuberia/avatares/descarga.mjs                         # de fuentes.json; se niega si el sha256 o el meta no son los verificados
node tuberia/avatares/construye.mjs                        # lee el meta (rechaza lo que no vale), optimiza y escribe <id>.vrm + catalogo.json
npm run dev:arriba                                         # (o ya levantado: se ven al momento, la carpeta se monta de solo lectura)
```

La primera vez, `cd tuberia/avatares && npm ci` (`@gltf-transform` 4.5.1, `meshoptimizer`, `sharp`). Con sesión, `https://localhost:8743/avatares/catalogo.json` devuelve el catálogo (`no-cache`); sin ella, 401. Cada `.vrm` se pide con `?v=<sha256>` y sale `immutable`. Si cambias la carpeta de `GEMELO_AVATARES` con el entorno levantado, vuelve a hacer `npm run dev:arriba` (Compose la monta al crear el contenedor). La salida de la tubería incluye, junto a cada `.vrm`, sus `.br`, `.zst` y `.gz`, que Caddy usa para comprimir. **No probado** en este entorno: levantar Docker con los avatares y ver las cabeceras reales (solo el texto de los Caddyfile, `dev.test.js`).

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

1. Abre **`https://localhost:8743/`** (con `localhost`, no `127.0.0.1`: es el origen que admite la api). El navegador avisa del certificado: es la CA local de Caddy, que no se instala y cambia en cada arranque; acepta el aviso («Avanzado → Continuar»). `http://localhost:8780` te trae aquí. Es la portada ([UX.md](../sistema/UX.md) §4.1); sin sesión es lo único que se ve: `/finca/` te devuelve aquí.
2. **Entrar** y pide el enlace para `hogar.prueba@example.com` (pasa a «Revisa tu correo»; la respuesta es la misma exista o no la cuenta). Por terminal: `curl -k -X POST -H "Origin: https://localhost:8743" -H "Content-Type: application/json" -d "{\"correo\":\"hogar.prueba@example.com\"}" https://localhost:8743/api/auth/enlace`.
3. Abre el buzón de Mailpit en **`http://localhost:8025/`**: llega «Tu enlace para entrar», solo texto. Pulsa el enlace (`https://localhost:8743/api/auth/entrar?t=…`, caduca en 15 min y sirve una vez), en el **mismo navegador**.
4. La página intermedia tiene un botón **Entrar** (el GET no gasta el enlace). Al pulsarlo se crea la cookie `__Host-gemelo` (HttpOnly, Secure, SameSite=Lax). La primera vez vas al **primer acceso** (`/#bienvenida`: normas, alias y avatar); al acabar, **Seguir a la finca** lleva a **`https://localhost:8743/finca/`**: el mundo. Las siguientes veces, el enlace lleva directo al mundo. Para repetir el primer acceso: `UPDATE hogares SET normas_version = NULL, normas_aceptadas_en = NULL WHERE correo = '…'` en la consola SQL.
4b. **Unas gafas** (o una ventana de incógnito, que hace de aparato sin sesión): `https://localhost:8743/#vincular` enseña un código; en la pestaña con sesión, **Mis dispositivos** (`/#dispositivos`), tecléalo y **Aprobar**. La ventana de las gafas entra sola en unos 3 s.
5. Con esa sesión, en la misma pestaña: `https://localhost:8743/api/hazas` (GeoJSON de las cuatro hazas, `es_mia` en la tuya), `https://localhost:8743/api/hazas/<id>` (la ficha; mira la tuya y una ajena: sin titular salvo el alias visible, sin kilos ni personas) y `https://localhost:8743/api/sesion`.

Límite: 3 enlaces por correo cada 15 minutos (y 10 por IP); 10 códigos de gafas por IP y 5 intentos de aprobar por hogar cada 15 minutos; se reinicia con `docker compose -f infra/dev/compose.yml restart api`.

### La prueba (e2e)

`GEMELO_DOCKER=1 node --test pruebas/guardianes/dev.test.js` hace el recorrido entero sin manos: levanta el entorno; comprueba que http solo da `/salud` y redirige a https; que sin sesión solo responde la portada (`/finca/` → 303 a `/`, teselas y `/api/hazas` → 401, `/api/interno` → 404); que un POST sin `Origin` se rechaza; pide el enlace para el hogar de prueba y para un correo sin cuenta (misma respuesta, y a este no le llega nada); lee el correo en la API de Mailpit; lo abre en Chrome headless y pulsa **Entrar**; hace el **primer acceso** (normas, alias, avatar) en la portada y sigue a la finca; comprueba la cookie (HttpOnly, Secure, Lax, invisible para JS); carga el mundo en `/finca/` con 0 errores, sin avisos de la CSP y con las teselas pedidas a `/teselas/`; consulta `/api/sesion`, `/api/hazas` y las fichas de las cuatro hazas (la propia, una ajena con alias oculto, una con alias visible y una sin asignar) contra `contratos/haza.schema.json` y una lista de claves prohibidas (titular, correo, kilos, personas, GPS); que el enlace usado ya no sirve; las **gafas** (agente de usuario del navegador de Meta, sin sesión y con sus propias cookies) piden un código, el aparato con sesión lo aprueba en «Mis dispositivos» y las gafas reciben su propia sesión y entran en `/finca/` (un código usado no vuelve a servir); la portada y la entrada sin estilos ni scripts en línea, sin avisos de la CSP y sin desbordar a 390 px; y que tras salir la cookie no vale. Pide el turno del banco de pruebas ([TESTING](TESTING.md)). Al final lo baja (si ya estaba levantado, lo deja).

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

Con la portada y las gafas (2026-10-29, misma máquina con otro agente usando Chrome, entorno ya levantado; una medida): pedir el enlace → correo 0,30 s; «Entrar» → primer acceso 0,64 s; el código en las gafas 1,58 s; de «Aprobar» a la sesión en las gafas 2,52 s (sondeo cada 3 s); la e2e entera 117 s. Con la máquina cargada, `up --wait` llegó a pasar de sus 240 s (la api tardó en estar sana) y la e2e falló ahí: se repitió con el entorno ya levantado.

La primera vez tarda más: descargar las imágenes y construir la de la api desde cero (en esta máquina, una pasada que tuvo que reconstruir la imagen de la api tras cambiar su código tardó 97 s en `levanta()`).

### La pantalla de entrada

Hecha (2026-10-29), en [`apps/web/portada/`](../../apps/web/portada/index.html) según [UX.md](../sistema/UX.md) §4.1–4.7 (decisión 56): portada pública (con sesión dice «Seguir a la finca»), «Entrar con tu correo», «Revisa tu correo» (reenviar a los 30 s), el **primer acceso** (normas con tres casillas obligatorias sin marcar y una opcional, alias y avatar), **«Vincular las gafas»** con el código corto y **Mis dispositivos** (aprobar o rechazar un código; cerrar sesión en todos los aparatos). Sin JS de terceros ni nada en línea (pasa la CSP de producción), fuentes del sistema, foco al `h1` de cada pantalla y anuncio en `aria-live`, errores junto al campo con `aria-invalid`, objetivos de 44 px (56 px y texto de 19 px en el navegador de las Quest). Nombre provisional «Cuarenta hazas» (decisión 44). Sin JS se lee la portada y el formulario manda el enlace (la respuesta es el JSON de la api).

Lo que falta:

- «¿Cómo vas a entrar?», sonido y micrófono, elegir visita y la carga (§4.8–4.14): son de la fase 2.
- Configuración completa (§4.11): solo está «Mis dispositivos»; no hay lista de aparatos con sesión (solo «cerrar en todos»).
- El mundo (`/finca/`) no exige el primer acceso (lo pide la portada) ni enlaza de vuelta a «Mis dispositivos».
- Aviso legal, política de privacidad y declaración de accesibilidad: sin redactar (lo dice el pie).
- ✅ **La política de referente de producción** (decisión 53, 2026-10-29): `infra/Caddyfile` pasa a `strict-origin-when-cross-origin`, como el de dev; un formulario POST de la portada manda su origen. Las páginas del enlace llevan además su propia `<meta name="referrer" content="strict-origin">`.
- ✅ **Las hazas en el mundo** (tarea A4): con la web servida aquí (`D.base` = `/teselas/<finca>/`), el motor pide `/api/hazas` con la cookie y pinta la linde de cada haza (la tuya en ámbar, las ajenas en blanco roto; casilla «Linde»); al tocar una, o con H, abre su ficha de `/api/hazas/{id}` ([`13b_hazas.js`](../../apps/web/motor/13b_hazas.js)). Lo comprueba en Node `pruebas/guardianes/hazas.test.js`; la e2e con sesión real es la tarea A5 (**no probado** aún contra la api).

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
| Portada | la misma (`apps/web/dist-portada`), con la CSP de dev (Report-Only) | la misma, con la CSP estricta (`style-src 'self'`): la e2e comprueba que no lleva estilos ni scripts en línea |
| Datos | fixture sintético o una carpeta local | teselas del servidor (formato v3, ADR propio de la fase 1a) |
| Copias y registros | ninguna; registros locales con rotación | copias nocturnas y restauración ensayada |
| Imágenes | oficiales, versión estable + digest; la de la api se construye aquí (`gemelo-api:local`) sobre la base del contrato | las mismas bases con su digest; las propias (web, api) construidas en CI, despliegue con aprobación manual |
