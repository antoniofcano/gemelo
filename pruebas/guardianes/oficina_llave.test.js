"use strict";
// La oficina, OF13: la llave de acceso (WebAuthn) obligatoria (contratos/sesion.md § Llave de acceso). Siempre, y sin red ni Chrome:
//  - librerías mantenidas y fijadas (regla 12): @simplewebauthn/server en la api y @simplewebauthn/browser en la oficina, sin WebAuthn casero;
//  - la api: obligatoria por defecto y «no» rechazado en producción; RP ID y origen por GEMELO_*; la confirmación reciente es la llave;
//    el alta solo la primera vez (o rehabilitada, nunca la propia); migración 0013 correlativa y sin secretos;
//  - la página: nada en línea ni de otro origen, DOM con h(), rutas del contrato, la pantalla de la llave antes de nada;
//  - las piezas puras (llave_puro.js).
// Opcional (GEMELO_DOCKER=1): recorrido en Chrome con el AUTENTICADOR VIRTUAL de CDP (WebAuthn.addVirtualAuthenticator) contra la api REAL
// con PostGIS en un contenedor y la llave obligatoria: alta la primera vez, confirmación con la llave, volver a entrar con ella.
// Ninguna llave de verdad (Windows Hello, Touch ID, teléfono, llave física) se prueba aquí.
const test = require("node:test"), assert = require("node:assert");
const { spawn, spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const html = lee("apps/web/oficina/index.html"), js = lee("apps/web/oficina/llave.js"), puro = lee("apps/web/oficina/llave_puro.js");
const comun = lee("apps/web/oficina/comun.js"), oficina = lee("apps/web/oficina/oficina.js");

test("regla 12: WebAuthn con @simplewebauthn (versión fijada), nada casero", () => {
  const api = JSON.parse(lee("apps/api/package.json")), web = JSON.parse(lee("apps/web/package.json"));
  assert.match(api.dependencies["@simplewebauthn/server"] || "", /^\d+\.\d+\.\d+$/, "api: @simplewebauthn/server fijada");
  assert.match(web.dependencies["@simplewebauthn/browser"] || "", /^\d+\.\d+\.\d+$/, "web: @simplewebauthn/browser fijada");
  assert.match(lee("apps/web/package-lock.json"), /"node_modules\/@simplewebauthn\/browser"/, "en el package-lock de la web");
  const ts = lee("apps/api/src/oficina/llaves.ts");
  assert.match(ts, /from "@simplewebauthn\/server"/);
  assert.match(ts, /verifyRegistrationResponse\(/); assert.match(ts, /verifyAuthenticationResponse\(/);
  assert.ok(!/createVerify|subtle\.verify|cbor/i.test(ts), "la api no verifica firmas ni decodifica CBOR por su cuenta");
  assert.match(js, /from "@simplewebauthn\/browser"/);
  assert.ok(!/navigator\.credentials\.(create|get)/.test(js + comun + oficina), "la página no llama a navigator.credentials a mano");
});

test("api: obligatoria por defecto (y en producción), verificación de la persona obligatoria, confirmación por llave, sin puerta trasera", () => {
  const cfg = lee("apps/api/src/config.ts"), ll = lee("apps/api/src/oficina/llaves.ts"), rutas = lee("apps/api/src/oficina/llaves_rutas.ts");
  const almacen = lee("apps/api/src/auth/almacen.ts"), acceso = lee("apps/api/src/oficina/acceso.ts"), auth = lee("apps/api/src/auth/rutas.ts"), of = lee("apps/api/src/oficina/rutas.ts");
  assert.match(cfg, /texto\(e, "GEMELO_OFICINA_LLAVE", "obligatoria"\)/, "obligatoria si no se dice otra cosa");
  assert.match(cfg, /if \(produccion && modo === "no"\) throw/, "en producción no se relaja");
  assert.match(cfg, /"GEMELO_LLAVE_RP_ID"/); assert.match(cfg, /"GEMELO_LLAVE_ORIGEN"/);
  const vps = JSON.parse(lee("contratos/publicacion-vps.json"));
  for (const v of ["GEMELO_OFICINA_LLAVE", "GEMELO_LLAVE_RP_ID", "GEMELO_LLAVE_ORIGEN"]) assert.ok(vps.variables_api.includes(v), v + " declarada");
  assert.strictEqual((ll.match(/userVerification: "required"/g) || []).length, 2, "alta y entrada piden verificar a la persona");
  assert.strictEqual((ll.match(/requireUserVerification: true/g) || []).length, 2);
  assert.match(ll, /attestationType: "none"/);
  assert.match(ll, /if \(e\.algunaVez === 0\) return "si"/, "sin llave, el alta solo la primera vez…");
  assert.match(ll, /rehabilitadaHasta\.getTime\(\) > ahora\.getTime\(\)/, "…o rehabilitada y sin caducar");
  assert.match(rutas, /req\.params\.id === yo\) return rep\.code\(403\)/, "nadie rehabilita su propia llave");
  assert.match(rutas, /ultima_llave/, "nunca la última propia");
  assert.match(rutas, /\.find\(l => l\.credencialId === req\.body\.respuesta\.id\)/, "solo una llave de la propia cuenta abre la sesión");
  assert.ok(!/clave_publica|credencial_id/.test(rutas.split("const fila = ")[1].split("});")[0]), "las listas no devuelven la clave ni el id de credencial");
  assert.match(almacen, /s\.llaveRequerida = o\.llaveObligatoria === true && !conLlave/);
  assert.match(almacen, /s\.confirmacionVigente = f\.confirmacion_vigente && \(o\.llaveObligatoria !== true \|\| conLlave\)/);
  assert.match(acceso, /llaveRequerida\(req\.session\)\) \{ await rep\.code\(403\)\.send\(LLAVE_REQUERIDA\)/);
  assert.match(auth, /if \(!config\.llave\.obligatoria\) req\.session\.confirmadaEn = new Date\(\)/, "con la llave obligatoria el enlace ya no confirma");
  assert.match(of, /if \(config\.llave\.obligatoria\) return rep\.code\(409\)\.send\(\{ error: "usa_la_llave"/);
  assert.match(lee("apps/api/pruebas/apoyo/contexto.ts"), /GEMELO_OFICINA_LLAVE: "no",\s*\n\s*\.\.\.extra/, "las demás pruebas la relajan a propósito; las suyas la ponen obligatoria");
});

test("migración 0013: correlativa, las tablas de la llave y sin secretos ni datos de la explotación", () => {
  const mig = fs.readdirSync(path.join(RAIZ, "apps", "api", "migraciones")).filter(f => f.endsWith(".sql")).sort();
  const m = mig.find(f => /^\d{4}_llaves_oficina\.sql$/.test(f));
  assert.ok(m, "existe la migración de las llaves");
  assert.strictEqual(new Set(mig.map(f => f.slice(0, 4))).size, mig.length, "números de migración repetidos");
  const s = lee("apps/api/migraciones/" + m);
  assert.match(s, /CREATE TABLE llaves_oficina/); assert.match(s, /clave_publica\s+bytea NOT NULL/); assert.match(s, /contador\s+bigint NOT NULL/);
  assert.match(s, /transports\s+text\[\]/); assert.match(s, /revocada_en\s+timestamptz/); assert.match(s, /CREATE TABLE llaves_retos/);
  assert.match(s, /ALTER TABLE sesiones ADD COLUMN llave_id/); assert.match(s, /llave_rehabilitada_hasta/);
  assert.match(s, /GRANT SELECT, INSERT, UPDATE, DELETE ON llaves_oficina, llaves_retos TO gemelo_api/);
  assert.ok(!/privad|private_key|@[a-z0-9-]+\.[a-z]/i.test(s.replace(/--.*$/gm, "")), "ni claves privadas ni correos");
});

test("página: nada en línea ni de otro origen, DOM con h(), rutas del contrato; la pantalla de la llave antes de nada", () => {
  for (const [n, c] of Object.entries({ "llave.js": js, "llave_puro.js": puro })) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(c), n + ": no guarda nada en el navegador");
  }
  const bloque = /<div class="pantalla-llave" id="pLlave" hidden>[\s\S]*?<\/div>\s*<div class="app" id="app">/.exec(html);
  assert.ok(bloque, "la pantalla de la llave existe, oculta de entrada, antes de la oficina");
  assert.ok(!/\sstyle\s*=|\son[a-z]+\s*=|<script/i.test(bloque[0]), "sin estilos ni manejadores en línea");
  for (const id of ["llaveT", "llaveTexto", "fLlaveAlta", "llaveNombre", "llaveAltaB", "llaveEntraB", "llaveEstado", "llaveSalir"]) assert.ok(bloque[0].includes('id="' + id + '"'), id);
  for (const id of ["sLlaves", "sLlavesNota", "fLlaveOtra", "sLlaveNombre", "bLlaveOtra", "sLlavesAdmin", "sLlavesTodas", "reconfLlave", "reconfTexto"]) assert.ok(html.includes('id="' + id + '"'), id);
  const openapi = lee("contratos/api.openapi.yaml");
  // las rutas que nombra la página (con su id pegado detrás, las de revocar y rehabilitar), todas de la lista de abajo
  const conocidas = new Set(["/api/oficina/llaves/alta/opciones", "/api/oficina/llaves/alta", "/api/oficina/llaves/entrada/opciones", "/api/oficina/llaves/entrada",
    "/api/oficina/llaves", "/api/oficina/llaves/", "/api/admin/llaves", "/api/admin/llaves/", "/api/admin/hogares/", "/api/sesion/salir"]);
  const usadas = [...js.matchAll(/"(\/api\/[a-z/-]+)"/g)].map(m => m[1]);
  assert.ok(usadas.length >= 8, "la página llama a la api: " + usadas.join(", "));
  for (const r of usadas) assert.ok(conocidas.has(r), r + ": ruta que no está en el contrato");
  for (const r of ["/api/oficina/llaves/alta/opciones", "/api/oficina/llaves/alta", "/api/oficina/llaves/entrada/opciones", "/api/oficina/llaves/entrada",
    "/api/oficina/llaves", "/api/oficina/llaves/{id}/revocar", "/api/admin/llaves", "/api/admin/llaves/{id}/revocar", "/api/admin/hogares/{id}/rehabilitar-llave"]) {
    assert.ok(openapi.includes("  " + r + ":"), r + " en el contrato");
  }
  assert.match(js, /conConfirmacion\(\(\) => api\("POST", \(propia \? "\/api\/oficina\/llaves\/" : "\/api\/admin\/llaves\/"\) \+ id \+ "\/revocar"/, "revocar pasa por la confirmación");
  assert.match(js, /conConfirmacion\(\(\) => api\("POST", "\/api\/admin\/hogares\/" \+ id \+ "\/rehabilitar-llave"/, "rehabilitar pasa por la confirmación");
  assert.match(js, /escribe: nombre/, "rehabilitar pide escribir el nombre, no el correo");
  assert.match(oficina, /if \(muestraPantallaLlave\(s\.llave\)\) return false;/, "sin llave, solo su pantalla");
  assert.match(oficina, /fijaConfirmador\(conLlave \? usaLlave : null\)/, "con la llave obligatoria, la confirmación es la llave");
  assert.match(comun, /llave\.hidden = !conLlave/);
  assert.match(comun, /datos\.error === "llave_requerida" && oficinaAbierta\) location\.reload\(\)/, "sin bucles de recarga antes de abrir la oficina");
  assert.ok(!/\b(token|secreto|password)\b/i.test(js), "la pantalla no sabe de secretos");
});

test("piezas puras: qué pantalla, textos de error del navegador, resumen de una llave y nombre propuesto", async () => {
  const P = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "llave_puro.js")).href);
  assert.deepStrictEqual(P.pantallaLlave(undefined), { pantalla: false });
  assert.deepStrictEqual(P.pantallaLlave({ requerida: false, activas: 1 }), { pantalla: false });
  assert.deepStrictEqual(P.pantallaLlave({ requerida: true, activas: 0, puede_alta: true }), { pantalla: true, bloqueada: false, alta: true, entrada: false });
  assert.deepStrictEqual(P.pantallaLlave({ requerida: true, activas: 2, puede_alta: false }), { pantalla: true, bloqueada: false, alta: false, entrada: true });
  assert.deepStrictEqual(P.pantallaLlave({ requerida: true, activas: 1, puede_alta: true }), { pantalla: true, bloqueada: false, alta: true, entrada: true }, "rehabilitada con una viva: las dos");
  assert.deepStrictEqual(P.pantallaLlave({ requerida: true, activas: 0, puede_alta: false }), { pantalla: true, bloqueada: true, alta: false, entrada: false });
  assert.match(P.textoErrorLlave({ name: "NotAllowedError" }), /cancel/i);
  assert.match(P.textoErrorLlave({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" }), /ya está dada de alta/);
  assert.match(P.textoErrorLlave({ code: "ERROR_INVALID_DOMAIN" }), /https/);
  assert.match(P.textoErrorLlave(null), /No se pudo/);
  const hace = iso => (iso ? "hace 1 h" : null);
  assert.strictEqual(P.resumenLlave({ creada_en: "x", ultima_vez_en: null, respaldada: true, revocada_en: null }, hace), "dada de alta hace 1 h · sin usar · sincronizada en tu cuenta del aparato");
  assert.match(P.resumenLlave({ creada_en: "x", ultima_vez_en: "y", revocada_en: "z" }, hace), /usada hace 1 h · revocada hace 1 h$/);
  assert.strictEqual(P.nombrePropuesto("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131"), "Windows Hello de este ordenador");
  assert.strictEqual(P.nombrePropuesto(undefined), "Este aparato");
});

// ——— recorrido en Chrome con el autenticador virtual (opcional) ———
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "recorrido de Docker + Chrome opcional (GEMELO_DOCKER=1): la llave de acceso de la oficina con el autenticador virtual NO se ha comprobado" : null;

test("recorrido: alta de la llave la primera vez, confirmación con la llave, volver a entrar con ella (autenticador virtual de CDP, CSP impuesta)", { timeout: 900_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: la llave de acceso NO se ha comprobado");
  if (!fs.existsSync(path.join(RAIZ, "apps", "api", "node_modules", "@simplewebauthn", "server")) || !fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "@simplewebauthn", "browser"))) return t.skip("faltan las dependencias de apps/api o apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-llave-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);

  const nav = await lanza();
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const srv = spawn(process.execPath, ["pruebas/e2e/oficina_servidor.ts", dist, "--llave"], { cwd: path.join(RAIZ, "apps", "api"), env, stdio: ["pipe", "pipe", "pipe"] });
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
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*(401|403|404|409)/.test(m.text())) errores.push(m.text()); });
    // el autenticador virtual: de plataforma, con llave residente y verificación de la persona (como Windows Hello o Touch ID)
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const entraConEnlace = async () => {
      const { url } = await get("/__prueba/enlace?para=" + encodeURIComponent(info.admin));
      await pg.goto(url);
      await pg.click("button[type=submit], input[type=submit]");
      await pg.waitForURL(/\/oficina\//, { timeout: 15_000 });
    };

    // 1. primera vez: solo la pantalla de la llave, con el alta; la oficina no se ve ni pide nada
    await pg.goto(base + "/__prueba/aparato");
    await entraConEnlace();
    await pg.waitForSelector("#pLlave:not([hidden]) #fLlaveAlta:not([hidden])");
    assert.strictEqual(await pg.isHidden("#app"), true, "la oficina está oculta");
    assert.strictEqual(await pg.isHidden("#llaveEntraP"), true, "aún no hay llave con la que entrar");
    await pg.fill("#llaveNombre", "Autenticador virtual");
    await pg.click("#llaveAltaB");
    await pg.waitForFunction(() => document.querySelector("#s-rol").textContent !== "—", null, { timeout: 20_000 });
    assert.strictEqual(await pg.isHidden("#pLlave"), true);
    assert.match(await pg.textContent("#s-confirmacion"), /llave/);
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    assert.strictEqual(credentials.length, 1, "una llave en el autenticador");

    // 2. Sistema: la llave propia, viva y «la de esta sesión»; admin ve las cuentas
    await pg.click("#nav button[data-sec=sistema]");
    await pg.waitForSelector("#sLlaves li[data-llave]");
    assert.match(await pg.textContent("#sLlaves"), /Autenticador virtual[\s\S]*la de esta sesión[\s\S]*viva/);
    assert.strictEqual(await pg.isVisible("#sLlavesAdmin"), true);
    // añadir otra en el MISMO autenticador: el navegador lo impide (excludeCredentials) y se dice con palabras
    await pg.fill("#sLlaveNombre", "Otra en el mismo"); await pg.click("#bLlaveOtra");
    await pg.waitForSelector("#avisos .aviso.mal:has-text('ya está dada de alta')", { timeout: 15_000 });

    // 3. confirmación reciente caducada: re-hornear pide la llave en el diálogo y se reintenta solo
    await get("/__prueba/caduca-confirmacion");
    await pg.click("#bSistemaRefresca");
    await pg.click("#bRehornear"); await pg.waitForSelector("#dlgConfirma[open]");
    await pg.click("#dlgConfSi");
    await pg.waitForSelector("#dlgReconfirma[open] #reconfLlave:not([hidden])");
    assert.strictEqual(await pg.isHidden("#reconfManda"), true, "con la llave obligatoria no se ofrece el enlace por correo");
    await pg.click("#reconfLlave");
    await pg.waitForSelector("#avisos .aviso:has-text('Petición dejada')", { timeout: 20_000 });

    // 4. salir y volver a entrar: el enlace solo lleva a la pantalla de la llave, que ahora ofrece entrar
    await pg.click("#salir"); await pg.waitForURL(u => !/\/oficina\//.test(String(u)));
    await entraConEnlace();
    await pg.waitForSelector("#pLlave:not([hidden]) #llaveEntraP:not([hidden])");
    assert.strictEqual(await pg.isHidden("#fLlaveAlta"), true, "con una llave ya dada de alta, el enlace solo no deja crear otra");
    await pg.click("#llaveEntraB");
    await pg.waitForFunction(() => document.querySelector("#s-rol").textContent !== "—", null, { timeout: 20_000 });
    const capturas = propia("oficina-llave-capturas");
    await pg.screenshot({ path: path.join(capturas, "oficina-llave-1280.png") });
    console.log("# capturas del recorrido en " + capturas);

    assert.deepStrictEqual(await pg.evaluate(() => window.__csp), [], "ninguna violación de la CSP impuesta");
    assert.deepStrictEqual(errores, [], "sin errores en la página");
    await ctx.close();
  } finally {
    srv.stdin.end();
    await new Promise(ok => { const f = setTimeout(() => { srv.kill(); ok(); }, 60_000); srv.on("exit", () => { clearTimeout(f); ok(); }); });
    await nav.close();
  }
});
