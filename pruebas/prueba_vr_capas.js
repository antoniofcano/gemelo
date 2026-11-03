// EV2 (doc/sistema/VIABILIDAD-INTERACCION.md §A.5): la interfaz espacial en capas con el WebXR de mentira (mock_xr.js), tras ?ui=capas.
// Uso: node pruebas/prueba_vr_capas.js <url de la página> [prefijo_capturas]   (por el banco: una sola Chrome a la vez; npm run banco:encarga)
// Comprueba la LÓGICA (dónde se cuelgan las fichas, que sustituyen a las de siempre, el cupo de 3, el panel que nace y se queda) y cuenta llamadas y
// triángulos con y sin fichas; NO dice nada de legibilidad, nitidez, mareo ni comodidad en un casco real (no probado en unas Quest).
// [SIN EJECUTAR por quien la escribió (agente ligero, sin Chrome): la primera pasada puede pedir ajustes de tiempos o de puntería.]
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const base = process.argv[2], pre = process.argv[3] || "pruebas/salida/vr/capas";
const dormir = ms => new Promise(r => setTimeout(r, ms));
let pg = null;
async function fot(n) { const f0 = await pg.evaluate(() => window.__mockXR.fotogramas); for (let i = 0; i < 300; i++) { await dormir(60); if ((await pg.evaluate(() => window.__mockXR.fotogramas)) >= f0 + n) return; } }
async function pulsa(mano, k) { await pg.evaluate(a => window.__mockXR.boton(a[0], a[1], true), [mano, k]); await fot(3); await pg.evaluate(a => window.__mockXR.boton(a[0], a[1], false), [mano, k]); await fot(3); }
async function mantenEjes(mano, x, y, n) { await pg.evaluate(a => window.__mockXR.ejes(a[0], a[1], a[2]), [mano, x, y]); await fot(n); await pg.evaluate(a => window.__mockXR.ejes(a[0], 0, 0), [mano]); await fot(2); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } }); pg = p; const err = []; let fallos = 0;
  const ok = (n, c, d) => { console.log((c ? "OK   " : "FALLA") + " " + n + (d !== undefined ? "  " + JSON.stringify(d) : "")); if (!c) fallos++; };
  p.on("pageerror", e => err.push("PAGEERROR " + String(e))); p.on("console", m => { if (m.type() === "error" && !/favicon|404/.test(m.text())) err.push("CONSOLE " + m.text()); });
  await p.addInitScript({ content: fs.readFileSync(path.join(__dirname, "mock_xr.js"), "utf8") });
  await p.goto(base + (base.includes("?") ? "&" : "?") + "debug&ui=capas", { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelector("#lienzo") && window.__vrDebug && window.__componentes, null, { timeout: 120000 });
  await dormir(9000);
  const comp = await p.evaluate(() => window.__componentes()), fm = (comp || []).find ? comp.find(c => c.id === "fichas-mundo") : null;
  ok("con ?ui=capas el componente fichas-mundo está encendido por la URL", !!fm && fm.activo, fm);
  await p.click("#btnVR"); await dormir(3500);
  let d = await p.evaluate(() => window.__vrDebug()); ok("entra en VR con la bandera", d.on && d.capas === true, { on: d.on, capas: d.capas });
  const info = () => p.evaluate(() => ({ fr: window.__vrDebug().frames, r: window.__g && window.__g.renderer ? window.__g.renderer.info.render : null }));
  async function fisica(w) { const dd = await p.evaluate(() => window.__vrDebug()); const r = dd.rig, c = Math.cos(-r.yaw), s = Math.sin(-r.yaw), x = w[0] - r.x, y = w[1] - r.y, z = w[2] - r.z; return [x * c + z * s, y, -x * s + z * c]; }

  // ---- EV2-A2: el panel nace delante y se queda; tras un giro por saltos va contigo; tras un teletransporte nace delante
  const pa0 = d.panelPos; await mantenEjes("left", 0, -1, 6);
  let d1 = await p.evaluate(() => window.__vrDebug());
  ok("A2: andar no arrastra el panel (se queda en el mundo)", Math.hypot(d1.panelPos[0] - pa0[0], d1.panelPos[2] - pa0[2]) < 0.05, { antes: pa0, despues: d1.panelPos });
  await mantenEjes("right", 1, 0, 3);
  let d2 = await p.evaluate(() => window.__vrDebug());
  const rel = q => Math.atan2(q.panelPos[0] - q.cabeza[0], q.panelPos[2] - q.cabeza[2]) - q.rig.yaw;
  ok("A2: con un giro por saltos el panel gira contigo en torno a la cabeza (no se queda atrás)", Math.abs(Math.atan2(Math.sin(rel(d2) - rel(d1)), Math.cos(rel(d2) - rel(d1)))) < 0.05, { yaw: [d1.rig.yaw, d2.rig.yaw] });
  await p.evaluate(() => { const M = window.__mockXR; M.apunta("right", [0.25, 0.9, -3]); M.ejes("right", 0, -1); }); await fot(4);
  await p.evaluate(() => window.__mockXR.ejes("right", 0, 0)); await fot(4);
  let d3 = await p.evaluate(() => window.__vrDebug()), dist = Math.hypot(d3.panelPos[0] - d3.cabeza[0], d3.panelPos[2] - d3.cabeza[2]);
  ok("A2: tras el teletransporte el panel nace delante, a ~1 m", Math.hypot(d3.cabeza[0] - d2.cabeza[0], d3.cabeza[2] - d2.cabeza[2]) > 1.5 && dist > 0.8 && dist < 1.3, { dist: +dist.toFixed(2) });
  await p.screenshot({ path: pre + "_1_panel.png", timeout: 120000 });

  // ---- EV2-A1: la ficha del olivo colgada junto al olivo (no la de siempre en la cara), y lo que cuesta
  await pulsa("left", 5);   // Y: oculta el panel
  const l0 = await info();
  const ol = await p.evaluate(() => window.__vrOlivo()); await p.evaluate(v => window.__mockXR.apunta("right", v), await fisica(ol)); await dormir(400);
  await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(4);
  let df = await p.evaluate(() => window.__vrDebug()), fms = await p.evaluate(() => window.__fichasMundo ? window.__fichasMundo() : null);
  ok("A1: rayo + gatillo sobre un olivo cuelga su ficha en el mundo", fms && fms.length === 1 && /^olivo:/.test(fms[0].id), fms);
  ok("A1: la ficha de siempre (pegada a la cara) no sale", !df.ficha && !df.fichaB, { ficha: df.ficha, fichaB: df.fichaB });
  if (fms && fms[0]) { const f = fms[0], dcab = Math.hypot(f.pos[0] - df.cabeza[0], f.pos[1] - df.cabeza[1], f.pos[2] - df.cabeza[2]); ok("A1: entre 0,9 y 4,6 m de la cabeza, con escala ≥ 1", dcab >= 0.85 && dcab <= 4.7 && f.escala >= 1, { d: +dcab.toFixed(2), escala: f.escala, junto: f.junto }); }
  const l1 = await info(); console.log("render (sin ficha → con ficha):", JSON.stringify(l0.r), "→", JSON.stringify(l1.r));
  await p.screenshot({ path: pre + "_2_ficha_olivo.png", timeout: 120000 });
  // el cupo: tres olivos más → como mucho 3 vivas
  for (let k = 0; k < 3; k++) { await mantenEjes("right", 1, 0, 3); const o2 = await p.evaluate(() => window.__vrOlivo()); if (!o2) continue; await p.evaluate(v => window.__mockXR.apunta("right", v), await fisica(o2)); await dormir(300); await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(4); }
  fms = await p.evaluate(() => window.__fichasMundo()); ok("A1: como mucho 3 fichas vivas", fms.length <= 3, fms.map(f => f.id));
  // «Cerrar» de la última con el rayo (el centro del botón, en el plano de la lámina)
  const f = fms[fms.length - 1], bc = f && f.botones.find(q => q.id === "cerrar");
  if (bc) {
    const dd = await p.evaluate(() => window.__vrDebug()), ang = Math.atan2(dd.cabeza[0] - f.pos[0], dd.cabeza[2] - f.pos[2]);
    const lx = ((bc.x + bc.w / 2) / f.w - 0.5) * f.ancho, ly = (0.5 - (bc.y + bc.h / 2) / f.h) * f.alto;
    await p.evaluate(v => window.__mockXR.apunta("right", v), await fisica([f.pos[0] + lx * Math.cos(ang), f.pos[1] + ly, f.pos[2] - lx * Math.sin(ang)])); await fot(3);
    const ap = await p.evaluate(() => window.__fichasMundo()); ok("A1: apuntar resalta «Cerrar»", ap.some(q => q.id === f.id && q.hover === "cerrar"), ap.map(q => [q.id, q.hover]));
    await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(4);
    const tras = await p.evaluate(() => window.__fichasMundo()); ok("A1: «Cerrar» quita esa ficha (y su lámina)", !tras.some(q => q.id === f.id), tras.map(q => q.id));
  }
  ok("sin errores en la página", err.length === 0, err.slice(0, 4));
  await b.close(); process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
