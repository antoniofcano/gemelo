# Medidas del motor por teselas (Chrome headless con SwiftShader, 1000×900; los fps reales faltan: solo un iPhone los da)

> Referencia viva: se actualiza al volver a medir (protocolo: [skill `medir`](../../.claude/skills/medir/SKILL.md)). Cifras de octubre de 2026; solo SwiftShader, los fps reales faltan.

> **Invalidadas el 2026-10-30 (T8 fase 2, [ADR-0021](../adr/0021-se-retira-la-salida-artefacto-y-la-escena-de-siempre.md)).** Todas las cifras medidas con la **escena de siempre** (`Terreno`, `?escena=clasica`, topes `fixture` de `pruebas/presupuesto.json`) o con la **salida artefacto / modo embebido** ya no se pueden reproducir: se conservan como historia, no como referencia. Son las de «Cerro Velasco, antes y después», «Escala», «three 0.128.0 → 0.186.1», «Presencia simulada», «Hituelo real con `?olivos=gen`» y las comparaciones «escena de siempre frente a 3D Tiles» de «Criterios 2, 3 y 4 del ADR-0015». Las cifras de la escena 3D Tiles (secciones de Hituelo en 3D Tiles y topes `fixture_escena_tiles`) siguen siendo las de la única escena, pero el banco debe volver a medir con la página de Vite antes de afirmar nada nuevo (TODO-C: topes definitivos).

## Cerro Velasco, antes y después (mismas cámaras; banco de entonces `prueba.js`, no versionado: hoy `pruebas/prueba3.js`)

| Vista | Llamadas | Triángulos | Puntos | Heap JS |
|---|---|---|---|---|
| Mapa, modo Nube — antes | 214 | 765 k | 679 k | 91 MB |
| Mapa, modo Nube — después | 234 | 238 k | 232 k | 84 MB |
| Mapa, modo Gemelo — antes | 220 | 1.677 k | 973 k | 185 MB |
| Mapa, modo Gemelo — después | 225 | 261 k | 0,6 k | 83 MB |
| Cerca, Gemelo — antes | 134 | 1.708 k | 973 k | 262 MB |
| Cerca, Gemelo — después | 137 | 437 k | 0,6 k | 92 MB |
| Tiempo hasta «listo» | 11,3 s | | | 5,5 s (embebido) · 3 s (ficheros) |

El paso a Gemelo ya no bloquea (los olivos de 64 m se construyen a rebanadas; antes 1,35 s medidos por el agente B).

## Escala (modo ficheros, `prueba3.js`)

| Mundo | Teselas | Olivos | Mapa lejano (llamadas / k tri) | Cerca (llamadas / k tri) | Heap |
|---|---|---|---|---|---|
| Cerro | 12 | 1.077 | 225 / 238 | 175 / 671 | 61→92 MB |
| Cerro ×9 en el espacio (banco de estrés) | 108 | 9.693 | 592 / 409 (sobre todo objetos por parcela) | 115 / 757 | 59→141 MB |
| **Hituelo** | 46 | 5.859 | 496 / 616 | 166 / 1.389 | 52→138 MB |

Presupuesto de diseño por fotograma: ≤ 1,7 M triángulos, ≤ 1,4 M puntos (tope explícito), ~250 llamadas en vistas de cerca. En Hituelo el cerca llega a 1,4 M triángulos con 28 olivos de nivel 0 construidos: hay margen, pero **hay que medirlo en el iPhone**.

## three 0.128.0 → 0.186.1 (2026-10-29, fixture sintético, [ADR-0016](../adr/0016-actualizacion-de-three.md))

`GEMELO_MIDE=1 node --test pruebas/guardianes/carga.test.js`, salida artefacto, escenarios de `pruebas/guardianes/_navegador.js` (900×650). Cerro / Hituelo.

| Escenario | Llamadas r128 → 0.186.1 | Triángulos r128 → 0.186.1 | Puntos | Heap JS |
|---|---|---|---|---|
| lejos | 167 / 167 → 167 / 168 | 82.156 → 82.364 / 82.366 | 620 = | 24 → 27 MB |
| cerca | 55 / 55 → 56 / 56 | 430.374 → 430.654 | 2.825 = | 35-36 → 36 MB |
| nube | 133 / 88 → 94 / 98 (varía con la carga, no se compara) | 176.317 / 173.339 → 173.738 / 174.032 | 2.960 = | 34 → 37-38 MB |

Sin cambios de presupuesto: lo que la subida añadía se quitó en el código (lo transparente de dos caras volvía a dibujarse en dos pasadas: `forceSinglePass`; las estelas vacías contaban una llamada: no se dibujan vacías). Los conos tienen menos triángulos (sin caras degeneradas en la punta). El paquete de Vite (motor + three) pesa 981 kB sin comprimir; la salida artefacto pide a jsDelivr `three.module.js` (0,66 MB) y `three.core.js` (1,46 MB) sin minificar. **fps: no medidos** (SwiftShader).

## Presencia simulada (F2 sin red, 2026-10-29, fixture sintético, [presencia](../../contratos/presencia.md))

Cerro embebido, escenarios `lejos` y `cerca` de `pruebas/guardianes/_navegador.js` (900×650), Chrome headless con SwiftShader, dos repeticiones; `?presencia=sim&n=…`. Las llamadas y los triángulos que añade la presencia no varían entre repeticiones; los del resto de la escena en `cerca` sí (lo que la `Cola` ha construido al medir).

| Visitantes | Llamadas lejos / cerca | Triángulos añadidos | JS de la presencia por fotograma (media; pico) | Geometrías / texturas añadidas |
|---|---|---|---|---|
| 0 (sin la bandera) | 168 / 56 | 0 | 0 | 0 / 0 |
| 10 (3 de Quest) | 173 / 61 (+5) | +508 | 0,31–0,48 ms; 0,7 ms | +5 / +1 |
| 40 (11 de Quest) | 173 / 61 (+5) | +1.984 | 0,56–0,91 ms; 1,1 ms | +5 / +1 |

- **Las mismas 5 llamadas con 10 que con 40** (cuerpo, cabeza, sombrero, manos, nombres): instanciado. Unos 50 triángulos por avatar. Muy por debajo de los topes de `pruebas/presupuesto.json`, que no se tocan.
- **Sin la bandera se dibuja lo mismo que en `main`:** `carga.test.js` con `GEMELO_MIDE=1`, cuatro pasadas de `main` y cuatro de la rama: Cerro `lejos` 167–168 / 82.364–82.366 y `cerca` 56 / 430.654 en las dos; puntos idénticos; los valores de Hituelo y de `nube` cambian de una pasada a otra también en `main` (lo que haya cargado la `Cola`) y la rama no da ninguno que `main` no dé.
- **El JS** es el de `Presencia.actualiza` (andar de los simulados, codificar, red de mentira, decodificar, interpolar y colocar instancias), medido con `performance.now()` en este PC; el del fotograma entero en SwiftShader (1–3 fps) no significa nada. **En iPhone y Quest, no medido.**
- **VR con el WebXR simulado** (`pruebas/mock_xr.js`): con 10 y 40 visitantes entra en VR, los avatares siguen en la escena y llegan todos (`vistos = n`), sin errores. Las llamadas en VR no se comparan (varían de una pasada a otra con la carga).
- **Red y retardo:** los de la simulación en el navegador no valen (la simulación va al ritmo de los fotogramas y SwiftShader da 1–3). Los de referencia son los de Node en `presencia.test.js` (códec: ≤ 5 mm y 0,241°; interpolación: ≤ 0,8 cm a 10 Hz y ≤ 6 cm a 2 Hz) y la carga útil calculada del contrato (24 B × 10 Hz = 240 B/s por cercano en escritorio; 560 B/s en Quest). Sin LiveKit no hay cifra de retardo real.
- **P5 (2026-10-29), el muñeco del paseante** (tronco, piernas y brazos instanciados, cabeza de icosaedro): mismas medidas, `GEMELO_MIDE=1 node --test pruebas/guardianes/presencia.test.js`, Cerro del fixture. Llamadas: 55 sin presencia → 60 con 10 y con 40 visitantes (+5, como antes). Triángulos: +988 con 10 (3 con gafas) y +3.904 con 40 (11 con gafas): ≈ 98 por avatar (antes ≈ 50). JS de la presencia por fotograma: 0,73 ms con 10 y 1,21 ms con 40 (SwiftShader, una pasada). Capturas de `?presencia=sim&n=10`: encargadas al banco.

