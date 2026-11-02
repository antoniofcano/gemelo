# Optimizar el paseo por el campo (Quest, móvil y escritorio)

Plan vivo, sin cifras de aparatos reales todavía (**no probado en hardware**: regla 7). Pedido por Antonio el 2026-11-02: «a ver si podemos mejorar el paseo por el campo». Las tareas están en [PLAN](../rumbo/PLAN.md) (Q0a a Q0d); la comparación frente a un cliente nativo, en Q1.

## Principio
**Primero medir, después tocar una sola cosa cada vez.** Sin una línea base en el aparato, cualquier mejora es una suposición. SwiftShader (el Chrome del banco) da recuentos de dibujo y memoria, **no fps**: los fps solo los da un casco, un móvil o un ordenador reales ([`medir`](../../.claude/skills/medir/SKILL.md)).

## Qué hay ya
- **Perfiles de VR** (`VR_PERFILES`, `29_vr.js`): cuatro niveles de 380.000 a 130.000 triángulos, con hierba y relieve fino que se apagan en los bajos. **Valores de partida sin medir.**
- **Controlador adaptativo:** baja de nivel si el JavaScript pasa de 13 ms o el fotograma de 15,2 ms (objetivo 72 Hz = 13,9 ms por fotograma).
- **En la sesión VR:** resolución del lienzo al 0,9, foveación fija al máximo y 72 Hz pedidos al casco; sin sombras.
- **En escritorio y móvil:** escala adaptativa de `07b_arboles.js` (de 0,7 a 2,5 según el tiempo por fotograma) y topes de triángulos; el móvil no tiene perfil propio.
- **Telemetría de fluidez** (PB9, `&mide=60`): lo que el aparato mide, enviado por quien lo usa.
- **El presupuesto de dibujo** de cada componente y sus topes (`pruebas/presupuesto.json`).

## Sospechosos (hipótesis, no medidas)
1. **Los olivos generados por defecto** (O10a): cientos de miles de triángulos y varias llamadas de dibujo de cerca. El mayor sospechoso de que el paseo vaya peor.
2. **La resolución y la foveación** (la GPU de la Quest manda): suelen dar la mejora más barata.
3. **El terreno 3D Tiles** y el número de teselas visibles a la vez.
4. **El JavaScript por fotograma:** componentes con trabajo cada cuadro (presencia con muchas personas, decoraciones, minimapa).
5. **La basura por fotograma** (asignaciones que el recolector paga a golpes).

## Las cuatro tareas
| Tarea | Qué es |
|---|---|
| **Q0a** | Línea base en la Quest: protocolo, hoja de medida y diagnóstico CPU o GPU |
| **Q0b** | Perillas por URL para probar en el casco sin recompilar: `?xrfov=`, `?xrescala=`, `?xrhz=`, `?xraa=`, `?xrnivel=`, con la línea «VR: …» en `?debug` y en `?mide` |
| **Q0c** | Calibrar `VR_PERFILES` y los umbrales del controlador con los datos de Q0a y Q0b |
| **Q0d** | Palancas estructurales una a una: paneles en capas de cuarto de pantalla (`XRQuadLayer`), texturas KTX2, geometría meshopt, menos llamadas, menos basura |

## Primera medida real (2026-11-02, Meta Quest 3)
Quest Browser 154, Hituelo, modo gemelo, VR, versión 0.2.0, perfil final **3** (el más bajo): 3.986 fotogramas en 60 s (unos 66 fps de media), mediana 14,3 ms, **p95 20,7 ms**, peor 47,7 ms, frente al objetivo de 13,9 ms (72 Hz). **No cumple.** Es una sola sesión (n = 1): no dice si manda la CPU o la GPU ni si los olivos generados estaban activos (por eso Q0e amplía la telemetría). Lo que sí indica: el controlador ya está en el nivel de menos triángulos y no llega, así que **el límite probablemente no es solo el número de triángulos**.
**[SUPUESTO] Hipótesis a contrastar:** en WebXR cada llamada de dibujo se paga dos veces (un ojo cada vez) y el coste de JavaScript por llamada, no la geometría, puede mandar; revisar el número de llamadas y de teselas 3D Tiles visibles, y si el casco corre a 72 Hz o a otra frecuencia. Herramienta decisiva: la depuración remota por USB (`chrome://inspect`) con un perfil de rendimiento del Quest Browser, que dice qué funciones cuestan.
**Medir sin copiar a mano (estudio Q2):** el Immersive Web SDK de Meta no mide en el casco para una web como la nuestra, pero `adb` + la depuración remota por CDP + el arranque directo en VR (`sessiongranted`) permitirían que un script lea el informe de `?mide` del Quest, y `metavr perf` (licencia propietaria) daría la GPU por fotograma: [IWSDK](IWSDK.md#2-probar-y-medir-en-un-quest-por-cable-desde-un-agente). Sin probar.

## Protocolo de medida (Q0a)
1. **Anotar el aparato:** modelo de Quest (la 2 y la 3 rinden muy distinto), versión del navegador y firmware.
2. **Escenarios, siempre los mismos:** Hituelo en vista lejos, de cerca y paseando 5 minutos por el mismo recorrido; con `?olivos=0` y con el valor por defecto; sola la persona y con otras conectadas; con y sin `?decoraciones=0`.
3. **Qué registrar:** fps medios y mínimos, ms de JS por fotograma, nivel de `VR_PERFILES` al empezar y al terminar (`?debug&mide=60`), y con el **OVR Metrics Tool** del Meta Quest Developer Hub: carga de CPU y GPU, nivel de rendimiento del casco y fotogramas perdidos.
4. **Cada medida lleva las perillas con las que se hizo** (la línea «VR: …» de Q0b): sin ella no se puede comparar.
5. **Diagnóstico:** si la GPU va saturada y la CPU holgada, se actúa sobre resolución, foveación, triángulos y tilesets; si manda el JS, sobre los componentes por fotograma y la basura.
6. **Una sola variable por prueba**, al menos tres repeticiones, y se anota el ruido.

## Cómo decidir
| Si la medida dice… | Se prueba primero… |
|---|---|
| GPU saturada con los olivos generados | `?xrescala=` y `?xrfov=`; después bajar el nivel de partida o dejar los generados solo de cerca |
| GPU saturada con el terreno | menos teselas visibles, texturas KTX2, geometría meshopt |
| CPU saturada por JS | qué componente (C11 mide cada uno «con y sin»), y la basura por fotograma |
| Todo cabe a 72 Hz | nada; se sube la calidad (más olivos propios, 90 Hz) |
| Nada llega con margen aun optimizando | entonces, y solo entonces, el estudio del cliente nativo (Q1) |

## Cómo se evita una regresión
- Cada palanca estructural entra con su antes y después en el casco y se anota en [MEDIDAS](MEDIDAS.md).
- Los topes de `pruebas/presupuesto.json` no se suben sin medida.
- La telemetría PB9 enseña el nivel real de cada visita: si el nivel medio baja tras un cambio, se ve.

## Advertencias de comodidad
Bajar la resolución o la foveación hace la imagen más borrosa; subir los hercios sin margen provoca tirones, que en VR marean. Cada cambio de interacción o de calidad lleva su nota de comodidad con lo probado y lo **no** probado (iPhone, Quest) y se decide con la persona que lo prueba ([`interaccion`](../../.claude/skills/interaccion/SKILL.md)).
