"use strict";
// La oficina, OF14 escalón 3: el bloque «Salas» de la sección Mundo (apps/web/oficina/mundo.js y mundo_puro.js, doc/sistema/OFICINA.md §6). Siempre, sin red ni Chrome:
//  - estática: el bloque, sus ids, el diálogo nativo reusado, aria-live, solo las dos rutas que la api ya admite a la oficina (sin rutas nuevas),
//    y que NO hay silenciar-por-persona (la api no lo tiene) ni cerrar de las salas sin voz;
//  - las piezas puras: qué botones se ofrecen según la sala, cuerpos de las peticiones y frases.
// Opcional (GEMELO_BANCO=1, por el banco; NO se ha ejecutado): recorrido en Chrome con la api simulada por page.route (sin Docker, sin LiveKit).
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, propia, chrome, playwright, path } = require("./_util");

const html = lee("apps/web/oficina/index.html"), js = lee("apps/web/oficina/mundo.js");
const importa = () => import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "mundo_puro.js")).href);
const sec = /<section id="s-mundo"[\s\S]*?<\/section>/.exec(html)[0];

test("estática: el bloque «Salas», con sus ids, en vivo, sin pedir la lista dos veces y solo con rutas que la api ya admite a la oficina", () => {
  for (const id of ["mSalasCuenta", "mSalasLista", "mSalasM"]) assert.ok(sec.includes('id="' + id + '"'), id);
  assert.match(sec, /id="mSalasCuenta"[^>]*aria-live="polite"/); assert.match(sec, /id="mSalasM"[^>]*aria-live="polite"/);
  assert.match(sec, /<h2>Salas<\/h2>/);
  assert.ok(!/\sstyle\s*=|\son[a-z]+\s*=|<script/i.test(sec), "sin estilos ni manejadores en línea");
  // la lista de salas sale de la tabla del escalón 2 (una sola petición de participantes)
  assert.strictEqual((js.match(/api\("GET", "\/api\/admin\/presencia\/participantes"/g) || []).length, 1, "una sola lectura de participantes");
  assert.match(js, /pintaQuien\(r\.datos\);\s*pintaSalas\(\);/, "las salas se pintan con la misma respuesta");
  // las dos rutas, y solo esas, existen en el contrato
  const openapi = lee("contratos/api.openapi.yaml");
  for (const r of ["/api/presencia/guiadas/{evento}/cerrar", "/api/presencia/guiadas/{evento}/silenciar"]) assert.ok(openapi.includes("  " + r + ":"), r);
  assert.ok(js.includes('api("POST", "/api/presencia/guiadas/" + x.evento + "/cerrar", c.cuerpo)'));
  assert.ok(js.includes('api("POST", "/api/presencia/guiadas/" + x.evento + "/silenciar", {})'));
  // lo que NO se ofrece: ni silenciar a una persona (la api no tiene la ruta), ni tocar la palabra o las manos (eso es del guía)
  assert.ok(!/\/palabra|\/mano|guiadas\/[^"\n]*\/expulsar|api\/presencia\/token/.test(js), "nada de la palabra, las manos ni expulsar de guiada desde aquí");
  assert.ok(!/Silenciar a "|aria-label": "Silenciar a " \+ f\.alias/.test(js), "sin «Silenciar» por persona");
  assert.ok(!/<th scope="col">Silenciar/.test(sec));
  // diálogo nativo reusado (confirma) y foco de vuelta; textos y DOM con h()
  assert.match(js, /confirma\(\{\s*titulo: "¿Cerrar /); assert.match(js, /addEventListener\("close", [\s\S]*?\.focus\(\)[\s\S]*?\{ once: true \}/, "el foco vuelve al botón al cerrar el diálogo");
  assert.match(js, /el refresco no roba el foco/); assert.ok(!/innerHTML|insertAdjacentHTML/.test(js));
  assert.match(js, /data-sala-fila/); assert.ok(lee("apps/web/oficina/index.html").includes('<dialog id="dlgConfirma"'));
});

test("el servidor admite de verdad a la oficina en esas dos rutas (puedeModerar: el guía o la oficina) y los límites del aviso son los suyos", async () => {
  const ts = lee("apps/api/src/presencia/voz_rutas.ts"), voz = lee("apps/api/src/presencia/voz.ts");
  assert.match(voz, /export const puedeModerar = \(e[^)]*\)[^=]*=> esElGuia\(e, q\) \|\| q\.esOficina/);
  for (const ruta of ["silenciar", "cerrar"]) {
    const i = ts.indexOf('"/api/presencia/guiadas/:evento/' + ruta + '"'), cuerpo = ts.slice(i, ts.indexOf("\n  });", i));
    assert.ok(i > 0 && /moderable\(req, rep, req\.params\.evento\)/.test(cuerpo), ruta + " pasa por moderable()");
  }
  const m = /AVISO_CIERRE_S = (\d+), AVISO_CIERRE_MIN_S = (\d+), AVISO_CIERRE_MAX_S = (\d+)/.exec(voz), P = await importa();
  assert.deepStrictEqual([P.AVISO_CIERRE.defecto, P.AVISO_CIERRE.min, P.AVISO_CIERRE.max], [Number(m[1]), Number(m[2]), Number(m[3])], "los mismos límites que la api");
  // y NO hay ruta para silenciar a una sola persona
  assert.ok(!/\/silenciar\/|\/silenciar[A-Za-z]|silenciar-uno|silenciarUno/.test(ts));
  // la lista de la oficina no trae la identidad de LiveKit: sin ella no se puede apuntar a una conexión
  assert.ok(!/identidad\s*[?:]/.test(lee("apps/api/src/presencia/oficina_mundo.ts").slice(lee("apps/api/src/presencia/oficina_mundo.ts").indexOf("export interface FilaParticipante"), lee("apps/api/src/presencia/oficina_mundo.ts").indexOf("const PATRON_HAZA"))));
});

test("piezas puras: qué botones, qué cuerpos y qué frases", async () => {
  const P = await importa();
  assert.strictEqual(P.eventoDeSala("guiada-7"), 7); assert.strictEqual(P.eventoDeSala("guiada-0"), null); assert.strictEqual(P.eventoDeSala("guiada-7x"), null);
  assert.strictEqual(P.eventoDeSala("general"), null); assert.strictEqual(P.eventoDeSala("../guiada-7"), null);
  assert.deepStrictEqual(P.accionesDeSala("guiada-7", 3), { evento: 7, voz: true, cerrar: true, silenciar: true });
  assert.deepStrictEqual(P.accionesDeSala("guiada-7", 0), { evento: 7, voz: true, cerrar: false, silenciar: false }, "sin gente la sala no existe en LiveKit");
  for (const s of ["general", "visita"]) assert.deepStrictEqual(P.accionesDeSala(s, 5), { evento: null, voz: false, cerrar: false, silenciar: false }, s + ": ni cerrar ni silenciar (sin voz)");
  const filas = P.filasMundo({ participantes: [
    { sala: "guiada-12", alias: "A", rol: "guia", aparato: null, conectado_desde: null, hogar_id: 1 }, { sala: "general", alias: "B", rol: "hogar", aparato: null, conectado_desde: null, hogar_id: 2 },
    { sala: "guiada-3", alias: "C", rol: "hogar", aparato: null, conectado_desde: null, hogar_id: 3 }, { sala: "guiada-3", alias: "D", rol: "oficina", aparato: null, conectado_desde: null, hogar_id: 4 }] }, 0);
  assert.deepStrictEqual(filas.map(f => f.salaClave), ["guiada-12", "general", "guiada-3", "guiada-3"]);
  const salas = P.salasDeFilas(filas);
  assert.deepStrictEqual(salas.map(s => [s.clave, s.personas, s.cerrar]), [["general", 1, false], ["visita", 0, false], ["guiada-3", 2, true], ["guiada-12", 1, true]], "general y visita siempre; las guiadas, por número de evento");
  assert.deepStrictEqual(P.salasDeFilas([]).map(s => [s.clave, s.personas]), [["general", 0], ["visita", 0]], "vacío: solo las dos fijas, a 0");
  assert.deepStrictEqual(P.salasDeFilas(null).length, 2);
  // cuerpos del cierre: como la api (entero 5-60; vacío = 15)
  assert.deepStrictEqual(P.cuerpoCierre(""), { ok: true, cuerpo: { segundos: 15 } }); assert.deepStrictEqual(P.cuerpoCierre(undefined), { ok: true, cuerpo: { segundos: 15 } });
  assert.deepStrictEqual(P.cuerpoCierre(" 30 "), { ok: true, cuerpo: { segundos: 30 } });
  assert.deepStrictEqual([P.cuerpoCierre("5").ok, P.cuerpoCierre("60").ok], [true, true]);
  for (const mal of ["4", "61", "0", "-5", "7,5", "abc", "1e1"]) assert.strictEqual(P.cuerpoCierre(mal).ok, false, mal);
  assert.match(P.cuerpoCierre("99").error, /de 5 a 60 segundos/);
  // frases
  assert.match(P.textoCierre(3), /Se avisará a las 3 personas y volverán a la sala general/); assert.match(P.textoCierre(1), /Se avisará a la 1 persona y volverán a la sala general/);
  assert.match(P.textoSilencio(2), /todos menos el del guía \(2 personas/);
  assert.deepStrictEqual([0, 1, 4].map(P.textoGente), ["nadie", "1 persona", "4 personas"]);
  assert.match(P.resultadoCierre({ segundos: 20, avisados: true }, "Visita guiada 3"), /se cierra en 20 segundos/); assert.match(P.resultadoCierre({ avisados: false }, "X"), /nadie a quien avisar/);
  assert.match(P.resultadoSilencio({ pistas: 0, palabra_quitada: false }, "X"), /ningún micrófono/); assert.match(P.resultadoSilencio({ pistas: 1, palabra_quitada: false }, "X"), /1 micrófono silenciado\./);
  assert.match(P.resultadoSilencio({ pistas: 4, palabra_quitada: true }, "X"), /4 micrófonos silenciados\. Se quitó la palabra\./);
});

// ——— recorrido en Chrome (opcional; escrito, NO ejecutado: va por el banco, un Chrome a la vez) ———
const SALTO = process.env.GEMELO_BANCO !== "1" ? "recorrido en Chrome por el banco (GEMELO_BANCO=1): el bloque Salas en un navegador NO se ha comprobado" : null;

test("recorrido: salas con gente, cerrar con su aviso en el diálogo, silenciar, errores en vivo y foco, a 1280 y 600 px, con la api simulada", { timeout: 300_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: el bloque Salas NO se ha comprobado");
  const { sirve, lanza } = require("./_navegador");
  const dist = propia("oficina-salas-dist");
  const b = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:oficina"], { cwd: path.join(RAIZ, "apps", "web"), encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, GEMELO_OFICINA_SALIDA: dist } });
  assert.strictEqual(b.status, 0, "build:oficina: " + b.stdout + b.stderr);
  const srv = await sirve(dist), nav = await lanza();
  try {
    const base = "http://127.0.0.1:" + srv.address().port + "/index.html";
    const pg = await nav.newPage({ viewport: { width: 1280, height: 800 }, locale: "es-ES" }), errores = [], llamadas = [];
    pg.on("pageerror", e => errores.push(String(e)));
    const fila = (sala, alias, rol, hogar) => ({ sala, alias, rol, aparato: "escritorio", conectado_desde: "2026-11-02T11:50:00Z", hogar_id: hogar, haza: null, vista: null });
    let quien = { consultado_en: "2026-11-02T12:00:00Z", total: 4, truncado: false, participantes: [
      fila("guiada-3", "Guía <b>", "guia", 2), fila("guiada-3", "Ana", "hogar", 7), fila("guiada-3", "Luis", "hogar", 8), fila("general", "Pardal", "hogar", 9)] };
    let yaCerrandose = false;
    const json = (r, estado, cuerpo) => r.fulfill({ status: estado, contentType: "application/json", body: cuerpo === undefined ? "" : JSON.stringify(cuerpo) });
    await pg.route("**/api/**", async r => {
      const u = new URL(r.request().url()), m = r.request().method(), ruta = u.pathname, cuerpo = r.request().postData();
      llamadas.push(m + " " + ruta + (cuerpo ? " " + cuerpo : ""));
      if (ruta === "/api/oficina/sesion") return json(r, 200, { rol: "oficina", aparato: { nombre: "Prueba", estado: "aprobado" }, caduca_en: "2030-01-01T00:00:00Z", inactividad_min: 60, confirmacion_vigente: true });
      if (ruta === "/api/admin/hazas") return json(r, 200, { hazas: [{ finca: "hituelo" }] });
      if (ruta === "/api/admin/hogares") return json(r, 200, { total: 0, hogares: [] });
      if (ruta === "/api/balizas-oficiales") return json(r, 200, { finca: "hituelo", srs: "EPSG:25830", balizas: [] });
      if (ruta === "/api/admin/presencia/participantes") return json(r, 200, quien);
      if (ruta === "/api/presencia/guiadas/3/silenciar") return json(r, 200, { pistas: 2, palabra_quitada: true });
      if (ruta === "/api/presencia/guiadas/3/cerrar") {
        if (yaCerrandose) return json(r, 409, { error: "ya_cerrandose", mensaje: "La sala ya se está cerrando." });
        yaCerrandose = true; return json(r, 200, { cierra_en: "2026-11-02T12:00:30Z", segundos: JSON.parse(cuerpo).segundos, avisados: true });
      }
      return json(r, 200, {});
    });
    await pg.goto(base + "#mundo");
    await pg.waitForSelector("#mSalasLista li");
    assert.match(await pg.textContent("#mSalasCuenta"), /1 visita guiada abierta/);
    assert.strictEqual(await pg.locator("#mSalasLista li").count(), 3, "general, visita y guiada-3");
    assert.strictEqual(await pg.locator("#mSalasLista li b b").count(), 0);
    assert.strictEqual(await pg.locator("#mSalasLista li").nth(0).getByRole("button").count(), 0, "la sala general no tiene botones de voz");
    assert.strictEqual(await pg.locator("#mSalasLista li").nth(2).getByRole("button").count(), 2);
    for (const sel of ['[data-sala="guiada-3-s"]', '[data-sala="guiada-3-c"]']) assert.ok((await pg.locator(sel).boundingBox()).height >= 44, sel + " mide al menos 44 px");

    // silenciar a todos: diálogo, confirmar, frase en vivo y foco de vuelta
    await pg.click('[data-sala="guiada-3-s"]');
    await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfTexto"), /menos el del guía \(3 personas/);
    assert.ok(!llamadas.some(l => l.includes("/silenciar")), "no silencia antes de confirmar");
    await pg.click("#dlgConfSi");
    await pg.waitForFunction(() => /2 micrófonos silenciados\. Se quitó la palabra/.test(document.querySelector("#mSalasM").textContent));
    assert.strictEqual(await pg.evaluate(() => document.activeElement && document.activeElement.dataset.sala), "guiada-3-s", "el foco vuelve al botón");

    // cerrar: aviso fuera de rango = error en el diálogo sin llamar; con 20 s, llama con ese cuerpo
    await pg.click('[data-sala="guiada-3-c"]');
    await pg.waitForSelector("#dlgConfirma[open]");
    assert.match(await pg.textContent("#dlgConfTexto"), /Se avisará a las 3 personas y volverán a la sala general/);
    await pg.fill("#mCierreS", "99"); await pg.click("#dlgConfSi");
    assert.match(await pg.textContent("#dlgConfError"), /de 5 a 60 segundos/);
    assert.ok(!llamadas.some(l => l.includes("/cerrar")), "con el aviso mal no se llama a la api");
    await pg.fill("#mCierreS", "20"); await pg.click("#dlgConfSi");
    await pg.waitForFunction(() => !document.querySelector("#dlgConfirma").open);
    assert.ok(llamadas.some(l => l.startsWith("POST /api/presencia/guiadas/3/cerrar") && l.includes('"segundos":20')));
    assert.match(await pg.textContent("#mSalasM"), /se cierra en 20 segundos/);
    assert.strictEqual(await pg.evaluate(() => document.activeElement && document.activeElement.dataset.sala), "guiada-3-c", "el foco vuelve al botón");

    // un segundo cierre: el error de la api llega en claro, dentro del diálogo (role=alert)
    await pg.click('[data-sala="guiada-3-c"]'); await pg.waitForSelector("#dlgConfirma[open]"); await pg.click("#dlgConfSi");
    await pg.waitForFunction(() => /ya se está cerrando/.test(document.querySelector("#dlgConfError").textContent));
    await pg.click("#dlgConfNo");

    // la sala se vacía: desaparece el botón y queda el estado vacío
    quien = { consultado_en: "2026-11-02T12:00:40Z", total: 0, truncado: false, participantes: [] };
    await pg.click("#mQuienRef");
    await pg.waitForFunction(() => /ninguna visita guiada con gente/.test(document.querySelector("#mSalasCuenta").textContent));
    assert.strictEqual(await pg.locator("#mSalasLista button").count(), 0);

    // 600 px sin desbordar
    await pg.setViewportSize({ width: 600, height: 800 });
    assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin desbordar a 600 px");
    assert.deepStrictEqual(errores, [], "sin errores de página");
  } finally { await nav.close(); await new Promise(r => srv.close(r)); }
});
