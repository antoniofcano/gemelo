// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02c_componentes (Pausa, ConfigPuro, Teclas, Componentes, Config), 02d_laminas (Laminas), 29_vr (VRX, PanelVR),
//   31_hud (Hud), 32_ventanas (Ventanas)
// Nota: Componente «juegos» (ADR-0023, C9a): el anfitrión de juegos casuales. Solo se registra; nadie lo nombra. Montado: icono y ventana «Juegos», tecla J, recoge los juegos por el Bus («juego:ofrece» / «juego:pide» / «juego:retira»), abre uno a pantalla completa con el mundo en pausa (Pausa de 02c; su fase «pausa») y guarda el récord (localStorage y, con servidor, /api/juegos/<id>/…). Publica window.__juegos (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js.
// ===============================================================================

  // ---------- el anfitrión de juegos (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación viven en
  // apps/web/src/mundos/exterior/juegos.ts, componente de los mundos ["exterior"] (los juegos son del olivar) con un libera() que, además de cerrar la partida y la lámina de VR,
  // cancela las peticiones a la api en vuelo. Aquí solo se cablea lo del legado: VRX y PanelVR (29_vr), que el código comprobaba con typeof, entran por getter.
  // [talón] apps/web/src/mundos/exterior/juegos.ts
  Componentes.registra(Mundos.manifiestoJuegos({
    D: D, Pausa: Pausa, ConfigPuro: ConfigPuro, Config: Config, Teclas: Teclas, Laminas: Laminas, Hud: Hud, Ventanas: Ventanas,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; }
  }));
