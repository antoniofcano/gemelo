# Contrato `olivo-impostor` — impostor hemi-octaédrico de olivo, formato versión 1

Cómo viaja entre el **hornero** (servidor) y el motor el impostor de los olivos lejanos: dos atlas de imagen (color y normales) con las variantes E2 de una época fotografiadas desde 8 × 8 direcciones, y su fila en el manifiesto de la finca. Decisión, alternativas y presupuesto: [ADR-0019](../doc/adr/0019-escalera-de-olivos.md) §2 (decisiones 66, 70 y 71). Esquema: el bloque `impostores` de [`hornero-manifiesto.schema.json`](hornero-manifiesto.schema.json). Código de referencia: `apps/web/olivo/impostor.js` (disposición, sin DOM: para el hornero, la página de horneado y el motor), `tuberia/olivos/impostores.mjs` (hornea en Chrome y escribe los objetos) y `tuberia/olivos/impostores/pagina.mjs` (la página de horneado, código de navegador). Lo vigila `pruebas/guardianes/impostor.test.js`.

**Qué es y qué no.** Es una **foto** de la variante E2 que el motor ya dibuja a media distancia (la misma receta, con los mismos materiales), sin luz: el motor la ilumina con su sol, su cielo y su tiempo. La forma sigue siendo **ilustrativa** (regla 5); la escala a cada copa medida la pone el motor con la misma matriz que a la variante E2.

**Versiones.** `formato = 1` (`IMPOSTOR.FORMATO`, este documento). Cambiar la rejilla, los tamaños, la disposición, la base de las vistas o el sentido de un canal es subir `formato`, este documento, `impostor.js`, el esquema y la prueba en el mismo commit (regla 3). Un motor que no entiende el `formato` de una fila no dibuja impostores (solo ortofoto lejos, como el plan B del ADR).

## 1. Disposición: 8 × 8 vistas hemi-octaédricas

- **Marco del árbol**: el de la receta montada (`montaOlivo`): metros, +Y arriba, norte = −Z, pivote en la base del tronco, con `receta.escala` aplicada. Sin el giro ni el estirado por copa medida: eso es de cada olivo.
- **Vistas en los vértices** de una rejilla `n × n` (`n = 8`) sobre el cuadrado hemi-octaédrico `[−1, 1]²`. La vista `(i, j)`, `0 ≤ i, j < 8`, tiene `a = −1 + 2i/7`, `b = −1 + 2j/7` y su dirección **desde el centro del árbol hacia la cámara** es `d = normaliza(x, y, z)` con `x = (a + b)/2`, `z = (a − b)/2`, `y = 1 − |x| − |z|` (`direccionDeVista`).
  - El **borde** del cuadrado es el **horizonte** (`y = 0`): hay vistas horizontales para el paseo. Las esquinas son `(7, 7) = +X`, `(0, 0) = −X`, `(7, 0) = +Z`, `(0, 7) = −Z`. El cenit cae en el centro de la rejilla, entre las cuatro vistas `(3..4, 3..4)` (con `n` par no hay vista exacta en el cenit).
  - **De una dirección a la rejilla** (`octaDeDireccion`, `vistaContinua`): `y ← max(0, y)` (una mirada desde abajo usa la fila del horizonte), `s = |x| + y + |z|`, `a = x/s + z/s`, `b = x/s − z/s`, `(gi, gj) = (a + 1, b + 1) · 7/2`. Las vistas vecinas son `floor`/`ceil` de cada coordenada; la mezcla (las 3 más cercanas o la más cercana con tramado) es del motor (O8c).
