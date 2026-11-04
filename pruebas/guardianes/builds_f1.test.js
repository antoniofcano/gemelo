"use strict";
// AG-3a / F1 (ADR-0031, decisión de Antonio del 2026-11-04): dos builds del mismo motor, PREPARADAS y NO ACTIVADAS (apps/web/herramientas/builds.mjs).
//   · la build de siempre no cambia: los alias de «three» son exactamente los de antes, three 0.186.1, salida apps/web/dist, la entrada del motor igual;
//   · la build vr (GEMELO_BUILD=vr) lleva el alias three → super-three, también para three/addons/… y cualquier three/…; se comprueba con un STUB de
//     super-three (no está instalado) y un build de Vite de verdad con la configuración de apps/web/vite.config.js;
//   · eligeBuild: el Quest carga la vr solo si se publicó; ?build= la fuerza; el resto, pantalla.
// Solo Node (Vite sin navegador). Sin Vite o sin 3d-tiles-renderer instalados (cd apps/web && npm ci) se salta con aviso.
const test = require("node:test"), assert = require("node:assert"), path = require("path"), os = require("os"), { pathToFileURL } = require("url");
const { RAIZ, fs, lee, ejecuta } = require("./_util");

const WEB = path.join(RAIZ, "apps/web"), VITE = path.join(WEB, "node_modules/vite/bin/vite.js");
const SALTO = !fs.existsSync(VITE) || !fs.existsSync(path.join(WEB, "node_modules/3d-tiles-renderer/build/index.js")) ? "falta Vite o 3d-tiles-renderer: cd apps/web && npm ci" : null;
let B;
test.before(async () => { B = await import(pathToFileURL(path.join(WEB, "herramientas/builds.mjs")).href); });

/** la configuración de Vite evaluada con ese entorno (cada vez un módulo nuevo: la configuración lee process.env al cargarse) */
let n = 0;
async function config(env) {
  const antes = Object.assign({}, process.env);
  for (const k of ["GEMELO_BUILD", "GEMELO_SUPER_THREE", "GEMELO_WEB_SALIDA"]) delete process.env[k];
  Object.assign(process.env, env || {});
  try { return (await import(pathToFileURL(path.join(WEB, "vite.config.js")).href + "?f1=" + (++n))).default; }
  finally { for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k]; Object.assign(process.env, antes); }
}
/** un super-three de mentira: el núcleo, un addon que importa «three» y un fichero de examples/ fuera de jsm/addons */
function stub() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "super-three-stub-"));
  fs.mkdirSync(path.join(d, "build"), { recursive: true }); fs.mkdirSync(path.join(d, "examples/jsm/loaders"), { recursive: true }); fs.mkdirSync(path.join(d, "examples/fonts"), { recursive: true });
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: "super-three", version: "0.185.0", type: "module" }));
  fs.writeFileSync(path.join(d, "build/three.module.js"), 'export const REVISION = "185-STUB-SUPER-THREE"; export class Loader { constructor() { this.marca = "STUB-LOADER-BASE"; } }\n');
  fs.writeFileSync(path.join(d, "examples/jsm/loaders/GLTFLoader.js"), 'import { Loader } from "three";\nexport class GLTFLoader extends Loader { tipo() { return "STUB-GLTF"; } }\n');
  fs.writeFileSync(path.join(d, "examples/fonts/fuente.js"), 'export const FUENTE = "STUB-FUENTE";\n');
  return d;
}
function raizMini(entrada) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-raiz-f1-"));
  fs.writeFileSync(path.join(d, "index.html"), '<!doctype html>\n<html><head><meta charset="utf-8"></head><body><script type="module" src="./e.js"></script></body></html>\n');
  fs.writeFileSync(path.join(d, "e.js"), entrada);
  return d;
}
function vite(raiz, salida, env) {
  const r = ejecuta(process.execPath, [VITE, "build", "--config", path.join(WEB, "vite.config.js")], { cwd: WEB, env: Object.assign({}, process.env, { GEMELO_WEB_RAIZ: raiz, GEMELO_WEB_SALIDA: salida }, env) });
  assert.strictEqual(r.status, 0, "vite build falló:\n" + r.stdout + r.stderr);
  const js = fs.readdirSync(path.join(salida, "assets")).filter(f => f.endsWith(".js")).map(f => fs.readFileSync(path.join(salida, "assets", f), "utf8")).join("\n");
  return js;
}

test("la build de siempre no cambia: alias de three exactos, three 0.186.1, salida dist, __GEMELO_BUILD__ «pantalla» y la entrada del motor igual", async t => {
  if (SALTO) return t.skip(SALTO);
  const c = await config();
  const a = c.resolve.alias;
  assert.deepStrictEqual(a.slice(0, 2).map(x => [String(x.find), x.replacement]), [
    ["/^three$/", path.join(WEB, "node_modules", "three", "build", "three.module.js")],
    ["/^three\\/addons\\//", path.join(WEB, "node_modules", "three", "examples", "jsm") + "/"]], "los dos alias de three de siempre, los primeros");
  assert.ok(!a.some(x => String(x.find) === String(/^three\/(?!addons\/)/)), "pantalla no lleva el alias extra de la vr");
  assert.strictEqual(a.filter(x => /three/.test(String(x.find)) && !/mesh|vrm/.test(String(x.find))).length, 2);
  assert.strictEqual(c.build.outDir, path.join(WEB, "dist"));
  assert.strictEqual(c.define.__GEMELO_BUILD__, JSON.stringify("pantalla"));
  assert.strictEqual(JSON.parse(lee("apps/web/package.json")).dependencies.three, "0.186.1");
  // F2a: super-three ya se instala (la build de VR de verdad, builds_f2.test.js), con versión exacta; la de pantalla no lo toca (los alias, arriba)
  assert.strictEqual(JSON.parse(lee("apps/web/package.json")).dependencies["super-three"], "0.185.0", "super-three con la versión exacta de BUILDS.vr");
  // la entrada del motor: la concatenación de siempre (la comprueba también build.test.js con el fixture)
  const G = await import(pathToFileURL(path.join(WEB, "herramientas/genera_motor.mjs")).href);
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-entrada-f1-")), idx = path.join(raiz, "i.json");
  fs.writeFileSync(idx, "{}"); G.genera(idx, raiz);
  assert.ok(fs.readFileSync(path.join(raiz, "entrada", "motor.generado.js"), "utf8").startsWith('import * as THREE from "three";\nimport "./plantilla.css";\n'));
  fs.rmSync(raiz, { recursive: true, force: true });
});

