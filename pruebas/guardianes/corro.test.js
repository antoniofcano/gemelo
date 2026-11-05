"use strict";
// F3k-2 y F3k-3, la voz por cercanía en corros (ADR-0032; decisiones 205-212 provisionales). En Node, SIN navegador, SIN LiveKit y SIN Web Audio:
//   · VozPuro (45_voz.js): la sala «corro-<id>» del contrato (livekit-roles v8), el papel «miembro», la curva del corro (sin suelo mínimo; fundido de 15 a 20 m en
//     1 s; nunca sube al alejarse) y no pedir la pista de quien silencias; VozMotor: Voz.entraCorro pide el token de POST /api/presencia/corros/token y se
//     une con la clave «corro» de la red; no estando en un corro, no; en una guiada, no; silenciar suelta la pista.
//   · HablaPuro (47_habla.js): la caja del micro en un corro (papel «miembro»), «● Tu micro está abierto» y el cierre tras 60 s de silencio (propiedad).
//   · CorroPuro (47b_corro.js): el aviso «cercania» es el del contrato, palabra por palabra, con la versión de la api; el estado de la api validado; invitar
//     solo a menos de 8 m; lejos de todos con histéresis (propiedad); vista aérea; quién habla; altas y bajas; el icono.
//   · CorroMotor con una api, una presencia, una voz, una red, un Ajustes, un PanelVR, unas Laminas y un DOM de mentira: sin servidor no hace nada; con 503 o
//     el interruptor apagado no enseña nada; la casilla enseña el aviso ANTES (foco en «Ahora no», «Activar» solo con la declaración) y solo activa si se
//     acepta; la invitación (pantalla y VR); la lista, quién habla, silenciar, bloquear, avisar y salir con su motivo; las salidas solas; el tema «corro».
// Lo de Chrome (tres navegadores con micrófono simulado y LiveKit de verdad, F3k-5) está ESCRITO en pruebas/guardianes/corro_dev.test.js y no se ha ejecutado.
const test = require("node:test"), assert = require("node:assert");
const fc = require("fast-check");
const { lee } = require("./_util");
const { aparatoDe } = require("./_aparato");

