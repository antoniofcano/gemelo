"use strict";
// Ayudante de los guardianes (AG-0.3): el módulo del aparato (apps/web/motor/01a_aparato.js) evaluado en Node sobre un navigator de mentira, para las
// pruebas que evalúan un fichero del motor suelto y le pasan sus globales a mano (el fichero ya no lee navigator.userAgent: pregunta a «Aparato»).
//   aparatoDe({ userAgent, maxTouchPoints, deviceMemory })  → un Aparato nuevo (sin WebGL: capacidades «no medidas»)
//   aparatoDe("quest")                                       → un Aparato forzado a esa clase (Aparato.pon, solo para pruebas)
const fs = require("fs"), path = require("path");
const FUENTE = fs.readFileSync(path.join(__dirname, "..", "..", "apps", "web", "motor", "01a_aparato.js"), "utf8");

function modulo(nav, ventana) {
  const f = new Function("navigator", "window", "\"use strict\";\n" + FUENTE + "\nreturn { Aparato, AparatoPuro };");
  return f(nav, ventana);
}
function aparatoDe(nav, ventana) {
  if (typeof nav === "string") { const a = modulo({}, ventana).Aparato; a.pon(nav); return a; }
  return modulo(nav || {}, ventana).Aparato;
}
module.exports = { aparatoDe, modulo, FUENTE };
