"use strict";
// Entidades y usables (apps/web/motor/02e_entidades.js, ADR-0023 C7): el registro de tipos de cosas del mundo con id estable y la selección única para el
// toque, el clic, el rayo de VR y la cercanía, con su ficha común y su anillo de resaltado. En Node y sin navegador: la parte pura (ids, validación, quién
// gana por tipo y por distancia, cercanía) y, con un DOM, un Bus y un THREE de mentira, el registro (sin duplicados, quitar), la selección por tipo, la
// ficha común (#ficha con textContent y sus acciones), los eventos usable:* y que el anillo se crea al elegir y se libera. Chrome: escena3d, vr, vr_gente.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/02e_entidades.js");
function trozo(ini, fin) {
  const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin);
  assert.ok(i >= 0 && f > i, "02e_entidades.js debe marcar " + ini + " … " + fin);
  return FUENTE.slice(i, f);
}
const P = new Function("\"use strict\";\n" + trozo("// [puro:inicio]", "// [puro:fin]") + "\nreturn EntidadesPuro;")();

test("puro: ids «tipo:resto», tipo y resto", () => {
  assert.strictEqual(P.id("olivo", "cerro", 2147483650), "olivo:cerro:2147483650");
  assert.strictEqual(P.tipoDe("olivo:cerro:7"), "olivo"); assert.strictEqual(P.resto("olivo:cerro:7"), "cerro:7");
  assert.strictEqual(P.tipoDe("sin-dos-puntos"), ""); assert.strictEqual(P.tipoDe(null), ""); assert.strictEqual(P.tipoDe(":x"), "");
});

test("puro: validación de un tipo", () => {
  const ok = { tipo: "olivo", dueno: "06_arboles", prioridad: 10, ficha() {}, pantalla() {} };
  assert.deepStrictEqual(P.valida(ok), []);
  assert.ok(P.valida(null).length === 1);
  assert.ok(P.valida({ tipo: "Mal", dueno: "", prioridad: "x" }).length >= 4, "tipo, dueño, prioridad y ficha");
  assert.ok(P.valida(Object.assign({}, ok, { rayo: 3 })).some(e => /^rayo/.test(e)));
  assert.ok(P.valida(Object.assign({}, ok, { cerca() {} })).some(e => /radioCerca/.test(e)), "con cerca, su radio");
  assert.ok(P.valida({ tipo: "x", dueno: "m", prioridad: 0, ficha() {} }).some(e => /nadie podría/.test(e)), "sin forma de llegar a ella");
});

test("puro: al tocar gana el tipo de más prioridad y dentro de él el más de lleno; lo de fondo solo si no hay otro", () => {
  const c = [{ id: "olivo:a", prioridad: 10, s: 0.1 }, { id: "baliza:b", prioridad: 20, s: 0.9 }, { id: "haza:h", prioridad: 0, fondo: true, s: 0 }];
  assert.strictEqual(P.gana(c, "toque").id, "baliza:b", "la baliza antes que el olivo aunque esté más al borde (como antes de C7)");
  assert.strictEqual(P.gana([c[0], { id: "olivo:z", prioridad: 10, s: 0.05 }], "toque").id, "olivo:z", "dentro del tipo, el más de lleno");
  assert.strictEqual(P.gana([c[2]], "toque").id, "haza:h", "la haza si no hay nada delante");
  assert.strictEqual(P.gana([c[2], c[0]], "toque").id, "olivo:a", "un olivo tapa la haza");
  assert.strictEqual(P.gana([], "toque"), null); assert.strictEqual(P.gana([{ id: "" }], "toque"), null);
});

test("puro: con el rayo gana lo primero por el rayo; a menos de 0,5 m, la prioridad", () => {
  const o = { id: "olivo:a", prioridad: 10, t: 12, s: 0.2 }, b = { id: "baliza:b", prioridad: 20, t: 40, s: 0.1 };
  assert.strictEqual(P.gana([o, b], "rayo").id, "olivo:a", "el olivo delante de la columna");
  assert.strictEqual(P.gana([o, Object.assign({}, b, { t: 8 })], "rayo").id, "baliza:b", "la columna delante del olivo");
  assert.strictEqual(P.gana([o, Object.assign({}, b, { t: 12.3 })], "rayo").id, "baliza:b", "a la vez: la prioridad");
});

