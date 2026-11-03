# Viabilidad: interfaz espacial en tres capas y control táctil del móvil (EV-2)

Estudio del 2026-11-03 (fila EV-2 del [PLAN](../rumbo/PLAN.md)) sobre dos propuestas de Antonio del mismo día. **No se implementa nada.** Lo que dice del repo está leído en el código de ese día (ficheros y líneas citados); lo de fuera lleva su fuente o va marcado **[NO VERIFICADO]**. Nada de esto está probado en un móvil ni en unas Quest.

## Resumen

| Propuesta | Viabilidad | Coste (sesiones de agente) | Riesgo principal | Cuándo | Bloqueos |
|---|---|---|---|---|---|
| **A1-A4.** Tres capas sin librería nueva: fichas y carteles anclados al mundo con `Laminas`, panel que nace y se queda, menú de muñeca, HUD reagrupado | **alta** (casi todo existe) | 1 ligera + 3 medias + 1 media (carteles) | Legibilidad en el casco: hoy el texto de las fichas ronda 1,1° (abajo) y el de la lámina de lienzo se ve blando a 800 px/m | A1 y A2 **tras Q0a** (una sola tanda de pruebas en el casco); A3 tras A2; A4 cuando se quiera (solo HTML) | No bloquea nada. La prueba en el casco va con la de Q0a/Q0c |
| **A5.** Texto con `@pmndrs/uikit` o `troika-three-text` | **media-baja hoy** | 1 media (prueba desechable) | Las dos usan `onBeforeCompile` (código de sus paquetes): **no sirven tal cual con `WebGPURenderer`** (AG-3); uikit además pide `'wasm-unsafe-eval'` en la CSP (yoga-layout) | **Tras Q0d** (que decide `XRQuadLayer` y si la CSP admite WASM) **y tras AG-3a** | Choca con el guardián de AG-3a; lo condiciona AG-3b |
| **B.** Joystick flotante, mirar con el pulgar derecho, toque para ir andando, cruceta como accesibilidad | **alta** | 1 ligera + 2 medias | Que el toque en el suelo hoy abre la **ficha de la haza** (la haza es «fondo»): ir andando le quita ese gesto; y el reparto de dedos en un lienzo que ya escuchan tres módulos | **Ya** (la decisión 85 lo dejó para «después»); mejor tras AG-0.3 para leer «táctil» de `Aparato` | Ninguno duro; AG-0.3 conviene antes |

Recomendación: hacer **A1-A4 y B con lo que ya hay** (regla 12: reusar antes que añadir); dejar la librería de texto para cuando Q0d diga si las capas `XRQuadLayer` resuelven la nitidez del panel, que es la razón para querer uikit.

---

## A. Interfaz espacial en tres capas

