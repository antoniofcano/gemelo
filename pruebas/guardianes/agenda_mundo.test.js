"use strict";
// La agenda dentro del mundo (OF11d; apps/web/motor/43_agenda.js), en Node y sin navegador:
//   · lo puro (AgendaPuro): rutas, lista blanca de la respuesta de GET /api/agenda, fechas, plazas, estado propio, qué se ofrece, textos de error, filas de VR;
//   · el componente con un DOM falso y la api simulada (fetch): la ventana enseña los próximos con sus plazas y tu estado, apunta con 1-10 personas, borra,
//     no ofrece nada si la sesión no puede inscribirse, nunca usa HTML (el título es un dato), y la fila del panel VR lista los próximos y dice dónde apuntarse.
// El registro del componente (con y sin él) y el catálogo de eventos los comprueba componentes.test.js; lo de Chrome está en agenda_mundo_chrome.test.js.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/43_agenda.js");
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return s.slice(i, f); };
const AP = new Function("\"use strict\";\n" + trozo(FUENTE, "// [puro:inicio]", "// [puro:fin]") + "\nreturn AgendaPuro;")();
const CUERPO = FUENTE.slice(FUENTE.indexOf("  function AgendaMotor"), FUENTE.indexOf("  // el manifiesto"));

const DIA = 86400000, AHORA = Date.now();
const iso = ms => new Date(ms).toISOString();
const ev = (id, extra) => Object.assign({ id, titulo: "Visita " + id, tipo: "guiada", descripcion: null, lugar: "El Cerro", finca: "cerro", haza: null, presencial: true,
  empieza_en: iso(AHORA + id * DIA), termina_en: null, plazas: 20, plazas_libres: 3, inscripcion_hasta: null, inscripcion_abierta: true, mia: null }, extra || {});
const AGENDA = () => ({ puede_inscribirse: true, eventos: [ev(1), ev(2, { mia: { estado: "apuntado", personas: 2 }, plazas_libres: 1 }), ev(3, { inscripcion_abierta: false, plazas_libres: 0, mia: { estado: "en_espera", personas: 4 } }), ev(4, { plazas: null, plazas_libres: null })] });

test("rutas y personas: solo con servidor, ids enteros, de 1 a 10", () => {
  assert.strictEqual(AP.rutaAgenda("/api/"), "/api/agenda"); assert.strictEqual(AP.rutaAgenda(null), null);
  assert.strictEqual(AP.rutaInscripcion("/api/", 7), "/api/agenda/7/inscripcion"); assert.strictEqual(AP.rutaInscripcion("/api/", "7/../x"), null); assert.strictEqual(AP.rutaInscripcion(null, 7), null); assert.strictEqual(AP.rutaInscripcion("/api/", 0), null);
  for (const v of [1, "1", 10, "10", "4"]) assert.ok(AP.personas(v) >= 1, String(v));
  for (const v of [0, 11, "", "x", 2.5, -1, null, undefined, "1e1"]) assert.strictEqual(AP.personas(v), null, String(v));
});

