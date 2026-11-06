# Lente 7 — VR

Auditoría de noviembre de 2026, commit `4ab0ae6`. Revisión de solo lectura. **Nada de esto se ha probado en un casco.** Lo que solo se ve con un Quest está en «No verificado», y ahí no hay hallazgos.

## En cinco líneas
1. Cuando la sesión termina de forma normal (botón, «Salir de VR», fin desde el sistema), el motor la cierra bien. Lo que no está cubierto es el fallo a medias: si una excepción salta dentro del fotograma, el bucle de las gafas se para para siempre (L7-01). Tampoco hay manejo de `visibilitychange`, de `reset` ni de la pérdida de contexto (L7-02, L7-10).
2. Los perfiles **no oscilan**: van en trinquete. Basta **un** fotograma de 42 ms para bajar un nivel. Con el JS real del Quest 3 (mediana de 7,5 ms), la condición para subir (menos de 5 ms durante 10 s) no se cumple nunca (L7-03, simulado con el código real).
3. La precompilación al entrar en VR compila la variante **sin** multiview, así que en la build del Quest no sirve: el primer fotograma lo vuelve a compilar todo (L7-04, leído en super-three 0.185.0). El parche de multiview se aplica exactamente una vez contra el tarball real, pero deja un fotograma vacío en cada textura nueva (L7-08).
4. El fundido a negro no cubre todas las transiciones. El mirador (+230 m), «parcela ▶» y el teletransporte con arco saltan sin fundido, y el panel abierto cruza el mundo volando unos 2 s tras el salto (L7-05, L7-06).
5. Si three sube a 0.187 no se toca el parche, que solo actúa sobre super-three. Lo que falla es el guardián de igualdad de `#include` (`uv_vertex` cambia en 0.187). Además, la documentación se contradice sobre si la build de VR está activada (L7-07).

## 1. Qué revisé
- **Lecturas previas:** `.claude/skills/auditoria/SKILL.md` y `lentes.md`, `CLAUDE.md`, `.claude/skills/interaccion/SKILL.md`, `doc/ESTADO.md`, `doc/auditoria-noviembre2026/ALCANCE.md`, `doc/sistema/VR.md`, `doc/sistema/MULTIVIEW.md`, el ADR-0031 y las partes de `doc/sistema/MEDIDAS.md` que tratan de VR.
- **Código, entero:** `apps/web/motor/29_vr.js`, `02f_xr_perillas.js`, `02g_vr_presupuesto.js`, `31c_muneca.js`, `36_mandos.js`, `34b_palanca.js`, `02h_render.js`, `90_final.js` (el bucle), `apps/web/vite.config.js`, `herramientas/parche_multiview.mjs`, `herramientas/builds.mjs`, `herramientas/cargador.mjs`, `pruebas/mock_xr.js` y `pruebas/vr_mock.js`.
- **Código, por partes:** `pruebas/prueba_vr*.js` (cabeceras y aserciones), `pruebas/guardianes/{parche_multiview,builds_f2,vr_control}.test.js` y, en lo que toca a la VR, `02b_cola.js`, `02_mundo.js`, `12_paseo.js`, `12b_llegada.js`, `47_habla.js`, `02c_componentes.js` y `33_ajustes.js`.
- **Comprobaciones hechas:**
  - Bajé con `npm pack` los tarballs de `super-three@0.185.0`, `three@0.186.1`, `three@0.187.0` y `@pixiv/three-vrm@3.5.5` a la carpeta de pruebas (este clon no tiene `node_modules`).
  - Pasé `parcheaMultiview` contra el `three.module.js` real de super-three: los 5 trozos se aplican una sola vez cada uno y no queda ningún parámetro con nombre de macro.
  - Leí en super-three el bucle de animación, `setSession`, `onSessionEnd`, las subidas de texturas aplazadas y la clave de programa.
  - Comparé los `#include` que parchea el motor entre super-three 0.185 y three 0.187.
  - Simulé el controlador `VrControlPuro.decide` con el código real, extraído del fichero.
  - Pasé los guardianes de Node de VR. Los que importan three fallan aquí con `ERR_MODULE_NOT_FOUND` porque no hay `node_modules`. Es cosa del entorno, no un hallazgo.

## 2. Hallazgos

