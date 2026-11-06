// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Movibles
// Consume: 02c_componentes (Componentes), 03_escena (visor), 31_hud (Hud)
// ===============================================================================
  // ---------- ventanas flotantes que se pueden mover (UX-del-juego §6): el chat, su burbuja y el minimapa se arrastran por su barra, recuerdan su sitio por forma
  // de pantalla y nunca se quedan encima de los controles. MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/movibles.ts (MoviblesPuro y
  // Movibles), componente «movibles» de TODOS los mundos con un libera() que quita sus escuchas, su observador y los nodos que crea. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/ui/movibles.ts
  var MoviblesPuro = Interfaz.MoviblesPuro;
  var Movibles = Interfaz.creaMovibles({ visor: visor, get Hud() { return typeof Hud !== "undefined" ? Hud : undefined; }, ventana: window, documento: document });
  Componentes.registra(Interfaz.manifiestoMovibles(Movibles));
