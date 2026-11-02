"use strict";
// La oficina, OF15b: la ficha del olivo (apps/web/oficina/olivo_ficha_puro.js, olivo_ficha.js, el panel de Hazas y el hash «#olivo/<finca>/<id>»; doc/sistema/OFICINA.md §4 y §9).
// Siempre, y sin red ni Chrome:
//  - el hash: «#olivo/hituelo/1234» y «#olivos/hituelo/1234» se leen y se construyen; lo inválido (mayúsculas, ceros a la izquierda, ids mayores que u32, rutas) no llega;
//  - las cuentas puras con un índice SINTÉTICO (sin datos de la explotación): la copa bajo un clic, el resumen del panel, las filas de la ficha (solo las que tienen dato;
//    lo medido separado de lo que puso la familia; la foto sin imagen), los enlaces (3D, haza, familia) solo los que existen;
//  - estática: nada en línea ni de otro origen, DOM con textContent/h(), <a> reales con hash de construyeHash, y NUNCA una <img> ni una ruta de medios en la ficha (EIPD, decisión 165).
// Opcional (GEMELO_FICHA_CHROME=1, por el banco de pruebas: un solo Chrome a la vez): la oficina construida (build:oficina) con la api SIMULADA (page.route): pulsar una copa en
// Hazas abre el panel con «Ver la ficha», la ficha enseña lo medido y lo de la familia, «Ver el árbol en 3D» abre «Olivo real» con ese id, y un olivo inexistente da su mensaje.
// NO prueba: la api real ni PostGIS (pruebas/integracion/olivo_ficha_oficina.test.ts), la tableta, un lector de pantalla, ni el mapa con ortofoto real (sin teselas).
const test = require("node:test"), assert = require("node:assert");
const http = require("http");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const fuentes = { "olivo_ficha_puro.js": lee("apps/web/oficina/olivo_ficha_puro.js"), "olivo_ficha.js": lee("apps/web/oficina/olivo_ficha.js"), "oficina.js": lee("apps/web/oficina/oficina.js"),
  "hazas.js": lee("apps/web/oficina/hazas.js"), "olivo_real.js": lee("apps/web/oficina/olivo_real.js") };
const html = lee("apps/web/oficina/index.html");
const importa = f => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", f)).href);

// un índice sintético: 3 olivos con id estable (centro y coordenadas inventados)
const INDICE = {
  centro_utm: [440000, 4190000],
  copas: [[10, 20, 5.2, [2.4, 2.5, 2.6, 2.4], 1], [-30, 12, 4.1, [1.9, 2, 2.1, 2], 1], [5, -40, 6.3, [3, 3.1, 3, 2.9], 1]],
  copas_id: [101, 102, 2147483700],
};
const FICHA = (extra = {}) => ({ finca: "hituelo", copas_id: 101, posicion: { e: 440010, n: 4190020 }, altura_m: 5.2, tipo: -1,
  haza: { id: 3, codigo: "H-01", titular: { hogar_id: 7 } }, personalizacion: null, ...extra });