test("puro: cercanía dentro del radio de cada tipo y las dos líneas de una ficha pequeña", () => {
  assert.deepStrictEqual(P.cercano([{ id: "baliza:a", d: 20, radio: 17 }, { id: "baliza:b", d: 9, radio: 17 }, { id: "baliza:c", d: 12, radio: 17 }]), { id: "baliza:b", d: 9, radio: 17 });
  assert.strictEqual(P.cercano([{ id: "baliza:a", d: 17, radio: 17 }]), null, "en el borde, fuera (d < radio, como antes)");
  const f = { filas: [1, 2, 3, 4, 5].map(i => ({ k: "k" + i, v: "v" + i })) };
  assert.deepStrictEqual(P.lineas(f), ["k1: v1 · k2: v2 · k3: v3", "k4: v4 · k5: v5"]);
  assert.deepStrictEqual(P.lineas({ lineas: ["a"] }), ["a"]);
});

// ---------- el motor con un DOM, un Bus y un THREE de mentira
function el(tag) {
  const e = { tagName: tag, hidden: false, children: [], attrs: {}, style: {}, oyentes: {}, _t: "", parent: null,
    get textContent() { return this._t + this.children.map(c => c.textContent).join(""); }, set textContent(v) { this._t = String(v); this.children = []; },
    appendChild(c) { c.parent = this; this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, f) { (this.oyentes[t] = this.oyentes[t] || []).push(f); }, dispara(t, ev) { (this.oyentes[t] || []).forEach(f => f(ev || { target: this })); },
    closest(sel) { let x = this; while (x) { if (sel === "button[data-accion]" && x.tagName === "button" && "data-accion" in x.attrs) return x; x = x.parent; } return null; } };
  e.style.cssText = ""; return e;
}
function mundo(o) {
  o = o || {};
  const ids = { ficha: el("div"), fichaTitulo: el("h3"), fichaDatos: el("dl"), cerrarFicha: el("button") }; ids.ficha.hidden = true;
  const documento = { createElement: t => el(t) };
  const busca = (x, id) => { if (x.id === id) return x; for (const c of x.children) { const r = busca(c, id); if (r) return r; } return null; };
  const $ = id => ids[id] || busca(ids.ficha, id);
  const reg = { eventos: [], creadas: [], liberadas: [], escena: new Set(), errores: [] };
  const Bus = { emite: (ev, d) => { reg.eventos.push([ev, d]); return 0; } };
  const recurso = tipo => class { constructor() { this.tipo = tipo; reg.creadas.push(this); } dispose() { reg.liberadas.push(this); } rotateX() { return this; } };
  const THREE = { RingGeometry: recurso("geometria"), MeshBasicMaterial: recurso("material"),
    Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.visible = true; const v = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }); this.position = v(); this.scale = v(); } } };
  const scene = { add: x => reg.escena.add(x), remove: x => reg.escena.delete(x) };
  const lienzo = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const VRX = { on: false }, pp = { x: 0, y: 0 }, dr = { x: 0, y: 0 };
  const f = new Function("THREE", "scene", "lienzo", "$", "document", "Bus", "VRX", "pp", "dr", "console",
    "\"use strict\";\nvar paseando = false, enDron = false; function __pon(k, v) { if (k === 'paseando') paseando = v; if (k === 'enDron') enDron = v; }\n" +
    trozo("// [puro:inicio]", "// [puro:fin]") + trozo("// [motor:inicio]", "// [motor:fin]") + "\nreturn { Entidades, Usables, __pon };");
  const r = f(THREE, scene, lienzo, $, documento, Bus, VRX, pp, dr, { error: (...a) => reg.errores.push(a.join(" ")) });
  return Object.assign(r, { reg, ids, VRX, pp, dr });
}
// tipos de prueba: olivos (prioridad 10, pantalla y rayo), balizas (20, recuadro propio, cercanía) y hazas (fondo)
function tipos(m, bajo) {
  const usadas = [];
  const olivo = { tipo: "olivo", dueno: "06_arboles", prioridad: 10, pantalla: () => bajo.olivo || null, rayo: () => bajo.olivoR || null,
    pos: () => ({ x: 1, y: 2, z: 3 }), radio: () => 2, ficha: id => ({ titulo: "Olivo " + id.split(":")[2], filas: [{ k: "Altura", v: "4,5 m" }, { k: "Haza", v: "<b>x</b>", de: "oficina" }] }) };
  const baliza = { tipo: "baliza", dueno: "19_balizas", prioridad: 20, sinAnillo: true, pantalla: () => bajo.baliza || null, rayo: () => bajo.balizaR || null,
    cerca: (x, y) => ({ id: "baliza:p1", d: Math.hypot(x - 10, y) }), radioCerca: 17, forzada: null, abierta() { return this.forzada; },
    muestra(id) { this.forzada = id; return true; }, suelta() { this.forzada = null; }, cierra() { this.forzada = null; },
    ficha: id => ({ titulo: "Baliza · " + id, acciones: [{ id: "bir", txt: "Ir a esta baliza", fn: () => { usadas.push(id); } }] }) };
  const haza = { tipo: "haza", dueno: "13b_hazas", prioridad: 0, fondo: true, pantalla: () => bajo.haza || null, ficha: () => ({ titulo: "Haza", filas: [{ k: "Ficha", v: "leyendo…" }] }) };
  const quitas = [olivo, baliza, haza].map(d => m.Entidades.registra(d));
  return { olivo, baliza, haza, quitas, usadas };
}
const evs = (m, pre) => m.reg.eventos.filter(e => e[0].startsWith(pre || "usable:"));

