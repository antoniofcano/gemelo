# Decorar un olivo (P7g)

Diseño con la parte de **datos y api hecha (D2, 2026-11-02)** y el **componente del motor hecho en Node (D3, 2026-11-02)**; la **acción «Decorar» en la ficha hecha en Node (D4, 2026-11-02)**; la oficina (D5) y la prueba en aparatos (D6) siguen sin hacer. Pedida por Antonio el 2026-11-02: además de nombrar un olivo y colgarle una foto o una pintura ([VIDA](VIDA.md), P7f), que la familia pueda **decorarlo**. Las decisiones están al final; el contrato vigente es [contratos/decoraciones.md](../../contratos/decoraciones.md) (api, catálogo y lista blanca; resumen en [VIDA](VIDA.md#decoraciones-p7g-d2)).

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
| D2 | **Hecha (2026-11-02).** Contrato del catálogo (`contratos/decoraciones.json`), migración `0019`, rutas `PUT`/`DELETE …/decoracion` y retirada de la oficina, con pruebas de Node; la integración con PostGIS está escrita y **sin ejecutar** | media · sonnet | OF3e, D1 |
| D3 | **Hecha en Node (2026-11-02).** Componente `decoraciones-olivo` (`50_decoraciones.js`): una `InstancedMesh` por pieza, las 64 más cercanas al foco, ≤ 6 llamadas y ≤ 2.560 triángulos, ilustrativa en la ficha ([COMPONENTES](COMPONENTES.md#p7g-d3--las-decoraciones-de-los-olivos-decoraciones-olivo)). La prueba de Chrome está escrita y **sin ejecutar**: falta la medida en el banco | media · **opus** | D2 |
| D4 | Acción «Decorar» en la ficha y su lista (**hecha en Node, 2026-11-02**) | ligera · sonnet | D2, D3 |
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

## Piezas del catálogo (decisión 179, 2026-11-02)
Primavera: **flores**. Verano: **cinta de color**. Otoño: **farolillo** y **cosecha**. Invierno: **luces** y **lazo**. Seis piezas, cada una una malla pequeña instanciada y rotulada como ilustrativa; ampliar es añadir una línea al catálogo. Ya no queda nada por decidir. **Qué queda**: la medida de D3 en el banco (`decoraciones_chrome.test.js`, escrita y sin ejecutar), D5 (vista y retirada en el panel de la oficina) y D6 (prueba en aparatos, 👤).

## Cómo se pone desde la ficha (D4, 2026-11-02)

- **Dónde:** la ficha del olivo (la común; `42_personalizacion.js`), con las acciones «Decorar» / «Cambiar decoración» y «Quitar decoración» para el **titular en un olivo de SU haza**, fuera de VR (en VR solo lectura: la fila «Decoración» de D3). Detalle, texto del recuadro y nota de comodidad: [COMPONENTES](COMPONENTES.md#p7g-d4--la-acción-decorar-en-la-ficha-del-olivo-personalizacion-42).
- **Qué se elige:** solo las piezas de la **época actual** (1 en primavera y verano, 2 en otoño e invierno), con la misma regla de fechas que la api (`PersonalizaPuro.epocaDeLaFecha`, comprobada contra la de la api en los días límite). Una sola por olivo y hogar: la nueva sustituye a la anterior; lo ya puesto se queda hasta que se cambie o se quite, aunque la época ya sea otra. Rotulado «ilustrativa: la decoración la elige tu familia; no la mide el gemelo».
- **Qué hace:** `PUT`/`DELETE /api/olivos/{finca}/{copas_id}/decoracion`; al éxito se refresca la lista de la haza y D3 repinta sin recargar. Los errores de la api (`solo_titular`, `no_es_tu_haza`, `a_la_vez`, 429, 401, `fuera_de_epoca` con su texto) se ven en el recuadro.
- **Solo con quien la dibuje:** sin el componente de las decoraciones (`?decoraciones=0`) la acción no sale.
- **Probado:** solo Node. **Escrito y sin ejecutar:** `decorar_chrome.test.js` (por el banco). **No probado:** Chrome real, iPhone, Quest ni lector de pantalla.

## Cómo lo dibuja el motor (D3, 2026-11-02)
- **Los datos no se piden dos veces.** La lista blanca de cada haza ya la trae la personalización (`42_personalizacion.js`); ahora saca de ella las decoraciones y las publica por el Bus (`decoraciones:cambian`, [eventos.json](../../contratos/eventos.json)); el componente `decoraciones-olivo` las pide al montarse (`decoraciones:pide`). La época la decidió la api al ponerla: el motor dibuja lo que venga e ignora lo que no esté en el catálogo (que copia de `contratos/decoraciones.json`; un guardián vigila que coincidan).
- **Dónde va la pieza:** en la copa del olivo, a 0,62-0,78 de su altura y a 0,85 del radio dibujado, hacia un lado fijo que sale de su id (no se mueve al pasear). En la vista aérea se dibujan las de alrededor de lo que se mira; paseando, las de alrededor de quien pasea; en VR, las de alrededor de la cabeza. Como mucho 64 a la vez.
- **Ilustrativa:** la ficha del olivo dice «Decoración: Luces — ilustrativa: la eligió tu familia (o la familia de esa haza); no la mide el gemelo».
- **Qué falta:** D5 (oficina), D6 (aparatos, 👤) y **la medida en Chrome por el banco** (llamadas, triángulos y memoria de verdad; hoy solo está contado en Node: 6 llamadas y 2.004 triángulos con 64 piezas de las seis clases a la vista). **No probado:** cómo se ve (tamaño y colores), fps, iPhone ni Quest.
