// El aparato (AG-0.3, apps/web/motor/01a_aparato.js) con el WebXR simulado (mock_xr.js). ESCRITA SIN EJECUTAR: la pasa el banco (npm run banco:encarga), no un agente ligero.
// Uso: node pruebas/prueba_aparato_vr.js <url_de_la_pagina>
// Dos casos: (1) Chrome de escritorio normal y (2) el mismo Chrome con el agente de unas Quest 3 (userAgent cambiado en el contexto). En cada uno:
//   antes de entrar en VR, window.__aparato() trae clase/modelo/capacidades medidas (WebGL2, MSAA máximo, textura máxima) y vr = false;
//   tras pulsar «Entrar en VR» (el mock), vr = true, capacidades.vr trae la frecuencia que da el mock y ?debug muestra «Aparato: … · VR · …»;
//   el estado NO contiene el agente completo; sin errores de página.
// Es lógica, no rendimiento: SwiftShader no da fps ni dice qué mide un Quest real (CLAUDE.md, reglas 7 y 11); lo que mide el WebGL de aquí no vale para las gafas.
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const url = process.argv[2] || process.env.GEMELO_URL;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const UA_QUEST3 = "Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.0.0.1.58 SamsungBrowser/4.0 Chrome/126.0.0.0 VR Safari/537.36";
const casos = [
  { nombre: "escritorio", ua: null, clase: "escritorio", modelo: "", perfil: "escritorio" },
  { nombre: "agente de Quest 3", ua: UA_QUEST3, clase: "quest", modelo: "quest-3", perfil: "gafas" }
];
(async () => {
  if (!url) { console.log("falta la URL"); process.exit(2); }
  const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
  let fallos = 0; const ok = (n, c, d) => { console.log((c ? "OK   " : "FALLA") + " " + n + (d !== undefined ? "  " + JSON.stringify(d) : "")); if (!c) fallos++; };
  for (const c of casos) {
    const ctx = await b.newContext({ viewport: { width: 640, height: 400 }, userAgent: c.ua || undefined }), p = await ctx.newPage(), err = [], tag = "[" + c.nombre + "] ";
    p.on("pageerror", e => err.push(String(e)));
    await p.addInitScript({ content: fs.readFileSync(path.join(__dirname, "mock_xr.js"), "utf8") });
    await p.goto(url + (url.includes("?") ? "&" : "?") + "debug", { waitUntil: "load" });
    await p.waitForFunction(() => document.querySelector("#lienzo") && window.__vrDebug && window.__aparato, null, { timeout: 120000 });
    await dormir(8000);
    const antes = await p.evaluate(() => window.__aparato());
    ok(tag + "clase y modelo", antes.clase === c.clase && antes.modelo === c.modelo, { clase: antes.clase, modelo: antes.modelo });
    ok(tag + "perfil de olivos", antes.politica.perfilOlivos === c.perfil, antes.politica.perfilOlivos);
    ok(tag + "fuera de VR: vr = false y sin bloque vr", antes.vr === false && antes.capacidades.vr === null);
    ok(tag + "capacidades medidas con el contexto real (WebGL2, MSAA y textura máxima)", antes.capacidades.webgl2 === true && antes.capacidades.msaa > 0 && antes.capacidades.maxTextura >= 2048, antes.capacidades);
    ok(tag + "la línea de Aparato empieza por «Aparato: »", /^Aparato: /.test(antes.linea), antes.linea);
    await p.click("#btnVR"); await dormir(4000);
    const dentro = await p.evaluate(() => window.__aparato()), reg = await p.evaluate(() => window.__mockXR.registro.slice());
    ok(tag + "dentro de VR: vr = true y la línea lo dice", dentro.vr === true && / · VR · /.test(dentro.linea), dentro.linea);
    ok(tag + "dentro de VR: capacidades.vr con lo que declara la sesión", !!dentro.capacidades.vr && "frecuencia" in dentro.capacidades.vr, dentro.capacidades.vr);
    ok(tag + "clase estable al entrar", dentro.clase === c.clase);
    ok(tag + "el estado no lleva el agente completo", !/OculusBrowser|Mozilla|AppleWebKit/.test(JSON.stringify(dentro)));
    ok(tag + "sin errores de página", err.length === 0, err.slice(0, 3));
    await ctx.close();
  }
  await b.close(); console.log("FALLOS", fallos); process.exit(fallos ? 1 : 0);
})();
