// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: pendienteRumbo, pendFactor, quadInc, inclinaQuad, sueloSeco
// Consume: 02_mundo (suelo), 03_escena (Estado), 12_paseo (pp), 15_tiempo (cur), 16_vida (quad), 18_paisaje (aguaNivel), 21_suelo (cubierta)
// ===============================================================================
  // ---------- huellas, polvo y pendiente: el suelo se deja marcar y el quad y el paso se adaptan al terreno. MU5-n (A3-5): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/huellas.ts (pendienteRumbo, pendFactor, quadInc, inclinaQuad y sueloSeco; sin recursos que soltar, así que no es un componente). Aquí solo se cablea
  // lo del legado. (Las huellas y el polvo son el componente «huellas-polvo»: 22b_huellas_polvo.js.)
  // (no lleva la marca de talón porque expone alias sueltos: pendienteRumbo, pendFactor, quadInc, inclinaQuad y sueloSeco)
  var Huellas = Mundos.creaHuellas({
    suelo: suelo, Estado: Estado, pp: pp, quad: function () { return quad; }, cur: cur,
    aguaNivel: function () { return aguaNivel; },   // 18_paisaje: un valor que cambia
    cubierta: function (x, y) { return cubierta(x, y); }   // 21_suelo, que se carga después
  });
  var pendienteRumbo = Huellas.pendienteRumbo, pendFactor = Huellas.pendFactor, quadInc = Huellas.quadInc, inclinaQuad = Huellas.inclinaQuad, sueloSeco = Huellas.sueloSeco;