## Presencia con LiveKit real (P4, 2026-10-29)

Contrato: [presencia](../../contratos/presencia.md).

`GEMELO_DOCKER=1 node --test pruebas/guardianes/presencia_dev.test.js`, entorno de `infra/dev` (LiveKit 1.13.11 `--dev` en Docker Desktop, límite de 256 MB; señalización por Caddy en `wss://localhost:8743/rtc`), Chrome headless con SwiftShader, todo en el **mismo equipo** (i5 de 4 núcleos, 7,7 GB, Windows 10). El retardo es el de extremo a extremo con el **reloj del emisor que va en la cabecera de la pose** (bytes 4–7) frente a la llegada: en el navegador, `performance.timeOrigin` de cada página más su `performance.now()`; en Node, el reloj de pared del equipo. Como emisor y receptor son el mismo equipo, el reloj es el mismo y no hay desfase que estimar; **por la WiFi o entre dos equipos no se ha medido.**

| Qué | Muestras | p50 | p95 | p99 | Máx. | Pérdidas |
|---|---|---|---|---|---|---|
| Transporte: dos páginas ligeras (portada, sin WebGL) con el `livekit-client` 2.22.4 del motor, pose del contrato a 10 Hz, 20 s | 398 | 5,3 ms | **7,2 ms** | 8,1 ms | 12,6 ms | 0 % |
| Motor: dos `/finca/?presencia=red` paseando, 20 s (dos mundos con SwiftShader: 1,9 fps; la pose sale y se atiende al ritmo de los fotogramas) | 74 | 302 ms | 702 ms | 777 ms | 777 ms | 0 % |

- **El objetivo del plan (p95 < 250 ms) se cumple en el transporte** (LiveKit + navegador) con mucho margen. La cifra del motor en SwiftShader **no es de red**: con 1,9 fps cada pose espera al siguiente fotograma para salir y para atenderse (y sale a 1,9 Hz, no a 10). En un aparato con GPU a 60–72 fps eso son 14–17 ms más por lado **[SUPUESTO]**, sin medir: lo mide A6.
- El retardo que ve quien mira es el de la tabla **más los 150 ms** del búfer de interpolación (contrato).
- Cuatro pasadas del transporte: p50 4,3–5,8 ms, p95 7,1–7,7 ms, p99 7,9–19,7 ms, máximo 10,5–53,8 ms, pérdidas 0–2 %. Del motor, tres pasadas: p95 361–1.158 ms con 1,6–1,9 fps.

**Carga: clientes ligeros en Node** (`@livekit/rtc-node` 1.1.0, el SDK oficial para Node; `pruebas/guardianes/_carga_presencia.mjs` en 4 procesos). Todos en la misma sala, cada uno publica su pose (24 B, no fiable, tema `pose`) cada 100 ms **a toda la sala** (el peor caso: todos cercanos), 60 s. CPU y memoria del contenedor de LiveKit con `docker stats` cada ~2 s (100 % = un núcleo).

| Clientes (pasadas) | Tasa real por cliente | Mensajes recibidos / esperados | Pérdidas | Retardo p50 / p95 / p99 | CPU de LiveKit (media; máx.) | Memoria máx. de LiveKit | CPU de los clientes |
|---|---|---|---|---|---|---|---|
| 10 (1) | 9,9 Hz | 53.316 / 53.316 | 0 % | 6,4 / 15,7 / 29,7 ms | 47 %; 55 % | 82 MiB | ≈ 0,5 núcleos por proceso |
| 20 (1) | 8,9 Hz | 202.692 / 202.692 | 0 % | 57 / 156 / 233 ms | 132 %; 167 % | 103 MiB | ≈ 1 núcleo por proceso (saturados) |
| 40 (2) | 4,6–5,4 Hz | 412.104 / 433.602 y 453.944 / 501.189 | 5–9 % | 2,7–5,4 / 6,0–10,6 / 6,9–12,0 **s** | 179–239 %; 282–325 % | 156–182 MiB | ≈ 1,1 núcleos por proceso (saturados) |

- **Con 40 la máquina no da:** los cuatro procesos de clientes llenan los cuatro núcleos (a 10 Hz serían 40 × 39 × 10 = 15.600 mensajes por segundo que recibir entre todos; llegaron ~6.900) y LiveKit compite con ellos; los clientes solo llegan a mandar a 4,6 Hz y su bucle de eventos se retrasa segundos. Ese retardo es sobre todo de los **clientes** saturados en el mismo equipo, no una cifra de LiveKit. Con 20 los clientes ya están al límite (8,9 Hz) y el p95 sube a 156 ms; con 10 todo va a su tasa y el p95 es de 16 ms.
- **Lo que sí dice de LiveKit:** reenvía ~3.400 mensajes por segundo (20 clientes) con ~1,3 núcleos y ~100 MiB, y ~6.900–7.600 por segundo (40) con ~1,8–2,4, y con 40 conectados no pasa de 182 MiB (tope del compose: 256 MiB). Para saber cuánta CPU pide en el VPS con 40 personas hace falta generar la carga **desde otra máquina** **[NO MEDIDO]**. En producción, además, la tasa a 10 Hz es solo para los cercanos (< 55 m) y 2 Hz para el resto, así que el caso de la tabla (todos cerca de todos) es el peor.
- Conectar 40 clientes: 10 s (de uno en uno en cada proceso). Con 40 conexiones en **un solo** proceso, `rtc-node` 1.1.0 se volvió lento (~5 s por conexión) y perdió un handle («handle not found») en la 38.ª: por eso se reparte en procesos.

**Lo que se comprobó contra LiveKit real** (las mismas pasadas): los permisos del token se aplican tal cual (`canPublish: false`, `canPublishSources: []`, `canPublishData: true`; una pista de micrófono no se publica: el servidor no responde y el cliente la da por fallida); `RemoveParticipant` de quien no está → 404 `not_found`; `ListParticipants` de una sala que no existe → lista vacía; Chrome abre `ws://localhost:7880` desde `https://localhost:8743` y también `wss://localhost:8743/rtc` por Caddy; dos sesiones del mismo hogar están a la vez; la expulsión saca las dos (`conexiones: 2`) y el vecino sigue.

## Hituelo en 3D Tiles: tileset y doble descarga glb + json (2026-10-29, F1d, [ADR-0015](../adr/0015-escena-en-3d-tiles.md))

`GEMELO_DATOS=<indice.json de Hituelo> node tuberia/tiles3d/genera.mjs --salida pruebas/salida/tiles3d-hituelo` (generador 0.2.0, opciones por defecto: hojas de 128 m, 128 celdas, textura ≤ 256 px, 3 niveles con olivos). Bytes en disco, sin comprimir; una sola corrida. Datos: la salida de Hituelo que hay hoy (46 teselas de 256 m, 5.882 copas, 5.859 olivos; **sin** `copas_id` ni `copas_tipo`: exportada antes de ADR-0012).

| Medida | Valor |
|---|---|
| Nodos (glb) | **269**: 1 + 2 + 2 + 3 + 5 + 8 (32.768 → 1.024 m, sin olivos) + 18 (512 m) + **46 (256 m)** + 184 (128 m). Más que el límite de 255 ficheros por publicación de un artefacto |
| Raíz | 32.768 m de lado: los datos cruzan la línea N = 4.177.920 (múltiplo de 16.384) y la regla «menor cuadrado alineado que lo contiene» sube hasta ahí. Los 21 nodos de 1.024 m o más pesan 0,9 MB en total |
| glb, total | **40,9 MB** (mediana 142 KB, máx. 388 KB por glb) + `tileset.json` 0,23 MB |
| glb por nivel | 128 m: 27,1 MB · 256 m: 9,7 MB · 512 m: 3,2 MB · ≥ 1.024 m: 0,9 MB |
| Triángulos por nivel (terreno + olivos) | 128 m: 971 k + 844 k · 256 m: 360 k + 141 k · 512 m: 109 k + 141 k; máx. por glb 40.534 (tope 60.000) |
| Olivos | 154 glb con instancias, hasta 1.225 por glb (`_INDICE_COPA` en `UNSIGNED_SHORT`) |
| json del contrato v2 (lo que hoy baja el motor) | `indice.json` 4,5 MB + `t/*.json` **49,8 MB** (mediana 1,18 MB por tesela; de ellos `pts` 34,5 MB, `dtm` 8,2, `chm` 4,0, `suelo` 3,1) + `t/*.jpg` 2,9 MB |
| Por tesela de 256 m: glb frente a json | glb de la tesela (su nodo de 256 m + sus 4 hojas) mediana **0,74 MB** (0,52–1,35) frente a json mediana **1,18 MB** (0,43–1,37) + jpg 64 KB |
| Doble descarga, todo Hituelo | json + jpg 57,2 MB (con `indice.json`) **más** glb 41,1 MB = **98,3 MB** si se bajara todo; con 3D Tiles el glb se baja por error en pantalla, no entero (no medido aún en el motor) |
| Tiempo de generación | **1.764 s (29 min)** en una corrida, con la máquina **cargada** (CPU al 100 % según Windows justo antes de empezar, 24 % al acabar; 8 hilos lógicos; corrían a la vez otros procesos del usuario). No es una cifra de referencia: repetir en una máquina libre |
| Validador de CesiumGS 0.6.1 | **0 errores, 0 avisos**, 154 informativos (uno por glb con olivos: no sabe validar `EXT_mesh_gpu_instancing`) |
| Identidad (`tuberia/tiles3d/comprueba.mjs`) | 0 errores: 17.577 instancias resueltas por lista + huella; 5.859 olivos en las hojas, 0 repetidos, 0 que falten; `id_fuente = "indice"` (sin `copas_id`), tabla de tipos `{"-1": null}` |

