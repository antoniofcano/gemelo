# Re-verificación de las lentes 5 (modelado) y 7 (VR)

Contra el código actual (`apps/web/src/`). Solo lectura. Ejecuté `npx vitest run` de `bucle`, `presupuesto`, `follaje`, `arboles-l0` y `fundido`: 5 ficheros, 72 pruebas en verde. Nada de Chrome ni Quest.

## Lente 5 — modelado

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L5-01 | Medio | RESUELTO | `mundos/exterior/arboles-l0.ts:78` crea `matTroncoL0` propio por la fábrica (`tronco-l0`); `paisaje.ts:129` conserva `matTronco`. Lo vigila `arboles-l0.test.ts:40` (`tronco.material === api.matTroncoL0`) y `:79-80` (`vertexColors`, parche). |
| L5-02 | Medio | RESUELTO | `follaje.ts:124-139`: `construyeSombras` rehace solo su malla, y `quitaSombras` hace `remove` y `dispose`. Ya no hay `children.pop()`. `instSombraPA` queda en `paisaje.ts:279` y su `dispose` en `:338`. Lo vigila `follaje.test.ts:43-59` (L5-02: no saca `instSombraPA` tras 10 llamadas; `dispose` de la malla vieja). |
| L5-03 | Medio | ACEPTADO | `ACEPTADOS.md` lo acepta (firma de Antonio pendiente). Sin cambio: `follaje.ts:132` sigue con manchas horizontales a `suelo(x,y)+0.06` del centro. |
| L5-04 | Bajo | ABIERTO | `arboles-l0.ts:76`: `copa-l0` y `tronco-l0` solo llevan `colorVertSRGB` como `onBeforeCompile`. No llevan `parcheTiempo` (nubes ni escarcha), mientras que `catalogo.ts:159` lo pasa en L1 (`tiempo`). |
| L5-05 | Bajo | ACEPTADO | Aceptado hasta el port a `NodeMaterial`. `hierba.ts:60` sigue con `side: DoubleSide` y normales fijas (`:136-144`). Sin cambio. |
| L5-06 | Bajo | ACEPTADO | Aceptado hasta el port a TSL. `paisaje.ts:194` sigue con `setHSL(...)` sin espacio de color y `matCopaArb` (`:129`) sin `colorVertSRGB`. |
| L5-07 | Bajo | ABIERTO | `arboles.ts:222` (`c.d < U1`) y `:212` (`c.d < U2`) siguen sin histéresis. Solo el nivel 0 la tiene (`:193`, `R0 * 1.15`). Nadie la vigila. |
| L5-08 | Bajo | PARCIAL | (c) arreglado: L1-04 hace que el nivel 0 cuente en `TOPE_TRI` (`arboles.ts:187`, `arboles.test.ts:58`). Siguen abiertos (a) `TRI2 = 30` (`arboles.ts:58`) frente a los 35 triángulos que contó la lente, y (d) las manchas de sombra, que no entran en `triEst` (`:238`). Dejo (b) como estaba. No re-medí `copaGeo` a mano. |
| L5-09 | Bajo | ACEPTADO | Aceptado hasta el port a TSL. Siguen los reemplazos en `dithering_fragment` (`terreno.ts:329`, `hierba.ts:213`, `tiempo-parche.ts:140`). El orden real de los trozos de three no lo comprobé. |
| L5-10 | Bajo | ACEPTADO | Aceptado hasta el port a TSL. `terreno.ts:295` mantiene el `if (camino > 0.02 && cercaR > 0.01)` y las lecturas `texture2D` con sesgo dentro. La variante TSL (`:404-428`) existe, pero no revisé si resuelve el sesgo. |
| L5-11 | Bajo | ACEPTADO | Aceptado hasta el port a TSL. `lejanos.ts:242-247` GLSL aún calcula `inverse(ot_IM)` y `transpose(inverse(mat3))` por vértice. La variante TSL (`:85-102`) usa una inversa analítica con `det`. |
| L5-12 | Bajo | ABIERTO | `.claude/skills/modelado-3d/SKILL.md:39` sigue diciendo «sin comprobar en el código». No dice que no hay mapas de sombra. La documentación posterior sí lo sabe: `MATERIALES.md:275` ("El motor no enciende las sombras (L5-12)"). |