const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return s.slice(i, f); };
const VOZ = lee("apps/web/motor/45_voz.js"), HAB = lee("apps/web/motor/47_habla.js"), COR = lee("apps/web/motor/47b_corro.js"), LAMJS = lee("apps/web/motor/02d_laminas.js");
const V = new Function("\"use strict\";\n" + trozo(VOZ, "// [puro:inicio]", "// [puro:fin]") + "\nreturn VozPuro;")();
const H = new Function("\"use strict\";\n" + trozo(HAB, "// [puro:inicio]", "// [puro:fin]") + "\nreturn HablaPuro;")();
const PURO = trozo(COR, "// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo(COR, "// [motor:inicio]", "// [motor:fin]");
const C = new Function("\"use strict\";\n" + PURO + "\nreturn CorroPuro;")();
const LaminasPuro = new Function("\"use strict\";\n" + trozo(LAMJS, "// [puro:inicio]", "// [puro:fin]") + "\nreturn LaminasPuro;")();
const ROLES = JSON.parse(lee("contratos/livekit-roles.json")), EVENTOS = JSON.parse(lee("contratos/eventos.json")), IFACES = JSON.parse(lee("contratos/interfaces.json"));
const espera = (ms = 0) => new Promise(r => setTimeout(r, ms));
const cerca = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

const YO = "h_" + "a".repeat(22), ANA = "h_" + "b".repeat(22), LUIS = "h_" + "c".repeat(22);
const YO_ID = YO + "_yyyyyyyy", ANA_ID = ANA + "_aaaaaaaa", LUIS_ID = LUIS + "_llllllll";
const SALA = "corro-ABCdef123_-x";

// ---------- VozPuro y VozMotor en un corro (F3k-2)
test("VozPuro: la sala corro-<id> del contrato (livekit-roles v8), su ámbito y el papel «miembro» que puede hablar", () => {
  assert.strictEqual(V.SALA_CORRO.source, new RegExp(ROLES.salas.corro.patron).source, "el mismo patrón que livekit-roles.json → salas.corro.patron");
  for (const s of [SALA, "corro-____________", "corro-AAAAAAAAAAAA"]) { assert.ok(V.esCorro(s), s); assert.strictEqual(V.ambito(s), "corro"); assert.ok(V.esSalaVoz(s)); assert.ok(!V.esGuiada(s)); }
  for (const s of ["corro-", "corro-abc", "corro-ABCdef123_-xy", "Corro-ABCdef123_-x", "hituelo-libre", "", null]) assert.ok(!V.esCorro(s), String(s));
  assert.strictEqual(V.ambito("guiada-7"), "guiada"); assert.ok(V.esSalaVoz("guiada-7")); assert.strictEqual(V.ambito("hituelo-libre"), ""); assert.ok(!V.esSalaVoz("hituelo-libre"));
  assert.strictEqual(V.papelDe(JSON.stringify({ papel: "miembro" })), "miembro");
  const m = ROLES.roles_corro.miembro;
  assert.ok(V.puedeHablar({ publicar: m.canPublish, fuentes: m.canPublishSources }), "el miembro de un corro publica su micrófono");
  assert.deepStrictEqual(V.decideAbrir({ dentro: true, guiada: V.esSalaVoz(SALA), micro: "cerrado", puede: true, gesto: true }), { abre: true, motivo: "ok" });
});

test("VozPuro: en un corro, sin suelo mínimo y fundido de 15 a 20 m (a 20 m o más no se oye); en 1 s; la guiada no cambia", () => {
  assert.deepStrictEqual(V.DIST_CORRO, { desde: 15, corte: 20, fundido: 1 });
  assert.strictEqual(V.ganancia(2, false, "corro"), 1); assert.ok(cerca(V.ganancia(4, false, "corro"), 0.5)); assert.ok(cerca(V.ganancia(10, false, "corro"), 0.2));
  assert.ok(cerca(V.ganancia(15, false, "corro"), 2 / 15)); assert.ok(cerca(V.ganancia(17.5, false, "corro"), (2 / 17.5) * 0.5), "a mitad del fundido, la mitad");
  for (const d of [20, 25, 41, 500]) assert.strictEqual(V.ganancia(d, true, "corro"), 0, "a " + d + " m nada, ni siquiera «prioritaria»: en un corro nadie tiene prioridad");
  assert.ok(cerca(V.ganancia(10, true, "guiada"), 0.25), "la guiada sigue con su suelo"); assert.ok(cerca(V.ganancia(10, true), 0.25));
  assert.strictEqual(V.ganancia(NaN, false, "corro"), V.DIST.sinSitio);
  assert.ok(cerca(V.suaveDe("corro") * 3, 1), "al 95 % en 1 s (tres constantes de tiempo)"); assert.strictEqual(V.suaveDe("guiada"), V.SUAVE);
  const dist = fc.double({ min: 0, max: 5000, noNaN: true });
  fc.assert(fc.property(dist, dist, (a, b) => { const ga = V.ganancia(Math.min(a, b), false, "corro"), gb = V.ganancia(Math.max(a, b), false, "corro"); return ga >= gb && ga <= 1 && gb >= 0 && (Math.max(a, b) < 20 || gb === 0); }));
});

test("VozPuro: no se pide la pista de quien TÚ has silenciado", () => {
  const pubs = [{ identidad: ANA_ID, sid: "A", fuente: "microphone" }, { identidad: LUIS_ID, sid: "L", fuente: "microphone" }];
  assert.deepStrictEqual(V.aSuscribir(pubs, () => ({}), 4), ["A", "L"]);
  assert.deepStrictEqual(V.aSuscribir(pubs, () => ({}), 4, { [ANA_ID]: true }), ["L"]);
  assert.deepStrictEqual(V.aSuscribir(pubs, () => ({}), 4, { [ANA_ID]: false }), ["A", "L"], "solo true silencia");
});

function salaFalsa(nombre) {
  const oy = {}, s = { _estado: "fuera", _nombre: nombre, _pubs: [], suscritas: [], salidas: 0, cred: null,
    al(e, fn) { (oy[e] = oy[e] || []).push(fn); return () => {}; }, emite(e, d) { (oy[e] || []).slice().forEach(fn => fn(d)); },
    estado: () => s._estado, nombre: () => (s._estado === "dentro" ? s._nombre : ""), permisos: () => (s._estado === "dentro" ? { publicar: true, fuentes: ["microphone"], datos: false } : null),
    yo: () => ({ identidad: YO_ID, metadatos: JSON.stringify({ papel: "miembro" }) }), participantes: () => [], atributos: () => ({}), publicaciones: () => s._pubs,
    suscribe(id, sid, si) { const p = s._pubs.find(x => x.sid === sid); if (!p) return false; p.suscrita = si; s.suscritas.push([sid, si]); return true; },
    microfono: () => Promise.resolve(true), microAbierto: () => false,
    une(cred) { s.cred = cred; s._estado = "dentro"; return Promise.resolve(true); }, sale() { s.salidas++; s._estado = "fuera"; s.emite("estado", { estado: "fuera", motivo: "propio" }); return Promise.resolve(); } };
  return s;
}
function montaVoz({ nombre = SALA, estadoToken = 200 } = {}) {
  const salas = { corro: salaFalsa(nombre), guiada: salaFalsa("guiada-7") }, fetchs = [], emitidos = [];
  const R = { sala: c => salas[c] || null };
  const n = { emite: (e, d) => { emitidos.push([e, d]); return 0; }, on: () => {}, limpia: f => f };
  const g = { window: { addEventListener() {}, removeEventListener() {} }, location: { search: "" }, document: { createElement: () => ({ setAttribute() {}, play: () => Promise.resolve() }), body: { appendChild() {} } },
    Aparato: aparatoDe({ userAgent: "Node" }), navigator: { userAgent: "Node", userActivation: { isActive: true } }, console: { warn() {}, log() {}, error() {} },
    fetch: (u, o) => { fetchs.push([u, o.method, JSON.parse(o.body)]); return Promise.resolve({ ok: estadoToken === 200, status: estadoToken, json: () => Promise.resolve(estadoToken === 200 ? { url: "/rtc", token: "tk", sala: nombre, papel: "miembro" } : { error: "sin_corro", mensaje: "No estás en ningún corro." }) }); },
    MediaStream: function () {}, PannerNode: function () {}, THREE: { Quaternion: function () { this.setFromAxisAngle = () => this; this.multiply = () => this; }, Vector3: function () { this.copy = () => this; } },
    camera: { getWorldPosition() {}, getWorldQuaternion() {} }, VRX: { on: false } };
  const nombres = Object.keys(g);
  const VozMotor = new Function(...nombres, "\"use strict\";\n" + trozo(VOZ, "// [puro:inicio]", "// [puro:fin]") + trozo(VOZ, "// [motor:inicio]", "// [motor:fin]") + "\nreturn VozMotor;")(...nombres.map(k => g[k]));
  return { api: VozMotor(n, R, { cabeza: () => null }), salas, fetchs, emitidos };
}

test("VozMotor: Voz.entraCorro pide el token del corro (POST /api/presencia/corros/token) y se une con la clave «corro» de la red; solo si la sala es corro-<id>", async () => {
  let m = montaVoz();
  assert.deepStrictEqual(Object.keys(m.api).sort(), IFACES.apis_de_componentes["voz-guiada"].miembros.slice().sort(), "la api (interfaces.json)");
  assert.strictEqual(await m.api.entraCorro(), true);
  assert.deepStrictEqual(m.fetchs, [["/api/presencia/corros/token", "POST", { dispositivo: "escritorio" }]]);
  assert.deepStrictEqual(m.salas.corro.cred, { url: "/rtc", token: "tk" });
  let e = m.api.estado(); assert.strictEqual(e.corro, true); assert.strictEqual(e.guiada, false); assert.strictEqual(e.sala, SALA); assert.strictEqual(e.papel, "miembro"); assert.strictEqual(e.puede, true);
  assert.strictEqual(await m.api.entraCorro(), true); assert.strictEqual(m.fetchs.length, 1, "ya dentro: no pide otro token");
  // silenciar a alguien: su pista no se pide (y se suelta si ya estaba)
  m.salas.corro._pubs.push({ identidad: ANA_ID, sid: "TA", fuente: "microphone", suscrita: true });
  assert.strictEqual(m.api.silencia(ANA_ID, true), true); assert.deepStrictEqual(m.salas.corro.suscritas.pop(), ["TA", false]); assert.deepStrictEqual(m.api.estado().callados, [ANA_ID]);
  assert.strictEqual(m.api.silencia(ANA_ID, false), false); assert.deepStrictEqual(m.salas.corro.suscritas.pop(), ["TA", true]);
  await m.api.sale(); assert.strictEqual(m.salas.corro.salidas, 1, "sale de su sala"); assert.strictEqual(m.api.estado().corro, false);
  // la api no da token (no estás en un corro): su código, y no se une
  m = montaVoz({ estadoToken: 409 }); assert.strictEqual(await m.api.entraCorro(), false); assert.strictEqual(m.api.estado().motivo, "sin_corro"); assert.strictEqual(m.salas.corro.cred, null);
  // una sala que no es de corro: fuera
  m = montaVoz({ nombre: "hituelo-libre" }); assert.strictEqual(await m.api.entraCorro(), false); assert.strictEqual(m.api.estado().motivo, "no_corro"); assert.strictEqual(m.salas.corro.salidas, 1);
});

// ---------- HablaPuro en un corro
test("HablaPuro: en un corro con el papel «miembro», la caja del micro; «● Tu micro está abierto»; sin papel o fuera, nada", () => {
  const e = { guiada: false, corro: true, papel: "miembro", puede: true, micro: "cerrado", motivo: "", auriculares: false, mano: false, puesto: null, ocupado: false };
  let v = H.vista(e, "pulsar"); assert.strictEqual(v.visible, true); assert.strictEqual(v.primaria.accion, "micro"); assert.strictEqual(v.primaria.texto, "Hablar");
  v = H.vista(Object.assign({}, e, { micro: "abierto" }), "pulsar"); assert.strictEqual(v.micro.icono, "●"); assert.match(v.micro.texto, /^Tu micro está abierto/);
  assert.strictEqual(H.vista(Object.assign({}, e, { papel: "familia" }), "pulsar").visible, false, "el papel de un corro es «miembro»");
  assert.strictEqual(H.vista(Object.assign({}, e, { corro: false }), "pulsar").visible, false);
  assert.strictEqual(H.vista(Object.assign({}, e, { guiada: true, corro: false, papel: "familia" }), "pulsar").visible, true, "la guiada, como siempre");
  assert.match(H.vista(Object.assign({}, e, { micro: "abierto", corro: false, guiada: true, papel: "guia" }), "pulsar").micro.texto, /Micrófono abierto: te oyen/, "en la guiada, el texto de siempre");
  assert.strictEqual(H.requiere("miembro", "micro", "no"), "nada", "el consentimiento de la cercanía lo exige la api al activarla y al firmar el token, no el botón");
});

test("propiedad: el micro abierto en un corro se cierra tras SILENCIO_S segundos sin que se te oiga; hablar reinicia la cuenta; fuera de un corro, nunca", () => {
  assert.strictEqual(H.SILENCIO_S, 60);
  assert.deepStrictEqual(H.silencio({ corro: true, micro: "abierto", habla: false, t: 59.9, dt: 0.25 }), { t: 0, cierra: true });
  assert.deepStrictEqual(H.silencio({ corro: true, micro: "abierto", habla: true, t: 59.9, dt: 0.25 }), { t: 0, cierra: false });
  assert.deepStrictEqual(H.silencio({ corro: false, micro: "abierto", habla: false, t: 59.9, dt: 0.25 }), { t: 0, cierra: false });
  fc.assert(fc.property(fc.array(fc.record({ dt: fc.double({ min: 0, max: 2, noNaN: true }), habla: fc.boolean(), corro: fc.boolean() }), { maxLength: 400 }), pasos => {
    let t = 0, callado = 0;
    for (const p of pasos) {
      const r = H.silencio({ corro: p.corro, micro: "abierto", habla: p.habla, t, dt: p.dt });
      callado = p.corro && !p.habla ? callado + p.dt : 0;
      if (r.cierra !== (callado >= 60)) return false;
      if (r.cierra) callado = 0;
      t = r.t;
    }
    return true;
  }));
});

// ---------- CorroPuro
const contrato = lee("contratos/voz-consentimiento.md");
const limpia = s => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
test("el aviso «cercania» del motor es el del contrato, palabra por palabra; su versión es la de la api (VOZ_CERCANIA_AVISO_VERSION) y la del contrato", () => {
  const api = lee("apps/api/src/presencia/consentimiento_voz.ts"), m = /VOZ_CERCANIA_AVISO_VERSION\s*=\s*(\d+)/.exec(api);
  assert.ok(m, "la api declara VOZ_CERCANIA_AVISO_VERSION"); assert.strictEqual(C.AVISO_VERSION, Number(m[1]), "la misma versión en el motor y en la api: si cambia el texto, se suben las dos");
  const v = /Aviso «cercania», versión (\d+)/.exec(contrato); assert.ok(v); assert.strictEqual(C.AVISO.version, Number(v[1]), "y en el contrato");
  const i = contrato.indexOf("Aviso «cercania», versión"), bloque = contrato.slice(i).split("\n").filter(l => l.startsWith(">")).map(l => limpia(l.replace(/^>\s?/, ""))).filter(Boolean);
  const textos = [C.AVISO.titulo, C.AVISO.tPasa, C.AVISO.tNoPasa].concat(C.AVISO.pasa, C.AVISO.noPasa, [C.AVISO.declaracion, C.AVISO.masInfo]);
  for (const t of textos) assert.ok(bloque.some(l => l.replace(/^[-☐]\s*/, "") === t), "en el contrato, tal cual: «" + t + "»");
  const puntos = bloque.filter(l => l.startsWith("- ")).length; assert.strictEqual(puntos, C.AVISO.pasa.length + C.AVISO.noPasa.length, "ni un punto de más ni de menos");
  assert.strictEqual(C.AVISO.activar, "Activar"); assert.strictEqual(C.AVISO.ahoraNo, "Ahora no"); assert.strictEqual(C.AVISO.borrador, true);
});

test("CorroPuro: los motivos, el tope del texto y los motivos de salida son los de la api; las rutas, las del contrato", () => {
  const cer = lee("apps/api/src/presencia/cercania.ts"), cor = lee("apps/api/src/presencia/corro.ts"), oa = lee("contratos/api.openapi.yaml");
  const mot = JSON.parse(/MOTIVOS_AVISO = (\[[^\]]+\])/.exec(cer)[1]); assert.deepStrictEqual(C.MOTIVOS.map(m => m[0]), mot);
  assert.strictEqual(C.TEXTO_MAX, Number(/TEXTO_AVISO_MAX = (\d+)/.exec(cer)[1]));
  assert.deepStrictEqual(C.MOTIVOS_SALIDA, JSON.parse(/MOTIVOS_CLIENTE: readonly MotivoSalida\[\] = (\[[^\]]+\])/.exec(cor)[1]));
  for (const u of ["estado", "corros", "ajuste", "invitaciones", "salir", "bloqueos", "avisos"]) assert.ok(oa.includes(C.URL[u].replace(/\?.*$/, "") + ":"), "openapi: " + C.URL[u]);
  assert.strictEqual(C.URL.consentimiento, "/api/presencia/voz/consentimiento?ambito=cercania");
  assert.ok(C.MAX_HOGARES === 5 && C.DIST.invitar === 8 && C.DIST.lejos === 40 && C.LEJOS_S === 60 && C.AEREA_S === 60, "las cifras provisionales de las decisiones 205 y 206");
});

