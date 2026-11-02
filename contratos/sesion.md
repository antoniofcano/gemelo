# Contrato: enlace mágico, código corto y sesión (F1a)

Decisión y alternativas: [ADR-0013](../doc/adr/0013-enlace-magico-y-sesiones.md). Rutas: [api.openapi.yaml](api.openapi.yaml). Código: `apps/api/src/auth/`. Lo comprueban `apps/api/pruebas/integracion/api.test.ts` (contra PostGIS en contenedor) y `apps/api/pruebas/unidad/`.

## Enlace

| Qué | Valor |
|---|---|
| Token | 256 bits al azar, base64url (43 caracteres) |
| Se guarda | solo su SHA-256 (`tokens_acceso.hash`); en claro existe únicamente en el correo |
| Caduca | 15 minutos |
| Usos | uno; el canje es atómico (`UPDATE … WHERE usado_en IS NULL RETURNING`): dos canjes a la vez → entra uno |
| Pedirlo | `POST /api/auth/enlace {correo}` → **202 con el mismo texto** («Si ese correo tiene cuenta, te llegará un enlace…») exista o no la cuenta: misma forma y mismo estado (no se puede sondear quién tiene acceso). Para que el tiempo tampoco lo diga, las dos ramas hacen **lo mismo antes del 202**: un token al azar y **una sola sentencia** (`creaEnlace`: buscar la cuenta, guardar el hash y auditar en un CTE; sin cuenta no inserta nada), y el correo sale sin esperar al SMTP. Antes eran 1 consulta sin cuenta y 3 con ella (OF13b-1; contado con la base de mentira de `pruebas/unidad/enlace.test.ts`, OF13b-5). Queda la diferencia de dentro de la base (dos filas y el volcado del WAL al confirmar), **sin medir en tiempo real**; la acotan los límites (5 por correo y 10 por IP en 15 min) |
| Límites | por IP (por defecto 10) y por correo (5) en 15 min (`GEMELO_ENLACE_POR_IP`, `GEMELO_ENLACE_POR_CORREO`); el 429 lleva la misma forma y el mismo texto para cualquier correo, exista o no |
| Abrirlo | `GET /api/auth/entrar?t=…` muestra una página con un botón; **no gasta** el enlace (un escáner de correo que lo abra no lo consume) |
| Gastarlo | `POST /api/auth/entrar` (formulario o JSON) |
| Correo | solo texto, sin imágenes ni seguimiento; las cuentas las da la oficina (no hay alta abierta) |

## Código corto (vincular unas gafas)

Decisiones 46 y 61; UX.md §4.4. Para las Meta Quest, donde teclear un correo y abrirlo es incómodo. Es el patrón de autorización de dispositivo (RFC 8628) recortado. Código: `apps/api/src/auth/vinculo.ts`; tabla `codigos_vinculo` (migración `0002`).

