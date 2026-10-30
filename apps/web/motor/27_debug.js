// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02_mundo (Mundo, suelo, copas), 02b_cola (Cola), 03_escena (renderer, scene, camera, exag, modo), 04b_escena3d (Escena3D),
//   04c_olivos_tiles (OlivosTiles), 07a_catalogo (Catalogo), 07ab_generados (Generados), 07ac_lejanos (Lejanos), 07b_arboles (Arboles),
//   08_marcadores (listo, aplica), 09_camara (objetivo, orb, pon), 12_paseo (paseando, teclas, entraPaseo, salePaseo), 15_tiempo (hace),
//   90_final (bucle)
// Nota: Publica window.__g, el gancho de las pruebas (contrato en doc/sistema/CONTRATOS.md).
// ===============================================================================

  // ---------- ganchos de depuración y de prueba (solo lectura/ajuste de cámara; ?debug muestra el contador)
  // pendientes(): la Cola más la cola propia de los olivos generados (?olivos=gen) y, con ?olivos=escalera, la capa de lejanos hasta que esté (07ac):
  // lo espera mide() de las pruebas antes de medir
  // sinDibujo(true) deja el bucle sin pintar el mundo (renderer.render no hace nada; sinDibujo(false) lo devuelve): para las pruebas de Chrome que miran el DOM y no el dibujo 3D
  // (PB8; antes cada una se parcheaba a mano). No toca nada más: la lógica del fotograma sigue corriendo. Devuelve si queda sin dibujo
  var renderOriginal = null;
  function sinDibujo(si) {
    if (si && !renderOriginal) { renderOriginal = renderer.render; renderer.render = function () {}; }
    else if (!si && renderOriginal) { renderer.render = renderOriginal; renderOriginal = null; }
    return !!renderOriginal;
  }
  window.__g = {
    sinDibujo: sinDibujo,
    Arboles: Arboles, Catalogo: Catalogo, Escena3D: Escena3D, OlivosTiles: OlivosTiles, Cola: Cola, copas: copas, suelo: suelo, Mundo: Mundo, orb: orb, objetivo: objetivo, camera: camera, renderer: renderer, scene: scene, pon: pon,
    listo: function () { return listo; }, modo: function () { return modo; }, Generados: Generados,
    pendientes: function () { return Cola.pendientes() + Generados.pendientes() + Lejanos.pendientes(); },
    ponExag: function (v) { exag = v; aplica(); }, aplica: aplica,
    paseoEn: function (x, y, ang) { if (!paseando) entraPaseo(); pp.x = x; pp.y = y; pp.ang = ang || 0; },
    paseoSale: function () { if (paseando) salePaseo(); },
    paseoTecla: function (d, v) { teclas[d] = !!v; },
    paseoEstado: function () { return { paseando: paseando, x: pp.x, y: pp.y, ang: pp.ang }; }
  };
