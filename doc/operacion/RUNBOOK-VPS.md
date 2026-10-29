# Runbook del VPS (fase F1a)

Cómo se pone en marcha y se opera el servidor del gemelo en el VPS de OVH, como inquilino del borde de Oficultor ([ADR-0011](../adr/0011-alojamiento-en-el-vps-de-ovh.md)). Contrato de lo que se despliega: [contratos/publicacion-vps.json](../../contratos/publicacion-vps.json). Sesión: [ADR-0013](../adr/0013-enlace-magico-y-sesiones.md); ficha: [ADR-0014](../adr/0014-proyeccion-publica-por-haza.md).

> **Nada de esto se ha ejecutado todavía en el VPS.** Todo lo de abajo está probado en local con Docker (ver «Qué está probado») salvo lo marcado **[NO PROBADO]**. Cada paso que despliega, publica o toca el borde **lo decide Antonio** (regla de oro 9).

## Piezas

| Servicio | Imagen (versión + digest en el contrato) | Qué hace |
|---|---|---|
| `db` | `postgis/postgis:18-3.6-alpine` (PostgreSQL 18.6, PostGIS 3.6.4) | base; solo en la red `bd` (sin salida); volumen en `/var/lib/postgresql` |
| `migra` | `gemelo-api` (Node 24.22.1 LTS) | aplica migraciones con el usuario dueño y termina |
| `api` | `gemelo-api` | Fastify en el puerto 8000; usuario `gemelo_api` sin permisos de esquema |
| `web` | `caddy:2.11.7-alpine` | Caddy interno en 8080: estáticos, cabeceras, CSP Report-Only, `forward_auth`; en la red `borde` como `gemelo-web` |

Ningún puerto publicado: se entra solo por el Caddy de borde de Oficultor ([infra/bloque-borde.txt](../../infra/bloque-borde.txt)). LiveKit (`livekit/livekit-server:v1.13.11`) es de la fase 2 y no está en el compose de producción.

**Versiones comprobadas el 2026-10-29** en su fuente: imágenes en Docker Hub (las mismas que `infra/dev`), Node en nodejs.org (24 es LTS en mantenimiento hasta 2028-04-30; la 26 pasó a LTS activa el 2026-10-28, pero su imagen oficial con la versión LTS 26.13.0 aún no estaba publicada: **revisar y subir a la 26** cuando salga), curl 8.23.0 en curl.se (solo para `probar-caddy.sh`). Dependencias npm fijadas a versión exacta con `package-lock.json`; Python `jsonschema==4.26.0`.

## Primera puesta en marcha **[NO PROBADO en el VPS]**

1. **Usuario y carpetas** (como root): `/etc/gemelo/` (0750), `/etc/gemelo/secretos/` (0700), `/srv/gemelo/publicado/{portada,finca,teselas}`, `/var/backups/gemelo` (0700).
2. **Secretos**, cada uno en su fichero 0400 (nunca en variables ni en el repo):
   `openssl rand -base64 32 > /etc/gemelo/secretos/pg_dueno` (igual `pg_api`), `openssl rand -base64 48 > …/sesion_secreto`, la clave del buzón en `smtp_clave`, el token de OlivarTrack de **solo lectura** en `ot_token` (hasta tenerlo, un fichero cualquiera y `GEMELO_OT=no`).
3. **Entorno:** `install -m 0640 infra/entorno.ejemplo /etc/gemelo/entorno` y rellenar el buzón y el remitente.
4. **Red del borde:** `docker network inspect borde` (la crea Oficultor; si no existe, se pide, no se crea a mano).
5. **Construir y arrancar:** `docker compose -f infra/compose.yml up -d --build`. El primer arranque crea el rol `gemelo_api` (`infra/bd-inicial/01-roles.sh`), `migra` aplica `0001_inicial` y la api arranca cuando `migra` termina bien.
6. **Comprobar dentro:** `docker compose -f infra/compose.yml ps` (todo `healthy`), `docker compose exec web wget -qO- http://api:8000/api/salud` → `{"estado":"ok","bd":"ok"}`.
7. **Borde:** pegar `infra/bloque-borde.txt` en el Caddyfile de Oficultor y recargarlo (**lo hace o autoriza quien lleva Oficultor**). Comprobar desde fuera: `curl -sI https://gemelo.canoydamas.es/` (200 y las cabeceras de seguridad) y `curl -s https://gemelo.canoydamas.es/api/salud`.
8. **Hazas:** `python tuberia/hazas/carga_hazas.py --hazas <hazas.geojson> --olivos <olivos.geojson> --salida /tmp/hazas.sql` en el equipo de trabajo (los datos reales **fuera del repo**), copiar y `docker compose exec -T db psql -v ON_ERROR_STOP=1 -U gemelo_dueno -d gemelo < /tmp/hazas.sql`. Asignar las hazas a hogares desde el panel (`PUT /api/admin/hazas/{id}/hogar`).
9. **Primera cuenta de la oficina:** `docker compose exec db psql -U gemelo_dueno -d gemelo -c "INSERT INTO hogares (correo, rol) VALUES ('<correo>', 'admin')"`; el resto se da de alta desde el panel.
10. **Estáticos:** la portada en `/srv/gemelo/publicado/portada`, la web construida (`apps/web/dist`) en `/srv/gemelo/publicado/finca`, las teselas en `/srv/gemelo/publicado/teselas`.

