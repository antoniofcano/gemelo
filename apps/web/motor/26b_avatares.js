// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01a_aparato (Aparato), 02_mundo (suelo), 02c_componentes (Componentes), 02g_vr_presupuesto (VrPresupuesto), 02i_materiales (Materiales),
//   03_escena (renderer, scene, camera, Estado), 12_paseo (paseando, persona, primera, pp), 16_vida (enQuad, enDron), 29_vr (VRX)
// Nota: Componente «avatares-vrm» (ADR-0023, C5): solo se registra; consume la presencia (n.api) y se engancha a ella con enganchaVRM. Sin presencia activa no crea nada; con ella, pide /avatares/catalogo.json solo si alguien lleva avatar (o con &vrm=1 en la simulación) e import("@pixiv/three-vrm") solo entonces. MU5-n (A3-6a): talón; el código vive en apps/web/src/mundos/comun/avatares.ts (componente de todo mundo). Lo prueban avatares.test.ts y pruebas/guardianes/avatares_motor.test.js.
// ===============================================================================
  // ---------- avatares VRM (P7c, ADR-0020), componente «avatares-vrm» (C5, ADR-0023, consume la presencia): los N más cercanos que caben en el presupuesto del aparato
  // llevan su VRM del catálogo; el resto, el muñeco instanciado de la presencia; y, en tercera persona, tu paseante es tu avatar (decisión 76). MU5-n (A3-6a): migrado a
  // TypeScript tal cual; el código y la explicación entera viven en apps/web/src/mundos/comun/avatares.ts, componente de TODO mundo (mundos: "todos") con un libera() que
  // suelta cada VRM, tu avatar, el grupo y, desde A3-6a (L2-09), los ficheros descargados. Aquí se cablea lo del legado: lo que otros módulos reescriben (paseando,
  // persona, primera, pp, enQuad, enDron, VRX) entra por getters; las dos importaciones dinámicas (three-vrm y el GLTFLoader) se quedan escritas aquí para que Vite
  // las trocee como antes (solo se piden si alguien lleva avatar).
  // [talón] apps/web/src/mundos/comun/avatares.ts
  Componentes.registra(Mundos.manifiestoAvatares({
    THREE: THREE, location: location, window: window, consola: console, fetch: function (u, o) { return fetch(u, o); },
    cargaVrm: function () { return Promise.all([import("@pixiv/three-vrm"), import("three/addons/loaders/GLTFLoader.js")]); },
    Aparato: Aparato, Materiales: Materiales, Componentes: Componentes, suelo: suelo, renderer: renderer, scene: scene, camera: camera, Estado: Estado,
    get paseando() { return paseando; }, get persona() { return persona; }, get primera() { return primera; }, get pp() { return pp; },
    get enQuad() { return enQuad; }, get enDron() { return enDron; }, get VRX() { return VRX; }, get VrPresupuesto() { return VrPresupuesto; }
  }));