**[MEDIO] L7-01 · apps/web/motor/90_final.js:30-60 (con 29_vr.js:699) — Una excepción dentro del fotograma de VR para el bucle de las gafas para siempre.**
- **Defecto:** `cuadro()` no lleva `try`. En VR lo llama `vrAnimacion` desde el bucle de animación de three, y ese bucle (super-three `build/three.module.js:16-20`, `WebGLAnimation.onAnimationFrame`) ejecuta el callback **antes** de pedir el siguiente `requestAnimationFrame`. Si el callback lanza, no hay siguiente fotograma.
- **Escenario:** falla cualquier módulo que aún no es componente (`vrActualiza`, `actualizaTiempo`, `Arboles.actualiza`, `Escena3D.actualiza`, el propio `render`). Los componentes sí se protegen (02c_componentes.js:359-360), estos no. La sesión sigue abierta con la última imagen pegada a la cabeza y hay que salir con el botón del sistema. En pantalla pasa lo mismo: `bucle()` (90_final.js:62) lanza antes de su `requestAnimationFrame` y la vista se congela. También le afecta `vrSale` (29_vr.js:700-709): si algo lanza antes de su última línea, `requestAnimationFrame(bucle)` no se ejecuta y al quitarse las gafas la pantalla queda congelada.
- **Cómo lo comprobé:** leyendo `WebGLAnimation` en super-three 0.185.0 y el bucle del motor.
- **Por qué no lo vio ningún guardián:** `prueba_vr.js` exige «sin errores de consola», pero nunca inyecta un fallo. Ningún guardián provoca una excepción a mitad de fotograma.

**[MEDIO] L7-02 · apps/web/motor/29_vr.js:689 — Solo se escucha el `end` de la sesión: ni `visibilitychange`, ni `reset` del espacio de referencia.**
- **Defecto:** un grep de `visibilitychange`, `visibilityState` y `reset` en `apps/web/motor/` no encuentra nada sobre la `XRSession` ni sobre `VRX.base`.
- **Escenario:** se abre el menú del sistema del Quest (la sesión pasa a `visible-blurred` o `hidden`) y se vuelve. El primer fotograma trae un `dt` grande, recortado a 100 ms (90_final.js:32). Ese valor entra en la media del controlador y baja un nivel que ya no se recupera (L7-03). Mientras tanto la Cola, la voz y los fundidos siguen como si nada. Tampoco hay manera de pausar el mundo ni de cerrar el micro con la sesión oculta: `47_habla.js` suelta el gatillo «mantenido» solo cuando `vr()` deja de ser cierto, no cuando la sesión se oculta.
- **Cómo lo comprobé:** con grep y leyendo `entraVR` y `vrSale`.
- **Por qué no lo vio ningún guardián:** `mock_xr.js` no tiene `visibilityState`, ni evento `visibilitychange`, ni `reset`, y `getViewerPose` nunca devuelve `null`. Ninguna prueba puede ejercitar estos casos.

**[MEDIO] L7-03 · apps/web/motor/02g_vr_presupuesto.js:83, :90 (y 90_final.js:32) — Un solo fotograma largo baja un nivel de calidad y, con el JS real del Quest, el nivel no vuelve a subir.**
- **Defecto:** la media de `dt` usa un alfa de 0,05. Un fotograma de 42 ms suma 1,4 ms a una media de 13,9 y la deja por encima de `dtBaja` (15,2 ms), así que baja en el acto (pasada la guarda de 4 s). El tope de 100 ms de `cuadro` hace que cualquier tirón (342 ms en MEDIDAS) cuente igual. Para subir hace falta `emaJs < 5 ms` durante 10 s seguidos, y la mediana medida en el Quest 3 es de 7,5 ms (MEDIDAS.md:523). El resultado no es una oscilación, es un **trinquete**: cada tirón (la carga de una tesela, una compilación, la recolección de memoria, el menú del sistema) baja un escalón cada 4 s como mucho, y no se vuelve atrás en la sesión.
- **Escenario:** paseo normal en Hituelo. El peor fotograma de 42-55 ms que cita ESTADO baja el nivel en el acto, aunque el p95 esté dentro.
- **Cómo lo comprobé:** simulé `VrControlPuro.decide` extraído del fichero. Con 3.000 fotogramas a 13,9 ms y un solo pico, el nivel acaba en 1 con un pico de 42, 55, 100 o 342 ms, y en 0 con 30 ms. Después de bajar, 60 s con JS de 7 ms no lo hacen subir.
- **Por qué no lo vio ningún guardián:** `vr_control.test.js` prueba series de **JS** (picos de JS de 1 s), siempre con `dtMs` = 13,9 fijo. Ninguna serie mete un pico aislado de **fotograma**. VR.md:122 describe la regla («baja si `emaDt` > 15,2»), pero no dice que un único fotograma baste.

