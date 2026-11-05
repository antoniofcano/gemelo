"use strict";
// AG-3b / F2a (ADR-0031, doc/sistema/MULTIVIEW.md §4.1 y «Estado de F2a»): la build de VR con super-three DE VERDAD (apps/web/node_modules/super-three).
//   · super-three va con la versión exacta de BUILDS.vr (apps/web/herramientas/builds.mjs), MIT, y su multiview está donde el motor lo pide
//     (multiviewStereo en el WebGLRenderer, isMultiview con OCULUS_multiview y la capa «texture-array» en el WebXRManager): si una versión nueva lo mueve, salta aquí;
//   · el guardián de sombreadores contra super-three, como el de web.test.js contra three: cada `#include <trozo>` del motor y de la biblioteca de olivos
//     existe en el ShaderChunk de super-three y es IGUAL que en three (un parche de texto que casa en una build y no en la otra falla en silencio);
//   · todo THREE.X que usa el motor y todo three/addons/… que importa existen en super-three;
//   · el motor entero construye con las dos builds: la de VR lleva super-three (0.185) y nada del three de pantalla; la de pantalla, three 0.186 y nada de super-three,
//     con los mismos trozos (chunks) en las dos;
//   · EV-1k: las dos llevan en basis/ el transcodificador Basis de SU three (para el KTX2Loader del suelo de fotos), del mismo origen y sin CDN.
// Solo Node (Vite sin navegador). Sin Vite, 3d-tiles-renderer o super-three instalados (cd apps/web && npm ci) se salta con aviso.
const test = require("node:test"), assert = require("node:assert"), path = require("path"), os = require("os"), { pathToFileURL } = require("url");
const { RAIZ, fs, lee, ejecuta } = require("./_util");

const WEB = path.join(RAIZ, "apps/web"), VITE = path.join(WEB, "node_modules/vite/bin/vite.js");
const SUPER = path.join(WEB, "node_modules/super-three"), THREE_DIR = path.join(WEB, "node_modules/three");
const SALTO_ST = !fs.existsSync(path.join(SUPER, "build/three.module.js")) ? "super-three no instalado (cd apps/web && npm ci): la build de VR NO se ha comprobado" : null;
const SALTO_VITE = SALTO_ST || (!fs.existsSync(VITE) || !fs.existsSync(path.join(WEB, "node_modules/3d-tiles-renderer/build/index.js")) ? "falta Vite o 3d-tiles-renderer: cd apps/web && npm ci" : null);
const CHUNKS = d => path.join(d, "src/renderers/shaders/ShaderChunk");
const MOTOR = path.join(WEB, "motor"), OLIVO = path.join(WEB, "olivo");
const fuentes = () => [...fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).map(f => path.join(MOTOR, f)), ...fs.readdirSync(OLIVO).filter(f => f.endsWith(".js")).map(f => path.join(OLIVO, f))];

test("super-three: versión exacta (la de BUILDS.vr), instalada, MIT", async t => {
  if (SALTO_ST) return t.skip(SALTO_ST);
  const B = await import(pathToFileURL(path.join(WEB, "herramientas/builds.mjs")).href);
  const pk = JSON.parse(lee("apps/web/package.json")), st = JSON.parse(fs.readFileSync(path.join(SUPER, "package.json"), "utf8"));
  assert.strictEqual(pk.dependencies["super-three"], B.BUILDS.vr.version, "apps/web/package.json y BUILDS.vr.version no casan");
  assert.strictEqual(st.version, B.BUILDS.vr.version, "la super-three instalada no es la de package.json (cd apps/web && npm ci)");
  assert.strictEqual(st.license, "MIT");
  assert.match(fs.readFileSync(path.join(SUPER, "LICENSE"), "utf8"), /^The MIT License/);
});

test("super-three: el multiview está donde el motor lo pide (multiviewStereo → WebXRManager; OCULUS_multiview y capa «texture-array»), en src y en el build que se empaqueta", t => {
  if (SALTO_ST) return t.skip(SALTO_ST);
  const rd = fs.readFileSync(path.join(SUPER, "src/renderers/WebGLRenderer.js"), "utf8"), xr = fs.readFileSync(path.join(SUPER, "src/renderers/webxr/WebXRManager.js"), "utf8");
  assert.match(rd, /multiviewStereo = false,/, "WebGLRenderer: el parámetro multiviewStereo");
  assert.match(rd, /new WebXRManager\( _this, _gl, extensions, multiviewStereo \)/);
  assert.match(xr, /scope\.isMultiview = useMultiview && extensions\.has\( 'OCULUS_multiview' \);/, "WebXRManager: se enciende con OCULUS_multiview");
  assert.match(xr, /'createProjectionLayer' in XRWebGLBinding\.prototype/, "solo con la API de capas (si no, XRWebGLLayer y sin multiview)");
  assert.match(xr, /projectionlayerInit\.textureType = 'texture-array';/);
  // el alias de la build vr apunta a build/three.module.js (herramientas/builds.mjs): lo mismo tiene que estar ahí
  const b = fs.readFileSync(path.join(SUPER, "build/three.module.js"), "utf8") + fs.readFileSync(path.join(SUPER, "build/three.core.js"), "utf8");
  for (const s of ["multiviewStereo", "isMultiview", "OCULUS_multiview", "texture-array", "setDeferTextureUploads"]) assert.ok(b.includes(s), "falta «" + s + "» en el build de super-three");
  assert.ok(!fs.readFileSync(path.join(THREE_DIR, "build/three.module.js"), "utf8").includes("multiviewStereo"), "three de pantalla no tiene multiviewStereo (si lo tuviera, F2a sobra)");
});

