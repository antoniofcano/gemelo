// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: TM, calma, texBrillo, lluvia, uViento, uSombra, GLSL_SOMBRA, parcheTiempo, cur, meta, tMundo, ins, nivel, actualizaTiempo, temaBarrera,
//   colocaBarrera, pintaFondoTiempo, cargaT, fmtHora, fmtClaveDia, num1, rumbo, esc, hace, objetivoMundoBase, aplicaMundo, lindes
// Consume: 01_datos (D, $, FOG0, FOG1), 02_mundo (suelo, copas),
//   03_escena (visor, scene, camera, SRGB, LUZ_SOL, LUZ_CIELO, hemi, sol, texColor, colorVertSRGB, colorCss, exag, modo),
//   04_terreno (hash, matSuelo, matOrto, terreno), 05_nube (nube), 07_follaje (matHojaG, matHojaP, matCorteza), 08_marcadores (gLinde),
//   09_camara (objetivo, orb), 12_paseo (primera), 14_historia (mcp, marca, tabla, aviso), 16_vida (mira, temaEstela), 23_estacion (objetivoMundo),
//   24_pantalla (suave)
// ===============================================================================
  // ---------- el tiempo: el mundo del gemelo simula el que publica Vigía
  // Qué entra y de dónde: la estación (medido) pone la temperatura y la humedad de «ahora»; la previsión (modelado, rejilla de ~5 km)
  // pone las nubes, el viento y la lluvia, porque el anemómetro de la estación está descartado por Vigía. El sol sale de la fecha y la hora.
  var TM = { est: null, prev: null, his: null, modo: "ahora", idx: 0, ahoraIdx: 0, demo: "", mcp: null, jugando: false };
  var LAT = 37.73, LON = -4.006, ZONA = "Europe/Madrid";
  var calma = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var DEMOS = {
    lluvia: { nub: 96, lluvia: 6, viento: 5.5, dir: 225, hr: 88, temp: 12, etiqueta: "Lluvia de ejemplo" },
    viento: { nub: 35, lluvia: 0, viento: 13, dir: 300, hr: 30, temp: 18, etiqueta: "Viento fuerte de ejemplo" },
    niebla: { nub: 100, lluvia: 0, viento: 0.3, dir: 90, hr: 99, temp: 6, etiqueta: "Niebla de ejemplo" },
    helada: { nub: 4, lluvia: 0, viento: 0.4, dir: 0, hr: 86, temp: -3, etiqueta: "Helada de ejemplo" }
  };
  var cieloBase = colorCss("--sky");

  // --- posición del sol (algoritmo astronómico simple, suficiente para dibujarlo)
  function posSol(ms) {
    var rad = Math.PI / 180, n = ms / 86400000 + 2440587.5 - 2451545.0;
    var L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
    var lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), de = Math.asin(Math.sin(eps) * Math.sin(lam));
    var gmst = (280.46061837 + 360.98564736629 * n) % 360, Hh = (gmst + LON) * rad - ra, fi = LAT * rad;
    var alt = Math.asin(Math.sin(fi) * Math.sin(de) + Math.cos(fi) * Math.cos(de) * Math.cos(Hh));
    var az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(fi) - Math.tan(de) * Math.cos(fi)) + Math.PI;
    return { alt: alt, az: az };
  }

  // --- el cielo: nubes que derivan con el viento, disco del sol y estrellas
  function texNube() {
    var cv = document.createElement("canvas"); cv.width = cv.height = 128; var x = cv.getContext("2d");
    [[64, 70, 46], [38, 74, 32], [90, 76, 34], [58, 52, 30], [78, 56, 28]].forEach(function (c) {
      var g = x.createRadialGradient(c[0], c[1], 2, c[0], c[1], c[2]); g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    });
    return texColor(new THREE.CanvasTexture(cv));
  }
  function texBrillo() {
    var cv = document.createElement("canvas"); cv.width = cv.height = 128; var x = cv.getContext("2d"), g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,235,1)"); g.addColorStop(0.12, "rgba(255,244,200,0.95)"); g.addColorStop(0.3, "rgba(255,220,150,0.35)"); g.addColorStop(1, "rgba(255,200,120,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return texColor(new THREE.CanvasTexture(cv));
  }
  // Las nubes (46 grupos de 5 manchas, 230 en total) van en UNA malla y UNA llamada de dibujo (T6b, criterio 2 del ADR-0015): antes eran 230
  // sprites, uno por llamada, y con el cielo cubierto se llevaban casi todo el presupuesto de llamadas. Cada mancha es un cuadrado de cara a la
  // cámara (como un Sprite de three: centro, tamaño, sin giro) y su sombreado es el de SpriteMaterial (textura × color × opacidad, tono y
  // espacio de color de salida); las de opacidad 0 no se mandan. Como los sprites, se ordenan de lejos a cerca cada fotograma (son transparentes).
  var gCielo = new THREE.Group(); gCielo.name = "cielo"; scene.add(gCielo);
  var NUBES = [], texN = texNube(), NSP = 46 * 5;
  (function () {
    for (var i = 0; i < 46; i++) {
      var r1 = hash(i * 3.1), r2 = hash(i * 5.7), r3 = hash(i * 9.3), tam = 150 + 190 * r3, gr = { position: new THREE.Vector3((r1 - 0.5) * 2400, 230 + 130 * r2, (r2 - 0.5) * 2000), umbral: (i + 0.5) / 46, o: 0, sp: [] };
      for (var j = 0; j < 5; j++) {
        var s = tam * (0.55 + 0.6 * hash(i * 11 + j));
        gr.sp.push({ sx: s, sy: s * 0.5, p: new THREE.Vector3((hash(i * 7 + j) - 0.5) * tam * 0.9, (hash(i * 13 + j) - 0.5) * 12, (hash(i * 17 + j) - 0.5) * tam * 0.35) });
      }
      NUBES.push(gr);
    }
  })();
  var nubesMalla = (function () {
    var g = new THREE.BufferGeometry(), E = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], UV = [0, 0, 1, 0, 1, 1, 0, 1];
    var esq = new Float32Array(NSP * 8), uv = new Float32Array(NSP * 8), idx = new Uint16Array(NSP * 6);
    for (var k = 0; k < NSP; k++) { esq.set(E, k * 8); uv.set(UV, k * 8); idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6); }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NSP * 12), 3).setUsage(THREE.DynamicDrawUsage));   // el centro de la mancha, en sus 4 vértices
    g.setAttribute("esquina", new THREE.BufferAttribute(esq, 2)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("tam", new THREE.BufferAttribute(new Float32Array(NSP * 8), 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alfa", new THREE.BufferAttribute(new Float32Array(NSP * 4), 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    var m = new THREE.ShaderMaterial({
      uniforms: { map: { value: texN }, diffuse: { value: new THREE.Color(1, 1, 1) } }, transparent: true, depthWrite: false, fog: false,
      vertexShader: "attribute vec2 esquina; attribute vec2 tam; attribute float alfa; varying vec2 vUv; varying float vA;\n" +
        "void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += esquina * tam; gl_Position = projectionMatrix * mv; vUv = uv; vA = alfa; }",
      fragmentShader: "uniform sampler2D map; uniform vec3 diffuse; varying vec2 vUv; varying float vA;\n" +
        "void main() { vec4 c = vec4(diffuse, vA) * texture2D(map, vUv); gl_FragColor = c;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
    });
    var me = new THREE.Mesh(g, m); me.name = "nubes"; me.frustumCulled = false; me.renderOrder = -1; gCielo.add(me);
    return me;
  })();
  var nubesOrden = [], vTmp = new THREE.Vector3();
  function pintaNubes() {   // las manchas con opacidad, de la más lejana a la más cercana a la cámara, en los buffers de la malla
    var G = nubesMalla.geometry, P = G.attributes.position.array, T = G.attributes.tam.array, A = G.attributes.alfa.array, n = 0;
    nubesOrden.length = 0;
    NUBES.forEach(function (gr) { if (gr.o > 0) gr.sp.forEach(function (s) { vTmp.copy(gr.position).add(s.p); nubesOrden.push({ s: s, gr: gr, x: vTmp.x, y: vTmp.y, z: vTmp.z, d: vTmp.distanceToSquared(camera.position) }); }); });
    nubesOrden.sort(function (a, b) { return b.d - a.d; });
    nubesOrden.forEach(function (q) {
      for (var v = 0; v < 4; v++) { var k = n * 4 + v; P[k * 3] = q.x; P[k * 3 + 1] = q.y; P[k * 3 + 2] = q.z; T[k * 2] = q.s.sx; T[k * 2 + 1] = q.s.sy; A[k] = q.gr.o; }
      n++;
    });
    G.attributes.position.needsUpdate = G.attributes.tam.needsUpdate = G.attributes.alfa.needsUpdate = true;
    G.setDrawRange(0, n * 6); nubesMalla.visible = n > 0;
  }
  var sprSol = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBrillo(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sprSol.scale.set(520, 520, 1); sprSol.renderOrder = -1; scene.add(sprSol);
  var estrellas = (function () {
    var n = 420, p = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { var u = hash(i * 2.3) * 2 - 1, a = hash(i * 4.9) * 6.283, r = Math.sqrt(1 - u * u); p[i * 3] = r * Math.cos(a) * 4000; p[i * 3 + 1] = Math.abs(u) * 4000 * 0.95 + 120; p[i * 3 + 2] = r * Math.sin(a) * 4000; }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    var m = new THREE.Points(g, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false })); m.frustumCulled = false; m.renderOrder = -2; scene.add(m); return m;
  })();

  // --- la lluvia: rayitas que caen en una caja que sigue a la cámara; la animación va en la tarjeta gráfica
  var uLluvia = { uT: { value: 0 }, uInt: { value: 0 }, uViento: { value: new THREE.Vector2(0, 0) }, uColor: { value: new THREE.Color(0xbcd2e6) } };
  var lluvia = (function () {
    var n = 7500, p = new Float32Array(n * 2 * 3), e = new Float32Array(n * 2);
    for (var i = 0; i < n; i++) { var x = (hash(i * 1.7) - 0.5) * 900, y = hash(i * 3.3) * 170, z = (hash(i * 5.9) - 0.5) * 900; for (var k = 0; k < 2; k++) { p[(i * 2 + k) * 3] = x; p[(i * 2 + k) * 3 + 1] = y; p[(i * 2 + k) * 3 + 2] = z; e[i * 2 + k] = k; } }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("aEnd", new THREE.BufferAttribute(e, 1));
    var m = new THREE.ShaderMaterial({
      uniforms: uLluvia, transparent: true, depthWrite: false,
      vertexShader: "attribute float aEnd; uniform float uT; uniform vec2 uViento; varying float vA;\n" +
        "void main(){ float H = 170.0; float y = mod(position.y - uT * 26.0, H); vec3 p = position; p.y = y + aEnd * 3.4;\n" +
        "p.xz += uViento * (H - y) * 0.035 - uViento * aEnd * 0.5; vA = 1.0 - aEnd * 0.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
      fragmentShader: "uniform float uInt; uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, 0.75 * uInt * vA);\n#include <colorspace_fragment>\n}"
    });
    var l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.visible = false; scene.add(l); return l;
  })();

  // --- el viento mueve el follaje (onBeforeCompile: un desplazamiento suave que depende de la posición)
  var uViento = { uT: { value: 0 }, uAmp: { value: 0 }, uDir: { value: new THREE.Vector2(1, 0) } };
  // Las nubes además echan su sombra sobre el terreno y los árboles: un ruido que deriva con el viento, calculado en la tarjeta gráfica.
  var uSombra = { uDrift: { value: new THREE.Vector2(0, 0) }, uCov: { value: 0 }, uSomb: { value: 0 }, uHielo: { value: 0 } };
  var GLSL_SOMBRA = "uniform vec2 uDrift; uniform float uCov; uniform float uSomb; varying float vSomb;\n" +
    "float ot_h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" +
    "float ot_vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ot_h(i), ot_h(i + vec2(1.0, 0.0)), f.x), mix(ot_h(i + vec2(0.0, 1.0)), ot_h(i + vec2(1.0, 1.0)), f.x), f.y); }\n" +
    "float ot_sombra(vec2 xz){ vec2 q = xz * 0.0042 - uDrift; float n = 0.6 * ot_vn(q) + 0.4 * ot_vn(q * 2.3 + 7.0); float t = mix(0.85, 0.22, uCov); return 1.0 - smoothstep(t - 0.07, t + 0.07, n) * uSomb * step(0.01, uCov); }\n";
  function conTiempo(m, viento) {
    m.onBeforeCompile = function (sh) { parcheTiempo(sh, viento); };
    m.needsUpdate = true;
  }
  function parcheTiempo(sh, viento) {
    colorVertSRGB(sh);   // el color por vértice o por instancia de lo que lleva el tiempo está escrito en sRGB (03_escena)
    {
      sh.uniforms.uDrift = uSombra.uDrift; sh.uniforms.uCov = uSombra.uCov; sh.uniforms.uSomb = uSombra.uSomb; sh.uniforms.uHielo = uSombra.uHielo;
      if (viento) { sh.uniforms.uT = uViento.uT; sh.uniforms.uAmp = uViento.uAmp; sh.uniforms.uDir = uViento.uDir; }
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + (viento ? "uniform float uT; uniform float uAmp; uniform vec2 uDir;\n" : "") + GLSL_SOMBRA)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n vSomb = ot_sombra(position.xz);" + (viento ? "\n float ph = position.x * 0.21 + position.z * 0.17; float rf = sin(uT * 1.9 + ph) + 0.6 * sin(uT * 3.1 + ph * 1.7);\n transformed.xz += uDir * (uAmp * (0.55 + 0.45 * rf)); transformed.y += 0.12 * uAmp * sin(uT * 2.3 + ph * 2.0);" : ""));
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying float vSomb; uniform float uHielo;\nvoid main() {").replace("#include <dithering_fragment>", "gl_FragColor.rgb *= vSomb; gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.88, 0.94, 1.0), uHielo * 0.6);\n#include <dithering_fragment>");
    }
  }
  [matHojaG, matHojaP, matCorteza].forEach(function (m) { conTiempo(m, true); });
  [matSuelo, matOrto, nube.material].forEach(function (m) { conTiempo(m, false); });

  // --- el estado del mundo avanza hacia el objetivo con suavidad
  var cur = { ms: Date.now(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 }, meta = { ms: Date.now(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 };
  var tMundo = 0, lluviaVis = 0, ins = { t: 1, txt: "" };
  function nivel(ms) { var s = posSol(ms), d = Math.max(0, Math.min(1, (Math.sin(s.alt) + 0.1) / 0.45)); return { s: s, d: d }; }
  function lerpN(a, b, t) { return a + (b - a) * t; }
  function angDif(a, b) { var d = ((b - a + 540) % 360) - 180; return d; }
  function actualizaTiempo(dt, tms) {
    var k = Math.min(1, dt * 3.2);
    if (Math.abs(meta.ms - cur.ms) > 2 * 86400000) cur.ms = meta.ms;   // un cambio de fecha (la estación) es un salto, no un viaje en el tiempo
    cur.ms += (meta.ms - cur.ms) * Math.min(1, dt * 4); if (Math.abs(meta.ms - cur.ms) < 2000) cur.ms = meta.ms;
    ["nub", "viento", "lluvia", "hr", "temp"].forEach(function (c) { cur[c] += (meta[c] - cur[c]) * k; });
    cur.dir = (cur.dir + angDif(cur.dir, meta.dir) * k + 360) % 360;
    tMundo += calma ? 0 : dt;
    var lv = nivel(cur.ms), alt = lv.s.alt, d = lv.d, nub = cur.nub / 100, oc = 1 - 0.55 * nub - 0.2 * Math.min(1, cur.lluvia / 3);
    // sol: dirección y color
    var dirS = new THREE.Vector3(Math.sin(lv.s.az) * Math.cos(alt), Math.sin(alt), -Math.cos(lv.s.az) * Math.cos(alt));
    sol.position.copy(dirS).multiplyScalar(300); if (alt < 0.02) sol.position.y = 6;
    var bajo = Math.max(0, Math.min(1, 1 - Math.sin(alt) / 0.35)), noc = 1 - d;   // bajo: 1 = sol rasante · noc: 1 = noche cerrada
    sol.color.setRGB(1, 0.94 - 0.38 * bajo, 0.82 - 0.58 * bajo, SRGB);
    sol.intensity = (0.08 + 0.85 * d * (1 - 0.8 * nub)) * LUZ_SOL;
    hemi.intensity = (0.2 + 0.7 * d * (0.55 + 0.45 * oc)) * LUZ_CIELO;
    // cielo y niebla
    var dia = cieloBase.clone(), noche = new THREE.Color(0x070b18), ocaso = new THREE.Color(0xc77b4e), gris = new THREE.Color(0x8a8f94);
    var c = noche.clone().lerp(dia, d); if (bajo > 0 && d > 0.02) c.lerp(ocaso, 0.8 * bajo * Math.min(1, d * 2.5) * (1 - 0.7 * nub)); c.lerp(gris.multiplyScalar(0.25 + 0.75 * d), 0.55 * nub);
    scene.background = c; if (scene.fog) {
      scene.fog.color.copy(c); var h = Math.max(0, Math.min(1, (cur.hr - 70) / 30));
      scene.fog.near = lerpN(FOG0, 15, h * h); scene.fog.far = lerpN(FOG1, 260, h) * (1 - 0.35 * Math.min(1, cur.lluvia / 4));
    }
    // luz de lo que no se ilumina (follaje en puntos, nube de puntos, ortofoto): el mismo ciclo de día y noche
    var f = 0.2 + 0.8 * d * (0.7 + 0.3 * oc), r = Math.min(1, f * (1 + 0.1 * bajo - 0.22 * noc)), gc = f * (1 - 0.1 * bajo - 0.1 * noc), bc = Math.min(1, f * (1 - 0.3 * bajo + 0.28 * noc));
    [matHojaG, matHojaP, matCorteza, nube.material, matOrto].forEach(function (m) { m.color.setRGB(r, gc, bc, SRGB); });
    matSuelo.color.setRGB(1 - 0.18 * Math.min(1, cur.lluvia / 2), 1 - 0.14 * Math.min(1, cur.lluvia / 2), 1 - 0.1 * Math.min(1, cur.lluvia / 2), SRGB);
    // sombras de las nubes: avanzan con el viento y se ven desde arriba, que es desde donde se mira el gemelo
    var rad0 = Math.PI / 180, vxS = -Math.sin(cur.dir * rad0), vzS = Math.cos(cur.dir * rad0), velS = calma ? 0 : 3 + cur.viento * 5;
    uSombra.uCov.value = nub; uSombra.uSomb.value = 0.5 * d * (1 - 0.55 * nub);
    // la helada: el aire a 2 °C o menos, cielo despejado y calma dejan escarcha sobre el suelo y las copas (más de noche que de día)
    uSombra.uHielo.value = Math.max(0, Math.min(1, (2 - cur.temp) / 3)) * (1 - 0.8 * nub) * (cur.viento > 3.5 ? 0.35 : 1) * (1 - 0.6 * d);
    uSombra.uDrift.value.x += vxS * velS * dt * 0.0042; uSombra.uDrift.value.y += vzS * velS * dt * 0.0042;
    // objetos del cielo siguen a la cámara
    sprSol.position.copy(camera.position).addScaledVector(dirS, 3500); sprSol.visible = alt > -0.05; sprSol.material.opacity = Math.max(0, Math.min(1, (Math.sin(alt) + 0.05) * 6)) * (1 - 0.85 * nub);
    sprSol.material.color.setRGB(1, 0.85 - 0.25 * bajo, 0.65 - 0.3 * bajo, SRGB);
    estrellas.position.copy(camera.position); estrellas.material.opacity = Math.max(0, Math.min(1, (-Math.sin(alt) - 0.02) * 8)) * (1 - nub);
    // nubes: tantas como diga la nubosidad; derivan hacia donde sopla el viento (más deprisa de lo real, para que se vea)
    var rad = Math.PI / 180, vx = -Math.sin(cur.dir * rad), vz = Math.cos(cur.dir * rad), vel = calma ? 0 : 3 + cur.viento * 5;
    var tinta = new THREE.Color(1, 1, 1).lerp(new THREE.Color(0x6e747b), Math.min(1, cur.lluvia / 2.5) * 0.9 + 0.1 * nub);
    var luz = new THREE.Color().setRGB(r * (0.55 + 0.6 * d), gc * (0.55 + 0.6 * d), bc * (0.55 + 0.6 * d), SRGB);
    NUBES.forEach(function (g) {
      g.position.x += vx * vel * dt; g.position.z += vz * vel * dt;
      if (g.position.x > 1300) g.position.x -= 2600; else if (g.position.x < -1300) g.position.x += 2600;
      if (g.position.z > 1100) g.position.z -= 2200; else if (g.position.z < -1100) g.position.z += 2200;
      g.o = nub > g.umbral ? Math.min(1, (nub - g.umbral) * 14) * (0.35 + 0.55 * nub) : 0;
    });
    nubesMalla.material.uniforms.diffuse.value.copy(tinta).multiply(luz); pintaNubes();
    // viento sobre el follaje
    var amp = calma ? 0 : Math.min(0.5, 0.03 + 0.1 * cur.viento);
    uViento.uT.value = tMundo; uViento.uAmp.value = amp; uViento.uDir.value.set(vx, vz);
    // lluvia
    lluviaVis += ((cur.lluvia > 0.05 ? 1 : 0) - lluviaVis) * k; var inten = Math.min(1, cur.lluvia / 3) * 0.8 + (cur.lluvia > 0.05 ? 0.15 : 0);
    lluvia.visible = lluviaVis > 0.02 && inten > 0.02; lluvia.position.set(objetivo.x, objetivo.y - 20, objetivo.z);
    uLluvia.uT.value = tMundo; uLluvia.uInt.value = inten * lluviaVis; uLluvia.uViento.value.set(vx * Math.min(1, cur.viento / 6), vz * Math.min(1, cur.viento / 6)); uLluvia.uColor.value.setRGB(0.4 + 0.5 * d, 0.5 + 0.45 * d, 0.6 + 0.35 * d, SRGB);
    // la chapita del visor: hora, temperatura, nubes y viento, con la flecha de hacia dónde sopla respecto a cómo miras
    ins.t += dt; if (ins.t > 0.25) {
      ins.t = 0; var fw = [-Math.sin(orb.az), -Math.cos(orb.az)], rg = [-fw[1], fw[0]], ang = Math.atan2(vxS * rg[0] + vzS * rg[1], vxS * fw[0] + vzS * fw[1]) * 180 / Math.PI;
      $("tFlecha").style.transform = "rotate(" + ang.toFixed(0) + "deg)"; $("tFlecha").style.opacity = cur.viento < 0.3 ? 0.25 : 1;
      var txt = fmtHora.format(new Date(cur.ms)) + " · " + num1(cur.temp, 0) + " °C · " + (cur.temp <= 0 ? "helada · " : "") + num1(cur.nub, 0) + " % nubes · " + (cur.lluvia > 0.05 ? "lluvia " + num1(cur.lluvia, 1) + " mm · " : "") + (cur.viento < 0.3 ? "calma" : rumbo(cur.dir) + " " + num1(cur.viento, 1) + " m/s");
      if (txt !== ins.txt) { ins.txt = txt; $("tInsT").textContent = txt; }
    }
    // la barrera de la linde (Tron) late
    uBarrera.uT.value = tMundo;
  }

  // --- la barrera de la linde: una película de luz translúcida en vez de una línea blanca
  var uBarrera = { uT: { value: 0 }, uColor: { value: new THREE.Color(0x40f0ff) }, uAlpha: { value: 1 } };
  var BARRERA_ALTO = 5.5, BARRERAS = [];
  var matBarrera = new THREE.ShaderMaterial({
    uniforms: uBarrera, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: "attribute float aV; attribute float aD; varying float vV; varying float vD; void main(){ vV = aV; vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uT; uniform vec3 uColor; uniform float uAlpha; varying float vV; varying float vD;\n" +
      "void main(){ float caida = pow(1.0 - vV, 1.7); float pie = smoothstep(0.09, 0.0, vV); float filo = smoothstep(0.92, 1.0, vV) * 0.5;\n" +
      "float x = fract(vD / 5.0); float rej = smoothstep(0.04, 0.0, min(x, 1.0 - x)) * 0.3 * caida;\n" +
      "float p = fract(vD / 110.0 - uT * 0.05); float pulso = smoothstep(0.0, 0.025, p) * smoothstep(0.14, 0.025, p);\n" +
      "float a = uAlpha * (0.1 + 0.5 * caida) + pie * 0.95 + filo + rej + pulso * 0.55 * (0.4 + caida);\n" +
      "gl_FragColor = vec4(uColor * (1.0 + 0.7 * pie + 0.9 * pulso), clamp(a, 0.0, 1.0));\n#include <colorspace_fragment>\n}"
  });
  function temaBarrera() {
    if (!matBarrera || !uBarrera) return;
    var s = cieloBase.clone().convertLinearToSRGB(), oscuro =(0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b) < 0.4;
    // sobre fondo claro la luz aditiva se lava: se usa mezcla normal y un turquesa profundo
    matBarrera.blending = oscuro ? THREE.AdditiveBlending : THREE.NormalBlending;
    uBarrera.uColor.value.set(oscuro ? 0x40f0ff : 0x007f99); uBarrera.uAlpha.value = oscuro ? 1 : 1.25; matBarrera.needsUpdate = true;
    if (typeof temaEstela === "function") temaEstela(oscuro);
  }
  function creaBarrera(pr) {  // la linde, remuestreada cada ≤ 4 m para que la película siga el terreno
    var pts = [], r = pr.linde.concat([pr.linde[0]]), dist = [0];
    for (var i = 0; i < r.length - 1; i++) {
      var a = r[i], b = r[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 4));
      for (var j = 0; j < n; j++) pts.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
    }
    pts.push(r[r.length - 1]);
    var acc = 0, N = pts.length, d = new Float32Array(N * 2), v = new Float32Array(N * 2), idx = [];
    for (var q = 0; q < N; q++) { if (q) acc += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]); d[q * 2] = d[q * 2 + 1] = acc; v[q * 2] = 0; v[q * 2 + 1] = 1; if (q < N - 1) { var a0 = q * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); } }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3)); g.setAttribute("aV", new THREE.BufferAttribute(v, 1)); g.setAttribute("aD", new THREE.BufferAttribute(d, 1)); g.setIndex(idx);
    var m = new THREE.Mesh(g, matBarrera); m.frustumCulled = false; m.renderOrder = 5; gLinde.add(m); BARRERAS.push({ pts: pts, geo: g });
    return g;
  }
  function colocaBarrera(k) {
    var b = BARRERAS[k], p = b.geo.attributes.position;
    b.pts.forEach(function (q, i) { var y0 = suelo(q[0], q[1]) + 0.12; p.setXYZ(i * 2, q[0], y0 * exag, -q[1]); p.setXYZ(i * 2 + 1, q[0], (y0 + BARRERA_ALTO) * exag, -q[1]); });
    p.needsUpdate = true;
  }
  function pintaFondoTiempo() { cieloBase = colorCss("--sky"); temaBarrera(); }

  // --- los datos
  function cargaT(r) { var p = r && r.payload; if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { p = null; } } return p; }
  var fmtDia = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" });
  var fmtHora = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  var fmtClaveDia = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA });
  function num1(v, d) { return v == null ? "—" : Number(v).toLocaleString("es-ES", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
  function rumbo(g) { var n = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]; return n[Math.round(((g % 360) + 360) % 360 / 45) % 8]; }
  function tAviso(t, tipo) { var e = $("tEstado"); e.textContent = t; if (tipo) e.setAttribute("data-t", tipo); else e.removeAttribute("data-t"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hace(iso) { if (!iso) return ""; var h = (Date.now() - Date.parse(iso)) / 3600000; return h < 1 ? "hace " + Math.max(1, Math.round(h * 60)) + " min" : "hace " + num1(h, 1) + " h"; }

  function horaActual() { // la hora de la previsión que contiene el momento
    var h = TM.prev && TM.prev.horas; if (!h || !h.length) return -1;
    var ahora = Date.now(), i = 0; for (var k = 0; k < h.length; k++) { if (Date.parse(h[k].instante) <= ahora) i = k; else break; } return i;
  }
  function objetivoMundoBase() {
    var h = TM.prev && TM.prev.horas, m = { ms: Date.now(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 };
    if (TM.demo && DEMOS[TM.demo]) { var D0 = DEMOS[TM.demo]; m.nub = D0.nub; m.lluvia = D0.lluvia; m.viento = D0.viento; m.dir = D0.dir; m.hr = D0.hr; m.temp = D0.temp; m.ms = TM.modo === "ahora" || !h ? Date.now() : Date.parse(h[TM.idx].instante); return m; }
    if (!h || !h.length) return m;
    var hh = h[Math.max(0, Math.min(h.length - 1, TM.idx))], e = TM.est;
    m.nub = hh.nubosidad; m.viento = hh.viento; m.dir = hh.direccion; m.lluvia = hh.lluvia || 0; m.hr = hh.humedadRelativa; m.temp = hh.temperatura;
    if (TM.modo === "ahora") { m.ms = Date.now(); if (e && e.hayLectura) { if (e.humedadRelativa != null) m.hr = e.humedadRelativa; if (e.temperatura != null) m.temp = e.temperatura; } }
    else m.ms = Date.parse(hh.instante);
    return m;
  }
  function aplicaMundo() { var m = objetivoMundo(); Object.keys(m).forEach(function (c) { meta[c] = m[c]; }); }

  // --- las dos fichas
  function tarjetaEstacion() {
    var e = TM.est, c = $("tEst");
    if (!e || !e.hayLectura) { c.innerHTML = '<h3>Estación</h3><p class="nota">' + (e ? "Vigía no tiene lectura de la estación ahora mismo." : "Sin leer todavía.") + "</p>"; return; }
    var s = e.estacion || {}, f = e.frescura || {}, his = TM.his && (TM.his.porFuente || []).filter(function (x) { return x.id === s.id || /imarto/i.test(x.id || ""); })[0];
    var fil = function (k, v, u) { return "<div><dt>" + k + "</dt><dd>" + v + (u ? ' <small>' + u + "</small>" : "") + "</dd></div>"; };
    var h = '<h3>Estación ' + esc(s.id || "") + ' <span class="t-pill">medido</span></h3>' +
      '<p class="t-sub">A ' + num1(s.distanciaKm, 1) + ' km de la finca: no está en ella. ' + (f.datosDeMaqueta ? "<strong>Datos de maqueta.</strong> " : "") + hace(f.generadoEn) + '.</p>' +
      '<div class="t-grande"><span>' + num1(e.temperatura, 1) + '</span><small>°C</small></div><dl class="t-cifras">' +
      fil("Humedad", num1(e.humedadRelativa, 0), "%") + fil("Delta-T", num1(e.deltaT, 1), "°C") +
      fil("Lluvia acumulada", num1(e.lluviaAcumulada, 1), "mm") +
      fil("Viento", num1(e.viento, 1), "m/s") + fil("Racha", num1(e.racha, 1), "m/s") + fil("Dirección", e.direccionViento ? rumbo(e.direccionViento.grados) + " " + e.direccionViento.grados + "°" : "—", "") + '</dl>';
    h += '<p class="t-aviso">El anemómetro de esta estación está descartado por Vigía (lee la mitad que el patrón de RIA, resguardado): el viento del mundo sale de la previsión.' + ((e.inhabilitados || []).length ? " Sin " + esc(e.inhabilitados.join(", ")) + "." : "") + "</p>";
    if (his) {
      h += '<h4>Últimos 7 días</h4><p class="t-sub">Máx. <strong>' + num1(his.temperaturaMaxima, 1) + '</strong> °C · mín. <strong>' + num1(his.temperaturaMinima, 1) + '</strong> °C · lluvia <strong>' + num1(his.lluviaTotalMm, 1) + '</strong> mm' + (his.diasConLluvia != null ? " en " + his.diasConLluvia + " día(s)" : "") +
        '. ' + (his.diasSinDato ? "Faltan datos de " + his.diasSinDato + " de " + (his.dias + his.diasSinDato) + " días." : "Sin días sin dato.") + "</p>";
    }
    c.innerHTML = h;
  }
  function resumenDias() {
    var hs = TM.prev.horas, por = {}, orden = [];
    hs.forEach(function (x, i) { var k = fmtClaveDia.format(new Date(x.instante)); if (!por[k]) { por[k] = { k: k, ini: i, t: [], nub: [], ll: 0, pr: 0, rf: 0 }; orden.push(k); } var d = por[k]; d.t.push(x.temperatura); d.nub.push(x.nubosidad); d.ll += x.lluvia || 0; d.pr = Math.max(d.pr, x.probabilidadLluvia || 0); d.rf = Math.max(d.rf, x.racha || 0); });
    return orden.map(function (k) { return por[k]; }).filter(function (d) { return d.t.length >= 3; });
  }
  function tarjetaPrevision() {
    var c = $("tPrev"), p = TM.prev;
    if (!p || !p.hayPrevision || !p.horas || !p.horas.length) { c.innerHTML = '<h3>Previsión · 72 horas</h3><p class="nota">' + (p ? "Vigía no tiene previsión ahora mismo." : "Sin leer todavía.") + "</p>"; return; }
    var hs = p.horas, n = hs.length, f = p.frescura || {}, dias = resumenDias(), W = 360, Hs = 118, x0g = 24, x1g = 352, yT0 = 10, yT1 = 70;
    var tmin = Math.min.apply(null, hs.map(function (x) { return x.temperatura; })), tmax = Math.max.apply(null, hs.map(function (x) { return x.temperatura; }));
    tmin = Math.floor(tmin - 1); tmax = Math.ceil(tmax + 1);
    var X = function (i) { return x0g + (x1g - x0g) * i / (n - 1); }, Y = function (t) { return yT1 - (yT1 - yT0) * (t - tmin) / (tmax - tmin); };
    var lluviaMax = Math.max(0.5, Math.max.apply(null, hs.map(function (x) { return x.lluvia || 0; })));
    var nubes = "M" + X(0) + "," + yT1 + hs.map(function (x, i) { return "L" + X(i) + "," + (yT1 - (yT1 - yT0) * x.nubosidad / 100 * 0.55); }).join("") + "L" + X(n - 1) + "," + yT1 + "Z";
    var temp = hs.map(function (x, i) { return (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(x.temperatura).toFixed(1); }).join("");
    var bw = (x1g - x0g) / n, barras = hs.map(function (x, i) { var hgt = (x.lluvia || 0) / lluviaMax * 22; return hgt > 0 ? '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (Hs - 20 - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" fill="var(--lidar)"/>' : ""; }).join("");
    var aptas = hs.map(function (x, i) { return '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (Hs - 12) + '" width="' + (bw + 0.3).toFixed(1) + '" height="6" fill="' + (x.dentroDeUmbrales ? "var(--olivo)" : "var(--line)") + '"/>'; }).join("");
    var seps = dias.slice(1).map(function (d) { return '<line x1="' + X(d.ini).toFixed(1) + '" x2="' + X(d.ini).toFixed(1) + '" y1="4" y2="' + (Hs - 4) + '" stroke="var(--line)" stroke-dasharray="3 3"/>'; }).join("");
    var etDias = dias.map(function (d, i) { var a = X(d.ini), b = X(i + 1 < dias.length ? dias[i + 1].ini : n - 1); return '<text x="' + ((a + b) / 2).toFixed(1) + '" y="' + (Hs - 0) + '" text-anchor="middle" fill="var(--muted)" font-size="9.5">' + esc(fmtDia.format(new Date(hs[d.ini].instante))) + "</text>"; }).join("");
    var marca = '<line id="tLinea" x1="0" x2="0" y1="2" y2="' + (Hs - 12) + '" stroke="var(--fg)" stroke-width="1.2"/>';
    var svg = '<svg viewBox="0 0 ' + W + " " + (Hs + 4) + '" role="img" aria-label="Temperatura, nubosidad y lluvia de las próximas 72 horas" class="t-graf">' +
      '<text x="2" y="' + (Y(tmax) + 3) + '" fill="var(--muted)" font-size="9.5">' + tmax + '°</text><text x="2" y="' + (Y(tmin) + 3) + '" fill="var(--muted)" font-size="9.5">' + tmin + '°</text>' +
      '<path d="' + nubes + '" fill="var(--muted)" opacity="0.22"/>' + seps + barras + '<path d="' + temp + '" fill="none" stroke="var(--guardado)" stroke-width="2" stroke-linejoin="round"/>' + aptas + etDias + marca + "</svg>";
    var filas = dias.map(function (d, i) {
      var tn = Math.min.apply(null, d.t), tx = Math.max.apply(null, d.t), nm = d.nub.reduce(function (a, b) { return a + b; }, 0) / d.nub.length;
      var nom = i === 0 ? "Hoy" : i === 1 ? "Mañana" : fmtDia.format(new Date(hs[d.ini].instante));
      return "<tr><th scope=\"row\">" + esc(nom) + "</th><td>" + num1(tn, 0) + " – " + num1(tx, 0) + " °C</td><td>" + num1(nm, 0) + " % nubes</td><td>" + (d.ll > 0 ? num1(d.ll, 1) + " mm (" + d.pr + " %)" : "sin lluvia") + "</td><td>racha " + num1(d.rf, 1) + " m/s</td></tr>";
    }).join("");
    c.innerHTML = '<h3>Previsión · 72 horas <span class="t-pill t-pill-m">modelado</span></h3><p class="t-sub">Una por finca, de una rejilla de ~5 km · ' + hace(f.generadoEn) + '.</p>' + svg +
      '<p class="t-leyenda"><i style="background:var(--guardado)"></i>temperatura <i style="background:var(--muted);opacity:.4"></i>nubosidad <i style="background:var(--lidar)"></i>lluvia <i style="background:var(--olivo)"></i>condiciones dentro de los umbrales del atomizador (referencia de Vigía: no autoriza ningún tratamiento)</p>' +
      lineaHelada(hs) + '<table class="t-tabla"><tbody>' + filas + "</tbody></table>";
    marcaMomento();
  }
  function lineaHelada(hs) {
    var m = hs.reduce(function (a, x) { return x.temperatura < a.temperatura ? x : a; }, hs[0]), ms = Date.parse(m.instante), cuando = fmtDia.format(new Date(ms)) + " " + fmtHora.format(new Date(ms));
    return m.temperatura <= 0 ? '<p class="t-aviso">Helada prevista: mínima de ' + num1(m.temperatura, 1) + " °C el " + esc(cuando) + ".</p>"
      : '<p class="t-sub">Sin heladas previstas: la mínima de las 72 h es ' + num1(m.temperatura, 1) + " °C (" + esc(cuando) + ").</p>";
  }
  function marcaMomento() {
    var l = $("tLinea"), n = TM.prev && TM.prev.horas ? TM.prev.horas.length : 0; if (!l || !n) return;
    var x = 24 + (352 - 24) * TM.idx / (n - 1); l.setAttribute("x1", x); l.setAttribute("x2", x);
  }
  function textoMomento() {
    var h = TM.prev && TM.prev.horas; if (!h) return "";
    if (TM.demo) return DEMOS[TM.demo].etiqueta + " · simulación, no es el tiempo real";
    var ms = Date.parse(h[TM.idx].instante), nombre = fmtDia.format(new Date(ms)) + " · " + fmtHora.format(new Date(ms));
    return TM.modo === "ahora" ? "Ahora · " + fmtDia.format(new Date()) + " · " + fmtHora.format(new Date()) : "Previsión · " + nombre;
  }
  function refrescaTiempo() {
    $("tMomentoV").textContent = textoMomento(); aplicaMundo(); marcaMomento();
    $("tAhora").setAttribute("aria-pressed", String(TM.modo === "ahora" && !TM.demo));
    var h = TM.prev && TM.prev.horas, hh = h && h[TM.idx];
    $("tResumen").textContent = hh ? (TM.demo ? "" : "En el mundo: " + num1(hh.nubosidad, 0) + " % de nubes · viento " + num1(hh.viento, 1) + " m/s del " + rumbo(hh.direccion) + " · " + (hh.lluvia > 0 ? "lluvia " + num1(hh.lluvia, 1) + " mm" : "sin lluvia") + " (previsión)") : "";
  }
  function aplicaDatos() {
    var h = TM.prev && TM.prev.horas, tiene = !!(h && h.length);
    $("tControl").hidden = !tiene; TM.ahoraIdx = Math.max(0, horaActual());
    if (tiene) { $("tMomento").max = h.length - 1; if (TM.modo === "ahora") TM.idx = TM.ahoraIdx; $("tMomento").value = TM.idx; }
    tarjetaEstacion(); tarjetaPrevision(); refrescaTiempo();
  }

  async function leerTiempo() {
    if (!TM.mcp) return;
    $("tLeer").disabled = true; tAviso("Leyendo de Vigía…", "");
    var fallos = [];
    async function una(tool, input) {
      try { return cargaT(await TM.mcp.callTool("Vigia", tool, input || {}, { cache: false })); }
      catch (e) { fallos.push(tool + (e && e.code ? " (" + e.code + ")" : "")); return null; }
    }
    var est = await una("tiempo_en_la_explotacion");              // la primera llamada a un conector pide permiso al visor
    var prev = est || !fallos.length ? await una("prevision_72_horas") : null;
    var hoy = new Date(), ayer = function (n) { return fmtClaveDia.format(new Date(hoy.getTime() - n * 86400000)); };
    var his = prev ? await una("historico_meteo", { desde: ayer(6), hasta: ayer(0) }) : null;
    if (est) TM.est = est; if (prev) TM.prev = prev; if (his) TM.his = his;
    $("tLeer").disabled = false; $("tLeer").textContent = "Volver a leer";
    if (!est && !prev) tAviso("No se ha podido leer el tiempo de Vigía" + (fallos.length ? " (" + fallos.join(", ") + ")" : "") + ". El mundo se queda con cielo despejado.", "error");
    else tAviso("Tiempo leído de Vigía a las " + fmtHora.format(new Date()) + (fallos.length ? " · sin " + fallos.join(", ") : "") + ". Naturaleza: estación medido, previsión modelado.", fallos.length ? "parcial" : "vivo");
    aplicaDatos();
  }
  (function () {
    $("tMomento").addEventListener("input", function () { TM.idx = Number($("tMomento").value); TM.modo = TM.idx === TM.ahoraIdx ? "ahora" : "prevision"; refrescaTiempo(); });
    $("tAhora").addEventListener("click", function () { TM.demo = ""; $("tDemo").value = ""; TM.modo = "ahora"; TM.idx = TM.ahoraIdx; $("tMomento").value = TM.idx; refrescaTiempo(); });
    function salta(horas) { var h = TM.prev && TM.prev.horas; if (!h) return; TM.idx = Math.min(h.length - 1, TM.ahoraIdx + horas); TM.modo = "prevision"; $("tMomento").value = TM.idx; refrescaTiempo(); }
    $("tMas6").addEventListener("click", function () { salta(6); });
    $("tManana").addEventListener("click", function () { // mañana a las 12:00 locales
      var h = TM.prev && TM.prev.horas; if (!h) return; var man = fmtClaveDia.format(new Date(Date.now() + 86400000)), i = -1;
      h.forEach(function (x, k) { if (fmtClaveDia.format(new Date(x.instante)) === man && fmtHora.format(new Date(x.instante)) === "12:00") i = k; }); if (i >= 0) { TM.idx = i; TM.modo = "prevision"; $("tMomento").value = i; refrescaTiempo(); }
    });
    $("tDemo").addEventListener("change", function () { TM.demo = $("tDemo").value; refrescaTiempo(); });
    var reloj = null;
    $("tPlay").addEventListener("click", function () {
      TM.jugando = !TM.jugando; $("tPlay").textContent = TM.jugando ? "Pausa" : "Reproducir"; $("tPlay").setAttribute("aria-pressed", String(TM.jugando)); clearInterval(reloj);
      if (TM.jugando) reloj = setInterval(function () { var h = TM.prev && TM.prev.horas; if (!h) return; TM.idx = (TM.idx + 1) % h.length; TM.modo = "prevision"; $("tMomento").value = TM.idx; refrescaTiempo(); }, 700);
    });
    if (calma) $("tPlay").hidden = true;
    $("tLeer").addEventListener("click", leerTiempo);
    new MutationObserver(pintaFondoTiempo).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintaFondoTiempo);
    pintaFondoTiempo(); tarjetaEstacion(); tarjetaPrevision();
    if (window.__TIEMPO_PRUEBA) { TM.est = window.__TIEMPO_PRUEBA.est; TM.prev = window.__TIEMPO_PRUEBA.prev; TM.his = window.__TIEMPO_PRUEBA.his; aplicaDatos(); tAviso("Datos de prueba (solo en local).", "parcial"); }
    // ¿puede este visor hablar con Vigía? Si sí, se lee solo al abrir (la primera vez pide permiso); si no, el mundo queda despejado.
    try {
      if (window.claude && window.claude.use) window.claude.use("mcp").then(function (m) {
        if (!m) { tAviso("Este visor no puede leer de Vigía: el mundo se queda con cielo despejado.", "parcial"); return; }
        TM.mcp = m; $("tLeer").hidden = false; if (!window.__TIEMPO_PRUEBA) leerTiempo();
      }).catch(function () {});
    } catch (e) {}
  })();
  var lindes = D.parcelas.map(creaBarrera);