**[MEDIO] L7-04 · apps/web/motor/29_vr.js:656-666 (llamada en :697) — La precompilación de la entrada en VR compila la variante sin multiview: en la build del Quest no sirve.**
- **Defecto:** super-three decide si un programa es de multiview por el *render target* activo (`build/three.module.js:7644`: `numMultiviewViews` sale de `renderer.getRenderTarget()`). Ese bit entra en la clave del programa (`:8118`) y obliga a recompilar si cambia (`:18929`). El `WebGLMultiviewRenderTarget` solo se pone **dentro** del fotograma XR (`:15221`, `:15256`). Al final de `entraVR` el destino sigue siendo el inicial (`null`). El comentario de :656-657 promete justo lo contrario: «con la cámara y el renderer ya en modo XR (con multiview el programa es otro…)».
- **Escenario:** en el Quest con `xrmv=1`, `compileAsync` compila todos los sombreadores sin multiview (trabajo de más). Luego el primer fotograma vuelve a compilar todo con multiview, que es el pico de 40-70 ms que se quería evitar. `__vrDebug().xr.compila.ok` dirá `true` igualmente.
- **Cómo lo comprobé:** leyendo el código de super-three 0.185.0 (tarball de npm).
- **Por qué no lo vio ningún guardián:** `vr_control.test.js:168` solo comprueba que se llama una vez con un renderer de mentira. El WebXR simulado no tiene multiview.

**[MEDIO] L7-05 · apps/web/motor/29_vr.js:599-603, :488, :551 — El fundido a negro no cubre todas las transiciones de cámara.**
- **Defecto:** solo funden `Llegada.ve` / `vrAparece`: aterrizar desde el aire, «Ir con», «Ir a esta baliza» y «volver» de la muñeca. En cambio:
  - el mirador (`vrMirador`) sube o baja el rig **230 m en un fotograma**;
  - «parcela ◀/▶» (`vrParcela` → `vrIrA`) salta a otra parcela, a cientos de metros, sin fundido;
  - el teletransporte con arco (:551) también salta sin fundido.

  La propia VR.md:243 reconoce el mirador como «un cambio brusco de altura».
- **Escenario:** pulsar B con el olivar delante: la vista pasa de 1,6 m a 230 m de golpe.
- **Cómo lo comprobé:** leyendo `vrMirador`, `vrParcela`, `vrIrA` y la rama del arco. Ninguna llama a `vrFundido`.
- **Por qué no lo vio ningún guardián:** `prueba_vr.js` comprueba que el rig acaba en el sitio, no cómo llega. `llegada.test.js` solo cubre el aterrizaje desde el aire, que sí funde.

**[MEDIO] L7-06 · apps/web/motor/29_vr.js:520 (con :201-209) — Tras un salto sin fundido, el panel abierto cruza el mundo volando hasta el usuario.**
- **Defecto:** `vrIrA` pone `VRX.salto`, pero eso solo lo lee el modo `?ui=capas`. No reinicia `panel.ini` ni `ficha.ini`. `vrAparece` sí lo hace (:119, con el comentario «ya delante al aclarar, sin cruzar el mundo»), y eso muestra que la intención era evitar justo esto. Sin la bandera de capas, `vrSigue` acerca la lámina con `k = dt·3` por fotograma.
- **Escenario:** con el panel abierto (por fuerza, porque «▶» está en el panel) se salta 300 m a otra parcela. El panel de 1 m viaja unos 1,9 s por el aire hasta ponerse delante. Con B (mirador) y el panel abierto pasa lo mismo, en vertical, 230 m. Es un objeto grande moviéndose en estéreo sin que el usuario lo controle.
- **Cómo lo comprobé:** leyendo el código y simulando la interpolación: 137 fotogramas a 72 Hz para pasar de 300 m a 0,9 m.
- **Por qué no lo vio ningún guardián:** `prueba_vr.js` comprueba dónde nace el panel al abrirlo, no qué hace después de un salto con el panel abierto.

