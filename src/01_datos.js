
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("datos").textContent);
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n, d) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function i16(s) { var u = b64(s); return new Int16Array(u.buffer, 0, u.length >> 1); }

  // La caja del mundo, en metros relativos a centro_utm. Las rejillas de datos (relieve, copa, suelo, nube y ortofoto) ya no viven aquí: están en las teselas (ver Mundo).
  var RES = D.res, x0 = D.ext[0], yN = D.ext[1], ANCHO = D.ext[2] - D.ext[0], ALTO = D.ext[1] - D.ext[3];
  var EXT = Math.max(ANCHO, ALTO), FOG0 = Math.max(900, EXT * 1.1), FOG1 = Math.max(2600, EXT * 3.2), DIST_MAX = Math.max(900, EXT * 1.1), DIST_INI = Math.max(700, EXT * 0.85);   // la cámara y la niebla siguen a la superficie de la finca
  var ESTAD = { terreno: { n: 0, ms: 0, max: 0 }, celdas: { n: 0, ms: 0, max: 0 }, nube: { n: 0, ms: 0, max: 0 } };   // coste de lo que se construye a demanda (se ve con ?debug)
  var DEPURA = /[?&]debug\b/.test(location.search);
  var VRP = { on: false, hierba: 32 };   // el perfil de las gafas VR (lo fija 29_vr.js; fuera de VR no cambia nada)

