"use strict";
// La entrada del cliente en TypeScript (apps/web/src/arranque.ts, A3-8c; ADR-0033 y MUNDOS §9): crea los objetos en el orden de siempre y hace el cableado.
//   1. sus pasos (`// [paso: NN_nombre]`, apps/web/herramientas/pasos.mjs) son los módulos de antes, en el mismo orden (el alfabético, que era el de montaje);
//   2. mientras convive con el legado: su JavaScript (sin tipos) es, token a token, el cuerpo de la IIFE de motor/ concatenada;
//   3. los nombres que expone cada paso a los demás son los de la foto referencias/puente_nombres.json (la misma derivación que los módulos de motor/);
//   4. --sin quita pasos enteros y solo esos, y falla con lo que no es un paso; genera_motor.mjs con la entrada nueva escribe la entrada de dos líneas.
// Solo Node.
const test = require("node:test"), assert = require("node:assert"), { pathToFileURL } = require("url");
const { RAIZ, fs, path, os, lee } = require("./_util");
const { pasos, nombresPasos, sinTipos, quitaPasos, partePasos, ARRANQUE } = require("./_pasos");
const C = require(path.join(RAIZ, "pruebas", "contrato_modulos.js"));
const acorn = require("acorn");

const WEB = path.join(RAIZ, "apps", "web"), MOTOR = path.join(WEB, "motor");
const FOTO = path.join(__dirname, "referencias", "puente_nombres.json");
let G; test.before(async () => { G = await import(pathToFileURL(path.join(WEB, "herramientas", "genera_motor.mjs")).href); });

test("los pasos del arranque son los módulos de antes, en el mismo orden (el de creación)", () => {
  const n = nombresPasos(), foto = Object.keys(JSON.parse(fs.readFileSync(FOTO, "utf8")).expone).filter(f => f !== "99_cierre.js");
  assert.deepStrictEqual(n, foto, "los pasos (y su orden) son los de la foto");
  assert.deepStrictEqual(n, n.slice().sort(), "el orden de los pasos es el alfabético de su nombre (el de montaje de siempre)");
});

test("mientras convive con motor/: el JavaScript del arranque es, token a token, el cuerpo de la IIFE concatenada", () => {
  const toks = s => [...acorn.tokenizer(s, { ecmaVersion: "latest", sourceType: "module" })].map(t => t.type.label + ":" + (t.value === undefined ? "" : String(t.value)));
  const motor = fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).sort().map(f => fs.readFileSync(path.join(MOTOR, f), "utf8")).join("");
  const a = toks(motor), b = toks(sinTipos(lee(ARRANQUE)));
  const cuerpoA = a.slice(a.indexOf("string:use strict") + 2, a.length - 5);   // (function () { "use strict"; … })();
  const cuerpoB = b.slice(b.indexOf("name:arranca") + 4, b.length - 5);          // function arranca() { … } arranca();
  let i = 0; while (i < cuerpoA.length && cuerpoA[i] === cuerpoB[i]) i++;
  assert.ok(i === cuerpoA.length && cuerpoA.length === cuerpoB.length, "difieren en el token " + i + ": " + cuerpoA.slice(i, i + 6).join(" ") + " | " + cuerpoB.slice(i, i + 6).join(" "));
});

test("los nombres que expone cada paso son los de la foto (la misma derivación que los módulos de motor/)", () => {
  const d = C.deriva(pasos()), foto = JSON.parse(fs.readFileSync(FOTO, "utf8")).expone;
  const dif = Object.keys(d.expone).filter(f => JSON.stringify(d.expone[f]) !== JSON.stringify(foto[f])).map(f => f + ": " + JSON.stringify(foto[f]) + " → " + JSON.stringify(d.expone[f]));
  assert.deepStrictEqual(dif, []);
  assert.deepStrictEqual(foto["99_cierre.js"], [], "99_cierre solo cerraba la IIFE: no tenía paso");
});

test("--sin quita pasos enteros (y solo esos), y falla con lo que no es un paso", () => {
  const ts = lee(ARRANQUE), P = partePasos(ts);
  assert.throws(() => quitaPasos(ts, ["no_existe.js"]), /no son pasos del arranque: no_existe/);
  const sin = quitaPasos(ts, ["50_decoraciones.js", "37_red"]), Q = partePasos(sin);
  assert.deepStrictEqual(Q.map(p => p.nombre), P.map(p => p.nombre).filter(n => n !== "50_decoraciones" && n !== "37_red"));
  assert.strictEqual(ts.length - sin.length, P.filter(p => ["50_decoraciones", "37_red"].includes(p.nombre)).reduce((a, p) => a + p.fin - p.inicio, 0));
  assert.ok(sin.endsWith("}\n\narranca();\n"), "lo de detrás del último paso se queda");
});

test("genera_motor.mjs con la entrada nueva: la entrada es la hoja de estilos y el arranque, y --sin deja entrada/sin.json", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-arranque-")), idx = path.join(raiz, "i.json");
  try {
    fs.writeFileSync(idx, "{}");
    G.genera(idx, raiz, [], "ts");
    assert.strictEqual(fs.readFileSync(path.join(raiz, "entrada", "motor.generado.js"), "utf8"), 'import "./plantilla.css";\nimport "@gemelo/arranque";\n');
    assert.ok(!fs.existsSync(path.join(raiz, "entrada", "sin.json")));
    G.genera(idx, raiz, ["50_decoraciones.js"], "ts");
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(raiz, "entrada", "sin.json"), "utf8")), ["50_decoraciones"]);
    assert.throws(() => G.genera(idx, raiz, ["no_existe.js"], "ts"), /no son pasos del arranque/);
    G.genera(idx, raiz, [], "ts");
    assert.ok(!fs.existsSync(path.join(raiz, "entrada", "sin.json")), "sin --sin no queda el de la vez anterior");
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
  const vc = lee("apps/web/vite.config.js");
  assert.match(vc, /\{ find: \/\^@gemelo\\\/arranque\$\/, replacement: ARRANQUE \}/, "vite.config.js: el alias de la entrada");
  assert.match(vc, /enforce: "pre"/, "el plugin que quita pasos ve el TypeScript con sus marcas");
});
