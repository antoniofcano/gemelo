// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (suelo), 02c_componentes (Componentes), 02e_entidades (Entidades), 02i_materiales (Materiales),
//   02j_estaticos (Estaticos), 03_escena (scene, camera, Estado), 09_camara (objetivo), 12_paseo (paseando, pp), 12b_llegada (Llegada),
//   16_vida (enQuad), 17_minimapa (Minimapa), 26_presencia (Aspecto, Encuentro, sitioJunto), 29_vr (VRX)
// Nota: Talón (MU5-n, A3-8b) de apps/web/src/mundos/exterior/oficina-balizas.ts, componente «oficina-balizas» de los mundos ["exterior"]: las balizas oficiales (tipo «baliza-oficial» de Entidades, GET /api/balizas-oficiales, una capa del minimapa, dos mallas instanciadas). Consume la oficina de 39 (OficinaMundo): ?oficina=0 la apaga con ella.
// ===============================================================================
  // ---------- las balizas oficiales de la oficina (OF10; A3-8b), componente del exterior que consume el de 39. Lo que otros reescriben (VRX, paseando, enQuad), por getter.
  // [talón] apps/web/src/mundos/exterior/oficina-balizas.ts
  Componentes.registra(Mundos.manifiestoOficinaBalizas({
    THREE: THREE, D: D, suelo: suelo, Componentes: Componentes, Entidades: Entidades, Estaticos: Estaticos, Materiales: Materiales, scene: scene, camera: camera, Estado: Estado, objetivo: objetivo, pp: pp,
    Llegada: Llegada, Minimapa: Minimapa, Aspecto: Aspecto, Encuentro: Encuentro, sitioJunto: sitioJunto, get VRX() { return VRX; }, get paseando() { return paseando; }, get enQuad() { return enQuad; }
  }));
