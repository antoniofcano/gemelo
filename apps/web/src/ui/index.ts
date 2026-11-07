// La puerta de la interfaz hacia el legado (A3-7a, MU5-n; MUNDOS §1 y §9.3): lo que exporta este fichero es lo que ve la IIFE de apps/web/motor/ como
// `Interfaz.<nombre>`, con su propio alias, «@gemelo/ui», que genera_motor.mjs escribe detrás del de «@gemelo/mundos». Va aparte porque la frontera lo pide:
// ui/ importa solo de nucleo/ y datos/, y nadie de src/ importa de ui/ (ni nucleo/, ni datos/, ni red/, ni mundos/: dependency-cruiser). Lo de un mundo
// concreto que la interfaz enseña (el minimapa del exterior, las cifras de los olivos en el contador) le llega por argumento desde el legado, nunca por import.

// A3-7a (MU5-n): las capas del mundo (antes 32b_capas.js), componente de todo mundo con su libera() de verdad.
export { CapasPuro, ID_CAPAS, creaCapas, manifiestoCapas } from "./capas.ts";
export type { Capas, DepsCapas } from "./capas.ts";
// A3-7a: las ventanas flotantes (antes 34_movibles.js), componente de todo mundo.
export { ID_MOVIBLES, MoviblesPuro, creaMovibles, manifiestoMovibles } from "./movibles.ts";
export type { DepsMovibles, Movibles } from "./movibles.ts";
export { creaSoltador } from "./soltador.ts";
export type { Soltador } from "./soltador.ts";
// A3-7a: las ventanas (antes 32_ventanas.js), componente de todo mundo.
export { ID_VENTANAS, VentanasPuro, creaVentanas, manifiestoVentanas } from "./ventanas.ts";
export type { DepsVentanas, Ventanas } from "./ventanas.ts";
// A3-7a: el HUD (antes 31_hud.js), componente de todo mundo; su libera() para sus relojes (L2-11).
export { HudPuro, ID_HUD, creaHud, manifiestoHud } from "./hud.ts";
export type { DepsHud, Hud } from "./hud.ts";
// A3-7a: lo tuyo en pantalla (antes 31b_hud_personal.js), componente de todo mundo; su libera() para su reloj (L2-11).
export { HudPersonalPuro, ID_HUD_PERSONAL, creaHudPersonal, manifiestoHudPersonal } from "./hud-personal.ts";
export type { DepsHudPersonal, HudPersonal } from "./hud-personal.ts";
// A3-7a: el menú y la pantalla completa (antes la primera mitad de 24_pantalla.js), componente de todo mundo.
export { ID_MENU_PANTALLA, creaPantalla, manifiestoPantalla } from "./pantalla.ts";
export type { DepsPantalla, MenuPantalla } from "./pantalla.ts";
