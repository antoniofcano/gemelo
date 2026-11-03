# EIPD — tratamiento «llaves de acceso» (OF13b-11)

> **BORRADOR sin valor legal. No sustituye al criterio de la asesoría** ni de quien lleve lo legal en la explotación. Lo escribe un agente a partir de lo que hace el código; no es asesoramiento jurídico. Lo que no está en el repo ni se ha podido comprobar va marcado **[SUPUESTO]**, **[PROPUESTA]** (lo valida la asesoría) o **[NO VERIFICADO]**. Las referencias a normativa están citadas de memoria, sin contrastar con el texto vigente: quien valide las comprueba (RGPD, LOPDGDD y guías de la AEPD).

- **Estado:** borrador (2026-11-02), tarea OF13b-11. Sigue la estructura de [EIPD-VOZ](EIPD-VOZ.md) y [EIPD-CAMPO](EIPD-CAMPO.md); el documento final debe ser **una sola EIPD** (decisiones 41, 102 y 165). Es un tratamiento **pequeño y de seguridad**: puede que la asesoría lo considere un anexo del registro de tratamientos de la cuenta y no una EIPD propia **[SUPUESTO]**.
- **Base técnica:** [ADR-0029](../adr/0029-llaves-de-acceso-para-todos.md) (Aceptado) y el diseño [LLAVES-DE-ACCESO](LLAVES-DE-ACCESO.md); contrato [sesion.md](../../contratos/sesion.md) y [avisos-correo.md](../../contratos/avisos-correo.md).
- **Estado del código:** implementado en Node (OF13b-1 a 8); **no probado** contra PostGIS ni en navegadores ni con aparatos reales (ver [«Estado de implementación»](LLAVES-DE-ACCESO.md#estado-de-implementación)). Nada de esto trata aún datos de personas reales: no hay familias reales dadas de alta con llave.

## 1. El tratamiento

**Llaves de acceso (passkeys, WebAuthn) como forma de entrar a la cuenta**, para todos los tipos de cuenta (familia, guía, corresponsal, oficina, admin). Una persona crea una llave en su aparato (o en su gestor: Windows Hello, iCloud, Google…) y con ella entra con la huella, la cara o el PIN del aparato, sin esperar un correo. El enlace por correo sigue siendo la forma de dar de alta la cuenta y de recuperarla.

Lo que hace el servidor: guardar la **parte pública** de la llave y unos pocos datos de gestión, comprobar una firma al entrar, mandar un **correo de aviso** al añadir o quitar una llave y dejar **auditoría** de esas acciones. El servidor **no** recibe ni guarda la clave privada, ni la huella, ni la cara, ni el PIN: eso no sale del aparato de la persona.

## 2. Finalidad

Autenticar a la persona titular de la cuenta de forma cómoda y más segura que el enlace del correo solo (la llave está atada al sitio y no se puede dar a una web falsa). Se añade el aviso por correo y la lista de llaves para que la persona vea y revoque lo que haya en su cuenta. **Finalidades excluidas:** identificar a personas fuera del acceso, seguir su uso, perfilar, ni cruzar con ningún otro dato. No se usa para controlar a nadie.

## 3. Base jurídica — [PROPUESTA], la valida la asesoría

| Para | Base propuesta | Razón |
|---|---|---|
| Familias (hogares inscritos) | **Ejecución del servicio** que la persona ha pedido (RGPD art. 6.1.b) **[PROPUESTA]**, con el **interés legítimo en la seguridad** de la cuenta (6.1.f) como apoyo para el aviso por correo y la auditoría **[PROPUESTA]** | la llave es una forma de acceder al servicio; crear una es voluntaria (siempre queda el enlace) |
| Oficina y admin (personas de la explotación) | **Interés legítimo en la seguridad** de un sistema con poderes de administración (6.1.f) **[PROPUESTA]**; la llave es obligatoria para ellas (OF13), así que no se apoya en el consentimiento | desequilibrio laboral: el consentimiento no sería libre **[SUPUESTO: criterio habitual de las autoridades]** |
| Datos biométricos | **No hay tratamiento biométrico en el servidor.** La verificación (huella, cara, PIN) la hace el aparato y el servidor solo recibe que «la persona se verificó» (indicador UV) | si la asesoría opinara otra cosa, sería otro análisis (art. 9) **[NO VERIFICADO]** |

## 4. Qué se guarda y qué no

| Dato | ¿Se guarda? | Dónde y nota |
|---|---|---|
| Clave **pública** de la llave y su identificador | **Sí** | tabla `llaves_acceso`; es material criptográfico sin valor por sí solo; **no** se exporta a la persona (no es un dato suyo legible) ni se registra |
| **Contador** de firmas | Sí | detecta clones; no se exporta |
| **Nombre** de la llave | Sí | lo pone la persona («Windows Hello de este ordenador») o se propone («Windows · Edge», `nombreDeAparato`); hasta 40 caracteres; puede contener lo que ella escriba |
| Fechas: creada, último uso, revocada (y por quién, id interno de la cuenta) | Sí | |
| Si está **sincronizada** (`respaldada`) y si es **descubrible** (`descubrible`) | Sí | banderas que dice el aparato; la segunda es un dato del cliente, sin firmar |
| «Transports» (usb, nfc, internal…) | Sí | cómo se conectó el aparato |
| Aparato de oficina asociado (`aparato_id`) | Solo en oficina | el aparato confiable que ya existe (ADR-0024) |
| `llave_usuario` (32 bytes al azar por cuenta, el `user handle`) | Sí | en `hogares`; no es el id ni el correo |
| Reto de la ceremonia | **Unos minutos** | `llaves_retos`, de un solo uso, 5 min, se borra al usarlo y la purga borra los caducados; sin sesión, solo el **SHA-256** de la cookie `__Host-gemelo-reto` |
| Biometría, clave privada, PIN | **Nunca llegan al servidor** | |
| Modelo del aparato, AAGUID, marca del autenticador | **No** | `attestation: none` a propósito |
| Dirección IP | **No en esta tabla** | los límites de uso por IP viven en memoria del proceso y se pierden al reiniciar; los registros del servidor de la api no llevan la respuesta de WebAuthn, la clave, el id de credencial, el reto ni la cookie |
| Auditoría | Sí | `llave.alta`, `llave.quitada`, `llave.acceso`, `llave.acceso_fallido` (con `motivo`), `admin.llave_quitada`, `admin.llave_aviso_fallido`, `oficina.llave_*`: quién (cuenta), cuándo y el id **interno** de la llave; nunca el id de credencial ni el correo |
| Correo de aviso | El servidor lo manda; **no guarda su texto** | ver §8; si falla queda un registro sin dirección |
| Preferencia del navegador | En el navegador de la persona | `localStorage` `gemelo.llave.oferta` («ahora no», «no es mío», «hecha»): comodidad, no un secreto, no sale del aparato |

**En el aparato o gestor de la persona** (fuera del control del servidor): la clave privada, el `user handle` y el **nombre de cuenta que se enseña al elegir la llave: el correo** (decisión 185). En un aparato compartido, quien lo use puede ver ese correo al elegir llave **[riesgo R6]**.

## 5. Interesados

| Quién | Cómo le afecta |
|---|---|
| Titular de una cuenta de **familia** (persona adulta) | crea, usa y quita llaves; recibe avisos por correo |
| Personas de la **oficina y admin** | llave obligatoria; otros admin pueden verla, revocarla o rehabilitar el alta (con auditoría) |
| **Menores** | no tienen cuenta (el titular es el adulto, decisión 96); la llave no guarda nada del menor que use el aparato del adulto **[riesgo R7]** |
| Corresponsal, guía | como las familias en cuanto a la llave (`guia` y `corresponsal` siguen las reglas de familia: **[SUPUESTO: por confirmar]**) |

## 6. Destinatarios y encargados

- **Responsable:** quien lleve la explotación (Cano & Damas Oleicultores) **[SUPUESTO: a confirmar por Antonio / asesoría]**.
- **Encargados:** el alojamiento del VPS (OVH, ADR-0011, el contrato de encargo y la región son pendientes de [EIPD-VOZ §6](EIPD-VOZ.md)) y el **servicio de correo** por el que sale el aviso (SMTP del dominio, ADR-0013, **sin verificar** su entrega ni DKIM/DMARC). El tratamiento **no usa ningún tercero nuevo** (sin proveedor de identidad, sin SDK externo).
- **Terceros que ve la persona sin que el servidor intervenga:** el proveedor de su gestor de llaves (Google, Apple, Microsoft, 1Password…) si la llave está sincronizada. Es una relación de la persona con ese proveedor, no del gemelo. Se le dice en la oferta («guardada también en tu cuenta del aparato»).
- Sin transferencias internacionales por parte del gemelo **[NO VERIFICADO: depende de la región del VPS]**.

## 7. Conservación

- **Llave viva:** mientras la persona no la quite o la cuenta no se borre.
- **Llave revocada:** el código **la conserva** (`revocada_en`, `revocada_por`) **hasta el borrado de la cuenta**, para la auditoría; **no hay plazo propio ni purga de revocadas** hoy (se comprobó en el código: solo se purgan los retos caducados). **[PROPUESTA]** fijar un plazo (por ejemplo, N meses tras revocar, o borrar la clave pública al revocar y dejar solo el rastro en la auditoría) y programar la purga; lo decide Antonio con la asesoría.
- **Borrado de la cuenta:** la baja deja la cuenta inactiva y a los **30 días** (`DIAS_DE_BAJA`) se borra; las llaves se borran **en cascada** (`ON DELETE CASCADE` desde `hogares`). Las sesiones abiertas con una llave quedan con `llave_id` nulo (`ON DELETE SET NULL`). **No probado contra la base real.**
- **Auditoría:** el plazo general de la tabla `auditoria` (hoy sin plazo propio para las filas de llaves). **[PROPUESTA]** alinearlo con el de voz (la campaña y un año más) si la asesoría lo ve proporcionado.
- **Retos:** 5 minutos; se borran al usarse y por purga.
- **Correo de aviso:** el gemelo no lo archiva; lo que quede en el buzón de la persona es suyo.

## 8. Riesgos y mitigaciones

| # | Riesgo | Mitigación en el código | Lo que queda |
|---|---|---|---|
| R1 | **El enlace del correo es la recuperación**: quien controla el buzón de una familia puede añadir su propia llave | aviso por correo al añadir y al quitar (decisión 187), lista de llaves visible y revocable, auditoría con el nombre y el momento | **no se supera el techo del buzón** en cuentas de familia (se dice así). Para la oficina, el enlace solo **no** añade llave a una cuenta que ya tuvo una |
| R2 | **Aviso por correo que no llega** (SMTP sin verificar) | el cambio se hace igual y queda en la auditoría; la oficina ve en su ficha si el aviso salió | un aviso que no sale no se reintenta (una alerta tardía confunde): la persona puede no enterarse |
| R3 | **Fuerza bruta y abuso** de las rutas | límites por IP (opciones 30 y entradas 20 cada 15 min), por cuenta e IP en las rutas de llaves (20 cada 15 min), máximo 10 llaves vivas por cuenta, retos de un uso | los límites son **por proceso** y se pierden al reiniciar |
| R4 | **Enumeración de cuentas** | la entrada con llave no pide correo; pedir un enlace responde lo mismo exista o no la cuenta (mismo 202, mismo 429); un único error para cualquier fallo de la llave; credencial desconocida verificada contra una clave de señuelo | diferencia de tiempo interna mínima, **sin medir en tiempo real** |
| R5 | **Llave sincronizada clonada o cuenta de Google/Apple robada** | UV obligatorio; contador; revocar cierra las sesiones de esa llave; en oficina, aparato confiable aparte | una llave sincronizada vale lo que vale esa cuenta del proveedor |
| R6 | **Aparato compartido** (el PC de casa): quien lo usa entra con la cuenta y ve el correo al elegir llave | la oferta lo dice («Cualquiera que pueda desbloquear este aparato podrá entrar con tu cuenta»); «Este aparato no es mío» no vuelve a preguntar; «Mis llaves» permite quitarla | en un aparato ajeno alguien puede crear una llave sin pensarlo; se ve en la lista |
| R7 | **Menores** con el aparato de un adulto | ninguna técnica: es el mismo caso que una sesión de 30 días abierta; el titular es el adulto | se dice en el texto de la oferta |
| R8 | **Aparato perdido o robado** | UV; la persona (u otro aparato) quita la llave; la **oficina quita las llaves desde la ficha** (con confirmación reciente, aviso y auditoría); «Salir de todos» | desbloqueado y robado: entra hasta que se quite la llave |
| R9 | **Datos de la persona en el nombre de la llave** (texto libre) | 40 caracteres, saneado en el correo; no se muestra a otras familias; sí lo ve la oficina en la ficha | la persona puede escribir un dato personal; se aconseja un nombre neutro |
| R10 | **Cambio de dominio**: todas las llaves dejan de valer | RP ID = el host exacto; paso en el RUNBOOK (rehabilitar el alta antes del cambio) | coste operativo, no de privacidad |
| R11 | **Oficina y datos de otras personas**: un admin ve las llaves (nombre, fechas) de todas las cuentas | la ficha solo las enseña a la oficina con guarda de rol; auditoría de las bajas | acceso interno legítimo, [PROPUESTA] mencionarlo en la información a la plantilla |

## 9. Derechos y cómo se ejercen

- **Acceso y portabilidad:** `GET /api/yo/datos` y la exportación de la oficina incluyen `llaves_de_acceso` (nombre, fechas, sincronizada, descubrible; **sin** id de credencial, clave pública ni contador).
- **Rectificación:** el nombre de la llave se cambia quitándola y creando otra (no hay edición hoy).
- **Supresión:** la persona quita sus llaves en «Mis llaves» (revoca; ver §7 sobre lo que se conserva), la oficina las quita desde la ficha, y el borrado de la cuenta las borra en cascada. **Hoy «quitar» no borra la fila**: la marca revocada. **[PROPUESTA]** que el derecho de supresión pueda pedirse sobre las revocadas (borrado físico) por el canal que defina la asesoría.
- **Oposición / limitación:** crear una llave es voluntario en las familias (el enlace sigue valiendo). En oficina es obligatoria: si alguien no puede usar llaves, la alternativa (TOTP) está estudiada y no implementada.
- **Canal y plazos:** los del resto de la plataforma (responsable y canal pendientes, [EIPD-VOZ §10](EIPD-VOZ.md)).

## 10. ¿Hace falta EIPD? (nota)

Es una autenticación con datos mínimos y sin biometría en el servidor, para un número pequeño de cuentas. Que sea **obligatoria** (art. 35, listas de la AEPD) **[SUPUESTO: no verificado]**, lo valora la asesoría. Se redacta igualmente para que quien valide tenga todo en un sitio y para integrarlo en la EIPD única.

## 11. Lo que queda abierto para Antonio y la asesoría

1. **Base jurídica** (§3): ¿ejecución del servicio + interés legítimo en la seguridad? ¿Y para oficina?
2. **Plazo de las llaves revocadas y de la auditoría** (§7): hoy, hasta el borrado de la cuenta; ¿se acorta o se borra la clave pública al revocar?
3. **Supresión de lo revocado** (§9): ¿borrado físico a petición?
4. **Entrega del correo de aviso** (R2): el SMTP y DKIM/DMARC están sin verificar; sin eso, el aviso es una promesa que puede no cumplirse.
5. **Responsable, encargados y región del VPS** (§6), y si hay delegado de protección de datos.
6. **Información a la plantilla** sobre lo que ve la oficina (R11) y a las familias (texto de la oferta y de la privacidad).
7. **Ver cómo se muestra el correo al elegir llave** en aparatos compartidos (decisión 185, pregunta P3): ¿alias en su lugar?
8. **Validación legal** de todo lo marcado. Hasta entonces: **solo cuentas de prueba** (decisión 41).

## Cuándo se rehace

Si se guarda algún dato del autenticador (modelo, AAGUID) o se activa `attestation`; se añade un proveedor de identidad externo o un tercero; se pide biometría al servidor; se activa «solo con llave» sin enlace de recuperación; cambia el alojamiento; o se añaden menores como titulares.
