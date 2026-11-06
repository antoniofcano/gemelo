// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Arboles0, gArboles, gFollaje, gSombras, radioEn, arbolesG
// Consume: 01_datos (D, fmt, FACTOR_R8, ESC_R8), 02_mundo (suelo, aviva, colorEn, copas, marc), 02e_entidades (Entidades),
//   02i_materiales (Materiales), 02j_estaticos (Estaticos), 03_escena (scene, camera, colorVertSRGB, Estado), 04d_sombreado_tiles (hash),
//   07ab_generados (Generados), 13_parcelas (parcelas)
// ===============================================================================
  // ---------- los olivos del modo Gemelo: copa con la forma real medida (8 radios) y tronco debajo (nivel 0, por celdas de 64 m; ver Arboles). MU5-n (A3-2b): migrado a TypeScript;
  // el código vive en apps/web/src/mundos/exterior/arboles-l0.ts (los grupos gArboles y gSombras, los materiales del nivel 0, arbolesG, radioEn y la entidad «olivo»), componente
  // «arboles-l0» de los mundos ["exterior"] con un libera() que suelta los grupos, la entidad y los materiales (lo registra 90_final.js, como los de A3-1a). L5-01: el tronco del nivel 0 ya no comparte nombre con el del paisaje.
  var Arboles0 = Mundos.creaArbolesL0({
    THREE: THREE, scene: scene, camera: camera, Estaticos: Estaticos, Materiales: Materiales, Entidades: Entidades, Estado: Estado, D: D, fmt: fmt, FACTOR_R8: FACTOR_R8, ESC_R8: ESC_R8,
    suelo: suelo, aviva: aviva, colorEn: colorEn, hash: hash, copas: copas, marc: marc, colorVertSRGB: colorVertSRGB,
    Generados: { rotulo: function (i) { return Generados.rotulo(i); }, escalera: function () { return Generados.escalera(); } },   // 07ab se carga después: por función
    parcelas: function () { return parcelas; }   // 13_parcelas, después de este módulo
  });
  var gArboles = Arboles0.gArboles, gFollaje = Arboles0.gFollaje, gSombras = Arboles0.gSombras, radioEn = Arboles0.radioEn, arbolesG = Arboles0.arbolesG;
