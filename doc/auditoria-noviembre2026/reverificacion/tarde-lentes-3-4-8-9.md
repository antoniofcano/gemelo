# Segunda re-verificación (2026-11-14, tarde) de las lentes 3, 8, 4 y 9

Solo lectura (Read, Grep, git log/show); no se ejecutó ninguna prueba, build, Chrome ni Docker. Alcance: todo lo que los anexos de la mañana dejaron sin «RESUELTO» ni «YA NO APLICA» (45 ids). «Prueba» = leída: si ejercita el arreglo y si fallaría sin él. Sin datos privados copiados.

## Lente 3 — datos

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L3-01 | medio | RESUELTO | `arboles.ts:108-122` (`recolorea()` pide `Mundo.ortoGrueso` en x+dx(h), y+dy(h) con `TinteOrto.desfase`, `orto-tinte.ts`; cableado en `arranque.ts:418`; se rehace si cambia `kcor`, `:317`). Prueba `arboles.test.ts` «L3-01»: comprueba la coordenada pedida con y sin la dependencia y tras mover kcor; fallaría sin el arreglo. |
| L3-02 | medio | PARCIAL | Solo se rotuló: pie de `plantilla.html` y `genera_motor.mjs` y nota «gem» de `marcadores.ts` dicen «a la mitad de ese radio». El factor sigue en 0,5 (decisión 48/81, a la espera de la cinta de campo). Vigila `rotulos.test.js` «L3-02» (regex sobre el HTML y el texto fuente). |
| L3-03 | medio | RESUELTO (rótulo) | `plantilla.html:143` ya dice «relativo a toda la ventana de la finca… toda la rejilla»; la escala sigue siendo la de toda la rejilla (no cambia el cálculo). `rotulos.test.js` «L3-03» ata el texto a `const n = NDV.w * NDV.h` de `ndvi.ts`. |
| L3-05 | medio | RESUELTO | `carteles.ts:98-105`: «anotada <fecha de la anotación> / fecha desconocida» y «leído <datos_de>» solo para el % recogido. `carteles.test.js` comprueba ambos casos y que no salga «sin fecha». |
| L3-07 | medio | RESUELTO | `plantilla.html:113,135` (fila `kSup` «calculada sobre el linde»; linde «oficial»), `parcelas.ts` (`areaHaLinde`, relleno de `kSup`), `carteles.ts:96` y `hazas.ts:136` «calculada sobre la linde». Pruebas: `parcelas.test.ts` «L3-07» (área de polígonos conocidos y `kSup`), `rotulos.test.js` (HTML y barrido línea a línea de `apps/web/src` contra «medida sobre la linde»; la lista FUENTES ya incluye `apps/web/src`, hay un test que lo exige). La cifra `superficie_ha` de carteles/hazas viene de la api (columna), no la recalculo aquí. |
| L3-08 | medio | RESUELTO | `mundo-hoy.ts:22` (`anotado` → `p-guardado`), líneas de fenología y trabajo con `etiqueta: "anotado"`. `mundo_hoy.test.js` «L3-08» exige que no quede ninguna línea «medido». |
| L3-09 | medio | RESUELTO | `mundo-hoy.ts:102-107` (`pastilla()`, plazo 30 min) y `:187` (`else pinta(ultimo, true)`, `leidoMs`). `mundo_hoy.test.js` «L3-09» corre el motor con `Date.now` simulado: relectura fallida, «última lectura hace 10 min», luego 30 min; fallaría sin el arreglo. |
| L3-12 | bajo | RESUELTO | `hituelo_conv.py:46` `desfase=None`; esquema `["array","null"]`; CONTRATOS lo dice; el cliente no lee `parcela.desfase`. `rotulos.test.js` «L3-12» es solo textual (regex sobre el .py y el esquema), no ejecuta la exportación. |
| L3-13 | bajo | RESUELTO | `arboles-l0.ts:195` ya no dice «no» («sin marca emparejada a ≤ 4 m…»). `arboles-l0.test.ts` lo comprueba. |
| L3-14 | bajo | RESUELTO | `historia.ts:224` título con `fincas.length`/`parcelas.length`; `ESCENAS_H` vacío fuera de Hituelo. `rotulos.test.js` barre `apps/web/src` contra «Una/Dos/…fincas, ». |
| L3-15 | bajo | RESUELTO | `historia.ts:99-102` marca `deducida` y la historia añade «(parcela deducida por el recuento de olivos)» (`:208,211,212,281`). `historia_vivo.test.js` lo cubre (+3 líneas). |
| L3-16 | bajo | RESUELTO (rotulado) | `plantilla.html` («alturas mínimas supuestas: alero de 2,6 m, poste de 6 m… no por un caudal medido»). No firmado en ACEPTADOS: se arregló el texto. Guardián `rotulos.test.js` (regex). |
| L3-17 | bajo | RESUELTO (rotulado) | `estacion.ts:179`: «el arroyo se dibuja con agua (suposición de más de 12 mm en la semana; sin dato de caudal)». Vigilado por `rotulos.test.js` (regex sobre el fuente). |
| L3-18 | bajo | RESUELTO | `parcelas.ts` `fechaSuelo()` lee `textos.suelo_consulta` (esquema y tipo generado actualizados, patrón de fecha); sin él, sin fecha. `parcelas.test.ts` «L3-18» (sin campo / con campo). |
| L3-19 | bajo | RESUELTO | (a) `ndvi.ts:50-58` `rel()` devuelve NaN sin dato y `orto-tinte.ts:27` no tiñe si no es finito (`ndvi.test.ts` y `orto-tinte.test.ts` nuevos); el único consumidor de `rel` es el tinte. (b) `hud.ts` `textoLeyendaNdvi` con fecha y «cuadro de 10 × 10 m» (`hud.test.ts`). |
| L3-21 | bajo | RESUELTO (rótulo) | `plantilla.html:112` «Desfase típico (mediana)». El cálculo sigue siendo la norma de las medianas por eje, no la mediana de las normas (aceptable, pero no es exactamente «mediana»). `rotulos.test.js` solo mira la etiqueta. |
| L3-22 | bajo | PARCIAL | Se unificaron `historia.ts:110` y `tiempo-puro.ts:170`, `mundo-hoy.ts:51` y `carteles.ts:125` (90 min / 36 h / días), pero `fichas-tiempo.ts:106-110` sigue con otra regla (< 1 h en minutos, < 48 h en horas): el mensaje del commit («los mismos umbrales que… fichas del tiempo») es falso. Siguen siendo cinco copias (regla 12), no una función compartida. |
| L3-23 | bajo | PARCIAL | Cambiado solo el rótulo de la posición («UTM 30 · copa detectada, no tronco», `arboles-l0.ts:198`; `arboles-l0.test.ts`). El título sigue siendo «Olivo (b.i + 1)», posición en el array y no id estable; lo mitiga la fila «Id» (provisional/del censo). No se firmó en ACEPTADOS ni se cerró. |

