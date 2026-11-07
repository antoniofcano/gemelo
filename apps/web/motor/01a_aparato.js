// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Aparato
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- AG-0.3: UNA sola detección del aparato (doc/sistema/COMPONENTES.md#aparato). MU5-n (A3-8a): migrado a TypeScript; el código vive en
  // apps/web/src/nucleo/aparato.ts (AparatoPuro, que copia el cargador, y creaAparato). Es el ÚNICO sitio que lee navigator.userAgent / deviceMemory /
  // hardwareConcurrency / maxTouchPoints; aquí solo se le da el navigator y la ventana (donde publica window.__aparato).
  // [talón] apps/web/src/nucleo/aparato.ts
  var Aparato = Nucleo.creaAparato({ navegador: typeof navigator !== "undefined" && navigator ? navigator : {}, ventana: typeof window !== "undefined" && window ? window : null });
