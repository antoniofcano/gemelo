// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: TopeTilesPuro
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- Q0k: el tileset 3D (04b_escena3d.js) respeta el tope de triángulos de cada nivel de VR (doc/sistema/VR.md#tope-de-triángulos-del-tileset-q0k).
  // MU5-n (A3-8a): migrado a TypeScript; el lazo (sube el error del tileset si sus triángulos pasan del tope y lo baja cuando sobra) vive en apps/web/src/nucleo/tope-tiles.ts.
  // [talón] apps/web/src/nucleo/tope-tiles.ts
  var TopeTilesPuro = Nucleo.TopeTilesPuro;
