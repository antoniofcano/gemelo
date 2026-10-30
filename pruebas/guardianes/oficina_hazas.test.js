"use strict";
// La oficina, OF3: la sección Hazas (apps/web/oficina/hazas.js, doc/sistema/OFICINA.md §4). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen (CSP estricta), DOM con textContent; el editor es OpenLayers + proj4 con versión fijada
//    (regla 12: no un editor de polígonos casero) en EPSG:25830; las rutas que usa están en el contrato; juntar y borrar pasan por la
//    confirmación reciente; la migración 0010 crea el historial solo-añadir;
//  - las cuentas puras del editor (hazas_puro.js): mover, quitar y añadir vértices, redondeo, superficie, recuento orientativo, solapes.
// Opcional (GEMELO_DOCKER=1): recorrido en Chrome contra la api REAL con PostGIS en un contenedor (Testcontainers, NO el entorno de la persona)
// y la finca del fixture servida en /teselas/hituelo/ tras sesión: crear una haza dibujando, mover un vértice con el ratón, avisar de un solape,
// mover vértices con el teclado, guardar (recuento del servidor) y volver a una versión, a 1280 y 1024 px, con la CSP de Caddy impuesta.
const test = require("node:test"), assert = require("node:assert");
const { spawn, spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fixture, fs, path } = require("./_util");

const html = lee("apps/web/oficina/index.html");
const fuentes = { "hazas.js": lee("apps/web/oficina/hazas.js"), "hazas_puro.js": lee("apps/web/oficina/hazas_puro.js"), "oficina.js": lee("apps/web/oficina/oficina.js") };

test("nada en línea ni de otro origen; el DOM se hace con textContent", () => {
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
  }
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=/i.test(html));
  assert.match(fuentes["hazas.js"], /fetch\(base \+ "indice\.json"/, "las teselas, del mismo origen (/teselas/<finca>/)");
  assert.match(fuentes["hazas.js"], /const base = "\/teselas\/"/);
});

