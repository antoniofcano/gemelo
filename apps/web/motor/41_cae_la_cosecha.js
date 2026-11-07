// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Bus, Componentes)
// Nota: Componente «cae-la-cosecha» (ADR-0023, C9a): el primer juego casual (diseño propio del género «piezas que caen»). Solo se registra; nadie lo nombra. Se ofrece al anfitrión por el Bus y pide sus sonidos con «sonido:juego». Los trozos [puro:…] (las reglas, con semilla) y [dibujo:…] los evalúa en Node pruebas/guardianes/juego_cosecha.test.js.
// ===============================================================================

  // ---------- «Cae la cosecha» (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación viven en
  // apps/web/src/mundos/exterior/cae-la-cosecha.ts, componente de los mundos ["exterior"] (es un juego del olivar, que se ofrece al anfitrión de juegos, también del exterior).
  // Aquí solo se cablea el Bus, con el que se retira del anfitrión al liberarse.
  // [talón] apps/web/src/mundos/exterior/cae-la-cosecha.ts
  Componentes.registra(Mundos.manifiestoCaeLaCosecha({ Bus: Bus }));
