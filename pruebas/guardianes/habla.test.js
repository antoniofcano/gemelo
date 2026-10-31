"use strict";
// F3e, hablar en la visita guiada (47_habla.js; ADR-0026, decisiones 157-162). En Node, SIN navegador y SIN LiveKit:
//   · HablaPuro: los dos modos del micro (pulsar / mantener) como máquina de estados con fast-check, lo que se enseña según papel, permiso, micro y mano
//     (el micro siempre con icono y TEXTO; silenciarse siempre disponible; el aviso de que el sonido no es espacial), la cola («Estás 2.º en la cola»);
//   · HablaMotor con un DOM, una voz, una guiada, una api, un Teclas, un Ajustes y un 29_vr de mentira: nada fuera de una sala guiada; levantar y bajar la
//     mano por la api; Hablar en pulsar y en mantener (botón, tecla T, gatillo izquierdo con háptica); el guía abre su micro con el primer gesto, una vez;
//     la casilla «Llevo auriculares»; el ajuste de Configuración; aria-live; textContent siempre; el botón de ≥ 44 px (56 en Quest);
//   · el manifiesto, los eventos del catálogo, la api «Guiada» y el enganche de 29_vr.js (el gatillo izquierdo).
// Lo de Chrome (cómo se ve, foco, tamaño real de los botones) está en pruebas/guardianes/habla_chrome.test.js, por el banco.
const test = require("node:test"), assert = require("node:assert");
const fc = require("fast-check");
const { lee, path } = require("./_util");
const contratoModulos = require(path.join(__dirname, "..", "contrato_modulos.js"));

