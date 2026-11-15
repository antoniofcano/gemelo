"use strict";
// renombraConReintento (_pagina.js): reintenta el renombrado de la caché solo ante EPERM/EBUSY/EACCES. Sin Chrome: se simula fs.renameSync.
const test = require("node:test"), assert = require("node:assert");
const { renombraConReintento } = require("./_pagina");
const { fs, path, os } = require("./_util");

function conRenameSimulado(fallos, codigo, fn) {
  const original = fs.renameSync;
  let llamadas = 0;
  fs.renameSync = (de, a) => {
    llamadas++;
    if (llamadas <= fallos) { const e = new Error("simulado " + codigo); e.code = codigo; throw e; }
    return original(de, a);
  };
  try { return fn(() => llamadas); } finally { fs.renameSync = original; }
}

test("reintenta EPERM y acaba renombrando cuando el antivirus suelta la carpeta", () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo_reintento_"));
  try {
    const de = path.join(t, "tmp"), a = path.join(t, "dest");
    fs.mkdirSync(de); fs.writeFileSync(path.join(de, "LISTO"), "x");
    conRenameSimulado(2, "EPERM", llamadas => {
      renombraConReintento(de, a);
      assert.strictEqual(llamadas(), 3, "dos fallos y un éxito = 3 intentos");
    });
    assert.ok(fs.existsSync(path.join(a, "LISTO")), "el renombrado debe haber llegado al destino");
    assert.ok(!fs.existsSync(de));
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test("si el error transitorio no se va, lanza el error original tras 5 intentos", () => {
  conRenameSimulado(99, "EBUSY", llamadas => {
    assert.throws(() => renombraConReintento("x", "y"), err => err.code === "EBUSY");
    assert.strictEqual(llamadas(), 5, "5 intentos en total");
  });
});

test("un error que no es transitorio se lanza al momento, sin reintentar", () => {
  conRenameSimulado(99, "ENOENT", llamadas => {
    assert.throws(() => renombraConReintento("x", "y"), err => err.code === "ENOENT");
    assert.strictEqual(llamadas(), 1, "sin reintento");
  });
});

// La huella de la caché de páginas (montaPagina) incluye el constructor de olivos, que Vite mete en la página: sin él, un cambio en
// apps/web/olivo (p. ej. la geometría de las tarjetas, C-01 de la auditoría del constructor) se probaba con la página vieja de la caché.
test("la huella de la página cambia si cambia un fuente del constructor de olivos", t => {
  const { huellaCodigo, WEB } = require("./_pagina");
  if (!fs.existsSync(path.join(WEB, "olivo", "node_modules", "three-gen", "package.json"))) return t.skip("apps/web/olivo sin instalar: la página no lleva el constructor");
  const crypto = require("crypto"), d = () => huellaCodigo(crypto.createHash("sha256")).digest("hex");
  const a = d(), objetivo = path.join(WEB, "olivo", "tarjetas.js"), original = fs.readFileSync;
  fs.readFileSync = function (p, ...r) { const v = original.call(this, p, ...r); return path.resolve(String(p)) === objetivo ? Buffer.concat([Buffer.from(v), Buffer.from("// cambio")]) : v; };
  let b; try { b = d(); } finally { fs.readFileSync = original; }
  assert.notStrictEqual(a, b, "la huella no cambia con apps/web/olivo/tarjetas.js");
  assert.strictEqual(d(), a, "determinista");
});