- **Base de la imagen de cada vista** (`baseDeVista`): `r = normaliza(Y × d)` (derecha de la imagen; `r = +X` si `d` es el cenit exacto) y `u = d × r` (arriba de la imagen). Es lo que da `Matrix4.lookAt` de three con `up = u`. Un punto `P` del árbol cae en la vista en `(x, y) = ((P − centro)·r, (P − centro)·u)`.
- **Cámara ortográfica**, la misma para las 64 vistas de una variante: mira a `centro` (el centro de la caja del árbol) desde `centro + d · 2·semilado`, con `semilado = radio de la esfera de la caja × 1,02` (`IMPOSTOR.MARGEN`): el árbol nunca toca el borde de su celda y todas las vistas tienen la misma escala (lo necesita el motor para reproyectar entre vistas). Una celda cubre `[−semilado, semilado]²` alrededor de `centro`; el píxel `(px, py)` de una vista de 128 (desde abajo) es `x = ((px + 0,5)/128 · 2 − 1) · semilado`.

## 2. Los atlas: dos imágenes WebP por época

| | Color | Normales |
|---|---|---|
| Lado | **2.048 px** (`IMPOSTOR.LADO`) | **1.024 px** (`IMPOSTOR.LADO_NORMAL`) |
| Por vista | 128 px (decisión 71) | 64 px |
| Variantes | 2 × 2 (las 4 variantes E2 de la época) | igual |
| RGB | **albedo en sRGB** (lo que el motor lee con `colorSpace = SRGBColorSpace`) | **normal en el marco del árbol**, `(n + 1)/2`, unitaria antes de cuantizar |
| A | **cobertura** (0 = vacío, 255 = árbol), alfa **recto** (sin premultiplicar) | **oclusión de copa** (§3), 255 = sin ocluir |
| Debajo de lo transparente | el color vecino extendido (hasta 16 px; lo demás, la media de la celda): el filtrado no oscurece los bordes | la normal vecina extendida (8 px) |
| Formato | **WebP con pérdida (calidad 90), alfa sin pérdida, `exact`** | WebP con pérdida (calidad 90), alfa sin pérdida, `exact` |
| En la GPU | RGBA8 + mipmaps: 16 MiB × 4/3 | RGBA8 + mipmaps: 4 MiB × 4/3 |

- **Celdas** (`celdaUV`): la variante `k` (su `celda`) ocupa el cuadrante de columna `k % 2` y fila `floor(k/2)` **contando desde abajo** en coordenadas de textura (u a la derecha, **v hacia arriba**, el convenio de WebGL y de three con `flipY = true`); dentro, la vista `(i, j)` ocupa la columna `i` y la fila `j` (desde abajo): con `c = k % 2` y `f = floor(k/2)`, `u ∈ [(8c + i)/16, (8c + i + 1)/16]` y `v ∈ [(8f + j)/16, (8f + j + 1)/16]`. **En el fichero la fila 0 es la de arriba** (`celdaPixeles`): la vista `(0, 0)` de la variante 0 está en los píxeles `x ∈ [0, 128)`, `y ∈ [1.920, 2.048)`. Las celdas sin variante (una época con menos de 4) quedan transparentes.
- **Por qué WebP y no KTX2/Basis.** three carga KTX2 (`KTX2Loader`), pero necesita el transcodificador Basis (wasm + js) servido desde el mismo origen y, para hornear, un codificador (`basisu`/`toktx`) que no hay como paquete mantenido de npm ni de pip: sería un binario más en la imagen. Basis ahorraría memoria de GPU (ETC1S/UASTC, unas 4-8 veces), pero el ADR fija RGBA8 (≈ 26,7 MiB con mipmaps) y las normales con UASTC/ETC1S pierden más que un WebP. WebP lo decodifica cualquier navegador sin código propio, tiene alfa sin pérdida, lo codifica `sharp` (mantenido, versión fijada en `tuberia/olivos/package.json`) y su opción `exact` conserva el color bajo lo transparente (sin ella, libwebp lo borra y los bordes se oscurecen al filtrar). Se reabre si O8d mide que la memoria de textura no cabe en el móvil o en las gafas.
- **Mipmaps:** no van en el fichero (WebP no los tiene); los genera el motor al subir el atlas. Que conserven la cobertura para el recorte por alfa (ADR §2) es del motor (O8c).

