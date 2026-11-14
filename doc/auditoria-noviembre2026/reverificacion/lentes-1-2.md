# Re-verificación de las lentes 1 y 2 contra el código actual

Solo lectura. Rutas relativas a `apps/web/src/` salvo que se diga. Comprobado también con `npx vitest run` de nube, follaje, teselas, arboles, escena-tiles y lejanos (6 ficheros, 51 pruebas en verde). Nada se ha medido en Chrome ni en Quest: donde el defecto era una cifra, el veredicto es sobre el mecanismo, no sobre la medida.

## Lente 1 — Rendimiento

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L1-01 | Medio | RESUELTO | `mundos/exterior/nube.ts` `actualizaNubeTeselas` sale si `Estado.modo !== "nube"`; `actualizaNube` suelta todo a los `SUELTA_FUERA_S` = 2 s. Prueba: `nube.test.ts` «L1-01 y L2-02: fuera del modo nube…». |
| L1-02 | Medio | RESUELTO | `nube.ts`: `NubePuro.reparte` se aplica a todos los niveles y se recalcula en cada pasada (no solo al cambiar de nivel). Prueba: `nube.test.ts` «L1-02: … nunca pasa de 1,4 M … se recalcula al cambiar la cámara». Queda un suelo `MIN_PUNTOS` = 1500 por malla (puede pasar del tope con muchísimas mallas; está escrito). |
| L1-03 | Medio | RESUELTO | `mundos/exterior/arboles.ts:248` en VR usa `VrControlPuro.escalaVr` (`nucleo/presupuesto.ts:175`, tope 1, solo sube si los triángulos caben en el perfil). Pruebas: `nucleo/presupuesto.test.ts` «A1-12 (L1-03)» y `pruebas/guardianes/vr_control.test.js:112`. Matiz: `Ajustes.escalaArboles()` (calidad fijada «Alta» = 1,6) se aplica antes y también en VR (`arboles.ts:247-248`); es decisión de la persona, no de la regla. Efecto en el Quest: NO VERIFICABLE SIN EJECUTAR. |
| L1-04 | Medio | RESUELTO | `arboles.ts:185-187` el nivel 0 cuenta en `TOPE_TRI` (`topeL0`); `arboles.ts:251` la escala baja hasta 1,0 pasado 1,7 M. Pruebas: `arboles.test.ts:58` y `:74`. Las llamadas (≈250) quedan acotadas por el recorte de olivos, pero no hay medida de llamadas con `esc` alto: NO VERIFICABLE SIN EJECUTAR esa parte. |
| L1-05 | Medio | RESUELTO | `mundos/exterior/teselas.ts:219` `decodificaG` y `:258` `avisaG` corren en la Cola (claves «M»/«MA»), a rebanadas; los oyentes, uno por rebanada. Prueba: `teselas.test.ts:47` «al llegar el json no se decodifica nada fuera de la Cola». Matiz: `JSON.parse` del json es una sola rebanada; el coste real por rebanada no está medido. |
| L1-06 | Medio | ABIERTO | `pruebas/presupuesto.json` sin cambios desde la auditoría: «lejos» sigue en 155 llamadas, `$comment` de «lejos» y `fixture_olivos_escalera.cerca` = 1.000.000 «calculado» intactos. `pruebas/guardianes/_navegador.js` `mide` no fija `arbsc` ni `hora`/`fecha` (el último cambio, c1a10539, no tocó eso). Es la fila MU0-5 de `doc/rumbo/PLAN.md:195`, todavía ⬜. |
| L1-07 | Medio | ABIERTO | `pruebas/guardianes/_navegador.js:165` y `carga.test.js:39-42` solo comparan `heapMB` (`usedJSHeapSize`); `geometrias`/`texturas` se recogen y no se comparan; sin `measureUserAgentSpecificMemory`. Entra en MU0-5 (⬜). Que `usedJSHeapSize` excluya los `ArrayBuffer`: NO VERIFICABLE SIN EJECUTAR. |
| L1-08 | Medio | RESUELTO | `mundos/exterior/follaje.ts:124-139`: una sola malla de sombras, `quitaSombras` (remove + dispose) solo si cambia el número de olivos, y ya no toca `instSombraPA`. Pruebas: `follaje.test.ts:41` (L2-01/L1-08, diez llamadas = una malla) y `:49` (L5-02, `instSombraPA` intacta). Que las sombras del paisaje se vean en pantalla: NO VERIFICABLE SIN EJECUTAR. |
| L1-09 | Bajo | ABIERTO (agrupado como ACEPTADO) | `reclasifica`/`reclasificaEscalera` siguen síncronas en `arboles.ts:169-290`; `olivos-tiles.ts:163-167` hace `Mascara` y `repartirT` en el `.then` de la huella, fuera de la Cola. `ACEPTADOS.md` lo propone (L1-09..L1-12, «se arreglan solo si la medida los señala»); la firma de Antonio sigue pendiente. |
| L1-10 | Bajo | PARCIAL (agrupado como ACEPTADO) | Arreglado el sonido: `mundos/exterior/sonido.ts:4,46-48` guarda los valores. Sigue sin caché `Ajustes.lee` (`ui/ajustes.ts:49,56`: `getItem` + `JSON.parse` en cada llamada) y se llama por fotograma desde `arranque.ts` (`ahorro` → `nucleo/bucle.ts:238`), `ui/depura.ts:41` («avanzado.contador») y `mundos/comun/paseo.ts:70,155` («vista.altura»). Firma de Antonio pendiente. |
| L1-11 | Bajo | ABIERTO (agrupado como ACEPTADO) | `arboles.ts:309` repite `reclasifica` cada 0,7/1,5 s con la cámara quieta y `arboles.ts:235-237` marca `needsUpdate` en todos los búferes de los niveles 1 y 2 sin condición. Firma pendiente. |
| L1-12 | Bajo | ABIERTO (agrupado como ACEPTADO) | `mundos/exterior/lejanos.ts:307-324` `hornea` hace `renderer.render` en el fotograma; solo las siluetas van a la Cola (`lejanos.ts:287`, «Lsil»). Firma pendiente. |

