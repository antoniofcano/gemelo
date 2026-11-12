# Base de los interiores en Blender (eje B)

Guiones para llevar un glb de interior (la fábrica restaurada, por ahora) a una base en Blender lista para hornear la luz, y de ahí a los mundos del contrato [mundo-interior](../../../contratos/mundo-interior.md). **Los modelos, las texturas, los `.blend` y los horneados no entran en el repo** (regla 4, decisión 227): todo se escribe en una carpeta privada que se pasa por argumento.

Blender 5.2 en segundo plano; en esta máquina, lo pesado va por el banco: `node pruebas/banco/proceso.js --que "<para qué>" --memoria-gb 1.5 -- <blender> --background …` ([TESTING](../../../doc/operacion/TESTING.md)).

| Paso | Guion | Qué hace |
|---|---|---|
| 1 | `descomprime.mjs <glb> <carpeta>` | quita meshopt, cuantización y KTX2 (a PNG con el Basis Universal de three); conserva `COLOR_0` y `_LIGHT`; `recuento.json` compara antes y después |
| 2 | `separa.py -- <glb> capas.json <mundo> <salida.blend>` | un `.blend` por mundo según [capas.json](capas.json): metros reales, colecciones por procedencia (MEDIDO, ILUSTRATIVO, AUXILIAR, FACHADA_FABRICA), grumos del escaneo apartados (no borrados) en DESCARTES, escaneo a Principled |
| 3 | `prepara.py` | UV «luz» por objeto, téxeles por metro y resolución sugerida, revisión de materiales, sol y cielo parametrizados ([SUPUESTO] la orientación; `--norte`, `--color-sol`, `--solo-luz`, `--solo-uv`), Cycles en CPU |
| 3b | `obra.py -- <obra.json> [--guarda …]` | obra **ilustrativa** confirmada por una persona: aparta piezas (a DESCARTES), abre vanos, tapia, y pone portones de dos hojas, verjas de tablas sobre murete y un fondo tras ellas; se niega a tocar lo MEDIDO. Siempre sobre el `.blend` de partida; después, `prepara.py --solo-uv --objetos …` |
| 3c | `luces.py -- <luces.json>` | luz interior **ilustrativa** de un mundo cerrado: el escaneo deja de dar sombra al sol y a las luces de hueco (enlace de sombras; no se abre ni se borra), una luz de cielo por ventana o puerta y un haz de polvo barato (colección EFECTOS, no se hornea) por cada hueco al que le da el sol |
| 4 | `puertas.py -- <salida.json> --carpinteria … --suelos …` | puertas por la forma de la carpintería, umbral con un rayo y hacia dónde se sale (coordenadas de Blender y del glb, rumbo del contrato) |
| 5 | `planta.py -- <png> [--puertas puertas.json --mundo …]` | planta cenital cortada a una altura, con rejilla de metros y las puertas numeradas |
| 6 | `hornea.py -- --salida <carpeta> […]` | horneado por objeto (luz, color_luz, ao) a textura (UV «luz») o a vértice, con OIDN; `hornea.json` con los tiempos |
| 7 | `vista.py -- <png> --desde x,y,z --hacia x,y,z` | render de comprobación (Eevee o Cycles), con su tiempo; con `--horneado <carpeta>` enseña lo que verá el visitante (color × mapa de luz, más los brillos) |

Dependencias de Node (versión fijada en [package.json](package.json)): `npm ci` o `npm i` en esta carpeta. La lógica pura (`nombres.mjs`) y `capas.json` los vigila `pruebas/guardianes/interiores_blender.test.js`.

Los `obra.json` y `luces.json` llevan cotas del sitio: son privados y viven junto al `.blend`, no aquí (su formato está en la cabecera de cada guion). El sol se pone con `prepara.py --solo-luz --azimut A --elevacion E [--norte N]`: mientras no se sepa hacia dónde cae el norte en el modelo, la nota del sol dice **[SUPUESTO]**; la luz horneada es ilustrativa en todo caso (regla 5).

Ejes: Blender usa Z arriba; el glb, Y arriba. Un punto de Blender `(x, y, z)` es `(x, z, −y)` en el glb.
