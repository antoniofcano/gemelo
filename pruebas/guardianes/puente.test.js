"use strict";
// El puente entre el código nuevo (apps/web/src/, TypeScript) y el motor legado (apps/web/motor/, la IIFE concatenada): MUNDOS §9.3, ADR-0033.
//   1. el texto que escribe genera_motor.mjs es EL DE ANTES más una línea, `import * as Nucleo from "@gemelo/nucleo";` (la de antes se escribe
//      aquí a mano, sin las constantes de genera_motor, para que el guardián no se dé la razón a sí mismo); también con --sin;
//   2. los nombres que expone cada módulo del motor (la derivación de pruebas/contrato_modulos.js) son los de la foto
//      referencias/puente_nombres.json: un talón conserva los nombres del módulo que sustituye. Si cambian a propósito, se rehace la foto con
//      GEMELO_PUENTE_ESCRIBE=1 node --test pruebas/guardianes/puente.test.js, y el commit dice por qué;
//   3. ningún módulo legado declara Nucleo, y todo Nucleo.<x> que nombra el legado lo exporta apps/web/src/nucleo/index.ts;
//   4. los talones (un módulo migrado que queda en motor/ con su nombre, su sitio y su cabecera) tienen la forma de MUNDOS §9.3: la marca
//      `// [talón] apps/web/src/….ts` (que existe) y solo `var X = …Nucleo.…;`, en pocas líneas;
//   5. las dos builds (pantalla y vr) resuelven «@gemelo/nucleo» con la configuración de verdad (vite.config.js) y el paquete lleva el núcleo.
//      Con Vite de verdad sobre una entrada mínima armada con las mismas importaciones que el motor (el motor entero lo construyen en las dos
//      builds builds_f2.test.js y build.test.js, que fallan si la importación no se resuelve). Solo Node: sin Chrome.
const test = require("node:test"), assert = require("node:assert"), { pathToFileURL } = require("url");
const { RAIZ, fs, path, os, ejecuta } = require("./_util");
const C = require(path.join(RAIZ, "pruebas", "contrato_modulos.js"));
const acorn = require("acorn");

const WEB = path.join(RAIZ, "apps", "web"), MOTOR = path.join(WEB, "motor"), NUCLEO = path.join(WEB, "src", "nucleo", "index.ts");
const FOTO = path.join(__dirname, "referencias", "puente_nombres.json");
const VITE = path.join(WEB, "node_modules", "vite", "bin", "vite.js");
const SALTO_VITE = !fs.existsSync(VITE) || !fs.existsSync(path.join(WEB, "node_modules", "3d-tiles-renderer", "build", "index.js")) ? "falta Vite o 3d-tiles-renderer: cd apps/web && npm ci" : null;
const SALTO_VR = !fs.existsSync(path.join(WEB, "node_modules", "super-three", "build", "three.module.js")) ? "falta super-three: cd apps/web && npm ci" : null;

// lo que escribía genera_motor.mjs antes del puente (main en 75a2442), escrito a mano
const ANTES = 'import * as THREE from "three";\nimport "./plantilla.css";\n';
const LINEA_PUENTE = 'import * as Nucleo from "@gemelo/nucleo";\n';
const LINEA_MUNDOS = 'import * as Mundos from "@gemelo/mundos";\n';   // MU2-3: el exterior, que nucleo/ no puede importar
const MARCA_TALON = /^\s*\/\/ \[talón\] (apps\/web\/src\/\S+\.ts)\s*$/m;
const MAX_LINEAS_TALON = 30;

let G; test.before(async () => { G = await import(pathToFileURL(path.join(WEB, "herramientas", "genera_motor.mjs")).href); });
const ficheros = () => fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).sort();
const concatena = (sin = []) => ficheros().filter(f => !sin.includes(f)).map(f => fs.readFileSync(path.join(MOTOR, f), "utf8")).join("");
const sinCabecera = s => s.startsWith(C.MARCA_I) ? s.slice(s.indexOf(C.MARCA_F) + C.MARCA_F.length + 1) : s;

