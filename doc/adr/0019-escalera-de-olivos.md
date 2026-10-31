# ADR-0019 — Escalera de olivos: niveles del constructor e impostores

- **Estado:** Aceptado (Antonio, 2026-10-29; decisiones 69-72)
- **Fecha:** 2026-10-29

## Contexto
Hoy un olivo puede verse de **tres maneras** según la distancia y las banderas: el **nivel 0** de siempre (`06_arboles.js` + `07_follaje.js`: la copa medida de 8 radios como núcleo oscuro, tronco ilustrativo y los puntos LiDAR de la copa como hojas; celdas de 64 m, hasta `MAX0 = 450` olivos), las **«pelotillas»** de los niveles 1 y 2 (`07b_arboles.js` con las formas del tipo −1 de `07a_catalogo.js`: ≈ 170 triángulos hasta `U1 = 460` m y ≈ 30 hasta `U2 = 1.600` m; o las instancias del tileset con `?escena=tiles`, 144 y 24 triángulos por olivo según el nivel, [MEDIDAS](../sistema/MEDIDAS.md)) y, con `?olivos=gen`, los **generados** del constructor ([ADR-0017](0017-constructor-de-olivos-generados.md), [ADR-0018](0018-hornero-de-olivos.md)): el más cercano en E0, otros en E1 y variantes compartidas E2 (E2-VR en gafas) mientras quepan en el 45 % de `TOPE_TRI`. Antonio, en su móvil y con datos reales, ve al acercarse que los tres estilos se alternan y los saltos son «descarados». **Decisión 66** ([DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md)): la escalera es **toda del constructor** (E0 → E1 → E2, E2-VR en gafas, para todos los olivos) y, de lejos, **impostores** horneados del propio árbol generado; fuera el nivel 0 de siempre y las pelotillas; la copa sigue saliendo del LiDAR. Supera la decisión 26 y completa la 27, la 28 y la 52.

**Lo medido o leído en el código** (fuente entre paréntesis):
- Triángulos por árbol, centenario de 3 pies, envero, semilla 7: **E0 102.978 · E1 48.378 · E2 19.366 · E2-VR 14.618** (ADR-0017 §4). Un adulto de un pie da 35-50 k en E0 (anexo de ADR-0017). El motor presupuesta con `ESTIM` = 160 k / 80 k / 38 k / 28 k, que **dobla** los triángulos «por la pasada de sombras» (`costo()` de `07ab_generados.js`).
- **[DEDUCIDO del código, sin confirmar con `renderer.info`]** el motor no activa `renderer.shadowMap` (ninguna aparición en `apps/web/motor/`): la pasada de sombras que se cobra no se dibuja. Si se confirma, en el mismo presupuesto caben unas dos veces más árboles 3D.
- Dibujo fusionado: **6-7 llamadas en total** para 2-7 generados (MEDIDAS, P7 y O1c); sin fusionar serían 36 por árbol.
- Topes del aparato: `TOPE_TRI = 550.000` triángulos de olivo en escritorio; `VR_PERFILES` 380 k / 270 k / 190 k / 130 k (valores de partida **sin medir** en las gafas); el **móvil no tiene perfil propio** (usa el de escritorio y la escala adaptativa). Escala adaptativa de 07b: `esc` de 0,7 a 2,5 según el tiempo por fotograma; techo de diseño 1,7 M triángulos, 250 llamadas, 350 MB (ADR-0002).
- Hituelo: 5.859 olivos (5.882 copas). Densidad de una zona mediana: **28 copas a menos de 40 m** (MEDIDAS, `?olivos=gen` con Hituelo real); la hoja de 128 m más poblada del tileset tiene 1.225 olivos.
- Hituelo real hoy (primera ronda del banco, T3; carga a medias): escena de siempre lejos 273 llamadas / 756 k tri, cerca 87 / 1.294 k; con `?escena=tiles` lejos **258 llamadas (por encima de 250)** / 763 k, cerca 70 / 927 k. Con `?olivos=gen`, cerca 104 / 1.909 k / 160 MB.
- Variantes horneadas (O7c, Hituelo): E2 308 KB y E2-VR 247 KB por objeto (brotli 9); un aparato baja ≈ 1,2 MB (E2) o ≈ 0,95 MB (E2-VR) por época. En el banco (O7e) las horneadas terminaron en 53 s y las calculadas no terminaron en 183 s (SwiftShader). A ojo, los generados salen de un tono crema frente al verde oscuro de las copas medidas.
- Fundido por tramado de pantalla (O1): 0,6 s, sin transparencia, solo entre los generados y el nivel de siempre.
- Cámara: 42° de campo vertical, `pixelRatio` ≤ 2 (`03_escena.js`).