**[MEDIO] L7-07 · apps/web/motor/02h_render.js:6; apps/web/herramientas/builds.mjs:1-2 y :53; apps/web/vite.config.js:13; doc/operacion/PUBLICACION.md:13 — La documentación se contradice sobre si la build de VR está activada.**
- **Defecto:** el código y PUBLICACION dicen «Hoy NO cambia nada: siempre la build de pantalla», «aún no se publica ni la elige la página», «aún no se usa», «preparada, no activada» y «sin super-three instalado… no se publica». En cambio, el ADR-0031:42 dice «la build de VR con multiview queda por defecto en el Quest (el cargador ya la elige)», y ESTADO (Publicado) da por subido el multiview con el parche.
- **Escenario:** quien lea `builds.mjs` o PUBLICACION para desplegar entenderá que el Quest recibe la build de pantalla y que super-three no está instalado. Es al revés: `super-three@0.185.0` está en `apps/web/package.json`.
- **Cómo lo comprobé:** cotejando los textos con el ADR y el `package.json`.
- **Por qué no lo vio ningún guardián:** ningún guardián coteja comentarios ni PUBLICACION con el estado del ADR. Habría que avisar también a la lente 10.

**[BAJO] L7-08 · apps/web/herramientas/parche_multiview.mjs:15-17 — Cada textura nueva o repintada se dibuja vacía o atrasada durante un fotograma en el multiview.**
- **Defecto:** el parche sube lo aplazado **después** del `renderScene`. Mientras tanto, `setTexture2D` (super-three `:12090-12100` y el `bindTexture` de `:10712`) enlaza la textura vieja, o la vacía de 1×1 si la textura es nueva.
- **Escenario:** cada tesela nueva aparece en negro un fotograma (14 ms). Cada repintado del panel (al pasar el rayo por encima, al cambiar la firma) se ve un fotograma tarde. Es el diseño del aplazamiento de super-three más el parche. No es grave, pero tampoco está documentado.
- **Cómo lo comprobé:** leyendo `uploadTexture` y `runDeferredUploads` en el tarball.
- **Por qué no lo vio ningún guardián:** `parche_multiview.test.js` comprueba dónde va la subida, no qué se dibuja ese fotograma.

**[BAJO] L7-09 · apps/web/herramientas/parche_multiview.mjs:41 — En el servidor de desarrollo de Vite el parche no se aplica y no avisa.**
- **Defecto:** `FICHERO` solo casa con `super-three/build/three.module.js`. `vite` en modo dev preempaqueta las dependencias (`.vite/deps/…`), así que el `transform` no lo ve. MULTIVIEW.md:197 lo reconoce («puede no aplicarlo»), pero el código no falla ni avisa.
- **Escenario:** `GEMELO_BUILD=vr npm run dev` en el Quest da el mundo en negro y ningún mensaje que lo explique.
- **Cómo lo comprobé:** leyendo el plugin.
- **Por qué no lo vio ningún guardián:** los guardianes solo prueban `vite build`.

**[BAJO] L7-10 · apps/web/motor/ (todo el directorio) — No hay manejo de `webglcontextlost` / `webglcontextrestored`.**
- **Defecto:** el grep no encuentra nada en `apps/web/motor/`. super-three deja de dibujar si `_isContextLost` (`render()` sale en el acto).
- **Escenario:** el Quest, con poca memoria (tileset, VRM, atlas), pierde el contexto dentro de VR. El usuario queda en negro, sin ningún mensaje, hasta que sale con el botón del sistema.
- **Cómo lo comprobé:** con grep y leyendo `render()` de super-three.
- **Por qué no lo vio ningún guardián:** el WebXR simulado y SwiftShader no pierden el contexto. Que pase de verdad en el Quest queda en «No verificado».

**[BAJO] L7-11 · apps/web/motor/29_vr.js:89 (con 02f_xr_perillas.js:17) — Con `?xrnear=0.3` el velo del fundido queda justo en el plano cercano.**
- **Defecto:** `vrNegro` está a 0,30 m de la cámara (la viñeta, a 0,32) y la perilla `xrnear` admite hasta 0,3.
- **Escenario:** en una medida con `xrnear=0.3`, el velo cae justo en el plano de recorte. Puede recortarse del todo o a trozos, y el teletransporte desde el aire se vería sin fundido.
- **Cómo lo comprobé:** leyendo los dos valores.
- **Por qué no lo vio ningún guardián:** `xr_perillas.test.js` prueba los rangos, no lo que hay delante de la cámara.