test("el texto generado es el de antes con dos líneas de más: la importación del núcleo y la de los mundos, tras la de three (también con --sin)", () => {
  for (const sin of [[], ["35_fichas_tiempo.js"]]) {
    const txt = G.entradaMotor(sin), antes = ANTES + concatena(sin);
    assert.ok(txt.startsWith('import * as THREE from "three";\n' + LINEA_PUENTE + LINEA_MUNDOS), "la segunda y la tercera línea deben ser las de los puentes");
    assert.strictEqual(txt.split(LINEA_PUENTE).length, 2, "la línea del puente, exactamente una vez");
    assert.strictEqual(txt.split(LINEA_MUNDOS).length, 2, "la línea de los mundos, exactamente una vez");
    assert.strictEqual(txt.replace(LINEA_PUENTE, "").replace(LINEA_MUNDOS, ""), antes, "quitadas las líneas de los puentes, el texto debe ser el de antes" + (sin.length ? " (--sin " + sin + ")" : ""));
  }
  // y genera() escribe justo eso
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-puente-")), idx = path.join(raiz, "i.json");
  try {
    fs.writeFileSync(idx, "{}"); G.genera(idx, raiz);
    assert.strictEqual(fs.readFileSync(path.join(raiz, "entrada", "motor.generado.js"), "utf8"), G.entradaMotor());
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});

test("los nombres que expone cada módulo del motor son los de la foto (un talón conserva los del módulo que sustituye)", () => {
  const d = C.deriva(), ahora = {};
  for (const f of Object.keys(d.expone).sort()) ahora[f] = d.expone[f];
  if (process.env.GEMELO_PUENTE_ESCRIBE === "1") {
    const filas = Object.keys(ahora).map(f => "  " + JSON.stringify(f) + ": " + JSON.stringify(ahora[f]));   // un módulo por línea: el diff dice cuál cambió
    fs.writeFileSync(FOTO, "{\n \"$comment\": " + JSON.stringify("Foto de los nombres que expone cada módulo de apps/web/motor/ (derivación de pruebas/contrato_modulos.js). La vigila pruebas/guardianes/puente.test.js; se rehace con GEMELO_PUENTE_ESCRIBE=1 solo cuando un cambio de nombres es a propósito.") +
      ",\n \"expone\": {\n" + filas.join(",\n") + "\n }\n}\n");
  }
  const foto = JSON.parse(fs.readFileSync(FOTO, "utf8")).expone;
  assert.deepStrictEqual(Object.keys(ahora), Object.keys(foto), "los ficheros del motor no son los de la foto (un talón conserva su nombre de fichero)");
  const dif = Object.keys(foto).filter(f => JSON.stringify(ahora[f]) !== JSON.stringify(foto[f])).map(f => f + ": " + JSON.stringify(foto[f]) + " → " + JSON.stringify(ahora[f]));
  assert.deepStrictEqual(dif, [], "cambian los nombres expuestos; si es a propósito: GEMELO_PUENTE_ESCRIBE=1 node --test pruebas/guardianes/puente.test.js");
});

/** los Nucleo.<x> que nombra un texto de código (tokens de acorn: ni comentarios ni cadenas) y si declara «Nucleo» */
function usosNucleo(s) {
  const toks = [...acorn.tokenizer(s, { ecmaVersion: "latest", allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true })], usos = new Set();
  let declara = false;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type.label !== "name" || toks[i].value !== "Nucleo") continue;
    const a = toks[i - 1], b = toks[i + 1], c = toks[i + 2];
    if (a && (a.type.label === "." || a.type.label === "?.")) continue;                      // x.Nucleo: una propiedad, no el núcleo
    if (a && ["var", "let", "const", "function", "class"].includes(a.type.keyword || a.value)) declara = true;
    if (b && b.type.label === "." && c && c.type.label === "name") usos.add(c.value);
  }
  return { usos, declara };
}

