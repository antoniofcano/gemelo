# Auditoría de la api — lente de seguridad y contratos (hueco de noviembre de 2026)

Revisor de solo lectura, rama `main` en `d722f3dd` (2026-11-14). No se ejecutó nada (ni pruebas, ni build, ni Chrome, ni Docker): solo lectura de código, migraciones, contratos e infra. No se copia aquí ningún secreto, correo, IP ni dato de la explotación.

## Resumen

1. **Sin críticos ni altos confirmados.** La base es sólida y uniforme: cookie `__Host-gemelo` (httpOnly, Secure, SameSite=Lax), rotación con `regenerate()` en las tres entradas, tokens de 256 bits guardados como SHA-256, caducidad absoluta e inactividad en SQL, comprobación de Origin en todo método que cambia estado, validación ajv estricta (`additionalProperties: false`, sin quitar en silencio), SQL siempre parametrizado, geometrías del usuario validadas antes de llegar a `ST_GeomFromGeoJSON` y errores genéricos hacia fuera.
2. **El hallazgo principal (MEDIO, A-01) es `DELETE /api/yo`.** Solo pide sesión. Se salta tres reglas que el resto de la api cumple: «solo titular» (unas gafas vinculadas no pueden ni quitar una llave, pero sí borrar la cuenta entera), la confirmación reciente de la oficina y la guarda «último admin». Por esa ruta, unas gafas de la oficina, que entran como visitante según el ADR-0028, pueden borrar la cuenta admin.
3. **Desde las mismas gafas, `GET /api/yo/datos` (MEDIO, A-02)** descarga los datos de la cuenta de la oficina, correo incluido. Basta con teclear la URL.
4. **Dos rutas antiguas de `admin/rutas.ts` (MEDIO, A-03 y A-04)** no aplican las reglas que sí aplican sus equivalentes de OF2:
   - `revocar` no veta que una cuenta oficina cierre las sesiones de un admin;
   - `PUT /api/admin/hazas/:id/hogar` no comprueba si la cuenta está de baja ni respeta «una haza por hogar».
5. **Migraciones, respaldo y CI, bien:**
   - mínimo privilegio con `auditoria` solo-añadir;
   - copias cifradas con age a clave pública, subidas como inmutables;
   - el workflow solo tiene `contents: read`, usa `pull_request` (no `_target`) y comprueba la suma de gitleaks.

   Quedan solo detalles de defensa en profundidad (bajos).

Recuento: **0 críticos · 0 altos · 4 medios · 8 bajos.**

## Rutas revisadas y su guarda

Leyenda de guardas:
- `S` = `requiereSesion`: cualquier sesión válida; una cuenta de oficina además necesita su aparato aprobado y, si es obligatoria, su llave.
- `T` = solo titular: rechaza `origen = 'vinculo'` dentro de la ruta o con `soloTitular`.
- `O` = `OFICINA` (rol oficina o admin).
- `OC` = `O` + confirmación reciente.
- `A` = `requiereRol("admin")`.
- `AC` = `A` + confirmación reciente.
- `—` = sin sesión, a propósito.

Todas las rutas que cambian estado pasan además la comprobación de Origin (salvo las dos exentas, que se indican).

