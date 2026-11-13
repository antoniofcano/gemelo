"use strict";
// Eje B, la puerta del cortijo, en Chrome headless (SwiftShader) con el cliente web de verdad (Vite) y el ejemplo SINTÉTICO del contrato servido como
// «patios» (con su anclaje de ejemplo, v1.1: en (0, −150) del fixture, el +Z al norte) y como «fabrica» (sin anclaje). Con ?porton=1 (en el servidor lo
// enciende D.base /teselas/…). Comprueba, sin errores de consola ni peticiones fallidas:
//   · al arrancar solo se piden los mundo.json (no los glb) y hay una marca en el exterior;
//   · a 60 m del umbral no pasa nada; a 45 m se precarga (se pide el glb) sin subir nada a la GPU; a 130 m se suelta;
//   · «Ir al cortijo» deja delante de la puerta, mirándola; en quad, al cruzar se entra en los patios por su llegada, la dirección dice ?mundo=patios,
//     dentro no hay quad ni dron, y al salir por la puerta se aparece fuera, mirando hacia fuera, otra vez en el quad, sin ?mundo=;
//   · la memoria de GPU (renderer.info.memory) al volver es la de antes de precargar.
// Da en el diagnóstico los recuentos (llamadas, triángulos, memoria de GPU y heap) en cada paso. SwiftShader no da fps.
// Sin Chrome, playwright-core, Python o Vite el test se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path, os } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la puerta del cortijo en navegador") || saltoPagina("la puerta del cortijo en navegador");
const EJEMPLO = path.join(RAIZ, "modelos", "interiores", "ejemplo");