**[BAJO] L7-12 · apps/web/motor/29_vr.js:520 y :569 (con 02_mundo.js:30) — El fundido no espera a la carga: tras un salto lejano la cabeza puede deslizarse en vertical sin acción del usuario.**
- **Defecto:** `vrIrA` coloca la altura con `suelo()`, que, sin la tesela de destino, cae a `grueso()`. Cuando llega el MDT fino, :569 lleva el rig hacia el suelo real a `dt·12`. Eso es un desplazamiento vertical que no pide el usuario. La regla 1 de la skill `interaccion` dice «nunca mover la cámara en VR sin una acción del usuario». El fundido (0,15 + 0,15 s, :87) aclara a tiempo fijo, haya llegado la tesela o no.
- **Escenario:** «parcela ▶» o «Ir con» a una zona no cargada, en ladera. El tamaño de la diferencia entre el relieve grueso y el fino **no está medido**.
- **Cómo lo comprobé:** leyendo el código.
- **Por qué no lo vio ningún guardián:** en las pruebas con el fixture las teselas ya están cargadas.

**[BAJO] L7-13 · apps/web/motor/29_vr.js:352 y :488 (y 12_paseo.js:61) — Con `parcelas` vacío, la VR se cae.**
- **Defecto:** `vrValores` hace `parcelas[…] || parcelas[0]` y luego lee `.finca`. `vrParcela` divide entre `parcelas.length`. `contratos/indice.schema.json:22` no pone `minItems`, así que un índice sin parcelas es válido.
- **Escenario:** hoy no pasa, porque Cerro e Hituelo tienen parcelas. Pero en la refactorización a mundos múltiples (fábrica, museo, bodega) un mundo sin parcelas, al entrar en VR, hace lanzar a `vrPintaPanel` dentro del fotograma y se para el bucle (L7-01). `entraPaseo` ya lanza antes, también en pantalla.
- **Cómo lo comprobé:** leyendo el código y el esquema.
- **Por qué no lo vio ningún guardián:** el fixture siempre tiene parcelas.

**[BAJO] L7-14 · pruebas/vr_mock.js:5 (con CLAUDE.md §3, «VR con sesión simulada») — El comando que CLAUDE.md da para «VR con sesión simulada» no es una prueba.**
- **Defecto:** `vr_mock.js` solo imprime la razón entre correr y andar. No tiene aserciones ni código de salida. Su URL por defecto es `gemelo_cerro.html` en `localhost:8000` (la salida artefacto, retirada por el ADR-0021) y su Chrome por defecto es una ruta de Windows.
- **Escenario:** quien siga CLAUDE.md cree haber probado la VR y solo ha medido una razón de velocidades. La prueba completa es `prueba_vr.js` / `vr.test.js` con `GEMELO_VR=1`.
- **Cómo lo comprobé:** leyendo el fichero.
- **Por qué no lo vio ningún guardián:** no lo ejecuta ninguna puerta.

### Respuestas a las preguntas del encargo (sin hallazgo propio)

**Fin de sesión normal.** Está bien resuelto. `vrSale` (29_vr.js:700-709) suelta el agarre y cancela `vnivel`. Restaura el perfil (`ponEscalon(null)`, que vuelve a la base), `near`/`far`, el modo y la calidad. Quita el rig y emite `vr:sale`, que escuchan las láminas (02d:247), la muñeca (31c:217), los juegos (40:405) y, por `vr:rig-libera`, los mandos (36:158). Si falla la entrada, el `catch` de :683-685 deshace lo hecho. Un `end` durante los `await` de `setSession` lo recoge el `onSessionEnd` de three, y el `setSession` que falla cae en ese mismo `catch`. Volver a entrar y salir con el botón del sistema lo cubre `prueba_vr.js:144-145`.

**¿Oscilan los perfiles?** No. Tienen histéresis de bajada y subida (8 y 5 ms), guarda de 4 s y suelo por gente con su propia histéresis (`SALIDA_GENTE`). El problema es el contrario: el trinquete de L7-03.

