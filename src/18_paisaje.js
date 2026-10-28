// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: PA, matTronco, postes, cable, EJES, colocaPaisaje, instSombra, sombrasSol, aguaNivel, actualizaPaisaje
// Consume: 01_datos (D, $), 02_mundo (suelo, desp, copas), 03_escena (scene, sol, exag), 04_terreno (hash, terreno), 06_arboles (gSombras, tronco),
//   07_follaje (matSombra, geoSombra), 09_camara (pon), 15_tiempo (lluvia, cur, tMundo, nivel), 23_estacion (EST)
// ===============================================================================
  // ---------- el paisaje que sale del LiDAR: edificios (clase 6), el tendido y sus postes, el arroyo y los árboles que no son olivos
  // Lo que el LiDAR clasifica de verdad son los edificios. El tendido, los postes, el cauce y las copas se deducen de la geometría (alturas, alineación, relieve) y se rotulan así.
  var PA = D.paisaje || { edificios: [], tendido: { linea: [], postes: [] }, arroyo: { eje: [] }, arboles: [] };
  var gPaisaje = new THREE.Group(); scene.add(gPaisaje);
  var matMuro = new THREE.MeshLambertMaterial({ color: 0xe6dfcf }), matPoste = new THREE.MeshLambertMaterial({ color: 0x6b5a46 }), matCable = new THREE.LineBasicMaterial({ color: 0x2a2d31 });
  var matTronco = new THREE.MeshLambertMaterial({ color: 0x5a4636 }), matCopaArb = new THREE.MeshLambertMaterial({ color: 0xffffff });
  var edifs = [], postes = [];

  // --- edificios: paredes, tejado a dos aguas (si el LiDAR da cumbrera) con el color de la ortofoto y un zócalo que se hunde en la ladera
  function creaTejado(L, A, hA, hC, mat) {
    var v = new Float32Array([-L / 2, hA, -A / 2, L / 2, hA, -A / 2, L / 2, hA, A / 2, -L / 2, hA, A / 2, -L / 2, hC, 0, L / 2, hC, 0]);
    var ix = [0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(v, 3)); g.setIndex(ix); g.computeVertexNormals();
    var m = new THREE.Mesh(g, mat); m.material.side = THREE.DoubleSide; return m;
  }
  PA.edificios.forEach(function (e) {
    var g = new THREE.Group(), L = e.largo, A = e.ancho, hA = Math.max(2.6, e.hAlero), hC = Math.max(hA + 0.4, e.hCumbrera), prof = 2.2;
    var muro = new THREE.Mesh(new THREE.BoxGeometry(L, hA + prof, A), matMuro); muro.position.y = (hA - prof) / 2; g.add(muro);
    var tj = new THREE.MeshLambertMaterial({ color: new THREE.Color(e.color[0] / 255 * 0.9, e.color[1] / 255 * 0.85, e.color[2] / 255 * 0.8) });
    g.add(creaTejado(L + 0.5, A + 0.5, hA, hC, tj));
    g.userData = { e: e }; gPaisaje.add(g); edifs.push(g);
  });

  // --- el tendido: postes de madera y un hilo que sigue lo medido por el LiDAR
  PA.tendido.postes.forEach(function (p) {
    var alto = Math.max(6, p.zAlto - p.zBase), m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, alto, 8), matPoste);
    var tapa = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), matPoste); tapa.position.y = alto / 2 - 0.35; m.add(tapa);
    m.userData = { p: p, alto: alto }; gPaisaje.add(m); postes.push(m);
  });
  // la derivación hacia la nave: postes propios y un hilo por cada ramal, medidos del LiDAR (el último tramo hasta el tejado es estimado)
  var derivs = PA.tendido.derivaciones || [], cablesDer = [];
  derivs.forEach(function (d) {
    d.postes.forEach(function (p) {
      var alto = Math.max(6, p.zAlto - p.zBase), m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, alto, 8), matPoste);
      var tapa = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), matPoste); tapa.position.y = alto / 2 - 0.35; m.add(tapa);
      m.userData = { p: p, alto: alto }; gPaisaje.add(m); postes.push(m);
    });
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(d.linea.length * 3), 3));
    var l = new THREE.Line(g, matCable); l.frustumCulled = false; gPaisaje.add(l); cablesDer.push({ g: g, linea: d.linea });
  });
  var geoCable = new THREE.BufferGeometry(); geoCable.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(1, PA.tendido.linea.length) * 3), 3));
  var cable = new THREE.Line(geoCable, matCable); cable.frustumCulled = false; gPaisaje.add(cable);

  // --- los árboles que no son olivos: tronco y 2-3 masas de copa, con el tamaño medido
  var arb = PA.arboles, nA = arb.length;
  var iTronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 7), matTronco, Math.max(1, nA));
  var geoBlob = new THREE.IcosahedronGeometry(1, 1), iBlob = [0, 1, 2].map(function () { return new THREE.InstancedMesh(geoBlob, matCopaArb, Math.max(1, nA)); });
  gPaisaje.add(iTronco); iBlob.forEach(function (m) { gPaisaje.add(m); });
  var tmpA = new THREE.Object3D(), colA = new THREE.Color();
  arb.forEach(function (a, i) {
    var t = hash(i * 7.3), c = a.tipo === "frutal" ? colA.setHSL(0.22 + 0.02 * t, 0.5, 0.36 + 0.06 * hash(i * 3.1)) : a.tipo === "arbusto" ? colA.setHSL(0.24 + 0.05 * t, 0.42, 0.34 + 0.1 * hash(i * 3.1)) : colA.setHSL(0.27 + 0.05 * t, 0.38, 0.2 + 0.09 * hash(i * 3.1));
    iBlob.forEach(function (m, k) { m.setColorAt(i, c.clone().offsetHSL(0, 0, (k - 1) * 0.03)); });
  });
  iBlob.forEach(function (m) { if (m.instanceColor) m.instanceColor.needsUpdate = true; });

  // --- el arroyo: un cauce seco que sigue el fondo del terreno y que solo corre con agua cuando llueve
  var uArroyo = { uT: { value: 0 }, uAgua: { value: 0 }, uLuz: { value: 1 }, uArena: { value: new THREE.Color(0xa8977a) } };
  var matArroyo = new THREE.ShaderMaterial({
    uniforms: uArroyo, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    vertexShader: "attribute float aV; attribute float aU; varying float vV; varying float vU; void main(){ vV = aV; vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uT; uniform float uAgua; uniform float uLuz; uniform vec3 uArena; varying float vV; varying float vU;\n" +
      "float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" +
      "void main(){ float borde = smoothstep(1.0, 0.62, abs(vV)); vec3 lecho = uArena * mix(0.72, 1.12, hh(floor(vec2(vU * 1.4, vV * 7.0))));\n" +
      "float anchoA = uAgua * 0.78; float agua = smoothstep(anchoA + 0.12, anchoA - 0.12, abs(vV)) * step(0.01, uAgua);\n" +
      "float flujo = sin(vU * 2.2 - uT * 3.4 + vV * 5.0) * 0.5 + 0.5; vec3 colA = mix(vec3(0.16, 0.36, 0.5), vec3(0.6, 0.8, 0.9), flujo * flujo * 0.55);\n" +
      "vec3 col = mix(lecho, colA, agua) * uLuz; gl_FragColor = vec4(col, borde * mix(0.72, 0.88, agua)); }"
  });
  var EJES = PA.arroyo.ejes || (PA.arroyo.eje && PA.arroyo.eje.length ? [PA.arroyo.eje] : []), arroyos = [];   // uno o varios cauces (Hituelo tiene siete)
  EJES.forEach(function (E) {
    if (E.length < 3) return;
    var pos = new Float32Array(E.length * 2 * 3), aV = new Float32Array(E.length * 2), aU = new Float32Array(E.length * 2), idx = [], acc = 0;
    for (var i = 0; i < E.length; i++) {
      if (i) acc += Math.hypot(E[i][0] - E[i - 1][0], E[i][1] - E[i - 1][1]); aV[i * 2] = -1; aV[i * 2 + 1] = 1; aU[i * 2] = aU[i * 2 + 1] = acc;
      if (i < E.length - 1) { var a0 = i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
    }
    var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aV", new THREE.BufferAttribute(aV, 1)); geo.setAttribute("aU", new THREE.BufferAttribute(aU, 1)); geo.setIndex(idx);
    var malla = new THREE.Mesh(geo, matArroyo); malla.frustumCulled = false; malla.renderOrder = 3; gPaisaje.add(malla); arroyos.push({ geo: geo, E: E });
  });

  // --- se coloca todo sobre el terreno (y se vuelve a colocar al cambiar la exageración vertical)
  function colocaPaisaje() {
    edifs.forEach(function (g) { var e = g.userData.e; g.position.set(e.x, suelo(e.x, e.y) * exag, -e.y); g.rotation.y = e.ang; });
    postes.forEach(function (m) { var p = m.userData.p, gz = suelo(p.x, p.y) * exag; m.position.set(p.x, gz + m.userData.alto / 2, -p.y); });
    var L = PA.tendido.linea, pa = geoCable.attributes.position; L.forEach(function (q, i) { pa.setXYZ(i, q[0], q[2] * exag, -q[1]); }); pa.needsUpdate = true;
    cablesDer.forEach(function (c) { var pp = c.g.attributes.position; c.linea.forEach(function (q, i) { pp.setXYZ(i, q[0], q[2] * exag, -q[1]); }); pp.needsUpdate = true; });
    arb.forEach(function (a, i) {
      var gz = suelo(a.x, a.y) * exag, h = a.h, r = a.r;
      tmpA.rotation.set(0, 0, 0); tmpA.scale.set(1, 1, 1);
      if (a.tipo === "arbusto") {
        tmpA.position.set(a.x, -100, -a.y); tmpA.scale.set(0.01, 0.01, 0.01); tmpA.updateMatrix(); iTronco.setMatrixAt(i, tmpA.matrix);
        [[0, 0.5, 1.0, 0.7], [0.4, 0.38, 0.7, 0.6], [-0.4, 0.62, 0.65, 0.55]].forEach(function (b, k) { tmpA.position.set(a.x + b[0] * r * 0.5, gz + h * b[1], -a.y + b[0] * r * 0.3); tmpA.scale.set(r * b[2], h * b[3] * 0.5 + 0.3, r * b[2]); tmpA.updateMatrix(); iBlob[k].setMatrixAt(i, tmpA.matrix); });
      } else {
        var hT = h * 0.42; tmpA.position.set(a.x, gz + hT / 2, -a.y); tmpA.scale.set(Math.min(0.9, 0.5 + h * 0.03), hT, Math.min(0.9, 0.5 + h * 0.03)); tmpA.updateMatrix(); iTronco.setMatrixAt(i, tmpA.matrix);
        [[0, 0.62, 1.0, 0.34], [0.3, 0.78, 0.74, 0.26], [-0.28, 0.5, 0.78, 0.26]].forEach(function (b, k) {
          tmpA.position.set(a.x + b[0] * r * 0.6, gz + h * b[1], -a.y - b[0] * r * 0.4); tmpA.scale.set(r * b[2], h * b[3], r * b[2]); tmpA.updateMatrix(); iBlob[k].setMatrixAt(i, tmpA.matrix);
        });
      }
    });
    iTronco.instanceMatrix.needsUpdate = true; iBlob.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
    arroyos.forEach(function (ar) {
      var E = ar.E, p2 = ar.geo.attributes.position;
      for (var i = 0; i < E.length; i++) {
        var a = E[Math.max(0, i - 1)], b = E[Math.min(E.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, w = E[i][3] / 2 + 0.8;
        [[-1, 0], [1, 1]].forEach(function (s) { var px = E[i][0] + nx * w * s[0], py = E[i][1] + ny * w * s[0]; p2.setXYZ(i * 2 + s[1], px, (suelo(px, py) + 0.1) * exag, -py); });
      }
      p2.needsUpdate = true;
    });
    sombrasSol(true);
  }

  // --- las sombras de los árboles y los edificios siguen al sol: más largas y más suaves cuanto más bajo está
  var olivasS = copas.filter(function (c) { return c.oliv; }), ultSol = { alt: -9, az: -9 }, instSombra = null, instSombraPA = null, tmpS = new THREE.Object3D();
  function sombrasSol(forzar) {
    var lv = nivel(cur.ms), alt = lv.s.alt, az = lv.s.az, nub = cur.nub / 100;
    matSombra.opacity = Math.max(0, Math.min(1, (Math.sin(alt) - 0.03) * 4)) * (1 - 0.75 * nub);
    var ver = matSombra.opacity > 0.02; if (instSombra) instSombra.visible = ver; if (instSombraPA) instSombraPA.visible = ver;
    if (!forzar && Math.abs(alt - ultSol.alt) < 0.012 && Math.abs(az - ultSol.az) < 0.012) return;
    ultSol.alt = alt; ultSol.az = az;
    var ta = Math.tan(Math.max(alt, 0.09)), dx = -Math.sin(az), dz = Math.cos(az), th = Math.atan2(dx, dz);
    function pon(inst, i, x, y, r, h) {
      var largo = Math.min(26, r * 2 + Math.max(0, h - 1.2) / ta), desp = Math.max(0, h - 1.2) / ta / 2;
      tmpS.position.set(x + dx * desp, (suelo(x, y) + 0.06) * exag, -y + dz * desp); tmpS.rotation.set(0, th, 0); tmpS.scale.set(r * 2.3, 1, largo); tmpS.updateMatrix(); inst.setMatrixAt(i, tmpS.matrix);
    }
    if (instSombra) { olivasS.forEach(function (t, i) { if (i >= instSombra.count) return; var rm = t.perfil.reduce(function (a, b) { return a + b; }, 0) / 8; pon(instSombra, i, t.x, t.y, rm, t.h); }); instSombra.instanceMatrix.needsUpdate = true; }
    if (!instSombraPA) { instSombraPA = new THREE.InstancedMesh(geoSombra, matSombra, nA + edifs.length + 1); gSombras.add(instSombraPA); }
    var n = 0; arb.forEach(function (a) { pon(instSombraPA, n++, a.x, a.y, a.r, a.h); }); edifs.forEach(function (g) { var e = g.userData.e; pon(instSombraPA, n++, e.x, e.y, Math.max(e.largo, e.ancho) * 0.55, e.hCumbrera); });
    instSombraPA.count = n; instSombraPA.instanceMatrix.needsUpdate = true;
  }

  // --- el agua del arroyo sube con la lluvia y baja despacio
  var aguaNivel = 0, tSombra = 0;
  function actualizaPaisaje(dt) {
    var llueve = cur.lluvia > 0.3 || (EST.activa && EST.clima && EST.clima.lluvia >= 12);   // o una semana lluviosa en la estación elegida
    aguaNivel += llueve ? (1 - aguaNivel) * Math.min(1, dt * 0.18) : -aguaNivel * Math.min(1, dt * 0.03);
    uArroyo.uAgua.value = aguaNivel < 0.02 ? 0 : aguaNivel; uArroyo.uT.value = tMundo; uArroyo.uLuz.value = 0.22 + 0.78 * nivel(cur.ms).d;
    gPaisaje.visible = $("cPaisaje").checked;
    tSombra += dt; if (tSombra > 0.4) { tSombra = 0; sombrasSol(false); }
  }
  (function () { var c = $("cPaisaje"); if (c) c.addEventListener("change", function () { gPaisaje.visible = c.checked; }); })();


