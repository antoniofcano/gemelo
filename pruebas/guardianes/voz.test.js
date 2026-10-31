"use strict";
// La voz de las visitas guiadas (F3d; ADR-0026, decisiones 157-162): el componente «voz-guiada» (apps/web/motor/45_voz.js) y lo que la red (37_red.js) le da para el
// audio. En Node, SIN navegador, SIN LiveKit y SIN Web Audio:
//   · VozPuro (su trozo puro): sala guiada, papel, permisos, turno, ganancia por distancia, escucha desde la cámara o la cabeza, plano o espacial, a quién
//     suscribirse, si se abre el micrófono y quién habla; con propiedades de fast-check donde encajan (ganancia, escucha, suscripción, abrir, quién habla).
//   · RedPuro con un livekit-client de mentira: publicaciones de audio, suscribirse, la pista (su MediaStreamTrack), quién habla, permisos en vivo, atributos y el
//     micrófono (captura con cancelación de eco y supresión de ruido; preset «speech» con DTX; cerrar despublica y para la captura).
//   · VozMotor (su trozo [motor:…]) con una sala, una presencia, un DOM y un AudioContext de mentira: entra solo en una guiada, <audio> silenciado → Web Audio,
//     plano antes del gesto y con el micro abierto sin auriculares, la ganancia por la distancia al avatar, la escucha en la cabeza en VR, el micrófono solo con
//     permiso y gesto, se cierra solo si la api quita el permiso, «voz:habla», salir suelta todo, libera cierra el AudioContext; y que no hay grabación.
// Lo de Chrome con micrófono simulado y LiveKit real es pruebas/guardianes/voz_dev.test.js (opcional, GEMELO_DOCKER=1, por el banco).
const test = require("node:test"), assert = require("node:assert");
const fc = require("fast-check");
const { lee, path } = require("./_util");
const contratoModulos = require(path.join(__dirname, "..", "contrato_modulos.js"));

