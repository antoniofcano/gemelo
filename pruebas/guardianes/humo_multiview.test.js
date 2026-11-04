"use strict";
// F2b (doc/sistema/MULTIVIEW.md, F2; ADR-0031): la página de humo desechable de prototipos/multiview/, en Node (sin Chrome: lo que mide, lo
// mide el Quest). Comprueba:
//   · que las tres builds (clasico, super, nuevo) construyen con Vite y salen con nombre fijo, una sola three cada una;
//   · que cada modo lleva el renderizador que dice, por las marcas de su bundle (la REVISION de su three, `multiviewStereo` de super-three,
//     el XRManager del WebGPURenderer…) y que no se cuela otro;
//   · el reparto de la escena (n llamadas por ojo exactas, triángulos cerca de lo pedido) y que la escena construida con cada three dibuja eso;
//   · los parámetros de la URL; el medidor y su texto (con MideEst y RenderPuro del motor, sin copiarlos);
//   · que no hay datos de la finca, rutas locales ni envíos a otros hosts (además del guardián de secretos, que ya recorre estos ficheros).
// Sin las dependencias del prototipo (cd prototipos/multiview && npm ci) se salta con aviso.
const test = require("node:test"), assert = require("node:assert"), path = require("path"), { pathToFileURL } = require("url");
const { RAIZ, fs, lee, ficheros, ejecuta, propia } = require("./_util");

const PROTO = path.join(RAIZ, "prototipos", "multiview");
const NM = path.join(PROTO, "node_modules");
const SALTO = ["three", "super-three", "vite"].every(p => fs.existsSync(path.join(NM, p, "package.json"))) ? false : "faltan las dependencias de prototipos/multiview (cd prototipos/multiview && npm ci)";
const imp = f => import(pathToFileURL(path.join(PROTO, f)).href);

let DIST = null;
function dist() {
  if (DIST) return DIST;
  const d = propia("humo-multiview");
  const r = ejecuta(process.execPath, [path.join(PROTO, "construye.mjs")], { cwd: PROTO, env: Object.assign({}, process.env, { HUMO_SALIDA: d }) });
  assert.strictEqual(r.status, 0, "construye.mjs falló:\n" + r.stdout + r.stderr);
  return (DIST = d);
}

test("las tres builds construyen: index.html, elige.js y <modo>/humo.js, sin trozos sueltos y de menos de 2 MB", { skip: SALTO }, () => {
  const d = dist();
  for (const f of ["index.html", "elige.js"]) assert.ok(fs.existsSync(path.join(d, f)), f);
  assert.match(fs.readFileSync(path.join(d, "index.html"), "utf8"), /<script type="module" src="\.\/elige\.js"><\/script>/);
  assert.doesNotMatch(fs.readFileSync(path.join(d, "index.html"), "utf8"), /<script>(?!<)/, "sin scripts en línea (la CSP del servidor no los deja)");
  for (const m of ["clasico", "super", "nuevo"]) {
    const L = fs.readdirSync(path.join(d, m));
    assert.deepStrictEqual(L, ["humo.js"], m + ": " + L.join(", "));
    const t = fs.statSync(path.join(d, m, "humo.js")).size;
    assert.ok(t > 200 * 1024 && t < 2 * 1024 * 1024, m + ": " + t + " bytes");
  }
});

// las marcas que deja cada three en su bundle (minificado: solo sobreviven las cadenas y los nombres de propiedad)
const tiene = (s, x) => s.split(x).length - 1;
test("cada modo usa el renderizador que dice (marcas del bundle) y una sola three", { skip: SALTO }, () => {
  const d = dist(), B = m => fs.readFileSync(path.join(d, m, "humo.js"), "utf8");
  const c = B("clasico"), s = B("super"), n = B("nuevo");
  for (const [m, x, rev] of [["clasico", c, "186"], ["super", s, "185"], ["nuevo", n, "186"]]) {
    assert.strictEqual(tiene(x, 'detail:{revision:"'), 1, m + ": debe llevar una sola three");
    assert.ok(x.includes('detail:{revision:"' + rev + '"}'), m + ": three r" + rev);
    assert.ok(x.includes('"' + m + '"'), m + ": __MODO__ inyectado");
  }
  // clasico: three 0.186.1 con el WebGLRenderer, sin nada de multiview en el renderizador ni el WebGPURenderer
  assert.ok(c.includes("isWebGLRenderer"));
  for (const x of ["multiviewStereo", "isMultiview", "WebGPU XR does not support multiview", "forceWebGL"]) assert.ok(!c.includes(x), "clasico no debe llevar " + x);
  // super: super-three con su multiview en el WebGLRenderer clásico (WebGLRenderer.js:86 y webxr/WebXRManager.js:492)
  for (const x of ["isWebGLRenderer", "multiviewStereo", "isMultiview", "texture-array"]) assert.ok(s.includes(x), "super debe llevar " + x);
  for (const x of ["WebGPU XR does not support multiview", "forceWebGL"]) assert.ok(!s.includes(x), "super no debe llevar " + x);
  // nuevo: el WebGPURenderer con su XRManager (multiview con OVR_multiview2) y DirectRenderPipeline; sin el multiview de super-three
  for (const x of ["WebGPU XR does not support multiview", "forceWebGL", "useMultiview", "isDirectRenderPipeline", "OVR_multiview2", "texture-array"]) assert.ok(n.includes(x), "nuevo debe llevar " + x);
  assert.ok(!n.includes("multiviewStereo"), "nuevo no debe llevar multiviewStereo");
  // nada pide a otros hosts
  for (const [m, x] of [["clasico", c], ["super", s], ["nuevo", n]]) for (const h of ["cdn.jsdelivr.net", "unpkg.com", "googleapis"]) assert.ok(!x.includes(h), m + " no debe ir a " + h);
});

