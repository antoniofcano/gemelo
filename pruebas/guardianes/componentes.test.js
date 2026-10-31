"use strict";
// Componentes del mundo (ADR-0023, doc/sistema/COMPONENTES.md): el núcleo (apps/web/motor/02c_componentes.js), los manifiestos de los componentes, el
// catálogo de eventos (contratos/eventos.json) y la configuración del servidor (contratos/config.schema.json). En Node, sin navegador:
//   · ComponentesPuro (validar, ordenar, encender) y el Bus, evaluados tal cual;
//   · el registro de verdad con componentes de mentira: ciclo de vida, fases, apagado por error, configuración en caliente, teclas;
//   · cada fichero componente: su manifiesto válido (presupuesto y libera), consume resuelto y sin ciclos, presupuestos dentro del de diseño, eventos
//     iguales en el manifiesto, en el código y en el catálogo, y que no expone nada a los demás ni consume de otro componente;
//   · «quitar funciona»: el motor sin cada componente es JavaScript válido, nadie lo nombra, y en Node arranca con él, sin él y apagado.
// Lo de Chrome («con y sin» por el banco: llamadas y memoria) va en carga, escena3d, fichas_tiempo y las vr*, no aquí.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, ejecuta, os, fs, path } = require("./_util");
const vm = require("vm");
const Ajv2020 = require("ajv/dist/2020").default;
const contratoModulos = require(path.join(RAIZ, "pruebas", "contrato_modulos.js"));

const MOTOR = path.join(RAIZ, "apps", "web", "motor");
const NUCLEO = lee("apps/web/motor/02c_componentes.js");
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini + " … " + fin); return s.slice(i, f); };
const PURO = trozo(NUCLEO, "// [puro:inicio]", "// [puro:fin]");
const { ComponentesPuro: P, Bus: BusPuro } = new Function("\"use strict\";\n" + PURO + "\nreturn { ComponentesPuro, Bus };")();
const json = f => JSON.parse(lee(f));
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
const ESQ_EV = json("contratos/eventos.schema.json"), CATALOGO = json("contratos/eventos.json"), ESQ_CFG = json("contratos/config.schema.json");
const PRESUPUESTO = json("pruebas/presupuesto.json");

