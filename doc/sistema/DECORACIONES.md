# Decorar un olivo (P7g)

Propuesta de diseño, **sin implementar**. Pedida por Antonio el 2026-11-02: además de nombrar un olivo y colgarle una foto o una pintura ([VIDA](VIDA.md), P7f), que la familia pueda **decorarlo**. Las decisiones abiertas están al final; hasta tomarlas, nada de esto es contrato.

## Qué es y qué no es
- Una decoración es una pieza **de un catálogo cerrado** que se cuelga del olivo (cinta, farolillo, cartel sin texto, campanilla…). La familia **elige**, no sube nada.
- Es **ilustrativa** (regla 5): no mide nada y el mundo la rotula así. No es una foto ni un dato de la explotación.
- Un catálogo cerrado no trae el riesgo de las fotos (menores, terceros, retirada): no hay texto libre ni imagen subida, así que no pasa por denuncia ni por EIPD nueva. Si más adelante se quiere un cartel con texto, se trata como un nombre: otra decisión.

## Quién puede
Lo mismo que P7f ([decisión 96](../rumbo/DECISIONS-PENDING.md)): solo el titular de la haza, solo en un olivo de **su** haza, y lo vuelve a comprobar la api (403 «solo titular» / «no es tu haza»). Los demás hogares la ven. Las gafas vinculadas con código corto solo leen.

## Cómo encaja en lo que ya hay
1. **Catálogo versionado** en `contratos/` (código, nombre, estación opcional, triángulos). El motor y la api se ponen de acuerdo por contrato (regla 3).
2. **Base de datos.** La tabla de lo colgado (migración 0004) liga `objeto_tipo` y `medio_id`: una decoración no tiene medio. Se guarda en una **columna o tabla aparte** (código del catálogo, olivo, hogar), con su migración y su disparador de permisos.
3. **Api.** Una ruta `PUT/DELETE /api/olivos/:finca/:copas_id/decoracion` con el mismo guardián de titular que `vida/rutas.ts`, y la decoración dentro de la lista blanca pública del olivo.
4. **Motor.** Un componente nuevo que dibuja las decoraciones **instanciadas** solo en los olivos cercanos a la cámara, con presupuesto propio medido antes y después (regla 6, `pruebas/presupuesto.json`). Se libera con `dispose()`.
5. **Interfaz.** Una acción «Decorar» en la ficha del olivo (donde hoy está «Colgar foto o dibujo») y una lista corta de elegir. En VR, solo ver.
6. **Oficina** (después): ver y retirar las decoraciones de una haza.

## Tareas, por escalones
| # | Tarea | Peso | Depende de |
|---|---|---|---|
| D1 | Decidir el catálogo inicial (👤 Antonio) | — | — |
| D2 | Contrato del catálogo, migración y ruta de la api, con sus pruebas | media · sonnet | OF3e, D1 |
| D3 | Componente del motor: dibujo instanciado cerca, presupuesto medido en el banco | media · **opus** | D2 |
| D4 | Acción «Decorar» en la ficha y su lista | ligera · sonnet | D2, D3 |
| D5 | Vista y retirada en la oficina | ligera · sonnet | D2 |
| D6 | Nota de comodidad y prueba en aparatos (👤 iPhone, Quest) | 👤 | D4 |

D2 y D3 se pueden preparar en paralelo con un contrato de por medio; el primer escalón útil para las familias es **D1 → D2 → D3 → D4**.

## Riesgos
- **Presupuesto de dibujo.** Cada decoración distinta es una llamada de dibujo más. Con un catálogo corto y una malla instanciada por tipo, el tope es el número de tipos. Hay que medirlo con muchos olivos decorados en pantalla.
- **Quest y móvil.** No probado en hardware real: se dirá «no probado».
- **Lo que ven los demás.** Una decoración es visible para todos los hogares; el catálogo cerrado lo hace seguro por construcción.

## Decisiones tomadas (2026-11-02, [175-178](../rumbo/DECISIONS-PENDING.md))
1. **Catálogo de temporada**: piezas que cambian con la época (flores, luces…). Qué piezas concretas lleva cada época queda por escribir (D1).
2. **Una sola decoración por olivo y hogar**: la nueva sustituye a la anterior. Basta una columna, no una tabla.
3. **La familia elige** entre las piezas de la época actual; lo ya puesto se queda hasta que lo cambie. Nada cambia solo.
4. **La oficina solo ve y retira**; no pone decoraciones oficiales.

## Lo que falta decidir
- **D1: la lista concreta de piezas por época.** Propuesta de partida para ajustar: primavera (flores), verano (cinta de color), otoño (farolillo, cosecha), invierno (luces, lazo). Cada pieza, una malla pequeña instanciada y rotulada como ilustrativa.
