// La red en tiempo real (C5, ADR-0023; doc/sistema/COMPONENTES.md §6; MU5-n, A3-6a: antes apps/web/motor/37_red.js, que queda como talón): el componente «red-salas»
// es el ÚNICO que habla con LiveKit (livekit-client, con import() solo cuando alguien se une a una sala: sin nadie que se una, no se descarga nada; el import() se queda
// escrito en el talón para que Vite lo trocee como antes). Los demás componentes lo piden por su api (expone «Red»: n.api("red-salas")) y no saben nada de LiveKit:
// se unen a una sala con unas credenciales que consiguen ellos (cada uno su ruta de token en la api), publican y reciben mensajes por TEMA (bytes; fiable o no;
// a todos o a unas identidades) y siguen el estado de la conexión y a quién hay.
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
// Componente de TODO mundo (mundos: "todos", COMPONENTES §3.2): la red no sabe qué hay dentro de un mundo; solo conoce salas, identidades y temas (MUNDOS §1).
// Vive en red/, que solo importa de datos/ (MUNDOS §1): por eso el manifiesto no nombra el tipo Manifiesto del núcleo; tiene su misma forma.
// El protocolo no cambia (contratos/livekit-roles.json v8 y contratos/presencia.md): lo vigilan red.test.js y salas.test.ts.