Para recortar la doble descarga (decisión 38), lo que el glb repite es `dtm` (como malla) y la ortofoto `t/*.jpg` (como textura); `pts` (la nube, que sigue en el motor por la decisión 37), `chm` y `suelo` (color del suelo del sombreador) no están en el glb. **fps, llamadas y memoria con este tileset: no medidos** (falta el paso 3 del plan, el motor).

### Raíz sin contenido (generador 0.3.0, 2026-10-29)

Fixture sintético de Hituelo (`--catalogo modelos/olivos/fixture/catalogo.json`; `GEMELO_MIDE=1 node --test pruebas/guardianes/tiles3d.test.js`, una corrida):

| Nivel | Nodos (glb) | Triángulos (terreno + olivos) | Bytes |
|---|---|---|---|
| raíz (sin contenido, `geometricError` 512) | 1 (0) | — | — |
| 512 m (nivel útil) | 1 | 4.380 (1.020 + 3.360) | 41.968 |
| 256 m | 2 | 6.726 (3.366 + 3.360) | 108.032 |
| 128 m | 8 | 33.112 (12.952 + 20.160) | 421.196 |

11 glb, 0,57 MB (571.196 B) + `tileset.json` 8.892 B; validador de CesiumGS 0.6.1: 0 errores, 0 avisos, 11 informativos. Los recuentos de triángulos y nodos con glb son los del 0.2.0 (en el fixture el nivel útil era ya la raíz); los bytes salen algo menores (< 5 %) que los de la medida del 2026-10-28, sin investigar.

**Hituelo real: solo el árbol**, calculado con `planArbol()` sobre el `indice.json` actual (46 teselas), **sin escribir glb ni regenerar**: 1 raíz sin contenido + 18 (512 m) + 46 (256 m) + 184 (128 m) = **248 glb** (antes 269: desaparecen los 21 nodos de 1.024 a 32.768 m, 0,9 MB con el 0.2.0, así que el total sería ≈ 40,0 MB **[DEDUCIDO]**, no medido). Caja de los datos 2.048 × 2.816 m; la raíz, 2.560 × 3.072 m.

### Con `copas_id` (2026-10-29, salida nueva de Hituelo: [DATOS](../operacion/DATOS.md#hituelo-completo-para-olivosgen-y-f1d-copas_id-copas_tipo-copas_param-y-copas_semilla-2026-10-29))
`node tuberia/tiles3d/genera.mjs --entrada <salida nueva> --salida pruebas/salida/tiles3d-hituelo-v3`, mismas opciones. Mismos nodos (269), triángulos por nivel y 40 MB en disco que la tabla de arriba (las teselas y `copas` son las mismas). **387 s (6,5 min)** en una corrida, máquina cargada (otros agentes con Docker y Chrome); no es cifra de referencia. `comprueba.mjs`: **0 errores**, `id_fuente = "copas_id"`, 17.577 instancias, 5.859 olivos en las hojas, 0 repetidos; el tileset anterior (`id_fuente = "indice"`) contra este índice da error en `huella_registro`, `id_fuente` y en la huella de cada glb con olivos: los ids se casan por `copas_id`, no por índice.

### Hituelo real con el generador 0.3.0 (2026-10-29, raíz sin contenido)
`GEMELO_DATOS=<indice.json de hituelo-v3> node tuberia/tiles3d/genera.mjs --salida pruebas/salida/tiles3d-hituelo-v3-030`, opciones por defecto, una corrida. **72 s** (1 min 12 s; la máquina no estaba cargada por otros agentes, pero no es cifra de referencia). Confirma el árbol calculado arriba:

| Medida | Valor |
|---|---|
| Nodos | 249 (raíz sin contenido + 18 + 46 + 184) = **248 glb** + `tileset.json` (141.060 B) |
| glb, total | **40.011.160 B = 38,2 MiB** (el 0.2.0: 40,9 MB con 269 glb) |
| glb por nivel | 512 m: 3,04 MiB (18) · 256 m: 9,30 MiB (46) · 128 m: 25,82 MiB (184) |
| Triángulos por nivel (terreno + olivos) | 512 m: 109.402 + 140.616 · 256 m: 359.866 + 140.616 · 128 m: 971.120 + 843.696; olivos 5.859 en cada nivel |
| Validador de CesiumGS 0.6.1 | **0 errores, 0 avisos**; 1.386 mensajes informativos (extensión `EXT_mesh_gpu_instancing` no validable y objetos «posiblemente sin usar») |
| Identidad (`comprueba.mjs`, contra la salida `hituelo-v3`) | **0 errores**; `id_fuente = "copas_id"`, 5.882 copas, 5.859 olivos, 5.859 en las hojas, 0 repetidos, 17.577 instancias, 248 glb |

Sigue sin medirse el dibujo con este tileset en el motor (el encargo al banco del T3 lo hará).

## Hituelo real con `?olivos=gen` (2026-10-29, salida nueva con `copas_id`, `copas_param` y `copas_semilla`)
Salida artefacto en modo ficheros (`montar_v2.py --finca hituelo --modo ficheros --datos <salida nueva>/indice.json --olivos <olivo.iife.js>`; HTML 5,8 MB + 92 ficheros), Chrome headless con SwiftShader (recuentos y memoria, **no fps**), 900×650, `?debug&arbsc=1`, máquina cargada. Escenarios propios de Hituelo (el «cerca» de `_navegador.js` cae en Hituelo sin olivos a 60 m): lejos 600 m sobre (−147, 547); cerca 45 m sobre (128,9, 328,7), una zona de densidad mediana (28 copas a 40 m); nube 350 m. Una corrida por caso; la cola no se vacía en SwiftShader (170-215 trabajos pendientes durante 15 min), así que las cifras son de un instante, no de un estado estable.

| Escenario | Sin la bandera (llamadas / tri / heap) | Con `?olivos=gen` |
|---|---|---|
| «Listo» | 12,7 s | 7,8-11,3 s |
| Lejos | 151 / 930 k / 128 MB | 151 / 899-930 k / 121-131 MB; no se genera nada |
| Cerca | 127 / 1.970 k / 169 MB (N0 254) | antes del lote: 106-114 / 1.194-1.306 k / 137 MB; con el lote: **104 / 1.909 k / 160 MB** (N0 114) |
| Nube | 130 / 1.230 k / 178 MB | 124 / 1.073 k / 151-156 MB; sin lote |

- **Olivos generados: 2** (los 2 propios, ninguna variante), en una zona de 28 copas a 40 m: lote de **6 llamadas y 109 k tri** (coste 179 k con la pasada de sombras), radio 20 m. **Tardaron ≈ 7 min** (437 s) desde que la cámara llega: por rebanadas en la Cola, compartida con 200 trabajos de teselas y olivos de siempre; la tercera receta pedida no llegó en 15 min. En el cliente web va al trabajador: no medido.
- **Ids**: los 5.882 son provisionales (≥ 2^31), así que todo olivo generado lleva «id provisional» en la ficha (`Generados.rotulo`, deducido del código y del índice; la ficha no se abrió con el clic simulado: **no visto en pantalla**).
- **0 errores** de consola y 0 respuestas ≥ 400 en las dos páginas.
- Observado en las capturas, sin medir la causa: con la bandera, los olivos de siempre cercanos salen como bolas lisas (menos N0: 114 frente a 254) mientras el lote no está; el olivo generado se ve de cerca con su tronco y su copa, más claro que la ortofoto.

