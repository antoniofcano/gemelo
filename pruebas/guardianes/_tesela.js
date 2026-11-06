// Comprobación de una tesela t/<clave>.json: su esquema (contratos/tesela.schema.json) y los tamaños de sus campos decodificados
// (CONTRATOS.md §3). La usan contratos.test.js (el fixture) y exportadores.test.js (lo que escriben los exportadores de verdad).
"use strict";
const fs = require("fs"), path = require("path");
const Ajv2020 = require("ajv/dist/2020").default;
const { RAIZ } = require("./_util");

const ESQ = JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "tesela.schema.json"), "utf8"));
const V = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true }).compile(ESQ);
const N2 = 258, N = 256, NS2 = 130;   // dtm 258² Int16 (celdas -1..256), chm 256² u8, suelo 130² × 3 u8 (celdas -1..128)
const TS = 256;                       // lado de la tesela, m

/** Bytes de un campo base64 (o -1 si no es una cadena, para que el esquema lo diga). */
const bytesDe = s => typeof s === "string" ? Buffer.from(s, "base64").length : -1;

/** Lista de errores legibles de una tesela ([] si cumple el esquema y sus tamaños). */
function erroresTesela(t) {
  const e = V(t) ? [] : V.errors.map(x => (x.instancePath || "/") + ": " + x.message);
  if (e.length) return e;
  const err = [];
  if (bytesDe(t.dtm) !== N2 * N2 * 2) err.push("dtm: " + bytesDe(t.dtm) + " bytes, debe ser 258² Int16 = " + N2 * N2 * 2);
  if (bytesDe(t.chm) !== N * N) err.push("chm: " + bytesDe(t.chm) + " bytes, debe ser 256² u8 = " + N * N);
  if (bytesDe(t.suelo) !== NS2 * NS2 * 3) err.push("suelo: " + bytesDe(t.suelo) + " bytes, debe ser 130² × 3 u8 = " + NS2 * NS2 * 3);
  const nb = t.pts !== undefined ? bytesDe(t.pts) : 0;
  if (nb % 6 !== 0) err.push("pts: " + nb + " bytes, no es un múltiplo de 6 (3 × Int16 por punto)");
  else if (nb / 6 !== t.np) err.push("np: " + t.np + " debe ser el nº de puntos de pts (" + nb / 6 + ")");
  if (t.pts !== undefined && nb % 6 === 0) {       // x, y dentro de la tesela (cm sobre su esquina SO)
    const b = Buffer.from(t.pts, "base64"), v = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    for (let i = 0; i < v.length; i += 3) if (!(v[i] >= 0 && v[i] < TS * 100 && v[i + 1] >= 0 && v[i + 1] < TS * 100)) { err.push("pts: punto " + i / 3 + " fuera de la tesela"); break; }
  }
  return err;
}

/** `v` (rectángulo con dato, en m relativos a centro_utm) cae dentro de la huella de la tesela (kx, ky). No tiene por qué estar alineado. */
function enHuella(v, kx, ky, centro) {
  const x0 = kx * TS - centro[0], y0 = ky * TS - centro[1];
  return v[0] < v[2] && v[1] < v[3] && v[0] >= x0 && v[2] <= x0 + TS && v[1] >= y0 && v[3] <= y0 + TS;
}

module.exports = { erroresTesela, enHuella, TS };