**Lo que no está medido:** fps en ningún aparato (SwiftShader no los da); el coste de un impostor por píxel (alfa con recorte, varias muestras de textura) en móvil y Quest; la memoria de GPU real; cuánto tarda un móvil en calcular un propio; si el tramado parpadea en movimiento en gafas; el peso de un atlas de impostor.

## Decisión
**Todos los olivos se dibujan con el constructor por escalones E0 → E1 → E2 (E2-VR en gafas) → impostor, repartidos por el presupuesto de triángulos del aparato y no por metros; el impostor es hemi-octaédrico (8 × 8 vistas) horneado de las mismas variantes E2 que se ven a media distancia, iluminado por el motor con un mapa de normales; cada escalón entra solo cuando está listo, con fundido por tramado e histéresis; el nivel 0 de siempre, las pelotillas y los olivos del tileset se retiran detrás de `?olivos=escalera` hasta medirlo.**

### 1. Escalones y presupuesto por aparato
- **Presupuesto de la escalera** = `TOPE_TRI × esc` (escala adaptativa de 07b; en gafas, `esc = 1` y el `tri` del perfil VR vigente), **menos los triángulos de los impostores** (2 por olivo). Ya no hay que reservar sitio para los niveles 0-2 de siempre: la escalera dispone de **todo** el tope, no del 45 %. Sigue la regla de 07b: si el fotograma pasa de 1,7 M triángulos, `esc` baja.
- **Perfil del móvil** (nuevo): `tri = 270.000` como **valor de partida sin medir** (el del perfil VR 1), detectado como ya hace `topeCacheMem()` (agente de usuario móvil o `deviceMemory` ≤ 4), con la escala adaptativa encima y techo `esc ≤ 1`. O8d lo fija con `?debug` en el móvil de Antonio.
- **Reparto, de cerca a lejos**, sobre los olivos ordenados por distancia al foco (quien pasea, o el punto que se mira):
  1. **E0 propio**: el más cercano, si cabe (en gafas, solo si no pasa del 40 % del perfil; si no, ese también va en E1).
  2. **E1 propios**: los siguientes, hasta `MAX_PROPIOS = 6` en total **y** mientras los propios no pasen del **60 % del presupuesto** (valor de partida, a medir); el primer propio entra siempre que quepa en el total. Hoy el reparto es voraz y los E1 se comen el sitio de las variantes.
  3. **E2 (E2-VR en gafas)**: variantes compartidas estiradas a la copa y la altura medidas, con el resto del presupuesto, hasta `MAX_VAR = 48`.
  4. **Impostor**: todos los demás hasta `U2 = 1.600` m (como el nivel 2 de hoy). Más lejos, nada: el olivo ya está en la ortofoto.
- **Desde lejos** (cámara a más de 150 m × √`esc` del foco, como hoy) no hay escalones 3D: todo es impostor.
- **Tileset 3D Tiles (`?escena=tiles`, 04c): deja de llevar olivos.** Los impostores los dibuja el motor desde el registro (`copas[]` en CPU), una sola malla instanciada para toda la finca (5.859 instancias, 11,7 k triángulos). La máscara de 04c sobra. Se descarta que el tileset lleve impostores (ver Alternativas). Es una enmienda de [ADR-0015](0015-escena-en-3d-tiles.md): el generador del tileset gana una opción sin olivos (contrato tileset con olivos opcionales), que pasa a ser la de serie cuando la escalera lo sea.

