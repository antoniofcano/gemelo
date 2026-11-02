"use strict";
// La oficina, OF8b: el visor 3D del olivo real (apps/web/oficina/visor_olivo.js y visor_olivo_puro.js, apps/web/olivo/visor.js; doc/sistema/OFICINA.md §9.1).
// Siempre, sin red ni Chrome:
//  - estática: nada en línea ni de otro origen; three solo por import() perezoso («gemelo-olivo-visor») y solo el 0.128 del constructor (un solo three en
//    la oficina); OrbitControls de three (no controles propios, regla 12); un solo WebGLRenderer con tope de pixelRatio; todo lo de la GPU se libera;
//    sin WebGL, un mensaje y las cifras de siempre; rótulos de lo ilustrativo y lo medido;
//  - las cuentas puras: columnas de la cuadrícula, rectángulo GL de una celda, cámara que cuadra el olivo, girar y acercar con límites, rótulos.
// Opcional (GEMELO_CHROME=1; pide el turno del banco): el build de la oficina en Chrome con la api y un índice SINTÉTICO simulados (sin Docker): busca el
// olivo 101, abre el visor, comprueba que el trozo de entrada no lleva three, que hay un lienzo con píxeles en cada escalón (≥ 3), 0 errores de página y
// 0 avisos de la CSP del Caddy, que Esc lo cierra y libera; y deja una captura en pruebas/salida/oficina_visor_olivo.png para compararla con «Olivos tipo».
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, SALIDA, lee, propia, chrome, playwright, fs, path } = require("./_util");

const fuentes = { "visor_olivo.js": lee("apps/web/oficina/visor_olivo.js"), "visor_olivo_puro.js": lee("apps/web/oficina/visor_olivo_puro.js"), "olivo_real.js": lee("apps/web/oficina/olivo_real.js") };
const visor3d = lee("apps/web/olivo/visor.js"), vite = lee("apps/web/vite.oficina.config.js");
const importa = f => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", f)).href);

