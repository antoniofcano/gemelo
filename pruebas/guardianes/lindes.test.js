"use strict";
// La linde de las hazas en el mundo (A4; apps/web/motor/44_lindes.js, componente «lindes-hazas»), en Node y sin navegador:
//   · lo puro (LindesPuro): los lados una sola vez (el común con una haza tuya, como propio), los cortes de cada lado (tramos de ≤ paso m y un corte en cada
//     borde de tesela, sin que ningún tramo cruce de una tesela a otra), las posiciones pegadas al relieve, los triángulos por metro y el tope de tramos
//     (con fast-check: propiedades sobre lados al azar), y el acercamiento de profundidad del sombreador (que no mueve nada en pantalla);
//   · el componente con un THREE, unas líneas de three y unas hazas de mentira: no crea nada sin hazas o sin las líneas, crea DOS mallas (propias y ajenas)
//     en gLinde, las rehace al oír «hazas:cambia», las repega en el mismo búfer al cambiar la exageración o llegar relieve, mide el ancho con el viewport de cada
//     ojo en VR y libera() lo suelta todo.
// El registro (con y sin el componente, ?lindes=0) y el catálogo de eventos los comprueba componentes.test.js; lo de Chrome (llamadas y triángulos de verdad)
// está en lindes_chrome.test.js.
const test = require("node:test"), assert = require("node:assert");
const fc = require("fast-check");
const { RAIZ, fs, path, lee } = require("./_util");