| Grupo (fichero) | Rutas | Guarda | IDOR / notas |
|---|---|---|---|
| auth (`auth/rutas.ts`) | `POST /api/auth/enlace`, `GET`/`POST /api/auth/entrar`, `POST /api/auth/llave/opciones`, `POST /api/auth/llave`, `POST /api/auth/vincula`, `POST /api/auth/vincula/sondeo` | — + límites por IP y por correo | respuesta idéntica exista o no la cuenta; el GET no gasta el enlace |
| sesión | `GET /api/sesion`, `POST /api/sesion/salir-todas` | S | el hogar sale de la sesión |
| sesión | `POST /api/sesion/salir` | — | sin efecto si no hay sesión |
| interno | `GET /api/interno/autoriza` | — (para Caddy) | el Caddy interno responde 404 a `/api/interno/*` desde fuera |
| salud | `GET /api/salud` | — | sin versiones |
| salud | `POST /api/csp-informe` | — y **exenta de Origin**, 8 KB, 30/min | |
| yo (`yo/rutas.ts`) | `PUT normas`, `GET`/`PUT avisos`, `PUT alias`, `GET`/`PUT avatar` | S | id de la sesión |
| yo | `POST dispositivos/vincular` | S + T + límites | |
| yo | **`GET /api/yo/datos`, `DELETE /api/yo`** | **S (sin T)** | **A-01, A-02** |
| yo/llaves (`yo/llaves_rutas.ts`) | GET, opciones, alta, baja, quitar-todas | S; alta, baja y quitar-todas con T | 404 igual para la llave ajena |
| hazas (`hazas/rutas.ts`) | `GET /api/hazas`, `GET /api/hazas/:id` | S | lista blanca y esquema de respuesta del contrato; titular solo como alias visible |
| vida (`vida/rutas.ts`) | `GET /api/hazas/:id/olivos`, `GET /api/medios/:clave`, `POST /api/personalizaciones/:id/denuncias` | S | el medio solo se sirve si es tuyo, si está visible o si pide la oficina; CSP sandbox |
| vida | `POST /api/medios`, `PUT`/`DELETE /api/olivos/…`, `…/decoracion`, `POST /api/hazas/:id/sugerencias` | T (sesión comprobada en `onRequest`, antes del cuerpo) + límites por IP y por hogar | olivo dentro de una haza del hogar; medio del propio hogar |
| vida (oficina) | `GET /api/admin/bandeja`, `POST …/bandeja/:id/estado`, `POST …/personalizaciones/:id/retirar`, `POST …/decoracion/retirar` | O | |
| bandeja (`admin/bandeja.ts`) | resumen, restaurar, preguntas, responder, avisos a un hogar | O | textos con patrón sin controles |
| familias (`admin/familias.ts`) | lista, alta, PATCH, enlace, baja, reactivar, exportar | O, y `vetado()` para cuentas de oficina | |
| familias | `DELETE /api/admin/hogares/:id` | OC + correo escrito + no a ti mismo + último admin | |
| familias | `GET …/hogares/:id/sesiones`, `PUT …/hogares/:id/haza` | O **sin `vetado()`** | A-10 |
| familias | `DELETE /api/admin/sesiones/:id` | O, con veto oficina → admin | |
| llaves de familia (`admin/llaves_hogar.ts`) | GET | O | solo cuentas de familia |
| llaves de familia | DELETE | OC + límites | solo cuentas de familia |
| admin antiguo (`admin/rutas.ts`) | `POST /api/admin/hogares/:id/revocar` | O **(se llama `soloAdmin`, pero es O)** | **A-03** |
| admin antiguo | `PUT /api/admin/hazas/:id/hogar` | O | **A-04** |
| admin antiguo | `POST /api/admin/sincronia` | O | documentado así en OFICINA.md |
| hazas de oficina (`admin/hazas.ts`) | GET, crear, geom, partir, versiones, volver | O | PostGIS valida, versión optimista |
| hazas de oficina | juntar, borrar | OC | juntar rechaza titulares distintos |
| contorno (`admin/contorno.ts`) | `GET …/limite` | O | |
| contorno | `PUT`/`DELETE …/contorno` | AC, 4 MB, ≤ 50 000 vértices | A-08 |
| olivos de oficina (`admin/olivos.ts`) | `GET /api/admin/olivos/:finca/:copas_id` | O | sin correo |
| sistema (`admin/sistema.ts`) | sistema, auditoría, correo de prueba | O | auditoría sin correos |
| sistema | rehornear | AC | |
| oficina (`oficina/rutas.ts`) | `GET /api/oficina/sesion`, `GET /api/oficina/pendiente` | comprobación manual de rol | |
| oficina | `POST /api/oficina/confirmar` | O | |
| oficina | aparatos (lista, revocar) | O | veto admin en revocar |
| oficina | aparatos (aprobar) | OC | |
| llaves de oficina (`oficina/llaves_rutas.ts`) | alta, entrada, gestión | guarda propia, O, OC | |
| llaves de oficina | `/api/admin/llaves…`, `rehabilitar-llave` | A, AC | |
| config (`config/rutas.ts`) | `GET /api/config` | S | «en prueba» solo para una sesión de oficina |
| config | `/api/admin/config…` | A; publicar y volver, AC | validado contra el contrato, 32 KB |
| agenda (`agenda/rutas.ts`) | `/api/admin/eventos…` | O | inscritos sin correo |
| agenda | `GET /api/agenda`, `GET /api/agenda/:id/evento.ics` | S | |
| agenda | `POST`/`DELETE /api/agenda/:id/inscripcion` | S + T + límite por hogar | |
| avisos (`avisos/rutas.ts`) | `GET`/`POST /api/avisos/baja` | — con HMAC (comparación de tiempo constante); POST **exento de Origin** | |
| avisos | `GET /api/avisos`, `POST /api/avisos/:id/leido` | S | `hogar_id` de la sesión |
| juegos (`juegos/rutas.ts`) | partidas, récords, clasificación | S | sin id ni correo; alias solo si es visible |
| medidas (`medidas/rutas.ts`) | `POST /api/medidas` | S | sin hogar ni IP en la fila |
| medidas | `GET /api/admin/medidas` | O | |
| mundo, OT, Vigía | `GET /api/mundo/hoy`, `GET /api/ot/hoy`, `GET /api/tiempo`, `GET /api/tiempo/historico` | S | esquema de respuesta del contrato |
| presencia (`presencia/rutas.ts`) | `GET /api/presencia`, `POST /api/presencia/token` | S | expulsados; la sala «visita» ligada solo para apuntados |
| presencia | `POST /api/admin/presencia/expulsar` | O | |
| voz guiada (`presencia/voz_rutas.ts`) | token, mano, consentimiento | S; papel por `decideGuiada` (guía asignado, oficina o familia apuntada) | |
| voz guiada | palabra, silenciar, expulsar, visita, cerrar | S + `moderable` (guía del evento u oficina; las gafas de la oficina no heredan) | solo actúa sobre familias apuntadas |
| voz guiada | `PUT /api/admin/eventos/:id/guia` | O | solo cuentas guía, oficina o admin |
| corros (`presencia/corro_rutas.ts`) | invitaciones, token, bloqueos, avisos | S | identidad opaca resuelta en el servidor |
| corros (oficina) | `/api/admin/voz/…` | O | |
| oficina en el mundo (`presencia/oficina_mundo.ts`) | anuncio, llevar, participantes, balizas | O | |
| oficina en el mundo | `GET /api/balizas-oficiales` | S | |

