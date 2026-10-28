# Estado del gemelo v2 (27-oct-2026)

El gemelo vivo (artefacto `14sjiQAk54mwFMkZCZE69Y`, v20) **no se ha tocado**. Todo está en esta carpeta.

## Pasos del diseño (§7 de `lidar3_resultados/DISENO_HITUELO.md`)

| # | Paso | Estado | Cómo se verificó |
|---|---|---|---|
| 0 | Prueba de plataforma (ficheros de apoyo) | **A medias**: publicado como https://claude.ai/artifact/MAVJgqMX5XjvjPTyoKcNrK (privado). Aprendido al publicar: **un `.bin` no se admite** (tipos servidos: html, css, js, mjs, wasm, json, txt, csv, png, jpg, webp, svg, fuentes, mp3/mp4…); `.wasm` sí se acepta con bytes arbitrarios. **Falta ver la tabla de la página** (¿`fetch` e `<img>` del mismo origen?): este agente no tiene el navegador autenticado. `window.__res` y la tabla muestran cada prueba | Hay que abrir el enlace y leer la tabla |
| 1 | «Tesela cero» (`Mundo`) | Hecho | Capturas Cerro antes/después casi idénticas; 0 errores de consola |
| 2 | Cerro en teselas de 256 m (12 teselas) | Hecho, modo embebido (11,6 MB) y modo ficheros (1 MB + 24 ficheros) | Chrome headless con `file://` y con servidor local |
| 3 | Color del suelo, NDVI y `exag` al sombreador | Hecho | NDVI, fecha, hierba, exageración y Ortofoto probados con `prueba2.js`; el color se compara a ojo con la base (dif. media 2–5/255 en vista lejana) |
| 4 | LOD de terreno (1/2/8 m) y vista de mapa | Hecho (faldones, histéresis) | 238 k triángulos en el mapa de Cerro (antes 766 k) |
| 5 | LOD de olivos (N0 celdas de 64 m / N1 instanciado / N2 instanciado) y de la nube (`setDrawRange`, 16 bits) | Hecho | Gemelo de Cerro a distancia: 261 k tri y 83 MB de heap (antes 1,68 M tri y 185 MB) |
| 6 | Planificador con presupuesto (`Cola`, generadores) | Hecho: terreno, nube, ruido, celdas de olivos van a rebanadas de ~4–6 ms por fotograma; botón «Gemelo» ya no bloquea | Rebanada máxima medida en el contador `?debug` (ver MEDIDAS.md) |
| 7 | Hituelo (exportador, selector fincas→parcelas) | Hecho | 46 teselas, 5.882 olivos, 27 parcelas, 4 fincas cargan y se recorren (órbita, modos, NDVI, paseo, quad, dron) con 0 errores |
| 8 | Minimapa global, balizas, historia | Minimapa y balizas heredan de `Mundo` (mosaico 2 m/px) y funcionan; **la historia está oculta en Hituelo** (su guion es de Cerro): falta escribir el guion corto | Falta ver el minimapa de Hituelo en un paseo largo |
| 9 | Calidad Alta con LiDAR de 3.ª cobertura | Hecha para Hituelo (los datos ya eran LiDAR) | — |

## Lo que sigue a medias o sin comprobar

- Leer el resultado del paso 0 (si falla, plan B del diseño §8: una página por zona o `assets`).
- **Ningún fps real**: SwiftShader no sirve. Falta un iPhone con `?debug`.
- Guion de historia de Hituelo (Marín Hituelo no tiene trabajos ni fenología en OlivarTrack).
- Pulido: color de los olivos N1/N2 (algo verde-gris y uniforme), hueco entre teselas sin datos, liberar la ortofoto decodificada por LRU (hay `liberaOrtoLejos`, sin probar en largo).
- Cosas que dependen de datos aún no probadas contra Hituelo real: ficha de olivo, balizas con OlivarTrack, lectura en vivo por MCP.

## Cómo seguir
`python montar_v2.py` (Cerro embebido) · `python montar_v2.py --modo ficheros --finca cerro|hituelo|cerro_x9` · `node prueba.js|prueba2.js|prueba3.js` (ver LEEME.md).
