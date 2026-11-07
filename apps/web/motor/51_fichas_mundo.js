// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Componentes), 02d_laminas (Laminas), 02e_entidades (Entidades, Usables), 03_escena (camera), 29_vr (VRX, PanelVR)
// Nota: Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/fichas-mundo.ts: FichasMundoPuro y el componente «fichas-mundo» de los mundos ["exterior"] (EV2-A1, ?ui=capas, apagado por defecto), con su libera() (presentador de «vr», tapa del panel, láminas colgadas y window.__fichasMundo). En VR, la ficha de un olivo o de una baliza colgada junto a lo que describe con Laminas (encima de la copa, girándose hacia quien mira, como mucho 3), en lugar de las láminas de 29_vr que siguen a la cabeza (presentador «vr» encadenado delante del de 29_vr y PanelVR.tapa). Los trozos [puro] y el resto los evalúa en Node pruebas/guardianes/fichas_mundo.test.js (que lee el .ts como JavaScript, _fuente.js).
// ===============================================================================
  // ---------- EV2-A1: las fichas en el mundo (doc/sistema/VIABILIDAD-INTERACCION.md §A.5, paso 2), solo con ?ui=capas (apagado por defecto): en VR, la ficha de un olivo o de una
  // baliza colgada junto a lo que describe, con Laminas. MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/fichas-mundo.ts (FichasMundoPuro y el
  // componente «fichas-mundo» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado; todo lo que usa se monta antes que este módulo.
  // [talón] apps/web/src/mundos/exterior/fichas-mundo.ts
  Componentes.registra(Mundos.manifiestoFichasMundo({ Laminas: Laminas, Entidades: Entidades, Usables: Usables, PanelVR: PanelVR, VRX: VRX, camera: camera }));
