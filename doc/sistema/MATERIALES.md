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
- **`parcheTiempo` y `GLSL_SOMBRA`** (`15_tiempo.js`): la sombra de nubes (un ruido que deriva), la helada y, con `viento`, el vaivén por posición. Incluye `colorVertSRGB`.
- **`parche` del terreno** (`04d_sombreado_tiles.js`).

### 1.3 La tabla

| # | Fichero | Nombre | Material de partida | Qué hace el parche | Niebla | NDVI | Viento | Hora | Dif. |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `04d_sombreado_tiles.js` → `src/mundos/exterior/terreno.ts` (MU5-n, A3-1a) | `terreno` | Lambert + parche, uno por glb (`define`/`crea`, dueño `terreno-sombreado`) | suelo, ortofoto, NDVI de 2 fechas, mosaico, relieve fino (`dFdx`), modos Ortofoto/NDVI, `uExag` | sí | **sí** (`uNdviMap`, `uG`) | no | nubes, helada | **A** · TSL **parcial**, apagada (§1.5) |
| 2 | `15_tiempo.js` (fuera) | — (`conTiempo`) | `parcheTiempo` sobre `matHojaG`, `matHojaP`, `matCorteza` (con viento), `matSuelo`, `matOrto` y la nube (sin viento) | sombra de nubes, helada, color sRGB, vaivén | sí | no | **sí** (follaje) | nubes, helada, tinte | M |
| 3 | `15_tiempo.js` (fuera) | — (`nubes`) | `ShaderMaterial` | manchas de nube de cara a la cámara en una sola malla; paleta del ocaso con `?suelo=fotos` | no | no | deriva (en la CPU) | ocaso | M |
| 4 | `15_tiempo.js` (fuera) | — (`lluvia`) | `ShaderMaterial` (`LineSegments`) | rayas que caen en una caja que sigue a la cámara | no | no | **sí** (`uViento`) | `uT` | B |
| 5 | `15_tiempo.js` (fuera) | — (`barrera`) | `ShaderMaterial` | película de luz de la linde con pulso | no | no | no | `uT` | B |
| 6 | `21_suelo.js` (fuera) | — (`matas`) | Lambert + parche (instanciado, recorte alfa) | atlas por instancia, viento, nubes, helada | sí | CPU (colocación) | **sí** | nubes, helada | M |
| 7 | `21_suelo.js` (fuera) | — (`piedras`) | Lambert + parche (instanciado) | vetas, granos y liquen por ruido, nubes | sí | no | no | nubes | M |
| 8 | `apps/web/src/mundos/exterior/suelo-fondo.ts` (antes `04e_suelo_fondo.js`) | `suelo-fondo` | Lambert + parche | mosaico sRGB → lineal | sí | no | no | tinte de `matSuelo` (indirecto) | B — **hecho (MU5-n, A3-1b):** `define("suelo-fondo", { clasico, tsl })`, la TSL apagada |
| 9 | `05_nube.js` | `nube-lidar` | Points + `parcheTiempo` | nube LiDAR con sombra de nubes | sí | CPU (tinte) | no | nubes, tinte | M (puntos de 1 px, MULTIVIEW §2.3) |
| 10 | `mundos/exterior/arboles-l0.ts` (antes `06_arboles.js`) | `copa-l0`, `tronco-l0` | Lambert + `colorVertSRGB` | color por vértice en sRGB | sí | no | no | no | B — **hecho (MU5-n, A3-2b):** `define` con su clásico y su TSL apagada (`MeshLambertNodeMaterial`, `vertexColor()` pasado a lineal) |
| 11 | `apps/web/src/mundos/exterior/catalogo.ts` (antes `07a_catalogo.js`) | `copa-l1`, `tronco-l1` | Lambert + `parcheTiempo` (instanciado) | silueta rota por ruido, motas, envés en el borde | sí | no | no | nubes, helada | M / B — **TSL parcial (MU5-n, A3-2a):** `define` con clásico y TSL apagada; le faltan las nubes y la helada (§8) |
| 12 | `apps/web/src/mundos/exterior/generados-sombreado.ts` (antes `07ab_generados.js`) + `apps/web/olivo/materiales.js` | `gen-olivo` | Standard + `encadena` | luz (`parcheTiempo` en el mundo), color por lote en sRGB, fundido por tramado (`gl_DrawID`, `BatchedMesh`) | sí | no | no | nubes, helada | **A** — **TSL parcial (MU5-n, A3-2a):** el fundido de las instanciadas y los puntos; le faltan el de las mallas por lotes y la luz (§8) |
| 13 | `apps/web/src/mundos/exterior/generados-sombreado.ts` (×2: las sombras de las hojas y las de las mallas por lotes) | `gen-profundidad` | `MeshDepthMaterial` + `encadena` | el mismo fundido en la sombra | — | no | no | no | **A** (sin conversión automática) — **TSL parcial (MU5-n, A3-2a)**, sin verificar su vía en el `WebGPURenderer` (§8) |
| 14 | `mundos/exterior/lejanos.ts` (antes `07ac_lejanos.js`) | `impostor-lejano` | Lambert + parche (recorte alfa) | impostores de 4 variantes, normales del atlas, luz y fundido de `Generados` | sí | no | no | nubes, helada | **A** |
| 15 | `mundos/exterior/lejanos.ts` (antes `07ac_lejanos.js`) | `impostor-sustituto` | Lambert + parche | sustituto por variante y vista (con silueta, `texelFetch`) | sí | no | no | no | **A** |
| 16 | `14_historia.js` | `resalte-parcela` | Basic + parche | resalte que sigue `uExag` (`UN.uExag`) | sí | no | no | no | B |
| 17 | `apps/web/src/mundos/exterior/vida.ts` (antes `16_vida.js`) | `estela` | `ShaderMaterial` | estela del quad y del dron por edad (`uNow`) | no | no | no | no | B — **TSL apagada (MU5-n, A3-5):** `define("estela", { clasico, tsl })` (`MeshBasicNodeMaterial`); §10 |
| 18 | `18_paisaje.js` | `arroyo` | `ShaderMaterial` | agua del arroyo cuando llueve | no | no | no | `uT`, `uLuz` | B |
| 19 | `19_balizas.js` | `baliza` | `ShaderMaterial` (uno por baliza) | columna con pulso | no | no | no | `uT` | B |
| 20 | `apps/web/src/mundos/exterior/huellas-polvo.ts` (antes `22b_huellas_polvo.js`) | `huella` | `ShaderMaterial` (instanciado) | huellas que se borran con la edad | no | no | no | no | M — **TSL parcial, apagada (MU5-n, A3-5):** `define` con clásico y TSL (`MeshBasicNodeMaterial`); §10 |
| 21 | `apps/web/src/mundos/exterior/huellas-polvo.ts` (antes `22b_huellas_polvo.js`) | `polvo` | `ShaderMaterial` (puntos) | polvo | no | no | CPU | `uLuz` | M (puntos) — **TSL parcial, apagada (MU5-n, A3-5):** `PointsNodeMaterial`; el tamaño en píxeles no vale en el WebGPURenderer nativo (§10) |
| 22 | `23_estacion.js` | `fruto-flor` | `ShaderMaterial` (puntos) | flores y aceitunas por BBCH | no | CPU (vigor) | no | `uLuz` | M (puntos) |
| 23 | `26b_avatares.js` | `vrm-fundido` | MToon + `encadena` | fundido por tramado | sí (MToon) | no | no | no | M-A (`MToonNodeMaterial`) |
| 24 | `29_vr.js` | `vineta-vr` | `ShaderMaterial` | viñeta de confort | no | no | no | no | B |
| 25 | `38_presencia_compartida.js` | `nombres-presencia` | `ShaderMaterial` (instanciado) | nombres de un atlas, de cara a la cámara | no | no | no | no | M (de cara a la cámara **por ojo**) |
| 26 | `44_lindes.js` | `lindes-acerca` | `LineMaterial` + parche | lindes acercadas a la cámara | sí | no | no | no | M (`Line2NodeMaterial`) |
| — | `nucleo/materiales.ts` | `ejemplo-tsl` | Basic + parche / `MeshBasicNodeMaterial` | el ejemplo de la ruta (§3): color · `uBrillo` | sí | no | no | no | hecho |

