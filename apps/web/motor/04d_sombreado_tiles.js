// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: hash, matSuelo, matOrto, UN, SombreadoTiles
// Consume: 01_datos (D, RES, x0, yN, ANCHO, ALTO), 02_mundo (Mundo, suelo), 02b_cola (ColaExt), 02i_materiales (Materiales), 03_escena (camera),
//   04f_suelo_fotos (SueloFotosPuro, SueloFotos), 15_tiempo (parcheTiempo), 21_suelo (vn2)
// ===============================================================================
  // ---------- el sombreado del relieve (F1d, T5; T8 fase 2: la única escena es la 3D Tiles). MU5-n (A3-1a): el sombreado pasó a TypeScript,
  // apps/web/src/mundos/exterior/terreno.ts (Mundos.creaSombreadoTiles, Mundos.uniformesTerreno, Mundos.hash), con su libera() completo (L2-05: también las
  // texturas de cada tesela del Mundo) y su componente («terreno-sombreado», del exterior; lo registra 90_final.js). Cada glb del tileset cambia su
  // material por un Lambert con el parche del terreno al cargarse (load-model de 04b_escena3d.js). Aquí quedan, como extracción parcial, los «maestros»
  // matSuelo y matOrto (el ciclo del día les pone el color; el relieve de los glb comparte el de matSuelo) y lo que leen por su nombre 04e, 08, 14, 15,
  // 21 y otros: hash, UN y SombreadoTiles. Sin tileset no crea nada (04b no lo llama).
  var hash = Mundos.hash;
  var matSuelo = Materiales.estandar("MeshLambertMaterial", {}), matOrto = Materiales.estandar("MeshBasicMaterial", { color: 0xffffff });   // «maestros»: el ciclo del día les pone el color; el relieve de los glb comparte el de matSuelo
  var UN = Mundos.uniformesTerreno({ THREE: THREE, D: D, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, tinteOrto: matOrto.color });   // uniformes compartidos por todo el relieve (y por quien sigue la exageración: 08, 14, 15...)
  var SombreadoTiles = Mundos.creaSombreadoTiles({
    THREE: THREE, RES: RES, mundo: Mundo, suelo: suelo, cola: ColaExt, camara: camera, UN: UN, matSuelo: matSuelo,
    parcheTiempo: function (sh, viento) { parcheTiempo(sh, viento); },   // 15_tiempo: sombra de nubes y escarcha
    vn2: function (x, y) { return vn2(x, y); },   // 21_suelo: las mismas funciones que usa cubierta() en la CPU
    sueloFotos: function () { return typeof SueloFotos !== "undefined" ? SueloFotos : null; },   // 04f se monta después (EV-1s, ?suelo=fotos)
    sueloFotosPuro: function () { return typeof SueloFotosPuro !== "undefined" ? SueloFotosPuro : null; },
    ahora: function () { return performance.now(); },
    materiales: Materiales   // MU5-n: el material «terreno» se define en la fábrica (02i) y se pide con dueño «terreno-sombreado»
  });
