// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Follaje, matHojaG, matHojaP, matCorteza, matSombra, geoSombra, follajeG, construyeSombras
// Consume: 01_datos (ESC_R8), 02_mundo (suelo, copaAlta, aviva, colorEn, copas), 02g_vr_presupuesto (VrPresupuesto), 02i_materiales (Materiales),
//   02j_estaticos (Estaticos), 03_escena (texColor, Estado), 04d_sombreado_tiles (hash), 06_arboles (gSombras, radioEn),
//   18_paisaje (sombrasSol, instSombra), 23_estacion (construyeFrutosLista)
// ===============================================================================

  // follaje: cada punto LiDAR de copa es un montoncito de hojas plateadas (sprites con textura propia). MU5-n (A3-2b): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/follaje.ts (las texturas, los cuatro materiales, follajeG y las manchas de sombra), componente «follaje» de los mundos ["exterior"] con un
  // libera() que suelta la malla de sombras, la geometría, los materiales y las texturas (lo registra 90_final.js, como los de A3-1a). L2-01, L5-02 y L1-08: construyeSombras
  // ya no vacía gSombras sin dispose (perdía un búfer por llamada y sacaba las sombras del paisaje, instSombraPA, de 18_paisaje): rehace solo SU malla. Aquí se cablea lo del legado.
  var Follaje = Mundos.creaFollaje({
    THREE: THREE, lienzo: function (lado) { var cv = document.createElement("canvas"); cv.width = cv.height = lado; return cv; }, texColor: texColor, Materiales: Materiales, Estaticos: Estaticos,
    gSombras: gSombras, Estado: Estado, ESC_R8: ESC_R8, suelo: suelo, copaAlta: copaAlta, aviva: aviva, colorEn: colorEn, hash: hash, copas: copas, radioEn: radioEn,
    construyeFrutosLista: function (g) { construyeFrutosLista(g); },   // 23_estacion se carga después
    sombrasSol: function (forzar) { sombrasSol(forzar); },   // 18_paisaje, que lee instSombra
    ponInstSombra: function (m) { instSombra = m; },   // instSombra es de 18_paisaje (la escribe este módulo, como siempre)
    VrPresupuesto: typeof VrPresupuesto !== "undefined" ? VrPresupuesto : null
  });
  var matHojaG = Follaje.matHojaG, matHojaP = Follaje.matHojaP, matCorteza = Follaje.matCorteza, matSombra = Follaje.matSombra, geoSombra = Follaje.geoSombra;
  var follajeG = Follaje.follajeG, construyeSombras = Follaje.construyeSombras;