**Estimación por aparato (Hituelo, zona de densidad mediana; centenario 3 pies; cálculo, no medida).** Radio 3D = radio que contiene ese número de olivos con 28 a 40 m.

| Aparato (presupuesto) | Sin cobrar sombras (si se confirma) | Como hoy (coste doblado) |
|---|---|---|
| Escritorio (550 k, `esc` 1) | 1 E0 + 4 E1 + 12 E2 = **17 árboles 3D**, radio ≈ 31 m; ≈ 541 k tri | 1 E0 + 2 E1 + 5 E2 = 8, radio ≈ 21 m; ≈ 309 k tri dibujados |
| Móvil (270 k de partida) | 1 E0 + 1 E1 + 5 E2 = **7**, radio ≈ 20 m; ≈ 260 k tri | 1 E0 + 2 E2 = 3, radio ≈ 13 m |
| Gafas, perfil 0 (380 k) | 1 E0 + 2 E1 + 11 E2-VR = **14**, radio ≈ 28 m; ≈ 373 k tri | 2 E1 + 7 E2-VR = 9 (el E0 pasa del 40 %), radio ≈ 23 m |
| Gafas, perfil 3 (130 k) | 1 E1 + 4 E2-VR = **5**, radio ≈ 17 m; ≈ 118 k tri | 1 E1 + 1 E2-VR = 2 |

En una zona densa (hasta 1.225 olivos en 128 × 128 m) el radio 3D baja a unos 6-10 m: allí casi todo es impostor.

