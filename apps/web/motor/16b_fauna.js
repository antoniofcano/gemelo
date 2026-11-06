// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (copas, cIn), 02c_componentes (Componentes), 02i_materiales (Materiales), 02k_fusiona (fusionaGeometrias),
//   03_escena (camera, Estado), 07_follaje (matSombra, geoSombra), 12_paseo (paseando, pp), 15_tiempo (nivelEn, cur),
//   16_vida (tVida, enQuad, gFauna, altSuelo, mira), 17_minimapa (Minimapa)
// ===============================================================================

  // ---------- la fauna del olivar (componente «fauna-olivar», ADR-0023, C10 segunda tanda): las aves (dos bandadas que dan vueltas de día, ocho posadas que se espantan) y los seis
  // conejos que pastan y huyen. Se enteran de que empieza o acaba el paseo por «paseo:entra» / «paseo:sale» (los emite 16_vida.js), preguntan si hay algo de lo que huir con
  // «perros:amenaza» y responden a «fauna:conejo-cerca». Pintan sus conejos en el minimapa. El grupo gFauna (y su casilla «Fauna») siguen en 16_vida.js. ?fauna=0 la apaga.
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/fauna.ts, componente de los mundos ["exterior"] con un libera() que quita las mallas de
  // gFauna, suelta sus geometrías y materiales y la capa del minimapa. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/fauna.ts
  Componentes.registra(Mundos.manifiestoFauna({
    THREE: THREE, Materiales: Materiales, camera: camera, D: D, copas: copas, cIn: cIn, geoSombra: geoSombra, matSombra: matSombra,
    paseando: function () { return paseando; }, pp: pp, cur: cur, nivelEn: nivelEn,   // 12_paseo y 15_tiempo
    tVida: function () { return tVida; }, enQuad: function () { return enQuad; },   // 16_vida: el estado del paseo (cambian cada fotograma: por función)
    gFauna: gFauna, altSuelo: altSuelo, mira: mira, Estado: Estado, Minimapa: Minimapa, fusionaGeometrias: fusionaGeometrias
  }));
