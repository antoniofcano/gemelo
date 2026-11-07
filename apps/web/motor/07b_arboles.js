// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Arboles
// Consume: 01_datos (FACTOR_R8), 01a_aparato (Aparato), 02_mundo (Mundo, suelo, copaAlta, kcor, tinte, aviva, copas),
//   02b_cola (CargaPuro, Cola, ColaExt), 02c_componentes (Config), 02f_xr_perillas (XrPerillas), 02g_vr_presupuesto (VrControlPuro),
//   02h_render (InfoDibujo), 02j_estaticos (Estaticos), 02l_tope_tiles (TopeTilesPuro), 02m_tope_olivos (TopeOlivos),
//   03_escena (renderer, camera, Estado), 04c_olivos_tiles (OlivosTiles), 04d_sombreado_tiles (hash), 05_nube (ALTO_MAX),
//   06_arboles (gArboles, arbolesG), 07_follaje (follajeG, construyeSombras), 07a_catalogo (Catalogo), 07ab_generados (Escalera, Generados),
//   07ac_lejanos (Lejanos), 09_camara (objetivo, orb), 10_ndvi (ndviIdx), 12_paseo (paseando, pp), 29_vr (VRX), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- los olivos del modo Gemelo con tres niveles de detalle: el coste de dibujo no crece con la superficie de la finca (nivel 0: celdas de 64 m con el modelo completo; nivel 1:
  // olivos instanciados de ~170 triángulos; nivel 2: una masa de ~30 triángulos por olivo; más lejos, solo la ortofoto). MU5-n (A3-2b): migrado a TypeScript; el código y la explicación
  // entera viven en apps/web/src/mundos/exterior/arboles.ts, componente «arboles» de los mundos ["exterior"] con un libera() que suelta los trabajos de la Cola, las celdas y las mallas
  // instanciadas (lo registra 90_final.js, como los de A3-1a). L1-04: el nivel 0 cuenta en TOPE_TRI. Lo que cambia fuera de este módulo (paseando, kcor, tinte, ndviIdx, objetivo, orb, pp,
  // VRX, Ajustes) entra por getters: muchos se cargan después de 07b. Aquí se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/arboles.ts
  var Arboles = Mundos.creaArboles({
    THREE: THREE, FACTOR_R8: FACTOR_R8, busqueda: location.search, Aparato: Aparato, Config: Config, Mundo: Mundo, Cola: Cola, ColaExt: ColaExt, CargaPuro: CargaPuro, XrPerillas: XrPerillas,
    VrControlPuro: VrControlPuro, InfoDibujo: InfoDibujo, Estaticos: Estaticos, TopeTilesPuro: TopeTilesPuro, TopeOlivos: TopeOlivos, OlivosTiles: OlivosTiles, Catalogo: Catalogo,
    Escalera: Escalera, Generados: Generados, Lejanos: Lejanos, renderer: renderer, camera: camera, Estado: Estado, suelo: suelo, copaAlta: copaAlta, aviva: aviva, hash: hash, copas: copas,
    ALTO_MAX: ALTO_MAX, gArboles: gArboles, arbolesG: arbolesG, follajeG: follajeG, construyeSombras: construyeSombras, ventana: window, ahora: function () { return performance.now(); },
    get paseando() { return typeof paseando !== "undefined" ? paseando : false; }, get kcor() { return kcor; }, get tinte() { return tinte; }, get ndviIdx() { return typeof ndviIdx !== "undefined" ? ndviIdx : 0; },
    get objetivo() { return typeof objetivo !== "undefined" ? objetivo : null; }, get orb() { return typeof orb !== "undefined" ? orb : null; }, get pp() { return typeof pp !== "undefined" ? pp : null; },
    get VRX() { return typeof VRX !== "undefined" ? VRX : null; }, get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }
  });