### 2. Impostores
- **Tipo: hemi-octaédrico de 8 × 8 = 64 vistas** (el hemisferio de arriba: la cámara nunca está bajo el suelo; desde el paseo, una mirada algo por debajo del horizonte usa la fila del horizonte). Es **una malla de 2 triángulos** por olivo orientada a la cámara; el sombreador elige la celda del atlas por la dirección de la vista **en el marco propio del árbol** (deshaciendo su giro y su escala) y **mezcla las 3 vistas más cercanas**. Si en el móvil o en las gafas la mezcla sale cara (6 lecturas de textura por píxel), se baja a la vista más cercana con tramado entre vistas (O8d decide con medida).
- **Resolución: 128 px por vista**: atlas de 1.024² por variante; las **4 variantes de una época en un solo atlas de 2.048²** (el mínimo que garantiza WebGL2), así que **1 llamada** para todos los impostores.
- **Dos texturas:** color con cobertura en el alfa (RGBA8, sRGB) a 2.048², y **normales** en el marco del árbol (RGB; el alfa queda libre para una oclusión horneada si O8b la consigue barata) a media resolución, 1.024².
- **Memoria de textura (calculada):** 16 MiB + 4 MiB, más mipmaps (× 4/3): **≈ 26,7 MiB** en todos los aparatos, una sola época cargada. Comparación: con normales a resolución completa, 42,7 MiB; a 256 px por vista, ≈ 107 MiB (171 con normales completas); un cartel de una vista, < 1 MiB.
- **Lo que cuesta la resolución:** un olivo de 5 m **[SUPUESTO: altura típica; la media de Cerro es 4,78 m]** ocupa en pantalla ≈ 1,3 · h · H / d píxeles (H = alto de la imagen en píxeles, d = distancia en metros). Con 128 px por vista, el impostor se ve sin ampliar a partir de ≈ 55 m en un escritorio de 1.080 px de alto, y a ≈ 86 m en un móvil en vertical de 1.688 px (844 × 2) **[SUPUESTO: aparato de ejemplo]**. En el borde de la zona 3D (≈ 20 m en el móvil) se ve **ampliado ≈ 4 veces: blando**. En el escritorio, ≈ 2 veces a 27 m. Es el coste principal de esta decisión (ver Consecuencias).
- **Iluminación:** la pone el motor, no se hornea. El sombreador (Lambert + `onBeforeCompile`, como las instancias de hoy) lee la normal del atlas, la gira al mundo con la matriz de la instancia y aplica el sol y la hora del motor, `parcheTiempo` (sombra de nubes, escarcha) y el tinte por instancia del NDVI (`aviva`) si la capa está activa. La sombra en el suelo sigue siendo la mancha por olivo de `18_paisaje.js` (deducida). Recorte por alfa (umbral 0,5) con mipmaps que conservan la cobertura, para que los árboles lejanos no clareen. Sin profundidad por píxel en la versión 1 (escribirla desactiva la prueba de profundidad temprana).
- **Escala a cada copa medida:** la **misma matriz** que la variante E2 de ese olivo (`matrizDe` de 07ab: copa = 2 × r8 medio × `factorR8`, altura medida, exageración vertical), y cada olivo usa **la misma variante** en E2 y en impostor (`índice de copa mod nº de variantes`). Así, el paso de E2 a impostor es el mismo árbol visto de otra forma. El giro por el rumbo de la copa (`copas_param`), si se añade, va en esa matriz y vale para los dos.
- **Horneado:** con **Chrome sin pantalla** y `playwright-core` (ya fijado a 1.64.1 en el repo y usado por el banco). Una página monta la receta E2 de la variante con el three 0.186.1 del motor, dibuja las 64 vistas a dos objetivos de render (color y normales) y devuelve los bytes. En el servidor corre en la **imagen oficial de Playwright** fijada por versión y digest, como servicio aparte o etapa del hornero; el hornero de hoy (Node en alpine) se queda como está. Descartadas: `headless-gl` (solo WebGL 1, y three dejó WebGL 1 en la r163) y un rasterizador propio (regla 12). La página de horneado es **código de navegador**: la misma sirve para el plan B. La renderiza SwiftShader, así que el resultado no depende de la GPU del servidor; si cambia la versión de Chrome, cambia la huella y se vuelve a hornear.
- **Qué se hornea:** un impostor por variante (tipo + semilla) y época, la actual y la siguiente, como las variantes (ADR-0018): hoy 4 × 2 = 8 atlas, o 2 atlas comunes de 2.048². Formato de transporte (WebP con alfa u otro) y contrato: O8b. Objetos **inmutables por huella** en `/teselas/<finca>/olivos/` y **filas nuevas en el manifiesto por finca** de ADR-0018 (sube la versión del manifiesto: regla 3). Un motor que no conoce las filas las ignora.
- **Plan B en la salida artefacto** (sin servidor ni hornero): **se hornean en el navegador al cargar**, con la misma página de horneado, en cuanto las 4 variantes E2 estén calculadas, a rebanadas por la cola propia de los generados (64 vistas de un E2 de 19 k triángulos por variante; tiempo **sin medir**). Mientras no hay impostores, de lejos se ve la ortofoto sola, y la capa de impostores entra con un fundido de 1 s. Sin la página de horneado (sin WebGL2 o si falla), solo ortofoto lejos, y se dice en `?debug`.

### 3. Transiciones
- **Cada olivo tiene un escalón actual y uno pedido.** El cambio se hace **solo cuando el pedido está listo**: su receta calculada o descargada, dentro de un lote ya montado (escalones 3D), o su atlas subido a la GPU (`renderer.initTexture`, para no dar tirón al primer uso). Hasta entonces se queda en el actual: **un olivo nunca se queda sin dibujar** («aparecer del vacío» está prohibido). La única excepción es la primera carga, cuando aún no hay impostores (§2).
- **Fundido por tramado**, ampliando el de O1 a toda la escalera: 0,6 s (`?olivosFundido=`), tramado complementario entre el escalón que sale y el que entra, también entre impostor y E2. En los impostores, el código de fundido y el instante de inicio van por instancia, así que el fundido no obliga a rehacer la malla. Durante el fundido se dibujan los dos: lo que sale se cuenta aparte (`info.triSaliendo`) y puede pasar del presupuesto **hasta un 10 %** durante esos 0,6 s (valor de partida).
- **Histéresis:** (a) por distancia, un olivo conserva su escalón 3D mientras siga a menos de la distancia de entrada más `MARGEN = 12` m (como los propios de hoy) y sale de 3D a impostor con un margen de 1,15 (como el radio del nivel 0); (b) por tiempo, al menos 1 s entre dos cambios del mismo olivo (valor de partida); (c) si el presupuesto baja (escala o perfil VR), bajan primero los más lejanos.
- **En gafas**, el tramado de pantalla puede verse como parpadeo con la cabeza en movimiento (no probado). Opción: `alphaToCoverage` con MSAA. Se mide en O8d.
- **Salto que queda:** de E1 (árbol propio) a E2 (variante compartida) cambia la forma del árbol, con fundido. Es el precio de las variantes (decisión 63).

