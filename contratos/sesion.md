# Contrato: enlace mágico, código corto y sesión (F1a)

Decisión y alternativas: [ADR-0013](../doc/adr/0013-enlace-magico-y-sesiones.md). Rutas: [api.openapi.yaml](api.openapi.yaml). Código: `apps/api/src/auth/`. Lo comprueban `apps/api/pruebas/integracion/api.test.ts` (contra PostGIS en contenedor) y `apps/api/pruebas/unidad/`.

## Enlace

| Qué | Valor |
|---|---|
| Token | 256 bits al azar, base64url (43 caracteres) |
| Se guarda | solo su SHA-256 (`tokens_acceso.hash`); en claro existe únicamente en el correo |
| Caduca | 15 minutos |
| Usos | uno; el canje es atómico (`UPDATE … WHERE usado_en IS NULL RETURNING`): dos canjes a la vez → entra uno |
| Pedirlo | `POST /api/auth/enlace {correo}` → **202 con el mismo texto** exista o no la cuenta (no se puede sondear quién tiene acceso) |
| Límites | por IP (por defecto 10) y por correo (3) en 15 min; el 429 lleva el mismo texto para cualquier correo |
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
| 2. Aprobarlo (aparato con sesión) | `POST /api/yo/dispositivos/vincular {codigo, aprobar}` → 204; **404 con el mismo texto** si no existe, caducó o ya se decidió (no enumerable); `aprobar: false` lo rechaza |
| 3. Sondear (gafas) | `POST /api/auth/vincula/sondeo {sondeo}` cada 3 s → `esperando` / `rechazado` / `caducado` (también un secreto inventado) / `aprobado`; al verlo aprobado se **gasta de forma atómica** (dos sondeos a la vez: entra uno) y abre una **sesión nueva para las gafas** (la misma cookie y las mismas reglas que el enlace: rotación, 30/7 días, revocable), con `primer_acceso` |
| Límites | códigos por IP (10 / 15 min), intentos de aprobar por hogar (5 / 15 min) y por IP (10 / 15 min), sondeos por IP (60 / min); el 429 dice «Demasiados intentos seguidos…»; configurables (`GEMELO_VINCULO_*`, `infra/entorno.ejemplo`) |
| Auditoría | `vinculo.pedido` (sin hogar), `vinculo.aprobado`, `vinculo.rechazado`, `vinculo.fallido` (intento con un código que no sirve, con el hogar que lo tecleó), `vinculo.usado`; nunca el código |
| CSRF | los tres son POST con `Origin` del sitio, como el resto |
| Riesgo que queda | **suplantación por engaño**: si alguien convence a un hogar de teclear un código que no ve en sus propias gafas, ese alguien entra con la cuenta del hogar. La pantalla de aprobar lo avisa («Escribe solo el código que ves ahora en tus gafas»); el hogar puede cerrar todas sus sesiones. Un hogar desactivado no abre sesión aunque el código estuviera aprobado |
| RGPD | `GET /api/yo/datos` incluye `aparatos_vinculados` (cuándo se pidió, aprobó y usó); borrar el hogar arrastra sus códigos; `purga` quita los caducados hace más de un día |

## Primer acceso

`hogares.normas_version`, `normas_aceptadas_en` y `avisos_correo` (migración `0002`). Versión vigente: `NORMAS_VERSION = 1` (`apps/api/src/auth/servicio.ts`). `GET /api/sesion` dice `primer_acceso: true` mientras el hogar no haya aceptado la versión vigente (`PUT /api/yo/normas {version, avisos_correo}`; otra versión → 409). Al entrar con el enlace, el formulario va a `/#bienvenida` (primer acceso en la portada) o, si ya está, a `/finca/`. El mundo (`/finca/`) **no** exige todavía el primer acceso: lo pide la portada.

## Sesión

