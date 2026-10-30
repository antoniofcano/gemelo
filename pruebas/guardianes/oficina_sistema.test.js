"use strict";
// La oficina, OF5: la sección Sistema (apps/web/oficina/sistema.js, doc/sistema/OFICINA.md §10). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen, DOM con h() (texto), nada de secretos en la página ni en lo que pide; las rutas que usa están en el contrato;
//    lo delicado (sincronizar, aprobar un aparato, re-hornear) pasa por la confirmación reciente; «Re-hornear ahora» es solo de admin (OF9);
//  - las piezas puras (sistema_puro.js): hace cuánto, bytes, resumen de la sincronía («truncado» = no completo), «sobre qué» de la auditoría.
// Opcional (GEMELO_DOCKER=1): recorrido en Chrome contra la api REAL con PostGIS en un contenedor (Testcontainers, NO el entorno de la persona):
// salud, correo de prueba, OlivarTrack y sincronizar, Vigía, hornero, un aparato pendiente (aprobar y revocar) y la auditoría filtrada y paginada,
// a 1280 y 1024 px, con la CSP de Caddy impuesta.
const test = require("node:test"), assert = require("node:assert");
const { spawn, spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const html = lee("apps/web/oficina/index.html"), js = lee("apps/web/oficina/sistema.js"), puro = lee("apps/web/oficina/sistema_puro.js");

test("nada en línea ni de otro origen; el DOM se hace con h() (un nombre de aparato o una acción nunca se interpretan como HTML)", () => {
  for (const [n, c] of Object.entries({ "sistema.js": js, "sistema_puro.js": puro })) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
    assert.ok(!/localStorage|sessionStorage/.test(c), n + ": no guarda nada en el navegador");
  }
  const sec = /<section id="s-sistema"[\s\S]*?<\/section>/.exec(html)[0];
  assert.ok(!/\sstyle\s*=|\son[a-z]+\s*=|<script/i.test(sec), "la sección no lleva estilos ni manejadores en línea");
  for (const id of ["sSalud", "sCorreo", "sOt", "sVigia", "sHornero", "sAparatos", "sAud", "sAudF", "sAudMas", "bCorreo", "bSinc"]) assert.ok(sec.includes('id="' + id + '"'), id);
  assert.match(sec, /<label class="vh" for="sAudF">/); assert.match(sec, /<th scope="col">/);
});

