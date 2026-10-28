---
name: auditoria
description: Auditoría completa del gemelo por lentes, de solo lectura, con su ciclo entero (alcance, informes por lente, verificación, plan por tandas, re-verificación). Úsala por cadencia (antes de un hito o cada 2-3 meses) o cuando se pida; no se dispara por etiquetar una versión ni por un parche.
---

# Auditoría

Método de OlivarTrack adaptado. **Solo lectura:** audita, no arregla (los arreglos van por tandas, con su prueba). Las lentes de este proyecto están en [lentes.md](lentes.md).

**Un «10 de software»** = cero críticos, altos y medios confirmados en la re-verificación y nada sin revisar; los bajos se arreglan o se aceptan por escrito. **Un «10 de producto»** lo da el uso real (iPhone, Quest, el campo), no esta auditoría.

## Ciclo (carpeta `doc/auditoria-<mes><año>/`, viva mientras tenga algo abierto; luego a `doc/historico/`)
1. **Alcance** — `ALCANCE.md`: versión y commit, lentes, qué no se revisó antes.
2. **Lentes** — un subagente por lente, **en paralelo y solo lectura**, cada uno con `lente-N-<nombre>.md`. Cada revisor entrega también lo que **no** revisó.
3. **Verificación y resumen** — el orquestador comprueba **cada hallazgo crítico y alto contra el código** (no se fía del informe). `RESUMEN.md`.
4. **Plan por tandas** — `PLAN.md`: críticos y altos primero; cada arreglo con una prueba que **falla antes y pasa después**.
5. **Aceptados** — `ACEPTADOS.md`: un agente *propone*; lo de producto, datos o legal lo acepta Antonio.
6. **Re-verificación** — `REVERIFICACION-<versión>.md` por revisores distintos de los que encontraron el problema.

## Formato de hallazgo
`[CRÍTICO|ALTO|MEDIO|BAJO] <id> · fichero:línea — defecto — escenario concreto — cómo se comprobó — por qué no lo vio ningún guardián`. Lo no verificable (iPhone, Quest, marco de artefactos, MCP en vivo) va en una lista aparte, **nunca** como hallazgo.

## Severidades
- **Crítico:** se publica un dato privado o un secreto; se pierde un dato irrecuperable; un cambio rompe la carga de una finca.
- **Alto:** lo mismo con condición realista; un número que ve alguien sale mal en un caso normal (p. ej. hectáreas, olivos, NDVI); fuga de memoria que cierra la pestaña.
- **Medio:** impacto limitado, o una promesa escrita que el código no cumple (documentación, contrato).
- **Bajo:** calidad o defensa en profundidad.

## Reproducir sin tocar nada real
Fixture sintético (`npm run fixture`) y los guardianes; datos reales solo en local y sin copiarlos al informe. Las cifras se miden con la skill `medir`.
