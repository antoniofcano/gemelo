// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: CargaPuro, Cola, ColaExt
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- la cola de trabajos (A1-10 / MU1-6): migrada a TypeScript; el código vive en apps/web/src/nucleo/cola.ts (MUNDOS §6 y §9.4)
  // [talón] apps/web/src/nucleo/cola.ts
  var CargaPuro = Nucleo.CargaPuro;
  var Cola = Nucleo.creaCola({ ahora: function () { return performance.now(); } });
  var ColaExt = Nucleo.creaColaDeMundo(Cola, "exterior");   // MU2-6: lo que pide el exterior, con claves «exterior:…»; al congelarlo se aparca (MUNDOS §2, «Cómo quedó (MU2-6)»)
