// Coste y aspecto de factorR8 (decisión abierta nº 48, ADR-0017) en el motor actual: la página montada de una finca, con ?factorR8=0.5 y =1,
// desde tres puntos de vista fijos (a pie, a 30 m y en el mirador a 230 m). Mide llamadas y triángulos (renderer.info) y el ÁREA DE COPA EN
// PANTALLA: los píxeles que cambian frente a la misma vista con las copas casi a cero (factorR8 = 0,01). SwiftShader: vale para recuentos y
// áreas, NO para fps ni para el coste real de rellenar píxeles (overdraw), que solo se mide en un aparato.
//   node pruebas/olivo/r8_vistas.mjs <carpeta con index.html montado> <carpeta de capturas>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { sirve, lanza } = require(path.join(RAIZ, "pruebas", "guardianes", "_navegador.js"));
const { PNG } = require(path.join(RAIZ, "apps", "web", "olivo", "node_modules", "pngjs"));   // pngjs 7.0.0 (devDependency de apps/web/olivo)
const [DIR, CAP] = process.argv.slice(2, 4).map(p => path.resolve(p));
fs.mkdirSync(CAP, { recursive: true });
const VISTAS = { a_pie: { el: 0.06, dist: 9, alto: 1.7 }, a_30m: { el: 0.62, dist: 30, alto: 1 }, mirador: { el: 1.15, dist: 230, alto: 1 } };

const s = await sirve(DIR), nav = await lanza(), url = "http://127.0.0.1:" + s.address().port + "/index.html";
const res = {};
try {
  for (const f of ["0.01", "0.5", "1"]) {
    const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
    p.on("pageerror", e => errores.push(String(e).slice(0, 200)));
    await p.goto(url + "?factorR8=" + f);
    await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 180000 });
    for (const [nombre, v] of Object.entries(VISTAS)) {
      await p.evaluate(v => { const g = window.__g, c = g.copas.filter(t => t.oliv).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];   // el olivo más cercano al centro
        g.orb.az = -0.6; g.orb.el = v.el; g.orb.dist = v.dist; g.objetivo.x = c.x; g.objetivo.z = -c.y; g.objetivo.y = g.suelo(c.x, c.y) + v.alto; g.pon("gem"); }, v);
      await p.waitForFunction(() => window.__g.Cola.pendientes() === 0, null, { timeout: 120000, polling: 500 }).catch(() => {});
      await p.waitForTimeout(2000);
      const info = await p.evaluate(() => { const r = window.__g.renderer.info; return { llamadas: r.render.calls, triangulos: r.render.triangles }; });
      const fich = path.join(CAP, "r8-" + nombre + "-factor" + f + ".png");
      const bb = await p.locator("#lienzo").boundingBox(); await p.screenshot({ path: fich, clip: bb });
      res[nombre + "@" + f] = Object.assign(info, { fichero: fich });
    }
    if (errores.length) res["errores@" + f] = errores;
    await p.close();
  }
} finally { await nav.close(); s.close(); }
// área de copa: píxeles que cambian frente a factor 0,01 (umbral de 24 en la suma de |ΔRGB|)
const area = (a, b) => { const A = PNG.sync.read(fs.readFileSync(a)), B = PNG.sync.read(fs.readFileSync(b)); let n = 0; for (let i = 0; i < A.data.length; i += 4) if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 24) n++; return +(100 * n / (A.width * A.height)).toFixed(2); };
const tabla = {};
for (const v of Object.keys(VISTAS)) tabla[v] = { "0.5": Object.assign({}, res[v + "@0.5"], { area_copa_pct: area(res[v + "@0.5"].fichero, res[v + "@0.01"].fichero) }), "1": Object.assign({}, res[v + "@1"], { area_copa_pct: area(res[v + "@1"].fichero, res[v + "@0.01"].fichero) }) };
console.log(JSON.stringify({ tabla, errores: Object.keys(res).filter(k => k.startsWith("errores")).map(k => res[k]) }, null, 1));
