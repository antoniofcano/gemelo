// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: LaminasPuro, Laminas
// Consume: 02c_componentes (Bus, Componentes), 02h_render (InfoDibujo), 02i_materiales (Materiales), 03_escena (renderer, scene, camera, texColor),
//   29_vr (VRX)
// Nota: Talón (MU5-n, A3-7a) de apps/web/src/ui/laminas.ts, componente «laminas-mundo» de todo mundo. Servicio (ADR-0023, C8): LaminasPuro y Laminas (un lienzo 2D como textura de un cartel en el mundo: colocación delante a la altura de los ojos, giro suave, cierre por distancia o al salir de VR, repintado solo si cambia la firma, liberado entero y alTocar(u, v) para el rayo y el gatillo). Sin reloj propio: lo mueve 90_final (Laminas.revisa) y 29_vr (Laminas.toca). Los trozos [puro:…] y [motor:…] (en el .ts) los evalúa en Node pruebas/guardianes/laminas.test.js.
// ===============================================================================
  // ---------- las láminas (ADR-0023, C8; doc/sistema/COMPONENTES.md): un lienzo 2D como textura de un cartel en el mundo, anclado al mundo, a la altura de los ojos y
  // delante de la mirada; se vuelve despacio hacia quien lo mira, se repinta SOLO si cambia lo que se ve, se cierra solo si te alejas o sales de VR y se libera entero.
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/laminas.ts (LaminasPuro y Laminas), componente «laminas-mundo» de TODOS los mundos con un
  // libera() que cierra las que queden y se borra del Bus. Aquí solo se cablea lo del legado: casi todo lo que usa se monta DESPUÉS de este módulo (InfoDibujo en
  // 02h; scene, camera, renderer y texColor en 03; VRX en 29) y entra por getter.
  // [talón] apps/web/src/ui/laminas.ts
  var LaminasPuro = Interfaz.LaminasPuro;
  var Laminas = Interfaz.creaLaminas({
    THREE: THREE, Bus: Bus, get Materiales() { return Materiales; }, get InfoDibujo() { return InfoDibujo; }, get scene() { return scene; }, get camera() { return camera; }, get renderer() { return renderer; },
    get texColor() { return texColor; }, get VRX() { return VRX; }, documento: document
  });
  Componentes.registra(Interfaz.manifiestoLaminas(Laminas));