## Tirones (rebanada máxima de la cola, ms, escritorio)
R (ruido) 13 · N (nube, incluye decodificar una ortofoto) 12–40 antes de separar la decodificación · T (terreno) 6 · C (olivos N0) 10–20 · B 3. Con el presupuesto de 6 ms/fotograma (3,5 en paseo) el peor fotograma añade ≈ una rebanada. En un iPhone espera 2–3 veces más.

## Olivos generados con `?olivos=gen` (2026-10-29, fixture sintético de Hituelo, [ADR-0017](../adr/0017-constructor-de-olivos-generados.md))
Chrome headless con SwiftShader (recuentos y memoria, no fps), máquina cargada; `?arbsc=1`; `pruebas/olivo/p7_medidas.mjs`. Escenarios de `carga.test.js`.

| Escenario | Sin la bandera (llamadas / tri / heap) | Con `?olivos=gen` | Lote de generados |
|---|---|---|---|
| Lejos (600 m) | 168 / 82 k / 30 MB | igual (desde lejos no se genera nada) | — |
| Cerca (45 m) | 56 / 431 k / 38 MB | 47 / 546 k / 44 MB | 6 mallas · 2 olivos (E0 + E1) · 135 k tri (222 k con la pasada de sombras) |
| Nube | 88 / 173 k / 38 MB | sin lote (los árboles no se ven en modo Nube) | — |

- **Sin la bandera** el motor dibuja lo mismo que antes (mismos recuentos en las tres vistas que la medida previa y que `carga.test.js`).
- **Lote**: corteza, madera muerta y olivas en una `BatchedMesh` cada una; ramitas A, B y relleno, instanciadas; olivas de E2 como puntos. Para 2-7 olivos, 6-7 llamadas EN TOTAL. Antes de fijar el coste de las sombras (sin contarlas), se dibujaban 7 olivos (6 propios + 1 variante, 288-308 k tri) y la escena llegaba a 655 k tri: por eso el presupuesto cuenta la pasada de sombras.
- **Presupuesto**: el 45 % del tope del aparato (550 k en escritorio; el del perfil VR en gafas), contando la pasada de sombras. Con olivos centenarios de 100 k tri (E0) y 50 k (E1), caben el más cercano en E0 y otro en E1; las variantes E2 quedan fuera en el fixture.
- **Generación**: sin trabajador (salida artefacto, IIFE) va a rebanadas por la Cola (`G…` en `?debug`); con la máquina cargada, la rebanada más larga llegó a 15 ms. En el cliente web (Vite) va al trabajador. **No medido** con datos reales de Hituelo ni en aparatos.

## Primera ronda del banco (2026-10-29, 6 encargos, un Chrome, ≈ 12,5 min; SwiftShader: recuentos, no fps)

Llamadas / triángulos / heap por escenario (`lejos` · `cerca` · `nube`), cada variante tras su carga; sin errores de consola ni peticiones fallidas en ninguna.

| Encargo | Página | Sin bandera | Con bandera |
|---|---|---|---|
| F1d 3b (T1) | fixture Hituelo + tileset | 168/82k/27 MB · 56/431k/37 · 94/174k/36 | `?escena=tiles`: 167/16k/27 · 55/165k/26 · 125/10k/27 |
| T5 sombreado | fixture | 168/82k · 56/431k · 89/173k | `?escena=tiles`: 167/16k · 56/168k · 88/7k (capturas para aprobar) |
| T4 olivos del tileset | fixture | 168/82k · 56/431k · 89/173k | `?escena=tiles`: 166/14k · **48**/155k · 87/7k; con `&olivos=gen`, igual |
| A4 lindes | build de Vite del fixture | 168/82k · 56/431k · 90/173k | `?api=` (4 hazas): **+1 llamada**, mismos triángulos |
| T3 Hituelo real v3 | Hituelo v3 + tileset 0.3.0 | 273/756k/92 MB · 87/1.294k/120 · 128/741k/119 | `?escena=tiles`: 258/763k/118 · 70/**927k**/128 · 104/556k/143 (heap +8 a +26 MB: la doble descarga de la decisión 38) |
| O1 fundido | fixture con `--olivos` | 168/82k · 56/431k · 89/173k | `?olivos=gen`: **igual que sin bandera: ningún generado a la vista** (antes de O1, 47/546k): en estudio |

- De lejos, en Hituelo real, el tileset dibuja la finca entera con ortofoto y olivos mientras la escena de siempre aún tiene teselas en cola (capturas de la ronda).
- **O1c (ronda posterior):** con `?olivos=gen`, «cerca» del fixture: **40 llamadas / 545 k tri** (base 56 / 431 k), plan de 2 olivos, lote de 6 llamadas / 135 k tri (222 k con sombras), 0 errores; la espera a los generados terminó en 123 s (SwiftShader). En la captura, alrededor del generado los olivos del radio pasan al nivel 1 (bolas; N0 17, N1 121; decisión 26).
- La escena de siempre no llega a vaciar su cola en el tiempo de espera con Hituelo real: las cifras de `base` son de una carga a medias.

### Topes de regresión con `?escena=tiles` y VR simulada (T6, 2026-10-29)
- **Topes** (`pruebas/presupuesto.json`, `fixture_escena_tiles`; los comprueba `escena3d.test.js`): fijados con ≈ 25 % de margen sobre el máximo de las tres medidas de la ronda con el fixture (T1, T5, T4) y sin medida nueva: lejos ≤ 210 llamadas / 20 k tri; cerca ≤ 70 / 210 k; nube ≤ 157 / 13 k; heap ≤ 45 MB (medido 26-27 MB; más holgado por lo variable). Los **puntos** no se midieron con la bandera: se comprueban contra los de siempre (la nube sigue en el motor). Con `&olivos=gen` la ronda dio lo mismo. Sin la bandera los topes de `fixture` no cambian. La prueba de navegador mide además `nube` (antes solo lejos y cerca) y pide el turno sola; **aún no ejecutada con estos topes**: su primera corrida en turno puede obligar a ajustarlos (si algo cuesta más de lo medido en la ronda, se corrige aquí y no se oculta).
- **VR simulada con `?escena=tiles`**: escrita (mismo fichero, opcional con `GEMELO_VR=1`), **sin ejecutar todavía**: la VR completa con SwiftShader es inestable y la corrida va por el turno. Cifras: ninguna.

## Criterios 2, 3 y 4 del ADR-0015 en local (T6b, 2026-10-29)
Chrome headless + SwiftShader, 900 × 650 (recuentos, rayos y alturas; **no fps**). Hituelo v3 (salida con `copas_id`) en modo ficheros con el tileset del generador 0.3.0 al lado; fixture de la puerta. Nada probado en Quest ni iPhone.

**Criterio 2 — de dónde salían las llamadas** (banco con `--desglose`: un fotograma por objeto; escenarios de `_navegador.js`; dos encargos seguidos, antes y después del cambio; la cola del motor no se vacía con Hituelo, cifras de un instante):

| Hituelo v3, llamadas / tri / heap | Antes (sin bandera · `?escena=tiles`) | Después |
|---|---|---|
| lejos | 176 / 738 k / 78 MB · 164 / 650 k / 114 MB | 108 / 738 k / 89 MB · **98** / 650 k / 127 MB |
| cerca | 86 / 1.251 k · 61 / 724 k | 80 / 1.283 k · 55 / 724 k / 128 MB |
| nube | 112 / 740 k · 103 / 556 k | 80 / 740 k · 70 / 556 k / 137 MB |
| paseo (quieto · anda 6 s · gira 360°) | sin medir | sin bandera 139 · 156 · 134 / 1.195 k / 126-133 MB; `?escena=tiles` **128 · 147 · 138** / 661-669 k / 136-157 MB (escenarios de paseo del banco, en (−130, −125)) |

