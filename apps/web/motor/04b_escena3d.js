// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Escena3D
// Consume: 01_datos (D), 02_mundo (Mundo, suelo), 03_escena (visor, renderer, scene, camera, exag), 04d_sombreado_tiles (SombreadoTiles),
//   05_nube (nube), 08_marcadores (listo, aplica), 09_camara (objetivo), 14_historia (aviso), 16_vida (mira), 29_vr (panel)
// ===============================================================================
  // ---------- la escena en 3D Tiles 1.1 (ADR-0015, aceptado; formato en doc/sistema/TILES3D.md): la ÚNICA escena (T8 fase 2, decisión 79). El relieve
  // con su ortofoto lo dibuja 3DTilesRendererJS (versión fijada en apps/web/package.json) desde un tileset.json de tuberia/tiles3d/, con el sombreado
  // de 04d_sombreado_tiles.js. Sin tileset (ni D.tileset en el índice ni ?tileset=) o si falla (la librería, otro origen, la raíz), no hay otra
  // escena a la que volver: estado "sin", un console.error y el aviso #sinEscena de la página («Esta finca no tiene escena: <motivo>»); el Mundo
  // se carga igual, así que el panel, las fichas, la nube y los olivos siguen funcionando.
  // La física y las consultas en CPU (alturas, copa y color de la tierra para el paseo, la VR, las balizas y las huellas) siguen con el json de
  // siempre (decisión 38: doble descarga aceptada); los puntos LiDAR (decisión 37) y las construcciones (decisión 36) no cambian. Los olivos
  // del glb los gestiona 04c_olivos_tiles.js por los ganchos de engancha() (alRaiz, alModelo, alSoltar, alApagar, fotograma); sin él, o si los rechaza, se quitan.
  // Tileset: ?tileset=<ruta relativa> (pruebas), si no D.tileset (el índice); nunca otro host (§5 de CLAUDE.md: solo el mismo origen).
  // Marco: la raíz lleva LOCAL → ECEF; el grupo lo deshace y pasa de z arriba a y arriba, como la página de prueba de tuberia/tiles3d/, y
  // aplica la exageración vertical en la misma matriz.
  var Escena3D = (function () {
    var pedida = /[?&]tileset=[^&#]/.test(location.search) || (typeof D.tileset === "string" && D.tileset.length > 0);
    var estado = pedida ? "cargando" : "apagado", motivo = "", tiles = null, Sched = null, raizT = null, exagPuesta = NaN, sesion = null, errores = 0;
    var ERROR_ESCRITORIO = (function () { var m = /[?&]tilesError=([0-9.]+)/.exec(location.search), v = m ? Number(m[1]) : 16; return v > 0 && v <= 256 ? v : 16; })();
    var errorPerfil = null;   // el del perfil VR (29_vr.js, campo e de cada perfil); null = el de escritorio
    var tam = new THREE.Vector2();
    var ganchos = {};   // los pone 04c_olivos_tiles.js con engancha(): alRaiz(tileset), alModelo(scene, tile) → true si se queda con sus olivos, alSoltar(scene), alApagar(motivo), fotograma()
    function url() {
      var m = /[?&]tileset=([^&#]+)/.exec(location.search), u = m ? decodeURIComponent(m[1]) : D.tileset;
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u)) throw new Error("tileset fuera del mismo origen: " + u);   // ni http(s):, ni data:, ni //host
      return u;
    }
    function falla(e) {
      if (estado === "sin") return;
      estado = "sin"; motivo = String(e && e.message || e); console.error("escena 3D Tiles: " + motivo + " (esta finca se queda sin escena)");
      if (tiles) { try { scene.remove(tiles.group); tiles.dispose(); } catch (e2) {} tiles = null; }
      // falla() puede llegar mientras se monta el motor (sin tileset, o un ?tileset= de otro host, falla al definir este módulo): 04d y 04c
      // vienen después y aún no existen; a 04c se le avisa al engancharse (engancha)
      if (SombreadoTiles) SombreadoTiles.libera();
      if (ganchos.alApagar) ganchos.alApagar(motivo);
      avisa(motivo);
    }
    // el aviso en la página (#sinEscena de plantilla.html): role="alert", no tapa los toques del visor ni el panel
    function avisa(m) {
      if (typeof document === "undefined") return;   // (las pruebas de Node evalúan el módulo sin DOM)
      var el = document.getElementById("sinEscena"), tx = document.getElementById("sinEscenaMotivo"); if (!el) return;
      if (tx) tx.textContent = m; el.hidden = false;
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
        tiles.addEventListener("load-model", function (e) { if (!(ganchos.alModelo && ganchos.alModelo(e.scene, e.tile))) quitaOlivos(e.scene); e.scene.userData.tesela = { uri: e.tile.content && e.tile.content.uri, lado: e.tile.boundingVolume && e.tile.boundingVolume.box ? 2 * e.tile.boundingVolume.box[3] : null, error: e.tile.geometricError }; });
        tiles.addEventListener("load-model", function (e) { SombreadoTiles.modelo(e.scene, e.tile); });   // el relieve, con su sombreado (04d)
        tiles.addEventListener("dispose-model", function (e) { SombreadoTiles.suelta(e.scene); });
        tiles.addEventListener("dispose-model", function (e) { if (ganchos.alSoltar) ganchos.alSoltar(e.scene); });   // los olivos (04c)
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
      SombreadoTiles.actualiza();
      if (ganchos.fotograma) ganchos.fotograma();
    }
    function resumen() {
      var vis = 0; if (tiles) tiles.visibleTiles.forEach(function (t) { if (t.content && t.content.uri) vis++; });
      return { estado: estado, motivo: motivo, errores: errores, visibles: vis, errorTarget: tiles ? tiles.errorTarget : null, stats: tiles ? JSON.parse(JSON.stringify(tiles.stats)) : null };
    }
    // altura del relieve DIBUJADO en (x, y) del marco local (rayo vertical contra las teselas visibles: la librería saca de tiles.group las que no
    // se dibujan), sin exageración; null si no hay tesela. relieveEn dice además qué glb lo dibuja (uri, lado y geometricError de su tesela).
    // Solo para pruebas y depuración: la física usa la altura de la CPU (decisión 38)
    var rayo = new THREE.Raycaster(), abajo = new THREE.Vector3(0, -1, 0);
    function teselaDe(o) { for (var p = o; p; p = p.parent) if (p.userData && p.userData.tesela) return p.userData.tesela; return null; }
    function relieveEn(x, y) {
      if (!tiles || !raizT) return null;
      rayo.set(new THREE.Vector3(x, 1e4, -y), abajo);
      var r = rayo.intersectObject(tiles.group, true).filter(function (x) { return !x.object.isInstancedMesh; })[0];   // el relieve, no los olivos
      if (!r) return null;
      var t = teselaDe(r.object) || {};
      return { h: r.point.y / exag, uri: t.uri || null, lado: t.lado || null, error: t.error === undefined ? null : t.error };
    }
    function alturaEn(x, y) { var r = relieveEn(x, y); return r ? r.h : null; }
    // Sonda de huecos (criterio 3 del ADR-0015; solo pruebas): nx × ny rayos desde la cámara por la pantalla, más uno vertical bajo la cámara y otro
    // bajo el objetivo. Para cada rayo se busca en la CPU dónde corta el relieve (Mundo.suelo, marcha de 1 m y bisección; con la exageración puesta)
    // y, si ese punto cae dentro de los datos (tesela del contrato con un margen de 2 m), el rayo debe dar con el relieve dibujado: las teselas
    // visibles del tileset (sin escena no hay relieve dibujado: todo rayo en los datos cuenta como sin relieve). Devuelve cuántos rayos caen en los datos y cuántos no
    // encuentran relieve (con las primeras muestras de los que fallan).
    var ndc = new THREE.Vector2();
    function cortaCPU(o, d) {   // primer t > 0 con o + t·d bajo el relieve de la CPU, o −1 (hasta 6 km)
      var f = function (t) { var x = o.x + d.x * t, z = o.z + d.z * t; return o.y + d.y * t - suelo(x, -z) * exag; };
      var a = 0, fa = f(0); if (fa <= 0) return -1;
      for (var t = 1; t < 6000; t += Math.max(1, Math.min(20, fa * 0.5))) { var ft = f(t); if (ft <= 0) { for (var k = 0; k < 30; k++) { var m = (a + t) / 2; if (f(m) > 0) a = m; else t = m; } return t; } a = t; fa = ft; }
      return -1;
    }
    function enDatos(x, y) { var M = 2; return !!(Mundo.tesela(x - M, y - M) && Mundo.tesela(x + M, y - M) && Mundo.tesela(x - M, y + M) && Mundo.tesela(x + M, y + M)); }
    function sondea(nx, ny) {
      nx = nx || 7; ny = ny || 5;
      var objs = []; if (tiles && estado === "activo") objs.push(tiles.group);
      camera.updateMatrixWorld();
      var rayos = [], cam = camera.getWorldPosition(new THREE.Vector3());
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) { ndc.set(-0.9 + 1.8 * i / (nx - 1), -0.9 + 1.8 * j / (ny - 1)); rayo.setFromCamera(ndc, camera); rayos.push({ o: rayo.ray.origin.clone(), d: rayo.ray.direction.clone(), que: "pantalla " + i + "," + j }); }
      rayos.push({ o: cam.clone(), d: abajo.clone(), que: "bajo la cámara" });
      if (typeof objetivo !== "undefined") rayos.push({ o: new THREE.Vector3(objetivo.x, cam.y + 50, objetivo.z), d: abajo.clone(), que: "bajo el objetivo" });
      var n = 0, sin = 0, aristas = 0, muestras = [], o2 = new THREE.Vector3();
      var da = function (o) { rayo.set(o, r0.d); rayo.far = Infinity; return objs.length && rayo.intersectObjects(objs, true).some(function (h) { return !h.object.isInstancedMesh; }); }, r0 = null;
      rayos.forEach(function (r) {
        var t = cortaCPU(r.o, r.d); if (t < 0) return;
        var x = r.o.x + r.d.x * t, y = -(r.o.z + r.d.z * t); if (!enDatos(x, y)) return;
        n++; r0 = r;
        if (da(r.o)) return;
        // un rayo que pasa justo por una arista (entre dos triángulos o entre dos glb vecinos, que comparten vértices) puede no dar con ninguno en el
        // Raycaster de three; no es un hueco en pantalla. Si a 1 cm, en cualquiera de las cuatro direcciones, sí hay relieve, cuenta como arista
        var cerca = [[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01]].some(function (e) { return da(o2.set(r.o.x + e[0], r.o.y, r.o.z + e[1])); });
        if (cerca) aristas++; else sin++;
        if (muestras.length < 5) muestras.push({ que: r.que, x: +x.toFixed(2), y: +y.toFixed(2), arista: cerca });
      });
      return { rayos: rayos.length, enDatos: n, sinRelieve: sin, aristas: aristas, muestras: muestras, visibles: tiles ? resumen().visibles : 0 };
    }
    function cargada() {   // no se llama listo(): taparía el listo del motor (08_marcadores.js) que mira falla()
      if (estado === "apagado" || estado === "sin") return true;
      var s = tiles && tiles.stats;
      return estado === "activo" && tiles.loadProgress === 1 && s.queued + s.downloading + s.parsing === 0;
    }
    function libera() { if (!tiles) return; SombreadoTiles.libera(); if (ganchos.alApagar) ganchos.alApagar("liberada"); if (Sched) Sched.setXRSession(null); scene.remove(tiles.group); tiles.dispose(); tiles = null; estado = "apagado"; }
    function engancha(g) { for (var k in g) ganchos[k] = g[k]; if (estado === "sin" && ganchos.alApagar) ganchos.alApagar(motivo); }
    if (pedida) arranca(); else falla(new Error("falta el tileset"));
    return { actualiza: actualiza, estado: function () { return estado; }, perfil: perfil, resumen: resumen, libera: libera, listo: cargada, alturaEn: alturaEn, relieveEn: relieveEn, sondea: sondea, engancha: engancha, grupo: function () { return tiles && tiles.group; } };
  })();
