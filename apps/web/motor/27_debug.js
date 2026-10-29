// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02_mundo (Mundo, suelo, copas), 02b_cola (Cola), 03_escena (renderer, scene, camera, exag, modo), 04_terreno (Terreno),
//   04b_escena3d (Escena3D), 04c_olivos_tiles (OlivosTiles), 07a_catalogo (Catalogo), 07b_arboles (Arboles), 08_marcadores (listo, aplica),
//   09_camara (objetivo, orb, pon)
// Nota: Publica window.__g, el gancho de las pruebas (contrato en doc/sistema/CONTRATOS.md).
// ===============================================================================

  // ---------- ganchos de depuración y de prueba (solo lectura/ajuste de cámara; ?debug muestra el contador)
  window.__g = {
    Arboles: Arboles, Catalogo: Catalogo, Escena3D: Escena3D, OlivosTiles: OlivosTiles, Cola: Cola, copas: copas, suelo: suelo, Mundo: Mundo, Terreno: Terreno, orb: orb, objetivo: objetivo, camera: camera, renderer: renderer, scene: scene, pon: pon,
    listo: function () { return listo; }, modo: function () { return modo; },
    ponExag: function (v) { exag = v; aplica(); }, aplica: aplica
  };
