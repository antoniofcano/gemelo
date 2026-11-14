# Re-verificación de las lentes 3 (datos) y 8 (mundos) contra el código actual

Método: lectura y Grep sobre `apps/web/src/` (el antiguo `motor/` ya no existe), `apps/web/plantilla.html`, `apps/web/herramientas/genera_motor.mjs`, `tuberia/hituelo_conv.py`, la skill `mundos-virtuales` y `pruebas/guardianes/`. No se ha ejecutado nada de navegador. Un intento de `node --test pruebas/guardianes/rotulos.test.js` no devolvió resumen en el tiempo dado (no cuenta como evidencia).
Aviso de método: `pruebas/guardianes/rotulos.test.js` filtra `apps/web/(motor|oficina)/...` (FUENTES), y `motor/` ya no existe; su regla "ningún olivo junto a «medido»" no mira `apps/web/src/`. Lo he comprobado a mano con Grep (sin hallazgos), pero el guardián de esa regla está vacío para el código actual.

## Lente 3 — datos

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L3-01 | medio | ABIERTO | `mundos/exterior/arboles.ts:112` sigue con `Mundo.ortoGrueso(c.x, c.y, c3)` sin `desp`/`kcor` en el color de los niveles 1 y 2; ningún guardián nombra `ortoGrueso`. |
| L3-02 | medio | ABIERTO (decisión 48/81 sin cerrar) | `mundos/exterior/factor-r8.ts`: `E.r8` = 0,5 "hasta que la cinta de campo (O4) confirme el 1"; el pie de `plantilla.html:310` sigue diciendo "La copa de cada olivo es medida" sin rotular el 0,5. |
| L3-03 | medio | ABIERTO | `plantilla.html:143` sigue diciendo "relativo dentro de esta parcela"; `mundos/exterior/ndvi.ts:40-47` calcula p5-p95 de toda la rejilla (`NDV.w * NDV.h`). |
| L3-04 | medio | RESUELTO | `genera_motor.mjs:34-66` (`textosFinca` sin cifras a mano; cabecera de `plantilla.html` neutra) y Cerro fuera (`sin_cerro.test.js`); lo vigila `rotulos.test.js:13` ("plantilla.html no lleva cifras de hectáreas ni de olivos escritas a mano") y `:37` (cabecera desde el índice). |
| L3-05 | medio | ABIERTO | `mundos/exterior/carteles.ts:103` sigue poniendo "OlivarTrack · leído `datos_de`" y no la fecha de la anotación fenológica (`fe.fecha` solo si falta `datos_de`). |
| L3-06 | medio | RESUELTO | Decisión 220 (cerrada, DECISIONS-PENDING): `plantilla.html:109` pastilla "detectado (LiDAR + regla)"; `carteles.ts:95,97,136,137` y `hazas.ts:138` dicen "detectado (LiDAR + regla)"; vigila `rotulos.test.js:31` (contrato de la haza) y `:37`; ver el aviso de método arriba. |
| L3-07 | medio | PARCIAL (decisión 221 cerrada: rotular ya "declaradas", calcular las medidas después) | Hecho: `genera_motor.mjs:42` ("ha declaradas (OlivarTrack)"), `parcelas.ts:93` (chip), vigila `rotulos.test.js:37,51`. Falta: `plantilla.html:132` sigue "Linde (barrera de luz) [medido]", `carteles.ts:99` "medida sobre la linde de la oficina", y la segunda cifra (área del polígono) no existe. |
| L3-08 | medio | ABIERTO | `mundos/exterior/mundo-hoy.ts:83,91` siguen con pastilla "medido" para fenología anotada y tareas de OlivarTrack; la tabla `PILL` (`:22`) no tiene "guardado"; `mundo_hoy.test.js:59-60` exige `etiqueta === "medido"`. |
| L3-09 | medio | ABIERTO | `mundo-hoy.ts:152` (pastilla "al día" por `r.completo`) y `:179` (`if (!x.ok) { if (!ultimo) art.hidden = true; return; }`): la tarjeta anterior se queda sin envejecer; sin prueba con reloj simulado. |
| L3-10 | medio | RESUELTO | `parcelas.ts:93` chip "· N ha declaradas · N olivos declarados"; cabecera "olivos detectados" (`genera_motor.mjs:47,50`); etiquetas uniformes vigiladas por `rotulos.test.js:51`. Siguen siendo tres cifras distintas, pero cada una rotulada. |
| L3-11 | medio | YA NO APLICA | No queda ninguna cifra de desfase fija ("1,5 m", "1,1") en `plantilla.html`, `historia.ts` ni `genera_motor.mjs`; la nota sale de `T.desfase_txt` opcional y las escenas de Cerro salieron (decisión 229, `sin_cerro.test.js`). |
| L3-12 | bajo | ABIERTO | `tuberia/hituelo_conv.py:46` sigue con `desfase=[0, 0]` en todas las parcelas; el desfase real (`:72`) solo se imprime (`:143`). |
| L3-13 | bajo | ABIERTO | `mundos/exterior/arboles-l0.ts:195`: "Guardado en OlivarTrack" → "sí"/"no" sin matiz de la regla de ≤ 4 m. |
| L3-14 | bajo | PARCIAL | Las escenas y `FINCA` de Cerro desaparecieron y fuera de Hituelo `ESCENAS_H` queda `[]` (`historia.ts:214`); pero `historia.ts:215` mantiene el título fijo "Cuatro fincas, veintisiete parcelas" (el cuerpo sí lee los datos) y `esH = D.finca_id === "hituelo"` (`:184`). |
| L3-15 | bajo | ABIERTO | `historia.ts:99`: asignación de tarea sin parcela a "la única parcela con ese nº de olivos" sin rotular como deducida. |
| L3-16 | bajo | ACEPTADO (propuesto en ACEPTADOS.md; firma de Antonio pendiente) | Sin cambio: `paisaje.ts:155` (poste ≥ 6 m), `:167` (alero ≥ 2,6 m, cumbrera ≥ alero + 0,4 m). |
| L3-17 | bajo | ACEPTADO (propuesto; firma pendiente) | Sin cambio: `paisaje.ts:287` (`lluvia > 0.3 || EST.clima.lluvia >= 12`), umbral sin fuente. |
| L3-18 | bajo | ACEPTADO (propuesto; firma pendiente), con arreglo parcial | `parcelas.ts:7` dice haber corregido el fallo con una sola profundidad (`f[1] ?`, `:52`); la fecha "25-oct-2026" sigue a mano en `parcelas.ts:53`. |
| L3-19 | bajo | ABIERTO | `ndvi.ts:51,56`: `rel()` sigue devolviendo 0,5 donde falta NDVI (tono medio). No he comprobado el punto (b) de la leyenda/fecha con solo el tinte activo. |
| L3-20 | bajo | YA NO APLICA | `plantilla.html` ya no lleva "9,4 puntos/m²" ni `historia.ts` "9 por m²"; `puntos_m2` es opcional del índice y `hituelo_conv.py:139` no lo escribe; queda solo "~6,5" en `doc/operacion/DATOS.md:8`. |
| L3-21 | bajo | ABIERTO | `plantilla.html:112` sigue "Desfase medio" y `parcelas.ts:62` calcula `Math.hypot(med(dx), med(dy))`; `parcelas.ts:7` lo deja "apuntado para el banco". |
| L3-22 | bajo | ABIERTO | Siguen al menos tres implementaciones: `historia.ts:110` (`haceIso`), `tiempo-puro.ts:170` (`hace`, "hace 100,0 h"), `mundo-hoy.ts:49` (`haceTxt`) y la de `carteles.ts:106`; cada una distinta. |
| L3-23 | bajo | ACEPTADO (propuesto; firma pendiente) | Sin cambio: `arboles-l0.ts:199` `"Olivo " + (b.i + 1)`; ACEPTADOS lo acepta hasta que haya `copas_id` estable. |

