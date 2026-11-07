// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: fusionaGeometrias
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- AG-1.13b: varias geometrías indexadas en una sola, con su color por vértice (la fauna y los perros: una InstancedMesh por pieza).
  // MU5-n (A3-8a): migrado a TypeScript; el código vive en apps/web/src/nucleo/geometria.ts, que recibe THREE (el núcleo no lo importa).
  // [talón] apps/web/src/nucleo/geometria.ts
  var fusionaGeometrias = Nucleo.creaFusionaGeometrias(THREE);