## Hallazgos

[MEDIO] A-01 · apps/api/src/yo/rutas.ts:153-160 — **Defecto:** `DELETE /api/yo` borra la cuenta y, en cascada, todo lo suyo con solo `requiereSesion`. Le faltan tres comprobaciones:
- **titular** (`origen = 'vinculo'`): la decisión 96 la aplica en vida, agenda y las cuatro rutas de llaves (`yo/llaves_rutas.ts:135` y `:158` niegan a unas gafas incluso quitar una llave), pero no aquí;
- **confirmación reciente** para cuentas de oficina, que `oficina/acceso.ts:55-58` promete para «lo delicado (borrar una familia…)»;
- **«no a ti mismo» y «último admin»**, que `admin/familias.ts:307-308` aplica al borrar por la oficina.

**Escenario:**
- La oficina vincula unas gafas con el código corto para que una visita pasee como visitante (ADR-0028). En ellas la sesión es de la cuenta admin con rol efectivo `hogar`, y `requiereSesion` la deja pasar.
- Un `DELETE /api/yo` desde esas gafas, con el Origin del sitio, borra la cuenta admin. Con ella se van, sin vuelta atrás, sus llaves y sus aparatos, y la auditoría queda sin autor (FK `ON DELETE SET NULL`).
- Si era la única cuenta admin, nadie puede volver a cambiar roles sin la consola de la base.
- Lo mismo vale para unas gafas de familia (las que usan los nietos): borran la cuenta de la familia, con sus fotos, nombres de olivos, partidas e inscripciones.

**Condición:** hoy ninguna pantalla del cliente llama a `DELETE /api/yo` (lo busqué en `apps/web`). Hace falta, pues, una petición hecha a mano desde el navegador de las gafas, o un XSS del mismo origen (L9-03). Por eso es medio y no alto. Sube a alto el día que exista un botón «Borrar mi cuenta» visible en las gafas.

