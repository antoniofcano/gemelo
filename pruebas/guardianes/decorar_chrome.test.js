"use strict";
// P7g D4 en Chrome sin pantalla (SwiftShader: vale para recuentos, no para fps; regla 6), por el turno del banco (npm run banco:encarga; NO la ejecuta quien la
// escribe: escrita el 2026-11-02 sin ejecutar). La acción «Decorar» de la ficha del olivo con la api simulada (?api=/api/ y page.route; nada es real):
//   · la sesión es de titular y la primera haza (H-P1) es tuya; GET /api/hazas/1/olivos devuelve lo que se ha ido poniendo (el servidor simulado guarda la pieza);
//   · se elige con un clic un olivo de esa haza: la ficha ofrece «Decorar» (sin «Cambiar decoración» ni «Quitar decoración» todavía);
//   · el recuadro ofrece SOLO las piezas de la época de hoy (1 en primavera y verano; 2 en otoño e invierno) y dice «Ilustrativa: …»;
//   · al tocar una pieza sale el PUT /api/olivos/{finca}/{copas_id}/decoracion con { pieza }, el recuadro se cierra, la ficha pasa a «Cambiar decoración» y
//     «Quitar decoración», y la pieza aparece DIBUJADA en el olivo (window.__decoraciones().validas = 1 y ≥ 1 llamada) sin recargar la página;
//   · «Quitar decoración» manda el DELETE, la pieza desaparece del dibujo (validas = 0);
//   · un 422 fuera_de_epoca (la api simulada lo devuelve a la primera) se ve en el recuadro tal cual, el recuadro sigue abierto y se puede probar otra vez;
//   · con ?decoraciones=0 la ficha no ofrece «Decorar»; no hay errores de página.
// No prueba: cómo se ve (capturas en pruebas/salida/capturas-decorar/ para Antonio), los fps, ni iPhone, Quest ni lector de pantalla; el día de la prueba decide
// cuántas piezas hay (la regla de la época la comprueban en Node decoraciones.test.js y personalizacion.test.js con fechas fijas).
// Uso: node --test pruebas/guardianes/decorar_chrome.test.js
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("decorar un olivo en navegador") || saltoPagina("decorar un olivo en navegador");
const CAPS = path.join(RAIZ, "pruebas", "salida", "capturas-decorar");
let srv, navegador, base, indice;
test.before(async () => {
  if (SALTO) return;
  const m = montaPagina({ finca: "hituelo" }); indice = m.indice;
  srv = await sirve(m.carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza(); fs.mkdirSync(CAPS, { recursive: true });
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

/** 4 hazas de prueba (como las da GET /api/hazas) alrededor del centro de la finca; la primera es tuya. */
function hazas() {
  const [cx, cy] = indice.centro_utm, f = indice.finca_id;
  const q = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  return { type: "FeatureCollection", srs: "EPSG:25830", features: Array.from({ length: 4 }, (_, i) => {
    const x0 = cx - 90 + 90 * (i % 2), y0 = cy - 70 + 70 * Math.floor(i / 2);
    return { type: "Feature", id: i + 1, geometry: { type: "MultiPolygon", coordinates: [[q(x0, y0, x0 + 90, y0 + 70)]] }, properties: { codigo: "H-P" + (i + 1), nombre: "Haza de prueba " + (i + 1), finca: f, es_mia: i === 0 } };
  }) };
}

/** la página con la api simulada; `servidor.pieza` es lo que hay puesto; `servidor.rechazaPrimero` hace que el primer PUT dé 422 fuera_de_epoca */
async function abre(consulta, servidor) {
  const p = await navegador.newPage({ viewport: { width: 1000, height: 700 } }), errores = [], f = indice.finca_id;
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.route(/\/api\/hazas(\?|$)/, r => r.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify(hazas()) }));
  await p.route("**/api/config**", r => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await p.route("**/api/sesion", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rol: "familia", titular: true }) }));
  await p.route(/\/api\/hazas\/(\d+)\/olivos$/, r => {
    const haza = +/\/hazas\/(\d+)\/olivos$/.exec(r.request().url())[1];
    const olivos = haza === 1 && servidor.pieza ? [{ id: 500, finca: f, copas_id: servidor.copas, nombre: null, objeto: null, decoracion: servidor.pieza }] : [];
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ haza_id: haza, es_mia: haza === 1, olivos }) });
  });
  await p.route(/\/api\/olivos\/[a-z0-9_-]+\/\d+\/decoracion$/, r => {
    const req = r.request(), m = /\/olivos\/[a-z0-9_-]+\/(\d+)\/decoracion$/.exec(req.url());
    servidor.llamadas.push([req.method(), new URL(req.url()).pathname, req.postData()]);
    if (req.method() === "PUT") {
      if (servidor.rechazaPrimero) { servidor.rechazaPrimero = false; return r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "fuera_de_epoca", mensaje: "Esa decoración no es de esta época del año. Ahora toca: (simulado)." }) }); }
      servidor.pieza = JSON.parse(req.postData()).pieza; servidor.copas = +m[1];
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 500, pieza: servidor.pieza }) });
    }
    servidor.pieza = null; return r.fulfill({ status: 204, body: "" });
  });
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo() && window.__personaliza, null, { timeout: 90000 });
  await p.waitForFunction(() => { const e = window.__personaliza(); return e.titular === true && e.hazas >= 4 && e.cargadas >= 4; }, null, { timeout: 60000 });
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0, null, { timeout: 60000, polling: 500 }).catch(() => {});
  return { p, errores };
}
// un olivo de la haza 1 (la de H-P1: x en [-90, 0], y en [-70, 0] respecto del centro), mirado desde 25 m y clicado de verdad (como personalizacion_e2e.test.js)
async function eligeOlivoMio(p) {
  const id = await p.evaluate(() => { const c = window.__g.copas.filter(q => q.oliv && q.id >= 0 && q.x > -80 && q.x < -10 && q.y > -60 && q.y < -10)[0]; return c ? c.id : null; });
  assert.ok(id !== null, "el fixture trae un olivo en H-P1");
  await p.evaluate(id => { const g = window.__g, c = g.copas.find(q => q.id === id); g.orb.az = 0.4; g.orb.el = 0.45; g.orb.dist = 25; g.objetivo.x = c.x; g.objetivo.z = -c.y; g.objetivo.y = g.suelo(c.x, c.y) + 4; g.pon("gem"); }, id);
  await p.waitForTimeout(1200);
  const pos = await p.evaluate(id => {
    const g = window.__g, c = g.copas.find(q => q.id === id), cam = g.camera, ex = Number(document.getElementById("exag").value) || 1; cam.updateMatrixWorld();
    const m = cam.matrixWorldInverse.elements, q = cam.projectionMatrix.elements, v = [c.x, (g.suelo(c.x, c.y) + c.h * 0.7) * ex, -c.y, 1];
    const vx = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], vy = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], vz = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
    const cx = q[0] * vx + q[8] * vz, cy = q[5] * vy + q[9] * vz, cw = -vz, r = document.getElementById("lienzo").getBoundingClientRect();
    return { x: r.left + (cx / cw * 0.5 + 0.5) * r.width, y: r.top + (-cy / cw * 0.5 + 0.5) * r.height };
  }, id);
  await p.mouse.click(pos.x, pos.y);
  await p.waitForFunction(id => (window.__usables().actual || "").endsWith(":" + id), id, { timeout: 10000 });
  return id;
}
const botonesFicha = p => p.$$eval("#fichaAcciones button", bs => bs.map(b => b.textContent));

