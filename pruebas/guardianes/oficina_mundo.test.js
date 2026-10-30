"use strict";
// OF10, el mundo en modo oficina (doc/sistema/OFICINA.md §6; ADR-0024; decisiones 107 y 114). En Node, SIN navegador y SIN LiveKit:
//   · la lógica pura de la presencia que la distingue (26_presencia.js): rol «oficina», alias «Oficina» (y nadie más puede llamarse así), la oficina primero
//     en Gente, chaleco e insignia (Aspecto.viste y Aspecto.cajas);
//   · OficinaMundoPuro (39_oficina_mundo.js): los temas «anuncio», «sala» y «balizas» solo valen SIN participante (los manda la api), su validación,
//     la respuesta de las balizas oficiales, coordenadas y lo que el panel manda a la api;
//   · los componentes de verdad (37_red.js, 38_presencia_compartida.js y 39_oficina_mundo.js) en el registro de 02c con THREE, DOM, LiveKit y la api de
//     mentira: la oficina se ve con su panel (anunciar, invitar, baliza aquí) y un hogar no; el anuncio llega (aviso, chat, Bus) y uno con participante se
//     descarta; la invitación pregunta y «Ir» cambia de sala con el token de la otra; las balizas oficiales se piden, se registran como entidades con su
//     ficha (Quitar solo para la oficina) y se sueltan; ?oficina=0, ?red=0 y sin servidor.
// Lo de Chrome (cómo se ve y cuánto cuesta dibujarlo) está en pruebas/guardianes/oficina_mundo_chrome.test.js, por el banco.
const test = require("node:test"), assert = require("node:assert");
const { lee, path } = require("./_util");
const contratoModulos = require(path.join(__dirname, "..", "contrato_modulos.js"));

const sinCabecera = s => s.startsWith(contratoModulos.MARCA_I) ? s.slice(s.indexOf(contratoModulos.MARCA_F) + contratoModulos.MARCA_F.length + 1) : s;
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return s.slice(i, f); };
const RED = lee("apps/web/motor/37_red.js"), PRES = lee("apps/web/motor/38_presencia_compartida.js"), LIB = lee("apps/web/motor/26_presencia.js"), OFI = lee("apps/web/motor/39_oficina_mundo.js");
const NUCLEO = lee("apps/web/motor/02c_componentes.js"), ENT = lee("apps/web/motor/02e_entidades.js");
const { SalaPose, Aspecto, Chat } = new Function("\"use strict\";\n" + trozo(LIB, "// [puro:inicio]", "// [puro:fin]") + "\nreturn { SalaPose, Aspecto, Chat };")();
const OP = new Function("\"use strict\";\n" + trozo(OFI, "// [puro:inicio]", "// [puro:fin]") + "\nreturn OficinaMundoPuro;")();
const EntidadesPuro = new Function("\"use strict\";\n" + trozo(ENT, "// [puro:inicio]", "// [puro:fin]") + "\nreturn EntidadesPuro;")();
const ROLES = JSON.parse(lee("contratos/livekit-roles.json")), EVENTOS = JSON.parse(lee("contratos/eventos.json"));
const enc = new TextEncoder(), json = o => enc.encode(JSON.stringify(o));
const espera = (ms = 0) => new Promise(r => setTimeout(r, ms));
const CENTRO = [412000, 4180000];

// ---------- la presencia que distingue a la oficina (26_presencia.js)
test("metadatos: la oficina (oficina o admin) se lee como «Oficina», oficial; nadie más puede llamarse «Oficina»; la oficina, la primera en Gente", () => {
  const m = (alias, rol) => SalaPose.leeInfo(JSON.stringify({ alias, rol, avatar: { camisa: 1, sombrero: "paja", piel: 1 }, dispositivo: "escritorio" }));
  for (const rol of ["oficina", "admin"]) { const i = m("Pepa", rol); assert.strictEqual(i.alias, "Oficina", rol); assert.strictEqual(i.oficial, true); assert.strictEqual(i.rol, rol); }
  for (const rol of ["hogar", "guia", "corresponsal", "root", undefined]) assert.strictEqual(m("Mirlo", rol).oficial, false, String(rol));
  for (const falso of ["Oficina", "oficina", "OFICINA", "La oficina de Ana", "0f1cina", "O f i c i n a", "Ofícina"]) assert.strictEqual(m(falso, "hogar").alias, "Visitante", falso);
  for (const bueno of ["Olivia", "Ofelia", "Encina", "Mirlo"]) assert.strictEqual(m(bueno, "hogar").alias, bueno, bueno);
  assert.deepStrictEqual(SalaPose.leeInfo("").oficial, false);
  // Gente: la oficina primero; luego por alias
  const s = SalaPose.crea(1);
  SalaPose.entra(s, "a", m("Abubilla", "hogar")); SalaPose.entra(s, "o", m("x", "oficina")); SalaPose.entra(s, "b", m("Alcaraván", "guia"));
  assert.deepStrictEqual(SalaPose.gente(s, 0).map(g => g.id), ["o", "a", "b"]);
});

