// EV2-A3 (doc/sistema/VIABILIDAD-INTERACCION.md §A.5, paso 4): el menú de muñeca con el WebXR de mentira (mock_xr.js).
// Uso: node pruebas/prueba_vr_muneca.js <url de la página>   (por el banco: una sola Chrome a la vez; npm run banco:encarga)
// Comprueba la LÓGICA en la página: con la muñeca izquierda bajada no hay menú; al subirla con el dorso hacia los ojos y mirarla, aparece (y se crea UNA
// lámina); el rayo derecho resalta y el gatillo pulsa «Volver»; al bajarla, se va; ?xrmuneca=0 lo apaga; al salir de VR se libera. Cuenta llamadas con y sin
// el menú (debe ser +1). NO dice nada de comodidad, de falsos disparos con la mano de verdad ni de legibilidad en un casco (no probado en unas Quest).
// [SIN EJECUTAR por quien la escribió (agente ligero, sin Chrome): la primera pasada puede pedir ajustes de tiempos o de puntería. En el WebXR de mentira
// el grip con dir = (1, 0, 0) lleva su −X (el dorso de la izquierda) hacia arriba (lookMat de mock_xr.js).]
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const base = process.argv[2];
const dormir = ms => new Promise(r => setTimeout(r, ms));
let pg = null;
async function fot(n) { const f0 = await pg.evaluate(() => window.__mockXR.fotogramas); for (let i = 0; i < 300; i++) { await dormir(60); if ((await pg.evaluate(() => window.__mockXR.fotogramas)) >= f0 + n) return; } }
const MUNECA = [-0.05, 1.25, -0.2];
async function reloj(si) {   // la muñeca izquierda subida y girada, y la cabeza mirándola; o como siempre (abajo, apuntando al frente, mirando al frente)
  await pg.evaluate(a => {
    const M = window.__mockXR, l = M.mandos.left;
    if (a.si) { l.pos = a.w.slice(); l.dir = [1, 0, 0]; M.dirCabeza = [a.w[0] - M.cabeza[0], a.w[1] - M.cabeza[1], a.w[2] - M.cabeza[2]]; }
    else { l.pos = [-0.25, 1.2, -0.3]; l.dir = [0, 0, -1]; M.dirCabeza = [0, 0, -1]; }
  }, { si, w: MUNECA });
  await fot(40);   // ~0,6 s del mock: más que el retardo de entrada (0,25 s) y de salida (0,35 s)
}
async function abre(q) {
  const p = await pg.context().newPage(); pg = p;
  await p.addInitScript({ content: fs.readFileSync(path.join(__dirname, "mock_xr.js"), "utf8") });
  await p.goto(base + (base.includes("?") ? "&" : "?") + "debug" + (q || ""), { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelector("#lienzo") && window.__vrDebug && window.__vrMuneca, null, { timeout: 120000 });
  await dormir(9000); await p.click("#btnVR"); await dormir(3500);
  await p.evaluate(() => window.__mockXR.boton("left", 5, true)); await fot(3); await p.evaluate(() => window.__mockXR.boton("left", 5, false)); await fot(3);   // Y: cierra el panel grande (se abre al entrar)
  return p;
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 500 } }); pg = await ctx.newPage();
  const err = []; let fallos = 0;
  const ok = (n, c, d) => { console.log((c ? "OK   " : "FALLA") + " " + n + (d !== undefined ? "  " + JSON.stringify(d) : "")); if (!c) fallos++; };
  const p = await abre("");
  p.on("pageerror", e => err.push("PAGEERROR " + String(e))); p.on("console", m => { if (m.type() === "error" && !/favicon|404/.test(m.text())) err.push("CONSOLE " + m.text()); });
  const llamadas = () => p.evaluate(() => window.__g && window.__g.renderer ? window.__g.renderer.info.render.calls : null);
  await reloj(false);
  let m = await p.evaluate(() => window.__vrMuneca()); ok("muñeca abajo: sin menú ni lámina", m.activo && !m.visible && !m.creada, m);
  const c0 = await llamadas();
  await reloj(true);
  m = await p.evaluate(() => window.__vrMuneca()); ok("muñeca hacia la cara y mirándola: aparece, en la izquierda y por el grip", m.visible && m.creada && m.mano === "left" && m.fuente === "grip", m);
  ok("accesos: hora y volver (sin hazas ni visita guiada en local)", m.botones.map(q => q.id).join(",") === "hora,volver", m.botones);
  const c1 = await llamadas(); ok("una llamada más con el menú a la vista (SwiftShader: recuento, no fps)", c0 !== null && c1 - c0 === 1, { c0, c1 });
  // el rayo derecho al centro de la lámina (espacio del rig): el gatillo es del menú aunque caiga entre botones
  if (m.pos) {
    await p.evaluate(a => { const M = window.__mockXR, r = M.mandos.right; r.pos = [0.2, 1.2, -0.25]; M.apunta("right", a); }, m.pos); await fot(4);
    const h = await p.evaluate(() => window.__vrMuneca()); console.log("INFO resaltado con el rayo al centro (puede caer en el hueco entre botones): «" + h.hover + "»");
    const antes = await p.evaluate(() => window.__vrDebug().cabeza);
    await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(20);
    const tras = await p.evaluate(() => ({ d: window.__vrDebug(), m: window.__vrMuneca() }));
    ok("el gatillo es del menú (no abre ficha ni teletransporta) y la lámina sigue", tras.m.visible && !tras.d.ficha, { ficha: tras.d.ficha, hover: tras.m.hover, antes, despues: tras.d.cabeza });
  }
  ok("pulsar «Volver» por el gancho de pruebas funciona", await p.evaluate(() => window.__vrMunecaPulsa("volver")));
  const pint = (await p.evaluate(() => window.__vrMuneca())).pinturas; await fot(30);
  ok("quieto, no se repinta (solo si cambia la firma)", (await p.evaluate(() => window.__vrMuneca())).pinturas === pint);
  await reloj(false);
  m = await p.evaluate(() => window.__vrMuneca()); ok("al bajar la muñeca se va (la lámina se queda creada para la próxima vez)", !m.visible && m.creada, m);
  const mem0 = await p.evaluate(() => window.__g.renderer.info.memory.textures);
  await p.evaluate(() => window.__mockXR.sesion.end()); await dormir(1500);
  m = await p.evaluate(() => window.__vrMuneca()); ok("al salir de VR se libera", !m.creada, m);
  const mem1 = await p.evaluate(() => window.__g.renderer.info.memory.textures); ok("una textura menos (o igual si no se llegó a subir)", mem1 <= mem0, { mem0, mem1 });
  // ?xrmuneca=0 lo apaga
  await p.close(); const p2 = await abre("&xrmuneca=0"); await reloj(true);
  m = await p2.evaluate(() => window.__vrMuneca()); ok("?xrmuneca=0: ni se ve ni se crea", !m.activo && !m.visible && !m.creada, m);
  ok("sin errores en la página", err.length === 0, err.slice(0, 4));
  await b.close(); process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
