// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: XrPerillas
// Consume: 02m_tope_olivos (TopeOlivos)
// ===============================================================================
  // ---------- perillas de rendimiento VR por URL (Q0b; doc/sistema/VR.md#perillas-de-rendimiento-por-url) (A1-11 / MU1-7): migrado a TypeScript; el código vive en apps/web/src/nucleo/xr-perillas.ts (MUNDOS §9.4)
  // [talón] apps/web/src/nucleo/xr-perillas.ts
  var XrPerillas = Nucleo.creaXrPerillas({
    busqueda: typeof location !== "undefined" ? location.search : "",
    almacen: function () { return window.localStorage; },
    ignoradosOlivos: function () { return typeof TopeOlivos !== "undefined" ? TopeOlivos.ignorados : []; }
  });