test("registro: un dueño por tipo, definiciones malas fuera, quitar suelta lo elegido de ese tipo", () => {
  const m = mundo(), bajo = { olivo: { id: "olivo:cerro:7", s: 0.2 } }, t = tipos(m, bajo);
  assert.ok(t.quitas.every(q => typeof q === "function"));
  assert.deepStrictEqual(m.Entidades.tipos(), ["olivo", "baliza", "haza"]);
  assert.strictEqual(m.Entidades.registra({ tipo: "olivo", dueno: "otro", prioridad: 1, ficha() {}, pantalla() {} }), null, "dos dueños para un tipo, nunca");
  assert.strictEqual(m.Entidades.registra({ tipo: "x" }), null); assert.strictEqual(m.reg.errores.length, 2);
  assert.strictEqual(m.Entidades.de("olivo:cerro:7"), t.olivo); assert.strictEqual(m.Entidades.de("nada:1"), null);
  assert.strictEqual(m.Entidades.lista("olivo").length, 0); assert.strictEqual(m.Entidades.lista("persona"), null, "sin ese tipo: null");
  m.Usables.toque(5, 5); assert.strictEqual(m.Usables.elegido(), "olivo:cerro:7");
  t.quitas[0](); assert.deepStrictEqual(m.Entidades.tipos(), ["baliza", "haza"]);
  assert.strictEqual(m.Usables.elegido(), null); assert.deepStrictEqual(evs(m, "usable:suelta").pop()[1], { id: "olivo:cerro:7", motivo: "quitada" });
  assert.ok(m.ids.ficha.hidden, "su ficha se cierra");
  t.quitas[0](); assert.deepStrictEqual(m.Entidades.tipos(), ["baliza", "haza"], "quitar dos veces no hace nada");
});

