// Mundo interior SINTÉTICO de ejemplo para la v1.2 del contrato (contratos/mundo-interior.md §1c y §1d, ADR-0034): la misma sala
// de 8 × 6 × 3 m que modelos/interiores/ejemplo/, con la luz APARTE del color y piezas con eje que mueve el motor. Inventada e
// «ilustrativa»; la fábrica real va fuera del repo (decisión 227). Determinista: pruebas/guardianes/mundo_interior.test.js
// comprueba que da los mismos bytes y que pasa tuberia/interiores/valida.js.
//   - suelo y paredes: KHR_materials_unlit, albedo en mosaico (TEXCOORD_0, REPEAT) y el mapa de luz de la sala en
//     occlusionTexture con texCoord 1 (un atlas compartido: el suelo a la izquierda, las paredes a la derecha);
//   - rueda (giro) y rodillo (giro, hijo de la rueda: órbita + giro propio, relación con la rueda): material con luz (sin
//     unlit) y su oclusión propia en texCoord 1; los ilumina la sonda del manifiesto;
//   - correa (textura que corre, relación con la rueda) y pistón (vaivén): luz de la sala horneada en reposo.
//   node modelos/interiores/ejemplo-luz/genera.js [--salida <carpeta>]     (el mundo.json está escrito a mano)
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const { Document, NodeIO } = require("@gltf-transform/core");
const { KHRMaterialsUnlit } = require("@gltf-transform/extensions");

const X0 = -4, X1 = 4, Z0 = -6, Z1 = 0, ALTO = 3, PUERTA = 0.6, DINTEL = 2.2;

/** PNG RGB de w × h con el color de fn(x, y) → [r, g, b] (0-255); sin fechas ni metadatos: mismos bytes siempre */
function png(w, h, fn) {
  const tabla = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabla[n] = c >>> 0; }
  const crc = b => { let r = 0xffffffff; for (const x of b) r = tabla[(r ^ x) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const filas = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) filas.set(fn(x, y), y * (w * 3 + 1) + 1 + x * 3);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ih), trozo("IDAT", zlib.deflateSync(filas, { level: 9 })), trozo("IEND", Buffer.alloc(0))]));
}

/** un rectángulo (esquina o, ejes u y v en metros) con su UV de color (se repite cada `teja` metros) y su UV de luz (el rectángulo r del atlas) */
function quad(g, o, u, v, teja, r) {
  const b = g.pos.length / 3, lu = Math.hypot(...u), lv = Math.hypot(...v);
  for (const [a, c] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    g.pos.push(o[0] + a * u[0] + c * v[0], o[1] + a * u[1] + c * v[1], o[2] + a * u[2] + c * v[2]);
    g.uv0.push(a * lu / teja, c * lv / teja); g.uv1.push(r[0] + a * (r[2] - r[0]), r[1] + c * (r[3] - r[1]));
  }
  g.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
}
const geo = () => ({ pos: [], uv0: [], uv1: [], idx: [] });
function malla(doc, buf, nombre, g, mat) {
  const ac = (s, tipo, arr) => doc.createAccessor(nombre + "-" + s).setType(tipo).setArray(arr).setBuffer(buf);
  const p = doc.createPrimitive().setAttribute("POSITION", ac("pos", "VEC3", new Float32Array(g.pos)))
    .setAttribute("TEXCOORD_0", ac("uv0", "VEC2", new Float32Array(g.uv0))).setAttribute("TEXCOORD_1", ac("uv1", "VEC2", new Float32Array(g.uv1)))
    .setIndices(ac("idx", "SCALAR", new Uint16Array(g.idx))).setMaterial(mat);
  return doc.createMesh(nombre).addPrimitive(p);
}

