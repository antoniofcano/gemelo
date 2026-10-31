"use strict";
// C10, cuarta tanda (doc/sistema/COMPONENTES.md): el componente «capa-ndvi» (apps/web/motor/10b_capa_ndvi.js) y el núcleo que queda en 10_ndvi.js. En Node y sin navegador,
// con el three de verdad (el de apps/web) y un DOM de mentira: la escala sale igual que antes, el núcleo funciona sin el componente, la textura se pinta con la rampa de
// siempre, y al liberar los uniformes vuelven a su estado y la textura se suelta. Que se vea igual, en Chrome, va por el banco; iPhone y Quest, sin probar.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

function bus() {
  const oy = {};
  return { on(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); return () => { oy[ev] = (oy[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { (oy[ev] || []).slice().forEach(f => f(d)); return (oy[ev] || []).length; }, hay: ev => !!(oy[ev] && oy[ev].length) };
}
function contexto(Bus) {
  const sueltas = [], n = { on: (ev, fn) => { const q = Bus.on(ev, fn); sueltas.push(q); return q; }, limpia: fn => { sueltas.push(fn); return fn; }, api: () => null, parametros: {} };
  n.suelta = () => sueltas.splice(0).reverse().forEach(f => f());
  return n;
}
function el(ini) {
  const oy = {};
  return Object.assign({ checked: false, value: "0", max: "", hidden: true, textContent: "", innerHTML: "",
    addEventListener(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); }, removeEventListener(ev, fn) { oy[ev] = (oy[ev] || []).filter(f => f !== fn); },
    dispara(ev, e) { (oy[ev] || []).slice().forEach(f => f(e || { target: this })); }, oyentes: ev => (oy[ev] || []).length }, ini);
}
/** 4 × 2 celdas y dos fechas (milésimas de NDVI); la celda 0 de la primera fecha sin dato */
const FECHAS = ["2026-03-01", "2026-09-15"], DATOS = [-32768, 200, 300, 400, 500, 600, 700, 800, 100, 200, 300, 400, 500, 600, 700, 900];
function mundo(extra) {
  const dom = {}, $ = id => (dom[id] = dom[id] || el()), lienzos = [];
  const documento = { createElement() {
    const cv = { getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), w, h }), putImageData(im) { cv.imagen = im; } }) };
    lienzos.push(cv); return cv;
  } };
  const g = { THREE, Bus: bus(), D: { ndvi: { w: 4, h: 2, fechas: FECHAS, media: [0.45, 0.5], b64: "x" } }, $, b64: () => [], i16: () => Int16Array.from(DATOS), fmt: (v, d) => v.toFixed(d),
    document: documento, ANCHO: 40, ALTO: 20, x0: 0, yN: 20, tinte: false, ndLo: 0, ndHi: 1, aplicaLuego() { g.reaplicado++; }, reaplicado: 0, modo: "gem",
    gArboles: {}, gFollaje: {}, gSombras: {}, nube: {}, UN: { uNdviOn: { value: 0 }, uNdviMap: { value: null } } };
  return { g: Object.assign(g, extra), dom, $, lienzos };
}
/** el núcleo y el componente en el mismo contexto, como en el motor concatenado */
function monta(m, conCapa) {
  const defs = [], ctx = vm.createContext(m.g);
  m.g.Componentes = { registra: d => { defs.push(d); return true; } };
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/10_ndvi.js") + (conCapa ? lee("apps/web/motor/10b_capa_ndvi.js") : "") +
    "\nglobalThis.__n = { pintaNdvi, ndviRel, rampa, idx: () => ndviIdx, pon: i => { ndviIdx = i; }, NDV };", ctx, { filename: "10_ndvi+10b" });
  return { def: defs[0], n: m.g.__n };
}

test("capa-ndvi: manifiesto, y no dibuja en la escena (0 llamadas, 0 triángulos: lo pinta el sombreador del terreno)", () => {
  const m = mundo(), { def: d } = monta(m, true);
  assert.strictEqual(d.id, "capa-ndvi"); assert.strictEqual(d.bandera.url, "capandvi"); assert.strictEqual(d.bandera.defecto, true); assert.strictEqual(JSON.stringify(d.fases), "{}");
  assert.deepStrictEqual([d.presupuesto.llamadas, d.presupuesto.triangulos], [0, 0]);
  assert.deepStrictEqual([...d.eventos.escucha], ["ndvi:cambia"]); assert.deepStrictEqual([...d.expone], []);
  assert.strictEqual(m.g.UN.uNdviMap.value, null, "registrarse no pinta nada");
});