test("reparto: n llamadas por ojo exactas y triángulos a menos de un 10 % de lo pedido", { skip: SALTO }, async () => {
  const P = await imp("src/plan.js");
  for (const n of [10, 50, 100, 200, 400, 800]) for (const tri of [150000, 200000, 300000]) {
    const r = P.reparto(n, tri);
    assert.strictEqual(r.llamadas, n, "n=" + n);
    assert.ok(Math.abs(r.triangulos - tri) / tri < 0.1, "n=" + n + " tri=" + tri + " → " + r.triangulos);
    assert.ok(r.instanciados.mallas >= 1 && r.sombreador >= 1 && r.lambert >= 1 && r.standard >= 1, "hay de cada clase");
  }
  assert.strictEqual(P.triEsfera(24, 12), 528);
});

test("parámetros de la URL: valores por defecto, límites, y en clasico no hay multiview", { skip: SALTO }, async () => {
  const P = await imp("src/plan.js");
  const d = P.lee("", "super");
  assert.deepStrictEqual(d, { modo: "super", n: 200, tri: 200000, msaa: true, mv: true, directo: false, escala: 0.9, fov: 1, seg: 60, calent: 3 });
  assert.strictEqual(P.lee("?mv=1", "clasico").mv, false);
  assert.deepStrictEqual([P.lee("?mv=0", "nuevo").mv, P.lee("?directo=0", "nuevo").directo, P.lee("", "nuevo").directo], [false, false, true]);
  assert.strictEqual(P.lee("?msaa=0", "clasico").msaa, false);
  assert.deepStrictEqual([P.lee("?n=5").n, P.lee("?n=99999").n, P.lee("?n=abc").n, P.lee("?n=400").n], [10, 2000, 200, 400]);
  assert.strictEqual(P.lee("?modo=nuevo", "clasico").modo, "clasico", "manda la build, no la URL");
});

// la escena de verdad con cada three: tantas mallas como llamadas, los triángulos del reparto, nada recortado por el frustum
async function cuenta(THREE, sombreador, p) {
  const { creaEscena } = await imp("src/escena.js");
  const E = creaEscena(THREE, p, sombreador);
  let llamadas = 0, tri = 0, recortables = 0;
  E.escena.traverse(o => {
    if (!o.isMesh) return;
    llamadas++; if (o.frustumCulled) recortables++;
    const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tri += t * (o.isInstancedMesh ? o.count : 1);
  });
  E.libera();
  return { llamadas, tri, recortables, plan: E.plan };
}
test("la escena con three 0.186.1, super-three 0.185.0 y three/webgpu dibuja lo que dice el reparto", { skip: SALTO }, async () => {
  const p = { n: 200, tri: 200000 };
  const three = await import(pathToFileURL(path.join(NM, "three", "build", "three.module.js")).href);
  const superThree = await import(pathToFileURL(path.join(NM, "super-three", "build", "three.module.js")).href);
  const webgpu = await import(pathToFileURL(path.join(NM, "three", "build", "three.webgpu.js")).href);
  const tsl = await import(pathToFileURL(path.join(NM, "three", "build", "three.tsl.js")).href);
  const shader = (T, a, b) => new T.ShaderMaterial({ uniforms: { colorA: { value: a }, colorB: { value: b } } });
  const nodo = (T, a, b) => { const m = new T.MeshBasicNodeMaterial(); m.colorNode = tsl.mix(tsl.uniform(a), tsl.uniform(b), tsl.normalWorld.y); return m; };
  assert.strictEqual(superThree.REVISION, "185"); assert.strictEqual(three.REVISION, "186");
  for (const [nombre, T, f] of [["three", three, shader], ["super-three", superThree, shader], ["three/webgpu", webgpu, nodo]]) {
    const r = await cuenta(T, f, p);
    assert.strictEqual(r.llamadas, r.plan.llamadas, nombre + ": mallas");
    assert.strictEqual(r.tri, r.plan.triangulos, nombre + ": triángulos");
    assert.strictEqual(r.recortables, 0, nombre + ": todo con frustumCulled = false");
  }
});