test("aspecto: la oficina lleva chaleco (el tronco) e insignia (una caja más, la última); el chaleco no es ningún color de ropa de las familias", () => {
  const info = o => ({ alias: "x", camisa: 2, piel: 1, aspecto: Aspecto.lee({ arriba: 0 }), oficial: o });
  const of = Aspecto.viste(info(true)), h = Aspecto.viste(info(false));
  assert.strictEqual(of.chaleco, Aspecto.CHALECO); assert.strictEqual(of.oficial, true); assert.strictEqual(h.chaleco, null); assert.strictEqual(h.oficial, false);
  assert.strictEqual(of.camisa, h.camisa, "los brazos siguen con su ropa: el chaleco es solo el tronco");
  assert.ok(Aspecto.ROPA.indexOf(Aspecto.CHALECO) < 0 && Aspecto.CAMISAS.indexOf(Aspecto.CHALECO) < 0, "distinguible de cualquier ropa elegible");
  for (const mov of Aspecto.MOVILIDADES) {
    assert.strictEqual(Aspecto.cajas(1, mov, true), Aspecto.cajas(1, mov) + 1, mov);
    assert.ok(Aspecto.cajas(2, mov, true) <= Aspecto.CAJAS_MAX, "cabe en CAJAS_MAX: " + mov);
  }
});

// ---------- OficinaMundoPuro
test("los temas de la oficina solo valen SIN participante, en JSON v1, validados; lo raro se descarta", () => {
  const L = (t, o, de) => OP.lee(t, o instanceof Uint8Array ? o : json(o), de, Chat.limpia);
  assert.deepStrictEqual(OP.TEMAS.slice().sort(), Object.keys(ROLES.temas_de_datos).filter(t => ROLES.temas_de_datos[t].lo_manda === "api").sort(), "los del contrato");
  assert.deepStrictEqual(L("anuncio", { v: 1, texto: "  Hoy   se recoge  " }, null), { tema: "anuncio", texto: "Hoy se recoge" });
  assert.strictEqual(L("anuncio", { v: 1, texto: "hola" }, { identidad: "h_x", metadatos: JSON.stringify({ rol: "oficina" }) }), null, "con participante, ni siendo «oficina»: solo la api");
  assert.strictEqual(Array.from(L("anuncio", { v: 1, texto: "ñ".repeat(300) }, null).texto).length, 280);
  for (const malo of [{ v: 2, texto: "x" }, { texto: "x" }, { v: 1, texto: "   " }, { v: 1, texto: 7 }, [1], null]) assert.strictEqual(L("anuncio", malo, null), null, JSON.stringify(malo));
  assert.strictEqual(L("anuncio", new Uint8Array([0xff, 0xfe]), null), null, "UTF-8 roto");
  assert.strictEqual(L("anuncio", new Uint8Array(3000), null), null, "demasiado grande");
  assert.deepStrictEqual(L("sala", { v: 1, a: "visita" }, null), { tema: "sala", a: "visita" });
  for (const a of ["otra", "hituelo-visita", "__proto__", 1]) assert.strictEqual(L("sala", { v: 1, a }, null), null, String(a));
  assert.deepStrictEqual(L("balizas", { v: 1, finca: "hituelo" }, null), { tema: "balizas", finca: "hituelo" });
  assert.strictEqual(L("balizas", { v: 1, finca: "../x" }, null), null);
  assert.strictEqual(L("chat", { v: 1, texto: "x" }, null), null, "otro tema, no");
});

