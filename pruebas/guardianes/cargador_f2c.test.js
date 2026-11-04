"use strict";
// F2c (ADR-0031): el cargador que elige build y la composición de lo publicado (apps/web/herramientas/cargador.mjs y publica_builds.mjs). Solo Node:
//   · el cargador se EJECUTA (vm) sobre un navigator, un location y un document de mentira: Quest, escritorio, móvil, ?build= forzado, sin build de VR,
//     la VR que falla al cargar (error del <script>) y cae a pantalla;
//   · el cargador usa las MISMAS funciones del repo (eligeBuild y el trozo [puro] de 01a_aparato.js), copiadas tal cual;
//   · la composición (compone): el manifiesto, la página sin entrada de Vite y con el cargador (sin script en línea: la CSP), las rutas de vr/, y con una
//     sola build todo queda como hoy (manifiesto solo con «pantalla», sin vr/);
//   · con builds de Vite de verdad (entrada mínima, super-three de mentira) si Vite está instalado.
// NO probado: un Quest real (qué agente anuncia, si el 404 de la build de VR llega como «error» del script en su navegador).
const test = require("node:test"), assert = require("node:assert"), path = require("path"), os = require("os"), vm = require("vm"), { pathToFileURL } = require("url");
const { RAIZ, fs, lee, ejecuta } = require("./_util");

const WEB = path.join(RAIZ, "apps/web"), VITE = path.join(WEB, "node_modules/vite/bin/vite.js");
const SALTO_VITE = !fs.existsSync(VITE) || !fs.existsSync(path.join(WEB, "node_modules/3d-tiles-renderer/build/index.js")) ? "falta Vite o 3d-tiles-renderer: cd apps/web && npm ci" : null;
const imp = f => import(pathToFileURL(path.join(WEB, "herramientas", f)).href);
let C, P;
test.before(async () => { C = await imp("cargador.mjs"); P = await imp("publica_builds.mjs"); });

const UA = {
  quest3: "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/41.0 Chrome/132.0 VR Safari/537.36",
  escritorio: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
const MAN = vr => {
  const b = { pantalla: { entrada: "assets/index-AAA.js", huella: "aaaaaaaaaaaa", css: ["assets/index-AAA.css"], precarga: ["assets/chunk-AAA.js"] } };
  if (vr) b.vr = { entrada: "vr/assets/index-BBB.js", huella: "bbbbbbbbbbbb", css: ["vr/assets/index-BBB.css"], precarga: ["vr/assets/chunk-BBB.js"] };
  return { version: 1, predeterminada: "pantalla", builds: b };
};

/** ejecuta el cargador generado sobre una página de mentira; devuelve lo que inyectó y permite fallar un script */
function pagina(man, ua, busqueda) {
  const hijos = [], mk = tag => { const e = { tag, attrs: {}, escuchas: {}, quitado: false,
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.escuchas[t] = f; }, remove() { this.quitado = true; } }; return e; };
  const doc = { head: { appendChild: e => hijos.push(e) }, body: { appendChild: e => hijos.push(e) }, documentElement: {},
    createElement: mk, querySelectorAll: sel => { const b = /data-build="([^"]+)"/.exec(sel)[1]; return hijos.filter(e => e.attrs["data-build"] === b); } };
  const ventana = {}, avisos = [];
  const ctx = vm.createContext({ document: doc, navigator: { userAgent: ua, maxTouchPoints: 0, deviceMemory: 8 }, location: { search: busqueda || "" }, window: ventana, console: { warn: m => avisos.push(m) } });
  vm.runInContext(C.generaCargador(man), ctx);
  const vivos = () => hijos.filter(e => !e.quitado);
  return { hijos, vivos, avisos, estado: () => ventana.__gemeloCargador,
    scripts: () => vivos().filter(e => e.tag === "script").map(e => e.attrs.src),
    fallaScript: n => hijos.find(e => e.tag === "script" && e.attrs["data-build"] === n).escuchas.error() };
}

