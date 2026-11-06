// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Materiales
// Consume: 02f_xr_perillas (XrPerillas), 02h_render (Render)
// ===============================================================================
  // ---------- AG-3a / F1 y MU5-0: la fábrica ÚNICA de los materiales propios del motor (doc/sistema/MATERIALES.md, MULTIVIEW §4, ADR-0031): migrada a
  // TypeScript; el código vive en apps/web/src/nucleo/materiales.ts. Da el material clásico de siempre (el mismo, con la misma función de parche) y, solo
  // con el renderizador nuevo (MU6) y si el material tiene variante TSL, la TSL. Lo vigilan pruebas/guardianes/materiales_f1.test.js y materiales.test.ts.
  // [talón] apps/web/src/nucleo/materiales.ts
  var Materiales = Nucleo.creaMateriales({
    THREE: THREE,
    render: Render,   // se lee en cada material: Render.tipo «nuevo» (hasta MU6, nunca) es lo único que abre la ruta TSL
    busqueda: typeof location !== "undefined" && location ? location.search : "",
    msaa: typeof XrPerillas !== "undefined" && XrPerillas ? XrPerillas.aa : true,   // se lee UNA vez (la perilla de MSAA de 02f), como antes
    almacen: function () { return window.localStorage; },   // «vista.a2c», leído UNA vez (33_ajustes se monta después; mismo patrón que 04f)
    consola: typeof console !== "undefined" ? console : null
  });