test("las balizas oficiales de la api: a coordenadas locales, validadas, sin repetir y como mucho 20; otra finca o formato, ninguna", () => {
  const b = (id, extra) => Object.assign({ id, finca: "hituelo", x: CENTRO[0] + 10 * id, y: CENTRO[1] - 5, titulo: "B" + id, texto: null, hasta: "2026-10-30T18:30:00Z" }, extra);
  const r = { finca: "hituelo", srs: "EPSG:25830", balizas: [b(1, { texto: " Traed  agua " }), b(2, { titulo: "   " }), b(1), b(3, { x: "no" }), b(4, { hasta: "nunca" }), b(5, { titulo: "<b>x</b>" })] };
  const l = OP.leeBalizas(r, CENTRO, "hituelo", Chat.limpia);
  assert.deepStrictEqual(l.map(x => [x.id, x.x, x.y, x.titulo, x.texto]), [[1, 10, -5, "B1", "Traed agua"], [5, 50, -5, "<b>x</b>", null]], "el título raro se queda como TEXTO (se pinta con textContent)");
  assert.strictEqual(l[0].hasta, Date.parse("2026-10-30T18:30:00Z"));
  assert.deepStrictEqual(OP.leeBalizas(Object.assign({}, r, { finca: "cerro" }), CENTRO, "hituelo", Chat.limpia), []);
  assert.deepStrictEqual(OP.leeBalizas(Object.assign({}, r, { srs: "EPSG:4326" }), CENTRO, "hituelo", Chat.limpia), []);
  assert.deepStrictEqual(OP.leeBalizas(null, CENTRO, "hituelo", Chat.limpia), []);
  const muchas = { finca: "hituelo", srs: "EPSG:25830", balizas: Array.from({ length: 30 }, (_, i) => b(i + 1)) };
  assert.strictEqual(OP.leeBalizas(muchas, CENTRO, "hituelo", Chat.limpia).length, 20);
  assert.deepStrictEqual(OP.aUtm(10.123, -5, CENTRO), { x: CENTRO[0] + 10.12, y: CENTRO[1] - 5 });
});

test("el panel: lo que manda a la api (anuncio y baliza) y cuánto dura un aviso; hasta cuándo se ve una baliza", () => {
  assert.deepStrictEqual(OP.cuerpoAnuncio("  hola  ", "todas", Chat.limpia), { texto: "hola", sala: "todas" });
  assert.strictEqual(OP.cuerpoAnuncio("   ", "todas", Chat.limpia), null); assert.strictEqual(OP.cuerpoAnuncio("hola", "otra", Chat.limpia), null);
  assert.deepStrictEqual(OP.cuerpoBaliza("hituelo", { x: 1, y: 2 }, CENTRO, " Aquí ", "", 8, Chat.limpia), { finca: "hituelo", x: CENTRO[0] + 1, y: CENTRO[1] + 2, titulo: "Aquí", horas: 8 });
  assert.strictEqual(OP.cuerpoBaliza("hituelo", { x: 1, y: 2 }, CENTRO, "Aquí", "Traed agua", 24, Chat.limpia).texto, "Traed agua");
  for (const [f, t, h] of [["", "x", 8], ["hituelo", " ", 8], ["hituelo", "x", 5], ["hituelo", "x", 0]]) assert.strictEqual(OP.cuerpoBaliza(f, { x: 1, y: 2 }, CENTRO, t, null, h, Chat.limpia), null, f + t + h);
  assert.ok(OP.HORAS.every(h => h >= 1 && h <= 168), "las horas que ofrece, dentro de las de la api (1-168)");
  assert.strictEqual(OP.dura(""), 6); assert.strictEqual(OP.dura("x".repeat(280)), 15); assert.ok(OP.dura("x".repeat(50)) > 8);
  const hoy = new Date(2026, 9, 30, 10, 0).getTime();
  assert.strictEqual(OP.hasta(new Date(2026, 9, 30, 18, 30).getTime(), hoy), "hasta las 18:30");
  assert.strictEqual(OP.hasta(new Date(2026, 10, 2, 9, 5).getTime(), hoy), "hasta el 02/11, 09:05");
  assert.strictEqual(OP.otraSala("general"), "visita"); assert.strictEqual(OP.otraSala("visita"), "general");
  for (const e of ["oficina:anuncio", "oficina:sala"]) assert.deepStrictEqual(EVENTOS.eventos[e].emiten, ["39_oficina_mundo"], e);
});

// ---------- los componentes de verdad en el registro de 02c: THREE, DOM, LiveKit y la api de mentira
function cualquiera() {
  const al = {};
  return new Proxy(function () {}, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (typeof k === "symbol" || k === "then") return undefined; return k in al ? al[k] : (al[k] = cualquiera()); },
    set(t, k, v) { al[k] = v; return true; }, apply() { return cualquiera(); }, construct() { return cualquiera(); }
  });
}
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); } project() { return this; } applyQuaternion() { return this; } toArray() { return [this.x, this.y, this.z]; } }
class Q { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } identity() { return this.set(0, 0, 0, 1); }
  setFromAxisAngle(e, a) { const s = Math.sin(a / 2); return this.set(e.x * s, e.y * s, e.z * s, Math.cos(a / 2)); } multiply() { return this; } }
