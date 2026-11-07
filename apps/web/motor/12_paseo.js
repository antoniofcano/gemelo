// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: paseando, persona, teclas, primera, Paseo, pp, camPos, PalancaPuro, ponPalanca, giraPalanca, entraPaseo, salePaseo, actualizaPaseo
// Consume: 01_datos (D, $), 02_mundo (copaAlta), 02i_materiales (Materiales), 03_escena (lienzo, visor, scene, camera, Estado),
//   09_camara (sensMirar), 12c_ir_a (IrA), 13_parcelas (Parcelas, fincas),
//   16_vida (enQuad, enDron, velPaseo, giroPaseo, ponQuad, vidaPaseo, ponDron, cicloVista, dronMando, camaraDron, vidaEntra, vidaSale),
//   24_pantalla (TR, iniciaTransicion, iniciaSalida), 33_ajustes (Ajustes), 90_final (gm)
// ===============================================================================

  // ---------- paseo: una persona que camina por el olivar (flechas o WASD; Mayús corre; V cambia de cámara), con la cruceta, la palanca (PalancaPuro) y la cámara de seguimiento.
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/paseo.ts, componente «paseo» de TODOS los mundos (la locomoción es de todo mundo) con un libera()
  // que suelta el muñequito y quita sus escuchas. El estado que el resto del legado lee por su nombre (paseando, persona, teclas) vive en paseo.ts y se espeja aquí en cuanto cambia;
  // primera es de aquí (la escriben 16_vida y 29_vr) y paseo.ts la lee y la escribe por función. Lo que se declara después (13, 16, 24, 33, 12c, 90) entra por función.
  // El componente lo registra 90_final.js (como Vida), porque este fichero declara las var del estado espejado y no es un talón puro.
  var paseando = false, persona = null, teclas = {}, primera = false;
  var Paseo = Mundos.creaPaseo({
    THREE: THREE, scene: scene, camera: camera, Estado: Estado, Materiales: Materiales, D: D, $: $, lienzo: lienzo, visor: visor, copaAlta: copaAlta, sensMirar: sensMirar,
    primera: function () { return primera; }, ponPrimera: function (v) { primera = v; }, parcelaSel: function () { return Parcelas.parcelaSel(); }, fincaSel: function () { return Parcelas.fincaSel(); },
    fincas: function () { return fincas; }, enQuad: function () { return enQuad; }, enDron: function () { return enDron; }, TR: function () { return TR; },
    iniciaTransicion: function () { iniciaTransicion(); }, iniciaSalida: function () { iniciaSalida(); }, Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; },
    IrA: function () { return IrA; }, gm: function () { return gm; }, documento: document, ventana: window,
    vida: {   // 16_vida se monta después: cada mando de la vida se pide al usarlo
      velPaseo: function (av, dt) { return velPaseo(av, dt); }, giroPaseo: function (v) { return giroPaseo(v); }, ponQuad: function (on) { ponQuad(on); }, ponDron: function (on) { ponDron(on); },
      vidaPaseo: function (dt, gy, vel) { vidaPaseo(dt, gy, vel); }, cicloVista: function () { cicloVista(); }, dronMando: function (av, gi, dt) { dronMando(av, gi, dt); },
      camaraDron: function (dt, gy) { return camaraDron(dt, gy); }, vidaEntra: function () { vidaEntra(); }, vidaSale: function () { vidaSale(); }
    },
    espeja: function (e) { paseando = e.paseando; persona = e.persona; teclas = e.teclas; }
  });
  var pp = Paseo.pp, camPos = Paseo.camPos, PalancaPuro = Paseo.PalancaPuro, ponPalanca = Paseo.ponPalanca, giraPalanca = Paseo.giraPalanca;
  var entraPaseo = Paseo.entraPaseo, salePaseo = Paseo.salePaseo, actualizaPaseo = Paseo.actualizaPaseo;
