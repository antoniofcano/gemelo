"use strict";
// AG-P1 (posible fuga al entrar y salir de VR, PLAN P4): la medida en el navegador. Con el WebXR simulado (pruebas/mock_xr.js) se entra y se sale de VR N veces
// (GEMELO_VR_CICLOS, 10 por defecto) y se mide renderer.info.memory.{geometries,textures} y performance.memory.usedJSHeapSize (Chrome con
// --enable-precise-memory-info, ya en ARGS_CHROME) antes de la primera sesión (línea base), tras las DOS primeras (calentamiento), tras cada una de las siguientes
// y tras la última. Lo que se afirma es que entre el calentamiento y la última no crece (geometrías y texturas dentro de MARGEN_GPU en total; el heap, dentro de un
// margen por el GC) y que al salir los mandos no dejan nada apuntado.
// L2-06 (MU0-5, 2026-11-14): el goteo de AG-P1b (~3 geometrías y ~1 textura por sesión, 2026-11-04) YA NO ESTÁ con el código de hoy (las liberaciones de
// mundos/comun/vr-sesion.ts y mandos.ts, A3-6c): medido por el banco, de la 2ª a la 10ª sesión 67 geometrías / 23 texturas en todas. Lo que sube una vez entre la 1ª
// y la 2ª (≈ +10 geometrías y +11 texturas, de 57/12 a 67/23) NO es goteo: el inventario (abajo) lo sitúa en la subida a la tarjeta al dibujar (WebGLGeometries.get
// y setTexture2D desde renderBufferDirect): geometrías, texturas de datos y ortofotos que la vista de VR dibuja por primera vez y que se reutilizan después (no
// cuelgan de la escena al salir porque el rig y las láminas se descuelgan, sin soltarse, para la sesión siguiente). Por eso el calentamiento son dos sesiones.
// Ya no es `todo` ni opcional: corre en la puerta (≈ 1 min); con SwiftShader la página puede caerse («Page crashed»: firma de pruebas/banco/inestables.json, un
// reintento). SwiftShader vale para recuentos y memoria, no para fps; nada de esto se ha probado en unas Quest (no probado).
// Diagnóstico: GEMELO_VR_PILA=1 añade al inventario las líneas de la pila de quien subió cada recurso que queda vivo.
// Lanzarla suelta (por el banco, un Chrome a la vez; lanza() pide el turno):  node --test pruebas/guardianes/memoria_vr_chrome.test.js
const test = require("node:test"), { describe, before } = test, assert = require("node:assert");
const { lee, fs } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("la memoria al entrar y salir de VR") || saltoPagina("la memoria al entrar y salir de VR");
const CICLOS = Math.max(3, Number(process.env.GEMELO_VR_CICLOS || 10));
const CALIENTA = 2;   // sesiones de calentamiento (ver arriba: la 2ª sube por primera vez lo que la vista de VR dibuja)
const MARGEN_GPU = Number(process.env.GEMELO_VR_MARGEN_GPU || 3);   // geometrías/texturas que pueden aparecer en total tras el calentamiento (medido: 0); con 8 sesiones, un goteo de ≥ 0,5 por sesión salta
const MARGEN_HEAP_MB = Number(process.env.GEMELO_VR_MARGEN_HEAP || 40);
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza();
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

