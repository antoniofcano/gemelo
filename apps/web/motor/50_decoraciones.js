// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, FACTOR_R8, FACTOR_R8_GEN), 02_mundo (suelo, copas), 02c_componentes (ConfigPuro, Componentes), 02e_entidades (Entidades),
//   02j_estaticos (Estaticos), 03_escena (scene, camera, Estado), 06_arboles (radioEn), 07ab_generados (Generados), 09_camara (objetivo),
//   12_paseo (paseando), 29_vr (VRX)
// Nota: Componente «decoraciones-olivo» (P7g D3, decisiones 175-179): la pieza de temporada colgada de los olivos cercanos al foco (flores, cinta, farolillo, cosecha, luces, lazo), ILUSTRATIVA, una InstancedMesh por pieza con mergeGeometries de three (import() al montarse; ≤ 6 llamadas y ≤ 64 piezas). Solo se registra; nadie lo nombra. Sin servidor no crea nada; no habla con la api: la lista le llega por el Bus («decoraciones:cambian», la pide con «decoraciones:pide»). Complementa la ficha del olivo con la fila «Decoración». Publica window.__decoraciones (pruebas). Desde MU5-n (A3-3) es un talón de apps/web/src/mundos/exterior/decoraciones.ts (DecoracionesPuro y el componente), que prueba Node en pruebas/guardianes/decoraciones.test.js y Vitest en decoraciones.test.ts.
// ===============================================================================
  // ---------- las decoraciones de los olivos (P7g D3; decisiones 175-179; doc/sistema/DECORACIONES.md y contratos/decoraciones.md): la pieza del catálogo de
  // temporada que una familia ha colgado de un olivo de su haza (flores, cinta, farolillo, cosecha, luces o lazo), dibujada en su copa. Es ILUSTRATIVA (regla 5).
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/decoraciones.ts (DecoracionesPuro y el componente «decoraciones-olivo» de los mundos ["exterior"],
  // con su libera() que suelta las InstancedMesh, las geometrías y los materiales y quita su fila de la ficha del olivo). ?decoraciones=0 (o genera_motor.mjs --sin 50_decoraciones.js)
  // lo quita. Sin servidor no crea nada. Aquí solo se cablea lo del legado; paseando lo reescribe 12_paseo (primitiva del legado: entra como función).
  // El import() de mergeGeometries se queda aquí (en el talón) para que Vite trocee el paquete igual que antes, y entra en el componente como una función.
  // [talón] apps/web/src/mundos/exterior/decoraciones.ts
  Componentes.registra(Mundos.manifiestoDecoraciones({
    THREE: THREE, D: D, FACTOR_R8: FACTOR_R8, FACTOR_R8_GEN: FACTOR_R8_GEN, busqueda: typeof location !== "undefined" ? location.search : "", ConfigPuro: ConfigPuro, copas: copas, suelo: suelo, radioEn: radioEn,
    Generados: typeof Generados !== "undefined" ? Generados : null, Entidades: Entidades, Estaticos: Estaticos, scene: scene, camera: camera, Estado: Estado, objetivo: typeof objetivo !== "undefined" ? objetivo : null,
    paseando: function () { return typeof paseando !== "undefined" && paseando; }, VRX: typeof VRX !== "undefined" ? VRX : null, ventana: window, Componentes: Componentes
  }, function () { return import("three/addons/utils/BufferGeometryUtils.js"); }));
