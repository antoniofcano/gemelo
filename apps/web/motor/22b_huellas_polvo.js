// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02_mundo (suelo), 02c_componentes (Componentes), 02i_materiales (Materiales), 02j_estaticos (Estaticos), 03_escena (scene, Estado),
//   12_paseo (paseando, teclas, pp), 15_tiempo (nivelEn, cur), 16_vida (tVida, enQuad, vq, enDron, altSuelo, dr), 22_huellas (sueloSeco)
// ===============================================================================
  // ---------- huellas y polvo (componente «huellas-polvo», ADR-0023, C10): las pisadas y rodadas que se desvanecen y las bocanadas de polvo del suelo seco. Quien levanta polvo (el
  // aterrizaje del muñequito, los perros) lo pide por el Bus con «polvo:emite»; apagado (?huellas=0) no se dibuja nada y esos eventos no los atiende nadie.
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/huellas-polvo.ts, componente de los mundos ["exterior"] con un libera() que quita las dos
  // mallas de la escena y suelta sus geometrías y sus materiales. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/huellas-polvo.ts
  Componentes.registra(Mundos.manifiestoHuellasPolvo({
    THREE: THREE, scene: scene, Estaticos: Estaticos, Materiales: Materiales, suelo: suelo, Estado: Estado,
    pp: pp, paseando: function () { return paseando; }, teclas: function () { return teclas; },   // 12_paseo: paseando cambia y teclas se reemplaza al salir del paseo
    cur: cur, nivelEn: nivelEn,
    tVida: function () { return tVida; }, enQuad: function () { return enQuad; }, vq: function () { return vq; }, enDron: function () { return enDron; },   // 16_vida: el estado del paseo
    dr: dr, altSuelo: altSuelo, sueloSeco: sueloSeco
  }));
