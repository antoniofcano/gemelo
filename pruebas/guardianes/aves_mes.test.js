"use strict";
// EV-1g «Biodiversidad B0» en Node y sin navegador ni red:
//   · el contrato contratos/biodiversidad.schema.json (ajv): el ejemplo sintético lo cumple y lo que traería una licencia NC, una versión otra o campos de más, no;
//   · la parte pura de la ficha (apps/web/motor/52_aves_mes.js): lista blanca, mes de Madrid, qué aves son probables, licencias y atribución visibles;
//   · el componente con un DOM falso y fetch simulado: con datos pone icono y ventana (con la pastilla «deducido» y la atribución, todo como texto); sin
//     servidor, sin fichero, con un fichero malo o sin aves del mes no monta nada y no lanza;
//   · la agregación y el filtro de licencias del exportador (tuberia/biodiversidad/prueba_biodiversidad.py), con una API de GBIF falsa, si hay Python.
const test = require("node:test"), assert = require("node:assert");
const { lee, python, ejecuta } = require("./_util");
const Ajv2020 = require("ajv/dist/2020").default;

const ESQ = JSON.parse(lee("contratos/biodiversidad.schema.json")), EJ = JSON.parse(lee("contratos/biodiversidad-ejemplo.json"));
const V = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true }).compile(ESQ);
const errores = d => V(d) ? [] : V.errors.map(e => (e.instancePath || "/") + ": " + e.message);
const copia = o => JSON.parse(JSON.stringify(o));

const FUENTE = lee("apps/web/motor/52_aves_mes.js");
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return s.slice(i, f); };
const P = new Function("\"use strict\";\n" + trozo(FUENTE, "// [puro:inicio]", "// [puro:fin]") + "\nreturn AvesMesPuro;")();
const MOTOR = trozo(FUENTE, "// [motor:inicio]", "// [motor:fin]");
const ENERO = Date.UTC(2026, 0, 15, 12), JULIO = Date.UTC(2026, 6, 15, 12);

// ---------- el contrato ----------
test("contrato: el ejemplo sintético cumple el esquema y está marcado como sintético", () => {
  assert.deepStrictEqual(errores(EJ), []);
  assert.strictEqual(EJ.sintetico, true); assert.strictEqual(EJ.v, 1); assert.strictEqual(EJ.origen, "gbif");
  assert.ok(EJ.especies.length >= 5 && EJ.especies.every(s => s.meses.length === 12));
  assert.ok(EJ.fuentes.every(f => f.licencias.every(l => ["CC0_1_0", "CC_BY_4_0", "CC_BY_SA_4_0"].includes(l))), "solo CC0, CC BY y CC BY-SA (decisión 198)");
});

test("contrato: rechaza licencias NC, otra versión, otro origen, campos de más, meses que no son 12 y coordenadas", () => {
  const malo = f => { const d = copia(EJ); f(d); return errores(d).length > 0; };
  assert.ok(malo(d => { d.fuentes[0].licencias = ["CC_BY_NC_4_0"]; }), "NC");
  assert.ok(malo(d => { d.fuentes[0].licencias = ["UNSPECIFIED"]; }), "sin licencia");
  assert.ok(malo(d => { d.fuentes[0].licencias = []; }), "sin licencias");
  assert.ok(malo(d => { d.v = 2; }), "versión");
  assert.ok(malo(d => { d.origen = "ebird"; }), "origen");
  assert.ok(malo(d => { d.centro = [37, -4]; }), "el fichero no lleva el centro de la finca");
  assert.ok(malo(d => { d.especies[0].meses.pop(); }), "11 meses");
  assert.ok(malo(d => { d.especies[0].meses[0].n = -1; }), "n negativo");
  assert.ok(malo(d => { delete d.atribucion; }), "sin atribución");
  assert.ok(malo(d => { delete d.fuentes[0].cita; }), "fuente sin cita");
});

