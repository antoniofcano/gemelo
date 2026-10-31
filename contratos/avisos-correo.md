# Correo de los avisos y `.ics` de la Agenda (OF11c)

Contrato entre la api, la base y el cartero. Código: `apps/api/src/avisos/correo.ts` (repartidor, mensaje, baja), `apps/api/src/agenda/ics.ts` (invitación),
`apps/api/src/auth/correo.ts` (el cartero, el mismo del enlace mágico: nodemailer; en local, Mailpit). Migración `0016_correo_avisos.sql`.

## Qué sale por correo

Cada fila de `avisos_hogar` (la campana del gemelo) de un hogar activo con `hogares.avisos_correo` y `correo_enviado_en` NULL. Salen: los avisos de la oficina
(`/api/admin/eventos/:id/avisar`, la bandeja), los del sistema de la Agenda (promoción desde la espera, cambio de fecha o lugar, cancelación) y la
confirmación de inscripción (solo si el hogar quedó **apuntado** y pidió los avisos). Los hogares sin `avisos_correo` solo los ven en la campana.

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
