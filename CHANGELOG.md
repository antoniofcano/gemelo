# Cambios

Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico. Los cambios sin publicar van arriba, en «No publicado»; la release los baja a su versión.

## [No publicado]

### Añadido
- Presencia compartida, parte sin servidor (F2): contrato de pose binaria v1 (24 B escritorio, 56 B Quest; `contratos/presencia.md`) y permisos de LiveKit de F2 solo datos (`contratos/livekit-roles.json`); módulo `26_presencia.js` con códec, interpolación y avatares de bloque instanciados con nombre, visibles con `?presencia=sim&n=…` (visitantes simulados; 5 llamadas tengas 10 o 40); guardián `presencia.test.js`. Sin la bandera se dibuja lo mismo. Sin red real; no probado en iPhone ni Quest.
- Entorno local con la api enchufada: migraciones, siembra sintética (4 hazas, 3 hogares @example.com), portada provisional, mundo en `/finca/` tras sesión y todo por https (`https://localhost:8743`); e2e del recorrido de entrada con Mailpit y Chrome (`GEMELO_DOCKER=1`).
- Los exportadores (Cerro, réplica y Hituelo) emiten `copas_id` —el id del censo de OlivarTrack si la copa está emparejada con una marca que lo trae, o uno provisional (≥ 2^31) por la posición UTM— y `copas_tipo` = −1 (ADR-0012); el emparejamiento marca↔copa corrige el desfase de la ortofoto y es uno a uno; guardián `exportadores.test.js` con datos sintéticos; numpy, scipy y pillow fijadas en `requirements.txt`.
- Contratos: el índice y la tesela se validan con `ajv` (JSON Schema 2020-12 estándar: `prefixItems`, `propertyNames`, `$defs`) en lugar del validador casero, que se retira; prueba de que los esquemas rechazan datos rotos.
- Prototipo F1d de la escena en 3D Tiles 1.1 (`tuberia/tiles3d/`): `tileset.json` + glb por tesela desde el contrato v2, terreno simplificado con meshoptimizer, ortofoto como textura, olivos como instancias GPU desde el registro, marco local georreferenciado; visor de prueba con 3DTilesRendererJS 0.5.3 + three 0.186.1 y guardián `tiles3d.test.js` (ADR-0015, Propuesto).
- Servidor de la fase F1a (sin desplegar): `apps/api` (Fastify, Node 24 LTS) con enlace mágico y sesión en Postgres (ADR-0013), hazas en GeoJSON y ficha pública con lista blanca (ADR-0014), lectura de OlivarTrack por MCP de solo lectura, RGPD y panel de la oficina; migración 0001 (PostGIS 25830); `infra/` de producción (compose sin puertos, Caddy interno con CSP Report-Only, bloque para el borde, copias cifradas con age y ensayo de restauración); `tuberia/hazas/carga_hazas.py`; contratos `api.openapi.yaml`, `haza.schema.json`, `sesion.md`, `olivartrack-sync.md`, `publicacion-vps.json`; guardián `api.test.js`; `doc/operacion/RUNBOOK-VPS.md`.
- Entorno de desarrollo local con Docker (`infra/dev/`, `npm run dev:arriba|dev:abajo|dev:estado`): Caddy con la web y `/teselas`, PostgreSQL 18 + PostGIS 3.6, LiveKit y buzón Mailpit; imágenes estables fijadas por versión y digest, puertos solo en 127.0.0.1; guardián `dev.test.js` con e2e opcional (`GEMELO_DOCKER=1`). Guía en `doc/operacion/DESARROLLO-LOCAL.md`.
- Dependencias de npm con versión exacta (regla 12): `playwright-core` 1.64.1, `three` 0.128.0, `vite` 6.4.5.
- Hueco para el constructor de olivos-tipo (F1b): interfaz `Catalogo` (`07a_catalogo.js`), columnas opcionales `copas_id`/`copas_tipo` en el índice, contrato `contratos/olivos-tipo` (esquema + reglas de glb) con un catálogo sintético y su guardián `olivos.test.js`; sin cambio visible (mismos recuentos de dibujo). Librerías: `@gltf-transform/core`, `ajv`, `gltf-validator`. ADR-0012.
- Sistema de trabajo: `CLAUDE.md`, índice de documentación (`doc/README.md`), `ESTADO`, `PLAN`, `DECISIONS-PENDING`, ADR 0001–0008, glosario, arquitectura, runbook, onboarding con la puerta, datos y publicación.
- Guardianes de proceso (`pruebas/guardianes/`, `npm run puerta`): sintaxis, higiene del repo público, versión única, documentación, contratos, build de las dos fincas con los límites de la plataforma, carga en Chrome con presupuesto de dibujo y secretos/datos.
- Contratos de datos en `contratos/` (esquemas del índice y de la tesela, interfaces del motor, límites de publicación, conectores MCP) y `doc/sistema/CONTRATOS.md`.
- Cabecera «Expone / Consume» derivada en cada módulo de `src/` (`node pruebas/contrato_modulos.js --escribe`).
- Fixture sintético determinista (`pruebas/genera_fixture.py`, Python puro): 2 teselas, una sin nube (calidad Base); y topes de dibujo en `pruebas/presupuesto.json`.
- 11 skills en `.claude/skills/`: `adr`, `documentalista`, `release`, `auditoria`, `publicar-artefacto`, `medir`, `datos-finca`, `modelado-3d`, `videojuegos`, `mundos-virtuales`, `interaccion`.
- Trabajo de WebXR recuperado de la carpeta de trabajo original: `pruebas/mock_xr.js` (WebXR simulado), `pruebas/prueba_vr.js` (prueba completa) y `doc/sistema/VR.md`; guardián `vr.test.js` (la prueba completa es opcional con `GEMELO_VR=1`).
- Arquitectura multiusuario «Cuarenta hazas» (`doc/sistema/ARQUITECTURA-MULTIUSUARIO.md`, ADR-0009 Propuesto) y agente `arquitecto-multiusuario` (`.claude/agents/`) para estudiarla.
- Monorepo y build con Vite (ADR-0010): `src/` pasa a `apps/web/motor/`, la plantilla a `apps/web/plantilla.html`, los exportadores y `datos/` a `tuberia/` y `montar_v2.py` a `tuberia/salida_artefacto/`; `apps/web/herramientas/genera_motor.mjs` y `vite.config.js` (three 0.128.0 desde npm); guardián `web.test.js`; CI de la puerta (`.github/workflows/puerta.yml`).
- ADR-0010 (monorepo y Vite) y ADR-0011 (alojamiento en el VPS de OVH como inquilino del borde); ADR-0008 enmendado (solo salida artefacto).
- Andamio: `VERSION`, `package.json`, `Makefile`, `.editorconfig`, `.nvmrc`, `requirements.txt`, `CONTRIBUTING.md`, plantillas de issue y PR.

