# Primer despliegue en el VPS (V2)

El único documento que hay que seguir, en orden, para desplegar por primera vez en el VPS de OVH. La referencia de operación sigue en [RUNBOOK-VPS](RUNBOOK-VPS.md) y el porqué en [ADR-0011](../adr/0011-alojamiento-en-el-vps-de-ovh.md) y [ADR-0027](../adr/0027-livekit-en-produccion-puertos-publicados.md).

> **Nada de esto se ha ejecutado.** Cuándo se despliega lo decide Antonio, paso a paso (CLAUDE.md, regla 9). Este repo es público: aquí van **nombres de variables, nunca valores**, y ni la dirección del servidor ni las rutas de Oficultor. Lo que salga de las lecturas se anota fuera del repo.

## La máquina

Inspección de solo lectura de Antonio, 2026-10-31. Una foto: la fase 0 la repite.

| Qué | Hecho |
|---|---|
| Vecinos | Oficultor (`oficultor_caddy`, `oficultor_oficina`, `oficultor_n8n`, `oficultor_kuma`, `oficultor_autoheal`), Vigía (`vigia_panel`, `vigia_asistente`, `vigia_ingester`) y **Filo** (`filo`). El gemelo es el cuarto inquilino |
| Entrada web | `oficultor_caddy` (`caddy:2-alpine`) es el único que publica 80 y 443 en todas las interfaces. Los paneles de los vecinos, solo en `127.0.0.1` |
| Redes | `borde` (bridge, ya existe) y `oficultor_default` |
| Cortafuegos | `ufw` activo y solo permite OpenSSH; los 80/443 funcionan porque Docker se lo salta. El cortafuegos de red de OVH: **no se sabe** si está activo |
| Recursos | 4 núcleos, 7,8 GiB de RAM (5,8 disponibles), **sin swap**, 33 GB libres de 74. VPS en Europa, sin región concreta |

El gemelo no toca ningún contenedor vecino. Lo único compartido que cambia es añadir un bloque al Caddy de borde (fase 6), y eso lo hace o autoriza quien lleva Oficultor.

## Lo que necesita Antonio

