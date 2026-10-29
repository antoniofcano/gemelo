// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Presencia
// Consume: 01_datos (D), 02_mundo (suelo), 03_escena (scene, camera, texColor, exag), 09_camara (objetivo), 12_paseo (paseando), 29_vr (VRX)
// Nota: Publica además window.__presencia (pruebas). Sin ?presencia=sim no crea nada; el trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/presencia.test.js.
// ===============================================================================
  // ---------- presencia compartida (F2, contratos/presencia.md): la pose de cada visitante en binario, su interpolación y los avatares de bloque instanciados.
  // Hoy NO hay red: con ?presencia=sim (y &n=1..64; por defecto 10) se simulan visitantes que pasean, mandan su pose por el códec a la tasa que toca según la
  // distancia (10 Hz cerca, 2 Hz lejos) a través de una red de mentira (retardo 30-90 ms, 1 % de pérdida) y se dibujan con el búfer de interpolación.
  // Sin la bandera este módulo no crea nada ni añade nada a la escena: el motor dibuja lo mismo que sin él.

  // [puro:inicio] — códec de pose y búfer de interpolación: sin THREE ni DOM; pruebas/guardianes/presencia.test.js evalúa este trozo tal cual en Node
  var PoseCodec = (function () {
    var VERSION = 1, ESCRITORIO = 1, QUEST = 2, BYTES = { 1: 24, 2: 56 };
    var R2 = Math.SQRT2, IR2 = Math.SQRT1_2, QMAX = 1023, I32MAX = 2147483647, I32MIN = -2147483648;
    function cm(v) {   // metros → centímetros enteros (int32); fuera del int32 o no finita es un error del que llama
      var c = Math.round(v * 100);
      if (!isFinite(c) || c > I32MAX || c < I32MIN) throw new RangeError("posición fuera del contrato de pose: " + v);
      return c;
    }
    // cuaternión [x, y, z, w] → u32 «smallest-three»: bits 30-31 = índice de la componente mayor (se vuelve positiva y no viaja); 3 × 10 bits = las otras tres
    function empaquetaQ(q) {
      var l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
      if (!(l > 1e-9) || !isFinite(l)) throw new RangeError("cuaternión no válido");
      var im = 0, j, a = [0, 0, 0], k = 0;
      for (j = 1; j < 4; j++) if (Math.abs(q[j]) > Math.abs(q[im])) im = j;
      var s = q[im] < 0 ? -1 / l : 1 / l;
      for (j = 0; j < 4; j++) {
        if (j === im) continue;
        var v = Math.round((q[j] * s + IR2) / R2 * QMAX); a[k++] = v < 0 ? 0 : v > QMAX ? QMAX : v;
      }
      return ((im << 30) | (a[0] << 20) | (a[1] << 10) | a[2]) >>> 0;
    }
    function desempaquetaQ(u, out) {
      var im = u >>> 30, a = [(u >>> 20) & 1023, (u >>> 10) & 1023, u & 1023], k = 0, s = 0;
      for (var j = 0; j < 4; j++) { if (j === im) continue; var v = a[k++] / QMAX * R2 - IR2; out[j] = v; s += v * v; }
      out[im] = Math.sqrt(Math.max(0, 1 - s));
      return out;
    }
    function escribePieza(dv, o, pz) { dv.setInt32(o, cm(pz.p[0]), true); dv.setInt32(o + 4, cm(pz.p[1]), true); dv.setInt32(o + 8, cm(pz.p[2]), true); dv.setUint32(o + 12, empaquetaQ(pz.q), true); }
    function leePieza(dv, o) { return { p: [dv.getInt32(o, true) / 100, dv.getInt32(o + 4, true) / 100, dv.getInt32(o + 8, true) / 100], q: desempaquetaQ(dv.getUint32(o + 12, true), [0, 0, 0, 1]) }; }
    // pose = { tipo: 1|2, seq: u16, t: ms u32 del reloj del emisor, cab: {p:[x,y,z] m, q:[x,y,z,w]}, izq, der: {p, q} o null (solo tipo 2) } → Uint8Array de 24 o 56 B
    function codifica(pose) {
      var tipo = pose.tipo === QUEST ? QUEST : ESCRITORIO, b = new Uint8Array(BYTES[tipo]), dv = new DataView(b.buffer);
      var band = tipo | (tipo === QUEST && pose.izq ? 4 : 0) | (tipo === QUEST && pose.der ? 8 : 0);
      dv.setUint8(0, VERSION); dv.setUint8(1, band); dv.setUint16(2, pose.seq & 0xffff, true); dv.setUint32(4, pose.t >>> 0, true);
      escribePieza(dv, 8, pose.cab);
      if (tipo === QUEST) { if (pose.izq) escribePieza(dv, 24, pose.izq); if (pose.der) escribePieza(dv, 40, pose.der); }
      return b;
    }
    // Uint8Array (o ArrayBuffer) → pose, o null si no es una pose de esta versión (longitud, versión o tipo desconocidos: se descarta, no se adivina)
    function decodifica(b) {
      if (b instanceof ArrayBuffer) b = new Uint8Array(b);
      if (!b || typeof b.byteLength !== "number" || b.byteLength < 2) return null;
      var dv = new DataView(b.buffer, b.byteOffset, b.byteLength), ver = dv.getUint8(0), band = dv.getUint8(1), tipo = band & 3;
      if (ver !== VERSION || !BYTES[tipo] || b.byteLength !== BYTES[tipo]) return null;
      var pose = { tipo: tipo, seq: dv.getUint16(2, true), t: dv.getUint32(4, true), cab: leePieza(dv, 8), izq: null, der: null };
      if (tipo === QUEST) { if (band & 4) pose.izq = leePieza(dv, 24); if (band & 8) pose.der = leePieza(dv, 40); }
      return pose;
    }
    return { VERSION: VERSION, ESCRITORIO: ESCRITORIO, QUEST: QUEST, BYTES: BYTES, codifica: codifica, decodifica: decodifica, empaquetaQ: empaquetaQ, desempaquetaQ: desempaquetaQ };
  })();

  // Búfer de interpolación de UN visitante remoto: guarda las últimas poses (por orden de secuencia), estima el desfase de relojes (mínimo de llegada − envío)
  // y devuelve la pose de «retardo» ms atrás, interpolada (posición lineal, giro nlerp); si falta la siguiente, extrapola como mucho EXTRA ms y luego se queda quieto.
  var BufferPose = (function () {
    var MAX = 12, EXTRA = 120;
    function crea() { return { m: [], seq: -1, tBajo: 0, tExt: 0, desfase: Infinity, viejas: 0 }; }
    function recibe(b, pose, ahora) {
      if (b.seq >= 0) { var d = (pose.seq - b.seq) & 0xffff; if (d === 0 || d >= 0x8000) { b.viejas++; return false; } }   // repetida o más vieja que la última: fuera
      var t = b.seq >= 0 ? b.tExt + ((pose.t - b.tBajo) | 0) : pose.t;   // el reloj del emisor es u32 y da la vuelta: se desenrolla con la diferencia con signo
      b.seq = pose.seq; b.tBajo = pose.t >>> 0; b.tExt = t;
      if (ahora - t < b.desfase) b.desfase = ahora - t;
      b.m.push({ t: t, tipo: pose.tipo, cab: pose.cab, izq: pose.izq, der: pose.der });
      if (b.m.length > MAX) b.m.shift();
      return true;
    }
    function lerpP(a, c, k, o) { o[0] = a[0] + (c[0] - a[0]) * k; o[1] = a[1] + (c[1] - a[1]) * k; o[2] = a[2] + (c[2] - a[2]) * k; }
    function nlerpQ(a, c, k, o) {
      var s = a[0] * c[0] + a[1] * c[1] + a[2] * c[2] + a[3] * c[3] < 0 ? -1 : 1, l = 0, i;
      for (i = 0; i < 4; i++) { o[i] = a[i] * (1 - k) + c[i] * s * k; l += o[i] * o[i]; }
      l = Math.sqrt(l) || 1; for (i = 0; i < 4; i++) o[i] /= l;
    }
    function pieza(a, c, k, o) {   // a o c pueden faltar (una mano que se pierde): se toma la que haya
      if (!a && !c) return false; if (!a) a = c; if (!c) c = a;
      lerpP(a.p, c.p, k, o.p); nlerpQ(a.q, c.q, Math.max(0, Math.min(1, k)), o.q); return true;
    }
    // out = { cab: {p, q}, izq: {p, q}, der: {p, q}, hayIzq, hayDer, tipo, t } (se reutiliza); devuelve false si aún no hay nada
    function muestra(b, ahora, retardo, out) {
      var m = b.m, n = m.length; if (!n) return false;
      var tr = ahora - b.desfase - retardo, a = m[0], c = m[0], k = 0, i;
      if (tr >= m[n - 1].t) {
        a = n > 1 ? m[n - 2] : m[n - 1]; c = m[n - 1];
        var dtc = c.t - a.t; k = dtc > 0 ? 1 + Math.min(tr - c.t, EXTRA) / dtc : 1;
      } else if (tr > m[0].t) {
        for (i = 1; i < n; i++) if (m[i].t > tr) { a = m[i - 1]; c = m[i]; k = (tr - a.t) / (c.t - a.t); break; }
      }
      out.tipo = c.tipo; out.t = Math.min(tr, c.t + (k > 1 ? Math.min(tr - c.t, EXTRA) : 0));
      pieza(a.cab, c.cab, k, out.cab);
      out.hayIzq = pieza(a.izq, c.izq, Math.min(k, 1), out.izq); out.hayDer = pieza(a.der, c.der, Math.min(k, 1), out.der);
      return true;
    }
    function salida() { return { cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: { p: [0, 0, 0], q: [0, 0, 0, 1] }, der: { p: [0, 0, 0], q: [0, 0, 0, 1] }, hayIzq: false, hayDer: false, tipo: 1, t: 0 }; }
    return { MAX: MAX, EXTRA: EXTRA, crea: crea, recibe: recibe, muestra: muestra, salida: salida };
  })();
  // [puro:fin]

  var Presencia = (function () {
    var activo = /[?&]presencia=sim\b/.test(location.search), N = 0;
    var CERCA_ENTRA = 55, CERCA_SALE = 65, TICK = 0.1, CADA_LEJOS = 5, RET_CERCA = 150, RET_LEJOS = 650, ALTO_OJOS = 1.6;   // contratos/presencia.md
    var grupo = null, mCuerpo = null, mCabeza = null, mSombrero = null, mManos = null, mNombres = null, texNombres = null, geos = [], mats = [];
    var V = [], red = [], est = { n: 0, cerca: 0, quest: 0, enviados: 0, recibidos: 0, perdidos: 0, viejos: 0, bytes: 0, bps: 0, ms: 0, msMax: 0, retP95: 0, errP95: 0 };
    var muestrasRet = [], muestrasErr = [], tEst = 0, bytesVentana = 0, msVentana = 0;
    var semilla = 20261029;
    function azar() { semilla = (semilla + 0x6d2b79f5) | 0; var t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    var ALIAS = ["Mirlo", "Abubilla", "Jilguero", "Carbonero", "Alcaraván", "Verdecillo", "Golondrina", "Perdiz", "Abejaruco", "Cogujada", "Encina", "Lentisco", "Retama", "Acebuche", "Coscoja", "Romero", "Tomillo", "Jara", "Algarrobo", "Almendro"];
    var CAMISAS = [0xc0533a, 0x3f7cc2, 0xe0b23a, 0x5d9b4a, 0x8a5bb0, 0xe8e2d4], PIELES = [0xf1c9a5, 0xd9a47c, 0xb57d55, 0x8a5a3a, 0x5e3b24], SOMBREROS = [null, { c: 0xd9bf6a, w: 0.46, h: 0.07, d: 0.46, z: 0 }, { c: 0x2e5d34, w: 0.3, h: 0.09, d: 0.36, z: -0.04 }];
    var m4 = null, m4b = null, q1 = null, v1 = null, v2 = null, vS = null, ejeY = null, cNom = 4, fNom = 1, matSombreroLocal = [];

    function inicia() {
      var p = (/[?&]n=(\d+)/.exec(location.search) || [])[1]; N = Math.max(1, Math.min(64, p ? Number(p) : 10)); est.n = N;
      m4 = new THREE.Matrix4(); m4b = new THREE.Matrix4(); q1 = new THREE.Quaternion(); v1 = new THREE.Vector3(); v2 = new THREE.Vector3(); vS = new THREE.Vector3(1, 1, 1); ejeY = new THREE.Vector3(0, 1, 0);
      grupo = new THREE.Group(); grupo.name = "presencia"; scene.add(grupo);
      // cuerpo: una caja con las piernas más oscuras (color por vértice × color de camisa por instancia); del suelo a 1,45 m
      var gC = new THREE.BoxGeometry(0.46, 1.45, 0.26, 1, 2, 1).toNonIndexed(); gC.translate(0, 0.725, 0);
      var pos = gC.attributes.position, col = new Float32Array(pos.count * 3);
      for (var i = 0; i < pos.count; i += 3) { var cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, g = cy < 0.725 ? 0.32 : 1; for (var j = 0; j < 9; j++) col[i * 3 + j] = g; }
      gC.setAttribute("color", new THREE.BufferAttribute(col, 3));
      var gCab = new THREE.BoxGeometry(0.28, 0.28, 0.28), gSom = new THREE.BoxGeometry(1, 1, 1), gMano = new THREE.BoxGeometry(0.08, 0.08, 0.13), gNom = new THREE.PlaneGeometry(1.6, 0.3);
      var matC = new THREE.MeshLambertMaterial({ vertexColors: true }), matL = new THREE.MeshLambertMaterial();
      geos = [gC, gCab, gSom, gMano, gNom]; mats = [matC, matL];
      var nSom = 0, nQuest = 0;
      for (var k = 0; k < N; k++) {
        var sombrero = Math.floor(azar() * 3), quest = azar() < 0.3, cercano = k < Math.ceil(N / 2);
        var home = cercano ? { x: objetivo.x + (azar() - 0.5) * 80, y: -objetivo.z + (azar() - 0.5) * 80 } : { x: D.ext[0] + 10 + azar() * (D.ext[2] - D.ext[0] - 20), y: D.ext[3] + 10 + azar() * (D.ext[1] - D.ext[3] - 20) };
        V.push({
          k: k, alias: ALIAS[k % ALIAS.length] + (k >= ALIAS.length ? " " + (1 + Math.floor(k / ALIAS.length)) : ""), quest: quest,
          camisa: CAMISAS[Math.floor(azar() * CAMISAS.length)], piel: PIELES[Math.floor(azar() * PIELES.length)], sombrero: sombrero, iSom: sombrero ? nSom++ : -1, iMano: quest ? (nQuest++) * 2 : -1,
          // emisor simulado: dónde está de verdad, adónde va, su reloj (u32, algunos a punto de dar la vuelta) y su secuencia
          home: home, x: home.x + (azar() - 0.5) * 20, y: home.y + (azar() - 0.5) * 20, dest: null, vel: 1.1 + azar() * 0.5, rum: 0, fase: azar() * 6.28,
          reloj: k % 4 === 0 ? 4294967296 - 3000 - k * 1000 - Math.round(performance.now()) : Math.floor(azar() * 1e9), seq: Math.floor(azar() * 65536), tTick: azar() * TICK, nTick: 0, cerca: false,
          buf: BufferPose.crea(), out: BufferPose.salida(), visto: false
        });
      }
      est.quest = nQuest;
      mCuerpo = new THREE.InstancedMesh(gC, matC, N); mCabeza = new THREE.InstancedMesh(gCab, matL, N); mSombrero = new THREE.InstancedMesh(gSom, matL, Math.max(1, nSom)); mManos = new THREE.InstancedMesh(gMano, matL, Math.max(1, nQuest * 2));
      mSombrero.count = nSom; mManos.count = nQuest * 2;
      var c = new THREE.Color();
      V.forEach(function (a) {
        mCuerpo.setColorAt(a.k, c.setHex(a.camisa)); mCabeza.setColorAt(a.k, c.setHex(a.piel));
        if (a.iSom >= 0) mSombrero.setColorAt(a.iSom, c.setHex(SOMBREROS[a.sombrero].c));
        if (a.iMano >= 0) { mManos.setColorAt(a.iMano, c.setHex(a.piel)); mManos.setColorAt(a.iMano + 1, c.setHex(a.piel)); }
      });
      SOMBREROS.forEach(function (s, i) { matSombreroLocal[i] = s ? new THREE.Matrix4().compose(new THREE.Vector3(0, 0.14 + s.h / 2, s.z), new THREE.Quaternion(), new THREE.Vector3(s.w, s.h, s.d)) : null; });
      // nombres: un atlas con todos los alias y un plano instanciado vuelto hacia la cámara en el sombreador (una llamada para todos)
      fNom = Math.ceil(N / cNom);
      var cv = document.createElement("canvas"); cv.width = 256 * cNom; cv.height = 48 * fNom;
      var cx = cv.getContext("2d"); cx.font = "600 28px system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.lineJoin = "round";
      V.forEach(function (a) {
        var x = (a.k % cNom) * 256 + 128, y = Math.floor(a.k / cNom) * 48 + 24, w = Math.min(248, cx.measureText(a.alias).width + 24);
        cx.fillStyle = "rgba(16,20,24,0.72)"; cx.beginPath(); if (cx.roundRect) cx.roundRect(x - w / 2, y - 19, w, 38, 12); else cx.rect(x - w / 2, y - 19, w, 38); cx.fill();
        cx.fillStyle = "#ffffff"; cx.fillText(a.alias, x, y + 1, 236);
      });
      texNombres = texColor(new THREE.CanvasTexture(cv)); texNombres.minFilter = THREE.LinearFilter; texNombres.generateMipmaps = false;
      var celda = new Float32Array(N); for (var q = 0; q < N; q++) celda[q] = q;
      gNom.setAttribute("aCelda", new THREE.InstancedBufferAttribute(celda, 1));
      var matN = new THREE.ShaderMaterial({
        uniforms: { uMapa: { value: texNombres }, uRej: { value: new THREE.Vector2(cNom, fNom) } }, transparent: true, depthWrite: false, fog: false,
        vertexShader: "attribute float aCelda; uniform vec2 uRej; varying vec2 vUv;\n" +
          "void main(){ vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float e = length(instanceMatrix[0].xyz); c.xy += position.xy * e; gl_Position = projectionMatrix * c;\n" +
          " float col = mod(aCelda, uRej.x), fila = floor(aCelda / uRej.x); vUv = vec2((col + uv.x) / uRej.x, 1.0 - (fila + 1.0 - uv.y) / uRej.y); }",
        fragmentShader: "uniform sampler2D uMapa; varying vec2 vUv;\nvoid main(){ vec4 t = texture2D(uMapa, vUv); if (t.a < 0.04) discard; gl_FragColor = t;\n#include <colorspace_fragment>\n}"
      });
      mats.push(matN);
      mNombres = new THREE.InstancedMesh(gNom, matN, N); mNombres.renderOrder = 5;
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); grupo.add(m); });   // se mueven cada fotograma: el volumen envolvente de una InstancedMesh se calcula una vez (r151)
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { for (var i = 0; i < m.count; i++) m.setMatrixAt(i, m4.makeScale(0, 0, 0)); });   // nada se ve hasta que llega la pose inicial
    }

    // ---- el emisor simulado: anda hacia un destino cerca de su «casa» y manda su pose por la red de mentira
    function oyente() {   // dónde está quien observa (en metros este/norte): la cabeza en VR, el paseante, el punto de la órbita
      if (VRX.on) return { x: VRX.cab.x, y: -VRX.cab.z };
      if (paseando) return { x: pp.x, y: pp.y };
      return { x: objetivo.x, y: -objetivo.z };
    }
    function poseVerdad(a, ahoraMs, o) {   // la pose del visitante simulado en este instante, en el sistema del contrato (cota sin exagerar)
      var s = suelo(a.x, a.y), cab = ALTO_OJOS + Math.sin(a.fase * 2) * 0.03, cab0 = Math.sin(a.fase * 0.37) * 0.35, cab1 = Math.sin(a.fase * 0.23) * 0.15;
      q1.setFromEuler(new THREE.Euler(cab1, a.rum + cab0, 0, "YXZ"));
      o.tipo = a.quest ? PoseCodec.QUEST : PoseCodec.ESCRITORIO; o.seq = a.seq; o.t = (a.reloj + ahoraMs) >>> 0;
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
    function emite(a, dt, ahoraMs, ol) {   // contrato: un «tic» cada 100 ms; a los cercanos se les manda en cada tic (10 Hz), a todos en uno de cada 5 (2 Hz)
      var d = Math.hypot(a.x - ol.x, a.y - ol.y); a.cerca = a.cerca ? d < CERCA_SALE : d < CERCA_ENTRA;
      a.tTick += dt; if (a.tTick < TICK) return; a.tTick -= TICK; if (a.tTick > TICK) a.tTick = 0; a.nTick++;
      if (!(a.cerca || a.nTick % CADA_LEJOS === 0)) return;
      a.seq = (a.seq + 1) & 0xffff;
      var b = PoseCodec.codifica(poseVerdad(a, ahoraMs, {})); est.enviados++; bytesVentana += b.byteLength; est.bytes += b.byteLength;
      if (azar() < 0.01) { est.perdidos++; return; }
      red.push({ en: ahoraMs + 30 + azar() * 60, k: a.k, b: b });
    }
    function entrega(ahoraMs) {
      var listos = red.filter(function (m) { return m.en <= ahoraMs; }); if (!listos.length) return;
      red = red.filter(function (m) { return m.en > ahoraMs; }); listos.sort(function (x, y) { return x.en - y.en; });
      for (var i = 0; i < listos.length; i++) {
        var m = listos[i], p = PoseCodec.decodifica(m.b), a = V[m.k];
        if (!p) continue;
        // el instante de llegada se pasa en el reloj del RECEPTOR; el desfase con el del emisor lo estima el búfer
        if (BufferPose.recibe(a.buf, p, ahoraMs)) est.recibidos++; else est.viejos++;
      }
    }

    // ---- el receptor: interpola y coloca las instancias
    function coloca(a, ahoraMs, dt) {
      var ret = a.cerca ? RET_CERCA : RET_LEJOS;   // [SUPUESTO] el receptor sabe si le llega a 10 o a 2 Hz por la distancia que él mismo ve
      var paso = dt * 500; a.ret = a.ret == null ? ret : a.ret + Math.max(-paso, Math.min(paso, ret - a.ret));   // el retardo cambia a 0,5 s por segundo: el avatar no salta al cambiar de tasa
      var o = a.out;
      if (!BufferPose.muestra(a.buf, ahoraMs, a.ret, o)) return;
      a.visto = true;
      var c = o.cab.p, s = suelo(c[0], -c[2]), yv = s * exag + (c[1] - s);   // la cota viaja sin exagerar: el avatar conserva su altura sobre el suelo con la exageración de quien observa
      q1.set(o.cab.q[0], o.cab.q[1], o.cab.q[2], o.cab.q[3]);
      m4.compose(v1.set(c[0], yv, c[2]), q1, vS); mCabeza.setMatrixAt(a.k, m4);
      if (a.iSom >= 0) { m4b.multiplyMatrices(m4, matSombreroLocal[a.sombrero]); mSombrero.setMatrixAt(a.iSom, m4b); }
      v2.set(0, 0, -1).applyQuaternion(q1); var yaw = Math.atan2(-v2.x, -v2.z);
      m4.compose(v1.set(c[0], s * exag, c[2]), q1.setFromAxisAngle(ejeY, yaw), vS); mCuerpo.setMatrixAt(a.k, m4);
      if (a.iMano >= 0) {
        [o.izq, o.der].forEach(function (h, i) {
          var hay = i === 0 ? o.hayIzq : o.hayDer;
          if (!hay) { mManos.setMatrixAt(a.iMano + i, m4.makeScale(0, 0, 0)); return; }
          var sh = suelo(h.p[0], -h.p[2]); q1.set(h.q[0], h.q[1], h.q[2], h.q[3]);
          mManos.setMatrixAt(a.iMano + i, m4.compose(v1.set(h.p[0], sh * exag + (h.p[1] - sh), h.p[2]), q1, vS));
        });
      }
      // el nombre, encima de la cabeza; crece con la distancia para leerse y se apaga lejos (UX §5.4: nombres sobre los avatares)
      var dc = camera.position.distanceTo(v1.set(c[0], yv, c[2])), e = Math.max(1, Math.min(4, dc / 20));
      if (dc > 160) m4.makeScale(0, 0, 0); else m4.compose(v1.set(c[0], yv + 0.35 + 0.15 * e, c[2]), q1.identity(), vS.set(e, e, e));
      vS.set(1, 1, 1); mNombres.setMatrixAt(a.k, m4);
      // medida (solo en la simulación se sabe la verdad): retardo de presentación y error de posición frente a dónde está de verdad ahora
      if (a.cerca) { var dr = ((a.reloj + ahoraMs - o.t) % 4294967296 + 4294967296) % 4294967296; muestrasRet.push(dr > 2147483648 ? dr - 4294967296 : dr); muestrasErr.push(Math.hypot(c[0] - a.x, -c[2] - a.y)); }
    }
    function p95(v) { if (!v.length) return 0; var s = v.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; }

    function actualiza(dt) {
      if (!activo) return;
      var t0 = performance.now(), ahoraMs = Math.round(t0), ol = oyente(), nc = 0;
      for (var i = 0; i < V.length; i++) { anda(V[i], dt); emite(V[i], dt, ahoraMs, ol); }
      entrega(ahoraMs);
      for (i = 0; i < V.length; i++) { coloca(V[i], ahoraMs, dt); if (V[i].cerca) nc++; }
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
      est.cerca = nc;
      var ms = performance.now() - t0; msVentana = Math.max(msVentana, ms); est.ms = est.ms ? est.ms * 0.95 + ms * 0.05 : ms;
      tEst += dt;
      if (tEst >= 1) {
        est.bps = Math.round(bytesVentana / tEst); est.msMax = msVentana; est.retP95 = Math.round(p95(muestrasRet)); est.errP95 = Math.round(p95(muestrasErr) * 100) / 100;
        bytesVentana = 0; msVentana = 0; tEst = 0; if (muestrasRet.length > 4000) { muestrasRet = muestrasRet.slice(-2000); muestrasErr = muestrasErr.slice(-2000); }
      }
    }
    function estado() {
      return { activo: activo, n: est.n, quest: est.quest, cerca: est.cerca, enviados: est.enviados, recibidos: est.recibidos, perdidos: est.perdidos, viejos: est.viejos, bytes: est.bytes,
        bytesPorSegundo: est.bps, ms: Math.round(est.ms * 1000) / 1000, msMax: Math.round(est.msMax * 1000) / 1000, retardoP95ms: est.retP95, errorP95m: est.errP95, vistos: V.filter(function (a) { return a.visto; }).length };
    }
    function libera() {   // libera todo lo de la GPU y deja el módulo como sin la bandera
      if (!grupo) return;
      scene.remove(grupo); [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { m.dispose(); });
      geos.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); if (texNombres) texNombres.dispose();
      grupo = null; V = []; red = []; activo = false;
    }
    function texto() { return activo ? "presencia (sim) " + est.n + " · cerca " + est.cerca + " · " + est.bps + " B/s · JS " + est.ms.toFixed(2) + " ms · retardo p95 " + est.retP95 + " ms" : ""; }
    if (activo) inicia();
    return { activo: function () { return activo; }, actualiza: actualiza, estado: estado, libera: libera, texto: texto };
  })();
  window.__presencia = function (accion) { if (accion === "libera") Presencia.libera(); return Presencia.estado(); };   // gancho de pruebas: estado y, con "libera", soltar todo