const FUENTE = lee("apps/web/motor/44_lindes.js");
const trozo = (ini, fin) => { const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return FUENTE.slice(i, f); };
const PURO = trozo("// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo("// [motor:inicio]", "// [motor:fin]");
const P = new Function("\"use strict\";\n" + PURO + "\nreturn LindesPuro;")();

const TS = 256;
const cuadro = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const largo = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const punto = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

test("los lados, una sola vez: el común entre una haza tuya y una ajena va como propio; el común entre dos ajenas, una vez; anillos sin cerrar se cierran", () => {
  const hs = [
    { es_mia: false, anillos: [cuadro(100, 0, 200, 80)] },               // comparte con la propia el lado x = 100
    { es_mia: true, anillos: [cuadro(0, 0, 100, 80)] },
    { es_mia: false, anillos: [cuadro(200, 0, 300, 80).slice(0, 4)] },   // sin cerrar; comparte con la primera el lado x = 200
    { es_mia: false, anillos: [[[500, 500], [500, 500.0004], [510, 500], [500, 510], [500, 500]]] },   // un lado de 0,4 mm: fuera
  ];
  const l = P.lados(hs);
  assert.strictEqual(l.propia.length, 4, "los 4 de la propia");
  assert.strictEqual(l.ajena.length, 3 + 3 + 3, "la primera sin su lado común con la propia; la segunda (cerrada a mano) sin el común con la primera; la tercera sin el lado de 0,4 mm");
  const claves = new Set(l.propia.concat(l.ajena).map(([a, b]) => P.clave(a, b)));
  assert.strictEqual(claves.size, l.propia.length + l.ajena.length, "ningún lado dos veces");
  assert.ok(l.propia.some(([a, b]) => P.clave(a, b) === P.clave([100, 0], [100, 80])), "el lado común, en las propias");
  assert.strictEqual(P.clave([1, 2], [3, 4]), P.clave([3, 4], [1, 2]), "sin sentido");
  assert.deepStrictEqual(P.lados([]), { propia: [], ajena: [] });
});

test("los cortes de un lado: tramos de ≤ paso y un vértice en cada borde de tesela (múltiplos de 256 m en UTM, no en locales)", () => {
  // centro_utm en x = 430.010: el borde de tesela de x = 430.080 cae en x local = 70
  const ox = 430010, oy = 4180000;
  const ts = P.cortes([60, 10], [80, 10], 2, TS, ox, oy);
  const xs = ts.map(t => 60 + 20 * t);
  assert.ok(xs.some(x => Math.abs(x - 70) < 1e-9), "un vértice en el borde x = 70: " + xs);
  assert.strictEqual(ts.length - 1, 10, "20 m en tramos de 2 m (el borde coincide con un corte)");
  const ts2 = P.cortes([60, 10], [81, 10], 2, TS, ox, oy);
  assert.strictEqual(ts2.length - 1, 11 + 1, "21 m → 11 tramos y uno más por el borde de tesela");
  // en y: oy = 4.180.000 → el borde de 4.180.096 (= 256 × 16.328,5…)? 4.180.096 / 256 = 16.328,5: no; el de 4.180.224 (16.329 × 256) sí: y local = 224
  const ty = P.cortes([0, 220], [0, 230], 4, TS, 0, oy).map(t => 220 + 10 * t);
  assert.ok(ty.some(y => Math.abs(y - 224) < 1e-9), "un vértice en el borde y = 224: " + ty);
  assert.deepStrictEqual(P.cortes([0, 0], [1, 0], 2, TS, 0, 0), [0, 1], "un lado corto, un tramo");
  assert.deepStrictEqual(P.cortes([0, 0], [10, 0], 5, 0, 0, 0), [0, 0.5, 1], "sin teselas (TS = 0), solo el paso");
});

// un lado al azar en la caja del mundo (±1,3 km del centro, mundos-virtuales), con un centro_utm al azar y un paso de 1 a 20 m
const ladoAzar = fc.record({
  a: fc.tuple(fc.double({ min: -1300, max: 1300, noNaN: true }), fc.double({ min: -1300, max: 1300, noNaN: true })),
  d: fc.tuple(fc.double({ min: -700, max: 700, noNaN: true }), fc.double({ min: -700, max: 700, noNaN: true })),
  ox: fc.integer({ min: 400000, max: 500000 }), oy: fc.integer({ min: 4100000, max: 4200000 }),
  paso: fc.double({ min: 1, max: 20, noNaN: true }),
}).filter(r => Math.hypot(r.d[0], r.d[1]) > 0.01);

test("propiedades (fast-check): tramos de ≤ paso que juntos miden el lado, crecientes, ninguno cruza un borde de tesela y su número está acotado", () => {
  fc.assert(fc.property(ladoAzar, ({ a, d, ox, oy, paso }) => {
    const b = [a[0] + d[0], a[1] + d[1]], L = largo(a, b), ts = P.cortes(a, b, paso, TS, ox, oy);
    assert.strictEqual(ts[0], 0); assert.strictEqual(ts[ts.length - 1], 1);
    let suma = 0;
    for (let i = 0; i + 1 < ts.length; i++) {
      assert.ok(ts[i + 1] > ts[i], "crecientes");
      const p = punto(a, b, ts[i]), q = punto(a, b, ts[i + 1]), l = largo(p, q); suma += l;
      assert.ok(l <= paso + 1e-3, "tramo de " + l + " m con paso " + paso);
      // ningún borde de tesela (x + ox o y + oy múltiplo de 256) estrictamente dentro del tramo (a más de 1 mm de sus extremos)
      for (const [u0, u1] of [[p[0] + ox, q[0] + ox], [p[1] + oy, q[1] + oy]]) {
        const lo = Math.min(u0, u1), hi = Math.max(u0, u1), g = Math.ceil((lo + 1e-3) / TS) * TS;
        assert.ok(!(g < hi - 1e-3), "el tramo " + JSON.stringify([p, q]) + " cruza el borde " + g);
      }
    }
    assert.ok(Math.abs(suma - L) < 1e-6 * Math.max(1, L), "los tramos miden el lado");
    const cruces = ["0", "1"].reduce((s, k) => s + Math.abs(Math.floor((b[k] + [ox, oy][k]) / TS) - Math.floor((a[k] + [ox, oy][k]) / TS)), 0);
    assert.ok(ts.length - 1 <= Math.ceil(L / paso) + cruces, (ts.length - 1) + " tramos para " + L + " m (paso " + paso + ", " + cruces + " cortes de tesela)");
  }), { numRuns: 400 });
});

test("las posiciones pegadas al relieve: (x, (suelo + alto) × exag, −y), 6 números por tramo, el mismo búfer al repegar y un límite de tramos", () => {
  const suelo = (x, y) => 100 + 0.1 * x - 0.05 * y, ls = P.lados([{ es_mia: true, anillos: [cuadro(0, 0, 10, 4)] }]).propia;
  const n = P.tramos(ls, 2, TS, 0, 0), w = P.escribe(ls, 2, TS, 0, 0, suelo, 2, P.ALTURA);
  assert.strictEqual(n, 5 + 2 + 5 + 2, "10 m → 5 y 4 m → 2, dos de cada"); assert.strictEqual(w.n, n); assert.strictEqual(w.pos.length, n * 6);
  for (let k = 0; k < w.pos.length; k += 3) {
    const x = w.pos[k], y = -w.pos[k + 2];
    assert.ok(Math.abs(w.pos[k + 1] - (suelo(x, y) + P.ALTURA) * 2) < 1e-3, "vértice " + k / 3 + " pegado al suelo");
  }
  for (let k = 0; k + 6 < w.pos.length; k += 6) assert.deepStrictEqual([w.pos[k + 3], w.pos[k + 5]], [w.pos[k + 6], w.pos[k + 8]], "cada tramo empieza donde acaba el anterior (la linde no se rompe)");
  const pos = w.pos, w2 = P.escribe(ls, 2, TS, 0, 0, () => 0, 1, P.ALTURA, undefined, pos);
  assert.strictEqual(w2.pos, pos, "mismo búfer (sin crear memoria al repegar)"); assert.ok(Math.abs(w2.pos[1] - P.ALTURA) < 1e-6);
  const w3 = P.escribe(ls, 2, TS, 0, 0, suelo, 1, 0, 3);
  assert.strictEqual(w3.n, 3); assert.strictEqual(w3.pos.length, 18, "como mucho 3 tramos");
});

test("presupuesto (regla 6): 6 triángulos por tramo, 3 por metro con el paso de 2 m; el plan nunca pasa de MAX_SEG tramos y, si no cabe, recorta primero las ajenas", () => {
  assert.strictEqual(P.TRI_SEG, 6, "LineSegmentsGeometry de three: 8 vértices y 6 triángulos por instancia");
  // una haza de 100 × 100 m que no cruza teselas: 400 m → 200 tramos → 1.200 triángulos (3 por metro)
  const una = P.plan([{ es_mia: true, anillos: [cuadro(10, 10, 110, 110)] }], TS, 0, 0);
  assert.deepStrictEqual([una.paso, una.n.propia, una.n.ajena, una.recortado], [2, 200, 0, false]);
  assert.strictEqual(P.triangulos(una.total) / una.longitud, 3);
  // la misma cruzando el borde de tesela x = 256 y el y = 256 (fuera de la rejilla del paso): un corte por lado → 4 tramos más
  const cruza = P.plan([{ es_mia: true, anillos: [cuadro(201, 201, 301, 301)] }], TS, 0, 0);
  assert.strictEqual(cruza.total, 204);
  // mucha linde (80 km): el paso crece hasta caber
  const muchas = []; for (let i = 0; i < 200; i++) muchas.push({ es_mia: i === 0, anillos: [cuadro(-1000 + (i % 20) * 100, -1000 + Math.floor(i / 20) * 100, -900 + (i % 20) * 100, -900 + Math.floor(i / 20) * 100)] });
  const p = P.plan(muchas, TS, 0, 0);
  assert.ok(p.total <= P.MAX_SEG && p.paso > 2 && !p.recortado, JSON.stringify({ total: p.total, paso: p.paso }));
  assert.ok(P.triangulos(p.total) <= 48000, "el presupuesto del manifiesto");
  // más lados que tramos posibles: se recortan las ajenas, no las propias
  const r = P.plan([{ es_mia: true, anillos: [cuadro(0, 0, 1, 1)] }, { es_mia: false, anillos: [cuadro(5, 5, 6, 6)] }, { es_mia: false, anillos: [cuadro(8, 8, 9, 9)] }], TS, 0, 0, 6);
  assert.deepStrictEqual([r.recortado, r.n.propia, r.n.ajena], [true, 4, 2]);
  fc.assert(fc.property(fc.array(fc.record({ es_mia: fc.boolean(), x: fc.integer({ min: -1200, max: 1100 }), y: fc.integer({ min: -1200, max: 1100 }), w: fc.integer({ min: 1, max: 400 }), h: fc.integer({ min: 1, max: 400 }) }), { maxLength: 30 }), fc.integer({ min: 4, max: 9000 }), (cs, max) => {
    const q = P.plan(cs.map(c => ({ es_mia: c.es_mia, anillos: [cuadro(c.x, c.y, c.x + c.w, c.y + c.h)] })), TS, 430000, 4180000, max);
    assert.ok(q.total <= max && q.paso >= 2);
    if (!q.recortado) assert.strictEqual(q.n.propia + q.n.ajena, P.tramos(q.lados.propia, q.paso, TS, 430000, 4180000) + P.tramos(q.lados.ajena, q.paso, TS, 430000, 4180000));
  }), { numRuns: 100 });
});

test("el acercamiento de profundidad: el sombreador de LineMaterial de three 0.186.1 tiene la línea de referencia, y escalar la posición de cámara no la mueve en pantalla", t => {
  const vs = "uniform float linewidth;\nvoid main() {\n\t\t\tvec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );\n\t\t\t" + P.ANCLA + "\n}";
  const c = P.conAcercamiento(vs);
  assert.match(c, /uniform float uAcerca;/); assert.match(c, /start\.xyz \*= uAcerca; end\.xyz \*= uAcerca;/);
  assert.ok(c.indexOf("uAcerca; end") > c.indexOf(P.ANCLA), "después de calcular los dos extremos");
  assert.strictEqual(P.conAcercamiento("otra cosa"), "otra cosa", "si three cambia, el sombreador se queda como está");
  // proyección perspectiva (fov 60°, aspecto 1,5, near 0,1, far 5000): x/w e y/w no cambian al escalar (x, y, z) de cámara; la profundidad sí, y baja
  const f = 1 / Math.tan(Math.PI / 6), A = 1.5, n = 0.1, F = 5000;
  const proy = ([x, y, z]) => { const w = -z; return [f / A * x / w, f * y / w, ((F + n) / (n - F) * z + 2 * F * n / (n - F)) / w]; };
  for (const v of [[3, -1.2, -40], [-120, 4, -900], [0.5, 0.1, -2]]) {
    const s = 1 - P.ESTILO.propia.acerca, a = proy(v), b = proy(v.map(q => q * s));
    assert.ok(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9, "no se mueve en pantalla");
    assert.ok(b[2] < a[2], "más cerca en profundidad");
  }
  assert.ok(P.ESTILO.propia.acerca > P.ESTILO.ajena.acerca, "la propia gana donde coinciden");
  const lm = path.join(RAIZ, "apps", "web", "node_modules", "three", "examples", "jsm", "lines", "LineMaterial.js");
  if (!fs.existsSync(lm)) return t.skip("sin apps/web/node_modules (npm ci en apps/web)");
  const src = fs.readFileSync(lm, "utf8");
  assert.ok(src.includes(P.ANCLA), "three ya no tiene «" + P.ANCLA + "»: revisar el acercamiento de 44_lindes.js");
  assert.ok(src.includes("uniform float linewidth;"));
});

test("estilo (regla 5 y UX): la propia destacada (más ancha, opaca, ámbar) y las ajenas discretas (finas, medio transparentes); en VR, algo más anchas", () => {
  const { propia, ajena } = P.ESTILO;
  assert.ok(propia.ancho > ajena.ancho && propia.opacidad === 1 && ajena.opacidad < 1);
  assert.notStrictEqual(propia.color, ajena.color);
  assert.strictEqual(P.ancho(4, false), 4); assert.strictEqual(P.ancho(4, true), 4 * P.VR_ANCHO);
  assert.match(FUENTE, /DATO DIBUJADO POR LA OFICINA/, "la procedencia de la linde, dicha");
});

// ---------- el componente con un THREE y unas líneas de mentira ----------
function entorno({ hazas = [], falla = false } = {}) {
  const reg = { añadidos: [], quitados: [], dispose: [], oyentes: {}, cargas: [], libera: [], consola: [] };
  class V4 { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 0; } set(x, y, z, w) { Object.assign(this, { x, y, z, w }); return this; } }
  class V2 { constructor() { this.x = 0; this.y = 0; } set(x, y) { this.x = x; this.y = y; return this; } }
  const THREE = { Vector4: V4, Group: class { constructor() { this.children = []; } add(o) { this.children.push(o); } } };
  class Geo {
    constructor() { this.a = {}; this.cajas = 0; }
    setPositions(p) { const data = { array: p, version: 0, set needsUpdate(v) { this.version++; } }; this.a.instanceStart = { data }; this.a.instanceEnd = { data }; this.cajas++; return this; }
    getAttribute(n) { return this.a[n]; } computeBoundingBox() { this.cajas++; } computeBoundingSphere() { this.cajas++; } dispose() { reg.dispose.push("geo"); }
  }
  class Mat { constructor(o) { this.o = o; this.uniforms = { resolution: { value: new V2() }, linewidth: { value: o.linewidth } }; this.transparent = !!o.transparent; } dispose() { reg.dispose.push("mat"); } }
  class Linea { constructor(g, m) { this.geometry = g; this.material = m; this.updates = 0; } updateMatrix() { this.updates++; } }
  const L = { LineSegments2: Linea, LineSegmentsGeometry: Geo, LineMaterial: Mat };
  let resuelve; const lib = new Promise((ok, ko) => { resuelve = () => (falla ? ko(new Error("sin red")) : ok(L)); });
  const env = {
    THREE, Mundo: { TS, cx: 430000, cy: 4180000, alCargar: fn => { reg.cargas.push(fn); } }, suelo: () => 10, exag: 1,
    gLinde: { add: o => reg.añadidos.push(o), remove: o => reg.quitados.push(o) },
    Hazas: { lindes: () => hazas.map(h => ({ id: h.id, es_mia: h.es_mia, anillos: h.anillos })) },
    Componentes: { libera: id => reg.libera.push(id) }, window: {}, console: { log: (...a) => reg.consola.push(a), warn: (...a) => reg.consola.push(a), error: (...a) => reg.consola.push(a) },
  };
  const nombres = Object.keys(env);
  const crea = new Function(...nombres, "\"use strict\";\n" + PURO + MOTOR + "\nreturn { LindesMotor: LindesMotor, pon: function (k, v) { eval(k + ' = v'); } };");
  // exag es una variable del motor que cambia el deslizador: se simula con un getter sobre un objeto mutable
  const fuera = crea(...nombres.map(n => env[n]));
  const limpia = [], n = { on: (ev, fn) => { (reg.oyentes[ev] = reg.oyentes[ev] || []).push(fn); return () => {}; }, limpia: fn => { limpia.push(fn); return fn; } };
  const api = fuera.LindesMotor(n, () => lib);
  return { api, reg, env, n, limpia, carga: async () => { resuelve(); await new Promise(r => setTimeout(r, 5)); }, emite: (ev, d) => (reg.oyentes[ev] || []).forEach(fn => fn(d)), pon: fuera.pon };
}
const HAZAS = [{ id: 1, es_mia: true, anillos: [cuadro(0, 0, 100, 80)] }, { id: 2, es_mia: false, anillos: [cuadro(100, 0, 250, 80)] }];

