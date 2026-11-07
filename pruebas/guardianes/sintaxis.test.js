"use strict";
// Sintaxis: el arranque del cliente (apps/web/src/arranque.ts, A3-8c) y cada uno de sus pasos son JavaScript válido una vez quitados los tipos, y los .py
// compilan. Antes miraba la concatenación de apps/web/motor/ (01_datos abría la IIFE y 99_cierre la cerraba); el legado ya no existe y el orden de los
// pasos lo vigila arranque.test.js. Los tipos de todo src/ los comprueba tsc (tipos_web.test.js).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, ficheros, ejecuta, python, os, fs, path, lee } = require("./_util");
const { pasos, sinTipos, ARRANQUE } = require("./_pasos");

const comprueba = (nombre, texto) => {
  const tmp = path.join(os.tmpdir(), "gemelo_" + process.pid + "_" + nombre);
  fs.writeFileSync(tmp, texto);
  try { return ejecuta(process.execPath, ["--check", tmp]); } finally { fs.unlinkSync(tmp); }
};

test("el arranque tiene sus pasos en orden (01_datos primero, 90_final último) y su orden es el alfabético, que es el de creación", () => {
  const n = Object.keys(pasos());
  assert.ok(n.length >= 30, "pocos pasos en el arranque: " + n.length);
  assert.match(n[0], /^01_/, "el primero lee los datos de la página (01_datos)");
  assert.match(n[n.length - 1], /^90_/, "el último cablea el gestor y el bucle (90_final)");
  assert.deepStrictEqual(n, n.slice().sort());
});

test("el arranque, sin tipos, es JavaScript válido (un módulo ES)", () => {
  const r = comprueba("arranque.mjs", sinTipos(lee(ARRANQUE)));
  assert.strictEqual(r.status, 0, r.stderr);
});

for (const [nombre, texto] of Object.entries(pasos())) {
  test("paso válido por sí solo (envuelto en una función): " + nombre, () => {
    const r = comprueba(nombre, "(function () {\n" + texto + "\n})();\n");
    assert.strictEqual(r.status, 0, r.stderr);
  });
}

test("los scripts de Python compilan (py_compile)", t => {
  const py = python();
  if (!py) return t.skip("No hay Python 3 en el PATH: no se comprueban los .py");
  const pys = ficheros().filter(f => f.endsWith(".py"));
  assert.ok(pys.length > 0);
  const prog = "import sys,ast\nfor f in sys.argv[1:]:\n    ast.parse(open(f,encoding='utf-8').read(), f)\n";
  const r = ejecuta(py, ["-I", "-c", prog].concat(pys), { cwd: RAIZ });
  assert.strictEqual(r.status, 0, r.stderr);
});
