---
name: modelado-3d
description: Experta en modelado 3D para el motor del gemelo (three.js 0.186.1): presupuestos de triángulos por nivel, silueta del olivo (L0/L1/L2), instanciado, mallas de terreno y faldones de costura, materiales y sombreadores con onBeforeCompile, gestión de color, normales, sombras y límites de three. Úsala al tocar geometría, materiales, niveles de detalle o el aspecto de olivos, terreno, nube o paisaje.
---

# Modelado 3D en el gemelo

El motor **genera toda la geometría por procedimiento** (no hay `GLTFLoader` en el motor). Hueco para modelos: el `Catalogo` de olivos-tipo (`07a_catalogo.js`, [ADR-0012](../../../doc/adr/0012-catalogo-de-olivos-tipo-e-id-estable.md), contrato en `contratos/olivos-tipo.md`) da las formas de L1/L2; el tipo −1 son las de siempre y `Catalogo.instala` (catálogo glb con un cargador inyectado) aún no se llama. Todo lo que sigue sale de [ARCHITECTURE.md](../../../doc/sistema/ARCHITECTURE.md), [ADR-0002](../../../doc/adr/0002-niveles-de-detalle.md) y de `apps/web/motor/`. Antes de cambiar nada: [skill `medir`](../medir/SKILL.md). Cifras del código, no del diseño: manda el código.

## Presupuestos (por fotograma, de diseño)
≤ 1,7 M triángulos · ≤ 1,4 M puntos · ≈ 250 llamadas · ≈ 350 MB. Un cambio que sube cualquiera se mide antes y después y se explica.

## El olivo en tres niveles (`07b_arboles.js`, `07a_catalogo.js`, `06_arboles.js`, `07_follaje.js`)
| Nivel | Qué es | Coste | Tope |
|---|---|---|---|
| L0 | modelo completo en **celdas de 64 m** alrededor del foco: copa de **8 radios medidos** (`r8`), troncos y ramas (tubos, forma **ilustrativa** de 2–3 pies), hojas-sprite del LiDAR, corteza, frutos/flores | ≈ 800 tri | `MAX0 = 450` |
| L1 | `InstancedMesh` con **4 prototipos** (`NP1`) de copa abombada + tronco, color e inclinación por instancia | ≈ 170 tri | `MAX1 = 3000` |
| L2 | `InstancedMesh` con **2 prototipos** (`NP2`) copa de muy pocos polígonos (el diseño preveía un icosaedro aplastado) | ≈ 30 tri | `MAX2 = 16000` |
| L3 | nada: ya está en la ortofoto | 0 | — |
Cambio de nivel a `U1 = 460` m y `U2 = 1600` m con histéresis; `TOPE_TRI = 550000` reparte entre niveles. La copa es **medida**; el tronco, **ilustrativo**: no presentar la forma del tronco como dato. El color de L1/L2 sale del mosaico ortofoto (`Mundo.ortoGrueso`): hoy es algo verde-gris y uniforme y hay «salto» entre niveles (pendiente M3: dither por píxel o fundido).

## Terreno (tileset 3D Tiles, [ADR-0015](../../../doc/adr/0015-escena-en-3d-tiles.md))
El terreno ya no lo construye el motor: lo genera `tuberia/tiles3d/genera.mjs` (hojas de 128 m con paso de 1 m, niveles de 1, 2 y 4 m, simplificación con meshoptimizer y faldones de `max(1,5 m, 2 × error)`) y lo carga 3DTilesRendererJS (`04b_escena3d.js`). El `geometricError` de cada nivel lo declara el generador. La exageración vertical es la escala del grupo (`uExag`); el color del suelo, NDVI y ortofoto se reinyectan por `onBeforeCompile` en `04d_sombreado_tiles.js`. La escena de siempre (`04_terreno.js`, `Terreno`) se borró ([ADR-0021](../../../doc/adr/0021-se-retira-la-salida-artefacto-y-la-escena-de-siempre.md)).

## Materiales y sombreadores
- Se parte de `MeshLambertMaterial`/`PointsMaterial` y se inyecta GLSL con **`onBeforeCompile`** (terreno, copas, troncos, viento del follaje, sombra de nubes, hielo). Mantener las inyecciones pequeñas y con uniformes compartidos (`UN` en `04d_sombreado_tiles.js`).
- Color del suelo, NDVI y ortofoto se componen **por píxel en la GPU** (textura de suelo de la tesela + NDVI global de 2 fechas); no volver a recolorear vértices en CPU.
- Suelo abierto con detalle de ortofoto ([ADR-0007](../../../doc/adr/0007-suelo-abierto-de-la-ortofoto.md)): lo oscuro (copas/sombras) se deja igual; no pintar sombras como suelo.
- Nube: un `THREE.Points` por tesela, orden barajado → `setDrawRange(0, f·n)` es el LOD; al bajar `f`, subir el tamaño del punto (`size *= 1/√f`).

- **Color (three 0.186.1, [ADR-0016](../../../doc/adr/0016-actualizacion-de-three.md)):** la luz se calcula en lineal y la salida es sRGB. Lo escrito a mano (colores por vértice o instancia, literales GLSL, multiplicadores) va en sRGB y se pasa a lineal al entrar en la luz: `setRGB(r, g, b, SRGB)`, `texColor()` para lienzos que son color, `colorVertSRGB(sh)` en el `onBeforeCompile`, `sRGBTransferEOTF()` para literales. Lo que se toca después de `colorspace_fragment` (al final, junto a `dithering_fragment`) ya está en sRGB. Un `ShaderMaterial` propio termina en `#include <colorspace_fragment>`. Las texturas de datos (ruido, NDVI) van sin espacio de color.

## Límites de three (0.186.1, WebGL2)
No hay `logarithmicDepthBuffer` aquí (se usa `near` dinámico, `far = max(5000, 4·EXT)`); `InstancedMesh` calcula su esfera con las instancias **una vez** (las que se recolocan llevan `frustumCulled = false`); lo transparente de dos caras se dibuja en dos pasadas salvo `forceSinglePass`; Lambert es por fragmento; sin `WebGPU` (el motor usa `WebGLRenderer`); en VR se mueve el rig. Un `#include <trozo>` que se parchee debe existir en la three instalada (lo vigila `web.test.js`). Cada geometría/textura/material nueva **lleva su `dispose()`**.

## Lista antes de dar por buena una geometría
- [ ] Triángulos por nivel dentro de su cifra; instancias con `count` ajustado, no con el máximo.
- [ ] Normales sin costura entre teselas (margen de 1 celda); sin grietas entre niveles.
- [ ] Sombras: el diseño preveía una por árbol en L0–L1 y ninguna en L2 (**sin comprobar en el código**; mírelo antes de afirmarlo).
- [ ] Sin geometría nueva por fotograma (reutilizar y `setDrawRange`).
- [ ] Medido / deducido / ilustrativo bien rotulado en la página.
- [ ] Recuentos medidos con `?debug` o SwiftShader y anotados; fps = **no probado** salvo dispositivo real.
