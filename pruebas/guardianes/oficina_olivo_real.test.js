"use strict";
// La oficina, OF8: Olivos > «Olivo real» (apps/web/oficina/olivo_real.js y olivo_real_puro.js, doc/sistema/OFICINA.md §9.1). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen, DOM con textContent, ni three ni el motor por import directo (el constructor llega con import() perezoso por el alias «gemelo-olivo»);
//  - las cuentas puras (con un índice SINTÉTICO escrito aquí, sin datos de la explotación): buscar por copas_id, por «olivo:<finca>:<id>» y por posición, errores claros,
//    y que la entrada del generador sea EXACTAMENTE la que arma el motor (mismo semillaDeCopa y parametrosDeCopa del constructor, mismo factor de radio que 01_datos.js);
//  - el build de la oficina resuelve «gemelo-olivo» como el del mundo (con su sustituto si apps/web/olivo no está instalado).
// Opcional (GEMELO_CHROME=1): la pestaña en Chrome contra el build de la oficina, con la api y el índice simulados por playwright (sin Docker, sin servidor):
// busca un olivo por id y comprueba los cuatro escalones con sus triángulos calculados por el constructor REAL. Necesita `cd apps/web/olivo && npm ci`.
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const html = lee("apps/web/oficina/index.html");
const fuentes = { "olivo_real.js": lee("apps/web/oficina/olivo_real.js"), "olivo_real_puro.js": lee("apps/web/oficina/olivo_real_puro.js"), "olivos.js": lee("apps/web/oficina/olivos.js") };
const importa = f => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", f)).href);

// un índice sintético: 3 olivos con id estable, uno sin copas_param (solo h y r8)
const INDICE = {
  centro_utm: [440000, 4190000],
  copas: [[10, 20, 5.2, [2.4, 2.5, 2.6, 2.4, 2.3, 2.5, 2.6, 2.4], 1], [-30, 12, 4.1, [1.9, 2, 2.1, 2, 1.9, 2, 2.1, 2], 1], [5, -40, 6.3, [3, 3.1, 3, 2.9, 3, 3.1, 3, 2.9], 1]],
  copas_id: [101, 102, 2147483700],
  copas_param: [[5.4, 5.0, 0.6, 135, 0.7, 1.1, 0.12, 0], null, [6.5, 6.1, 0.2, 40, 0.8, 0.9, 0.2, 1]],
};

