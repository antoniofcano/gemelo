// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: SueloFotosPuro, SueloFotos
// Consume: 01a_aparato (Aparato), 02_mundo (Mundo, copas), 02b_cola (ColaExt), 02c_componentes (Componentes), 03_escena (renderer)
// ===============================================================================
  // ---------- EV-1s: el suelo de cerca con texturas de fotos de la finca (?suelo=fotos; APAGADO por defecto y, en VR, apagado salvo ?sueloVR=1). MU5-n (A3-1b): migrado a
  // TypeScript; el código vive en apps/web/src/mundos/exterior/suelo-fotos.ts (el trozo puro, SueloFotosPuro, y la fábrica del suelo). Siete clases de textura repetible en UNA
  // textura en array (KTX2 por defecto, WebP si falla), con la CLASE de cada punto DEDUCIDA y la textura ILUSTRATIVA (regla 5): la explicación completa, allí. Sin la bandera no carga
  // nada. 04d sigue pidiéndole SueloFotosPuro.parcheGlsl, SueloFotos.U, .campo, .rueNeutro, .actualiza y .libera. Componente «suelo-fotos» de los mundos ["exterior"].
  // [talón] apps/web/src/mundos/exterior/suelo-fotos.ts
  var SueloFotosPuro = Mundos.SueloFotosPuro;
  var SueloFotos = Mundos.creaSueloFotos({
    THREE: THREE, Aparato: Aparato, Mundo: Mundo, copas: copas, ColaExt: ColaExt, renderer: renderer,
    busqueda: typeof location !== "undefined" ? location.search : "",
    ajuste: function () { try { var s = window.localStorage.getItem("gemelo.ajustes.vista.suelo"); return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } },
    cargaKtx2: function () { return import("three/addons/loaders/KTX2Loader.js"); },   // solo con la bandera y este formato
    consola: console
  });
  Componentes.registra(Mundos.manifiestoSueloFotos(SueloFotos));
