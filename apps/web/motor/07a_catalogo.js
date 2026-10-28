// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Catalogo
// Consume: 04_terreno (hash), 06_arboles (tronco), 08_marcadores (tmp), 15_tiempo (parcheTiempo, nivel)
// ===============================================================================
  // ---------- el catálogo de olivos-tipo (ADR-0012; contrato de entrada en contratos/olivos-tipo.md): de dónde sacan los niveles 1 y 2 su geometría
  // Hoy solo hay el tipo −1 («sin asignar»): las formas por procedimiento de siempre (4 variantes de copa en vaso con su tronco en L1 y 2 masas en L2), las
  // mismas que antes vivían dentro de 07b_arboles.js, creadas en el mismo orden y con los mismos materiales. El nivel 0 no sale de aquí: se construye árbol
  // a árbol con la copa medida (06_arboles.js). Los modelos de un catálogo glb se registran con instala(desc, cargador, base), que nadie llama todavía.
  var Catalogo = (function () {
    var SIN = -1, VARIANTES = [0, 4, 2], PRES_TRI = [800, 170, 30], TOLERANCIA = 0.2, NIV = ["L0", "L1", "L2"];   // presupuesto por modelo = contratos/olivos-tipo.schema.json
    var proc = {}, modelos = {}, oyentes = [], avisos = [];

    // ----- las formas: una copa en vaso (abierta por abajo, cerrada con un casquete oscuro), 4 variantes de lóbulos, y un tronco de 2 o 3 pies
    function copaGeo(seed, anillos, lados, lobulos) {
      var pos = [], col = [], idx = [], th0 = 0.62, y0 = (1 - Math.cos(th0)) / 2, i, j;
      for (i = 0; i <= anillos; i++) {
        var th = th0 + (Math.PI - th0) * i / anillos, s = Math.sin(th), yy = ((1 - Math.cos(th)) / 2 - y0) / (1 - y0);
        for (j = 0; j < lados; j++) {
          var ph = j / lados * 6.2832, m = 1 + lobulos * 0.20 * Math.sin(3 * ph + seed * 6.1) * s + lobulos * 0.12 * Math.sin(5 * ph + seed * 2.3 + th * 2) + lobulos * 0.10 * (hash(seed * 31 + i * 13 + j) - 0.5);
          var yj = yy + 0.07 * lobulos * Math.sin(2 * ph + seed * 3.7) * s;
          pos.push(Math.cos(ph) * s * m, yj, Math.sin(ph) * s * m);
          var sh = (0.5 + 0.55 * yy) * (1 + (hash(seed * 7 + i * 5 + j) - 0.5) * 0.14); col.push(sh, sh, sh);
        }
      }
      var cen = pos.length / 3; pos.push(0, 0.02, 0); col.push(0.28, 0.28, 0.28);   // el casquete de debajo: oscuro, para que desde abajo (paseo) no se vea hueco
      for (i = 0; i < anillos; i++) for (j = 0; j < lados; j++) {
        var a = i * lados + j, b = i * lados + (j + 1) % lados, c = a + lados, d = b + lados; idx.push(a, c, b, b, c, d);
      }
      for (j = 0; j < lados; j++) idx.push(cen, j, (j + 1) % lados);
      var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      // que las caras miren hacia fuera (comprobado con una normal de la franja media)
      var nr = g.attributes.normal, ps = g.attributes.position, k = Math.floor(anillos / 2) * lados; if (nr.getX(k) * ps.getX(k) + nr.getZ(k) * ps.getZ(k) < 0) { for (var q = 0; q < idx.length; q += 3) { var tmp = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = tmp; } g.setIndex(idx); g.computeVertexNormals(); }
      return g;
    }
    function troncoGeo(pies, seed) {   // pies que salen casi juntos de la base y se abren hacia la copa; unidad de altura, ramas de 5 caras
      var pos = [], col = [], idx = [], base = 0, st, j, RS = 5;
      for (st = 0; st < pies; st++) {
        var an = seed * 2.1 + st / pies * 6.2832 + (hash(seed + st * 3) - 0.5) * 0.6, dx = Math.cos(an) * (0.30 + 0.12 * hash(seed * 5 + st)), dz = Math.sin(an) * (0.30 + 0.12 * hash(seed * 5 + st));
        for (var e = 0; e < 2; e++) {
          var r = e ? 0.095 : 0.20, px = e ? dx : dx * 0.18, py = e ? 1.0 : 0.0, pz = e ? dz : dz * 0.18;
          for (j = 0; j < RS; j++) { var a2 = j / RS * 6.2832 + st; pos.push(px + Math.cos(a2) * r, py, pz + Math.sin(a2) * r); var m = (e ? 0.9 : 0.62) * (0.9 + 0.2 * hash(st * 7 + j + seed)); col.push(0.38 * m, 0.31 * m, 0.24 * m); }
        }
        for (j = 0; j < RS; j++) { var a = base + j, b = base + (j + 1) % RS, c = a + RS, d = b + RS; idx.push(a, b, c, b, d, c); }
        base += 2 * RS;
      }
      var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      var nr = g.attributes.normal, ps = g.attributes.position; if (nr.getX(0) * ps.getX(0) + nr.getZ(0) * ps.getZ(0) < 0) { for (var q = 0; q < idx.length; q += 3) { var tp = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = tp; } g.setIndex(idx); g.computeVertexNormals(); }
      return g;
    }
    // el sombreador de la copa instanciada: sombra de nubes y helada (como el resto), silueta rota por ruido hacia el borde, motas de hoja y el envés plateado en el borde
    function parcheInst(sh) { parcheTiempo(sh, false); sh.vertexShader = sh.vertexShader.replace("vSomb = ot_sombra(position.xz);", "vSomb = ot_sombra((instanceMatrix * vec4(transformed, 1.0)).xz);"); }
    function parcheCopa(sh) {
      parcheInst(sh);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLoc; varying float vSeed; varying float vRim;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n vLoc = position; vSeed = fract(sin(dot(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), vec2(12.9898, 78.233))) * 43758.5453);")
        .replace("#include <project_vertex>", "#include <project_vertex>\n vRim = 1.0 - clamp(abs(dot(normalize(transformedNormal), normalize(-mvPosition.xyz))), 0.0, 1.0);");
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying vec3 vLoc; varying float vSeed; varying float vRim;\nfloat ot_h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\nvoid main() {")
        .replace("#include <color_fragment>", "#include <color_fragment>\n float nz = ot_h3(floor(vLoc * 7.0 + vSeed * 31.0)); float nz2 = ot_h3(floor(vLoc * 15.0 + vSeed * 17.0));\n if (nz < (vRim - 0.72) * 2.8) discard;\n diffuseColor.rgb *= 0.74 + 0.50 * nz2;\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64, 0.70, 0.56), smoothstep(0.45, 1.0, vRim) * 0.40 * (0.45 + nz));");
    }
    var matCopaI = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), matTroncoI = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    matCopaI.onBeforeCompile = parcheCopa; matTroncoI.onBeforeCompile = parcheInst; matCopaI.needsUpdate = true; matTroncoI.needsUpdate = true;

    // las piezas por procedimiento, creadas al pedirlas y guardadas (07b_arboles.js las pide al montarse, en el orden de antes)
    function procedural(nivel, v) {
      var k = nivel + "_" + v; if (proc[k]) return proc[k];
      return (proc[k] = nivel === 1 ? [{ pieza: "copa", geo: copaGeo(v + 1, 6, 10, 1), mat: matCopaI }, { pieza: "tronco", geo: troncoGeo(v % 2 ? 3 : 2, v + 3), mat: matTroncoI }]
        : nivel === 2 ? [{ pieza: "copa", geo: copaGeo(v + 11, 2, 7, 1), mat: matCopaI }] : []);
    }
    function tiene(t) { return t === SIN || Object.prototype.hasOwnProperty.call(modelos, t); }
    function tipos() { return [SIN].concat(Object.keys(modelos).map(Number).sort(function (a, b) { return a - b; })); }
    function variantes(t, nivel) { if (t === SIN) return VARIANTES[nivel] || 0; var M = modelos[t]; return M && M.niveles[nivel].length ? 1 : 0; }
    // geometria(tipo, nivel, variante) → [{ pieza: "copa"|"tronco", geo, mat }]: lo que se instancia de ese nivel (L0 de −1: [], lo construye 06_arboles.js)
    function geometria(t, nivel, v) { if (t === SIN) return procedural(nivel, v || 0); var M = modelos[t]; return M ? M.niveles[nivel] : []; }
    function cuenta(ps) { return ps.reduce(function (s, p) { return s + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3; }, 0); }
    function triangulos(t, nivel, v) { return cuenta(geometria(t, nivel, v)); }
    function info(t) {
      if (t === SIN) return { id: SIN, nombre: "por procedimiento", fuente: "ilustrativo", caja: null };
      var M = modelos[t]; return M ? { id: t, nombre: M.nombre, fuente: M.fuente, caja: M.caja } : null;
    }

    // ----- catálogo glb (preparado, SIN activar en F1b). Sin dependencias: quien llama inyecta cargador(url, THREE) → Promise de [{ nombre, geometria }],
    // una entrada por pieza del glb (BufferGeometry en metros, pivote en la base del tronco, +Y arriba). El motor pone sus propios materiales (copa o tronco,
    // por el nombre de la pieza), así que los modelos-tipo reciben la misma luz, sombra de nubes y helada que el resto. Un tipo que se pasa de su presupuesto
    // de triángulos (PRES_TRI × 1,2) no se registra y queda en avisos(); sus olivos siguen como tipo −1.
    function pieza(p) {
      var g = p.geometria, n = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.color) { var c = new Float32Array(n * 3); c.fill(1); g.setAttribute("color", new THREE.BufferAttribute(c, 3)); }   // los materiales del motor llevan color por vértice
      g.computeBoundingBox();
      var tr = /tronco/i.test(p.nombre || ""); return { pieza: tr ? "tronco" : "copa", geo: g, mat: tr ? matTroncoI : matCopaI };
    }
    function caja(niveles) {   // altura y semiejes del modelo (del nivel más detallado que haya): con ellos se estira a la copa medida de cada olivo
      var ps = niveles[0].length ? niveles[0] : niveles[1].length ? niveles[1] : niveles[2], b = new THREE.Box3();
      ps.forEach(function (p) { b.union(p.geo.boundingBox); });
      return { alto: Math.max(0.5, b.max.y), rx: Math.max(0.3, Math.max(-b.min.x, b.max.x)), rz: Math.max(0.3, Math.max(-b.min.z, b.max.z)) };
    }
    function avisa() { oyentes.forEach(function (fn) { fn(tipos()); }); }
    function instala(desc, cargador, base) {
      if (typeof cargador !== "function") return Promise.reject(new Error("Catalogo.instala: falta la función cargador(url, THREE)"));
      var pref = base || "";
      return Promise.all((desc.tipos || []).map(function (tp) {
        return Promise.all(NIV.map(function (nv) {
          var f = tp.niveles && tp.niveles[nv]; if (!f) return [];
          return Promise.resolve(cargador(pref + f.glb, THREE)).then(function (ps) { return ps.map(pieza); });
        })).then(function (niveles) {
          var mal = niveles.map(cuenta).filter(function (n, i) { return n > PRES_TRI[i] * (1 + TOLERANCIA); });
          if (mal.length || (!niveles[1].length && !niveles[2].length)) { avisos.push("tipo " + tp.id + " (" + tp.nombre + "): " + (mal.length ? "se pasa del presupuesto de triángulos" : "sin L1 ni L2")); niveles.forEach(function (ps) { ps.forEach(function (p) { p.geo.dispose(); }); }); return; }
          if (modelos[tp.id]) retira(tp.id, true);
          modelos[tp.id] = { nombre: tp.nombre, fuente: tp.fuente || desc.fuente, niveles: niveles, caja: caja(niveles) };
        });
      })).then(function () { avisa(); return tipos(); });
    }
    function retira(t, callado) {
      var M = modelos[t]; if (!M) return false;
      M.niveles.forEach(function (ps) { ps.forEach(function (p) { p.geo.dispose(); }); }); delete modelos[t];
      if (!callado) avisa(); return true;
    }
    function alCambiar(fn) { oyentes.push(fn); }
    return { SIN: SIN, PRES_TRI: PRES_TRI, tipos: tipos, tiene: tiene, variantes: variantes, geometria: geometria, triangulos: triangulos, info: info, instala: instala, retira: retira, alCambiar: alCambiar, avisos: function () { return avisos.slice(); } };
  })();
