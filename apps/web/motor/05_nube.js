// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: ALTO_MAX, nube, pintaNube, actualizaNubeTeselas, actualizaNube
// Consume: 02_mundo (Mundo, suelo, copaAlta, kcor, tinte, aviva, colorEn), 02b_cola (ColaExt), 02c_componentes (Componentes),
//   02i_materiales (Materiales), 02j_estaticos (Estaticos), 03_escena (scene, camera, Estado), 04d_sombreado_tiles (hash), 10_ndvi (ndviIdx),
//   15_tiempo (parcheTiempo)
// ===============================================================================
  // ---------- nube de puntos LiDAR: una malla por tesela, con las posiciones cuantizadas a 16 bits y el color a 8, y nivel de detalle por distancia.
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/nube.ts (Mundos.creaNube), componente «nube-lidar» de los mundos ["exterior"] con un libera()
  // que suelta las mallas, los trabajos de la Cola, el grupo y los materiales. Con los hallazgos de la auditoría: la nube solo existe en el modo «nube» (L1-01, L2-02), se suelta a
  // la distancia a la que el Mundo carga (L2-02) y el presupuesto de puntos se reparte entre todos los niveles y se recalcula en cada pasada (L1-02). Aquí solo se cablea lo del legado.
  // kcor, tinte y ndviIdx los reescriben 09_camara y 10_ndvi (primitivas del legado, no pueden ser importaciones, MUNDOS §9.3): entran como funciones que los leen en cada uso.
  // [talón] apps/web/src/mundos/exterior/nube.ts
  var Nube = Mundos.creaNube({
    THREE: THREE, Mundo: Mundo, suelo: suelo, copaAlta: copaAlta, aviva: aviva, colorEn: colorEn, hash: hash, parcheTiempo: parcheTiempo,
    kcor: function () { return kcor; }, tinte: function () { return tinte; }, ndviIdx: function () { return ndviIdx; },   // parcheTiempo es una función declarada (se iza) y solo se llama al compilar
    ColaExt: ColaExt, Materiales: Materiales, Estaticos: Estaticos, scene: scene, camera: camera, Estado: Estado
  });
  var ALTO_MAX = Nube.ALTO_MAX, nube = Nube.nube, pintaNube = Nube.pintaNube, actualizaNubeTeselas = Nube.actualizaNubeTeselas, actualizaNube = Nube.actualizaNube;
  Componentes.registra(Mundos.manifiestoNube(Nube));