## 3. Cómo se hornea (lo que el motor puede dar por hecho)

- **De qué**: de la **receta E2 horneada** de cada variante (`<huella>.br` de `variantes[]`, la misma que descarga el motor), decodificada con `decodifica` y montada con `montaOlivo` y `creaMateriales(THREE, null, { epoca, srgb: true })` (sin fotos de campo, como el motor). three **0.186.1** del motor, WebGL2, Chrome sin pantalla (SwiftShader).
- **Color sin luz**: el `diffuseColor` del sombreador estándar de three tras el mapa, el color del material, el color por vértice/instancia y las marcas de los pies, con el recorte alfa del material. Los colores del material y por vértice/instancia se leen como **sRGB** y se pasan a lineal (el convenio del motor, `parcheGen` de 07ab y `colorVertSRGB` de 03): el atlas lleva el mismo albedo que pinta el motor en E2, pasado a sRGB al reducir.
- **Normales** de cara a la cámara (las de doble cara se dan la vuelta, como en three), en el marco del árbol. Las olivas de E2 (puntos) llevan la normal de la vista.
- **Oclusión de copa** (canal A de las normales): `mix(0,45, 1, smoothstep(0,15, 1, |(P − copa.centro) / copa.semiejes|))`, con el elipsoide de la caja del follaje (ramitas y relleno) de cada variante (`copa` en la fila). Es barata y aproximada (no es una oclusión ambiental calculada): oscurece el interior de la copa, que en «Olivos tipo» lo oscurecen las sombras del sol (§5). El motor decide si la usa y cómo (multiplicando la luz del cielo, la del sol o las dos).
- **Submuestreo**: cada vista se dibuja a 4 × 4 submuestras por píxel (512 px) en un objetivo de coma flotante; la cobertura es la fracción de submuestras con árbol (17 niveles), el color la media de las cubiertas (en lineal, pasada a sRGB) y la normal la media normalizada de las de su bloque de 8 × 8.
- **Determinista**: con el mismo Chrome, dos horneados dan los mismos bytes (lo comprueba la prueba). Con otro Chrome o otra GPU de software puede cambiar algún píxel: la huella cambia y se vuelve a hornear.

## 4. Fila en el manifiesto de la finca

