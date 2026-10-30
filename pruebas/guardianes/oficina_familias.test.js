"use strict";
// La oficina, OF2 (apps/web/oficina/, doc/sistema/OFICINA.md §3 Familias). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen (CSP estricta), el DOM se construye con textContent (nunca HTML a mano), las secciones de la maqueta
//    en la barra lateral (solo Inicio y Familias hechas), tema claro/oscuro, foco visible y objetivos de 44 px;
//  - contrato: las rutas de Familias que usa la página existen en contratos/api.openapi.yaml; el nombre interno (decisión 109) no aparece
//    en ninguna ruta de los hogares ni en las fichas públicas; la migración 0008 lo crea.
// Opcional (GEMELO_DOCKER=1): recorrido en Chrome contra la api REAL con PostGIS en un contenedor (Testcontainers, NO el entorno de la persona):
// buscar, alta, cerrar una sesión, asignar haza (quitándola a otra familia), baja y borrar, a 1280 y 1024 px, con la CSP de Caddy impuesta.
const test = require("node:test"), assert = require("node:assert");
const { spawn, spawnSync } = require("child_process");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const html = lee("apps/web/oficina/index.html"), css = lee("apps/web/oficina/oficina.css");
const fuentes = { "oficina.js": lee("apps/web/oficina/oficina.js"), "familias.js": lee("apps/web/oficina/familias.js"), "comun.js": lee("apps/web/oficina/comun.js") };

