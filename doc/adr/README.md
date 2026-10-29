# Decisiones de arquitectura (ADR)

Cada decisión con alternativas reales se escribe una vez, con su porqué y su coste. Plantilla: [_template.md](_template.md). Para crear uno, usa la [skill `adr`](../../.claude/skills/adr/SKILL.md).

## Reglas
- **Se enmiendan, no se reescriben.** Se añade una sección fechada («Enmienda AAAA-MM-DD: …»). Si se revierte, un ADR nuevo supersede y el viejo queda «Superado por ADR-XXXX».
- **Una fila por fichero** en el índice, en orden de número (lo vigila `documentacion.test.js`).
- Numeración correlativa `NNNN-titulo-en-kebab-case.md`.
- Ante la duda, escríbelo. Al cerrar una decisión de [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md), se convierte en ADR.
- Los ADR 0001–0008 se sembraron el 2026-10-28 a partir del diseño del 27-oct ([foto](../historico/DISENO-2026-10.md)); recogen decisiones ya tomadas e implementadas.

## Índice

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-teselas-256m-utm30.md) | Teselas de 256 m alineadas a múltiplos en UTM30 | Aceptado |
| [0002](0002-niveles-de-detalle.md) | Niveles de detalle de terreno, olivos y nube | Aceptado |
| [0003](0003-calidad-base-alta.md) | Calidad Base y Alta con el mismo motor | Aceptado |
| [0004](0004-datos-fuera-del-repo.md) | Los datos no se versionan | Aceptado |
| [0005](0005-webxr-perfil-propio.md) | WebXR con perfil de rendimiento propio | Aceptado |
| [0006](0006-ortofoto-correccion-de-copas.md) | Ortofoto con corrección del desplazamiento de copas | Aceptado |
| [0007](0007-suelo-abierto-de-la-ortofoto.md) | Suelo abierto heredado de la ortofoto | Aceptado |
| [0008](0008-ficheros-de-apoyo-json-jpg.md) | Ficheros de apoyo en json y jpg, sin binario crudo | Aceptado |
| [0009](0009-plataforma-multiusuario-cuarenta-hazas.md) | Plataforma multiusuario «Cuarenta hazas» | Aceptado |
| [0010](0010-monorepo-y-build-con-vite.md) | Monorepo y paso de build con Vite | Aceptado |
| [0011](0011-alojamiento-en-el-vps-de-ovh.md) | Alojamiento en el VPS de OVH como inquilino del borde | Aceptado |
| [0012](0012-catalogo-de-olivos-tipo-e-id-estable.md) | Catálogo de olivos-tipo e id estable por árbol | Aceptado |
| [0013](0013-enlace-magico-y-sesiones.md) | Enlace mágico por correo y sesión en cookie guardada en Postgres | Aceptado |
| [0014](0014-proyeccion-publica-por-haza.md) | Proyección pública por haza con lista blanca | Aceptado |
| [0015](0015-escena-en-3d-tiles.md) | Escena en 3D Tiles 1.1 con 3DTilesRendererJS | Propuesto |
| [0016](0016-actualizacion-de-three.md) | Actualización de three de r128 a 0.186.1 | Aceptado |
| [0017](0017-constructor-de-olivos-generados.md) | Constructor de olivos generados: un árbol por olivo, con semilla, desde lo medido | Propuesto |
| [0018](0018-hornero-de-olivos.md) | Hornero de olivos: variantes horneadas en el servidor, propios cercanos en el aparato | Aceptado |
| [0019](0019-escalera-de-olivos.md) | Escalera de olivos: niveles del constructor e impostores | Aceptado |
| [0020](0020-avatares-vrm.md) | Avatares VRM | Aceptado |