### 4. Qué se retira y cuándo
- **Fase A (O8c), con `?olivos=escalera`:** la escalera entera; apagados el nivel 0 de siempre (`arbolesG` de 06 y `follajeG` de 07 en las celdas), los niveles 1 y 2 de 07b (tipo −1 de 07a) y los olivos del tileset. **Sin la bandera, todo igual que hoy** (mismos recuentos), `?olivos=gen` incluido. Si el constructor no carga o falta `BatchedMesh`, vuelve a lo de hoy y lo dice.
- **Fase A con `?olivos=gen` (O8c, 2026-10-31):** si el manifiesto de la finca trae variantes horneadas de la época, `?olivos=gen` dibuja la misma escalera («horneada», `Escalera.modoGen` de `07ab`), con los impostores horneados si su fila casa; mientras la capa de lejanos no está, como `?olivos=gen` de siempre (sin el hueco de la primera carga), y durante el segundo en que entra, el tileset sigue debajo. Sin variantes horneadas, o con `?olivosEscalera=0`, `?olivos=gen` sigue como antes. Cifras en [MEDIDAS](../sistema/MEDIDAS.md).
- **Fase B, por defecto:** cuando O8d cierre sus cifras y Antonio dé el visto bueno. `?olivos=clasico` deja ver lo de antes durante una versión, para comparar.
- **Fase C, la versión siguiente:** se borra el código que solo usaban los niveles retirados: copa y tronco de nivel 0 de 06, el follaje de nivel 0 de 07 (las manchas de sombra, `geoSombra` y `matSombra`, siguen), las formas del tipo −1 y los niveles 1-2 de 07a/07b, `?olivos=gen` (absorbida por la escalera), los olivos del tileset y la máscara de 04c. Sin constructor, solo impostores (o solo ortofoto). Al aceptarse este ADR, la parte de olivos de [ADR-0002](0002-niveles-de-detalle.md) queda superada por este, y [ADR-0012](0012-catalogo-de-olivos-tipo-e-id-estable.md) y ADR-0015 reciben su enmienda.
- **Qué queda de lo medido (regla 5):** la posición, la **altura**, la **copa** (r8 y contorno), el **rumbo y el desplazamiento** del centro de copa, la **densidad**, la base de copa (`copas_param`). La forma del árbol es **ilustrativa** en todos los escalones. Los puntos LiDAR de la copa ya no se ven en el modo Gemelo, solo en el modo Nube. El color es ilustrativo (si se tinta con la ortofoto, deducido).
- **Ficha** (decisión 34): todo olivo dice «Forma: ilustrativa con medidas del LiDAR», con el detalle «propio», «variante» o «lejano» y, si su id no es del censo, «Id: provisional».

### 5. Presupuesto (regla 6), Hituelo
| | Escritorio | Móvil | Gafas (perfil 0 → 3) |
|---|---|---|---|
| Llamadas de olivos | **7-8** (lote 6-7 medido + 1 impostores) | 7-8 | 7-8 |
| Triángulos de olivos | ≤ 550 k × `esc` (≈ 541 k a `esc` 1, §1) | ≤ 270 k | ≤ 380 k → ≤ 130 k |
| Impostores | 5.859 × 2 = 11,7 k tri | igual | igual |
| Textura de impostores | ≈ 26,7 MiB | ≈ 26,7 MiB | ≈ 26,7 MiB |
| Recetas en memoria JS | ≈ 6,3 MB propios (1 E0 + 4 E1, crudo de O6) + ≈ 3,4 MB de 4 variantes E2 | menos | menos |
| Descarga | ≈ 1,2 MB de variantes por época (medido, O7c) + atlas (**sin medir**) | igual | ≈ 0,95 MB + atlas |