**Comodidad.**
- El giro es por saltos (15/30/45/60°), sin giro suave.
- La viñeta es proporcional a la velocidad, tiene un mínimo durante los saltos y está encendida por defecto («suave»).
- Velocidades: 1,4 m/s andando, 3 m/s corriendo, 8 y 20 m/s volando, con una rampa de 0,15 s y frenada en seco.
- El suelo se sigue suavizado (`dt·12`). La cabeza no se mueve sola, salvo lo de L7-12.

Lo que falta es lo de L7-05 y L7-06.

**¿Se presenta siempre un fotograma?** Mientras no haya una excepción (L7-01), sí: el bucle no espera a nada. Pero no todo lo pesado pasa por la `Cola`:
- `Mundo.cargaTesela` (02_mundo.js:104-105) hace `r.json()` y `decodifica` en el hilo principal, fuera del presupuesto. Son unos 1,18 MB de JSON de mediana por tesela (MEDIDAS.md:112), y `Cola.debe` no lo descuenta.
- `vrPerfil` aplica la entrada de golpe (29_vr.js:642, :694).
- `Cola.vacia(10000)` solo corre al arrancar (90_final.js:16).

Lo que cuesta en el Quest no está medido, así que no lo convierto en hallazgo. Lo dejo para la lente 1 y la skill `medir`.

**¿Qué hace el parche de multiview?** Comprobado contra el tarball real de super-three 0.185.0 (cada trozo aparece una vez y tras el parche no queda ningún parámetro con nombre de macro). Hace tres cosas:
1. Sube las texturas aplazadas justo después del dibujo multiview.
2. Renombra el parámetro `viewMatrix` en `transformNormalByInverseViewMatrix`, `transformDirectionByInverseViewMatrix` y `getIBLVolumeRefraction`. El cuerpo de la tercera usa el uniforme `viewMatrix`, que es lo que le pasa su única llamada, así que el resultado no cambia.
3. Coloca las `#extension` del material antes del `layout(num_views)`.

Si cambia algún trozo, el build falla en vez de parchear a ciegas, y está bien así. three-vrm 3.5.5, la biblioteca de olivos y el motor no tienen parámetros que choquen con las macros. Las únicas colisiones están en `examples/jsm/helpers/LightProbeHelper.js` y `OutputShader.js`, que el motor no usa. El guardián (`parche_multiview.test.js:41, :52`) solo mira super-three y `motor/`: ni `apps/web/olivo/`, ni three-vrm, ni parámetros sin el calificador `in`.

**Riesgo al subir three a 0.187.**
- **El parche no se entera.** Solo actúa sobre `super-three/build/three.module.js`, y la build de VR sigue en 0.185.0.
- **Lo que falla es el guardián.** `builds_f2.test.js:56` exige que los `#include` del motor sean iguales en three y en super-three. Comprobado: de los 11 trozos que usa el motor, `uv_vertex` cambia en 0.187 (añade `USE_DIFFUSE_ROUGHNESSMAP`). Los parches del motor sobre `uv_vertex` (07ac_lejanos.js:247, 21_suelo.js:107) añaden detrás del `#include` y no se ven afectados. Pero la puerta se pone en rojo y obliga a decidir: relajar la regla o esperar a super-three r187.
- **Además:** 0.187 quita lo que quedó obsoleto en r177 (MULTIVIEW.md:170). Cualquier código que el motor escriba para la API de 0.187 tiene que seguir existiendo en super-three 0.185, porque es **un solo** código fuente para las dos builds.
- **Y cuando salga super-three r187** (rama `vf-super-r187`, según MULTIVIEW.md:199), los trozos 2 y 3 desaparecerán y el build fallará, como está previsto. Pero `parcheaMultiview` exige **todos** los trozos: si upstream arregla el n.º 28 y no el n.º 27 (el de las texturas), habrá que editar el parche a mano, no basta con quitarlo.
- En npm, la última versión de super-three es la 0.185.0, del 2026-07-08.

