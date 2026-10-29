# Escena en 3D Tiles 1.1 (prototipo F1d)

Cómo se generan, qué llevan y cómo se regeneran las teselas 3D Tiles 1.1 de la escena. **Prototipo**: ejercitado con el fixture sintético y, una vez, con Hituelo real (cifras en [MEDIDAS](MEDIDAS.md)); el motor (`apps/web/motor/`) lo usa solo con `?escena=tiles` y solo para el relieve (paso 3b, en curso: [abajo](#en-el-motor-escenatiles-paso-3b-en-curso)). Decisión: [ADR-0015](../adr/0015-escena-en-3d-tiles.md) (Propuesto). Lo vigila [`tiles3d.test.js`](../../pruebas/guardianes/tiles3d.test.js).

| Pieza | Dónde |
|---|---|
| Generador (contrato v2 → `tileset.json` + glb) | `tuberia/tiles3d/genera.mjs` |
| Marco de coordenadas (UTM 30N ↔ local ↔ ECEF, GPS → escena) | `tuberia/tiles3d/marco.mjs` |
| Contrato de lo propio del tileset (`extras.gemelo`, identidad y tipo por instancia) | [`contratos/tileset.schema.json`](../../contratos/tileset.schema.json) (contrato tileset v2) |
| Comprobación de identidad contra el contrato v2 (para datos reales) | `tuberia/tiles3d/comprueba.mjs` |
| Topes de triángulos, bytes y visor | `tuberia/tiles3d/presupuesto.json` |
| Visor de prueba (3DTilesRendererJS + three moderno, Vite; `vite.config.js` escribe su `index.html`) | `tuberia/tiles3d/visor/` |
| Validador oficial (aparte, solo desarrollo) | `tuberia/tiles3d/validador/` |
| Guardián | [`pruebas/guardianes/tiles3d.test.js`](../../pruebas/guardianes/tiles3d.test.js) |

## Cómo regenerar

```sh
cd tuberia/tiles3d && npm i                       # una vez (dependencias abajo)
python pruebas/genera_fixture.py --salida <fix>   # desde la raíz: fixture sintético v2
node tuberia/tiles3d/genera.mjs --entrada <fix>/hituelo --salida <tileset> --catalogo modelos/olivos/fixture/catalogo.json
GEMELO_DATOS=<indice.json> node tuberia/tiles3d/genera.mjs --salida pruebas/salida/tiles3d-hituelo   # datos reales (fuera del repo)
node tuberia/tiles3d/comprueba.mjs --entrada <indice.json> --tileset <tileset> [--catalogo <el mismo>]  # cada instancia contra el registro (o GEMELO_DATOS)
#   opciones: --hoja 128 (lado de hoja, m) --celdas 128 (celdas por lado en todos los niveles) --textura 256 (px máx.)
#             --ondulacion 0 (N del geoide, m) --error-hoja 0.05 (error de simplificación en hojas, m) --niveles-olivo 3
#             --nivel-util <m> (lado de los hijos de la raíz; por defecto hoja·2^(niveles-olivo − 1) = 512)
#             --catalogo <catalogo.json> (solo el fixture: nombres de tipo del catálogo sintético; sin él, el catálogo «olivos»)
cd tuberia/tiles3d/validador && npm i && npm run valida -- <tileset>/tileset.json   # validador de CesiumGS
cd tuberia/tiles3d/visor && npm i && npm run build # visor en dist/; copiar <tileset> a dist/tileset/ y servir dist/
GEMELO_MIDE=1 npm run puerta                       # o solo: node --test pruebas/guardianes/tiles3d.test.js
```

`--entrada` acepta los dos modos del contrato: carpeta con `indice.json` + `t/` (ficheros), el propio `indice.json`, o `embebido.json`; sin `--entrada`, `GEMELO_DATOS`. La salida con datos reales va a un directorio que no se versiona (`pruebas/salida/`). En desarrollo, el tileset puede ir en `tuberia/tiles3d/visor/public/tileset/` (ignorado por git) con `npm run dev`; el visor admite `?tileset=<url>`, `?error=<px>` y `?escena=lejos|cerca`.

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

Los nombres de los tipos de olivo **no** se copian: `genera.mjs` importa `tablaLocal()` de `apps/web/olivo/catalogo.js` y `tipoDeId()` de `apps/web/olivo/tipos.js` (módulos ES sin dependencias).

Código propio, solo lo que no da una librería: leer el contrato v2, muestrear el relieve global (para que teselas vecinas compartan los bordes y las normales no tengan costura), el árbol de cuadrantes y los `geometricError` medidos.

## Formato

- **`tileset.json`**: `asset.version = "1.1"`, árbol de cuadrantes **explícito** (sin teselado implícito todavía), `refine = "REPLACE"` en todos los nodos, `boundingVolume.box` (12 números) en el marco local. **La raíz no tiene contenido** (no hay glb de la raíz; desde el generador 0.3.0): sus hijos son los cuadrados del **nivel útil** (lado `S`, alineados a múltiplos de `S` en UTM, como ADR-0001) que tocan alguna tesela del contrato, y debajo de cada uno, cuadrantes hasta las hojas; los cuadrantes sin datos no se generan. `S` = el nivel más alto con olivos, `hoja·2^(niveles-olivo − 1)` (512 m por defecto; `--nivel-util` lo cambia): por encima solo había terreno y una ortofoto más tosca que la que pide la pantalla al ver la finca entera. La caja de la raíz es la de sus hijos. Hasta el 0.2.0 la raíz era el menor cuadrado alineado que **contenía** los datos, y en Hituelo, que cruza N = 4.177.920 (múltiplo de 16.384), subía a 32.768 m con 6 niveles sin olivos. `extras.gemelo` lleva `centro_utm`, `z0`, `srs`, `ondulacion_geoide`, `origen_geodesico`, la convergencia y el factor de escala de UTM en el origen, `hoja_m`, `celdas`, los triángulos de cada prototipo y `tipo_generico = −1`; y lo del contrato tileset v2 (abajo): `contrato_tileset`, `id_fuente`, `huella_registro`, `catalogo_tipos`, `tipos`. Cada tesela con olivos lleva `extras.gemelo = {cuadro, olivos, huella}`.
- **Contenido**: un glb por nodo en `<lado>/<i>_<j>.glb`, con `i = floor(E/lado)`, `j = floor(N/lado)` (en el nivel de 256 m el nombre coincide con el `kx_ky` de hoy). Cada glb lleva:
  - **terreno**: rejilla de `celdas × celdas` (128 → 1 m en hojas de 128 m, 2 m en 256 m, 4 m en 512 m…) solo en celdas con dato, simplificada con meshoptimizer hasta `error-hoja · 2^(niveles por debajo)` m, con **faldones** hacia fuera de `max(1,5 m, 2 × error)` en los bordes del cuadrado; `POSITION`, `NORMAL` (del relieve global, sin costura), `TEXCOORD_0`; material PBR mate (metal 0, rugosidad 1) con la **ortofoto** como `baseColorTexture` (JPEG, `min(textura, 2^⌈log2(lado/res_orto)⌉)` px, Lanczos);
  - **olivos**: un nodo con `EXT_mesh_gpu_instancing` (en `extensionsRequired`) sobre un prototipo genérico con color por vértice (tronco/copa). Por instancia: `TRANSLATION` = (x, relieve, −y), `ROTATION` = giro sobre la vertical según el eje largo de la copa medida, `SCALE` = (rx, h, rz), `_COLOR_0` (ortofoto en el árbol, tintada como el nivel 1 del motor, lineal), `_INDICE_COPA` (posición en la lista de copas de la tesela) y `_TIPO` (número local de tipo; −1 = sin asignar). Ver «Identidad y tipo por instancia». Giro y radios con la misma regla que `07b_arboles.js`; qué es olivo, con la de `02_mundo.js`.
- **Niveles de olivo**: hojas con `olivo-detalle` (144 tri), los dos niveles siguientes con `olivo-lejano` (24 tri) y más arriba ninguno (queda la ortofoto). Ajustable con `--niveles-olivo`.
- **`geometricError`** (metros): en cada nodo con contenido, `max(medido, 2 × el mayor de sus hijos)`; las hojas, el medido. La raíz sin contenido: `max(lado mayor de su caja, 2 × el mayor de sus hijos)`, el error de no dibujar nada (falta todo lo que hay en la caja); tiene que ser grande porque 3DTilesRendererJS (como Cesium) **no** baja de una tesela vacía cuyo error ya cumple el objetivo, y desde lejos no se vería nada (leído en `traverseFunctions.js` de 0.5.3, `canTraverse`). Medido = error de la rejilla frente al relieve de 1 m (comprobado en cada metro) + error que devuelve meshoptimizer, o el de los olivos si es mayor: altura máxima si el nivel no los lleva; `(1 − cos(π/6)) ×` el mayor radio o altura con el prototipo lejano (error de cuerda de 6 frente a 12 sectores). El del tileset, el doble que el de la raíz.
- **`resumen.json`** (al lado): triángulos, bytes, errores y prototipo por tesela y por nivel; lo usan el guardián y la documentación.

### Identidad y tipo por instancia (contrato tileset v2)

Esquema: [`contratos/tileset.schema.json`](../../contratos/tileset.schema.json). Lo vigilan `tiles3d.test.js` (ajv y cada instancia del fixture) y, con datos reales, `tuberia/tiles3d/comprueba.mjs`.

- **Por qué el id no va en el glb.** Hasta el generador 0.1.0, `_ID_ARBOL` era un FLOAT con el índice en `copas[]`: exacto solo hasta 2²⁴, y `copas_id` vive en `[0, 2³²)` (los provisionales empiezan en 2³¹, CONTRATOS §1.1). glTF no admite `UNSIGNED_INT` en atributos (solo en índices), así que un id de 32 bits no cabe exacto en ningún tipo de atributo. Desde el 0.2.0 el glb guarda un número pequeño y el id se resuelve en CPU.
- **`_INDICE_COPA`** (por instancia, entero, nunca normalizado): `k` = posición de la copa en la **lista de copas de la tesela**. `UNSIGNED_BYTE` si la tesela tiene ≤ 256 olivos, `UNSIGNED_SHORT` si ≤ 65.536; por encima, `FLOAT` (exacto hasta 2²⁴, el generador lo comprueba). Las instancias van en el orden de la lista (`k` = número de instancia).
- **Lista de copas de una tesela**: los índices `g` de `copas[]` con `esOlivo(copas[g])` (la regla de `02_mundo.js`: ni alto > 8 m ni alto > 6,5 m y estrecho, < 2,2 m de radio medio) y `x0 ≤ x < x0 + lado`, `y0 ≤ y < y0 + lado`, **en el orden de `copas[]`**, con `[x0, y0, lado] = extras.gemelo.cuadro` de la tesela. Es `listaCopas()` de `genera.mjs`; el motor la rehace desde su propio json.
- **Huella** (`extras.gemelo.huella` de la tesela): `"sha256:" +` hex del SHA-256 de los ids de la lista, en orden, como **Uint32 little-endian** (4 bytes por copa). Id = `copas_id[g]` si el índice trae `copas_id` (`id_fuente = "copas_id"`); si no, `g` (`id_fuente = "indice"`). En el navegador: `crypto.subtle.digest("SHA-256", Uint32Array.from(ids))` (necesita contexto seguro; las máquinas de destino son little-endian). Si la huella que calcula el motor no es la de la tesela, su json no es el del que salió el tileset: **no se resuelve ningún id** de esa tesela (se avisa) en vez de poner el id de otro árbol. `huella_registro` (en el tileset) es la de todos los ids de `copas[]`, para descartar un json equivocado de una vez.
- **Resolver un olivo** (lo hará el motor en el paso 3; hoy lo hacen el guardián y el visor): instancia → `k = _INDICE_COPA` → `g = lista[k]` → `copas[g]` y `copas_id[g]`.
- **`_TIPO`** (por instancia, `SHORT` con signo): número **local** del tileset, no el id del catálogo. `extras.gemelo.tipos` es la tabla número → nombre del tipo de catálogo, **sin versión dentro**; `"-1": null` = sin asignar. Los números 0..m−1 se dan a los ids de `copas_tipo` presentes que el catálogo conoce, de menor a mayor (`tablaTipos()`); un id que no conoce va a −1 (como en el motor) y se cuenta en `resumen.json` (`tipos_desconocidos`). Catálogo por defecto: **`olivos`** ([olivo-generado §1.1](../../contratos/olivo-generado.md)): `copas_tipo` = `ID_TIPO` (0-6) y nombre = `tablaLocal()` (`olivos:planton`, `olivos:adulto-1p` … `olivos:centenario-3p`); `extras.gemelo.catalogo_tipos = "olivos"`. El tipo 0 del catálogo sintético de pruebas **solo existe en el fixture**: con `--catalogo modelos/olivos/fixture/catalogo.json` se llama `fixture-sintetico:0` (`<id del catalogo.json>:<id del tipo>`) y `catalogo_tipos = "fixture-sintetico"`, para que no se confunda con `olivos:planton`. Hituelo real no trae `copas_tipo` y su tabla es solo `{"-1": null}`. Hasta el generador 0.2.0 (contrato tileset v1) los nombres eran provisionales (`olivos-tipo:<id>`, `tipos_provisionales = true`). La geometría sigue siendo el prototipo genérico para todos los tipos (agrupar por tipo es el hueco de abajo).

### Huecos que deja abiertos (a propósito)

- **Catálogo de olivos-tipo (F1b)**: `_TIPO` (con su tabla) y `_INDICE_COPA` ya viajan. Con catálogo, el generador agrupará las instancias por tipo: un nodo instanciado por **(tipo, nivel)** con la malla del tipo (glb del catálogo, contrato `olivos-tipo`) en lugar del prototipo genérico. Coste: una llamada de dibujo más por tipo presente en la tesela (con 6–8 tipos, hasta 8 por tesela) y los bytes de cada malla repetidos en cada glb; compartirlos con un `buffer` externo común es posible en glTF, pero **[NO VERIFICADO]** que 3DTilesRendererJS lo cachee entre teselas. Con `_TIPO = −1` se ve igual que hoy.
- **Identidad del árbol**: three deja `_INDICE_COPA` y `_TIPO` como `InstancedBufferAttribute` en la geometría; con el `instanceId` de un rayo y la tesela del modelo (`load-model` da `tile.extras.gemelo`) se llega al registro por la lista y la huella (lo usa el gancho `instancias()` del visor). La vía estándar de 3D Tiles sería `EXT_instance_features` + `EXT_structural_metadata`: **[NO VERIFICADO]** su soporte en 3DTilesRendererJS 0.5.3.
- **Sin hacer**: construcciones (`paisaje.edificios`), nube LiDAR (`pts`), tendido y cauces, NDVI y exageración vertical, compresión (meshopt/KTX2), teselado implícito, la tesela Base (sin `pts`) no cambia nada aquí.

## En el motor: `?escena=tiles` (paso 3b, en curso)

`apps/web/motor/04b_escena3d.js` (`Escena3D`, contrato en [CONTRATOS §2](CONTRATOS.md)). **Sin la bandera no crea nada.** Con ella:
- el relieve con su ortofoto lo dibuja 3DTilesRendererJS (la misma versión fijada que el visor, en `apps/web/package.json`; en el cliente web la importa Vite con `import()`, y en la salida artefacto va por el importmap de jsDelivr junto a three, porque su build solo importa `three` y `three/addons/`). `Terreno` (`04_terreno.js`) no construye nada (`ESC3D.activa`); si la librería o el tileset fallan, vuelve `Terreno`;
- la física y las consultas en CPU (`Mundo`: suelo, copas, color del suelo; paseo, VR, balizas, huellas) siguen con el json de siempre (decisión 38); la nube (37) y las construcciones (36) no cambian. Los olivos del glb se **quitan** al cargar cada modelo: siguen los de `Arboles`;
- marco: `grupo.matrix = escala(1, exag, 1) · Rx(−π/2) · transform⁻¹`, como el visor, y con la exageración vertical;
- **sombreado del relieve** (`04d_sombreado_tiles.js`, `SombreadoTiles`): al cargarse cada glb, el material PBR de su terreno se cambia por un Lambert con el **mismo parche** que el Terreno (`Terreno.parche`, un solo GLSL para las dos escenas) y los mismos uniformes compartidos: convenio de color de ADR-0016 (la ortofoto del glb pasa a `NoColorSpace`), hierba según el NDVI, capa NDVI con su escala relativa, escarcha, sombra de nubes, suelo abierto/rodadas, relieve fino (`uBumpK`, que la VR apaga) y los modos Ortofoto/NDVI. Cambian solo la posición en el mundo (de `modelMatrix`; la sombra de nubes se calcula con ella) y las coordenadas de la ortofoto, que es la del glb (de la caja de la tesela, norte arriba). El color de la tierra, el ruido y el color ancho del suelo abierto salen de la tesela del Mundo que contiene el glb (json de siempre, decisión 38); un glb de 512 m (solo de lejos) pinta la tierra con el mosaico de 1 m y sin detalle. Lo vigila `sombreado_tiles.test.js` (sin navegador). **Cómo se ve: sin comprobar en navegador** hasta que Antonio mire las capturas;
- tileset: `?tileset=<ruta relativa>` o `<D.base>tileset/tileset.json`; una URL con esquema o `//host` se rechaza (solo el mismo origen);
- `errorTarget`: 16 px en escritorio (`?tilesError=`); en VR, el campo `e` de cada perfil de `VR_PERFILES` (16/24/32/48, valores de partida **sin medir** en las gafas). En una sesión XR, la cámara de la sesión con la resolución de un ojo y el `Scheduler` de la librería atado a la sesión (lo que hace su ejemplo de XR; la API está leída en el código de 0.5.3, el ejemplo en sí no se ha contrastado).

Lo vigila [`escena3d.test.js`](../../pruebas/guardianes/escena3d.test.js): sin navegador, versión única, importaciones del build, importmap y enganches; con navegador, el fixture con y sin la bandera (CSP aproximada, raíz vacía, relieve dibujado frente al de la CPU, tileset de otro host). **Lo de navegador, sin ejecutar todavía.**

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

## Medidas (fixture sintético; tubería 2026-10-29 con el generador 0.3.0, visor 2026-10-28 con el 0.2.0)

Chrome headless + SwiftShader: valen llamadas, triángulos y memoria; **no dan fps**. Nada de esto está probado en iPhone ni Quest.

| Nivel | Lado / paso | Teselas | Triángulos (terreno + olivos) | Bytes | geometricError máx. |
|---|---|---|---|---|---|
| raíz | 512 m (su caja) | 0 (sin glb) | — | — | 512 |
| 0 (nivel útil) | 512 m / 4 m | 1 | 4.380 (1.020 + 3.360 lejanos) | 41,0 KB | 1,2862 |
| 1 | 256 m / 2 m | 2 | 6.726 (3.366 + 3.360 lejanos) | 105,5 KB | 0,6431 |
| 2 | 128 m / 1 m | 8 | 33.112 (12.952 + 20.160 detalle) | 411,3 KB | 0,0496 |

12 nodos, 11 glb (557,8 KB) + `tileset.json` 8,7 KB. `geometricError` del tileset: 1.024 (antes 2,5724: la raíz era el glb de 512 m). En el fixture el nivel útil coincide con la raíz de antes, así que los glb y los triángulos son los mismos; solo cambia la raíz vacía encima. En el terreno, la mitad de los triángulos de los niveles altos son faldones (en la raíz, 512 de 1.020): el relieve sintético es muy suave y la simplificación deja poco más que los bordes bloqueados.

**Visor: medido con el generador 0.2.0 (raíz con contenido); con la raíz vacía del 0.3.0 no se ha vuelto a medir** (la máquina no tenía memoria para Chrome). Lo esperado, sin probar: lejos, la misma tesela de 512 m (ahora hija de la raíz).

| Visor (errorTarget 16, 900 × 650) | Llamadas | Triángulos | Geometrías / texturas | Heap JS | Caché de teselas | Teselas visibles |
|---|---|---|---|---|---|---|
| lejos (600 m) | 2 | 4.380 | 2 / 2 | 6 MB | 0,11 MB | 1 (la de 512 m) |
| cerca (45 m) | 10 | 19.916 | 12–14 / 7–8 | 7–8 MB | 0,45 MB | 5 (4 hojas + 1 de 256 m) |

Validador de CesiumGS: 0 errores, 0 avisos, 11 informativos (uno por glb: no sabe validar `EXT_mesh_gpu_instancing` y por eso ve sus accessors «sin uso»).

## Riesgos conocidos

- **3DTilesRendererJS 0.5.3 avisa en consola** «tiles versions at 1.1 or higher have limited support» con cualquier tileset 1.1. El guardián lo admite como aviso conocido; si un día un 1.1 deja de cargar, mirar aquí primero.
- **El validador no comprueba `EXT_mesh_gpu_instancing`**: lo cubre el propio guardián (mismo número de instancias por atributo, extensión requerida, posiciones contra el registro).
- **El validador va en su propia carpeta** (`tuberia/tiles3d/validador/`): trae sharp 0.32 (la tubería usa la 0.35; dos libvips en un proceso dan avisos de GLib, por eso el guardián lo lanza en un proceso aparte) y glob 7, cuyo aviso de obsolescencia mete un correo en el package-lock que el guardián de higiene rechaza: **ese lock no se versiona** (el de la tubería y el del visor, sí). `npm audit` señala 5 vulnerabilidades altas en ese sharp 0.32 (solo herramienta de desarrollo; la tubería y el visor, 0). El validador tarda de 14 a 100 s en el fixture según la carga de la máquina: es lo más lento del guardián.
- **Hituelo real** (2026-10-29, generador 0.2.0): 269 glb, 40,9 MB, validador con 0 errores y 0 avisos, cada olivo en las hojas una vez; tamaños, doble descarga y tiempo en [MEDIDAS](MEDIDAS.md). Falta lo de dibujo (llamadas, triángulos, memoria en el visor o el motor). **Con el 0.3.0 (raíz sin contenido), regenerado desde Hituelo v3: 248 glb, 38,2 MiB, 0 errores y 0 avisos, `comprueba.mjs` con 0 errores por `copas_id` ([MEDIDAS](MEDIDAS.md)).
- **Raíz muy grande con datos que cruzan una línea de la rejilla** (resuelto en el generador 0.3.0): la regla vieja daba en Hituelo una raíz de 32.768 m con 21 nodos sin olivos (≥ 1.024 m, 0,9 MB). Con la raíz vacía sobre el nivel útil, el árbol de Hituelo (calculado sin escribir glb, con el índice actual) es 1 raíz sin contenido + **18 + 46 + 184 = 248 glb** (512, 256 y 128 m), los mismos de esos tres niveles que antes; 248 glb + `tileset.json` caben en el límite de 255 ficheros por publicación. Caja de los datos 2.048 × 2.816 m; caja de la raíz, 2.560 × 3.072 m (5 × 6 cuadrados de 512 m), así que su `geometricError` sería 3.072. El coste: desde lejos el visor baja a los 18 glb de 512 m (3,2 MB y ≈ 250 k triángulos con el 0.2.0) en lugar de a un nodo grueso; **no medido** en el visor ni en el motor.
- **La raíz vacía en otros visores**: 3DTilesRendererJS 0.5.3 baja de la raíz porque su error (≥ el lado de su caja) supera siempre el objetivo a cualquier distancia útil. Leído en su código; **no probado en el visor** con el 0.3.0 ni en Cesium.
- **El lienzo de ortofoto cubre los datos, no los cuadrados del nivel útil** (desde el generador 0.2.0): esos cuadrados se salen de los datos (y la raíz vieja de Hituelo, 32.768 m a 0,5 m/px, no cabía en memoria); fuera de los datos, el recorte es gris. El lienzo de Hituelo es de 4.096 × 5.632 px; sharp se usa con `limitInputPixels: false` para él.
