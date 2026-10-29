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
| Palanca derecha ↑ (mantener) y soltar | **Teletransporte**: andando, sale un arco azul y al soltar saltas al punto de caída. **Volando o en el mirador**, sale un rayo recto hasta el suelo con un **anillo ámbar** en el punto de llegada (crece con la distancia para verse desde arriba; sin anillo si el rayo no toca suelo dentro de la finca o cae por detrás de tu mirada); al soltar con anillo: **fundido a negro (~0,3 s)** y apareces **de pie en el anillo, andando** (fuera de troncos). Sin anillo, soltar no hace nada |
| Gatillo derecho | Pulsa un botón del panel o de la ficha de una baliza; sobre un olivo, abre su **ficha**; sobre la **columna de luz de una baliza**, abre la ficha de su parcela (la más cercana por el rayo de las dos) |
| Botón A (derecho) | Activa/desactiva el **vuelo** (la palanca izquierda avanza hacia donde miras, 10 m/s; con grip, 30 m/s) |
| Botón B (derecho) | **Mirador**: te sube a ~230 m sobre el suelo y vuela; otra vez B te baja (donde estás); para bajar en otro punto, apunta con la palanca derecha ↑ y suelta |
| Botón Y (izquierdo) | Muestra/oculta el **panel** |
| Botón X (izquierdo) | Activa/desactiva la **viñeta** de confort |

El **panel flotante** (1 × 1,06 m, a ~1 m delante y algo por debajo de los ojos, te sigue con calma si te alejas o giras mucho) tiene: modo (Nube LiDAR / Gemelo / Ortofoto), hora, fecha NDVI, exageración, parcela anterior/siguiente (te lleva a ella), sonido, viñeta, **Salir de VR** y la sección **Gente** (I5): una fila por persona que se ve (alias, a pie / en quad / con el dron, distancia; las cuatro más cercanas, por tramos de 1, 5 o 10 m para no repintar a cada paso) con un botón **«Ir con»** (23 × 6 cm). Pulsarlo con el rayo y el gatillo da un pulso háptico corto, funde a negro (~0,3 s) y te deja de pie a 2,5-4 m de esa persona, mirándola (`Presencia.irCon` → `Llegada`, nunca un vuelo de cámara); al llegar el panel se cierra para verla (Y lo abre). Sin presencia compartida (o sin nadie a la vista), la sección dice **«Solo tú»**. Las fichas de olivo salen en una **tarjeta flotante** que se cierra sola a los 14 s.

La **ficha de una baliza** (I5) tiene su propia tarjeta (0,62 × 0,39 m, a ~0,95 m y por debajo de la mirada): estado de la parcela, **quién está ahora en ella** (con presencia: «Aquí están: …» o «No hay nadie en esta parcela»), tareas, fenología y fuente, y dos botones de 6 cm de alto, **«Ir a esta baliza»** (fundido y de pie a 4-5,5 m de la columna, mirándola: `irABaliza` → `Llegada.ve`) y **«Cerrar»**. Sale al acercarte a menos de 17 m o al apuntar a su columna de luz con el gatillo (desde lejos); se esconde mientras está abierto el panel o la ficha de un olivo, para no tapar más vista.

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

## Perfil de rendimiento VR
- Antes de la sesión: factor de resolución del búfer **0,9**. Al entrar: **foveación fija máxima** (`XRWebGLLayer.fixedFoveation = 1`, si existe) y petición de **72 Hz** (`updateTargetFrameRate`, si el casco lo ofrece).
- Modo **Gemelo** forzado (la nube LiDAR no se dibuja), calidad de follaje **baja**, `near` 0,3 / `far` 6.000.
- Olivos: tope de nivel 0 ×0,8, radio ×0,75 y presupuesto de 380.000 triángulos (el de escritorio es 550.000). Hierba: radio de 32 m.
- **Adaptador**: cada 4 s mira el tiempo de fotograma; si el JS pasa de 13 ms o se pierden fotogramas (>15,2 ms con 72 Hz) **baja un nivel** (hasta 4 niveles: olivos ×0,55/×0,35/×0,2, hierba 20 m → 0, 270.000 → 130.000 triángulos); si va holgado 25 s seguidos, sube. Se ve en `?debug`.
- **Con `?escena=tiles`** (ADR-0015) cada perfil trae también el error en pantalla que se pide a la escena 3D Tiles (`e` de `VR_PERFILES`, en `29_vr.js`): **16 / 24 / 32 / 48 px** (escritorio: 16). El relieve fino del suelo (`b`) está encendido solo en el nivel 0 y se apaga en los demás, con o sin la bandera. **Los valores de `e` son de partida: se eligieron sin medir y se ajustan en el Quest (T7)**; no se cambian sin medida. La prueba `escena3d.test.js` («VR simulada con ?escena=tiles», opcional con `GEMELO_VR=1`) comprueba la lógica con el mock (cada perfil aplica su `e` al renderer de tiles, `b` se apaga, se sale restaurando), no su efecto en fps.
- Objetivo de diseño: ≈ 0,5–0,7 M triángulos **por ojo**, ≈ 150 llamadas. **No está medido** (en Chrome sin GPU no hay forma de medirlo).