// [puro:inicio] — sin DOM ni THREE: salas.test.ts y pruebas/guardianes/red.test.js lo prueban con un LiveKit de mentira
export const RedPuro: any = (function () {
  var CLAVE: any = /^[a-z][a-z0-9-]{0,31}$/, TEMA: any = /^[a-z][a-z0-9-]{0,31}$/;
  var EVENTOS: any = ["estado", "entra", "sale", "publicada", "despublicada", "pista", "pista-fuera", "hablan", "permisos", "atributos"];
  // F3d: las fuentes de un permiso (TrackSource del protocolo de LiveKit: 0 desconocida, 1 cámara, 2 micrófono, 3 pantalla, 4 audio de pantalla)
  var FUENTES: any = ["desconocida", "camera", "microphone", "screen_share", "screen_share_audio"];
  // F3d: la captura del micrófono (restricciones de getUserMedia; livekit-client 2.22.4 ya las pone a true por defecto: se dicen aquí para no depender de eso)
  // y su publicación: preset «speech» (24 kbps) con DTX (en silencio casi no manda), ADR-0026 §4. El preset lo pone la red con LK.AudioPresets.speech
  var MICRO_CAPTURA: any = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, MICRO_PUBLICA: any = { dtx: true };
  // los permisos de LiveKit (ParticipantPermission) en palabras del motor: { publicar, fuentes, datos }; con publicar y sin fuentes, LiveKit deja publicar cualquiera
  function permisosDe(pm?: any) {
    if (!pm || typeof pm !== "object") return { publicar: false, fuentes: [], datos: false };
    return { publicar: !!pm.canPublish, fuentes: (Array.isArray(pm.canPublishSources) ? pm.canPublishSources : []).map(function (n?: any) { return typeof n === "string" ? n : FUENTES[n] || "desconocida"; }), datos: !!pm.canPublishData };
  }
  var SALA_LK: any = { adaptiveStream: false, dynacast: false }, CONEXION_LK: any = { autoSubscribe: false };   // solo datos (como la presencia de siempre)
  // la URL de la sala: la api da wss://… o una ruta del mismo origen (/rtc, que el Caddy pasa a LiveKit); se resuelve contra la página (https → wss)
  function urlWs(url?: any, base?: any) { return new URL(url, base).href.replace(/^http/, "ws"); }
  // el motivo de una desconexión de LiveKit (DisconnectReason) en palabras del motor
  function motivo(m?: any, R?: any) {
    R = R || {};
    return m !== undefined && m === R.PARTICIPANT_REMOVED ? "expulsado" : m !== undefined && m === R.DUPLICATE_IDENTITY ? "duplicado" : m !== undefined && m === R.CLIENT_INITIATED ? "propio" : "desconectado";
  }
  function credencialesValidas(c?: any) { return !!c && typeof c === "object" && typeof c.url === "string" && !!c.url && typeof c.token === "string" && !!c.token; }
  /** o = { carga: () → Promise del módulo livekit-client, base: () → URL de la página, alEstado?: ({ sala, estado, motivo }) → void, avisa?: (texto) → void }.
   *  Devuelve la api de la red: { sala(clave), salas(), info(), cierra() } */
  function crea(o?: any) {
    var LK: any = null, pide: any = null, salas: any = Object.create(null), cerrada: any = false;
    function avisa(t?: any) { try { if (o.avisa) o.avisa(t); } catch (e: any) {} }
    function carga() { return LK ? Promise.resolve(LK) : pide || (pide = Promise.resolve().then(o.carga).then(function (m?: any) { LK = m; return m; }, function (e?: any) { pide = null; throw e; })); }
    function vacios() { var v: any = {}; EVENTOS.forEach(function (e?: any) { v[e] = []; }); return v; }
    function sala(clave?: any) {
      if (cerrada) return null;
      if (typeof clave !== "string" || !CLAVE.test(clave)) throw new Error("clave de sala no válida: " + clave);
      return salas[clave] || (salas[clave] = creaSala(clave));
    }
    function creaSala(clave?: any) {
      var room: any = null, gen: any = 0, estado: any = "fuera", porque: any = "", oy: any = vacios(), temas: any = Object.create(null), gente: any = Object.create(null);
      var est: any = { enviados: 0, recibidos: 0, bytesEnviados: 0, bytesRecibidos: 0, sinTema: 0, uniones: 0 };
      function llama(l?: any, a?: any, b?: any) { l.slice().forEach(function (fn?: any) { try { fn(a, b); } catch (e: any) { avisa(clave + ": " + (e && e.message ? e.message : e)); } }); }
      function cambiaEstado(e?: any, m?: any) {
        if (e === estado && (m === undefined || m === porque)) return;
        estado = e; if (m !== undefined) porque = m;
        var d: any = { sala: clave, estado: estado, motivo: estado === "fuera" ? porque : "" };
        llama(oy.estado, d);
        try { if (o.alEstado) o.alEstado(d); } catch (er: any) {}
      }
      // el participante como dato del motor: { identidad, metadatos } (uno por identidad; los metadatos se refrescan al llegar algo suyo)
      function desc(p?: any) {
        if (!p || typeof p.identity !== "string" || !p.identity) return null;
        var d: any = gente[p.identity] || (gente[p.identity] = { identidad: p.identity, metadatos: "" });
        d.metadatos = typeof p.metadata === "string" ? p.metadata : "";
        return d;
      }
      function dejaSala(r?: any, m?: any) {   // deja la sala r (la de ahora o una que ya no vale); m: el motivo si era la de ahora
        if (!r) return;
        if (r === room) { room = null; gente = Object.create(null); cambiaEstado("fuera", m); }
        try { var x: any = r.disconnect(); if (x && x.catch) x.catch(function () {}); } catch (e: any) {}
      }
      function engancha(r?: any, g?: any) {
        var E: any = LK.RoomEvent;
        function vale() { return room === r && gen === g; }
        r.on(E.ParticipantConnected, function (p?: any) { if (!vale()) return; var d: any = desc(p); if (d) llama(oy.entra, d); });
        r.on(E.ParticipantDisconnected, function (p?: any) { if (!vale() || !p) return; delete gente[p.identity]; llama(oy.sale, p.identity); });
        r.on(E.DataReceived, function (datos?: any, p?: any, tipo?: any, tema?: any) {
          if (!vale()) return;
          var l: any = tema && temas[tema]; if (!l || !l.length) { est.sinTema++; return; }
          est.recibidos++; est.bytesRecibidos += datos && datos.byteLength || 0;
          var d: any = desc(p); for (var i: any = 0; i < l.length; i++) { try { l[i](datos, d); } catch (e: any) { avisa(clave + "/" + tema + ": " + (e && e.message ? e.message : e)); } }
        });
        r.on(E.Reconnecting, function () { if (vale()) cambiaEstado("reconectando"); });
        r.on(E.Reconnected, function () { if (vale()) cambiaEstado("dentro"); });
        r.on(E.Disconnected, function (m?: any) { if (room !== r) return; room = null; gente = Object.create(null); cambiaEstado("fuera", motivo(m, LK.DisconnectReason)); });
        // F3d: el audio. Solo publicaciones de audio; lo que llega es de otra persona (identidad y sid, como datos)
        function pub(pb?: any, p?: any) { return pb && p && pb.kind === "audio" && typeof p.identity === "string" ? { identidad: p.identity, sid: String(pb.trackSid || ""), fuente: String(pb.source || "") } : null; }
        if (E.TrackPublished) r.on(E.TrackPublished, function (pb?: any, p?: any) { var d: any = vale() && pub(pb, p); if (d) llama(oy.publicada, d); });
        if (E.TrackUnpublished) r.on(E.TrackUnpublished, function (pb?: any, p?: any) { var d: any = vale() && pub(pb, p); if (d) llama(oy.despublicada, d); });
        if (E.TrackSubscribed) r.on(E.TrackSubscribed, function (t?: any, pb?: any, p?: any) { var d: any = vale() && pub(pb, p); if (d && t && t.mediaStreamTrack) { d.mst = t.mediaStreamTrack; llama(oy.pista, d); } });
        if (E.TrackUnsubscribed) r.on(E.TrackUnsubscribed, function (t?: any, pb?: any, p?: any) { var d: any = vale() && pub(pb, p); if (d) llama(oy["pista-fuera"], d); });
        if (E.ActiveSpeakersChanged) r.on(E.ActiveSpeakersChanged, function (ps?: any) {
          if (!vale()) return;
          llama(oy.hablan, (ps || []).filter(function (p?: any) { return p && typeof p.identity === "string"; }).map(function (p?: any) { return { identidad: p.identity, nivel: typeof p.audioLevel === "number" ? p.audioLevel : 0, yo: p === r.localParticipant }; }));
        });
        if (E.ParticipantPermissionsChanged) r.on(E.ParticipantPermissionsChanged, function (antes?: any, p?: any) { if (vale() && (!p || p === r.localParticipant)) llama(oy.permisos, permisosDe(r.localParticipant.permissions)); });
        if (E.ParticipantAttributesChanged) r.on(E.ParticipantAttributesChanged, function (cambiados?: any, p?: any) { if (vale() && p && typeof p.identity === "string") llama(oy.atributos, { identidad: p.identity, atributos: copiaAtr(p.attributes) }); });
      }
      function copiaAtr(a?: any) { var o: any = {}; if (a && typeof a === "object") Object.keys(a).forEach(function (k?: any) { if (typeof a[k] === "string") o[k] = a[k]; }); return o; }
      function dentro() { return !!room && (estado === "dentro" || estado === "reconectando"); }
      // F3d: el nombre de la sala de LiveKit (p. ej. «guiada-12»: la voz solo actúa ahí) y tus permisos; "" y null fuera
      function nombre() { return room && estado !== "conectando" && typeof room.name === "string" ? room.name : ""; }
      function permisos() { return room && estado !== "conectando" && room.localParticipant ? permisosDe(room.localParticipant.permissions) : null; }
      /** los atributos (texto) de esa identidad (o los tuyos, sin ella) que puso la api; null si no está */
      function atributos(identidad?: any) {
        if (!room || estado === "conectando") return null;
        var lp: any = room.localParticipant, p: any = identidad === undefined || (lp && identidad === lp.identity) ? lp : room.remoteParticipants.get(identidad);
        return p ? copiaAtr(p.attributes) : null;
      }
      /** las publicaciones de audio de los demás: [{ identidad, sid, fuente, suscrita }] */
      function publicaciones() {
        var l: any = []; if (!room || estado === "conectando") return l;
        room.remoteParticipants.forEach(function (p?: any) {
          if (p && p.trackPublications) p.trackPublications.forEach(function (pb?: any) { if (pb && pb.kind === "audio") l.push({ identidad: p.identity, sid: String(pb.trackSid || ""), fuente: String(pb.source || ""), suscrita: !!pb.isSubscribed }); });
        });
        return l;
      }
      /** pedir (o soltar) una publicación de audio de otra persona; true si existía */
      function suscribe(identidad?: any, sid?: any, si?: any) {
        var p: any = room && room.remoteParticipants.get(identidad), pb: any = p && p.trackPublications && p.trackPublications.get(sid);
        if (!pb || pb.kind !== "audio" || typeof pb.setSubscribed !== "function") return false;
        try { pb.setSubscribed(!!si); } catch (e: any) { avisa(clave + ": " + (e && e.message ? e.message : e)); return false; }
        return true;
      }
      function pubMicro() { var lp: any = room && room.localParticipant; return lp && typeof lp.getTrackPublication === "function" ? lp.getTrackPublication(LK.Track.Source.Microphone) : null; }
      /** ¿tu micrófono está publicado y sin silenciar? */
      function microAbierto() { var pb: any = dentro() ? pubMicro() : null; return !!(pb && pb.track && !pb.isMuted); }
      /** abre (si) o cierra tu micrófono. Promesa de true si queda como se pidió. Abrir sin permiso lo rechaza LiveKit (y aquí, falla) */
      function microfono(si?: any) {
        if (!dentro()) return si ? Promise.reject(new Error("no estás en la sala " + clave)) : Promise.resolve(true);
        var lp: any = room.localParticipant;
        if (!si) {
          var pb: any = pubMicro();
          if (!pb || !pb.track) return Promise.resolve(true);
          try { return Promise.resolve(lp.unpublishTrack(pb.track, true)).then(function () { return true; }); } catch (e: any) { return Promise.reject(e); }
        }
        var pu: any = Object.assign({ audioPreset: LK.AudioPresets && LK.AudioPresets.speech }, MICRO_PUBLICA);
        try { return Promise.resolve(lp.setMicrophoneEnabled(true, Object.assign({}, MICRO_CAPTURA), pu)).then(function () { return microAbierto(); }); } catch (e: any) { return Promise.reject(e); }
      }
      /** entra (o cambia) de sala. cred = { url, token } o una función que los da (o su promesa). opc = { sala?, conexion? }: opciones de LiveKit.
       *  Promesa: true si queda dentro; false si mientras entraba se salió o se cambió de sala; falla si no se pudo (y la sala queda «fuera», motivo «error») */
      function une(cred?: any, opc?: any) {
        if (cerrada) return Promise.reject(new Error("la red está cerrada"));
        opc = opc || {};
        var g: any = ++gen;
        if (room) dejaSala(room, "propio");   // cambio de sala: se deja la de antes
        cambiaEstado("conectando", "");
        return Promise.resolve(typeof cred === "function" ? cred() : cred).then(function (c?: any) {
          if (g !== gen) return false;
          if (!credencialesValidas(c)) throw new Error("credenciales de la sala no válidas");
          return carga().then(function () {
            if (g !== gen) return false;
            var r: any = new LK.Room(opc.sala || SALA_LK);
            room = r; engancha(r, g); est.uniones++;
            return Promise.resolve(r.connect(urlWs(c.url, o.base()), c.token, opc.conexion || CONEXION_LK)).then(function () {
              if (g !== gen || room !== r) { dejaSala(r); return false; }
              cambiaEstado("dentro", "");
              return true;
            });
          });
        }).catch(function (e?: any) {
          if (g === gen) { var r: any = room; room = null; gente = Object.create(null); if (r) dejaSala(r); cambiaEstado("fuera", "error"); }
          throw e;
        });
      }
      function sale() { gen++; if (room) dejaSala(room, "propio"); else if (estado !== "fuera") cambiaEstado("fuera", "propio"); return Promise.resolve(); }
      /** publica bytes con un tema: opc = { fiable: bool, destinos?: [identidades] (sin ellos, a toda la sala) }. Falla si no está dentro (o reconectando) */
      function publica(tema?: any, datos?: any, opc?: any) {
        if (!room || (estado !== "dentro" && estado !== "reconectando")) return Promise.reject(new Error("no estás en la sala " + clave));
        if (typeof tema !== "string" || !TEMA.test(tema)) return Promise.reject(new Error("tema no válido: " + tema));
        opc = opc || {};
        var op: any = { reliable: !!opc.fiable, topic: tema }; if (opc.destinos) op.destinationIdentities = opc.destinos;
        est.enviados++; est.bytesEnviados += datos && datos.byteLength || 0;
        try { return Promise.resolve(room.localParticipant.publishData(datos, op)); } catch (e: any) { return Promise.reject(e); }
      }
      /** fn(datos, de) por cada mensaje con ese tema (de = { identidad, metadatos } o null si lo manda el servidor). Devuelve la función que deja de escuchar */
      function escucha(tema?: any, fn?: any) {
        if (typeof tema !== "string" || !TEMA.test(tema)) throw new Error("tema no válido: " + tema);
        if (typeof fn !== "function") return function () {};
        (temas[tema] = temas[tema] || []).push(fn);
        return function () { var l: any = temas[tema], i: any = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); };
      }
      /** evento: «estado» fn({ sala, estado, motivo }), «entra» fn({ identidad, metadatos }), «sale» fn(identidad); y el audio (F3d): «publicada» y
       *  «despublicada» fn({ identidad, sid, fuente }), «pista» fn({ identidad, sid, fuente, mst }), «pista-fuera» fn({ identidad, sid, fuente }),
       *  «hablan» fn([{ identidad, nivel 0-1, yo }]), «permisos» fn({ publicar, fuentes, datos }) y «atributos» fn({ identidad, atributos }).
       *  Devuelve la función que deja de escuchar */
      function al(ev?: any, fn?: any) {
        if (EVENTOS.indexOf(ev) < 0) throw new Error("evento de sala desconocido: " + ev);
        if (typeof fn !== "function") return function () {};
        oy[ev].push(fn);
        return function () { var i: any = oy[ev].indexOf(fn); if (i >= 0) oy[ev].splice(i, 1); };
      }
      function yo() { var lp: any = room && estado !== "conectando" ? room.localParticipant : null; return lp ? { identidad: lp.identity, metadatos: typeof lp.metadata === "string" ? lp.metadata : "" } : null; }
      function participantes() { var l: any = []; if (room && estado !== "conectando") room.remoteParticipants.forEach(function (p?: any) { var d: any = desc(p); if (d) l.push(d); }); return l; }
      function info() { return { clave: clave, estado: estado, motivo: porque, participantes: participantes().length, enviados: est.enviados, recibidos: est.recibidos, bytesEnviados: est.bytesEnviados, bytesRecibidos: est.bytesRecibidos, sinTema: est.sinTema, uniones: est.uniones }; }
      function cierra() { sale(); oy = vacios(); temas = Object.create(null); }
      return { clave: clave, une: une, sale: sale, publica: publica, escucha: escucha, al: al, estado: function () { return estado; }, motivo: function () { return porque; },
        yo: yo, participantes: participantes, info: info, cierra: cierra,
        nombre: nombre, permisos: permisos, atributos: atributos, publicaciones: publicaciones, suscribe: suscribe, microfono: microfono, microAbierto: microAbierto };
    }
    function info() { return Object.keys(salas).map(function (k?: any) { return salas[k].info(); }); }
    function cierra() { cerrada = true; Object.keys(salas).forEach(function (k?: any) { salas[k].cierra(); }); salas = Object.create(null); }
    return { sala: sala, salas: function () { return Object.keys(salas); }, info: info, cierra: cierra, cargada: function () { return !!LK; } };
  }
  return { CLAVE: CLAVE, TEMA: TEMA, EVENTOS: EVENTOS, FUENTES: FUENTES, MICRO_CAPTURA: MICRO_CAPTURA, MICRO_PUBLICA: MICRO_PUBLICA, SALA_LK: SALA_LK, CONEXION_LK: CONEXION_LK,
    urlWs: urlWs, motivo: motivo, credencialesValidas: credencialesValidas, permisosDe: permisosDe, crea: crea };
})();
// [puro:fin]

