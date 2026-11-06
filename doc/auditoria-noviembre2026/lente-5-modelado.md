# Lente 5 — Modelado 3D (auditoría noviembre 2026)

Revisor: lente 5, solo lectura. Versión v0.2.0, commit `4ab0ae6` (ver `ALCANCE.md`). Criterio: skill `modelado-3d`. Método: **lectura de código** y comprobaciones en Node que no tocan el repo (un script de una sola vez que lista las declaraciones de primer nivel repetidas en `apps/web/motor/*.js`). **No se ha medido nada en ejecución** (sin Chrome, sin banco). `apps/web/node_modules` no está instalado en este entorno, así que lo que digo del interior de three 0.186.1 y de `3d-tiles-renderer` 0.5.3 es **de memoria** y lo marco así cada vez.

Resumen en 5 líneas:
1. Ningún crítico ni alto; 3 medios y 9 bajos. Los tres medios son errores reales de código que ningún guardián ejerce.
2. `matTronco` está declarado dos veces en la misma IIFE (06 y 18): los troncos de nivel 0 se dibujan con el material del paisaje, no con el suyo (L5-01).
3. Las manchas de sombra de edificios y árboles que no son olivo desaparecen en cuanto se pasa al modo Gemelo, y cada reconstrucción deja una malla instanciada sin liberar (L5-02). Además todas las manchas son planas y no siguen la pendiente (L5-03).
4. Los 15 materiales con `onBeforeCompile` y los 11 `ShaderMaterial` están inventariados (Anexo A). Con three 0.187 en `WebGLRenderer` siguen funcionando salvo que cambie el texto de un trozo; con `WebGPURenderer` todos se ven mal o en blanco hasta tener su versión TSL, y hoy `Materiales.parchea` lo calla.
5. Presupuestos por nivel: L1 y L0 cuadran con sus constantes (L0 744-924 tri frente a 800; L1 de 150 a 160 frente a 170); L2 mide 35 frente a 30. No hay mapas de sombra: la skill, en este punto, está desactualizada.

---

## 1. Qué revisé

**Leído entero**: `02i_materiales.js`, `02d_laminas.js`, `04b_escena3d.js`, `04c_olivos_tiles.js`, `04d_sombreado_tiles.js`, `04e_suelo_fondo.js`, `06_arboles.js`, `07_follaje.js`, `07a_catalogo.js`, `07b_arboles.js`, `18_paisaje.js`, `21_suelo.js` (todos en `apps/web/motor/`), y el contrato de `01_datos.js:20-39` (FACTOR_R8).

**Leído en parte**:
- `07ac_lejanos.js:100-303`: los sombreadores de impostor, el horneado y el reparto.
- `07ab_generados.js`: cabecera, `Escalera`, `parcheFundido`, `parcheLuz`, `parcheGen`, `construyeG` (mallas por lotes e instanciadas), `siluetasG`.
- `04f_suelo_fotos.js:1-60`: solo la cabecera y `SueloFotosPuro` (es opt-in con `?suelo=fotos`).
- `15_tiempo.js:195-300` (`parcheTiempo`, `GLSL_SOMBRA`, nubes, lluvia, barrera) y `03_escena.js:15-60` (`colorVertSRGB`).
- `05_nube.js:10-20`.
- Los `Materiales.sombreador/parchea` de `14_historia`, `44_lindes`, `22b`, `19`, `23`, `29`, `16`, `38` y `26b`, solo el sombreador.
- `apps/web/olivo/materiales.js`.
- `tuberia/tiles3d/genera.mjs`: relieve global, ortofoto, `terreno()` con faldones y prototipos.
- `pruebas/presupuesto.json`.
- Guardianes: cabeceras y casos de `materiales_f1`, `web.test.js`, `triangulos_fijos`, `olivos.test.js`, `recorte`.
- `doc/sistema/MULTIVIEW.md` §2.2, §2.4, §2.5 y `doc/sistema/ESCALA-NO-UNIFORME.md`.

