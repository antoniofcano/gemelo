// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Render, InfoDibujo
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- AG-3a / F1: el renderizador elegido y la lectura de lo dibujado (A1-11 / MU1-7): migrado a TypeScript; el código vive en apps/web/src/nucleo/render.ts (MUNDOS §6 y §9.4)
  // [talón] apps/web/src/nucleo/render.ts
  var Render = Nucleo.creaRender({
    busqueda: typeof location !== "undefined" && location ? location.search : "",
    build: typeof __GEMELO_BUILD__ !== "undefined" ? __GEMELO_BUILD__ : "pantalla",   // lo inyecta Vite (apps/web/vite.config.js)
    almacen: function () { return window.localStorage; },
    consola: typeof console !== "undefined" ? console : null
  });
  var InfoDibujo = Nucleo.InfoDibujo;
