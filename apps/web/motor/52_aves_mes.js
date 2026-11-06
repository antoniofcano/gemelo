// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02c_componentes (Componentes), 29_vr (PanelVR), 31_hud (Hud), 32_ventanas (Ventanas)
// Nota: Componente «aves-mes» (EV-1g «Biodiversidad B0»): ventana «Aves probables este mes» con lo que GBIF registra en 10 km (DEDUCIDO, nivel probable, con atribución y licencias CC0, CC BY y CC BY-SA). Además, la fila «Aves del mes» del panel de VR (pestaña Mundo: 3 especies y «y X más», con «deducido», nota, atribución y licencias; AvesMesPuro.filaVR). TALÓN (MU5-n, A3-5): el código vive en apps/web/src/mundos/exterior/aves-mes.ts (Mundos.manifiestoAvesMes). Solo se registra; nadie lo nombra. Sin D.base, sin fichero o sin aves de este mes no monta nada (ni fila). AvesMesPuro y el componente los evalúa en Node pruebas/guardianes/aves_mes.test.js.
// ===============================================================================

  // ---------- las aves probables este mes (EV-1g «Biodiversidad B0»; componente «aves-mes»): una ventana con las especies de aves que GBIF registra este mes en 10 km alrededor de la
  // finca, y la fila «Aves del mes» del panel de VR. DEDUCIDO (regla 5): no es lo observado en la finca; con atribución y licencias CC0, CC BY y CC BY-SA.
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/aves-mes.ts (AvesMesPuro y el componente), de los mundos ["exterior"], con un libera() que
  // corta la descarga, quita la ventana, el icono, la fila de VR y el observador. Aquí solo se cablea lo del legado. ?aves=0 lo apaga; ?aves=1 lo enciende.
  // [talón] apps/web/src/mundos/exterior/aves-mes.ts
  Componentes.registra(Mundos.manifiestoAvesMes({
    D: D, fetch: typeof fetch === "function" ? fetch : null, Ventanas: Ventanas, Hud: Hud, PanelVR: typeof PanelVR !== "undefined" ? PanelVR : undefined,
    document: document, window: window
  }));