test("el cargador elige: Quest con la build de VR publicada → vr; escritorio y móvil → pantalla", () => {
  const q = pagina(MAN(true), UA.quest3);
  assert.deepStrictEqual(q.scripts(), ["./vr/assets/index-BBB.js"]);
  assert.strictEqual(q.estado().build, "vr"); assert.strictEqual(q.estado().clase, "quest");
  for (const ua of [UA.escritorio, UA.iphone]) {
    const p = pagina(MAN(true), ua);
    assert.deepStrictEqual(p.scripts(), ["./assets/index-AAA.js"], ua);
    assert.strictEqual(p.estado().build, "pantalla");
  }
  // la hoja y la precarga son las de LA build elegida, y solo una build entra en la página
  assert.deepStrictEqual(q.hijos.filter(e => e.tag === "link").map(e => e.attrs.href), ["./vr/assets/index-BBB.css", "./vr/assets/chunk-BBB.js"]);
  assert.deepStrictEqual(q.hijos.filter(e => e.tag === "script").map(e => e.attrs.type), ["module"]);
});

test("el cargador: ?build=pantalla|vr fuerza; ?build=vr sin build de VR → pantalla; el Quest sin build de VR → pantalla", () => {
  assert.deepStrictEqual(pagina(MAN(true), UA.quest3, "?build=pantalla").scripts(), ["./assets/index-AAA.js"]);
  assert.deepStrictEqual(pagina(MAN(true), UA.escritorio, "?debug&build=vr").scripts(), ["./vr/assets/index-BBB.js"]);
  assert.deepStrictEqual(pagina(MAN(false), UA.escritorio, "?build=vr").scripts(), ["./assets/index-AAA.js"]);
  const q = pagina(MAN(false), UA.quest3);
  assert.deepStrictEqual(q.scripts(), ["./assets/index-AAA.js"]); assert.strictEqual(q.estado().hayVR, false);
});

test("el cargador: si la build de VR falla al cargar, se quita lo suyo y se carga la de pantalla (una sola vez)", () => {
  const q = pagina(MAN(true), UA.quest3);
  q.fallaScript("vr");
  assert.deepStrictEqual(q.scripts(), ["./assets/index-AAA.js"], "queda solo la de pantalla");
  assert.ok(q.vivos().every(e => e.attrs["data-build"] === "pantalla"), "ni rastro de lo de vr (css, precarga)");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(q.estado())), { build: "pantalla", clase: "quest", hayVR: true, cayo: true });
  assert.strictEqual(q.avisos.length, 1);
  // la de pantalla no lleva «cae a»: si falla, no hay otra
  const e = pagina(MAN(true), UA.escritorio);
  assert.strictEqual(e.hijos.find(x => x.tag === "script").escuchas.error, undefined);
});

