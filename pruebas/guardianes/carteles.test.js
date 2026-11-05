"use strict";
// EV2-A6 (apps/web/motor/44b_carteles.js): carteles de haza en la linde y tablón en la entrada.
// En Node y sin navegador: la parte pura (los 3 más cercanos con histéresis, qué texto lleva cada cartel según la lista blanca, la maqueta del lienzo, los topes
// angulares de EV2-A0 en VR) y, con un THREE, un lienzo y unas hazas de mentira, el pool (3 + 1 mallas, creadas una vez, liberadas enteras) y que no se repinta
// sin cambio. Lo que NO dice: nada de legibilidad, nitidez ni comodidad en un casco ni en un móvil (no probado en unas Quest ni en un iPhone).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/44b_carteles.js");
function trozo(ini, fin) { const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return FUENTE.slice(i, f); }
const PURO = trozo("// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo("// [motor:inicio]", "// [motor:fin]");
const P = new Function("\"use strict\";\n" + PURO + "\nreturn CartelesPuro;")();
const LP = new Function("\"use strict\";\n" + (function () { const f = lee("apps/web/motor/02d_laminas.js"); return f.slice(f.indexOf("// [puro:inicio]"), f.indexOf("// [puro:fin]")); })() + "\nreturn LaminasPuro;")();
const medir = (t, px, neg) => String(t).length * px * (neg ? 0.6 : 0.55);

// una ficha pública COMPLETA con todo lo que la api puede mandar (y algo que no debería): ninguna de las cosas prohibidas puede acabar en un cartel
const PROHIBIDO = ["TITULAR-SECRETO", "KILOS-SECRETOS", "PERSONA-SECRETA", "GPS-SECRETO", "NOTA-LIBRE", "TRATAMIENTO-SECRETO", "AVANCE-SECRETO", "OT-SECRETO"];
const ficha = (extra) => Object.assign({
  id: 7, codigo: "H-07", nombre: "La Loma", finca: "hituelo", es_mia: false, alias: "Casa Olmo", superficie_ha: 3.4217,
  olivos: { lidar: { n: 1234, fuente: "LiDAR PNOA 2024", naturaleza: "medido" }, declarado: { n: 1300, fuente: "declaración PAC", naturaleza: "declarado" } },
  tratamientos: [{ fecha: "2026-10-01", componentes: [{ tipo: "fitosanitario", producto: "TRATAMIENTO-SECRETO" }], plazo_seguridad_dias: 7 }],
  fenologia: [{ fecha: "2026-10-01", bbch: 85 }], analiticas: [{ fecha: "2026-09-01", tipo: "suelo" }], avance: { pct: 40, fecha: "2026-10-30", parcelas: 3, parcelas_con_dato: 2, nota: "AVANCE-SECRETO" },
  ndvi_relativo: { valor: 0.12, fuente: "Sentinel-2", fecha: "2026-10-20" }, datos_de: "2026-11-01T10:00:00Z", completo: true, avisos: [],
  titular: "TITULAR-SECRETO", kilos: "KILOS-SECRETOS", persona: "PERSONA-SECRETA", gps: "GPS-SECRETO", texto_libre: "NOTA-LIBRE", ot: "OT-SECRETO" }, extra || {});
const textos = (c) => [c.titulo, c.alias].concat(c.datos.map(d => d.txt + " " + d.de)).join(" | ");

test("escoge: los 3 más cercanos, dentro del radio; el que ya estaba conserva su cartel", () => {
  const cand = [{ id: 1, d: 30 }, { id: 2, d: 10 }, { id: 3, d: 20 }, { id: 4, d: 5 }, { id: 5, d: 90 }];
  const a = P.escoge(cand, [null, null, null]);
  assert.deepStrictEqual(a.slice().sort(), [2, 3, 4], "los tres más cercanos (el 1 a 30 m queda fuera; el 5 está fuera del radio)");
  assert.strictEqual(a.length, P.MAX);
  const b = P.escoge([{ id: 2, d: 10 }, { id: 4, d: 5 }, { id: 9, d: 8 }], [2, null, 4]);
  assert.deepStrictEqual(b, [2, 9, 4]);
  assert.deepStrictEqual(P.escoge([], [1, 2, 3]), [null, null, null]);
  assert.deepStrictEqual(P.escoge([{ id: 1, d: P.RADIO + 1 }], [null, null, null]), [null, null, null], "fuera del radio no se enseña");
});

test("escoge: histéresis, no parpadea si otra haza empata por poco y cede si la supera por más del 20 %", () => {
  const act = [10, 11, 12];
  assert.deepStrictEqual(P.escoge([{ id: 10, d: 5 }, { id: 11, d: 6 }, { id: 12, d: 30 }, { id: 13, d: 28 }], act), [10, 11, 12]);
  assert.deepStrictEqual(P.escoge([{ id: 10, d: 5 }, { id: 11, d: 6 }, { id: 12, d: 30 }, { id: 13, d: 20 }], act), [10, 11, 13]);
  assert.deepStrictEqual(P.escoge([{ id: 10, d: 35 }], [10, null, null]), [10, null, null]);
  assert.deepStrictEqual(P.escoge([{ id: 10, d: 35 }], [null, null, null]), [null, null, null]);
  const x = P.escoge([{ id: 10, d: 5 }, { id: 11, d: 6 }, { id: 12, d: 7 }], [12, 10, 11]);
  assert.deepStrictEqual(x, [12, 10, 11]); assert.deepStrictEqual(P.escoge([{ id: 10, d: 5 }, { id: 11, d: 6 }, { id: 12, d: 7 }], x), x);
  const cien = []; for (let i = 0; i < 100; i++) cien.push({ id: i, d: 1 + i / 10 });
  assert.strictEqual(P.escoge(cien, [null, null, null]).filter(v => v !== null).length, 3);
});

test("la linde más cercana: el punto sobre el lado y la caja que descarta lo lejano", () => {
  const an = [[[0, 0], [100, 0], [100, 80], [0, 80], [0, 0]]];
  const q = P.masCerca(an, 50, -30); assert.ok(Math.abs(q.d - 30) < 1e-9 && q.x === 50 && q.y === 0, JSON.stringify(q));
  const dentro = P.masCerca(an, 90, 40); assert.ok(Math.abs(dentro.d - 10) < 1e-9 && dentro.x === 100, JSON.stringify(dentro));
  const esq = P.masCerca(an, -3, -4); assert.ok(Math.abs(esq.d - 5) < 1e-9 && esq.x === 0 && esq.y === 0);
  const c = P.caja(an); assert.deepStrictEqual(c, [0, 0, 100, 80]);
  assert.ok(P.lejosDeCaja(c, 300, 0, 45) && !P.lejosDeCaja(c, 130, 0, 45));
});

test("contenido: solo nombre, alias público y datos MEDIDOS de la lista blanca, cada dato con su procedencia", () => {
  const c = P.contenido({ nombre: "La Loma", es_mia: false }, ficha());
  assert.strictEqual(c.titulo, "La Loma");
  assert.strictEqual(c.alias, "Hogar visible como «Casa Olmo»");
  assert.strictEqual(c.datos.length, 2);
  assert.ok(/^Superficie: 3,42 ha$/.test(c.datos[0].txt) && /^Olivos contados: 1\.?234$/.test(c.datos[1].txt), JSON.stringify(c.datos));
  assert.ok(/medida/.test(c.datos[0].de) && /medido · LiDAR PNOA 2024/.test(c.datos[1].de), JSON.stringify(c.datos));
  c.datos.forEach(d => assert.ok(d.de.length > 3, "todo dato lleva procedencia"));
  assert.strictEqual(P.contenido({ nombre: "La Loma", es_mia: true }, ficha()).alias, "");
  assert.deepStrictEqual(P.contenido({ nombre: "La Loma", es_mia: true }, null).datos, []);
  assert.strictEqual(P.contenido({ nombre: "La Loma" }, ficha({ olivos: { lidar: { n: 5, fuente: "x", naturaleza: "declarado" }, declarado: { n: 9, fuente: "y", naturaleza: "declarado" } } })).datos.length, 1, "un conteo que no es «medido» no entra");
  assert.strictEqual(P.contenido({ nombre: "La Loma" }, ficha({ alias: null })).alias, "");
  assert.strictEqual(P.contenido({}, null).titulo, "Haza");
});

test("guardián: nada fuera de la lista blanca llega a un cartel, venga lo que venga de la api", () => {
  [ficha(), ficha({ es_mia: true })].forEach(f => {
    [true, false].forEach(mia => {
      const c = P.contenido({ nombre: "La Loma", es_mia: mia }, f), todo = textos(c) + P.firma(c) + JSON.stringify(P.maqueta(c, medir).bloques);
      PROHIBIDO.forEach(p => assert.ok(todo.indexOf(p) < 0, "no debe salir " + p));
      ["tratamiento", "fenolog", "analítica", "Recogido", "NDVI", "kilos", "titular", "declar", "BBCH"].forEach(p => assert.ok(!new RegExp(p, "i").test(todo), "no debe salir «" + p + "»"));
    });
  });
  const leidas = new Set(), prox = new Proxy(ficha(), { get(o, k) { leidas.add(String(k)); return o[k]; } });
  P.contenido({ nombre: "N", es_mia: false }, prox);
  assert.deepStrictEqual([...leidas].sort(), ["alias", "olivos", "superficie_ha"].sort());
  const ol = new Set(), prox2 = new Proxy(ficha().olivos.lidar, { get(o, k) { ol.add(String(k)); return o[k]; } });
  P.contenido({ nombre: "N" }, { olivos: { lidar: prox2 }, superficie_ha: 1 });
  assert.deepStrictEqual([...ol].sort(), ["fuente", "n", "naturaleza"]);
  assert.ok(!/<script|innerHTML/.test(MOTOR + PURO.replace(/\/\/.*$/gm, "")), "ni HTML ni innerHTML en el motor ni en lo puro");
  assert.ok(!/fetch\(/.test(FUENTE), "el cartel no habla con la red: usa Hazas.datos");
  assert.strictEqual(P.contenido({ nombre: "A\u0000B\n<b>C" }, null).titulo, "A B <b>C");
});

test("el tablón: nombre de la finca y bienvenida neutra, sin datos de nadie", () => {
  assert.strictEqual(P.nombreFinca(undefined, "hituelo"), "Hituelo"); assert.strictEqual(P.nombreFinca("Mi finca", "hituelo"), "Mi finca"); assert.strictEqual(P.nombreFinca(null, null), "La finca");
  assert.strictEqual(P.nombreFinca(null, "cerro_velasco"), "Cerro velasco");
  const t = P.tablon("Hituelo"), m = P.maqueta(t, medir), todo = textos(t);
  assert.ok(/Bienvenida/.test(todo) && /medido, deducido o ilustrativo/.test(todo)); assert.ok(!/deslinde/.test(m.bloques.map(b => b.texto).join(" ")), "sin el pie de las lindes");
  assert.deepStrictEqual(P.entrada([{ centro: [100, 200] }], [0, 0, 1, 1]), [105, 198]);
  assert.deepStrictEqual(P.entrada([], [0, 100, 200, 0]), [100, 50]);
});

test("maqueta: cabe en 512 × 320, cada dato va con su procedencia y todo interlineado pasa los topes de EV2-A0 hasta la distancia máxima", () => {
  assert.ok(P.W <= 512 && P.H <= 320, "lienzo ≤ 512 × 320");
  const casos = [P.contenido({ nombre: "La Loma", es_mia: false }, ficha()), P.contenido({ nombre: "Un nombre larguísimo de una haza que no cabe en una línea y que sigue y sigue y sigue", es_mia: true }, ficha()),
    P.contenido({ nombre: "Sola" }, null), P.tablon("Hituelo"), P.contenido({ nombre: "Tres líneas de nombre " + "x".repeat(200) }, ficha())];
  casos.forEach(c => {
    const m = P.maqueta(c, medir);
    assert.ok(m.usado <= P.H, "alto usado " + m.usado);
    m.bloques.forEach(b => { assert.ok(b.y + P.LINEA[b.clase] <= P.H + 1e-9, "dentro del lienzo: " + b.texto); assert.ok(b.x + medir(b.texto, b.px, b.negrita) <= P.W + 1e-9 || b.texto.split(" ").length === 1, "cabe a lo ancho: " + b.texto); });
    const d = m.bloques.filter(b => b.clase === "dato").length, f = m.bloques.filter(b => b.clase === "fuente" && !/^linde de gestión/.test(b.texto)).length;
    assert.strictEqual(f, d, "tantas procedencias como datos");
    const mmPx = P.ANCHO_M * 1000 / P.W;
    [P.RADIO * (1 + P.HIST), P.LEJOS_TABLON, 3, 10, 25].forEach(dist => {
      const e = P.escala(dist), r = LP.legible({ mmPorPx: mmPx * e, dist: Math.max(dist, 0.5), lineas: m.interlineados });
      assert.deepStrictEqual(r.fallos, [], "a " + dist + " m: " + r.fallos.join("; "));
    });
  });
  assert.ok(P.maqueta(P.contenido({ nombre: "Sola" }, null), medir).bloques.every(b => b.clase === "titulo" || b.clase === "fuente"));
});

test("escala y colocación: crece con la distancia, entre 1 y 5,5; el cartel queda a 0,9 m del suelo y se vuelve hacia quien mira", () => {
  assert.strictEqual(P.escala(2), 1); assert.ok(Math.abs(P.escala(20) - 2.8) < 1e-9); assert.strictEqual(P.escala(500), 5.5);
  const c = P.coloca(10, 20, 100, 2); assert.ok(Math.abs(c.y - (100 + 0.9 + P.ALTO_M)) < 1e-9 && c.x === 10 && c.z === -20);
  assert.ok(Math.abs(P.mirando(0, 10, 0, 0)) < 1e-9, "con quien mira al sur (+z) el cartel no gira"); assert.ok(Math.abs(P.mirando(10, 0, 0, 0) - Math.PI / 2) < 1e-9);
});

test("presupuesto: 3 carteles + 1 tablón = 4 llamadas, 8 triángulos, y el manifiesto lo declara así", () => {
  assert.strictEqual(P.LLAMADAS, 4); assert.strictEqual(P.MAX, 3);
  assert.ok(/presupuesto: \{ llamadas: 4, triangulos: 8, texturasMB: 2\.5 \}/.test(FUENTE));
  assert.ok(/bandera: \{ defecto: true, url: "carteles" \}/.test(FUENTE), "?carteles=0 lo apaga");
  assert.ok(4 * 512 * 320 * 4 / 1048576 <= 2.5);
});

// ---- el motor, con un THREE, un lienzo y unas hazas de mentira
function mundo(opts) {
  const log = { geos: 0, mats: 0, texs: 0, mallas: [], disposed: { geo: 0, mat: 0, tex: 0 }, canvases: 0, pedidas: [] };
  class Obj { constructor() { this.visible = true; this.children = []; this.position = { set() {} }; this.scale = { setScalar() {} }; this.rotation = { y: 0 }; } add(o) { this.children.push(o); } remove(o) { this.children = this.children.filter(c => c !== o); } }
  const cam = { x: opts.x || 0, y: opts.y || 0 };
  const THREE = {
    Group: class extends Obj {}, Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; log.mallas.push(this); } },
    PlaneGeometry: class { constructor() { log.geos++; } dispose() { log.disposed.geo++; } },
    MeshBasicMaterial: class { constructor(o) { log.mats++; this.map = o.map; } dispose() { log.disposed.mat++; } },
    CanvasTexture: class { constructor(c) { log.texs++; this.image = c; } dispose() { log.disposed.tex++; } },
    Vector3: class { constructor() { this.x = 0; this.y = 0; this.z = 0; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } setFromMatrixPosition() { this.x = cam.x; this.y = 0; this.z = -cam.y; return this; } }
  };
  const document = { createElement() { log.canvases++; return { width: 0, height: 0, getContext() { return { clearRect() {}, fillRect() {}, fillText() {}, measureText(t) { return { width: t.length * 10 }; }, font: "", fillStyle: "" }; } }; } };
  const hazas = opts.hazas;
  const Hazas = {
    lindes: () => hazas.map(h => ({ id: h.id, anillos: h.anillos })),
    datos: (id) => { log.pedidas.push(id); const h = hazas.find(q => q.id === id); return h ? { id, codigo: "c", nombre: h.nombre, es_mia: false, ficha: h.ficha || null } : null; }
  };
  const scene = new THREE.Group(), escuchas = {};
  const n = { on: (ev, fn) => { escuchas[ev] = fn; return () => {}; }, limpia: () => {} };
  const camera = { updateMatrixWorld() {}, matrixWorld: {} }, win = {};
  const f = new Function("THREE", "document", "window", "scene", "camera", "VRX", "texColor", "gLinde", "suelo", "exag", "Hazas", "D", "Componentes",
    "var CartelesPuro = null;\n" + "return function (P) { CartelesPuro = P; " + MOTOR + "\nreturn CartelesMotor; };");
  const D = { parcelas: [{ centro: [0, 0] }], ext: [-500, 500, 500, -500], finca_id: "hituelo" };
  const motor = f(THREE, document, win, scene, camera, { on: false }, t => t, { visible: true }, () => 2, 1, Hazas, D, {})(P)(n);
  return { motor, log, scene, escuchas, win, mueve(x, y) { cam.x = x; cam.y = y; } };
}
const cuadro = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const haza = (id, x0, y0, x1, y1, f) => ({ id, nombre: "Haza " + id, anillos: [cuadro(x0, y0, x1, y1)], ficha: f || null });

