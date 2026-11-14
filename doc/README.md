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
- [rumbo/EV-3-QUE-LA-GENTE-VUELVA.md](rumbo/EV-3-QUE-LA-GENTE-VUELVA.md) — estudio EV-3 (no implementa): huellas, notas y ecos, avisos del campo (correo o web push), primera vez con gafas, estado del mundo, boca por voz, postal y Mayoral; reuso, coste, privacidad, propuesta de la tanda 10 y decisiones para Antonio.

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
- [sistema/DECORACIONES.md](sistema/DECORACIONES.md) — propuesta (P7g, sin implementar): decorar un olivo con piezas de un catálogo cerrado; permisos como P7f, escalones D1-D6 y decisiones abiertas.
- [sistema/OPTIMIZACION.md](sistema/OPTIMIZACION.md) — plan para mejorar el paseo por el campo en Quest, móvil y escritorio: qué hay, sospechosos, protocolo de medida, cómo decidir y tareas Q0a-Q0d.
- [rumbo/MEJORAS-TECNICAS.md](rumbo/MEJORAS-TECNICAS.md) — hoja de ruta técnica de rendimiento del agroverso (fases 0 a 3: medición, mejoras sin y con cambio de aspecto, renderizador nuevo), contrastada con el código; tareas `AG-` del plan.
- [sistema/SUELO-FOTOS.md](sistema/SUELO-FOTOS.md) — EV-1s: el suelo de cerca con texturas de fotos de la finca (`?suelo=fotos`) y la paleta del atardecer: qué es medido, deducido e ilustrativo, reglas de clase, presupuesto, qué no está probado y la prueba de capturas del banco.
- [sistema/TONE-MAPPING.md](sistema/TONE-MAPPING.md) — AG-2.5: la perilla `?tono=agx|aces|neutral` (y `?expo=`) para comparar el tone mapping; qué hace cada opción, qué pasa con el cielo y la niebla, las dos builds y la orden de capturas. Sin probar en Quest ni iPhone.
- [sistema/ALPHA-A-COBERTURA.md](sistema/ALPHA-A-COBERTURA.md) — AG-2.1: `?a2c=0|1`, los recortes alfa (hierba, follaje, ramitas, impostores) a `alphaToCoverage` con el MSAA del contexto; qué materiales, cómo compararlo y la orden de capturas. Sin probar en Quest ni iPhone.
- [sistema/CARTULINAS.md](sistema/CARTULINAS.md) — AG-2.2: `?cartulina=rect|silueta` (defecto `rect`), las cartulinas con recorte alfa (ramitas, relleno, tarjetas, impostores, sustitutos) dibujadas con el hexágono que abraza lo opaco; inventario con el área transparente medida, triángulos y la orden para el banco. Sin probar en Quest ni iPhone.
- [sistema/MATERIALES.md](sistema/MATERIALES.md) — la fábrica de materiales `nucleo/materiales` (MU5-0): inventario de los sombreadores propios del motor (niebla, NDVI, viento, hora y dificultad en TSL), la API (registro por nombre, estándar, `libera(dueño)`), cómo se elige el renderer en MU6 (`?renderer=webgpu`, `GEMELO_BUILD`) y la receta de los tres commits de cada MU5-n.
- [sistema/MUNDOS.md](sistema/MUNDOS.md) — diseño (ADR-0033): mundos múltiples (exterior, molino, bodega) en un solo PWA; interfaces `World`, `WorldManager`, `Ambiente`, `Puerta`, `Contexto` y `Render` en TypeScript, contratos nuevos (sala por mundo, pose con mundo, pizarra), guardianes, la fase 1 al detalle y los riesgos.
- [sistema/OFICINA.md](sistema/OFICINA.md) — propuesta: `/oficina`, la herramienta de la oficina (familias, hazas, bandeja, mundo en modo oficina, agenda, directos, constructor y parámetros de la escalera versionados, sistema), con plan OF0-OF13 y decisiones; maqueta en [../prototipos/oficina/](../prototipos/oficina/).
- [sistema/LLAVES-DE-ACCESO.md](sistema/LLAVES-DE-ACCESO.md) — diseño aceptado y estado de implementación (OF13b, ADR-0029): llaves de acceso para todas las cuentas; recorridos, amenazas y mitigaciones, qué se guarda, recuperación, plan y preguntas para Antonio.
- [sistema/EIPD-LLAVES.md](sistema/EIPD-LLAVES.md) — BORRADOR sin valor legal del tratamiento «llaves de acceso» (OF13b-11): qué se guarda, base propuesta, plazos, derechos, riesgos.
- [sistema/EIPD-VOZ.md](sistema/EIPD-VOZ.md) — BORRADOR sin valor legal de la ampliación de la EIPD a la voz en directo de F3 (finalidad, base, datos, riesgos, medidas, derechos y lo abierto para Antonio)
- [sistema/EIPD-CAMPO.md](sistema/EIPD-CAMPO.md) — BORRADOR sin valor legal de la ampliación de la EIPD al corresponsal de campo de F4 (vídeo con trabajadores en plano, posición, clips; base, aviso, plazos y lo abierto)
- [sistema/CORRESPONSAL.md](sistema/CORRESPONSAL.md) — propuesta (F4-1, ADR-0030): el corresponsal de campo como PWA en primer plano; sesión, permisos del móvil, GPS a escena, pose v2, vídeo por LiveKit, clips diferidos, batería y plan F4-0 a F4-7
- [sistema/AVATARES-FAMILIA.md](sistema/AVATARES-FAMILIA.md) — propuesta: avatares para toda la familia (fuentes abiertas, criterios de inclusión comprobables, muñeco teñido ya y creador por piezas después, silla/andador/bastón, peques y la decisión 45); maqueta en [../prototipos/avatares/](../prototipos/avatares/).
- [sistema/COMPONENTES.md](sistema/COMPONENTES.md) — componentes del mundo («plugins»): diagnóstico del acoplamiento de hoy, contrato de un componente, puntos de extensión y lo que falta para el Agro-Verse (propuesta, ADR-0023).
- [sistema/JUEGOS.md](sistema/JUEGOS.md) — juegos casuales (C9a): la pausa del mundo, el anfitrión de juegos, «Cae la cosecha» (reglas, controles, dibujo), el récord de la familia en la api y su nota de comodidad.
- [sistema/ARQUITECTURA-MULTIUSUARIO.md](sistema/ARQUITECTURA-MULTIUSUARIO.md) — «Cuarenta hazas»: la visión multiusuario que da sentido al proyecto (aceptada, ADR-0009: sus fases se van haciendo; el estado, en el PLAN).

