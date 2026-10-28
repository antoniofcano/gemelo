---
name: modelado-3d
description: Experta en modelado 3D para el motor del gemelo (three.js r128): presupuestos de triángulos por nivel, silueta del olivo (L0/L1/L2), instanciado, mallas de terreno y faldones de costura, materiales y sombreadores con onBeforeCompile, normales, sombras y límites de r128. Úsala al tocar geometría, materiales, niveles de detalle o el aspecto de olivos, terreno, nube o paisaje.
---

# Modelado 3D en el gemelo

El motor **genera toda la geometría por procedimiento** (no hay `GLTFLoader` ni ficheros de modelo). Todo lo que sigue sale de [ARCHITECTURE.md](../../../doc/sistema/ARCHITECTURE.md), [ADR-0002](../../../doc/adr/0002-niveles-de-detalle.md) y de `src/`. Antes de cambiar nada: [skill `medir`](../medir/SKILL.md). Cifras del código, no del diseño: manda el código.

## Presupuestos (por fotograma, de diseño)
≤ 1,7 M triángulos · ≤ 1,4 M puntos · ≈ 250 llamadas · ≈ 350 MB. Un cambio que sube cualquiera se mide antes y después y se explica.

## El olivo en tres niveles (`07b_arboles.js`, `06_arboles.js`, `07_follaje.js`)
| Nivel | Qué es | Coste | Tope |
|---|---|---|---|
| L0 | modelo completo en **celdas de 64 m** alrededor del foco: copa de **8 radios medidos** (`r8`), troncos y ramas (tubos, forma **ilustrativa** de 2–3 pies), hojas-sprite del LiDAR, corteza, frutos/flores | ≈ 800 tri | `MAX0 = 450` |
| L1 | `InstancedMesh` con **4 prototipos** (`NP1`) de copa abombada + tronco, color e inclinación por instancia | ≈ 170 tri | `MAX1 = 3000` |
| L2 | `InstancedMesh` con **2 prototipos** (`NP2`) copa de muy pocos polígonos (el diseño preveía un icosaedro aplastado) | ≈ 30 tri | `MAX2 = 16000` |
| L3 | nada: ya está en la ortofoto | 0 | — |
Cambio de nivel a `U1 = 460` m y `U2 = 1600` m con histéresis; `TOPE_TRI = 550000` reparte entre niveles. La copa es **medida**; el tronco, **ilustrativo**: no presentar la forma del tronco como dato. El color de L1/L2 sale del mosaico ortofoto (`Mundo.ortoGrueso`): hoy es algo verde-gris y uniforme y hay «salto» entre niveles (pendiente M3: dither por píxel o fundido).

## Terreno (`04_terreno.js`)
Una malla por tesela, **topología compartida** por nivel: L0 1 m (66.049 vértices, 131.072 tri), L1 2 m, L2 8 m. Las costuras se tapan con **faldones verticales de 1,5 m** (más simple que unir vértices). Las alturas se muestrean en una retícula de metros enteros para que teselas vecinas compartan vértices del borde. La exageración vertical es el uniforme `uExag`; **no se recalculan vértices al moverla** (las normales se corrigen en el sombreador).

## Materiales y sombreadores
- Se parte de `MeshLambertMaterial`/`PointsMaterial` y se inyecta GLSL con **`onBeforeCompile`** (terreno, copas, troncos, viento del follaje, sombra de nubes, hielo). Mantener las inyecciones pequeñas y con uniformes compartidos (`UN` en `04_terreno.js`).
- Color del suelo, NDVI y ortofoto se componen **por píxel en la GPU** (textura de suelo de la tesela + NDVI global de 2 fechas); no volver a recolorear vértices en CPU.
- Suelo abierto con detalle de ortofoto ([ADR-0007](../../../doc/adr/0007-suelo-abierto-de-la-ortofoto.md)): lo oscuro (copas/sombras) se deja igual; no pintar sombras como suelo.
- Nube: un `THREE.Points` por tesela, orden barajado → `setDrawRange(0, f·n)` es el LOD; al bajar `f`, subir el tamaño del punto (`size *= 1/√f`).

## Límites de three r128
No hay `logarithmicDepthBuffer` aquí (se usa `near` dinámico, `far = max(5000, 4·EXT)`); `InstancedMesh` sí; sin `WebGPU`; en VR no se puede desplazar el espacio de referencia (se mueve el rig). Cada geometría/textura/material nueva **lleva su `dispose()`**.

## Lista antes de dar por buena una geometría
- [ ] Triángulos por nivel dentro de su cifra; instancias con `count` ajustado, no con el máximo.
- [ ] Normales sin costura entre teselas (margen de 1 celda); sin grietas entre niveles.
- [ ] Sombras: el diseño preveía una por árbol en L0–L1 y ninguna en L2 (**sin comprobar en el código**; mírelo antes de afirmarlo).
- [ ] Sin geometría nueva por fotograma (reutilizar y `setDrawRange`).
- [ ] Medido / deducido / ilustrativo bien rotulado en la página.
- [ ] Recuentos medidos con `?debug` o SwiftShader y anotados; fps = **no probado** salvo dispositivo real.