## Lente 2 — Memoria

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L2-01 | Medio | RESUELTO | `mundos/exterior/follaje.ts:124-139` (misma corrección que L1-08). Pruebas: `follaje.test.ts:41`, `:49`, `:56` (cambia el nº de olivos: remove + dispose) y `:72`. |
| L2-02 | Medio | RESUELTO en código; decisión de Antonio sin firmar | `nube.ts`: la nube solo existe en modo nube, se suelta a los 2 s fuera de él y `LIBERA_NUBE_M` = 1,2 × `RADIO_CARGA` (2.160 m). Pruebas: `nube.test.ts` (fuera del modo nube; «una malla a más de 1,2 × 1.800 m se suelta»). `ACEPTADOS.md` lista L2-02/L2-04 como decisión de Antonio (precarga o bajo demanda): el código ya eligió «bajo demanda» y esa firma sigue pendiente. Bytes realmente liberados: NO VERIFICABLE SIN EJECUTAR. |
| L2-03 | Medio | RESUELTO | `mundos/exterior/teselas.ts:297-325` `sueltaTesela`/`sueltaLejos` (dtm, chm, suel, pts, ortofoto, `bins`, `ortImg`) y `libera()`; `alSoltar` avisa a 04d. Prueba: `teselas.test.ts:88` y `:104`, `:114`, `:123`. |
| L2-04 | Medio | RESUELTO (cifras sin medir) | `mundos/exterior/escena-tiles.ts:90-110` `LruTilesPuro`: caché LRU propio con `minBytesSize`/`maxBytesSize` por clase (escritorio 322-430 MB, móvil 160-215, Quest 128-172) y por perfil de VR; aplicado en `:266`. Prueba: `escena-tiles.test.ts:119` «L2-04». Los MB de móvil y Quest son `[SUPUESTO]`, sin medir; la decisión de L2-02/L2-04 de ACEPTADOS sigue sin firma. |
| L2-05 | Medio | RESUELTO | `libera()` real en tiempo (`tiempo.ts:157`, `tiempo-cielo/-lluvia/-barrera.ts`), vida (`vida.ts`), paisaje (`paisaje.ts:330`), balizas (`balizas.ts:322`), hierba/21_suelo (`hierba.ts:282`) y 04d (`terreno.ts:254,528`: texturas de cada tesela, `RUI0`, `t.uni`). Pruebas: `tiempo.test.ts:180`, `vida.test.ts`, `paisaje.test.ts:124`, `balizas.test.ts:145`, `hierba.test.ts:69`, `terreno.test.ts:76`. Los ~18 MB de 04d siguen siendo estimación. |
| L2-06 | Medio | PARCIAL | Cambios reales en `mundos/comun/vr-sesion.ts:100-116` (escucha «end» y último `XRFrame`) y `mandos.ts`, con `vr.test.ts:158` y `mandos.test.ts:66`. Pero la prueba de navegador sigue `todo` y opcional: `pruebas/guardianes/memoria_vr_chrome.test.js:30` (`todo: "AG-P1b…"`, `GEMELO_VR=1`) y `PLAN.md` (A3-6c) dice «el goteo de VR sigue abierto»; MU0-5 ⬜. Si el goteo de ~3 geometrías y 1 textura por sesión ha desaparecido: NO VERIFICABLE SIN EJECUTAR (Chrome). |
| L2-07 | Bajo | ABIERTO | `mundos/exterior/teselas.ts:161-163` guarda `t.ortCv` y `t.ortPix` (el doble); `ortoEstado().mb` (`:287`) solo suma `ortPix`; sin prueba de bytes. |
| L2-08 | Bajo | RESUELTO | `mundos/exterior/lejanos.ts:177` (`close()` del ImageBitmap al hacer dispose), `:185` (si un atlas falla, se libera el que llegó), `:416` (`libera`). Prueba: `lejanos.test.ts:57` y `:67`. (Otro bitmap, el de `personalizacion.ts`, también cerrado: `personalizacion.test.ts:67`.) |
| L2-09 | Bajo | RESUELTO | `mundos/comun/avatares.ts:620-625` (`libera()` vacía `bufs`, `LIB` y tablas). Prueba: `avatares.test.ts:51` (`expect(r.api.estado().bufs).toBe(0)`). |
| L2-10 | Bajo | ABIERTO | `mundos/exterior/marcadores-lidar.ts:66` sigue haciendo `desfGeo.setAttribute("position", new Float32BufferAttribute(seg, 3))` en cada `coloca()` sin liberar el atributo anterior; no hay marca «L2-10» en el código ni prueba. Es un búfer pequeño que recoge el GC. |
| L2-11 | Bajo | RESUELTO | Relojes parados con `libera()`: `ui/hud.ts:228` y `ui/hud-personal.ts:78` (`sol.intervalo`); el de Vigía y el `MutationObserver` en `tiempo*.ts`/`tiempo-fichas.ts:40`. Las escuchas pasan por `creaSoltador()` (`ui/pantalla.ts:17`, `mundos/comun/camara.ts:23`, `nucleo/soltador.ts`). Pruebas: `tiempo.test.ts` (L2-11), `vida.test.ts`. Solo muestreé camara, pantalla, hud, hud-personal y tiempo; las ~150 escuchas de los demás módulos no se revisaron una a una. |

