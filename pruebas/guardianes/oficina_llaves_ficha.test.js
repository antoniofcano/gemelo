"use strict";
// Las llaves de acceso en la ficha de la oficina (OF13b-6, apps/web/oficina/ficha_llaves.js y familias.js). Siempre, y sin red ni Chrome:
//  - el módulo de la sección con un DOM de mentira (el `h` de comun.js sustituido por uno que arma árboles de objetos): la lista de una familia con sus
//    botones, las llaves de oficina en solo lectura con el aviso de «no descubrible», nada de material criptográfico y ninguna cadena tratada como HTML;
//  - estática: familias.js usa solo rutas del contrato, la baja de llaves pasa por la confirmación reciente, y el módulo no pone HTML a mano ni estilos en línea.
// NO probado en un navegador, ni con tableta ni lector de pantalla: el recorrido en Chrome con la api simulada está escrito y se lanza por el banco
// (GEMELO_DOCKER no hace falta: usa la api simulada; ver el último test, que se salta sin Chrome).
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, chrome, playwright, fs, path } = require("./_util");

/** Un `h` de mentira: {etiqueta, attrs, hijos} con los textos como cadenas; los onclick se guardan para pulsarlos. */
function h(etiqueta, atributos, ...hijos) {
  const nodo = { etiqueta, attrs: {}, hijos: [], nodeType: 1, append(...x) { for (const y of x.flat()) if (y !== null && y !== undefined && y !== false) nodo.hijos.push(y); } };
  for (const [k, v] of Object.entries(atributos || {})) { if (v === null || v === undefined || v === false) continue; nodo.attrs[k] = v; }
  nodo.append(...hijos.flat());
  return nodo;
}
const texto = n => (typeof n === "object" ? n.hijos.map(texto).join("") : String(n));
const busca = (n, f, acc = []) => { if (typeof n === "object") { if (f(n)) acc.push(n); n.hijos.forEach(x => busca(x, f, acc)); } return acc; };
const fecha = iso => (iso ? "F(" + iso + ")" : "—"), dia = iso => (iso ? "D(" + iso + ")" : "—");

let M;
test.before(async () => { M = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "ficha_llaves.js")).href); });

test("una familia: sus llaves con nombre, fechas y etiquetas; quitar una y quitar todas llaman a la ficha; las revocadas no llevan botón", () => {
  const quitadas = [];
  const nodo = M.construyeLlaves(h, {
    llaves: [
      { id: 7, nombre: "Móvil de Ana", creada_en: "2026-11-01", ultima_vez_en: "2026-11-02", revocada_en: null, viva: true, descubrible: true, sincronizada: true },
      { id: 6, nombre: "Portátil viejo", creada_en: "2026-10-01", ultima_vez_en: null, revocada_en: null, viva: true, descubrible: false, sincronizada: false },
      { id: 5, nombre: "<b>Tableta</b>", creada_en: "2026-09-01", ultima_vez_en: null, revocada_en: "2026-10-30", viva: false, descubrible: true, sincronizada: false },
    ],
    fecha, dia, puedeQuitar: true, alQuitar: l => quitadas.push(l.id), alQuitarTodas: () => quitadas.push("todas"),
  });
  const t = texto(nodo);
  assert.match(t, /Llaves de acceso/);
  assert.match(t, /Móvil de Ana.*viva.*sincronizada/);
  assert.match(t, /creada el D\(2026-11-01\) · último uso: F\(2026-11-02\)/);
  assert.match(t, /Portátil viejo.*viva.*sin entrada directa/);
  assert.ok(t.includes(M.TEXTO_NO_DESCUBRIBLE), "la llave sin entrada directa lo explica");
  assert.equal(busca(nodo, n => n.attrs["data-no-descubrible"] !== undefined).length, 1, "solo la que lo es");
  assert.match(t, /revocada el F\(2026-10-30\)/);
  assert.ok(t.includes("<b>Tableta</b>") && busca(nodo, n => n.etiqueta === "b").length === 0, "un nombre con marcas es texto, no HTML");
  const botones = busca(nodo, n => n.etiqueta === "button");
  assert.deepEqual(botones.map(b => texto(b)), ["Quitar esta llave", "Quitar esta llave", "Quitar todas las llaves"], "una por llave viva, ninguna por la revocada, y «todas»");
  assert.match(botones[0].attrs["aria-label"], /Móvil de Ana/);
  botones.forEach(b => b.attrs.onclick());
  assert.deepEqual(quitadas, [7, 6, "todas"]);
  assert.match(t, /sigue sirviendo para entrar/, "la nota dice que el enlace del correo sigue siendo la entrada");
});