test("componente: sin hazas o sin las líneas de three no crea nada (ni escribe en la consola); con hazas, DOS mallas en gLinde con su estilo y su presupuesto", async () => {
  const sin = entorno(); await sin.carga();
  assert.deepStrictEqual([sin.reg.añadidos.length, sin.api.estado().llamadas, sin.api.estado().lib], [0, 0, "lista"]);
  const ko = entorno({ hazas: HAZAS, falla: true }); await ko.carga();
  assert.strictEqual(ko.reg.añadidos.length, 0); assert.match(ko.api.estado().lib, /^sin líneas: sin red/); assert.strictEqual(ko.reg.consola.length, 0);
  const e = entorno({ hazas: HAZAS });
  assert.strictEqual(e.reg.añadidos.length, 0, "antes de llegar las líneas, nada");
  await e.carga();
  assert.strictEqual(e.reg.añadidos.length, 1, "un grupo en gLinde (la casilla «Linde» lo apaga)");
  const g = e.reg.añadidos[0];
  assert.strictEqual(g.name, "linde de las hazas");
  assert.deepStrictEqual(g.children.map(o => o.name), ["lindes propias", "lindes ajenas"], "dos llamadas: propias y ajenas");
  const [mia, otra] = g.children;
  assert.ok(mia.material.o.linewidth > otra.material.o.linewidth && !mia.material.transparent && otra.material.transparent && otra.material.o.depthWrite === false);
  assert.strictEqual(mia.material.o.worldUnits, false, "ancho en píxeles: legible de cerca y de lejos");
  assert.ok(mia.material.uniforms.uAcerca.value < 1 && mia.material.uniforms.uAcerca.value < otra.material.uniforms.uAcerca.value);
  assert.strictEqual(typeof mia.raycast, "function"); assert.strictEqual(mia.raycast(), undefined, "sin rayos contra la línea");
  assert.ok(mia.renderOrder > otra.renderOrder);
  const s = e.api.estado();
  // propia 360 m → 180 tramos; la ajena sin el lado común (x = 100): 150 + 80 + 150 = 380 m → 190
  assert.deepStrictEqual([s.tramos.propia, s.tramos.ajena, s.llamadas, s.triangulos], [180, 190, 2, 6 * 370]);
  assert.strictEqual(mia.geometry.getAttribute("instanceStart").data.array.length, 180 * 6);
  // el sombreador: con la línea de referencia de three, acerca; el estado lo dice
  const sh = { vertexShader: "uniform float linewidth;\n" + "\t" + "vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );" };
  mia.material.onBeforeCompile(sh); assert.match(sh.vertexShader, /uAcerca/); assert.strictEqual(e.api.estado().acerca, true);
  assert.strictEqual(mia.material.customProgramCacheKey(), otra.material.customProgramCacheKey(), "un solo programa para las dos");
  // ?debug
  const d = { lineas: [] }; e.emite("depura:lineas", d); assert.match(d.lineas[0], /^Lindes: 2 llamadas · 370 tramos · 2220 triángulos · paso 2\.0 m$/);
  assert.strictEqual(e.reg.consola.length, 0);
});

