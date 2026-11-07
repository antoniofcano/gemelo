// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: objetivo, orb, camara, sensMirar, pon
// Consume: 01_datos ($, fmt, DIST_MAX, DIST_INI), 02_mundo (kcor), 02c_componentes (Componentes), 02e_entidades (Usables),
//   03_escena (lienzo, camera, Estado), 08_marcadores (aplica, capas, aplicaLuego), 12_paseo (paseando), 12c_ir_a (IrA),
//   13_parcelas (Parcelas, elegirParcela), 33_ajustes (Ajustes)
// ===============================================================================

  // cámara orbital y los gestos de la vista aérea (girar, acercar, desplazar, el toque que elige o echa a andar), los botones de modo, las capas y los deslizadores.
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/camara.ts, componente «camara-orbital» de TODOS los mundos con un libera() que quita sus escuchas.
  // Aquí solo se cablea lo del legado: lo que otros reescriben o se declara después (paseando, kcor, IrA, parcelaSel, elegirParcela, Ajustes) entra por función (parcelaSel, por Parcelas.parcelaSel(): A3-7b1).
  // [talón] apps/web/src/mundos/comun/camara.ts
  var Camara = Mundos.creaCamara({
    THREE: THREE, camera: camera, lienzo: lienzo, Estado: Estado, $: $, fmt: fmt, DIST_MAX: DIST_MAX, DIST_INI: DIST_INI, Usables: Usables, aplica: aplica, capas: capas, aplicaLuego: aplicaLuego,
    paseando: function () { return paseando; }, ponKcor: function (v) { kcor = v; }, IrA: function () { return IrA; }, parcelaSel: function () { return Parcelas.parcelaSel(); },
    elegirParcela: function (i) { elegirParcela(i); }, Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; }
  });
  var objetivo = Camara.objetivo, orb = Camara.orb, camara = Camara.camara, sensMirar = Camara.sensMirar, pon = Camara.pon;
  Componentes.registra(Mundos.manifiestoCamara(Camara));
