"use strict";
// La red como componente (C5, ADR-0023; doc/sistema/COMPONENTES.md §6) y la presencia y los avatares encima de ella. En Node, SIN navegador y SIN LiveKit:
//   · RedPuro (apps/web/motor/37_red.js, su trozo puro) con un livekit-client de mentira: varias salas, unirse, salir, cambiar de sala, publicar y escuchar
//     por tema, quién entra y sale, reconexión, motivos de salida (expulsado, duplicado), credenciales malas, salir mientras entra, y su api igual al contrato;
//   · los tres componentes de verdad (37_red.js, 38_presencia_compartida.js y 26b_avatares.js, con la lógica pura de 26_presencia.js) en el registro de 02c,
//     con THREE, DOM y LiveKit de mentira: sin bandera no crean nada; con ?presencia=red se unen a la sala «visita» con el token de la api, reciben poses y
//     publican la suya por la red (tema «pose», no fiable, 24 B), el chat va por el tema «chat» (fiable), «chat:alterna» y «depura:lineas» por el Bus;
//     «libera» suelta los avatares primero y sale de la sala; sin la red (?red=0) ni presencia ni avatares; la simulación no necesita sala.
// Lo de Chrome (presencia, presencia_dev, vr_gente, avatares_motor, movibles_chrome, ux_hud) va por el banco: aquí no se abre ningún navegador.
const test = require("node:test"), assert = require("node:assert");
const { lee, path } = require("./_util");
const contratoModulos = require(path.join(__dirname, "..", "contrato_modulos.js"));

const sinCabecera = s => s.startsWith(contratoModulos.MARCA_I) ? s.slice(s.indexOf(contratoModulos.MARCA_F) + contratoModulos.MARCA_F.length + 1) : s;
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return s.slice(i, f); };
const RED = lee("apps/web/motor/37_red.js"), PRES = lee("apps/web/motor/38_presencia_compartida.js"), LIB = lee("apps/web/motor/26_presencia.js"), AVAT = lee("apps/web/motor/26b_avatares.js");
const NUCLEO = lee("apps/web/motor/02c_componentes.js");
const RedPuro = new Function("\"use strict\";\n" + trozo(RED, "// [puro:inicio]", "// [puro:fin]") + "\nreturn RedPuro;")();
const IFACES = JSON.parse(lee("contratos/interfaces.json"));
const espera = (ms = 0) => new Promise(r => setTimeout(r, ms));

// ---------- un livekit-client de mentira: lo justo de Room que usa 37_red.js, y cómo simular lo que manda el servidor
function lkFalso(opc = {}) {
  const RoomEvent = { ParticipantConnected: "pc", ParticipantDisconnected: "pd", DataReceived: "dr", Reconnecting: "rc", Reconnected: "rd", Disconnected: "dc" };
  const DisconnectReason = { UNKNOWN_REASON: 0, CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4 };
  const salas = [];
  class Room {
    constructor(o) { this.opciones = o; this.oy = {}; this.remoteParticipants = new Map(); this.publicados = []; this.desconexiones = 0; this.conectada = false; salas.push(this);
      const yo = this; this.localParticipant = { identity: null, metadata: null, publishData(d, op) { yo.publicados.push({ d, op }); return opc.publicaFalla ? Promise.reject(new Error("no")) : Promise.resolve(); } }; }
    on(ev, fn) { (this.oy[ev] = this.oy[ev] || []).push(fn); return this; }
    emite(ev, ...a) { (this.oy[ev] || []).forEach(fn => fn(...a)); }
    connect(url, token, o) {
      this.url = url; this.token = token; this.conexion = o;
      if (token === "malo") return Promise.reject(new Error("token rechazado"));
      const sigue = () => { this.conectada = true; this.localParticipant.identity = "h_yo_" + token; this.localParticipant.metadata = JSON.stringify({ alias: "Yo " + token });
        (opc.yaDentro || []).forEach(p => this.remoteParticipants.set(p.identity, p)); };
      if (opc.lento) return new Promise(r => { this.termina = () => { sigue(); r(); }; });
      sigue(); return Promise.resolve();
    }
    disconnect() { this.desconexiones++; const era = this.conectada; this.conectada = false; if (era) this.emite(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED); return Promise.resolve(); }
    // el servidor
    entra(identity, metadata) { const p = { identity, metadata }; this.remoteParticipants.set(identity, p); this.emite(RoomEvent.ParticipantConnected, p); return p; }
    sale(identity) { const p = this.remoteParticipants.get(identity); this.remoteParticipants.delete(identity); this.emite(RoomEvent.ParticipantDisconnected, p); }
    datos(p, tema, bytes) { this.emite(RoomEvent.DataReceived, bytes, p, 0, tema); }
    corta(motivo) { this.conectada = false; this.emite(RoomEvent.Disconnected, motivo); }
  }
  return { Room, RoomEvent, DisconnectReason, salas };
}
function red(LK, extra = {}) {
  const estados = [], avisos = []; let cargas = 0;
  const r = RedPuro.crea(Object.assign({ carga: () => { cargas++; return Promise.resolve(LK); }, base: () => "https://gemelo.test/finca/index.html?presencia=red", alEstado: d => estados.push(d), avisa: t => avisos.push(t) }, extra));
  return { r, estados, avisos, cargas: () => cargas };
}

