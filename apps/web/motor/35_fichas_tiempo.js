// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Teclas, Componentes), 02d_laminas (Laminas), 03_escena (camera), 12_paseo (paseando),
//   15_tiempo (ahoraMs, nivel, TiempoVivo), 29_vr (VRX, PanelVR), 31_hud (Hud)
// Nota: Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/fichas-tiempo.ts: FichasTiempoPuro y el componente «fichas-tiempo» de los mundos ["exterior"] (ADR-0023), con su libera() (cierra la lámina; lo demás lo suelta el contexto). Solo se registra (Componentes.registra); nadie lo nombra. Montado, publica window.__fichaTiempo (pruebas), la tecla P, la fila del tiempo del panel VR y escucha «prevision:alterna». Lee TiempoVivo si el motor lo expone; sin él, un respaldo simulado rotulado. Nunca dice si se puede tratar (regla 1 de Vigía). Los trozos [puro] y [motor] los evalúa en Node pruebas/guardianes/fichas_tiempo.test.js (que lee el .ts como JavaScript, _fuente.js).
// ===============================================================================
  // ---------- la previsión del tiempo como lámina en el mundo (doc/sistema/UX-FINCA-JUEGO.md §4.11): en VR y en el paseo, un cartel anclado al mundo con «Ahora» (medido en la
  // estación, que no está en la finca) y las próximas horas y días (modelado). MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/fichas-tiempo.ts
  // (FichasTiempoPuro y el componente «fichas-tiempo» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado: «paseando» (que 12_paseo reescribe) entra por getter.
  // Se abre con «Ver previsión» en la pestaña Mundo del panel VR, con la tecla P paseando, o con el evento «prevision:alterna» del Bus (el botón de la ventana Tiempo).
  // [talón] apps/web/src/mundos/exterior/fichas-tiempo.ts
  Componentes.registra(Mundos.manifiestoFichasTiempo({
    THREE: THREE, Laminas: Laminas, Teclas: Teclas, Hud: Hud, VRX: VRX, PanelVR: PanelVR, camera: camera, TiempoVivo: TiempoVivo, ahoraMs: ahoraMs, nivel: nivel, get paseando() { return paseando; }
  }));