test("motor: sin hazas no crea nada; con hazas, un pool de 3 + 1 mallas creadas una vez, y se libera entero", () => {
  const w0 = mundo({ hazas: [] });
  assert.strictEqual(w0.log.mallas.length, 0); assert.strictEqual(w0.log.geos, 0); w0.motor.tarde(); w0.motor.mundo(); w0.motor.libera();
  const hs = [haza(1, 10, 0, 20, 10), haza(2, -20, 0, -10, 10), haza(3, 0, 20, 10, 30), haza(4, 0, 40, 10, 50, ficha()), haza(5, 300, 300, 310, 310)];
  const w = mundo({ hazas: hs });
  assert.strictEqual(w.log.mallas.length, 4, "3 carteles + el tablón"); assert.strictEqual(w.log.geos, 1); assert.strictEqual(w.log.mats, 4); assert.strictEqual(w.log.texs, 4); assert.strictEqual(w.log.canvases, 4);
  for (let i = 0; i < 20; i++) { w.motor.tarde(); w.motor.mundo(); }
  assert.strictEqual(w.log.mallas.length, 4, "no se crea nada más al elegir ni al repintar"); assert.strictEqual(w.log.mats, 4); assert.strictEqual(w.log.texs, 4);
  const est = w.motor.estado();
  assert.strictEqual(est.carteles, 3, "como mucho 3 a la vista"); assert.strictEqual(w.log.mallas.filter(m => m.visible).length, 3 + 1, "3 carteles y el tablón (la finca está cerca)");
  assert.strictEqual(est.llamadas, 4);
  assert.deepStrictEqual(w.win.__carteles().ids.slice().sort(), [1, 2, 3], "la 4 está a 40 m, pero hay tres más cerca; la 5, fuera");
  w.motor.libera();
  assert.deepStrictEqual(w.log.disposed, { geo: 1, mat: 4, tex: 4 }, "se libera todo");
  assert.strictEqual(w.scene.children.length, 0, "y se quita de la escena"); w.motor.libera();
});

