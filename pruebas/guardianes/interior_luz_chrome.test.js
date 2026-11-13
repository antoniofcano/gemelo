"use strict";
// Eje B: la v1.2 del mundo interior (contrato mundo-interior §1d la luz aparte, §1e las máquinas; ADR-0034) en Chrome headless (SwiftShader), con el
// cliente web de verdad y el ejemplo SINTÉTICO modelos/interiores/ejemplo-luz servido como «fabrica». Comprueba, sin errores de consola ni peticiones
// fallidas:
//   · la luz aparte: cada material unlit con occlusionTexture lleva su lightMap (canal 1, sRGB, π × escala) y la malla su uv1; lo de luz propia lleva
//     el entorno de la sonda (envMap) y su aoMap en el canal 1, fuera del tone mapping; y la convención de three 0.186 medida en píxeles: un mapa de luz
//     blanco con intensidad π da EXACTAMENTE el albedo (lo mismo que sin mapa de luz: «1 = el albedo tal cual» del contrato);
//   · las máquinas: arrancan al entrar, la rueda gira, el pistón va y viene, la correa corre; el interruptor (el botón del recuadro) las para y no se
//     mueve nada más; con ellas en marcha o paradas se dibuja lo mismo (llamadas, triángulos, geometrías, texturas);
//   · al salir no queda nada: el recuadro, el entorno (un render target del PMREM) y la memoria de GPU vuelven a la de antes de entrar.
// Imprime las medidas (fuera, dentro en marcha y parada, y los ms de JS por fotograma de __g.depuraJs con ?debug). SwiftShader no da fps. Sin Chrome,
// playwright-core, Python o Vite el test se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path, os } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la luz aparte y las máquinas en navegador") || saltoPagina("la luz aparte y las máquinas en navegador");
const EJEMPLO = path.join(RAIZ, "modelos", "interiores", "ejemplo-luz");

let srv, navegador, interior;
test.before(async () => {
  if (SALTO) return;
  interior = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-luz-"));
  const dir = path.join(interior, "pantalla"), m = JSON.parse(fs.readFileSync(path.join(EJEMPLO, "mundo.json"), "utf8"));
  m.id = "fabrica";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "mundo.json"), JSON.stringify(m)); fs.copyFileSync(path.join(EJEMPLO, m.glb), path.join(dir, m.glb));
  srv = await sirve(montaPagina({ finca: "hituelo" }).carpeta, { csp: true, montajes: { "/fabrica/": interior } });
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); if (interior) fs.rmSync(interior, { recursive: true, force: true }); });

