// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02c_componentes (Componentes)
// Nota: Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/vista-familia.ts: VistaFamiliaPuro y el componente «vista-familia» de los mundos ["exterior"] (U9; petición de Antonio, 2026-11-02), con su libera() (estilos, rótulo, modo forzado y la petición de la sesión en vuelo). Solo se registra; nadie lo nombra. Con rol de familia (GET /api/sesion → rol distinto de oficina y admin) o ?vista=familia oculta el selector de modo (queda Gemelo), «Guardados» y «Desfase» de Capas y de Mapa y rotula «Copas del LiDAR» como «Olivos»; con oficina, admin, sin sesión o ?vista=completa no toca nada. Es presentación, no seguridad. Los trozos [puro] y [motor] los evalúa en Node pruebas/guardianes/vista_familia.test.js (que lee el .ts como JavaScript, _fuente.js).
// ===============================================================================
  // ---------- la vista simple para las familias (U9; petición de Antonio, 2026-11-02): oculta controles de «Capas y vista» y de «Mapa y parcelas» que a una familia no le dicen nada.
  // MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/vista-familia.ts (VistaFamiliaPuro y el componente «vista-familia» de los mundos
  // ["exterior"], con su libera()). Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/vista-familia.ts
  Componentes.registra(Mundos.manifiestoVistaFamilia({ D: D }));
