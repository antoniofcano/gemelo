# Runbook del VPS (fase F1a)

Cómo se pone en marcha y se opera el servidor del gemelo en el VPS de OVH, como inquilino del borde de Oficultor ([ADR-0011](../adr/0011-alojamiento-en-el-vps-de-ovh.md)). Contrato de lo que se despliega: [contratos/publicacion-vps.json](../../contratos/publicacion-vps.json). Sesión: [ADR-0013](../adr/0013-enlace-magico-y-sesiones.md); ficha: [ADR-0014](../adr/0014-proyeccion-publica-por-haza.md).

> **Nada de esto se ha ejecutado todavía en el VPS.** Todo lo de abajo está probado en local con Docker (ver «Qué está probado») salvo lo marcado **[NO PROBADO]**. Lo marcado **[SUPUESTO]** no se ha comprobado en la máquina ni en el proveedor: se comprueba en la lista previa antes de seguir. Cada paso que despliega, publica o toca el borde **lo decide Antonio** (regla de oro 9), y no se despliega hasta tener el recorrido completo probado en local (decisión 21: tareas A5 y A6 del [tablero](../rumbo/PLAN.md#tablero-de-tareas-desde-el-2026-10-29)).

## Piezas

| Servicio | Imagen (versión + digest en el contrato) | Qué hace |
|---|---|---|
| `db` | `postgis/postgis:18-3.6-alpine` (PostgreSQL 18.6, PostGIS 3.6.4) | base; solo en la red `bd` (sin salida); volumen en `/var/lib/postgresql` |
| `migra` | `gemelo-api` (Node 24.22.1 LTS) | aplica migraciones con el rol **`gemelo_dueno`** y termina |
| `api` | `gemelo-api` | Fastify en el puerto 8000 con el rol **`gemelo_api`** (sin permisos de esquema) |
| `web` | `caddy:2.11.7-alpine` | Caddy interno en 8080: estáticos, cabeceras, CSP Report-Only, `forward_auth`; en la red `borde` como `gemelo-web` |

- **Roles de la base** (decisión 55: los mismos en local y en producción). `gemelo_dueno` es el `POSTGRES_USER` de la imagen: dueño del esquema, solo lo usan `migra`, la carga de hazas, la primera cuenta y las copias. `gemelo_api` lo crea [`infra/bd-inicial/01-roles.sh`](../../infra/bd-inicial/01-roles.sh) al crear el volumen (`LOGIN`, sin superusuario, sin `CREATEDB` ni `CREATEROLE`; `public` cerrado a los demás) y la migración `0001` le da solo los permisos de fila. La comprobación posterior mira que siga así.
- **PostGIS lo crea la migración `0001`, no la imagen:** al montar `infra/bd-inicial/` en `/docker-entrypoint-initdb.d`, la imagen ya no ejecuta su propio script de PostGIS. En disco lento, `CREATE EXTENSION postgis` tarda; por eso `migra` corre con un tope de 10 min por sentencia (la api, 15 s). **[NO PROBADO]** en el disco del VPS.
- **Cabeceras** (las pone el Caddy interno, [infra/Caddyfile](../../infra/Caddyfile)): HSTS, `nosniff`, `X-Frame-Options DENY`, **`Referrer-Policy: strict-origin-when-cross-origin`** (decisión 53), COOP y CORP `same-origin`, `Permissions-Policy` con `xr-spatial-tracking=(self)`, CSP estricta en **Report-Only**, sin `Server`. El borde **no** debe añadir ni duplicar ninguna (lo mira la comprobación posterior).
- **Redes:** `bd` (interna, sin salida: db, migra, api), `interna` (api y web; la api sale por ella al SMTP de OVH y al MCP de OlivarTrack) y **`borde`**, externa, la crea y la lleva Oficultor; el gemelo solo se une con `web` y el alias `gemelo-web`. **Ningún puerto publicado:** se entra solo por el Caddy de borde de Oficultor con [infra/bloque-borde.txt](../../infra/bloque-borde.txt). Docker se salta `ufw` con los puertos publicados; por eso no hay ninguno y **F1a no toca `ufw`**.
- LiveKit (`livekit/livekit-server:v1.13.11`) es de la fase 2 y no está en el compose de producción: ver [Puertos de LiveKit (F2)](#puertos-de-livekit-f2-no-se-abren-en-f1a).

**Versiones comprobadas el 2026-10-29** en su fuente: imágenes en Docker Hub (las mismas que `infra/dev`), Node en nodejs.org (24 es LTS en mantenimiento hasta 2028-04-30; la 26 pasó a LTS activa el 2026-10-28, pero su imagen oficial con la versión LTS 26.13.0 aún no estaba publicada: **revisar y subir a la 26** cuando salga), curl 8.23.0 en curl.se (solo para `probar-caddy.sh`). Dependencias npm fijadas a versión exacta con `package-lock.json`; Python `jsonschema==4.26.0`.

## Lista de comprobación previa (solo mirar; no cambia nada)

Antes de tocar nada en el VPS. Todo son lecturas; lo que salga se anota **fuera del repo** (IP, nombres de contenedores del vecino, rutas de Oficultor). Si algo no cuadra, se para y se pregunta: no se arregla nada del vecino.

1. **Ventana y contacto.** Fecha y hora de poco uso acordadas con quien lleva Oficultor y Vigía (ADR-0011), y esa persona localizable durante el paso del borde.
2. **Local en verde.** Puerta verde en el commit que se va a desplegar; A5 (e2e de entrada) y A6 (prueba en aparatos) hechos (decisión 21); `docker compose -f infra/compose.yml config -q` sin errores en una máquina Linux.
3. **Sistema:** `cat /etc/os-release`, `uname -r`, `timedatectl` (reloj sincronizado por NTP: el enlace caduca a los 15 min y el certificado depende de la hora).
4. **Recursos:** `nproc`, `free -h`, `df -h / /var/lib/docker`, `uptime`. El compose limita la api a 512 MB y la web a 256 MB; la base no tiene tope (`shm_size` 256 MB). Hace falta margen para eso más la construcción de la imagen sin ahogar al vecino. Lo que ocupan las imágenes se mide antes en local con `docker image ls`; **[SUPUESTO]** que caben con varios GB libres.
5. **Docker:** `docker version` y `docker compose version`: hace falta Compose v2 (el plugin `docker compose`, no el `docker-compose` antiguo) por `service_completed_successfully` y `name:`.
6. **Línea base de lo que corre:** `docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'` y `docker compose ls`. Se guarda la salida: al final se compara para ver que el vecino sigue igual.
7. **Sin colisiones de nombres:** `docker compose ls` sin proyecto `gemelo`; `docker ps -a --filter name=gemelo`, `docker volume ls --filter name=gemelo`, `docker network ls --filter name=gemelo` y `docker image ls gemelo-api`, vacíos.
8. **Red `borde`:** `docker network inspect borde` existe (si no, se pide a Oficultor; **no se crea a mano**); quién está (`--format '{{range .Containers}}{{.Name}} {{end}}'`) y que ningún contenedor usa ya el alias `gemelo-web` (`docker inspect -f '{{json .NetworkSettings.Networks.borde.Aliases}}' <contenedor>` para cada uno).
9. **Caddy de borde:** qué contenedor es, su versión (`docker exec <caddy-borde> caddy version`), dónde está su Caddyfile (`docker inspect <caddy-borde> --format '{{json .Mounts}}'`) y **cómo lo recarga Oficultor** (su propio runbook manda: **[SUPUESTO]** `caddy validate` + `caddy reload` dentro del contenedor). Que no tenga ya un bloque `gemelo.canoydamas.es` y si tiene opciones globales que afecten a todos los sitios (cabeceras comunes, `email` del ACME).
10. **Puertos y cortafuegos:** `sudo ss -tulpn` (80 y 443 son del borde de Oficultor; nada del gemelo escuchará fuera), `sudo ufw status verbose` (se anota; F1a no lo cambia) y el cortafuegos de red de OVH en el área de clientes, si está activo (se anota).
11. **DNS del gemelo:** `dig +short A gemelo.canoydamas.es` y `dig +short AAAA gemelo.canoydamas.es` apuntan al VPS (`ip -brief addr` para ver sus IP); un AAAA que no llegue al borde rompe el certificado y a los clientes con IPv6. `dig +short CAA canoydamas.es`: si hay CAA, debe permitir la autoridad que usa el borde (**[SUPUESTO]** Let's Encrypt, la de Caddy por defecto). **El registro DNS se crea antes de pegar el bloque en el borde**: sin él, el borde reintenta el certificado y gasta intentos.
12. **Correo:** las lecturas de [SMTP de OVH](#smtp-de-ovh-para-el-enlace-mágico) (MX, SPF, DKIM, DMARC) y la salida al servidor SMTP desde el VPS: `openssl s_client -connect <servidor-smtp>:465 -brief </dev/null` (solo el saludo TLS).
13. **OlivarTrack** (solo si se va a encender ya): la URL del MCP responde **401 sin token** (`curl -s -o /dev/null -w '%{http_code}' <url-mcp>`). Ver [Token de OlivarTrack](#token-propio-de-olivartrack-solo-lectura-decisión-17).
14. **Usuarios de las imágenes** (para los permisos de los secretos; se puede mirar en local): `docker run --rm --entrypoint id <imagen db> postgres` y `docker run --rm --entrypoint id <imagen node> node`. **[SUPUESTO]** uid 70 (`postgres` de Alpine) y uid 1000 (`node`); si salen otros, se cambian en el paso 2.
15. **Copias:** destino de `rclone` fuera del VPS creado y la clave de `age` generada **fuera** del VPS (en el VPS solo irá la pública).

## Primera puesta en marcha **[NO PROBADO en el VPS]**

Cada paso: qué se hace, cómo se ve que fue bien y cómo se deshace. Las órdenes se ejecutan como root (o con `sudo`) desde la copia del repo en el VPS (**[SUPUESTO]** `/opt/gemelo`, un `git clone` del repo público en el commit o tag acordado). Hasta el paso 7 nada es visible desde fuera y nada toca al vecino.

| # | Qué | Comprobación | Vuelta atrás |
|---|---|---|---|
| 0 | **Copia de lo del vecino que se va a tocar:** el Caddyfile de borde a `…/Caddyfile.antes-gemelo-<fecha>` (con quien lleva Oficultor) y la línea base de `docker ps` de la lista previa | la copia existe y es idéntica (`cmp`) | nada que deshacer |
| 1 | **Carpetas:** `install -d -m 0750 /etc/gemelo`, `install -d -m 0700 /etc/gemelo/secretos /var/backups/gemelo`, `install -d -m 0755 /srv/gemelo/publicado/{portada,finca,teselas}` | `ls -ld` de cada una | `rm -r /etc/gemelo /srv/gemelo /var/backups/gemelo` |
| 2 | **Secretos**, cada uno en su fichero, nunca en variables ni en el repo (ver abajo) | `ls -l /etc/gemelo/secretos` (seis ficheros, ninguno vacío, ninguno legible por «otros») | `shred -u /etc/gemelo/secretos/*` |
| 3 | **Entorno:** `install -m 0640 infra/entorno.ejemplo /etc/gemelo/entorno` y rellenar el buzón, el remitente y, si toca, OlivarTrack ([SMTP](#smtp-de-ovh-para-el-enlace-mágico)) | `grep -c ejemplo.invalid /etc/gemelo/entorno` da 0 | `rm /etc/gemelo/entorno` |
| 4 | **Construir** en la ventana (gasta CPU): `docker compose -f infra/compose.yml build` | `docker image ls gemelo-api` | `docker image rm gemelo-api:0.2.0`. **Nunca** `docker system prune` ni `docker builder prune` sin filtro: borra también lo del vecino |
| 5 | **Estáticos:** la portada y la entrada (`apps/web/dist-portada`, de `cd apps/web && npm run build:portada`) en `/srv/gemelo/publicado/portada`, la web construida (`apps/web/dist`) en `…/finca` y las teselas en `…/teselas`, legibles por todos (`0644`/`0755`): el Caddy interno corre sin capacidades y no se salta permisos | `find /srv/gemelo/publicado ! -perm -o+r` vacío | vaciar las carpetas |
| 6 | **Arrancar:** `docker compose -f infra/compose.yml up -d`. El primer arranque crea `gemelo_api` (`01-roles.sh`), `migra` aplica `0001_inicial` (PostGIS incluido; puede tardar minutos) y la api arranca cuando `migra` termina bien | `docker compose -f infra/compose.yml ps -a` (db y api `healthy`, migra `exited (0)`); `docker compose -f infra/compose.yml exec web wget -qO- http://api:8000/api/salud` → `{"estado":"ok","bd":"ok"}`; `docker ps` del vecino igual que en la línea base | `docker compose -f infra/compose.yml down` (conserva la base). `down -v` la borra: **solo** antes de tener datos reales |
| 7 | **Borde** (lo hace o autoriza quien lleva Oficultor): con el DNS ya apuntando, añadir [infra/bloque-borde.txt](../../infra/bloque-borde.txt) tal cual al Caddyfile de borde, `caddy validate` y, solo si valida, `caddy reload` | los registros del borde muestran el certificado obtenido; `bash infra/comprobar-despliegue.sh` desde fuera (abajo); las webs del vecino responden igual (`GEMELO_VECINOS`) | restaurar la copia del paso 0, `caddy validate`, `caddy reload`: el gemelo deja de verse y el vecino queda como estaba. Si `validate` falla, **no** se recarga (el borde sigue con la configuración anterior) |
| 8 | **Copia antes de meter datos:** `infra/respaldo.sh --sin-subir` (y con subida cuando `rclone` esté listo) | el fichero `.dump.age` en `/var/backups/gemelo` | borrar el fichero |
| 9 | **Hazas:** `python tuberia/hazas/carga_hazas.py --hazas <hazas.geojson> --olivos <olivos.geojson> --salida <hazas.sql>` en el equipo de trabajo (los datos reales **fuera del repo**), copiar al VPS y `docker compose -f infra/compose.yml exec -T db psql -v ON_ERROR_STOP=1 -U gemelo_dueno -d gemelo < <hazas.sql>`; después `shred -u <hazas.sql>`. Asignar las hazas a hogares desde el panel (`PUT /api/admin/hazas/{id}/hogar`) | `SELECT count(*) FROM hazas` da lo que dijo el cargador | restaurar la copia del paso 8 ([Copias](#copias)) |
| 10 | **Primera cuenta de la oficina:** `docker compose -f infra/compose.yml exec db psql -U gemelo_dueno -d gemelo -c "INSERT INTO hogares (correo, rol) VALUES ('<correo>', 'admin')"`; el resto, desde el panel | pedir el enlace desde la portada y entrar (prueba de punta a punta del SMTP) | `DELETE FROM hogares WHERE correo = '<correo>'` (borrado en cascada) |
| 11 | **Copias diarias:** temporizador de systemd (ver [Copias](#copias)) | `systemctl list-timers gemelo-respaldo.timer` y una primera copia subida | `systemctl disable --now gemelo-respaldo.timer` y borrar las unidades |
| 12 | **OlivarTrack** (aparte, cuando haya token y respuestas reales grabadas): ver [Token de OlivarTrack](#token-propio-de-olivartrack-solo-lectura-decisión-17) | una sincronía `ok` | `GEMELO_OT=no` y recrear la api |

**Vuelta atrás completa** (de más a menos): quitar el bloque del borde y recargar (paso 7) → `docker compose -f infra/compose.yml down` → si no hay nada que guardar, `down -v`, `docker image rm gemelo-api:0.2.0` y las carpetas del paso 1 → revocar el token de OlivarTrack y cambiar la clave del buzón → quitar el registro DNS. El vecino no se toca en ningún paso salvo el 7.

### Secretos (paso 2)

Se escriben desde una sesión `ssh` en el VPS, sin pasar por el repo, un chat, un agente, el correo ni el historial de la shell. Los generados:

```sh
cd /etc/gemelo/secretos && umask 077
openssl rand -base64 32 > pg_dueno; openssl rand -base64 32 > pg_api; openssl rand -base64 48 > sesion_secreto
openssl rand -base64 48 > livekit_secreto   # F2: API secret de LiveKit; el compose exige el fichero aunque la presencia esté apagada
```

`livekit_secreto` es el *API secret* de LiveKit: la api firma con él los tokens de la sala y el servidor de LiveKit, cuando entre en el compose de producción (F2), tendrá que conocer el mismo par (`GEMELO_LIVEKIT_CLAVE` y este secreto), también desde fichero y nunca escrito en el compose (cómo exactamente, al añadirlo: **[SUPUESTO]** su opción `key_file`). Mientras `/etc/gemelo/entorno` no traiga `GEMELO_LIVEKIT_URL`, la api no lo lee. Rotarlo es reescribir el fichero y recrear la api (y LiveKit): los tokens viejos dejan de valer al momento, y quien esté dentro sigue hasta que se reconecte **[NO PROBADO]**.

Los que vienen de fuera (clave del buzón, token de OlivarTrack), pegados sin eco: `sudo bash -c 'umask 077; read -rs v; printf %s "$v" > /etc/gemelo/secretos/smtp_clave'` (igual `ot_token`; hasta tener el token, `echo no > ot_token` y `GEMELO_OT=no`: el compose exige que el fichero exista).

**Permisos [NO PROBADO]:** sin Swarm, Docker monta cada secreto como el fichero del anfitrión, con su dueño y sus permisos (en Docker Desktop no se notó). Las imágenes no corren como root (paso 14 de la lista previa), así que un `0400` de root **no lo podrían leer**. Con los uid supuestos:

```sh
chown 1000:70 pg_dueno pg_api && chmod 0440 pg_dueno pg_api        # db (uid 70) y migra/api (uid 1000)
chown root:1000 sesion_secreto smtp_clave ot_token livekit_secreto && chmod 0440 sesion_secreto smtp_clave ot_token livekit_secreto
```

Al **cambiar** un secreto, el contenedor sigue viendo el fichero viejo si se sustituye (otro inodo) y la api solo lo lee al arrancar: siempre `docker compose -f infra/compose.yml up -d --no-deps --force-recreate api`. Las contraseñas de la base solo cuentan al crear el volumen; cambiarlas después es `ALTER ROLE … PASSWORD` con el dueño, y luego el fichero.

## SMTP de OVH para el enlace mágico

Decisión 15: el correo sale del **SMTP de OVH** con el dominio `canoydamas.es`. La api lo envía con `nodemailer` (solo texto, sin imágenes ni seguimiento); en producción exige TLS y usuario, y se niega a usar el buzón de pruebas.

**Qué hace falta (Antonio):** un buzón propio para el gemelo en `canoydamas.es` (no el personal), y saber qué producto de correo de OVH lo aloja, porque de eso depende el servidor: **[SUPUESTO]** `ssl0.ovh.net` es el de MX Plan (el que trae `infra/entorno.ejemplo`); Email Pro y Exchange tienen otro. Se mira en el área de clientes de OVH.

**Variables** (en `/etc/gemelo/entorno`, plantilla en [infra/entorno.ejemplo](../../infra/entorno.ejemplo); la clave, en `/etc/gemelo/secretos/smtp_clave`):

| Variable | Valor |
|---|---|
| `GEMELO_CORREO` | `smtp` |
| `GEMELO_SMTP_HOST` | servidor del producto de OVH **[SUPUESTO]** `ssl0.ovh.net` |
| `GEMELO_SMTP_PUERTO` | `465` (TLS directo) o `587` (STARTTLS; la api lo exige con `requireTLS`) |
| `GEMELO_SMTP_TLS` | `si` (en producción no admite otra cosa) |
| `GEMELO_SMTP_USUARIO` | la dirección completa del buzón |
| `GEMELO_CORREO_REMITENTE` | `Nombre visible <la misma dirección>`: **[SUPUESTO]** OVH rechaza o marca un remitente distinto del buzón autenticado |
| `GEMELO_SMTP_CLAVE_FICHERO` | ya puesta en el compose (`/run/secrets/smtp_clave`) |

**Comprobaciones del dominio** (solo lecturas, desde cualquier equipo; en Windows, `nslookup -type=TXT …`). Aquí no se escriben registros: lo que falte se propone a Antonio y lo cambia quien lleve el DNS.

| Qué | Cómo se mira | Qué debe salir |
|---|---|---|
| MX | `dig +short MX canoydamas.es` | los servidores de correo de OVH (si son otros, el buzón no está en OVH y cambia todo lo de arriba) |
| SPF | `dig +short TXT canoydamas.es` | **un único** registro `v=spf1 …` que autorice a OVH a enviar (**[SUPUESTO]** el `include:` que indique la guía de OVH para ese producto); si Oficultor o Vigía envían desde el mismo dominio con otro proveedor, el mismo registro debe incluirlos a todos: no se cambia sin coordinar |
| DKIM | el selector que dé OVH al activarlo en el área de clientes; `dig +short TXT <selector>._domainkey.canoydamas.es` (o el CNAME que indique) | la clave pública publicada. **No sé si está activado**: se mira |
| DMARC | `dig +short TXT _dmarc.canoydamas.es` | un `v=DMARC1; p=…`. Si no hay, la propuesta prudente es empezar por `p=none` con informes a un buzón de la oficina y endurecer después (decisión de Antonio) |
| Envío real | pedir un enlace (paso 10) a una cuenta de prueba de un proveedor grande y abrir el mensaje original | `spf=pass`, `dkim=pass`, `dmarc=pass` en `Authentication-Results`, y que no caiga en spam |

**Si falla:** el gemelo sigue en pie pero nadie puede entrar. `docker compose -f infra/compose.yml logs api` (el envío fallido sale como evento, sin el correo ni el token). **Cambiar la clave del buzón:** en OVH, reescribir `smtp_clave` y recrear la api (arriba).

## Token propio de OlivarTrack (solo lectura, decisión 17)

La api lee OlivarTrack por MCP (Streamable HTTP) con `Authorization: Bearer <token>` y solo llama a `pases_del_periodo`, `novedades` y `aforo_y_avance_de_recoleccion` ([contratos/olivartrack-sync.md](../../contratos/olivartrack-sync.md)). Si el servidor le deja ver alguna herramienta de escritura (`registrar_`, `proponer_`, `anotar_`, `reportar_`, `anadir_`), **se niega a leer**. Este repo no toca OlivarTrack: lo de abajo se pide a quien lo lleva.

**Qué pedir en OlivarTrack** (el «cambio pequeño» de la decisión 17; **[SUPUESTO]** que OlivarTrack aún no emite tokens así):

1. Un token **propio del gemelo**, con nombre que lo identifique, distinto del de cualquier persona y del conector de claude.ai, para revocarlo sin tocar a nadie más.
2. **Solo lectura:** lo ideal, que el servidor solo le liste esas tres herramientas; como mínimo, ninguna de escritura.
3. Que sus respuestas sean las mismas agregadas de siempre (nada por persona) y que OlivarTrack registre su uso.
4. Caducidad y rotación (pregunta abierta) y, si OlivarTrack lo permite, limitarlo a la IP del VPS.
5. La URL del MCP (va en `GEMELO_OT_MCP_URL`, `https` obligatorio).

**Antes de encenderlo:** las formas de respuesta de las grabaciones de `apps/api/pruebas/grabaciones/` son **sintéticas y supuestas**. Hay que grabar respuestas reales con el token (en el equipo de trabajo, **fuera del repo**, porque llevan datos de la explotación), ajustar `ot/mapeo.ts` y las grabaciones sintéticas a esas formas, y pasar sus pruebas. Hasta entonces, `GEMELO_OT=no`: F1a se puede desplegar sin OlivarTrack.

**Cómo llega al gemelo:** Antonio lo copia de OlivarTrack directamente al fichero `/etc/gemelo/secretos/ot_token` con el `read -rs` de [Secretos](#secretos-paso-2) (nunca en el repo, un chat, un agente, el correo ni una variable). Después, en `/etc/gemelo/entorno`: `GEMELO_OT=mcp` y `GEMELO_OT_MCP_URL=…`; recrear la api; sincronizar a mano (`docker compose -f infra/compose.yml exec api node dist/src/ot/sincroniza-cli.js`) y mirar `SELECT * FROM sincronias_ot ORDER BY id DESC LIMIT 5` (estado `ok`, ningún error de «herramientas de escritura»).

**Cómo se revoca** (si se filtra, primero esto): (1) revocarlo en OlivarTrack, que corta ya; (2) en el gemelo, `GEMELO_OT=no`, `echo no > /etc/gemelo/secretos/ot_token` y recrear la api. Lo ya sincronizado se queda con su fecha (`datos_de`). **Rotarlo:** token nuevo en OlivarTrack, reescribir el fichero, recrear la api, comprobar una sincronía y solo entonces revocar el viejo.

## Comprobación posterior (solo lee)

[`infra/comprobar-despliegue.sh`](../../infra/comprobar-despliegue.sh) hace lo mismo que `infra/probar-caddy.sh` pero contra el servidor de verdad, a través del borde: solo peticiones `GET` sin sesión, un saludo TLS y, en el VPS, consultas a Docker y a la base en solo lectura. No pide enlaces (eso manda un correo y escribe en la base). `probar-caddy.sh` no sirve tal cual: monta su propia red y su api simulada, y aquí no se monta nada.

```sh
GEMELO_VECINOS="<webs del borde, las que diga Oficultor>" bash infra/comprobar-despliegue.sh   # desde fuera
bash infra/comprobar-despliegue.sh --en-vps                                                    # en el VPS, desde la raíz del repo
```

Mira: que conecta (y con `GEMELO_IP_ESPERADA`, a qué IP); el certificado (nombra el dominio, le quedan ≥ 14 días) y que `http` redirige a `https`; las cabeceras de seguridad de la portada (incluida la Referrer-Policy), sin `Server`, sin CSP impuesta y **sin cabeceras repetidas por el borde**; `/api/salud` → `{"estado":"ok","bd":"ok"}`; **`/api/interno` da 404 desde fuera** (también con cookie); sin sesión, `/finca/` → 303 a la portada, teselas, `/api/sesion`, `/api/hazas` y el panel → 401; que las webs de `GEMELO_VECINOS` no dan 5xx. Con `--en-vps`, además: db y api sanas y migra terminada con 0, ningún puerto publicado, `gemelo-web` en `borde`, `gemelo_api` sin superusuario ni dueño de nada y la api conectada con él, PostGIS instalado, y registros de la última hora sin cookies, `Authorization` ni el token del enlace. La guarda `api.test.js` (que no tenga órdenes que cambien nada, y su ejecución contra un servidor falso).

## Puertos de LiveKit (F2: no se abren en F1a)

Lo que pedirá la fase 2, para que no sorprenda; **en F1a no se abre nada y `ufw` no se toca**. LiveKit es la excepción de ADR-0011: necesita llegar por UDP/TCP directos.

| Puerto | Para qué | Cómo |
|---|---|---|
| 7880/tcp | señalización (WebSocket) | **no** se abre: va por el borde (`wss://` a través de Caddy), como la web. Subdominio o ruta: por decidir en F2 |
| 7881/tcp | ICE por TCP (redes que cortan UDP) | `ufw allow 7881/tcp` |
| 50000–60000/udp | medios (rango por defecto; en local se usa un solo UDP, 7882) | `ufw allow 50000:60000/udp`, o un rango menor si se ajusta en `livekit.yaml` (decisión técnica de F2) |
| TURN (3478/udp, TLS) | solo si hiciera falta para redes muy cerradas | por decidir en F2 |

**[SUPUESTO] a comprobar en F2:** como Docker se salta `ufw` con los puertos publicados, LiveKit iría con `network_mode: host` para que manden las reglas de `ufw`; y el cortafuegos de red de OVH, si está activo, también necesitaría esas reglas. **Vuelta atrás:** `ufw delete allow 7881/tcp` y `ufw delete allow 50000:60000/udp`.

## Operación

| Quiero… | Cómo |
|---|---|
| Ver registros | `docker compose -f infra/compose.yml logs -f api web` (JSON, sin tokens, cookies, correos ni IP completa) |
| Sincronizar OlivarTrack ya | panel (`POST /api/admin/sincronia`) o `docker compose -f infra/compose.yml exec api node dist/src/ot/sincroniza-cli.js` |
| Echar a alguien | panel: revocar sesiones o borrar el hogar (borrado en cascada, RGPD) |
| Actualizar la api | `infra/respaldo.sh` antes; `git fetch` y `git checkout <tag>`; `docker compose -f infra/compose.yml up -d --build` (las migraciones nuevas las aplica `migra`); `bash infra/comprobar-despliegue.sh --en-vps` |
| Volver a la versión anterior | `git checkout <tag anterior>` y `up -d --build`. Las migraciones **no** se deshacen: si la nueva cambió el esquema, restaurar la copia de justo antes ([Copias](#copias)) |
| Cambiar una imagen | en `infra/compose.yml`, `infra/dev/compose.yml` y `contratos/publicacion-vps.json` a la vez (lo vigila `api.test.js`), versión exacta + digest, estable |
| Cambiar un secreto o el entorno | reescribir el fichero y `docker compose -f infra/compose.yml up -d --no-deps --force-recreate api` |
| Pasar la CSP a obligatoria | tras unas semanas sin informes en `logs api | grep '"evento":"csp"'`, cambiar `Content-Security-Policy-Report-Only` por `Content-Security-Policy` en `infra/Caddyfile` |

## Copias

- **Diaria** con un temporizador de systemd que ejecuta `infra/respaldo.sh`: `pg_dump` → cifrado con `age` a la clave **pública** (`/etc/gemelo/respaldo.age.pub`; la privada la guarda Antonio **fuera** del VPS) → `rclone` a `GEMELO_RESPALDO_REMOTO` (otro proveedor u otra región) con comprobación. Se quedan 7 días en local. Unidades propuestas (no están en el repo): `gemelo-respaldo.service` (`Type=oneshot`, `ExecStart=/bin/bash /opt/gemelo/infra/respaldo.sh`: el guion no lleva bit de ejecución en el repo) y `gemelo-respaldo.timer` (`OnCalendar=*-*-* 03:30`, `Persistent=true`), a una hora que no coincida con las copias del vecino.
- **Ensayo de restauración** al menos una vez al mes y tras cada migración, **fuera del VPS**: `infra/ensayar-restauracion.sh ultima <clave-privada>`; restaura en una base de usar y tirar con la misma imagen y comprueba migraciones, PostGIS, geometrías, SRID, reparto haza-parcela y permisos.
- **[NO PROBADO]** `age` y `rclone` reales (el ensayo local usó un sustituto de `age` que no cifra), la subida a Object Storage y el temporizador de systemd.

## Si algo falla

| Síntoma | Mirar |
|---|---|
| `api` no arranca | `logs migra` (¿migración fallida? ¿tope de 10 min en `CREATE EXTENSION postgis`?) y `logs api`: un `ErrorDeConfig` dice qué variable o fichero de secreto falta |
| «no se puede leer el fichero de …» | permisos del secreto frente al uid del contenedor ([Secretos](#secretos-paso-2)) |
| `/api/salud` da 503 | la base: `logs db`, espacio en disco, `pg_isready` |
| El borde da 502 | `docker network inspect borde` (¿está `gemelo-web`?) y `docker compose -f infra/compose.yml ps` |
| No llega el enlace | `logs api` (evento de envío fallido), credenciales SMTP, servidor según el producto de OVH, SPF/DKIM/DMARC ([SMTP](#smtp-de-ovh-para-el-enlace-mágico)) **[NO PROBADO]** |
| «Has pedido varios enlaces» | límite por correo o IP (15 min); es lo esperado |
| La ficha avisa `ot_error` | `SELECT * FROM sincronias_ot ORDER BY id DESC LIMIT 5`; token caducado o revocado, OlivarTrack caído, o el token deja ver herramientas de escritura |
| La ficha avisa `ot_truncado` | OlivarTrack cortó la respuesta: no se borra nada; la siguiente sincronía lo completa |
| `/finca/` manda a la portada | no hay sesión (es lo esperado); si la hay, `logs api` en `/api/interno/autoriza` |

## Qué está probado y qué no

- **Probado en local (Windows 10, Docker Desktop, 2026-10-29):** las 51 pruebas de `apps/api` (21 de integración contra la imagen de PostGIS de producción); `infra/probar-caddy.sh` (24 comprobaciones de cabeceras, sesión, caché y registros); la imagen de la api construida, migrando con el dueño y sirviendo `/api/salud` con el rol de la api, con sistema de ficheros de solo lectura y sin root; `docker compose config` del compose de producción (en Linux, sin puertos publicados); copia y ensayo de restauración con datos sintéticos; `infra/comprobar-despliegue.sh` contra un servidor falso en 127.0.0.1 (sin TLS ni `--en-vps`).
- **[NO PROBADO]:** el VPS, el borde real de Oficultor, el certificado, los permisos de los secretos con un Docker de Linux, el SMTP de OVH y los registros SPF/DKIM/DMARC, el MCP real de OlivarTrack (las formas de respuesta son supuestas) y su token, `age`/`rclone` reales, el temporizador de copias, `comprobar-despliegue.sh` contra el servidor real y con `--en-vps`, y cualquier dispositivo real (iPhone, Quest).