test("valida: lista blanca (lo de más no pasa), lo que no cuadra se descarta, ordena por fecha", () => {
  const j = AGENDA(); j.eventos[0].guia = "Ana"; j.eventos[0].creado_por = 9; j.hogar_id = 3;
  const d = AP.valida(j);
  assert.strictEqual(d.puede, true); assert.deepStrictEqual(d.eventos.map(e => e.id), [1, 2, 3, 4]);
  assert.deepStrictEqual(Object.keys(d.eventos[0]).sort(), ["abierta", "descripcion", "empieza", "entrada", "haza", "id", "libres", "lugar", "mia", "plazas", "presencial", "termina", "tipo", "titulo"]);
  assert.deepStrictEqual(d.eventos[1].mia, { estado: "apuntado", personas: 2 });
  const sucia = { puede_inscribirse: false, eventos: [ev(9), ev(9), ev(5, { titulo: "  " }), ev(6, { empieza_en: "mañana" }), ev(7, { plazas: -2 }), ev(8, { mia: { estado: "anulado", personas: 2 } }), ev(10, { mia: { estado: "apuntado", personas: 11 } }), null, 5, ev(11, { tipo: "otro-raro" }), ev(12, { id: 1.5 })] };
  const s = AP.valida(sucia); assert.deepStrictEqual(s.eventos.map(e => e.id), [9, 11]); assert.strictEqual(s.eventos[1].tipo, "evento"); assert.strictEqual(s.puede, false);
  for (const mal of [null, 3, {}, { puede_inscribirse: "si", eventos: [] }, { puede_inscribirse: true }, { puede_inscribirse: true, eventos: "x" }]) assert.strictEqual(AP.valida(mal), null, JSON.stringify(mal));
  assert.strictEqual(AP.valida({ puede_inscribirse: true, eventos: Array.from({ length: 80 }, (_, i) => ev(i + 1)) }).eventos.length, 50, "como mucho 50");
  assert.ok(AP.valida({ puede_inscribirse: true, eventos: [ev(1, { titulo: "x".repeat(500) })] }).eventos[0].titulo.length <= 120);
});

test("textos: fecha, plazas, estado propio, qué se ofrece y errores", () => {
  assert.match(AP.cuando(new Date(2026, 10, 7, 18, 5).getTime()), /^sáb 07\/11, 18:05$/);
  const e = AP.valida(AGENDA()).eventos;
  assert.strictEqual(AP.textoPlazas(e[0]), "Quedan 3 plazas"); assert.strictEqual(AP.textoPlazas(e[1]), "Queda 1 plaza"); assert.match(AP.textoPlazas(e[2]), /^Completo/); assert.strictEqual(AP.textoPlazas(e[3]), "Sin aforo");
  assert.strictEqual(AP.textoMia({ estado: "apuntado", personas: 2 }), "Estáis apuntados (2 personas)"); assert.strictEqual(AP.textoMia({ estado: "apuntado", personas: 1 }), "Estáis apuntados (1 persona)");
  assert.strictEqual(AP.textoMia({ estado: "en_espera", personas: 4 }), "En lista de espera (4 personas)"); assert.strictEqual(AP.textoMia(null), "");
  assert.deepStrictEqual(AP.ofrece(e[0], true), { apuntar: true, borrar: false }); assert.deepStrictEqual(AP.ofrece(e[1], true), { apuntar: false, borrar: true });
  assert.deepStrictEqual(AP.ofrece(e[2], true), { apuntar: false, borrar: true }, "en espera también puede borrarse");
  assert.deepStrictEqual(AP.ofrece(e[0], false), { apuntar: false, borrar: false }, "decisión 146: sin puede_inscribirse, nada");
  assert.deepStrictEqual(AP.ofrece({ abierta: false, mia: null }, true), { apuntar: false, borrar: false }, "cerrado: no se apunta");
  assert.strictEqual(AP.textoError(409, { mensaje: "Ya estáis apuntados." }), "Ya estáis apuntados."); assert.match(AP.textoError(403, null), /titular/); assert.match(AP.textoError(429, {}), /Demasiados/); assert.ok(AP.textoError(500, null));
  assert.ok(AP.textoError(409, { mensaje: "y".repeat(900) }).length <= 240);
});

test("filasVR: como mucho 3 próximos con su fecha y plazas, ya empezados fuera, y siempre «Apúntate desde el móvil o el ordenador»", () => {
  const d = AP.valida(AGENDA()), v = AP.filasVR(d, AHORA, 3);
  assert.strictEqual(v.filas.length, 3); assert.strictEqual(v.nota, "Apúntate desde el móvil o el ordenador");
  assert.ok(/Visita 1/.test(v.filas[0].t) && /Quedan 3 plazas/.test(v.filas[0].s)); assert.ok(/Estáis apuntados \(2 personas\)/.test(v.filas[1].s));
  assert.strictEqual(AP.filasVR(d, AHORA + 2.5 * DIA, 3).filas.length, 2, "los que ya empezaron salen de la lista");
  assert.strictEqual(AP.filasVR(d, AHORA + 99 * DIA, 3).vacia, true); assert.strictEqual(AP.filasVR(null, AHORA, 3), null);
});

