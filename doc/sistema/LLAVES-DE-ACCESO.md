# Llaves de acceso para todos — diseño y estudio de seguridad (OF13b)

**Aceptado, en implementación** (plan del §7; lo que difiere de este estudio al implementarlo, en el §10: OF13b-3, OF13b-5 y OF13b-8). Decisión: [ADR-0029](../adr/0029-llaves-de-acceso-para-todos.md) (aceptado por Antonio el 2026-11-02, decisiones 183-187). Pedida por Antonio el 2026-11-02 (decisión 174) tras su primera entrada real en el servidor: «el login me parece horrible». Parte de lo que ya existe: el enlace mágico y la sesión ([ADR-0013](../adr/0013-enlace-magico-y-sesiones.md), [contratos/sesion.md](../../contratos/sesion.md)), la oficina con aparato confiable ([ADR-0024](../adr/0024-la-oficina-roles-acceso-y-configuracion-versionada.md)), su llave obligatoria (OF13, [sesion.md § Llave de acceso](../../contratos/sesion.md#llave-de-acceso-of13)) y las gafas con código corto ([ADR-0028](../adr/0028-gafas-vinculadas-desde-la-oficina-entran-como-visitante.md)).

Distingue, como pide la regla 5: lo que está **en el código** (leído en `apps/api/src/auth/`, `apps/api/src/oficina/llaves*.ts`, migraciones 0013 y 0015, `apps/web/oficina/llave.js`), lo que **se propone** y lo **[SUPUESTO]** (comportamiento de navegadores no probado aquí).

---

## 1. En una página

- **Entrar** es, por defecto, **«Entrar con mi llave»**: el navegador ofrece las llaves de este sitio guardadas en el aparato (o en el teléfono por QR) y, con huella, cara o PIN, se entra sin escribir el correo. Debajo, **«Recibir un enlace por correo»**: el alta (primer acceso) y la recuperación.
- **Tras entrar con un enlace** en un aparato sin llave, la portada ofrece **«¿Crear una llave en este aparato?»** con tres salidas: *Sí*, *Ahora no*, *Este aparato no es mío* (no vuelve a preguntar en ese navegador).
- **Una sola tabla de llaves** para todas las cuentas: `llaves_oficina` se renombra a `llaves_acceso` (migración nueva) y las reglas cambian por tipo de cuenta, no por tabla.
- **Familias:** el **correo sigue siendo la raíz**. Un enlace puede añadir una llave nueva aunque la cuenta ya tenga otras (es la recuperación que decidió Antonio), con **aviso por correo** y la lista de llaves visible y revocable en *Mis dispositivos*. La llave mejora la comodidad y quita el phishing del día a día; **no sube el techo de seguridad por encima del buzón**. Se dice así.
- **Oficina:** se entra con la llave **sin pedir enlace** en un **aparato ya aprobado**; en un aparato nuevo, el aparato sigue quedando pendiente (decisión 152: aparato y llave son pasos separados). El buzón solo nunca añade una llave a una cuenta de oficina que ya tiene una (lo de OF13, sin cambios).
- **Gafas:** siguen con el código corto (ADR-0028); no se ofrece llave en ellas.
- **Sin librerías nuevas:** `@simplewebauthn/server` 14.0.3 y `@simplewebauthn/browser` 14.0.0, ya fijadas por OF13 (regla 12).

---

## 2. Qué falla hoy en el login real

Lo que Antonio encontró el 2026-11-02 y por qué pasa (el mecanismo está en el código; el detalle de cada navegador es **[SUPUESTO]** hasta probarlo):

| Síntoma | Por qué pasa | Qué lo arregla aquí |
|---|---|---|
| **429 «Has pedido varios enlaces seguidos»** | `POST /api/auth/enlace` admite **3 por correo y 10 por IP en 15 min** (`GEMELO_ENLACE_POR_CORREO`, `config.ts`). La oficina necesita, la primera vez en un aparato, **dos enlaces** separados ≥ 5 min (aparato pendiente → segundo enlace) y, si uno tarda en llegar y se pide otro, el tercero agota el cupo | La llave quita los enlaces del día a día; el enlace queda para el alta y la recuperación. Se propone subir a 5 por correo (pregunta P4) y que el 429 diga «entra con tu llave si la tienes» |
| **Aparato pendiente** | ADR-0024: un aparato nuevo de oficina no sirve hasta que lo aprueba otro aparato o un segundo enlace pasados 5 min | Sigue igual la primera vez (decisión 152); **solo la primera vez** por aparato: desde entonces, llave y dentro |
| **Correo mal tecleado** | La api responde lo mismo exista o no la cuenta (ADR-0013, a propósito): quien teclea mal espera un correo que nunca llega | Con llave no se teclea el correo. En la pantalla de «Revisa tu correo», el correo escrito bien visible con «¿Está bien escrito? Cambiarlo». Sugerencia de dominio («¿gmail.com?») en el navegador, sin preguntar a la api |
| **Edge, Chrome, Windows Hello y el QR** | En Windows hay **varios sitios donde guardar una llave**: Windows Hello (del usuario de Windows, la ven Edge y Chrome), el gestor de Google en Chrome y el de Microsoft en Edge (sincronizadas, cada una solo en su navegador) y el teléfono por QR (híbrido, necesita Bluetooth). Una llave creada en el gestor de Chrome no aparece en Edge **[SUPUESTO por probar]**. El diálogo del sistema ofrece «Usar un teléfono» con un QR que desconcierta | Textos que dicen *dónde* se guarda; el nombre de la llave con aparato y navegador («Windows · Edge»); la pista `hints` / `preferredAuthenticatorType` para preferir la del aparato al crear **[a comprobar en simplewebauthn 14.0.3]**; en *Mis dispositivos*, cada llave con dónde se creó y si está sincronizada (`respaldada`) |
| **Enlaces que no llegan** | El SMTP de OVH está **no verificado** (ADR-0013) y sin DKIM/DMARC comprobados (DECISIONS-PENDING, «VPS»): el correo puede ir a *spam* o retrasarse | La llave deja de depender del correo salvo en el alta y la recuperación; la pantalla dice el remitente y «mira en spam o promociones». La entrega en sí es de operación (V1), no de este ADR |

---

## 3. Los recorridos

### 3.1 Primer acceso de una familia (alta)
1. La oficina da de alta la cuenta (como hoy). La familia pide un enlace en la portada: **«Si ese correo tiene cuenta, te llegará un enlace. Caduca en 15 minutos y sirve una vez.»** (mismo texto exista o no).
2. Abre el enlace → página intermedia con botón (no la gasta un escáner) → sesión `origen = 'enlace'` → primer acceso (normas, alias) como hoy.
3. **Oferta de llave**, si el navegador la admite (`browserSupportsWebAuthn()` y `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`): «La próxima vez entrarás con tu huella, tu cara o el PIN de este aparato, sin esperar correos. Cualquiera que pueda desbloquear este aparato podrá entrar con tu cuenta.» → *Crear la llave* / *Ahora no* (vuelve a ofrecerse a los 30 días) / *Este aparato no es mío* (no se ofrece más en este navegador; preferencia local, `localStorage`, que no es un secreto).
4. Alta: `POST /api/yo/llaves/alta/opciones` → `startRegistration()` → `POST /api/yo/llaves/alta`. La sesión queda marcada con esa llave. Sale un **correo de aviso** (§5.3).

### 3.2 Entrar con mi llave (sin sesión, sin escribir el correo)
1. Botón **«Entrar con mi llave»**, el primero de la pantalla si el navegador admite WebAuthn. Además, el campo del correo lleva `autocomplete="email webauthn"` y se arranca la **mediación condicional** (`startAuthentication({ optionsJSON, useBrowserAutofill: true })`, si `browserSupportsWebAuthnAutofill()`): al tocar el campo, el navegador ya sugiere la llave.
2. `POST /api/auth/llave/opciones` (sin sesión) → reto de un uso, 5 min, atado al navegador por una cookie `__Host-gemelo-reto` (`HttpOnly; Secure; SameSite=Strict`, 5 min; en la base, el SHA-256 de su valor). `allowCredentials` **vacío**: el aparato elige la llave (credencial descubrible).
3. `POST /api/auth/llave {respuesta}` → la api busca la credencial por su id **en toda la tabla**, exige llave viva, cuenta activa, que el `userHandle` de la respuesta sea el `llave_usuario` de esa cuenta, verificación de la persona (UV), origen y RP ID, y el contador. Si todo cuadra: **rotación** (`session.regenerate()`), sesión nueva `origen = 'llave'`, `llave_id` puesto, titular. Familia → `/finca/` (o el primer acceso si cambian las normas).
4. Si la llave no es de ninguna cuenta viva (se borró la cuenta o se quitó la llave): **«Esa llave ya no sirve en este sitio. Entra con un enlace y, si quieres, crea otra.»** Si el navegador tiene la API de señales (`PublicKeyCredential.signalUnknownCredential`, Chrome 132+ **[SUPUESTO, no probado]**), se le avisa para que la esconda; detectado por función, sin depender de ella.

### 3.3 Recibir un enlace (recuperación)
El mismo enlace de siempre, debajo y siempre a la vista. Al entrar con él en un aparato sin llave, la oferta de 3.1. Si la cuenta ya tiene llaves, *Mis dispositivos* las enseña con «¿Ya no tienes este aparato? Quitar la llave». Para la oficina, nada cambia: un enlace solo nunca da una llave nueva a una cuenta que ya tuvo una (OF13: rehabilitación por otro `admin` o por la consola, RUNBOOK-VPS 10b).

### 3.4 La oficina
- **Aparato aprobado + llave** → `POST /api/auth/llave` reconoce la cookie `__Host-gemelo-aparato` (de la misma cuenta, aprobada, no revocada) → sesión de oficina `origen = 'llave'`, 12 h / 2 h, `llave_id` y `confirmada_en = now()` (cuenta como confirmación reciente) → `303 /oficina/`. **Sin enlace.**
- **Aparato nuevo o pendiente + llave** → se crea (o se reconoce) el aparato pendiente, como hoy al entrar con un enlace; la llave **no** lo aprueba (decisión 152, pregunta P2). Se aprueba desde otro aparato, con el segundo enlace o desde la consola.
- **Confirmación reciente** (lo delicado): sigue siendo una aserción con la llave (`POST /api/oficina/llaves/entrada`), como en OF13.
- El enlace sigue valiendo para la oficina como hoy (abre una sesión que pide la llave: `llaveRequerida`).
- *Difiere al implementarlo (OF13b-8, § 10):* `/oficina/` no se sirve sin sesión, así que la entrada de verdad es la portada; la pantalla de entrada de la oficina solo sale si la página llega sin sesión.

### 3.5 Las gafas
Siguen con el **código corto** (contratos/sesion.md § Código corto, ADR-0028). El soporte de WebAuthn del navegador de las Quest **no está verificado**; no se ofrece llave en ellas (`isUserVerifyingPlatformAuthenticatorAvailable()` falso o la sesión `origen = 'vinculo'`). Una sesión abierta con llave es titular (`origen !== 'vinculo'`) y puede aprobar el código de unas gafas, como una de enlace.

---

## 4. Amenazas y mitigaciones

| # | Amenaza | Mitigación | Lo que queda |
|---|---|---|---|
| A1 | **Phishing** (una web falsa que imita la portada) | La llave está atada al RP ID y al origen: el navegador no la usa en otro dominio; la api comprueba `expectedOrigin` y `expectedRPID` (ya en `llaves.ts`) | El enlace por correo sigue siendo *phishable* (alguien reenvía su enlace a quien se lo pide): por eso para la oficina el enlace solo no basta |
| A2 | **Quien controla el buzón** de una familia | Puede pedir un enlace y **añadir su llave** (es la recuperación). Mitigación: correo de aviso «se ha añadido una llave», llaves visibles y revocables, auditoría `llave.alta` con aparato y navegador | **Igual que hoy** (ADR-0013): el buzón es la raíz de una cuenta de familia. Si una familia quiere más, futuro «solo con llave» (fuera de este ADR) |
| A3 | Quien controla el buzón de la **oficina** | Sin cambios respecto a OF13: el enlace no añade llave a una cuenta que ya tuvo una (`403 entra_con_llave`); aparato confiable aparte | Buzón + llave sincronizada robada (la cuenta de Google/Apple) + aparato aprobado: el mismo riesgo que hoy |
| A4 | **Aparato perdido o robado** (familia) | Bloqueado: la llave exige UV (huella, cara, PIN). Desde otro aparato (o con un enlace), *Mis dispositivos* → «Quitar la llave» (cierra en el acto las sesiones abiertas con ella) y «Salir de todos». La oficina puede quitar las llaves de una familia desde su ficha | Desbloqueado y robado: entra hasta que se quite la llave. Una llave **sincronizada** vive en todos los aparatos de esa cuenta de Google/Apple: quitarla las corta todas |
| A5 | **Aparato compartido** (el PC de casa, la tableta de la familia) | La cuenta es **del hogar**, no de una persona: que la familia comparta aparato y llave es lo previsto. La oferta avisa: «cualquiera que pueda desbloquear este aparato podrá entrar con tu cuenta». *Este aparato no es mío* no vuelve a preguntar | En un aparato ajeno (de un vecino, de un cibercafé) alguien puede crear la llave sin pensarlo; la lista de llaves con su nombre y fecha permite verlo y quitarla |
| A6 | **Menores** con el aparato de los padres | El titular es el adulto (decisión 96); el menor que desbloquea el aparato (otra huella dada de alta en el móvil) entra como titular | Sin defensa técnica: es el mismo caso que hoy con una sesión de 30 días abierta. Se dice en el texto de la oferta |
| A7 | **Enumerar cuentas** | (1) La entrada con llave no pide correo: no hay nada que sondear. (2) `POST /api/auth/enlace`: **202 con el mismo texto** exista o no («Si ese correo tiene cuenta, te llegará un enlace…»), el mismo 429 para cualquier correo, y el envío sin esperar al SMTP (ya en `rutas.ts`). (3) **No** se ofrece «escribe tu correo y te pido tu llave» (`allowCredentials` por correo): delataría qué correos tienen cuenta y llave | El tiempo de respuesta del 202: desde OF13b-5 las dos ramas hacen una y la misma sentencia (§10); la diferencia de dentro de la base, sin medir en tiempo real |
| A8 | **Reto reutilizado o robado** | Reto de un uso y 5 min (`llaves_retos`, se borra al usarlo); sin sesión, atado al navegador por `__Host-gemelo-reto` (solo su SHA-256 en la base). Rotación de la sesión al entrar | — |
| A9 | **Clon de una llave** | El contador que no sube se rechaza (OF13). Las llaves sincronizadas dan contador 0 siempre (la librería lo acepta) | Una llave sincronizada clonada por el proveedor no se detecta: vale lo que vale esa cuenta de Google/Apple |
| A10 | **Credencial de otra cuenta** | La api busca la credencial y exige además que `userHandle` sea el de esa misma cuenta; nunca se elige la cuenta por lo que diga el cliente | — |
| A11 | **Abuso de la ruta sin sesión** (llenar `llaves_retos`) | `@fastify/rate-limit` por IP: opciones 30 / 15 min, verificación 20 / 15 min [valores de partida, `GEMELO_LLAVE_*`]; purga de retos caducados (ya en `purga()`) | — |
| A12 | **Otra app del mismo VPS** (Oficultor, Vigía, Filo en dominios hermanos) | **RP ID = el host exacto del gemelo**, nunca el dominio padre: si fuera el padre, cualquier subdominio hermano podría pedir aserciones de las llaves del gemelo. Sin *related origins* (`/.well-known/webauthn`) | Cambiar de dominio invalida **todas** las llaves (§5.4) |
| A13 | **CSRF** | `SameSite=Lax` en la sesión, `Strict` en las cookies de aparato y reto, comprobación de `Origin` en todo POST (`seguridad/origen.ts`), sin `text/plain` | — |
| A14 | **Fijación de sesión** | `session.regenerate()` al entrar con llave, como con el enlace y el código | — |
| A15 | **Registros** | Nunca la respuesta de WebAuthn, la clave pública, el id de credencial, el reto ni la cookie (lo que ya cumple OF13); la auditoría guarda el id interno de la llave | — |

### Origen, CORS y RP ID
- **Origen:** `GEMELO_LLAVE_ORIGEN` (por defecto `GEMELO_URL_PUBLICA`); un solo origen. Sin CORS: el motor y la portada solo piden a su mismo origen (CLAUDE.md §5) y la CSP lo impone (`connect-src 'self'`).
- **RP ID:** `GEMELO_LLAVE_RP_ID`, por defecto el host de `GEMELO_URL_PUBLICA` (lo hace ya `config.ts`). Nunca una IP (WebAuthn no la admite: la red local por IP no tiene llaves; se entra con enlace). En dev, `localhost`.
- **Permissions-Policy:** el Caddy no lista `publickey-credentials-get` ni `-create`, así que valen para el propio origen (su valor por defecto). `usb=()` y `bluetooth=()` limitan las API WebUSB y Web Bluetooth de la página, **no** el acceso del navegador a una llave USB o al teléfono por QR **[SUPUESTO por comprobar en aparato]**.

### Verificación de la persona (UV): obligatoria
`userVerification: "required"` en el alta y en la entrada, también para familias (hoy ya lo es para la oficina). Con UV, la llave es dos factores en uno (algo que tienes + huella o PIN), y por eso puede **sustituir** al enlace del correo en la entrada de cada día. Con `preferred`, una llave física sin PIN valdría solo como «algo que tienes». Coste: una llave física sin PIN no sirve (se pide ponerle uno); un móvil sin bloqueo de pantalla no puede crear llaves (Android e iOS ya lo exigen).

### Llaves residentes (credenciales descubribles): obligatorias para las nuevas
`residentKey: "required"` para las llaves nuevas de todas las cuentas (OF13 las crea con `preferred`): es lo que permite entrar **sin escribir el correo**, y sin eso habría que pedirlo y caer en A7. Se pide la extensión `credProps` y se guarda si el aparato dice que la llave es descubrible (`descubrible`, nulo si no lo dice). Las llaves de oficina que ya existan y no sean descubribles siguen valiendo por el camino de hoy (enlace → pantalla de la llave con `allowCredentials`), y la oficina las ve marcadas para cambiarlas. Coste: llaves físicas viejas (solo U2F, o FIDO2 con el espacio lleno) no se pueden dar de alta.

### Attestation
`none`, como en OF13: no se pide ni se guarda la marca ni el modelo del autenticador (ni el AAGUID). Menos datos (RGPD) y ninguna lista de autenticadores que mantener.

---

## 5. Qué se guarda, dónde, y la recuperación

### 5.1 La base: una tabla, `llaves_acceso`
**Decisión: renombrar `llaves_oficina` a `llaves_acceso`** en una migración nueva (0021 o la siguiente libre), con la misma forma más `descubrible boolean`. Razones:
- La entrada sin correo busca la credencial **por su id en todas las cuentas**: con dos tablas habría que buscar en las dos y la unicidad de `credencial_id` entre ellas no la garantizaría la base.
- Las comprobaciones (reto, contador, UV, revocación, `sesiones.llave_id`) son las mismas; lo que cambia por tipo de cuenta es **quién puede dar de alta** (`permisoAlta`), y eso es una regla pura, no un esquema.
- `aparato_id` (aparato de oficina) queda nulo en las familias.

Alternativas: **reusar `llaves_oficina` sin renombrar** (cero coste hoy, un nombre que miente para siempre y confunde en las consultas y el RUNBOOK); **tabla nueva `llaves_hogar`** (duplica código, dos búsquedas y unicidad no garantizada). Coste del renombre: tocar las consultas de `llaves.ts`, `llaves_rutas.ts`, `almacen.ts`, las pruebas, tres guardianes, el contrato y el paso 10b del RUNBOOK-VPS, en el mismo commit.

Más cambios de la misma migración:
- `llaves_retos`: `sesion_id` pasa a admitir nulo; columna `clave` (SHA-256 de la cookie `__Host-gemelo-reto`, única); `tipo` admite `acceso` (entrada sin sesión); `CHECK (sesion_id IS NOT NULL OR clave IS NOT NULL)`.
- `sesiones.origen` admite `llave` (`CHECK (origen IN ('enlace', 'vinculo', 'llave'))`). Titular = `origen <> 'vinculo'` (lo que ya hace casi todo el código); `almacen.ts` deja de exigir `origen = 'enlace'` a la oficina y admite también `llave` (las dos únicas comparaciones con `'enlace'` del código de la api están ahí).

### 5.2 Qué guarda la llave y qué no (RGPD)
- **En la base:** id de credencial, clave **pública**, contador, transports, nombre que le da la persona (o «Windows · Edge»), si es sincronizada, si es descubrible, creada, última vez, revocada y por quién. En `hogares`, `llave_usuario` (32 bytes al azar). Nada de biometría, ni clave privada, ni modelo del aparato, ni IP.
- **En el aparato o el gestor de la persona:** la clave privada, el `user handle` (los 32 bytes al azar, nunca el id ni el correo) y el **nombre de la cuenta que se enseña al elegir la llave**: hoy, el correo (`userName` en `opcionesDeAlta`). Para una familia en un aparato compartido, el correo lo ve quien use ese aparato (pregunta P3).
- **Datos del hogar:** `GET /api/yo/datos` y la exportación de la oficina incluyen las llaves (nombre, fechas, sincronizada; sin id ni clave). Borrar la cuenta las borra (cascada, ya en la 0013). Las revocadas se guardan hasta el borrado de la cuenta, para la auditoría. La EIPD debe añadir el tratamiento (autenticación; base: la misma de la cuenta; sin datos biométricos en el servidor).
- **Menores:** no tienen cuenta (el titular es el adulto); la llave no guarda nada del menor que use el aparato.

### 5.3 Avisos al hogar
Un correo solo de texto (como el del enlace) cuando **se añade** una llave y cuando **se quita**: «Se ha añadido una llave de acceso a tu cuenta: «Android · Chrome», el 2 de noviembre a las 18:04. Si no has sido tú, entra con un enlace y quítala en Mis dispositivos, o avisa a la oficina.» No en cada entrada (pregunta P5). Usa el mismo cartero (`auth/correo.ts`) y no depende de `avisos_correo` (es seguridad, no un aviso de la campana).

### 5.4 Recuperación y revocación
| Caso | Familia | Oficina |
|---|---|---|
| Perdí el aparato, tengo otro con llave | *Mis dispositivos* → quitar la llave perdida | Sistema → Llaves → revocar (confirmación reciente; nunca la última) |
| Perdí todos los aparatos | **Recibir enlace** → entrar → quitar las viejas → crear una nueva (aviso por correo) | Otro `admin` rehabilita el alta 24 h; si es el único `admin`, la consola (RUNBOOK-VPS 10b). Sin cambios |
| Me robaron el móvil desbloqueado | Desde otro aparato: quitar la llave y «Salir de todos»; o llamar a la oficina, que quita las llaves y cierra las sesiones desde la ficha | Igual que hoy |
| Cambia el dominio del gemelo | Todas las llaves dejan de valer: se entra con enlace y se crean otras | Todas las llaves dejan de valer: **rehabilitar el alta de todas las cuentas desde la consola** antes del cambio (paso nuevo del RUNBOOK) |
| Límites | Enlace: los de ADR-0013 (pregunta P4). Llave: §4 A11 | Los mismos |

«Salir de todos» cierra sesiones pero **no quita llaves**: un aparato perdido con su llave podría abrir otra. La pantalla lo dice y ofrece las dos cosas juntas: «Salir de todos los aparatos y quitar todas las llaves».

---

## 6. Librerías (regla 12)
- **api:** `@simplewebauthn/server` **14.0.3** (ya fijada): `generateRegistrationOptions` (con `residentKey: "required"`, `userVerification: "required"`, `attestationType: "none"`, `excludeCredentials`), `generateAuthenticationOptions` (sin `allowCredentials`), `verifyRegistrationResponse`, `verifyAuthenticationResponse`. Se reusan `llaves.ts` (reglas puras, envoltorios, retos, revocación) y la forma de `llaves_rutas.ts`.
- **navegador:** `@simplewebauthn/browser` **14.0.0** (ya fijada en `apps/web/package.json`, la usa `oficina/llave.js`): `browserSupportsWebAuthn`, `browserSupportsWebAuthnAutofill`, `startRegistration`, `startAuthentication` (`useBrowserAutofill` para la mediación condicional), `WebAuthnAbortService` para cancelar la ceremonia condicional al pulsar el botón. Las piezas puras de textos y errores (`oficina/llave_puro.js`) se mueven a un módulo común para la portada y la oficina.
- **sesión, límites, cookies:** `@fastify/session`, `@fastify/rate-limit`, `@fastify/cookie`, las de siempre.
- **No** hace falta: Passport, better-auth, Hanko, un proveedor externo (ADR-0013). Si para la sugerencia de dominio del correo se quiere librería, buscar una mantenida y fijarla; si no la hay, una lista corta de dominios frecuentes en el módulo puro, diciendo por qué (regla 12, paso 3).

---

## 7. Plan troceado (para volcar a `doc/rumbo/PLAN.md` cuando Antonio acepte el ADR)

Orden por dependencias y por lo que abarata el banco (CLAUDE.md §6). Peso: **ligero** (código y pruebas de Node, sin Chrome ni Docker) o **pesado** (por el banco).

| Id | Qué | Depende | Peso · modelo |
|---|---|---|---|
| OF13b-1 | Textos: 202 «Si ese correo tiene cuenta, te llegará un enlace…», 429 que remite a la llave, «Revisa tu correo» con el correo escrito y «Cambiarlo», remitente y «mira en spam»; pruebas de unidad y guardián de textos | — (ya, sin esperar al ADR) | ligero · haiku |
| OF13b-2 | Migración: `llaves_oficina` → `llaves_acceso` (+ `descubrible`), `llaves_retos` sin sesión (`clave`, `tipo` `acceso`), `sesiones.origen` admite `llave`; renombre en `llaves.ts`, `llaves_rutas.ts`, `almacen.ts`, pruebas, guardianes, contrato y RUNBOOK-VPS 10b | ADR aceptado | ligero · sonnet |
| OF13b-3 | `llaves.ts` general: `permisoAlta` por tipo de cuenta (familia: con sesión titular de enlace o de llave, también si ya tiene llaves; oficina: lo de OF13), opciones con `residentKey: "required"` y `credProps`, entrada sin `allowCredentials`, búsqueda global por credencial con `userHandle`; unidad con respuestas simuladas contra la verificación real | OF13b-2 | ligero · **opus** |
| OF13b-4 | Rutas de familia `GET/POST /api/yo/llaves…` (alta, lista, quitar; titular; quitar cierra sus sesiones; última permitida en familias), correo de aviso al añadir y quitar, `/api/yo/datos` con las llaves; contrato `sesion.md` y `api.openapi.yaml` en el mismo commit | OF13b-3 | ligero · sonnet |
| OF13b-5 | Entrada sin sesión `POST /api/auth/llave/opciones` y `/api/auth/llave` (cookie de reto, límites, rotación, `origen = 'llave'`; oficina: aparato aprobado → 12 h con `confirmada_en`, si no, aparato pendiente); `almacen.ts` admite `llave`; unidad | OF13b-3 | ligero · **opus** |
| OF13b-6 | Oficina: quitar las llaves de una familia desde su ficha (`/api/admin/hogares/{id}/llaves…`, confirmación reciente, auditoría), exportación con llaves; Sistema marca las llaves de oficina no descubribles | OF13b-4 | ligero · sonnet |
| OF13b-7 | Portada: «Entrar con mi llave» + mediación condicional + «Recibir un enlace»; oferta tras el enlace (*Sí* / *Ahora no* / *No es mío*); *Mis dispositivos* con llaves y «Salir de todos y quitar las llaves»; módulo puro común con `llave_puro.js`; pruebas de Node; nota de comodidad (regla 11) | OF13b-4, OF13b-5 | ligero · sonnet |
| OF13b-8 | Oficina `llave.js`: la entrada con llave desde la portada llega ya dentro; la pantalla de la llave queda para las sesiones de enlace | OF13b-5 | ligero · sonnet |
| OF13b-9 | Integración contra PostGIS (por el banco): alta de familia, entrada sin sesión, credencial de otra cuenta, `userHandle` cambiado, reto sin cookie o gastado, enumerado (mismo 202 y 429), quitar llave cierra sesiones, oficina con aparato aprobado y pendiente, enlace de oficina no añade llave | OF13b-4…6 | **pesado** · sonnet |
| OF13b-10 | Recorrido en Chrome con el autenticador virtual de CDP (por el banco): portada alta, entrada por botón y por autorrelleno, quitar, oficina con llave sin enlace | OF13b-7, OF13b-8 | **pesado** · sonnet |
| OF13b-11 | EIPD y documentación: tratamiento de las llaves, UX §4, OFICINA §2, ADR-0029 a Aceptado | OF13b-9 | ligero · sonnet |
| OF13b-12 | 👤 Pruebas en aparatos reales tras subir al VPS (con confirmación): Windows Hello en Edge y en Chrome, gestor de Google en Chrome, iPhone (Safari, iCloud), Android (Chrome, Google), teléfono por QR desde el PC, llave física con PIN, Firefox, Quest (no ofrece llave y el código corto sigue), lector de pantalla | OF13b-10 y despliegue | 👤 Antonio |

---

## 8. Preguntas abiertas para Antonio

| # | Pregunta | Recomendación |
|---|---|---|
| P1 | ¿Un enlace del correo puede **añadir una llave** a una cuenta de familia que **ya tiene** llaves? | **Sí**, con aviso por correo y la lista visible: es la recuperación que decidiste y así nadie queda fuera. La otra opción (solo la oficina restablece) es más segura pero te deja a ti de servicio técnico |
| P2 | En la oficina, ¿una llave válida **aprueba por sí sola** un aparato nuevo? | **No**, como decidiste en la 152: si alguien se hace con tu cuenta de Google o de Apple (y con ella tus llaves sincronizadas), aún le falta un aparato aprobado. El coste es esperar la aprobación una vez por aparato |
| P3 | ¿Qué nombre de cuenta enseña el aparato al elegir la llave? | **El correo**, que es lo que la familia reconoce; la alternativa (el alias o «Hogar del gemelo») protege algo en un aparato compartido pero confunde a quien tenga dos cuentas |
| P4 | ¿Límite de enlaces por correo: 3 cada 15 min (hoy) o 5? | **5 cada 15 min** (y 10 por IP como hoy): con llaves se piden muchos menos, y la primera vez de la oficina necesita dos más un posible reenvío |
| P5 | ¿Avisos de seguridad por correo: al añadir y quitar llaves, o también en cada entrada desde un aparato nuevo? | **Solo al añadir y quitar**: avisar en cada entrada acostumbra a no leerlos |

---

## 9. Qué no está probado
Nada de esto existe aún. De OF13 (lo que se reusa) solo hay pruebas de Node con respuestas simuladas contra la verificación real; el recorrido de la oficina con el autenticador virtual está escrito sin lanzar. **No probado con ninguna llave real:** Windows Hello en Edge ni en Chrome, el gestor de Google en Chrome o el de Microsoft en Edge, iPhone y Mac (iCloud), Android (Google), el teléfono por QR (híbrido), llaves físicas, Firefox, gestores de terceros (1Password, Bitwarden), la mediación condicional en cada navegador, la API de señales, el navegador de las Quest y los lectores de pantalla en la pantalla de la llave.

---

## 10. Lo que difiere al implementarlo

Solo lo que cambia respecto a lo de arriba, con su razón. El resto se hizo como se estudió.

### OF13b-3 — la lógica general (`apps/api/src/oficina/llaves.ts`)
- **El RP ID, exactamente el host.** `config.ts` admitía en `GEMELO_LLAVE_RP_ID` el dominio del origen **o uno de sus padres** (OF13); el §4 (A12) dice «nunca el dominio padre». Ahora la api no arranca si el RP ID no es el host exacto de `GEMELO_LLAVE_ORIGEN`. Si el servidor tuviera puesto un dominio padre, hay que quitarlo antes de desplegar (el ejemplo, `infra/entorno.ejemplo`, ya usaba el host exacto).
- **`descubrible`, sin nulos.** La 0021 dejó la columna `NOT NULL DEFAULT false` (no «nulo si no lo dice», §4). Como el alta pide `residentKey: "required"` y un navegador que cumple la norma no crea otra cosa, una llave nueva se guarda como descubrible **salvo que `credProps` diga expresamente `rk: false`** (muchos aparatos no devuelven `credProps`). Es un dato del cliente, sin firmar: se enseña, no decide permisos.
- **El `userHandle` no va firmado.** WebAuthn no lo incluye en lo que firma el autenticador. La garantía de A10 la da la firma con la clave pública de la credencial encontrada por su id; exigir además que el `userHandle` sea el `llave_usuario` de esa misma cuenta es una comprobación de coherencia (y en tiempo constante), no una barrera criptográfica.
- **Un solo fallo, sin «esa llave ya no sirve».** El §3.2 paso 4 distingue «la llave no es de ninguna cuenta viva» (y avisa al navegador con `signalUnknownCredential`). La lógica devuelve **el mismo fallo** para credencial desconocida, revocada, de una cuenta de baja, `userHandle` ajeno, firma, origen, RP ID, UV o contador, y la credencial desconocida se verifica igual contra una clave de señuelo para que el tiempo no lo delate; el motivo solo queda en la auditoría. Para OF13b-5: un texto que valga para todos los casos («Esa llave no sirve aquí o no se pudo comprobar: entra con un enlace») y, si se quiere la API de señales, decidirlo aparte sabiendo que distingue «credencial desconocida».
- **Tipo de cuenta por el rol de la cuenta.** `permisoAlta` decide por `hogares.rol` (nunca por el rol efectivo de la sesión: unas gafas de una cuenta de oficina entran como `hogar`). `guia` y `corresponsal` siguen las reglas de familia (el estudio solo distingue familia y oficina) **[SUPUESTO: por confirmar]**. Desde una sesión `vinculo` no se da de alta nunca; una cuenta de oficina con el aparato sin aprobar, tampoco (aunque la sesión venga de una llave: decisión 184).
- **Aviso por correo.** `permisoAlta` y `registraLlave` dicen `avisar` en todo alta permitida (también de la oficina); la lógica no envía nada. Desde OF13b-4 las rutas de la oficina de OF13 también lo mandan (alta propia, revocación propia y revocación admin); queda sin aviso `rehabilitar-llave` con `revocar_llaves` (candidato a OF13b-6).
- **Nombre del sitio.** A una familia el aparato le enseña «Cuarenta hazas» (no «… · Oficina»). Cuenta y nombre visible: el correo (decisión 185).
- **Sin `preferredAuthenticatorType`.** En `@simplewebauthn/server` 14.0.3, `localDevice` además fuerza `authenticatorAttachment: "platform"`, que dejaría fuera el teléfono por QR y las llaves físicas: no se usa.
- **Auditoría.** `llave.alta` (familia), `oficina.llave_alta` (oficina, el nombre de OF13), `llave.acceso` y `llave.acceso_fallido` (con `motivo`: `desconocida`, `usuario`, `reto`, `origen`, `rp_id`, `sin_verificacion`, `no_verificada`, `contador`…); nunca el id de credencial ni el correo. Un reto que falta o caducó no deja fila (no hay nada que atribuir).
- **Contador sin carreras.** El `UPDATE` del contador solo escribe si sube (o si sigue en 0 una llave sincronizada); dos entradas a la vez con el mismo contador no pasan las dos.
- **No probado:** solo pruebas de Node (`pruebas/unidad/llaves_acceso.test.ts` y `llaves.test.ts`, con una base de mentira y un autenticador simulado contra la verificación real). La integración con PostGIS (`pruebas/integracion/llaves_acceso.test.ts`) está **escrita sin ejecutar**. Ningún navegador ni autenticador real.

### OF13b-5 — la entrada sin sesión (`apps/api/src/auth/rutas.ts`, `almacen.ts`)
- **Respuesta JSON con `destino`, no un 303.** `POST /api/auth/llave` lo llama la portada con `fetch` tras `startAuthentication()`: devuelve `{ok, destino, primer_acceso, aparato?}` y el navegador navega a `destino` (`/finca/`, `/#bienvenida`, `/oficina/` o `/api/oficina/pendiente`). El texto del fallo único es «Esa llave no sirve aquí o no se pudo comprobar. Vuelve a intentarlo o entra con un enlace por correo.» (`401 llave_no_valida`), también para una respuesta mal formada (que gasta el reto igual). Sin la API de señales.
- **La llave tampoco hace de «segundo enlace».** `aparatoAlEntrar` aprobaba un aparato pendiente de ≥ 5 min al volver a entrar; con la llave eso no pasa (`porEnlace = false`): el pendiente sigue pendiente hasta otro aparato, un segundo **enlace** o la consola (decisiones 152 y 184).
- **Confirmación reciente solo con el aparato aprobado.** La entrada con llave pone `confirmada_en` si el aparato ya está aprobado; con el aparato pendiente, no (si se aprueba después desde otro aparato, la sesión sirve pero sin confirmación: hay que confirmar con la llave, como hoy).
- **Una sesión de llave solo vale con su llave viva**, en todas las cuentas (el CASE de `lee()`), además de que quitar la llave cierra sus sesiones: dos barreras.
- **`GET /api/sesion` dice `entrada`** (`enlace`, `llave` o `codigo`) para que la portada ofrezca crear una llave tras un enlace (OF13b-7).
- **Límites con su texto.** `GEMELO_LLAVE_OPCIONES_POR_IP` (30), `GEMELO_LLAVE_ENTRADAS_POR_IP` (20) y `GEMELO_LLAVE_VENTANA_MIN` (15); el 429 usa el texto de «demasiados intentos» del código corto, no el de los enlaces.
- **El tiempo de pedir un enlace (A7).** OF13b-1 halló que con cuenta se hacían dos escrituras más antes del 202. Contado con la base de mentira: **3 consultas con cuenta frente a 1 sin ella**; ahora **1 y la misma** en los dos casos (`creaEnlace` en un CTE: buscar, guardar el hash y auditar; sin cuenta no inserta). Se descartó «responder el 202 y trabajar en segundo plano»: unas veinte pruebas de integración leen el correo justo después del 202 y fallarían en carrera sin poder lanzarlas aquí. Queda la diferencia de dentro de la base (dos filas y el volcado del WAL al confirmar), **sin medir en tiempo real**; la acotan los límites (5 por correo y 10 por IP cada 15 min). Si se quiere cerrar del todo: segundo plano con un registro del fallo y una ayuda `esperaCorreo()` en las pruebas.
- **No probado:** solo Node (`pruebas/unidad/entrada_llave.test.ts`, con la app entera, la verificación real y una base de mentira que reproduce en JS la validez de una sesión; `pruebas/unidad/enlace.test.ts` para el recuento). La integración con PostGIS (`pruebas/integracion/entrada_llave.test.ts`) está **escrita sin ejecutar**. Ningún navegador ni autenticador real; sin interfaz (OF13b-7 y OF13b-8).

### OF13b-8 — la entrada de la oficina con llave (`apps/web/oficina`)
- **`/oficina/` sigue tras `forward_auth`: sin sesión no se sirve.** El estudio (§ 3.4) y el encargo suponían una pantalla de entrada dentro de la oficina, pero Caddy manda a la portada (303) a quien no tiene sesión de oficina, así que la **puerta de entrada real es la portada** (OF13b-7: `POST /api/auth/llave` y navegar a `destino`). La oficina trae aun así su pantalla `#pEntra` («Entrar con mi llave» y, debajo, «Recibir un enlace», que lleva a la portada, donde se pide el correo): se ve cuando `GET /api/oficina/sesion` da 401 (la sesión caducó con la página abierta, o una guarda más laxa), en vez de la redirección a la portada de antes. No se tocó Caddy ni el VPS.
- **Misma ceremonia que la portada, un solo texto de error.** `entraConLlave()` (`llave_puro.js`, con lo de fuera inyectado) aborta la ceremonia previa **antes** de pedir otras opciones (hallazgo de OF13b-5: la cookie del reto es una sola y una ceremonia vieja llegaría con el reto nuevo), pide `/api/auth/llave/opciones`, llama a `startAuthentication` y verifica en `/api/auth/llave`. Cualquier fallo de la api da «Esa llave no sirve aquí o no se pudo comprobar. Vuelve a intentarlo o entra con un enlace por correo.»; solo el 429 conserva su texto de límite y el aparato que cancela, el suyo. Se usa un `fetch` propio que **no redirige** en un 401 (el `api()` común manda a la portada).
- **Adónde va tras entrar.** `destinoTrasEntrada()`: `aparato: aprobado` → `/oficina/` (la sesión nace con `confirmada_en`: «sí, usaste tu llave hace poco», y las acciones delicadas no piden otra); `aparato: pendiente` → `/api/oficina/pendiente` (la llave no aprueba el aparato, decisión 184; la página existente dice cómo); sin aparato (cuenta de familia), el `destino` de la api si es una ruta del mismo origen. `cargaSesion` además lleva a la página de pendiente si `/api/oficina/sesion` dice `aparato.estado = pendiente`. Una sesión `entrada: llave` trae `llave_id`, así que `llaveRequerida` es falso y no sale la pantalla de la llave de OF13 (que queda para las sesiones de enlace).
- **Llaves nuevas, residentes, y el aviso de si lo son.** `POST /api/oficina/llaves/alta` responde ahora `{ id, nombre, descubrible }` y `GET /api/oficina/llaves` y `/api/admin/llaves` traen `descubrible` por llave. En Sistema → Llaves de acceso el alta explica «huella, cara o PIN»; si `descubrible` es falso, avisa (la llave no sirve para «Entrar con mi llave» sin correo) y el botón pasa a «Repetir el alta»; la lista marca «no sirve sin correo». Recordatorio de OF13b-3: `descubrible` es verdadero salvo que `credProps` diga `rk: false`, así que un aparato que no devuelve `credProps` y no la dejó residente aparecería como descubrible: el aviso es un dato del cliente, sin firmar.
- **No probado:** solo Node (`pruebas/guardianes/oficina_llave_entrada.test.js`: lógica pura, DOM y `fetch` de mentira). El recorrido en Chrome con el autenticador virtual de CDP (aparato aprobado → directo; aparato pendiente → su página), contra `infra/dev`/el servidor de pruebas, está **escrito sin ejecutar** (`GEMELO_DOCKER=1`; usa `/__prueba/sin-guarda/` de `oficina_servidor.ts`). Ni Windows Hello en Edge y Chrome, ni el gestor de contraseñas de Google, ni llave física, ni QR del teléfono, ni tableta, ni lector de pantalla.

### OF13b-7 — la portada (`apps/web/portada/llave_puro.js`, `llave_flujo.js`, `portada.js`)
- **Cargado perezoso.** La librería (`@simplewebauthn/browser`) y la lógica se piden con `import()` al abrir «Entrar», la portada con sesión o «Mis dispositivos»: el arranque de la portada sigue sin importar nada (guardián `avatar_portada`). Si la carga falla, la portada queda como estaba (solo el enlace).
- **Aborto antes de pedir opciones.** Cada intento (botón, autorrelleno, alta) llama a `WebAuthnAbortService.cancelCeremony()` **antes** de pedir otras opciones, y un contador descarta los resultados de intentos viejos. Un autorrelleno abortado o que falla antes de que la persona elija no enseña ningún error; si la persona eligió la llave y la api la rechaza, sí (el texto único de §3.2/OF13b-5, no el de «esa llave ya no sirve»: sin API de señales).
- **La oferta pide también un autenticador del aparato** (`platformAuthenticatorIsAvailable`, como dice §3.1) y **no se ofrece a cuentas de oficina o admin** (su llave tiene su pantalla y sus reglas, §3.4). El resto de condiciones, las del encargo: `entrada: "enlace"`, titular, sin primer acceso pendiente, `puede_anadir`. Se añade un tercer estado de recuerdo, `hecha`, que se guarda al crear la llave para no volver a ofrecerla en ese navegador cada vez que se entre con un enlace (el servidor no sabe en qué aparato está cada llave).
- **Dónde sale la oferta:** como tarjeta de la portada con sesión (no como pantalla propia) y solo tras terminar el primer acceso (normas, alias, avatar).
- **Mis llaves** vive en *Mis dispositivos*, que hace de «Configuración → Cuenta» de la portada; no se tocó la Configuración del motor. «Salir de todos y quitar las llaves» (§5.4) lo hizo OF13b-8b (viñeta del final).
- **Destino `/#bienvenida`** se resuelve dentro de la portada (relee la sesión y va a la ancla); los demás destinos se navegan con `location.assign` si son del propio sitio (`destinoSeguro`).
- **No probado:** solo Node (`pruebas/guardianes/portada_llave.test.js`: piezas puras, flujo con `fetch` y WebAuthn de mentira, estática). El recorrido con el autenticador virtual de CDP contra `infra/dev` está **escrito sin ejecutar** (`GEMELO_DOCKER=1`). Ni Chrome, ni llave real, ni lector de pantalla.

- **La oficina y las llaves de una familia (OF13b-6).** `GET/DELETE /api/admin/hogares/{id}/llaves[/{llaveId}]`, solo para **familias** (una cuenta de oficina responde el mismo `404` que una inexistente: sus llaves siguen en `/api/admin/llaves…` con la regla de la última), con el guardián `OFICINA` y **confirmación reciente en las bajas**; cierran las sesiones abiertas con esas llaves y la familia recibe **un correo que dice «la oficina»** (sin el nombre de quien actúa ni el motivo; el enlace del correo sigue sirviendo). `rehabilitar-llave` con `revocar_llaves` **ahora también avisa** (era el hueco de OF13b-4). El fallo del correo no tumba la operación: deja `admin.llave_aviso_fallido`. La ficha enseña las llaves de una cuenta de oficina en solo lectura (lo ve un admin) con la nota de las **no descubribles** («Esta llave no se guardó en el aparato…»). No probado: Chrome, tableta ni lector de pantalla; la integración con PostGIS (`pruebas/integracion/llaves_hogar.test.ts`) está escrita y sin ejecutar.

- **Salir de todos y quitar las llaves, y los huecos de «Mis llaves» (OF13b-8b).** Cierra lo que dejó abierto OF13b-7. `POST /api/yo/llaves/quitar-todas` con `{ "confirmar": true }` (forma estricta) cierra **todas** las sesiones de la cuenta, **la de quien pulsa incluida**, y revoca **todas** sus llaves, en una transacción con la cuenta bloqueada: auditoría `llave.quitadas_todas` y `sesion.todas_cerradas` (solo cuántas), **un solo correo** («Se han cerrado tus sesiones y quitado tus llaves de acceso») y la cookie borrada. Decisión: ruta propia y no un parámetro de `salir-todas`, porque ésta se queda como está (solo sesiones, `204`, la usa la oficina) y la acción destructiva tiene su cuerpo, su límite de llaves y su permiso (solo familias con sesión titular: `403 solo_titular` desde gafas y `403 cuenta_de_oficina`: la oficina no se queda sin llaves por aquí, la rehabilita un admin). En la portada, **Mis dispositivos → ¿Has perdido un aparato?** tiene los dos botones, el de siempre diciendo que no quita llaves, y el nuevo con `<dialog>` nativo (foco en «No, volver»), el texto de que el enlace del correo sigue siendo la entrada y se puede crear otra llave, y el aviso en vivo si falla (la sesión sigue abierta). Al terminar se borra el recuerdo «hecha» de este navegador (para volver a ofrecer la llave) y se respeta «Este aparato no es mío». **Si falla la lista de llaves**, ya no desaparece: «No hemos podido leer tus llaves. Prueba otra vez.» con «Probar otra vez»; el **429 de la lista** tiene su texto propio y neutro (límite por IP de 60 por minuto con `createRateLimit`, ya no el texto de los enlaces). **Probado solo en Node:** `apps/api/pruebas/unidad/llaves_yo.test.ts` (401, 403 sin Origin y desde gafas y oficina, 400 de forma, límite, sesiones y llaves, un correo, auditoría limpia, volver a entrar y crear llave), `pruebas/guardianes/portada_dom.test.js` (portada.js y la librería reales con un DOM, `fetch` y `navigator.credentials` de mentira, un proceso por escenario) y `portada_llave.test.js`. **Escrito sin ejecutar:** la integración con PostGIS (`pruebas/integracion/llaves_yo.test.ts`, el caso de la salida total) y el paso 7 del recorrido de Chrome con autenticador virtual. **No probado:** Windows Hello, iPhone, Android, lector de pantalla, ni un SMTP real.
