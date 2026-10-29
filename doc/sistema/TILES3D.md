# Escena en 3D Tiles 1.1 (prototipo F1d)

Cómo se generan, qué llevan y cómo se regeneran las teselas 3D Tiles 1.1 de la escena. **Prototipo**: solo se ha ejercitado con el fixture sintético; el motor (`apps/web/motor/`, three 0.128.0) **no** lo usa todavía. Decisión: [ADR-0015](../adr/0015-escena-en-3d-tiles.md) (Propuesto). Lo vigila [`tiles3d.test.js`](../../pruebas/guardianes/tiles3d.test.js).

| Pieza | Dónde |
|---|---|
| Generador (contrato v2 → `tileset.json` + glb) | `tuberia/tiles3d/genera.mjs` |
| Marco de coordenadas (UTM 30N ↔ local ↔ ECEF, GPS → escena) | `tuberia/tiles3d/marco.mjs` |
| Topes de triángulos, bytes y visor | `tuberia/tiles3d/presupuesto.json` |
| Visor de prueba (3DTilesRendererJS + three moderno, Vite; `vite.config.js` escribe su `index.html`) | `tuberia/tiles3d/visor/` |
| Validador oficial (aparte, solo desarrollo) | `tuberia/tiles3d/validador/` |
| Guardián | [`pruebas/guardianes/tiles3d.test.js`](../../pruebas/guardianes/tiles3d.test.js) |

## Cómo regenerar

```sh
cd tuberia/tiles3d && npm i                       # una vez (dependencias abajo)
python pruebas/genera_fixture.py --salida <fix>   # desde la raíz: fixture sintético v2
node tuberia/tiles3d/genera.mjs --entrada <fix>/hituelo --salida <tileset>
#   opciones: --hoja 128 (lado de hoja, m) --celdas 128 (celdas por lado en todos los niveles) --textura 256 (px máx.)
#             --ondulacion 0 (N del geoide, m) --error-hoja 0.05 (error de simplificación en hojas, m) --niveles-olivo 3
cd tuberia/tiles3d/validador && npm i && npm run valida -- <tileset>/tileset.json   # validador de CesiumGS
cd tuberia/tiles3d/visor && npm i && npm run build # visor en dist/; copiar <tileset> a dist/tileset/ y servir dist/
GEMELO_MIDE=1 npm run puerta                       # o solo: node --test pruebas/guardianes/tiles3d.test.js
```

`--entrada` acepta los dos modos del contrato: carpeta con `indice.json` + `t/` (ficheros) o `embebido.json`. En desarrollo, el tileset puede ir en `tuberia/tiles3d/visor/public/tileset/` (ignorado por git) con `npm run dev`; el visor admite `?tileset=<url>`, `?error=<px>` y `?escena=lejos|cerca`.

### Dependencias (versión fijada; regla 12 de CLAUDE.md)

| Paquete | Versión | Para qué |
|---|---|---|
| `@gltf-transform/core`, `/extensions`, `/functions` | 4.5.1 | escribir glb; `EXT_mesh_gpu_instancing`; `compactPrimitive` tras simplificar |
| `meshoptimizer` | 1.3.0 | simplificar el terreno con error **absoluto** y bordes bloqueados (`LockBorder`, `ErrorAbsolute`) |
| `sharp` | 0.35.5 | lienzo global de ortofoto (mosaico debajo, teselas encima), recortes, remuestreo Lanczos, JPEG |
| `three` | 0.186.1 | prototipos del olivo (`LatheGeometry`, `CylinderGeometry`, `mergeGeometries`) |
| `proj4` | 2.22.0 | UTM 30N (EPSG:25830) ↔ geodésicas ↔ ECEF (EPSG:4978) |
| Validador: `3d-tiles-validator` | 0.6.1 | validador oficial de CesiumGS: el tileset y cada glb (usa el validador de glTF de Khronos) |
| Visor: `3d-tiles-renderer`, `three`, `vite` | 0.5.3, 0.186.1, 6.4.5 | cargar y dibujar; three ≥ 0.167 lo exige la librería |

Código propio, solo lo que no da una librería: leer el contrato v2, muestrear el relieve global (para que teselas vecinas compartan los bordes y las normales no tengan costura), el árbol de cuadrantes y los `geometricError` medidos.

## Formato