// ---------- RedPuro
test("RedPuro: la URL de la sala se resuelve contra la página (https → wss), los motivos de LiveKit en palabras del motor y las credenciales", () => {
  assert.strictEqual(RedPuro.urlWs("/rtc", "https://gemelo.test/finca/index.html"), "wss://gemelo.test/rtc");
  assert.strictEqual(RedPuro.urlWs("/rtc", "http://192.168.1.20:8080/x"), "ws://192.168.1.20:8080/rtc");
  assert.strictEqual(RedPuro.urlWs("wss://lk.ejemplo.test", "https://gemelo.test/"), "wss://lk.ejemplo.test/");
  const R = lkFalso().DisconnectReason;
  assert.strictEqual(RedPuro.motivo(R.PARTICIPANT_REMOVED, R), "expulsado"); assert.strictEqual(RedPuro.motivo(R.DUPLICATE_IDENTITY, R), "duplicado");
  assert.strictEqual(RedPuro.motivo(R.CLIENT_INITIATED, R), "propio"); assert.strictEqual(RedPuro.motivo(R.UNKNOWN_REASON, R), "desconectado"); assert.strictEqual(RedPuro.motivo(undefined, {}), "desconectado");
  assert.ok(RedPuro.credencialesValidas({ url: "/rtc", token: "t" }));
  for (const c of [null, {}, { url: "/rtc" }, { url: "", token: "t" }, { url: "/rtc", token: 7 }]) assert.ok(!RedPuro.credencialesValidas(c), JSON.stringify(c));
  assert.deepStrictEqual(RedPuro.SALA_LK, { adaptiveStream: false, dynacast: false }); assert.deepStrictEqual(RedPuro.CONEXION_LK, { autoSubscribe: false });
});

