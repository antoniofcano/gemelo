"use strict";
// La oficina, OF15a: enlaces entre Familias y Hazas (apps/web/oficina/enlaces_puro.js, doc/sistema/OFICINA.md §3 y §4). Siempre, y sin red ni Chrome:
//  - el hash de la URL: «#hazas/H-01» y «#familias/12» se leen y se construyen en una función pura; lo inválido nunca llega a la sección;
//  - estática: los enlaces son <a> con href construido por construyeHash (no botones disfrazados), con la zona táctil de .boton, y sin HTML a mano.
// Opcional (GEMELO_ENLACES_CHROME=1, por el banco de pruebas: un solo Chrome a la vez): la oficina construida (build:oficina) con la api SIMULADA
// (page.route): pulsar «Ver la haza» en Familias abre Hazas con esa haza elegida; «Ver la familia» en Hazas deja la ficha de la familia con aria-current.
// NO prueba: la api real, la tableta, un lector de pantalla ni el mapa con ortofoto real (las teselas se simulan vacías).
const test = require("node:test"), assert = require("node:assert");
const http = require("http");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const fuentes = { "enlaces_puro.js": lee("apps/web/oficina/enlaces_puro.js"), "oficina.js": lee("apps/web/oficina/oficina.js"),
  "familias.js": lee("apps/web/oficina/familias.js"), "hazas.js": lee("apps/web/oficina/hazas.js") };
const importa = () => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "enlaces_puro.js")).href);

test("parseaHash y construyeHash: ida y vuelta, y los casos inválidos se quedan en la sección a secas", async () => {
  const P = await importa();
  assert.deepStrictEqual(P.parseaHash("#hazas/H-01"), { sec: "hazas", param: "H-01" });
  assert.deepStrictEqual(P.parseaHash("#familias/12"), { sec: "familias", param: "12" });
  assert.deepStrictEqual(P.parseaHash("hazas/H-01"), { sec: "hazas", param: "H-01" }, "sin la almohadilla también");
  assert.deepStrictEqual(P.parseaHash("#hazas"), { sec: "hazas", param: null });
  assert.deepStrictEqual(P.parseaHash("#"), { sec: "", param: null });
  assert.deepStrictEqual(P.parseaHash(""), { sec: "", param: null });
  assert.deepStrictEqual(P.parseaHash(undefined), { sec: "", param: null });
  assert.deepStrictEqual(P.parseaHash("#hazas/H%2D01"), { sec: "hazas", param: "H-01" }, "se decodifica");
  for (const malo of ["#hazas/", "#hazas/../x", "#hazas/<img>", "#hazas/H 01", "#hazas/-H", "#hazas/" + "A".repeat(33), "#hazas/%E0%A4%A", "#hazas/H-01/otro"])
    assert.strictEqual(P.parseaHash(malo).param, null, malo);
  for (const malo of ["#familias/0", "#familias/-3", "#familias/1.5", "#familias/abc", "#familias/012", "#familias/12345678901", "#familias/1e3"])
    assert.strictEqual(P.parseaHash(malo).param, null, malo);
  assert.deepStrictEqual(P.parseaHash("#bandeja/5"), { sec: "bandeja", param: null }, "las demás secciones no llevan parámetro");
  assert.deepStrictEqual(P.parseaHash("#nada/zz"), { sec: "nada", param: null });
  assert.strictEqual(P.construyeHash("hazas", "H-01"), "#hazas/H-01");
  assert.strictEqual(P.construyeHash("familias", 12), "#familias/12");
  assert.strictEqual(P.construyeHash("familias", "12"), "#familias/12");
  assert.strictEqual(P.construyeHash("hazas", null), "#hazas");
  assert.strictEqual(P.construyeHash("hazas", undefined), "#hazas");
  assert.strictEqual(P.construyeHash("hazas", "<x>"), "#hazas", "un parámetro inválido se omite");
  assert.strictEqual(P.construyeHash("familias", 0), "#familias");
  assert.strictEqual(P.construyeHash("bandeja", "5"), "#bandeja", "una sección sin parámetros lo ignora");
  assert.strictEqual(P.construyeHash("inicio"), "#inicio");
  for (const [s, p] of [["hazas", "H-01"], ["hazas", "H-12b"], ["familias", "7"], ["familias", "4294967295"]])
    assert.deepStrictEqual(P.parseaHash(P.construyeHash(s, p)), { sec: s, param: p }, "ida y vuelta " + s + "/" + p);
});

