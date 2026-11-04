# Publicación

El gemelo **solo se sirve desde un servidor**: el entorno local de `infra/dev` y, más adelante, el VPS de OVH ([ADR-0011](../adr/0011-alojamiento-en-el-vps-de-ovh.md)). La salida artefacto (una página para claude.ai) se retiró ([ADR-0021](../adr/0021-se-retira-la-salida-artefacto-y-la-escena-de-siempre.md)); lo que ya estaba publicado en claude.ai queda como última foto, sin mantener. **Desplegar lo decide Antonio** (CLAUDE.md regla 9): un agente prepara, lista lo que sube y espera el OK.

## Qué se sirve
- La web construida con Vite (`apps/web/dist/`): la página, el motor empaquetado y three 0.186.1 incluido (sin CDN).
- Por finca, con su `indice.json` (que trae `tileset`): `t/<kx>_<ky>.json|jpg` (lo que lee `Mundo`, [CONTRATOS](../sistema/CONTRATOS.md) §1.2-1.3), `tileset/` (`tileset.json` + glb, [TILES3D](../sistema/TILES3D.md)) y `olivos/` (manifiesto, `<huella>.br` y atlas `<huella>.webp` del hornero). Sin tileset la finca muestra «Esta finca no tiene escena».
- La portada (`dist-portada`), la oficina (`dist-oficina`, tras sesión de oficina) y el catálogo de avatares (`/avatares/`, tras sesión).
- Caddy interno con las cabeceras y la CSP del [`infra/Caddyfile`](../../infra/Caddyfile): el motor solo hace `fetch` a su mismo origen.
- No hay límites de tamaño ni de número de ficheros de plataforma: Hituelo son 248 glb + `tileset.json` + 92 ficheros de `t/` (cifras en [MEDIDAS](../sistema/MEDIDAS.md)).

## Las dos builds (ADR-0031, F2c)
El motor tiene dos builds ([MULTIVIEW §4.1](../sistema/MULTIVIEW.md)): **pantalla** (three 0.186.1; `apps/web/dist/`) y **VR** (super-three, solo el Quest; `GEMELO_BUILD=vr` → `apps/web/dist-vr/`; **preparada y aún no activada**: sin `super-three` instalado y sin la prueba de humo F2 no se publica). No pueden convivir dos three en una página, así que la página de la finca **elige al cargar**: un script externo `assets/cargador-<huella>.js` (`'self'`, sin scripts en línea: la CSP no cambia) clasifica el aparato con el mismo `AparatoPuro.clasifica` del motor y aplica `eligeBuild`: el Quest carga la de VR si se publicó; `?build=pantalla|vr` fuerza una; todo lo demás, pantalla. Si la de VR no carga (404, red), cae a la de pantalla. Un fallo de la VR *después* de empezar a ejecutarse no se puede deshacer en la misma página: queda para la prueba en el Quest.

**Dónde van:** las dos dentro de la carpeta de la finca, servidas por el mismo Caddy **sin tocar su configuración**: `…/finca/` (pantalla, la raíz) y `…/finca/vr/assets/` (solo los `assets/` de la VR; xr, iconos y manifest son los mismos y salen de la raíz). `…/finca/builds.json` es el manifiesto (qué builds hay, su entrada y su huella) para leer de vuelta lo subido; el mismo manifiesto va dentro del cargador (sin petición extra).

**Protocolo de subida** (lo decide Antonio; un agente prepara y lista):
1. `cd apps/web && GEMELO_DATOS=<indice publicado> npm run build` → `dist/`.
2. Solo si la VR está activada: `npm i -E super-three@0.185.0` y `GEMELO_BUILD=vr GEMELO_DATOS=<el mismo índice> npm run build` → `dist-vr/` (el mismo índice y el mismo commit que la de pantalla).
3. `npm run build:publica` (raíz del repo; `--pantalla`, `--vr`, `--dest` si se quiere otra ruta) → `apps/web/dist-publicar/`: compone la página con el cargador, `assets/`, `vr/assets/` y `builds.json`. No toca `dist/` ni `dist-vr/`. Sin `dist-vr/` todo queda como antes (el manifiesto solo trae «pantalla»).
4. Subir **todo `dist-publicar/`** a `…/finca/` en este orden: primero `assets/` y `vr/assets/` (ficheros con huella: no pisan nada), el resto y **al final `index.html`** (es lo que activa la versión nueva). Retirar los `assets/` viejos solo cuando ya no los pida ninguna pestaña abierta.
5. Leer de vuelta `…/finca/builds.json` y comprobar que sus huellas son las del paso 3, y abrir `/finca/` y `/finca/?build=vr` (en el Quest, la de VR; en el resto debe salir la de pantalla con `?build=vr` solo si se publicó).

**Caché (propuesta, no aplicada):** `/finca/assets/*` ya es `immutable` en el Caddyfile; `/finca/vr/assets/*` no lo cubre y se sirve con validación por ETag (funciona, pero pide más). Si Antonio lo aprueba: en `infra/Caddyfile` y `infra/dev/Caddyfile`, `@inmutable path /finca/assets/* /finca/vr/assets/*`. No hace falta para publicar. La CSP y los demás encabezados valen tal cual (mismo origen, `script-src 'self'`, `worker-src 'self' blob:`).

## En local
`npm run dev:arriba` ([DESARROLLO-LOCAL](DESARROLLO-LOCAL.md)): web, api y Caddy con https en `localhost:8743`; la escena la da `GEMELO_DEV_TILESET`. No es producción.

## En el VPS
Contrato de lo que se despliega: [`contratos/publicacion-vps.json`](../../contratos/publicacion-vps.json). El primer despliegue, paso a paso: [DESPLIEGUE-V2](DESPLIEGUE-V2.md). Referencia de operación, copias y vuelta atrás: [RUNBOOK-VPS](RUNBOOK-VPS.md). El CI de hoy (`puerta.yml`) no despliega: el primer despliegue es a mano y, más adelante, irá por CI **con aprobación manual**. **Nada se ha ejecutado todavía en el VPS.**

## Receta resumida
1. Puerta en verde (`npm run puerta`).
2. Generar los datos y el tileset de cada finca ([DATOS](DATOS.md), skill `datos-finca`), fuera del repo.
3. Construir la web y servirla en local para mirarla con `?debug`.
4. **Pedir confirmación** a Antonio con lo que se sube.
5. Desplegar según [DESPLIEGUE-V2](DESPLIEGUE-V2.md); verificar que lo servido es lo nuevo (versión leída de vuelta) y anotarlo en ESTADO.

## Qué no se publica
Datos de la explotación no destinados a ello, claves, rutas locales. Si la página lleva datos de OlivarTrack (`D.ot`), el acceso va tras la sesión de la api.
