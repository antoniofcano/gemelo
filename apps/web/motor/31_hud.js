// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Hud
// Consume: 01_datos ($), 02c_componentes (Bus, Componentes), 03_escena (lienzo, visor, camera), 09_camara (orb), 12_paseo (paseando, pp),
//   16_vida (enQuad, enDron, ponQuad, dr, ponDron), 24_pantalla (Menu), 29_vr (VRX), 32_ventanas (Ventanas), 33_ajustes (Ajustes),
//   34_movibles (Movibles)
// ===============================================================================
  // ---------- el HUD (doc/sistema/UX-FINCA-JUEGO.md §4.3): estado arriba a la izquierda, barra de iconos arriba a la derecha, avisos arriba en el centro, «Pasear» y la
  // atribución abajo; el selector de modo, el teclado y los pulgares. Expone Hud.aviso, Hud.zonasProhibidas, Hud.modo, Hud.icono, Hud.alInicio…
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/hud.ts (HudPuro y Hud), componente «hud» de TODOS los mundos con un libera() que para sus
  // dos relojes (L2-11) y quita sus escuchas y su observador. Aquí solo se cablea lo del legado: lo que cambia o se declara después entra por getter.
  // [talón] apps/web/src/ui/hud.ts
  var HudPuro = Interfaz.HudPuro;
  var Hud = Interfaz.creaHud({
    $: $, Bus: Bus, THREE: THREE, lienzo: lienzo, visor: visor, camera: camera, orb: orb, pp: pp, dr: dr, VRX: VRX, ponQuad: ponQuad, ponDron: ponDron,
    get paseando() { return paseando; }, get enQuad() { return enQuad; }, get enDron() { return enDron; },
    get Ventanas() { return typeof Ventanas !== "undefined" ? Ventanas : undefined; }, get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; },
    get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; }, get Menu() { return typeof Menu !== "undefined" ? Menu : undefined; },
    ventana: window, documento: document
  });
  Componentes.registra(Interfaz.manifiestoHud(Hud));
