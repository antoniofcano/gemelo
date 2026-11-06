"use strict";
// Cerro Velasco sale del mundo (decisión 229, Antonio, 2026-11-06: sus datos están desactualizados y la finca ya no es de la explotación;
// Hituelo es el único mundo, decisión 22). En Node, sin navegador: ningún fichero de apps/web/ (motor, plantilla, herramientas, oficina,
// portada, src…) ni de la tubería de datos reales vuelve a nombrarla, y la rama `--finca cerro` del exportador no vuelve.
// El fixture SINTÉTICO que aún se llama «cerro» (pruebas/genera_fixture.py, pruebas/salida/fixture/cerro/) no es la finca: lo renombra C2
// en la ronda del banco, y por eso pruebas/ queda fuera de este guardián.
const test = require("node:test"), assert = require("node:assert");
const { lee, ficheros, esTexto } = require("./_util");

// El nombre, por partes para que el guardián no se marque a sí mismo; \b deja fuera «geometricError» (…cErro…).
const NOMBRE = new RegExp("\\b(?:" + "cer" + "ro|vel" + "asco)\\b", "i");
// Menciones históricas permitidas: fichero → por qué. Hoy no hay ninguna; si hiciera falta una, va aquí con su motivo.
const PERMITIDAS = {};

const ZONAS = /^(apps\/web\/|tuberia\/)/;
const FUERA = /(^|\/)(node_modules|dist|\.generado)\//;

/** las líneas de un texto que nombran a la finca */
const menciones = s => s.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => NOMBRE.test(l));

test("el detector caza el nombre y no lo que solo se le parece", () => {
  for (const s of ["La finca " + "Cer" + "ro Velasco", "finca_id=\"" + "cer" + "ro\"", "datos/" + "cer" + "ro/", "VEL" + "ASCO"]) assert.ok(NOMBRE.test(s), "debería marcarse: " + s);
  for (const s of ["geometricError: 4", "cerrojo", "el cerrado", "acerro"]) assert.ok(!NOMBRE.test(s), "no debería marcarse: " + s);
});

test("ni apps/web/ ni la tubería nombran a la finca que salió del mundo (decisión 229)", () => {
  const mal = [];
  for (const f of ficheros().filter(f => ZONAS.test(f) && !FUERA.test(f) && esTexto(f) && !PERMITIDAS[f])) {
    for (const [n, l] of menciones(lee(f))) mal.push(f + ":" + n + " " + l.trim().slice(0, 120));
  }
  assert.deepStrictEqual(mal, [], "la finca que salió del mundo vuelve a aparecer (decisión 229; el fixture sintético vive en pruebas/):\n" + mal.join("\n"));
});

test("la tubería de datos reales ya no tiene la carpeta ni la rama de esa finca", () => {
  const fs = require("node:fs"), path = require("node:path"), { RAIZ } = require("./_util");
  assert.ok(!fs.existsSync(path.join(RAIZ, "tuberia", "datos", "cer" + "ro")), "tuberia/datos/<finca que salió> no debe volver");
  assert.doesNotMatch(lee("tuberia/finca_8_teselas.py"), /choices=\[[^\]]*"cer/, "el exportador solo ofrece --finca hituelo");
});
