# Gemelo en VR (Meta Quest) — versión de pruebas

Estado (2026-10-28): **escrito y probado con un WebXR simulado en Chrome; sin probar en un casco real.** Todo lo que dice «en el Quest» está sin comprobar hasta que lo mires tú.

## Qué hace
Un botón **«🥽 Entrar en VR»** (junto a «⛶», arriba del visor) que **solo aparece si el navegador ofrece WebXR** (`navigator.xr` y `isSessionSupported('immersive-vr')`). Si no, la página se comporta exactamente como antes.

Al entrar:
- Empieza el **paseo en primera persona** (el mismo sistema de siempre: perros, conejos, pájaros, huellas, sonido, balizas) en el modo **Gemelo**. El muñeco va oculto.
- La cabeza se coloca sobre el terreno (`suelo(x,y)·exageración`) con la altura de ojos del suelo de la habitación (`local-floor`; si el casco no lo ofrece, 1,6 m).
- Se aplica un **perfil de rendimiento** propio (abajo) y, al salir, se restaura el modo, la calidad y la cámara.

## Controles (mandos Touch del Quest)
| Mando | Acción |
|---|---|
| Palanca izquierda | Andar y desplazarse de lado, **relativo a hacia dónde miras** |
| Grip izquierdo (mantener) | Correr (4,3 m/s en vez de 1,7) |
| Palanca derecha ← → | **Girar a saltos de 30°** (en torno a tu cabeza; anti-mareo) |
| Palanca derecha ↑ (mantener) y soltar | **Teletransporte**: sale un arco azul, al soltar saltas al punto de caída |
| Gatillo derecho | Pulsa un botón del panel; sobre un olivo, abre su **ficha** |
| Botón A (derecho) | Activa/desactiva el **vuelo** (la palanca izquierda avanza hacia donde miras, 10 m/s; con grip, 30 m/s) |
| Botón B (derecho) | **Mirador**: te sube a ~230 m sobre el suelo y vuela; otra vez B te baja |
| Botón Y (izquierdo) | Muestra/oculta el **panel** |
| Botón X (izquierdo) | Activa/desactiva la **viñeta** de confort |

El **panel flotante** (1 × 0,75 m, a ~1 m delante, te sigue con calma si te alejas o giras mucho) tiene: modo (Nube LiDAR / Gemelo / Ortofoto), hora, fecha NDVI, exageración, parcela anterior/siguiente (te lleva a ella), sonido, viñeta y **Salir de VR**. Las balizas y las fichas de olivo salen en una **tarjeta flotante** que se cierra sola a los 14 s.

## Cómo probarlo en el Quest (paso a paso)
1. En el Quest abre el **navegador** y entra en tu cuenta de claude.ai. Abre el enlace del artefacto de VR **añadiendo `?debug` al final de la dirección**.
2. Antes de nada, mira el contador de la esquina inferior izquierda: la línea **`WebXR: …`** es la prueba de plataforma:
   - `soportado` → debería aparecer el botón «🥽 Entrar en VR». Púlsalo.
   - `soportado (dentro de un marco; si al entrar falla, es el marco)` → el botón aparece, pero hay que ver si deja entrar. Si al pulsar sale `no se pudo entrar: … SecurityError …`, **el marco del artefacto bloquea WebXR** (permiso `xr-spatial-tracking`): dímelo, es el plan B (ver abajo).
   - `bloqueado por el marco (…)` → el navegador dice que el marco no concede el permiso; no hay botón.
   - `no soportado (…)` → sin casco o sin modo VR inmersivo.
   - Lo mismo sale en la consola del navegador con el prefijo `[VR]`.
3. Dentro, mira el contador (o desde fuera, en el espejo del navegador): `VR nivel N · x ms/fot · JS y ms`. **Lo que necesito de ti:** si va a 72 fps fijos, qué nivel de calidad marca tras 1 minuto andando, y si el nivel baja con el tiempo.
4. Prueba, por este orden: andar, correr, girar, teletransporte, abrir/cerrar el panel (Y), cambiar el modo, la hora, saltar a otra parcela, apuntar a un olivo + gatillo, vuelo (A), mirador (B), salir.
5. Dime sobre todo: **¿te mareas?**, ¿se lee el panel?, ¿el rayo apunta donde crees?, ¿hay tirones al cargar teselas?

**Plan B si el marco bloquea WebXR:** la versión de Hituelo/Cerro se puede publicar como página propia (no como artefacto), o mostrar el gemelo dentro de un `<iframe allow="xr-spatial-tracking">` en una página tuya. Es una decisión de publicación, no de código.

## Medir con el medidor
Para la prueba T7 (criterios 5 y 6 de [ADR-0015](../adr/0015-escena-en-3d-tiles.md)) no hay que calcular a ojo: el motor trae un **medidor** (`apps/web/motor/30_mide.js`). Sin `&mide` ni botón pulsado **no hace nada** (coste cero: el bucle solo mira un booleano).

