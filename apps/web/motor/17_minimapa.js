// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Minimapa, actualizaMinimapa
// Consume: 01_datos (D, $, x0, yN, ANCHO, ALTO), 02_mundo (Mundo, cIn), 02c_componentes (Componentes), 02e_entidades (Entidades, Usables),
//   12_paseo (paseando, pp), 16_vida (enQuad, enDron, dr), 19_balizas (avisoBaliza, dibujaBalizasMini), 34_movibles (Movibles)
// ===============================================================================
  // ---------- el minimapa del paseo: la ortofoto vista desde arriba con tú, tu rastro, el dron, las balizas y los demás (M o un toque cambia el zoom), en una ventana
  // flotante. MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/minimapa.ts (Minimapa y actualizaMinimapa), componente «minimapa» SOLO DEL
  // EXTERIOR (dibuja la finca) con un libera() que quita sus escuchas y devuelve #mapita a su sitio. Aquí solo se cablea lo del legado: lo que cambia (paseando,
  // enQuad, enDron) o se declara después (avisoBaliza y dibujaBalizasMini de 19_balizas, Movibles de 34) entra por getter.
  // [talón] apps/web/src/ui/minimapa.ts
  var MinimapaUI = Interfaz.creaMinimapa({
    $: $, D: D, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, Mundo: Mundo, cIn: cIn, Entidades: Entidades, Usables: Usables, pp: pp, dr: dr,
    get paseando() { return paseando; }, get enQuad() { return enQuad; }, get enDron() { return enDron; }, get avisoBaliza() { return avisoBaliza; },
    get dibujaBalizasMini() { return dibujaBalizasMini; }, get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; }, ventana: window, documento: document
  });
  var Minimapa = MinimapaUI.Minimapa, actualizaMinimapa = MinimapaUI.actualizaMinimapa;
  Componentes.registra(Interfaz.manifiestoMinimapa(MinimapaUI));