## Lo que se probó y cómo
`mock_xr.js` simula `navigator.xr`: sesión, espacio de referencia, vista estéreo (dos vistas), dos mandos con palancas, botones y gatillo. `pruebas/guardianes/llegada.test.js` (opcional con `GEMELO_VR=1`) sube al mirador, apunta delante y detrás, comprueba el anillo y que al soltar se acaba de pie en el punto, andando; el cálculo rayo → suelo, el tamaño del anillo y el apartado de troncos se prueban en Node sin navegador (la misma pieza, `12b_llegada.js`, la usa el Dron en pantalla). `prueba_vr.js` entra, anda, gira, teletransporta, usa el panel (apuntando el mando a cada botón), abre la ficha de un olivo, vuela, va al mirador, corre, sale, vuelve a entrar y sale con el fin de sesión del sistema. `pruebas/guardianes/vr_gente.test.js` prueba en Node el orden y el texto de la sección Gente y, opcional con `GEMELO_VR=1` (por el turno del banco), con `?presencia=sim&n=3`: abre el panel, pulsa «Ir con» de un simulado con el rayo y el gatillo y comprueba que el rig acaba a 2-4 m de él, abre la ficha de una baliza apuntando a su columna, pulsa «Ir a esta baliza» y comprueba que acaba a 4-5,5 m, y que sin presencia no hay filas. Con `?escena=tiles` hay una variante en `escena3d.test.js` (necesita el tileset del fixture; `__vrPerfil(n)` fuerza un perfil sin esperar al adaptador). Resultado y cifras de no regresión: ver los registros de la propia prueba (`pruebas/salida/vr/`).

## Lo que NO está probado (hardware real)
- **Todo en el casco**: que el botón aparezca dentro del marco del artefacto, que la sesión arranque, la pose real de cabeza y mandos, el mapeo de botones/palancas del Quest (se asumió `xr-standard`: palanca = ejes 2–3, gatillo 0, grip 1, A/X 4, B/Y 5).
- **Rendimiento real** (fps, foveación, resolución 0,9, MSAA del contexto que ya viene activado), y si el adaptador reacciona bien.
- **Confort**: la viñeta, el giro de 30° y el mirador a 230 m pueden marear; el mirador en concreto es un cambio brusco de altura. El **teletransporte desde el aire** (fundido de 0,15 + 0,15 s, de 230 m al suelo) no se ha probado en el casco: falta ver si el fundido es lo bastante largo, si el rayo recto y el anillo se ven bien a 1–2 km y si la puntería desde tan alto es cómoda.
- **Legibilidad y ergonomía** del panel y de las fichas, el rayo y su puntería, los hápticos (`pulse`). En particular (I5): si la sección Gente y los «Ir con» se leen y se aciertan a 1 m con el panel más alto (1,06 m), si mirar hacia abajo hasta ~35° para la última fila cansa, si el fundido de «Ir con» y de «Ir a esta baliza» basta para no marear, si cerrar el panel al llegar es lo que se espera y si apuntar a una columna de luz lejana es cómodo.
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
Todo vive ya en `apps/web/motor/` (integrado en el repo): `29_vr.js` (el modo VR completo), `90_final.js` (bucle `cuadro()` compartido), `07b_arboles.js` (`Arboles.perfil`), `21_suelo.js` (radio de la hierba en VR), `09_camara.js` (`eligeCopa`), `28_depura.js` (línea `WebXR: …`), `01_datos.js` (`VRP`). Contrato: [CONTRATOS.md](CONTRATOS.md#vr-29_vrjs); decisión: [ADR-0005](../adr/0005-webxr-perfil-propio.md).

## Probar
```
# con el WebXR simulado (mock_xr.js vive en pruebas/): montar una página y abrirla por file:// o por servidor
python tuberia/salida_artefacto/montar_v2.py --finca cerro --salida pruebas/salida/vr/cerro.html
node pruebas/prueba_vr.js "file:///<ruta absoluta>/pruebas/salida/vr/cerro.html" pruebas/salida/vr/cap
node pruebas/prueba_vr.js <url> pruebas/salida/vr/cap sinxr       # sin WebXR: no hay botón, 0 errores (esta sí está en la puerta)
GEMELO_VR=1 npm run puerta                                         # incluye la prueba VR completa con el mock
```
`mock_xr.js` y `prueba_vr.js` se recuperaron de la carpeta de trabajo original y se adaptaron (sin rutas locales). **Aviso:** con el renderizado por software de la máquina de desarrollo, la prueba completa se llegó a caer («Target crashed») en pasos distintos tras superar ~25 comprobaciones; no se ha diagnosticado si es el entorno o memoria, por eso es opcional en la puerta (PLAN P4).