**Qué mide.** Durante N segundos (60 por defecto, `&mide=N`, de 1 a 600) y **tras 3 s de calentamiento**, el intervalo entre fotogramas (en VR, entre fotogramas XR) y, aparte, los ms de JS de cada fotograma. No cuenta los fotogramas con la pestaña oculta (en VR no se aplica esa regla). Al terminar da: nº de fotogramas, mediana, p95, p99 y peor (ms), fotogramas por encima de 13,9 ms (nº y %), nivel de `VR_PERFILES` al empezar, al terminar y cada cambio (solo en VR), escena (`?escena=tiles` o no), banderas de olivos de la URL (`escena`, `olivos`, `arbsc`, `tiles`, `lod`, `calidad`), olivos por nivel, aparato (VR o pantalla y el `userAgent` resumido a producto, versión y sistema) y fecha. Estadística: percentil por rango más próximo; mediana = media de los dos centrales.

**Cuándo empieza.** Con `&mide=N` el medidor queda armado: en VR empieza **al entrar en la sesión**; en pantalla, a los 4 s de cargar si el navegador no ofrece VR. Con el botón (**«Medir 60 s»** en el panel de VR y en la caja de `?debug`, abajo a la derecha) empieza al momento, en el modo en que estés; en VR el panel se oculta mientras dura la medida para no tapar la vista.

**Dónde se ve y se guarda.**
- En VR, al terminar el panel vuelve con una **tarjeta** (letra de ~2,8 cm en un panel de 1 m) y un botón **«Cerrar»** que se pulsa con el gatillo.
- En pantalla, en la caja de `?debug`, con un botón **«Copiar»** (texto plano para pegar). El contador de `?debug` enseña además una línea `medida: …` mientras corre.
- `localStorage` guarda las **últimas 10** medidas (clave `gemelo_mide`; si el navegador no lo deja, no pasa nada). `window.__mide()` devuelve `{ estado, n, resultado, texto, historial }` para las pruebas.

**Protocolo de T7 (Quest).**
1. Pon el Quest, abre el navegador y carga la escena **A** (la de hoy): `/finca/?debug&mide=60`. Pulsa «Entrar en VR». La medida empieza sola al entrar.
2. Anda un minuto por el olivar (palanca izquierda; sin abrir el panel). A los 3 s ya cuenta; no hace falta quedarse quieto.
3. Al terminar vuelve el panel con la tarjeta: léela y cierra con «Cerrar». Para copiarla, **sal de VR**: la caja de `?debug` (abajo a la derecha en la página) conserva el resultado y tiene «Copiar»; pégalo en el informe. Si se pierde, `localStorage` guarda las últimas 10 (`window.__mide().historial`). [SUPUESTO: que el navegador del Quest deje copiar al portapapeles con el botón; no probado, y si no, se lee el texto de la caja y se anota a mano.]
4. Repite con la escena **B** (3D Tiles): `/finca/?escena=tiles&debug&mide=60`, por el mismo camino y a ser posible con el mismo recorrido.
5. Criterio 5: **p95 del intervalo ≤ 13,9 ms** en B (la tarjeta lo dice). Anota también el nivel de `VR_PERFILES` al terminar y si hubo cambios: un p95 bueno a costa de bajar de nivel no es lo mismo que uno bueno en el nivel 0.

**Protocolo para el criterio 6 (escritorio).** En el Chrome del ordenador, con GPU real y la misma ventana: `/finca/?debug&mide=60` (A) y `/finca/?escena=tiles&debug&mide=60` (B). Espera a que termine (empieza a los 4 s de cargar), pulsa «Copiar» y pega. Criterio: B no es peor que A en mediana ni en p95. No muevas la ventana ni cambies de pestaña (lo oculto no cuenta, pero el recorrido sería otro).

**Lo que no dice.** La medida es del aparato donde corre: con renderizado por software (SwiftShader) los números **no son fps** (CLAUDE.md, regla 7). El intervalo en VR se toma al llamar el bucle XR del navegador, no con la marca de tiempo del sistema; sirve para comparar A con B en el mismo aparato, no como medida absoluta. La prueba `pruebas/guardianes/mide.test.js` comprueba la estadística y que `&mide=5` termina y devuelve números (con `GEMELO_VR=1`, también con el WebXR simulado); **no está probado en un Quest real**.