const ficherosMotor = () => fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).sort();
const sinCabecera = s => s.startsWith(contratoModulos.MARCA_I) ? s.slice(s.indexOf(contratoModulos.MARCA_F) + contratoModulos.MARCA_F.length + 1) : s;
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
const esComponente = f => /^  Componentes\.registra\(\{/m.test(fs.readFileSync(path.join(MOTOR, f), "utf8"));
const COMPONENTES = ficherosMotor().filter(esComponente);

function manifiesto(def = {}) {
  return Object.assign({ id: "x", consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, actualiza: {}, monta: () => ({}), libera: () => {} }, def);
}

// ---------- el trozo puro
test("el manifiesto: lo que vale y lo que no (presupuesto y libera obligatorios, fases conocidas con su función)", () => {
  assert.deepStrictEqual(P.valida(manifiesto()), []);
  assert.deepStrictEqual(P.valida(manifiesto({ fases: { tarde: 0.5, mundo: 0 }, actualiza: { tarde() {}, mundo() {} }, cultivo: "olivar", version: 2, bandera: { defecto: false, url: "cosa2" } })), []);
  const mal = {
    "sin libera": { libera: undefined }, "sin presupuesto": { presupuesto: undefined }, "presupuesto negativo": { presupuesto: { llamadas: -1, triangulos: 0 } },
    "fase desconocida": { fases: { luego: 1 }, actualiza: { luego() {} } }, "fase sin función": { fases: { tarde: 1 } }, "función sin fase": { actualiza: { mundo() {} } },
    "id con mayúsculas": { id: "Fichas" }, "bandera sin defecto": { bandera: {} }, "url rara": { bandera: { defecto: true, url: "a-b" } }, "consume no es lista": { consume: "TiempoVivo" },
    "sin monta": { monta: undefined }, "eventos mal": { eventos: { escucha: "x" } }
  };
  for (const [k, v] of Object.entries(mal)) assert.notDeepStrictEqual(P.valida(manifiesto(v)), [], "debería fallar: " + k);
});

test("el orden de montaje: quien consume lo que otro expone va después; los ciclos se detectan", () => {
  const a = manifiesto({ id: "a", expone: ["A"] }), b = manifiesto({ id: "b", consume: ["A"], expone: ["B"] }), c = manifiesto({ id: "c", consume: ["B", "TiempoVivo"] });
  const o = P.orden([c, b, a]);
  assert.deepStrictEqual(o.orden, ["a", "b", "c"]); assert.deepStrictEqual(o.ciclos, []);
  const x = manifiesto({ id: "x", consume: ["Y"], expone: ["X"] }), y = manifiesto({ id: "y", consume: ["X"], expone: ["Y"] });
  assert.ok(P.orden([x, y]).ciclos.length > 0, "x ↔ y es un ciclo");
});

test("encendido: URL > servidor > defecto del manifiesto", () => {
  const d = manifiesto({ id: "fichas-tiempo", bandera: { defecto: true, url: "fichas" } });
  assert.deepStrictEqual(P.encendido(d, "", null), { activo: true, origen: "defecto" });
  assert.deepStrictEqual(P.encendido(d, "?a=1", { "fichas-tiempo": { activo: false } }), { activo: false, origen: "servidor" });
  assert.deepStrictEqual(P.encendido(d, "?debug&fichas=1", { "fichas-tiempo": { activo: false } }), { activo: true, origen: "url" });
  assert.deepStrictEqual(P.encendido(d, "?fichas=0", null), { activo: false, origen: "url" });
  for (const [q, v] of [["?fichas", true], ["?fichas=no", false], ["?fichas=sí", true], ["?x=1&fichas=off#a", false], ["?fichasx=0", undefined], ["?fichas=quizá", undefined]]) assert.strictEqual(P.valorUrl(q, "fichas"), v, q);
  assert.deepStrictEqual(P.encendido(manifiesto({ bandera: { defecto: false } }), "?x=1", {}), { activo: false, origen: "defecto" });
});

test("la configuración del servidor: contratos/config.schema.json y validaConfig del motor dicen lo mismo; el ejemplo vale", () => {
  const v = ajv.compile(ESQ_CFG), ej = json("contratos/config-ejemplo.json");
  assert.ok(v(ej), JSON.stringify(v.errors)); assert.deepStrictEqual(P.validaConfig(ej.componentes), []);
  const casos = [[{ a: { activo: true } }, true], [{ a: { activo: "si" } }, false], [{ a: {} }, false], [{ A: { activo: true } }, false], [{ a: { activo: true, otro: 1 } }, false],
    [{ a: { activo: false, parametros: { n: 1 } } }, true], [{ a: { activo: false, parametros: [1] } }, false]];
  for (const [c, ok] of casos) {
    assert.strictEqual(v({ v: 1, componentes: c }), ok, "esquema: " + JSON.stringify(c));
    assert.strictEqual(P.validaConfig(c).length === 0, ok, "motor: " + JSON.stringify(c));
  }
});

test("el Bus: on devuelve quita, emite cuenta oyentes, hay; un oyente que falla no corta a los demás", () => {
  const vistos = [], err = console.error; console.error = () => {};
  try {
    const q1 = BusPuro.on("a:b", d => vistos.push("1" + d)), q2 = BusPuro.on("a:b", () => { throw new Error("x"); }); BusPuro.on("a:b", d => vistos.push("3" + d));
    assert.ok(BusPuro.hay("a:b")); assert.strictEqual(BusPuro.emite("a:b", "!"), 3); assert.deepStrictEqual(vistos, ["1!", "3!"]);
    q1(); q2(); q1(); assert.strictEqual(BusPuro.emite("a:b", "?"), 1); assert.strictEqual(BusPuro.emite("nadie:escucha"), 0); assert.ok(!BusPuro.hay("nadie:escucha"));
  } finally { console.error = err; }
});

// ---------- el registro de verdad, en Node: 02c entero con una ventana de mentira (y, si se pide, ficheros componente del motor)
function nucleo({ busqueda = "", config = null, extra = "", globales = {} } = {}) {
  const teclado = [], errores = [];
  const oyentes = {};
  const ventana = { addEventListener: (n, f) => { if (n === "keydown") teclado.push(f); (oyentes[n] = oyentes[n] || []).push(f); }, removeEventListener: (n, f) => { const l = oyentes[n] || [], i = l.indexOf(f); if (i >= 0) l.splice(i, 1); }, oyentes };
  const documento = { getElementById: id => id === "config" && config ? { textContent: JSON.stringify(config) } : null };
  const consola = { error: (...a) => errores.push(a.map(String).join(" ")), warn: (...a) => errores.push(a.map(String).join(" ")), log() {} };
  const nombres = Object.keys(globales);
  const f = new Function(...["window", "location", "document", "console"].concat(nombres), "\"use strict\";\n" + sinCabecera(NUCLEO) + "\n" + extra + "\nreturn { Componentes, Bus, Teclas, ComponentesPuro, Pausa };");
  const r = f(...[ventana, { search: busqueda }, documento, consola].concat(nombres.map(n => globales[n])));
  r.pulsa = (code, extra2) => { const e = Object.assign({ code, target: { tagName: "CANVAS" }, prevenida: false, preventDefault() { e.prevenida = true; } }, extra2 || {}); teclado.forEach(fn => fn(e)); return e; };
  r.errores = errores; r.ventana = ventana;
  return r;
}

test("ciclo de vida: arranca monta en orden, las fases llaman a los encendidos («tarde» a su ritmo), libera suelta lo enganchado y los dependientes primero", () => {
  const { Componentes: C, Bus } = nucleo(), log = [];
  const mk = (id, extra) => manifiesto(Object.assign({ id, monta: n => { log.push("monta " + id); n.on("prueba:x", () => log.push("oye " + id)); n.limpia(() => log.push("limpia " + id)); return { id }; },
    libera: api => log.push("libera " + api.id) }, extra));
  assert.ok(C.registra(mk("b", { consume: ["A"], fases: { mundo: 0 }, actualiza: { mundo: (dt, t, api) => log.push("mundo " + api.id) } })));
  assert.ok(C.registra(mk("a", { expone: ["A"], fases: { tarde: 0.5 }, actualiza: { tarde: dt => log.push("tarde " + dt.toFixed(1)) } })));
  assert.ok(!C.registra(mk("a")), "id repetido"); assert.ok(!C.registra({ id: "roto" }), "manifiesto roto");
  C.arranca();
  assert.deepStrictEqual(log.splice(0), ["monta a", "monta b"]);
  for (let i = 0; i < 10; i++) { C.actualiza("mundo", 0.1, i); C.actualiza("tarde", 0.1, i); }
  assert.strictEqual(log.filter(x => x === "mundo b").length, 10, "«mundo», cada fotograma");
  assert.ok(log.filter(x => x.startsWith("tarde")).length >= 1 && log.filter(x => x.startsWith("tarde")).length <= 2, "«tarde» cada 0,5 s: " + log.join(","));
  log.length = 0; Bus.emite("prueba:x"); assert.deepStrictEqual(log.splice(0).sort(), ["oye a", "oye b"]);
  assert.ok(C.libera("a"));
  assert.deepStrictEqual(log.splice(0), ["libera b", "limpia b", "libera a", "limpia a"], "b consume de a: se va antes");
  Bus.emite("prueba:x"); assert.deepStrictEqual(log, [], "nadie escucha ya");
  assert.strictEqual(C.api("a"), null); assert.ok(!C.activo("b"));
  assert.ok(!C.enciende("b", true), "b no se monta sin a"); assert.match(C.resumen().find(r => r.id === "b").motivo, /falta a/);
  assert.ok(C.enciende("a", true) && C.enciende("b", true));
});

test("un componente que falla en su fase se apaga solo (y lo dice); uno que falla al montar no queda a medias", () => {
  const { Componentes: C, errores } = nucleo(), log = [];
  C.registra(manifiesto({ id: "malo", fases: { mundo: 0 }, actualiza: { mundo() { throw new Error("ay"); } }, monta: n => { n.limpia(() => log.push("limpia malo")); return {}; } }));
  C.registra(manifiesto({ id: "bueno", fases: { mundo: 0 }, actualiza: { mundo() { log.push("bueno"); } } }));
  C.registra(manifiesto({ id: "rompe", monta: n => { n.limpia(() => log.push("limpia rompe")); throw new Error("no monto"); } }));
  C.arranca();
  assert.deepStrictEqual(log.splice(0), ["limpia rompe"]); assert.ok(!C.activo("rompe"));
  C.actualiza("mundo", 0.016, 0); C.actualiza("mundo", 0.016, 1);
  assert.ok(!C.activo("malo")); assert.deepStrictEqual(log, ["limpia malo", "bueno", "bueno"]);
  assert.match(C.resumen().find(r => r.id === "malo").motivo, /error en «mundo»: ay/);
  assert.ok(errores.length >= 2);
});

test("encendido en el motor: ?bandera manda; la configuración de la página o del servidor enciende y apaga en caliente; un componente tardío se monta al registrarse", () => {
  const def = (id, url, defecto) => manifiesto({ id, bandera: { defecto, url } });
  let r = nucleo({ busqueda: "?uno=0", config: { v: 1, componentes: { dos: { activo: true, parametros: { k: 7 } }, uno: { activo: true } } } });
  let param = null;
  r.Componentes.registra(def("uno", "uno", true)); r.Componentes.registra(Object.assign(def("dos", "dos", false), { monta: n => { param = n.parametros.k; return {}; } }));
  r.Componentes.arranca();
  assert.deepStrictEqual(r.Componentes.resumen().map(x => [x.id, x.activo, x.origen]), [["uno", false, "url"], ["dos", true, "servidor"]]);
  assert.strictEqual(param, 7, "los parámetros del servidor llegan a monta");
  assert.ok(r.Componentes.configura({ dos: { activo: false } })); assert.ok(!r.Componentes.activo("dos"), "apagado desde la configuración");
  assert.ok(!r.Componentes.configura({ dos: { activo: "no" } }), "una configuración rota no se aplica"); assert.ok(!r.Componentes.activo("dos"));
  r.Componentes.registra(def("tres", "tres", true)); assert.ok(r.Componentes.activo("tres"), "registrado tras arrancar: se monta ya");
  r = nucleo(); r.Componentes.arranca(); assert.deepStrictEqual(r.Componentes.resumen(), [], "sin componentes también arranca");
});

test("Teclas: las de los módulos de siempre no se pueden coger; una tecla, un dueño; nada con el foco en un campo, con Ctrl/Alt/Cmd ni al repetir", () => {
  const { Teclas: T, pulsa } = nucleo();
  for (const c of ["Digit1", "Numpad6", "KeyF", "Escape", "KeyW", "Space", "KeyH", "KeyM", "KeyL", "Enter"]) assert.strictEqual(T.registra(c, () => {}), null, c + " es de un módulo de siempre");
  let n = 0; const q = T.registra("KeyP", () => { n++; }, "fichas-tiempo");
  assert.ok(q); assert.strictEqual(T.registra("KeyP", () => {}), null, "la P ya tiene dueño"); assert.strictEqual(T.dueno("KeyP"), "fichas-tiempo");
  assert.ok(pulsa("KeyP").prevenida); assert.strictEqual(n, 1);
  pulsa("KeyP", { target: { tagName: "INPUT" } }); pulsa("KeyP", { ctrlKey: true }); pulsa("KeyP", { repeat: true }); pulsa("KeyP", { target: { isContentEditable: true } });
  assert.strictEqual(n, 1);
  const q2 = T.registra("KeyO", () => false); assert.ok(!pulsa("KeyO").prevenida, "si no la usa (false), no se anula"); q2();
  q(); pulsa("KeyP"); assert.strictEqual(n, 1); assert.strictEqual(T.dueno("KeyP"), null);
});

// ---------- los componentes del motor: manifiestos, consume, eventos, presupuestos
/** Los manifiestos tal y como los registra cada fichero: se evalúa el fichero entero en un contexto vacío (solo Componentes y Bus de mentira).
 *  Si su primer nivel usara un global de otro módulo, fallaría aquí (ReferenceError): un componente solo define y se registra. */
function manifiestos() {
  const out = {};
  for (const f of COMPONENTES) {
    const defs = [], ctx = vm.createContext({ Componentes: { registra: d => { defs.push(d); return true; } }, Bus: { on: () => () => {}, emite: () => 0, hay: () => false }, console, Intl, Date, Math, JSON });
    assert.doesNotThrow(() => vm.runInContext("\"use strict\";\n" + fs.readFileSync(path.join(MOTOR, f), "utf8"), ctx, { filename: f }), f + ": su primer nivel debe poder evaluarse sin el resto del motor");
    assert.strictEqual(defs.length, 1, f + ": un componente por fichero");
    out[f] = defs[0];
    for (const k of ["consume", "expone"]) out[f][k] = [...out[f][k]];   // del contexto de vm al de la prueba (deepStrictEqual mira el prototipo)
    out[f].eventos = { escucha: [...(out[f].eventos.escucha || [])], emite: [...(out[f].eventos.emite || [])] };
  }
  return out;
}
/** quién emite y quién escucha cada evento en el código (sin comentarios): Bus.emite/Bus.on y, dentro de un componente, n.emite/n.on */
function eventosDelCodigo() {
  const m = {};
  for (const f of ficherosMotor()) {
    const s = sinComentarios(sinCabecera(fs.readFileSync(path.join(MOTOR, f), "utf8"))), mod = f.slice(0, -3);
    for (const x of s.matchAll(/\b(?:Bus|n)\.(emite|on)\(\s*"([^"]+)"/g)) {
      const e = m[x[2]] = m[x[2]] || { emiten: new Set(), escuchan: new Set() };
      (x[1] === "emite" ? e.emiten : e.escuchan).add(mod);
    }
  }
  return m;
}

test("hay al menos un componente (el piloto de las fichas del tiempo) y cada manifiesto es válido, con presupuesto y libera", () => {
  assert.ok(COMPONENTES.includes("35_fichas_tiempo.js"), "35_fichas_tiempo.js es componente: " + COMPONENTES.join(", "));
  const M = manifiestos();
  for (const [f, d] of Object.entries(M)) {
    assert.deepStrictEqual(P.valida(d), [], f);
    assert.ok(d.presupuesto && typeof d.libera === "function", f + ": presupuesto y libera");
  }
  assert.strictEqual(new Set(Object.values(M).map(d => d.id)).size, COMPONENTES.length, "ids únicos");
});

test("la suma de los presupuestos de los encendidos por defecto cabe en el de diseño (pruebas/presupuesto.json → diseno)", () => {
  const M = Object.values(manifiestos()).filter(d => d.bandera.defecto), dis = PRESUPUESTO.diseno;
  const s = M.reduce((a, d) => ({ llamadas: a.llamadas + d.presupuesto.llamadas, triangulos: a.triangulos + d.presupuesto.triangulos }), { llamadas: 0, triangulos: 0 });
  assert.ok(s.llamadas <= dis.llamadas && s.triangulos <= dis.triangulos, JSON.stringify(s) + " frente a " + JSON.stringify(dis));
});

test("consume resuelto y sin ciclos; un componente no expone nada en su primer nivel ni consume de otro componente; lo que usa de fuera lo declara", () => {
  const M = manifiestos(), d = contratoModulos.deriva(), ifaces = Object.keys(json("contratos/interfaces.json").interfaces);
  const comp = new Set(COMPONENTES.map(f => f.slice(0, -3)));
  const expuestosNoComp = new Set(Object.entries(d.expone).filter(([f]) => !comp.has(f.slice(0, -3))).flatMap(([, ns]) => ns));
  const expComp = new Set(Object.values(M).flatMap(x => x.expone));
  for (const [f, def] of Object.entries(M)) {
    for (const n of def.consume) assert.ok(expuestosNoComp.has(n) || ifaces.includes(n) || expComp.has(n), f + ": consume «" + n + "», que nadie expone");
    assert.deepStrictEqual(d.expone[f], [], f + ": un componente no expone nada en su primer nivel (los demás le hablan por el Bus o Componentes.api)");
    for (const g of Object.keys(d.cons[f])) assert.ok(!comp.has(g), f + " consume de otro componente: " + g);
    // lo que su código (sin comentarios) usa de los módulos que no son el núcleo de componentes ni lo básico de la escena, está en su consume
    const codigo = sinComentarios(sinCabecera(fs.readFileSync(path.join(MOTOR, f), "utf8"))).replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
    const LIBRE = new Set(["01_datos", "02_mundo", "02b_cola", "02c_componentes", "02d_laminas", "02e_entidades", "03_escena"]);
    const usa = n => new RegExp("(?<![\\w$.])" + n.replace(/\$/g, "\\$") + "(?![\\w$]|\\s*:(?!:))").test(codigo);   // sin propiedades (.x) ni claves de objeto (x:)
    for (const [g, ns] of Object.entries(d.cons[f])) if (!LIBRE.has(g)) for (const n of ns) if (usa(n)) assert.ok(def.consume.includes(n), f + ": usa «" + n + "» de " + g + " sin declararlo en consume");
  }
  for (const f of ficherosMotor()) for (const c of comp) assert.ok(!d.cons[f][c], f + " consume de un componente (" + c + "): debe ir por el Bus o Componentes.api");
  assert.deepStrictEqual(P.orden(Object.values(M)).ciclos, [], "sin ciclos");
});

test("eventos: el catálogo cumple su esquema y dice exactamente quién emite y quién escucha; nadie escucha lo que nadie emite; los manifiestos coinciden", () => {
  const v = ajv.compile(ESQ_EV); assert.ok(v(CATALOGO), JSON.stringify(v.errors));
  for (const [n, e] of Object.entries(CATALOGO.eventos)) assert.doesNotThrow(() => ajv.compile(e.datos), n + ": datos debe ser un esquema JSON");
  const cod = eventosDelCodigo();
  for (const [n, e] of Object.entries(cod)) {
    assert.ok(CATALOGO.eventos[n], "el evento «" + n + "» no está en contratos/eventos.json");
    assert.deepStrictEqual([...e.emiten].sort(), CATALOGO.eventos[n].emiten.slice().sort(), n + ": quién lo emite");
    assert.deepStrictEqual([...e.escuchan].sort(), CATALOGO.eventos[n].escuchan.slice().sort(), n + ": quién lo escucha");
  }
  for (const n of Object.keys(CATALOGO.eventos)) assert.ok(cod[n] && cod[n].emiten.size, "«" + n + "» está en el catálogo pero nadie lo emite");
  const M = manifiestos();
  for (const [f, def] of Object.entries(M)) {
    const mod = f.slice(0, -3), suyos = k => Object.keys(cod).filter(n => cod[n][k].has(mod)).sort();
    assert.deepStrictEqual(def.eventos.escucha.slice().sort(), suyos("escuchan"), f + ": eventos.escucha del manifiesto");
    assert.deepStrictEqual((def.eventos.emite || []).slice().sort(), suyos("emiten"), f + ": eventos.emite del manifiesto");
  }
});

// ---------- quitar funciona
test("el motor sin cada componente (genera_motor.mjs --sin) es JavaScript válido y nadie más lo nombra", async () => {
  const { concatenaMotor } = await import("file:///" + path.join(RAIZ, "apps", "web", "herramientas", "genera_motor.mjs").split(path.sep).join("/"));
  assert.throws(() => concatenaMotor(["no_existe.js"]), /no están en motor/);
  const M = manifiestos();
  for (const f of COMPONENTES) {
    const tmp = path.join(os.tmpdir(), "gemelo_sin_" + process.pid + "_" + f);
    fs.writeFileSync(tmp, concatenaMotor([f]));
    const r = ejecuta(process.execPath, ["--check", tmp]); fs.unlinkSync(tmp);
    assert.strictEqual(r.status, 0, "sin " + f + ": " + r.stderr);
    const nombres = [M[f].id].concat(M[f].expone);
    // solo puede nombrarlo (su id para n.api y lo que expone) otro componente que lo declara en su consume (C5: la presencia consume la red; los avatares, la presencia)
    const loConsume = g => !!M[g] && M[g].consume.some(x => M[f].expone.includes(x));
    for (const g of ficherosMotor().filter(x => x !== f && !loConsume(x))) {
      const s = sinComentarios(sinCabecera(fs.readFileSync(path.join(MOTOR, g), "utf8")));
      for (const n of nombres) assert.ok(!new RegExp("(?<![\\w$.-])" + n + "(?![\\w$-])").test(s), g + " nombra a «" + n + "» (de " + f + ")");
    }
  }
});

test("en Node: el núcleo con la pieza de las fichas del tiempo de verdad arranca con ella, sin ella, con ?fichas=0 y apagándola desde la configuración", () => {
  const F = "35_fichas_tiempo.js", fuente = sinCabecera(fs.readFileSync(path.join(MOTOR, F), "utf8"));
  class V3 { constructor() { this.x = this.y = this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); } }
  const filas = [], tapas = [];
  const globales = { THREE: { Vector3: V3 }, PanelVR: { filas: (p, f) => { filas.push(f); return () => filas.splice(filas.indexOf(f), 1); }, tapa: fn => { tapas.push(fn); return () => tapas.splice(tapas.indexOf(fn), 1); }, repinta() {}, cierra() {}, rumbo: () => 0 },
    TiempoVivo: { lee: () => null, alCambiar: () => () => {} }, VRX: { on: false }, paseando: false, Hud: { aviso() {} }, ahoraMs: () => Date.parse("2026-10-30T12:00:00Z"), nivel: () => ({ d: 1 }),
    Laminas: { abre: () => true, cierra: () => false, hay: () => false, repinta: () => false, revisa() {}, info: () => ({ abierta: false }) } };
  const arranca = (busqueda, extra) => { const r = nucleo({ busqueda, extra, globales }); r.Componentes.arranca(); for (let i = 0; i < 40; i++) ["mundo", "tarde", "trasRender"].forEach(fa => r.Componentes.actualiza(fa, 0.05, i)); return r; };
  let r = arranca("", fuente);
  assert.ok(r.Componentes.activo("fichas-tiempo"), JSON.stringify(r.Componentes.resumen()));
  assert.ok(r.Bus.hay("prevision:alterna") && !r.Bus.hay("vr:sale"), "salir de VR lo atiende Laminas, no la ficha"); assert.strictEqual(filas.length, 1); assert.strictEqual(typeof r.ventana.__fichaTiempo, "function");
  assert.strictEqual(r.Teclas.dueno("KeyP"), "fichas-tiempo");
  assert.ok(r.Componentes.configura({ "fichas-tiempo": { activo: false } }));
  assert.ok(!r.Componentes.activo("fichas-tiempo")); assert.ok(!r.Bus.hay("prevision:alterna")); assert.strictEqual(filas.length, 0); assert.strictEqual(tapas.length, 0);
  assert.strictEqual(r.ventana.__fichaTiempo, undefined); assert.strictEqual(r.Teclas.dueno("KeyP"), null);
  assert.ok(r.Componentes.configura({ "fichas-tiempo": { activo: true } }) && r.Componentes.activo("fichas-tiempo"), "vuelve a encenderse");
  assert.deepStrictEqual(r.errores, []);
  r = arranca("?fichas=0", fuente); assert.ok(!r.Componentes.activo("fichas-tiempo")); assert.ok(!r.Bus.hay("prevision:alterna"));
  r = arranca("", ""); assert.deepStrictEqual(r.Componentes.resumen(), []); assert.ok(!r.Bus.hay("prevision:alterna"), "sin el fichero: nadie atiende el botón (15_tiempo.js lo esconde)");
  assert.match(lee("apps/web/motor/15_tiempo.js"), /vm\.hidden = !Bus\.hay\("prevision:alterna"\)/);
});

// ---------- C4: el sonido como componente
/** un AudioContext de mentira: cualquier método devuelve otro nodo, las propiedades se guardan; cuenta los que se crean y cierra */
function audioFalso() {
  const cuenta = { creados: 0, cerrados: 0 };
  const nodo = () => { const g = {}; return new Proxy(function () {}, { get: (t, k) => k === "getChannelData" ? () => new Float32Array(64) : k in g ? g[k] : (g[k] = nodo()), set: (t, k, v) => { g[k] = v; return true; }, apply: () => nodo() }); };
  class AC { constructor() { cuenta.creados++; const n = nodo(); this.n = n; this.state = "running"; this.currentTime = 0; this.sampleRate = 8000; this.destination = nodo(); }
    resume() { return Promise.resolve(); } close() { cuenta.cerrados++; return Promise.resolve(); }
    createBuffer() { return { getChannelData: () => new Float32Array(16000) }; } }
  return { AC: new Proxy(AC, { construct: (T, a) => new Proxy(new T(...a), { get: (o, k) => k in o ? o[k] : (typeof k === "string" && k.startsWith("create") ? () => nodo() : undefined) }) }), cuenta };
}
test("C4 en Node: el sonido se monta con su pestaña de Configuración y su fila del panel VR, atiende al Bus, y apagado o sin el fichero no se rompe nada", () => {
  const F = "20_sonido.js", fuente = sinCabecera(fs.readFileSync(path.join(MOTOR, F), "utf8"));
  const filas = [], ajustes = [], quitados = { ajustes: 0 };
  const mundo = () => ({ PanelVR: { filas: (p, f) => { filas.push([p, f]); return () => filas.splice(filas.findIndex(x => x[1] === f), 1); } }, VRX: { sucio: false },
    Ajustes: { lee: k => ({ "sonido.activo": true, "sonido.volumen": 80 })[k], pon() {}, registra: (pre, esq, pes, ap) => { ajustes.push({ pre, esq, pes }); ap && ap("sonido.activo", true); return () => { quitados.ajustes++; }; } },
    paseando: true, teclas: { run: false }, cur: { ms: 0, viento: 3, lluvia: 0, temp: 20 }, nivel: () => ({ d: 1 }), tVida: 0, enQuad: false, quad: {}, vq: 0, enDron: false, dr: { x: 0, y: 0, vf: 0, vh: 0 },
    pp: { x: 0, y: 0, paso: 0 }, aguaNivel: 0, distArroyo: () => 50 });
  const arranca = (busqueda, extra, g) => { const r = nucleo({ busqueda, extra, globales: g }); r.Componentes.arranca(); for (let i = 0; i < 30; i++) ["mundo", "tarde", "trasRender"].forEach(fa => r.Componentes.actualiza(fa, 0.05, i)); return r; };
  const A = audioFalso(); let g = mundo(); g = Object.assign(g, {});
  let r = arranca("", fuente, g); r.ventana.AudioContext = A.AC;
  assert.ok(r.Componentes.activo("sonido-ambiente"), JSON.stringify(r.Componentes.resumen()));
  for (const e of ["audio:desbloquea", "sonido:baliza", "sonido:golpe", "sonido:ladrido"]) assert.ok(r.Bus.hay(e), e);
  assert.strictEqual(ajustes.length, 1); assert.strictEqual(ajustes[0].pre, "sonido"); assert.deepStrictEqual(Object.keys(ajustes[0].esq), ["activo", "volumen"]);
  assert.strictEqual(filas.length, 1); assert.strictEqual(filas[0][0], "comodidad"); assert.strictEqual(filas[0][1].id, "sonido");
  assert.ok(r.ventana.oyentes.pointerdown.length === 1 && r.ventana.oyentes.keydown.length >= 1, "el audio arranca tras un gesto (pointerdown/keydown)");
  assert.strictEqual(A.cuenta.creados, 0, "antes del gesto no hay AudioContext");
  r.Bus.emite("audio:desbloquea", {}); assert.strictEqual(A.cuenta.creados, 1, "«Entrar en VR» deja arrancar el audio");
  r.Bus.emite("audio:desbloquea", {}); assert.strictEqual(A.cuenta.creados, 1, "un solo AudioContext");
  for (let i = 0; i < 60; i++) r.Componentes.actualiza("mundo", 0.05, i);
  r.Bus.emite("sonido:baliza", { completa: true }); r.Bus.emite("sonido:golpe", {}); r.Bus.emite("sonido:ladrido", { grave: true });
  assert.deepStrictEqual(r.errores, []);
  assert.ok(r.Componentes.configura({ "sonido-ambiente": { activo: false } }));
  assert.ok(!r.Componentes.activo("sonido-ambiente")); assert.strictEqual(A.cuenta.cerrados, 1, "libera cierra el AudioContext");
  assert.strictEqual(filas.length, 0); assert.strictEqual(quitados.ajustes, 1); assert.ok(!r.Bus.hay("sonido:baliza")); assert.strictEqual(r.ventana.oyentes.pointerdown.length, 0, "suelta el gesto");
  assert.doesNotThrow(() => { r.Bus.emite("sonido:baliza", { completa: false }); r.Bus.emite("audio:desbloquea", {}); r.Bus.emite("sonido:ladrido", {}); }); assert.strictEqual(A.cuenta.creados, 1);
  assert.ok(r.Componentes.configura({ "sonido-ambiente": { activo: true } }) && r.Componentes.activo("sonido-ambiente"), "vuelve a encenderse");
  r.Bus.emite("audio:desbloquea", {}); assert.strictEqual(A.cuenta.creados, 2); assert.deepStrictEqual(r.errores, []);
  // ?sonido=0: ni nodos, ni pestaña, ni fila; los demás módulos siguen emitiendo sin que pase nada
  filas.length = 0; ajustes.length = 0;
  r = arranca("?sonido=0", fuente, mundo()); r.ventana.AudioContext = A.AC;
  assert.ok(!r.Componentes.activo("sonido-ambiente")); assert.strictEqual(filas.length, 0); assert.strictEqual(ajustes.length, 0);
  assert.strictEqual(r.Bus.emite("sonido:baliza", { completa: true }), 0); assert.strictEqual(r.Bus.emite("audio:desbloquea", {}), 0); assert.strictEqual(A.cuenta.creados, 2);
  // sin Configuración ni panel VR (no existen esos globales): se monta igual, con los ajustes de siempre
  r = arranca("", fuente, Object.assign(mundo(), { Ajustes: undefined, PanelVR: undefined })); r.ventana.AudioContext = A.AC;
  assert.ok(r.Componentes.activo("sonido-ambiente")); r.Bus.emite("audio:desbloquea", {}); assert.strictEqual(A.cuenta.creados, 3); assert.deepStrictEqual(r.errores, []);
  // sin el fichero: nadie atiende y el resumen está vacío
  r = arranca("", "", {}); assert.deepStrictEqual(r.Componentes.resumen(), []); assert.strictEqual(r.Bus.emite("sonido:golpe", {}), 0);
  // los demás módulos hablan por el Bus (no nombran al sonido): la fuente de cada uno emite lo que el catálogo dice
  assert.match(lee("apps/web/motor/19_balizas.js"), /Bus\.emite\("sonido:baliza"/); assert.match(lee("apps/web/motor/24_pantalla.js"), /Bus\.emite\("sonido:golpe"/);
  assert.match(lee("apps/web/motor/25_perros.js"), /n\.emite\("sonido:ladrido"/); assert.match(lee("apps/web/motor/29_vr.js"), /Bus\.emite\("audio:desbloquea"/);
  assert.doesNotMatch(sinComentarios(lee("apps/web/motor/90_final.js")), /actualizaSonido/);
});

// ---------- puntos de extensión con trozo puro (C2): las capas con su procedencia y los ajustes de un componente
test("Capas.registra exige la procedencia (medido, deducido o ilustrativo: regla 5) y una función para alternarla", () => {
  const s = lee("apps/web/motor/32b_capas.js"), C = new Function("\"use strict\";\n" + trozo(s, "// [puro:inicio]", "// [puro:fin]") + "\nreturn CapasPuro;")();
  const ok = { id: "humedad-suelo", nombre: "Humedad del suelo", procedencia: "deducido", alterna() {} };
  assert.deepStrictEqual(C.valida(ok), []);
  for (const [k, v] of [["sin procedencia", { procedencia: undefined }], ["procedencia inventada", { procedencia: "estimado" }], ["sin alterna", { alterna: null }], ["grupo raro", { grupo: "otros" }], ["id raro", { id: "Hum" }], ["sin nombre", { nombre: " " }]])
    assert.notDeepStrictEqual(C.valida(Object.assign({}, ok, v)), [], k);
  assert.deepStrictEqual(C.PROC, ["medido", "deducido", "ilustrativo"]);
});

test("Ajustes.registra: AjustesPuro.fusiona añade claves con prefijo propio, valida tipos y no pisa a nadie; retira las quita", () => {
  const s = lee("apps/web/motor/33_ajustes.js"), A = new Function("\"use strict\";\n" + trozo(s, "// [puro:inicio]", "// [puro:fin]") + "\nreturn AjustesPuro;")();
  const n0 = Object.keys(A.ESQUEMA).length;
  assert.deepStrictEqual(A.fusiona("juego", { dificultad: { tipo: "opc", def: "media", ops: ["facil", "media"] }, sonido: { tipo: "bool", def: true }, vel: { tipo: "num", def: 1, min: 0.5, max: 2, paso: 0.5 } }), []);
  assert.strictEqual(Object.keys(A.ESQUEMA).length, n0 + 3);
  const al = A.crea(null, ""); assert.strictEqual(al.lee("juego.dificultad"), "media"); assert.ok(al.pon("juego.vel", 1.5)); assert.ok(!al.pon("juego.dificultad", "dificil"));
  assert.match(A.fusiona("juego", { otra: { tipo: "bool", def: false } })[0], /ya usado/);
  assert.match(A.fusiona("vr", { otra: { tipo: "bool", def: false } })[0], /ya usado/, "los prefijos de siempre tampoco");
  assert.ok(A.fusiona("malo", { x: { tipo: "num", def: 5, min: 0, max: 1 } }).length && !("malo.x" in A.ESQUEMA), "un esquema con errores no entra entero");
  assert.ok(A.fusiona("Malo", { x: { tipo: "bool", def: true } }).length);
  A.retira("juego"); assert.strictEqual(Object.keys(A.ESQUEMA).length, n0);
});

// ---------- C9a: el anfitrión de juegos y «Cae la cosecha», dos componentes que se hablan solo por el Bus
test("C9a en Node: anfitrión y juego se encuentran por el Bus en cualquier orden; apagar cualquiera de los dos no rompe nada; la pausa del mundo", () => {
  const H = sinCabecera(lee("apps/web/motor/40_juegos.js")), J = sinCabecera(lee("apps/web/motor/41_cae_la_cosecha.js"));
  const iconos = [], ventanas = [];
  const mundo = () => ({ Hud: { icono: d => { iconos.push(d.id); return () => iconos.splice(iconos.indexOf(d.id), 1); }, alterna() {} },
    Ventanas: { registra: id => { ventanas.push(id); return () => ventanas.splice(ventanas.indexOf(id), 1); }, abierta: () => null, cierra() {} },
    VRX: { on: false }, D: { base: "", finca_id: "cerro" } });
  const arranca = (busqueda, extra) => { const r = nucleo({ busqueda, extra, globales: mundo() }); r.Componentes.arranca(); return r; };
  for (const orden of [H + "\n" + J, J + "\n" + H]) {
    const r = arranca("", orden);
    assert.ok(r.Componentes.activo("juegos") && r.Componentes.activo("cae-la-cosecha"), JSON.stringify(r.Componentes.resumen()));
    assert.deepStrictEqual(r.ventana.__juegos().juegos, ["cae-la-cosecha"], "el anfitrión conoce el juego (" + (orden.startsWith(H) ? "anfitrión primero" : "juego primero") + ")");
    assert.deepStrictEqual(iconos, ["juegos"]); assert.deepStrictEqual(ventanas, ["juegos"]); assert.strictEqual(r.Teclas.dueno("KeyJ"), "juegos");
    // apagar el juego desde la configuración: se retira de la lista; encenderlo: vuelve
    assert.ok(r.Componentes.configura({ "cae-la-cosecha": { activo: false } })); assert.deepStrictEqual(r.ventana.__juegos().juegos, []);
    assert.ok(r.Componentes.configura({ "cae-la-cosecha": { activo: true } })); assert.deepStrictEqual(r.ventana.__juegos().juegos, ["cae-la-cosecha"]);
    // apagar el anfitrión: sin icono, sin ventana, sin tecla, sin __juegos; el juego sigue montado y nadie lo oye
    assert.ok(r.Componentes.configura({ juegos: { activo: false } }));
    assert.deepStrictEqual(iconos, []); assert.deepStrictEqual(ventanas, []); assert.strictEqual(r.Teclas.dueno("KeyJ"), null); assert.strictEqual(r.ventana.__juegos, undefined);
    assert.ok(r.Componentes.activo("cae-la-cosecha")); assert.ok(!r.Bus.hay("juego:ofrece"));
    assert.ok(r.Componentes.configura({ juegos: { activo: true } })); assert.deepStrictEqual(r.ventana.__juegos().juegos, ["cae-la-cosecha"], "al volver, pregunta y el juego responde");
    assert.deepStrictEqual(r.errores, []);
    r.Componentes.configura({ juegos: { activo: false } });
  }
  // la pausa: «mundo:pausa» al entrar y al salir (no por cada uno que la pide); la fase «pausa» se puede llamar sin juego abierto
  const r = arranca("", H + "\n" + J);
  assert.ok(!r.Pausa.activa()); const visto = []; r.Bus.on("mundo:pausa", d => visto.push(d.activa));
  assert.ok(r.Pausa.pon("x")); assert.ok(!r.Pausa.pon("x"), "dos veces el mismo, una"); r.Pausa.pon("y"); r.Pausa.quita("x"); assert.ok(r.Pausa.activa()); r.Pausa.quita("y");
  assert.ok(!r.Pausa.activa()); assert.deepStrictEqual(visto, [true, false]);
  assert.doesNotThrow(() => r.Componentes.actualiza("pausa", 0.016, 0));
  r.Componentes.configura({ juegos: { activo: false } });
  const fin = sinComentarios(lee("apps/web/motor/90_final.js"));
  assert.ok(fin.includes('if (Pausa.activa() && !VRX.on) { Componentes.actualiza("pausa", dt, t); depuraCuadro(t); Bus.emite("cuadro:fin", FIN); return; }'), "en pausa, el bucle solo corre la fase «pausa» (ni render, ni Cola, ni módulos)");
  assert.ok(fin.indexOf("Pausa.activa()") < fin.indexOf("actualizaTiempo("), "y lo mira antes que nada del mundo");
  // ?cosecha=0: el anfitrión sin juegos; ?juegos=0: sin anfitrión; sin el fichero del juego: anfitrión vacío
  let q = arranca("?cosecha=0", H + "\n" + J); assert.deepStrictEqual(q.ventana.__juegos().juegos, []); q.Componentes.configura({ juegos: { activo: false } });
  q = arranca("?juegos=0", H + "\n" + J); assert.ok(!q.Componentes.activo("juegos") && q.Componentes.activo("cae-la-cosecha")); assert.deepStrictEqual(iconos, []);
  q = arranca("", H); assert.deepStrictEqual(q.ventana.__juegos().juegos, []); q.Componentes.configura({ juegos: { activo: false } });
  assert.deepStrictEqual(q.errores, []);
});
