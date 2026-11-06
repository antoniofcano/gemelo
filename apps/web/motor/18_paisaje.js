// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: colocaPaisaje, sombrasSol, instSombra, aguaNivel, actualizaPaisaje, ejeArroyo, distArroyo
// Consume: 01_datos (D, $, ESC_R8), 02_mundo (suelo, copas), 02c_componentes (Componentes), 02g_vr_presupuesto (VrPresupuesto),
//   02i_materiales (Materiales), 02j_estaticos (Estaticos), 03_escena (scene, SRGB, Estado), 04d_sombreado_tiles (hash), 06_arboles (gSombras),
//   07_follaje (matSombra, geoSombra), 15_tiempo (nivelEn, cur, tMundo), 23_estacion (EST)
// ===============================================================================
  // ---------- el paisaje que sale del LiDAR: edificios (clase 6), el tendido y sus postes, el arroyo y los árboles que no son olivos
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/paisaje.ts (Mundos.creaPaisaje), componente «paisaje-lidar» de los mundos ["exterior"] con un libera()
  // que suelta el grupo, las geometrías, los InstancedMesh, los materiales y la malla de sombras que añade al grupo de 06_arboles (L2-05). Aquí solo se cablea lo del legado.
  // Lo que otros módulos escriben o leen suelto no puede ser una importación (MUNDOS §9.3): 07_follaje asigna instSombra (la malla de sombras de los olivos) y este módulo la lee por
  // una función; aguaNivel lo mueve actualizaPaisaje (por ponAgua) y lo leen 20_sonido y 22_huellas. Las dos variables nacen aquí con el valor inicial que da el módulo.
  // [talón] apps/web/src/mundos/exterior/paisaje.ts
  var Paisaje = Mundos.creaPaisaje({
    THREE: THREE, D: D, $: $, ESC_R8: ESC_R8, suelo: suelo, copas: copas, hash: hash, SRGB: SRGB, Estado: Estado, Estaticos: Estaticos, Materiales: Materiales, scene: scene,
    gSombras: gSombras, matSombra: matSombra, geoSombra: geoSombra, cur: cur, nivelEn: nivelEn, EST: EST, VrPresupuesto: typeof VrPresupuesto !== "undefined" ? VrPresupuesto : null,
    instSombra: function () { return instSombra; }, tMundo: function () { return tMundo; }, ponAgua: function (v) { aguaNivel = v; }
  });
  var colocaPaisaje = Paisaje.colocaPaisaje, sombrasSol = Paisaje.sombrasSol, instSombra = Paisaje.instSombra, aguaNivel = Paisaje.aguaNivel;
  var actualizaPaisaje = Paisaje.actualizaPaisaje, ejeArroyo = Paisaje.ejeArroyo, distArroyo = Paisaje.distArroyo;
  Componentes.registra(Mundos.manifiestoPaisaje(Paisaje));
