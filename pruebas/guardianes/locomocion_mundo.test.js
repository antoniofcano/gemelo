"use strict";
// Guardián de la locomoción por el mundo activo (MU2-4, MUNDOS §2-§3). Los cinco módulos que mueven a quien mira (12_paseo, 12b_llegada, 12c_ir_a, 16_vida y
// 29_vr) preguntan al gestor de mundos (`gm.suelo`, `gm.dentro`, `gm.obstaculo`, de 90_final.js) y no al exterior a mano. Con el montaje (los módulos en orden,
// concatenados como genera_motor.mjs) analizado con acorn, comprueba en esos cinco:
//   1. nadie llama a `suelo(` salvo las llamadas de PERMITIDAS.suelo, cada una con su motivo (dibujar, la vida ambiental, una prueba): las de moverse van por gm.suelo;
//   2. nadie lee `D.ext` (ni para recortar ni para nada: la caja es gm.dentro, y el recorte al borde, gm.obstaculo);
//   3. nadie nombra `copas` salvo PERMITIDAS.copas, ni llama a `fueraDeTroncos`: los troncos son gm.obstaculo;
//   4. LlegadaPuro.rayoSuelo, IrAPuro.planifica e IrAPuro.ir reciben gm.dentro como caja, y el `alto` de 12b_llegada es gm.suelo·exag;
//   5. 90_final.js da al exterior su caja y su censo (creaExterior({ ext: D.ext, copas: copas, … })).
// Las listas son explícitas: una llamada nueva a `suelo(` en estos módulos falla aunque sea para dibujar; se añade aquí con su motivo, o va por gm.suelo.
// HONESTIDAD: mira el código, no el comportamiento. Que andar, el dron, la llegada, «ir a» y la VR hagan lo mismo lo prueban, en Node, las pruebas de Vitest
// del exterior (apps/web/src/mundos/exterior.test.ts) y de la locomoción (apps/web/src/nucleo/locomocion.test.ts); en el navegador, llegada/ir_a/vr por el banco.
// Solo Node.
const test = require("node:test"), assert = require("node:assert");
const acorn = require("acorn");
const { ficheros, lee } = require("./_util"), { fuenteMotor } = require("./_fuente");
const { pasoArranque, nombresPasos } = require("./_pasos");   // A3-8c: los pasos de apps/web/src/arranque.ts (antes, los ficheros de apps/web/motor/)

const MODULOS = ["12_paseo.js", "12b_llegada.js", "12c_ir_a.js", "16_vida.js", "29_vr.js"];
// A3-6c (MU5-n): los que viven en mundos/comun/ (29_vr, 12c_ir_a…) se analizan con su talón y el JavaScript que sale de sus .ts (_fuente.js: sin tipos), sin sus import
const { TS_DE, COMO_JS } = require("./_fuente");
const enComun = m => [].concat(TS_DE[m] || []).some(f => COMO_JS.test(f));   // los de A3-6c, que _fuente.js lee como JavaScript
const textoDe = nombre => enComun(nombre) ? fuenteMotor(nombre).replace(/^import .*$/gm, "") : pasoArranque(nombre);
const ACORN = MODULOS;
// Lo que se queda en el legado a propósito. `en`: la función que lo contiene (el nombre de su declaración, de su variable o de lo que se le asigna);
// `codigo`: el texto exacto de la llamada o del nombre. Si cambia el texto, falla: se revisa si sigue siendo legítimo.
const PERMITIDAS = {
  suelo: [
    { f: "12c_ir_a.js", en: "pintaLinea", codigo: "suelo(v[i].x, v[i].y)", motivo: "dibuja la línea de puntos del camino (no mueve a nadie)" },
    { f: "29_vr.js", en: "vrActualiza", codigo: "suelo(VRX.tp.x, -VRX.tp.z)", motivo: "coloca la marca del arco del teletransporte (dibujo; el punto de caída lo calcula vrArco con gm.suelo y gm.dentro)" },
    { f: "29_vr.js", en: "window.__vrOlivo", codigo: "suelo(b.x, b.y)", motivo: "ayuda de las pruebas de VR: el olivo más cercano a la cabeza" },
  ],
  copas: [
    { f: "12c_ir_a.js", en: "toca", codigo: "copas", n: 2, motivo: "el rodeo (IrAPuro.planifica y su replanificación en IrAPuro.ir) cruza un segmento con cada tronco, que un obstaculo(x, y, radio) de un punto no responde" },
    { f: "12c_ir_a.js", en: "copas", codigo: "copas", n: 1, motivo: "A3-6c: el talón da el censo a ir-a.ts por función (02_mundo lo declara; nadie lo reescribe, pero así se lee al usarlo)" },
    { f: "12c_ir_a.js", en: "creaIrA", codigo: "copas", n: 1, motivo: "A3-6c: el alias de esa función dentro de creaIrA (el rodeo la llama, arriba)" },
    { f: "29_vr.js", en: "window.__vrOlivo", codigo: "copas", n: 1, motivo: "ayuda de las pruebas de VR: el olivo más cercano a la cabeza" },
    { f: "29_vr.js", en: "copas", codigo: "copas", n: 1, motivo: "A3-6c: el talón da el censo a la VR por función, solo para window.__vrOlivo" },
    { f: "29_vr.js", en: "creaVrSesion", codigo: "copas", n: 1, motivo: "A3-6c: el alias de esa función en vr-sesion.ts, para window.__vrOlivo" },
  ],
};

