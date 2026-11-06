// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (copas), 02c_componentes (Componentes), 02i_materiales (Materiales), 02k_fusiona (fusionaGeometrias),
//   03_escena (camera, texColor), 04d_sombreado_tiles (hash), 07_follaje (matSombra, geoSombra), 12_paseo (paseando, pp),
//   16_vida (tVida, enQuad, gFauna, altSuelo, enDron), 17_minimapa (Minimapa), 22_huellas (pendienteRumbo, sueloSeco)
// Nota: TALÓN (MU5-n, A3-5): el código vive en apps/web/src/mundos/exterior/perros.ts (Mundos.manifiestoPerros). Publica además window.__perrosDebug (depuración).
// ===============================================================================
  // ---------- los perros del paseo: una dálmata adulta y un cruce de dálmata y mastín (rubio y sin manchas). Te siguen, exploran, persiguen conejos y vuelven a tu lado.
  // Componente «perros-paseo» (ADR-0023, C10): solo se registra. Nadie lo nombra: el aterrizaje y la VR le dicen «perros:llegan»; la fauna le pregunta «perros:amenaza» (rellena res
  // con el punto del que huir, o nada); el minimapa los pinta con su capa (Minimapa.capa); el ladrido sale por «sonido:ladrido» y el polvo por «polvo:emite».
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/perros.ts, componente de los mundos ["exterior"] con un libera() que quita el grupo de gFauna,
  // suelta mallas, geometrías, materiales y texturas, para el reloj del primer ladrido y quita la capa del minimapa, las escuchas y window.__perrosDebug. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/perros.ts
  Componentes.registra(Mundos.manifiestoPerros({
    THREE: THREE, Materiales: Materiales, D: D, copas: copas, camera: camera, texColor: texColor, hash: hash, geoSombra: geoSombra, matSombra: matSombra,
    paseando: function () { return paseando; }, pp: pp,   // 12_paseo: paseando cambia
    tVida: function () { return tVida; }, enQuad: function () { return enQuad; }, enDron: function () { return enDron; },   // 16_vida: el estado del paseo (cambian cada fotograma: por función)
    gFauna: gFauna, altSuelo: altSuelo, pendienteRumbo: pendienteRumbo, sueloSeco: sueloSeco, Minimapa: Minimapa, fusionaGeometrias: fusionaGeometrias,
    document: document, window: window,
    reloj: { setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (id) { clearTimeout(id); } }
  }));
