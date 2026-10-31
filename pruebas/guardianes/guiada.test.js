"use strict";
// F3f, la visita guiada en el mundo (46_guiada.js; absorbe OF12; ADR-0026, decisiones 155 y 157-162; contratos/livekit-roles.json v7). En Node, SIN navegador y SIN LiveKit:
//   · GuiadaPuro: la sala guiada-<evento>, la gente de la sala leída como datos (papel de los metadatos, mano y palabra_hasta de los atributos que pone la api),
//     quién tiene la palabra y su cuenta atrás, la cola de manos en orden (con propiedades de fast-check), los avisos de 30 y 10 s, el aviso de cierre (solo
//     sin participante), pulsar dos veces y los textos;
//   · GuiadaMotor con una sala, una presencia, una voz y una api de mentira: nada sin sala guiada; la tira de la palabra para todos; el panel solo para el guía y
//     la oficina, con todo por la api; sacar y cerrar piden pulsar dos veces; el cierre cuenta atrás y vuelve a la general; la fila del panel VR; textContent;
//   · los componentes de verdad (37_red, 38_presencia_compartida, 45_voz y 46_guiada) en el registro de 02c con un LiveKit de mentira: la PRESENCIA viaja a la
//     sala guiada (Voz.entra con ?presencia=red) y la voz usa su misma conexión; el cierre y la sala borrada devuelven a la visita libre; ?guia=0.
// Lo de Chrome (cómo se ve, foco, lector de pantalla, cuánto cuesta) está en pruebas/guardianes/guiada_chrome.test.js, por el banco.
const test = require("node:test"), assert = require("node:assert");
const fc = require("fast-check");
const { lee, path } = require("./_util");
const contratoModulos = require(path.join(__dirname, "..", "contrato_modulos.js"));

const sinCabecera = s => s.startsWith(contratoModulos.MARCA_I) ? s.slice(s.indexOf(contratoModulos.MARCA_F) + contratoModulos.MARCA_F.length + 1) : s;
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return s.slice(i, f); };
const GUI = lee("apps/web/motor/46_guiada.js"), RED = lee("apps/web/motor/37_red.js"), PRES = lee("apps/web/motor/38_presencia_compartida.js"), LIB = lee("apps/web/motor/26_presencia.js");
const VOZ = lee("apps/web/motor/45_voz.js"), NUCLEO = lee("apps/web/motor/02c_componentes.js");
const PURO = trozo(GUI, "// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo(GUI, "// [motor:inicio]", "// [motor:fin]");
const G = new Function("\"use strict\";\n" + PURO + "\nreturn GuiadaPuro;")();
const { SalaPose } = new Function("\"use strict\";\n" + trozo(LIB, "// [puro:inicio]", "// [puro:fin]") + "\nreturn { SalaPose };")();
const ROLES = JSON.parse(lee("contratos/livekit-roles.json")), EVENTOS = JSON.parse(lee("contratos/eventos.json")), IFACES = JSON.parse(lee("contratos/interfaces.json"));
const enc = new TextEncoder(), json = o => enc.encode(JSON.stringify(o));
const espera = (ms = 0) => new Promise(r => setTimeout(r, ms));
const iso = ms => new Date(ms).toISOString();
const meta = (alias, papel) => JSON.stringify({ alias, rol: papel === "oficina" ? "oficina" : papel === "guia" ? "guia" : "hogar", papel, avatar: { camisa: 1, sombrero: "paja", piel: 1 }, dispositivo: "escritorio" });

// ---------- GuiadaPuro
test("GuiadaPuro: la sala guiada-<evento> del contrato, el papel de los metadatos, quién modera y la cuenta atrás", () => {
  assert.strictEqual(G.evento("guiada-12"), 12); assert.ok(new RegExp(ROLES.salas.guiada.patron).test("guiada-12"));
  for (const x of ["hituelo-libre", "hituelo-visita", "guiada-0", "guiada-01", "guiada-", "guiada-12345678901", "xguiada-1", null, 12]) assert.strictEqual(G.evento(x), null, String(x));
  assert.strictEqual(G.papelDe(meta("Rafa", "guia")), "guia"); assert.strictEqual(G.papelDe(JSON.stringify({ papel: "admin" })), ""); assert.strictEqual(G.papelDe("{"), "");
  assert.deepStrictEqual(["guia", "oficina", "familia", ""].map(G.modera), [true, true, false, false]);
  assert.deepStrictEqual([120, 119.2, 61, 60, 9, 0.1, 0, -5, NaN].map(G.mmss), ["2:00", "2:00", "1:01", "1:00", "0:09", "0:01", "0:00", "0:00", "0:00"]);
  assert.strictEqual(ROLES.palabra.duracion_s, 120, "la cuenta atrás de 2 min de la decisión 161");
});

test("GuiadaPuro: la gente como datos; quién tiene la palabra (solo familias y solo si no ha vencido) y la cola de manos en orden de llegada", () => {
  const T = Date.parse("2026-11-14T10:00:00Z"), atr = {
    g: {}, a: { mano: iso(T - 30_000) }, b: { mano: iso(T - 60_000) }, c: { palabra_hasta: iso(T + 95_500), mano: "" }, d: { palabra_hasta: iso(T - 1) }, e: { mano: "ayer" }, o: { palabra_hasta: iso(T + 999_000) }
  };
  const ps = [{ identidad: "g", metadatos: meta("Rafa", "guia") }, { identidad: "a", metadatos: meta("Ana", "familia") }, { identidad: "b", metadatos: meta("Beto", "familia") },
    { identidad: "c", metadatos: meta("Cora", "familia") }, { identidad: "d", metadatos: meta("Dani", "familia") }, { identidad: "e", metadatos: meta("Eva", "familia") },
    { identidad: "o", metadatos: meta("Pepa", "oficina") }, { identidad: "a", metadatos: meta("Repetida", "familia") }, null, { identidad: "" }];
  const g = G.gente(ps, id => atr[id], m => SalaPose.leeInfo(m).alias);
  assert.deepStrictEqual(g.map(x => x.identidad), ["g", "a", "b", "c", "d", "e", "o"], "uno por identidad");
  assert.strictEqual(g.find(x => x.identidad === "o").alias, "Oficina", "la oficina, sin nombre propio (SalaPose.leeInfo, decisión 107)");
  assert.strictEqual(g.find(x => x.identidad === "e").mano, null, "un instante que no se entiende no cuenta");
  assert.deepStrictEqual(G.palabra(g, T), { identidad: "c", alias: "Cora", segundos: 96 }, "la oficina no «tiene la palabra»: habla siempre");
  assert.strictEqual(G.palabra(g, T + 95_500), null, "vencida, nadie");
  assert.deepStrictEqual(G.cola(g, T).map(x => x.identidad), ["b", "a"], "en orden de llegada; sin quien ya habla");
  assert.deepStrictEqual(G.familias(g).map(x => x.alias), ["Ana", "Beto", "Cora", "Dani", "Eva"]);
  assert.strictEqual(G.textoPalabra(G.palabra(g, T), "c"), "Tienes la palabra · 1:36"); assert.strictEqual(G.textoPalabra(G.palabra(g, T), "a"), "Tiene la palabra Cora · 1:36");
  assert.strictEqual(G.textoPalabra(null, "a"), "");
});

test("propiedad: la cola de manos va en orden de llegada, nunca lleva a quien tiene la palabra ni a quien no es familia, y como mucho una familia «tiene la palabra»", () => {
  const T = 1_800_000_000_000;
  const persona = fc.record({ papel: fc.constantFrom("guia", "oficina", "familia", ""), mano: fc.option(fc.integer({ min: -600_000, max: 0 }), { nil: null }), hasta: fc.option(fc.integer({ min: -60_000, max: 420_000 }), { nil: null }) });
  fc.assert(fc.property(fc.array(persona, { maxLength: 30 }), l => {
    const g = l.map((p, i) => ({ identidad: "h" + i, alias: "A" + i, papel: p.papel, mano: p.mano === null ? null : T + p.mano, hasta: p.hasta === null ? null : T + p.hasta }));
    const c = G.cola(g, T), p = G.palabra(g, T);
    for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].mano <= c[i].mano);
    assert.ok(c.every(x => x.papel === "familia" && x.mano !== null));
    if (p) { assert.ok(!c.some(x => x.identidad === p.identidad)); assert.ok(p.segundos > 0); assert.strictEqual(g.find(x => x.identidad === p.identidad).papel, "familia"); }
    assert.strictEqual(c.length, g.filter(x => x.papel === "familia" && x.mano !== null && !(x.hasta !== null && x.hasta > T)).length);
  }), { numRuns: 300 });
});