| Qué | Valor |
|---|---|
| Cookie | `__Host-gemelo`; `HttpOnly; Secure; SameSite=Lax; Path=/`, sin `Domain`; firmada (`GEMELO_SESION_SECRETO`) |
| Se guarda | en Postgres (`sesiones`), por el SHA-256 de su id; nunca el id en claro |
| Rotación | cada entrada (enlace o código corto) crea una sesión nueva y revoca la que trajera el navegador |
| Caducidad | absoluta 30 días; por inactividad 7 días (configurables) |
| Revocación | inmediata en la base: salir, salir de todas, la oficina (`/api/admin/hogares/{id}/revocar`), hogar desactivado o borrado |
| CSRF | `SameSite=Lax` + comprobación de `Origin` en todo POST/PUT/DELETE (salvo `/api/csp-informe`) + sin `text/plain` |
| Roles | `hogar`, `guia`, `corresponsal`, `oficina`, `admin` (los dos últimos son de oficina: ver [§ Oficina](#oficina)) |
| Origen (titular) | cada sesión guarda de dónde nació (`sesiones.origen`, migración 0004): `enlace` (el adulto titular) o `vinculo` (un aparato vinculado con el código corto). `GET /api/sesion` lo da como `titular: true/false`; solo una sesión de titular cuelga contenido (decisión 96, [vida.md](vida.md)) |
| Estáticos | `/finca/` y `/teselas/` piden sesión al Caddy interno (`forward_auth` → `/api/interno/autoriza`, cerrada desde fuera) |

## Oficina

Decisión: [ADR-0024](../doc/adr/0024-la-oficina-roles-acceso-y-configuracion-versionada.md) (decisiones 104-106); diseño: [OFICINA.md §2](../doc/sistema/OFICINA.md#2-acceso-y-seguridad). Migración `0005`; código: `apps/api/src/oficina/` (`acceso.ts`: las guardas; `aparatos.ts`; `rutas.ts`). Lo comprueban `apps/api/pruebas/integracion/oficina.test.ts` y `apps/api/pruebas/unidad/oficina.test.ts`.

| Qué | Valor |
|---|---|
| Cuentas | rol `oficina` (día a día) o `admin` (además parámetros, roles, re-hornear); cada una con su correo, aparte de cualquier hogar. Dar de alta o borrar una cuenta de oficina: solo `admin`, con confirmación reciente |
| Entrar | el mismo enlace mágico; al gastarlo, la api mira el **aparato** (cookie `__Host-gemelo-aparato`: secreto de 256 bits, `HttpOnly; Secure; SameSite=Strict; Path=/`, un año; en la base, `aparatos_oficina.hash` = su SHA-256). Aparato aprobado → `303 /oficina/`; nuevo o pendiente → `303 /api/oficina/pendiente` (JSON: `aparato: "pendiente"`) |
| Aparato pendiente | la sesión existe pero **no sirve**: todo lo que pide sesión da `403 aparato_pendiente` (también `/api/sesion`, las hazas, el token de LiveKit y el mundo); solo valen `GET /api/oficina/sesion` y la página de pendiente |
| Aprobar un aparato | (a) desde otro aparato de oficina ya aprobado, con confirmación reciente: `POST /api/admin/aparatos/{id}/aprobar` (los de cuentas `admin`, solo `admin`); (b) la misma persona entra con **otro enlace desde ese aparato** pasados ≥ 5 min (`GEMELO_OFICINA_SEGUNDO_ENLACE_MIN`) y antes de 24 h; (c) desde la consola del servidor (`aprobado_como = 'consola'`, RUNBOOK-VPS). Un pendiente de más de 24 h ya no se aprueba: el siguiente enlace crea otro |
| Revocar un aparato | `POST /api/admin/aparatos/{id}/revocar` (los de `admin`, solo `admin` o su propia cuenta): cierra en el acto todas las sesiones que salieron de él |
| Caducidad | **12 h absolutas** (`GEMELO_OFICINA_SESION_HORAS`; la cookie y `expira_en` se fijan al entrar y además se mira `creada_en`) y **2 h sin actividad** (`GEMELO_OFICINA_INACTIVIDAD_MIN`), en vez de 30 y 7 días |
| Confirmación reciente | `sesiones.confirmada_en` (al entrar con un enlace) de hace menos de 15 min (`GEMELO_OFICINA_CONFIRMACION_MIN`); si no, lo delicado (borrar una familia, dar o quitar roles de oficina, aprobar un aparato; después: publicar parámetros, re-hornear) da `403 confirmacion_requerida`. `POST /api/oficina/confirmar` manda un enlace nuevo a la propia cuenta (mismos límites que el de la portada); entrar con él abre una sesión nueva y confirmada. Con OF13 la dará también la llave de acceso |
| Sesiones que no valen | las de una cuenta de oficina **sin aparato** (anteriores a la 0005) o **de un código corto** (`origen = 'vinculo'`); la oficina no puede aprobar códigos cortos (403) |
| Guardas (para cualquier ruta) | `requiereSesion`, `requiereRol(...roles)`, `requiereConfirmacionReciente()` en `apps/api/src/oficina/acceso.ts` (`auth/roles.ts` las reexporta). Todas las `/api/admin/*` piden `requiereRol("oficina", "admin")` |
| Estáticos | `/oficina/` solo con sesión de oficina: Caddy hace `forward_auth` a `/api/interno/autoriza?para=oficina` → 204; sin sesión, `303 /`; con sesión de hogar, 403; con el aparato pendiente, `303 /api/oficina/pendiente` |
| Auditoría | `oficina.aparato_nuevo`, `oficina.aparato_aprobado` (`como`: aparato, segundo_enlace), `oficina.aparato_revocado`, `oficina.confirmacion_pedida`; nunca el secreto del aparato |
| Riesgo que queda | el **segundo enlace** solo protege de quien tiene un enlace un momento (un reenvío, un escáner), **no** de quien controla el buzón: eso lo cierra la llave de acceso obligatoria (OF13) antes de abrir a familias reales. Un navegador guarda un solo aparato de oficina: dos cuentas en el mismo perfil se pisan la cookie |

## Registros

JSON (pino). Nunca: token, cookie, `Authorization`, correo (el límite por correo usa su huella, no el correo), IP completa (se recorta a /24 o /48), consulta de la URL. Lo comprueban la integración y `infra/probar-caddy.sh`.

## RGPD

`GET /api/yo/datos` descarga todo lo del hogar (desde la 0004, también lo que colgó, subió, denunció y sugirió, sus avisos, inscripciones y lotes); `DELETE /api/yo` (o la oficina) lo borra en cascada, y la api borra además sus ficheros subidos ([VIDA](../doc/sistema/VIDA.md#datos-personales-para-la-eipd)); la auditoría guarda el hecho, sin el correo.
