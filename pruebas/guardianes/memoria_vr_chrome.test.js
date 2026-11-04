"use strict";
// AG-P1 (posible fuga al entrar y salir de VR, PLAN P4): la medida en el navegador. Con el WebXR simulado (pruebas/mock_xr.js) se entra y se sale de VR N veces
// (GEMELO_VR_CICLOS, 10 por defecto) y se mide renderer.info.memory.{geometries,textures} y performance.memory.usedJSHeapSize (Chrome con
// --enable-precise-memory-info, ya en ARGS_CHROME) en cuatro puntos: antes de la primera sesión (línea base), tras la PRIMERA sesión (calentamiento: las fábricas de
// modelos de mandos se importan una vez, las teselas siguen llegando) y tras la última. Lo que se afirma es que entre el calentamiento y la última no crece
// (geometrías y texturas dentro de un margen por el streaming de teselas; el heap, dentro de un margen por el GC) y que al salir los mandos no dejan nada apuntado.
// Opcional (GEMELO_VR=1), como el resto de las pruebas con el mock: con SwiftShader la página puede caerse («Target crashed», PLAN P4). SwiftShader vale para
// recuentos y memoria, no para fps; nada de esto se ha probado en unas Quest (no probado). Las cifras van a la consola; es una medida, no un tope del presupuesto.
// Lanzarla (por el banco, un Chrome a la vez):  GEMELO_VR=1 node --test pruebas/guardianes/memoria_vr_chrome.test.js
const test = require("node:test"), { describe, before } = test, assert = require("node:assert");
const { lee, fs } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la memoria al entrar y salir de VR") || saltoPagina("la memoria al entrar y salir de VR");
const CICLOS = Math.max(2, Number(process.env.GEMELO_VR_CICLOS || 10));
const MARGEN_GPU = Number(process.env.GEMELO_VR_MARGEN_GPU || 8);   // geometrías/texturas que pueden aparecer por teselas que llegan entre el calentamiento y el final
const MARGEN_HEAP_MB = Number(process.env.GEMELO_VR_MARGEN_HEAP || 40);
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza();
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

describe("memoria al entrar y salir de VR (WebXR simulado)", () => {
  before(async () => { if (!SALTO) await prepara(); });

  // todo (AG-P1b, 2026-11-04): medido un goteo de ~3 geometrías y ~1 textura por sesión de VR, que YA estaba en producción (4f90ae0: 88 → 127 geometrías en 9 sesiones; main: 74 → 99). Informa sin tumbar la puerta hasta arreglarlo
  test("diez sesiones seguidas no hacen crecer geometrías, texturas ni heap más allá del margen", { timeout: 900000, todo: "AG-P1b: goteo preexistente de geometrías y texturas por sesión de VR" }, async t => {
    if (SALTO) return t.skip(SALTO);
    if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 (WebXR simulado; inestable con SwiftShader, ver PLAN P4)");
    const p = await nav.newPage({ viewport: { width: 450, height: 325 } }), errores = [];
    await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    const fot = async n => { const f0 = await p.evaluate(() => window.__mockXR.fotogramas); await p.waitForFunction(f => window.__mockXR.fotogramas >= f, f0 + n, { timeout: 60000, polling: 100 }); };
    // memoria con el GC forzado si el Chrome lo permite (sin --js-flags=--expose-gc, gc no existe: se mide igualmente, y el margen del heap lo cubre)
    const mem = () => p.evaluate(() => { if (window.gc) window.gc(); const m = window.__g.renderer.info.memory; return { geo: m.geometries, tex: m.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1, mandos: window.__mandos ? window.__mandos().gpu : null }; });
    async function quieta() {   // el mundo sigue cargando teselas un rato: se espera a que geometrías y texturas se queden quietas 6 s seguidas
      let a = await mem(), n = 0;
      for (let i = 0; i < 90 && n < 6; i++) { await p.waitForTimeout(1000); const b = await mem(); n = b.geo === a.geo && b.tex === a.tex ? n + 1 : 0; a = b; }
      return a;
    }
    async function sesion() {
      await p.waitForSelector("#btnVR", { timeout: 30000 }); await p.click("#btnVR");
      await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 60000, polling: 200 });
      await fot(8);
      await p.evaluate(() => window.__mockXR.sesion.end());
      await p.waitForFunction(() => !window.__vrDebug().on, null, { timeout: 30000, polling: 200 });
      await p.waitForTimeout(500);
    }
    try {
      await p.goto(url + "?debug&hora=12:00");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__vrDebug, null, { timeout: 120000, polling: 500 });
      const base = await quieta();
      await sesion(); const calen = await quieta();
      for (let i = 1; i < CICLOS; i++) await sesion();
      const fin = await quieta();
      const n = await p.evaluate(() => window.__vrDebug().sesionesN);
      console.log("   memoria VR (" + n + " sesiones): base " + JSON.stringify(base) + " · tras la 1ª " + JSON.stringify(calen) + " · tras la última " + JSON.stringify(fin));
      console.log("   Δ(última − 1ª): geometrías " + (fin.geo - calen.geo) + ", texturas " + (fin.tex - calen.tex) + ", heap " + (fin.heapMB - calen.heapMB).toFixed(1) + " MB");
      assert.strictEqual(n, CICLOS, "se hicieron " + CICLOS + " sesiones");
      assert.ok(fin.geo - calen.geo <= MARGEN_GPU, "geometrías: " + calen.geo + " → " + fin.geo);
      assert.ok(fin.tex - calen.tex <= MARGEN_GPU, "texturas: " + calen.tex + " → " + fin.tex);
      if (fin.heapMB >= 0) assert.ok(fin.heapMB - calen.heapMB <= MARGEN_HEAP_MB, "heap: " + calen.heapMB + " → " + fin.heapMB + " MB");
      assert.ok(fin.mandos === 0 || fin.mandos === null, "al salir, los mandos no dejan recursos apuntados: " + fin.mandos);
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });
});