test("GuiadaPuro: los avisos de 30 y 10 s se dan una vez al cruzarlos; pulsar dos veces; los textos de preparar y del cierre", () => {
  assert.deepStrictEqual(G.AVISOS, [30, 10]);
  assert.strictEqual(G.umbral(31, 30), 30); assert.strictEqual(G.umbral(30, 29), null); assert.strictEqual(G.umbral(45, 9), 10, "un salto grande: el más cercano al ahora");
  assert.strictEqual(G.umbral(11, 10), 10); assert.strictEqual(G.umbral(null, 30), null); assert.strictEqual(G.umbral(1, 0), null, "a cero, no: se acabó");
  let st = null, r = G.confirma(st, "cierra", 1000); assert.strictEqual(r.hecho, false); st = r.st;
  assert.strictEqual(G.confirma(st, "saca:x", 1500).hecho, false, "otra acción no confirma");
  assert.strictEqual(G.confirma(st, "cierra", 1000 + G.CONFIRMA_MS).hecho, true); assert.strictEqual(G.confirma(st, "cierra", 1001 + G.CONFIRMA_MS).hecho, false, "pasado el plazo, vuelve a pedirlo");
  assert.deepStrictEqual([G.segundosCierre("30"), G.segundosCierre(7), G.segundosCierre("x")], [30, 15, 15]);
  assert.ok(G.SEGUNDOS_CIERRE.every(s => s >= 5 && s <= 60), "dentro de lo que admite la api (5-60 s)");
  assert.strictEqual(G.textoInscritos({ apuntados: 8, conectados: 3 }), "3 de 8 familias apuntadas están en la sala.");
  assert.strictEqual(G.textoInscritos({ apuntados: 1, conectados: 0 }), "0 de 1 familia apuntada está en la sala.");
  assert.strictEqual(G.textoInscritos({ apuntados: 0, conectados: 0 }), "No hay familias apuntadas."); assert.strictEqual(G.textoInscritos(null), "");
  assert.strictEqual(G.textoCierre(14.2), "La visita guiada termina en 15 s. Volvéis a la visita libre.");
  assert.strictEqual(G.textoError({ mensaje: "Otra familia tiene la palabra." }, 409), "Otra familia tiene la palabra."); assert.strictEqual(G.textoError(null, 503), "La api respondió 503.");
});

