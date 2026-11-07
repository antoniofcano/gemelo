"use strict";
// Ayudante de los guardianes (AG-0.3): el módulo del aparato evaluado en Node sobre un navigator de mentira, para las pruebas que evalúan un fichero del
// motor suelto y le pasan sus globales a mano (el fichero ya no lee navigator.userAgent: pregunta a «Aparato»). MU5-n (A3-8a): el código vive en
// apps/web/src/nucleo/aparato.ts; se evalúa el paso 01a_aparato de apps/web/src/arranque.ts con el Nucleo de verdad, como en la página.
//   aparatoDe({ userAgent, maxTouchPoints, deviceMemory })  → un Aparato nuevo (sin WebGL: capacidades «no medidas»)
//   aparatoDe("quest")                                       → un Aparato forzado a esa clase (Aparato.pon, solo para pruebas)
const fs = require("fs"), path = require("path");
const FUENTE = require("./_pasos").pasoArranque("01a_aparato.js");   // A3-8c: el paso del arranque
const Nucleo = require("./_nucleo");

function modulo(nav, ventana) {
  const f = new Function("navigator", "window", "Nucleo", "\"use strict\";\n" + FUENTE + "\nreturn { Aparato, AparatoPuro: Nucleo.AparatoPuro };");
  return f(nav, ventana, Nucleo);
}
function aparatoDe(nav, ventana) {
  if (typeof nav === "string") { const a = modulo({}, ventana).Aparato; a.pon(nav); return a; }
  return modulo(nav || {}, ventana).Aparato;
}
module.exports = { aparatoDe, modulo, FUENTE };
