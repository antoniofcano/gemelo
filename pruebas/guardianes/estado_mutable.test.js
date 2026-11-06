"use strict";
// Guardián del estado mutable compartido del motor legado (A1-13 = MU1-9, MUNDOS §9.4 fila 7). Antes, `exag`, `modo` y `calidad` eran
// variables sueltas de la IIFE (03_escena.js) que otros módulos reescribían; ahora son campos de UN objeto, `Estado`
// (apps/web/src/nucleo/estado.ts, `var Estado = Nucleo.creaEstado();` en 03_escena.js), que es lo que el WorldManager de MUNDOS §2-§4
// necesita para dar a cada mundo su exageración y su modo. Con el montaje (los módulos en orden, concatenados como genera_motor.mjs)
// analizado con acorn y sus ámbitos de función (el motor no tiene let, const ni class: estilo_motor.test.js), comprueba:
//   1. ningún módulo vuelve a declarar `exag`, `modo` ni `calidad` en la IIFE, y ningún nombre suelto así llega a ella (ni leído ni escrito):
//      se usa `Estado.exag`; una variable LOCAL con ese nombre (un parámetro `modo`, por ejemplo) sí vale;
//   2. `Estado` se declara una sola vez, en 03_escena.js, con `Nucleo.creaEstado(…)`, y nadie la reasigna ni la tapa con una local;
//   3. trinquete: las demás variables de la IIFE que se reasignan desde más de un módulo, o en uno y se leen en otros (el inventario de
//      A1-13), son las de PENDIENTES o menos. Una nueva falla: va a `Estado` (o a su objeto). Si una sale, lo avisa y se quita de la lista.
// Solo Node.
const test = require("node:test"), assert = require("node:assert");
const acorn = require("acorn");
const { ficheros, lee } = require("./_util");

const EN_ESTADO = ["exag", "modo", "calidad"];
// El inventario de A1-13 (2026-11-06): globales de la IIFE reasignadas fuera de su declaración y compartidas entre módulos, que aún no
// están en Estado. Solo puede encoger. Entre paréntesis, quién las declara y quién más las escribe (de la salida de `compartidas`).
const PENDIENTES = [
  "primera",       // 12_paseo; la escriben 16_vida y 29_vr
  "ndviIdx",       // 10_ndvi; la escribe 14_historia
  "instSombra",    // 18_paisaje; la escribe 07_follaje
  "kcor",          // 02_mundo; la escribe 09_camara
  "listo",         // 08_marcadores; la escribe 90_final
  "tinte",         // 02_mundo; la escribe 10_ndvi (ndLo y ndHi también nacen en 02_mundo, pero solo las escribe y las lee 10_ndvi: no entran)
  "aguaNivel",     // 18_paisaje (escribe y lee él; leen 20_sonido y 22_huellas)
  "OT", "VIVO",    // 14_historia
  "enDron", "enQuad", "tVida", "vq",   // 16_vida
  "FACTOR_R8", "FACTOR_R8_GEN",        // 01_datos
  "fincaSel", "parcelaSel",            // 13_parcelas
  "paseando", "persona", "teclas",     // 12_paseo
  "tMundo",        // 15_tiempo
];

// ---------- ámbitos (solo los de función: var, parámetros, declaraciones de función, el nombre de una función con nombre y el de un catch)
function nombresPatron(p, out = []) {
  if (!p) return out;
  if (p.type === "Identifier") out.push(p);
  else if (p.type === "ObjectPattern") p.properties.forEach(q => nombresPatron(q.type === "RestElement" ? q.argument : q.value, out));
  else if (p.type === "ArrayPattern") p.elements.forEach(e => nombresPatron(e, out));
  else if (p.type === "RestElement") nombresPatron(p.argument, out);
  else if (p.type === "AssignmentPattern") nombresPatron(p.left, out);
  return out;
}
const esFuncion = n => n && /Function/.test(n.type);
function hijos(n) {
  const r = [];
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => x && typeof x.type === "string" && r.push([k, x])); else if (v && typeof v.type === "string") r.push([k, v]); }
  return r;
}
/** los nombres que declara una función en su propio ámbito (sin entrar en las anidadas) */
function declaraFuncion(fn) {
  const s = new Set();
  fn.params.forEach(p => nombresPatron(p).forEach(i => s.add(i.name)));
  if (fn.type === "FunctionExpression" && fn.id) s.add(fn.id.name);
  (function rec(n) {
    for (const [, h] of hijos(n)) {
      if (h.type === "VariableDeclaration") h.declarations.forEach(d => nombresPatron(d.id).forEach(i => s.add(i.name)));
      if (h.type === "FunctionDeclaration") { s.add(h.id.name); continue; }
      if (esFuncion(h)) continue;
      rec(h);
    }
  })(fn.body);
  return s;
}

