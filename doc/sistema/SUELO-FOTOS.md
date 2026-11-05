# Suelo de fotos y paleta del atardecer (EV-1s)

El suelo de cerca puede llevar texturas sacadas de fotos de una finca de Cano & Damas. Las fotos las tomó Antonio el 2026-11-04. La paleta del atardecer sale de 4 fotos de cielo de esa misma tarde. Todo va detrás de la bandera **`?suelo=fotos`**, que está **apagada por defecto**. Cubre las tareas EV-1a, EV-1b, EV-1c y parte de EV-1e de [PLAN](../rumbo/PLAN.md), sobre el estudio [VIABILIDAD-REALISMO](VIABILIDAD-REALISMO.md). Cómo regenerar las texturas: [DATOS](../operacion/DATOS.md#texturas-de-suelo-y-paleta-del-cielo-ev-1s).

## Medido, deducido e ilustrativo (regla 5)
| Qué | Naturaleza | De dónde |
|---|---|---|
| Color del suelo | **medido** | la ortofoto PNOA, como siempre. La textura solo lo **modula** alrededor de 1 (byte / 127,5) y no lo sustituye |
| Aspecto de cerca (hojas, grava, grietas, líquenes) | **ilustrativo** | fotos reales de la finca, pero no de ese punto. Se repiten de forma estocástica |
| Clase de cada punto (calle, hojarasca, ruedo…) | **deducida** | reglas simples (abajo). No hay un mapa medido de clases de suelo |
| Relieve fino (normales) | **deducido** | paso alto de la claridad de la foto: lo claro sube y lo oscuro baja |
| Piedras sueltas | **ilustrativas** | calcomanías por celdas de 0,9 m con la textura de caliza. No son las piedras de verdad |
| Escala de cada textura | **[SUPUESTO]** | las fotos no llevan referencia de tamaño (solo las botas de la 08); ver `tuberia/suelo/recetas.json` |
| Cielo y nubes | **ilustrativos** | simulados por la hora y el tiempo, como siempre. Las fotos solo calibran sus colores al atardecer y no son el fondo |

## Clases y fotos
| Niveles | Clase | Fotos: principal y variantes (cenitales salvo aviso) | Lado supuesto | Dónde se pinta (regla deducida) |
|---|---|---|---|---|
| 0-1 | calle con picado | 02 y 05 (sin las botas). La 01, solo color | 1,4 m | el resto: la entrecalle |
| 2-4 | hojarasca seca (densa) | 15, 06 y 08 (sin las botas) | 1,3 m | anillo en el borde de la copa y manchas dentro del ruedo; menos en los caminos |
| 5 | tierra con grava | 07 (recorte sin la piedra grande) | 0,9 m | el suelo desnudo de la ortofoto que no es camino |
| 6 | compost / materia orgánica | 03 (recorte sin el trozo blanco) | 0,85 m | suelo abierto **más oscuro** que su entorno en la ortofoto. Es la regla más débil: no se sabe dónde se aporta |
| 7 | ruedo rojizo | 04, la mitad derecha (la 11, en perspectiva, solo color) | 0,6 m | dentro de la copa: radio medio de los 8 medidos × 1,15 + 0,5 m [SUPUESTO], con un campo de distancias por tesela |
| 8-9 | camino / rodada | 27 y 25, oblicuas cercanas, fuera de las rodadas (la 26 y la 10, solo color) | 0,5 m | el «camino» que ya deduce `04d` de la ortofoto (suelo desnudo claro); las rodadas siguen siendo las sintéticas de `04d` |
| 10-12 | caliza porosa con líquenes | 23, 20 (sin la mancha rojiza) y 21 (la zona de alveolos pequeños). La 19 y la 22, solo color | 0,35 m | las piedras sueltas, más en la tierra, el ruedo y el camino |

**Variantes.** Donde hay varias fotos de una clase, la tubería saca una textura de cada una, con el mismo contraste y saturación de la clase: 13 niveles en total. Todas tienen media 1 por canal (la luz se aplana), así que no cambian el color de la ortofoto, solo el dibujo. Cada celda del ruido de la repetición estocástica lee una variante, y la celda vecina, otra (`mod(i, n)`: se turnan y ninguna sobra). El salto cae donde ya saltaba el desplazamiento, así que el mosaico se nota menos sin ninguna lectura de más. Cada piedra suelta toma una de las tres calizas.

**Compost y tierra con grava se separan** por el grano: la 03 es más fina, oscura y con restos negros; la 07 tiene más grava y piedrecitas. El color de las dos lo pone la ortofoto. **Hojarasca y calle se separan** igual: la 15 son hojas sueltas y alargadas con aceitunas; la 02 es picado sobre tierra parda.

## Cómo entra en el motor
- `apps/web/motor/04f_suelo_fotos.js` carga **por defecto el KTX2** del tamaño que toca (`suelo/suelo_<px>.ktx2`, abajo): una textura en array comprimida (`CompressedArrayTexture`) con las 13 láminas y sus mipmaps. Si falla, o no es el que espera el sombreado, carga las 26 imágenes de siempre (mismo origen: `suelo/<clase>[_v<k>]_<px>[_relieve].webp`, copiadas por Vite desde `apps/web/public/`). Las decodifica en la Cola, con prioridad 60 y medio nivel por rebanada, y las junta en **una `DataArrayTexture`** RGBA: el color en RGB y el relieve en A. Las dos texturas se leen igual (mismo `sampler2DArray`, mismas láminas). Añade un solo muestreador al relieve, más el del campo del ruedo.
- `04d_sombreado_tiles.js` añade su GLSL **solo con la bandera**, por tres anclas que comprueban `sombreado_tiles.test.js` y `suelo_fotos.test.js`. Usa otro programa (`terreno-3dtiles-fotos`). Sin la bandera, el sombreador es el mismo de antes, letra por letra (salvo el arreglo de `uGnd`, abajo, que es de lo de siempre).
- **Repetición estocástica:** técnica 3 de Quilez («texture variation»), con el índice de un ruido procedimental en vez de otra textura, y mezcla que conserva la varianza. Cada celda del ruido escoge, además del desplazamiento, la variante. Se mezclan **solo las 2 clases que más pesan** en cada píxel.
- **Fundido por distancia:** entero hasta 12 m y nada desde 40 m. Más allá no se lee ninguna textura, y la gravilla procedimental de `04d` cede ante la foto en esa franja.
- **VR:** apagado aunque esté la bandera (`uFotK = 0` mientras `Aparato.vr()`), salvo `?sueloVR=1`, hasta medirlo en el Quest.
- **Tamaño:** 768 px en escritorio y 384 px en móvil y gafas. `?sueloPx=384` lo fuerza. Antes eran 1024 y 512 con 7 niveles; con las variantes se bajó el tamaño para que los 13 niveles quepan en casi la misma memoria (límite abajo).

## Formato: KTX2 (EV-1k)
**Qué es.** Un fichero por tamaño, `apps/web/public/suelo/suelo_768.ktx2` y `suelo_384.ktx2`: **una textura en array** con una capa por nivel (las 13, en el orden de `suelo.json`, que es el de `SueloFotosPuro.CLASES` y `VARIANTES`), con el color en RGB y el relieve en A, como la `DataArrayTexture` de las WebP, y la **cadena de mipmaps entera** (10 niveles a 768, 9 a 384). Va en **UASTC LDR 4x4** con supercompresión **zstd**, RDO 4, mipmaps con el filtro envuelto (la textura es periódica) y en lineal, y la transferencia lineal: son factores, no colores sRGB, así que three lo marca sin espacio de color y lo lee tal cual.

**Por qué UASTC y no ETC1S.** El suelo se ve de cerca y en ángulo rasante, y la textura es un **factor** que multiplica el color de la ortofoto (`tx.rgb * 2`): los bloques y el color cuantizado de ETC1S se verían como manchas al repetirse, y el error se dobla al multiplicar. En la tarjeta gráfica ocupan **lo mismo**: con canal alfa (el relieve), ETC1S también se transcodifica a 1 byte por texel (ETC2 RGBA o BC3). ETC1S solo ahorraría disco: a 384 px, 822 KiB frente a 2.080 KiB (una prueba suelta, no versionada). UASTC se transcodifica casi sin pérdida a **ASTC 4x4** (Quest, iPhone), **BC7** (escritorio) o ETC2 RGBA; si el aparato no tiene ninguno, a RGBA8 (sin ahorro, pero sin romper nada).

**Cómo entra en el motor.** El `KTX2Loader` de three (`three/addons/loaders/KTX2Loader.js`, con `import()` solo con `?suelo=fotos`), con `detectSupport(renderer)` (que elige a qué formato transcodificar) y un solo worker. El transcodificador (`basis_transcoder.js` y `.wasm`) se sirve **del mismo origen**, en `<página>/basis/`: lo copia el `viteStaticCopy` de `apps/web/vite.config.js` desde la three de cada build (super-three en la de VR; hoy los dos ficheros son idénticos byte a byte), y el build falla si no está. El montaje va por la Cola; el loader se libera (sus workers y su URL `blob:`) en cuanto da la textura o falla, y la copia de la CPU se tira tras subirla. La CSP de los Caddyfile ya lo deja: `worker-src 'self' blob:` (el worker nace de una URL `blob:`), `connect-src 'self'` y `'wasm-unsafe-eval'` en `script-src` (EV-1f); lo vigila `csp_wasm.test.js`. Vite emite además una copia con huella del transcodificador en `assets/` (por el `new URL(…, import.meta.url)` del loader) que nadie pide: unos 585 KB de más en el disco del servidor, no en la descarga.

**Vuelta atrás.** Si el KTX2 no está, no se transcodifica, no carga el transcodificador o no trae 13 láminas del tamaño pedido con todos sus mipmaps, se avisa en la consola y se cargan las WebP (`SueloFotosPuro.cargaEnOrden`, probado en Node con intentos de mentira). **`?suelofmt=png`** (o `webp`) fuerza las WebP para comparar; `?suelofmt=ktx2` es lo de por defecto. `__g.SueloFotos.resumen()` dice qué se pidió (`formato`), qué cargó (`cargado`), el formato de la tarjeta (`gpuFormato`, la constante de three) y los bytes subidos (`gpuBytes`, `gpuMB`: la suma de los niveles que sube three, no un cálculo).

**No se versionan: los genera el build** (Antonio, 2026-11-05). `npm run build` de `apps/web` ejecuta `herramientas/suelo_ktx2.mjs` antes de Vite: llama a `tuberia/suelo/ktx2.mjs`, que escribe `suelo_<px>.ktx2` y su manifiesto suelto `ktx2.json` en `apps/web/public/suelo/` (ignorados en `.gitignore`), y Vite los copia con lo público en las dos builds. Si ya están y la huella de su entrada (las huellas de sus 26 WebP en `suelo.json`, las opciones y la versión del codificador) es la de `ktx2.json`, no se rehacen. Si faltan las dependencias de `tuberia/suelo` (`cd tuberia/suelo && npm ci`; la CI ya lo hace en `puerta.yml`), el paso avisa y el build sigue sin KTX2, y el motor carga las WebP. `GEMELO_SUELO_KTX2=0` lo salta. A mano: `node tuberia/suelo/ktx2.mjs [--forzar]` (o `npm run suelo:ktx2` en `apps/web`), desde las WebP, sin las fotos; `construye.mjs` también lo llama al final. Generarlos tarda unos 6 min a 768 y 1,5 a 384 en el i5 (el codificador es de un solo hilo). Es **determinista**: dos codificaciones dieron los mismos bytes. Codificador: el Basis Universal en WebAssembly de `ktx2-encoder` 0.6.0; como su envoltorio solo hace texturas 2D y cubos, `ktx2.mjs` usa su módulo de Basis y le pide una textura en array (`cBASISTexType2DArray`). `ktx-parse` 1.1.0 lee la cabecera. Ver [DATOS](../operacion/DATOS.md#texturas-de-suelo-y-paleta-del-cielo-ev-1s).

**Tamaño** (en el `dist`, no en el repo): 8.338 KiB a 768 y 2.080 KiB a 384, frente a 3,1 MB y 1,1 MB de las WebP. En el repo no ocupa nada: `suelo_tuberia.test.js` comprueba que no hay ningún `.ktx2` versionado, que están ignorados y que el build los pide.

## Presupuesto (regla 6), declarado y no medido en un aparato
| | Escritorio (768) | Móvil / VR (384) |
|---|---|---|
| Memoria de la tarjeta gráfica (13 niveles RGBA8 con mipmaps: las WebP, `?suelofmt=png`) | 39,0 MB (antes 37,3, con 7 a 1024) | 9,8 MB (antes 9,3, con 7 a 512) |
| **Límite declarado** (lo vigila `suelo_fotos.test.js`) | 41 MB | 10,5 MB |
| Memoria de la tarjeta gráfica con el **KTX2** (1 byte por texel: ASTC 4x4, BC7 o ETC2 RGBA, en bloques de 4×4, con mipmaps) | 9,8 MB | 2,4 MB |
| Campo del ruedo | 16 KB por tesela (128 × 128, 1 byte) | igual |
| Memoria de la CPU (montaje) | 29,3 MB pasajeros: se sueltan en cuanto la textura sube a la tarjeta gráfica (`onUpdate`). Con KTX2, 9,8 MB (los niveles transcodificados), también pasajeros | 7,3 MB pasajeros (KTX2: 2,4 MB) |
| Descarga (WebP) | 3,1 MB | 1,1 MB |
| Descarga (KTX2, más el transcodificador la primera vez: 57 KB + 527 KB) | 8,1 MiB | 2,0 MiB |
| Lecturas de textura por píxel del suelo cercano | típico 3, máximo 6 (1 del ruedo, 2 × 2 clases, 1 de piedra), las mismas que sin variantes; más allá de 40 m, 0 | igual |
| Llamadas de dibujo / triángulos | +0 / +0 | +0 / +0 |

Las cifras de RGBA8 son **cálculos** (ancho × alto × 4 × 13 × 4/3). Las del KTX2 están **medidas en el banco** (2026-11-05, SwiftShader, fixture de Hituelo, escenario `cerca`: [MEDIDAS](MEDIDAS.md#suelo-de-fotos-en-ktx2-ev-1k-2026-11-05-foto-no-se-mantiene)): `SueloFotos.resumen().gpuBytes`, la suma de los niveles que sube three, da 10.224.240 B (9,8 MB) a 768 y 2.556.528 B (2,4 MB) a 384, en ASTC 4x4, frente a 39,0 MB de RGBA8 a 768: **una cuarta parte**. En un aparato no está medido. La medida la da el banco (abajo) y, en fps, solo un aparato real. **El precio de la variedad es resolución:** 1,8 mm por píxel en la calle de escritorio (1,4 m / 768) en vez de 1,4 mm, y 3,6 mm en móvil en vez de 2,7 mm. Si se ve borroso de cerca, la otra salida sería 1024 px solo en escritorio, a 69 MB. En el repo, las 52 imágenes ocupan 4,2 MB, dentro de los topes del guardián de secretos (340 KB cada una y 4,5 MB en total), que no cambian.

## Paleta del atardecer
De `tuberia/suelo/paleta_cielo.json`. El horizonte y el cenit salen de la foto 03 (el degradado completo) y las nubes, de las 4 fotos; lo oscuro (siluetas) se descarta. Horizonte `#b18a70`, cenit `#616f83`, nube iluminada `#dab192` y nube en sombra `#77757a`. Con `?suelo=fotos`, `15_tiempo.js` cambia dos cosas. El color de ocaso del fondo pasa a ser el del horizonte con un 25 % del cenit; el fondo es un color liso, así que el degradado no se puede pintar. Y las nubes, a la puesta, van de la cara iluminada (abajo) a la de sombra (arriba). Lo comprueba `suelo_fotos.test.js`, que también mira que la paleta del motor sea la del json.

## Qué no está probado
- **Nada se ha visto en un navegador todavía:** ni que el GLSL compile en todos los aparatos, ni el aspecto. La prueba de capturas está preparada, sin ejecutar:
  ```bash
  npm run fixture                                   # si falta pruebas/salida/fixture/
  node pruebas/suelo_fotos_capturas.js              # monta la página de Hituelo con Vite y deja el encargo (no abre Chrome); --dry solo lo imprime
  npm run banco:ronda                               # el único Chrome, en su turno
  ```
  Las variantes son `base`, `fotos` (`?suelo=fotos`), `fotos384` (`&sueloPx=384`), `ocaso` (`?hora=18:45`) y `ocasoFotos`, en los escenarios `cerca`, `paseo` y `paseoE`, con capturas y desglose.
  Las capturas `cerca`, `paseo` y `paseoE` de `base` frente a `fotos` deben dar las mismas llamadas y los mismos triángulos y 0 errores. `ocaso` frente a `ocasoFotos` enseña la paleta. SwiftShader no da fps.
- **iPhone y Quest:** no probados. En VR sigue apagado. **El KTX2 tampoco:** no se sabe a qué formato lo transcodifica `detectSupport` en el Quest 3 ni en el iPhone (debería ser ASTC 4x4), cuánto tarda el worker en transcodificar las 13 láminas, si la memoria baja de verdad en el casco, ni si se nota la pérdida de UASTC de cerca frente a las WebP. Encenderlo en el Quest (`?sueloVR=1`) sigue pendiente de medirlo allí.
- **Las variantes** no se han visto en el motor, solo las texturas sueltas. Falta saber si el cambio de foto entre celdas se nota, si los alveolos grandes de la 21 se ven repetidos en las piedras y si 768 px basta de cerca.
- **La escala** de cada textura es un supuesto.
- **Las reglas de clase** son deducidas, y la del compost es la más débil.

## Defecto anterior corregido: el color ancho (`uGnd`) se leía en otro sitio
`04d` leía `uGnd`, el color ancho del suelo abierto de la tesela del Mundo (256 m, 128 × 128 celdas de 2 m, **fila 0 al sur**), con las coordenadas de la caja del glb (`uvO`, pensadas para la ortofoto del glb, con el **norte arriba**). El tileset tiene hojas de 128 m y nodos de 256 m (`tuberia/tiles3d/genera.mjs`, `--hoja 128`, alineados con la rejilla de teselas). Así que en un nodo de 256 m el color ancho salía **volteado de norte a sur**, y en una hoja de 128 m, además, a **escala doble** y del cuadrante equivocado. Lo demuestra `sombreado_tiles.test.js` («el color ancho… se lee en el texel del mismo punto del mundo»). La prueba pasa una ortofoto sintética, que lleva escrita su posición, por `detalleG()`. Luego evalúa la coordenada que usa el propio GLSL. Sin el arreglo, el punto (200, 40) de una hoja de 128 m leía el color de (143, 176).

**El arreglo** lee `uGnd` con las coordenadas de la tesela (`OP.uvG = lc / 256`), como el campo del ruedo. Afecta a **lo de siempre**, no solo a `?suelo=fotos`, dentro de los 800 m en que se enciende el detalle del suelo. **Qué cambia a la vista:** el color de fondo del suelo cercano (el 85 % sale de `uGnd`) pasa a ser el del mismo sitio en la ortofoto. Desaparecen los saltos de color en los bordes de las hojas de 128 m. Y las referencias de `abierto`, `tono`, `desnudo` y `camino`, que comparan la ortofoto con ese color, dejan de equivocarse por manchas: suelo abierto tomado por copa o sombra (hojarasca oscura de más), o caminos donde no los hay. **No se ha visto en un navegador:** lo dirán las capturas `base` del banco (en «Qué no está probado»).