## Cómo se opera — `operacion/`
- [operacion/ONBOARDING.md](operacion/ONBOARDING.md) — alta y la puerta.
- [operacion/RUNBOOK.md](operacion/RUNBOOK.md) — qué hacer si falla una carga, una tesela o el WMS del IGN.
- [operacion/PUBLICACION.md](operacion/PUBLICACION.md) — cómo se sirve el gemelo (local y VPS; la salida artefacto se retiró).
- [operacion/DATOS.md](operacion/DATOS.md) — fuentes, hojas LiDAR/MDT por finca, cómo regenerar, licencias.
- [operacion/DESARROLLO-LOCAL.md](operacion/DESARROLLO-LOCAL.md) — el mundo y los servicios base (Caddy, PostGIS, LiveKit, buzón) en local con Docker: `npm run dev:arriba`.
- [operacion/RUNBOOK-VPS.md](operacion/RUNBOOK-VPS.md) — servidor F1a en el VPS: puesta en marcha, operación, copias cifradas y ensayo de restauración (el VPS está en marcha; las copias automáticas con `age`/`rclone` reales, sin ejecutar allí).
- [operacion/LLAVES-RECUPERACION.md](operacion/LLAVES-RECUPERACION.md) — guía corta para la oficina: una familia pierde el móvil, la oficina pierde su llave, qué decir por teléfono (OF13b-11).
- [operacion/DESPLIEGUE-V2.md](operacion/DESPLIEGUE-V2.md) — **el primer despliegue en el VPS (hecho el 2026-11-02), paso a paso**: qué hace Antonio, comprobación y vuelta atrás de cada paso, y qué bloquea enseñarlo o abrirlo a familias.
- [operacion/TESTING.md](operacion/TESTING.md) — qué prueba cada cosa y qué significa cada rojo.

