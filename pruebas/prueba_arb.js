// Banco de los árboles: node prueba_arb.js <ruta de la página bajo gemelo_v2, p. ej. /arb_out/base_cerro.html> <prefijo de capturas> [escenarios separados por comas]
// Sirve gemelo_v2 como http://gem.test/ (sin servidor: se intercepta la red) y mide, para cada escenario, el tiempo hasta que los olivos de nivel 0 de la vista están construidos.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const fs = require("fs"), path = require("path");
const ROOT = process.env.GEMELO_RAIZ || ".", ruta = process.argv[2], pref = process.argv[3] || "arb_out/cap/x", SOLO = (process.argv[4] || "").split(",").filter(Boolean);
const MIME = { ".html": "text/html", ".json": "application/json", ".jpg": "image/jpeg", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--enable-precise-memory-info"] });
  const ctx = await b.newContext({ viewport: { width: Number(process.env.VW || 1100), height: Number(process.env.VH || 720) } });
  await ctx.route("http://gem.test/**", r => {
    const u = new URL(r.request().url()), f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || "application/octet-stream" }); else r.fulfill({ status: 404, body: "" });
  });
  const p = await ctx.newPage(); const err = [];
  p.on("pageerror", e => err.push("PAGEERROR " + String(e.stack || e).slice(0, 600)));
  p.on("console", m => { if (m.type() === "error" && !/claude|mcp|favicon|ERR_FAILED|net::|404/i.test(m.text())) err.push(m.text().slice(0, 300)); });
  const t0 = Date.now(); await p.goto("http://gem.test/" + ruta.replace(/^[\/]+/, "") + (ruta.includes("?") ? "&debug" : "?debug"));
  try { await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 120000 }); } catch (e) { console.log("NO LISTO", err); await b.close(); process.exit(1); }
  console.log("listo en", Date.now() - t0, "ms");
  // el punto más denso de olivos (para que la medida sea la misma en las dos versiones)
  const C = await p.evaluate(() => { const g = window.__g, cs = g.copas.filter(c => c.oliv); let best = null, bn = -1; for (let i = 0; i < cs.length; i += Math.ceil(cs.length / 400)) { let n = 0; for (const o of cs) if (Math.hypot(o.x - cs[i].x, o.y - cs[i].y) < 60) n++; if (n > bn) { bn = n; best = cs[i]; } } return { x: best.x, y: best.y, vecinos: bn }; });
  if (process.env.FOCO_ACTUAL) { const f = await p.evaluate(() => ({ x: window.__g.objetivo.x, y: -window.__g.objetivo.z })); C.x = f.x; C.y = f.y; }
  console.log("centro de prueba", JSON.stringify(C));
  const poner = (o) => p.evaluate(({ o, C }) => { const g = window.__g; g.orb.az = o.az; g.orb.el = o.el; g.orb.dist = o.dist; g.objetivo.x = C.x; g.objetivo.z = -C.y; g.objetivo.y = g.suelo(C.x, C.y) + 3; }, { o, C });
  const mide = (tope) => p.evaluate((tope) => new Promise(res => {
    const g = window.__g, t0 = performance.now(); let fr = 0, mx = 0, tp = t0; const est0 = JSON.parse(JSON.stringify(g.Cola.est.C || { n: 0, ms: 0, max: 0 }));
    (function tic() { const t = performance.now(); fr++; mx = Math.max(mx, t - tp); tp = t;
      const cs = Object.values(g.Arboles.celdas), quer = cs.filter(c => c.en), listas = quer.filter(c => c.g && !c.sucia && c.g.visible), r = g.Arboles.resumen();
      if ((quer.length > 0 && listas.length === quer.length) || t - t0 > tope) { const e = g.Cola.est.C || { n: 0, ms: 0, max: 0 }; res({ ms: Math.round(t - t0), tope: t - t0 > tope, quieren: quer.length, listas: listas.length, fotogramas: fr, msPorFotograma: Math.round((t - t0) / fr), fotogramaMax: Math.round(mx), rebanadasC: e.n - est0.n, msTrabajoC: Math.round(e.ms - est0.ms), rebMaxC: Math.round(e.max), n0: r.nivel0, n1: r.nivel1, n2: r.nivel2 }); return; }
      requestAnimationFrame(tic); })();
  }), tope);
  const estado = () => p.evaluate(() => { const g = window.__g, r = g.renderer.info; return { calls: r.render.calls, tri: r.render.triangles, pts: r.render.points, geos: r.memory.geometries, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, arb: g.Arboles.resumen() }; });
  const cap = async (n) => { await p.locator("#visor").screenshot({ path: path.join(ROOT, pref + "_" + n + ".png"), timeout: 180000 }); };
  const queSi = n => !SOLO.length || SOLO.includes(n);
  const R = {};
  const DIRECTO = process.env.DIRECTO || "";
  if (DIRECTO) {
    if (process.env.FRAMES_NUBE) await p.evaluate(n => new Promise(r => { let k = 0; (function f() { if (++k >= n) r(); else requestAnimationFrame(f); })(); }), Number(process.env.FRAMES_NUBE)); else await p.waitForTimeout(Number(process.env.ESPERA_NUBE || 4000));
    if (DIRECTO === "cerca") { await p.evaluate(() => window.__g.pon("gem")); await poner({ az: 0.8, el: 0.35, dist: 140 }); R.directo_cerca = await mide(120000); await p.waitForTimeout(1200); R.directo_cerca.estado = await estado(); await cap("d_cerca"); console.log("directo_cerca", JSON.stringify(R.directo_cerca)); }
    if (DIRECTO === "paseo") { await p.evaluate(() => window.__g.pon("gem")); await p.evaluate(() => document.getElementById("btnPaseo").click()); R.directo_paseo = await mide(120000); await p.waitForTimeout(1500); R.directo_paseo.estado = await estado(); await cap("d_paseo", true); console.log("directo_paseo", JSON.stringify(R.directo_paseo)); }
    fs.writeFileSync(path.join(ROOT, pref + "_directo_" + DIRECTO + ".json"), JSON.stringify(R, null, 1)); console.log("errores:", err.length, err.slice(0, 5)); await b.close(); return;
  }
  // 1) al pulsar «Gemelo» en la vista inicial
  await p.evaluate(() => window.__g.pon("gem")); R.gem_inicial = await mide(5000); await p.waitForTimeout(1500); R.gem_inicial.estado = await estado(); await cap("0_inicial"); console.log("gem_inicial", JSON.stringify(R.gem_inicial));
  // 2) orbita media y cerca
  if (queSi("medio")) { await poner({ az: -0.55, el: 0.62, dist: 600 }); R.medio = await mide(60000); await p.waitForTimeout(1500); R.medio.estado = await estado(); await cap("1_medio"); console.log("medio", JSON.stringify(R.medio)); }
  if (queSi("l1")) { await poner({ az: -0.3, el: 0.22, dist: 330 }); R.l1 = await mide(60000); await p.waitForTimeout(1500); R.l1.estado = await estado(); await cap("1b_l1"); console.log("l1", JSON.stringify(R.l1)); }
  if (queSi("bajo")) { await poner({ az: 0.8, el: 0.05, dist: 45 }); R.bajo = await mide(120000); await p.waitForTimeout(1500); R.bajo.estado = await estado(); await cap("2b_bajo"); console.log("bajo", JSON.stringify(R.bajo)); }
  if (queSi("cerca")) { await poner({ az: 0.8, el: 0.35, dist: 140 }); R.cerca = await mide(90000); await p.waitForTimeout(1500); R.cerca.estado = await estado(); await cap("2_cerca"); console.log("cerca", JSON.stringify(R.cerca)); }
  // 3) salto de cámara a otro sitio a baja altura (tiempo hasta ver árboles buenos tras un viaje)
  if (queSi("salto")) { await poner({ az: 2.2, el: 0.3, dist: 120 }); await p.evaluate(() => { const g = window.__g, cs = g.copas.filter(c => c.oliv), o = cs[Math.floor(cs.length * 0.8)]; g.objetivo.x = o.x; g.objetivo.z = -o.y; g.objetivo.y = g.suelo(o.x, o.y) + 3; }); R.salto = await mide(90000); await p.waitForTimeout(1200); R.salto.estado = await estado(); await cap("3_salto"); console.log("salto", JSON.stringify(R.salto)); }
  // 4) paseo
  if (queSi("paseo")) { await p.evaluate(() => document.getElementById("btnPaseo").click()); R.paseo = await mide(90000); await p.waitForTimeout(2500); R.paseo.estado = await estado(); await cap("4_paseo", true); console.log("paseo", JSON.stringify(R.paseo));
    await p.keyboard.down("KeyW"); await p.waitForTimeout(8000); await p.keyboard.up("KeyW"); R.paseo_andando = await p.evaluate(() => { const cs = Object.values(window.__g.Arboles.celdas), q = cs.filter(c => c.en); return { quieren: q.length, listas: q.filter(c => c.g && !c.sucia).length, cola: window.__g.Cola.pendientes() }; }); await cap("5_andando", true); console.log("andando", JSON.stringify(R.paseo_andando)); }
  fs.writeFileSync(path.join(ROOT, pref + "_medidas.json"), JSON.stringify(R, null, 1));
  console.log("errores:", err.length, err.slice(0, 5)); await b.close();
})();