## Lente 8 — mundos

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L8-01 | medio | RESUELTO | `tiempo-paso.ts:132` `anclaLluvia(paseando, camera.position, objetivo, lluvia.position)`; `paseando` cableado en `arranque.ts:577`. `tiempo-lluvia-ancla.test.ts` prueba la función pura (órbita vs paseo); el cableado (`d.paseando`) no tiene prueba propia, y si falta cae en la rama de órbita. |
| L8-02 | medio | RESUELTO | `camara.ts:27-36,61,70`: `asienta()` en pan y en el deslizador de exageración, y la cámara no baja de suelo + 2 m; `suelo` cableado en `arranque.ts:453`. `camara.test.ts` «L8-02» (ladera sintética, 4 casos, incluido el de «sin suelo»). Nota de comodidad honesta: solo Vitest, sin gesto real ni iPhone/Quest. No hay corrección al elegir parcela (como antes). |
| L8-03 | medio | RESUELTO | `.claude/skills/mundos-virtuales/SKILL.md:20,26` ya dicen `near` fijo (`NEAR_EXTERIOR`, 0,1 m en VR) y que `sol2()` es solo la reserva del deslizador. Sin guardián (es texto de skill). |
| L8-06 | medio | RESUELTO | `generados.ts:127` `fechaMundo()` (`ahoraMs` del mundo, cableado `arranque.ts:390`; `fechaPrueba` sigue mandando). `generados.test.ts` «L8-06» comprueba que `epocaDeFecha` recibe el reloj del mundo. |
| L8-07 | medio | PARCIAL (decisión: se queda, con motivo) | `suelo-fondo.ts:43-45` documenta el motivo (M6, el grueso interpolado puede quedar ~1,5 m sobre el fino) y el precio (BAJA·exag, hasta 4,5 m con exag 3). Prueba nueva `suelo_fondo.test.js` «L8-07»: comprueba que el fondo dibujado queda exactamente BAJA·exag bajo el grueso, es decir, fija la constante pero NO acota el caso real (paseante pisando el grueso donde no hay tesela con dato). El clamp `D.ext − 3 m` está en `exterior.ts:93-94` (`exterior.test.ts`), pero `ext` es la caja del NDVI (L4-07), no la de teselas: una tesela vacía dentro de ext queda «no probada con datos reales», como dice el propio comentario. No firmado en ACEPTADOS. |
| L8-08 | bajo | RESUELTO | `teselas.ts:259` `dist()` multiplica `hc` por `exag()` (cableado `arranque.ts:71`). `teselas.test.ts` «L8-08» (exag 1, 2, 3 y sin dependencia). |
| L8-09 | bajo | RESUELTO | `teselas.ts:294` usa `vecina()` (límites en x e y). `teselas.test.ts` «L8-09»: rejilla 2×2 con hueco, la tesela de la fila siguiente no se decodifica. |
| L8-10 | bajo | ACEPTADO Y FIRMADO | ACEPTADOS.md: firma «2026-11-14, por encargo de Antonio» (error < 1°). |
| L8-11 | bajo | ACEPTADO Y FIRMADO | ACEPTADOS.md, misma firma (`?hora` de depuración). |
| L8-13 | bajo | RESUELTO | `teselas.ts:209` pinta el mosaico de 1 m bajo las teselas en el minimapa de cerca. `teselas.test.ts` «L8-13» (orden de llamadas del lienzo). |
| L8-14 | bajo | RESUELTO | `geometria.ts:16` `Uint32Array` si `nv > 65535`. `geometria.test.ts` «L8-14» (45.602 y 68.403 vértices, último índice sin envolver). |

