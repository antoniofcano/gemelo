// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 01a_aparato (Aparato), 02c_componentes (ConfigPuro, Componentes), 02d_laminas (LaminasPuro, Laminas),
//   02e_entidades (Entidades), 03_escena (visor, scene, camera), 29_vr (VRX, PanelVR), 31_hud (Hud), 33_ajustes (Ajustes)
// Nota: Componente «corro-voz» (F3k-2 y F3k-3, ADR-0032; decisiones 205-212, provisionales): la voz por cercanía en la visita libre, en corros con aceptación. Solo se registra; nadie lo nombra. Sin servidor, sin LiveKit (503) o con el interruptor de la oficina apagado no crea nada. Con él: Configuración → Voz → «Voz por cercanía» (apagada por defecto; el aviso «cercania» v1 con la declaración de mayor de edad ANTES de activarla), invitar desde el avatar y desde Gente a menos de 8 m (Presencia.accionesPersona), la invitación con «Aceptar» / «Ahora no» (foco en «Ahora no»; en VR, una lámina), la lista del corro con quién habla (aria-live y un halo), silenciar, bloquear, avisar a la oficina y salir con las rutas de la api, el icono de corro con voz para quien no está (Entidades, tipo «corro») y las salidas solas (lejos, cambio de sala, vista aérea). La voz la pone 45_voz.js (Voz.entraCorro) y el micro 47_habla.js. Emite «corro:estado»; escucha «voz:habla», «voz:estado» y «depura:lineas». ?corro=0 lo apaga. Publica window.__corro (pruebas). Todo con textContent. MU5-n (A3-6b): talón; el componente vive en apps/web/src/mundos/comun/corro.ts (de todo mundo) y su lógica pura, con el aviso «cercania», en apps/web/src/red/voz/corro.ts. Lo prueban corro.test.ts y en Node pruebas/guardianes/corro.test.js (CorroPuro y creaCorro, de Mundos).
// ===============================================================================
  // ---------- la voz por cercanía en la visita libre, en corros (F3k-2 y F3k-3; ADR-0032), componente «corro-voz». MU5-n (A3-6b): migrado a TypeScript tal cual; el
  // componente y la explicación entera viven en apps/web/src/mundos/comun/corro.ts (dibuja: la caja, los diálogos, las láminas, los halos y los iconos) y su lógica pura,
  // con el aviso «cercania» y su AVISO_VERSION, en apps/web/src/red/voz/corro.ts. De TODO mundo (mundos: "todos"), con un libera() que cierra el aviso, los diálogos,
  // la lámina, la invitación y la caja, quita sus enganches (panel de VR, ficha de una persona, Entidades, el tema «corro», la pestaña), suelta los halos y los iconos y
  // saca la voz del corro. Aquí se cablea lo del legado: lo que otros módulos reescriben (VRX, Aparato, PanelVR: A3-6c) o el código de siempre comprobaba con typeof
  // (Ajustes, Hud, Laminas, Entidades, TextDecoder) entra por getters.
  // [talón] apps/web/src/mundos/comun/corro.ts
  Componentes.registra(Mundos.manifiestoCorro({
    THREE: THREE, scene: scene, camera: camera, location: location, window: window, document: document, fetch: function (u, o) { return fetch(u, o); },
    D: D, ConfigPuro: ConfigPuro, LaminasPuro: LaminasPuro, visor: visor,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }, get Aparato() { return Aparato; }, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; },
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }, get Hud() { return typeof Hud !== "undefined" ? Hud : undefined; },
    get Laminas() { return typeof Laminas !== "undefined" ? Laminas : undefined; }, get Entidades() { return typeof Entidades !== "undefined" ? Entidades : undefined; },
    get TextDecoder() { return typeof TextDecoder !== "undefined" ? TextDecoder : undefined; }
  }));
