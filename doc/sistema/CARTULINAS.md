# Cartulinas recortadas a la silueta (AG-2.2)

Las cartulinas con recorte alfa (ramitas, relleno y tarjetas de los olivos generados; impostores y sustitutos de los olivos lejanos) eran rectángulos: la mayor parte de su área es transparente y la GPU la rasteriza igual (sobredibujo: cada píxel transparente pasa por el sombreador de fragmentos y se descarta). Con `?cartulina=silueta` cada cartulina se dibuja con el **polígono convexo de 6 vértices que abraza lo opaco de su textura**, calculado una vez (al montar los materiales, al hornear o en la tubería), nunca por fotograma, con las mismas uv. Estado: **hecho y probado en Node; defecto `rect`; sin capturas ni medida de dibujo todavía (orden para el banco abajo) y no probado en Quest ni en iPhone**.

## Inventario

Área transparente = lo que se rasteriza y se descarta. «Opaco» es la fracción de texeles que pasan el `alphaTest` del material; «silueta» es el área del hexágono frente al rectángulo (el resto del rectángulo deja de rasterizarse). Medido en Node con las texturas de verdad (`apps/web/olivo/texturas.js`, dibujadas con `@napi-rs/canvas` 0.1.65, Skia, fuera del repo; la ramita da 18,2 % y 19,1 % de opaco, lo mismo que midió Chrome para `PHI_RAMITA`: 0,182 / 0,191), con sus mipmaps de cobertura, una corrida, 2026-11-05:

| Cartulina | Textura | Dónde se calcula | Opaco | Transparente rect → silueta (6 v) | Triángulos rect → silueta |
|---|---|---|---|---|---|
| ramitas 0 y 1 (E0) | `dibujaRamita` 256 × 512, `alphaTest` 0,45 | 07ab, al montar los materiales (cola propia) | 18-24 % | 76-82 % → 43-51 % del rectángulo (el hexágono ocupa 66-71 %) | 2 → 4 |
| relleno (E0-E2) | `dibujaRelleno` 512 × 512, 0,5 | igual | 20-35 % | 65-80 % → 48-60 % (hexágono 79-83 %) | 2 → 4 |
| tarjetas de racimo (E1/E2), con y sin olivas | `dibujaAtlasTarjetas` 1024 × 512, celdas de 256, 0,45 | igual | 25-31 % | 69-75 % → 43-51 % (hexágono 73-77 % de cada plano) | 6 → 12 (tres planos) |
| impostor lejano | atlas de color 2048², 8 × 8 vistas de 128 px por variante, 0,5 | **tubería** (`tuberia/olivos/impostores.mjs`, `siluetasAtlas`), en la fila del manifiesto | **sin medir** (no hay atlas de Hituelo en el repo) | **sin medir** | 2 → 4 por olivo |
| sustituto lejano (sin impostores) | horneado en el motor, 2 vistas × variante, 128 px | 07ac, al hornear (lectura de la GPU una vez y la Cola) | **sin medir** | **sin medir** | 4 → 8 por olivo |

Con octógono (8 vértices, 6 triángulos) el área baja solo 2-4 puntos más (ramita 63-69 %): no compensa los triángulos; se queda el hexágono. El interior de estas texturas está muy hueco (opaco 20-30 %): una silueta **convexa** no quita los huecos de dentro, solo los bordes.

No se tocan: las hojas de `07_follaje.js` (son puntos, `PointsMaterial`, sin geometría que recortar); las matas de hierba de `21_suelo.js` (`atlasHierba`; van con EV-1d); las láminas de texto de `02d_laminas.js` (carteles).

## Triángulos (lo que sube)

Por olivo generado, centenario3 semilla 7 envero, contado en Node con el constructor (`triangulosNivel` más lo que añade la silueta):

| Nivel | Rect | Silueta | Cartulinas |
|---|---|---|---|
| E0 | 102.978 | 112.800 (+10 %) | 4.749 ramitas, 162 rellenos |
| E1 | 23.080 | 25.324 (+10 %) | 320 tarjetas, 162 rellenos |
| E2 | 10.702 | 11.860 (+11 %) | 139 tarjetas, 162 rellenos |

El reparto de la escalera **paga** esos triángulos (`extraSil` en `tri()` de 07ab; los lejanos, con `Lejanos.triangulos()`): el presupuesto del aparato y los topes de `pruebas/presupuesto.json` no se pasan, pero con la silueta las fronteras de escalón se acercan un poco (menos olivos en E0/E1 con el mismo tope). Con `rect` (defecto) no cambia nada.

## Por qué el defecto es `rect`

Por construcción el aspecto no cambia (mismos píxeles opacos, abajo), pero el balance no está medido: los triángulos de las cartulinas se duplican (+10 % por olivo, y el reparto lo compensa con menos detalle) y los píxeles que se rasterizan bajan entre un 17 % (relleno) y un 34 % (ramitas) en las cartulinas de cerca. Qué pesa más depende de la GPU: en una de teselas (Quest, iPhone) el sobredibujo de recortes alfa suele mandar, pero **no se ha medido** (regla 7). SwiftShader no da fps (sirve para recuentos y para comparar capturas). Se decide con `?debug` en un aparato real, `?cartulina=rect` frente a `silueta`; si gana la silueta, el defecto se cambia en `CARTULINA_DEFECTO` (`02i_materiales.js`).