**Comprobado a mano y sin defecto** (cálculo de normales de cara con el producto vectorial):
- Orientación hacia fuera de la copa de nivel 0 (`06_arboles.js:79-82`), de los tubos de tronco y rama (`:36-38`), de la copa de L1/L2, del casquete inferior (`07a_catalogo.js:26-29`) y de los cuatro lados de faldón del terreno (`genera.mjs:241-250`).
- Normales del terreno sin costura entre teselas: se calculan del relieve global con paso `min(s,1)` y la misma fórmula en todos los niveles (`genera.mjs:221-224`), con faldón `max(1,5; 2×error)` hacia fuera.
- Orden de aplicación de los parches de `04d`: el `vSomb` de `parcheTiempo` se reescribe por `vWP` después de definirlo.
- Contadores de instancias: `cnt1[q] ≤ tope1 ≤ MAX1`, `cnt2[q2] ≤ a2 ≤ MAX2`, `count` y `visible` ajustados con `cuenta()`, `frustumCulled = false` en las que se recolocan, `computeBoundingSphere` antes de apartar instancias en `04c`.
- Liberación de `Laminas` (geometría, material, textura y lienzo).
- Convenio de color sRGB de `colorVertSRGB` para las instancias de L1/L2 (el `tc.setRGB` sin espacio guarda el número tal cual y el sombreador lo pasa a lineal).

Una consecuencia de la lectura, también **sin defecto**: la ortofoto de cada glb se cambia de material en `04d:212`. El comentario dice que la librería libera la textura; no pude confirmarlo (ver §3).

## 2. Hallazgos

No hay críticos ni altos.

[MEDIO] L5-01 · apps/web/motor/06_arboles.js:10 (y 18_paisaje.js:13) — `var matTronco` se declara dos veces en el ámbito único del motor concatenado: el material de tronco de nivel 0 (`MeshLambertMaterial({ vertexColors: true })` + parche `tronco-l0`, 06:10-11) y el del paisaje (`MeshLambertMaterial({ color: 0x5a4636 })`, 18:13). `arbolesG` lo lee al ejecutarse (06:88) y encuentra el de 18, que carga después — escenario: todo tronco y rama del nivel 0 (celdas de 64 m, hasta `MAX0` = 450 olivos) se dibuja en un único marrón y no con el color por vértice (tonos 0,30-0,42 × variación por hash, 06:32-33) con el que se construyó la geometría; el parche `tronco-l0` queda sobre un material que nadie dibuja, y `Materiales.inventario()` sigue contándolo — cómo se comprobó: script en Node que lista las declaraciones `var`/`function` de primer nivel de `motor/*.js` (la única repetida es `matTronco`), `grep matTronco` (solo 06 y 18) y lectura de `genera_motor.mjs` (los módulos se concatenan en una sola IIFE y `var` permite redeclarar) — por qué no lo vio ningún guardián: `contratos.test.js:130` solo compara las cabeceras «Expone/Consume», y las dos listan `matTronco`; los guardianes que tocan estos módulos cargan cada uno suelto con globales simulados (`triangulos_fijos.test.js:18-25` monta solo 18); no encontré ninguna prueba de «un nombre, una declaración» (`grep dupl` en `contratos.test.js` y `contrato_modulos.js` sin resultados) ni una captura del nivel 0 de cerca.

[MEDIO] L5-02 · apps/web/motor/07_follaje.js:78 — `construyeSombras()` vacía `gSombras` con `children.pop()` (sin `remove`, sin `dispose`), y `sombrasSol()` solo crea `instSombraPA` si es nulo (18_paisaje.js:148); como `instSombraPA` ya existe, tras el primer vaciado la malla de manchas de edificios y árboles que no son olivo queda **fuera de la escena para siempre** — escenario: arranque en modo Nube (defecto, `03_escena.js:60`): el primer `aplica()` ejecuta `colocaPaisaje()`, que crea `instSombraPA` y la cuelga de `gSombras`; al pulsar «Gemelo» (o mover la exageración, cambiar la fecha NDVI...) `aplica()` llama a `Arboles.refresca()` (08_marcadores.js:30 → 07b_arboles.js:239 → `construyeSombras`), que la saca; desde ahí las manchas de edificios y árboles no-olivo no se ven, y solo `gSombras.visible = modo === "gem"` (08:32) las habría mostrado. Además cada llamada deja sin liberar la `InstancedMesh` anterior de manchas de olivo (`copas.length + 1` matrices de 64 B: con 30 000 olivos, ~1,9 MB de búfer de GPU por llamada, que three no libera sin `dispose`) — cómo se comprobó: lectura de 07:77-82, 18:135-150, 08:28-34 y 07b:238-241; no ejecutado — por qué no lo vio ningún guardián: `recorte.test.js:87`, `estaticos.test.js:86-87` y `triangulos_fijos.test.js` llaman a `construyeSombras` una sola vez y buscan la malla en `gSombras.children`; ninguno la llama dos veces ni comprueba que sigue en la escena.