const sinCabecera = s => s.startsWith(contratoModulos.MARCA_I) ? s.slice(s.indexOf(contratoModulos.MARCA_F) + contratoModulos.MARCA_F.length + 1) : s;
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return s.slice(i, f); };
const HAB = lee("apps/web/motor/47_habla.js"), GUI = lee("apps/web/motor/46_guiada.js"), VRJS = lee("apps/web/motor/29_vr.js"), AJU = lee("apps/web/motor/33_ajustes.js");
const PURO = trozo(HAB, "// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo(HAB, "// [motor:inicio]", "// [motor:fin]");
const H = new Function("\"use strict\";\n" + PURO + "\nreturn HablaPuro;")();
const AjustesPuro = new Function("\"use strict\";\n" + trozo(AJU, "// [puro:inicio]", "// [puro:fin]") + "\nreturn AjustesPuro;")();
const EVENTOS = JSON.parse(lee("contratos/eventos.json")), IFACES = JSON.parse(lee("contratos/interfaces.json"));
const espera = (ms = 0) => new Promise(r => setTimeout(r, ms));

// ---------- HablaPuro
const base = { guiada: true, papel: "familia", puede: false, micro: "cerrado", motivo: "", auriculares: false, mano: false, puesto: null, ocupado: false };
test("HablaPuro: modos, evento, puesto en la cola y ordinal", () => {
  assert.deepStrictEqual(H.MODOS, ["pulsar", "mantener"]); assert.strictEqual(H.DEFECTO, "pulsar");
  for (const x of ["mantener", "pulsar"]) assert.strictEqual(H.modo(x), x);
  for (const x of ["", "Mantener", null, undefined, 3, "hold"]) assert.strictEqual(H.modo(x), "pulsar", String(x));
  assert.strictEqual(H.evento("guiada-12"), 12); for (const x of ["guiada-0", "hituelo-libre", "guiada-", null, 7]) assert.strictEqual(H.evento(x), null, String(x));
  assert.strictEqual(H.puestoDe(["a", "b", "c"], "b"), 2); assert.strictEqual(H.puestoDe(["a"], "z"), null); assert.strictEqual(H.puestoDe(null, "a"), null); assert.strictEqual(H.puestoDe(["a"], ""), null);
  assert.strictEqual(H.textoCola(2), "Estás 2.º en la cola."); assert.strictEqual(H.textoCola(1), "Estás 1.º en la cola."); assert.strictEqual(H.textoCola(null), "Tienes la mano levantada.");
  assert.strictEqual(H.AVISO_ESPACIAL, "Con el micrófono abierto el sonido no es espacial; con auriculares sí.");
});

test("HablaPuro: el micro siempre se dice con icono y texto, y cada causa tiene el suyo", () => {
  const t = (o) => H.textoMicro(Object.assign({}, base, o));
  assert.strictEqual(t({ micro: "abierto", puede: true }).clave, "abierto"); assert.match(t({ micro: "abierto" }).texto, /abierto: te oyen/);
  assert.strictEqual(t({ micro: "abriendo" }).clave, "abriendo");
  assert.strictEqual(t({ puede: true }).clave, "cerrado"); assert.match(t({ puede: true }).texto, /cerrado: no te oyen/);
  assert.match(t({}).texto, /no tienes la palabra/); assert.match(t({ papel: "guia" }).texto, /sin permiso/);
  assert.match(t({ puede: true, motivo: "micro_denegado" }).texto, /navegador no deja/); assert.match(t({ puede: true, motivo: "sin_micro" }).texto, /ningún micrófono/); assert.match(t({ puede: true, motivo: "error_micro" }).texto, /No se pudo abrir/);
  assert.strictEqual(t({ micro: "abierto", motivo: "micro_denegado" }).clave, "abierto", "con el micro abierto manda eso, no un motivo viejo");
});

test("HablaPuro: qué se enseña (hablar con permiso; levantar o bajar la mano sin él; nunca la mano al guía; silenciarse siempre)", () => {
  const v = (o, m) => H.vista(Object.assign({}, base, o), m);
  assert.strictEqual(v({ guiada: false }).visible, false); assert.strictEqual(v({ papel: "" }).visible, false); assert.strictEqual(H.vista(null).visible, false);
  // la familia sin palabra
  let x = v({}); assert.strictEqual(x.primaria.accion, "levantar"); assert.strictEqual(x.primaria.texto, "Levantar la mano"); assert.strictEqual(x.cola, ""); assert.strictEqual(x.auric, false);
  x = v({ mano: true, puesto: 2 }); assert.strictEqual(x.primaria.accion, "bajar"); assert.strictEqual(x.primaria.texto, "Bajar la mano"); assert.strictEqual(x.cola, "Estás 2.º en la cola.");
  assert.strictEqual(H.textoEstado(x), "Micrófono cerrado: no tienes la palabra. Estás 2.º en la cola.");
  assert.strictEqual(v({ mano: true, ocupado: true }).primaria.off, true, "mientras la api contesta, el botón no se repite");
  // con la palabra: pulsar o mantener
  x = v({ puede: true }); assert.deepStrictEqual([x.primaria.accion, x.primaria.texto, x.silenciar, x.auric], ["micro", "Hablar", false, true]);
  x = v({ puede: true }, "mantener"); assert.strictEqual(x.primaria.texto, "Mantén pulsado para hablar");
  x = v({ puede: true, micro: "abierto" }); assert.deepStrictEqual([x.primaria.texto, x.silenciar, x.aviso], ["Silenciarme", false, H.AVISO_ESPACIAL], "en pulsar, el mismo botón silencia");
  x = v({ puede: true, micro: "abierto" }, "mantener"); assert.deepStrictEqual([x.primaria.texto, x.silenciar], ["Hablando · suelta para callar", true], "en mantener, además, un botón aparte");
  assert.strictEqual(v({ puede: true, micro: "abierto", auriculares: true }).aviso, "", "con auriculares, sin aviso");
  assert.strictEqual(v({ puede: true }).aviso, "", "el aviso es del micro abierto");
  // el guía y la oficina: nunca la mano; siempre pulsar
  for (const papel of ["guia", "oficina"]) {
    x = v({ papel, puede: true }, "mantener"); assert.strictEqual(x.primaria.texto, "Hablar", papel + ": pulsa aunque el ajuste sea mantener");
    x = v({ papel, puede: false }); assert.strictEqual(x.primaria.accion, "ninguna"); assert.strictEqual(x.primaria.off, true);
  }
  // cuando se acaba la palabra con el micro abierto (la api lo cierra), no queda un botón de hablar
  assert.strictEqual(v({ puede: false, micro: "abierto" }).primaria.accion, "micro", "abierto = siempre se puede silenciar, aunque el permiso se haya ido");
});

const MICROS = ["cerrado", "abriendo", "abierto"];
test("propiedad: entrada abre solo con el micro cerrado y cierra solo con él abierto; pulsar no hace nada al soltar; mantener cierra lo que abrió al soltar", () => {
  const arbo = fc.record({ modo: fc.constantFrom("pulsar", "mantener", "x"), papel: fc.constantFrom("familia", "guia", "oficina"), tipo: fc.constantFrom("baja", "suelta"), micro: fc.constantFrom(...MICROS), sosten: fc.boolean() });
  fc.assert(fc.property(arbo, o => {
    const r = H.entrada(o), mant = H.modo(o.modo) === "mantener" && o.papel === "familia";
    if (r.accion === "abre") assert.ok(o.micro === "cerrado" && o.tipo === "baja");
    if (r.accion === "cierra") assert.ok(o.micro !== "cerrado");
    if (o.tipo === "baja") assert.strictEqual(r.accion, o.micro === "cerrado" ? "abre" : "cierra", "apretar siempre alterna");
    if (o.tipo === "suelta" && !mant) assert.strictEqual(r.accion, "nada", "en pulsar (o siendo el guía), soltar no hace nada");
    if (o.tipo === "suelta" && mant && !o.sosten) assert.strictEqual(r.accion, "nada", "soltar algo que no abrió este gesto no cierra");
    if (o.tipo === "suelta" && mant && o.sosten && o.micro !== "cerrado") assert.strictEqual(r.accion, "cierra");
    assert.strictEqual(r.sosten, o.tipo === "baja" ? r.accion === "abre" && mant : false, "sosten solo lo deja un apretar que abre, en mantener");
  }), { numRuns: 400 });
});

test("propiedad: la vista nunca deja sin silenciar un micro abierto, nunca pone la mano al guía y siempre dice el micro con texto", () => {
  const arbo = fc.record({ guiada: fc.boolean(), papel: fc.constantFrom("familia", "guia", "oficina", ""), puede: fc.boolean(), micro: fc.constantFrom(...MICROS), motivo: fc.constantFrom("", "micro_denegado", "sin_micro", "error_micro", "sin_permiso", "sin_gesto"),
    auriculares: fc.boolean(), mano: fc.boolean(), puesto: fc.option(fc.integer({ min: 1, max: 40 }), { nil: null }), ocupado: fc.boolean() });
  fc.assert(fc.property(arbo, fc.constantFrom("pulsar", "mantener"), (e, m) => {
    const x = H.vista(e, m);
    if (!x.visible) { assert.ok(!e.guiada || !e.papel); return; }
    assert.ok(x.micro.texto.length > 5 && x.micro.icono, "icono y texto: no solo color");
    if (e.micro !== "cerrado") assert.strictEqual(x.primaria.accion, "micro", "silenciarse siempre disponible");
    if (e.papel !== "familia") assert.ok(x.primaria.accion !== "levantar" && x.primaria.accion !== "bajar" && x.cola === "");
    if (e.papel === "familia" && !e.puede && e.micro === "cerrado") assert.ok(["levantar", "bajar"].includes(x.primaria.accion));
    assert.strictEqual(x.aviso !== "", e.micro !== "cerrado" && !e.auriculares, "el aviso del eco, con el micro abierto y sin auriculares");
    assert.strictEqual(H.activo(x), x.primaria.accion === "micro");
    assert.ok(x.primaria.texto && x.primaria.aria);
  }), { numRuns: 400 });
});

// ---------- HablaMotor con un DOM, una voz, una guiada, una api, Teclas, Ajustes, PanelVR, Laminas y un 29_vr de mentira
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.style = {}; this.attrs = {}; this.oy = {}; this.hidden = false; this.parentNode = null; this._t = ""; this.disabled = false; this.checked = false; this.title = ""; }
  get textContent() { return this._t + this.children.map(c => c.textContent !== undefined ? c.textContent : c.texto || "").join(""); }
  set textContent(v) { this._t = String(v); this.children = []; }
  set innerHTML(v) { throw new Error("innerHTML no: todo con textContent"); }
  appendChild(c) { if (c.parentNode && c.parentNode.children) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(n, f) { (this.oy[n] = this.oy[n] || []).push(f); } removeEventListener() {}
  dispara(n, e = {}) { const ev = Object.assign({ preventDefault() {}, stopPropagation() {}, target: this }, e); (this.oy[n] || []).slice().forEach(f => f(ev)); }
  todos(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) if (c.todos) c.todos(pred, out); return out; }
}
const por = (raiz, id) => raiz.todos(e => (e.attrs.id || e.id) === id)[0];