const esFuncion = n => n && /Function/.test(n.type);
function hijos(n) {
  const r = [];
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => x && typeof x.type === "string" && r.push([k, x])); else if (v && typeof v.type === "string") r.push([k, v]); }
  return r;
}

/** Analiza el montaje [{nombre, texto}] y devuelve, para los módulos dados, las llamadas a suelo(, las lecturas de D.ext, los nombres copas, las llamadas a
 *  fueraDeTroncos y las llamadas a LlegadaPuro/IrAPuro, cada una con su fichero, su función y su texto. */
function analiza(modulos, vigilados) {
  let todo = "", a = 0;
  const rangos = modulos.map(m => { const r = { nombre: m.nombre, a, b: a + m.texto.length }; a = r.b; todo += m.texto; return r; });
  const fichero = pos => { const r = rangos.find(x => pos >= x.a && pos < x.b); return r ? r.nombre : "?"; };
  const ast = acorn.parse(todo, { ecmaVersion: "latest", sourceType: "script" });
  const texto = n => todo.slice(n.start, n.end);
  const nombreFn = (fn, padre, clave) => {
    if (fn.id) return fn.id.name;
    if (padre && padre.type === "VariableDeclarator" && clave === "init" && padre.id.type === "Identifier") return padre.id.name;
    if (padre && padre.type === "AssignmentExpression" && clave === "right") return texto(padre.left);
    if (padre && padre.type === "Property" && clave === "value") return texto(padre.key);
    return "(anónima)";
  };
  const out = { suelo: [], ext: [], copas: [], fuera: [], puros: [] };
  (function visita(n, fn, padre, clave) {
    const f = fichero(n.start);
    let en = fn;
    if (esFuncion(n)) en = nombreFn(n, padre, clave);
    const reg = k => { if (vigilados.includes(f)) out[k].push({ f, en, codigo: texto(n), nodo: n }); };
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "suelo") reg("suelo");
    if (n.type === "MemberExpression" && !n.computed && n.object.type === "Identifier" && n.object.name === "D" && n.property.name === "ext") reg("ext");
    if (n.type === "Identifier" && n.name === "copas" && !(padre && padre.type === "MemberExpression" && clave === "property" && !padre.computed) && !(padre && padre.type === "Property" && clave === "key")) reg("copas");
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.property.name === "fueraDeTroncos") reg("fuera");
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.object.type === "Identifier" && /^(LlegadaPuro|IrAPuro)$/.test(n.callee.object.name)) reg("puros");
    for (const [k, h] of hijos(n)) visita(h, en, n, k);
  })(ast, "(módulo)", null, null);
  out.todo = todo;
  return out;
}