const sinCabecera = s => s.startsWith(contratoModulos.MARCA_I) ? s.slice(s.indexOf(contratoModulos.MARCA_F) + contratoModulos.MARCA_F.length + 1) : s;
const VOZ = lee("apps/web/motor/45_voz.js"), RED = lee("apps/web/motor/37_red.js");
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return s.slice(i, f); };
const PURO = trozo(VOZ, "// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo(VOZ, "// [motor:inicio]", "// [motor:fin]");
const V = new Function("\"use strict\";\n" + PURO + "\nreturn VozPuro;")();
const RedPuro = new Function("\"use strict\";\n" + trozo(RED, "// [puro:inicio]", "// [puro:fin]") + "\nreturn RedPuro;")();
const IFACES = JSON.parse(lee("contratos/interfaces.json"));
const ROLES = JSON.parse(lee("contratos/livekit-roles.json"));
const espera = (ms = 0) => new Promise(r => setTimeout(r, ms));
const cerca = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ---------- VozPuro
test("VozPuro: solo la sala guiada-<evento> del contrato (livekit-roles v6), el id del evento y el papel de los metadatos", () => {
  assert.strictEqual(V.SALA.source, new RegExp(ROLES.salas.guiada.patron).source, "el mismo patrón que livekit-roles.json → salas.guiada.patron");
  for (const s of ["guiada-1", "guiada-12", "guiada-2147483647"]) assert.ok(V.esGuiada(s), s);
  for (const s of ["hituelo-libre", "hituelo-visita", "guiada-", "guiada-0", "guiada-01", "guiada-x", "Guiada-1", "", null, 12]) assert.ok(!V.esGuiada(s), String(s));
  assert.strictEqual(V.evento(12), 12); assert.strictEqual(V.evento("12"), 12);
  for (const x of [0, -1, 1.5, "0", "012", "a", 2147483648, null, undefined]) assert.strictEqual(V.evento(x), null, String(x));
  assert.strictEqual(V.papelDe(JSON.stringify({ alias: "Ana", papel: "guia" })), "guia");
  assert.strictEqual(V.papelDe(JSON.stringify({ papel: "familia" })), "familia"); assert.strictEqual(V.papelDe(JSON.stringify({ papel: "oficina" })), "oficina");
  for (const m of ["", "{", "null", JSON.stringify({ papel: "admin" }), JSON.stringify({ alias: "x" })]) assert.strictEqual(V.papelDe(m), "", m);
  assert.deepStrictEqual(Object.keys(ROLES.roles_guiada).filter(k => !k.startsWith("$")).sort(), ["familia", "guia", "oficina"], "los papeles del contrato");
});

test("VozPuro: hablar = publicar micrófono, como lo aplica LiveKit; los permisos de cada papel en el contrato", () => {
  assert.ok(V.puedeHablar({ publicar: true, fuentes: ["microphone"] }));
  assert.ok(V.puedeHablar({ publicar: true, fuentes: [] }), "con publicar y sin fuentes, LiveKit deja cualquiera");
  assert.ok(!V.puedeHablar({ publicar: true, fuentes: ["camera"] })); assert.ok(!V.puedeHablar({ publicar: false, fuentes: ["microphone"] })); assert.ok(!V.puedeHablar(null));
  const deRol = r => RedPuro.permisosDe({ canPublish: r.canPublish, canPublishSources: r.canPublishSources.map(f => RedPuro.FUENTES.indexOf(f)), canPublishData: r.canPublishData });
  assert.ok(V.puedeHablar(deRol(ROLES.roles_guiada.guia)), "el guía habla"); assert.ok(V.puedeHablar(deRol(ROLES.roles_guiada.oficina)), "la oficina habla");
  assert.ok(!V.puedeHablar(deRol(ROLES.roles_guiada.familia)), "la familia, sin la palabra, no");
  for (const r of Object.values(ROLES.roles)) assert.ok(!V.puedeHablar(deRol(r)), "en las salas fijas nadie habla");
});

test("VozPuro: el turno (palabra_hasta) en segundos y quién es prioritaria", () => {
  const t0 = Date.parse("2026-10-31T10:00:00Z");
  assert.strictEqual(V.turno({ palabra_hasta: "2026-10-31T10:02:00Z" }, t0), 120);
  assert.strictEqual(V.turno({ palabra_hasta: "2026-10-31T10:00:00.400Z" }, t0), 1, "redondea hacia arriba");
  assert.strictEqual(V.turno({ palabra_hasta: "2026-10-31T09:59:00Z" }, t0), 0, "vencido");
  for (const a of [null, {}, { palabra_hasta: "" }, { palabra_hasta: "mañana" }, { mano: "2026-10-31T10:00:00Z" }]) assert.strictEqual(V.turno(a, t0), null, JSON.stringify(a));
  assert.ok(V.prioritaria("guia", null) && V.prioritaria("oficina", null) && V.prioritaria("familia", 30));
  assert.ok(!V.prioritaria("familia", 0) && !V.prioritaria("familia", null) && !V.prioritaria("", null));
});

test("VozPuro: la ganancia por distancia (ley inversa, ref 2 m, rolloff 1; las prioritarias no bajan de 0,25; las demás, cortadas a más de 40 m)", () => {
  const D = V.DIST;
  assert.deepStrictEqual([D.ref, D.rolloff, D.corte, D.minimo], [2, 1, 40, 0.25], "los parámetros documentados en la cabecera de 45_voz.js");
  assert.strictEqual(V.ganancia(0, false), 1); assert.strictEqual(V.ganancia(2, false), 1);
  assert.ok(cerca(V.ganancia(4, false), 0.5)); assert.ok(cerca(V.ganancia(10, false), 0.2));
  assert.ok(cerca(V.ganancia(10, true), 0.25), "el guía a 10 m no baja de 0,25"); assert.ok(cerca(V.ganancia(4, true), 0.5));
  assert.strictEqual(V.ganancia(41, false), 0); assert.ok(cerca(V.ganancia(500, true), 0.25));
  for (const d of [NaN, -1, Infinity, undefined]) assert.strictEqual(V.ganancia(d, true), D.sinSitio, String(d));
  // el panner solo pone la dirección: sin atenuación propia
  assert.strictEqual(V.PANNER.panningModel, "HRTF"); assert.strictEqual(V.PANNER.rolloffFactor, 0); assert.strictEqual(V.PANNER.refDistance, 1);
  const dist = fc.double({ min: 0, max: 5000, noNaN: true });
  fc.assert(fc.property(dist, dist, fc.boolean(), (a, b, p) => {
    const ga = V.ganancia(Math.min(a, b), p), gb = V.ganancia(Math.max(a, b), p);
    return ga >= gb && ga >= 0 && ga <= 1 && gb >= 0 && gb <= 1;   // nunca sube al alejarse, y está en [0, 1]
  }));
  fc.assert(fc.property(dist, d => V.ganancia(d, true) >= D.minimo && V.ganancia(d, true) >= V.ganancia(d, false)));
});

test("VozPuro: la escucha mira a −z y tiene arriba +y; girada, adelante y arriba siguen siendo unitarios y perpendiculares", () => {
  let o = V.oyente([1, 2, 3], [0, 0, 0, 1]);
  assert.deepStrictEqual(o.p, [1, 2, 3]); assert.deepStrictEqual(o.f.map(x => x + 0), [0, 0, -1]); assert.deepStrictEqual(o.u.map(x => x + 0), [0, 1, 0]);
  const s = Math.sin(Math.PI / 4), c = Math.cos(Math.PI / 4);
  o = V.oyente([0, 0, 0], [0, s, 0, c]);   // 90° a la izquierda (eje +y): mira a −x
  assert.ok(cerca(o.f[0], -1, 1e-12) && cerca(o.f[1], 0, 1e-12) && cerca(o.f[2], 0, 1e-12), JSON.stringify(o.f));
  const comp = fc.double({ min: -1, max: 1, noNaN: true });
  fc.assert(fc.property(comp, comp, comp, comp, (x, y, z, w) => {
    const L = Math.hypot(x, y, z, w); if (L < 1e-3) return true;
    const q = [x / L, y / L, z / L, w / L], r = V.oyente([0, 0, 0], q), f = r.f, u = r.u;
    return cerca(Math.hypot(...f), 1, 1e-9) && cerca(Math.hypot(...u), 1, 1e-9) && cerca(f[0] * u[0] + f[1] * u[1] + f[2] * u[2], 0, 1e-9);
  }));
});

test("VozPuro: plano o espacial (con el micro abierto y sin auriculares, plano: la cancelación de eco de Chrome solo actúa sobre elementos de medios)", () => {
  assert.strictEqual(V.modo({ forzado: "", micro: false, auriculares: false, contexto: true }), "espacial");
  assert.strictEqual(V.modo({ forzado: "", micro: true, auriculares: false, contexto: true }), "plano");
  assert.strictEqual(V.modo({ forzado: "", micro: true, auriculares: true, contexto: true }), "espacial");
  assert.strictEqual(V.modo({ forzado: "", micro: false, auriculares: false, contexto: false }), "plano", "sin AudioContext (antes del gesto), plano");
  assert.strictEqual(V.modo({ forzado: "plano", micro: false, auriculares: true, contexto: true }), "plano");
  assert.strictEqual(V.modo({ forzado: "espacial", micro: true, auriculares: false, contexto: true }), "espacial");
  fc.assert(fc.property(fc.constantFrom("", "plano", "espacial"), fc.boolean(), fc.boolean(), fc.boolean(), (f, m, a, c) => {
    const r = V.modo({ forzado: f, micro: m, auriculares: a, contexto: c });
    return (r === "plano" || r === "espacial") && (!c ? r === "plano" : true) && (f === "" && c && m && !a ? r === "plano" : true);
  }));
});

test("VozPuro: a quién suscribirse (solo micrófonos, como mucho 4, el guía siempre, luego la palabra, la oficina y el resto)", () => {
  const info = { g: { papel: "guia", turno: null }, o: { papel: "oficina", turno: null }, f1: { papel: "familia", turno: 90 }, f2: { papel: "familia", turno: null } };
  const pubs = [{ identidad: "f2", sid: "A2", fuente: "microphone" }, { identidad: "o", sid: "AO", fuente: "microphone" }, { identidad: "f1", sid: "A1", fuente: "microphone" },
    { identidad: "g", sid: "AG", fuente: "microphone" }, { identidad: "f2", sid: "S", fuente: "screen_share_audio" }];
  assert.deepStrictEqual(V.aSuscribir(pubs, id => info[id]), ["AG", "A1", "AO", "A2"]);
  assert.deepStrictEqual(V.aSuscribir(pubs, id => info[id], 2), ["AG", "A1"]);
  assert.deepStrictEqual(V.aSuscribir([], () => ({})), []); assert.deepStrictEqual(V.aSuscribir(null, () => ({})), []);
  const pub = fc.record({ identidad: fc.constantFrom("g", "o", "f1", "f2", "x"), sid: fc.string({ minLength: 1, maxLength: 4 }), fuente: fc.constantFrom("microphone", "camera", "screen_share_audio") });
  fc.assert(fc.property(fc.array(pub, { maxLength: 12 }), fc.integer({ min: 0, max: 6 }), (ps, max) => {
    const r = V.aSuscribir(ps, id => info[id] || {}, max), mic = ps.filter(p => p.fuente === "microphone");
    const hayGuia = mic.find(p => p.identidad === "g");
    return r.length <= max && r.length === Math.min(max, mic.length) && r.every(s => mic.some(p => p.sid === s)) && (!hayGuia || max === 0 || r[0] === mic.find(p => p.identidad === "g").sid);
  }));
});

test("VozPuro: el micrófono solo se abre dentro de una guiada, con permiso y tras un gesto (y no dos veces)", () => {
  const todo = { dentro: true, guiada: true, micro: "cerrado", puede: true, gesto: true };
  assert.deepStrictEqual(V.decideAbrir(todo), { abre: true, motivo: "ok" });
  assert.strictEqual(V.decideAbrir(Object.assign({}, todo, { dentro: false })).motivo, "fuera");
  assert.strictEqual(V.decideAbrir(Object.assign({}, todo, { guiada: false })).motivo, "no_guiada");
  assert.strictEqual(V.decideAbrir(Object.assign({}, todo, { puede: false })).motivo, "sin_permiso");
  assert.strictEqual(V.decideAbrir(Object.assign({}, todo, { gesto: false })).motivo, "sin_gesto");
  assert.strictEqual(V.decideAbrir(Object.assign({}, todo, { micro: "abierto" })).motivo, "ya_abierto");
  fc.assert(fc.property(fc.boolean(), fc.boolean(), fc.constantFrom("cerrado", "abriendo", "abierto"), fc.boolean(), fc.boolean(), (d, g, m, p, ge) => {
    return V.decideAbrir({ dentro: d, guiada: g, micro: m, puede: p, gesto: ge }).abre === (d && g && m === "cerrado" && p && ge);
  }));
  assert.strictEqual(V.motivoMicro({ name: "NotAllowedError" }), "micro_denegado"); assert.strictEqual(V.motivoMicro({ name: "NotFoundError" }), "sin_micro"); assert.strictEqual(V.motivoMicro(new Error("x")), "error_micro");
});

test("VozPuro: quién habla (empieza, cambia de nivel en ≥ 0,1, calla), y aplicar los avisos deja exactamente a los que hablan", () => {
  let r = V.difHablan({}, [{ identidad: "g", nivel: 0.42, yo: false }, { identidad: "yo", nivel: 0.1, yo: true }]);
  assert.deepStrictEqual(r.eventos, [{ identidad: "g", nivel: 0.42, habla: true, yo: false }, { identidad: "yo", nivel: 0.1, habla: true, yo: true }]);
  r = V.difHablan(r.ahora, [{ identidad: "g", nivel: 0.45 }]);
  assert.deepStrictEqual(r.eventos, [{ identidad: "yo", nivel: 0, habla: false, yo: true }], "un cambio de 0,03 no se avisa; quien calla, sí");
  r = V.difHablan(r.ahora, [{ identidad: "g", nivel: 0.6 }]); assert.deepStrictEqual(r.eventos, [{ identidad: "g", nivel: 0.6, habla: true, yo: false }]);
  assert.deepStrictEqual(V.difHablan(r.ahora, [{ identidad: "g", nivel: 7 }]).eventos[0].nivel, 1, "nivel recortado a [0, 1]");
  const h = fc.record({ identidad: fc.constantFrom("a", "b", "c", "d"), nivel: fc.double({ min: -1, max: 2, noNaN: true }), yo: fc.boolean() });
  fc.assert(fc.property(fc.array(fc.array(h, { maxLength: 5 }), { maxLength: 6 }), rondas => {
    let antes = {}; const hablan = new Set();
    for (const l of rondas) {
      const x = V.difHablan(antes, l);
      for (const e of x.eventos) { if (e.habla) hablan.add(e.identidad); else hablan.delete(e.identidad); if (e.nivel < 0 || e.nivel > 1) return false; }
      antes = x.ahora;
      if ([...hablan].sort().join() !== Object.keys(antes).sort().join()) return false;
    }
    return true;
  }));
});

// ---------- la red con audio (RedPuro y un livekit-client de mentira)
function lkAudio() {
  const RoomEvent = { ParticipantConnected: "pc", ParticipantDisconnected: "pd", DataReceived: "dr", Reconnecting: "rc", Reconnected: "rd", Disconnected: "dc",
    TrackPublished: "tp", TrackUnpublished: "tu", TrackSubscribed: "ts", TrackUnsubscribed: "tx", ActiveSpeakersChanged: "as", ParticipantPermissionsChanged: "pp", ParticipantAttributesChanged: "pa" };
  const salas = [];
  class Room {
    constructor(o) { this.opciones = o; this.oy = {}; this.remoteParticipants = new Map(); this.name = ""; salas.push(this);
      const yo = this, pubs = new Map();
      this.localParticipant = { identity: null, metadata: "", attributes: {}, permissions: null, llamadas: [],
        getTrackPublication(f) { return pubs.get(f) || null; },
        setMicrophoneEnabled(si, cap, pu) { this.llamadas.push(["abre", si, cap, pu]); if (!(this.permissions && this.permissions.canPublish)) return Promise.reject(Object.assign(new Error("insufficient permissions"), { name: "Error" }));
          pubs.set("microphone", { track: { parada: false }, isMuted: false }); return Promise.resolve(); },
        unpublishTrack(t, parar) { this.llamadas.push(["despublica", parar]); t.parada = !!parar; pubs.delete("microphone"); return Promise.resolve(); } };
      this.pubsLocales = pubs; yo.conectada = false; }
    on(ev, fn) { (this.oy[ev] = this.oy[ev] || []).push(fn); return this; }
    emite(ev, ...a) { (this.oy[ev] || []).forEach(fn => fn(...a)); }
    connect(url, token) { this.conectada = true; this.name = "guiada-7"; this.localParticipant.identity = "h_yo"; this.localParticipant.permissions = { canPublish: token === "guia", canPublishSources: token === "guia" ? [2] : [], canPublishData: true }; return Promise.resolve(); }
    disconnect() { this.conectada = false; this.emite(RoomEvent.Disconnected, 1); return Promise.resolve(); }
    entra(identity, metadata) { const p = { identity, metadata, attributes: {}, trackPublications: new Map(), audioLevel: 0 }; this.remoteParticipants.set(identity, p); this.emite(RoomEvent.ParticipantConnected, p); return p; }
    publica(p, sid, source, kind = "audio") { const yo = this, pb = { trackSid: sid, source, kind, isSubscribed: false, setSubscribed(si) { this.isSubscribed = si; const t = { mediaStreamTrack: { id: "mst-" + sid } }; yo.emite(si ? RoomEvent.TrackSubscribed : RoomEvent.TrackUnsubscribed, t, pb, p); } };
      p.trackPublications.set(sid, pb); this.emite(RoomEvent.TrackPublished, pb, p); return pb; }
  }
  return { Room, RoomEvent, DisconnectReason: { CLIENT_INITIATED: 1, PARTICIPANT_REMOVED: 4, DUPLICATE_IDENTITY: 2 }, Track: { Source: { Microphone: "microphone" } }, AudioPresets: { speech: { maxBitrate: 24000 }, music: { maxBitrate: 48000 } }, salas };
}

test("Red con audio: publicaciones, suscribirse, la pista, quién habla, permisos en vivo, atributos y el micrófono (con cancelación de eco y preset de voz)", async () => {
  const LK = lkAudio(), r = RedPuro.crea({ carga: () => Promise.resolve(LK), base: () => "https://gemelo.test/finca/" });
  const s = r.sala("guiada");
  assert.deepStrictEqual(Object.keys(s).sort(), IFACES.apis_de_componentes["red-salas"].sala.slice().sort(), "miembros de una sala (interfaces.json)");
  assert.strictEqual(s.nombre(), ""); assert.strictEqual(s.permisos(), null); assert.deepStrictEqual(s.publicaciones(), []); assert.strictEqual(s.microAbierto(), false);
  await assert.rejects(s.microfono(true), /no estás/); assert.strictEqual(await s.microfono(false), true, "cerrar fuera no falla");
  const ev = []; for (const e of ["publicada", "despublicada", "pista", "pista-fuera", "hablan", "permisos", "atributos"]) s.al(e, d => ev.push([e, d]));
  assert.strictEqual(await s.une({ url: "/rtc", token: "familia" }), true);
  const room = LK.salas[0];
  assert.deepStrictEqual(room.opciones, RedPuro.SALA_LK); assert.strictEqual(s.nombre(), "guiada-7");
  assert.deepStrictEqual(s.permisos(), { publicar: false, fuentes: [], datos: true });
  // publicaciones: solo audio; suscribirse da la pista con su MediaStreamTrack
  const g = room.entra("h_guia", JSON.stringify({ papel: "guia" }));
  room.publica(g, "TR_A", "microphone"); room.publica(g, "TR_V", "camera", "video");
  assert.deepStrictEqual(ev.splice(0), [["publicada", { identidad: "h_guia", sid: "TR_A", fuente: "microphone" }]], "el vídeo no cuenta");
  assert.deepStrictEqual(s.publicaciones(), [{ identidad: "h_guia", sid: "TR_A", fuente: "microphone", suscrita: false }]);
  assert.strictEqual(s.suscribe("h_guia", "TR_V", true), false, "no se pide vídeo"); assert.strictEqual(s.suscribe("nadie", "TR_A", true), false);
  assert.strictEqual(s.suscribe("h_guia", "TR_A", true), true);
  assert.deepStrictEqual(ev.splice(0), [["pista", { identidad: "h_guia", sid: "TR_A", fuente: "microphone", mst: { id: "mst-TR_A" } }]]);
  s.suscribe("h_guia", "TR_A", false); assert.deepStrictEqual(ev.splice(0), [["pista-fuera", { identidad: "h_guia", sid: "TR_A", fuente: "microphone" }]]);
  room.emite("tu", g.trackPublications.get("TR_A"), g); assert.deepStrictEqual(ev.splice(0), [["despublicada", { identidad: "h_guia", sid: "TR_A", fuente: "microphone" }]]);
  // quién habla (incluido tú)
  g.audioLevel = 0.5; room.localParticipant.audioLevel = 0.2;
  room.emite("as", [g, room.localParticipant, null]);
  assert.deepStrictEqual(ev.splice(0), [["hablan", [{ identidad: "h_guia", nivel: 0.5, yo: false }, { identidad: "h_yo", nivel: 0.2, yo: true }]]]);
  // atributos (los pone la api): solo texto
  g.attributes = { mano: "2026-10-31T10:00:00Z", raro: 7 }; room.emite("pa", { mano: "…" }, g);
  assert.deepStrictEqual(ev.splice(0), [["atributos", { identidad: "h_guia", atributos: { mano: "2026-10-31T10:00:00Z" } }]]);
  assert.deepStrictEqual(s.atributos("h_guia"), { mano: "2026-10-31T10:00:00Z" }); assert.deepStrictEqual(s.atributos(), {}); assert.strictEqual(s.atributos("nadie"), null);
  // sin permiso, el micrófono no se abre (lo rechaza LiveKit)
  await assert.rejects(s.microfono(true), /insufficient/);
  // la api da la palabra en vivo (UpdateParticipant): llega «permisos» y ya se puede
  room.localParticipant.permissions = { canPublish: true, canPublishSources: [2], canPublishData: true }; room.emite("pp", null, room.localParticipant);
  assert.deepStrictEqual(ev.splice(0), [["permisos", { publicar: true, fuentes: ["microphone"], datos: true }]]);
  room.emite("pp", null, g); assert.deepStrictEqual(ev.splice(0), [], "los permisos de otro no se avisan");
  assert.strictEqual(await s.microfono(true), true); assert.strictEqual(s.microAbierto(), true);
  const ab = room.localParticipant.llamadas.filter(l => l[0] === "abre").pop();
  assert.deepStrictEqual(ab[2], { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, "captura con cancelación de eco y supresión de ruido");
  assert.deepStrictEqual(ab[3], { audioPreset: { maxBitrate: 24000 }, dtx: true }, "preset de voz (speech, 24 kbps) con DTX");
  const pista = room.pubsLocales.get("microphone").track;
  assert.strictEqual(await s.microfono(false), true); assert.strictEqual(s.microAbierto(), false);
  assert.deepStrictEqual(room.localParticipant.llamadas.pop(), ["despublica", true]); assert.strictEqual(pista.parada, true, "cerrar para la captura (el piloto del navegador se apaga)");
  await s.sale(); assert.strictEqual(s.nombre(), ""); assert.strictEqual(s.microAbierto(), false);
});

// ---------- VozMotor con una sala, una presencia, un DOM y un AudioContext de mentira
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); } }
class Q { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } copy(q) { return this.set(q.x, q.y, q.z, q.w); }
  setFromAxisAngle(e, a) { const s = Math.sin(a / 2); return this.set(e.x * s, e.y * s, e.z * s, Math.cos(a / 2)); }
  multiply(b) { const a = this; return this.set(a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y, a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z, a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z); } }