[MEDIO] L5-03 · apps/web/motor/07_follaje.js:80 (también 18_paisaje.js:145, 21_suelo.js:151) — las manchas de sombra (una por olivo, otra por árbol o edificio del paisaje, otra de contacto por piedra) son cuadrados **horizontales** (`geoSombra.rotateX`, 07:38; `tmpS.rotation.set(0, th, 0)`, 18:145) colocados a la cota del terreno en el centro + 0,06 m, con semilado `rm·1,25` (07:80) o mayor (alargadas hasta 26 m, 18:144) — escenario: en una ladera del 10-15 %, que es normal en olivar de Martos, el borde de una mancha de 3 m de semilado queda 0,3-0,45 m por encima o por debajo del terreno real; la mitad de cuesta arriba queda enterrada bajo el suelo (el `polygonOffset` de -2 no la salva) y la de cuesta abajo flota a 0,2-0,4 m; las alargadas del paisaje (hasta 26 m) quedan peor — cómo se comprobó: cálculo con las constantes del código (no medido en pantalla); la altura de referencia es `suelo()` (el relieve de la CPU, no el glb dibujado) — por qué no lo vio ningún guardián: los guardianes prueban recuentos y flags del `InstancedMesh`, no su posición contra el relieve, y el fixture sintético es muy suave (`TILES3D.md`: «el relieve sintético es muy suave»).

[BAJO] L5-04 · apps/web/motor/06_arboles.js:11 — la copa y el tronco de nivel 0 solo llevan `colorVertSRGB`; no llevan `parcheTiempo` (sombra de nubes y escarcha), que sí llevan las hojas y la corteza del mismo nivel (`15_tiempo.js:293`) y las copas de L1/L2 (`07a_catalogo.js:51-52`) — escenario: al pasar una sombra de nubes sobre un olivo del nivel 0, el follaje en puntos se oscurece y la malla de copa de debajo no; lo mismo con helada; en la frontera L0/L1 (≈ 112-210 m) la sombra cambia de intensidad — cómo se comprobó: lectura de 06:10-11, 07a:51-61 y 15:293-294 — por qué no lo vio ningún guardián: ninguna prueba compara el parche aplicado entre niveles; la escarcha y las nubes no tienen captura de referencia.

[BAJO] L5-05 · apps/web/motor/21_suelo.js:45 (y 95) — la mata de hierba son tres cartulinas con normales (0,1,0) y `side: THREE.DoubleSide`; en three, en una cara trasera de un material de dos caras se invierte la normal (`normal_fragment_begin`, de memoria de three, no comprobado en 0.186.1), así que la mitad de las cartulinas vistas por su reverso se iluminan con la normal hacia abajo (solo la luz de suelo del hemisferio, sin sol) — escenario: al girar alrededor de una mata, las cartulinas pasan de claras a oscuras, justo lo que el comentario de 21:40 dice que se evita («normales miran arriba para que no cambie de claro a oscuro al girar») — cómo se comprobó: lectura; no verificado a ojo — por qué no lo vio ningún guardián: la iluminación no tiene prueba, solo la forma de la geometría.

[BAJO] L5-06 · apps/web/motor/18_paisaje.js:61-62 — el color por instancia de los árboles del paisaje sale de `setHSL(...)` sin espacio de color (queda en el espacio de trabajo, lineal) y el material `matCopaArb` (18:13) no lleva `colorVertSRGB`; el convenio de `03_escena.js:19-20` y ADR-0016 dice que lo escrito a mano va en sRGB y se pasa a lineal — escenario: una luminosidad HSL de 0,2-0,3 (verde oscuro) se usa como lineal y sale hacia 0,48-0,58 en pantalla: encinas y arbustos más claros de lo escrito; en el resto del motor el mismo tipo de color pasa por `ot_lin` o por `setRGB(..., SRGB)` — cómo se comprobó: lectura de 18:13, 18:61-62 y 03_escena.js:35-39; no comparado en pantalla — por qué no lo vio ningún guardián: no hay prueba de color por material; el aspecto pudo calibrarse a ojo con este valor.