test("guardián de sombreadores contra super-three: cada #include del motor y de la biblioteca de olivos existe y es igual que en three", t => {
  if (SALTO_ST) return t.skip(SALTO_ST);
  const usados = new Map();
  for (const f of fuentes()) for (const m of fs.readFileSync(f, "utf8").matchAll(/#include <(\w+)>/g)) usados.set(m[1], path.relative(WEB, f));
  assert.ok(usados.size >= 10, "se esperaban más trozos: " + usados.size);
  const hay = new Set(fs.readdirSync(CHUNKS(SUPER)).map(f => f.replace(/\.glsl\.js$/, "")));
  assert.deepStrictEqual([...usados].filter(([k]) => !hay.has(k)).map(([k, f]) => k + " (" + f + ")"), [], "trozos que no existen en super-three");
  const texto = (d, k) => fs.readFileSync(path.join(CHUNKS(d), k + ".glsl.js"), "utf8");
  const distintos = [...usados.keys()].filter(k => fs.existsSync(path.join(CHUNKS(THREE_DIR), k + ".glsl.js")) && texto(SUPER, k) !== texto(THREE_DIR, k));
  assert.deepStrictEqual(distintos, [], "trozos que cambian entre three y super-three: revisa los parches que los tocan en las dos builds");
  const cs = texto(SUPER, "colorspace_pars_fragment");
  for (const fn of ["sRGBTransferEOTF", "sRGBTransferOETF"]) assert.ok(cs.includes(fn), fn + " no existe en colorspace_pars_fragment de super-three");
  // los ShaderLib de los materiales que parcheamos: el punto de anclaje «void main() {» y lo que se sustituye fuera de #include, en los dos
  for (const d of [SUPER, THREE_DIR]) for (const sl of ["meshlambert", "meshbasic", "meshphong", "meshphysical", "points"]) {
    const v = fs.readFileSync(path.join(d, "src/renderers/shaders/ShaderLib", sl + ".glsl.js"), "utf8");
    assert.ok(v.includes("void main() {"), sl + " sin «void main() {» en " + path.basename(d));
  }
});

test("todo THREE.X del motor y todo three/addons/… que importa existen en super-three", async t => {
  if (SALTO_ST) return t.skip(SALTO_ST);
  const S = await import(pathToFileURL(path.join(SUPER, "build/three.module.js")).href);
  const usados = new Set(), addons = new Set();
  for (const f of fs.readdirSync(MOTOR).filter(f => f.endsWith(".js"))) {
    const s = fs.readFileSync(path.join(MOTOR, f), "utf8");
    for (const m of s.matchAll(/\bTHREE\.([A-Za-z_]\w*)/g)) usados.add(m[1]);
    for (const m of s.matchAll(/["']three\/addons\/([^"']+)["']/g)) addons.add(m[1]);
  }
  assert.ok(usados.size > 50 && addons.size >= 5, "se esperaban más usos: " + usados.size + " / " + addons.size);
  assert.deepStrictEqual([...usados].filter(k => !(k in S)), [], "THREE.X que super-three " + S.REVISION + " no exporta");
  assert.deepStrictEqual([...addons].filter(a => !fs.existsSync(path.join(SUPER, "examples/jsm", a))), [], "addons que no trae super-three");
});

/** el motor entero (genera_motor.mjs con un índice vacío) construido con la build pedida; devuelve { js, nombres, bytes } de assets/ */
function construye(raiz, build) {
  const sal = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-dist-" + build + "-f2a-"));
  const env = Object.assign({}, process.env, { GEMELO_WEB_RAIZ: raiz, GEMELO_WEB_SALIDA: sal, GEMELO_BUILD: build });
  delete env.GEMELO_SUPER_THREE;
  const r = ejecuta(process.execPath, [VITE, "build", "--config", path.join(WEB, "vite.config.js")], { cwd: WEB, env });
  assert.strictEqual(r.status, 0, "vite build (" + build + ") falló:\n" + r.stdout + r.stderr);
  assert.ok(!/is not exported by|Could not resolve/.test(r.stdout + r.stderr), "avisos de resolución en la build " + build + ":\n" + r.stdout + r.stderr);
  const dir = path.join(sal, "assets"), js = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
  const o = { js: {}, nombres: js.map(f => f.replace(/-[\w-]{8}\.js$/, "")).sort(), bytes: 0 };
  for (const f of js) { o.js[f] = fs.readFileSync(path.join(dir, f), "utf8"); }
  const suma = d => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? suma(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
  o.bytes = suma(sal); o.assetsJs = js.reduce((a, f) => a + Buffer.byteLength(o.js[f]), 0);
  // EV-1k: el transcodificador Basis que copia vite.config.js en basis/ (del mismo origen) para el KTX2Loader del suelo de fotos
  const bd = path.join(sal, "basis");
  o.basis = fs.existsSync(bd) ? Object.fromEntries(fs.readdirSync(bd).sort().map(f => [f, fs.readFileSync(path.join(bd, f))])) : {};
  fs.rmSync(sal, { recursive: true, force: true });
  return o;
}

test("el motor entero construye con las dos builds: vr con super-three 0.185 y sin el three de pantalla; pantalla con three 0.186 y sin super-three; los mismos trozos", { timeout: 600000 }, async t => {
  if (SALTO_VITE) return t.skip(SALTO_VITE);
  const G = await import(pathToFileURL(path.join(WEB, "herramientas/genera_motor.mjs")).href);
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-raiz-f2a-")), idx = path.join(raiz, "i.json");
  fs.writeFileSync(idx, "{}");
  try {
    G.genera(idx, raiz);
    const vr = construye(raiz, "vr"), pa = construye(raiz, "pantalla");
    const todo = o => Object.values(o.js).join("\n");
    const marcasSuper = ["setDeferTextureUploads", "isWebGLMultiviewRenderTarget"];   // MAX_VIEWS_OVR no: lo lee también la sonda de 30_mide
    const jv = todo(vr), jp = todo(pa);
    assert.match(jv, /REVISION\s*=\s*"185"|="185"/, "super-three (185) en la build vr");
    assert.ok(!/="186"/.test(jv), "el three de pantalla (186) se coló en la build vr");
    for (const m of marcasSuper) assert.ok(jv.includes(m), "falta " + m + " (super-three) en la build vr");
    assert.match(jp, /="186"/, "three 0.186 en la build de pantalla");
    assert.ok(!/="185"/.test(jp), "super-three se coló en la build de pantalla");
    for (const m of marcasSuper) assert.ok(!jp.includes(m), "«" + m + "» (de super-three) en la build de pantalla");
    assert.deepStrictEqual(vr.nombres, pa.nombres, "las dos builds deben partirse en los mismos trozos (mismos import() y addons)");
    // EV-1k: el transcodificador entra en las dos builds, en basis/, y es el de la three de cada una (super-three en la de VR); el KTX2Loader va en su
    // trozo (import() del suelo de fotos), el motor le dice que lo coja de basis/ y nada de eso apunta a otro origen
    for (const [o, dir, nom] of [[pa, THREE_DIR, "pantalla"], [vr, SUPER, "vr"]]) {
      assert.deepStrictEqual(Object.keys(o.basis), ["basis_transcoder.js", "basis_transcoder.wasm"], "basis/ de la build " + nom);
      for (const f of Object.keys(o.basis)) assert.ok(o.basis[f].equals(fs.readFileSync(path.join(dir, "examples/jsm/libs/basis", f))), f + " de la build " + nom + " no es el de su three");
      assert.ok(!/https?:\/\//.test(o.basis["basis_transcoder.js"].toString("utf8")), "el transcodificador de la build " + nom + " nombra otro origen");
      const k = Object.keys(o.js).filter(f => o.js[f].includes("KTX2Loader") && o.js[f].includes("transcoderPath"));
      assert.ok(k.length >= 1, "el KTX2Loader no está en la build " + nom);
      assert.ok(Object.values(o.js).some(j => /setTranscoderPath\(["']basis\/["']\)|BASIS\s*=\s*["']basis\/["']|["']basis\/["']/.test(j)), "el motor de la build " + nom + " no pide el transcodificador a basis/");
      for (const f of k) assert.ok(!/(jsdelivr|unpkg|gstatic|cdnjs|githack)\./.test(o.js[f]), f + " (build " + nom + ") nombra un CDN");
    }
    t.diagnostic("assets JS: pantalla " + (pa.assetsJs / 1048576).toFixed(2) + " MiB · vr " + (vr.assetsJs / 1048576).toFixed(2) + " MiB · salida entera: pantalla " + (pa.bytes / 1048576).toFixed(1) + " MiB · vr " + (vr.bytes / 1048576).toFixed(1) + " MiB");
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});
