// La puerta de los mundos hacia el legado (MUNDOS §9.3; MU2-3): lo que exporta este fichero es lo que ve la IIFE de apps/web/motor/ como `Mundos.<nombre>`.
// Igual que el puente del núcleo (nucleo/index.ts), pero aparte: nucleo/ no puede importar de mundos/ (dependency-cruiser), así que los mundos que el legado
// monta (hoy solo el exterior) entran por su propio alias, «@gemelo/mundos», que genera_motor.mjs escribe detrás del de «@gemelo/nucleo».
// Los interiores NO pasan por aquí: son trozos perezosos (`import("@gemelo/mundo-bodega")`). El vacío (MU2-6) es la excepción: el interior de prueba,
// sin assets, que 90_final registra para ?mundo=vacio (MU2-8).
export { creaCargaTeselas, creaExterior } from "./exterior.ts";
export type { ConEstilo, DepsAmbienteExterior, DepsCargaTeselas, DepsExterior, Visible } from "./exterior.ts";
export { creaVacio } from "./vacio.ts";
export type { DepsVacio, FabricaLuz } from "./vacio.ts";
// A3-1b (MU5-n): los componentes del exterior que salen del legado (tileset y suelo de fotos). Cada uno, con su libera() de verdad.
export { creaSueloFondo, manifiestoSueloFondo } from "./exterior/suelo-fondo.ts";
export type { DepsSueloFondo, SueloFondo } from "./exterior/suelo-fondo.ts";
export { SueloFotosPuro, creaSueloFotos, manifiestoSueloFotos } from "./exterior/suelo-fotos.ts";
export type { DepsSueloFotos, SueloFotos } from "./exterior/suelo-fotos.ts";
export { IdTiles, creaOlivosTiles, manifiestoOlivosTiles } from "./exterior/olivos-tiles.ts";
export type { DepsOlivosTiles, GanchosTiles, OlivosTiles } from "./exterior/olivos-tiles.ts";
export { LruTilesPuro, RayosPuro, creaEscena3D, limitaAviso, manifiestoEscena3D, motivoMarco } from "./exterior/escena-tiles.ts";
export type { DepsEscena3D, Escena3D, LimitesLru } from "./exterior/escena-tiles.ts";
export { creaMundo, RADIO_SUELTA, RADIO_CARGA } from "./exterior/teselas.ts";
export type { DepsMundo, Mundo, Tesela, DatosMundo, Mosaico, EstadoOrto, EstadoTeselas } from "./exterior/teselas.ts";
export { creaSombreadoTiles, uniformesTerreno, hash } from "./exterior/terreno.ts";
export type { DepsTerreno, DepsUniformes, SombreadoTiles, UniformesTerreno, ThreeTerreno, SueloFotosMin, SueloFotosPuroMin } from "./exterior/terreno.ts";
export { creaNdvi, rampa, u8aI16 } from "./exterior/ndvi.ts";
export type { DepsNdvi, DatosNdvi, IndiceNdvi, Ndvi } from "./exterior/ndvi.ts";
export { manifiestoCapaNdvi } from "./exterior/capa-ndvi.ts";
export type { DepsCapaNdvi } from "./exterior/capa-ndvi.ts";
// A3-2b (MU5-n): el tope de triángulos de los olivos del motor (Q0n; antes 02m_tope_olivos.js).
export { creaTopeOlivos, creaTopeOlivosPuro } from "./exterior/tope-olivos.ts";
export type { DepsTopeOlivos, TopeOlivos, TopeOlivosPuro, TopeTilesPuroMin } from "./exterior/tope-olivos.ts";
