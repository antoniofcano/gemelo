// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: HudPersonalPuro
// Consume: 01_datos ($), 02c_componentes (Bus, Componentes), 02e_entidades (Usables), 09_camara (objetivo), 12_paseo (paseando, pp),
//   13b_hazas (Hazas), 15_tiempo (horaMundoTexto), 31_hud (Hud)
// ===============================================================================
  // ---------- lo tuyo en pantalla (EV2-A4, doc/sistema/VIABILIDAD-INTERACCION.md): «hora · tu haza · hablar · volver» juntos, bajo el tiempo del HUD (#hudPersonal).
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/hud-personal.ts (HudPersonalPuro, que también usa el menú de muñeca de VR), componente
  // «hud-personal» de TODOS los mundos con un libera() que para su reloj (L2-11) y quita sus escuchas. Aquí solo se cablea lo del legado: paseando cambia.
  // [talón] apps/web/src/ui/hud-personal.ts
  var HudPersonalPuro = Interfaz.HudPersonalPuro;
  var HudPersonal = Interfaz.creaHudPersonal({
    $: $, Bus: Bus, Hazas: Hazas, horaMundoTexto: horaMundoTexto, objetivo: objetivo, pp: pp, Usables: Usables, Hud: Hud, get paseando() { return paseando; }
  });
  Componentes.registra(Interfaz.manifiestoHudPersonal(HudPersonal));