const estadoApi = (o = {}) => Object.assign({ disponible: true, ajuste: { activa: true, cambiada_en: null }, consentimiento: { version: 1, aceptada: true, version_aceptada: 1, aceptada_en: null }, suspension: null, puedo: true, corro: null, invitaciones: { recibidas: [], enviadas: [] } }, o);
test("CorroPuro: el estado de la api se valida (lo que no encaja se descarta) y el tema «corro» solo vale de la api", () => {
  let e = C.leeEstado(estadoApi({ corro: { id: "ABCdef123_-x", sala: SALA, miembros: [{ prefijo: YO, alias: "Yo", yo: true }, { prefijo: ANA, alias: "Ana" }, { prefijo: "malo", alias: "X" }] },
    invitaciones: { recibidas: [{ id: "IIIIIIIIIIII", de: { prefijo: LUIS, alias: "Luis" }, caduca_en: "2030-01-01T00:00:00Z" }, { id: "corto", de: { prefijo: LUIS } }], enviadas: [] } }));
  assert.strictEqual(e.puedo, true); assert.strictEqual(e.corro.sala, SALA); assert.deepStrictEqual(e.corro.miembros.map(m => m.alias), ["Yo", "Ana"]);
  assert.strictEqual(e.recibidas.length, 1); assert.strictEqual(e.recibidas[0].quien.alias, "Luis");
  e = C.leeEstado(estadoApi({ disponible: false })); assert.strictEqual(e.puedo, false, "sin el interruptor, no se puede aunque la api dijera puedo");
  e = C.leeEstado(estadoApi({ corro: { sala: "hituelo-libre", miembros: [] } })); assert.strictEqual(e.corro, null);
  assert.deepStrictEqual(C.leeEstado(null), C.vacio()); assert.strictEqual(C.leeEstado(estadoApi({ consentimiento: { version: 2, aceptada: true } })).consentimiento, "no", "otra versión del aviso no vale");
  assert.ok(C.temaVale(JSON.stringify({ v: 1, que: "corro" }), null)); assert.ok(C.temaVale(JSON.stringify({ v: 1, que: "invitacion" }), null));
  assert.ok(!C.temaVale(JSON.stringify({ v: 1, que: "corro" }), { identidad: ANA_ID }), "con participante: no es de la api, se descarta");
  for (const t of ["", "{", JSON.stringify({ v: 2, que: "corro" }), JSON.stringify({ v: 1, que: "otra" })]) assert.ok(!C.temaVale(t, null), t);
  assert.strictEqual(C.prefijoDe(ANA_ID), ANA); assert.strictEqual(C.prefijoDe(ANA), ""); assert.strictEqual(C.prefijoDe(null), "");
  assert.deepStrictEqual(C.leePublicos({ corros: [{ id: "ABCdef123_-x", prefijos: [ANA, LUIS, "x"] }, { id: "no" }] }), [{ id: "ABCdef123_-x", prefijos: [ANA, LUIS] }]);
});

test("CorroPuro: invitar solo con la voz disponible, a otro hogar, que no está ya, con sitio, sin invitación pendiente y a menos de 8 m", () => {
  const e = C.leeEstado(estadoApi());
  assert.strictEqual(C.puedeInvitar(e, ANA_ID, 7.9, YO), ""); assert.strictEqual(C.puedeInvitar(e, ANA_ID, 8, YO), "");
  assert.strictEqual(C.puedeInvitar(e, ANA_ID, 8.01, YO), "lejos"); assert.strictEqual(C.puedeInvitar(e, ANA_ID, null, YO), "lejos", "sin pose (vista aérea, otra sala), no");
  assert.strictEqual(C.puedeInvitar(C.leeEstado(estadoApi({ puedo: false })), ANA_ID, 2, YO), "no_puedes");
  assert.strictEqual(C.puedeInvitar(e, YO + "_otrasesi", 2, YO), "mismo_hogar"); assert.strictEqual(C.puedeInvitar(e, "nadie", 2, YO), "no_disponible");
  const lleno = C.leeEstado(estadoApi({ corro: { sala: SALA, miembros: [YO, ANA, LUIS, "h_" + "d".repeat(22), "h_" + "e".repeat(22)].map((p, i) => ({ prefijo: p, alias: "M" + i, yo: i === 0 })) } }));
  assert.strictEqual(C.puedeInvitar(lleno, ANA_ID, 2, YO), "ya_en_tu_corro"); assert.strictEqual(C.puedeInvitar(lleno, "h_" + "f".repeat(22) + "_ffffffff", 2, YO), "corro_lleno");
  const pend = C.leeEstado(estadoApi({ invitaciones: { recibidas: [], enviadas: [{ id: "IIIIIIIIIIII", a: { prefijo: ANA, alias: "Ana" }, caduca_en: "2030-01-01T00:00:00Z" }] } }));
  assert.strictEqual(C.puedeInvitar(pend, ANA_ID, 2, YO), "pendiente");
  for (const m of ["no_puedes", "lejos", "ya_en_tu_corro", "corro_lleno", "pendiente", "mismo_hogar", "no_disponible"]) assert.ok(C.textoNoInvita(m, "Ana").length > 5, m);
  assert.match(C.textoNoInvita("lejos", "Ana"), /menos de 8 m de Ana/);
});

