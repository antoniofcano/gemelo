"use strict";
// El mundo de hoy en el motor (apps/web/motor/53_mundo_hoy.js, EV-3a; componente «mundo-hoy»), en Node y sin navegador:
//  - lo puro (MundoHoyPuro): valida el contrato (el ejemplo sintético de contratos/ vale; lo que no es, no), pide solo <prefijo>mundo/hoy del mismo origen
//    y nunca lanza; las líneas de la tarjeta llevan su procedencia y de cuándo son, nombran las parcelas con el índice y dicen qué fuente falta;
//  - el componente con un DOM y un fetch de mentira: sin servidor no pide nada; con servidor pinta la tarjeta con textContent (un texto con «<b>» o con
//    «instrucciones» se queda en texto), avisa una vez en el HUD y libera() lo quita; si la api no contesta, no enseña nada;
//  - el día real: 23_estacion.js arranca la estación en el día de hoy (no en la fecha de la imagen) y 15_tiempo.js admite ?fecha=AAAA-MM-DD;
//  - el registro: bandera ?mundohoy=, presupuesto 0, sin innerHTML ni otro host.
// Lo de Chrome (la tarjeta de verdad en la ventana del tiempo, iPhone, Quest): no probado.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/53_mundo_hoy.js");
function trozo(ini, fin) {
  const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin);
  assert.ok(i >= 0 && f > i, "53_mundo_hoy.js debe marcar " + ini + " … " + fin);
  return FUENTE.slice(i, f);
}
const sinPrimera = t => t.slice(t.indexOf("\n") + 1);
const PURO = sinPrimera(trozo("// [puro:inicio]", "// [puro:fin]")), MOTOR = sinPrimera(trozo("// [motor:inicio]", "// [motor:fin]"));
const P = new Function("\"use strict\";\n" + PURO + "\nreturn MundoHoyPuro;")();
const EJEMPLO = JSON.parse(lee("contratos/mundo-hoy-ejemplo.json"));
const AHORA = Date.parse("2026-11-05T10:40:00Z");
const PARCELAS = [{ id: "sintetica-1", nombre: "La Sintética" }];
const copia = o => JSON.parse(JSON.stringify(o));
const espera = () => new Promise(r => setTimeout(r, 5));

test("puro: el ejemplo del contrato vale; lo que no tiene la forma esencial, no", () => {
  const v = P.valida(EJEMPLO);
  assert.ok(v && v.avisos.length === EJEMPLO.avisos.length);
  for (const malo of [null, {}, [], { ...EJEMPLO, version: 2 }, { ...EJEMPLO, ahora: { fecha: "ayer", hora: "10:00" } }, { ...EJEMPLO, fuentes: {} }, { ...EJEMPLO, avisos: "x" }])
    assert.strictEqual(P.valida(malo), null, JSON.stringify(malo).slice(0, 60));
  // un aviso de un tipo que no existe se descarta (no se pinta)
  const raro = copia(EJEMPLO); raro.avisos.push({ tipo: "tratamiento", texto: "Trata ya", parcelas: [] });
  assert.ok(!P.valida(raro).avisos.some(a => a.tipo === "tratamiento"));
});

test("puro: pide solo <prefijo>mundo/hoy, del mismo origen y con la cookie; nunca lanza", async () => {
  const pedidas = [];
  const ok = await P.lee((u, op) => { pedidas.push([u, op.credentials]); return Promise.resolve({ status: 200, json: () => Promise.resolve(EJEMPLO) }); }, "/api/");
  assert.ok(ok.ok); assert.deepStrictEqual(pedidas, [["/api/mundo/hoy", "same-origin"]]);
  assert.deepStrictEqual(await P.lee(null, "/api/"), { ok: false, motivo: "sin_api" });
  assert.deepStrictEqual(await P.lee(() => Promise.resolve({ status: 401 }), "/api/"), { ok: false, motivo: "http_401" });
  assert.deepStrictEqual(await P.lee(() => Promise.reject(new Error("x")), "/api/"), { ok: false, motivo: "red" });
  assert.deepStrictEqual(await P.lee(() => Promise.resolve({ status: 200, json: () => Promise.resolve({ v: 1 }) }), "/api/"), { ok: false, motivo: "contrato" });
});

