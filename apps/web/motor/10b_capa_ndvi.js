// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($, fmt), 02c_componentes (Componentes), 04d_sombreado_tiles (UN), 10_ndvi (NDV, rampa, pintaNdvi, FechaNdvi)
// ===============================================================================

  // ---------- la capa de vigor (componente «capa-ndvi», ADR-0023, C10 cuarta tanda): el NDVI de la fecha elegida pintado sobre el terreno, con su leyenda y
  // su gráfica anual. MU5-n (A3-1a): el componente pasó a TypeScript, apps/web/src/mundos/exterior/capa-ndvi.ts (Mundos.manifiestoCapaNdvi), del exterior
  // y con su libera() (la textura, dispose). Aquí queda su registro: lo que necesita del legado se lo da la función al montarse (tras todos los módulos).
  // ?capandvi=0 la apaga: el terreno no se tiñe, y las casillas siguen en el menú.
  // [talón] apps/web/src/mundos/exterior/capa-ndvi.ts
  Componentes.registra(Mundos.manifiestoCapaNdvi(function () {
    return { THREE: THREE, $: $, fmt: fmt, documento: document, UN: UN, NDV: NDV, idx: function () { return FechaNdvi.E.idx; }, rampa: rampa, pintaNdvi: pintaNdvi };
  }));