function param(v = 0) { return { value: v, setTargetAtTime(x) { this.value = x; } }; }
class Nodo { constructor(tipo) { this.tipo = tipo; this.a = []; this.desconectado = false; } connect(n) { this.a.push(n); return n; } disconnect() { this.desconectado = true; this.a = []; } }
function audioFalso(cuenta) {
  class AC {
    constructor(o) { cuenta.contextos++; this.opc = o; this.state = "running"; this.currentTime = 0; this.destination = new Nodo("salida"); cuenta.ac = this;
      this.listener = { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(), forwardZ: param(-1), upX: param(), upY: param(1), upZ: param() }; }
    createGain() { const g = new Nodo("ganancia"); g.gain = param(1); return g; }
    createMediaStreamSource(ms) { cuenta.fuentes.push(ms); return new Nodo("fuente"); }
    createPanner() { const p = new Nodo("panner"); p.positionX = param(); p.positionY = param(); p.positionZ = param(); return p; }
    resume() { this.state = "running"; return Promise.resolve(); }
    close() { cuenta.cerrados++; this.state = "closed"; return Promise.resolve(); }
  }
  function PannerNode(ctx, o) { const p = ctx.createPanner(); Object.assign(p, o); cuenta.panners.push(p); return p; }
  return { AC, PannerNode };
}
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.parentNode = null; this.children = []; this.muted = false; this.volume = 1; this.paused = true; this.hidden = false; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; }
  play() { if (this.bloquea) return Promise.reject(new Error("NotAllowedError")); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
/** una sala de la red de mentira (la api de 37_red.js) */
function salaFalsa(nombre = "guiada-7") {
  const oy = {}, s = {
    _estado: "fuera", _nombre: nombre, _perm: { publicar: false, fuentes: [], datos: true }, _gente: [], _pubs: [], _atr: {}, _micro: false, suscritas: [], microLlamadas: [], une: null, salidas: 0, falloMicro: null,
    clave: "guiada",
    al(e, fn) { (oy[e] = oy[e] || []).push(fn); return () => { const l = oy[e], i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; },
    emite(e, d) { (oy[e] || []).slice().forEach(fn => fn(d)); }, oyentes(e) { return (oy[e] || []).length; },
    estado() { return s._estado; }, nombre() { return s._estado === "dentro" ? s._nombre : ""; }, permisos() { return s._estado === "dentro" ? s._perm : null; },
    yo() { return s._estado === "dentro" ? { identidad: "h_yo", metadatos: JSON.stringify({ papel: s._papel || "familia" }) } : null; },
    participantes() { return s._gente; }, atributos(id) { return id === undefined ? s._atr.h_yo || {} : s._atr[id] || {}; },
    publicaciones() { return s._pubs; },
    suscribe(id, sid, si) { const p = s._pubs.find(x => x.sid === sid && x.identidad === id); if (!p) return false; p.suscrita = si; s.suscritas.push([sid, si]); return true; },
    microfono(si) { s.microLlamadas.push(si); if (si && s.falloMicro) return Promise.reject(s.falloMicro); s._micro = !!si; return Promise.resolve(true); },
    microAbierto() { return s._micro; },
    sale() { s.salidas++; s._estado = "fuera"; s.emite("estado", { sala: "guiada", estado: "fuera", motivo: "propio" }); return Promise.resolve(); }
  };
  s.une = (cred) => { s.cred = cred; s._estado = "dentro"; s.emite("estado", { sala: "guiada", estado: "dentro", motivo: "" }); return Promise.resolve(true); };
  return s;
}
function montaVoz({ busqueda = "", nombre = "guiada-7", token = { url: "/rtc", token: "t", sala: "guiada-7", identidad: "h_yo", papel: "familia" }, estadoToken = 200, cabezas = {} } = {}) {
  const cuenta = { contextos: 0, cerrados: 0, fuentes: [], panners: [], fetch: [], ac: null };
  const { AC, PannerNode } = audioFalso(cuenta), sala = salaFalsa(nombre), emitidos = [], limpias = [], gesto = { isActive: false };
  const R = { sala: clave => (clave === "guiada" || clave === "visita") ? sala : null };
  const P = { cabeza: id => cabezas[id] || null };
  const ventana = { oy: {}, AudioContext: AC, addEventListener(n, f) { (this.oy[n] = this.oy[n] || []).push(f); }, removeEventListener(n, f) { const l = this.oy[n] || []; l.splice(l.indexOf(f), 1); }, dispara(n) { (this.oy[n] || []).slice().forEach(f => f({})); } };
  const body = new El("body"), documento = { createElement: t => new El(t), body };
  const camara = { pos: new V3(0, 1.6, 0), q: new Q(), quaternion: new Q(), getWorldPosition(v) { return v.copy(this.pos); }, getWorldQuaternion(q) { return q.copy(this.q); } };
  const VRX = { on: false, cab: new V3(), rig: { yaw: 0 } };
  const n = { emite: (e, d) => { emitidos.push([e, d]); return 0; }, on: (e, f) => { (n.oy[e] = n.oy[e] || []).push(f); return f; }, oy: {}, limpia: f => { limpias.push(f); return f; } };
  const g = { window: ventana, location: { search: busqueda }, document: documento, navigator: { userAgent: "Node", userActivation: gesto }, console: { warn() {}, error() {}, log() {} },
    fetch: (u, o) => { cuenta.fetch.push([u, o.method, JSON.parse(o.body)]); return Promise.resolve({ ok: estadoToken === 200, status: estadoToken, json: () => Promise.resolve(estadoToken === 200 ? token : { error: "guiada_solo_inscritos", mensaje: "Esta visita es para las familias apuntadas." }) }); },
    MediaStream: function (pistas) { this.pistas = pistas; }, PannerNode, THREE: { Quaternion: Q, Vector3: V3 }, camera: camara, VRX };
  const nombres = Object.keys(g);
  const VozMotor = new Function(...nombres, "\"use strict\";\n" + PURO + MOTOR + "\nreturn VozMotor;")(...nombres.map(k => g[k]));
  const api = VozMotor(n, R, P);
  return { api, sala, cuenta, emitidos, ventana, body, camara, VRX, gesto, n, limpias, g, desbloquea: () => ventana.dispara("pointerdown"), habla: e => (n.oy[e] || []).forEach(f => f({ lineas: [] })) };
}
const ultimoEstado = m => m.emitidos.filter(e => e[0] === "voz:estado").map(e => e[1]).pop();

test("VozMotor: montado no crea nada; Voz.entra pide el token de la guiada (F3c) y solo se queda si la sala es guiada-<evento>", async () => {
  let m = montaVoz();
  assert.deepStrictEqual(Object.keys(m.api).sort(), IFACES.apis_de_componentes["voz-guiada"].miembros.slice().sort(), "la api (interfaces.json)");
  assert.strictEqual(m.cuenta.fetch.length, 0); assert.strictEqual(m.cuenta.contextos, 0); assert.strictEqual(m.body.children.length, 0);
  m.desbloquea(); assert.strictEqual(m.cuenta.contextos, 0, "sin estar en una guiada, un gesto no crea AudioContext");
  assert.strictEqual(m.g.window.__voz().dentro, false);
  assert.strictEqual(await m.api.entra("x"), false); assert.strictEqual(m.cuenta.fetch.length, 0);
  assert.strictEqual(await m.api.entra(7), true);
  assert.deepStrictEqual(m.cuenta.fetch, [["/api/presencia/guiadas/7/token", "POST", { dispositivo: "escritorio" }]]);
  assert.deepStrictEqual(m.sala.cred, { url: "/rtc", token: "t" });
  let e = m.api.estado(); assert.strictEqual(e.sala, "guiada-7"); assert.ok(e.dentro && e.guiada); assert.strictEqual(e.papel, "familia"); assert.strictEqual(e.puede, false); assert.strictEqual(e.micro, "cerrado");
  assert.deepStrictEqual(ultimoEstado(m), e, "voz:estado lleva lo mismo que Voz.estado()");
  // una sala que no es guiada: se sale y no se engancha
  m = montaVoz({ nombre: "hituelo-libre" });
  assert.strictEqual(await m.api.entra(7), false); assert.strictEqual(m.sala.salidas, 1); assert.strictEqual(m.api.estado().motivo, "no_guiada"); assert.strictEqual(m.sala.oyentes("pista"), 0);
  // la api la niega (403 de F3c): su error como motivo, sin sala
  m = montaVoz({ estadoToken: 403 });
  assert.strictEqual(await m.api.entra(7), false); assert.strictEqual(m.api.estado().motivo, "guiada_solo_inscritos"); assert.strictEqual(m.sala.cred, undefined);
  // ?guiada=<evento> entra al montarse; usa(clave) solo si la sala ya está dentro y es guiada
  m = montaVoz({ busqueda: "?guiada=9" }); await espera(); assert.strictEqual(m.cuenta.fetch[0][0], "/api/presencia/guiadas/9/token");
  m = montaVoz(); assert.strictEqual(m.api.usa("visita"), false, "fuera, no");
  m.sala._estado = "dentro"; assert.strictEqual(m.api.usa("visita"), true); assert.ok(m.sala.oyentes("pista") > 0);
});

test("VozMotor: oír. Se suscribe a los micrófonos por prioridad; cada pista a un <audio> silenciado y de él a Web Audio (panner HRTF); plano hasta el gesto", async () => {
  const m = montaVoz({ cabezas: { h_guia: { x: 0, y: 1.6, z: -10 } } }), s = m.sala;
  s._gente = [{ identidad: "h_guia", metadatos: JSON.stringify({ papel: "guia" }) }, { identidad: "h_f", metadatos: JSON.stringify({ papel: "familia" }) }];
  s._pubs = [{ identidad: "h_f", sid: "AF", fuente: "microphone", suscrita: false }, { identidad: "h_guia", sid: "AG", fuente: "microphone", suscrita: false }];
  await m.api.entra(7);
  assert.deepStrictEqual(s.suscritas, [["AF", true], ["AG", true]], "las dos (caben en 4)");
  s.emite("pista", { identidad: "h_guia", sid: "AG", fuente: "microphone", mst: { id: "mst" } });
  assert.strictEqual(m.body.children.length, 1); const el = m.body.children[0];
  assert.strictEqual(el.tagName, "AUDIO"); assert.deepStrictEqual(el.srcObject.pistas, [{ id: "mst" }]); assert.strictEqual(el.paused, false, "se reproduce");
  assert.strictEqual(el.muted, false, "sin AudioContext todavía (no ha habido gesto): suena plano por el <audio>"); assert.strictEqual(m.api.estado().modo, "plano");
  // el gesto: AudioContext propio, la fuente se toma DEL ELEMENTO (Chromium 933677), ganancia → panner HRTF → salida; el <audio> se silencia
  m.desbloquea(); await espera();
  assert.strictEqual(m.cuenta.contextos, 1); assert.deepStrictEqual(m.cuenta.ac.opc, { latencyHint: "interactive" });
  assert.strictEqual(m.cuenta.fuentes[0], el.srcObject); assert.strictEqual(m.cuenta.panners[0].panningModel, "HRTF"); assert.strictEqual(m.cuenta.panners[0].rolloffFactor, 0);
  assert.strictEqual(el.muted, true); assert.strictEqual(m.api.estado().modo, "espacial");
  m.desbloquea(); assert.strictEqual(m.cuenta.contextos, 1, "un solo AudioContext");
  // la fase tarde: la escucha en la cámara, la voz del guía en la cabeza de su avatar, con su ganancia (10 m: no baja de 0,25)
  m.api.actualiza();
  const L = m.cuenta.ac.listener; assert.deepStrictEqual([L.positionX.value, L.positionY.value, L.positionZ.value], [0, 1.6, 0]); assert.strictEqual(L.forwardZ.value + 0, -1);
  const p = m.cuenta.panners[0]; assert.deepStrictEqual([p.positionX.value, p.positionY.value, p.positionZ.value], [0, 1.6, -10]);
  assert.deepStrictEqual(m.g.window.__voz("voces"), [{ identidad: "h_guia", sid: "AG", modo: "espacial", ganancia: 0.25, silenciada: true, espacial: true }]);
  // se acerca: 4 m → 0,5
  m.camara.pos.set(0, 1.6, -6); m.api.actualiza(); assert.strictEqual(m.g.window.__voz("voces")[0].ganancia, 0.5);
  // VR: la escucha es la cabeza (VRX.cab con el giro del rig)
  m.VRX.on = true; m.VRX.cab.set(3, 1.7, -2); m.VRX.rig.yaw = Math.PI / 2; m.api.actualiza();
  assert.deepStrictEqual([L.positionX.value, L.positionY.value, L.positionZ.value], [3, 1.7, -2]); assert.ok(cerca(L.forwardX.value, -1, 1e-9), "con el rig girado 90°, mira a −x");
  // sin sitio (no se le ve): delante de ti, a ganancia fija
  m.VRX.on = false; s.emite("pista", { identidad: "h_f", sid: "AF", fuente: "microphone", mst: { id: "mst2" } }); m.api.actualiza();
  assert.strictEqual(m.g.window.__voz("voces").find(v => v.sid === "AF").ganancia, V.DIST.sinSitio);
  // despublicada: se suelta su <audio> y su grafo
  s.emite("despublicada", { identidad: "h_f", sid: "AF", fuente: "microphone" }); assert.strictEqual(m.body.children.length, 1); assert.strictEqual(m.api.estado().voces, 1);
  // un <audio> que el navegador no deja reproducir: «bloqueado»
  const m2 = montaVoz(); await m2.api.entra(7); const orig = m2.g.document.createElement;
  m2.g.document.createElement = t => { const x = orig(t); x.bloquea = true; return x; };
  m2.sala.emite("pista", { identidad: "h_guia", sid: "AG", fuente: "microphone", mst: {} }); await espera();
  assert.strictEqual(m2.api.estado().bloqueado, true);
});

test("VozMotor: hablar. Solo con permiso y gesto; con el micro abierto sin auriculares, plano; la api quita la palabra y se cierra solo", async () => {
  const m = montaVoz(), s = m.sala;
  s._pubs = [{ identidad: "h_guia", sid: "AG", fuente: "microphone", suscrita: false }];
  await m.api.entra(7); m.desbloquea(); await espera();
  s.emite("pista", { identidad: "h_guia", sid: "AG", fuente: "microphone", mst: {} }); const el = m.body.children[0];
  assert.strictEqual(await m.api.abre(), false); assert.strictEqual(m.api.estado().motivo, "sin_permiso"); assert.deepStrictEqual(s.microLlamadas, [], "sin permiso, ni se intenta");
  // la api da la palabra (UpdateParticipant): llega «permisos»
  s._perm = { publicar: true, fuentes: ["microphone"], datos: true }; s._atr.h_yo = { palabra_hasta: new Date(Date.now() + 120000).toISOString() }; s.emite("permisos", s._perm);
  let e = m.api.estado(); assert.strictEqual(e.puede, true); assert.ok(e.turno >= 119 && e.turno <= 120, String(e.turno));
  assert.strictEqual(await m.api.abre(), false); assert.strictEqual(m.api.estado().motivo, "sin_gesto"); assert.deepStrictEqual(s.microLlamadas, [], "sin gesto, nunca");
  m.gesto.isActive = true;
  assert.strictEqual(await m.api.abre(), true); assert.deepStrictEqual(s.microLlamadas, [true]); assert.strictEqual(m.api.estado().micro, "abierto");
  assert.strictEqual(el.muted, false, "micro abierto sin auriculares: plano, para que actúe la cancelación de eco"); assert.strictEqual(m.api.estado().modo, "plano");
  assert.strictEqual(await m.api.abre(), true, "ya abierto: no lo abre otra vez"); assert.deepStrictEqual(s.microLlamadas, [true]);
  m.api.auriculares(true); assert.strictEqual(el.muted, true); assert.strictEqual(m.api.estado().modo, "espacial");
  m.api.auriculares(false); assert.strictEqual(el.muted, false);
  // la api quita la palabra: «permisos» sin publicar → se cierra solo
  s._perm = { publicar: false, fuentes: [], datos: true }; s.emite("permisos", s._perm); await espera();
  assert.deepStrictEqual(s.microLlamadas, [true, false]); e = m.api.estado(); assert.strictEqual(e.micro, "cerrado"); assert.strictEqual(e.motivo, "sin_permiso"); assert.strictEqual(e.modo, "espacial");
  // o LiveKit lo despublica sin aviso: en la fase tarde se ve y se cierra
  s._perm = { publicar: true, fuentes: ["microphone"], datos: true }; assert.strictEqual(await m.api.abre(), true);
  s._micro = false; m.api.actualiza(); assert.strictEqual(m.api.estado().micro, "cerrado");
  // cierra() a mano
  assert.strictEqual(await m.api.abre(), true); assert.strictEqual(await m.api.cierra(), true); assert.strictEqual(s.microLlamadas.pop(), false);
  // el navegador niega el micrófono
  s.falloMicro = Object.assign(new Error("no"), { name: "NotAllowedError" }); assert.strictEqual(await m.api.abre(), false); assert.strictEqual(m.api.estado().motivo, "micro_denegado"); assert.strictEqual(m.api.estado().micro, "cerrado");
  // con gafas puestas, el mando cuenta como gesto (no da activación por sondeo)
  s.falloMicro = null; m.gesto.isActive = false; m.VRX.on = true; assert.strictEqual(await m.api.abre(), true);
});

test("VozMotor: quién habla (voz:habla), salir suelta todo y libera cierra el AudioContext; ?voz=plano; sin grabación", async () => {
  let m = montaVoz(), s = m.sala;
  await m.api.entra(7); m.desbloquea(); await espera();
  s.emite("hablan", [{ identidad: "h_guia", nivel: 0.4, yo: false }]);
  s.emite("hablan", [{ identidad: "h_guia", nivel: 0.42, yo: false }, { identidad: "h_yo", nivel: 0.3, yo: true }]);
  s.emite("hablan", []);
  assert.deepStrictEqual(m.emitidos.filter(e => e[0] === "voz:habla").map(e => e[1]), [
    { identidad: "h_guia", nivel: 0.4, habla: true, yo: false }, { identidad: "h_yo", nivel: 0.3, habla: true, yo: true },
    { identidad: "h_guia", nivel: 0, habla: false, yo: false }, { identidad: "h_yo", nivel: 0, habla: false, yo: true }]);
  // ?debug
  const d = { lineas: [] }; (m.n.oy["depura:lineas"] || []).forEach(f => f(d)); assert.match(d.lineas[0], /^voz guiada-7 · 0 voces · micro cerrado · espacial/);
  // la sala se cae (o te expulsan): se suelta todo
  s.emite("pista", { identidad: "h_guia", sid: "AG", fuente: "microphone", mst: {} }); s.emite("hablan", [{ identidad: "h_guia", nivel: 0.5 }]);
  s._estado = "fuera"; s.emite("estado", { estado: "fuera", motivo: "expulsado" });
  assert.strictEqual(m.body.children.length, 0, "sin <audio>"); assert.strictEqual(m.api.estado().dentro, false); assert.strictEqual(m.api.estado().motivo, "expulsado");
  assert.strictEqual(m.emitidos.filter(e => e[0] === "voz:habla").pop()[1].habla, false, "quien hablaba deja de hablar");
  assert.strictEqual(s.oyentes("pista"), 0, "ya no escucha la sala");
  // sale(): cierra el micro y sale de su sala; libera cierra el AudioContext y quita el gancho
  m = montaVoz(); s = m.sala; s._perm = { publicar: true, fuentes: [], datos: true }; m.gesto.isActive = true;
  await m.api.entra(7); m.desbloquea(); await espera(); await m.api.abre();
  await m.api.sale(); assert.deepStrictEqual(s.microLlamadas, [true, false]); assert.strictEqual(s.salidas, 1);
  m.api.libera(); assert.strictEqual(m.cuenta.cerrados, 1); assert.strictEqual(m.g.window.__voz, undefined);
  // ?voz=plano: nunca espacial
  m = montaVoz({ busqueda: "?voz=plano" }); await m.api.entra(7); m.desbloquea(); await espera();
  m.sala.emite("pista", { identidad: "h_guia", sid: "AG", fuente: "microphone", mst: {} });
  assert.strictEqual(m.body.children[0].muted, false); assert.strictEqual(m.api.estado().modo, "plano");
  // sin grabación (decisión 10): ni MediaRecorder ni Egress en la voz ni en la red
  for (const [f, src] of [["45_voz.js", sinCabecera(VOZ).replace(/\/\/.*$/gm, "")], ["37_red.js", sinCabecera(RED).replace(/\/\/.*$/gm, "")]]) {
    assert.ok(!/MediaRecorder|Egress|captureStream/.test(src), f + ": nada que grabe");
  }
});

test("el manifiesto de la voz: 0 llamadas de dibujo, consume la red y la presencia, bandera ?voz", () => {
  const m = /Componentes\.registra\(\{([\s\S]*?)\n  \}\);/.exec(VOZ)[1];
  assert.match(m, /id: "voz-guiada"/); assert.match(m, /presupuesto: \{ llamadas: 0, triangulos: 0 \}/); assert.match(m, /consume: \["Red", "Presencia", "VRX"\]/);
  assert.match(m, /bandera: \{ defecto: true, url: "voz" \}/); assert.match(m, /emite: \["voz:habla", "voz:estado"\]/);
});