test("usa solo rutas del contrato; lo delicado reintenta tras confirmar; «Sincronizar» es solo de admin; «Re-hornear ahora» es solo de admin y pasa por la confirmación (OF9)", () => {
  const openapi = lee("contratos/api.openapi.yaml");
  const usadas = new Set([...js.matchAll(/api\("([A-Z]+)", ["`](\/api\/[^"`?]*)/g)].map(m => m[1] + " " + m[2].replace(/\/"?$/, "")));
  for (const r of ["/api/admin/sistema", "/api/admin/auditoria", "/api/admin/correo/prueba", "/api/admin/sincronia", "/api/admin/hornero/rehornear", "/api/admin/aparatos", "/api/admin/aparatos/{id}/aprobar", "/api/admin/aparatos/{id}/revocar"]) {
    assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  }
  assert.ok(usadas.size >= 5, "la sección llama a la api: " + [...usadas].join(", "));
  assert.match(js, /conConfirmacion\(\(\) => api\("POST", "\/api\/admin\/sincronia"/);
  assert.match(js, /conConfirmacion\(\(\) => api\("POST", "\/api\/admin\/aparatos\/" \+ id \+ "\/aprobar"/);
  assert.match(js, /\$\("#bSinc"\)\.hidden = !esAdmin\(\)/);
  assert.match(js, /conConfirmacion\(\(\) => api\("POST", "\/api\/admin\/hornero\/rehornear"/);
  assert.match(js, /b\.hidden = !esAdmin\(\)/, "el botón de re-hornear es solo de admin");
  assert.ok(!/\b(token|secreto|clave|password)\b/i.test(js), "la pantalla no sabe de secretos");
});

test("la api de Sistema no devuelve secretos ni rutas: lista blanca en el código", () => {
  const ts = lee("apps/api/src/admin/sistema.ts") + lee("apps/api/src/admin/hornero.ts");
  assert.ok(!/config\.(ot|vigia|livekit|correo)\.(token|secreto|clave|usuario)\b/.test(ts), "Sistema no lee ni devuelve tokens ni claves de la configuración");
  assert.match(ts, /limpiaMensaje/, "los mensajes del hornero salen sin rutas");
});

test("piezas puras: hace cuánto, bytes, resumen de la sincronía y «sobre qué» de la auditoría", async () => {
  const P = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "sistema_puro.js")).href);
  const A = Date.parse("2026-10-30T12:00:00Z");
  assert.strictEqual(P.hace("2026-10-30T11:59:20Z", A), "hace 40 s");
  assert.strictEqual(P.hace("2026-10-30T10:00:00Z", A), "hace 2 h");
  assert.strictEqual(P.hace("2026-10-28T12:00:00Z", A), "hace 2 días");
  assert.strictEqual(P.hace("2026-10-30T13:00:00Z", A), null, "una fecha del futuro no se dice");
  assert.strictEqual(P.hace("no es fecha", A), null);
  assert.strictEqual(P.bytes(null), "—"); assert.strictEqual(P.bytes(512), "512 B");
  assert.match(P.bytes(4_400_000), /^4,2 MB$/);
  assert.strictEqual(P.resumenSincronia([{ estado: "ok" }, { estado: "ok" }, { estado: "ok" }]), "3 ok");
  assert.match(P.resumenSincronia([{ estado: "ok" }, { estado: "truncado" }, { estado: "error" }]), /^1 ok, 1 truncada, 1 con error \(no está completo: no se sacan totales de ahí\)$/);
  assert.strictEqual(P.sobreQue({ aparato: 3, ok: true, x: null }), "aparato: 3 · ok: true · x: —");
  assert.strictEqual(P.sobreQue(null), ""); assert.ok(P.sobreQue({ a: "x".repeat(300) }, 50).length <= 50);
  for (const e of ["ok", "aviso", "mal", "apagado"]) assert.ok(P.ESTADO_SALUD[e][1], "palabra para " + e + ": el color solo no cuenta");
});

// ——— recorrido en Chrome (opcional) ———
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "recorrido de Docker + Chrome opcional (GEMELO_DOCKER=1): la sección Sistema de la oficina contra la api real NO se ha comprobado" : null;

test("recorrido: salud, correo de prueba, OlivarTrack, Vigía, hornero, aparatos y auditoría (1280 y 1024 px, CSP impuesta)", { timeout: 900_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: la sección Sistema NO se ha comprobado");
  if (!fs.existsSync(path.join(RAIZ, "apps", "api", "node_modules", "fastify")) || !fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "vite"))) return t.skip("faltan las dependencias de apps/api o apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-sistema-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);

  const nav = await lanza();
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const srv = spawn(process.execPath, ["pruebas/e2e/oficina_servidor.ts", dist], { cwd: path.join(RAIZ, "apps", "api"), env, stdio: ["pipe", "pipe", "pipe"] });
  let salida = "", errs = "";
  srv.stdout.on("data", d => { salida += d; }); srv.stderr.on("data", d => { errs += d; });
  try {
    const info = await new Promise((ok, mal) => {
      const lim = setTimeout(() => mal(new Error("el servidor de la oficina no arrancó en 5 min: " + errs)), 300_000);
      const mira = setInterval(() => {
        const m = /LISTO (\{.*\})/.exec(salida);
        if (m) { clearInterval(mira); clearTimeout(lim); ok(JSON.parse(m[1])); }
        else if (srv.exitCode !== null) { clearInterval(mira); clearTimeout(lim); mal(new Error(/SIN_(OPENSSL|DOCKER)/.test(errs) ? "SALTO " + errs.trim() : "el servidor salió (" + srv.exitCode + "): " + errs)); }
      }, 500);
    });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const base = info.url, get = async r => (await fetch(base + r)).json();
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES", ignoreHTTPSErrors: true });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*(401|403|404)/.test(m.text())) errores.push(m.text()); });

    await pg.goto(base + "/__prueba/aparato");
    const { url } = await get("/__prueba/enlace?para=" + encodeURIComponent(info.admin));
    await pg.goto(url);
    await pg.click("button[type=submit], input[type=submit]");
    await pg.waitForURL(/\/oficina\//, { timeout: 15_000 });
    await pg.waitForFunction(() => document.querySelector("#s-rol").textContent !== "—");
    assert.strictEqual(await pg.locator("#nav .pronto").count(), (lee("apps/web/oficina/oficina.js").match(/", false\]/g) || []).length, "tantos «pronto» como secciones sin hacer (Sistema ya no lo es)");

    // 1. salud: api, base, LiveKit (apagado en la prueba), correo, hornero (con su latido), todos con palabra
    await pg.click("#nav button[data-sec=sistema]");
    await pg.waitForSelector("#sSalud li[data-servicio=hornero]");
    assert.deepStrictEqual(await pg.locator("#sSalud li").evaluateAll(l => l.map(x => x.dataset.servicio)), ["api", "base", "livekit", "correo", "hornero"]);
    assert.match(await pg.textContent("#sSalud li[data-servicio=base]"), /en marcha/);
    assert.match(await pg.textContent("#sSalud li[data-servicio=livekit]"), /apagado/);
    assert.match(await pg.textContent("#sSalud li[data-servicio=hornero]"), /en marcha/);
    assert.match(await pg.textContent("#sSaludHora"), /Comprobado/);

    // 2. hornero: época actual y siguiente, objetos y tamaño (del manifiesto de la prueba: 2 objetos, 4,2 MB); el botón «Re-hornear ahora» está oculto para quien no es admin
    const hor = await pg.textContent("#sHornero");
    assert.match(hor, /envero/); assert.match(hor, /madura/); assert.match(hor, /2 objetos/); assert.match(hor, /4,2 MB/);
    assert.ok(!/\/tmp|oficina-hornero|[A-Z]:\\/.test(hor), "ni una ruta del servidor");
    assert.strictEqual(await pg.locator("#sHornero button").count(), 0, "el botón de re-hornear está fuera de #sHornero (en su tarjeta, #bRehornear)");

    // 2b. re-hornear (OF9): solo admin, con confirmación; deja la petición y Sistema la ve pendiente (el hornero de la prueba es de mentira: no la atiende)
    assert.strictEqual(await pg.isVisible("#bRehornear"), true); assert.strictEqual(await pg.isDisabled("#bRehornear"), false);
    assert.match(await pg.textContent("#sPedido"), /Sin peticiones/);
    await pg.click("#bRehornear"); await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfTexto"), /como mucho 10 minutos/);
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#avisos .aviso:has-text('Petición dejada')", { timeout: 15_000 });
    await pg.waitForFunction(() => /pedido, esperando al hornero/.test(document.querySelector("#sPedido").textContent), null, { timeout: 15_000 });
    assert.strictEqual(await pg.isDisabled("#bRehornear"), true, "mientras espera no se pide otra");
    assert.ok(!/\/tmp|oficina-hornero|[A-Z]:\\/.test(await pg.textContent("#sPedido")), "ni una ruta del servidor");
    const sis = await (await pg.request.get(base + "/api/admin/sistema")).json();
    assert.strictEqual(sis.hornero.pedido.estado, "pendiente");
    await pg.waitForSelector("#sAudF option[value='hornero.rehornear']", { state: "attached", timeout: 15_000 }); await pg.selectOption("#sAudF", "hornero.rehornear"); await pg.waitForFunction(() => document.querySelectorAll("#sAud tr[data-audit]").length === 1); await pg.selectOption("#sAudF", "");

    // 3. Vigía con el fixture: modo y de cuándo es la lectura
    await pg.waitForFunction(() => /fixture/.test(document.querySelector("#sVigia").textContent) || /sin conector/.test(document.querySelector("#sVigia").textContent));
    assert.match(await pg.textContent("#sVigia"), /sin conector|aún sin lectura/, "la oficina no llama a Vigía por mirar: sin nadie que haya pedido el tiempo, aún sin lectura");

    // 4. correo de prueba a la propia cuenta
    await pg.click("#bCorreo");
    await pg.waitForSelector("#avisos .aviso:has-text('Correo de prueba mandado')");
    assert.strictEqual((await get("/__prueba/buzon?para=" + encodeURIComponent(info.admin))).asunto, "Prueba de correo de la oficina");
    await pg.waitForFunction(() => /última prueba/.test(document.querySelector("#sCorreo").textContent));

    // 5. OlivarTrack: vacío; «Sincronizar ahora» (admin) con confirmación; una fila por herramienta y de cuándo es el dato
    assert.match(await pg.textContent("#sOt"), /Todavía no se ha sincronizado nada/);
    assert.strictEqual(await pg.isVisible("#bSinc"), true);
    await pg.click("#bSinc");
    await pg.waitForSelector("#dlgConfirma[open]");
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#avisos .aviso:has-text('Sincronía hecha')");
    await pg.waitForFunction(() => document.querySelectorAll("#sOt tr[data-herramienta]").length === 3);
    assert.match(await pg.textContent("#sOt"), /pases_del_periodo/);

    // 6. un aparato pendiente: aprobar; otro nuevo: revocar (el propio aparato no se aprueba a sí mismo)
    for (const nombre of ["Tableta A", "Tableta B"]) {
      await fetch(base + "/__prueba/aparato-pendiente?nombre=" + encodeURIComponent(nombre));
    }
    await pg.click("#bSistemaRefresca");
    await pg.waitForSelector("#sAparatos li:has-text('Tableta A')");
    assert.match(await pg.textContent("#sAparatos li:has-text('(este)')"), /confiable/);
    await pg.click("#sAparatos li:has-text('Tableta A') button:has-text('Aprobar')");
    await pg.waitForSelector("#dlgConfirma[open]");
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#avisos .aviso:has-text('Aparato aprobado')");
    await pg.waitForFunction(() => /Tableta A[\s\S]*confiable/.test(document.querySelector("#sAparatos li[data-nombre='Tableta A']").textContent));
    await pg.click("#sAparatos li:has-text('Tableta B') button:has-text('Revocar')");
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#avisos .aviso:has-text('Aparato revocado')");
    await pg.waitForFunction(() => !document.querySelector("#sAparatos li[data-nombre='Tableta B'] [data-acc]"));

    // 7. auditoría: lo hecho arriba está; filtrar por acción; paginar
    await pg.waitForSelector("#sAud tr[data-audit]");
    for (const a of ["oficina.correo_prueba", "admin.sincronia", "oficina.aparato_aprobado", "oficina.aparato_revocado"]) assert.ok((await pg.textContent("#sAud")).includes(a), a + " en la auditoría");
    assert.ok(!/@example\.com/.test(await pg.textContent("#s-sistema")), "ni un correo en la sección");
    await pg.selectOption("#sAudF", "oficina.aparato_aprobado");
    await pg.waitForFunction(() => { const f = [...document.querySelectorAll("#sAud tr[data-audit]")]; return f.length >= 1 && f.every(x => x.textContent.includes("oficina.aparato_aprobado")); });
    await pg.selectOption("#sAudF", "");
    await pg.waitForFunction(() => document.querySelectorAll("#sAud tr[data-audit]").length > 3);

    // 8. usable a 1280 y a 1024
    const salidaCap = propia("oficina-capturas");
    for (const ancho of [1280, 1024]) {
      await pg.setViewportSize({ width: ancho, height: 800 });
      const sobra = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(sobra <= 0, "a " + ancho + " px hay desborde horizontal de " + sobra + " px");
      const sobreMain = await pg.evaluate(() => { const m = document.querySelector("main"); return m.scrollWidth - m.clientWidth; });
      assert.ok(sobreMain <= 0, "a " + ancho + " px main desborda " + sobreMain + " px");
      await pg.screenshot({ path: path.join(salidaCap, "sistema-" + ancho + ".png") });
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
