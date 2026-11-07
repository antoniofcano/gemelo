"use strict";
// La entrada del cliente en TypeScript (apps/web/src/arranque.ts, A3-8c; ADR-0033 y MUNDOS §9): crea los objetos en el orden de siempre y hace el cableado.
// Recoge las promesas de los guardianes del legado que se fueron con apps/web/motor/ (puente, trinquete_legado, estilo_motor y globales_duplicados):
//   1. sus pasos (`// [paso: NN_nombre]`, apps/web/herramientas/pasos.mjs) van en el orden alfabético de su nombre, que es el de creación de siempre;
//   2. los nombres que expone cada paso a los demás son los de la foto referencias/pasos_nombres.json (antes puente_nombres.json, sobre los ficheros
//      de motor/). Si cambian a propósito: GEMELO_PASOS_ESCRIBE=1 node --test pruebas/guardianes/arranque.test.js, y el commit dice por qué;
//   3. el cuerpo de arranca() declara con `var` y `function` (sin let, const ni class): un getter que pregunta `typeof X` por lo de un paso posterior
//      tiene que ver undefined, no un error de zona muerta (antes, estilo_motor);
//   4. ningún nombre del primer nivel de arranca() lo declaran dos pasos (se pisarían en silencio: L5-01; antes, globales_duplicados);
//   5. lo que un paso pasa POR VALOR al cargarse y define un paso posterior es una función declarada (se iza) o va anotado (antes, puente);
//   6. trinquete: el arranque solo cablea; sus líneas no pasan del tope (antes, trinquete_legado sobre motor/);
//   7. --sin quita pasos enteros y solo esos; genera_motor.mjs escribe la entrada de dos líneas.
// Lo que vigilaban puente.test.js (todo Nucleo.<x> / Mundos.<x> / Interfaz.<x> existe; nadie tapa esos nombres) lo cumple ahora tsc (tipos_web.test.js).
// Solo Node.
const test = require("node:test"), assert = require("node:assert"), { pathToFileURL } = require("url");
const { RAIZ, fs, path, os, lee } = require("./_util");
const { pasos, nombresPasos, sinTipos, quitaPasos, partePasos, deriva, ARRANQUE } = require("./_pasos");
const acorn = require("acorn");

const WEB = path.join(RAIZ, "apps", "web");
const FOTO = path.join(__dirname, "referencias", "pasos_nombres.json");
let G; test.before(async () => { G = await import(pathToFileURL(path.join(WEB, "herramientas", "genera_motor.mjs")).href); });

// 2026-11-07, A3-8c (el legado, 1.143 líneas en 93 ficheros de motor/, pasa a ser el arranque): 1.124 líneas en 92 pasos (sin la IIFE ni 99_cierre)
const TOPE = 1124;

test("los pasos del arranque son los de la foto, en el orden alfabético de su nombre (el de creación de siempre)", () => {
  const n = nombresPasos(), foto = Object.keys(JSON.parse(fs.readFileSync(FOTO, "utf8")).expone);
  assert.ok(n.length >= 30, "pocos pasos: " + n.length);
  assert.strictEqual(n[0], "01_datos.js", "el primero lee los datos de la página (#datos)");
  assert.strictEqual(n[n.length - 1], "90_final.js", "el último cablea el gestor y el bucle y arranca");
  assert.deepStrictEqual(n, n.slice().sort(), "el orden de los pasos es el alfabético de su nombre: un paso nuevo se coloca por lo que consume");
  assert.deepStrictEqual(n, foto, "los pasos son los de la foto (si se añade o se quita uno, se rehace la foto)");
});

test("los nombres que expone cada paso a los demás son los de la foto (un cambio de nombres es a propósito)", () => {
  const d = deriva(), ahora = {};
  for (const f of Object.keys(d.expone)) ahora[f] = d.expone[f];
  if (process.env.GEMELO_PASOS_ESCRIBE === "1") {
    const filas = Object.keys(ahora).map(f => "  " + JSON.stringify(f) + ": " + JSON.stringify(ahora[f]));   // un paso por línea: el diff dice cuál cambió
    fs.writeFileSync(FOTO, "{\n \"$comment\": " + JSON.stringify("Foto de los nombres que expone cada paso de apps/web/src/arranque.ts a los demás (la derivación de pruebas/guardianes/_pasos.js). La vigila pruebas/guardianes/arranque.test.js; se rehace con GEMELO_PASOS_ESCRIBE=1 solo cuando un cambio de nombres es a propósito.") +
      ",\n \"expone\": {\n" + filas.join(",\n") + "\n }\n}\n");
  }
  const foto = JSON.parse(fs.readFileSync(FOTO, "utf8")).expone;
  const dif = Object.keys(foto).filter(f => JSON.stringify(ahora[f]) !== JSON.stringify(foto[f])).map(f => f + ": " + JSON.stringify(foto[f]) + " → " + JSON.stringify(ahora[f]));
  assert.deepStrictEqual(dif, [], "cambian los nombres expuestos; si es a propósito: GEMELO_PASOS_ESCRIBE=1 node --test pruebas/guardianes/arranque.test.js");
});

