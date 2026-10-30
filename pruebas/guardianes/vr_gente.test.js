"use strict";
// I5: «Ir con» e «Ir a esta baliza» dentro de la VR (apps/web/motor/29_vr.js). Arriba, en Node y sin navegador: el trozo puro de la sección Gente
// del panel (orden por distancia, texto de la distancia y del modo, cuántas filas caben, cuándo hay que repintar). Abajo, OPCIONAL con GEMELO_VR=1
// (como las demás VR con el mock: con SwiftShader la VR es inestable, vr.test.js), en el navegador por el turno del banco: con el WebXR simulado
// (pruebas/mock_xr.js) y ?presencia=sim&n=3, abre el panel, pulsa «Ir con» de un simulado con el rayo y el gatillo y comprueba que el rig acaba a
// 2-4 m de él; abre la ficha de una baliza apuntando a su columna de luz, pulsa «Ir a esta baliza» y comprueba que acaba a ~4,5 m de la columna.
// Comprueban la LÓGICA; no dicen nada de legibilidad, puntería ni mareo en unas Quest (no probado).
const test = require("node:test"), { describe, before } = test, assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/29_vr.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "29_vr.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn VrGentePuro;")();
}
const G = puro();

test("sin presencia: la sección no tiene filas (el panel dice «Solo tú»)", () => {
  const r = G.filas(null, { x: 0, y: 0 }, 4);
  assert.deepStrictEqual(r, { activo: false, n: 0, filas: [], resto: 0 });
  const v = G.filas([], { x: 0, y: 0 }, 4);
  assert.ok(v.activo && v.n === 0 && v.filas.length === 0, "con presencia y nadie a la vista, tampoco hay filas: " + JSON.stringify(v));
  assert.ok(/Solo tú/.test(FUENTE), "el texto «Solo tú» debe estar en el panel");
});

test("las filas van de la más cercana a la más lejana, con su modo (a pie, en quad, con el dron) y como mucho las que caben", () => {
  const pts = [
    { id: "sim0", alias: "Lejos", x: 300, y: 0, modo: 0 }, { id: "sim1", alias: "Cerca", x: 3, y: 4, modo: 1 },
    { id: "sim2", alias: "Medio", x: 0, y: -40, modo: 2 }, { id: "sim3", alias: "Raro", x: 0, y: 60, modo: 7 }, { id: "sim4", alias: "", x: 1500, y: 0 }
  ];
  const r = G.filas(pts, { x: 0, y: 0 }, 4);
  assert.deepStrictEqual(r.filas.map(f => f.id), ["sim1", "sim2", "sim3", "sim0"]);
  assert.strictEqual(r.n, 5); assert.strictEqual(r.resto, 1);
  assert.deepStrictEqual(r.filas.map(f => f.modo), ["en quad", "con el dron", "a pie", "a pie"], "un modo desconocido se lee como a pie");
  assert.strictEqual(r.filas[0].dist, "5 m");
  assert.strictEqual(G.filas(pts, { x: 0, y: 0 }, 9).filas[4].alias, "Visitante", "sin alias, «Visitante»");
});

test("la distancia se lee por tramos (y así el panel no se repinta a cada paso de alguien lejano)", () => {
  assert.strictEqual(G.distTxt(2.4), "2 m"); assert.strictEqual(G.distTxt(19.4), "19 m"); assert.strictEqual(G.distTxt(23), "25 m");
  assert.strictEqual(G.distTxt(347), "350 m"); assert.strictEqual(G.distTxt(999), "1,0 km"); assert.strictEqual(G.distTxt(1260), "1,3 km");
  assert.strictEqual(G.distTxt(NaN), "–");
  const a = G.filas([{ id: "a", alias: "A", x: 341, y: 0, modo: 0 }], { x: 0, y: 0 }, 4), b = G.filas([{ id: "a", alias: "A", x: 344, y: 0, modo: 0 }], { x: 0, y: 0 }, 4);
  assert.strictEqual(G.firma(a), G.firma(b), "3 m más lejos a 340 m no cambia lo que se ve");
  const c = G.filas([{ id: "a", alias: "A", x: 344, y: 0, modo: 1 }], { x: 0, y: 0 }, 4);
  assert.notStrictEqual(G.firma(a), G.firma(c), "cambiar de modo sí");
});

// ---------- en el navegador (Cerro del fixture con el cliente web, por HTTP), OPCIONAL con GEMELO_VR=1. Chrome por lanza(): el compartido de la puerta o uno propio dentro del turno.
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");
const SALTO = motivoSalto("«Ir con» e «Ir a esta baliza» en la VR simulada") || saltoPagina("«Ir con» e «Ir a esta baliza» en la VR simulada");
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza();
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

