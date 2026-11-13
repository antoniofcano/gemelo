"use strict";
// Eje B: la visita del museo (contrato mundo-interior v1.1, paradas[]; mundos/interior/visita.ts) en Chrome headless (SwiftShader), con el cliente web de
// verdad y el ejemplo SINTÉTICO del contrato servido como «fabrica» (con una puerta de más a «bodega», que no está registrada, para el «próximamente»).
// Comprueba, sin errores de consola ni peticiones fallidas: al entrar se ofrece la visita sin bloquear (no hay marcas: no cuesta nada); al empezarla hay
// una marca por parada (una llamada y dos triángulos cada una, medidos con renderer.info.render); al llegar a una parada se abre su ficha (título,
// etiquetas de procedencia, fuentes plegadas en <details>, con el aviso de las no verificadas); «Siguiente parada» gira sin mover; la última sigue por la
// puerta de la bodega, «próximamente» y desactivada; «Terminar» quita las marcas; y al salir del interior no queda nada (ni el recuadro ni memoria de GPU).
// Imprime las medidas (llamadas, triángulos, geometrías y texturas) dentro sin visita y con ella. SwiftShader no da fps. Sin Chrome, playwright-core,
// Python o Vite el test se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path, os } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la visita del museo en navegador") || saltoPagina("la visita del museo en navegador");
const EJEMPLO = path.join(RAIZ, "modelos", "interiores", "ejemplo");

let srv, navegador, interior, MAN;
test.before(async () => {
  if (SALTO) return;
  interior = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-visita-"));
  const dir = path.join(interior, "pantalla"), m = JSON.parse(fs.readFileSync(path.join(EJEMPLO, "mundo.json"), "utf8"));
  m.id = "fabrica"; delete m.anclaje;
  m.puertas.push({ id: "bodega", a: "bodega", pos: [3.7, 0, -3], rumbo: 90, ancho: 1, alto: 2, llegada: { pos: [3, 0, -3], rumbo: 270 } });
  m.paradas[2].puerta = "bodega";
  MAN = m;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "mundo.json"), JSON.stringify(m)); fs.copyFileSync(path.join(EJEMPLO, m.glb), path.join(dir, m.glb));
  srv = await sirve(montaPagina({ finca: "hituelo" }).carpeta, { csp: true, montajes: { "/fabrica/": interior } });
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); if (interior) fs.rmSync(interior, { recursive: true, force: true }); });