## Lente 8 — mundos

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L8-01 | medio | ABIERTO | `mundos/exterior/tiempo-paso.ts:128`: `lluvia.position.set(objetivo.x, objetivo.y - 20, objetivo.z)`; `objetivo` solo lo mueven `mundos/comun/camara.ts:51` (pan) y `parcelas.ts:72`. Sin guardián que aleje al paseante. |
| L8-02 | medio | ABIERTO | `mundos/comun/camara.ts:26,51`: la órbita no consulta el suelo; `objetivo.y` se fija al elegir parcela (`parcelas.ts:72`) y ni el pan ni el deslizador de exageración lo corrigen. |
| L8-03 | medio | PARCIAL | El código ya lo documenta (`mundos/exterior/sol-reserva.ts:5`, `arranque.ts:480-481`), pero `.claude/skills/mundos-virtuales/SKILL.md:20,26` sigue diciendo "`near` dinámico" y "constantes en `sol2()`" (el `near` es fijo por Ambiente). |
| L8-04 | medio | RESUELTO | `mundos/exterior/escena-tiles.ts:71-77` (L4-01): compara `centro_utm` y `z0` del tileset con los del índice y rechaza el tileset de otra exportación; prueba `escena-tiles.test.ts`, `pruebas/guardianes/escena3d.test.js`, `tiles3d.test.js`. |
| L8-05 | medio | RESUELTO | `tiempo-paso.ts:37-38,66-69` + `tiempo-puro.ts:110` (`rotuloOrigen` → "estimado" con `EST.activa`; cableado en `arranque.ts:579`); vigilan `tiempo.test.ts:73,175` y `pruebas/guardianes/tiempo_motor.test.js:83-90`. |
| L8-06 | medio | ABIERTO | `mundos/exterior/generados.ts:125,166`: la época sale de `Config.epocaDeFecha(t, fechaPrueba \|\| new Date())`, reloj de la máquina, no el del mundo. |
| L8-07 | medio | ABIERTO | `mundos/exterior/suelo-fondo.ts:43` (`BAJA = 1.5`, en VR más) sin cambio; `suelo_fondo.test.js` sigue afirmando que el fondo "nunca asoma"; no he visto cambio en el clamp del paseo (`mundos/comun/paseo.ts:146`, `D.ext` + 3 m). |
| L8-08 | bajo | ABIERTO | `mundos/exterior/teselas.ts:256`: `dy = Math.max(0, py - t.hc)` sin exagerar `hc`. |
| L8-09 | bajo | ABIERTO | `teselas.ts:291`: `G[(t.ky + k[1] - ky0) * NKX + (t.kx + k[0] - kx0)]` sin límites en x (en y el índice fuera de rango da `undefined`); otros sitios (`:176`) sí comprueban. |
| L8-10 | bajo | ACEPTADO (propuesto; firma pendiente) | Sin cambio: azimut del sol y viento con el norte de cuadrícula; ACEPTADOS lo acepta (< 1°). |
| L8-11 | bajo | ACEPTADO (propuesto; firma pendiente) | Sin cambio: `tiempo-puro.ts:181` `t.setHours(...)` en la zona del navegador. |
| L8-12 | bajo | RESUELTO | `mundo-hoy.ts:60-66` (`diaDeManana`: busca la fecha de mañana, no `dias[1]`); vigila `mundo-hoy.test.ts:61`. |
| L8-13 | bajo | ACEPTADO (propuesto; firma pendiente) | Sin cambio: `teselas.ts:202-215` (`pintaOrto` pinta `#8d8668` donde falta la tesela). |
| L8-14 | bajo | ACEPTADO (propuesto; firma pendiente) | Sin cambio: `nucleo/geometria.ts:16` `new Uint16Array(ni)` sin comprobar `nv <= 65535`. |