let srv, navegador, tmp;
function copia(id, conAnclaje) {
  const dir = path.join(tmp, id, "pantalla"), m = JSON.parse(fs.readFileSync(path.join(EJEMPLO, "mundo.json"), "utf8"));
  fs.mkdirSync(dir, { recursive: true }); m.id = id; if (!conAnclaje) delete m.anclaje;
  fs.writeFileSync(path.join(dir, "mundo.json"), JSON.stringify(m)); fs.copyFileSync(path.join(EJEMPLO, m.glb), path.join(dir, m.glb));
  return m;
}
let MAN;
test.before(async () => {
  if (SALTO) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-porton-"));
  MAN = copia("patios", true); copia("fabrica", false);
  const peticiones = [];
  srv = await sirve(montaPagina({ finca: "hituelo" }).carpeta, { csp: true, peticiones, montajes: { "/patios/": path.join(tmp, "patios"), "/fabrica/": path.join(tmp, "fabrica") } });
  srv.peticiones = peticiones;
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

test("la puerta del cortijo: marca, precarga y suelta, «Ir al cortijo», entrar en quad, sin dron dentro, salir delante y la dirección", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const p = await navegador.newPage({ viewport: { width: 450, height: 325 } }), errores = [], fallos = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", m => { if (m.type() === "error" && !/^\[Report Only\]/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
  const [ax, ay] = MAN.anclaje.pos;
  const pidio = pre => srv.peticiones.filter(u => u.startsWith(pre));
  // los recuentos de un momento: llamadas y triángulos del último fotograma, memoria de GPU y heap de JS
  const mide = async que => {
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => { const i = window.__g.renderer.info; return { llamadas: i.render.calls, triangulos: i.render.triangles, geometrias: i.memory.geometries, texturas: i.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
    t.diagnostic(que + ": " + JSON.stringify(m)); return m;
  };
  const pulsa = code => p.evaluate(c => window.dispatchEvent(new KeyboardEvent("keydown", { code: c })), code);
  const pulsado = id => p.evaluate(i => document.getElementById(i).getAttribute("aria-pressed"), id);
  try {
    await p.goto("http://127.0.0.1:" + srv.address().port + "/index.html?olivos=0&debug&porton=1");
    await p.waitForFunction(() => window.__g && window.__g.listo() && window.__porton && window.__porton() && window.__porton().accesos.length === 1, null, { timeout: 60000 });
    const e0 = await p.evaluate(() => window.__porton());
    assert.deepStrictEqual(pidio("/patios/").concat(pidio("/fabrica/")), ["/patios/pantalla/mundo.json", "/fabrica/pantalla/mundo.json"], "al arrancar, solo los manifiestos");
    assert.strictEqual(e0.marcas, 1, "una marca en el exterior");
    assert.ok(Math.abs(e0.accesos[0].x - ax) < 1e-6 && Math.abs(e0.accesos[0].y - ay) < 1e-6, "en el anclaje");
    // lejos (130 m): sin precarga
    await p.evaluate(([x, y]) => window.__g.paseoEn(x, y, Math.PI), [ax, ay + 130]);
    await p.waitForTimeout(3000);
    await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && (!window.__g.Escena3D || window.__g.Escena3D.listo()), null, { timeout: 60000, polling: 500 });
    // el quad sube sus geometrías y su brillo a la GPU la primera vez que se dibuja: que eso vaya en la referencia, no en la cuenta del interior
    await pulsa("KeyQ"); await p.waitForTimeout(500); await pulsa("KeyQ");
    const lejos = await mide("exterior, a 130 m de la puerta");
    // a 60 m (entre PRECARGA y SUELTA): nada; a 45 m: se precarga el glb, sin subir nada a la GPU (se compara con lo de 60 m: las teselas son las mismas)
    await p.evaluate(([x, y]) => window.__g.paseoEn(x, y, Math.PI), [ax, ay + 60]);
    await p.waitForTimeout(2500);
    await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && (!window.__g.Escena3D || window.__g.Escena3D.listo()), null, { timeout: 60000, polling: 500 });
    assert.deepStrictEqual(pidio("/patios/"), ["/patios/pantalla/mundo.json"], "a 60 m no se precarga");
    const antes = await mide("exterior, a 60 m de la puerta (sin precarga)");
    await p.evaluate(([x, y]) => window.__g.paseoEn(x, y, Math.PI), [ax, ay + 45]);
    await p.waitForFunction(() => window.__interior() && window.__interior().precargado, null, { timeout: 30000, polling: 200 });
    assert.deepStrictEqual(pidio("/patios/"), ["/patios/pantalla/mundo.json", "/patios/pantalla/mundo.json", "/patios/pantalla/sala.glb"], "la precarga pide el glb");
    const cerca = await mide("exterior, a 45 m, precargado");
    assert.strictEqual(cerca.texturas, antes.texturas, "la precarga no sube texturas a la GPU"); assert.strictEqual(cerca.geometrias, antes.geometrias, "ni geometrías");
    // a 130 m otra vez: se suelta
    await p.evaluate(([x, y]) => window.__g.paseoEn(x, y, Math.PI), [ax, ay + 130]);
    await p.waitForFunction(() => !window.__interior().precargado && window.__interior().liberado, null, { timeout: 30000, polling: 200 });
    assert.strictEqual((await p.evaluate(() => window.__porton())).sueltas, 1);
    // «Ir al cortijo»: a 8 m de la puerta, mirándola (al sur); se vuelve a precargar
    assert.strictEqual(await p.evaluate(() => window.__irAlCortijo()), true);
    await p.waitForTimeout(800);
    const fr = await p.evaluate(() => window.__g.paseoEstado());
    assert.ok(Math.abs(fr.x - ax) < 0.6 && Math.abs(fr.y - (ay + 8)) < 0.6 && Math.abs(Math.cos(fr.ang) + 1) < 1e-3, "delante de la puerta, mirándola: " + JSON.stringify(fr));
    await p.waitForFunction(() => window.__interior().precargado, null, { timeout: 30000, polling: 200 });
    // en quad hasta el umbral: se entra en los patios por su llegada
    await pulsa("KeyQ"); assert.strictEqual(await pulsado("btnQuad"), "true", "en quad");
    await p.evaluate(([x, y]) => window.__g.paseoEn(x, y, Math.PI), [ax, ay + 0.4]);
    await p.waitForFunction(() => window.__interior().colgado, null, { timeout: 30000, polling: 100 });
    await p.waitForTimeout(800);
    const dentroPose = await p.evaluate(() => window.__g.paseoEstado());
    assert.ok(Math.abs(dentroPose.x) < 0.01 && Math.abs(dentroPose.y - 1.5) < 0.01, "en la llegada de la principal: " + JSON.stringify(dentroPose));
    assert.match(await p.evaluate(() => location.search), /[?&]mundo=patios(&|$)/, "la dirección dice ?mundo=patios");
    assert.strictEqual(await pulsado("btnQuad"), "false", "dentro no hay quad");
    await pulsa("KeyE"); await pulsa("KeyQ");
    assert.strictEqual(await pulsado("btnDron"), "false", "dentro no hay dron"); assert.strictEqual(await pulsado("btnQuad"), "false");
    assert.match(await p.evaluate(() => document.getElementById("hudAvisos").textContent), /dron|quad/, "y se dice");
    assert.deepStrictEqual(pidio("/patios/").length, 5, "la carga aprovechó la segunda precarga: " + JSON.stringify(pidio("/patios/")));
    const dentro = await mide("dentro de los patios (el ejemplo sintético)");
    // salir por la puerta: fuera, delante, mirando hacia fuera, otra vez en el quad, sin ?mundo=
    await p.evaluate(() => window.__g.paseoEn(0, 0.2, Math.PI));
    await p.waitForFunction(() => window.__interior().liberado, null, { timeout: 30000, polling: 100 });
    await p.waitForTimeout(800);
    const fuera = await p.evaluate(() => window.__g.paseoEstado());
    assert.ok(Math.abs(fuera.x - ax) < 0.6 && Math.abs(fuera.y - (ay + 3)) < 0.6 && Math.abs(Math.cos(fuera.ang) - 1) < 1e-3, "delante de la puerta, mirando hacia fuera: " + JSON.stringify(fuera));
    assert.doesNotMatch(await p.evaluate(() => location.search), /mundo=/, "fuera, la dirección sin ?mundo=");
    assert.strictEqual(await pulsado("btnQuad"), "true", "otra vez en el quad");
    const vuelta = await mide("exterior, al salir (precarga soltada al entrar)");
    // y otra vez a 130 m: la memoria de GPU, la de antes de precargar
    await pulsa("KeyQ");
    await p.evaluate(([x, y]) => window.__g.paseoEn(x, y, Math.PI), [ax, ay + 130]);
    await p.waitForTimeout(1500);
    const fin = await mide("exterior, de nuevo a 130 m");
    // (la de antes de precargar, a 60 m: al pasar por ahí el exterior cargó sus teselas cercanas, que se quedan en su caché)
    assert.deepStrictEqual([fin.geometrias, fin.texturas], [antes.geometrias, antes.texturas], "la memoria de GPU vuelve a la de antes de precargar");
    assert.ok(dentro.geometrias > lejos.geometrias, "dentro, las del interior"); assert.ok(vuelta);
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    assert.deepStrictEqual(fallos, [], "peticiones fallidas");
  } finally { await p.close().catch(() => {}); }
});
