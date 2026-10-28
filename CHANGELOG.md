# Cambios

Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico. Los cambios sin publicar van arriba, en «No publicado»; la release los baja a su versión.

## [No publicado]

### Añadido
- Sistema de trabajo: `CLAUDE.md`, índice de documentación (`doc/README.md`), `ESTADO`, `PLAN`, `DECISIONS-PENDING`, ADR 0001–0008, glosario, arquitectura, runbook, onboarding con la puerta, datos y publicación.
- Andamio: `VERSION`, `package.json`, `Makefile`, `.editorconfig`, `.nvmrc`, `requirements.txt`, `CONTRIBUTING.md`, plantillas de issue y PR.

### Cambiado
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