test("el aviso de cierre (tema «cierre» del contrato v7) solo vale SIN participante, en JSON v1 con «en» y la vuelta a la general", () => {
  assert.strictEqual(ROLES.version, 7); const T = ROLES.temas_de_datos.cierre;
  assert.strictEqual(T.lo_manda, "api"); assert.strictEqual(T.fiable, true); assert.strictEqual(T.lo_escucha, "46_guiada");
  const en = Date.parse("2026-11-14T11:00:15Z");
  assert.deepStrictEqual(G.leeCierre(json({ v: 1, en: iso(en), a: "general" }), null), { en, a: "general" });
  assert.strictEqual(G.leeCierre(json({ v: 1, en: iso(en), a: "general" }), { identidad: "h_x", metadatos: meta("Oficina", "oficina") }), null, "con participante, ni siendo la oficina");
  for (const m of [{ v: 2, en: iso(en), a: "general" }, { v: 1, en: "pronto", a: "general" }, { v: 1, en: iso(en), a: "visita" }, { v: 1, en: iso(en) }, [1], "x", null])
    assert.strictEqual(G.leeCierre(json(m), null), null, JSON.stringify(m));
  assert.strictEqual(G.leeCierre(new Uint8Array([0xff, 0xfe]), null), null, "UTF-8 roto");
  assert.strictEqual(G.leeCierre(json({ v: 1, en: iso(en), a: "general", relleno: "x".repeat(300) }), null), null, "demasiado grande");
  assert.strictEqual(G.leeCierre(new Uint8Array(0), null), null);
});