const MOTOR = nombresPasos();   // A3-8c: los pasos del arranque, dentro de una función como el cuerpo de arranca()
let cache = null;
const montaje = () => cache || (cache = analiza([{ nombre: "(abre)", texto: "(function () {\n" }].concat(MOTOR.map(f => ({ nombre: f, texto: textoDe(f) })), [{ nombre: "(cierra)", texto: "\n})();\n" }]), ACORN));
const clave = u => u.f + " · " + u.en + " · " + u.codigo;

test("los cinco módulos de locomoción son pasos del arranque", () => {
  const hay = MOTOR;
  for (const m of MODULOS) assert.ok(hay.includes(m), m + " no es un paso del arranque");
});

test("en la locomoción, solo las llamadas a suelo( de la lista (cada una con su motivo); las de moverse van por gm.suelo", t => {
  const A = montaje(), lista = new Set(PERMITIDAS.suelo.map(p => p.f + " · " + p.en + " · " + p.codigo));
  const mal = A.suelo.filter(u => !lista.has(clave(u))).map(clave);
  assert.deepStrictEqual(mal, [], "llamadas a suelo( que no están en PERMITIDAS.suelo (si mueven a alguien, gm.suelo; si no, a la lista con su motivo):\n  " + mal.join("\n  "));
  const vistas = new Set(A.suelo.map(clave)), sobran = [...lista].filter(k => !vistas.has(k));
  assert.deepStrictEqual(sobran, [], "PERMITIDAS.suelo tiene llamadas que ya no existen: quítalas de la lista");
  t.diagnostic(A.suelo.length + " llamadas a suelo( en la locomoción, todas de la lista");
});

test("en la locomoción nadie lee D.ext: la caja es gm.dentro y el borde, gm.obstaculo", () => {
  const mal = montaje().ext.map(clave);
  assert.deepStrictEqual(mal, [], "lecturas de D.ext en la locomoción:\n  " + mal.join("\n  "));
});

test("en la locomoción, copas solo donde dice la lista (el rodeo de «ir a» y una ayuda de pruebas) y ningún fueraDeTroncos: los troncos son gm.obstaculo", () => {
  const A = montaje(), cuenta = {};
  for (const u of A.copas) cuenta[clave(u)] = (cuenta[clave(u)] || 0) + 1;
  const esperado = {}; for (const p of PERMITIDAS.copas) esperado[p.f + " · " + p.en + " · " + p.codigo] = p.n;
  assert.deepStrictEqual(cuenta, esperado, "los usos de copas en la locomoción no son los de PERMITIDAS.copas");
  assert.deepStrictEqual(A.fuera.map(clave), [], "fueraDeTroncos en la locomoción: es gm.obstaculo(x, y, radio)");
});

test("LlegadaPuro.rayoSuelo, IrAPuro.planifica e IrAPuro.ir reciben los delegados de gm (la caja es gm.dentro; el alto de la llegada, gm.suelo)", () => {
  const A = montaje(), arg = (u, i) => (u.nodo.arguments[i] ? A.todo.slice(u.nodo.arguments[i].start, u.nodo.arguments[i].end) : null);
  const de = nombre => A.puros.filter(u => u.nodo.callee.property.name === nombre);
  const rayo = de("rayoSuelo"), plan = de("planifica"), ir = de("ir");
  assert.ok(rayo.length >= 2, "12b_llegada llama a LlegadaPuro.rayoSuelo desde el Dron y desde la VR");
  for (const u of rayo) { assert.strictEqual(arg(u, 3), "gm.dentro", clave(u) + ": la caja de rayoSuelo es gm.dentro"); assert.strictEqual(arg(u, 2), "alto", clave(u) + ": el suelo de rayoSuelo es alto"); }
  assert.ok(plan.length >= 1 && ir.length >= 1, "12c_ir_a llama a IrAPuro.planifica e IrAPuro.ir");
  for (const u of plan) assert.strictEqual(arg(u, 4), "gm.dentro", clave(u) + ": la caja de planifica es gm.dentro");
  for (const u of ir) assert.strictEqual(arg(u, 5), "gm.dentro", clave(u) + ": la caja de ir (la de replanificar) es gm.dentro");
  const llegada = fuenteMotor("12b_llegada.js");   // A3-6c: el talón y llegada.ts
  assert.match(llegada, /var alto = function \(x, z\) \{ return gm\.suelo\(x, -z\) \* Estado\.exag; \};/, "el alto de la llegada es gm.suelo · exag");
});