## Operación

| Quiero… | Cómo |
|---|---|
| Ver registros | `docker compose -f infra/compose.yml logs -f api web` (JSON, sin tokens, cookies, correos ni IP completa) |
| Sincronizar OlivarTrack ya | panel (`POST /api/admin/sincronia`) o `docker compose exec api node dist/src/ot/sincroniza-cli.js` |
| Echar a alguien | panel: revocar sesiones o borrar el hogar (borrado en cascada, RGPD) |
| Actualizar la api | `git pull`, `docker compose -f infra/compose.yml up -d --build` (las migraciones nuevas las aplica `migra`) |
| Cambiar una imagen | en `infra/compose.yml`, `infra/dev/compose.yml` y `contratos/publicacion-vps.json` a la vez (lo vigila `api.test.js`), versión exacta + digest, estable |
| Pasar la CSP a obligatoria | tras unas semanas sin informes en `logs api | grep '"evento":"csp"'`, cambiar `Content-Security-Policy-Report-Only` por `Content-Security-Policy` en `infra/Caddyfile` |

## Copias

- **Diaria** con un temporizador de systemd que ejecuta `infra/respaldo.sh`: `pg_dump` → cifrado con `age` a la clave **pública** (`/etc/gemelo/respaldo.age.pub`; la privada la guarda Antonio **fuera** del VPS) → `rclone` a `GEMELO_RESPALDO_REMOTO` (otro proveedor u otra región) con comprobación. Se quedan 7 días en local.
- **Ensayo de restauración** al menos una vez al mes y tras cada migración, **fuera del VPS**: `infra/ensayar-restauracion.sh ultima <clave-privada>`; restaura en una base de usar y tirar con la misma imagen y comprueba migraciones, PostGIS, geometrías, SRID, reparto haza-parcela y permisos.
- **[NO PROBADO]** `age` y `rclone` reales (el ensayo local usó un sustituto de `age` que no cifra), la subida a Object Storage y el temporizador de systemd.

## Si algo falla

| Síntoma | Mirar |
|---|---|
| `api` no arranca | `logs migra` (¿migración fallida?) y `logs api`: un `ErrorDeConfig` dice qué variable o fichero de secreto falta |
| `/api/salud` da 503 | la base: `logs db`, espacio en disco, `pg_isready` |
| No llega el enlace | `logs api` (evento de envío fallido), credenciales SMTP, SPF/DKIM del dominio **[NO PROBADO]** |
| «Has pedido varios enlaces» | límite por correo o IP (15 min); es lo esperado |
| La ficha avisa `ot_error` | `SELECT * FROM sincronias_ot ORDER BY id DESC LIMIT 5`; token caducado o OlivarTrack caído |
| La ficha avisa `ot_truncado` | OlivarTrack cortó la respuesta: no se borra nada; la siguiente sincronía lo completa |
| `/finca/` manda a la portada | no hay sesión (es lo esperado); si la hay, `logs api` en `/api/interno/autoriza` |

## Qué está probado y qué no

- **Probado en local (Windows 10, Docker Desktop, 2026-10-29):** las 51 pruebas de `apps/api` (21 de integración contra la imagen de PostGIS de producción); `infra/probar-caddy.sh` (24 comprobaciones de cabeceras, sesión, caché y registros); la imagen de la api construida, migrando con el dueño y sirviendo `/api/salud` con el rol de la api, con sistema de ficheros de solo lectura y sin root; `docker compose config` del compose de producción (en Linux, sin puertos publicados); copia y ensayo de restauración con datos sintéticos.
- **[NO PROBADO]:** el VPS, el borde real de Oficultor, el certificado, el SMTP de OVH, el MCP real de OlivarTrack (las formas de respuesta son supuestas), `age`/`rclone` reales, el temporizador de copias, y cualquier dispositivo real (iPhone, Quest).
