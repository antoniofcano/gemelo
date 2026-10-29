# ADR-0015 — Escena en 3D Tiles 1.1 con 3DTilesRendererJS

- **Estado:** Propuesto
- **Fecha:** 2026-10-28

## Contexto
Antonio eligió 3D Tiles 1.1 + 3DTilesRendererJS para la escena (decisión 11; enmienda de [ADR-0009](0009-plataforma-multiusuario-cuarenta-hazas.md)), sabiendo que obliga a three ≥ 0.167 y a reconstruir lo que hoy dan `Mundo`, `Terreno`, `Arboles` y la `Cola` ([ADR-0001](0001-teselas-256m-utm30.md), [ADR-0002](0002-niveles-de-detalle.md)). Hacía falta demostrar con el fixture sintético que la tubería es viable y medible antes de tocar el motor. El prototipo está en `tuberia/tiles3d/` y se describe en [TILES3D](../sistema/TILES3D.md).

Comprobado en fuente primaria el 2026-10-28:
- **3D Tiles 1.1** (especificación, `CesiumGS/3d-tiles`, `specification/README.adoc`): glTF 2.0 es el formato principal de contenido; el glTF se pasa de y-arriba a z-arriba en ejecución; `geometricError` en metros, hojas a 0 o casi, cada nivel menor que su padre; `transform` 4×4 por columnas; `refine` obligatorio en la raíz; `box` de 12 números.
- **`EXT_mesh_gpu_instancing`** (Khronos, `extensions/2.0/Vendor/EXT_mesh_gpu_instancing`): `TRANSLATION` y `SCALE` VEC3 float, `ROTATION` VEC4 float o byte/short normalizado; atributos propios con guion bajo (`_ID`, `_COLOR`…); todos con el mismo `count`; debe ir en `extensionsRequired`; sin alternativa no instanciada.
- **3DTilesRendererJS 0.5.3** (npm, publicada el 2026-09-18; código del paquete): `peerDependencies` three ≥ 0.167.0; contenido `glb`/`gltf` con el `GLTFLoader` de three; giro y-arriba → z-arriba salvo `asset.gltfUpAxis`; `errorTarget` por defecto 16 px; caché LRU (`lruCache`) y eventos `load-root-tileset`, `load-model`, `tiles-load-end`.
- **`GLTFLoader` de three 0.186.1** (cabecera y código): soporta `EXT_mesh_gpu_instancing` (crea `InstancedMesh`; `_COLOR_0` pasa a `instanceColor` y el resto de atributos propios a `InstancedBufferAttribute`), además de `KHR_mesh_quantization`, `EXT_meshopt_compression`, `KHR_texture_basisu`, `KHR_materials_unlit` y `EXT_texture_webp`.

## Decisión
La escena se sirve como **tileset 3D Tiles 1.1** generado por `tuberia/tiles3d/genera.mjs` a partir del **mismo contrato de datos v2** que hoy lee el motor, y se dibuja con 3DTilesRendererJS:
- árbol de cuadrantes explícito alineado a UTM (hojas de 128 m con paso de 1 m; 128 × 128 celdas en todos los niveles), `REPLACE`, `geometricError` medido;
- terreno simplificado con meshoptimizer (error absoluto, bordes bloqueados) y faldones; ortofoto como textura por tesela;
- olivos como **instancias GPU** (`EXT_mesh_gpu_instancing`) cuyos parámetros salen del registro `copas[]`, con `_INDICE_COPA` (posición en la lista de copas de la tesela; el id se resuelve en CPU con una huella) y `_TIPO` (número local + tabla de nombres) por instancia para no cerrar el hueco del catálogo de olivos-tipo (contrato tileset v1, `contratos/tileset.schema.json`);
- el contenido va en el **marco local de hoy** (UTM 30N − `centro_utm`, z − `z0`); la raíz lo georreferencia en ECEF y el cliente deshace ese transform, así que la escena, las hazas de PostGIS y el GPS del corresponsal comparten coordenadas sin cambiar nada.

## Alternativas consideradas
- **Conservar las teselas propias (ADR-0001/0002) y 3D Tiles como capa opcional** (recomendación del agente `arquitecto-multiusuario`) — descartada por Antonio (decisión 11): dos formatos que mantener y sin el ecosistema (validador, visores de terceros, globo).
- **Teselado implícito (`implicitTiling`, subtrees)** — aplazado: con 100–300 nodos un árbol explícito es legible y basta; se reconsidera si Hituelo pasa de ~500 nodos.
- **Contenido en el marco ECEF (sin transform en la raíz)** — descartado: coordenadas de 6.400 km dentro de cada glb, pérdida de precisión en float32 y otro sistema distinto del del motor y del GPS.
- **Olivos en el registro de CPU (como hoy) en lugar de dentro del glTF** — se mantiene para el nivel 0 (copa de 8 radios, troncos, hojas cerca del foco), que no cabe en una instancia; los niveles lejanos sí van en el glTF.
- **Tubería en Python** — descartada: las librerías de glTF, instancias, simplificación y validación mantenidas están en npm (@gltf-transform, meshoptimizer, 3d-tiles-validator).