[BAJO] L5-07 · apps/web/motor/07b_arboles.js:159 y :169 — el cambio L1↔L2 (a `U1` = 460 m) y la baja a L3 (a `U2` = 1600 m) se decide con `c.d < U1` / `c.d < U2` **sin histéresis**; la skill `modelado-3d` (línea 20) dice «con histéresis». Solo el nivel 0 la tiene (`R0 * 1.15`, 07b:140). Tampoco hay fundido por tramado entre niveles en este camino (sí lo hay en `?olivos=escalera`; el salto L0/L1/L2 sin fundido figura como pendiente M3) — escenario: con la cámara quieta en torno a 460 m (órbita) y un olivo en el límite, cada `reclasifica()` (cada 0,25-1,5 s) puede cambiarlo de L1 a L2 si hay temblor de unos metros; en el paseo, al caminar, el salto es visible; la promesa escrita no se cumple — cómo se comprobó: lectura de 07b:121-187 — por qué no lo vio ningún guardián: las pruebas de olivos usan el fixture de 140 olivos a pocas decenas de metros; nada mueve la cámara alrededor de un umbral.

[BAJO] L5-08 · apps/web/motor/07b_arboles.js:18 — contabilidad del presupuesto: (a) `TRI2` = 30 pero `copaGeo(seed, 2, 7, 1)` (07a:66-67) emite 28 + 7 = **35** triángulos (7 de ellos degenerados en el vértice superior, que la GPU procesa igual); con `MAX2` = 16 000 faltan ~80 000 triángulos en `triEst` y en el reparto de `tope1`; (b) `TRI0` = 800 frente a 744-924 reales según `nt` (2 o 3 pies; 06:42, 06:44), unos 843 de media; (c) `TOPE_TRI` solo reduce L1 (`tope1`, 07b:163, con suelo de 500): el nivel 0 (`MAX0·esc` = hasta 720 con calidad Alta y 1125 con `esc` 2,5) no se recorta por él; y (d) las manchas de sombra (2 triángulos por olivo, 07_follaje.js:79-80, todos los olivos a cualquier distancia, `frustumCulled = false`) no entran en `triEst` — escenario: la cifra de «triángulos» de `?debug` y el reparto quedan algo por debajo de lo que se pinta; con 30 000 olivos son unos 60 000 triángulos de manchas siempre; no pasa de 1,7 M en ninguna cuenta que hice, pero es un margen que no consta — cómo se comprobó: contar índices de `copaGeo`, `troncoGeo` y `arbolesG` a mano; no medido con `renderer.info` — por qué no lo vio ningún guardián: `olivos.test.js:72-74` compara el texto de `PRES_TRI` con el esquema; ningún guardián cuenta los triángulos de la geometría procedimental; el tope del fixture (140 olivos) nunca se acerca a `MAX1` ni `MAX2`.

[BAJO] L5-09 · apps/web/motor/04d_sombreado_tiles.js:182,184 (y 15_tiempo.js:290) — la sombra de nubes, la escarcha, el modo Ortofoto y la capa NDVI se aplican en el sitio de `dithering_fragment`; si en three 0.186.1 `fog_fragment` va antes de `dithering_fragment` (de memoria, no comprobado aquí), esas capas se mezclan **después** de la niebla — escenario: en modo Ortofoto, el color de la ortofoto sustituye al ya aplicado con niebla (04d:182) y el relieve lejano sale sin niebla; la capa NDVI al 80 % (04d:178) tampoco se atenúa con la distancia; la sombra de nubes oscurece lo ya nublado por niebla — cómo se comprobó: lectura de los reemplazos; no hay three instalada para leer el orden de trozos de `meshlambert_frag` — por qué no lo vio ningún guardián: no hay prueba de aspecto con niebla en esos modos (el comentario de la skill describe la regla del espacio de color, no la de la niebla).

[BAJO] L5-10 · apps/web/motor/04d_sombreado_tiles.js:151 — la dirección del camino se calcula con cuatro `texture2D(uOrt, …, uBias2 + 1.0)` **dentro de una rama no uniforme** (`if (camino > 0.02 && cercaR > 0.01)`, que depende del píxel); el sesgo de LOD usa derivadas implícitas, indefinidas en flujo divergente en GLSL ES 3.00 — escenario hoy: en los bordes de un camino, la selección de nivel de mip de esas lecturas puede saltar entre píxeles vecinos (ruido en `dirT` y en las rodadas); escenario de la migración: en WGSL `textureSample` fuera de flujo uniforme no compila, así que el port a TSL tendrá que sustituirlo por `textureSampleLevel` (o por `textureLod`) — cómo se comprobó: lectura; no visto en pantalla — por qué no lo vio ningún guardián: las pruebas de `sombreado_tiles.test.js` comprueban las sustituciones de texto, no la semántica GLSL, y el suelo abierto solo se ve en Chrome con ortofoto real.

