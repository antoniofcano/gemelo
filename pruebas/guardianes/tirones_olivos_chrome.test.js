"use strict";
// L1-09 y L1-12 (auditoría de noviembre de 2026, lente 1): ¿bloquean el fotograma la reclasificación de los olivos y el horneado de los lejanos? Medida para el banco
// (npm run banco:encarga; NO la ejecuta quien la escribe), en Chrome sin pantalla con SwiftShader: el JS de la CPU sí se mide; el dibujo, no (regla 6: los fps solo los da
// un aparato real). Lo que mide:
//   · L1-09 (y L1-11): el tiempo de cada Arboles.actualiza (el bloque «árboles (niveles)» del reparto: reclasifica y reclasificaEscalera son síncronas) con la cámara
//     barriendo la finca y con la cámara quieta 5 s (las repeticiones por tiempo), y las tareas largas (PerformanceObserver «longtask», ≥ 50 ms) de la carga, donde caen la
//     Mascara y el primer repartirT de cada tesela de olivos del tileset (olivos-tiles.ts, en el .then de la huella, fuera de la Cola);
//   · L1-12: con ?olivos=escalera, lo que dibuja el motor FUERA del lienzo (renderer.render con un destino puesto: el horneado de las variantes de 07ac, lejanos.ts `hornea`)
//     sumado por fotograma, mientras aparece la capa de lejanos.
// Los topes son la decisión de ACEPTADOS.md («se arreglan solo si la medida los señala»): [SUPUESTO] 4 ms de JS por fotograma para un bloque (la mitad de los 8 ms del Quest,
// XrPerillas) y 8 ms para el horneado de un fotograma. Por eso las comprobaciones van como `todo`: el banco da la cifra y, si pasa del tope, el hallazgo se arregla (a la Cola);
// si no, se firma el aceptado con la cifra. GEMELO_MIDE=1 imprime las cifras para MEDIDAS. NO probado en el Quest (allí el JS va ~3-4 veces más lento que en el escritorio [SUPUESTO]).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const MIDE = !!process.env.GEMELO_MIDE;
// Opcional (GEMELO_TIRONES=1), como memoria_vr_chrome: la escalera tarda minutos en SwiftShader y no hace falta en cada puerta pesada, sino una vez para decidir.
// Lanzarla (por el banco, un Chrome a la vez; lanza() pide el turno):  GEMELO_TIRONES=1 GEMELO_MIDE=1 node --test pruebas/guardianes/tirones_olivos_chrome.test.js
const SALTO = (process.env.GEMELO_TIRONES ? null : "opcional: define GEMELO_TIRONES=1 (medida de L1-09 y L1-12 para decidir; minutos en SwiftShader)") ||
  motivoSalto("los tirones de los olivos (L1-09, L1-12)") || saltoPagina("los tirones de los olivos (L1-09, L1-12)");
const OLIVO = fs.existsSync(path.join(RAIZ, "apps", "web", "olivo", "node_modules", "three-gen", "package.json"));
const TOPE_BLOQUE_MS = 4, TOPE_HORNEO_MS = 8, TOPE_LARGA_MS = 100;   // [SUPUESTO], ver arriba (una tarea larga de la carga: hasta 100 ms)
const TODO = "L1-09/L1-12: medida para decidir (ACEPTADOS.md); el tope es [SUPUESTO] y SwiftShader no es el Quest";

/** abre la página con la consulta dada y espera a que el mundo esté listo; deja puesto el observador de tareas largas desde el principio */
async function abre(nav, base, consulta) {
  const p = await (await nav.newContext({ viewport: { width: 450, height: 325 } })).newPage(), errores = [];
  p.on("pageerror", e => errores.push(String(e)));
  await p.addInitScript(() => {
    window.__largas = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__largas.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); } catch (e) { window.__largas = null; }
  });
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  return { p, errores };
}
const est = "x => { const s = x.slice().sort((a, b) => a - b); return { n: s.length, max: +(s[s.length - 1] || 0).toFixed(2), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), media: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(3) }; }";