test("selección por tipo: la ficha común en #ficha (texto llano), la baliza en su recuadro, la haza solo sobre nada, y tocar nada lo suelta", () => {
  const m = mundo(), bajo = {}, t = tipos(m, bajo);
  bajo.olivo = { id: "olivo:cerro:7", s: 0.3 }; bajo.haza = { id: "haza:h1", s: 0 };
  assert.strictEqual(m.Usables.toque(10, 10), "olivo:cerro:7", "el olivo tapa la haza");
  assert.strictEqual(m.ids.ficha.hidden, false); assert.strictEqual(m.ids.fichaTitulo.textContent, "Olivo 7");
  const dl = m.ids.fichaDatos.children; assert.deepStrictEqual(dl.map(c => c.tagName), ["dt", "dd", "dt", "dd"]);
  assert.strictEqual(dl[3].textContent, "<b>x</b>oficina", "el valor va como texto (nunca HTML) y su procedencia debajo");
  assert.deepStrictEqual(evs(m).pop(), ["usable:elige", { id: "olivo:cerro:7", tipo: "olivo", como: "toque" }]);
  bajo.baliza = { id: "baliza:p1", s: 0.9 };
  assert.strictEqual(m.Usables.toque(10, 10), "baliza:p1", "la baliza antes que el olivo");
  assert.strictEqual(t.baliza.forzada, "baliza:p1", "la abre en su recuadro"); assert.strictEqual(m.ids.ficha.hidden, false, "la ficha del olivo sigue (como antes)");
  assert.deepStrictEqual(evs(m).slice(-2).map(e => e[0]), ["usable:suelta", "usable:elige"]);
  bajo.baliza = null; bajo.olivo = null;
  assert.strictEqual(m.Usables.toque(10, 10), "haza:h1"); assert.strictEqual(m.ids.fichaTitulo.textContent, "Haza");
  assert.strictEqual(t.baliza.forzada, null, "elegir otra cosa suelta la baliza forzada");
  bajo.haza = null;
  assert.strictEqual(m.Usables.toque(10, 10), null); assert.ok(m.ids.ficha.hidden); assert.strictEqual(m.Usables.elegido(), null);
  assert.deepStrictEqual(evs(m).pop(), ["usable:suelta", { id: "haza:h1", motivo: "nada" }]);
});

test("acciones: botones bajo la ficha común, usa() hace la acción y lo dice; la × cierra y suelta", () => {
  const m = mundo(), t = tipos(m, {});
  m.Entidades.registra({ tipo: "persona", dueno: "26_presencia", prioridad: 30, lista: () => [{ id: "persona:a1", alias: "Ana" }], pos: () => ({ x: 0, y: 0, z: 0 }),
    ficha: id => ({ titulo: "Ana", filas: [{ k: "Va", v: "a pie" }], acciones: [{ id: "ir", txt: "Ir con Ana", fn: () => { t.usadas.push(id); return true; } }, { id: "no", txt: "No", fn: () => false }] }) });
  assert.ok(m.Usables.elige("persona:a1", "codigo"));
  const ac = m.ids.ficha.children.find(c => c.id === "fichaAcciones");
  assert.ok(ac && !ac.hidden && ac.children.length === 2, "dos botones de acción"); assert.strictEqual(ac.children[0].textContent, "Ir con Ana");
  ac.dispara("click", { target: ac.children[0] });
  assert.deepStrictEqual(t.usadas, ["persona:a1"]); assert.deepStrictEqual(evs(m).pop(), ["usable:usa", { id: "persona:a1", accion: "ir" }]);
  assert.strictEqual(m.Usables.usa("persona:a1", "no"), false, "una acción que no se pudo hacer no se anuncia");
  assert.strictEqual(m.Usables.usa("persona:a1", "inventada"), false);
  m.ids.cerrarFicha.dispara("click");
  assert.ok(m.ids.ficha.hidden); assert.strictEqual(m.Usables.elegido(), null); assert.deepStrictEqual(evs(m).pop(), ["usable:suelta", { id: "persona:a1", motivo: "cerrada" }]);
  m.Usables.elige("olivo:cerro:1"); assert.ok(ac.hidden, "una ficha sin acciones esconde los botones");
  m.Usables.mensaje("Hazas", [{ k: "Aquí", v: "No estás dentro de ninguna haza." }]);
  assert.strictEqual(m.ids.fichaTitulo.textContent, "Hazas"); assert.strictEqual(m.Usables.elegido(), null, "un mensaje no es una entidad");
});