/** Analiza el montaje [{nombre, texto}]: las globales de la IIFE (con su módulo), quién escribe y lee cada una y las locales que las tapan. */
function analiza(modulos) {
  let todo = "", a = 0;
  const rangos = modulos.map(m => { const r = { nombre: m.nombre, a, b: a + m.texto.length }; a = r.b; todo += m.texto; return r; });
  const fichero = pos => { const r = rangos.find(x => pos >= x.a && pos < x.b); return r ? r.nombre : "?"; };
  const ast = acorn.parse(todo, { ecmaVersion: "latest", sourceType: "script" });
  const st = ast.body[0], iife = st && st.expression && st.expression.callee;
  assert.ok(esFuncion(iife), "el montaje no es una IIFE (lo vigila estilo_motor.test.js)");
  const globales = declaraFuncion(iife), declaradaEn = {}, usos = {}, tapadas = {};
  for (const s of iife.body.body) {
    if (s.type === "VariableDeclaration") s.declarations.forEach(d => nombresPatron(d.id).forEach(i => { (declaradaEn[i.name] = declaradaEn[i.name] || []).push({ f: fichero(i.start), ini: d.init }); }));
    if (s.type === "FunctionDeclaration") (declaradaEn[s.id.name] = declaradaEn[s.id.name] || []).push({ f: fichero(s.start), ini: null });
  }
  const uso = n => (usos[n] = usos[n] || { escriben: new Set(), leen: new Set() });
  const escrito = new WeakSet();
  (function visita(n, ambitos, padre, clave) {
    let dentro = ambitos;
    if (n === iife) dentro = [];
    else if (esFuncion(n)) { const d = declaraFuncion(n); dentro = ambitos.concat([d]); for (const x of d) (tapadas[x] = tapadas[x] || new Set()).add(fichero(n.start)); }
    else if (n.type === "CatchClause" && n.param) dentro = ambitos.concat([new Set(nombresPatron(n.param).map(i => i.name))]);
    if (n.type === "Identifier") {
      if (padre && padre.type === "MemberExpression" && clave === "property" && !padre.computed) return;
      if (padre && (padre.type === "Property" || padre.type === "MethodDefinition") && clave === "key" && !padre.computed) return;
      if (padre && /^(Labeled|Break|Continue)Statement$/.test(padre.type)) return;
      if ((padre && padre.type === "VariableDeclarator" && clave === "id") || (padre && padre.type === "FunctionDeclaration" && clave === "id")) return;
      if (dentro.some(s => s.has(n.name))) return;                               // una local: no es la de la IIFE
      uso(n.name)[escrito.has(n) ? "escriben" : "leen"].add(fichero(n.start));     // de la IIFE, o suelta (sin declarar en ningún sitio)
      return;
    }
    if (n.type === "AssignmentExpression") nombresPatron(n.left).forEach(i => escrito.add(i));
    if (n.type === "UpdateExpression" && n.argument.type === "Identifier") escrito.add(n.argument);
    if (/^For(In|Of)Statement$/.test(n.type) && n.left.type !== "VariableDeclaration") nombresPatron(n.left).forEach(i => escrito.add(i));
    for (const [k, h] of hijos(n)) visita(h, dentro, n, k);
  })(iife, [], null, null);
  return { todo, globales, declaradaEn, usos, tapadas };
}

/** Las globales de la IIFE que se reasignan (fuera de su declaración) y se comparten: escritas en más de un módulo, o escritas en uno y
 *  leídas en otro. { nombre: { declara, escriben: [...], leen: [...] } } */
function compartidas(A) {
  const out = {};
  for (const n of Object.keys(A.usos)) {
    if (!A.globales.has(n)) continue;
    const u = A.usos[n], esc = [...u.escriben];
    if (!esc.length) continue;
    const todos = new Set([...u.escriben, ...u.leen]);
    if (esc.length > 1 || todos.size > 1) out[n] = { declara: (A.declaradaEn[n] || [{ f: "?" }])[0].f, escriben: esc.sort(), leen: [...u.leen].sort() };
  }
  return out;
}

const MOTOR = ficheros().filter(f => /^apps\/web\/motor\/[^/]+\.js$/.test(f)).sort();
const montaje = () => analiza(MOTOR.map(f => ({ nombre: f.slice("apps/web/motor/".length), texto: lee(f) })));

