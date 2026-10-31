// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02c_componentes (Componentes), 03_escena (camera), 12_paseo (persona, primera), 15_tiempo (nivel, hace)
// Nota: Componente «red-salas» (ADR-0023, C5): el único que habla con LiveKit (import("livekit-client") la primera vez que alguien se une a una sala). Solo se registra; expone «Red» por n.api: salas por clave, unirse, salir o cambiar, publicar y escuchar por tema, estado y participantes. Emite «red:estado». El trozo [puro:…] lo evalúa en Node pruebas/guardianes/red.test.js con un LiveKit de mentira.
// ===============================================================================
  // ---------- la red en tiempo real (C5, ADR-0023; doc/sistema/COMPONENTES.md §6): el componente «red-salas» es el ÚNICO que habla con LiveKit (livekit-client,
  // con import() solo cuando alguien se une a una sala: sin nadie que se una, no se descarga nada). Los demás componentes lo piden por su api (expone «Red»:
  // n.api("red-salas")) y no saben nada de LiveKit: se unen a una sala con unas credenciales que consiguen ellos (cada uno su ruta de token en la api),
  // publican y reciben mensajes por TEMA (bytes; fiable o no; a todos o a unas identidades) y siguen el estado de la conexión y a quién hay.
  //  · Varias salas a la vez, cada una con su clave («visita» para la presencia; OF10, la oficina con salas, y OF12, los directos, tendrán las suyas): Red.sala(clave).
  //  · Cambiar de sala: une() en una sala que ya está dentro (o entrando) la deja antes y entra en la nueva con las credenciales nuevas, bajo la misma clave.
  //  · Audio (F3d, ADR-0026; lo usa el componente «voz-guiada», 45_voz.js): la sala se sigue creando sin suscripción automática; quien quiera oír pide cada
  //    publicación de audio (suscribe) y recibe su MediaStreamTrack en el evento «pista» (la red no la reproduce ni la adjunta a nada: eso lo hace la voz).
  //    También: quién habla («hablan», ActiveSpeakers de LiveKit, solo de las pistas a las que estás suscrito y de la tuya), tus permisos («permisos», los
  //    del token o los que la api cambia en vivo), los atributos de cada participante («atributos», los pone solo la api) y abrir o cerrar TU micrófono
  //    (microfono), con cancelación de eco, supresión de ruido y el preset de voz; cerrar lo despublica y para la captura (el piloto del navegador se apaga).
  //    El vídeo no está (F4).
  // Estados de una sala: «fuera» → «conectando» → «dentro» (⇄ «reconectando») → «fuera». Al salir, motivo(): «propio» (sale() o cambio de sala),
  // «expulsado» (la oficina te sacó), «duplicado» (la misma identidad en otra pestaña), «desconectado» (se cortó) o «error» (no se pudo entrar).
  // Lo que llega de la sala (metadatos, identidades, bytes) es DATO de otras personas: quien lo use lo valida (la presencia lo hace con su contrato).

  // [puro:inicio] — sin DOM ni THREE: pruebas/guardianes/red.test.js lo evalúa tal cual en Node con un LiveKit de mentira
  var RedPuro = (function () {
    var CLAVE = /^[a-z][a-z0-9-]{0,31}$/, TEMA = /^[a-z][a-z0-9-]{0,31}$/;
    var EVENTOS = ["estado", "entra", "sale", "publicada", "despublicada", "pista", "pista-fuera", "hablan", "permisos", "atributos"];
    // F3d: las fuentes de un permiso (TrackSource del protocolo de LiveKit: 0 desconocida, 1 cámara, 2 micrófono, 3 pantalla, 4 audio de pantalla)
    var FUENTES = ["desconocida", "camera", "microphone", "screen_share", "screen_share_audio"];
    // F3d: la captura del micrófono (restricciones de getUserMedia; livekit-client 2.22.4 ya las pone a true por defecto: se dicen aquí para no depender de eso)
    // y su publicación: preset «speech» (24 kbps) con DTX (en silencio casi no manda), ADR-0026 §4. El preset lo pone la red con LK.AudioPresets.speech
    var MICRO_CAPTURA = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, MICRO_PUBLICA = { dtx: true };
    // los permisos de LiveKit (ParticipantPermission) en palabras del motor: { publicar, fuentes, datos }; con publicar y sin fuentes, LiveKit deja publicar cualquiera
    function permisosDe(pm) {
      if (!pm || typeof pm !== "object") return { publicar: false, fuentes: [], datos: false };
      return { publicar: !!pm.canPublish, fuentes: (Array.isArray(pm.canPublishSources) ? pm.canPublishSources : []).map(function (n) { return typeof n === "string" ? n : FUENTES[n] || "desconocida"; }), datos: !!pm.canPublishData };
    }
    var SALA_LK = { adaptiveStream: false, dynacast: false }, CONEXION_LK = { autoSubscribe: false };   // solo datos (como la presencia de siempre)
    // la URL de la sala: la api da wss://… o una ruta del mismo origen (/rtc, que el Caddy pasa a LiveKit); se resuelve contra la página (https → wss)
    function urlWs(url, base) { return new URL(url, base).href.replace(/^http/, "ws"); }
    // el motivo de una desconexión de LiveKit (DisconnectReason) en palabras del motor
    function motivo(m, R) {
      R = R || {};
      return m !== undefined && m === R.PARTICIPANT_REMOVED ? "expulsado" : m !== undefined && m === R.DUPLICATE_IDENTITY ? "duplicado" : m !== undefined && m === R.CLIENT_INITIATED ? "propio" : "desconectado";
    }
    function credencialesValidas(c) { return !!c && typeof c === "object" && typeof c.url === "string" && !!c.url && typeof c.token === "string" && !!c.token; }
    /** o = { carga: () → Promise del módulo livekit-client, base: () → URL de la página, alEstado?: ({ sala, estado, motivo }) → void, avisa?: (texto) → void }.
     *  Devuelve la api de la red: { sala(clave), salas(), info(), cierra() } */
    function crea(o) {
      var LK = null, pide = null, salas = Object.create(null), cerrada = false;
      function avisa(t) { try { if (o.avisa) o.avisa(t); } catch (e) {} }
      function carga() { return LK ? Promise.resolve(LK) : pide || (pide = Promise.resolve().then(o.carga).then(function (m) { LK = m; return m; }, function (e) { pide = null; throw e; })); }
      function vacios() { var v = {}; EVENTOS.forEach(function (e) { v[e] = []; }); return v; }
      function sala(clave) {
        if (cerrada) return null;
        if (typeof clave !== "string" || !CLAVE.test(clave)) throw new Error("clave de sala no válida: " + clave);
        return salas[clave] || (salas[clave] = creaSala(clave));
      }
      function creaSala(clave) {
        var room = null, gen = 0, estado = "fuera", porque = "", oy = vacios(), temas = Object.create(null), gente = Object.create(null);
        var est = { enviados: 0, recibidos: 0, bytesEnviados: 0, bytesRecibidos: 0, sinTema: 0, uniones: 0 };
        function llama(l, a, b) { l.slice().forEach(function (fn) { try { fn(a, b); } catch (e) { avisa(clave + ": " + (e && e.message ? e.message : e)); } }); }
        function cambiaEstado(e, m) {
          if (e === estado && (m === undefined || m === porque)) return;
          estado = e; if (m !== undefined) porque = m;
          var d = { sala: clave, estado: estado, motivo: estado === "fuera" ? porque : "" };
          llama(oy.estado, d);
          try { if (o.alEstado) o.alEstado(d); } catch (er) {}
        }
        // el participante como dato del motor: { identidad, metadatos } (uno por identidad; los metadatos se refrescan al llegar algo suyo)
        function desc(p) {
          if (!p || typeof p.identity !== "string" || !p.identity) return null;
          var d = gente[p.identity] || (gente[p.identity] = { identidad: p.identity, metadatos: "" });
          d.metadatos = typeof p.metadata === "string" ? p.metadata : "";
          return d;
        }
        function dejaSala(r, m) {   // deja la sala r (la de ahora o una que ya no vale); m: el motivo si era la de ahora
          if (!r) return;
          if (r === room) { room = null; gente = Object.create(null); cambiaEstado("fuera", m); }
          try { var x = r.disconnect(); if (x && x.catch) x.catch(function () {}); } catch (e) {}
        }
        function engancha(r, g) {
          var E = LK.RoomEvent;
          function vale() { return room === r && gen === g; }
          r.on(E.ParticipantConnected, function (p) { if (!vale()) return; var d = desc(p); if (d) llama(oy.entra, d); });
          r.on(E.ParticipantDisconnected, function (p) { if (!vale() || !p) return; delete gente[p.identity]; llama(oy.sale, p.identity); });
          r.on(E.DataReceived, function (datos, p, tipo, tema) {
            if (!vale()) return;
            var l = tema && temas[tema]; if (!l || !l.length) { est.sinTema++; return; }
            est.recibidos++; est.bytesRecibidos += datos && datos.byteLength || 0;
            var d = desc(p); for (var i = 0; i < l.length; i++) { try { l[i](datos, d); } catch (e) { avisa(clave + "/" + tema + ": " + (e && e.message ? e.message : e)); } }
          });
          r.on(E.Reconnecting, function () { if (vale()) cambiaEstado("reconectando"); });
          r.on(E.Reconnected, function () { if (vale()) cambiaEstado("dentro"); });
          r.on(E.Disconnected, function (m) { if (room !== r) return; room = null; gente = Object.create(null); cambiaEstado("fuera", motivo(m, LK.DisconnectReason)); });
          // F3d: el audio. Solo publicaciones de audio; lo que llega es de otra persona (identidad y sid, como datos)
          function pub(pb, p) { return pb && p && pb.kind === "audio" && typeof p.identity === "string" ? { identidad: p.identity, sid: String(pb.trackSid || ""), fuente: String(pb.source || "") } : null; }
          if (E.TrackPublished) r.on(E.TrackPublished, function (pb, p) { var d = vale() && pub(pb, p); if (d) llama(oy.publicada, d); });
          if (E.TrackUnpublished) r.on(E.TrackUnpublished, function (pb, p) { var d = vale() && pub(pb, p); if (d) llama(oy.despublicada, d); });
          if (E.TrackSubscribed) r.on(E.TrackSubscribed, function (t, pb, p) { var d = vale() && pub(pb, p); if (d && t && t.mediaStreamTrack) { d.mst = t.mediaStreamTrack; llama(oy.pista, d); } });
          if (E.TrackUnsubscribed) r.on(E.TrackUnsubscribed, function (t, pb, p) { var d = vale() && pub(pb, p); if (d) llama(oy["pista-fuera"], d); });
          if (E.ActiveSpeakersChanged) r.on(E.ActiveSpeakersChanged, function (ps) {
            if (!vale()) return;
            llama(oy.hablan, (ps || []).filter(function (p) { return p && typeof p.identity === "string"; }).map(function (p) { return { identidad: p.identity, nivel: typeof p.audioLevel === "number" ? p.audioLevel : 0, yo: p === r.localParticipant }; }));
          });
          if (E.ParticipantPermissionsChanged) r.on(E.ParticipantPermissionsChanged, function (antes, p) { if (vale() && (!p || p === r.localParticipant)) llama(oy.permisos, permisosDe(r.localParticipant.permissions)); });
          if (E.ParticipantAttributesChanged) r.on(E.ParticipantAttributesChanged, function (cambiados, p) { if (vale() && p && typeof p.identity === "string") llama(oy.atributos, { identidad: p.identity, atributos: copiaAtr(p.attributes) }); });
        }
        function copiaAtr(a) { var o = {}; if (a && typeof a === "object") Object.keys(a).forEach(function (k) { if (typeof a[k] === "string") o[k] = a[k]; }); return o; }
        function dentro() { return !!room && (estado === "dentro" || estado === "reconectando"); }
        // F3d: el nombre de la sala de LiveKit (p. ej. «guiada-12»: la voz solo actúa ahí) y tus permisos; "" y null fuera
        function nombre() { return room && estado !== "conectando" && typeof room.name === "string" ? room.name : ""; }
        function permisos() { return room && estado !== "conectando" && room.localParticipant ? permisosDe(room.localParticipant.permissions) : null; }
        /** los atributos (texto) de esa identidad (o los tuyos, sin ella) que puso la api; null si no está */
        function atributos(identidad) {
          if (!room || estado === "conectando") return null;
          var lp = room.localParticipant, p = identidad === undefined || (lp && identidad === lp.identity) ? lp : room.remoteParticipants.get(identidad);
          return p ? copiaAtr(p.attributes) : null;
        }
        /** las publicaciones de audio de los demás: [{ identidad, sid, fuente, suscrita }] */
        function publicaciones() {
          var l = []; if (!room || estado === "conectando") return l;
          room.remoteParticipants.forEach(function (p) {
            if (p && p.trackPublications) p.trackPublications.forEach(function (pb) { if (pb && pb.kind === "audio") l.push({ identidad: p.identity, sid: String(pb.trackSid || ""), fuente: String(pb.source || ""), suscrita: !!pb.isSubscribed }); });
          });
          return l;
        }
        /** pedir (o soltar) una publicación de audio de otra persona; true si existía */
        function suscribe(identidad, sid, si) {
          var p = room && room.remoteParticipants.get(identidad), pb = p && p.trackPublications && p.trackPublications.get(sid);
          if (!pb || pb.kind !== "audio" || typeof pb.setSubscribed !== "function") return false;
          try { pb.setSubscribed(!!si); } catch (e) { avisa(clave + ": " + (e && e.message ? e.message : e)); return false; }
          return true;
        }
        function pubMicro() { var lp = room && room.localParticipant; return lp && typeof lp.getTrackPublication === "function" ? lp.getTrackPublication(LK.Track.Source.Microphone) : null; }
        /** ¿tu micrófono está publicado y sin silenciar? */
        function microAbierto() { var pb = dentro() ? pubMicro() : null; return !!(pb && pb.track && !pb.isMuted); }
        /** abre (si) o cierra tu micrófono. Promesa de true si queda como se pidió. Abrir sin permiso lo rechaza LiveKit (y aquí, falla) */
        function microfono(si) {
          if (!dentro()) return si ? Promise.reject(new Error("no estás en la sala " + clave)) : Promise.resolve(true);
          var lp = room.localParticipant;
          if (!si) {
            var pb = pubMicro();
            if (!pb || !pb.track) return Promise.resolve(true);
            try { return Promise.resolve(lp.unpublishTrack(pb.track, true)).then(function () { return true; }); } catch (e) { return Promise.reject(e); }
          }
          var pu = Object.assign({ audioPreset: LK.AudioPresets && LK.AudioPresets.speech }, MICRO_PUBLICA);
          try { return Promise.resolve(lp.setMicrophoneEnabled(true, Object.assign({}, MICRO_CAPTURA), pu)).then(function () { return microAbierto(); }); } catch (e) { return Promise.reject(e); }
        }
        /** entra (o cambia) de sala. cred = { url, token } o una función que los da (o su promesa). opc = { sala?, conexion? }: opciones de LiveKit.
         *  Promesa: true si queda dentro; false si mientras entraba se salió o se cambió de sala; falla si no se pudo (y la sala queda «fuera», motivo «error») */
        function une(cred, opc) {
          if (cerrada) return Promise.reject(new Error("la red está cerrada"));
          opc = opc || {};
          var g = ++gen;
          if (room) dejaSala(room, "propio");   // cambio de sala: se deja la de antes
          cambiaEstado("conectando", "");
          return Promise.resolve(typeof cred === "function" ? cred() : cred).then(function (c) {
            if (g !== gen) return false;
            if (!credencialesValidas(c)) throw new Error("credenciales de la sala no válidas");
            return carga().then(function () {
              if (g !== gen) return false;
              var r = new LK.Room(opc.sala || SALA_LK);
              room = r; engancha(r, g); est.uniones++;
              return Promise.resolve(r.connect(urlWs(c.url, o.base()), c.token, opc.conexion || CONEXION_LK)).then(function () {
                if (g !== gen || room !== r) { dejaSala(r); return false; }
                cambiaEstado("dentro", "");
                return true;
              });
            });
          }).catch(function (e) {
            if (g === gen) { var r = room; room = null; gente = Object.create(null); if (r) dejaSala(r); cambiaEstado("fuera", "error"); }
            throw e;
          });
        }
        function sale() { gen++; if (room) dejaSala(room, "propio"); else if (estado !== "fuera") cambiaEstado("fuera", "propio"); return Promise.resolve(); }
        /** publica bytes con un tema: opc = { fiable: bool, destinos?: [identidades] (sin ellos, a toda la sala) }. Falla si no está dentro (o reconectando) */
        function publica(tema, datos, opc) {
          if (!room || (estado !== "dentro" && estado !== "reconectando")) return Promise.reject(new Error("no estás en la sala " + clave));
          if (typeof tema !== "string" || !TEMA.test(tema)) return Promise.reject(new Error("tema no válido: " + tema));
          opc = opc || {};
          var op = { reliable: !!opc.fiable, topic: tema }; if (opc.destinos) op.destinationIdentities = opc.destinos;
          est.enviados++; est.bytesEnviados += datos && datos.byteLength || 0;
          try { return Promise.resolve(room.localParticipant.publishData(datos, op)); } catch (e) { return Promise.reject(e); }
        }
        /** fn(datos, de) por cada mensaje con ese tema (de = { identidad, metadatos } o null si lo manda el servidor). Devuelve la función que deja de escuchar */
        function escucha(tema, fn) {
          if (typeof tema !== "string" || !TEMA.test(tema)) throw new Error("tema no válido: " + tema);
          if (typeof fn !== "function") return function () {};
          (temas[tema] = temas[tema] || []).push(fn);
          return function () { var l = temas[tema], i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); };
        }
        /** evento: «estado» fn({ sala, estado, motivo }), «entra» fn({ identidad, metadatos }), «sale» fn(identidad); y el audio (F3d): «publicada» y
         *  «despublicada» fn({ identidad, sid, fuente }), «pista» fn({ identidad, sid, fuente, mst }), «pista-fuera» fn({ identidad, sid, fuente }),
         *  «hablan» fn([{ identidad, nivel 0-1, yo }]), «permisos» fn({ publicar, fuentes, datos }) y «atributos» fn({ identidad, atributos }).
         *  Devuelve la función que deja de escuchar */
        function al(ev, fn) {
          if (EVENTOS.indexOf(ev) < 0) throw new Error("evento de sala desconocido: " + ev);
          if (typeof fn !== "function") return function () {};
          oy[ev].push(fn);
          return function () { var i = oy[ev].indexOf(fn); if (i >= 0) oy[ev].splice(i, 1); };
        }
        function yo() { var lp = room && estado !== "conectando" ? room.localParticipant : null; return lp ? { identidad: lp.identity, metadatos: typeof lp.metadata === "string" ? lp.metadata : "" } : null; }
        function participantes() { var l = []; if (room && estado !== "conectando") room.remoteParticipants.forEach(function (p) { var d = desc(p); if (d) l.push(d); }); return l; }
        function info() { return { clave: clave, estado: estado, motivo: porque, participantes: participantes().length, enviados: est.enviados, recibidos: est.recibidos, bytesEnviados: est.bytesEnviados, bytesRecibidos: est.bytesRecibidos, sinTema: est.sinTema, uniones: est.uniones }; }
        function cierra() { sale(); oy = vacios(); temas = Object.create(null); }
        return { clave: clave, une: une, sale: sale, publica: publica, escucha: escucha, al: al, estado: function () { return estado; }, motivo: function () { return porque; },
          yo: yo, participantes: participantes, info: info, cierra: cierra,
          nombre: nombre, permisos: permisos, atributos: atributos, publicaciones: publicaciones, suscribe: suscribe, microfono: microfono, microAbierto: microAbierto };
      }
      function info() { return Object.keys(salas).map(function (k) { return salas[k].info(); }); }
      function cierra() { cerrada = true; Object.keys(salas).forEach(function (k) { salas[k].cierra(); }); salas = Object.create(null); }
      return { sala: sala, salas: function () { return Object.keys(salas); }, info: info, cierra: cierra, cargada: function () { return !!LK; } };
    }
    return { CLAVE: CLAVE, TEMA: TEMA, EVENTOS: EVENTOS, FUENTES: FUENTES, MICRO_CAPTURA: MICRO_CAPTURA, MICRO_PUBLICA: MICRO_PUBLICA, SALA_LK: SALA_LK, CONEXION_LK: CONEXION_LK,
      urlWs: urlWs, motivo: motivo, credencialesValidas: credencialesValidas, permisosDe: permisosDe, crea: crea };
  })();
  // [puro:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?red=0 lo apaga (y con él, la presencia, que lo consume).
  // Montado no conecta nada ni descarga livekit-client: eso pasa la primera vez que alguien se une a una sala.
  Componentes.registra({
    id: "red-salas", version: 1,
    consume: [],
    expone: ["Red"],
    eventos: { escucha: [], emite: ["red:estado"] },
    bandera: { defecto: true, url: "red" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // sin dibujo: conexiones WebRTC de datos (y, con la voz, de audio)
    fases: {},
    monta: function (n) {
      return RedPuro.crea({ carga: function () { return import("livekit-client"); }, base: function () { return location.href; },
        alEstado: function (d) { n.emite("red:estado", d); },
        avisa: function (t) { try { console.warn("red: " + t); } catch (e) {} } });
    },
    actualiza: {},
    libera: function (api) { if (api) api.cierra(); }
  });
