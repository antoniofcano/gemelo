# Contrato: presencia compartida (F2) — pose binaria, tasas e interpolación

**Versión 1** (byte 0 de cada mensaje). Plan y decisiones: [PLAN F2](../doc/rumbo/PLAN.md), [DECISIONS-PENDING 39–42](../doc/rumbo/DECISIONS-PENDING.md), [UX §5.4 Gente](../doc/sistema/UX.md#54-gente). Permisos por rol en la sala: [livekit-roles.json](livekit-roles.json). Código: `apps/web/motor/26_presencia.js` (`PoseCodec`, `BufferPose`, `Presencia`). Lo comprueba `pruebas/guardianes/presencia.test.js`.

**Estado: el códec, la interpolación y los avatares existen y están probados en Node y en Chrome headless con visitantes simulados (`?presencia=sim`); con `?presencia=red` el motor entra en la sala de LiveKit de verdad (P2; lógica probada en Node, `pruebas/guardianes/presencia_red.test.js`) y está probado contra el LiveKit de `infra/dev` con dos y tres páginas de Chrome headless en el mismo equipo y 40 clientes de carga en Node (P4, `pruebas/guardianes/presencia_dev.test.js`; cifras en [MEDIDAS](../doc/sistema/MEDIDAS.md)).** No se ha probado con dos personas en dos equipos, ni por la WiFi (`--red-local`), ni en iPhone ni en Quest.

## Qué viaja y qué no

| Viaja en cada mensaje de pose | Viaja una vez, al entrar (metadatos del token, los pone la api) | No viaja nunca |
|---|---|---|
| posición y giro de la cabeza; en Quest, también de las dos manos; secuencia y reloj del emisor | alias, avatar (camisa, sombrero, tono de piel), rol, dispositivo | correo, nombre real, haza del hogar, IP, nada que identifique fuera de la sala |

La identidad en la sala (`identity` de LiveKit) es un **id opaco** que da la api, **uno por sesión (aparato)**: `h_<22>_<8>` (el prefijo `h_<22>` es del hogar; los 8 últimos, de la sesión); el cliente nunca la elige ni la deriva del correo. El mismo hogar puede estar a la vez en el ordenador, el móvil y las gafas ([livekit-roles.json](livekit-roles.json), versión 2). La pose **no se guarda** en ningún sitio (UX §5.7: «la posición de tu avatar no se guarda»).

## Sistema de coordenadas

- **Origen:** `centro_utm` de la finca (el mismo de las teselas, [CONTRATOS](../doc/sistema/CONTRATOS.md)); en F2, Hituelo (decisión 22: un solo mundo).
- **Ejes = los de three en el motor:** `x` = este (m), `y` = cota (m sobre el `z0` de la finca, **sin exagerar**), `z` = −norte (m). El giro es un cuaternión en esos mismos ejes (`−Z` = norte, `+Y` arriba).
- **La exageración vertical no viaja.** Cada receptor coloca el avatar a su altura **sobre el suelo**: `y_dibujo = suelo·exag + (y − suelo)`, con su propio `suelo(x, −z)`. Mientras una tesela no ha llegado, `suelo` es el relieve grueso de 8 m: el avatar puede flotar o hundirse unos decímetros hasta que llega (sin medir en Hituelo real).
- **Unidades en el cable:** centímetros enteros (`int32`, ±21.474 km).

## Tabla de bytes (little-endian)

Escritorio (tipo 1) = **24 B**. Quest (tipo 2) = **56 B**. Ninguna otra longitud es válida.

| Byte | Tamaño | Tipo | Campo | Notas |
|---|---|---|---|---|
| 0 | 1 | u8 | versión | `1`. Otra versión → el receptor descarta el mensaje (no adivina) |
| 1 | 1 | u8 | tipo y banderas | bits 0–1: tipo (`1` escritorio/móvil: cabeza; `2` Quest: cabeza + manos; `0` y `3` reservados → se descarta). Bit 2: hay mano izquierda. Bit 3: hay mano derecha. Bits 4–7: `0` (reservados; el receptor los ignora) |
| 2 | 2 | u16 | secuencia | +1 por mensaje, da la vuelta en 65535 → 0. El receptor descarta la repetida y la más vieja que la última (diferencia módulo 2¹⁶ ≥ 32768) |
| 4 | 4 | u32 | reloj del emisor | ms de su `performance.now()` (módulo 2³²). Solo sirve para ordenar e interpolar; no es una hora |
| 8 | 4 | i32 | cabeza x | cm |
| 12 | 4 | i32 | cabeza y | cm (cota sin exagerar) |
| 16 | 4 | i32 | cabeza z | cm (−norte) |
| 20 | 4 | u32 | cabeza giro | cuaternión *smallest-three* (abajo) |
| 24 | 12 | 3 × i32 | mano izquierda x, y, z | solo tipo 2; ceros si el bit 2 está apagado |
| 36 | 4 | u32 | mano izquierda giro | ídem |
| 40 | 12 | 3 × i32 | mano derecha x, y, z | solo tipo 2; ceros si el bit 3 está apagado |
| 52 | 4 | u32 | mano derecha giro | ídem |

**Cuaternión *smallest-three* en 32 bits:** se normaliza; la componente de mayor valor absoluto se hace positiva (q y −q son el mismo giro) y no viaja: su índice (0 = x, 1 = y, 2 = z, 3 = w) va en los bits 30–31. Las otras tres, en su orden x‑y‑z‑w saltando la mayor, en los bits 20–29, 10–19 y 0–9, cuantizadas a 10 bits en [−1/√2, 1/√2]: `q = round((v + 1/√2) / √2 · 1023)`. Al leer, `v = q / 1023 · √2 − 1/√2` y la mayor `= √(1 − Σv²)`.

El códec usa `DataView` (estándar del navegador y de Node); no hace falta librería: son 16 campos fijos. Si un día se quieren mensajes con esquema evolutivo (chat con adjuntos, estado de puzles), entonces sí convendría una librería de serialización mantenida (p. ej. FlatBuffers o protobuf); para la pose no compensa.

## Errores medidos (ida y vuelta)

`GEMELO_MIDE=1 node --test pruebas/guardianes/presencia.test.js`, 200.000 poses al azar con semilla fija (2026-10-29, Node 24):

| Qué | Medido | Tope que comprueba la prueba |
|---|---|---|
| Posición, por eje | 5,000 mm (el redondeo a cm) | ≤ 5 mm |
| Giro de la cabeza | 0,241° | ≤ 0,25° |
| Giro de las manos | 0,240° | ≤ 0,25° |

## Tasas: 10 Hz a los cercanos, 2 Hz a los demás

- Cada cliente hace un **tic cada 100 ms**. En cada tic manda su pose a los **cercanos** (`destinationIdentities` de LiveKit); en uno de cada cinco tics (2 Hz) la manda a **toda la sala** (que incluye a los cercanos, que así reciben exactamente 10 Hz).
- **Cercano:** a menos de 55 m en horizontal (entra) y deja de serlo a más de 65 m (sale): histéresis para que no oscile en el borde. La distancia la calcula el emisor con las poses que recibe de los demás.
- Canal de datos **no fiable** (*lossy*) y tema `pose`: una pose perdida no se reenvía, la siguiente la sustituye. El chat va por el tema `chat`, **fiable** y sin guardar (decisión 40).
- Carga por emisor (solo la carga útil, sin las cabeceras de LiveKit/WebRTC, que no se han medido): escritorio 240 B/s a cada cercano y 48 B/s a cada lejano; Quest 560 y 112 B/s.

## Interpolación (receptor)

- Un búfer por visitante con sus últimas 12 poses en orden de secuencia (`BufferPose`). El desfase de relojes se estima como el mínimo de `llegada − reloj del emisor`.
- Se dibuja la pose de hace **150 ms** si te llega a 10 Hz y de hace **650 ms** si te llega a 2 Hz: posición lineal, giro *nlerp*. Al cambiar de tasa el retardo cambia a 0,5 s por segundo, para que el avatar no salte. Si falta la pose siguiente, se extrapola **como mucho 120 ms** y luego se queda quieto.
- Medido en Node con la red simulada del motor (retardo 30–90 ms, 60 fps, trayectoria a 1,4 m/s): error de la pose dibujada frente a la verdad del instante que dice mostrar **≤ 0,8 cm a 10 Hz y ≤ 6 cm a 2 Hz** (topes de la prueba: 3 y 15 cm). El retardo total que ve quien mira es red + 150 ms; el objetivo del plan (pose p95 < 250 ms) solo se podrá medir con LiveKit de verdad.
- El receptor deduce si le llega a 10 o a 2 Hz: en la simulación, por la distancia que él mismo ve **[SUPUESTO]**; con `?presencia=red`, por el ritmo de llegada (media móvil del intervalo; < 300 ms → 150 ms de retardo, si no 650 ms).

## Avatares

**Cómo se mueve (lo calcula quien mira; la pose no trae nada más: el contrato v1 no cambia).** Los **pies van al suelo de este mundo**: `suelo(x, −z) × exageración` de quien mira, no la cota de la pose. De la pose se usan la posición horizontal, el giro de la cabeza (la cabeza mira donde mira la de verdad) y, **solo con gafas**, la altura de la cabeza sobre el suelo para agacharse (hasta 0,9 m: baja el tronco y encogen las piernas). Con la velocidad horizontal que sale de la interpolación (suavizada) se anima el paso con la misma fórmula del paseante: balanceo de piernas `sin(paso) × 0,75 × min(1, v/1,7)`, brazos al 80 % en contra, bote de 3 cm; quieto, brazos y piernas en reposo. El cuerpo gira suave hacia donde anda y, quieto, hacia donde mira. Con manos de la pose (Quest) los brazos no se animan. Un salto de más de 5 m entre fotogramas (vuelve tras un hueco) no cuenta como andar. La lógica es `Muneco`, en el trozo puro (probada en Node, `presencia.test.js`). Tronco, piernas y brazos son la misma caja instanciada (5 instancias por avatar en una llamada): siguen siendo **5 llamadas** con 10 o con 40 visitantes; unos 94 triángulos por avatar (118 con manos).

**El mismo muñeco que el paseante local** (`12_paseo.js`; P5, 2026-10-29): tronco y brazos del color de su camisa, piernas de pantalón, cabeza (icosaedro, tono de piel), sombrero (paja, gorra o ninguno), manos solo para Quest, y el **nombre** encima (atlas de texto en un plano instanciado que mira a la cámara; crece con la distancia y se apaga a más de 160 m). Todo **instanciado**: 5 llamadas de dibujo tengas 10 o 40 visitantes (medido; [MEDIDAS](../doc/sistema/MEDIDAS.md)). Se ven también en VR (están en la misma escena).

## Simulación (`?presencia=sim`)

`?presencia=sim` simula 10 visitantes (`&n=1..64`), la mitad cerca del punto de partida de la cámara y el resto repartidos por la finca; un 30 % son de Quest. Andan, mandan su pose por el códec con las tasas de arriba por una red de mentira (30–90 ms, 1 % de pérdida, relojes con desfases distintos y algunos a punto de dar la vuelta) y se dibujan con el búfer. Sin la bandera, `26_presencia.js` no crea nada. Gancho de pruebas: `window.__presencia()` (estado) y `window.__presencia("libera")` (lo suelta todo). La simulación va al ritmo de los fotogramas: en Chrome headless con SwiftShader (pocos fps) las cifras de retardo que da no representan nada; las de referencia son las de Node.

## La red (`?presencia=red`, P2)

- Cliente: **`livekit-client` 2.22.4** (versión exacta en `apps/web/package.json`), pedido con `import()` solo con la bandera (Vite lo deja en un trozo aparte; sin la bandera no se descarga). Pide el token a la api (`POST /api/presencia/token`, mismo origen, con la sesión) y se conecta a la `url` que esta devuelve (`autoSubscribe: false`: no hay pistas).
- Publica con `localParticipant.publishData(bytes, { reliable: false, topic: "pose", destinationIdentities })` y lee con `RoomEvent.DataReceived`. La lógica (tics, cercanía, quién está en vista aérea, ritmo) es `SalaPose`, en el trozo puro; el motor solo le pasa lo que llega y publica lo que devuelve. Nombres comprobados contra los tipos de la 2.22.4 y contra LiveKit 1.13.11 real (P4).
- **La pose propia:** con gafas, la cabeza es `VRX.cab` (rig + pose local) con el giro del rig por el de la cámara, y las manos, las empuñaduras de los mandos (`getControllerGrip`, el lado lo da WebXR al conectarse); paseando en pantalla, el paseante (`pp`) a 1,6 m del suelo, mirando a su rumbo (tipo 1). La cota se pasa al contrato quitando la exageración: `y = y_dibujo − suelo·exag + suelo`.
- **Vista aérea (decisión 60):** en órbita, y con gafas en vuelo o en el mirador, no se publica pose. Los demás no te dibujan y el panel Gente te lista «en vista aérea»: cualquiera conectado sin pose en los últimos 2 s sale así, y su avatar se quita. No hace falta ningún mensaje más (el contrato de bytes no cambia).
- **Panel Gente** (DOM, solo con la bandera, en el visor): tú y los demás con alias, rol, dispositivo y estado; **Bloquear** (solo para ti: deja de dibujar su avatar y de mostrar su chat). **Chat:** tema `chat`, fiable, texto UTF-8 de como mucho 280 caracteres sin caracteres de control ni de dirección; se guarda solo en memoria de la página (los últimos 40) y nunca en el servidor (decisión 40). Lo que llega se pone como texto, nunca como HTML. Como mucho un mensaje cada 0,7 s.
- 49 plazas de avatar (la sala admite 50, `infra/dev/livekit.yaml`); más allá no se dibujan (`window.__presencia().sinPlaza`).
- Al salir: si la oficina te saca (`PARTICIPANT_REMOVED`) o abres la visita en otra pestaña con la misma sesión (`DUPLICATE_IDENTITY`), lo dice; si no, «te has desconectado» con un botón para volver a entrar. No reintenta solo (más allá de la reconexión propia de LiveKit).
- Servidor: **hecho** (P1). `POST /api/presencia/token` ([api.openapi.yaml](api.openapi.yaml)) firma con `livekit-server-sdk` 2.19.2 el token de la sala `hituelo-libre`: identidad `h_<22>_<8>` (HMAC del id del hogar y HMAC del id de la sesión, los dos con el secreto de LiveKit: estable por sesión, no deducible sin el secreto; ni el correo, ni el id de la base, ni el de la sesión), permisos de [livekit-roles.json](livekit-roles.json), metadatos `{alias, avatar, rol, dispositivo}` desde la base y caducidad de 15 min (solo sirve para entrar). Variables `GEMELO_LIVEKIT_URL`, `GEMELO_LIVEKIT_URL_PUBLICA`, `GEMELO_LIVEKIT_CLAVE`, `GEMELO_LIVEKIT_SECRETO(_FICHERO)`; sin la primera, 503. Una identidad por sesión: dos aparatos del mismo hogar (cada uno con su sesión) están a la vez; dos pestañas de la misma sesión comparten identidad y la segunda cierra la primera (`DUPLICATE_IDENTITY`).
- **Moderación mínima (P3, decisión 42):** `POST /api/admin/presencia/expulsar {hogar_id, motivo?}`, solo rol `admin`. La api saca a **todas** las conexiones de ese hogar (lista la sala con `RoomService.ListParticipants` y quita con `RemoveParticipant` las identidades con su prefijo) (su clave de servidor; ningún token de cliente lleva `roomAdmin`), no le da token nuevo durante 15 min (en memoria: no sobrevive a un reinicio de la api; para más, revocar sus sesiones) y lo apunta en `auditoria` como `admin.presencia_expulsado` (hogar, sala, si estaba, cuántas conexiones y el motivo). Si LiveKit falla, responde 500 y no se apunta. Contra LiveKit 1.13.11 (P4): `RemoveParticipant` de quien no está responde 404 `not_found` («participant does not exist») y `ListParticipants` de una sala que no existe devuelve una lista vacía, sin error. El rol de guía completo, con F3.
- **A dónde se conecta el navegador:** la api da `url` = `wss://…` o una **ruta del mismo origen** (`/rtc`); el motor la resuelve contra su página (`https` → `wss`). En local (`infra/dev`) es `/rtc`: Caddy pasa `wss://<sitio>/rtc/…` a LiveKit, igual desde `https://localhost:8743` que desde `https://<IP de la WiFi>:8743` (`--red-local`), y la CSP se queda en `connect-src 'self'`, como en producción. Comprobado en P4 (Chrome headless 2026-10-29): Chrome **sí** abre `ws://localhost:7880` desde `https://localhost:8743` (localhost cuenta como origen seguro), pero eso no sirve desde otro aparato; por eso el mismo origen. Los datos (pose y chat) no van por la señalización sino por WebRTC: UDP 7882 (o TCP 7881) directos a LiveKit, que con `--red-local` se abren en la IP de la WiFi ([DESARROLLO-LOCAL](../doc/operacion/DESARROLLO-LOCAL.md#presencia-compartida-en-local-p4)).
- **Permisos, contra LiveKit 1.13.11 (P4):** el servidor aplica el token tal cual (`canPublish: false`, `canPublishData: true`, `canPublishSources: []`, `canUpdateMetadata: false`); publicar una pista de micrófono no se acepta (el servidor no responde a la petición y el cliente la da por fallida; cero pistas en la sala) y los datos sí pasan.

## Versionado

Cambiar un campo, su tamaño o su significado es **subir la versión** (byte 0), cambiar esta tabla, el códec y su prueba en el mismo commit. El receptor descarta las versiones que no conoce: durante un despliegue con versiones mezcladas, cada cliente ve solo a los de su versión (aceptable con cuentas de prueba; a revisar antes de abrir a gente real).
