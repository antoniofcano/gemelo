# Publicación

El gemelo **solo se sirve desde un servidor**: el entorno local de `infra/dev` y, más adelante, el VPS de OVH ([ADR-0011](../adr/0011-alojamiento-en-el-vps-de-ovh.md)). La salida artefacto (una página para claude.ai) se retiró ([ADR-0021](../adr/0021-se-retira-la-salida-artefacto-y-la-escena-de-siempre.md)); lo que ya estaba publicado en claude.ai queda como última foto, sin mantener. **Desplegar lo decide Antonio** (CLAUDE.md regla 9): un agente prepara, lista lo que sube y espera el OK.

## Qué se sirve
- La web construida con Vite (`apps/web/dist/`): la página, el motor empaquetado y three 0.186.1 incluido (sin CDN).
- Por finca, con su `indice.json` (que trae `tileset`): `t/<kx>_<ky>.json|jpg` (lo que lee `Mundo`, [CONTRATOS](../sistema/CONTRATOS.md) §1.2-1.3) y `tileset/` (`tileset.json` + glb, [TILES3D](../sistema/TILES3D.md)). Sin tileset la finca muestra «Esta finca no tiene escena».
- Caddy interno con las cabeceras y la CSP del [`infra/Caddyfile`](../../infra/Caddyfile): el motor solo hace `fetch` a su mismo origen.
- No hay límites de tamaño ni de número de ficheros de plataforma: Hituelo son 248 glb + `tileset.json` + 92 ficheros de `t/` (cifras en [MEDIDAS](../sistema/MEDIDAS.md)).

## En local
`npm run dev:arriba` ([DESARROLLO-LOCAL](DESARROLLO-LOCAL.md)): web, api y Caddy con https en `localhost:8743`; la escena la da `GEMELO_DEV_TILESET`. No es producción.

## En el VPS
Contrato de lo que se despliega: [`contratos/publicacion-vps.json`](../../contratos/publicacion-vps.json). Puesta en marcha, copias y vuelta atrás: [RUNBOOK-VPS](RUNBOOK-VPS.md). El despliegue irá por CI **con aprobación manual**. **Nada se ha ejecutado todavía en el VPS.**

## Receta resumida
1. Puerta en verde (`npm run puerta`).
2. Generar los datos y el tileset de cada finca ([DATOS](DATOS.md), skill `datos-finca`), fuera del repo.
3. Construir la web y servirla en local para mirarla con `?debug`.
4. **Pedir confirmación** a Antonio con lo que se sube.
5. Desplegar según RUNBOOK-VPS; verificar que lo servido es lo nuevo (versión leída de vuelta) y anotarlo en ESTADO.

## Qué no se publica
Datos de la explotación no destinados a ello, claves, rutas locales. Si la página lleva datos de OlivarTrack (`D.ot`), el acceso va tras la sesión de la api.