test("nada en línea ni de otro origen; el DOM se hace con textContent (un correo o un nombre nunca se interpretan como HTML)", () => {
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=|<script(?![^>]*\ssrc=)/i.test(html), "index.html: ni <style>, ni style=, ni onclick=, ni <script> en línea");
  assert.match(html, /<script type="module" src="\.\/oficina\.js">/);
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
  }
  assert.ok(!/@import|url\(\s*["']?https?:/.test(css), "oficina.css: sin recursos de fuera");
  assert.ok(!/localStorage\.setItem\([^)]*(correo|sesion|token)/i.test(fuentes["oficina.js"]), "el navegador solo guarda el tema");
});

test("la barra lateral tiene las secciones de la maqueta; solo Inicio y Familias están hechas", () => {
  const js = fuentes["oficina.js"];
  const ids = [...js.matchAll(/\["([a-z]+)", "[^"]+", "([^"]+)", (true|false)\]/g)].map(m => [m[1], m[3]]);
  assert.deepStrictEqual(ids.map(x => x[0]), ["inicio", "familias", "hazas", "bandeja", "agenda", "directos", "mundo", "olivos", "sistema"]);
  assert.deepStrictEqual(ids.filter(x => x[1] === "true").map(x => x[0]), ["inicio", "familias"]);
  assert.match(html, /<a class="boton prim" href="\/finca\/"/, "«Entrar al mundo como oficina» siempre a mano");
  assert.match(js, /aria-current/); assert.match(js, /data-theme/); assert.match(js, /oficina-tema/);
  assert.match(html, /<nav class="lateral" aria-label=/);
});

test("accesibilidad: foco visible, zonas de 44 px, avisos en región viva, diálogos nativos y movimiento reducido", () => {
  assert.match(css, /:focus-visible \{ outline: 3px solid var\(--foco\)/);
  assert.match(css, /--toque: 44px/); assert.match(css, /\.boton \{ min-height: var\(--toque\)/);
  assert.match(css, /prefers-reduced-motion: reduce/); assert.match(css, /prefers-color-scheme: light/);
  assert.match(html, /id="avisos" aria-live="polite"/); assert.match(html, /id="anuncio" role="status" aria-live="polite"/);
  assert.equal((html.match(/<dialog /g) || []).length, 3, "alta, confirmar y reconfirmar");
  for (const d of ["dlgAlta", "dlgConfirma", "dlgReconfirma"]) assert.match(html, new RegExp('<dialog id="' + d + '" aria-labelledby='));
  assert.match(html, /<label class="vh" for="fBusca">/); assert.match(html, /<th scope="col">/);
});

test("Familias usa solo rutas del contrato, y lo delicado pasa por la confirmación reciente", () => {
  const openapi = lee("contratos/api.openapi.yaml"), js = fuentes["familias.js"];
  const usadas = new Set([...js.matchAll(/api\("([A-Z]+)", "(\/api\/[^"?]*)/g)].map(m => m[1] + " " + m[2].replace(/\/$/, "")));
  assert.ok(usadas.size >= 6,"la página llama a la api: " + [...usadas].join(", "));
  for (const r of ["/api/admin/hogares", "/api/admin/hogares/{id}", "/api/admin/hogares/{id}/enlace", "/api/admin/hogares/{id}/sesiones", "/api/admin/sesiones/{id}",
    "/api/admin/hogares/{id}/haza", "/api/admin/hogares/{id}/baja", "/api/admin/hogares/{id}/reactivar", "/api/admin/hogares/{id}/exportar", "/api/admin/hazas"]) {
    assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  }
  // lo delicado (borrar, roles, alta de cuentas de oficina) reintenta tras confirmar; borrar escribe el correo
  assert.match(js, /conConfirmacion\(\(\) => api\("DELETE"[\s\S]{0,80}\{ correo: f\.correo \}/);
  assert.match(js, /conConfirmacion\(\(\) => api\("PATCH"[\s\S]{0,80}\{ rol:/);
  assert.match(js, /escribe: f\.correo/);
  assert.match(fuentes["comun.js"], /confirmacion_requerida/);
});

test("el nombre interno (decisión 109) solo sale por las rutas de la oficina", () => {
  const api = path.join(RAIZ, "apps", "api", "src");
  const dentro = [];
  (function recorre(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) recorre(f); else if (/\.ts$/.test(e.name) && /nombre_interno/.test(fs.readFileSync(f, "utf8"))) dentro.push(path.relative(api, f).replace(/\\/g, "/"));
    }
  })(api);
  assert.deepStrictEqual(dentro.sort(), ["admin/familias.ts"], "el campo solo lo nombra la ruta de la oficina");
  for (const esquema of ["contratos/haza.schema.json", "contratos/olivos-haza.schema.json"]) assert.ok(!/nombre_interno/.test(lee(esquema)), esquema);
  const mig = lee("apps/api/migraciones/0008_familias.sql");
  assert.match(mig, /ADD COLUMN nombre_interno text CHECK/); assert.match(mig, /ADD COLUMN baja_en\s+timestamptz/);
});

// ——— recorrido en Chrome (opcional) ———
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "recorrido de Docker + Chrome opcional (GEMELO_DOCKER=1): la sección Familias de la oficina contra la api real NO se ha comprobado" : null;

test("recorrido: buscar, alta, cerrar una sesión, asignar haza, baja y borrar (1280 y 1024 px, CSP impuesta)", { timeout: 900_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: el recorrido de la oficina NO se ha comprobado");
  if (!fs.existsSync(path.join(RAIZ, "apps", "api", "node_modules", "fastify")) || !fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "vite"))) return t.skip("faltan las dependencias de apps/api o apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);
  assert.ok(fs.existsSync(path.join(dist, "index.html")));
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  assert.ok(!/<style|\sstyle=|\son[a-z]+=/.test(html), "el build no mete nada en línea");

  const nav = await lanza();   // pide el turno del banco (o usa el Chrome de la puerta); el servidor de Docker va dentro del mismo turno
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
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";   // el certificado del servidor de la prueba es de usar y tirar
    const base = info.url, get = async r => (await fetch(base + r)).json();
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES", ignoreHTTPSErrors: true });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*(401|403|404)/.test(m.text())) errores.push(m.text()); });
    const fila = correo => pg.locator("#fTabla tr", { hasText: correo });

    // entrar con el enlace desde un aparato ya aprobado (su cookie, que deja el servidor de la prueba): cae en /oficina/
    await pg.goto(base + "/__prueba/aparato");
    const { url } = await get("/__prueba/enlace?para=" + encodeURIComponent(info.admin));
    await pg.goto(url);
    await pg.click("button[type=submit], input[type=submit]");
    try { await pg.waitForURL(/\/oficina\//, { timeout: 15_000 }); } catch (e) {
      throw new Error("no se llegó a /oficina/: estoy en " + pg.url() + "; cookies: " + (await ctx.cookies()).map(c => c.name + (c.secure ? "(S)" : "")).join(",") + "; texto: " + (await pg.textContent("body")).slice(0, 300));
    }
    await pg.waitForFunction(() => document.querySelector("#s-rol").textContent !== "—");
    assert.strictEqual(await pg.textContent("#s-rol"), "admin");
    assert.strictEqual(await pg.locator("#nav button").count(), 9, "las nueve secciones de la maqueta");
    assert.strictEqual(await pg.locator("#nav .pronto").count(), 7, "siete «pronto»");
    await pg.click("#nav button[data-sec=hazas]");
    assert.match(await pg.textContent("#s-proximamente"), /próximamente/i);

    // tema claro/oscuro
    await pg.click("#bTema"); const tema = await pg.getAttribute("html", "data-theme"); assert.ok(tema === "light" || tema === "dark");
    await pg.click("#bTema"); assert.notStrictEqual(await pg.getAttribute("html", "data-theme"), tema);

    // 1. buscar y filtrar
    await pg.click("#nav button[data-sec=familias]");
    await pg.waitForSelector("#fTabla tr[data-fila]");
    assert.strictEqual(await pg.locator("#fTabla tr[data-fila]").count(), 4, "la oficina y las tres familias");
    await pg.fill("#fBusca", "olid");
    await pg.waitForFunction(() => document.querySelectorAll("#fTabla tr[data-fila]").length === 1);
    assert.match(await pg.textContent("#fTabla"), /olid@example\.com/);
    await pg.fill("#fBusca", "H-01");   // por haza
    await pg.waitForFunction(() => /ruiz@/.test(document.querySelector("#fTabla").textContent) && document.querySelectorAll("#fTabla tr[data-fila]").length === 1);
    await pg.fill("#fBusca", "");
    await pg.selectOption("#fFiltro", "pendiente");
    await pg.waitForFunction(() => document.querySelectorAll("#fTabla tr[data-fila]").length === 1 && /pozo@/.test(document.querySelector("#fTabla").textContent));
    await pg.selectOption("#fFiltro", "");
    await pg.waitForFunction(() => document.querySelectorAll("#fTabla tr[data-fila]").length === 4);

    // 2. alta con haza libre, nombre interno y enlace de bienvenida
    await pg.click("#bAlta");
    await pg.fill("#altaCorreo", "nueva@example.com"); await pg.fill("#altaNombre", "Nueva Casa");
    await pg.selectOption("#altaHaza", { label: "H-04 · La Fuente" });
    await pg.click("#altaOk");
    await pg.waitForSelector("#fTabla tr:has-text('nueva@example.com')");
    assert.match(await pg.textContent("#fFicha h2"), /nueva@example\.com/);
    assert.match(await pg.textContent("#fTabla"), /Nueva Casa/, "el nombre interno se ve en la oficina");
    const bienvenida = await get("/__prueba/buzon?para=nueva@example.com");
    assert.match(bienvenida.asunto, /Bienvenida/);
    assert.deepStrictEqual((await get("/__prueba/hogar?correo=nueva@example.com")).hazas, ["H-04"]);
    await pg.click("#fTabla tr:has-text('pozo@') [data-fam]");
    await pg.click("text=Reenviar enlace");
    await pg.waitForSelector("#avisos .aviso:has-text('Enlace mandado a pozo@example.com')");

    // 3. cerrar una sesión de Ruiz
    await pg.click("#fTabla tr:has-text('ruiz@') [data-fam]");
    await pg.waitForSelector("#fFicha .aparato:has-text('Android · Chrome')");
    assert.strictEqual((await get("/__prueba/hogar?correo=ruiz@example.com")).sesiones, 1);
    await pg.click("#fFicha .aparato button:has-text('Cerrar')");
    await pg.waitForSelector("#fFicha :text('Ninguna sesión abierta.')");
    assert.strictEqual((await get("/__prueba/hogar?correo=ruiz@example.com")).sesiones, 0);

    // 4. asignar la haza de Ruiz (H-01) a Olid: se le quita a Ruiz, con aviso
    await pg.click("#fTabla tr:has-text('olid@') [data-fam]");
    await pg.waitForSelector("#fHaza");
    await pg.selectOption("#fHaza", { label: "H-01 · La Loma (de otra familia)" });
    await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfTexto"), /ruiz@example\.com/, "dice a quién se le quita");
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#avisos .aviso:has-text('se le quitó a ruiz@example.com')");
    assert.deepStrictEqual((await get("/__prueba/hogar?correo=olid@example.com")).hazas, ["H-01"]);
    assert.deepStrictEqual((await get("/__prueba/hogar?correo=ruiz@example.com")).hazas, []);

    // 5. baja de Ruiz: contenido oculto al momento (30 días); luego reactivar
    await pg.click("#fTabla tr:has-text('ruiz@') [data-fam]");
    await pg.click("text=Dar de baja…");
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#fTabla tr:has-text('ruiz@') .p-mal");
    const baja = await get("/__prueba/hogar?correo=ruiz@example.com");
    assert.strictEqual(baja.activo, false); assert.strictEqual(baja.con_baja, true);
    assert.match(await pg.textContent("#fFicha"), /se borra el/);
    await pg.click("#fFicha >> text=Reactivar");
    await pg.waitForSelector("#fTabla tr:has-text('ruiz@') .p-ok");
    assert.strictEqual((await get("/__prueba/hogar?correo=ruiz@example.com")).activo, true);

    // 6. exportar sus datos y borrar escribiendo el correo
    await pg.click("#fTabla tr:has-text('pozo@') [data-fam]");
    const [descarga] = await Promise.all([pg.waitForEvent("download"), pg.click("text=Exportar sus datos")]);
    assert.match(descarga.suggestedFilename(), /^datos-hogar-\d+\.json$/);
    const destino = path.join(propia("oficina-descarga"), "datos.json");
    await descarga.saveAs(destino);   // con el Chrome compartido (conexión remota) no hay path()
    const datos = JSON.parse(fs.readFileSync(destino, "utf8"));
    assert.strictEqual(datos.hogar.correo, "pozo@example.com"); assert.strictEqual(datos.hogar.nombre_interno, "Pozo");
    await pg.click("text=Borrar (RGPD)…");
    assert.strictEqual(await pg.isDisabled("#dlgConfSi"), true, "no se puede borrar sin escribir el correo");
    await pg.fill("#dlgConfEntrada", "otro@example.com");
    assert.strictEqual(await pg.isDisabled("#dlgConfSi"), true);
    await pg.fill("#dlgConfEntrada", "pozo@example.com");
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#avisos .aviso:has-text('Cuenta borrada')");
    await pg.waitForFunction(() => !/pozo@/.test(document.querySelector("#fTabla").textContent));
    assert.strictEqual((await fetch(base + "/__prueba/hogar?correo=pozo@example.com")).status, 404);

    // 7. usable a 1280 y a 1024: sin desbordes horizontales, con capturas
    const salidaCap = propia("oficina-capturas");
    for (const ancho of [1280, 1024]) {
      await pg.setViewportSize({ width: ancho, height: 800 });
      const sobra = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(sobra <= 0, "a " + ancho + " px hay desborde horizontal de " + sobra + " px");
      const sobreMain = await pg.evaluate(() => { const m = document.querySelector("main"); return m.scrollWidth - m.clientWidth; });
      assert.ok(sobreMain <= 0, "a " + ancho + " px main desborda " + sobreMain + " px");
      await pg.screenshot({ path: path.join(salidaCap, "familias-" + ancho + ".png") });
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
