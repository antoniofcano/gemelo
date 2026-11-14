// Mundo interior SINTÉTICO de ejemplo para la v1.3 del contrato (contratos/mundo-interior.md §2b, ADR-0035): la sala de modelos/interiores/ejemplo-luz/
// (luz aparte y máquinas) comprimida con la tubería de verdad, tuberia/interiores/blender/comprime.mjs: la geometría con meshopt y las texturas en KTX2
// (ETC1S con sus mipmaps), con las mallas de las máquinas bajadas a un hijo para que su pivote no se mueva. Inventada e «ilustrativa»; la fábrica real
// va fuera del repo (decisión 227). Determinista: pruebas/guardianes/mundo_interior_comprimido.test.js comprueba que da los mismos bytes (si la tubería
// tiene sus dependencias: cd tuberia/interiores/blender && npm ci) y que pasa tuberia/interiores/valida.js.
//   node modelos/interiores/ejemplo-comprimido/genera.js [--salida <carpeta>]     (el mundo.json es el de ejemplo-luz con otro id y otro nombre)
"use strict";
const fs = require("fs"), path = require("path");
const { pathToFileURL } = require("url");
const { bytes: sala } = require(path.join(__dirname, "..", "ejemplo-luz", "genera.js"));
const COMPRIME = path.join(__dirname, "..", "..", "..", "tuberia", "interiores", "blender", "comprime.mjs");

async function bytes() {
  const { comprime } = await import(pathToFileURL(COMPRIME).href);
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, "mundo.json"), "utf8"));
  const { bytes: b } = await comprime(await sala(), { protege: man.maquinas.map(m => m.nodo) });
  return b;
}

module.exports = { bytes };
if (require.main === module) {
  const k = process.argv.indexOf("--salida"), dir = k > 0 ? process.argv[k + 1] : __dirname;
  bytes().then(b => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "sala.glb"), Buffer.from(b)); console.log("sala.glb: " + b.length + " bytes"); });
}
