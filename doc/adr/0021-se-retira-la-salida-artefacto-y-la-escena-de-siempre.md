# ADR-0021 — Se retira la salida artefacto y la escena de siempre

- **Estado:** Aceptado (Antonio, 2026-10-30; decisión 79)
- **Fecha:** 2026-10-30

## Contexto
[ADR-0015](0015-escena-en-3d-tiles.md) puso la escena en 3D Tiles como la de serie (T8 fase 1) y dejó la de siempre (`Terreno`, teselas propias de [ADR-0001](0001-teselas-256m-utm30.md) y [ADR-0002](0002-niveles-de-detalle.md)) detrás de `?escena=clasica`, con la **salida artefacto** (`tuberia/salida_artefacto/montar_v2.py`, una página para claude.ai) atada a ella: los glb no son un tipo admitido por la plataforma y Hituelo (248 glb + `tileset.json` + 92 ficheros de `t/`) supera los 255 ficheros por publicación. Con el alojamiento propio ([ADR-0011](0011-alojamiento-en-el-vps-de-ovh.md)) el gemelo se sirve desde el servidor (Vite + Caddy). Mantener dos escenas y dos salidas dobla las pruebas y los topes y deja código que solo existe para un camino que ya no es el del producto.

## Decisión
Se **borra la escena de siempre** (`apps/web/motor/04_terreno.js`, el espacio de nombres `Terreno`, `?escena=clasica` y `ESC3D`) y se **retira la salida artefacto** (`tuberia/salida_artefacto/`, `contratos/publicacion.json`, la skill `publicar-artefacto`). El gemelo se sirve **solo desde el servidor** (entorno local de `infra/dev`, `npm run build` de Vite y, después, el VPS). La escena es siempre la 3D Tiles; sin `tileset` en el índice, o si falla, el panel dice «Esta finca no tiene escena» y no hay vuelta a otra. `Mundo` (física y CPU) sigue leyendo `t/*.json`, `t/*.jpg`, el `grueso` y el mosaico del índice (decisión 38); la nube LiDAR no cambia. Lo publicado en claude.ai queda como última foto, sin mantener.

## Alternativas consideradas
- **Congelar la salida artefacto con un `Terreno` propio** — descartada: obliga a conservar el código de la escena de siempre y sus pruebas para un canal que no admite glb ni escala a Hituelo.
- **Esperar una versión con las dos** (el plan de la fase 1) — descartada por Antonio: la fase 1 ya cumplió los criterios 1-4 en local y la doble escena solo retrasa la limpieza antes del VPS.
- **Una salida artefacto reducida (solo Cerro)** — no se pidió; sería otro camino que mantener sin uso en producción.

## Consecuencias
- **Positivas:** un solo camino de escena y de página; menos código, pruebas y topes; el motor carga three desde el paquete de Vite (sin importmap de jsDelivr ni CSP de la plataforma).
- **Negativas / coste:** ya no hay un HTML autónomo que se abra sin servidor ni publicación en claude.ai; las cifras de [MEDIDAS](../sistema/MEDIDAS.md) de la escena de siempre quedan **invalidadas** (se conservan como historia); una finca sin tileset no se ve.
- **Supera:** [ADR-0001](0001-teselas-256m-utm30.md) y [ADR-0002](0002-niveles-de-detalle.md) (junto con ADR-0015, que cierra aquí su fase 2). **Enmienda:** [ADR-0008](0008-ficheros-de-apoyo-json-jpg.md) (el json/jpg de `t/` sigue por Mundo; el motivo de los límites de artefactos desaparece), [ADR-0010](0010-monorepo-y-build-con-vite.md) (una sola salida) y [ADR-0016](0016-actualizacion-de-three.md) (sin importmap de jsDelivr). No toca [ADR-0004](0004-datos-fuera-del-repo.md).

## Comprobación
`npm run puerta` sin referencias a la salida artefacto ni a `Terreno`; el fixture trae tileset y las pruebas montan la página con Vite (`_pagina.js` de los guardianes). **No probado:** Quest y escritorio con GPU (T7); iPhone.
