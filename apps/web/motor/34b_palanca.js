// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02c_componentes (Componentes), 03_escena (lienzo, visor), 09_camara (sensMirar),
//   12_paseo (paseando, PalancaPuro, ponPalanca, giraPalanca), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- la palanca flotante (EV2-B2): andar con el pulgar, encendida por defecto en pantalla táctil; arrastrar la otra mitad gira al paseante (nipplejs 1.0.4, MIT; regla 12).
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/palanca.ts, componente «palanca-tactil» de TODOS los mundos con un libera() que destruye la palanca y
  // quita sus escuchas. Aquí solo se cablea lo del legado; el import() de nipplejs se queda escrito aquí para que Vite lo trocee igual (solo se pide la primera vez que hace falta).
  // [talón] apps/web/src/mundos/comun/palanca.ts
  var Palanca = Mundos.creaPalanca({
    $: $, lienzo: lienzo, visor: visor, documento: document, busqueda: typeof location !== "undefined" ? location.search : "", PalancaPuro: PalancaPuro, ponPalanca: ponPalanca,
    giraPalanca: giraPalanca, sensMirar: sensMirar, paseando: function () { return paseando; }, Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; },
    cargaNipple: function () { return import("nipplejs"); }
  });
  Componentes.registra(Mundos.manifiestoPalanca(Palanca));