class M4 { compose() { return this; } makeScale() { return this; } multiplyMatrices() { return this; } copy() { return this; } decompose() { return this; } identity() { return this; } premultiply() { return this; } }
function threeFalso(cuenta) {
  const T = cualquiera(), malla = () => { cuenta.mallas++; const m = cualquiera(); m.count = 0; m.dispose = () => { cuenta.mallasLibres++; }; m.setMatrixAt = () => {}; return m; };
  return new Proxy(T, { get: (t, k) => ({ Vector3: V3, Quaternion: Q, Matrix4: M4, InstancedMesh: function () { return malla(); }, Group: function () { const g = cualquiera(); g.name = ""; return g; } })[k] || T[k] });
}
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.style = {}; this.attrs = {}; this.oy = {}; this.hidden = false; this.parentNode = null; this.textContent = ""; this.value = ""; this.disabled = false; }
  appendChild(c) { if (c.parentNode && c.parentNode.children) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(n, f) { (this.oy[n] = this.oy[n] || []).push(f); } removeEventListener() {}
  dispara(n, e) { (this.oy[n] || []).slice().forEach(f => f(Object.assign({ preventDefault() {}, stopPropagation() {} }, e || {}))); }
  focus() {} getContext() { return cualquiera(); }
  todos(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) if (c.todos) c.todos(pred, out); return out; }
  texto() { return this.textContent + this.children.map(c => c.texto ? c.texto() : c.texto === undefined && c.t !== undefined ? c.t : (c.texto || "")).join(""); }
}
const textoDe = e => (e.textContent || "") + (e.children || []).map(c => c instanceof El ? textoDe(c) : (c.t || "")).join("");
const boton = (raiz, t) => raiz.todos(e => e.tagName === "BUTTON" && textoDe(e) === t)[0] || null;
function lkFalso(meta) {
  const RoomEvent = { ParticipantConnected: "pc", ParticipantDisconnected: "pd", DataReceived: "dr", Reconnecting: "rc", Reconnected: "rd", Disconnected: "dc" };
  const DisconnectReason = { UNKNOWN_REASON: 0, CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4 };
  const salas = [];
  class Room {
    constructor() { this.oy = {}; this.remoteParticipants = new Map(); this.publicados = []; this.desconexiones = 0; salas.push(this);
      const yo = this; this.localParticipant = { identity: null, metadata: null, publishData(d, op) { yo.publicados.push({ d, op }); return Promise.resolve(); } }; }
    on(ev, fn) { (this.oy[ev] = this.oy[ev] || []).push(fn); return this; }
    emite(ev, ...a) { (this.oy[ev] || []).forEach(fn => fn(...a)); }
    connect(url, token) { this.token = token; this.localParticipant.identity = "h_yo_" + token; this.localParticipant.metadata = JSON.stringify(meta); this.conectada = true; return Promise.resolve(); }
    disconnect() { this.desconexiones++; const era = this.conectada; this.conectada = false; if (era) this.emite(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED); return Promise.resolve(); }
    entra(identity, metadata) { const p = { identity, metadata }; this.remoteParticipants.set(identity, p); this.emite(RoomEvent.ParticipantConnected, p); return p; }
    datos(p, tema, bytes) { this.emite(RoomEvent.DataReceived, bytes, p, 0, tema); }
  }
  return { Room, RoomEvent, DisconnectReason, salas };
}
const BALIZAS = { finca: "hituelo", srs: "EPSG:25830", balizas: [{ id: 7, finca: "hituelo", x: CENTRO[0] + 30, y: CENTRO[1] + 40, titulo: "Aquí se recoge hoy", texto: "Traed agua", hasta: "2030-01-01T10:00:00Z" }] };
/** el registro (02c) y Entidades de verdad (su validación) con la presencia pura (26), la red (37), la presencia (38) y la oficina (39); lo demás, de mentira */
function motor({ busqueda = "?presencia=red", rol = "oficina", base = "/teselas/hituelo/", ficheros = ["red", "presencia", "oficina"], balizas = BALIZAS } = {}) {
  const meta = { alias: rol === "hogar" ? "Mirlo" : "Oficina", rol, avatar: { camisa: 1, sombrero: "paja", piel: 1 }, dispositivo: "escritorio" };
  const LK = lkFalso(meta), errores = [], cuenta = { mallas: 0, mallasLibres: 0, escena: 0, fetch: [], tipos: {}, quitados: [], ventanas: {}, iconos: [], capas: 0, laminas: [], hudAvisos: [] };
  const fuentes = { red: sinCabecera(RED).replace('import("livekit-client")', "Promise.resolve(LK_FALSO)"),
    presencia: sinCabecera(PRES).replace('import("three/addons/utils/BufferGeometryUtils.js")', "Promise.reject(new Error(\"sin addons en Node\"))"),
    oficina: sinCabecera(OFI) };
  const ventana = { addEventListener() {}, removeEventListener() {} }, visor = new El("div");
  const documento = { getElementById: () => null, createElement: t => new El(t), createTextNode: t => ({ t }), body: new El("body"), activeElement: null };
  const consola = { error: (...a) => errores.push(a.map(String).join(" ")), warn: (...a) => { const t = a.map(String).join(" "); if (!/sin quad ni dron/.test(t)) errores.push(t); }, log() {} };
  const respuestas = { token: { url: "/rtc", token: "tk" } };
  const g = {
    THREE: threeFalso(cuenta), LK_FALSO: LK, D: { ext: [0, 200, 200, 0], base, finca_id: "hituelo", centro_utm: CENTRO }, suelo: () => 10, copas: [], exag: 1, texColor: x => x,
    scene: { add: () => { cuenta.escena++; }, remove: () => { cuenta.escena--; } }, camera: { position: new V3(0, 20, 0), quaternion: new Q() }, renderer: cualquiera(), visor,
    Entidades: { registra: d => { const e = EntidadesPuro.valida(d); if (e.length) throw new Error(d.tipo + ": " + e.join("; ")); cuenta.tipos[d.tipo] = d; return () => { cuenta.quitados.push(d.tipo); delete cuenta.tipos[d.tipo]; }; } },
    Llegada: { funde: fn => { fn(); return true; }, aparece() {}, ve: (x, y) => { cuenta.ida = [x, y]; return true; } }, TR: {},
    Movibles: { hazMovible: () => ({ menuLlevar() {}, coloca() {} }) }, VRX: { on: false, cab: new V3(), rig: { yaw: 0 } }, paseando: true, pp: { x: 50, y: 60, ang: 0 },
    enQuad: false, enDron: false, quad: cualquiera(), dron: cualquiera(), objetivo: new V3(50, 0, -50), persona: null, primera: false, navigator: { userAgent: "Node" },
    HazasPuro: { prefijoApi: (s, b) => /^\/teselas\//.test(b || "") ? "/api/" : null },
    Laminas: { abre: d => { cuenta.laminas.push(d.id); return true; }, cierra: () => true, hay: () => false },
    Ventanas: { registra: (id, def) => { const cu = new El("div"); cuenta.ventanas[id] = cu; def.construye(cu); return () => { delete cuenta.ventanas[id]; }; } },
    Hud: { icono: d => { cuenta.iconos.push(d.id); return () => { cuenta.iconos.splice(cuenta.iconos.indexOf(d.id), 1); }; }, aviso: t => cuenta.hudAvisos.push(t) },
    Minimapa: { capa: () => { cuenta.capas++; return () => { cuenta.capas--; }; } },
    fetch: (u, o) => {
      const m = (o && o.method) || "GET"; cuenta.fetch.push([m, u, o && o.body ? JSON.parse(o.body) : null]);
      const r = (st, j) => Promise.resolve({ ok: st < 300, status: st, json: () => Promise.resolve(j) });
      if (u === "/api/presencia/token") return r(200, Object.assign({}, respuestas.token, { token: "tk" + cuenta.fetch.filter(f => f[1] === u).length }));
      if (u.startsWith("/api/balizas-oficiales")) return r(200, balizas);
      if (u === "/api/admin/presencia/anuncio") return r(200, { salas: ["hituelo-libre"] });
      if (u === "/api/admin/presencia/llevar") return r(200, { enviado: true });
      if (u === "/api/admin/balizas") return r(201, { id: 8 });
      if (/^\/api\/admin\/balizas\/\d+$/.test(u)) return m === "DELETE" ? Promise.resolve({ ok: true, status: 204, json: () => Promise.reject(new Error("vacío")) }) : r(200, { id: 7 });
      return r(404, { mensaje: "no" });
    }
  };
  const nombres = Object.keys(g), codigo = sinCabecera(LIB) + "\n" + ficheros.map(f => fuentes[f]).join("\n");
  const f = new Function(...["window", "location", "document", "console"].concat(nombres), "\"use strict\";\n" + sinCabecera(NUCLEO) + "\n" + codigo + "\nreturn { Componentes, Bus };");
  const r = f(...[ventana, { search: busqueda, href: "https://gemelo.test/finca/index.html" + busqueda }, documento, consola].concat(nombres.map(n => g[n])));
  const bus = []; ["oficina:anuncio", "oficina:sala"].forEach(e => r.Bus.on(e, d => bus.push([e, d])));
  r.Componentes.arranca();
  return Object.assign(r, { LK, errores, cuenta, ventana, visor, g, bus, tarde: () => r.Componentes.actualiza("tarde", 0.5, 0) });
}
const ACTIVOS = r => r.Componentes.resumen().filter(x => x.activo).map(x => x.id).sort();
const deLaApi = (room, tema, o) => room.datos(undefined, tema, json(o));

test("componentes en Node: la oficina en la sala tiene su panel; el anuncio sale arriba, en el chat y en el Bus; uno con participante se descarta", async () => {
  const r = motor(); await espera(20);
  assert.deepStrictEqual(ACTIVOS(r), ["oficina-mundo", "presencia-compartida", "red-salas"]);
  assert.deepStrictEqual(r.Componentes.resumen().map(x => x.id), ["red-salas", "presencia-compartida", "oficina-mundo"], "monta tras la red y la presencia");
  const room = r.LK.salas[0]; assert.ok(room, "dentro de la sala «visita» de la red");
  assert.strictEqual(r.ventana.__presencia().oficina, true, "tus metadatos dicen oficina");
  r.tarde();
  assert.ok(r.cuenta.ventanas.oficina, "la ventana «Oficina»"); assert.deepStrictEqual(r.cuenta.iconos, ["oficina"]); assert.strictEqual(r.ventana.__oficinaMundo().panel, true);
  // el anuncio de la api (sin participante)
  deLaApi(room, "anuncio", { v: 1, texto: "  Hoy se recoge  en la loma " });
  const banner = r.visor.todos(e => e.attrs.id === "oficinaAnuncio")[0];
  assert.ok(banner && !banner.hidden); assert.strictEqual(banner.textContent, "◆ Oficina: Hoy se recoge en la loma");
  assert.strictEqual(banner.style.cssText.includes("pointer-events:none"), true, "no recibe toques: no tapa nada que se pulse");
  assert.deepStrictEqual(r.bus, [["oficina:anuncio", { texto: "Hoy se recoge en la loma" }]]);
  const chat = r.visor.todos(e => e.tagName === "OL")[0]; assert.match(textoDe(chat), /Oficina: Hoy se recoge en la loma/);
  // el mismo tema desde un navegador (con participante, aunque diga ser oficina): fuera
  const listo = room.entra("h_falso", JSON.stringify({ alias: "Oficina", rol: "oficina" }));
  room.datos(listo, "anuncio", json({ v: 1, texto: "Os regalo aceite: pinchad aquí" }));
  assert.strictEqual(r.ventana.__oficinaMundo().descartados, 1); assert.strictEqual(r.bus.length, 1); assert.doesNotMatch(textoDe(chat), /regalo/);
  // se va solo (dura 6 s + 60 ms por carácter)
  for (let i = 0; i < 20; i++) r.tarde();
  assert.strictEqual(banner.hidden, true);
  assert.deepStrictEqual(r.errores, []);
});

test("componentes en Node: el panel de la oficina manda a la api el anuncio, la invitación y la baliza donde estás (en UTM 25830)", async () => {
  const r = motor(); await espera(20); r.tarde();
  const cu = r.cuenta.ventanas.oficina;
  const ta = cu.todos(e => e.tagName === "TEXTAREA")[0], sel = cu.todos(e => e.tagName === "SELECT")[0];
  ta.value = "  Recogida en la loma  "; sel.value = "visita"; boton(cu, "Anunciar").dispara("click"); await espera(5);
  assert.deepStrictEqual(r.cuenta.fetch.filter(f => f[1] === "/api/admin/presencia/anuncio").map(f => f[2]), [{ texto: "Recogida en la loma", sala: "visita" }]);
  boton(cu, "Invitar a todos a la Sala de la visita").dispara("click"); await espera(5);
  assert.deepStrictEqual(r.cuenta.fetch.filter(f => f[1] === "/api/admin/presencia/llevar").map(f => f[2]), [{ de: "general", a: "visita" }]);
  const tit = cu.todos(e => e.tagName === "INPUT")[0]; tit.value = "Aquí se recoge hoy";
  boton(cu, "Poner aquí").dispara("click"); await espera(5);
  assert.deepStrictEqual(r.cuenta.fetch.filter(f => f[0] === "POST" && f[1] === "/api/admin/balizas").map(f => f[2]), [{ finca: "hituelo", x: CENTRO[0] + 50, y: CENTRO[1] + 60, titulo: "Aquí se recoge hoy", horas: 8 }], "donde pasea (pp), en UTM");
  const estado = cu.todos(e => e.attrs.role === "status")[0]; assert.match(estado.textContent, /Baliza puesta/);
  // sin título no se manda
  const n = r.cuenta.fetch.length; tit.value = "  "; boton(cu, "Poner aquí").dispara("click"); await espera(5);
  assert.strictEqual(r.cuenta.fetch.length, n); assert.match(estado.textContent, /título/);
  assert.deepStrictEqual(r.errores, []);
});

test("componentes en Node: la invitación a otra sala pregunta; «Quedarme» no hace nada; «Ir» pide el token de la otra sala y cambia", async () => {
  const r = motor({ rol: "hogar" }); await espera(20); r.tarde();
  assert.strictEqual(r.cuenta.ventanas.oficina, undefined, "un hogar no tiene panel"); assert.deepStrictEqual(r.cuenta.iconos, []);
  const room = r.LK.salas[0];
  deLaApi(room, "sala", { v: 1, a: "general" }); assert.strictEqual(r.ventana.__oficinaMundo().invitacion, null, "a la sala en la que ya estás, nada");
  deLaApi(room, "sala", { v: 1, a: "visita" });
  const dlg = r.visor.todos(e => e.attrs.id === "oficinaInvitacion")[0]; assert.ok(dlg && !dlg.hidden);
  assert.match(textoDe(dlg), /La oficina os invita a la Sala de la visita\. Cambiar de sala no te mueve de sitio/);
  assert.deepStrictEqual(r.bus, [["oficina:sala", { a: "visita" }]]);
  boton(dlg, "Quedarme").dispara("click"); assert.strictEqual(dlg.hidden, true); assert.strictEqual(r.LK.salas.length, 1, "sin pulsar «Ir», nadie cambia de sala");
  deLaApi(room, "sala", { v: 1, a: "visita" }); assert.strictEqual(dlg.hidden, false);
  boton(dlg, "Ir").dispara("click"); await espera(20);
  const tok = r.cuenta.fetch.filter(f => f[1] === "/api/presencia/token");
  assert.deepStrictEqual(tok.map(f => f[2]), [{ dispositivo: "escritorio" }, { dispositivo: "escritorio", sala: "visita" }], "la primera sin sala (la general, como siempre); la segunda, la de la visita");
  assert.strictEqual(r.LK.salas.length, 2); assert.strictEqual(room.desconexiones, 1, "la red deja la de antes");
  const e = r.ventana.__presencia(); assert.strictEqual(e.sala, "visita"); assert.strictEqual(e.conectado, true);
  assert.doesNotMatch(textoDe(r.visor), /Te has desconectado/, "cambiar de sala no avisa de desconexión");
  assert.match(textoDe(r.visor), /Sala de la visita: sin voz/);
  // lo de la sala nueva sigue llegando a la oficina (las escuchas son de la sala «visita» de la red, no de una Room)
  deLaApi(r.LK.salas[1], "anuncio", { v: 1, texto: "Bienvenidos" }); assert.strictEqual(r.ventana.__oficinaMundo().anuncios, 1);
  assert.deepStrictEqual(r.errores, []);
});

test("componentes en Node: las balizas oficiales se piden, son entidades con su ficha (Quitar solo la oficina), se repiden con el tema «balizas» y se sueltan", async () => {
  let r = motor(); await espera(20); r.tarde();
  assert.deepStrictEqual(r.cuenta.fetch.filter(f => f[1].startsWith("/api/balizas-oficiales")).map(f => f[1]), ["/api/balizas-oficiales?finca=hituelo"]);
  const T = r.cuenta.tipos["baliza-oficial"]; assert.ok(T, "el tipo de Entidades"); assert.strictEqual(T.prioridad, 21);
  assert.ok(T.prioridad > 20 && T.prioridad < 30, "por encima de las balizas de las parcelas (20) y por debajo de las personas (30)");
  assert.deepStrictEqual(T.lista(), [{ id: "baliza-oficial:7", x: 30, y: 40, titulo: "Aquí se recoge hoy" }]);
  assert.deepStrictEqual(r.ventana.__oficinaMundo().mallas, [1, 1], "columna y bandera: una instancia de cada");
  assert.strictEqual(r.cuenta.capas, 1, "su capa del minimapa");
  const f = T.ficha("baliza-oficial:7", "pantalla");
  assert.strictEqual(f.titulo, "◆ Oficina · Aquí se recoge hoy"); assert.deepStrictEqual(f.filas[0], { k: "Dice", v: "Traed agua" });
  assert.deepStrictEqual(f.acciones.map(a => a.txt), ["Ir a esta baliza", "Mover aquí", "Quitar baliza"]);
  assert.strictEqual(f.acciones[0].fn(), true); assert.ok(r.cuenta.ida, "Ir: Llegada.ve junto a la columna");
  await f.acciones[2].fn();
  assert.deepStrictEqual(r.cuenta.fetch.filter(f => f[0] === "DELETE").map(f => f[1]), ["/api/admin/balizas/7"]);
  await f.acciones[1].fn();
  assert.deepStrictEqual(r.cuenta.fetch.filter(f => f[0] === "PUT").map(f => [f[1], f[2]]), [["/api/admin/balizas/7", { x: CENTRO[0] + 50, y: CENTRO[1] + 60 }]]);
  // la api avisa por la sala: se repiden (las de otra finca, no)
  const antes = r.ventana.__oficinaMundo().pedidas;
  deLaApi(r.LK.salas[0], "balizas", { v: 1, finca: "cerro" }); deLaApi(r.LK.salas[0], "balizas", { v: 1, finca: "hituelo" }); await espera(5);
  assert.strictEqual(r.ventana.__oficinaMundo().pedidas, antes + 1);
  // libera: quita el tipo, la capa, la ventana, el icono y suelta las mallas
  const mallas = r.cuenta.mallas;
  assert.ok(r.Componentes.libera("oficina-mundo"));
  assert.ok(r.cuenta.quitados.includes("baliza-oficial")); assert.strictEqual(r.cuenta.capas, 0); assert.strictEqual(r.cuenta.ventanas.oficina, undefined); assert.deepStrictEqual(r.cuenta.iconos, []);
  assert.ok(r.cuenta.mallasLibres >= 2 && mallas >= 2); assert.strictEqual(r.ventana.__oficinaMundo, undefined);
  assert.deepStrictEqual(r.errores, []);
  // un hogar: la misma ficha sin «Mover aquí» ni «Quitar»
  r = motor({ rol: "hogar" }); await espera(20);
  assert.deepStrictEqual(r.cuenta.tipos["baliza-oficial"].ficha("baliza-oficial:7", "vr").acciones.map(a => a.txt), ["Ir a esta baliza"]);
});

test("componentes en Node: ?oficina=0 la apaga; ?red=0 o ?presencia=0 se la llevan; sin servidor no pide nada; sin ?presencia=red, solo las balizas", async () => {
  let r = motor({ busqueda: "?presencia=red&oficina=0" }); await espera(20);
  assert.deepStrictEqual(ACTIVOS(r), ["presencia-compartida", "red-salas"]); assert.strictEqual(r.cuenta.tipos["baliza-oficial"], undefined);
  r = motor({ busqueda: "?presencia=red&red=0" }); assert.deepStrictEqual(ACTIVOS(r), []);
  assert.match(r.Componentes.resumen().find(x => x.id === "oficina-mundo").motivo, /falta/);
  r = motor({ busqueda: "?presencia=0" }); assert.ok(!ACTIVOS(r).includes("oficina-mundo"));
  // sin servidor (la escena de un fichero, el fixture): ni balizas ni panel, aunque seas de la oficina
  r = motor({ base: "" }); await espera(20); r.tarde();
  assert.deepStrictEqual(r.cuenta.fetch.filter(f => !f[1].startsWith("/api/presencia")), []); assert.strictEqual(r.cuenta.ventanas.oficina, undefined);
  // sin ?presencia=red: no hay sala (ni anuncios ni panel), pero las balizas oficiales se ven
  r = motor({ busqueda: "" }); await espera(20); r.tarde();
  assert.strictEqual(r.LK.salas.length, 0); assert.strictEqual(r.cuenta.ventanas.oficina, undefined);
  assert.strictEqual(r.cuenta.tipos["baliza-oficial"].lista().length, 1);
  assert.deepStrictEqual(r.errores, []);
});
