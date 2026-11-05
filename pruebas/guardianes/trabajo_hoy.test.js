"use strict";
// Trabajo en vivo, paso estático (F4b/W1; apps/web/motor/54_trabajo_hoy.js, componente «trabajo-hoy» y su emisor en 53_mundo_hoy.js), en Node y sin navegador:
//  - 53 (MundoHoyPuro.trabajo): con el ejemplo sintético del contrato sale la parcela con tarea EN CURSO; sin lectura completa, sin tareas o sin forma, nada;
//    el resultado no lleva nada por persona (solo ids de parcela y un instante);
//  - lo puro (TrabajoHoyPuro): lee el payload por lista blanca, solo coloca las parcelas que el índice conoce (no inventa sitios), tractor de 72 triángulos sin
//    azar, ficha con el rótulo «deducido» y sin nombres ni cifras de personas;
//  - el componente con el three de verdad: APAGADO por defecto (?trabajo), 1 InstancedMesh en la haza correcta, nada sin datos ni errores, se recoloca al cambiar
//    la exageración, dentro del presupuesto declarado y libera() lo suelta todo (dispose) y quita la entidad.
// Cifras de DISEÑO (contadas en Node, no medidas con el renderizador). Lo de Chrome, iPhone y Quest: NO PROBADO.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { RAIZ, fs, lee } = require("./_util");

const trozo = (fuente, ini, fin) => { const i = fuente.indexOf(ini), f = fuente.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return fuente.slice(i, f); };
const F53 = lee("apps/web/motor/53_mundo_hoy.js"), F54 = lee("apps/web/motor/54_trabajo_hoy.js");
const MH = new Function("\"use strict\";\n" + trozo(F53, "// [puro:inicio]", "// [puro:fin]") + "\nreturn MundoHoyPuro;")();
const P = new Function("\"use strict\";\n" + trozo(F54, "// [puro:inicio]", "// [puro:fin]") + "\nreturn TrabajoHoyPuro;")();
const EJEMPLO = JSON.parse(lee("contratos/mundo-hoy-ejemplo.json"));
const copia = o => JSON.parse(JSON.stringify(o));
const PARCELAS = [{ id: "sintetica-1", nombre: "Parcela sintética", centro: [-58, -43] }, { id: "sintetica-2", nombre: "Otra", centro: [40, 20] }];

const DIR_THREE = path.join(RAIZ, "apps/web/node_modules/three");
const SIN_THREE = fs.existsSync(path.join(DIR_THREE, "build/three.module.js")) ? false : "sin apps/web/node_modules (npm ci en apps/web)";
let THREE;
test.before(async () => { if (!SIN_THREE) THREE = await import(pathToFileURL(path.join(DIR_THREE, "build/three.module.js")).href); });

// ---------- 53: de dónde sale el dato
test("53: con el ejemplo sintético, solo la parcela con tarea EN CURSO (la «hecha» no cuenta)", () => {
  const v = MH.valida(EJEMPLO), t = MH.trabajo(v);
  assert.deepStrictEqual(t, { parcelas: ["sintetica-1"], cuando: "2026-11-05T10:00:00.000Z" });
});

test("53: lectura incompleta, sin tareas en curso o sin forma: nada (no se inventa)", () => {
  const inc = copia(EJEMPLO); inc.trabajoSemana.completo = false; assert.strictEqual(MH.trabajo(MH.valida(inc)), null);
  const inc2 = copia(EJEMPLO); inc2.completo = false; assert.strictEqual(MH.trabajo(MH.valida(inc2)), null);
  const sin = copia(EJEMPLO); sin.trabajoSemana.porParcela.forEach(p => { p.enCurso = []; }); assert.strictEqual(MH.trabajo(MH.valida(sin)), null);
  const nul = copia(EJEMPLO); nul.trabajoSemana.porParcela[0].enCurso = [{ tipo: "recoleccion", n: null }]; assert.strictEqual(MH.trabajo(MH.valida(nul)), null);
  const nada = copia(EJEMPLO); nada.trabajoSemana = null; assert.strictEqual(MH.trabajo(MH.valida(nada)), null);
  assert.strictEqual(MH.trabajo(null), null);
});

