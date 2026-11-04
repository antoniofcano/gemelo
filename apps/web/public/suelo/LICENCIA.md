# Texturas de suelo del gemelo (`apps/web/public/suelo/`)

| Fichero | Qué es |
|---|---|
| `calle_<px>.webp`, `calle_v1_<px>.webp` | calle con picado (entrecalle), de dos fotos |
| `hojarasca_<px>.webp`, `hojarasca_v1_…`, `hojarasca_v2_…` | hojarasca seca de olivo, densa, de tres fotos |
| `tierra_grava_<px>.webp` | tierra parda con grava |
| `compost_<px>.webp` | compost / materia orgánica |
| `ruedo_<px>.webp` | ruedo rojizo bajo la copa |
| `camino_<px>.webp`, `camino_v1_<px>.webp` | camino / rodada, de dos fotos |
| `piedra_<px>.webp`, `piedra_v1_…`, `piedra_v2_…` | caliza porosa con líquenes (piedras sueltas), de tres fotos |
| `<clase>[_v<k>]_<px>_relieve.webp` | relieve aproximado de cada una (deducido de la claridad, no medido) |
| `suelo.json` | manifiesto: orden de capa, metros supuestos, foto de origen y huellas sha256 |

`<px>` es 768 o 384. `_v1` y `_v2` son variantes: otras fotos de la misma clase.

**Procedencia:** fotografías de campo tomadas por Antonio en una finca de Cano & Damas Oleicultores el 2026-11-04. Las procesa `tuberia/suelo/construye.mjs`: recorte cenital, luz aplanada, color normalizado alrededor de 1, repetible sin costuras y reducción a 768 y 384 px. Las fotos originales **no** están en el repositorio ni en su historial. La forma de regenerarlas está en [doc/operacion/DATOS.md](../../../../doc/operacion/DATOS.md#texturas-de-suelo-y-paleta-del-cielo-ev-1s).

**Naturaleza:** son **ilustrativas**. Dan el aspecto del suelo de cerca y no describen ningún punto concreto. El color del suelo sale de la ortofoto (medido) y la textura solo lo modula. La clase de cada punto (calle, ruedo, camino…) es **deducida**.

**Licencia:** © Cano & Damas Oleicultores, autor Antonio. Se publican para usarlas en el gemelo, por decisión de Antonio del 2026-11-04. No se pueden reutilizar fuera del gemelo sin permiso.