test("el hash del olivo: ida y vuelta, y lo inválido se queda en la sección a secas", async () => {
  const P = await importa("enlaces_puro.js");
  assert.deepStrictEqual(P.parseaHash("#olivo/hituelo/1234"), { sec: "olivo", param: "hituelo/1234" });
  assert.deepStrictEqual(P.parseaHash("#olivos/cerro/0"), { sec: "olivos", param: "cerro/0" });
  assert.deepStrictEqual(P.parseaHash("#olivo/hituelo%2F1234"), { sec: "olivo", param: "hituelo/1234" }, "la barra codificada también");
  assert.deepStrictEqual(P.parseaHash("#olivo"), { sec: "olivo", param: null });
  for (const malo of ["#olivo/", "#olivo/hituelo", "#olivo/Hituelo/1", "#olivo/hituelo/01", "#olivo/hituelo/-1", "#olivo/hituelo/1.5", "#olivo/hituelo/abc", "#olivo/hituelo/4294967296",
    "#olivo/hituelo/1/2", "#olivo/../x/1", "#olivo/hi tuelo/1", "#olivo/<b>/1", "#olivo/" + "a".repeat(33) + "/1", "#olivo/hituelo/12345678901", "#olivos/hituelo/4294967296"])
    assert.strictEqual(P.parseaHash(malo).param, null, malo);
  assert.strictEqual(P.parseaHash("#olivo/hituelo/4294967295").param, "hituelo/4294967295", "el tope de la api (u32) todavía vale");
  assert.strictEqual(P.construyeHash("olivo", "hituelo/1234"), "#olivo/hituelo/1234", "la barra no se codifica");
  assert.strictEqual(P.construyeHash("olivos", "hituelo/1234"), "#olivos/hituelo/1234");
  assert.strictEqual(P.construyeHash("olivo", "hituelo"), "#olivo");
  assert.strictEqual(P.construyeHash("olivo", "Hituelo/1"), "#olivo", "un parámetro inválido se omite");
  assert.strictEqual(P.construyeHash("hazas", "H-01"), "#hazas/H-01", "OF15a sigue igual");
  assert.strictEqual(P.construyeHash("familias", 12), "#familias/12");
  assert.deepStrictEqual(P.parseaHash("#hazas/H-01"), { sec: "hazas", param: "H-01" });
  assert.deepStrictEqual(P.parseaHash("#familias/12"), { sec: "familias", param: "12" });
  for (const [s, p] of [["olivo", "hituelo/1234"], ["olivos", "cerro/0"], ["olivo", "finca_2/4294967295"]]) assert.deepStrictEqual(P.parseaHash(P.construyeHash(s, p)), { sec: s, param: p });
});

test("la copa bajo un clic: la más cercana que lo alcanza, con una tolerancia mínima; fuera de toda copa, nada", async () => {
  const P = await importa("olivo_ficha_puro.js");
  const [cx, cy] = INDICE.centro_utm;
  assert.deepStrictEqual(P.copaEn(INDICE, cx + 10.5, cy + 20.5, 1.5), { i: 0, id: 101, d: Math.hypot(0.5, 0.5) });
  assert.strictEqual(P.copaEn(INDICE, cx + 100, cy + 100), null);
  assert.strictEqual(P.copaEn(INDICE, cx + 10 + 1.4, cy + 20, 0).i, 0, "dentro del radio medio de la copa (2,475 m) acierta aunque la tolerancia sea 0");
  assert.strictEqual(P.copaEn(INDICE, cx + 10 + 3, cy + 20, 0), null, "fuera de su radio y sin tolerancia, nada");
  assert.strictEqual(P.copaEn(INDICE, cx + 10 + 3, cy + 20, 3.5).i, 0, "la tolerancia (el dedo, a la escala del mapa) la alcanza");
  assert.strictEqual(P.copaEn({ centro_utm: [0, 0], copas: [[0, 0, 4, 2.2, 1]] }, 1, 0).i, 0, "r8 que no es una lista: radio de 2 m por defecto");
  assert.strictEqual(P.copaEn(null, 0, 0), null);
  assert.strictEqual(P.copaEn({ copas: [] }, 0, 0), null);
  assert.strictEqual(P.copaEn({ centro_utm: [0, 0], copas: [[0, 0, 4, [2], 1], [1, 0, 4, [2], 1]], copas_id: [5, 6] }, 0.9, 0).id, 6, "la más cercana");
  assert.strictEqual(P.copaEn({ centro_utm: [0, 0], copas: [[0, 0, 4, [2], 1]] }, 0, 0).id, -1, "sin copas_id en el índice: -1");
});

test("el resumen del panel de Hazas: solo lo que ya traen las copas; sin copas_id no hay enlace", async () => {
  const P = await importa("olivo_ficha_puro.js");
  const r = P.resumenDeCopa(INDICE, "hituelo", 0);
  assert.deepStrictEqual(r, { finca: "hituelo", i: 0, numero: 1, id: 101, e: 440010, n: 4190020, altura_m: 5.2, hash: "#olivo/hituelo/101" });
  assert.deepStrictEqual(P.filasResumen(r), [["Olivo", "Olivo 1 de la ficha"], ["Id real", "olivo:hituelo:101"], ["Altura", "5,2 m"], ["Posición UTM 30N", "E 440010,0 · N 4190020,0"]]);
  const sinId = P.resumenDeCopa({ centro_utm: [0, 0], copas: [[1, 2, 3.5, [2], 1]] }, "x", 0);
  assert.strictEqual(sinId.hash, null);
  assert.ok(!P.filasResumen(sinId).some(f => f[0] === "Id real"), "sin id, no hay fila de id");
});

