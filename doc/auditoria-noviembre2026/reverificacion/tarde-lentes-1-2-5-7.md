# Re-verificación 2 (tarde del 2026-11-14), lentes 1, 2, 5 y 7

Solo lectura (Read, Grep, git show). No se ejecutó ninguna prueba, build, Chrome ni Docker: «la prueba existe y ejercita el arreglo» significa que se leyó su código y sus aserciones, no que se haya visto en verde. Rutas relativas a `apps/web/src/` salvo indicación.

Alcance: los hallazgos ABIERTO, PARCIAL y ACEPTADO de la mañana (`reverificacion/lentes-1-2.md` y `lentes-5-7.md`), más L2-02 y L2-04 (que la mañana dejó «sin firmar»).

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L1-06 | Medio | PENDIENTE DEL BANCO | Sin cambios desde la mañana: `pruebas/presupuesto.json` y `pruebas/guardianes/_navegador.js` no aparecen en `git log 14b4be09..HEAD`. Es recalibración con medida. |
| L1-07 | Medio | PENDIENTE DEL BANCO | Igual: `_navegador.js` y `carga.test.js` intactos; sigue comparándose solo `heapMB`. |
| L1-09 | Bajo | PENDIENTE DEL BANCO | `reclasifica` sigue síncrona (`mundos/exterior/arboles.ts`). Medida escrita: `pruebas/guardianes/tirones_olivos_chrome.test.js` (c42a083f), opcional con `GEMELO_TIRONES=1`; las comprobaciones van como `todo`, con topes [SUPUESTO] de 4 ms y 100 ms. No arregla nada: solo decide. |
| L1-10 | Bajo | RESUELTO | `ui/ajustes.ts:47-62`: `lee()` con caché por almacén. La vacían `wr`/`rm`, `restablece`, `fusiona`/`retira` (generación `genEsq`) y `olvida()` (evento «storage», línea 126). Antes ya estaba el sonido (`mundos/exterior/sonido.ts`). Pruebas: `pruebas/guardianes/ajustes.test.js:83` (300 lecturas, 3 al almacén; pon, restablece, fusiona/retira, olvida) y `ui/ajustes.test.ts:64` («storage»). Fallarían sin el arreglo. |
| L1-11 | Bajo | RESUELTO | `arboles.ts:241,253-254,331`: firma del reparto (`firma`/`firmaNiv`); `reclasifica(!cambio)` no marca `needsUpdate` si es solo el tiempo y la firma no cambió. Prueba: `arboles.test.ts:110` (versión de `instanceMatrix` constante con la cámara quieta; sube si la cámara se mueve). Fallaría sin el arreglo. |
| L1-12 | Bajo | PENDIENTE DEL BANCO | `lejanos.ts` `hornea` sigue en el fotograma. Misma medida que L1-09 (`tirones_olivos_chrome.test.js`, tope de horneo 8 ms [SUPUESTO], `todo`). |
| L2-02 | Medio | RESUELTO (decisión cerrada) | Código ya de la mañana (nube bajo demanda, `LIBERA_NUBE_M`). `ACEPTADOS.md` (nota del 2026-11-14) lo da por resuelto en el código: «nube bajo demanda, caché por aparato». Sin medida de bytes. |
| L2-04 | Medio | RESUELTO (decisión cerrada; cifras sin medir) | `escena-tiles.ts` `LruTilesPuro` por clase y perfil; prueba `escena-tiles.test.ts:119`. Los MB de móvil y Quest siguen [SUPUESTO]. |
| L2-06 | Medio | PENDIENTE DEL BANCO | `pruebas/guardianes/memoria_vr_chrome.test.js:29-30` sigue con `todo` y opcional (`GEMELO_VR=1`); sin cambios hoy. |
| L2-07 | Bajo | RESUELTO | `mundos/exterior/teselas.ts:169-172`: `decodificaOrto` ya no guarda `t.ortCv` (queda `null`), vacía el lienzo (`width = height = 0`) y guarda `ortW/ortH` antes. Único consumidor, `:219`, cae a `t.ortImg`. Prueba: `teselas.test.ts` «L2-07» (`ortCv` null, lienzo 0×0, `ortoEstado().vivas`). Fallaría sin el arreglo. |
| L2-10 | Bajo | RESUELTO | `mundos/exterior/marcadores-lidar.ts:66-71`: reescribe el atributo en su sitio (`pa.array.set`, `needsUpdate`); solo si cambia la longitud hace `dispose()` y pone uno nuevo. Prueba: `marcadores-lidar.test.ts` «L2-10» (mismo atributo, `version` +5, sin `dispose`, valor nuevo). Fallaría sin el arreglo. |
| L5-03 | Medio | ACEPTADO Y FIRMADO | `ACEPTADOS.md`, firma del 2026-11-14 por encargo de Antonio (estético; sombras reales en fase posterior). Código sin cambio. |
| L5-04 | Bajo | RESUELTO | `mundos/exterior/arboles-l0.ts` (e74befe2): `copa-l0` y `tronco-l0` usan `parcheTiempo(sh, false)` con clave `CLAVE_L0_TIEMPO`; la variante TSL añade `outputNode`. Cableado en `arranque.ts` (`parcheTiempo`, `tiempoTsl`). Pruebas: `arboles-l0.test.ts` «L5-04» ×2 (el parche llama a `parcheTiempo` sin viento, clave igual; TSL con `outputNode`). Fallan sin el arreglo, pero con dobles: nadie ha compilado el programa con three real. |
| L5-05 | Bajo | ACEPTADO Y FIRMADO | `ACEPTADOS.md` 2026-11-14 (se rehace en TSL, MU6). |
| L5-06 | Bajo | ACEPTADO Y FIRMADO | Ídem. |
| L5-07 | Bajo | RESUELTO | `arboles.ts:66-67,229,239`: `HIST_NIVEL = 1.08` para U1 y U2 (el nivel 0 ya tenía 1,15). Prueba: `arboles.test.ts:89` (450→480 sigue en 1; 510→2; 480 sigue en 2; 1650 sigue; 1750 fuera; 1650 sigue fuera). Falla sin el arreglo. |
| L5-08 | Bajo | RESUELTO (a, c, d) y ACEPTADO Y FIRMADO (b) | `arboles.ts:61-64,258,307`: `TRI2` = cota del catálogo (35), manchas de sombra (`TRI_SOMBRA = 2`) dentro de `triEst`; (c) por L1-04; (b) `TRI0 = 800` firmado el 2026-11-14. Prueba: `arboles.test.ts:102` (35 + 2 y 170 + 2). |
| L5-09 | Bajo | ACEPTADO Y FIRMADO | `ACEPTADOS.md` 2026-11-14. |
| L5-10 | Bajo | ACEPTADO Y FIRMADO | Ídem. |
| L5-11 | Bajo | ACEPTADO Y FIRMADO | Ídem. |
| L5-12 | Bajo | RESUELTO (solo documentación) | `.claude/skills/modelado-3d/SKILL.md:39` ahora dice que el motor no enciende `renderer.shadowMap`, y la afirmación es cierta: ningún `shadowMap.enabled = true` en `src/` (solo lecturas y el doble de `prueba-tsl.ts`). Sin guardián propio: es texto. |
| L7-04 | Medio | RESUELTO en código (Quest NO probado) | `mundos/comun/vr-sesion.ts:70-74` y `nucleo/render.ts` `conDestino`/`compila`: compila con `camaraXr` y presta `renderer.xr.getRenderTarget()` como destino activo, y lo devuelve en `finally`. `arranque.ts` pasa `destinoXr` y `Render` a la VR. Pruebas: `render.test.ts` «L7-04» (destino visto = multiview; devuelto aun si lanza) y `vr.test.ts` «L7-04» (`entraVR` compila con la cámara XR y el multiview; `VRX.compila.mv`). Con dobles: que el programa multiview salga de verdad solo lo dirá el Quest. |
| L7-07 | Medio | RESUELTO (solo documentación) | cf97b843: `builds.mjs`, `vite.config.js`, `PUBLICACION.md`, `nucleo/render.ts:3` y `MULTIVIEW.md` dicen «publicada, la elige el cargador». Un grep de «no activada», «aún no se usa», «ni la elige» y «sin enganchar» en apps, doc, CLAUDE.md y pruebas (sin histórico ni auditoría) no da nada, y ADR-0031 es coherente. Sin guardián de texto. |
| L7-08 | Bajo | ACEPTADO Y FIRMADO | `ACEPTADOS.md` 2026-11-14. |
| L7-09 | Bajo | RESUELTO | `herramientas/parche_multiview.mjs`: `configResolved` avisa una vez si `command === "serve"`, un alias de `three` apunta a super-three y no hay `optimizeDeps.exclude`. Prueba: `pruebas/guardianes/parche_multiview.test.js` «L7-09» (1 aviso en dev/VR; ninguno en build, en pantalla o con `exclude`). Falla sin el arreglo. Comprobado: `vite.config.js:106` instala el plugin y los alias salen de `aliasThree`. |
| L7-11 | Bajo | ACEPTADO Y FIRMADO | `ACEPTADOS.md` 2026-11-14. |
| L7-12 | Bajo | RESUELTO en código (Quest NO probado) | `vr-rig.ts` `vrIrA` marca `VRX.esperaSuelo` si `gm.sueloListo` es falso; `vr-teletransporte.ts:42-57`: el fundido espera a negro (tope 2 s), `vrAsienta` pone la altura a oscuras y abre; `teselas.ts` `sueloListo`; `exterior.ts` y `Mundo.sueloListo` en `arranque.ts`. Pruebas: `vr.test.ts` «L7-12» (espera, asienta, tope de 2 s, sin espera si hay suelo), `teselas.test.ts` «L7-12», `exterior.test.ts`. Fallan sin el arreglo. Coste de comodidad (hasta 2 s de negro) no probado. |
| L7-13 | Bajo | RESUELTO | `vr-panel.ts:224,335` (guardas de lista vacía; la parcela se pinta «–»), `paseo.ts` (`pr0` con guarda). Pruebas: `vr.test.ts` «L7-13» (panel y ◀/▶ sin lanzar ni mover el rig), `paseo.test.ts` «L7-13». No quedan otros `parcelas[` sin guarda en `vr*.ts`. |
| L7-14 | Bajo | PARCIAL | `CLAUDE.md:68` ya dice «guion de mano… no afirma nada; las pruebas de VR son `pruebas/guardianes/vr_*.test.js`». Pero `pruebas/vr_mock.js:5` sigue con la URL por defecto `gemelo_cerro.html` en `localhost:8000` (salida retirada por ADR-0021) y la ruta de Chrome de Windows, sin aserciones. Se corrigió el texto, no el script. |