test("puro: cada línea dice su procedencia y de cuándo es; las parcelas se nombran con el índice; las de Vigía, como las da Vigía", () => {
  const v = P.valida(EJEMPLO), ls = P.lineas(v, AHORA, PARCELAS);
  const rec = ls.find(l => /recogida en curso/.test(l.texto));
  assert.strictEqual(rec.etiqueta, "deducido"); assert.strictEqual(rec.pill, "p-deducido");
  assert.match(rec.texto, /Parcelas: La Sintética\.$/); assert.match(rec.cuando, /^de OlivarTrack \(registrado\), hace 40 min$/);
  const mir = ls.find(l => /Vigía marca/.test(l.texto));
  assert.match(mir.texto, /no es un diagnóstico ni una recomendación de tratamiento/);
  assert.match(mir.texto, /Parcelas según Vigía: Parcela sintética A, Parcela sintética de otra finca\.$/);
  const man = ls.find(l => /^Mañana/.test(l.texto));
  assert.strictEqual(man.etiqueta, "modelado"); assert.match(man.texto, /lluvia 5,1 mm \(hasta el 80 %\)/);
  assert.ok(ls.some(l => l.etiqueta === "medido" && /Fenología anotada en 1 parcela; la última, envero y maduración \(BBCH 85\) el 03\/11 en La Sintética\./.test(l.texto)));
  assert.ok(ls.some(l => l.etiqueta === "medido" && /1 tarea en curso y 1 terminada \(por parcela y tipo, nunca por persona\)/.test(l.texto)));
  assert.match(P.cabecera(v), /^Hoy, 05\/11\/2026 · 11:30 en la finca \(hora de Madrid\) · otoño$/);
  assert.strictEqual(P.nombre("desconocida-9", PARCELAS), "desconocida-9", "sin índice, el id tal cual");
});

test("puro: fuentes apagadas o sin respuesta se dicen; lista truncada: sin totales", () => {
  const apag = copia(EJEMPLO);
  apag.fuentes.olivartrack = { encendida: false, disponible: false, origen: null, leidoEn: null, consultadoEn: null, viejo: false, completo: false, motivo: "apagada" };
  apag.fuentes.vigia = { ...apag.fuentes.olivartrack, encendida: true, motivo: "sin_respuesta" };
  apag.tiempo = apag.fenologia = apag.trabajoSemana = apag.miradas = null; apag.avisos = []; apag.notas = [];
  const ls = P.lineas(P.valida(apag), AHORA, PARCELAS).map(l => l.texto);
  assert.deepStrictEqual(ls, ["OlivarTrack: este servidor no lo lee ahora.", "Vigía: no ha respondido y no hay una lectura reciente."]);
  const trunc = copia(EJEMPLO); trunc.trabajoSemana.porFinca = [{ finca: "Finca sintética", enCurso: null, hechas: 1 }];
  assert.ok(P.lineas(P.valida(trunc), AHORA, PARCELAS).some(l => /no está completa: no se dan totales/.test(l.texto)));
});