/** Lo que el legado le da (el talón de apps/web/motor/37_red.js). */
export interface DepsRed {
  /** la importación dinámica de livekit-client: se escribe en el talón para que Vite lo trocee como antes; se llama la primera vez que una sala se une */
  carga(): Promise<unknown>;
  /** la URL de la página (location.href), contra la que se resuelve la de la sala */
  base(): string;
  /** la consola de la página (los avisos de la red) */
  consola?: { warn(...a: unknown[]): void } | null;
}
/** La red: { sala(clave), salas(), info(), cierra(), cargada() } (RedPuro.crea). */
export type Red = ReturnType<typeof RedPuro.crea>;
export const ID_RED = "red-salas";

/** El manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?red=0 lo apaga (y con él, la presencia, que lo consume).
 *  Montado no conecta nada ni descarga livekit-client: eso pasa la primera vez que alguien se une a una sala. Su libera() cierra todas las salas (sale de cada una,
 *  suelta sus escuchas y sus temas) y la red queda cerrada: una sala nueva da null. */
export function manifiestoRed(d: DepsRed) {
  return {
    id: ID_RED, version: 1,
    consume: [] as string[],
    expone: ["Red"],
    eventos: { escucha: [] as string[], emite: ["red:estado"] },
    bandera: { defecto: true, url: "red" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // sin dibujo: conexiones WebRTC de datos (y, con la voz, de audio)
    fases: {},
    mundos: "todos" as const,   // A3-6a: de todo mundo (COMPONENTES §3.2)
    monta: function (n: { emite(ev: string, datos?: unknown): number }): Red {
      return RedPuro.crea({ carga: function () { return d.carga(); }, base: function () { return d.base(); },
        alEstado: function (x: unknown) { n.emite("red:estado", x); },
        avisa: function (t: string) { try { if (d.consola) d.consola.warn("red: " + t); } catch (e) {} } });
    },
    actualiza: {},
    libera: function (api: unknown) { if (api) (api as Red).cierra(); }
  };
}