## Lente 4 — contratos

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L4-05 | medio | RESUELTO | `indice.schema.json` `$defs` `edificio`/`poste`/`punto3`/`punto_eje`/`arbol` (tipos regenerados); `paisaje.ts` `colorTejado()` con guarda. El exportador real (`hituelo_conv.py:170-178`, `col_en`) escribe color RGB entero, `zBase`, `zAlto`: casa con el esquema. `contratos.test.js` (7 rechazos nuevos) y `paisaje.test.ts` (edificio sin color no tumba el montaje). |
| L4-06 | medio | RESUELTO | `hituelo_conv.py:48-75` `con_margen()` toma la celda de margen de la vecina (lados y esquinas, revisado a mano contra el orden sur→norte/oeste→este) y el borde propio solo sin vecina; se calcula en una primera pasada para todas las teselas. `exportadores.test.js` + `pruebas/exportadores_sinteticos.py margen` (2×2 teselas, lados, esquinas, sin vecina). La prueba se salta sin numpy/scipy/pillow (lo dice). Costura visual en el motor, no medida. |
| L4-07 | medio | RESUELTO | Se corrigió el contrato, no el exportador: CONTRATOS fila `ext` y esquema dicen «caja del NDVI». `contratos.test.js` (fila de CONTRATOS + `arranque.ts` sigue colocando rejillas con `D.ext`) y `exportadores.test.js` (`ext` = `bbox25830` relativo al centro). |
| L4-08 | medio | RESUELTO | `contratos.test.js` compila `olivo-generado.schema.json`, valida la entrada de los 273 casos de las huellas y el `copas_param` del fixture, comprueba 6 rechazos y que la fila `copas_param` sea idéntica en ambos esquemas. |
| L4-09 | bajo | RESUELTO | `titulo_vr` y `config {factorR8}` en `indice.schema.json` (cerrado) y en el tipo generado; `contratos.test.js` exige que cada `D.<campo>` leído por el motor esté en el esquema. |
| L4-10 | bajo | RESUELTO | `finca_8_teselas.py:31,103` lista blanca = propiedades del esquema (avisa de lo que descarta) y `additionalProperties:false` en la raíz del esquema. `exportadores.test.js`: ningún índice exportado (4 variantes) lleva claves fuera del esquema. |
| L4-11 | bajo | RESUELTO | `hituelo_conv.py:18-25,138,151` `cm_i16()` para `dtm` y `grueso`: error claro fuera de Int16 y con valores no finitos. `exportadores.test.js` (alto, bajo, NaN). Riesgo: ahora un NaN en `celdas` para la exportación (antes pasaba en silencio como basura); no probado con los datos reales. |
| L4-13 | bajo | RESUELTO | CONTRATOS §1.1 completo (`copas_semilla`, `copas_param`, `biodiversidad`, `titulo_vr`, `config`, `ot-hoy`, eventos, `juegos-clasificacion`); `contratos.test.js` compara opcionales/obligatorios con el esquema y que cada fichero de `contratos/` esté nombrado. |
| L4-14 | bajo | RESUELTO | `olivos-tiles.ts:120-122` apaga si `contrato_origen !== D.v` o `srs !== "EPSG:25830"`; el generador del tileset ya los escribe (`genera.mjs:376`), así que no apaga los reales. `olivos-tiles.test.ts` «L4-14» (v3 y EPSG:4326). |