test("exag, modo y calidad viven en Estado: ningún módulo las declara en la IIFE ni las usa sueltas (una local con ese nombre sí vale)", () => {
  const A = montaje(), mal = [];
  for (const n of EN_ESTADO) {
    for (const d of A.declaradaEn[n] || []) mal.push(d.f + ": declara «" + n + "» en la IIFE (es Estado." + n + ")");
    const u = A.usos[n];
    if (u) for (const f of new Set([...u.escriben, ...u.leen])) mal.push(f + ": usa «" + n + "» suelta" + (u.escriben.has(f) ? " y la reasigna" : "") + " (es Estado." + n + ")");
  }
  assert.deepStrictEqual(mal, []);
});

test("Estado se declara una vez, en 03_escena.js, con Nucleo.creaEstado(…); nadie la reasigna ni la tapa con una local", () => {
  const A = montaje(), d = A.declaradaEn.Estado || [];
  assert.strictEqual(d.length, 1, "Estado debe declararse una sola vez en la IIFE: " + JSON.stringify(d.map(x => x.f)));
  assert.strictEqual(d[0].f, "03_escena.js");
  const ini = d[0].ini;
  assert.ok(ini && ini.type === "CallExpression" && ini.callee.type === "MemberExpression" && ini.callee.object.name === "Nucleo" && ini.callee.property.name === "creaEstado",
    "03_escena.js: `var Estado = Nucleo.creaEstado(…);` (el objeto lo crea apps/web/src/nucleo/estado.ts)");
  assert.deepStrictEqual([...((A.usos.Estado || {}).escriben || [])], [], "nadie reasigna Estado: se cambian sus campos (Estado.exag = …)");
  assert.deepStrictEqual([...(A.tapadas.Estado || [])], [], "una local llamada Estado taparía la del motor");
});

test("trinquete del estado compartido: las demás globales reasignadas entre módulos son las del inventario de A1-13, o menos", t => {
  const c = compartidas(montaje());
  const nuevas = Object.keys(c).filter(n => !PENDIENTES.includes(n)).map(n => n + " (la declara " + c[n].declara + "; la escriben " + c[n].escriben.join(", ") + ")");
  assert.deepStrictEqual(nuevas, [], "estado mutable compartido nuevo: va a un objeto (Estado, apps/web/src/nucleo/estado.ts), no a una variable suelta de la IIFE");
  const fuera = PENDIENTES.filter(n => !(n in c));
  t.diagnostic("pendientes de pasar a un objeto: " + Object.keys(c).sort().join(", "));
  if (fuera.length) t.diagnostic("ya no son estado compartido (quítalas de PENDIENTES): " + fuera.join(", "));
});

test("la regla del guardián, sobre un montaje inventado: ve la escritura de otro módulo, ignora las locales y las propiedades", () => {
  const m = [
    { nombre: "01_a.js", texto: "(function () {\n  \"use strict\";\n  var exag = 1, quieto = 2, propia = 0, Estado = Nucleo.creaEstado();\n  propia = 3;\n" },
    { nombre: "02_b.js", texto: "  function f(modo) { modo = 2; var calidad = 0; calidad++; return { exag: quieto, modo: modo }; }\n  exag = 3; o.exag = 4; Estado.exag = 5;\n" },
    { nombre: "03_c.js", texto: "  function g() { var propia = 1; return exag * quieto + propia; }\n  try { g(); } catch (exag) { exag = 1; }\n" },
    { nombre: "99_d.js", texto: "})();\n" },
  ];
  const A = analiza(m), c = compartidas(A);
  assert.deepStrictEqual(Object.keys(c).sort(), ["exag"], "solo exag: propia se escribe y se lee en su módulo; quieto no se reasigna");
  assert.deepStrictEqual(c.exag, { declara: "01_a.js", escriben: ["02_b.js"], leen: ["03_c.js"] });
  assert.ok(!A.usos.modo && !A.usos.calidad, "el parámetro modo y la var local calidad no son de la IIFE");
  assert.deepStrictEqual([...A.usos.Estado.leen], ["02_b.js"]); assert.deepStrictEqual([...A.usos.Estado.escriben], []);
  // propia, leída también en otro módulo, ya es compartida; y una escritura suelta de algo que nadie declara se ve igual
  const B = analiza([m[0], { nombre: "02_b.js", texto: "  modo = 1;\n" }, { nombre: "03_c.js", texto: "  var x = propia;\n" }, m[3]]);
  assert.ok("propia" in compartidas(B));
  assert.deepStrictEqual([...B.usos.modo.escriben], ["02_b.js"], "una escritura suelta de modo se ve");
});