[BAJO] L5-11 · apps/web/motor/07ac_lejanos.js:139,144 — el sombreador de vértices del impostor calcula `inverse(ot_IM)` (mat4) y `transpose(inverse(mat3(ot_IM)))` **por vértice y por instancia** (hasta `U2` = 1600 m, decenas de miles de instancias × 6-8 vértices), y `inverse(ot_M)` (mat2) en 148; las matrices son constantes por instancia — escenario: en ?olivos=escalera, sobre todo en la GPU móvil de las gafas, esa parte del coste de vértice es ~inverso de una 4×4 por vértice sin necesidad; además WGSL no tiene `inverse` en matrices grandes, así que el port a TSL no es mecánico — cómo se comprobó: lectura; no medido (sin Chrome) — por qué no lo vio ningún guardián: opt-in (`?olivos=escalera`/`gen`), solo se mide con banco y SwiftShader, que no mide costes de vértice reales.

[BAJO] L5-12 · .claude/skills/modelado-3d/SKILL.md:39 — la skill dice «el diseño preveía una [sombra] por árbol en L0–L1 y ninguna en L2 (sin comprobar en el código)». Comprobado: **no hay mapas de sombra**: `renderer.shadowMap` no se activa en ningún módulo del motor (`07ab_generados.js:366-368` y `07b_arboles.js:273` solo lo leen; el único `shadowMap.enabled = true` es el visor de la oficina, `olivo/visor.js:34`), ninguna luz tiene `castShadow` y `castShadow`/`customDepthMaterial` de 07ab:772-779 no se usan; lo que hay son **manchas de sombra falsas** (L5-02, L5-03) para todos los olivos, sea cual sea su nivel — escenario: quien siga la lista de la skill buscará sombras por nivel que no existen y no sabrá que las manchas cuestan 2 triángulos por olivo a cualquier distancia — cómo se comprobó: `grep shadowMap|castShadow` en `apps/web` (coincide con `MULTIVIEW.md §2.4`) — por qué no lo vio ningún guardián: es una afirmación de la skill, no del código; la auditoría de documentación (lente 10) no ve la skill de modelado.

(Hallazgos en el repo de `doc/` de otras lentes no se repiten aquí.)

## 3. No verificado

Aspecto visual real y cifras. Nada de lo siguiente se ha visto ni medido:

- **Todo lo visual**: el aspecto de las copas, la silueta, el salto L0/L1/L2, el brillo relativo de L1/L2 frente a la ortofoto, el color de los árboles del paisaje (L5-06) y de las matas (L5-05), el efecto real de la niebla en modo Ortofoto y NDVI (L5-09).
- **Rendimiento**: fps, ms de `render()`, triángulos reales de `renderer.info` con densidad real de olivos (el fixture tiene 140; `MAX1` y `MAX2` nunca se ejercen), coste del `inverse()` del impostor (L5-11).
- **De three y de `3d-tiles-renderer` de memoria, sin instalar en este entorno**:
  - el orden de los trozos de `meshlambert_frag` (niebla antes de `dithering_fragment`, L5-09);
  - la inversión de la normal en caras traseras de materiales de dos caras (L5-05);
  - que `3d-tiles-renderer` 0.5.3 libera las texturas y los materiales originales del glb que `04d:205-212` sustituye (el comentario 04d:212 lo afirma; si la librería solo mira las propiedades del material que ve en `dispose-model`, la ortofoto de cada tesela, referenciada ya solo por un uniforme, no se liberaría; lo cubre `renderer.info.memory`, que no he podido ejecutar);
  - qué cambia en 0.187: no pude leer las notas de la versión (la URL no estaba permitida en esta sesión).