test("en Chrome: el titular decora su olivo desde la ficha (solo las piezas de la época), se ve dibujada sin recargar, la cambia y la quita; un 422 se ve en el recuadro", { skip: SALTO || false, timeout: 600000 }, async () => {
  const servidor = { pieza: null, copas: null, llamadas: [], rechazaPrimero: true };
  const { p, errores } = await abre("?api=/api/&debug", servidor);
  try {
    const id = await eligeOlivoMio(p); servidor.copas = id;
    const antes = await botonesFicha(p);
    assert.ok(antes.includes("Decorar") && !antes.includes("Cambiar decoración") && !antes.includes("Quitar decoración"), JSON.stringify(antes));
    await p.click("#fichaAcciones button:has-text('Decorar')");
    await p.waitForSelector("#personalizaPanel [data-pieza]", { timeout: 10000 });
    const piezas = await p.$$eval("#personalizaPanel [data-pieza]", bs => bs.map(b => b.getAttribute("data-pieza")));
    assert.ok(piezas.length === 1 || piezas.length === 2, "1 pieza en primavera y verano, 2 en otoño e invierno: " + piezas.join());
    assert.match(await p.innerText("#personalizaPanel"), /Ilustrativa: la decoración la elige tu familia; no la mide el gemelo\./);
    const alto = await p.$$eval("#personalizaPanel [data-pieza]", bs => bs.map(b => Math.round(b.getBoundingClientRect().height)));
    assert.ok(alto.every(h => h >= 44), "zonas táctiles ≥ 44 px: " + alto.join());
    await p.screenshot({ path: path.join(CAPS, "dialogo.png") });
    // 1.º el 422 simulado: se lee en el recuadro tal cual, sigue abierto y no se escribe nada
    await p.click("#personalizaPanel [data-pieza]");
    await p.waitForFunction(() => /no es de esta época del año/.test(document.querySelector("#personalizaPanel [data-msg]").textContent), null, { timeout: 10000 });
    assert.strictEqual(servidor.pieza, null);
    // 2.º la buena: el PUT con su cuerpo, el recuadro fuera y la pieza dibujada sin recargar
    await p.click("#personalizaPanel [data-pieza]");
    await p.waitForSelector("#personalizaPanel", { state: "detached", timeout: 15000 });
    const put = servidor.llamadas.filter(l => l[0] === "PUT").pop(); assert.strictEqual(put[1], "/api/olivos/" + indice.finca_id + "/" + id + "/decoracion"); assert.deepStrictEqual(JSON.parse(put[2]), { pieza: piezas[0] });
    await p.waitForFunction(() => window.__decoraciones && window.__decoraciones().validas === 1 && window.__decoraciones().llamadas >= 0, null, { timeout: 20000, polling: 250 });
    await p.waitForFunction(() => window.__decoraciones().elegidas === 1 && window.__decoraciones().llamadas >= 1, null, { timeout: 20000, polling: 250 });   // y entra en el dibujo (el olivo está a 25 m)
    const tras = await botonesFicha(p); assert.ok(tras.includes("Cambiar decoración") && tras.includes("Quitar decoración") && !tras.includes("Decorar"), JSON.stringify(tras));
    await p.screenshot({ path: path.join(CAPS, "puesta.png") });
    // 3.º cambiar: si la época trae dos, la otra; la actual sale marcada y desactivada
    await p.click("#fichaAcciones button:has-text('Cambiar decoración')");
    await p.waitForSelector("#personalizaPanel [data-pieza]", { timeout: 10000 });
    assert.strictEqual(await p.$eval("#personalizaPanel [data-pieza='" + piezas[0] + "']", b => b.disabled), true, "la que tiene, marcada");
    if (piezas.length === 2) {
      await p.click("#personalizaPanel [data-pieza='" + piezas[1] + "']"); await p.waitForSelector("#personalizaPanel", { state: "detached", timeout: 15000 });
      assert.strictEqual(servidor.pieza, piezas[1], "la nueva sustituye a la anterior (una sola por olivo)");
    } else await p.click("#personalizaPanel button[data-cancela]");
    // 4.º quitar: el DELETE y fuera del dibujo
    await p.click("#fichaAcciones button:has-text('Quitar decoración')");
    await p.click("#personalizaPanel button[data-ok]"); await p.waitForSelector("#personalizaPanel", { state: "detached", timeout: 15000 });
    assert.ok(servidor.llamadas.some(l => l[0] === "DELETE" && l[1] === "/api/olivos/" + indice.finca_id + "/" + id + "/decoracion"));
    await p.waitForFunction(() => window.__decoraciones().validas === 0, null, { timeout: 20000, polling: 250 });
    assert.deepStrictEqual(errores, []);
  } finally { await p.close(); }
});

test("en Chrome: con ?decoraciones=0 la ficha no ofrece «Decorar» (nadie la dibujaría)", { skip: SALTO || false, timeout: 600000 }, async () => {
  const servidor = { pieza: null, copas: null, llamadas: [], rechazaPrimero: false };
  const { p, errores } = await abre("?api=/api/&decoraciones=0", servidor);
  try {
    await eligeOlivoMio(p);
    const bs = await botonesFicha(p); assert.ok(bs.includes("Nombrar") && !bs.some(t => /ecora/.test(t)), JSON.stringify(bs));
    assert.deepStrictEqual(errores, []);
  } finally { await p.close(); }
});