## Lente 9 — seguridad y privacidad

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L9-01 | medio | DECISIÓN DE ANTONIO, cerrada | Nº 219 (2026-11-06), sin cambio hoy. |
| L9-02 | bajo | DECISIÓN DE ANTONIO, cerrada | Misma decisión; hoy se añadió además el patrón de franja UTM norte (L9-08). |
| L9-05 | bajo | ACEPTADO Y FIRMADO | ACEPTADOS.md: firma «2026-11-14, por encargo de Antonio» (CSP informativa hasta activar la completa). |
| L9-06 | medio | PARCIAL (mitigado, no revocado) | `reingreso.ts` `vuelveAExpulsar` cableado: `presencia/rutas.ts:63-77` (`setInterval` cada `BARRIDO_MS` = 20 s, `unref`, limpiado en `onClose`), con las marcas de `Expulsados` (`rutas.ts:39`) y de guiadas (`voz_rutas.ts:75,309`); `corro.ts` añade el barrido de corros. Ventana: hasta ~20 s dentro de la sala por cada reingreso, durante TTL_S = 15 min tras la expulsión (cubre la vida del token firmado antes). Huecos: las marcas viven en memoria (un reinicio de la api las pierde, y entonces un token anterior vuelve a valer hasta 15 min); el barrido se desactiva con `relojVoz` (pruebas); un error no-404 de LiveKit en una sala corta esa pasada para las demás; sigue «no verificado contra LiveKit real». Prueba `apps/api/pruebas/unidad/reingreso.test.ts` (5 casos con dobles: ejercita `vuelveAExpulsar` y `Corros.barre`), pero NINGUNA prueba comprueba el cableado del `setInterval` en `rutas.ts`: quitarlo no rompe nada. El webhook de LiveKit (MU3-2) sigue sin hacer. |
| L9-07 | bajo | RESUELTO (api y cliente) | `apps/api/src/yo/alias.ts` normaliza como `sala.ts` y `yo/rutas.ts` lo usa (`aliasReservado`, «oficina» en cualquier sitio, papeles como alias entero). `alias.test.ts` incluye un test que exige que la cadena de normalización de `sala.ts` y la de la api sigan siendo idénticas. |
| L9-08 | bajo | PARCIAL | `secretos.test.js` añade secreto/clave/contraseña en español con valor ≥ 16 y cifra, `Bearer`, enlaces `claude.ai/chat|share/…`, y la franja UTM norte (con y sin separadores), con muestras que marcan y que no (probado por construcción con valores inventados; la prueba de muestras falla si un patrón se rompe). Falta: el historial de git sigue sin escanearse en CI (`puerta.yml` no lleva gitleaks; solo se pasó a mano una vez); el patrón UTM cubre solo la franja norte, no el este (el centro de Hituelo no tiene patrón); `ID_ARTEFACTO` sigue limitado a 20-24 alfanuméricos. |
| L9-09 | bajo | RESUELTO | `indice.schema.json`: `ot` y sus parcelas/tareas/fenología con `additionalProperties:false` y lista blanca igual a lo que copia `hituelo_conv.py:116`. `contratos.test.js` rechaza campos extra (asignados, cuadrilla…). Limitación: el `ot` «vivo» que arma el cliente (`historia.ts`) lleva campos propios (`deducida`, `incompleto`) que no pasan por el esquema (no es un contrato de datos publicado). |