/** el cuerpo de arranca(), del JavaScript del arranque: { cuerpo (sentencias), prog, js } */
function cuerpoDe(js) {
  const prog = acorn.parse(js, { ecmaVersion: "latest", sourceType: "module" });
  const fn = prog.body.find(s => s.type === "FunctionDeclaration" && s.id && s.id.name === "arranca");
  return { prog, fn, js };
}
/** las declaraciones que no son var (let, const, class) en cualquier sitio del árbol */
function noVar(n, out = []) {
  if (!n || typeof n.type !== "string") return out;
  if (n.type === "VariableDeclaration" && n.kind !== "var") out.push(n.kind + " en " + n.start);
  if (n.type === "ClassDeclaration" || n.type === "ClassExpression") out.push("class en " + n.start);
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => noVar(x, out)); else if (v && typeof v.type === "string") noVar(v, out); }
  return out;
}

test("el arranque: importaciones, arranca() y una sola llamada; su cuerpo declara con var y function (sin let, const ni class)", () => {
  const { prog, fn } = cuerpoDe(sinTipos(lee(ARRANQUE)));
  assert.ok(fn, "falta function arranca()");
  const otras = prog.body.filter(s => s !== fn && s.type !== "ImportDeclaration" && s.type !== "EmptyStatement");
  assert.strictEqual(otras.length, 1, "fuera de arranca() solo va su llamada");
  const e = otras[0].expression;
  assert.ok(e && e.type === "CallExpression" && e.callee.name === "arranca" && e.arguments.length === 0, "y es `arranca();`");
  assert.deepStrictEqual(noVar(fn.body), [], "el cableado declara con var y function: un getter que pregunta typeof por un paso posterior no puede dar con una zona muerta");
});

