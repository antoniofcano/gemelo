# Medidas del motor por teselas (Chrome headless con SwiftShader, 1000×900; los fps reales faltan: solo un iPhone los da)

> Referencia viva: se actualiza al volver a medir (protocolo: [skill `medir`](../../.claude/skills/medir/SKILL.md)). Cifras de octubre de 2026; solo SwiftShader, los fps reales faltan.

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

## Tirones (rebanada máxima de la cola, ms, escritorio)
R (ruido) 13 · N (nube, incluye decodificar una ortofoto) 12–40 antes de separar la decodificación · T (terreno) 6 · C (olivos N0) 10–20 · B 3. Con el presupuesto de 6 ms/fotograma (3,5 en paseo) el peor fotograma añade ≈ una rebanada. En un iPhone espera 2–3 veces más.

## Límites conocidos
- Las ortofotos decodificadas (2,4 MB por tesela de 768 px; 1 MB a 512 px) se sueltan solo a 900 m; sin LRU fino.
- Dentro de una tesela todo el relieve y la copa (258² + 256²) están siempre en memoria: 49 teselas ≈ 20 MB; la nube de las lejanas se libera a > 1,2× 2.300 m.
- Las teselas se piden a ≤ 1.800 m de la cámara, de 3 en 3.
- Las teselas sin datos (fuera de las parcelas + 60 m) son un hueco: el mundo de Hituelo es un mosaico, no un rectángulo.
- NDVI de Hituelo en el HTML: 2,3 MB (u8) → 3 MB; página 4,6 MB. Si el artefacto no admite `fetch` de ficheros de apoyo, Hituelo (52 MB de teselas) no cabe en una sola página.