test("estática: los enlaces son <a> reales con href de construyeHash, sin HTML a mano; oficina.js entiende el hash con parámetro", () => {
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(c), n + ": DOM con h()/textContent");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
  }
  assert.match(fuentes["familias.js"], /h\("a", \{ class: "boton peq", href: construyeHash\("hazas", c\), "data-enlace": "haza" \}, "Ver la haza " \+ c\)/);
  assert.match(fuentes["hazas.js"], /h\("a", \{ class: "boton peq", href: construyeHash\("familias", z\.hogar_id\), "data-enlace": "familia"/);
  assert.match(fuentes["hazas.js"], /z\.hogar_id \? h\("p"/, "«Ver la familia» solo con titular");
  assert.match(fuentes["oficina.js"], /parseaHash\(location\.hash\)/);
  assert.match(fuentes["oficina.js"], /construyeHash\(sec, param\)/);
  assert.match(fuentes["familias.js"], /aria-current/);
  assert.match(lee("apps/web/oficina/oficina.css"), /\.boton \{ min-height: var\(--toque\)/, "la zona táctil de los enlaces (.boton) es la de los botones");
});

// ——— recorrido en Chrome con la api simulada (opcional, por el banco) ———
const SALTO = process.env.GEMELO_ENLACES_CHROME !== "1" ? "recorrido en Chrome opcional (GEMELO_ENLACES_CHROME=1, por el banco): los enlaces Familias ⇄ Hazas NO se han comprobado en navegador" : null;

test("recorrido: «Ver la haza» en Familias elige esa haza en Hazas; «Ver la familia» vuelve a su ficha; un enlace copiado abre directo", { timeout: 600_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: los enlaces NO se han comprobado en navegador");
  if (!fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "ol"))) return t.skip("faltan las dependencias de apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-enlaces-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);
  const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
  const srv = http.createServer((q, r) => {
    let f = path.join(dist, decodeURIComponent(q.url.split("?")[0].replace(/^\/oficina\//, "/")));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    r.writeHead(200, { "content-type": tipos[path.extname(f)] || "application/octet-stream" }); r.end(fs.readFileSync(f));
  });
  await new Promise(ok => srv.listen(0, "127.0.0.1", ok));
  const nav = await lanza();
  try {
    const base = "http://127.0.0.1:" + srv.address().port + "/oficina/";
    // api simulada: dos familias y dos hazas (la H-02 es de la familia 2), geometría cualquiera en UTM 30N
    const cuad = (x, y) => ({ type: "MultiPolygon", coordinates: [[[[x, y], [x + 40, y], [x + 40, y + 40], [x, y + 40], [x, y]]]] });
    const fam = (id, correo, hz) => ({ id, correo, rol: "hogar", activo: true, estado: "activa", alias: null, nombre_interno: null, hazas: hz, sesiones: 0, avisos_correo: false, creado_en: "2026-01-01T00:00:00Z" });
    const familias = [fam(1, "una@ejemplo.invalid", ["H-01"]), fam(2, "dos@ejemplo.invalid", ["H-02"])];
    const haza = (id, codigo, h, x) => ({ id, codigo, nombre: "Haza " + codigo, finca: "hituelo", geometria: cuad(500000 + x, 4200000), version: 1, actualizada_en: "2026-01-01T00:00:00Z",
      superficie_ha: 0.16, olivos: 0, olivos_declarados: null, solapes: [], parcelas: [], hogar_id: h ? h.id : null, hogar_correo: h ? h.correo : null });
    const hazas = [haza(1, "H-01", familias[0], 0), haza(2, "H-02", familias[1], 100)];
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES" });
    const json = (r, cuerpo, estado = 200) => r.fulfill({ status: estado, contentType: "application/json", body: JSON.stringify(cuerpo) });
    await ctx.route("**/api/**", r => {
      const u = new URL(r.request().url()), p = u.pathname;
      if (p === "/api/oficina/sesion") return json(r, { rol: "admin", aparato: { nombre: "prueba", estado: "ok" }, caduca_en: "2030-01-01T00:00:00Z", inactividad_min: 30, confirmacion_vigente: true });
      if (p === "/api/admin/hogares") { const e = u.searchParams.get("limite") === "1"; return json(r, { hogares: e ? familias.slice(0, 1) : familias, total: familias.length }); }
      if (/^\/api\/admin\/hogares\/\d+\/sesiones$/.test(p)) return json(r, { sesiones: [], aparatos_oficina: [] });
      if (p === "/api/admin/hazas") return json(r, { hazas });
      if (/\/api\/admin\/hazas\/\d+\/versiones/.test(p)) return json(r, { versiones: [] });
      return json(r, {}, 404);   // límite, bandeja, etc.: nada que ver aquí
    });
    await ctx.route("**/teselas/**", r => json(r, {}, 404));
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    await pg.goto(base + "?prueba#familias");
    await pg.waitForSelector('#fTabla tr[data-fila="2"]');
    await pg.click('#fTabla [data-fam="2"]');
    const ver = pg.locator('a[data-enlace="haza"]');
    assert.strictEqual(await ver.count(), 1);
    assert.strictEqual(await ver.getAttribute("href"), "#hazas/H-02");
    assert.ok((await ver.boundingBox()).height >= 44, "zona táctil de al menos 44 px");
    await ver.click();
    await pg.waitForFunction(() => window.__hazas && window.__hazas().sel === "H-02", null, { timeout: 30_000 });
    assert.strictEqual(await pg.evaluate(() => location.hash), "#hazas/H-02");
    assert.strictEqual(await pg.inputValue("#hSel"), "2");
    // y de vuelta: «Ver la familia» deja la ficha de la familia 2 con su fila marcada
    const vuelta = pg.locator('a[data-enlace="familia"]');
    assert.strictEqual(await vuelta.getAttribute("href"), "#familias/2");
    await vuelta.click();
    await pg.waitForSelector('#fTabla tr[data-fila="2"][aria-current="true"]');
    assert.match(await pg.textContent("#fFicha h2"), /dos@ejemplo\.invalid/);
    // un enlace copiado, abierto en otra pestaña con la sesión: llega directo a la haza
    const otra = await ctx.newPage();
    await otra.goto(base + "?prueba#hazas/H-01");
    await otra.waitForFunction(() => window.__hazas && window.__hazas().sel === "H-01", null, { timeout: 30_000 });
    // un código que no existe: aviso, sin romper
    await otra.goto(base + "?prueba#hazas/H-99");
    await otra.waitForFunction(() => window.__hazas && window.__hazas().hazas === 2, null, { timeout: 30_000 });
    assert.strictEqual(await otra.evaluate(() => window.__hazas().sel), null);
    assert.deepStrictEqual(errores, []);
  } finally { await nav.close(); srv.close(); }
});