let srv, nav, base;
test.before(async () => {
  if (SALTO) return;
  const m = montaPagina({ finca: "hituelo", olivos: OLIVO });
  srv = await sirve(m.carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza();
});
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

test("L1-09 y L1-11: el bloque «árboles (niveles)» barriendo la finca y con la cámara quieta, y las tareas largas de la carga", { timeout: 240000, todo: TODO }, async t => {
  if (SALTO) return t.skip(SALTO);
  const { p, errores } = await abre(nav, base, "?arbsc=1");
  try {
    await p.waitForFunction(() => window.__g.pendientes() === 0, null, { timeout: 90000, polling: 500 }).catch(() => {});
    const r = await p.evaluate(async est => {
      const g = window.__g, A = g.Arboles, orig = A.actualiza, t = [], E = new Function("return " + est)();
      A.actualiza = function () { const a = performance.now(); try { return orig.apply(this, arguments); } finally { t.push(performance.now() - a); } };
      const espera = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 24; i++) { g.orb.az = i * 0.29; g.orb.dist = 150 + 60 * (i % 6); g.objetivo.x = -180 + i * 15; await espera(300); }   // barrido: la órbita por la finca
      const moviendo = t.splice(0), s0 = A.resumen().subidas;
      await espera(5000);   // quieta: solo las repeticiones por tiempo (cada 1,5 s en órbita)
      const quieta = t.splice(0);
      A.actualiza = orig;
      return { moviendo: E(moviendo), quieta: E(quieta), subidasQuieta: A.resumen().subidas - s0, olivos: A.resumen(), largas: window.__largas };
    }, est);
    if (MIDE) console.log(JSON.stringify(r));
    t.diagnostic(JSON.stringify(r));
    assert.deepStrictEqual(errores, []);
    assert.ok(r.moviendo.n > 0, "Arboles.actualiza no se llamó: ¿cambió el bucle?");
    assert.ok(r.moviendo.max <= TOPE_BLOQUE_MS, "L1-09: el bloque «árboles (niveles)» llega a " + r.moviendo.max + " ms en un fotograma (tope [SUPUESTO] " + TOPE_BLOQUE_MS + " ms): reclasifica, a la Cola");
    assert.ok(r.quieta.max <= TOPE_BLOQUE_MS, "L1-11: con la cámara quieta, " + r.quieta.max + " ms");
    assert.strictEqual(r.subidasQuieta, 0, "L1-11: con la cámara quieta no se vuelven a subir los búferes de los niveles 1 y 2");
    if (r.largas) assert.ok(r.largas.every(d => d <= TOPE_LARGA_MS), "L1-09: tareas largas en la carga (ms): " + r.largas.join(", ") + " (tope [SUPUESTO] " + TOPE_LARGA_MS + " ms)");
  } finally { await p.context().close(); }
});

test("L1-12: con ?olivos=escalera, lo que se dibuja fuera del lienzo (el horneado de los lejanos) por fotograma", { timeout: 600000, todo: TODO }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!OLIVO) return t.skip("el constructor de olivos no está instalado (cd apps/web/olivo && npm ci): el horneado de los lejanos NO se ha medido");
  const { p, errores } = await abre(nav, base, "?olivos=escalera");
  try {
    // cada renderer.render con un destino puesto (no el lienzo), con su fotograma (un contador de requestAnimationFrame) y su duración
    await p.evaluate(() => {
      const R = window.__g.renderer, orig = R.render, reg = window.__horneo = { f: 0, porF: {}, n: 0 };
      (function tic() { reg.f++; requestAnimationFrame(tic); })();
      R.render = function () { if (!R.getRenderTarget()) return orig.apply(this, arguments); const a = performance.now(); try { return orig.apply(this, arguments); } finally { reg.n++; reg.porF[reg.f] = (reg.porF[reg.f] || 0) + performance.now() - a; } };
    });
    const capa = await p.waitForFunction(() => { const e = window.__g.Arboles.resumen().escalera; return !!(e && e.lejanos && e.lejanos > 0); }, null, { timeout: 480000, polling: 1000 }).then(() => true, () => false);
    await p.waitForTimeout(3000);
    const r = await p.evaluate(est => { const h = window.__horneo, E = new Function("return " + est)(); return { capa: true, renders: h.n, fotogramas: E(Object.values(h.porF)), largas: window.__largas, escalera: window.__g.Arboles.resumen().escalera }; }, est);
    r.capa = capa;
    if (MIDE) console.log(JSON.stringify(r));
    t.diagnostic(JSON.stringify(r));
    assert.deepStrictEqual(errores, []);
    assert.ok(capa, "la capa de lejanos no apareció a tiempo: el horneado NO se ha medido");
    assert.ok(r.fotogramas.max <= TOPE_HORNEO_MS, "L1-12: un fotograma hornea " + r.fotogramas.max + " ms fuera del lienzo (" + r.renders + " renders en " + r.fotogramas.n + " fotogramas; tope [SUPUESTO] " + TOPE_HORNEO_MS + " ms): el horneado, a la Cola");
  } finally { await p.context().close(); }
});
