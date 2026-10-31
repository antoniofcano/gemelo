"use strict";
// La agenda dentro del mundo (OF11d; apps/web/motor/43_agenda.js) en Chrome, con la api simulada (page.route): NO la ejecuta quien la escribe, la pasa el banco
// (npm run banco:encarga). Comprueba: el icono y la ventana «Agenda» en móvil y en escritorio, los próximos con plazas y tu estado, apuntarse con N personas (el POST
// lleva el número), borrarse (DELETE), que sin puede_inscribirse no hay un solo botón, que sin servidor no hay icono, y 0 errores de consola. En VR simulada
// (opcional, GEMELO_VR=1, como juego_cosecha.test.js) la fila «Agenda» del panel lista los próximos y dice dónde apuntarse, sin botón.
const test = require("node:test"), assert = require("node:assert");
const { describe, before } = test;
const { RAIZ, fs, path, lee } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la agenda en el mundo") || saltoPagina("la agenda en el mundo");
const CAPS = path.join(RAIZ, "pruebas", "salida", "capturas-agenda");
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza(); fs.mkdirSync(CAPS, { recursive: true });
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

const DIA = 86400000, iso = ms => new Date(ms).toISOString();
const ev = (id, extra) => Object.assign({ id, titulo: "Visita " + id, tipo: "guiada", descripcion: null, lugar: "El Cerro", finca: "cerro", haza: null, presencial: true,
  empieza_en: iso(Date.now() + id * DIA), termina_en: null, plazas: 20, plazas_libres: 3, inscripcion_hasta: null, inscripcion_abierta: true, mia: null }, extra || {});
const agenda = puede => ({ puede_inscribirse: puede, eventos: [ev(1), ev(2, { plazas_libres: 1, mia: { estado: "apuntado", personas: 2 } }), ev(3, { plazas: null, plazas_libres: null })] });

