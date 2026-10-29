# ADR-0014 — Proyección pública por haza con lista blanca

- **Estado:** Aceptado
- **Fecha:** 2026-10-29

## Contexto
Cada hogar ve en el gemelo las hazas de la finca y una ficha por haza: tratamientos, fenología, analíticas, avance de recogida, olivos (decisiones 13 y 14). Los datos vienen de OlivarTrack, que contiene mucho que **no** debe salir: titulares, personas (aplicadores, quien registra), kilos y rendimientos, GPS, textos de campo libres (que además pueden intentar dar órdenes a un agente). Las hazas las dibuja y asigna la oficina (decisión 12). Un hogar ve todas las hazas, no solo la suya.

## Decisión
La ficha es una **proyección con lista blanca en dos capas**: al leer de OlivarTrack (`apps/api/src/ot/mapeo.ts`) se copia campo a campo solo lo permitido a `eventos_haza`; al servir (`apps/api/src/hazas/ficha.ts`) la ficha se arma de nuevo campo a campo y cumple [contratos/haza.schema.json](../../contratos/haza.schema.json) (`additionalProperties: false` en todos los niveles). Nunca titular (solo un alias si el hogar lo hace visible), kilos, personas, GPS ni texto libre. Lo incompleto se dice (`completo`, `avisos`, `datos_de`). La lectura de OlivarTrack es por MCP con token propio de solo lectura ([contratos/olivartrack-sync.md](../../contratos/olivartrack-sync.md)).

## Alternativas consideradas
- **Lista negra** (quitar los campos sensibles) — un campo nuevo en OlivarTrack saldría solo; con lista blanca no sale nada que no se haya decidido.
- **Consultar OlivarTrack en cada petición** — cada hogar arrastraría la carga y la latencia de OlivarTrack, y un fallo dejaría la ficha vacía; con sincronía periódica idempotente la ficha responde siempre y dice de cuándo es.
- **Vista SQL en OlivarTrack** — acoplaría las dos bases y su esquema; el MCP es la interfaz pública que ya existe.
- **Ficha solo para la haza propia** — contrario a la decisión 14 (ver las de los vecinos es parte del valor); la protección está en qué se muestra, no en quién.

## Consecuencias
- **Positivas:** un cambio en OlivarTrack no filtra datos; el contrato lo vigilan pruebas; los textos de campo no llegan nunca a la página ni a un agente.
- **Negativas / coste:** cada dato nuevo exige tocar mapeo, ficha, esquema y pruebas; las formas de las respuestas de OlivarTrack están **[NO VERIFICADAS]** (grabaciones sintéticas).
- **Implicaciones futuras:** preguntas y visitas (fase 2) usarán la misma regla; un cambio de campo es cambio de contrato.

## Comprobación
`apps/api/pruebas/unidad/ot.test.ts` (lo prohibido no pasa el mapeo; la ficha cumple el esquema y rechaza titular o kilos) y la integración (sincronía con grabaciones que llevan a propósito personas, kilos, GPS y un texto que da órdenes: nada de eso aparece en la base ni en la ficha). **No probado:** contra respuestas reales de OlivarTrack.