test("la ficha: lo medido y lo de la familia en bloques aparte; solo hay fila si hay dato; «posición N» como en OF8c", async () => {
  const P = await importa("olivo_ficha_puro.js");
  // sin personalización: lo medido y la nota
  const a = P.filasFicha(FICHA(), INDICE);
  assert.deepStrictEqual(a.medido, [["Id real", "olivo:hituelo:101"], ["Número en la ficha del mundo", "Olivo 1 (posición 1)"], ["Altura", "5,2 m"],
    ["Posición UTM 30N", "E 440010,00 · N 4190020,00"], ["Haza", "H-01"]]);
  assert.strictEqual(a.familia, null);
  assert.match(a.nota, /todavía no le ha puesto nada/);
  // el tercer olivo tiene un id provisional enorme: la posición es la del índice + 1
  assert.ok(P.filasFicha(FICHA({ copas_id: 2147483700 }), INDICE).medido.some(f => f[1] === "Olivo 3 (posición 3)"));
  // sin índice o con un id que el índice no tiene: sin esa fila (no se inventa)
  assert.ok(!P.filasFicha(FICHA(), null).medido.some(f => f[0].startsWith("Número")));
  assert.ok(!P.filasFicha(FICHA({ copas_id: 999 }), INDICE).medido.some(f => f[0].startsWith("Número")));
  // sin altura y sin haza: sin esas filas; sin titular, la nota lo dice
  const b = P.filasFicha(FICHA({ altura_m: null, haza: null }), INDICE);
  assert.ok(!b.medido.some(f => f[0] === "Altura" || f[0] === "Haza"));
  assert.match(b.nota, /Sin familia/);
  assert.ok(P.filasFicha(FICHA({ haza: { id: 3, codigo: "H-01", titular: null } }), INDICE).medido.some(f => f[1] === "H-01 (sin familia asignada)"));
  // con todo
  const todo = P.filasFicha(FICHA({ personalizacion: { personalizacion_id: 5, estado: "visible", nombre: "La Abuela", decoracion: { id: "farolillo", nombre: "Farolillo", epoca: "otono" }, objeto: { tipo: "foto", medio_id: 9 } } }), INDICE);
  assert.deepStrictEqual(todo.familia, [["Nombre", "«La Abuela»"], ["Decoración", "Farolillo · de otoño"], ["Foto", "Hay una foto colgada (id 9)"], ["Estado", "visible para las familias"]]);
  // solo una cosa: solo esa fila (y el estado)
  assert.deepStrictEqual(P.filasFicha(FICHA({ personalizacion: { personalizacion_id: 5, estado: "visible", nombre: null, decoracion: null, objeto: { tipo: "pintura", medio_id: 2 } } }), INDICE).familia,
    [["Pintura", "Hay una pintura colgada (id 2)"], ["Estado", "visible para las familias"]]);
  assert.deepStrictEqual(P.filasFicha(FICHA({ personalizacion: { personalizacion_id: 5, estado: "visible", nombre: null, decoracion: { id: "lazo", nombre: "Lazo", epoca: "invierno" }, objeto: null } }), INDICE).familia,
    [["Decoración", "Lazo · de invierno"], ["Estado", "visible para las familias"]]);
  // retirado por la oficina, y una pieza que ya no está en el catálogo
  const r = P.filasFicha(FICHA({ personalizacion: { personalizacion_id: 5, estado: "retirado", nombre: "X", decoracion: { id: "vieja", nombre: null, epoca: null }, objeto: null } }), INDICE).familia;
  assert.deepStrictEqual(r, [["Nombre", "«X»"], ["Decoración", "una pieza que ya no está en el catálogo (vieja)"], ["Estado", "retirado por la oficina"]]);
  // la foto: nunca una dirección de imagen en lo que sale
  assert.ok(!/\/api\/medios|\.webp|https?:/.test(JSON.stringify(todo)));
});

