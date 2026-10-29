// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Escena3D
// Consume: 01_datos (D, ESC3D), 03_escena (renderer, scene, camera, exag), 04_terreno (Terreno), 08_marcadores (listo, aplica)
// ===============================================================================
  // ---------- la escena en 3D Tiles 1.1 (F1d paso 3b, ADR-0015 Propuesto; formato en doc/sistema/TILES3D.md), solo con ?escena=tiles.
  // Sin la bandera no crea nada y el motor dibuja lo de siempre. Con ella, el relieve con su ortofoto lo dibuja 3DTilesRendererJS (versión
  // fijada en apps/web/package.json) desde un tileset.json de tuberia/tiles3d/, y 04_terreno.js no construye nada (ESC3D.activa).
  // La física y las consultas en CPU (alturas, copa y color de la tierra para el paseo, la VR, las balizas y las huellas) siguen con el json de
  // siempre (decisión 38: doble descarga aceptada); los puntos LiDAR (decisión 37) y las construcciones (decisión 36) no cambian. Los olivos
  // del glb los gestiona 04c_olivos_tiles.js por los ganchos de engancha() (alRaiz, alModelo, alSoltar, alApagar, fotograma); sin él, o si los rechaza, se quitan.
  // Tileset: ?tileset=<ruta relativa> o, por defecto, <D.base>tileset/tileset.json; nunca otro host (§5 de CLAUDE.md: solo el mismo origen).
  // Marco: la raíz lleva LOCAL → ECEF; el grupo lo deshace y pasa de z arriba a y arriba, como la página de prueba de tuberia/tiles3d/, y
  // aplica la exageración vertical en la misma matriz. Si la librería o el tileset fallan, vuelve el relieve de 04_terreno.js (y se avisa una vez).
  var Escena3D = (function () {
    var estado = ESC3D.pedida ? "cargando" : "apagado", motivo = "", tiles = null, Sched = null, raizT = null, exagPuesta = NaN, sesion = null, errores = 0;
    var ERROR_ESCRITORIO = (function () { var m = /[?&]tilesError=([0-9.]+)/.exec(location.search), v = m ? Number(m[1]) : 16; return v > 0 && v <= 256 ? v : 16; })();
    var errorPerfil = null;   // el del perfil VR (29_vr.js, campo e de cada perfil); null = el de escritorio
    var tam = new THREE.Vector2();
    var ganchos = {};   // los pone 04c_olivos_tiles.js con engancha(): alRaiz(tileset), alModelo(scene, tile) → true si se queda con sus olivos, alSoltar(scene), alApagar(motivo), fotograma()
    function url() {
      var m = /[?&]tileset=([^&#]+)/.exec(location.search), u = m ? decodeURIComponent(m[1]) : (D.base || "") + "tileset/tileset.json";
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u)) throw new Error("tileset fuera del mismo origen: " + u);   // ni http(s):, ni data:, ni //host
      return u;
    }
    function falla(e) {
      if (estado === "sin") return;
      estado = "sin"; motivo = String(e && e.message || e); console.warn("escena 3D Tiles: " + motivo + " (vuelve el relieve de siempre)");
      if (tiles) { try { scene.remove(tiles.group); tiles.dispose(); } catch (e2) {} tiles = null; }
      ESC3D.activa = false; Terreno.grupo.visible = true; if (ganchos.alApagar) ganchos.alApagar(motivo);
      if (listo) { Terreno.iniciaMosaico(); Terreno.montaTodas(); aplica(); }   // si ya arrancó; si no, lo montará el arranque (90_final.js)
    }
    function colocaGrupo() {   // tiles.group.matrix = escala vertical (exag) · Rx(−π/2) · transform⁻¹ de la raíz
      if (!tiles || !raizT) return;
      var M = new THREE.Matrix4().makeScale(1, exag, 1).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(raizT.clone().invert());
      tiles.group.matrixAutoUpdate = false; tiles.group.matrix.copy(M); tiles.group.updateMatrixWorld(true); exagPuesta = exag;
    }
    function quitaOlivos(raizModelo) {   // los nodos instanciados del glb (EXT_mesh_gpu_instancing → InstancedMesh): fuera y liberados
      var fuera = [];
      raizModelo.traverse(function (o) { if (o.isInstancedMesh) fuera.push(o); });
      fuera.forEach(function (o) { o.removeFromParent(); o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); o.dispose(); });
    }
    function arranca() {
      var u;
      try { u = url(); } catch (e) { falla(e); return; }
      import("3d-tiles-renderer").then(function (m) {
        if (!m || !m.TilesRenderer) throw new Error("sin 3DTilesRendererJS");
        if (estado !== "cargando") return;
        Sched = m.Scheduler || null;
        tiles = new m.TilesRenderer(u);
        tiles.errorTarget = ERROR_ESCRITORIO;
        tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer);
        tiles.addEventListener("load-root-tileset", function (e) {
          var r = e.tileset && e.tileset.root, G = e.tileset && e.tileset.extras && e.tileset.extras.gemelo;
          if (!r || !r.transform) { falla(new Error("la raíz del tileset no trae transform")); return; }
          if (G && G.finca_id && D.finca_id && G.finca_id !== D.finca_id) { falla(new Error("tileset de " + G.finca_id + " con datos de " + D.finca_id)); return; }
          raizT = new THREE.Matrix4().fromArray(r.transform); colocaGrupo(); estado = "activo";
          if (ganchos.alRaiz) ganchos.alRaiz(e.tileset);
        });
        tiles.addEventListener("load-model", function (e) { if (!(ganchos.alModelo && ganchos.alModelo(e.scene, e.tile))) quitaOlivos(e.scene); e.scene.userData.tesela = { uri: e.tile.content && e.tile.content.uri }; });
        tiles.addEventListener("dispose-model", function (e) { if (ganchos.alSoltar) ganchos.alSoltar(e.scene); });
        tiles.addEventListener("load-error", function (e) {
          errores++; console.error("escena 3D Tiles: tesela con fallo " + (e.url || "") + " " + (e.error && e.error.message || ""));
          if (!raizT) falla(new Error("no se pudo leer " + u));
        });
        scene.add(tiles.group);
      }).catch(falla);
    }
    // el error en pantalla que se pide: el del perfil VR si lo hay; si no, el de escritorio (?tilesError=, 16 px por defecto como la librería)
    function perfil(p) { errorPerfil = p && p.e > 0 ? p.e : null; if (tiles) tiles.errorTarget = errorPerfil || ERROR_ESCRITORIO; }
    // cada fotograma, antes de dibujar. En una sesión XR, como el ejemplo de XR de 3DTilesRendererJS: la cámara de la sesión (sus dos ojos) en
    // lugar de la de siempre, con la resolución de un ojo; y el Scheduler de la librería atado a la sesión (si no, sus colas esperan al
    // requestAnimationFrame de la ventana, que en las gafas no corre)
    function actualiza() {
      if (!tiles) return;
      var xr = renderer.xr, enXR = !!(xr && xr.isPresenting), s = enXR ? xr.getSession() : null;
      if (Sched && s !== sesion) { Sched.setXRSession(s); sesion = s; }
      if (enXR) {
        if (tiles.hasCamera(camera)) tiles.deleteCamera(camera);
        var cx = xr.getCamera(); tiles.setCamera(cx);
        var ojo = cx.cameras && cx.cameras[0]; if (ojo && ojo.viewport) tiles.setResolution(cx, ojo.viewport.z, ojo.viewport.w);
      } else {
        if (tiles.cameras.length !== 1 || !tiles.hasCamera(camera)) { tiles.cameras.slice().forEach(function (c) { tiles.deleteCamera(c); }); tiles.setCamera(camera); }
        renderer.getSize(tam); tiles.setResolution(camera, tam.x, tam.y);
      }
      if (exag !== exagPuesta) colocaGrupo();
      camera.updateMatrixWorld();
      tiles.update();
      if (ganchos.fotograma) ganchos.fotograma();
    }
    function resumen() {
      var vis = 0; if (tiles) tiles.visibleTiles.forEach(function (t) { if (t.content && t.content.uri) vis++; });
      return { estado: estado, motivo: motivo, errores: errores, visibles: vis, errorTarget: tiles ? tiles.errorTarget : null, stats: tiles ? JSON.parse(JSON.stringify(tiles.stats)) : null };
    }
    // altura del relieve DIBUJADO en (x, y) del marco local (rayo vertical contra las teselas cargadas), sin exageración; null si no hay tesela.
    // Solo para pruebas y depuración: la física usa la altura de la CPU (decisión 38)
    var rayo = new THREE.Raycaster(), abajo = new THREE.Vector3(0, -1, 0);
    function alturaEn(x, y) {
      if (!tiles || !raizT) return null;
      rayo.set(new THREE.Vector3(x, 1e4, -y), abajo);
      var r = rayo.intersectObject(tiles.group, true).filter(function (x) { return !x.object.isInstancedMesh; })[0];   // el relieve, no los olivos
      return r ? r.point.y / exag : null;
    }
    function listo() {
      if (estado === "apagado" || estado === "sin") return true;
      var s = tiles && tiles.stats;
      return estado === "activo" && tiles.loadProgress === 1 && s.queued + s.downloading + s.parsing === 0;
    }
    function libera() { if (!tiles) return; if (ganchos.alApagar) ganchos.alApagar("liberada"); if (Sched) Sched.setXRSession(null); scene.remove(tiles.group); tiles.dispose(); tiles = null; estado = "apagado"; }
    function engancha(g) { for (var k in g) ganchos[k] = g[k]; }
    if (ESC3D.pedida) { Terreno.grupo.visible = false; arranca(); }
    return { actualiza: actualiza, perfil: perfil, resumen: resumen, libera: libera, listo: listo, alturaEn: alturaEn, engancha: engancha, grupo: function () { return tiles && tiles.group; } };
  })();
