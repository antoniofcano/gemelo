"use strict";
// La oficina, OF13b-8: entrar con la llave, sin enlace (doc/sistema/LLAVES-DE-ACCESO.md § 3.4 y § 10; ADR-0029; decisiones 152 y 184).
// Solo Node: la lógica pura (llave_puro.js), el DOM y fetch de mentira, y las reglas de higiene de la página. NINGÚN navegador ni
// autenticador real. Opcional (GEMELO_DOCKER=1): recorrido en Chrome con el autenticador virtual de CDP, ESCRITO SIN EJECUTAR.
const test = require("node:test"), assert = require("node:assert");
const { spawn, spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const html = lee("apps/web/oficina/index.html"), js = lee("apps/web/oficina/llave.js"), puro = lee("apps/web/oficina/llave_puro.js"), oficina = lee("apps/web/oficina/oficina.js");
const importa = f => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", f)).href);

test("página: la pantalla de entrada existe, oculta, sin estilos ni manejadores en línea, con «Entrar con mi llave» y «Recibir un enlace»", () => {
  const b = /<div class="pantalla-llave" id="pEntra" hidden>[\s\S]*?<\/main>\s*<\/div>/.exec(html);
  assert.ok(b, "pEntra, oculta de entrada");
  assert.ok(!/\sstyle\s*=|\son[a-z]+\s*=|<script/i.test(b[0]), "sin estilos ni manejadores en línea (CSP)");
  for (const id of ["entraT", "entraTexto", "entraP", "entraB", "entraEstado", "entraEnlace"]) assert.ok(b[0].includes('id="' + id + '"'), id);
  assert.match(b[0], /id="entraEstado" role="status" aria-live="polite"/, "el estado lo anuncia el lector de pantalla");
  assert.match(b[0], /id="entraT" tabindex="-1"/, "el foco va al título");
  assert.match(b[0], /Entrar con mi llave/); assert.match(b[0], /Recibir un enlace/);
  assert.ok(b[0].indexOf("entraB") < b[0].indexOf("entraEnlace"), "primero la llave, debajo el enlace");
  assert.match(html, /id="sLlaveAltaEstado" role="status" aria-live="polite"/, "el alta de Sistema anuncia si la llave es descubrible");
  assert.match(html, /huella, la cara o el PIN/);
});

test("página: sin sesión se enseña la entrada (sin redirigir), con el aparato pendiente va a su página, y la ceremonia no usa navigator.credentials", () => {
  assert.match(oficina, /if \(r\.estado === 401\) \{ muestraPantallaEntrada\(\); return false; \}/);
  assert.match(oficina, /s\.aparato\.estado === "pendiente"\) \{ location\.replace\("\/api\/oficina\/pendiente"\); return false; \}/);
  assert.match(js, /WebAuthnAbortService\.cancelCeremony\(\)/, "aborta la ceremonia previa antes de pedir otras opciones");
  assert.ok(!/navigator\.credentials/.test(js + puro), "la librería hace la ceremonia");
  assert.ok(!/\.style\b|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/.test(js + puro), "nada en línea ni HTML a mano");
  assert.match(puro, /"\/api\/auth\/llave\/opciones"/); assert.match(puro, /"\/api\/auth\/llave"/);
  const openapi = lee("contratos/api.openapi.yaml");
  assert.ok(openapi.includes("  /api/auth/llave/opciones:") && openapi.includes("  /api/auth/llave:"), "las rutas están en el contrato");
});

test("destinoTrasEntrada: manda el estado del aparato; sin aparato, solo rutas del mismo origen", async () => {
  const P = await importa("llave_puro.js");
  assert.strictEqual(P.destinoTrasEntrada({ ok: true, destino: "/oficina/", aparato: "aprobado" }), "/oficina/");
  assert.strictEqual(P.destinoTrasEntrada({ ok: true, destino: "/api/oficina/pendiente", aparato: "pendiente" }), "/api/oficina/pendiente");
  assert.strictEqual(P.destinoTrasEntrada({ aparato: "pendiente", destino: "/oficina/" }), "/api/oficina/pendiente", "manda el aparato, no el texto del destino");
  assert.strictEqual(P.destinoTrasEntrada({ destino: "/finca/" }), "/finca/");
  assert.strictEqual(P.destinoTrasEntrada({ destino: "/#bienvenida" }), "/#bienvenida");
  for (const malo of ["//evil.example", "https://evil.example/", "javascript:alert(1)", "/\\evil", "", undefined, 3]) assert.strictEqual(P.destinoTrasEntrada({ destino: malo }), "/", String(malo));
  assert.strictEqual(P.destinoTrasEntrada(null), "/");
});