test("VR: el presentador pinta las fichas sin acciones; abierta() da la elegida con acciones o la que un tipo tiene abierta; el rayo no suelta al aire", () => {
  const m = mundo(), bajo = {}, t = tipos(m, bajo), pintadas = [];
  const quita = m.Usables.presentador("vr", f => pintadas.push(f)); m.VRX.on = true;
  bajo.olivoR = { id: "olivo:cerro:3", t: 12, s: 0.2 }; bajo.balizaR = { id: "baliza:p1", t: 40, s: 0.1 };
  assert.strictEqual(m.Usables.rayo({}), "olivo:cerro:3"); assert.strictEqual(pintadas.length, 1); assert.strictEqual(pintadas[0].titulo, "Olivo 3");
  assert.ok(m.ids.ficha.hidden, "en VR la ficha de la pantalla no se abre");
  assert.strictEqual(m.Usables.abierta(), null, "el olivo no tiene acciones");
  bajo.balizaR.t = 5; assert.strictEqual(m.Usables.rayo({}), "baliza:p1"); assert.strictEqual(m.Usables.abierta(), "baliza:p1", "la baliza, abierta por su tipo");
  bajo.olivoR = null; bajo.balizaR = null; assert.strictEqual(m.Usables.rayo({}), null); assert.strictEqual(m.Usables.elegido(), "baliza:p1", "apretar al aire no suelta");
  m.Usables.cierra("baliza:p1"); assert.strictEqual(m.Usables.abierta(), null); assert.strictEqual(m.Usables.elegido(), null);
  quita(); m.Usables.elige("olivo:cerro:3"); assert.strictEqual(pintadas.length, 1, "sin presentador no se pinta nada");
});

test("cercanía: solo paseando, dentro del radio, cada 0,1 s, con usable:cerca al cambiar", () => {
  const m = mundo(), t = tipos(m, {});
  m.pp.x = 0; m.Usables.actualiza(0.2); assert.strictEqual(m.Usables.cercano(), null, "en la órbita, nada");
  m.__pon("paseando", true); m.pp.x = -20; m.Usables.actualiza(0.2); assert.strictEqual(m.Usables.cercano(), null, "a 30 m de la baliza: fuera de sus 17 m");
  m.pp.x = 0.5; m.Usables.actualiza(0.2);
  assert.deepStrictEqual(m.Usables.cercano(), { id: "baliza:p1", d: 9.5 });
  m.Usables.actualiza(0.2); m.Usables.actualiza(0.2);
  assert.strictEqual(evs(m, "usable:cerca").length, 1, "un aviso al entrar, no uno por fotograma");
  m.pp.x = 40; m.Usables.actualiza(0.016); assert.strictEqual(m.Usables.cercano().id, "baliza:p1", "se mira cada 0,1 s, no en cada fotograma");
  m.Usables.actualiza(0.09); assert.strictEqual(m.Usables.cercano(), null, "pasados 0,1 s, ya sí");
  m.pp.x = 0.5; m.Usables.actualiza(0.2);
  m.pp.x = 40; m.Usables.actualiza(0.2); assert.strictEqual(m.Usables.cercano(), null); assert.deepStrictEqual(evs(m, "usable:cerca").pop()[1], { id: null });
  m.__pon("enDron", true); m.dr.x = 12; m.Usables.actualiza(0.2); assert.strictEqual(m.Usables.cercano().id, "baliza:p1", "con el dron cuenta el dron");
  void t;
});