test("una cuenta de oficina: solo lectura (sin botones), con el aviso de las llaves que no se guardaron en el aparato; sin llaves, lo dice", () => {
  const nodo = M.construyeLlaves(h, {
    llaves: [{ id: 1, nombre: "Antigua", creada_en: "2026-10-20", ultima_vez_en: null, revocada_en: null, respaldada: false, descubrible: false }, { id: 2, nombre: "Nueva", creada_en: "2026-11-02", ultima_vez_en: null, revocada_en: null, respaldada: true, descubrible: true }],
    fecha, dia, puedeQuitar: false, alQuitar() { throw new Error("no"); }, alQuitarTodas() { throw new Error("no"); },
  });
  assert.equal(busca(nodo, n => n.etiqueta === "button").length, 0, "solo lectura");
  const t = texto(nodo);
  assert.ok(t.includes("Esta llave no se guardó en el aparato: no sirve para «Entrar con mi llave» sin correo; crea otra"));
  assert.equal(busca(nodo, n => n.attrs["data-no-descubrible"] !== undefined).length, 1, "solo la antigua");
  assert.match(t, /Nueva.*viva.*sincronizada/, "respaldada de la lista de oficina se lee como sincronizada");
  assert.match(texto(M.construyeLlaves(h, { llaves: [], fecha, dia, puedeQuitar: true })), /no tiene llaves de acceso: entra con el enlace de su correo/);
  assert.match(texto(M.construyeLlaves(h, { llaves: [], fecha, dia, puedeQuitar: false, sinLlaves: M.TEXTO_SIN_LLAVES_OFICINA })), /Esta cuenta no tiene llaves/);
  assert.equal(busca(M.construyeLlaves(h, { llaves: [{ id: 3, nombre: "Revocada", viva: false, revocada_en: "2026-11-01" }], fecha, dia, puedeQuitar: true, alQuitar() {}, alQuitarTodas() {} }), n => n.etiqueta === "button").length, 0, "sin vivas, ni «quitar todas»");
});

test("una api antigua sin `descubrible` no acusa a nadie; el nombre vacío no rompe; el texto tras quitar dice si el correo salió", () => {
  assert.equal(M.normalizaLlave({ id: 1, nombre: "", revocada_en: null }).descubrible, true);
  assert.equal(M.normalizaLlave({ id: 1 }).nombre, "Llave");
  assert.match(M.textoTrasQuitar("ana@example.com", 1, true), /Llave quitada a ana@example.com.*Se le avisó por correo/);
  assert.match(M.textoTrasQuitar("ana@example.com", 3, false), /3 llaves quitadas.*NO salió/);
});

test("estática: familias.js usa solo rutas del contrato, la baja de llaves pasa por la confirmación reciente y el módulo no pone HTML ni estilos en línea", () => {
  const js = lee("apps/web/oficina/familias.js"), mod = lee("apps/web/oficina/ficha_llaves.js"), openapi = lee("contratos/api.openapi.yaml");
  assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write|https?:\/\/|document\./.test(mod), "ficha_llaves.js: texto, no HTML; sin document");
  assert.match(js, /api\("GET", "\/api\/admin\/hogares\/" \+ fila\.id \+ "\/llaves"\)/);
  assert.match(js, /api\("GET", "\/api\/admin\/llaves"\)/);
  assert.match(js, /conConfirmacion\(\(\) => api\("DELETE", "\/api\/admin\/hogares\/" \+ f\.id \+ "\/llaves"/);
  for (const r of ["/api/admin/hogares/{id}/llaves", "/api/admin/hogares/{id}/llaves/{llaveId}", "/api/admin/llaves"]) assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  const sinComentarios = c => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/credencial|clave_publica|contador/.test(sinComentarios(mod) + sinComentarios(js.slice(js.indexOf("function fichaLlaves"), js.indexOf("async function cierraSesion")))), "la página no maneja material criptográfico");
});