### 1.4 Los recuentos

- **Por la fábrica:** 23 sitios con nombre.
  - 6 `define` (MU5-n): `terreno` (A3-1a, `src/mundos/exterior/terreno.ts`), `suelo-fondo` (A3-1b, antes el `parchea` de `04e`, en `mundos/exterior/suelo-fondo.ts`), `copa-l1` y `tronco-l1` (A3-2a, antes los `parchea` de `07a`, en `mundos/exterior/catalogo.ts`) y `gen-olivo` y `gen-profundidad` (A3-2a, antes los 3 `encadena` de `07ab`, en `mundos/exterior/generados-sombreado.ts`; `gen-profundidad` en dos sitios), cada uno con su clásico y su TSL (parcial: §1.5 y §8).
  - 7 `parchea`: `05`, `06` ×2, `07ac` ×2, `14` y `44`.
  - 1 `encadena`: `26b`.
  - `materiales_f1.test.js` los cuenta en `motor/` y en `src/mundos/` (los `define` con un literal o con su constante `MATERIAL_…`).
  - 8 `sombreador`: `16`, `18`, `19`, `22b` ×2, `23`, `29` y `38`.
  - Los cuenta por nombre `Materiales.inventario()` al cargar.
- **Fuera de la fábrica:** 6 sitios, que vigila el trinquete de `materiales_f1.test.js`.
  - `15_tiempo` (1 parche y 3 `ShaderMaterial`) y `21_suelo` (2 parches).
  - Más `encadena()` de la biblioteca de olivos, que es su punto único.
  - Pasan a la fábrica en el segundo commit de su MU5-n.