- En el paseo, lo que más llama con la bandera: lindes 27, balizas 24-28, fauna 19-37 (al andar), paisaje; el tileset 11-12 glb visibles.
- Desglose de «lejos» con la bandera, antes: **66 sprites de nubes** (15_tiempo: 46 nubes × 5 manchas = 230 sprites, una llamada cada uno y también con opacidad 0), paisaje 37, lindes 27, tileset 17 (10 glb de terreno + 7 de olivos), balizas 12, árboles 10, resto 6. Después: las nubes, en **una** malla y una llamada (0 si no hay ninguna con opacidad), y lo demás igual. Sin sombras en ninguna pasada.
- Las 258 llamadas de T3 (primera ronda) eran del mismo origen: el número de nubes con opacidad depende de la nubosidad del momento. Con el tiempo de ejemplo «lluvia» (nubosidad 96 %), fixture, vista baja de lejos: **127 → 28** llamadas («niebla» 130 → 27; «ahora» 124 → 26). Capturas antes/después parecidas a ojo (las nubes derivan con el reloj y no caen en el mismo sitio); **el aspecto lo tiene que aprobar Antonio**.
- Fixture con la guardia (`GEMELO_MIDE=1`): con la bandera lejos **25** / 7,7 k, cerca 53 / 163 k, nube 24 / 4,3 k, heap 28-30 MB; sin ella, lejos 27 / 76 k (antes 167-168). Topes de `fixture_escena_tiles` bajados (lejos 35, nube 35; cerca 70 sin cambio). Los de `fixture` (sin bandera) no se han re-medido con `carga.test.js`: siguen los de antes.

**Criterio 3 — huecos en vuelo** (`Escena3D.sondea()`: 7 × 5 rayos desde la cámara y dos verticales por salto; cuenta los que en la CPU cortan el relieve dentro de los datos, con 2 m de margen, y no dan con el relieve dibujado ni a 1 cm; 2 fotogramas por salto, sin esperar a la carga):

| Vuelo | Saltos | Rayos en los datos | Sin relieve | Aristas (a 1 cm sí) | glb visibles |
|---|---|---|---|---|---|
| Fixture, bajo (órbita a 45 m) tras la vista de lejos | 41 | 1.468 | **0** | 23 (vuela por y = −128, borde entre hojas) | 1-5 |
| Fixture, alto en diagonal (160 m) | 31 | 875 | **0** | 0 | 1 |
| Hituelo, bajo E-O | 61 | 1.395 | **0** | 2 | 0-7 |
| Hituelo, bajo N-S | 61 | 1.826 | **0** | 23 | 1-7 |
| Hituelo, alto en diagonal | 61 | 1.022 | **0** | 0 | 0-6 |
| Hituelo, en frío (de cerca en una punta, sin vista de lejos) | 61 | 1.395 | **0** | 8 | 0-7 |

Servido en 127.0.0.1 (sin latencia de red): un hueco por red lenta no se ha probado. `pruebas/escena3d_recorrido.js <carpeta>` lo repite con cualquier finca.

**Criterio 4 — relieve dibujado frente a `Mundo.suelo`** (máximo de |dibujado − CPU| en m; «vértice» = vértice de borde del glb, que no se simplifica):

| Lado de la tesela que dibuja | Fixture: punto / vértice / geometricError | Hituelo v3: punto / vértice / geometricError |
|---|---|---|
| 128 m (hoja, paso 1 m) | 0,038 / 0,00005 / 0,050 | 0,071 / 0,0004 / 0,049 (1-2 de ~240 puntos por encima del error, en dos corridas) |
| 256 m (paso 2 m) | — | 0,116 / 0,0002 / 0,839 |
| 512 m (paso 4 m) | 0,265 / 0,0003 / 1,286 | 0,432 / 0,0002 / 2,026 |

El marco casa (< 0,5 mm en todos los niveles); el resto es geometría del nivel. En las hojas de Hituelo, la interpolación por triángulos de la malla frente a la bilineal de `Mundo.suelo` no la mide el generador (con paso = resolución del dato no calcula error de rejilla): de ahí el punto que pasa de 4,9 a 7,1 cm.

## Horneado de recetas de olivos generados por tesela (O6, 2026-10-29, foto: no se mantiene)

Medida de decisión para el ADR de las recetas horneadas en el servidor. Script: `pruebas/olivo/hornea_tesela.mjs` (solo mide: no escribe ningún formato; el «cuantizado» es una serialización de prueba con cabeceras reales). Datos: Hituelo v3 (`GEMELO_DATOS`, fuera del repo), 46 teselas de 256 m (36 con olivos), 5.882 olivos, generador `olivo-2`, época `envero` (la del motor), `factorR8` 0,5, tipo `centenario3`, parámetros de `copas_param`. Equipo: Intel i5-1035G1 (4 núcleos, 8 hilos), Windows 10, Node 24; **máquina cargada y con carga variable**: generar un olivo E0 llevó 55 ms en la corrida más tranquila, 154-162 ms con tres procesos míos a la vez y 348 ms en la última. Los tiempos valen por proporciones, no como referencia. 1 MB = 1.048.576 B. Una sola corrida de cada cosa; brotli = `zlib` de Node con ventana de 16 MB.

**Qué se midió.** Tesela mediana de las que tienen olivos, `1587_16327`: **136 olivos, completa**. Tesela más poblada, `1582_16326` (496 olivos): **no terminó**; se paró a mano tras 57 min y 3.450 s de CPU (brotli 11 de cada olivo en cuatro niveles), sin cifras. Para extrapolar, **120 olivos al azar de toda la finca** (semilla fija; ± = error típico de la media).

**Cuantización de prueba** (pérdida máxima medida contra el original en 120 olivos y 4 niveles): `position` Int16 en la caja de la pieza, ≤ **0,11 mm**; `normal` Int8, ≤ **0,39°**; `uv` Uint16, ≤ 2·10⁻⁵; `aHueco`/`aMuerta` Uint8, ≤ 0,002; colores Uint8, ≤ 0,0011 (de 0 a 1); matrices de instancias: traslación Int16 en la caja, ≤ **0,11 mm**, parte lineal 3×3 Int16, ≤ **0,06 mm** sobre la geometría de la instancia, sin la última fila; índices Uint16 si la pieza tiene ≤ 65.535 vértices (la madera fina «ramas» tiene más: Uint32); `nodo`/`padre` Uint16 si caben. **Sin comparar a ojo** (ninguna captura): las pérdidas son numéricas.

### Por olivo (media de 120 al azar de Hituelo)
| Nivel | Crudo (arrays tipados) | Cuantizado | Brotli 11 | Brotli 9 | CPU de brotli por olivo, 11 / 9 (24 olivos, mismas condiciones) |
|---|---|---|---|---|---|
| E0 | 2,10 MB | 899 KB | **491 KB** | 553 KB | 5,2 s / 0,14 s |
| E1 | 1,05 MB | 433 KB | **254 KB** | 272 KB | 1,8 s / 0,06 s |
| E2 | 0,84 MB | 341 KB | **225 KB** | 242 KB | 1,6 s / 0,06 s |
| E2-VR | 0,72 MB | 296 KB | **183 KB** | 199 KB | 1,5 s / 0,05 s |

Brotli 9 pesa un **7-13 % más** que el 11 (E0 +13 %, E1 +7 %, E2 +8 %, E2-VR +9 %) y tarda unas **30 veces menos** (307 ms frente a 10.010 ms por olivo en los cuatro niveles). Brotli 6: +26 % en E0 y 4 veces menos CPU que el 9. Cuantizado, por categoría (E0): índices 27 %, posiciones 25 %, uv 17 %, matrices 13 %, normales 13 %; (E2-VR): posiciones 25 %, matrices 17 %, uv 17 %, índices 15 %, normales 13 %. `nodo`/`padre` (solo sirven para podar) ≈ 2 %.

### Tesela mediana `1587_16327` (136 olivos, entera, brotli 11)
| Nivel | Crudo | Cuantizado | Un fichero por olivo | Una corriente por tesela | Diferencia |
|---|---|---|---|---|---|
| E0 | 274 MB | 114 MB | 62,5 MB | 54,3 MB | −13 % |
| E1 | 143 MB | 58 MB | 33,9 MB | 31,5 MB | −7 % |
| E2 | 115 MB | 46 MB | 30,1 MB | 28,4 MB | −6 % |
| E2-VR | 99 MB | 40 MB | 24,5 MB | 22,9 MB | −7 % |

La tesela entera en un solo nivel pesa 23-63 MB comprimida, frente a su json de **1,18 MB** y su glb de **0,74 MB** (medianas, arriba). Acceso aleatorio por olivo (un objeto por olivo) cuesta un 6-13 % más que una corriente por tesela. La más poblada (496 olivos), **extrapolada** de la media y no medida: E0 ≈ 238 MB, E1 ≈ 123 MB, E2 ≈ 109 MB, E2-VR ≈ 89 MB.

