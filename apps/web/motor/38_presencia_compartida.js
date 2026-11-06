// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 01a_aparato (Aparato), 02_mundo (suelo), 02c_componentes (ConfigPuro, Componentes), 02e_entidades (Entidades),
//   02i_materiales (Materiales), 03_escena (visor, renderer, scene, camera, texColor, Estado), 09_camara (objetivo), 12_paseo (paseando, pp),
//   12b_llegada (Llegada), 16_vida (enQuad, enDron, quad, dron), 24_pantalla (TR), 26_presencia (sitioJunto), 29_vr (VRX), 33_ajustes (Ajustes),
//   34_movibles (Movibles)
// Nota: Componente «presencia-compartida» (ADR-0023, C5): solo se registra; consume la red (sala «visita») y expone «Presencia» (para los avatares VRM). Sin ?presencia=sim o ?presencia=red, montado no crea nada; con red, el panel Gente y el chat; F3f: viaja a la sala de una visita guiada (Presencia.entraGuiada, token de F3c) y vuelve sola a la general si la sala se cierra o te sacan. Registra el tipo persona en Entidades (C7) y da su línea de ?debug por «depura:lineas». F3k-3: acciones de otros componentes en la ficha de una persona y en su fila de Gente (Presencia.accionesPersona; los corros de 47b), su distancia (Presencia.distancia) y repintar Gente (Presencia.repintaGente). Publica window.__presencia y window.__presenciaChat (pruebas). MU5-n (A3-6a): talón; el código vive en apps/web/src/mundos/comun/presencia.ts (componente de todo mundo). Lo prueban presencia.test.ts y en Node pruebas/guardianes/red.test.js.
// ===============================================================================

  // ---------- presencia compartida (F2, contratos/presencia.md), componente «presencia-compartida» (C5, ADR-0023): los demás visitantes como muñecos instanciados,
  // su pose por el códec del contrato, su interpolación y, en la sala de verdad, el apartado Gente y el chat. MU5-n (A3-6a): migrado a TypeScript tal cual; el código y
  // la explicación entera viven en apps/web/src/mundos/comun/presencia.ts, componente de TODO mundo (mundos: "todos") con un libera() que suelta de verdad las mallas,
  // las geometrías, los materiales, el atlas de nombres, el panel, los relojes, las escuchas y la sala. Aquí se cablea lo del legado: lo que otros módulos reescriben
  // o se carga después (objetivo, paseando, pp, enQuad, enDron, VRX, Ajustes, Movibles, Llegada, TR) entra por getters; la importación dinámica de BufferGeometryUtils
  // (el quad y el dron de los demás) se queda escrita aquí para que Vite la trocee como antes.
  // [talón] apps/web/src/mundos/comun/presencia.ts
  Componentes.registra(Mundos.manifiestoPresencia({
    THREE: THREE, location: location, window: window, document: document, consola: console, fetch: function (u, o) { return fetch(u, o); },
    utilesGeometria: function () { return import("three/addons/utils/BufferGeometryUtils.js"); },
    D: D, ConfigPuro: ConfigPuro, Aparato: Aparato, Materiales: Materiales, Entidades: Entidades, Componentes: Componentes, suelo: suelo, sitioJunto: sitioJunto,
    scene: scene, camera: camera, renderer: renderer, texColor: texColor, Estado: Estado, visor: visor, quad: quad, dron: dron,
    get objetivo() { return objetivo; }, get paseando() { return paseando; }, get pp() { return pp; }, get enQuad() { return enQuad; }, get enDron() { return enDron; },
    get VRX() { return VRX; }, get Llegada() { return Llegada; }, get TR() { return TR; },
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }, get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; }
  }));