### A.1 Qué hay ya en el repo y se reutiliza
- **La misma ficha en los tres aparatos ya existe como contrato.** `Entidades.registra({ ficha(id, modo) → { titulo, filas, lineas, color, destacado, gente, pie, acciones } })` es texto llano y lo pinta quien presente: en pantalla el `#ficha` HTML, en VR las láminas de `29_vr.js` ([02e_entidades.js:7-21](../../apps/web/motor/02e_entidades.js)). Hay tipos registrados para olivo (`06_arboles.js:133`), haza (`13b_hazas.js:214`, de fondo), baliza (`19_balizas.js:116`), baliza oficial (`39_oficina_mundo.js:239`) y persona (`38_presencia_compartida.js:688`). La propuesta «la MISMA pieza en los tres aparatos» no pide un modelo de datos nuevo: pide **otro presentador** (anclado al mundo).
- **Láminas ancladas al mundo.** `Laminas.abre({ …, en: {x,y,z}, sigue, cierraA, dist, bajo, alTocar })` ya cuelga un lienzo de un sitio del mundo, se vuelve despacio hacia quien mira, se repinta solo si cambia la firma, se cierra al alejarse y se libera entero ([02d_laminas.js:7-22](../../apps/web/motor/02d_laminas.js)). Presupuesto declarado: **1 llamada y 2 triángulos por lámina**, una textura w × h sin mipmaps. `Entidades` ofrece `pos(id)` y `radio(id)` para saber dónde colgarla.
- **Abrir al acercarse o al apuntar.** `Usables` ya tiene cercanía (balizas a < 17 m, cada 0,1 s) y rayo con gatillo ([VR.md](VR.md), `02e_entidades.js:15-21`).
- **Las fichas de hoy, en la cara.** `29_vr.js:132` crea `panel` (1 × 1,06 m, lienzo 1024 × 1088), `ficha` (0,62 × 0,21 m) y `fichaB` (0,62 × 0,39 m); `vrSigue` las pone delante de la cabeza a 0,95-1,05 m (`29_vr.js:139`, `:455-463`) y la ficha de olivo se cierra a los 14 s. Es exactamente lo que la propuesta cambia.
- **Panel por filas y pestañas** (`PanelVR.filas`, `29_vr.js:183-216`): las filas ya son componentes (ADR-0023, C2). Reordenarlas en «muñeca» (capa 2) y «panel pequeño» (capa 3) es mover filas de sitio, no reescribirlas.
- **Mandos y manos** (`36_mandos.js:35`, `29_vr.js:52`): ya se piden `getControllerGrip(i)` y `getHand(i)`; el menú de muñeca se cuelga del grip izquierdo (o de la articulación `wrist` con manos).
- **Capa 2 y 3 en escritorio y móvil ya existen:** HUD con estado (brújula, modo, tiempo), barra de iconos y punto de extensión `Hud.icono` (`31_hud.js:8-11`, `:198-210`); ventanas HTML no modales con gestión del foco (`32_ventanas.js:6-9`); Configuración con `Ajustes.registra` (`33_ajustes.js`); `Movibles` impide que lo flotante tape controles (`34_movibles.js:6`). «Hablar» es `47_habla.js` (tecla T), «tu haza» es `13b_hazas.js`, «volver» es Inicio/0 (`31_hud.js:40`).

### A.2 Medidas angulares de lo que hay (cálculo desde las constantes del código, no medido en el casco)
| Pieza | Texto de cuerpo | Botones | Hueco entre botones |
|---|---|---|---|
| Panel (0,977 mm/px, a ~1,07 m) | 28-30 px ≈ 27-29 mm ≈ **1,5°** | 64 px ≈ 62 mm ≈ **3,3°** | 16 px ≈ 16 mm |
| Ficha de baliza `fichaB` (0,807 mm/px, a ~1,04 m) | 24 px ≈ 19 mm ≈ **1,1°** | 72 px ≈ 58 mm ≈ 3,2° | **12 px ≈ 9,7 mm** entre acciones (< 12 mm) |
| Ficha de olivo `ficha` (misma escala, a ~1,02 m) | 24-30 px ≈ **1,1-1,4°** | — | — |

