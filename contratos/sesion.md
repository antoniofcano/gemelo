# Contrato: enlace mágico y sesión (F1a)

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

## Sesión

| Qué | Valor |
|---|---|
| Cookie | `__Host-gemelo`; `HttpOnly; Secure; SameSite=Lax; Path=/`, sin `Domain`; firmada (`GEMELO_SESION_SECRETO`) |
| Se guarda | en Postgres (`sesiones`), por el SHA-256 de su id; nunca el id en claro |
| Rotación | cada entrada crea una sesión nueva y revoca la que trajera el navegador |
| Caducidad | absoluta 30 días; por inactividad 7 días (configurables) |
| Revocación | inmediata en la base: salir, salir de todas, la oficina (`/api/admin/hogares/{id}/revocar`), hogar desactivado o borrado |
| CSRF | `SameSite=Lax` + comprobación de `Origin` en todo POST/PUT/DELETE (salvo `/api/csp-informe`) + sin `text/plain` |
| Roles | `hogar`, `guia`, `corresponsal`, `admin` |
| Estáticos | `/finca/` y `/teselas/` piden sesión al Caddy interno (`forward_auth` → `/api/interno/autoriza`, cerrada desde fuera) |

## Registros

JSON (pino). Nunca: token, cookie, `Authorization`, correo (el límite por correo usa su huella, no el correo), IP completa (se recorta a /24 o /48), consulta de la URL. Lo comprueban la integración y `infra/probar-caddy.sh`.

## RGPD

`GET /api/yo/datos` descarga todo lo del hogar; `DELETE /api/yo` (o la oficina) lo borra en cascada; la auditoría guarda el hecho, sin el correo.