test("propiedad: «lejos de todos» con histéresis (pasa a lejos a más de 40 m de todos, vuelve a cerca a 35 m o menos) y sale tras 60 s seguidos lejos", () => {
  assert.deepStrictEqual(C.lejania({ distancias: [41], lejos: false, t: 0, dt: 1 }), { lejos: true, t: 1, sale: false });
  assert.deepStrictEqual(C.lejania({ distancias: [38], lejos: true, t: 10, dt: 1 }), { lejos: true, t: 11, sale: false }, "entre 35 y 40 m sigue como estaba");
  assert.deepStrictEqual(C.lejania({ distancias: [38], lejos: false, t: 0, dt: 1 }), { lejos: false, t: 0, sale: false });
  assert.deepStrictEqual(C.lejania({ distancias: [50, 30], lejos: true, t: 59, dt: 1 }), { lejos: false, t: 0, sale: false }, "con uno cerca basta");
  assert.strictEqual(C.lejania({ distancias: [], lejos: false, t: 59.5, dt: 0.5 }).sale, true, "sin nadie a la vista, cuenta como lejos");
  fc.assert(fc.property(fc.array(fc.record({ d: fc.double({ min: 0, max: 100, noNaN: true }), dt: fc.double({ min: 0, max: 1, noNaN: true }) }), { maxLength: 300 }), pasos => {
    let s = { lejos: false, t: 0 }, seguido = 0;
    for (const p of pasos) {
      const r = C.lejania({ distancias: [p.d], lejos: s.lejos, t: s.t, dt: p.dt });
      if (p.d <= 35 && r.lejos) return false;   // cerca de verdad: nunca lejos
      if (p.d > 40 && !r.lejos) return false;   // lejos de verdad: siempre lejos
      seguido = r.lejos ? seguido + p.dt : 0;
      if (r.sale !== (seguido >= 60)) return false;
      s = r;
    }
    return true;
  }));
  assert.deepStrictEqual(C.aerea({ aerea: true, t: 59, dt: 1 }), { t: 60, sale: true }); assert.deepStrictEqual(C.aerea({ aerea: false, t: 59, dt: 1 }), { t: 0, sale: false });
});

test("CorroPuro: quién habla, las altas y bajas, lo que se enseña de tu corro y el sitio del icono", () => {
  assert.strictEqual(C.textoHablan([]), ""); assert.strictEqual(C.textoHablan(["Ana"]), "Habla Ana."); assert.strictEqual(C.textoHablan(["Ana", "Luis"]), "Hablan Ana y Luis.");
  assert.strictEqual(C.textoHablan(["Ana", "Luis", "Eva"]), "Hablan Ana, Luis y Eva.");
  const sin = C.leeEstado(estadoApi()), con = C.leeEstado(estadoApi({ corro: { sala: SALA, miembros: [{ prefijo: YO, alias: "Yo", yo: true }, { prefijo: ANA, alias: "Ana" }] } }));
  const mas = C.leeEstado(estadoApi({ corro: { sala: SALA, miembros: [{ prefijo: YO, alias: "Yo", yo: true }, { prefijo: ANA, alias: "Ana" }, { prefijo: LUIS, alias: "Luis" }] } }));
  assert.deepStrictEqual(C.cambios(sin, con), ["Estás en un corro con Ana. Solo os oís entre vosotros."]);
  assert.deepStrictEqual(C.cambios(con, mas), ["Luis ha entrado en el corro."]); assert.deepStrictEqual(C.cambios(mas, con), ["Luis ha salido del corro."]);
  assert.deepStrictEqual(C.cambios(con, sin), ["El corro se ha deshecho."]); assert.deepStrictEqual(C.cambios(sin, sin), []);
  const w = C.vista(mas, { [ANA]: true }, { [LUIS]: true });
  assert.strictEqual(w.visible, true); assert.strictEqual(w.titulo, "Corro con voz (3)"); assert.deepStrictEqual(w.filas.map(f => [f.alias, f.habla, f.callado]), [["Tú", false, false], ["Ana", true, false], ["Luis", false, true]]);
  assert.strictEqual(w.hablan, "Habla Ana.");
  assert.strictEqual(C.vista(sin, {}, {}).visible, false); assert.strictEqual(C.vista(C.leeEstado(estadoApi({ disponible: false, corro: con.corro })), {}, {}).visible, false, "con el interruptor apagado, nada");
  assert.deepStrictEqual(C.centro([{ x: 0, y: 11, z: 0 }, { x: 2, y: 12, z: 4 }]), { x: 1, y: 12 + 0.9, z: 2, n: 2 }); assert.strictEqual(C.centro([]), null);
  assert.strictEqual(C.ICONO_TEXTO, "Hablan entre ellos: no les oyes y ellos no te oyen.");
});