## Consecuencias
- **Positivas:** formato estándar validable (0 errores y 0 avisos con el validador de CesiumGS en el fixture); carga, LOD y caché los hace una librería mantenida; el coste por fotograma depende del error en pantalla (`errorTarget`), no de la superficie; las teselas se sirven como estáticos con caché larga desde el VPS.
- **Negativas / coste — lo que se pierde de ADR-0001/0002 y cómo se recupera:**
  - *«Nunca un hueco»* (`Mundo.suelo` contesta con el relieve de 8 m si la tesela no ha llegado): con `REPLACE` el padre se sigue dibujando hasta que llegan los hijos **[NO VERIFICADO con Hituelo]**; para la física (paseo, VR, ficha) `suelo(x, y)` debe seguir leyendo el `grueso` del índice en CPU, no la malla.
  - *Niveles de olivo con histéresis y tope de triángulos* (`TOPE_TRI`, `VR_PERFILES`): pasan a ser `errorTarget` y `lruCache.maxBytesSize` por perfil; el nivel 0 detallado lo sigue construyendo el motor desde el registro cerca del foco.
  - *Color del suelo, NDVI y exageración en el sombreador* (`UN`, `uExag`): se reinyectan con `onBeforeCompile` en el evento `load-model`; la exageración como escala vertical del grupo.
  - *Nube LiDAR* (`pts`, `setDrawRange`): sin hacer; 3D Tiles 1.1 admite glTF con puntos.
  - *Faldones de 1,5 m*: los genera la tubería (`max(1,5 m, 2 × error)`).
  - Las cifras de [MEDIDAS](../sistema/MEDIDAS.md) dejan de valer para la escena nueva; hay que medir otra vez.
  - Más ficheros: con hojas de 128 m, Hituelo pasaría de 92 a ~250 glb **[DEDUCIDO]**: por encima del límite de 255 por publicación de los artefactos; solo es viable servido por el VPS (F2 retira la salida artefacto).
  - 3DTilesRendererJS 0.5.3 avisa de «soporte limitado» de 3D Tiles 1.1; el validador no comprueba `EXT_mesh_gpu_instancing` (lo cubre el guardián propio).
- **Convivencia durante la migración:** el contrato v2 sigue siendo la única salida de los exportadores; la tubería 3D Tiles es un paso más que lo lee. Primero F1c (motor a three ≥ 0.167, mismo aspecto). Después, la escena 3D Tiles entra en el motor como un módulo que sustituye a `Terreno` y a los niveles 1–2 de `Arboles` **detrás de un interruptor** (`?escena=3dtiles`), con `Mundo` (relieve grueso en CPU, registro, hazas) intacto; un guardián compara las dos escenas en los mismos escenarios (como `web.test.js`). Cuando se cumplan los criterios, pasa a ser la de serie, se retira el código de teselas propias y ADR-0001 y ADR-0002 quedan **superados por este ADR**.
- **Supera (al aceptarse y cumplir los criterios):** ADR-0001 (formato de teselas de 256 m; la rejilla alineada a UTM se conserva) y ADR-0002 (niveles de terreno y olivos L1/L2). No toca ADR-0003 (calidad Base/Alta: la tubería lee las dos), ni ADR-0006/0007 (corrección de copas y suelo, que siguen en el sombreador).

## Comprobación
- **Hecho (fixture sintético):** [`tiles3d.test.js`](../../pruebas/guardianes/tiles3d.test.js) genera el tileset y comprueba versión 1.1, `geometricError` estrictamente decreciente, cada glb (cabecera, chunks, accessors, índices), el validador de CesiumGS (0 errores, 0 avisos), olivos contra el registro (posición < 1 mm, altura, tipo), el marco (≤ 1,0 cm en planta a 1,3 km; GPS → escena exacto) y los topes de `tuberia/tiles3d/presupuesto.json`; y carga el visor en Chrome headless + SwiftShader: 0 errores, lejos 2 llamadas / 4.380 tri, cerca 10 / 19.916, heap 6–8 MB (dos corridas), olivos y terreno donde dice el registro.
- **Criterios de aceptación (para pasar a Aceptado):**
  1. Hituelo real regenerado: validador con 0 errores y 0 avisos; peso total y número de ficheros medidos.
  2. Escenarios lejos, cerca, nube y paseo con SwiftShader dentro del diseño de [`pruebas/presupuesto.json`](../../pruebas/presupuesto.json) (≤ 1,7 M triángulos, ≤ 250 llamadas, ≤ 350 MB) y 0 errores de consola.
  3. Ningún fotograma sin terreno bajo la cámara en un vuelo de prueba de punta a punta (0 rayos verticales sin respuesta).
  4. Mismas coordenadas que el motor: olivos y relieve a < 1 cm de la escena actual en los mismos escenarios.
  5. Quest real: p95 del fotograma ≤ 13,9 ms en Hituelo (criterio de F1d en el PLAN). **No probado.**
  6. Escritorio real con `?debug`: sin regresión de fps frente a la escena actual. **No probado.**
- **No probado:** nada en iPhone ni Quest; nada con datos reales; fps (SwiftShader no los da); que el padre tape siempre el hueco mientras llegan los hijos; `EXT_instance_features`; compartir mallas de catálogo entre teselas.
