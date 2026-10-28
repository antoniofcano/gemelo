# Documentación

Índice de todo. Dos partes: **lo vivo** (se mantiene, es la verdad de hoy) y **lo histórico** (fotos de un momento, no se mantienen). Una carpeta por pregunta; en la raíz de `doc/` solo este fichero y `ESTADO.md`. Todo fichero nuevo lleva aquí su línea. Reglas de mantenimiento: [CLAUDE.md](../CLAUDE.md) regla 8.

## Empezar
- [CLAUDE.md](../CLAUDE.md) — manual de operación: reglas de oro, mapa, comandos.
- [operacion/ONBOARDING.md](operacion/ONBOARDING.md) — alta desde cero y **la puerta** (única lista).
- [README del repo](../README.md) — qué es y cómo construir.

## Dónde estamos
- [ESTADO.md](ESTADO.md) — hecho, datos, sin comprobar, pendiente, riesgos.
- [../CHANGELOG.md](../CHANGELOG.md) — qué cambió y cuándo.

## Hacia dónde vamos — `rumbo/`
- [rumbo/PLAN.md](rumbo/PLAN.md) — iniciativas con su estado.
- [rumbo/DECISIONS-PENDING.md](rumbo/DECISIONS-PENDING.md) — decisiones abiertas, quién decide, qué bloquean.

## Decisiones — `adr/`
- [adr/README.md](adr/README.md) — reglas e índice de ADR. Plantilla: [adr/_template.md](adr/_template.md).

## Cómo es — `sistema/`
- [sistema/ARCHITECTURE.md](sistema/ARCHITECTURE.md) — módulos, arranque, bucle, colas, memoria.
- [sistema/CONTRATOS.md](sistema/CONTRATOS.md) — datos exportador→motor, interfaces del motor, MCP, publicación (esquemas en [../contratos/](../contratos/)).
- [sistema/GLOSARIO.md](sistema/GLOSARIO.md) — tesela, nivel, copa, r8, foco, MDS/MDT/CHM…
- [sistema/MEDIDAS.md](sistema/MEDIDAS.md) — cifras medidas de dibujo y memoria.

## Cómo se opera — `operacion/`
- [operacion/ONBOARDING.md](operacion/ONBOARDING.md) — alta y la puerta.
- [operacion/RUNBOOK.md](operacion/RUNBOOK.md) — qué hacer si falla una carga, una tesela, el WMS del IGN o el marco de artefactos.
- [operacion/PUBLICACION.md](operacion/PUBLICACION.md) — receta de publicar y límites de la plataforma.
- [operacion/DATOS.md](operacion/DATOS.md) — fuentes, hojas LiDAR/MDT por finca, cómo regenerar, licencias.
- [operacion/TESTING.md](operacion/TESTING.md) — qué prueba cada cosa y qué significa cada rojo.

## Skills — `.claude/skills/`
`adr`, `documentalista`, `release`, `auditoria`, `publicar-artefacto`, `medir`, `datos-finca`, `modelado-3d`, `videojuegos`, `mundos-virtuales`, `interaccion` (tabla de cuándo usar cada una en [CLAUDE.md §6](../CLAUDE.md)).

## Histórico — `historico/` (foto, no se mantiene)
- [historico/DISENO-2026-10.md](historico/DISENO-2026-10.md) — diseño de la refactorización por teselas (27-oct-2026). Lo vigente: ADR 0001–0008 y ARCHITECTURE.
