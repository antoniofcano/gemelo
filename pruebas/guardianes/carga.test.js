"use strict";
// Carga real en Chrome headless (SwiftShader) del fixture montado con la salida artefacto: 0 errores de consola y recuentos de dibujo bajo los topes
// de pruebas/presupuesto.json («fixture»). Mide la escena de SIEMPRE (Terreno, 04_terreno.js): la salida artefacto no lleva tileset y ya la dibuja
// por defecto, pero se fija ?escena=clasica para que los topes sigan midiendo lo mismo aunque un día el índice traiga `tileset` (ADR-0015, T8
// fase 1). La escena 3D Tiles, la de por defecto con tileset, tiene sus topes («fixture_escena_tiles») en escena3d.test.js.
// Sin Chrome, playwright-core o Python el test se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, propia, python, fixture, ejecuta, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza, mide } = require("./_navegador");

const PRES = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "presupuesto.json"), "utf8"));
const MIDE = !!process.env.GEMELO_MIDE;                       // GEMELO_MIDE=1: imprime las cifras medidas (para ajustar presupuesto.json)
const SALTO = motivoSalto("la carga en navegador");

let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  const py = python(), FIX = path.relative(RAIZ, fixture()), WEB = propia("web-carga"), rw = p => path.relative(RAIZ, path.join(WEB, p));
  const m = (args) => { const r = ejecuta(py, ["-I", "tuberia/salida_artefacto/montar_v2.py"].concat(args)); assert.strictEqual(r.status, 0, r.stdout + r.stderr); };
  m(["--datos", FIX + "/cerro/embebido.json", "--salida", rw("cerro/index.html")]);
  m(["--finca", "hituelo", "--modo", "ficheros", "--datos", FIX + "/hituelo/indice.json", "--salida", rw("hituelo/index.html")]);
  srv = await sirve(WEB); base = "http://127.0.0.1:" + srv.address().port;
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

for (const finca of ["cerro", "hituelo"]) {
  test("[" + finca + "] carga sin errores y cada escenario cabe en el presupuesto de dibujo", { timeout: 240000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const { errores, fallos, medidas } = await mide(navegador, base + "/" + finca + "/index.html?escena=clasica");
    if (MIDE) console.log("MEDIDO " + finca + " " + JSON.stringify(medidas));
    assert.deepStrictEqual(errores, [], "errores de consola o de página");
    assert.deepStrictEqual(fallos, [], "peticiones fallidas");
    for (const [nombre, m] of Object.entries(medidas)) {
      const tope = PRES.fixture[nombre], dis = PRES.diseno;
      for (const k of ["llamadas", "triangulos", "puntos"]) assert.ok(m[k] <= tope[k], finca + "/" + nombre + ": " + k + " " + m[k] + " > tope " + tope[k] + " (si sube a propósito, explícalo y sube pruebas/presupuesto.json)");
      if (m.heapMB >= 0) assert.ok(m.heapMB <= tope.heapMB, finca + "/" + nombre + ": heap " + m.heapMB + " MB > tope " + tope.heapMB);
      assert.ok(m.triangulos <= dis.triangulos && m.puntos <= dis.puntos && m.heapMB <= dis.heapMB, nombre + ": se pasa del presupuesto de DISEÑO (ADR-0002)");
    }
  });
}
