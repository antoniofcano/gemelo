# Materiales: la fábrica `nucleo/materiales` y sus sombreadores (MU5-0)

La fábrica de materiales del motor y la lista de trabajo de MU5 para los materiales. Viene de la F1 de [MULTIVIEW §4](MULTIVIEW.md#4-el-plan-por-fases) (la fábrica `02i_materiales.js`, 2026-11-04) y de los «tres pájaros en MU5» del [ADR-0033](../adr/0033-mundos.md): cada módulo del exterior sale a TypeScript, como componente, y con sus materiales por esta fábrica, que ya trae la variante TSL apagada. El cambio de renderer queda para MU6, en un solo paso ([ADR-0031](../adr/0031-migrar-al-webgpurenderer-con-multiview.md)).

- **Código:** `apps/web/src/nucleo/materiales.ts`. `apps/web/motor/02i_materiales.js` queda como talón (`var Materiales = Nucleo.creaMateriales({ … })`) con el mismo nombre y el mismo comportamiento.
- **Pruebas:**
  - Vitest: `apps/web/src/nucleo/materiales.test.ts`, con dobles de THREE y, en una prueba, con `three/webgpu` y `three/tsl` de verdad.
  - Node: `pruebas/guardianes/materiales_f1.test.js` (equivalencia con el three de verdad, los nombres de los sitios del motor, el trinquete del legado y el de `src/`) y `pruebas/guardianes/a2c.test.js`.
- **Sin cambio visible:** hoy la fábrica da exactamente los materiales de antes. **No probado en un navegador ni en el Quest:** en esta tarea no se abrió Chrome.

## 1. Inventario de los sombreadores propios (2026-11-06)

Es la lista de trabajo de MU5-n: el tercer commit de cada módulo escribe aquí su variante TSL. Puesta al día respecto a [MULTIVIEW §2.2](MULTIVIEW.md#22-los-sombreadores-propios-26-por-orden-de-migración) (recuento del 2026-11-04). La dificultad en TSL (**B** ≤ ½ día, **M** 1 día, **A** 2-4 días) es la de allí y es una **[ESTIMACIÓN]**.

### 1.1 Lo que significa cada columna

- **Nombre:** la clave del material en la fábrica, que también será la de su variante TSL. Los sitios sin nombre aún no pasan por la fábrica.
- **Niebla:** si el material recibe la de la escena (`scene.fog`).
  - Los materiales de three (Lambert, Basic, Standard, Points, Line) la reciben por sus trozos de GLSL. En TSL, el `WebGPURenderer` la aplica solo a los `NodeMaterial` si `fog` es verdadero.
  - Un `ShaderMaterial` nace con `fog: false` y ninguno del motor la activa.
  - El valor de la niebla lo mueve `15_tiempo` en su sitio, solo en el exterior.
- **NDVI:** si el sombreador lee el NDVI (`uNdviMap`, `uG`). «CPU» quiere decir que el NDVI decide colores o posiciones en JavaScript y el sombreador no lo ve.
- **Viento y hora:** si el sombreador lee uniformes que mueve el tiempo.
  - Viento: `uViento` de `15_tiempo` (`uT`, `uAmp`, `uDir`) o `uLluvia.uViento`.
  - Hora: nubes y helada por `uSombra`, la luz del día por `uLuz` y `tMundo`.
  - «Tinte» quiere decir que `15_tiempo` cambia en cada fotograma el `color` del material (`matHojaG`, `matHojaP`, `matCorteza`, `matOrto`, `matSuelo` y el material de la nube). Es un uniforme estándar y vale igual en TSL.

### 1.2 Los trozos compartidos

Son tres. Pasados a TSL, desbloquean a casi todos:

- **`colorVertSRGB`** (`03_escena.js`): el color por vértice o por instancia, escrito en sRGB, pasa a lineal.
- **`parcheTiempo` y `GLSL_SOMBRA`** (`15_tiempo.js`; desde MU5-n, A3-4, `src/mundos/exterior/tiempo-parche.ts`): la sombra de nubes (un ruido que deriva), la helada y, con `viento`, el vaivén por posición. Incluye `colorVertSRGB`. **En TSL, `nodosTiempo`** (§11.1): los mismos nodos para su variante y para quien completa su luz con ellos (el terreno, el catálogo, los olivos generados, las matas y las piedras).
- **`parche` del terreno** (`04d_sombreado_tiles.js`).

### 1.3 La tabla

| # | Fichero | Nombre | Material de partida | Qué hace el parche | Niebla | NDVI | Viento | Hora | Dif. |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `04d_sombreado_tiles.js` → `src/mundos/exterior/terreno.ts` (MU5-n, A3-1a) | `terreno` | Lambert + parche, uno por glb (`define`/`crea`, dueño `terreno-sombreado`) | suelo, ortofoto, NDVI de 2 fechas, mosaico, relieve fino (`dFdx`), modos Ortofoto/NDVI, `uExag` | sí | **sí** (`uNdviMap`, `uG`) | no | nubes, helada | **A** · TSL **completa (A4-0), sin capturas**, apagada; compila sin GPU (§1.5) |
| 2 | `apps/web/src/mundos/exterior/tiempo-parche.ts` (antes `15_tiempo.js`) | `parche-tiempo` | `parcheTiempo` sobre `matHojaG`, `matHojaP`, `matCorteza` (con viento), `matSuelo`, `matOrto` y la nube (sin viento) | sombra de nubes, helada, color sRGB, vaivén | sí | no | **sí** (follaje) | nubes, helada, tinte | M — **TSL parcial (MU5-n, A3-4):** `define` con clásico y TSL apagada; sus nodos completan la luz de las filas 1, 6, 7, 11 y 12 (§11) |
| 3 | `apps/web/src/mundos/exterior/tiempo-cielo.ts` (antes `15_tiempo.js`) | `nubes` | `ShaderMaterial` | manchas de nube de cara a la cámara en una sola malla; paleta del ocaso con `?suelo=fotos` | no | no | deriva (en la CPU) | ocaso | M — **hecho (MU5-n, A3-4):** TSL apagada (§11) |
| 4 | `apps/web/src/mundos/exterior/tiempo-lluvia.ts` (antes `15_tiempo.js`) | `lluvia` | `ShaderMaterial` (`LineSegments`) | rayas que caen en una caja que sigue al blanco de la cámara | no | no | **sí** (`uViento`) | `uT` | B — **hecho (MU5-n, A3-4):** TSL apagada (§11) |
| 5 | `apps/web/src/mundos/exterior/tiempo-barrera.ts` (antes `15_tiempo.js`) | `barrera` | `ShaderMaterial` | película de luz de la linde con pulso | no | no | no | `uT` | B — **hecho (MU5-n, A3-4):** TSL apagada (§11) |
| 6 | `apps/web/src/mundos/exterior/hierba.ts` (antes `21_suelo.js`) | `matas` | Lambert + parche (instanciado, recorte alfa) | atlas por instancia, viento, nubes, helada | sí | CPU (colocación) | **sí** | nubes, helada | M — **TSL completa (A4-0), sin capturas**, apagada; compila sin GPU (§11.1) |
| 7 | `apps/web/src/mundos/exterior/hierba.ts` (antes `21_suelo.js`) | `piedras` | Lambert + parche (instanciado) | vetas, granos y liquen por ruido, nubes | sí | no | no | nubes | M — **TSL completa (A4-0), sin capturas**, apagada; compila sin GPU (§11.1) |
| 8 | `apps/web/src/mundos/exterior/suelo-fondo.ts` (antes `04e_suelo_fondo.js`) | `suelo-fondo` | Lambert + parche | mosaico sRGB → lineal | sí | no | no | tinte de `matSuelo` (indirecto) | B — **hecho (MU5-n, A3-1b):** `define("suelo-fondo", { clasico, tsl })`, la TSL apagada |
| 9 | `05_nube.js` | `nube-lidar` | Points + `parcheTiempo` | nube LiDAR con sombra de nubes | sí | CPU (tinte) | no | nubes, tinte | M (puntos de 1 px, MULTIVIEW §2.3) — **TSL completa (A4-0), sin capturas**, apagada: con su espejo de sprites; compila sin GPU (§10.1, §5) |
| 10 | `mundos/exterior/arboles-l0.ts` (antes `06_arboles.js`) | `copa-l0`, `tronco-l0` | Lambert + `colorVertSRGB` | color por vértice en sRGB | sí | no | no | no | B — **hecho (MU5-n, A3-2b):** `define` con su clásico y su TSL apagada (`MeshLambertNodeMaterial`, `vertexColor()` pasado a lineal) |
| 11 | `apps/web/src/mundos/exterior/catalogo.ts` (antes `07a_catalogo.js`) | `copa-l1`, `tronco-l1` | Lambert + `parcheTiempo` (instanciado) | silueta rota por ruido, motas, envés en el borde | sí | no | no | nubes, helada | M / B — **TSL completa (A4-0), sin capturas**, apagada; compila sin GPU (§8) |
| 12 | `apps/web/src/mundos/exterior/generados-sombreado.ts` (antes `07ab_generados.js`) + `apps/web/olivo/materiales.js` | `gen-olivo` | Standard + `encadena` | luz (`parcheTiempo` en el mundo), color por lote en sRGB, fundido por tramado (`gl_DrawID`, `BatchedMesh`) | sí | no | no | nubes, helada | **A** — **TSL completa (A4-0), sin capturas**, apagada; compila sin GPU (§8) |
| 13 | `apps/web/src/mundos/exterior/generados-sombreado.ts` (×2: las sombras de las hojas y las de las mallas por lotes) | `gen-profundidad` | `MeshDepthMaterial` + `encadena` | el mismo fundido en la sombra | — | no | no | no | **A** (sin conversión automática) — **TSL completa (A4-0)**, sin verificar su vía en el `WebGPURenderer` (§8) |
| 14 | `mundos/exterior/lejanos.ts` (antes `07ac_lejanos.js`) | `impostor-lejano` | Lambert + parche (recorte alfa) | impostores de 4 variantes, normales del atlas, luz y fundido de `Generados` | sí | no | no | nubes, helada | **A** — **TSL (A4-0), sin capturas**, apagada; compila sin GPU (§9.1) |
| 15 | `mundos/exterior/lejanos.ts` (antes `07ac_lejanos.js`) | `impostor-sustituto` | Lambert + parche | sustituto por variante y vista (con silueta, `texelFetch`) | sí | no | no | no | **A** — **TSL (A4-0), sin capturas**, apagada; compila sin GPU (§9.1) |
| 16 | `14_historia.js` | `resalte-parcela` | Basic + parche | resalte que sigue `uExag` (`UN.uExag`) | sí | no | no | no | B |
| 17 | `apps/web/src/mundos/exterior/vida.ts` (antes `16_vida.js`) | `estela` | `ShaderMaterial` | estela del quad y del dron por edad (`uNow`) | no | no | no | no | B — **TSL apagada (MU5-n, A3-5):** `define("estela", { clasico, tsl })` (`MeshBasicNodeMaterial`); §12 |
| 18 | `18_paisaje.js` | `arroyo` | `ShaderMaterial` | agua del arroyo cuando llueve | no | no | no | `uT`, `uLuz` | B — **hecho (MU5-n, A3-3):** `define("arroyo", { clasico, tsl })`, la TSL apagada (§10.1) |
| 19 | `19_balizas.js` | `baliza` | `ShaderMaterial` (uno por baliza) | columna con pulso | no | no | no | `uT` | B — **hecho (MU5-n, A3-3):** `define("baliza", { clasico, tsl })`, la TSL apagada (§10.1) |
| 20 | `apps/web/src/mundos/exterior/huellas-polvo.ts` (antes `22b_huellas_polvo.js`) | `huella` | `ShaderMaterial` (instanciado) | huellas que se borran con la edad | no | no | no | no | M — **TSL parcial, apagada (MU5-n, A3-5):** `define` con clásico y TSL (`MeshBasicNodeMaterial`); §12 |
| 21 | `apps/web/src/mundos/exterior/huellas-polvo.ts` (antes `22b_huellas_polvo.js`) | `polvo` | `ShaderMaterial` (puntos) | polvo | no | no | CPU | `uLuz` | M (puntos) — **TSL completa (A4-0), sin capturas**, apagada: con su espejo de sprites; compila sin GPU (§12.1, §5) |
| 22 | `apps/web/src/mundos/exterior/estacion.ts` (antes `23_estacion.js`) | `fruto-flor` | `ShaderMaterial` (puntos) | flores y aceitunas por BBCH | no | CPU (vigor) | no | `uLuz` | M (puntos) — **TSL completa (A4-0), sin capturas**, apagada: con su espejo de sprites; compila sin GPU (§11.1, §5) |
| 23 | `mundos/comun/avatares.ts` (antes `26b_avatares.js`) | `vrm-fundido` | MToon + `encadena` | fundido por tramado | sí (MToon) | no | no | no | M-A (`MToonNodeMaterial`) — **TSL parcial, apagada (MU5-n, A3-6a):** `MeshStandardNodeMaterial` con el tramado por `maskNode`, sin el sombreado toon de MToon (§13) |
| 24 | `apps/web/src/mundos/comun/vr.ts` (antes `29_vr.js`) | `vineta-vr` | `ShaderMaterial` | viñeta de confort | no | no | no | no | B — **hecho (MU5-n, A3-6c):** `define("vineta-vr", { clasico, tsl })`, la TSL apagada (§14) |
| 25 | `mundos/comun/presencia.ts` (antes `38_presencia_compartida.js`) | `nombres-presencia` | `ShaderMaterial` (instanciado) | nombres de un atlas, de cara a la cámara | no | no | no | no | M (de cara a la cámara **por ojo**) — **TSL parcial, apagada (MU5-n, A3-6a):** `MeshBasicNodeMaterial` con el atlas por instancia; falta ponerlo de cara a la cámara por ojo (§13) |
| 26 | `44_lindes.js` | `lindes-acerca` | `LineMaterial` + parche | lindes acercadas a la cámara | sí | no | no | no | M (`Line2NodeMaterial`) — **TSL completa para la pantalla (A4-0), sin capturas**, apagada; compila sin GPU; el ancho por ojo no hace falta (§10.1) |
| — | `nucleo/materiales.ts` | `ejemplo-tsl` | Basic + parche / `MeshBasicNodeMaterial` | el ejemplo de la ruta (§3): color · `uBrillo` | sí | no | no | no | hecho |

### 1.4 Los recuentos

- **Por la fábrica:** 32 sitios con nombre (recuento tras A3-4, sobre A3-2b y A3-3).
  - 24 `define` (MU5-n): `terreno` (A3-1a, `src/mundos/exterior/terreno.ts`), `suelo-fondo` (A3-1b, antes el `parchea` de `04e`, en `mundos/exterior/suelo-fondo.ts`), `copa-l1` y `tronco-l1` (A3-2a, antes los `parchea` de `07a`, en `mundos/exterior/catalogo.ts`), `gen-olivo` y `gen-profundidad` (A3-2a, antes los 3 `encadena` de `07ab`, en `mundos/exterior/generados-sombreado.ts`; `gen-profundidad` en dos sitios), `copa-l0` y `tronco-l0` (A3-2b, antes los `parchea` de `06`, en `mundos/exterior/arboles-l0.ts`), `impostor-lejano` e `impostor-sustituto` (A3-2b, antes los `parchea` de `07ac`, en `mundos/exterior/lejanos.ts`), `nube-lidar`, `arroyo`, `baliza` y `lindes-acerca` (A3-3, antes en `05`, `18`, `19` y `44`; §10) y (A3-4) `parche-tiempo`, `nubes`, `lluvia` y `barrera` (antes fuera, en `15_tiempo`), `matas` y `piedras` (antes fuera, en `21_suelo`) y `fruto-flor` (antes el `sombreador` de `23`), cada uno con su clásico y su TSL (parcial: §1.5, §8 y §11).
  - 1 `parchea`: `14`.
  - 1 `encadena`: `26b`.
  - `materiales_f1.test.js` los cuenta en `motor/` y en `src/mundos/` (los `define` con un literal o con su constante `MATERIAL_…`).
  - 5 `sombreador`: `16`, `22b` ×2, `29` y `38`.
  - Los cuenta por nombre `Materiales.inventario()` al cargar.
- **Fuera de la fábrica:** 1 sitio, que vigila el trinquete de `materiales_f1.test.js`: el `encadena()` de la biblioteca de olivos, que es su punto único. Los de `15_tiempo` (1 parche y 3 `ShaderMaterial`) y `21_suelo` (2 parches) pasaron a la fábrica en el segundo commit de su MU5-n (A3-4).
- **Dependen de la niebla:** todos los que parten de un material de three (filas 1, 2, 6-16, 23 y 26). Ningún `ShaderMaterial` depende de ella.
- **Dependen de la hora o el tiempo:** las filas 1-9, 11, 12, 14, 18, 19, 21 y 22.
- **Dependen del NDVI dentro del sombreador:** solo el terreno (fila 1).
- **Dependen de `Estado.exag`:** el terreno (`UN.uExag`) y el resalte (fila 16). Ver §5, «La `exag`».

### 1.5 La variante TSL del terreno (fila 1): lo que hay y lo que falta (MU5-n, A3-1a, 2026-11-06; completada en A4-0, 2026-11-07)

Vive junto al clásico en `apps/web/src/mundos/exterior/terreno.ts` (`tslTerreno`, `define("terreno", { tsl })`) y, para el suelo de fotos, en `suelo-fotos.ts` (`SueloFotosPuro.tsl`, junto a su `glsl()`). Está **apagada**: solo la daría la fábrica con el `WebGPURenderer` (MU6). Desde A4-0 lleva **todo lo que hace el parche clásico**. **No se puede decir que sea equivalente** hasta las capturas clásico frente a TSL de MU6.

- **Lo que lleva:**
  - el color de la tierra (el suelo de la tesela, `uSue`, o el mosaico, `uMos`, con `uTiene`);
  - **(A4-0) el detalle de la ortofoto en el suelo abierto** (`uDet`, `uDetK`, `uBias2`, `uGnd`): abierto, rodada, tono, suelo desnudo y caminos, su dirección por el gradiente de claridad, surcos, estrías, gravilla y hojarasca, con dos funciones con su `if (uDet > 0,5)`, como el clásico;
  - la hierba según el NDVI del suelo (`uG`) con su cobertura, su vigor, el ruido de la tesela (`uRui`) y sus motas; el material de tierra en cuatro octavas;
  - **(A4-0) el relieve fino**: `pBump` como `normalNode`, con las derivadas (`dFdx`/`dFdy`) de `hSuelo` y `uBumpK`;
  - **(A4-0) el suelo de fotos** (`?suelo=fotos`): las mismas cuentas que el GLSL de 04f (la repetición estocástica con `textureGrad` sobre el array, las variantes, las dos clases que más pesan, las piedras sueltas y su relieve), con los MISMOS `uFot`, `uFotK` y `uRue`;
  - el paso a lineal y el tinte del día (`materialColor`, el MISMO `matSuelo.color`); tras la luz, el modo Ortofoto, el grano (desde A4-0, con su `(1 − 0,6 · abierto)`), la sombra de nubes y la escarcha (los nodos del tiempo, si se dan), la capa NDVI y **(A4-0) la vista de depuración** (`uDetDbg`); la exageración por `UN.uExag` y la niebla (`fog = true`).
- **Lo que difiere:**
  - el color ancho (`uGnd`) se lee siempre, también lejos (el clásico, solo con `uDet = 1`): una lectura más por píxel, el mismo resultado. Con el suelo de fotos, el campo del ruedo (`uRue`) se lee fuera del `if (fotA > 0,003)`, para que sus derivadas implícitas estén definidas (three apaga en WGSL el aviso de uniformidad de las derivadas, `diagnostic(off, derivative_uniformity)`, no el problema);
  - el bucle de las dos clases que más pesan va desenrollado con `select`, y `FOT_M[c]` y `fotNiv(c, i)`, con `select` por clase. Los `select` con lecturas en sus ramas salen como `if/else` en el WGSL (comprobado), así que la dirección del camino solo se lee donde hay camino cerca, como el clásico.
- **Dos hallazgos de A4-0 que valen para toda variante TSL con texturas** (en `nucleo/materiales.ts` y `prueba-tsl.test.ts`):
  1. **`onObjectUpdate` no vale en una textura.** `TextureNode.setup()` (three r186) vuelve a poner su `updateType`: con el backend WebGPU el update se pierde y el sombreador se queda con la textura del primer dibujo; con el WebGL, sustituye al de three (el de la matriz y `flipY`). La TSL de A3-1a lo usaba: el terreno se habría quedado con el mosaico y el ruido neutro aunque llegaran los datos de la tesela. Se arregla con `MaterialesPuro.releeTextura(nodo, lee)`, que usa `updateBefore` (three no lo toca), en el nodo que se muestrea (`sample`, `bias`, `grad` y `depth` clonan el nodo y el clon no lleva el update).
  2. **three junta en una sola ligadura las texturas que al construir son la misma** (el mismo `uuid`). En el terreno empiezan siendo la misma muchas (el ruido neutro en `uRui` y `uGnd`; el vacío en `uSue`, `uMos`, `uG` y `uNdviMap`): después cada una seguiría la textura de la primera. Por eso cada textura se construye con **su hueco** (una textura de 1 píxel por nombre, la misma para todos los glb, que suelta `libera()`) y `releeTextura` pone la de verdad antes de dibujar.
  - Además, la TSL de A3-1a creaba una textura neutra por glb que nadie soltaba; ahora es una para todos y la suelta `libera()`.
- **Comprobado (solo Node):** en Vitest, con `three/webgpu` y `three/tsl` de verdad, el `MeshLambertNodeMaterial` se construye con `colorNode`, `normalNode` y `outputNode`, el `color` del maestro y la niebla, y **el grafo compila** con los dos constructores de three (`WGSLNodeBuilder` y `GLSLNodeBuilder`, con `apps/web/src/nucleo/prueba-tsl.ts`): sin y con los nodos del tiempo, y con `?suelo=fotos` (con `textureSampleGrad` sobre un `texture_2d_array`). Que cuando llegan los datos de la tesela el sombreador lee la textura nueva, y que el suelo de fotos lee los mismos `uFot` y `uRue` (`terreno.test.ts`).
- **No comprobado:** que el WGSL y el GLSL los acepte un compilador de verdad (Tint, naga o el del controlador: `prueba-tsl.ts` escribe el sombreador, no lo valida), ni que se vea igual (capturas de MU6, en el banco), ni el coste en la tarjeta.

## 2. La API, y por qué un registro

```ts
const M = Nucleo.creaMateriales({ THREE, render: Render, nodos?, busqueda, msaa, almacen, consola });

M.define(nombre, { clasico?(opc, { THREE, nombre }), tsl?(opc, { THREE, TSL, nombre }) })  // registra; se puede llamar dos veces (clásico y luego TSL)
M.crea(nombre, opc?, dueño?)          // el clásico; con el WebGPURenderer y variante, el TSL
M.estandar("MeshStandardMaterial", opciones?, dueño?)   // tal cual: vale en los dos renderers
M.de(dueño)                           // { crea, estandar, parchea, encadena, sombreador, adopta, libera } con el dueño puesto
M.libera(dueño)                       // dispose() de lo de ese dueño, y nada más; devuelve cuántos
M.ruta(nombre) / M.estado / M.estadoAhora() / M.cobertura() / M.duenos()
// lo de siempre (F1, AG-2.1, AG-2.2), igual que antes:
M.parchea(mat, nombre, fn, clave?)  M.encadena(mat, nombre, fn, clave, propia?)  M.sombreador(nombre, opciones)
M.nuevo(nombre, fabricaTsl)  M.inventario()  M.recorte(mat)  M.recortes(on)  M.a2c  M.cartulina  M.apuntaCartulina(...)
```

**Se eligió un registro por nombre** (`define` y `crea`) frente a un método por material (`materiales.suelo(opc)`, `materiales.follaje(opc)`…). Los motivos:

- **El nombre ya es la clave.** Los 22 sitios de la fábrica ya pasan un nombre literal y único: lo exige `materiales_f1.test.js`. F1 lo escogió como la clave de la variante TSL.
- **Cada módulo trae lo suyo.** Con un método por material, `nucleo/materiales.ts` tendría que conocer el sombreador de cada módulo, así que importaría de `mundos/` (prohibido por MUNDOS §1) o crecería con cada MU5-n. Con el registro, el sombreador vive con su módulo y la fábrica no cambia.
- **Una sola fuente por material** (MULTIVIEW §2.2). El clásico y el TSL están en el mismo `define`, uno al lado del otro.
- **La cobertura se puede contar.** El criterio de MU5 («cada material con sombreador propio tiene su variante TSL») es `cobertura()`: qué nombres tienen ya `tsl`.

**Los materiales estándar no se registran:** `estandar(clase, opciones)` hace `new THREE[clase](opciones)` por las dos rutas. El `WebGPURenderer` convierte solo los materiales clásicos sin parche en su `NodeMaterial` (MULTIVIEW §2.1). `estandar` rechaza `ShaderMaterial` y `RawShaderMaterial`.

**Los sitios del legado** (`parchea`, `encadena`, `sombreador`) siguen igual.

- Si alguien registró la variante TSL de su nombre (con `nuevo` o con `define(nombre, { tsl })`) y corre el `WebGPURenderer`, esa variante recibe el material clásico (o las opciones) y devuelve el suyo.
- Si no, sale el de siempre: la misma función de parche, sin envolverla, porque three usa su texto como clave del programa.

## 3. El ciclo de vida: `libera(dueño)`

Es el ciclo de vida de los tres pájaros. Un mundo o un componente pide sus materiales con `Materiales.de(dueño)`, y `libera(dueño)` llama a `dispose()` sobre todo lo de ese dueño y solo sobre eso:

- Lo creado sin dueño (el legado de hoy) no se toca: lo libera quien lo creó, como siempre.
- Lo liberado sale también de la lista de los recortes alfa, así que `recortes()` ya no lo toca.
- Llamarlo dos veces no libera dos veces.

Quién lo llama:

- **Un mundo:** `90_final.js` lo encadena en el `contexto` del gestor. `base.limpia(...)` llama a `Materiales.libera(base.id)` al liberar el mundo, junto a `Componentes.liberaMundo`.
- **Un componente:** pide `Materiales.de(<su id>)` y, en su `n.limpia`, llama a `.libera()`.

Desde MU5-n (A3-1a) pide con dueño el terreno (`terreno-sombreado`). **Lo que el dueño suelta por su cuenta** (un glb que se va: `SombreadoTiles.suelta` hace `dispose()`) sale solo de su lista: la fábrica escucha el evento `dispose` de three al guardarlo, para que la lista no crezca durante la sesión; un doble sin `addEventListener` se queda hasta `libera(dueño)`. Las texturas no son de la fábrica: las libera quien las crea.

**La variante de ejemplo** (`ejemplo-tsl`, `DEF_EJEMPLO`) demuestra la ruta y está apagada:

- El clásico es un `MeshBasicMaterial` con un parche que multiplica el color por `uBrillo`.
- El TSL es un `MeshBasicNodeMaterial` con `colorNode = color(hex).mul(uniform(brillo).onObjectUpdate(…))`.
- Los dos leen el mismo `{ value }`. Así es como un módulo comparte un uniforme entre las dos variantes.
- Está registrado, pero nadie lo pide y su TSL solo se usaría con el `WebGPURenderer`.
- Su prueba lo construye con `three/webgpu` y `three/tsl` de verdad, en Node.

## 4. Cómo se elige el renderer

### 4.1 Hoy, MU5

- **Quién elige.** Solo `nucleo/render.ts` elige el renderer y lo publica en `Render.tipo`. Esta fábrica no lo elige: lo lee en cada material.
- **Cómo se pide.** `?renderer=webgl|webgpu` es el nombre de MU5 y MU6, y manda. `?render=clasico|nuevo` (el de F1, ADR-0031) sigue valiendo igual: `webgpu` = `nuevo` y `webgl` = `clasico`. Un valor desconocido avisa y se queda en el clásico.
- **Qué pasa hoy con `?renderer=webgpu`.** El motor solo monta el `WebGLRenderer` (`03_escena.js`), y `creaRender` decide con `hayNuevo = false`. Así que:
  - `Render.pedido` es `"nuevo"` y `Render.tipo` sigue siendo `"clasico"`;
  - `Render` avisa de que el `WebGPURenderer` está reservado;
  - la fábrica da los materiales clásicos y avisa una vez, porque TSL no funciona sin `WebGPURenderer`. Con él, al revés, no se llama ningún `onBeforeCompile`.
- **La TSL solo sale con las tres cosas:** que `Render.tipo` sea `"nuevo"`, que `nodos()` dé `three/webgpu` y `three/tsl`, y que el material tenga variante. Si corre el nuevo y un material no tiene variante, sale el clásico y se avisa una vez por nombre (MUNDOS §6).

### 4.2 En MU6 (decisión de esta tarea, para la que la escribe)

1. **El renderer se elige al arrancar y no cambia con la sesión abierta**, como en F5 de MULTIVIEW. `nucleo/render.ts` es el único que lo crea:
   - con `"nuevo"`, `import("three/webgpu")` y `import("three/tsl")` dinámicos, `new WebGPURenderer({ canvas, antialias, forceWebGL: true, multiview: true })` y `await init()` (`Render.arranca` ya lo espera);
   - con `"clasico"`, el `WebGLRenderer` de hoy.

   `nodos()` de la fábrica devuelve esos dos módulos ya cargados. Así **`three/webgpu` y `three/tsl` solo entran en el paquete como un trozo aparte que se carga con `?renderer=webgpu`**, y la build clásica no crece. Hoy no entran en ninguna build: nadie los importa (comprobado en las dos builds de esta tarea, §6).
2. **`GEMELO_BUILD` decide el paquete y `?renderer=` el renderer dentro de él.**
   - `GEMELO_BUILD=pantalla` (three) puede llevar los dos renderers. En MU6, `hayNuevo = true` en esa build.
   - `GEMELO_BUILD=vr` (super-three) lleva solo el `WebGLRenderer` con `multiviewStereo`, y para ella `hayNuevo` sigue en `false`: `?renderer=webgpu` avisa y se queda en el clásico. Es el plan de MULTIVIEW §4.1: el Quest pasa a TSL solo cuando el `WebGPURenderer` de three haga bien el multiview, y entonces se retira super-three.
   - `Render.build` (`__GEMELO_BUILD__`) es el dato que `creaRender` usa para decidir `hayNuevo`.
   - `?build=pantalla|vr` (`eligeBuild`, `builds.mjs`) sigue eligiendo qué build carga la página. Va antes que `?renderer=` y no lo sustituye.
3. **El valor por defecto cambia en MU6**, tras las capturas iguales por material y la medida (PLAN, MU6): primero `webgpu` en pantalla. `?renderer=webgl` vuelve atrás mientras exista el clásico (F6 lo retira).

## 5. La receta de MU5-n: los tres commits de cada módulo, con esta fábrica

1. **Primer commit: TypeScript y componente con `libera()` real.** Sus materiales siguen saliendo igual, por `Materiales.parchea`, `encadena` o `sombreador` si ya pasaban por la fábrica, o como estaban. Sin cambio visible.
2. **Segundo commit: sus materiales por la fábrica.**
   - Cada material con sombreador propio pasa a `M.define("<nombre>", { clasico })`. El nombre es el de la tabla del §1 (o uno nuevo, literal y en minúsculas con guiones), y el clásico es el código de hoy, movido, no reescrito.
   - El módulo lo pide con `ctx.materiales.crea("<nombre>", opc)`, donde `ctx.materiales = Materiales.de(<id>)`.
   - Los estándar se piden con `.estandar(clase, opciones)`.
   - En su `libera()`, llama a `ctx.materiales.libera()`.
   - Si el sitio salía del legado, se borra su `onBeforeCompile`/`ShaderMaterial` y se baja su fila de `FUERA` en `materiales_f1.test.js` (solo puede bajar).
   - En `apps/web/src/`, el trinquete de `src/` exige que el fichero que tenga `onBeforeCompile` o `ShaderMaterial` los registre con `.define(`.
   - Sin cambio visible: lo comprueban las pruebas de equivalencia de siempre (el mismo texto de sombreador y la misma clave de programa).
3. **Tercer commit: su variante TSL, apagada.**
   - `M.define("<nombre>", { tsl })` en el mismo fichero que el clásico (una sola fuente).
   - Se reusa el GLSL que ya existe con `glslFn` cuando se pueda (MULTIVIEW §2.2; regla 12).
   - Los uniformes se comparten con el clásico por el mismo `{ value }`, como en el ejemplo.
   - Las pruebas, en Vitest: con dobles, que `ruta()` sea `"tsl"` solo con el renderer nuevo; con `three/webgpu` y `three/tsl` de verdad, que se construye un `NodeMaterial` con sus nodos. Para el renderer nuevo, la prueba de `materiales.test.ts` sirve de plantilla.
   - Aquí **no se dibuja**: las capturas de clásico frente a TSL son de MU6.
   - Se marca la fila del §1 como hecha.

**Lo que hay que saber al escribir la variante TSL** (de MU2-7):

- **Las luces.** Cambiar de mundo cambia el juego de luces: hemisferio y direccional en el exterior, ambiental y direccional en el vacío. three recompila los programas de los materiales que se ven en los dos, y los de interior se compilan sin niebla. Conviene precompilar a oscuras dentro de `entra` (`Render.compila`).
- **La niebla y el tinte.** El aplicador del `Ambiente` reutiliza un `THREE.Color` y un `THREE.Fog` por escena. `15_tiempo` mueve esa niebla en su sitio y tiñe en cada fotograma `matHojaG`, `matHojaP`, `matCorteza`, `matOrto`, `matSuelo` y la nube. La variante TSL tiene que leer los mismos objetos (el `color` del material y `scene.fog`), no copias. Un material de interior no debe depender de nada de eso.
- **El color.** Los colores son hex sRGB y pasan a lineal con `new THREE.Color(hex)` o `setHex` (ADR-0016). En TSL, `color(hex)` hace lo mismo.
- **La `exag`.** `Estado.exag` es la del mundo activo. Si un sombreador hornea alturas, la lee de un uniforme que el mundo mantiene (`UN.uExag`), nunca de una constante. La fábrica no hornea nada.
- **Los puntos.** En TSL, un punto mide siempre 1 px (MULTIVIEW §2.3). Las filas de puntos (9, 21, 22 y el follaje de la fila 2) pasan a sprites instanciados, y eso hay que medirlo en el banco. **Cómo (A4-0, `mundos/exterior/puntos-tsl.ts`):** three r186 dibuja el MISMO `PointsNodeMaterial` como cuadrados instanciados, con su `size` o su `sizeNode` en píxeles y la atenuación del `WebGLRenderer`, si el objeto no es un `Points`. Con la TSL, el módulo cuelga de su `Points` un espejo (`espejoSprites`): el `Points` sigue siendo el suyo (geometría, `drawRange`, posición, visibilidad) pero pasa a una capa que la cámara no dibuja (`CAPA_OCULTA`, 31; en three las capas no se heredan), y su hijo, un `Sprite` con `count = n` y una geometría instanciada que lee los MISMOS arrays (la posición como `puntoPos`), sigue su `drawRange` y la versión de cada atributo antes de cada dibujo, y se suelta con su geometría. El material tiene que poner en su `positionNode` el centro del punto (`centroPunto`) y leer su uv con `uvPunto`: valen en un `Points` y en el espejo. **Coste [SIN MEDIR]:** 2 triángulos por punto y una segunda copia de los atributos en la tarjeta. **No probado:** dibujado (MU6).

## 6. Comprobado en esta tarea (solo Node)

- Vitest (`materiales.test.ts` y `render.test.ts`).
- Los guardianes de Node `materiales_f1`, `a2c`, `render_f1`, `puente`, `trinquete_legado`, `tipos_web`, `estilo_motor`, `estado_mutable`, `tono`, `sombreado_tiles`, `suelo_fotos`, `cartulinas`, `escena3d`, `contratos`, `sintaxis`, `ambiente_mundo` y `componentes`.
- Las dos builds de Vite (`build`, `builds_f1` y `builds_f2`). Ningún paquete lleva `three/webgpu` ni `three/tsl`.
- **No probado:** el aspecto en un navegador (sin Chrome en esta tarea), el Quest y la variante TSL dibujada.

## 7. Lo hecho en A3-1b (2026-11-06): tileset y suelo de fotos

Los cuatro módulos de la tanda A3-1b pasan a `apps/web/src/mundos/exterior/` como componentes de los mundos `["exterior"]` con un `libera()` que suelta de verdad (MUNDOS §2, «Cómo quedó (MU5-n, A3-1b)»). Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `04e_suelo_fondo.js` → `suelo-fondo.ts` | hecho | hecho: `suelo-fondo` pasa de `parchea` a `define` + `Materiales.de("suelo-fondo").crea` y su `libera()` llama a `.libera()` | hecho: `MeshLambertNodeMaterial`, color de `matSuelo` (el mismo objeto, releído por objeto) por el mosaico pasado de sRGB a lineal con `sRGBTransferEOTF`. Probada en Vitest con `three/webgpu` y `three/tsl` de verdad; **no se dibuja** |
| `04b_escena3d.js` → `escena-tiles.ts` | hecho (+ L2-04) | **no hace falta:** no crea ningún material; los de las teselas son de los glb y los libera `3d-tiles-renderer` | **no hace falta:** sin sombreador propio (el del terreno es el de `04d`, de otra tarea) |
| `04c_olivos_tiles.js` → `olivos-tiles.ts` | hecho | **no hace falta:** solo retira (y libera) los materiales instanciados del glb, que no son suyos | **no hace falta** |
| `04f_suelo_fotos.js` → `suelo-fotos.ts` | hecho | **no hace falta:** no tiene material propio; su GLSL (`SueloFotosPuro.glsl` / `parcheGlsl`) entra en el parche del terreno de `04d` y se apaga con la bandera | **no hace falta aquí.** Cuando se escriba la TSL del terreno (fila 1), `glsl()` es lo que hay que reusar con `glslFn` o portar a nodos: lleva el GLSL del suelo de fotos con sus anclas |

- **Cobertura (`Materiales.cobertura()`):** `suelo-fondo` tiene clásico y TSL; el resto de la tabla del §1 sigue como estaba.
- **Pruebas:** `suelo-fondo.test.ts` (el material sale de la fábrica con su dueño, mismo parche y misma clave de programa, `libera()` lo suelta, y la TSL con `three/webgpu` de verdad) y `pruebas/guardianes/materiales_f1.test.js` (el trinquete de `src/`: el fichero con `onBeforeCompile` lo registra con `.define(`).
- **No probado:** que la TSL de `suelo-fondo` se vea igual que la clásica (capturas por material: MU6) ni en el Quest.

## 8. Lo hecho en A3-2a (2026-11-06): el catálogo y los olivos generados

Los dos módulos pasan a `apps/web/src/mundos/exterior/` como componentes de los mundos `["exterior"]` (MUNDOS §2, «Cómo quedó (MU5-n, A3-2a)»), con los tres commits de la receta del §5 cada uno.

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `07a_catalogo.js` → `catalogo.ts` (componente `catalogo-olivos`) | hecho | hecho: `copa-l1` y `tronco-l1` pasan de `parchea` a `define` + `Materiales.de("catalogo-olivos").crea`; el clásico es el Lambert blanco con color por vértice y el MISMO parche asignado tal cual (la clave de programa no cambia) | **parcial** (§8.1) |
| `07ab_generados.js` → `generados*.ts` (componente `olivos-generados`) | hecho | hecho: `gen-olivo` y `gen-profundidad` pasan de `encadena` a `define` + `Materiales.de("olivos-generados").crea`; el clásico encadena el parche con el `encadena()` de la biblioteca y las mismas claves (`gen-luz-fundido`, `gen-fundido`) | **parcial** (§8.1) |

- **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar: los dos ya pasaban por ella. La de `apps/web/olivo/materiales.js` es el `encadena()` de la biblioteca, que se sigue usando y no cambia.
- **Los impostores** (`impostor-lejano`, `impostor-sustituto`, filas 14 y 15) y sus texturas son de `07ac_lejanos.js` (otra tarea, A3-2b): `07ab` solo le presta `uFun`, los parches de luz y fundido, las variantes y la fila de impostores (`Generados.lejanos`), así que no se tocan aquí.

### 8.1 Las variantes TSL: lo que hacen y lo que les falta (completadas en A4-0, 2026-11-07)

Todas viven junto a su clásico (una sola fuente) y están **apagadas** (solo las daría la fábrica con el `WebGPURenderer`, MU6). Desde A4-0 llevan **lo que hace el clásico**; **no se puede decir que sean equivalentes** hasta las capturas de MU6. **Compilan** sin GPU con los dos constructores de three (`prueba-tsl.ts`): `copa-l1` y `tronco-l1` en una `InstancedMesh` con color por vértice y por instancia (`catalogo.test.ts`); `gen-olivo` en una `BatchedMesh` con color de lote, en una `InstancedMesh` con `aFun` y en unos `Points`, y `gen-profundidad` en una `BatchedMesh` (`generados.test.ts`).

- **El color en sRGB, para todos (A4-0):** `colorSrgbTsl` (en `tiempo-parche.ts`, junto a los nodos del tiempo) es lo de `colorVertSRGB` y del parche de luz: el color por vértice, por instancia y por lote pasa de sRGB a lineal. El `NodeMaterial` multiplica por su cuenta, después de `colorNode` y sin convertir, el color por instancia (`instanceColor`) y el del lote (`batchColor`); `colorSrgbTsl` multiplica antes por `lineal(c) / c`, así que el producto queda `base · lineal(c)`. Se decide al construir, por objeto. Lo usa también la variante de `parche-tiempo` (antes solo convertía el color por vértice).
- **`copa-l1` y `tronco-l1`** (`MeshLambertNodeMaterial`, `vertexColors` en `false`):
  - **lleva:** el color por vértice y por instancia en lineal; en la copa, la silueta rota por ruido (`maskNode`), las motas y el envés del borde, con las cuentas del GLSL; **(A4-0) `vRim` por vértice** (`varying`), como el clásico, y **(A4-0) la semilla por la posición de la matriz** (`instanceMatrix[3].xz`), como el clásico, no por `instanceIndex` (con el índice, el ruido de un olivo cambiaría cuando el nivel 1 se reordena); la sombra de nubes y la helada (A3-4).
  - **coste [SIN MEDIR]:** three no deja leer el nodo de la matriz de instancia que monta, así que la traslación se lee de una copia del mismo array como atributo por instancia (64 B por olivo en la tarjeta), que se vuelve a subir cuando cambia `instanceMatrix.version`. Hay que medirlo en el banco (MU6).
- **`gen-olivo`** (`MeshStandardNodeMaterial` o `PointsNodeMaterial`, con las propiedades del clásico y el MISMO objeto de color):
  - **lleva:** el fundido por tramado como `maskNode` y `maskShadowNode`, con los MISMOS `uFun` y `uBanda`: en las instanciadas y los puntos, del atributo `aFun`; **(A4-0) en las mallas por lotes** (corteza, madera muerta, olivas…), del alfa del color del lote (`batchColor.a = 1 − c / 2`, lo que el GLSL lee con `getBatchingColor(gl_DrawID)`), y 0 (se queda) en un lote sin color, como el clásico; **(A4-0) el color por vértice, por instancia y por lote en lineal**; la sombra de nubes y la helada (A3-4; en los puntos no, como el clásico).
  - **difiere [NO VERIFICADO]:** el `NodeMaterial` multiplica también el **alfa** de la pieza por el del color del lote (el clásico, solo el color), que aquí es el código del fundido. Con un material opaco three lo pone a 1 después y no cambia nada; solo importaría si una pieza por lotes llevara recorte alfa o transparencia.
- **`gen-profundidad`** (un `MeshBasicNodeMaterial` sin color, con el mapa y el recorte del clásico): el mismo fundido como `maskShadowNode`, **(A4-0) también en las sombras de las mallas por lotes**. **[NO VERIFICADO]** que el `WebGPURenderer` use `customDepthMaterial`; la vía segura es el `maskShadowNode` del material principal. El motor no enciende las sombras (L5-12).
- **La biblioteca no recoge lo que devuelve su parche** (`creaMateriales(…, { parche })`): `generados.ts` anota lo que da la fábrica y lo pone en `mats` al acabar (probado en `generados.test.ts`).

### 8.2 Los ciclos de vida (`libera()`)

- **`catalogo-olivos`:** las geometrías por procedimiento (que se rehacen si se vuelven a pedir), las de los modelos instalados y los dos materiales (por la fábrica). Avisa a los oyentes si había modelos.
- **`olivos-generados`:** el lote (geometrías, `BatchedMesh` e `InstancedMesh` con su `dispose`), su grupo, los materiales del constructor con sus texturas (`mats.libera` de la biblioteca), los dos de profundidad (por la fábrica), el trabajador, los trabajos de la cola propia (se cierran sin acabarlos) y la caché de recetas (las recetas en uso y la caché en memoria de la biblioteca; **la de IndexedDB no**, que es persistente a propósito, O5). Lo que llega tarde (el constructor, el manifiesto, una receta del trabajador, una descarga) se tira.
- **Pruebas de memoria** (Vitest, sin GPU: no hay `renderer.info`): tras montar y liberar no queda viva ninguna geometría de lo que cuelga del grupo, ningún material ni textura (`generados.test.ts`); y las geometrías vivas del catálogo vuelven a las de antes (`catalogo.test.ts`, con un THREE que las cuenta).
- **No probado:** en un navegador, en el Quest y en iPhone (esta tarea no abrió Chrome).

## 9. Lo hecho en A3-2b (2026-11-06): olivos medidos, follaje, lejanos y marcadores

Siete módulos del legado pasan a `apps/web/src/mundos/exterior/` (MUNDOS §2, «Cómo quedó (MU5-n, A3-2b)»). Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `02m_tope_olivos.js` → `tope-olivos.ts` | hecho (sin GPU: su `libera()` es `apaga()`) | **no hace falta:** sin materiales | **no hace falta:** sin sombreador |
| `06_arboles.js` → `arboles-l0.ts` | hecho (+ L5-01) | hecho: `copa-l0` y `tronco-l0` pasan de `parchea` a `define` + `Materiales.de("arboles-l0").crea` | hecho: `MeshLambertNodeMaterial` con `colorNode = vec4(sRGBTransferEOTF(vertexColor().rgb), 1)`. Probada en Vitest con `three/webgpu` y `three/tsl` de verdad; **no se dibuja** |
| `07_follaje.js` → `follaje.ts` | hecho (+ L2-01, L5-02, L1-08) | hecho: los cuatro (`matHojaG`, `matHojaP`, `matCorteza`, `matSombra`) son estándar: `.estandar(clase, opciones)` con dueño `follaje` | **no hace falta aquí:** sin sombreador propio. El `parcheTiempo` de las hojas y la corteza lo pone `15_tiempo` (fila 2, otra tarea); sus puntos pasarán a sprites instanciados (§5, «Los puntos») |
| `07ac_lejanos.js` → `lejanos.ts` | hecho (+ L2-08) | hecho: `impostor-lejano` e `impostor-sustituto` pasan de `parchea` a `define` + `crea` con dueño `lejanos` (el parche, movido, es el de siempre) | **hecho en A4-0** (§9.1), con el fundido y la luz de `gen-olivo` |
| `07b_arboles.js` → `arboles.ts` | hecho (+ L1-04) | **no hace falta:** no crea materiales (los de L1 y L2 son del catálogo, 07a) | **no hace falta:** sin sombreador |
| `08_marcadores.js` → `marcadores.ts` | hecho | **no hace falta:** sin materiales | **no hace falta** |
| `08b_marcadores_lidar.js` → `marcadores-lidar.ts` | hecho | hecho: Basic, Basic y Line, estándar, con dueño `marcadores-lidar` | **no hace falta:** estándar |

- **Cobertura (`Materiales.cobertura()`):** `copa-l0` y `tronco-l0` con clásico y TSL; `impostor-lejano` e `impostor-sustituto` con clásico y, desde A4-0, TSL (§9.1).
- **Pruebas:** un `.test.ts` por módulo (con el three de verdad) y, para las variantes TSL, `arboles-l0.test.ts`. `pruebas/guardianes/materiales_f1.test.js` cuenta también los `define` de `src/mundos`.
- **No probado:** que la TSL de `copa-l0` y `tronco-l0` se vea igual que la clásica (capturas por material: MU6), ni nada en el Quest. Tampoco el color de los troncos del nivel 0 tras L5-01 (§ MUNDOS), que cambia a propósito.

### 9.1 Las TSL de los lejanos (A4-0, 2026-11-07)

Viven junto a su clásico en `lejanos.ts` (`tslImpostor`, `tslSustituto`) y están **apagadas**. Llevan lo que hace el clásico, con los MISMOS `{ value }` (`uCapa`, `uCentro`, `uSemi`, el `uNVar` del sustituto) y el fundido y la luz de los olivos generados (`Generados.lejanos` les da desde A4-0 sus `uniformes`, `uFun` y `uBanda`, y los nodos del tiempo). **No se puede decir que sean equivalentes** hasta las capturas de MU6.

- **`impostor-lejano`** (`MeshLambertNodeMaterial`, `alphaTest` 0,5 y el `recorte` de AG-2.1): el cuadrado girado a la cámara en el marco del árbol (`positionNode`), la celda de la vista más cercana del atlas octaédrico (`ot_oct`, `ot_dirV`, `ot_base`), el color del atlas en `vOtUV`, la normal del atlas en el espacio de la vista (`normalNode`), el descarte fuera de la celda y por la capa (`uCapa`) y el fundido de `gen-olivo` (`maskNode`), la sombra de nubes y la escarcha tras la luz; con `?cartulina=silueta`, el polígono de la celda (`textureLoad` de `tPoli`) reproyectado con la inversa de `ot_M`.
- **`impostor-sustituto`** (`MeshLambertNodeMaterial` a dos caras): la uv de la variante y la vista (`(aVista, aVar) + uv`, entre `(2, uNVar)`), el descarte por la capa, el fundido y la luz; con silueta, el vértice del polígono en cada plano (`positionNode`).
- **Lo que cambia por fuerza en nodos:**
  - el marco de cada olivo (`modelMatrix · instanceMatrix`) se lee de la copia de la matriz de instancia (`instancia-tsl.ts`, la misma de la copa del catálogo: cuatro atributos `vec4` por instancia, [SIN MEDIR]) y su inversa se hace a mano, por los cofactores de la parte 3 × 3 (WGSL no tiene `inverse()`), que dan también la matriz de las normales;
  - **three aplica la matriz de instancia ANTES de `positionNode`** (`setupPosition`, r186): el `positionNode` la aplica él (`aplicaInstancia`) a lo que el clásico pone en `transformed`. Es el mismo motivo por el que el vaivén de las matas difería (§11.1);
  - el mapa se lee en `vOtUV` dentro de `colorNode` (el `NodeMaterial` no deja cambiar la uv de su `map`), así que el material TSL no lleva `map`.
- **Compilado (solo Node):** los dos, en sus mallas de verdad (las de `creaLejanos`, con three/webgpu de verdad) y con silueta, con `WGSLNodeBuilder` y `GLSLNodeBuilder` (`lejanos.test.ts`). **No comprobado:** que el sombreador lo acepte la tarjeta, que se vea igual (capturas de MU6) ni su coste.

## 10. Lo hecho en A3-3 (2026-11-06): la nube, el paisaje, las balizas, las lindes, los carteles y las decoraciones

Seis módulos pasan a `apps/web/src/mundos/exterior/` (MUNDOS §2, «Cómo quedó (MU5-n, A3-3)»). Cuatro tienen sombreador propio y llevan los tres commits de la receta del §5; dos no lo tienen y llevan solo el primero.

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `05_nube.js` → `nube.ts` (componente `nube-lidar`) | hecho (+ L1-01, L1-02, L2-02) | hecho: `nube-lidar` pasa de `parchea` a `define` + `Materiales.de("nube-lidar").crea` (uno por nivel); el clásico es el `PointsMaterial` con el color del maestro y el parche de `15_tiempo` asignado tal cual (sin clave propia) | **parcial** (§10.1) |
| `18_paisaje.js` → `paisaje.ts` (`paisaje-lidar`) | hecho (+ L2-05) | hecho: `arroyo` pasa de `sombreador` a `define` + `crea`; los estándar (muro, poste, hilo, tronco, copa de los árboles y un tejado por edificio), por `.estandar()` con el mismo dueño | hecho (§10.1) |
| `19_balizas.js` → `balizas.ts` (`balizas-parcela`) | hecho (+ L2-05) | hecho: `baliza` pasa de `sombreador` a `define` + `crea` (uno por baliza); rombo y anillo, por `.estandar()` | hecho (§10.1) |
| `44_lindes.js` → `lindes.ts` (`lindes-hazas`) | hecho | hecho: `lindes-acerca` pasa de `parchea` a `define` + `crea`; el clásico es el `LineMaterial` (que llega con el `import()` del talón) con `uAcerca`, el parche tal cual y su clave de programa propia | **parcial** (§10.1) |
| `44b_carteles.js` → `carteles.ts` (`carteles-haza`) | hecho | **no hace falta:** `MeshBasicMaterial` sin parche ni `ShaderMaterial` (multiview) | **no hace falta** |
| `50_decoraciones.js` → `decoraciones.ts` (`decoraciones-olivo`) | hecho | **no hace falta:** `MeshLambertMaterial` y `MeshBasicMaterial` con color por vértice, sin parche | **no hace falta** |

- **Cobertura (`Materiales.cobertura()`):** `nube-lidar`, `arroyo`, `baliza` y `lindes-acerca` tienen clásico y TSL; el resto de la tabla del §1 sigue como estaba.
- **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar: los cuatro ya pasaban por ella (`Materiales.parchea` y `Materiales.sombreador`).
- **Por qué los dos últimos no tienen commit de materiales:** el §5 los pide solo para «cada material con sombreador propio». Los carteles y las decoraciones usan materiales estándar de three con color por vértice o por textura, que el `WebGPURenderer` convierte solo (MULTIVIEW §2.1). Sus `libera()` ya los soltaban a mano.

### 10.1 Las variantes TSL: lo que hacen y lo que les falta

Todas viven junto a su clásico (una sola fuente), están **apagadas** (solo las daría la fábrica con el `WebGPURenderer`, MU6). Probadas en Vitest con `three/webgpu` y `three/tsl` de verdad: se construyen y la ruta es `tsl` solo con el renderizador nuevo. **No comprobado:** que el grafo compile (sin renderizador en Node) ni que se vea igual (capturas: MU6). **No son equivalentes al clásico probado.**

- **`nube-lidar`** (`PointsNodeMaterial`):
  - **lleva:** el tamaño de su nivel, la atenuación por distancia y el MISMO objeto de color del maestro (que el ciclo del día tiñe); **(A4-0)** lo que el parche del tiempo hace en unos puntos: el color por vértice, escrito en sRGB, a lineal (`colorSrgbTsl`; la sombra de nubes y la helada no, **tampoco en el clásico**, §11.1); y **(A4-0) el tamaño de verdad con el backend WebGPU**: cada malla de la nube se dibuja con su espejo de sprites instanciados (§5, «Los puntos»), con el centro del punto (`centroPunto`) en el `positionNode`;
  - **[NO VERIFICADO]** que el backend WebGPU acepte la posición en `Int16` normalizado de 3 componentes (WebGPU no tiene `snorm16x3`; three la tendría que rellenar a 4): vale también para el `Points`;
  - **coste [SIN MEDIR]:** 2 triángulos por punto dibujado (hasta `PRESUPUESTO_NUBE` × 2) y una segunda copia de los atributos en la tarjeta. Es la trampa del 1 px de MULTIVIEW §2.3: se mide en el banco (MU6).
- **`arroyo`** (`MeshBasicNodeMaterial`): el mismo cálculo que el fragmento (borde, lecho de arena con ruido por celda, agua que se ensancha con `uAgua` y fluye con `uT`, luz del día) en nodos, con los mismos uniformes (releídos en cada objeto) y el estado de dibujo del clásico (transparente, dos caras, sin profundidad, desplazamiento de polígono, sin niebla ni tonemapping). **Sin diferencias conocidas, sin comprobar dibujado.**
- **`baliza`** (`MeshBasicNodeMaterial` aditivo): la columna que se apaga hacia arriba (con `positionLocal.y`), el latido con `uT` y el pulso de la alerta, con los mismos uniformes y el estado de dibujo del clásico. **Sin diferencias conocidas, sin comprobar dibujado.**
- **`lindes-acerca`** (`Line2NodeMaterial`): los parámetros del `LineMaterial` (color, ancho en píxeles, opacidad, profundidad).
  - **(A4-0) el acercamiento de profundidad** (`uAcerca`, 1 − acerca) en su `positionNode`: el clásico escala hacia el ojo los dos extremos del tramo en el espacio de la vista; la TSL escala el vértice ya ensanchado (lo que three pone en `positionLocal` antes de `positionNode`), con la cámara llevada al espacio del objeto. En perspectiva, escalar una posición de la vista no mueve su proyección, así que da lo mismo en la pantalla y la misma profundidad [DEDUCIDO, sin capturas];
  - **(A4-0) el ancho:** con la TSL, `resolucion()` (el `onBeforeRender` de cada malla) pone el `linewidth` del material, que no tiene `uniforms` (antes habría fallado); la `Line2NodeMaterial` mide sola el viewport. **El ancho × 1,5 por ojo en VR no se ha comprobado y no hace falta:** la VR no usará la TSL (el Quest se queda en super-three, decisión 231);
  - **compilado (solo Node):** en un `LineSegments2` de `three/addons/lines/webgpu` con su `LineSegmentsGeometry`, con los dos constructores (`lindes.test.ts`).

### 10.2 Los ciclos de vida (`libera()`)

- **`nube-lidar`:** cada malla con su geometría y sus copias de CPU (`X`, `Y`, `H`, `B` y el color: ≈ 23 B por punto), los trabajos de la Cola (`N<tesela>`, `NP<tesela>`), el grupo y los materiales de los niveles (por la fábrica). Además, el comportamiento nuevo (L1-01, L2-02): fuera del modo Nube, a los 2 s se sueltan todas las mallas.
- **`paisaje-lidar`** (L2-05): el grupo, cada geometría, los cuatro `InstancedMesh`, los materiales (uno por tejado, el del cauce y los fijos), la malla de sombras que añade al grupo de `06_arboles`, la fuente de VR `arbolesPaisaje` y el oyente de la casilla «Paisaje». Los materiales fijos (muro, poste, hilo, tronco y copa de los árboles) vuelven a ser del dueño al montar: el objeto es el mismo antes y después. (El `matTronco` de `18` ya no choca con el del nivel 0 de `06_arboles`, que desde A3-2b es `matTroncoL0`: L5-01.)
- **`balizas-parcela`** (L2-05): el grupo, las geometrías y los tres materiales de cada baliza, el tipo `baliza` de `Entidades`, el oyente de la ficha, el aviso del minimapa (su DOM), `window.__vrBalizas` y la ficha abierta.
- **`lindes-hazas`:** el grupo, las geometrías y los dos `LineMaterial` (por la fábrica, dueño `lindes-hazas`).
- **`carteles-haza`:** el grupo, la geometría, los cuatro materiales y las cuatro texturas (y los lienzos, a 1 × 1).
- **`decoraciones-olivo`:** las `InstancedMesh`, sus geometrías, los dos materiales compartidos y su fila de la ficha del olivo.
- **Pruebas de memoria** (Vitest, sin GPU: no hay `renderer.info`): tras montar y liberar no queda viva ninguna geometría, material ni textura de lo que cuelga del grupo (con dobles que cuentan los eventos `dispose` de three), también montando y liberando varias veces (`nube.test.ts`, `paisaje.test.ts`, `balizas.test.ts`, `lindes.test.ts`, `carteles.test.ts`, `decoraciones.test.ts`). El guardián de Node `nube.test.js` repite la de L1-01 / L1-02 / L2-02 con el módulo de verdad.
- **No probado:** en un navegador, en el Quest y en iPhone (esta tarea no abrió Chrome); ni la memoria real de la nube en Hituelo (las cifras de L1-01 y L2-02 son las de la auditoría, deducidas).

## 11. Lo hecho en A3-4 (2026-11-06): el cielo, el tiempo y el suelo

Los cinco módulos pasan a `apps/web/src/mundos/exterior/` como componentes de los mundos `["exterior"]` (MUNDOS §2, «Cómo quedó (MU5-n, A3-4)»; COMPONENTES §6, «A3-4»). Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `15_tiempo.js` → `tiempo*.ts` (componente `tiempo-mundo`) | hecho (+ L2-05, L2-11, L8-05) | hecho: `parche-tiempo`, `nubes`, `lluvia` y `barrera` pasan a `define`; el sol y las estrellas, a `.estandar`; sale de `FUERA` (1 / 3) | hecho, **parcial** (§11.1); `parche-tiempo` completa además la luz de `terreno`, `copa-l1`, `tronco-l1` y `gen-olivo` |
| `21_suelo.js` → `hierba.ts` (componente `hierba-suelo`) | hecho (+ L2-05) | hecho: `matas` y `piedras` pasan a `define` (las matas, con su recorte alfa); los contactos, a `.estandar`; sale de `FUERA` (2 / 0) | hecho, **parcial** (§11.1) |
| `23_estacion.js` → `estacion.ts` (componente `estacion-olivo`) | hecho | hecho: `fruto-flor` pasa de `sombreador` a `define` | hecho, **parcial** (§11.1) |
| `11_sol.js` → `sol-reserva.ts` (componente `sol-reserva`) | hecho (L8-03, dicho) | **no hace falta:** no crea ningún material (mueve el sol y el hemisferio de `03`) | **no hace falta:** sin sombreador |
| `20_sonido.js` → `sonido.ts` (componente `sonido-ambiente`, el de siempre) | hecho (+ L1-10) | **no hace falta:** no dibuja (Web Audio) | **no hace falta:** sin sombreador |

- **Cobertura (`Materiales.cobertura()`):** `parche-tiempo`, `nubes`, `lluvia`, `barrera`, `matas`, `piedras` y `fruto-flor` tienen clásico y TSL.
- **Sin cambio visible**, salvo L8-05: la chapita del visor dice «· estimado» con la estación de otra fecha (MUNDOS §2).

### 11.1 Las variantes TSL: lo que hacen y lo que les falta

Todas viven junto a su clásico (una sola fuente), están **apagadas** (solo las daría la fábrica con el `WebGPURenderer`, MU6) y leen los MISMOS objetos `{ value }` que mueve el motor (`onObjectUpdate`). Probadas en Vitest con `three/webgpu` y `three/tsl` de verdad: se construyen con sus nodos y la ruta es `tsl` solo con el renderizador nuevo (`tiempo.test.ts`, `hierba.test.ts`, `estacion.test.ts`, `terreno.test.ts`). **No comprobado:** que los grafos compilen (sin renderizador en Node) ni que se vean igual: las capturas clásico frente a TSL son de MU6. **No son equivalentes al clásico.**

- **`parche-tiempo` (fila 2, la prioridad):**
  - **los nodos (`nodosTiempo`, en `tiempo-parche.ts`):** la sombra de nubes (`ot_sombra`, el mismo ruido de valor de `GLSL_SOMBRA`, con `uDrift`, `uCov` y `uSomb`), su paso por el vértice (`varying`, el `vSomb` del clásico), la escarcha (`mix(…, vec3(0,88, 0,94, 1), uHielo · 0,6)`) tras la luz y la niebla (`outputNode` sobre `output`, como el clásico tras `<dithering_fragment>`) y el vaivén del follaje (`positionNode`, con la fase de la posición de partida). `15_tiempo.js` los da por `nodosTiempoTsl` (`Tiempo.nodosTsl`), y `04d`, `07a` y `07ab` los piden al construir su TSL (`tiempoTsl`);
  - **la variante:** un `NodeMaterial` de la clase del clásico (`PointsNodeMaterial`, `MeshLambertNodeMaterial` o `MeshBasicNodeMaterial`) con sus propiedades copiadas (como `NodeLibrary.fromMaterial` de three) y el MISMO objeto de color (el tinte del día), el color por vértice pasado de sRGB a lineal (`sRGBTransferEOTF`, lo de `colorVertSRGB`), el viento en el follaje y, fuera de los puntos, la sombra y la escarcha en `positionGeometry.xz` (la posición local, como el clásico);
  - **los puntos (el follaje y la nube LiDAR):** sin sombra ni escarcha **también en el clásico**: el sombreador de puntos de three 0.186 no tiene `<dithering_fragment>`, así que el parche calcula `vSomb` y mueve las hojas, pero no oscurece ni escarcha su color (hallazgo de A3-4, sin cambiarlo: lo dice `tiempo.test.ts`). En TSL un punto mide 1 px (§5, «Los puntos»): **desde A4-0** la variante pone en su `positionNode` el centro del punto (`centroPunto`, el viento lo mueve) y vale con el espejo de sprites. **Falta (MU6):** que `07_follaje` use el material que da `aplica()` y cuelgue de sus `Points` el espejo (`espejoSprites`): hoy sus `Points` son suyos y `parche-tiempo` no los ve;
  - **lo que no es del parche:** la variante es un material aparte; el clásico (de `07_follaje`, `04d` o `05`) no se toca, y en MU6 sus dueños tendrán que usar el que dé la fábrica (`aplica()` lo devuelve y `suelta()` lo libera).
- **`nubes`:** `MeshBasicNodeMaterial` con `vertexNode` (cada mancha de cara a la cámara en el espacio de la vista: `mv.xy += esquina · tam`) y `colorNode` (color · alfa · textura, con la paleta del ocaso con `?suelo=fotos`); `fog: false`, como el clásico.
- **`lluvia`:** `LineBasicNodeMaterial` con `positionNode` (la caída con `mod`, el empuje del viento y la cola de 3,4 m) y `colorNode`; sin tono (`toneMapped = false`: el clásico solo lleva `<colorspace_fragment>`).
- **`barrera`:** `MeshBasicNodeMaterial` con las cuentas del fragmento (caída, pie, filo, rejilla, pulso) sobre `aV` y `aD`, mezcla aditiva y las dos caras; sin tono. `temaBarrera` cambia la mezcla del material que dé la fábrica.
- **`matas`:** `MeshLambertNodeMaterial` con el atlas por instancia (`aTile`), el pie más oscuro, el fundido por trama con la distancia (`maskNode`), el recorte alfa, el viento y la sombra y la escarcha (los nodos del tiempo). **Desde A4-0:** el color por instancia leído en sRGB (`colorSrgbTsl`) y el vaivén **antes** de la instancia, como el clásico (`aplicaInstancia`, de `instancia-tsl.ts`: three aplica la instancia antes de `positionNode`, así que el `positionNode` la aplica él). **Difiere (poco):** la sombra de nubes se mira en la posición del mundo ya movida por el viento (el clásico, antes del vaivén): unos centímetros.
- **`piedras`:** granos, vetas y liquen por ruido de la posición local y la sombra de nubes (sin escarcha, como el clásico). **Desde A4-0:** el color por instancia en sRGB; el liquen, que el clásico mezcla tras el color, sin el color por instancia (que el `NodeMaterial` multiplica después: `sinColorPorInstancia` lo deshace); y la semilla del clásico por la posición de la matriz (`fract(m[3].x · 0,137 + m[3].z · 0,311)`, de la copia de la matriz de `instancia-tsl.ts`, coste [SIN MEDIR]).
- **Compilado (solo Node, A4-0):** `matas` y `piedras` en mallas instanciadas con color por instancia, con los dos constructores (`hierba.test.ts`).
- **`fruto-flor`:** `PointsNodeMaterial` con las cuentas del clásico (el BBCH de cada punto, su tamaño y su color, el disco con su brillo y `uLuz`), el tamaño en `sizeNode` y los puntos sin tamaño descartados en el fragmento (el clásico los saca de la pantalla). **Desde A4-0:** el adelanto de 1 m hacia la cámara (`mv.z += 1`, que mueve el punto, no solo su tamaño: en el `setupPositionView` del material, que three usa para proyectar), el tamaño en píxeles de la pantalla (`÷ screenDPR`: `gl_PointSize` va en píxeles del dispositivo y three multiplica el `sizeNode` por la densidad), la uv del punto (`uvPunto`) y el espejo de sprites (§5, «Los puntos»), que `estacion.ts` cuelga con la TSL.

### 11.2 Los ciclos de vida (`libera()`) y los hallazgos

- **`tiempo-mundo`:** el cielo (las geometrías de las nubes y las estrellas, las texturas de las nubes y del sol), la lluvia, las barreras de las lindes (fuera de `gLinde`), sus cinco materiales (por la fábrica, dueño `tiempo-mundo`), los relojes (la relectura cada 10 min y «Reproducir») y las escuchas de las fichas (los controles, el tema y el Bus), los oyentes de `TiempoVivo`, y el parche de los seis materiales del ciclo del día (no son suyos: se les devuelve el `onBeforeCompile` que tenían). Lo que llega tarde de la api se tira.
- **`hierba-suelo`:** las tres mallas instanciadas (fuera de la escena), sus geometrías, sus materiales (también fuera de la lista de recortes alfa), el atlas, la textura de contacto, la del NDVI del suelo (`UN.uG` vuelve a vacío) y la escucha de la fecha.
- **`estacion-olivo`:** el material de los frutos, el reloj de la lectura del clima, las escuchas (la fecha, los modos y los botones de la tarjeta) y `window.__otDebug`.
- **`sol-reserva`:** la escucha de `#hora`. **`sonido-ambiente`:** el `AudioContext` y sus nodos (como antes) y, ahora, el aviso de `Ajustes.alCambiar` (L1-10).
- **Pruebas de memoria** (Vitest, sin GPU: un THREE que cuenta las geometrías y texturas vivas): montar, mover y liberar deja las vivas como estaban (`tiempo.test.ts`, `hierba.test.ts`).
- **Hallazgos al migrar, sin tocarlos (no son de la auditoría):** (1) los puntos no llevan la sombra de nubes ni la escarcha (arriba); (2) los contactos de las piedras no se cuelgan de la escena desde AG-1.15: su `scene.add(iCont)` quedó dentro de un comentario, así que no se ven (`hierba.test.ts` lo dice). Arreglarlos es un cambio visible: decisión aparte.
- **No probado:** en un navegador, en el Quest y en iPhone (esta tarea no abrió Chrome).

## 12. Lo hecho en A3-5 (2026-11-06): la vida del olivar

Siete módulos del legado pasan a `apps/web/src/mundos/exterior/` (MUNDOS §2, «Cómo quedó (MU5-n, A3-5)»). Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `16_vida.js` → `vida.ts` (componente `vida`) | hecho (+ L2-05, L2-11) | hecho: `estela` pasa de `Materiales.sombreador` a `define` + `Materiales.de("vida").crea` (mismo GLSL y mismas opciones, movidos); los Lambert, Basic y Sprite del quad, el dron y el anillo son estándar (`.estandar`) | hecho: `MeshBasicNodeMaterial` (§12.1) |
| `16b_fauna.js` → `fauna.ts` (`fauna-olivar`) | hecho | hecho: los tres Lambert (aves, alas y conejos) son estándar, con dueño `fauna-olivar` | **no hace falta:** sin sombreador propio |
| `22_huellas.js` → `huellas.ts` | hecho (sin recursos: no es componente) | **no hace falta:** sin materiales | **no hace falta** |
| `22b_huellas_polvo.js` → `huellas-polvo.ts` (`huellas-polvo`) | hecho | hecho: `huella` y `polvo` pasan de `Materiales.sombreador` a `define` + `Materiales.de("huellas-polvo").crea` | hecho: `MeshBasicNodeMaterial` y `PointsNodeMaterial` (§12.1) |
| `25_perros.js` → `perros.ts` (`perros-paseo`) | hecho | hecho: el Lambert de cada perro y los dos `SpriteMaterial` de los rótulos son estándar, con dueño `perros-paseo` | **no hace falta:** sin sombreador propio |
| `52_aves_mes.js` → `aves-mes.ts` (`aves-mes`) | hecho (+ la descarga se corta al liberar) | **no hace falta:** DOM, sin materiales | **no hace falta** |
| `54_trabajo_hoy.js` → `trabajo-hoy.ts` (`trabajo-hoy`) | hecho | hecho: el Lambert de vértices del tractor es estándar, con dueño `trabajo-hoy` | **no hace falta:** sin sombreador propio |

- **Cobertura (`Materiales.cobertura()`):** `estela`, `huella` y `polvo` con clásico y TSL (parcial).
- **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar: los tres `ShaderMaterial` ya pasaban por `Materiales.sombreador`. `materiales_f1.test.js` los cuenta ahora por sus `define` de `src/mundos`, y cuenta cada fichero de `src/mundos` una sola vez (antes, un fichero con `Materiales.sombreador` en su primer commit de MU5-n contaba doble).
- **Pruebas:** un `.test.ts` por módulo (con el three de verdad), con la de memoria y, para las TSL, `huellas-polvo.test.ts` y `vida.test.ts` con `three/webgpu` y `three/tsl` de verdad.

### 12.1 Las variantes TSL: lo que hacen y lo que les falta

Las tres viven junto a su clásico (una sola fuente), están **apagadas** (solo las daría la fábrica con el `WebGPURenderer`, MU6) y son **parciales**. Probadas en Vitest con `three/webgpu` y `three/tsl` de verdad: se construyen con sus nodos y la ruta es `tsl` solo con el renderizador nuevo. **No comprobado:** que el grafo compile (sin renderizador en Node) ni que se vea igual (capturas: MU6). **No son equivalentes al clásico.**

- **`estela`** (`MeshBasicNodeMaterial`, transparente, sin escribir profundidad, a dos caras y aditivo, con los mismos `uNow`, `uVida`, `uAlpha` y el MISMO `uColor` que mueven `actualizaVida` y `temaEstela`): lleva la edad de cada tramo, la caída, el pie y el filo, como el GLSL. `temaEstela` le cambia `blending` igual que al clásico. Falta: nada conocido del dibujo.
- **`huella`** (`MeshBasicNodeMaterial`, con el mismo `polygonOffset`): lleva la edad (`uNow`, `aBorn`, `aVida`), el dibujo de la pisada o la rodada según `aTipo` y el borrado con la edad. Falta: nada conocido del dibujo.
- **`polvo`** (`PointsNodeMaterial`): lleva el disco suave, la luz del día (`uLuz`), el borrado con la edad y el tamaño (`sizeNode`). **Desde A4-0:** sin la atenuación de three (`sizeAttenuation: false`: el clásico es un `ShaderMaterial` y la suya va en la cuenta; la TSL de A3-5 la habría aplicado dos veces), en píxeles de la pantalla (`÷ screenDPR`), con la uv y el centro del punto (`uvPunto`, `centroPunto`) y con el espejo de sprites (§5, «Los puntos»), que `huellas-polvo.ts` cuelga con la TSL. **Coste [SIN MEDIR]** en el banco (MU6).
- **`smoothstep` con los bordes al revés:** el GLSL escribe `smoothstep(0.5, 0.34, x)`; WGSL exige borde menor < borde mayor, así que la TSL escribe `1 − smoothstep(0.34, 0.5, x)`, que es lo mismo.

### 12.2 Los ciclos de vida (`libera()`)

Ver MUNDOS §2 («Cómo quedó (MU5-n, A3-5)») y COMPONENTES §6. Pruebas de memoria (Vitest, sin GPU: no hay `renderer.info`): tras montar y liberar varias veces no queda viva ninguna geometría, material ni textura propios, ni reloj (`vida.test.ts`, `fauna.test.ts`, `perros.test.ts`, `huellas-polvo.test.ts`, `trabajo-hoy.test.ts`); `aves-mes.test.ts` comprueba que la descarga se corta y que no queda ventana, icono ni fila de VR.

**No probado:** que las TSL se vean como las clásicas (capturas por material: MU6), el aspecto del quad, el dron y la fauna en un navegador, y nada en el Quest ni en iPhone (esta tarea no abrió Chrome ni Docker).

## 13. Lo hecho en A3-6a (2026-11-06): la presencia y la red, de todo mundo

Cinco módulos del legado pasan a `apps/web/src/` como componentes de **todo mundo** (`mundos: "todos"`, COMPONENTES §3.2; MUNDOS §2, «Cómo quedó (MU5-n, A3-6a)»). Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `37_red.js` → `red/salas.ts` (`red-salas`) | hecho | **no hace falta:** sin dibujo | **no hace falta** |
| `26_presencia.js` → `red/pose.ts`, `red/sala.ts` y `mundos/comun/muneco.ts` | hecho (no es componente: sin recursos) | **no hace falta:** sin materiales | **no hace falta** |
| `38_presencia_compartida.js` → `mundos/comun/presencia.ts` (`presencia-compartida`) | hecho (+ el `MutationObserver` del chat y el lienzo del atlas, que no se soltaban) | hecho: los tres Lambert (cuerpo; cabeza, accesorios, manos y ruedas; los vehículos de los demás) son estándar con dueño `presencia-compartida`; `nombres-presencia` pasa de `Materiales.sombreador` a `define` + `crea` (`defNombres`: el mismo `ShaderMaterial` y el mismo GLSL, movidos) | hecho: `MeshBasicNodeMaterial`, **parcial** (§13.1) |
| `26b_avatares.js` → `mundos/comun/avatares.ts` (`avatares-vrm`) | hecho (+ L2-09: los VRM descargados se sueltan) | hecho: `vrm-fundido` sigue siendo un parche **encadenado** al material que trae el VRM (no es un material propio), ahora con dueño `avatares-vrm` (`Materiales.de(…).encadena`) y con el parche movido a `parcheVrmFundido(uni)`; los materiales que suelta `deepDispose` salen solos de la lista de la fábrica | hecho: `MeshStandardNodeMaterial` con `maskNode`, **parcial** (§13.1) |
| `31c_muneca.js` → `mundos/comun/muneca.ts` (`muneca-vr`, componente nuevo) | hecho | **no hace falta:** la lámina es `creaLamina` de 29_vr (su `MeshBasicMaterial` es de 29_vr; la muñeca solo lo suelta) | **no hace falta:** sin sombreador propio |

- **Cobertura (`Materiales.cobertura()`):** `nombres-presencia` con clásico y TSL; `vrm-fundido` con TSL (su clásico es el parche encadenado de siempre, que no se registra con `define`).
- **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar: `nombres-presencia` ya pasaba por `Materiales.sombreador` y `vrm-fundido` por `Materiales.encadena`.
- **Pruebas:** `presencia.test.ts` y `avatares.test.ts` (Vitest, three de verdad): el dueño en la fábrica y que no guarda nada tras liberar; las TSL con `three/webgpu` y `three/tsl` de verdad (se construyen con sus nodos y la ruta es `tsl` solo con el renderer nuevo).

### 13.1 Las variantes TSL: lo que hacen y lo que les falta

Las dos viven junto a su clásico (una sola fuente), están **apagadas** (solo las daría la fábrica con el `WebGPURenderer`, MU6) y son **parciales**. **No comprobado:** que el grafo compile (sin renderizador en Node) ni que se vean igual (capturas: MU6). **No son equivalentes al clásico.**

- **`nombres-presencia`** (`MeshBasicNodeMaterial`, transparente, sin profundidad ni niebla, `alphaTest` 0,04): la celda del atlas de cada instancia (`aCelda`) del MISMO atlas y la MISMA rejilla (los objetos `{ value }` del componente), y el descarte por alfa. **Falta:** ponerlo de cara a la cámara, con la escala de la instancia, como hace el `vertexShader` del clásico; en VR, **por ojo** (multiview). Sin `vertexNode`, cada nombre sería un plano con la orientación de su `instanceMatrix`.
- **`vrm-fundido`** (`MeshStandardNodeMaterial`): con el color, el mapa, las caras, la transparencia y el `alphaTest` del material del VRM, y el MISMO tramado por `maskNode` (el ruido de pantalla de `vrm_ign` con `screenCoordinate`), que lee el MISMO `{ value }` del fundido (`userData.vrmFundidoUni`). **Falta:** el sombreado toon de MToon (dos tonos, contorno, rim). La buena es el `MToonNodeMaterial` de `@pixiv/three-vrm-materials-mtoon/nodes`, que importa `three/webgpu` y por eso solo puede entrar con el renderer de MU6 (MUNDOS §1: solo `nucleo/render` y la fábrica importan lo que depende del renderer).

### 13.2 Los ciclos de vida (`libera()`)

Ver MUNDOS §2 («Cómo quedó (MU5-n, A3-6a)»). Pruebas de memoria (Vitest, sin GPU): `presencia.test.ts` (con `?presencia=sim&chat=1`: geometrías, materiales y la textura con su `dispose`, el lienzo del atlas a 0, el panel fuera, el observador desconectado, el tipo «persona» quitado), `avatares.test.ts` (la copia del VRM suelta, el grupo fuera, el gancho quitado, `bufs` a 0), `muneca.test.ts` (la lámina al salir de VR; sus enganches y ganchos con el `libera()` del componente) y `red/salas.test.ts` (cada sala dejada y la red cerrada).

**No probado:** nada de esto en un navegador, en iPhone ni en el Quest (esta tarea no abrió Chrome ni Docker); que las TSL se vean como las clásicas (MU6).

## 14. Lo hecho en A3-6c (2026-11-06): la VR y la locomoción, de todo mundo

Siete módulos del legado pasan a `apps/web/src/mundos/comun/` como componentes de **todos** los mundos (`mundos: "todos"`; MUNDOS §2, «Cómo quedó (MU5-n, A3-6c)»). Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `36_mandos.js` → `mandos.ts` (`mandos-vr`) | hecho | hecho: la caja de respaldo, `MeshBasicMaterial` estándar con dueño `mandos-vr` (los modelos del mando y de la mano son de las fábricas de three y se sueltan como antes) | **no hace falta:** sin sombreador propio |
| `29_vr.js` → `vr.ts` + `vr-rig.ts`, `vr-teletransporte.ts`, `vr-panel.ts`, `vr-sesion.ts`, `vr-puros.ts` (`vr`) | hecho (+ L2-06, lo de sus módulos) | hecho: `vineta-vr` pasa de `Materiales.sombreador` a `define` + `Materiales.de("vr").crea` (el mismo `ShaderMaterial`, movido: mismo código, estado y clave de programa); los rayos, el arco, su marca, la línea del aire, el velo y las tres láminas, estándar (`.estandar`) con el mismo dueño | hecho (§14.1) |
| `12c_ir_a.js` → `ir-a.ts` (`ir-a`) | hecho | hecho: el `PointsMaterial` de la línea de puntos, estándar con dueño `ir-a` | **no hace falta** |
| `12b_llegada.js` → `llegada.ts` (`anillo-llegada`) | hecho | hecho: el `MeshBasicMaterial` del anillo, estándar con dueño `anillo-llegada` | **no hace falta** |
| `12_paseo.js` → `paseo.ts` (`paseo`) | hecho | hecho: los cuatro `MeshLambertMaterial` del muñequito, estándar con dueño `paseo` | **no hace falta** |
| `09_camara.js` → `camara.ts` (`camara-orbital`) | hecho | **no hace falta:** sin materiales | **no hace falta** |
| `34b_palanca.js` → `palanca.ts` (`palanca-tactil`) | hecho | **no hace falta:** DOM (nipplejs) | **no hace falta** |

- **Pendiente:** `34_movibles.js` (las ventanas flotantes: el chat y el minimapa). Es de la frontera `ui/` de MUNDOS §1 (HUD y ventanas), que aún no tiene alias hacia el legado; sin materiales ni sombreador.
- **Cobertura (`Materiales.cobertura()`):** `vineta-vr` con clásico y TSL. **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar: la viñeta ya pasaba por `Materiales.sombreador`; los recuentos del §1.4 bajan un `sombreador` (29) y suben un `define`.

### 14.1 La variante TSL de la viñeta

Vive junto al clásico en `vr.ts` (`defVineta`), está **apagada** (solo la daría la fábrica con el `WebGPURenderer`, MU6): un `MeshBasicNodeMaterial` negro con `opacityNode = smoothstep(uA, uA + 0,34, |uv − 0,5| · 2) · uK`, el estado de dibujo del clásico (transparente, sin probar ni escribir profundidad, sin niebla) y los MISMOS `{ value }` de `uK` y `uA` que mueve `vrActualiza`. Probada en Vitest con `three/webgpu` y `three/tsl` de verdad (`vr.test.ts`). **Sin diferencias conocidas; no comprobado** que el grafo compile ni que se vea igual por ojo con multiview (capturas: MU6; el Quest sigue en super-three, MULTIVIEW §4.1).

### 14.2 Los ciclos de vida (`libera()`)

Ver MUNDOS §2 («Cómo quedó (MU5-n, A3-6c)») y COMPONENTES §6. Pruebas (Vitest, sin GPU: no hay `renderer.info`; se cuentan las creaciones y los «dispose» de three): `vr.test.ts` (diez sesiones sin crear geometrías, materiales ni texturas; `libera()` suelta todo), `mandos.test.ts` (diez sesiones con el modelo del mando: nada vivo, ni escuchas ni relojes), `ir-a.test.ts`, `llegada.test.ts`, `paseo.test.ts`, `camara.test.ts` y `palanca.test.ts`. **No probado:** en un navegador, en el Quest ni en el iPhone (esta tarea no abrió Chrome ni Docker).

## 15. Lo hecho en A3-6b (2026-11-07): la voz, hablar y los corros, de todo mundo

Tres módulos del legado pasan a `apps/web/src/` como componentes de **todo mundo** (`mundos: "todos"`, COMPONENTES §3.2; MUNDOS §2, «Cómo quedó (MU5-n, A3-6b)»). Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `45_voz.js` → `red/voz/voz.ts` (`voz-guiada`) | hecho (+ sale de su sala si se libera mientras entraba) | **no hace falta:** sin dibujo (Web Audio y `<audio>` ocultos) | **no hace falta** |
| `47_habla.js` → `red/voz/habla.ts` (`HablaPuro`) y `mundos/comun/habla.ts` (`habla-guiada`) | hecho (+ lo que contesta la api tras liberar ya no vuelve a montar la caja ni la pestaña) | **no hace falta:** las láminas son de `Laminas` (02d) | **no hace falta:** sin sombreador propio |
| `47b_corro.js` → `red/voz/corro.ts` (`CorroPuro`) y `mundos/comun/corro.ts` (`corro-voz`) | hecho (+ la voz sale del corro si se libera mientras entraba; nada de láminas tras liberar) | hecho: los dos `MeshBasicMaterial` (el halo sobre quien habla y el icono del corro) son **estándar** con dueño `corro-voz` (`Materiales.de(…).estandar`), con las mismas opciones; `libera()` suelta además lo del dueño | **no hace falta:** sin sombreador propio (el `WebGPURenderer` convierte los estándar solo, §2) |

- **Cobertura (`Materiales.cobertura()`):** sin cambios (ningún `define` nuevo: no hay sombreadores propios).
- **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar (los dos materiales del corro no tenían sombreador).
- **Pruebas:** `corro.test.ts` (Vitest, three de verdad): el dueño en la fábrica con sus dos materiales, los de siempre (transparentes, sin profundidad ni tone mapping), y nada tras liberar; con `dispose` de la geometría, los materiales y los dos lienzos. `voz.test.ts` y `habla.test.ts`, sus ciclos de vida (MUNDOS §2).

**No probado:** nada de esto en un navegador, en iPhone ni en el Quest (esta tarea no abrió Chrome ni Docker); que la voz suene igual (sin cambio de código de audio, pero no se ha oído).

## 16. Lo hecho en A3-7a (2026-11-07): la interfaz (`ui/`), de todo mundo

Trece módulos del legado pasan a `apps/web/src/ui/` (MUNDOS §1, la frontera nueva; COMPONENTES §6, «A3-7a»). Solo dos tienen materiales; ninguno tiene sombreador propio. Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `02d_laminas.js` → `ui/laminas.ts` (`laminas-mundo`) | hecho | hecho: el `MeshBasicMaterial` de cada lámina (el normal, con `alphaTest` 0,5; el de encima, transparente y sin profundidad; los dos sin niebla ni tone mapping), estándar con dueño `laminas-mundo`. La fábrica (02i) se monta después de 02d: se pide al abrir la primera lámina | **no hace falta:** sin sombreador propio |
| `02e_entidades.js` → `ui/entidades.ts` (`seleccion-usables`) | hecho | hecho: el `MeshBasicMaterial` del anillo de resaltado, estándar con dueño `seleccion-usables`; se pide al crear el anillo | **no hace falta** |
| `17_minimapa.js` → `ui/minimapa.ts` (`minimapa-finca`, solo del exterior) | hecho | **no hace falta:** lienzo 2D | **no hace falta** |
| `24_pantalla.js` → `ui/pantalla.ts` (`menu-pantalla`) y `mundos/comun/transicion.ts` | hecho | **no hace falta:** DOM; la transición solo mueve la cámara y el muñeco | **no hace falta** |
| `27_debug.js` → `ui/ganchos.ts` (no es componente) | hecho | **no hace falta** | **no hace falta** |
| `28_depura.js` → `ui/depura.ts` (`contador-depura`) | hecho | **no hace falta:** DOM | **no hace falta** |
| `30_mide.js` → `ui/mide.ts` (`medidor-fotogramas`) | hecho | **no hace falta:** DOM | **no hace falta** |
| `31_hud.js` → `ui/hud.ts` (`hud-pantalla`) | hecho (+ L2-11) | **no hace falta:** HTML y CSS | **no hace falta** |
| `31b_hud_personal.js` → `ui/hud-personal.ts` (`hud-personal`) | hecho (+ L2-11) | **no hace falta** | **no hace falta** |
| `32_ventanas.js` → `ui/ventanas.ts` (`ventanas`) | hecho | **no hace falta** | **no hace falta** |
| `32b_capas.js` → `ui/capas.ts` (`capas-mundo`) | hecho | **no hace falta** | **no hace falta** |
| `33_ajustes.js` → `ui/ajustes.ts` (`configuracion`) | hecho | **no hace falta** | **no hace falta** |
| `34_movibles.js` → `ui/movibles.ts` (`movibles`) | hecho | **no hace falta** | **no hace falta** |

- **Cobertura (`Materiales.cobertura()`):** sin cambios (los dos materiales son estándar, no `define`). **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar; nada de esto tenía `onBeforeCompile` ni `ShaderMaterial`.
- **Pruebas:** `laminas.test.ts` y `entidades.test.ts` (Vitest, con la fábrica de verdad): el dueño tiene un material por lámina abierta (o el del anillo) y ninguno tras cerrar o liberar; `laminas.test.ts` cuenta además los «dispose» de three (geometría, material y textura de cada lámina). Las pruebas de Node que evalúan el trozo `[motor]` de las láminas o de los usables les dan un doble de la fábrica.

**No probado:** nada de esto en un navegador, en iPhone ni en el Quest (esta tarea no abrió Chrome ni Docker).

## 18. Lo hecho en A3-7b2 (2026-11-07): lo social, los juegos y la oficina

Ocho módulos del legado pasan a TypeScript (COMPONENTES §6, «A3-7b2»). Solo uno crea materiales; ninguno tiene sombreador propio. Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `43_agenda.js` → `ui/agenda.ts` (`agenda`) | hecho | **no hace falta:** DOM y texto en la lámina del panel de VR (de `PanelVR`) | **no hace falta** |
| `46_guiada.js` → `ui/guiada.ts` (`visita-guiada`) | hecho | **no hace falta:** DOM; la lámina del cierre es de `Laminas` (§16) | **no hace falta** |
| `49_avisos_correo.js` → `ui/avisos-correo.ts` (`avisos-correo`) | hecho | **no hace falta:** DOM de Configuración | **no hace falta** |
| `42_personalizacion.js` → `mundos/exterior/personalizacion.ts` (`personalizacion`) | hecho | **no hace falta:** DOM, y la lámina del olivo elegido es de `Laminas` (§16) | **no hace falta** |
| `39_oficina_mundo.js` → `mundos/exterior/oficina-mundo.ts` (`oficina-mundo`) | hecho | **hecho:** los dos `MeshBasicMaterial` de las balizas oficiales (la columna, aditiva y translúcida, y la bandera), estándar con dueño `oficina-mundo`; `libera()` los suelta con `materiales.libera()` en lugar de a mano | **no hace falta:** sin sombreador propio |
| `40_juegos.js` → `mundos/exterior/juegos.ts` (`juegos`) | hecho | **no hace falta:** canvas 2D; la lámina de VR es de `Laminas` | **no hace falta** |
| `41_cae_la_cosecha.js` → `mundos/exterior/cae-la-cosecha.ts` (`cae-la-cosecha`) | hecho | **no hace falta:** canvas 2D | **no hace falta** |
| `46b_primera_vez.js` → `red/voz/primera-vez.ts` | hecho (lógica pura, sin componente) | **no hace falta** | **no hace falta** |

- **Cobertura (`Materiales.cobertura()`):** sin cambios (los dos materiales son estándar, no `define`). **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar; nada de esto tenía `onBeforeCompile` ni `ShaderMaterial`.
- **Pruebas:** `oficina-mundo.test.ts` (Vitest, con la fábrica de verdad y three de verdad, sin GPU): el dueño `oficina-mundo` tiene dos materiales con las balizas puestas y ninguno tras liberar, y la geometría y el material de cada malla reciben su `dispose`. Los guardianes que evalúan `montaGrafica` con `new Function` (`estaticos`, `recorte`) reciben un doble de la fábrica (`materiales.estandar`).

**No probado:** nada de esto en un navegador, en iPhone ni en el Quest (esta tarea no abrió Chrome ni Docker).
