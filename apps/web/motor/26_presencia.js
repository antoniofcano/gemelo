// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Presencia
// Consume: 01_datos (D), 02_mundo (suelo), 03_escena (visor, renderer, scene, camera, texColor, exag), 09_camara (objetivo), 12_paseo (paseando),
//   29_vr (VRX)
// Nota: Publica además window.__presencia (pruebas). Sin ?presencia=sim o ?presencia=red no crea nada (con red, import("livekit-client") y el panel Gente); el trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/presencia.test.js.
// ===============================================================================
  // ---------- presencia compartida (F2, contratos/presencia.md): la pose de cada visitante en binario, su interpolación y los avatares de bloque instanciados.
  // Dos variantes, cada una con su bandera:
  //  · ?presencia=sim (y &n=1..64; por defecto 10): visitantes simulados que pasean, mandan su pose por el códec a la tasa que toca según la distancia
  //    (10 Hz cerca, 2 Hz lejos) a través de una red de mentira (retardo 30-90 ms, 1 % de pérdida) y se dibujan con el búfer de interpolación.
  //  · ?presencia=red: la sala de verdad (LiveKit, livekit-client con import() solo con esta bandera). Pide el token a la api (POST /api/presencia/token),
  //    publica su pose (no fiable, tema «pose», 10 Hz a los cercanos y 2 Hz a todos) mientras pasea o va con gafas; en vista aérea no la publica y sale en
  //    Gente «en vista aérea» (decisión 60). Panel Gente con bloquear (solo para ti) y chat por el canal fiable (tema «chat», no se guarda; decisión 40).
  // Sin ninguna de las dos este módulo no crea nada ni añade nada a la escena ni a la página: el motor dibuja lo mismo que sin él.

  // [puro:inicio] — códec de pose, búfer de interpolación, la lógica de la sala (SalaPose) y el chat: sin THREE ni DOM; pruebas/guardianes/presencia.test.js evalúa este trozo tal cual en Node
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
  // Sala de verdad (?presencia=red): a quién se manda la pose en cada tic (10 Hz a los cercanos, 2 Hz a toda la sala), quién está cerca (entra a 55 m y sale a 65 m),
  // a qué ritmo le llega cada uno (y por tanto con qué retardo se dibuja) y quién está «en vista aérea» (conectado y sin pose reciente: decisión 60).
  // No sabe nada de LiveKit: el motor le pasa lo que recibe y publica lo que devuelve tic(). Los metadatos de la sala se leen como DATOS (leeInfo()).
  var SalaPose = (function () {
    var TICK = 100, CADA_LEJOS = 5, ENTRA = 55, SALE = 65, SIN_POSE = 2000, RAPIDO = 300, RET_CERCA = 150, RET_LEJOS = 650;
    var ROLES = ["hogar", "guia", "corresponsal", "admin"], DISPOSITIVOS = ["escritorio", "movil", "quest"], SOMBREROS = ["ninguno", "paja", "gorra"];
    function crea(seq) { return { otros: Object.create(null), seq: (seq | 0) & 0xffff, nTick: 0, tTick: null, enviados: 0, recibidos: 0, viejos: 0, malos: 0 }; }
    function entra(s, id, info) {
      var o = s.otros[id];
      if (!o) o = s.otros[id] = { id: id, info: info || null, buf: BufferPose.crea(), tUlt: null, intervalo: 500, cerca: false, cab: null, tipo: 0 };
      else if (info) o.info = info;
      return o;
    }
    function sale(s, id) { delete s.otros[id]; }
    // una pose que llega: se descarta si no es del contrato o si es vieja; el intervalo entre llegadas (media móvil) dice si llega a 10 o a 2 Hz
    function recibe(s, id, bytes, ahora) {
      var p = PoseCodec.decodifica(bytes); if (!p) { s.malos++; return false; }
      var o = entra(s, id);
      if (o.tUlt !== null && ahora - o.tUlt > SIN_POSE) { o.buf = BufferPose.crea(); o.tUlt = null; o.intervalo = 500; }   // vuelve tras un rato (vista aérea o recarga): se empieza de cero
      if (!BufferPose.recibe(o.buf, p, ahora)) { s.viejos++; return false; }
      if (o.tUlt !== null) o.intervalo = o.intervalo * 0.7 + Math.min(2000, Math.max(0, ahora - o.tUlt)) * 0.3;
      o.tUlt = ahora; o.cab = p.cab.p; o.tipo = p.tipo; s.recibidos++;
      return true;
    }
    function conPose(o, ahora) { return o.tUlt !== null && ahora - o.tUlt <= SIN_POSE; }
    // cada 100 ms: devuelve null si aún no toca, [] si no hay que mandar nada (en vista aérea, pose = null, no se publica) o [{ bytes, destinos }]
    // (destinos = null: a toda la sala; si no, las identidades cercanas). La cercanía la calcula el emisor con la última pose de cada uno.
    function tic(s, ahora, pose) {
      if (s.tTick !== null && ahora - s.tTick < TICK) return null;
      s.tTick = s.tTick === null || ahora - s.tTick > 3 * TICK ? ahora : s.tTick + TICK; s.nTick++;
      var cerca = [], id, o, d;
      for (id in s.otros) {
        o = s.otros[id];
        if (!pose || !conPose(o, ahora)) { o.cerca = false; continue; }
        d = Math.hypot(pose.cab.p[0] - o.cab[0], pose.cab.p[2] - o.cab[2]);
        o.cerca = o.cerca ? d < SALE : d < ENTRA;
        if (o.cerca) cerca.push(id);
      }
      if (!pose) return [];
      var todos = s.nTick % CADA_LEJOS === 0;
      if (!todos && !cerca.length) return [];
      s.seq = (s.seq + 1) & 0xffff; pose.seq = s.seq; s.enviados++;
      return [{ bytes: PoseCodec.codifica(pose), destinos: todos ? null : cerca }];
    }
    function retardo(o) { return o.intervalo < RAPIDO ? RET_CERCA : RET_LEJOS; }
    // el apartado Gente: quien tiene pose reciente «pasea» (o va con gafas); quien no, está «en vista aérea» (no se dibuja)
    function gente(s, ahora) {
      var l = [], id, o;
      for (id in s.otros) { o = s.otros[id]; l.push({ id: id, info: o.info, enMundo: conPose(o, ahora), estado: conPose(o, ahora) ? (o.tipo === PoseCodec.QUEST ? "con gafas" : "paseando") : "en vista aérea" }); }
      return l.sort(function (a, b) { var x = (a.info && a.info.alias) || "", y = (b.info && b.info.alias) || ""; return x < y ? -1 : x > y ? 1 : 0; });
    }
    function entero(v, a, b, def) { return typeof v === "number" && v % 1 === 0 && v >= a && v <= b ? v : def; }
    // metadatos del token (los pone la api): se comprueban tipo y límites de cada campo; lo que no cuadra toma un valor neutro
    function leeInfo(txt) {
      var m = null;
      try { m = JSON.parse(typeof txt === "string" && txt ? txt : "{}"); } catch (e) { m = null; }
      if (!m || typeof m !== "object") m = {};
      var av = m.avatar && typeof m.avatar === "object" ? m.avatar : {}, alias = typeof m.alias === "string" ? Chat.limpia(m.alias) : null;
      return {
        alias: alias ? Array.from(alias).slice(0, 24).join("") : "Visitante",
        rol: ROLES.indexOf(m.rol) >= 0 ? m.rol : "hogar",
        dispositivo: DISPOSITIVOS.indexOf(m.dispositivo) >= 0 ? m.dispositivo : "escritorio",
        camisa: entero(av.camisa, 0, 5, 0), piel: entero(av.piel, 0, 4, 1), sombrero: SOMBREROS.indexOf(av.sombrero) >= 0 ? SOMBREROS.indexOf(av.sombrero) : 1
      };
    }
    return { TICK: TICK, SIN_POSE: SIN_POSE, crea: crea, entra: entra, sale: sale, recibe: recibe, tic: tic, retardo: retardo, gente: gente, conPose: conPose, leeInfo: leeInfo };
  })();

  // Chat de la sala (tema «chat», fiable, decisión 40: no se guarda en ningún sitio). Texto UTF-8 de como mucho 280 caracteres; se quitan los caracteres
  // de control y los de dirección (para que nadie disfrace un mensaje) y se juntan los espacios. Lo que llega se trata como texto, nunca como HTML.
  var Chat = (function () {
    var MAX = 280, RARO = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
    var enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null, dec = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: true }) : null;
    function limpia(t) {
      if (typeof t !== "string") return null;
      var s = t.replace(RARO, " ").replace(/\s+/g, " ").trim();
      if (!s) return null;
      var c = Array.from(s);
      return c.length > MAX ? c.slice(0, MAX).join("").trim() : s;
    }
    function codifica(t) { var s = limpia(t); return s === null ? null : enc.encode(s); }
    function decodifica(b) {
      if (b instanceof ArrayBuffer) b = new Uint8Array(b);
      if (!b || typeof b.byteLength !== "number" || !b.byteLength || b.byteLength > MAX * 4) return null;
      var s; try { s = dec.decode(b); } catch (e) { return null; }
      return Array.from(s).length > MAX ? null : limpia(s);
    }
    return { MAX: MAX, limpia: limpia, codifica: codifica, decodifica: decodifica };
  })();
  // [puro:fin]

  var Presencia = (function () {
    var variante = (/[?&]presencia=(sim|red)\b/.exec(location.search) || [])[1] || "", activo = !!variante, N = 0;
    var CERCA_ENTRA = 55, CERCA_SALE = 65, TICK = 0.1, CADA_LEJOS = 5, RET_CERCA = 150, RET_LEJOS = 650, ALTO_OJOS = 1.6;   // contratos/presencia.md
    var MAXV = 49;   // red: plazas de avatar (la sala admite 50 personas, infra/dev/livekit.yaml: tú y 49 más)
    var grupo = null, mCuerpo = null, mCabeza = null, mSombrero = null, mManos = null, mNombres = null, texNombres = null, cxNom = null, geos = [], mats = [];
    var V = [], red = [], est = { n: 0, cerca: 0, quest: 0, enviados: 0, recibidos: 0, perdidos: 0, viejos: 0, bytes: 0, bps: 0, ms: 0, msMax: 0, retP95: 0, errP95: 0 };
    var muestrasRet = [], muestrasErr = [], tEst = 0, bytesVentana = 0, msVentana = 0;
    var semilla = 20261029;
    function azar() { semilla = (semilla + 0x6d2b79f5) | 0; var t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    var ALIAS = ["Mirlo", "Abubilla", "Jilguero", "Carbonero", "Alcaraván", "Verdecillo", "Golondrina", "Perdiz", "Abejaruco", "Cogujada", "Encina", "Lentisco", "Retama", "Acebuche", "Coscoja", "Romero", "Tomillo", "Jara", "Algarrobo", "Almendro"];
    var CAMISAS = [0xc0533a, 0x3f7cc2, 0xe0b23a, 0x5d9b4a, 0x8a5bb0, 0xe8e2d4], PIELES = [0xf1c9a5, 0xd9a47c, 0xb57d55, 0x8a5a3a, 0x5e3b24], SOMBREROS = [null, { c: 0xd9bf6a, w: 0.46, h: 0.07, d: 0.46, z: 0 }, { c: 0x2e5d34, w: 0.3, h: 0.09, d: 0.36, z: -0.04 }];
    var m4 = null, m4b = null, q1 = null, v1 = null, v2 = null, vS = null, ejeY = null, cNom = 4, fNom = 1, matSombreroLocal = [];

    // ---- los avatares (los mismos en las dos variantes): cuerpo, cabeza, sombrero, manos y nombre, instanciados (5 llamadas de dibujo tengas los que tengas)
    function montaGrafica(nCuerpos, nSom, nManos) {
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
      mCuerpo = new THREE.InstancedMesh(gC, matC, nCuerpos); mCabeza = new THREE.InstancedMesh(gCab, matL, nCuerpos); mSombrero = new THREE.InstancedMesh(gSom, matL, nSom); mManos = new THREE.InstancedMesh(gMano, matL, nManos);
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
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); grupo.add(m); });   // se mueven cada fotograma: el volumen envolvente de una InstancedMesh se calcula una vez (r151)
    }
    function pintaNombre(k, alias) {   // la celda k del atlas; vacía si no hay alias
      var x = (k % cNom) * 256 + 128, y = Math.floor(k / cNom) * 48 + 24;
      cxNom.clearRect(x - 128, y - 24, 256, 48);
      if (alias) {
        var w = Math.min(248, cxNom.measureText(alias).width + 24);
        cxNom.fillStyle = "rgba(16,20,24,0.72)"; cxNom.beginPath(); if (cxNom.roundRect) cxNom.roundRect(x - w / 2, y - 19, w, 38, 12); else cxNom.rect(x - w / 2, y - 19, w, 38); cxNom.fill();
        cxNom.fillStyle = "#ffffff"; cxNom.fillText(alias, x, y + 1, 236);
      }
      texNombres.needsUpdate = true;
    }
    function colorea(a) {
      var c = new THREE.Color();
      mCuerpo.setColorAt(a.k, c.setHex(a.camisa)); mCabeza.setColorAt(a.k, c.setHex(a.piel));
      if (a.iSom >= 0) mSombrero.setColorAt(a.iSom, c.setHex(SOMBREROS[a.sombrero].c));
      if (a.iMano >= 0) { mManos.setColorAt(a.iMano, c.setHex(a.piel)); mManos.setColorAt(a.iMano + 1, c.setHex(a.piel)); }
      [mCuerpo, mCabeza, mSombrero, mManos].forEach(function (m) { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }
    function oculta(a) {   // nada de ese avatar se ve (escala 0) hasta que llegue su pose
      m4.makeScale(0, 0, 0);
      mCuerpo.setMatrixAt(a.k, m4); mCabeza.setMatrixAt(a.k, m4); mNombres.setMatrixAt(a.k, m4);
      if (a.iSomHueco >= 0) mSombrero.setMatrixAt(a.iSomHueco, m4); else if (a.iSom >= 0) mSombrero.setMatrixAt(a.iSom, m4);
      if (a.iMano >= 0) { mManos.setMatrixAt(a.iMano, m4); mManos.setMatrixAt(a.iMano + 1, m4); }
      a.visto = false;
    }

    // ---- simulación (?presencia=sim)
    function inicia() {
      var p = (/[?&]n=(\d+)/.exec(location.search) || [])[1]; N = Math.max(1, Math.min(64, p ? Number(p) : 10)); est.n = N;
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
      montaGrafica(N, Math.max(1, nSom), Math.max(1, nQuest * 2));
      mSombrero.count = nSom; mManos.count = nQuest * 2;
      V.forEach(function (a) { colorea(a); pintaNombre(a.k, a.alias); });
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

    // ---- el receptor (las dos variantes): interpola y coloca las instancias. ret = el retardo que toca (150 ms si llega a 10 Hz, 650 si a 2 Hz)
    function coloca(a, ahoraMs, dt, ret) {
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
      if (variante === "sim" && a.cerca) { var dr = ((a.reloj + ahoraMs - o.t) % 4294967296 + 4294967296) % 4294967296; muestrasRet.push(dr > 2147483648 ? dr - 4294967296 : dr); muestrasErr.push(Math.hypot(c[0] - a.x, -c[2] - a.y)); }
    }
    function p95(v) { if (!v.length) return 0; var s = v.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; }

    // ---- la sala de verdad (?presencia=red): LiveKit (livekit-client, import() solo con la bandera), token de la api, la pose propia y el apartado Gente con el chat
    var LK = null, sala = null, SP = null, porId = Object.create(null), huecos = [], bloqueados = Object.create(null), yo = null, manoDe = ["", ""];
    var ui = null, mensajes = [], tChat = 0, tGente = 0, claveGente = "", conectando = false, poseL = { tipo: 1, seq: 0, t: 0, cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: null, der: null };
    var mDesc = null, vDesc = null, qDesc = null, sDesc = null;
    function iniciaRed() {
      montaGrafica(MAXV, MAXV, MAXV * 2);
      for (var k = MAXV - 1; k >= 0; k--) huecos.push(k);
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { for (var i = 0; i < m.count; i++) m.setMatrixAt(i, m4.makeScale(0, 0, 0)); });
      mDesc = new THREE.Matrix4(); vDesc = new THREE.Vector3(); qDesc = new THREE.Quaternion(); sDesc = new THREE.Vector3();
      SP = SalaPose.crea(Math.floor(Math.random() * 65536));
      // qué mando es cada mano (lo dice el propio WebXR al conectarse el mando)
      [0, 1].forEach(function (i) {
        var c = renderer.xr.getController(i);
        c.addEventListener("connected", function (e) { manoDe[i] = (e.data && e.data.handedness) || ""; });
        c.addEventListener("disconnected", function () { manoDe[i] = ""; });
      });
      montaPanel();
      conecta();
    }
    function dispositivo() { var ua = navigator.userAgent || ""; return /OculusBrowser|Quest/i.test(ua) ? "quest" : /Mobi|Android|iPhone|iPad/i.test(ua) ? "movil" : "escritorio"; }
    async function conecta() {
      if (conectando || sala) return;
      conectando = true; ponEstado("Entrando en la visita compartida…", false);
      try {
        // el token lo da la api con tu sesión (mismo origen); la identidad, el alias y el avatar los pone ella
        var r = await fetch("/api/presencia/token", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ dispositivo: dispositivo() }) });
        if (!r.ok) {
          var e = null; try { e = await r.json(); } catch (x) { e = null; }
          ponEstado(r.status === 401 ? "Entra con tu enlace para ver a los demás." : (e && typeof e.mensaje === "string" ? e.mensaje : "No se pudo entrar en la visita compartida (" + r.status + ")."), true);
          return;
        }
        var t = await r.json();
        LK = LK || await import("livekit-client");
        if (!activo) return;
        var s = new LK.Room({ adaptiveStream: false, dynacast: false });
        s.on(LK.RoomEvent.ParticipantConnected, function (p) { entraOtro(p); });
        s.on(LK.RoomEvent.ParticipantDisconnected, function (p) { saleOtro(p.identity); });
        s.on(LK.RoomEvent.DataReceived, function (datos, p, tipo, tema) { recibeDatos(datos, p, tema); });
        s.on(LK.RoomEvent.Reconnecting, function () { ponEstado("Reconectando…", false); });
        s.on(LK.RoomEvent.Reconnected, function () { ponEstado("", false); });
        s.on(LK.RoomEvent.Disconnected, function (motivo) { alSalir(s, motivo); });
        await s.connect(t.url, t.token, { autoSubscribe: false });
        if (!activo) { s.disconnect(); return; }
        sala = s;
        yo = { identidad: s.localParticipant.identity, info: SalaPose.leeInfo(s.localParticipant.metadata) };
        s.remoteParticipants.forEach(function (p) { entraOtro(p); });
        ponEstado("", false);
      } catch (err) {
        ponEstado("No se pudo conectar con la visita compartida.", true);
        if (typeof console !== "undefined") console.warn("presencia: " + (err && err.message ? err.message : err));
      } finally { conectando = false; }
    }
    function alSalir(s, motivo) {
      if (sala !== s && sala) return;
      sala = null; yo = null;
      Object.keys(porId).forEach(saleOtro);
      if (!activo) return;
      var R = LK && LK.DisconnectReason ? LK.DisconnectReason : {};
      ponEstado(motivo === R.PARTICIPANT_REMOVED ? "La oficina te ha sacado de la visita compartida." : motivo === R.DUPLICATE_IDENTITY ? "Has abierto la visita compartida en otra pestaña: aquí se ha cerrado." : "Te has desconectado de la visita compartida.", true);
    }
    function entraOtro(p) {
      var id = p.identity; if (!id || porId[id]) return porId[id] || null;
      if (!huecos.length) { est.sinPlaza = (est.sinPlaza || 0) + 1; return null; }
      var h = huecos.pop(), mt = SalaPose.leeInfo(p.metadata);
      var a = { k: h, id: id, info: mt, alias: mt.alias, camisa: CAMISAS[mt.camisa], piel: PIELES[mt.piel], sombrero: mt.sombrero, iSom: mt.sombrero ? h : -1, iSomHueco: h, iMano: h * 2, out: BufferPose.salida(), ret: null, visto: false, cerca: false };
      a.o = SalaPose.entra(SP, id, mt); a.buf = a.o.buf;
      colorea(a); pintaNombre(h, mt.alias); oculta(a);
      porId[id] = a; claveGente = ""; return a;
    }
    function saleOtro(id) {
      var a = porId[id]; if (!a) return;
      oculta(a); pintaNombre(a.k, ""); huecos.push(a.k); delete porId[id]; SalaPose.sale(SP, id); claveGente = "";
    }
    function recibeDatos(datos, p, tema) {
      if (!p || !p.identity || (yo && p.identity === yo.identidad)) return;
      if (tema === "pose") {
        var a = porId[p.identity] || entraOtro(p); if (!a) return;
        if (SalaPose.recibe(SP, p.identity, datos, performance.now())) est.recibidos++; else est.viejos++;
      } else if (tema === "chat") {
        var txt = Chat.decodifica(datos); if (txt === null || bloqueados[p.identity]) return;
        var b = porId[p.identity]; anadeMensaje(b ? b.alias : SalaPose.leeInfo(p.metadata).alias, txt, false);
      }
    }
    // la pose propia en el sistema del contrato (cota SIN exagerar), o null si estás en vista aérea (órbita, vuelo o mirador de VR): entonces no se publica (decisión 60)
    function poseLocal(ahoraMs) {
      var o = poseL, s;
      if (VRX.on) {
        if (VRX.vuelo || VRX.mirador) return null;
        var h = VRX.cab; s = suelo(h.x, -h.z);
        q1.setFromAxisAngle(ejeY, VRX.rig.yaw).multiply(camera.quaternion);
        o.tipo = PoseCodec.QUEST; o.cab.p[0] = h.x; o.cab.p[1] = h.y - s * exag + s; o.cab.p[2] = h.z; o.cab.q[0] = q1.x; o.cab.q[1] = q1.y; o.cab.q[2] = q1.z; o.cab.q[3] = q1.w;
        o.izq = manoLocal("left"); o.der = manoLocal("right");
      } else if (paseando) {
        s = suelo(pp.x, pp.y); q1.setFromAxisAngle(ejeY, -pp.ang);
        o.tipo = PoseCodec.ESCRITORIO; o.cab.p[0] = pp.x; o.cab.p[1] = s + ALTO_OJOS; o.cab.p[2] = -pp.y; o.cab.q[0] = q1.x; o.cab.q[1] = q1.y; o.cab.q[2] = q1.z; o.cab.q[3] = q1.w;
        o.izq = null; o.der = null;
      } else return null;
      o.t = ahoraMs >>> 0;
      return o;
    }
    function manoLocal(lado) {   // la empuñadura del mando de ese lado, en el mundo (el rig ya va dentro de matrixWorld); null si no hay mando
      var i = manoDe[0] === lado ? 0 : manoDe[1] === lado ? 1 : -1; if (i < 0) return null;
      var g = renderer.xr.getControllerGrip(i); if (!g || !g.parent || !g.visible) return null;
      mDesc.copy(g.matrixWorld).decompose(vDesc, qDesc, sDesc);
      var s = suelo(vDesc.x, -vDesc.z);
      return { p: [vDesc.x, vDesc.y - s * exag + s, vDesc.z], q: [qDesc.x, qDesc.y, qDesc.z, qDesc.w] };
    }
    function actualizaRed(dt, ahoraMs) {
      var envios = SalaPose.tic(SP, ahoraMs, sala ? poseLocal(ahoraMs) : null);
      if (envios && sala) envios.forEach(function (e) {
        var op = { reliable: false, topic: "pose" }; if (e.destinos) op.destinationIdentities = e.destinos;
        sala.localParticipant.publishData(e.bytes, op).catch(function () { est.perdidos++; });
        est.enviados++; est.bytes += e.bytes.byteLength; bytesVentana += e.bytes.byteLength;
      });
      var nc = 0, id, a;
      for (id in porId) {
        a = porId[id];
        if (bloqueados[id] || !SalaPose.conPose(a.o, ahoraMs)) { if (a.visto) oculta(a); continue; }   // bloqueado o en vista aérea: no se dibuja
        a.buf = a.o.buf; coloca(a, ahoraMs, dt, SalaPose.retardo(a.o));   // (el búfer se rehace si vuelve tras un rato sin pose)
        if (a.o.cerca) nc++;
      }
      est.cerca = nc; est.n = Object.keys(porId).length;
      tGente += dt; if (tGente >= 0.5) { tGente = 0; pintaGente(ahoraMs); }
    }

    // ---- apartado Gente y chat (solo con ?presencia=red). Todo el texto que llega se pone con textContent: nunca como HTML
    function el(tag, props, hijos) { var e = document.createElement(tag); if (props) Object.keys(props).forEach(function (k) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
    function montaPanel() {
      var boton = "font:inherit;color:inherit;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:4px 10px;min-height:32px;cursor:pointer";
      var titulo = el("button", { type: "button", style: boton + ";width:100%;text-align:left;font-weight:600", "aria-expanded": "true" }, ["Gente"]);
      var cuerpo = el("div", {});
      var estado = el("p", { style: "margin:6px 0;color:#ffd58a", role: "status" });
      var reentra = el("button", { type: "button", style: boton, hidden: true }, ["Volver a entrar"]);
      var listaG = el("ul", { style: "list-style:none;margin:6px 0;padding:0;max-height:22vh;overflow:auto" });
      var chat = el("ol", { style: "list-style:none;margin:6px 0;padding:0;max-height:18vh;overflow:auto", "aria-live": "polite", "aria-label": "Chat de la visita" });
      var entrada = el("input", { type: "text", maxLength: Chat.MAX, autocomplete: "off", placeholder: "Escribe a la visita", "aria-label": "Mensaje para la visita (no se guarda)", style: "flex:1;min-width:0;font:inherit;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.3);color:inherit" });
      var forma = el("form", { style: "display:flex;gap:6px" }, [entrada, el("button", { type: "submit", style: boton }, ["Enviar"])]);
      var nota = el("p", { style: "margin:4px 0 0;opacity:0.7;font-size:11px" }, ["Visita libre: sin voz. El chat no se guarda."]);
      cuerpo.appendChild(estado); cuerpo.appendChild(reentra); cuerpo.appendChild(listaG); cuerpo.appendChild(chat); cuerpo.appendChild(forma); cuerpo.appendChild(nota);
      var raiz = el("section", { id: "presenciaGente", "aria-label": "Gente en la visita", style: "position:absolute;right:12px;bottom:12px;z-index:30;width:min(280px,calc(100% - 24px));max-height:60vh;overflow:auto;padding:8px;border-radius:12px;background:rgba(16,20,24,0.86);color:#fff;font:13px/1.35 system-ui,sans-serif;box-sizing:border-box" }, [titulo, cuerpo]);
      titulo.addEventListener("click", function () { var abierto = titulo.getAttribute("aria-expanded") === "true"; titulo.setAttribute("aria-expanded", abierto ? "false" : "true"); cuerpo.hidden = abierto; });
      reentra.addEventListener("click", function () { conecta(); });
      entrada.addEventListener("keydown", function (e) { e.stopPropagation(); });   // al escribir, las pulsaciones no mueven al paseante
      forma.addEventListener("submit", function (e) {
        e.preventDefault();
        var txt = Chat.limpia(entrada.value), ahora = performance.now();
        if (txt === null || !sala || ahora - tChat < 700) return;   // como mucho un mensaje cada 0,7 s
        tChat = ahora; entrada.value = "";
        sala.localParticipant.publishData(Chat.codifica(txt), { reliable: true, topic: "chat" }).then(function () { anadeMensaje("Tú", txt, true); }, function () { ponEstado("No se pudo mandar el mensaje.", false); });
      });
      (visor || document.body).appendChild(raiz);
      ui = { raiz: raiz, titulo: titulo, estado: estado, reentra: reentra, listaG: listaG, chat: chat };
    }
    function ponEstado(t, conBoton) { if (!ui) return; ui.estado.textContent = t; ui.estado.hidden = !t; ui.reentra.hidden = !conBoton; }
    function anadeMensaje(quien, txt, mio) {   // solo en memoria, los últimos 40: el chat no se guarda (decisión 40)
      mensajes.push({ quien: quien, txt: txt }); if (mensajes.length > 40) mensajes.shift();
      if (!ui) return;
      ui.chat.appendChild(el("li", { style: "margin:2px 0" + (mio ? ";opacity:0.85" : "") }, [el("strong", {}, [quien + ": "]), txt]));
      while (ui.chat.children.length > 40) ui.chat.removeChild(ui.chat.firstChild);
      ui.chat.scrollTop = ui.chat.scrollHeight;
    }
    function pintaGente(ahoraMs) {
      if (!ui) return;
      var enMundo = !!(sala && poseLocal(ahoraMs)), g = SalaPose.gente(SP, ahoraMs), clave = (yo ? "1" : "0") + (enMundo ? "m" : "a") + g.map(function (x) { return x.id + x.estado + (bloqueados[x.id] ? "b" : ""); }).join("|");
      if (clave === claveGente) return; claveGente = clave;
      ui.titulo.textContent = "Gente (" + (g.length + (yo ? 1 : 0)) + ")";
      while (ui.listaG.firstChild) ui.listaG.removeChild(ui.listaG.firstChild);
      if (yo) ui.listaG.appendChild(el("li", { style: "margin:3px 0" }, [el("strong", {}, ["Tú · " + yo.info.alias]), " · " + (enMundo ? "en el olivar" : "en vista aérea (no te ven)")]));
      g.forEach(function (x) {
        var m = x.info || SalaPose.leeInfo(""), bl = !!bloqueados[x.id];
        var b = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer", "aria-pressed": bl ? "true" : "false", title: "Solo te afecta a ti; nadie se entera" }, [bl ? "Desbloquear" : "Bloquear"]);
        b.addEventListener("click", function () { if (bloqueados[x.id]) delete bloqueados[x.id]; else bloqueados[x.id] = true; claveGente = ""; pintaGente(performance.now()); });
        ui.listaG.appendChild(el("li", { style: "margin:3px 0" + (bl ? ";opacity:0.55" : "") }, [m.alias + " · " + m.rol + " · " + m.dispositivo + " · " + x.estado, b]));
      });
    }

    function actualiza(dt) {
      if (!activo) return;
      var t0 = performance.now(), ahoraMs = Math.round(t0), nc = 0, i;
      if (variante === "red") actualizaRed(dt, t0);
      else {
        var ol = oyente();
        for (i = 0; i < V.length; i++) { anda(V[i], dt); emite(V[i], dt, ahoraMs, ol); }
        entrega(ahoraMs);
        for (i = 0; i < V.length; i++) { coloca(V[i], ahoraMs, dt, V[i].cerca ? RET_CERCA : RET_LEJOS); if (V[i].cerca) nc++; }   // [SUPUESTO] el receptor sabe si le llega a 10 o a 2 Hz por la distancia que él mismo ve
        est.cerca = nc;
      }
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
      var ms = performance.now() - t0; msVentana = Math.max(msVentana, ms); est.ms = est.ms ? est.ms * 0.95 + ms * 0.05 : ms;
      tEst += dt;
      if (tEst >= 1) {
        est.bps = Math.round(bytesVentana / tEst); est.msMax = msVentana; est.retP95 = Math.round(p95(muestrasRet)); est.errP95 = Math.round(p95(muestrasErr) * 100) / 100;
        bytesVentana = 0; msVentana = 0; tEst = 0; if (muestrasRet.length > 4000) { muestrasRet = muestrasRet.slice(-2000); muestrasErr = muestrasErr.slice(-2000); }
      }
    }
    function estado() {
      var e = { activo: activo, variante: variante, n: est.n, quest: est.quest, cerca: est.cerca, enviados: est.enviados, recibidos: est.recibidos, perdidos: est.perdidos, viejos: est.viejos, bytes: est.bytes,
        bytesPorSegundo: est.bps, ms: Math.round(est.ms * 1000) / 1000, msMax: Math.round(est.msMax * 1000) / 1000, retardoP95ms: est.retP95, errorP95m: est.errP95, vistos: V.filter(function (a) { return a.visto; }).length };
      if (variante === "red") { e.conectado = !!sala; e.identidad = yo ? yo.identidad : null; e.vistos = Object.keys(porId).filter(function (k) { return porId[k].visto; }).length; e.sinPlaza = est.sinPlaza || 0; e.enVistaAerea = !(sala && poseLocal(Math.round(performance.now()))); }
      return e;
    }
    function libera() {   // libera todo lo de la GPU (y, en red, sale de la sala y retira el apartado) y deja el módulo como sin la bandera
      if (!grupo) return;
      activo = false;
      if (sala) { var s = sala; sala = null; s.disconnect(); }
      if (ui) { ui.raiz.remove(); ui = null; }
      scene.remove(grupo); [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { m.dispose(); });
      geos.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); if (texNombres) texNombres.dispose();
      grupo = null; V = []; red = []; porId = Object.create(null); mensajes = [];
    }
    function texto() { return activo ? "presencia (" + variante + ") " + est.n + " · cerca " + est.cerca + " · " + est.bps + " B/s · JS " + est.ms.toFixed(2) + " ms" + (variante === "sim" ? " · retardo p95 " + est.retP95 + " ms" : sala ? "" : " · sin conexión") : ""; }
    if (variante === "sim") inicia(); else if (variante === "red") iniciaRed();
    return { activo: function () { return activo; }, actualiza: actualiza, estado: estado, libera: libera, texto: texto };
  })();
  window.__presencia = function (accion) { if (accion === "libera") Presencia.libera(); return Presencia.estado(); };   // gancho de pruebas: estado y, con "libera", soltar todo
