// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Lejanos
// Consume: 03_escena (renderer, exag), 06_arboles (gArboles), 07ab_generados (Generados)
// ===============================================================================
  // ---------- los olivos LEJANOS de la escalera (ADR-0019 §2, fase A, O8c), solo con ?olivos=escalera o con ?olivos=gen y variantes horneadas (modoGen
  // de 07ab): sin ellas no crea nada ni gasta nada.
  // Todo olivo a menos de U2 m de la cámara que no está en 3D (07ab) se dibuja aquí, en UNA malla instanciada para toda la finca (1 llamada), con la
  // MISMA matriz que su variante E2 (copa y altura medidas) y la MISMA variante (índice de copa mod nº de variantes): el paso de E2 a lejano es el mismo
  // árbol visto de otra forma. Dos fuentes, por orden:
  //   1. IMPOSTORES (O8b, contratos/olivo-impostor.md, formato 1): si el manifiesto de la finca trae la fila `impostores[]` de la época y casa con
  //      las variantes que dibuja el motor (Generados.lejanos.impostor()), se bajan sus dos atlas <huella>.webp (mismo origen, con la cookie), se
  //      comprueban (tamaño y huella) y se suben a la GPU (initTexture) ANTES de usarlos. Un cuadrado de 2 triángulos por olivo, girado a la cámara
  //      en el marco del árbol (deshaciendo su estirado), que lee la vista MÁS CERCANA de la rejilla 8 × 8 (la mezcla de 3 vistas o el tramado entre
  //      vistas: O8d, con medida) reproyectando cada punto a la base de esa vista; el motor lo ilumina con la normal del atlas (Lambert, su luz
  //      solar y del cielo, la sombra de nubes y la escarcha). La oclusión de copa del canal A no se usa (la E2 en 3D no la lleva: casarían peor).
  //   2. SUSTITUTO (salvaguarda: sin manifiesto, como en la salida artefacto y el fixture, o si los atlas fallan): dos planos cruzados (4 triángulos
  //      por olivo) con la silueta de cada variante E2 horneada AQUÍ, en el navegador, a una textura de 2 vistas × nº de variantes × 128 px, en
  //      albedo plano (luz ambiente de intensidad π: el color sin sombrear), iluminada en vivo como la tierra (normal hacia arriba). Desde arriba
  //      y en diagonal se ven los dos planos: es lo que el ADR descarta como solución final; aquí es solo el respaldo.
  // Mientras no hay ninguna de las dos (al empezar: hasta que están las variantes E2), de lejos solo se ve la ortofoto (la excepción del ADR §3) y
  // 07ab retiene en 3D lo que sale; cuando están, la capa entra con un tramado de 1 s (uCapa). Sin WebGL para hornear, o si falla: «sin» y solo
  // ortofoto lejos (se dice en ?debug).
  // Fundido: el lejano de un olivo que ENTRA en 3D sale con el tramado complementario del de su 3D (mismo ruido, mismo uFun: código 2) y el de uno
  // que SALE del 3D entra (código 1); así no hay huecos ni dobles durante los 0,6 s. En la banda E2|lejano (O9c, ADR-0022 §5), el lejano lleva el
  // código 2 con la ranura de su olivo (2 + 3 · ranura): el complementario de su E2, con el peso que 07ab pone cada fotograma según la distancia.
  var Lejanos = (function () {
    // activo(): con ?olivos=escalera desde el principio; con ?olivos=gen y variantes horneadas (O8c), cuando Generados lo decide con el manifiesto
    var activo = function () { return Generados.escalera(); }, via = activo() ? "esperando" : "apagado", motivo = "", U2 = 1600, CEL = 128, CAPA_S = 1, repartido = false;
    var olivos = null, malla = null, matrices = null, posDe = {}, exagM = -1, nv = 0, triPor = 0, texMiB = 0, rt = null, uCapa = { value: 0 }, tCapa = 0, avisoImp = false;
    var info = { dibujados: 0, entran: 0, salen: 0 }, sinGPU = false, cajas = null, ids = null;
    function inicia(ls) { olivos = ls; olivos.forEach(function (c, k) { posDe[c.i] = k; }); }
    function hayCapa() { return via === "sustituto" || via === "impostor"; }
    // cada fotograma (desde 07b): en cuanto están las variantes E2, se monta la capa; luego entra con su tramado. true si el reparto debe rehacerse
    function paso(dt) {
      if (!activo()) return false;
      if (via === "apagado") via = "esperando";
      if (via === "esperando") {
        if (Generados.estado() === "sin") { via = "sin"; motivo = "sin constructor"; return true; }
        if (!Generados.activo() || !olivos) return false;
        var G = Generados.lejanos, n = G.nVariantes(), rs = [];
        for (var j = 0; j < n; j++) { var r = G.variante(j); if (!r) return false; rs.push(r); }
        nv = n; monta(rs); return true;
      }
      // al acabar de entrar, true: 07b reparte otra vez (con la escalera horneada, aparta entonces del tileset todos los olivos)
      if (hayCapa() && repartido && uCapa.value < 1) { tCapa += Math.min(dt, 0.1); uCapa.value = Math.min(1, tCapa / CAPA_S); return uCapa.value >= 1; }
      return false;
    }
    function monta(rs) {
      var f = Generados.lejanos.impostor();
      if (f && !f.motivo) { via = "cargando impostores"; impostores(f, rs).catch(function (e) { avisoImp = "impostores: " + String(e && e.message || e).slice(0, 80); sustituto(rs); }); return; }
      if (f && f.motivo) avisoImp = "impostores ignorados: " + f.motivo;
      sustituto(rs);
    }
    // ---- los impostores de O8b: los dos atlas, comprobados, y su material
    function atlas(a, srgb) {
      var M = Generados.lejanos.constructor();
      return fetch(Generados.lejanos.dir() + a.huella + ".webp", { credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.arrayBuffer(); })
        .then(function (ab) {
          var b = new Uint8Array(ab); if (b.length !== a.bytes) throw new Error("tamaño " + b.length + " ≠ " + a.bytes);
          return M.huellaBytes(b).then(function (h) {
            if (h !== a.huella) throw new Error("huella distinta");
            // fila 0 del fichero arriba y v hacia arriba (contrato §2): el mapa de bits se voltea al decodificarlo (three no voltea un ImageBitmap)
            return createImageBitmap(new Blob([b], { type: "image/webp" }), { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
          });
        })
        .then(function (bm) {
          if (bm.width !== a.lado || bm.height !== a.lado) throw new Error("lado " + bm.width + " ≠ " + a.lado);
          var t = new THREE.Texture(bm); t.flipY = false; t.premultiplyAlpha = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
          if (renderer.initTexture) renderer.initTexture(t);   // subida a la GPU ahora, no en el primer fotograma que la use
          return t;
        });
    }
    function impostores(f, rs) {
      return Promise.all([atlas(f.color, true), atlas(f.normales, false)]).then(function (tx) {
        if (!activo() || via !== "cargando impostores") { tx.forEach(function (t) { t.dispose(); }); return; }
        ponMalla(geoCuadro(), matImpostor(tx[0], tx[1], f), rs, null); malla.userData.sinEscala = true;
        triPor = 2; texMiB = (f.color.lado * f.color.lado + f.normales.lado * f.normales.lado) * 4 * 4 / 3 / 1048576; via = "impostor"; tCapa = 0; uCapa.value = 0;
      });
    }
    function geoCuadro() {
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
      return g;
    }
    // GLSL de la disposición del formato 1, la misma que apps/web/olivo/impostor.js (octaDeDireccion, direccionDeVista, baseDeVista, celdaUV);
    // pruebas/olivo/escalera_motor.mjs comprueba que estas fórmulas dan lo mismo que las de JS
    var GLSL_IMP = [
      "vec2 ot_oct(vec3 d) { float y = max(0.0, d.y); float s = abs(d.x) + y + abs(d.z); s = s > 0.0 ? s : 1.0; return vec2(d.x / s + d.z / s, d.x / s - d.z / s); }",
      "vec3 ot_dirV(vec2 ij) { float a = -1.0 + 2.0 * ij.x / 7.0, b = -1.0 + 2.0 * ij.y / 7.0; float x = (a + b) * 0.5, z = (a - b) * 0.5; return normalize(vec3(x, max(0.0, 1.0 - abs(x) - abs(z)), z)); }",
      "void ot_base(vec3 d, out vec3 r, out vec3 u) { r = cross(vec3(0.0, 1.0, 0.0), d); r = length(r) < 1e-6 ? vec3(1.0, 0.0, 0.0) : normalize(r); u = cross(d, r); }"].join("\n");
    // el trozo del sombreador de vértices: el cuadrado girado a la cámara en el marco del árbol y la celda de la vista más cercana
    var GLSL_IMP_V = " int ot_k = int(aVar + 0.5); vec3 ot_C = uCentro[ot_k]; float ot_S = uSemi[ot_k]; mat4 ot_IM = modelMatrix * instanceMatrix;\n" +
      " vec3 ot_d = normalize((inverse(ot_IM) * vec4(cameraPosition, 1.0)).xyz - ot_C);\n" +
      " vec2 ot_ij = floor(clamp((ot_oct(ot_d) + 1.0) * 3.5, 0.0, 7.0) + 0.5); vec3 ot_r, ot_u, ot_rv, ot_uv; ot_base(ot_d, ot_r, ot_u); ot_base(ot_dirV(ot_ij), ot_rv, ot_uv);\n" +
      " vec3 ot_off = position.x * ot_r + position.y * ot_u; transformed = ot_C + ot_off * ot_S;\n" +
      " vOtQ = vec2(dot(ot_off, ot_rv), dot(ot_off, ot_uv));\n" +
      " vOtUV = (vec2(mod(float(ot_k), 2.0) * 8.0 + ot_ij.x, floor(float(ot_k) / 2.0) * 8.0 + ot_ij.y) + vOtQ * 0.5 + 0.5) / 16.0;\n" +
      " mat3 ot_nm = transpose(inverse(mat3(ot_IM))); vOtN0 = ot_nm[0]; vOtN1 = ot_nm[1]; vOtN2 = ot_nm[2];";
    function matImpostor(tCol, tNor, f) {
      var C = [], S = [];
      for (var k = 0; k < 4; k++) { var v = f.variantes[Math.min(k, f.variantes.length - 1)]; C.push(new THREE.Vector3().fromArray(v.centro)); S.push(v.semilado); }
      var m = new THREE.MeshLambertMaterial({ map: tCol, alphaTest: 0.5 }), U = { uCentro: { value: C }, uSemi: { value: S }, tNorm: { value: tNor } };
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uCentro = U.uCentro; sh.uniforms.uSemi = U.uSemi; sh.uniforms.tNorm = U.tNorm; sh.uniforms.uCapa = uCapa;
        Generados.lejanos.parcheLuz(sh); Generados.lejanos.parcheFundido(sh);
        // después de los parches: así el cuadrado ya está colocado cuando la sombra de nubes lee «transformed»
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aVar; uniform vec3 uCentro[4]; uniform float uSemi[4]; varying vec2 vOtQ; varying vec2 vOtUV; varying vec3 vOtN0, vOtN1, vOtN2;\n" + GLSL_IMP)
          .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + GLSL_IMP_V + "\n#ifdef USE_MAP\n vMapUv = vOtUV;\n#endif\n");   // uv_vertex va antes que begin_vertex: el mapa se reescribe aquí
        sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform float uCapa; uniform sampler2D tNorm; varying vec2 vOtQ; varying vec2 vOtUV; varying vec3 vOtN0, vOtN1, vOtN2;\nvoid main() {\n if (abs(vOtQ.x) > 1.0 || abs(vOtQ.y) > 1.0 || ot_ign(gl_FragCoord.xy + vec2(17.0, 31.0)) >= uCapa) discard;")
          .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n normal = normalize((viewMatrix * vec4(normalize(mat3(vOtN0, vOtN1, vOtN2) * (texture2D(tNorm, vOtUV).xyz * 2.0 - 1.0)), 0.0)).xyz);");
      };
      m.customProgramCacheKey = function () { return "lejanos-impostor-1"; };
      return m;
    }
    // ---- el sustituto: la silueta de cada variante, horneada a una textura (2 vistas por variante) y dos planos cruzados por olivo
    function sustituto(rs) {
      try {
        var gs = rs.map(function (r) { var g = Generados.lejanos.monta(r); g.scale.set(1, 1, 1); g.updateMatrixWorld(true); return g; });
        cajas = gs.map(function (g) { return new THREE.Box3().setFromObject(g); });
        var tex = sinGPU ? null : hornea(gs);
        gs.forEach(function (g) { Generados.lejanos.libera(g); });
        ponMalla(geoCruz(), matSustituto(tex), rs, cajas);
        triPor = 4; texMiB = tex ? 2 * CEL * nv * CEL * 4 * 4 / 3 / 1048576 : 0; via = "sustituto"; tCapa = 0; uCapa.value = 0;
      } catch (e) { via = "sin"; motivo = String(e && e.message || e).slice(0, 80); console.warn("olivos lejanos: " + motivo + " (de lejos, solo la ortofoto)"); }
    }
    function hornea(gs) {
      var W = 2 * CEL, H = nv * CEL, t = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
      t.texture.colorSpace = THREE.SRGBColorSpace;   // en 8 bits, mejor codificado en sRGB (lo deshace la lectura): sin bandas en los verdes oscuros
      var sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xffffff, Math.PI));   // irradiancia π × Lambert 1/π: el albedo tal cual
      var prevRT = renderer.getRenderTarget(), prevXR = renderer.xr.enabled, cc = new THREE.Color(), ca = renderer.getClearAlpha(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
      renderer.getClearColor(cc); renderer.xr.enabled = false; renderer.setClearColor(0x000000, 0); t.scissorTest = true;
      try {
        gs.forEach(function (g, j) {
          var b = cajas[j], cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2, hy = (b.max.y - b.min.y) / 2;
          sc.add(g);
          for (var v = 0; v < 2; v++) {   // vista 0: desde +Z mirando a −Z (horizontal = x); vista 1: desde +X mirando a −X (horizontal = −z)
            var hx = v === 0 ? (b.max.x - b.min.x) / 2 : (b.max.z - b.min.z) / 2, fondo = v === 0 ? b.max.z - b.min.z : b.max.x - b.min.x;
            cam.left = -hx; cam.right = hx; cam.top = hy; cam.bottom = -hy; cam.near = 0.01; cam.far = fondo + 2; cam.updateProjectionMatrix();
            if (v === 0) { cam.position.set(cx, cy, b.max.z + 1); cam.lookAt(cx, cy, b.min.z); } else { cam.position.set(b.max.x + 1, cy, cz); cam.lookAt(b.min.x, cy, cz); }
            cam.updateMatrixWorld(true);
            t.viewport.set(v * CEL, j * CEL, CEL, CEL); t.scissor.set(v * CEL, j * CEL, CEL, CEL);
            renderer.setRenderTarget(t); renderer.render(sc, cam);   // autoClear con la tijera: limpia solo su celda
          }
          sc.remove(g);
        });
      } finally { renderer.setRenderTarget(prevRT); renderer.xr.enabled = prevXR; renderer.setClearColor(cc, ca); }
      rt = t; return t.texture;
    }
    // dos planos verticales que se cruzan en el eje del pie, en coordenadas unidad (la caja de la variante los estira): vista 0 en el plano XY, vista 1 en el ZY
    function geoCruz() {
      var P = [], N = [], U = [], V = [], I = [];
      for (var v = 0; v < 2; v++) for (var k = 0; k < 4; k++) {
        var u = k === 1 || k === 2 ? 1 : 0, w = k >= 2 ? 1 : 0;
        if (v === 0) P.push(u - 0.5, w, 0); else P.push(0, w, 0.5 - u);
        N.push(0, 1, 0); U.push(u, w); V.push(v);
      }
      I.push(0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7);
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); g.setAttribute("aVista", new THREE.Float32BufferAttribute(V, 1)); g.setIndex(I);
      return g;
    }
    function matSustituto(tex) {
      var m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }), uNV = { value: nv };
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uNVar = uNV; sh.uniforms.uCapa = uCapa;
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aVar; attribute float aVista; uniform float uNVar;")
          .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = (vec2(aVista, aVar) + uv) / vec2(2.0, uNVar);\n#endif");
        sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform float uCapa;\nvoid main() {\n if (ot_ign(gl_FragCoord.xy + vec2(17.0, 31.0)) >= uCapa) discard;");
        Generados.lejanos.parcheLuz(sh); Generados.lejanos.parcheFundido(sh);
      };
      m.customProgramCacheKey = function () { return "lejanos-sustituto"; };
      return m;
    }
    function ponMalla(geo, mat, rs, cj) {
      var n = olivos.length;
      geo.setAttribute("aFun", new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      geo.setAttribute("aVar", new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      malla = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); malla.name = "olivos-lejanos"; malla.frustumCulled = false; malla.count = 0;
      malla.userData.rs = rs; malla.userData.cajas = cj;
      gArboles.add(malla); exagM = -1;
    }
    // la matriz de cada olivo: la de su variante en 3D (07ab) y, en el sustituto, la caja de la variante (centro x/z, base y tamaño)
    function matricesDe() {
      var rs = malla.userData.rs, cj = malla.userData.cajas, m = new THREE.Matrix4(), mc = new THREE.Matrix4(), s = new THREE.Vector3();
      matrices = new Float32Array(olivos.length * 16);
      olivos.forEach(function (c, k) {
        var j = c.i % nv; m.copy(Generados.lejanos.matriz(c, rs[j]));
        if (malla.userData.sinEscala) m.multiply(mc.makeScale(1 / rs[j].escala[0], 1 / rs[j].escala[1], 1 / rs[j].escala[2]));   // el marco del impostor ya lleva receta.escala (contrato §1)
        if (cj) { var b = cj[j]; b.getSize(s); mc.makeScale(Math.max(s.x, 1e-3), Math.max(s.y, 1e-3), Math.max(s.z, 1e-3)).setPosition((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2); m.multiply(mc); }
        m.toArray(matrices, k * 16);
      });
      exagM = exag;
    }
    /** El reparto de los lejanos (desde 07b): cada olivo a menos de U2 m de la cámara que no está del todo en 3D (GEN.fase de 07ab) */
    function reparte(cam, GEN) {
      if (!malla || !hayCapa()) return info;
      repartido = true;   // el tramado de entrada de la capa (uCapa) empieza con el primer reparto, no al montarla
      if (exagM !== exag || !matrices) matricesDe();
      if (!ids) ids = new Int32Array(olivos.length);
      var A = malla.instanceMatrix.array, F = malla.geometry.attributes.aFun.array, V = malla.geometry.attributes.aVar.array, k = 0, en = 0, sa = 0;
      for (var q = 0; q < olivos.length; q++) {
        var c = olivos[q], f = GEN.fase ? GEN.fase(c.i) : 0;
        if (f === 1) continue;   // en 3D
        var dx = c.x - cam.x, dz = -c.y - cam.z, dy = Math.max(0, cam.y - (c.gz || 0) * exag);
        if (dx * dx + dz * dz + dy * dy >= U2 * U2) continue;
        A.set(matrices.subarray(q * 16, q * 16 + 16), k * 16); F[k] = f === 2 ? 2 + 3 * (GEN.ranura ? GEN.ranura(c.i) : 0) : f === 3 ? 1 : 0; V[k] = c.i % nv; ids[k] = c.i;
        if (f === 2) sa++; else if (f === 3) en++;
        k++;
      }
      malla.count = k; malla.instanceMatrix.needsUpdate = true; malla.geometry.attributes.aFun.needsUpdate = true; malla.geometry.attributes.aVar.needsUpdate = true;
      info = { dibujados: k, entran: en, salen: sa }; return info;
    }
    /** la capa ya entró entera (uCapa = 1): con la escalera horneada, 07b aparta entonces todos los olivos del tileset */
    function capaCompleta() { return hayCapa() && uCapa.value >= 1; }
    function triangulos() { return malla && hayCapa() ? malla.count * triPor : 0; }
    // también mientras la capa entra con su tramado (una vez repartida): las pruebas miden con la capa entera
    function pendientes() { return activo() && ((via === "esperando" || via === "cargando impostores") && Generados.activo() || hayCapa() && repartido && uCapa.value < 1) ? 1 : 0; }
    function resumen() { return activo() ? { fuente: via, motivo: motivo, aviso2: avisoImp || undefined, dibujados: info.dibujados, entran: info.entran, salen: info.salen, triangulos: triangulos(), llamadas: malla && hayCapa() && malla.count ? 1 : 0, capa: +uCapa.value.toFixed(2), texturaMiB: +texMiB.toFixed(2) } : null; }
    return { inicia: inicia, paso: paso, hayCapa: hayCapa, capaCompleta: capaCompleta, reparte: reparte, triangulos: triangulos, pendientes: pendientes, resumen: resumen,
      _prueba: { sinGPU: function () { sinGPU = true; }, malla: function () { return malla; }, cajas: function () { return cajas; }, ids: function () { return ids && malla ? Array.from(ids.subarray(0, malla.count)) : []; } } };
  })();