test("el editor es OpenLayers + proj4 (versiones fijadas) en EPSG:25830, no un editor casero; se carga solo al entrar en Hazas", () => {
  const pkg = JSON.parse(lee("apps/web/package.json"));
  assert.match(pkg.dependencies.ol || "", /^\d+\.\d+\.\d+$/, "ol con versión exacta");
  assert.match(pkg.dependencies.proj4 || "", /^\d+\.\d+\.\d+$/, "proj4 con versión exacta");
  const js = fuentes["hazas.js"];
  for (const i of ["Draw", "Modify", "Snap", "Translate"]) assert.match(js, new RegExp("\\b" + i + "\\b[^;]*from \"ol/interaction\\.js\""), "usa " + i + " de OpenLayers");
  assert.match(js, /import proj4 from "proj4"/); assert.match(js, /register\(proj4\)/);
  assert.match(js, /proj4\.defs\("EPSG:25830", "\+proj=utm \+zone=30 \+ellps=GRS80/);
  assert.ok(!/EPSG:3857|fromLonLat/.test(js), "sin pasar por Web Mercator");
  assert.match(fuentes["oficina.js"], /await import\("\.\/hazas\.js"\)/, "OpenLayers no pesa en la carga de la oficina");
  const lic = n => { try { return JSON.parse(fs.readFileSync(path.join(RAIZ, "apps", "web", "node_modules", n, "package.json"), "utf8")).license; } catch { return null; } };
  if (lic("ol")) { assert.strictEqual(lic("ol"), "BSD-2-Clause"); assert.strictEqual(lic("proj4"), "MIT"); }
});

test("las rutas que usa la sección están en el contrato; juntar y borrar piden confirmación reciente", () => {
  const openapi = lee("contratos/api.openapi.yaml"), js = fuentes["hazas.js"];
  for (const r of ["/api/admin/hazas", "/api/admin/hazas/{id}/geom", "/api/admin/hazas/{id}/partir", "/api/admin/hazas/juntar", "/api/admin/hazas/{id}",
    "/api/admin/hazas/{id}/versiones", "/api/admin/hazas/{id}/volver/{version}", "/api/admin/hogares/{id}/haza", "/api/admin/hazas/{id}/hogar", "/api/admin/hogares"]) {
    assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  }
  assert.match(js, /conConfirmacion\(\(\) => api\("POST", "\/api\/admin\/hazas\/juntar"/);
  assert.match(js, /conConfirmacion\(\(\) => api\("DELETE", "\/api\/admin\/hazas\/"/);
  assert.match(js, /version: z\.version/, "se guarda sobre la versión que se editó");
  const api = lee("apps/api/src/admin/hazas.ts");
  assert.match(api, /"\/api\/admin\/hazas\/juntar", \{\s*preHandler: OFICINA_CONFIRMADA/);
  assert.match(api, /app\.delete[^\n]*"\/api\/admin\/hazas\/:id", \{\s*preHandler: OFICINA_CONFIRMADA/);
  assert.ok(!/preHandler: (?!OFICINA)/.test(api), "todas las rutas con la guarda de oficina");
  for (const f of ["ST_Split", "ST_Union", "ST_IsValid", "ST_Intersects"]) assert.match(api, new RegExp(f), "PostGIS: " + f);
  const mig = lee("apps/api/migraciones/0010_hazas_versiones.sql");
  assert.match(mig, /CREATE TABLE hazas_versiones/); assert.match(mig, /REVOKE UPDATE, DELETE, TRUNCATE ON hazas_versiones FROM gemelo_api/);
  assert.match(mig, /ADD COLUMN version integer NOT NULL DEFAULT 1/);
});

test("accesibilidad: el mapa se enfoca y explica su teclado; botones con aria-pressed; diálogo nativo", () => {
  assert.match(html, /<div id="mapa" tabindex="0" role="application"[^>]*aria-describedby="mAyuda mEstado"/);
  assert.match(html, /id="mEstado" aria-live="polite"/);
  assert.match(html, /Tab y Mayús\+Tab eligen vértice, las flechas lo mueven 0,5 m/);
  for (const b of ["bNueva", "bMover", "bPartir"]) assert.match(html, new RegExp('id="' + b + '" type="button" aria-pressed="false"'));
  assert.match(html, /<dialog id="dlgHaza" aria-labelledby="dlgHazaT">/);
  assert.match(html, /<label class="vh" for="sJuntar">/);
  assert.match(fuentes["hazas.js"], /sig < 0 \|\| sig >= v\.length/, "Tab no atrapa el foco: al pasar del último vértice sale del mapa");
  assert.match(html, /medido/, "medido / deducido / ilustrativo: las copas se marcan como medidas");
});

test("cuentas puras: vértices, superficie, recuento orientativo y solapes", async () => {
  const P = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "hazas_puro.js")).href);
  const cuadro = (x, y, l) => [[[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]]];
  const c = [cuadro(0, 0, 10)];
  assert.strictEqual(P.vertices(c).length, 4);
  assert.strictEqual(P.area(c), 100);
  const m = P.mueve(c, 0, -1, -1);
  assert.deepStrictEqual(m[0][0][0], [-1, -1]); assert.deepStrictEqual(m[0][0][4], [-1, -1], "el anillo sigue cerrado");
  assert.deepStrictEqual(c[0][0][0], [0, 0], "no toca la entrada");
  const i = P.inserta(c, 1);
  assert.strictEqual(i.k, 2); assert.deepStrictEqual(i.coords[0][0][2], [10, 5]); assert.strictEqual(P.area(i.coords), 100);
  assert.strictEqual(P.quita([[[[0, 0], [1, 0], [0, 1], [0, 0]]]], 0), null, "un anillo no baja de tres vértices");
  const q = P.quita(i.coords, 0);
  assert.strictEqual(P.vertices(q).length, 4); assert.deepStrictEqual(q[0][0][0], q[0][0][4]);
  assert.deepStrictEqual(P.redondea([[[[1.234567, 2.345678], [3, 4], [5, 6], [1.2345, 2.3456]]]])[0][0], [[1.23, 2.35], [3, 4], [5, 6], [1.23, 2.35]]);
  const con = [[cuadro(0, 0, 10)[0], cuadro(4, 4, 2)[0]]];   // con un hueco de 2 × 2
  assert.strictEqual(P.area(con), 96);
  assert.ok(P.dentro(con, 1, 1)); assert.ok(!P.dentro(con, 5, 5), "el hueco no es de la haza");
  assert.deepStrictEqual(P.cuenta(c, [[5, 5], [0.5, 5], [11, 5], [9.9, 9.9]], 1), { olivos: 3, borde: 2 });
  assert.ok(!P.sePisan(c, [cuadro(10, 0, 10)]), "compartir linde no es pisarse");
  assert.ok(!P.sePisan(c, [cuadro(10.02, 0, 10)]));
  assert.ok(P.sePisan(c, [cuadro(5, 5, 10)]));
  assert.ok(P.sePisan(c, [cuadro(2, 2, 3)]), "una dentro de otra");
  assert.ok(P.sePisan(c, [[[[-1, 4], [11, 4], [11, 6], [-1, 6], [-1, 4]]]]), "una franja que la cruza (sin vértices dentro)");
  assert.strictEqual(P.verticeCercano(c, 9.8, 0.1, 0.5), 1); assert.strictEqual(P.verticeCercano(c, 5, 5, 0.5), -1);
  assert.strictEqual(P.codigoLibre(["H-01", "H-02", "H-07", "X-99"]), "H-08"); assert.strictEqual(P.codigoLibre([]), "H-01");
});

test("cuentas puras: la haza cabe en el límite de la finca (OF3b), también cóncavo y con holgura", async () => {
  const P = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "hazas_puro.js")).href);
  const sq = (x, y, l) => [[[[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]]]];
  const L = [[[[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100], [0, 0]]]];   // una L: le falta el cuadrante NE
  assert.ok(P.cabeEn(sq(10, 10, 20), L, 0));
  assert.ok(!P.cabeEn(sq(40, 40, 20), L, 0), "una esquina en el hueco de la L");
  assert.ok(P.cabeEn([[[[10, 60], [40, 45], [60, 10], [10, 60]]]], L, 0), "vértices en los dos brazos sin pasar por el hueco");
  assert.ok(!P.cabeEn([[[[40, 90], [90, 40], [45, 45], [40, 90]]]], L, 0), "vértices dentro pero un lado cruza el hueco");
  assert.ok(P.cabeEn(sq(0, 0, 10), L, 0), "compartir linde con el límite vale");
  assert.ok(P.cabeEn(sq(-0.5, 0, 10), L, 1), "medio metro fuera, con holgura de 1 m");
  assert.ok(!P.cabeEn(sq(-2, 0, 10), L, 1));
  assert.ok(P.cabeEn(sq(500, 500, 5), null), "sin límite conocido decide el servidor");
  assert.ok(P.puntoEnLimite(L, 75, 25) && !P.puntoEnLimite(L, 75, 75) && P.puntoEnLimite(L, 100.5, 25, 1) && P.puntoEnLimite(null, 1e9, 1e9));
});

// ——— recorrido en Chrome (opcional) ———
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "recorrido de Docker + Chrome opcional (GEMELO_DOCKER=1): el editor de hazas contra la api real NO se ha comprobado" : null;

test("recorrido: crear, mover un vértice (ratón y teclado), solape, guardar con recuento del servidor y volver (1280 y 1024 px, CSP impuesta)", { timeout: 900_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: el editor de hazas NO se ha comprobado");
  if (!fs.existsSync(path.join(RAIZ, "apps", "api", "node_modules", "fastify")) || !fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "ol"))) return t.skip("faltan las dependencias de apps/api o apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const finca = path.join(fixture({ sinTileset: true }), "hituelo");
  const dist = propia("oficina-hazas-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);

  const nav = await lanza();
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const srv = spawn(process.execPath, ["pruebas/e2e/oficina_servidor.ts", dist, finca], { cwd: path.join(RAIZ, "apps", "api"), env, stdio: ["pipe", "pipe", "pipe"] });
  let salida = "", errs = "";
  srv.stdout.on("data", d => { salida += d; }); srv.stderr.on("data", d => { errs += d; });
  try {
    const info = await new Promise((ok, mal) => {
      const lim = setTimeout(() => mal(new Error("el servidor de la oficina no arrancó en 5 min: " + errs)), 300_000);
      const mira = setInterval(() => {
        const m = /LISTO (\{.*\})/.exec(salida);
        if (m) { clearInterval(mira); clearTimeout(lim); ok(JSON.parse(m[1])); }
        else if (srv.exitCode !== null) { clearInterval(mira); clearTimeout(lim); mal(new Error("el servidor salió (" + srv.exitCode + "): " + errs)); }
      }, 500);
    });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const base = info.url, get = async r => (await fetch(base + r)).json();
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES", ignoreHTTPSErrors: true });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    // un 400 provocado a propósito (paso 5b: guardar fuera del contorno) se descuenta por su URL; cualquier otro 400 cuenta como error
    const provocados400 = [], ruta = u => { try { return new URL(u).pathname; } catch { return ""; } };
    pg.on("console", m => {
      if (m.type() !== "error" || /Failed to load resource.*(401|403|404|409)/.test(m.text())) return;
      const i = /Failed to load resource.*\b400\b/.test(m.text()) ? provocados400.indexOf(ruta(m.location().url)) : -1;
      if (i >= 0) provocados400.splice(i, 1); else errores.push(m.text() + " " + m.location().url);
    });

    await pg.goto(base + "/__prueba/aparato");
    const { url } = await get("/__prueba/enlace?para=" + encodeURIComponent(info.admin));
    await pg.goto(url);
    await pg.click("button[type=submit], input[type=submit]");
    await pg.waitForURL(/\/oficina\//, { timeout: 15_000 });
    await pg.goto(base + "/oficina/?prueba#hazas");
    await pg.waitForFunction(() => window.__hazas && window.__hazas().hazas === 4 && window.__hazas().copas === 140, null, { timeout: 30_000 }).catch(async e => {
      // sin esto, el tiempo agotado no dice qué tenía la página: lo que contaba __hazas, el estado y los errores
      const vio = await pg.evaluate(() => ({ hazas: window.__hazas ? (({ hazas, copas, limite }) => ({ hazas, copas, limite }))(window.__hazas()) : null, url: location.href, estado: (document.querySelector("#mEstado") || {}).textContent || null, avisos: (document.querySelector("#avisos") || {}).textContent || null, csp: window.__csp, llave: !(document.querySelector("#pLlave") || { hidden: true }).hidden, anuncio: (document.querySelector("#anuncio") || {}).textContent || null, titulo: document.title })).catch(() => null);
      throw new Error(String(e.message).split("\n")[0] + " esperando el editor de hazas; la página: " + JSON.stringify(vio) + "; errores: " + JSON.stringify(errores));
    });
    const est =() => pg.evaluate(() => { const e = window.__hazas(); delete e.pixelDe; return e; });
    const pixel = async (x, y) => { const p = await pg.evaluate(([a, b]) => window.__hazas().pixelDe(a, b), [x, y]); const r = await pg.locator("#mapa").boundingBox(); return [r.x + p[0], r.y + p[1]]; };
    const { centro } = { centro: JSON.parse(fs.readFileSync(path.join(finca, "indice.json"), "utf8")).centro_utm };
    const U = (x, y) => [centro[0] + x, centro[1] + y];
    const hazasApi = async () => pg.evaluate(async () => (await (await fetch("/api/admin/hazas?finca=hituelo")).json()).hazas);
    await pg.waitForFunction(() => document.querySelectorAll("#mapa canvas").length > 0);
    assert.match(await pg.textContent("#mEstado"), /140 copas medidas/);

    // 1. crear dibujando en el hueco entre las dos parcelas (sin olivos): cuatro clics e Intro, código y nombre. Sin ajuste, para que los
    //    vértices caigan donde se toca (con él, se pegan a las lindes de las parcelas a 2 m)
    await pg.uncheck("#cAjuste");
    await pg.click("#bNueva");
    for (const [x, y] of [[-28, -205], [18, -205], [18, -75], [-28, -75]]) { const [px, py] = await pixel(...U(x, y)); await pg.mouse.click(px, py); await pg.waitForTimeout(150); }
    await pg.keyboard.press("Enter");
    await pg.waitForSelector("#dlgHaza[open]");
    assert.strictEqual(await pg.inputValue("#hzCodigo"), "H-05", "propone el siguiente código libre");
    await pg.fill("#hzNombre", "La del camino");
    await pg.click("#hzOk");
    await pg.waitForSelector("#avisos .aviso:has-text('Haza H-05 creada')");
    let h5 = (await hazasApi()).find(z => z.codigo === "H-05");
    assert.ok(h5, "la haza está en la base"); assert.strictEqual(h5.version, 1); assert.strictEqual(h5.olivos, 0);
    assert.ok(Math.abs(h5.superficie_ha - 0.598) < 0.02, "superficie del servidor " + h5.superficie_ha);
    assert.strictEqual((await est()).sel, "H-05");

    // 2. mover un vértice arrastrando con el ratón (el NO, 15 m al norte) y guardar: versión 2
    const [ax, ay] = await pixel(...U(-28, -75)), [bx, by] = await pixel(...U(-28, -60));
    await pg.mouse.move(ax, ay); await pg.mouse.down(); await pg.mouse.move((ax + bx) / 2, (ay + by) / 2, { steps: 4 }); await pg.mouse.move(bx, by, { steps: 4 }); await pg.mouse.up();
    await pg.waitForFunction(() => window.__hazas().sucia);
    assert.strictEqual(await pg.isDisabled("#bGuarda"), false);
    await pg.click("#bGuarda");
    await pg.waitForSelector("#avisos .aviso:has-text('Versión 2 de H-05 guardada')");
    h5 = (await hazasApi()).find(z => z.codigo === "H-05");
    assert.strictEqual(h5.version, 2); assert.ok(h5.superficie_ha > 0.62, "más grande tras mover el vértice: " + h5.superficie_ha);

    // 3. solape: con el teclado, el vértice SE 10 m al este (pisa H-03): aviso en la ficha y el servidor no lo guarda; deshacer
    await pg.focus("#mapa");
    await pg.keyboard.press("Tab"); await pg.keyboard.press("Tab");   // vértice 2 = (18, -205)
    assert.strictEqual((await est()).vertice, 1);
    await pg.keyboard.press("Shift+ArrowRight"); await pg.keyboard.press("Shift+ArrowRight");
    await pg.waitForSelector("#hFicha .p-mal:has-text('Se pisa con H-03')");
    await pg.click("#bGuarda");
    await pg.waitForSelector("#avisos .aviso.mal:has-text('pisa a H-03')");
    await pg.focus("#mapa"); await pg.keyboard.press("Control+z"); await pg.keyboard.press("Control+z");
    await pg.waitForFunction(() => !window.__hazas().sucia);

    // 4. teclado sobre H-02 (x de -135 a -30): sus dos vértices del este 25 m al oeste dejan fuera una columna de 7 olivos; guardar = 28 del servidor
    //    (H-02 ya trae versiones: la de la carga y la de ponerla sobre el fixture, que la tubería apunta como «carga»)
    const v0 = (await hazasApi()).find(z => z.codigo === "H-02").version;
    await pg.selectOption("#hSel", { label: "H-02 · El Pilar" });
    await pg.waitForFunction(() => window.__hazas().sel === "H-02");
    await pg.waitForSelector("#hFicha .cifra:text-is('35')");
    assert.ok(!/\bnull\b|undefined|NaN/.test(await pg.textContent("#hFicha")), "la ficha no enseña null, undefined ni NaN");
    await pg.focus("#mapa");
    await pg.keyboard.press("Tab"); await pg.keyboard.press("Tab");
    for (let i = 0; i < 5; i++) await pg.keyboard.press("Shift+ArrowLeft");
    await pg.keyboard.press("Tab");
    for (let i = 0; i < 5; i++) await pg.keyboard.press("Shift+ArrowLeft");
    const c2 = (await est()).coordsSel[0][0].map(q => [Math.round(q[0] - centro[0]), Math.round(q[1] - centro[1])]);
    assert.deepStrictEqual(c2, [[-135, -210], [-55, -210], [-55, -50], [-135, -50], [-135, -210]], "0,5 m × 10 con Mayús, cinco veces = 25 m");
    assert.match(await pg.textContent("#hFicha"), /en tu navegador \(orientativo\): 1,28 ha, 28 olivos/);
    await pg.click("#bGuarda");
    await pg.waitForSelector("#avisos .aviso:has-text('Versión " + (v0 + 1) + " de H-02 guardada: 1,28 ha, 28 olivos (recuento del servidor)')");
    let h2 = (await hazasApi()).find(z => z.codigo === "H-02");
    assert.strictEqual(h2.olivos, 28); assert.strictEqual(h2.version, v0 + 1); assert.strictEqual(h2.superficie_ha, 1.28);

    // 5. volver a la versión de antes desde el historial (una copia: versión nueva, otra vez 35 olivos)
    await pg.waitForSelector("#hFicha [data-volver='" + v0 + "']");
    await pg.click("#hFicha [data-volver='" + v0 + "']");
    await pg.waitForSelector("#dlgConfirma[open]");
    assert.strictEqual(await pg.textContent("#dlgConfSi"), "Guardar como versión " + (v0 + 2));
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#avisos .aviso:has-text('vuelve a la linde de la versión " + v0 + "')");
    h2 = (await hazasApi()).find(z => z.codigo === "H-02");
    assert.strictEqual(h2.version, v0 + 2); assert.strictEqual(h2.olivos, 35);
    await pg.waitForSelector("#hFicha .historial li:has-text('v" + (v0 + 2) + " · vuelta atrás (a la v" + v0 + ")')");
    const v = await pg.evaluate(async id => (await (await fetch("/api/admin/hazas/" + id + "/versiones")).json()).versiones.map(x => x.accion), h2.id);
    assert.deepStrictEqual(v.slice(0, 2), ["volver", "editar"], "el historial no se reescribe"); assert.strictEqual(v.length, v0 + 2);

    // 5b. límite de la finca (OF3b): sin contorno, la caja de los olivos + 150 m; con un contorno cargado (admin, confirmación reciente),
    //     un vértice de H-02 no sale de él con el teclado y el servidor rechaza guardar fuera (fuera_de_contorno)
    assert.strictEqual((await est()).limite, "caja");
    assert.match(await pg.textContent("#mLimite"), /caja de los olivos medidos \+ 150 m/);
    const rectU = (x0, y0, x1, y1) => ({ type: "Polygon", coordinates: [[U(x0, y0), U(x1, y0), U(x1, y1), U(x0, y1), U(x0, y0)]] });
    const carga = await pg.evaluate(async b => { const r = await fetch("/api/admin/fincas/hituelo/contorno", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return [r.status, await r.json()]; },
      { geometria: rectU(-140, -400, 400, 400), fuente: "sigpac", consultado_en: "2026-10-30", parcelas: 2 });
    assert.strictEqual(carga[0], 201, JSON.stringify(carga[1])); assert.strictEqual(carga[1].tipo, "contorno");
    provocados400.push("/api/admin/hazas/" + h2.id + "/geom");   // el contrato dice 400 fuera_de_contorno (api.openapi.yaml)
    const fuera = await pg.evaluate(async b => (await fetch("/api/admin/hazas/" + b.id + "/geom", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b.cuerpo) })).json(),
      { id: h2.id, cuerpo: { version: h2.version, geometria: rectU(-150, -210, -30, -50) } });
    assert.strictEqual(fuera.error, "fuera_de_contorno", "el servidor manda: " + JSON.stringify(fuera));
    await pg.reload();
    await pg.waitForFunction(() => window.__hazas && window.__hazas().limite === "contorno" && window.__hazas().hazas >= 4, null, { timeout: 30_000 });
    assert.match(await pg.textContent("#mLimite"), /contorno de 2 parcelas SIGPAC © FEGA \(CC BY 4\.0\)/);
    await pg.selectOption("#hSel", { label: "H-02 · El Pilar" });
    await pg.waitForFunction(() => window.__hazas().sel === "H-02");
    await pg.focus("#mapa");
    await pg.keyboard.press("Tab");   // vértice 1 = (-135, -210)
    await pg.keyboard.press("Shift+ArrowLeft");   // -140: en la linde del contorno, cabe
    await pg.keyboard.press("Shift+ArrowLeft");   // -145: fuera, no se mueve
    assert.match(await pg.textContent("#mEstado"), /fuera del contorno de la finca \(SIGPAC\): no se mueve/);
    assert.strictEqual(Math.round((await est()).coordsSel[0][0][0][0] - centro[0]), -140);
    await pg.keyboard.press("Control+z");
    await pg.waitForFunction(() => !window.__hazas().sucia);
    await pg.evaluate(async () => fetch("/api/admin/fincas/hituelo/contorno", { method: "DELETE" }));

    // 6. a 1280 y 1024: sin desbordes, con capturas
    const salidaCap = process.env.GEMELO_CAPTURAS || propia("oficina-hazas-capturas");
    fs.mkdirSync(salidaCap, { recursive: true });
    for (const ancho of [1280, 1024]) {
      await pg.setViewportSize({ width: ancho, height: 800 });
      await pg.waitForTimeout(400);
      const sobra = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(sobra <= 0, "a " + ancho + " px hay desborde horizontal de " + sobra + " px");
      const sobreMain = await pg.evaluate(() => { const m = document.querySelector("main"); return m.scrollWidth - m.clientWidth; });
      assert.ok(sobreMain <= 0, "a " + ancho + " px main desborda " + sobreMain + " px");
      await pg.screenshot({ path: path.join(salidaCap, "hazas-" + ancho + ".png") });
    }
    console.log("# capturas del recorrido en " + salidaCap);
    assert.deepStrictEqual(await pg.evaluate(() => window.__csp), [], "ninguna violación de la CSP impuesta");
    assert.deepStrictEqual(errores, [], "sin errores en la página");
    await ctx.close();
  } finally {
    srv.stdin.end();
    await new Promise(ok => { const f = setTimeout(() => { srv.kill(); ok(); }, 60_000); srv.on("exit", () => { clearTimeout(f); ok(); }); });
    await nav.close();
  }
});