test("medidor y texto: estadística de MideEst (30_mide.js) y lectura de RenderPuro (02h_render.js), sin copiarlos", { skip: SALTO }, async () => {
  const { trozoPuro } = await imp("herramientas/puro.mjs");
  const datos = c => "data:text/javascript," + encodeURIComponent(c);
  let src = lee("prototipos/multiview/src/medida.js");
  src = src.replace('"gemelo-puro:30_mide/MideEst"', JSON.stringify(datos(trozoPuro("30_mide", "MideEst"))))
    .replace('"gemelo-puro:02h_render/RenderPuro"', JSON.stringify(datos(trozoPuro("02h_render", "RenderPuro"))));
  const M = await import(datos(src));
  let fin = null;
  const med = M.creaMedidor(0, 0.05, r => { fin = r; });
  med.arma();
  const t0 = Date.now(); let i = 0;
  while (!fin && Date.now() - t0 < 2000) med.fotograma(i++ ? 11 + (i % 3) : 0, 4, 2.5, { render: { calls: 402, triangles: 400000, frame: i } }, false);
  assert.ok(fin, "termina");
  assert.ok(fin.n > 0 && fin.ms.mediana >= 11 && fin.ms.peor <= 13, JSON.stringify(fin.ms));
  assert.strictEqual(fin.ll.mediana, 402); assert.strictEqual(fin.rd.mediana, 2.5);
  const p = { modo: "nuevo", n: 200, tri: 200000, msaa: true, mv: true, directo: true, escala: 0.9, fov: 1 };
  const t = M.texto(fin, { fecha: "2026-11-04 12:00:00", renderizador: "three WebGPURenderer (forceWebGL)", p, plan: { llamadas: 200, triangulos: 200120 },
    sonda: { webgl2: true, ovr2: true, ovr2msaa: true, oculus: true, oculusMsaa: true, maxViews: 2, capasXR: true, antialias: true },
    sesion: { multiview: true, capa: "XRProjectionLayer", capas: 2, foveacion: 1, frecuencia: 72 }, ua: "Mozilla/5.0 (X11; Linux x86_64; Quest 3) OculusBrowser/41.0", vr: true, seg: 60, calent: 3 });
  for (const x of ["Modo: nuevo", "multiview pedido sí", "DirectRenderPipeline sí", "n=200", "multiview activo sí", "textureArrayLength 2", "OVR_multiview2 sí (con MSAA sí)",
    "MAX_VIEWS_OVR 2", "renderer.render() (ms): mediana 2.5", "402 llamadas", "p95"]) assert.ok(t.includes(x), "falta «" + x + "» en:\n" + t);
  assert.ok(!/Mozilla|X11/.test(t), "el agente de usuario va resumido (MideEst.resumeUA)");
  assert.strictEqual(M.sonda(null).webgl2, null);
});

test("sin datos de la finca, rutas locales ni envíos: el prototipo es sintético y no manda nada a ningún sitio", () => {
  const L = ficheros().filter(f => f.startsWith("prototipos/multiview/") && !/package-lock\.json$/.test(f));
  assert.ok(L.includes("prototipos/multiview/README.md") && L.includes("prototipos/multiview/src/escena.js"), "faltan ficheros: " + L.join(", "));
  assert.ok(!L.some(f => /(^|\/)(node_modules|dist)\//.test(f)), "node_modules/ y dist/ no se versionan");
  for (const f of L) {
    const s = lee(f);
    assert.ok(!/hituelo|\bcerro\b|centro_utm|tileset\.json|\/teselas\/|\.laz\b|olivartrack/i.test(s), f + ": ¿datos de la finca?");
    assert.ok(!/[A-Z]:\\Users\\|\/Users\/|\/home\//.test(s), f + ": ruta local");
    if (f.includes("/src/") || f.includes("/pagina/")) assert.ok(!/\bfetch\(|sendBeacon|XMLHttpRequest|WebSocket|EventSource/.test(s), f + ": no envía ni pide nada");
  }
});
