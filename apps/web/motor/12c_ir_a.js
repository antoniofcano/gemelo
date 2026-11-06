// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: IrA
// Consume: 02_mundo (suelo, copas), 02c_componentes (Componentes), 02i_materiales (Materiales), 03_escena (scene, Estado),
//   12_paseo (paseando, teclas, pp), 12b_llegada (Llegada), 16_vida (enQuad, enDron), 29_vr (VRX), 33_ajustes (Ajustes), 90_final (gm)
// ===============================================================================
  // ---------- tocar para ir andando (tanda 9): en pantalla (ratón y táctil, no en VR), a pie, un clic o un toque corto en el suelo hace que el paseante camine hasta allí, rodeando
  // los troncos, con el anillo de la llegada en el destino y una línea de puntos que marca el camino. La lógica pura pasó a TypeScript (A1-11 / MU1-7): apps/web/src/nucleo/locomocion.ts.
  // MU5-n (A3-6c): el resto también; vive en apps/web/src/mundos/comun/ir-a.ts, componente «ir-a» de TODOS los mundos (la locomoción es de todo mundo) con un libera() que suelta la línea.
  // Aquí solo se cablea lo del legado: lo que otros reescriben o se declara después (paseando, teclas, enQuad, enDron, VRX, Ajustes, gm) entra por función.
  // [talón] apps/web/src/mundos/comun/ir-a.ts
  var IrAPuro = Nucleo.IrAPuro;
  var IrA = Mundos.creaIrA({
    THREE: THREE, scene: scene, Estado: Estado, Materiales: Materiales, suelo: suelo, copas: function () { return copas; }, pp: pp, Llegada: Llegada,
    paseando: function () { return paseando; }, teclas: function () { return teclas; }, enQuad: function () { return enQuad; }, enDron: function () { return enDron; },
    VRX: function () { return VRX; }, Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; }, gm: function () { return gm; },
    busqueda: typeof location !== "undefined" ? location.search : ""
  });
  Componentes.registra(Mundos.manifiestoIrA(IrA));
