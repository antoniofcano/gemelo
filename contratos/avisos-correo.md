# Correo de los avisos y `.ics` de la Agenda (OF11c)

Contrato entre la api, la base y el cartero. Código: `apps/api/src/avisos/correo.ts` (repartidor, mensaje, baja), `apps/api/src/agenda/ics.ts` (invitación),
`apps/api/src/auth/correo.ts` (el cartero, el mismo del enlace mágico: nodemailer; en local, Mailpit). Migraciones `0016_correo_avisos.sql` y `0020_avisos_de_evento_en_el_mundo.sql`.

## Qué sale por correo

Cada fila de `avisos_hogar` (la campana del gemelo) de un hogar activo con `hogares.avisos_correo` y `correo_enviado_en` NULL. Salen: los avisos de la oficina
(`/api/admin/eventos/:id/avisar`, la bandeja), los del sistema de la Agenda (promoción desde la espera, cambio de fecha o lugar, cancelación) y la
confirmación de inscripción (solo si el hogar quedó **apuntado** y pidió los avisos). Los hogares sin `avisos_correo` solo los ven en la campana.

## Avisos de seguridad de las llaves de acceso (OF13b-4, decisión 187)

Dos correos que **no son avisos de la campana** y por eso no pasan por el repartidor ni dependen de `hogares.avisos_correo` (ni del `GEMELO_CORREO_AVISOS`): son
seguridad de la cuenta. Salen por el mismo cartero que el enlace mágico (`apps/api/src/auth/correo.ts`: `mensajeDeLlaveAnadida`, `mensajeDeLlaveQuitada`), al
**correo de la propia cuenta** y solo cuando la ruta cambia algo (nunca en cada entrada: decisión 187).

| Cuándo | Asunto | Cuerpo |
|---|---|---|
| `POST /api/yo/llaves` guarda una llave (`avisar` de `registraLlave`) | Se ha añadido una llave de acceso a tu cuenta | cuál («Windows · Chrome» o el nombre que le dio la persona, en una línea), cuándo (hora de Madrid), «Si has sido tú, no tienes que hacer nada» y, si no, cómo quitarla (entrar con un enlace, Configuración → Mis dispositivos) o avisar a la oficina |
| `DELETE /api/yo/llaves/{id}` quita una llave | Se ha quitado una llave de acceso de tu cuenta | cuál y cuándo; que esa llave ya no sirve y se cerraron sus sesiones; **«No te quedas fuera: el enlace que te mandamos a este correo sigue funcionando»**; si no has sido tú, pedir un enlace, revisar las llaves que quedan y avisar a la oficina |

Texto llano (sin HTML, sin `.ics`, sin cabeceras de baja). **Sin enlaces** (nada que suplantar: se dice qué pantalla abrir), **sin el correo en el cuerpo** (solo en el
destino), sin IP ni modelo del aparato ni el id de credencial; el nombre de la llave va saneado (sin saltos de línea ni caracteres de control, 40 caracteres).
**El correo nunca tumba la ruta:** se manda en segundo plano; si falla, se registra `correo_llave_anadida_fallido` / `correo_llave_quitada_fallido` con el hogar
y el nombre del error (nunca la dirección ni su texto) y la llave queda como está. **No hay reintento** (a diferencia de los avisos): el aviso de seguridad que no sale
no se reenvía más tarde, porque una alerta tardía confunde; la auditoría (`llave.alta`, `llave.quitada`) es el rastro. Avisan también las rutas de la oficina de OF13: el alta
(`POST /api/oficina/llaves/alta`), la revocación propia (`POST /api/oficina/llaves/{id}/revocar`) y la de un `admin` a otra cuenta
(`POST /api/admin/llaves/{id}/revocar`, al correo de la cuenta afectada).

