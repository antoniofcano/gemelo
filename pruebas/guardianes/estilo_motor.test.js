"use strict";
// Guardián del estilo del motor legado (CLAUDE.md §5, MU1-14 / A1-17): en apps/web/motor/*.js no hay let, const ni class
// (ni al nivel de módulo ni dentro de funciones; hoy no hay ninguno, así que no hay trinquete), y ningún módulo abre o
// cierra la IIFE: la abre 01_datos.js y la cierra 99_cierre.js, y el montaje es una sola sentencia. Se analiza el montaje
// (los módulos en orden, concatenados como hace genera_motor.mjs) con acorn. Solo Node.
const test = require("node:test"), assert = require("node:assert");
const path = require("path");
const acorn = require("acorn");
const { ficheros, lee } = require("./_util");

/** Analiza módulos [{nombre, texto}] en su orden de montaje: declaraciones let/const/class (con su módulo) y si la IIFE es la correcta. */
function analiza(modulos) {
  let todo = "", a = 0;
  const rangos = modulos.map(m => { const r = { nombre: m.nombre, a, b: a + m.texto.length }; a = r.b; todo += m.texto; return r; });
  const fichero = pos => { const r = rangos.find(x => pos >= x.a && pos < x.b); return r ? r.nombre : "?"; };
  let ast;
  try { ast = acorn.parse(todo, { ecmaVersion: "latest", sourceType: "script" }); }
  catch (e) { return { error: e.message, decl: [], iife: "el montaje no es JavaScript válido: " + e.message }; }
  const decl = [];
  (function recorre(n) {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "VariableDeclaration" && n.kind !== "var") decl.push(fichero(n.start) + ": " + n.kind);
    if (n.type === "ClassDeclaration" || n.type === "ClassExpression") decl.push(fichero(n.start) + ": class");
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(recorre);
      else if (v && typeof v.type === "string") recorre(v);
    }
  })(ast);
  return { error: null, decl, iife: iifeMotivo(ast, fichero) };
}

/** Null si el montaje es UNA IIFE que abre 01_datos.js y cierra 99_cierre.js; si no, por qué no. */
function iifeMotivo(ast, fichero) {
  const b = ast.body;
  if (b.length !== 1) return "el montaje tiene " + b.length + " sentencias de nivel superior (debe ser una sola: la IIFE de 01_datos a 99_cierre)";
  const e = b[0].expression;
  if (!e || e.type !== "CallExpression" || e.callee.type !== "FunctionExpression") return "lo de nivel superior no es una IIFE";
  if (fichero(e.callee.start) !== "01_datos.js") return "la IIFE no la abre 01_datos.js sino " + fichero(e.callee.start);
  if (fichero(b[0].end - 1) !== "99_cierre.js") return "la IIFE no la cierra 99_cierre.js sino " + fichero(b[0].end - 1);
  return null;
}

const SRC = ficheros().filter(f => /^apps\/web\/motor\/[^/]+\.js$/.test(f)).sort();
const modulos = () => SRC.map(f => ({ nombre: path.basename(f), texto: lee(f) }));

test("el motor legado no tiene let, const ni class (ni al nivel de módulo ni dentro de funciones)", () => {
  assert.ok(SRC.length >= 30, "pocos módulos en apps/web/motor/: " + SRC.length);
  const r = analiza(modulos());
  assert.strictEqual(r.error, null, "el montaje no se puede analizar");
  assert.deepStrictEqual(r.decl, [], "declaraciones que no son var (cámbialas a var; no hay trinquete porque hoy no hay ninguna)");
});

test("solo 01_datos.js abre la IIFE y solo 99_cierre.js la cierra (el montaje es una sola sentencia)", () => {
  const r = analiza(modulos());
  assert.strictEqual(r.iife, null, "la IIFE del montaje está mal: " + r.iife);
});

test("el detector caza lo que debe: let, const y class dentro de funciones, un módulo que cierra la IIFE antes, y un montaje roto", () => {
  const ini = { nombre: "01_datos.js", texto: "(function () {\n\"use strict\";\n" }, fin = { nombre: "99_cierre.js", texto: "})();\n" };
  const malo = analiza([ini, { nombre: "02_x.js", texto: "var a = 1; let b = 2;\nfunction f() { const c = 3; }\nclass K {}\n" }, fin]);
  assert.deepStrictEqual(malo.decl, ["02_x.js: let", "02_x.js: const", "02_x.js: class"]);
  const bien = analiza([ini, { nombre: "02_x.js", texto: "var a = 1;\n(function () { var x = 2; })();\n" }, fin]);
  assert.deepStrictEqual(bien.decl, []);
  assert.strictEqual(bien.iife, null, "una IIFE interna balanceada no abre ni cierra la principal");
  const cierra = analiza([ini, { nombre: "02_x.js", texto: "var a = 1;\n})();\n(function () {\n" }, fin]);
  assert.match(cierra.iife, /sentencias de nivel superior/, "un módulo que cierra la IIFE antes de tiempo");
  const abre = analiza([ini, { nombre: "02_x.js", texto: "(function () { var x = 1;\n" }, fin]);
  assert.ok(abre.error, "un módulo que abre una función sin cerrarla deja el montaje sin JS válido");
});
