"use strict";
// Guardián de las versiones fijadas (regla 12 de CLAUDE.md, MU1-14 / A1-16): toda dependencia de cada package.json del
// repo lleva versión exacta (sin ^, ~, *, latest, rangos ni x), y toda línea de requirements*.txt usa ==. Lo que aún no
// cumple y se conoce va en PENDIENTES: solo puede bajar (si se fija, sale de la lista; si es nuevo, falla).
// Solo Node: lee ficheros, no instala nada.
const test = require("node:test"), assert = require("node:assert");
const { ficheros, lee } = require("./_util");

const EXACTA = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;   // 1.2.3 o 2.0.0-dev.3.10
const ALIAS = /^npm:(@?[^@\s]+)@(.+)$/;               // npm:three@0.128.0 (la versión del alias también ha de ser exacta)
const REQ = /^([A-Za-z0-9][A-Za-z0-9._-]*)==(\d+(?:\.\d+)*)$/;

/** Dependencias sin fijar que se conocen (clave «fichero · paquete»). Sin package-lock que las resuelva: se anotan, no se tocan. */
const PENDIENTES = [
  "requirements.txt · rasterio",
  "requirements.txt · matplotlib"
];

/** Error de una versión de package.json, o null si está fijada. */
function revisaVersion(v) {
  if (typeof v !== "string") return "no es texto";
  const a = ALIAS.exec(v);
  return EXACTA.test(a ? a[2] : v) ? null : "«" + v + "» no es una versión exacta (x.y.z)";
}

/** Error de una línea de requirements (sin comentarios), o null si está vacía o fijada con ==. */
function revisaRequisito(linea) {
  const l = linea.replace(/#.*$/, "").trim();
  if (!l) return null;
  return REQ.test(l) ? null : "«" + l + "» no usa == con versión exacta";
}

/** Recorre los ficheros: devuelve las infracciones (clave y error) y cuántas dependencias miró. */
function revisa(lista) {
  const malas = [];
  let miradas = 0;
  for (const f of lista) {
    if (/(^|\/)package\.json$/.test(f)) {
      const p = JSON.parse(lee(f));
      for (const sec of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])
        for (const [n, v] of Object.entries(p[sec] || {})) {
          miradas++;
          const e = revisaVersion(v);
          if (e) malas.push({ clave: f + " · " + n, error: e });
        }
    } else if (/(^|\/)requirements[^/]*\.txt$/.test(f)) {
      for (const l of lee(f).split("\n")) {
        const e = revisaRequisito(l);
        const sin = l.replace(/#.*$/, "").trim();
        if (sin) miradas++;
        if (e) malas.push({ clave: f + " · " + (sin.split(/[=<>~!\s]/)[0] || "?"), error: e });
      }
    }
  }
  return { malas, miradas };
}

/** Lo que cambió respecto a PENDIENTES: infracciones nuevas y pendientes ya resueltas. */
function compara(malas, pendientes) {
  const claves = malas.map(m => m.clave);
  return {
    nuevas: malas.filter(m => !pendientes.includes(m.clave)),
    resueltas: pendientes.filter(p => !claves.includes(p))
  };
}

test("toda dependencia de cada package.json va con versión exacta y toda línea de requirements*.txt usa ==", () => {
  const { malas, miradas } = revisa(ficheros());
  assert.ok(miradas >= 100, "pocas dependencias miradas (" + miradas + "): el detector quizá no ve los ficheros");
  const c = compara(malas, PENDIENTES);
  assert.deepStrictEqual(c.nuevas.map(m => m.clave + ": " + m.error), [], "dependencias sin versión fija (fíjala a la que resuelve su package-lock, o anótala aquí si no hay lock)");
  assert.deepStrictEqual(c.resueltas, [], "ya están fijadas: quítalas de PENDIENTES en versiones.test.js");
});

test("el detector caza versiones sin fijar y deja pasar las fijadas (también los alias y las preversiones)", () => {
  for (const v of ["^1.0.0", "~1.0.0", "*", "latest", ">=1.0.0", "1.x", "", "npm:three@^0.128.0"]) assert.ok(revisaVersion(v), "debía fallar: «" + v + "»");
  for (const v of ["0.186.1", "2.0.0-dev.3.10", "npm:three@0.128.0"]) assert.strictEqual(revisaVersion(v), null, "debía pasar: «" + v + "»");
  assert.ok(revisaRequisito("rasterio"), "sin versión");
  assert.ok(revisaRequisito("numpy>=2"), "rango");
  assert.ok(revisaRequisito("numpy==2.*"), "comodín");
  assert.strictEqual(revisaRequisito("numpy==2.5.3   # nota"), null);
  assert.strictEqual(revisaRequisito("# solo un comentario"), null);
  const c = compara([{ clave: "a · b", error: "x" }, { clave: "a · c", error: "x" }], ["a · c", "a · d"]);
  assert.deepStrictEqual(c.nuevas.map(m => m.clave), ["a · b"]);
  assert.deepStrictEqual(c.resueltas, ["a · d"]);
});
