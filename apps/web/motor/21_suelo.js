// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: SN, vn2, cubierta, actualizaSuelo, recoloreaSuelo
// Consume: 01_datos (D, $, i16, x0, yN, ANCHO, ALTO, VRP), 02_mundo (suelo), 02c_componentes (Componentes), 02i_materiales (Materiales),
//   02j_estaticos (Estaticos), 03_escena (scene, texColor, colorVertSRGB, Estado), 04d_sombreado_tiles (hash, UN), 09_camara (objetivo, orb),
//   10_ndvi (NDV, ndviIdx), 12_paseo (paseando, pp), 15_tiempo (uViento, uSombra, GLSL_SOMBRA, num1), 16_vida (enDron, dr),
//   18_paisaje (ejeArroyo, distArroyo)
// ===============================================================================
  // ---------- el suelo según el NDVI (dónde hay tierra desnuda y dónde hierba, y cómo de vigorosa) y las matas de hierba y las piedras alrededor de donde miras.
  // MU5-n (A3-4): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/hierba.ts, componente «hierba-suelo» de los mundos ["exterior"] con un
  // libera() que lo suelta todo (L2-05). Aquí quedan, como extracción parcial, el cableado y los nombres que leen otros módulos (04d, 08, 22, 23 y 90).
  var Hierba = Mundos.creaHierba({
    THREE: THREE, D: D, i16: i16, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, VRP: VRP, $: $, suelo: suelo, scene: scene, Estado: Estado, texColor: texColor, colorVertSRGB: colorVertSRGB,
    Materiales: Materiales, Estaticos: Estaticos, hash: hash, UN: UN, objetivo: objetivo, orb: orb, NDV: NDV, ndviIdx: function () { return ndviIdx; },
    paseando: function () { return paseando; }, pp: pp, uViento: uViento, uSombra: uSombra, GLSL_SOMBRA: GLSL_SOMBRA, num1: num1,
    enDron: function () { return typeof enDron !== "undefined" && enDron; }, dr: function () { return dr; },   // 16_vida, después en el montaje
    ejeArroyo: function () { return typeof ejeArroyo !== "undefined" ? ejeArroyo : []; }, distArroyo: function (x, y) { return distArroyo(x, y); },   // 18_paisaje, después
    lienzo: function () { return document.createElement("canvas"); }
  });
  var SN = Hierba.SN, vn2 = Hierba.vn2, cubierta = Hierba.cubierta, actualizaSuelo = Hierba.actualizaSuelo;
  function recoloreaSuelo() { Hierba.recoloreaSuelo(); }   // declarada (se iza): 08_marcadores, antes en el montaje, se la pasa a su fábrica al cargarse
  Componentes.registra(Mundos.manifiestoHierba(Hierba));
