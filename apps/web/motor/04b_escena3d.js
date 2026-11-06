// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Escena3D
// Consume: 01_datos (D), 01a_aparato (Aparato), 02_mundo (Mundo, suelo), 02b_cola (CargaPuro, Cola), 02c_componentes (Componentes),
//   02f_xr_perillas (XrPerillas), 02l_tope_tiles (TopeTilesPuro), 02m_tope_olivos (TopeOlivos), 03_escena (renderer, scene, camera, Estado),
//   04c_olivos_tiles (OlivosTiles), 04d_sombreado_tiles (SombreadoTiles), 09_camara (objetivo)
// ===============================================================================
  // ---------- la escena en 3D Tiles 1.1 (ADR-0015; formato en doc/sistema/TILES3D.md): la ÚNICA escena (T8 fase 2, decisión 79). MU5-n (A3-1b): migrada a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/escena-tiles.ts (RayosPuro, limitaAviso, motivoMarco y el caché LRU propio, que son puros; el módulo con su estado; y el componente «escena-tiles» de los mundos
  // ["exterior"], con un libera() que suelta el TilesRenderer y lo que cuelga de él). Dibuja el relieve con 3DTilesRendererJS desde un tileset.json de tuberia/tiles3d/, con el sombreado de
  // 04d; sin tileset, o si falla, estado "sin" y el aviso #sinEscena. Los olivos del glb los gestiona 04c por los ganchos de engancha(). Aquí solo se cablea lo del legado; 04d, 04c y 09_camara
  // montan después de este módulo, así que se piden en cada uso (SombreadoTiles, OlivosTiles y objetivo no existen aún cuando una escena sin tileset falla al definirse).
  // [talón] apps/web/src/mundos/exterior/escena-tiles.ts
  var Escena3D = Mundos.creaEscena3D({
    THREE: THREE, D: D, Aparato: Aparato, CargaPuro: CargaPuro, TopeTilesPuro: TopeTilesPuro, TopeOlivos: TopeOlivos, XrPerillas: XrPerillas, Cola: Cola, Mundo: Mundo, suelo: suelo,
    renderer: renderer, scene: scene, camera: camera, Estado: Estado, busqueda: location.search, documento: typeof document !== "undefined" ? document : null, consola: console,
    SombreadoTiles: function () { return SombreadoTiles; },
    OlivosTiles: function () { return typeof OlivosTiles !== "undefined" ? OlivosTiles : null; },
    objetivo: function () { return typeof objetivo !== "undefined" ? objetivo : null; },
    cargaTiles: function () { return import("3d-tiles-renderer"); },   // la librería, en su trozo aparte (Vite)
    cargaBvh: function () { return import("three-mesh-bvh"); }   // solo con ?bvh
  });
  Componentes.registra(Mundos.manifiestoEscena3D(Escena3D));