| Qué | Cuándo hace falta | Sin ello |
|---|---|---|
| Fecha de poco uso y OK de cada fase | antes de la fase 2 | no se empieza |
| **DNS:** registro de `gemelo.canoydamas.es` al VPS, antes de tocar el borde | fase 1 | el borde gasta intentos de certificado |
| **Cuenta SMTP de OVH:** buzón propio del gemelo y qué producto lo aloja; SPF, DKIM y DMARC ([RUNBOOK-VPS](RUNBOOK-VPS.md#smtp-de-ovh-para-el-enlace-mágico)) | fase 1 | nadie puede entrar: el acceso es por correo |
| **Clave `age`:** generar el par **fuera** del VPS y guardar la privada; solo la pública va al servidor | fase 1 | no hay copias |
| **Destino de `rclone`** fuera del VPS | fase 1 | las copias se quedan en la misma máquina |
| **Secretos en el servidor**, escritos por él mismo por `ssh`; nunca por un chat ni un agente | fase 2 | no arranca |
| **Lecturas del Caddy de borde** y coordinar el pegado del bloque | fases 0 y 6 | el gemelo no se ve desde fuera |
| **Llave de acceso de la oficina** (decisión 151: obligatoria desde el primer día), dos por cuenta | fase 8 | la oficina no abre; la api no arranca con `GEMELO_OFICINA_LLAVE=no` en producción |
| **Token de Vigía** (solo lectura) y su URL del MCP | fase 12, opcional | el tiempo, apagado (`GEMELO_VIGIA=no`) |
| **Token de OlivarTrack** (solo lectura), su URL y grabar respuestas reales ([RUNBOOK-VPS](RUNBOOK-VPS.md#token-propio-de-olivartrack-solo-lectura-decisión-17)) | fase 12, opcional | sin datos en vivo (`GEMELO_OT=no`); se puede desplegar igual |
| **Mirar el cortafuegos de red de OVH** en el área de clientes | fase 13 | la voz puede no llegar, o los puertos quedar sin filtro externo |
| **Swap, sí o no** ([Memoria](#memoria-y-el-vps-sin-swap)) | antes de la fase 5 | se sigue con los topes |

**Se puede automatizar** (un agente lo prepara y Antonio lo ejecuta o lo aprueba): la puerta, construir imágenes y web, empaquetar lo publicado, `infra/comprobar-despliegue.sh`, `infra/respaldo.sh`, `infra/ensayar-restauracion.sh`. **No se automatiza:** secretos, DNS, borde, aprobar el despliegue. El CI actual no despliega: `puerta.yml` solo pasa pruebas y además está parado por la facturación (G1); este primer despliegue es a mano.

Abreviatura: `C="docker compose -f infra/compose.yml"`, desde la copia del repo en el VPS (**[SUPUESTO]** `/opt/gemelo`).

## Fase 0: lecturas en el servidor

Solo miran. Cualquier sorpresa: se para y se pregunta; no se arregla nada del vecino.

**El Caddy de borde.** Comprobado el 2026-10-31: su configuración es `/opt/oficultor/caddy/Caddyfile`, montada como **fichero suelto** y de solo lectura en `/etc/caddy/Caddyfile`. Falta saber cómo se recarga. Estas órdenes lo dicen:

```sh
docker inspect oficultor_caddy --format '{{json .Mounts}}'                                # dónde está su Caddyfile en el anfitrión
docker inspect oficultor_caddy --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'   # su proyecto de compose
docker inspect oficultor_caddy --format '{{json .Config.Cmd}}'                            # con qué orden arranca
docker exec oficultor_caddy caddy version
docker exec oficultor_caddy cat /etc/caddy/Caddyfile                                      # si la ruta del mount es otra, esa
docker exec oficultor_caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile   # mira que hoy valide
```

De esa salida hay que anotar, fuera del repo:

- **Si admite `caddy reload`.** Con `admin off` en las opciones globales, no; entonces manda el procedimiento de Oficultor.
- **Si el Caddyfile es un fichero montado suelto.** Un editor que sustituya el fichero cambia su inodo y el contenedor seguiría viendo el viejo.
- **Si tiene ya un bloque `gemelo.canoydamas.es`.**
- **Si tiene opciones globales que afecten a todos los sitios** (cabeceras comunes, `email`).
- **Si escribe registros de acceso, y con qué formato.** Las URL llevan tokens: `?t=` del enlace y de la baja, `?access_token=` de LiveKit. El Caddy interno los redacta; el de borde, **no se sabe**. Si los registra sin filtrar, hay que proponerle a Oficultor el mismo filtro antes de abrir a nadie.
- **Quién lo lleva** y si hay que avisar antes.

**El resto:**

```sh
docker network inspect borde --format '{{range .Containers}}{{.Name}} {{end}}'   # que esté oficultor_caddy; quién más hay (¿filo?)
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'       # línea base: se guarda para comparar
docker compose ls; docker volume ls --filter name=gemelo; docker image ls 'gemelo-*'   # sin nada del gemelo
docker inspect oficultor_autoheal --format '{{json .Config.Env}}'                # ver «autoheal» abajo
uname -m; docker version --format '{{.Server.Version}}'; docker compose version; timedatectl | grep -i sync
df -h / /var/lib/docker; free -h
sudo ss -tulpn | grep -E ':(7881|7882)\b'                                        # vacío: los puertos de LiveKit están libres
cat /etc/docker/daemon.json 2>/dev/null                                          # con "iptables": false, lo dicho de ufw cambia: parar y preguntar
dig +short A gemelo.canoydamas.es; dig +short AAAA gemelo.canoydamas.es; dig +short CAA canoydamas.es
```

El resto de la lista previa, en [RUNBOOK-VPS](RUNBOOK-VPS.md#lista-de-comprobación-previa-solo-mirar-no-cambia-nada). Sobre todo los uid de las imágenes (paso 14): los permisos de los secretos dependen de ellos.

**`autoheal`.** Comprobado el 2026-10-31: `AUTOHEAL_CONTAINER_LABEL=autoheal`, así que solo actúa sobre los contenedores con la etiqueta `autoheal=true`. El compose del gemelo **no pone esa etiqueta** y no le afecta: un reinicio en mitad de una migración o de un horneado no conviene. Tampoco se añade la etiqueta por iniciativa propia: el gemelo se recupera con `restart: unless-stopped` y su fallo se ve en Kuma (fase 11).

## Memoria y el VPS sin swap

Sin swap, si la máquina se queda sin memoria el OOM killer puede matar a un vecino. Por eso **todos** los servicios llevan `mem_limit` en el compose (lo vigila `api.test.js`): quien se pase muere él solo.

| Servicio | Tope **[SUPUESTO]** hasta medir | Nota |
|---|---|---|
| `db` | 1 GiB | en local corre con 512 MB; `shm_size` 256 MB |
| `api` | 512 MiB | sharp re-codifica fotos en memoria |
| `web` | 256 MiB | |
| `livekit` | 512 MiB | solo con perfil; con voz, **sin medir** (F3h) |
| `hornero` | 512 MiB | solo con perfil; con Hituelo real, **sin medir** |
| `migra` | 256 MiB | efímero |

En el peor caso suman unos 3 GiB frente a 5,8 disponibles. Se miden con `docker stats --no-stream` tras el primer paseo y otra vez con visita, y se ajustan en un commit.

**Lo que más memoria gasta no es servir, es construir.** `npm ci` y `tsc` no tienen tope en un `docker build`. Por eso las imágenes se construyen **fuera del VPS** (fase 3).

**Swap: recomiendo un fichero pequeño, de unos 2 GiB y con `vm.swappiness` bajo, pero es decisión de Antonio** porque afecta a toda la máquina. Evita que un pico ajeno, cuyos topes no conocemos, acabe en una muerte súbita. No sustituye a los topes: y con swap, cada contenedor podrá usar además otro tanto de swap salvo que se fije `memswap_limit`. No es condición para desplegar.

## Fase 1: preparar fuera del servidor

| Qué | Comprobación | Vuelta atrás |
|---|---|---|
| Puerta en verde en el commit elegido: `npm run puerta:pesada`, y anotar ese commit. `GEMELO_DOCKER=1 bash infra/probar-caddy.sh` por el banco | sin rojos | ninguna |
| DNS del dominio, MX/SPF/DKIM/DMARC, buzón | `dig` de la fase 0 | quitar el registro |
| Par de `age`, destino de `rclone` | `rclone lsd <remoto>` | borrar |
| Copiar la configuración (`rclone config`) al VPS con permisos `0600` | `rclone lsd` desde el VPS | borrar |

## Fase 2: carpetas, secretos y entorno

Nada visible desde fuera. Detalle de cada orden en [Secretos](RUNBOOK-VPS.md#secretos-paso-2).

| Qué | Comprobación | Vuelta atrás |
|---|---|---|
| Copia del repo en el commit acordado, en `/opt/gemelo` | `git rev-parse HEAD` | `rm -r /opt/gemelo` |
| Carpetas: `/etc/gemelo`, `/etc/gemelo/secretos`, `/var/backups/gemelo`, `/srv/gemelo/publicado/{portada,finca,oficina,teselas,avatares}` (paso 1 del runbook) | `ls -ld` | borrarlas |
| **Ocho** ficheros en `/etc/gemelo/secretos`: `pg_dueno`, `pg_api`, `sesion_secreto`, `smtp_clave`, `ot_token`, `vigia_token`, `livekit_secreto`, `livekit_claves`. Los dos tokens, con `no` hasta tenerlos | `ls -l`: ninguno vacío ni legible por «otros» | `shred -u` |
| `install -m 0640 infra/entorno.ejemplo /etc/gemelo/entorno`; rellenar `GEMELO_SMTP_*`, `GEMELO_CORREO_REMITENTE`, `GEMELO_RESPALDO_*`. Se dejan `GEMELO_OT=no`, `GEMELO_VIGIA=no` y `GEMELO_OFICINA_LLAVE=obligatoria` | `grep -c ejemplo.invalid /etc/gemelo/entorno` da 0 | `rm /etc/gemelo/entorno` |

El dominio de `GEMELO_URL_PUBLICA` debe ser el definitivo: las llaves de acceso quedan atadas a él y cambiarlo obliga a darlas de alta otra vez.

## Fase 3: imágenes, construidas fuera

En el equipo de trabajo, con la misma arquitectura que dijo `uname -m`:

```sh
docker build -f apps/api/Dockerfile -t gemelo-api:0.2.0 .
docker build -f tuberia/olivos/Dockerfile -t gemelo-hornero:0.2.0 .
docker save gemelo-api:0.2.0 gemelo-hornero:0.2.0 | gzip > gemelo-imagenes.tar.gz   # no lleva secretos ni datos
```

Se copia al VPS y `gunzip -c gemelo-imagenes.tar.gz | docker load`.

- **Comprobación:** `docker image ls 'gemelo-*'`.
- **Vuelta atrás:** `docker image rm gemelo-api:0.2.0 gemelo-hornero:0.2.0`. **Nunca** `docker system prune`: borraría también lo de los vecinos.

## Fase 4: publicar los ficheros

Se prepara todo en una carpeta del equipo de trabajo, **fuera del repo**, con la misma forma que `/srv/gemelo/publicado`, y se sube con `rsync`.

| Carpeta | De dónde sale |
|---|---|
| `portada/` | `cd apps/web && npm run build:portada` → `dist-portada/` |
| `oficina/` | `npm run build:oficina` → `dist-oficina/` |
| `finca/` | `GEMELO_DATOS=<indice publicado> npm run build` → `dist/` |
| `teselas/hituelo/` | `indice.json`, `t/` de la exportación y `tileset/` de `tuberia/tiles3d/genera.mjs` ([DATOS](DATOS.md)) |
| `teselas/hituelo/olivos/` | horneado en el equipo de trabajo, **con impostores** ([O7h](DATOS.md#hornear-hituelo-real-y-medir-un-paseo-o7h)): `manifiesto.json`, `.br` y `.webp`. Se copian los objetos primero y el manifiesto el último. La carpeta debe ser del uid 1000 |
| `avatares/` | `descarga.mjs` y `construye.mjs` ([DESARROLLO-LOCAL](DESARROLLO-LOCAL.md#los-avatares-vrm-p7b)): `catalogo.json`, cada `.vrm` y sus `.br`/`.zst`/`.gz` |

**El índice publicado no es el exportado:** debe llevar `base` y `tileset` del servidor, y la web se construye contra ese mismo índice (lo mismo que hace `levanta.mjs` en local):

```sh
node -e 'const f=process.argv[1],fs=require("fs"),d=JSON.parse(fs.readFileSync(f));d.base="/teselas/hituelo/";d.tileset=d.base+"tileset/tileset.json";fs.writeFileSync(f,JSON.stringify(d))' <copia de indice.json>
```

- **Comprobación:** `find /srv/gemelo/publicado ! -perm -o+r` vacío; `du -sh /srv/gemelo/publicado` frente a los 33 GB libres.
- **Vuelta atrás:** vaciar las carpetas. No ha arrancado nada.

Solo Hituelo: es el único mundo (decisión 22). Son datos de la explotación tras sesión, no se abren en ningún otro sitio.

## Fase 5: arrancar

```sh
$C config -q                         # el compose se lee bien
$C up -d --no-build                  # db, migra, api, web. Ni hornero ni LiveKit
```

El primer arranque crea `gemelo_api` y `migra` aplica las 17 migraciones en orden, hacia arriba y cada una en su transacción. Todas sobre una base vacía: las únicas que tocan filas (`0004`, que congela ids de olivo, y `0010`, que crea la versión inicial de cada haza) no tienen nada que tocar. La más lenta es `0001`, por `CREATE EXTENSION postgis`: **[NO PROBADO]** en este disco.

| Comprobación | Vuelta atrás |
|---|---|
| `$C ps -a`: `db` y `api` en `healthy`, `migra` en `exited (0)` | `$C down` conserva la base |
| `$C exec web wget -qO- http://api:8000/api/salud` → `{"estado":"ok","bd":"ok"}` | `$C down -v` la borra: **solo** sin datos reales |
| `docker ps`: los vecinos, igual que la línea base; `free -h` con margen | |

## Fase 6: el borde

Lo hace o lo autoriza quien lleva Oficultor, con el procedimiento que hayan dado las lecturas de la fase 0.

1. Copia del Caddyfile de borde, junto a él, y comparar con `cmp`.
2. Añadir [infra/bloque-borde.txt](../../infra/bloque-borde.txt) tal cual. **No lleva variables.**
3. `caddy validate`. Solo si valida, recargar como corresponda. Si no valida, no se recarga: el borde sigue como estaba.

**Comprobación, desde fuera:**

```sh
GEMELO_VECINOS="<webs de Oficultor, Vigía y Filo>" bash infra/comprobar-despliegue.sh
bash infra/comprobar-despliegue.sh --en-vps     # en el VPS, con sudo para que mire los secretos
```

Solo lee. Mira certificado, cabeceras (sin repetir por el borde), `/api/salud`, lo cerrado, que `/api/avisos/baja` llega sin sesión, las 17 migraciones, los roles de la base y que los registros no llevan credenciales.

**Vuelta atrás:** restaurar la copia, validar, recargar. El gemelo deja de verse y los vecinos quedan como estaban.

## Fase 7: copia y ensayo de restauración

Antes de meter ningún dato real.

| Qué | Comprobación | Vuelta atrás |
|---|---|---|
| `sudo bash infra/respaldo.sh` | el `.dump.age` y el `.tar.age` de medios, en local y en `rclone ls` | borrarlos |
| **Fuera del VPS**, donde está la clave privada: `infra/ensayar-restauracion.sh ultima <clave-privada>` | «ensayo de restauración: todo bien» | el ensayo nunca toca producción |

Es la primera vez que se usan `age` y `rclone` reales: el ensayo en local fue con un sustituto. Sin este paso en verde no se cargan datos.

## Fase 8: la cuenta de la oficina y su llave

Pasos 10 y 10b del [runbook](RUNBOOK-VPS.md#primera-puesta-en-marcha-no-probado-en-el-vps), con un correo **aparte** del de cualquier hogar (decisión 106).

| Qué | Comprobación | Vuelta atrás |
|---|---|---|
| Crear la cuenta `admin` con `psql`, pedir el enlace en la portada | llega el correo: `spf`, `dkim` y `dmarc` en `pass`, y no cae en spam | `DELETE` de la cuenta |
| Aprobar el aparato | la oficina deja de decir «pendiente» | |
| **Registrar la llave (decisión 151)**, y una segunda en otro aparato | la oficina abre; `oficina.llave…` en `auditoria` | [recuperación](RUNBOOK-VPS.md#primera-puesta-en-marcha-no-probado-en-el-vps), paso 10b |

Llaves reales: **no probadas** hasta ahora (solo el autenticador simulado).

## Fase 9: las hazas

Con la copia de la fase 7 hecha. Contorno de la finca ([DATOS](DATOS.md#contorno-de-la-finca-of3b-y-of3c-decisiones-140-y-143)) y hazas, dibujadas en la oficina o cargadas con el paso 9 del runbook. Los ficheros, **fuera del repo**, y `shred -u` del SQL al terminar.

- **Comprobación:** `SELECT count(*) FROM hazas` y verlas en la oficina.
- **Vuelta atrás:** restaurar la copia.

## Fase 10: primer paseo

Con una cuenta de prueba, en un navegador de escritorio con `?debug`:

1. Entrar por enlace y aceptar las normas.
2. Entrar en `/finca/`: escena de Hituelo, sin errores de consola.
3. Con `?olivos=gen`, la escalera y los impostores: `/teselas/hituelo/olivos/manifiesto.json` en 200.
4. Elegir avatar: `/avatares/catalogo.json` en 200.
5. Mirar la consola por informes de CSP y `$C logs api | grep '"evento":"csp"'`. Se esperan los de las fuentes de Google.
6. Repetir `infra/comprobar-despliegue.sh` y anotar `docker stats --no-stream`.

**Comprobación de que lo servido es lo nuevo:** comparar la versión de la página con la del commit, y anotarlo en ESTADO. **Vuelta atrás completa:** quitar el bloque del borde → `$C down` → sin datos que guardar, `down -v` y borrar imágenes y carpetas → revocar tokens y cambiar la clave del buzón → quitar el DNS.

## Fase 11: copias diarias y vigilancia

| Qué | Comprobación | Vuelta atrás |
|---|---|---|
| Temporizador de systemd ([Copias](RUNBOOK-VPS.md#copias)), a una hora distinta de las copias de los vecinos | `systemctl list-timers gemelo-respaldo.timer` | `systemctl disable --now` |
| **Uptime Kuma (recomendado):** un monitor HTTP sobre `https://gemelo.canoydamas.es/api/salud` con la palabra clave `"bd":"ok"`. Es `/api/salud`, no `/salud`: esa solo existe en local. Hace cruzar por el borde, así que también avisa si este falla. Lo añade quien lleve Kuma | el monitor en verde | borrarlo |
| Ensayo de restauración mensual y tras cada migración | | |

## Fase 12: hornero, Vigía y OlivarTrack

Cada uno aparte, cuando Antonio lo decida. El gemelo funciona sin ellos.

| Qué | Comprobación | Vuelta atrás |
|---|---|---|
| **Hornero:** `$C --profile hornero up -d --no-build hornero`. Mantiene las variantes al cambiar el calendario; los impostores se conservan del manifiesto. **Sin medir** con Hituelo real en esta máquina: se arranca en la ventana, mirando `docker stats` | `$C exec hornero node tuberia/olivos/salud.mjs`; Sistema, en la oficina | `$C --profile hornero stop hornero` y `rm`; lo publicado sigue sirviéndose |
| **Vigía:** token en `vigia_token`; en el entorno, `GEMELO_VIGIA=mcp` y `GEMELO_VIGIA_MCP_URL`; `$C up -d --no-deps --force-recreate api` | `GET /api/tiempo` con sesión; el HUD con dato real y su fecha | `GEMELO_VIGIA=no`, `echo no > vigia_token`, recrear la api |
| **OlivarTrack:** [su sección](RUNBOOK-VPS.md#token-propio-de-olivartrack-solo-lectura-decisión-17). Primero grabar respuestas reales y ajustar `ot/mapeo.ts`: las de hoy son supuestas | una sincronía `ok`, ninguna «herramientas de escritura» | `GEMELO_OT=no`, recrear la api; revocar en OlivarTrack |

## Fase 13: LiveKit (presencia y voz)

Solo cuando se quiera probar, y después de leer lo siguiente.

### LiveKit y ufw

Es lo único del gemelo que publica puertos: `7881/tcp` y `7882/udp` ([ADR-0027](../adr/0027-livekit-en-produccion-puertos-publicados.md)). La señalización va por `/rtc`, como la web.

**El riesgo.** Docker escribe sus reglas por delante de `ufw`, igual que hoy con los 80/443 del borde. Consecuencias:

- Esos dos puertos quedarán **abiertos a Internet aunque `ufw status` no los liste**, y `ufw deny` no los cierra. `ufw status` no dice la verdad sobre ellos.
- Por eso un `ufw allow` no hace falta ni sirve. Tampoco se añaden reglas a la cadena `DOCKER-USER`: es compartida con los vecinos.
- Filtrar fuera de la máquina solo puede hacerlo el cortafuegos de red de OVH. **No se sabe si está activo**: Antonio lo mira en el área de clientes. Si lo está, hay que permitir esos dos puertos y comprobar que siguen los de los vecinos.
- LiveKit queda expuesto directamente: su versión hay que mantenerla al día. Solo admite conexiones con token firmado por la api.

**Por qué no afecta a los vecinos** si se hace así: publicar puertos no reinicia Docker ni a nadie; LiveKit no entra en la red `borde`, tiene su tope de memoria y usa dos puertos que la fase 0 vio libres. **Nunca se reinicia el demonio de Docker** ni se toca `daemon.json`: eso sí afectaría a todos.

**Cómo se comprueba:**

```sh
# antes, en el VPS
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | sort > /tmp/antes.txt
sudo iptables -S DOCKER-USER > /tmp/antes-user.txt; sudo ufw status > /tmp/antes-ufw.txt
# antes, desde fuera
nmap -Pn -p 1-10000 gemelo.canoydamas.es
```

Después de arrancar, repetir y comparar: en `docker ps` solo cambia la línea nueva del gemelo y ningún vecino cambia su tiempo en marcha; `DOCKER-USER` y `ufw` idénticos; desde fuera, solo aparece de más el 7881. El UDP no se demuestra con un sondeo: lo demuestra la prueba de voz (abajo). Las webs de `GEMELO_VECINOS` siguen respondiendo.

### Encenderlo

En `/etc/gemelo/entorno`: `GEMELO_LIVEKIT_URL=http://livekit:7880`, `GEMELO_LIVEKIT_URL_PUBLICA=/rtc`, `GEMELO_LIVEKIT_CLAVE` y `NODE_IP` (la IP pública del VPS; sin ella los medios no llegan). Luego:

```sh
$C --profile presencia up -d livekit
$C up -d --no-deps --force-recreate api
GEMELO_CON_LIVEKIT=1 bash infra/comprobar-despliegue.sh --en-vps
```

- **Comprobación:** dos aparatos en redes distintas, uno por datos móviles: se ven, y en una visita guiada de prueba el guía se oye.
- **Vuelta atrás:** `$C --profile presencia stop livekit`, `… rm -f livekit`, quitar `GEMELO_LIVEKIT_URL` y recrear la api. Las reglas de Docker se van con el contenedor.

**No probado:** LiveKit fuera del equipo, `key_file` en la práctica, un operador que corte UDP. **Sin TURN** (decisión 165, sin cerrar).

## Antes de enseñarlo y antes de abrirlo

### Bloqueantes antes de enseñarlo a un grupo de confianza

Personas de confianza, avisadas de que es una prueba y con cuentas que se pueden borrar.

- [ ] Fases 0 a 11 en verde, incluido el **ensayo de restauración con `age` y `rclone` reales**.
- [ ] **El correo llega** y no cae en spam: sin él nadie entra.
- [ ] **Llaves de acceso** de la oficina dadas de alta, dos por cuenta (decisión 151).
- [ ] **Registros del Caddy de borde** sin tokens (fase 0).
- [ ] **Lo no probado, dicho por adelantado:** **Quest y móvil sin probar**, ni fps ni comodidad; Firefox y Safari, tampoco. Se empieza en escritorio.
- [ ] **Voz solo con cuentas de prueba**: sin EIPD validada ni consentimiento (F3j), nadie real.
- [ ] **Fotos solo con cuentas de prueba** (decisión 102).
- [ ] **Decisión 21 y A6:** nada iba al VPS antes de estar probado en local. A5 está hecha; A6, la prueba en aparatos, sigue pendiente de Antonio. Desplegar antes de A6 es posible, pero ha de ser una decisión a propósito.

### Bloqueantes antes de abrir a familias

Además de todo lo anterior:

- [ ] **EIPD validada** por Antonio o su asesoría, con la decisión 165 cerrada: responsable y canal de derechos, región del VPS y contrato de encargado con OVH, TURN, personas trabajadoras. Hoy [EIPD-VOZ](../sistema/EIPD-VOZ.md) es un borrador sin valor legal.
- [ ] **Consentimiento de voz y plazo de la auditoría** escritos en código (decisiones 163-164, cerradas; tarea F3j) y las pruebas F3g y F3h (10 personas con audio).
- [ ] **Fotos** abiertas solo con esa EIPD (decisión 102).
- [ ] **Fuentes de Google fuera:** `apps/web/plantilla.html` las pide a `fonts.googleapis.com`, así que cada familia enviaría su IP a Google sin aviso. Hay que servirlas desde el mismo origen: es además la regla del repo (el motor no pide a otros hosts) y la excepción que `web.test.js` deja anotada.
- [ ] **CSP impuesta**: de Report-Only a obligatoria, tras quitar las fuentes externas y los estilos en línea de esa plantilla (`style-src 'self'` los rechazaría) y unas semanas sin informes.
- [ ] **Quest y móvil probados de verdad** en Hituelo real (P7e, O8d): fps, comodidad y mareo.
- [ ] **Carga real:** 40 visitantes sin medir (con 40 clientes se satura el i5 de desarrollo). Medir en el VPS, mirando a los vecinos.
- [ ] **Topes de memoria medidos**, ya sin **[SUPUESTO]**.
- [ ] Datos legales visibles para las familias: responsable y canal de derechos (decisión 165).
