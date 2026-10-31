// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02_mundo (suelo, copas, cIn, marc), 02c_componentes (Componentes), 03_escena (scene, colorCss, exag, modo), 05_nube (nube),
//   08_marcadores (gLinde, marcadores, listo, aplica, capas), 13_parcelas (parcelas), 16_vida (esfera)
// ===============================================================================

  // ---------- los marcadores de la nube LiDAR (componente «marcadores-lidar», ADR-0023, C10 tercera tanda): las copas detectadas (octaedros), los olivos guardados en
  // OlivarTrack (anillos) y las líneas de desfase entre ambos. Antes vivían en 08_marcadores.js, que se los colocaba desde aplica(); ahora aplica() solo avisa con
  // «mundo:aplica» (cambió la exageración, el modo o los datos: recoloca lo que cuelga del terreno) y capas() con «capas:cambia» (las casillas «Copas del LiDAR»,
  // «Guardados en OlivarTrack» y «Desfase entre ambos» del menú). 08_marcadores.js conserva lo que no es opcional: la linde (gLinde), aplica(), capas() y las barreras
  // de luz de las parcelas. ?marcadores=0 los apaga: no se dibujan copas, anillos ni desfase y las tres casillas quedan sin efecto (siguen en el menú).
  var marcSuelta = null;   // lo que libera el componente montado
  function MarcadoresLidarMotor(n) {
    var gCopas = new THREE.Group(), gMarc = new THREE.Group(), gDesf = new THREE.Group();
    gCopas.name = "copas"; gMarc.name = "marcas"; gDesf.name = "desfase";   // los nombres los usa el desglose de llamadas de las pruebas
    [gCopas, gMarc, gDesf].forEach(function (g) { scene.add(g); });
    var geoCopa = new THREE.OctahedronGeometry(0.38), matOcta = new THREE.MeshBasicMaterial({ color: colorCss("--lidar") });
    var mCopas = new THREE.InstancedMesh(geoCopa, matOcta, cIn.length); mCopas.frustumCulled = false; gCopas.add(mCopas);   // r151: la esfera de una InstancedMesh se calcula una vez con sus instancias; estas se recolocan con la exageración
    var ani = new THREE.RingGeometry(0.55, 0.95, 20); ani.rotateX(-Math.PI / 2);
    var matMarc = new THREE.MeshBasicMaterial({ color: colorCss("--guardado"), side: THREE.DoubleSide });
    var mMarc = new THREE.InstancedMesh(ani, matMarc, marc.length); mMarc.frustumCulled = false; gMarc.add(mMarc);
    var desfGeo = new THREE.BufferGeometry(), matDesf = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    gDesf.add(new THREE.LineSegments(desfGeo, matDesf));
    var tmpMarc = new THREE.Object3D();
    function coloca() {
      cIn.forEach(function (c, i) { tmpMarc.position.set(c.x, (suelo(c.x, c.y) + c.h + 1.4) * exag, -c.y); tmpMarc.updateMatrix(); mCopas.setMatrixAt(i, tmpMarc.matrix); }); mCopas.instanceMatrix.needsUpdate = true;
      var seg = [];
      marc.forEach(function (m, i) {
        var gz = suelo(m.x, m.y); tmpMarc.position.set(m.x, (gz + 0.35) * exag, -m.y); tmpMarc.updateMatrix(); mMarc.setMatrixAt(i, tmpMarc.matrix);
        if (m.par >= 0) { var c = copas[m.par], g2 = suelo(c.x, c.y); seg.push(m.x, (gz + 0.5) * exag, -m.y, c.x, (g2 + 0.5) * exag, -c.y); }
      }); mMarc.instanceMatrix.needsUpdate = true;
      desfGeo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    }
    function ponCapas() { gCopas.visible = $("cCopas").checked; gMarc.visible = $("cMarc").checked; gDesf.visible = $("cDesf").checked; }
    n.on("mundo:aplica", coloca);
    n.on("capas:cambia", ponCapas);
    // montado tarde (la configuración del servidor, a mano): los datos ya están y las casillas ya existen
    if (listo) coloca();
    ponCapas();
    var disp = false;
    marcSuelta = function () {
      if (disp) return; disp = true;
      [gCopas, gMarc, gDesf].forEach(function (g) { scene.remove(g); });
      mCopas.dispose(); mMarc.dispose(); geoCopa.dispose(); matOcta.dispose(); ani.dispose(); matMarc.dispose(); desfGeo.dispose(); matDesf.dispose();
    };
    return { coloca: coloca, capas: ponCapas, grupos: function () { return [gCopas, gMarc, gDesf]; } };
  }
  Componentes.registra({
    id: "marcadores-lidar", version: 1,
    consume: ["scene", "colorCss", "cIn", "marc", "copas", "suelo", "exag", "listo"],
    expone: [],
    eventos: { escucha: ["mundo:aplica", "capas:cambia"], emite: [] },
    bandera: { defecto: true, url: "marcadores" },
    presupuesto: { llamadas: 3, triangulos: 480000 },   // [SUPUESTO] techo para 10.000 copas (octaedro de 8 triángulos) y 10.000 marcas (anillo de 40) = 8·N + 40·M; Hituelo tiene 5.882 copas. Una maqueta de 140 copas y 60 marcas mide 2 llamadas y 3.520 triángulos (componentes_c10c.test.js); con «Desfase» encendida suma la llamada de las líneas
    fases: {},
    monta: function (n) { return MarcadoresLidarMotor(n); },
    actualiza: {},
    libera: function () { if (marcSuelta) marcSuelta(); marcSuelta = null; }
  });
