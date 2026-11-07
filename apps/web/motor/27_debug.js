// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02_mundo (Mundo, suelo, copas), 02b_cola (Cola), 02h_render (InfoDibujo), 03_escena (renderer, scene, camera, Estado),
//   04b_escena3d (Escena3D), 04c_olivos_tiles (OlivosTiles), 04f_suelo_fotos (SueloFotos), 07a_catalogo (Catalogo), 07ab_generados (Generados),
//   07ac_lejanos (Lejanos), 07b_arboles (Arboles), 08_marcadores (Marcadores, aplica), 09_camara (objetivo, orb, pon),
//   12_paseo (paseando, teclas, pp, entraPaseo, salePaseo)
// Nota: Talón (MU5-n, A3-7a) de apps/web/src/ui/ganchos.ts: publica window.__g, el gancho de las pruebas (contrato en doc/sistema/CONTRATOS.md). No es un componente.
// ===============================================================================
  // ---------- ganchos de depuración y de prueba: window.__g (contrato en doc/sistema/CONTRATOS.md), solo lectura y ajuste de cámara; sinDibujo para las pruebas de DOM.
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/ganchos.ts. No es un componente (nada que soltar; vive lo que la página). Aquí solo se cablea
  // lo del legado: lo de siempre por valor, al cargarse, como antes; lo que cambia (paseando, teclas, listo), por getter.
  // [talón] apps/web/src/ui/ganchos.ts
  var Ganchos = Interfaz.creaGanchos({
    Arboles: Arboles, Catalogo: Catalogo, Escena3D: Escena3D, OlivosTiles: OlivosTiles, Cola: Cola, SueloFotos: SueloFotos, Generados: Generados, Lejanos: Lejanos, Mundo: Mundo,
    InfoDibujo: InfoDibujo, Estado: Estado, copas: copas, suelo: suelo, orb: orb, objetivo: objetivo, camera: camera, renderer: renderer, scene: scene, pon: pon, aplica: aplica,
    entraPaseo: entraPaseo, salePaseo: salePaseo, pp: pp, get paseando() { return paseando; }, get teclas() { return teclas; }, get listo() { return Marcadores.listo(); }, ventana: window
  });