// ---------- GuiadaMotor con una sala, una presencia, una voz y una api de mentira
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.style = {}; this.attrs = {}; this.oy = {}; this.hidden = false; this.parentNode = null; this._t = ""; this.value = ""; this.disabled = false; }
  get textContent() { return this._t + this.children.map(c => c.textContent !== undefined ? c.textContent : c.texto || "").join(""); }
  set textContent(v) { this._t = String(v); this.children = []; }
  set innerHTML(v) { throw new Error("innerHTML no: todo con textContent"); }
  appendChild(c) { if (c.parentNode && c.parentNode.children) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(n, f) { (this.oy[n] = this.oy[n] || []).push(f); } removeEventListener() {}
  remove() { if (this.parentNode) this.parentNode.removeChild(this); } focus() {} getContext() { return cualquiera(); }
  dispara(n) { (this.oy[n] || []).slice().forEach(f => f({ preventDefault() {}, stopPropagation() {} })); }
  todos(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) if (c.todos) c.todos(pred, out); return out; }
}
const botones = (raiz, txt) => raiz.todos(e => e.tagName === "BUTTON" && (txt === undefined || e.textContent === txt));
function salaFalsa(nombre = "guiada-12", papel = "guia") {
  const oy = {}, temas = {}, s = {
    _estado: "dentro", _nombre: nombre, _gente: [], _atr: {}, _yo: { identidad: "h_yo", metadatos: meta("Rafa", papel) },
    al(e, fn) { (oy[e] = oy[e] || []).push(fn); return () => { const l = oy[e], i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; },
    escucha(t, fn) { (temas[t] = temas[t] || []).push(fn); return () => { const l = temas[t], i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; },
    emite(e, d) { (oy[e] || []).slice().forEach(fn => fn(d)); }, datos(t, b, de) { (temas[t] || []).slice().forEach(fn => fn(b, de)); }, oyentes(t) { return (temas[t] || []).length; },
    estado() { return s._estado; }, nombre() { return s._estado === "dentro" ? s._nombre : ""; }, yo() { return s._estado === "dentro" ? s._yo : null; },
    participantes() { return s._gente; }, atributos(id) { return id === undefined ? s._atr.h_yo || {} : s._atr[id] || {}; }
  };
  return s;
}
function montaGuiada({ papel = "guia", nombre = "guiada-12", respuestas = {}, conPresencia = true } = {}) {
  const sala = salaFalsa(nombre, papel), emitidos = [], limpias = [], llamadas = { fetch: [], cambia: [], sale: 0, ventanas: [], iconos: [], laminas: [], filas: [] };
  const R = { salas: () => ["visita"], sala: k => (k === "visita" ? sala : null) };
  const P = conPresencia ? { sala: () => "guiada", cambiaSala: c => { llamadas.cambia.push(c); return Promise.resolve(true); } } : null;
  const Vz = { sale: () => { llamadas.sale++; return Promise.resolve(); } };
  const visor = new El("div"), cuerpoV = new El("section");
  const Ventanas = { registra: (id, d) => { llamadas.ventanas.push([id, d.titulo]); d.construye(cuerpoV); return () => { llamadas.ventanas.push(["fuera", id]); }; } };
  const Hud = { icono: d => { llamadas.iconos.push(d); return () => { llamadas.iconos.push("fuera"); }; } };
  const abiertas = {};
  const Laminas = { abre: o => { abiertas[o.id] = o; llamadas.laminas.push(o.id); return true; }, cierra: id => { delete abiertas[id]; return true; }, hay: id => !!abiertas[id], repinta: () => true };
  const filas = [];
  const PanelVR = { filas: (p, d) => { filas.push([p, d]); return () => { filas.splice(filas.findIndex(f => f[1] === d), 1); }; } };
  const VRX = { on: false };
  const n = { emite: (e, d) => { emitidos.push([e, d]); return 0; }, on: (e, f) => { (n.oy[e] = n.oy[e] || []).push(f); return f; }, oy: {}, limpia: f => { limpias.push(f); return f; } };
  const ventana = {};
  const g = { window: ventana, document: { createElement: t => new El(t), createTextNode: t => ({ texto: t }), body: new El("body") }, visor, SalaPose, Ventanas, Hud, Laminas, PanelVR, VRX,
    fetch: (u, o) => {
      const cuerpo = o.body ? JSON.parse(o.body) : null; llamadas.fetch.push([o.method, u, cuerpo]);
      const k = o.method + " " + u.replace(/^\/api\/presencia\/guiadas\/\d+\//, ""), r = respuestas[k] || (o.method === "GET" ? { inscritos: { apuntados: 5, conectados: 2 }, turno: null, manos: [], cierra_en: null } : {});
      const st = r.__status || (o.method === "DELETE" ? 204 : 200);
      return Promise.resolve({ ok: st < 300, status: st, json: () => Promise.resolve(r) });
    } };
  const nombres = Object.keys(g);
  const GuiadaMotor = new Function(...nombres, "\"use strict\";\n" + PURO + MOTOR + "\nreturn GuiadaMotor;")(...nombres.map(k => g[k]));
  const api = GuiadaMotor(n, R, P, Vz);
  return { api, sala, emitidos, limpias, llamadas, visor, cuerpoV, filas, abiertas, VRX, ventana, n, tic: (dt = 0.25) => api.tarde(dt) };
}

test("GuiadaMotor: sin sala guiada no crea nada; en una sala que no es guiada, tampoco", async () => {
  let m = montaGuiada({ nombre: "hituelo-visita" });
  m.tic(); m.tic();
  assert.strictEqual(m.visor.children.length, 0); assert.deepStrictEqual(m.llamadas.ventanas, []); assert.deepStrictEqual(m.llamadas.fetch, []);
  assert.strictEqual(m.sala.oyentes("cierre"), 0); assert.strictEqual(m.api.estado().evento, null);
  m = montaGuiada(); m.sala._estado = "fuera"; m.tic(); assert.strictEqual(m.visor.children.length, 0);
  assert.strictEqual(m.filas.length, 1, "la fila del panel VR se registra al montarse, pero no se ve sin sala"); assert.strictEqual(m.filas[0][1].visible(), false);
});

test("GuiadaMotor: para todos, la tira de la palabra con su cuenta atrás (del atributo palabra_hasta) y los avisos por aria-live; una familia no ve el panel", async () => {
  const m = montaGuiada({ papel: "familia" }), s = m.sala, ahora = Date.now();
  s._gente = [{ identidad: "h_g", metadatos: meta("Rafa", "guia") }, { identidad: "h_a", metadatos: meta("<img src=x onerror=alert(1)>", "familia") }];
  m.tic();
  assert.deepStrictEqual(m.llamadas.ventanas, [], "una familia no tiene la ventana del guía"); assert.strictEqual(m.filas[0][1].visible(), false, "ni la fila del panel VR");
  const tira = m.visor.children.find(c => c.attrs.id === "guiadaPalabra"), avisos = m.visor.children.find(c => c.attrs.id === "guiadaAvisos");
  assert.ok(tira && avisos); assert.strictEqual(tira.hidden, true, "nadie tiene la palabra: sin tira"); assert.strictEqual(avisos.attrs["aria-live"], "polite");
  s._atr.h_a = { palabra_hasta: iso(ahora + 31_200) }; s.emite("atributos", { identidad: "h_a" }); m.tic();
  assert.strictEqual(tira.hidden, false); const raro = SalaPose.leeInfo(meta("<img src=x onerror=alert(1)>", "familia")).alias;
  assert.strictEqual(tira.textContent.replace(/ · 0:3[12]$/, ""), "Tiene la palabra " + raro, "el alias (de otra persona) como TEXTO; el El de prueba falla si alguien usa innerHTML");
  assert.strictEqual(tira.children.length, 0, "ni un elemento hijo: texto"); assert.strictEqual(avisos.textContent, "Tiene la palabra " + raro + ".");
  const ev = m.emitidos.filter(e => e[0] === "guiada:palabra").pop()[1]; assert.strictEqual(ev.identidad, "h_a"); assert.strictEqual(ev.yo, false);
  s._atr.h_a = { palabra_hasta: iso(Date.now() + 29_500) }; m.tic(); assert.strictEqual(avisos.textContent, "Le quedan 30 segundos.");
  m.tic(); assert.strictEqual(avisos.textContent, "Le quedan 30 segundos.", "una sola vez");
  // a mí: «Tienes la palabra»
  s._atr.h_a = {}; s._atr.h_yo = { palabra_hasta: iso(Date.now() + 90_000) }; m.tic();
  assert.match(tira.textContent, /^Tienes la palabra · 1:(29|30)$/); assert.strictEqual(avisos.textContent, "Tienes la palabra: 2 minutos.");
  assert.strictEqual(m.emitidos.filter(e => e[0] === "guiada:palabra").pop()[1].yo, true);
  s._atr.h_yo = { palabra_hasta: iso(Date.now() - 10) }; m.tic(); assert.strictEqual(tira.hidden, true); assert.strictEqual(avisos.textContent, "Se acabó el turno de palabra.");
  // en VR la tira no se ve (la lámina y el panel son de VR)
  s._atr.h_yo = { palabra_hasta: iso(Date.now() + 60_000) }; m.VRX.on = true; m.tic(); assert.strictEqual(tira.hidden, true); m.VRX.on = false;
  const ext = { lineas: [] }; m.n.oy["depura:lineas"][0](ext); assert.match(ext.lineas[0], /^guiada 12 · familia · palabra/);
});

test("GuiadaMotor: el panel del guía (preparar, manos en orden, dar, +1 min, cortar, silenciar) todo por la api; sacar y cerrar piden pulsar dos veces", async () => {
  const m = montaGuiada({ respuestas: { "POST palabra": { __status: 409, error: "palabra_ocupada", mensaje: "Otra familia tiene la palabra: quítasela antes de dársela a otra." }, "POST silenciar": { pistas: 2, palabra_quitada: true } } });
  const s = m.sala, ahora = Date.now();
  s._gente = [{ identidad: "h_g", metadatos: meta("Rafa", "guia") }, { identidad: "h_a", metadatos: meta("Ana", "familia") }, { identidad: "h_b", metadatos: meta("Beto", "familia") }];
  s._atr = { h_a: { mano: iso(ahora - 5_000) }, h_b: { mano: iso(ahora - 50_000) } };
  m.tic(); await espera();
  assert.deepStrictEqual(m.llamadas.ventanas, [["guia", "Visita guiada"]]); assert.strictEqual(m.llamadas.iconos[0].ventana, "guia");
  assert.deepStrictEqual(m.llamadas.fetch[0], ["GET", "/api/presencia/guiadas/12/palabra", null], "preparar: pide a la api cuántas familias hay");
  m.tic();
  const V = m.cuerpoV, txt = V.textContent;
  assert.match(txt, /2 de 5 familias apuntadas están en la sala\. Dentro ahora:/); assert.match(txt, /Nadie tiene la palabra\./);
  const ol = V.todos(e => e.tagName === "OL")[0]; assert.deepStrictEqual(ol.children.map(li => li.children[0].texto), ["Beto ", "Ana "], "manos en orden de llegada");
  // dar la palabra a la primera mano: POST …/palabra { identidad }; si la api dice que no, su mensaje en la línea de estado
  botones(ol.children[0], "Dar la palabra")[0].dispara("click"); await espera(); await espera();
  assert.deepStrictEqual(m.llamadas.fetch.find(f => f[0] === "POST"), ["POST", "/api/presencia/guiadas/12/palabra", { identidad: "h_b" }]);
  const estado = V.todos(e => e.attrs.role === "status")[0]; assert.strictEqual(estado.textContent, "Otra familia tiene la palabra: quítasela antes de dársela a otra.");
  assert.strictEqual(botones(V, "+1 min")[0].disabled, true, "sin turno, +1 min y cortar, apagados");
  s._atr.h_b = { palabra_hasta: iso(Date.now() + 100_000) }; m.tic();
  assert.match(V.textContent, /Beto tiene la palabra · le quedan 1:(39|40)/); assert.strictEqual(botones(V, "Cortar")[0].disabled, false);
  botones(V, "+1 min")[0].dispara("click"); botones(V, "Cortar")[0].dispara("click"); botones(V, "Silenciar a todos")[0].dispara("click"); await espera(); await espera();
  const mods = m.llamadas.fetch.filter(f => f[0] !== "GET").map(f => f[0] + " " + f[1].replace("/api/presencia/guiadas/12/", ""));
  assert.deepStrictEqual(mods.slice(1), ["POST palabra/alargar", "DELETE palabra", "POST silenciar"]);
  assert.strictEqual(estado.textContent, "Silenciados: 2 micrófonos.");
  // sacar: la primera pulsación solo pregunta; la segunda, POST …/expulsar
  const n0 = m.llamadas.fetch.length, saca = () => botones(V).find(b => b.attrs["aria-label"] === "Sacar a Ana de la visita");
  saca().dispara("click"); await espera();
  assert.strictEqual(m.llamadas.fetch.length, n0, "una pulsación no saca a nadie"); assert.match(estado.textContent, /¿Sacar a Ana de la visita\? Pulsa otra vez/);
  assert.strictEqual(saca().textContent, "¿Sacar? Otra vez");
  saca().dispara("click"); await espera();
  assert.deepStrictEqual(m.llamadas.fetch[n0], ["POST", "/api/presencia/guiadas/12/expulsar", { identidad: "h_a" }]);
  // cerrar: dos pulsaciones y los segundos elegidos
  const sel = V.todos(e => e.tagName === "SELECT")[0]; sel.value = "30";
  const cie = botones(V, "Cerrar la sala")[0]; cie.dispara("click"); await espera();
  assert.ok(!m.llamadas.fetch.some(f => f[1].endsWith("/cerrar"))); m.tic(); assert.strictEqual(cie.textContent, "Pulsa otra vez para cerrar");
  cie.dispara("click"); await espera();
  assert.deepStrictEqual(m.llamadas.fetch.find(f => f[1].endsWith("/cerrar")), ["POST", "/api/presencia/guiadas/12/cerrar", { segundos: 30 }]);
  // pasa a ser familia (o se va): fuera la ventana
  s._yo = { identidad: "h_yo", metadatos: meta("Rafa", "familia") }; m.tic(); assert.deepStrictEqual(m.llamadas.ventanas.at(-1), ["fuera", "guia"]);
});

test("GuiadaMotor: el cierre (solo sin participante) cuenta atrás para todos y al llegar a cero vuelve a la visita libre; en VR, una lámina", async () => {
  let m = montaGuiada({ papel: "familia" });
  m.tic();
  m.sala.datos("cierre", json({ v: 1, en: iso(Date.now() + 40), a: "general" }), { identidad: "h_listo", metadatos: "{}" });
  assert.strictEqual(m.api.estado().cierre, null, "con participante, se descarta"); assert.strictEqual(m.api.estado().descartados, 1);
  m.VRX.on = true;
  m.sala.datos("cierre", json({ v: 1, en: iso(Date.now() + 60), a: "general" }), null);
  assert.ok(m.api.estado().cierre); assert.deepStrictEqual(m.llamadas.laminas, ["guiada-cierre"], "en VR, la lámina");
  assert.strictEqual(m.emitidos.filter(e => e[0] === "guiada:cierre").length, 1);
  const avisos = m.visor.children.find(c => c.attrs.id === "guiadaAvisos"); assert.match(avisos.textContent, /^La visita guiada termina en [01] s\. Volvéis a la visita libre\.$/);
  m.VRX.on = false; m.tic(); const tira = m.visor.children.find(c => c.attrs.id === "guiadaPalabra"); assert.match(tira.textContent, /termina en/);
  await espera(80); m.tic();
  assert.deepStrictEqual(m.llamadas.cambia, ["general"], "vuelve sola a la visita libre (Presencia.cambiaSala)"); assert.strictEqual(m.api.estado().cierre, null);
  assert.ok(!m.abiertas["guiada-cierre"], "la lámina se cierra"); assert.strictEqual(m.api.estado().vueltas, 1);
  // sin presencia (la voz entró por su cuenta): Voz.sale()
  m = montaGuiada({ conPresencia: false }); m.tic();
  m.sala.datos("cierre", json({ v: 1, en: iso(Date.now() - 1), a: "general" }), null); m.tic();
  assert.strictEqual(m.llamadas.sale, 1);
});

test("GuiadaMotor: en VR, la fila del panel (pestaña «Ir a») solo para quien modera, con dar a la 1.ª mano, +1 min, cortar y silenciar", async () => {
  const m = montaGuiada({ papel: "oficina" }), s = m.sala;
  s._gente = [{ identidad: "h_a", metadatos: meta("Ana", "familia") }]; s._atr = { h_a: { mano: iso(Date.now() - 1000) } };
  m.VRX.on = true; m.tic(); await espera();
  assert.deepStrictEqual(m.llamadas.ventanas, [], "con gafas, la ventana de pantalla no");
  const [pest, fila] = m.filas[0]; assert.strictEqual(pest, "ira"); assert.strictEqual(fila.visible(), true);
  const B = []; fila.botones((id, x, y, w, h, t, fn) => B.push({ id, t, fn, x, w }), 100);
  assert.deepStrictEqual(B.map(b => b.t), ["Dar a la 1.ª mano", "+1 min", "Cortar", "Silenciar"]);
  assert.ok(B.every(b => b.x >= 0 && b.x + b.w <= 1024), "caben en el lienzo de 1.024 px");
  B[0].fn(); await espera();
  assert.deepStrictEqual(m.llamadas.fetch.find(f => f[0] === "POST"), ["POST", "/api/presencia/guiadas/12/palabra", { identidad: "h_a" }]);
  const pintado = []; fila.pinta({ fillText: t => pintado.push(t), set fillStyle(v) {}, set font(v) {}, set textBaseline(v) {} }, 100, 1024);
  assert.deepStrictEqual(pintado, ["Visita guiada", "Nadie tiene la palabra", "Manos: 1 · la 1.ª, Ana"]);
  assert.ok(typeof fila.firma() === "string");
  m.api.libera(); assert.strictEqual(m.ventana.__guiada, undefined); assert.strictEqual(m.visor.children.length, 0);
});

test("textContent siempre: el componente no usa innerHTML, ni pide nada fuera de su origen, ni graba", () => {
  const src = sinCabecera(GUI).replace(/\/\/.*$/gm, "");
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(src)); assert.ok(!/MediaRecorder|Egress|captureStream/.test(src));
  for (const u of src.match(/fetch\(([^,]+)/g) || []) assert.match(u, /"\/api\/presencia\/guiadas\/"/, "solo su api, del mismo origen");
});

// ---------- los componentes de verdad en el registro de 02c: red, presencia, voz y guiada con un LiveKit de mentira
function lkFalso() {
  const RoomEvent = { ParticipantConnected: "pc", ParticipantDisconnected: "pd", DataReceived: "dr", Reconnecting: "rc", Reconnected: "rd", Disconnected: "dc", ParticipantAttributesChanged: "pa" };
  const DisconnectReason = { UNKNOWN_REASON: 0, CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5 };
  const salas = [];
  class Room {
    constructor() { this.oy = {}; this.remoteParticipants = new Map(); this.desconexiones = 0; this.conectada = false; this.name = ""; salas.push(this);
      this.localParticipant = { identity: null, metadata: null, attributes: {}, permissions: { canPublish: false, canPublishSources: [] }, publishData() { return Promise.resolve(); } }; }
    on(ev, fn) { (this.oy[ev] = this.oy[ev] || []).push(fn); return this; }
    emite(ev, ...a) { (this.oy[ev] || []).forEach(fn => fn(...a)); }
    connect(url, token) {
      const guiada = /^guiada-/.test(token);
      this.name = guiada ? token : "hituelo-libre"; this.conectada = true; this.localParticipant.identity = "h_yo";
      this.localParticipant.metadata = meta("Rafa", guiada ? "guia" : undefined);
      return Promise.resolve();
    }
    disconnect() { this.desconexiones++; const era = this.conectada; this.conectada = false; if (era) this.emite(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED); return Promise.resolve(); }
    entra(identity, metadata, attributes = {}) { const p = { identity, metadata, attributes, trackPublications: new Map() }; this.remoteParticipants.set(identity, p); this.emite(RoomEvent.ParticipantConnected, p); return p; }
    datos(p, tema, bytes) { this.emite(RoomEvent.DataReceived, bytes, p, 0, tema); }
    corta(motivo) { this.conectada = false; this.emite(RoomEvent.Disconnected, motivo); }
  }
  return { Room, RoomEvent, DisconnectReason, salas, AudioPresets: { speech: {} }, Track: { Source: { Microphone: "microphone" } } };
}
function cualquiera() {
  const al = {};
  return new Proxy(function () {}, { get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (typeof k === "symbol" || k === "then") return undefined; return k in al ? al[k] : (al[k] = cualquiera()); },
    set(t, k, v) { al[k] = v; return true; }, apply() { return cualquiera(); }, construct() { return cualquiera(); } });
}
function motor({ busqueda = "?presencia=red", ficheros = ["red", "presencia", "voz", "guiada"], guiadaEstado = 200 } = {}) {
  const LK = lkFalso(), errores = [], fetchs = [];
  const fuentes = { red: sinCabecera(RED).replace('import("livekit-client")', "Promise.resolve(LK_FALSO)"),
    presencia: sinCabecera(PRES).replace('import("three/addons/utils/BufferGeometryUtils.js")', "Promise.reject(new Error(\"sin addons en Node\"))"), voz: sinCabecera(VOZ), guiada: sinCabecera(GUI) };
  const ventana = { addEventListener() {}, removeEventListener() {} }, visor = new El("div");
  const documento = { getElementById: () => null, createElement: t => new El(t), createTextNode: t => ({ texto: t }), body: new El("body") };
  const consola = { error: (...a) => errores.push(a.map(String).join(" ")), warn: (...a) => { const t = a.map(String).join(" "); if (!/sin quad ni dron/.test(t)) errores.push(t); }, log() {} };
  const g = {
    THREE: cualquiera(), LK_FALSO: LK, D: { ext: [0, 200, 200, 0], base: "" }, suelo: () => 10, exag: 1, texColor: x => x,
    scene: { add() {}, remove() {} }, camera: cualquiera(), renderer: cualquiera(), visor,
    Entidades: { registra: () => () => {} }, Llegada: { funde: fn => { fn(); return true; }, aparece() {} }, TR: {},
    Movibles: { hazMovible: () => ({ menuLlevar() {}, coloca() {} }) }, VRX: { on: false, cab: {}, rig: { yaw: 0 } }, paseando: true, pp: { x: 50, y: 50, ang: 0 },
    enQuad: false, enDron: false, quad: cualquiera(), dron: cualquiera(), objetivo: { x: 50, y: 0, z: -50 }, navigator: { userAgent: "Node" },
    Ventanas: { registra: (id, d) => { d.construye(new El("section")); return () => {}; } }, Hud: { icono: () => () => {} }, Laminas: { abre() { return true; }, cierra() { return true; }, hay() { return false; }, repinta() {} },
    PanelVR: { filas: () => () => {} },
    fetch: (u, o) => {
      fetchs.push([o && o.method, u]);
      if (u === "/api/presencia/token") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ url: "/rtc", token: "general" }) });
      const m = /^\/api\/presencia\/guiadas\/(\d+)\/token$/.exec(u);
      if (m) return Promise.resolve({ ok: guiadaEstado === 200, status: guiadaEstado, json: () => Promise.resolve(guiadaEstado === 200 ? { url: "/rtc", token: "guiada-" + m[1], papel: "guia" } : { error: "guiada_cerrada", mensaje: "La visita guiada ha terminado: el guía ha cerrado la sala." }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ inscritos: { apuntados: 3, conectados: 1 }, turno: null, manos: [], cierra_en: null }) });
    }
  };
  const nombres = Object.keys(g), codigo = sinCabecera(LIB) + "\n" + ficheros.map(f => fuentes[f]).join("\n");
  const f = new Function(...["window", "location", "document", "console"].concat(nombres), "\"use strict\";\n" + sinCabecera(NUCLEO) + "\n" + codigo + "\nreturn { Componentes, Bus };");
  const r = f(...[ventana, { search: busqueda, href: "https://gemelo.test/finca/index.html" + busqueda }, documento, consola].concat(nombres.map(k => g[k])));
  r.Componentes.arranca();
  return Object.assign(r, { LK, errores, fetchs, ventana, visor });
}
const ACTIVOS = r => r.Componentes.resumen().filter(x => x.activo).map(x => x.id).sort();

