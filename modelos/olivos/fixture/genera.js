// Catálogo SINTÉTICO de olivos-tipo (contratos/olivos-tipo.md): un tipo inventado, «ilustrativo», con sus tres niveles en glb.
// El glb lo escribe @gltf-transform/core (versión fijada en package.json); este script solo da la forma. Determinista (mismos bytes en cada
// ejecución): lo comprueba pruebas/guardianes/olivos.test.js, que además pasa cada glb por el validador oficial de Khronos (gltf-validator).
//   node modelos/olivos/fixture/genera.js [--salida <carpeta>]      (por defecto, esta misma carpeta)
// No es el constructor de olivos-tipo (va aparte): solo da al contrato un ejemplo pequeño que cumple sus reglas
// (metros, +Y arriba, pivote en la base del tronco, sin luces ni cámaras, un material por pieza, presupuesto de triángulos por nivel).
"use strict";
const fs = require("fs"), path = require("path");
const { Document, NodeIO } = require("@gltf-transform/core");

const r3 = v => Math.round(v * 1000) / 1000;   // milímetros: bytes estables

/** una pieza = { nombre, pos: [x,y,z…], idx: [a,b,c…], material } con cada triángulo orientado hacia fuera (dir(centroide) da el «fuera») */
function orienta(pos, idx, dir) {
  for (let q = 0; q < idx.length; q += 3) {
    const P = k => [pos[3 * idx[k]], pos[3 * idx[k] + 1], pos[3 * idx[k] + 2]], a = P(q), b = P(q + 1), c = P(q + 2);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], d = dir(cen, q / 3);
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; }
  }
}
/** copa en vaso: anillos × lados (abierta por abajo y cerrada con un casquete si tapa), de cb a alto, radio R, algo lobulada */
function copa(anillos, lados, R, cb, alto, tapa) {
  const pos = [], idx = [], th0 = 0.62, y0 = (1 - Math.cos(th0)) / 2;
  for (let i = 0; i <= anillos; i++) {
    const th = th0 + (Math.PI - th0) * i / anillos, s = Math.sin(th), yy = ((1 - Math.cos(th)) / 2 - y0) / (1 - y0);
    for (let j = 0; j < lados; j++) {
      const ph = j / lados * 2 * Math.PI, m = 1 + 0.12 * Math.sin(3 * ph + 1.3) * s + 0.06 * Math.sin(5 * ph + 0.4);
      pos.push(r3(Math.cos(ph) * s * R * m), r3(cb + yy * (alto - cb)), r3(Math.sin(ph) * s * R * m));
    }
  }
  for (let i = 0; i < anillos; i++) for (let j = 0; j < lados; j++) {
    const a = i * lados + j, b = i * lados + (j + 1) % lados, c = a + lados, d = b + lados; idx.push(a, c, b, b, c, d);
  }
  const nLado = idx.length / 3;
  if (tapa) { const cen = pos.length / 3; pos.push(0, r3(cb + 0.02), 0); for (let j = 0; j < lados; j++) idx.push(cen, j, (j + 1) % lados); }
  orienta(pos, idx, (c, t) => t < nLado ? [c[0], c[1] - cb, c[2]] : [0, -1, 0]);
  return { nombre: "copa", pos, idx };
}
/** tronco de «pies» tubos (lados × tramos) que salen juntos de la base (y = 0) y se abren hacia la copa, hasta la altura alto */
function tronco(pies, lados, tramos, alto, r0, r1) {
  const pos = [], idx = [], ejes = [];
  for (let p = 0; p < pies; p++) {
    const an = 0.7 + p / pies * 2 * Math.PI, base = pos.length / 3, dx = Math.cos(an) * 0.45, dz = Math.sin(an) * 0.45;
    for (let t = 0; t <= tramos; t++) {
      const f = t / tramos, cx = dx * f * f, cz = dz * f * f, y = alto * f, r = r0 + (r1 - r0) * f;
      for (let j = 0; j < lados; j++) { const a = j / lados * 2 * Math.PI + p; pos.push(r3(cx + Math.cos(a) * r), r3(y), r3(cz + Math.sin(a) * r)); }
    }
    for (let t = 0; t < tramos; t++) for (let j = 0; j < lados; j++) {
      const a = base + t * lados + j, b = base + t * lados + (j + 1) % lados, c = a + lados, d = b + lados; idx.push(a, b, c, b, d, c); ejes.push([dx, dz], [dx, dz]);
    }
  }
  // «fuera» = del eje del pie (parábola de la base a su punta) al centroide
  orienta(pos, idx, (c, t) => { const [dx, dz] = ejes[t], f = Math.max(0, Math.min(1, c[1] / alto)); return [c[0] - dx * f * f, 0, c[2] - dz * f * f]; });
  return { nombre: "tronco", pos, idx };
}

