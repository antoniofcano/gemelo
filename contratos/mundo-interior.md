# Contrato `mundo-interior` (v = 1)

Qué tiene que entregar quien modela un interior (la bodega, la fábrica) para que entre en el gemelo. Es la frontera entre los dos ejes del [PLAN](../doc/rumbo/PLAN.md#mundos-múltiples-adr-0033): el eje B (modelado, a su ritmo) entrega un glb y un manifiesto que pasan el validador, y el eje A (el motor) los carga sin preguntar más. Decisión: [ADR-0033](../doc/adr/0033-mundos.md); interfaces del lado del motor (`World`, `Puerta`, `Ambiente`): [MUNDOS](../doc/sistema/MUNDOS.md).

La idea en una frase: **un glb autocontenido con materiales estándar y la luz horneada, más un `mundo.json` que dice por dónde se anda, por dónde se entra y qué se mueve.** Nada de sombreadores propios ni luces: así el mismo interior vale en `WebGLRenderer` y en `WebGPURenderer`, y su coste en el Quest se sabe antes de entregarlo.

**Cómo se comprueba:** `node tuberia/interiores/valida.js <carpeta>` (la carpeta tiene `mundo.json` y su glb). Dice PASA o NO PASA, qué cuesta en cada perfil y por qué falla; con `--json`, lo mismo para una máquina. No usa la red ni el motor. Ejemplo que pasa: [modelos/interiores/ejemplo/](../modelos/interiores/ejemplo/) (sintético, una sala de 8 × 6 × 3 m con una rueda). Lo vigila [mundo_interior.test.js](../pruebas/guardianes/mundo_interior.test.js).

**Dónde viven los de verdad:** fuera del repo (regla 4, decisión 227), servidos por `/teselas/<finca>/<mundo>/`. Aquí solo el contrato, el validador y el ejemplo inventado.

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

**Reglas que el esquema no dice y el validador sí:**
- **Origen:** `(0, 0, 0)` está en el suelo, en el centro del umbral de la puerta principal, que es `puertas[0]`.
- **Llegadas:** cada `llegada` cae dentro de una zona, a su cota (±10 cm).
- **Zonas:** cada zona es un polígono simple (no se corta a sí misma) de al menos 0,5 m².
- **Ids:** los de zonas, puertas, puntos y animaciones no se repiten.
- **Dentro del modelo:** las puertas y los puntos caen dentro de la caja del modelo.
- **Puertas:** ninguna lleva a su propio mundo. Si ninguna lleva al exterior, sale un aviso.

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
- **Splats:** solo si pasa la prueba de humo de MU4-0 (decisión 223).
- **Texturas comprimidas** (KTX2) y **mallas comprimidas** (meshopt): cuando el motor tenga sus decodificadores, medido en el Quest.