test("los enlaces de la ficha: el 3D siempre; la haza y la familia solo si existen; todos con su hash validado", async () => {
  const P = await importa("olivo_ficha_puro.js");
  assert.deepStrictEqual(P.enlacesFicha(FICHA()), [{ clave: "3d", texto: "Ver el árbol en 3D", hash: "#olivos/hituelo/101" },
    { clave: "haza", texto: "Ver la haza H-01", hash: "#hazas/H-01" }, { clave: "familia", texto: "Ver la familia", hash: "#familias/7" }]);
  assert.deepStrictEqual(P.enlacesFicha(FICHA({ haza: { id: 3, codigo: "H-01", titular: null } })).map(e => e.clave), ["3d", "haza"]);
  assert.deepStrictEqual(P.enlacesFicha(FICHA({ haza: null })).map(e => e.clave), ["3d"]);
});

test("estática: DOM con h()/textContent, nada en línea ni de otro origen, <a> reales con hash de construyeHash, y ninguna imagen ni ruta de medios en la ficha", () => {
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(c), n + ": DOM con h()/textContent");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
  }
  for (const n of ["olivo_ficha_puro.js", "olivo_ficha.js"]) {
    assert.ok(!/"img"|<img|\/api\/medios|\.url\b/.test(fuentes[n]), n + ": la ficha no sirve ni pide imágenes (EIPD pendiente, decisión 165)");
  }
  assert.match(fuentes["olivo_ficha.js"], /h\("a", \{ class: "boton", href: e\.hash, "data-enlace": e\.clave \}, e\.texto\)/);
  assert.match(fuentes["olivo_ficha.js"], /"\/api\/admin\/olivos\/" \+ encodeURIComponent\(finca\) \+ "\/" \+ encodeURIComponent\(id\)/);
  assert.match(fuentes["hazas.js"], /h\("a", \{ class: "boton", href: r\.hash, "data-enlace": "olivo" \}, "Ver la ficha"\)/);
  assert.match(fuentes["oficina.js"], /sec === "olivo" && param/, "la ficha es una vista dentro de Hazas, con parámetro válido");
  assert.match(fuentes["oficina.js"], /olivos\.real\.busca\(finca, id\)/);
  assert.match(fuentes["olivo_real.js"], /busca\(finca, id\)/);
  assert.match(html, /<section id="s-olivo" hidden>/);
  assert.match(html, /<section class="tarjeta" id="hOlivo" aria-labelledby="hOlivoT" aria-live="polite" hidden>/);
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=/i.test(html));
  assert.match(lee("apps/web/oficina/oficina.css"), /\.boton \{ min-height: var\(--toque\)/, "la zona táctil de los enlaces (.boton) es la de los botones");
});

// ——— recorrido en Chrome con la api simulada (opcional, por el banco) ———
const SALTO = process.env.GEMELO_FICHA_CHROME !== "1" ? "recorrido en Chrome opcional (GEMELO_FICHA_CHROME=1, por el banco): la ficha del olivo NO se ha comprobado en navegador" : null;