test("resumenLlave y avisoAlta: dicen si la llave sirve para entrar sin correo", async () => {
  const P = await importa("llave_puro.js"), hace = iso => (iso ? "hace 1 h" : null);
  assert.match(P.resumenLlave({ creada_en: "x", descubrible: false }, hace), /no sirve para entrar sin correo/);
  assert.ok(!/sin correo/.test(P.resumenLlave({ creada_en: "x", descubrible: true }, hace)));
  assert.ok(!/sin correo/.test(P.resumenLlave({ creada_en: "x" }, hace)), "sin el dato (api antigua) no se afirma nada");
  const si = P.avisoAlta("Windows Hello", true), no = P.avisoAlta("Llave física", false);
  assert.deepStrictEqual([si.tipo, si.repetir], ["ok", false]);
  assert.match(si.texto, /Entrar con mi llave/);
  assert.deepStrictEqual([no.tipo, no.repetir], ["mal", true]);
  assert.match(no.texto, /no la guarda para entrar sin correo/); assert.match(no.texto, /Repite el alta/);
});

// ——— la ceremonia, con todo lo de fuera de mentira ———
function fabrica({ soporta = true, opciones, entrada, firma } = {}) {
  const llamadas = [];
  return {
    llamadas,
    d: {
      soporta: () => soporta,
      cancela: () => llamadas.push("cancela"),
      post: async (ruta, cuerpo) => {
        llamadas.push("post " + ruta);
        const r = ruta === "/api/auth/llave/opciones" ? (opciones || { ok: true, estado: 200, datos: { challenge: "c" } }) : (entrada || { ok: true, estado: 200, datos: { ok: true, destino: "/oficina/", aparato: "aprobado" } });
        r.cuerpo = cuerpo;
        return r;
      },
      firma: async o => { llamadas.push("firma"); if (firma) return firma(o); return { id: "x", response: {} }; },
    },
  };
}

test("entraConLlave: aparato aprobado, entra directo en la oficina; aborta la ceremonia previa ANTES de pedir las opciones", async () => {
  const P = await importa("llave_puro.js"), f = fabrica();
  const r = await P.entraConLlave(f.d);
  assert.deepStrictEqual(r, { ok: true, destino: "/oficina/", aparato: "aprobado" });
  assert.deepStrictEqual(f.llamadas, ["cancela", "post /api/auth/llave/opciones", "firma", "post /api/auth/llave"]);
});

test("entraConLlave: aparato pendiente, va a su página (la llave no lo aprueba, decisión 184)", async () => {
  const P = await importa("llave_puro.js");
  const f = fabrica({ entrada: { ok: true, estado: 200, datos: { ok: true, destino: "/api/oficina/pendiente", aparato: "pendiente" } } });
  assert.deepStrictEqual(await P.entraConLlave(f.d), { ok: true, destino: "/api/oficina/pendiente", aparato: "pendiente" });
});

test("entraConLlave: cuenta de familia (sin aparato), sigue el destino de la api", async () => {
  const P = await importa("llave_puro.js");
  const f = fabrica({ entrada: { ok: true, estado: 200, datos: { ok: true, destino: "/finca/", primer_acceso: false } } });
  assert.deepStrictEqual(await P.entraConLlave(f.d), { ok: true, destino: "/finca/", aparato: null });
});

test("entraConLlave: el MISMO error genérico para cualquier fallo de la api (llave desconocida, revocada, firma, reto…)", async () => {
  const P = await importa("llave_puro.js");
  const textos = new Set();
  for (const entrada of [
    { ok: false, estado: 401, datos: { error: "llave_no_valida", mensaje: "otro texto distinto" } },
    { ok: false, estado: 401, datos: null }, { ok: false, estado: 500, datos: { error: "x" } }, { ok: true, estado: 200, datos: { ok: false } }, { ok: true, estado: 200, datos: null },
  ]) {
    const r = await P.entraConLlave(fabrica({ entrada }).d);
    assert.strictEqual(r.ok, false); textos.add(r.mensaje);
  }
  const sinOpciones = await P.entraConLlave(fabrica({ opciones: { ok: false, estado: 500, datos: null } }).d);
  textos.add(sinOpciones.mensaje);
  assert.deepStrictEqual([...textos], [P.TEXTO_ENTRADA_FALLIDA]);
  const lim = await P.entraConLlave(fabrica({ entrada: { ok: false, estado: 429, datos: { mensaje: "Demasiados intentos. Espera unos minutos." }, mensaje: "Demasiados intentos. Espera unos minutos." } }).d);
  assert.strictEqual(lim.mensaje, "Demasiados intentos. Espera unos minutos.", "el límite dice su causa: no delata nada de ninguna cuenta");
});