- **Dependen de la niebla:** todos los que parten de un material de three (filas 1, 2, 6-16, 23 y 26). Ningún `ShaderMaterial` depende de ella.
- **Dependen de la hora o el tiempo:** las filas 1-9, 11, 12, 14, 18, 19, 21 y 22.
- **Dependen del NDVI dentro del sombreador:** solo el terreno (fila 1).
- **Dependen de `Estado.exag`:** el terreno (`UN.uExag`) y el resalte (fila 16). Ver §5, «La `exag`».

### 1.5 La variante TSL del terreno (fila 1): lo que hay y lo que falta (MU5-n, A3-1a, 2026-11-06)

Vive junto al clásico en `apps/web/src/mundos/exterior/terreno.ts` (`tslTerreno`, `define("terreno", { tsl })`). Es **parcial** y está **apagada**: solo la daría la fábrica con el `WebGPURenderer` (MU6). Comprobado: en Vitest, con `three/webgpu` y `three/tsl` de verdad, cada glb recibe un `MeshLambertNodeMaterial` con `colorNode` y `outputNode`, `fog = true` y el `color` del maestro (`matSuelo.color`, el mismo objeto), y la ruta es `tsl` solo con el renderizador nuevo (`terreno.test.ts`). **No comprobado:** que el grafo compile (las funciones `Fn` no se evalúan hasta compilar, y en Node no hay renderizador) ni que se vea igual: las capturas clásico frente a TSL son de MU6. **No es equivalente al clásico.**

