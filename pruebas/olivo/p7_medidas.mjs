// Olivos generados en el motor (?olivos=gen, ADR-0017, decisión 52): la misma página con y sin la bandera, en los escenarios fijos de las pruebas de
// carga (lejos, cerca, nube), con renderer.info (llamadas, triángulos, geometrías) y el heap; con la bandera, además el estado de Generados.
// SwiftShader: vale para recuentos y memoria, NO para fps.
//   node pruebas/olivo/p7_medidas.mjs <index.html montado con --olivos> [--capturas <carpeta>] [--rapido]
//   --rapido: solo con la bandera y solo el escenario «cerca» (lo que usa pruebas/guardianes/olivo.test.js)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { sirve, lanza, ESCENARIOS } = require(path.join(RAIZ, "pruebas", "guardianes", "_navegador.js"));
const PAG = path.resolve(process.argv[2]);
const ic = process.argv.indexOf("--capturas"), CAP = ic > 0 ? path.resolve(process.argv[ic + 1]) : null;
if (CAP) fs.mkdirSync(CAP, { recursive: true });
const ESPERA = Number(process.env.GEMELO_ESPERA || 180000), RAPIDO = process.argv.includes("--rapido");

const s = await sirve(path.dirname(PAG)), nav = await lanza(), base = "http://127.0.0.1:" + s.address().port + "/" + path.basename(PAG);
const salida = { sin: {}, con: {}, errores: {} };
try {
  for (const [k, q] of (RAPIDO ? [] : [["sin", "?debug&arbsc=1"]]).concat([["con", "?debug&arbsc=1&olivos=gen"]])) {
    const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
    p.on("pageerror", e => errores.push(String(e).slice(0, 300))); p.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
    await p.goto(base + q);
    await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: ESPERA });
    for (const [nombre, e] of Object.entries(ESCENARIOS).filter(([n]) => !RAPIDO || n === "cerca")) {
      await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
      // con la bandera, esperar a que el lote de generados esté puesto (o a que no haya nada que generar)
      const t0 = Date.now();
      for (;;) {
        await p.waitForTimeout(1500);
        const st = await p.evaluate(() => ({ cola: window.__g.pendientes ? window.__g.pendientes() : window.__g.Cola.pendientes(), gen: window.__olivosGen ? window.__olivosGen() : null }));
        const listo = st.cola === 0 && (!st.gen || st.gen.estado !== "activo" || nombre !== "cerca" || st.gen.info.arboles > 0);
        if (listo || Date.now() - t0 > ESPERA) break;
      }
      await p.waitForTimeout(1500);
      salida[k][nombre] = await p.evaluate(() => { const g = window.__g, r = g.renderer.info;
        return { llamadas: r.render.calls, triangulos: r.render.triangles, puntos: r.render.points, geometrias: r.memory.geometries, texturas: r.memory.textures,
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, olivos: g.Arboles.resumen(), gen: window.__olivosGen ? window.__olivosGen() : null }; });
      if (CAP) { const bb = await p.locator("#lienzo").boundingBox(); await p.screenshot({ path: path.join(CAP, "p7-" + nombre + "-" + k + ".png"), clip: bb, timeout: 180000 }); }
    }
    if (k === "con" && CAP) {   // de cerca, el olivo generado más cercano al foco
      const t = await p.evaluate(() => window.__olivosGen().primero);
      if (t) { await p.evaluate(t => { const g = window.__g; g.orb.az = -0.5; g.orb.el = 0.25; g.orb.dist = 14; g.objetivo.x = t.x; g.objetivo.z = -t.y; g.objetivo.y = g.suelo(t.x, t.y) + t.h * 0.45; g.pon("gem"); }, t);
        await p.waitForTimeout(4000); const bb = await p.locator("#lienzo").boundingBox(); await p.screenshot({ path: path.join(CAP, "p7-generado-de-cerca.png"), clip: bb, timeout: 180000 });
        salida.con.de_cerca = await p.evaluate(() => ({ llamadas: window.__g.renderer.info.render.calls, triangulos: window.__g.renderer.info.render.triangles, gen: window.__olivosGen() })); }
    }
    salida.errores[k] = errores;
    await p.close();
  }
} finally { await nav.close(); s.close(); }
console.log(JSON.stringify(salida));
