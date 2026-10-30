"use strict";
// Elegir avatar en la portada (ADR-0020 §P7d; apps/web/portada/). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen (CSP estricta), la vista previa 3D (vista3d.js) solo se pide con import() al abrir la pantalla del
//    avatar, la alternativa accesible (radios con nombre y descripción, sin WebGL), foco visible, objetivos de 44/56 px, movimiento reducido,
//    créditos con enlaces solo https y rel seguro;
//  - contrato: la portada manda `vrm` a PUT /api/yo/avatar con el mismo patrón de id que el catálogo, y el contrato, la api y la migración lo dicen igual;
//  - build (si hay apps/web/node_modules): three y three-vrm quedan en un trozo aparte, la página no lleva nada en línea.
// Opcional (GEMELO_DOCKER=1): e2e con el entorno local (proyecto gemelo-dev-p7d, puertos propios, NUNCA el gemelo-dev de la persona): primer acceso,
// elegir un avatar del catálogo sintético con su vista previa 3D en Chrome (SwiftShader), leerlo de vuelta por la api, 0 violaciones de CSP.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, propia, ejecuta, fs, path } = require("./_util");

const html = lee("apps/web/portada/index.html"), js = lee("apps/web/portada/portada.js"), v3 = lee("apps/web/portada/vista3d.js"), css = lee("apps/web/portada/portada.css");
const PATRON_ID = "^[a-z0-9-]{1,32}$";

test("la vista previa 3D no depende de nada de fuera ni escribe en línea; three y three-vrm son los del package.json", () => {
  for (const [n, c] of [["portada.js", js], ["vista3d.js", v3]]) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), n + ": solo su mismo origen");
  }
  const imports = [...v3.matchAll(/^import .* from "([^"]+)"/gm)].map(m => m[1]);
  assert.deepStrictEqual(imports, ["three", "three/addons/loaders/GLTFLoader.js", "@pixiv/three-vrm"]);
  const dep = JSON.parse(lee("apps/web/package.json")).dependencies;
  assert.match(dep["@pixiv/three-vrm"], /^\d+\.\d+\.\d+$/, "three-vrm con versión exacta");
  assert.strictEqual(dep["@pixiv/three-vrm"], "3.5.5", "la que fija el ADR-0020");
  // solo se pide al abrir la pantalla del avatar: import() dinámico, nunca estático
  assert.match(js, /await import\("\.\/vista3d\.js"\)/);
  assert.ok(!/^import .*vista3d/m.test(js), "vista3d.js no se importa al arrancar");
  assert.ok(!/^import /m.test(js), "la portada no importa nada al arrancar");
  assert.match(js, /paraVista\(\)/, "al salir de la pantalla se libera la vista");
  assert.match(v3, /renderer\.dispose\(\)/); assert.match(v3, /deepDispose/, "libera los recursos de GPU");
  assert.match(v3, /sha256/); assert.match(v3, /digest\("SHA-256"/, "comprueba la huella del .vrm como dirá el cliente del motor");
  assert.match(v3, /setSize\(w, h, false\)/, "el tamaño por CSS, no por style en línea");
});