- **`tileset.json`**: `asset.version = "1.1"`, árbol de cuadrantes **explícito** (sin teselado implícito todavía), `refine = "REPLACE"` en todos los nodos, `boundingVolume.box` (12 números) en el marco local. La raíz es el menor cuadrado de lado `hoja·2^k` alineado a múltiplos de su lado en UTM que contiene todas las teselas del contrato (como ADR-0001); los cuadrantes sin datos no se generan. `extras.gemelo` lleva `centro_utm`, `z0`, `srs`, `ondulacion_geoide`, `origen_geodesico`, la convergencia y el factor de escala de UTM en el origen, `hoja_m`, `celdas`, los triángulos de cada prototipo y `tipo_generico = −1`.
- **Contenido**: un glb por nodo en `<lado>/<i>_<j>.glb`, con `i = floor(E/lado)`, `j = floor(N/lado)` (en el nivel de 256 m el nombre coincide con el `kx_ky` de hoy). Cada glb lleva:
  - **terreno**: rejilla de `celdas × celdas` (128 → 1 m en hojas de 128 m, 2 m en 256 m, 4 m en 512 m…) solo en celdas con dato, simplificada con meshoptimizer hasta `error-hoja · 2^(niveles por debajo)` m, con **faldones** hacia fuera de `max(1,5 m, 2 × error)` en los bordes del cuadrado; `POSITION`, `NORMAL` (del relieve global, sin costura), `TEXCOORD_0`; material PBR mate (metal 0, rugosidad 1) con la **ortofoto** como `baseColorTexture` (JPEG, `min(textura, 2^⌈log2(lado/res_orto)⌉)` px, Lanczos);
  - **olivos**: un nodo con `EXT_mesh_gpu_instancing` (en `extensionsRequired`) sobre un prototipo genérico con color por vértice (tronco/copa). Por instancia: `TRANSLATION` = (x, relieve, −y), `ROTATION` = giro sobre la vertical según el eje largo de la copa medida, `SCALE` = (rx, h, rz), `_COLOR_0` (ortofoto en el árbol, tintada como el nivel 1 del motor, lineal), `_ID_ARBOL` (índice en `copas[]`) y `_TIPO` (−1 = genérico). Giro y radios con la misma regla que `07b_arboles.js`; qué es olivo, con la de `02_mundo.js`.
- **Niveles de olivo**: hojas con `olivo-detalle` (144 tri), los dos niveles siguientes con `olivo-lejano` (24 tri) y más arriba ninguno (queda la ortofoto). Ajustable con `--niveles-olivo`.
- **`geometricError`** (metros): en cada nodo, `max(medido, 2 × el mayor de sus hijos)`; las hojas, el medido. Medido = error de la rejilla frente al relieve de 1 m (comprobado en cada metro) + error que devuelve meshoptimizer, o el de los olivos si es mayor: altura máxima si el nivel no los lleva; `(1 − cos(π/6)) ×` el mayor radio o altura con el prototipo lejano (error de cuerda de 6 frente a 12 sectores). El del tileset, el doble que el de la raíz.
- **`resumen.json`** (al lado): triángulos, bytes, errores y prototipo por tesela y por nivel; lo usan el guardián y la documentación.

### Huecos que deja abiertos (a propósito)

- **Catálogo de olivos-tipo (F1b)**: el atributo `_TIPO` y el `_ID_ARBOL` ya viajan. Con catálogo, el generador agrupará las instancias por tipo: un nodo instanciado por **(tipo, nivel)** con la malla del tipo (glb del catálogo, contrato `olivos-tipo`) en lugar del prototipo genérico. Coste: una llamada de dibujo más por tipo presente en la tesela (con 6–8 tipos, hasta 8 por tesela) y los bytes de cada malla repetidos en cada glb; compartirlos con un `buffer` externo común es posible en glTF, pero **[NO VERIFICADO]** que 3DTilesRendererJS lo cachee entre teselas. Con `_TIPO = −1` se ve igual que hoy.
- **Identidad del árbol**: three deja `_ID_ARBOL` como `InstancedBufferAttribute` en la geometría; con el `instanceId` de un rayo se llega al registro (lo usa el gancho `instancias()` del visor). La vía estándar de 3D Tiles sería `EXT_instance_features` + `EXT_structural_metadata`: **[NO VERIFICADO]** su soporte en 3DTilesRendererJS 0.5.3.
- **Sin hacer**: construcciones (`paisaje.edificios`), nube LiDAR (`pts`), tendido y cauces, NDVI y exageración vertical, compresión (meshopt/KTX2), teselado implícito, la tesela Base (sin `pts`) no cambia nada aquí.

## Marco de coordenadas

| Sistema | Qué es | En el tileset |
|---|---|---|
| UTM 30N (ETRS89, EPSG:25830) | el de los exportadores | nombres de fichero (`<lado>/<i>_<j>`) |
| **Local** | el del motor de hoy: x = E − `centro_utm[0]`, y = N − `centro_utm[1]` (metros de **cuadrícula**), z = cota − `z0` | contenido y cajas; en glTF, (x, z, −y), igual que la escena three.js del motor |
| ECEF (EPSG:4978) | para terceros (un globo, Cesium) | `root.transform` = ECEF(origen) · [e n u] · A |