test("interior v1.2: mapa de luz aparte (π × escala, medido en píxeles), entorno de la sonda, máquinas con interruptor, y al salir no queda nada", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const p = await navegador.newPage({ viewport: { width: 640, height: 400 } }), errores = [], fallos = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", m => { if (m.type() === "error" && !/^\[Report Only\]/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
  const mide = () => p.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => {
    const i = window.__g.renderer.info, h = performance.memory;
    ok({ llamadas: i.render.calls, triangulos: i.render.triangles, geometrias: i.memory.geometries, texturas: i.memory.textures, heapMb: h ? Math.round(h.usedJSHeapSize / 1048576) : null });
  }))));
  const js = async () => { await p.waitForTimeout(1200); return p.evaluate(() => (window.__g.depuraJs ? window.__g.depuraJs() : null)); };
  try {
    await p.goto("http://127.0.0.1:" + srv.address().port + "/index.html?olivos=0&debug");
    await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
    await p.evaluate(() => window.__g.paseoEn(-130, -125, 0)); await p.waitForTimeout(3000);
    await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && (!window.__g.Escena3D || window.__g.Escena3D.listo()), null, { timeout: 60000, polling: 500 });
    await p.waitForTimeout(1000);
    const fuera = await mide();
    assert.strictEqual(await p.evaluate(() => window.__maquinas()), null, "fuera no hay máquinas");
    const r = await p.evaluate(() => window.__cambiaMundo("fabrica").then(r => ({ ok: r.ok, mundo: r.mundo })));
    assert.deepStrictEqual(r, { ok: true, mundo: "fabrica" });
    const est = await p.evaluate(() => window.__interior());
    assert.deepStrictEqual(est.luz, { modo: "mapa", mapas: est.luz.mapas, propia: est.luz.propia, entorno: true });
    assert.ok(est.luz.mapas >= 2 && est.luz.propia >= 1, "mapas de luz y luz propia: " + JSON.stringify(est.luz));
    // los materiales, mirados en la escena
    const mats = await p.evaluate(() => {
      const raiz = window.__g.scene.children.find(o => o.getObjectByName && o.getObjectByName("rueda")), sal = { mapas: [], propia: [] }, vistos = new Set();
      raiz.traverse(o => {
        if (!o.isMesh || vistos.has(o.material)) return;
        vistos.add(o.material); const m = o.material;
        if (m.lightMap) sal.mapas.push({ canal: m.lightMap.channel, cs: m.lightMap.colorSpace, k: m.lightMapIntensity, uv1: !!o.geometry.attributes.uv1, tono: m.toneMapped, basico: !!m.isMeshBasicMaterial });
        if (m.envMap) sal.propia.push({ ao: m.aoMap ? m.aoMap.channel : null, tono: m.toneMapped, env: m.envMap.mapping });
      });
      return sal;
    });
    assert.ok(mats.mapas.length >= 2 && mats.propia.length >= 1, JSON.stringify(mats));
    for (const m of mats.mapas) assert.deepStrictEqual(m, { canal: 1, cs: "srgb", k: Math.PI * 2, uv1: true, tono: false, basico: true });
    for (const m of mats.propia) { assert.strictEqual(m.ao, 1); assert.strictEqual(m.tono, false); }
    // la convención de three medida en píxeles: con un mapa de luz blanco e intensidad π, el píxel es el del albedo sin mapa de luz
    await p.evaluate(() => window.__g.paseoEn(0, 2.5, 0)); await p.waitForTimeout(500);
    const pi = await p.evaluate(() => {
      const g = window.__g, R = g.renderer, gl = R.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(4);
      const lee = (x, y) => { R.render(g.scene, g.camera); gl.readPixels(Math.floor(W * x), Math.floor(H * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return Array.from(px.slice(0, 3)); };
      const ptos = [[0.5, 0.25], [0.5, 0.6], [0.3, 0.4]];
      const raiz = g.scene.children.find(o => o.getObjectByName && o.getObjectByName("rueda")), mats = new Set();
      raiz.traverse(o => { if (o.isMesh && o.material.lightMap) mats.add(o.material); });
      const guarda = [...mats].map(m => [m, m.lightMap, m.lightMapIntensity]);
      const conMapa = ptos.map(([x, y]) => lee(x, y));
      const c = document.createElement("canvas"); c.width = c.height = 1; const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, 1, 1);
      const blanco = new (guarda[0][1].constructor)(c); blanco.colorSpace = "srgb"; blanco.channel = 1; blanco.needsUpdate = true;
      for (const [m] of guarda) { m.lightMap = blanco; m.lightMapIntensity = Math.PI; m.needsUpdate = true; }
      const conBlanco = ptos.map(([x, y]) => lee(x, y));
      for (const [m] of guarda) { m.lightMap = null; m.needsUpdate = true; }
      const sinMapa = ptos.map(([x, y]) => lee(x, y));
      for (const [m, t, k] of guarda) { m.lightMap = t; m.lightMapIntensity = k; m.needsUpdate = true; }
      blanco.dispose();
      return { conMapa, conBlanco, sinMapa };
    });
    t.diagnostic("píxeles (con mapa · blanco×π · sin mapa): " + JSON.stringify(pi));
    pi.conBlanco.forEach((c, i) => c.forEach((v, k) => assert.ok(Math.abs(v - pi.sinMapa[i][k]) <= 1, "mapa blanco × π = albedo: " + JSON.stringify(pi))));
    assert.ok(pi.conMapa.some((c, i) => c.some((v, k) => Math.abs(v - pi.sinMapa[i][k]) > 3)), "el mapa de luz de verdad cambia la imagen");
    // las máquinas: arrancan solas (rampa) y se mueven
    const nodos = () => p.evaluate(() => {
      const raiz = window.__g.scene.children.find(o => o.getObjectByName && o.getObjectByName("rueda"));
      const q = raiz.getObjectByName("rueda").quaternion, pis = raiz.getObjectByName("piston").position, cor = raiz.getObjectByName("correa");
      let off = null; cor.traverse(o => { if (o.isMesh && o.material.map && off === null) off = o.material.map.offset.y; });
      return { q: [q.x, q.y, q.z, q.w], piston: pis.y, correa: off };
    });
    await p.waitForTimeout(2000);
    const m1 = await p.evaluate(() => window.__maquinas());
    assert.deepStrictEqual([m1.maquinas, m1.piezas, m1.faltan, m1.enMarcha, m1.marcha, m1.interruptor], [4, 4, [], true, 1, true]);
    const a = await nodos(); await p.waitForTimeout(300); const b = await nodos();
    assert.notDeepStrictEqual(a.q, b.q, "la rueda gira"); assert.notStrictEqual(a.piston, b.piston, "el pistón va y viene"); assert.notStrictEqual(a.correa, b.correa, "la correa corre");
    await p.evaluate(() => window.__g.paseoEn(0, 2.5, Math.PI)); await p.waitForTimeout(300);
    await p.evaluate(() => window.__g.paseoEn(0, 1.2, 0)); await p.waitForTimeout(500);
    const enMarcha = await mide(), jsMarcha = await js();
    // el interruptor de la pantalla: un botón de verdad
    assert.deepStrictEqual(await p.evaluate(() => { const b = document.querySelector("#maquinasInterior button"); return [b.textContent, b.getAttribute("aria-pressed")]; }), ["Parar las máquinas", "true"]);
    await p.click("#maquinasInterior button");
    assert.deepStrictEqual(await p.evaluate(() => { const b = document.querySelector("#maquinasInterior button"); return [b.textContent, b.getAttribute("aria-pressed")]; }), ["Poner en marcha las máquinas", "false"]);
    await p.waitForTimeout(2000);
    const c1 = await nodos(); await p.waitForTimeout(300); const c2 = await nodos();
    assert.deepStrictEqual(c1, c2, "paradas: nada se mueve");
    const parada = await mide(), jsParada = await js();
    t.diagnostic("fuera " + JSON.stringify(fuera) + " · dentro, en marcha " + JSON.stringify(enMarcha) + " js " + JSON.stringify(jsMarcha) + " · parada " + JSON.stringify(parada) + " js " + JSON.stringify(jsParada) + " (SwiftShader)");
    for (const k of ["llamadas", "triangulos", "geometrias", "texturas"]) assert.strictEqual(enMarcha[k], parada[k], k + ": en marcha o parada, lo mismo");
    assert.strictEqual((await p.evaluate(() => window.__maquinas("marcha"))).enMarcha, true, "__maquinas('marcha') las pone en marcha");
    // salir por la principal: no queda nada
    await p.evaluate(() => window.__g.paseoEn(0, 0.2, Math.PI));
    await p.waitForFunction(() => window.__interior().liberado, null, { timeout: 30000, polling: 100 });
    await p.waitForTimeout(500);
    assert.strictEqual(await p.$("#maquinasInterior"), null, "el interruptor se va con el interior");
    const vuelta = await mide();
    // una textura de más, y solo la primera vez: la tabla DFG de three (getDFGLUT, una DataTexture global que crea el primer material estándar que se
    // dibuja, y que se queda para siempre). Una segunda visita no deja nada más: eso es lo que dice que no hay fuga.
    assert.strictEqual(vuelta.geometrias, fuera.geometrias, "geometrías: las de antes de entrar");
    assert.ok(vuelta.texturas - fuera.texturas <= 1, "texturas: las de antes de entrar (+ la tabla DFG de three): " + vuelta.texturas + " / " + fuera.texturas);
    assert.strictEqual((await p.evaluate(() => window.__cambiaMundo("fabrica").then(r => r.ok))), true);
    await p.waitForTimeout(1000);
    await p.evaluate(() => window.__g.paseoEn(0, 0.2, Math.PI));
    await p.waitForFunction(() => window.__interior().liberado, null, { timeout: 30000, polling: 100 });
    await p.waitForTimeout(500);
    const vuelta2 = await mide();
    t.diagnostic("tras salir " + JSON.stringify(vuelta) + " · tras una segunda visita " + JSON.stringify(vuelta2));
    assert.deepStrictEqual([vuelta2.geometrias, vuelta2.texturas], [vuelta.geometrias, vuelta.texturas], "una segunda visita no deja nada");
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    assert.deepStrictEqual(fallos, [], "peticiones fallidas");
  } finally { await p.close().catch(() => {}); }
});