- **Lo que lleva:** el color de la tierra (el suelo de la tesela, `uSue`, o el mosaico, `uMos`, con `uTiene`); la hierba según el NDVI del suelo (`uG`) con su cobertura, su vigor, el ruido de la tesela (`uRui`) y sus motas (`dn`, el mismo ruido de valor); el material de tierra en cuatro octavas; el paso a lineal (`sRGBTransferEOTF`) y el tinte del día (`materialColor`); el modo Ortofoto (`uModoOrto`, `uOrt` con `uOrtoTint`) y el grano final (`dd`) tras la luz; la capa NDVI encima (`uNdviMap`, `uNdviOn`, dentro de la caja `uGBox`), tras la niebla, como el clásico; la exageración por `UN.uExag` (la posición de muestreo, como el clásico); y la niebla de la escena (`fog = true`; el `WebGPURenderer` la aplica a los `NodeMaterial`). Los uniformes son los mismos `{ value }` del clásico (`UN` y los de la tesela), releídos en cada objeto (`onObjectUpdate`).
- **Lo que falta:**
  1. la **sombra de nubes y la escarcha** (`uSombra`: `uDrift`, `uCov`, `uSomb`, `uHielo`): son de `parcheTiempo`, la fila 2, que no tiene aún su TSL;
  2. el **detalle de la ortofoto en el suelo abierto** (`uDet`, `uDetK`, `uBias2`, `uGnd`): abierto, rodadas, caminos y su dirección, surcos, estrías, gravilla y hojarasca. En la TSL se pinta como con `uDet = 0` (lo de lejos), y el grano final va sin el `(1 − 0,6·abierto)`;
  3. el **relieve fino** (`pBump` con `dFdx`/`dFdy` de `hSuelo`, `uBumpK`);
  4. el **suelo de fotos** (`?suelo=fotos`, el GLSL de 04f: `uFot`, `uFotK`, `uRue`);
  5. la **vista de depuración** (`uDetDbg`).

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
- **Los puntos.** En TSL, un punto mide siempre 1 px (MULTIVIEW §2.3). Las filas de puntos (9, 21, 22 y el follaje de la fila 2) pasan a sprites instanciados, y eso hay que medirlo en el banco.

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

### 8.1 Las variantes TSL: lo que hacen y lo que les falta

Todas viven junto a su clásico (una sola fuente), están **apagadas** (solo las daría la fábrica con el `WebGPURenderer`, MU6) y son **parciales**. Probadas en Vitest con `three/webgpu` y `three/tsl` de verdad: se construyen con sus nodos y la ruta es `tsl` solo con el renderizador nuevo (`catalogo.test.ts`, `generados.test.ts`). **No comprobado:** que el grafo compile (sin renderizador en Node) ni que se vea igual (capturas: MU6). **No son equivalentes al clásico.**

- **`copa-l1` y `tronco-l1`** (`MeshLambertNodeMaterial`, `vertexColors` en `false`):
  - **lleva:** el color por vértice pasado de sRGB a lineal (`sRGBTransferEOTF`, lo que hace `colorVertSRGB`) por el color del material; en la copa, la silueta rota por ruido hacia el borde (`maskNode`: se descarta donde `nz < (vRim − 0,72) · 2,8`), las motas (`× 0,74 + 0,50 · nz2`) y el envés plateado del borde, con las cuentas del GLSL;
  - **falta:** la sombra de nubes y la helada (`parcheTiempo`, fila 2, sin TSL aún);
  - **difiere:** la semilla de cada olivo sale de su índice de instancia (`instanceIndex`), no de la posición de su matriz (`instanceMatrix[3].xz`): otro reparto del ruido entre olivos; y `vRim` se calcula por fragmento (`normalView`, `positionViewDirection`), no por vértice.
- **`gen-olivo`** (`MeshStandardNodeMaterial` o `PointsNodeMaterial`, con las propiedades del clásico y el MISMO objeto de color, que la calibración de la luz lineal multiplica después):
  - **lleva:** el fundido por tramado de las piezas instanciadas (ramitas, relleno, tarjetas) y de los puntos: el código del atributo `aFun` (rol y ranura), `f = uFun` en la ranura 0 o el peso de `uBanda[ranura]` en las demás, y el ruido de gradiente entrelazado de pantalla (`screenCoordinate`), como `maskNode` y `maskShadowNode`, con los MISMOS `uFun` y `uBanda` que mueve `Generados.paso()` y que usan los lejanos;
  - **falta:** (1) el fundido de las mallas por lotes (corteza, madera muerta, olivas: el código va en el alfa del color por instancia, que el GLSL lee con `getBatchingColor(gl_DrawID)`): con la TSL entrarían y saldrían de golpe; (2) la luz del motor (`parcheLuz`: la sombra de nubes y la helada de `parcheTiempo` en la posición del mundo, y el color por lote leído en sRGB).
- **`gen-profundidad`** (un `MeshBasicNodeMaterial` sin color, con el mapa y el recorte del clásico y, en las sombras de las hojas, el mismo fundido como `maskShadowNode`):
  - **[NO VERIFICADO]** que el `WebGPURenderer` use `customDepthMaterial`; la vía segura es el `maskShadowNode` del material principal, que ya lleva `gen-olivo`. El motor no enciende las sombras (L5-12), así que hoy la profundidad no se dibuja en ninguna ruta;
  - **falta:** el fundido de la profundidad de las mallas por lotes (sin `aFun`).
