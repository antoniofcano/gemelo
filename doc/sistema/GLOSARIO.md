# Glosario

Términos del proyecto, en el sentido en que los usa el código y la documentación.

| Término | Significado |
|---|---|
| **Tesela** | Cuadrado de 256 m de lado alineado a múltiplos de 256 en UTM 30N. La tesela `(kx, ky)` cubre `[kx·256, +256) × [ky·256, +256)`; se llama `kx_ky` con `kx = floor(E/256)`. Lleva relieve, copa, color de suelo, nube y ortofoto. ADR-0001. |
| **Nivel (L0/L1/L2)** | Grado de detalle según la distancia a la cámara. Terreno: L0 1 m, L1 2 m, L2 8 m. Olivos: L0 modelo completo, L1 instanciado (~170 tri), L2 instanciado (~30 tri). ADR-0002. |
| **Copa** | Registro de un árbol: `x, y, h` y 8 radios (`r8`), más parcela. La forma es medida del LiDAR. En `D.copas`: `[x, y, h, r8[8], parcela+1]`. |
| **r8** | Los 8 radios de la copa, uno cada 45°, en metros; con ellos se construye la malla de copa. Si faltan, la copa se genera por procedimiento. |
| **Foco** | El punto que se mira (en órbita) o quien pasea; las distancias de los niveles se miden desde el foco, con un adelanto hacia donde se va (`distFoco`, `07b_arboles.js`). |
| **Celda (de olivos)** | Bloque de 64 m en el que se construye el nivel 0 de los olivos. Se construye a rebanadas por la `Cola`. |
| **Cola** | Planificador de trabajos pesados como generadores con `yield`; reparte un presupuesto de ms por fotograma, lo más cercano primero. |
| **Mundo** | Módulo (`02_mundo.js`) que gestiona las teselas y contesta `suelo`, `copaAlta`, `orto`, `colorSuelo`. Todo lo demás pregunta aquí. |
| **Calidad Base / Alta** | Base: MDT 5 m + nDSM 2,5 m, copas generadas, un solo HTML. Alta: LiDAR 3.ª cobertura, copas medidas, teselas como ficheros de apoyo. ADR-0003. |
| **Ortofoto desplazada** | La ortofoto PNOA muestra las copas ~1,1–1,4 m al este de su posición real (según la altura). El motor lo corrige con `desp(h)` y el deslizador `kcor`. ADR-0006. |
| **Suelo abierto** | Zona de suelo sin copas ni sombra, de la que el sombreador hereda el detalle de la ortofoto (rodadas, tono, caminos). ADR-0007. |
| **MDT / MDS / nDSM / CHM** | Modelo digital del terreno (suelo desnudo) / de superficies (con vegetación) / MDS − MDT normalizado / altura de la vegetación (*canopy height model*). En la tesela, `dtm` y `chm`. |
| **LiDAR PNOA 3.ª cobertura** | Nube de puntos del vuelo 2024 del IGN (~6,5 pts/m²), hojas de 1 km. |
| **NDVI** | Índice de vegetación de Sentinel-2, 48 fechas, `u8` (0 = sin dato). `suelo_ndvi` es su desmezcla `a + b·f`. |
| **Nube** | Puntos LiDAR de una tesela como `THREE.Points`, con orden barajado: `setDrawRange` da un LOD gratis. |
| **Medido / deducido / ilustrativo** | Procedencia de lo que se muestra. Medido: copas, relieve. Deducido: tendido, postes, cauces, árboles no olivo. Ilustrativo: troncos y ramas. CLAUDE.md regla 5. |
| **Fichero de apoyo** | Fichero publicado junto a la página (`t/<kx>_<ky>.json\|jpg`). Límites en PUBLICACION. ADR-0008. |
| **Embebido / ficheros** | Los dos modos de montaje: todo en un HTML (Cerro) o página ligera + `t/` (Hituelo). |
| **Perfil VR** | Nivel de rendimiento del modo VR (`VR_PERFILES`: fracción de árboles, radio, tope de triángulos, hierba); baja si el JS pasa de 13 ms. ADR-0005. |
| **Rig** | `Group` que contiene la cámara en VR; three r128 no permite desplazar el espacio de referencia, así que se mueve el rig. |
| **SwiftShader** | Renderizado por software de Chrome headless: vale para contar llamadas, triángulos y memoria, **no** para fps. |
| **`?debug`** | Parámetro de URL que muestra fps, ms de JS, llamadas, triángulos, teselas y olivos por nivel. |
| **Puerta** | La lista de comprobaciones que debe pasar todo commit (ONBOARDING). |
| **Guardián** | Test de proceso (docs, versiones, contratos, secretos), pequeño y barato, en `pruebas/guardianes/`. |
| **Fixture** | Conjunto sintético diminuto de teselas versionado para probar sin datos privados. |