## Recuento (45 ids)

| Veredicto | Total | Lente 3 | Lente 8 | Lente 4 | Lente 9 |
|---|---|---|---|---|---|
| RESUELTO | 34 | 15 | 8 | 9 | 2 |
| PARCIAL | 6 | 3 (L3-02, 22, 23) | 1 (L8-07) | 0 | 2 (L9-06, 08) |
| ACEPTADO Y FIRMADO (2026-11-14) | 3 | 0 | 2 (L8-10, 11) | 0 | 1 (L9-05) |
| DECISIÓN DE ANTONIO, cerrada (nº 219) | 2 | 0 | 0 | 0 | 2 (L9-01, 02) |
| ABIERTO | 0 | 0 | 0 | 0 | 0 |

Por severidad (origen):
- Medios (18): RESUELTO 14 (L3: 01, 03, 05, 07, 08, 09; L8: 01, 02, 03, 06; L4: 05, 06, 07, 08), PARCIAL 3 (L3-02, L8-07, L9-06), DECISIÓN 1 (L9-01).
- Bajos (27): RESUELTO 20 (L3: 12, 13, 14, 15, 16, 17, 18, 19, 21; L8: 08, 09, 13, 14; L4: 09, 10, 11, 13, 14; L9: 07, 09), PARCIAL 3 (L3-22, L3-23, L9-08), ACEPTADO Y FIRMADO 3 (L8-10, L8-11, L9-05), DECISIÓN 1 (L9-02).

(Total 18 + 27 = 45.)

## Lo que NO está bien cerrado

1. L3-22: `fichas-tiempo.ts:106-110` mantiene otra regla de «hace N» (la fusión de hoy no la tocó) y siguen cinco copias en vez de una función.
2. L9-06: mitigado, no revocado; marcas en memoria (reinicio), sin prueba del cableado en `rutas.ts`, sin LiveKit real.
3. L9-08: sin escaneo del historial en CI; el patrón UTM solo cubre el norte.
4. L8-07: la prueba nueva fija la constante, no acota el caso real; sin firma en ACEPTADOS.
5. L3-02: solo rotulado; el factor 0,5 depende de la cinta de campo (decisión 48/81).
6. L3-23: el título «Olivo N» sigue siendo posición en el array.
7. L4-11: la exportación ahora falla con NaN; sin probar con los datos reales.

Pruebas débiles (pasarían sin parte del arreglo): `rotulos.test.js` (L3-02, 03, 12, 16, 17) son regex sobre texto fuente; L3-12 no ejecuta la exportación; L8-01 no prueba el cableado; L4-06 y L4-11 se saltan sin numpy/scipy/pillow.

Datos privados en lo cambiado: ninguno encontrado (barrido de las líneas añadidas desde 14b4be09: sin rutas locales, correos, IPs de infraestructura, ids de artefactos ni coordenadas). Observación menor: el patrón nuevo de `secretos.test.js` acota la franja norte (km 4.165 a 4.179) de la zona de las fincas; es de nivel comarca, como el que ya había (4175-4179), pero es una pista pública.