Todo **estimado** salvo lo marcado como medido. **[DEDUCIDO]** las llamadas de olivos bajan: hoy suman 10 de los niveles 1-2, varias por cada celda de nivel 0 y las de olivos de cada glb del tileset, y la escalera las deja en 7-8. Con eso, el «lejos» de Hituelo con tileset (258 llamadas) debería quedar bajo 250; se comprueba en O8d.

**Topes de `pruebas/presupuesto.json` que cambiarían:** en la fase A, un bloque nuevo `fixture_olivos_escalera` (lejos, cerca y nube: llamadas, triángulos, heap; llamadas de olivos ≤ 8; MiB de textura de impostores, que da el motor desde el tamaño de los atlas porque three solo cuenta texturas) con ≈ 25 % de margen sobre la primera medida. En la fase B se vuelven a fijar `fixture` (hoy `fixture.cerro` y `fixture.hituelo`) con la escalera de serie, explicándolo en el commit. En la fase C se retira `fixture_olivos_gen`. `diseno` no cambia.

## Alternativas consideradas
- **Mantener la mezcla** (nivel 0 de siempre cerca, pelotillas, generados en medio) — es lo que da los saltos «descarados» (decisión 66).
- **Del constructor sin impostores** (E2 hasta donde quepa, luego nada u ortofoto) — con 19 k triángulos por E2 caben de 5 a 17 árboles 3D: más allá de 20-30 m la finca se quedaría sin olivos (decisión 66).
- **Original cerca y constructor lejos** — invierte la honestidad: lo cercano, que es lo que se mira, sería lo de menos detalle (decisión 66).
- **Un E3 propio de pocos triángulos** entre E2 y el impostor — descartado en la decisión 28; se reabre si O8d muestra que el impostor ampliado en la franja de 20-45 m es otro salto.
- **Cartel de una vista** (< 1 MiB) — se ve igual desde todos los lados y plano desde arriba: falla en la órbita y en el mirador, que miran desde arriba.
- **Cruz de dos o tres planos** — barata (4-6 triángulos, 1-2 MiB), pero desde arriba y en diagonal se ven los planos cruzados.
- **Octaédrico completo** (las dos mitades) — la mitad de las vistas mirarían desde debajo del suelo.
- **Impostores a 256 px por vista** — ≈ 107 MiB de textura: demasiado para el móvil y las gafas **[SUPUESTO, sin medir]**; queda como opción de escritorio si O8d lo pide.
- **Luz horneada neutra** — no casa con la hora del sol ni con las nubes y la escarcha que el motor cambia en vivo.
- **Que el tileset lleve los impostores** — glTF no describe el sombreador octaédrico (habría que inyectarlo en `load-model`), el atlas se repetiría en cada glb o iría por URI externa sin caché común verificada, y el nivel de detalle por tesela cambiaría los impostores por bloques, no olivo a olivo. Desde el registro son 1 llamada y 11,7 k triángulos para toda la finca.
- **Un impostor por olivo** (de su propio árbol) — 5.859 atlas: inviable en memoria y descarga; tampoco hay un E2 propio de cada olivo (decisión 63).
- **Hornear con `headless-gl`** — WebGL 1 solamente (three 0.186 exige WebGL2), módulo nativo que hay que compilar en alpine y compatibilidad con Node 24 **[NO VERIFICADA]**.
- **Hornear solo en el navegador del visitante, también con servidor** — paga CPU y batería en cada aparato por algo que es igual para todos (el mismo argumento que ADR-0018).

