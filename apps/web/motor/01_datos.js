// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: D, $, fmt, b64, i16, RES, x0, yN, ANCHO, ALTO, EXT, FOG0, FOG1, DIST_MAX, DIST_INI, ESTAD, DEPURA, VRP, FACTOR_R8, ESC_R8, ESC3D
// Consume: 02_mundo (Mundo, suelo), 04_terreno (terreno), 05_nube (nube)
// Nota: Abre la IIFE que cierra 99_cierre.js y activa "use strict". Primer módulo: define D (los datos de la finca) y las utilidades.
// ===============================================================================

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
  // Radio dibujado de la copa = r8 × FACTOR_R8 (decisión abierta nº 48, ADR-0017). r8 es el RADIO medido (centro → borde de la cuenca); el motor
  // lo dibuja hoy a la mitad (0,5). 1 = la copa a su radio medido. Va en la URL (?factorR8=1) o en D.config.factorR8; por defecto 0,5 (como siempre).
  var FACTOR_R8 = (function () {
    var m = /[?&]factorR8=([0-9.]+)/.exec(location.search), v = m ? Number(m[1]) : (D.config && D.config.factorR8) || 0.5;
    return v > 0 && v <= 2 ? v : 0.5;
  })();
  // ESC_R8 = FACTOR_R8 / 0,5 escala lo que hoy se dibuja con r8 tal cual (relleno, sombras, ramas): con 0,5 vale 1 y no cambia nada
  var ESC_R8 = FACTOR_R8 / 0.5;
  // ?escena=tiles (F1d, ADR-0015): el terreno lo dibuja la escena 3D Tiles (04b_escena3d.js) y no el de siempre (04_terreno.js). activa vuelve a
  // false si la escena nueva falla, y entonces el terreno de siempre se monta como sin la bandera
  var ESC3D = (function () { var p = /[?&]escena=tiles\b/.test(location.search); return { pedida: p, activa: p }; })();

