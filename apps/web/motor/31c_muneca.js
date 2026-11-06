// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (ComponentesPuro, Componentes), 02e_entidades (Usables), 03_escena (renderer), 12_paseo (pp), 12b_llegada (Llegada),
//   13b_hazas (Hazas), 15_tiempo (horaMundoTexto),
//   29_vr (VRX, vrRig, vrMano, vrRayoDe, creaLamina, vrBajoRayo, vrRect, vrAj, PanelVR, vrPintaFicha, vrPulso), 31b_hud_personal (HudPersonalPuro)
// Nota: EV2-A3: el menú de muñeca en VR («hora · tu haza · hablar · volver», con los textos de HudPersonalPuro de 31b). MU5-n (A3-6a): talón del componente «muneca-vr», de todo mundo; el código vive en apps/web/src/mundos/comun/muneca.ts. Se engancha a 29_vr por PanelVR.alFotograma y PanelVR.alGatillo y lo suelta en su libera(); ?xrmuneca=0 y el ajuste vr.muneca lo apagan. Publica además window.__vrMuneca y __vrMunecaPulsa (pruebas VR). Lo prueban muneca.test.ts y en Node pruebas/guardianes/vr_muneca.test.js.
// ===============================================================================
  // ---------- EV2-A3: el menú de muñeca en VR («hora · tu haza · hablar · volver», con los textos de HudPersonalPuro de 31b). MU5-n (A3-6a): migrado a TypeScript tal cual;
  // el código y la explicación entera viven en apps/web/src/mundos/comun/muneca.ts, y pasa a ser el componente «muneca-vr», de TODO mundo (mundos: "todos"), con un
  // libera() que suelta la lámina, sus enganches de PanelVR y del Bus y los ganchos de las pruebas (antes se enganchaba al cargarse y no se soltaba nunca). Aquí se
  // cablea lo del legado: todo lo de 29_vr, 12_paseo, 12b, 13b, 15_tiempo, 02e y 31b entra por getters (lo reescriben A3-4 y A3-6c).
  // [talón] apps/web/src/mundos/comun/muneca.ts
  Componentes.registra(Mundos.manifiestoMuneca({
    THREE: THREE, location: location, window: window, renderer: renderer, ComponentesPuro: ComponentesPuro,
    get VRX() { return VRX; }, get vrRig() { return vrRig; }, get PanelVR() { return PanelVR; }, get HudPersonalPuro() { return HudPersonalPuro; }, get Hazas() { return Hazas; },
    get Usables() { return Usables; }, get Llegada() { return Llegada; }, get pp() { return pp; }, get vrMano() { return vrMano; }, get vrRayoDe() { return vrRayoDe; },
    get creaLamina() { return creaLamina; }, get vrBajoRayo() { return vrBajoRayo; }, get vrRect() { return vrRect; }, get vrAj() { return vrAj; },
    get vrPintaFicha() { return vrPintaFicha; }, get vrPulso() { return vrPulso; }, get horaMundoTexto() { return horaMundoTexto; }
  }));
