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
- [sistema/TILES3D.md](sistema/TILES3D.md) — prototipo F1d: la escena en 3D Tiles 1.1 (formato, marco de coordenadas, cómo regenerar, medidas).
- [sistema/VR.md](sistema/VR.md) — modo VR (Meta Quest): controles, perfiles, qué se probó y qué no.
- [sistema/UX.md](sistema/UX.md) — propuesta de UX: acceso, configuración e interacción (pendiente de revisión); maqueta en [../prototipos/ux/](../prototipos/ux/).
- [sistema/UX-FINCA-JUEGO.md](sistema/UX-FINCA-JUEGO.md) — propuesta: la página de la finca como un videojuego a pantalla completa (HUD mínimo, ventanas, Configuración, chat movible), con inventario, «antes → después» y plan; maqueta en [../prototipos/ux-finca-juego/](../prototipos/ux-finca-juego/).
- [sistema/VIDA.md](sistema/VIDA.md) — la vida de las hazas en el servidor (V3): olivos con id congelado, personalización, fotos, denuncias, bandeja, diario, avisos, lotes y eventos; almacenamiento y datos personales (EIPD).
- [sistema/OFICINA.md](sistema/OFICINA.md) — propuesta: `/oficina`, la herramienta de la oficina (familias, hazas, bandeja, mundo en modo oficina, agenda, directos, constructor y parámetros de la escalera versionados, sistema), con plan OF0-OF13 y decisiones; maqueta en [../prototipos/oficina/](../prototipos/oficina/).
- [sistema/AVATARES-FAMILIA.md](sistema/AVATARES-FAMILIA.md) — propuesta: avatares para toda la familia (fuentes abiertas, criterios de inclusión comprobables, muñeco teñido ya y creador por piezas después, silla/andador/bastón, peques y la decisión 45); maqueta en [../prototipos/avatares/](../prototipos/avatares/).
- [sistema/COMPONENTES.md](sistema/COMPONENTES.md) — componentes del mundo («plugins»): diagnóstico del acoplamiento de hoy, contrato de un componente, puntos de extensión y lo que falta para el Agro-Verse (propuesta, ADR-0023).
- [sistema/JUEGOS.md](sistema/JUEGOS.md) — juegos casuales (C9a): la pausa del mundo, el anfitrión de juegos, «Cae la cosecha» (reglas, controles, dibujo), el récord de la familia en la api y su nota de comodidad.
- [sistema/ARQUITECTURA-MULTIUSUARIO.md](sistema/ARQUITECTURA-MULTIUSUARIO.md) — «Cuarenta hazas»: la visión multiusuario que da sentido al proyecto (propuesta, pendiente de estudio).

## Cómo se opera — `operacion/`
- [operacion/ONBOARDING.md](operacion/ONBOARDING.md) — alta y la puerta.
- [operacion/RUNBOOK.md](operacion/RUNBOOK.md) — qué hacer si falla una carga, una tesela o el WMS del IGN.
- [operacion/PUBLICACION.md](operacion/PUBLICACION.md) — cómo se sirve el gemelo (local y VPS; la salida artefacto se retiró).
- [operacion/DATOS.md](operacion/DATOS.md) — fuentes, hojas LiDAR/MDT por finca, cómo regenerar, licencias.
- [operacion/DESARROLLO-LOCAL.md](operacion/DESARROLLO-LOCAL.md) — el mundo y los servicios base (Caddy, PostGIS, LiveKit, buzón) en local con Docker: `npm run dev:arriba`.
- [operacion/RUNBOOK-VPS.md](operacion/RUNBOOK-VPS.md) — servidor F1a en el VPS: puesta en marcha, operación, copias cifradas y ensayo de restauración (aún sin ejecutar en el VPS).
- [operacion/TESTING.md](operacion/TESTING.md) — qué prueba cada cosa y qué significa cada rojo.

## Skills — `.claude/skills/`
`adr`, `documentalista`, `release`, `auditoria`, `medir`, `datos-finca`, `modelado-3d`, `videojuegos`, `mundos-virtuales`, `interaccion` (tabla de cuándo usar cada una en [CLAUDE.md §6](../CLAUDE.md)). Agente: [`arquitecto-multiusuario`](../.claude/agents/arquitecto-multiusuario.md) (estudia la arquitectura multiusuario, solo lectura).

## Histórico — `historico/` (foto, no se mantiene)
- [historico/DISENO-2026-10.md](historico/DISENO-2026-10.md) — diseño de la refactorización por teselas (27-oct-2026). Lo vigente: ADR 0015, 0021 y ARCHITECTURE.
