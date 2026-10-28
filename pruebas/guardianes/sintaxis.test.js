"use strict";
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, ficheros, ejecuta, python, os, fs, path } = require("./_util");

const SRC = ficheros().filter(f => /^apps\/web\/motor\/[^/]+\.js$/.test(f)).sort();

test("el motor tiene módulos y el orden alfabético es el de montaje (01_ primero, 99_ último)", () => {
  assert.ok(SRC.length >= 30, "pocos módulos en src/: " + SRC.length);
  assert.match(path.basename(SRC[0]), /^01_/, "el primero debe ser 01_datos (abre la IIFE)");
  assert.match(path.basename(SRC[SRC.length - 1]), /^99_/, "el último debe ser 99_cierre (la cierra)");
  const ord = SRC.slice().sort();
  assert.deepStrictEqual(SRC, ord);
});

test("el script montado (todos los src/*.js concatenados, como hace montar_v2.py) es JavaScript válido", () => {
  // El montador hace sorted(glob): orden ASCII. 01_datos abre la IIFE y 99_cierre la cierra, así que sólo el conjunto es válido.
  const todo = SRC.map(f => fs.readFileSync(path.join(RAIZ, f), "utf8")).join("");
  const tmp = path.join(os.tmpdir(), "gemelo_todo_" + process.pid + ".js");
  fs.writeFileSync(tmp, todo);
  const r = ejecuta(process.execPath, ["--check", tmp]);
  fs.unlinkSync(tmp);
  assert.strictEqual(r.status, 0, r.stderr);
});

for (const f of SRC) {
  const nombre = path.basename(f);
  if (/^(01|99)_/.test(nombre)) continue;           // sólo válidos juntos (abren/cierran la IIFE)
  test("módulo válido por sí solo (envuelto en una función): " + nombre, () => {
    const tmp = path.join(os.tmpdir(), "gemelo_" + process.pid + "_" + nombre);
    fs.writeFileSync(tmp, "(function () {\n" + fs.readFileSync(path.join(RAIZ, f), "utf8") + "\n})();\n");
    const r = ejecuta(process.execPath, ["--check", tmp]);
    fs.unlinkSync(tmp);
    assert.strictEqual(r.status, 0, r.stderr);
  });
}

test("los scripts de Python compilan (py_compile)", t => {
  const py = python();
  if (!py) return t.skip("No hay Python 3 en el PATH: no se comprueban los .py");
  const pys = ficheros().filter(f => f.endsWith(".py"));
  assert.ok(pys.length > 0);
  const prog = "import sys,ast\nfor f in sys.argv[1:]:\n    ast.parse(open(f,encoding='utf-8').read(), f)\n";
  const r = ejecuta(py, ["-I", "-c", prog].concat(pys));
  assert.strictEqual(r.status, 0, r.stderr);
});