test("Red: nada se descarga hasta unirse; unirse, publicar y escuchar por tema, quién entra y sale, y la api es la del contrato (interfaces.json)", async () => {
  const LK = lkFalso({ yaDentro: [{ identity: "h_ana", metadata: "{\"alias\":\"Ana\"}" }] }), { r, estados, cargas } = red(LK);
  const C = IFACES.apis_de_componentes["red-salas"];
  assert.deepStrictEqual(Object.keys(r).sort(), C.miembros.slice().sort(), "miembros de la red");
  const s = r.sala("visita");
  assert.deepStrictEqual(Object.keys(s).sort(), C.sala.slice().sort(), "miembros de una sala");
  assert.strictEqual(r.sala("visita"), s, "una sala por clave"); assert.throws(() => r.sala("Visita"), /clave/); assert.throws(() => r.sala("a b"), /clave/);
  assert.strictEqual(cargas(), 0, "sin unirse, livekit-client no se pide"); assert.strictEqual(s.estado(), "fuera"); assert.strictEqual(s.yo(), null);
  const pose = [], chat = [], gente = [];
  s.escucha("pose", (d, de) => pose.push([de.identidad, d.byteLength])); s.escucha("chat", (d, de) => chat.push(de && de.metadatos));
  s.al("entra", de => gente.push("+" + de.identidad)); s.al("sale", id => gente.push("-" + id));
  await assert.rejects(s.publica("pose", new Uint8Array(24), { fiable: false }), /no estás en la sala/);
  assert.strictEqual(await s.une({ url: "/rtc", token: "t1" }), true);
  assert.strictEqual(cargas(), 1); assert.strictEqual(s.estado(), "dentro");
  const room = LK.salas[0];
  assert.strictEqual(room.url, "wss://gemelo.test/rtc"); assert.strictEqual(room.token, "t1");
  assert.deepStrictEqual(room.opciones, { adaptiveStream: false, dynacast: false }); assert.deepStrictEqual(room.conexion, { autoSubscribe: false }, "solo datos, sin suscripción automática (como antes)");
  assert.deepStrictEqual(s.yo(), { identidad: "h_yo_t1", metadatos: "{\"alias\":\"Yo t1\"}" });
  assert.deepStrictEqual(s.participantes(), [{ identidad: "h_ana", metadatos: "{\"alias\":\"Ana\"}" }]);
  assert.deepStrictEqual(estados.map(e => e.estado), ["conectando", "dentro"]);
  // publicar: fiable / tema / destinos, tal cual a LiveKit
  await s.publica("pose", new Uint8Array(24), { fiable: false, destinos: ["h_ana"] }); await s.publica("chat", new Uint8Array(3), { fiable: true });
  assert.deepStrictEqual(room.publicados.map(x => x.op), [{ reliable: false, topic: "pose", destinationIdentities: ["h_ana"] }, { reliable: true, topic: "chat" }]);
  await assert.rejects(s.publica("Pose!", new Uint8Array(1)), /tema/);
  // recibir: por tema; lo de un tema sin oyentes no llega a nadie; el servidor (sin participante) llega con de = null
  const bob = room.entra("h_bob", "{\"alias\":\"Bob\"}");
  room.datos(bob, "pose", new Uint8Array(24)); room.datos(bob, "otro", new Uint8Array(5)); room.datos(bob, "chat", new Uint8Array(2)); room.datos(undefined, "chat", new Uint8Array(2));
  assert.deepStrictEqual(pose, [["h_bob", 24]]); assert.deepStrictEqual(chat, ["{\"alias\":\"Bob\"}", null]);
  room.sale("h_bob"); assert.deepStrictEqual(gente, ["+h_bob", "-h_bob"]);
  const i = s.info(); assert.strictEqual(i.enviados, 2); assert.strictEqual(i.recibidos, 3); assert.strictEqual(i.sinTema, 1); assert.strictEqual(i.participantes, 1);
  // otra sala a la vez (OF10/OF12): la librería se pide una vez
  const o = r.sala("oficina"); assert.strictEqual(await o.une(() => Promise.resolve({ url: "wss://lk.test", token: "t2" })), true, "las credenciales pueden venir de una función");
  assert.strictEqual(cargas(), 1); assert.deepStrictEqual(r.salas().sort(), ["oficina", "visita"]); assert.strictEqual(s.estado(), "dentro"); assert.strictEqual(o.estado(), "dentro");
  // salir
  await s.sale(); assert.strictEqual(s.estado(), "fuera"); assert.strictEqual(s.motivo(), "propio"); assert.strictEqual(room.desconexiones, 1);
  assert.strictEqual(o.estado(), "dentro", "salir de una sala no toca las otras");
  r.cierra(); assert.strictEqual(o.estado(), "fuera"); assert.strictEqual(r.sala("visita"), null, "cerrada no da salas"); await assert.rejects(s.une({ url: "/rtc", token: "x" }), /cerrada/);
});