test("recorrido: pulsar una copa en Hazas abre el panel; «Ver la ficha» enseña lo medido y lo de la familia; «Ver el árbol en 3D» abre Olivo real; un olivo que no existe da su mensaje", { timeout: 600_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: la ficha NO se ha comprobado en navegador");
  if (!fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "ol"))) return t.skip("faltan las dependencias de apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-ficha-dist");
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
    const [cx, cy] = INDICE.centro_utm;
    const cuad = { type: "MultiPolygon", coordinates: [[[[cx - 50, cy - 50], [cx + 50, cy - 50], [cx + 50, cy + 50], [cx - 50, cy + 50], [cx - 50, cy - 50]]]] };
    const haza = { id: 3, codigo: "H-01", nombre: "Haza H-01", finca: "hituelo", geometria: cuad, version: 1, actualizada_en: "2026-01-01T00:00:00Z", superficie_ha: 1, olivos: 3,
      olivos_declarados: null, solapes: [], parcelas: [], hogar_id: 7, hogar_correo: "uno@ejemplo.invalid" };
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES" });
    const json = (r, cuerpo, estado = 200) => r.fulfill({ status: estado, contentType: "application/json", body: JSON.stringify(cuerpo) });
    const pedidas = [];
    await ctx.route("**/api/**", r => {
      const u = new URL(r.request().url()), p = u.pathname;
      pedidas.push(p);
      if (p === "/api/oficina/sesion") return json(r, { rol: "admin", aparato: { nombre: "prueba", estado: "ok" }, caduca_en: "2030-01-01T00:00:00Z", inactividad_min: 30, confirmacion_vigente: true });
      if (p === "/api/admin/hogares") return json(r, { hogares: [{ id: 7, correo: "uno@ejemplo.invalid", rol: "hogar", activo: true, estado: "activa", alias: null, nombre_interno: null, hazas: ["H-01"], sesiones: 0, avisos_correo: false, creado_en: "2026-01-01T00:00:00Z" }], total: 1 });
      if (p === "/api/admin/hazas") return json(r, { hazas: [haza] });
      if (p === "/api/admin/olivos/hituelo/101") return json(r, FICHA({ personalizacion: { personalizacion_id: 5, estado: "retirado", nombre: "La Abuela", decoracion: { id: "farolillo", nombre: "Farolillo", epoca: "otono" }, objeto: { tipo: "foto", medio_id: 9 } } }));
      if (p.startsWith("/api/admin/olivos/")) return json(r, { error: "olivo_no_existe", mensaje: "No hay ningún olivo con ese número en esa finca." }, 404);
      return json(r, {}, 404);
    });
    await ctx.route("**/teselas/hituelo/indice.json", r => json(r, { ...INDICE, ext: [-60, -60, 60, 60] }));
    await ctx.route("**/teselas/**", r => json(r, {}, 404));
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    await pg.goto(base + "?prueba#hazas");
    await pg.waitForFunction(() => window.__hazas && window.__hazas().copas === 3, null, { timeout: 30_000 });
    // pulsar la copa 1 (E 440010, N 4190020) con el pixel que dice el propio mapa
    const px = await pg.evaluate(([x, y]) => window.__hazas().pixelDe(x, y), [cx + 10, cy + 20]);
    const caja = await pg.locator("#mapa").boundingBox();
    await pg.mouse.click(caja.x + px[0], caja.y + px[1]);
    await pg.waitForSelector("#hOlivo:not([hidden])");
    assert.match(await pg.textContent("#hOlivo h3"), /Olivo 1 de la ficha/);
    assert.match(await pg.textContent("#hOlivo"), /olivo:hituelo:101/);
    const ver = pg.locator('#hOlivo a[data-enlace="olivo"]');
    assert.strictEqual(await ver.getAttribute("href"), "#olivo/hituelo/101");
    assert.ok((await ver.boundingBox()).height >= 44, "zona táctil de al menos 44 px");
    assert.ok(!pedidas.includes("/api/admin/olivos/hituelo/101"), "el panel breve no pide la ficha a la api: solo lo que cargan las copas");
    await ver.click();
    await pg.waitForSelector("#oFicha dl.datos");
    const texto = await pg.textContent("#oFicha");
    assert.match(texto, /Lo medido/); assert.match(texto, /Lo que le ha puesto la familia/);
    assert.match(texto, /«La Abuela»/); assert.match(texto, /Farolillo · de otoño/); assert.match(texto, /Hay una foto colgada \(id 9\)/); assert.match(texto, /retirado por la oficina/);
    assert.match(texto, /Olivo 1 \(posición 1\)/);
    assert.strictEqual(await pg.locator("#oFicha img").count(), 0, "la ficha no enseña la foto");
    assert.strictEqual(await pg.getAttribute('#nav button[data-sec="hazas"]', "aria-current"), "page");
    assert.strictEqual(await pg.locator('#oFicha a[data-enlace="haza"]').getAttribute("href"), "#hazas/H-01");
    assert.strictEqual(await pg.locator('#oFicha a[data-enlace="familia"]').getAttribute("href"), "#familias/7");
    // «Ver el árbol en 3D»: Olivo real con el id puesto
    await pg.locator('#oFicha a[data-enlace="3d"]').click();
    await pg.waitForFunction(() => location.hash === "#olivos/hituelo/101");
    assert.strictEqual(await pg.inputValue("#rId"), "101");
    assert.strictEqual(await pg.getAttribute("#t-real", "aria-selected"), "true");
    // un enlace copiado, abierto directo; y un olivo que no existe
    await pg.goto(base + "?prueba#olivo/hituelo/555");
    await pg.waitForSelector("#oFicha [role=alert]");
    assert.match(await pg.textContent("#oFicha [role=alert]"), /No hay ningún olivo con el número 555/);
    assert.deepStrictEqual(errores, []);
  } finally { await nav.close(); srv.close(); }
});
