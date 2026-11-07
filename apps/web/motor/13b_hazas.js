// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: HazasPuro, Hazas
// Consume: 01_datos (D), 02_mundo (suelo), 02c_componentes (Bus, Componentes), 02e_entidades (Entidades, Usables), 03_escena (camera, Estado),
//   09_camara (objetivo), 12_paseo (paseando, pp)
// Nota: Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/hazas.ts: HazasPuro y el componente «hazas-mundo» de los mundos ["exterior"] (con su libera()). Sin D.base /teselas/… ni ?api= no pide nada ni crea nada. No dibuja la linde: la da con Hazas.lindes() y avisa con «hazas:cambia» (la dibuja 44_lindes.js). El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/hazas.test.js (que lee el .ts como JavaScript, _fuente.js).
// ===============================================================================
  // ---------- las hazas en el mundo (F1, el «3c»): sus límites (los dibuja sobre el suelo el componente «lindes-hazas», 44_lindes.js, con Hazas.lindes() y el evento
  // «hazas:cambia») y, al tocar una, su ficha pública (ADR-0014, contratos/haza.schema.json). MU5-n (A3-7b1): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/hazas.ts (HazasPuro y el componente «hazas-mundo» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado:
  // «paseando» (que 12_paseo reescribe) entra por getter.
  // [talón] apps/web/src/mundos/exterior/hazas.ts
  var HazasPuro = Mundos.HazasPuro;
  var Hazas = Mundos.creaHazas({
    THREE: THREE, D: D, Bus: Bus, Entidades: Entidades, Usables: Usables, camera: camera, Estado: Estado, suelo: suelo, objetivo: objetivo, pp: pp, get paseando() { return paseando; }
  });
  Componentes.registra(Mundos.manifiestoHazas(Hazas));
