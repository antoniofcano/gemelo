# ADR-0034 — Mapa de luz aparte del color y máquinas con eje en los interiores (contrato mundo-interior v1.2)

- **Estado:** Aceptado (la tubería y el contrato; el motor aún no lo carga)
- **Fecha:** 2026-11-13

## Contexto
La fábrica publicada (contrato [mundo-interior](../../contratos/mundo-interior.md) v1) lleva la luz horneada **dentro del color base**: una textura por objeto con color × luz, `KHR_materials_unlit`. Es lo más barato en el Quest, pero impide lo que Antonio acordó para la «fábrica 1.1»: texturas de color en mosaico (con la luz dentro, cada metro de pared necesita sus propios téxeles), brillos en el metal, y piezas que se mueven (un rulo que gira con su sombra horneada se ve girar la sombra). La 1.1 mueve rulos, cruceta, eje del techo, poleas, palas de batidoras, pistón, una vagoneta y correas.

three 0.186 sí sabe multiplicar un mapa de luz por el color (`lightMap` en el canal de UV 1), pero glTF no tiene ranura de mapa de luz, y `GLTFLoader` no carga la oclusión de un material `KHR_materials_unlit` (lo pasa a `MeshBasicMaterial`, `materialType !== MeshBasicMaterial` en su código) ni llama a los `extendMaterialParams` de los plugins para él. Además `MeshBasicMaterial` divide el mapa de luz entre π.

## Decisión
El mapa de luz viaja en la ranura **estándar `occlusionTexture` con `texCoord` 1** (TEXCOORD_1 = el UV «luz» de Blender), en sRGB de 8 bits con una **escala** en el manifiesto (`luz: {modo: "mapa", escala, sonda}`); el color base es el albedo (en mosaico, TEXCOORD_0) × `COLOR_0`. Lo que se mueve va en **`maquinas[]`**: nodo, pivote (= origen del nodo), eje, tipo (`giro`, `vaiven`, `traslacion`, `textura`), velocidad o relación con otra máquina, y `luz` `horneada` (la de la sala en reposo, unlit con mapa) o `propia` (material con luz y su oclusión propia en el mismo slot, iluminado por una sonda de armónicos esféricos de la sala). La órbita es jerarquía del glb (el rulo, hijo de la cruceta). Todo opcional y aditivo: un manifiesto v1 vale igual.

## Alternativas consideradas
- **Seguir con la luz en el color base (v1)** — descartada para la fábrica 1.1: ni mosaico, ni brillos, ni piezas que giran con su luz bien.
- **Mapa de luz en `extras` del material o en el manifiesto (índice de textura)** — una textura que ningún slot usa la borran `prune` y `dedup`, el validador de Khronos la da por no usada y el índice cambia al reordenar; habría que blindar cada herramienta.
- **Extensión propia (`EXT_lightmap`…)** — no hay una ratificada; una propia rompe el «solo estas extensiones» del contrato y el validador oficial la marca.
- **Luz en `emissiveTexture`** — la emisión SUMA, no multiplica: el albedo oscuro no oscurece la luz.
- **`occlusionTexture` sin unlit (`MeshStandardMaterial` con `aoMap`)** — three la carga sola, pero solo afecta a la luz indirecta y obliga a luces en tiempo real en toda la nave: más caro en el Quest y no reproduce la luz horneada.
- **Animaciones glTF (clips) para las máquinas** — ya caben en v1, pero las velocidades no se pueden atar (correa ↔ polea, rulo ↔ cruceta) ni parar o acelerar sin rehornear el clip; `maquinas[]` las deja al motor y pesa unos bytes.

## Consecuencias
- **Positivas:** glTF 2.0 sin extensiones nuevas (pasa `gltf-validator` y sobrevive a `@gltf-transform`); albedo en mosaico (la muestra: 5 texturas de color de 512-1024 px para toda la maquinaria y el suelo); las correas corren con la luz quieta (UV distintos); el mapa de luz puede ir a menor resolución que el color; las piezas que giran no arrastran su sombra.
- **Negativas / coste:** dos texturas por superficie en vez de una (en el Quest, el lazo de `exporta.py` reparte el tope de MB entre mapas y colores: estimación [EXTRAPOLACIÓN] 85-92 MB en quest frente a los 76,7 MB de hoy, con `--lado-color 512`); un segundo UV en cada vértice (+8 B); materiales por material **y** atlas (unos 30 en la fábrica, tope 64) y unas 60 llamadas (tope 150) [EXTRAPOLACIÓN]; el motor necesita código: tras cargar, por cada material unlit con `occlusionTexture` (vía `parser.associations` y `parser.json`), pedir la textura (`parser.getDependency`), `channel = 1`, sRGB, ponerla de `lightMap` con `lightMapIntensity = π × escala`; un `LightProbe` con `luz.sonda`, un entorno propio (p. ej. `RoomEnvironment`) para los brillos y mover los nodos de `maquinas[]`. Las máquinas con luz propia no reciben sombras de lo que las rodea (solo su oclusión propia y la sonda). Una sonda puesta dentro de otra pieza sale negra: `exporta.py` la descarta y vale la de la sala.
- **Implicaciones futuras:** el mismo camino vale para los patios y la bodega; las tarjetas con alfa aún no pasan por el modo aparte (`exporta.py` se niega). Si Khronos ratifica una extensión de mapa de luz, se migra en una v2.

## Comprobación
Esquema, validador y ejemplo sintético [`modelos/interiores/ejemplo-luz/`](../../modelos/interiores/ejemplo-luz/): `mundo_interior_luz.test.js` (cada regla nueva tiene un caso que la rompe). Tubería: `interiores_blender.test.js` (`maquinas_def.py`, `sonda.py`, `exporta.mjs --luz`, y la forma de los guiones). Muestra privada (2026-11-13, por el banco): horneado «aparte» de 13 objetos a resolución baja en 76 s, pico 1,1 GB, glb de 2,6 MB que **pasa el validador** en quest (21,8 MB de texturas). **No probado:** la carga en el motor (no implementada), ningún dispositivo (escritorio, iPhone, Quest), los fps, y el horneado completo (extrapolado).
