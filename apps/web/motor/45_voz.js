// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02c_componentes (Componentes), 03_escena (camera, modo), 15_tiempo (nivel), 29_vr (VRX)
// Nota: Componente «voz-guiada» (F3d, ADR-0026; decisiones 157-162): la voz de las visitas guiadas, SOLO en una sala «guiada-<evento>» de la red (Voz.entra(evento) con el token de F3c, Voz.usa(clave) o ?guiada=<evento>; F3f: con ?presencia=red viaja la presencia y la voz usa su conexión, y se engancha sola a una sala de la red que entra en una guiada, «red:estado»). Consume la red y la presencia (Presencia.cabeza: de dónde sale cada voz). Pide las pistas de micrófono, cada una a un <audio> silenciado y de él a Web Audio (ganancia por distancia y PannerNode HRTF; la escucha, la cámara o la cabeza en VR); con tu micrófono abierto y sin auriculares, plano por los <audio> (cancelación de eco). Abre tu micrófono solo con permiso y tras un gesto (Voz.abre; lo dispara F3e). Emite «voz:habla» y «voz:estado»; escucha «audio:desbloquea», «depura:lineas» y «red:estado». Sin grabación. ?voz=0 lo apaga; ?voz=plano, sin espacializar. Publica window.__voz (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/voz.test.js.
// ===============================================================================
  // ---------- la voz de las visitas guiadas (F3d; ADR-0026, decisiones 157-162; contratos/livekit-roles.json v6 y presencia.md «La voz de las visitas guiadas»).
  // El componente «voz-guiada» consume la red (37_red.js, el único que habla con LiveKit) y la presencia (38_presencia_compartida.js, para saber dónde está cada avatar).
  //  · SOLO actúa en una sala de LiveKit llamada «guiada-<evento>» (decisión 157: nunca en la visita libre). Voz.entra(evento) pide el token de esa sala
  //    (POST /api/presencia/guiadas/:evento/token, F3c) y se une a ella bajo la clave «guiada» de la red; Voz.usa(clave) se engancha a una sala de la red en
  //    la que ya se está (para cuando la presencia viaje a la sala guiada, F3f), si su nombre es de guiada. ?guiada=<evento> entra al montarse (pruebas, enlaces).
  //  · Oír: se pide (setSubscribed) cada publicación de micrófono, como mucho MAX_VOCES, por prioridad (guía, la familia con la palabra, la oficina). Cada pista
  //    va a un <audio> propio, SILENCIADO, y de él a Web Audio: createMediaStreamSource(<audio>.srcObject) → ganancia → PannerNode (HRTF) → la salida de la voz.
  //    Por qué un <audio> (ADR-0026 §3): en Chrome, un MediaStream remoto de WebRTC que no está en ningún elemento de medios puede llegar en SILENCIO a Web Audio
  //    (Chromium 933677; el tutorial de LiveKit monta igual un <audio muted>). No se usa setWebAudioPlugins de livekit-client: está marcado @internal @experimental.
  //  · La escucha (AudioListener) es la cámara; con gafas, la CABEZA (VRX.cab con el giro del rig por el de la cámara, como la pose que publica la presencia).
  //    La voz de cada uno sale de la cabeza de su avatar (Presencia.cabeza); si no se le ve (no está en tu sala de presencia, en vista aérea o bloqueado),
  //    suena delante de ti a ganancia fija (DIST.sinSitio).
  //  · Atenuación (DIST, abajo; la pone la GANANCIA, el panner solo pone la dirección: refDistance 1, rolloffFactor 0): ley inversa de Web Audio con
  //    refDistance 2 m (a menos, a tope; es la distancia de una conversación) y rolloff 1 (a 4 m, la mitad; a 10 m, una quinta parte). La voz del guía, de la
  //    oficina y de quien tiene la palabra NO baja de 0,25 (−12 dB): oírlos es el objeto de la visita (ADR-0026 §3). Cualquier otra (no debería haber: en la
  //    guiada solo publican ellos) se corta a más de 40 m.
  //  · ECO (ADR-0026 §3, Chromium 687574): Chrome cancela el eco de lo que suena por elementos de medios, NO de lo que sale por Web Audio. Elección: el audio
  //    espacial es para quien ESCUCHA; mientras TU micrófono está abierto (o abriéndose) y no has dicho que llevas auriculares (Voz.auriculares(true)), todas las
  //    voces pasan a sus <audio> sin silenciar y sin espacializar (la caída E3 del ADR) y la cancelación de eco actúa. El guía, con el micro casi siempre abierto,
  //    oye «plano» salvo con auriculares. Sin AudioContext (antes del primer gesto), también plano. ?voz=plano lo fuerza siempre; ?voz=espacial, nunca plano.
  //  · Hablar: Voz.abre() abre TU micrófono solo si estás en la guiada, el token (o la api en vivo, UpdateParticipant) te deja publicar micrófono y viene de un
  //    gesto (navigator.userActivation.isActive, o con gafas puestas: el mando no da «activación» por sondeo). Lo publica la red con echoCancellation,
  //    noiseSuppression, autoGainControl y el preset «speech» con DTX. Voz.cierra() lo despublica y para la captura. Si la api retira el permiso, se cierra solo.
  //  · Quién habla: «voz:habla» { identidad, nivel, habla, yo } al empezar, al cambiar el nivel en ≥ 0,1 y al callar (ActiveSpeakers de LiveKit; solo llegan
  //    los de las pistas a las que estás suscrito y el tuyo). «voz:estado» con lo de Voz.estado() al cambiar algo (para el indicador del micro y la ventana Gente, F3e).
  //  · Sin grabación: ni Egress ni MediaRecorder; nada de audio se guarda ni sale de Web Audio salvo a los altavoces.
  // Coste: 0 llamadas de dibujo. CPU de audio [ESTIMADO, sin medir]: decodificar Opus de 1-3 voces y un panner HRTF por voz (una convolución corta por oído)
  // es del orden de 1-2 % de un núcleo de escritorio; en Quest y móvil, más [NO VERIFICADO: F3h]. Red: ~40 kbps de bajada por voz activa (ADR-0026 §4).
  // [puro:inicio] — sin DOM, sin THREE y sin Web Audio: pruebas/guardianes/voz.test.js lo evalúa tal cual en Node
  var VozPuro = (function () {
    var SALA = /^guiada-[1-9][0-9]{0,9}$/, PAPELES = ["guia", "oficina", "familia"];
    var DIST = { ref: 2, rolloff: 1, corte: 40, minimo: 0.25, sinSitio: 0.5 };
    var PANNER = { panningModel: "HRTF", distanceModel: "inverse", refDistance: 1, maxDistance: 10000, rolloffFactor: 0, coneInnerAngle: 360, coneOuterAngle: 360, coneOuterGain: 1 };
    var SUAVE = 0.05, MAX_VOCES = 4, PASO_NIVEL = 0.1;   // s de los cambios de ganancia y posición (sin chasquidos); voces a la vez; cambio de nivel que se avisa
    function esGuiada(nombre) { return typeof nombre === "string" && SALA.test(nombre); }
    // el id de un evento de la agenda (entero 1..2^31−1, o su texto), o null
    function evento(v) { var x = typeof v === "string" && /^[1-9][0-9]{0,9}$/.test(v) ? Number(v) : v; return Number.isInteger(x) && x >= 1 && x <= 2147483647 ? x : null; }
    // el papel que pone la api en los metadatos del token de la guiada (guia, oficina o familia); "" si no lo trae o no se entiende
    function papelDe(metadatos) { try { var m = JSON.parse(metadatos); return m && typeof m === "object" && PAPELES.indexOf(m.papel) >= 0 ? m.papel : ""; } catch (e) { return ""; } }
    // ¿estos permisos (los de la red: { publicar, fuentes }) dejan publicar el micrófono? Como LiveKit: publicar y, si hay fuentes, el micrófono entre ellas
    function puedeHablar(p) { return !!p && p.publicar === true && (!Array.isArray(p.fuentes) || !p.fuentes.length || p.fuentes.indexOf("microphone") >= 0); }
    // los segundos que le quedan a un turno de palabra (atributo palabra_hasta, ISO, que pone la api); 0 si venció; null si no hay
    function turno(atr, tMs) {
      var h = atr && atr.palabra_hasta; if (typeof h !== "string" || !h) return null;
      var t = Date.parse(h); if (!isFinite(t)) return null;
      return Math.max(0, Math.ceil((t - tMs) / 1000));
    }
    function prioritaria(papel, turnoS) { return papel === "guia" || papel === "oficina" || (typeof turnoS === "number" && turnoS > 0); }
    // la ganancia por distancia (m): ley inversa de Web Audio con ref y rolloff; las prioritarias no bajan de DIST.minimo, las demás se cortan a más de DIST.corte
    function ganancia(d, prio) {
      if (typeof d !== "number" || !isFinite(d) || d < 0) return DIST.sinSitio;
      var g = DIST.ref / (DIST.ref + DIST.rolloff * (Math.max(d, DIST.ref) - DIST.ref));
      return prio ? Math.max(g, DIST.minimo) : d > DIST.corte ? 0 : g;
    }
    function rota(v, q) {   // el vector v girado por el cuaternión q = [x, y, z, w]
      var x = q[0], y = q[1], z = q[2], w = q[3], tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
      return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
    }
    // la escucha desde una posición y un giro (cuaternión de la cámara o de la cabeza): { p, f (adelante: −z local), u (arriba: +y local) }
    function oyente(p, q) { return { p: [p[0], p[1], p[2]], f: rota([0, 0, -1], q), u: rota([0, 1, 0], q) }; }
    function distancia(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
    // cómo suenan las voces: «plano» (elementos <audio>, con cancelación de eco) o «espacial» (Web Audio). o = { forzado, micro, auriculares, contexto }
    function modo(o) {
      if (o.forzado === "plano" || !o.contexto) return "plano";
      if (o.forzado === "espacial") return "espacial";
      return o.micro && !o.auriculares ? "plano" : "espacial";
    }
    // a qué publicaciones suscribirse: las de micrófono, como mucho max, por prioridad (guía, palabra, oficina, el resto) y, a igualdad, en el orden dado.
    // pubs = [{ identidad, sid, fuente }]; info(identidad) → { papel, turno }. Devuelve la ls de sid
    function aSuscribir(pubs, info, max) {
      var puesto = function (i) { return i.papel === "guia" ? 0 : typeof i.turno === "number" && i.turno > 0 ? 1 : i.papel === "oficina" ? 2 : 3; };
      return (pubs || []).filter(function (p) { return p && p.fuente === "microphone" && p.sid; }).map(function (p, k) { return { sid: p.sid, r: puesto(info(p.identidad) || {}), k: k }; })
        .sort(function (a, b) { return a.r - b.r || a.k - b.k; }).slice(0, max === undefined ? MAX_VOCES : max).map(function (x) { return x.sid; });
    }
    // ¿se abre el micrófono? e = { dentro, guiada, micro: cerrado|abriendo|abierto, puede, gesto } → { abre, motivo }
    function decideAbrir(e) {
      var m = !e.dentro ? "fuera" : !e.guiada ? "no_guiada" : e.micro !== "cerrado" ? "ya_abierto" : !e.puede ? "sin_permiso" : !e.gesto ? "sin_gesto" : "";
      return { abre: !m, motivo: m || "ok" };
    }
    // quién habla: antes = { identidad: { nivel, yo } }, ls = [{ identidad, nivel, yo }] (ActiveSpeakers) → { ahora, eventos: [{ identidad, nivel, habla, yo }] }
    function difHablan(antes, ls) {
      var ahora = {}, ev = [];
      (ls || []).forEach(function (h) {
        if (!h || typeof h.identidad !== "string" || !h.identidad || ahora[h.identidad]) return;
        var nv = Math.round(Math.max(0, Math.min(1, typeof h.nivel === "number" && isFinite(h.nivel) ? h.nivel : 0)) * 100) / 100, a = antes && antes[h.identidad];
        ahora[h.identidad] = { nivel: a && Math.abs(a.nivel - nv) < PASO_NIVEL ? a.nivel : nv, yo: !!h.yo };
        if (!a || Math.abs(a.nivel - nv) >= PASO_NIVEL) ev.push({ identidad: h.identidad, nivel: nv, habla: true, yo: !!h.yo });
      });
      Object.keys(antes || {}).forEach(function (id) { if (!ahora[id]) ev.push({ identidad: id, nivel: 0, habla: false, yo: !!antes[id].yo }); });
      return { ahora: ahora, eventos: ev };
    }
    function dispositivo(ua) { ua = ua || ""; return /OculusBrowser|Quest/i.test(ua) ? "quest" : /Mobi|Android|iPhone|iPad/i.test(ua) ? "movil" : "escritorio"; }
    // el motivo de un error al abrir el micrófono (getUserMedia o LiveKit) en palabras del motor
    function motivoMicro(e) { var n = e && e.name; return n === "NotAllowedError" || n === "SecurityError" ? "micro_denegado" : n === "NotFoundError" || n === "OverconstrainedError" ? "sin_micro" : "error_micro"; }
    return { SALA: SALA, DIST: DIST, PANNER: PANNER, SUAVE: SUAVE, MAX_VOCES: MAX_VOCES, PASO_NIVEL: PASO_NIVEL, esGuiada: esGuiada, evento: evento, papelDe: papelDe,
      puedeHablar: puedeHablar, turno: turno, prioritaria: prioritaria, ganancia: ganancia, rota: rota, oyente: oyente, distancia: distancia, modo: modo,
      aSuscribir: aSuscribir, decideAbrir: decideAbrir, difHablan: difHablan, dispositivo: dispositivo, motivoMicro: motivoMicro };
  })();
  // [puro:fin]

  // [motor:inicio] — con DOM y Web Audio; pruebas/guardianes/voz.test.js lo monta en Node con una red, un DOM y un AudioContext de mentira
  function VozMotor(n, R, P) {
    var V = VozPuro, forzado = (/[?&]voz=(plano|espacial)(?:[&#]|$)/.exec(location.search) || [])[1] || "";
    var sala = null, propia = false, ganchos = [], voces = Object.create(null), hablando = {}, info = Object.create(null);
    var ctx = null, salida = null, micro = "cerrado", auric = false, motivo = "", ultimo = "", entrando = false, bloqueado = false, vivo = true;
    var qO = new THREE.Quaternion(), ejeY = new THREE.Vector3(0, 1, 0), vO = new THREE.Vector3();
    var est = { aperturas: 0, cierres: 0, suscripciones: 0, pistas: 0 };
    function avisa(t) { try { console.warn("voz: " + t); } catch (e) {} }

    // ---- la sala
    function dentro() { return !!sala && (sala.estado() === "dentro" || sala.estado() === "reconectando"); }
    function engancha(s, suya) {
      desengancha();
      sala = s; propia = !!suya; motivo = "";
      ganchos.push(s.al("publicada", revisa), s.al("despublicada", function (d) { quitaVoz(d.sid); revisa(); }), s.al("pista", montaVoz),
        s.al("pista-fuera", function (d) { quitaVoz(d.sid); }), s.al("hablan", alHablar), s.al("permisos", alPermiso),
        s.al("atributos", function () { leeInfo(); revisa(); emiteEstado(); }), s.al("entra", function () { leeInfo(); revisa(); }), s.al("sale", function () { leeInfo(); revisa(); }),
        s.al("estado", function (d) { if (d.estado === "fuera") { motivo = d.motivo === "expulsado" ? "expulsado" : "fuera"; desengancha(true); } else emiteEstado(); }));
      leeInfo(); revisa(); emiteEstado();
    }
    // desengancha la sala (sin salir de ella: eso es sale()); con micrófono abierto, lo cierra antes
    function desengancha(yaFuera) {
      if (!sala) return;
      var s = sala;
      if (micro !== "cerrado" && !yaFuera) { s.microfono(false).catch(function () {}); est.cierres++; }
      micro = "cerrado";
      ganchos.splice(0).forEach(function (q) { try { q(); } catch (e) {} });
      Object.keys(voces).forEach(quitaVoz);
      alHablar([]);
      sala = null; info = Object.create(null);
      emiteEstado();
    }
    function leeInfo() {   // papel (metadatos) y turno (atributos) de cada uno, como DATOS
      info = Object.create(null); if (!sala) return;
      var ahora = Date.now();
      sala.participantes().forEach(function (de) { info[de.identidad] = { papel: V.papelDe(de.metadatos), turno: V.turno(sala.atributos(de.identidad), ahora) }; });
    }
    function infoDe(id) { return info[id] || { papel: "", turno: null }; }
    function revisa() {   // pedir las publicaciones de micrófono que tocan y soltar las demás
      if (!dentro()) return;
      var pubs = sala.publicaciones(), quiere = V.aSuscribir(pubs, infoDe, V.MAX_VOCES);
      pubs.forEach(function (p) { var si = quiere.indexOf(p.sid) >= 0; if (si !== p.suscrita && sala.suscribe(p.identidad, p.sid, si) && si) est.suscripciones++; });
    }

    // ---- las voces: <audio> silenciado → Web Audio (ganancia → panner) → salida; o, en plano, el <audio> sin silenciar
    function montaVoz(d) {
      if (!d || !d.mst || d.fuente !== "microphone") return;
      if (voces[d.sid]) quitaVoz(d.sid);
      var el = document.createElement("audio");
      el.autoplay = true; el.muted = true; el.hidden = true; el.setAttribute("playsinline", ""); el.setAttribute("aria-hidden", "true");
      el.srcObject = new MediaStream([d.mst]);
      document.body.appendChild(el);
      var v = voces[d.sid] = { identidad: d.identidad, sid: d.sid, el: el, src: null, g: null, p: null, gan: 0, modo: "" };
      est.pistas++;
      if (ctx) grafo(v);
      aplicaModo(v); toca(v);
      emiteEstado();
    }
    function toca(v) { try { var r = v.el.play(); if (r && r.catch) r.catch(function () { bloqueado = true; emiteEstado(); }); } catch (e) { bloqueado = true; } }
    function grafo(v) {
      try {
        v.src = ctx.createMediaStreamSource(v.el.srcObject);
        v.g = ctx.createGain(); v.g.gain.value = 0;
        var p = typeof PannerNode === "function" ? new PannerNode(ctx, V.PANNER) : ctx.createPanner();
        Object.keys(V.PANNER).forEach(function (k) { try { p[k] = V.PANNER[k]; } catch (e) {} });
        v.p = p; v.src.connect(v.g); v.g.connect(p); p.connect(salida);
      } catch (e) { avisa("no se pudo montar el audio espacial: " + (e && e.message ? e.message : e)); sueltaGrafo(v); }
    }
    function sueltaGrafo(v) { [v.src, v.g, v.p].forEach(function (x) { if (x) try { x.disconnect(); } catch (e) {} }); v.src = v.g = v.p = null; }
    function quitaVoz(sid) {
      var v = voces[sid]; if (!v) return;
      sueltaGrafo(v);
      try { v.el.pause(); } catch (e) {} v.el.srcObject = null; if (v.el.parentNode) v.el.parentNode.removeChild(v.el);
      delete voces[sid]; emiteEstado();
    }
    function modoAhora() { return V.modo({ forzado: forzado, micro: micro !== "cerrado", auriculares: auric, contexto: !!(ctx && ctx.state === "running") }); }
    function aplicaModo(v) {
      var m = modoAhora(); if (v.p === null && m === "espacial") m = "plano";   // sin grafo (falló al montarse), plano
      if (m === v.modo) return;
      v.modo = m;
      if (m === "plano") { v.el.muted = false; v.el.volume = 1; if (v.g) v.g.gain.value = 0; }
      else v.el.muted = true;   // la ganancia la pone coloca() en su fase
    }
    function aplicaModos() { Object.keys(voces).forEach(function (k) { aplicaModo(voces[k]); }); }

    // ---- el AudioContext: propio de la voz, y solo tras un gesto estando en la guiada. No se reusa el del sonido ambiente (20_sonido.js): ese no existe si
    // el sonido está apagado en Configuración (y la voz debe oírse igual), pasa por su volumen de ambiente y se cierra al liberar su componente
    function desbloquea() {
      if (!sala || !vivo) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!ctx && AC) {
        try { ctx = new AC({ latencyHint: "interactive" }); salida = ctx.createGain(); salida.gain.value = 1; salida.connect(ctx.destination); }
        catch (e) { ctx = null; salida = null; avisa("sin Web Audio: voces sin espacializar"); }
        if (ctx) Object.keys(voces).forEach(function (k) { grafo(voces[k]); });
      }
      var hecho = function () { bloqueado = false; Object.keys(voces).forEach(function (k) { if (voces[k].el.paused) toca(voces[k]); }); aplicaModos(); emiteEstado(); };
      if (ctx && ctx.state !== "running") { try { var r = ctx.resume(); if (r && r.then) r.then(hecho, function () {}); } catch (e) {} } else hecho();
    }
    function gesto() { return !!(VRX && VRX.on) || !!(typeof navigator !== "undefined" && navigator.userActivation && navigator.userActivation.isActive); }

    // ---- la escucha y cada voz en su sitio (fase «tarde», 20 Hz)
    var oy = null;
    function oyente() {
      if (VRX && VRX.on) { qO.setFromAxisAngle(ejeY, VRX.rig.yaw).multiply(camera.quaternion); vO.copy(VRX.cab); }
      else { camera.getWorldPosition(vO); camera.getWorldQuaternion(qO); }
      return V.oyente([vO.x, vO.y, vO.z], [qO.x, qO.y, qO.z, qO.w]);
    }
    function fija(param, v, t) { if (param.setTargetAtTime) param.setTargetAtTime(v, t, V.SUAVE); else param.value = v; }
    function colocaOyente(o) {
      var L = ctx.listener, t = ctx.currentTime;
      if (L.positionX) { fija(L.positionX, o.p[0], t); fija(L.positionY, o.p[1], t); fija(L.positionZ, o.p[2], t); fija(L.forwardX, o.f[0], t); fija(L.forwardY, o.f[1], t); fija(L.forwardZ, o.f[2], t); fija(L.upX, o.u[0], t); fija(L.upY, o.u[1], t); fija(L.upZ, o.u[2], t); }
      else { L.setPosition(o.p[0], o.p[1], o.p[2]); L.setOrientation(o.f[0], o.f[1], o.f[2], o.u[0], o.u[1], o.u[2]); }
    }
    function coloca(v, o) {
      var c = P && P.cabeza ? P.cabeza(v.identidad) : null, i = infoDe(v.identidad);
      var pos = c ? [c.x, c.y, c.z] : [o.p[0] + o.f[0], o.p[1] + o.f[1], o.p[2] + o.f[2]];   // sin sitio: un metro delante
      v.gan = c ? V.ganancia(V.distancia(pos, o.p), V.prioritaria(i.papel, i.turno)) : V.DIST.sinSitio;
      if (v.modo !== "espacial" || !v.p) return;
      var t = ctx.currentTime, p = v.p;
      if (p.positionX) { fija(p.positionX, pos[0], t); fija(p.positionY, pos[1], t); fija(p.positionZ, pos[2], t); } else p.setPosition(pos[0], pos[1], pos[2]);
      fija(v.g.gain, v.gan, t);
    }
    function tarde() {
      if (!sala) return;
      if (micro === "abierto" && !sala.microAbierto()) { micro = "cerrado"; est.cierres++; aplicaModos(); }   // la api quitó la palabra: LiveKit lo despublicó
      if (ctx && ctx.state === "running") {
        oy = oyente(); colocaOyente(oy);
        Object.keys(voces).forEach(function (k) { coloca(voces[k], oy); });
      }
      var ahora = Date.now();   // el turno de quien tiene la palabra se va agotando: al vencer deja de ser prioritaria
      Object.keys(info).forEach(function (id) { if (info[id].turno !== null) info[id].turno = V.turno(sala.atributos(id), ahora); });
      emiteEstado();
    }

    // ---- quién habla
    function alHablar(ls) {
      var r = V.difHablan(hablando, ls); hablando = r.ahora;
      r.eventos.forEach(function (e) { n.emite("voz:habla", e); });
      if (r.eventos.length) emiteEstado();
    }

    // ---- el micrófono propio
    function permiso() { return dentro() ? sala.permisos() : null; }
    function alPermiso() {
      if (micro !== "cerrado" && !V.puedeHablar(permiso())) { motivo = "sin_permiso"; cierra(); }
      emiteEstado();
    }
    /** abre tu micrófono (decisión 158: lo pide un gesto; F3e pone el botón, la tecla y el gatillo). Promesa de true si queda abierto */
    function abre() {
      var d = V.decideAbrir({ dentro: dentro(), guiada: dentro() && V.esGuiada(sala.nombre()), micro: micro, puede: V.puedeHablar(permiso()), gesto: gesto() });
      if (!d.abre) { if (d.motivo !== "ya_abierto") motivo = d.motivo; emiteEstado(); return Promise.resolve(micro === "abierto"); }
      var s = sala; micro = "abriendo"; motivo = ""; aplicaModos(); desbloquea(); emiteEstado();
      return s.microfono(true).then(function (ok) {
        if (s !== sala) { s.microfono(false).catch(function () {}); return false; }   // se salió mientras se abría
        micro = ok ? "abierto" : "cerrado"; if (ok) est.aperturas++; else motivo = "error_micro";
        aplicaModos(); emiteEstado(); return ok;
      }, function (e) {
        if (s === sala) { micro = "cerrado"; motivo = V.motivoMicro(e); aplicaModos(); emiteEstado(); }
        return false;
      });
    }
    /** cierra tu micrófono (lo despublica y para la captura). Promesa de true */
    function cierra() {
      if (!sala || micro === "cerrado") return Promise.resolve(true);
      var s = sala; micro = "cerrado"; est.cierres++; aplicaModos(); emiteEstado();
      return s.microfono(false).then(function () { return true; }, function (e) { avisa("al cerrar el micrófono: " + (e && e.message ? e.message : e)); return true; });
    }

    // ---- entrar y salir
    /** entra en la sala de voz de ese evento: token de la api (F3c) y la clave «guiada» de la red. Promesa de true si queda dentro de una guiada */
    async function entra(ev) {
      var id = V.evento(ev); if (id === null || !R || entrando) return false;
      // F3f: con la presencia de verdad (?presencia=red), la PRESENCIA viaja a la guiada y la voz usa su misma conexión (sala «visita» de la red): una sola
      // identidad por sesión (dos conexiones con la misma se echarían una a otra) y cada voz sale de su avatar. Sin ella, la voz entra por su cuenta (clave «guiada»)
      if (P && P.entraGuiada && P.estado && P.estado().variante === "red") {
        entrando = true; motivo = ""; emiteEstado();
        try {
          var ok = await P.entraGuiada(id); if (!vivo) return false;
          if (!ok) { motivo = "no_entra"; return false; }
          return usa("visita");
        } finally { entrando = false; emiteEstado(); }
      }
      entrando = true; motivo = ""; emiteEstado();
      try {
        var r = await fetch("/api/presencia/guiadas/" + id + "/token", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
          body: JSON.stringify({ dispositivo: V.dispositivo(navigator.userAgent) }) });
        if (!r.ok) { var e = null; try { e = await r.json(); } catch (x) {} motivo = e && typeof e.error === "string" ? e.error : "http_" + r.status; return false; }
        var t = await r.json(); if (!vivo) return false;
        var s = R.sala("guiada");
        if (!(await s.une({ url: t.url, token: t.token })) || !vivo) return false;
        if (!V.esGuiada(s.nombre())) { motivo = "no_guiada"; s.sale(); return false; }
        engancha(s, true);
        return true;
      } catch (err) { motivo = "sin_conexion"; avisa(err && err.message ? err.message : err); return false; }
      finally { entrando = false; emiteEstado(); }
    }
    /** se engancha a una sala de la red en la que ya se está (p. ej. la de la presencia, cuando viaje a la guiada: F3f), si es una guiada */
    function usa(clave) {
      var s = R && R.sala(clave);
      if (!s || s.estado() !== "dentro" || !V.esGuiada(s.nombre())) { motivo = "no_guiada"; emiteEstado(); return false; }
      if (s !== sala) engancha(s, false);
      return true;
    }
    function sale() { var s = sala, suya = propia; desengancha(); motivo = ""; if (s && suya) s.sale(); emiteEstado(); return Promise.resolve(); }
    function auriculares(si) { if (si !== undefined) { auric = !!si; aplicaModos(); emiteEstado(); } return auric; }
    function hablan() { return Object.keys(hablando).map(function (id) { return { identidad: id, nivel: hablando[id].nivel, yo: hablando[id].yo }; }); }

    function estado() {
      var p = permiso(), yo = dentro() ? sala.yo() : null;
      // bloqueado: el navegador no dejó reproducir alguna voz (sin gesto todavía): F3e dice «toca para oír»
      return { sala: dentro() ? sala.nombre() : "", dentro: dentro(), guiada: dentro() && V.esGuiada(sala.nombre()), entrando: entrando,
        papel: yo ? V.papelDe(yo.metadatos) : "", puede: V.puedeHablar(p), micro: micro, turno: yo ? V.turno(sala.atributos(), Date.now()) : null,
        modo: modoAhora(), auriculares: auric, bloqueado: bloqueado, voces: Object.keys(voces).length, hablan: Object.keys(hablando).length, motivo: motivo };
    }
    function emiteEstado() {
      var e = estado(), k = JSON.stringify(e); if (k === ultimo) return; ultimo = k;
      n.emite("voz:estado", e);
    }

    // el primer gesto (tocar, una tecla, entrar en VR) deja arrancar el audio: solo estando en una guiada
    ["pointerdown", "keydown"].forEach(function (evn) { window.addEventListener(evn, desbloquea, { passive: true }); n.limpia(function () { window.removeEventListener(evn, desbloquea); }); });
    n.on("audio:desbloquea", desbloquea);
    // F3f: una sala de la red que acaba de entrar en una guiada (la presencia que viaja a ella): la voz se engancha sola, sin que nadie se lo pida
    n.on("red:estado", function (d) {
      if (!vivo || sala || !d || d.estado !== "dentro" || !R) return;
      var s = R.sala(d.sala); if (s && s.estado() === "dentro" && V.esGuiada(s.nombre())) engancha(s, false);
    });
    n.on("depura:lineas", function (d) { if (sala && d && d.lineas) { var e = estado(); d.lineas.push("voz " + e.sala + " · " + e.voces + " voces · micro " + e.micro + " · " + e.modo + (e.bloqueado ? " · sin gesto" : "")); } });

    function libera() {
      vivo = false; sale();
      if (ctx) { var c = ctx; ctx = null; salida = null; try { var r = c.close(); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
      if (window.__voz === gancho) window.__voz = undefined;
    }
    // gancho de pruebas: el estado; «voces», cada voz (modo, ganancia, silenciada); «entra», «abre», «cierra», «sale», «auriculares»
    function gancho(accion, arg) {
      if (accion === "voces") return Object.keys(voces).map(function (k) { var v = voces[k]; return { identidad: v.identidad, sid: v.sid, modo: v.modo, ganancia: Math.round(v.gan * 1000) / 1000, silenciada: v.el.muted, espacial: !!v.p }; });
      if (accion === "entra") return entra(arg);
      if (accion === "abre") return abre();
      if (accion === "cierra") return cierra();
      if (accion === "sale") return sale();
      if (accion === "auriculares") return auriculares(arg);
      if (accion === "medidas") return Object.assign({}, est);
      return estado();
    }
    window.__voz = gancho;
    var m = /[?&]guiada=([1-9][0-9]{0,9})(?:[&#]|$)/.exec(location.search);
    if (m) entra(m[1]);
    return { entra: entra, usa: usa, sale: sale, abre: abre, cierra: cierra, estado: estado, hablan: hablan, auriculares: auriculares, actualiza: tarde, libera: libera };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?voz=0 lo apaga. Montado no crea nada (ni AudioContext,
  // ni elementos, ni conexión) hasta Voz.entra(evento), Voz.usa(clave) o ?guiada=<evento>
  Componentes.registra({
    id: "voz-guiada", version: 1,
    consume: ["Red", "Presencia", "VRX"],
    expone: ["Voz"],
    eventos: { escucha: ["audio:desbloquea", "depura:lineas", "red:estado"], emite: ["voz:habla", "voz:estado"] },
    bandera: { defecto: true, url: "voz" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // sin dibujo: Web Audio (un AudioContext, una ganancia y un panner HRTF por voz, como mucho 4) y <audio> ocultos
    fases: { tarde: 0.05 },
    monta: function (n) { return VozMotor(n, n.api("red-salas"), n.api("presencia-compartida")); },
    actualiza: { tarde: function (dt, t, api) { api.actualiza(); } },
    libera: function (api) { if (api) api.libera(); }
  });