test("componente: el ancho se mide con el viewport del lienzo y, en VR, con el de cada ojo (y algo más ancho)", async () => {
  const e = entorno({ hazas: HAZAS }); await e.carga();
  const mia = e.reg.añadidos[0].children[0], r = { getViewport: v => v.set(0, 0, 1280, 720) };
  mia.onBeforeRender(r, null, {});
  assert.deepStrictEqual([mia.material.uniforms.resolution.value.x, mia.material.uniforms.resolution.value.y, mia.material.uniforms.linewidth.value], [1280, 720, 4]);
  mia.onBeforeRender(r, null, { viewport: { x: 1832, y: 0, z: 1832, w: 1920 } });
  assert.deepStrictEqual([mia.material.uniforms.resolution.value.x, mia.material.uniforms.resolution.value.y, mia.material.uniforms.linewidth.value], [1832, 1920, 4 * 1.5]);
});

test("componente: «hazas:cambia» rehace (y suelta lo anterior); relieve nuevo o exageración nueva repegan en el mismo búfer; libera() lo suelta todo", async () => {
  const hz = HAZAS.slice(), e = entorno({ hazas: hz }); await e.carga();
  const g0 = e.reg.añadidos[0], buf = g0.children[0].geometry.getAttribute("instanceStart").data, arr = buf.array;
  e.api.tarde(); assert.strictEqual(e.api.estado().repegadas, 0, "sin nada nuevo, no repega");
  assert.strictEqual(e.reg.cargas.length, 1, "Mundo.alCargar, una vez"); e.reg.cargas[0]();
  e.api.tarde(); assert.strictEqual(e.api.estado().repegadas, 1);
  assert.strictEqual(buf.array, arr, "mismo búfer"); assert.ok(buf.version >= 1, "marcado para subir a la GPU");
  e.pon("exag", 2); e.api.tarde();
  assert.strictEqual(e.api.estado().repegadas, 2); assert.ok(Math.abs(arr[1] - (10 + 0.2) * 2) < 1e-4, "a (suelo + alto) × exag");
  // llegan otras hazas: se suelta lo de antes (2 geometrías y 2 materiales) y se rehace con lo nuevo
  hz.pop(); e.emite("hazas:cambia", { n: 1, propias: 1 });
  assert.deepStrictEqual([e.reg.quitados[0], e.reg.dispose.length], [g0, 4]);
  assert.deepStrictEqual(e.reg.añadidos[1].children.map(o => o.name), ["lindes propias"], "solo la propia: 1 llamada");
  assert.strictEqual(e.api.estado().llamadas, 1);
  hz.length = 0; e.emite("hazas:cambia", { n: 0, propias: 0 });
  assert.strictEqual(e.reg.añadidos.length, 2, "sin hazas no se crea nada"); assert.strictEqual(e.reg.dispose.length, 6);
  hz.push(HAZAS[0], HAZAS[1]); e.emite("hazas:cambia", { n: 2, propias: 1 });
  e.api.libera();
  assert.strictEqual(e.reg.dispose.length, 10, "libera(): 2 geometrías y 2 materiales más"); assert.strictEqual(e.reg.quitados.length, 3, "los tres grupos que hubo, fuera");
  e.reg.cargas[0](); e.api.tarde(); assert.strictEqual(e.reg.añadidos.length, 3, "liberado, el aviso de relieve ya no hace nada");
  e.limpia.forEach(fn => fn()); assert.strictEqual(e.env.window.__lindes, undefined, "el gancho de las pruebas, fuera");
});

test("componente: si se libera antes de que lleguen las líneas, no crea nada al llegar", async () => {
  const e = entorno({ hazas: HAZAS }); e.api.libera(); await e.carga();
  assert.strictEqual(e.reg.añadidos.length, 0); assert.strictEqual(e.api.estado().lib, "pidiendo");
});
