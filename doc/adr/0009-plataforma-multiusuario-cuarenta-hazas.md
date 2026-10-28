# ADR-0009 — Plataforma multiusuario «Cuarenta hazas»

- **Estado:** Propuesto
- **Fecha:** 2026-10-28

## Contexto
El gemelo actual es una visita de una sola persona (fase 1 de [ARQUITECTURA-MULTIUSUARIO](../sistema/ARQUITECTURA-MULTIUSUARIO.md)). La visión que le da sentido es una comunidad de ~40 hogares que visitan sus hazas juntos (escritorio, móvil y Meta Quest), con voz, presencia y un corresponsal de campo que emite vídeo y GPS, sobre datos de OlivarTrack proyectados por haza. La propuesta choca con decisiones previas: teselas propias en vez de 3D Tiles ([ADR-0001](0001-teselas-256m-utm30.md), [ADR-0002](0002-niveles-de-detalle.md)), three r128 en un solo `<script>` ES5, ficheros de apoyo json/jpg por los límites de los artefactos ([ADR-0008](0008-ficheros-de-apoyo-json-jpg.md)) y «no hay servidor ni despliegue» (CLAUDE.md).

## Decisión (propuesta)
Una sola web para todos los clientes, LiveKit como única pieza de tiempo real, PostgreSQL + PostGIS con api propia, todo en Docker Compose en un VPS europeo; OlivarTrack sigue siendo la fuente de verdad, leída por su MCP con credencial de solo lectura. **Ya decidido por Antonio (2026-10-28):** Postgres propio con auth propia dentro del Docker del proyecto (no Supabase); VPS propio en OVH; dominio `gemelo.canoydamas.es`; los hogares ven las hazas ajenas en detalle. **Sin decidir:** grabación de las visitas guiadas. **Sin estudiar todavía:** encaje con el motor actual; lo hace el agente [`arquitecto-multiusuario`](../../.claude/agents/arquitecto-multiusuario.md).

## Alternativas consideradas
- **Supabase** (autoalojado o en la nube) — descartado por Antonio: más piezas, o datos fuera del VPS.
- **SQLite** — corto para publicar (geometría y un solo escritor).
- **Servidor de juego propio (Colyseus)** — innecesario hasta que haya puzles con estado compartido.
- **App nativa / Meta Store** — descartada: la web con WebXR basta.

## Consecuencias
- **Positivas:** una sola base de código; sin tienda de apps; los hogares nunca tocan OlivarTrack; PostGIS resuelve «qué olivos caen en esta haza».
- **Negativas / coste:** el motor deja de ser «un HTML de artefacto» (backend, auth, despliegue, copias, moderación); el móvil no tendrá AR; las teselas 3D son la parte más laboriosa.
- **Superaría o enmendaría (si se acepta):** la regla «no hay servidor» de CLAUDE.md, la salida a artefactos de ADR-0008 y probablemente el formato de teselas de ADR-0001/0002. Nada de esto se toca hasta tener el estudio y el visto bueno de Antonio.
- **Privacidad:** vídeo de personas trabajadoras, menores en voz abierta y datos por haza visibles a toda la comunidad exigen EIPD y contratos de proyección antes de la fase 2.

## Comprobación
Ninguna todavía: es una propuesta. Cada fase de la propuesta tiene su criterio «listo cuando»; el primero (un hogar ve su haza en Quest a 72 fps) **no está medido**.
