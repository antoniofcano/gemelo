// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02_mundo (suelo), 02c_componentes (Componentes), 02e_entidades (Entidades),
//   03_escena (visor, renderer, scene, camera, texColor, exag, modo), 06_arboles (tronco), 09_camara (objetivo, suelta, elige),
//   12_paseo (paseando, persona, primera), 12b_llegada (Llegada), 14_historia (lista, aviso), 15_tiempo (rumbo, hace),
//   16_vida (enQuad, quita, mira, quad, enDron, dron), 26_presencia (PoseCodec, BufferPose, Aspecto, SalaPose, Chat, Muneco, Encuentro, sitioJunto),
//   29_vr (VRX, vrFundido, panel, ficha), 34_movibles (Movibles)
// Nota: Componente «presencia-compartida» (ADR-0023, C5): solo se registra; consume la red (sala «visita») y expone «Presencia» (para los avatares VRM). Sin ?presencia=sim o ?presencia=red, montado no crea nada; con red, el panel Gente y el chat. Registra el tipo persona en Entidades (C7) y da su línea de ?debug por «depura:lineas». Publica window.__presencia y window.__presenciaChat (pruebas). Lo prueba en Node pruebas/guardianes/red.test.js.
// ===============================================================================
  // ---------- presencia compartida (F2, contratos/presencia.md), componente «presencia-compartida» (C5, ADR-0023): los demás visitantes como muñecos instanciados,
  // su pose por el códec del contrato, su interpolación y, en la sala de verdad, el apartado Gente y el chat. La lógica pura (códec, búfer, SalaPose, chat,
  // aspecto, muñeco, Encuentro) vive en 26_presencia.js; la conexión, en el componente de la red (37_red.js): esta pieza no sabe nada de LiveKit.
  // Dos variantes, cada una con su bandera:
  //  · ?presencia=sim (y &n=1..64; por defecto 10): visitantes simulados que pasean, mandan su pose por el códec a la tasa que toca según la distancia
  //    (10 Hz cerca, 2 Hz lejos) a través de una red de mentira (retardo 30-90 ms, 1 % de pérdida) y se dibujan con el búfer de interpolación.
  //  · ?presencia=red: la sala de verdad, la sala «visita» de la red. Pide el token a la api (POST /api/presencia/token), publica su pose (no fiable, tema
  //    «pose», 10 Hz a los cercanos y 2 Hz a todos) mientras pasea o va con gafas; en vista aérea no la publica y sale en Gente «en vista aérea»
  //    (decisión 60). Panel Gente con bloquear (solo para ti) y chat por el canal fiable (tema «chat», no se guarda; decisión 40).
  // Sin ninguna de las dos, montada no crea nada ni añade nada a la escena ni a la página (salvo los ganchos de pruebas): el motor dibuja lo mismo que sin ella.
  // Los avatares VRM (26b_avatares.js) son otro componente que consume este: se enganchan con enganchaVRM y la presencia les pasa cada persona que dibuja.
  function PresenciaMotor(n, R) {
    var vrmG = null;   // el gancho de los avatares VRM (26b_avatares.js), si están montados
    var variante = (/[?&]presencia=(sim|red)\b/.exec(location.search) || [])[1] || "", activo = !!variante, N = 0;
    var CERCA_ENTRA = 55, CERCA_SALE = 65, TICK = 0.1, CADA_LEJOS = 5, RET_CERCA = 150, RET_LEJOS = 650, ALTO_OJOS = 1.6;   // contratos/presencia.md
    var MAXV = 49;   // red: plazas de avatar (la sala admite 50 personas, infra/dev/livekit.yaml: tú y 49 más)
    var grupo = null, mCuerpo = null, mCabeza = null, mSombrero = null, mManos = null, mNombres = null, texNombres = null, cxNom = null, geos = [], mats = [];
    var V = [], redSim = [], est = { n: 0, cerca: 0, quest: 0, enviados: 0, recibidos: 0, perdidos: 0, viejos: 0, bytes: 0, bps: 0, ms: 0, msMax: 0, retP95: 0, errP95: 0 };
    var muestrasRet = [], muestrasErr = [], tEst = 0, bytesVentana = 0, msVentana = 0;
    var semilla = 20261029;
    function azar() { semilla = (semilla + 0x6d2b79f5) | 0; var t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    var ALIAS = ["Mirlo", "Abubilla", "Jilguero", "Carbonero", "Alcaraván", "Verdecillo", "Golondrina", "Perdiz", "Abejaruco", "Cogujada", "Encina", "Lentisco", "Retama", "Acebuche", "Coscoja", "Romero", "Tomillo", "Jara", "Algarrobo", "Almendro"];
    var CAMISAS = Aspecto.CAMISAS, PIELES = Aspecto.PIELES, SOMBREROS = [null, { c: 0xd9bf6a, w: 0.46, h: 0.07, d: 0.46, z: 0 }, { c: 0x2e5d34, w: 0.3, h: 0.09, d: 0.36, z: -0.04 }];
    var m4 = null, m4b = null, q1 = null, v1 = null, v2 = null, vS = null, ejeY = null, cNom = 4, fNom = 1, matSombreroLocal = [];
    var NP = Muneco.PIEZAS.length, PANTALON = Aspecto.PANTALON, mBase = null, mPieza = null, ejeX = null, outMu = {};   // pantalón: el del paseante, si la persona no eligió otro
    // AV2 (decisión 131): los accesorios (sombrero y apoyo: asiento y respaldo de la silla, bastón, andador) son más instancias de la MISMA caja unidad del sombrero (0 llamadas nuevas) y las
    // ruedas de la silla, una malla instanciada más (1 llamada, y solo si alguien lleva silla). Cada persona toma las cajas y ruedas que necesita de una reserva; la malla dibuja hasta la última en uso
    var mRuedas = null, rCajas = null, rRuedas = null, vF = null, qI = null, vU = null, COLOR_APOYO = { silla: 0x4a4f55, baston: 0x5a3d22, andador: 0xa9b1b8 }, COLOR_RUEDA = 0x22262a;
    function reserva(malla) {
      var oc = [], cap = malla.instanceMatrix.count;
      function fija() { var n = 0; for (var i = 0; i < cap; i++) if (oc[i]) n = i + 1; malla.count = n; malla.visible = n > 0; }
      fija();
      return {
        toma: function (n) { var r = []; for (var i = 0; i < cap && r.length < n; i++) if (!oc[i]) { oc[i] = true; r.push(i); } fija(); return r; },
        suelta: function (r) { for (var i = 0; i < r.length; i++) { oc[r[i]] = false; malla.setMatrixAt(r[i], m4.makeScale(0, 0, 0)); } malla.instanceMatrix.needsUpdate = true; fija(); }
      };
    }
    // las cajas y ruedas de a según su sombrero y su apoyo; a.iSom = la caja del sombrero (o −1) y a.iApoyo = la primera del apoyo en a.cajas
    // OF10: la oficina pide una caja más, la última, para su insignia (a.iIns; −1 si no es oficina o si la reserva se quedó corta)
    function tomaAccesorios(a) {
      var nc = Aspecto.cajas(a.sombrero, a.mov, a.oficial);
      a.cajas = rCajas.toma(nc); a.ruedas = a.mov === "silla" ? rRuedas.toma(2) : [];
      a.iSom = a.sombrero ? a.cajas[0] : -1; a.iApoyo = a.sombrero ? 1 : 0;
      a.iIns = a.oficial && a.cajas.length === nc ? a.cajas[nc - 1] : -1;
    }
    function sueltaAccesorios(a) { if (a.cajas) rCajas.suelta(a.cajas); if (a.ruedas) rRuedas.suelta(a.ruedas); a.cajas = []; a.ruedas = []; a.iSom = -1; a.iIns = -1; }
    // P6: el quad y el dron de los demás, el mismo modelo del paseante local (16_vida.js) fundido en una sola malla con color por vértice e instanciado:
    // una llamada para todos los quads y otra para todos los drones, y solo si alguien los lleva (si no, la malla no se dibuja)
    var mQuad = null, mDron = null, nVehQ = 0, nVehD = 0, vEsc = null, tVeh = 0, DRON_DELANTE = 5, DRON_ALTO = 4, DRON_ESC = 1.8;

    // ---- los avatares (los mismos en las dos variantes): cuerpo, cabeza, sombrero, manos y nombre, instanciados (5 llamadas de dibujo tengas los que tengas)
    function montaGrafica(nCuerpos, nSom, nManos) {
      mBase = new THREE.Matrix4(); mPieza = new THREE.Matrix4(); ejeX = new THREE.Vector3(1, 0, 0);
      m4 = new THREE.Matrix4(); m4b = new THREE.Matrix4(); q1 = new THREE.Quaternion(); v1 = new THREE.Vector3(); v2 = new THREE.Vector3(); vS = new THREE.Vector3(1, 1, 1); ejeY = new THREE.Vector3(0, 1, 0);
      vF = new THREE.Vector3(1, 1, 1); qI = new THREE.Quaternion(); vU = new THREE.Vector3(1, 1, 1);
      grupo = new THREE.Group(); grupo.name = "presencia"; scene.add(grupo);
      // el muñeco del paseante (12_paseo.js): cuerpo, dos piernas y dos brazos son la MISMA caja unidad con el pivote arriba,
      // escalada y girada por instancia (Muneco.PIEZAS): 5 instancias por avatar en una sola llamada; color por instancia
      // (camisa en cuerpo y brazos, pantalón en las piernas). La cabeza, una bola baja (icosaedro: 20 triángulos)
      var gC = new THREE.BoxGeometry(1, 1, 1); gC.translate(0, -0.5, 0);
      var gCab = new THREE.IcosahedronGeometry(0.135, 0), gSom = new THREE.BoxGeometry(1, 1, 1), gMano = new THREE.BoxGeometry(0.08, 0.08, 0.13), gNom = new THREE.PlaneGeometry(1.6, 0.3);
      var matC = new THREE.MeshLambertMaterial({ flatShading: true }), matL = new THREE.MeshLambertMaterial({ flatShading: true });
      var gRueda = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10); gRueda.rotateZ(Math.PI / 2);   // la rueda de la silla, con el eje en x (10 lados: 40 triángulos)
      geos = [gC, gCab, gSom, gMano, gNom, gRueda]; mats = [matC, matL];
      mCuerpo = new THREE.InstancedMesh(gC, matC, nCuerpos * NP); mCabeza = new THREE.InstancedMesh(gCab, matL, nCuerpos); mSombrero = new THREE.InstancedMesh(gSom, matL, nSom); mManos = new THREE.InstancedMesh(gMano, matL, nManos);
      mRuedas = new THREE.InstancedMesh(gRueda, matL, nCuerpos * 2);
      rCajas = reserva(mSombrero); rRuedas = reserva(mRuedas);   // sin nadie con sombrero ni silla, no se dibujan (count 0, invisible)
      SOMBREROS.forEach(function (s, i) { matSombreroLocal[i] = s ? new THREE.Matrix4().compose(new THREE.Vector3(0, 0.14 + s.h / 2, s.z), new THREE.Quaternion(), new THREE.Vector3(s.w, s.h, s.d)) : null; });
      // nombres: un atlas con todos los alias y un plano instanciado vuelto hacia la cámara en el sombreador (una llamada para todos)
      fNom = Math.ceil(nCuerpos / cNom);
      var cv = document.createElement("canvas"); cv.width = 256 * cNom; cv.height = 48 * fNom;
      cxNom = cv.getContext("2d"); cxNom.font = "600 28px system-ui, sans-serif"; cxNom.textAlign = "center"; cxNom.textBaseline = "middle"; cxNom.lineJoin = "round";
      texNombres = texColor(new THREE.CanvasTexture(cv)); texNombres.minFilter = THREE.LinearFilter; texNombres.generateMipmaps = false;
      var celda = new Float32Array(nCuerpos); for (var q = 0; q < nCuerpos; q++) celda[q] = q;
      gNom.setAttribute("aCelda", new THREE.InstancedBufferAttribute(celda, 1));
      var matN = new THREE.ShaderMaterial({
        uniforms: { uMapa: { value: texNombres }, uRej: { value: new THREE.Vector2(cNom, fNom) } }, transparent: true, depthWrite: false, fog: false,
        vertexShader: "attribute float aCelda; uniform vec2 uRej; varying vec2 vUv;\n" +
          "void main(){ vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float e = length(instanceMatrix[0].xyz); c.xy += position.xy * e; gl_Position = projectionMatrix * c;\n" +
          " float col = mod(aCelda, uRej.x), fila = floor(aCelda / uRej.x); vUv = vec2((col + uv.x) / uRej.x, 1.0 - (fila + 1.0 - uv.y) / uRej.y); }",
        fragmentShader: "uniform sampler2D uMapa; varying vec2 vUv;\nvoid main(){ vec4 t = texture2D(uMapa, vUv); if (t.a < 0.04) discard; gl_FragColor = t;\n#include <colorspace_fragment>\n}"
      });
      mats.push(matN);
      mNombres = new THREE.InstancedMesh(gNom, matN, nCuerpos); mNombres.renderOrder = 5;
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres, mRuedas].forEach(function (m) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); grupo.add(m); });   // se mueven cada fotograma: el volumen envolvente de una InstancedMesh se calcula una vez (r151)
      vEsc = new THREE.Vector3(DRON_ESC, DRON_ESC, DRON_ESC);
      cargaVehiculos(nCuerpos);
    }
    // el quad y el dron de los demás: las piezas opacas del modelo local (16_vida.js: quad, dron) en una sola geometría (mergeGeometries de three,
    // pedido con import() solo con la bandera) con el color de cada pieza en sus vértices. Hasta que llega, los de quad o dron se ven sin vehículo
    function cargaVehiculos(n) {
      import("three/addons/utils/BufferGeometryUtils.js").then(function (U) {
        if (!grupo) return;
        mQuad = instanciaVehiculo(funde(quad, U), n); mDron = instanciaVehiculo(funde(dron, U), n);
      }).catch(function (e) { if (typeof console !== "undefined") console.warn("presencia: sin quad ni dron de los demás (" + (e && e.message ? e.message : e) + ")"); });
    }
    function funde(g, U) {
      var partes = [], m = new THREE.Matrix4();
      g.traverse(function (o) {
        if (!o.isMesh || !o.geometry || !o.material || o.material.transparent || !o.material.color) return;   // la sombra, el brillo y los discos de las hélices, no
        m.identity(); for (var p = o; p && p !== g; p = p.parent) { p.updateMatrix(); m.premultiply(p.matrix); }
        var ge = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        Object.keys(ge.attributes).forEach(function (k) { if (k !== "position" && k !== "normal") ge.deleteAttribute(k); });
        ge.applyMatrix4(m);
        var nv = ge.attributes.position.count, col = new Float32Array(nv * 3), c = o.material.color;
        for (var i = 0; i < nv; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        ge.setAttribute("color", new THREE.BufferAttribute(col, 3)); partes.push(ge);
      });
      var r = U.mergeGeometries(partes, false); partes.forEach(function (x) { x.dispose(); });
      return r;
    }
    function instanciaVehiculo(geo, n) {
      if (!geo) return null;
      var mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), im = new THREE.InstancedMesh(geo, mat, n);
      geos.push(geo); mats.push(mat);
      for (var i = 0; i < n; i++) im.setMatrixAt(i, m4.makeScale(0, 0, 0));
      im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.visible = false; grupo.add(im);
      return im;
    }
    function pintaNombre(k, alias, oficial) {   // la celda k del atlas; vacía si no hay alias. OF10: la oficina, «◆ Oficina» sobre verde oliva (su insignia, también de lejos)
      var x = (k % cNom) * 256 + 128, y = Math.floor(k / cNom) * 48 + 24;
      cxNom.clearRect(x - 128, y - 24, 256, 48);
      if (alias && oficial) alias = "◆ " + alias;
      if (alias) {
        var w = Math.min(248, cxNom.measureText(alias).width + 24);
        cxNom.fillStyle = oficial ? "rgba(92,104,26,0.94)" : "rgba(16,20,24,0.72)"; cxNom.beginPath(); if (cxNom.roundRect) cxNom.roundRect(x - w / 2, y - 19, w, 38, 12); else cxNom.rect(x - w / 2, y - 19, w, 38); cxNom.fill();
        cxNom.fillStyle = "#ffffff"; cxNom.fillText(alias, x, y + 1, 236);
      }
      texNombres.needsUpdate = true;
    }
    function colorea(a) {
      var c = new THREE.Color();
      // OF10: con chaleco, el tronco (la pieza 0) en su color; los brazos siguen con la camisa
      for (var j = 0; j < NP; j++) mCuerpo.setColorAt(a.k * NP + j, c.setHex(Muneco.PIEZAS[j][5] ? (a.pantalon == null ? PANTALON : a.pantalon) : j === 0 && a.chaleco ? a.chaleco : a.camisa));
      mCabeza.setColorAt(a.k, c.setHex(a.piel));
      if (a.iSom >= 0) mSombrero.setColorAt(a.iSom, c.setHex(SOMBREROS[a.sombrero].c));
      if (a.cajas) for (var ja = a.iApoyo; ja < a.cajas.length; ja++) mSombrero.setColorAt(a.cajas[ja], c.setHex(a.cajas[ja] === a.iIns ? Aspecto.INSIGNIA : COLOR_APOYO[a.mov]));
      if (a.ruedas) for (var jr = 0; jr < a.ruedas.length; jr++) mRuedas.setColorAt(a.ruedas[jr], c.setHex(COLOR_RUEDA));
      if (a.iMano >= 0) { mManos.setColorAt(a.iMano, c.setHex(a.piel)); mManos.setColorAt(a.iMano + 1, c.setHex(a.piel)); }
      [mCuerpo, mCabeza, mSombrero, mManos, mRuedas].forEach(function (m) { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }
    function oculta(a) {   // nada de ese avatar se ve (escala 0) hasta que llegue su pose
      m4.makeScale(0, 0, 0);
      for (var j = 0; j < NP; j++) mCuerpo.setMatrixAt(a.k * NP + j, m4);
      mCabeza.setMatrixAt(a.k, m4); mNombres.setMatrixAt(a.k, m4);
      a.mu = null;   // al volver, empieza quieto donde aparezca (no se desliza desde donde se fue)
      if (a.cajas) for (var jc = 0; jc < a.cajas.length; jc++) mSombrero.setMatrixAt(a.cajas[jc], m4);   // sombrero y apoyo
      if (a.ruedas) for (var jw = 0; jw < a.ruedas.length; jw++) mRuedas.setMatrixAt(a.ruedas[jw], m4);
      if (a.iMano >= 0) { mManos.setMatrixAt(a.iMano, m4); mManos.setMatrixAt(a.iMano + 1, m4); }
      if (mQuad) mQuad.setMatrixAt(a.k, m4); if (mDron) mDron.setMatrixAt(a.k, m4);
      if (vrmG) vrmG.oculta(a);
      a.visto = false;
    }

    // ---- simulación (?presencia=sim)
    function inicia() {
      var p = (/[?&]n=(\d+)/.exec(location.search) || [])[1]; N = Math.max(1, Math.min(64, p ? Number(p) : 10)); est.n = N;
      // P6, solo para probar: &vehiculo=quad|dron|mixto pone a los simulados en quad, con el dron o un tercio de cada (sin él, todos a pie, como siempre)
      var veh = (/[?&]vehiculo=(quad|dron|mixto)\b/.exec(location.search) || [])[1] || "";
      // AV2, solo para probar: cada simulado lleva un aspecto repartido por su propio azar (semilla aparte: no cambia dónde pasean); &aspecto=0 los deja como antes (camisa y piel de antes, a pie, altura y complexión medias)
      var conAspecto = !/[?&]aspecto=0\b/.test(location.search), semA = 20261031;
      function azarA() { semA = (semA + 0x6d2b79f5) | 0; var t = Math.imul(semA ^ (semA >>> 15), 1 | semA); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
      function eligeUno(l) { return l[Math.floor(azarA() * l.length)]; }
      var nQuest = 0;
      for (var k = 0; k < N; k++) {
        var sombrero = Math.floor(azar() * 3), quest = azar() < 0.3, cercano = k < Math.ceil(N / 2);
        var aliasK = ALIAS[k % ALIAS.length] + (k >= ALIAS.length ? " " + (1 + Math.floor(k / ALIAS.length)) : "");
        var u = azarA(), av = !conAspecto ? {} : { tono: Math.floor(azarA() * 10), arriba: Math.floor(azarA() * 10), abajo: Math.floor(azarA() * 10), altura: eligeUno(Object.keys(Aspecto.ALTURAS)), complexion: eligeUno(Object.keys(Aspecto.COMPLEXIONES)),
          movilidad: u < 0.12 ? "silla" : u < 0.22 ? "baston" : u < 0.28 ? "andador" : "pie" };
        var home = cercano ? { x: objetivo.x + (azar() - 0.5) * 80, y: -objetivo.z + (azar() - 0.5) * 80 } : { x: D.ext[0] + 10 + azar() * (D.ext[2] - D.ext[0] - 20), y: D.ext[3] + 10 + azar() * (D.ext[1] - D.ext[3] - 20) };
        var rCam = azar(), rPiel = azar();   // las dos tiradas de siempre (camisa y piel): se gastan igual para no cambiar el resto de la simulación
        var oficialK = k === 0 && /[?&]oficial=1(&|$)/.test(location.search);   // OF10, solo para probar: &oficial=1 hace oficina al primero (chaleco, insignia y «◆ Oficina»)
        if (oficialK) aliasK = "Oficina";
        var vest = Aspecto.viste({ alias: aliasK, camisa: Math.floor(rCam * CAMISAS.length), piel: conAspecto ? 1 : Math.floor(rPiel * 5), aspecto: Aspecto.lee(av), oficial: oficialK });
        V.push({
          k: k, alias: aliasK, quest: quest, oficial: vest.oficial, chaleco: vest.chaleco, iIns: -1,
          camisa: vest.camisa, piel: vest.piel, pantalon: vest.pantalon, fa: vest.fa, fc: vest.fc, mov: vest.mov, propioPiel: vest.propioPiel, propioCamisa: vest.propioCamisa,
          pelo: vest.pelo, receta: vest.receta,
          sombrero: sombrero, iSom: -1, iMano: quest ? (nQuest++) * 2 : -1,
          // emisor simulado: dónde está de verdad, adónde va, su reloj (u32, algunos a punto de dar la vuelta) y su secuencia
          home: home, x: home.x + (azar() - 0.5) * 20, y: home.y + (azar() - 0.5) * 20, dest: null, vel: 1.1 + azar() * 0.5, rum: 0, fase: azar() * 6.28,
          reloj: k % 4 === 0 ? 4294967296 - 3000 - k * 1000 - Math.round(performance.now()) : Math.floor(azar() * 1e9), seq: Math.floor(azar() * 65536), tTick: azar() * TICK, nTick: 0, cerca: false,
          buf: BufferPose.crea(), out: BufferPose.salida(), visto: false, vrm: null, modo: veh === "quad" ? 1 : veh === "dron" ? 2 : veh === "mixto" ? k % 3 : 0
        });
        var nuevo = V[V.length - 1]; if (nuevo.modo === 1) nuevo.vel = 5.5; else if (nuevo.modo === 2) nuevo.vel = 0;   // en quad, deprisa; con el dron, quieto
      }
      est.quest = nQuest;
      montaGrafica(N, N * Aspecto.CAJAS_MAX, Math.max(1, nQuest * 2));
      mManos.count = nQuest * 2;
      V.forEach(function (a) { tomaAccesorios(a); colorea(a); pintaNombre(a.k, a.alias, a.oficial); });
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { for (var i = 0; i < m.count; i++) m.setMatrixAt(i, m4.makeScale(0, 0, 0)); });   // nada se ve hasta que llega la pose inicial
    }

    // ---- el emisor simulado: anda hacia un destino cerca de su «casa» y manda su pose por la red de mentira
    function oyente() {   // dónde está quien observa (en metros este/norte): la cabeza en VR, el paseante, el punto de la órbita
      if (VRX.on) return { x: VRX.cab.x, y: -VRX.cab.z };
      if (paseando) return { x: pp.x, y: pp.y };
      return { x: objetivo.x, y: -objetivo.z };
    }
    function poseVerdad(a, tMs, o) {   // la pose del visitante simulado en este instante, en el sistema del contrato (cota sin exagerar)
      var s = suelo(a.x, a.y), cab = ALTO_OJOS + Math.sin(a.fase * 2) * 0.03, cab0 = Math.sin(a.fase * 0.37) * 0.35, cab1 = Math.sin(a.fase * 0.23) * 0.15;
      q1.setFromEuler(new THREE.Euler(cab1, a.rum + cab0, 0, "YXZ"));
      o.tipo = a.quest ? PoseCodec.QUEST : PoseCodec.ESCRITORIO; o.seq = a.seq; o.t = (a.reloj + tMs) >>> 0; o.modo = a.modo;
      o.cab = { p: [a.x, s + cab, -a.y], q: [q1.x, q1.y, q1.z, q1.w] };
      if (a.quest) {
        var cr = Math.cos(a.rum), sr = Math.sin(a.rum), bal = Math.sin(a.fase * 2) * 0.18;
        q1.setFromAxisAngle(ejeY, a.rum);
        var mano = function (lado, b) { var lx = lado * 0.24, lz = -0.25 + b; return { p: [a.x + lx * cr + lz * sr, s + 1.0, -a.y - lx * sr + lz * cr], q: [q1.x, q1.y, q1.z, q1.w] }; };
        o.izq = mano(-1, bal); o.der = mano(1, -bal);
      } else { o.izq = null; o.der = null; }
      return o;
    }
    function anda(a, dt) {
      if (!a.dest || Math.hypot(a.dest.x - a.x, a.dest.y - a.y) < 1.5) {
        var e = D.ext; a.dest = { x: Math.max(e[0] + 5, Math.min(e[2] - 5, a.home.x + (azar() - 0.5) * 120)), y: Math.max(e[3] + 5, Math.min(e[1] - 5, a.home.y + (azar() - 0.5) * 120)) };
      }
      var dx = a.dest.x - a.x, dy = a.dest.y - a.y, d = Math.hypot(dx, dy) || 1, obj = Math.atan2(-dx, dy), dif = Math.atan2(Math.sin(obj - a.rum), Math.cos(obj - a.rum));
      a.rum += Math.max(-dt * 2, Math.min(dt * 2, dif)); a.x += dx / d * a.vel * dt; a.y += dy / d * a.vel * dt; a.fase += dt * a.vel * 3.2;
    }
    function emite(a, dt, tMs, ol) {   // contrato: un «tic» cada 100 ms; a los cercanos se les manda en cada tic (10 Hz), a todos en uno de cada 5 (2 Hz)
      var d = Math.hypot(a.x - ol.x, a.y - ol.y); a.cerca = a.cerca ? d < CERCA_SALE : d < CERCA_ENTRA;
      a.tTick += dt; if (a.tTick < TICK) return; a.tTick -= TICK; if (a.tTick > TICK) a.tTick = 0; a.nTick++;
      if (!(a.cerca || a.nTick % CADA_LEJOS === 0)) return;
      a.seq = (a.seq + 1) & 0xffff;
      var b = PoseCodec.codifica(poseVerdad(a, tMs, {})); est.enviados++; bytesVentana += b.byteLength; est.bytes += b.byteLength;
      if (azar() < 0.01) { est.perdidos++; return; }
      redSim.push({ en: tMs + 30 + azar() * 60, k: a.k, b: b });
    }
    function entrega(tMs) {
      var listos = redSim.filter(function (m) { return m.en <= tMs; }); if (!listos.length) return;
      redSim = redSim.filter(function (m) { return m.en > tMs; }); listos.sort(function (x, y) { return x.en - y.en; });
      for (var i = 0; i < listos.length; i++) {
        var m = listos[i], p = PoseCodec.decodifica(m.b), a = V[m.k];
        if (!p) continue;
        // el instante de llegada se pasa en el reloj del RECEPTOR; el desfase con el del emisor lo estima el búfer
        if (BufferPose.recibe(a.buf, p, tMs)) est.recibidos++; else est.viejos++;
      }
    }

    // AV2: el apoyo de a (ilustrativo, no medido), en el espacio del cuerpo (mBase, ya con la altura): hacia −z es delante, y = 0 el origen del cuerpo (sentado en la silla, el suelo queda en y = 0,31).
    // Silla: asiento, respaldo y dos ruedas (solo con mu.vehiculo === 3); bastón: una caja fina junto a la mano derecha; andador: una barra delante y dos laterales (los dos, solo a pie).
    // En quad, con el dron o con VRM no se dibujan. La rueda no gira (una caja instanciada de 10 lados: no se vería).
    function caja(i, x, y, z, sx, sy, sz) { mPieza.compose(v1.set(x, y, z), qI, v2.set(sx, sy, sz)); mSombrero.setMatrixAt(i, m4b.multiplyMatrices(mBase, mPieza)); }
    function apoyo(a, mu, fc) {
      var n = a.iApoyo, ids = a.cajas, v = mu.vehiculo, vis = a.mov === "silla" ? v === 3 : v === 0, i;
      if (!vis) { m4b.makeScale(0, 0, 0); for (i = n; i < ids.length; i++) mSombrero.setMatrixAt(ids[i], m4b); for (i = 0; i < a.ruedas.length; i++) mRuedas.setMatrixAt(a.ruedas[i], m4b); return; }
      if (a.mov === "silla") {
        caja(ids[n], 0, 0.8, -0.12, 0.62, 0.06, 0.52); caja(ids[n + 1], 0, 1.1, 0.17, 0.6, 0.5, 0.04);
        for (i = 0; i < 2; i++) { mPieza.compose(v1.set((i ? 1 : -1) * (0.3 * fc + 0.14), 0.61, 0.1), qI, vU); mRuedas.setMatrixAt(a.ruedas[i], m4b.multiplyMatrices(mBase, mPieza)); }
      } else if (a.mov === "baston") caja(ids[n], 0.3 * fc + 0.04, 0.43, -0.05, 0.035, 0.86, 0.035);
      else if (a.mov === "andador") { caja(ids[n], 0, 0.85, -0.5, 0.64, 0.04, 0.04); caja(ids[n + 1], -0.31, 0.425, -0.3, 0.03, 0.85, 0.4); caja(ids[n + 2], 0.31, 0.425, -0.3, 0.03, 0.85, 0.4); }
    }
    // ---- el receptor (las dos variantes): interpola y coloca las instancias. ret = el retardo que toca (150 ms si llega a 10 Hz, 650 si a 2 Hz)
    function coloca(a, tMs, dt, ret) {
      var paso = dt * 500; a.ret = a.ret == null ? ret : a.ret + Math.max(-paso, Math.min(paso, ret - a.ret));   // el retardo cambia a 0,5 s por segundo: el avatar no salta al cambiar de tasa
      var o = a.out;
      if (!BufferPose.muestra(a.buf, tMs, a.ret, o)) return;
      a.visto = true;
      // los pies, en el suelo de ESTE mundo (suelo local × exageración), no en la cota de la pose; de la pose, la posición horizontal,
      // hacia dónde apunta y, solo con gafas, cuánto se agacha: altura de su cabeza sobre el suelo (la cota viaja sin exagerar). En
      // escritorio/móvil la cota no se usa: el muñeco va de pie (su suelo y el nuestro pueden diferir unos cm mientras llegan teselas)
      var c = o.cab.p, s = suelo(c[0], -c[2]), conManos = !!(o.hayIzq || o.hayDer);
      q1.set(o.cab.q[0], o.cab.q[1], o.cab.q[2], o.cab.q[3]);
      v2.set(0, 0, -1).applyQuaternion(q1); var yawCab = Math.atan2(-v2.x, -v2.z);
      // AV2: con la silla de ruedas, sentado (AV4: también con VRM, que se sienta igual: 26b_avatares.js); la altura escala todo el muñeco y la complexión, el ancho y el fondo de cada pieza
      var fa = a.fa || 1, fc = a.fc || 1, mu = Muneco.avanza(a.mu || (a.mu = Muneco.crea()), c[0], c[2], yawCab, dt, s, exag, o.tipo === PoseCodec.QUEST ? c[1] - s : NaN, conManos, outMu, o.modo, a.mov === "silla");
      var yv = mu.yPies + (mu.yCab - mu.yPies) * fa;
      var cx = c[0] + Math.sin(mu.yaw) * mu.atras, cz = c[2] + Math.cos(mu.yaw) * mu.atras;   // en quad, el cuerpo 0,2 m detrás del centro del quad (16_vida.js)
      mBase.compose(v1.set(cx, mu.yPies, cz), q1.setFromAxisAngle(ejeY, mu.yaw), vF.set(fa, fa, fa));
      var giros = [0, mu.piernaI, mu.piernaD, mu.brazoI, mu.brazoD];
      for (var j = 0; j < NP; j++) {
        var P = Muneco.PIEZAS[j], largo = P[5] ? Math.max(0.2, P[1] - mu.agacho) : P[1];   // agachado: baja el cuerpo y encogen las piernas
        mPieza.compose(v1.set(P[3] * fc, P[4] - mu.agacho, 0), q1.setFromAxisAngle(ejeX, giros[j]), v2.set(P[0] * fc, largo, P[2] * fc));
        mCuerpo.setMatrixAt(a.k * NP + j, m4.multiplyMatrices(mBase, mPieza));
      }
      // la cabeza encima del muñeco, girada como la de verdad (apunta donde apunta)
      q1.set(o.cab.q[0], o.cab.q[1], o.cab.q[2], o.cab.q[3]);
      m4.compose(v1.set(cx, yv, cz), q1, vF); mCabeza.setMatrixAt(a.k, m4);
      if (a.iSom >= 0) { m4b.multiplyMatrices(m4, matSombreroLocal[a.sombrero]); mSombrero.setMatrixAt(a.iSom, m4b); }
      if (a.cajas && a.cajas.length > a.iApoyo) apoyo(a, mu, fc);
      if (a.iIns >= 0) caja(a.iIns, -0.11 * fc, 1.33 - mu.agacho, -0.125 * fc - 0.016, 0.12, 0.09, 0.03);   // OF10: la insignia, en el pecho (delante es −z), a la izquierda
      if (a.iMano >= 0) {
        [o.izq, o.der].forEach(function (h, i) {
          var hay = i === 0 ? o.hayIzq : o.hayDer;
          if (!hay) { mManos.setMatrixAt(a.iMano + i, m4.makeScale(0, 0, 0)); return; }
          var sh = suelo(h.p[0], -h.p[2]); q1.set(h.q[0], h.q[1], h.q[2], h.q[3]);
          mManos.setMatrixAt(a.iMano + i, m4.compose(v1.set(h.p[0], sh * exag + (h.p[1] - sh), h.p[2]), q1, vS));
        });
      }
      // P7c: si lleva su VRM y ya se ve entero, el muñeco no se dibuja (escala 0); el nombre y el vehículo, sí
      if (vrmG && vrmG.coloca(a, mu, o, yawCab, cx, cz, dt)) {
        m4.makeScale(0, 0, 0);
        for (var jt = 0; jt < NP; jt++) mCuerpo.setMatrixAt(a.k * NP + jt, m4);
        // el sombrero del muñeco, no (el VRM lleva el suyo o ninguno); el apoyo (silla, bastón, andador) sí: AV4, el VRM se sienta en la silla del muñeco
        mCabeza.setMatrixAt(a.k, m4); if (a.iSom >= 0) mSombrero.setMatrixAt(a.iSom, m4); if (a.iIns >= 0) mSombrero.setMatrixAt(a.iIns, m4);   // con VRM, la insignia va en su etiqueta
        if (a.iMano >= 0) { mManos.setMatrixAt(a.iMano, m4); mManos.setMatrixAt(a.iMano + 1, m4); }
      }
      // el nombre, encima de la cabeza; crece con la distancia para leerse y se apaga lejos (UX §5.4: nombres sobre los avatares)
      var dc = camera.position.distanceTo(v1.set(c[0], yv, c[2])), e = Math.max(1, Math.min(4, dc / 20));
      if (dc > 160) m4.makeScale(0, 0, 0); else m4.compose(v1.set(c[0], yv + 0.35 + 0.15 * e, c[2]), q1.identity(), vS.set(e, e, e));
      vS.set(1, 1, 1); mNombres.setMatrixAt(a.k, m4);
      // el vehículo (P6): el quad debajo, con su rumbo; el dron no viaja en la pose (solo el modo): se dibuja ILUSTRATIVO, a 5 m delante de
      // donde mira quien lo vuela y a 4 m del suelo (el paseante local se vuelve a mirar su dron, así que su cabeza apunta más o menos hacia él)
      if (mQuad) { if (mu.vehiculo === 1) { nVehQ++; m4.compose(v1.set(c[0], mu.yVeh, c[2]), q1.setFromAxisAngle(ejeY, mu.yaw), vS); } else m4.makeScale(0, 0, 0); mQuad.setMatrixAt(a.k, m4); }
      if (mDron) {
        if (mu.vehiculo === 2) {
          nVehD++; var px = c[0] - Math.sin(yawCab) * DRON_DELANTE, pz = c[2] - Math.cos(yawCab) * DRON_DELANTE;
          m4.compose(v1.set(px, suelo(px, -pz) * exag + DRON_ALTO + Math.sin(tVeh * 2.2 + a.k) * 0.05, pz), q1.setFromAxisAngle(ejeY, yawCab), vEsc);
        } else m4.makeScale(0, 0, 0);
        mDron.setMatrixAt(a.k, m4);
      }
      // medida (solo en la simulación se sabe la verdad): retardo de presentación y error de posición frente a dónde está de verdad ahora
      if (variante === "sim" && a.cerca) { var dr = ((a.reloj + tMs - o.t) % 4294967296 + 4294967296) % 4294967296; muestrasRet.push(dr > 2147483648 ? dr - 4294967296 : dr); muestrasErr.push(Math.hypot(c[0] - a.x, -c[2] - a.y)); }
    }
    function p95(v) { if (!v.length) return 0; var s = v.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; }

    // ---- la sala de verdad (?presencia=red): la sala «visita» de la red (37_red.js, el único que habla con LiveKit), el token de la api, la pose propia y el
    // apartado Gente con el chat. sala = la sala de la red mientras estás dentro (o reconectando); null fuera
    var SR = null, sala = null, SP = null, porId = Object.create(null), huecos = [], bloqueados = Object.create(null), yo = null, manoDe = ["", ""], quitaRed = [], quitaMandos = [];
    // OF10: la sala del mundo en la que estás, por su clave (contratos/livekit-roles.json v4): «general» (la de siempre) o «visita» (a la que invita la oficina)
    var SALAS_MUNDO = { general: "Visita libre", visita: "Sala de la visita" }, claveSala = "general";
    var ui = null, mensajes = [], tChat = 0, tGente = 0, claveGente = "", conectando = false, poseL = { tipo: 1, seq: 0, t: 0, cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: null, der: null };
    var mDesc = null, vDesc = null, qDesc = null, sDesc = null;
    // medida de las pruebas (P4): con window.__presenciaMide puesto ANTES de cargar, se apunta cada pose que llega
    // [identidad, reloj del emisor (bytes 4-7), llegada en performance.now()]; se lee y vacía con __presencia("llegadas")
    var medLlegadas = null;
    function iniciaRed() {
      if (window.__presenciaMide) medLlegadas = [];
      montaGrafica(MAXV, MAXV * Aspecto.CAJAS_MAX, MAXV * 2);   // las cajas de accesorios: las que pueda pedir cada uno (antes, MAXV: con sombrero y apoyo se quedaban cortas)
      for (var k = MAXV - 1; k >= 0; k--) huecos.push(k);
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { for (var i = 0; i < m.count; i++) m.setMatrixAt(i, m4.makeScale(0, 0, 0)); });
      mDesc = new THREE.Matrix4(); vDesc = new THREE.Vector3(); qDesc = new THREE.Quaternion(); sDesc = new THREE.Vector3();
      SP = SalaPose.crea(Math.floor(Math.random() * 65536));
      // qué mando es cada mano (lo dice el propio WebXR al conectarse el mando)
      [0, 1].forEach(function (i) {
        var c = renderer.xr.getController(i), con = function (e) { manoDe[i] = (e.data && e.data.handedness) || ""; }, des = function () { manoDe[i] = ""; };
        c.addEventListener("connected", con); c.addEventListener("disconnected", des);
        quitaMandos.push(function () { c.removeEventListener("connected", con); c.removeEventListener("disconnected", des); });
      });
      // la sala «visita» de la red: los temas del contrato (pose, no fiable; chat, fiable) y quién entra y sale. Sin la red (su fichero fuera del motor:
      // con ella apagada, este componente ni se monta) no hay sala: el panel lo dice y no se intenta entrar
      SR = R ? R.sala("visita") : null;
      if (SR) quitaRed.push(SR.escucha("pose", function (datos, de) { recibeDatos(datos, de, "pose"); }), SR.escucha("chat", function (datos, de) { recibeDatos(datos, de, "chat"); }),
        SR.al("entra", function (de) { entraOtro(de); }), SR.al("sale", function (id) { saleOtro(id); }), SR.al("estado", alEstado));
      montaPanel();
      if (SR) conecta(); else ponEstado("La visita compartida no está disponible en esta página.", false);
    }
    function dispositivo() { var ua = navigator.userAgent || ""; return /OculusBrowser|Quest/i.test(ua) ? "quest" : /Mobi|Android|iPhone|iPad/i.test(ua) ? "movil" : "escritorio"; }
    var volverGeneral = "";   // OF10b: el aviso de que no te dejaron entrar en la sala de la visita; tras él se vuelve a la general
    // OF10b: entra en la sala de claveSala; si la api la niega por ser de un evento (403 visita_solo_inscritos), avisa con amabilidad y vuelve a la general
    async function conecta() {
      await conectaUna();
      if (volverGeneral) { var msgSala = volverGeneral; volverGeneral = ""; await conectaUna(); ponEstado(msgSala, false); pintaNota(); }
    }
    async function conectaUna() {
      if (conectando || sala || !SR) return;
      conectando = true; ponEstado("Entrando en la visita compartida…", false);
      try {
        // el token lo da la api con tu sesión (mismo origen); la identidad, el alias y el avatar los pone ella
        var cuerpo = { dispositivo: dispositivo() }; if (claveSala !== "general") cuerpo.sala = claveSala;   // OF10: sin sala, la general (como siempre)
        var r = await fetch("/api/presencia/token", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
        if (!r.ok) {
          var e = null; try { e = await r.json(); } catch (x) { e = null; }
          // OF10b: la sala de la visita ligada a un evento de la agenda es solo de las familias apuntadas (403 visita_solo_inscritos): mensaje amable y de vuelta a la general
          if (r.status === 403 && e && e.error === "visita_solo_inscritos" && claveSala !== "general") {
            claveSala = "general"; volverGeneral = typeof e.mensaje === "string" && e.mensaje ? e.mensaje : "Esta visita es para las familias apuntadas.";
            return;
          }
          ponEstado(r.status === 401 ? "Entra con tu enlace para ver a los demás." : (e && typeof e.mensaje === "string" ? e.mensaje : "No se pudo entrar en la visita compartida (" + r.status + ")."), true);
          return;
        }
        var t = await r.json();
        if (!activo) return;
        // la red resuelve la URL (wss://… o /rtc del mismo origen) contra la página y pide livekit-client la primera vez (import() solo con esta bandera)
        if (!(await SR.une({ url: t.url, token: t.token })) || !activo) return;
        var mi = SR.yo(); sala = SR;
        yo = { identidad: mi.identidad, info: SalaPose.leeInfo(mi.metadatos) };
        SR.participantes().forEach(function (de) { entraOtro(de); });
        ponEstado("", false); pintaNota();
      } catch (err) {
        ponEstado("No se pudo conectar con la visita compartida.", true);
        if (typeof console !== "undefined") console.warn("presencia: " + (err && err.message ? err.message : err));
      } finally { conectando = false; }
    }
    // el estado de la sala (37_red.js): reconectando, de vuelta, o fuera (con su motivo)
    function alEstado(d) {
      if (d.estado === "reconectando") ponEstado("Reconectando…", false);
      else if (d.estado === "dentro") { if (yo) ponEstado("", false); }
      else if (d.estado === "fuera") alSalir(d.motivo);
    }
    function alSalir(motivo) {
      if (!sala && !yo) return;
      sala = null; yo = null;
      Object.keys(porId).forEach(saleOtro);
      if (!activo) return;
      ponEstado(motivo === "expulsado" ? "La oficina te ha sacado de la visita compartida." : motivo === "duplicado" ? "Has abierto la visita compartida en otra pestaña: aquí se ha cerrado." : "Te has desconectado de la visita compartida.", true);
    }
    // OF10: pasar a otra sala del mundo (la invitación de la oficina, 39_oficina_mundo.js, o la propia oficina). Se deja de ver a los de la sala de antes y se pide
    // un token de la nueva; la red (37_red.js) deja la vieja al unirse a la nueva bajo la misma clave «visita». No te mueve de sitio en el mundo: cambia con quién estás.
    // Promesa: true si queda dentro de la nueva; false si no había sala, ya estabas en ella, estaba entrando o no se pudo
    function cambiaSala(clave) {
      if (!SR || !Object.prototype.hasOwnProperty.call(SALAS_MUNDO, clave) || conectando) return Promise.resolve(false);
      if (clave === claveSala && sala) return Promise.resolve(false);
      claveSala = clave; Object.keys(porId).forEach(saleOtro); sala = null; yo = null; claveGente = "";   // así el «fuera» de la sala vieja no avisa de nada
      return conecta().then(function () { pintaNota(); return !!sala && claveSala === clave; });
    }
    function pintaNota() { if (ui && ui.nota) ui.nota.textContent = SALAS_MUNDO[claveSala] + ": sin voz. El chat no se guarda."; }
    // de = { identidad, metadatos } (37_red.js): los metadatos los pone la api en el token y se leen como DATOS (SalaPose.leeInfo)
    function entraOtro(de) {
      var id = de && de.identidad; if (!id || porId[id]) return porId[id] || null;
      if (!huecos.length) { est.sinPlaza = (est.sinPlaza || 0) + 1; return null; }
      var h = huecos.pop(), mt = SalaPose.leeInfo(de.metadatos);
      var vest = Aspecto.viste(mt);   // AV2: piel (10 tonos), ropa de arriba y de abajo, altura, complexión y apoyo; sin ellos, el de antes
      var a = { k: h, id: id, info: mt, alias: mt.alias, vrm: mt.vrm, oficial: vest.oficial, chaleco: vest.chaleco, iIns: -1, camisa: vest.camisa, piel: vest.piel, pantalon: vest.pantalon, fa: vest.fa, fc: vest.fc, mov: vest.mov, propioPiel: vest.propioPiel, propioCamisa: vest.propioCamisa,
        pelo: vest.pelo, receta: vest.receta,
        sombrero: mt.sombrero, iSom: -1, iMano: h * 2, out: BufferPose.salida(), ret: null, visto: false, cerca: false };
      tomaAccesorios(a);
      a.o = SalaPose.entra(SP, id, mt); a.buf = a.o.buf;
      colorea(a); pintaNombre(h, mt.alias, mt.oficial); oculta(a);
      porId[id] = a; claveGente = ""; cambio = true; return a;
    }
    function saleOtro(id) {
      var a = porId[id]; if (!a) return;
      if (vrmG) vrmG.sale(a);
      oculta(a); sueltaAccesorios(a); pintaNombre(a.k, ""); huecos.push(a.k); delete porId[id]; SalaPose.sale(SP, id); claveGente = "";
    }
    function recibeDatos(datos, de, tema) {
      if (!de || !de.identidad || (yo && de.identidad === yo.identidad)) return;
      if (tema === "pose") {
        var a = porId[de.identidad] || entraOtro(de); if (!a) return;
        var llega = performance.now();
        if (SalaPose.recibe(SP, de.identidad, datos, llega)) est.recibidos++; else est.viejos++;
        if (medLlegadas && datos.byteLength >= 8) { medLlegadas.push([de.identidad, new DataView(datos.buffer, datos.byteOffset, datos.byteLength).getUint32(4, true), llega]); if (medLlegadas.length > 20000) medLlegadas.shift(); }
      } else if (tema === "chat") {
        var txt = Chat.decodifica(datos); if (txt === null || bloqueados[de.identidad]) return;
        var b = porId[de.identidad]; anadeMensaje(b ? b.alias : SalaPose.leeInfo(de.metadatos).alias, txt, false);
      }
    }
    // la pose propia en el sistema del contrato (cota SIN exagerar), o null si estás en vista aérea (órbita, vuelo o mirador de VR): entonces no se publica (decisión 60)
    function poseLocal(tMs) {
      var o = poseL, s;
      if (VRX.on) {
        if (VRX.vuelo || VRX.mirador) return null;
        var h = VRX.cab; s = suelo(h.x, -h.z);
        q1.setFromAxisAngle(ejeY, VRX.rig.yaw).multiply(camera.quaternion);
        o.tipo = PoseCodec.QUEST; o.cab.p[0] = h.x; o.cab.p[1] = h.y - s * exag + s; o.cab.p[2] = h.z; o.cab.q[0] = q1.x; o.cab.q[1] = q1.y; o.cab.q[2] = q1.z; o.cab.q[3] = q1.w;
        o.izq = manoLocal("left"); o.der = manoLocal("right"); o.modo = PoseCodec.PIE;
      } else if (paseando) {
        s = suelo(pp.x, pp.y); q1.setFromAxisAngle(ejeY, -pp.ang);
        o.tipo = PoseCodec.ESCRITORIO; o.cab.p[0] = pp.x; o.cab.p[1] = s + ALTO_OJOS; o.cab.p[2] = -pp.y; o.cab.q[0] = q1.x; o.cab.q[1] = q1.y; o.cab.q[2] = q1.z; o.cab.q[3] = q1.w;
        o.izq = null; o.der = null; o.modo = enQuad ? PoseCodec.QUAD : enDron ? PoseCodec.DRON : PoseCodec.PIE;
      } else return null;
      o.t = tMs >>> 0;
      return o;
    }
    function manoLocal(lado) {   // la empuñadura del mando de ese lado, en el mundo (el rig ya va dentro de matrixWorld); null si no hay mando
      var i = manoDe[0] === lado ? 0 : manoDe[1] === lado ? 1 : -1; if (i < 0) return null;
      var g = renderer.xr.getControllerGrip(i); if (!g || !g.parent || !g.visible) return null;
      mDesc.copy(g.matrixWorld).decompose(vDesc, qDesc, sDesc);
      var s = suelo(vDesc.x, -vDesc.z);
      return { p: [vDesc.x, vDesc.y - s * exag + s, vDesc.z], q: [qDesc.x, qDesc.y, qDesc.z, qDesc.w] };
    }
    function actualizaRed(dt, tMs) {
      var envios = SalaPose.tic(SP, tMs, sala ? poseLocal(tMs) : null);
      if (envios && sala) envios.forEach(function (e) {
        var op = { fiable: false }; if (e.destinos) op.destinos = e.destinos;   // tema «pose», no fiable (contratos/presencia.md)
        sala.publica("pose", e.bytes, op).catch(function () { est.perdidos++; });
        est.enviados++; est.bytes += e.bytes.byteLength; bytesVentana += e.bytes.byteLength;
      });
      var nc = 0, id, a;
      for (id in porId) {
        a = porId[id];
        if (!SalaPose.seVe(SP, id, tMs, bloqueados)) { if (a.visto) oculta(a); continue; }   // bloqueado o en vista aérea: no se dibuja
        a.buf = a.o.buf; coloca(a, tMs, dt, SalaPose.retardo(a.o));   // (el búfer se rehace si vuelve tras un rato sin pose)
        if (a.o.cerca) nc++;
      }
      est.cerca = nc; est.n = Object.keys(porId).length;
      tGente += dt; if (tGente >= 0.5) { tGente = 0; pintaGente(tMs); }
    }

    // ---- apartado Gente y chat (solo con ?presencia=red). Todo el texto que llega se pone con textContent: nunca como HTML
    function el(tag, props, hijos) { var e = document.createElement(tag); if (props) Object.keys(props).forEach(function (k) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
    // el chat es una ventana flotante que se mueve (34_movibles.js): barra con agarre ⠿, «Llevar a…» ⋯ y minimizar –; minimizada es una burbuja, también movible,
    // con los mensajes sin leer. La lista de Gente va en #ventanaGente si la página la trae (UX §6); si no, dentro del chat, como hasta ahora
    function conMov(fn) { if (typeof Movibles !== "undefined" && Movibles && Movibles.hazMovible) fn(); else setTimeout(function () { if (typeof Movibles !== "undefined" && Movibles && Movibles.hazMovible) fn(); }, 0); }   // el componente se monta con todo cargado (34_movibles.js ya está); si faltara, se espera un turno
    function montaPanel() {
      var boton = "font:inherit;color:inherit;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:4px 10px;min-height:44px;cursor:pointer";
      var estiloMini = "font:inherit;color:inherit;background:none;border:0;min-width:44px;min-height:44px;cursor:pointer;padding:0;font-size:18px";
      var agarre = el("button", { type: "button", className: "agarre", style: estiloMini + ";cursor:grab;color:rgba(255,255,255,0.7)", "aria-label": "Mover el chat: flechas del teclado (Mayús, más deprisa; Inicio, a su sitio)", title: "Arrastra para mover el chat" }, ["⠿"]);
      var titulo = el("strong", { style: "flex:1;font-size:14px" }, ["Chat"]);
      var llevar = el("button", { type: "button", style: estiloMini, "aria-label": "Llevar el chat a…", title: "Llevar a…" }, ["⋯"]);
      var minimiza = el("button", { type: "button", style: estiloMini, "aria-label": "Minimizar el chat", title: "Minimizar" }, ["–"]);
      var asa = el("div", { className: "asa", style: "display:flex;align-items:center;gap:2px;padding-left:2px;border-bottom:1px solid rgba(255,255,255,0.2);cursor:grab" }, [agarre, titulo, llevar, minimiza]);
      var cuerpo = el("div", { style: "flex:1;min-height:0;overflow:auto;padding:0 8px" });
      var estado = el("p", { style: "margin:6px 0;color:#ffd58a", role: "status" });
      var reentra = el("button", { type: "button", style: boton, hidden: true }, ["Volver a entrar"]);
      var gTitulo = el("h3", { style: "margin:6px 0 0;font-size:13px" }, ["Gente"]);
      var listaG = el("ul", { style: "list-style:none;margin:4px 0;padding:0;max-height:22vh;overflow:auto" });
      var gSeccion = el("div", { id: "presenciaListaGente" }, [gTitulo, listaG]);
      var chat = el("ol", { style: "list-style:none;margin:6px 0;padding:0", "aria-live": "polite", "aria-label": "Chat de la visita" });
      var entrada = el("input", { type: "text", maxLength: Chat.MAX, autocomplete: "off", placeholder: "Escribe a la visita", "aria-label": "Mensaje para la visita (no se guarda)", style: "flex:1;min-width:0;font:inherit;min-height:44px;padding:0 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.3);color:inherit" });
      var forma = el("form", { style: "display:flex;gap:6px;padding:6px 8px 0" }, [entrada, el("button", { type: "submit", style: boton }, ["Enviar"])]);
      var nota = el("p", { style: "margin:4px 0;padding:0 8px;opacity:0.7;font-size:11px" }, ["Visita libre: sin voz. El chat no se guarda."]);
      var ventanaG = document.getElementById("ventanaGente");
      cuerpo.appendChild(estado); cuerpo.appendChild(reentra); if (!ventanaG) cuerpo.appendChild(gSeccion); cuerpo.appendChild(chat);
      if (ventanaG) ventanaG.appendChild(gSeccion);
      var raiz = el("section", { id: "presenciaGente", "aria-label": "Chat y gente de la visita", style: "position:absolute;left:12px;bottom:12px;z-index:30;width:min(300px,calc(100% - 24px));height:min(320px,46%);display:flex;flex-direction:column;overflow:hidden;border-radius:12px;background:rgba(16,20,24,0.88);color:#fff;font:13px/1.35 system-ui,sans-serif;box-sizing:border-box" }, [asa, cuerpo, forma, nota]);
      var cont = el("span", { style: "position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 4px;box-sizing:border-box;border-radius:10px;background:#e5484d;color:#fff;font-size:12px;line-height:20px;text-align:center", hidden: true });
      var burbuja = el("button", { type: "button", id: "presenciaBurbuja", style: "position:absolute;left:12px;bottom:12px;z-index:30;width:56px;height:56px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,0.3);background:rgba(16,20,24,0.88);color:#fff;font-size:24px;cursor:grab;display:grid;place-items:center", hidden: true }, ["💬", cont]);
      reentra.addEventListener("click", function () { conecta(); });
      entrada.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Escape") { ponChat("minimo"); burbuja.focus(); } });   // al escribir, las pulsaciones no mueven al paseante; Esc minimiza
      minimiza.addEventListener("click", function () { ponChat("minimo"); burbuja.focus(); });
      forma.addEventListener("submit", function (e) {
        e.preventDefault();
        var txt = Chat.limpia(entrada.value), ahora = performance.now();
        if (txt === null || !sala || ahora - tChat < 700) return;   // como mucho un mensaje cada 0,7 s
        tChat = ahora; entrada.value = "";
        sala.publica("chat", Chat.codifica(txt), { fiable: true }).then(function () { anadeMensaje("Tú", txt, true); }, function () { ponEstado("No se pudo mandar el mensaje.", false); });
      });
      (visor || document.body).appendChild(raiz); (visor || document.body).appendChild(burbuja);
      ui = { nota: nota, raiz: raiz, burbuja: burbuja, cont: cont, titulo: titulo, gTitulo: gTitulo, gSeccion: gSeccion, cuerpo: cuerpo, estado: estado, reentra: reentra, listaG: listaG, chat: chat, entrada: entrada, noLeidos: 0, ventana: "abierto", mov: null, movB: null };
      conMov(function () {
        if (!ui || ui.raiz !== raiz) return;
        var defecto = function (d) { return d.tactil ? { x: d.mg.l + 10, y: d.H * 0.36 } : { x: d.mg.l + 12, y: d.H - d.mg.b - d.h - 12 }; };   // escritorio, abajo a la izquierda; táctil, a la izquierda por encima de la cruceta
        ui.mov = Movibles.hazMovible(raiz, asa, "chat", null, { defecto: defecto });
        ui.movB = Movibles.hazMovible(burbuja, burbuja, "burbuja", function () { ponChat("abierto"); }, { defecto: function (d) { return { x: d.mg.l + 10, y: d.H * (d.tactil ? 0.42 : 0.7) }; } });
        ui.mov.menuLlevar(llevar);
        ponChat(ui.ventana, true);
      });
    }
    function ponChat(s, sinFoco) {
      if (!ui) return;
      ui.ventana = s;
      if (s === "abierto") { ui.burbuja.hidden = true; ui.raiz.hidden = false; ui.noLeidos = 0; if (ui.mov) ui.mov.coloca(); if (!sinFoco) ui.entrada.focus({ preventScroll: true }); }
      else { ui.raiz.hidden = true; ui.burbuja.hidden = false; if (ui.movB) ui.movB.coloca(); }
      pintaNoLeidos();
    }
    function pintaNoLeidos() {
      if (!ui) return;
      var n = ui.noLeidos; ui.cont.hidden = !n; ui.cont.textContent = n > 99 ? "99+" : n ? String(n) : "";
      ui.burbuja.setAttribute("aria-label", "Abrir el chat" + (n ? " (" + n + " sin leer)" : "") + ". Arrastra para mover");
    }
    function ponEstado(t, conBoton) { if (!ui) return; ui.estado.textContent = t; ui.estado.hidden = !t; ui.reentra.hidden = !conBoton; }
    function anadeMensaje(quien, txt, mio) {   // solo en memoria, los últimos 40: el chat no se guarda (decisión 40)
      mensajes.push({ quien: quien, txt: txt }); if (mensajes.length > 40) mensajes.shift();
      if (!ui) return;
      ui.chat.appendChild(el("li", { style: "margin:2px 0" + (mio ? ";opacity:0.85" : "") }, [el("strong", {}, [quien + ": "]), txt]));
      while (ui.chat.children.length > 40) ui.chat.removeChild(ui.chat.firstChild);
      ui.cuerpo.scrollTop = ui.cuerpo.scrollHeight;
      if (!mio && ui.ventana === "minimo") { ui.noLeidos++; pintaNoLeidos(); }
    }
    function pintaGente(tMs) {
      if (!ui) return;
      var enMundo = !!(sala && poseLocal(tMs)), g = SalaPose.gente(SP, tMs), clave = (yo ? "1" : "0") + (enMundo ? "m" : "a") + g.map(function (x) { return x.id + x.estado + (bloqueados[x.id] ? "b" : ""); }).join("|");
      if (clave === claveGente) return; claveGente = clave;
      ui.gTitulo.textContent = "Gente (" + (g.length + (yo ? 1 : 0)) + ")";
      while (ui.listaG.firstChild) ui.listaG.removeChild(ui.listaG.firstChild);
      if (yo) ui.listaG.appendChild(el("li", { style: "margin:3px 0" }, [el("strong", {}, ["Tú · " + (yo.info.oficial ? "◆ " : "") + yo.info.alias]), " · " + (enMundo ? "en el olivar" : "en vista aérea (no te ven)")]));
      g.forEach(function (x) {
        var m = x.info || SalaPose.leeInfo(""), bl = !!bloqueados[x.id];
        var b = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer", "aria-pressed": bl ? "true" : "false", title: "Solo te afecta a ti; nadie se entera" }, [bl ? "Desbloquear" : "Bloquear"]);
        b.addEventListener("click", function () { if (bloqueados[x.id]) delete bloqueados[x.id]; else bloqueados[x.id] = true; claveGente = ""; pintaGente(performance.now()); });
        // OF10: la oficina, la primera (SalaPose.gente) y con su insignia ◆ (decisión 107: siempre se sabe si la oficina está)
        var hijos = [(m.oficial ? "◆ " : "") + m.alias + " · " + m.rol + " · " + m.dispositivo + " · " + x.estado, b];
        if (x.enMundo && !bl) {   // «Ir con»: solo a quien está en el olivar (con pose) y no has bloqueado
          var ic = el("button", { type: "button", style: "font:inherit;color:inherit;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.55);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer", title: "Te deja a unos pasos, mirándola" }, ["Ir con " + m.alias]);
          ic.addEventListener("click", function () { irCon(x.id); });
          hijos.push(ic);
        }
        ui.listaG.appendChild(el("li", { style: "margin:3px 0" + (bl ? ";opacity:0.55" : "") }, hijos));
      });
    }

    // ---- «Ir con alguien» (I1, UX §5): quién se ve (para el minimapa y el panel Gente) y a dónde ir para estar a su lado. Solo a quien se dibuja: de
    // esta sala, con pose (no «en vista aérea») y sin bloquear por ti. No manda nada por la red: usa la pose que ya llega. Este módulo solo calcula el
    // punto (Encuentro, en el trozo puro); el salto, con su fundido en pantalla y en VR (nunca un vuelo de cámara), es el de 12b_llegada.js (Llegada.funde y Llegada.aparece)
    var puntosL = [];
    function seVe(a, tMs) { return !!a && a.visto && (variante !== "red" || SalaPose.seVe(SP, a.id, tMs, bloqueados)); }
    function idDe(a) { return variante === "red" ? a.id : "sim" + a.k; }
    function busca(id) { if (variante === "red") return porId[id] || null; var m = /^sim(\d+)$/.exec(String(id)); return m ? V[Number(m[1])] || null : null; }
    function puntos() {   // [{id, alias, x este, y norte, modo}] de los que se dibujan ahora mismo
      puntosL.length = 0; if (!activo) return puntosL;
      var tMs = performance.now(), l = variante === "red" ? Object.keys(porId).map(function (k) { return porId[k]; }) : V;
      for (var i = 0; i < l.length; i++) { var a = l[i]; if (!seVe(a, tMs)) continue; var c = a.out.cab.p; puntosL.push({ id: idDe(a), alias: a.alias, x: c[0], y: -c[2], modo: a.out.modo | 0 }); }
      return puntosL;
    }
    function destino(a) { var c = a.out.cab.p; return sitioJunto({ x: c[0], y: -c[2] }, oyente(), null, enQuad && !VRX.on ? 1.05 : 0.55); }
    function irCon(id) {
      if (!activo) return false;
      var a = busca(id); if (!seVe(a, performance.now())) return false;   // bloqueado, en vista aérea o ya no está: no se va
      // a oscuras (Llegada.funde, 12b_llegada.js: velo en pantalla, vrFundido con gafas) se recalcula el sitio (se ha podido mover) y se aparece allí
      return Llegada.funde(function () {
        if (!seVe(a, performance.now())) return;   // se fue (o la bloqueaste) mientras se fundía: te quedas donde estabas
        var L = destino(a), orbita = !paseando && !VRX.on;
        Llegada.aparece(L.x, L.y, L.ang);
        if (orbita) TR.act = false;   // sin la bajada volando de entrar al paseo (24_pantalla.js): ir con alguien nunca es un vuelo de cámara
        est.idas = (est.idas || 0) + 1; est.ultimaIda = { x: Math.round(L.x * 100) / 100, y: Math.round(L.y * 100) / 100, d: Math.round(L.d * 100) / 100, libre: L.libre };
      });
    }

    // ---- C7 (02e_entidades.js): las personas que se ven, como entidades persona:<id> (el de la sala o, en la simulación, sim<k>). Solo con presencia y solo
    // las que se dibujan (de esta sala, con pose, sin bloquear). Tocarla (a menos de 24 px de su cuerpo, de los pies a la cabeza) o apuntarla con el rayo de un
    // mando la elige y abre su ficha: cómo va, a cuántos metros y «Ir con» (irCon: fundido y de pie a su lado). El alias es de otra persona: siempre como texto.
    var quitaPersona = null, pv1 = new THREE.Vector3(), pv2 = new THREE.Vector3(), MODOS_P = ["a pie", "en quad", "con el dron"];
    function personaDe(id) { var m = /^persona:(.+)$/.exec(String(id)), a = m ? busca(m[1]) : null; return a && seVe(a, performance.now()) ? a : null; }
    function personasVistas() { var tMs = performance.now(); return personasTodas().filter(function (a) { return seVe(a, tMs); }); }
    function personaEnPantalla(cx, cy, r) {
      var mejor = null, md = 24;
      personasVistas().forEach(function (a) {
        var c = a.out.cab.p; pv1.set(c[0], c[1] - 1.55, c[2]).project(camera); pv2.set(c[0], c[1] + 0.15, c[2]).project(camera); if (pv1.z > 1 && pv2.z > 1) return;
        var ax = (pv1.x * 0.5 + 0.5) * r.width + r.left, ay = (-pv1.y * 0.5 + 0.5) * r.height + r.top, bx = (pv2.x * 0.5 + 0.5) * r.width + r.left, by = (-pv2.y * 0.5 + 0.5) * r.height + r.top;
        var vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / L)), d = Math.hypot(cx - (ax + t * vx), cy - (ay + t * vy));
        if (d < md) { md = d; mejor = a; }
      });
      return mejor ? { id: "persona:" + idDe(mejor), s: md / 24 } : null;
    }
    function personaEnRayo(rr) {   // un cilindro de los pies a la cabeza con un radio que crece con la distancia (al menos 0,5 m), a 0,4-300 m
      var o = rr.ray.origin, d = rr.ray.direction, bb = d.y, den = 1 - bb * bb, mejor = null, ms = 1e9; if (den < 1e-6) return null;
      personasVistas().forEach(function (a) {
        var c = a.out.cab.p, y0 = c[1] - 1.55; pv1.set(o.x - c[0], o.y - y0, o.z - c[2]);
        var dw = d.x * pv1.x + d.y * pv1.y + d.z * pv1.z, s = Math.max(0, Math.min(1.7, (pv1.y - bb * dw) / den)), t = (c[0] - o.x) * d.x + (y0 + s - o.y) * d.y + (c[2] - o.z) * d.z;
        if (t < 0.4 || t > 300) return;
        var dist = Math.hypot(o.x + d.x * t - c[0], o.y + d.y * t - y0 - s, o.z + d.z * t - c[2]), sc = dist / Math.max(0.5, t * 0.01);
        if (sc < 1 && sc + t * 0.0005 < ms) { ms = sc + t * 0.0005; mejor = { id: "persona:" + idDe(a), t: t, s: sc }; }
      });
      return mejor;
    }
    function fichaPersona(id, modoF) {
      var a = personaDe(id); if (!a) return null;
      var c = a.out.cab.p, o = oyente(), m = MODOS_P[a.out.modo | 0] || MODOS_P[0], al = String(a.alias || "Visitante"), dm = Math.round(Math.hypot(c[0] - o.x, -c[2] - o.y));
      return { titulo: al, filas: [{ k: "Va", v: m }, { k: "Está", v: "a " + dm + " m de ti" }], lineas: [m + " · a " + dm + " m de ti"],
        acciones: [{ id: "ir", txt: modoF === "vr" ? "Ir con" : "Ir con " + al, fn: function () { return irCon(idDe(a)); } }] };
    }
    if (variante) quitaPersona = Entidades.registra({ tipo: "persona", dueno: "38_presencia_compartida", prioridad: 30, pantalla: personaEnPantalla, rayo: personaEnRayo, ficha: fichaPersona,
      existe: function (id) { return !!personaDe(id); },
      lista: function () { return puntos().map(function (q) { return { id: "persona:" + q.id, ref: q.id, alias: q.alias, x: q.x, y: q.y, modo: q.modo }; }); },
      pos: function (id) { var a = personaDe(id), c = a && a.out.cab.p; return c ? { x: c[0], y: suelo(c[0], -c[2]) * exag, z: c[2] } : null; },
      radio: function () { return 0.7; } });

    function actualiza(dt) {
      if (!activo) return;
      var t0 = performance.now(), tMs = Math.round(t0), nc = 0, i;
      nVehQ = 0; nVehD = 0; tVeh += dt;
      if (variante === "red") actualizaRed(dt, t0);
      else {
        var ol = oyente();
        for (i = 0; i < V.length; i++) { anda(V[i], dt); emite(V[i], dt, tMs, ol); }
        entrega(tMs);
        for (i = 0; i < V.length; i++) { coloca(V[i], tMs, dt, V[i].cerca ? RET_CERCA : RET_LEJOS); if (V[i].cerca) nc++; }   // [SUPUESTO] el receptor sabe si le llega a 10 o a 2 Hz por la distancia que él mismo ve
        est.cerca = nc;
      }
      if (vrmG) vrmG.actualiza(dt);
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres, mRuedas].forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
      if (mQuad) { mQuad.visible = nVehQ > 0; mQuad.instanceMatrix.needsUpdate = true; } if (mDron) { mDron.visible = nVehD > 0; mDron.instanceMatrix.needsUpdate = true; }
      est.quad = nVehQ; est.dron = nVehD;
      var ms = performance.now() - t0; msVentana = Math.max(msVentana, ms); est.ms = est.ms ? est.ms * 0.95 + ms * 0.05 : ms;
      tEst += dt;
      if (tEst >= 1) {
        est.bps = Math.round(bytesVentana / tEst); est.msMax = msVentana; est.retP95 = Math.round(p95(muestrasRet)); est.errP95 = Math.round(p95(muestrasErr) * 100) / 100;
        bytesVentana = 0; msVentana = 0; tEst = 0; if (muestrasRet.length > 4000) { muestrasRet = muestrasRet.slice(-2000); muestrasErr = muestrasErr.slice(-2000); }
      }
    }
    function personasTodas() { return variante === "red" ? Object.keys(porId).map(function (k) { return porId[k]; }) : V; }
    function estado() {
      var e = { activo: activo, variante: variante, n: est.n, quest: est.quest, cerca: est.cerca, enviados: est.enviados, recibidos: est.recibidos, perdidos: est.perdidos, viejos: est.viejos, bytes: est.bytes,
        bytesPorSegundo: est.bps, ms: Math.round(est.ms * 1000) / 1000, msMax: Math.round(est.msMax * 1000) / 1000, retardoP95ms: est.retP95, errorP95m: est.errP95, vistos: V.filter(function (a) { return a.visto; }).length,
        enQuad: est.quad || 0, conDron: est.dron || 0, vehiculos: !!(mQuad && mDron), idas: est.idas || 0, ultimaIda: est.ultimaIda || null, vrm: vrmG ? vrmG.estado() : null,
        aspecto: mSombrero ? { cajas: mSombrero.count, ruedas: mRuedas.count, sillas: personasTodas().filter(function (a) { return a.mov === "silla"; }).length, bastones: personasTodas().filter(function (a) { return a.mov === "baston"; }).length, andadores: personasTodas().filter(function (a) { return a.mov === "andador"; }).length } : null };
      if (variante === "red") { e.sala = claveSala; e.oficina = !!(yo && yo.info.oficial); e.conectado = !!sala; e.identidad = yo ? yo.identidad : null; e.vistos = Object.keys(porId).filter(function (k) { return porId[k].visto; }).length; e.sinPlaza = est.sinPlaza || 0; e.enVistaAerea = !(sala && poseLocal(Math.round(performance.now()))); }
      return e;
    }
    function libera() {   // libera todo lo de la GPU (y, en red, sale de la sala y retira el apartado) y deja la presencia como sin la bandera
      if (quitaPersona) { quitaPersona(); quitaPersona = null; }   // C7: sin presencia no hay personas que elegir
      quitaRed.splice(0).forEach(function (q) { q(); }); quitaMandos.splice(0).forEach(function (q) { q(); });
      if (SR) { var s = SR; SR = null; sala = null; activo = false; s.sale(); }   // sale de la sala «visita» (o deja de entrar, si estaba entrando)
      if (!grupo) return;
      activo = false;
      if (vrmG) vrmG.libera();
      if (ui) { ui.raiz.remove(); ui.burbuja.remove(); ui.gSeccion.remove(); ui = null; }
      scene.remove(grupo); [mCuerpo, mCabeza, mSombrero, mManos, mNombres, mRuedas, mQuad, mDron].forEach(function (m) { if (m) m.dispose(); }); mQuad = null; mDron = null;
      geos.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); if (texNombres) texNombres.dispose();
      grupo = null; V = []; redSim = []; porId = Object.create(null); mensajes = [];
    }
    function texto() { return activo ? "presencia (" + variante + ") " + est.n + " · cerca " + est.cerca + " · " + est.bps + " B/s · JS " + est.ms.toFixed(2) + " ms" + (variante === "sim" ? " · retardo p95 " + est.retP95 + " ms" : sala ? "" : " · sin conexión") : ""; }
    if (variante === "sim") { inicia(); if (/[?&]chat=1(&|$)/.test(location.search)) montaPanel(); }   // &chat=1 (solo pruebas): la ventana del chat también en la simulación, sin sala
    else if (variante === "red") iniciaRed();
    function llegadas() { return { origen: performance.timeOrigin, l: medLlegadas ? medLlegadas.splice(0) : null }; }
    // para los avatares VRM (26b_avatares.js): las personas (todas, o solo las que se dibujan), tu id de avatar (de tus metadatos), recolorear el muñeco
    // lejano con los colores de su avatar y si ha entrado alguien desde la última vez que se preguntó; enganchaVRM(g) pone (o quita, con null) su gancho:
    // g.coloca(a, …) devuelve true si su VRM tapa ya al muñeco; g.oculta(a), g.sale(a), g.actualiza(dt), g.estado() y g.libera()
    var cambio = false;
    function vrmPersonas(todas) { var tMs = performance.now(), l = variante === "red" ? Object.keys(porId).map(function (k) { return porId[k]; }) : V; return todas ? l : l.filter(function (a) { return seVe(a, tMs); }); }
    function miVrm() { return yo && yo.info ? yo.info.vrm : null; }
    // AV4: lo tuyo para tu paseante con VRM (de tus metadatos: receta, vrm, sombrero y tus colores, los mismos que te ven los demás); null sin sala
    function miAvatar() {
      if (!yo || !yo.info) return null;
      var v = Aspecto.viste(yo.info);
      return { vrm: yo.info.vrm, receta: v.receta, sombrero: yo.info.sombrero, piel: v.piel, camisa: v.camisa, pantalon: v.pantalon, pelo: v.pelo, fa: v.fa, chaleco: v.chaleco };
    }
    // lo que ELIGIÓ la persona (tono o ropa de arriba) manda sobre los colores del catálogo (decisión 131); los colores del catálogo solo valen a quien no eligió
    function recolorea(a, camisa, piel) { if (!mCuerpo) return; if (camisa != null && !a.propioCamisa) a.camisa = camisa; if (piel != null && !a.propioPiel) a.piel = piel; colorea(a); }
    function cambiaron() { var c = cambio; cambio = false; return c; }
    function enganchaVRM(g) { vrmG = g || null; }
    // ?debug (28_depura.js): su línea, solo con la presencia activa
    n.on("depura:lineas", function (d) { var t = texto(); if (t && d && d.lineas) d.lineas.push(t); });
    // el icono del chat de la barra (31_hud.js): minimizado (burbuja) → se abre; abierto → se minimiza y el foco va a la burbuja. Sin ventana del chat, nada
    n.on("chat:alterna", function () { if (!ui) return; if (ui.raiz.hidden) ponChat("abierto"); else { ponChat("minimo"); ui.burbuja.focus(); } });
    // OF10 (39_oficina_mundo.js): en qué sala estás y cambiar de sala, quién eres en la sala (tus metadatos leídos como datos: { alias, rol, oficial }; null fuera) y
    // dejar un mensaje en el chat (el anuncio de la oficina: el texto ya viene limpio, y se pinta como texto)
    function miInfo() { return yo && yo.info ? { alias: yo.info.alias, rol: yo.info.rol, oficial: !!yo.info.oficial } : null; }
    function mensaje(quien, txt) { var t = Chat.limpia(txt), q = Chat.limpia(quien); if (t && q) anadeMensaje(q, t, false); return !!(t && q); }
    // F3d (45_voz.js): dónde está la cabeza de esa identidad en la escena (x, z de la pose interpolada; y, el suelo de ESTE mundo × exageración + los ojos),
    // para situar su voz; null si no está en tu sala de presencia, no tiene pose, está en vista aérea o la bloqueaste. En la simulación, el id es «sim<k>»
    function cabeza(identidad) {
      var a = activo ? busca(identidad) : null;
      if (!seVe(a, performance.now())) return null;
      var c = a.out.cab.p; return { x: c[0], y: suelo(c[0], -c[2]) * exag + ALTO_OJOS, z: c[2] };
    }
    var api = { activo: function () { return activo; }, actualiza: actualiza, estado: estado, libera: libera, texto: texto, llegadas: llegadas, puntos: puntos, irCon: irCon,
      vrmPersonas: vrmPersonas, miVrm: miVrm, miAvatar: miAvatar, recolorea: recolorea, cambiaron: cambiaron, enganchaVRM: enganchaVRM,
      sala: function () { return claveSala; }, cambiaSala: cambiaSala, yo: miInfo, mensaje: mensaje, cabeza: cabeza };
    window.__presenciaChat = function (txt) { anadeMensaje("Prueba", String(txt || "Hola"), false); };   // pruebas del chat movible (la ventana solo existe con ?presencia=red o &chat=1)
    // gancho de pruebas: estado; con "libera", apagar el componente (soltar todo; los avatares VRM se sueltan antes); con "llegadas", las poses apuntadas (P4);
    // con "puntos", quién sale en el minimapa; con "ir" e id, ir con esa persona (I1). Tras liberar sigue contestando (activo: false), como antes de C5
    window.__presencia = function (accion, arg) {
      if (accion === "libera") { if (!Componentes.libera("presencia-compartida")) libera(); }
      if (accion === "llegadas") return llegadas();
      if (accion === "puntos") return puntos().map(function (p) { return { id: p.id, alias: p.alias, x: p.x, y: p.y, modo: p.modo }; });
      if (accion === "ir") return irCon(arg);
      return estado();
    };
    return api;
  }

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?presencia=0 lo apaga; la variante la sigue diciendo
  // ?presencia=sim|red (la lee el componente al montarse; sin ella, montado no crea nada ni dibuja nada: el motor pinta lo mismo que sin él).
  // Consume la red (37_red.js, expone «Red»): sin ella (?red=0, apagada en el servidor o fuera del motor) la presencia no se monta, tampoco la simulada.
  Componentes.registra({
    id: "presencia-compartida", version: 1,
    consume: ["Red", "PoseCodec", "BufferPose", "Aspecto", "SalaPose", "Chat", "Muneco", "Encuentro", "sitioJunto", "Llegada", "Movibles", "VRX", "TR",
      "paseando", "pp", "enQuad", "enDron", "quad", "dron", "objetivo", "texColor"],
    expone: ["Presencia"],
    eventos: { escucha: ["chat:alterna", "depura:lineas"], emite: [] },
    bandera: { defecto: true, url: "presencia" },
    // muñecos instanciados (cuerpo, cabeza, sombrero y apoyo, manos, nombres, ruedas de la silla) + quad y dron de los demás: 8 llamadas tengas los que tengas;
    // ≈ 234 triángulos por persona como mucho (98 medidos sin accesorios, MEDIDAS) × 49 plazas + los vehículos [estimado, sin medir con vehículos]; el atlas de nombres (1024 × 624)
    presupuesto: { llamadas: 8, triangulos: 40000, texturasMB: 3 },
    fases: { mundo: 0 },
    monta: function (n) { return PresenciaMotor(n, n.api("red-salas")); },
    actualiza: { mundo: function (dt, t, api) { api.actualiza(dt); } },
    libera: function (api) { if (api) api.libera(); }
  });
