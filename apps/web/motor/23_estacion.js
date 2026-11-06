// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: EST, bbchEn, construyeFrutosLista, hoyMadrid, objetivoMundo, actualizaOlivo
// Consume: 01_datos ($), 02c_componentes (Componentes), 02i_materiales (Materiales), 03_escena (renderer, SRGB, Estado), 04d_sombreado_tiles (hash),
//   06_arboles (gFollaje), 07_follaje (matHojaG, matHojaP), 10_ndvi (NDV, ndviIdx), 13_parcelas (parcelas), 14_historia (OT),
//   15_tiempo (TiempoPuro, ahoraMs, TM, fmtHora, fmtClaveDia, num1, objetivoMundoBase, aplicaMundo, esc), 21_suelo (SN)
// Nota: Publica además window.__otDebug (depuración del olivo estacional).
// ===============================================================================
  // ---------- el olivo estacional: la fecha de la estación (el deslizador de la fecha del campo) manda en el sol, el clima, el color de la copa y la fenología.
  // MU5-n (A3-4): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/estacion.ts, componente «estacion-olivo» de los mundos ["exterior"] con un
  // libera() que lo suelta todo. Aquí quedan, como extracción parcial, el cableado y los nombres que leen otros módulos (07, 15, 18, 44b y 90).
  var Estacion = Mundos.creaEstacion({
    THREE: THREE, $: $, Materiales: Materiales, renderer: renderer, SRGB: SRGB, Estado: Estado, hash: hash, gFollaje: gFollaje, matHojaG: matHojaG, matHojaP: matHojaP,
    NDV: NDV, ndviIdx: function () { return ndviIdx; }, SN: SN, parcelas: parcelas, OT: OT,
    TiempoPuro: TiempoPuro, ahoraMs: ahoraMs, TM: TM, fmtHora: fmtHora, fmtClaveDia: fmtClaveDia, num1: num1, esc: esc, objetivoMundoBase: objetivoMundoBase, aplicaMundo: aplicaMundo,
    ventana: window, temporizador: { setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (id) { clearTimeout(id); } }, Evento: Event
  });
  var EST = Estacion.EST, bbchEn = Estacion.bbchEn, construyeFrutosLista = Estacion.construyeFrutosLista, hoyMadrid = Estacion.hoyMadrid, objetivoMundo = Estacion.objetivoMundo;
  var actualizaOlivo = Estacion.actualizaOlivo;
  Componentes.registra(Mundos.manifiestoEstacion(Estacion));