test("entraConLlave: el aparato cancela o se agota el tiempo → su texto, y NO se llama a la api de entrada", async () => {
  const P = await importa("llave_puro.js");
  const f = fabrica({ firma: () => { const e = new Error("x"); e.name = "NotAllowedError"; throw e; } });
  const r = await P.entraConLlave(f.d);
  assert.strictEqual(r.ok, false); assert.match(r.mensaje, /cancel/i);
  assert.ok(!f.llamadas.includes("post /api/auth/llave"));
});

test("entraConLlave: sin soporte de WebAuthn, solo el enlace (no pide nada a la api ni aborta nada)", async () => {
  const P = await importa("llave_puro.js"), f = fabrica({ soporta: false });
  const r = await P.entraConLlave(f.d);
  assert.deepStrictEqual([r.ok, r.sinSoporte, r.mensaje], [false, true, P.TEXTO_SIN_WEBAUTHN]);
  assert.match(P.TEXTO_SIN_WEBAUTHN, /enlace/);
  assert.deepStrictEqual(f.llamadas, []);
});

// ——— el DOM de la pantalla de entrada, con un DOM de mentira ———
function dom(soporta) {
  const el = id => ({ id, hidden: false, textContent: "", disabled: false, focused: 0, onclick: null, focus() { this.focused++; } });
  const nodos = {}; for (const id of ["#app", "#pLlave", "#pEntra", "#entraEstado", "#entraB", "#entraP", "#entraTexto", "#entraT"]) nodos[id] = el(id);
  const g = globalThis, antes = { document: g.document, PublicKeyCredential: g.PublicKeyCredential, location: g.location };
  g.document = { querySelector: s => nodos[s] };
  if (soporta) g.PublicKeyCredential = function PublicKeyCredential() {}; else delete g.PublicKeyCredential;
  const destinos = [];
  Object.defineProperty(g, "location", { value: { assign: u => destinos.push(u) }, configurable: true, writable: true });
  return { nodos, destinos, resto() { g.document = antes.document; if (antes.PublicKeyCredential) g.PublicKeyCredential = antes.PublicKeyCredential; else delete g.PublicKeyCredential; if (antes.location) Object.defineProperty(g, "location", { value: antes.location, configurable: true, writable: true }); else delete g.location; } };
}
const hayLibreria = () => fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "@simplewebauthn", "browser"));

test("muestraPantallaEntrada: foco en el título, estado anunciado, destino tras entrar y foco al botón si falla", { skip: !hayLibreria() && "falta apps/web/node_modules (npm ci)" }, async () => {
  const d = dom(true);
  try {
    const L = await importa("llave.js");
    let r = { ok: true, destino: "/api/oficina/pendiente", aparato: "pendiente" };
    L.muestraPantallaEntrada(async () => r);
    const n = d.nodos;
    assert.strictEqual(n["#pEntra"].hidden, false); assert.strictEqual(n["#app"].hidden, true); assert.strictEqual(n["#pLlave"].hidden, true);
    assert.strictEqual(n["#entraT"].focused, 1, "el foco va al título");
    assert.strictEqual(n["#entraP"].hidden, false);
    await n["#entraB"].onclick();
    assert.deepStrictEqual(d.destinos, ["/api/oficina/pendiente"]);
    assert.match(n["#entraEstado"].textContent, /pendiente de aprobar/);
    assert.strictEqual(n["#entraB"].disabled, false);
    r = { ok: false, mensaje: "Esa llave no sirve aquí o no se pudo comprobar." };
    await n["#entraB"].onclick();
    assert.strictEqual(n["#entraEstado"].textContent, r.mensaje); assert.strictEqual(n["#entraB"].focused, 1, "el foco vuelve al botón");
    assert.strictEqual(d.destinos.length, 1, "un fallo no navega");
  } finally { d.resto(); }
});

test("muestraPantallaEntrada: sin WebAuthn se esconde el botón y se ofrece el enlace", { skip: !hayLibreria() && "falta apps/web/node_modules (npm ci)" }, async () => {
  const d = dom(false);
  try {
    const L = await importa("llave.js");
    L.muestraPantallaEntrada(async () => ({ ok: false, mensaje: "x" }));
    assert.strictEqual(d.nodos["#entraP"].hidden, true);
    assert.match(d.nodos["#entraTexto"].textContent, /Recibe un enlace/);
  } finally { d.resto(); }
});

// ——— recorrido en Chrome con el autenticador virtual (opcional; ESCRITO SIN EJECUTAR) ———
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "recorrido de Docker + Chrome opcional (GEMELO_DOCKER=1): la entrada con llave de la oficina con el autenticador virtual NO se ha comprobado" : null;

