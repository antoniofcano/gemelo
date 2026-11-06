// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Ventanas
// Consume: 01_datos ($), 02c_componentes (Componentes), 03_escena (lienzo, visor), 12_paseo (paseando), 34_movibles (Movibles)
// ===============================================================================
  // ---------- las ventanas (doc/sistema/UX-FINCA-JUEGO.md §4.4, decisión 87): una grande a la vez, no modales; al abrir, el foco va al título; al cerrar, vuelve a quien
  // la abrió. MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/ventanas.ts (VentanasPuro y Ventanas), componente «ventanas» de TODOS los mundos
  // con un libera() que cierra la abierta, saca las registradas y quita sus escuchas. Aquí solo se cablea lo del legado: paseando cambia y Movibles se monta después.
  // [talón] apps/web/src/ui/ventanas.ts
  var VentanasPuro = Interfaz.VentanasPuro;
  var Ventanas = Interfaz.creaVentanas({
    $: $, lienzo: lienzo, visor: visor, get paseando() { return paseando; }, get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; },
    ventana: window, documento: document
  });
  Componentes.registra(Interfaz.manifiestoVentanas(Ventanas));