**Cómo se comprobó:** leí la ruta (`yo/rutas.ts:153-160`), la guarda (`oficina/acceso.ts:29-33`), el rol efectivo (`auth/almacen.ts:63-65` y `:130`), las guardas equivalentes (`vida/rutas.ts:49-53`, `agenda/rutas.ts:345` y `:380`, `yo/llaves_rutas.ts:135` y `:158`, `admin/familias.ts:297-315`) y las FK de las migraciones (`0005_oficina.sql:22`, `0013_llaves_oficina.sql:15`).

**Por qué no lo ve ninguna prueba:** `vinculo_oficina.test.ts:101-118` solo prueba que las gafas no entran en `/api/admin`, `/api/oficina` ni `/oficina/`. `api.test.ts:566` borra con una sesión de enlace. Ninguna prueba borra con una sesión `vinculo` ni con una cuenta admin.

[MEDIO] A-02 · apps/api/src/yo/rutas.ts:142-150 (y yo/datos.ts:8) — **Defecto:** `GET /api/yo/datos` se sirve a cualquier sesión, también a unas gafas vinculadas. Devuelve:
- el correo de la cuenta;
- sus sesiones con sus fechas;
- sus aparatos vinculados;
- los nombres de sus llaves;
- sus avisos de voz.

**Escenario:** una visita con las gafas de la oficina (ADR-0028: «visitante, nada de oficina») teclea `/api/yo/datos` en la barra del navegador de las Quest. Es un GET de la misma web, así que no hace falta Origin. Recibe un JSON con el correo de la cuenta de oficina o admin que vinculó las gafas y su actividad.

Desde las mismas gafas también pueden (bajo):
- cambiar el alias de esa cuenta (`PUT /api/yo/alias`);
- cerrar todas sus sesiones (`POST /api/sesion/salir-todas`).

**Cómo se comprobó:** leí la ruta, la consulta de `datosDelHogar` y la guarda `requiereSesion`. El contrato (`contratos/sesion.md:31`) dice que la sesión de las gafas no lleva «nada de oficina», pero ninguna ruta de `/api/yo` mira `origen`.

**Por qué no lo ve ninguna prueba:** `vinculo_oficina.test.ts` no pide `/api/yo/*` con las gafas.

[MEDIO] A-03 · apps/api/src/admin/rutas.ts:21 y :31-35 — **Defecto:** la guarda de `POST /api/admin/hogares/:id/revocar` se llama `soloAdmin`, pero vale `OFICINA`, y la ruta no aplica `vetado()`. Las rutas hermanas sí limitan lo que una cuenta oficina puede hacer a un admin: `DELETE /api/admin/sesiones/:id` (`familias.ts:212`), la baja (`familias.ts:250`) y revocar un aparato admin (`oficina/rutas.ts:121`). La regla escrita es «tocar una cuenta de oficina es cosa de admin» (`familias.ts:55`).

**Escenario:** una persona con rol `oficina` (o su aparato robado con la sesión viva) cierra en bucle todas las sesiones de la cuenta admin. El admin queda fuera mientras dure (denegación de servicio entre el personal), y lo único que lo frena es la auditoría.

**Cómo se comprobó:** leí la ruta y la comparé con sus hermanas.

**Por qué no lo ve ninguna prueba:** `vinculo_oficina.test.ts:160` usa `/revocar` con la sesión de Antonio (admin); ninguna prueba lo intenta con una cuenta oficina contra un admin.

[MEDIO] A-04 · apps/api/src/admin/rutas.ts:37-50 — **Defecto:** `PUT /api/admin/hazas/:id/hogar` asigna una haza a cualquier `hogar_id` existente, y le faltan tres reglas que sí aplica la ruta gemela `PUT /api/admin/hogares/:id/haza` (`familias.ts:225` y `:236-238`):
- no mira si la cuenta está de baja (`activo`);
- no suelta las otras hazas de ese hogar (decisión 91: un hogar tiene su haza);
- no aplica `vetado()`.

