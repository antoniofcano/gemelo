"use strict";
// La oficina, OF7: la sección Olivos (apps/web/oficina/olivos.js y olivos_puro.js, doc/sistema/OFICINA.md §9.2). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen (CSP estricta), DOM con textContent, solo rutas de la oficina que están en el contrato;
//  - los límites de la oficina son los de contratos/config.schema.json y los de ConfigPuro.LIMITES del motor (la oficina no puede importar la IIFE del motor),
//    y los máximos de gafas, los VR_PERFILES[].tri de 29_vr.js (en gafas solo bajan);
//  - la validación de la pantalla dice lo mismo que la de la api (esquema + e1 ≤ e0/1,5 + e2 ≤ e1/1,5): se contrasta con valores al azar;
//  - las cuentas: del cuerpo del contrato a la pantalla y vuelta (lo que falta vale lo de hoy; las épocas y los parámetros de componentes se conservan),
//    el recuento de cambios, la vista previa simulada y qué se puede hacer con cada versión del historial.
// Opcional (GEMELO_DOCKER=1): recorrido en Chrome contra la api REAL con PostGIS en un contenedor (Testcontainers, NO el entorno de la persona):
// mover deslizadores, validar, guardar, publicar en prueba y para todos, volver y llevar al borrador, interruptores de componentes, con la CSP de Caddy impuesta.
const test = require("node:test"), assert = require("node:assert");
const { spawn, spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const html = lee("apps/web/oficina/index.html");
const fuentes = { "olivos.js": lee("apps/web/oficina/olivos.js"), "olivos_puro.js": lee("apps/web/oficina/olivos_puro.js"), "oficina.js": lee("apps/web/oficina/oficina.js") };
const json = f => JSON.parse(lee(f));
const ESQ = json("contratos/config.schema.json"), EJ = json("contratos/config-ejemplo.json");
const importa = f => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", f)).href);

test("nada en línea ni de otro origen; todo con textContent; solo rutas de la oficina que están en el contrato", () => {
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
  }
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=/i.test(html));
  const openapi = lee("contratos/api.openapi.yaml"), js = fuentes["olivos.js"];
  for (const r of ["/api/admin/config", "/api/admin/config/{version}", "/api/admin/config/{version}/prueba", "/api/admin/config/{version}/publicar", "/api/admin/config/{version}/retirar",
    "/api/admin/config/{version}/volver"]) assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  const usadas = [...js.matchAll(/api\("([A-Z]+)", "(\/api\/[^"?]*)"/g)].map(m => m[2]);
  assert.ok(usadas.length >= 5);
  for (const u of usadas) assert.match(u, /^\/api\/admin\/config/, "solo la configuración: " + u);
  assert.match(js, /\/publicar"\)\)/, "publicar pasa por conConfirmacion (confirmación reciente, ADR-0024)");
  assert.match(js, /conConfirmacion\(\(\) => api\("POST", "\/api\/admin\/config\/" \+ f\.version \+ "\/volver"\)\)/, "volver también");
});

test("la sección está en la barra lateral y en la página, con sus pestañas y la rotulación de «ilustrativo»", () => {
  assert.match(fuentes["oficina.js"], /\["olivos", "🫒", "Olivos", true\]/);
  assert.match(fuentes["oficina.js"], /import \{ iniciaOlivos \} from "\.\/olivos\.js"/);
  assert.match(fuentes["oficina.js"], /if \(sec === "olivos"\) olivos\.abre\(\)/);
  for (const id of ["s-olivos", "oPestanas", "oForm", "oLienzo", "oMsgs", "oGuarda", "oPrueba", "oProbar", "oPublica", "oHis", "oComp", "p-esc", "p-com", "p-his"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /ilustrativo: simulación, no mide nada/);
  assert.match(html, /<label for="oMeter"/);
  assert.match(fuentes["olivos.js"], /role: "tab"/);
});

test("los límites de la oficina son los del esquema y los del motor; los máximos de gafas, los del código", async () => {
  const P = await importa("olivos_puro.js");
  const motor = lee("apps/web/motor/02c_componentes.js");
  const ini = motor.indexOf("// [puro:inicio]"), fin = motor.indexOf("// [puro:fin]");
  const { ConfigPuro } = new Function("\"use strict\";\n" + motor.slice(ini, fin) + "\nreturn { ConfigPuro };")();
  const VR_TRI = [...lee("apps/web/motor/29_vr.js").match(/var VR_PERFILES = \[(.*?)\];/)[1].matchAll(/tri: (\d+)/g)].map(m => Number(m[1]));
  assert.deepStrictEqual(P.GAFAS_MAX, VR_TRI, "los máximos de gafas son los VR_PERFILES[].tri del código");
  const esc = ESQ.properties.escalera.properties, vistos = new Set();
  const nodo = ruta => ruta.split(".").slice(1).reduce((n, c) => (/^\d+$/.test(c) ? n.prefixItems[Number(c)] : (n.properties || {})[c]), { properties: esc });
  for (const p of P.PARAMS) {
    const n = nodo(p.ruta); assert.ok(n, p.ruta + " está en el esquema");
    assert.deepStrictEqual([p.min, p.max], [n.minimum, n.maximum], p.ruta + ": límites del esquema");
    assert.strictEqual(n.type === "integer", !!p.entero, p.ruta + ": entero o no");
    if (p.def !== null) { assert.ok(p.def >= p.min && p.def <= p.max, p.ruta + ": el valor de hoy cabe en sus límites"); }
    const L = ConfigPuro.LIMITES[p.ruta] || ConfigPuro.LIMITES[p.ruta.replace(/\.\d+$/, "")];
    assert.ok(L, p.ruta + " tiene límites en el motor");
    if (!/gafas\.\d$/.test(p.ruta)) assert.deepStrictEqual([p.min, p.max], [L[0], L[1]], p.ruta + ": límites del motor");
    else { assert.strictEqual(p.min, L[0]); assert.ok(p.max <= L[1]); assert.strictEqual(p.max, p.def, "en gafas el máximo es el de hoy"); }
    vistos.add(p.ruta.replace(/\.\d$/, ""));
  }
  assert.deepStrictEqual([...vistos].sort(), Object.keys(ConfigPuro.LIMITES).sort(), "ni un parámetro de más ni de menos");
});

test("los interruptores de componentes son ids de manifiestos que existen en el motor", async () => {
  const P = await importa("olivos_puro.js");
  const motor = fs.readdirSync(path.join(RAIZ, "apps", "web", "motor")).filter(f => f.endsWith(".js")).map(f => lee("apps/web/motor/" + f)).join("\n");
  for (const c of P.COMPONENTES) assert.ok(new RegExp('id: "' + c.id + '", version').test(motor), c.id + " es un componente del motor");
  assert.strictEqual(new Set(P.COMPONENTES.map(c => c.id)).size, P.COMPONENTES.length);
});

test("la validación de la pantalla dice lo mismo que la de la api (esquema + reglas entre campos), con valores al azar", async () => {
  const P = await importa("olivos_puro.js");
  const Ajv2020 = require("ajv/dist/2020").default, v = new Ajv2020({ strict: true, strictRequired: false, allErrors: true }).compile(ESQ);
  const api = cuerpo => { if (!v(cuerpo)) return false; const u = cuerpo.escalera && cuerpo.escalera.umbralesPx; return !(u && (u.e1 > u.e0 / 1.5 || u.e2 > u.e1 / 1.5)); };
  assert.deepStrictEqual(P.valida(P.defectos()), [], "lo de hoy vale");
  let n = 0, buenos = 0, malos = 0;
  const alea = P.semilla(99);
  for (let i = 0; i < 600; i++) {
    const vals = P.defectos();
    for (const p of P.PARAMS) {
      if (alea() < 0.6) continue;
      // un poco fuera de límites y a veces con decimales donde no caben: lo que una mano torpe (o un cliente roto) podría mandar
      const x = p.min - (p.max - p.min) * 0.1 + alea() * (p.max - p.min) * 1.2;
      vals[p.k] = p.entero && alea() < 0.9 ? Math.round(x) : P.redondea(x, p);
    }
    if (alea() < 0.3) { vals.u0 = 300 + Math.round(alea() * 1700); vals.u1 = Math.min(1000, Math.max(100, Math.round(vals.u0 / (1.2 + alea())))); vals.u2 = Math.round(Math.max(30, Math.min(400, vals.u1 / (1.2 + alea())))); }
    const cuerpo = P.aCuerpo(vals, {}, null), mia = P.valida(vals).length === 0, suya = api(cuerpo);
    assert.strictEqual(mia, suya, "valores " + JSON.stringify(vals) + " → pantalla " + mia + ", api " + suya + " " + JSON.stringify(v.errors || []));
    n++; if (suya) buenos++; else malos++;
  }
  assert.ok(buenos > 20 && malos > 20, "el azar prueba las dos caras (" + buenos + " buenos, " + malos + " malos de " + n + ")");
  const m = P.valida({ ...P.defectos(), u1: 600 }).map(x => x.texto);
  assert.deepStrictEqual(m, ["E1 debe ser ≤ E0 ÷ 1,5 (467 px)"]);
  assert.deepStrictEqual(P.valida({ ...P.defectos(), u1: 250, u2: 200 }).map(x => x.texto), ["E2 debe ser ≤ E1 ÷ 1,5 (167 px)"]);
  assert.strictEqual(P.valida({ ...P.defectos(), u0: 750, u1: 500 }).length, 0, "e1 = e0 / 1,5 exacto vale (la api usa «>»)");
  assert.match(P.valida({ ...P.defectos(), triG0: 380001 })[0].texto, /en gafas solo puede bajar/);
});

test("cuentas: del cuerpo a la pantalla y vuelta; lo que falta vale lo de hoy; épocas y parámetros de componentes se conservan", async () => {
  const P = await importa("olivos_puro.js");
  assert.deepStrictEqual(P.aCuerpo(P.defectos(), {}, null), { v: 1 }, "sin cambios, nada que escribir");
  const x = P.desdeCuerpo(EJ);
  assert.strictEqual(x.vals.u0, 800); assert.strictEqual(x.vals.maxPG, 3); assert.deepStrictEqual([x.vals.triG0, x.vals.triG3], [340000, 120000]); assert.strictEqual(x.vals.hist, 0.1);
  assert.deepStrictEqual(x.comp, { "fichas-tiempo": true, "ejemplo-apagado": false });
  const de = P.desdeCuerpo({ v: 1 }); assert.deepStrictEqual(de.vals, P.defectos()); assert.strictEqual(de.vals.maxPG, null);
  const otra = P.aCuerpo(x.vals, x.comp, EJ);
  assert.deepStrictEqual(otra.epocas, EJ.epocas, "las épocas (OF9) no se tocan");
  assert.deepStrictEqual(otra.componentes["ejemplo-apagado"], EJ.componentes["ejemplo-apagado"], "los parámetros de un componente se conservan");
  assert.deepStrictEqual(P.desdeCuerpo(otra), x, "ida y vuelta");
  const Ajv2020 = require("ajv/dist/2020").default, v = new Ajv2020({ strict: true, strictRequired: false, allErrors: true }).compile(ESQ);
  assert.ok(v(otra), JSON.stringify(v.errors));
  // solo lo que se aparta de hoy; los tres umbrales o ninguno; los cuatro perfiles de gafas o ninguno
  const t = { ...P.defectos(), u0: 900, triG2: 100000, maxPG: 2 };
  const c = P.aCuerpo(t, { juegos: false }, null);
  assert.deepStrictEqual(c, { v: 1, componentes: { juegos: { activo: false } }, escalera: { umbralesPx: { e0: 900, e1: 250, e2: 90 }, maxPropiosGafas: 2, triangulos: { gafas: [380000, 270000, 100000, 130000] } } });
  assert.ok(v(c));
  assert.deepStrictEqual(P.cambios(t, P.defectos()).sort(), ["maxPG", "triG2", "u0"]);
  assert.deepStrictEqual(P.cambiosComp({ juegos: false, a: true }, { a: true, b: false }), ["b", "juegos"]);
  assert.ok(P.mismosValores(t, { ...t }) && !P.mismosValores(t, P.defectos()) && P.mismosComp({ a: 1 }, { a: 1 }) && !P.mismosComp({ a: true }, {}));
  assert.strictEqual(P.resumen(P.defectos(), {}), "todo por defecto");
  assert.strictEqual(P.resumen(t, { juegos: false }), "umbral e0 900 px · máx. propios en gafas 2 · presupuesto gafas, perfil 2 100 k · juegos apagado");
  assert.strictEqual(P.redondea(0.1 + 0.2, P.PARAM.banda), 0.3);
  assert.strictEqual(P.formatea("triEsc", 550000), "550 k"); assert.strictEqual(P.formatea("hist", 0.08), "8 %"); assert.strictEqual(P.formatea("banda", 1.5), "1,5 ± m"); assert.strictEqual(P.formatea("maxPG", null), "como escritorio");
});

test("vista previa simulada: lo de hoy cabe en cada aparato; unos umbrales muy exigentes acercan las fronteras (s > 1); las gafas ponen menos E0", async () => {
  const P = await importa("olivos_puro.js"), d = P.defectos();
  for (const [ap, perfil] of [["esc", 0], ["movil", 0], ["gafas", 0], ["gafas", 3]]) {
    const R = P.simula(d, ap, perfil);
    assert.ok(R.tri <= R.tope && R.n.reduce((a, b) => a + b) === P.CAMPO.length, ap + " " + perfil + ": cabe y cuenta todos los olivos");
    assert.ok(R.n[0] + R.n[1] <= R.maxP, ap + ": respeta los propios");
  }
  assert.strictEqual(P.simula(d, "gafas", 0).maxP, 4, "sin valor propio, las gafas topan a 4 (lo del límite del contrato)");
  const duro = P.simula({ ...d, u0: 300, u1: 100, u2: 30, triEsc: 300000 }, "esc", 0);
  assert.ok(duro.s > 1.05, "con umbrales bajos y poco presupuesto el aparato acerca las fronteras: s = " + duro.s);
  assert.ok(P.avisosPrevia(duro, "esc").some(m => /acerca todas las fronteras/.test(m.texto)));
  assert.ok(P.simula({ ...d, triG0: 50000 }, "gafas", 0).s > P.simula(d, "gafas", 0).s, "bajar el presupuesto de gafas sube s");
  assert.deepStrictEqual(P.simula(d, "esc", 0), P.simula(d, "esc", 0), "determinista");
});

test("historial: qué se puede hacer con cada versión", async () => {
  const P = await importa("olivos_puro.js");
  assert.deepStrictEqual(P.acciones("borrador"), { volver: false, alBorrador: true, retirar: true }, "un borrador no se publica volviendo a él (la api lo rechaza)");
  assert.deepStrictEqual(P.acciones("en_prueba"), { volver: true, alBorrador: true, retirar: true });
  assert.deepStrictEqual(P.acciones("publicada"), { volver: false, alBorrador: true, retirar: false });
  assert.deepStrictEqual(P.acciones("retirada"), { volver: true, alBorrador: true, retirar: false });
  assert.deepStrictEqual(Object.keys(P.ESTADOS), ["borrador", "en_prueba", "publicada", "retirada"]);
});

// ——— recorrido en Chrome (opcional) ———
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "recorrido de Docker + Chrome opcional (GEMELO_DOCKER=1): la sección Olivos de la oficina contra la api real NO se ha comprobado" : null;

test("recorrido: deslizadores, validación, borrador, prueba, para todos, volver, al borrador y componentes (1280 y 1024 px, CSP impuesta)", { timeout: 900_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: Olivos NO se ha comprobado");
  if (!fs.existsSync(path.join(RAIZ, "apps", "api", "node_modules", "fastify")) || !fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "vite"))) return t.skip("faltan las dependencias de apps/api o apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-olivos-dist");
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
        else if (srv.exitCode !== null) { clearInterval(mira); clearTimeout(lim); mal(new Error("el servidor salió (" + srv.exitCode + "): " + errs)); }
      }, 500);
    });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const base = info.url, get = async r => (await fetch(base + r)).json();
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES", ignoreHTTPSErrors: true, permissions: [] });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*(401|403|404|409)/.test(m.text())) errores.push(m.text()); });
    await pg.goto(base + "/__prueba/aparato");
    const { url } = await get("/__prueba/enlace?para=" + encodeURIComponent(info.admin));
    await pg.goto(url);
    await pg.click("button[type=submit], input[type=submit]");
    await pg.waitForURL(/\/oficina\//, { timeout: 15_000 });
    await pg.goto(base + "/oficina/?prueba#olivos");
    await pg.waitForFunction(() => window.__olivos && window.__olivos().cargado, null, { timeout: 30_000 });
    const est = () => pg.evaluate(() => window.__olivos());
    const config = () => pg.evaluate(async () => (await fetch("/api/config")).json());
    const mueve = (k, v) => pg.evaluate(([k, v]) => { const e = document.querySelector("#r-" + k); e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); return e.value; }, [k, v]);
    const aviso = texto => pg.waitForSelector("#avisos .aviso:has-text('" + texto + "')", { timeout: 15_000 });
    const P = await importa("olivos_puro.js");

    // 0. sin nada publicado: lo de hoy, un slider por parámetro, con sus límites y la vista previa rotulada
    let e = await est();
    assert.strictEqual(e.publicada, null); assert.strictEqual(e.enPrueba, null); assert.deepStrictEqual(e.errores, []);
    assert.deepStrictEqual(e.vals, P.defectos());
    assert.strictEqual(await pg.locator(".param input[type=range]").count(), P.PARAMS.length);
    for (const p of P.PARAMS) assert.deepStrictEqual(await pg.evaluate(k => { const i = document.querySelector("#r-" + k); return [Number(i.min), Number(i.max)]; }, p.k), [p.min, p.max], p.k + ": los límites del deslizador");
    assert.match(await pg.textContent("#oEstado"), /nada publicado/);
    assert.match(await pg.textContent("#s-olivos .pill.p-ilustrativo"), /ilustrativo: simulación, no mide nada/);
    assert.ok((await pg.textContent("#oTriTxt")).startsWith("Triángulos de la escalera"));
    assert.strictEqual(await pg.isDisabled("#oPublica"), true, "para todos pide estar antes en prueba");
    assert.strictEqual(await pg.isDisabled("#oGuarda"), false);

    // 1. en gafas el máximo es el de hoy: no se puede subir (el navegador corta al máximo), y bajar sí
    assert.strictEqual(await mueve("triG0", 999999), "380000");
    assert.strictEqual(await mueve("triG0", 300000), "300000");
    assert.strictEqual((await est()).vals.triG0, 300000);
    await pg.selectOption("#oAparato", "gafas"); await pg.selectOption("#oPerfil", "0");
    assert.match(await pg.textContent("#oTriTxt"), /de 300\.000 \(gafas, perfil 0\)/, "la vista previa de gafas usa el presupuesto bajado");

    // 2. la validación: E1 por encima de E0 / 1,5 → mensaje y nada se puede guardar ni publicar
    await mueve("u1", 600);
    assert.match(await pg.textContent("#oMsgs"), /E1 debe ser ≤ E0 ÷ 1,5 \(467 px\)/);
    for (const id of ["#oGuarda", "#oPrueba", "#oProbar", "#oPublica"]) assert.strictEqual(await pg.isDisabled(id), true, id + " deshabilitado con un valor que la api rechazaría");
    await mueve("u1", 250);
    assert.deepStrictEqual((await est()).errores, []);
    assert.strictEqual(await pg.isDisabled("#oGuarda"), false);
    await mueve("u2", 200);
    assert.match(await pg.textContent("#oMsgs"), /E2 debe ser ≤ E1 ÷ 1,5 \(167 px\)/);
    await mueve("u2", 90);

    // 3. un umbral que no cabe en el presupuesto: la vista previa avisa del factor s (ilustrativo)
    await mueve("u0", 300); await mueve("u1", 100); await mueve("u2", 30); await mueve("triEsc", 300000); await pg.selectOption("#oAparato", "esc");
    assert.match(await pg.textContent("#oMsgsPrevia"), /acerca todas las fronteras/);
    await mueve("u0", 900); await mueve("u1", 250); await mueve("u2", 90); await mueve("triEsc", 550000);
    assert.ok((await pg.getAttribute("#par-u0", "class")).includes("cambiado"), "lo que se aparta de lo publicado se marca");
    assert.match(await pg.textContent("#oEstado"), /borrador: 2 cambios/, "el umbral E0 y el presupuesto de gafas");

    // 4. guardar borrador: una versión nueva en borrador (no la ve nadie)
    await pg.click("#oGuarda"); await aviso("Borrador v1 guardado");
    e = await est(); assert.deepStrictEqual(e.versiones.map(v => [v.version, v.estado]), [[1, "borrador"]]);
    assert.deepStrictEqual((await config()).config, { v: 1 }, "un borrador no se sirve a nadie");
    await pg.click("#oGuarda"); await aviso("Ya estaba guardado como borrador v1");
    assert.strictEqual((await est()).versiones.length, 1, "guardar lo mismo otra vez no crea otra versión");

    // 5. publicar en prueba: solo las cuentas de oficina la cargan
    await pg.click("#oPrueba"); await aviso("v1 en prueba");
    e = await est(); assert.strictEqual(e.enPrueba, 1); assert.strictEqual(e.publicada, null);
    const c1 = await config();
    assert.strictEqual(c1.version, 1); assert.strictEqual(c1.estado, "en_prueba");
    assert.deepStrictEqual(c1.config.escalera.umbralesPx, { e0: 900, e1: 250, e2: 90 });
    assert.deepStrictEqual(c1.config.escalera.triangulos.gafas, [300000, 270000, 190000, 130000]);
    assert.strictEqual(await pg.isDisabled("#oPublica"), false, "lo que está en prueba se puede publicar para todos");
    assert.strictEqual(await pg.isDisabled("#oPrueba"), true, "ya está en prueba");
    // sin la sesión de oficina (nadie): la api de la familia no recibe la prueba. Lo comprueba la prueba de la api; aquí, que sigue sin publicada.
    assert.match(await pg.textContent("#oEstado"), /en prueba v1 \(solo cuentas de oficina\)/);

    // 6. cambiar algo después de la prueba: ya no se puede publicar para todos (son otros valores)
    await mueve("banda", 2);
    assert.strictEqual(await pg.isDisabled("#oPublica"), true);
    assert.match(await pg.textContent("#oNotaPub"), /no son los de la prueba \(v1\)/);
    await mueve("banda", 1.5);
    assert.strictEqual(await pg.isDisabled("#oPublica"), false);

    // 7. publicar para todos: con confirmación (y la reciente, ya gestionada por el cliente)
    await pg.click("#oPublica");
    await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfTexto"), /Umbral E0: 700 px → 900 px/);
    assert.match(await pg.textContent("#dlgConfTexto"), /Presupuesto gafas, perfil 0: 380 k → 300 k/);
    await pg.click("#dlgConfSi"); await aviso("v1 publicada");
    e = await est(); assert.strictEqual(e.publicada, 1); assert.strictEqual(e.enPrueba, null);
    assert.strictEqual((await config()).estado, "publicada");
    assert.match(await pg.textContent("#oEstado"), /publicada v1/);
    assert.match(await pg.textContent("#oEstado"), /sin cambios respecto a lo publicado/);

    // 8. v2: otro cambio, por la misma vía (borrador → prueba → para todos); la v1 queda retirada
    await mueve("u0", 1100);
    await pg.click("#oPrueba"); await aviso("v2 en prueba");
    await pg.click("#oPublica"); await pg.waitForSelector("#dlgConfirma[open]"); await pg.click("#dlgConfSi"); await aviso("v2 publicada");
    e = await est(); assert.strictEqual(e.publicada, 2);
    assert.deepStrictEqual(e.versiones.map(v => [v.version, v.estado]), [[2, "publicada"], [1, "retirada"]]);

    // 9. historial: volver a la v1 publica una COPIA como versión nueva; al borrador copia los valores a la pantalla
    await pg.click("#t-his");
    assert.strictEqual(await pg.locator("#oHis tr").count(), 2);
    await pg.waitForFunction(() => !document.querySelector("#oHis").textContent.includes("…"));
    assert.match(await pg.textContent("#oHis tr[data-version='1']"), /umbral e0 900 px/);
    assert.strictEqual(await pg.locator("#oHis tr[data-version='2'] button:has-text('Volver a esta')").count(), 0, "la publicada no se «vuelve»");
    await pg.click("#oHis tr[data-version='1'] button:has-text('Al borrador')");
    await aviso("Los valores de v1 están en el borrador");
    e = await est(); assert.strictEqual(e.pestana, "esc"); assert.strictEqual(e.vals.u0, 900); assert.strictEqual(e.publicada, 2, "al borrador no publica nada");
    await mueve("u0", 1100);   // de vuelta a lo publicado
    await pg.click("#t-his");
    await pg.click("#oHis tr[data-version='1'] button:has-text('Volver a esta')");
    await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfTexto"), /versión nueva/);
    await pg.click("#dlgConfSi"); await aviso("publicada como v3");
    e = await est(); assert.strictEqual(e.publicada, 3);
    assert.deepStrictEqual(e.versiones.slice(0, 3).map(v => [v.version, v.estado, v.copia_de]), [[3, "publicada", 1], [2, "retirada", null], [1, "retirada", null]]);
    const c3 = await config(); assert.strictEqual(c3.version, 3); assert.strictEqual(c3.config.escalera.umbralesPx.e0, 900);
    assert.strictEqual(e.vals.u0, 900, "el editor sigue lo publicado");

    // 10. interruptores de componentes (misma mecánica de versiones)
    await pg.click("#t-com");
    assert.strictEqual(await pg.locator("#oComp select").count(), P.COMPONENTES.length);
    await pg.selectOption("#c-juegos", "no");
    assert.deepStrictEqual((await est()).comp, { juegos: false });
    assert.match(await pg.textContent("#oEstado"), /borrador: 1 cambio/);
    await pg.click("#oPrueba"); await aviso("v4 en prueba");
    const c4 = await config(); assert.strictEqual(c4.estado, "en_prueba"); assert.deepStrictEqual(c4.config.componentes, { juegos: { activo: false } });
    assert.deepStrictEqual(c4.config.escalera.umbralesPx, { e0: 900, e1: 250, e2: 90 }, "los parámetros de la escalera siguen en la versión nueva");
    await pg.click("#oPublica"); await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfTexto"), /Juegos: por defecto → apagado/);
    await pg.click("#dlgConfSi"); await aviso("v4 publicada");
    assert.strictEqual((await config()).config.componentes.juegos.activo, false);

    // 11. «Probar en el mundo»: abre /finca/ en otra pestaña con la versión en prueba (para la oficina)
    await pg.click("#t-esc"); await mueve("maxV", 32);
    const [popup] = await Promise.all([ctx.waitForEvent("page"), pg.click("#oProbar")]);
    await popup.waitForURL(/\/finca\/\?debug$/, { timeout: 15_000 });
    e = await est(); assert.strictEqual(e.enPrueba !== null, true, "para probar, antes se deja en prueba");
    assert.strictEqual((await config()).config.escalera.maxVariantes, 32, "la sesión de oficina recibe lo que se prueba");
    await popup.close();

    // 12. a 1280 y 1024: sin desbordes, con capturas
    const salidaCap = process.env.GEMELO_CAPTURAS || propia("oficina-olivos-capturas");
    fs.mkdirSync(salidaCap, { recursive: true });
    for (const ancho of [1280, 1024]) {
      await pg.setViewportSize({ width: ancho, height: 900 });
      for (const [pest, tab] of [["esc", "#t-esc"], ["com", "#t-com"], ["his", "#t-his"]]) {
        await pg.click(tab); await pg.waitForTimeout(250);
        assert.ok((await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "a " + ancho + " px hay desborde horizontal en " + pest);
        assert.ok((await pg.evaluate(() => { const m = document.querySelector("main"); return m.scrollWidth - m.clientWidth; })) <= 0, "a " + ancho + " px main desborda en " + pest);
        await pg.screenshot({ path: path.join(salidaCap, "olivos-" + pest + "-" + ancho + ".png") });
      }
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
