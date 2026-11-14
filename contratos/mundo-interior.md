# Contrato `mundo-interior` (v = 1; v1.1 añade `anclaje`, `paradas` y `fuentes`; v1.2, `luz` y `maquinas`; todo opcional; v1.3, el glb comprimido)

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
| `luz` | *(opcional, v1.2)* `{modo, escala, sonda, nota}`: cómo viaja la luz horneada, en el color base (v1) o en un mapa aparte ([§1d](#1d-la-luz-aparte-v12)) |
| `maquinas[]` | *(opcional, v1.2)* piezas con eje que el motor mueve sin clips ([§1e](#1e-las-máquinas-v12)) |

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

## 1d. La luz aparte (v1.2)

Opcional y aditivo, como el anclaje. Sin `luz` (o con `modo` `base`), todo sigue como en v1: la luz va dentro del color base. Con `modo` `mapa`, el color base es el **albedo** (puede ir en mosaico, `REPEAT`, en `TEXCOORD_0`) y la luz va **aparte**, en un mapa que se multiplica por él: así caben texturas de color repetidas, brillos y piezas que se mueven ([ADR-0034](../doc/adr/0034-mapa-de-luz-aparte-y-maquinas.md)). Ejemplo que pasa: [modelos/interiores/ejemplo-luz/](../modelos/interiores/ejemplo-luz/).

- **Dónde viaja el mapa:** en la ranura estándar `occlusionTexture` del material, con `texCoord` 1, sobre el segundo UV (`TEXCOORD_1`) de la primitiva. Es glTF 2.0 sin extensiones nuevas; `gltf-validator` lo acepta y las herramientas (`@gltf-transform`, `prune`, `dedup`) no lo pierden. Varios materiales pueden compartir un mapa (un atlas por objeto o por grupo).
- **Qué vale:** el mapa va en sRGB de 8 bits (JPEG o PNG); su valor lineal (0-1) por `escala` es el factor de luz sobre el albedo (1 = el albedo tal cual). `escala` es obligatoria con `modo` `mapa`.
- **Los materiales:** con `modo` `mapa`, cada material opaco de lo fijo es `KHR_materials_unlit` con su mapa en `texCoord` 1; las tarjetas con alfa (`MASK`, `BLEND`) pueden seguir llevando la luz en `COLOR_0`. Un material **con luz** (sin unlit) solo vale en una máquina con `luz` `propia` (§1e).
- **Lo que hace el motor** (three 0.186): `GLTFLoader` no carga la oclusión de un material unlit (pasa a `MeshBasicMaterial`), así que tras cargar, por cada material unlit cuya definición (`parser.associations`, `parser.json`) tiene `occlusionTexture`, pide esa textura (`parser.getDependency`), la marca sRGB con `channel = 1` y la pone de `lightMap` con `lightMapIntensity = π × escala` (el `MeshBasicMaterial` de three divide el mapa de luz entre π; medido en píxeles: un mapa blanco con intensidad π da el albedo tal cual, `interior_luz_chrome.test.js`). Los materiales con luz los carga `GLTFLoader` tal cual (`aoMap` en el canal 1). Implementado en `apps/web/src/mundos/interior/index.ts`.
- **`sonda`:** la luz de la sala para lo que se mueve: 9 coeficientes RGB de armónicos esféricos (orden y normalización de `SphericalHarmonics3` de three: radiancia). El motor hace con ella un entorno propio (la radiancia de la sonda en un equirectangular, por `PMREMGenerator`) que da a la vez la luz difusa y los brillos de lo que tiene luz; no añade además un `LightProbe`, que sumaría otra vez la difusa. El entorno no viaja en el glb. La `sonda` propia de una máquina aún no se usa (vale la de la sala para todas).
- **`nota`:** de dónde sale la luz. La luz horneada es **ilustrativa** (regla 5) aunque la nave sea medida.

## 1e. Las máquinas (v1.2)

Opcional y aditivo. Cada entrada de `maquinas[]` es una pieza rígida con su nodo en el glb que el **motor** mueve sin clip (más barato que una animación y con las velocidades atadas entre sí). Una pieza que da vueltas alrededor de otra (un rulo con la cruceta) es un **nodo hijo** en el glb del nodo que gira: la órbita la hereda; su giro propio es otra máquina.

| Campo | Contenido |
|---|---|
| `id`, `nombre` | id único (`^[a-z0-9][a-z0-9_-]{0,31}$`) y nombre legible |
| `nodo` | nombre exacto del nodo del glb, único en el glb; su origen es el **pivote** |
| `tipo` | `giro` (rota en torno a `eje` por el pivote), `vaiven` (va y vuelve `recorrido` metros por `eje`, suave), `traslacion` (va y vuelve a velocidad constante, con `pausa_s` en los extremos) o `textura` (el color base de `material` corre en la dirección `uv`: las correas) |
| `pivote` | el origen del nodo en reposo, en el marco del glb (`giro`, `vaiven`, `traslacion`) |
| `eje` | vector unitario en el marco del padre del nodo (en reposo, el del glb); el sentido de giro, por la mano derecha |
| `recorrido`, `pausa_s` | metros desde el reposo en el sentido de `eje` (`vaiven`, `traslacion`); segundos de parada en cada extremo (`traslacion`) |
| `material`, `uv` | (`textura`) el material del glb y la dirección `[u, v]` unitaria en la que corre su color |
| `velocidad` | `giro`: vueltas por minuto; `vaiven`: ciclos por minuto; `traslacion`: m/s; `textura`: unidades de UV por segundo |
| `relacion` | `{con, factor}`: en vez de `velocidad`, la de otra máquina por un factor (que lleva las unidades: un rulo que rueda, radio de la órbita entre radio del rulo; una correa, 2πr/60 entre su largo en UV) |
| `luz` | `propia`: material con luz (sin unlit) y su oclusión propia en `occlusionTexture` (`texCoord` 1), iluminado con la sonda (lo que gira o se traslada); `horneada`: la luz de la sala en reposo, como lo fijo (las correas, lo que apenas se mueve) |
| `fuente` | `ilustrativo` o `deducido`, nunca `medido` (como las animaciones) |
| `sonda`, `nota` | *(opcionales)* la luz en el pivote si difiere de la de la sala; una nota |

**Reglas que comprueba el validador:** `velocidad` o `relacion`, una sola; los campos de cada `tipo`; el nodo existe, no se repite y no lo mueven dos máquinas ni una máquina y un clip de `animaciones`; el `pivote` es el origen del nodo en el glb (±1 cm); `eje` y `uv` son unitarios; `relacion.con` existe y no hay ciclos; el `material` de una `textura` tiene textura de color; una máquina con luz `propia` tiene sonda (la suya o `luz.sonda`).

## 2. Reglas del glb (glTF 2.0 binario)

- **Autocontenido:** un solo `.glb`, sin ficheros ni direcciones externas. Pasa el validador oficial de Khronos (`gltf-validator`) sin errores; los avisos se informan.
- **Metros y +Y arriba.** El modelo cabe en una caja de 200 m por lado; si no, casi siempre son centímetros o milímetros.
- **Sin luces ni cámaras.** La luz va **horneada**: en el color base (v1) o en un mapa aparte (v1.2, §1d), con `KHR_materials_unlit`, que además es lo más barato en el Quest; lo que se mueve con luz propia la recibe de la sonda.
- **Materiales estándar de glTF** (metal-rugosidad) y solo estas extensiones: `KHR_materials_unlit`, `KHR_materials_emissive_strength`, `KHR_texture_transform` y `KHR_mesh_quantization`; desde v1.3, también la compresión que el motor sabe descomprimir: `EXT_meshopt_compression` (la geometría) y `KHR_texture_basisu` (texturas KTX2), con las reglas de [§2b](#2b-el-glb-comprimido-v13). Draco y WebP no ([ADR-0035](../doc/adr/0035-interiores-comprimidos-meshopt-y-ktx2.md)).
- **Imágenes:** PNG o JPEG; desde v1.3, KTX2 (§2b).
- **Solo triángulos**, sin esqueletos ni morph targets en v1.
- **Animaciones:** solo mueven nodos (traslación, giro, escala). Una prensa de viga o una rueda son piezas rígidas, y basta con eso. Desde v1.2, las piezas con eje pueden ir en `maquinas[]` (§1e) en vez de en clips.

## 2b. El glb comprimido (v1.3)

Opcional: un glb sin comprimir sigue valiendo igual, y el manifiesto no cambia (`v` sigue siendo 1; el motor mira las extensiones del propio glb). Para qué: la fábrica 1.1 bajó de 13,0 MB a 5,6 MB de descarga y de 78,4 a 9,8 MB de texturas en la GPU del perfil quest, por la cuenta del validador; 40,3 → 9,5 MB de geometría en la GPU, medido en Chrome (detalle en [ADR-0035](../doc/adr/0035-interiores-comprimidos-meshopt-y-ktx2.md)).

- **La geometría, con `EXT_meshopt_compression`** (y `KHR_mesh_quantization`): el motor la descomprime con el `MeshoptDecoder` de three (WebAssembly dentro del módulo, sin peticiones). Las dos van en `extensionsRequired`: el contrato no admite el respaldo sin comprimir dentro del glb.
- **Las texturas, en KTX2 (`KHR_texture_basisu`)**, Basis Universal ETC1S o UASTC, 2D y **con todos sus mipmaps** dentro (three no puede generarlos para una textura comprimida: sin ellos se vería negra). El color (`baseColorTexture`) y el mapa de luz (`occlusionTexture`, `texCoord` 1, §1d) van en sRGB, como sus JPEG. El motor las transcodifica con el `KTX2Loader` de three y el transcodificador Basis servido del mismo origen (`<página>/basis/`), al formato que admite la tarjeta.
- **Las máquinas:** el origen de su nodo sigue siendo el pivote (§1e). La cuantización pone su corrección en la matriz del nodo que lleva la malla; por eso, en una máquina, la malla va en un nodo hijo sin transformación y el nodo de la máquina queda donde estaba. Lo comprueba el validador (el pivote, ±1 cm), como siempre.
- **Lo que se comprueba:** gltf-validator (2.0.0-dev.3.10) no conoce estas dos extensiones; el validador lee la geometría con el decodificador de `meshoptimizer` (si no se descomprime, no pasa) y cada KTX2 con `ktx-parse` (Basis Universal, 2D, todos los mipmaps).
- **Cómo se hace:** `node tuberia/interiores/blender/comprime.mjs <carpeta> <salida>` sobre una carpeta ya rematada, o `exporta.mjs … --comprime` al rematar ([README de la tubería](../tuberia/interiores/blender/README.md)). ETC1S por defecto en todo; UASTC (`--color uastc`, `--luz uastc`) donde haga falta más fidelidad.

## 3. Presupuesto por perfil (perfil objetivo: **quest**)

Lo que dibuja el interior entero; mientras tanto, el exterior está congelado. El glb tiene que caber en el perfil objetivo para pasar. Los demás perfiles se informan.

| Perfil | Triángulos | Llamadas | Texturas (MB en GPU) | Lado máx. (px) | Materiales |
|---|---|---|---|---|---|
| quest | 300.000 | 150 | 96 | 2048 | 64 |
| movil | 300.000 | 150 | 96 | 2048 | 64 |
| pantalla | 1.000.000 | 400 | 256 | 4096 | 128 |

- **Triángulos y llamadas:** se cuentan por instancia en la escena, así que un nodo que repite una malla cuenta cada vez. Una llamada es una primitiva dibujada.
- **Memoria de texturas:** una imagen PNG o JPEG, RGBA8 con mipmaps (ancho × alto × 4 × 4/3). Un KTX2 (v1.3), por bloques de 4 × 4 en cada uno de sus niveles, con los bytes por bloque del formato al que lo transcodifica three en ese perfil (`$defs.presupuesto.ktx2_bloque`): en quest y movil, ETC1S → ETC2 (8 bytes; con alfa, 16) y UASTC → ASTC 4x4 (16); en pantalla, los dos → BC7 (16). Un aparato sin ninguno de esos formatos recibe RGBA8 (64 por bloque). Es una estimación, no una medida de la GPU.
- **Los valores son de partida [SUPUESTO], sin medir en el Quest.** El exterior de Hituelo en el escalón 3 dio 1,43 M de triángulos y un p95 de 23 ms en un Quest 3 ([MEDIDAS](../doc/sistema/MEDIDAS.md)). Por eso 300.000 deja margen. Se calibran con el visor de interiores (PLAN, MU0-8) en las gafas, y cambiarlos es cambiar este contrato: el esquema (`$defs.presupuesto`), esta tabla y el guardián, en el mismo commit.

## 4. Lo que queda abierto

- **Sonido** de las máquinas: irá en una v2 del manifiesto, con MU4.
- **Idiomas** de las fichas de la visita y **resaltar el nodo** de la pieza (`ancla.nodo`): cuando haga falta; hoy las fichas van en español y el ancla es un punto.
- **Splats:** solo si pasa la prueba de humo de MU4-0 (decisión 223).
- **El glb comprimido en el Quest:** la v1.3 está medida en Chrome con SwiftShader (descarga, memoria de texturas por cuenta, recuentos y tiempo de leer); en las gafas, el tiempo de transcodificar y la memoria real están **sin probar** ([ADR-0035](../doc/adr/0035-interiores-comprimidos-meshopt-y-ktx2.md)).
