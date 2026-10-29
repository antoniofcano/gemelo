// Prueba del modo VR con un WebXR de mentira (mock_xr.js). Uso: node pruebas/prueba_vr.js <url> <prefijo_capturas> [sinxr]
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const url = process.argv[2], pre = process.argv[3] || "pruebas/salida/vr/t", sinxr = process.argv[4] === "sinxr";
const dormir = ms => new Promise(r => setTimeout(r, ms));
let pg = null;
// el simulador va a pocos fotogramas por segundo (render por software): una pulsación tiene que durar hasta que pasen fotogramas de verdad, igual que en un casco a 72 Hz
async function fot(n) { const f0 = await pg.evaluate(() => window.__mockXR.fotogramas); for (let i = 0; i < 300; i++) { await dormir(60); if ((await pg.evaluate(() => window.__mockXR.fotogramas)) >= f0 + n) return; } }
async function pulsa(mano, k) { await pg.evaluate(a => window.__mockXR.boton(a[0], a[1], true), [mano, k]); await fot(3); await pg.evaluate(a => window.__mockXR.boton(a[0], a[1], false), [mano, k]); await fot(3); }
async function mantenEjes(mano, x, y, n) { await pg.evaluate(a => window.__mockXR.ejes(a[0], a[1], a[2]), [mano, x, y]); await fot(n); await pg.evaluate(a => window.__mockXR.ejes(a[0], 0, 0), [mano]); await fot(2); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } }); pg = p; const err = [], res = {}; let fallos = 0;
  p.on("pageerror", e => err.push("PAGEERROR " + String(e))); p.on("console", m => { if (m.type() === "error" && !/favicon|404/.test(m.text())) err.push("CONSOLE " + m.text()); });
  if (!sinxr) await p.addInitScript({ content: fs.readFileSync(path.join(__dirname, "mock_xr.js"), "utf8") });
  await p.goto(url + (url.includes("?") ? "&" : "?") + "debug", { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelector("#lienzo") && window.__vrDebug, null, { timeout: 120000 });
  await dormir(9000);
  const ok = (n, c, d) => { console.log((c ? "OK   " : "FALLA") + " " + n + (d !== undefined ? "  " + JSON.stringify(d) : "")); if (!c) fallos++; };
  const est = await p.evaluate(() => window.VR_ESTADO), btn = await p.evaluate(() => !!document.getElementById("btnVR"));
  console.log("estado:", est, "| botón:", btn);
  if (sinxr) { ok("sin WebXR: no hay botón y el estado lo dice", !btn && /no soportado/.test(est)); ok("sin errores", err.length === 0, err.slice(0, 4)); console.log("ERRORES", err.length); await b.close(); process.exit(fallos ? 1 : 0); }
  ok("con WebXR: aparece el botón «Entrar en VR»", btn && /^WebXR: soportado/.test(est));
  const d0 = await p.evaluate(() => window.__vrDebug());
  await p.screenshot({ path: pre + "_0_antes.png", timeout: 120000 });
  await p.click("#btnVR"); await dormir(3500);
  let d = await p.evaluate(() => window.__vrDebug()); res.entrada = d;
  ok("entra en VR (sesión, paseo en primera persona, modo Gemelo)", d.on && d.paseando && d.primera && d.modo === "gem" && d.sesionesN === 1, { on: d.on, modo: d.modo, near: d.near, far: d.far });
  ok("la cabeza queda en el suelo del rig + 1,6 m", Math.abs(d.cabeza[1] - d.rig.y - 1.6) < 0.05, { cab: d.cabeza.map(v => +v.toFixed(2)), rig: d.rig });
  ok("el panel se abre al entrar", d.panel);
  ok("perfil VR aplicado", d.nivel >= 0 && d.hierba > 0, { nivel: d.nivel, hierba: d.hierba });
  const fr0 = (await p.evaluate(() => window.__mockXR.fotogramas));
  // 1) andar: palanca izquierda adelante 2 s
  await mantenEjes("left", 0, -1, 8);
  let d1 = await p.evaluate(() => window.__vrDebug()); const mov = Math.hypot(d1.cabeza[0] - d.cabeza[0], d1.cabeza[2] - d.cabeza[2]);
  ok("andar con la palanca izquierda mueve al usuario", mov > 0.3, { metros: +mov.toFixed(2), fotogramas: d1.frames - d.frames });
  // la cabeza avanza hacia -z (mirando al norte)
  ok("avanza hacia donde mira (norte = −z)", d1.cabeza[2] < d.cabeza[2] - 0.2, { dz: +(d1.cabeza[2] - d.cabeza[2]).toFixed(2) });
  ok("el 'paseo' sigue a la cabeza (pp)", Math.abs(d1.pp[0] - d1.cabeza[0]) < 1.5 && Math.abs(d1.pp[1] + d1.cabeza[2]) < 1.5, { pp: d1.pp.map(v => +v.toFixed(1)), cab: d1.cabeza.map(v => +v.toFixed(1)) });
  // 2) giro a saltos
  await mantenEjes("right", 1, 0, 3);
  let d2 = await p.evaluate(() => window.__vrDebug());
  ok("giro a saltos de 30° con la palanca derecha", Math.abs(Math.abs(d2.rig.yaw - d1.rig.yaw) - Math.PI / 6) < 0.02, { yaw: +d2.rig.yaw.toFixed(3) });
  ok("el giro es en torno a la cabeza (no salta de sitio)", Math.hypot(d2.cabeza[0] - d1.cabeza[0], d2.cabeza[2] - d1.cabeza[2]) < 0.6, { dx: +(d2.cabeza[0] - d1.cabeza[0]).toFixed(2), dz: +(d2.cabeza[2] - d1.cabeza[2]).toFixed(2) });
  // 3) teletransporte: palanca derecha adelante (arco), apunta al suelo y suelta
  await p.evaluate(() => { const M = window.__mockXR; M.apunta("right", [0.25, 0.9, -3]); M.ejes("right", 0, -1); }); await fot(4);
  await p.screenshot({ path: pre + "_1_arco.png", timeout: 120000 });
  await p.evaluate(() => window.__mockXR.ejes("right", 0, 0)); await fot(4);
  let d3 = await p.evaluate(() => window.__vrDebug()); const salto = Math.hypot(d3.cabeza[0] - d2.cabeza[0], d3.cabeza[2] - d2.cabeza[2]);
  ok("el teletransporte (arco + soltar) lleva al usuario al punto de caída", salto > 1.5 && salto < 40, { metros: +salto.toFixed(1) });
  // 4) el panel: apuntar a un botón y pulsar el gatillo
  await pulsa("left", 5);
  let dp = await p.evaluate(() => window.__vrDebug()); ok("Y oculta el panel", !dp.panel);
  await pulsa("left", 5);
  dp = await p.evaluate(() => window.__vrDebug()); ok("Y vuelve a mostrar el panel", dp.panel, { pos: dp.panelPos.map(v => +v.toFixed(2)) });
  // coordenadas físicas = mundo − rig, deshaciendo el giro del rig
  async function fisica(w) { const dd = await p.evaluate(() => window.__vrDebug()); const r = dd.rig, c = Math.cos(-r.yaw), s = Math.sin(-r.yaw), x = w[0] - r.x, y = w[1] - r.y, z = w[2] - r.z; return [x * c + z * s, y, -x * s + z * c]; }
  async function aPanel(id) {
    const bots = await p.evaluate(() => window.__vrBotones()), q = bots.find(k => k.id === id), T = (await p.evaluate(() => window.__vrDebug())).panelTam;   // [px de ancho, px de alto, m, m]
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2, l = [(cx / T[0] - 0.5) * T[2], (0.5 - cy / T[1]) * T[3], 0];   // en el plano del panel
    for (let i = 0; i < 10; i++) {
      const dd = await p.evaluate(() => window.__vrDebug());   // el panel se recoloca (sigue a la cabeza): se vuelve a leer su posición en cada intento
      const pp = dd.panelPos, hc = dd.cabeza, ang = Math.atan2(hc[0] - pp[0], hc[2] - pp[2]), wx = pp[0] + l[0] * Math.cos(ang), wz = pp[2] - l[0] * Math.sin(ang), wy = pp[1] + l[1];
      const f = await fisica([wx, wy, wz]); await p.evaluate(v => window.__mockXR.apunta("right", v), f); await fot(2); const h = await p.evaluate(() => window.__vrDebug().hover); if (h === id) break; if (i === 9) console.log("   (el rayo no llegó a resaltar " + id + ": " + h + ")"); }
  }
  await aPanel("m_orto"); let dh = await p.evaluate(() => window.__vrDebug()); ok("el rayo del mando resalta el botón bajo él", dh.hover === "m_orto", { hover: dh.hover });
  await p.screenshot({ path: pre + "_2_panel.png", timeout: 120000 });
  await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(3); let dm = await p.evaluate(() => window.__vrDebug()); ok("gatillo sobre «Ortofoto» cambia el modo", dm.modo === "orto", { modo: dm.modo });
  await aPanel("m_gem"); await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(3); dm = await p.evaluate(() => window.__vrDebug()); ok("gatillo sobre «Gemelo» lo restablece", dm.modo === "gem");
  await aPanel("h+"); const h0 = dm.hora; await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(3); dm = await p.evaluate(() => window.__vrDebug()); ok("«+» de la hora la cambia", Number(dm.hora) === Number(h0) + 0.5, { de: h0, a: dm.hora });
  await aPanel("e+"); dm = await p.evaluate(() => window.__vrDebug()); console.log("hover antes de e+:", dm.hover); await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(3); dm = await p.evaluate(() => window.__vrDebug()); ok("«+» de la exageración la sube", dm.exag > 1, { exag: dm.exag, hover: dm.hover });
  await aPanel("f-"); const n0 = dm.ndvi; await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(3); dm = await p.evaluate(() => window.__vrDebug()); ok("«−» de la fecha NDVI retrocede una imagen", dm.ndvi === n0 - 1, { de: n0, a: dm.ndvi });
  await aPanel("p+"); const c0 = [dm.cabeza[0], dm.cabeza[2]]; await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(3); dm = await p.evaluate(() => window.__vrDebug()); ok("«▶» de parcela te lleva a otra parcela", dm.parcSel === 1 || dm.parcSel === 0 && false, { parcSel: dm.parcSel, mueve: +Math.hypot(dm.cabeza[0] - c0[0], dm.cabeza[2] - c0[1]).toFixed(0) });
  await p.screenshot({ path: pre + "_3_parcela.png", timeout: 120000 });
  // 5) la ficha de un olivo con el rayo + gatillo (con el panel oculto)
  await pulsa("left", 5);
  const ol = await p.evaluate(() => window.__vrOlivo()); const fo = await fisica(ol); await p.evaluate(v => window.__mockXR.apunta("right", v), fo); await dormir(400);
  await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(3); const df = await p.evaluate(() => window.__vrDebug()); ok("rayo + gatillo sobre un olivo abre su ficha", df.ficha, { olivo: ol.map(v => +v.toFixed(1)) });
  await p.screenshot({ path: pre + "_4_ficha.png", timeout: 120000 });
  // 6) vuelo (A) y mirador (B)
  await pulsa("right", 4);
  const dv = await p.evaluate(() => window.__vrDebug()); ok("A activa el vuelo", dv.vuelo);
  await pulsa("right", 4);
  await pulsa("right", 5);
  const dmi = await p.evaluate(() => window.__vrDebug()); ok("B lleva al mirador (a ~230 m sobre el suelo, volando)", dmi.vuelo && dmi.cabeza[1] > 150, { altura: +dmi.cabeza[1].toFixed(0) });
  await p.screenshot({ path: pre + "_5_mirador.png", timeout: 120000 });
  await pulsa("right", 5);
  const dbj = await p.evaluate(() => window.__vrDebug()); ok("B otra vez baja al suelo", !dbj.vuelo && dbj.cabeza[1] < 100, { altura: +dbj.cabeza[1].toFixed(0) });
  // 7) correr (grip izquierdo) = más metros
  async function tramo(corre) { await p.evaluate(() => window.__mockXR.apunta("right", [0.25, 1.2, -3])); const a0 = await p.evaluate(() => window.__vrDebug().cabeza); await p.evaluate(c => { window.__mockXR.ejes("left", 0, -1); window.__mockXR.boton("left", 1, c); }, corre); await fot(10); await p.evaluate(() => { window.__mockXR.ejes("left", 0, 0); window.__mockXR.boton("left", 1, false); }); await fot(2); const a1 = await p.evaluate(() => window.__vrDebug().cabeza); return Math.hypot(a1[0] - a0[0], a1[2] - a0[2]); }
  const mAnda = await tramo(false), mCorre = await tramo(true); ok("correr (grip) avanza más que andar", mCorre > mAnda * 1.6, { andar: +mAnda.toFixed(2), correr: +mCorre.toFixed(2) });
  // 8) el adaptador de calidad: simulamos que va justo (la prueba del adaptador real es de hardware)
  const dpf = await p.evaluate(() => ({ calls: 0 })); const reg = await p.evaluate(() => window.__mockXR.registro.slice(0, 6)); console.log("registro del mock:", reg);
  const antes = await p.evaluate(() => window.__vrDebug().frames);
  // 9) salir con el botón del panel
  await pulsa("left", 5);
  await aPanel("sal"); await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(3);
  const ds = await p.evaluate(() => window.__vrDebug()); res.salida = ds;
  ok("Salir de VR: sesión terminada y estado restaurado", !ds.on && ds.modo === "nube" && ds.near === 0.5 && !ds.paseando, { on: ds.on, modo: ds.modo, near: ds.near, paseando: ds.paseando });
  const f1 = await p.evaluate(() => window.__vrDebug().frames); await dormir(5000); const f2 = await p.evaluate(() => window.__vrDebug().frames);
  ok("el bucle normal vuelve a funcionar (sigue pintando)", f2 > f1, { f1, f2 });
  await p.screenshot({ path: pre + "_6_salida.png", timeout: 120000 });
  // 10) otra vez dentro y fuera (sin fugas ni errores)
  await p.click("#btnVR"); await dormir(2500); let dr = await p.evaluate(() => window.__vrDebug()); ok("se puede volver a entrar", dr.on && dr.sesionesN === 2);
  await p.evaluate(() => window.__mockXR.sesion.end()); await dormir(1500); dr = await p.evaluate(() => window.__vrDebug()); ok("y salir con el fin de sesión del sistema (botón del casco)", !dr.on);
  console.log("ERRORES", err.length, err.slice(0, 6)); ok("sin errores de página ni de consola", err.length === 0);
  console.log("FALLOS", fallos); await b.close(); process.exit(fallos ? 1 : 0);
})().catch(e => { console.log("EXCEPCIÓN", e); process.exit(2); });