OFICINA.md y la cabecera de `admin/hazas.ts:14` dicen que la ficha usa las dos.

**Escenario:** la oficina asigna desde la ficha de una haza una cuenta que está de baja. Como lo visible cuelga de `p.hogar_id = h.hogar_id` (`vida/rutas.ts:82` y `:99`), las fotos y nombres que esa familia colgó, ocultos «al momento» por la baja (decisión 108), vuelven a verse para todas las familias, y con ellos sus fotos en `/api/medios`. La familia no ha vuelto, y su contenido seguirá visible hasta que la purga borre la cuenta a los 30 días. Una familia activa, en cambio, puede acabar con dos hazas.

**Cómo se comprobó:** leí las dos rutas y las consultas de visibilidad.

**Por qué no lo ve ninguna prueba:** las pruebas de baja (`familias.test.ts`) usan la ruta de OF2. No hay ninguna que asigne por `/api/admin/hazas/:id/hogar` una cuenta de baja.

[BAJO] A-05 · apps/api/src/auth/rutas.ts:80, oficina/rutas.ts:80, admin/familias.ts:137, admin/sistema.ts:131 — **Defecto:** cuando falla el SMTP se registra `error: e.message`. La redacción de `registro.ts:6-9` tapa las claves `correo`, `token` y `clave`, pero no `error`. Un servidor SMTP que rechaza al destinatario suele citar la dirección en el mensaje, y nodemailer la copia en `e.message`. — **Escenario:** el registro del VPS acaba guardando el correo de un hogar, en contra de «registros sin correos». — **Cómo se comprobó:** lectura. — **Por qué no lo ve ninguna prueba:** las pruebas usan el buzón de mentira, que no falla con texto real.

[BAJO] A-06 · apps/api/src/app.ts:56-60 — **Defecto:** el comentario dice «solo JSON (y formulario en /api/auth/entrar)», pero `@fastify/formbody` se registra en toda la app: cualquier ruta acepta `application/x-www-form-urlencoded`, un tipo «simple» de CSRF. — **Escenario:** hoy no se explota, porque la comprobación de Origin para todo POST, PUT y DELETE. Si alguna vez se exime otra ruta de Origin (como `/api/avisos/baja`), un formulario de otro sitio podría usarla. — **Cómo se comprobó:** lectura; no hay ninguna restricción de tipo por ruta. — **Por qué no lo ve ninguna prueba:** no hay prueba de tipo de contenido por ruta.

[BAJO] A-07 · apps/api/src/config.ts:136-138; auth/vinculo.ts:38; avisos/correo.ts:32-37 — **Defecto:** el secreto de sesión firma también los HMAC de los códigos de vínculo y la firma de baja de los correos (reutilizar una clave para tres fines). — **Escenario:** rotar el secreto de sesión tras un incidente invalida todos los enlaces de baja ya enviados. Quien obtenga el secreto puede, además de firmar cookies, dar de baja de los correos a cualquier hogar. — **Cómo se comprobó:** lectura. — **Por qué no lo ve ninguna prueba:** es diseño, no regresión.

[BAJO] A-08 · apps/api/src/admin/contorno.ts:131 — **Defecto:** el 400 devuelve `motivo` con hasta 200 caracteres del mensaje de error de PostgreSQL/PostGIS. — **Escenario:** solo lo ve un admin con confirmación reciente, pero enseña detalles internos (nombres de función y tipos). Contradice «los errores no filtran detalles internos» (`app.ts:93-100`). — **Cómo se comprobó:** lectura. — **Por qué no lo ve ninguna prueba:** `contorno_finca.test.ts` comprueba el código, no el texto.

[BAJO] A-09 · .github/workflows/puerta.yml:17, :33, :37 — **Defecto:** las acciones se fijan por etiqueta (`@v4`, `@v5`), no por hash de commit. La suma de gitleaks se baja de la misma publicación que el binario. — **Escenario:** si se reescribe la etiqueta de una acción, se ejecuta código ajeno en CI. El daño queda acotado: `contents: read`, sin secretos y sin despliegue. — **Cómo se comprobó:** lectura. — **Por qué no lo ve ninguna prueba:** `ci_gitleaks.test.js` vigila gitleaks, no las acciones.

