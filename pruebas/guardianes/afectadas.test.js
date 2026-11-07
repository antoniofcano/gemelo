"use strict";
// PB4: el selector `npm run puerta:afectadas` (pruebas/banco/afectadas.js). Solo Node: listas de ficheros cambiados simuladas, sin git ni Chrome.
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const path = require("path");
const A = require("../banco/afectadas");
const RAIZ = path.join(__dirname, "..", "..");

// Mundo sintético: dos módulos del cliente y varias pruebas (A3-8c: sin motor/ ni sus cabeceras, ya no hay grafo de consumidores que seguir).
const refs = {
  sintaxis: new Set(["apps/web/src/arranque.ts"]),
  higiene: new Set(["apps/api"]),
  secretos: new Set(["pruebas/guardianes"]),
  documentacion: new Set(["doc"]),
  contratos: new Set(["contratos", "apps/web/src/arranque.ts"]),
  api: new Set(["apps/api", "contratos/api.openapi.yaml"]),
  solo_a: new Set(["apps/web/src/a.ts"]),
  solo_c: new Set(["apps/web/src/c.ts"]),
  tuberia_x: new Set(["tuberia/x.py"]),
};
const elige = cambiados => A.selecciona({ cambiados, refs });
const nombres = r => [...r.pruebas.keys()].sort();
const BARATOS = ["contratos", "documentacion", "higiene", "secretos", "sintaxis"];

test("un cambio en un módulo del cliente elige las pruebas que lo nombran, y solo esas", () => {
  const r = elige(["apps/web/src/a.ts"]);
  assert.equal(r.todo, false);
  assert.ok(r.pruebas.has("solo_a") && !r.pruebas.has("solo_c"));
  assert.ok(!r.pruebas.has("tuberia_x") && !r.pruebas.has("api"));
  assert.ok(elige(["apps/web/src/arranque.ts"]).pruebas.has("sintaxis"), "el arranque elige a quien lo lee");
});

test("un cambio en contratos/ elige contratos y api", () => {
  const r = elige(["contratos/haza.schema.json"]);
  assert.equal(r.todo, false);
  assert.ok(r.pruebas.has("contratos") && r.pruebas.has("api"));
  assert.ok(!r.pruebas.has("solo_a"));
});

test("apps/api elige api; doc/ elige documentacion", () => {
  assert.ok(elige(["apps/api/src/app.ts"]).pruebas.has("api"));
  const d = elige(["doc/sistema/CONTRATOS.md"]);
  assert.equal(d.todo, false);
  assert.deepEqual(nombres(d), BARATOS);
});

test("un fichero desconocido, o un package*.json, eligen todo", () => {
  const u = elige(["algo/raro.bin"]);
  assert.equal(u.todo, true);
  assert.match(u.motivoTodo, /nadie lo reconoce/);
  const p = elige(["apps/web/package.json"]);
  assert.equal(p.todo, true);
  assert.match(p.motivoTodo, /package/);
  assert.equal(elige(["package-lock.json"]).todo, true);
});

test("los baratos de proceso entran siempre, también sin cambios; el CHANGELOG no cambia nada", () => {
  assert.deepEqual(nombres(elige([])), BARATOS);
  const r = elige(["CHANGELOG.md"]);
  assert.equal(r.todo, false);
  assert.deepEqual(nombres(r), BARATOS);
});

test("una prueba tocada, o un script que ella importa, la eligen a ella", () => {
  const r = elige(["tuberia/x.py"]);
  assert.deepEqual(nombres(r), BARATOS.concat("tuberia_x").sort());
});

test("rutasDelTexto: literales y path.join, y no la prosa de los comentarios", () => {
  const rs = A.rutasDelTexto('const a = lee("contratos/indice.schema.json"); const m = path.join(WEB, "src", "arranque.ts"); const t = join(RAIZ, "tuberia", "tiles3d");');
  assert.ok(rs.has("contratos/indice.schema.json") && rs.has("apps/web/src/arranque.ts") && rs.has("tuberia/tiles3d"));
  assert.ok(!A.rutasDelTexto('const WEB = "apps/web";').has("apps/web"), "apps/web a secas es demasiado ancho");
});

test("el repo real: un cambio en el arranque elige a sintaxis y a las pruebas que leen sus pasos; el CLI --lista no ejecuta nada", () => {
  const r = spawnSync(process.execPath, ["pruebas/banco/afectadas.js", "--lista", "--cambiados", "apps/web/src/arranque.ts"], { cwd: RAIZ, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const p of ["sintaxis", "agenda_mundo", "arranque", "documentacion"]) assert.match(r.stdout, new RegExp("^  " + p + ":", "m"));
  assert.match(r.stdout, /NO autoriza a subir/);
  const t = spawnSync(process.execPath, ["pruebas/banco/afectadas.js", "--lista", "--cambiados", "algo/raro.bin"], { cwd: RAIZ, encoding: "utf8" });
  assert.match(t.stdout, /Elige TODAS/);
});

test("pruebas/banco/afectadas.json: los baratos y las pruebas de las reglas y el mapa existen como guardianes", () => {
  const fs = require("fs");
  const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas/banco/afectadas.json"), "utf8"));
  const hay = new Set(Object.keys(A.refsDeGuardianes()));
  const pedidas = [].concat(datos.baratos, ...datos.reglas.map(r => r.pruebas), Object.keys(datos.mapa));
  for (const p of pedidas) assert.ok(hay.has(p), "no existe pruebas/guardianes/" + p + ".test.js");
});