test("Red: reconectar, ser expulsado o abrir otra pestaña; cambiar de sala; salir mientras entra; credenciales malas o token rechazado", async () => {
  let LK = lkFalso(), { r, estados } = red(LK), s = r.sala("visita"), vistos = [];
  s.al("estado", d => vistos.push(d.estado + (d.motivo ? ":" + d.motivo : "")));
  await s.une({ url: "/rtc", token: "a" }); const r1 = LK.salas[0];
  r1.emite(LK.RoomEvent.Reconnecting); assert.strictEqual(s.estado(), "reconectando");
  await s.publica("pose", new Uint8Array(24), {});   // reconectando también se publica (como antes: LiveKit decide)
  r1.emite(LK.RoomEvent.Reconnected); assert.strictEqual(s.estado(), "dentro");
  r1.corta(LK.DisconnectReason.PARTICIPANT_REMOVED); assert.strictEqual(s.estado(), "fuera"); assert.strictEqual(s.motivo(), "expulsado");
  await s.une({ url: "/rtc", token: "b" }); LK.salas[1].corta(LK.DisconnectReason.DUPLICATE_IDENTITY); assert.strictEqual(s.motivo(), "duplicado");
  await s.une({ url: "/rtc", token: "c" }); LK.salas[2].corta(LK.DisconnectReason.UNKNOWN_REASON); assert.strictEqual(s.motivo(), "desconectado");
  assert.deepStrictEqual(vistos, ["conectando", "dentro", "reconectando", "dentro", "fuera:expulsado", "conectando", "dentro", "fuera:duplicado", "conectando", "dentro", "fuera:desconectado"]);
  assert.ok(estados.every(e => e.sala === "visita"));
  // cambiar de sala bajo la misma clave: se deja la de antes (avisa «fuera», motivo «propio», y enseguida «conectando») y lo que llegue de ella ya no cuenta
  const llega = []; s.escucha("pose", (d, de) => llega.push(de.identidad));
  await s.une({ url: "/rtc", token: "d" }); const vieja = LK.salas[3]; vistos.length = 0;
  await s.une({ url: "/rtc", token: "e" }); const nueva = LK.salas[4];
  assert.deepStrictEqual(vistos, ["fuera:propio", "conectando", "dentro"]);
  assert.strictEqual(vieja.desconexiones, 1, "la de antes se deja"); assert.strictEqual(s.estado(), "dentro"); assert.strictEqual(s.yo().identidad, "h_yo_e");
  vieja.datos({ identity: "h_x" }, "pose", new Uint8Array(24)); vieja.corta(LK.DisconnectReason.PARTICIPANT_REMOVED);
  nueva.datos({ identity: "h_y" }, "pose", new Uint8Array(24));
  assert.deepStrictEqual(llega, ["h_y"], "lo de la sala vieja no llega"); assert.strictEqual(s.estado(), "dentro", "la vieja no te saca de la nueva");
  // salir mientras entra: la promesa da false y la sala se deja
  LK = lkFalso({ lento: true }); ({ r } = red(LK)); s = r.sala("visita");
  const p = s.une({ url: "/rtc", token: "f" }); await espera(); assert.strictEqual(s.estado(), "conectando"); assert.strictEqual(s.yo(), null); assert.deepStrictEqual(s.participantes(), []);
  await s.sale(); LK.salas[0].termina();
  assert.strictEqual(await p, false); assert.strictEqual(s.estado(), "fuera"); assert.ok(LK.salas[0].desconexiones >= 1, "la que entraba se deja");
  // credenciales malas, token rechazado y livekit-client que no carga: fallan, y la sala queda fuera con motivo «error»
  LK = lkFalso(); ({ r } = red(LK)); s = r.sala("visita");
  await assert.rejects(s.une({ url: "/rtc" }), /credenciales/); assert.strictEqual(s.estado(), "fuera"); assert.strictEqual(s.motivo(), "error");
  await assert.rejects(s.une({ url: "/rtc", token: "malo" }), /rechazado/); assert.strictEqual(s.motivo(), "error"); assert.strictEqual(LK.salas[0].desconexiones, 1);
  const sinLib = red(LK, { carga: () => Promise.reject(new Error("sin red")) }).r.sala("visita");
  await assert.rejects(sinLib.une({ url: "/rtc", token: "t" }), /sin red/); assert.strictEqual(sinLib.estado(), "fuera");
});

// ---------- los componentes de verdad en el registro de 02c: THREE, DOM y LiveKit de mentira
/** cualquier cosa: se puede llamar, construir y leer (sus propiedades son más «cualquiera»; en una cuenta vale 0) */
function cualquiera() {
  const al = {};
  return new Proxy(function () {}, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (typeof k === "symbol" || k === "then") return undefined; return k in al ? al[k] : (al[k] = cualquiera()); },
    set(t, k, v) { al[k] = v; return true; }, apply() { return cualquiera(); }, construct() { return cualquiera(); }
  });
}
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); } toArray() { return [this.x, this.y, this.z]; }
  applyQuaternion(q) { const { x, y, z } = this, qx = q.x, qy = q.y, qz = q.z, qw = q.w, ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return this.set(ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx); } }
class Q { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } identity() { return this.set(0, 0, 0, 1); }
  setFromAxisAngle(e, a) { const s = Math.sin(a / 2); return this.set(e.x * s, e.y * s, e.z * s, Math.cos(a / 2)); }
  setFromEuler(e) { const c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2), s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);   // YXZ
    return this.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3); }
  multiply(b) { const a = this; return this.set(a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y, a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z, a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z); } }
