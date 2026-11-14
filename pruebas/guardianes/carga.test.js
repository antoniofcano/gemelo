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

// L1-06 (MU0-5): un tope que nadie ha medido no vigila nada. Cada tope de «fixture» lleva al lado la medida con la que se fijó («medido»: la mediana de ≥ 3 vueltas
// del banco con arbsc y hora fijos, FIJOS_MEDIDA de _navegador.js, y su fecha) y no puede pasar de 2× ella: una regresión que doble lo dibujado o la memoria
// salta. Sin Chrome: solo lee el fichero. Si un tope tiene que subir, se vuelve a medir y se anota la medida nueva.
const CLAVES_TOPE = ["llamadas", "triangulos", "puntos", "geometrias", "texturas", "heapMB", "gpuMB"];
test("presupuesto.json: cada tope de «fixture» tiene su medida anotada y no pasa de 2× ella (L1-06, L1-07)", () => {
  const f = PRES.fixture;
  assert.match(String(f.medido_el), /^\d{4}-\d{2}-\d{2}$/, "fixture.medido_el: la fecha de la medida");
  assert.ok(f.fijos && f.fijos.arbsc && f.fijos.hora, "fixture.fijos: con qué arbsc y hora se midió");
  assert.deepStrictEqual(f.fijos, require("./_navegador").FIJOS_MEDIDA, "los fijos anotados son los que pone mide()");
  for (const finca of FINCAS) for (const nombre of Object.keys(require("./_navegador").ESCENARIOS)) {
    const tope = f[finca] && f[finca][nombre], med = tope && tope.medido;
    assert.ok(med, finca + "/" + nombre + ": falta la medida anotada (medido)");
    for (const k of CLAVES_TOPE) {
      assert.ok(typeof tope[k] === "number" && typeof med[k] === "number", finca + "/" + nombre + "." + k + ": tope y medida numéricos");
      assert.ok(tope[k] >= med[k], finca + "/" + nombre + "." + k + ": el tope " + tope[k] + " está por debajo de lo medido " + med[k]);
      assert.ok(tope[k] <= 2 * med[k], finca + "/" + nombre + "." + k + ": el tope " + tope[k] + " pasa de 2× lo medido (" + med[k] + "): ya no vigila");
    }
  }
});

// La misma regla para los dos bloques de olivos (los mide olivo.test.js; segunda mirada a MU0-5, 2026-11-14): cada tope numérico lleva su medida y no pasa de 2× ella,
// o está en «calculado» con su motivo escrito (un estado final que SwiftShader no alcanza no se puede medir aquí: se dice, no se disimula).
test("presupuesto.json: los topes de los olivos generados y de la escalera llevan su medida (≤ 2×) o su cálculo con motivo", () => {
  for (const bloque of ["fixture_olivos_gen", "fixture_olivos_escalera"]) {
    const B = PRES[bloque];
    assert.match(String(B.medido_el), /^\d{4}-\d{2}-\d{2}$/, bloque + ".medido_el");
    for (const [nombre, tope] of Object.entries(B)) {
      if (!tope || typeof tope !== "object") continue;
      const med = tope.medido || {}, calc = tope.calculado || {};
      for (const [k, v] of Object.entries(tope)) {
        if (typeof v !== "number") continue;
        const d = bloque + "/" + nombre + "." + k;
        if (typeof calc[k] === "string" && calc[k].length > 20) continue;
        assert.ok(typeof med[k] === "number", d + ": ni medida ni cálculo con motivo");
        assert.ok(v >= med[k] && v <= 2 * med[k], d + ": el tope " + v + " no está entre lo medido (" + med[k] + ") y su doble");
      }
    }
  }
  const E = PRES.fixture_olivos_escalera;
  assert.ok(E.llamadas_olivos >= E.llamadas_olivos_medido && E.llamadas_olivos <= 2 * E.llamadas_olivos_medido, "llamadas_olivos entre lo medido y su doble");
});

for (const finca of FINCAS) {
  test("[" + finca + "] carga sin errores con la escena 3D Tiles y cada escenario cabe en el presupuesto de dibujo", { timeout: 300000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const { errores, fallos, medidas, csp } = await mide(navegador, "http://127.0.0.1:" + srv[finca].address().port + "/index.html?olivos=0");   // la copa de siempre (O10a: sin la bandera, Hituelo dibujaría los olivos generados; los topes de «fixture» son los de la copa de siempre)
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
        // L1-07: además de llamadas, triángulos y puntos, la memoria de la tarjeta: geometrías y texturas de renderer.info.memory y los MB estimados (__g.memoria())
        for (const k of ["llamadas", "triangulos", "puntos", "geometrias", "texturas"]) assert.ok(m[k] <= tope[k], finca + "/" + nombre + ": " + k + " " + m[k] + " > tope " + tope[k] + " (si sube a propósito, explícalo y sube pruebas/presupuesto.json)");
        assert.ok(m.gpuMB >= 0, finca + "/" + nombre + ": sin estimación de la memoria de GPU (¿falta __g.memoria?): el tope no se puede saltar en silencio");
        assert.ok(m.gpuMB <= tope.gpuMB, finca + "/" + nombre + ": memoria de GPU estimada " + m.gpuMB + " MB > tope " + tope.gpuMB);
        if (m.heapMB >= 0) assert.ok(m.heapMB <= tope.heapMB, finca + "/" + nombre + ": heap " + m.heapMB + " MB > tope " + tope.heapMB);
      }
      assert.ok(m.triangulos <= dis.triangulos && m.puntos <= dis.puntos && m.heapMB <= dis.heapMB && m.llamadas <= dis.llamadas, nombre + ": se pasa del presupuesto de DISEÑO (ADR-0002)");
    }
  });
}
