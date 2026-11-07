// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Menu, TR, iniciaTransicion, transEntrada, iniciaSalida, transSalida
// Consume: 01_datos ($), 02c_componentes (Bus, Componentes), 03_escena (camera), 12_paseo (paseando, persona, pp), 16_vida (altSuelo),
//   22_huellas (sueloSeco), 31_hud (Hud), 90_final (tamano)
// ===============================================================================
  // ---------- la página ES el visor (decisión 83): el menú (☰ o Esc), la pantalla completa de verdad (⛶ o F) y la transición del mapa al paseo.
  // MU5-n (A3-7a): migrado a TypeScript. El menú y la pantalla completa viven en apps/web/src/ui/pantalla.ts, componente «menu-pantalla» de TODOS los mundos con un
  // libera() que quita sus escuchas; la transición (TR: la cámara que baja volando y el muñeco que cae), en apps/web/src/mundos/comun/transicion.ts (es de la locomoción,
  // como el paseo; sin nada que soltar). Aquí solo se cablea lo del legado: lo que cambia o se declara después (paseando, persona, Hud, tamano) entra por getter.
  // [talón] apps/web/src/ui/pantalla.ts
  var MenuPantalla = Interfaz.creaPantalla({
    $: $, get paseando() { return paseando; }, get Hud() { return typeof Hud !== "undefined" ? Hud : undefined; }, get tamano() { return tamano; }, ventana: window, documento: document
  });
  var Menu = MenuPantalla.Menu;
  var Transicion = Mundos.creaTransicion({ THREE: THREE, camera: camera, pp: pp, altSuelo: altSuelo, sueloSeco: sueloSeco, Bus: Bus, get persona() { return persona; } });
  var TR = Transicion.TR, iniciaTransicion = Transicion.iniciaTransicion, transEntrada = Transicion.transEntrada, iniciaSalida = Transicion.iniciaSalida, transSalida = Transicion.transSalida;
  Componentes.registra(Interfaz.manifiestoPantalla(MenuPantalla));
