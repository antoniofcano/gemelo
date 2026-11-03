# Immersive Web SDK (IWSDK) de Meta: ¿nos sirve?

Estudio Q2 ([PLAN](../rumbo/PLAN.md)), 2026-11-02, a petición de Antonio. **Solo estudio: no se adopta nada ni se escribe código de producto.** Las afirmaciones llevan su fuente al final; lo que no se ha podido comprobar en una fuente va marcado **[NO VERIFICADO]**. Nada de esto se ha probado en un casco (regla 7).

## Veredicto en cinco líneas
1. **No migrar el motor a IWSDK.** Es un framework completo (ECS, three propio, Vite 7, manifiesto de proyecto) que sustituiría lo que ya tenemos (ADR-0023, three 0.186.1, `29_vr.js`) y no aporta nada que nos falte para el paseo.
2. **Su prueba «con agentes en un Quest conectado» no vale para nuestra web:** exige una app IWSDK, y en el casco las herramientas de captura, consola y perfil devuelven `unsupported_on_target`. Solo mueve poses y mandos sintéticos.
3. **Lo que sí cierra casi todo el hueco de medir en el casco desde un agente son piezas que no son IWSDK:** `adb` + la depuración remota del Quest Browser (lo que hace `chrome://inspect`, por CDP), el arranque por `adb` directo a VR con `sessiongranted` (lo que IWSDK usa por dentro), y para GPU la CLI/MCP **`metavr`** de Meta (antes `hzdb`: capturas, logcat, trazas Perfetto con métricas de GPU por fotograma), que funciona con cualquier app pero tiene **licencia propietaria y telemetría**.
4. **IWER** (el emulador WebXR de Meta, MIT) **complementa** a `pruebas/mock_xr.js`: da manos articuladas, pellizco y mirada simulados, que nuestro mock no tiene. Merece una prueba acotada.
5. **Mirar y pellizcar**: en un Quest 3 no hay seguimiento ocular, así que no es una entrada real para nuestras familias en el casco que tenemos; se puede dejar pedida como característica opcional por casi nada, detrás de una bandera, sin prometer nada.

## 1. Qué es (comprobado)
- **Repositorio** `meta/immersive-web-sdk` (antes `facebook/immersive-web-sdk`), **licencia MIT**, monorepo pnpm con paquetes `@iwsdk/core`, `@iwsdk/cli`, `@iwsdk/create`, `@iwsdk/locomotor`, `@iwsdk/xr-input`, `@iwsdk/vite-plugin-dev`, `@iwsdk/scene-composition`, `@iwsdk/reference`. Último empuje al repositorio: 2026-10-23.
- **Versiones** (registro npm, consultado el 2026-11-02): `@iwsdk/core` 0.1.0 el 2025-09-17 (acceso anticipado), **1.0.0 el 2026-09-24**, 1.1.0-rc.0 a rc.2 en octubre. **La etiqueta `latest` de npm apunta a `1.1.0-rc.2`**, una versión candidata: quien instale «la última» se lleva una rc.
- **three:** `@iwsdk/core@1.0.0` y su plugin de Vite piden `three` como **`npm:super-three@0.181.0`**; la 1.1.0-rc.2 pide **`npm:super-three@0.185.0`**. `super-three` es la bifurcación de three.js de Supermedium (la de A-Frame), no three de npm. El plugin de desarrollo pide **Vite ^7** (nosotros, Vite 6.4.5).
- **Dependencias del núcleo** (1.1.0-rc.2): `elics` (el ECS), `@babylonjs/havok` (física), `@pmndrs/uikit` y `@drawcall/uikitml` (interfaz espacial), `@pmndrs/pointer-events` y `@pmndrs/handle`, `three-mesh-bvh`, `@preact/signals-core`. El plugin de desarrollo trae además `playwright`, `sharp`, `@iwer/devui` y `@vitejs/plugin-basic-ssl`.
- **Qué ofrece** (prensa y documentación): locomoción, agarre, audio espacial, física Havok, comprensión de escena, rayos al entorno, UIKitML, mirar y pellizcar; un navegador gestionado (Chromium de Playwright), emulación XR con IWER, editor de escenas y la CLI `iwsdk` con un servidor MCP (`iwsdk mcp stdio`) para agentes.

