// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Componentes), 12_paseo (paseando, teclas, pp), 15_tiempo (nivelEn, cur), 16_vida (tVida, enQuad, vq, enDron, dr),
//   18_paisaje (aguaNivel, distArroyo), 29_vr (VRX, PanelVR), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- el sonido del olivar: todo sintetizado en el navegador (no hay ficheros de audio) y atado al tiempo del mundo. MU5-n (A3-4): migrado a TypeScript; el
  // código vive en apps/web/src/mundos/exterior/sonido.ts, componente «sonido-ambiente» (ADR-0023, C4), el de siempre, con su libera(). ?sonido=0 lo apaga.
  // Lo que cambia en cada fotograma (quien pasea, el quad, el dron, el agua) se le da por función; Ajustes y el panel VR, si existen. Aquí solo se cablea.
  // [talón] apps/web/src/mundos/exterior/sonido.ts
  Componentes.registra(Mundos.manifiestoSonido({
    ventana: window, documento: document, cur: cur, nivelEn: nivelEn,
    ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; }, panelVR: function () { return typeof PanelVR !== "undefined" ? PanelVR : null; },
    vrx: function () { return typeof VRX !== "undefined" ? VRX : null; },
    paseando: function () { return paseando; }, teclas: function () { return teclas; }, pp: function () { return pp; }, tVida: function () { return tVida; },
    enQuad: function () { return enQuad; }, vq: function () { return vq; }, enDron: function () { return enDron; }, dr: function () { return dr; },
    aguaNivel: function () { return aguaNivel; }, distArroyo: function (x, y) { return distArroyo(x, y); }
  }));
