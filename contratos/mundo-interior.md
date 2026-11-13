# Contrato `mundo-interior` (v = 1; v1.1 añade `anclaje`, `paradas` y `fuentes`, opcionales)

Qué tiene que entregar quien modela un interior (la bodega, la fábrica) para que entre en el gemelo. Es la frontera entre los dos ejes del [PLAN](../doc/rumbo/PLAN.md#mundos-múltiples-adr-0033): el eje B (modelado, a su ritmo) entrega un glb y un manifiesto que pasan el validador, y el eje A (el motor) los carga sin preguntar más. Decisión: [ADR-0033](../doc/adr/0033-mundos.md); interfaces del lado del motor (`World`, `Puerta`, `Ambiente`): [MUNDOS](../doc/sistema/MUNDOS.md).

La idea en una frase: **un glb autocontenido con materiales estándar y la luz horneada, más un `mundo.json` que dice por dónde se anda, por dónde se entra y qué se mueve.** Nada de sombreadores propios ni luces: así el mismo interior vale en `WebGLRenderer` y en `WebGPURenderer`, y su coste en el Quest se sabe antes de entregarlo.

**Cómo se comprueba:** `node tuberia/interiores/valida.js <carpeta>` (la carpeta tiene `mundo.json` y su glb). Dice PASA o NO PASA, qué cuesta en cada perfil y por qué falla; con `--json`, lo mismo para una máquina. No usa la red ni el motor. Ejemplo que pasa: [modelos/interiores/ejemplo/](../modelos/interiores/ejemplo/) (sintético, una sala de 8 × 6 × 3 m con una rueda). Lo vigila [mundo_interior.test.js](../pruebas/guardianes/mundo_interior.test.js).

**Dónde viven los de verdad:** fuera del repo (regla 4, decisión 227), servidos por `/teselas/<finca>/<mundo>/<perfil>/`: una carpeta por perfil con su `mundo.json` y su glb, `quest` (la que pasa el validador: cabe en el perfil objetivo) y, si se quiere más detalle en escritorio, `pantalla` (cabe en el perfil «pantalla»; hoy el validador la da por NO PASA porque mira el objetivo). El motor pide `quest` en una sesión de VR o en unas gafas y `pantalla` en escritorio y en móvil ([MUNDOS §3, «Cómo quedó (eje B)»](../doc/sistema/MUNDOS.md#interiores-del-eje-b)). Aquí solo el contrato, el validador y el ejemplo inventado.

## 1. El manifiesto (`mundo.json`)

Esquema: [mundo-interior.schema.json](mundo-interior.schema.json) (JSON Schema 2020-12; lo valida ajv).

| Campo | Contenido |
|---|---|
| `v` | 1 |
| `id` | id del mundo (`^[a-z][a-z0-9-]{0,31}$`, no `exterior`): también es la clave de su sala de red y de su carpeta |
| `nombre` | texto legible, hasta 60 caracteres |
| `fuente`, `notas` | regla 5: `medido` (fotogrametría o escaneo), `ilustrativo` (modelado a mano) o `mixto` (nave medida con piezas modeladas); `notas` dice qué es cada parte |
| `licencia` | `{spdx, autor, atribucion}` |
| `glb` | nombre del glb, junto al manifiesto |
| `unidades`, `arriba` | `"m"` y `"+Y"` (convención de glTF) |
| `aforo` | *(opcional)* máximo físico de la sala; el de cada reunión lo fija la oficina por debajo (decisión 225) |
| `zonas[]` | dónde se puede andar: `{id, anillo: [[x, z], …], y}`, polígonos simples en planta con la cota de su suelo. Fuera de las zonas es pared. v1: suelo plano por zona (una escalera son varias zonas) |
| `puertas[]` | `{id, a, pos, rumbo, ancho, alto, llegada: {pos, rumbo}}`: `a` es el mundo al que lleva; `rumbo` en grados desde +Z hacia +X, hacia donde se sale; `llegada`, dónde aparece quien entra por ella |
| `animaciones[]` | *(opcional)* `{nombre, bucle, fuente}`: cada clip del glb con su nombre exacto; `fuente` es `ilustrativo` o `deducido`, nunca `medido` |
| `puntos[]` | *(opcional)* `{id, titulo, pos}`: cartelas del museo, sitio del ponente |
| `anclaje` | *(opcional, v1.1)* `{pos: [x, y], giro}`: dónde está el interior en el exterior de su finca ([§1b](#1b-el-anclaje-v11)) |
| `paradas[]` | *(opcional, v1.1)* la visita autoguiada (museo), en el orden del recorrido: `{id, pos, radio, ancla, puerta?, ficha}` ([§1c](#1c-la-visita-paradas-y-fuentes-v11)) |
| `fuentes[]` | *(opcional, v1.1)* `{id, cita, url?, verificada}`: las fuentes de las fichas; un `[n]` en un texto remite a `fuentes[n-1]` |

**Reglas que el esquema no dice y el validador sí:**
- **Origen:** `(0, 0, 0)` está en el suelo, en el centro del umbral de la puerta principal, que es `puertas[0]`.
- **Llegadas:** cada `llegada` cae dentro de una zona, a su cota (±10 cm).
- **Zonas:** cada zona es un polígono simple (no se corta a sí misma) de al menos 0,5 m².
- **Ids:** los de zonas, puertas, puntos, animaciones, paradas y fuentes no se repiten.
- **Dentro del modelo:** las puertas y los puntos caen dentro de la caja del modelo.
- **Puertas:** ninguna lleva a su propio mundo. Si ninguna lleva al exterior, sale un aviso.

## 1b. El anclaje (v1.1)

Un campo opcional y aditivo (`v` sigue siendo 1: un manifiesto sin él vale igual). Con él, el exterior pone una puerta por cada puerta del interior que lleva a `exterior` y se entra andando ([MUNDOS §3, «La puerta del cortijo»](../doc/sistema/MUNDOS.md#la-puerta-del-cortijo)).

- `pos`: `[x, y]` en metros en el **marco local de la finca** (x este, y norte, desde `centro_utm` de su índice): dónde cae en el exterior el origen del glb, es decir, el umbral de la puerta principal.
- `giro`: el **rumbo de brújula** (grados desde el norte hacia el este, en `[0, 360)`) del eje +Z del glb en el exterior. Si la puerta principal tiene `rumbo` 0, es hacia dónde se sale por ella. Un solo número para corregir la orientación.
- Del marco de quien anda dentro (x, −z del glb) al del exterior hay un giro de `φ = 180° − giro` (antihorario) y la traslación `pos`; los dos marcos tienen la misma mano, así que no hay espejo.
- **Es dato de la explotación** (regla 4): el de verdad va solo en los datos publicados (la plantilla privada del exportador lo lleva y `exporta.py` lo copia). El ejemplo sintético trae uno inventado en el fixture. Se dice de dónde sale (medido, un pin, deducido) en la plantilla, no aquí.

## 1c. La visita: paradas y fuentes (v1.1)

Dos campos opcionales y aditivos (`v` sigue siendo 1). Con ellos, al entrar en el interior se ofrece «Empezar la visita» o pasear libre: una marca en el suelo por parada, la siguiente resaltada, y al llegar se abre su ficha ([MUNDOS §3, «La visita del museo»](../doc/sistema/MUNDOS.md#la-visita-del-museo)).

Una parada (`paradas[i]`; el orden del array es el del recorrido):

| Campo | Contenido |
|---|---|
| `id` | id de la parada, único |
| `pos` | `[x, y, z]` donde se para quien visita: en el suelo, dentro de una zona y a su cota |
| `radio` | m en planta (0,5 a 5): al entrar en él se abre la ficha |
| `ancla` | `{pos, nodo?, aprox}`: lo que describe la parada (la pieza) y hacia dónde se mira; `nodo`, el del glb si la pieza lo tiene (el motor aún no lo resalta); `aprox: true` si `pos` no sale de la geometría de la pieza |
| `puerta` | *(opcional)* id de una puerta de este mundo con la que sigue el recorrido; si lleva a un mundo que aún no está, el motor dice «próximamente» |
| `ficha` | `{titulo, texto, dato_curioso?, nota_visible?, procedencia_visible, procedencia_texto[], fuentes[], pendiente?[]}` |

- **Regla 5 en la ficha:** `procedencia_visible` es lo que se ve (`medido`, `deducido` o `ilustrativo`; en un modelo hecho a mano, `ilustrativo`) y `nota_visible` dice qué no prueba el modelo. `procedencia_texto` es lo que cuenta el texto: `documentado` (fuente escrita), `testimonio` (de quien lo vivió o lo sabe) o `sin_fuente`; varias a la vez si el texto mezcla (una ficha documentada con un añadido de la familia es `["documentado", "testimonio"]`).
- **`pendiente`:** lo que espera confirmación. Nunca se enseña como hecho: el motor solo dice cuántas preguntas quedan abiertas. Lo que no está confirmado no va en `texto` ni en `dato_curioso`.
- **Texto llano** (el motor lo pinta con `textContent`). `fuentes[]` de la ficha son ids de `fuentes[]` del mundo; una fuente con `verificada: false` (solo se leyó un extracto) se enseña con ese aviso; `url`, solo `https://`.
- **Es dato de la explotación** (regla 4): las paradas de verdad van solo en los datos publicados (las escribe la plantilla privada y `exporta.py` las copia tal cual, ya en el marco del glb). El ejemplo sintético trae tres inventadas.

**Lo que dice el validador.** Error (mentiría o rompería la ficha): ids de parada o de fuente repetidos, una fuente o una puerta que no existe, `documentado` sin fuentes, `sin_fuente` junto a otra procedencia, `medido` en un mundo `ilustrativo`, una `url` que no es `https://`. Aviso (pasa, pero hay que mirarlo): una parada fuera de las zonas o a otra cota (no se llega andando), radios que se pisan, un ancla fuera del modelo, un `nodo` que el glb no tiene, un texto de menos de 30 o más de 150 palabras, un `[n]` que no es de sus fuentes y lo pendiente de confirmar.

**Por qué así y no como el primer borrador** (que traía `orden`, `mira` y `ancla.tipo`): el orden es el del array (como `puertas[0]` es la principal), `ancla.pos` ya es hacia dónde se mira y el tipo se deduce de si hay `nodo`. Cada dato, una vez: no hay dos sitios que puedan contradecirse. `procedencia_texto` es una lista porque las fichas reales mezclan lo documentado con el testimonio.

## 2. Reglas del glb (glTF 2.0 binario)

- **Autocontenido:** un solo `.glb`, sin ficheros ni direcciones externas. Pasa el validador oficial de Khronos (`gltf-validator`) sin errores; los avisos se informan.
- **Metros y +Y arriba.** El modelo cabe en una caja de 200 m por lado; si no, casi siempre son centímetros o milímetros.
- **Sin luces ni cámaras.** La luz va **horneada**: en el color base o con `KHR_materials_unlit`, que además es lo más barato en el Quest.
- **Materiales estándar de glTF** (metal-rugosidad) y solo estas extensiones en v1: `KHR_materials_unlit`, `KHR_materials_emissive_strength`, `KHR_texture_transform` y `KHR_mesh_quantization`. Nada de compresión que pida un decodificador (Draco, meshopt, KTX2/Basis) ni de WebP: se abrirán cuando el motor los cargue.
- **Imágenes:** PNG o JPEG.
- **Solo triángulos**, sin esqueletos ni morph targets en v1.
- **Animaciones:** solo mueven nodos (traslación, giro, escala). Una prensa de viga o una rueda son piezas rígidas, y basta con eso.

## 3. Presupuesto por perfil (perfil objetivo: **quest**)

Lo que dibuja el interior entero; mientras tanto, el exterior está congelado. El glb tiene que caber en el perfil objetivo para pasar. Los demás perfiles se informan.

| Perfil | Triángulos | Llamadas | Texturas (MB en GPU) | Lado máx. (px) | Materiales |
|---|---|---|---|---|---|
| quest | 300.000 | 150 | 96 | 2048 | 64 |
| movil | 300.000 | 150 | 96 | 2048 | 64 |
| pantalla | 1.000.000 | 400 | 256 | 4096 | 128 |

- **Triángulos y llamadas:** se cuentan por instancia en la escena, así que un nodo que repite una malla cuenta cada vez. Una llamada es una primitiva dibujada.
- **Memoria de texturas:** RGBA8 con mipmaps (ancho × alto × 4 × 4/3). Es una estimación, no una medida de la GPU.
- **Los valores son de partida [SUPUESTO], sin medir en el Quest.** El exterior de Hituelo en el escalón 3 dio 1,43 M de triángulos y un p95 de 23 ms en un Quest 3 ([MEDIDAS](../doc/sistema/MEDIDAS.md)). Por eso 300.000 deja margen. Se calibran con el visor de interiores (PLAN, MU0-8) en las gafas, y cambiarlos es cambiar este contrato: el esquema (`$defs.presupuesto`), esta tabla y el guardián, en el mismo commit.

## 4. Lo que queda abierto

- **Sonido** de las máquinas: irá en una v2 del manifiesto, con MU4.
- **Idiomas** de las fichas de la visita y **resaltar el nodo** de la pieza (`ancla.nodo`): cuando haga falta; hoy las fichas van en español y el ancla es un punto.
- **Splats:** solo si pasa la prueba de humo de MU4-0 (decisión 223).
- **Texturas comprimidas** (KTX2) y **mallas comprimidas** (meshopt): cuando el motor tenga sus decodificadores, medido en el Quest.