test("ningún módulo legado declara Nucleo y todo Nucleo.<x> del legado lo exporta apps/web/src/nucleo/index.ts", async () => {
  const exporta = new Set(Object.keys(await import(pathToFileURL(NUCLEO).href)));
  assert.ok(exporta.size > 0, "el núcleo no exporta nada");
  const mal = [];
  for (const f of ficheros()) {
    const { usos, declara } = usosNucleo("(function () {\n" + sinCabecera(fs.readFileSync(path.join(MOTOR, f), "utf8")) + "\n})");
    if (declara) mal.push(f + ": declara Nucleo (taparía el núcleo del puente)");
    for (const u of usos) if (!exporta.has(u)) mal.push(f + ": Nucleo." + u + " no lo exporta apps/web/src/nucleo/index.ts");
  }
  assert.deepStrictEqual(mal, []);
  // la regla del lector, sobre un caso inventado
  const r = usosNucleo('var a = Nucleo.creaCola({}); // Nucleo.comentario\nvar s = "Nucleo.cadena"; o.Nucleo.prop; var Nucleo = 1;');
  assert.deepStrictEqual([...r.usos], ["creaCola"]); assert.ok(r.declara);
});

/** errores de forma de un talón (MUNDOS §9.3); [] si está bien. texto = el fichero entero (con su cabecera) */
function revisaTalon(nombre, texto) {
  const err = [], m = MARCA_TALON.exec(texto);
  if (!m) return [nombre + ": no lleva la marca «// [talón] apps/web/src/….ts»"];
  if (!fs.existsSync(path.join(RAIZ, m[1]))) err.push(nombre + ": su marca apunta a " + m[1] + ", que no existe");
  if (!texto.startsWith(C.MARCA_I)) err.push(nombre + ": sin la cabecera «Expone / Consume»");
  const cuerpo = sinCabecera(texto), codigo = cuerpo.split("\n").filter(l => l.trim() && !/^\s*\/\//.test(l));
  if (codigo.length > MAX_LINEAS_TALON) err.push(nombre + ": " + codigo.length + " líneas de código (un talón no pasa de " + MAX_LINEAS_TALON + ")");
  let prog;
  try { prog = acorn.parse(cuerpo, { ecmaVersion: "latest", sourceType: "script" }); } catch (e) { return err.concat(nombre + ": no es JavaScript válido: " + e.message); }
  for (const st of prog.body) {
    // A3-1b: el talón de un componente del exterior registra el manifiesto que le da apps/web/src/mundos: `Componentes.registra(Mundos.<x>({ … }));`
    if (st.type === "ExpressionStatement" && /^Componentes\.registra\(Mundos\.[A-Za-z_$][\w$]*\(/.test(cuerpo.slice(st.start, st.end))) continue;
    if (st.type !== "VariableDeclaration" || st.kind !== "var") { err.push(nombre + ": un talón solo lleva `var X = …Nucleo…;` o `Componentes.registra(Mundos.…)` (hay " + st.type + ")"); continue; }
    for (const dcl of st.declarations) {
      const ini = dcl.init ? cuerpo.slice(dcl.init.start, dcl.init.end) : "";
      if (!usosNucleo(ini).usos.size && !/(?<![\w.$])Mundos\.[A-Za-z_$]/.test(ini)) err.push(nombre + ": " + (dcl.id.name || "?") + " no sale del núcleo ni de los mundos (Nucleo.<x>, Mundos.<x>)");
    }
  }
  for (const l of cuerpo.split("\n")) if (/^\s*var\s/.test(l) && !/^  var\s/.test(l)) err.push(nombre + ": `var` con sangría de dos espacios, o contrato_modulos.js no ve lo que expone");
  return err;
}

test("los talones de apps/web/motor/ tienen la forma de MUNDOS §9.3 (marca, cabecera, solo var X = Nucleo.…)", t => {
  const talones = ficheros().filter(f => MARCA_TALON.test(fs.readFileSync(path.join(MOTOR, f), "utf8")));
  t.diagnostic("talones: " + (talones.length ? talones.join(", ") : "ninguno todavía (el primero, 02b_cola.js, en A1-10)"));
  assert.deepStrictEqual(talones.flatMap(f => revisaTalon(f, fs.readFileSync(path.join(MOTOR, f), "utf8"))), []);
});

// A3-4: un módulo del motor que pasa POR VALOR a una fábrica (`x: x`) un nombre que define un módulo POSTERIOR en el montaje lo recibe undefined, salvo que
// sea una función declarada, que se iza. Al migrar, `function x` pasa a `var x = Y.x` y deja de izarse: aquí se ve (08_marcadores pasaba colocaBarrera y
// recoloreaSuelo). Es un análisis léxico: los `x: x` que van dentro de una función que corre más tarde no son problema y se anotan con su motivo.
const IZADO_OK = {
  "02c_componentes.js:listo": "el return de Config: es su propio listo, no el de 08",
  "12b_llegada.js:enDron": "dentro de window.__llegada, que se llama en las pruebas, con todo cargado",
  "13b_hazas.js:lindes": "el return de Hazas: es su función local lindes(), no la de 15"
};
test("lo que un módulo pasa por valor al cargarse y define un módulo posterior es una función declarada (se iza), o va anotado", () => {
  const d = C.deriva(), fs2 = Object.keys(d.expone).sort(), quien = {}, mal = [];
  fs2.forEach((f, i) => d.expone[f].forEach(n => { quien[n] = i; }));
  for (const [i, f] of fs2.entries()) {
    const s = fs.readFileSync(path.join(MOTOR, f), "utf8").replace(/\/\/.*$/gm, "");
    for (const m of s.matchAll(/\b([A-Za-z_$][\w$]*): \1\b(?!\s*[(.\w])/g)) {
      const n = m[1], q = quien[n];
      if (q === undefined || q <= i || IZADO_OK[f + ":" + n]) continue;
      const def = fs.readFileSync(path.join(MOTOR, fs2[q]), "utf8");
      if (!def.split("\n").some(l => l.startsWith("  function " + n + "("))) mal.push(f + " pasa " + n + ", que " + fs2[q] + " no declara con function (llega undefined)");
    }
  }
  assert.deepStrictEqual(mal, []);
});

test("la regla de los talones, sobre talones inventados: acepta el de MUNDOS §9.3 y rechaza lo que no lo es", () => {
  const cab = C.MARCA_I + "\n// Expone: CargaPuro, Cola\n// Consume: 02_mundo (Mundo)\n" + C.MARCA_F + "\n";
  const bien = cab + "  // [talón] apps/web/src/nucleo/index.ts\n" + "  // la Cola vive en el núcleo\n  var CargaPuro = Nucleo.CargaPuro;\n  var Cola = Nucleo.creaCola({\n    mundo: Mundo,\n  });\n";
  assert.deepStrictEqual(revisaTalon("bien.js", bien), []);
  const sinMarca = bien.replace(/ *\/\/ \[talón\][^\n]*\n/, "");
  assert.match(revisaTalon("x.js", sinMarca)[0], /no lleva la marca/);
  assert.match(revisaTalon("x.js", bien.replace("nucleo/index.ts", "nucleo/no_existe.ts")).join(), /no existe/);
  assert.match(revisaTalon("x.js", bien + "  function otra() { return 1; }\n").join(), /solo lleva `var X/);
  assert.match(revisaTalon("x.js", bien + "  var Suelta = 3;\n").join(), /Suelta no sale del núcleo/);
  assert.match(revisaTalon("x.js", bien + "var Pegada = Nucleo.CargaPuro;\n").join(), /sangría de dos espacios/);
  assert.match(revisaTalon("x.js", bien.slice(cab.length)).join(), /sin la cabecera/);
  assert.match(revisaTalon("x.js", bien + "  var Z = Nucleo.CargaPuro;\n".repeat(MAX_LINEAS_TALON)).join(), /no pasa de/);
});

/** construye con Vite y la configuración de apps/web una entrada mínima con las mismas importaciones que el motor y un talón dentro de la IIFE */
function construyeMini(build) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-puente-raiz-")), sal = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-puente-dist-"));
  try {
    fs.writeFileSync(path.join(raiz, "index.html"), '<!doctype html>\n<html><head><meta charset="utf-8"></head><body><script type="module" src="./e.js"></script></body></html>\n');
    fs.writeFileSync(path.join(raiz, "e.js"), G.IMPORTA_THREE + G.IMPORTA_NUCLEO + G.IMPORTA_MUNDOS +
      '(function () {\n  "use strict";\n  var partesDeVersion = Nucleo.partesDeVersion;\n  document.title = partesDeVersion("1.2.3").join("-") + " " + THREE.REVISION;\n})();\n');
    const env = Object.assign({}, process.env, { GEMELO_WEB_RAIZ: raiz, GEMELO_WEB_SALIDA: sal, GEMELO_BUILD: build });
    delete env.GEMELO_SUPER_THREE;
    const r = ejecuta(process.execPath, [VITE, "build", "--config", path.join(WEB, "vite.config.js")], { cwd: WEB, env });
    assert.strictEqual(r.status, 0, "vite build (" + build + ") falló:\n" + r.stdout + r.stderr);
    assert.ok(!/Could not resolve|failed to resolve/i.test(r.stdout + r.stderr), "«@gemelo/nucleo» sin resolver en la build " + build + ":\n" + r.stdout + r.stderr);
    const dir = path.join(sal, "assets");
    return fs.readdirSync(dir).filter(f => f.endsWith(".js")).map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); fs.rmSync(sal, { recursive: true, force: true }); }
}

test("las dos builds resuelven «@gemelo/nucleo» (vite.config.js) y el paquete lleva el núcleo: pantalla con three 0.186, vr con super-three 0.185", { timeout: 300000 }, t => {
  if (SALTO_VITE) return t.skip(SALTO_VITE);
  if (SALTO_VR) return t.skip(SALTO_VR);
  const NUCLEO_EN_JS = "(\\d+)\\.(\\d+)\\.(\\d+)";   // la expresión de partesDeVersion (src/nucleo/version.ts) sobrevive a la minificación
  for (const [build, rev, otra] of [["pantalla", "186", "185"], ["vr", "185", "186"]]) {
    const js = construyeMini(build);
    assert.ok(js.includes(NUCLEO_EN_JS), "el núcleo (partesDeVersion) no está en el paquete de la build " + build);
    assert.ok(js.includes('"' + rev + '"'), "three " + rev + " en la build " + build);
    assert.ok(!js.includes('="' + otra + '"'), "el three de la otra build (" + otra + ") se coló en la de " + build);
  }
});

test("el alias del núcleo es el mismo en Vite y en TypeScript, y lleva a apps/web/src/nucleo/index.ts", async () => {
  const ts = JSON.parse(fs.readFileSync(path.join(WEB, "tsconfig.json"), "utf8"));
  assert.deepStrictEqual(ts.compilerOptions.paths["@gemelo/nucleo"], ["./src/nucleo/index.ts"]);
  const vc = fs.readFileSync(path.join(WEB, "vite.config.js"), "utf8");
  assert.match(vc, /\{ find: \/\^@gemelo\\\/nucleo\$\/, replacement: NUCLEO \}/, "vite.config.js: el alias de «@gemelo/nucleo»");
  assert.match(vc, /export const NUCLEO = path\.join\(WEB, "src", "nucleo", "index\.ts"\);/);
  assert.strictEqual(G.IMPORTA_NUCLEO, LINEA_PUENTE);
  // y el de los mundos (MU2-3)
  assert.deepStrictEqual(ts.compilerOptions.paths["@gemelo/mundos"], ["./src/mundos/index.ts"]);
  assert.match(vc, /\{ find: \/\^@gemelo\\\/mundos\$\/, replacement: MUNDOS \}/, "vite.config.js: el alias de «@gemelo/mundos»");
  assert.match(vc, /export const MUNDOS = path\.join\(WEB, "src", "mundos", "index\.ts"\);/);
  assert.strictEqual(G.IMPORTA_MUNDOS, LINEA_MUNDOS);
});

test("todo Mundos.<x> del legado lo exporta apps/web/src/mundos/index.ts, y ningún módulo declara Mundos", async () => {
  const exporta = new Set(Object.keys(await import(pathToFileURL(path.join(WEB, "src", "mundos", "index.ts")).href)));
  assert.ok(exporta.has("creaExterior"));
  const mal = [];
  for (const f of ficheros()) {
    const src = sinCabecera(fs.readFileSync(path.join(MOTOR, f), "utf8"));
    if (/\b(var|let|const|function)\s+Mundos\b/.test(src)) mal.push(f + ": declara Mundos (taparía el puente de los mundos)");
    for (const m of src.matchAll(/(?<![\w.$])Mundos\.([A-Za-z_$][\w$]*)/g)) if (!exporta.has(m[1])) mal.push(f + ": Mundos." + m[1] + " no lo exporta apps/web/src/mundos/index.ts");
  }
  assert.deepStrictEqual(mal, []);
});
