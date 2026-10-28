// Banco de presupuesto/streaming: node prueba3.js <url> <prefijo> [escenarios JSON]   (la página se abre con ?debug y se lee su contador)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const url = process.argv[2], pref = process.argv[3] || "cap/p";
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--enable-precise-memory-info"] });
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } }); const err = [], pet = [];
  p.on("pageerror", e => err.push("PAGEERROR " + String(e.stack || e).slice(0, 700))); p.on("console", m => { if (m.type() === "error" && !/claude|mcp|favicon/i.test(m.text())) err.push(m.text().slice(0, 300)); });
  p.on("requestfinished", r => { if (/\/t\//.test(r.url())) pet.push(r.url().split("/").pop()); });
  const t0 = Date.now();
  await p.goto(url + (url.includes("?") ? "&" : "?") + "debug");
  try { await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 120000 }); } catch (e) { console.log("NO LISTO", err.slice(0, 6)); await p.screenshot({ path: pref + "_nolisto.png" }); await b.close(); process.exit(1); }
  console.log("listo en", Date.now() - t0, "ms; peticiones de teselas hasta ahora:", pet.length);
  const E = JSON.parse(process.argv[4] || "null") || [["inicial", null], ["medio", { az: -0.55, el: 0.62, dist: 900, ox: 0, oy: 0, modo: "gem" }], ["cerca", { az: 0.8, el: 0.35, dist: 120, ox: 100, oy: 0, modo: "gem" }]];
  for (const [n, e] of E) {
    if (e) await p.evaluate((e) => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
    await p.waitForTimeout(Number(process.env.ESPERA || 7000));
    const s = await p.evaluate(() => { const g = window.__g, r = g.renderer.info; return { calls: r.render.calls, tri: r.render.triangles, pts: r.render.points, geos: r.memory.geometries, tex: r.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, arb: g.Arboles.resumen(), cargadas: g.Mundo.lista.filter(t => t.estado === 2).length, tot: g.Mundo.lista.length, panel: (document.querySelector("#visor > div[style*=monospace]") || {}).textContent }; });
    console.log(n, JSON.stringify(s)); const bb = await p.locator("#visor").boundingBox(); await p.screenshot({ path: pref + "_" + n + ".png", clip: bb });
  }
  console.log("peticiones de teselas:", pet.length, "· errores:", err.length, err.slice(0, 5)); await b.close();
})();