describe("en el navegador", () => {
  before(async () => { if (!SALTO) await prepara(); });

  async function abre(p, tactil) {
    await p.waitForFunction(() => window.__g && window.__g.listo() && window.__agenda, null, { timeout: 120000, polling: 500 });
    const visible = await p.evaluate(() => { const b = document.getElementById("hudIco-agenda"); return !!(b && b.offsetParent); });
    if (visible) await (tactil ? p.tap("#hudIco-agenda") : p.click("#hudIco-agenda")); else { await (tactil ? p.tap("#bMas") : p.click("#bMas")); await p.locator("#hudMas button", { hasText: "Agenda" }).click(); }
    await p.waitForSelector("#ventana-agenda [data-evento]", { timeout: 15000 });
  }

  for (const modo of ["escritorio", "táctil"]) test(modo + ": icono «Agenda», próximos con plazas y estado, apuntarse con N personas y borrarse; 0 errores", { timeout: 300000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const tactil = modo === "táctil";
    const p = await nav.newPage(tactil ? { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } }), errores = [], pedidas = [];
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    let estado = agenda(true);
    await p.route("**/api/agenda**", r => {
      const q = r.request(), m = q.method(), J = (c, st) => r.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(c) });
      pedidas.push(m + " " + q.url().replace(/^.*\/api\//, "") + (m === "POST" ? " " + q.postData() : ""));
      if (m === "POST") { const n = JSON.parse(q.postData()).personas; estado.eventos[0].mia = { estado: "apuntado", personas: n }; estado.eventos[0].plazas_libres = 3 - n; return J({ estado: "apuntado", personas: n, plazas_libres: 3 - n }, 201); }
      if (m === "DELETE") { estado.eventos[1].mia = null; return r.fulfill({ status: 204 }); }
      return J(estado);
    });
    try {
      await p.goto(url + "?debug&hora=12:00&api=/api/");
      await abre(p, tactil);
      const txt = await p.locator("#ventana-agenda").innerText();
      for (const f of ["Visita 1", "Quedan 3 plazas", "Estáis apuntados (2 personas)", "Sin aforo"]) assert.ok(txt.includes(f), "la ventana enseña «" + f + "»: " + txt);
      assert.strictEqual(await p.locator("#ventana-agenda [data-apunta]").count(), 2); assert.strictEqual(await p.locator("#ventana-agenda [data-borra]").count(), 1);
      await p.screenshot({ path: path.join(CAPS, "agenda_" + modo + ".png") });
      await p.locator("#ventana-agenda select").first().selectOption("3");
      await (tactil ? p.locator("[data-apunta='1']").tap() : p.locator("[data-apunta='1']").click());
      await p.waitForFunction(() => /Estáis apuntados \(3 personas\)/.test(document.getElementById("ventana-agenda").innerText), null, { timeout: 10000 });
      assert.ok(pedidas.some(x => /^POST agenda\/1\/inscripcion \{"personas":3\}$/.test(x)), pedidas.join(" | "));
      await (tactil ? p.locator("[data-borra='2']").tap() : p.locator("[data-borra='2']").click());
      await p.waitForFunction(() => document.querySelectorAll("#ventana-agenda [data-borra='2']").length === 0, null, { timeout: 10000 });
      assert.ok(pedidas.some(x => x === "DELETE agenda/2/inscripcion"), pedidas.join(" | "));
      if (tactil) { const r = await p.evaluate(() => { const b = document.querySelector("#ventana-agenda [data-borra], #ventana-agenda [data-apunta]").getBoundingClientRect(); return [b.width, b.height]; }); assert.ok(r[0] >= 44 && r[1] >= 44, "botones táctiles de ≥ 44 px: " + r); }
      await p.screenshot({ path: path.join(CAPS, "agenda_" + modo + "_hecho.png") });
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });

  test("gafas vinculadas (puede_inscribirse: false): se ven los eventos, no hay botones y dice dónde apuntarse; ?agenda=0 y sin servidor: ni icono", { timeout: 300000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const p = await nav.newPage({ viewport: { width: 1280, height: 800 } }), errores = [];
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    await p.route("**/api/agenda**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(agenda(false)) }));
    try {
      await p.goto(url + "?debug&hora=12:00&api=/api/"); await abre(p, false);
      assert.strictEqual(await p.locator("#ventana-agenda button[data-apunta], #ventana-agenda button[data-borra]").count(), 0);
      assert.ok((await p.locator("#ventana-agenda").innerText()).includes("Apúntate desde el móvil o el ordenador"));
      await p.goto(url + "?debug&hora=12:00&api=/api/&agenda=0"); await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 120000, polling: 500 });
      assert.strictEqual(await p.evaluate(() => !!document.getElementById("hudIco-agenda") || !!window.__agenda), false, "?agenda=0: ni icono ni __agenda");
      await p.goto(url + "?debug&hora=12:00"); await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 120000, polling: 500 });
      assert.strictEqual(await p.evaluate(() => !!document.getElementById("hudIco-agenda") || !!window.__agenda), false, "sin servidor no hay agenda");
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });

  test("OF11e: con ?presencia=red una guiada en curso lleva «Entrar en la visita»; al pulsar pide el token de la guiada y, si la api dice 403, se enseña su frase; sin presencia de verdad no hay botón", { timeout: 300000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const p = await nav.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), errores = [], pedidas = [];
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon|404|403|401|Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    const MIN = 60000, FRASE = "Esta visita es para las familias apuntadas.";
    const enCurso = { puede_inscribirse: true, eventos: [ev(1, { empieza_en: iso(Date.now() - 10 * MIN), mia: { estado: "apuntado", personas: 2 }, entrada: { desde: iso(Date.now() - 25 * MIN), hasta: iso(Date.now() + 90 * MIN) } }), ev(2, { tipo: "cata", empieza_en: iso(Date.now() + 5 * MIN) })] };
    await p.route("**/api/agenda**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(enCurso) }));
    await p.route("**/api/presencia/**", r => { const q = r.request(); pedidas.push(q.method() + " " + q.url().replace(/^.*\/api\//, ""));
      r.fulfill({ status: /guiadas/.test(q.url()) ? 403 : 401, contentType: "application/json", body: JSON.stringify(/guiadas/.test(q.url()) ? { error: "guiada_solo_inscritos", mensaje: FRASE } : { error: "sin_sesion" }) }); });
    try {
      await p.goto(url + "?debug&hora=12:00&api=/api/&presencia=red"); await abre(p, true);
      assert.ok((await p.locator("#ventana-agenda").innerText()).includes("Visita 1"), "la guiada en curso sigue en la lista");
      assert.strictEqual(await p.locator("#ventana-agenda [data-entra]").count(), 1, "solo la guiada abierta, no la cata");
      const r = await p.evaluate(() => { const b = document.querySelector("#ventana-agenda [data-entra]").getBoundingClientRect(); return [b.width, b.height]; }); assert.ok(r[0] >= 44 && r[1] >= 44, "botón táctil: " + r);
      await p.locator("#ventana-agenda [data-entra]").tap();
      await p.waitForFunction(f => document.getElementById("ventana-agenda").innerText.includes(f), FRASE, { timeout: 15000 });
      assert.ok(pedidas.some(x => /^POST presencia\/guiadas\/1\/token$/.test(x)), pedidas.join(" | "));
      await p.screenshot({ path: path.join(CAPS, "agenda_entrar_403.png") });
      await p.goto(url + "?debug&hora=12:00&api=/api/"); await abre(p, true);
      assert.strictEqual(await p.locator("#ventana-agenda [data-entra]").count(), 0, "sin ?presencia=red no hay botón");
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });

  test("VR simulada: la fila «Agenda» del panel (pestaña Mundo) lista los próximos y dice dónde apuntarse; sin botones; el presupuesto no sube", { timeout: 400000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 para la fila en el panel VR con el WebXR simulado (inestable con SwiftShader, como vr.test.js)");
    const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
    await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    await p.route("**/api/agenda**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(agenda(true)) }));
    try {
      await p.goto(url + "?debug&hora=12:00&api=/api/");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__vrDebug && window.__agenda, null, { timeout: 120000, polling: 500 });
      await p.waitForSelector("#btnVR", { timeout: 120000 }); await p.click("#btnVR", { timeout: 120000 });
      await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 120000, polling: 200 });
      await p.waitForFunction(() => window.__vrDebug().agenda && window.__vrDebug().agenda.filas.length >= 2, null, { timeout: 30000, polling: 200 });
      const d = await p.evaluate(() => window.__vrDebug().agenda);
      assert.strictEqual(d.nota, "Apúntate desde el móvil o el ordenador"); assert.ok(/Visita 1/.test(d.filas[0].t));
      const botones = await p.evaluate(() => window.__vrBotones().map(b => b.id)); assert.ok(!botones.some(id => /agenda/.test(id)), "la fila no pone botones: " + botones);
      await p.screenshot({ path: path.join(CAPS, "vr_agenda.png"), timeout: 120000 }).catch(e => console.log("   (captura no hecha: " + String(e.message).split("\n")[0] + ")"));
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });
});
