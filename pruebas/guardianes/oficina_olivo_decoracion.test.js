"use strict";
// La oficina, D5 (P7g): ver y RETIRAR decoraciones desde la ficha del olivo (apps/web/oficina/olivo_ficha_puro.js y olivo_ficha.js; decisión 178: la oficina solo ve y
// retira, no pone; doc/sistema/OFICINA.md §4 y doc/sistema/DECORACIONES.md).
// Siempre, y sin red ni Chrome:
//  - cuándo se ofrece «Retirar» (personalización visible con decoración) y cuándo «Restaurar» (retirada y con su pieza); nunca sin decoración ni sin id válido;
//  - el cuerpo de la petición (motivo de la lista corta + nota, recortado a 200, sin controles) y los textos;
//  - estática: <dialog> nativo (el de confirma()), DOM con h()/textContent, las rutas exactas, ningún botón de «poner» una decoración, y las rutas existen en el contrato;
// Opcional (GEMELO_DECO_CHROME=1, por el banco: un solo Chrome a la vez): la oficina construida con la api SIMULADA (page.route): retirar con diálogo y motivo (cuerpo
// {motivo}), la ficha se relee y dice «retirado por la oficina», restaurar, y los fallos 403 y 404 en la región viva.
// NO prueba: la api real ni PostGIS (pruebas/integracion/decoraciones.test.ts), el aviso a la familia (lo manda la api), la tableta, un lector de pantalla ni Chrome real.
const test = require("node:test"), assert = require("node:assert");
const http = require("http");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, fs, path } = require("./_util");

const ficha = lee("apps/web/oficina/olivo_ficha.js"), puro = lee("apps/web/oficina/olivo_ficha_puro.js");
const importa = f => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", f)).href);
const PERS = (extra = {}) => ({ personalizacion_id: 5, estado: "visible", nombre: null, decoracion: { id: "farolillo", nombre: "Farolillo", epoca: "otono" }, objeto: null, ...extra });
const FICHA = (p, extra = {}) => ({ finca: "hituelo", copas_id: 101, posicion: { e: 440010, n: 4190020 }, altura_m: 5.2, tipo: -1,
  haza: { id: 3, codigo: "H-01", titular: { hogar_id: 7 } }, personalizacion: p, ...extra });

test("cuándo se ofrece retirar o restaurar: solo con decoración y con un id válido", async () => {
  const P = await importa("olivo_ficha_puro.js");
  assert.deepStrictEqual(P.accionesDecoracion(FICHA(PERS())), { retirar: { id: 5, ruta: "/api/admin/personalizaciones/5/decoracion/retirar" }, restaurar: null });
  assert.deepStrictEqual(P.accionesDecoracion(FICHA(PERS({ estado: "retirado" }))), { retirar: null, restaurar: { id: 5, ruta: "/api/admin/personalizaciones/5/restaurar" } });
  const nada = { retirar: null, restaurar: null };
  assert.deepStrictEqual(P.accionesDecoracion(FICHA(null)), nada, "sin personalización");
  assert.deepStrictEqual(P.accionesDecoracion(FICHA(PERS({ decoracion: null, nombre: "La Abuela" }))), nada, "solo nombre: no hay decoración que retirar");
  assert.deepStrictEqual(P.accionesDecoracion(FICHA(PERS({ decoracion: null, estado: "retirado", objeto: { tipo: "foto", medio_id: 9 } }))), nada, "una foto retirada se restaura desde la bandeja");
  assert.deepStrictEqual(P.accionesDecoracion(FICHA(PERS({ personalizacion_id: 0 }))), nada);
  assert.deepStrictEqual(P.accionesDecoracion(FICHA(PERS({ personalizacion_id: "5" }))), nada, "el id es un entero");
  assert.deepStrictEqual(P.accionesDecoracion(FICHA(PERS({ estado: "otra" }))), nada);
  assert.deepStrictEqual(P.accionesDecoracion(null), nada);
  // una pieza que ya no está en el catálogo (nombre null) sigue siendo retirable: la oficina la quita aunque no se sepa su nombre
  assert.ok(P.accionesDecoracion(FICHA(PERS({ decoracion: { id: "vieja", nombre: null, epoca: null } }))).retirar);
});