test("alternativa accesible: la lista de avatares son radios con nombre y descripción, no depende de WebGL; la vista 3D, con nombre y mandos por teclado", () => {
  assert.match(html, /<fieldset id="fsGaleria" hidden>\s*<legend>[^<]+<\/legend>/, "la galería (avatares ya hechos, AV4: aparte de las piezas) es un grupo con leyenda");
  assert.match(js, /inp\.type = "radio"; inp\.name = "avatar"/);
  assert.match(js, /l\.append\(inp, sp\)/, "cada radio dentro de su <label>");
  assert.match(js, /d\.className = "desc"; d\.textContent = o\.descripcion/, "con la descripción");
  assert.match(js, /hayWebGL\(\)[\s\S]{0,200}soloMuneco\(/, "sin WebGL: el muñeco y el texto, y se elige igual");
  assert.match(js, /catch \{[\s\S]{0,200}soloMuneco\("No hemos podido/, "si falla la carga, lo mismo");
  assert.match(html, /<canvas id="avatar3d"[^>]*role="img"[^>]*aria-label="[^"]+"/, "el lienzo con nombre");
  assert.match(html, /id="estado3d"[^>]*role="status"/, "el estado se anuncia");
  for (const id of ["giroIzq", "giroDer", "giroPausa"]) assert.match(html, new RegExp('<button type="button" class="btn" id="' + id + '"'), id + " es un botón");
  assert.match(html, /id="giroIzq" aria-label="[^"]+"/); assert.match(html, /id="giroDer" aria-label="[^"]+"/);
  assert.match(html, /id="giroPausa" aria-pressed="false"/);
  assert.match(js, /prefers-reduced-motion: reduce/, "con movimiento reducido, quieto de entrada");
  assert.match(html, /id="btnAzar">Al azar</, "«Al azar» sigue");
  assert.match(html, /href="#creditos">Créditos de los avatares/, "los créditos, desde el avatar");
  assert.match(html, /<section class="pant estrecha" id="p-creditos" aria-labelledby="t-creditos" hidden>\s*<a [^>]*>[^<]+<\/a>\s*<h1 id="t-creditos" tabindex="-1">/);
  // se cambia desde fuera del primer acceso
  assert.match(html, /<a class="btn" href="#avatar">Mi avatar<\/a>/);
});

test("foco visible y objetivos táctiles: los radios de la galería no se esconden con display:none, se ven enfocados y miden --toque (44 px; 56 en Quest)", () => {
  assert.ok(!/\.tarjeta-av input\s*\{[^}]*display:\s*none/.test(css), "ocultar un radio con display:none lo saca del teclado");
  assert.match(css, /\.tarjeta-av input:focus-visible \+ span \{ outline: 3px solid var\(--foco\)/);
  assert.match(css, /\.tarjeta-av > span \{[^}]*min-height: var\(--toque\)/);
  assert.match(css, /\.tarjeta-av input:checked \+ span \{ border-color: var\(--olivo\); box-shadow/, "lo elegido se ve sin depender del color solo (borde y sombra)");
  assert.match(css, /--toque: 44px/); assert.match(css, /html\[data-disp="quest"\][^}]*--toque: 56px/);
  assert.match(css, /\.av3d \{[^}]*touch-action: pan-y/, "la vista previa no se come el desplazamiento de la página en el móvil");
});

test("créditos: sale cada avatar con autor, licencia y fuente; los que piden crédito, aparte; los enlaces solo https y con rel seguro", () => {
  assert.match(js, /credito_obligatorio \? obl : lib/);
  assert.match(js, /const esHttps = u => typeof u === "string" && \/\^https:\\\/\\\/\/\.test\(u\)/);
  assert.match(js, /a\.rel = "noopener noreferrer"/);
  assert.match(js, /a\.licencia\.texto_credito/);
  assert.match(html, /id="creditosObligatorios"[\s\S]*Con crédito obligatorio/);
  // el catálogo va tras sesión: el enlace de créditos de la portada solo se enseña con sesión
  assert.match(js, /\$\("enlCreditos"\)\.hidden = !con \|\| s\.primer_acceso/);
  // los créditos no pueden depender de que la licencia sea CC0: el esquema los exige
  const esq = JSON.parse(lee("contratos/avatares.schema.json")), txt = JSON.stringify(esq);
  assert.ok(txt.includes("credito_obligatorio") && txt.includes("texto_credito"));
});

test("contrato: `vrm` es el mismo campo (mismo patrón) en la portada, la api, el contrato OpenAPI, la migración y el esquema del catálogo", () => {
  assert.match(js, /pide\("PUT", "\/api\/yo\/avatar", S\.R\.peticion\(S\.v2, S\.e\)\)/, "la portada lo manda en el PUT (AV4: con la receta, receta.js)");
  assert.match(lee("apps/web/portada/receta.js"), /vrm: e\.vrm \|\| null/, "vrm, el de siempre");
  assert.match(js, /pide\("GET", "\/api\/yo\/avatar"\)/, "y lo lee de vuelta");
  assert.match(js, /pide\("GET", "\/avatares\/catalogo\.json"\)/);
  assert.match(js, /"\/avatares\/" \+ encodeURIComponent\(fichero\) \+ "\?v=" \+ sha/, "con ?v=<sha256>, como pide contratos/avatares.md");
  const api = lee("apps/api/src/yo/rutas.ts");
  assert.ok(api.includes('pattern: "' + PATRON_ID + '"'), "la api valida el id con el patrón del catálogo");
  assert.match(api, /app\.get\("\/api\/yo\/avatar"/);
  assert.match(api, /vrm = \$5/);
  const oa = lee("contratos/api.openapi.yaml");
  assert.ok(oa.includes('vrm: { type: [string, "null"], pattern: "' + PATRON_ID + '" }'), "OpenAPI: PUT con vrm");
  assert.match(oa, /\/api\/yo\/avatar:\s*\n\s*get:/, "OpenAPI: GET");
  const mig = fs.readdirSync(path.join(RAIZ, "apps", "api", "migraciones")).filter(f => f.endsWith(".sql")).sort();
  assert.deepStrictEqual(mig.map(f => f.slice(0, 4)), mig.map((_, i) => String(i + 1).padStart(4, "0")), "migraciones correlativas");
  const m3 = lee("apps/api/migraciones/" + mig.find(f => f.includes("avatar_vrm")));
  assert.ok(m3.includes("ADD COLUMN vrm text CHECK (vrm ~ '" + PATRON_ID + "')"));
  assert.ok(lee("contratos/avatares.schema.json").includes(PATRON_ID.replace(/\\/g, "\\\\")) || lee("contratos/avatares.schema.json").includes(PATRON_ID), "el mismo patrón en el esquema del catálogo");
  assert.match(lee("apps/api/src/presencia/livekit.ts"), /vrm\?: string/, "viaja en los metadatos de presencia solo si hay");
});

test("build de la portada (si hay apps/web/node_modules): three y three-vrm van en un trozo aparte y la página no lleva nada en línea", t => {
  if (!fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "@pixiv", "three-vrm"))) return t.skip("sin apps/web/node_modules (cd apps/web && npm ci): el build de la portada NO se ha comprobado");
  const salida = propia("portada-build");
  const r = ejecuta(process.execPath, [path.join(RAIZ, "apps", "web", "node_modules", "vite", "bin", "vite.js"), "build", "--config", "vite.portada.config.js"],
    { cwd: path.join(RAIZ, "apps", "web"), env: Object.assign({}, process.env, { GEMELO_PORTADA_SALIDA: salida }) });
  assert.strictEqual(r.status, 0, "vite build falló:\n" + r.stdout + r.stderr);
  const pagina = fs.readFileSync(path.join(salida, "index.html"), "utf8");
  assert.ok(!/<style|\sstyle=|\son[a-z]+=/i.test(pagina)); for (const m of pagina.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) assert.strictEqual(m[1].trim(), "", "un <script> con código en línea");
  const ficheros = fs.readdirSync(path.join(salida, "assets")), js_ = ficheros.filter(f => f.endsWith(".js"));
  const principal = /assets\/(index-[^"]+\.js)/.exec(pagina);
  assert.ok(principal, "la página carga su script");
  const tam = f => fs.statSync(path.join(salida, "assets", f)).size;
  assert.ok(js_.length >= 2, "three y three-vrm en un trozo aparte: " + js_.join(", "));
  assert.ok(tam(principal[1]) < 40_000, "el script de la portada sigue siendo pequeño: " + tam(principal[1]) + " bytes");
  assert.ok(![...pagina.matchAll(/<(?:script|link)\b[^>]*>/gi)].some(m => /vista3d/.test(m[0])), "la página no carga ni precarga el trozo de la vista 3D");
  const grande = js_.sort((a, b) => tam(b) - tam(a))[0];
  t.diagnostic("portada: script principal " + tam(principal[1]) + " B; trozo 3D " + grande + " " + tam(grande) + " B (sin comprimir)");
});

// ——— e2e opcional ———
const SALTO_E2E = process.env.GEMELO_DOCKER !== "1" ? "e2e de Docker opcional (GEMELO_DOCKER=1): elegir avatar en la portada con el entorno levantado y Chrome NO se ha comprobado" : null;

test("e2e: primer acceso → galería del catálogo sintético → vista previa 3D → Listo → leído de vuelta por la api y en Configuración (gemelo-dev-p7d)", { timeout: 1_500_000 }, async t => {
  if (SALTO_E2E) return t.skip(SALTO_E2E);
  const { pathToFileURL } = require("url"), { motivoSalto, lanza } = require("./_navegador");
  const motivo = motivoSalto("elegir avatar en la portada"); if (motivo) return t.skip(motivo);
  // NUNCA el entorno de la persona (gemelo-dev): proyecto, puertos y carpeta de avatares propios
  const env = { COMPOSE_PROJECT_NAME: "gemelo-dev-p7d", GEMELO_DEV_PUERTO_WEB: "8880", GEMELO_DEV_PUERTO_HTTPS: "8843", GEMELO_DEV_PUERTO_DB: "55532", GEMELO_DEV_PUERTO_LIVEKIT: "7980", GEMELO_DEV_PUERTO_CORREO_WEB: "8125", GEMELO_DEV_PUERTO_SMTP: "1125" };
  const previo = {}; for (const [k, v] of Object.entries(env)) { previo[k] = process.env[k]; process.env[k] = v; }
  assert.strictEqual(process.env.COMPOSE_PROJECT_NAME, "gemelo-dev-p7d");
  const sueltaTurno = await require("../banco/turno").pide("docker: e2e de avatar en la portada");
  const HERR = path.join(RAIZ, "infra", "dev", "herramientas"), imp = f => import(pathToFileURL(path.join(HERR, f)).href);
  let bajar = false;
  try {
    // catálogo sintético (2 avatares, uno con crédito obligatorio) en pruebas/salida (ignorada por git); nada de datos reales
    const { generaVRM } = await import(pathToFileURL(path.join(RAIZ, "tuberia", "avatares", "sintetico.mjs")).href);
    const { construye } = await import(pathToFileURL(path.join(RAIZ, "tuberia", "avatares", "construye.mjs")).href);
    const origen = propia("avatares-p7d-origen"), salidaAv = path.join(RAIZ, "pruebas", "salida", "avatares-p7d");
    fs.rmSync(salidaAv, { recursive: true, force: true });
    const lic = { "CC0-1.0": { spdx: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" }, "CC-BY-4.0": { spdx: "CC-BY-4.0", url: "https://creativecommons.org/licenses/by/4.0/" } };
    for (const [id, nombre, spdx, camisa] of [["sintetico-uno", "Sintético uno", "CC0-1.0", "#3f7cc2"], ["sintetico-dos", "Sintético dos", "CC-BY-4.0", "#3f7f5a"]]) {
      fs.writeFileSync(path.join(origen, id + ".vrm"), generaVRM({ subdivision: 8, pixeles: 256 }));
      fs.writeFileSync(path.join(origen, id + ".avatar.json"), JSON.stringify({ id, nombre, descripcion: "Avatar sintético para las pruebas, " + nombre.toLowerCase() + ".", autor: "pruebas", licencia: lic[spdx], fuente: { nombre: "generado por tuberia/avatares/sintetico.mjs" }, colores_muneco: { camisa, piel: "#d9a47c", sombrero: "gorra" } }));
    }
    const res = await construye({ origen, salida: salidaAv, compresion: "cuantizacion" });
    assert.deepStrictEqual(res.rechazados || [], [], "el catálogo sintético se construye");
    const cat = JSON.parse(fs.readFileSync(path.join(salidaAv, "catalogo.json"), "utf8"));
    cat.avatares.find(a => a.id === "sintetico-dos").licencia.credito_obligatorio = true;
    cat.avatares.find(a => a.id === "sintetico-dos").licencia.texto_credito = "«Sintético dos» de pruebas, CC BY 4.0.";
    fs.writeFileSync(path.join(salidaAv, "catalogo.json"), JSON.stringify(cat));
    process.env.GEMELO_AVATARES = salidaAv; previo.GEMELO_AVATARES = undefined;

    const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs"), comun = await imp("_comun.mjs"), { HOGARES } = await imp("siembra.mjs");
    bajar = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() === "";
    await levanta();
    const p = comun.puertos(), base = "https://localhost:" + p.https, buzon = "http://127.0.0.1:" + p.correoWeb, yo = HOGARES[2];   // Mirlo: ningún otro e2e lo usa a la vez
    assert.strictEqual(p.https, 8843, "el puerto propio");
    // el hogar vuelve a su primer acceso (el volumen de la base se conserva entre pasadas)
    const Pg = require(path.join(HERR, "node_modules", "pg")), k = new Pg.Client({ host: "127.0.0.1", port: p.db, database: "gemelo", user: comun.PG_DUENO, password: process.env.GEMELO_DEV_PG_CLAVE });
    await k.connect();
    try { await k.query("UPDATE hogares SET normas_version = NULL, normas_aceptadas_en = NULL WHERE correo = $1", [yo.correo]); await k.query("DELETE FROM avatares WHERE hogar_id = (SELECT id FROM hogares WHERE correo = $1)", [yo.correo]); } finally { await k.end(); }
    const antes = (await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo))).json()).messages_count;
    const nav = await lanza();
    try {
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
      await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
      const pg = await ctx.newPage(), errores = [];
      pg.on("pageerror", e => errores.push(String(e)));
      await pg.goto(base + "/"); await pg.waitForSelector("html[data-listo]");
      const post = await pg.evaluate(async c => (await fetch("/api/auth/enlace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ correo: c }) })).status, yo.correo);
      assert.strictEqual(post, 202);
      let msg = null;
      for (let i = 0; i < 100 && !msg; i++) {
        const b = await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo))).json();
        if (b.messages_count > antes) msg = b.messages[0]; else await new Promise(ok => setTimeout(ok, 200));
      }
      assert.ok(msg, "el enlace no llegó");
      const enlace = (/(https:\/\/localhost:\d+\/api\/auth\/entrar\?t=[A-Za-z0-9_-]{43})/.exec((await (await fetch(buzon + "/api/v1/message/" + msg.ID)).json()).Text) || [])[1];
      await pg.goto(enlace);
      await Promise.all([pg.waitForURL(base + "/#bienvenida"), pg.click("button[type=submit]")]);
      for (const id of ["#cPriv", "#cNormas", "#cAdulto"]) await pg.check(id);
      await pg.click("#fBienvenida button[type=submit]");
      await pg.waitForSelector("#t-alias", { state: "visible" });
      await pg.click("#fAlias button[type=submit]");
      await pg.waitForSelector("#t-avatar", { state: "visible" });
      // la galería: el muñeco y los dos del catálogo, como radios con nombre y descripción; el teclado los recorre
      await pg.waitForSelector("#galeria input[type=radio]");
      const opciones = await pg.$$eval("#galeria label", ls => ls.map(l => l.textContent));
      assert.strictEqual(opciones.length, 3); assert.match(opciones[0], /Muñeco de bloque/); assert.match(opciones[2], /Sintético dos.*Avatar sintético/);
      assert.ok(await pg.isVisible("#bloqueMuneco"), "con el muñeco elegido, sus colores");
      const alto = await pg.$eval("#galeria label:nth-child(2) > span", e => e.getBoundingClientRect().height);
      assert.ok(alto >= 44, "objetivo de ≥ 44 px: " + alto);
      await pg.focus("#galeria input:checked");
      await pg.keyboard.press("ArrowDown");   // teclado: el siguiente radio se elige solo
      assert.strictEqual(await pg.$eval("#galeria input:checked", e => e.value), "sintetico-uno");
      // vista previa 3D: el lienzo sustituye al muñeco cuando el VRM carga (SwiftShader, lento)
      await pg.waitForSelector("#avatar3d:not([hidden])", { timeout: 120000 });
      await pg.waitForFunction(() => document.getElementById("avatarPrev").hasAttribute("hidden") && !document.getElementById("giro").hasAttribute("hidden"), null, { timeout: 120000 });
      assert.ok(!(await pg.isVisible("#bloqueMuneco")), "con un VRM elegido, los colores del muñeco se ocultan");
      assert.ok(await pg.isVisible("#giroPausa") && (await pg.getAttribute("#giroPausa", "aria-pressed")) === "false");
      await pg.click("#giroPausa");
      assert.strictEqual(await pg.getAttribute("#giroPausa", "aria-pressed"), "true", "parar el giro");
      await pg.click("#giroDer");
      assert.deepStrictEqual(errores, [], "sin errores de página");
      // el segundo
      await pg.check("#galeria input[value=sintetico-dos]");
      // créditos: el de CC BY aparte, con enlace https
      await pg.click("#fAvatar a[href='#creditos']");
      await pg.waitForSelector("#t-creditos", { state: "visible" });
      await pg.waitForSelector("#creditosObligatorios:not([hidden])");
      assert.match(await pg.textContent("#listaCredObl"), /Sintético dos/); assert.match(await pg.textContent("#listaCredLib"), /Sintético uno/);
      assert.strictEqual(await pg.getAttribute("#listaCredObl a", "href"), "https://creativecommons.org/licenses/by/4.0/");
      assert.match(await pg.getAttribute("#listaCredObl a", "rel"), /noopener/);
      await pg.goBack();
      await pg.waitForSelector("#t-avatar", { state: "visible" });
      await pg.waitForSelector("#galeria input[type=radio]");
      // Listo: se guarda y se lee de vuelta por la api
      await pg.check("#galeria input[value=sintetico-dos]");
      const [put] = await Promise.all([pg.waitForResponse(x => new URL(x.url()).pathname === "/api/yo/avatar" && x.request().method() === "PUT"), pg.click("#fAvatar button[type=submit]")]);
      assert.strictEqual(put.status(), 204);
      assert.strictEqual(put.request().postDataJSON().vrm, "sintetico-dos");
      await pg.waitForSelector("#btnSeguir", { state: "visible" });
      const leido = await pg.evaluate(async () => (await fetch("/api/yo/avatar")).json());
      assert.strictEqual(leido.vrm, "sintetico-dos"); assert.deepStrictEqual(Object.keys(leido).sort(), ["camisa", "piel", "sombrero", "vrm"]);
      // Configuración: «Mi avatar» lo trae marcado
      await pg.click("a[href='#avatar']");
      await pg.waitForSelector("#t-avatar", { state: "visible" });
      await pg.waitForSelector("#galeria input[type=radio]");
      assert.strictEqual(await pg.$eval("#galeria input:checked", e => e.value), "sintetico-dos", "Configuración muestra el elegido");
      assert.ok(await pg.isVisible("#volverAvatar") && !(await pg.isVisible("#pasosAvatar")), "fuera del primer acceso: «Volver» y sin pasos");
      // a 390 px sin desbordar
      const anchos = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(anchos[0] <= anchos[1], "a 390 px desborda: " + anchos.join(" > "));
      // «Muñeco de bloque» vuelve a quitar el VRM
      await pg.check("#galeria input[value='']");
      await Promise.all([pg.waitForResponse(x => new URL(x.url()).pathname === "/api/yo/avatar" && x.request().method() === "PUT"), pg.click("#fAvatar button[type=submit]")]);
      assert.strictEqual((await pg.evaluate(async () => (await fetch("/api/yo/avatar")).json())).vrm, null);
      // 0 violaciones de CSP (la de dev es Report-Only: el navegador las anota igual) y nada en línea
      const l = await pg.evaluate(() => ({ csp: window.__csp.slice(), estilos: document.querySelectorAll("[style]").length }));
      assert.deepStrictEqual(l.csp, [], "violaciones de CSP");
      assert.strictEqual(l.estilos, 0, "sin style en línea");
      assert.deepStrictEqual(errores, []);
      await ctx.close();
    } finally { await nav.close(); }
  } finally {
    try { if (bajar) (await imp("para.mjs")).para(); } finally {
      for (const [k, v] of Object.entries(previo)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      await sueltaTurno();
    }
  }
});