| Qué | Valor |
|---|---|
| Código | 6 símbolos de `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31, sin 0/O ni 1/I/L), al azar con `crypto.randomInt`; se enseña `K7Q-4M2`; al teclearlo vale en minúsculas, con o sin guion o espacio |
| Caduca | 5 minutos; un solo uso |
| Se guarda | el código como **HMAC-SHA256 con `GEMELO_SESION_SECRETO`** (con ≈ 30 bits, un SHA-256 a secas se sacaría por fuerza bruta de una copia de la base) y el secreto de sondeo (256 bits) como SHA-256; nada en claro |
| 1. Pedirlo (gafas, sin sesión) | `POST /api/auth/vincula {}` → 201 `{codigo, sondeo, expira_en, cada_s: 3}`; el `sondeo` solo lo tienen esas gafas (en memoria de la página) |
| 2. Aprobarlo (aparato con sesión) | `POST /api/yo/dispositivos/vincular {codigo, aprobar}` → 204; **404 con el mismo texto** si no existe, caducó o ya se decidió (no enumerable); `aprobar: false` lo rechaza; **unas gafas ya vinculadas (`origen = 'vinculo'`) no aprueban el código de otras: 403 `solo_titular`** (así las 12 h de las gafas de la oficina no se renuevan encadenando). También una cuenta de **oficina o admin** (con su sesión de oficina válida: aparato aprobado, enlace y llave), pero sus gafas entran como **visitante** ([ADR-0028](../doc/adr/0028-gafas-vinculadas-desde-la-oficina-entran-como-visitante.md), ver abajo) |
| 3. Sondear (gafas) | `POST /api/auth/vincula/sondeo {sondeo}` cada 3 s → `esperando` / `rechazado` / `caducado` (también un secreto inventado) / `aprobado`; al verlo aprobado se **gasta de forma atómica** (dos sondeos a la vez: entra uno) y abre una **sesión nueva para las gafas** (la misma cookie y las mismas reglas que el enlace: rotación, 30/7 días, revocable), con `primer_acceso`. Si lo aprobó una cuenta de oficina o admin, la cookie y `expira_en` son de **12 h** (`GEMELO_OFICINA_SESION_HORAS`, decisión 182) |
| Gafas de la oficina (ADR-0028, decisiones 181-182) | **la oficina vincula gafas como visitante, 12 h**: la sesión (`origen = 'vinculo'` de una cuenta `oficina` o `admin`) tiene rol efectivo **`hogar`** (lo calcula `rolEfectivo()` en `apps/api/src/auth/almacen.ts`): `GET /api/sesion` da `rol: "hogar"` y `titular: false`; ninguna guarda de oficina la deja pasar (`/api/admin/*`, `/api/oficina/*` y `/oficina/`: 403); el token de LiveKit lleva `rol: "hogar"` y su alias (sin «Oficina» ni chaleco) y, si la cuenta es la guía de una visita guiada, las gafas **no** heredan el papel de guía ni moderan (`puedeGuiar`, `apps/api/src/presencia/voz.ts`). No necesita aparato de oficina ni llave. Vive **12 h desde que nace** (manda `creada_en`) y caduca tras **la inactividad más corta** de las dos (hoy 2 h, `GEMELO_OFICINA_INACTIVIDAD_MIN`). Revocar las sesiones del hogar, salir de todas o cerrar esa sesión desde la ficha (sale como «Gafas (código corto)») la cierran. Lo comprueban `apps/api/pruebas/unidad/vinculo_oficina.test.ts` y `apps/api/pruebas/integracion/vinculo_oficina.test.ts` (PostGIS, por el banco) |
| Límites | códigos por IP (10 / 15 min), intentos de aprobar por hogar (5 / 15 min) y por IP (10 / 15 min), sondeos por IP (60 / min); el 429 dice «Demasiados intentos seguidos…»; configurables (`GEMELO_VINCULO_*`, `infra/entorno.ejemplo`) |
| Auditoría | `vinculo.pedido` (sin hogar), `vinculo.aprobado`, `vinculo.rechazado`, `vinculo.fallido` (intento con un código que no sirve, con el hogar que lo tecleó), `vinculo.usado`; nunca el código. Si decide una cuenta de oficina, el detalle lleva `{"como": "visitante"}` (ADR-0028) |
| CSRF | los tres son POST con `Origin` del sitio, como el resto |
| Riesgo que queda | **suplantación por engaño**: si alguien convence a un hogar de teclear un código que no ve en sus propias gafas, ese alguien entra con la cuenta del hogar. La pantalla de aprobar lo avisa («Escribe solo el código que ves ahora en tus gafas»); el hogar puede cerrar todas sus sesiones. Un hogar desactivado no abre sesión aunque el código estuviera aprobado |
| RGPD | `GET /api/yo/datos` incluye `aparatos_vinculados` (cuándo se pidió, aprobó y usó); borrar el hogar arrastra sus códigos; `purga` quita los caducados hace más de un día |

## Entrar con llave

Sin sesión ni correo (OF13b-5; [ADR-0029](../doc/adr/0029-llaves-de-acceso-para-todos.md), [LLAVES-DE-ACCESO §3.2 y §3.4](../doc/sistema/LLAVES-DE-ACCESO.md)). Código: `apps/api/src/auth/rutas.ts` (rutas) sobre `apps/api/src/oficina/llaves.ts` (`opcionesDeAcceso`, `entraConLlave`). Lo comprueban `apps/api/pruebas/unidad/entrada_llave.test.ts` (verificación real de `@simplewebauthn/server` con un autenticador simulado y una base de mentira) y `apps/api/pruebas/integracion/entrada_llave.test.ts` (PostGIS, por el banco; **escrita, sin ejecutar**). **No probado** con ningún navegador ni autenticador real.

| Qué | Valor |
|---|---|
| 1. Opciones | `POST /api/auth/llave/opciones {}` (cuerpo vacío; sin sesión) → 200 con las opciones de `navigator.credentials.get()`: **sin `allowCredentials`** (el aparato elige la llave descubrible), `userVerification: "required"`, 5 min. **Iguales para cualquiera**: no dependen de ninguna cuenta ni piden el correo (A7) |
| Cookie del reto | `__Host-gemelo-reto`: 32 bytes al azar (base64url), `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=300`, sin `Domain`. En la base (`llaves_retos`, `tipo = 'acceso'`, sin sesión) **solo su SHA-256**; el reto vale **una vez** y 5 min. Pedir otras opciones la pisa (la ceremonia anterior de ese navegador deja de valer) |
| 2. Entrar | `POST /api/auth/llave {respuesta}` (sin sesión): gasta el reto de la cookie (siempre, también si falla), busca la credencial por su id **en todas las cuentas**, exige llave viva, cuenta activa, firma, origen, RP ID, verificación de la persona, contador y que el `userHandle` sea el de la cuenta dueña. La cookie del reto se borra pase lo que pase |
| Fallo | **el mismo `401 {error: "llave_no_valida", mensaje}`** con el mismo texto para cualquier causa (credencial desconocida o revocada, cuenta de baja, `userHandle` ajeno, firma, origen, RP ID, UV, contador, reto que falta, caducó, ya se usó o es de otro navegador, respuesta mal formada); no abre sesión ni toca la que hubiera. El motivo solo queda en la auditoría (`llave.acceso_fallido`) |
| Éxito: sesión | **rotación** (`session.regenerate()`, como el enlace: la sesión que trajera el navegador se revoca), `sesiones.origen = 'llave'`, `llave_id` = la llave usada, **titular**. 200 `{ok, destino, primer_acceso, aparato?}` (el navegador navega a `destino`) |
| Familia (`hogar`, `guia`, `corresponsal`) | como el enlace: 30 días absolutos y 7 sin actividad; `destino` `/finca/` o `/#bienvenida` si le toca el primer acceso |
| Oficina (`oficina`, `admin`) | 12 h / 2 h, como el enlace. El **aparato** (cookie `__Host-gemelo-aparato`) se reconoce o se crea como al entrar con un enlace, pero **una llave nunca lo aprueba** (decisiones 152 y 184; tampoco hace de «segundo enlace»): aprobado → `destino /oficina/`, sin enlace, y la llave (con UV) **cuenta como confirmación reciente** (`confirmada_en`); nuevo o pendiente → la sesión nace **aparato pendiente** (`destino /api/oficina/pendiente`; todo `403 aparato_pendiente`) y se aprueba como siempre: otro aparato aprobado, un segundo **enlace** desde ese aparato pasados ≥ 5 min, o la consola |
| Validez | una sesión `llave` **solo vale mientras su llave esté viva** (`apps/api/src/auth/almacen.ts`, `lee()`); quitar la llave cierra además sus sesiones (`revocaLlave`). La de oficina sigue exigiendo su aparato |
| Gafas | sin cambios: el código corto ([§ Código corto](#código-corto-vincular-unas-gafas)); a las gafas no se les ofrece llave (la interfaz, OF13b-7) |
| `GET /api/sesion` | `entrada`: `enlace`, `llave` o `codigo` (las gafas), para que la portada sepa si ofrecer crear una llave tras un enlace |
| Límites | por IP: opciones 30 y entradas 20 cada 15 min (`GEMELO_LLAVE_OPCIONES_POR_IP`, `GEMELO_LLAVE_ENTRADAS_POR_IP`, `GEMELO_LLAVE_VENTANA_MIN`); el 429 dice «Demasiados intentos seguidos…» (el texto del código corto, no el de los enlaces) |
| CSRF | los dos son POST con `Origin` del sitio (sin él, 403) y la cookie del reto es `Strict` |
| Auditoría | `llave.acceso` / `llave.acceso_fallido` (de `entraConLlave`) y `sesion.entrada_llave` (`llave`, `tipo`: familia u oficina, `aparato`: aprobado, pendiente o null); nunca la respuesta, el reto, la cookie, el id de credencial ni el correo |

## Primer acceso

`hogares.normas_version`, `normas_aceptadas_en` y `avisos_correo` (migración `0002`). Versión vigente: `NORMAS_VERSION = 1` (`apps/api/src/auth/servicio.ts`). `GET /api/sesion` dice `primer_acceso: true` mientras el hogar no haya aceptado la versión vigente (`PUT /api/yo/normas {version, avisos_correo}`; otra versión → 409). Al entrar con el enlace, el formulario va a `/#bienvenida` (primer acceso en la portada) o, si ya está, a `/finca/`. El mundo (`/finca/`) **no** exige todavía el primer acceso: lo pide la portada.

## Sesión

| Qué | Valor |
|---|---|
| Cookie | `__Host-gemelo`; `HttpOnly; Secure; SameSite=Lax; Path=/`, sin `Domain`; firmada (`GEMELO_SESION_SECRETO`) |
| Se guarda | en Postgres (`sesiones`), por el SHA-256 de su id; nunca el id en claro |
| Rotación | cada entrada (enlace, llave o código corto) crea una sesión nueva y revoca la que trajera el navegador |
| Caducidad | absoluta 30 días; por inactividad 7 días (configurables), también las abiertas con llave. Las de oficina (enlace o llave), 12 h y 2 h ([§ Oficina](#oficina)); las gafas vinculadas desde una cuenta de oficina, también 12 h y 2 h ([§ Código corto](#código-corto-vincular-unas-gafas)) |
| Revocación | inmediata en la base: salir, salir de todas, la oficina (`/api/admin/hogares/{id}/revocar`), hogar desactivado o borrado |
| CSRF | `SameSite=Lax` + comprobación de `Origin` en todo POST/PUT/DELETE (salvo `/api/csp-informe`) + sin `text/plain` |
| Roles | `hogar`, `guia`, `corresponsal`, `oficina`, `admin` (los dos últimos son de oficina: ver [§ Oficina](#oficina)) |
| Origen (titular) | cada sesión guarda de dónde nació (`sesiones.origen`, migración 0004): `enlace` (el adulto titular) o `vinculo` (un aparato vinculado con el código corto); `llave` (migración 0021; el titular con su llave, sin correo: [§ Entrar con llave](#entrar-con-llave), OF13b-5). `GET /api/sesion` lo da como `titular: true/false` (titular = no `vinculo`) y como `entrada: enlace/llave/codigo`; solo una sesión de titular cuelga contenido (decisión 96, [vida.md](vida.md)) |
| Aparato de la sesión | `sesiones.aparato_nombre` (migración 0008): nombre deducido del agente («Windows · Chrome», «Gafas (código corto)»), nunca el agente entero; solo lo lee la oficina (`GET /api/admin/hogares/{id}/sesiones`) para reconocer y cerrar sesiones |
| Estáticos | `/finca/` y `/teselas/` piden sesión al Caddy interno (`forward_auth` → `/api/interno/autoriza`, cerrada desde fuera) |

## Oficina

Decisión: [ADR-0024](../doc/adr/0024-la-oficina-roles-acceso-y-configuracion-versionada.md) (decisiones 104-106); diseño: [OFICINA.md §2](../doc/sistema/OFICINA.md#2-acceso-y-seguridad). Migración `0005`; código: `apps/api/src/oficina/` (`acceso.ts`: las guardas; `aparatos.ts`; `rutas.ts`). Lo comprueban `apps/api/pruebas/integracion/oficina.test.ts` y `apps/api/pruebas/unidad/oficina.test.ts`.

| Qué | Valor |
|---|---|
| Cuentas | rol `oficina` (día a día) o `admin` (además parámetros, roles, re-hornear); cada una con su correo, aparte de cualquier hogar. Dar de alta o borrar una cuenta de oficina: solo `admin`, con confirmación reciente |
| Entrar | el mismo enlace mágico o, sin correo, la llave ([§ Entrar con llave](#entrar-con-llave), que no aprueba aparatos); al gastarlo, la api mira el **aparato** (cookie `__Host-gemelo-aparato`: secreto de 256 bits, `HttpOnly; Secure; SameSite=Strict; Path=/`, un año; en la base, `aparatos_oficina.hash` = su SHA-256). Aparato aprobado → `303 /oficina/`; nuevo o pendiente → `303 /api/oficina/pendiente` (JSON: `aparato: "pendiente"`) |
| Aparato pendiente | la sesión existe pero **no sirve**: todo lo que pide sesión da `403 aparato_pendiente` (también `/api/sesion`, las hazas, el token de LiveKit y el mundo); solo valen `GET /api/oficina/sesion` y la página de pendiente |
| Aprobar un aparato | (a) desde otro aparato de oficina ya aprobado, con confirmación reciente: `POST /api/admin/aparatos/{id}/aprobar` (los de cuentas `admin`, solo `admin`); (b) la misma persona entra con **otro enlace desde ese aparato** pasados ≥ 5 min (`GEMELO_OFICINA_SEGUNDO_ENLACE_MIN`) y antes de 24 h; (c) desde la consola del servidor (`aprobado_como = 'consola'`, RUNBOOK-VPS). Un pendiente de más de 24 h ya no se aprueba: el siguiente enlace crea otro |
| Revocar un aparato | `POST /api/admin/aparatos/{id}/revocar` (los de `admin`, solo `admin` o su propia cuenta): cierra en el acto todas las sesiones que salieron de él |
| Caducidad | **12 h absolutas** (`GEMELO_OFICINA_SESION_HORAS`; la cookie y `expira_en` se fijan al entrar y además se mira `creada_en`) y **2 h sin actividad** (`GEMELO_OFICINA_INACTIVIDAD_MIN`), en vez de 30 y 7 días |
| Confirmación reciente | `sesiones.confirmada_en` (al entrar con un enlace) de hace menos de 15 min (`GEMELO_OFICINA_CONFIRMACION_MIN`); si no, lo delicado (borrar una familia, dar o quitar roles de oficina, aprobar un aparato; después: publicar parámetros, re-hornear) da `403 confirmacion_requerida`. `POST /api/oficina/confirmar` manda un enlace nuevo a la propia cuenta (mismos límites que el de la portada); entrar con él abre una sesión nueva y confirmada. Con OF13 la dará también la llave de acceso |
| Sesiones que no valen | las de una cuenta de oficina **sin aparato** (anteriores a la 0005); una de un código corto (`origen = 'vinculo'`) **no es nunca una sesión de oficina**: vale como visitante (rol efectivo `hogar`, 12 h; [§ Código corto](#código-corto-vincular-unas-gafas), ADR-0028). La oficina sí puede aprobar códigos cortos |
| Guardas (para cualquier ruta) | `requiereSesion`, `requiereRol(...roles)`, `requiereConfirmacionReciente()` en `apps/api/src/oficina/acceso.ts` (`auth/roles.ts` las reexporta). Todas las `/api/admin/*` piden `requiereRol("oficina", "admin")` |
| Estáticos | `/oficina/` solo con sesión de oficina: Caddy hace `forward_auth` a `/api/interno/autoriza?para=oficina` → 204; sin sesión, `303 /`; con sesión de hogar, 403; con el aparato pendiente, `303 /api/oficina/pendiente` |
| Auditoría | `oficina.aparato_nuevo`, `oficina.aparato_aprobado` (`como`: aparato, segundo_enlace), `oficina.aparato_revocado`, `oficina.confirmacion_pedida`; nunca el secreto del aparato |
| Riesgo que queda | el **segundo enlace** solo protege de quien tiene un enlace un momento (un reenvío, un escáner), **no** de quien controla el buzón: eso lo cierra la llave de acceso obligatoria (OF13, abajo). Un navegador guarda un solo aparato de oficina: dos cuentas en el mismo perfil se pisan la cookie |

### Llave de acceso (OF13)

Decisión 105 ([ADR-0024](../doc/adr/0024-la-oficina-roles-acceso-y-configuracion-versionada.md)): llave de acceso (WebAuthn, *passkey*) **obligatoria** para `oficina` y `admin`. Migración `0013`; código: `apps/api/src/oficina/llaves.ts` (reglas y envoltorios de `@simplewebauthn/server` 14.0.3) y `llaves_rutas.ts`; en la página, `apps/web/oficina/llave.js` con `@simplewebauthn/browser` 14.0.0. Lo comprueban `apps/api/pruebas/unidad/llaves.test.ts` (respuestas simuladas contra la verificación real), `apps/api/pruebas/integracion/llaves.test.ts` (PostGIS) y `pruebas/guardianes/oficina_llave.test.js`.

| Qué | Valor |
|---|---|
| Interruptor | `GEMELO_OFICINA_LLAVE`: `obligatoria` (por defecto, en todas partes) o `no` (solo fuera de producción y escrito a mano; en producción la api no arranca con `no`). Relajada, todo es como en OF1 y la llave es opcional |
| Dominio | `GEMELO_LLAVE_RP_ID` (por defecto, el dominio de `GEMELO_URL_PUBLICA`) y `GEMELO_LLAVE_ORIGEN` (por defecto, `GEMELO_URL_PUBLICA`); el RP ID es **exactamente el host del origen** (nunca un dominio padre: lo dejaría usar a los subdominios hermanos del VPS; OF13b-3, A12 de [LLAVES-DE-ACCESO](../doc/sistema/LLAVES-DE-ACCESO.md)), nunca una IP (WebAuthn no lo admite: la oficina por la IP de la red local no puede usar llaves). En dev, `https://localhost` vale |
| Qué se guarda | `llaves_acceso` (antes `llaves_oficina`; migración 0021, que deja una vista de compatibilidad con el nombre viejo para volver una versión; añade `descubrible`, falso en las llaves anteriores): id de credencial (base64url), clave **pública** COSE, contador, transports, nombre que le da la persona (1-40), si está respaldada (sincronizada), aparato desde el que se dio de alta, creada, última vez, revocada y por quién. `hogares.llave_usuario` (32 bytes al azar: el *user handle*, nunca el id ni el correo) y `hogares.llave_rehabilitada_hasta`. Ni la clave privada ni la biometría salen del aparato |
| Ceremonia | `POST /api/oficina/llaves/{alta,entrada}/opciones` da las opciones de WebAuthn y guarda el reto en `llaves_retos` (de un uso, 5 min, atado a la sesión); `POST /api/oficina/llaves/{alta,entrada}` verifica con ese reto, el origen y el RP ID. Verificación de la persona (huella, cara o PIN) **obligatoria**; llave **residente** obligatoria en las altas nuevas (`residentKey: "required"`, con `credProps`; `descubrible` salvo `rk: false`; OF13b-3); attestation `none`; el contador que no sube se rechaza (un clon) |
| Sesión | `sesiones.llave_id`: la llave con la que se abrió o confirmó. Con la llave obligatoria, una sesión de oficina sin llave viva queda `llaveRequerida`: todo da `403 llave_requerida` salvo `GET /api/oficina/sesion` (que dice `llave.requerida` y si `puede_alta`), las cuatro rutas de la ceremonia y la página `/oficina/` (`/api/interno/autoriza?para=oficina` → 204; navegando al mundo → `303 /oficina/`) |
| Confirmación reciente | con la llave obligatoria, **una aserción WebAuthn** (`POST /api/oficina/llaves/entrada`, o entrar con la llave sin correo desde un aparato aprobado, [§ Entrar con llave](#entrar-con-llave); las dos ponen `confirmada_en`) de hace menos de 15 min; el enlace ya no confirma y `POST /api/oficina/confirmar` da `409 usa_la_llave` |
| Alta | la **primera vez** con la sesión del enlace y el aparato aprobado (la cuenta nunca tuvo llave); después, solo desde una sesión abierta con llave (otra llave más; hasta 10 vivas) o con el alta **rehabilitada**. Quien solo controla el buzón no puede añadir su llave a una cuenta que ya tiene una (`403 entra_con_llave`). La sesión del alta queda abierta con la llave nueva |
| Gestión | `GET /api/oficina/llaves` y `POST /api/oficina/llaves/{id}/revocar` (propias, con confirmación reciente; **nunca la última**: `409 ultima_llave`). `admin`: `GET /api/admin/llaves` (cada cuenta por su `nombre`: el nombre interno, decisión 109, o «Cuenta n.º id»; nunca el correo) y `POST /api/admin/llaves/{id}/revocar` (confirmación reciente). Revocar cierra en el acto las sesiones abiertas o confirmadas con esa llave. Nunca se devuelve la clave pública ni el id de credencial |
| Recuperación | `POST /api/admin/hogares/{id}/rehabilitar-llave` (`admin`, confirmación reciente, **nunca la propia**: `403 no_a_ti_mismo`; con `revocar_llaves`, revoca antes las suyas): durante 24 h esa cuenta puede dar de alta una llave con el enlace; se gasta al darla de alta. Si se queda sin llaves el único `admin`, desde la consola del servidor ([RUNBOOK-VPS](../doc/operacion/RUNBOOK-VPS.md), paso 10b). No hay otra puerta: ni código de recuperación, ni correo que salte la llave |
| Auditoría | `oficina.llave_alta`, `oficina.llave_entrada`, `oficina.llave_fallida` (`ceremonia`, `motivo`: origen, rp_id, reto, contador, sin_verificacion, otra_llave…), `oficina.llave_revocada`, `oficina.llave_rehabilitada`; y, para todas las cuentas (OF13b-3), `llave.alta` (familias), `llave.acceso` y `llave.acceso_fallido` (`motivo` solo aquí: hacia fuera, el fallo de la entrada sin sesión es siempre el mismo); nunca la respuesta, la clave, el id de credencial ni el correo |
| Riesgo que queda | quien tenga **a la vez** el buzón y una llave (o el aparato desbloqueado con la llave sincronizada) entra; una llave sincronizada (iCloud, Google) vale lo que vale esa cuenta. Si se pierden todas las llaves de todos los `admin`, la recuperación es la consola |

## Registros

JSON (pino). Nunca: token, cookie (ninguna: ni la de sesión, ni `__Host-gemelo-aparato`, ni `__Host-gemelo-reto`; el Caddy borra la cabecera `Cookie` y `Set-Cookie` enteras), `Authorization`, la respuesta de WebAuthn, correo (el límite por correo usa su huella, no el correo), IP completa (se recorta a /24 o /48), consulta de la URL. Lo comprueban la integración y `infra/probar-caddy.sh`.

## RGPD

`GET /api/yo/datos` descarga todo lo del hogar (desde la 0004, también lo que colgó, subió, denunció y sugirió, sus avisos, inscripciones y lotes); `DELETE /api/yo` (o la oficina) lo borra en cascada, y la api borra además sus ficheros subidos ([VIDA](../doc/sistema/VIDA.md#datos-personales-para-la-eipd)); la auditoría guarda el hecho, sin el correo. La oficina (OF2) exporta lo mismo, más el nombre interno, con `GET /api/admin/hogares/{id}/exportar` y borra con `DELETE /api/admin/hogares/{id}` pidiendo confirmación reciente y el correo escrito en el cuerpo. **Baja** (decisión 108): `POST /api/admin/hogares/{id}/baja` pone `activo = false` y `baja_en`, cierra sesiones, deja la haza sin titular (el contenido que se ve del mundo cuelga de la haza: oculto al momento) y la purga ([`bajas.ts`](../apps/api/src/admin/bajas.ts)) borra la cuenta a los 30 días; `…/reactivar` la devuelve con las hazas que sigan libres.