test("componentes en Node: la PRESENCIA viaja a la sala guiada (Voz.entra con ?presencia=red) y la voz usa su misma conexión; el cierre la devuelve a la visita libre", async () => {
  const r = motor(); await espera(10);
  assert.deepStrictEqual(ACTIVOS(r), ["presencia-compartida", "red-salas", "visita-guiada", "voz-guiada"], JSON.stringify(r.Componentes.resumen()) + r.errores.join("|"));
  assert.deepStrictEqual(r.fetchs, [["POST", "/api/presencia/token"]]); assert.strictEqual(r.LK.salas[0].name, "hituelo-libre");
  assert.strictEqual(await r.ventana.__voz("entra", 12), true);
  assert.deepStrictEqual(r.fetchs.map(x => x[1]).slice(0, 2), ["/api/presencia/token", "/api/presencia/guiadas/12/token"], "el token de la guiada, una sola vez (la voz no abre otra conexión)");
  assert.strictEqual(r.LK.salas.length, 2, "una sola conexión cada vez: la de la general se deja"); assert.strictEqual(r.LK.salas[0].desconexiones, 1);
  assert.strictEqual(r.LK.salas[1].name, "guiada-12");
  const p = r.ventana.__presencia(); assert.strictEqual(p.sala, "guiada"); assert.strictEqual(p.evento, 12); assert.strictEqual(p.conectado, true);
  const v = r.ventana.__voz(); assert.strictEqual(v.sala, "guiada-12"); assert.strictEqual(v.papel, "guia"); assert.ok(v.dentro && v.guiada);
  // la voz de alguien sale de su avatar: la presencia ve a la misma identidad en la misma sala
  const room = r.LK.salas[1]; room.entra("h_ana", meta("Ana", "familia"), { mano: iso(Date.now() - 1000) });
  r.Componentes.actualiza("tarde", 0.3, 1); await espera(10);
  const e = r.ventana.__guiada(); assert.strictEqual(e.evento, 12); assert.strictEqual(e.papel, "guia"); assert.strictEqual(e.ventana, true); assert.deepStrictEqual(e.manos, ["h_ana"]);
  assert.ok(r.fetchs.some(x => x[1] === "/api/presencia/guiadas/12/palabra"), "preparar: la vista de la api");
  // el cierre: aviso sin participante y, al llegar a cero, de vuelta a la general (otro token de la api de siempre)
  room.datos(null, "cierre", json({ v: 1, en: iso(Date.now() + 30), a: "general" }));
  assert.ok(r.ventana.__guiada().cierre); await espera(50);
  r.Componentes.actualiza("tarde", 0.3, 2); await espera(10);
  assert.strictEqual(r.ventana.__presencia().sala, "general"); assert.strictEqual(r.ventana.__presencia().evento, null);
  assert.strictEqual(r.LK.salas.at(-1).name, "hituelo-libre"); assert.strictEqual(r.ventana.__voz().dentro, false, "la voz se desengancha sola");
  assert.strictEqual(r.ventana.__guiada().evento, null); assert.deepStrictEqual(r.errores, []);
});

