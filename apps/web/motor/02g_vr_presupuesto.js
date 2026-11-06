// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: VrPresupuestoPuro, VrControlPuro, VrPresupuesto
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- el presupuesto de VR por escalón (Q0c-a) y el controlador de nivel (Q0c-b, Q0c-c), migrados a TypeScript (A1-12 / MU1-8):
  // el código vive en apps/web/src/nucleo/presupuesto.ts (MUNDOS §9.4, pieza 3; doc/sistema/VR.md)
  // [talón] apps/web/src/nucleo/presupuesto.ts
  var VrPresupuestoPuro = Nucleo.VrPresupuestoPuro;
  var VrControlPuro = Nucleo.VrControlPuro;
  var VrPresupuesto = Nucleo.creaVrPresupuesto({ ventana: typeof window !== "undefined" ? window : null });
