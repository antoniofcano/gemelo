# Runbook del VPS (fase F1a)

> **Primer despliegue:** sigue [DESPLIEGUE-V2](DESPLIEGUE-V2.md), que ordena estos pasos con lo hecho después de F1a. Este runbook queda como referencia.

Cómo se pone en marcha y se opera el servidor del gemelo en el VPS de OVH, como inquilino del borde de Oficultor ([ADR-0011](../adr/0011-alojamiento-en-el-vps-de-ovh.md)). Contrato de lo que se despliega: [contratos/publicacion-vps.json](../../contratos/publicacion-vps.json). Sesión: [ADR-0013](../adr/0013-enlace-magico-y-sesiones.md); ficha: [ADR-0014](../adr/0014-proyeccion-publica-por-haza.md).

> **Nada de esto se ha ejecutado todavía en el VPS.** Todo lo de abajo está probado en local con Docker (ver «Qué está probado») salvo lo marcado **[NO PROBADO]**. Lo marcado **[SUPUESTO]** no se ha comprobado en la máquina ni en el proveedor: se comprueba en la lista previa antes de seguir. Cada paso que despliega, publica o toca el borde **lo decide Antonio** (regla de oro 9), y no se despliega hasta tener el recorrido completo probado en local (decisión 21: tareas A5 y A6 del [tablero](../rumbo/PLAN.md#tablero-de-tareas-desde-el-2026-10-29)).

## Piezas

| Servicio | Imagen (versión + digest en el contrato) | Qué hace |
|---|---|---|
| `db` | `postgis/postgis:18-3.6-alpine` (PostgreSQL 18.6, PostGIS 3.6.4) | base; solo en la red `bd` (sin salida); volumen en `/var/lib/postgresql` |
| `migra` | `gemelo-api` (Node 24.22.1 LTS) | aplica migraciones con el rol **`gemelo_dueno`** y termina |
| `api` | `gemelo-api` | Fastify en el puerto 8000 con el rol **`gemelo_api`** (sin permisos de esquema) |
| `web` | `caddy:2.11.7-alpine` | Caddy interno en 8080: estáticos, cabeceras, CSP Report-Only, `forward_auth`, `/rtc`; en la red `borde` como `gemelo-web` |
| `livekit` (perfil `presencia`) | `livekit/livekit-server:v1.13.11` | presencia y voz; señalización por `/rtc`, medios por 7881/tcp y 7882/udp ([ADR-0027](../adr/0027-livekit-en-produccion-puertos-publicados.md)) |
| `hornero` (perfil `hornero`) | `gemelo-hornero` | hornea las variantes de olivos; sin puertos ni salida a Internet |

- **Roles de la base** (decisión 55: los mismos en local y en producción). `gemelo_dueno` es el `POSTGRES_USER` de la imagen: dueño del esquema, solo lo usan `migra`, la carga de hazas, la primera cuenta y las copias. `gemelo_api` lo crea [`infra/bd-inicial/01-roles.sh`](../../infra/bd-inicial/01-roles.sh) al crear el volumen (`LOGIN`, sin superusuario, sin `CREATEDB` ni `CREATEROLE`; `public` cerrado a los demás) y la migración `0001` le da solo los permisos de fila. La comprobación posterior mira que siga así.
- **PostGIS lo crea la migración `0001`, no la imagen:** al montar `infra/bd-inicial/` en `/docker-entrypoint-initdb.d`, la imagen ya no ejecuta su propio script de PostGIS. En disco lento, `CREATE EXTENSION postgis` tarda; por eso `migra` corre con un tope de 10 min por sentencia (la api, 15 s). **[NO PROBADO]** en el disco del VPS.
- **Cabeceras** (las pone el Caddy interno, [infra/Caddyfile](../../infra/Caddyfile)): HSTS, `nosniff`, `X-Frame-Options DENY`, **`Referrer-Policy: strict-origin-when-cross-origin`** (decisión 53), COOP y CORP `same-origin`, `Permissions-Policy` con `xr-spatial-tracking=(self)` y `microphone=(self)` (la voz), CSP estricta en **Report-Only**, sin `Server`. El borde **no** debe añadir ni duplicar ninguna (lo mira la comprobación posterior).
- **Redes:** `bd` (interna, sin salida: db, migra, api), `interna` (api y web; la api sale por ella al SMTP de OVH y al MCP de OlivarTrack) y **`borde`**, externa, la crea y la lleva Oficultor; el gemelo solo se une con `web` y el alias `gemelo-web`. **Ningún puerto web publicado:** se entra solo por el Caddy de borde de Oficultor con [infra/bloque-borde.txt](../../infra/bloque-borde.txt). Docker se salta `ufw` con los puertos publicados; los únicos son los dos de LiveKit, solo con su perfil: ver [Puertos de LiveKit](#puertos-de-livekit-perfil-presencia).

**Versiones comprobadas el 2026-10-29** en su fuente: imágenes en Docker Hub (las mismas que `infra/dev`), Node en nodejs.org (24 es LTS en mantenimiento hasta 2028-04-30; la 26 pasó a LTS activa el 2026-10-28, pero su imagen oficial con la versión LTS 26.13.0 aún no estaba publicada: **revisar y subir a la 26** cuando salga), curl 8.23.0 en curl.se (solo para `probar-caddy.sh`). Dependencias npm fijadas a versión exacta con `package-lock.json`; Python `jsonschema==4.26.0`.

## Lista de comprobación previa (solo mirar; no cambia nada)

Antes de tocar nada en el VPS. Todo son lecturas; lo que salga se anota **fuera del repo** (IP, nombres de contenedores del vecino, rutas de Oficultor). Si algo no cuadra, se para y se pregunta: no se arregla nada del vecino.

1. **Ventana y contacto.** Fecha y hora de poco uso acordadas con quien lleva Oficultor y Vigía (ADR-0011), y esa persona localizable durante el paso del borde.
2. **Local en verde.** Puerta verde en el commit que se va a desplegar; A5 (e2e de entrada) y A6 (prueba en aparatos) hechos (decisión 21); `docker compose -f infra/compose.yml config -q` sin errores en una máquina Linux.
3. **Sistema:** `cat /etc/os-release`, `uname -r`, `timedatectl` (reloj sincronizado por NTP: el enlace caduca a los 15 min y el certificado depende de la hora).
4. **Recursos:** `nproc`, `free -h`, `df -h / /var/lib/docker`, `uptime`. Todos los servicios llevan `mem_limit` ([DESPLIEGUE-V2 § Memoria](DESPLIEGUE-V2.md#memoria-y-el-vps-sin-swap)). Hace falta margen para eso más la construcción de la imagen sin ahogar al vecino. Lo que ocupan las imágenes se mide antes en local con `docker image ls`; **[SUPUESTO]** que caben con varios GB libres.
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
| 1 | **Carpetas:** `install -d -m 0750 /etc/gemelo`, `install -d -m 0700 /etc/gemelo/secretos /var/backups/gemelo`, `install -d -m 0755 /srv/gemelo/publicado/{portada,finca,oficina,teselas,avatares}` | `ls -ld` de cada una | `rm -r /etc/gemelo /srv/gemelo /var/backups/gemelo` |
| 2 | **Secretos**, cada uno en su fichero, nunca en variables ni en el repo (ver abajo) | `ls -l /etc/gemelo/secretos` (ocho ficheros, ninguno vacío, ninguno legible por «otros») | `shred -u /etc/gemelo/secretos/*` |
| 3 | **Entorno:** `install -m 0640 infra/entorno.ejemplo /etc/gemelo/entorno` y rellenar el buzón, el remitente y, si toca, OlivarTrack ([SMTP](#smtp-de-ovh-para-el-enlace-mágico)) | `grep -c ejemplo.invalid /etc/gemelo/entorno` da 0 | `rm /etc/gemelo/entorno` |
| 4 | **Construir** en la ventana (gasta CPU): `docker compose -f infra/compose.yml build` | `docker image ls gemelo-api` | `docker image rm gemelo-api:0.2.0`. **Nunca** `docker system prune` ni `docker builder prune` sin filtro: borra también lo del vecino |
| 5 | **Estáticos:** la portada y la entrada (`apps/web/dist-portada`, de `cd apps/web && npm run build:portada`) en `/srv/gemelo/publicado/portada`, la web construida (`apps/web/dist`) en `…/finca`, la oficina (`apps/web/dist-oficina`, de `npm run build:oficina`; Caddy la sirve solo con sesión de oficina, ADR-0024) en `…/oficina` y las teselas en `…/teselas` (las recetas horneadas de cada finca, en `…/teselas/<finca>/olivos/`: `manifiesto.json`, los `<huella>.br` y los atlas `<huella>.webp`, tal como los escribe el hornero (el resto de lo que deje —`estado.json`, `manifiesto.anterior.json`— el Caddy interno lo da como 404); a los `.br` les pone `Content-Encoding: br` + `immutable`, a los `.webp` `image/webp` + `immutable` y al manifiesto `no-cache`, [olivo-horneado](../../contratos/olivo-horneado.md); los objetos se copian primero y el manifiesto el último), legibles por todos (`0644`/`0755`): el Caddy interno corre sin capacidades y no se salta permisos | `find /srv/gemelo/publicado ! -perm -o+r` vacío | vaciar las carpetas |
| 6 | **Arrancar:** `docker compose -f infra/compose.yml up -d`. El primer arranque crea `gemelo_api` (`01-roles.sh`), `migra` aplica de `0001` a `0017` (PostGIS incluido; puede tardar minutos) y la api arranca cuando `migra` termina bien | `docker compose -f infra/compose.yml ps -a` (db y api `healthy`, migra `exited (0)`); `docker compose -f infra/compose.yml exec web wget -qO- http://api:8000/api/salud` → `{"estado":"ok","bd":"ok"}`; `docker ps` del vecino igual que en la línea base | `docker compose -f infra/compose.yml down` (conserva la base). `down -v` la borra: **solo** antes de tener datos reales |
| 7 | **Borde** (lo hace o autoriza quien lleva Oficultor): con el DNS ya apuntando, añadir [infra/bloque-borde.txt](../../infra/bloque-borde.txt) tal cual al Caddyfile de borde, `caddy validate` y, solo si valida, `caddy reload` | los registros del borde muestran el certificado obtenido; `bash infra/comprobar-despliegue.sh` desde fuera (abajo); las webs del vecino responden igual (`GEMELO_VECINOS`) | restaurar la copia del paso 0, `caddy validate`, `caddy reload`: el gemelo deja de verse y el vecino queda como estaba. Si `validate` falla, **no** se recarga (el borde sigue con la configuración anterior) |
| 8 | **Copia antes de meter datos:** `infra/respaldo.sh --sin-subir` (y con subida cuando `rclone` esté listo) | el fichero `.dump.age` en `/var/backups/gemelo` | borrar el fichero |
| 9 | **Hazas:** `python tuberia/hazas/carga_hazas.py --hazas <hazas.geojson> --olivos <olivos.geojson> --salida <hazas.sql>` en el equipo de trabajo (los datos reales **fuera del repo**), copiar al VPS y `docker compose -f infra/compose.yml exec -T db psql -v ON_ERROR_STOP=1 -U gemelo_dueno -d gemelo < <hazas.sql>`; después `shred -u <hazas.sql>`. Asignar las hazas a hogares desde el panel (`PUT /api/admin/hazas/{id}/hogar`) | `SELECT count(*) FROM hazas` da lo que dijo el cargador | restaurar la copia del paso 8 ([Copias](#copias)) |
| 10 | **Primera cuenta de la oficina:** `docker compose -f infra/compose.yml exec db psql -U gemelo_dueno -d gemelo -c "INSERT INTO hogares (correo, rol) VALUES ('<correo>', 'admin')"` (un correo **aparte** del de cualquier hogar, decisión 106); al entrar, su aparato queda pendiente (ADR-0024): se aprueba con un segundo enlace desde el mismo navegador pasados 5 min, o desde aquí con `UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE aprobado_en IS NULL AND revocado_en IS NULL AND hogar_id = (SELECT id FROM hogares WHERE correo = '<correo>')` (lo mismo si se pierden todos los aparatos de `admin`); el resto, desde la oficina | pedir el enlace desde la portada y entrar (prueba de punta a punta del SMTP) | `DELETE FROM hogares WHERE correo = '<correo>'` (borrado en cascada) |
| 10b | **Llave de acceso de la oficina** (OF13; obligatoria en producción: la api no arranca con `GEMELO_OFICINA_LLAVE=no`): con el aparato ya aprobado, la oficina enseña «Dar de alta tu llave»; se crea con Windows Hello, Touch ID/Face ID, el teléfono o una llave física, y desde entonces se entra con ella. Conviene **dos llaves por cuenta** (Sistema → Llaves de acceso → «Añadir otra llave»). **Recuperación** si una cuenta pierde todas sus llaves: otro `admin`, en Sistema → «Rehabilitar el alta» (24 h; nunca la propia). Si es el **único `admin`**, desde aquí y a mano: `docker compose -f infra/compose.yml exec db psql -U gemelo_dueno -d gemelo -c "UPDATE hogares SET llave_rehabilitada_hasta = now() + interval '1 hour' WHERE correo = '<correo>' AND rol IN ('oficina', 'admin'); INSERT INTO auditoria (hogar_id, accion, detalle) SELECT id, 'oficina.llave_rehabilitada', jsonb_build_object('como', 'consola') FROM hogares WHERE correo = '<correo>'"` y entrar con un enlace en la hora siguiente (si se perdió la llave por robo, revocarla antes: `UPDATE llaves_oficina SET revocada_en = now() WHERE hogar_id = (SELECT id FROM hogares WHERE correo = '<correo>') AND revocada_en IS NULL`) | tras darla de alta, la oficina abre; `SELECT accion FROM auditoria WHERE accion LIKE 'oficina.llave%' ORDER BY id DESC LIMIT 3` | `UPDATE hogares SET llave_rehabilitada_hasta = NULL WHERE correo = '<correo>'` |
| 11 | **Copias diarias:** temporizador de systemd (ver [Copias](#copias)) | `systemctl list-timers gemelo-respaldo.timer` y una primera copia subida | `systemctl disable --now gemelo-respaldo.timer` y borrar las unidades |
| 12 | **OlivarTrack** (aparte, cuando haya token y respuestas reales grabadas): ver [Token de OlivarTrack](#token-propio-de-olivartrack-solo-lectura-decisión-17) | una sincronía `ok` | `GEMELO_OT=no` y recrear la api |

**Vuelta atrás completa** (de más a menos): quitar el bloque del borde y recargar (paso 7) → `docker compose -f infra/compose.yml down` → si no hay nada que guardar, `down -v`, `docker image rm gemelo-api:0.2.0` y las carpetas del paso 1 → revocar el token de OlivarTrack y cambiar la clave del buzón → quitar el registro DNS. El vecino no se toca en ningún paso salvo el 7.

### Secretos (paso 2)

Se escriben desde una sesión `ssh` en el VPS, sin pasar por el repo, un chat, un agente, el correo ni el historial de la shell. Los generados:

```sh
cd /etc/gemelo/secretos && umask 077
openssl rand -base64 32 > pg_dueno; openssl rand -base64 32 > pg_api; openssl rand -base64 48 > sesion_secreto
openssl rand -base64 48 > livekit_secreto   # API secret de LiveKit; el compose exige el fichero aunque la presencia esté apagada
printf '%s: %s\n' gemelo-livekit "$(cat livekit_secreto)" > livekit_claves   # el mismo par para el servidor LiveKit (el nombre va también en GEMELO_LIVEKIT_CLAVE)
```

`livekit_secreto` es el *API secret* de LiveKit: la api firma con él los tokens de la sala y el servidor (perfil `presencia`) lee el mismo par de `livekit_claves` con su opción `key_file` (LiveKit se niega a arrancar si el fichero tiene permisos para «otros»). Mientras `/etc/gemelo/entorno` no traiga `GEMELO_LIVEKIT_URL`, la api no lo lee. Rotarlo es reescribir el fichero y recrear la api (y LiveKit): los tokens viejos dejan de valer al momento, y quien esté dentro sigue hasta que se reconecte **[NO PROBADO]**.

Los que vienen de fuera (clave del buzón, token de OlivarTrack), pegados sin eco: `sudo bash -c 'umask 077; read -rs v; printf %s "$v" > /etc/gemelo/secretos/smtp_clave'` (igual `ot_token` y `vigia_token`; hasta tener cada token, `echo no > ot_token`, `echo no > vigia_token`, `GEMELO_OT=no` y `GEMELO_VIGIA=no`: el compose exige que los ficheros existan).

**Permisos [NO PROBADO]:** sin Swarm, Docker monta cada secreto como el fichero del anfitrión, con su dueño y sus permisos (en Docker Desktop no se notó). Las imágenes no corren como root (paso 14 de la lista previa), así que un `0400` de root **no lo podrían leer**. Con los uid supuestos:

```sh
chown 1000:70 pg_dueno pg_api && chmod 0440 pg_dueno pg_api        # db (uid 70) y migra/api (uid 1000)
chown root:1000 sesion_secreto smtp_clave ot_token vigia_token livekit_secreto livekit_claves && chmod 0440 sesion_secreto smtp_clave ot_token vigia_token livekit_secreto livekit_claves
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
| `GEMELO_CORREO_AVISOS`, `GEMELO_CORREO_REINTENTOS`, `GEMELO_CORREO_AVISOS_CADA_SEG` | los avisos de la campana y los `.ics` de la Agenda por este mismo buzón (OF11c, [avisos-correo.md](../../contratos/avisos-correo.md)): `si`, `5`, `60`. `GEMELO_CORREO_AVISOS=no` los apaga sin tocar el enlace mágico. **No probado** contra el buzón real |

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

## Puertos de LiveKit (perfil `presencia`)

LiveKit es la excepción de ADR-0011, resuelta en [ADR-0027](../adr/0027-livekit-en-produccion-puertos-publicados.md). **Hasta arrancar ese perfil no se publica nada.** El riesgo con `ufw` y cómo comprobar que no afecta a los vecinos: [DESPLIEGUE-V2](DESPLIEGUE-V2.md#livekit-y-ufw).

| Puerto | Para qué | Cómo |
|---|---|---|
| 7880/tcp | señalización (WebSocket) | **no** se publica: va por el borde y el Caddy interno, `wss://gemelo.canoydamas.es/rtc` |
| 7881/tcp | ICE por TCP (redes que cortan UDP) | publicado por Docker |
| 7882/udp | medios (un solo puerto multiplexado, `infra/livekit.yaml`) | publicado por Docker |
| TURN | solo si hiciera falta para redes muy cerradas | no se despliega (decisión 165) |

Docker publica esos dos puertos saltándose `ufw`: las reglas `ufw allow` no los abren ni los cierran. El cortafuegos de red de OVH, si está activo, sí los filtra. **Vuelta atrás:** `docker compose -f infra/compose.yml --profile presencia stop livekit` y `… rm -f livekit`: las reglas de Docker desaparecen con el contenedor.

## El hornero de olivos (O7f) **[NO DESPLEGADO, NO PROBADO en el VPS]**

El servicio `hornero` de `infra/compose.yml` (ADR-0018 § 4) hornea las variantes de olivos de la finca en `/srv/gemelo/publicado/teselas/<finca>/olivos/`, que Caddy ya sirve (O7d). Está en el perfil `hornero`: **un `up -d` normal no lo arranca**; hasta que Antonio lo decida no se despliega.

- **Antes de arrancarlo:** crear la carpeta de salida con dueño uid 1000 (`sudo install -d -o 1000 -g 1000 /srv/gemelo/publicado/teselas/hituelo/olivos`), con el índice de Hituelo ya publicado en `…/teselas/hituelo/`. El índice se monta de solo lectura; el contenedor solo escribe en `olivos/` y en su volumen `hornero_estado` (`estado.json`, candado y latido, que no se sirven).
- **Arrancar:** `docker compose -f infra/compose.yml --profile hornero up -d --build hornero`; ver: `docker compose -f infra/compose.yml logs -f hornero` y `… exec hornero node tuberia/olivos/salud.mjs`.
- **Política (decisión de Antonio): no hay vuelta diaria.** Una vuelta al arrancar (idempotente: con todo al día no escribe nada) y después **duerme hasta el próximo cambio del par época actual/siguiente** del calendario (`contratos/epocas-calendario.json`), ese día a las 03:00 UTC (`GEMELO_HORNERO_HORA`). Mientras duerme, cada 10 min (`GEMELO_HORNERO_COMPRUEBA_S`) mira sellos baratos —fecha y tamaño del `indice.json`, huella del calendario, `GEN_VERSION`/`CACHE_VERSION`/formato frente al manifiesto— y solo si alguno cambió vuelve a hornear. Un candado por finca (en el volumen de estado) impide dos hornos a la vez; un fallo se reintenta a los 5 min (`GEMELO_HORNERO_REINTENTO_S`).
- **Salud:** el healthcheck lee el estado: sano si la última vuelta terminó en `listo` (con «durmiendo hasta <fecha>»), o está en curso y se movió hace menos de 15 min; enfermo si acabó en `error`, está atascada o el servicio dejó de latir.
- **Impostores:** la imagen de este servicio (alpine) no los hornea: conserva los del manifiesto mientras sigan valiendo. Se hornean en el equipo de trabajo ([DATOS](DATOS.md#hornear-hituelo-real-y-medir-un-paseo-o7h)) y se publican; `tuberia/olivos/Dockerfile.impostores` existe pero está **sin construir ni probar**.
- **Sin puertos y sin salida a Internet** (red `bd`, interna), usuario 1000, sistema de ficheros de solo lectura, sin capacidades, 512 MB. Memoria y tiempo con Hituelo real en el VPS: **sin medir**.

## Volúmenes (qué guardan, cómo se copian y se restauran)

Todos son volúmenes con nombre de Docker del proyecto `gemelo` (`docker volume ls`: `gemelo_<nombre>`); ninguno se versiona.

| Volumen | Lo monta | Qué guarda | Copia | Si se pierde |
|---|---|---|---|---|
| `pg_datos` | `db` (`/var/lib/postgresql`) | la base: hogares, hazas, olivos, medios (descripción), configuración versionada | `infra/respaldo.sh`: `pg_dump` cifrado con `age` → `rclone` fuera del VPS | restaurar la copia (abajo) |
| `medios` (V7) | `api` en `/datos/medios` (escribe, uid 1000) | las **fotos de los hogares** (`GEMELO_MEDIOS`; nombre al azar `<32 hex>.webp\|jpg\|png`, ya re-codificadas por sharp) | `infra/respaldo.sh`: `tar` dentro del contenedor `api` → `age` → `rclone` (`gemelo-medios-<sello>.tar.age`, con su `.sha256`); `GEMELO_RESPALDO_MEDIOS=no` la omite | las filas de `medios` quedan apuntando a nada: restaurar la copia de medios del mismo sello |
| `config_publicada` (V10) | `api` en `/datos/config` (escribe `publicada.json`) y `hornero` en `/config` (solo lectura) | el cuerpo de la configuración **publicada** desde la oficina (`GEMELO_CONFIG_SALIDA`; el hornero lee de ahí el calendario de épocas, `GEMELO_HORNERO_CONFIG`) | **ninguna propia**: la verdad es `config_versiones` en la base; el fichero se rehace publicando de nuevo desde la oficina. Sin él, el hornero usa el calendario de `contratos/epocas-calendario.json` | el hornero vuelve al calendario del contrato hasta la próxima publicación |
| `hornero_estado` | `hornero` (`/estado`) | estado.json por finca, candado, latido | ninguna: se recalcula en la primera vuelta | una vuelta completa de más |
| `caddy_datos`, `caddy_config` | `web` | estado de Caddy (sin TLS propio: el borde termina TLS) | ninguna | nada |

- **Orden de la copia:** primero la base, luego los medios (la foto subida entre las dos es huérfana inofensiva; al revés habría filas sin foto). La api borra los huérfanos al barrer.
- **Restaurar la base:** `docker compose -f infra/compose.yml stop api web`; descifrar (`age --decrypt -i <clave-privada>`) y `pg_restore --clean --if-exists` sobre la base `gemelo` con el dueño; `up -d`. Se ensaya aparte con `infra/ensayar-restauracion.sh`.
- **Restaurar los medios:** con la `api` parada, vaciar y rellenar el volumen: `age --decrypt -i <clave-privada> gemelo-medios-<sello>.tar.age | docker run --rm -i -v gemelo_medios:/datos/medios --entrypoint sh <imagen gemelo-api> -c 'tar -xf - -C /datos/medios'` y comprobar el dueño (`chown -R 1000:1000`, uid de `node`); luego `up -d api`. El ensayo (`infra/ensayar-restauracion.sh`) descifra y desempaqueta la copia de medios del mismo sello **fuera del VPS** y comprueba que cada foto que describe la base restaurada está en ella.
- **Tamaño:** estimado, no medido con fotos reales (cientos de KB por foto, ≤ 1600 px). Mirarlo con `docker system df -v`; el disco decide el plazo de retención (`GEMELO_MEDIOS_RETENCION_DIAS`).
- **Subida de fotos y Caddy:** el borde y el Caddy interno dejan pasar `POST /api/medios` hasta **9 MB**; `PUT /api/admin/fincas/<finca>/contorno`, hasta **5 MB** (la api admite 4 MiB); el resto de `/api/*` sigue en 2 MB (borde) y 1 MB (interno). Si se sube `GEMELO_MEDIOS_MAX_MB` por encima de 8, subir `max_size` de `/api/medios` en `infra/Caddyfile` y en `infra/bloque-borde.txt` (y `limites_cuerpo_mb` en `contratos/publicacion-vps.json`); el bloque de borde hay que **volver a pegarlo** en el Caddy de Oficultor (cambió: antes era un solo `request_body 2MB`).
- **Primera vez en un VPS con la versión anterior:** los volúmenes nuevos se crean solos con el dueño `node` (el Dockerfile crea `/datos/medios` y `/datos/config`); hace falta `up -d --build` para reconstruir la imagen de la api.

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
| «Esta finca no tiene escena» o `/teselas` en 404 | el `indice.json` publicado y el empaquetado en la web deben traer `base` `/teselas/<finca>/` y su `tileset` ([DESPLIEGUE-V2](DESPLIEGUE-V2.md#fase-4-publicar-los-ficheros)) |
| La voz no abre o se queda en «conectando» | `Permissions-Policy` con `microphone=(self)`, `/rtc/` responde, `NODE_IP` es la IP pública y 7881/7882 llegan desde fuera ([LiveKit y ufw](DESPLIEGUE-V2.md#livekit-y-ufw)) |
| `livekit` no arranca: «key file others permissions must be set to 0» | permisos de `livekit_claves`: `0440` y dueño como en [Secretos](#secretos-paso-2) |
| No llega el enlace | `logs api` (evento de envío fallido), credenciales SMTP, servidor según el producto de OVH, SPF/DKIM/DMARC ([SMTP](#smtp-de-ovh-para-el-enlace-mágico)) **[NO PROBADO]** |
| «Has pedido varios enlaces» | límite por correo o IP (15 min); es lo esperado |
| La ficha avisa `ot_error` | `SELECT * FROM sincronias_ot ORDER BY id DESC LIMIT 5`; token caducado o revocado, OlivarTrack caído, o el token deja ver herramientas de escritura |
| La ficha avisa `ot_truncado` | OlivarTrack cortó la respuesta: no se borra nada; la siguiente sincronía lo completa |
| `/finca/` manda a la portada | no hay sesión (es lo esperado); si la hay, `logs api` en `/api/interno/autoriza` |

## Qué está probado y qué no

- **Probado en local (Windows 10, Docker Desktop, 2026-10-29):** las 51 pruebas de `apps/api` (21 de integración contra la imagen de PostGIS de producción); `infra/probar-caddy.sh` (32 comprobaciones de cabeceras, sesión, caché, registros y límites de cuerpo: `/api/medios` 9 MB, el resto 1 MB interno / 2 MB borde; 2026-10-30), la imagen de la api con sharp en alpine y los volúmenes de medios y configuración (`GEMELO_DOCKER=1 node pruebas/docker_v7.js`); la imagen de la api construida, migrando con el dueño y sirviendo `/api/salud` con el rol de la api, con sistema de ficheros de solo lectura y sin root; `docker compose config` del compose de producción (en Linux, sin puertos publicados); copia y ensayo de restauración con datos sintéticos; `infra/comprobar-despliegue.sh` contra un servidor falso en 127.0.0.1 (sin TLS ni `--en-vps`).
- **[NO PROBADO]:** LiveKit de producción (perfil `presencia`, `key_file`, `NODE_IP`), los topes de memoria con carga real, el VPS, el borde real de Oficultor, el certificado, los permisos de los secretos con un Docker de Linux, el SMTP de OVH y los registros SPF/DKIM/DMARC, el MCP real de OlivarTrack (las formas de respuesta son supuestas) y su token, `age`/`rclone` reales, el temporizador de copias, `comprobar-despliegue.sh` contra el servidor real y con `--en-vps`, y cualquier dispositivo real (iPhone, Quest).