## 2. Probar y medir en un Quest por cable desde un agente

### 2.1 Lo que trae IWSDK: `--native-xr-control` (no nos sirve)
Novedad de la 1.0 (changelog de `@iwsdk/cli`: «opt-in native Quest WebXR control sessions, session-grant launch support… through an ADB-reversed localhost connection»). Cómo funciona, según la skill que genera el propio SDK (`iwsdk-native-xr-test`):
1. `adb devices` y elegir el número de serie del casco.
2. `npx @iwsdk/cli dev up --native-xr-control --no-open` (levanta el servidor de Vite de la app IWSDK).
3. `adb -s <serie> reverse tcp:<puerto> tcp:<puerto>` y `iwsdk runtime pair-headset` (da una URL de emparejamiento en `localhost`).
4. Lanza el navegador del casco **directo en VR** con
   `adb -s <serie> shell am broadcast -n com.oculus.vrshell/.ShellControlBroadcastReceiver -a com.oculus.vrshell.intent.action.LAUNCH -d apk://com.oculus.browser -e uri "ovrweb://vr?uri=<url codificada>"`.
5. Con `xr set-transform`, `xr look-at`, `xr select`, `xr set-gamepad-state`, `ecs query` y similares mueve la cabeza y los mandos **sintéticos** dentro de la sesión real (el navegador sigue dibujando y siguiendo).

Lo que **no** hace, dicho por la propia skill:
- **Necesita una app IWSDK** (importa `virtual:iwsdk-project` y lo pasa a `World.create()`); no es una herramienta para cualquier página WebXR.
- En el casco, **capturas, instantáneas, interacción, perfil y consola devuelven `unsupported_on_target`**: el perfil del SDK (`browser_profile`) solo mide el Chromium del ordenador y se rotula `calibrated: false`, `targetDevice: null`.
- El **permiso de entrar en VR inmersiva** puede salir la primera vez y **lo acepta una persona** en el casco («Do not automate that permission dialog»).
- Mientras dura, los mandos y manos físicos quedan sustituidos por los sintéticos.

**Conclusión 2.1:** para nuestro problema (fps y CPU/GPU reales del Quest) no aporta medida ninguna; solo maneja poses. Y exige adoptar el framework.

### 2.2 Lo que sí nos sirve, sin adoptar el framework
Tres piezas, todas con `adb` por USB:

| Pieza | Qué es | Qué nos da | Estado |
|---|---|---|---|
| **A. `adb reverse` + Quest Browser** | Ya documentado en [DESARROLLO-LOCAL](../operacion/DESARROLLO-LOCAL.md) (`adb reverse tcp:8743 tcp:8743`, `https://localhost:8743`) | Nuestra web servida desde el PC, en el casco, sin abrir la red | Lo usa ya Antonio |
| **B. Arranque directo en VR** | El `am broadcast … ovrweb://vr?uri=…` de arriba abre la URL en el Quest Browser y el navegador emite el evento **`sessiongranted`** en `navigator.xr`; una página que lo escuche puede llamar a `requestSession` sin pulsar un botón (es lo que hace `launchOnSessionGranted` de IWSDK, `packages/core/src/init/session-grant.ts`) | Entrar en VR desde un comando, y con `&mide=60` medir sin que nadie pulse nada | **[NO VERIFICADO]** con nuestra web: el broadcast y el evento están en el código de IWSDK, no los hemos probado; hace falta una línea en `29_vr.js` (escuchar `sessiongranted`, solo con `?mide` o `?debug`) |
| **C. Depuración remota por CDP** | Lo que hace `chrome://inspect/#devices` (documentación de Meta «Debug Browser content»): el Quest Browser expone el protocolo de DevTools por `adb` | Desde un script de Node, leer `window.__mide()`, `window.__vrDebug()` y la consola, recargar y, con DevTools, grabar un perfil de rendimiento del propio navegador del casco | **[NO VERIFICADO]**: que `playwright-core` (ya en el repo) o un cliente CDP simple se enganche al socket del Quest Browser con `adb forward` como lo hace `chrome://inspect`, y que `Runtime.evaluate` responda **durante** la sesión inmersiva |
| **D. `metavr` (antes `hzdb`)** | CLI y servidor MCP de Meta para Horizon OS: `device`, `app`, `capture` (capturas y vídeo), `log` (logcat), `shell`, `perf` (trazas Perfetto: capturar, analizar, consultar con SQL, métricas de GPU por fotograma), `adb`, `docs`, `mcp` | Lo que hoy da a mano el OVR Metrics Tool, pero por comando: capturas del casco y **GPU/CPU por fotograma** con Perfetto | Funciona a nivel de sistema, no de app; que la traza separe bien el trabajo del Quest Browser **[NO VERIFICADO]**. Licencia propietaria y telemetría (§6) |