class Euler { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }
class M4 { compose() { return this; } makeScale() { return this; } multiplyMatrices() { return this; } copy() { return this; } decompose() { return this; } identity() { return this; } premultiply() { return this; } }
function threeFalso(cuenta) {
  const T = cualquiera(), malla = () => { cuenta.mallas++; const m = cualquiera(); m.dispose = () => { cuenta.mallasLibres++; }; return m; };
  return new Proxy(T, { get: (t, k) => ({ Vector3: V3, Quaternion: Q, Euler, Matrix4: M4, InstancedMesh: function () { return malla(); }, Group: function () { const g = cualquiera(); g.name = ""; return g; } })[k] || T[k] });
}
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.style = {}; this.attrs = {}; this.oy = {}; this.hidden = false; this.parentNode = null; this.textContent = ""; this.value = ""; }
  appendChild(c) { if (c.parentNode && c.parentNode.children) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(n, f) { (this.oy[n] = this.oy[n] || []).push(f); } removeEventListener(n, f) { const l = this.oy[n] || [], i = l.indexOf(f); if (i >= 0) l.splice(i, 1); }
  dispara(n, e) { (this.oy[n] || []).slice().forEach(f => f(Object.assign({ preventDefault() {}, stopPropagation() {} }, e || {}))); }
  focus() {} getContext() { return cualquiera(); }
  busca(tag) { if (this.tagName === tag) return this; for (const c of this.children) { const r = c.busca && c.busca(tag); if (r) return r; } return null; }
}
/** el registro (02c entero) con la lógica pura de la presencia (26_presencia.js) y los componentes que se pidan; lo demás, de mentira */
function motor({ busqueda = "", ficheros = ["red", "presencia", "avatares"], token = { url: "/rtc", token: "tk" }, tokenEstado = 200 } = {}) {
  const LK = lkFalso(), errores = [], avisos = [], cuenta = { mallas: 0, mallasLibres: 0, escena: 0, tipos: [], quitados: 0, fetch: [] };
  const fuentes = { red: sinCabecera(RED).replace('import("livekit-client")', "Promise.resolve(LK_FALSO)"),
    presencia: sinCabecera(PRES).replace('import("three/addons/utils/BufferGeometryUtils.js")', "Promise.reject(new Error(\"sin addons en Node\"))"),
    avatares: sinCabecera(AVAT) };
  const ventana = { addEventListener() {}, removeEventListener() {} }, visor = new El("div");
  const documento = { getElementById: () => null, createElement: t => new El(t), createTextNode: t => ({ texto: t }), body: new El("body") };
  const consola = { error: (...a) => errores.push(a.map(String).join(" ")), warn: (...a) => { const t = a.map(String).join(" "); if (/sin quad ni dron/.test(t)) avisos.push(t); else errores.push(t); }, log() {} };
  const g = {
    THREE: threeFalso(cuenta), LK_FALSO: LK, D: { ext: [0, 200, 200, 0], base: "" }, suelo: () => 10, copas: [], exag: 1, texColor: x => x,
    scene: { add: () => { cuenta.escena++; }, remove: () => { cuenta.escena--; } }, camera: { position: new V3(0, 20, 0), quaternion: new Q() }, renderer: cualquiera(), visor,
    Entidades: { registra: d => { cuenta.tipos.push(d.tipo); return () => { cuenta.quitados++; }; } }, Llegada: { funde: fn => { fn(); return true; }, aparece() {} }, TR: {},
    Movibles: { hazMovible: () => ({ menuLlevar() {}, coloca() {} }) }, VRX: { on: false, cab: new V3(), rig: { yaw: 0 } }, paseando: true, pp: { x: 50, y: 50, ang: 0 },
    enQuad: false, enDron: false, quad: cualquiera(), dron: cualquiera(), objetivo: new V3(50, 0, -50), persona: null, primera: false, navigator: { userAgent: "Node" },
    fetch: (u, o) => { cuenta.fetch.push([u, o && o.method]); return Promise.resolve({ ok: tokenEstado === 200, status: tokenEstado, json: () => Promise.resolve(tokenEstado === 200 ? token : { mensaje: "no" }) }); }
  };
  const nombres = Object.keys(g), codigo = sinCabecera(LIB) + "\n" + ficheros.map(f => fuentes[f]).join("\n");
  const f = new Function(...["window", "location", "document", "console"].concat(nombres), "\"use strict\";\n" + sinCabecera(NUCLEO) + "\n" + codigo + "\nreturn { Componentes, Bus };");
  const r = f(...[ventana, { search: busqueda, href: "https://gemelo.test/finca/index.html" + busqueda }, documento, consola].concat(nombres.map(n => g[n])));
  r.Componentes.arranca();
  return Object.assign(r, { LK, errores, avisos, cuenta, ventana, visor, g });
}
const ACTIVOS = r => r.Componentes.resumen().filter(x => x.activo).map(x => x.id).sort();
const POSE = (x, z, seq, t) => { const P = new Function("\"use strict\";\n" + trozo(LIB, "// [puro:inicio]", "// [puro:fin]") + "\nreturn PoseCodec;")(); return P.codifica({ tipo: 1, seq, t, cab: { p: [x, 11.6, z], q: [0, 0, 0, 1] }, izq: null, der: null }); };

