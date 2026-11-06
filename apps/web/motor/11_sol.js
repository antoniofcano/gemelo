// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02c_componentes (Componentes), 03_escena (LUZ_SOL, LUZ_CIELO, hemi, sol)
// Nota: Talón (MU5-n, A3-4) de apps/web/src/mundos/exterior/sol-reserva.ts: sol2() (el sol según el deslizador de reserva #hora, que actualizaTiempo pisa en cada fotograma; L8-03), componente «sol-reserva».
// ===============================================================================
  // ---------- el sol según la hora del deslizador de reserva (#hora, oculto): un residuo que actualizaTiempo (15_tiempo) pisa en cada fotograma (L8-03).
  // MU5-n (A3-4): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/sol-reserva.ts, componente «sol-reserva» con su libera(). Aquí solo se cablea.
  // [talón] apps/web/src/mundos/exterior/sol-reserva.ts
  var SolReserva = Mundos.creaSolReserva({ $: $, sol: sol, hemi: hemi, LUZ_SOL: LUZ_SOL, LUZ_CIELO: LUZ_CIELO });
  Componentes.registra(Mundos.manifiestoSolReserva(SolReserva));