[BAJO] A-10 · apps/api/src/admin/familias.ts:192-205 y :219-244 — **Defecto:** `GET …/hogares/:id/sesiones` y `PUT …/hogares/:id/haza` no aplican `vetado()`. Una cuenta oficina ve las sesiones y los aparatos de un admin y puede asignarle una haza. — **Escenario:** información y cambios menores entre el personal. — **Cómo se comprobó:** lectura comparada con el resto del fichero. — **Por qué no lo ve ninguna prueba:** no hay prueba oficina → admin para estas dos rutas.

[BAJO] A-11 · apps/api/migraciones/0018_voz_consentimiento.sql:18-31 (y 0025:79-94) — **Defecto:** `purga_auditoria_voz(corte)` es `SECURITY DEFINER` y acepta cualquier `corte` que le pase la api. Con la api comprometida, puede borrar al momento toda la auditoría de voz, no solo la que pasó de plazo. Así se rompe el «solo-añadir» para esas acciones. — **Escenario:** defensa en profundidad tras una intrusión en la api. — **Cómo se comprobó:** lectura. — **Por qué no lo ve ninguna prueba:** `retencion_campana.test.ts` prueba el uso correcto. Arreglo posible: que la función calcule el corte mínimo ella misma.

[BAJO] A-12 · apps/api/src/admin/rutas.ts:21 (también vida/rutas.ts:8 y :311) — **Defecto:** la constante `soloAdmin` vale `requiereRol("oficina", "admin")`, y la cabecera de `vida/rutas.ts` dice «bandeja y retirar: rol admin». Lo que hace el código está documentado en OFICINA.md, pero el nombre engaña a quien lea o cambie la ruta (A-03 nace en parte de ahí). — **Cómo se comprobó:** lectura. — **Por qué no lo ve ninguna prueba:** es un nombre.

## Comprobado sin hallazgo (para no repetirlo)

- **Enlace mágico:**
  - token de 32 bytes, guardado como SHA-256 y de un solo uso, con `UPDATE … RETURNING` atómico;
  - 15 min;
  - el GET intermedio no lo gasta;
  - límite por IP y por huella del correo;
  - la misma respuesta y una sola sentencia exista o no la cuenta;
  - la URL se registra sin la consulta.
- **Sesión:**
  - caducidad absoluta, por inactividad, por revocación y por hogar inactivo, todo en SQL (`auth/almacen.ts:104-121`);
  - la oficina exige aparato aprobado y, si es obligatoria, llave;
  - la sesión de las gafas de la oficina, como `hogar` con 12 h y 2 h;
  - un cambio de rol, la baja o el borrado revocan las sesiones.
- **Código de vínculo:** HMAC del código, 5 min, límite por IP y por hogar, 404 indistinguible, y unas gafas no aprueban otras.
- **IDOR:** todas las rutas de hogar sacan el `hogar_id` de la sesión. Los ids del cuerpo o de la ruta se cruzan con el hogar:
  - el olivo, dentro de una haza suya;
  - el medio, suyo;
  - la sugerencia, sobre su haza;
  - el aviso leído, suyo;
  - la llave, suya;
  - la inscripción, suya.

  `GET /api/medios/:clave` solo sirve lo visible, lo propio o a la oficina, con CSP sandbox y `nosniff`.
- **Subida de fotos:**
  - sesión comprobada en `onRequest`, antes del cuerpo;
  - tipo comprobado por el contenido;
  - tope de píxeles;
  - se vuelve a codificar a WebP con sharp, sin EXIF, GPS, ICC ni XMP;
  - nombre al azar de 128 bits con `wx`.
