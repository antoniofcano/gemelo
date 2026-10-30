// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02_mundo (suelo), 03_escena (renderer, scene, camera, exag), 12_paseo (paseando, persona, primera),
//   16_vida (enQuad, quad, enDron, dron), 26_presencia (Aspecto, Muneco, avatarVRM, Presencia), 29_vr (VRX)
// Nota: Sin presencia no crea nada; con ella, pide /avatares/catalogo.json solo si alguien lleva avatar (o con &vrm=1 en la simulación) e import("@pixiv/three-vrm") solo entonces. El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/avatares.test.js.
// ===============================================================================
  // ---------- avatares VRM (P7c, ADR-0020): los N más cercanos que caben en el presupuesto del aparato llevan su VRM del catálogo; el resto, el muñeco
  // instanciado de 26_presencia.js. Y, en tercera persona, tu paseante es tu avatar (decisión 76). Sin presencia (?presencia=sim|red) no crea nada.
  //  · Catálogo: /avatares/catalogo.json y /avatares/<fichero>?v=<sha256> (mismo origen, tras sesión; contratos/avatares.md). Se pide solo cuando alguien lleva un id de
  //    avatar (metadatos del participante, avatar.vrm) o, en la simulación, con &vrm=1. Si no está, si el id no está en él o el fichero no baja o no pasa
  //    su sha256: el muñeco, como siempre. @pixiv/three-vrm 3.5.5 y el GLTFLoader de three, con import() solo entonces.
  //  · Reparto (AvataresPuro.reparte, 2 Hz): los N más cercanos a la cámara de los que se ven y a menos de 40 m [SUPUESTO]; entra quien está en los N, sale
  //    quien cae del puesto N + 2 o pasa de 44 m, o quien deja sitio a uno un 10 % más cerca. N: escritorio 6, móvil 3, Quest 3 y con gafas según el escalón
  //    de los perfiles de VR de 29_vr.js (3/2/1/0); tu paseante, si se ve con su avatar, cuenta como uno.
  //  · Fundido: tramado de pantalla (como O1) de 0,6 s sobre el VRM; mientras dura, el muñeco sigue debajo; al acabar de entrar, el muñeco se oculta.
  //  · Animación (AvataresPuro.huesos): los ángulos de Muneco.avanza sobre los huesos humanoides normalizados (andar, quieto, agacharse, sentado en el
  //    quad, con el dron); la cabeza, con el giro de la pose; con manos de Quest, los brazos a las manos con un IK analítico de dos huesos; parpadeo al
  //    azar y mirada (VRMLookAt) hacia la cámara si está cerca y delante. Muelles (pelo, ropa) solo en escritorio y fuera de VR. Todo ilustrativo (regla 5).
  //  · Varias personas con el mismo avatar: three-vrm no clona un VRM (VRMUtils no trae clon): se vuelve a analizar desde el MISMO ArrayBuffer y la
  //    geometría y las texturas se toman de la primera copia viva (?vrmcomparte=no lo apaga, para medir); se sueltan con la última (deepDispose).
  //  · AV4 (ADR-0025, catálogo v2): el CUERPO de la receta (metadatos: avatar.cuerpo, pelo, vello, ropa…) es un VRM con todas sus piezas dentro; se enseñan las de la
  //    receta (lo oculto ni se dibuja ni se sube a la GPU), se tiñe por nombre de material con los colores de la persona (los del muñeco: Aspecto) y va a su tamaño
  //    de verdad × su altura. Los peques (ofrecer: false) no se dibujan (decisión 132). Con silla de ruedas, sentado como en el quad. Sin huesos de ojos: sin VRMLookAt.

  // [puro:inicio] — sin THREE ni DOM: pruebas/guardianes/avatares.test.js evalúa este trozo tal cual en Node
  var AvataresPuro = (function () {
    var CUPO = { escritorio: 6, movil: 3, quest: 3 }, CUPO_VR = [3, 2, 1, 0];
    var DMAX = 40, PUESTOS_EXTRA = 2, DIST_EXTRA = 1.1, MEJORA = 0.9;
    var BAJA = 1.25, CODO = 0.15, CODO_QUAD = 0.4, CODO_DRON = 0.9, RODILLA = 0.6, INCLINA = 0.35, CAB_YAW = 1.1, CAB_PITCH = 0.6;
    var ID = /^[a-z0-9-]{1,32}$/, FICHERO = /^[a-z0-9-]{1,32}\.vrm$/, SHA = /^[0-9a-f]{64}$/, HEX = /^#?([0-9a-fA-F]{6})$/, MALLA = /^pieza_[a-z0-9-]{1,32}$/;
    var TIPOS = ["pelo", "vello", "ropa", "accesorio"], EDADES = ["peque", "joven", "adulta", "mayor"], SOMBRERO = ["", "paja", "gorra"];
    // cuántos VRM a la vez: con gafas, según el escalón de los perfiles de VR (29_vr.js); si no, por aparato
    function cupo(disp, vr, nivelVR) {
      if (vr) { var n = nivelVR | 0; return CUPO_VR[Math.max(0, Math.min(CUPO_VR.length - 1, n))]; }
      return CUPO[disp] != null ? CUPO[disp] : CUPO.escritorio;
    }
    function color(v) {
      if (typeof v === "number" && v % 1 === 0 && v >= 0 && v <= 0xffffff) return v;
      var m = typeof v === "string" ? HEX.exec(v) : null; return m ? parseInt(m[1], 16) : null;
    }
    // catalogo.json (contratos/avatares.md): v1 { v: 1, avatares: [{ id, fichero, sha256, bytes, vrm_version, colores_muneco: {camisa, piel, sombrero} … }] } y, desde AV4 (ADR-0025),
    // v2 { v: 2, cuerpos: [{ id, edad, complexion, ofrecer, fichero, sha256, bytes, piezas: [ids], mirada }], piezas: [{ id, tipo, malla, cubre_ropa_base?, sombrero?, color? }],
    // paletas, avatares?: [los de v1] }. Es un DATO del servidor: lo que no cuadra (id, fichero, malla) se descarta; el resto de campos (licencia, atribución, paletas: el motor
    // tiñe con las suyas, que son las mismas) no los usa el motor. Los cuerpos sin `ofrecer` (peques, decisión 132) se leen pero no se dibujan. null si no hay nada válido
    function leeCatalogo(j) {
      if (!j || (j.v !== 1 && j.v !== 2)) return null;   // otra versión del contrato: como sin catálogo
      var l = Array.isArray(j.avatares) ? j.avatares : [], todos = [], porId = Object.create(null), cuerpos = [], piezas = Object.create(null), i;
      function base(e) {
        if (!e || typeof e !== "object" || !ID.test(e.id) || porId[e.id]) return null;
        var f = e.fichero == null ? e.id + ".vrm" : e.fichero; if (!FICHERO.test(f)) return null;
        return { id: e.id, nombre: typeof e.nombre === "string" ? e.nombre.slice(0, 40) : e.id, fichero: f, sha256: SHA.test(e.sha256) ? e.sha256 : null, bytes: typeof e.bytes === "number" && e.bytes > 0 ? e.bytes : null };
      }
      for (i = 0; i < l.length && todos.length < 64; i++) {
        var a = base(l[i]); if (!a) continue;
        var c = l[i].colores_muneco && typeof l[i].colores_muneco === "object" ? l[i].colores_muneco : {};
        a.camisa = color(c.camisa); a.piel = color(c.piel);
        todos.push(a); porId[a.id] = a;
      }
      if (j.v === 2) {
        var lp = Array.isArray(j.piezas) ? j.piezas : [], lc = Array.isArray(j.cuerpos) ? j.cuerpos : [];
        for (i = 0; i < lp.length && i < 64; i++) {
          var p = lp[i]; if (!p || typeof p !== "object" || !ID.test(p.id) || piezas[p.id] || TIPOS.indexOf(p.tipo) < 0 || !MALLA.test(p.malla)) continue;
          piezas[p.id] = { id: p.id, tipo: p.tipo, malla: p.malla, cubre: p.cubre_ropa_base === true, color: color(p.color), sombrero: SOMBRERO.indexOf(p.sombrero) > 0 ? SOMBRERO.indexOf(p.sombrero) : 0 };
        }
        for (i = 0; i < lc.length && cuerpos.length < 32; i++) {
          var b = base(lc[i]); if (!b || EDADES.indexOf(lc[i].edad) < 0) continue;
          b.cuerpo = true; b.edad = lc[i].edad; b.ofrecer = lc[i].ofrecer === true; b.mirada = lc[i].mirada === "huesos" || lc[i].mirada === "expresion" ? lc[i].mirada : "ninguna";
          b.piezas = (Array.isArray(lc[i].piezas) ? lc[i].piezas : []).filter(function (x) { return typeof x === "string" && !!piezas[x]; });
          cuerpos.push(b); porId[b.id] = b;
        }
      }
      return todos.length || cuerpos.length ? { todos: todos, porId: porId, cuerpos: cuerpos, piezas: piezas, ofrecidos: cuerpos.filter(function (b) { return b.ofrecer; }) } : null;
    }
    // qué VRM lleva una persona (AV4): el cuerpo de su receta si está en el catálogo y se ofrece; si no, su avatar cerrado (v1, avatar.vrm); si no, ninguno (el muñeco)
    function cualVrm(cat, receta, vrm) {
      if (!cat) return null;
      var c = receta && receta.cuerpo ? cat.porId[receta.cuerpo] : null;
      if (c && c.cuerpo && c.ofrecer) return c.id;
      var v = vrm ? cat.porId[vrm] : null;
      return v && !v.cuerpo ? v.id : null;
    }
    // qué mallas de piezas se ven con esa receta en ese cuerpo: { mallas: {pieza_x: true}, cubre: la ropa base no se dibuja, colorSombrero }. Una pieza que el cuerpo no trae,
    // o de otro tipo, no se pone. El sombrero sale del de siempre (avatar.sombrero: 0 ninguno, 1 paja, 2 gorra), el mismo del muñeco (C13); `acc`, el resto de accesorios
    function piezasDe(cat, c, receta, sombrero) {
      var out = { mallas: {}, cubre: false, colorSombrero: null }; if (!c || !c.cuerpo) return out;
      receta = receta || {};
      function ponPieza(id, tipo) {
        var p = id && c.piezas.indexOf(id) >= 0 ? cat.piezas[id] : null; if (!p || p.tipo !== tipo) return;
        out.mallas[p.malla] = true; if (p.cubre) out.cubre = true; if (p.sombrero && p.color !== null) out.colorSombrero = p.color;
      }
      ponPieza(receta.pelo, "pelo"); ponPieza(receta.vello, "vello"); ponPieza(receta.ropa, "ropa");
      (receta.acc || []).forEach(function (x) { var p = cat.piezas[x]; if (p && !p.sombrero) ponPieza(x, "accesorio"); });
      if (sombrero > 0) for (var i = 0; i < c.piezas.length; i++) { var q = cat.piezas[c.piezas[i]]; if (q.sombrero === sombrero) { ponPieza(q.id, "accesorio"); break; } }
      return out;
    }
    // el color de cada material por su nombre (decisión 128: se tiñe en el motor, sin texturas). col = { piel, arriba, abajo, pelo } (0xrrggbb) de la persona; null = como viene
    function colorMaterial(nombre, col, colorSombrero) {
      var n = String(nombre || "").replace(/\.\d+$/, "");
      return n === "piel" ? col.piel : n === "ropa_base" ? col.arriba : n === "ropa_abajo" ? col.abajo : n === "pelo" ? col.pelo : n === "sombrero" ? colorSombrero : null;
    }
    // quién lleva VRM: tengo = {id: true} los de ahora; cand = [{id, d}] los que podrían (se ven, tienen avatar del catálogo y no ha fallado su fichero);
    // n = plazas. Devuelve el conjunto nuevo (nunca más de n). Histéresis: quien ya lo lleva sigue mientras esté en los n + 2 primeros y a menos de 44 m;
    // uno nuevo entra si está en los n primeros y a menos de 40 m, si hay plaza o si está un 10 % más cerca que el más lejano de los que lo llevan
    function reparte(tengo, cand, n) {
      var c = cand.slice().sort(function (a, b) { return a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }), nuevo = {}, dentro = [], i, x;
      if (n <= 0) return nuevo;
      for (i = 0; i < c.length; i++) { x = c[i]; if (tengo[x.id] && i + 1 < n + PUESTOS_EXTRA && x.d < DMAX * DIST_EXTRA && dentro.length < n) { nuevo[x.id] = true; dentro.push(x); } }
      for (i = 0; i < c.length && i < n; i++) {
        x = c[i]; if (nuevo[x.id] || !(x.d < DMAX)) continue;
        if (dentro.length < n) { nuevo[x.id] = true; dentro.push(x); continue; }
        var lejos = 0; for (var j = 1; j < dentro.length; j++) if (dentro[j].d > dentro[lejos].d) lejos = j;
        if (x.d < dentro[lejos].d * MEJORA) { delete nuevo[dentro[lejos].id]; dentro[lejos] = x; nuevo[x.id] = true; }
      }
      return nuevo;
    }
    function ang(d) { return Math.atan2(Math.sin(d), Math.cos(d)); }
    function lim(v, m) { return Math.max(-m, Math.min(m, v)); }
    // los ángulos de Muneco.avanza (o del paseante local: los mismos campos) sobre los huesos humanoides NORMALIZADOS de un VRM 1.0 (postura en T, mirando
    // a +Z: un ángulo x negativo lleva la pierna o el brazo hacia delante). mu = {piernaI, piernaD, brazoI, brazoD, agacho, vehiculo}; opc = {L: largo de
    // la pierna en m (altura de la cadera), v0: VRM 0.x (sus huesos normalizados van al revés en x y z)}; cab = {yaw, pitch} relativos al cuerpo o null.
    // Devuelve out[hueso] = [x, y, z] (euler XYZ) y out.baja = cuánto baja la cadera (m)
    function huesos(mu, opc, cab, out) {
      out = out || {}; opc = opc || {};
      var veh = mu.vehiculo | 0, L = opc.L > 0.3 ? opc.L : 0.9, ag = Math.max(0, Math.min(L * 0.8, mu.agacho || 0));
      var al = ag > 0 ? Math.acos(1 - ag / L) : 0;   // agacharse: muslo adelante al y espinilla atrás 2·al; la cadera baja L·(1 − cos al) = ag
      var pI = mu.piernaI || 0, pD = mu.piernaD || 0;
      if (veh === 1 || veh === 3) {   // sentado en el quad o en la silla de ruedas (AV4): muslos adelante (1,15 rad) y espinillas en vertical
        out.leftUpperLeg = [-pI, 0, 0]; out.rightUpperLeg = [-pD, 0, 0]; out.leftLowerLeg = [pI, 0, 0]; out.rightLowerLeg = [pD, 0, 0];
      } else {
        out.leftUpperLeg = [-pI - al, 0, 0]; out.rightUpperLeg = [-pD - al, 0, 0];
        out.leftLowerLeg = [2 * al + RODILLA * Math.max(0, -pI), 0, 0]; out.rightLowerLeg = [2 * al + RODILLA * Math.max(0, -pD), 0, 0];   // la rodilla se dobla al ir atrás (ilustrativo)
      }
      var codo = veh === 1 || veh === 3 ? CODO_QUAD : veh === 2 ? CODO_DRON : CODO;
      out.leftUpperArm = [-(mu.brazoI || 0), 0, -BAJA]; out.rightUpperArm = [-(mu.brazoD || 0), 0, BAJA];   // brazos abajo desde la T, y el balanceo
      out.leftLowerArm = [0, -codo, 0]; out.rightLowerArm = [0, codo, 0];
      out.spine = [al * INCLINA, 0, 0]; out.chest = [0, 0, 0];
      var y = cab ? lim(ang(cab.yaw), CAB_YAW) : 0, p = cab ? lim(cab.pitch, CAB_PITCH) : 0;   // mirar arriba (pitch > 0) es x negativo
      out.neck = [-p * 0.4, y * 0.4, 0]; out.head = [-p * 0.6, y * 0.6, 0];
      out.baja = ag;
      if (opc.v0) for (var k in out) if (Array.isArray(out[k])) { out[k][0] = -out[k][0]; out[k][2] = -out[k][2]; }
      return out;
    }
    // IK analítico de dos huesos (hombro S, destino T, largos a y b, punto de polo P hacia el que se dobla el codo): devuelve {E: codo, H: muñeca}
    // (si T no se alcanza, el brazo estirado hacia T; si está demasiado cerca, a la distancia mínima)
    function ik(S, T, a, b, P) {
      var d = [T[0] - S[0], T[1] - S[1], T[2] - S[2]], l = Math.hypot(d[0], d[1], d[2]), u = l > 1e-6 ? [d[0] / l, d[1] / l, d[2] / l] : [0, -1, 0];   // la mano en el hombro: hacia abajo
      var L = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, l));
      var x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
      var q = [P[0] - S[0], P[1] - S[1], P[2] - S[2]], qu = q[0] * u[0] + q[1] * u[1] + q[2] * u[2], n = [q[0] - u[0] * qu, q[1] - u[1] * qu, q[2] - u[2] * qu], nl = Math.hypot(n[0], n[1], n[2]);
      if (nl < 1e-6) { n = Math.abs(u[1]) < 0.9 ? [0, -1, 0] : [1, 0, 0]; qu = n[0] * u[0] + n[1] * u[1] + n[2] * u[2]; n = [n[0] - u[0] * qu, n[1] - u[1] * qu, n[2] - u[2] * qu]; nl = Math.hypot(n[0], n[1], n[2]); }
      n = [n[0] / nl, n[1] / nl, n[2] / nl];
      return { E: [S[0] + u[0] * x + n[0] * h, S[1] + u[1] * x + n[1] * h, S[2] + u[2] * x + n[2] * h], H: [S[0] + u[0] * L, S[1] + u[1] * L, S[2] + u[2] * L] };
    }
    // parpadeo: cada 2-6 s al azar [SUPUESTO: valores a ajustar a ojo] un cierre de 0,15 s; st = {t, prox}; r() en [0, 1); devuelve 0 (abierto) a 1 (cerrado)
    var DUR = 0.15;
    function parpadeo(st, dt, r) {
      if (st.prox == null) { st.t = 0; st.prox = 2 + r() * 4; }
      st.t += dt;
      if (st.t < st.prox) return 0;
      var f = (st.t - st.prox) / DUR; if (f >= 1) { st.t = 0; st.prox = 2 + r() * 4; return 0; }
      return 1 - Math.abs(f * 2 - 1);
    }
    return { CUPO: CUPO, CUPO_VR: CUPO_VR, DMAX: DMAX, BAJA: BAJA, cupo: cupo, leeCatalogo: leeCatalogo, cualVrm: cualVrm, piezasDe: piezasDe, colorMaterial: colorMaterial, reparte: reparte, huesos: huesos, ik: ik, parpadeo: parpadeo };
  })();
  // [puro:fin]

  var Avatares = (function () {
    if (!Presencia.activo()) return null;
    var BASE = "/avatares/", FUNDIDO = 0.6, REPOSO = 5, TICK = 0.5, CERCA_MIRA = 8, COS_MIRA = Math.cos(70 * Math.PI / 180);
    var simVrm = /[?&]vrm=1\b/.test(location.search), comparte = !/[?&]vrmcomparte=no\b/.test(location.search), sinPropio = /[?&]yo=no\b/.test(location.search);
    var ua = navigator.userAgent || "", disp = /OculusBrowser|Quest/i.test(ua) ? "quest" : /Mobi|Android|iPhone|iPad/i.test(ua) ? "movil" : "escritorio";
    var LIB = null, pideLib = null, cat = null, pideCat = null, bufs = Object.create(null), vivos = Object.create(null), falla = Object.create(null);
    var regs = new Map(), mio = null, gVrm = null, tTic = TICK, asignado = false, semilla = 7, est = { catalogo: -1, cargas: 0, fallos: 0, instancias: 0, msParse: 0 };
    var v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e1 = new THREE.Euler(), angs = {};
    function azar() { semilla = (semilla + 0x6d2b79f5) | 0; var t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    function avisa(t, e) { if (typeof console !== "undefined") console.warn("avatares: " + t + (e ? " (" + (e && e.message ? e.message : e) + ")" : "")); }

    // ---- el catálogo, la librería y el fichero de cada avatar (una vez por id: el ArrayBuffer se guarda)
    function catalogo() {
      if (pideCat) return pideCat;
      pideCat = fetch(BASE + "catalogo.json", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { cat = AvataresPuro.leeCatalogo(j); }, function () { cat = null; })
        .then(function () { est.catalogo = cat ? cat.todos.length : 0; alCatalogo(); return cat; });
      return pideCat;
    }
    function lib() {
      return pideLib || (pideLib = Promise.all([import("@pixiv/three-vrm"), import("three/addons/loaders/GLTFLoader.js")]).then(function (m) { LIB = { V: m[0], GLTFLoader: m[1].GLTFLoader }; return LIB; }));
    }
    function hex(b) { var s = "", u = new Uint8Array(b); for (var i = 0; i < u.length; i++) s += (u[i] < 16 ? "0" : "") + u[i].toString(16); return s; }
    function bufer(e) {
      // ?v=<sha256>: la URL cambia con el contenido, así el «immutable» de Caddy es seguro (contratos/avatares.md §1)
      if (!bufs[e.id]) bufs[e.id] = fetch(BASE + e.fichero + (e.sha256 ? "?v=" + e.sha256 : ""), { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
        .then(function (b) {
          if (e.bytes && b.byteLength !== e.bytes) throw new Error("tamaño distinto del catálogo");
          // sin crypto.subtle (página sin contexto seguro) no se puede comprobar: el fichero es del mismo origen y tras sesión, y se acepta
          if (!e.sha256 || !(window.crypto && crypto.subtle)) return b;
          return crypto.subtle.digest("SHA-256", b).then(function (h) { if (hex(h) !== e.sha256) throw new Error("sha256 distinto del catálogo"); return b; });
        });
      return bufs[e.id];
    }
    // ---- una copia del avatar: analizada desde el búfer, con la geometría y las texturas de otra copia viva del mismo id (si la hay)
    function instancia(id) {
      var e = cat && cat.porId[id]; if (!e) return Promise.reject(new Error("no está en el catálogo"));
      var t0 = 0;
      return Promise.all([lib(), bufer(e)]).then(function (r) {
        var l = new LIB.GLTFLoader(); l.register(function (p) { return new LIB.V.VRMLoaderPlugin(p); });
        t0 = performance.now(); return l.parseAsync(r[1], "");
      }).then(function (g) {
        var vrm = g.userData.vrm; if (!vrm || !vrm.humanoid) throw new Error("no es un VRM");
        LIB.V.VRMUtils.removeUnnecessaryVertices(g.scene); LIB.V.VRMUtils.combineSkeletons(g.scene); LIB.V.VRMUtils.rotateVRM0(vrm);
        var base = comparte && vivos[id] && vivos[id][0], compartida = base ? comparteCon(base.vrm.scene, vrm.scene) : false;
        var inst = monta(e, vrm, compartida); (vivos[id] = vivos[id] || []).push(inst); est.instancias++; est.cargas++;
        est.msParse = Math.round((performance.now() - t0) * 10) / 10;
        return inst;
      });
    }
    function mallas(o) { var l = []; o.traverse(function (x) { if (x.isMesh) l.push(x); }); return l; }
    function comparteCon(de, a) {
      var A = mallas(de), B = mallas(a); if (A.length !== B.length) return false;
      for (var i = 0; i < A.length; i++) {
        if (B[i].geometry !== A[i].geometry) { B[i].geometry.dispose(); B[i].geometry = A[i].geometry; }
        var mA = [].concat(A[i].material), mB = [].concat(B[i].material);
        for (var j = 0; j < mB.length && j < mA.length; j++) texturas(mA[j], mB[j]);
      }
      return true;
    }
    function texturas(ma, mb) {   // propiedades propias (MeshStandardMaterial: map…) y uniformes (MToon guarda sus texturas en uniforms)
      Object.keys(mb).forEach(function (k) { var t = mb[k], s = ma[k]; if (t && t.isTexture && s && s.isTexture && t !== s) { t.dispose(); mb[k] = s; } });
      if (mb.uniforms && ma.uniforms) Object.keys(mb.uniforms).forEach(function (k) { var u = mb.uniforms[k], w = ma.uniforms[k]; if (u && u.value && u.value.isTexture && w && w.value && w.value.isTexture && u.value !== w.value) { u.value.dispose(); u.value = w.value; } });
    }
    function parcheFundido(m, uni) {   // tramado de pantalla (ruido de gradiente entrelazado, como O1): descarta el fragmento si su ruido ≥ uFunVrm
      if (m.userData.vrmFundido) return;   // un material compartido por varias mallas (o el del contorno de MToon) se parchea una vez
      m.userData.vrmFundido = true;
      var antes = m.onBeforeCompile, clave = m.customProgramCacheKey;
      m.onBeforeCompile = function (sh, r) {
        if (antes) antes.call(this, sh, r);
        sh.uniforms.uFunVrm = uni;
        if (sh.fragmentShader.indexOf("uFunVrm") < 0) sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform float uFunVrm;\nfloat vrm_ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }\nvoid main() {\n if (vrm_ign(gl_FragCoord.xy) >= uFunVrm) discard;");
      };
      m.customProgramCacheKey = function () { return (clave ? clave.call(this) : "") + "|vrm-fundido"; };
      m.needsUpdate = true;
    }
    function monta(e, vrm, compartida) {
      var id = e.id, raiz = new THREE.Group(), giro = new THREE.Group(), h = {}, uni = { value: 0 };
      raiz.name = "vrm:" + id; giro.rotation.y = Math.PI;   // el VRM está vuelto hacia +Z; el muñeco y los ejes del motor, a −Z
      vrm.scene.updateMatrixWorld(true);
      ["hips", "spine", "chest", "neck", "head", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand", "leftUpperLeg", "leftLowerLeg", "rightUpperLeg", "rightLowerLeg"].forEach(function (n) { h[n] = vrm.humanoid.getNormalizedBoneNode(n); });
      var yCab = h.head ? h.head.getWorldPosition(v1).y : 1.5, yCad = h.hips ? h.hips.getWorldPosition(v1).y : 0.9;
      // los avatares cerrados (v1): la base de la cabeza a 1,5 m, los ojos a ~1,6 m, la ALTURA del muñeco y de la pose [SUPUESTO: 10 cm de la base a los ojos]. Los cuerpos del creador
      // (v2) van a su tamaño de verdad (MPFB, en metros: cada edad con su altura, criterio C1) por la altura de la receta (viste)
      var s = e.cuerpo ? 1 : 1.5 / Math.max(0.3, yCab);
      giro.scale.setScalar(s); giro.add(vrm.scene); raiz.add(giro);
      vrm.scene.traverse(function (o) { if (o.isMesh) { o.frustumCulled = false; [].concat(o.material).forEach(function (m) { parcheFundido(m, uni); }); } });   // el volumen de una malla con esqueleto es el de reposo
      raiz.visible = false;
      return { id: id, vrm: vrm, raiz: raiz, giro: giro, h: h, s: s, yCad: yCad, L: yCad * s, cadera0: h.hips ? h.hips.position.y : 0, v0: !!(vrm.meta && vrm.meta.metaVersion === "0"), uni: uni, blink: {}, compartida: compartida,
        cuerpo: !!e.cuerpo, conMirada: !e.cuerpo || e.mirada !== "ninguna" };
    }
    // AV4 (ADR-0025): un cuerpo del creador con lo de la persona: enseña las piezas de su receta (las demás no se dibujan ni se suben a la GPU), tiñe por nombre de material
    // (piel, ropa_base, ropa_abajo, pelo, sombrero) con SUS colores (los mismos del muñeco: Aspecto) y lo escala por su altura. v = { receta, sombrero, piel, camisa, pantalon, pelo, fa }
    var mallasDe = null;
    function viste(inst, v) {
      var e = cat && cat.porId[inst.id]; if (!e || !e.cuerpo || !v) return;
      if (!mallasDe) { mallasDe = Object.create(null); for (var k in cat.piezas) mallasDe[cat.piezas[k].malla] = true; }
      var pz = AvataresPuro.piezasDe(cat, e, v.receta, v.sombrero), col = { piel: v.piel, arriba: v.camisa, abajo: v.pantalon, pelo: v.pelo }, raiz = inst.vrm.scene;
      raiz.traverse(function (o) {
        // por el nombre ORIGINAL del nodo (GLTFLoader lo deja en userData.name; el de three puede llevar «_1» si la malla se llama igual)
        var pieza = null; for (var p = o; p && p !== raiz; p = p.parent) { var nm = p.userData && p.userData.name; if (nm && mallasDe[nm]) { pieza = p; break; } }
        if (pieza === o) o.visible = !!pz.mallas[o.userData.name];
        if (!o.isMesh) return;
        [].concat(o.material).forEach(function (m) {
          var c = AvataresPuro.colorMaterial(m.name, col, pz.colorSombrero); if (c != null && m.color) m.color.setHex(c);
          if (!pieza && /^ropa_/.test(m.name)) o.visible = !pz.cubre;   // con la ropa de faena, la ropa base del cuerpo (que va debajo) no se dibuja
        });
      });
      var s = v.fa || 1; inst.giro.scale.setScalar(s); inst.s = s; inst.L = inst.yCad * s;
    }
    function vestimenta(a) { return { receta: a.receta, sombrero: a.sombrero, piel: a.piel, camisa: a.camisa, pantalon: a.pantalon, pelo: a.pelo, fa: a.fa }; }
    function clave(a) { return AvataresPuro.cualVrm(cat, a.receta, a.vrm); }
    function sueltaInst(inst) {
      if (inst.raiz.parent) inst.raiz.parent.remove(inst.raiz);
      var l = vivos[inst.id] || [], i = l.indexOf(inst); if (i >= 0) l.splice(i, 1);
      est.instancias--;
      if (!comparte || !l.length) { LIB.V.VRMUtils.deepDispose(inst.vrm.scene); delete vivos[inst.id]; return; }
      // quedan copias que usan su geometría y sus texturas: solo lo propio (materiales y esqueletos)
      inst.vrm.scene.traverse(function (o) { if (o.isMesh) [].concat(o.material).forEach(function (m) { m.dispose(); }); if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
    }

    // ---- poner un avatar: posición, giro, huesos, manos, mirada y parpadeo
    function anima(inst, mu, cab, dt, manos, mirar) {
      var V0 = inst.v0, a = AvataresPuro.huesos(mu, { L: inst.L, v0: V0 }, cab, angs), h = inst.h;
      for (var n in h) { var b = h[n], r = a[n]; if (b && r) b.rotation.set(r[0], r[1], r[2]); }
      if (h.hips) h.hips.position.y = inst.cadera0 - a.baja / inst.s;
      inst.raiz.updateMatrixWorld(true);
      if (manos) { if (manos.izq) brazo(inst, "left", manos.izq, mu.yaw); if (manos.der) brazo(inst, "right", manos.der, mu.yaw); }
      var vrm = inst.vrm; vrm.humanoid.update();
      if (vrm.lookAt && inst.conMirada) {   // los cuerpos del creador no tienen huesos de ojos (mirada «ninguna»): la mirada va con la cabeza
        var hd = vrm.humanoid.getRawBoneNode("head");
        if (hd && mirar) { hd.updateWorldMatrix(true, false); hd.getWorldPosition(v1); v2.copy(camera.position).sub(v1); var d = v2.length(); q1.setFromAxisAngle(v3.set(0, 1, 0), mu.yaw); v3.set(0, 0, -1).applyQuaternion(q1); mirar = d < CERCA_MIRA && v2.dot(v3) > d * COS_MIRA; }
        if (mirar) vrm.lookAt.lookAt(camera.position); else { vrm.lookAt.yaw = 0; vrm.lookAt.pitch = 0; }
        vrm.lookAt.update(dt);
      }
      if (vrm.expressionManager) { vrm.expressionManager.setValue("blink", AvataresPuro.parpadeo(inst.blink, dt, azar)); vrm.expressionManager.update(); }
      if (vrm.springBoneManager && disp === "escritorio" && !VRX.on) vrm.springBoneManager.update(dt);   // muelles: solo en escritorio y fuera de VR [SUPUESTO hasta medir en Quest]
      if (vrm.nodeConstraintManager) vrm.nodeConstraintManager.update();
    }
    // el brazo a la mano de la pose (Quest): IK analítico de dos huesos sobre los huesos normalizados. No CCDIKSolver (addons de three): ese trabaja sobre
    // los huesos de una SkinnedMesh por índice, y aquí se mueven los normalizados, que no son huesos de ninguna malla; con dos huesos la solución es cerrada
    var S = [0, 0, 0], T = [0, 0, 0], P = [0, 0, 0];
    function brazo(inst, lado, mano, yaw) {
      var ua = inst.h[lado + "UpperArm"], la = inst.h[lado + "LowerArm"], ha = inst.h[lado + "Hand"]; if (!ua || !la || !ha) return;
      ua.getWorldPosition(v1); S[0] = v1.x; S[1] = v1.y; S[2] = v1.z; T[0] = mano.x; T[1] = mano.y; T[2] = mano.z;
      var lat = lado === "left" ? -1 : 1, rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // derecha y frente del cuerpo (−Z girado)
      P[0] = S[0] + lat * rx * 0.3 - fx * 0.2; P[1] = S[1] - 0.5; P[2] = S[2] + lat * rz * 0.3 - fz * 0.2;   // el codo, abajo, afuera y algo atrás
      var r = AvataresPuro.ik(S, T, la.position.length() * inst.s, ha.position.length() * inst.s, P);
      apunta(ua, la.position, v2.set(r.E[0] - S[0], r.E[1] - S[1], r.E[2] - S[2]));
      ua.updateMatrixWorld(true);
      apunta(la, ha.position, v2.set(r.H[0] - r.E[0], r.H[1] - r.E[1], r.H[2] - r.E[2]));
    }
    function apunta(b, hijo, dirMundo) {   // gira b para que su hijo (en reposo, b sin giro: los normalizados no tienen giro en reposo) quede hacia dirMundo
      b.parent.getWorldQuaternion(q2).invert(); dirMundo.applyQuaternion(q2).normalize();
      b.quaternion.setFromUnitVectors(v3.copy(hijo).normalize(), dirMundo);
    }

    // ---- los demás: quién lleva VRM, su descarga, el fundido y el reposo antes de soltar
    function pide(a) {
      var id = clave(a), r = { a: a, id: id, inst: null, estado: "cargando", k: 0, dir: 1, tRep: 0 };
      regs.set(a, r);
      instancia(id).then(function (inst) {
        if (regs.get(a) !== r || !gVrm) { sueltaInst(inst); return; }
        viste(inst, vestimenta(a));
        r.inst = inst; gVrm.add(inst.raiz);
        var c = renderer.compileAsync ? renderer.compileAsync(inst.raiz, camera, scene) : Promise.resolve();   // que el primer fotograma no compile el MToon
        inst.raiz.visible = false;
        return c.then(function () { if (regs.get(a) === r) r.estado = "preparado"; });
      }).catch(function (e) {
        falla[id] = true; est.fallos++; avisa("sin el avatar " + id + ", el muñeco", e);
        if (regs.get(a) === r) regs.delete(a);
      });
    }
    function quitaReg(a) { var r = regs.get(a); if (!r) return; regs.delete(a); if (r.inst) sueltaInst(r.inst); }
    function candidatos() {
      var l = [], ps = Presencia.vrmPersonas();
      for (var i = 0; i < ps.length; i++) {
        var a = ps[i], id = clave(a); if (!id || falla[id]) continue;
        var c = a.out.cab.p; l.push({ id: a, d: Math.hypot(c[0] - camera.position.x, c[1] * exag - camera.position.y, c[2] - camera.position.z) });
      }
      return l;
    }
    function propioVisible() { return !!(mio && mio.inst && persona && persona.visible && paseando && !primera && !VRX.on); }
    function cupo() { return AvataresPuro.cupo(disp, VRX.on, VRX.nivel); }
    function tic() {
      if (!cat) return;
      var n = Math.max(0, cupo() - (propioVisible() ? 1 : 0)), tengo = new Map(), cand = candidatos(), ids = [], i;
      // reparte trabaja con ids de texto: el índice de cada candidato
      var tObj = {}; for (i = 0; i < cand.length; i++) { var r = regs.get(cand[i].id); if (r && r.dir > 0) tObj["c" + i] = true; ids.push({ id: "c" + i, d: cand[i].d }); tengo.set("c" + i, cand[i].id); }
      var nuevo = AvataresPuro.reparte(tObj, ids, n), quedan = new Set();
      for (var k in nuevo) quedan.add(tengo.get(k));
      regs.forEach(function (r, a) { if (!quedan.has(a) && r.dir > 0) r.dir = -1; });
      quedan.forEach(function (a) { var r = regs.get(a); if (!r) pide(a); else if (r.dir < 0) { r.dir = 1; r.tRep = 0; } });
    }
    // de 26_presencia.js, por cada persona que se dibuja: devuelve true si su VRM ya se ve entero (entonces el muñeco se oculta)
    function coloca(a, mu, o, yawCab, cx, cz, dt) {
      var r = regs.get(a); if (!r || !r.inst || r.estado === "cargando" || r.estado === "reposo") return false;
      var inst = r.inst, R = inst.raiz;
      R.position.set(cx, mu.yPies, cz); R.rotation.set(0, mu.yaw, 0); R.visible = r.k > 0;
      if (!R.visible) return false;
      q1.set(o.cab.q[0], o.cab.q[1], o.cab.q[2], o.cab.q[3]); v1.set(0, 0, -1).applyQuaternion(q1);
      var cab = { yaw: yawCab - mu.yaw, pitch: Math.asin(Math.max(-1, Math.min(1, v1.y))) };
      var manos = null;
      if (o.hayIzq || o.hayDer) { manos = manosL; manos.izq = o.hayIzq ? mano(o.izq, mI) : null; manos.der = o.hayDer ? mano(o.der, mD) : null; }
      anima(inst, mu, cab, dt, manos, true);
      return r.k >= 1 && r.dir > 0;
    }
    var manosL = { izq: null, der: null }, mI = new THREE.Vector3(), mD = new THREE.Vector3();
    function mano(h, out) { var sh = suelo(h.p[0], -h.p[2]); return out.set(h.p[0], sh * exag + (h.p[1] - sh), h.p[2]); }   // como las manos del muñeco: a su altura sobre ESTE suelo
    function oculta(a) { var r = regs.get(a); if (r && r.inst) r.inst.raiz.visible = false; }

    // ---- tu paseante (decisión 76): en tercera persona, tu avatar en lugar del muñeco naranja (12_paseo.js); en primera persona y en VR, nada
    var cuerpoNaranja = null;
    // tu avatar: el de tus metadatos (receta o vrm); en la simulación con &vrm=1, el primer cuerpo ofrecido (con pelo corto) o el primer avatar cerrado
    var miSim = null;
    function miAvatar() {
      var m = Presencia.miAvatar(); if (m) return m;
      if (!simVrm || sinPropio || !cat) return null;
      if (!miSim) {
        var c = cat.ofrecidos[0], pelo = c ? c.piezas.filter(function (x) { return cat.piezas[x].tipo === "pelo"; })[0] : null;
        miSim = { vrm: c ? null : (cat.todos[0] || {}).id, receta: c ? { cuerpo: c.id, pelo: pelo } : null, sombrero: 0, piel: Aspecto.PIELES[4], camisa: 0xd9822b, pantalon: Aspecto.PANTALON, pelo: Aspecto.PELO[1], fa: 1 };
      }
      return miSim;
    }
    function miId() { var m = miAvatar(); return m ? clave(m) : null; }
    function propio(dt) {
      var id = cat ? miId() : null;
      if (mio && mio.id !== id) { quitaPropio(); }
      if (!id || falla[id] || !persona) return;
      if (!mio) {
        mio = { id: id, inst: null, k: 0, preparado: false };
        var m = mio;
        instancia(id).then(function (inst) {
          if (mio !== m) { sueltaInst(inst); return; }
          viste(inst, miAvatar());
          m.inst = inst; persona.add(inst.raiz); inst.raiz.rotation.set(0, 0, 0);   // hijo del paseante: su posición, su giro y su visibilidad (primera persona, VR)
          return (renderer.compileAsync ? renderer.compileAsync(inst.raiz, camera, scene) : Promise.resolve()).then(function () { if (mio === m) m.preparado = true; });
        }).catch(function (e) { falla[id] = true; est.fallos++; avisa("sin tu avatar " + id + ", el muñeco naranja", e); if (mio === m) mio = null; });
      }
      if (!mio.preparado || !persona.visible) return;
      if (!cuerpoNaranja) cuerpoNaranja = persona.children.filter(function (c) { return c !== mio.inst.raiz; });
      mio.k = Math.min(1, mio.k + dt / FUNDIDO); mio.inst.uni.value = mio.k; mio.inst.raiz.visible = true;
      var u = persona.userData, mu = { piernaI: u.pi.rotation.x, piernaD: u.pd.rotation.x, brazoI: u.bi.rotation.x, brazoD: u.bd.rotation.x, agacho: 0, vehiculo: enQuad ? 1 : enDron ? 2 : 0, yaw: -pp.ang };
      anima(mio.inst, mu, null, dt, null, false);
      var tapa = mio.k >= 1; cuerpoNaranja.forEach(function (c) { c.visible = !tapa; });
    }
    function quitaPropio() {
      if (cuerpoNaranja) cuerpoNaranja.forEach(function (c) { c.visible = true; }); cuerpoNaranja = null;
      if (mio && mio.inst) sueltaInst(mio.inst); mio = null;
    }

    // ---- cada fotograma (al final de Presencia.actualiza)
    function alCatalogo() {
      if (!cat) return;
      var ps = Presencia.vrmPersonas(true);
      if (simVrm && !asignado) {   // simulación: tres de cada cuatro llevan un avatar del catálogo (por turno); el cuarto, sin él (el muñeco de siempre)
        asignado = true;
        for (var i = 0; i < ps.length; i++) {
          var k = ps[i].k;
          if (k % 4 === 3) { ps[i].vrm = null; continue; }
          if (cat.ofrecidos.length) { ps[i].receta = recetaSim(k, ps[i].receta); ps[i].pelo = Aspecto.PELO[ps[i].receta.peloColor]; } else ps[i].vrm = cat.todos[k % cat.todos.length].id;
        }
      }
      for (var j = 0; j < ps.length; j++) { var e = cat.porId[clave(ps[j]) || ""]; if (e && !e.cuerpo) Presencia.recolorea(ps[j], e.camisa, e.piel); }   // de lejos, el muñeco con los colores de su avatar cerrado (los del creador ya son los suyos)
    }
    // simulación con el catálogo v2: una receta por persona, repartida por su número (cuerpo, pelo, color, vello cada tres, ropa de faena cada dos); el resto del aspecto, el suyo
    function recetaSim(k, r) {
      var c = cat.ofrecidos[k % cat.ofrecidos.length], de = function (t) { return c.piezas.filter(function (x) { return cat.piezas[x].tipo === t; }); };
      var pelos = de("pelo"), vellos = de("vello"), ropas = de("ropa"), o = {};
      for (var x in r || {}) o[x] = r[x];
      o.cuerpo = c.id; o.pelo = pelos.length ? pelos[(k * 7) % pelos.length] : null; o.peloColor = k % Aspecto.PELO.length;
      o.vello = vellos.length && k % 3 === 0 ? vellos[k % vellos.length] : null; o.ropa = ropas.length && k % 2 === 0 ? ropas[0] : null;
      return o;
    }
    function actualiza(dt) {
      if (!gVrm) return;
      if (!pideCat) {   // el catálogo solo se pide si alguien lleva avatar (o con &vrm=1)
        var mm = Presencia.miAvatar(), hay = simVrm || !!(mm && (mm.vrm || (mm.receta && mm.receta.cuerpo))), ps = hay ? null : Presencia.vrmPersonas(true);
        if (ps) for (var i = 0; i < ps.length && !hay; i++) if (ps[i].vrm || (ps[i].receta && ps[i].receta.cuerpo)) hay = true;
        if (hay) catalogo();
        return;
      }
      if (!cat) return;
      if (Presencia.cambiaron()) alCatalogo();
      tTic += dt; if (tTic >= TICK) { tTic = 0; tic(); }
      regs.forEach(function (r, a) {
        if (!r.inst || r.estado === "cargando") return;
        if (r.estado === "reposo") { if (r.dir > 0) { r.estado = "preparado"; } else { r.tRep += dt; if (r.tRep > REPOSO) quitaReg(a); return; } }
        r.k = Math.max(0, Math.min(1, r.k + r.dir * dt / FUNDIDO)); r.inst.uni.value = r.k;
        if (r.k <= 0 && r.dir < 0) { r.estado = "reposo"; r.tRep = 0; r.inst.raiz.visible = false; }
      });
      propio(dt);
    }
    function estado() {
      var e = { catalogo: est.catalogo, cupo: cupo(), dispositivo: disp, comparte: comparte, cargas: est.cargas, fallos: est.fallos, instancias: est.instancias, msParse: est.msParse, propio: propioVisible() && !!mio && mio.k >= 1, conVrm: 0, fundiendo: 0, cargando: 0, enReposo: 0, ids: [] };
      regs.forEach(function (r) { if (r.estado === "cargando") e.cargando++; else if (r.estado === "reposo") e.enReposo++; else if (r.k >= 1 && r.dir > 0) { e.conVrm++; e.ids.push(r.id); } else e.fundiendo++; });
      // AV4: de los cuerpos del creador que se ven, qué mallas se dibujan (con su material y su color) y sus triángulos: para las pruebas y para medir el avatar completo
      e.cuerpos = cat ? cat.cuerpos.length : 0; e.vestidos = [];
      regs.forEach(function (r) {
        if (!r.inst || !r.inst.cuerpo || !(r.k >= 1 && r.dir > 0)) return;
        var v = { id: r.id, mallas: [], llamadas: 0, triangulos: 0, colores: {}, sentado: r.a && r.a.mov === "silla" };
        r.inst.vrm.scene.traverse(function (o) {
          if (!o.isMesh) return;
          for (var p = o; p; p = p.parent) if (!p.visible) return;
          var g = o.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3, m = [].concat(o.material)[0];
          v.llamadas++; v.triangulos += n; v.mallas.push(o.name); if (m && m.color) v.colores[m.name] = "#" + m.color.getHexString();
        });
        e.vestidos.push(v);
      });
      e.libreria = !!LIB; return e;
    }
    function libera() {
      regs.forEach(function (r) { if (r.inst) sueltaInst(r.inst); }); regs.clear(); quitaPropio();
      if (gVrm) scene.remove(gVrm); gVrm = null; avatarVRM = null;
    }
    gVrm = new THREE.Group(); gVrm.name = "avatares-vrm"; scene.add(gVrm);
    avatarVRM = { coloca: coloca, oculta: oculta, sale: quitaReg, actualiza: actualiza, estado: estado, libera: libera };
    return avatarVRM;
  })();