/** glb (glTF 2.0) con una malla, una primitiva y un nodo por pieza; POSITION e índices u16; un material por pieza; sin luces, cámaras ni texturas.
 *  Sin NORMAL: el contrato la deja opcional y el motor la calcula (Catalogo.instala). */
async function glb(piezas) {
  const doc = new Document(), buf = doc.createBuffer(), escena = doc.createScene("olivo"), mats = {};
  doc.getRoot().getAsset().generator = "gemelo modelos/olivos/fixture/genera.js (sintético) con glTF-Transform";
  const COLOR = { copa: [0.36, 0.42, 0.27, 1], tronco: [0.38, 0.31, 0.24, 1] };
  for (const p of piezas) {
    const mat = mats[p.nombre] || (mats[p.nombre] = doc.createMaterial(p.nombre).setBaseColorFactor(COLOR[p.nombre]).setMetallicFactor(0).setRoughnessFactor(1));
    const pos = doc.createAccessor(p.nombre + "_pos").setType("VEC3").setArray(new Float32Array(p.pos)).setBuffer(buf);
    const idx = doc.createAccessor(p.nombre + "_idx").setType("SCALAR").setArray(new Uint16Array(p.idx)).setBuffer(buf);
    const prim = doc.createPrimitive().setAttribute("POSITION", pos).setIndices(idx).setMaterial(mat);
    escena.addChild(doc.createNode(p.nombre).setMesh(doc.createMesh(p.nombre).addPrimitive(prim)));
  }
  doc.getRoot().setDefaultScene(escena);
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

// el tipo 0: olivo en vaso de 4 m con copa de 2 m de radio sobre 3 pies (L0), 2 pies (L1) y solo la masa de la copa (L2)
const ALTO = 4.0, RADIO = 2.0, CB = 1.0;
const NIVELES = {
  L0: [copa(10, 24, RADIO, CB, ALTO, true), tronco(3, 6, 4, CB + 0.6, 0.16, 0.08)],
  L1: [copa(6, 10, RADIO, CB, ALTO, true), tronco(2, 5, 1, CB + 0.5, 0.15, 0.08)],
  L2: [copa(2, 7, RADIO, CB, ALTO, false)],
};

async function genera(salida) {
  fs.mkdirSync(salida, { recursive: true });
  const niveles = {};
  for (const [nv, piezas] of Object.entries(NIVELES)) {
    const f = "olivo_0_" + nv + ".glb";
    fs.writeFileSync(path.join(salida, f), await glb(piezas));
    niveles[nv] = { glb: f, triangulos: piezas.reduce((s, p) => s + p.idx.length / 3, 0), piezas: piezas.map(p => p.nombre) };
  }
  const catalogo = {
    v: 1, id: "fixture-sintetico", nombre: "Catálogo sintético de prueba (no es un olivo real)", fuente: "ilustrativo", unidades: "m", arriba: "+Y",
    licencia: { spdx: "CC0-1.0", autor: "generado por modelos/olivos/fixture/genera.js", atribucion: "sintético, sin atribución" },
    tipos: [{ id: 0, nombre: "Olivo sintético en vaso", fuente: "ilustrativo", altura_m: ALTO, radio_m: RADIO, niveles }],
  };
  fs.writeFileSync(path.join(salida, "catalogo.json"), JSON.stringify(catalogo, null, 2) + "\n");
  return catalogo;
}
module.exports = { genera };

if (require.main === module) {
  const i = process.argv.indexOf("--salida"), salida = i > 0 ? path.resolve(process.argv[i + 1]) : __dirname;
  genera(salida).then(c => console.log("catálogo sintético en", salida, "|", c.tipos.map(t => "tipo " + t.id + ": " + Object.entries(t.niveles).map(([n, v]) => n + " " + v.triangulos + " tri").join(", ")).join("; ")), e => { console.error(e); process.exit(1); });
}