**Qué se podría automatizar** con A+B+C(+D): abrir nuestra URL con perillas (`?debug&mide=60&xrnivel=…`), entrar en VR (tras el primer permiso), medir 60 s, leer el informe de `?mide` y `__vrDebug()` (nivel, perillas, triángulos), capturar pantalla, grabar una traza Perfetto con GPU y repetir N veces cambiando una sola perilla. Es exactamente el protocolo de [OPTIMIZACION](OPTIMIZACION.md#protocolo-de-medida-q0a), sin que Antonio copie a mano.

**Qué no:** aceptar el permiso de VR y los avisos de certificado (una persona, una vez), ponerse el casco si el sensor de proximidad lo exige para dibujar a ritmo normal **[NO VERIFICADO]**, andar con los mandos físicos (con el casco quieto la medida es de «parado», no de paseo: para el paseo hace falta una persona o un recorrido automático por URL, que hoy no tenemos), la térmica y la comodidad.

**Frente a lo que ya hacemos a mano:**
- `chrome://inspect` por USB: es la pieza C, pero con una persona delante del ordenador. El estudio propone lo mismo, guiado por un script.
- OVR Metrics Tool: superposición en el casco que Antonio lee y anota; `metavr perf` da lo mismo en fichero (Perfetto), comparable entre medidas.

**¿Cierra el hueco de medir en el casco desde un agente?** **En buena parte sí, pero no con IWSDK.** Con el casco conectado, encendido y el permiso aceptado una vez, un agente podría lanzar, medir y recoger sin que Antonio copie nada; seguiría haciendo falta Antonio para enchufar, aceptar el primer permiso y para la parte de paseo y comodidad. Sigue siendo **una sola Quest y un solo Chrome/adb a la vez** (va por el banco, regla de TESTING).

### 2.3 Prueba de una hora (cuando Antonio pueda conectar el Quest)
Ver el plan completo en [§8](#8-plan-de-prueba-pequeña-con-el-quest).

## 3. Emulación: IWER frente a `pruebas/mock_xr.js`
- **IWER** (`iwer` 2.7.0 en npm, **MIT**, © Meta; repositorio `meta-quest/immersive-web-emulation-runtime`): implementa la API WebXR en el propio navegador. Se instala en cualquier página, no solo en IWSDK: `new XRDevice(metaQuest3).installRuntime()`. Trae perfiles de casco (Quest 1, 2, 3, Pro; IWSDK añade «Meta VR Glasses» con fuente de mirada), mandos (`updateButtonValue`, `updateAxes`), **manos articuladas con poses y pellizco** (`updatePinchValue`), grabación y reproducción de acciones, entorno sintético para RA y una interfaz de depuración aparte (`@iwer/devui`). Dependencias: `gl-matrix` y `webxr-layers-polyfill`. Por defecto dibuja solo el ojo izquierdo (el estéreo es opcional).
- **Nuestro `mock_xr.js`** (60 líneas): sesión, espacios, vista estéreo, dos mandos con palancas, botones, gatillo y hápticos registrados, perfiles de mando controlables (I6), `supportedFrameRates` y banderas para simular el iframe bloqueado. **No tiene manos** (VR.md: «Las manos no se pueden simular con el mock: sin medir»).
- **Relación:** **complementa, no sustituye por ahora.** Nuestras pruebas dependen de detalles del mock (registro de pulsos, perfiles a elección, marco bloqueado, `fotogramas`); cambiar de golpe rompería `prueba_vr.js`, `llegada.test.js`, `vr_gente.test.js`, `escena3d.test.js` y `prueba_vr_perillas.js`. Pero IWER cubre lo que nos falta: **manos, pellizco y mirada**, y regla 12 pide no seguir ampliando un mock casero si una librería mantenida lo resuelve. Propuesta: una prueba nueva y separada con IWER para manos (I6) y, si va bien, decidir si el mock se retira.
- **Coste y riesgos:** IWER se inyecta en la página de prueba (Playwright `addInitScript` con el paquete empaquetado), solo en `pruebas/`, nunca en el motor publicado; ~3,9 MB desempaquetado en npm. Sigue siendo SwiftShader: recuentos, no fps (regla 7). Que IWER funcione con el `XRWebGLBinding`/capas de proyección que usa three 0.186.1 **[NO VERIFICADO]** (trae el polyfill de capas).

## 4. Mirar y pellizcar (`gaze-and-pinch`)
- **Qué es en IWSDK:** la mirada es un único rayo para toda la sesión; un pellizco de cualquier mano es el «seleccionar». IWSDK la pide como característica WebXR **`gaze-tracking`** (la que, según su código, acepta hoy el Quest Browser y la que hace aparecer una `XRInputSource` con `targetRayMode === "gaze"`) y añade **`eye-tracking`** (el nombre del borrador del W3C) como opcional. Filtra la mirada (filtro 1€), elige objetivo con un cono de 5°, espera 0,15 s de consenso y **no pone cursor** por defecto (cada objetivo debe resaltar al mirarlo). Si no hay mirada, vuelven los rayos de mano o mando.
- **Qué cascos:** la documentación de IWSDK la prueba con «Meta VR Glasses» emuladas y tiene un apartado «probar en un casco **sin seguimiento ocular**» que **simula la mirada con la cabeza** solo en desarrollo («no valida la precisión»). El **Quest 3 y el 3S no tienen seguimiento ocular** (el Quest Pro sí) **[NO VERIFICADO en una fuente de esta revisión; dato de ficha técnica]**: en nuestro casco, la mirada real no existe. Qué versión de Horizon OS o del Quest Browser la ofrece: **no lo dice Meta** (lo constata Mixed News). El Vision Pro usa otro modo, `transient-pointer` (mirar y pellizcar en Safari, según UploadVR), que no es `gaze`.
- **Cómo se pide con three 0.186.1:** three no la pide sola; nuestra sesión ya se abre a mano en `29_vr.js` (`requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] })`), así que bastaría añadir `"gaze-tracking"` (y `"eye-tracking"`) a `optionalFeatures` **detrás de una bandera**. Las características opcionales desconocidas se ignoran; una obligatoria desconocida tumbaría la sesión (lo dice el código de IWSDK), así que **siempre opcional**.
- **Cómo encajaría:** `29_vr.js` ya distingue la fuente `gaze` (oculta la línea del rayo en ese caso) y su `selectstart` pasa por `vrGatillo`, que usa el rayo de esa fuente: el rayo de `Usables` (C7) ya elige olivo, baliza o botón. Faltaría: (1) resaltar el objetivo mirado (sin cursor, la persona no sabe qué va a pulsar), (2) decidir qué fuente lanza el `select` del pellizco en el Quest Browser (la de mirada o la de la mano) **[NO VERIFICADO]**, (3) que `36_mandos.js` no dibuje mando para la fuente `gaze` (ya filtra `tracked-pointer`), (4) una nota de comodidad.
- **Familias mayores (skill `interaccion`):** mirar y pellizcar evita aprender botones y palancas, que es lo que más cuesta; pero sin cursor, con temblor o vista cansada, puede pulsar sin querer («efecto Midas») y **no sirve para andar ni girar**. Para nuestro uso (olivar, panel de 1 m, botones de 6 cm) el rayo con el mando o con la mano y el pellizco ya existen (I6) y son lo que se puede probar hoy en un Quest 3.
- **Coste honesto de una opción experimental detrás de bandera** (`?mirada=1`): ligera, ~1 sesión de agente sonnet: pedir las dos características opcionales, registrar en `__vrDebug()` y en la línea `WebXR:` si se concedió y si hay fuente `gaze`, resaltado del objetivo mirado reutilizando el `hover` del panel, prueba en Node y con IWER (mirada emulada). **Sin valor real hasta tener un casco con seguimiento ocular** (Quest Pro o las gafas de Meta). Recomendación: **no hacerlo ahora**; dejarlo como idea.

## 5. ¿Adoptarlo? No. Qué piezas sí
| Tema | IWSDK | Nosotros | Juicio |
|---|---|---|---|
| Arquitectura | ECS (`elics`), mundo, sistemas, manifiesto `iwsdk.config.json` y escenas `.iwsdk.scene.json` | Motor concatenado `apps/web/motor/NN_*.js` con componentes registrados, fases y bus (ADR-0023), que **ya descartó un ECS general** (alternativa C) | Migrar es reescribir el motor (big bang), lo que ADR-0023 evitó |
| three | `super-three@0.181.0` (1.0) / `0.185.0` (1.1 rc), una bifurcación | three 0.186.1 de npm (ADR-0016), con 3D Tiles (3DTilesRendererJS 0.5.3), VRM y parches de sombreador vigilados | Bajar de versión y cambiar de distribución rompe los guardianes de `web.test.js` y obliga a revisar cada trozo parcheado; no hay ganancia |
| Build | Plugin de Vite ^7, pnpm, Playwright completo | Vite 6.4.5, `playwright-core` | Subir Vite y meter Chromium completo solo por esto, no |
| Locomoción, UI, física | Locomotor, UIKitML, Havok | Paseo, teletransporte, giro, vuelo, mirador, panel por filas, láminas, fichas; sin física (no la necesitamos) | Ya está y está escrito a medida del olivar; Havok sería una dependencia WASM sin uso |
| Constructor de olivos | — | three 0.128 en su herramienta, salida GLB | No le afecta en nada |
| Herramientas de agente | MCP sobre el Chromium del PC con IWER | Banco, `mock_xr.js`, guardianes | Útiles solo para apps IWSDK |

**Piezas que sí aprovecharía, por orden de valor:**
1. **El arranque por `adb` con `sessiongranted`** (idea y comando, no código: son ~15 líneas nuestras en `29_vr.js`). Coste: ligero.
2. **Un script de medida en el casco** con `adb` + CDP (pieza C) que reúse `30_mide.js` y `02f_xr_perillas.js`. Coste: medio, más una hora de Antonio.
3. **IWER en las pruebas** para manos, pellizco y mirada simulados. Coste: ligero-medio; MIT.
4. **`metavr perf`** para GPU, **solo si Antonio acepta su licencia y su telemetría** (o seguir con el OVR Metrics Tool a mano).

Coste de migrar entero, para tener la cifra: el motor tiene del orden de 50 módulos y cientos de nombres compartidos (ADR-0023); pasarlo a ECS, cambiar three y Vite y rehacer pruebas sería semanas de agente y una regresión visual segura **[SUPUESTO]**. No compensa.

## 6. Licencia, madurez y riesgos
- **Licencias:** IWSDK y IWER, **MIT** (compatibles con el repo público). **`@meta-quest/metavr`: «Meta Platform Technologies SDK License»** (propietaria), y su binario se **descarga del CDN de Meta en la primera ejecución**: no se declara como dependencia del repo; si se usa, se instala en el PC de Antonio, fuera del repo.
- **Telemetría:** la CLI de IWSDK (1.0.1) **informa de cada orden y herramienta MCP** (nombre, duración, si falló, motivo fijo, id de sesión, versión) **a través de `metavr`** cuando `@meta-quest/metavr` está instalado en el proyecto (`packages/cli/src/metavr-telemetry.ts`); sin `metavr`, no manda nada. Qué manda `metavr` por su cuenta y si se puede apagar: **[NO VERIFICADO]**. Nada de esto va en la web publicada.
- **Otras descargas:** `iwsdk reference warmup` baja un modelo y un corpus de URLs públicas; el plugin instala Chromium de Playwright. Todo de desarrollo, nunca en el motor.
- **Madurez:** 1.0 estable desde el 2026-09-24, versión única para todos los paquetes y cambios rompedores solo en versión mayor (changelog), pero la **etiqueta `latest` de npm es una rc** y la 1.0 ya avisa de cambios incompatibles en el arranque (`browserCommandReady`, `runtime wait`) y de actualizar CLI y plugin juntos. Repo activo (último empuje 2026-10-23). Dependencia fuerte de Meta y del Quest Browser (la parte nativa solo funciona en él).
- **Nuestras reglas:**
  - *Repo público sin claves ni datos* (regla 4): la CLI escribe credenciales locales en `.iwsdk/runtime/`; si alguna vez se usara, esa carpeta va al `.gitignore`. El número de serie del casco no se escribe en el repo.
  - *CSP estricta y sin hosts externos en el motor*: nada de lo propuesto entra en la web publicada; IWER solo en `pruebas/`, `adb`/CDP/`metavr` fuera del navegador. El arranque por `sessiongranted` es un evento local del navegador.
  - *Datos de la explotación*: las capturas del casco de Hituelo son datos de la finca: no se versionan; se guardan fuera del repo como las demás medidas.

## 7. Comparación rápida de caminos para medir en el casco
| Camino | Sin adoptar IWSDK | Da fps/ms del casco | Da GPU/CPU | Sin persona | Licencia |
|---|---|---|---|---|---|
| Hoy: `?debug&mide` + copiar a mano | sí | sí | no | no | nuestra |
| Hoy: OVR Metrics Tool a mano | sí | sí | sí | no | Meta |
| IWSDK `--native-xr-control` | **no** | no | no | casi | MIT (+telemetría con metavr) |
| A+B+C (adb, `sessiongranted`, CDP) | sí | sí (nuestro `?mide`) | no (solo perfil de DevTools) | casi (permiso y paseo) | nuestra + adb |
| + D (`metavr perf`, Perfetto) | sí | sí | **sí** | casi | propietaria, telemetría |

## 8. Plan de prueba pequeña con el Quest
Una hora, con Antonio delante; el agente prepara y anota, Antonio enchufa y acepta. **Antes:** Quest en modo desarrollador con depuración USB (aplicación del móvil y Meta Quest Developer Hub), cable USB-C de datos, `adb` en el PC (viene con MQDH o con las Android Platform Tools; en Windows, el controlador USB de Meta si `adb devices` no lo ve), entorno local arriba (`npm run dev:arriba`) y sesión iniciada en el navegador del casco.

| Paso | Qué se hace | Qué se comprueba | Qué se registra |
|---|---|---|---|
| 1 | `adb devices` | El casco sale como `device` (si sale `unauthorized`, aceptar en el casco) | Modelo, versión de Horizon OS y del Quest Browser |
| 2 | `adb reverse tcp:8743 tcp:8743`; abrir a mano `https://localhost:8743/finca/?debug` | Carga, línea `WebXR: soportado` | Captura (A) |
| 3 | En el PC, `chrome://inspect/#devices`; ver la pestaña del casco; en su consola, `JSON.stringify(window.__vrDebug && window.__vrDebug())` | Se ve la pestaña y responde | Si responde fuera y **dentro** de VR (entrar con el botón y repetir) |
| 4 | `adb forward tcp:9222 localabstract:chrome_devtools_remote` y `curl http://localhost:9222/json` **[NO VERIFICADO el nombre del socket; si no, `adb shell cat /proc/net/unix \| grep devtools`]** | Lista de pestañas en JSON | Nombre del socket real |
| 5 | El agente, con `playwright-core` `chromium.connectOverCDP("http://localhost:9222")`, lee `window.__mide()` | Playwright se engancha al Quest Browser | Sí/no y el error si falla |
| 6 | Arranque directo: `adb shell am broadcast -n com.oculus.vrshell/.ShellControlBroadcastReceiver -a com.oculus.vrshell.intent.action.LAUNCH -d apk://com.oculus.browser -e uri "ovrweb://vr?uri=<https://localhost:8743/finca/?debug%26mide=60 codificada>"` | Se abre la página en el casco; si sale el permiso de VR, Antonio lo acepta | Si el navegador emite `sessiongranted` (comprobar en la consola por CDP con un `addEventListener` puesto a mano antes) |
| 7 | Medida de «parado» por comando: entrar en VR con el botón, casco puesto y quieto 60 s, leer `__mide()` por CDP | El informe llega entero sin copiar | Informe completo de `?mide` (formato v2 de Q0e) y la línea `VR: …` |
| 8 | Repetir 7 con `&xrnivel=0` y `&xrnivel=3` | Una sola perilla cada vez | Tres informes; ¿cambia el p95 con el nivel? (indicio CPU/GPU) |
| 9 | (Opcional, solo si Antonio acepta la licencia y la telemetría de `metavr`) `metavr capture screenshot` y una traza `metavr perf` de 20 s durante el paso 7 | Hay traza con fotogramas de GPU | Fichero de traza fuera del repo; tiempo de GPU por fotograma |
| 10 | Limpiar: `adb reverse --remove-all`, `adb forward --remove-all` | — | Tiempo total y qué pasos pidieron a Antonio |

**Resultado esperado:** una tabla «se puede / no se puede» por paso, que decide si se escribe el script de medida (tarea Q2b). Nada de esto toca el código del motor salvo, si el paso 6 confirma `sessiongranted`, la línea de Q2c.

## 9. Tareas propuestas para el PLAN
| Id | Tarea | Depende de | Peso · modelo |
|---|---|---|---|
| Q2a | 👤 Prueba de una hora con el Quest (§8): ¿responde CDP dentro de VR, se engancha `playwright-core`, emite `sessiongranted` el arranque por `adb`? | Q2 | ligera · haiku (guion y anotación); 👤 Quest |
| Q2b | Script de medida en el casco en `pruebas/` (nombre propuesto: quest_mide.js, aún no existe): por `adb` + CDP abre la URL con perillas, espera, lee `__mide()` y `__vrDebug()`, guarda el informe fuera del repo y repite N veces; una sola Quest a la vez por el banco | Q2a, Q0b | media · sonnet; 👤 Quest |
| Q2c | Entrar en VR con `sessiongranted` solo con `?mide` o `?debug` (`29_vr.js`), con su prueba en Node y con el mock; nota de comodidad (entrar sin pulsar puede sorprender: solo para medir) | Q2a (si confirma el evento) | ligera · sonnet |
| Q2d | IWER en las pruebas: una prueba separada de manos y pellizco (I6) con `iwer` fijado; decidir después si sustituye a `mock_xr.js` | — | ligera-media · sonnet; 🔶 banco |
| Q2e | (Condicional) `metavr perf` para GPU en Q0a/Q0c | decisión de Antonio (licencia y telemetría) | ligera · sonnet; 👤 Quest |
| — | Mirar y pellizcar detrás de `?mirada=1`: **idea sin fecha** hasta tener un casco con seguimiento ocular | casco con mirada | ligera · sonnet |

## Fuentes
- Repositorio de IWSDK: https://github.com/meta/immersive-web-sdk (licencia, paquetes, `docs/ai/index.md`, `docs/ai/mcp-tools.md`, `docs/concepts/xr-input/gaze.md`, `packages/core/src/init/xr.ts`, `packages/core/src/init/session-grant.ts`, `packages/cli/CHANGELOG.md`, `packages/cli/src/metavr-telemetry.ts`; leídos por la API de GitHub el 2026-11-02).
- Skill del SDK para el casco: https://tessl.io/registry/skills/github/facebook/immersive-web-sdk/iwsdk-native-xr-test
- Guía de pruebas de IWSDK (IP, `chrome://inspect` y reenvío de puertos, IWER): https://developers.meta.com/horizon/documentation/web/iwsdk-guide-testing-experience/
- Registro npm (`npm view`, 2026-11-02): `@iwsdk/core`, `@iwsdk/cli`, `@iwsdk/vite-plugin-dev`, `iwer`, `@meta-quest/metavr`, `super-three`.
- IWER: https://github.com/meta-quest/immersive-web-emulation-runtime y https://meta-quest.github.io/immersive-web-emulation-runtime/
- Prensa: https://mixed-news.com/en/?p=34609 (1.0 el 24 de septiembre, mirar y pellizcar, sin cascos ni versiones confirmados).
- Notas de versión de Meta: https://developers.meta.com/vr/downloads/package/immersive-web-sdk/v1.0/ y el blog https://developers.meta.com/vr/blog/immersive-web-sdk-1-0/ (se cargan con JavaScript; solo se ha visto su resumen en el buscador: `--native-xr-control`, `browserCommandReady`, `runtime wait`).
- Depuración remota del Quest Browser: https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/
- `metavr` / `hzdb`: https://cdn.jsdelivr.net/npm/@meta-quest/metavr@1.10.0/README.md, https://developers.meta.com/horizon/documentation/web/ts-mqdh-mcp y https://developers.meta.com/horizon/essentials/ai-tooling-overview/
- Vision Pro y `transient-pointer`: https://www.uploadvr.com/webxr-apple-vision-pro-input-system/
