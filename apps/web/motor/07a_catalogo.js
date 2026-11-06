// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Catalogo
// Consume: 02c_componentes (Componentes), 02i_materiales (Materiales), 04d_sombreado_tiles (hash), 15_tiempo (parcheTiempo)
// ===============================================================================
  // ---------- el catálogo de olivos-tipo (ADR-0012; contrato de entrada en contratos/olivos-tipo.md): de dónde sacan los niveles 1 y 2 su geometría. MU5-n (A3-2a): migrado a
  // TypeScript; el código vive en apps/web/src/mundos/exterior/catalogo.ts (las formas por procedimiento del tipo −1, sus dos materiales instanciados y el registro de los modelos
  // glb, con un libera() que lo suelta todo), componente «catalogo-olivos» de los mundos ["exterior"]. 07b_arboles.js lo pide al montarse. parcheTiempo (15_tiempo) va después en el
  // montaje: es una función declarada (se iza) y solo se llama al compilar. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/catalogo.ts
  var Catalogo = Mundos.creaCatalogo({ THREE: THREE, hash: hash, parcheTiempo: parcheTiempo, Materiales: Materiales });
  Componentes.registra(Mundos.manifiestoCatalogo(Catalogo));