// ——— recorrido en Chrome con la api simulada (escrito, sin ejecutar) ———
test("recorrido (api simulada): la ficha enseña las llaves y «Quitar esta llave» manda el DELETE con el motivo", { timeout: 300_000 }, async t => {
  if (process.env.GEMELO_CHROME_FICHA !== "1") return t.skip("recorrido en Chrome opcional (GEMELO_CHROME_FICHA=1, por el banco): la ficha de llaves en un navegador NO se ha comprobado");
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: la ficha de llaves NO se ha comprobado en un navegador");
  const { lanza } = require("./_navegador");
  const nav = await lanza();
  const dist = path.join(RAIZ, "apps", "web", "oficina");
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES" });
  const pg = await ctx.newPage(), errores = [], deletes = [];
  pg.on("pageerror", e => errores.push(String(e)));
  // la api simulada: una oficina (admin) y dos familias; las llaves de Ana y el registro de los DELETE
  let llaves = [{ id: 7, nombre: "Móvil de Ana", creada_en: "2026-11-01T10:00:00Z", ultima_vez_en: null, revocada_en: null, viva: true, descubrible: true, sincronizada: false },
    { id: 6, nombre: "Portátil viejo", creada_en: "2026-10-01T10:00:00Z", ultima_vez_en: null, revocada_en: null, viva: true, descubrible: false, sincronizada: false }];
  const fam = { id: 1, correo: "ana@example.com", rol: "hogar", alias: null, alias_visible: false, activo: true, nombre_interno: null, creado_en: "2026-10-01T00:00:00Z", baja_en: null, avisos_correo: true, normas_version: 1, normas_aceptadas_en: "2026-10-02T00:00:00Z", estado: "activa", borrado_en: null, hazas: [], sesiones: 0 };
  const json = (route, cuerpo, estado = 200) => route.fulfill({ status: estado, contentType: "application/json", body: JSON.stringify(cuerpo) });
  await pg.route("**/api/**", route => {
    const u = new URL(route.request().url()), m = route.request().method();
    if (u.pathname === "/api/sesion") return json(route, { rol: "admin", alias: null, primer_acceso: false, titular: true, entrada: "enlace" });
    if (u.pathname === "/api/admin/hogares" && m === "GET") return json(route, { hogares: [fam], total: 1 });
    if (u.pathname === "/api/admin/hazas") return json(route, { hazas: [] });
    if (u.pathname === "/api/admin/hogares/1/sesiones") return json(route, { sesiones: [], aparatos_oficina: [] });
    if (u.pathname === "/api/admin/hogares/1/llaves" && m === "GET") return json(route, { llaves });
    const del = /^\/api\/admin\/hogares\/1\/llaves\/(\d+)$/.exec(u.pathname);
    if (del && m === "DELETE") {
      deletes.push([u.pathname, route.request().postData()]);
      llaves = llaves.map(l => (l.id === Number(del[1]) ? { ...l, viva: false, revocada_en: "2026-11-02T10:00:00Z" } : l));
      return json(route, { sesiones_cerradas: 0, aviso_enviado: true });
    }
    return json(route, {});
  });
  // la carpeta de la oficina servida tal cual por http (los módulos ES no cargan desde file://); lo que no sea de la carpeta, a la api simulada o vacío
  const http = require("http");
  const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
  const srv = http.createServer((req, res) => {
    const f = path.join(dist, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", tipos[path.extname(f)] || "application/octet-stream"); res.end(fs.readFileSync(f));
  });
  await new Promise(ok => srv.listen(0, "127.0.0.1", ok));
  t.after(() => srv.close());
  // (el arranque real de oficina.js depende de la sesión y de la llave: se afina en el turno del banco)
  await pg.goto("http://127.0.0.1:" + srv.address().port + "/index.html");
  await pg.click('#nav button[data-sec=familias]');
  await pg.click("[data-fam='1']");
  await pg.waitForSelector("[data-llaves]");
  assert.match(await pg.textContent("[data-llaves]"), /Móvil de Ana/);
  assert.match(await pg.textContent("[data-no-descubrible]"), /no sirve para «Entrar con mi llave» sin correo/);
  await pg.click('[data-llave="7"] button');
  await pg.fill("#fMotivoLlave", "Perdió el móvil");
  await pg.click("#dlgConfSi");
  await pg.waitForFunction(() => document.querySelector('[data-llave="7"] .p-mal'));
  assert.deepEqual(deletes, [["/api/admin/hogares/1/llaves/7", JSON.stringify({ motivo: "Perdió el móvil" })]]);
  assert.deepEqual(errores, []);
  await ctx.close();
});
