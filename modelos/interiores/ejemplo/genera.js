// Mundo interior SINTÉTICO de ejemplo (contratos/mundo-interior.md): una sala de 8 × 6 × 3 m con su puerta en el origen y una rueda
// que gira, inventada e «ilustrativa». Solo da al contrato un ejemplo pequeño que cumple sus reglas; la bodega y la fábrica reales
// son modelos de Antonio que van fuera del repo (decisión 227). El glb lo escribe @gltf-transform (versión fijada en package.json);
// determinista: pruebas/guardianes/mundo_interior.test.js comprueba que da los mismos bytes y que pasa tuberia/interiores/valida.js.
//   node modelos/interiores/ejemplo/genera.js [--salida <carpeta>]      (por defecto, esta misma carpeta; el mundo.json está escrito a mano)
"use strict";
const fs = require("fs"), path = require("path");
const { Document, NodeIO } = require("@gltf-transform/core");
const { KHRMaterialsUnlit } = require("@gltf-transform/extensions");

const X0 = -4, X1 = 4, Z0 = -6, Z1 = 0, ALTO = 3, PUERTA = 0.6, DINTEL = 2.2;

/** un rectángulo como dos triángulos: esquina, eje u y eje v (los tres en metros) */
function quad(pos, idx, o, u, v) {
  const b = pos.length / 3;
  for (const [a, c] of [[0, 0], [1, 0], [1, 1], [0, 1]]) pos.push(o[0] + a * u[0] + c * v[0], o[1] + a * u[1] + c * v[1], o[2] + a * u[2] + c * v[2]);
  idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
}
function pieza(doc, buf, nombre, pos, idx, mat) {
  const p = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor(nombre + "-pos").setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buf))
    .setIndices(doc.createAccessor(nombre + "-idx").setType("SCALAR").setArray(new Uint16Array(idx)).setBuffer(buf))
    .setMaterial(mat);
  return doc.createNode(nombre).setMesh(doc.createMesh(nombre).addPrimitive(p));
}

function genera() {
  const doc = new Document(), buf = doc.createBuffer();
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  const mate = (nombre, rgb) => doc.createMaterial(nombre).setBaseColorFactor([...rgb, 1]).setDoubleSided(true).setExtension("KHR_materials_unlit", unlit.createUnlit());
  const suelo = mate("suelo", [0.45, 0.36, 0.27]), pared = mate("pared", [0.86, 0.82, 0.74]), madera = mate("madera", [0.42, 0.27, 0.15]);
  const W = X1 - X0, F = Z1 - Z0;
  let p = [], i = [];
  quad(p, i, [X0, 0, Z0], [W, 0, 0], [0, 0, F]);                                  // suelo
  const nSuelo = pieza(doc, buf, "suelo", p, i, suelo);
  p = []; i = [];
  quad(p, i, [X0, ALTO, Z0], [W, 0, 0], [0, 0, F]);                               // techo
  quad(p, i, [X0, 0, Z0], [W, 0, 0], [0, ALTO, 0]);                               // pared del fondo
  quad(p, i, [X0, 0, Z0], [0, 0, F], [0, ALTO, 0]);                               // pared oeste
  quad(p, i, [X1, 0, Z0], [0, 0, F], [0, ALTO, 0]);                               // pared este
  quad(p, i, [X0, 0, Z1], [-PUERTA - X0, 0, 0], [0, ALTO, 0]);                    // pared de la puerta, a la izquierda
  quad(p, i, [PUERTA, 0, Z1], [X1 - PUERTA, 0, 0], [0, ALTO, 0]);                 // pared de la puerta, a la derecha
  quad(p, i, [-PUERTA, DINTEL, Z1], [2 * PUERTA, 0, 0], [0, ALTO - DINTEL, 0]);   // dintel
  const nParedes = pieza(doc, buf, "paredes", p, i, pared);
  p = []; i = [];
  const r = 0.5, e = 0.08;                                                        // la rueda: un aspa de dos tablas cruzadas
  quad(p, i, [-r, -e, 0], [2 * r, 0, 0], [0, 2 * e, 0]);
  quad(p, i, [-e, -r, 0.01], [2 * e, 0, 0], [0, 2 * r, 0]);
  const nRueda = pieza(doc, buf, "rueda", p, i, madera).setTranslation([0, 1.6, Z0 + 0.3]);
  doc.createScene("sala").addChild(nSuelo).addChild(nParedes).addChild(nRueda);
  const t = new Float32Array([0, 1, 2, 3, 4]), q = [];
  for (let k = 0; k < 5; k++) { const a = k * Math.PI / 4; q.push(0, 0, Math.round(Math.sin(a) * 1e6) / 1e6, Math.round(Math.cos(a) * 1e6) / 1e6); }   // media vuelta cada 4 s en torno a Z
  const muestras = doc.createAnimationSampler().setInput(doc.createAccessor("rueda-t").setArray(t).setBuffer(buf))
    .setOutput(doc.createAccessor("rueda-q").setType("VEC4").setArray(new Float32Array(q)).setBuffer(buf)).setInterpolation("LINEAR");
  doc.createAnimation("rueda-gira").addSampler(muestras).addChannel(doc.createAnimationChannel().setTargetNode(nRueda).setTargetPath("rotation").setSampler(muestras));
  return doc;
}

async function bytes() { return new NodeIO().registerExtensions([KHRMaterialsUnlit]).writeBinary(genera()); }

module.exports = { bytes };
if (require.main === module) {
  const k = process.argv.indexOf("--salida"), dir = k > 0 ? process.argv[k + 1] : __dirname;
  bytes().then(b => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "sala.glb"), Buffer.from(b)); console.log("sala.glb: " + b.length + " bytes"); });
}
