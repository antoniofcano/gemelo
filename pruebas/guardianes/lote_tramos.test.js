"use strict";
// AG-1.5a: el lote de olivos generados (construyeG de apps/web/motor/07ab_generados.js) se monta a tramos que la cola propia de Generados puede
// repartir entre fotogramas; cada next() del generador es atómico. Con lotes REALES del fixture de Hituelo (?olivos=gen y ?olivos=escalera),
// pruebas/olivo/lote_tramos.mjs mide cada tramo y aquí se ponen topes a sus recuentos DETERMINISTAS (no a los ms, que son ruidosos):
//   - geometrías copiadas a las mallas por lotes: vértices + índices ≤ OBRA_GEO (el del módulo), salvo una geometría sola más grande (addGeometry
//     de three no se puede partir);
//   - como mucho UN cálculo de caja o esfera de recorte por tramo (cada uno recorre todas las instancias de su malla);
//   - instancias escritas y bytes de búfer reservados por tramo, por debajo de su tope;
//   - y el lote acabado sale igual en cada repetición (recuentos y huella).
// Solo Node (sin Chrome ni Docker). Sin apps/web/olivo instalado o sin el fixture (npm run fixture) se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { RAIZ, fs, path } = require("./_util");

const MODS = path.join(RAIZ, "apps", "web", "olivo", "node_modules");
const FX = path.join(RAIZ, "pruebas", "salida", "fixture", "hituelo", "indice.json");
const SALTO = !fs.existsSync(path.join(MODS, "three-r186", "package.json")) ? "apps/web/olivo sin instalar (cd apps/web/olivo && npm i): los tramos del lote NO se han comprobado"
  : !fs.existsSync(FX) ? "sin el fixture (npm run fixture): los tramos del lote NO se han comprobado" : null;
// el del módulo; si desaparece de él, el tope sigue siendo el de AG-1.5a (60 000)
const mObra = /OBRA_GEO = (\d+)/.exec(fs.readFileSync(path.join(RAIZ, "apps", "web", "motor", "07ab_generados.js"), "utf8")), OBRA_GEO = mObra ? Number(mObra[1]) : 60000;
// instancias por tramo: el generador cede cada 512 de una pieza y al acabar cada árbol; con el fixture, ≤ 1 020 (2 048 deja holgura sin dejar
// pasar que se quite el reparto). Bytes por tramo: la primera geometría de una malla por lotes reserva su búfer entero (hasta ≈ 7,4 MB con el
// fixture, atómico en three); 16 MB deja el doble de holgura.
const TOPE_INSTANCIAS = 2048, TOPE_BYTES = 16 * 1024 * 1024;

test("lote de olivos generados: ningún tramo entre dos yield pasa de sus topes deterministas (AG-1.5a)", { timeout: 300000 }, t => {
  if (SALTO) return t.skip(SALTO);
  const r = spawnSync(process.execPath, [path.join("pruebas", "olivo", "lote_tramos.mjs"), "--reps", "2", "--detalle"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let s; try { s = JSON.parse(r.stdout.trim().split("\n").pop()); } catch (e) { assert.fail("lote_tramos.mjs no dio JSON: " + r.stdout.slice(-400) + r.stderr.slice(-400)); }
  assert.deepStrictEqual(s.mal, []);
  assert.ok(s.lotes.filter(l => l.arboles > 0).length >= 4, "con el fixture se esperan varios lotes con olivos: " + s.lotes.length);
  const malos = [];
  s.detalle.forEach((tramos, j) => tramos.forEach(x => {
    const donde = s.lotes[j].modo + "/" + s.lotes[j].parada + " tramo " + x.i + "/" + tramos.length + ": ";
    if (x.vertices + x.indices > Math.max(OBRA_GEO, x.geoMayor)) malos.push(donde + (x.vertices + x.indices) + " vértices + índices en " + x.geometrias + " geometrías (tope " + OBRA_GEO + ")");
    if (x.calculos > 1) malos.push(donde + x.calculos + " cálculos de caja o esfera en el mismo tramo");
    if (x.instancias > TOPE_INSTANCIAS) malos.push(donde + x.instancias + " instancias (tope " + TOPE_INSTANCIAS + ")");
    if (x.bytes > TOPE_BYTES) malos.push(donde + x.bytes + " bytes reservados (tope " + TOPE_BYTES + ")");
  }));
  assert.deepStrictEqual(malos.slice(0, 8), [], malos.length + " tramos pasan de su tope");
  t.diagnostic("lotes " + s.lotes.length + " · máximos por tramo " + JSON.stringify(s.maximos) + " (msNode: indicador relativo de Node, no de Chrome ni de un aparato)");
});