- **La biblioteca no recoge lo que devuelve su parche** (`creaMateriales(…, { parche })`): `generados.ts` anota lo que da la fábrica y lo pone en `mats` al acabar. Con el clásico es el mismo material (no cambia nada); con la TSL, el `NodeMaterial` (probado en `generados.test.ts`).

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
| `07ac_lejanos.js` → `lejanos.ts` | hecho (+ L2-08) | hecho: `impostor-lejano` e `impostor-sustituto` pasan de `parchea` a `define` + `crea` con dueño `lejanos` (el parche, movido, es el de siempre) | **sin escribir.** Es dificultad A y no se puede hacer aislada: el parche llama a `Generados.lejanos.parcheLuz` y `parcheFundido` (fila 12, `gen-olivo`), cuya variante TSL aún no existe. Se escribe junto con la de `gen-olivo` |
| `07b_arboles.js` → `arboles.ts` | hecho (+ L1-04) | **no hace falta:** no crea materiales (los de L1 y L2 son del catálogo, 07a) | **no hace falta:** sin sombreador |
| `08_marcadores.js` → `marcadores.ts` | hecho | **no hace falta:** sin materiales | **no hace falta** |
| `08b_marcadores_lidar.js` → `marcadores-lidar.ts` | hecho | hecho: Basic, Basic y Line, estándar, con dueño `marcadores-lidar` | **no hace falta:** estándar |

- **Cobertura (`Materiales.cobertura()`):** `copa-l0` y `tronco-l0` con clásico y TSL; `impostor-lejano` e `impostor-sustituto` con clásico y sin TSL.
- **Pruebas:** un `.test.ts` por módulo (con el three de verdad) y, para las variantes TSL, `arboles-l0.test.ts`. `pruebas/guardianes/materiales_f1.test.js` cuenta también los `define` de `src/mundos`.
- **No probado:** que la TSL de `copa-l0` y `tronco-l0` se vea igual que la clásica (capturas por material: MU6), ni nada en el Quest. Tampoco el color de los troncos del nivel 0 tras L5-01 (§ MUNDOS), que cambia a propósito.

## 10. Lo hecho en A3-5 (2026-11-06): la vida del olivar

Siete módulos del legado pasan a `apps/web/src/mundos/exterior/` (MUNDOS §2, «Cómo quedó (MU5-n, A3-5)»). Qué toca de la receta del §5 a cada uno:

| Módulo | 1.er commit (TS y componente) | 2.º commit (materiales por la fábrica) | 3.er commit (TSL apagada) |
|---|---|---|---|
| `16_vida.js` → `vida.ts` (componente `vida`) | hecho (+ L2-05, L2-11) | hecho: `estela` pasa de `Materiales.sombreador` a `define` + `Materiales.de("vida").crea` (mismo GLSL y mismas opciones, movidos); los Lambert, Basic y Sprite del quad, el dron y el anillo son estándar (`.estandar`) | hecho: `MeshBasicNodeMaterial` (§10.1) |
| `16b_fauna.js` → `fauna.ts` (`fauna-olivar`) | hecho | hecho: los tres Lambert (aves, alas y conejos) son estándar, con dueño `fauna-olivar` | **no hace falta:** sin sombreador propio |
| `22_huellas.js` → `huellas.ts` | hecho (sin recursos: no es componente) | **no hace falta:** sin materiales | **no hace falta** |
| `22b_huellas_polvo.js` → `huellas-polvo.ts` (`huellas-polvo`) | hecho | hecho: `huella` y `polvo` pasan de `Materiales.sombreador` a `define` + `Materiales.de("huellas-polvo").crea` | hecho: `MeshBasicNodeMaterial` y `PointsNodeMaterial` (§10.1) |
| `25_perros.js` → `perros.ts` (`perros-paseo`) | hecho | hecho: el Lambert de cada perro y los dos `SpriteMaterial` de los rótulos son estándar, con dueño `perros-paseo` | **no hace falta:** sin sombreador propio |
| `52_aves_mes.js` → `aves-mes.ts` (`aves-mes`) | hecho (+ la descarga se corta al liberar) | **no hace falta:** DOM, sin materiales | **no hace falta** |
| `54_trabajo_hoy.js` → `trabajo-hoy.ts` (`trabajo-hoy`) | hecho | hecho: el Lambert de vértices del tractor es estándar, con dueño `trabajo-hoy` | **no hace falta:** sin sombreador propio |

