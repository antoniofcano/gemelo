// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Componentes), 02d_laminas (Laminas), 03_escena (visor), 26_presencia (SalaPose), 29_vr (VRX, PanelVR), 31_hud (Hud),
//   32_ventanas (Ventanas)
// Nota: Componente «visita-guiada» (F3f, absorbe OF12; ADR-0026, decisiones 155 y 157-162): la visita guiada en el mundo, solo en una sala «guiada-<evento>» de la red. Para todos, quién tiene la palabra y su cuenta atrás (atributo palabra_hasta de la api) y el cierre (tema «cierre», solo sin participante: cuenta atrás y vuelta sola a la visita libre). Con papel de guía u oficina, la ventana «Visita guiada» (preparar, manos en orden, dar la palabra, +1 min, cortar, silenciar a todos, sacar, cerrar con aviso; lo que no tiene vuelta, pulsando dos veces) y en VR una fila del panel con lo esencial. Todo por la api (F3c, F3f); textContent siempre. Consume la red, la presencia y la voz. Emite «guiada:palabra» y «guiada:cierre»; escucha «voz:estado» y «depura:lineas». ?guia=0 lo apaga. Publica window.__guiada (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/guiada.test.js.
// ===============================================================================
  // ---------- la visita guiada en el mundo (F3f; absorbe OF12; ADR-0026, decisiones 155 y 157-162). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación
  // viven en apps/web/src/ui/guiada.ts, componente «visita-guiada» de TODOS los mundos con un libera() que, además de lo de siempre (salas, panel, lámina, tira y
  // window.__guiada), cancela las peticiones a la api en vuelo. Aquí solo se cablea lo del legado: VRX y PanelVR (29_vr), que el código comprobaba con typeof, entran por getter.
  // [talón] apps/web/src/ui/guiada.ts
  Componentes.registra(Interfaz.manifiestoGuiada({
    SalaPose: SalaPose, Laminas: Laminas, visor: visor, Ventanas: Ventanas, Hud: Hud,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; }
  }));
