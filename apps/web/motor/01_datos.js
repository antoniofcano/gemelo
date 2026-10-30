// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: D, $, fmt, b64, i16, RES, x0, yN, ANCHO, ALTO, EXT, FOG0, FOG1, DIST_MAX, DIST_INI, DEPURA, VRP, FACTOR_R8, FACTOR_R8_GEN, ESC_R8
// Consume: 02_mundo (Mundo, suelo), 05_nube (nube), 15_tiempo (nivel)
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
  var DEPURA = /[?&]debug\b/.test(location.search);
  var VRP = { on: false, hierba: 32 };   // el perfil de las gafas VR (lo fija 29_vr.js; fuera de VR no cambia nada)
  // Radio dibujado de la copa = r8 × factor (decisiones 48 y 81, ADR-0017 y ADR-0022). r8 es el RADIO medido (centro → borde de la cuenca). UNA sola
  // fuente para los dos dibujos de olivo:
  //   FACTOR_R8_GEN, los olivos del constructor (?olivos=escalera y ?olivos=gen: propios E0/E1, variantes E2/E2-VR e impostores), 1 (decisión 81):
  //     copa = 2 × r8 medio, la misma que copas_param.copa_m; todos con la copa que pide el propio (07ab medidasDe).
  //   FACTOR_R8, el nivel de siempre (06_arboles, 07b niveles 1 y 2), 0,5 hasta que la cinta de campo (O4) confirme el 1 (decisión 48).
  // ?factorR8=<v> (o D.config.factorR8) fija LOS DOS a la vez: así la cinta los afina juntos.
  var FACTOR_R8 = 0.5, FACTOR_R8_GEN = 1;
  (function () {
    var m = /[?&]factorR8=([0-9.]+)/.exec(location.search), v = m ? Number(m[1]) : (D.config && D.config.factorR8) || 0;
    if (v > 0 && v <= 2) FACTOR_R8 = FACTOR_R8_GEN = v;
  })();
  // ESC_R8 = FACTOR_R8 / 0,5 escala lo que hoy se dibuja con r8 tal cual (relleno, sombras, ramas): con 0,5 vale 1 y no cambia nada
  var ESC_R8 = FACTOR_R8 / 0.5;