## Cómo se calcula (`apps/web/olivo/silueta.js`)

Sin THREE ni DOM; lo usan el motor y la tubería. Es el «particle trimming» de Humus (2011) y el `SpriteMeshType.Tight` de Unity, en convexo:

1. Los texeles con alfa ≥ el `alphaTest` del material en el nivel 0 y en los mipmaps de al menos 16 texeles de lado (los mismos que lee la GPU: los de cobertura de `mipsConCobertura` en 07ab; los de caja de `mipsCaja`, como `generateMipmaps`, en el sustituto y el impostor). Cada texel cuenta como su cuadrado **ensanchado 1 texel** de su nivel (el filtrado bilineal lee hasta medio texel fuera), recortado a la región (la celda, en un atlas).
2. La envolvente convexa (cadena monótona de Andrew, con los dos extremos de cada fila).
3. Reducida a 6 vértices quitando cada vez la arista que menos área añade al prolongar sus vecinas: el polígono reducido **sigue conteniendo** la envolvente, y no se sale de la región (salir sería leer la celda vecina). Si no se puede, o si el polígono ocupa más del 90 % del rectángulo, se queda el rectángulo.

Por qué no una librería: three no trae envolvente 2D (`ShapeUtils` triangula; `ConvexHull` de los addons es 3D), y las de envolvente o simplificación (`hull.js`, `concaveman`, `simplify-js`) no garantizan que el polígono reducido contenga lo opaco (`simplify-js` quita vértices hacia dentro). La reducción por prolongación de aristas es la que lo garantiza. Sin dependencias nuevas.

- **07ab** (ramitas, relleno, tarjetas): `recortaQuads` cambia cada cuadrilátero de la geometría compartida por su polígono, con la posición como función afín de las uv del cuadrilátero (las uv no cambian), la misma normal y el mismo sentido de giro. Se calcula en un trabajo de la cola propia (`Gsiluetas`, prioridad −2: antes del primer lote, que espera a que acabe), una textura por rebanada. La sombra usa la misma geometría.
- **07ac impostor**: los polígonos vienen en la fila del manifiesto (`siluetas`, [olivo-impostor §4](../../contratos/olivo-impostor.md#4-fila-en-el-manifiesto-de-la-finca)), van a una textura de datos (6 × 256, RGBA32F) y el sombreador de vértices lee el de la celda (variante, vista) por instancia con `texelFetch`. Como el cuadrado del impostor está girado a la cámara y la celda se lee reproyectada a la base de su vista, cada vértice se coloca con la inversa de esa reproyección (`ot_M`), y el fragmento descarta lo mismo que el cuadrado (`|vOtXY| > 1`). Una fila sin `siluetas` (de un hornero anterior) se dibuja con el cuadrado; el hornero se las añade sin Chrome a las filas que reutiliza.
- **07ac sustituto**: al hornear, una lectura del blanco (`readRenderTargetPixels`, una vez) y las siluetas por la Cola (`Lsil`, prioridad 60); mientras, el estado es «siluetas» y `pendientes()` lo cuenta.

Lo que cada cartulina midió queda en `Materiales.cartulina.piezas` (área, opaco, triángulos) y en el resumen de los lejanos (`silueta`).

**Límites:** con filtrado anisótropo (las hojas llevan `anisotropy = 4`) y en los mipmaps de menos de 16 texeles por celda, el borde puede diferir en una franja de menos de un píxel de pantalla; no se ha visto, porque no hay capturas todavía.

## Cómo compararlo

- `?cartulina=silueta` o `?cartulina=rect` (defecto). Otro valor avisa en consola y se queda en `rect`. `Materiales.cartulina` dice el modo y de dónde viene.
- Capturas y medidas de dibujo (no abre Chrome; deja un encargo en el banco): `node pruebas/cartulinas_capturas.js` (`--dry` imprime la orden). Variantes `rect`, `silueta`, `rectEsc` y `siluetaEsc` (con `?olivos=escalera`: los lejanos, el sustituto en el fixture), a mediodía (`&hora=12:00`); escenarios `lejos`, `cerca` y `paseo`, con capturas y el desglose de llamadas. Se mira que cada pareja dé la misma imagen y cuánto suben los triángulos.
- En un aparato real: `?debug&cartulina=rect` frente a `?debug&cartulina=silueta`, quieto mirando al olivar de cerca. **No probado en Quest ni en iPhone.**

## Pruebas

`pruebas/guardianes/cartulinas.test.js` (Node): la silueta de texturas sintéticas contiene todos los texeles opacos (nivel 0 y mipmaps), tiene entre 6 y 10 vértices y no sale de su celda; `recortaQuads` conserva uv, normal y giro; la perilla; que 07ab y 07ac la miran y no calculan nada por fotograma; las siluetas de la tubería (esquema y contención); y `pruebas/olivo/cartulinas_motor.mjs` (07ab en un vm con ?cartulina=silueta: las siluetas antes del primer lote, con sus triángulos). La prueba de Chrome de `impostor.test.js` comprueba además, en el banco, que las siluetas del atlas horneado contienen sus texeles opacos.
