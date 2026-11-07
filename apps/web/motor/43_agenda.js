// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02c_componentes (Bus, ConfigPuro, Componentes), 29_vr (PanelVR), 31_hud (Hud), 32_ventanas (Ventanas)
// Nota: Componente «agenda» (OF11d, ADR-0023; decisiones 145-148): la agenda de la finca dentro del mundo. Solo se registra; nadie lo nombra. Montado (solo con servidor): icono y ventana «Agenda» con los próximos eventos, plazas libres, tu estado (apuntados / en espera) y, solo si la api dice puede_inscribirse, apuntarse o borrarse con el número de personas (1-10); en VR, una fila en la pestaña Mundo del panel que lista los próximos y dice «Apúntate desde el móvil o el ordenador» (nadie se apunta desde las gafas). Todo lo de la api es dato: lista blanca y textContent / fillText. Publica window.__agenda (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/agenda_mundo.test.js.
// ===============================================================================
  // ---------- la agenda dentro del mundo (OF11d; decisiones 145-148, doc/sistema/OFICINA.md §7). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación
  // viven en apps/web/src/ui/agenda.ts, componente «agenda» de TODOS los mundos con un libera() que cancela las peticiones en vuelo y la espera de «Entrar en la visita»
  // (lo demás lo suelta, como antes, el núcleo con n.limpia). Aquí solo se cablea lo del legado: PanelVR (29_vr), que el código comprobaba con typeof, entra por getter.
  // [talón] apps/web/src/ui/agenda.ts
  Componentes.registra(Interfaz.manifiestoAgenda({
    D: D, Bus: Bus, ConfigPuro: ConfigPuro, Hud: Hud, Ventanas: Ventanas, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; }
  }));