test("53: lo que sale no lleva nada por persona (solo ids de parcela y un instante) aunque la entrada traiga más", () => {
  const e = copia(EJEMPLO); Object.assign(e.trabajoSemana.porParcela[0], { quien: "Fulano", trabajadores: 4, posicion: [1, 2] });
  const t = MH.trabajo(MH.valida(e));
  assert.deepStrictEqual(Object.keys(t).sort(), ["cuando", "parcelas"]);
  assert.ok(t.parcelas.every(x => typeof x === "string"));
  assert.ok(!/Fulano|trabajadores|posicion/.test(JSON.stringify(t)));
});

test("53: emite mundo:hoy con linea Y trabajo", () => {
  assert.match(F53, /n\.emite\("mundo:hoy", \{ linea: P\.tablon\(x\.datos\), trabajo: P\.trabajo\(x\.datos\) \}\)/);
});

// ---------- lo puro
test("puro: lee el payload por lista blanca (ids con la forma de OlivarTrack, sin repetidos, tope MAX)", () => {
  assert.strictEqual(P.lee(null), null); assert.strictEqual(P.lee({}), null); assert.strictEqual(P.lee({ trabajo: null }), null); assert.strictEqual(P.lee({ trabajo: { parcelas: "x" } }), null);
  assert.strictEqual(P.lee({ trabajo: { parcelas: [] } }), null);
  const r = P.lee({ trabajo: { parcelas: ["a-1", "a-1", "<b>", 5, "con espacio", "Ñandú:2"], cuando: "2026-11-05T10:00:00Z" } });
  assert.deepStrictEqual(r, { ids: ["a-1", "Ñandú:2"], cuando: "2026-11-05T10:00:00Z" });
  const muchas = P.lee({ trabajo: { parcelas: Array.from({ length: 40 }, (_, i) => "p" + i) } });
  assert.strictEqual(muchas.ids.length, P.MAX);
});

test("puro: solo coloca las parcelas que el índice conoce y con centro válido (no se inventa el sitio)", () => {
  const s = P.sitios(["sintetica-1", "desconocida", "sin-centro"], PARCELAS.concat([{ id: "sin-centro", nombre: "X" }]));
  assert.deepStrictEqual(s.map(x => [x.id, x.nombre, x.x, x.y]), [["sintetica-1", "Parcela sintética", -58, -43]]);
  assert.strictEqual(P.giro("sintetica-1"), P.giro("sintetica-1"), "sin azar: el mismo giro siempre");
  assert.deepStrictEqual(P.sitios(["a"], []), []); assert.deepStrictEqual(P.sitios(null, null), []);
});

test("puro: el tractor son 72 triángulos bien formados; el coste es de diseño (1 llamada, 72 por tractor)", () => {
  const g = P.geometria();
  assert.strictEqual(g.triangulos, 72); assert.strictEqual(g.posicion.length, 72 * 9); assert.strictEqual(g.normal.length, g.posicion.length); assert.strictEqual(g.color.length, g.posicion.length);
  assert.ok(Array.from(g.posicion).every(Number.isFinite));
  // cada triángulo mira hacia donde dice su normal (sentido antihorario visto desde fuera)
  for (let t = 0; t < 72; t++) {
    const o = t * 9, a = [0, 1, 2].map(k => g.posicion[o + k]), b = [0, 1, 2].map(k => g.posicion[o + 3 + k]), c = [0, 1, 2].map(k => g.posicion[o + 6 + k]);
    const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]), x = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const d = x[0] * g.normal[o] + x[1] * g.normal[o + 1] + x[2] * g.normal[o + 2]; assert.ok(d > 0, "triángulo " + t + " del revés");
  }
  assert.deepStrictEqual(P.coste(0), { llamadas: 0, triangulos: 0 }); assert.deepStrictEqual(P.coste(3), { llamadas: 1, triangulos: 216 });
  assert.strictEqual(P.coste(P.MAX).triangulos, 1152);
});