test("núcleo sin el componente (?capandvi=0): la escala, ndviRel y el tinte funcionan; la fecha se mueve; no se crea ninguna textura", () => {
  const m = mundo(), { n } = monta(m, false);
  assert.strictEqual(n.idx(), 1, "arranca en la última fecha");
  assert.strictEqual(m.$("ndviSel").max, 1);
  m.$("cTinte").checked = true; m.$("cTinte").dispara("change");
  assert.strictEqual(m.g.tinte, true); assert.strictEqual(m.g.reaplicado, 1, "el tinte reaplica");
  // percentiles 5 y 95 de 100, 200, 300, 400, 500, 600, 700, 900 (milésimas): los mismos índices de siempre
  assert.ok(Math.abs(m.g.ndLo - 0.1) < 1e-9); assert.ok(Math.abs(m.g.ndHi - 0.9) < 1e-9);
  assert.ok(Math.abs(n.ndviRel(5, 15)) < 1e-9, "ndviRel lee la escala del núcleo: la celda del mínimo da 0"); assert.ok(Math.abs(n.ndviRel(35, 5) - 1) < 0.01, "y la del máximo, casi 1 (se recorta 0,001 celdas antes del borde)");
  m.$("ndviSel").dispara("input", { target: { value: "0" } });
  assert.strictEqual(n.idx(), 0); assert.ok(Math.abs(m.g.ndLo - 0.2) < 1e-9, "la escala sigue a la fecha (la celda sin dato no cuenta)");
  assert.strictEqual(m.lienzos.length, 0, "sin componente no hay lienzo"); assert.strictEqual(m.g.UN.uNdviMap.value, null);
  m.$("cNdvi").checked = true; assert.strictEqual(m.$("cNdvi").oyentes("change"), 0, "la casilla «Vigor» queda sin efecto");
});

