// Perillas de rendimiento VR por URL (Q0b) con el WebXR simulado (mock_xr.js). ESCRITA SIN EJECUTAR: la pasa el banco (npm run banco:encarga), no un agente ligero.
// Uso: node pruebas/prueba_vr_perillas.js <url_de_la_pagina>   (sin parámetros xr en la URL; la prueba los añade)
// Comprueba, por caso, que window.__vrDebug().xr trae las perillas efectivas, que el mock registra la frecuencia pedida ("fps N") y que con nivel fijo el controlador no mueve el nivel.
// Es lógica, no rendimiento: SwiftShader no da fps y esto no dice nada de un casco real (CLAUDE.md, reglas 7 y 11).
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const url = process.argv[2] || process.env.GEMELO_URL;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const casos = [
  { q: "", esperado: { fov: 1, escala: 0.9, hz: 72, aa: true, nivelFijo: null, adaptativo: true }, registro: "fps 72" },
  { q: "xrfov=0.5&xrescala=1.1&xrhz=90&xraa=0&xrnivel=2", esperado: { fov: 0.5, escala: 1.1, hz: 90, aa: false, nivelFijo: 2, adaptativo: false }, registro: "fps 90", nivel: 2 },
  { q: "xrhz=120&xrfov=7", esperado: { fov: 1, escala: 0.9, hz: 72, aa: true, nivelFijo: null, adaptativo: true }, registro: "fps 72", ignorados: ["xrhz", "xrfov"] }   // el mock anuncia [72, 90]: 120 no está
];
(async () => {
  if (!url) { console.log("falta la URL"); process.exit(2); }
  const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
  let fallos = 0; const ok = (n, c, d) => { console.log((c ? "OK   " : "FALLA") + " " + n + (d !== undefined ? "  " + JSON.stringify(d) : "")); if (!c) fallos++; };
  for (const c of casos) {
    const p = await b.newPage({ viewport: { width: 640, height: 400 } }), err = [];
    p.on("pageerror", e => err.push(String(e)));
    await p.addInitScript({ content: fs.readFileSync(path.join(__dirname, "mock_xr.js"), "utf8") });
    await p.goto(url + (url.includes("?") ? "&" : "?") + "debug" + (c.q ? "&" + c.q : ""), { waitUntil: "load" });
    await p.waitForFunction(() => document.querySelector("#lienzo") && window.__vrDebug, null, { timeout: 120000 });
    await dormir(8000);
    await p.click("#btnVR"); await dormir(4000);
    const d = await p.evaluate(() => window.__vrDebug()), reg = await p.evaluate(() => window.__mockXR.registro.slice());
    const x = d.xr || {}, tag = "[" + (c.q || "sin perillas") + "] ";
    ok(tag + "entra en VR", d.on === true);
    Object.keys(c.esperado).forEach(k => ok(tag + "xr." + k, x[k] === c.esperado[k], { tiene: x[k], quiere: c.esperado[k] }));
    ok(tag + "el mock recibió la frecuencia " + c.registro, reg.indexOf(c.registro) >= 0, reg.filter(r => /^fps/.test(r)));
    if (c.ignorados) ok(tag + "lo ignorado queda anotado", c.ignorados.every(k => (x.ignorados || []).some(i => i.param === k)), x.ignorados);
    ok(tag + "la línea del panel y del informe", /^VR: fov /.test(x.linea || ""), x.linea);
    if (c.nivel != null) {
      await dormir(30000);   // el controlador adaptativo tardaría 4 s en bajar: con nivel fijo no se mueve
      const d2 = await p.evaluate(() => window.__vrDebug());
      ok(tag + "el nivel sigue fijo tras 30 s", d2.nivel === c.nivel, { nivel: d2.nivel });
    }
    ok(tag + "sin errores de página", err.length === 0, err.slice(0, 3));
    await p.close();
  }
  await b.close(); console.log("FALLOS", fallos); process.exit(fallos ? 1 : 0);
})();