test("el anillo: se crea al elegir algo que lo lleva, se esconde al soltar, no sale con la baliza y se libera entero", () => {
  const m = mundo(), bajo = {}, t = tipos(m, bajo);
  assert.strictEqual(m.reg.creadas.length, 0, "sin elegir nada no se crea nada");
  m.Usables.elige("olivo:cerro:9"); assert.strictEqual(m.reg.creadas.length, 2, "una geometría y un material"); assert.ok(m.Usables.estado().anillo);
  m.Usables.elige("baliza:p1"); assert.ok(!m.Usables.estado().anillo, "la baliza ya se ve sola");
  m.Usables.elige("olivo:cerro:9"); m.Usables.suelta("nada"); assert.ok(!m.Usables.estado().anillo);
  m.Usables.elige("olivo:cerro:9"); assert.strictEqual(m.reg.creadas.length, 2, "se reusa");
  m.Usables.libera(); assert.strictEqual(m.reg.liberadas.length, 2); assert.strictEqual(m.reg.escena.size, 0);
  void t;
});

test("complementa: un componente añade filas y acciones a la ficha de un tipo ajeno (P7f), se quita, y su fallo no tira la ficha", () => {
  const m = mundo(), bajo = { olivo: { id: "olivo:cerro:7", s: 0.2 } }, t = tipos(m, bajo), usadas = [];
  const quita = m.Entidades.complementa("olivo", (f, id, modo) => { f.filas.unshift({ k: "Nombre", v: "El abuelo (" + modo + ")" }); f.acciones = [{ id: "nombrar", txt: "Nombrar", fn: () => { usadas.push(id); } }]; });
  m.Entidades.complementa("olivo", () => { throw new Error("falla a propósito"); });
  const f = m.Entidades.ficha("olivo:cerro:7", "pantalla");
  assert.deepStrictEqual(f.filas[0], { k: "Nombre", v: "El abuelo (pantalla)" }); assert.strictEqual(f.filas.length, 3); assert.strictEqual(m.reg.errores.length, 1, "el fallo se cuenta, no se propaga");
  assert.strictEqual(m.Entidades.ficha("olivo:cerro:7", "vr").filas[0].v, "El abuelo (vr)", "recibe el modo");
  assert.strictEqual(m.Entidades.ficha("baliza:p1").filas, undefined, "solo el tipo pedido");
  m.Usables.toque(5, 5); const btn = m.ids.ficha.children.find(c => c.id === "fichaAcciones");
  assert.deepStrictEqual(btn.children.map(b => b.textContent), ["Nombrar"], "su acción sale como botón de la ficha común");
  assert.strictEqual(m.Usables.usa("olivo:cerro:7", "nombrar"), true); assert.deepStrictEqual(usadas, ["olivo:cerro:7"]);
  quita(); const g = m.Entidades.ficha("olivo:cerro:7", "pantalla"); assert.strictEqual(g.acciones, undefined, "quitado el complemento, la ficha vuelve a ser la del tipo"); assert.strictEqual(g.filas[0].k, "Altura");
  assert.strictEqual(typeof m.Entidades.complementa(7, 7), "function", "lo que no vale no hace nada"); void t;
});

test("presupuesto: lo que corre por fotograma (Usables.actualiza) no lanza rayos ni proyecta: solo la cercanía cada 0,1 s y el anillo", () => {
  const i = FUENTE.indexOf("    function actualiza(dt) {"), f = FUENTE.indexOf("\n    }\n", i), cuerpo = FUENTE.slice(i, f);
  assert.ok(i > 0 && f > i, "Usables.actualiza(dt)");
  assert.doesNotMatch(cuerpo, /Raycaster|setFromCamera|intersect|project\(|"rayo"|"pantalla"/, "ni rayos ni proyecciones por fotograma");
  assert.match(cuerpo, /tCerca >= 0\.1/, "la cercanía, cada 0,1 s");
  const fin = lee("apps/web/motor/90_final.js");
  assert.match(fin, /Usables\.actualiza\(dt\)/, "el bucle la llama");
  assert.doesNotMatch(fin, /Usables\.(toque|rayo)\(/, "el bucle no elige nada");
});
