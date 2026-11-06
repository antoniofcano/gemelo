"use strict";
// Guardián de la lista de la puerta (regla 1 de CLAUDE.md: «la lista vive en un solo sitio», MU1-14 / A1-15): cada
// pruebas/guardianes/*.test.js tiene su fila en la tabla de «La puerta» de doc/operacion/ONBOARDING.md (la tabla cita su
// nombre), y cada *.test.js que cita esa tabla existe. Solo Node: lee ficheros, no ejecuta nada.
const test = require("node:test"), assert = require("node:assert");
const { lee, fs, path, RAIZ } = require("./_util");

const DOC = "doc/operacion/ONBOARDING.md", CARPETA = "pruebas/guardianes";

/** Las filas de la tabla de «3. La puerta» (desde su título hasta el siguiente «## »). */
function filasDeLaPuerta(md) {
  const seccion = md.split(/^## /m).find(b => b.startsWith("3. La puerta")) || "";
  return seccion.split("\n").filter(l => l.startsWith("|"));
}
/** Los nombres *.test.js que cita un texto. */
const citados = s => new Set(s.match(/[\w.-]+\.test\.js/g) || []);

/** Lo que falta: guardianes sin fila, y nombres que la tabla cita y no existen. */
function cuadra(guardianes, filas) {
  const cit = citados(filas.join("\n"));
  return {
    sinFila: guardianes.filter(f => !cit.has(f)),
    inexistentes: [...cit].filter(f => !guardianes.includes(f)).sort()
  };
}

test("cada pruebas/guardianes/*.test.js tiene su fila en la tabla de la puerta y cada *.test.js que cita la tabla existe", () => {
  const guardianes = fs.readdirSync(path.join(RAIZ, CARPETA)).filter(f => /\.test\.js$/.test(f)).sort();
  assert.ok(guardianes.length >= 100, "pocos guardianes: " + guardianes.length);
  const c = cuadra(guardianes, filasDeLaPuerta(lee(DOC)));
  assert.deepStrictEqual(c.sinFila, [], "guardianes sin fila en la tabla de «La puerta» de ONBOARDING (añádela, con una descripción honesta de lo que comprueba)");
  assert.deepStrictEqual(c.inexistentes, [], "la tabla de «La puerta» cita pruebas que no existen en pruebas/guardianes/");
});

test("el detector caza lo que debe: guardián sin fila, fila que cita un fichero inexistente, y solo mira la sección de la puerta", () => {
  const md = "# X\n## 3. La puerta\n| 1 | a | `a.test.js` |\n| 2 | c | `c.test.js` |\n## 4. Flujo\n| 9 | z | `b.test.js` |\n";
  assert.deepStrictEqual(filasDeLaPuerta(md), ["| 1 | a | `a.test.js` |", "| 2 | c | `c.test.js` |"]);
  const c = cuadra(["a.test.js", "b.test.js"], filasDeLaPuerta(md));
  assert.deepStrictEqual(c.sinFila, ["b.test.js"]);
  assert.deepStrictEqual(c.inexistentes, ["c.test.js"]);
});