### Toda la finca (5.882 olivos, media de los 120 × 5.882; una época, un nivel por fila)
| Nivel | Crudo | Cuantizado | Brotli 11 | Brotli 9 |
|---|---|---|---|---|
| E0 | 12,1 GB ± 0,15 | 5,0 GB ± 0,06 | **2,8 GB ± 0,03** | 3,1 GB |
| E1 | 6,0 GB ± 0,05 | 2,4 GB ± 0,02 | **1,4 GB ± 0,01** | 1,5 GB |
| E2 | 4,8 GB ± 0,04 | 1,9 GB ± 0,02 | **1,3 GB ± 0,01** | 1,4 GB |
| E2-VR | 4,1 GB ± 0,03 | 1,7 GB ± 0,01 | **1,0 GB ± 0,01** | 1,1 GB |
| Los cuatro | 27 GB | 11 GB | **6,5 GB** | 7,1 GB |

Dos épocas distintas, hasta el doble salvo lo que se comparta (siguiente apartado). Frente a lo que se descarga hoy de Hituelo entero: 98 MB (json + jpg + glb).

### Épocas: qué cambia entre una receta y la de otra (un olivo, `--epocas`)
`envero` frente a `madura`: **solo cambia la pieza de las olivas** (1.668 → 1.892 olivas en ese olivo; matrices y colores); el resto de bytes es idéntico. `reposo`, `boton`, `flor` y `cuajado` cambian además las matrices de la madera fina, las ramitas y el relleno (no se investigó por qué). Guardar la pieza de las olivas aparte de la «base» haría que pasar de `envero` a `madura` costara solo esa pieza: **estimación**, no medida, ≈ 8 % de un E0 cuantizado (2.662 olivas × ≈ 29 B en un olivo de prueba).

### Manifiesto por tesela (copas_id → huella por nivel; cálculo, no fichero real)
Binario: `copas_id` u32 + 4 huellas de 16 B (sha-256 truncado a 128 bits) = **68 B por olivo**: 9 KB (136 olivos), 34 KB (496), 400 KB (los 5.882). Con huellas de 32 B: 132 B por olivo (18 / 65 / 776 KB). En JSON con hex de 32 caracteres: ≈ 21 / 76 / 906 KB. Las huellas no comprimen. Despreciable frente a las recetas.

### Lo que bajaría un visitante en un paseo recto de 500 m (`--visita 150,250`)
Olivos a menos de R m del paseo, sobre 6.468 salidas (cada 50 m, 4 rumbos): a 250 m, mediana **606**, p90 1.704, máx. **2.345**; a 150 m, mediana 369, p90 941, máx. 1.309. Bandas **[SUPUESTO]** (el motor reparte los niveles por presupuesto, no por distancias fijas; `RADIO_CAND` = 160 m): < 30 m E0, 30-80 m E1, el resto E2. Tamaños con la media por olivo de arriba.

| Paseo | Olivos | E0 / E1 / E2 | Brotli 11, nivel exacto | Brotli 11, si el árbol pasa por todos los niveles | Cuantizado sin brotli, nivel exacto |
|---|---|---|---|---|---|
| mediano, 150 m | 307 | 36 / 54 / 217 | 78 MB | 107 MB | 127 MB |
| mediano, 250 m | 606 | 36 / 54 / 516 | 144 MB | 173 MB | 226 MB |
| el más denso, 150 m | 1.140 | 119 / 320 / 701 | 290 MB | 416 MB | 473 MB |
| el más denso, 250 m | 2.345 | 119 / 320 / 1.906 | 555 MB | 681 MB | 874 MB |

Todo en E2, a 150 m: 67 MB (mediano) y 250 MB (denso). En VR (E2-VR para todos): 55 y 204 MB. Para comparar, generar un olivo E0 llevó 55 ms en la corrida tranquila: 307 olivos son unos 17 s de un hilo y 1.140 unos 63 s **en este PC (móvil y Quest: no probado)**.

### Tiempo del horneado de Hituelo entero (5.882 olivos, una época, un hilo)
| Parte | Por olivo | Los 5.882 |
|---|---|---|
| Generar E0 | 55 ms (tranquila); 154-162 ms (tres procesos) | ≈ 5,4 min (tranquila) |
| `aNivel` E1, E2 y E2-VR | ≈ 1-2 ms cada uno (tranquila) | < 1 min |
| Cuantizar los 4 niveles | ≈ 25 ms (tranquila) | ≈ 2,5 min |
| **Todo salvo brotli** | ≈ 83 ms | **≈ 9 min** (medido con 300 olivos: 536 s en total) |
| Brotli 9, 4 niveles | 307 ms (con tres procesos) | brotli ≈ 60 % del tiempo; en total **≈ 19 min** (estimado, máquina tranquila) a **≈ 51 min** (medido-extrapolado, con tres procesos) |
| Brotli 11, 4 niveles | 10 s (con tres procesos) | brotli ≈ 95 % del tiempo; **≈ 5,5 h** (estimado, tranquila) a **≈ 17 h** (con tres procesos) |

Dos épocas: el doble (si no se comparte nada). Con 4 procesos, unas 4 veces menos **[no medido]**. La estimación «tranquila» escala el brotli por el cociente de tiempos de generación (55/162); es una proporción, no una corrida.

### Contra los límites
- **Artefacto** (`contratos/publicacion.json`): no admite `.bin`; ≤ 15 MB por fichero binario, 64 MB por publicación, 256 MB por versión, 255 ficheros. Una tesela mediana en un solo nivel (23-63 MB) no cabe en un fichero; Hituelo en E2-VR (1,0 GB), ni de lejos. **En la salida artefacto, las recetas se calculan en el navegador** (plan B).
- **VPS** (ADR-0011): disco, memoria y núcleos **[NO VERIFICADO]**. Una época, cuatro niveles: ≈ 6,5 GB con brotli 11, ≈ 7,1 GB con brotli 9; dos épocas, hasta el doble. Cabe en cualquier VPS de decenas de GB; el límite real es el **ancho de banda de la visita** (arriba), no el disco.

## Hornero de variantes con Hituelo v3 (O7c, 2026-10-29, foto, no se mantiene)

`tuberia/olivos/hornero.mjs --finca hituelo --salida <carpeta> --fecha <día>`; `GEMELO_DATOS` apuntando a la salida de referencia `hituelo-v3` (fuera del repo). Generador `olivo-2`, `CACHE_VERSION` 1, tipo `centenario3`, semillas 11/23/37/51 (`SEM_VAR`), niveles E2 y E2-VR, épocas `envero` (actual, fecha 2026-10-29) y `madura` (siguiente), brotli 9. Mismo equipo cargado que O6 (i5-1035G1, 8 hilos, Node 24, otros agentes en marcha); **una sola corrida de cada cosa**: los tiempos valen por proporciones. 1 MB = 1.048.576 B.

| Nivel | Objetos | Sin comprimir | Brotli 9 | Media por objeto (br) | Estimación del ADR-0018 |
|---|---|---|---|---|---|
| E2, 2 épocas | 8 | 3.582.968 B | 2.464.882 B (2,35 MB) | **308 KB** | 242 KB |
| E2-VR, 2 épocas | 8 | 3.077.420 B | 1.979.652 B (1,89 MB) | **247 KB** | 199 KB |
| **Total** | **16** | 6.660.388 B | **4.444.534 B (4,24 MB)** | 271 KB | 3,4 MB |

- **Lo que baja un aparato** (un nivel de una época): E2 `envero` 1.227.791 B (1,17 MB), E2 `madura` 1.237.091 B (1,18 MB); E2-VR `envero` 985.217 B (0,94 MB), E2-VR `madura` 994.435 B (0,95 MB). La estimación del ADR (0,95 MB y 0,78 MB) se quedaba corta un **27-29 %**: como vio O7b con un E2 de `centenario3` de 308 KB; por qué las variantes pesan más que la media por olivo de O6 no se ha investigado. Las dos épocas pesan casi igual (`madura` +0,8 %).
- **Manifiesto**: 3.790 B (16 filas, con sangría de 2 espacios).
- **Tiempo**: primera corrida, 16 objetos desde cero (8 E0 generadas, 16 niveles, cuantizar, brotli 9): **9,3 s** (8,9 s dentro del proceso); la estimación del ADR era «del orden de un segundo» (sin medir): era unas diez veces corta (≈ 0,6 s por objeto, generando cada E0 una vez para sus dos niveles). Segunda corrida seguida: **0,9 s**, 0 horneadas, 16 reutilizadas, manifiesto intacto. Cambio a otra época (`madura` + `reposo`): **3,3 s**, 8 horneadas y 8 reutilizadas.
- **Brotli 11 (`--release`)**, madura + reposo, todo rehecho: **3.972.494 B** frente a 4.276.136 B con brotli 9 (**−7,1 %**); unos 73-86 s en total (la corrida incluyó entonces la lectura del índice de Hituelo, ≈ 13 s), es decir ≈ 4-5 s por objeto en vez de ≈ 0,2 s. `--limpia` posterior: 8 objetos borrados (los de `envero`), 16 en disco.
- **Con `--finca` el hornero no lee el índice** (las variantes no dependen de los olivos): leer el `indice.json` de Hituelo costaba ≈ 13 s de los de arriba en la máquina cargada.
- **No medido:** el hornero en el VPS, descargar/descomprimir/decuantizar/verificar en un aparato, E2 de otros tipos del catálogo, varias fincas a la vez, los propios horneados (`--propios` no está implementado).