function montaHabla({ papel = "familia", puede = false, sala = "guiada-12", manos = [], yo = "h_yo", respuestas = {}, ua = "Node", modo = null } = {}) {
  const voz = { s: { sala, dentro: true, guiada: /^guiada-/.test(sala), papel, puede, micro: "cerrado", auriculares: false, motivo: "" }, llamadas: [], retraso: 0 };
  const Vz = {
    estado: () => Object.assign({}, voz.s),
    abre: () => { voz.llamadas.push("abre"); if (!voz.s.puede) { voz.s.motivo = "sin_permiso"; return Promise.resolve(false); } voz.s.micro = "abriendo"; return espera(voz.retraso).then(() => { voz.s.micro = "abierto"; return true; }); },
    cierra: () => { voz.llamadas.push("cierra"); voz.s.micro = "cerrado"; return Promise.resolve(true); },
    auriculares: si => { if (si !== undefined) { voz.s.auriculares = !!si; voz.llamadas.push("auriculares:" + !!si); } return voz.s.auriculares; }
  };
  const guiada = { evento: H.evento(sala), yo, manos };
  const Gd = { estado: () => Object.assign({}, guiada, { manos: guiada.manos.slice() }) };
  const emitidos = [], limpias = [], fetchs = [], aplicas = [], filas = [], laminas = {}, teclas = {};
  const n = { emite: (e, d) => { emitidos.push([e, d]); return 0; }, on: (e, f) => { (n.oy[e] = n.oy[e] || []).push(f); return f; }, oy: {}, limpia: f => { limpias.push(f); return f; } };
  const visor = new El("div"), ventana = { oy: {}, addEventListener(nm, f) { (this.oy[nm] = this.oy[nm] || []).push(f); }, removeEventListener(nm, f) { const l = this.oy[nm] || [], i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } };
  const VRX = { on: false, voz: null };
  const Ajustes = { registra: (pref, esq, pest, fn) => { aplicas.push({ pref, esq, pest, fn }); try { fn(pref + ".modo", modo || "pulsar"); } catch (e) {} return () => {}; } };
  const Teclas = { registra: (c, fn, d) => { if (teclas[c]) return null; teclas[c] = { fn, d }; return () => { delete teclas[c]; }; } };
  const PanelVR = { filas: (p, d) => { filas.push([p, d]); return () => {}; }, repinta() {} };
  const Laminas = { abre: o => { laminas[o.id] = o; return true; }, cierra: id => { delete laminas[id]; return true; }, hay: id => !!laminas[id], repinta: () => true };
  const g = { window: ventana, document: { createElement: t => new El(t), createTextNode: t => ({ texto: t }), body: new El("body") }, visor, navigator: { userAgent: ua }, VRX, Ajustes, Teclas, PanelVR, Laminas,
    fetch: (u, o) => {
      fetchs.push([o.method, u]);
      const r = respuestas[o.method] || (o.method === "POST" ? { puesto: 2 } : {}), st = r.__status || (o.method === "DELETE" ? 204 : 200);
      return Promise.resolve({ ok: st < 300, status: st, json: () => Promise.resolve(r) });
    } };
  const nombres = Object.keys(g);
  const HablaMotor = new Function(...nombres, "\"use strict\";\n" + PURO + MOTOR + "\nreturn HablaMotor;")(...nombres.map(k => g[k]));
  const api = HablaMotor(n, Vz, Gd);
  return { api, voz, guiada, emitidos, limpias, fetchs, aplicas, filas, laminas, teclas, visor, ventana, VRX, n, tic: (dt = 0.25) => api.tarde(dt),
    caja: () => por(visor, "hablaCaja"), boton: () => por(visor, "hablaBoton"), silencio: () => por(visor, "hablaSilencio"), estado: () => por(visor, "hablaEstado"),
    casilla: () => por(visor, "hablaAuric"), aviso: () => por(visor, "hablaAviso"), nuevoModo: m => aplicas[0].fn("habla.modo", m) };
}