test("componentes en Node: sin ?presencia los tres se montan y no crean nada; ?presencia=0 o ?red=0 apagan la presencia y los avatares; la red no carga LiveKit sola", async () => {
  let r = motor();
  assert.deepStrictEqual(ACTIVOS(r), ["avatares-vrm", "presencia-compartida", "red-salas"], JSON.stringify(r.Componentes.resumen()));
  assert.deepStrictEqual(r.Componentes.resumen().map(x => x.id), ["red-salas", "presencia-compartida", "avatares-vrm"], "orden de montaje: la red, la presencia, los avatares");
  assert.strictEqual(r.cuenta.mallas, 0); assert.strictEqual(r.cuenta.escena, 0); assert.deepStrictEqual(r.cuenta.tipos, []); assert.deepStrictEqual(r.cuenta.fetch, []);
  assert.strictEqual(r.LK.salas.length, 0, "sin nadie que se una, ninguna sala");
  assert.strictEqual(r.ventana.__presencia().activo, false, "el gancho contesta como antes (activo: false)");
  for (let i = 0; i < 5; i++) r.Componentes.actualiza("mundo", 0.1, i);
  const ext = { lineas: [] }; r.Bus.emite("depura:lineas", ext); assert.deepStrictEqual(ext.lineas, [], "sin presencia, ninguna línea en ?debug");
  assert.strictEqual(r.Bus.emite("chat:alterna", {}), 1); assert.deepStrictEqual(r.errores, []);
  r = motor({ busqueda: "?presencia=0" }); assert.deepStrictEqual(ACTIVOS(r), ["red-salas"]); assert.strictEqual(r.ventana.__presencia, undefined);
  assert.match(r.Componentes.resumen().find(x => x.id === "avatares-vrm").motivo, /falta presencia-compartida/);
  r = motor({ busqueda: "?presencia=red&red=0" }); assert.deepStrictEqual(ACTIVOS(r), []); assert.strictEqual(r.LK.salas.length, 0);
  assert.match(r.Componentes.resumen().find(x => x.id === "presencia-compartida").motivo, /falta red-salas/);
  // sin el fichero de la red (genera_motor.mjs --sin 37_red.js) nadie expone «Red»: la presencia se monta, sin sala, y lo dice; la simulación funciona igual
  r = motor({ busqueda: "?presencia=red", ficheros: ["presencia", "avatares"] }); await espera(10);
  assert.deepStrictEqual(ACTIVOS(r), ["avatares-vrm", "presencia-compartida"]); assert.strictEqual(r.LK.salas.length, 0); assert.deepStrictEqual(r.cuenta.fetch, []);
  assert.match(r.visor.children[0].busca("P").textContent, /no está disponible/); assert.strictEqual(r.ventana.__presencia().conectado, false);
  r.ventana.__presencia("libera"); assert.deepStrictEqual(r.errores, []);
  r = motor({ busqueda: "?presencia=sim&n=2", ficheros: ["presencia"] }); r.Componentes.actualiza("mundo", 0.1, 0); assert.strictEqual(r.ventana.__presencia().n, 2); assert.deepStrictEqual(r.errores, []);
  r = motor({ busqueda: "?presencia=red&avatares=0" }); await espera(10); assert.deepStrictEqual(ACTIVOS(r), ["presencia-compartida", "red-salas"]); assert.strictEqual(r.ventana.__presencia().vrm, null);
  r.ventana.__presencia("libera"); assert.deepStrictEqual(r.errores, []);
});

