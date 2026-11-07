// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Ajustes
// Consume: 01_datos ($, fmt), 02c_componentes (Bus, Componentes), 02h_render (Render), 03_escena (renderer), 31_hud (Hud), 34_movibles (Movibles),
//   90_final (tamano)
// ===============================================================================
  // ---------- Configuración (UX-FINCA-JUEGO §4.5): los ajustes de la persona, guardados en localStorage (prefijo gemelo.ajustes.); una URL manda sobre el ajuste
  // (?debug, &mide=). Los módulos que dependen de un ajuste lo LEEN (Ajustes.lee) o se suscriben (Ajustes.alCambiar).
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/ajustes.ts (AjustesPuro y Ajustes), componente «configuracion» de TODOS los mundos con un
  // libera() que quita sus escuchas y saca la interfaz que pinta. Aquí solo se cablea lo del legado: Hud, Movibles y tamano se leen en cada uso (por getter).
  // [talón] apps/web/src/ui/ajustes.ts
  var AjustesPuro = Interfaz.AjustesPuro;
  var Ajustes = Interfaz.creaAjustes({
    $: $, fmt: fmt, Bus: Bus, Render: Render, renderer: renderer, get Hud() { return typeof Hud !== "undefined" ? Hud : undefined; },
    get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; }, get tamano() { return typeof tamano !== "undefined" ? tamano : undefined; }, ventana: window, documento: document
  });
  Componentes.registra(Interfaz.manifiestoAjustes(Ajustes));