test("HablaMotor: fuera de una sala guiada no crea nada (ni caja ni fetch ni lámina), pero deja la tecla T y el enganche de VR preparados", async () => {
  let m = montaHabla({ sala: "hituelo-libre" }); m.tic(); m.tic();
  assert.strictEqual(m.visor.children.length, 0); assert.deepStrictEqual(m.fetchs, []); assert.deepStrictEqual(Object.keys(m.laminas), []);
  assert.deepStrictEqual(m.aplicas, [], "la pestaña «Hablar» de Configuración no sale hasta estar en una visita guiada");
  assert.strictEqual(m.teclas.KeyT.d, "habla"); assert.strictEqual(m.teclas.KeyT.fn({}), false, "sin micro que abrir, la tecla no se come (devuelve false)");
  assert.strictEqual(m.VRX.voz.toma(), false, "en VR, el gatillo izquierdo sigue siendo el de siempre fuera de la guiada");
  m = montaHabla({ papel: "" }); m.tic(); assert.strictEqual(m.visor.children.length, 0, "sin papel, nada");
});

test("HablaMotor: la familia sin palabra ve «Levantar la mano», la levanta por la api, ve su puesto y la baja; si la api dice que no, su mensaje", async () => {
  const m = montaHabla({ manos: ["h_a"] }); m.tic();
  const caja = m.caja(), b = m.boton(), est = m.estado();
  assert.ok(caja && !caja.hidden); assert.strictEqual(b.textContent, "Levantar la mano"); assert.strictEqual(b.attrs["aria-label"], "Levantar la mano para pedir la palabra");
  assert.strictEqual(est.attrs["aria-live"], "polite"); assert.strictEqual(est.attrs.role, "status"); assert.match(est.textContent, /Micrófono cerrado: no tienes la palabra\./);
  assert.strictEqual(m.silencio().hidden, true); assert.strictEqual(por(m.visor, "hablaAuricEt").hidden, true, "sin permiso no hay casilla de auriculares");
  b.dispara("click"); await espera(); m.tic();
  assert.deepStrictEqual(m.fetchs.at(-1), ["POST", "/api/presencia/guiadas/12/mano"]);
  // la api contestó {puesto: 2} y el atributo aún no ha llegado por la sala: 3 s de «lo que dijo la api»
  assert.strictEqual(m.boton().textContent, "Bajar la mano"); assert.match(m.estado().textContent, /Estás 2\.º en la cola\./); assert.match(m.estado().textContent, /Mano levantada\./);
  // llega el atributo: la cola de verdad (la mía, la segunda)
  m.guiada.manos = ["h_a", "h_yo"]; m.tic(); assert.match(m.estado().textContent, /Estás 2\.º en la cola\./);
  m.guiada.manos = ["h_yo"]; m.tic(); assert.match(m.estado().textContent, /Estás 1\.º en la cola\./, "pasa delante");
  m.boton().dispara("click"); await espera(); m.tic();
  assert.deepStrictEqual(m.fetchs.at(-1), ["DELETE", "/api/presencia/guiadas/12/mano"]);
  assert.strictEqual(m.boton().textContent, "Levantar la mano", "al bajarla, ya no cuenta aunque el atributo tarde"); assert.match(m.estado().textContent, /Mano bajada\./); assert.doesNotMatch(m.estado().textContent, /en la cola/);
  assert.deepStrictEqual(m.emitidos.filter(e => e[0] === "habla:mano").map(e => e[1]), [{ accion: "levanta", ok: true, puesto: 2 }, { accion: "baja", ok: true, puesto: null }]);
  // la mano estaba levantada desde antes (otra pestaña): el botón baja
  const o = montaHabla({ manos: ["h_a", "h_yo"] }); o.tic(); assert.strictEqual(o.boton().textContent, "Bajar la mano"); assert.match(o.estado().textContent, /Estás 2\.º en la cola\./);
  // la api rechaza (p. ej. cola llena)
  const r = montaHabla({ respuestas: { POST: { __status: 409, error: "demasiadas_manos", mensaje: "Hay demasiadas manos levantadas: espera un poco." } } }); r.tic();
  r.boton().dispara("click"); await espera(); r.tic();
  assert.match(r.estado().textContent, /demasiadas manos levantadas/); assert.strictEqual(r.boton().textContent, "Levantar la mano", "no se pone la mano si la api no la aceptó");
  assert.deepStrictEqual(r.emitidos.filter(e => e[0] === "habla:mano").map(e => e[1].ok), [false]);
  // con una petición en vuelo, pulsar otra vez no manda otra
  const d = montaHabla(); d.tic(); d.boton().dispara("click"); d.boton().dispara("click"); await espera();
  assert.strictEqual(d.fetchs.length, 1);
});

