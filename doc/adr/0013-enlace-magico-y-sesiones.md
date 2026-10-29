# ADR-0013 — Enlace mágico por correo y sesión en cookie guardada en Postgres

- **Estado:** Aceptado
- **Fecha:** 2026-10-29

## Contexto
La fase F1a abre el gemelo a los hogares de la explotación ([ADR-0009](0009-plataforma-multiusuario-cuarenta-hazas.md)), alojado en el VPS de OVH ([ADR-0011](0011-alojamiento-en-el-vps-de-ovh.md)). Quien entra es gente del campo, muchos con el móvil: no deben recordar contraseñas. Las cuentas las da la oficina (no hay alta abierta), el correo sale por el SMTP de OVH (decisión 15) y sin sesión solo se ve la portada (decisión 16). La regla de oro 12 pide usar librerías mantenidas.

## Decisión
Se entra con un **enlace mágico** de un solo uso (token de 256 bits guardado como SHA-256, 15 minutos, página intermedia con botón para que un escáner de correo no lo gaste) y se mantiene una **sesión en cookie `__Host-gemelo`** (`HttpOnly; Secure; SameSite=Lax`) gestionada por `@fastify/session` con un **almacén propio en Postgres** que guarda el hash del id. Caducidad absoluta 30 días y por inactividad 7; rotación al entrar; revocación inmediata en la base. Límites con `@fastify/rate-limit` por IP y por correo, con la misma respuesta exista o no la cuenta. Detalle: [contratos/sesion.md](../../contratos/sesion.md).

## Alternativas consideradas
- **Contraseña** — otra cosa que olvidar y que robar; obliga a recuperación por correo de todas formas.
- **Proveedor externo (Google, Auth0, Keycloak)** — dependencia de terceros con datos de los hogares, o un servicio más que operar en un VPS compartido; para decenas de cuentas no compensa.
- **JWT sin estado** — no se puede revocar al momento (un móvil perdido, un hogar que se va); la sesión en base sí.
- **Código de 6 cifras por correo** — más fácil de adivinar, obliga a teclear; el enlace es un toque.
- **Lucia / better-auth** — Lucia dejó de mantenerse como librería (2025); better-auth trae mucho más de lo que hace falta (OAuth, organizaciones) y su propio esquema. `@fastify/session` + almacén de 60 líneas cubre lo necesario.

## Consecuencias
- **Positivas:** sin contraseñas; revocación inmediata; en la base nunca hay un token ni un id de sesión en claro; el sondeo de cuentas no da información.
- **Negativas / coste:** entrar depende de que llegue el correo (SMTP de OVH **no verificado**); un correo comprometido da acceso durante 15 minutos.
- **Implicaciones futuras:** el corresponsal de campo y la guía (fase 2) usan los mismos roles; si hiciera falta un segundo factor, se añade sobre esta sesión.

## Comprobación
`apps/api/pruebas/integracion/api.test.ts` (contra PostGIS en contenedor): hash en base, un solo uso y canje concurrente, caducidad, rotación, revocación, límites con el mismo texto, cookie con sus atributos, registros sin tokens, cookies ni correos. Guardián `api.test.js` (integración con `GEMELO_DOCKER=1`). **No probado:** el envío real por el SMTP de OVH, el comportamiento de escáneres de correo reales, el borde real.
