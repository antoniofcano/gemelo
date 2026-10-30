// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: SN, S0, V0, vn2, cubierta, recoloreaSuelo, actualizaSuelo
// Consume: 01_datos (D, $, i16, ANCHO, ALTO, VRP), 02_mundo (suelo), 03_escena (scene, texColor, colorVertSRGB, exag), 04d_sombreado_tiles (hash),
//   05_nube (nube), 09_camara (objetivo, orb), 10_ndvi (NDV, ndviIdx, pintaNdvi), 12_paseo (paseando),
//   15_tiempo (uViento, uSombra, GLSL_SOMBRA, nivel, num1), 16_vida (esfera, enDron), 20_sonido (ejeArroyo, distArroyo)
// ===============================================================================
  // ---------- el suelo según el NDVI: dónde hay tierra desnuda y dónde hierba, y cómo de vigorosa
  // El NDVI de 10 m mezcla copa y suelo. Con la fracción de copa de cada celda (LiDAR) se resta la copa: g = NDVI − b·f. De g sale la cubierta (0 = desnudo, 1 = hierba tupida) y su vigor.
  // g se calcula en la rejilla del NDVI (10 m) y la tarjeta gráfica lo interpola por píxel; la CPU lo interpola igual para colocar matas, huellas y polvo.
  var SN = D.suelo_ndvi, SNf = SN ? i16(SN.f) : null, S0 = 0.17, V0 = 0.62, Gw = NDV ? NDV.w : 1, Gh = NDV ? NDV.h : 1, Gcampo = new Float32Array(Gw * Gh), Gpix = new Uint8Array(Gw * Gh * 4), Gtex = null;
  var hierbaOn = true, ultOnSuelo = true, ultCentro = [1e9, 1e9], ultFechaSuelo = -1, ultExag = -1, ultVR = -1;
  function vn2(x, y) { var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); var a = hash(ix * 127.1 + iy * 311.7), b = hash((ix + 1) * 127.1 + iy * 311.7), c = hash(ix * 127.1 + (iy + 1) * 311.7), d = hash((ix + 1) * 127.1 + (iy + 1) * 311.7); return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy; }
  function calculaCampoSuelo() {   // el NDVI del suelo de cada fecha
    var n = Gw * Gh, i, j, k;
    if (!NDV || !SN) Gcampo.fill(0.25);
    else {
      var off = ndviIdx * n, b = SN.b[ndviIdx], a = SN.a[ndviIdx], falta = [];
      for (i = 0; i < n; i++) { var q = NDV.datos[off + i]; if (q > -30000) Gcampo[i] = q / 1000 - b * SNf[i] / 1000; else { Gcampo[i] = a; falta.push(i); } }
      falta.forEach(function (c) {   // una celda sin dato (nube) toma la media de sus vecinas con dato
        var cj = Math.floor(c / Gw), ci = c - cj * Gw, s = 0, m = 0;
        for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) { var jj = cj + dj, ii = ci + di; if (jj < 0 || ii < 0 || jj >= Gh || ii >= Gw) continue; var q2 = NDV.datos[off + jj * Gw + ii]; if (q2 > -30000) { s += q2 / 1000 - b * SNf[jj * Gw + ii] / 1000; m++; } }
        if (m) Gcampo[c] = s / m;
      });
    }
    for (k = 0; k < n; k++) { Gpix[k * 4] = Math.max(0, Math.min(255, Math.round((Gcampo[k] + 0.3) / 1.3 * 255))); Gpix[k * 4 + 3] = 255; }
    if (!Gtex) { Gtex = new THREE.DataTexture(Gpix, Gw, Gh, THREE.RGBAFormat, THREE.UnsignedByteType); Gtex.magFilter = Gtex.minFilter = THREE.LinearFilter; Gtex.generateMipmaps = false; UN.uG.value = Gtex; }
    Gtex.needsUpdate = true;
  }
  function gSuelo(x, y) { var u = Math.max(0, Math.min(Gw - 1.001, (x - x0) / ANCHO * Gw - 0.5)), v = Math.max(0, Math.min(Gh - 1.001, (yN - y) / ALTO * Gh - 0.5)), iu = Math.floor(u), iv = Math.floor(v), tu = u - iu, tv = v - iv; return (Gcampo[iv * Gw + iu] * (1 - tu) + Gcampo[iv * Gw + iu + 1] * tu) * (1 - tv) + (Gcampo[(iv + 1) * Gw + iu] * (1 - tu) + Gcampo[(iv + 1) * Gw + iu + 1] * tu) * tv; }
  function cubierta(x, y) {   // [cobertura 0..1, vigor 0..1] en un punto: el NDVI da el nivel y el ruido lo reparte en matas
    var g = gSuelo(x, y), c = Math.max(0, Math.min(1, (g - S0) / (V0 - S0))), r = 0.55 + 0.9 * vn2(x * 0.33, y * 0.33) * 0.6 + 0.45 * vn2(x * 1.7 + 9, y * 1.7);
    return [Math.max(0, Math.min(1, c * r)), Math.max(0, Math.min(1, (g - 0.30) / 0.30))];
  }
  function recoloreaSuelo() {   // el color del suelo se compone en el sombreador: aquí solo se actualiza el NDVI de la fecha y el interruptor de la hierba
    calculaCampoSuelo(); ultFechaSuelo = ndviIdx; UN.uHierba.value = hierbaOn ? 1 : 0; ultCentro = [1e9, 1e9];
  }

  // --- matas de hierba y piedras alrededor de donde miras; siguen al NDVI de la fecha elegida y se mueven con el viento
  // Tres cartulinas cruzadas (a 0°, 60° y 120°) con una textura con alfa DIBUJADA (briznas, flores, espigas): lo que se ve son briznas, no polígonos que las imitan.
  // Las normales miran arriba para que la mata se ilumine como el suelo y no cambie de claro a oscuro al girar.
  function geoMata() {
    var pos = [], uv = [], idx = [], nor = [], k, a, ca, sa, w = 0.5, b = 0;
    for (k = 0; k < 3; k++) {
      a = k * Math.PI / 3; ca = Math.cos(a); sa = Math.sin(a);
      pos.push(-w * ca, 0, -w * sa, w * ca, 0, w * sa, w * ca, 1, w * sa, -w * ca, 1, -w * sa); uv.push(0, 0, 1, 0, 1, 1, 0, 1); nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3); b += 4;
    }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
  }
  function atlasHierba() {   // 4 losetas de 256 px: macolla verde, macolla seca, flores (manzanilla y amapola) y espigas. Verde/seca van casi blancas: el color por instancia las tiñe
    var c = document.createElement("canvas"); c.width = 1024; c.height = 256; var g = c.getContext("2d");
    function brizna(x0, h, lean, w, c0, c1) {
      var gr = g.createLinearGradient(0, 256, 0, 256 - h); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
      g.beginPath(); g.moveTo(x0 - w, 256); g.quadraticCurveTo(x0 + lean * 0.15 - w * 0.5, 256 - h * 0.62, x0 + lean, 256 - h); g.quadraticCurveTo(x0 + lean * 0.15 + w * 0.5, 256 - h * 0.62, x0 + w, 256); g.closePath(); g.fillStyle = gr; g.fill();
    }
    function macolla(t, n, hmin, hmax, lean, wmin, wmax, c0, c1) {
      g.save(); g.translate(t * 256, 0); g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
      for (var i = 0; i < n; i++) { var u = hash(i * 7.31 + t * 31.7), v = hash(i * 3.17 + t * 11.3 + 5), x0 = 28 + 200 * hash(i * 1.93 + t * 5.1 + 2), h = hmin + (hmax - hmin) * v * (1 - 0.35 * Math.abs(x0 - 128) / 100); brizna(x0, h, (u - 0.5) * 2 * lean, wmin + (wmax - wmin) * hash(i * 9.1 + t), c0, c1); }
      g.restore();
    }
    macolla(0, 54, 80, 215, 46, 2.5, 5.5, "rgb(96,110,70)", "rgb(255,255,236)");        // verde (se tiñe)
    macolla(1, 40, 90, 235, 70, 1.6, 3.6, "rgb(120,112,88)", "rgb(255,248,222)");       // seca: más fina y caída
    // flores: matas de hojas y 5 tallos con manzanilla (blanca con centro amarillo) y alguna amapola
    g.save(); g.translate(512, 0); g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
    for (var i = 0; i < 22; i++) brizna(30 + 196 * hash(i * 2.7 + 4), 70 + 70 * hash(i * 5.3), (hash(i * 8.1) - 0.5) * 60, 2.5 + 3 * hash(i * 1.7), "rgb(55,86,38)", "rgb(120,160,70)");
    for (var j = 0; j < 6; j++) {
      var fx = 40 + 176 * hash(j * 6.7 + 1), fy = 256 - 100 - 100 * hash(j * 3.9), lean = (hash(j * 2.3) - 0.5) * 36, amap = hash(j * 13.1) > 0.78;
      g.strokeStyle = "rgb(70,110,45)"; g.lineWidth = 2.6; g.beginPath(); g.moveTo(fx - lean * 0.6, 256); g.quadraticCurveTo(fx - lean * 0.2, 256 - (256 - fy) * 0.5, fx, fy); g.stroke();
      if (amap) { g.fillStyle = "rgb(205,38,28)"; for (var q = 0; q < 5; q++) { var ang = q * 1.2566; g.beginPath(); g.ellipse(fx + Math.cos(ang) * 6.5, fy + Math.sin(ang) * 6.5, 7.5, 6, ang, 0, 6.2832); g.fill(); } g.fillStyle = "rgb(40,25,20)"; g.beginPath(); g.arc(fx, fy, 3, 0, 6.2832); g.fill(); }
      else { g.fillStyle = "rgb(246,244,232)"; for (var q2 = 0; q2 < 11; q2++) { var an2 = q2 * 0.5712; g.beginPath(); g.ellipse(fx + Math.cos(an2) * 7.5, fy + Math.sin(an2) * 7.5, 5.6, 1.9, an2, 0, 6.2832); g.fill(); } g.fillStyle = "rgb(236,192,40)"; g.beginPath(); g.arc(fx, fy, 3.6, 0, 6.2832); g.fill(); }
    }
    g.restore();
    // espigas: tallos finos con cabezuelas en forma de grano (avena silvestre, cebadilla)
    g.save(); g.translate(768, 0); g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
    for (var m = 0; m < 17; m++) {
      var sx = 24 + 208 * hash(m * 3.3 + 7), sh = 120 + 110 * hash(m * 5.9), sl = (hash(m * 1.7 + 3) - 0.5) * 50, tx = sx + sl, ty = 256 - sh;
      g.strokeStyle = "rgb(178,170,138)"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(sx, 256); g.quadraticCurveTo(sx + sl * 0.1, 256 - sh * 0.6, tx, ty); g.stroke();
      g.fillStyle = "rgb(236,226,190)"; for (var e = 0; e < 7; e++) { g.beginPath(); g.ellipse(tx + (e % 2 ? 2.5 : -2.5) + sl * 0.02 * e, ty + e * 5.5, 2.6, 5.2, (e % 2 ? 0.35 : -0.35), 0, 6.2832); g.fill(); }
    }
    g.restore();
    var tx2 = texColor(new THREE.CanvasTexture(c)); tx2.anisotropy = 4; tx2.minFilter = THREE.LinearMipmapLinearFilter; tx2.magFilter = THREE.LinearFilter; return tx2;
  }
  function geoPiedra() {   // canto rodado: icosaedro subdividido, deformado con ruido y con las normales de la esfera (sin facetas)
    var g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, n = new Float32Array(p.count * 3), i, v = new THREE.Vector3(), d;
    for (i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize(); d = 1 + 0.3 * (vn2(v.x * 2.3 + 5, v.z * 2.3 + v.y * 1.7) - 0.5) + 0.12 * (vn2(v.x * 6 + 1, v.y * 6 + v.z * 5) - 0.5);
      n[i * 3] = v.x; n[i * 3 + 1] = v.y; n[i * 3 + 2] = v.z; p.setXYZ(i, v.x * d, v.y * d, v.z * d);
    }
    g.setAttribute("normal", new THREE.BufferAttribute(n, 3)); return g;
  }
  function texContacto() {   // sombra de contacto: mancha oscura que se difumina hacia fuera
    var c = document.createElement("canvas"); c.width = c.height = 64; var g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    gr.addColorStop(0, "rgba(0,0,0,0.62)"); gr.addColorStop(0.55, "rgba(0,0,0,0.28)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return texColor(new THREE.CanvasTexture(c));
  }
  var NTUFT = 16000, NSTONE = 2600, texHierba = atlasHierba(), matMata = new THREE.MeshLambertMaterial({ map: texHierba, alphaTest: 0.42, side: THREE.DoubleSide }), matPiedra = new THREE.MeshLambertMaterial({ color: 0xffffff });
  var iMata = new THREE.InstancedMesh(geoMata(), matMata, NTUFT), iPiedra = new THREE.InstancedMesh(geoPiedra(), matPiedra, NSTONE), tileMata = new THREE.InstancedBufferAttribute(new Float32Array(NTUFT), 1);
  var geoCont = new THREE.PlaneGeometry(1, 1); geoCont.rotateX(-Math.PI / 2);
  var matCont = new THREE.MeshBasicMaterial({ map: texContacto(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), iCont = new THREE.InstancedMesh(geoCont, matCont, NSTONE);
  iMata.geometry.setAttribute("aTile", tileMata);
  iMata.setColorAt(0, new THREE.Color(1, 1, 1)); iPiedra.setColorAt(0, new THREE.Color(1, 1, 1));   // el color por instancia tiene que existir antes del primer dibujo
  iMata.frustumCulled = false; iPiedra.frustumCulled = false; iCont.frustumCulled = false; iMata.count = 0; iPiedra.count = 0; iCont.count = 0; iCont.renderOrder = 2; scene.add(iMata); scene.add(iPiedra); scene.add(iCont);
  (function () {   // el viento mueve las matas (más arriba, más), y comparten sombra de nubes y escarcha con el resto
    matMata.onBeforeCompile = function (sh) {
      colorVertSRGB(sh);   // el color por instancia está escrito en sRGB (03_escena)
      sh.uniforms.uDrift = uSombra.uDrift; sh.uniforms.uCov = uSombra.uCov; sh.uniforms.uSomb = uSombra.uSomb; sh.uniforms.uHielo = uSombra.uHielo; sh.uniforms.uT = uViento.uT; sh.uniforms.uAmp = uViento.uAmp; sh.uniforms.uDir = uViento.uDir;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uT; uniform float uAmp; uniform vec2 uDir; attribute float aTile; varying vec3 vVPz;\n" + GLSL_SOMBRA)
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n vMapUv = vec2((vMapUv.x + aTile) * 0.25, vMapUv.y);")   // r151: el mapa lleva su propia coordenada (vMapUv), ya no vUv
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n vec3 wp = (instanceMatrix * vec4(transformed, 1.0)).xyz; vSomb = ot_sombra(wp.xz); float s = position.y;\n transformed.xz += (uDir * uAmp * 1.5 + 0.06 * vec2(sin(uT * 3.0 + wp.x * 1.7), cos(uT * 2.6 + wp.z * 1.9))) * s * s;");
      sh.vertexShader = sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n vVPz = -mvPosition.xyz;");
      // fundido por trama (dither) con la distancia, para que la mata se disuelva en el suelo y no «salte»; el pie más oscuro que la punta
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying float vSomb; uniform float uHielo; varying vec3 vVPz;\n#define vViewPosition vVPz\nvoid main() {")
        .replace("#include <map_fragment>", "#include <map_fragment>\n float dd = length(vViewPosition), ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));\n if (smoothstep(34.0, 58.0, dd) > ign || smoothstep(0.9, 0.2, dd) > ign) discard;\n diffuseColor.rgb *= 0.5 + 0.5 * smoothstep(0.0, 0.55, vMapUv.y);")
        .replace("#include <dithering_fragment>", "gl_FragColor.rgb *= vSomb; gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.88, 0.94, 1.0), uHielo * 0.6);\n#include <dithering_fragment>");
    };
    matMata.needsUpdate = true;
    matPiedra.onBeforeCompile = function (sh) {   // canto con granos, vetas y manchas de liquen (ruido por la posición local, sin textura)
      colorVertSRGB(sh);
      sh.uniforms.uDrift = uSombra.uDrift; sh.uniforms.uCov = uSombra.uCov; sh.uniforms.uSomb = uSombra.uSomb;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vP; varying float vSeed;\n" + GLSL_SOMBRA).replace("#include <begin_vertex>", "#include <begin_vertex>\n vP = position; vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.311); vSomb = ot_sombra((instanceMatrix * vec4(transformed, 1.0)).xz);");
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying float vSomb; varying vec3 vP; varying float vSeed;\nfloat sh3(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\nvoid main() {")
        .replace("#include <color_fragment>", "#include <color_fragment>\n float n1 = sh3(vP * 5.0 + vSeed * 40.0), n2 = sh3(vP * 13.0 + vSeed * 17.0), veta = 0.5 + 0.5 * sin((vP.x * 2.1 + vP.y * 3.4 + vSeed * 9.0) * 3.0 + n1 * 1.5);\n diffuseColor.rgb *= 0.74 + 0.16 * n1 + 0.1 * n2 + 0.12 * veta;\n diffuseColor.rgb = mix(diffuseColor.rgb, sRGBTransferEOTF(vec4(vec3(0.46, 0.5, 0.3) * 0.8, 1.0)).rgb,step(0.86, n1) * 0.4 * smoothstep(-0.2, 0.9, vP.y));")
        .replace("#include <dithering_fragment>", "gl_FragColor.rgb *= vSomb;\n#include <dithering_fragment>");
    };
    matPiedra.needsUpdate = true;
  })();
  var tmpM = new THREE.Object3D(), colM = new THREE.Color();
  function repartePlantas(cx, cy) {
    var mesF = NDV && NDV.fechas[ndviIdx] ? Number(NDV.fechas[ndviIdx].split("-")[1]) : 0, primavera = mesF >= 3 && mesF <= 5, R2 = VRP.on ? Math.max(4, VRP.hierba) : paseando ? 55 : 70, PAS = 1.7, i0 = Math.floor((cx - R2) / PAS), i1 = Math.floor((cx + R2) / PAS), j0 = Math.floor((cy - R2) / PAS), j1 = Math.floor((cy + R2) / PAS), nt = 0, np = 0, e = D.ext;
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
      var h1 = hash(i * 12.9898 + j * 78.233), x = (i + h1) * PAS, y = (j + hash(h1 * 91.7 + i)) * PAS;
      if (Math.hypot(x - cx, y - cy) > R2 || x < e[0] + 2 || x > e[2] - 2 || y < e[3] + 2 || y > e[1] - 2) continue;
      var cv = cubierta(x, y), c = cv[0], vig = cv[1], alto = 1, da = ejeArroyo.length ? distArroyo(x, y) : 99;
      if (da < 7 && da > 1.2) { var rb = 0.9 * (1 - da / 7); if (rb > c) { c = rb; vig = Math.max(vig, 0.85); alto = 1.9; } }
      var n = Math.floor(c * 2.6 + hash(h1 * 53.1 + j));
      for (var k = 0; k < n && nt < NTUFT; k++) {
        var px = x + (hash(h1 * 7.7 + k) - 0.5) * PAS, py = y + (hash(h1 * 3.3 + k * 5) - 0.5) * PAS, sz = (0.12 + 0.5 * (0.35 + 0.65 * vig)) * alto * (0.6 + 0.8 * hash(h1 * 11.1 + k)), ancho = 0.7 + 1.5 * sz * (0.7 + 0.6 * hash(h1 * 2 + k));
        tmpM.position.set(px, suelo(px, py) * exag, -py); tmpM.rotation.set(0, hash(h1 * 5.5 + k) * 6.28, 0); tmpM.scale.set(ancho, sz, ancho * (0.85 + 0.3 * hash(h1 + k))); tmpM.updateMatrix(); iMata.setMatrixAt(nt, tmpM.matrix);
        var seco = 1 - vig, ut = hash(h1 * 13.7 + k * 3.1), tile = seco > 0.5 ? (ut < 0.7 ? 1 : 3) : (ut < 0.8 ? 0 : 3);   // verde, seca, flores o espigas
        if (primavera && vig > 0.25 && ut > 0.82 && ut < 0.93) tile = 2;
        tileMata.array[nt] = tile;
        if (tile === 2) colM.setRGB(0.96, 0.98, 0.94); else colM.setRGB(0.62 + 0.30 * seco + 0.12 * hash(k + h1), 0.82 + 0.1 * seco - 0.04 * hash(k * 3 + h1), 0.5 + 0.28 * seco);   // la textura va casi blanca: el color por instancia la tiñe
        iMata.setColorAt(nt, colM); nt++;
      }
      // piedras: casi todas pequeñas, alguna grande; las grandes llevan una o dos pequeñas al lado y todas, una sombra de contacto
      if (np < NSTONE - 2 && hash(h1 * 29.3 + 7) < (1 - c) * 0.2) {
        var piedras = hash(h1 * 41.1) > 0.8 ? 3 : 1;
        for (var ip = 0; ip < piedras && np < NSTONE; ip++) {
          var gr0 = ip === 0, r = gr0 ? 0.04 + 0.2 * Math.pow(hash(h1 * 17.1), 2.4) : 0.025 + 0.05 * hash(h1 * 19.3 + ip), px2 = x + 0.3 + (gr0 ? 0 : (hash(h1 * 7 + ip) - 0.5) * 0.7), py2 = y - 0.2 + (gr0 ? 0 : (hash(h1 * 9 + ip) - 0.5) * 0.7), gz = suelo(px2, py2) * exag, ch = 0.5 + 0.2 * hash(h1 * 9 + ip);
          tmpM.position.set(px2, gz + r * 0.22, -py2); tmpM.rotation.set(hash(h1 + ip) * 3, hash(h1 * 2 + ip) * 6, 0); tmpM.scale.set(r * (1.1 + 0.3 * hash(h1 * 3 + ip)), r * (0.45 + 0.3 * hash(h1 * 4 + ip)), r); tmpM.updateMatrix(); iPiedra.setMatrixAt(np, tmpM.matrix);
          colM.setRGB(ch, ch * (0.93 - 0.05 * hash(h1 * 5 + ip)), ch * (0.8 - 0.1 * hash(h1 * 6 + ip))); iPiedra.setColorAt(np, colM);
          tmpM.position.set(px2, gz + 0.02, -py2); tmpM.rotation.set(0, 0, 0); tmpM.scale.set(r * 3.4, 1, r * 3.0); tmpM.updateMatrix(); iCont.setMatrixAt(np, tmpM.matrix); np++;
        }
      }
    }
    iMata.count = nt; iPiedra.count = np; iCont.count = np; iMata.instanceMatrix.needsUpdate = true; iPiedra.instanceMatrix.needsUpdate = true; iCont.instanceMatrix.needsUpdate = true; tileMata.needsUpdate = true;
    if (iMata.instanceColor) iMata.instanceColor.needsUpdate = true; if (iPiedra.instanceColor) iPiedra.instanceColor.needsUpdate = true;
    ultCentro = [cx, cy]; ultExag = exag;
  }
  var tSuelo = 0;
  function actualizaSuelo(dt) {
    hierbaOn = $("cHierba").checked;
    if (ultFechaSuelo !== ndviIdx || ultOnSuelo !== hierbaOn) { ultOnSuelo = hierbaOn; recoloreaSuelo(); }
    tSuelo += dt; if (tSuelo < 0.25) return; tSuelo = 0;
    var cerca = paseando || orb.dist < 230, cx = paseando ? (enDron ? dr.x : pp.x) : objetivo.x, cy = paseando ? (enDron ? dr.y : pp.y) : -objetivo.z;
    iMata.visible = iPiedra.visible = iCont.visible = hierbaOn && cerca && (!VRP.on || VRP.hierba > 0);
    if (!(hierbaOn && cerca)) return;
    if (Math.hypot(cx - ultCentro[0], cy - ultCentro[1]) > 12 || ultExag !== exag || ultVR !== VRP.hierba) { ultVR = VRP.hierba; repartePlantas(cx, cy); }
  }
  (function () {
    var s = $("ndviSel"); if (s) s.addEventListener("input", function () { ultCentro = [1e9, 1e9]; });
    var h = $("hSel"); if (h && NDV) {
      h.max = NDV.fechas.length - 1; h.value = ndviIdx;
      function etiq() { var a = SN ? SN.a[ndviIdx] : 0, c = Math.max(0, Math.min(1, (a - S0) / (V0 - S0))); $("hFecha").textContent = NDV.fechas[ndviIdx].split("-").reverse().join("/") + " · suelo NDVI " + num1(a, 2) + " · cubierta de hierba ~" + num1(c * 100, 0) + " %"; }
      h.addEventListener("input", function () { ndviIdx = Number(h.value); if ($("ndviSel")) $("ndviSel").value = ndviIdx; if (typeof pintaNdvi === "function" && $("cNdvi").checked) pintaNdvi(); etiq(); });
      etiq();
    }
  })();


