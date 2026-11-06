// La puerta de los mundos hacia el legado (MUNDOS §9.3; MU2-3): lo que exporta este fichero es lo que ve la IIFE de apps/web/motor/ como `Mundos.<nombre>`.
// Igual que el puente del núcleo (nucleo/index.ts), pero aparte: nucleo/ no puede importar de mundos/ (dependency-cruiser), así que los mundos que el legado
// monta (hoy solo el exterior) entran por su propio alias, «@gemelo/mundos», que genera_motor.mjs escribe detrás del de «@gemelo/nucleo».
// Los interiores NO pasan por aquí: son trozos perezosos (`import("@gemelo/mundo-bodega")`). El vacío (MU2-6) es la excepción: el interior de prueba,
// sin assets, que 90_final registra para ?mundo=vacio (MU2-8).
export { creaCargaTeselas, creaExterior } from "./exterior.ts";
export type { ConEstilo, DepsAmbienteExterior, DepsCargaTeselas, DepsExterior, Visible } from "./exterior.ts";
export { creaVacio } from "./vacio.ts";
export type { DepsVacio, FabricaLuz } from "./vacio.ts";