## Variantes horneadas frente a calculadas en el navegador (O7e, 2026-10-29, ronda del banco, fixture de Hituelo, «cerca», SwiftShader)

| Variante | Llamadas / tri | Generados dibujados | Variantes horneadas / calculadas | Espera |
|---|---|---|---|---|
| calculadas (`?olivosHorneado=0`) | 40 / 425 k | **1 de 6** | 0 / 2 | 183 s, **sin terminar** |
| horneadas | 37 / 505 k | **6 de 6** | **4 / 0**, 0 fallos | **53 s**, terminada |

A ojo (capturas de la ronda), las horneadas y las calculadas tienen el mismo aspecto; en las dos, los generados salen de un tono claro (crema) frente al verde oscuro de las copas medidas de alrededor (para revisar con Antonio).

## Escalera de olivos, fase A (O8c, 2026-10-29, `?olivos=escalera`, ronda del banco, fixture de Hituelo, SwiftShader: recuentos, no fps)

**¿Hay pasada de sombras?** No. `renderer.shadowMap.enabled` es `false` en todas las medidas (three 0.186.1 lo trae apagado y ningún módulo del motor lo enciende; `WebGLShadowMap.render` sale sin dibujar nada). Con `renderer.info`: en `paseoAnda` con la escalera, 389 k triángulos en el fotograma de los que 281 k son olivos 3D; con una pasada de sombras serían al menos 562 k. Así que el «× 2 por la sombra» de `costo()` sobraba: con la escalera ya no se cobra (con `?olivos=gen` sigue cobrándose, para no cambiar lo que dibuja). Que los generados salgan «crema» tiene que ver con esto (contrato `olivo-impostor` §5: sin sombras, el interior de la copa no se oscurece).

Primera ronda (encargo de 5 escenarios, página montada con `--olivos`, máquina al 100 % de CPU, una corrida; `esc` bajó a 0,7, así que el presupuesto era 385 k):

| Escenario | Sin la bandera: llamadas / tri / heap | `?olivos=escalera`: llamadas / tri / heap | Escalera (E0/E1/E2 · lejanos) |
|---|---|---|---|
| cerca | 55 / 430 k / 35 MB | 27 / 426 k / 46 MB | 0/0/3 · capa aún sin variantes |
| lejos | 67 / 76 k / 38 MB | 77 / 125 k / 42 MB | 0/0/3 · ídem |
| paseo | 136 / 164 k / 39 MB | 90 / 382 k / 52 MB | 1/0/8 · ídem |
| paseoAnda | 101 / 240 k / 35 MB | 55 / 389 k / 64 MB | 1/1/8 · ídem |

Con la bandera: 0 mallas de nivel 0, 0 instancias de los niveles 1-2, 6-7 llamadas de olivos. **Las 4 variantes E2 no llegaron en 12 min** (página sin trabajador, a rebanadas por la cola propia): sin ellas no hay capa de lejanos y de lejos solo se ve la ortofoto (la excepción de la primera carga del ADR §3). Por eso las variantes de los lejanos pasan a pedirse justo después de los propios de menos de 50 m. Segunda ronda con ese cambio (tope 300 s, `cerca` y `lejos` antes de cortarse): las mismas cifras (27 / 426 k / 38 MB; 76 / 125 k / 45 MB) y 2 variantes E2 a los 5 min: en SwiftShader y sin trabajador no se llega al estado final; los topes de `fixture_olivos_escalera` salen del estado final calculado (ver su `$comment`). El estado final sí se comprueba en Node (`pruebas/olivo/escalera_motor.mjs`: 0 huecos y 0 dobles en 607 pasos de paseo y órbita, ≤ 8 llamadas, triángulos ≤ presupuesto). En Hituelo real (encargo cortado a petición: máquina sin memoria) pasó lo mismo, y en el paseo del banco no había olivos en 160 m: ningún olivo dibujado.

## Escalones de olivo por masa visual (O9a, 2026-10-30, foto, no se mantiene)
Diagnóstico de la decisión 80 ([ADR-0022](../adr/0022-escalones-de-olivo-por-masa-visual.md), Propuesto). Scripts: `node pruebas/olivo/o9a_escalones.mjs` (Node: recetas, variante estirada y paseo con `Escalera.planifica` real) y `node pruebas/olivo/o9a_masa.mjs` (Chrome sin pantalla por el turno del banco, SwiftShader, three 0.186.1: áreas y colores de imágenes fijas, **no fps**; 55 s). Olivos en envero: adulto1 semilla 1003 y centenario3 semilla 7 con los parámetros de su tipo, y «medido» = centenario3 semilla 1003 con `copas_param` h 3,8 m, copa 4,3 m (como un olivo del fixture de Hituelo: r8 medio 2,15 m).

**Recetas (Node).** E0, E1 y E2 de una misma receta tienen las mismas tarjetas, la misma caja de copa y las mismas medidas; solo E2-VR quita la mitad de las ramitas (las interiores y bajas) y agranda las demás.

| Olivo | E0 | E1 | E2 | E2-VR | Ramitas E0 → E2-VR | Área de ramitas E0 → E2-VR |
|---|---|---|---|---|---|---|
| adulto1 1003 | 48.474 tri | 19.082 | 8.954 | 6.566 | 2.389 → 1.195 | 192 → 181 m² |
| centenario3 7 | 102.978 | 48.378 | 19.366 | 14.618 | 4.749 → 2.375 | 1.156 → 1.095 m² |
| medido 1003 | 67.356 | 31.842 | 11.678 | 9.242 | 2.436 → 1.218 | 132 → 124 m² (la tarjeta más baja, de 1,1 a 1,7 m) |

**Variante estirada (Node).** El motor estira la variante (centenario3, copa 9,4 m, alto 5 m) a 2 × r8 medio × `FACTOR_R8` = 2,15 m, mientras el propio sale de `copas_param` a 4,3 m: k = 0,229 en horizontal y 0,8 en vertical; sus 3.973-4.617 ramitas caben en una caja de 1,5-1,9 m de ancho (las del propio, 3,5-3,8 m).

**Masa visual (Chrome).** Media de 8 vistas horizontales (cada 45°, elevación 0) y vista cenital aparte; cámara ortográfica con el encuadre del E0 de cada olivo; fondo transparente; sol + cielo sin sombras. Cobertura = píxeles de árbol dentro del casco convexo de la silueta del E0; IoU = de la silueta cerrada y rellena frente a la del E0; huecos = % de la silueta con fondo; contraste = desviación típica de la luminancia / media. «128 px» ≈ el olivo a 60-75 px de alto; «512 px» ≈ 230-310 px. Impostor **emulado** (celda de 128 px sobre 2 × semilado, 4 × 4 submuestras, ampliado con corte en 0,5; sin la rejilla 8 × 8 ni *mipmaps*: cota optimista).

