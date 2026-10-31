"use strict";
// PB6: reintento único y marcado de fallos de infraestructura con firma conocida; lo desconocido nunca se reintenta. Ejecutor falso, sin Chrome ni Docker.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const ine = require("../banco/inestables");

const firmas = ine.cargaFirmas();
const ahora = () => new Date("2026-10-30T10:00:00Z");
// falso: la 1.ª pasada falla con los fallos dados; el reintento de un fichero pasa o no según `alReintento`
function falso(fallos, alReintento) {
  const llamadas = [];
  return { llamadas, ejecuta: async ficheros => {
    llamadas.push(ficheros);
    if (!ficheros) return { codigo: fallos.length ? 1 : 0, fallos };
    return { codigo: alReintento ? 0 : 1, fallos: [] };
  } };
}

test("las firmas versionadas tienen motivo y tarea, y casan con los casos reales", () => {
  assert.ok(firmas.length >= 3);
  assert.equal(ine.casa("Error: Health check not healthy after 120000ms", firmas).id, "postgis-arranque");
  assert.equal(ine.casa("EPERM: operation not permitted, rename 'a' -> 'b'", firmas).id, "eperm-antivirus");
  assert.equal(ine.casa("browserContext.newPage: Page crashed", firmas).id, "chrome-sin-memoria");
  assert.equal(ine.casa("AssertionError: 3 !== 4", firmas), null);
});

for (const f of firmas) {
  test("firma " + f.id + ": pasa al segundo intento, se marca y cuenta como pasada", async () => {
    const msg = f.id === "postgis-arranque" ? "Health check not healthy after 120000ms" : f.id === "eperm-antivirus" ? "EPERM: rename x" : "Page crashed";
    const r = falso([{ file: "/p/a.test.js", name: "t", mensaje: msg }], true);
    const res = await ine.orquesta({ ejecuta: r.ejecuta, firmas, ahora });
    assert.equal(res.codigo, 0);
    assert.equal(res.pasaronAlReintento.length, 1);
    assert.deepEqual(r.llamadas, [null, ["/p/a.test.js"]]);
    assert.equal(res.entradas[0].reintento, "pasó");
    assert.match(ine.informe(res, []), /pasó al segundo intento: .*/);
  });
}

test("firma conocida que vuelve a fallar: sigue en rojo y se reintenta una sola vez", async () => {
  const r = falso([{ file: "/p/a.test.js", name: "t", mensaje: "Page crashed" }], false);
  const res = await ine.orquesta({ ejecuta: r.ejecuta, firmas, ahora });
  assert.equal(res.codigo, 1);
  assert.equal(r.llamadas.length, 2);
  assert.equal(res.entradas[0].reintento, "falló");
});

test("fallo desconocido: no se reintenta nunca", async () => {
  const r = falso([{ file: "/p/b.test.js", name: "t", mensaje: "AssertionError: 1 !== 2" }], true);
  const res = await ine.orquesta({ ejecuta: r.ejecuta, firmas, ahora });
  assert.equal(res.codigo, 1);
  assert.deepEqual(r.llamadas, [null]);
  assert.equal(res.entradas[0].reintento, "no se reintenta");
});

test("un fichero con un fallo conocido y otro desconocido no se reintenta (no se tapa nada)", async () => {
  const r = falso([{ file: "/p/c.test.js", name: "a", mensaje: "Page crashed" }, { file: "/p/c.test.js", name: "b", mensaje: "boom" }], true);
  const res = await ine.orquesta({ ejecuta: r.ejecuta, firmas, ahora });
  assert.equal(res.codigo, 1);
  assert.deepEqual(r.llamadas, [null]);
});

test("sin fallos: código 0, nada que registrar; código ≠ 0 sin fallos recogidos sigue siendo rojo", async () => {
  assert.equal((await ine.orquesta({ ejecuta: falso([], true).ejecuta, firmas, ahora })).codigo, 0);
  const res = await ine.orquesta({ ejecuta: async () => ({ codigo: 1, fallos: [] }), firmas, ahora });
  assert.equal(res.codigo, 1);
});

test("el registro se acumula y el informe dice desde cuándo falla", async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ine-")), "inestables.json");
  const r = () => falso([{ file: "/p/a.test.js", name: "t", mensaje: "Page crashed" }], true);
  const res1 = await ine.orquesta({ ejecuta: r().ejecuta, firmas, ahora: () => new Date("2026-10-01T00:00:00Z") });
  ine.apunta(res1.entradas, f);
  const res2 = await ine.orquesta({ ejecuta: r().ejecuta, firmas, ahora });
  const reg = ine.leeRegistro(f);
  assert.equal(reg.length, 1);
  assert.deepEqual(Object.keys(reg[0]).sort(), ["fecha", "motivo", "prueba", "reintento"]);
  assert.match(ine.informe(res2, reg), /desde 2026-10-01 \(1 registros\)/);
  ine.apunta(res2.entradas, f);
  assert.equal(ine.leeRegistro(f).length, 2);
});

test("el reporter de node:test recoge fallos reales (proceso hijo, sin Chrome)", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "rep-"));
  fs.writeFileSync(path.join(d, "x.test.js"), 'require("node:test")("falla", () => { throw new Error("Page crashed"); });');
  const salida = path.join(d, "f.json");
  spawnSync(process.execPath, ["--test", "--test-reporter=" + require("url").pathToFileURL(path.join(__dirname, "../banco/reporter_fallos.js")).href, "--test-reporter-destination=" + salida, path.join(d, "x.test.js")], { env: entornoLimpio() });
  const fallos = JSON.parse(fs.readFileSync(salida, "utf8"));
  assert.equal(fallos.length, 1);
  assert.equal(fallos[0].name, "falla");
  assert.ok(ine.casa(fallos[0].mensaje, firmas));
});

// un node --test lanzado desde dentro de otro hereda NODE_TEST_CONTEXT y se comporta como hijo (sin reporters): se quita
function entornoLimpio() { const e = Object.assign({}, process.env); delete e.NODE_TEST_CONTEXT; return e; }
