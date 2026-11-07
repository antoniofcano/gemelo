// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02c_componentes (Componentes), 31_hud (Hud)
// Nota: Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/mundo-hoy.ts: MundoHoyPuro y el componente «mundo-hoy» de los mundos ["exterior"] (EV-3a, contratos/mundo-hoy.md), con su libera() (reloj, petición en vuelo y tarjeta). Solo se registra; nadie lo nombra. Con D.base /teselas/… o ?api= pide GET /api/mundo/hoy (mismo origen) al montar y cada 10 min y pinta la tarjeta «Hoy en el campo» en Tiempo y estación → Ahora (textContent) y el primer aviso en el HUD; sin servidor no pide nada. Emite «mundo:hoy» (la línea del tablón de 44b_carteles.js y el trabajo de 54_trabajo_hoy.js). Los trozos [puro] y [motor] los evalúa en Node pruebas/guardianes/mundo_hoy.test.js (que lee el .ts como JavaScript, _fuente.js).
// ===============================================================================
  // ---------- el mundo de hoy (EV-3a; contratos/mundo-hoy.md, v 1): la tarjeta «Hoy en el campo» en «Tiempo y estación → Ahora» y el primer aviso en el HUD, con lo que
  // el servidor lee de OlivarTrack y de Vigía. MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/mundo-hoy.ts (MundoHoyPuro y el
  // componente «mundo-hoy» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado: el HUD (31) se pide por getter.
  // [talón] apps/web/src/mundos/exterior/mundo-hoy.ts
  Componentes.registra(Mundos.manifiestoMundoHoy({ D: D, $: $, get Hud() { return Hud; } }));