/** los nombres de cada declaración del primer nivel de un cuerpo: [{ nombre, desde }] */
function declarados(cuerpo) {
  const out = [], patron = (p, desde) => {
    if (!p) return;
    if (p.type === "Identifier") out.push({ nombre: p.name, desde });
    else if (p.type === "ObjectPattern") p.properties.forEach(q => patron(q.value || q.argument, desde));
    else if (p.type === "ArrayPattern") p.elements.forEach(x => patron(x, desde));
    else if (p.type === "AssignmentPattern") patron(p.left, desde);
    else if (p.type === "RestElement") patron(p.argument, desde);
  };
  for (const st of cuerpo) {
    if (st.type === "VariableDeclaration") st.declarations.forEach(d => patron(d.id, st.start));
    else if ((st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") && st.id) out.push({ nombre: st.id.name, desde: st.start });
  }
  return out;
}
/** los pasos del JavaScript del arranque con su posición, para saber de qué paso es cada nodo */
const pasoEn = js => { const P = partePasos(js); return pos => { let r = "?"; for (const p of P) if (p.inicio <= pos) r = p.nombre + ".js"; return r; }; };

test("ningún nombre del primer nivel de arranca() lo declaran dos pasos (se pisarían en silencio, L5-01)", () => {
  const js = sinTipos(lee(ARRANQUE)), { fn } = cuerpoDe(js), de = pasoEn(js), por = {};
  for (const d of declarados(fn.body.body)) (por[d.nombre] = por[d.nombre] || new Set()).add(de(d.desde));
  const repetidos = Object.entries(por).filter(([, s]) => s.size > 1).map(([n, s]) => n + ": " + [...s].join(", "));
  assert.deepStrictEqual(repetidos, [], "declarados en más de un paso:\n" + repetidos.join("\n"));
});

test("los detectores ven lo que deben: let, const y class (también dentro de funciones), y var, function y desestructurados del primer nivel", () => {
  const t = cuerpoDe("function arranca() { var a = 1, b; function f() { var interna = 2; const q = 1; } let { c, d: [e] } = x; class K {} function* g() {} }\narranca();\n");
  assert.deepStrictEqual(declarados(t.fn.body.body).map(d => d.nombre).sort(), ["K", "a", "b", "c", "e", "f", "g"]);
  assert.strictEqual(noVar(t.fn.body).length, 3, "const de dentro, let y class");
});

// A3-4: un paso que pasa POR VALOR a una fábrica (`x: x`) un nombre que define un paso POSTERIOR lo recibe undefined, salvo que sea una función declarada,
// que se iza. Es un análisis léxico: los `x: x` que van dentro de una función que corre más tarde no son problema y se anotan con su motivo.
const IZADO_OK = {
  "12b_llegada.js:enDron": "dentro de window.__llegada, que se llama en las pruebas, con todo cargado",
  "13b_hazas.js:lindes": "el return de Hazas: es su función local lindes(), no la de 15"
};
test("lo que un paso pasa por valor al cargarse y define un paso posterior es una función declarada (se iza), o va anotado", () => {
  const P = pasos(), d = deriva(P), fs2 = Object.keys(P), quien = {}, mal = [];
  fs2.forEach((f, i) => d.expone[f].forEach(n => { quien[n] = i; }));
  for (const [i, f] of fs2.entries()) {
    const s = P[f].replace(/\/\/.*$/gm, "");
    for (const m of s.matchAll(/\b([A-Za-z_$][\w$]*): \1\b(?!\s*[(.\w])/g)) {
      const n = m[1], q = quien[n];
      if (q === undefined || q <= i || IZADO_OK[f + ":" + n]) continue;
      if (!P[fs2[q]].split("\n").some(l => l.startsWith("  function " + n + "("))) mal.push(f + " pasa " + n + ", que " + fs2[q] + " no declara con function (llega undefined)");
    }
  }
  assert.deepStrictEqual(mal, []);
});

/** líneas de un texto (la última sin salto también cuenta) */
const lineas = s => s === "" ? 0 : s.split("\n").length - (s.endsWith("\n") ? 1 : 0);
test("trinquete del arranque: solo cablea; sus líneas (las de los pasos) no pasan del tope y el tope está al día", t => {
  const P = pasos(), por = Object.fromEntries(Object.entries(P).map(([f, s]) => [f, lineas(s)])), total = Object.values(por).reduce((a, n) => a + n, 0);
  const grandes = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => f + " " + n).join(", ");
  t.diagnostic("arranque: " + total + " líneas en " + Object.keys(por).length + " pasos (tope " + TOPE + "); los más grandes: " + grandes);
  assert.ok(total <= TOPE, "el arranque ha SUBIDO a " + total + " líneas (tope " + TOPE + ", +" + (total - TOPE) + "): la lógica va a su módulo de apps/web/src/ y aquí solo se cablea");
  if (total < TOPE) t.diagnostic("el arranque ha bajado a " + total + " líneas: quien fusiona baja TOPE a " + total + " (el trinquete solo baja)");
  assert.strictEqual(lineas(""), 0); assert.strictEqual(lineas("a\nb\n"), 2); assert.strictEqual(lineas("a\nb"), 2);
});

test("--sin quita pasos enteros (y solo esos), y falla con lo que no es un paso", () => {
  const ts = lee(ARRANQUE), P = partePasos(ts);
  assert.throws(() => quitaPasos(ts, ["no_existe.js"]), /no son pasos del arranque: no_existe/);
  const sin = quitaPasos(ts, ["50_decoraciones.js", "37_red"]), Q = partePasos(sin);
  assert.deepStrictEqual(Q.map(p => p.nombre), P.map(p => p.nombre).filter(n => n !== "50_decoraciones" && n !== "37_red"));
  assert.strictEqual(ts.length - sin.length, P.filter(p => ["50_decoraciones", "37_red"].includes(p.nombre)).reduce((a, p) => a + p.fin - p.inicio, 0));
  assert.ok(sin.endsWith("}\n\narranca();\n"), "lo de detrás del último paso se queda");
});

test("genera_motor.mjs: la entrada es la hoja de estilos y el arranque, y --sin deja entrada/sin.json", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-arranque-")), idx = path.join(raiz, "i.json");
  try {
    fs.writeFileSync(idx, "{}");
    G.genera(idx, raiz);
    assert.strictEqual(fs.readFileSync(path.join(raiz, "entrada", "motor.generado.js"), "utf8"), 'import "./plantilla.css";\nimport "@gemelo/arranque";\n');
    assert.strictEqual(G.ENTRADA, 'import "./plantilla.css";\nimport "@gemelo/arranque";\n');
    assert.ok(!fs.existsSync(path.join(raiz, "entrada", "sin.json")));
    G.genera(idx, raiz, ["50_decoraciones.js"]);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(raiz, "entrada", "sin.json"), "utf8")), ["50_decoraciones"]);
    assert.throws(() => G.genera(idx, raiz, ["no_existe.js"]), /no son pasos del arranque/);
    G.genera(idx, raiz);
    assert.ok(!fs.existsSync(path.join(raiz, "entrada", "sin.json")), "sin --sin no queda el de la vez anterior");
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
  const vc = lee("apps/web/vite.config.js");
  assert.match(vc, /\{ find: \/\^@gemelo\\\/arranque\$\/, replacement: ARRANQUE \}/, "vite.config.js: el alias de la entrada");
  assert.match(vc, /enforce: "pre"/, "el plugin que quita pasos ve el TypeScript con sus marcas");
  assert.ok(!fs.existsSync(path.join(WEB, "motor")), "apps/web/motor/ ya no existe (A3-8c)");
});