- **Cobertura (`Materiales.cobertura()`):** `estela`, `huella` y `polvo` con clásico y TSL (parcial).
- **Fuera de la fábrica:** ninguna fila de `FUERA` que bajar: los tres `ShaderMaterial` ya pasaban por `Materiales.sombreador`. `materiales_f1.test.js` los cuenta ahora por sus `define` de `src/mundos`, y cuenta cada fichero de `src/mundos` una sola vez (antes, un fichero con `Materiales.sombreador` en su primer commit de MU5-n contaba doble).
- **Pruebas:** un `.test.ts` por módulo (con el three de verdad), con la de memoria y, para las TSL, `huellas-polvo.test.ts` y `vida.test.ts` con `three/webgpu` y `three/tsl` de verdad.

### 10.1 Las variantes TSL: lo que hacen y lo que les falta

Las tres viven junto a su clásico (una sola fuente), están **apagadas** (solo las daría la fábrica con el `WebGPURenderer`, MU6) y son **parciales**. Probadas en Vitest con `three/webgpu` y `three/tsl` de verdad: se construyen con sus nodos y la ruta es `tsl` solo con el renderizador nuevo. **No comprobado:** que el grafo compile (sin renderizador en Node) ni que se vea igual (capturas: MU6). **No son equivalentes al clásico.**

- **`estela`** (`MeshBasicNodeMaterial`, transparente, sin escribir profundidad, a dos caras y aditivo, con los mismos `uNow`, `uVida`, `uAlpha` y el MISMO `uColor` que mueven `actualizaVida` y `temaEstela`): lleva la edad de cada tramo, la caída, el pie y el filo, como el GLSL. `temaEstela` le cambia `blending` igual que al clásico. Falta: nada conocido del dibujo.
- **`huella`** (`MeshBasicNodeMaterial`, con el mismo `polygonOffset`): lleva la edad (`uNow`, `aBorn`, `aVida`), el dibujo de la pisada o la rodada según `aTipo` y el borrado con la edad. Falta: nada conocido del dibujo.
- **`polvo`** (`PointsNodeMaterial`): lleva el disco suave (`pointUV`), la luz del día (`uLuz`), el borrado con la edad y el tamaño (`sizeNode`). **Falta:** en el `WebGPURenderer` nativo un punto mide siempre 1 px (§5, «Los puntos»): el tamaño solo valdría con el backend WebGL del `WebGPURenderer`; con el nativo, el polvo pasa a sprites instanciados, y eso se mide en el banco (MU6).
- **`smoothstep` con los bordes al revés:** el GLSL escribe `smoothstep(0.5, 0.34, x)`; WGSL exige borde menor < borde mayor, así que la TSL escribe `1 − smoothstep(0.34, 0.5, x)`, que es lo mismo.

### 10.2 Los ciclos de vida (`libera()`)

Ver MUNDOS §2 («Cómo quedó (MU5-n, A3-5)») y COMPONENTES §6. Pruebas de memoria (Vitest, sin GPU: no hay `renderer.info`): tras montar y liberar varias veces no queda viva ninguna geometría, material ni textura propios, ni reloj (`vida.test.ts`, `fauna.test.ts`, `perros.test.ts`, `huellas-polvo.test.ts`, `trabajo-hoy.test.ts`); `aves-mes.test.ts` comprueba que la descarga se corta y que no queda ventana, icono ni fila de VR.

**No probado:** que las TSL se vean como las clásicas (capturas por material: MU6), el aspecto del quad, el dron y la fauna en un navegador, y nada en el Quest ni en iPhone (esta tarea no abrió Chrome ni Docker).
