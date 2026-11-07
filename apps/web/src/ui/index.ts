// Lo que da la interfaz (A3-7a, MU5-n; MUNDOS §1) al arranque (src/arranque.ts), que la ve como `Interfaz.<nombre>` («UI» ya es una variable local del medidor).
// Va aparte porque la frontera lo pide (hasta A3-8c, con su propio alias del puente con la IIFE de apps/web/motor/, «@gemelo/ui»):
// ui/ importa solo de nucleo/ y datos/, y nadie de src/ salvo el arranque importa de ui/ (ni nucleo/, ni datos/, ni red/, ni mundos/: dependency-cruiser). Lo de un mundo
// concreto que la interfaz enseña (el minimapa del exterior, las cifras de los olivos en el contador) le llega por argumento desde el arranque, nunca por import.

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
// A3-7a: la Configuración (antes 33_ajustes.js), componente de todo mundo.
export { AjustesPuro, ID_CONFIGURACION, creaAjustes, manifiestoAjustes } from "./ajustes.ts";
export type { Ajustes, DepsAjustes } from "./ajustes.ts";
// A3-7a: el minimapa (antes 17_minimapa.js), componente SOLO DEL EXTERIOR (dibuja la finca, que le llega por argumento).
export { ID_MINIMAPA, creaMinimapa, manifiestoMinimapa } from "./minimapa.ts";
export type { DepsMinimapa, MinimapaUI } from "./minimapa.ts";
// A3-7a: los ganchos de las pruebas, window.__g (antes 27_debug.js); no es un componente.
export { creaGanchos } from "./ganchos.ts";
export type { DepsGanchos, Ganchos } from "./ganchos.ts";
// A3-7a: el contador de ?debug (antes 28_depura.js), componente de todo mundo.
export { ID_CONTADOR, creaDepura, manifiestoDepura } from "./depura.ts";
export type { DepsDepura, Depura } from "./depura.ts";
// A3-7a: el medidor de fotogramas (antes 30_mide.js), componente de todo mundo.
export { ID_MEDIDOR, MideEst, manifiestoMide } from "./mide.ts";
export type { DepsMide } from "./mide.ts";
// A3-7a: las láminas (antes 02d_laminas.js), componente de todo mundo.
export { ID_LAMINAS, LaminasPuro, creaLaminas, manifiestoLaminas } from "./laminas.ts";
export type { DepsLaminas, Laminas } from "./laminas.ts";
// A3-7a: Entidades y Usables (antes 02e_entidades.js; EntidadesPuro sigue en nucleo/entidades.ts), componente de todo mundo.
export { ID_USABLES, creaEntidades, manifiestoEntidades } from "./entidades.ts";
export type { DepsEntidades, EntidadesUsables } from "./entidades.ts";
// A3-7b2: el interruptor «Avisarme por correo» (antes 49_avisos_correo.js), componente de todo mundo; su libera() cancela lo que esté en vuelo.
export { ID_AVISOS_CORREO, creaAvisosCorreo, manifiestoAvisosCorreo } from "./avisos-correo.ts";
export type { AvisosCorreo, DepsAvisosCorreo } from "./avisos-correo.ts";
// A3-7b2: la agenda en el mundo (antes 43_agenda.js), componente de todo mundo; su libera() cancela las peticiones en vuelo y la espera de «Entrar en la visita».
export { ID_AGENDA, manifiestoAgenda } from "./agenda.ts";
export type { Agenda, DepsAgenda } from "./agenda.ts";
// A3-7b2: la visita guiada (antes 46_guiada.js), componente de todo mundo; su libera() cancela además las peticiones a la api en vuelo.
export { ID_GUIADA, creaGuiada, manifiestoGuiada } from "./guiada.ts";
export type { DepsGuiada, Guiada } from "./guiada.ts";
// A3-8b: el mundo en modo oficina (antes 39_oficina_mundo.js y, en A3-7b2, mundos/exterior/oficina-mundo.ts): los anuncios, las invitaciones y el panel, componente de todo mundo.
// Las balizas oficiales, del exterior, son otro componente (Mundos.manifiestoOficinaBalizas), que consume este.
export { ID_OFICINA_MUNDO, OficinaMundoPuro, creaOficinaMundo, manifiestoOficinaMundo } from "./oficina-mundo.ts";
export type { DepsOficinaMundo, OficinaMundo } from "./oficina-mundo.ts";
