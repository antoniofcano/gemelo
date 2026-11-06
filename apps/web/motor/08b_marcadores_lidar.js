// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02_mundo (suelo, copas, cIn, marc), 02c_componentes (Componentes), 02g_vr_presupuesto (VrPresupuesto),
//   02i_materiales (Materiales), 02j_estaticos (Estaticos), 03_escena (scene, colorCss, Estado), 08_marcadores (listo)
// ===============================================================================

  // ---------- los marcadores de la nube LiDAR (componente «marcadores-lidar», ADR-0023, C10 tercera tanda): las copas detectadas (octaedros), los olivos guardados en
  // OlivarTrack (anillos) y las líneas de desfase entre ambos. MU5-n (A3-2b): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/marcadores-lidar.ts, componente
  // de los mundos ["exterior"] con un libera() que suelta mallas, geometrías y materiales. aplica() (08_marcadores.js) les avisa con «mundo:aplica» y capas() con «capas:cambia».
  // ?marcadores=0 los apaga. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/marcadores-lidar.ts
  Componentes.registra(Mundos.manifiestoMarcadoresLidar({
    THREE: THREE, scene: scene, Estaticos: Estaticos, colorCss: colorCss, cIn: cIn, marc: marc, copas: copas, suelo: suelo, Estado: Estado,
    listo: function () { return listo; }, $: $, Materiales: Materiales,
    VrPresupuesto: typeof VrPresupuesto !== "undefined" ? VrPresupuesto : null
  }));