test("capa-ndvi: la casilla enciende el uniforme y pinta con la rampa y la escala; la leyenda y la gráfica salen; cambiar de fecha rehace y suelta la textura anterior; liberar deja el núcleo como estaba", () => {
  const m = mundo(), { def: d, n } = monta(m, true), ctx = contexto(m.g.Bus), api = d.monta(ctx);
  const cas = m.$("cNdvi"); cas.checked = true; cas.dispara("change");
  assert.strictEqual(m.g.UN.uNdviOn.value, 1); assert.strictEqual(m.$("bNdvi").hidden, false);
  const t1 = api.textura(); assert.ok(t1 && t1.isCanvasTexture); assert.strictEqual(m.g.UN.uNdviMap.value, t1);
  assert.strictEqual(t1.generateMipmaps, false); assert.strictEqual(t1.magFilter, THREE.LinearFilter); assert.strictEqual(t1.minFilter, THREE.LinearFilter);
  const lz = m.lienzos[0]; assert.deepStrictEqual([lz.width, lz.height], [4, 2]);
  // celda 7 de la fecha 1 (900 = hi): el extremo verde de la rampa, opaca; escala 0,1-0,9
  const px = i => Array.from(lz.imagen.data.slice(i * 4, i * 4 + 4));
  const c = n.rampa((0.9 - 0.1) / 0.8); assert.deepStrictEqual(px(7), [c[0] * 255, c[1] * 255, c[2] * 255, 255].map(v => new Uint8ClampedArray([v])[0]));
  assert.strictEqual(m.$("ndviFecha").textContent, "15/09/2026"); assert.strictEqual(m.$("ndviRango").textContent, "medio 0.50 · escala de 0.10 a 0.90");
  assert.match(m.$("chispa").innerHTML, /<svg viewBox="0 0 250 46"/);
  // fecha anterior: la celda sin dato, transparente
  let soltadas = 0; t1.addEventListener("dispose", () => soltadas++);
  m.$("ndviSel").dispara("input", { target: { value: "0" } });
  assert.strictEqual(soltadas, 1, "dispose de la textura anterior"); assert.notStrictEqual(api.textura(), t1);
  assert.strictEqual(m.lienzos[1].imagen.data[3], 0, "sin dato, alfa 0"); assert.strictEqual(m.$("ndviFecha").textContent, "01/03/2026");
  // peso: la maqueta y el techo del manifiesto
  const mb = (w, h) => w * h * 4 / 1048576; console.log("medido capa-ndvi: textura de la maqueta 4 × 2 =", lz.width * lz.height * 4, "bytes");
  assert.ok(mb(500, 500) <= d.presupuesto.texturasMB, "500 × 500 celdas caben en el tope declarado");
  // apagar la casilla apaga el uniforme y esconde el bloque; no borra la textura
  cas.checked = false; cas.dispara("change"); assert.strictEqual(m.g.UN.uNdviOn.value, 0); assert.strictEqual(m.$("bNdvi").hidden, true);
  // liberar
  cas.checked = true; cas.dispara("change");
  const t3 = api.textura(); let s3 = 0; t3.addEventListener("dispose", () => s3++);
  d.libera(api); ctx.suelta();
  assert.strictEqual(s3, 1, "dispose al liberar"); assert.strictEqual(m.g.UN.uNdviOn.value, 0); assert.strictEqual(m.g.UN.uNdviMap.value, null); assert.strictEqual(m.$("bNdvi").hidden, true);
  assert.strictEqual(cas.oyentes("change"), 0, "suelta su escucha de la casilla"); assert.ok(!m.g.Bus.hay("ndvi:cambia"));
  assert.doesNotThrow(() => d.libera(api), "liberar dos veces no rompe");
  const lienzos = m.lienzos.length; n.pintaNdvi(); assert.strictEqual(m.lienzos.length, lienzos, "tras liberar, pintaNdvi solo calcula la escala");
});

test("capa-ndvi: montado tarde con la casilla ya marcada, pinta al momento; y al volver a montarse, también", () => {
  const m = mundo(), { def: d } = monta(m, true);
  m.$("cNdvi").checked = true;
  let ctx = contexto(m.g.Bus), api = d.monta(ctx);
  assert.strictEqual(m.g.UN.uNdviOn.value, 1); assert.ok(api.textura()); assert.strictEqual(m.$("bNdvi").hidden, false);
  d.libera(api); ctx.suelta();
  ctx = contexto(m.g.Bus); api = d.monta(ctx);
  assert.strictEqual(m.g.UN.uNdviOn.value, 1); assert.ok(api.textura()); assert.strictEqual(m.g.UN.uNdviMap.value, api.textura());
  d.libera(api); ctx.suelta();
});

test("una finca sin NDVI: el núcleo no pinta nada y la casilla no rompe", () => {
  const m = mundo({ D: {} }), { def: d, n } = monta(m, true), ctx = contexto(m.g.Bus), api = d.monta(ctx);
  assert.strictEqual(n.NDV, null); assert.doesNotThrow(() => n.pintaNdvi());
  const cas = m.$("cNdvi"); cas.checked = true; assert.doesNotThrow(() => cas.dispara("change"));
  assert.strictEqual(m.g.UN.uNdviOn.value, 1, "como antes: el uniforme se enciende, sin textura"); assert.strictEqual(api.textura(), null);
  assert.strictEqual(m.lienzos.length, 0);
  d.libera(api); ctx.suelta();
});

test("10_ndvi.js ya no dibuja: ni textura, ni lienzo, ni uniformes, ni gráfica; avisa por el Bus. 14_historia sigue llamando a pintaNdvi", () => {
  const f = lee("apps/web/motor/10_ndvi.js").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/CanvasTexture|createElement|UN\.|ndviTex|chispa|capaNdvi|"cNdvi"/.test(f), "10_ndvi.js sigue dibujando la capa");
  assert.match(f, /Bus\.emite\("ndvi:cambia", \{ lo: lo, hi: hi \}\)/);
  assert.match(lee("apps/web/motor/14_historia.js"), /pintaNdvi\(\)/);
});