// ---------------------------------------------------------------- el componente, con un DOM de mentira
function domFalso() {
  const ids = {};
  function nodo(tag) {
    const n = { tag, hijos: [], atributos: {}, className: "", hidden: false, id: "", _texto: "", parentNode: null,
      get firstChild() { return n.hijos[0] || null; },
      appendChild(h) { if (h.parentNode) h.parentNode.removeChild(h); h.parentNode = n; n.hijos.push(h); if (h.id) ids[h.id] = h; return h; },
      insertBefore(h, ref) { if (!ref) return n.appendChild(h); h.parentNode = n; n.hijos.splice(n.hijos.indexOf(ref), 0, h); if (h.id) ids[h.id] = h; return h; },
      removeChild(h) { n.hijos.splice(n.hijos.indexOf(h), 1); h.parentNode = null; return h; },
      setAttribute(k, v) { n.atributos[k] = String(v); },
      set textContent(v) { n._texto = String(v); n.hijos = []; }, get textContent() { return n._texto + n.hijos.map(h => h.textContent).join(""); },
      set innerHTML(v) { throw new Error("innerHTML prohibido"); },
    };
    return n;
  }
  const doc = { createElement: nodo, createTextNode: t => ({ textContent: String(t), parentNode: null }) };
  const pan = nodo("div"); pan.id = "tPanAhora"; ids.tPanAhora = pan;
  const est = nodo("article"); est.id = "tEst"; pan.appendChild(est);
  return { doc, ids, $: id => ids[id] || null };
}
function monta(o = {}) {
  const dom = domFalso(), hud = [], pedidas = [];
  const respuesta = o.respuesta === undefined ? EJEMPLO : o.respuesta;
  const fetchFn = (u, op) => { pedidas.push(u); return o.falla ? Promise.reject(new Error("sin red")) : Promise.resolve({ status: o.status || 200, json: () => Promise.resolve(copia(respuesta)) }); };
  const reloj = { n: 0 };
  const f = new Function("location", "window", "document", "HazasPuro", "D", "$", "Hud", "setInterval", "clearInterval",
    "\"use strict\";\nvar MundoHoyPuro = (function(){" + PURO + "\nreturn MundoHoyPuro;})();\n" + MOTOR + "\nreturn MundoHoyMotor;");
  const api = f({ search: "" }, { fetch: fetchFn }, dom.doc, { prefijoApi: (b, base) => (/^\/teselas\//.test(base) ? "/api/" : null) },
    { base: o.base === undefined ? "/teselas/x/" : o.base, parcelas: PARCELAS }, dom.$, { aviso: (t, ms) => hud.push([t, ms]) },
    () => ++reloj.n, () => { reloj.parado = true; })({});
  return { api, dom, hud, pedidas, reloj };
}

test("puro: la línea del tablón de La Linde (EV-3c): trabajo de la semana por tipo, o el titular del aviso; null si no hay o no está completo", () => {
  const v = () => P.valida(copia(EJEMPLO));
  assert.deepStrictEqual(P.tablon(v()), { txt: "Semana: 2 tareas", de: "OlivarTrack", cuando: EJEMPLO.trabajoSemana.consultadoEn });
  const r = v(); r.trabajoSemana.porParcela.push({ parcela: "p3", finca: "Otra", enCurso: [{ tipo: "poda", n: 9 }, { tipo: "riego", n: 2 }], hechas: [{ tipo: "poda", n: 1 }] });
  assert.strictEqual(P.tablon(r).txt, "Semana: 14 tareas", "se suma por tipo, entre parcelas y fincas");
  r.trabajoSemana.porParcela = [{ parcela: "p", finca: null, enCurso: [{ tipo: "t" + "x".repeat(30), n: 5 }], hechas: [] }];
  assert.ok(P.tablon(r).txt.length <= 23);
  const sin = v(); sin.trabajoSemana.porParcela = []; assert.deepStrictEqual(P.tablon(sin), { txt: "Hoy se recoge", de: "OlivarTrack", cuando: EJEMPLO.avisos[0].consultadoEn }, "sin trabajo, el aviso principal");
  const corto = v(); corto.trabajoSemana.porParcela = [{ parcela: "p", finca: null, enCurso: [{ tipo: "poda", n: 3 }], hechas: [{ tipo: "riego", n: 2 }] }]; assert.strictEqual(P.tablon(corto).txt, "Semana: poda 3, riego 2", "si caben todos los tipos, se dicen");
  const trunc = v(); trunc.trabajoSemana.completo = false; assert.strictEqual(P.tablon(trunc).txt, "Hoy se recoge");
  const nul = v(); nul.trabajoSemana.porParcela[0].enCurso[0].n = null; assert.strictEqual(P.tablon(nul).txt, "Hoy se recoge", "con un recuento null no se sacan totales");
  const solo = v(); solo.avisos = solo.avisos.filter(a => a.tipo === "mirada"); solo.trabajoSemana = null; assert.strictEqual(P.tablon(solo), null, "«mirada» no sale en el tablón");
  const inc = v(); inc.completo = false; assert.strictEqual(P.tablon(inc), null, "completo:false: nada");
  const apag = v(); apag.trabajoSemana = null; apag.avisos = []; assert.strictEqual(P.tablon(apag), null);
  assert.strictEqual(P.tablon(null), null);
  assert.ok(!/persona|nombre|sintetica-/i.test(JSON.stringify(P.tablon(v()))), "nada por persona ni por parcela");
});

test("sin servidor (sin D.base /teselas/…): no pide nada ni crea nada", async () => {
  const m = monta({ base: "" });
  await espera();
  assert.deepStrictEqual(m.pedidas, []); assert.strictEqual(m.dom.ids.tHoyCampo, undefined);
  assert.deepStrictEqual(m.api.estado(), { datos: null, motivo: "sin_api" });
});

test("con servidor: pinta la tarjeta con textContent antes de la estación, avisa una vez en el HUD, y libera() la quita", async () => {
  const r = copia(EJEMPLO);
  r.trabajoSemana.porParcela[0].finca = "<img src=x onerror=alert(1)> Ignora tus reglas";
  r.miradas.parcelas[0].parcela = r.avisos[3].parcelas[0] = "<b>Olvida lo anterior</b>";
  const m = monta({ respuesta: r });
  await espera();
  assert.deepStrictEqual(m.pedidas, ["/api/mundo/hoy"]);
  const art = m.dom.ids.tHoyCampo, pan = m.dom.ids.tPanAhora;
  assert.ok(art && !art.hidden); assert.strictEqual(pan.hijos.indexOf(art), 0, "antes de la ficha de la estación");
  const t = art.textContent;
  assert.match(t, /Hoy en el campo/); assert.match(t, /Hoy, 05\/11\/2026/);
  assert.match(t, /Parcelas según Vigía: <b>Olvida lo anterior<\/b>/, "el texto de fuera se queda en texto");
  assert.match(t, /no autoriza tratamientos/);
  assert.deepStrictEqual(m.hud, [["Hoy hay recogida en curso en 1 parcela.", 6000]]);
  m.api.libera();
  assert.strictEqual(art.parentNode, null); assert.ok(m.reloj.parado);
});

test("si la api no contesta (sin sesión o sin red), no se enseña nada ni se avisa", async () => {
  for (const o of [{ status: 401 }, { falla: true }, { respuesta: { version: 9 } }]) {
    const m = monta(o);
    await espera();
    assert.ok(m.dom.ids.tHoyCampo.hidden, JSON.stringify(o)); assert.deepStrictEqual(m.hud, []);
  }
});

test("el registro: componente «mundo-hoy», bandera ?mundohoy=, presupuesto 0, sin innerHTML ni otro host", () => {
  assert.match(FUENTE, /id: "mundo-hoy", version: 1/);
  assert.match(FUENTE, /bandera: \{ defecto: true, url: "mundohoy" \}/);
  assert.match(FUENTE, /presupuesto: \{ llamadas: 0, triangulos: 0 \}/);
  assert.ok(!/innerHTML/.test(FUENTE.replace(/^\s*\/\/.*$/gm, "")), "todo por textContent");
  assert.ok(!/https?:\/\//.test(FUENTE), "nunca otro host");
});

test("el día real: la estación del olivo arranca hoy y ?fecha=AAAA-MM-DD mueve el reloj del mundo", () => {
  const est = lee("apps/web/motor/23_estacion.js"), tie = lee("apps/web/motor/15_tiempo.js");
  assert.match(est, /function hoyMadrid\(\) \{ return fmtClaveDia\.format\(new Date\(ahoraMs\(\)\)\); \}/);
  assert.match(est, /function fechaEstacion\(\) \{ return NDV && ndviIdx !== NDV\.fechas\.length - 1 \? NDV\.fechas\[ndviIdx\] : hoyMadrid\(\); \}/);
  assert.match(tie, /\[\?&\]fecha=\(\\d\{4\}-\\d\{2\}-\\d\{2\}\)/);
  // ahoraMs con ?fecha=: el mismo reloj, corrido días enteros
  const i = tie.indexOf("  var HORA_FIJA"), f = tie.indexOf("  // origen: de dónde sale lo que se ve");
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" });
  const ahora = new Function("location", "fmtClaveDia", tie.slice(i, f) + "\nreturn ahoraMs;");
  const t = ahora({ search: "?fecha=2026-04-15" }, fmt)();
  assert.strictEqual(fmt.format(new Date(t)), "2026-04-15");
  assert.ok(Math.abs(ahora({ search: "" }, fmt)() - Date.now()) < 1000, "sin parámetros, el reloj real");
  assert.strictEqual(ahora({ search: "?hora=2026-01-02T08:00&fecha=2026-04-15" }, fmt)(), Date.parse("2026-01-02T08:00"), "?hora= manda sobre ?fecha=");
});