test("estática: nada en línea; three solo perezoso y solo el del constructor; OrbitControls de three; un renderer; todo se libera", () => {
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
    assert.ok(!/from\s+["']three(-gen|-r186)?["']|from\s+["'][^"']*motor\/|from\s+["']gemelo-olivo/.test(c), n + ": ni three, ni el motor, ni el constructor por import estático");
  }
  assert.match(fuentes["visor_olivo.js"], /await import\("gemelo-olivo-visor"\)/, "el visor se pide con import() perezoso, al abrirlo");
  assert.ok(!/import\(/.test(fuentes["visor_olivo_puro.js"]), "lo puro no carga nada");
  // el visor: three 0.128 del constructor, sus controles, una escena como la de la herramienta
  assert.match(visor3d, /^import \* as THREE from "three-gen";$/m);
  assert.match(visor3d, /import \{ OrbitControls \} from "three-gen\/examples\/jsm\/controls\/OrbitControls\.js"/, "OrbitControls de three (regla 12), no controles propios");
  assert.strictEqual((visor3d.match(/new THREE\.WebGLRenderer\(/g) || []).length, 1, "un solo WebGLRenderer");
  assert.match(visor3d, /renderer\.setPixelRatio\(o\.pixelRatio \|\| 1\)/);
  for (const r of [/renderer\.dispose\(\)/, /renderer\.forceContextLoss\(\)/, /liberaOlivo\(a\.grupo\)/, /materiales\.libera\(\)/, /controles\.dispose\(\)/, /suelo\.geometry\.dispose\(\)/, /suelo\.material\.dispose\(\)/, /vigia\.disconnect\(\)/, /lienzo\.remove\(\)/])
    assert.match(visor3d, r, "libera(): " + r);
  assert.match(visor3d, /if \(epocaMat !== epoca\) \{ if \(materiales\) materiales\.libera\(\)/, "al cambiar de época, los materiales viejos se liberan");
  assert.match(visor3d, /quitaArboles\(\);/, "al cambiar de olivo, los árboles viejos se liberan");
  assert.match(visor3d, /new URL\("\.\/texturas\/corteza\.jpg", import\.meta\.url\)/, "las fotos de la corteza, del mismo origen (con hash)");
  assert.ok(!/https?:\/\//.test(visor3d), "el visor no pide nada a otro host");
  assert.ok(!/visor\.js/.test(lee("apps/web/olivo/index.js")), "el índice del constructor (y el motor) no arrastran el visor");
  // la oficina lo libera al cerrar, al cambiar de pestaña y de sección; sin WebGL lo dice
  assert.match(fuentes["visor_olivo.js"], /if \(!V\.hayWebGL\(\)\) \{ aviso\(TEXTOS\.sinWebgl, true\)/);
  assert.match(fuentes["visor_olivo.js"], /if \(visor\) \{ visor\.libera\(\); visor = null; \}/);
  assert.match(fuentes["visor_olivo.js"], /pixelRatio: pixelRatio\(window\.devicePixelRatio\)/);
  assert.match(lee("apps/web/oficina/olivos.js"), /if \(id === "real"\) real\.abre\(\); else real\.sale\(\);/);
  assert.match(lee("apps/web/oficina/oficina.js"), /if \(sec === "olivos"\) olivos\.abre\(\); else if \(olivos\) olivos\.sale\(\);/);
  // el build: el alias del visor (con el sustituto sin apps/web/olivo) y «three» a secas = three-gen, solo con el constructor instalado
  assert.match(vite, /\{ find: \/\^gemelo-olivo-visor\$\/, replacement: VISOR \}/);
  assert.match(vite, /const VISOR = CON_OLIVO \? path\.join\(WEB, "olivo", "visor\.js"\) : path\.join\(WEB, "olivo", "sin_olivo\.js"\);/);
  assert.match(vite, /CON_OLIVO \? \[\{ find: \/\^three\$\/, replacement: THREE_GEN \}\] : \[\]/);
  assert.match(lee("apps/web/olivo/package.json"), /"three-gen": "npm:three@0\.128\.0"/, "el three del visor es el fijado del constructor");
  assert.match(lee("apps/web/oficina/index.html"), /<div id="rVisorSitio"><\/div>/);
  assert.match(lee("apps/web/oficina/oficina.css"), /\.visor-host canvas \{[^}]*touch-action: none/, "el lienzo se queda con los gestos (girar con un dedo, acercar con dos)");
});

test("honestidad: lo ilustrativo y lo medido se rotulan; nada de fps ni rendimiento", async () => {
  const P = await importa("visor_olivo_puro.js");
  assert.match(P.TEXTOS.honesto, /^Forma ilustrativa con medidas del LiDAR/);
  assert.match(P.TEXTOS.honesto, /medidas \(LiDAR 2024\)/); assert.match(P.TEXTOS.honesto, /deducidas/); assert.match(P.TEXTOS.honesto, /ilustrativos/);
  assert.match(P.TEXTOS.escena, /no los de la finca/);
  assert.match(P.TEXTOS.sinWebgl, /no hay WebGL/); assert.match(P.TEXTOS.sinWebgl, /cifras/);
  for (const [n, c] of Object.entries(fuentes)) assert.ok(!/\bfps\b|fotogramas por segundo/i.test(c), n + ": no se afirma rendimiento");
  assert.match(fuentes["visor_olivo.js"], /ilustrativo: la forma del árbol; medidas del LiDAR 2024/);
});

test("cuadrícula: todos en fila si caben, si no de dos en dos, si no uno; rectángulo GL recortado y con el origen abajo", async () => {
  const P = await importa("visor_olivo_puro.js");
  const ancho = c => c * P.CELDA_MIN + (c - 1) * P.HUECO;
  assert.strictEqual(P.columnas(4, ancho(4)), 4); assert.strictEqual(P.columnas(4, ancho(4) - 1), 2); assert.strictEqual(P.columnas(4, ancho(2)), 2);
  assert.strictEqual(P.columnas(4, ancho(2) - 1), 1); assert.strictEqual(P.columnas(3, ancho(3)), 3); assert.strictEqual(P.columnas(3, 1000), 3);
  assert.strictEqual(P.columnas(1, 2000), 1); assert.strictEqual(P.columnas(0, 2000), 1); assert.strictEqual(P.columnas(4, -5), 1);
  const lienzo = { left: 100, top: 50, width: 800, height: 400 };
  assert.deepStrictEqual(P.rectGL({ left: 100, top: 50, width: 200, height: 250 }, lienzo), { x: 0, y: 150, w: 200, h: 250, visible: true }, "arriba a la izquierda → y desde abajo");
  assert.deepStrictEqual(P.rectGL({ left: 700, top: 250, width: 300, height: 300 }, lienzo), { x: 600, y: 0, w: 200, h: 200, visible: true }, "recortada al lienzo");
  assert.strictEqual(P.rectGL({ left: 1000, top: 50, width: 100, height: 100 }, lienzo).visible, false, "fuera del lienzo no se dibuja");
  assert.strictEqual(P.pixelRatio(3), P.MAX_PIXEL_RATIO); assert.strictEqual(P.pixelRatio(1.5), 1.5); assert.strictEqual(P.pixelRatio(undefined), 1); assert.strictEqual(P.MAX_PIXEL_RATIO, 2);
});

test("cámara: la esfera del olivo cabe en el campo de visión más estrecho; girar conserva distancia y altura; acercar respeta los límites", async () => {
  const P = await importa("visor_olivo_puro.js");
  const rad = g => (g * Math.PI) / 180;
  for (const [alto, copa, asp] of [[5, 5, 0.8], [7, 3, 0.8], [3, 8, 0.8], [5, 5, 2], [5, 5, 0.4], [0, 0, 1]]) {
    const e = P.encuadre({ alto, copa }, asp), fh = 2 * Math.atan(Math.tan(rad(P.FOV) / 2) * asp);
    const d = Math.hypot(...e.posicion.map((v, i) => v - e.objetivo[i]));
    assert.ok(Math.abs(d - e.distancia) < 1e-9);
    assert.ok(d * Math.sin(Math.min(rad(P.FOV), fh) / 2) >= e.radio, "cabe: " + [alto, copa, asp]);
    assert.ok(d * Math.sin(Math.min(rad(P.FOV), fh) / 2) <= e.radio * 1.1, "sin quedarse pequeño: " + [alto, copa, asp]);
    assert.ok(e.minDistancia < d && d < e.maxDistancia && e.cerca > 0 && e.lejos > e.maxDistancia, "límites del zoom y de la cámara");
    assert.ok(e.posicion[1] > e.objetivo[1], "se mira desde arriba, como la herramienta");
  }
  assert.deepStrictEqual(P.encuadre({ alto: 6, copa: 4 }, 1).objetivo, [0, 2.7, 0], "a 0,45 de la altura");
  const e = P.encuadre({ alto: 5, copa: 5 }, 0.8);
  const g = P.gira(e.posicion, e.objetivo, P.PASO_GIRO), dist = p => Math.hypot(p[0] - e.objetivo[0], p[2] - e.objetivo[2]);
  assert.ok(Math.abs(dist(g) - dist(e.posicion)) < 1e-9 && g[1] === e.posicion[1]);
  const vuelta = Array.from({ length: 24 }).reduce(p => P.gira(p, e.objetivo, P.PASO_GIRO), e.posicion);
  vuelta.forEach((v, i) => assert.ok(Math.abs(v - e.posicion[i]) < 1e-9, "24 pasos = una vuelta"));
  const d0 = Math.hypot(...e.posicion.map((v, i) => v - e.objetivo[i])), cerca = P.acerca(e.posicion, e.objetivo, P.PASO_ZOOM, e.minDistancia, e.maxDistancia);
  assert.ok(Math.abs(Math.hypot(...cerca.map((v, i) => v - e.objetivo[i])) - d0 * P.PASO_ZOOM) < 1e-9);
  let p = e.posicion; for (let i = 0; i < 50; i++) p = P.acerca(p, e.objetivo, P.PASO_ZOOM, e.minDistancia, e.maxDistancia);
  assert.ok(Math.abs(Math.hypot(...p.map((v, i) => v - e.objetivo[i])) - e.minDistancia) < 1e-9, "no atraviesa el árbol");
  for (let i = 0; i < 50; i++) p = P.acerca(p, e.objetivo, 1 / P.PASO_ZOOM, e.minDistancia, e.maxDistancia);
  assert.ok(Math.abs(Math.hypot(...p.map((v, i) => v - e.objetivo[i])) - e.maxDistancia) < 1e-9, "ni se va lejos");
});

test("rótulos: cada celda con su escalón, sus triángulos y sus llamadas; solo los escalones calculados", async () => {
  const P = await importa("visor_olivo_puro.js"), R = await importa("olivo_real_puro.js");
  const filas = R.filasEscalones({ E0: { triangulos: 234567, mallas: 14, ms: 90 }, E1: { triangulos: 50000, mallas: 1, ms: 3 }, E2: { triangulos: 4000, mallas: 9, ms: 2 }, E2VR: { triangulos: 3000, mallas: 9, ms: 2 } });
  const r = P.rotulos(filas);
  assert.deepStrictEqual(r.map(x => x.k), ["E0", "E1", "E2", "E2VR"]);
  assert.deepStrictEqual(r.map(x => x.titulo), ["E0", "E1", "E2", "E2-VR"]);
  assert.strictEqual(r[0].cifras, R.miles(234567) + " triángulos · 14 llamadas");
  assert.strictEqual(r[1].cifras, R.miles(50000) + " triángulos · 1 llamada");
  assert.match(r[3].etiqueta, /^E2-VR: .* triángulos y 9 llamadas de dibujo$/);
  assert.deepStrictEqual(P.escalonesDelVisor(filas, { E0: {}, E2: {} }), ["E0", "E2"]);
  assert.deepStrictEqual(P.escalonesDelVisor(filas, null), []);
});

// ——— recorrido en Chrome (opcional, sin Docker; pide el turno del banco) ———
const SALTO = process.env.GEMELO_CHROME !== "1" ? "recorrido en Chrome opcional (GEMELO_CHROME=1): el visor 3D NO se ha comprobado en un navegador" : null;
// un índice sintético (sin datos de la explotación), el mismo de oficina_olivo_real.test.js
const INDICE = {
  centro_utm: [440000, 4190000],
  copas: [[10, 20, 5.2, [2.4, 2.5, 2.6, 2.4, 2.3, 2.5, 2.6, 2.4], 1], [-30, 12, 4.1, [1.9, 2, 2.1, 2, 1.9, 2, 2.1, 2], 1], [5, -40, 6.3, [3, 3.1, 3, 2.9, 3, 3.1, 3, 2.9], 1]],
  copas_id: [101, 102, 2147483700],
  copas_param: [[5.4, 5.0, 0.6, 135, 0.7, 1.1, 0.12, 0], null, [6.5, 6.1, 0.2, 40, 0.8, 0.9, 0.2, 1]],
};

test("recorrido: el visor dibuja los escalones del olivo 101 con píxeles, sin errores ni avisos de CSP, y Esc lo cierra; captura", { timeout: 900_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: el visor 3D NO se ha comprobado");
  if (!fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "vite")) || !fs.existsSync(path.join(RAIZ, "apps", "web", "olivo", "node_modules", "three-gen"))) return t.skip("faltan apps/web (npm ci) o apps/web/olivo (npm ci)");
  const { lanza, CSP, esCsp } = require("./_navegador");
  const dist = propia("oficina-visor-olivo-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);
  // el trozo de entrada (el que pide index.html) no lleva three: va en los trozos perezosos
  const entrada = /<script type="module"[^>]*src="\/oficina\/assets\/([^"]+\.js)"/.exec(fs.readFileSync(path.join(dist, "index.html"), "utf8"));
  assert.ok(entrada, "el index.html del build pide su trozo de entrada");
  const js = fs.readFileSync(path.join(dist, "assets", entrada[1]), "utf8");
  assert.ok(!/WebGLRenderer|THREE\.WebGLRenderer|precision highp float/.test(js), "la entrada de la oficina no lleva three");
  const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg" };
  const nav = await lanza(), ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
  const json = (o, estado) => ({ status: estado || 200, contentType: "application/json", body: JSON.stringify(o) });
  await ctx.route("http://oficina.prueba/**", async ruta => {
    const u = new URL(ruta.request().url());
    if (u.pathname === "/api/oficina/sesion") return ruta.fulfill(json({ rol: "admin", aparato: { nombre: "Prueba", estado: "ok" }, caduca_en: new Date(Date.now() + 36e5).toISOString(), inactividad_min: 30, confirmacion_vigente: true }));
    if (u.pathname === "/api/admin/config") return ruta.fulfill(json({ versiones: [], publicada: null, en_prueba: null }));
    if (u.pathname === "/teselas/hituelo/indice.json") return ruta.fulfill(json(INDICE));
    if (u.pathname.startsWith("/api/")) return ruta.fulfill(json({ error: "no_simulado", mensaje: "no simulado" }, 404));
    const f = path.join(dist, u.pathname.replace(/^\/oficina\//, "").replace(/^\/$/, "index.html") || "index.html");
    const dentro = path.resolve(f).startsWith(path.resolve(dist));
    const cabeceras = { "Content-Security-Policy-Report-Only": CSP };   // la CSP del Caddy, en solo informe como en producción
    if (!dentro || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return ruta.fulfill({ status: u.pathname === "/oficina/" ? 200 : 404, headers: cabeceras, contentType: "text/html", body: u.pathname === "/oficina/" ? fs.readFileSync(path.join(dist, "index.html")) : "" });
    return ruta.fulfill({ status: 200, headers: cabeceras, contentType: TIPOS[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  const pg = await ctx.newPage(), errores = [], csp = [], pedidos = [];
  pg.on("pageerror", e => errores.push(String(e)));
  pg.on("console", m => { if (esCsp(m.text())) csp.push(m.text()); });
  pg.on("request", r => pedidos.push(new URL(r.url()).pathname));
  try {
    await pg.goto("http://oficina.prueba/oficina/?prueba#olivos");
    await pg.waitForFunction(() => window.__olivos && window.__olivos().cargado, null, { timeout: 30_000 });
    await pg.click("#t-real");
    await pg.fill("#rId", "olivo:hituelo:101"); await pg.click("#rVer");
    await pg.waitForSelector("#rSalida .escalon", { timeout: 120_000 });
    assert.strictEqual(await pg.isVisible("#rVer3d"), true, "el botón del visor sale con el olivo");
    const antes = pedidos.length;
    await pg.click("#rVer3d");
    await pg.waitForFunction(() => { const e = window.__visorOlivo.estado(); return e.abierto && e.escalones && e.escalones.length >= 3; }, null, { timeout: 180_000 });
    const nuevos = pedidos.slice(antes);
    assert.ok(nuevos.some(p => /\/oficina\/assets\/.+\.js$/.test(p)), "abrir el visor pide su trozo perezoso: " + nuevos.join(", "));
    const est = await pg.evaluate(() => window.__visorOlivo.estado());
    assert.ok(est.celdas.length >= 3, "al menos 3 escalones en el visor: " + est.celdas);
    assert.strictEqual(await pg.locator("#rVisorHost canvas").count(), 1, "un solo lienzo (un solo WebGLRenderer)");
    const px = await pg.evaluate(() => window.__visorOlivo.muestreo());
    for (const k of est.celdas) assert.ok(px[k] > 0.02, "el escalón " + k + " tiene píxeles de árbol o suelo: " + px[k]);
    assert.ok(est.triangulos > 0 && est.llamadas > 0, "renderer.info del último dibujo: " + JSON.stringify(est));
    // girar con los botones cambia el dibujo; el ratón también (OrbitControls)
    await pg.click("#rGiraD");
    const lienzo = await pg.locator("#rVisorHost canvas").boundingBox();
    await pg.mouse.move(lienzo.x + lienzo.width / 2, lienzo.y + lienzo.height / 2); await pg.mouse.down(); await pg.mouse.move(lienzo.x + lienzo.width / 2 + 80, lienzo.y + lienzo.height / 2, { steps: 5 }); await pg.mouse.up();
    fs.mkdirSync(SALIDA, { recursive: true });
    await pg.evaluate(() => window.__visorOlivo.muestreo());   // un dibujo justo antes de la captura
    await pg.locator("#rVisor").screenshot({ path: path.join(SALIDA, "oficina_visor_olivo.png") });
    // Esc cierra y suelta el lienzo; el foco vuelve al botón
    await pg.keyboard.press("Escape");
    await pg.waitForFunction(() => !window.__visorOlivo.estado().abierto, null, { timeout: 10_000 });
    assert.strictEqual(await pg.locator("#rVisorHost canvas").count(), 0, "al cerrar, el lienzo se quita (renderer liberado)");
    assert.strictEqual(await pg.evaluate(() => document.activeElement && document.activeElement.id), "rVer3d", "el foco vuelve al botón");
    assert.deepStrictEqual(errores, [], "sin errores de página");
    assert.deepStrictEqual(csp, [], "sin avisos de la CSP del Caddy (WebGL, módulos perezosos y fotos del mismo origen)");
    t.diagnostic("visor: " + JSON.stringify({ celdas: est.celdas, llamadas: est.llamadas, triangulos: est.triangulos, geometrias: est.geometrias, texturas: est.texturas, pixeles: px }) + " · captura: pruebas/salida/oficina_visor_olivo.png");
  } finally { await nav.close(); }
});