- **Costuras entre teselas**: las normales son continuas por construcción y los faldones cubren las grietas entre niveles (comprobado en el código de `genera.mjs`), pero la **costura de color** de la ortofoto entre glb vecinos (filtrado bilineal con `CLAMP_TO_EDGE` y mipmaps sin borde de 1 texel) y el escalón visible que dejan los faldones cuando la tesela vecina más fina queda más alta que el borde de la gruesa no se han visto.
- **Alfa y mipmaps**: la textura de hojas de nivel 0 (`07_follaje.js:9-28`, 128 px, `generateMipmaps = true`, `alphaTest` 0,4) usa mipmaps de GPU que promedian el alfa. La generación de olivos tiene `mipsConCobertura` (ADR-0022 §6) precisamente por este problema; el nivel 0 de siempre no. Es posible que las hojas se deshagan antes de lo debido a 80-150 m; no lo he medido (se puede calcular la cobertura por nivel de mip en Node con el mismo dibujo).
- **Atlas de hierba** (`21_suelo.js:50-82`, 1024×256, cuatro losetas sin relleno, `LinearMipmapLinear`): sangrado entre losetas en mips altos.
- **GPU móvil / Quest**: el tamaño máximo de punto (`ALIASED_POINT_SIZE_RANGE`) frente a hojas de ~335 px a 5 m (`matHojaG`, tamaño 3,1); la precisión de `fract(sin(dot(...)))` con argumentos de hasta ~10⁷ (hash de `04d:136`) en GPU móviles (patrones distintos o en bandas).
- **El renderizador nuevo**: lo que digo de `WebGPURenderer` y TSL sale de `doc/sistema/MULTIVIEW.md` y del código del motor; no ejecuté nada de ello.
- **Escalera horneada** (`?olivos=escalera`/`gen`): leído el sombreador, no ejercida la ruta con variantes horneadas.

## 4. No revisado

- `07ab_generados.js` salvo materiales, parches y mallas por lotes: recetas, caché, trabajador, planificación de `Escalera`, fundido por tiempo. `07ac_lejanos.js:1-100`. Toda la biblioteca `apps/web/olivo/` salvo `materiales.js` (`texturas.js`, `silueta.js`, `hornear.js`, `montaje.js`, `impostor.js`, `visor.js`).
- `04f_suelo_fotos.js` más allá de la cabecera (opt-in).
- `tuberia/tiles3d/genera.mjs` fuera de relieve, ortofoto, prototipos y `terreno()`; la escritura de glb, el árbol de cuadrantes y los `geometricError`.
- `05_nube.js` (geometría y cuantización), `16b_fauna`, `22_huellas`, `25_perros`, `26b_avatares` (modelos y piezas), `38_presencia_compartida` y `50_decoraciones` como geometría, `08b_marcadores_lidar`, `19_balizas` (geometría), `23_estacion` (reparto de frutos).
- El detalle del fundido por tramado en `BatchedMesh` y `gl_DrawID`/`getBatchingColor`.
- Los ADR 0002, 0012, 0015, 0016, 0019, 0022 fuera de lo que cita el código.

---

## Anexo A — Inventario de `onBeforeCompile` y qué pasa al migrar

### A.1 Qué hace cada uno

`Materiales.parchea` y `Materiales.encadena` (`02i_materiales.js:36-53`) asignan `onBeforeCompile` (y la clave de programa); lo asignado directamente fuera de la fábrica son 04d:193, 15_tiempo.js:280 y 21_suelo.js:103 y :116 (más `olivo/materiales.js:27` y `02i:39,46` en las fábricas).