## Lente 7 — VR

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L7-01 | Medio | RESUELTO (Quest no probado) | `nucleo/bucle.ts:5,73,119-138`: `try/catch` por fotograma, y al tercer fallo seguido sale de VR (`FALLOS_SEGUIDOS = 3`). Lo vigila `bucle.test.ts:86`. |
| L7-02 | Medio | RESUELTO (Quest no probado) | `bucle.ts:172-177,246`: `visibilitychange` del documento y de la sesión XR, y `reset` del espacio de referencia. Lo vigila `bucle.test.ts:129-157`. |
| L7-03 | Medio | RESUELTO (umbrales sin calibrar en casco) | `nucleo/presupuesto.ts:74-104`: pérdida por fracción sostenida de fotogramas perdidos, muestras de JS recortadas, subida holgada con castigo por rebote. Lo vigila `presupuesto.test.ts:188,268-314` (L7-03). El propio código dice que ninguna cifra está calibrada en el casco. |
| L7-04 | Medio | ABIERTO | `mundos/comun/vr-sesion.ts:68-75`: `vrPrecompila` sigue llamando a `renderer.compileAsync(scene, camera)` con el destino activo `null`, sin el `WebGLMultiviewRenderTarget`. El comentario `:66` sigue prometiendo "ya en modo XR". `Render.compila` con `camaraXr` (`nucleo/render.ts:140-176`) se creó, pero el VR no la usa: nadie llama a `Render.compila` fuera del enlace en `arranque.ts:225`. Pasar la cámara XR no cambia el destino activo, que es lo que decide el programa multiview. Solo con Quest se vería el efecto. |
| L7-05 | Medio | RESUELTO (comodidad: Quest no probado) | `vr-teletransporte.ts:44-46,76-78`: `vrSalta` funde todo salto de más de 5 m, y el mirador siempre. `vr-panel.ts:335` (parcela ▶) y `vr.ts:122` (arco) pasan por él. Un arco de menos de 5 m va sin fundido a propósito (`FundidoPuro.necesitaFundido`). Lo vigila `nucleo/fundido.test.ts`; `vr.test.ts` lo cita, no leí su caso exacto. |
| L7-06 | Medio | RESUELTO (Quest no probado) | `vr-teletransporte.ts:46`: dentro del fundido, `panel.ini = ficha.ini = fichaB.ini = false`, con lo que la lámina nace delante. Mismo patrón en `vrAparece` (`:70`). Lo vigila `fundido.test.ts` y `vr.test.ts`; no leí el caso exacto. |
| L7-07 | Medio | ABIERTO | La documentación sigue contradiciéndose. `herramientas/builds.mjs:1-2` dice "aún no se publica ni la elige la página"; `vite.config.js:13` dice "preparada, no activada"; `doc/operacion/PUBLICACION.md:13` dice "preparada y aún no activada … sin super-three instalado"; `nucleo/render.ts:3` dice "Hoy NO cambia nada". No volví a cotejar el ADR-0031 ni `ESTADO.md`. |
| L7-08 | Bajo | ACEPTADO | Aceptado: inherente al parche. `herramientas/parche_multiview.mjs` no cambia en lo que recoge la lente. |
| L7-09 | Bajo | ABIERTO | `parche_multiview.mjs:41,62`: `FICHERO` solo casa el `build/three.module.js` de super-three. No hay aviso ni fallo en `vite dev`. |
| L7-10 | Bajo | RESUELTO (pérdida real de contexto: no probado) | `bucle.ts:12,246-249`: `webglcontextlost` (`preventDefault`, el bucle se para, en VR cierra la sesión) y `webglcontextrestored` (rehace). Lo vigila `bucle.test.ts:172-191`. |
| L7-11 | Bajo | ACEPTADO | Aceptado (parámetro de depuración). `vr-teletransporte.ts:38` sigue con el velo a z = -0,3. |
| L7-12 | Bajo | ABIERTO | `vr-rig.ts:63-64`: `vrIrA` sigue colocando el rig con `gm.suelo()`, sin esperar la tesela de destino. El fundido sigue siendo de tiempo fijo y no espera a la carga. La diferencia real sigue sin medir. |
| L7-13 | Bajo | ABIERTO | `vr-panel.ts:224` (`parcelas[…] || parcelas[0]` y `.finca`) y `:335` (módulo por `parcelas.length`) siguen sin guarda para lista vacía. El esquema no cambia en lo que consta. |
| L7-14 | Bajo | ACEPTADO | `ACEPTADOS.md` lo difiere a la tanda 8 de documentación. Sin cambio: `pruebas/vr_mock.js` sigue sin aserciones y apunta a `gemelo_cerro.html`, y `CLAUDE.md:64` sigue citándolo como "VR con sesión simulada". |

## Recuento (26 hallazgos)

| Veredicto | Medio | Bajo | Total |
|---|---|---|---|
| RESUELTO | 7 (L5-01, L5-02, L7-01, L7-02, L7-03, L7-05, L7-06) | 1 (L7-10) | 8 |
| PARCIAL | 0 | 1 (L5-08) | 1 |
| ABIERTO | 2 (L7-04, L7-07) | 6 (L5-04, L5-07, L5-12, L7-09, L7-12, L7-13) | 8 |
| ACEPTADO (firma pendiente) | 1 (L5-03) | 8 (L5-05, L5-06, L5-09, L5-10, L5-11, L7-08, L7-11, L7-14) | 9 |
| NO VERIFICABLE / YA NO APLICA | 0 | 0 | 0 |

Todos los RESUELTO de VR llevan la salvedad de que se probaron solo con dobles (Vitest) y que el Quest no los ha confirmado.

## Lo que no pude revisar
- Todo comportamiento en Quest o a ojo: mareo, fundidos, `visible-blurred`, pérdida real de contexto, primer fotograma con multiview, calibración de umbrales.
- No abrí los casos exactos de `vr.test.ts` que mencionan L7-05 y L7-06. Solo cotejé el código de `vrSalta`.
- Del orden de los trozos de `meshlambert_frag` de three (L5-09) y de si las variantes TSL de `terreno.ts` y `lejanos.ts` evitan por completo L5-10 y L5-11: lo dejo en el aire.
- No recontré los triángulos de `copaGeo` (L5-08 a, b). No comprobé el texto del ADR-0031 ni de `ESTADO.md` para L7-07.
- No ejecuté `node --test` de guardianes de `pruebas/guardianes/`.