test("visita del museo: oferta sin bloquear, marcas, fichas con procedencia y fuentes plegadas, «próximamente», y al salir no queda nada", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const p = await navegador.newPage({ viewport: { width: 900, height: 600 } }), errores = [], fallos = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", m => { if (m.type() === "error" && !/^\[Report Only\]/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
  const mide = () => p.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => {
    const i = window.__g.renderer.info; ok({ llamadas: i.render.calls, triangulos: i.render.triangles, geometrias: i.memory.geometries, texturas: i.memory.textures });
  }))));
  const en = i => [MAN.paradas[i].pos[0], -MAN.paradas[i].pos[2]];
  try {
    await p.goto("http://127.0.0.1:" + srv.address().port + "/index.html?olivos=0&debug");
    await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
    await p.evaluate(() => window.__g.paseoEn(-130, -125, 0)); await p.waitForTimeout(3000);
    await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && (!window.__g.Escena3D || window.__g.Escena3D.listo()), null, { timeout: 60000, polling: 500 });
    await p.waitForTimeout(1000);
    const memFuera = await mide();
    assert.strictEqual(await p.$("#visitaMuseo"), null, "en el exterior no hay recuadro de la visita");
    const r = await p.evaluate(() => window.__cambiaMundo("fabrica").then(r => ({ ok: r.ok, mundo: r.mundo })));
    assert.deepStrictEqual(r, { ok: true, mundo: "fabrica" });
    await p.waitForSelector("#visitaMuseo button[data-accion='empieza']", { timeout: 10000 });
    assert.deepStrictEqual(await p.evaluate(() => [...document.querySelectorAll("#visitaMuseo button")].map(b => b.textContent)), ["Empezar la visita", "Pasear libre"]);
    assert.match(await p.textContent("#visitaMuseo"), /marcas numeradas del suelo son ilustrativas/);
    // las medidas, desde el fondo de la sala mirando a la entrada (las marcas están en el suelo: de cerca quedan bajo el campo de visión y se recortan)
    const MIRADOR = [0, 5.5, Math.PI];
    await p.evaluate(([x, y, a]) => window.__g.paseoEn(x, y, a), MIRADOR); await p.waitForTimeout(400);
    const sinVisita = await mide();
    assert.strictEqual((await p.evaluate(() => window.__visita())).marcas, 0, "la oferta no crea marcas");
    // pasear libre: queda un botón; empezar desde él
    await p.click("#visitaMuseo button[data-accion='libre']");
    assert.deepStrictEqual(await p.evaluate(() => [...document.querySelectorAll("#visitaMuseo button")].map(b => b.textContent)), ["Empezar la visita del museo"]);
    await p.click("#visitaMuseo button[data-accion='empieza']");
    await p.evaluate(([x, y, a]) => window.__g.paseoEn(x, y, a), MIRADOR); await p.waitForTimeout(400);
    const conVisita = await mide(), ev = await p.evaluate(() => window.__visita());
    assert.deepStrictEqual([ev.modo, ev.marcas, ev.marcasVisibles, ev.siguiente], ["visita", 3, true, 0]);
    t.diagnostic("fuera " + JSON.stringify(memFuera) + " · dentro sin visita " + JSON.stringify(sinVisita) + " · con visita " + JSON.stringify(conVisita) + " (SwiftShader)");
    const vistas = conVisita.llamadas - sinVisita.llamadas;
    assert.ok(vistas >= 1 && vistas <= 3, "una llamada por marca a la vista (" + vistas + ")");
    assert.strictEqual(conVisita.triangulos - sinVisita.triangulos, 2 * vistas, "dos triángulos por marca");
    assert.strictEqual(conVisita.texturas - sinVisita.texturas, 1, "una textura para todos los números");
    assert.strictEqual(conVisita.geometrias - sinVisita.geometrias, vistas, "una geometría por marca dibujada");
    // la parada 2 (con fuentes): su ficha
    await p.evaluate(([x, y]) => window.__g.paseoEn(x, y, 0), en(1));
    await p.waitForFunction(() => { const h = document.querySelector("#visitaMuseo h3"); return h && h.textContent === "2. La rueda que gira"; }, null, { timeout: 5000, polling: 100 });
    const ficha = await p.evaluate(() => {
      const r = document.getElementById("visitaMuseo"), d = r.querySelector("details");
      return { texto: r.textContent, abierto: d.open, resumen: d.querySelector("summary").textContent, fuentes: [...d.querySelectorAll("li")].map(li => li.textContent), enlaces: [...d.querySelectorAll("a")].map(a => [a.href, a.rel]), anuncio: r.querySelector("[role=status]").textContent };
    });
    assert.match(ficha.texto, /Lo que ves: ilustrativo/); assert.match(ficha.texto, /Lo que cuenta: documentado con fuentes/); assert.match(ficha.texto, /Dato curioso:/);
    assert.strictEqual(ficha.abierto, false, "las fuentes, plegadas"); assert.strictEqual(ficha.resumen, "Fuentes (2)");
    assert.match(ficha.fuentes[1], /^\[2\] .*sin verificar · enlace$/);
    assert.deepStrictEqual(ficha.enlaces, [["https://example.org/ejemplo", "noopener noreferrer"]]);
    assert.strictEqual(ficha.anuncio, "Parada 2: La rueda que gira");
    // «Siguiente parada»: gira sin mover
    const antes = await p.evaluate(() => window.__g.paseoEstado());
    await p.click("#visitaMuseo button[data-accion='siguiente']");
    const despues = await p.evaluate(() => window.__g.paseoEstado());
    assert.ok(Math.hypot(despues.x - antes.x, despues.y - antes.y) < 0.01, "no se mueve");
    const objetivo = Math.atan2(en(2)[0] - antes.x, en(2)[1] - antes.y);
    assert.ok(Math.abs(Math.atan2(Math.sin(despues.ang - objetivo), Math.cos(despues.ang - objetivo))) < 0.05, "mira a la siguiente: " + JSON.stringify(despues));
    // la última: sigue por la puerta de la bodega, que no está en el gemelo
    await p.evaluate(([x, y]) => window.__g.paseoEn(x, y, 0), en(2));
    await p.waitForFunction(() => { const h = document.querySelector("#visitaMuseo h3"); return h && /^3\./.test(h.textContent); }, null, { timeout: 5000, polling: 100 });
    const bot = await p.evaluate(() => [...document.querySelectorAll("#visitaMuseo button")].map(b => [b.textContent, b.disabled]));
    assert.deepStrictEqual(bot, [["Mirar la pieza", false], ["Bodega: próximamente", true], ["Terminar la visita", false]]);
    await p.click("#visitaMuseo button[data-accion='sal']");
    const fin = await p.evaluate(() => window.__visita());
    assert.deepStrictEqual([fin.modo, fin.marcasVisibles], ["libre", false]);
    assert.strictEqual((await mide()).llamadas, sinVisita.llamadas, "sin la visita, las marcas no se dibujan");
    // salir por la principal: no queda nada
    await p.evaluate(() => window.__g.paseoEn(0, 0.2, Math.PI));
    await p.waitForFunction(() => window.__interior().liberado, null, { timeout: 30000, polling: 100 });
    await p.waitForTimeout(500);
    assert.strictEqual(await p.$("#visitaMuseo"), null, "el recuadro se va con el interior");
    const memVuelta = await mide();
    assert.deepStrictEqual([memVuelta.geometrias, memVuelta.texturas], [memFuera.geometrias, memFuera.texturas], "la memoria de GPU vuelve a la de antes de entrar");
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    assert.deepStrictEqual(fallos, [], "peticiones fallidas");
  } finally { await p.close().catch(() => {}); }
});