**¿Qué supone mantener super-three para el Quest y three 0.187 + TSL para el resto?**
- **Dos three distintos para un solo motor.** Mientras se migre a TSL, cada sombreador existe en GLSL (para el clásico y para super-three) y en TSL (para pantalla): son dos implementaciones que hay que mantener iguales a ojo.
- **Dos builds que construir, publicar y cachear.** `dist/` y `dist-vr/` más `publica_builds.mjs` y el cargador. La caída a pantalla solo cubre un fallo **al cargar**; uno posterior no se puede deshacer (cargador.mjs:7-8).
- **Dos juegos de guardianes:** el de `#include` contra cada three y `builds_f2`.
- **Las pruebas de navegador no ven el multiview.** Ni el banco ni el WebXR simulado lo tienen, así que de la build del Quest solo se prueba «todo lo demás».
- **Divergencia de versiones.** La build de VR se queda en r185 mientras pantalla sube. Lo que se arregle en three ≥ 0.186 (BatchedMesh, MSAA, XR) no llega al Quest.
- **Dependencia de una bifurcación** que publica pocas versiones y que hoy necesita un parche propio para funcionar.
- **A favor:** medido en el Quest 3 (ADR-0031), `render()` baja un 15-17 % y el p95 de intervalo pasa de 20,9 a 18,1 ms. El renderizador nuevo con multiview rinde peor que el clásico en 0.186.
- **El coste crece con la refactorización a mundos múltiples:** cada mundo nuevo con sombreadores propios multiplica el trabajo doble. La salida que fija el ADR (una sola build cuando el `WebGPURenderer` haga bien el multiview) sigue siendo la correcta. Conviene repetir F2 con 0.187 antes de escribir sombreadores nuevos para los mundos.

## 3. No verificado (necesita un casco real)
- Que de verdad se produzcan los escenarios de L7-01, L7-02 y L7-10 en el Quest: cuánto ocurren las excepciones a mitad de fotograma, el comportamiento con `visible-blurred` (¿siguen los fotogramas?, ¿se congelan los mandos o se desconectan?, ¿queda el micro abierto?), la pérdida de contexto por memoria.
- El recentrado del Quest (`reset` del espacio de referencia): hacia dónde quedan el panel y las láminas después.
- Qué pasa cuando `getViewerPose` devuelve `null` (pérdida de seguimiento) con la capa de proyección multiview: super-three no pone el destino en ese fotograma.
- Si L7-03 se nota (cuántos niveles se pierden en 10 min) y si 8/5/10 son buenos números; los umbrales de las filas Quest 2, 3S y Pro.
- El pico real del primer fotograma con multiview (L7-04) y lo que se ganaría arreglando la precompilación.
- El parpadeo de un fotograma de L7-08 en estéreo.
- El mareo con el mirador sin fundido, con el panel volando tras un salto, con la viñeta y con el vuelo a 20 m/s; la legibilidad del panel y de la muñeca; los falsos positivos del gesto de muñeca; la háptica.
- Que la foveación y el MSAA se apliquen con la capa de proyección multiview (`fixedFoveation` va a `baseLayer`, que con capas es `null`, 02f:138; three la aplica con `setFoveation` antes, sin comprobar).
- La diferencia de altura entre el relieve grueso y el fino tras un salto (L7-12).
- El coste en el Quest de `r.json()` + `decodifica` de una tesela y su efecto en el controlador.
- Los modelos de los mandos y de las manos (perfiles reales de Touch Plus y de la mano) y su respaldo a los 6 s.

## 4. No revisado
- `40_juegos.js` (la lámina del juego en VR), `47b_corro.js`, `38_presencia_compartida.js` y `26b_avatares.js` más allá de su enganche con la VR (cupos, fundido de VRM en estéreo).
- `04b_escena3d.js` y `02l_tope_tiles.js` (el tope de triángulos del tileset en VR): solo leí su llamada a `XrPerillas`.
- `07ab_generados.js` (la variante E2-VR de los olivos) y `07ac_lejanos.js` en VR. El horneado con `xr.enabled = false` (07ac:206-223) lo vi, pero no lo seguí.
- `prueba_vr_capas.js`, `prueba_vr_muneca.js` y `prueba_vr_perillas.js`: solo cabeceras; no las ejecuté (no hay Chrome ni banco).
- `herramientas/publica_builds.mjs` y la configuración del Caddy/VPS para `dist-vr`.
- `prototipos/multiview/` (la página de humo).
- No ejecuté ninguna prueba de navegador ni el build de Vite. Los guardianes de Node que importan three no corren en este clon sin `node_modules`.