## Recuento

Lente 3 (23): ABIERTO 12 (medios 6: L3-01, 02, 03, 05, 08, 09; bajos 6: L3-12, 13, 15, 19, 21, 22) · PARCIAL 2 (medio L3-07, bajo L3-14) · RESUELTO 3 (medios L3-04, 06, 10) · YA NO APLICA 2 (medio L3-11, bajo L3-20) · ACEPTADO propuesto sin firma 4 (bajos L3-16, 17, 18, 23).
Lente 8 (14): ABIERTO 6 (medios 4: L8-01, 02, 06, 07; bajos 2: L8-08, 09) · PARCIAL 1 (medio L8-03) · RESUELTO 3 (medios L8-04, 05; bajo L8-12) · ACEPTADO propuesto sin firma 4 (bajos L8-10, 11, 13, 14).
Total (37): ABIERTO 18, PARCIAL 3, RESUELTO 6, YA NO APLICA 2, ACEPTADO 8, DECISIÓN DE ANTONIO 0 abiertas (L3-06 y L3-07 las cerraron las decisiones 220 y 221; la 48/81 de L3-02 sigue pendiente de la cinta de campo). Por severidad: medios (18): ABIERTO 10, PARCIAL 2, RESUELTO 5, YA NO APLICA 1; bajos (19): ABIERTO 8, PARCIAL 1, RESUELTO 1, YA NO APLICA 1, ACEPTADO 8 (cifras sumadas de ambas lentes; ninguno alto ni crítico en origen).

## Lo que NO pude revisar

- Nada ejecutado en navegador, Quest ni con datos reales: todo es lectura de código; L3-01, L3-03, L8-01, L8-02, L8-07 y L8-08 son aritmética/lectura, no captura.
- L3-19 (b) (leyenda y fecha con solo "Copas coloreadas por NDVI"): no abierto `capa-ndvi.ts` en detalle.
- L8-07: no comprobado a fondo el clamp del paseo en `paseo.ts` (solo la línea 146 de comentario).
- L3-07: no comprobado si `ha` coincide con el área del polígono (requiere datos).
- Los guardianes no se ejecutaron (un `node --test` de `rotulos.test.js` no dio resumen); nombro lo que dicen por lectura.
- Las firmas de Antonio en ACEPTADOS.md siguen "(pendiente)".
