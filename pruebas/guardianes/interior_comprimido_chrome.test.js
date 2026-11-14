"use strict";
// Eje B: la v1.3 del mundo interior (contrato mundo-interior §2b, el glb comprimido; ADR-0035) en Chrome headless (SwiftShader), con el cliente web de
// verdad, la CSP del servidor y el ejemplo SINTÉTICO modelos/interiores/ejemplo-comprimido (meshopt + KTX2) servido como «fabrica». Comprueba, sin
// errores de consola, sin avisos de la CSP y sin peticiones fallidas ni a otro origen:
//   · el motor pide el decodificador de meshopt y el KTX2Loader solo porque el glb los usa, y el transcodificador Basis de <página>/basis/; el
//     KTX2Loader se suelta al acabar de leer (__interior().comprimido.cargadoresKtx2 === 0);
//   · lo de la v1.2 sigue igual comprimido: cada material unlit con su lightMap (canal 1, sRGB, π × escala) sobre una textura comprimida, lo de luz
//     propia con su entorno, y las máquinas se mueven (la rueda gira por su pivote: su posición no cambia);
//   · se dibuja lo mismo que sin comprimir (ejemplo-luz: llamadas y triángulos);
//   · al salir no queda nada (geometrías y texturas de renderer.info.memory, también tras una segunda visita).
// SwiftShader no da fps ni la memoria real de la GPU. Sin Chrome, playwright-core, Python o Vite el test se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path, os } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("el interior comprimido en navegador") || saltoPagina("el interior comprimido en navegador");
const EJEMPLOS = { comprimido: path.join(RAIZ, "modelos", "interiores", "ejemplo-comprimido"), luz: path.join(RAIZ, "modelos", "interiores", "ejemplo-luz") };

let srv, navegador, interior;
test.before(async () => {
  if (SALTO) return;
  interior = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-comprimido-"));
  // /fabrica/pantalla/ el comprimido y /luz/pantalla/ el mismo sin comprimir (para comparar lo que se dibuja)
  for (const [k, dir] of Object.entries(EJEMPLOS)) {
    const d = path.join(interior, k, "pantalla"), m = JSON.parse(fs.readFileSync(path.join(dir, "mundo.json"), "utf8"));
    m.id = "fabrica";
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "mundo.json"), JSON.stringify(m)); fs.copyFileSync(path.join(dir, m.glb), path.join(d, m.glb));
  }
  srv = await sirve(montaPagina({ finca: "hituelo" }).carpeta, { csp: true, montajes: { "/fabrica/": path.join(interior, "comprimido") } });
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); if (interior) fs.rmSync(interior, { recursive: true, force: true }); });

