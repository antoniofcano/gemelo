// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Componentes), 02i_materiales (Materiales), 03_escena (renderer)
// ===============================================================================
  // ---------- I6: el aspecto de los mandos y de las manos en VR (el modelo real del mando del perfil de WebXR Input Profiles y la mano articulada; de respaldo, la caja y las esferas).
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/mandos.ts, componente «mandos-vr» de TODOS los mundos (la VR es de todo mundo) con un libera() que
  // suelta la sesión si la hay y quita las escuchas de los grupos de three. Aquí solo se cablea lo del legado; el import() de las fábricas de three se queda escrito aquí para que Vite
  // trocee igual que antes (solo se pide al entrar en VR).
  // [talón] apps/web/src/mundos/comun/mandos.ts
  Componentes.registra(Mundos.manifiestoMandos({
    THREE: THREE, renderer: renderer, Materiales: Materiales, ventana: window, consola: console,
    cargaLib: function () {
      return Promise.all([import("three/addons/webxr/XRControllerModelFactory.js"), import("three/addons/webxr/XRHandModelFactory.js"),
        import("three/addons/webxr/XRHandPrimitiveModel.js"), import("three/addons/loaders/GLTFLoader.js")]);
    }
  }));