test("el cuerpo de la petición: motivo de la lista corta, nota opcional, recortado a 200 y sin caracteres de control", async () => {
  const P = await importa("olivo_ficha_puro.js");
  assert.deepStrictEqual(P.cuerpoRetirar("familia"), { motivo: "A petición de la familia" });
  assert.deepStrictEqual(P.cuerpoRetirar("error", "  la puso   en\nel olivo\tequivocado "), { motivo: "Puesta por error o de prueba: la puso en el olivo equivocado" });
  assert.deepStrictEqual(P.cuerpoRetirar("no_existe", ""), { motivo: "Otro motivo" }, "un motivo desconocido cae en «otro»");
  assert.deepStrictEqual(P.cuerpoRetirar(undefined, null), { motivo: "Otro motivo" });
  const largo = P.cuerpoRetirar("otro", "x".repeat(500)).motivo;
  assert.strictEqual(largo.length, 200);
  for (const [k] of P.MOTIVOS_DECORACION) { const m = P.cuerpoRetirar(k).motivo; assert.ok(m.length >= 1 && m.length <= 200); }
  assert.deepStrictEqual(Object.keys(P.cuerpoRetirar("otro", "a")), ["motivo"], "el cuerpo solo lleva «motivo» (la api rechaza otros campos)");
});

test("los textos y los mensajes de fallo, en español y sin inventar", async () => {
  const P = await importa("olivo_ficha_puro.js");
  const t = P.textosDecoracion(FICHA(PERS()));
  assert.strictEqual(t.retirar, "Retirar la decoración");
  assert.strictEqual(t.restaurar, "Restaurar lo retirado");
  assert.match(t.dialogoTitulo, /«Farolillo»/);
  assert.match(P.textosDecoracion(FICHA(PERS({ decoracion: { id: "vieja", nombre: null, epoca: null } }))).dialogoTitulo, /«vieja»/);
  assert.match(t.dialogoCuerpo, /la familia recibirá un aviso/);
  assert.match(P.mensajeFallo({ estado: 403 }, "retirar"), /No tienes permiso para retirar/);
  assert.match(P.mensajeFallo({ estado: 403 }, "restaurar"), /No tienes permiso para restaurar/);
  assert.match(P.mensajeFallo({ estado: 404 }, "retirar"), /ya no se ve/);
  assert.match(P.mensajeFallo({ estado: 404 }, "restaurar"), /ya no está retirado/);
  assert.strictEqual(P.mensajeFallo({ estado: 500, mensaje: "Fallo del servidor" }, "retirar"), "Fallo del servidor");
  assert.strictEqual(P.mensajeFallo({ estado: 500 }, "retirar"), "No se pudo completar.");
});

test("estática: confirma() con su <dialog> nativo, DOM con h()/textContent, sin «poner», y las rutas existen en el contrato y en la api", () => {
  for (const [n, c] of [["olivo_ficha.js", ficha], ["olivo_ficha_puro.js", puro]]) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(c), n + ": DOM con h()/textContent");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
    assert.ok(!/"img"|<img|\/api\/medios/.test(c), n + ": sin imágenes (EIPD, decisión 165)");
  }
  assert.match(ficha, /import \{[^}]*\bconfirma\b[^}]*\} from "\.\/comun\.js"/, "el diálogo de confirmación es el común");
  assert.match(lee("apps/web/oficina/index.html"), /<dialog id="dlgConfirma"/);
  assert.match(ficha, /a\.retirar\.ruta, cuerpoRetirar\(motivo\.value, nota\.value\)/);
  assert.match(ficha, /api\("POST", a\.restaurar\.ruta\)/);
  assert.match(ficha, /id: "oDecoRetirar"/); assert.match(ficha, /id: "oDecoRestaurar"/);
  assert.match(ficha, /h\("p", \{ class: "error", role: "alert" \}\)/, "los fallos, en una región con role=alert");
  assert.match(lee("apps/web/oficina/index.html"), /id="oFicha" aria-live="polite"/);
  assert.ok(!/"\/api\/(me|vida)\/|decoracion\/poner|\/olivos\/[^"]*\/decoracion"/.test(ficha + puro), "la oficina no pone decoraciones (decisión 178)");
  assert.match(lee("apps/web/oficina/oficina.css"), /\.boton \{ min-height: var\(--toque\)/, "zona táctil de los botones");
  assert.match(lee("contratos/api.openapi.yaml"), /\/api\/admin\/personalizaciones\/\{id\}\/decoracion\/retirar:/);
  assert.match(lee("contratos/api.openapi.yaml"), /\/api\/admin\/personalizaciones\/\{id\}\/restaurar:/);
  assert.match(lee("apps/api/src/vida/rutas.ts"), /\/api\/admin\/personalizaciones\/:id\/decoracion\/retirar/);
  assert.match(lee("apps/api/src/admin/bandeja.ts"), /\/api\/admin\/personalizaciones\/:id\/restaurar/);
  assert.match(lee("apps/api/src/admin/olivos.ts"), /personalizacion_id: number; estado: "visible" \| "retirado"/, "la ficha ya trae el id y el estado: la api no cambia");
});

// ——— recorrido en Chrome con la api simulada (opcional, por el banco) ———
const SALTO = process.env.GEMELO_DECO_CHROME !== "1" ? "recorrido en Chrome opcional (GEMELO_DECO_CHROME=1, por el banco): retirar y restaurar decoraciones NO se ha comprobado en navegador" : null;