| # | Dónde | Material (nombre en la fábrica) | Qué hace el parche | Notas para TSL |
|---|---|---|---|---|
| 1 | `04d_sombreado_tiles.js:193` | terreno de cada glb, `MeshLambertMaterial` (clave `terreno-3dtiles`) | Posición del mundo por `modelMatrix`; ortofoto en espacio de color tal cual; color de la tierra, ruido y «color ancho» de la tesela; hierba según NDVI; detalle de ortofoto (rodadas, caminos, gravilla, hojarasca); relieve fino con `dFdx`; modo Ortofoto; capa NDVI de dos fechas; sombra de nubes y escarcha | El mayor; trae las ramas no uniformes de L5-10 y `#define vViewPosition`. Difícil (A) |
| 2 | `04e_suelo_fondo.js:39` | suelo de fondo `suelo-fondo` | Sustituye `map_fragment` para pasar el mosaico de sRGB a lineal | Fácil (B) |
| 3 | `06_arboles.js:11` | `copa-l0` | `colorVertSRGB`: el color por vértice, de sRGB a lineal | Mejor quitarlo: convertir al escribir el atributo |
| 4 | `06_arboles.js:11` | `tronco-l0` | Igual | **Huérfano hoy (L5-01)** |
| 5 | `07a_catalogo.js:61` | `copa-l1` (`parcheCopa`) | `parcheTiempo` + sombra de nubes por instancia; silueta rota por ruido hacia el borde (`discard`), motas y envés plateado en el borde (`vLoc`, `vSeed`, `vRim`) | Medio |
| 6 | `07a_catalogo.js:61` | `tronco-l1` (`parcheInst`) | `parcheTiempo` con posición de instancia | Fácil |
| 7 | `15_tiempo.js:280` (aplicado en :293) | `matHojaG`, `matHojaP`, `matCorteza` (`PointsMaterial`) | `parcheTiempo` con viento: desplazamiento por posición, sombra de nubes, escarcha, color de vértice | Los puntos son 1 px en WebGPU (MULTIVIEW §2.3) |
| 8 | `05_nube.js:14` | `nube-lidar` ×4 niveles | `parcheTiempo` sin viento | Igual (puntos) |
| 9 | `21_suelo.js:103` | `matMata` | Viento por altura de la cartulina; atlas por instancia (`aTile`); fundido por tramado con la distancia; pie más oscuro; sombra de nubes y escarcha | Medio |
| 10 | `21_suelo.js:116` | `matPiedra` | Granos, vetas y liquen por ruido de la posición local; sombra de nubes | Medio |
| 11 | `14_historia.js:104` | `resalte-parcela` (uno por parcela) | `transformed.y *= uExag` para seguir la exageración | Fácil |
| 12 | `44_lindes.js:203` | `lindes-acerca` (`LineMaterial`) | Acerca la línea a la cámara (`conAcercamiento`) | `Line2NodeMaterial` |
| 13 | `07ac_lejanos.js:154` | `impostor-lejano` | Cuadrado girado a la cámara en el marco del árbol, celda de la vista más cercana (octaedro), normales del atlas, polígono de silueta con `texelFetch`, fundido (`uCapa`) | `inverse`/`transpose` por vértice (L5-11); matrices uniformes y `uCentro[4]` |
| 14 | `07ac_lejanos.js:242` | `impostor-sustituto` | Dos planos cruzados con atlas por variante y vista; polígono por `texelFetch` | Medio |
| 15 | `07ab_generados.js:306` (vía `olivo/materiales.js`) | `gen-olivo`, 16 `MeshStandardMaterial` | `parcheLuz` (sombra de nubes con matriz de lote o instancia; color de lote en sRGB) + `parcheFundido` (tramado por `aFun` o por el alfa del color del lote con `gl_DrawID` y `getBatchingColor`) | Depende de funciones internas de three (`getBatchingColor`, `getIndirectIndex`): el riesgo mayor al subir de versión |
| 16 | `07ab_generados.js:303,308` | `gen-profundidad` (`MeshDepthMaterial`) | `parcheFundido` en la pasada de sombra | No se usa: sin mapas de sombra (L5-12) |
| 17 | `olivo/materiales.js:35` | `pies`, `musgo` | `aHueco` (oquedad oscura) y `aMuerta` (madera muerta con foto) | Medio |
| 18 | `26b_avatares.js:274` | VRM / MToon | Fundido por tramado (`uFunVrm`) | `MToonNodeMaterial` de three-vrm 3.5.5 |
| 19 | `15_tiempo.js:294` | `matSuelo`, `matOrto`, `nube.material` (maestros) | `parcheTiempo` | **Código muerto**: esos tres solo prestan su `color`; nunca se dibujan (grep: ninguna malla los usa). Se pueden borrar al migrar |

`ShaderMaterial` (11): `15_tiempo.js:213` (nubes), `:261` (lluvia), `:386` (barrera); y por la fábrica `18_paisaje.js:70` (arroyo), `19_balizas.js:16` (baliza, uno por parcela), `16_vida.js:45` (estela), `22b_huellas_polvo.js:18` (huella) y `:40` (polvo), `23_estacion.js:39` (fruto-flor), `29_vr.js:628` (viñeta), `38_presencia_compartida.js:115` (nombres). Coincide con `MULTIVIEW.md §2.2`.