`A` (2×2) pasa metros de cuadrícula a metros de terreno en el plano tangente del origen: convergencia de meridianos y factor de escala de UTM, sacados con proj4 por diferencias. El origen es `centro_utm` a altura elipsoidal `z0 + ondulacion` (**ondulación del geoide: 0 por defecto, [NO VERIFICADO]**; en Jaén es del orden de +50 m con EGM08-REDNAP **[SUPUESTO]** y solo importa para superponer el tileset a un globo).

- **El visor deshace el transform**: `tiles.group.matrix = Rx(−π/2) · root.transform⁻¹`; 3DTilesRendererJS ya aplica a cada glTF el giro y-arriba → z-arriba (`Rx(+π/2)`), así que la escena queda exactamente en el marco del motor (sin coordenadas de 6.400 km en la GPU). Comprobado: cada olivo dibujado está a < 1 cm de `(x, relieve, −y)` del registro y el terreno pasa por el relieve con el error que declara su tesela.
- **GPS del corresponsal (F4)**: `gpsAEscena(lat, lon, centro_utm, z0)` de `marco.mjs`: (lat, lon) → UTM 30N con proj4 → menos `centro_utm`. Es la misma fórmula que los exportadores; WGS84 del móvil ≈ ETRS89 (diferencia de decímetros a ~1 m en 2026 **[DEDUCIDO]**), muy por debajo del error del GPS bajo copa.
- **Error de la georreferencia** (medido por el guardián, ida y vuelta con proj4): ≤ 1,0 cm en planta a 1,3 km del origen; en altura sube hasta +13 cm a 1,3 km (+26,5 cm en la diagonal) porque el plano tangente se separa del elipsoide (≈ d²/2R). No afecta a la escena local; solo a la superposición en un globo.
- Convergencia y escala en el origen: fixture (`centro_utm` sintético, lejos del meridiano central) −1,648° y 1,00024; en un punto tipo Hituelo (E 405.000, N 4.178.000) −0,660° y 0,99962.

## Medidas (fixture sintético, 2026-10-28)

Chrome headless + SwiftShader: valen llamadas, triángulos y memoria; **no dan fps**. Nada de esto está probado en iPhone ni Quest.

| Nivel | Lado / paso | Teselas | Triángulos (terreno + olivos) | Bytes | geometricError máx. |
|---|---|---|---|---|---|
| 0 | 512 m / 4 m | 1 | 4.380 (1.020 + 3.360 lejanos) | 42,7 KB | 1,2862 |
| 1 | 256 m / 2 m | 2 | 6.726 (3.366 + 3.360 lejanos) | 108,7 KB | 0,6431 |
| 2 | 128 m / 1 m | 8 | 33.112 (12.952 + 20.160 detalle) | 421,9 KB | 0,0496 |

`geometricError` del tileset: 2,5724. En el terreno, la mitad de los triángulos de los niveles altos son faldones (en la raíz, 512 de 1.020): el relieve sintético es muy suave y la simplificación deja poco más que los bordes bloqueados.

| Visor (errorTarget 16, 900 × 650) | Llamadas | Triángulos | Geometrías / texturas | Heap JS | Caché de teselas | Teselas visibles |
|---|---|---|---|---|---|---|
| lejos (600 m) | 2 | 4.380 | 2 / 2 | 6 MB | 0,11 MB | 1 (la raíz) |
| cerca (45 m) | 10 | 19.916 | 12–14 / 7–8 | 7–8 MB | 0,45 MB | 5 (4 hojas + 1 de 256 m) |

Validador de CesiumGS: 0 errores, 0 avisos, 11 informativos (uno por glb: no sabe validar `EXT_mesh_gpu_instancing` y por eso ve sus accessors «sin uso»).

## Riesgos conocidos

- **3DTilesRendererJS 0.5.3 avisa en consola** «tiles versions at 1.1 or higher have limited support» con cualquier tileset 1.1. El guardián lo admite como aviso conocido; si un día un 1.1 deja de cargar, mirar aquí primero.
- **El validador no comprueba `EXT_mesh_gpu_instancing`**: lo cubre el propio guardián (mismo número de instancias por atributo, extensión requerida, posiciones contra el registro).
- **El validador va en su propia carpeta** (`tuberia/tiles3d/validador/`): trae sharp 0.32 (la tubería usa la 0.35; dos libvips en un proceso dan avisos de GLib, por eso el guardián lo lanza en un proceso aparte) y glob 7, cuyo aviso de obsolescencia mete un correo en el package-lock que el guardián de higiene rechaza: **ese lock no se versiona** (el de la tubería y el del visor, sí). `npm audit` señala 5 vulnerabilidades altas en ese sharp 0.32 (solo herramienta de desarrollo; la tubería y el visor, 0). El validador tarda de 14 a 100 s en el fixture según la carga de la máquina: es lo más lento del guardián.
- Las cifras del fixture no dicen nada del coste con Hituelo: 140 olivos frente a miles; hay que regenerar con datos reales y medir (ADR-0015, criterios).
