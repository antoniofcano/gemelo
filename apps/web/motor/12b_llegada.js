// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Llegada
// Consume: 01_datos ($), 02c_componentes (Componentes), 02i_materiales (Materiales), 03_escena (lienzo, visor, scene, camera, Estado),
//   12_paseo (paseando, pp, camPos, entraPaseo), 16_vida (enDron, ponDron), 29_vr (VRX, vrFundido, vrAparece), 90_final (gm)
// Nota: Publica además window.__llegada (pruebas). LlegadaPuro vive en apps/web/src/nucleo/locomocion.ts (A1-11; sus pruebas, en locomocion.test.ts); el módulo conserva el anillo, el velo y los oyentes, que tocan THREE y el DOM.
// ===============================================================================
  // ---------- la llegada: el anillo en el suelo adonde quieres ir y el salto hasta él (de pie, fuera de troncos, a la altura del suelo, andando), en VR (volando o en el mirador)
  // y en pantalla (con el Dron). La lógica pura pasó a TypeScript (A1-11 / MU1-7): apps/web/src/nucleo/locomocion.ts. MU5-n (A3-6c): el resto también; vive en
  // apps/web/src/mundos/comun/llegada.ts, componente «anillo-llegada» de TODOS los mundos (la locomoción es de todo mundo) con un libera() que suelta el anillo, el velo y sus escuchas.
  // Aquí solo se cablea lo del legado: lo que otros reescriben o se declara después (paseando, enDron, ponDron, VRX, vrFundido, vrAparece, gm) entra por función.
  // [talón] apps/web/src/mundos/comun/llegada.ts
  var LlegadaPuro = Nucleo.LlegadaPuro;
  var Llegada = Mundos.creaLlegada({
    THREE: THREE, scene: scene, camera: camera, Estado: Estado, Materiales: Materiales, lienzo: lienzo, visor: visor, $: $, pp: pp, camPos: camPos, entraPaseo: entraPaseo,
    paseando: function () { return paseando; }, enDron: function () { return enDron; }, ponDron: function (on) { ponDron(on); }, VRX: function () { return VRX; },
    vrFundido: function (fn) { return vrFundido(fn); }, vrAparece: function (x, y, ang) { vrAparece(x, y, ang); }, gm: function () { return gm; },
    documento: document, ventana: window
  });
  Componentes.registra(Mundos.manifiestoLlegada(Llegada));