test("puro: la ficha lleva el rótulo «deducido», dice lo que no se sabe y no trae nada por persona", () => {
  const f = P.ficha(P.sitios(["sintetica-1"], PARCELAS)[0], "2026-11-05T10:00:00.000Z");
  assert.match(f.destacado, /^Deducido: hoy hay una tarea en curso/); assert.match(f.titulo, /Parcela sintética/);
  const todo = [f.titulo, f.destacado, f.pie].concat(f.lineas).join(" | ");
  assert.match(todo, /No dice quién, cuántas personas ni dónde están/); assert.match(todo, /ilustrativo/); assert.match(f.pie, /leído el 05\/11 · deducido/);
  assert.ok(!/<|\d+ (personas|trabajadores|operarios)/.test(todo));
  // cada línea es corta: el panel común de VR la envuelve sin desbordar
  [f.destacado].concat(f.lineas).forEach(l => assert.ok(l.length <= 130, l));
});

// ---------- el componente
function mundo(opts) {
  const o = opts || {}, scene = new THREE.Scene(), entidades = [], quitadas = [];
  const E = { exag: 1 };
  const g = { THREE, scene, console, Math, JSON, window: {}, D: { parcelas: o.parcelas || PARCELAS },
    suelo: (x, y) => 10, Componentes: { registra: d => { g.def = d; return true; } },
    Entidades: { registra: d => { entidades.push(d); return () => quitadas.push(d.tipo); } } };
  Object.defineProperty(g, "exag", { get: () => E.exag, enumerable: true });
  const ctx = vm.createContext(g);
  vm.runInContext("\"use strict\";\n" + F54, ctx, { filename: "54_trabajo_hoy.js" });
  const escuchas = {};
  const n = { on: (ev, fn) => { (escuchas[ev] = escuchas[ev] || []).push(fn); return fn; }, limpia: fn => fn };
  const emite = d => (escuchas["mundo:hoy"] || []).forEach(f => f(d));
  return { g, d: g.def, n, scene, E, entidades, quitadas, emite };
}
function dibujo(raiz) {
  let llamadas = 0, tri = 0;
  (function anda(o) { if (o.visible === false) return; if (o.isMesh) { llamadas++; const gm = o.geometry; tri += gm.attributes.position.count / 3 * (o.isInstancedMesh ? o.count : 1); } o.children.forEach(anda); })(raiz);
  return { llamadas, triangulos: tri };
}
const CON = { linea: null, trabajo: { parcelas: ["sintetica-1"], cuando: "2026-11-05T10:00:00.000Z" } };
const posDe = (im, i) => { const k = new THREE.Matrix4(); im.getMatrixAt(i, k); return new THREE.Vector3().setFromMatrixPosition(k); };

test("componente: manifiesto APAGADO por defecto, con bandera ?trabajo, escucha mundo:hoy, presupuesto declarado", { skip: SIN_THREE }, () => {
  const m = mundo(), d = m.d;
  assert.strictEqual(d.id, "trabajo-hoy"); assert.deepStrictEqual({ ...d.bandera }, { defecto: false, url: "trabajo" });
  assert.deepStrictEqual({ ...d.presupuesto }, { llamadas: 1, triangulos: 1152 }); assert.deepStrictEqual([...d.eventos.escucha], ["mundo:hoy"]); assert.deepStrictEqual([...d.eventos.emite], []);
});

