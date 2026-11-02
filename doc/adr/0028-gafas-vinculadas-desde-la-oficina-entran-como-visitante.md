# ADR-0028 — Las gafas vinculadas desde una cuenta de oficina entran como visitante

- **Estado:** Aceptado
- **Fecha:** 2026-11-02

## Contexto
[ADR-0024](0024-la-oficina-roles-acceso-y-configuracion-versionada.md) decidió que **una cuenta de oficina no vincula aparatos con el código corto**: su sesión exige un aparato confiable aprobado y entrar por enlace (`origen = 'enlace'`), de modo que unas gafas con un código de 6 cifras no pueden ser nunca una sesión de oficina. En el código, `POST /api/yo/dispositivos/vincular` devuelve 403 («Las cuentas de la oficina no vinculan aparatos con el código corto») y `auth/almacen.ts` descarta una sesión de oficina que no sea de enlace.

El 2026-11-02 Antonio, con su cuenta de oficina, no pudo probar el mundo en unas Quest: no podía vincularlas. La única salida era dar de alta una familia de pruebas con otro correo. Antonio decidió que la oficina pueda vincular gafas, **siempre como visitante**.

## Decisión
Una cuenta de oficina puede aprobar el código corto de unas gafas, pero la sesión que nace de él es la de un **visitante de familia**: rol efectivo `hogar`, `origen = 'vinculo'` (solo lectura, no titular, como las gafas de cualquier hogar) y **nunca** con poderes de oficina, de aparato confiable ni de `/api/admin`.

## Alternativas consideradas
- **Una familia de pruebas para las gafas** (la recomendada al principio) — no toca la seguridad y sigue disponible, pero obliga a gestionar un correo y una cuenta aparte solo para probar. Antonio prefirió no depender de ella.
- **Gafas con poderes de oficina** — descartada: un código corto de 6 cifras dejaría de proteger la oficina. Es exactamente lo que ADR-0024 evita.
- **No cambiar nada** — descartada por Antonio: no puede probar el Quest con su cuenta.

## Consecuencias
- **Positivas:** la oficina prueba las gafas con su propia cuenta; los poderes de oficina siguen exigiendo PC, aparato confiable y llave de acceso.
- **Negativas / coste:** las gafas de la oficina **no llevan el chaleco ni la etiqueta «Oficina»** (la decisión 107, «la oficina siempre visible», se refiere a quien entra con poderes); en la sala aparecen con el alias de la cuenta, como un visitante. Las gafas vinculadas desde oficina duran **12 horas** (la vida de una sesión de oficina, decisión 182 de Antonio), así que hay que volver a vincularlas casi a diario.
- **Implicaciones futuras:** el cambio está en el cálculo del rol efectivo de la sesión (`auth/almacen.ts`): un `origen = 'vinculo'` de un hogar de oficina o admin cuenta como `hogar`. Hay que vigilar que ninguna ruta lea `hogares.rol` directamente en vez del rol efectivo de la sesión. Revocar las sesiones del hogar de oficina (`/api/admin/hogares/{id}/revocar`) debe cerrar también las gafas.

## Comprobación
Prueba de integración contra PostGIS (por el turno del banco): una cuenta de oficina aprueba un código; la sesión resultante responde en `GET /api/sesion` con rol `hogar` y `titular: false`; `/api/admin/*` y `/oficina/` le dan 401/403; el token de LiveKit no lleva el rol `oficina`; revocar las sesiones del hogar la cierra. **No probado:** unas gafas reales (Quest, iPhone) ni el flujo de aprobación en pantalla.
