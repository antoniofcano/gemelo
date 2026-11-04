# Escala no uniforme del grupo de teselas (AG-1.11)

Estudio de solo lectura: qué hace 3DTilesRendererJS 0.5.3 con la exageración vertical, que el motor aplica como `makeScale(1, exag, 1)` en la matriz del grupo (`colocaGrupo`, `apps/web/motor/04b_escena3d.js`). **No cambia el comportamiento.** Las cifras de abajo son un **modelo calculado en Node** (`node pruebas/medida_escala_no_uniforme.js`), no una medida en pantalla; en iPhone y Quest, **no probado**.

## Qué hace la librería

Las rutas son de `apps/web/node_modules/3d-tiles-renderer/src/`.

- **Solo avisa de la escala** (`three/renderer/tiles/TilesRenderer.js`, `prepareForTraversal`, línea 524): extrae la escala de `group.matrixWorldInverse` y, si no es uniforme, hace `console.warn`. La comprobación es de unos pocos flops por fotograma; lo caro era el `console.warn` (AG-1.9 lo filtró). Con `exag < 1` ni siquiera avisa (mira `max(x−y, x−z)`); el gemelo usa 1–3 (`<input id="exag" min="1" max="3" step="0.25">` en `apps/web/plantilla.html`).
- **No aproxima nada por la escala**: `invScale` se declara (línea 513) y no se lee en ningún sitio. La cámara y el frustum se llevan al marco local de la tesela con la **inversa exacta** de la matriz del grupo (`prepareForTraversal`, líneas 561-575), así que el recorte por frustum y las distancias son consistentes con lo dibujado.
- **Pero sí cambia el error**: `calculateTileViewError` (misma clase, líneas 1031-1090) calcula `error = tile.geometricError / (distancia · sseDenominator)`, con `distancia = boundingVolume.distanceToPoint(posición de la cámara en el marco local)` (línea 1061). En el marco local el eje vertical no está exagerado, así que la cámara parece `exag` veces más cerca en vertical. `canTraverse` (`core/renderer/tiles/traverseFunctions.js`, línea 192) compara ese error con `errorTarget` (16 px por defecto, `?tilesError=`, 16-48 en los perfiles VR) para decidir si baja al hijo. Es decir: **sí afecta a qué teselas y niveles se eligen**, aunque la advertencia diga solo «may cause issues».

## En qué dirección y cuánto (modelo en Node)

Con `D` la distancia de mundo a la tesela y `θ` la elevación de la cámara sobre la horizontal, la distancia local es `D·sqrt(cos²θ + sin²θ/exag²)`.

- Frente a `exag = 1`, la librería pide **más** detalle, nunca menos: el error estimado se multiplica por `1/sqrt(cos²θ + sin²θ/exag²)`, entre ×1 (mirando a ras, θ = 0°) y ×`exag` (desde arriba, θ = 90°). Equivale a que cada tesela se refine a una distancia hasta `exag` veces mayor.
- Frente a «el error que se ve» en el mundo exagerado (modelo mío: el error vertical `geometricError·exag` se ve en proporción a `cosθ`), la librería **se queda corta** en vistas bajas y **se pasa** en vistas altas. Cruce exacto en 32° (exag 1,25), 49° (exag 2) y 57° (exag 3). Con exag 3 y vista a ras pide solo 1/3 del detalle «visible».
- Ejemplo (ge 8 m, 300 m, 1080 px, fov 60°, objetivo 16 px), exag 2: ×1,00 a 0°, ×1,11 a 30°, ×1,51 a 60°, ×2,00 desde arriba.

En la práctica (deducido, sin ver pantalla): con el relieve exagerado, desde un dron o una vista cenital se cargan más triángulos de los necesarios (la distancia de cambio de nivel crece hasta ×exag); en el paseo a ras (θ ≈ 0°) la selección es la misma que sin exagerar, así que el presupuesto del paseo no se mueve. El hueco visible a ras con exag 3 (poco detalle para lo que se ve) **no está medido**.

## Coste

Por tesela visitada: una distancia a caja/esfera, una división y un máximo (`calculateTileViewError`). La escala no uniforme **no añade trabajo** a esa cuenta: solo cambia los números de entrada. Micro-banco en Node (solo esa cuenta, **relativo, no Chrome**): 8,2 ns con exag 1 y 7,9 ns con exag 3, o sea sin diferencia; a ~1000 teselas visitadas (suposición, sin medir en Chrome) serían unos 8 µs por fotograma. Lo que costaba de verdad era el aviso (53.000 por sesión, AG-1.9).

## Alternativas (no implementadas)

1. **Escalar al cargar o en el sombreador, con matriz uniforme.** Poner la exageración en un uniforme del vértice (`position.y *= uExag`, como ya hace la nube con su `scale.y`) o reescribir los vértices al llegar cada tesela, dejando el grupo con escala uniforme. Ventaja: desaparece el aviso de raíz y se puede ajustar el error a mano. Riesgos: las cajas (`boundingVolume`) siguen sin exagerar, así que el recorte por frustum puede descartar una tesela alta que aún se ve (habría que ensancharlas); los raycasts (`relieveEn`, el rayo de la CPU) y las normales cambiarían; los olivos instanciados dentro de los glb también escalan. Es la de más trabajo.
2. **Compensar `errorTarget`** en proporción a `exag` (`errorTarget·f(exag)`, con `f` entre 1 y `exag`). Barata: un solo sitio (`perfil()` y el control de exageración). Pero la ganancia depende de la elevación de la cámara y un factor único sería una media. Riesgo: a ras con exag alta, donde la librería ya se queda corta, empeoraría.
3. **Plugin o subclase con `calculateTileViewError` propio** (la clase invoca plugins que lo definen, ver `update()`): calcular la distancia en el marco exagerado o usar el modelo de este documento. Ventaja: exacto y sin tocar el sombreado. Riesgo: acopla el motor a un método interno de 0.5.3 y obliga a revisarlo en cada subida de versión (versión fijada, ADR-0015).
4. **No hacer nada**: la selección es conservadora hacia arriba (más detalle del necesario) y el coste es nulo desde AG-1.9. Legítima si el banco no ve diferencia.

## Qué medir en el banco para decidir

Un solo Chrome por turno, por el banco (`npm run banco:encarga`); recuentos, nunca fps de SwiftShader:

- La misma vista (cenital, 45° y a ras) con `exag` 1, 2 y 3: `Escena3D.estado().stats` y `renderer.info` (teselas, triángulos, llamadas) y bytes descargados. Cuantifica el «de más» del modelo con la escena real.
- Lo mismo con la alternativa 2 (`?tilesError=` ajustado por exag): si los triángulos de la vista cenital con exag 3 bajan a los de exag 1 sin que se note a ras.
- Captura a ras con exag 3 para ver si falta detalle (el hueco de «se queda corta»); es un juicio de una persona.
- En Quest, los mismos recuentos y los fps con `?debug` (**no probado**): ahí el exceso de detalle desde arriba es lo que importa.