test("HablaMotor: con la palabra, «Hablar» en pulsar abre y cierra; el micro dice su estado con texto; el aviso del eco y la casilla «Llevo auriculares»", async () => {
  const m = montaHabla({ puede: true }); m.tic();
  let b = m.boton(); assert.strictEqual(b.textContent, "Hablar"); assert.match(m.estado().textContent, /Micrófono cerrado: no te oyen\./); assert.strictEqual(m.aviso().hidden, true);
  assert.strictEqual(m.casilla().attrs.type, "checkbox"); assert.strictEqual(por(m.visor, "hablaAuricEt").hidden, false, "con permiso, la casilla se ve");
  b.dispara("click"); await espera(5); m.tic();
  assert.deepStrictEqual(m.voz.llamadas, ["abre"]); assert.strictEqual(m.boton().textContent, "Silenciarme"); assert.match(m.estado().textContent, /Micrófono abierto: te oyen\./);
  assert.strictEqual(m.aviso().hidden, false); assert.strictEqual(m.aviso().textContent, "Con el micrófono abierto el sonido no es espacial; con auriculares sí.");
  m.casilla().checked = true; m.casilla().dispara("change"); m.tic();
  assert.deepStrictEqual(m.voz.llamadas, ["abre", "auriculares:true"]); assert.strictEqual(m.aviso().hidden, true, "con auriculares, el aviso se va");
  m.boton().dispara("click"); await espera(); m.tic();
  assert.deepStrictEqual(m.voz.llamadas.slice(-1), ["cierra"]); assert.strictEqual(m.boton().textContent, "Hablar");
  assert.deepStrictEqual(m.emitidos.filter(e => e[0] === "habla:micro").map(e => [e[1].accion, e[1].fuente, e[1].modo]), [["abre", "boton", "pulsar"], ["cierra", "boton", "pulsar"]]);
  // Voz le niega (sin permiso o el navegador): el motivo se dice
  const p = montaHabla({ puede: false }); p.tic(); assert.strictEqual(p.boton().textContent, "Levantar la mano");
  const q = montaHabla({ puede: true }); q.tic(); q.voz.s.motivo = "micro_denegado"; q.tic(); assert.match(q.estado().textContent, /navegador no deja usar el micrófono/);
});