test("cada módulo de locomoción pregunta al mundo activo (gm.suelo, gm.dentro o gm.obstaculo)", () => {
  for (const m of MODULOS) assert.match(fuenteMotor(m), /\bgm\.(suelo|dentro|obstaculo)\(|\bgm\.dentro\b/, m + " no usa los delegados de gm");
});

// A3-5 (MU5-n): el código de 16_vida vive en mundos/exterior/vida.ts, que acorn no lee (TypeScript); el talón solo cablea. Lo mismo, sobre el texto del .ts sin comentarios: el dron se mueve con
// el suelo y el borde del mundo activo (sueloMundo y obstaculo, que el talón cablea a gm.suelo y gm.obstaculo), el dibujo usa altSuelo (el suelo de 02_mundo), y nadie lee D.ext ni copas ni fueraDeTroncos.
test("16_vida (vida.ts): el dron se mueve con sueloMundo y obstaculo (gm); suelo( solo en altSuelo, que es de dibujo y de la vida ambiental; ni D.ext, ni copas, ni fueraDeTroncos", () => {
  const ts = fuenteMotor("16_vida.js").split("\n").filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/\s\/\/.*$/, "")).join("\n");
  assert.deepStrictEqual([...ts.matchAll(/(?<![\w.])suelo\((?!x: number)/g)].length, 1, "vida.ts llama a suelo( una sola vez: en altSuelo (la otra mención es el tipo de DepsVida; gm.suelo del talón no cuenta)");
  assert.match(ts, /function altSuelo\(x: any, y: any\) \{ return suelo\(x, y\) \* Estado\.exag; \}/, "altSuelo es el de la vida ambiental (16b_fauna, 25_perros, 22b_huellas_polvo, 24_pantalla) y del dibujo del dron (vidaDron)");
  assert.match(ts, /function altMueve\(x: any, y: any\) \{ return sueloMundo\(x, y\) \* Estado\.exag; \}/, "el dron se mueve con altMueve = el suelo del mundo activo");
  assert.match(ts, /var o = obstaculo\(dr\.x, dr\.y, 0\);/, "el borde del mundo activo es obstaculo(x, y, 0)");
  assert.ok(!/\bD\.ext\b/.test(ts) && !/\bfueraDeTroncos\b/.test(ts) && !/\bcopas\b/.test(ts), "vida.ts no lee D.ext, ni copas, ni fueraDeTroncos");
  const talon = pasoArranque("16_vida.js");
  assert.match(talon, /sueloMundo: function \(x, y\) \{ return gm\.suelo\(x, y\); \}, obstaculo: function \(x, y, r\) \{ return gm\.obstaculo\(x, y, r\); \}/, "el talón cablea el mundo activo");
});

