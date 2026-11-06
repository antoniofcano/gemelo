"use strict";
// L5-01 (auditoría de noviembre de 2026): los módulos de apps/web/motor/ se concatenan en UNA sola IIFE (genera_motor.mjs: 01_datos la abre y 99_cierre la cierra), y `var` y
// `function` permiten redeclarar: dos módulos que declaran el mismo nombre en el primer nivel de esa IIFE se pisan en silencio (matTronco, de 06 y 18, hizo que los troncos
// del nivel 0 se dibujaran con el material del paisaje). Este guardián parsea la concatenación entera, recorre el primer nivel de la IIFE (var, let, const, function y
// class) y falla si un nombre lo declaran dos ficheros. Lo que queda DENTRO de una función (las `var tmp` locales) no cuenta: no está en el ámbito común. Solo Node.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const acorn = require("acorn");

const MOTOR = path.join(RAIZ, "apps", "web", "motor");

/** los nombres de cada declaración del primer nivel de la IIFE: [{ nombre, desde }] (desde = posición en el texto) */
function declarados(texto) {
  const prog = acorn.parse(texto, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }), out = [];
  const patron = (p, desde) => {
    if (!p) return;
    if (p.type === "Identifier") out.push({ nombre: p.name, desde });
    else if (p.type === "ObjectPattern") p.properties.forEach(q => patron(q.value || q.argument, desde));
    else if (p.type === "ArrayPattern") p.elements.forEach(e => patron(e, desde));
    else if (p.type === "AssignmentPattern") patron(p.left, desde);
    else if (p.type === "RestElement") patron(p.argument, desde);
  };
  // la IIFE: (function () { … })();  (si el texto no la trae, el primer nivel es el del propio texto)
  let cuerpo = prog.body;
  const e = prog.body.length === 1 && prog.body[0].type === "ExpressionStatement" ? prog.body[0].expression : null;
  const f = e && e.type === "CallExpression" && (e.callee.type === "FunctionExpression") ? e.callee : null;
  if (f) cuerpo = f.body.body;
  for (const st of cuerpo) {
    if (st.type === "VariableDeclaration") st.declarations.forEach(d => patron(d.id, st.start));
    else if ((st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") && st.id) out.push({ nombre: st.id.name, desde: st.start });
  }
  return out;
}

test("ningún nombre del primer nivel del motor lo declaran dos módulos (un ámbito común: se pisarían)", () => {
  const ficheros = fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).sort(), limites = [];
  let texto = "";
  for (const f of ficheros) { limites.push({ f, desde: texto.length }); texto += fs.readFileSync(path.join(MOTOR, f), "utf8"); }
  const dueño = pos => { let r = limites[0].f; for (const l of limites) if (l.desde <= pos) r = l.f; return r; };
  const por = {};
  for (const d of declarados(texto)) { const f = dueño(d.desde); (por[d.nombre] = por[d.nombre] || new Set()).add(f); }
  const repetidos = Object.entries(por).filter(([, fs2]) => fs2.size > 1).map(([n, fs2]) => n + ": " + [...fs2].join(", "));
  assert.deepStrictEqual(repetidos, [], "declarados en más de un módulo:\n" + repetidos.join("\n"));
});

test("el guardián ve lo que debe: var, function, desestructurados y clases del primer nivel de la IIFE; no lo de dentro de las funciones", () => {
  const t = "(function () { var a = 1, b; function f() { var interna = 2; } const { c, d: [e] } = x; class K {} function* g() {} })();";
  assert.deepStrictEqual(declarados(t).map(d => d.nombre).sort(), ["K", "a", "b", "c", "e", "f", "g"]);
  assert.deepStrictEqual(declarados("(function () { var u = 1; })(); ").map(d => d.nombre), ["u"]);
});
