// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: ALTO_MAX, nube, pintaNube, actualizaNubeTeselas, actualizaNube
// Consume: 02_mundo (Mundo, suelo, copaAlta, kcor, tinte, aviva, colorEn), 02b_cola (Cola), 03_escena (scene, camera, exag),
//   04d_sombreado_tiles (hash), 06_arboles (tronco), 08_marcadores (aplica), 10_ndvi (ndviIdx), 12_paseo (primera),
//   15_tiempo (parcheTiempo, nivel, hace)
// ===============================================================================
  // ---------- nube de puntos LiDAR: una malla por tesela, con las posiciones cuantizadas a 16 bits y el color a 8, y nivel de detalle por distancia
  // El orden de los puntos de cada tesela está barajado, así que dibujar solo la primera fracción (setDrawRange) es una muestra uniforme: lejos se pintan menos puntos.
  // La malla lleva su posición y escala (centro y semirrango de la tesela): la exageración vertical es solo la escala en y, sin tocar ningún vértice.
  // Preparar los puntos de una tesela (filtrar, cuantizar, colorear) son ~100 ms: se hace a rebanadas en la cola de trabajos.
  var ALTO_MAX = 7.5;   // por encima de 7,5 m no hay olivo: cipreses, pinos o ruido
  var NIV_NUBE = [{ d: 300, f: 1 }, { d: 700, f: 0.5 }, { d: 1300, f: 0.18 }, { d: 2300, f: 0.045 }], PRESUPUESTO_NUBE = 1400000;   // puntos dibujados como máximo; si se pasa, lo lejano se aclara
  var nubeMat = new THREE.PointsMaterial({ size: 0.6, sizeAttenuation: true, vertexColors: true });   // «maestro»: el ciclo del día le pone el color; los niveles comparten ese color
  var matsNube = NIV_NUBE.map(function (nv) { var m = new THREE.PointsMaterial({ size: Math.min(3, 0.6 / Math.sqrt(nv.f)), sizeAttenuation: true, vertexColors: true }); m.color = nubeMat.color; m.onBeforeCompile = function (sh) { parcheTiempo(sh, false); }; m.needsUpdate = true; return m; });
  var nube = { material: nubeMat, g: new THREE.Group(), set visible(v) { this.g.visible = !!v; }, get visible() { return this.g.visible; } };
  scene.add(nube.g);
  var claveColorNube = "";
  function colorPunto(x, y, h, bajo, i, out) {   // el color de un punto: tronco bajo la copa, o la ortofoto corregida por altura
    if (bajo) { var t = 0.30 + 0.12 * hash(i); out[0] = 0.40 * t * 2; out[1] = 0.31 * t * 2; out[2] = 0.22 * t * 2; return; }
    colorEn(x, y, h, out); aviva(out, x, y); var sh = 0.82 + 0.22 * Math.min(1, h / 4); out[0] *= sh; out[1] *= sh; out[2] *= sh;
  }
  function* pintaTeselaNubeG(t) {
    var n = t.nubeN, C = t.nubeCol, c3 = [0, 0, 0];
    for (var i = 0; i < n; i++) {
      colorPunto(t.nubeX[i], t.nubeY[i], t.nubeH[i] / 30, t.nubeB[i], i, c3);
      C[i * 3] = Math.min(255, c3[0] * 255); C[i * 3 + 1] = Math.min(255, c3[1] * 255); C[i * 3 + 2] = Math.min(255, c3[2] * 255);
      if (i % 12000 === 11999) yield;
    }
    if (t.nubeMalla) t.nubeMalla.geometry.attributes.color.needsUpdate = true; t.nubeSucia = false;
  }
  function* montaNubeG(t) {   // prepara los puntos de una tesela (filtra, cuantiza, colorea) y devuelve su malla
    var P = t.pts, n0 = P ? P.length / 3 : 0; if (!n0) return null;
    yield* Mundo.aseguraOrto(t);
    var X = new Float32Array(n0), Y = new Float32Array(n0), Z = new Float32Array(n0), H = new Uint8Array(n0), B = new Uint8Array(n0), n = 0, zmin = 1e9, zmax = -1e9;
    for (var q = 0; q < n0; q++) {
      var px = t.ox + P[q * 3] / 100, py = t.oy + P[q * 3 + 1] / 100, pz = P[q * 3 + 2] / 100, h = pz - suelo(px, py);
      if (q % 20000 === 19999) yield;
      if (h > ALTO_MAX) continue;
      X[n] = px; Y[n] = py; Z[n] = pz; H[n] = Math.max(0, Math.min(255, Math.round(h * 30))); B[n] = (h < 2.0 && copaAlta(px, py) > 2.6) ? 1 : 0;
      if (pz < zmin) zmin = pz; if (pz > zmax) zmax = pz; n++;
    }
    if (!n) return null;
    var hx = Mundo.TS / 2 + 2, cxm = t.ox + Mundo.TS / 2, cym = t.oy + Mundo.TS / 2, zc = (zmin + zmax) / 2, hz = (zmax - zmin) / 2 + 0.5;
    var Q = new Int16Array(n * 3), C = new Uint8Array(n * 3);
    for (var i = 0; i < n; i++) { Q[i * 3] = Math.round((X[i] - cxm) / hx * 32767); Q[i * 3 + 1] = Math.round((Z[i] - zc) / hz * 32767); Q[i * 3 + 2] = Math.round((-Y[i] + cym) / hx * 32767); if (i % 40000 === 39999) yield; }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(Q, 3, true)); g.setAttribute("color", new THREE.BufferAttribute(C, 3, true));
    var m = new THREE.Points(g, matsNube[0]); m.userData = { zc: zc, hz: hz }; m.position.set(cxm, zc * exag, -cym); m.scale.set(hx, hz * exag, hx); m.visible = false;
    t.nubeX = X.subarray(0, n); t.nubeY = Y.subarray(0, n); t.nubeH = H.subarray(0, n); t.nubeB = B.subarray(0, n); t.nubeCol = C; t.nubeN = n; t.nubeMalla = m; t.nubeNivel = -1;
    yield* pintaTeselaNubeG(t);
    return m;
  }
  function liberaNube(t) { Cola.cancela("N" + t.key); Cola.cancela("NP" + t.key); if (t.nubeMalla) { nube.g.remove(t.nubeMalla); t.nubeMalla.geometry.dispose(); } t.nubeMalla = null; t.nubeX = t.nubeY = t.nubeH = t.nubeB = t.nubeCol = null; t.nubeN = 0; t.nubeEst = 0; }
  function exagNube() { Mundo.lista.forEach(function (t) { var m = t.nubeMalla; if (m) { m.position.y = m.userData.zc * exag; m.scale.y = m.userData.hz * exag; } }); }
  function pintaNube() {   // se llama desde aplica(): solo repinta si cambió lo que influye en el color (corrección de la ortofoto, tinte NDVI y su fecha)
    exagNube();
    var clave = kcor + "|" + tinte + "|" + (tinte ? ndviIdx : 0);
    if (clave !== claveColorNube) { claveColorNube = clave; Mundo.lista.forEach(function (t) { if (t.nubeMalla) t.nubeSucia = true; }); }
  }
  // distancia de la cámara al rectángulo de una tesela (en 3D, con la altura sobre su suelo)
  function distTesela(t, cx, cy, cz) { return Mundo.dist(t, cx, cy, cz); }
  function actualizaNubeTeselas(cx, cy, cz) {   // nivel de detalle por distancia; las teselas lejanas no tienen malla; lo pesado va a la cola
    var total = 0, escala = 1;
    Mundo.lista.forEach(function (t) { if (t.nubeMalla && t.nubeEst === 2 && t.nubeMalla.visible) { var nv = t.nubeNivel; if (nv >= 0) total += Math.max(1500, t.nubeN * NIV_NUBE[nv].f); } });
    if (total > PRESUPUESTO_NUBE) escala = PRESUPUESTO_NUBE / total;   // el presupuesto de puntos no crece con la superficie: se reparte quitando de lo más lejano
    Mundo.lista.forEach(function (t) {
      if (!t.np || !t.pts) return;   // sin puntos (o aún sin llegar) no hay nube
      var d = Mundo.dist(t, cx, cy, cz), niv = d < NIV_NUBE[0].d ? 0 : d < NIV_NUBE[1].d ? 1 : d < NIV_NUBE[2].d ? 2 : d < NIV_NUBE[3].d ? 3 : -1;
      if (niv < 0) { if (d > NIV_NUBE[3].d * 1.2) liberaNube(t); else if (t.nubeMalla) t.nubeMalla.visible = false; return; }
      if (!t.nubeMalla) {
        if (!t.nubeEst) { t.nubeEst = 1; Cola.add("N" + t.key, d, montaNubeG(t), function (m) { if (m && t.nubeEst === 1) { nube.g.add(m); t.nubeEst = 2; } else if (!m) t.nubeEst = 3; }); }
        return;
      }
      if (t.nubeEst !== 2) return;
      if (t.nubeSucia && !Cola.hay("NP" + t.key)) Cola.add("NP" + t.key, d, pintaTeselaNubeG(t));
      var m = t.nubeMalla; m.visible = true;
      if (niv !== t.nubeNivel) { t.nubeNivel = niv; m.material = matsNube[niv]; m.geometry.setDrawRange(0, Math.max(1500, Math.ceil(t.nubeN * NIV_NUBE[niv].f * (niv >= 2 ? escala : 1)))); }
    });
  }
  var tNubeLod = 0;
  function actualizaNube(dt) { tNubeLod += dt; if (tNubeLod < 0.2) return; tNubeLod = 0; actualizaNubeTeselas(camera.position.x, camera.position.y, camera.position.z); }