test("componentes en Node: si la api no deja entrar en la guiada (cerrada) o la sala se borra, la presencia vuelve a la visita libre con el aviso; ?guia=0", async () => {
  let r = motor({ guiadaEstado: 409 }); await espera(10);
  assert.strictEqual(await r.ventana.__voz("entra", 7), false); await espera(10);
  assert.strictEqual(r.ventana.__presencia().sala, "general"); assert.strictEqual(r.ventana.__presencia().conectado, true);
  assert.strictEqual(r.ventana.__voz().motivo, "no_entra");
  assert.match(r.visor.children[0].todos(e => e.tagName === "P")[0].textContent, /el guía ha cerrado la sala/);
  r = motor(); await espera(10); await r.ventana.__voz("entra", 7);
  r.LK.salas.at(-1).corta(r.LK.DisconnectReason.ROOM_DELETED); await espera(10);
  assert.strictEqual(r.ventana.__presencia().sala, "general"); assert.strictEqual(r.LK.salas.at(-1).name, "hituelo-libre");
  assert.match(r.visor.children[0].todos(e => e.tagName === "P")[0].textContent, /La visita guiada ha terminado/);
  r.LK.salas.at(-1).corta(r.LK.DisconnectReason.PARTICIPANT_REMOVED); await espera(10);
  assert.match(r.visor.children[0].todos(e => e.tagName === "P")[0].textContent, /La oficina te ha sacado/, "en la general, el aviso de siempre");
  r = motor({ busqueda: "?presencia=red&guia=0" }); assert.ok(!ACTIVOS(r).includes("visita-guiada")); assert.strictEqual(r.ventana.__guiada, undefined);
  assert.deepStrictEqual(r.errores, []);
});

test("el manifiesto, los eventos y la api de la presencia: «visita-guiada» con su bandera, presupuesto y eventos del catálogo", () => {
  const m = /Componentes\.registra\(\{([\s\S]*?)\n  \}\);/.exec(GUI)[1];
  assert.match(m, /id: "visita-guiada"/); assert.match(m, /bandera: \{ defecto: true, url: "guia" \}/); assert.match(m, /presupuesto: \{ llamadas: 1, triangulos: 2, texturasMB: 1 \}/);
  assert.match(m, /consume: \["Red", "Presencia", "Voz"/);
  for (const e of ["guiada:palabra", "guiada:cierre"]) assert.deepStrictEqual(EVENTOS.eventos[e].emiten, ["46_guiada"], e);
  for (const e of ["voz:estado", "depura:lineas"]) assert.ok(EVENTOS.eventos[e].escuchan.includes("46_guiada"), e);
  assert.ok(EVENTOS.eventos["red:estado"].escuchan.includes("45_voz"), "la voz se engancha sola a la sala que entra en una guiada");
  for (const k of ["entraGuiada", "evento", "nombreSala"]) assert.ok(IFACES.apis_de_componentes["presencia-compartida"].miembros.includes(k), k);
});
