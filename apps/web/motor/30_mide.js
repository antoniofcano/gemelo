// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, DEPURA), 01a_aparato (Aparato), 02b_cola (Cola), 02c_componentes (Reparto, ConfigPuro, Componentes),
//   02f_xr_perillas (XrPerillas), 02h_render (Render), 02i_materiales (Materiales), 03_escena (visor, renderer, Estado), 04b_escena3d (Escena3D),
//   04f_suelo_fotos (SueloFotos), 07ab_generados (Generados), 07b_arboles (Arboles), 29_vr (VRX, PanelVR), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- medidor de fotogramas para la prueba en el aparato (T7a, doc/sistema/VR.md#medir-con-el-medidor). Componente «medidor-fotogramas» (?medidor=0 lo apaga).
  // Sin &mide ni botón pulsado no hace nada: no escucha «cuadro:fin» y el bucle no paga nada. Es una medida del aparato: en Chrome sin GPU los números no valen como fps.
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/mide.ts (MideEst y el componente), de TODOS los mundos. Aquí solo se cablea lo del legado:
  // todo por getter, como antes lo leía el componente (al usarlo, no al cargarse): Ajustes (33) se monta después, y location, localStorage y navigator se leen dentro de un try.
  // [talón] apps/web/src/ui/mide.ts
  Componentes.registra(Interfaz.manifiestoMide({
    get D() { return D; }, get DEPURA() { return DEPURA; }, get Aparato() { return Aparato; }, get Cola() { return Cola; }, get Reparto() { return Reparto; },
    get ConfigPuro() { return ConfigPuro; }, get XrPerillas() { return XrPerillas; }, get Render() { return Render; }, get Materiales() { return Materiales; },
    get visor() { return visor; }, get renderer() { return renderer; }, get Estado() { return Estado; }, get Escena3D() { return Escena3D; }, get SueloFotos() { return SueloFotos; },
    get Generados() { return Generados; }, get Arboles() { return Arboles; }, get VRX() { return VRX; }, get PanelVR() { return PanelVR; },
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }, get location() { return location; }, get localStorage() { return localStorage; },
    get navigator() { return navigator; }, get ventana() { return window; }, get documento() { return document; }
  }));