// ---------- CorroMotor con todo de mentira
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.style = {}; this.attrs = {}; this.oy = {}; this.hidden = false; this.parentNode = null; this._t = ""; this.disabled = false; this.checked = false; this.value = ""; this.width = 0; this.height = 0; }
  get textContent() { return this._t + this.children.map(c => c.textContent !== undefined ? c.textContent : c.texto || "").join(""); }
  set textContent(v) { this._t = String(v); this.children = []; }
  set innerHTML(v) { throw new Error("innerHTML no: todo con textContent"); }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { if (c.parentNode && c.parentNode.children) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(n, f) { (this.oy[n] = this.oy[n] || []).push(f); } removeEventListener() {}
  focus() { enfocado = this; }
  dispara(n, e = {}) { const ev = Object.assign({ preventDefault() {}, stopPropagation() {}, target: this }, e); (this.oy[n] || []).slice().forEach(f => f(ev)); }
  getContext() { return lienzoFalso(); }
  todos(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) if (c.todos) c.todos(pred, out); return out; }
}
let enfocado = null;
const por = (raiz, id) => raiz.todos(e => (e.attrs.id || e.id) === id)[0];
const botonCon = (raiz, txt) => raiz.todos(e => e.tagName === "BUTTON" && e.textContent === txt)[0];
function lienzoFalso() { const t = []; return { textos: t, fillText: s => t.push(String(s)), measureText: s => ({ width: String(s).length * 12 }), fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, ellipse() {}, fill() {}, stroke() {} }; }
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } project() { this.x = 0; this.y = 0; this.z = 0.5; return this; } }
function threeFalso(cuenta) {
  function Malla(geo, mat, max) { cuenta.mallas++; this.material = mat; this.count = 0; this.max = max; this.visible = true; this.instanceMatrix = { needsUpdate: false }; this.puestas = []; }
  Malla.prototype.setMatrixAt = function (i) { this.puestas[i] = true; }; Malla.prototype.computeBoundingSphere = function () { cuenta.esferas = (cuenta.esferas || 0) + 1; }; Malla.prototype.dispose = function () { cuenta.libres++; };
  return { PlaneGeometry: function () { this.dispose = () => { cuenta.geos++; }; }, CanvasTexture: function () { this.dispose = () => { cuenta.texs++; }; }, SRGBColorSpace: "srgb",
    MeshBasicMaterial: function () { this.dispose = () => { cuenta.mats++; }; }, InstancedMesh: Malla, Matrix4: function () { this.compose = () => this; }, Quaternion: function () {}, Vector3: V3 };
}
function montaCorro({ api = true, srvOpc = {}, vr = false, identidades = { [ANA_ID]: 3 }, sala = "general", aerea = false } = {}) {
  enfocado = null;
  const srv = Object.assign({ estado: 200, disponible: true, activa: false, cons: false, corro: null, recibidas: [], enviadas: [], publicos: [], llamadas: [], fallaPutCons: null }, srvOpc);
  const J = (st, j) => Promise.resolve({ ok: st < 300, status: st, json: () => (j === null ? Promise.reject(new Error("sin cuerpo")) : Promise.resolve(j)) });
  const fetch = (u, o) => {
    const b = o.body ? JSON.parse(o.body) : undefined; srv.llamadas.push([o.method, u, b]);
    assert.ok(u.startsWith("/api/"), "solo su mismo origen y su api: " + u); assert.strictEqual(o.credentials, "same-origin");
    if (b !== undefined) assert.strictEqual(o.headers["content-type"], "application/json");
    if (u === "/api/presencia/corros/estado") return srv.estado !== 200 ? J(srv.estado, { error: "presencia_apagada" }) :
      J(200, { disponible: srv.disponible, ajuste: { activa: srv.activa }, consentimiento: { version: 1, aceptada: srv.cons }, suspension: null, puedo: srv.disponible && srv.activa && srv.cons, corro: srv.corro, invitaciones: { recibidas: srv.recibidas, enviadas: srv.enviadas } });
    if (u === "/api/presencia/corros") return J(200, { corros: srv.publicos });
    if (u === "/api/presencia/voz/consentimiento?ambito=cercania") {
      if (o.method === "PUT") { if (srv.fallaPutCons) return J(srv.fallaPutCons.status, srv.fallaPutCons.cuerpo); if (!b || b.adulto !== true) return J(409, { error: "falta_declaracion" }); srv.cons = true; return J(200, { version: 1, aceptada: true }); }
      if (o.method === "DELETE") { srv.cons = false; srv.activa = false; srv.corro = null; return J(204, null); }
    }
    if (u === "/api/presencia/corros/ajuste" && o.method === "PUT") { if (b.activa && !srv.cons) return J(409, { error: "sin_consentimiento" }); srv.activa = b.activa; if (!b.activa) srv.corro = null; return J(200, { activa: srv.activa }); }
    if (u === "/api/presencia/corros/invitaciones" && o.method === "POST") return J(201, { id: "IIIIIIIIIIII", caduca_en: "2030-01-01T00:00:00Z" });
    let m = /^\/api\/presencia\/corros\/invitaciones\/([A-Za-z0-9_-]{12})\/(aceptar|rechazar)$/.exec(u);
    if (m) { assert.deepStrictEqual(b, {}, "aceptar y rechazar llevan cuerpo {}"); srv.recibidas = []; if (m[2] === "rechazar") return J(204, null); srv.corro = { id: "ABCdef123_-x", sala: SALA, miembros: [{ prefijo: YO, alias: "Yo", yo: true }, { prefijo: ANA, alias: "Ana" }] }; return J(200, { corro: "ABCdef123_-x", sala: SALA }); }
    if (/^\/api\/presencia\/corros\/invitaciones\//.test(u) && o.method === "DELETE") { srv.enviadas = []; return J(204, null); }
    if (u === "/api/presencia/corros/salir") { srv.corro = null; return J(204, null); }
    if (u === "/api/presencia/corros/bloqueos") return J(201, { prefijo: C.prefijoDe(b.identidad) });
    if (u === "/api/presencia/corros/avisos") { srv.corro = null; return J(201, { id: 7 }); }
    return J(404, { error: "no" });
  };
  const emitidos = [], filas = [], laminas = {}, avisosHud = [], cuenta = { mallas: 0, libres: 0, geos: 0, texs: 0, mats: 0, escena: 0 }, tipos = {};
  const n = { emite: (e, d) => { emitidos.push([e, d]); return 0; }, on: (e, f) => { (n.oy[e] = n.oy[e] || []).push(f); return f; }, oy: {}, limpia: f => f };
  // Ajustes: como el de verdad en lo que importa (registra llama a aplica con lo guardado; pon avisa si cambia)
  const aj = { val: {}, pest: null, fn: null, quitada: 0, pintas: 0 };
  const Ajustes = { registra: (p, esq, pest, fn) => { aj.pest = pest; aj.fn = fn; const k = p + ".cercania"; if (!(k in aj.val)) aj.val[k] = esq.cercania.def; fn(k, aj.val[k]); return () => { aj.quitada++; aj.pest = null; }; },
    lee: k => aj.val[k], pon: (k, v) => { if (aj.val[k] === v) return true; aj.val[k] = v; if (aj.fn) aj.fn(k, v); return true; }, pinta: () => { aj.pintas++; } };
  const marca = v => Ajustes.pon("voz.cercania", v);   // lo que hace la casilla de Configuración al marcarla o desmarcarla
  const VRX = { on: vr };
  const pres = { sala, aerea, ids: identidades, acc: [], repintadas: 0, cabezas: {} };
  const P = { estado: () => ({ activo: true, variante: "red", conectado: true, sala: pres.sala, identidad: YO_ID, enVistaAerea: pres.aerea }),
    puntos: () => Object.keys(pres.ids).map(id => ({ id })), distancia: id => (id in pres.ids ? pres.ids[id] : null), cabeza: id => (id in pres.ids ? pres.cabezas[id] || { x: 1, y: 11.6, z: -1 } : null),
    accionesPersona: fn => { pres.acc.push(fn); return () => { pres.acc.splice(pres.acc.indexOf(fn), 1); }; }, repintaGente: () => { pres.repintadas++; } };
  const voz = { sala: "", corro: false, guiada: false, entrando: false, entradas: 0, salidas: 0, callados: [] };
  const Vz = { estado: () => ({ sala: voz.sala, corro: voz.corro, guiada: voz.guiada, entrando: voz.entrando }),
    entraCorro: () => { voz.entradas++; if (!srv.corro) return Promise.resolve(false); voz.sala = srv.corro.sala; voz.corro = true; return Promise.resolve(true); },
    sale: () => { voz.salidas++; voz.sala = ""; voz.corro = false; return Promise.resolve(); }, silencia: (id, si) => { voz.callados.push([id, si]); return si; } };
  const tema = {}; const R = { sala: c => (c === "visita" ? { escucha: (t, fn) => { tema[t] = fn; return () => { delete tema[t]; }; } } : null) };
  const visor = new El("div");
  const g = { window: {}, document: { createElement: t => new El(t), createTextNode: t => ({ texto: t }), body: new El("body"), get activeElement() { return enfocado; } }, location: { search: "" }, fetch,
    ConfigPuro: { prefijoApi: () => (api ? "/api/" : null) }, D: {}, Aparato: aparatoDe({ userAgent: "Node" }), VRX, Hud: { aviso: t => avisosHud.push(t) }, Ajustes, LaminasPuro, visor,
    PanelVR: { filas: (p, d) => { filas.push([p, d]); return () => { filas.splice(filas.findIndex(f => f[1] === d), 1); }; }, repinta() {} },
    Laminas: { abre: o => { laminas[o.id] = o; return true; }, cierra: (id, mot) => { const o = laminas[id]; delete laminas[id]; if (o && o.alCierra) o.alCierra(mot); return true; }, hay: id => !!laminas[id], repinta: () => true },
    Entidades: { registra: d => { tipos[d.tipo] = d; return () => { delete tipos[d.tipo]; }; } },
    THREE: threeFalso(cuenta), scene: { add: () => { cuenta.escena++; }, remove: () => { cuenta.escena--; } }, camera: { getWorldQuaternion: q => q }, TextDecoder: class { decode(b) { return Buffer.from(b).toString("utf8"); } } };
  const nombres = Object.keys(g);
  const CorroMotor = new Function(...nombres, "\"use strict\";\n" + PURO + MOTOR + "\nreturn CorroMotor;")(...nombres.map(k => g[k]));
  const m = CorroMotor(n, R, P, Vz);
  const tic = async (dt = 0.25, k = 1) => { for (let i = 0; i < k; i++) { m.tarde(dt); await espera(); } await espera(); };
  return { m, srv, aj, marca, pres, voz, tema, visor, laminas, filas, tipos, emitidos, avisosHud, cuenta, VRX, n, tic, g, gancho: (a, x) => g.window.__corro(a, x),
    acciones: (id, d, modo = "pantalla") => pres.acc.flatMap(fn => fn(id, { alias: "Ana", distancia: d, modo })) };
}

test("CorroMotor: sin servidor no pide nada ni crea nada; con 503 (sin LiveKit) o con el interruptor apagado, nada se ve: ni pestaña, ni DOM, ni mallas", async () => {
  let c = montaCorro({ api: false }); await c.tic(1, 3);
  assert.deepStrictEqual(c.srv.llamadas, []); assert.strictEqual(c.visor.children.length, 0); assert.strictEqual(c.aj.pest, null); assert.deepStrictEqual(c.tipos, {});
  assert.deepStrictEqual(c.pres.acc, [], "ni acciones en la ficha de una persona"); assert.strictEqual(c.tema.corro, undefined);
  c = montaCorro({ srvOpc: { estado: 503 } }); await c.tic(1, 40);
  assert.deepStrictEqual(c.srv.llamadas.map(l => l[1]), ["/api/presencia/corros/estado"], "con 503, una pregunta y no más"); assert.strictEqual(c.aj.pest, null); assert.strictEqual(c.visor.children.length, 0);
  c = montaCorro({ srvOpc: { disponible: false } }); await c.tic(1, 3);
  assert.strictEqual(c.aj.pest, null, "con el interruptor apagado, ni la pestaña"); assert.strictEqual(c.visor.children.length, 0); assert.deepStrictEqual(c.acciones(ANA_ID, 2), []);
  assert.strictEqual(c.m.estado().disponible, false); assert.strictEqual(c.gancho("mundo").montado, false, "ni mallas");
  c.srv.disponible = true; await c.tic(30, 1); assert.ok(c.aj.pest, "si la oficina lo enciende, al siguiente sondeo sale la pestaña");
});

test("Configuración → Voz: la casilla, apagada por defecto, enseña el aviso ANTES (foco en «Ahora no», «Activar» solo con la declaración) y solo activa si se acepta", async () => {
  const c = montaCorro(); await c.tic();
  assert.strictEqual(c.aj.pest.id, "voz"); assert.strictEqual(c.aj.pest.t, "Voz"); assert.strictEqual(c.aj.val["voz.cercania"], false, "apagada por defecto");
  assert.match(c.aj.pest.campos[0].t, /Voz por cercanía/);
  // «Ahora no»: nada se guarda y la casilla vuelve a su sitio
  c.marca(true); await c.tic();
  let d = por(c.visor, "corroAviso"); assert.ok(d, "el aviso, antes de nada"); assert.strictEqual(c.aj.val["voz.cercania"], false, "la casilla no se marca hasta aceptar");
  assert.strictEqual(d.attrs.role, "dialog"); assert.strictEqual(d.attrs["aria-modal"], "true"); assert.strictEqual(enfocado, por(c.visor, "corroAvisoNo"), "el foco empieza en «Ahora no»");
  const txt = d.textContent; for (const t of C.AVISO.pasa.concat(C.AVISO.noPasa, [C.AVISO.declaracion, C.AVISO.titulo])) assert.ok(txt.includes(t), t);
  assert.strictEqual(por(c.visor, "corroAvisoSi").disabled, true, "«Activar», deshabilitado sin la declaración");
  por(c.visor, "corroAvisoSi").dispara("click"); await c.tic(); assert.ok(!c.srv.llamadas.some(l => l[0] === "PUT"), "deshabilitado: no hace nada");
  por(c.visor, "corroAvisoNo").dispara("click"); await c.tic();
  assert.strictEqual(por(c.visor, "corroAviso"), undefined); assert.ok(!c.srv.llamadas.some(l => l[0] === "PUT"), "«Ahora no» no guarda nada"); assert.strictEqual(c.aj.val["voz.cercania"], false);
  // Esc también es «Ahora no»
  c.marca(true); await c.tic(); por(c.visor, "corroAviso").dispara("keydown", { key: "Escape" }); await c.tic(); assert.strictEqual(por(c.visor, "corroAviso"), undefined); assert.strictEqual(c.srv.activa, false);
  // con la declaración, «Activar»: PUT del consentimiento con { version, adulto } y PUT del ajuste
  c.marca(true); await c.tic();
  const decl = por(c.visor, "corroAvisoDecl"); decl.checked = true; decl.dispara("change"); assert.strictEqual(por(c.visor, "corroAvisoSi").disabled, false);
  por(c.visor, "corroAvisoSi").dispara("click"); await c.tic(); await c.tic();
  const puts = c.srv.llamadas.filter(l => l[0] === "PUT");
  assert.deepStrictEqual(puts, [["PUT", "/api/presencia/voz/consentimiento?ambito=cercania", { version: 1, adulto: true }], ["PUT", "/api/presencia/corros/ajuste", { activa: true }]]);
  assert.strictEqual(por(c.visor, "corroAviso"), undefined); assert.strictEqual(c.aj.val["voz.cercania"], true); assert.strictEqual(c.m.estado().activa, true); assert.strictEqual(c.m.estado().puedo, true);
  assert.ok(c.avisosHud.some(t => /activada/.test(t)), "lo dice (región aria-live del HUD)");
  // desmarcarla apaga (la api saca del corro)
  c.marca(false); await c.tic(); await c.tic();
  assert.deepStrictEqual(c.srv.llamadas.filter(l => l[0] === "PUT").pop(), ["PUT", "/api/presencia/corros/ajuste", { activa: false }]); assert.strictEqual(c.m.estado().activa, false);
  // retirar el permiso: DELETE …?ambito=cercania
  const btn = c.aj.pest.campos[1]; assert.strictEqual(btn.activo(), true); assert.match(btn.texto(), /Retirar/);
  await btn.alClic(); await c.tic(); assert.deepStrictEqual(c.srv.llamadas.filter(l => l[0] === "DELETE").pop(), ["DELETE", "/api/presencia/voz/consentimiento?ambito=cercania", undefined]);
  assert.strictEqual(btn.activo(), false); assert.match(btn.texto(), /no dado/);
});

test("el aviso: si la api no lo guarda, se queda abierto con su error; la versión distinta pide recargar", async () => {
  const c = montaCorro({ srvOpc: { fallaPutCons: { status: 409, cuerpo: { error: "version_distinta" } } } }); await c.tic();
  c.marca(true); await c.tic(); const decl = por(c.visor, "corroAvisoDecl"); decl.checked = true; decl.dispara("change");
  por(c.visor, "corroAvisoSi").dispara("click"); await c.tic(); await c.tic();
  assert.ok(por(c.visor, "corroAviso"), "sigue abierto"); const err = por(c.visor, "corroAvisoError"); assert.strictEqual(err.hidden, false); assert.match(err.textContent, /recarga la página/);
  assert.strictEqual(c.aj.val["voz.cercania"], false); assert.ok(!c.srv.llamadas.some(l => l[1] === "/api/presencia/corros/ajuste"), "sin consentimiento, ni se intenta el ajuste");
});

test("invitar: solo a menos de 8 m y con la voz activada (en la ficha y en Gente); la invitación recibida con «Aceptar» / «Ahora no» (foco en «Ahora no»); aceptar entra en la voz del corro", async () => {
  let c = montaCorro({ srvOpc: { activa: true, cons: true } }); await c.tic();
  assert.deepStrictEqual(c.acciones(ANA_ID, 3).map(a => a.id), ["invitar", "bloquear", "avisar"], "a 3 m: invitar, bloquear y avisar");
  assert.ok(!c.acciones(ANA_ID, 9).some(a => a.id === "invitar"), "a 9 m, no se ofrece"); assert.ok(!c.acciones(ANA_ID, null).some(a => a.id === "invitar"), "sin pose, no");
  assert.strictEqual(c.acciones(ANA_ID, 3, "vr")[0].txt, "Invitar a hablar"); assert.strictEqual(c.acciones(ANA_ID, 3)[0].txt, "Invitar a hablar a Ana");
  c.acciones(ANA_ID, 3)[0].fn(); await c.tic();
  assert.deepStrictEqual(c.srv.llamadas.find(l => l[1] === "/api/presencia/corros/invitaciones"), ["POST", "/api/presencia/corros/invitaciones", { identidad: ANA_ID }]);
  assert.ok(c.avisosHud.some(t => /Solo hablaréis si acepta/.test(t)));
  c.pres.ids[ANA_ID] = 12; c.acciones(ANA_ID, 3)[0].fn(); await c.tic();   // se alejó entre que se pintó el botón y el clic: no se manda
  assert.strictEqual(c.srv.llamadas.filter(l => l[1] === "/api/presencia/corros/invitaciones").length, 1); assert.match(c.avisosHud.pop(), /menos de 8 m/);
  // sin la voz activada, ni invitar ni nada
  c = montaCorro({ srvOpc: { activa: false, cons: true } }); await c.tic(); assert.deepStrictEqual(c.acciones(ANA_ID, 2), []);
  // la invitación recibida
  c = montaCorro({ srvOpc: { activa: true, cons: true, recibidas: [{ id: "IIIIIIIIIIII", de: { prefijo: ANA, alias: "Ana" }, caduca_en: new Date(Date.now() + 60000).toISOString() }] } }); await c.tic();
  const inv = por(c.visor, "corroInvitacion"); assert.ok(inv); assert.strictEqual(inv.attrs.role, "alertdialog"); assert.match(inv.textContent, /Ana te invita a hablar en corro/);
  assert.strictEqual(enfocado, por(c.visor, "corroInvNo"), "el foco en «Ahora no»");
  por(c.visor, "corroInvSi").dispara("click"); await c.tic(); await c.tic();
  assert.ok(c.srv.llamadas.some(l => l[0] === "POST" && l[1] === "/api/presencia/corros/invitaciones/IIIIIIIIIIII/aceptar"));
  assert.strictEqual(por(c.visor, "corroInvitacion"), undefined); assert.strictEqual(c.voz.entradas, 1, "la voz entra en la sala del corro"); assert.strictEqual(c.voz.sala, SALA);
  assert.ok(c.avisosHud.some(t => /Estás en un corro con Ana/.test(t)));
  // «Ahora no»
  c = montaCorro({ srvOpc: { activa: true, cons: true, recibidas: [{ id: "IIIIIIIIIIII", de: { prefijo: ANA, alias: "Ana" }, caduca_en: new Date(Date.now() + 60000).toISOString() }] } }); await c.tic();
  por(c.visor, "corroInvNo").dispara("click"); await c.tic();
  assert.ok(c.srv.llamadas.some(l => l[1] === "/api/presencia/corros/invitaciones/IIIIIIIIIIII/rechazar")); assert.strictEqual(por(c.visor, "corroInvitacion"), undefined); assert.strictEqual(c.voz.entradas, 0);
  // caducada: ni se enseña
  c = montaCorro({ srvOpc: { activa: true, cons: true, recibidas: [{ id: "IIIIIIIIIIII", de: { prefijo: ANA, alias: "Ana" }, caduca_en: new Date(Date.now() - 1000).toISOString() }] } }); await c.tic();
  assert.strictEqual(por(c.visor, "corroInvitacion"), undefined);
});

const enCorro = () => ({ activa: true, cons: true, corro: { id: "ABCdef123_-x", sala: SALA, miembros: [{ prefijo: YO, alias: "Yo", yo: true }, { prefijo: ANA, alias: "Ana" }] } });
test("en el corro: la lista (alias, «Tú»), quién habla (texto aria-live y halo), silenciar en tu aparato, bloquear, avisar a la oficina y salir con su motivo", async () => {
  const c = montaCorro({ srvOpc: enCorro() }); await c.tic(); await c.tic();
  assert.strictEqual(c.voz.sala, SALA, "la voz, en la sala del corro");
  const caja = por(c.visor, "corroCaja"); assert.ok(caja); assert.match(caja.textContent, /Corro con voz \(2\)/); assert.match(caja.textContent, /Tú/); assert.match(caja.textContent, /Ana/);
  const hab = por(c.visor, "corroHablan"); assert.strictEqual(hab.attrs["aria-live"], "polite"); assert.strictEqual(hab.textContent, "");
  (c.n.oy["voz:habla"] || []).forEach(f => f({ identidad: ANA_ID, nivel: 0.4, habla: true, yo: false }));
  assert.strictEqual(por(c.visor, "corroHablan").textContent, "Habla Ana."); assert.match(por(c.visor, "corroCaja").textContent, /Ana · habla/);
  assert.deepStrictEqual(c.gancho("mundo"), { halos: 1, iconos: 0, montado: true }, "un halo sobre quien habla"); assert.ok(c.cuenta.esferas >= 1, "su volumen, tras escribir las matrices");
  (c.n.oy["voz:habla"] || []).forEach(f => f({ identidad: ANA_ID, nivel: 0, habla: false, yo: false }));
  assert.strictEqual(por(c.visor, "corroHablan").textContent, ""); assert.strictEqual(c.gancho("mundo").halos, 0);
  // silenciar (solo aquí): Voz.silencia con su prefijo
  botonCon(caja, "Silenciar").dispara("click"); assert.deepStrictEqual(c.voz.callados.pop(), [ANA, true]); assert.match(por(c.visor, "corroCaja").textContent, /silenciado por ti/);
  botonCon(por(c.visor, "corroCaja"), "Volver a oír").dispara("click"); assert.deepStrictEqual(c.voz.callados.pop(), [ANA, false]);
  assert.ok(c.acciones(ANA_ID, 3).some(a => a.id === "silenciar"), "en su ficha, también"); assert.ok(!c.acciones(ANA_ID, 3).some(a => a.id === "invitar"), "ya está en tu corro: no se invita");
  // bloquear
  botonCon(por(c.visor, "corroCaja"), "Bloquear").dispara("click"); await c.tic();
  assert.deepStrictEqual(c.srv.llamadas.find(l => l[1] === "/api/presencia/corros/bloqueos"), ["POST", "/api/presencia/corros/bloqueos", { identidad: ANA_ID }]); assert.match(c.avisosHud.pop(), /No se le dice/);
  // avisar: motivo de lista, texto ≤ 280, sin audio; quien avisa sale
  botonCon(por(c.visor, "corroCaja"), "Avisar").dispara("click");
  const d = por(c.visor, "corroAvisar"); assert.ok(d); assert.strictEqual(enfocado, por(c.visor, "corroAvisarNo"), "el foco en «Cancelar»"); assert.strictEqual(por(c.visor, "corroAvisarSi").disabled, true, "sin motivo, no se envía");
  const radios = d.todos(e => e.tagName === "INPUT" && (e.type || e.attrs.type) === "radio"); assert.deepStrictEqual(radios.map(r => r.value), C.MOTIVOS.map(m => m[0]));
  radios[1].dispara("change"); const area = por(c.visor, "corroAvisoTexto"); assert.strictEqual(Number(area.maxLength || area.attrs.maxLength), 280);
  area.value = "  Me ha insultado varias veces.  "; area.dispara("input");
  por(c.visor, "corroAvisarSi").dispara("click"); await c.tic(); await c.tic();
  assert.deepStrictEqual(c.srv.llamadas.find(l => l[1] === "/api/presencia/corros/avisos"), ["POST", "/api/presencia/corros/avisos", { identidad: ANA_ID, motivo: "acoso", texto: "Me ha insultado varias veces." }]);
  assert.strictEqual(por(c.visor, "corroAvisar"), undefined); assert.ok(c.avisosHud.some(t => /Aviso enviado a la oficina/.test(t))); assert.strictEqual(c.voz.sala, "", "y la voz sale del corro");
});

test("salir: el botón (motivo «salir»); solo: lejos de todos 60 s (> 40 m), cambio de sala, 60 s en vista aérea; nunca mientras no toca", async () => {
  let c = montaCorro({ srvOpc: enCorro() }); await c.tic(); await c.tic();
  botonCon(por(c.visor, "corroCaja"), "Salir del corro").dispara("click"); await c.tic();
  assert.deepStrictEqual(c.srv.llamadas.find(l => l[1] === "/api/presencia/corros/salir"), ["POST", "/api/presencia/corros/salir", { motivo: "salir" }]); assert.strictEqual(c.voz.sala, "");
  assert.strictEqual(por(c.visor, "corroCaja").hidden, true);
  // lejos: a 45 m durante 59 s, nada; a los 60 s, sale con «lejos»; a 38 m tras estar lejos, sigue contando (histéresis)
  c = montaCorro({ srvOpc: enCorro(), identidades: { [ANA_ID]: 45 } }); await c.tic();
  await c.tic(1, 30); c.pres.ids[ANA_ID] = 38; await c.tic(1, 29); assert.ok(!c.srv.llamadas.some(l => l[1] === "/api/presencia/corros/salir"), "a 59 s, aún no");
  await c.tic(1, 2); assert.deepStrictEqual(c.srv.llamadas.find(l => l[1] === "/api/presencia/corros/salir")[2], { motivo: "lejos" }); assert.match(c.avisosHud.join(" "), /un minuto lejos/);
  c = montaCorro({ srvOpc: enCorro(), identidades: { [ANA_ID]: 45 } }); await c.tic(1, 50); c.pres.ids[ANA_ID] = 30; await c.tic(1, 30);
  assert.ok(!c.srv.llamadas.some(l => l[1] === "/api/presencia/corros/salir"), "volvió cerca: la cuenta se reinicia");
  // cambio de sala
  c = montaCorro({ srvOpc: enCorro() }); await c.tic(); c.pres.sala = "visita"; await c.tic();
  assert.deepStrictEqual(c.srv.llamadas.find(l => l[1] === "/api/presencia/corros/salir")[2], { motivo: "cambio_de_sala" });
  // vista aérea
  c = montaCorro({ srvOpc: enCorro() }); await c.tic(); c.pres.aerea = true; await c.tic(1, 59); assert.ok(!c.srv.llamadas.some(l => l[1] === "/api/presencia/corros/salir"));
  await c.tic(1, 2); assert.deepStrictEqual(c.srv.llamadas.find(l => l[1] === "/api/presencia/corros/salir")[2], { motivo: "vista_aerea" });
});

test("quien está fuera ve el icono del corro (Entidades, tipo «corro») y al tocarlo «Hablan entre ellos: no les oyes y ellos no te oyen»; el de tu corro, no", async () => {
  const c = montaCorro({ srvOpc: { activa: false, publicos: [{ id: "ABCdef123_-x", prefijos: [ANA, LUIS] }] }, identidades: { [ANA_ID]: 20, [LUIS_ID]: 22 } }); await c.tic(); await c.tic();
  assert.deepStrictEqual(c.gancho("mundo"), { halos: 0, iconos: 1, montado: true }, "aunque no la tengas activada: así nadie cree que le oyen sin saberlo");
  const t = c.tipos.corro; assert.ok(t); assert.strictEqual(t.sinAnillo, true);
  const toque = t.pantalla(400, 300, { left: 0, top: 0, width: 800, height: 600 }); assert.strictEqual(toque.id, "corro:ABCdef123_-x");
  const f = t.ficha(toque.id, "pantalla"); assert.strictEqual(f.titulo, "Corro con voz"); assert.deepStrictEqual(f.lineas, ["Hablan entre ellos: no les oyes y ellos no te oyen."]);
  const rayo = t.rayo({ ray: { origin: { x: 1, y: 12.5, z: 5 }, direction: { x: 0, y: 0, z: -1 } } }); assert.strictEqual(rayo && rayo.id, "corro:ABCdef123_-x", "y con el rayo en VR");
  c.srv.publicos = []; await c.tic(10, 1); await c.tic(); assert.strictEqual(c.gancho("mundo").iconos, 0, "se deshizo: sin icono");
  c.m.libera(); assert.strictEqual(c.cuenta.escena, 0, "libera quita las mallas de la escena"); assert.strictEqual(c.cuenta.libres, 2); assert.strictEqual(c.cuenta.texs, 2); assert.strictEqual(c.cuenta.geos, 1);
  assert.deepStrictEqual(c.tipos, {}); assert.deepStrictEqual(c.pres.acc, []); assert.strictEqual(c.filas.length, 0); assert.strictEqual(c.g.window.__corro, undefined);
});

test("el tema «corro» de la sala libre pide el estado al momento; con participante, no; el interruptor apagado deshace lo que se ve", async () => {
  const c = montaCorro({ srvOpc: { activa: true, cons: true } }); await c.tic();
  const antes = c.srv.llamadas.filter(l => l[1] === "/api/presencia/corros/estado").length;
  c.tema.corro(Buffer.from(JSON.stringify({ v: 1, que: "invitacion" })), null); await c.tic();
  assert.strictEqual(c.srv.llamadas.filter(l => l[1] === "/api/presencia/corros/estado").length, antes + 1);
  c.tema.corro(Buffer.from(JSON.stringify({ v: 1, que: "corro" })), { identidad: ANA_ID }); await c.tic();
  assert.strictEqual(c.srv.llamadas.filter(l => l[1] === "/api/presencia/corros/estado").length, antes + 1, "de un participante, se descarta");
  c.srv.disponible = false; c.tema.corro(Buffer.from(JSON.stringify({ v: 1, que: "corro" })), null); await c.tic();
  assert.strictEqual(c.aj.pest, null, "el interruptor apagado quita la pestaña"); assert.strictEqual(c.aj.quitada, 1);
});

test("en VR: la invitación es una lámina con dos zonas (izquierda «Ahora no», derecha «Aceptar»); el aviso, con la declaración que se toca; dos filas del panel en «Comodidad»", async () => {
  let c = montaCorro({ vr: true, srvOpc: { activa: true, cons: true, recibidas: [{ id: "IIIIIIIIIIII", de: { prefijo: ANA, alias: "Ana" }, caduca_en: new Date(Date.now() + 60000).toISOString() }] } }); await c.tic();
  assert.strictEqual(por(c.visor, "corroInvitacion"), undefined, "en VR no hay caja de pantalla");
  let l = c.laminas["corro-lamina"]; assert.ok(l); const cx = lienzoFalso(); l.pinta(cx, l.w, l.h); assert.ok(cx.textos.some(t => /Ana te invita/.test(t)));
  l.alTocar(0.75, 0.9, { x: l.w * 0.75, y: l.h * 0.9 }); await c.tic(); await c.tic();
  assert.ok(c.srv.llamadas.some(x => /aceptar$/.test(x[1])), "la derecha acepta"); assert.strictEqual(c.voz.sala, SALA);
  c = montaCorro({ vr: true, srvOpc: { activa: true, cons: true, recibidas: [{ id: "IIIIIIIIIIII", de: { prefijo: ANA, alias: "Ana" }, caduca_en: new Date(Date.now() + 60000).toISOString() }] } }); await c.tic();
  l = c.laminas["corro-lamina"]; l.pinta(lienzoFalso(), l.w, l.h); l.alTocar(0.25, 0.9, { x: l.w * 0.25, y: l.h * 0.9 }); await c.tic();
  assert.ok(c.srv.llamadas.some(x => /rechazar$/.test(x[1])), "la izquierda, «Ahora no»");
  // el aviso en VR: «Activar» no hace nada sin la declaración; tocarla la marca
  c = montaCorro({ vr: true }); await c.tic();
  const fila = c.filas.find(f => f[1].id === "cercania"); assert.strictEqual(fila[0], "comodidad"); assert.strictEqual(fila[1].visible(), true);
  const bs = []; fila[1].botones((id, x, y, w, h, txt, fn, on) => bs.push({ id, txt, fn, on }), 0); assert.strictEqual(bs[0].txt, "Voz por cercanía: apagada");
  bs[0].fn(); await c.tic(); l = c.laminas["corro-lamina"]; assert.ok(l, "el aviso, como lámina"); let lc = lienzoFalso(); l.pinta(lc, l.w, l.h);
  assert.ok(lc.textos.some(t => t.includes("Soy mayor de edad")));
  l.alTocar(0.75, (l.h - 70) / l.h, { x: l.w * 0.75, y: l.h - 70 }); await c.tic(); assert.ok(!c.srv.llamadas.some(x => x[0] === "PUT"), "sin la declaración, «Activar» no vale");
  // la declaración está justo encima de las notas: se busca su zona pintando
  const zonas = []; const cx2 = lienzoFalso(); cx2.fillRect = (x, y, w, h) => zonas.push({ x, y, w, h }); l.pinta(cx2, l.w, l.h);
  const decl = zonas.find(z => z.h === 80); l.alTocar(0.5, 0, { x: decl.x + 10, y: decl.y + 10 }); l.pinta(lienzoFalso(), l.w, l.h);
  l.alTocar(0.75, (l.h - 70) / l.h, { x: l.w * 0.75, y: l.h - 70 }); await c.tic(); await c.tic();
  assert.deepStrictEqual(c.srv.llamadas.filter(x => x[0] === "PUT").map(x => x[1]), ["/api/presencia/voz/consentimiento?ambito=cercania", "/api/presencia/corros/ajuste"]);
  assert.strictEqual(c.m.estado().activa, true); assert.strictEqual(c.m.estado().lamina !== "aviso", true);
  const corroFila = c.filas.find(f => f[1].id === "corro"); assert.strictEqual(corroFila[0], "comodidad"); assert.strictEqual(corroFila[1].visible(), false, "sin corro, su fila no se ve");
});

test("el manifiesto, los eventos del catálogo y las interfaces: «corro-voz» con su bandera, presupuesto y eventos; sin innerHTML, sin otros hosts, sin grabar", () => {
  const man = trozo(COR, "Componentes.registra({", "\n  });");
  assert.match(man, /id: "corro-voz"/); assert.match(man, /bandera: \{ defecto: true, url: "corro" \}/); assert.match(man, /presupuesto: \{ llamadas: 3, triangulos: 26, texturasMB: 6 \}/);
  assert.deepStrictEqual(EVENTOS.eventos["corro:estado"].emiten, ["47b_corro"]);
  for (const e of ["voz:habla", "voz:estado", "depura:lineas"]) assert.ok(EVENTOS.eventos[e].escuchan.includes("47b_corro"), e);
  assert.ok(EVENTOS.eventos["voz:estado"].datos.properties.papel.enum.includes("miembro")); assert.ok("corro" in EVENTOS.eventos["voz:estado"].datos.properties);
  for (const k of ["accionesPersona", "distancia", "repintaGente"]) assert.ok(IFACES.apis_de_componentes["presencia-compartida"].miembros.includes(k), k);
  for (const k of ["entraCorro", "silencia"]) assert.ok(IFACES.apis_de_componentes["voz-guiada"].miembros.includes(k), k);
  const codigo = MOTOR.replace(/\/\/.*$/gm, "");
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(codigo), "todo con textContent");
  assert.ok(!/MediaRecorder|Egress|getUserMedia/.test(codigo), "ni graba ni abre el micro por su cuenta (eso es 45/47)");
  for (const m of codigo.matchAll(/fetch\(([^,)]+)/g)) assert.ok(/^url$/.test(m[1].trim()), "un único fetch, el de llama(): " + m[1]);
  assert.ok(!/https?:\/\//.test(codigo), "sin otros hosts");
  assert.deepStrictEqual(LaminasPuro.lineas("uno dos tres cuatro", 100, s => s.length * 12), ["uno dos", "tres", "cuatro"], "LaminasPuro.lineas parte por ancho");
});