test("HablaMotor: en mantener, apretar abre y soltar cierra (incluso si se suelta mientras se abre); el clic suelto no hace nada; el guía siempre pulsa", async () => {
  const m = montaHabla({ puede: true, modo: "mantener" }); m.tic();
  let b = m.boton(); assert.strictEqual(b.textContent, "Mantén pulsado para hablar");
  b.dispara("pointerdown"); await espera(5); m.tic();
  assert.deepStrictEqual(m.voz.llamadas, ["abre"]); assert.strictEqual(m.boton().textContent, "Hablando · suelta para callar"); assert.strictEqual(m.silencio().hidden, false, "además, un botón aparte para silenciarse");
  assert.strictEqual(m.api.estado().sosten, "boton");
  m.boton().dispara("pointerup"); await espera(); m.tic();
  assert.deepStrictEqual(m.voz.llamadas, ["abre", "cierra"]); assert.strictEqual(m.api.estado().sosten, ""); assert.strictEqual(m.silencio().hidden, true);
  m.boton().dispara("click"); await espera(); assert.deepStrictEqual(m.voz.llamadas, ["abre", "cierra"], "un clic sin apretar y soltar no abre (el teclado usa keydown/keyup)");
  // se suelta antes de que abra: se cierra en cuanto abre
  m.voz.retraso = 30; m.boton().dispara("pointerdown"); m.boton().dispara("pointerup"); await espera(60); m.tic();
  assert.strictEqual(m.voz.s.micro, "cerrado", "no se queda abierto"); assert.deepStrictEqual(m.voz.llamadas.slice(-2), ["abre", "cierra"]);
  // el botón aparte silencia
  m.voz.retraso = 0; m.boton().dispara("pointerdown"); await espera(5); m.tic(); m.silencio().dispara("click"); await espera(); m.tic();
  assert.strictEqual(m.voz.s.micro, "cerrado"); m.boton().dispara("pointerup");
  // el teclado en el botón: Espacio apretado y soltado
  m.boton().dispara("keydown", { code: "Space" }); await espera(5); assert.strictEqual(m.voz.s.micro, "abierto");
  m.boton().dispara("keydown", { code: "Space", repeat: true }); assert.strictEqual(m.voz.s.micro, "abierto", "la repetición de tecla no alterna");
  m.boton().dispara("keyup", { code: "Space" }); await espera(); assert.strictEqual(m.voz.s.micro, "cerrado");
  // el ajuste vuelve a pulsar
  m.nuevoModo("pulsar"); m.tic(); assert.strictEqual(m.boton().textContent, "Hablar");
  // el guía: mantener no cuenta
  const g = montaHabla({ papel: "guia", puede: true, modo: "mantener" }); g.tic(); assert.strictEqual(g.boton().textContent, "Hablar");
  g.boton().dispara("pointerdown"); g.boton().dispara("pointerup"); await espera(5); assert.strictEqual(g.voz.s.micro, "abierto", "soltar no lo cierra: el guía pulsa para abrir y para cerrar");
});

test("HablaMotor: la tecla T (Teclas la reserva) abre y cierra; en mantener, apretar y soltar; el guía abre solo con el primer gesto, una vez, y si se silencia no se reabre", async () => {
  const m = montaHabla({ puede: true }); m.tic();
  assert.strictEqual(m.teclas.KeyT.fn({}), undefined); await espera(5); assert.strictEqual(m.voz.s.micro, "abierto");
  m.teclas.KeyT.fn({}); await espera(); assert.strictEqual(m.voz.s.micro, "cerrado"); assert.strictEqual(m.api.estado().teclas, 2);
  m.nuevoModo("mantener"); m.teclas.KeyT.fn({}); await espera(5); assert.strictEqual(m.voz.s.micro, "abierto");
  m.ventana.oy.keyup.forEach(f => f({ code: "KeyU" })); assert.strictEqual(m.voz.s.micro, "abierto", "otra tecla no la suelta");
  m.ventana.oy.keyup.forEach(f => f({ code: "KeyT" })); await espera(); assert.strictEqual(m.voz.s.micro, "cerrado");
  // el guía
  const g = montaHabla({ papel: "guia", puede: true }); g.tic();
  g.ventana.oy.pointerdown.forEach(f => f({ target: g.caja() })); await espera(5); assert.strictEqual(g.voz.s.micro, "cerrado", "un toque en SU caja no abre solo: manda el botón");
  g.ventana.oy.pointerdown.forEach(f => f({ target: new El("canvas") })); await espera(5); assert.strictEqual(g.voz.s.micro, "abierto"); assert.deepStrictEqual(g.emitidos.filter(e => e[0] === "habla:micro").map(e => e[1].fuente), ["auto"]);
  g.boton().dispara("click"); await espera(); g.tic(); assert.strictEqual(g.voz.s.micro, "cerrado");
  g.ventana.oy.pointerdown.forEach(f => f({ target: new El("canvas") })); await espera(5); assert.strictEqual(g.voz.s.micro, "cerrado", "silenciado, no se reabre solo");
  assert.strictEqual(g.api.estado().autos, 1);
  // una familia con permiso nunca se abre sola
  const f = montaHabla({ puede: true }); f.tic(); f.ventana.oy.pointerdown.forEach(fn => fn({ target: new El("canvas") })); await espera(5); assert.strictEqual(f.voz.s.micro, "cerrado");
});