**Cuando quita la oficina (OF13b-6, `mensajeDeLlavesQuitadasPorLaOficina`):** un tercer texto, el mismo para una o varias llaves, que sale en `DELETE /api/admin/hogares/{id}/llaves/{llaveId}`
(una), `DELETE /api/admin/hogares/{id}/llaves` (todas, **un solo correo** con hasta cinco nombres y «y N más») y `POST /api/admin/hogares/{id}/rehabilitar-llave` con
`revocar_llaves` (el hueco que dejó OF13b-4: revocaba varias llaves de golpe sin avisar a la cuenta; ahora avisa si revocó alguna). Asunto «La oficina ha quitado una llave de
acceso de tu cuenta» (o «…llaves de acceso…»). Dice **«la oficina»**, nunca el nombre ni el correo de quien actúa, ni el motivo que escribió; cuáles y cuándo; que ya no sirven y se cerraron
sus sesiones; **que el enlace del correo sigue funcionando** y que se puede crear una llave nueva en Configuración, Mis dispositivos; y, si no lo pidió, qué hacer. Sin enlaces ni HTML.
Aquí **se espera al envío** (a diferencia de los avisos de la propia persona): quien actúa es de la oficina y la respuesta le dice `aviso_enviado`; un fallo del correo (la búsqueda, el SMTP)
**no tumba la operación**, se registra `correo_llaves_quitadas_oficina_fallido` (hogar y nombre del error, nunca la dirección) y queda `admin.llave_aviso_fallido` en la auditoría. Tampoco hay reintento.

**Cuando la propia persona sale de todos y quita las llaves (OF13b-8b, `mensajeDeSalidaTotal`):** un cuarto texto, **un solo correo**, que sale en `POST /api/yo/llaves/quitar-todas`. Asunto
«Se han cerrado tus sesiones y quitado tus llaves de acceso». Dice cuándo, que se cerraron las sesiones de todos los aparatos, cuáles llaves se quitaron (hasta cinco nombres y «y N más»; si no había
ninguna, que no tenía), **que el enlace del correo sigue funcionando** y que se puede crear una llave nueva en Configuración, Mis dispositivos, y, si no fue ella, qué hacer. Sin enlaces, sin
HTML y sin el correo en el cuerpo. No depende de `avisos_correo`. Va en segundo plano como los de la propia persona: un fallo se registra `correo_salida_total_fallido` (hogar y nombre del error,
nunca la dirección) y no deshace la salida; no hay reintento.

## El aviso también se ve en el mundo (OF11g)

El correo es una vía; la otra es el propio gemelo. El aviso **se guarda siempre**, aunque el hogar tenga `avisos_correo` en «no», y queda **ligado a su evento**
(`avisos.evento_id`; los de «Avisar…» de la oficina lo llevan desde la 0020, que además rescata los anteriores con la auditoría `admin.evento_avisado`; `ics` queda
NULL: ese aviso no lleva invitación). La lectura por hogar es `avisos_hogar.leido_en`.

- `GET /api/avisos` (sesión): los avisos de eventos **entregados a este hogar** (el hogar sale de la sesión), más nuevos primero, máx. 50:
  `{ avisos: [{ id, evento_id, evento (título), titulo, texto, fecha, leido }], sin_leer }`. Texto llano; el cliente lo pinta con `textContent`.
- `POST /api/avisos/:id/leido` (sesión, con Origin, cuerpo vacío o `{}`): marca como leído solo lo suyo; idempotente (204); 404 si no es de ese hogar o no existe;
  auditoría `avisos.leido` la primera vez. No manda correo.
- `GET /api/admin/eventos/:id/avisos` (oficina): historial del evento con agregados (`destinatarios`, `leidos`, `correos_enviados`); nunca qué familia lo leyó.
- Código: `apps/api/src/avisos/rutas.ts`, `apps/api/src/agenda/rutas.ts` (`avisaA`). Mundo: componente `agenda` (`apps/web/motor/43_agenda.js`).

## Cómo sale

- **En segundo plano.** Ninguna petición espera al SMTP: tras una petición que no sea GET y salga bien (hook `onResponse`) se despierta al repartidor, que
  agrupa las ráfagas (1,5 s) y manda lo pendiente; además mira cada `GEMELO_CORREO_AVISOS_CADA_SEG` s (60; 0 = solo cuando se le despierta).
- **Reintento acotado.** Cada intento se anota **antes** de mandar (`correo_intentos`, `correo_ultimo_intento`); la espera crece 1, 3, 9, 27 min…; al llegar a
  `GEMELO_CORREO_REINTENTOS` (5) se desiste (`correo_desistido_en`) y el aviso queda solo en la campana. Un aviso de más de 3 días no se manda. Al mandarse
  bien, `correo_enviado_en = now()`.