Ángulo = tamaño del cuerpo de letra (em), no la altura de la x; si la regla de 1,5° es por línea con interlineado, el panel cumple justo y las fichas no. Frente a las reglas citadas: el **rayo entre 0,8 y 3 m** está en la guía de Meta ([Indirect interactions](https://developers.meta.com/horizon/design/indirect_interactions_bp/): «between 0.8 to 3 meters away») y lo de hoy (0,95-1,05 m) cae dentro. **Texto ≥ 1,5° por línea, objetivos de 2,5-3° y 12 mm entre botones: [NO VERIFICADO]** — no aparecen en las páginas de Meta consultadas ([tipografía](https://developers.meta.com/horizon/design/styles_typography/) da 14 px mínimo y 18 px cómodo en paneles de Horizon OS, sin grados; [ray casting](https://developers.meta.com/horizon/design/raycasting_bp/) pide no hacer objetivos pequeños ni apretados, sin cifra). Los 60 pt de visionOS solo los encontré en resúmenes de terceros: **[NO VERIFICADO]** contra la HIG de Apple. Aun así son cifras razonables y se proponen como topes propios del gemelo, comprobables en Node (tarea EV2-A0).

### A.3 Qué choca
- **ADR-0023 (componentes):** nada en contra. Un presentador «ficha en el mundo» es un consumidor más de `Entidades`/`Laminas`; el menú de muñeca y el panel pequeño son `PanelVR.filas` en otro contenedor. Choque menor: `29_vr.js` es hoy el único presentador VR y concentra 24 consumos; el presentador nuevo debería ser **su propio componente** (`5x_fichas_mundo.js`) para no engordarlo más.
- **CSP (`style-src 'self'`, hoy en *Report-Only*, `infra/Caddyfile:31`):** las láminas son lienzo → sin efecto. En la capa HTML, nada de estilos en línea: clases y `[hidden]` como en `portada.js:4`. Ojo: el repo ya asigna `style.cssText` desde JS (`12b_llegada.js:69`); por CSSOM eso no lo bloquea `style-src` **[NO VERIFICADO: comprobar con el informe CSP de `/api/csp-informe`]**.
- **Presupuesto de dibujo:** cada lámina abierta suma 1 llamada (que en VR se paga por ojo sin multiview, [MEJORAS-TECNICAS](../rumbo/MEJORAS-TECNICAS.md)). «Cartel de haza en la linde» y «tablón en la entrada» **en todas las hazas a la vez** no caben: con 40 hazas serían 40-80 llamadas por ojo frente a un objetivo de ~150. Regla propuesta: **como mucho K = 3 carteles vivos** (los más cercanos, con `Usables.cerca`), el resto sin dibujar; y textura por cartel de ≤ 512 × 320 (0,6 MB). Las fichas que siguen a la cabeza hoy (3 láminas) se sustituyen, no se suman.
- **Nitidez:** a 800 px/m y a 1 m, una lámina da ~14 px por grado; las Quest 3 rondan los 25 px por grado **[NO VERIFICADO]**, así que el lienzo se ve más blando que la pantalla. Es el argumento a favor de uikit (MSDF) o de las capas `XRQuadLayer` que ya están en Q0d.
- **Accesibilidad (WCAG, parte HTML):** capas 2 y 3 en escritorio/móvil ya siguen 2.1.4 (teclas de un carácter), 2.4.3 (foco al abrir/cerrar ventana) y 2.5.8 (objetivos ≥ 44 px, [UX.md](UX.md), apartado de accesibilidad). Lo nuevo (un HUD «hora · tu haza · hablar · volver») debe seguir siendo botones con nombre accesible y contraste AA sobre la imagen (1.4.3 y 1.4.11). El texto del mundo (lienzo) **no es accesible a lectores de pantalla**: cada ficha debe seguir llegando también al `#ficha` HTML en pantalla (ya pasa).

### A.4 Librerías candidatas (comprobado en el registro de npm y en GitHub el 2026-11-03)
| Librería | Versión · fecha | Licencia | Mantenimiento | Tamaño | three 0.186.1 | `WebGPURenderer` |
|---|---|---|---|---|---|---|
| [`@pmndrs/uikit`](https://www.npmjs.com/package/@pmndrs/uikit) | 1.0.78 · 2026-10-27 | MIT (texto de su [LICENSE](https://github.com/pmndrs/uikit/blob/main/LICENSE); npm dice «SEE LICENSE IN LICENSE») | activo (último empuje 2026-10-27, ~3,3 k estrellas) | 1,7 MB desempaquetado + dependencias: `yoga-layout` 3.2.1 (WASM), `zod` 4, `@preact/signals-core`, `@pmndrs/msdfonts`, `@zappar/msdf-generator`; peso en el paquete final **sin medir** | peer `three >= 0.162` → sí | **No tal cual**: sus materiales de panel y de glifos usan `onBeforeCompile` (`dist/panel/material/create.js:16`, `dist/text/render/instanced-glyph-material.js:9`), que el renderizador nuevo no usa; no encontré soporte declarado ([búsqueda](https://github.com/pmndrs/uikit)) |
| [`troika-three-text`](https://www.npmjs.com/package/troika-three-text) | 0.53.1 · 2026-11-02 | MIT | activo (empuje 2026-11-02, ~2 k estrellas) | ESM ≈ 59 KB comprimido con gzip, más `troika-three-utils`, `troika-worker-utils`, `bidi-js`, `webgl-sdf-generator` | peer `three >= 0.125` → sí | **No tal cual**: `troika-three-utils/src/DerivedMaterial.js` monta los materiales con `onBeforeCompile`; hay un hilo con el texto en blanco bajo WebGPU sin solución ([foro de three](https://discourse.threejs.org/t/troika-three-text-and-webgpu/55737)) |
| `three-mesh-ui` | 6.5.4 · 2023-03-24 | MIT | parado (descartada en MEJORAS-TECNICAS, se confirma la fecha) | — | — | — |
| Sin librería: lienzo (`Laminas`) | — | — | propio, ya probado en Node | 0 | sí | `CanvasTexture` + `MeshBasicMaterial`: deberían pasar a material de nodos sin tocar nada **[NO VERIFICADO; entra en la prueba de humo de AG-3a]** |

Lo que se ve en el código de cada una (no medido): **uikit** agrupa paneles y glifos en mallas instanciadas (`dist/panel/instance/group.js`, `dist/text/render/instanced-glyph-group.js`): un panel entero serían unas **2-3 llamadas** (fondos + texto por fuente) **[deducido, sin medir]**; **troika** es 1 llamada por `Text`, salvo con `BatchedText` (la clase `BatchedText` viene en el paquete). **CSP:** uikit carga yoga con `yoga-layout/load` (WebAssembly) y su generador MSDF con un *worker* de `blob:` y WASM (`dist/loaders/ttf.js:52-54`); con `script-src 'self'` y sin `'wasm-unsafe-eval'` **el WASM se bloquea** ([MDN, script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)). El repo ya chocó con esto con meshopt (CHANGELOG, P7b) y Q0d tendrá que decidirlo para KTX2/meshopt: si lo admite, el coste de uikit en la CSP desaparece. troika usa un *worker* de `blob:` (permitido por `worker-src 'self' blob:`) y no contiene `new Function` en su ESM; sus dependencias de *worker* **[NO VERIFICADO]**. Ninguna hace `fetch` a otro host en el código mirado (uikit: solo URLs en comentarios); las fuentes tienen que servirse del mismo origen.

**El IWSDK de Meta usa uikit** (lo recoge [IWSDK.md](IWSDK.md), dependencias de 1.1.0-rc.2): es una señal de madurez en Quest, no una medida.

### A.5 Pasos mínimos para una versión experimental (bandera `?ui=capas`, apagada por defecto)
1. **EV2-A0** — topes angulares en Node: una función pura con las constantes de cada lámina (px/m, distancia, cuerpo de letra, botones, huecos) y un guardián que falle si algo baja de 1,5° / 2,5° / 12 mm (cifras propias mientras no se verifiquen). Corrige el hueco de 9,7 mm de `fichaB`.
2. **EV2-A1** — presentador «ficha en el mundo»: con la bandera, la ficha de olivo y la de baliza se abren con `Laminas.abre({ en: Entidades.pos(id) + altura })` junto a lo que describen, al apuntar o al acercarse, y no a 0,95 m de la cara; misma descripción de `Entidades`. Sin bandera, lo de hoy.
3. **EV2-A2** — panel «nace y se queda»: `sigue: false` y recolocar solo con Y; el panel grande pasa a pequeño (ajustes, gente, chat) y las filas de «Mundo» que son personales se van a la muñeca.
4. **EV2-A3** — menú de muñeca: girar la muñeca izquierda hacia la cara muestra 4 botones (hora, tu haza, hablar, volver); 1 lámina pequeña colgada del grip; con manos, de la articulación `wrist`.
5. **EV2-A4** — capa 2 en pantalla: agrupar «hora · tu haza · hablar · volver» en el HUD (escritorio: barra; móvil: esquina), con `Hud.icono` y sin estilos en línea.
6. **EV2-A6** — carteles de haza en la linde y tablón en la entrada: como mucho 3 vivos, por cercanía.
7. **EV2-A5** (condicional) — prueba desechable de uikit en rama aparte: un panel de uikit frente a la misma lámina de lienzo y frente a `XRQuadLayer`, midiendo llamadas, triángulos, peso del paquete y nitidez a ojo en la Quest.

Coste honesto: A0 ligera; A1, A2, A3 medias (A1 y A3 piden opus por diseño); A4 ligera; A6 media; A5 media. **De Antonio:** una sesión de 20-30 min con la Quest 3 por cada tanda (A1+A2 juntas; A3 aparte), leyendo las fichas a 1 m y a 3 m, el menú de muñeca de pie y sentado, y la escala de mareo; y la decisión de la pregunta 1.

### A.6 Riesgos y lo NO probado
- **Nada probado en unas Quest**: ni la legibilidad de hoy ni la propuesta. Las cifras angulares son cálculo.
- Fichas ancladas a un olivo **dentro de la copa**: la lámina se tapa con hojas si no se pinta por encima (`depthTest: false` como hoy) o se separa del tronco hacia quien mira.
- Menú de muñeca: el gesto de «mirar la muñeca» puede dispararse sin querer y no hay equivalente con el mando en la otra mano (zurdos: el ajuste `controles.mano` debería cambiar de muñeca).
- Un panel que «se queda» puede quedarse detrás al teletransportarse: hay que llevarlo al llegar (o cerrarlo, como ya hace «Ir con»).
- Si AG-3b decide migrar a `WebGPURenderer`, uikit y troika tendrían que portarse o cambiarse; las láminas de lienzo, probablemente no.

### A.7 Cuándo
A0 y A4 cuando se quiera (Node y HTML). A1-A2 **tras Q0a** (para no mezclar la línea base con cambios de interfaz) y antes de Q0c, de modo que la misma visita con el casco sirva para las dos cosas. A3 tras A2. A5 **tras Q0d y AG-3a**. No bloquea nada del plan; Q0d (`XRQuadLayer`) y AG-3 la condicionan.

---

## B. Control táctil del móvil

### B.1 Qué hay ya y se reutiliza
- **Cruceta**: cuatro botones que ponen `teclas.up/down/left/right` con `setPointerCapture` y suelta en `pointerup`/`pointercancel`/`lostpointercapture`, y en *blur* (`12_paseo.js:49-61`). Andar es **de tanque**: adelante/atrás y giro (`12_paseo.js:64-68`), **sin paso lateral**.
- **Solo en táctil y mano zurda**: `HudPuro.tactil`, `HudPuro.zurda` y `aplicaPulgares` ponen `data-tactil` y `data-mano` en `<html>` (`31_hud.js:26-28`, `:152-169`); ajustes `controles.tactil`, `controles.mano`, `controles.sens` (`33_ajustes.js:24`, `:165`). **La mano zurda ya existe** y es reusable para cambiar las mitades.
- **Toque corto en el paseo** = `Usables.toque` (`09_camara.js:18-20`, `:31`, `:39`): olivo, baliza, persona y, de fondo, **la haza bajo el dedo**.
- **Anillo de llegada** (`12b_llegada.js`): rayo al suelo, anillo que crece con la distancia, apartado de troncos y criterio de toque (≤ 12 px, ≤ 0,4 s en táctil, `LlegadaPuro.esToque`). Hoy **solo con el Dron** y la llegada es un **salto con fundido**, no un paseo. **La «línea de puntos» no existe** (no hay nada en el motor que la pinte).
- **Mirar arrastrando en el paseo no existe**: `09_camara.js:18` lo dice («en el paseo no se gira la vista con el dedo»). [UX.md](UX.md) (resumen del móvil) dice «arrastrar: mirar»: la propuesta de UX y el código no coinciden; hay que corregir uno de los dos.
- **Decisión 85** ([DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md)): «cruceta ahora… la palanca analógica (nipplejs) se prueba después». La propuesta B es ese «después».
- `Movibles` y `Hud.zonasProhibidas` (`31_hud.js:59-62`) reservan la caja de `padMov`/`padAcc`.

### B.2 Qué choca
- **El toque en el suelo ya tiene dueño**: hoy abre la ficha de la haza (`13b_hazas.js:214`, `fondo: true`). «Toque corto en el suelo para ir» lo sustituye; la ficha de la haza tendría que abrirse desde su cartel (A6), desde «tu haza» del HUD o con pulsación larga. Es una decisión de UX (pregunta 3).
- **Tres módulos escuchan el lienzo** (`09_camara.js`, `12b_llegada.js`, `02e_entidades.js` a través de `elige`). Con dos pulgares hace falta **un árbitro por `pointerId`**: el dedo que nace en la mitad izquierda es de la palanca, el de la derecha mira o toca; nunca los dos a la vez. Sin eso, mover la palanca podría disparar un toque en un olivo.
- **ADR-0023:** la palanca debería ser un componente (`Componentes.registra`, `Ajustes.registra` para `controles.palanca`), no más código en `12_paseo.js`; lo que sí cambia en el núcleo es que `actualizaPaseo` admita un **vector** (adelante y lateral, relativo a la cámara) además de `teclas`.
- **CSP:** `nipplejs` 1.0.4 crea `div` y toca `el.style.*` por CSSOM (contado en `dist/index.mjs`: `display`, `opacity`, `transform`), no inyecta `<style>` ni atributos `style`; debería pasar `style-src 'self'` **[NO VERIFICADO en el navegador; mirar el informe CSP]**. Sus colores y tamaños se ponen por opciones, así que el aspecto se fija en `plantilla.css` con clases.
- **Presupuesto de dibujo:** cero (HTML). La línea de puntos sí dibuja: 1 llamada (puntos o una línea discontinua) y solo mientras se anda hacia el anillo.
- **Accesibilidad (WCAG 2.2):** una palanca es un gesto de trayectoria → **2.5.1** pide alternativa de un solo puntero y **2.5.7** alternativa a arrastrar: la cruceta se queda como opción (Configuración) y el toque para ir es otra. El teclado no cambia (WASD/flechas). Objetivos ≥ 44 px (2.5.8 pide 24). `prefers-reduced-motion`: el anillo y la línea sin animación.

### B.3 Librería candidata
| Librería | Versión · fecha | Licencia | Mantenimiento | Tamaño | Notas |
|---|---|---|---|---|---|
| [`nipplejs`](https://www.npmjs.com/package/nipplejs) | 1.0.4 · 2026-05-26 | MIT | activo (empuje 2026-05-26, ~2 k estrellas, [GitHub](https://github.com/yoannmoinet/nipplejs)) | `dist/index.mjs` 21 KB, ≈ 6 KB con gzip; sin dependencias | `mode: 'dynamic'` (nace donde apoyas), `zone` (la mitad izquierda), `multitouch`, `threshold`; da el vector y la fuerza: **la zona muerta del 15 % y la curva de velocidad se ponen en una función pura propia** (no la trae como tal). Nada de three: indiferente al renderizador (AG-3) |

Código propio frente a nipplejs: la palanca son ~100 líneas, pero la regla 12 pide la librería; nipplejs resuelve ya los casos de dedo perdido, multitáctil y zona dinámica. Se recomienda nipplejs.

### B.4 Pasos mínimos (ajuste `controles.palanca` = `cruceta` | `palanca`, y `?palanca=1` para probar; por defecto, cruceta)
1. **EV2-B1** — `PalancaPuro` en Node: zona muerta 15 %, velocidad proporcional (curva), dirección relativa a la cámara (con `HudPuro.rumboCamara`), paso lateral; y `actualizaPaseo` que acepte el vector sin cambiar el teclado ni la cruceta.
2. **EV2-B2** — palanca flotante con nipplejs en la mitad del pulgar (izquierda; derecha con mano zurda), mirar arrastrando la otra mitad (con `controles.sens`), árbitro de punteros, zona de `Movibles` y cruceta como opción. Nota de comodidad.
3. **EV2-B3** — toque para ir: anillo de `Llegada` + línea de puntos y **andar** hasta él (no saltar), parar al tocar la palanca, rodear troncos con el apartado que ya existe; la ficha de la haza pasa a otro gesto según la pregunta 3.

Coste: B1 ligera (sonnet), B2 media (sonnet), B3 media (opus: decide el gesto y el camino). **De Antonio:** probar en su móvil (y, si puede, en un iPhone) 10 min a pie con `?debug&palanca=1`: si se anda donde se quiere, si se marea al mirar arrastrando, si se toca un olivo sin querer al andar, y diestra/zurda.

### B.5 Riesgos y lo NO probado
- **Nada probado en un móvil real.** Safari de iOS y los gestos del sistema (deslizar desde el borde para volver, la barra de inicio) pueden comerse el dedo de la palanca si nace pegado al borde: dejar margen.
- Mirar arrastrando + andar puede marear más que la cruceta de tanque (giro continuo) **[sin probar]**; por eso la sensibilidad y la opción de cruceta.
- `touch-action` del lienzo: si no está a `none` en las zonas, el navegador hace *scroll* o zoom con el gesto.
- Con el Dron (`16_vida`) la palanca debe mandar al Dron igual que la cruceta (`dronMando(av, gi)`), y el toque para ir no debe pisar al anillo del Dron.

### B.6 Cuándo
Ya: no depende de la Quest ni de Q0. Conviene **tras AG-0.3** (la fila EV-2 ya lo pone), para que «táctil» lo diga `Aparato` y no tres lecturas distintas. No bloquea ni es bloqueada por nada más.

---

## Tareas propuestas para el PLAN
| Id | Tarea | Depende de | Peso · modelo |
|---|---|---|---|
| EV2-A0 | **Topes angulares de las láminas VR en Node**: función pura con px/m, distancia, cuerpo de letra, botones y huecos de cada lámina (panel, fichas, láminas del Bus) y guardián con 1,5° de texto, 2,5° de objetivo y 12 mm entre botones (cifras propias hasta verificarlas); corrige el hueco de 9,7 mm de la ficha de baliza | — | ligera · sonnet |
| EV2-A1 | **Fichas en el mundo** tras `?ui=capas`: la ficha de olivo y la de baliza se abren con `Laminas` colgadas junto a lo que describen (`Entidades.pos`), al apuntar o al acercarse, con la misma descripción de `Entidades`; componente propio, no dentro de `29_vr.js`; llamadas antes y después; nota de comodidad | Q0a, EV2-A0 | media · opus; 👤 Quest |
| EV2-A2 | **Panel que nace y se queda** tras `?ui=capas`: sin seguir a la cabeza, Y lo trae; panel pequeño con ajustes, gente y chat; lo personal sale de «Mundo»; se recoloca al teletransportarse | EV2-A1 | media · sonnet; 👤 Quest |
| EV2-A3 | **Menú de muñeca** en VR: girar la muñeca muestra hora, tu haza, hablar y volver (una lámina en el grip o en `wrist` con manos; muñeca según `controles.mano`) | EV2-A2 | media · opus; 👤 Quest |
| EV2-A4 | **Capa personal en pantalla**: «hora · tu haza · hablar · volver» juntos en el HUD con `Hud.icono` (barra en escritorio, esquina en móvil), nombres accesibles, contraste AA, sin estilos en línea | — | ligera · sonnet |
| EV2-A5 | (Condicional) **Prueba desechable de texto nítido**: el mismo panel en lienzo, en `XRQuadLayer` y en `@pmndrs/uikit` 1.0.78 (rama aparte): llamadas, peso, CSP (`'wasm-unsafe-eval'`) y nitidez en la Quest; no se fusiona | Q0d, AG-3a | media · opus; 👤 Quest |
| EV2-A6 | **Carteles de haza en la linde y tablón en la entrada**: como mucho 3 vivos por cercanía, lienzo ≤ 512 × 320, misma ficha de haza; llamadas medidas | EV2-A1 | media · sonnet |
| EV2-B1 | **`PalancaPuro`** en Node: zona muerta 15 %, velocidad proporcional, dirección relativa a la cámara y paso lateral; `actualizaPaseo` acepta un vector sin tocar teclado ni cruceta | AG-0.3 | ligera · sonnet |
| EV2-B2 | **Palanca flotante** con `nipplejs` 1.0.4 (MIT) tras `controles.palanca`/`?palanca=1`: nace donde apoyas el pulgar, mirar arrastrando la otra mitad, mano zurda cambia mitades, árbitro de punteros, zona de `Movibles`, cruceta como opción (WCAG 2.5.1/2.5.7); nota de comodidad | EV2-B1 | media · sonnet; 👤 móvil |
| EV2-B3 | **Toque para ir andando**: anillo de `Llegada`, línea de puntos (1 llamada, solo mientras se anda), andar (no saltar) rodeando troncos y parar con la palanca; la ficha de la haza pasa a otro gesto (pregunta 3); corrige el resumen del móvil de UX.md | EV2-B2 | media · opus; 👤 móvil |

## Preguntas para Antonio
1. **¿Texto con librería o con lo que hay?** Recomiendo **lo que hay** (láminas de lienzo) para A1-A4, y decidir uikit solo tras la prueba EV2-A5, porque uikit y troika no sirven hoy con el renderizador nuevo y uikit pide abrir la CSP a WASM.
2. **¿La CSP admitirá `'wasm-unsafe-eval'`?** Hace falta igual para KTX2 y meshopt (Q0d, AG-1.1/1.2). Recomiendo decidirlo **una vez, en Q0d**, no por cada librería.
3. **En el móvil, ¿el toque corto en el suelo lleva andando o abre la ficha de la haza?** Recomiendo **andar** (es lo que se espera en un juego) y dejar la ficha de la haza en su cartel y en «tu haza» del HUD.
4. **¿La palanca por defecto en táctil, o la cruceta hasta que la pruebes?** Recomiendo **cruceta por defecto** hasta tu prueba en el móvil y, si va bien, cambiar el defecto (la cruceta se queda en Configuración).

## Fuentes
- Meta, *Indirect interactions: best practices* — 0,8-3 m: https://developers.meta.com/horizon/design/indirect_interactions_bp/
- Meta, *Ray casting: best practices* (sin cifras de tamaño): https://developers.meta.com/horizon/design/raycasting_bp/
- Meta, *Typography* (14 px mínimo, 18 px cómodo, sin grados): https://developers.meta.com/horizon/design/styles_typography/
- MDN, *CSP: script-src* (`'wasm-unsafe-eval'`): https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src
- npm: https://www.npmjs.com/package/@pmndrs/uikit · https://www.npmjs.com/package/troika-three-text · https://www.npmjs.com/package/nipplejs · https://www.npmjs.com/package/three-mesh-ui (versiones, fechas, licencias y dependencias leídas de `registry.npmjs.org` el 2026-11-03; el código citado de cada paquete, de su tarball)
- GitHub: https://github.com/pmndrs/uikit (LICENSE MIT) · https://github.com/protectwise/troika · https://github.com/yoannmoinet/nipplejs
- Foro de three.js, troika con WebGPU: https://discourse.threejs.org/t/troika-three-text-and-webgpu/55737

## Lo [NO VERIFICADO]
Texto ≥ 1,5° por línea, objetivos de 2,5-3° y 12 mm entre botones (no están en las páginas de Meta consultadas); los 60 pt de visionOS (solo en resúmenes de terceros); ~25 px por grado de las Quest 3; que `MeshBasicMaterial` con `CanvasTexture` pase sin cambios a `WebGPURenderer`; que `style.cssText`/`el.style` por CSSOM no salte la CSP en el navegador; las dependencias de *worker* de troika; las 2-3 llamadas por panel de uikit (deducidas de su código); el peso de uikit en el paquete final; y si three 0.186.1 ofrece `XRQuadLayer` sin polyfill (lo estudia Q0d).
