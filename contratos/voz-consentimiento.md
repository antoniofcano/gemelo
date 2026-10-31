# Contrato: consentimiento de voz y plazo de la auditoría de voz (F3j)

Rutas: [api.openapi.yaml](api.openapi.yaml) (`GET`, `PUT` y `DELETE /api/presencia/voz/consentimiento`; esquema `VozConsentimiento`). Tabla y función: `apps/api/migraciones/0018_voz_consentimiento.sql`. Código: `apps/api/src/presencia/consentimiento_voz.ts` (versión vigente, estado, plazo), `apps/api/src/presencia/voz.ts` (`Palabra`: la comprobación que manda) y `apps/web/motor/47_habla.js` (el aviso y la retirada). Decisiones: ADR-0026, 163 (base jurídica: consentimiento para las familias) y 164 (plazo). Texto legal: **BORRADOR pendiente de la asesoría** ([EIPD-VOZ](../doc/sistema/EIPD-VOZ.md) §3).

## Qué se guarda

Una fila por hogar en `voz_consentimientos`: `hogar_id`, `version` (la del texto del aviso que aceptó) y `aceptado_en`. **Nada de la voz**: ni audio, ni texto, ni IP. Al borrar el hogar se borra la fila (`ON DELETE CASCADE`); sale en «Mis datos» (`voz_consentimiento`). Aceptar y retirar quedan en la auditoría (`voz.consentimiento_dado` y `voz.consentimiento_retirado`, con la versión; sin más datos).

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
- **Qué se borra:** las acciones `guiada.*` (manos, palabra dada/alargada/quitada, silenciar, expulsar, cerrar), `voz.consentimiento_retirado` y los `voz.consentimiento_dado` de quien ya no tiene consentimiento vigente (mientras lo tenga, es su prueba). El resto de la auditoría no se toca.
- **Cómo:** `gemelo_api` solo puede leer y añadir en `auditoria` (migración 0001). Se borra con la función de la base `purga_auditoria_voz(corte)` (`SECURITY DEFINER`, solo esas acciones, `EXECUTE` solo para `gemelo_api`), que llama `purgaAuditoriaVoz` desde el mismo reloj de 6 horas de `principal.ts` que las demás purgas. El corte lo calcula `corteAuditoriaVoz` (UTC).
- La decisión 100 (avisos, inscripciones y lotes: la campaña y un año más) **no tenía todavía su borrado en el código** cuando se escribió esto: este es el primer borrado por campaña. `corteAuditoriaVoz` es reutilizable para ella.