test("nada en línea ni de otro origen; todo con textContent; ni three ni el motor por import directo; el constructor llega perezoso", () => {
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
    assert.ok(!/from\s+["']three(-gen|-r186)?["']|from\s+["'][^"']*motor\//.test(c), n + ": ni three ni el motor");
  }
  assert.match(fuentes["olivo_real.js"], /await import\("gemelo-olivo"\)/, "el constructor se pide con import() perezoso");
  assert.ok(!/^import .*gemelo-olivo/m.test(fuentes["olivo_real.js"]), "y no con un import estático");
  assert.match(fuentes["olivo_real.js"], /fetch\("\/teselas\/" \+ encodeURIComponent\(finca\) \+ "\/indice\.json"/, "el índice, de /teselas/ del mismo origen");
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=/i.test(html));
});

test("la pestaña está en la sección Olivos, con su formulario etiquetado y su rotulación de «ilustrativo»", () => {
  assert.match(fuentes["olivos.js"], /\["real", "Olivo real"\]/);
  assert.match(fuentes["olivos.js"], /import \{ iniciaOlivoReal \} from "\.\/olivo_real\.js"/);
  assert.match(fuentes["olivos.js"], /id === "his" \|\| id === "real"/, "la barra de publicar no sale en esta pestaña: no toca la configuración");
  for (const id of ["p-real", "rBusca", "rFinca", "rId", "rEpoca", "rVer", "rMsg", "rSalida"]) assert.match(html, new RegExp('id="' + id + '"'));
  for (const id of ["rFinca", "rId", "rEpoca"]) assert.match(html, new RegExp('for="' + id + '"'), id + " tiene su etiqueta");
  assert.match(fuentes["olivo_real.js"], /ilustrativo: la forma del árbol/);
});

test("buscar un olivo: por copas_id, por «olivo:<finca>:<id>», por posición (solo sin copas_id) y con errores que dicen qué pasa", async () => {
  const P = await importa("olivo_real_puro.js");
  assert.deepStrictEqual(P.buscaOlivo(INDICE, "102", "hituelo"), { i: 1, id: 102 });
  assert.deepStrictEqual(P.buscaOlivo(INDICE, "  olivo:hituelo:2147483700 ", "hituelo"), { i: 2, id: 2147483700 });
  assert.match(P.buscaOlivo(INDICE, "olivo:cerro:101", "hituelo").error, /finca «cerro»/);
  assert.match(P.buscaOlivo(INDICE, "999", "hituelo").error, /No hay ningún olivo con el id 999/);
  assert.match(P.buscaOlivo(INDICE, "hola", "hituelo").error, /número entero/);
  assert.match(P.buscaOlivo(INDICE, "", "hituelo").error, /Escribe el id/);
  assert.match(P.buscaOlivo(INDICE, "i1", "hituelo").error, /ids estables/, "con copas_id no se busca por posición (no es estable)");
  const sinId = { centro_utm: INDICE.centro_utm, copas: INDICE.copas };
  assert.deepStrictEqual(P.buscaOlivo(sinId, "i2", "hituelo"), { i: 2, id: -1 });
  assert.match(P.buscaOlivo(sinId, "i9", "hituelo").error, /solo tiene 3 olivos/);
  assert.match(P.buscaOlivo(sinId, "101", "hituelo").error, /no trae copas_id/);
  assert.match(P.buscaOlivo({ copas: [] }, "1").error, /no trae olivos/);
});

test("la entrada del generador es la del motor: mismo semillaDeCopa, mismo parametrosDeCopa, mismo factor y mismo tipo", async () => {
  const P = await importa("olivo_real_puro.js"), C = await importa("../olivo/copas.js");
  const factor = /FACTOR_R8 = 0\.5, FACTOR_R8_GEN = (\d+(?:\.\d+)?)/.exec(lee("apps/web/motor/01_datos.js"));
  assert.ok(factor && Number(factor[1]) === P.FACTOR_R8_GEN, "FACTOR_R8_GEN de la oficina = el de 01_datos.js");
  assert.match(lee("apps/web/motor/07ab_generados.js"), new RegExp('M\\.parametrosDeCopa\\(raw, D\\.copas_param \\? D\\.copas_param\\[c\\.i\\] : null, "' + P.TIPO_MOTOR + '"'), "el tipo del motor es el de la oficina");
  for (const i of [0, 1, 2]) {
    const e = P.entradaDeOlivo(INDICE, i, "envero"), s = C.semillaDeCopa(INDICE.copas[i], INDICE.copas_id[i], INDICE.centro_utm, undefined);
    const p = C.parametrosDeCopa(INDICE.copas[i], INDICE.copas_param[i], P.TIPO_MOTOR, { factorR8: P.FACTOR_R8_GEN });
    assert.deepStrictEqual(e, { tipo: p.tipo, parametros: p.parametros, epoca: "envero", semilla: s.semilla, provisional: !!s.provisional });
  }
  assert.strictEqual(P.entradaDeOlivo(INDICE, 0, "envero").semilla, 101, "la semilla es el id (ADR-0012)");
  assert.strictEqual(P.entradaDeOlivo(INDICE, 2, "envero").provisional, true, "un id ≥ 2^31 es provisional");
  assert.strictEqual(P.entradaDeOlivo(INDICE, 0, "no_existe").epoca, P.EPOCA_POR_DEFECTO, "una época desconocida cae a la de siempre");
  // la copa y la altura de la receta salen del LiDAR cuando hay copas_param; sin él, de h y r8 (copa = 2 × r8 medio × factor)
  assert.strictEqual(P.entradaDeOlivo(INDICE, 0, "envero").parametros.copa, 5.0);
  assert.ok(Math.abs(P.entradaDeOlivo(INDICE, 1, "envero").parametros.copa - 2 * 2.0 * P.FACTOR_R8_GEN) < 1e-9);
  const f = P.fichaDeOlivo(INDICE, 1);
  assert.strictEqual(f.con_copas_param, false); assert.strictEqual(f.origen.copa, "medido"); assert.strictEqual(f.id, 102);
  assert.strictEqual(P.fichaDeOlivo(INDICE, 0).origen.asim, "deducido", "lo deducido se dice");
});

test("la tabla lado a lado: un escalón por nivel con su parte de E0; el impostor no se inventa", async () => {
  const P = await importa("olivo_real_puro.js");
  assert.deepStrictEqual(P.ESCALONES.map(e => e[0]), ["E0", "E1", "E2", "E2VR"], "los niveles del constructor (niveles.js)");
  const { NIVELES } = await importa("../olivo/niveles.js");
  assert.deepStrictEqual(P.ESCALONES.map(e => e[0]), NIVELES);
  const filas = P.filasEscalones({ E0: { triangulos: 200000, mallas: 9, ms: 80 }, E1: { triangulos: 50000, mallas: 8, ms: 3 }, E2: { triangulos: 4000, mallas: 8, ms: 2 } });
  assert.deepStrictEqual(filas.map(x => x.k), ["E0", "E1", "E2"], "solo lo medido");
  assert.deepStrictEqual(filas.map(x => x.parteDeE0), [1, 0.25, 0.02]);
  assert.strictEqual(P.miles(1234567), (1234567).toLocaleString("es-ES"));
  assert.strictEqual(P.pct(0.02), "2,0 %"); assert.strictEqual(P.pct(0.25), "25 %");
  assert.strictEqual(P.filasEscalones({}).length, 0);
});

test("el build de la oficina resuelve «gemelo-olivo» como el del mundo (con su sustituto sin apps/web/olivo instalado)", () => {
  const v = lee("apps/web/vite.oficina.config.js"), mundo = lee("apps/web/vite.config.js");
  assert.match(v, /find: \/\^gemelo-olivo\$\/, replacement: OLIVO/);
  assert.match(v, /sin_olivo\.js/);
  const fin = s => /const OLIVO = (fs\.existsSync\(path\.join\(WEB, "olivo", "node_modules", "three-gen", "package\.json"\)\) \? path\.join\(WEB, "olivo", "index\.js"\) : path\.join\(WEB, "olivo", "sin_olivo\.js"\));/.exec(s);
  assert.ok(fin(v) && fin(mundo) && fin(v)[1] === fin(mundo)[1], "la misma regla que el build del mundo");
  assert.ok(fs.existsSync(path.join(RAIZ, "apps", "web", "olivo", "sin_olivo.js")));
});

// ——— recorrido en Chrome (opcional, sin Docker) ———
const SALTO = process.env.GEMELO_CHROME !== "1" ? "recorrido en Chrome opcional (GEMELO_CHROME=1): la pestaña Olivo real NO se ha comprobado en un navegador" : null;

test("recorrido: buscar un olivo por id y ver sus cuatro escalones con triángulos del constructor real", { timeout: 600_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: Olivo real NO se ha comprobado");
  if (!fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "vite")) || !fs.existsSync(path.join(RAIZ, "apps", "web", "olivo", "node_modules", "three-gen"))) return t.skip("faltan apps/web (npm ci) o apps/web/olivo (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-olivo-real-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);
  const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
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
    if (!dentro || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return ruta.fulfill({ status: u.pathname === "/oficina/" ? 200 : 404, contentType: "text/html", body: u.pathname === "/oficina/" ? fs.readFileSync(path.join(dist, "index.html")) : "" });
    return ruta.fulfill({ status: 200, contentType: TIPOS[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  const pg = await ctx.newPage(), errores = [];
  pg.on("pageerror", e => errores.push(String(e)));
  try {
    await pg.goto("http://oficina.prueba/oficina/?prueba#olivos");
    await pg.waitForFunction(() => window.__olivos && window.__olivos().cargado, null, { timeout: 30_000 });
    await pg.click("#t-real");
    assert.strictEqual(await pg.isVisible("#p-real"), true); assert.strictEqual(await pg.isVisible("#oBarra"), false, "esta pestaña no publica nada");
    // un id que no existe: un mensaje claro y nada pintado
    await pg.fill("#rId", "999"); await pg.click("#rVer");
    await pg.waitForFunction(() => /No hay ningún olivo/.test(document.querySelector("#rMsg").textContent), null, { timeout: 15_000 });
    assert.strictEqual(await pg.locator("#rSalida .escalon").count(), 0);
    // uno que sí: los cuatro escalones, con triángulos del constructor y E2 más barato que E0
    await pg.fill("#rId", "olivo:hituelo:101"); await pg.click("#rVer");
    await pg.waitForSelector("#rSalida .escalon", { timeout: 120_000 });
    assert.strictEqual(await pg.locator("#rSalida .escalon").count(), 4);
    const tri = k => pg.evaluate(k2 => Number(document.querySelector("#esc-" + k2 + " .cifra").textContent.replace(/\./g, "")), k);
    const [e0, e1, e2, vr] = [await tri("E0"), await tri("E1"), await tri("E2"), await tri("E2VR")];
    assert.ok(e0 > 0 && e1 > 0 && e2 > 0 && vr > 0, "triángulos de los cuatro escalones: " + [e0, e1, e2, vr]);
    assert.ok(e2 < e0, "el lejano cuesta menos que el cercano: " + e2 + " frente a " + e0);
    assert.match(await pg.textContent("#rSalida"), /ilustrativo/);
    assert.deepStrictEqual(await pg.evaluate(() => window.__olivos && !!window.__olivos()), true);
    assert.deepStrictEqual(errores, [], "sin errores de página");
    t.diagnostic("triángulos E0/E1/E2/E2VR del olivo 101 (sintético): " + [e0, e1, e2, vr].join(" / "));
  } finally { await nav.close(); }
});
