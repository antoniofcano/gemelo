// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: SombreadoTiles
// Consume: 01_datos (ESC3D), 02_mundo (Mundo, suelo), 03_escena (camera), 04_terreno (matSuelo, Terreno, terreno), 09_camara (suelta),
//   15_tiempo (lluvia, uSombra), 16_vida (mira)
// ===============================================================================
  // ---------- el relieve de la escena 3D Tiles (?escena=tiles) con el MISMO sombreado que el Terreno de siempre (F1d, T5)
  // Cada glb del tileset trae su terreno con un material PBR y la ortofoto como baseColorTexture. Al cargarse (evento load-model de 04b_escena3d.js)
  // ese material se cambia por un Lambert con el parche de 04_terreno.js (Terreno.parche: un solo GLSL para las dos escenas), así que el color
  // (ADR-0016: texturas sin convertir, a lineal al entrar en la luz), la hierba según el NDVI, la capa NDVI con su escala relativa, la escarcha,
  // la sombra de nubes, el detalle del suelo abierto (rodadas, caminos), el relieve fino (uBumpK, que la VR apaga) y los modos Ortofoto / NDVI
  // salen de los mismos uniformes compartidos (UN, uSombra). Lo que cambia con el glb:
  //   - la posición en el mundo sale de modelMatrix (la exageración vertical la pone la matriz del grupo, no el sombreador) y la sombra de nubes
  //     se calcula con ella;
  //   - la ortofoto es la del propio glb (ya está en la tarjeta gráfica; nada de la textura de 768 px de la tesela del Mundo), con sus coordenadas
  //     sacadas de la caja de la tesela (el norte arriba de la imagen, como la escribe tuberia/tiles3d/genera.mjs);
  //   - el color de la tierra, el ruido y el «color ancho» del suelo abierto son los de la tesela del Mundo (256 m) que contiene el glb: salen del
  //     json de siempre (decisión 38), nunca del glb. Un glb mayor que una tesela (512 m, solo de lejos) pinta la tierra con el mosaico de 1 m y
  //     sin detalle, como una tesela del Terreno cuyos datos aún no han llegado.
  // Sin ?escena=tiles no crea nada (y 04b no lo llama). Por fotograma: nada; cada 0,2 s, un recorrido de los glb vivos (encender o apagar el detalle).
  var SombreadoTiles = (function () {
    var TS = Mundo.TS, vivos = [], mos = null, tUlt = -1e9, neutro = null, U1 = Terreno.U1;
    var OP = {   // lo que el glb cambia del parche (ver 04_terreno.js): posición desde modelMatrix y ortofoto con las coordenadas de la caja
      vertice: false, cab: "uniform vec4 uCua;\n",
      uvO: "vec2((vWP.x - uCua.x) / uCua.z, 1.0 - (-vWP.z - uCua.y) / uCua.z)", dg: "3.0 / uCua.z", dy: "vec2(0.0, -dg)"
    };
    function ruidoNeutro() { if (!neutro) { neutro = new THREE.DataTexture(new Uint8Array([143, 128, 128, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); neutro.needsUpdate = true; } return neutro; }   // el mismo píxel que el Terreno
    function mosaico() {   // el Terreno no lo crea con la escena 3D Tiles (iniciaMosaico mira ESC3D.activa): sin él, lo que no tiene datos se vería negro
      if (UN.uMos.value || !Mundo.mosaico.img) return;
      mos = new THREE.Texture(Mundo.mosaico.img); mos.anisotropy = 4; mos.needsUpdate = true; UN.uMos.value = mos;
    }
    function material(u) {
      var m = new THREE.MeshLambertMaterial({}); m.color = matSuelo.color;   // el color (lluvia, luz) es el de todas las teselas
      m.onBeforeCompile = function (sh) { Terreno.parche(sh, u, OP); };
      m.customProgramCacheKey = function () { return "terreno-3dtiles"; };   // un solo programa para todos los glb (y distinto del Terreno)
      return m;
    }
    // un modelo recién cargado: su malla de terreno (la que lleva ortofoto; los olivos instanciados no se tocan) pasa al sombreado del Terreno
    function modelo(raiz, tile) {
      var b = tile && tile.boundingVolume && tile.boundingVolume.box; if (!b || !raiz) return;   // sin caja no se sabe dónde cae: se queda con su material
      var L = 2 * b[3], x0 = b[0] - b[3], y0 = b[1] - b[7], mt = L <= TS + 1e-6 ? Mundo.tesela(b[0], b[1]) : null;
      mosaico();
      raiz.traverse(function (o) {
        if (!o.isMesh || o.isInstancedMesh || !o.material || !o.material.map) return;
        var map = o.material.map, w = (map.image && map.image.width) || 256, uni = mt ? Terreno.prepara(mt) : null;
        map.colorSpace = THREE.NoColorSpace; map.anisotropy = 4; map.needsUpdate = true;   // como las texturas del Terreno: los valores tal cual (ADR-0016), el sombreador los pasa a lineal
        var u = {
          uTile: uni ? uni.uTile : { value: new THREE.Vector2(x0, y0) }, uSue: uni ? uni.uSue : { value: null }, uRui: uni ? uni.uRui : { value: ruidoNeutro() },
          uGnd: uni ? uni.uGnd : { value: ruidoNeutro() }, uTiene: uni ? uni.uTiene : { value: 0 },
          uOrt: { value: map }, uDet: { value: 0 }, uBias2: { value: Math.log(2 / (L / w)) / Math.LN2 }, uCua: { value: new THREE.Vector4(x0, y0, L, 0) }
        };
        o.material = material(u);   // el material del glb (sin compilar) y su textura los libera la librería al soltar la tesela; este, suelta()
        vivos.push({ raiz: raiz, m: o.material, u: u, mt: mt });
      });
    }
    function suelta(raiz) { vivos = vivos.filter(function (v) { if (v.raiz !== raiz) return true; v.m.dispose(); return false; }); }
    // cada 0,2 s: las texturas de la tesela del Mundo cuando llegan sus datos y el detalle del suelo abierto según la distancia (como Terreno.actualiza)
    function actualiza() {
      var ahora = performance.now(); if (ahora - tUlt < 200 || !vivos.length) return; tUlt = ahora;
      mosaico();
      var p = camera.position, dist = {};
      vivos.forEach(function (v) {
        var t = v.mt; if (!t) return;
        if (!(t.key in dist)) { Terreno.prepara(t); dist[t.key] = Mundo.dist(t, p.x, p.y, p.z); if (dist[t.key] < U1) Terreno.pideDetalle(t); }
        var d = dist[t.key]; v.u.uDet.value = t.detListo && (d < U1 || (v.u.uDet.value && d < U1 * 1.5)) ? 1 : 0;
      });
    }
    function libera() {   // si la escena 3D Tiles se apaga o falla (vuelve el Terreno de siempre)
      vivos.forEach(function (v) { v.m.dispose(); }); vivos = [];
      if (mos) { if (UN.uMos.value === mos) UN.uMos.value = null; mos.dispose(); mos = null; }
    }
    function resumen() { return { glb: vivos.length, conTesela: vivos.filter(function (v) { return v.mt; }).length, conDetalle: vivos.filter(function (v) { return v.u.uDet.value; }).length }; }
    return { modelo: modelo, suelta: suelta, actualiza: actualiza, libera: libera, resumen: resumen, OP: OP };
  })();