test("componentes en Node: ?presencia=red se une a la sala «visita» con el token de la api, recibe y publica la pose y el chat por la red, y «libera» lo suelta todo", async () => {
  const r = motor({ busqueda: "?presencia=red" });
  await espera(10);
  assert.deepStrictEqual(r.cuenta.fetch, [["/api/presencia/token", "POST"]], "el token, de la api de siempre");
  assert.strictEqual(r.LK.salas.length, 1); const room = r.LK.salas[0];
  assert.strictEqual(room.url, "wss://gemelo.test/rtc"); assert.strictEqual(room.token, "tk");
  assert.deepStrictEqual(r.cuenta.tipos, ["persona"], "el tipo «persona» de Entidades, solo con la bandera");
  assert.ok(r.cuenta.mallas >= 6, "los muñecos instanciados: " + r.cuenta.mallas);
  let e = r.ventana.__presencia(); assert.strictEqual(e.activo, true); assert.strictEqual(e.conectado, true); assert.strictEqual(e.identidad, "h_yo_tk"); assert.ok(e.vrm, "los avatares VRM enganchados");
  // llega alguien y manda su pose (tema «pose»): se dibuja; lo de un tema desconocido, nada
  const ana = room.entra("h_ana", JSON.stringify({ alias: "Ana", rol: "guia" }));
  const t0 = Math.round(performance.now());
  for (let k = 0; k < 4; k++) { room.datos(ana, "pose", POSE(60 + k * 0.1, -60, k + 1, t0 + k * 100)); }
  room.datos(ana, "otro", new Uint8Array(4));
  for (let i = 0; i < 4; i++) { r.Componentes.actualiza("mundo", 0.1, i); await espera(30); }
  e = r.ventana.__presencia(); assert.strictEqual(e.recibidos, 4); assert.strictEqual(e.n, 1); assert.strictEqual(e.vistos, 1);
  assert.deepStrictEqual(r.ventana.__presencia("puntos").map(p => [p.id, p.alias]), [["h_ana", "Ana"]]);
  // publica su pose (paseando): tema «pose», no fiable, 24 B (a la cercana a 10 Hz y a toda la sala a 2 Hz)
  const poses = room.publicados.filter(x => x.op.topic === "pose");
  assert.ok(poses.length >= 1 && poses.every(x => x.op.reliable === false && x.d.byteLength === 24), JSON.stringify(poses.map(x => x.op)));
  assert.ok(poses.some(x => JSON.stringify(x.op.destinationIdentities) === "[\"h_ana\"]"), "a la cercana, por identidad");
  // el chat: lo que llega por «chat» se pinta como texto; lo que se escribe sale fiable por «chat»
  const raiz = r.visor.children.find(c => c.attrs.id === "presenciaGente" || c.id === "presenciaGente") || r.visor.children[0];
  room.datos(ana, "chat", new TextEncoder().encode("hola"));
  const lista = raiz.busca("OL"); assert.strictEqual(lista.children.length, 1, "un mensaje en el chat "); 
  while (performance.now() < 800) await espera(50);   // el chat deja un mensaje cada 0,7 s, contados desde que arranca la página (aquí, el proceso)
  const entrada = raiz.busca("INPUT"), forma = raiz.busca("FORM"); entrada.value = "  buenas  "; forma.dispara("submit"); await espera(5);
  const chat = room.publicados.filter(x => x.op.topic === "chat"); assert.strictEqual(chat.length, 1); assert.strictEqual(chat[0].op.reliable, true);
  assert.strictEqual(new TextDecoder().decode(chat[0].d), "buenas"); assert.strictEqual(lista.children.length, 2, "y el propio («Tú»)");
  // el icono del chat de la barra (Bus «chat:alterna»): abierto → minimizado → abierto
  const burbuja = r.visor.children[1]; assert.strictEqual(raiz.hidden, false);
  r.Bus.emite("chat:alterna", {}); assert.strictEqual(raiz.hidden, true); assert.strictEqual(burbuja.hidden, false);
  r.Bus.emite("chat:alterna", {}); assert.strictEqual(raiz.hidden, false); assert.strictEqual(burbuja.hidden, true);
  // ?debug: su línea por el Bus
  const ext = { lineas: [] }; r.Bus.emite("depura:lineas", ext); assert.strictEqual(ext.lineas.length, 1); assert.match(ext.lineas[0], /^presencia \(red\) 1 · cerca/);
  // se va: deja de dibujarse; vuelve a entrar y la oficina la saca a ella: nada raro
  room.sale("h_ana"); r.Componentes.actualiza("mundo", 0.1, 9); assert.strictEqual(r.ventana.__presencia().n, 0);
  // la oficina te saca: «fuera», sin nadie, y el aviso de siempre
  room.entra("h_bob", "{}"); room.corta(r.LK.DisconnectReason.PARTICIPANT_REMOVED);
  e = r.ventana.__presencia(); assert.strictEqual(e.conectado, false); assert.strictEqual(e.n, 0); assert.strictEqual(e.identidad, null);
  const aviso = raiz.busca("P"); assert.match(aviso.textContent, /La oficina te ha sacado/);
  // «Volver a entrar» → otra vez dentro (otra Room de la misma sala)
  const boton = (e, t) => { if (e.tagName === "BUTTON" && e.children.some(h => h.texto === t)) return e; for (const c of e.children || []) { const x = c.tagName && boton(c, t); if (x) return x; } return null; };
  const reentra = boton(raiz, "Volver a entrar"); assert.strictEqual(reentra.hidden, false, "con el botón «Volver a entrar»");
  reentra.dispara("click"); await espera(10);
  assert.strictEqual(r.LK.salas.length, 2); assert.strictEqual(r.ventana.__presencia().conectado, true);
  // libera: los avatares primero, la presencia después (sale de la sala, quita el tipo, suelta la GPU y el panel); la red sigue montada
  const mallas = r.cuenta.mallas;
  r.ventana.__presencia("libera");
  assert.deepStrictEqual(ACTIVOS(r), ["red-salas"]); assert.strictEqual(r.ventana.__presencia().activo, false);
  assert.strictEqual(r.LK.salas[1].desconexiones, 1, "sale de la sala"); assert.strictEqual(r.cuenta.quitados, 1, "quita el tipo «persona»");
  assert.strictEqual(r.cuenta.mallasLibres, mallas, "suelta todas las mallas instanciadas"); assert.strictEqual(r.cuenta.escena, 0, "nada queda en la escena");
  assert.strictEqual(r.visor.children.length, 0, "ni el chat ni su burbuja");
  assert.ok(!r.Bus.hay("depura:lineas") && !r.Bus.hay("chat:alterna"), "suelta sus oyentes del Bus");
  assert.deepStrictEqual(r.errores, []);
  // apagar la red (desde la configuración del servidor) se lleva antes a quien la consume
  const r2 = motor({ busqueda: "?presencia=red" }); await espera(10);
  assert.ok(r2.Componentes.configura({ "red-salas": { activo: false } }));
  assert.deepStrictEqual(ACTIVOS(r2), []); assert.strictEqual(r2.LK.salas[0].desconexiones, 1); assert.deepStrictEqual(r2.errores, []);
});

