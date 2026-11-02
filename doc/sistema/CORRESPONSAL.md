# El corresponsal de campo (F4) — estudio

> **Propuesta, sin implementar** (tarea F4-1, 2026-11-02). Decisión técnica en [ADR-0030](../adr/0030-corresponsal-de-campo-pwa-en-primer-plano.md) (Propuesto: toca privacidad y lo valida Antonio). Privacidad en el borrador [EIPD-CAMPO](EIPD-CAMPO.md). Parte de la fase 4 de [ARQUITECTURA-MULTIUSUARIO](ARQUITECTURA-MULTIUSUARIO.md#del-campo-al-mundo) y de la decisión 19 («la misma web como PWA», [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md)). Lo que no está en el repo ni se ha comprobado con una fuente va marcado **[SUPUESTO]** o **[NO VERIFICADO]**. **Nada de esto se ha probado en un Android real ni en la finca.**

## 0. En una frase

Un trabajador de la explotación, con un móvil de la explotación (Android, p. ej. el XCover7), abre `/campo/` instalada como PWA **solo durante una visita guiada**, con la pantalla encendida y en primer plano; mientras emite, su posición, su rumbo y su cámara trasera llegan a la sala `guiada-<evento>`, y en el mundo los visitantes lo ven como un avatar con un cono de visión y una pantalla flotante de vídeo. Si apaga la pantalla o sale de la app, **deja de emitir**: no hay seguimiento en segundo plano, a propósito.

## 1. Lo que ya hay y se reusa (regla 12)

| Pieza | Dónde | Para qué en F4 |
|---|---|---|
| Rol `corresponsal` | enum `rol_hogar` (migración 0001), `Rol` en `apps/api/src/auth/servicio.ts`, `PERMISOS` en `apps/api/src/presencia/livekit.ts` | la cuenta del corresponsal; hoy `SOLO_DATOS` en las salas fijas y **sin papel** en las guiadas |
| Alias reservado «corresponsal» | `apps/api/src/yo/rutas.ts` | nadie más puede llamarse así |
| Sala por visita guiada | `guiada-<evento>` (`livekit-roles` v7, ADR-0026) | el directo solo existe ahí; la inscripción se comprueba contra la base |
| Permisos en vivo y auditoría | `RoomService.UpdateParticipant` (verificado en F3g: quitar `canPublish` despublica en 70-411 ms) | pausar o cortar el vídeo desde el servidor |
| `livekit-client` 2.22.4 | `apps/web/package.json`, único en `37_red.js` | publicar la cámara; simulcast por defecto (abajo) |
| Pose binaria | `contratos/presencia.md`, `PoseCodec` en `26_presencia.js` | posición y rumbo del corresponsal (con una extensión, §5) |
| `proj4` 2.22.0 con EPSG:25830 | `apps/web/oficina/hazas.js` (definición `+proj=utm +zone=30 +ellps=GRS80 …`) | WGS84 → UTM 30N en el móvil, sin fórmula propia |
| OpenLayers + proj4 | trozo de Hazas de la oficina (`vite.oficina.config.js`) | el mapa 2D de la pantalla de campo |
| `Hazas.enPunto(x, y)` | `13b_hazas.js` | en qué haza está el corresponsal (y a qué haza va un clip) |
| `Laminas` | `02d_laminas.js` (ADR-0023, C8) | la pantalla flotante de vídeo (hay que ampliarla para vídeo, §6.4) |
| Medios y Bandeja | `src/vida/medios.ts`, volumen `GEMELO_MEDIOS`, OF4 | guardar los clips y revisarlos antes de publicarlos |
| Llaves de acceso | ADR-0029, `@simplewebauthn` 14 | entrar en el móvil de campo sin correo |
| UX ya dibujada | [UX §4.10](UX.md#410-preparar-la-emisión-de-campo-corresponsal) «Preparar la emisión de campo» | la lista de comprobación y los dos avisos obligatorios |

Lo que **no** hay: página `/campo/`, manifiesto de PWA ni *service worker*, ningún rol con `camera`, tabla `clips`, subida reanudable, vídeo en una lámina.

## 2. La sesión del corresponsal

**Quién.** Siempre personal de la explotación (ARQUITECTURA-MULTIUSUARIO, «Los tres clientes»). **Una cuenta por persona** con rol `corresponsal` (la crea la oficina, como las de guía), alias fijo **«Corresponsal»** en los metadatos (como «Oficina»: sin nombre propio en la sala) y aspecto fijo con chaleco. Las familias nunca ven quién es por nombre.

**Con qué aparato.** Un móvil **de la explotación**, no el personal del trabajador: así la cámara, el permiso de ubicación y los clips pendientes no viven en un teléfono privado, y la explotación decide su configuración (ahorro de batería, actualizaciones). **[SUPUESTO]** que el aparato sea el XCover7 que cita ARQUITECTURA; sus prestaciones (GPS, cámara, temperatura) no se han medido.

**Cómo entra.**
1. Primera vez: la oficina crea la cuenta; el corresponsal recibe el **enlace** en el móvil de campo y crea allí su **llave de acceso** (ADR-0029). Como el corresponsal emite vídeo, se trata como la oficina: **llave + aparato aprobado** (decisión 152: un aparato nuevo espera a que la oficina lo apruebe). Pregunta P2 para Antonio.
2. Instala la PWA desde Chrome («Añadir a la pantalla de inicio»). Abre directamente en `/campo/`.
3. Ve **solo las visitas guiadas en las que la oficina lo ha puesto como corresponsal** (columna nueva `visitas.corresponsal_id`, como `guia_id`). Fuera de una visita, la pantalla de campo no conecta con LiveKit: **el corresponsal no aparece nunca en la visita libre** (§9, privacidad).
4. Dentro de la ventana de la visita (la del guía: 60 min antes), «Preparar emisión» (UX §4.10): permisos uno a uno, prueba de subida, batería, y los dos avisos obligatorios marcados.
5. «Empezar a emitir» → token de `guiada-<evento>` con papel `corresponsal` → publica pose y, si la subida da, vídeo.
6. «Pausar» (botón grande, siempre visible) y «Terminar». Al cerrar la sala (decisión 155) termina solo.

## 3. Permisos del navegador y qué pasa con la pantalla apagada

Todo con gesto del usuario y explicado antes (regla 6 de la skill `interaccion`). Navegador objetivo: **Chrome para Android** (el de la PWA). Nada probado en el aparato.

| Permiso / API | Para qué | En primer plano | Pantalla apagada o app en segundo plano |
|---|---|---|---|
| Geolocalización, `watchPosition({ enableHighAccuracy: true })` | posición | da `coords.accuracy` y, en movimiento, `heading` y `speed` | **se suspende**: Chromium cierra el servicio de geolocalización cuando la página deja de verse ([revisión de Chromium 2379253002](https://codereview.chromium.org/2379253002/); el mismo criterio en [WebKit 34082](https://bugs.webkit.org/show_bug.cgi?id=34082): apagar el GPS si la página no está delante). Es la causa de que OlivarTrack retirase su PWA de campo (PLAN F4-1). Comportamiento exacto en el Chrome actual: **[NO VERIFICADO]** |
| Orientación absoluta (`deviceorientationabsolute`) | rumbo de la brújula para el cono | evento de `Window`, solo en HTTPS ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/deviceorientationabsolute_event)); soportado en Chrome Android, no en Safari **[NO VERIFICADO: la tabla de compatibilidad no se leyó]** | los sensores se paran con la página oculta **[NO VERIFICADO]** |
| Cámara trasera (`getUserMedia({ video: { facingMode: "environment" } })`) | directo y clips | sí | Chrome Android deja de entregar fotogramas o silencia la pista **[NO VERIFICADO]**; el diseño no cuenta con ella |
| Micrófono | hablar con el guía y los visitantes | sí, pulsar para hablar (§6.5) | ídem **[NO VERIFICADO]** |
| Screen Wake Lock (`navigator.wakeLock.request("screen")`) | que la pantalla no se apague | sí; la petición puede rechazarse por ahorro de energía o batería baja | **se suelta sola** al ocultarse el documento, y el sistema puede soltarla con batería baja; hay que volver a pedirla en `visibilitychange` ([MDN, Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API), consultado el 2026-11-02) |
| Batería (`navigator.getBattery()`) | aviso de batería y bajar calidad | Chrome sí **[NO VERIFICADO]** | — |
| Notificaciones | **no se usan.** No hace falta avisar al corresponsal con la app cerrada; la visita la prepara la oficina con él | — | — |
| Almacenamiento persistente (`navigator.storage.persist()`) | que el navegador no borre los clips pendientes | en una PWA instalada suele concederse **[NO VERIFICADO]** | — |

**Consecuencia de diseño:** el modo corresponsal es un **modo de primer plano**. La pantalla de campo lo dice («Mantén esta pantalla abierta mientras emites; si la apagas, la emisión se pausa»), y al ocultarse la página (`visibilitychange` → `hidden`) el cliente **intenta** mandar el estado «pausa» y despublicar la cámara; si no le da tiempo, los visores marcan «sin señal» a los 5 s sin pose (§5). Al volver: vuelve a pedir Wake Lock, reanuda GPS y espera un gesto («Seguir emitiendo») antes de volver a publicar vídeo. **[SUPUESTO]** que en una visita de 30-60 min con el móvil en la mano esto basta; lo comprueban F4-2 (el aparato) y F4-7 (la visita).

## 4. Del GPS a la escena

1. **Lectura:** `GeolocationPosition` en WGS84 (lat, lon, `accuracy` en m, `heading`, `speed`, `timestamp`). La altitud del GPS **no se usa**: el avatar va al suelo de cada receptor, como ya dice el contrato de presencia (exageración vertical que no viaja).
2. **WGS84 → ETRS89 / UTM 30N (EPSG:25830)** con `proj4` y la misma definición que la oficina (regla 12; una sola cadena, que conviene sacar a un módulo común en F4-2). Tratar WGS84 como ETRS89 deja un error de **~0,9 m** en 2026 (ETRS89 se separa de ITRF/WGS84 unos 2,5 cm al año desde 1989 **[SUPUESTO: cifra de memoria]**), despreciable frente al GPS bajo copa (varios metros). No hace falta transformación de *datum*.
3. **UTM → local:** `x = E − centro_utm[0]`, `z = −(N − centro_utm[1])`, la misma fórmula de `13b_hazas.js` (skill `mundos-virtuales`). Fuera de la caja de la finca (o fuera de UTM 30N), se descarta y se avisa.
4. **Filtro de precisión:** lecturas con `accuracy > 25 m` no mueven el avatar (se dibuja «posición aproximada»); con `accuracy` entre 10 y 25 m se aceptan con más suavizado. **[SUPUESTO]** los umbrales; los fija F4-6 con medidas en campo.
5. **Suavizado:** filtro de velocidad constante ponderado por `accuracy` (un Kalman 2D pequeño). Regla 12: antes de escribirlo, valorar `kalmanjs` (npm, MIT, 1D por eje) **[NO VERIFICADO su estado de mantenimiento]**; si no sirve, una función pura `SuavizaPuro` con su prueba de Node.
6. **Frecuencia:** el GPS del móvil da del orden de 1 lectura/s **[SUPUESTO]**; el corresponsal manda su pose a **2 Hz a toda la sala** (no 10 Hz: no tiene «cercanos», todos lo siguen) y los receptores interpolan como con cualquier avatar. El rumbo de la brújula sí cambia rápido: va en la misma pose, filtrado (media circular de 0,5 s).
7. **Rumbo:** `deviceorientationabsolute` → rumbo = 360 − `alpha`, corregido por la orientación de la pantalla (`screen.orientation.angle`). Con el móvil vertical y la cámara trasera, el cono apunta hacia donde mira la cámara. Si la brújula no da lecturas o no es absoluta, y el corresponsal anda (> 0,7 m/s), se usa `coords.heading`. La brújula se descalibra cerca de un tractor o un vallado **[NO VERIFICADO]**: el cono se dibuja más ancho si la lectura salta.
8. **«Imán» al olivo (F4-6):** si el corresponsal lleva **≥ 5 s parado** (< 0,3 m/s), y hay un olivo a menos de `min(accuracy, 6 m)`, el avatar se coloca **a 1,5 m de ese olivo, del lado de donde viene**; se suelta en cuanto vuelve a andar más de 3 m. En marco tradicional (10-13 m entre olivos, ARQUITECTURA §Precisión) el radio de 6 m elige un solo olivo. Las posiciones de los olivos: las que ya usa el motor por teselas o las de la api (tabla `olivos`, migración 0001) **[SUPUESTO: cuál se sirve al móvil se decide en F4-6]**. El imán se hace **en el móvil** (lo manda ya imantado, con una bandera), así todos los visores ven lo mismo. Es **deducido** (regla 5): la ficha lo dice («junto al olivo, posición ajustada»).

## 5. El mensaje por el canal de datos (pose v2)

Se reusa `PoseCodec` y su tema `pose` (no fiable). La propuesta para F4-2 (cambio de contrato, regla 3; lo escribe F4-2 con su prueba):

- **Versión 2 del mensaje** (byte 0 = `2`). Igual que la 1 en los bytes 0-23 y añade el **tipo 3 = corresponsal** (hoy reservado y descartado). Los emisores de siempre pueden seguir mandando la versión 1; los receptores nuevos aceptan 1 y 2. Un cliente viejo descarta la 2: no ve al corresponsal (aceptable con cuentas de prueba; mismo criterio que el versionado actual).
- **Bytes 24-35 del tipo 3** (12 B; mensaje de 36 B):

| Byte | Tipo | Campo | Notas |
|---|---|---|---|
| 24 | u16 | precisión | dm (0-6553,5 m); `65535` = sin posición |
| 26 | u16 | rumbo | centésimas de grado (0-35999); `65535` = sin brújula. El giro de la cabeza (byte 20) lleva el mismo rumbo para quien no lea el tipo 3 |
| 28 | u8 | batería | % (0-100); `255` = no se sabe. Bit 7 del byte 30: cargando |
| 29 | u8 | red | calidad de conexión de LiveKit (`ConnectionQuality`: 0 se pierde, 1 pobre, 2 buena, 3 excelente) |
| 30 | u8 | estado | bits 0-2: `0` emitiendo, `1` en pausa, `2` sin vídeo (solo posición), `3` grabando clip, `4` terminando; bit 3: posición imantada a un olivo; bit 4: rumbo por GPS (no brújula); bit 7: cargando |
| 31 | u8 | edad del fijo | décimas de s desde la última lectura del GPS (tope 255) |
| 32 | u32 | reservado | ceros |

- **`y` de la cabeza:** el corresponsal no conoce el suelo del mundo: manda `y = 0` y el tipo 3 dice «al suelo» (cada receptor lo pone sobre su `suelo(x, −z)` + 1,6 m de ojos).
- **«Sin señal»:** sin pose del corresponsal en 5 s, los receptores lo dibujan apagado con «Sin señal»; a los 60 s, «Se ha perdido el corresponsal». **[SUPUESTO]** los tiempos.
- **Lo que no viaja:** coordenadas geográficas (solo las locales en cm, como cualquier avatar), nombre, modelo del móvil, IP. **La pose no se guarda** (como hoy).

## 6. Vídeo y audio por LiveKit

### 6.1 Permiso
`livekit-roles` **v8** (F4-3): en `roles_guiada` un papel nuevo **`corresponsal`** con `canPublish: true` y `canPublishSources: ["camera", "microphone"]`; **ningún otro papel ni rol lleva `camera`** (lo comprueba la prueba de unidad que decodifica el token, como `voz.test.ts`). En las salas fijas el rol `corresponsal` **no recibe token** (403 `corresponsal_solo_en_guiadas`): no hay corresponsal en la visita libre. La oficina puede **cortar el vídeo** desde su panel (`UpdateParticipant` con `canPublishSources: ["microphone"]`, auditado `guiada.video_cortado`), igual que quita la palabra.

### 6.2 Calidad (leído de `livekit-client` 2.22.4, `dist/livekit-client.esm.mjs`)
- Valores por defecto al publicar: `simulcast: true`, `videoCodec: "vp8"`, `backupCodec: true`; captura a `VideoPresets.h720` (1280×720, **1,7 Mb/s**, 30 fps). Capas de simulcast por defecto para 16:9: **h180** (320×180, 160 kb/s, 20 fps) y **h360** (640×360, 450 kb/s, 20 fps), más la original. En sala, `adaptiveStream: false` y `dynacast: false` por defecto (y `37_red.js` los fija a `false`).
- La documentación de LiveKit: simulcast publica varias versiones de la pista y el servidor «elige las capas adecuadas cuando detecta límites de ancho de banda»; Dynacast «pausa las capas que nadie consume» ([LiveKit, codecs y más](https://docs.livekit.io/transport/media/advanced/), consultado el 2026-11-02).
- **Propuesta para el campo:** captura h720 a **24 fps** como techo (ARQUITECTURA §Vídeo), capas `[h180, h360]`; en la sala guiada, **`dynacast: true`** (si ningún visor pide 720p, el móvil no la codifica: ahorra batería y subida) y **`adaptiveStream: true`** en los visores (pide la capa según el tamaño de la pantalla flotante). Subida del móvil con las tres capas: ~2,3 Mb/s; con solo 180+360, ~0,6 Mb/s. **[NO VERIFICADO]** cómo se comporta el control de congestión con 4G pobre (cuándo deja de mandar la capa alta); lo mide F4-3 con red limitada en el banco y F4-7 en campo.
- **Umbral para directo**: con la prueba F4-0, una haza admite directo si la subida medida es **≥ 1 Mb/s** sostenida (360p con margen); entre 0,3 y 1 Mb/s, solo 180p o solo posición; por debajo, clips (§7). **[SUPUESTO]** los umbrales.
- Codec: VP8 en software puede calentar más que H.264 por *hardware* en Android **[NO VERIFICADO]**; F4-3 prueba los dos en el aparato y elige.

### 6.3 Coste en el VPS (estimado, sin medir)
LiveKit es un SFU: **reenvía, no transcodifica**. Salida ≈ visores × capa que pide cada uno: 10 visores a 360p ≈ **4,5 Mb/s**; 40 a 360p ≈ **18 Mb/s**; 40 a 720p ≈ **68 Mb/s** (más la voz de ADR-0026, ~3 Mb/s con 40). Entrada: ~2,3 Mb/s. CPU: del orden de lo que ya cuesta reenviar las poses **[SUPUESTO: sin medir; el i5 de este equipo no sirve para medir carga, MEDIDAS]**. El ancho de banda contratado del VPS de OVH y si hay límite mensual: **[SUPUESTO / NO VERIFICADO]** (ADR-0011 no lo dice). **No hace falta Egress**: el directo no se graba (decisión 10, ADR-0026); los clips se graban en el móvil.

### 6.4 La pantalla flotante (F4-4)
`Laminas` pinta un lienzo 2D y solo lo sube si cambia la firma: no sirve tal cual para 24 fps. Se amplía (punto de extensión del núcleo, ADR-0023) con una opción `video: HTMLVideoElement` que use `THREE.VideoTexture` (three ya la trae; regla 12) en vez del lienzo, colgada del avatar (`en`), 1,6 × 0,9 m, que se vuelve hacia quien la mira (lo que ya hace). Presupuesto: una malla, 2 triángulos, una textura que se actualiza por fotograma de vídeo; **solo se suscribe** a la pista si la pantalla está a < 60 m y a la vista, y se suelta al alejarse. En VR, la pantalla va **anclada al mundo**, nunca a la cabeza (regla 1 de `interaccion`); botón «Acercar la pantalla» en el panel que la trae a 2 m. Encima del vídeo, una franja con **«EN DIRECTO · campo»** y, si el estado es pausa o sin señal, un cartel fijo en su lugar.

### 6.5 Audio del corresponsal
El micrófono del campo recoge **conversaciones de la cuadrilla** si va abierto. Propuesta: **pulsar para hablar** (como las familias, decisión 158) y **cerrado por defecto**; con `noiseSuppression` y `voiceIsolation` (valores de `livekit-client`), preset `speech`. El vídeo va **sin sonido ambiente**. Si el guía y el corresponsal son la misma persona, entra como corresponsal y su micrófono funciona igual (abierto con su botón, como el guía en B1).

## 7. Clips diferidos (sin cobertura)

- **Grabar:** `MediaRecorder` sobre la pista de la cámara, con `mimeType` elegido por `MediaRecorder.isTypeSupported()`: primero `video/mp4;codecs=avc1…` y si no `video/webm;codecs=vp8` ([MDN, isTypeSupported](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported); Chromium anunció MP4 con H.264/HEVC en MediaRecorder, [blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/YJ1QijNiHeM/m/3EhMjMVwAgAJ); **en qué versión, [NO VERIFICADO]**). 480p o 360p a ~1 Mb/s, **sin audio** salvo que el corresponsal pulse hablar.
- **Límites:** **60 s** por clip (cuenta atrás visible), **≤ 10 MB**, como mucho 20 clips pendientes en el aparato. **[SUPUESTO]** las cifras.
- **Guardar:** el `Blob` en IndexedDB con la librería `idb` (npm, ISC) **[NO VERIFICADO su versión vigente]**, con metadatos: evento, haza (`Hazas.enPunto` del punto donde empezó), instante, duración, SHA-256 (`crypto.subtle.digest`). `navigator.storage.persist()` al preparar la emisión. Nada de coordenadas exactas: **la haza basta** para la trazabilidad (minimización, §9).
- **Subir al volver la red:** subida **reanudable** con el protocolo tus (cliente `tus-js-client`, servidor `@tus/server` + `@tus/file-store` dentro de la api, en el volumen `GEMELO_MEDIOS`), en lugar de trozos con `Content-Range` caseros (regla 12). **[NO VERIFICADO]** versiones y que `@tus/server` encaje con el servidor HTTP de la api; F4-5 lo comprueba antes de escribir. Caddy necesita el límite de cuerpo de esa ruta (como `POST /api/medios`). La subida va **solo** con la PWA en primer plano (sin Background Sync: Chrome lo tiene, pero no se depende de él **[NO VERIFICADO]**). Cuando la api confirma el SHA-256, el clip **se borra del móvil**.
- **En la api:** tabla `clips` (id, evento, haza, corresponsal, instante, duración, bytes, tipo, sha256, estado `pendiente|aprobado|rechazado`, revisado_por, revisado_en). El fichero no se sirve a nadie hasta que la oficina lo aprueba en la **Bandeja** (decisión 10 y OFICINA §8); aprobado, se publica como un evento de la haza con `origen = 'corresponsal'` (la columna ya existe en `0004_vida.sql`). **No se recodifica en el VPS** (ffmpeg sería otra pieza y CPU): se valida el tipo por contenido y se quitan metadatos del contenedor si los hay **[NO VERIFICADO qué metadatos deja MediaRecorder]**.
- **Retención** (pregunta P4): pendiente sin revisar, **30 días** y se borra; rechazado, **en el acto**; aprobado, **la campaña y un año más** (como las decisiones 100 y 164). La purga de cada 6 h que ya existe se amplía. Exportación y borrado: el clip entra en `GET /api/yo/datos` de la cuenta del corresponsal y la oficina puede borrarlo a petición de quien salga en él (§9).

## 8. Batería, calor y campo

- **Consumo:** pantalla + GPS + cámara + codificación + 4G a la vez es lo más caro que hace un móvil. **[SUPUESTO, sin medir]** del orden de 20-30 % de batería por hora. La pantalla de preparación estima los minutos que quedan con la batería actual y una tasa medida en F4-2 en el aparato.
- **Bajar solo:** con < 30 % o si la pose informa de muchos fotogramas perdidos, el móvil deja de ofrecer h720 (techo h360); con < 15 %, solo posición y aviso. No hay API web de temperatura fiable **[NO VERIFICADO: Compute Pressure existe en Chrome, sin probar en Android]**; el calor se gestiona con sesiones cortas (≤ 45 min de emisión), una batería externa y no dejar el móvil al sol entre tomas.
- **Pantalla al sol:** brillo alto, alto contraste, botones ≥ 64 px (con guantes: el XCover tiene modo guantes **[NO VERIFICADO]**).
- **Prueba de cobertura F4-0:** antes de nada. Una página pequeña `/medida-campo` (sin LiveKit) que en cada uno de 5-6 puntos mide bajada, **subida** y latencia contra el servidor y anota la haza (no las coordenadas: con la haza basta para decidir). Resultado: una tabla haza → «directo / solo 180p o posición / solo clips», que la pantalla de preparación consulta. Es lo que decide si F4-3 merece la pena antes que F4-5.

## 9. Privacidad, en corto (detalle en [EIPD-CAMPO](EIPD-CAMPO.md))

- Vídeo **solo en visitas guiadas**, que ven **solo los inscritos** de esa visita, el guía y la oficina (patrón de la decisión 154); nunca en la visita libre.
- **No se graba el directo** (decisión 10); los clips se revisan antes de verse.
- **La posición del corresponsal solo existe mientras emite**, no se guarda y nunca va a OlivarTrack; ni rastro de recorridos (coherente con la decisión 173: nunca personas).
- Aviso previo **por escrito** a la cuadrilla, aviso verbal al llegar y **chaleco «Cámara en directo»**; encuadre a copa y suelo; si aparece una persona o alguien lo pide, **Pausar** (un toque).
- **Finalidad cerrada:** divulgar la finca a las familias. Las imágenes **no se usan para controlar ni evaluar el trabajo** de nadie, y así se dice por escrito.
- El desenfoque automático de caras **no es una garantía** (falla de perfil, a distancia, con sombrero) y su coste en el móvil está sin medir: no se adopta como medida principal (EIPD-CAMPO §8).

## 10. Plan F4-0 a F4-7 (revisado, tareas atómicas)

Pesos: *ligera* (código o documento, sin Chrome ni Docker), *media* (código con pruebas de Node), *🔶 banco* (Chrome o Docker, por turno), *👤* (persona en campo). Ningún directo con personas reales hasta validar EIPD-CAMPO (como la decisión 41).

| Id | Tarea | Depende | Peso · modelo |
|---|---|---|---|
| F4-0 | Prueba de subida 4G: `/medida-campo` (bajada, subida, latencia, haza) y la tabla haza → modo | — | ligera · sonnet; 👤 campo |
| F4-1 | Este estudio, ADR-0030 y el borrador EIPD-CAMPO | decisión 19 | ✅ (esta tarea) · opus |
| F4-1b | 👤 Validar EIPD-CAMPO con la asesoría; textos de aviso a la cuadrilla y del chaleco | F4-1 | 👤 Antonio |
| F4-2a | api: `visitas.corresponsal_id` (migración y ruta de la oficina, como `guia_id`), papel `corresponsal` en el token de `guiada-<evento>` **solo con datos** (`livekit-roles` v8 sin cámara todavía), 403 en salas fijas, aparato aprobado; auditoría; prueba que decodifica el token | F4-1 | media · sonnet |
| F4-2b | Contrato pose v2 (tipo 3, §5): `presencia.md`, `PoseCodec`, receptor que acepta 1 y 2, guardián `presencia.test.js` | F4-1 | media · sonnet |
| F4-2c | Puro: `CampoPuro` (proj4 WGS84 → UTM 30N → local, caja de la finca, filtro de precisión, rumbo desde `alpha` y orientación de pantalla, media circular) con prueba de Node; sacar la definición de EPSG:25830 a un módulo común con la oficina | F4-1 | ligera · sonnet |
| F4-2d | Web `/campo/`: entrada de Vite nueva, manifiesto y *service worker* (valorar `vite-plugin-pwa`, regla 12), lista de visitas, «Preparar emisión» de UX §4.10 (permisos, Wake Lock con reintento, batería, avisos obligatorios), emisión de pose a 2 Hz y «pausa» al ocultarse; nota de comodidad | F4-2a, F4-2b, F4-2c | media · sonnet |
| F4-2e | Mapa 2D de la zona en `/campo/` (OpenLayers del trozo de Hazas: hazas, olivos cercanos, visitantes) | F4-2d | media · sonnet |
| F4-2f | e2e por el banco: Chrome con geolocalización emulada por CDP (`Emulation.setGeolocationOverride`) contra `infra/dev`: el visor ve al corresponsal donde dice la lectura; ocultar la página lo pone en pausa | F4-2d | 🔶 banco · sonnet |
| F4-2g | 👤 El aparato real: Wake Lock 45 min, GPS con pantalla encendida, batería por hora, qué pasa al apagar la pantalla | F4-2d | 👤 Antonio |
| F4-3a | api: `livekit-roles` v8 completa (`camera` + `microphone` solo al papel corresponsal), cortar el vídeo desde la oficina (`UpdateParticipant`, auditado); prueba de unidad: ningún otro papel lleva `camera` | F4-2a | media · **opus** (permisos) |
| F4-3b | `/campo/`: publicar cámara trasera (h720 a 24 fps, capas h180/h360, dynacast), micrófono pulsar-para-hablar, botón Pausar grande; bajar techo por batería | F4-3a, F4-2d | media · **opus** |
| F4-3c | e2e por el banco con `--use-fake-device-for-media-stream`: el corresponsal publica cámara, un hogar no puede (rechazo del servidor), cortar despublica | F4-3b | 🔶 banco · sonnet |
| F4-3d | Medida en `infra/dev` (banco): subida con red limitada (capas que caen), salida de LiveKit con 1 vídeo y 10 visores simulados; con 40, desde otra máquina o el VPS | F4-3c | 🔶 banco · sonnet |
| F4-4a | Núcleo: `Laminas` con `video` (`VideoTexture`), presupuesto, liberado; prueba en Node de la parte pura | F4-1 | media · **opus** (núcleo, ADR-0023) |
| F4-4b | Motor: avatar del corresponsal (chaleco, cono de visión con su anchura según el ruido de la brújula, halo de precisión, estados pausa / sin señal), pantalla flotante con su vídeo (suscripción por distancia, `adaptiveStream`), ficha «posición ajustada»; VR: anclada al mundo y «Acercar la pantalla» | F4-2b, F4-3b, F4-4a | media · **opus** |
| F4-4c | Medida de dibujo y memoria (skill `medir`, SwiftShader: recuentos, no fps) con la pantalla abierta; nota de comodidad en pantalla y VR | F4-4b | 🔶 banco · sonnet |
| F4-5a | api: tabla `clips`, subida tus a `GEMELO_MEDIOS`, límites (tipo por contenido, ≤ 10 MB, 60 s), Caddy, retención y purga, exportación y borrado; integración con PostGIS | F4-2a | media · sonnet; 🔶 Docker |
| F4-5b | `/campo/`: grabar con MediaRecorder, IndexedDB con `idb`, cola de pendientes, subida reanudable al volver la red y borrado tras confirmar el SHA-256 | F4-5a, F4-2d | media · sonnet |
| F4-5c | Oficina: revisar clips en la Bandeja (ver, aprobar, rechazar) y publicar como evento de la haza `origen = 'corresponsal'` | F4-5a | ligera · sonnet; 🔶 Docker |
| F4-6 | Precisión: suavizado e imán (§4.8) como funciones puras con prueba de Node; 👤 medida en campo bajo copa (error frente a olivos conocidos) | F4-2c | ligera · sonnet; 👤 campo |
| F4-7 | 👤 Visita guiada con corresponsal de punta a punta (guía + corresponsal + visores en escritorio y Quest): error de posición, directo, clip diferido, batería y calor | F4-1b, F4-4b, F4-5b, F4-6 | 👤 Antonio |

Orden propuesto: **F4-0 y F4-1b primero** (baratas y deciden el resto), luego F4-2a/b/c en paralelo (ligeras), F4-2d, F4-2g en campo; con su resultado, F4-3 o directamente F4-5 si la cobertura no da. F4-4a puede ir en cualquier momento (no depende del móvil).

**Plan B (solo si F4-2g falla):** si en el aparato la PWA no mantiene la pantalla y el GPS durante una visita (ahorro de batería de Samsung, Wake Lock rechazado), se envuelve la misma web en **Capacitor** con un servicio en primer plano para la ubicación (`@capacitor-community/background-geolocation`, que exige la notificación persistente en Android 13+: [su repositorio](https://github.com/capacitor-community/background-geolocation)). Sería un ADR nuevo que enmienda la decisión 19.

## 11. Preguntas para Antonio

Están, con su recomendación, en [ADR-0030 § Preguntas](../adr/0030-corresponsal-de-campo-pwa-en-primer-plano.md#preguntas-para-antonio).