describe("memoria al entrar y salir de VR (WebXR simulado)", () => {
  before(async () => { if (!SALTO) await prepara(); });

  test("diez sesiones seguidas no hacen crecer geometrías, texturas ni heap más allá del margen (L2-06)", { timeout: 900000 }, async t => {
    if (SALTO) return t.skip(SALTO);
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
      // el inventario de la GPU (como guiada_interior_dev): three, al subir una geometría o una textura, le pone una escucha «dispose» y se la quita al soltarla;
      // se engancha el addEventListener/removeEventListener del prototipo común (EventDispatcher) y se apunta qué es, dónde cuelga y quién la subió
      await p.evaluate(() => {
        let pr = Object.getPrototypeOf(window.__g.scene); while (pr && !Object.prototype.hasOwnProperty.call(pr, "addEventListener")) pr = Object.getPrototypeOf(pr);
        const vivas = new Map(), add = pr.addEventListener, rem = pr.removeEventListener;
        const clase = o => o.isBufferGeometry ? "geo " + o.type : o.isTexture ? "tex " + (o.isRenderTargetTexture ? "rt" : o.isCanvasTexture ? "canvas" : o.isDataTexture ? "data" : o.isCompressedTexture ? "comprimida" : "img") + (o.name ? " " + o.name : "") : null;
        pr.addEventListener = function (t, f) {
          const c = t === "dispose" && clase(this);
          if (c && !vivas.has(this.uuid)) vivas.set(this.uuid, { c, pila: String(new Error().stack).split("\n").slice(2, 9).map(s => s.trim().replace(/https?:\/\/[^/]+/, "").slice(0, 110)).join(" < ") });
          return add.call(this, t, f);
        };
        pr.removeEventListener = function (t, f) { if (t === "dispose" && vivas.has(this.uuid)) vivas.delete(this.uuid); return rem.call(this, t, f); };
        const donde = () => {
          const r = new Map(), ruta = o => { const n = []; for (let q = o; q && n.length < 6; q = q.parent) n.push(q.name || q.type); return n.reverse().join("/"); };
          window.__g.scene.traverse(o => {
            if (o.geometry) r.set(o.geometry.uuid, ruta(o) + (o.visible ? "" : " (oculto)"));
            for (const mt of [].concat(o.material || [])) for (const k in mt) { const t = mt[k]; if (t && t.isTexture) r.set(t.uuid, ruta(o) + " ." + k); }
          });
          return r;
        };
        window.__invGeo = { foto: () => [...vivas.keys()], nuevas: (antes, conPila) => { const a = new Set(antes), d = donde(), m = {}; for (const [k, v] of vivas) if (!a.has(k)) { const c = v.c + " @ " + (d.get(k) || "fuera de la escena") + (conPila ? " ← " + v.pila : ""); m[c] = (m[c] || 0) + 1; } return m; } };
      });
      const base = await quieta();
      await sesion(); const tras1 = await quieta();
      await sesion(); const calen = await quieta(), fotoCalen = await p.evaluate(() => window.__invGeo.foto());
      if (process.env.GEMELO_VR_PILA) await p.evaluate(() => { window.__invPila = true; });   // diagnóstico: con quién la subió (las líneas de la pila)
      const serie = [];
      for (let i = CALIENTA; i < CICLOS; i++) { await sesion(); const m = await mem(); serie.push(m.geo + "/" + m.tex); }
      console.log("   geometrías/texturas tras cada sesión (" + (CALIENTA + 1) + "ª…): " + serie.join(" "));
      const fin = await quieta(), nuevas = await p.evaluate(a => window.__invGeo.nuevas(a, !!window.__invPila), fotoCalen);
      console.log("   vivas tras la última sesión que no estaban tras la " + CALIENTA + "ª (qué · dónde cuelga): " + JSON.stringify(nuevas, null, 1));
      const n = await p.evaluate(() => window.__vrDebug().sesionesN);
      console.log("   memoria VR (" + n + " sesiones): base " + JSON.stringify(base) + " · tras la 1ª " + JSON.stringify(tras1) + " · tras la " + CALIENTA + "ª " + JSON.stringify(calen) + " · tras la última " + JSON.stringify(fin));
      console.log("   Δ(última − " + CALIENTA + "ª): geometrías " + (fin.geo - calen.geo) + ", texturas " + (fin.tex - calen.tex) + ", heap " + (fin.heapMB - calen.heapMB).toFixed(1) + " MB");
      assert.strictEqual(n, CICLOS, "se hicieron " + CICLOS + " sesiones");
      assert.ok(fin.geo - calen.geo <= MARGEN_GPU, "geometrías: " + calen.geo + " → " + fin.geo);
      assert.ok(fin.tex - calen.tex <= MARGEN_GPU, "texturas: " + calen.tex + " → " + fin.tex);
      if (fin.heapMB >= 0) assert.ok(fin.heapMB - calen.heapMB <= MARGEN_HEAP_MB, "heap: " + calen.heapMB + " → " + fin.heapMB + " MB");
      assert.ok(fin.mandos === 0 || fin.mandos === null, "al salir, los mandos no dejan recursos apuntados: " + fin.mandos);
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });
});