test("el cargador copia, tal cual, eligeBuild de builds.mjs y el trozo puro de 01a_aparato.js (una sola detección, una sola regla)", async () => {
  const B = await imp("builds.mjs"), codigo = C.generaCargador(MAN(true));
  assert.ok(codigo.includes(B.eligeBuild.toString().replace(/\n/g, "\n  ")), "eligeBuild copiada");
  assert.ok(codigo.includes(C.fuenteAparatoPuro()), "AparatoPuro copiado");
  assert.match(codigo, /var AparatoPuro = /);
  assert.doesNotMatch(codigo, /\bimport\b|\bexport\b/, "script clásico: sin import/export");
  assert.doesNotMatch(codigo, /\bfetch\(|XMLHttpRequest|eval\(|new Function/, "sin peticiones ni eval (CSP): el manifiesto va dentro");
  new vm.Script(codigo);   // sintaxis
});

function viteHtml(base) {
  return '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>Gemelo</title>\n<script type="module" crossorigin src="./assets/index-' + base + '.js"></script>\n<link rel="modulepreload" crossorigin href="./assets/chunk-' + base + '.js">\n' +
    '<link rel="stylesheet" crossorigin href="./assets/index-' + base + '.css">\n<link rel="manifest" href="./manifest.webmanifest">\n</head>\n<body>\n<div id="visor"></div>\n' +
    '<script type="application/json" id="datos">{"a":1}</script>\n</body>\n</html>\n';
}
function dist(base, extra) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-dist-f2c-"));
  fs.mkdirSync(path.join(d, "assets")); fs.mkdirSync(path.join(d, "xr"));
  fs.writeFileSync(path.join(d, "index.html"), viteHtml(base));
  for (const f of ["index-" + base + ".js", "chunk-" + base + ".js", "index-" + base + ".css"]) fs.writeFileSync(path.join(d, "assets", f), "// " + base + " " + f + "\n");
  fs.writeFileSync(path.join(d, "xr", "p.json"), "{}"); fs.writeFileSync(path.join(d, "manifest.webmanifest"), "{}");
  return d;
}

test("compone con las dos builds: página con el cargador (sin entrada de Vite ni script en línea), vr/assets, manifiesto con huellas", () => {
  const p = dist("AAA"), v = dist("BBB"), dest = path.join(os.tmpdir(), "gemelo-pub-f2c-" + process.pid);
  try {
    const r = P.compone(p, v, dest), m = r.manifiesto;
    assert.deepStrictEqual(Object.keys(m.builds), ["pantalla", "vr"]);
    assert.strictEqual(m.builds.pantalla.entrada, "assets/index-AAA.js"); assert.strictEqual(m.builds.vr.entrada, "vr/assets/index-BBB.js");
    assert.deepStrictEqual(m.builds.vr.css, ["vr/assets/index-BBB.css"]); assert.deepStrictEqual(m.builds.vr.precarga, ["vr/assets/chunk-BBB.js"]);
    assert.match(m.builds.vr.huella, /^[0-9a-f]{12}$/); assert.notStrictEqual(m.builds.vr.huella, m.builds.pantalla.huella);
    assert.strictEqual(m.builds.pantalla.huella, require("crypto").createHash("sha256").update(fs.readFileSync(path.join(p, "assets/index-AAA.js"))).digest("hex").slice(0, 12));
    assert.match(m.cargador, /^assets\/cargador-[0-9a-f]{12}\.js$/);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dest, "builds.json"), "utf8")), m, "builds.json = el manifiesto");
    const h = fs.readFileSync(path.join(dest, "index.html"), "utf8");
    assert.doesNotMatch(h, /index-AAA|chunk-AAA|type="module"/, "la entrada de Vite la pone el cargador");
    assert.strictEqual([...h.matchAll(/<script\b[^>]*>/g)].filter(x => !/\bsrc=/.test(x[0]) && !/application\/json/.test(x[0])).length, 0, "sin scripts en línea (CSP script-src 'self')");
    assert.match(h, /<script src="\.\/assets\/cargador-[0-9a-f]{12}\.js"><\/script>\s*<\/body>/);
    assert.match(h, /id="datos"/, "el índice de la finca sigue en la página");
    assert.match(h, /rel="manifest"/, "lo demás de la cabecera, intacto");
    for (const f of ["assets/index-AAA.js", "vr/assets/index-BBB.js", "vr/assets/chunk-BBB.js", "vr/assets/index-BBB.css", "xr/p.json", "manifest.webmanifest", m.cargador]) assert.ok(fs.existsSync(path.join(dest, f)), "falta " + f);
    assert.ok(!fs.existsSync(path.join(dest, "vr", "index.html")) && !fs.existsSync(path.join(dest, "vr", "xr")), "de vr/ solo assets/");
    assert.ok(fs.readFileSync(path.join(p, "index.html"), "utf8").includes('type="module"'), "dist/ no se toca");
    assert.strictEqual(fs.readFileSync(path.join(dest, m.cargador), "utf8"), C.generaCargador(manifiesto0(m)), "el cargador publicado lleva el manifiesto");
  } finally { for (const d of [p, v, dest]) fs.rmSync(d, { recursive: true, force: true }); }
});
function manifiesto0(m) { const c = JSON.parse(JSON.stringify(m)); delete c.cargador; return c; }

test("compone con UNA sola build: todo como hoy (manifiesto solo con pantalla, sin vr/; el Quest carga la de pantalla); sin dist-vr o con uno vacío, igual", () => {
  const p = dist("AAA"), vacio = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-vacio-")), dest = path.join(os.tmpdir(), "gemelo-pub1-f2c-" + process.pid);
  try {
    for (const v of [null, path.join(p, "no-existe"), vacio]) {
      const avisar = console.warn; console.warn = () => {};
      try { const r = P.compone(p, v, dest); assert.deepStrictEqual(Object.keys(r.manifiesto.builds), ["pantalla"]); } finally { console.warn = avisar; }
      assert.ok(!fs.existsSync(path.join(dest, "vr")), "sin carpeta vr/");
    }
    const q = pagina(JSON.parse(fs.readFileSync(path.join(dest, "builds.json"), "utf8")), UA.quest3);
    assert.deepStrictEqual(q.scripts(), ["./assets/index-AAA.js"]);
    assert.throws(() => P.compone(path.join(p, "x"), null, dest), /no hay build de pantalla/);
    assert.throws(() => P.compone(p, null, p), /dest no puede ser/);
  } finally { for (const d of [p, vacio, dest]) fs.rmSync(d, { recursive: true, force: true }); }
});

