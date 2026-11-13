"use strict";
// Eje B: el mundo interior genérico en Chrome headless (SwiftShader), con el cliente web de verdad (Vite) y el ejemplo SINTÉTICO del contrato
// (modelos/interiores/ejemplo, servido como si fuera «patios» junto a la página: <página>/patios/pantalla/, como /teselas/<finca>/<mundo>/<perfil>/
// en Caddy). Comprueba, sin errores de consola ni peticiones fallidas: que el exterior no pide nada del interior hasta entrar (trozo perezoso), que
// __cambiaMundo("patios") lo carga (perfil «pantalla» en escritorio) y lo cuelga, que andar hasta el umbral de su puerta principal vuelve al
// exterior, y que al salir la memoria de GPU (renderer.info.memory: geometrías y texturas) vuelve a la de antes de entrar (libera()).
// Los interiores de verdad (patios, fábrica) están fuera del repo: se comprueban a mano (doc/sistema/MUNDOS.md, «Interiores del eje B»).
// SwiftShader no da fps. Sin Chrome, playwright-core, Python o Vite el test se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path, os } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("el interior en navegador") || saltoPagina("el interior en navegador");
const EJEMPLO = path.join(RAIZ, "modelos", "interiores", "ejemplo");

let srv, navegador, interior;
test.before(async () => {
  if (SALTO) return;
  // el ejemplo, con id «patios» (el contrato pide que el id sea el de su carpeta): solo en una carpeta temporal, nunca en el repo
  interior = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-interior-"));
  const dir = path.join(interior, "pantalla"), m = JSON.parse(fs.readFileSync(path.join(EJEMPLO, "mundo.json"), "utf8"));
  fs.mkdirSync(dir, { recursive: true }); m.id = "patios"; m.puertas.forEach(p => { if (p.a === "sala-ejemplo") p.a = "patios"; });
  fs.writeFileSync(path.join(dir, "mundo.json"), JSON.stringify(m)); fs.copyFileSync(path.join(EJEMPLO, m.glb), path.join(dir, m.glb));
  const peticiones = [];
  srv = await sirve(montaPagina({ finca: "hituelo" }).carpeta, { csp: true, peticiones, montajes: { "/patios/": interior } });
  srv.peticiones = peticiones;
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); if (interior) fs.rmSync(interior, { recursive: true, force: true }); });

test("interior: perezoso, carga el ejemplo del contrato, se cruza su puerta y al volver la memoria de GPU es la de antes", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const p = await navegador.newPage({ viewport: { width: 450, height: 325 } }), errores = [], fallos = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", m => { if (m.type() === "error" && !/^\[Report Only\]/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
  try {
    await p.goto("http://127.0.0.1:" + srv.address().port + "/index.html?olivos=0&debug");
    await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
    // en el paseo ANTES de entrar: al volver, el exterior pone a quien mira donde lo dejó (su retorno) con la misma cámara, y no pide teselas nuevas
    await p.evaluate(() => window.__g.paseoEn(-130, -125, 0)); await p.waitForTimeout(4000);
    await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && (!window.__g.Escena3D || window.__g.Escena3D.listo()), null, { timeout: 60000, polling: 500 });
    await p.waitForTimeout(1500);
    const mem = () => p.evaluate(() => { const m = window.__g.renderer.info.memory; return { geometrias: m.geometries, texturas: m.textures }; });
    assert.deepStrictEqual(srv.peticiones.filter(u => u.startsWith("/patios/")), [], "el exterior no pide nada del interior");
    const antes = await mem();
    const r = await p.evaluate(() => window.__cambiaMundo("patios").then(r => ({ ok: r.ok, motivo: r.motivo, mundo: r.mundo })));
    assert.deepStrictEqual(r, { ok: true, motivo: undefined, mundo: "patios" }, "entra en el interior");
    assert.deepStrictEqual(srv.peticiones.filter(u => u.startsWith("/patios/")), ["/patios/pantalla/mundo.json", "/patios/pantalla/sala.glb"], "en escritorio, la carpeta «pantalla»");
    await p.waitForTimeout(1000);
    const est = await p.evaluate(() => window.__interior());
    assert.strictEqual(est.colgado, true); assert.strictEqual(est.perfil, "pantalla");
    const dentro = await mem(), paseo = await p.evaluate(() => window.__g.paseoEstado());
    t.diagnostic("memoria antes " + JSON.stringify(antes) + ", dentro " + JSON.stringify(dentro) + "; interior " + JSON.stringify(est) + "; pose " + JSON.stringify(paseo));
    assert.ok(dentro.geometrias > antes.geometrias, "el interior sube a la GPU sus geometrías");
    assert.ok(Math.abs(paseo.x) < 0.01 && Math.abs(paseo.y - 1.5) < 0.01, "quien mira, en la llegada de la principal (0, 1,5)");
    // andar hasta el umbral de la principal (en el ejemplo, en el origen): se vuelve al exterior y el interior se libera
    await p.evaluate(() => window.__g.paseoEn(0, 0.2, Math.PI));
    await p.waitForFunction(() => window.__interior().liberado, null, { timeout: 30000, polling: 100 });
    const despues = await mem();
    t.diagnostic("memoria al volver " + JSON.stringify(despues));
    assert.deepStrictEqual(despues, antes, "al salir, la memoria de GPU vuelve a la de antes de entrar (libera())");
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    assert.deepStrictEqual(fallos, [], "peticiones fallidas");
  } finally { await p.close().catch(() => {}); }
});
