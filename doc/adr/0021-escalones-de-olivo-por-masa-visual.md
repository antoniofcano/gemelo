# ADR-0021 — Escalones de olivo por masa visual

- **Estado:** Propuesto
- **Fecha:** 2026-10-30

## Contexto
Decisión 80 ([DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md)): paseando por Hituelo con `?olivos=escalera` ([ADR-0019](0019-escalera-de-olivos.md)), Antonio ve que el olivo vecino, a 10-12 m, «se ve como un árbol en abandono esquelético», como si se hubiera «achicado», y que a unos 3 m «se transforma como una cenicienta en un árbol bonito». El plan B (E1 a los seis más cercanos y sin E0 en el paseo) lo descartó él: «el árbol de ese nivel no representa nada». O9a midió antes de decidir (todas las cifras: [MEDIDAS](../sistema/MEDIDAS.md#escalones-de-olivo-por-masa-visual-o9a-2026-10-30-foto-no-se-mantiene); scripts `pruebas/olivo/o9a_escalones.mjs` en Node y `pruebas/olivo/o9a_masa.mjs` en Chrome por el turno del banco).

**Lo que hace hoy cada escalón** (`apps/web/olivo/niveles.js`, cifras del olivo «medido» del fixture, centenario3 con `copas_param` h 3,8 m y copa 4,3 m):

| | Triángulos | Tarjetas de hoja (ramitas / relleno) | Qué quita |
|---|---|---|---|
| E0 | 67.356 | 2.436 / 107 | — |
| E1 | 31.842 | **las mismas** | los prismas de los brotes finos; olivas en octaedro |
| E2 | 11.678 | **las mismas** | además pies, raíces y ramas madre a un cuarto de resolución; olivas en puntos |
| E2-VR | 9.242 | 1.218 (la mitad, ×1,38) / 107 (×1,25) | además la mitad de las ramitas, las interiores y bajas: el área de hoja queda en el 94 %, pero la falda se va (la tarjeta más baja sube de 1,1 a 1,7 m) |

Ningún escalón **propio** encoge el árbol: E0, E1 y E2 de una receta tienen la misma caja de copa, la misma altura y la misma área de hoja (132 m² de ramitas); `receta.medidas` no cambia. La hipótesis «quitan hojas» es falsa en E1/E2 y solo vale, a medias, en E2-VR.

**Lo que sí encoge y desfigura: la variante.** Más allá de los propios (como mucho 6), el motor dibuja **variantes** compartidas (centenario3 de su tipo, copa 9,4 m y 5 m de alto) estiradas a cada copa con `matrizDe` de `07ab_generados.js`: copa = 2 × r8 medio × `FACTOR_R8` (hoy 0,5). Pero los propios salen de `copas_param`, cuya `copa_m` es **2 × r8 medio** (el diámetro, [contrato](../../contratos/olivo-generado.md)), y Hituelo real lleva `copas_param` en casi todos sus olivos. Resultado: **el mismo olivo mide 4,3 m de ancho en E0/E1 y 2,15 m en E2 y en el impostor** (que usa la misma matriz). Para llegar a 2,15 m la variante se comprime ×0,229 en horizontal y ×0,8 en vertical: las ramas y las 4.362 tarjetas de una copa de 9,4 m quedan en una columna de 1,6-1,9 m, con las hojas aplastadas en astillas. Eso es el «árbol esquelético achicado»; y cuando se acerca y pasa a propio, dobla su anchura de golpe: la «cenicienta».

**Dónde salta hoy** (reparto real `Escalera.planifica`, paseo por la calle a 1,4 m/s, rejilla de 11 m; con 10 y 12 m, ±1-2 m):

| Aparato (presupuesto) | Reparto asentado | E2 → E1 | E1 → E0 | E0 → E1 | E1 → E2 |
|---|---|---|---|---|---|
| Escritorio (538 k) | 1 E0 + 5 E1 + 26 E2, hasta 35 m | 11,4 m, delante | 6,2 m, **ya detrás** | 13,6 m, detrás | 23,7 m, detrás |
| Móvil (258 k) | 1 E0 + 2 E1 + 10 E2, hasta 23 m | 6,6 m, delante | 5,9 m, delante | 9,3 m, detrás | 18,8 m, detrás |
| Gafas, perfil 0 (368 k) | 1 E0 + 4 E1 + 18 E2-VR, hasta 30 m | 15,4 m, delante | 5,9 m, delante | 9,3 m, detrás | 20,5 m, detrás |

El olivo siguiente de la fila (a 11-12 m) está en variante E2 justo hasta los 11 m (escritorio) o 6,6 m (móvil): exactamente lo que describe Antonio. Y la histéresis por distancia (`MARGEN` de 12 m más 24 m de prima para el E0) deja el E0 en el olivo que ya se ha pasado: en escritorio, el E0 casi siempre está **detrás** del paseante. Un olivo de 5 m a 11 m ocupa ≈ 640 px de alto en 1080p (cámara de 42°) y ≈ 320 px por ojo en Quest 3 [aproximado, NO VERIFICADO en aparato]: mucho para ser una variante deformada.

**Masa visual** (Chrome sin pantalla, SwiftShader, three 0.186.1; media de 8 vistas horizontales, encuadre del E0; imagen de 512 px, el olivo «medido» ≈ 300 px de alto; tabla completa en MEDIDAS):

| Olivo «medido», 512 px | Tri | Cobertura (Δ E0) | IoU silueta | Huecos | Contraste |
|---|---|---|---|---|---|
| E0 | 67 k | 0,67 | 1 | 16 % | 0,63 |
| E1 | 32 k | −2 % | 0,998 | 18 % | 0,61 |
| E2 | 12 k | −4 % | 0,994 | 19 % | 0,51 |
| E2-VR | 9 k | −2 % | **0,89** | 21 % | 0,51 |
| Variante E2 a r8 × 0,5 (lo que dibuja el motor) | 18 k | **−45 %** | **0,47** (cenital 0,25) | 14 % | 0,44 |
| Variante E2 a la copa del propio | 18 k | +7 % | 0,69 | 11 % | 0,42 |
| Impostor emulado de la variante, r8 × 0,5 | 2 | **−42 %** | **0,46** | 4 % | **0,17** |

Tres lecturas: (1) **de cerca, E1 y E2 propios conservan la masa** (cobertura −0,5 a −4 %, IoU ≥ 0,99 en los tres olivos); E2-VR pierde la falda (IoU 0,86-0,89). (2) **Lo que falla es la variante**: la mitad de ancha y de otra forma (IoU 0,47; con la copa corregida, 0,69: queda el salto de forma de ADR-0019). (3) **A pocos píxeles el follaje se deshace** en todos los escalones: a 128 px (el olivo ≈ 60-75 px de alto) la cobertura del E0 del centenario baja de 0,76 a 0,49 y los huecos suben del 11 al 35 %; en E1, un 17-27 % menos todavía. Es el recorte alfa con *mipmaps* (las texturas de ramita, 256 × 512, se promedian y el alfa cae por debajo de 0,45): las hojas desaparecen y quedan las ramas, el «esqueleto». Y en E2 las olivas como puntos sin luz (`PointsMaterial`, 1 px como mínimo) aclaran la copa a esa distancia (luz media 58 → 92-136). El impostor, al revés, es una mancha casi sin huecos ni contraste (4 % y 0,17 frente a 16 % y 0,63).

**La industria** (breve; lo no citado, [NO VERIFICADO]):
- SpeedTree reduce hojas **conservando el volumen**: menos tarjetas pero más grandes, encogiendo poco a poco las que se van y agrandando las que quedan, y pasa al *billboard* con un fundido por distancia (con *alpha-to-coverage*) eligiendo la imagen por ángulo; el consejo es que el *billboard* case con el último 3D ([SpeedTree, nivel de detalle](https://docs9.speedtree.com/sdk/doku.php?id=level-of-detail); [SDK en Unity](https://docs.unity3d.com/speedtree-runtime-sdk/manual/level-of-detail.html)).
- Unity elige el nivel por **altura relativa en pantalla** (LOD Group) y funde con *cross-fade* o, con SpeedTree, interpolando vértices ([Unity, transiciones de LOD](https://docs.unity.com/en-us/engine/6000.6/manual/analysis/graphics-performance-profiling/lod/lod-group/lod-transitions-lod-group)).
- Unreal: tamaño en pantalla por nivel y «Dithered LOD Transition» en el material del follaje: durante la transición se dibujan los dos niveles con tramado ([foro de Epic](https://forums.unrealengine.com/t/foliage-lod-draw-calls-problem-foliage-system-doesnt-kick-lods/330644)).
- El recorte alfa con *mipmaps* hace desaparecer el follaje con la distancia; se corrige escalando el alfa de cada *mip* para conservar la cobertura ([The Witness, «Computing alpha mipmaps»](http://the-witness.net/news/2010/09/computing-alpha-mipmaps/); NVIDIA Texture Tools, Unity `mipMapsPreserveCoverage`) o con alfa «hashed» ([Wyman y McGuire 2017](https://research.nvidia.com/sites/default/files/pubs/2017-02_Hashed-Alpha-Testing/Wyman2017Hashed.pdf)).
- Triángulos típicos por nivel en juegos de mundo abierto (árbol hero 50-150 k, LOD1 ≈ 30-50 %, LOD2 ≈ 10-15 %, *billboard* 2-8 triángulos) **[NO VERIFICADO]**: cifras de oficio, sin fuente citable aquí.

## Decisión
Los escalones del olivo **conservan la masa visual del E0 del mismo olivo**: E1 y E2 se derivan del E0 agrupando las hojas en **tarjetas** (racimos) con un atlas horneado por época, con objetivo E1 ≤ 30 k y E2 ≤ 10 k triángulos, cobertura ≥ 90 % de la del E0 e IoU de silueta ≥ 0,9 en las 8 vistas y la cenital; la variante y el impostor se estiran a la **misma copa** que el propio; el escalón se elige por **alto en píxeles** con fronteras desplazadas por el presupuesto, y se funde por **banda de metros** en vez de por disparo.

En concreto:
1. **Misma copa en todos los escalones (arreglo inmediato, O9b-0):** `matrizDe` estira la variante a la copa que pide el propio (`copas_param.copa_m` si lo hay; si no, 2 × r8 medio × `FACTOR_R8`), y el impostor la hereda. Una línea de motor; quita el «achicado» sin esperar al resto.
2. **Variantes desde el tipo y la copa medidos:** las variantes se generan a un tamaño cercano al de la finca (mediana de `copas_param`) para que el estirado quede en 0,8-1,25 y no deforme las tarjetas.
3. **E1/E2 por tarjetas (O9b, constructor):** de la receta E0 se agrupan las ramitas por cercanía en racimos; cada racimo es una tarjeta (o dos cruzadas) con la imagen de sus hojas horneada de frente en un atlas por época; la madera fina se quita como hoy. E2-VR deja de aclarar: usa las mismas tarjetas de E2. Las olivas de E2 van en el atlas (o con luz), no como puntos sin luz.
4. **Selección por tamaño en pantalla (O9c, motor):** alto en píxeles = altura / (2 · d · tan(fov/2)) · alto del búfer; umbrales de partida E0 ≥ 700 px, E1 ≥ 250 px, E2 ≥ 90 px, impostor por debajo, **desplazados** hacia arriba cuando el presupuesto no da, y sin la prima de histéresis que deja el E0 detrás (la histéresis pasa a ser de píxeles: ± 15 %).
5. **Fundido por banda (O9c):** el código de fundido de cada árbol depende de su distancia dentro de una banda de ± 1,5 m alrededor de la frontera (tramado proporcional), no de un temporizador de 0,6 s disparado al cambiar el lote.
6. **Mipmaps con cobertura conservada** en las texturas de hoja (`dibujaRamita`, `dibujaRelleno` y el atlas de tarjetas): el alfa de cada nivel se reescala para que pase el mismo `alphaTest` que el nivel 0.

## Alternativas consideradas
- **Plan B (E1 a los seis más cercanos, sin E0 en el paseo)** — descartado por Antonio: el E1 actual no representa al árbol, y no arregla la variante deformada.
- **Un E3 propio de pocos triángulos** entre E2 y el impostor (ya descartado en la decisión 28) — no ataca la causa (la copa distinta y las tarjetas aplastadas); se reabre si con O9b sigue habiendo salto entre E2 y el impostor.
- **Más variantes** (8-16 en vez de 4) — más parecido de forma, pero no de anchura si el estirado sigue usando `FACTOR_R8`; cuesta memoria y horneado (×2-4 de las cifras de O7c). Útil después, no en lugar de esto.
- **Impostores a 256 px por vista** — la celda de 128 px ya da ≈ 45 px de alto a un árbol de 5 m (la esfera de la caja de una copa de 9,4 m deja mucho vacío); doblarla cuadruplica el atlas (≈ 8 MB por época) y no corrige la anchura. Mejor ajustar el encuadre por variante (O8d) cuando la variante tenga el tamaño de la finca (punto 2).
- **Seguir quitando hojas en vez de agruparlas** — es lo que hace E2-VR: el área total aguanta (94 %) pero se va la falda y la silueta se agujerea; ninguna referencia de la industria lo hace sin agrandar las que quedan y sin conservar la cobertura.

## Consecuencias
- **Positivas:** el vecino a 10-12 m tiene la anchura, la altura y la cobertura de su E0; los saltos que quedan son de detalle fino (ramitas, olivas), no de masa. Los triángulos bajan (E1 de 32-48 k a ≤ 30 k; E2 de 12-19 k a ≤ 10 k), lo que da más propios o más radio 3D con el mismo presupuesto.
- **Negativas / coste:** un atlas de tarjetas por época y por receta propia (o compartido por tipo) que hay que hornear en el trabajador o en el servidor; más trabajo en el constructor (agrupar, hornear, empaquetar) y un formato horneado nuevo (versión de `GEN_VERSION`/`CACHE_VERSION` y del contrato `olivo-horneado`). El cambio del punto 1 cambia el aspecto de lejos de todo Hituelo (las copas lejanas pasan a medir el doble de ancho, como sus propios): hay que mirarlo junto a la decisión 48 (`factorR8`).
- **Implicaciones futuras:** los umbrales en píxeles y la banda de fundido se ajustan en aparato (O9d); el impostor (O8b) se vuelve a hornear con las variantes nuevas.

## Lo que cambia en el constructor frente al motor
| Constructor (`apps/web/olivo/`) | Motor (`apps/web/motor/07ab`, `07ac`) |
|---|---|
| `niveles.js`: E1/E2 por racimos de tarjetas; E2-VR = E2 | `matrizDe`: la variante, a la copa del propio (punto 1) |
| atlas de tarjetas por época (horneado como el impostor: página de horneado, SwiftShader) | `Escalera.planifica`: nivel por píxeles, histéresis en píxeles, sin prima de E0 |
| `materiales.js`/`texturas.js`: mipmaps con cobertura conservada | fundido por banda de metros (código de fundido por distancia, no por lote) |
| contrato `olivo-horneado` y versiones | variantes del manifiesto con el tamaño de la finca (hornero) |

## Plan
- **O9b-0** (motor, ligera, ≈ 0,5 día): punto 1 con su prueba en `escalera_motor.mjs` (misma copa en E1 y E2 para un olivo con `copas_param`). Repetir `o9a_masa.mjs`.
- **O9b** (constructor, pesada, ≈ 3-4 días): racimos y atlas de tarjetas, E1 ≤ 30 k y E2 ≤ 10 k, mipmaps con cobertura; criterios medidos con `o9a_masa.mjs` (cobertura ≥ 90 % e IoU ≥ 0,9 frente a E0, en 512 y en 128 px); huellas y contrato nuevos.
- **O9c** (motor, media, ≈ 2 días): selección por píxeles con fronteras desplazadas por presupuesto, fundido por banda y su prueba de paseo (sin E0 detrás; ningún cambio fuera de la banda).
- **O9d** (Antonio): paseo real en móvil y Quest.

## Comprobación
- `node pruebas/olivo/o9a_escalones.mjs` (Node) y `node pruebas/olivo/o9a_masa.mjs` (Chrome, turno del banco): las tablas de MEDIDAS; los criterios del punto 3 se convierten en guardián cuando exista O9b.
- **No probado:** nada de esto en un aparato real (móvil, Quest): los px por ojo del Quest son aproximados; SwiftShader vale para áreas y colores de una imagen fija, no para fps. El impostor está **emulado** (vista exacta, sin la rejilla 8 × 8 ni sus *mipmaps*): es una cota optimista. La luz de la medida no es la del motor (sin parche de tiempo ni calibración de motor): los colores valen para comparar escalones entre sí, no como color absoluto. Que la copa doble sea lo que Antonio ve en Hituelo real es una deducción del código y del fixture: Hituelo real no se ha medido aquí.
