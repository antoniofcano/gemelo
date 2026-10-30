"use strict";
// Carga real en Chrome headless (SwiftShader) de las dos fincas del fixture con el cliente web (Vite) y su tileset: 0 errores de consola ni
// peticiones fallidas, la escena 3D Tiles activa (desde T8 fase 2 es la única; decisión 79) y recuentos de dibujo bajo los topes de
// pruebas/presupuesto.json («fixture», por finca). Una finca cuyos topes aún no se han medido con el tileset («a medir») se mide y se
// imprime, pero sus topes no se comprueban (sí los de diseño). Servida con la CSP de infra/Caddyfile en modo solo informe.
// Sin Chrome, playwright-core, Python o Vite el test se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza, mide } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const PRES = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "presupuesto.json"), "utf8"));
const MIDE = !!process.env.GEMELO_MIDE;                       // GEMELO_MIDE=1: imprime las cifras medidas (para ajustar presupuesto.json)
const SALTO = motivoSalto("la carga en navegador") || saltoPagina("la carga en navegador");
const FINCAS = ["cerro", "hituelo"];

const srv = {}; let navegador;
test.before(async () => {
  if (SALTO) return;
  for (const f of FINCAS) srv[f] = await sirve(montaPagina({ finca: f }).carpeta, { csp: true });
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); for (const s of Object.values(srv)) s.close(); });

for (const finca of FINCAS) {
  test("[" + finca + "] carga sin errores con la escena 3D Tiles y cada escenario cabe en el presupuesto de dibujo", { timeout: 300000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const { errores, fallos, medidas, csp } = await mide(navegador, "http://127.0.0.1:" + srv[finca].address().port + "/index.html");
    if (MIDE) console.log("MEDIDO " + finca + " " + JSON.stringify(medidas));
    if (csp.length) t.diagnostic("CSP de Caddy (solo informe), lo que rompería al imponerla: " + [...new Set(csp)].join(" | "));
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    assert.deepStrictEqual(fallos, [], "peticiones fallidas");
    const topes = PRES.fixture[finca], dis = PRES.diseno;
    if (!topes || topes.a_medir) t.diagnostic(finca + ": topes con tileset aún sin medir (pruebas/presupuesto.json); medido " + JSON.stringify(medidas));
    for (const [nombre, m] of Object.entries(medidas)) {
      assert.strictEqual(m.escena3d, "activo", finca + "/" + nombre + ": la escena 3D Tiles no está activa");
      if (topes && !topes.a_medir) {
        const tope = topes[nombre];
        for (const k of ["llamadas", "triangulos", "puntos"]) assert.ok(m[k] <= tope[k], finca + "/" + nombre + ": " + k + " " + m[k] + " > tope " + tope[k] + " (si sube a propósito, explícalo y sube pruebas/presupuesto.json)");
        if (m.heapMB >= 0) assert.ok(m.heapMB <= tope.heapMB, finca + "/" + nombre + ": heap " + m.heapMB + " MB > tope " + tope.heapMB);
      }
      assert.ok(m.triangulos <= dis.triangulos && m.puntos <= dis.puntos && m.heapMB <= dis.heapMB && m.llamadas <= dis.llamadas, nombre + ": se pasa del presupuesto de DISEÑO (ADR-0002)");
    }
  });
}
