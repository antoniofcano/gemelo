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
- `apps/web/motor/04f_suelo_fotos.js` carga las 26 imágenes (mismo origen: `suelo/<clase>[_v<k>]_<px>[_relieve].webp`, copiadas por Vite desde `apps/web/public/`). Las decodifica en la Cola, con la prioridad más baja y medio nivel por rebanada, y las junta en **una `DataArrayTexture`** RGBA: el color en RGB y el relieve en A. Añade un solo muestreador al relieve, más el del campo del ruedo.
- `04d_sombreado_tiles.js` añade su GLSL **solo con la bandera**, por tres anclas que comprueban `sombreado_tiles.test.js` y `suelo_fotos.test.js`. Usa otro programa (`terreno-3dtiles-fotos`). Sin la bandera, el sombreador es el mismo de antes, letra por letra (salvo el arreglo de `uGnd`, abajo, que es de lo de siempre).
- **Repetición estocástica:** técnica 3 de Quilez («texture variation»), con el índice de un ruido procedimental en vez de otra textura, y mezcla que conserva la varianza. Cada celda del ruido escoge, además del desplazamiento, la variante. Se mezclan **solo las 2 clases que más pesan** en cada píxel.
- **Fundido por distancia:** entero hasta 12 m y nada desde 40 m. Más allá no se lee ninguna textura, y la gravilla procedimental de `04d` cede ante la foto en esa franja.
- **VR:** apagado aunque esté la bandera (`uFotK = 0` mientras `Aparato.vr()`), salvo `?sueloVR=1`, hasta medirlo en el Quest.
- **Tamaño:** 768 px en escritorio y 384 px en móvil y gafas. `?sueloPx=384` lo fuerza. Antes eran 1024 y 512 con 7 niveles; con las variantes se bajó el tamaño para que los 13 niveles quepan en casi la misma memoria (límite abajo).

## Presupuesto (regla 6), declarado y no medido en un aparato
| | Escritorio (768) | Móvil / VR (384) |
|---|---|---|
| Memoria de la tarjeta gráfica (13 niveles RGBA8 con mipmaps) | 39,0 MB (antes 37,3, con 7 a 1024) | 9,8 MB (antes 9,3, con 7 a 512) |
| **Límite declarado** (lo vigila `suelo_fotos.test.js`) | 41 MB | 10,5 MB |
| Campo del ruedo | 16 KB por tesela (128 × 128, 1 byte) | igual |
| Memoria de la CPU (montaje) | 29,3 MB pasajeros: se sueltan en cuanto la textura sube a la tarjeta gráfica (`onUpdate`) | 7,3 MB pasajeros |
| Descarga (WebP) | 3,1 MB | 1,1 MB |
| Lecturas de textura por píxel del suelo cercano | típico 3, máximo 6 (1 del ruedo, 2 × 2 clases, 1 de piedra), las mismas que sin variantes; más allá de 40 m, 0 | igual |
| Llamadas de dibujo / triángulos | +0 / +0 | +0 / +0 |

Son **cálculos** (ancho × alto × 4 × 13 × 4/3), no medidas. La medida la da el banco (abajo) y, en fps, solo un aparato real. **El precio de la variedad es resolución:** 1,8 mm por píxel en la calle de escritorio (1,4 m / 768) en vez de 1,4 mm, y 3,6 mm en móvil en vez de 2,7 mm. Si se ve borroso de cerca, la otra salida sería 1024 px solo en escritorio, a 69 MB. En el repo, las 52 imágenes ocupan 4,2 MB, dentro de los topes del guardián de secretos (340 KB cada una y 4,5 MB en total), que no cambian.

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
- **iPhone y Quest:** no probados. En VR sigue apagado.
- **Las variantes** no se han visto en el motor, solo las texturas sueltas. Falta saber si el cambio de foto entre celdas se nota, si los alveolos grandes de la 21 se ven repetidos en las piedras y si 768 px basta de cerca.
- **La escala** de cada textura es un supuesto.
- **Las reglas de clase** son deducidas, y la del compost es la más débil.

## Defecto anterior corregido: el color ancho (`uGnd`) se leía en otro sitio
`04d` leía `uGnd`, el color ancho del suelo abierto de la tesela del Mundo (256 m, 128 × 128 celdas de 2 m, **fila 0 al sur**), con las coordenadas de la caja del glb (`uvO`, pensadas para la ortofoto del glb, con el **norte arriba**). El tileset tiene hojas de 128 m y nodos de 256 m (`tuberia/tiles3d/genera.mjs`, `--hoja 128`, alineados con la rejilla de teselas). Así que en un nodo de 256 m el color ancho salía **volteado de norte a sur**, y en una hoja de 128 m, además, a **escala doble** y del cuadrante equivocado. Lo demuestra `sombreado_tiles.test.js` («el color ancho… se lee en el texel del mismo punto del mundo»). La prueba pasa una ortofoto sintética, que lleva escrita su posición, por `detalleG()`. Luego evalúa la coordenada que usa el propio GLSL. Sin el arreglo, el punto (200, 40) de una hoja de 128 m leía el color de (143, 176).

**El arreglo** lee `uGnd` con las coordenadas de la tesela (`OP.uvG = lc / 256`), como el campo del ruedo. Afecta a **lo de siempre**, no solo a `?suelo=fotos`, dentro de los 800 m en que se enciende el detalle del suelo. **Qué cambia a la vista:** el color de fondo del suelo cercano (el 85 % sale de `uGnd`) pasa a ser el del mismo sitio en la ortofoto. Desaparecen los saltos de color en los bordes de las hojas de 128 m. Y las referencias de `abierto`, `tono`, `desnudo` y `camino`, que comparan la ortofoto con ese color, dejan de equivocarse por manchas: suelo abierto tomado por copa o sombra (hojarasca oscura de más), o caminos donde no los hay. **No se ha visto en un navegador:** lo dirán las capturas `base` del banco (en «Qué no está probado»).