test("interior v1.3: glb con meshopt y KTX2, decodificadores del mismo origen y soltados, luz aparte y máquinas como sin comprimir, y al salir no queda nada", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const p = await navegador.newPage({ viewport: { width: 640, height: 400 } }), errores = [], fallos = [], csp = [], pedidas = [];
  const origen = "http://127.0.0.1:" + srv.address().port;
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", m => { const x = m.text(); if (/Content Security Policy/i.test(x)) csp.push(x.slice(0, 300)); else if (m.type() === "error" && !/^\[Report Only\]/.test(x)) errores.push("CONSOLE " + x.slice(0, 300)); });
  p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
  p.on("request", r => { const u = r.url(); if (!u.startsWith(origen) && !/^(data|blob):/.test(u)) fallos.push("OTRO ORIGEN " + u); else pedidas.push(u.slice(origen.length)); });
  const mide = () => p.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => {
    const i = window.__g.renderer.info; ok({ llamadas: i.render.calls, triangulos: i.render.triangles, geometrias: i.memory.geometries, texturas: i.memory.textures });
  }))));
  await p.goto(origen + "/index.html?olivos=0&debug");
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
  await p.evaluate(() => window.__g.paseoEn(-130, -125, 0)); await p.waitForTimeout(3000);
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && (!window.__g.Escena3D || window.__g.Escena3D.listo()), null, { timeout: 60000, polling: 500 });
  await p.waitForTimeout(1000);
  const fuera = await mide();
  assert.ok(!pedidas.some(u => /basis_transcoder|meshopt_decoder|KTX2Loader/i.test(u)), "fuera no se pide ningún decodificador: " + pedidas.filter(u => /basis|meshopt|KTX2/i.test(u)));
  assert.deepStrictEqual(await p.evaluate(() => window.__cambiaMundo("fabrica").then(r => ({ ok: r.ok, mundo: r.mundo }))), { ok: true, mundo: "fabrica" });
  const est = await p.evaluate(() => window.__interior());
  assert.deepStrictEqual({ meshopt: est.comprimido.meshopt, ktx2: est.comprimido.ktx2, cargadoresKtx2: est.comprimido.cargadoresKtx2 }, { meshopt: true, ktx2: true, cargadoresKtx2: 0 }, "comprimido, y el KTX2Loader ya suelto");
  assert.ok(pedidas.some(u => /\/basis\/basis_transcoder\.wasm$/.test(u)) && pedidas.some(u => /\/basis\/basis_transcoder\.js$/.test(u)), "el transcodificador, de <página>/basis/: " + pedidas.filter(u => /basis/.test(u)));
  assert.ok(est.luz.modo === "mapa" && est.luz.mapas >= 2 && est.luz.propia >= 1 && est.luz.entorno, "la luz aparte, como en la v1.2: " + JSON.stringify(est.luz));
  const mats = await p.evaluate(() => {
    const raiz = window.__g.scene.children.find(o => o.getObjectByName && o.getObjectByName("rueda")), sal = { mapas: [], comprimidas: 0, texturas: 0 }, vistas = new Set();
    raiz.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.lightMap) sal.mapas.push({ canal: m.lightMap.channel, cs: m.lightMap.colorSpace, k: m.lightMapIntensity, uv1: !!o.geometry.attributes.uv1, comprimida: !!m.lightMap.isCompressedTexture });
      for (const k of ["map", "lightMap", "aoMap"]) { const tx = m[k]; if (tx && !vistas.has(tx)) { vistas.add(tx); sal.texturas++; if (tx.isCompressedTexture) sal.comprimidas++; } }
    });
    return sal;
  });
  t.diagnostic("texturas en la escena: " + mats.texturas + " (comprimidas " + mats.comprimidas + ") · " + JSON.stringify(mats.mapas));
  assert.ok(mats.mapas.length >= 2, JSON.stringify(mats));
  for (const m of mats.mapas) assert.deepStrictEqual({ canal: m.canal, cs: m.cs, k: m.k, uv1: m.uv1 }, { canal: 1, cs: "srgb", k: Math.PI * 2, uv1: true });
  assert.strictEqual(mats.comprimidas, mats.texturas, "todas las texturas del glb llegan como CompressedTexture del KTX2Loader");
  // las máquinas: la rueda gira por su pivote (su posición no cambia), el pistón va y viene, la correa corre
  const nodos = () => p.evaluate(() => {
    const raiz = window.__g.scene.children.find(o => o.getObjectByName && o.getObjectByName("rueda")), r = raiz.getObjectByName("rueda"), w = r.getWorldPosition(r.position.clone());
    let off = null; raiz.getObjectByName("correa").traverse(o => { if (o.isMesh && o.material.map && off === null) off = o.material.map.offset.y; });
    return { q: [r.quaternion.x, r.quaternion.y, r.quaternion.z, r.quaternion.w], pos: [w.x, w.y, w.z].map(v => Math.round(v * 1000) / 1000), piston: raiz.getObjectByName("piston").position.y, correa: off };
  });
  await p.waitForTimeout(2000);
  const a = await nodos(); await p.waitForTimeout(300); const b = await nodos();
  assert.notDeepStrictEqual(a.q, b.q, "la rueda gira"); assert.deepStrictEqual(b.pos, [0, 1.6, -5.7], "por su pivote"); assert.notStrictEqual(a.piston, b.piston, "el pistón va y viene"); assert.notStrictEqual(a.correa, b.correa, "la correa corre");
  await p.evaluate(() => window.__maquinas("para")); await p.evaluate(() => window.__g.paseoEn(0, 1.2, 0)); await p.waitForTimeout(800);
  const dentro = await mide();
  // salir: no queda nada; y una segunda visita no deja nada más
  await p.evaluate(() => window.__g.paseoEn(0, 0.2, Math.PI));
  await p.waitForFunction(() => window.__interior().liberado, null, { timeout: 30000, polling: 100 });
  await p.waitForTimeout(500);
  const vuelta = await mide();
  assert.strictEqual(vuelta.geometrias, fuera.geometrias, "geometrías: las de antes de entrar");
  assert.ok(vuelta.texturas - fuera.texturas <= 1, "texturas: las de antes de entrar (+ la tabla DFG de three): " + vuelta.texturas + " / " + fuera.texturas);
  assert.strictEqual(await p.evaluate(() => window.__cambiaMundo("fabrica").then(r => r.ok)), true);
  await p.waitForTimeout(1000);
  await p.evaluate(() => window.__g.paseoEn(0, 0.2, Math.PI));
  await p.waitForFunction(() => window.__interior().liberado, null, { timeout: 30000, polling: 100 });
  await p.waitForTimeout(500);
  const vuelta2 = await mide();
  assert.deepStrictEqual([vuelta2.geometrias, vuelta2.texturas], [vuelta.geometrias, vuelta.texturas], "una segunda visita no deja nada");
  assert.strictEqual(await p.evaluate(() => window.__interior().comprimido.cargadoresKtx2), 0, "ningún KTX2Loader vivo");
  await p.close();
  // lo mismo sin comprimir (ejemplo-luz): se dibuja lo mismo
  srv.close();
  srv = await sirve(montaPagina({ finca: "hituelo" }).carpeta, { csp: true, montajes: { "/fabrica/": path.join(interior, "luz") } });
  const q = await navegador.newPage({ viewport: { width: 640, height: 400 } });
  await q.goto("http://127.0.0.1:" + srv.address().port + "/index.html?olivos=0&debug");
  await q.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
  await q.evaluate(() => window.__g.paseoEn(-130, -125, 0)); await q.waitForTimeout(3000);
  await q.waitForFunction(() => window.__g.Cola.pendientes() === 0 && (!window.__g.Escena3D || window.__g.Escena3D.listo()), null, { timeout: 60000, polling: 500 });
  await q.evaluate(() => window.__cambiaMundo("fabrica"));
  await q.evaluate(() => window.__maquinas("para")); await q.evaluate(() => window.__g.paseoEn(0, 1.2, 0)); await q.waitForTimeout(800);
  const sin = await q.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => { const i = window.__g.renderer.info; const e = window.__interior(); ok({ llamadas: i.render.calls, triangulos: i.render.triangles, comprimido: e.comprimido, luz: e.luz }); }))));
  await q.close();
  t.diagnostic("fuera " + JSON.stringify(fuera) + " · dentro comprimido " + JSON.stringify(dentro) + " · sin comprimir " + JSON.stringify(sin) + " · tras salir " + JSON.stringify(vuelta) + " (SwiftShader)");
  assert.deepStrictEqual({ meshopt: sin.comprimido.meshopt, ktx2: sin.comprimido.ktx2 }, { meshopt: false, ktx2: false });
  assert.deepStrictEqual([dentro.llamadas, dentro.triangulos], [sin.llamadas, sin.triangulos], "comprimido o no, se dibuja lo mismo");
  assert.deepStrictEqual(est.luz, sin.luz, "comprimido o no, los mismos mapas de luz, luz propia y entorno");
  assert.deepStrictEqual(errores, [], "errores de consola o de página");
  assert.deepStrictEqual(csp, [], "avisos de la CSP");
  assert.deepStrictEqual(fallos, [], "peticiones fallidas o a otro origen");
});
