// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Lejanos
// Consume: 02b_cola (ColaExt), 02i_materiales (Materiales), 03_escena (renderer, Estado), 06_arboles (gArboles), 07ab_generados (Generados)
// ===============================================================================
  // ---------- los olivos LEJANOS de la escalera (ADR-0019 §2, fase A, O8c), solo con ?olivos=escalera o con ?olivos=gen y variantes horneadas (modoGen de 07ab): sin ellas no crea
  // nada ni gasta nada. Todo olivo a menos de U2 m de la cámara que no está en 3D (07ab) se dibuja en UNA malla instanciada para toda la finca (1 llamada), con impostores
  // (los dos atlas de O8b) o, de salvaguarda, con un sustituto horneado en el navegador. MU5-n (A3-2b): migrado a TypeScript; el código y la explicación entera viven en
  // apps/web/src/mundos/exterior/lejanos.ts, componente «lejanos» de los mundos ["exterior"] con un libera() que suelta la malla, los materiales, las texturas (y los ImageBitmap
  // de los atlas, L2-08), el blanco del horneado y el trabajo de la Cola (lo registra 90_final.js, como los de A3-1a). Aquí se cablea lo del legado.
  var Lejanos = Mundos.creaLejanos({ THREE: THREE, renderer: renderer, Estado: Estado, gArboles: gArboles, Materiales: Materiales, ColaExt: typeof ColaExt !== "undefined" ? ColaExt : null, Generados: Generados,
    fetch: function (u, o) { return fetch(u, o); }, crearBitmap: function (b, o) { return createImageBitmap(b, o); } });   // los atlas de impostores (mismo origen)
