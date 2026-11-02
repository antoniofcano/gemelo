"use strict";
// La oficina, OF14 escalón 1: la sección «Mundo» (apps/web/oficina/mundo.js y mundo_puro.js, doc/sistema/OFICINA.md §6). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen, DOM con h() (texto), sección con sus ids, etiquetas, <dialog> nativo, aria-live; solo rutas del contrato;
//  - las piezas puras: cuerpos y errores de anunciar, expulsar y balizas, con los mismos límites que la api (oficina_mundo.ts).
// Opcional (GEMELO_BANCO=1, por el banco; NO se ha ejecutado): recorrido en Chrome con la api simulada por page.route (sin Docker): anunciar,
// expulsar con su diálogo y balizas (listar, poner, mover, quitar), a 1280 y 600 px.
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, path } = require("./_util");

const html = lee("apps/web/oficina/index.html"), js = lee("apps/web/oficina/mundo.js"), puro = lee("apps/web/oficina/mundo_puro.js");
const oficina = lee("apps/web/oficina/oficina.js");
const importa = () => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "mundo_puro.js")).href);

test("nada en línea ni de otro origen; el DOM se hace con h() (un título de baliza o un alias nunca se interpretan como HTML)", () => {
  for (const [n, c] of Object.entries({ "mundo.js": js, "mundo_puro.js": puro })) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
    assert.ok(!/localStorage|sessionStorage/.test(c), n + ": no guarda nada en el navegador");
  }
  const sec = /<section id="s-mundo"[\s\S]*?<\/section>/.exec(html)[0];
  assert.ok(!/\sstyle\s*=|\son[a-z]+\s*=|<script/i.test(sec), "la sección no lleva estilos ni manejadores en línea");
  for (const id of ["mAnuncioF", "mAnuncioT", "mAnuncioN", "mAnuncioS", "mAnuncioB", "mAnuncioM", "mExpulsaF", "mExpulsaQ", "mExpulsaS", "mExpulsaB", "mExpulsaM",
    "mBalizaFinca", "mBalizaLista", "mBalizaCuenta", "mBalizaF", "mBalizaT", "mBalizaPx", "mBalizaPy", "mBalizaH", "mBalizaB", "mBalizaM"]) assert.ok(sec.includes('id="' + id + '"'), id);
  // cada campo tiene su etiqueta (envuelto en <label>) y los avisos van en una región viva
  assert.strictEqual((sec.match(/<(input|select|textarea)\b/g) || []).length, (sec.match(/<label class="campo/g) || []).length, "todo campo va dentro de su <label>");
  for (const id of ["mAnuncioM", "mExpulsaM", "mBalizaM", "mBalizaCuenta"]) assert.match(sec, new RegExp('id="' + id + '"[^>]*aria-live="polite"'), id + " es una región viva");
  assert.match(html, /<dialog id="dlgBalizaMover" aria-labelledby="dlgBalizaMoverT">/, "mover una baliza usa un <dialog> nativo");
  assert.match(js, /\.showModal\(\)/); assert.match(js, /confirma\(\{[\s\S]*Expulsar 15 minutos/, "expulsar pide confirmación en un <dialog> nativo (confirma de comun.js)");
  assert.ok(!/Directos y Mundo/.test(html), "el marcador «Directos y Mundo llegan…» ya no está");
  assert.match(html, /id="bMundo"[^>]*>🌳 Entrar al mundo <span class="largo">como oficina/, "«Entrar al mundo como oficina» sigue arriba");
});

test("la sección está montada en oficina.js y las rutas que usa están en el contrato (sin rutas nuevas)", () => {
  assert.match(oficina, /\["mundo", "🌳", "Mundo", true\]/, "Mundo ya no es «pronto»");
  assert.match(oficina, /import \{ iniciaMundo \} from "\.\/mundo\.js"/); assert.match(oficina, /sec === "mundo"\) mundo\.abre\(\)/);
  assert.match(oficina, /"agenda", "mundo", "olivos"/, "la sección se muestra y se oculta con las demás");
  const openapi = lee("contratos/api.openapi.yaml");
  for (const r of ["/api/admin/presencia/anuncio", "/api/admin/presencia/expulsar", "/api/balizas-oficiales", "/api/admin/balizas", "/api/admin/balizas/{id}", "/api/admin/hogares"]) assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  for (const m of ['api("POST", "/api/admin/presencia/anuncio"', 'api("POST", "/api/admin/presencia/expulsar"', 'api("GET", "/api/balizas-oficiales?finca="',
    'api("POST", "/api/admin/balizas"', 'api("PUT", "/api/admin/balizas/"', 'api("DELETE", "/api/admin/balizas/"']) assert.ok(js.includes(m), m);
  assert.ok(!/\/api\/admin\/balizas\?/.test(js) && !/api\("GET", "\/api\/admin\/balizas/.test(js), "no existe GET /api/admin/balizas: la lista sale de /api/balizas-oficiales");
});

test("piezas puras: anunciar, expulsar y balizas con los límites de la api", async () => {
  const P = await importa(), api = lee("apps/api/src/presencia/oficina_mundo.ts");
  // los límites son los de la api
  assert.match(api, /ANUNCIO_MAX = 280/); assert.strictEqual(P.ANUNCIO_MAX, 280);
  assert.match(api, /BALIZA_TITULO_MAX = 60, BALIZA_TEXTO_MAX = 280/); assert.strictEqual(P.TITULO_MAX, 60); assert.strictEqual(P.TEXTO_MAX, 280);
  assert.match(api, /BALIZA_HORAS = \{ min: 1, max: 168, defecto: 8 \}/); assert.deepStrictEqual([P.HORAS.min, P.HORAS.max, P.HORAS.defecto], [1, 168, 8]);
  assert.match(api, /minimum: 100_000, maximum: 900_000/); assert.deepStrictEqual(P.UTM.x, [100_000, 900_000]);
  assert.match(api, /minimum: 3_900_000, maximum: 4_900_000/); assert.deepStrictEqual(P.UTM.y, [3_900_000, 4_900_000]);

  // anunciar
  assert.deepStrictEqual(P.cuerpoAnuncio({ texto: "  Hoy   se recoge \n en la 3 ", sala: "visita" }), { ok: true, cuerpo: { texto: "Hoy se recoge en la 3", sala: "visita" } });
  assert.strictEqual(P.cuerpoAnuncio({ texto: "hola" }).cuerpo.sala, "todas");
  assert.match(P.cuerpoAnuncio({ texto: " ​ " }).error, /Escribe el anuncio/);
  assert.ok(P.cuerpoAnuncio({ texto: "a".repeat(280) }).ok); assert.match(P.cuerpoAnuncio({ texto: "a".repeat(281) }).error, /como mucho 280/);
  assert.ok(P.cuerpoAnuncio({ texto: "🫒".repeat(280) }).ok, "se cuentan caracteres, no unidades UTF-16 (como la api)");
  assert.match(P.cuerpoAnuncio({ texto: "x", sala: "otra" }).error, /sala/);
  assert.strictEqual(P.textoCuenta("hola", 280), "4 / 280"); assert.match(P.textoCuenta("a".repeat(285), 280), /te pasas 5/);

  // expulsar
  assert.deepStrictEqual(P.cuerpoExpulsion({ hogar_id: "7", motivo: "  " }), { ok: true, cuerpo: { hogar_id: 7 } });
  assert.deepStrictEqual(P.cuerpoExpulsion({ hogar_id: 7, motivo: "  molesta  al guía " }).cuerpo, { hogar_id: 7, motivo: "molesta al guía" });
  for (const mal of ["", "0", "-3", "1.5", "abc", null]) assert.match(P.cuerpoExpulsion({ hogar_id: mal }).error, /familia/, "id no válido: " + mal);
  assert.match(P.cuerpoExpulsion({ hogar_id: 1, motivo: "m".repeat(201) }).error, /200/);
  assert.match(P.TEXTO_EXPULSION, /15 minutos/); assert.match(P.textoConfirmaExpulsion("Ana · a@example.com"), /«Ana · a@example.com».*15 minutos/);
  assert.strictEqual(P.etiquetaFamilia({ alias: "Ana", correo: "a@example.com" }), "Ana · a@example.com"); assert.strictEqual(P.etiquetaFamilia({ nombre_interno: "Casa", correo: "b@example.com" }), "Casa · b@example.com");

  // balizas
  assert.strictEqual(P.numero("4 123 456,5"), 4123456.5); assert.strictEqual(P.numero("510000.25"), 510000.25); assert.ok(Number.isNaN(P.numero("1e5"))); assert.ok(Number.isNaN(P.numero("")));
  const ok = { finca: "hituelo", titulo: " Aquí se recoge hoy ", texto: "", x: "431 200,5", y: "4300000", horas: "" };
  assert.deepStrictEqual(P.cuerpoBaliza(ok), { ok: true, cuerpo: { finca: "hituelo", x: 431200.5, y: 4300000, titulo: "Aquí se recoge hoy", horas: 8 } });
  assert.strictEqual(P.cuerpoBaliza({ ...ok, texto: "Traed cajas", horas: "24" }).cuerpo.texto, "Traed cajas");
  assert.strictEqual(P.cuerpoBaliza({ ...ok, horas: "24" }).cuerpo.horas, 24);
  assert.match(P.cuerpoBaliza({ ...ok, finca: "" }).error, /finca/); assert.match(P.cuerpoBaliza({ ...ok, finca: "Mala Finca" }).error, /finca/);
  assert.match(P.cuerpoBaliza({ ...ok, titulo: "  " }).error, /título/); assert.match(P.cuerpoBaliza({ ...ok, titulo: "t".repeat(61) }).error, /60/);
  assert.match(P.cuerpoBaliza({ ...ok, texto: "t".repeat(281) }).error, /280/);
  assert.match(P.cuerpoBaliza({ ...ok, x: "" }).error, /coordenadas/); assert.match(P.cuerpoBaliza({ ...ok, x: "50" }).error, /x está fuera/); assert.match(P.cuerpoBaliza({ ...ok, y: "1" }).error, /y está fuera/);
  for (const h of ["0", "169", "1.5", "x"]) assert.match(P.cuerpoBaliza({ ...ok, horas: h }).error, /caducidad/, "horas " + h);
  assert.deepStrictEqual(P.cuerpoMover("431000", "4300000"), { ok: true, cuerpo: { x: 431000, y: 4300000 } }); assert.ok(!P.cuerpoMover("", "").ok);
  const A = Date.parse("2026-11-02T12:00:00Z");
  assert.strictEqual(P.textoCaduca("2026-11-02T12:30:00Z", A), "quedan 30 min"); assert.strictEqual(P.textoCaduca("2026-11-02T17:00:00Z", A), "quedan 5 h");
  assert.strictEqual(P.textoCaduca("2026-11-05T12:00:00Z", A), "quedan 3 días"); assert.strictEqual(P.textoCaduca("2026-11-02T11:00:00Z", A), "caducada"); assert.strictEqual(P.textoCaduca("x", A), "sin fecha");
  assert.ok(P.CADUCIDADES.some(([h]) => h === P.HORAS.defecto), "la caducidad por defecto está entre las del selector");
});

// ——— recorrido en Chrome (opcional; escrito, NO ejecutado: va por el banco, un Chrome a la vez) ———
const SALTO = process.env.GEMELO_BANCO !== "1" ? "recorrido en Chrome por el banco (GEMELO_BANCO=1): la sección Mundo de la oficina en un navegador NO se ha comprobado" : null;

test("recorrido: anunciar, expulsar con su diálogo y balizas (listar, poner, mover, quitar), a 1280 y 600 px, con la api simulada", { timeout: 300_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: la sección Mundo NO se ha comprobado");
  const { sirve, lanza } = require("./_navegador");
  const dist = propia("oficina-mundo-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);
  const srv = await sirve(dist), nav = await lanza();
  try {
    const base = "http://127.0.0.1:" + srv.address().port + "/index.html";
    const pg = await nav.newPage({ viewport: { width: 1280, height: 800 }, locale: "es-ES" }), errores = [], llamadas = [];
    pg.on("pageerror", e => errores.push(String(e)));
    let balizas = [{ id: 1, finca: "hituelo", x: 431000, y: 4300000, titulo: "Aquí se recoge hoy <b>", texto: "Traed cajas", hasta: "2030-01-01T10:00:00Z" }];
    const json = (r, estado, cuerpo) => r.fulfill({ status: estado, contentType: "application/json", body: cuerpo === undefined ? "" : JSON.stringify(cuerpo) });
    await pg.route("**/api/**", async r => {
      const u = new URL(r.request().url()), m = r.request().method(), ruta = u.pathname, cuerpo = r.request().postData();
      llamadas.push(m + " " + ruta + (cuerpo ? " " + cuerpo : ""));
      if (ruta === "/api/oficina/sesion") return json(r, 200, { rol: "oficina", aparato: { nombre: "Prueba", estado: "aprobado" }, caduca_en: "2030-01-01T00:00:00Z", inactividad_min: 60, confirmacion_vigente: true });
      if (ruta === "/api/admin/hazas") return json(r, 200, { hazas: [{ finca: "hituelo" }] });
      if (ruta === "/api/admin/hogares") return json(r, 200, { total: 1, hogares: [{ id: 7, rol: "hogar", activo: true, correo: "ana@example.com", alias: "Ana", nombre_interno: null }] });
      if (ruta === "/api/admin/presencia/anuncio") return json(r, 200, { salas: ["hituelo-libre"] });
      if (ruta === "/api/admin/presencia/expulsar") return json(r, 200, { estaba_en_sala: true, conexiones: 1 });
      if (ruta === "/api/balizas-oficiales") return json(r, 200, { finca: "hituelo", srs: "EPSG:25830", balizas });
      if (ruta === "/api/admin/balizas" && m === "POST") { balizas = balizas.concat([{ id: 2, finca: "hituelo", x: 431100, y: 4300100, titulo: "Nueva", texto: null, hasta: "2030-01-01T10:00:00Z" }]); return json(r, 201, { id: 2 }); }
      if (/^\/api\/admin\/balizas\/\d+$/.test(ruta) && m === "PUT") return json(r, 200, { id: 1 });
      if (/^\/api\/admin\/balizas\/\d+$/.test(ruta) && m === "DELETE") { balizas = balizas.filter(x => x.id !== 1); return r.fulfill({ status: 204 }); }
      return json(r, 200, {});
    });
    await pg.goto(base + "#mundo");
    await pg.waitForSelector("#s-mundo:not([hidden])");
    await pg.waitForSelector("#mBalizaLista li");
    assert.strictEqual(await pg.locator("#mBalizaLista li b").first().textContent(), "Aquí se recoge hoy <b>", "el título llega como texto, no como HTML");
    assert.strictEqual(await pg.locator("#mBalizaLista li b b").count(), 0);

    // anunciar
    await pg.fill("#mAnuncioT", "Hoy se recoge en la 3");
    assert.match(await pg.textContent("#mAnuncioN"), /^22 \/ 280/);
    await pg.click("#mAnuncioB");
    await pg.waitForFunction(() => /Enviado/.test(document.querySelector("#mAnuncioM").textContent));
    assert.ok(llamadas.some(l => l.startsWith("POST /api/admin/presencia/anuncio") && /Hoy se recoge en la 3/.test(l) && /"sala":"todas"/.test(l)));

    // expulsar: elegir, confirmar en el <dialog>
    await pg.selectOption("#mExpulsaS", "7");
    await pg.click("#mExpulsaB");
    await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfTexto"), /15 minutos/);
    assert.ok(!llamadas.some(l => l.includes("/expulsar")), "no se expulsa antes de confirmar");
    await pg.click("#dlgConfSi");
    await pg.waitForFunction(() => /Expulsada/.test(document.querySelector("#mExpulsaM").textContent));
    assert.ok(llamadas.some(l => l.startsWith("POST /api/admin/presencia/expulsar") && l.includes('"hogar_id":7')));

    // balizas: error en claro sin título; poner; mover; quitar
    await pg.click("#mBalizaB");
    assert.match(await pg.textContent("#mBalizaM"), /título/);
    await pg.fill("#mBalizaT", "Nueva"); await pg.fill("#mBalizaPx", "431100"); await pg.fill("#mBalizaPy", "4300100");
    await pg.click("#mBalizaB");
    await pg.waitForFunction(() => document.querySelectorAll("#mBalizaLista li").length === 2);
    await pg.locator("#mBalizaLista li").first().getByRole("button", { name: "Mover" }).click();
    await pg.waitForSelector("#dlgBalizaMover[open]");
    await pg.fill("#mMoverX", "431050"); await pg.click("#fBalizaMover button[type=submit]");
    await pg.waitForFunction(() => !document.querySelector("#dlgBalizaMover").open);
    assert.ok(llamadas.some(l => l.startsWith("PUT /api/admin/balizas/") && l.includes('"x":431050')));
    await pg.locator("#mBalizaLista li").first().getByRole("button", { name: "Quitar" }).click();
    await pg.waitForSelector("#dlgConfirma[open]"); await pg.click("#dlgConfSi");
    await pg.waitForFunction(() => document.querySelectorAll("#mBalizaLista li").length === 1);

    // zonas táctiles y a 600 px sin desbordar
    for (const sel of ["#mAnuncioB", "#mExpulsaB", "#mBalizaB", "#mBalizaRef"]) assert.ok((await pg.locator(sel).boundingBox()).height >= 44, sel + " mide al menos 44 px");
    await pg.setViewportSize({ width: 600, height: 800 });
    assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "a 600 px no hay desbordamiento horizontal");
    assert.deepStrictEqual(errores, []);
    await pg.close();
  } finally { await nav.close(); srv.close(); }
});
