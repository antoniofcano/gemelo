// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: tVida, enQuad, vq, enDron, Vida, gFauna, altSuelo, mira, quad, temaEstela, velPaseo, giroPaseo, ponQuad, vidaPaseo, dr, dron, ponDron,
//   cicloVista, dronMando, camaraDron, vidaEntra, vidaSale, actualizaVida
// Consume: 01_datos ($), 02_mundo (suelo, copaAlta), 02c_componentes (Bus), 02i_materiales (Materiales), 03_escena (scene, camera, Estado),
//   07_follaje (matSombra, geoSombra), 12_paseo (paseando, persona, teclas, primera, pp, camPos), 12b_llegada (Llegada),
//   15_tiempo (nivelEn, texBrillo, cur, ins, temaBarrera, num1, rumbo), 22_huellas (pendFactor, quadInc, inclinaQuad), 90_final (gm)
// ===============================================================================
  // ---------- la vida del olivar: el quad con estela de luz (Tron) y el dron para el paseo (los pájaros y los conejos son el componente «fauna-olivar», 16b_fauna.js; los perros, «perros-paseo»).
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/vida.ts (el grupo de la fauna, el quad, el dron, el anillo, las estelas y los mandos del paseo), componente
  // «vida» de los mundos ["exterior"] con un libera() que suelta de verdad todo lo que crea y quita las escuchas de sus botones (L2-05, L2-11; lo registra 90_final.js, como los de A3-1a).
  // Aquí se cablea lo del legado: el estado que lee el resto de módulos (tVida, enQuad, vq, enDron) se espeja en estas var cada vez que cambia en Vida.E, y las funciones de siempre
  // (velPaseo, ponDron…) son las de Vida con el mismo nombre.
  var tVida = 0, enQuad = false, vq = 0, enDron = false;
  var Vida = Mundos.creaVida({
    THREE: THREE, scene: scene, camera: camera, Estado: Estado, Materiales: Materiales, Bus: Bus, $: $, suelo: suelo, copaAlta: copaAlta,
    sueloMundo: function (x, y) { return gm.suelo(x, y); }, obstaculo: function (x, y, r) { return gm.obstaculo(x, y, r); },   // el mundo activo (90_final, que declara gm después)
    geoSombra: geoSombra, matSombra: matSombra, texBrillo: texBrillo, nivelEn: nivelEn, cur: cur, ins: ins, num1: num1, rumbo: rumbo,
    paseando: function () { return paseando; }, teclas: function () { return teclas; }, persona: function () { return persona; },   // 12_paseo: cambian (teclas se reemplaza al salir)
    primera: function () { return primera; }, ponPrimera: function (v) { primera = v; }, pp: pp, camPos: camPos, Llegada: Llegada,
    pendFactor: function () { return pendFactor(); }, quadInc: function () { return quadInc; }, inclinaQuad: function (dt) { inclinaQuad(dt); },   // 22_huellas, que se carga después
    espeja: function (e) { tVida = e.tVida; enQuad = e.enQuad; vq = e.vq; enDron = e.enDron; }
  });
  var gFauna = Vida.gFauna, altSuelo = Vida.altSuelo, quita = Vida.quita, mira = Vida.mira, quad = Vida.quad, temaEstela = Vida.temaEstela;
  var velPaseo = Vida.velPaseo, giroPaseo = Vida.giroPaseo, ponQuad = Vida.ponQuad, vidaPaseo = Vida.vidaPaseo, dr = Vida.dr, dron = Vida.dron, ponDron = Vida.ponDron;
  var cicloVista = Vida.cicloVista, dronMando = Vida.dronMando, camaraDron = Vida.camaraDron, vidaEntra = Vida.vidaEntra, vidaSale = Vida.vidaSale, actualizaVida = Vida.actualizaVida;
  temaBarrera();