## Perfil de rendimiento VR
- Antes de la sesión: factor de resolución del búfer **0,9**. Al entrar: **foveación fija máxima** (`XRWebGLLayer.fixedFoveation = 1`, si existe) y petición de **72 Hz** (`updateTargetFrameRate`, si el casco lo ofrece).
- Modo **Gemelo** forzado (la nube LiDAR no se dibuja), calidad de follaje **baja**, `near` 0,3 / `far` 6.000.
- Olivos: tope de nivel 0 ×0,8, radio ×0,75 y presupuesto de 380.000 triángulos (el de escritorio es 550.000). Hierba: radio de 32 m.
- **Adaptador**: cada 4 s mira el tiempo de fotograma; si el JS pasa de 13 ms o se pierden fotogramas (>15,2 ms con 72 Hz) **baja un nivel** (hasta 4 niveles: olivos ×0,55/×0,35/×0,2, hierba 20 m → 0, 270.000 → 130.000 triángulos); si va holgado 25 s seguidos, sube. Se ve en `?debug`.
- Objetivo de diseño: ≈ 0,5–0,7 M triángulos **por ojo**, ≈ 150 llamadas. **No está medido** (en Chrome sin GPU no hay forma de medirlo).

## Lo que se probó y cómo
`mock_xr.js` simula `navigator.xr`: sesión, espacio de referencia, vista estéreo (dos vistas), dos mandos con palancas, botones y gatillo. `prueba_vr.js` entra, anda, gira, teletransporta, usa el panel (apuntando el mando a cada botón), abre la ficha de un olivo, vuela, va al mirador, corre, sale, vuelve a entrar y sale con el fin de sesión del sistema. Resultado y cifras de no regresión: ver los registros de la propia prueba (`pruebas/salida/vr/`).

## Lo que NO está probado (hardware real)
- **Todo en el casco**: que el botón aparezca dentro del marco del artefacto, que la sesión arranque, la pose real de cabeza y mandos, el mapeo de botones/palancas del Quest (se asumió `xr-standard`: palanca = ejes 2–3, gatillo 0, grip 1, A/X 4, B/Y 5).
- **Rendimiento real** (fps, foveación, resolución 0,9, MSAA del contexto que ya viene activado), y si el adaptador reacciona bien.
- **Confort**: la viñeta, el giro de 30° y el mirador a 230 m pueden marear; el mirador en concreto es un cambio brusco de altura.
- **Legibilidad y ergonomía** del panel y de las fichas, el rayo y su puntería, los hápticos (`pulse`).
- Que el **audio** arranque al entrar (se activa con el gesto del botón; algunos navegadores lo exigen otra vez).
- **Seguimiento de manos** (sin mandos): no hay soporte.
- La lectura en vivo por MCP (Olivartrack/Vigía) **dentro de VR**: no se probó.

## Límites conocidos / decisiones
- La cámara cuelga de un grupo («rig»): r128 no podía desplazar el espacio de referencia y, con three 0.186.1, el rig se conserva tal cual (ADR-0016). Mientras dura la sesión `camera.position` es la pose local de la cabeza; la cabeza en el mundo es `VRX.cab`. El resto del programa sigue leyendo `camera.position` porque `actualizaPaseo()` lo deja en el mundo justo antes de usarlo.
- No hay colisión con troncos a la altura de la cabeza al caminar en el cuarto (solo con el desplazamiento por palanca/teletransporte); salir de los límites de la finca está acotado.
- El mirador y el vuelo suben fuera del radio de los olivos de nivel 0; el perfil sigue aplicándose.
- Sin `bounded-floor` ni guardián propio: el guardián del Quest manda.
- Si el casco no ofrece `local-floor`, se usa `local` con 1,6 m de altura de ojos.

## Dónde está en el código
Todo vive ya en `apps/web/motor/` (integrado en el repo): `29_vr.js` (el modo VR completo), `30_mide.js` (el medidor de fotogramas), `90_final.js` (bucle `cuadro()` compartido), `07b_arboles.js` (`Arboles.perfil`), `21_suelo.js` (radio de la hierba en VR), `09_camara.js` (`eligeCopa`), `28_depura.js` (línea `WebXR: …`), `01_datos.js` (`VRP`). Contrato: [CONTRATOS.md](CONTRATOS.md#vr-29_vrjs); decisión: [ADR-0005](../adr/0005-webxr-perfil-propio.md).

## Probar
```
# con el WebXR simulado (mock_xr.js vive en pruebas/): montar una página y abrirla por file:// o por servidor
python tuberia/salida_artefacto/montar_v2.py --finca cerro --salida pruebas/salida/vr/cerro.html
node pruebas/prueba_vr.js "file:///<ruta absoluta>/pruebas/salida/vr/cerro.html" pruebas/salida/vr/cap
node pruebas/prueba_vr.js <url> pruebas/salida/vr/cap sinxr       # sin WebXR: no hay botón, 0 errores (esta sí está en la puerta)
GEMELO_VR=1 npm run puerta                                         # incluye la prueba VR completa con el mock
```
`mock_xr.js` y `prueba_vr.js` se recuperaron de la carpeta de trabajo original y se adaptaron (sin rutas locales). **Aviso:** con el renderizado por software de la máquina de desarrollo, la prueba completa se llegó a caer («Target crashed») en pasos distintos tras superar ~25 comprobaciones; no se ha diagnosticado si es el entorno o memoria, por eso es opcional en la puerta (PLAN P4).