describe("en el navegador (VR simulada)", () => {
before(async () => { if (!SALTO && process.env.GEMELO_VR) await prepara(); });

test("panel VR: «Ir con» de un simulado deja el rig a 2-4 m de él; la ficha de una baliza (abierta con el rayo en su columna) lleva con «Ir a esta baliza» a ~4,5 m; sin presencia, Gente sin filas", { timeout: 400000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 para «Ir con» e «Ir a esta baliza» con el WebXR simulado");
  await prepara();
  const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
  await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  const dbg = () => p.evaluate(() => window.__vrDebug());
  const fot = async n => { const f0 = await p.evaluate(() => window.__mockXR.fotogramas); await p.waitForFunction(f => window.__mockXR.fotogramas >= f, f0 + n, { timeout: 60000, polling: 100 }); };
  const pulsa = async (mano, k) => { await p.evaluate(a => window.__mockXR.boton(a[0], a[1], true), [mano, k]); await fot(3); await p.evaluate(a => window.__mockXR.boton(a[0], a[1], false), [mano, k]); await fot(3); };
  const fisica = (r, w) => { const c = Math.cos(-r.yaw), s = Math.sin(-r.yaw), x = w[0] - r.x, y = w[1] - r.y, z = w[2] - r.z; return [x * c + z * s, y, -x * s + z * c]; };
  // apunta el mando derecho al centro del botón id de una lámina (panel o ficha de baliza) hasta que el rayo lo resalta; la lámina sigue a la cabeza: se relee cada vez
  async function aBoton(cual, id) {
    for (let i = 0; i < 12; i++) {
      const d = await dbg(), bots = await p.evaluate(c => window.__vrBotones(c), cual), q = bots.find(b => b.id === id);
      assert.ok(q, "no hay botón " + id + " en " + cual + ": " + JSON.stringify(bots.map(b => b.id)));
      const tam = cual === "baliza" ? d.fichaBTam : d.panelTam, pos = cual === "baliza" ? d.fichaBPos : d.panelPos, hov = cual === "baliza" ? d.hoverB : d.hover;
      if (hov === id) return true;
      const lx = ((q.x + q.w / 2) / tam[0] - 0.5) * tam[2], ly = (0.5 - (q.y + q.h / 2) / tam[1]) * tam[3], ang = Math.atan2(d.cabeza[0] - pos[0], d.cabeza[2] - pos[2]);
      await p.evaluate(v => window.__mockXR.apunta("right", v), fisica(d.rig, [pos[0] + lx * Math.cos(ang), pos[1] + ly, pos[2] - lx * Math.sin(ang)]));
      await fot(3);
    }
    const d = await dbg(); return (cual === "baliza" ? d.hoverB : d.hover) === id;
  }
  try {
    await p.goto(url + "?debug&presencia=sim&n=3");
    await p.waitForFunction(() => window.__g && window.__g.listo() && window.__vrDebug && window.__llegada, null, { timeout: 120000, polling: 500 });
    await p.waitForSelector("#btnVR", { timeout: 30000 }); await p.click("#btnVR");
    await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 60000, polling: 200 });
    await fot(4);
    // 1) el panel, con la sección Gente: espera a que se vea al menos un simulado (con pose)
    await p.waitForFunction(() => { const d = window.__vrDebug(); return d.panel && d.gente && d.gente.activo && d.gente.filas.length > 0; }, null, { timeout: 90000, polling: 300 });
    let d = await dbg();
    assert.ok(d.gente.filas.every(f => /^(a pie|en quad|con el dron)$/.test(f.modo) && / (k?m)$/.test(f.dist)), "filas de Gente: " + JSON.stringify(d.gente));
    // «Ir con» de un simulado. El sitio lo elige Encuentro (26_presencia.js, I1): a 2,5-4 m si cabe; junto a un borde de la finca o entre troncos
    // puede quedar «empujado» más lejos. Se prueba con hasta tres personas y se exige: siempre, que el rig acaba en el sitio que dio Encuentro; y en
    // al menos una (la primera que no salga «empujado»), que acaba a 2-4 m de ella.
    const probados = [];
    let buena = null;
    for (let intento = 0; intento < 3 && !buena; intento++) {
      if (intento) {   // el panel se cerró al llegar: Y lo vuelve a abrir
        await p.waitForFunction(() => window.__vrVuelo().fundido === 0, null, { timeout: 30000, polling: 100 });
        await pulsa("left", 5);
        await p.waitForFunction(() => { const d = window.__vrDebug(); return d.panel && d.gente && d.gente.filas.length > 0; }, null, { timeout: 60000, polling: 300 });
      }
      d = await dbg();
      const fila = d.gente.filas.find(f => !probados.includes(f.id)); if (!fila) break;
      const id = fila.id, n0 = (await p.evaluate(() => window.__presencia())).idas, pulsos0 = await p.evaluate(() => window.__mockXR.registro.filter(x => x === "pulso").length);
      probados.push(id);
      assert.ok(await aBoton("panel", "ir:" + id), "el rayo no llegó a resaltar «Ir con» de " + id);
      await p.evaluate(() => window.__mockXR.gatillo("right"));
      // la posición de los dos en el mismo instante en que se llega (el simulado sigue andando)
      const h = await p.waitForFunction(a => { const e = window.__presencia(); if (e.idas <= a[1]) return null; const d = window.__vrDebug(), q = window.__presencia("puntos").find(x => x.id === a[0]); return q ? { rig: d.rig, q, panel: d.panel, ultima: e.ultimaIda } : null; }, [id, n0], { timeout: 60000, polling: 50 });
      const ll = await h.jsonValue(), dIr = Math.hypot(ll.rig.x - ll.q.x, -ll.rig.z - ll.q.y);
      console.log("   «Ir con» " + id + ": rig a " + dIr.toFixed(2) + " m de él (" + JSON.stringify(ll.ultima) + ")");
      assert.ok(Math.hypot(ll.rig.x - ll.ultima.x, -ll.rig.z - ll.ultima.y) < 0.3, "el rig no acabó en el sitio de Encuentro: " + JSON.stringify(ll));
      assert.strictEqual(ll.panel, false, "al llegar se cierra el panel (para verla)");
      assert.ok(await p.evaluate(p0 => window.__mockXR.registro.filter(x => x === "pulso").length > p0, pulsos0), "pulsar «Ir con» da un pulso háptico");
      if (ll.ultima.libre !== "empujado") { assert.ok(dIr >= 2 && dIr <= 4, "el rig debería acabar a 2-4 m de " + id + ": " + dIr.toFixed(2) + " m " + JSON.stringify(ll)); buena = id; }
    }
    assert.ok(buena, "ninguno de " + JSON.stringify(probados) + " tenía sitio libre a 2-4 m (todos «empujados»)");
    await p.waitForFunction(() => window.__vrVuelo().fundido === 0, null, { timeout: 30000, polling: 100 });
    // 2) la ficha de una baliza: el rayo sobre su columna de luz (a 25 m de su pie) y el gatillo
    d = await dbg();
    const col = (await p.evaluate(() => window.__vrBalizas()))[0];
    await p.evaluate(v => window.__mockXR.apunta("right", v), fisica(d.rig, [col[0], col[1] + 25, col[2]])); await fot(3);
    await p.evaluate(() => window.__mockXR.gatillo("right"));
    await p.waitForFunction(() => { const d = window.__vrDebug(); return d.fichaB && d.balK === 0; }, null, { timeout: 30000, polling: 200 });
    d = await dbg();
    assert.ok(Array.isArray(d.balGente), "con presencia, la ficha de la baliza dice quién está (lista, aunque esté vacía): " + JSON.stringify(d.balGente));
    const n1 = (await p.evaluate(() => window.__llegada())).n;
    assert.ok(await aBoton("baliza", "bir"), "el rayo no llegó a resaltar «Ir a esta baliza»");
    await p.evaluate(() => window.__mockXR.gatillo("right"));
    await p.waitForFunction(n => window.__llegada().n > n && window.__vrVuelo().fundido === 0, n1, { timeout: 60000, polling: 100 });
    await fot(2); d = await dbg();
    const dBal = Math.hypot(d.rig.x - col[0], d.rig.z - col[2]);
    console.log("   «Ir a esta baliza»: rig a " + dBal.toFixed(2) + " m de la columna");
    assert.ok(dBal >= 3.5 && dBal <= 5.6, "el rig debería acabar a ~4,5 m de la columna (4-5,5 m, Encuentro.BALIZA): " + dBal.toFixed(2));
    assert.ok(!d.vuelo, "de pie, andando");
    // 3) sin presencia (libera), la sección Gente se queda sin filas: el panel dice «Solo tú»
    await p.evaluate(() => window.__presencia("libera"));
    await pulsa("left", 5); await fot(4);
    await p.waitForFunction(() => { const d = window.__vrDebug(); return d.panel && d.gente && !d.gente.activo && d.gente.filas.length === 0; }, null, { timeout: 30000, polling: 200 });
    assert.strictEqual((await p.evaluate(() => window.__vrBotones())).filter(b => /^ir:/.test(b.id)).length, 0, "sin presencia no hay «Ir con»");
    await p.evaluate(() => window.__mockXR.sesion.end()); await p.waitForFunction(() => !window.__vrDebug().on, null, { timeout: 30000, polling: 200 });
    assert.deepStrictEqual(errores, []);
  } finally { await p.close(); }
});
});