- **Auditoría.** Un asiento `correo.avisos` por pasada: `{ enviados, fallidos, desistidos }`. Nunca la dirección ni el contenido. El registro de un fallo
  lleva el id del aviso y del hogar y el código del error, no su texto (puede traer la dirección).
- **En modo buzón (`GEMELO_CORREO=buzon`, solo fuera de producción) no hay repartidor**: nada se manda ni se marca como enviado.
- `GEMELO_CORREO_AVISOS=no` apaga el correo de los avisos sin tocar el del enlace mágico.

## Contenido

Asunto = título del aviso. Cuerpo = título, texto y enlace al gemelo (los del aviso: lo que ya ve el hogar en la campana), más el pie con la forma de dejar de
recibirlos. Texto llano y HTML sencillo, sin imágenes remotas ni seguimiento. **Nunca datos de otras familias**: el mensaje solo se construye con el aviso y el
correo del propio destinatario.

## El interruptor (OF11f)

`hogares.avisos_correo` ya no se elige solo en el primer acceso: `GET /api/yo/avisos` → `{ avisos_correo: boolean }` y `PUT /api/yo/avisos { avisos_correo: boolean }`
(cuerpo estricto; responde `200` con el valor guardado). Piden sesión (la de cualquier hogar, también la de un aparato vinculado); el hogar sale de la sesión, no
de la petición, así que nadie cambia el de otro. Auditoría `hogar.avisos_correo { avisos_correo }` (sin el correo). El gemelo lo enseña como casilla «Avisarme por
correo de los eventos» en Configuración y la oficina lo ve, de solo lectura, en la ficha de la familia (`GET /api/admin/hogares`).

## Baja con un clic

Enlace firmado `…/api/avisos/baja?t=<hogar>.<hmac>` (HMAC-SHA256 del id con el secreto de sesión, 32 caracteres base64url; no caduca y solo sirve para esto) y
cabeceras `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). `GET` enseña el botón y no hace nada; `POST` pone `avisos_correo =
false` (idempotente, auditoría `avisos.baja_correo`). La ruta no exige Origin (el cliente de correo no lo manda): la protege la firma.

## `.ics`

- Librería `ical-generator` 11.1.2 y `@touch4it/ical-timezones` 1.9.0 (el `VTIMEZONE` de Europe/Madrid). Horas con `TZID=Europe/Madrid`, nunca flotantes.
- `UID` = `evento-<id>@<dominio de GEMELO_URL_PUBLICA>`; `SEQUENCE` = segundos de `visitas.actualizada_en` (sube con cada edición: el calendario actualiza, no duplica).
- `GET /api/agenda/:id/evento.ics` (cualquier sesión): `METHOD:PUBLISH` de un evento abierto o cerrado; 404 si es borrador, cancelado o no existe.
- Correo de inscripción (y de promoción desde la espera) y de cambio de fecha o lugar: ese mismo `.ics` (`PUBLISH`) como parte `text/calendar` y adjunto. Correo de
  cancelación: `METHOD:CANCEL`, `STATUS:CANCELLED`, con `ORGANIZER` (el remitente) y `ATTENDEE` (el destinatario). El `.ics` se genera al **enviar**, con el
  estado del evento de ese momento; si el evento ya no cuadra con el tipo del aviso (p. ej. se canceló después del aviso de cambio), el correo sale sin él.
- Descripción: la del evento (la escribe la oficina para todos) más el enlace al gemelo. Nunca nombres ni correos de familias.

## Variables (todas `GEMELO_*`, declaradas en `contratos/publicacion-vps.json` e `infra/entorno.ejemplo`)

`GEMELO_CORREO_AVISOS` (si/no, si), `GEMELO_CORREO_REINTENTOS` (1-10, 5), `GEMELO_CORREO_AVISOS_CADA_SEG` (0-3600, 60). El proveedor y la cuenta siguen siendo los
de `GEMELO_CORREO`, `GEMELO_SMTP_*` y `GEMELO_CORREO_REMITENTE` (decisión de Antonio pendiente; **no verificado** contra el buzón real de OVH).