test("recorrido: entrar con la llave en /oficina/ con el aparato aprobado (directo) y con el pendiente (su página); autenticador virtual de CDP", { timeout: 900_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core");
  if (!fs.existsSync(path.join(RAIZ, "apps", "api", "node_modules", "@simplewebauthn", "server")) || !hayLibreria()) return t.skip("faltan las dependencias de apps/api o apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-llave-entrada-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);
  const nav = await lanza();
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const srv = spawn(process.execPath, ["pruebas/e2e/oficina_servidor.ts", dist, "--llave"], { cwd: path.join(RAIZ, "apps", "api"), env, stdio: ["pipe", "pipe", "pipe"] });
  let salida = "", errs = "";
  srv.stdout.on("data", d => { salida += d; }); srv.stderr.on("data", d => { errs += d; });
  try {
    const info = await new Promise((ok, mal) => {
      const lim = setTimeout(() => mal(new Error("el servidor no arrancó en 5 min: " + errs)), 300_000);
      const mira = setInterval(() => {
        const m = /LISTO (\{.*\})/.exec(salida);
        if (m) { clearInterval(mira); clearTimeout(lim); ok(JSON.parse(m[1])); } else if (srv.exitCode !== null) { clearInterval(mira); clearTimeout(lim); mal(new Error("el servidor salió: " + errs)); }
      }, 500);
    });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const base = info.url, get = async r => (await fetch(base + r)).json();
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES", ignoreHTTPSErrors: true });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*(401|403|404|409)/.test(m.text())) errores.push(m.text()); });
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const entraConEnlace = async () => {
      const { url } = await get("/__prueba/enlace?para=" + encodeURIComponent(info.admin));
      await pg.goto(url); await pg.click("button[type=submit], input[type=submit]"); await pg.waitForURL(/\/oficina\//, { timeout: 15_000 });
    };
    const SIN_GUARDA = base + "/__prueba/sin-guarda/";   // la oficina sin la guarda del Caddy, para ver su pantalla de entrada

    // 0. preparación: el aparato aprobado, un enlace, y el alta de una llave RESIDENTE
    await pg.goto(base + "/__prueba/aparato"); await entraConEnlace();
    await pg.waitForSelector("#pLlave:not([hidden]) #fLlaveAlta:not([hidden])");
    await pg.click("#llaveAltaB");
    await pg.waitForFunction(() => document.querySelector("#s-rol").textContent !== "—", null, { timeout: 20_000 });
    // Sistema: la llave sale como descubrible (sin el aviso «no sirve sin correo»)
    await pg.click("#nav button[data-sec=sistema]"); await pg.waitForSelector("#sLlaves li[data-llave]");
    assert.ok(!/no sirve sin correo/.test(await pg.textContent("#sLlaves")), "la llave del autenticador virtual es residente");

    // 1. aparato APROBADO: sin sesión, la pantalla de entrada; «Entrar con mi llave» lleva directo a la oficina, con la confirmación reciente
    await pg.click("#salir"); await pg.waitForURL(u => !/\/oficina\//.test(String(u)));
    await pg.goto(SIN_GUARDA);
    await pg.waitForSelector("#pEntra:not([hidden]) #entraB");
    assert.strictEqual(await pg.isHidden("#app"), true);
    await pg.click("#entraB");
    await pg.waitForURL(/\/oficina\//, { timeout: 20_000 });
    await pg.waitForFunction(() => document.querySelector("#s-rol").textContent !== "—", null, { timeout: 20_000 });
    assert.strictEqual(await pg.isHidden("#pLlave"), true, "no vuelve a pedir la llave");
    assert.match(await pg.textContent("#s-confirmacion"), /sí \(usaste tu llave hace poco\)/);
    assert.match(await pg.textContent("#s-aparato"), /aprobado/);

    // 2. aparato NUEVO (sin su cookie): la llave se reconoce pero NO lo aprueba; va a la página de «aparato pendiente»
    await pg.click("#salir"); await pg.waitForURL(u => !/\/oficina\//.test(String(u)));
    await ctx.clearCookies({ name: "__Host-gemelo-aparato" });
    await pg.goto(SIN_GUARDA);
    await pg.waitForSelector("#pEntra:not([hidden]) #entraB");
    await pg.click("#entraB");
    await pg.waitForURL(/\/api\/oficina\/pendiente/, { timeout: 20_000 });
    assert.match(await pg.textContent("body"), /pendiente/i);
    // con el aparato pendiente, la oficina de verdad no se abre
    await pg.goto(base + "/oficina/");
    assert.ok(!/\/oficina\/$/.test(pg.url()) || (await pg.isHidden("#app")), "la oficina no se abre con el aparato pendiente");

    assert.deepStrictEqual(await pg.evaluate(() => window.__csp || []), [], "ninguna violación de la CSP impuesta");
    assert.deepStrictEqual(errores, [], "sin errores en la página");
    await ctx.close();
  } finally {
    srv.stdin.end();
    await new Promise(ok => { const f = setTimeout(() => { srv.kill(); ok(); }, 60_000); srv.on("exit", () => { clearTimeout(f); ok(); }); });
    await nav.close();
  }
});