Convención de la clave de programa: cuando no se pasa clave, three usa `onBeforeCompile.toString()`. Los parches repetidos con distinta variable capturada (por ejemplo `conTiempo(m, viento)`) darían la misma clave: hoy no choca porque los que tienen `viento = false` son los tres maestros muertos (#19), pero sería un fallo silencioso si alguno se dibujara.

### A.2 Qué pasará al migrar

**Con three 0.187 y `WebGLRenderer`** (solo cambia la versión):
- Todos siguen funcionando mientras existan los trozos y los identificadores que parchean. Dos clases de dependencia:
  - Por `#include <…>` (`common`, `begin_vertex`, `color_vertex`, `color_fragment`, `map_fragment`, `uv_vertex`, `normal_fragment_maps`, `project_vertex`, `colorspace_fragment`, `dithering_fragment`, `tonemapping_fragment`): las vigila `web.test.js:27`, **pero se salta si `apps/web/node_modules/three` no existe** («NO se han comprobado») y mira solo `motor/`, no `olivo/`.
  - Por identificadores internos sin vigilar: `getBatchingColor`, `getIndirectIndex`, `gl_DrawID`, `batchingMatrix`, `USE_BATCHING_COLOR`, `instanceMatrix`, `transformedNormal`, `mvPosition`, `vMapUv`, `vViewPosition`, `diffuseColor` y la cadena `"void main() {"`.
- `String.replace` no avisa si el texto buscado ya no está: el parche se aplica a medias y el sombreador sigue compilando. Es el modo de fallo más probable: una función auxiliar `reemplaza(texto, antes, después)` que lance (o avise una vez) cuando no cambia nada cubriría las 80 sustituciones y es lo más barato de hacer ya.
- El mayor riesgo concreto es el de BatchedMesh (#15), que 0.187 toca según `MULTIVIEW.md §2.4`.

**Con `WebGPURenderer` / `NodeMaterial` (TSL)**:
- `onBeforeCompile` **no se ejecuta**: los materiales clásicos (Lambert, Standard, Basic, Points, Line) se convierten solos pero **sin sus parches**; los 11 `ShaderMaterial` salen en blanco. Efecto visible de cada grupo: terreno sin ortofoto de detalle ni NDVI ni modo Ortofoto (#1); colores de vértice sin pasar a lineal, es decir, copas, troncos y matas más claros (#3-#10); sin sombra de nubes, helada ni viento (#5-#10); olivos generados sin fundido (#15); avatares sin fundido (#18).
- **Aviso hoy**: `Materiales.parchea` (02i:36-42), si `Render.tipo === "nuevo"` y no hay versión TSL registrada para ese nombre, cae en el GLSL clásico y asigna `onBeforeCompile` a un material que no lo ejecutará, sin ningún aviso. Hoy `Render.tipo === "nuevo"` está reservado y no hay renderizador, así que no pasa nada; pero cuando exista (F4), cada nombre sin `Materiales.nuevo(...)` será un material mal dibujado en silencio. Convendría un `console.warn` por nombre y un guardián que compare el inventario con las versiones TSL registradas.
- **Lo que no es portable tal cual** (hay que reescribirlo, `glslFn` solo vale con el backend WebGL): ramas con `texture2D` bajo derivadas implícitas (L5-10, WGSL lo rechaza); `inverse`/`transpose` de matrices (L5-11); `gl_DrawID`/`getBatchingColor`/`USE_BATCHING_COLOR` (#15); arrays uniformes `uCentro[4]`, `uBanda[16]`; `texelFetch` sobre texturas flotantes (#13-14); `#define vViewPosition` (#1); el tamaño de punto (`PointsNodeMaterial`).
- **Lo que se puede simplificar antes de migrar**, sin cambio visual y válido en los dos renderizadores:
  1. Pasar a lineal el color de vértice e instancia **al escribirlo** (`setRGB(..., SRGB)` o convertir el atributo al construir), con lo que `colorVertSRGB` (03:35-39) y `ot_lin` desaparecen de 10 materiales. Es la reducción más grande de toda la migración.
  2. Borrar los tres parches muertos de `15_tiempo.js:294` (#19).
  3. Sustituir el parche huérfano `tronco-l0` (L5-01) al resolver el nombre repetido.
  4. Sacar de la GPU el `inverse` del impostor (L5-11) y poner las matrices ya invertidas por instancia.
