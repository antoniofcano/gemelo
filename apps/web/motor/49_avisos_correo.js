// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02c_componentes (Componentes), 13b_hazas (HazasPuro), 33_ajustes (Ajustes)
// Nota: Componente «avisos-correo» (OF11f; petición de Antonio, 2026-11-02): el interruptor «Avisarme por correo de los eventos» en Configuración (pestaña «Cuenta»). Solo se registra; nadie lo nombra. Con servidor y sesión pregunta GET /api/yo/avisos y, si responde, registra la casilla con Ajustes.registra; al cambiarla manda PUT /api/yo/avisos y, si falla, la devuelve a lo que había. Sin servidor, sin sesión o con error no se muestra. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/avisos_correo.test.js.
// ===============================================================================
  // ---------- el interruptor «Avisarme por correo de los eventos» (OF11f). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación viven en
  // apps/web/src/ui/avisos-correo.ts, componente «avisos-correo» de TODOS los mundos con un libera() que quita la casilla de Configuración y cancela las peticiones en vuelo.
  // Aquí solo se cablea lo del legado: D, HazasPuro y, por getter, Ajustes (33, que el código comprobaba con typeof).
  // [talón] apps/web/src/ui/avisos-correo.ts
  Componentes.registra(Interfaz.manifiestoAvisosCorreo({ D: D, HazasPuro: HazasPuro, get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; } }));
