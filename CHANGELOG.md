# Cambios

Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico. Los cambios sin publicar van arriba, en «No publicado»; la release los baja a su versión.

## [No publicado]

### Añadido
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
- Exportadores multiplataforma: las rutas de `tuberia/` se arman con `os.path.join` en vez de separadores «\» fijos; guardián `multiplataforma.test.js` (decisión 8). Sin ejecutar con datos reales fuera de Windows.
- `doc/historico/DISENO-2026-10.md` anonimizado: sin id interno, identificadores de base de datos, nombres de subfincas ni coordenadas exactas; el guardián de secretos ya no tiene excepciones (decisión 2).
- Suelo: el suelo nuevo, más realista, sustituye al anterior (`04_terreno.js`, `21_suelo.js`); ADR-0007 pasa a Aceptado. Conserva el radio de hierba del perfil VR.
- Historia de Hituelo visible: `hituelo_conv.py` emite `sin_historia = false`.
- `montar_v2.py`: en modo ficheros, con `--salida` los ficheros de apoyo se copian junto a la página (antes iban siempre a `publicar/<finca>/t/`) y con `--datos` salen de la carpeta de ese índice; la salida se escribe siempre con LF (en Windows salía con CRLF).
- `doc/DISENO.md` pasa a `doc/historico/` (foto del diseño de octubre de 2026); sus decisiones viven ahora en los ADR. `doc/MEDIDAS.md` pasa a `doc/sistema/MEDIDAS.md`.
- `doc/ESTADO.md` reescrito como único sitio de «dónde estamos»; se retira el id y el enlace del artefacto privado (el repo es público).

## [0.2.0] — 2026-10-27
Punto de partida de la serie v2 (motor por teselas): el commit `ffd9719`. **[SUPUESTO]** la numeración 0.2.0 la asigna este sistema de trabajo; no hay etiqueta git (ver DECISIONS-PENDING).

### Añadido
- Motor por teselas de 256 m alineadas a múltiplos en UTM30, con niveles de detalle de terreno (1/2/8 m), olivos (L0/L1/L2) y nube LiDAR (`setDrawRange`).
- Color del suelo y NDVI en el sombreador; suelo abierto con detalle de la ortofoto.
- Cola de trabajos a rebanadas con presupuesto de ms por fotograma.
- Dos fincas: Cerro Velasco (embebido) e Hituelo (ficheros de apoyo). Historia parametrizada por finca.
- Modo VR (WebXR) con perfil de rendimiento propio, probado solo con un mock.