## Auditoría en curso — `auditoria-noviembre2026/` (viva mientras tenga algo abierto; luego a `historico/`)
Primera auditoría por lentes ([skill `auditoria`](../.claude/skills/auditoria/SKILL.md)), sobre v0.2.0 `4ab0ae6`: 0 críticos, 1 alto, 73 medios, 82 bajos; solo lectura, nada medido en ejecución.
- [auditoria-noviembre2026/ALCANCE.md](auditoria-noviembre2026/ALCANCE.md) — versión, lentes, qué no se pudo verificar.
- [auditoria-noviembre2026/RESUMEN.md](auditoria-noviembre2026/RESUMEN.md) — resultado por lente, verificación del alto, causas comunes.
- [auditoria-noviembre2026/PLAN.md](auditoria-noviembre2026/PLAN.md) — arreglos por tandas, cada uno con su prueba.
- [auditoria-noviembre2026/ACEPTADOS.md](auditoria-noviembre2026/ACEPTADOS.md) — aceptados y decisiones de Antonio; firmados el 2026-11-14, por su encargo, solo los que no compensa tocar (el resto se arregló).
- [auditoria-noviembre2026/PROPUESTA-ARQUITECTURA.md](auditoria-noviembre2026/PROPUESTA-ARQUITECTURA.md) — propuesta de refactorización a mundos múltiples (exterior, molino, bodega), TypeScript y Vitest; pide ADR-0033.
- [auditoria-noviembre2026/INFORME-WORLDMANAGER.md](auditoria-noviembre2026/INFORME-WORLDMANAGER.md) — diagnóstico previo del motor frente a un `Mundos` (foto del 2026-11-06).
- [auditoria-noviembre2026/REVERIFICACION-2026-11-14.md](auditoria-noviembre2026/REVERIFICACION-2026-11-14.md) — re-verificación tras la refactorización: 39 resueltos, 40 de 73 medios abiertos o parciales, 38 aceptados sin firma (foto). Anexos por lentes: [1-2](auditoria-noviembre2026/reverificacion/lentes-1-2.md) · [3-8](auditoria-noviembre2026/reverificacion/lentes-3-8.md) · [4-9](auditoria-noviembre2026/reverificacion/lentes-4-9.md) · [5-7](auditoria-noviembre2026/reverificacion/lentes-5-7.md) · [6-10](auditoria-noviembre2026/reverificacion/lentes-6-10.md).
- [auditoria-noviembre2026/REVERIFICACION-2026-11-14-tarde.md](auditoria-noviembre2026/REVERIFICACION-2026-11-14-tarde.md) — tras las tandas de arreglos del mismo día: ningún medio abierto, 3 bajos abiertos, 14 aceptados firmados (foto). Anexos: [1-2-5-7](auditoria-noviembre2026/reverificacion/tarde-lentes-1-2-5-7.md) · [3-4-8-9](auditoria-noviembre2026/reverificacion/tarde-lentes-3-4-8-9.md) · [6-10](auditoria-noviembre2026/reverificacion/tarde-lentes-6-10.md).
- Informes por lente: [1 rendimiento](auditoria-noviembre2026/lente-1-rendimiento.md) · [2 memoria](auditoria-noviembre2026/lente-2-memoria.md) · [3 datos](auditoria-noviembre2026/lente-3-datos.md) · [4 contratos](auditoria-noviembre2026/lente-4-contratos.md) · [5 modelado](auditoria-noviembre2026/lente-5-modelado.md) · [6 interacción](auditoria-noviembre2026/lente-6-interaccion.md) · [7 VR](auditoria-noviembre2026/lente-7-vr.md) · [8 mundos](auditoria-noviembre2026/lente-8-mundos.md) · [9 seguridad](auditoria-noviembre2026/lente-9-seguridad.md) · [10 documentación](auditoria-noviembre2026/lente-10-documentacion.md).

## Skills — `.claude/skills/`
`adr`, `documentalista`, `release`, `auditoria`, `medir`, `datos-finca`, `modelado-3d`, `videojuegos`, `mundos-virtuales`, `interaccion` (tabla de cuándo usar cada una en [CLAUDE.md §6](../CLAUDE.md)). Agente: [`arquitecto-multiusuario`](../.claude/agents/arquitecto-multiusuario.md) (estudia la arquitectura multiusuario, solo lectura).

## Histórico — `historico/` (foto, no se mantiene)
- [historico/DISENO-2026-10.md](historico/DISENO-2026-10.md) — diseño de la refactorización por teselas (27-oct-2026). Lo vigente: ADR 0015, 0021 y ARCHITECTURE.
- [historico/ESCALA-NO-UNIFORME.md](historico/ESCALA-NO-UNIFORME.md) — AG-1.11: qué hace 3DTilesRendererJS con la exageración vertical (escala no uniforme del grupo), cómo sesga la selección de teselas, coste y alternativas.
- [historico/VIABILIDAD-REALISMO.md](historico/VIABILIDAD-REALISMO.md) — estudio EV-1 (no se implementa): suelo con fotos propias (texturas repetibles, KTX2, fundido con la ortofoto, hierba con recortes, unión suelo-olivo) y biodiversidad con datos abiertos (GBIF, xeno-canto, MITECO…) y grabador propio; coste, política por aparato, licencias, honestidad, versiones mínimas, tareas y preguntas.
- [historico/VIABILIDAD-INTERACCION.md](historico/VIABILIDAD-INTERACCION.md) — estudio EV-2: interfaz espacial en tres capas (fichas en el mundo, muñeca, panel pequeño; uikit y troika frente al lienzo) y palanca táctil del móvil (nipplejs, toque para ir); viabilidad, coste, riesgos y tareas.
- [historico/IWSDK.md](historico/IWSDK.md) — estudio Q2: el Immersive Web SDK de Meta (no se adopta), cómo medir en el Quest desde un agente con `adb`, CDP y `sessiongranted`, IWER frente a `mock_xr.js`, mirar y pellizcar, licencias y telemetría, y la prueba de una hora.
- [historico/MULTIVIEW.md](historico/MULTIVIEW.md) — estudio y plan AG-3a/AG-3b: migrar al `WebGPURenderer` (backend WebGL) con multiview para VR; qué ofrece three, inventario de sombreadores, puntos y pasada de salida, versión de three, 3d-tiles-renderer, fases F0-F6 con criterios de abandono y qué medir en el Quest (ADR-0031, Propuesto).
