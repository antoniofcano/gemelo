# Contrato: consentimiento de voz (por ámbito) y plazo de la auditoría de voz (F3j, F3k-1)

Rutas: [api.openapi.yaml](api.openapi.yaml) (`GET`, `PUT` y `DELETE /api/presencia/voz/consentimiento`; esquema `VozConsentimiento`). Tabla y función: `apps/api/migraciones/0018_voz_consentimiento.sql`. Código: `apps/api/src/presencia/consentimiento_voz.ts` (versión vigente, estado, plazo), `apps/api/src/presencia/voz.ts` (`Palabra`: la comprobación que manda) y `apps/web/motor/47_habla.js` (el aviso y la retirada). Decisiones: ADR-0026, 163 (base jurídica: consentimiento para las familias) y 164 (plazo). Texto legal: **BORRADOR pendiente de la asesoría** ([EIPD-VOZ](../doc/sistema/EIPD-VOZ.md) §3 y §13).

**F3k-1 (2026-11-05; ADR-0032, decisión 211: aviso propio):** el consentimiento es **por ámbito**: `guiada` (todo lo de F3j, sin cambios) y `cercania` (la voz por cercanía en corros de la visita libre). Migración `0025_voz_cercania.sql`. Ver [«El ámbito cercania»](#el-ámbito-cercania-f3k-1) abajo.

## Qué se guarda

Una fila por hogar **y ámbito** en `voz_consentimientos` (clave `hogar_id, ambito`; desde la 0025): `hogar_id`, `ambito` (`guiada` o `cercania`), `version` (la del texto del aviso que aceptó) y `aceptado_en`. **Nada de la voz**: ni audio, ni texto, ni IP. Al borrar el hogar se borra la fila (`ON DELETE CASCADE`); sale en «Mis datos» (`voz_consentimiento`, el de la guiada; y `voz_cercania.consentimiento`). Aceptar y retirar quedan en la auditoría (`voz.consentimiento_dado` y `voz.consentimiento_retirado`, con la versión; sin más datos).

## La versión del texto

- **El texto vive en el motor** (`HablaPuro.AVISO` en `47_habla.js`) y lleva `AVISO_VERSION`. La api tiene `VOZ_AVISO_VERSION`. **Tienen que ser el mismo número** (lo comprueba `voz_consentimiento.test.ts`).
- Si cambia el texto, **se suben las dos en el mismo commit**: el consentimiento guardado con la versión vieja deja de valer (`aceptada: false`, `version_aceptada` distinta) y el aviso se vuelve a pedir a todos.
- `PUT` lleva la versión que el cliente enseñó; si no es la vigente (una pestaña vieja), `409 version_distinta` y no se guarda nada.

## Quién manda: la api, no el motor

- **Sin consentimiento vigente, el servidor no da la palabra** a ese hogar: `POST …/guiadas/:evento/palabra` responde `409 sin_consentimiento` y **no se toca LiveKit** (el permiso de micrófono no se abre). Tampoco se acepta su mano levantada (`POST …/mano`, `409 sin_consentimiento`). La comprobación está en `Palabra.da` y `Palabra.levanta` (voz.ts), no solo en la ruta, y la hace en el momento de dar la palabra.
- El **motor** enseña el aviso antes (pantalla: diálogo modal con foco y Esc; VR: lámina que se toca con el rayo o el gatillo; «Aceptar» / «Ahora no»; el foco empieza en «Ahora no»), pero es comodidad: un cliente modificado que se salte el aviso no consigue hablar.
- **Solo las familias.** El guía y la oficina no pasan por el aviso: la base de su voz la decide la asesoría ([EIPD-VOZ](../doc/sistema/EIPD-VOZ.md) §3).
- **Retirar** (`DELETE`; Configuración → Hablar, o el panel de VR): se borra la fila **primero** (desde ese instante no se le da la palabra) y luego, si tenía la palabra o la mano levantada en alguna sala, se le quita al momento (LiveKit despublica su micro; auditoría `guiada.palabra_quitada` con motivo `consentimiento`). Si LiveKit no responde, el consentimiento ya está retirado y se avisa en el registro.

## Plazo de la auditoría de voz (decisión 164: la campaña y un año más)

- La campaña de aceituna va de **octubre a septiembre** **[SUPUESTO: lo confirma Antonio con la EIPD]**. Una fila escrita en la campaña Y/Y+1 se guarda hasta el **1 de octubre de Y+2**; entonces se borra. Ejemplo: el 5 de octubre de 2028 se borra todo lo anterior al 1 de octubre de 2027.
- **Qué se borra:** las acciones `guiada.*` (manos, palabra dada/alargada/quitada, silenciar, expulsar, cerrar), **`corro.*`** (F3k-1, decisión 212 provisional), `voz.consentimiento_retirado` y los `voz.consentimiento_dado` de quien ya no tiene consentimiento vigente **en ese ámbito** (mientras lo tenga, es su prueba; el ámbito va en el detalle, `ambito`, y sin él es la guiada). El resto de la auditoría no se toca.
- **Cómo:** `gemelo_api` solo puede leer y añadir en `auditoria` (migración 0001). Se borra con la función de la base `purga_auditoria_voz(corte)` (`SECURITY DEFINER`, solo esas acciones, `EXECUTE` solo para `gemelo_api`), que llama `purgaAuditoriaVoz` desde el mismo reloj de 6 horas de `principal.ts` que las demás purgas. El corte lo calcula `corteAuditoriaVoz` (UTC).
- La decisión 100 (sugerencias, avisos, inscripciones y lotes por hogar: la campaña y un año más) reutiliza `corteAuditoriaVoz` en `purgaCampana` (`apps/api/src/vida/retencion.ts`; ver [VIDA.md](../doc/sistema/VIDA.md)).

## El ámbito «cercania» (F3k-1)

Decisiones (ADR-0032): **210** (apagada por defecto, se activa por cuenta en Configuración) y **211** (aviso propio), cerradas por Antonio el 2026-11-05; **208** (M1: declaración de mayor de edad en el aviso) **provisional**. Código: `apps/api/src/presencia/consentimiento_voz.ts` (`VOZ_CERCANIA_AVISO_VERSION`, `VERSION_AVISO`), `voz_rutas.ts` (las rutas, con `?ambito=cercania`), `cercania.ts` y `corro_rutas.ts` (quién manda).

- **Rutas:** las mismas, con `?ambito=cercania`: `GET`, `PUT { version, adulto: true }` y `DELETE /api/presencia/voz/consentimiento?ambito=cercania`. Sin `ambito`, `guiada` (como antes). `PUT` sin `adulto: true` → `409 falta_declaracion`; con otra versión → `409 version_distinta`. Auditoría `voz.consentimiento_dado` / `voz.consentimiento_retirado` con `{ version, ambito: "cercania" }`.
- **Quién manda: la api.** Sin consentimiento `cercania` vigente, `PUT /api/presencia/corros/ajuste { activa: true }` da `409 sin_consentimiento`, nadie te puede invitar (`no_disponible`), no puedes invitar (`no_puedes`) y **no hay token** de la sala de un corro. **Retirarlo** borra la fila, **apaga el ajuste** y te **saca al momento** de tu corro (RemoveParticipant; si LiveKit no responde, tu token ya no se renueva).
- **El texto vive en el motor** (F3k-3: `CorroPuro.AVISO` en `apps/web/motor/47b_corro.js`, como `HablaPuro.AVISO` para la guiada) con su `AVISO_VERSION` de cercanía; **tiene que ser el mismo número** que `VOZ_CERCANIA_AVISO_VERSION` (hoy, 1). Lo comparan `pruebas/guardianes/corro.test.js` (motor, api y este fichero; y que cada frase del motor está aquí tal cual) y `apps/api/pruebas/unidad/corro.test.ts` (api y este fichero). El motor lo enseña en Configuración → Voz al marcar la casilla y en la fila «Voz por cercanía» del panel de VR (pestaña «Comodidad»).
- **Base:** consentimiento (como la 163), específico de este ámbito: aceptar el de la guiada no vale para la cercanía ni al revés. Cada invitación aceptada es además un consentimiento por corro, que lo refuerza pero no lo sustituye (EIPD-VOZ §13.4).

### Aviso «cercania», versión 1 — texto PROPUESTO (BORRADOR pendiente de la asesoría)

Lo enseña el motor antes de activar la voz por cercanía (pantalla: diálogo modal con foco y Esc; VR: lámina con rayo o gatillo). Botones **«Activar»** / **«Ahora no»**, con el foco en «Ahora no» (nada se abre solo). «Activar» queda deshabilitado hasta marcar la declaración.

> **Hablar con quien pasea cerca (voz por cercanía)**
>
> **Qué va a pasar**
> - Podrás invitar a hablar a quien esté cerca de ti en la visita libre, y te podrán invitar. **Solo hablaréis si la otra persona acepta**: sin aceptar, nadie te oye y no oyes a nadie.
> - Un corro es de 2 a 5 hogares. Todos veis quién está dentro y solo os oís entre vosotros; cuanto más lejos, más bajo (a más de 20 m dejáis de oíros).
> - Tu micrófono **solo se abre cuando pulsas** el botón de hablar (o la tecla T, o el gatillo en las gafas) y se cierra al volver a pulsar, tras un minuto sin que hables y al salir del corro. Mientras está abierto lo verás: «● Tu micro está abierto».
> - Hablarás con personas que quizá no conozcas y **no hay nadie moderando en directo**, como sí lo hay en las visitas guiadas. Si algo te molesta: **Salir** del corro, **Silenciar** a alguien, **Bloquear** (no podrá volver a invitarte) o **Avisar** a la oficina con un motivo. La oficina puede suspender la voz de un hogar.
> - Puede oírse lo que suena a tu alrededor (otra persona de la casa, la tele). Te recomendamos usar auriculares.
>
> **Qué no va a pasar**
> - **No se graba nada**: ni la voz ni lo que se dice; tampoco se transcribe.
> - Nadie de fuera del corro te oye, aunque esté a tu lado: solo quien ha aceptado entra en la conversación.
> - No se guarda con quién has hablado: solo un registro de quién entró y salió de cada corro y cuándo, para poder atender un aviso; se borra pasada la campaña y un año más.
> - La voz por cercanía no se activa sola: la activas tú y la apagas cuando quieras en Configuración → Voz (o en el panel de las gafas). Apagarla o retirar este permiso te saca al momento de cualquier corro.
>
> ☐ **Soy mayor de edad y no dejaré que hablen menores con mi cuenta.**
>
> Más detalles en la página de privacidad.

**[SUPUESTO del agente]** la redacción; las cifras (5 hogares, 20 m, 1 minuto) son las **provisionales** de las decisiones 205-207; si cambian, cambia el texto y se sube la versión. Lo revisa la asesoría con la EIPD (§13.5).

## La tarjeta «Tu micrófono, en pocas palabras» (F3l)

**No es un consentimiento** y no lleva versión ni va a la api: es una ayuda de comodidad que se enseña **después** del aviso (el de la guiada o el de `cercania`), la primera vez que una familia o un miembro de un corro va a abrir el micro. Dice en tres líneas con quién se oye (la guiada: el guía y las demás familias; un corro: solo su corro, hasta 5 hogares, y a más de 20 m dejáis de oíros), cómo cortar el micro (botón «Silenciarme» o dejar de apretar «Hablar», tecla T, gatillo izquierdo en VR; en un corro, también tras un minuto sin hablar) y que **no se graba ni se transcribe**. «Entendido» (o Esc) la da por vista.

- **Dónde se guarda que ya se vio:** en el aparato (ajuste `habla.tarjeta`, `localStorage`), no en la api: no es un dato del hogar ni hace falta que viaje; otro aparato la enseña una vez. Volver a leerla: Configuración → Hablar → «Cómo funciona mi micrófono» y, en VR, ese botón en la fila «Micrófono» del panel.
- **Quién no la ve:** el guía y la oficina (hablan por su cargo, como con el aviso).
- **Código:** `apps/web/motor/46b_primera_vez.js` (texto y reglas, puro) y `47_habla.js` (cuándo sale y cómo se pinta: diálogo en pantalla, lámina en VR). La cifra de 20 m es la de `45_voz.js` (`DIST_CORRO.corte`); `primera_vez.test.js` las compara.
- **Nota de comodidad (regla 11):** probado solo en Node (lógica y montaje con DOM y lámina de mentira; que el texto cabe en el lienzo de VR, con una medida aproximada). **Chrome, iPhone y Quest: NO PROBADO** (tamaños de botón, foco, legibilidad de la lámina con el casco, que el toque con el rayo en la franja inferior la cierre).