test("build vr: three, three/addons/… y three/… van a super-three (con un stub; el de pantalla no se cuela) y __GEMELO_BUILD__ «vr»", async t => {
  if (SALTO) return t.skip(SALTO);
  const st = stub();
  try {
    const c = await config({ GEMELO_BUILD: "vr", GEMELO_SUPER_THREE: st });
    assert.strictEqual(c.resolve.alias[0].replacement, path.join(st, "build", "three.module.js"));
    assert.strictEqual(c.build.outDir, path.join(WEB, "dist-vr"));
    assert.strictEqual(c.define.__GEMELO_BUILD__, JSON.stringify("vr"));
    await assert.rejects(() => config({ GEMELO_BUILD: "vr", GEMELO_SUPER_THREE: path.join(st, "no-existe") }), /necesita super-three.*npm i -E super-three@0\.185\.0/);
    await assert.rejects(() => config({ GEMELO_BUILD: "quest" }), /GEMELO_BUILD=quest no existe/);
    // un build de Vite de verdad con la configuración del cliente: el paquete lleva el stub y no el three 0.186.1
    const entrada = 'import * as THREE from "three";\nimport { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";\nimport { FUENTE } from "three/examples/fonts/fuente.js";\n' +
      'document.title = THREE.REVISION + new GLTFLoader().tipo() + new GLTFLoader().marca + FUENTE;\n';
    const raiz = raizMini(entrada), sal = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-dist-vr-f1-"));
    const js = vite(raiz, sal, { GEMELO_BUILD: "vr", GEMELO_SUPER_THREE: st });
    for (const m of ["185-STUB-SUPER-THREE", "STUB-GLTF", "STUB-LOADER-BASE", "STUB-FUENTE"]) assert.ok(js.includes(m), "falta " + m + " en el paquete vr");
    assert.ok(!/REVISION\s*=\s*["']186["']|["']186["']/.test(js), "el three de pantalla (0.186) se coló en la build vr");
    fs.rmSync(raiz, { recursive: true, force: true }); fs.rmSync(sal, { recursive: true, force: true });
  } finally { fs.rmSync(st, { recursive: true, force: true }); }
});

test("build de pantalla con Vite (la misma entrada mínima sin el stub): lleva three 0.186 y nada de super-three", async t => {
  if (SALTO) return t.skip(SALTO);
  const raiz = raizMini('import * as THREE from "three";\ndocument.title = THREE.REVISION;\n'), sal = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-dist-f1-"));
  try {
    const js = vite(raiz, sal, { GEMELO_BUILD: "" });
    assert.match(js, /["']186["']/, "three 0.186 en el paquete de pantalla");
    assert.ok(!js.includes("STUB"), "nada del stub");
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); fs.rmSync(sal, { recursive: true, force: true }); }
});

test("eligeBuild: el Quest carga la vr solo si se publicó; ?build= la fuerza (si existe); escritorio y móvil, pantalla", () => {
  assert.strictEqual(B.eligeBuild("quest", "", false), "pantalla", "hoy (F1) no hay build vr publicada: el Quest sigue con la de siempre");
  assert.strictEqual(B.eligeBuild("quest", "?debug", true), "vr");
  assert.strictEqual(B.eligeBuild("escritorio", "", true), "pantalla");
  assert.strictEqual(B.eligeBuild("movil", "", true), "pantalla");
  assert.strictEqual(B.eligeBuild("quest", "?build=pantalla", true), "pantalla");
  assert.strictEqual(B.eligeBuild("escritorio", "?mide=60&build=vr", true), "vr");
  assert.strictEqual(B.eligeBuild("escritorio", "?build=vr", false), "pantalla");
  assert.strictEqual(B.buildPedida({}), "pantalla"); assert.strictEqual(B.buildPedida({ GEMELO_BUILD: "vr" }), "vr");
  // la clase sale de la ÚNICA detección del aparato (01a_aparato.js, AparatoPuro.clasifica): la del Quest 3 de verdad
  const P = lee("apps/web/motor/01a_aparato.js"), i = P.indexOf("// [puro:inicio]"), f = P.indexOf("// [puro:fin]");
  const AparatoPuro = new Function(P.slice(i, f) + "\nreturn AparatoPuro;")();
  const ua = "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/41.0 Chrome/132.0 VR Safari/537.36";
  assert.strictEqual(B.eligeBuild(AparatoPuro.clasifica(ua, 0, 8).clase, "", true), "vr");
});
