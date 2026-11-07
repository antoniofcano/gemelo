// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Parcelas, parcelas, fincas, claseUsda, elegirParcela, elegirFinca
// Consume: 01_datos (D, $, tinta, fmt, DIST_INI), 02_mundo (suelo, copas, cIn, marc, med), 02c_componentes (Componentes), 03_escena (Estado),
//   08_marcadores (aplicaLuego), 09_camara (objetivo, orb), 33_ajustes (Ajustes)
// Nota: Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/parcelas.ts: el selector de fincas y parcelas, las cifras de «Lo medido» y la ficha del suelo; componente «selector-parcelas» de los mundos ["exterior"] con su libera(). Lo elegido (fincaSel y parcelaSel) ya no son variables de aquí: 09 y 12 lo piden por Parcelas.parcelaSel() y Parcelas.fincaSel().
// ===============================================================================
  // ---------- parcelas: selector, cifras y suelo de cada una. MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/parcelas.ts, componente
  // «selector-parcelas» de los mundos ["exterior"] con un libera() que suelta sus escuchas, sus nodos, el aplazado y la suscripción a Configuración. Aquí solo se cablea lo del legado:
  // lo elegido (fincaSel y parcelaSel) ya no son variables de aquí: 09 y 12 lo piden por Parcelas.parcelaSel() y Parcelas.fincaSel(); Ajustes (33, que se monta después) entra por getter.
  // [talón] apps/web/src/mundos/exterior/parcelas.ts
  var Parcelas = Mundos.creaParcelas({
    D: D, $: $, tinta: tinta, fmt: fmt, DIST_INI: DIST_INI, suelo: suelo, copas: copas, cIn: cIn, marc: marc, med: med, Estado: Estado, aplicaLuego: aplicaLuego, objetivo: objetivo, orb: orb,
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }
  });
  var parcelas = Parcelas.parcelas, fincas = Parcelas.fincas, claseUsda = Parcelas.claseUsda, elegirParcela = Parcelas.elegirParcela, elegirFinca = Parcelas.elegirFinca;
  Componentes.registra(Mundos.manifiestoParcelas(Parcelas));
