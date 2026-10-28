// node vistas2.js <url> <prefijo> '<[[nombre,{e,n,az,el,dist,modo,espera?}],...]>'  (e,n = UTM del punto mirado). Hora fija a mediodía.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const url = process.argv[2], pref = process.argv[3], E = JSON.parse(process.argv[4]);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } }); const err = [];
  await p.clock.setFixedTime(new Date(process.env.FECHA || "2026-10-27T12:00:00"));
  p.on("pageerror", e => err.push("PAGEERROR " + String(e.stack || e).slice(0, 600))); p.on("console", m => { if (m.type() === "error" && !/claude|mcp|favicon|404/i.test(m.text())) err.push(m.text().slice(0, 300)); });
  await p.goto(url + (url.includes("?") ? "&" : "?") + "debug"); await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 300000 });
  for (const [n, e] of E) {
    await p.evaluate((e) => { const g = window.__g, M = g.Mundo, x = e.e - M.cx, y = e.n - M.cy; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = x; g.objetivo.z = -y; g.objetivo.y = g.suelo(x, y) + 1; g.pon(e.modo || "gem"); }, e);
    await p.waitForFunction(() => window.__g.Mundo.lista.filter(t => t.uni && t.uni.uDet && t.uni.uDet.value > 0.5).length >= 2 && window.__g.Cola.pendientes() <= 4, null, { timeout: 500000, polling: 4000 }).catch(() => {});
    if (e.dbg) await p.evaluate((d) => { window.__g.Terreno.UN.uDetDbg.value = d; }, e.dbg);
    await p.waitForTimeout(e.espera || 25000);
    const info = await p.evaluate(() => { const i = window.__g.renderer.info; return { calls: i.render.calls, tri: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; });
    await p.locator("#visor").screenshot({ path: pref + "_" + n + ".png", timeout: 400000 }); console.log("captura", n, JSON.stringify(info));
  }
  console.log("errores:", err.length, err.slice(0, 5)); await b.close();
})();