test("recorrido: retirar con diálogo y motivo, la ficha se relee; restaurar; y los fallos 403 y 404 en la región viva", { timeout: 600_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: NO se ha comprobado en navegador");
  if (!fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "ol"))) return t.skip("faltan las dependencias de apps/web (npm ci)");
  const { lanza } = require("./_navegador");
  const dist = propia("oficina-deco-dist");
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
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES" });
    const json = (r, cuerpo, estado = 200) => r.fulfill({ status: estado, contentType: "application/json", body: JSON.stringify(cuerpo) });
    let estado = "visible", falla = null;   // lo que dice la api simulada y un fallo forzado (403 | 404)
    const posts = [];
    await ctx.route("**/api/**", r => {
      const u = new URL(r.request().url()), p = u.pathname, m = r.request().method();
      if (p === "/api/oficina/sesion") return json(r, { rol: "oficina", aparato: { nombre: "prueba", estado: "ok" }, caduca_en: "2030-01-01T00:00:00Z", inactividad_min: 30, confirmacion_vigente: true });
      if (p === "/api/admin/olivos/hituelo/101") return json(r, FICHA(PERS({ estado })));
      if (m === "POST" && /^\/api\/admin\/personalizaciones\/5\/(decoracion\/retirar|restaurar)$/.test(p)) {
        posts.push({ p, cuerpo: r.request().postData() });
        if (falla === 403) return json(r, { error: "sin_permiso", mensaje: "No tienes permiso." }, 403);
        if (falla === 404) { estado = p.endsWith("restaurar") ? "visible" : "retirado"; return json(r, { error: "no_existe" }, 404); }
        estado = p.endsWith("restaurar") ? "visible" : "retirado";
        return r.fulfill({ status: 204, body: "" });
      }
      return json(r, {}, 404);
    });
    await ctx.route("**/teselas/**", r => json(r, {}, 404));
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    await pg.goto(base + "?prueba#olivo/hituelo/101");
    await pg.waitForSelector("#oDecoRetirar");
    assert.ok((await pg.locator("#oDecoRetirar").boundingBox()).height >= 44, "zona táctil de al menos 44 px");
    assert.strictEqual(await pg.locator("#oDecoRestaurar").count(), 0);
    // retirar: diálogo nativo con el motivo; cancelar devuelve el foco al botón y no manda nada
    await pg.locator("#oDecoRetirar").click();
    await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfT"), /«Farolillo»/);
    await pg.locator("#dlgConfNo").click();
    assert.strictEqual(await pg.evaluate(() => document.activeElement.id), "oDecoRetirar", "el foco vuelve al botón");
    assert.strictEqual(posts.length, 0);
    // un 403: el diálogo sigue abierto con el mensaje (role=alert)
    falla = 403;
    await pg.locator("#oDecoRetirar").click();
    await pg.selectOption("#oDecoMotivo", "error");
    await pg.fill("#oDecoNota", "olivo equivocado");
    await pg.locator("#dlgConfSi").click();
    await pg.waitForFunction(() => /No tienes permiso para retirar/.test(document.querySelector("#dlgConfError").textContent));
    assert.deepStrictEqual(JSON.parse(posts[0].cuerpo), { motivo: "Puesta por error o de prueba: olivo equivocado" });
    // ahora bien: la ficha se relee y dice «retirado por la oficina»; sale «Restaurar» y no «Retirar»
    falla = null;
    await pg.locator("#dlgConfSi").click();
    await pg.waitForSelector("#oDecoRestaurar");
    assert.match(await pg.textContent("#oFicha"), /retirado por la oficina/);
    assert.strictEqual(await pg.locator("#oDecoRetirar").count(), 0);
    assert.strictEqual(await pg.evaluate(() => document.activeElement.id), "oDecoRestaurar", "el foco, al botón que queda");
    assert.match(await pg.textContent("#anuncio"), /Decoración retirada/);
    // restaurar: un 404 (ya restaurada por otra persona) se explica y se relee; y luego un restaurar normal
    estado = "retirado"; falla = 404;
    await pg.locator("#oDecoRestaurar").click();
    await pg.waitForSelector("#oDecoRetirar");
    assert.match(await pg.textContent("#anuncio"), /ya no está retirado/);
    falla = null;
    await pg.locator("#oDecoRetirar").click();
    await pg.locator("#dlgConfSi").click();
    await pg.waitForSelector("#oDecoRestaurar");
    await pg.locator("#oDecoRestaurar").click();
    await pg.waitForSelector("#oDecoRetirar");
    assert.match(await pg.textContent("#oFicha"), /visible para las familias/);
    assert.deepStrictEqual(errores, []);
  } finally { await nav.close(); srv.close(); }
});
