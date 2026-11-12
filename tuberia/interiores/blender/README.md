# Base de los interiores en Blender (eje B)

Guiones para llevar un glb de interior (la fábrica restaurada, por ahora) a una base en Blender lista para hornear la luz, y de ahí a los mundos del contrato [mundo-interior](../../../contratos/mundo-interior.md). **Los modelos, las texturas, los `.blend` y los horneados no entran en el repo** (regla 4, decisión 227): todo se escribe en una carpeta privada que se pasa por argumento.

Blender 5.2 en segundo plano; en esta máquina, lo pesado va por el banco: `node pruebas/banco/proceso.js --que "<para qué>" --memoria-gb 1.5 -- <blender> --background …` ([TESTING](../../../doc/operacion/TESTING.md)).

| Paso | Guion | Qué hace |
|---|---|---|
| 1 | `descomprime.mjs <glb> <carpeta>` | quita meshopt, cuantización y KTX2 (a PNG con el Basis Universal de three); conserva `COLOR_0` y `_LIGHT`; `recuento.json` compara antes y después |
| 2 | `separa.py -- <glb> capas.json <mundo> <salida.blend>` | un `.blend` por mundo según [capas.json](capas.json): metros reales, colecciones por procedencia (MEDIDO, ILUSTRATIVO, AUXILIAR, FACHADA_FABRICA), grumos del escaneo apartados (no borrados) en DESCARTES, escaneo a Principled |
| 3 | `prepara.py` | UV «luz» por objeto, téxeles por metro y resolución sugerida, revisión de materiales, sol y cielo parametrizados ([SUPUESTO] la orientación), Cycles en CPU |
| 4 | `puertas.py -- <salida.json> --carpinteria … --suelos …` | puertas por la forma de la carpintería, umbral con un rayo y hacia dónde se sale (coordenadas de Blender y del glb, rumbo del contrato) |
| 5 | `planta.py -- <png> [--puertas puertas.json --mundo …]` | planta cenital cortada a una altura, con rejilla de metros y las puertas numeradas |
| 6 | `hornea.py -- --salida <carpeta> […]` | horneado por objeto (luz, color_luz, ao) a textura (UV «luz») o a vértice, con OIDN; `hornea.json` con los tiempos |
| 7 | `vista.py -- <png> --desde x,y,z --hacia x,y,z` | render de comprobación (Eevee o Cycles), con su tiempo |

Dependencias de Node (versión fijada en [package.json](package.json)): `npm ci` o `npm i` en esta carpeta. La lógica pura (`nombres.mjs`) y `capas.json` los vigila `pruebas/guardianes/interiores_blender.test.js`.

Ejes: Blender usa Z arriba; el glb, Y arriba. Un punto de Blender `(x, y, z)` es `(x, z, −y)` en el glb.
