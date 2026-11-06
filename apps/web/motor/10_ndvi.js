// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Ndvi, NDV, rampa, pintaNdvi, ndviRel, ndviIdx
// Consume: 01_datos (D, $, b64, i16, x0, yN, ANCHO, ALTO), 02_mundo (tinte), 02c_componentes (Bus), 03_escena (Estado), 05_nube (nube),
//   06_arboles (gArboles, gFollaje, gSombras), 08_marcadores (aplicaLuego)
// ===============================================================================
  // ---------- NDVI de Sentinel-2 (10 m), con escala relativa a la parcela (como hace Vigía). Esto es el núcleo: los datos, la fecha del campo y la escala, que leen el
  // tinte de los árboles, la hierba, la estación y la VR. La capa que lo pinta sobre el terreno, su leyenda y su gráfica son el componente «capa-ndvi» (10b_capa_ndvi.js):
  // se entera por «ndvi:cambia»; sin él (?capandvi=0), el tinte de los árboles y la fecha siguen funcionando.
  // MU5-n (A3-1a): los datos, la rampa, la escala (antes ndLo/ndHi de 02_mundo) y el NDVI relativo de un punto pasaron a TypeScript,
  // apps/web/src/mundos/exterior/ndvi.ts (Mundos.creaNdvi; componente «ndvi» del exterior, sin GPU, que registra 90_final.js). Aquí quedan, como
  // extracción parcial, la fecha elegida (ndviIdx: la reescribe 14_historia, así que no puede ser una importación) y las casillas del panel.
  var Ndvi = Mundos.creaNdvi({ D: D, b64: b64, i16: i16, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, idx: function () { return ndviIdx; }, bus: Bus });
  var NDV = Ndvi.NDV, rampa = Ndvi.rampa, pintaNdvi = Ndvi.pinta, ndviRel = Ndvi.rel;
  var ndviIdx = NDV ? NDV.fechas.length - 1 : 0;
  $("cTinte").addEventListener("change", function () { tinte = $("cTinte").checked; if (NDV) pintaNdvi(); aplicaLuego(); });
  if (NDV) { $("ndviSel").addEventListener("change", function () { if (tinte) aplicaLuego(); }); }
  if (NDV) { $("ndviSel").max = NDV.fechas.length - 1; $("ndviSel").value = ndviIdx; $("ndviSel").addEventListener("input", function (e) { ndviIdx = Number(e.target.value); pintaNdvi(); }); }
  $("cSolo").addEventListener("change", function () { var o = $("cSolo").checked; gArboles.visible = !o && Estado.modo === "gem"; gFollaje.visible = !o && Estado.modo === "gem"; gSombras.visible = !o && Estado.modo === "gem"; nube.visible = !o && Estado.modo === "nube"; });

