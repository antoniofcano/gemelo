// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (Mundo, suelo), 02b_cola (Cola), 02c_componentes (Componentes), 03_escena (scene, exag), 04b_escena3d (Escena3D),
//   04d_sombreado_tiles (matSuelo), 15_tiempo (lluvia), 90_final (bucle)
// ===============================================================================
  // ---------- M6: el suelo de fondo. El mundo es un mosaico de teselas; donde falta una (bordes, esquinas, teselas sin datos) se veía el vacío. Esta malla cubre la caja
  // de la finca más un margen con el relieve GRUESO del índice (8 m, el mismo medido, con menos detalle: regla 5) y el mosaico de 1 m como textura, POR DEBAJO del tileset:
  // BAJA metros más abajo y con polygonOffset, para que nunca asome por encima de las teselas ni haga z-fighting (el relieve grueso, interpolado, puede quedar por encima
  // del fino en una loma de metro y medio). Una malla, una llamada, sin sombras ni detalle de suelo. Comparte la textura del mosaico de 04d (no se sube otra vez a la GPU
  // y no se libera aquí: es de 04d) y el color de matSuelo (luz, lluvia y niebla como el resto del relieve). Solo existe mientras la escena 3D Tiles esté activa.
  // Componente «suelo-fondo» (ADR-0023, C10 tercera tanda): ya no lo llama el bucle de 90_final.js; corre en la fase «tarde» (cada fotograma, tras la carga y antes de la
  // Cola, el mismo sitio de siempre salvo por la Cola). ?fondo=0 lo apaga (y ?sinFondo, como siempre): sin él se ve el vacío de los bordes, y nada más cambia.
  var fondoSuelta = null;   // lo que libera el componente montado
  function SueloFondoMotor(n) {
    var MARGEN = 400, BAJA = 1.5, CELDAS_MAX = 128, malla = null, expPuesta = NaN;
    var APAGADO = typeof location !== "undefined" && /[?&]sinFondo/.test(location.search);   // ?sinFondo: sin el suelo de fondo (para comparar y medir)
    function construye() {
      var M = D.mosaico, GR = D.grueso, ax = GR.w * GR.res, ay = GR.h * GR.res;
      var xa = GR.x0 - MARGEN, xb = GR.x0 + ax + MARGEN, yb = GR.yN + MARGEN, ya = GR.yN - ay - MARGEN;   // la caja del relieve grueso (= la de la finca) y un margen
      var nx = Math.min(CELDAS_MAX, Math.ceil((xb - xa) / 16)), ny = Math.min(CELDAS_MAX, Math.ceil((yb - ya) / 16)), nv = (nx + 1) * (ny + 1);
      var pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(nx * ny * 6), i, j, k = 0;
      var mw = M.w * M.res, mh = M.h * M.res;
      for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) {
        var x = xa + (xb - xa) * i / nx, y = yb - (yb - ya) * j / ny, o = j * (nx + 1) + i;
        pos[o * 3] = x; pos[o * 3 + 1] = Mundo.grueso(x, y) - BAJA; pos[o * 3 + 2] = -y;   // mundo: x al este, z = −norte
        uv[o * 2] = (x - M.x0) / mw; uv[o * 2 + 1] = (y - (M.yN - mh)) / mh;
      }
      for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
        var a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;   // sentido antihorario visto desde arriba (la cara hacia +y)
        idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
      var m = new THREE.MeshLambertMaterial({ map: UN.uMos.value, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
      m.color = matSuelo.color;
      // la textura del mosaico se comparte con 04d, que la usa tal cual (ADR-0016: sin convertir): aquí se pasa a lineal al leerla
      m.onBeforeCompile = function (sh) { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "vec4 sampledDiffuseColor = sRGBTransferEOTF(texture2D(map, vMapUv));\n diffuseColor *= sampledDiffuseColor;"); };
      m.customProgramCacheKey = function () { return "suelo-fondo"; };
      malla = new THREE.Mesh(g, m); malla.name = "sueloFondo"; malla.matrixAutoUpdate = false; malla.renderOrder = -1; expPuesta = NaN;
      scene.add(malla);
    }
    function libera() { if (!malla) return; scene.remove(malla); malla.geometry.dispose(); malla.material.dispose(); malla = null; }   // la textura (mosaico) es de 04d
    // por fotograma: crear cuando la escena está activa y el mosaico ya es textura; liberar si la escena se apaga; seguir la exageración vertical
    function actualiza() {
      var activa = !APAGADO && Escena3D.estado() === "activo";
      if (!activa || !UN.uMos.value) { if (!activa) libera(); return; }
      if (!malla) construye();
      if (exag !== expPuesta) { malla.matrix.makeScale(1, exag, 1); malla.matrixWorldNeedsUpdate = true; malla.updateMatrixWorld(true); expPuesta = exag; }
    }
    fondoSuelta = libera;
    return { actualiza: actualiza, libera: libera, malla: function () { return malla; }, BAJA: BAJA, MARGEN: MARGEN, CELDAS_MAX: CELDAS_MAX };
  }
  Componentes.registra({
    id: "suelo-fondo", version: 1,
    consume: ["D", "Mundo", "UN", "matSuelo", "Escena3D", "scene", "exag"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true, url: "fondo" },
    presupuesto: { llamadas: 1, triangulos: 32768 },   // el techo: CELDAS_MAX² celdas de 2 triángulos (128 × 128). Medido en Node (componentes_c10c.test.js) con la caja del fixture: 1 llamada y 10.824 triángulos, los de pruebas/presupuesto.json («lejos»)
    fases: { tarde: 0 },
    monta: function (n) { return SueloFondoMotor(n); },
    actualiza: { tarde: function (dt, t, api) { api.actualiza(); } },
    libera: function () { if (fondoSuelta) fondoSuelta(); fondoSuelta = null; }
  });
