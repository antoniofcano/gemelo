// La puerta de la interfaz hacia el legado (A3-7a, MU5-n; MUNDOS §1 y §9.3): lo que exporta este fichero es lo que ve la IIFE de apps/web/motor/ como
// `Interfaz.<nombre>`, con su propio alias, «@gemelo/ui», que genera_motor.mjs escribe detrás del de «@gemelo/mundos». Va aparte porque la frontera lo pide:
// ui/ importa solo de nucleo/ y datos/, y nadie de src/ importa de ui/ (ni nucleo/, ni datos/, ni red/, ni mundos/: dependency-cruiser). Lo de un mundo
// concreto que la interfaz enseña (el minimapa del exterior, las cifras de los olivos en el contador) le llega por argumento desde el legado, nunca por import.

// A3-7a (MU5-n): las capas del mundo (antes 32b_capas.js), componente de todo mundo con su libera() de verdad.
export { CapasPuro, ID_CAPAS, creaCapas, manifiestoCapas } from "./capas.ts";
export type { Capas, DepsCapas } from "./capas.ts";