### Cambiado
- El Caddy de producción usa `Referrer-Policy: strict-origin-when-cross-origin` (antes `no-referrer`, que rompía los formularios POST en Chrome; decisión 53).
- VR: el relieve fino del suelo se apaga en cuanto el perfil de las gafas baja por fotograma justo y se restaura al salir (decisión 24).
- three 0.186.1 en la web y en la salida artefacto (importmap desde jsDelivr, misma versión): color y luz modernos recalibrados a ojo; presupuesto de dibujo sin cambios (ADR-0016).
- Exportadores multiplataforma: las rutas de `tuberia/` se arman con `os.path.join` en vez de separadores «\» fijos; guardián `multiplataforma.test.js` (decisión 8). Sin ejecutar con datos reales fuera de Windows.
- `doc/historico/DISENO-2026-10.md` anonimizado: sin id interno, identificadores de base de datos, nombres de subfincas ni coordenadas exactas; el guardián de secretos ya no tiene excepciones (decisión 2).
- Suelo: el suelo nuevo, más realista, sustituye al anterior (`04_terreno.js`, `21_suelo.js`); ADR-0007 pasa a Aceptado. Conserva el radio de hierba del perfil VR.
- Historia de Hituelo visible: `hituelo_conv.py` emite `sin_historia = false`.
- `montar_v2.py`: en modo ficheros, con `--salida` los ficheros de apoyo se copian junto a la página (antes iban siempre a `publicar/<finca>/t/`) y con `--datos` salen de la carpeta de ese índice; la salida se escribe siempre con LF (en Windows salía con CRLF).
- `doc/DISENO.md` pasa a `doc/historico/` (foto del diseño de octubre de 2026); sus decisiones viven ahora en los ADR. `doc/MEDIDAS.md` pasa a `doc/sistema/MEDIDAS.md`.
- `doc/ESTADO.md` reescrito como único sitio de «dónde estamos»; se retira el id y el enlace del artefacto privado (el repo es público).

### Arreglado
- El botón «Entrar» del enlace mágico daba 403 en Chrome (`no-referrer` hacía que mandara `Origin: null`); ahora usa `strict-origin`.

## [0.2.0] — 2026-10-27
Punto de partida de la serie v2 (motor por teselas): el commit `ffd9719`. **[SUPUESTO]** la numeración 0.2.0 la asigna este sistema de trabajo; no hay etiqueta git (ver DECISIONS-PENDING).

### Añadido
- Motor por teselas de 256 m alineadas a múltiplos en UTM30, con niveles de detalle de terreno (1/2/8 m), olivos (L0/L1/L2) y nube LiDAR (`setDrawRange`).
- Color del suelo y NDVI en el sombreador; suelo abierto con detalle de la ortofoto.
- Cola de trabajos a rebanadas con presupuesto de ms por fotograma.
- Dos fincas: Cerro Velasco (embebido) e Hituelo (ficheros de apoyo). Historia parametrizada por finca.
- Modo VR (WebXR) con perfil de rendimiento propio, probado solo con un mock.
