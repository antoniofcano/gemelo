// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: IrA
// Consume: 01_datos (D), 02_mundo (suelo, copas), 03_escena (scene, exag), 12_paseo (paseando, teclas, pp), 12b_llegada (LlegadaPuro, Llegada),
//   16_vida (enQuad, enDron), 29_vr (VRX), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- tocar para ir andando (tanda 9): en pantalla (ratón y táctil, no en VR), a pie, un clic o un toque corto en el suelo hace que el paseante camine hasta allí.
  // No salta ni se teletransporta: gira hacia el punto y anda con el avance de siempre (la misma velocidad, pendiente, troncos y borde de la finca de actualizaPaseo, 12_paseo.js),
  // con el anillo de la llegada (Llegada, 12b_llegada.js: una sola malla ya existente) en el destino. Se cancela con cualquier tecla, la cruceta, la palanca o el quad/dron; otro toque cambia el destino.
  // Rodea los troncos (EV2-B3): al tocar se planifica un rodeo local (IrAPuro.planifica: por cada tronco que cruza el camino recto, un punto intermedio por el lado libre; sin A* ni
  // dependencia, porque los olivos van en marco de plantación y basta con esquivar el primero que estorba y repetir en cada tramo); si no hay rodeo, va recto y, si se atasca, replanifica una vez
  // con más margen y, si tampoco, se rinde como antes (~1,2 s). Una línea de puntos (una sola THREE.Points, creada una vez, oculta sin destino) marca el camino y se acorta al avanzar.
  // Un arrastre o una pulsación larga no lo dispara. Si el toque cae sobre un olivo, una baliza o una persona, manda lo que ya hacía (elegir/ficha; 09_camara.js): aquí solo llega lo que no eligió nada.
  // Ajuste «controles.tocarIr» (Configuración → Controles; encendido); en la dirección, ?tocar=0 lo apaga y ?tocar=1 lo fuerza.
  // La lógica pura pasó a TypeScript (A1-11 / MU1-7): apps/web/src/nucleo/locomocion.ts (MUNDOS §9.4, pieza 6). Este módulo conserva lo que toca THREE y el DOM: no es un talón completo.
  var IrAPuro = Nucleo.IrAPuro;
  var IrA = (function () {
    var st = IrAPuro.crea(), MAXP = 80, PASO_P = 1.2;
    // la línea de puntos: una sola malla de puntos (1 llamada, solo con destino); el búfer se rellena cada fotograma, no se crea nada nuevo
    var bufP = new Float32Array(MAXP * 3), geoP = new THREE.BufferGeometry(), atrP = new THREE.BufferAttribute(bufP, 3);
    atrP.setUsage(THREE.DynamicDrawUsage); geoP.setAttribute("position", atrP); geoP.setDrawRange(0, 0);
    var matP = new THREE.PointsMaterial({ color: 0xffc94a, size: 5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
    var linea = new THREE.Points(geoP, matP); linea.frustumCulled = false; linea.visible = false; linea.renderOrder = 5; scene.add(linea);
    function pintaLinea() {
      if (!st.dest) { linea.visible = false; return; }
      var v = IrAPuro.puntosLinea(pp, st, PASO_P, MAXP);
      for (var i = 0; i < v.length; i++) { bufP[i * 3] = v[i].x; bufP[i * 3 + 1] = suelo(v[i].x, v[i].y) * exag + 0.18; bufP[i * 3 + 2] = -v[i].y; }
      geoP.setDrawRange(0, v.length); atrP.needsUpdate = true; linea.visible = v.length > 0;
    }
    function activo() { var a = true; try { a = Ajustes.lee("controles.tocarIr"); } catch (e) {} return IrAPuro.activa(a, location.search); }
    function cancela() { if (st.dest) { IrAPuro.cancela(st); Llegada.borra(); } linea.visible = false; }
    // un toque corto o un clic sin nada elegido debajo (09_camara.js lo llama tras Usables.toque); mov y ms, desde que bajó el puntero. Devuelve si echó a andar
    function toca(cx, cy, mov, ms, tipo) {
      if (!paseando || VRX.on || enDron || !activo() || !IrAPuro.esToque(mov, ms, tipo)) return false;
      var q = Llegada.apuntaPantalla(cx, cy); if (!q) return false;   // cielo o fuera de la finca: no pasa nada (y el anillo que hubiera sigue)
      var f = LlegadaPuro.fueraDeTroncos(q.x, q.z, copas, 0.9);      // el destino no cae dentro de un tronco
      var d = { x: f.x, y: -f.z }, ruta = IrAPuro.planifica(pp, d, copas, IrAPuro.R_TRONCO, D.ext);   // null: sin rodeo, va recto (y si se atasca, replanifica o se rinde)
      IrAPuro.ir(st, d.x, d.y, ruta ? ruta.slice(0, -1) : [], copas, D.ext); pintaLinea(); return true;
    }
    // desde actualizaPaseo (12_paseo.js), una vez por fotograma. manda: hay tecla, cruceta o palanca en uso → se cancela. Devuelve { av, ang } o null
    function paso(dt, manda) {
      if (!st.dest) return null;
      if (manda || enQuad || enDron || VRX.on || !paseando) { cancela(); return null; }
      var r = IrAPuro.paso(st, pp, dt, teclas.run ? 4.3 : 1.7);
      if (!r || r.fin) { Llegada.borra(); linea.visible = false; return null; }
      pintaLinea(); return r;
    }
    // libera la malla (la escena no la vuelve a necesitar)
    function libera() { cancela(); scene.remove(linea); geoP.dispose(); matP.dispose(); }
    return { libera: libera, linea: linea, toca: toca, paso: paso, cancela: cancela, activo: activo, destino: function () { return st.dest; } };
  })();