| Olivo · lado | Escalón | Tri | Cobertura (Δ E0) | IoU (cenital) | Huecos | Agujeros / 10k px | Luz media | Contraste |
|---|---|---|---|---|---|---|---|---|
| adulto1 · 512 | E0 | 48 k | 0,587 | 1 | 18,5 % | 152 | 58 | 0,60 |
| | E1 | 19 k | 0,575 (−2,1 %) | 1,000 (0,999) | 20,2 % | 166 | 58 | 0,58 |
| | E2 | 9 k | 0,568 (−3,3 %) | 0,996 (0,997) | 20,8 % | 169 | 55 | 0,51 |
| | E2-VR | 7 k | 0,600 (+2,2 %) | 0,864 (0,813) | 19,7 % | 131 | 56 | 0,50 |
| adulto1 · 128 | E0 | | 0,378 | 1 | 38,9 % | 359 | 66 | 0,80 |
| | E1 | | 0,277 (−26,8 %) | 0,896 (0,815) | 50,1 % | 216 | 70 | 0,81 |
| | E2 | | 0,397 (+4,9 %) | 0,891 (0,891) | 40,7 % | 366 | 120 | 0,64 |
| | E2-VR | | 0,437 (+15,5 %) | 0,878 (0,811) | 36,3 % | 381 | 110 | 0,68 |
| centenario3 · 512 | E0 | 103 k | 0,760 | 1 | 11,4 % | 106 | 57 | 0,51 |
| | E1 | 48 k | 0,756 (−0,5 %) | 1,000 (1,000) | 11,9 % | 112 | 57 | 0,50 |
| | E2 | 19 k | 0,755 (−0,6 %) | 1,000 (1,000) | 12,0 % | 112 | 57 | 0,51 |
| | E2-VR | 15 k | 0,788 (+3,7 %) | 0,856 (0,890) | 14,1 % | 105 | 58 | 0,51 |
| centenario3 · 128 | E0 | | 0,491 | 1 | 35,1 % | 351 | 59 | 0,75 |
| | E1 | | 0,359 (−26,8 %) | 0,915 (0,796) | 48,1 % | 230 | 63 | 0,78 |
| | E2 | | 0,605 (+23,3 %) | 0,876 (0,899) | 27,7 % | 337 | 136 | 0,55 |
| | E2-VR | | 0,650 (+32,5 %) | 0,832 (0,820) | 25,7 % | 298 | 121 | 0,62 |
| medido · 512 | E0 | 67 k | 0,670 | 1 | 16,0 % | 102 | 59 | 0,63 |
| | E1 | 32 k | 0,656 (−2,1 %) | 0,998 (0,998) | 17,6 % | 115 | 58 | 0,61 |
| | E2 | 12 k | 0,645 (−3,7 %) | 0,994 (0,997) | 18,7 % | 122 | 54 | 0,51 |
| | E2-VR | 9 k | 0,658 (−1,8 %) | 0,890 (0,876) | 20,7 % | 91 | 54 | 0,51 |
| | variante E2, r8 × 0,5 (motor) | 18 k | 0,370 (−44,8 %) | 0,473 (0,250) | 14,0 % | 107 | 57 | 0,44 |
| | variante E2, copa del propio | 18 k | 0,719 (+7,3 %) | 0,692 (0,693) | 10,9 % | 86 | 58 | 0,42 |
| | variante E2-VR, r8 × 0,5 | 14 k | 0,389 (−41,9 %) | 0,482 (0,285) | 16,2 % | 100 | 57 | 0,43 |
| | impostor emulado, r8 × 0,5 | 2 | 0,389 (−41,9 %) | 0,455 (0,239) | 3,7 % | 11 | 56 | 0,17 |
| | impostor emulado, copa del propio | 2 | 0,730 (+9,0 %) | 0,703 (0,690) | 2,5 % | 7 | 56 | 0,20 |
| medido · 128 | E0 | | 0,537 | 1 | 28,5 % | 212 | 63 | 0,77 |
| | E1 | | 0,445 (−17,2 %) | 0,936 (0,876) | 36,8 % | 166 | 66 | 0,78 |
| | E2 | | 0,506 (−5,8 %) | 0,954 (0,929) | 32,0 % | 214 | 92 | 0,77 |
| | E2-VR | | 0,543 (+1,1 %) | 0,942 (0,872) | 29,3 % | 237 | 86 | 0,79 |
| | variante E2, r8 × 0,5 | | 0,298 (−44,5 %) | 0,457 (0,289) | 23,8 % | 329 | 139 | 0,53 |
| | variante E2, copa del propio | | 0,525 (−2,3 %) | 0,657 (0,670) | 29,2 % | 303 | 105 | 0,70 |
| | impostor emulado, r8 × 0,5 | | 0,423 (−21,3 %) | 0,479 (0,297) | 4,3 % | 77 | 56 | 0,17 |
| | impostor emulado, copa del propio | | 0,774 (+44,1 %) | 0,634 (0,676) | 3,2 % | 47 | 56 | 0,20 |

Lectura: de cerca (512) E1/E2 propios conservan la masa (Δ ≤ 4 %, IoU ≥ 0,99); E2-VR pierde la falda (IoU 0,86-0,89). La variante del motor es la mitad de ancha (cobertura −45 %, IoU 0,47); con la copa del propio queda el salto de forma (IoU 0,69). A 128 px el follaje se deshace en todos los escalones (recorte alfa con *mipmaps*: la cobertura del E0 de centenario3 pasa de 0,76 a 0,49 y los huecos del 11 al 35 %; E1 pierde un 17-27 % más al quitar los brotes) y en E2 las olivas como puntos sin luz aclaran la copa (luz 58 → 92-136). El impostor es una mancha casi sin huecos ni contraste.

**Dónde salta (Node, `Escalera.planifica` real).** Rejilla cuadrada de olivos, paseo por la calle (a media distancia entre filas) a 1,4 m/s, reparto cada 0,25 s, triángulos del olivo «medido», 5.882 lejanos × 2 tri; sin espera de recetas (cota optimista). Distancia mediana del paseante al olivo que cambia y si ocurre delante o detrás:

| Aparato (presupuesto) | Rejilla | Asentado: E0 + E1 + E2 (radio) | lejano → E2 | E2 → E1 | E1 → E0 | E0 → E1 | E1 → E2 | E2 → lejano |
|---|---|---|---|---|---|---|---|---|
| Escritorio (538 k) | 10 m | 1 + 5 + 26 (32 m) | 28,4 delante | 9,9 delante | 6,0 detrás | 12,9 detrás | 22,1 detrás | 38,5 detrás |
| | 11 m | 1 + 5 + 26 (35 m) | 31,9 | 11,4 | 6,2 detrás | 13,6 | 23,7 | 41,7 |
| | 12 m | 1 + 5 + 26 (38 m) | 35,5 | 12,9 | 6,4 detrás | 14,3 | 25,3 | 44,9 |
| Móvil (258 k) | 10 m | 1 + 2 + 10 (21 m) | 15,2 | 5,6 | 5,1 delante | 9,1 | 17,8 | 26,7 |
| | 11 m | 1 + 2 + 10 (23 m) | 16,8 | 6,6 | 5,9 delante | 9,3 | 18,8 | 28,7 |
| | 12 m | 1 + 2 + 10 (25 m) | 18,7 | 7,7 | 6,8 delante | 9,6 | 19,9 | 30,8 |
| Gafas, perfil 0 (368 k) | 10 m | 1 + 4 + 18 E2-VR (27 m) | 23,0 | 13,2 | 5,1 delante | 9,1 | 19,5 | 34,3 |
| | 11 m | 1 + 4 + 18 (30 m) | 26,1 | 15,4 | 5,9 delante | 9,3 | 20,5 | 37,0 |
| | 12 m | 1 + 4 + 18 (32 m) | 29,4 | 12,8 | 6,4 detrás | 14,3 | 25,1 | 42,2 |

En escritorio el E0 pasa al olivo cuando ya se ha dejado atrás (histéresis de `MARGEN` y prima del E0) y se queda en él hasta 13-14 m por detrás. Alto en pantalla de un olivo de 5 m (cálculo, no medida): escritorio 1080p con la cámara de 42° → 1.407 px a 5 m, 703 a 10, 639 a 11, 586 a 12, 352 a 20, 234 a 30, 156 a 45; Quest 3 (≈ 96° vertical y 0,9 × 1.760 px por ojo, **[NO VERIFICADO]**) → 357 px a 10 m, 324 a 11, 297 a 12, 178 a 20, 119 a 30.

## Límites conocidos
- Las ortofotos decodificadas (2,4 MB por tesela de 768 px; 1 MB a 512 px) se sueltan solo a 900 m; sin LRU fino.
- Dentro de una tesela todo el relieve y la copa (258² + 256²) están siempre en memoria: 49 teselas ≈ 20 MB; la nube de las lejanas se libera a > 1,2× 2.300 m.
- Las teselas se piden a ≤ 1.800 m de la cámara, de 3 en 3.
- Las teselas sin datos (fuera de las parcelas + 60 m) son un hueco: el mundo de Hituelo es un mosaico, no un rectángulo.
- NDVI de Hituelo en el HTML: 2,3 MB (u8) → 3 MB; página 4,6 MB. Si el artefacto no admite `fetch` de ficheros de apoyo, Hituelo (52 MB de teselas) no cabe en una sola página.
