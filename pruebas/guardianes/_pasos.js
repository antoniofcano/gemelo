"use strict";
// Los pasos de la entrada del cliente (apps/web/src/arranque.ts, A3-8c) leídos como JavaScript: el TypeScript sin tipos (stripTypeScriptTypes de Node, que
// cambia cada tipo por espacios y deja todo lo demás en su sitio), partido por sus marcas `  // [paso: NN_nombre]` (apps/web/herramientas/pasos.mjs).
// Cada paso se nombra por el fichero de motor/ del que viene, con su «.js» («12_paseo.js»), como lo nombraban los guardianes y la foto de los nombres.
//   const { pasos, paso, nombresPasos, ARRANQUE } = require("./_pasos");   paso("12_paseo.js") → el texto de ese paso; pasos() → { "01_datos.js": texto, … } en orden
const path = require("path");
const { RAIZ, lee } = require("./_util");

const ARRANQUE = "apps/web/src/arranque.ts";
const P = require(path.join(RAIZ, "apps", "web", "herramientas", "pasos.mjs"));   // Node >= 22.12: require() de un módulo ES sin await de primer nivel

/** el TypeScript como JavaScript, con cada carácter en su sitio (los tipos pasan a espacios) */
function sinTipos(ts) {
  const m = require("node:module"), avisa = process.emitWarning;
  process.emitWarning = () => {};   // «experimental»: no ensucia la salida de las pruebas
  try { return m.stripTypeScriptTypes(ts); } finally { process.emitWarning = avisa; }
}
let cache = null;
/** { "01_datos.js": texto, … } en el orden del arranque (que es el de creación). texto = el JavaScript del paso, desde su marca */
function pasos() {
  const ts = lee(ARRANQUE);
  if (cache && cache.ts === ts) return cache.pasos;
  const js = sinTipos(ts), o = {};
  for (const p of P.partePasos(js)) o[p.nombre + ".js"] = js.slice(p.inicio, p.fin);
  cache = { ts, pasos: o };
  return o;
}
/** los nombres de los pasos, en orden («01_datos.js», …) */
const nombresPasos = () => Object.keys(pasos());
/** el texto (JavaScript) de un paso; acepta «12_paseo» o «12_paseo.js». Falla si no existe */
function paso(nombre) {
  const k = P.nombrePaso(nombre) + ".js", t = pasos()[k];
  if (t === undefined) throw new Error("no hay paso «" + nombre + "» en " + ARRANQUE);
  return t;
}

module.exports = { pasos, paso, nombresPasos, sinTipos, ARRANQUE, quitaPasos: P.quitaPasos, partePasos: P.partePasos };