test("el ejemplo no lleva coordenadas, rutas locales ni correos", () => {
  const s = lee("contratos/biodiversidad-ejemplo.json");
  assert.ok(!/C:\\|\/Users\/|@[a-z0-9.-]+\.[a-z]{2,}|"(lat|lon|latitud|longitud|geometry|centro)/i.test(s));
});

// ---------- lo puro ----------
test("puro: valida deja pasar el ejemplo, deja solo la lista blanca y rechaza una licencia fuera de la lista (el fichero entero)", () => {
  const d = P.valida(copia(EJ)); assert.ok(d); assert.strictEqual(d.especies.length, EJ.especies.length); assert.strictEqual(d.sintetico, true);
  const j = copia(EJ); j.fuentes[0].extra = "x"; j.especies[0].secreto = "x"; const l = P.valida(j); assert.ok(!("extra" in l.fuentes[0]) && !("secreto" in l.especies[0]));
  for (const mal of [null, 3, "x", {}, Object.assign(copia(EJ), { v: 2 }), Object.assign(copia(EJ), { origen: "otro" }), Object.assign(copia(EJ), { grupo: "mamiferos" }),
    Object.assign(copia(EJ), { atribucion: "" }), Object.assign(copia(EJ), { especies: "no" })]) assert.strictEqual(P.valida(mal), null);
  const nc = copia(EJ); nc.fuentes[1].licencias = ["CC0_1_0", "CC_BY_NC_4_0"]; assert.strictEqual(P.valida(nc), null, "una licencia NC invalida el fichero");
  const raro = copia(EJ); raro.especies.push({ nombre_cientifico: "X y", meses: [{ n: 1, anios: 1 }] }, { nombre_cientifico: "Z z", meses: new Array(12).fill({ n: "a", anios: 1 }) });
  assert.strictEqual(P.valida(raro).especies.length, EJ.especies.length, "las especies mal formadas se descartan una a una");
});

test("puro: el mes es el de Madrid y la ruta sale de D.base", () => {
  assert.strictEqual(P.mesDe(ENERO), 1); assert.strictEqual(P.mesDe(JULIO), 7);
  assert.strictEqual(P.mesDe(Date.UTC(2026, 11, 31, 23, 30)), 1, "a las 00:30 de Madrid ya es enero");
  assert.strictEqual(P.mesDe(Date.UTC(2026, 2, 31, 22, 30)), 4, "con el horario de verano, 00:30 del 1 de abril");
  assert.strictEqual(P.rutaDatos("/teselas/x/", "biodiversidad.json"), "/teselas/x/biodiversidad.json"); assert.strictEqual(P.rutaDatos("/teselas/x/"), null, "sin indice.biodiversidad no se pide (ni un 404)"); assert.strictEqual(P.rutaDatos("/teselas/x/", "../otro.json"), null); assert.strictEqual(P.rutaDatos("", "biodiversidad.json"), null); assert.strictEqual(P.rutaDatos(undefined), null);
});

test("puro: las probables del mes dependen de los años con registros, salen por registros y respetan el tope", () => {
  const d = P.valida(copia(EJ)), enero = P.probables(d, 1), julio = P.probables(d, 7);
  assert.ok(enero.length > 0 && julio.length > 0);
  assert.ok(enero.some(x => x.nombre === "Petirrojo europeo") && !enero.some(x => x.nombre === "Vencejo común"), "el vencejo no está en enero");
  assert.ok(julio.some(x => x.nombre === "Vencejo común") && !julio.some(x => x.nombre === "Turdus philomelos" || x.nombre === "Zorzal común"));
  for (let i = 1; i < enero.length; i++) assert.ok(enero[i - 1].n >= enero[i].n, "orden por registros");
  assert.ok(enero.every(x => x.grado === "probable" && x.anios >= 2 && x.n >= 3));
  assert.strictEqual(P.probables(d, 1, { max: 3 }).length, 3);
  const poco = copia(EJ); poco.especies = [{ nombre_cientifico: "Solo uno", meses: new Array(12).fill({ n: 50, anios: 1 }) }];
  assert.deepStrictEqual(P.probables(P.valida(poco), 5), [], "un solo año no es «probable»");
  assert.deepStrictEqual(P.probables(d, 0), []); assert.deepStrictEqual(P.probables(d, 13), []); assert.deepStrictEqual(P.probables(null, 5), []);
  const sinComun = copia(EJ); delete sinComun.especies[0].nombre_comun; assert.ok(P.probables(P.valida(sinComun), 5, { max: 99 }).some(x => x.nombre === sinComun.especies[0].nombre_cientifico), "sin nombre común, el científico");
});

test("puro: la ficha dice nivel probable, deducido, de dónde sale, las licencias y la atribución; lo sintético, que no es real", () => {
  const d = P.valida(copia(EJ)), f = P.contenido(d, 5);
  assert.strictEqual(f.titulo, "Aves probables en mayo"); assert.strictEqual(f.grado, "probable"); assert.strictEqual(f.procedencia, "deducido");
  assert.match(f.nota, /GBIF/); assert.match(f.nota, /no se ha observado en la finca/);
  assert.ok(f.atribucion.length > 20 && /CC0/.test(f.licencias) && /CC BY 4\.0/.test(f.licencias) && !/NC/.test(f.licencias), f.licencias);
  assert.match(f.advertencia, /sintéticos/); assert.match(f.fuentes[0], /doi:10\.0000\/sintetico-a/); assert.strictEqual(f.anios, "2017–2026");
  assert.ok(f.filas.every(x => x.nombre && /registros? en \d+ años?|registros en 1 año/.test(x.detalle)));
  const real = copia(EJ); delete real.sintetico; assert.strictEqual(P.contenido(P.valida(real), 5).advertencia, null);
  const vacio = copia(EJ); vacio.especies = []; assert.strictEqual(P.contenido(P.valida(vacio), 5), null, "sin aves, sin ficha");
});

// ---------- el componente con DOM falso ----------
function mundo(base, respuesta) {
  const reg = { ventanas: [], iconos: [], quitadas: 0, fetches: [], limpias: [] };
  const nodo = tag => { const x = { tag, hijos: [], style: {}, className: "", textContent: "", set innerHTML(v) { throw new Error("nada de HTML: " + v); },
    appendChild(h) { this.hijos.push(h); h.parentNode = this; return h; }, removeChild(h) { this.hijos.splice(this.hijos.indexOf(h), 1); }, get firstChild() { return this.hijos[0]; } };
    return x; };
  const doc = { createElement: nodo, createTextNode: t => ({ tag: "#text", textContent: t, hijos: [] }) };
  const api = new Function("AvesMesPuro", "D", "fetch", "Ventanas", "Hud", "document", "window", "Date",
    "\"use strict\";\n" + MOTOR + "\nreturn AvesMesMotor;")(
    P, { base, biodiversidad: arguments.length > 2 ? arguments[2] : "biodiversidad.json" }, typeof respuesta === "undefined" ? undefined : (u, o) => { reg.fetches.push(u); return Promise.resolve(respuesta); },
    { registra: (id, def) => { const cu = nodo("div"), v = { id, def, cu }; cu.parentNode = { hidden: true }; def.construye(cu); reg.ventanas.push(v); return () => { reg.quitadas++; }; } },
    { icono: def => { reg.iconos.push(def); return () => { reg.quitadas++; }; } }, doc, {}, class extends Date { constructor(...a) { super(...(a.length ? a : [ENERO])); } static now() { return ENERO; } });
  const n = { limpia: f => reg.limpias.push(f) };
  return { api, n, reg };
}
const texto = nodo => (nodo.textContent || "") + (nodo.hijos || []).map(texto).join("");
const json = d => ({ status: 200, json: () => Promise.resolve(d) });
const espera = () => new Promise(r => setTimeout(r, 5));

test("motor: con servidor y datos pone icono y ventana «deducido», nivel probable, atribución y licencias; todo como texto", async () => {
  const { api, n, reg } = mundo("/teselas/x/", json(copia(EJ)));
  const r = api(n); assert.ok(r); await espera();
  assert.deepStrictEqual(reg.fetches, ["/teselas/x/biodiversidad.json"], "solo su mismo origen");
  assert.strictEqual(reg.ventanas.length, 1); assert.strictEqual(reg.ventanas[0].id, "aves"); assert.strictEqual(reg.iconos.length, 1); assert.strictEqual(reg.iconos[0].ventana, "aves");
  const t = texto(reg.ventanas[0].cu);
  for (const x of ["deducido", "Nivel probable", "no se ha observado en la finca", "Petirrojo europeo", "Licencias: CC0, CC BY 4.0", "GBIF.org", "sintéticos", "Conjuntos de datos (2)"]) assert.ok(t.includes(x), "falta «" + x + "» en: " + t);
  assert.ok(!t.includes("Vencejo común"), "enero: el vencejo no");
  reg.limpias.forEach(f => f());   // liberar suelta todo
  assert.ok(reg.quitadas >= 2);
});

test("motor: sin servidor, sin fichero, con un fichero malo o sin aves de este mes no monta nada y no lanza", async () => {
  const sin = mundo("", json(copia(EJ))); assert.strictEqual(sin.api(sin.n), null); assert.strictEqual(sin.reg.fetches.length, 0, "sin D.base ni se pide");
  const sinMarca = mundo("/t/", json(copia(EJ)), undefined); assert.strictEqual(sinMarca.api(sinMarca.n), null); assert.strictEqual(sinMarca.reg.fetches.length, 0, "sin indice.biodiversidad ni se pide (ni un 404 en la consola)");
  const nofetch = mundo("/t/", undefined); assert.strictEqual(nofetch.api(nofetch.n), null);
  const casos = [{ status: 404, json: () => Promise.reject(new Error("no")) }, { status: 200, json: () => Promise.reject(new Error("html")) }, json({ v: 1 }), json(null),
    json(Object.assign(copia(EJ), { fuentes: [{ titulo: "x", licencias: ["CC_BY_NC_4_0"], cita: "c", registros: 1 }] })), json(Object.assign(copia(EJ), { especies: [] }))];
  for (const c of casos) { const m = mundo("/t/", c); assert.ok(m.api(m.n)); await espera(); assert.strictEqual(m.reg.ventanas.length + m.reg.iconos.length, 0); }
  const rechaza = mundo("/t/", Promise.reject(new Error("sin red"))); const f = rechaza.api; assert.ok(f(rechaza.n));   // fetch devuelve el rechazo en lugar de la respuesta
});

test("motor: si se libera antes de que llegue el fichero, no monta nada", async () => {
  const m = mundo("/t/", json(copia(EJ))); m.api(m.n); m.reg.limpias.forEach(f => f()); await espera();
  assert.strictEqual(m.reg.ventanas.length + m.reg.iconos.length, 0);
});

test("componente: manifiesto registrado con bandera ?aves, sin escena 3D y sin tocar la voz ni los ajustes", () => {
  assert.match(FUENTE, /id: "aves-mes"/); assert.match(FUENTE, /bandera: \{ defecto: true, url: "aves" \}/); assert.match(FUENTE, /presupuesto: \{ llamadas: 0, triangulos: 0 \}/);
  assert.ok(!/\bTHREE\b|\bscene\b|\binnerHTML\b/.test(FUENTE.replace(/\/\/.*$/gm, "")), "sin geometría ni HTML");
});

// ---------- el exportador (Python, sin red) ----------
const py = python();
test("exportador: agregación, filtro de licencias y documento (prueba_biodiversidad.py con una API de GBIF falsa)", { skip: py ? false : "No hay Python 3" }, () => {
  const r = ejecuta(py, ["-P", "-E", "tuberia/biodiversidad/prueba_biodiversidad.py"]);
  assert.strictEqual(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
