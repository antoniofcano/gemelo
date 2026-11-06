// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (suelo, cIn), 02c_componentes (Componentes), 03_escena (scene, camera, texColor, Estado), 08_marcadores (gLinde),
//   13b_hazas (Hazas), 23_estacion (EST, bbchEn, hoyMadrid), 29_vr (VRX)
// Nota: Componente «carteles-haza» (EV2-A6, ADR-0023; ADR-0014): como mucho 3 carteles de haza sobre la linde (los más cercanos, con histéresis) y un tablón en la entrada, con un pool de 3+1 mallas y lienzos de 512 × 320; solo nombre y datos medidos de la lista blanca de la ficha, cada uno con su procedencia; ?carteles=0 lo apaga. Desde MU5-n (A3-3) es un talón de apps/web/src/mundos/exterior/carteles.ts (CartelesPuro y el componente), que prueba Node en pruebas/guardianes/carteles.test.js y Vitest en carteles.test.ts.
// ===============================================================================
  // ---------- EV2-A6: carteles de haza en la linde y tablón en la entrada (ADR-0014, decisiones 12, 188 y 202; doc/sistema/COMPONENTES.md).
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/carteles.ts (CartelesPuro y el componente «carteles-haza» de los mundos ["exterior"], con su
  // libera() que suelta la geometría, los cuatro materiales y las cuatro texturas). Sobre la linde de las hazas que tienes cerca cuelga un cartel con el NOMBRE de la haza y solo
  // lo que decidió Antonio (lista blanca, cada dato con su procedencia); el tablón de la entrada lleva «Club La Linde». ?carteles=0 lo apaga. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/carteles.ts
  Componentes.registra(Mundos.manifiestoCarteles({
    THREE: THREE, documento: document, ventana: window, scene: scene, camera: camera, VRX: VRX, texColor: texColor, gLinde: gLinde, suelo: suelo, Estado: Estado,
    Hazas: Hazas, D: D, cIn: cIn, EST: EST, bbchEn: bbchEn, hoyMadrid: hoyMadrid
  }));