## Consecuencias
- **Positivas:** un solo estilo de olivo a todas las distancias; las llamadas de olivos bajan a 7-8 **[DEDUCIDO]**; de lejos, olivos con silueta de olivo e iluminados por el motor, en vez de pelotillas; la escalera se adapta al aparato por su presupuesto; sin olivos, el tileset pesa y dibuja menos; menos código (fase C).
- **Negativas / coste:**
  - **Impostores blandos de cerca:** en el móvil, la zona 3D llega a ≈ 20 m y el impostor de 128 px se ve ampliado unas 4 veces en su borde (2 veces en escritorio). Es el coste principal y lo decide Antonio a ojo en O8d.
  - Salto de forma E1 → E2 (propio a variante), con fundido.
  - Se pierden los puntos LiDAR como hojas en el modo Gemelo, la única forma de copa «medida» que se veía de cerca (quedan en Nube).
  - Una imagen de Docker grande (Playwright con Chrome) para hornear; la huella de los impostores depende de la versión de Chrome.
  - Primera carga en la salida artefacto: lejos, solo ortofoto hasta que se calculen las 4 variantes y se horneen sus impostores (minutos en SwiftShader, sin medir en aparatos).
  - Más árboles 3D implica rehacer el lote con más piezas: la rebanada máxima de la Cola hay que medirla.
  - Cerrar la pregunta de las sombras (§Contexto) cambia el reparto: hay que hacerlo antes de fijar topes.
- **Implicaciones futuras:** contrato nuevo de impostor y versión nueva del manifiesto (O8b); enmiendas de ADR-0012 y ADR-0015; si las variantes pasan a los 7 tipos del catálogo, ≈ 7 veces más atlas (≈ 187 MiB si se cargan todos: hay que elegir los tipos de la zona visible); el perfil del móvil queda como un perfil más de `VR_PERFILES`/07b.

## Comprobación
Lo cierran O8b-O8d del [PLAN](../rumbo/PLAN.md); pasa a **Aceptado** cuando estén las tres y Antonio dé su visto bueno a ojo.
- **O8b (impostores):** contrato y esquema del impostor, y filas en el manifiesto, con fixture y guardián en la puerta; dos horneados seguidos dan la misma huella; la silueta del impostor contra el E2 dibujado de la misma variante coincide en las 64 vistas (intersección sobre unión ≥ 0,95) y en 16 vistas intermedias (≥ 0,90; umbrales de partida); tamaño en disco y tiempo de hornear Hituelo (4 variantes × 2 épocas), en MEDIDAS.
- **O8c (motor):** sin la bandera, los mismos recuentos que hoy (`carga.test.js`, `web.test.js`, `olivo.test.js`). Con `?olivos=escalera`, en el fixture: 0 mallas de nivel 0, 0 instancias de los niveles 1-2 y 0 olivos del tileset dibujados; cada olivo visible, en un solo escalón fuera de los fundidos y en al menos uno durante ellos (0 huecos en un paseo de 500 m y en una órbita de 230 a 30 m, muestreados en cada fotograma); en un ida y vuelta, ≤ 2 cambios por olivo; llamadas de olivos ≤ 8; triángulos ≤ presupuesto; rebanada máxima de la Cola dentro del presupuesto de 6 ms (3,5 paseando); `renderer.info` confirma o desmiente la pasada de sombras. Plan B: salida artefacto sin manifiesto, tiempo hasta ver los impostores. Nota de comodidad (regla 11).
- **O8d (medida):** banco con Hituelo real (lejos, cerca, nube y paseo): ≤ 250 llamadas (hoy, lejos, 258-273), ≤ 1,7 M triángulos, ≤ 350 MB de heap, textura de impostores ≤ 32 MiB; secuencias de capturas de las transiciones; topes nuevos en `pruebas/presupuesto.json`. En el móvil de Antonio con `?debug`: fps sin regresión frente a lo de hoy, perfil del móvil fijado y su veredicto «sin saltos descarados», andando y en órbita. En Quest: p95 ≤ 13,9 ms (criterio de F1d) si se prueba.
- **No probado:** nada de esto existe aún; fps en móvil y gafas; el coste por píxel del impostor; la memoria de GPU real; el tramado en gafas; Safari e iOS; la pasada de sombras (deducida del código).
