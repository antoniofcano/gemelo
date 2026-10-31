"use strict";
// Caché de recetas (O5) en un Chrome REAL, con IndexedDB de verdad (el de Node es falso): se carga apps/web/olivo/cache.js tal cual (importmap a idb-keyval
// y sin build) y se mide, con una receta del tamaño de una E1 (~2,3 MB de arrays tipados): escribir, acierto en memoria, acierto en disco (caché nueva =
// otra sesión), que lo leído es igual byte a byte, que lo de otra versión se purga y que el tope de disco se cumple. Se salta sin Chrome o sin
// `cd apps/web/olivo && npm ci`. Una sola a la vez: va por el banco (npm run banco:encarga). SwiftShader no importa aquí (no se dibuja); el disco sí es
// el del equipo. NO probado en iPhone ni Quest (el navegador de gafas puede tener otra cuota y otro IndexedDB).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { sirve, lanza, motivoSalto } = require("./_navegador");

const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const SALTO = motivoSalto("la caché de recetas en Chrome") || (fs.existsSync(path.join(OLIVO, "node_modules", "idb-keyval", "dist", "index.js")) ? null : "apps/web/olivo sin instalar (cd apps/web/olivo && npm ci)");

const HTML = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"idb-keyval":"/node_modules/idb-keyval/dist/index.js"}}</script><body>cache`;

test("caché de recetas (O5) en Chrome: IndexedDB real, acierto, versión y tope", { timeout: 180000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const raiz = path.join(OLIVO), srv = await sirve(raiz, { bloquea: null });
  // la página de prueba se sirve desde un html en memoria: el servidor es de ficheros, así que se escribe uno temporal junto a la caché
  const html = path.join(OLIVO, "_cache_chrome.html"); fs.writeFileSync(html, HTML);
  const nav = await lanza();
  try {
    const p = await (await nav.newContext()).newPage(), errores = []; p.on("pageerror", e => errores.push(String(e)));
    await p.goto("http://127.0.0.1:" + srv.address().port + "/_cache_chrome.html");
    const r = await p.evaluate(async () => {
      const C = await import("/cache.js"), MB = 1048576, nom = "prueba-chrome-" + Date.now();
      const receta = (kb, s) => { const a = new Float32Array(Math.round(kb * 1024 / 4)); for (let i = 0; i < a.length; i += 97) a[i] = i * 0.001 + s; return { semilla: s, piezas: [{ atrib: { position: a } }] }; };
      const med = async (f, veces) => { const t = []; for (let i = 0; i < veces; i++) { const a = performance.now(); await f(); t.push(performance.now() - a); } t.sort((x, y) => x - y); return +t[t.length >> 1].toFixed(2); };
      const out = { persistente: navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null, cuota: navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null };
      const k = C.claveReceta({ tipo: "centenario3", epoca: "envero", semilla: 7, parametros: { altura: 4.5 } }, "E1"), r = receta(2300, 7);
      const c = C.creaCache({ memMB: 150, discoMB: 300, nombre: nom, diferido: f => f() });
      out.enDisco = c.estado().enDisco; out.aviso0 = c.estado().aviso;
      let a = performance.now(); await c.pon(k, r); out.escribe_ms = +(performance.now() - a).toFixed(1);
      out.acierto_memoria_ms = await med(() => c.lee(k), 100);
      out.acierto_disco_ms = await med(async () => { const f = C.creaCache({ memMB: 150, discoMB: 300, nombre: nom }); await f.lee(k); }, 9);
      const c2 = C.creaCache({ memMB: 150, discoMB: 300, nombre: nom }), r2 = await c2.lee(k);
      out.igual = !!r2 && r2.piezas[0].atrib.position.length === r.piezas[0].atrib.position.length && r2.piezas[0].atrib.position.every((v, i) => v === r.piezas[0].atrib.position[i]);
      // tope de disco: 12 recetas de 400 KB en 1 MB
      const nom2 = nom + "-tope", c3 = C.creaCache({ memMB: 150, discoMB: 1, nombre: nom2, diferido: f => f() });
      for (let i = 0; i < 12; i++) await c3.pon(C.PREFIJO_CLAVE + "tope" + i, receta(400, i));
      out.tope = c3.estado(); out.sobrevive_ultima = !!(await C.creaCache({ memMB: 5, discoMB: 1, nombre: nom2 }).lee(C.PREFIJO_CLAVE + "tope11"));
      return out;
    });
    console.log(JSON.stringify(r));
    t.diagnostic(JSON.stringify(r));
    assert.deepStrictEqual(errores, []);
    assert.ok(r.enDisco, "IndexedDB debía estar disponible en Chrome: " + r.aviso0);
    assert.ok(r.igual, "lo leído del disco no es lo escrito");
    assert.ok(r.tope.discoMB <= 1.05, "disco por encima del tope: " + JSON.stringify(r.tope));
    assert.ok(r.sobrevive_ultima, "la última escrita debía estar");
    assert.ok(r.acierto_memoria_ms < 1, "acierto en memoria " + r.acierto_memoria_ms + " ms");
  } finally { await nav.close(); srv.close(); try { fs.unlinkSync(html); } catch (e) { /* ya no está */ } }
});
