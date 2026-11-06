// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (Mundo), 02c_componentes (Componentes), 02g_vr_presupuesto (VrPresupuestoPuro, VrPresupuesto),
//   02i_materiales (Materiales), 03_escena (scene, Estado), 04b_escena3d (Escena3D), 04d_sombreado_tiles (matSuelo, UN)
// ===============================================================================
  // ---------- M6: el suelo de fondo (MU5-n, A3-1b: migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/suelo-fondo.ts). Una malla con el relieve GRUESO
  // del índice y el mosaico de 1 m, POR DEBAJO del tileset, que tapa el vacío de los bordes. Componente «suelo-fondo» (ADR-0023), fase «tarde», de los mundos ["exterior"];
  // ?fondo=0 lo apaga (y ?sinFondo). Comparte la textura del mosaico y el color de 04d (matSuelo). Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/suelo-fondo.ts
  Componentes.registra(Mundos.manifiestoSueloFondo({
    THREE: THREE, D: D, Mundo: Mundo, UN: UN, matSuelo: matSuelo, Escena3D: Escena3D, scene: scene, Estado: Estado, Materiales: Materiales,
    VrPresupuesto: typeof VrPresupuesto !== "undefined" ? VrPresupuesto : null, VrPresupuestoPuro: typeof VrPresupuestoPuro !== "undefined" ? VrPresupuestoPuro : null,
    busqueda: typeof location !== "undefined" ? location.search : ""
  }));