// A3-6c (MU5-n): lo mismo para 29_vr, cuyo código vive en mundos/comun/vr*.ts (el JavaScript que sale de ellos, sin comentarios): quien mira se mueve con gm.suelo, gm.dentro y
// gm.obstaculo; suelo( solo para la marca del arco (dibujo; el punto de caída lo calcula vrArco con gm.suelo y gm.dentro) y en window.__vrOlivo (ayuda de las pruebas de VR, el olivo
// más cercano a la cabeza), que es también el único que nombra copas; ni D.ext ni fueraDeTroncos.
test("29_vr (mundos/comun/vr*.ts): se mueve con gm; suelo( solo en la marca del arco y en __vrOlivo; copas solo en __vrOlivo; ni D.ext ni fueraDeTroncos", () => {
  const js = fuenteMotor("29_vr.js").split("\n").filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/\s\/\/.*$/, "")).join("\n");
  const suelos = [...js.matchAll(/(?<![\w.])suelo\(([^)]*)\)/g)].map(m => m[0]).filter(x => !/^suelo\(x: number/.test(x));
  assert.deepStrictEqual(suelos.sort(), ["suelo(VRX.tp.x, -VRX.tp.z)", "suelo(b.x, b.y)"].sort(), "suelo( fuera de la lista en la VR (si mueve a alguien, gm.suelo)");
  assert.match(js, /arcoMarca\.position\.set\(VRX\.tp\.x, suelo\(VRX\.tp\.x, -VRX\.tp\.z\) \* Estado\.exag \+ 0\.08, VRX\.tp\.z\)/, "la marca del arco es dibujo");
  assert.match(js, /window\.__vrOlivo = function \(\) \{ var h = VRX\.cab, b = null, bd = 1e9; copas\(\)\.forEach\(/, "copas, solo en la ayuda de pruebas");
  assert.strictEqual([...js.matchAll(/(?<![\w.])copas\(\)/g)].length, 1, "copas() una sola vez (en __vrOlivo)");
  assert.ok(!/D\.ext/.test(js) && !/fueraDeTroncos/.test(js), "la VR no lee D.ext ni fueraDeTroncos");
  for (const re of [/gm\.suelo\(px, -pz\)/, /gm\.dentro\(hit\.x, -hit\.z\)/, /ob = gm\.obstaculo\(nx, -nz, rTronco\)/, /VRX\.rig\.y = gm\.suelo\(px, py\) \* Estado\.exag \+ vrBaseY\(\)/]) assert.match(js, re);
  assert.match(pasoArranque("29_vr.js"), /gm: function \(\) \{ return gm; \}/, "el talón da el gestor de mundos por función (90_final lo declara después)");
});

test("90_final.js da al exterior su caja y su censo (creaExterior({ ext: D.ext, copas: copas, … }))", () => {
  const fin = pasoArranque("90_final.js");
  assert.match(fin, /Mundos\.creaExterior\(\{ suelo: suelo, ext: D\.ext, copas: copas,/);
});

test("la regla del guardián, sobre un montaje inventado: ve suelo(, D.ext, copas y fueraDeTroncos en los vigilados, con su función, y no fuera de ellos", () => {
  const m = [
    { nombre: "01_a.js", texto: "(function () {\n  \"use strict\";\n  var copas = [], D = { ext: [0, 1, 1, 0] };\n  function suelo(x, y) { return x + y; }\n" },
    { nombre: "02_b.js", texto: "  function anda(x) { var e = D.ext; return suelo(x, 1) + copas.length + e[0] + o.copas; }\n  var pinta = function () { return suelo(2, 3); };\n  window.__p = function () { return LlegadaPuro.fueraDeTroncos(0, 0, copas); };\n" },
    { nombre: "03_c.js", texto: "  function otro() { return suelo(9, 9) + D.ext[0] + copas.length; }\n" },
    { nombre: "99_d.js", texto: "})();\n" },
  ];
  const A = analiza(m, ["02_b.js"]);
  assert.deepStrictEqual(A.suelo.map(clave), ["02_b.js · anda · suelo(x, 1)", "02_b.js · pinta · suelo(2, 3)"]);
  assert.deepStrictEqual(A.ext.map(clave), ["02_b.js · anda · D.ext"]);
  assert.deepStrictEqual(A.copas.map(clave), ["02_b.js · anda · copas", "02_b.js · window.__p · copas"], "o.copas es una propiedad: no cuenta");
  assert.deepStrictEqual(A.fuera.map(clave), ["02_b.js · window.__p · LlegadaPuro.fueraDeTroncos(0, 0, copas)"]);
});
