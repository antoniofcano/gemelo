// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: gLinde, tmp, listo, aplica, capas, aplicaLuego
// Consume: 01_datos (D, $), 02c_componentes (Bus), 02j_estaticos (Estaticos), 03_escena (scene, Estado), 04d_sombreado_tiles (UN),
//   05_nube (nube, pintaNube), 06_arboles (gArboles, gFollaje, gSombras), 07b_arboles (Arboles), 15_tiempo (colocaBarrera),
//   18_paisaje (colocaPaisaje), 19_balizas (colocaBalizas), 21_suelo (recoloreaSuelo)
// ===============================================================================

  // la linde y lo que cuelga del terreno al aplicar. Las copas del LiDAR, los anillos de OlivarTrack y el desfase son el componente «marcadores-lidar»
  // (08b_marcadores_lidar.js): aplica() les avisa con «mundo:aplica» y capas() con «capas:cambia»; sin él (?marcadores=0) esas tres casillas no hacen nada.
  // MU5-n (A3-2b): el grupo de la linde y aplica(), capas() y aplicaLuego() pasaron a TypeScript, apps/web/src/mundos/exterior/marcadores.ts (Mundos.creaMarcadores).
  // Aquí quedan `listo` (lo escribe 90_final: no puede ser una importación) y los nombres que el resto del legado lee.
  var Marcadores = Mundos.creaMarcadores({
    THREE: THREE, scene: scene, Estaticos: Estaticos, Bus: Bus, D: D, $: $, Estado: Estado, UN: UN, nube: nube, gArboles: gArboles, gFollaje: gFollaje, gSombras: gSombras, Arboles: Arboles,
    pintaNube: pintaNube, colocaBarrera: colocaBarrera, colocaPaisaje: colocaPaisaje, colocaBalizas: colocaBalizas, recoloreaSuelo: recoloreaSuelo,
    listo: function () { return listo; }, raf: function (f) { requestAnimationFrame(f); }
  });
  var gLinde = Marcadores.gLinde, tmp = Marcadores.tmp;
  var listo = false;   // los datos de las teselas ya están
  var aplica = Marcadores.aplica, capas = Marcadores.capas, aplicaLuego = Marcadores.aplicaLuego;
