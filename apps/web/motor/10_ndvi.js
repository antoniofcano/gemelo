// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Ndvi, NDV, rampa, pintaNdvi, ndviRel, FechaNdvi
// Consume: 01_datos (D, $, b64, i16, x0, yN, ANCHO, ALTO), 02_mundo (TinteOrto), 02c_componentes (Bus), 03_escena (Estado), 05_nube (nube),
//   06_arboles (gArboles, gFollaje, gSombras), 08_marcadores (aplicaLuego)
// ===============================================================================
  // ---------- NDVI de Sentinel-2 (10 m), con escala relativa a la parcela (como hace Vigía). Esto es el núcleo: los datos, la fecha del campo y la escala, que leen el
  // tinte de los árboles, la hierba, la estación y la VR. La capa que lo pinta sobre el terreno, su leyenda y su gráfica son el componente «capa-ndvi» (10b_capa_ndvi.js):
  // se entera por «ndvi:cambia»; sin él (?capandvi=0), el tinte de los árboles y la fecha siguen funcionando.
  // MU5-n (A3-1a): los datos, la rampa, la escala (antes ndLo/ndHi de 02_mundo) y el NDVI relativo de un punto pasaron a TypeScript,
  // apps/web/src/mundos/exterior/ndvi.ts (Mundos.creaNdvi; componente «ndvi» del exterior, sin GPU, que registra 90_final.js). Aquí quedan, como
  // talón (A3-8a; antes, extracción parcial), lo que el resto lee por su nombre: NDV, rampa, pintaNdvi, ndviRel y la fecha elegida (FechaNdvi).
  // [talón] apps/web/src/mundos/exterior/ndvi.ts
  var Ndvi = Mundos.creaNdvi({ D: D, b64: b64, i16: i16, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, idx: function () { return FechaNdvi.E.idx; }, bus: Bus });
  var NDV = Ndvi.NDV, rampa = Ndvi.rampa, pintaNdvi = Ndvi.pinta, ndviRel = Ndvi.rel;
  // A3-8a: la fecha elegida (antes la primitiva ndviIdx, que reescribía 14_historia) y las casillas del panel, en apps/web/src/mundos/exterior/ndvi-panel.ts
  var FechaNdvi = Mundos.creaFechaNdvi({ $: $, NDV: NDV, pintaNdvi: pintaNdvi, aplicaLuego: aplicaLuego, tinte: TinteOrto.E, Estado: Estado, gArboles: gArboles, gFollaje: gFollaje, gSombras: gSombras, nube: nube });
