// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02_mundo (Mundo, suelo), 02c_componentes (Componentes), 02i_materiales (Materiales), 03_escena (Estado), 08_marcadores (gLinde),
//   13b_hazas (Hazas), 17_minimapa (Minimapa)
// Nota: Componente «lindes-hazas» (A4, ADR-0023; decisiones 12, 13, 95 y 139): la linde de las hazas pegada al relieve, la tuya destacada y las ajenas discretas, con LineSegments2/LineMaterial de three (import() al montarse; 2 llamadas, 6 triángulos por tramo, tope de 8.000 tramos). Solo se registra; nadie lo nombra. También pinta las hazas en el minimapa (A4b, Minimapa.capa, la casilla «Linde» las apaga). ?lindes=0 lo apaga todo. Lee Hazas.lindes() al oír «hazas:cambia»; da su línea de ?debug por «depura:lineas». Publica window.__lindes (pruebas). Desde MU5-n (A3-3) es un talón de apps/web/src/mundos/exterior/lindes.ts (LindesPuro y el componente), que prueba Node en pruebas/guardianes/lindes.test.js y Vitest en lindes.test.ts.
// ===============================================================================
  // ---------- la linde de las hazas en el mundo (A4, el «3c»; ADR-0014, decisiones 12, 13, 95 y 139): la de las tuyas destacada (ámbar, gruesa, opaca), las de los demás hogares
  // discretas (blanco roto, fina, medio transparente), pegadas al relieve. MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/lindes.ts
  // (LindesPuro y el componente «lindes-hazas» de los mundos ["exterior"], con su libera() y el minimapa). Aquí solo se cablea lo del legado. ?lindes=0 lo apaga todo.
  // Técnica (regla 12: la de three): LineSegments2 + LineSegmentsGeometry + LineMaterial de three/addons/lines, pedidos con import() al montarse; el import() se queda aquí
  // (en el talón) para que Vite trocee el paquete igual que antes, y entra en el componente como una función.
  // [talón] apps/web/src/mundos/exterior/lindes.ts
  Componentes.registra(Mundos.manifiestoLindes({
    THREE: THREE, Mundo: Mundo, suelo: suelo, Estado: Estado, gLinde: gLinde, Materiales: Materiales, Hazas: Hazas, Minimapa: Minimapa, Componentes: Componentes, ventana: window
  }, function () {
    return Promise.all([import("three/addons/lines/LineSegments2.js"), import("three/addons/lines/LineSegmentsGeometry.js"), import("three/addons/lines/LineMaterial.js")])
      .then(function (m) { return { LineSegments2: m[0].LineSegments2, LineSegmentsGeometry: m[1].LineSegmentsGeometry, LineMaterial: m[2].LineMaterial }; });
  }));
