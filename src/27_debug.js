
  // ---------- ganchos de depuración y de prueba (solo lectura/ajuste de cámara; ?debug muestra el contador)
  window.__g = {
    Arboles: Arboles, Cola: Cola, copas: copas, suelo: suelo, Mundo: Mundo, Terreno: Terreno, orb: orb, objetivo: objetivo, camera: camera, renderer: renderer, scene: scene, pon: pon,
    listo: function () { return listo; }, modo: function () { return modo; },
    ponExag: function (v) { exag = v; aplica(); }, aplica: aplica
  };