test("motor: repinta solo cuando cambia la haza o su ficha; al llegar la ficha, un repintado", () => {
  const hs = [haza(1, 10, 0, 20, 10)];
  const w = mundo({ hazas: hs });
  w.motor.tarde(); const p0 = w.motor.estado().pintadas;
  assert.strictEqual(p0, 2, "el tablón y la haza 1");
  for (let i = 0; i < 10; i++) { w.motor.tarde(); w.motor.mundo(); }
  assert.strictEqual(w.motor.estado().pintadas, p0, "sin cambios, no repinta");
  hs[0].ficha = ficha(); w.motor.tarde();
  assert.strictEqual(w.motor.estado().pintadas, p0 + 1, "al llegar la ficha, una vez");
  w.motor.tarde(); assert.strictEqual(w.motor.estado().pintadas, p0 + 1);
  hs.push(haza(2, 200, 0, 210, 10)); w.escuchas["hazas:cambia"](); w.mueve(205, 5); w.motor.tarde();
  assert.strictEqual(w.log.mats, 4); assert.deepStrictEqual(w.win.__carteles().ids.filter(v => v !== null), [2]);
  hs.length = 0; w.escuchas["hazas:cambia"](); assert.deepStrictEqual(w.log.disposed, { geo: 1, mat: 4, tex: 4 }); w.motor.tarde(); w.motor.mundo();
  w.motor.libera();
});

test("manifiesto: componente «carteles-haza», con bandera y material básico (multiview)", () => {
  assert.ok(/id: "carteles-haza"/.test(FUENTE)); assert.ok(/fases: \{ mundo: 0, tarde: 0\.5 \}/.test(FUENTE));
  assert.ok(/libera: function \(api\)/.test(FUENTE));
  assert.ok(/MeshBasicMaterial/.test(MOTOR) && !/ShaderMaterial|onBeforeCompile|uniform |modelViewMatrix|projectionMatrix/.test(FUENTE.replace(/\/\/.*$/gm, "")), "multiview: material básico, sin GLSL propio");
});