// ---------- el componente con un DOM falso y la api simulada
class Nodo {
  constructor(tag) { this.tag = tag; this.style = { cssText: "" }; this.hijos = []; this.attrs = {}; this.oyentes = {}; this._t = ""; this.value = ""; }
  appendChild(c) { this.hijos.push(c); c.padre = this; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(ev, fn) { (this.oyentes[ev] = this.oyentes[ev] || []).push(fn); }
  set textContent(v) { this._t = v; if (v === "") this.hijos = []; }
  get textContent() { return this._t + this.hijos.map(h => h.textContent).join("\n"); }
  busca(f, out) { out = out || []; if (f(this)) out.push(this); this.hijos.forEach(h => h.busca(f, out)); return out; }
  clic() { (this.oyentes.click || []).forEach(fn => fn({})); }
}
function monta({ prefijo = "/api/", respuestas, conPanel = true, P = null }) {
  const llamadas = [], bus = {}, emitidos = [], filas = [], ventanas = {}, iconos = [];
  const fetchAnt = globalThis.fetch;
  globalThis.fetch = (url, o) => {
    const m = (o && o.method) || "GET"; llamadas.push({ m, url, cuerpo: o && o.body ? JSON.parse(o.body) : null });
    let r; try { r = respuestas(m, url, o); } catch (e) { return Promise.reject(e); }
    return Promise.resolve({ status: r.status, json: () => (r.cuerpo === undefined ? Promise.reject(new Error("sin cuerpo")) : Promise.resolve(r.cuerpo)) });
  };
  const nada = () => {}, win = {};
  const g = { D: { base: "/teselas/x" }, ConfigPuro: { prefijoApi: () => prefijo }, location: { search: "" }, window: win,
    document: { createElement: tag => new Nodo(tag) },
    Ventanas: { registra: (id, d) => { ventanas[id] = d; const c = new Nodo("div"); d.construye(c); ventanas[id].cuerpo = c; return nada; } },
    Hud: { icono: d => { iconos.push(d); return nada; } }, PanelVR: conPanel ? { filas: (p, d) => { filas.push({ p, d }); return nada; }, repinta: nada } : undefined };
  // la presencia de verdad, por el Bus (OF11e): solo si hay `P` en ?presencia=red escucha guiada:entrar (Bus.hay) y contesta con guiada:entrada
  const hayPresencia = !!(P && P.estado().variante === "red");
  g.Bus = { hay: ev => ev === "guiada:entrar" && hayPresencia };
  const n = { on: (e, fn) => { bus[e] = fn; }, limpia: nada,
    emite: (e, d) => { emitidos.push([e, d]); if (e === "guiada:entrar" && hayPresencia) Promise.resolve(P.entraGuiada(d.evento)).then(ok => bus["guiada:entrada"]({ evento: d.evento, ok: !!ok, mensaje: ok ? "" : P.avisoGuiada() })); } };
  const api = new Function("AgendaPuro", "n", "g", "\"use strict\";\nvar D = g.D, ConfigPuro = g.ConfigPuro, location = g.location, window = g.window, document = g.document, Ventanas = g.Ventanas, Hud = g.Hud, Bus = g.Bus, PanelVR = g.PanelVR;\n" + CUERPO + "\nreturn AgendaMotor(n);")(AP, n, g);
  return { api, llamadas, bus, emitidos, filas, ventanas, iconos, win, restaura: () => { globalThis.fetch = fetchAnt; } };
}
const J = (status, cuerpo) => ({ status, cuerpo });

test("sin servidor no se monta nada: ni icono, ni ventana, ni fila de VR, ni petición", () => {
  const m = monta({ prefijo: null, respuestas: () => { throw new Error("no debe pedir nada"); } });
  try { assert.strictEqual(m.api, null); assert.deepStrictEqual(Object.keys(m.ventanas), []); assert.strictEqual(m.iconos.length, 0); assert.strictEqual(m.filas.length, 0); assert.strictEqual(m.llamadas.length, 0); } finally { m.restaura(); }
});

test("la ventana «Agenda»: próximos con plazas y tu estado; apuntar con N personas, borrar, y recarga la verdad del servidor", async () => {
  let estado = AGENDA();
  const m = monta({ respuestas: (met, url, o) => {
    if (met === "GET") return J(200, estado);
    if (met === "POST") { estado.eventos[0].mia = { estado: "apuntado", personas: JSON.parse(o.body).personas }; return J(201, { estado: "apuntado", personas: JSON.parse(o.body).personas, plazas_libres: 0 }); }
    estado.eventos[1].mia = null; return J(204, undefined);
  } });
  try {
    assert.deepStrictEqual(m.iconos.map(i => [i.id, i.ventana]), [["agenda", "agenda"]]); assert.strictEqual(m.llamadas.length, 0, "no pide nada hasta que se abre (un 401 sin sesión ensuciaría la consola)");
    await m.api.carga();
    const cu = m.ventanas.agenda.cuerpo, txt = cu.textContent;
    assert.strictEqual(m.llamadas[0].url, "/api/agenda"); assert.deepStrictEqual(m.emitidos, [["agenda:cambia", { proximos: 4, puede_inscribirse: true }]]);
    for (const f of ["Visita 1", "Quedan 3 plazas", "Estáis apuntados (2 personas)", "En lista de espera (4 personas)", "inscripción cerrada", "Sin aforo", "El Cerro"]) assert.ok(txt.includes(f), "la ventana enseña «" + f + "»");
    const apuntar = cu.busca(x => "data-apunta" in x.attrs), borrar = cu.busca(x => "data-borra" in x.attrs);
    assert.deepStrictEqual(apuntar.map(b => b.attrs["data-apunta"]), ["1", "4"], "solo apunta donde se puede: abierto y sin estar ya"); assert.deepStrictEqual(borrar.map(b => b.attrs["data-borra"]), ["2", "3"]);
    const sel = cu.busca(x => x.tag === "select")[0]; assert.strictEqual(sel.hijos.length, 10); assert.deepStrictEqual(sel.hijos.map(o => o.value), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    sel.value = "4"; apuntar[0].clic(); await new Promise(r => setTimeout(r, 20));
    const post = m.llamadas.find(c => c.m === "POST"); assert.strictEqual(post.url, "/api/agenda/1/inscripcion"); assert.deepStrictEqual(post.cuerpo, { personas: 4 });
    assert.ok(m.llamadas.filter(c => c.m === "GET").length >= 2, "tras apuntar, recarga"); assert.ok(m.ventanas.agenda.cuerpo.textContent.includes("Estáis apuntados (4 personas)"));
    assert.ok(m.ventanas.agenda.cuerpo.textContent.includes("¡Apuntados a «Visita 1»!"), "dice el resultado");
    m.ventanas.agenda.cuerpo.busca(x => x.attrs["data-borra"] === "2")[0].clic(); await new Promise(r => setTimeout(r, 20));
    const del = m.llamadas.find(c => c.m === "DELETE"); assert.strictEqual(del.url, "/api/agenda/2/inscripcion"); assert.ok(!m.ventanas.agenda.cuerpo.textContent.includes("Visita 2\n" + "") || !m.ventanas.agenda.cuerpo.busca(x => x.attrs["data-borra"] === "2").length, "ya no hay «Borrarnos» en el 2");
    assert.ok(m.ventanas.agenda.cuerpo.textContent.includes("Os habéis borrado de «Visita 2»."));
  } finally { m.restaura(); }
});

test("sin puede_inscribirse (gafas vinculadas): se ve todo, no hay un solo botón y dice dónde apuntarse; un error de la api se cuenta", async () => {
  const m = monta({ respuestas: () => J(200, { ...AGENDA(), puede_inscribirse: false }) });
  try {
    await m.api.carga(); const cu = m.ventanas.agenda.cuerpo;
    assert.strictEqual(cu.busca(x => x.tag === "button").length, 0); assert.ok(cu.textContent.includes("Apúntate desde el móvil o el ordenador")); assert.ok(cu.textContent.includes("Visita 1"));
  } finally { m.restaura(); }
  let primera = true;
  const q = monta({ respuestas: met => met === "GET" ? J(200, AGENDA()) : J(409, { error: "ya_inscrito", mensaje: "Ya estáis apuntados (o en la lista de espera)." }) });
  try {
    await q.api.carga(); q.ventanas.agenda.cuerpo.busca(x => "data-apunta" in x.attrs)[0].clic(); await new Promise(r => setTimeout(r, 20));
    assert.ok(q.ventanas.agenda.cuerpo.textContent.includes("Ya estáis apuntados (o en la lista de espera)."), "el 409 se cuenta con la frase de la api");
  } finally { q.restaura(); }
  assert.ok(primera);
});

test("sin sesión (401), error de red o respuesta rara: un mensaje claro, sin romper nada y sin fila de VR", async () => {
  for (const [r, esperado] of [[() => J(401, { error: "sin_sesion" }), "Entra con tu enlace"], [() => J(500, {}), "No se ha podido cargar"], [() => J(200, { eventos: 3 }), "No se ha podido cargar"], [() => { throw new Error("red"); }, "No se ha podido cargar"]]) {
    const m = monta({ respuestas: r });
    try { await m.api.carga(); assert.ok(m.ventanas.agenda.cuerpo.textContent.includes(esperado), m.ventanas.agenda.cuerpo.textContent); assert.strictEqual(m.filas[0].d.visible(), false); assert.deepStrictEqual(m.emitidos, []); } finally { m.restaura(); }
  }
});

test("el título que llega de la api es un dato: texto, nunca HTML", async () => {
  const malo = '<img src=x onerror="alert(1)"><b>';
  const m = monta({ respuestas: () => J(200, { puede_inscribirse: true, eventos: [ev(1, { titulo: malo, lugar: "<script>x</script>" })] }) });
  try {
    await m.api.carga(); const h3 = m.ventanas.agenda.cuerpo.busca(x => x.tag === "h3")[0];
    assert.strictEqual(h3._t, malo); assert.ok(m.ventanas.agenda.cuerpo.busca(x => x.tag === "img" || x.tag === "script").length === 0);
  } finally { m.restaura(); }
  const sin = FUENTE.replace(/\/\/.*$/gm, "");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|createElement\("style"\)/.test(sin), "el componente no usa HTML ni <style> (CSP)");
});

test("la fila del panel VR (pestaña Mundo): visible con datos, lista los próximos y dice dónde apuntarse; sin botones; se refresca al entrar en VR", async () => {
  const m = monta({ respuestas: () => J(200, AGENDA()) });
  try {
    const f = m.filas.find(x => x.p === "mundo" && x.d.id === "agenda"); assert.ok(f, "la fila existe"); assert.strictEqual(f.d.visible(), false, "sin datos, escondida"); const pulsables = []; f.d.botones((id, x, y, w, h, t) => pulsables.push(t), 0); assert.deepStrictEqual(pulsables, [], "sin visita abierta, nada que pulsar en VR (decisión 146)");
    assert.ok(f.d.alto > 0 && f.d.alto <= 300, "cabe en el panel: " + f.d.alto);
    assert.strictEqual(m.llamadas.length, 0); m.bus["vr:entra"](); await new Promise(r => setTimeout(r, 20)); assert.strictEqual(m.llamadas.length, 1, "al entrar en VR pide la agenda");
    assert.strictEqual(f.d.visible(), true);
    const ops = [], cx = { measureText: s => ({ width: String(s).length * 12 }), fillText: (s, x, y) => ops.push(s) }, h = { fila: s => ops.push(s) };
    f.d.pinta(cx, 100, 1024, h); const todo = ops.join(" | ");
    assert.ok(todo.includes("Agenda") && /Visita 1/.test(todo) && /Quedan 3 plazas/.test(todo) && todo.includes("Apúntate desde el móvil o el ordenador"), todo);
    assert.strictEqual(ops.filter(s => /^[a-zé]{3} \d\d\/\d\d, \d\d:\d\d · Visita/.test(s) || /Visita \d$/.test(s)).length <= 3, true, "como mucho 3 próximos");
    const f1 = f.d.firma(); assert.ok(f1.length > 0); assert.strictEqual(f.d.firma(), f1, "firma estable");
    assert.ok(f.d.debug().agenda.filas.length === 3);
  } finally { m.restaura(); }
  const sinPanel = monta({ respuestas: () => J(200, AGENDA()), conPanel: false });
  try { assert.ok(sinPanel.api, "sin panel VR (fuera de VR) la ventana sigue funcionando"); } finally { sinPanel.restaura(); }
});

// ---------- OF11e: «Entrar en la visita»
const MIN = 60000;
const guiada = (id, ini, extra) => ev(id, Object.assign({ empieza_en: iso(AHORA + ini), mia: { estado: "apuntado", personas: 2 } }, extra || {}));
const conEntrada = (e, d, h) => Object.assign(e, { entrada: { desde: iso(AHORA + d), hasta: iso(AHORA + h) } });

test("OF11e puro: solo guiada o directo y dentro de la ventana de la api; sin ella, la del contrato solo para la familia apuntada; nunca para la que está en espera", () => {
  const w = (e, ahora) => AP.puedeEntrar(AP.valida({ puede_inscribirse: true, eventos: [e] }).eventos[0], ahora);
  const c = conEntrada(guiada(1, 30 * MIN), -45 * MIN, 120 * MIN);    // la de la api manda (guía u oficina: 60 min antes)
  assert.strictEqual(w(c, AHORA), true); assert.strictEqual(w(c, AHORA - 46 * MIN), false); assert.strictEqual(w(c, AHORA + 121 * MIN), false);
  assert.strictEqual(w(conEntrada(guiada(1, 30 * MIN, { tipo: "cata" }), -45 * MIN, 120 * MIN), AHORA), false, "una cata no tiene sala");
  assert.strictEqual(w(conEntrada(guiada(1, 30 * MIN, { tipo: "directo" }), -45 * MIN, 120 * MIN), AHORA), true);
  const sin = guiada(2, 20 * MIN);   // api antigua, sin `entrada`: contrato, 15 min antes
  assert.strictEqual(w(sin, AHORA), false); assert.strictEqual(w(sin, AHORA + 5 * MIN), true, "a menos de 15 min");
  assert.strictEqual(w(Object.assign(guiada(2, 20 * MIN), { termina_en: iso(AHORA + 80 * MIN) }), AHORA + 109 * MIN), true, "hasta 30 min tras el fin");
  assert.strictEqual(w(Object.assign(guiada(2, 20 * MIN), { termina_en: iso(AHORA + 80 * MIN) }), AHORA + 111 * MIN), false);
  assert.strictEqual(w(guiada(2, -10 * MIN, { termina_en: null }), AHORA + 3 * 3600000 - 10 * MIN + 29 * MIN), true, "sin fin: 3 h + 30 min");
  assert.strictEqual(w(guiada(3, 5 * MIN, { mia: { estado: "en_espera", personas: 2 } }), AHORA), false, "en espera: nada");
  assert.strictEqual(w(guiada(3, 5 * MIN, { mia: null }), AHORA), false, "sin apuntar y sin ventana de la api: nada");
  assert.strictEqual(AP.valida({ puede_inscribirse: true, eventos: [ev(1, { entrada: { desde: "x", hasta: "y" } }), ev(2, { entrada: { desde: iso(AHORA), hasta: iso(AHORA - MIN) } })] }).eventos.every(e => e.entrada === null), true, "ventanas raras, fuera");
});

test("OF11e puro (propiedad): puedeEntrar es exactamente desde <= ahora <= hasta, y una guiada en curso sigue visible mientras la sala esté abierta", () => {
  const fc = require("fast-check");
  fc.assert(fc.property(fc.integer({ min: -600, max: 600 }), fc.integer({ min: 1, max: 600 }), fc.integer({ min: -900, max: 900 }), (d, largo, ahora) => {
    const e = AP.valida({ puede_inscribirse: true, eventos: [conEntrada(guiada(1, d * MIN + 15 * MIN), d * MIN, (d + largo) * MIN)] }).eventos[0], t = AHORA + ahora * MIN;
    const dentro = t >= AHORA + d * MIN && t <= AHORA + (d + largo) * MIN;
    return AP.puedeEntrar(e, t) === dentro && (!dentro || AP.visibles([e], t).length === 1);
  }), { numRuns: 300 });
});

test("OF11e: la ventana enseña el botón solo dentro de la ventana, pide entrar por el Bus (la presencia llama a entraGuiada) y dice que ya estáis; la guiada en curso sigue en la lista", async () => {
  const llamadas = []; let dentro = null;
  const P = { estado: () => ({ variante: "red" }), entraGuiada: id => { llamadas.push(id); dentro = id; return Promise.resolve(true); }, evento: () => dentro, avisoGuiada: () => "" };
  const agenda = { puede_inscribirse: true, eventos: [conEntrada(guiada(1, -20 * MIN), -35 * MIN, 100 * MIN), conEntrada(guiada(2, 3 * 3600000), 3 * 3600000 - 15 * MIN, 5 * 3600000), guiada(3, 5 * MIN, { tipo: "cata" })] };
  const m = monta({ respuestas: () => J(200, agenda), P });
  try {
    await m.api.carga(); const cu = m.ventanas.agenda.cuerpo;
    assert.ok(cu.textContent.includes("Visita 1"), "ya empezó pero la sala sigue abierta: se ve");
    assert.deepStrictEqual(cu.busca(x => "data-entra" in x.attrs).map(b => b.attrs["data-entra"]), ["1"], "solo la abierta, no la de dentro de 3 h ni la cata");
    assert.ok(cu.busca(x => x.tag === "button" && x.textContent === "Entrar en la visita").length === 1);
    cu.busca(x => "data-entra" in x.attrs)[0].clic(); await new Promise(r => setTimeout(r, 20));
    assert.deepStrictEqual(llamadas, [1]); assert.ok(m.ventanas.agenda.cuerpo.textContent.includes("Estáis en la visita guiada «Visita 1»."));
    assert.strictEqual(m.ventanas.agenda.cuerpo.busca(x => "data-entra" in x.attrs).length, 0, "ya dentro: sin botón"); assert.strictEqual(m.ventanas.agenda.cuerpo.busca(x => "data-en-visita" in x.attrs).length, 1);
  } finally { m.restaura(); }
});

test("OF11e: si la api no deja entrar (403 guiada_solo_inscritos, 409 guiada_cerrada) se enseña su frase, tal cual y como texto", async () => {
  for (const frase of ["Esta visita es para las familias apuntadas.", "La visita guiada ha terminado: el guía ha cerrado la sala. <b>x</b>"]) {
    const P = { estado: () => ({ variante: "red" }), entraGuiada: () => Promise.resolve(false), evento: () => null, avisoGuiada: () => frase };
    const m = monta({ respuestas: () => J(200, { puede_inscribirse: true, eventos: [conEntrada(guiada(1, 5 * MIN), -10 * MIN, 100 * MIN)] }), P });
    try {
      await m.api.carga(); m.ventanas.agenda.cuerpo.busca(x => "data-entra" in x.attrs)[0].clic(); await new Promise(r => setTimeout(r, 20));
      assert.strictEqual(m.ventanas.agenda.cuerpo.busca(x => "data-nota" in x.attrs)[0].textContent, frase);
      assert.strictEqual(m.ventanas.agenda.cuerpo.busca(x => "data-entra" in x.attrs).length, 1, "puede volver a intentarlo");
      assert.strictEqual(m.api.datos().eventos.length, 1);
    } finally { m.restaura(); }
  }
});

test("OF11e: sin la presencia de verdad (?presencia=red) no hay botón, ni en pantalla ni en VR; la api sin `entrada` y sin apuntarse tampoco da ventana", async () => {
  const agenda = { puede_inscribirse: true, eventos: [conEntrada(guiada(1, 5 * MIN), -10 * MIN, 100 * MIN)] };
  for (const P of [null, { estado: () => ({ variante: "sim" }), entraGuiada: () => { throw new Error("no debe"); }, evento: () => null }]) {
    const m = monta({ respuestas: () => J(200, agenda), P });
    try {
      await m.api.carga(); assert.strictEqual(m.ventanas.agenda.cuerpo.busca(x => "data-entra" in x.attrs).length, 0);
      const f = m.filas.find(x => x.d.id === "agenda"), b = []; f.d.botones((id, x, y, w, h, t) => b.push(t), 0); assert.deepStrictEqual(b, []);
    } finally { m.restaura(); }
  }
});

test("OF11e VR: la fila del panel tiene su botón «Entrar en la visita» solo con una visita abierta, llama a entraGuiada, y deja sitio (2 filas) y firma que cambia", async () => {
  const llamadas = [], P = { estado: () => ({ variante: "red" }), entraGuiada: id => { llamadas.push(id); return Promise.resolve(true); }, evento: () => null, avisoGuiada: () => "" };
  const abierta = { puede_inscribirse: true, eventos: [conEntrada(guiada(1, -5 * MIN), -20 * MIN, 100 * MIN), guiada(2, DIA), guiada(3, 2 * DIA)] };
  const m = monta({ respuestas: () => J(200, abierta), P });
  try {
    const f = m.filas.find(x => x.d.id === "agenda"); const firmaAntes = f.d.firma();
    m.bus["vr:entra"](); await new Promise(r => setTimeout(r, 20));
    assert.notStrictEqual(f.d.firma(), firmaAntes);
    const bs = []; f.d.botones((id, x, y, w, h, t, fn) => bs.push({ id, x, y, w, h, t, fn }), 100);
    assert.strictEqual(bs.length, 1); assert.strictEqual(bs[0].t, "Entrar en la visita"); assert.ok(bs[0].h >= 64 && bs[0].y + bs[0].h <= 100 + f.d.alto, "cabe en la fila");
    assert.strictEqual(f.d.debug().agenda.filas.length, 2, "una fila menos para el botón"); assert.deepStrictEqual(f.d.debug().agenda.entrar, { id: 1, titulo: "Visita 1" });
    bs[0].fn(); await new Promise(r => setTimeout(r, 20)); assert.deepStrictEqual(llamadas, [1]);
    const ops = [], cx = { measureText: s => ({ width: String(s).length * 12 }), fillText: s => ops.push(s) }; f.d.pinta(cx, 100, 1024, { fila: s => ops.push(s) });
    assert.ok(ops.some(s => /^Abierta: Visita 1/.test(s)));
  } finally { m.restaura(); }
});