test("componentes en Node: un token que la api niega deja el aviso de siempre y no abre sala; la simulación (?presencia=sim) no usa la red", async () => {
  let r = motor({ busqueda: "?presencia=red", tokenEstado: 401 }); await espera(10);
  assert.strictEqual(r.LK.salas.length, 0); assert.strictEqual(r.ventana.__presencia().conectado, false);
  assert.match(r.visor.children[0].busca("P").textContent, /Entra con tu enlace/); assert.deepStrictEqual(r.errores, []);
  r = motor({ busqueda: "?presencia=sim&n=3" });
  for (let i = 0; i < 10; i++) r.Componentes.actualiza("mundo", 0.1, i);
  const e = r.ventana.__presencia(); assert.strictEqual(e.activo, true); assert.strictEqual(e.variante, "sim"); assert.strictEqual(e.n, 3); assert.ok(e.enviados > 0);
  assert.deepStrictEqual(r.cuenta.fetch, []); assert.strictEqual(r.LK.salas.length, 0, "la simulación no toca la red");
  r.ventana.__presencia("libera"); assert.strictEqual(r.ventana.__presencia().activo, false); assert.deepStrictEqual(r.errores, []);
});

test("la api de la presencia (lo que consumen los avatares) es la del contrato (interfaces.json → apis_de_componentes)", async () => {
  const r = motor({ busqueda: "?presencia=red", ficheros: ["red", "presencia"] });
  const C = IFACES.apis_de_componentes["presencia-compartida"];
  // la api la da el registro (n.api) a quien la consume: se lee con un componente de mentira que la declara en su consume
  let api = null;
  r.Componentes.registra({ id: "lector", consume: ["Presencia"], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    monta: n => { api = n.api("presencia-compartida"); return {}; }, libera() {} });
  assert.ok(api); assert.deepStrictEqual(Object.keys(api).sort(), C.miembros.slice().sort());
  assert.strictEqual(C.modulo, "38_presencia_compartida.js"); assert.strictEqual(IFACES.apis_de_componentes["red-salas"].modulo, "37_red.js");
  await espera(10); r.ventana.__presencia("libera");
});
