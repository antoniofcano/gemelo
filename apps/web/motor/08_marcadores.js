// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: gLinde, tmp, listo, aplica, capas, pendiente, aplicaLuego
// Consume: 01_datos (D, $), 02_mundo (suelo, orto, copas, cIn, marc), 03_escena (scene, colorCss, exag, modo), 05_nube (nube, pintaNube),
//   06_arboles (gArboles, gFollaje, gSombras, tronco), 07b_arboles (Arboles), 14_historia (avTipo, pintaAvance), 15_tiempo (colocaBarrera, lindes),
//   16_vida (esfera), 18_paisaje (colocaPaisaje), 19_balizas (colocaBalizas), 21_suelo (recoloreaSuelo)
// ===============================================================================

  // linde y marcadores
  var gLinde = new THREE.Group(), gCopas = new THREE.Group(), gMarc = new THREE.Group(), gDesf = new THREE.Group();
  gLinde.name = "lindes"; gCopas.name = "copas"; gMarc.name = "marcas"; gDesf.name = "desfase";   // los nombres los usa el desglose de llamadas de las pruebas
  [gLinde, gCopas, gMarc, gDesf].forEach(function (g) { scene.add(g); });
  // (las lindes son ahora una barrera de luz: ver el bloque del tiempo)
  var mCopas = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.38), new THREE.MeshBasicMaterial({ color: colorCss("--lidar") }), cIn.length); mCopas.frustumCulled = false; gCopas.add(mCopas);   // r151: la esfera de una InstancedMesh se calcula una vez con sus instancias; estas se recolocan con la exageración
  var ani = new THREE.RingGeometry(0.55, 0.95, 20); ani.rotateX(-Math.PI / 2);
  var mMarc = new THREE.InstancedMesh(ani, new THREE.MeshBasicMaterial({ color: colorCss("--guardado"), side: THREE.DoubleSide }), marc.length); mMarc.frustumCulled = false; gMarc.add(mMarc);
  var desfGeo = new THREE.BufferGeometry(); gDesf.add(new THREE.LineSegments(desfGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })));
  var tmp = new THREE.Object3D();
  function marcadores() {
    D.parcelas.forEach(function (pr, k) {
      colocaBarrera(k);
    });
    cIn.forEach(function (c, i) { tmp.position.set(c.x, (suelo(c.x, c.y) + c.h + 1.4) * exag, -c.y); tmp.updateMatrix(); mCopas.setMatrixAt(i, tmp.matrix); }); mCopas.instanceMatrix.needsUpdate = true;
    var seg = [];
    marc.forEach(function (m, i) {
      var gz = suelo(m.x, m.y); tmp.position.set(m.x, (gz + 0.35) * exag, -m.y); tmp.updateMatrix(); mMarc.setMatrixAt(i, tmp.matrix);
      if (m.par >= 0) { var c = copas[m.par], g2 = suelo(c.x, c.y); seg.push(m.x, (gz + 0.5) * exag, -m.y, c.x, (g2 + 0.5) * exag, -c.y); }
    }); mMarc.instanceMatrix.needsUpdate = true;
    desfGeo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
  }

  var NOTAS = {
    nube: "Los puntos del vuelo de 2024, con el color de la ortofoto corregido por altura. Los puntos bajos bajo cada copa, en color corteza, son el tronco.",
    gem: "Cada punto del LiDAR es un montoncito de hojas de olivo, de modo que la copa conserva el volumen medido. Los troncos y las ramas son una forma ilustrativa con los 2 o 3 pies habituales del olivo en vaso: el LiDAR mide la copa, no cuántos pies tiene cada árbol (solo llega un punto por olivo a la altura del tronco). Color de la ortofoto.",
    orto: "El terreno real con la ortofoto del PNOA tal cual, sin vegetación en 3D. Las copas se ven desplazadas hacia el este."
  };
  var listo = false;   // los datos de las teselas ya están
  function aplica() {
    if (!listo) return;
    UN.uExag.value = exag; if (modo === "nube") pintaNube(); if (modo === "gem") Arboles.refresca(); marcadores(); colocaPaisaje(); colocaBalizas(); recoloreaSuelo(); if (avTipo) pintaAvance(avTipo);
    UN.uModoOrto.value = modo === "orto" ? 1 : 0;   // el relieve (04d) pinta la ortofoto del glb tal cual
    nube.visible = modo === "nube"; gArboles.visible = modo === "gem"; gFollaje.visible = modo === "gem"; gSombras.visible = modo === "gem";
    $("notaModo").textContent = NOTAS[modo]; capas();
    if ($("cSolo") && $("cSolo").checked) { gArboles.visible = false; gFollaje.visible = false; gSombras.visible = false; nube.visible = false; }
  }
  function capas() { gLinde.visible = $("cLinde").checked; gCopas.visible = $("cCopas").checked; gMarc.visible = $("cMarc").checked; gDesf.visible = $("cDesf").checked; }
  var pendiente = false;
  function aplicaLuego() { if (pendiente) return; pendiente = true; requestAnimationFrame(function () { pendiente = false; aplica(); }); }
