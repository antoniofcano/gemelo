// El tipo común de la interfaz (A3-7a, MU5-n). ui/ es lo que la persona ve y toca fuera del mundo 3D o encima de él (MUNDOS §1): el DOM de la página (el HUD,
// las ventanas, el menú, la Configuración, el minimapa, la caja del medidor y el contador de ?debug) y las láminas (un lienzo 2D como cartel en el mundo, que es
// interfaz aunque se dibuje en la escena). Recibe todo lo del legado por argumento (las dependencias de cada fábrica): el código se movió tal cual desde
// apps/web/motor/ y conserva sus tipos sueltos, como el de mundos/comun/tipos.ts (que ui/ no puede importar: la frontera de ui/ no incluye mundos/).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type T = any;