## Recuento

Por veredicto (27 ids de la mañana; L2-02 y L2-04 se añaden aparte):

| Veredicto | Total | Ids |
|---|---|---|
| RESUELTO (con prueba o solo texto, según la fila) | 13 | L1-10, L1-11, L2-07, L2-10, L5-04, L5-07, L5-08, L5-12, L7-04, L7-07, L7-09, L7-12, L7-13 |
| RESUELTO (decisión cerrada, añadidos) | 2 | L2-02, L2-04 |
| ACEPTADO Y FIRMADO (2026-11-14) | 8 | L5-03, L5-05, L5-06, L5-09, L5-10, L5-11, L7-08, L7-11 |
| PARCIAL | 1 | L7-14 |
| PENDIENTE DEL BANCO | 5 | L1-06, L1-07, L1-09, L1-12, L2-06 |
| ABIERTO | 0 | |

Por severidad (sin L2-02 y L2-04):
- Medio (6): RESUELTO 2 (L7-04, L7-07); ACEPTADO Y FIRMADO 1 (L5-03); PENDIENTE DEL BANCO 3 (L1-06, L1-07, L2-06).
- Bajo (21): RESUELTO 11; ACEPTADO Y FIRMADO 7; PARCIAL 1 (L7-14); PENDIENTE DEL BANCO 2 (L1-09, L1-12).