function genera() {
  const doc = new Document(), buf = doc.createBuffer();
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  const tex = (nombre, w, h, fn) => doc.createTexture(nombre).setImage(png(w, h, fn)).setMimeType("image/png");
  // el mapa de luz de la sala: más claro cerca de la puerta (v alto); lineal, × escala 2 del manifiesto
  const luz = tex("luz_sala", 16, 16, (x, y) => { const k = Math.round(70 + 120 * (y / 15)); return [k, Math.round(k * 0.96), Math.round(k * 0.88)]; });
  const ao = tex("ao_rueda", 8, 8, (x, y) => { const k = Math.round(255 - 18 * Math.hypot(x - 3.5, y - 3.5)); return [k, k, k]; });
  const baldosa = tex("baldosa", 8, 8, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? [150, 110, 80] : [120, 86, 62]);
  const cuero = tex("cuero", 4, 8, (x, y) => y % 4 === 0 ? [70, 45, 25] : [110, 72, 40]);
  const conLuz = m => { m.setOcclusionTexture(luz); m.getOcclusionTextureInfo().setTexCoord(1); return m; };
  const mate = (nombre, rgb) => doc.createMaterial(nombre).setBaseColorFactor([...rgb, 1]).setDoubleSided(true).setExtension("KHR_materials_unlit", unlit.createUnlit());
  const suelo = conLuz(mate("suelo", [1, 1, 1]).setBaseColorTexture(baldosa));
  const pared = conLuz(mate("pared", [0.86, 0.82, 0.74]));
  const correa = conLuz(mate("correa", [1, 1, 1]).setBaseColorTexture(cuero));
  const laton = conLuz(mate("laton", [0.6, 0.5, 0.25]));
  const hierro = doc.createMaterial("hierro").setBaseColorFactor([0.3, 0.3, 0.32, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.5).setDoubleSided(true).setOcclusionTexture(ao);
  hierro.getOcclusionTextureInfo().setTexCoord(1);
  const W = X1 - X0, F = Z1 - Z0;
  let g = geo();
  quad(g, [X0, 0, Z0], [W, 0, 0], [0, 0, F], 1, [0, 0, 0.5, 1]);                                       // suelo (baldosa de 1 m)
  const nSuelo = doc.createNode("suelo").setMesh(malla(doc, buf, "suelo", g, suelo));
  g = geo();
  const L = [0.5, 0, 1, 1];
  quad(g, [X0, ALTO, Z0], [W, 0, 0], [0, 0, F], 1, L);                                                  // techo
  quad(g, [X0, 0, Z0], [W, 0, 0], [0, ALTO, 0], 1, L);                                                  // pared del fondo
  quad(g, [X0, 0, Z0], [0, 0, F], [0, ALTO, 0], 1, L);                                                  // pared oeste
  quad(g, [X1, 0, Z0], [0, 0, F], [0, ALTO, 0], 1, L);                                                  // pared este
  quad(g, [X0, 0, Z1], [-PUERTA - X0, 0, 0], [0, ALTO, 0], 1, L);                                       // pared de la puerta, izquierda
  quad(g, [PUERTA, 0, Z1], [X1 - PUERTA, 0, 0], [0, ALTO, 0], 1, L);                                    // pared de la puerta, derecha
  quad(g, [-PUERTA, DINTEL, Z1], [2 * PUERTA, 0, 0], [0, ALTO - DINTEL, 0], 1, L);                      // dintel
  const nParedes = doc.createNode("paredes").setMesh(malla(doc, buf, "paredes", g, pared));
  // la rueda: un aspa de dos tablas cruzadas que gira en torno a Z por su centro (el origen del nodo es el pivote)
  const r = 0.5, e = 0.08, A = [0, 0, 1, 1];
  g = geo(); quad(g, [-r, -e, 0], [2 * r, 0, 0], [0, 2 * e, 0], 1, A); quad(g, [-e, -r, 0.01], [2 * e, 0, 0], [0, 2 * r, 0], 1, A);
  const nRueda = doc.createNode("rueda").setMesh(malla(doc, buf, "rueda", g, hierro)).setTranslation([0, 1.6, Z0 + 0.3]);
  // el rodillo: cuelga de la rueda (da vueltas con ella: la órbita) y gira sobre su propio eje X
  g = geo(); quad(g, [-0.1, -0.05, 0], [0.2, 0, 0], [0, 0.1, 0], 1, A);
  const nRodillo = doc.createNode("rodillo").setMesh(malla(doc, buf, "rodillo", g, hierro)).setTranslation([0.4, 0, 0.05]);
  nRueda.addChild(nRodillo);
  // la correa: una tira vertical cuyo cuero corre hacia arriba
  g = geo(); quad(g, [-0.05, 0, 0], [0.1, 0, 0], [0, 1.2, 0], 0.4, [0.5, 0.9, 0.6, 1]);
  const nCorrea = doc.createNode("correa").setMesh(malla(doc, buf, "correa", g, correa)).setTranslation([1.5, 0.6, Z0 + 0.2]);
  // el pistón: una placa que sube y baja
  g = geo(); quad(g, [-0.2, 0, -0.2], [0.4, 0, 0], [0, 0, 0.4], 1, [0.9, 0.9, 1, 1]);
  const nPiston = doc.createNode("piston").setMesh(malla(doc, buf, "piston", g, laton)).setTranslation([-2, 0.3, -4]);
  doc.createScene("sala").addChild(nSuelo).addChild(nParedes).addChild(nRueda).addChild(nCorrea).addChild(nPiston);
  return doc;
}

async function bytes() { return new NodeIO().registerExtensions([KHRMaterialsUnlit]).writeBinary(genera()); }

module.exports = { bytes, png };
if (require.main === module) {
  const k = process.argv.indexOf("--salida"), dir = k > 0 ? process.argv[k + 1] : __dirname;
  bytes().then(b => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "sala.glb"), Buffer.from(b)); console.log("sala.glb: " + b.length + " bytes"); });
}
