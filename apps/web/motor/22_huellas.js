// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: pendienteRumbo, pendFactor, quadInc, inclinaQuad, sueloSeco
// Consume: 02_mundo (suelo), 03_escena (exag), 08_marcadores (pendiente), 15_tiempo (cur, rumbo), 16_vida (quad), 18_paisaje (aguaNivel),
//   21_suelo (cubierta)
// ===============================================================================
  // ---------- huellas, polvo y pendiente: el suelo se deja marcar y el quad y el paso se adaptan al terreno
  function pendienteRumbo(x, y, ang) {   // pendiente del terreno a lo largo del rumbo y de lado (positiva = sube), con la exageración vertical
    var ds = 0.9, fx = Math.sin(ang), fy = Math.cos(ang), rx = Math.cos(ang), ry = -Math.sin(ang);
    return [(suelo(x + fx * ds, y + fy * ds) - suelo(x - fx * ds, y - fy * ds)) / (2 * ds) * exag, (suelo(x + rx * ds, y + ry * ds) - suelo(x - rx * ds, y - ry * ds)) / (2 * ds) * exag];
  }
  function pendFactor() { var s = pendienteRumbo(pp.x, pp.y, pp.ang)[0]; return Math.max(0.35, Math.min(1.25, 1 - 1.25 * s)); }   // cuesta arriba cuesta más
  var quadInc = { pit: 0, rol: 0 };
  function inclinaQuad(dt) {
    var pe = pendienteRumbo(pp.x, pp.y, pp.ang), k = Math.min(1, dt * 6);
    quadInc.pit += (Math.atan(pe[0]) - quadInc.pit) * k; quadInc.rol += (Math.atan(pe[1]) - quadInc.rol) * k; quad.rotation.set(quadInc.pit, -pp.ang, quadInc.rol, "YXZ");
  }

  // (las huellas y el polvo, que antes vivían aquí, son el componente «huellas-polvo»: 22b_huellas_polvo.js)
  function sueloSeco(x, y) { return cur.lluvia < 0.3 && aguaNivel < 0.15 && cur.hr < 92 && cubierta(x, y)[0] < 0.8; }