## Recuento

Por veredicto (23 hallazgos: 12 de la lente 1, 11 de la lente 2):

| Veredicto | Lente 1 | Lente 2 | Total |
|---|---|---|---|
| RESUELTO (con prueba) | 6 (L1-01, 02, 03, 04, 05, 08) | 8 (L2-01, 02, 03, 04, 05, 08, 09, 11) | 14 |
| PARCIAL | 1 (L1-10) | 1 (L2-06) | 2 |
| ABIERTO | 5 (L1-06, 07, 09, 11, 12) | 2 (L2-07, 10) | 7 |
| ACEPTADO con firma pendiente | — | — | (L1-09..L1-12 propuestos en ACEPTADOS.md; sin firma; L2-02/L2-04 son «decisión de Antonio», sin firma) |
| YA NO APLICA / NO VERIFICABLE como veredicto único | 0 | 0 | 0 |

(L1-09, L1-11, L1-12 y L1-10 cuentan como ABIERTO/PARCIAL y además están propuestos en ACEPTADOS.md. L2-02 y L2-04 cuentan como RESUELTO en código.)

Por severidad (Medio / Bajo; no había críticos ni altos):
- Medios (L1-01..L1-08, L2-01..L2-06 = 14): RESUELTO 11 (L1-01, 02, 03, 04, 05, 08, L2-01, 02, 03, 04, 05), PARCIAL 1 (L2-06), ABIERTO 2 (L1-06, L1-07).
- Bajos (L1-09..L1-12, L2-07..L2-11 = 9): RESUELTO 3 (L2-08, L2-09, L2-11), PARCIAL 1 (L1-10), ABIERTO 5 (L1-09, L1-11, L1-12, L2-07, L2-10).

Total corregido: RESUELTO 14 (11 medios + 3 bajos), PARCIAL 2, ABIERTO 7.

## Lo que no pude revisar o no es verificable sin ejecutar

- Todas las cifras de memoria, puntos, triángulos y llamadas (la nube oculta, el goteo de VR, los 18 MB de 04d, el doble de ortofotos, el coste en ms de `decodificaG`): requieren Chrome/Quest y la skill `medir`.
- Que el goteo de AG-P1b (L2-06) haya desaparecido: solo hay pruebas unitarias con mocks; la de Chrome sigue en `todo`.
- Que `usedJSHeapSize` excluya los `ArrayBuffer` (L1-07) y que el GC libere de verdad los búferes de WebGL (L2-10).
- Los valores del LRU de móvil y Quest (L2-04): `[SUPUESTO]`.
- Las ~150 escuchas de módulos no componentes (L2-11) más allá de la muestra citada; `07ab`/`generados*.ts`, la tubería y las tripas de 3d-tiles-renderer, igual que en la auditoría original.
- No ejecuté ninguna prueba de `pruebas/guardianes/` (solo vitest de seis ficheros).