- **SQL:** todo parametrizado. Las únicas concatenaciones son de constantes del código (`admin/hazas.ts:133`, `vivo` en `vinculo.ts`, `MAX_AVISOS_MUNDO`). `ILIKE` escapa `%`, `_` y `\`.
- **PostGIS:** el GeoJSON de la oficina pasa por un esquema ajv cerrado (Polygon o MultiPolygon, anillos, máximo de vértices), por `compruebaGeometria` (caja UTM 30N, anillos cerrados) y por `ST_IsValid`; los errores se contestan con un 400.
- **Proyección pública:**
  - ficha de haza con lista blanca y esquema de respuesta del contrato;
  - clasificación sin ids ni correos;
  - agenda e inscritos sin correo;
  - `olivoPublico` con lista blanca;
  - el token de LiveKit sin correo ni id de la base (identidad HMAC).
- **LiveKit:**
  - salas fijas con nombre adivinable, pero solo la api firma tokens;
  - `canUpdateOwnMetadata` en false y sin `roomAdmin`;
  - la sala guiada solo para el guía asignado, la oficina o las familias apuntadas;
  - la moderación (palabra, silenciar, expulsar, cerrar, visita) solo para el guía del evento o la oficina, y solo sobre familias apuntadas;
  - la sala «visita» ligada solo para apuntados;
  - la reutilización del JWT ya está tratada (L9-06 y su centinela).
- **Base de datos:**
  - `gemelo_api` sin DDL ni CREATE en `public`;
  - `auditoria` solo SELECT e INSERT;
  - versiones de config y de hazas sin DELETE;
  - `fincas_contorno` y balizas con UPDATE por columna;
  - medidas y juegos solo SELECT e INSERT.
- **Respaldo:** `pg_dump | age` (nada sin cifrar en disco), clave pública en el VPS, `umask 077`, `rclone --immutable` y comprobación de la subida; fotos cifradas igual.
- **CI:** `permissions: contents: read`, `pull_request` (no `_target`), gitleaks sobre todo el historial con la suma comprobada.

## No verificable sin ejecutar

- Si nodemailer y el SMTP real de producción meten el correo del destinatario en `e.message` (A-05).
- Si el navegador de las Quest permite a alguien sin cable de depuración lanzar un `fetch` DELETE con el Origin del sitio. Es lo que separa A-01 de un alto.
- Los saltos reales de proxy en el VPS (`GEMELO_API_PROXIES = 2`) y que `X-Forwarded-For` no se pueda falsear; de eso dependen todos los límites por IP. El almacén de los límites es la memoria: se pierde al reiniciar.
- Que el despliegue use de verdad el `infra/Caddyfile` con `handle /api/interno/* { respond 404 }`.
- Que la migración la aplique de verdad el rol dueño y que la api conecte como `gemelo_api` en producción (con el usuario dueño, los GRANT no protegerían nada).
- El comportamiento de LiveKit 1.13.11 con tokens reutilizados (heredado de L9-06).

## No revisado

- `apps/api/src/ot/*` (sincronía con OlivarTrack, mapeo), `vigia/*`, `mundo/hoy.ts`, `vivo/*`: solo vi sus rutas y guardas.
- `presencia/corro.ts`, `cercania.ts`, `reingreso.ts`, `oficina_mundo.ts` y `voz.ts` en detalle: vi las rutas y las decisiones de papel, no la lógica de corros ni los cuerpos de anuncio y balizas.
- `oficina/llaves.ts` y `llaves_rutas.ts` (WebAuthn): ya los revisó L9; aquí solo vi las guardas.
- `auth/correo.ts` y `avisos/correo.ts` (cabeceras del correo, escapado del HTML; solo vi `esc` y `sinSaltos`), `auth/paginas.ts`, `agenda/ics.ts` (inyección en el ICS: no comprobado), `config/valida.ts`, `admin/hornero.ts` y `admin/olivos.ts` por dentro.
- Las 27 migraciones una a una: solo GRANT, REVOKE, `SECURITY DEFINER` y las FK hacia `hogares`.
- `infra/ensayar-restauracion.sh`, el temporizador de systemd, la retención de las copias remotas (las cuentas borradas por RGPD siguen en las copias hasta que caducan) y si se cifra el estado de rclone.
- Dependencias npm (CVE): no se ejecutó `npm audit`.
- La EIPD y los documentos de roles como textos legales; `ARQUITECTURA-MULTIUSUARIO.md` (solo lo que cito de `contratos/sesion.md` y OFICINA.md).
- El contraste ruta a ruta con `contratos/api.openapi.yaml`: existe un guardián que compara las rutas registradas; aquí solo crucé `/api/yo`, `/api/yo/datos` y `/revocar`.
