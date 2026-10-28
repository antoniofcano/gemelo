---
name: interaccion
description: Diseño de interacción y UX del gemelo en pantalla, táctil, teclado y VR: mapeo de mandos, comodidad (giro por saltos, viñeta, velocidad), panel y fichas, accesibilidad, retroalimentación y protocolo de prueba en iPhone y Quest. Úsala al tocar controles, el panel, el HTML de la página, el modo VR o cualquier gesto del usuario, y al escribir la nota de comodidad que exige CLAUDE.md.
---

# Interacción

Regla 11 de [CLAUDE.md](../../../CLAUDE.md): todo cambio de interacción lleva su **nota de comodidad** (qué se probó, dónde y qué **no**). Hoy **nada de esto está probado en un casco ni en un iPhone reales**.

## Mapa de entradas
| Contexto | Entradas (leído del código) |
|---|---|
| **Órbita** (`09_camara.js`) | arrastrar con un dedo/ratón: girar (`az`, `el` limitado 0,08–1,5); dos dedos: zoom/pan; **Shift o botón derecho**: pan; rueda: distancia (30 m–`DIST_MAX`); toque corto sin mover (<6 px): elegir copa |
| **Paseo** (`12_paseo.js`) | teclas (`MAPA`), **V** cambia de vista, **Q** quad, **E** dron, **Esc** sale; en pantalla táctil, cruceta (`pad-up/down/left/right`), botón correr (`aria-pressed`) y cámara |
| **VR** (`29_vr.js`) | palanca izquierda: andar · derecha: giro **por saltos de 30°** · gatillo derecho: teletransporte · izq. botón 1 (grip): correr · **X** viñeta · **Y** panel · **A** vuelo · **B** mirador |

## Comodidad en VR (lo que hay y lo que falta)
Hay: giro por saltos, **viñeta** de confort (conmutable con X), teletransporte, velocidad de andar/correr, perfiles que bajan la carga si el fotograma se alarga, cabeza en el mundo y no movimiento de cámara impuesto. **Falta probar:** mareo (sobre todo en **vuelo** y **mirador**), legibilidad y alcance del panel flotante, tamaño de texto a distancia, háptica (`vrPulso`), y fps reales. No afirmar comodidad sin sesión real.

## Reglas de diseño
1. **Nunca mover la cámara en VR sin una acción del usuario**; las transiciones de cámara (`24_pantalla.js`) son solo para pantalla.
2. Todo gesto tiene **retroalimentación** inmediata (resaltado `hover`, pulso háptico, texto de estado `VR_ESTADO`).
3. Toda función táctil tiene su equivalente de **teclado** y viceversa; los botones llevan nombre accesible (`aria-label`, `aria-pressed`).
4. **Zonas táctiles ≥ 44 × 44 px**, contraste suficiente (AA) del HUD sobre la imagen, texto ≥ 16 px en pantalla y legible a la distancia del panel en VR.
5. **`prefers-reduced-motion`** respetado (ya hay regla en `apps/web/plantilla.html` y en `15_tiempo.js`): no animar por animar.
6. Los permisos del navegador (audio, pantalla completa, WebXR) **solo con gesto del usuario**.
7. El HUD es el mismo con `?debug` o sin él salvo el contador: no esconder información en el modo de prueba.
8. Los textos son **español**, directos, y distinguen medido / deducido / ilustrativo.
9. Estado de error comprensible (lecturas en vivo sin conector: mensaje claro, no consola).

## Protocolo de prueba (cuando haya dispositivo)
**iPhone (Safari):** abrir con `?debug`; orbitar, paseo con cruceta, correr, cambiar de vista, quad/dron, rotación de pantalla, modo ahorro de energía; anotar fps, ms de JS y si se cierra la pestaña. **Quest:** entrar con el botón «Entrar en VR»; andar, giros por saltos, teletransporte, vuelo, mirador, panel (alcance y lectura), viñeta; 10 min seguidos; anotar mareo (escala 0–10), fps y el nivel de perfil en `__vrDebug().nivel`. **Resultado:** `doc/ESTADO.md` (qué se probó, en qué dispositivo y versión) y, si cambia un contrato de mando, `doc/sistema/CONTRATOS.md`.

## Antes de dar por bueno un cambio
- [ ] Equivalencia táctil ↔ teclado ↔ VR comprobada o marcada no aplicable.
- [ ] Etiquetas, contraste y tamaños revisados.
- [ ] Nota de comodidad escrita con lo **no probado** explícito.
- [ ] Si cambia el mapa de botones VR: `CONTRATOS.md` y esta skill al día.