test("con builds de Vite de verdad (entrada mínima; super-three de mentira): leeIndiceVite lee lo que Vite escribe y compone sirve", async t => {
  if (SALTO_VITE) return t.skip(SALTO_VITE);
  const st = fs.mkdtempSync(path.join(os.tmpdir(), "super-three-stub-"));
  fs.mkdirSync(path.join(st, "build"), { recursive: true });
  fs.writeFileSync(path.join(st, "package.json"), JSON.stringify({ name: "super-three", version: "0.185.0", type: "module" }));
  fs.writeFileSync(path.join(st, "build/three.module.js"), 'export const REVISION = "185-STUB";\n');
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-raiz-f2c-")), sp = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-sp-f2c-")), sv = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-sv-f2c-"));
  const dest = path.join(os.tmpdir(), "gemelo-pubv-f2c-" + process.pid);
  fs.writeFileSync(path.join(raiz, "index.html"), '<!doctype html>\n<html><head><meta charset="utf-8"></head><body><script type="module" src="./e.js"></script></body></html>\n');
  fs.writeFileSync(path.join(raiz, "e.js"), 'import * as THREE from "three";\nimport "./e.css";\nimport("./l.js");\ndocument.title = THREE.REVISION;\n');
  fs.writeFileSync(path.join(raiz, "e.css"), "body{margin:0}\n"); fs.writeFileSync(path.join(raiz, "l.js"), "export const x = 1;\n");
  try {
    for (const [sal, env] of [[sp, { GEMELO_BUILD: "" }], [sv, { GEMELO_BUILD: "vr", GEMELO_SUPER_THREE: st }]]) {
      const r = ejecuta(process.execPath, [VITE, "build", "--config", path.join(WEB, "vite.config.js")], { cwd: WEB, env: Object.assign({}, process.env, { GEMELO_WEB_RAIZ: raiz, GEMELO_WEB_SALIDA: sal }, env) });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    }
    const ix = C.leeIndiceVite(fs.readFileSync(path.join(sp, "index.html"), "utf8"));
    assert.match(ix.entrada, /^assets\/index-.*\.js$/); assert.strictEqual(ix.css.length, 1);
    const r = P.compone(sp, sv, dest), m = r.manifiesto;
    assert.deepStrictEqual(Object.keys(m.builds), ["pantalla", "vr"]);
    for (const b of Object.values(m.builds)) for (const f of [b.entrada, ...b.css, ...b.precarga]) assert.ok(fs.existsSync(path.join(dest, f)), "falta " + f);
    assert.ok(fs.readFileSync(path.join(dest, m.builds.vr.entrada), "utf8").includes("185-STUB"), "la entrada de vr/ es la de super-three");
    assert.ok(!fs.readFileSync(path.join(dest, m.builds.pantalla.entrada), "utf8").includes("185-STUB"));
    assert.strictEqual(pagina(m, UA.quest3).scripts()[0], "./" + m.builds.vr.entrada);
  } finally { for (const d of [st, raiz, sp, sv, dest]) fs.rmSync(d, { recursive: true, force: true }); }
});

test("la plantilla de la finca no cambia por el cargador (sin scripts en línea, CSP) y el cargador no pide otros orígenes", () => {
  const PL = lee("apps/web/plantilla.html");
  assert.doesNotMatch(PL, /<script/i, "la plantilla no trae scripts: los pone genera_motor y, al publicar, el cargador");
  const caddy = lee("infra/Caddyfile");
  assert.match(caddy, /script-src 'self'/, "la CSP de producción sigue en 'self'");
  assert.match(lee("apps/web/herramientas/genera_motor.mjs"), /<script type="module" src="\.\/entrada\/motor\.generado\.js">/, "la página de siempre sigue con su entrada de módulo");
});