test("HablaMotor en VR: el gatillo izquierdo es el micro (pulsar o mantener) con un pulso del mando; una lámina de 3 s; la caja de pantalla se esconde; la fila del panel", async () => {
  const m = montaHabla({ puede: true }); m.tic(); const pulsos = [], pulso = (f, ms) => pulsos.push([f, ms]);
  m.VRX.on = true; m.tic();
  assert.strictEqual(m.caja().hidden, true, "en VR el DOM no se ve"); assert.strictEqual(m.VRX.voz.toma(), true);
  m.VRX.voz.mando(true, pulso); await espera(5);
  assert.strictEqual(m.voz.s.micro, "abierto"); m.n.oy["voz:estado"][0]({}); assert.deepStrictEqual(pulsos.at(-1), [0.4, 30], "háptica al abrir"); assert.ok(m.laminas["habla-micro"], "y una lámina que lo dice");
  m.VRX.voz.mando(true, pulso); m.VRX.voz.mando(false, pulso); assert.strictEqual(m.voz.s.micro, "abierto", "en pulsar, soltar no cierra");
  m.VRX.voz.mando(true, pulso); await espera(); m.n.oy["voz:estado"][0]({}); assert.strictEqual(m.voz.s.micro, "cerrado"); assert.deepStrictEqual(pulsos.at(-1), [0.2, 15], "háptica al cerrar");
  assert.deepStrictEqual(m.emitidos.filter(e => e[0] === "habla:micro").map(e => e[1].fuente), ["gatillo", "gatillo"]);
  m.tic(1); m.tic(1); assert.ok(m.laminas["habla-micro"], "aún no"); m.tic(1.5); assert.strictEqual(m.laminas["habla-micro"], undefined, "a los 3 s se cierra sola");
  // mantener: apretar abre, soltar cierra
  m.nuevoModo("mantener"); m.VRX.voz.mando(false, pulso); m.VRX.voz.mando(true, pulso); await espera(5); assert.strictEqual(m.voz.s.micro, "abierto");
  m.VRX.voz.mando(false, pulso); await espera(); assert.strictEqual(m.voz.s.micro, "cerrado");
  // se sale de VR con el gatillo apretado: se suelta solo
  m.VRX.voz.mando(true, pulso); await espera(5); assert.strictEqual(m.voz.s.micro, "abierto"); m.VRX.on = false; m.tic(); await espera(); assert.strictEqual(m.voz.s.micro, "cerrado");
  // sin permiso (familia sin palabra), el gatillo izquierdo NO es el micro: sigue siendo el de siempre (el rayo)
  const f = montaHabla({ puede: false }); f.tic(); f.VRX.on = true; assert.strictEqual(f.VRX.voz.toma(), false);
  f.VRX.voz.mando(true, pulso); await espera(); assert.deepStrictEqual(f.voz.llamadas, []);
  // la fila del panel («Ir a»): se ve en la guiada, con su estado y sus botones
  const fila = m.filas.find(x => x[0] === "ira" && x[1].id === "habla"); assert.ok(fila); assert.strictEqual(fila[1].visible(), true);
  m.nuevoModo("pulsar"); m.VRX.on = true;
  const bs = []; fila[1].botones((id, x, y, w, h, txt, fn, on) => bs.push({ id, w, h, txt, fn, on }), 0);
  assert.deepStrictEqual(bs.map(x => x.id), ["hMic", "hAur"]); assert.ok(bs.every(x => x.h >= 64)); assert.strictEqual(bs[0].txt, "Hablar");
  bs[0].fn(); await espera(5); assert.strictEqual(m.voz.s.micro, "abierto", "el botón del panel alterna (con el rayo no se puede mantener)");
  bs[1].fn(); assert.strictEqual(m.voz.s.auriculares, true);
  const f1 = fila[1].firma(); m.voz.s.micro = "cerrado"; assert.notStrictEqual(f1, fila[1].firma(), "la firma cambia con el estado: el panel se repinta");
  const g = montaHabla({ sala: "hituelo-libre" }); g.tic(); assert.strictEqual(g.filas[0][1].visible(), false, "fuera de la guiada, la fila no se ve");
});