## Lo que NO está bien cerrado

1. **L7-14, PARCIAL.** Texto corregido; el script mantiene la URL por defecto y la ruta de Chrome obsoletas, sin aserciones. Cambiar el defecto, o retirar el script si ya no sirve.
2. **L1-06, L1-07, L2-06, L1-09, L1-12, PENDIENTES DEL BANCO.** Nada del repo ha cambiado para L1-06, L1-07 y L2-06 (recalibrar `presupuesto.json`, comparar geometrías y texturas, quitar el `todo` de `memoria_vr_chrome`). Para L1-09 y L1-12 solo existe la medida (`tirones_olivos_chrome.test.js`, con `todo` y topes [SUPUESTO]), que decidirá si se arregla o se firma. Hasta entonces siguen abiertos, y `ACEPTADOS.md` no los acepta.

## Observaciones sobre los arreglos (no son hallazgos abiertos)

- Todos los RESUELTO de VR y L5-04 se vigilan solo con dobles (Vitest y Node). El Quest no los ha confirmado: el multiview real de L7-04, los 2 s de negro de L7-12 y el programa compartido de L5-04. En L5-04 la copa (`DoubleSide`) y el tronco comparten `customProgramCacheKey`, y los separa el `side` en la clave de three; no hay prueba con three real.
- L1-10: `ui/ajustes.ts:126` quita la escucha de «storage» en `libera()` del componente de Configuración, y los ajustes se siguen leyendo después. Tras ese `libera()`, un cambio hecho en otra pestaña ya no vacía la caché. Es un borde menor, sin prueba y sin consecuencia visible hoy.
- L1-11: la firma del reparto cubre solo qué olivo va en qué nivel. Está bien porque lo demás que cambia matrices o colores (cámara, exageración, tinte, NDVI, corrección) ya marca `cambio`; no vi ninguna regresión.
- L5-08: el tope de L1 baja unos pocos olivos cerca del tope de triángulos (las manchas suman 2 por olivo); sin medida en el banco, como dice el commit.
- L7-07 y L5-12 son solo texto y no tienen guardián. Coherente con la regla 13 de CLAUDE.md solo si se acepta que el texto no lo necesita.
- No vi regresiones evidentes en los ficheros tocados (`arboles.ts`, `arboles-l0.ts`, `teselas.ts`, `marcadores-lidar.ts`, `vr-*.ts`, `render.ts`, `parche_multiview.mjs`, `ajustes.ts`).
