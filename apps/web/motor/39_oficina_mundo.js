// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (suelo), 02c_componentes (Componentes), 02d_laminas (Laminas), 02e_entidades (Entidades),
//   02j_estaticos (Estaticos), 03_escena (visor, scene, camera, Estado), 09_camara (objetivo), 12_paseo (paseando, pp), 12b_llegada (Llegada),
//   13b_hazas (HazasPuro), 16_vida (enQuad), 17_minimapa (Minimapa), 26_presencia (Aspecto, Chat, Encuentro, sitioJunto), 29_vr (VRX), 31_hud (Hud),
//   32_ventanas (Ventanas)
// Nota: Componente «oficina-mundo» (OF10, ADR-0023 y ADR-0024; decisiones 107 y 114): lo que la oficina hace en el mundo. Solo se registra; nadie lo nombra. Consume la red (sala «visita») y la presencia. Anuncios (tema «anuncio»: aviso arriba, lámina en VR y chat), invitación a otra sala (tema «sala»: «Ir» o «Quedarme»), balizas oficiales (tipo «baliza-oficial» de Entidades, GET /api/balizas-oficiales, tema «balizas») y, si tu rol en la sala es de oficina, la ventana «Oficina» (anunciar, invitar, poner baliza). Los tres temas solo valen SIN participante (los manda la api). Emite oficina:anuncio y oficina:sala. Publica window.__oficinaMundo (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/oficina_mundo.test.js.
// ===============================================================================
  // ---------- el mundo en modo oficina (OF10; doc/sistema/OFICINA.md §6; ADR-0024; decisiones 107 y 114). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la
  // explicación viven en apps/web/src/mundos/exterior/oficina-mundo.ts, componente de los mundos ["exterior"] (las balizas oficiales son de su escena, su suelo y su minimapa)
  // con un libera() que, además de lo de siempre, cancela las peticiones a la api en vuelo. Aquí solo se cablea lo del legado: lo que otros reescriben (VRX, paseando, enQuad)
  // entra por getter.
  // [talón] apps/web/src/mundos/exterior/oficina-mundo.ts
  Componentes.registra(Mundos.manifiestoOficinaMundo({
    THREE: THREE, D: D, suelo: suelo, Componentes: Componentes, Laminas: Laminas, Entidades: Entidades, Estaticos: Estaticos, visor: visor, scene: scene, camera: camera, Estado: Estado,
    objetivo: objetivo, pp: pp, Llegada: Llegada, HazasPuro: HazasPuro, Minimapa: Minimapa, Aspecto: Aspecto, Chat: Chat, Encuentro: Encuentro, sitioJunto: sitioJunto, Hud: Hud, Ventanas: Ventanas,
    get VRX() { return VRX; }, get paseando() { return paseando; }, get enQuad() { return enQuad; }
  }));