test("componente: sin datos no sale nada y no hay errores; con datos, un tractor en la haza correcta", { skip: SIN_THREE }, () => {
  const m = mundo(), api = m.d.monta(m.n);
  assert.strictEqual(m.scene.children.length, 0, "al montar no hay nada");
  m.emite({ linea: null, trabajo: null }); m.emite({}); m.emite(null); api.tarde();
  assert.strictEqual(m.scene.children.length, 0, "sin datos, nada"); assert.strictEqual(api.estado().tractores, 0);
  m.emite({ trabajo: { parcelas: ["no-existe"] } }); assert.strictEqual(m.scene.children.length, 0, "parcela desconocida: no se pinta");
  m.emite(CON);
  assert.strictEqual(m.scene.children.length, 1); const im = m.scene.children[0];
  assert.ok(im.isInstancedMesh); assert.strictEqual(im.count, 1);
  const pos = posDe(im, 0);
  assert.deepStrictEqual([pos.x, pos.y, pos.z], [-58, 10, 43], "en el centro de la haza sintetica-1 (este, suelo, -norte)");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(api.estado())), { tractores: 1, llamadas: 1, triangulos: 72, ids: ["sintetica-1"] });
  const c = dibujo(m.scene), p = m.d.presupuesto; assert.ok(c.llamadas <= p.llamadas && c.triangulos <= p.triangulos, JSON.stringify(c));
  m.emite({ linea: null, trabajo: null }); assert.deepStrictEqual(dibujo(m.scene), { llamadas: 0, triangulos: 0 });
  m.d.libera(api);
});

test("componente: la entidad «trabajo» tiene ficha con «deducido», cercanía y posición; solo existe la de la haza con tarea", { skip: SIN_THREE }, () => {
  const m = mundo(), api = m.d.monta(m.n), e = m.entidades[0];
  assert.strictEqual(e.tipo, "trabajo"); assert.strictEqual(e.dueno, "54_trabajo_hoy"); assert.ok(e.prioridad < 20, "la baliza de la parcela gana");
  assert.strictEqual(e.cerca(0, 0), null, "sin tractores no hay cercanía"); assert.strictEqual(e.existe("trabajo:sintetica-1"), false);
  m.emite(CON);
  assert.strictEqual(e.existe("trabajo:sintetica-1"), true); assert.strictEqual(e.existe("trabajo:sintetica-2"), false);
  const c = e.cerca(-50, -40); assert.strictEqual(c.id, "trabajo:sintetica-1"); assert.ok(c.d < e.radioCerca);
  const f = e.ficha("trabajo:sintetica-1", "pantalla"); assert.match(f.destacado, /^Deducido/); assert.strictEqual(e.ficha("trabajo:otra"), null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(e.lista())), [{ id: "trabajo:sintetica-1" }]); assert.deepStrictEqual(JSON.parse(JSON.stringify(e.pos("trabajo:sintetica-1"))), { x: -58, y: 10, z: 43 });
  m.d.libera(api);
});

test("componente: se vuelve a posar al cambiar la exageración vertical (fase tarde)", { skip: SIN_THREE }, () => {
  const m = mundo(), api = m.d.monta(m.n); m.emite(CON);
  assert.strictEqual(posDe(m.scene.children[0], 0).y, 10); m.E.exag = 2; api.tarde(); assert.strictEqual(posDe(m.scene.children[0], 0).y, 20);
  m.d.libera(api);
});

test("componente: libera() suelta malla, geometría, material y entidad, y deja la escena como estaba", { skip: SIN_THREE }, () => {
  const m = mundo(), api = m.d.monta(m.n); m.emite(CON);
  const im = m.scene.children[0], vistos = [];
  [im.geometry, im.material, im].forEach(o => { const d = o.dispose.bind(o); o.dispose = () => { vistos.push(o); d(); }; });
  m.d.libera(api);
  assert.strictEqual(m.scene.children.length, 0); assert.strictEqual(vistos.length, 3, "dispose() de la malla, su geometría y su material");
  assert.deepStrictEqual(m.quitadas, ["trabajo"]);
  m.emite(CON); assert.strictEqual(m.scene.children.length, 0, "liberado, ya no escucha ni pinta");
});

// ---------- higiene
test("higiene: sin fetch, sin HTML, sin personas; el evento está en el catálogo", () => {
  const codigo = F54.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  assert.ok(!/fetch\(|innerHTML|eval\(|new Function|XMLHttpRequest|document\./.test(codigo));
  const ev = JSON.parse(lee("contratos/eventos.json")).eventos["mundo:hoy"];
  assert.ok(ev.escuchan.includes("54_trabajo_hoy") && ev.emiten.includes("53_mundo_hoy"));
  assert.ok(ev.datos.properties.trabajo, "el payload documenta «trabajo»");
});