test("HablaMotor: el botón mide ≥ 44 px (56 en el navegador de Quest), el ajuste «Hablar» se registra y lo que se escribe es texto; libera suelta todo", async () => {
  let m = montaHabla({ puede: true }); m.tic();
  assert.match(m.boton().style.cssText || "", /min-height:44px;min-width:44px/); assert.match(m.silencio().style.cssText, /min-height:44px/); assert.match(m.casilla().style.cssText, /width:22px/);
  m = montaHabla({ puede: true, ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.0 Chrome/126 Mobile Safari/537.36" }); m.tic();
  assert.match(m.boton().style.cssText, /min-height:56px;min-width:56px/); assert.strictEqual(m.api.estado().boton, 56);
  // el ajuste: prefijo «habla», una opción con las dos, válido para Ajustes de verdad
  m.tic(); m.tic(); assert.strictEqual(m.aplicas.length, 1, "se registra una sola vez");
  const a = m.aplicas[0]; assert.strictEqual(a.pref, "habla"); assert.deepStrictEqual(a.esq, { modo: { tipo: "opc", def: "pulsar", ops: ["pulsar", "mantener"] } });
  assert.deepStrictEqual(AjustesPuro.fusiona(a.pref, a.esq), []); assert.strictEqual(AjustesPuro.ESQUEMA["habla.modo"].def, "pulsar");
  assert.deepStrictEqual(a.pest.campos[0].ops.map(x => x[0]), ["pulsar", "mantener"]); assert.strictEqual(a.pest.t, "Hablar");
  // lo que llega nunca es HTML (el El de prueba lanza si alguien usa innerHTML) y los mensajes de la api van como texto
  const r = montaHabla({ respuestas: { POST: { __status: 409, mensaje: "<img src=x onerror=alert(1)>" } } }); r.tic(); r.boton().dispara("click"); await espera(); r.tic();
  assert.strictEqual(r.estado().children.length, 2, "dos hijos (icono y texto), ningún elemento nuevo"); assert.match(r.estado().textContent, /<img src=x/);
  // libera
  assert.ok(m.VRX.voz); m.api.libera(); assert.strictEqual(m.VRX.voz, null); assert.strictEqual(m.visor.children.length, 0); assert.strictEqual(m.ventana.__habla, undefined);
  m.limpias.forEach(f => { try { f(); } catch (e) {} }); assert.strictEqual((m.ventana.oy.keyup || []).length, 0, "los oyentes de la ventana, fuera"); assert.strictEqual(m.teclas.KeyT, undefined);
});

test("HablaMotor: la depuración dice el micro, el modo y la mano", () => {
  const m = montaHabla({ puede: false, manos: ["h_yo"] }); m.tic();
  const d = { lineas: [] }; m.n.oy["depura:lineas"][0](d); assert.match(d.lineas[0], /^habla · micro cerrado · modo pulsar · mano 1$/);
});

// ---------- el manifiesto, los eventos, la api «Guiada» y el enganche de 29_vr.js
test("el manifiesto, los eventos del catálogo y la api de la guiada: «habla-guiada» con su bandera, presupuesto y eventos", () => {
  const m = /Componentes\.registra\(\{([\s\S]*?)\n  \}\);/.exec(HAB)[1];
  assert.match(m, /id: "habla-guiada"/); assert.match(m, /bandera: \{ defecto: true, url: "habla" \}/); assert.match(m, /presupuesto: \{ llamadas: 1, triangulos: 2, texturasMB: 0\.4 \}/);
  assert.match(m, /consume: \["Voz", "Guiada"/);
  for (const e of ["habla:micro", "habla:mano"]) assert.deepStrictEqual(EVENTOS.eventos[e].emiten, ["47_habla"], e);
  for (const e of ["voz:estado", "guiada:palabra", "depura:lineas"]) assert.ok(EVENTOS.eventos[e].escuchan.includes("47_habla"), e);
  assert.deepStrictEqual(EVENTOS.eventos["habla:micro"].datos.properties.fuente.enum, ["boton", "tecla", "gatillo", "panel", "auto"]);
  // 46 da lo que 47 lee: quién eres, el evento y la cola
  assert.match(GUI, /expone: \["Guiada"\]/); assert.match(GUI, /return \{ evento: ev, yo: yoId,/);
  assert.deepStrictEqual(IFACES.apis_de_componentes["visita-guiada"], { modulo: "46_guiada.js", expone: "Guiada", miembros: ["tarde", "libera", "estado"] });
  assert.match(GUI, /return \{ tarde: tarde, libera: libera, estado: estado \};/);
  assert.match(HAB, /n\.api\("voz-guiada"\), n\.api\("visita-guiada"\)/);
});

test("29_vr.js: el gatillo izquierdo (botón 0) va a VRX.voz cada fotograma y, mientras es el micro, el selectstart de la mano izquierda no pulsa con el rayo", () => {
  assert.match(VRJS, /captura: null, voz: null,/);
  assert.match(VRJS, /if \(VRX\.voz\) VRX\.voz\.mando\(vrBoton\(L\.src, 0\), vrPulsoIzq\);/);
  assert.match(VRJS, /if \(VRX\.on && !\(o\.mano === "left" && VRX\.voz && VRX\.voz\.toma\(\)\)\) vrGatillo\(o\);/);
  assert.match(VRJS, /var vrPulsoIzq = function \(fuerza, ms\) \{ vrPulso\(vrMano\("left"\), fuerza, ms\); \};/);
  // el botón 0 del mando izquierdo no lo usa ningún otro gesto de 29_vr (el 1 es el grip: correr; el 3 la palanca; el 4 X; el 5 Y)
  const usos = [...VRJS.matchAll(/vrBoton\(L\.src, (\d+)\)/g)].map(x => x[1]).filter(k => k === "0"); assert.strictEqual(usos.length, 1);
});

test("T está libre en Teclas (nadie la tiene reservada ni registrada) y el componente no usa innerHTML, ni pide nada fuera de su origen, ni graba", () => {
  const nucleo = lee("apps/web/motor/02c_componentes.js"), reserv = /RESERVADAS = \{([\s\S]*?)\};/.exec(nucleo)[1];
  assert.ok(!/KeyT/.test(reserv), "KeyT no está reservada");
  const fs = require("node:fs"), dir = path.join(__dirname, "..", "..", "apps", "web", "motor");
  const quien = fs.readdirSync(dir).filter(f => /\.js$/.test(f) && /KeyT/.test(fs.readFileSync(path.join(dir, f), "utf8"))); assert.deepStrictEqual(quien, ["47_habla.js"], "solo 47_habla toca KeyT");
  const src = sinCabecera(HAB).replace(/\/\/.*$/gm, "");
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(src)); assert.ok(!/MediaRecorder|Egress|captureStream|getUserMedia/.test(src), "no toca el micrófono: lo abre Voz");
  for (const u of src.match(/fetch\(([^,]+)/g) || []) assert.match(u, /"\/api\/presencia\/guiadas\/"/, "solo su api, del mismo origen");
});