`impostores[]` del [manifiesto por finca](olivo-horneado.md#3-manifiesto-por-finca), **opcional**: un motor que no lo conoce lo ignora, así que el manifiesto **sigue en `v: 1`** (subirlo haría que el motor de hoy, que exige `v === 1`, descartase también las variantes). El ADR pedía subir la versión; se deja en 1 porque el bloque es aditivo y lleva su propio `formato`. Una fila por época (la actual y la siguiente, como las variantes):

| Campo | Contenido |
|---|---|
| `formato`, `rejilla`, `vista`, `vista_normal`, `nivel` | `1`, `8`, `128`, `64`, `"E2"` (fijos en el formato 1) |
| `epoca` | una de `epocas[]` |
| `clave` | SHA-256/128 de `claveImpostor()`: formato y constantes, época, las huellas de las recetas fuente en su orden, versión de three, huella del código de horneado (página, disposición, materiales, montaje) y versión de `playwright-core`. Con ella el hornero sabe **sin abrir Chrome** si el impostor ya está hecho |
| `color`, `normales` | `{huella, bytes, lado, imagen: "webp", sin_perdida}`: el objeto `<huella>.webp`; `huella` = SHA-256 de **los bytes del fichero tal cual**, truncado a 128 bits, en hexadecimal (32 caracteres); `bytes` = su tamaño |
| `variantes[]` | por celda: `{celda, tipo, semilla, fuente, caja, centro, semilado, copa, medidas}`. `fuente` = huella de la fila E2 de `variantes[]` (misma época, tipo y semilla); `caja` = `[[mín], [máx]]` del árbol montado en su marco; `centro` y `semilado` = la cámara (§1); `copa` = el elipsoide de la oclusión; `medidas` = las de la receta (`altura_m`, `copa_m`), para estirar a la copa y la altura medidas como la variante E2 |
| `horneado` | `{three, chrome, ms}`: con qué se horneó (informativo; no entra en la clave salvo por la versión de playwright-core) |

- **Objetos inmutables** en la misma carpeta que las variantes: `/teselas/<finca>/olivos/<huella>.webp`, sin `Content-Encoding` (el WebP ya está comprimido) y `Cache-Control: immutable`. **Hoy Caddy solo sirve `<huella>.br` y `manifiesto.json`** (O7d): servir `<huella>.webp` (`Content-Type: image/webp`) es un cambio de los dos Caddyfile y de `dev.test.js`, **pendiente** (con O8c).
- **El manifiesto se escribe el último**, cuando sus atlas existen. Lo que el esquema no dice (lo comprueban `validaManifiesto` del hornero y el guardián): una sola fila por época, la época está en `epocas[]`, cada `fuente` es una variante E2 de esa época con el mismo tipo y semilla, `celda` = posición en la lista, y cada atlas existe y pesa `bytes`.
- **Incremental**: el hornero calcula la `clave` de cada época; si el manifiesto anterior tiene una fila con esa clave y sus dos atlas en disco, la reutiliza sin abrir Chrome. Un hornero **sin** impostores (la imagen alpine) conserva las filas anteriores cuyas fuentes siguen y cuyos atlas están (`impostoresVigentes`). `--limpia` conserva los `.webp` de los manifiestos vigente y anterior.

## 5. El color de los generados (decisión 70)

**Lo medido** (`node tuberia/olivos/impostores.mjs --carpeta <olivos> --compara <salida>`: centenario3, semilla 11, envero, E2 horneada; media sRGB de los píxeles del árbol en una vista de 512² como la de la herramienta; SwiftShader; **una corrida**):

(se completa con la corrección del color, en este mismo bloque de trabajo)

## 6. Qué hay que saber al implementar, y lo no probado

- **El hornero:** `node tuberia/olivos/hornero.mjs --salida <carpeta> --finca <id> --impostores` (o `GEMELO_HORNERO_IMPOSTORES=1`) hornea las variantes y después los impostores, y escribe el manifiesto el último. Solo los impostores de un manifiesto que ya existe: `node tuberia/olivos/impostores.mjs --carpeta <salida>/<finca>/olivos [--rehace]`. Fuera de Docker pide el turno del banco (`pruebas/banco/turno.js`) o usa el Chrome de la puerta (`GEMELO_CHROME_WS`).
- **Docker:** `tuberia/olivos/Dockerfile.impostores`, sobre `mcr.microsoft.com/playwright:v1.64.1-noble` fijada por digest, con `GEMELO_HORNERO_IMPOSTORES=1`. La imagen alpine de siempre no cambia.
- **El motor (O8c):** importar de `gemelo-olivo` la disposición (`IMPOSTOR`, `octaDeDireccion`, `vistaContinua`, `baseDeVista`, `celdaUV`), cargar los dos WebP como texturas (color con `SRGBColorSpace`, normales con `NoColorSpace`), comprobar `formato` y que `variantes[k].fuente` sea la receta que dibuja en E2 para ese olivo, y escalar con la misma matriz que la E2.
- **No probado:** la imagen `Dockerfile.impostores` (ni construida ni arrancada); el coste por píxel en el motor; la carga en Safari/iOS y en las gafas; Hituelo real (4 variantes × 2 épocas: tamaño y tiempo); la silueta del impostor reconstruido frente a la E2 dibujada (IoU del ADR, necesita el sombreador del motor: O8c); el aspecto a ojo.
