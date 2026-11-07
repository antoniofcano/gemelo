// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: TiempoPuro, ahoraMs, TM, nivelEn, nivel, texBrillo, uViento, uSombra, GLSL_SOMBRA, cur, meta, ins, tMundo, temaBarrera, fmtHora,
//   fmtClaveDia, num1, rumbo, objetivoMundoBase, pasoHoraMundo, horaMundoTexto, aplicaMundo, TiempoVivo, nodosTiempoTsl, parcheTiempo, esc,
//   colocaBarrera, actualizaTiempo
// Consume: 01_datos (D, $, FOG0, FOG1), 02_mundo (suelo), 02c_componentes (Bus, Componentes), 02i_materiales (Materiales),
//   02j_estaticos (Estaticos), 03_escena (scene, camera, SRGB, LUZ_SOL, LUZ_CIELO, hemi, sol, texColor, colorVertSRGB, colorCss, Estado),
//   04d_sombreado_tiles (hash, matSuelo, matOrto), 04f_suelo_fotos (SueloFotos), 05_nube (nube), 07_follaje (matHojaG, matHojaP, matCorteza),
//   08_marcadores (gLinde), 09_camara (objetivo), 13b_hazas (HazasPuro), 16_vida (temaEstela), 23_estacion (EST, objetivoMundo)
// Nota: Extracción parcial (MU5-n, A3-4): el tiempo vive en apps/web/src/mundos/exterior/tiempo*.ts, componente «tiempo-mundo». Lee /api/tiempo (mismo origen) solo con D.base /teselas/… o ?api=; si no, el tiempo simulado, dicho. Expone TiempoVivo (contratos/interfaces.json). TiempoPuro (tiempo-puro.ts) lo evalúa en Node pruebas/guardianes/tiempo_motor.test.js.
// ===============================================================================
  // ---------- el tiempo: el mundo del gemelo simula el que publica Vigía (contratos/tiempo.md). MU5-n (A3-4): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/tiempo*.ts (lo puro, el parche de las nubes y la helada, el cielo, la lluvia, la barrera de las lindes, el paso de cada fotograma
  // y las fichas del panel), componente «tiempo-mundo» de los mundos ["exterior"] con un libera() que lo suelta todo (L2-05, L2-11). Aquí quedan, como
  // extracción parcial, el cableado y los nombres que leen otros módulos. De dónde se lee: 1) GET /api/tiempo del mismo origen, si la página la sirve el servidor (o ?api=);
  // 2) si no hay api o falla, el tiempo simulado de siempre, dicho. Expone TiempoVivo.lee() y TiempoVivo.alCambiar(fn). Los textos de Vigía son datos.
  var Tiempo = Mundos.creaTiempo({
    THREE: THREE, scene: scene, camera: camera, sol: sol, hemi: hemi, SRGB: SRGB, LUZ_SOL: LUZ_SOL, LUZ_CIELO: LUZ_CIELO, colorCss: colorCss, colorVertSRGB: colorVertSRGB, texColor: texColor,
    FOG0: FOG0, FOG1: FOG1, parcelas: D.parcelas, hash: hash, matSuelo: matSuelo, matOrto: matOrto, nube: nube, matHojaG: matHojaG, matHojaP: matHojaP, matCorteza: matCorteza,
    gLinde: gLinde, Estaticos: Estaticos, suelo: suelo, Estado: Estado, objetivo: objetivo,
    objetivoMundo: function () { return typeof objetivoMundo === "function" ? objetivoMundo() : null; },   // 23_estacion va después en el montaje (null: aún no está)
    estimado: function () { return typeof EST !== "undefined" && !!EST && !!EST.activa; },   // L8-05: la estación de otra fecha (23_estacion) se rotula «estimado»
    temaEstela: function (o) { if (typeof temaEstela === "function") temaEstela(o); },   // 16_vida, después en el montaje
    ocasoFotos: typeof SueloFotos !== "undefined" && SueloFotos.activo,
    $: $, lienzo: function () { return document.createElement("canvas"); }, Bus: Bus,
    prefijoApi: function () { return typeof HazasPuro !== "undefined" ? HazasPuro.prefijoApi(location.search, D.base) : null; },   // «/api/» si la página la sirve el servidor (o ?api=)
    red: function () { return window.fetch ? window.fetch.bind(window) : null; }, prueba: function () { return window.__TIEMPO_PRUEBA || null; },
    busqueda: location.search, reloj: function () { return Date.now(); }, calma: !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    temporizador: { setInterval: function (f, ms) { return setInterval(f, ms); }, clearInterval: function (id) { clearInterval(id); } }, Materiales: Materiales,
    alCambiarTema: function (fn) {
      var mo = new MutationObserver(fn), mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); if (mq) mq.addEventListener("change", fn);
      return function () { mo.disconnect(); if (mq) mq.removeEventListener("change", fn); };
    }
  });
  var TiempoPuro = Mundos.TiempoPuro, ahoraMs = Tiempo.ahoraMs, TM = Tiempo.TM, nivelEn = Tiempo.nivelEn, nivel = Tiempo.nivel, texBrillo = Tiempo.texBrillo;
  var uViento = Tiempo.uViento, uSombra = Tiempo.uSombra, GLSL_SOMBRA = Mundos.GLSL_SOMBRA, cur = Tiempo.cur, meta = Tiempo.meta, ins = Tiempo.ins, tMundo = 0;
  var temaBarrera = Tiempo.temaBarrera, fmtHora = Tiempo.fmtHora, fmtClaveDia = Tiempo.fmtClaveDia, num1 = Mundos.num1, rumbo = Mundos.rumbo;
  var objetivoMundoBase = Tiempo.objetivoMundoBase, pasoHoraMundo = Tiempo.pasoHoraMundo, horaMundoTexto = Tiempo.horaMundoTexto, aplicaMundo = Tiempo.aplicaMundo;
  var TiempoVivo = Mundos.creaTiempoVivo(TM, ahoraMs), lindes = Tiempo.lindes;
  var nodosTiempoTsl = Tiempo.nodosTsl;   // MU5-n: la sombra de nubes y la escarcha en TSL, para la variante apagada de 04d, 07a y 07ab (la piden al construirla)   // el contrato de TiempoVivo (contratos/interfaces.json): sin estado propio, lee TM
  // lo que otros módulos piden ANTES en el montaje (07a, 07ab, 08 y 14 al cargarse): funciones declaradas, que se izan, y llaman a lo de aquí cuando ya existe
  function parcheTiempo(sh, viento) { Tiempo.parcheTiempo(sh, viento); }
  function esc(s) { return Mundos.esc(s); }
  function colocaBarrera(k) { Tiempo.colocaBarrera(k); }   // 08_marcadores se la pasa a su fábrica al cargarse   // los textos de Vigía (y de OlivarTrack) se escapan al pintarlos (14_historia lo usa al cargarse)
  // el paso del exterior de cada fotograma (90_final.js); tMundo es el reloj de lo que se mueve (lo lee 18_paisaje)
  function actualizaTiempo(dt, tms) { Tiempo.actualiza(dt, tms); tMundo = Tiempo.tMundo(); }
  Componentes.registra(Mundos.manifiestoTiempo(Tiempo));
