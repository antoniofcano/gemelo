// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Chat, Muneco, Encuentro, sitioJunto, avatarVRM, Presencia
// Consume: 01_datos (D, $), 02_mundo (suelo, copas), 03_escena (visor, renderer, scene, camera, texColor, exag, modo), 06_arboles (tronco),
//   09_camara (objetivo), 12_paseo (paseando, persona), 12b_llegada (Llegada), 13b_hazas (HazasPuro), 14_historia (lista, carga),
//   15_tiempo (ahoraMs, rumbo, hace), 16_vida (enQuad, mira, quad, vidaPaseo, enDron, dron), 17_minimapa (mini), 29_vr (VRX, vrFundido, panel),
//   34_movibles (Movibles)
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
    var PIE = 0, QUAD = 1, DRON = 2;   // modo de quien publica, bits 4-5 del byte 1 (P6; los receptores de antes los ignoran: sigue siendo la v1)
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
    // pose = { tipo: 1|2, seq: u16, t: ms u32 del reloj del emisor, cab: {p:[x,y,z] m, q:[x,y,z,w]}, izq, der: {p, q} o null (solo tipo 2), modo: 0 a pie | 1 quad | 2 dron (si falta, a pie) } → Uint8Array de 24 o 56 B
    function codifica(pose) {
      var tipo = pose.tipo === QUEST ? QUEST : ESCRITORIO, b = new Uint8Array(BYTES[tipo]), dv = new DataView(b.buffer);
      var modo = pose.modo === QUAD || pose.modo === DRON ? pose.modo : PIE;
      var band = tipo | (tipo === QUEST && pose.izq ? 4 : 0) | (tipo === QUEST && pose.der ? 8 : 0) | (modo << 4);
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
      var modo = (band >> 4) & 3;   // 3 está reservado: se toma como a pie (no se descarta la pose por eso); los bits 6-7, reservados, se ignoran
      var pose = { tipo: tipo, seq: dv.getUint16(2, true), t: dv.getUint32(4, true), cab: leePieza(dv, 8), izq: null, der: null, modo: modo === 3 ? PIE : modo };
      if (tipo === QUEST) { if (band & 4) pose.izq = leePieza(dv, 24); if (band & 8) pose.der = leePieza(dv, 40); }
      return pose;
    }
    return { VERSION: VERSION, ESCRITORIO: ESCRITORIO, QUEST: QUEST, BYTES: BYTES, PIE: PIE, QUAD: QUAD, DRON: DRON, codifica: codifica, decodifica: decodifica, empaquetaQ: empaquetaQ, desempaquetaQ: desempaquetaQ };
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
      b.m.push({ t: t, tipo: pose.tipo, cab: pose.cab, izq: pose.izq, der: pose.der, modo: pose.modo | 0 });
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
      out.tipo = c.tipo; out.modo = c.modo | 0; out.t = Math.min(tr, c.t + (k > 1 ? Math.min(tr - c.t, EXTRA) : 0));
      pieza(a.cab, c.cab, k, out.cab);
      out.hayIzq = pieza(a.izq, c.izq, Math.min(k, 1), out.izq); out.hayDer = pieza(a.der, c.der, Math.min(k, 1), out.der);
      return true;
    }
    function salida() { return { cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: { p: [0, 0, 0], q: [0, 0, 0, 1] }, der: { p: [0, 0, 0], q: [0, 0, 0, 1] }, hayIzq: false, hayDer: false, tipo: 1, modo: 0, t: 0 }; }
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
      if (!o) o = s.otros[id] = { id: id, info: info || null, buf: BufferPose.crea(), tUlt: null, intervalo: 500, cerca: false, cab: null, tipo: 0, modo: 0 };
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
      o.tUlt = ahora; o.cab = p.cab.p; o.tipo = p.tipo; o.modo = p.modo; s.recibidos++;
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
      for (id in s.otros) { o = s.otros[id]; l.push({ id: id, info: o.info, enMundo: conPose(o, ahora), estado: conPose(o, ahora) ? (o.tipo === PoseCodec.QUEST ? "con gafas" : o.modo === PoseCodec.QUAD ? "en quad" : o.modo === PoseCodec.DRON ? "con el dron" : "paseando") : "en vista aérea" }); }
      return l.sort(function (a, b) { var x = (a.info && a.info.alias) || "", y = (b.info && b.info.alias) || ""; return x < y ? -1 : x > y ? 1 : 0; });
    }
    // a quién se dibuja (avatar, minimapa, «Ir con»): a quien está en la sala, con pose reciente (no «en vista aérea») y no has bloqueado tú
    function seVe(s, id, ahora, bloqueados) { var o = s.otros[id]; return !!o && !(bloqueados && bloqueados[id]) && conPose(o, ahora); }
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
        camisa: entero(av.camisa, 0, 5, 0), piel: entero(av.piel, 0, 4, 1), sombrero: SOMBREROS.indexOf(av.sombrero) >= 0 ? SOMBREROS.indexOf(av.sombrero) : 1,
        vrm: typeof av.vrm === "string" && /^[a-z0-9-]{1,32}$/.test(av.vrm) ? av.vrm : null   // P7c (ADR-0020 §6): id del catálogo de avatares; si no cuadra, el muñeco
      };
    }
    return { TICK: TICK, SIN_POSE: SIN_POSE, crea: crea, entra: entra, sale: sale, recibe: recibe, tic: tic, retardo: retardo, gente: gente, conPose: conPose, seVe: seVe, leeInfo: leeInfo };
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
  // El muñeco de los demás (P5): el mismo del paseante local (12_paseo.js: cuerpo, cabeza, dos piernas y dos brazos) con su misma
  // animación de paso, calculada en el RECEPTOR con la velocidad horizontal que sale de la interpolación (la pose no trae nada de
  // esto: el contrato v1 no cambia). Los pies van al suelo de ESTE mundo (suelo local × exageración); de la pose solo se usan la
  // posición horizontal, la orientación de la cabeza y, con gafas, la altura de la cabeza sobre el suelo (para agacharse).
  var Muneco = (function () {
    var ALTURA = 1.6, PASO = 3.4, VREF = 1.7, AMP = 0.75, BRAZO = 0.8, BOTE = 0.03;   // los de su paseo (12_paseo.js)
    var SUAVE_V = 8, GIRO = 6, V_ANDA = 0.25, V_MAX = 8, SALTO = 5, AGACHO_MAX = 0.9;
    var SENTADO_P = 1.15, SENTADO_B = 1.05, MANDO_B = 1.0;   // los de 16_vida.js (vidaPaseo): en quad, piernas 1,15 y brazos 1,05 rad; con el dron, brazos 1,0
    var V_MAX_QUAD = 14;   // en quad se va a 12 m/s: la velocidad suavizada no se recorta a la de andar
    function crea() { return { x: null, z: null, vel: 0, paso: 0, yaw: 0 }; }
    function ang(d) { return Math.atan2(Math.sin(d), Math.cos(d)); }
    // st: estado del avatar; x, z: posición interpolada (ejes de three); yawCab: hacia dónde apunta su cabeza (giro en y; 0 = −z);
    // dt en s; sueloLocal: suelo(x, −z) de este mundo (sin exagerar); hCab: altura de su cabeza sobre el suelo según la pose;
    // conManos: trae manos (Quest) → los brazos no se animan; modo (P6): 0 a pie, 1 en quad (sentado: piernas y brazos adelante, sin paso, el cuerpo
    // 0,2 m detrás del centro del quad, como el paseante local en 16_vida.js), 2 con el dron (de pie, brazos al mando, sin paso).
    // Devuelve en `o` lo que se necesita para colocar las piezas (y el vehículo: o.vehiculo, o.yVeh, o.atras).
    function avanza(st, x, z, yawCab, dt, sueloLocal, exag, hCab, conManos, o, modo) {
      o = o || {}; modo = modo === 1 || modo === 2 ? modo : 0;
      if (st.x === null) { st.x = x; st.z = z; st.yaw = yawCab; }
      var dx = x - st.x, dz = z - st.z, d = Math.sqrt(dx * dx + dz * dz), v = dt > 0 && d < SALTO ? d / dt : 0;   // un salto (vuelve tras un hueco) no es andar
      var k = Math.min(1, dt * SUAVE_V);
      st.vel += (Math.min(v, modo === 1 ? V_MAX_QUAD : V_MAX) - st.vel) * k;
      // gira hacia donde anda; quieto, hacia donde apunta. Suave: como mucho GIRO rad/s… en proporción a lo que falta
      // en quad o con el dron el cuerpo va hacia donde apunta la cabeza (el emisor publica su rumbo; en quad, el del quad, que también da marcha atrás)
      var obj = !modo && st.vel > V_ANDA && d > 1e-6 ? Math.atan2(-dx, -dz) : yawCab;
      st.yaw = ang(st.yaw + ang(obj - st.yaw) * Math.min(1, dt * GIRO));
      st.x = x; st.z = z; o.vehiculo = modo; o.atras = 0;
      if (modo) {   // sentado en el quad o quieto con el mando: sin paso ni bote
        var q = modo === 1;
        o.yVeh = sueloLocal * exag + 0.02; o.yPies = sueloLocal * exag - (q ? 0.02 : 0); o.atras = q ? 0.2 : 0;
        o.yaw = st.yaw; o.vel = st.vel; o.mov = 0;
        o.piernaI = o.piernaD = q ? SENTADO_P : 0;
        o.brazoI = o.brazoD = conManos ? 0 : q ? SENTADO_B : MANDO_B;
        o.agacho = 0; o.yCab = o.yPies + ALTURA;
        return o;
      }
      st.paso += st.vel * dt * PASO;
      var mov = Math.min(1, st.vel / VREF), sw = Math.sin(st.paso) * AMP * mov;
      o.yPies = sueloLocal * exag + Math.abs(Math.sin(st.paso)) * BOTE * mov;
      o.yaw = st.yaw; o.vel = st.vel; o.mov = mov;
      o.piernaI = sw; o.piernaD = -sw;
      o.brazoI = conManos ? 0 : -sw * BRAZO; o.brazoD = conManos ? 0 : sw * BRAZO;
      o.agacho = Math.max(0, Math.min(AGACHO_MAX, ALTURA - (isFinite(hCab) ? hCab : ALTURA)));
      o.yCab = o.yPies + ALTURA - o.agacho;
      return o;
    }
    // piezas del muñeco (las mismas medidas que el paseante de 12_paseo.js), con el pivote ARRIBA (hombro, cadera, cuello):
    // [ancho, largo, fondo, x, y del pivote, ¿pierna?, ¿brazo?]. y del pivote sin agacharse; agachado, baja el cuerpo y encogen las piernas
    var PIEZAS = [[0.46, 0.62, 0.25, 0, 1.48, 0, 0], [0.17, 0.86, 0.2, -0.12, 0.86, 1, 0], [0.17, 0.86, 0.2, 0.12, 0.86, 1, 0], [0.11, 0.58, 0.12, -0.3, 1.46, 0, 1], [0.11, 0.58, 0.12, 0.3, 1.46, 0, 1]];
    return { ALTURA: ALTURA, SENTADO_P: SENTADO_P, SENTADO_B: SENTADO_B, MANDO_B: MANDO_B, crea: crea, avanza: avanza, PIEZAS: PIEZAS };
  })();
  // «Ir con alguien» (I1): dónde dejarte cuando vas a donde está otra persona (Encuentro; el salto lo hace Llegada, 12b_llegada.js). A 2,5 m de ella (si no cabe, 3, 2, 3,5 o 4 m), por el lado desde el que
  // llegas y, si ahí hay árbol, probando cada 30° alrededor; mirándola. Un sitio vale si no cae dentro de ninguna copa (radio medio de su perfil LiDAR)
  // ni a menos de rTronco + 0,2 m de un tronco y está dentro de la finca (3 m de margen, como el paseo). Si ninguno está libre de copas, el primero libre
  // de troncos; si ni eso, el primero empujado fuera de los troncos como hace el paseo (12_paseo.js). t, desde = {x este, y norte};
  // obst = [{x, y, r}] (r = radio de la copa; 0 si no se sabe); ext = D.ext [oeste, norte, este, sur]; opc = {rTronco (0,55 a pie, 1,05 en quad), suelo(x, y)}.
  // Devuelve {x, y, ang (rumbo del paseo: 0 norte, π/2 este), z (suelo, si se da la función), libre: "copa" | "tronco" | "empujado", d}.
  var Encuentro = (function () {
    var DISTS = [2.5, 3, 2, 3.5, 4], BALIZA = [4.5, 4, 5, 3.5, 5.5], PASO = Math.PI / 6, MARGEN = 3, HOLGURA = 0.2;
    function dentro(x, y, ext) { return !ext || (x >= ext[0] + MARGEN && x <= ext[2] - MARGEN && y >= ext[3] + MARGEN && y <= ext[1] - MARGEN); }
    function mide(x, y, obst, rT) {   // 2 = libre de copas y troncos, 1 = solo de troncos, 0 = toca un tronco
      var r = 2;
      for (var i = 0; i < obst.length; i++) {
        var o = obst[i], d = Math.hypot(x - o.x, y - o.y);
        if (d < rT + HOLGURA) return 0;
        if (d < (o.r || 0)) r = 1;
      }
      return r;
    }
    function punto(t, desde, obst, ext, opc) {
      opc = opc || {}; obst = obst || [];
      var DS = opc.dists && opc.dists.length ? opc.dists : DISTS, rT = opc.rTronco > 0 ? opc.rTronco : 0.55, dx = desde ? desde.x - t.x : 0, dy = desde ? desde.y - t.y : -1;
      var base = Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : -Math.PI / 2;   // ángulo matemático (desde el este, antihorario); sin dirección clara, por el sur
      var mejor = null, nivelMejor = -1, primero = null;
      for (var i = 0; i < DS.length && nivelMejor < 2; i++) {
        for (var k = 0; k < 12; k++) {
          var a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * PASO, x = t.x + Math.cos(a) * DS[i], y = t.y + Math.sin(a) * DS[i];
          if (!dentro(x, y, ext)) continue;
          if (!primero) primero = { x: x, y: y };
          var n = mide(x, y, obst, rT);
          if (n > nivelMejor) { nivelMejor = n; mejor = { x: x, y: y, d: DS[i] }; if (n === 2) break; }
        }
      }
      var libre = nivelMejor === 2 ? "copa" : "tronco";
      if (nivelMejor < 1) {   // todo cerca toca algún tronco: el primero, empujado fuera de cada tronco (como el paseo)
        mejor = primero || { x: t.x + Math.cos(base) * DS[0], y: t.y + Math.sin(base) * DS[0] }; libre = "empujado";
        for (var j = 0; j < obst.length; j++) {
          var o = obst[j], ex = mejor.x - o.x, ey = mejor.y - o.y, dd = Math.hypot(ex, ey), R = rT + HOLGURA;
          if (dd < R) { dd = dd || 0.001; mejor.x = o.x + ex / dd * R; mejor.y = o.y + ey / dd * R; }
        }
        if (ext) { mejor.x = Math.max(ext[0] + MARGEN, Math.min(ext[2] - MARGEN, mejor.x)); mejor.y = Math.max(ext[3] + MARGEN, Math.min(ext[1] - MARGEN, mejor.y)); }
        mejor.d = Math.hypot(mejor.x - t.x, mejor.y - t.y);
      }
      mejor.ang = Math.atan2(t.x - mejor.x, t.y - mejor.y); mejor.libre = libre;
      if (typeof opc.suelo === "function") mejor.z = opc.suelo(mejor.x, mejor.y);
      return mejor;
    }
    // I4: quién está en una parcela (las balizas como punto de encuentro): de los puntos que se dibujan (Presencia.puntos: ya sin vista aérea ni
    // bloqueados), los que caen dentro de su linde; dentro(x, y, [anillo]) es HazasPuro.dentroPoligono (13b_hazas.js). Alias en orden alfabético
    function enParcela(puntos, linde, dentro) {
      var l = []; if (!puntos || !linde || typeof dentro !== "function") return l;
      for (var i = 0; i < puntos.length; i++) if (dentro(puntos[i].x, puntos[i].y, [linde])) l.push(puntos[i].alias);
      return l.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    }
    return { DISTS: DISTS, BALIZA: BALIZA, punto: punto, enParcela: enParcela };
  })();
  // [puro:fin]

  // el sitio libre junto a t = {x este, y norte} (Encuentro.punto) con los árboles de alrededor (copas: radio medio del perfil LiDAR); dists, las distancias
  // a probar (por defecto 2,5-4 m: ir con alguien; Encuentro.BALIZA, 4-5,5 m: ir a una baliza); desde, de dónde llegas
  function sitioJunto(t, desde, dists, rTronco) {
    var obst = [], R2 = 196;   // 14 m alrededor
    for (var i = 0; i < copas.length; i++) {
      var o = copas[i], dx = o.x - t.x, dy = o.y - t.y;
      if (dx * dx + dy * dy < R2) obst.push({ x: o.x, y: o.y, r: o.perfil.reduce(function (s, v) { return s + v; }, 0) / 8 });
    }
    return Encuentro.punto(t, desde, obst, D.ext, { dists: dists, rTronco: rTronco, suelo: suelo });
  }

  // los avatares VRM (26b_avatares.js) se enganchan aquí cuando hay presencia y catálogo: coloca(a, …) devuelve true si su VRM tapa ya al muñeco
  var avatarVRM = null;
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
    var NP = Muneco.PIEZAS.length, PANTALON = 0x37455c, mBase = null, mPieza = null, ejeX = null, outMu = {};   // pantalón: el del paseante
    // P6: el quad y el dron de los demás, el mismo modelo del paseante local (16_vida.js) fundido en una sola malla con color por vértice e instanciado:
    // una llamada para todos los quads y otra para todos los drones, y solo si alguien los lleva (si no, la malla no se dibuja)
    var mQuad = null, mDron = null, nVehQ = 0, nVehD = 0, vEsc = null, tVeh = 0, DRON_DELANTE = 5, DRON_ALTO = 4, DRON_ESC = 1.8;

    // ---- los avatares (los mismos en las dos variantes): cuerpo, cabeza, sombrero, manos y nombre, instanciados (5 llamadas de dibujo tengas los que tengas)
    function montaGrafica(nCuerpos, nSom, nManos) {
      mBase = new THREE.Matrix4(); mPieza = new THREE.Matrix4(); ejeX = new THREE.Vector3(1, 0, 0);
      m4 = new THREE.Matrix4(); m4b = new THREE.Matrix4(); q1 = new THREE.Quaternion(); v1 = new THREE.Vector3(); v2 = new THREE.Vector3(); vS = new THREE.Vector3(1, 1, 1); ejeY = new THREE.Vector3(0, 1, 0);
      grupo = new THREE.Group(); grupo.name = "presencia"; scene.add(grupo);
      // el muñeco del paseante (12_paseo.js): cuerpo, dos piernas y dos brazos son la MISMA caja unidad con el pivote arriba,
      // escalada y girada por instancia (Muneco.PIEZAS): 5 instancias por avatar en una sola llamada; color por instancia
      // (camisa en cuerpo y brazos, pantalón en las piernas). La cabeza, una bola baja (icosaedro: 20 triángulos)
      var gC = new THREE.BoxGeometry(1, 1, 1); gC.translate(0, -0.5, 0);
      var gCab = new THREE.IcosahedronGeometry(0.135, 0), gSom = new THREE.BoxGeometry(1, 1, 1), gMano = new THREE.BoxGeometry(0.08, 0.08, 0.13), gNom = new THREE.PlaneGeometry(1.6, 0.3);
      var matC = new THREE.MeshLambertMaterial({ flatShading: true }), matL = new THREE.MeshLambertMaterial({ flatShading: true });
      geos = [gC, gCab, gSom, gMano, gNom]; mats = [matC, matL];
      mCuerpo = new THREE.InstancedMesh(gC, matC, nCuerpos * NP); mCabeza = new THREE.InstancedMesh(gCab, matL, nCuerpos); mSombrero = new THREE.InstancedMesh(gSom, matL, nSom); mManos = new THREE.InstancedMesh(gMano, matL, nManos);
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
      for (var j = 0; j < NP; j++) mCuerpo.setColorAt(a.k * NP + j, c.setHex(Muneco.PIEZAS[j][5] ? PANTALON : a.camisa));
      mCabeza.setColorAt(a.k, c.setHex(a.piel));
      if (a.iSom >= 0) mSombrero.setColorAt(a.iSom, c.setHex(SOMBREROS[a.sombrero].c));
      if (a.iMano >= 0) { mManos.setColorAt(a.iMano, c.setHex(a.piel)); mManos.setColorAt(a.iMano + 1, c.setHex(a.piel)); }
      [mCuerpo, mCabeza, mSombrero, mManos].forEach(function (m) { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }
    function oculta(a) {   // nada de ese avatar se ve (escala 0) hasta que llegue su pose
      m4.makeScale(0, 0, 0);
      for (var j = 0; j < NP; j++) mCuerpo.setMatrixAt(a.k * NP + j, m4);
      mCabeza.setMatrixAt(a.k, m4); mNombres.setMatrixAt(a.k, m4);
      a.mu = null;   // al volver, empieza quieto donde aparezca (no se desliza desde donde se fue)
      if (a.iSomHueco >= 0) mSombrero.setMatrixAt(a.iSomHueco, m4); else if (a.iSom >= 0) mSombrero.setMatrixAt(a.iSom, m4);
      if (a.iMano >= 0) { mManos.setMatrixAt(a.iMano, m4); mManos.setMatrixAt(a.iMano + 1, m4); }
      if (mQuad) mQuad.setMatrixAt(a.k, m4); if (mDron) mDron.setMatrixAt(a.k, m4);
      if (avatarVRM) avatarVRM.oculta(a);
      a.visto = false;
    }

    // ---- simulación (?presencia=sim)
    function inicia() {
      var p = (/[?&]n=(\d+)/.exec(location.search) || [])[1]; N = Math.max(1, Math.min(64, p ? Number(p) : 10)); est.n = N;
      // P6, solo para probar: &vehiculo=quad|dron|mixto pone a los simulados en quad, con el dron o un tercio de cada (sin él, todos a pie, como siempre)
      var veh = (/[?&]vehiculo=(quad|dron|mixto)\b/.exec(location.search) || [])[1] || "";
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
          buf: BufferPose.crea(), out: BufferPose.salida(), visto: false, vrm: null, modo: veh === "quad" ? 1 : veh === "dron" ? 2 : veh === "mixto" ? k % 3 : 0
        });
        var nuevo = V[V.length - 1]; if (nuevo.modo === 1) nuevo.vel = 5.5; else if (nuevo.modo === 2) nuevo.vel = 0;   // en quad, deprisa; con el dron, quieto
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
      o.tipo = a.quest ? PoseCodec.QUEST : PoseCodec.ESCRITORIO; o.seq = a.seq; o.t = (a.reloj + ahoraMs) >>> 0; o.modo = a.modo;
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
      // los pies, en el suelo de ESTE mundo (suelo local × exageración), no en la cota de la pose; de la pose, la posición horizontal,
      // hacia dónde apunta y, solo con gafas, cuánto se agacha: altura de su cabeza sobre el suelo (la cota viaja sin exagerar). En
      // escritorio/móvil la cota no se usa: el muñeco va de pie (su suelo y el nuestro pueden diferir unos cm mientras llegan teselas)
      var c = o.cab.p, s = suelo(c[0], -c[2]), conManos = !!(o.hayIzq || o.hayDer);
      q1.set(o.cab.q[0], o.cab.q[1], o.cab.q[2], o.cab.q[3]);
      v2.set(0, 0, -1).applyQuaternion(q1); var yawCab = Math.atan2(-v2.x, -v2.z);
      var mu = Muneco.avanza(a.mu || (a.mu = Muneco.crea()), c[0], c[2], yawCab, dt, s, exag, o.tipo === PoseCodec.QUEST ? c[1] - s : NaN, conManos, outMu, o.modo), yv = mu.yCab;
      var cx = c[0] + Math.sin(mu.yaw) * mu.atras, cz = c[2] + Math.cos(mu.yaw) * mu.atras;   // en quad, el cuerpo 0,2 m detrás del centro del quad (16_vida.js)
      mBase.compose(v1.set(cx, mu.yPies, cz), q1.setFromAxisAngle(ejeY, mu.yaw), vS);
      var giros = [0, mu.piernaI, mu.piernaD, mu.brazoI, mu.brazoD];
      for (var j = 0; j < NP; j++) {
        var P = Muneco.PIEZAS[j], largo = P[5] ? Math.max(0.2, P[1] - mu.agacho) : P[1];   // agachado: baja el cuerpo y encogen las piernas
        mPieza.compose(v1.set(P[3], P[4] - mu.agacho, 0), q1.setFromAxisAngle(ejeX, giros[j]), v2.set(P[0], largo, P[2]));
        mCuerpo.setMatrixAt(a.k * NP + j, m4.multiplyMatrices(mBase, mPieza));
      }
      // la cabeza encima del muñeco, girada como la de verdad (apunta donde apunta)
      q1.set(o.cab.q[0], o.cab.q[1], o.cab.q[2], o.cab.q[3]);
      m4.compose(v1.set(cx, yv, cz), q1, vS); mCabeza.setMatrixAt(a.k, m4);
      if (a.iSom >= 0) { m4b.multiplyMatrices(m4, matSombreroLocal[a.sombrero]); mSombrero.setMatrixAt(a.iSom, m4b); }
      if (a.iMano >= 0) {
        [o.izq, o.der].forEach(function (h, i) {
          var hay = i === 0 ? o.hayIzq : o.hayDer;
          if (!hay) { mManos.setMatrixAt(a.iMano + i, m4.makeScale(0, 0, 0)); return; }
          var sh = suelo(h.p[0], -h.p[2]); q1.set(h.q[0], h.q[1], h.q[2], h.q[3]);
          mManos.setMatrixAt(a.iMano + i, m4.compose(v1.set(h.p[0], sh * exag + (h.p[1] - sh), h.p[2]), q1, vS));
        });
      }
      // P7c: si lleva su VRM y ya se ve entero, el muñeco no se dibuja (escala 0); el nombre y el vehículo, sí
      if (avatarVRM && avatarVRM.coloca(a, mu, o, yawCab, cx, cz, dt)) {
        m4.makeScale(0, 0, 0);
        for (var jt = 0; jt < NP; jt++) mCuerpo.setMatrixAt(a.k * NP + jt, m4);
        mCabeza.setMatrixAt(a.k, m4); if (a.iSom >= 0) mSombrero.setMatrixAt(a.iSom, m4);
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
      if (variante === "sim" && a.cerca) { var dr = ((a.reloj + ahoraMs - o.t) % 4294967296 + 4294967296) % 4294967296; muestrasRet.push(dr > 2147483648 ? dr - 4294967296 : dr); muestrasErr.push(Math.hypot(c[0] - a.x, -c[2] - a.y)); }
    }
    function p95(v) { if (!v.length) return 0; var s = v.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; }

    // ---- la sala de verdad (?presencia=red): LiveKit (livekit-client, import() solo con la bandera), token de la api, la pose propia y el apartado Gente con el chat
    var LK = null, sala = null, SP = null, porId = Object.create(null), huecos = [], bloqueados = Object.create(null), yo = null, manoDe = ["", ""];
    var ui = null, mensajes = [], tChat = 0, tGente = 0, claveGente = "", conectando = false, poseL = { tipo: 1, seq: 0, t: 0, cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: null, der: null };
    var mDesc = null, vDesc = null, qDesc = null, sDesc = null;
    // medida de las pruebas (P4): con window.__presenciaMide puesto ANTES de cargar, se apunta cada pose que llega
    // [identidad, reloj del emisor (bytes 4-7), llegada en performance.now()]; se lee y vacía con __presencia("llegadas")
    var medLlegadas = null;
    function iniciaRed() {
      if (window.__presenciaMide) medLlegadas = [];
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
        // la api da wss://… o una ruta del mismo origen (/rtc, que el Caddy pasa a LiveKit): se resuelve contra la página
        // (https → wss), así la misma configuración vale desde https://localhost y desde la IP de la red local
        await s.connect(new URL(t.url, location.href).href.replace(/^http/, "ws"), t.token, { autoSubscribe: false });
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
      var a = { k: h, id: id, info: mt, alias: mt.alias, vrm: mt.vrm, camisa: CAMISAS[mt.camisa], piel: PIELES[mt.piel], sombrero: mt.sombrero, iSom: mt.sombrero ? h : -1, iSomHueco: h, iMano: h * 2, out: BufferPose.salida(), ret: null, visto: false, cerca: false };
      a.o = SalaPose.entra(SP, id, mt); a.buf = a.o.buf;
      colorea(a); pintaNombre(h, mt.alias); oculta(a);
      porId[id] = a; claveGente = ""; cambio = true; return a;
    }
    function saleOtro(id) {
      var a = porId[id]; if (!a) return;
      if (avatarVRM) avatarVRM.sale(a);
      oculta(a); pintaNombre(a.k, ""); huecos.push(a.k); delete porId[id]; SalaPose.sale(SP, id); claveGente = "";
    }
    function recibeDatos(datos, p, tema) {
      if (!p || !p.identity || (yo && p.identity === yo.identidad)) return;
      if (tema === "pose") {
        var a = porId[p.identity] || entraOtro(p); if (!a) return;
        var llega = performance.now();
        if (SalaPose.recibe(SP, p.identity, datos, llega)) est.recibidos++; else est.viejos++;
        if (medLlegadas && datos.byteLength >= 8) { medLlegadas.push([p.identity, new DataView(datos.buffer, datos.byteOffset, datos.byteLength).getUint32(4, true), llega]); if (medLlegadas.length > 20000) medLlegadas.shift(); }
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
        o.izq = manoLocal("left"); o.der = manoLocal("right"); o.modo = PoseCodec.PIE;
      } else if (paseando) {
        s = suelo(pp.x, pp.y); q1.setFromAxisAngle(ejeY, -pp.ang);
        o.tipo = PoseCodec.ESCRITORIO; o.cab.p[0] = pp.x; o.cab.p[1] = s + ALTO_OJOS; o.cab.p[2] = -pp.y; o.cab.q[0] = q1.x; o.cab.q[1] = q1.y; o.cab.q[2] = q1.z; o.cab.q[3] = q1.w;
        o.izq = null; o.der = null; o.modo = enQuad ? PoseCodec.QUAD : enDron ? PoseCodec.DRON : PoseCodec.PIE;
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
        if (!SalaPose.seVe(SP, id, ahoraMs, bloqueados)) { if (a.visto) oculta(a); continue; }   // bloqueado o en vista aérea: no se dibuja
        a.buf = a.o.buf; coloca(a, ahoraMs, dt, SalaPose.retardo(a.o));   // (el búfer se rehace si vuelve tras un rato sin pose)
        if (a.o.cerca) nc++;
      }
      est.cerca = nc; est.n = Object.keys(porId).length;
      tGente += dt; if (tGente >= 0.5) { tGente = 0; pintaGente(ahoraMs); }
    }

    // ---- apartado Gente y chat (solo con ?presencia=red). Todo el texto que llega se pone con textContent: nunca como HTML
    function el(tag, props, hijos) { var e = document.createElement(tag); if (props) Object.keys(props).forEach(function (k) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
    // el chat es una ventana flotante que se mueve (34_movibles.js): barra con agarre ⠿, «Llevar a…» ⋯ y minimizar –; minimizada es una burbuja, también movible,
    // con los mensajes sin leer. La lista de Gente va en #ventanaGente si la página la trae (UX §6); si no, dentro del chat, como hasta ahora
    function conMov(fn) { if (typeof Movibles !== "undefined" && Movibles && Movibles.hazMovible) fn(); else setTimeout(function () { if (typeof Movibles !== "undefined" && Movibles && Movibles.hazMovible) fn(); }, 0); }   // 34_ se carga después de este módulo
    function montaPanel() {
      var boton = "font:inherit;color:inherit;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:4px 10px;min-height:44px;cursor:pointer";
      var mini = "font:inherit;color:inherit;background:none;border:0;min-width:44px;min-height:44px;cursor:pointer;padding:0;font-size:18px";
      var agarre = el("button", { type: "button", className: "agarre", style: mini + ";cursor:grab;color:rgba(255,255,255,0.7)", "aria-label": "Mover el chat: flechas del teclado (Mayús, más deprisa; Inicio, a su sitio)", title: "Arrastra para mover el chat" }, ["⠿"]);
      var titulo = el("strong", { style: "flex:1;font-size:14px" }, ["Chat"]);
      var llevar = el("button", { type: "button", style: mini, "aria-label": "Llevar el chat a…", title: "Llevar a…" }, ["⋯"]);
      var minimiza = el("button", { type: "button", style: mini, "aria-label": "Minimizar el chat", title: "Minimizar" }, ["–"]);
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
        sala.localParticipant.publishData(Chat.codifica(txt), { reliable: true, topic: "chat" }).then(function () { anadeMensaje("Tú", txt, true); }, function () { ponEstado("No se pudo mandar el mensaje.", false); });
      });
      (visor || document.body).appendChild(raiz); (visor || document.body).appendChild(burbuja);
      ui = { raiz: raiz, burbuja: burbuja, cont: cont, titulo: titulo, gTitulo: gTitulo, gSeccion: gSeccion, cuerpo: cuerpo, estado: estado, reentra: reentra, listaG: listaG, chat: chat, entrada: entrada, noLeidos: 0, ventana: "abierto", mov: null, movB: null };
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
    function pintaGente(ahoraMs) {
      if (!ui) return;
      var enMundo = !!(sala && poseLocal(ahoraMs)), g = SalaPose.gente(SP, ahoraMs), clave = (yo ? "1" : "0") + (enMundo ? "m" : "a") + g.map(function (x) { return x.id + x.estado + (bloqueados[x.id] ? "b" : ""); }).join("|");
      if (clave === claveGente) return; claveGente = clave;
      ui.gTitulo.textContent = "Gente (" + (g.length + (yo ? 1 : 0)) + ")";
      while (ui.listaG.firstChild) ui.listaG.removeChild(ui.listaG.firstChild);
      if (yo) ui.listaG.appendChild(el("li", { style: "margin:3px 0" }, [el("strong", {}, ["Tú · " + yo.info.alias]), " · " + (enMundo ? "en el olivar" : "en vista aérea (no te ven)")]));
      g.forEach(function (x) {
        var m = x.info || SalaPose.leeInfo(""), bl = !!bloqueados[x.id];
        var b = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer", "aria-pressed": bl ? "true" : "false", title: "Solo te afecta a ti; nadie se entera" }, [bl ? "Desbloquear" : "Bloquear"]);
        b.addEventListener("click", function () { if (bloqueados[x.id]) delete bloqueados[x.id]; else bloqueados[x.id] = true; claveGente = ""; pintaGente(performance.now()); });
        var hijos = [m.alias + " · " + m.rol + " · " + m.dispositivo + " · " + x.estado, b];
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
    function seVe(a, ahoraMs) { return !!a && a.visto && (variante !== "red" || SalaPose.seVe(SP, a.id, ahoraMs, bloqueados)); }
    function idDe(a) { return variante === "red" ? a.id : "sim" + a.k; }
    function busca(id) { if (variante === "red") return porId[id] || null; var m = /^sim(\d+)$/.exec(String(id)); return m ? V[Number(m[1])] || null : null; }
    function puntos() {   // [{id, alias, x este, y norte, modo}] de los que se dibujan ahora mismo
      puntosL.length = 0; if (!activo) return puntosL;
      var ahoraMs = performance.now(), l = variante === "red" ? Object.keys(porId).map(function (k) { return porId[k]; }) : V;
      for (var i = 0; i < l.length; i++) { var a = l[i]; if (!seVe(a, ahoraMs)) continue; var c = a.out.cab.p; puntosL.push({ id: idDe(a), alias: a.alias, x: c[0], y: -c[2], modo: a.out.modo | 0 }); }
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

    function actualiza(dt) {
      if (!activo) return;
      var t0 = performance.now(), ahoraMs = Math.round(t0), nc = 0, i;
      nVehQ = 0; nVehD = 0; tVeh += dt;
      if (variante === "red") actualizaRed(dt, t0);
      else {
        var ol = oyente();
        for (i = 0; i < V.length; i++) { anda(V[i], dt); emite(V[i], dt, ahoraMs, ol); }
        entrega(ahoraMs);
        for (i = 0; i < V.length; i++) { coloca(V[i], ahoraMs, dt, V[i].cerca ? RET_CERCA : RET_LEJOS); if (V[i].cerca) nc++; }   // [SUPUESTO] el receptor sabe si le llega a 10 o a 2 Hz por la distancia que él mismo ve
        est.cerca = nc;
      }
      if (avatarVRM) avatarVRM.actualiza(dt);
      [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
      if (mQuad) { mQuad.visible = nVehQ > 0; mQuad.instanceMatrix.needsUpdate = true; } if (mDron) { mDron.visible = nVehD > 0; mDron.instanceMatrix.needsUpdate = true; }
      est.quad = nVehQ; est.dron = nVehD;
      var ms = performance.now() - t0; msVentana = Math.max(msVentana, ms); est.ms = est.ms ? est.ms * 0.95 + ms * 0.05 : ms;
      tEst += dt;
      if (tEst >= 1) {
        est.bps = Math.round(bytesVentana / tEst); est.msMax = msVentana; est.retP95 = Math.round(p95(muestrasRet)); est.errP95 = Math.round(p95(muestrasErr) * 100) / 100;
        bytesVentana = 0; msVentana = 0; tEst = 0; if (muestrasRet.length > 4000) { muestrasRet = muestrasRet.slice(-2000); muestrasErr = muestrasErr.slice(-2000); }
      }
    }
    function estado() {
      var e = { activo: activo, variante: variante, n: est.n, quest: est.quest, cerca: est.cerca, enviados: est.enviados, recibidos: est.recibidos, perdidos: est.perdidos, viejos: est.viejos, bytes: est.bytes,
        bytesPorSegundo: est.bps, ms: Math.round(est.ms * 1000) / 1000, msMax: Math.round(est.msMax * 1000) / 1000, retardoP95ms: est.retP95, errorP95m: est.errP95, vistos: V.filter(function (a) { return a.visto; }).length,
        enQuad: est.quad || 0, conDron: est.dron || 0, vehiculos: !!(mQuad && mDron), idas: est.idas || 0, ultimaIda: est.ultimaIda || null, vrm: avatarVRM ? avatarVRM.estado() : null };
      if (variante === "red") { e.conectado = !!sala; e.identidad = yo ? yo.identidad : null; e.vistos = Object.keys(porId).filter(function (k) { return porId[k].visto; }).length; e.sinPlaza = est.sinPlaza || 0; e.enVistaAerea = !(sala && poseLocal(Math.round(performance.now()))); }
      return e;
    }
    function libera() {   // libera todo lo de la GPU (y, en red, sale de la sala y retira el apartado) y deja el módulo como sin la bandera
      if (!grupo) return;
      activo = false;
      if (avatarVRM) avatarVRM.libera();
      if (sala) { var s = sala; sala = null; s.disconnect(); }
      if (ui) { ui.raiz.remove(); ui.burbuja.remove(); ui.gSeccion.remove(); ui = null; }
      scene.remove(grupo); [mCuerpo, mCabeza, mSombrero, mManos, mNombres, mQuad, mDron].forEach(function (m) { if (m) m.dispose(); }); mQuad = null; mDron = null;
      geos.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); if (texNombres) texNombres.dispose();
      grupo = null; V = []; red = []; porId = Object.create(null); mensajes = [];
    }
    function texto() { return activo ? "presencia (" + variante + ") " + est.n + " · cerca " + est.cerca + " · " + est.bps + " B/s · JS " + est.ms.toFixed(2) + " ms" + (variante === "sim" ? " · retardo p95 " + est.retP95 + " ms" : sala ? "" : " · sin conexión") : ""; }
    if (variante === "sim") { inicia(); if (/[?&]chat=1(&|$)/.test(location.search)) montaPanel(); }   // &chat=1 (solo pruebas): la ventana del chat también en la simulación, sin sala
    else if (variante === "red") iniciaRed();
    function llegadas() { return { origen: performance.timeOrigin, l: medLlegadas ? medLlegadas.splice(0) : null }; }
    // para los avatares VRM (26b_avatares.js): las personas (todas, o solo las que se dibujan), tu id de avatar (de tus metadatos), recolorear el muñeco
    // lejano con los colores de su avatar y si ha entrado alguien desde la última vez que se preguntó
    var cambio = false;
    function vrmPersonas(todas) { var ahoraMs = performance.now(), l = variante === "red" ? Object.keys(porId).map(function (k) { return porId[k]; }) : V; return todas ? l : l.filter(function (a) { return seVe(a, ahoraMs); }); }
    function miVrm() { return yo && yo.info ? yo.info.vrm : null; }
    function recolorea(a, camisa, piel) { if (!mCuerpo) return; if (camisa != null) a.camisa = camisa; if (piel != null) a.piel = piel; colorea(a); }
    function cambiaron() { var c = cambio; cambio = false; return c; }
    window.__presenciaChat = function (txt) { anadeMensaje("Prueba", String(txt || "Hola"), false); };   // pruebas del chat movible (la ventana solo existe con ?presencia=red o &chat=1)
    return { activo: function () { return activo; }, actualiza: actualiza, estado: estado, libera: libera, texto: texto, llegadas: llegadas, puntos: puntos, irCon: irCon,
      vrmPersonas: vrmPersonas, miVrm: miVrm, recolorea: recolorea, cambiaron: cambiaron };
  })();
  // gancho de pruebas: estado; con "libera", soltar todo; con "llegadas", las poses apuntadas (P4); con "puntos", quién sale en el minimapa; con "ir" e id, ir con esa persona (I1)
  window.__presencia = function (accion, arg) {
    if (accion === "libera") Presencia.libera(); if (accion === "llegadas") return Presencia.llegadas();
    if (accion === "puntos") return Presencia.puntos().map(function (p) { return { id: p.id, alias: p.alias, x: p.x, y: p.y, modo: p.modo }; });
    if (accion === "ir") return Presencia.irCon(arg);
    return Presencia.estado();
  };
