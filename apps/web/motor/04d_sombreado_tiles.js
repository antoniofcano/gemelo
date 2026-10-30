// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: hash, matSuelo, matOrto, UN, SombreadoTiles
// Consume: 01_datos (D, RES, ANCHO, ALTO), 02_mundo (Mundo, suelo, tinte, copas), 02b_cola (Cola), 03_escena (camera), 08_marcadores (aplica),
//   09_camara (suelta), 12_paseo (primera), 13_parcelas (parcelas), 14_historia (hist), 15_tiempo (lluvia, uSombra, parcheTiempo, hace),
//   21_suelo (vn2, cubierta), 24_pantalla (suave)
// ===============================================================================
  // ---------- el sombreado del relieve (F1d, T5; T8 fase 2: la única escena es la 3D Tiles)
  // Cada glb del tileset trae su terreno con un material PBR y la ortofoto como baseColorTexture. Al cargarse (evento load-model de 04b_escena3d.js)
  // ese material se cambia por un Lambert con el parche de aquí, así que el color (ADR-0016: texturas sin convertir, a lineal al entrar en la luz),
  // la hierba según el NDVI, la capa NDVI con su escala relativa, la escarcha, la sombra de nubes, el detalle del suelo abierto (rodadas, caminos),
  // el relieve fino (uBumpK, que la VR apaga) y los modos Ortofoto / NDVI salen de los uniformes compartidos (UN, uSombra). Del glb:
  //   - la posición en el mundo sale de modelMatrix (la exageración vertical la pone la matriz del grupo, no el sombreador) y la sombra de nubes
  //     se calcula con ella;
  //   - la ortofoto es la del propio glb (ya está en la tarjeta gráfica), con sus coordenadas sacadas de la caja de la tesela (el norte arriba de la
  //     imagen, como la escribe tuberia/tiles3d/genera.mjs);
  //   - el color de la tierra, el ruido y el «color ancho» del suelo abierto son los de la tesela del Mundo (256 m) que contiene el glb: salen del
  //     json de siempre (decisión 38), nunca del glb. Un glb mayor que una tesela (512 m, solo de lejos) pinta la tierra con el mosaico de 1 m y
  //     sin detalle.
  // Sin tileset no crea nada (04b no lo llama). Por fotograma: nada; cada 0,2 s, un recorrido de los glb vivos (encender o apagar el detalle).
  function hash(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
  var matSuelo = new THREE.MeshLambertMaterial({}), matOrto = new THREE.MeshBasicMaterial({ color: 0xffffff });   // «maestros»: el ciclo del día les pone el color; el relieve de los glb comparte el de matSuelo
  var UN = {   // uniformes compartidos por todo el relieve (y por quien sigue la exageración: 08, 14, 15...)
    uExag: { value: 1 }, uModoOrto: { value: 0 }, uHierba: { value: 1 }, uNdviOn: { value: 0 }, uNdviMap: { value: null }, uG: { value: null },
    uGBox: { value: new THREE.Vector4(x0, yN, ANCHO, ALTO) }, uOrtoTint: { value: matOrto.color }, uDetK: { value: 1 }, uBumpK: { value: 1 }, uDetDbg: { value: 0 }, uBias2: { value: Math.log(2 / (D.ts / (D.orto_px || 512))) / Math.LN2 }, uMos: { value: null }, uMosBox: { value: new THREE.Vector4(D.mosaico.x0, D.mosaico.yN, D.mosaico.w * D.mosaico.res, D.mosaico.h * D.mosaico.res) }
  };
  var SombreadoTiles = (function () {
    var TS = Mundo.TS, N2 = Mundo.N2, NS2 = Mundo.NS2, SRS = Mundo.SRS, vivos = [], mos = null, tUlt = -1e9, U1 = 800;   // U1: hasta dónde (m) se enciende el detalle del suelo abierto
    var S0 = 0.17, V0 = 0.62;   // suelo desnudo / hierba tupida, en NDVI de suelo (ver el bloque del suelo)

    // ---- texturas de una tesela del Mundo. Mientras sus datos no han llegado el color del suelo sale del mosaico de 1 m y el ruido es uno neutro de 1 píxel
    var RUI0 = null;
    function ruidoNeutro() { if (!RUI0) { var d = new Uint8Array([143, 128, 128, 255]); RUI0 = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); RUI0.needsUpdate = true; } return RUI0; }
    function texturas(t) {
      t.uni = { uTile: { value: new THREE.Vector2(t.ox, t.oy) }, uSue: { value: null }, uRui: { value: ruidoNeutro() }, uGnd: { value: ruidoNeutro() }, uTiene: { value: 0 } };
      if (t.suel) texturasReales(t);
    }
    function texturasReales(t) {   // el color del suelo de la tesela es inmediato; el ruido estático (66.000 evaluaciones) se calcula a rebanadas en la cola
      var u = t.uni, sr = t.suel, n4 = NS2 * NS2, s4 = new Uint8Array(n4 * 4);   // RGBFormat ya no existe (r137): el color del suelo (RGB) se sube como RGBA
      for (var q = 0; q < n4; q++) { s4[q * 4] = sr[q * 3]; s4[q * 4 + 1] = sr[q * 3 + 1]; s4[q * 4 + 2] = sr[q * 3 + 2]; s4[q * 4 + 3] = 255; }
      var ts = new THREE.DataTexture(s4, NS2, NS2, THREE.RGBAFormat, THREE.UnsignedByteType);
      ts.magFilter = ts.minFilter = THREE.LinearFilter; ts.generateMipmaps = false; ts.needsUpdate = true; u.uSue.value = ts; t.texSue = ts; u.uTiene.value = 1;
      Cola.add("R" + t.key, Mundo.dist(t, camera.position.x, camera.position.y, camera.position.z), ruidoG(t), function (tr) { u.uRui.value = tr; t.rui = tr; });
    }
    // ---- el DETALLE DE LA ORTOFOTO en el suelo abierto (rodadas, caminos, calveros). El color del suelo que viaja con la tesela está a 2 m y suavizado (ver el exportador), así que las rodadas de 0,3-0,5 m
    // no existen en él. Aquí se prepara por tesela, una sola vez y a rebanadas, el color «ancho» del suelo ABIERTO (128×128 a 2 m): la ortofoto sin copas ni sombras. Qué es copa o sombra
    // se decide con la propia ortofoto (un píxel mucho más oscuro que el suelo de su entorno), no con el LiDAR: el LiDAR no cubre lo que queda fuera de las parcelas y las copas corridas por la altura no coinciden con la ortofoto.
    // El sombreador compara la ortofoto con esa referencia: lo que la iguala es suelo abierto y se le aplica la diferencia relativa (rodadas, caminos); lo que es mucho más oscuro es copa o sombra y se deja como estaba.
    function* detalleG(t) {
      if (!t.ortImg || !t.ortImg.naturalWidth) return null;
      var px = t.ortPix || Mundo.decodificaOrto(t); yield;
      var W = t.ortW, H = t.ortH, GN = 128, sc = TS / GN, S = new Float32Array(GN * GN * 4), row, col, lum = new Uint8Array(W * H), B = 16, nbx = Math.ceil(W / B), nby = Math.ceil(H / B), hist = new Uint16Array(nbx * nby * 64);
      for (row = 0; row < H; row++) {   // claridad de cada píxel y su histograma por bloque de 16 px (8 m)
        for (col = 0; col < W; col++) { var o0 = (row * W + col) * 4, l = (px[o0] * 77 + px[o0 + 1] * 150 + px[o0 + 2] * 29) >> 8; lum[row * W + col] = l; hist[((row / B | 0) * nbx + (col / B | 0)) * 64 + (l >> 2)]++; }
        if (row % 16 === 15) yield;
      }
      var ref = new Float32Array(nbx * nby), bx, by, k;   // claridad del suelo de cada bloque = su percentil 80 (los árboles son oscuros; el suelo claro domina)
      for (by = 0; by < nby; by++) for (bx = 0; bx < nbx; bx++) {
        var h0 = (by * nbx + bx) * 64, n = 0, acc = 0; for (k = 0; k < 64; k++) n += hist[h0 + k];
        for (k = 0; k < 64; k++) { acc += hist[h0 + k]; if (acc >= 0.8 * n) break; } ref[by * nbx + bx] = k * 4 + 2;
      }
      var osc = new Uint8Array(W * H);   // 1 = copa o sombra: claridad < 0,78 de la del suelo de su entorno (referencia interpolada entre bloques)
      for (row = 0; row < H; row++) {
        var fy = Math.max(0, Math.min(nby - 1.001, (row + 0.5) / B - 0.5)), jy = fy | 0, ty = fy - jy;
        for (col = 0; col < W; col++) {
          var fx = Math.max(0, Math.min(nbx - 1.001, (col + 0.5) / B - 0.5)), jx = fx | 0, tx = fx - jx, r2 = (ref[jy * nbx + jx] * (1 - tx) + ref[jy * nbx + jx + 1] * tx) * (1 - ty) + (ref[(jy + 1) * nbx + jx] * (1 - tx) + ref[(jy + 1) * nbx + jx + 1] * tx) * ty;
          osc[row * W + col] = lum[row * W + col] < 0.78 * r2 ? 1 : 0;
        }
        if (row % 16 === 15) yield;
      }
      var dil = new Uint8Array(W * H), R = 2;   // la penumbra: dilatación de 2 píxeles (1 m), separable
      for (row = 0; row < H; row++) { for (col = 0; col < W; col++) { var m1 = 0; for (var d1 = -R; d1 <= R; d1++) { var c1 = col + d1; if (c1 >= 0 && c1 < W && osc[row * W + c1]) { m1 = 1; break; } } dil[row * W + col] = m1; } if (row % 16 === 15) yield; }
      for (col = 0; col < W; col++) { for (row = 0; row < H; row++) { if (osc[row * W + col]) continue; var m2 = 0; for (var d2 = -R; d2 <= R; d2++) { var r1 = row + d2; if (r1 >= 0 && r1 < H && dil[r1 * W + col]) { m2 = 1; break; } } osc[row * W + col] = dil[row * W + col] | m2; } if (col % 16 === 15) yield; }
      for (row = 0; row < H; row++) {   // suma del color del suelo abierto en celdas de 2 m
        var yy = TS - (row + 0.5) / H * TS, gj = Math.min(GN - 1, Math.floor(yy / sc));
        for (col = 0; col < W; col++) {
          if (osc[row * W + col]) continue;
          var xx = (col + 0.5) / W * TS, gi = Math.min(GN - 1, Math.floor(xx / sc)), o = (row * W + col) * 4, q = (gj * GN + gi) * 4;
          S[q] += px[o]; S[q + 1] += px[o + 1]; S[q + 2] += px[o + 2]; S[q + 3] += 1;
        }
        if (row % 16 === 15) yield;
      }
      function desenfoca(A) { var Bf = new Float32Array(A.length); for (var j = 0; j < GN; j++) for (var i = 0; i < GN; i++) { for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) { var a = i + di, b = j + dj; if (a < 0 || a >= GN || b < 0 || b >= GN) continue; var o = (b * GN + a) * 4, q = (j * GN + i) * 4; Bf[q] += A[o]; Bf[q + 1] += A[o + 1]; Bf[q + 2] += A[o + 2]; Bf[q + 3] += A[o + 3]; } } return Bf; }
      S = desenfoca(S); yield; S = desenfoca(S); yield;
      var out = new Uint8Array(GN * GN * 4), minW = 8.0, pas, i2, j2;   // cada celda de 2 m tiene 16 píxeles (4×4): menos de 8 de suelo abierto tras el desenfoque = olivar cerrado
      for (pas = 0; pas < 8; pas++) {   // donde casi no quedó suelo abierto se rellena con el promedio de los vecinos ya rellenos
        var faltan = 0;
        for (j2 = 0; j2 < GN; j2++) for (i2 = 0; i2 < GN; i2++) {
          var q2 = (j2 * GN + i2) * 4; if (S[q2 + 3] >= minW) continue; faltan++;
          var rr = 0, gg = 0, bb2 = 0, c = 0; for (var dj = -2; dj <= 2; dj++) for (var di = -2; di <= 2; di++) { var a = i2 + di, b3 = j2 + dj; if (a < 0 || a >= GN || b3 < 0 || b3 >= GN) continue; var o2 = (b3 * GN + a) * 4; if (S[o2 + 3] >= minW) { rr += S[o2] / S[o2 + 3]; gg += S[o2 + 1] / S[o2 + 3]; bb2 += S[o2 + 2] / S[o2 + 3]; c++; } }
          if (c) { S[q2] = rr / c * minW; S[q2 + 1] = gg / c * minW; S[q2 + 2] = bb2 / c * minW; S[q2 + 3] = minW; }
        }
        if (!faltan) break;
        yield;
      }
      for (j2 = 0; j2 < GN * GN; j2++) { var w2 = S[j2 * 4 + 3] || 1; out[j2 * 4] = Math.min(255, S[j2 * 4] / w2); out[j2 * 4 + 1] = Math.min(255, S[j2 * 4 + 1] / w2); out[j2 * 4 + 2] = Math.min(255, S[j2 * 4 + 2] / w2); out[j2 * 4 + 3] = 255; }
      var tg = new THREE.DataTexture(out, GN, GN, THREE.RGBAFormat, THREE.UnsignedByteType); tg.magFilter = tg.minFilter = THREE.LinearFilter; tg.generateMipmaps = false; tg.needsUpdate = true;
      return tg;
    }
    function pideDetalle(t) {   // la primera vez que una tesela se ve de cerca: se pide a la cola su color ancho
      if (t.detPedido || !t.suel || !t.ortImg || !t.ortImg.naturalWidth) return; t.detPedido = true;
      Cola.add("D" + t.key, Mundo.dist(t, camera.position.x, camera.position.y, camera.position.z), detalleG(t), function (tg) { if (!tg) { t.detPedido = false; return; } t.texG = tg; t.uni.uGnd.value = tg; t.detListo = true; });
    }
    function* ruidoG(t) {   // cobertura aleatoria, motas y jitter: las mismas funciones que usa cubierta() en la CPU, para que las matas caigan donde el suelo se pinta verde
      var n2 = N2, rd = new Uint8Array(n2 * n2 * 4), o = 0;
      for (var j = 0; j < n2; j++) {
        for (var i = 0; i < n2; i++) {
          var x = t.ox + (i - 0.5) * RES, y = t.oy + (j - 0.5) * RES;
          var r = 0.55 + 0.9 * vn2(x * 0.33, y * 0.33) * 0.6 + 0.45 * vn2(x * 1.7 + 9, y * 1.7), nn = 0.82 + 0.3 * vn2(x * 0.9, y * 0.9);
          rd[o++] = Math.min(255, Math.round(r / 1.6 * 255)); rd[o++] = Math.round((nn - 0.8) / 0.4 * 255); rd[o++] = Math.round(hash(i * 31 + j * 17 + t.kx * 7) * 255); rd[o++] = 255;
        }
        if (j % 10 === 9) yield;
      }
      var tr = new THREE.DataTexture(rd, n2, n2, THREE.RGBAFormat, THREE.UnsignedByteType); tr.magFilter = tr.minFilter = THREE.LinearFilter; tr.generateMipmaps = false; tr.needsUpdate = true; return tr;
    }
    // las texturas de una tesela del Mundo (su detalle se pide con pideDetalle); cuando llegan sus datos, las reales y la cota de su centro
    function prepara(t) {
      if (!t.uni) texturas(t); else if (t.suel && !t.texSue) { texturasReales(t); t.hc = undefined; }
      if (t.hc === undefined) t.hc = suelo((t.v[0] + t.v[2]) / 2, (t.v[1] + t.v[3]) / 2);
      return t.uni;
    }

    // ---- el parche del sombreador (Lambert). La posición en el mundo sale de modelMatrix (la exageración la trae la matriz del grupo: aquí se
    // deshace para muestrear) y la ortofoto, con las coordenadas de la caja del glb (uCua)
    var OP = { cab: "uniform vec4 uCua;\n", uvO: "vec2((vWP.x - uCua.x) / uCua.z, 1.0 - (-vWP.z - uCua.y) / uCua.z)", dg: "3.0 / uCua.z", dy: "vec2(0.0, -dg)" };
    function parche(sh, uni) {
      parcheTiempo(sh, false);   // sombra de nubes y escarcha (bloque del tiempo)
      var u = sh.uniforms; Object.keys(UN).forEach(function (k) { u[k] = UN[k]; }); Object.keys(uni).forEach(function (k) { u[k] = uni[k]; });
      var vs = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uExag; varying vec3 vWP; varying vec3 vVPz;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWP.y /= uExag;").replace("ot_sombra(position.xz)", "ot_sombra(vWP.xz)");
      sh.vertexShader = vs.replace("#include <project_vertex>", "#include <project_vertex>\n vVPz = -mvPosition.xyz;");
      var cab = OP.cab + "uniform vec2 uTile; uniform sampler2D uSue; uniform sampler2D uRui; uniform sampler2D uOrt; uniform sampler2D uGnd; uniform float uDet; uniform float uDetK; uniform float uBumpK; uniform float uDetDbg; uniform float uBias2; uniform float uTiene; uniform sampler2D uMos; uniform vec4 uMosBox; uniform float uModoOrto; uniform float uHierba; uniform sampler2D uG; uniform vec4 uGBox; uniform sampler2D uNdviMap; uniform float uNdviOn; uniform vec3 uOrtoTint; varying vec3 vWP;\n" +
        "float dh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 17391.7); }\nfloat dn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dh(i), dh(i + vec2(1.0, 0.0)), f.x), mix(dh(i + vec2(0.0, 1.0)), dh(i + vec2(1.0, 1.0)), f.x), f.y); }\n" +
        "float hSuelo = 0.0;\n" +
        "vec3 pBump(vec3 vp, vec3 n, vec2 dH){ vec3 s1 = dFdx(vp), s2 = dFdy(vp), r1 = cross(s2, n), r2 = cross(n, s1); float d = dot(s1, r1); vec3 g = sign(d) * (dH.x * r1 + dH.y * r2); return normalize(abs(d) * n - g); }\n";
      var color =
        "vec2 lc = vec2(vWP.x - uTile.x, -vWP.z - uTile.y);\n" +
        "vec3 sc = uTiene > 0.5 ? texture2D(uSue, (lc / " + SRS.toFixed(1) + " + 1.0) / " + NS2.toFixed(1) + ").rgb : texture2D(uMos, vec2((vWP.x - uMosBox.x) / uMosBox.z, 1.0 - (uMosBox.y + vWP.z) / uMosBox.w)).rgb * 0.9;\n" +
        "vec4 ru = texture2D(uRui, (lc + 1.0) / " + N2.toFixed(1) + ");\n" +
        // detalle de la ortofoto: cociente de claridad entre la ortofoto «nítida» y dos referencias (ella misma a ~2 m y el color ancho del suelo abierto, sin copas), solo donde el suelo está abierto
        "float abierto = 0.0, rodada = 1.0, tono = 1.0, desnudo = 0.0, camino = 0.0, coh = 0.0; vec2 dirT = vec2(1.0, 0.0);\n" +
        "float dc = length(vViewPosition), cerca = 1.0 - smoothstep(12.0, 60.0, dc), cercaM = 1.0 - smoothstep(3.0, 18.0, dc), cercaR = 1.0 - smoothstep(30.0, 110.0, dc);\n" +
        "if (uDet > 0.5) { vec2 uvO = " + OP.uvO + "; vec3 o0 = texture2D(uOrt, uvO).rgb, o2 = texture2D(uOrt, uvO, uBias2).rgb, o4 = texture2D(uOrt, uvO, uBias2 + 1.0).rgb, gw = texture2D(uGnd, uvO).rgb; vec3 LM = vec3(0.299, 0.587, 0.114); sc = mix(sc, gw, 0.85);\n" +
        "  float l0 = dot(o0, LM) + 0.03, l2 = dot(o2, LM) + 0.03, l4 = dot(o4, LM) + 0.03, lw = dot(gw, LM) + 0.03; abierto = min(min(smoothstep(0.72, 0.86, l0 / lw), smoothstep(0.80, 0.93, l2 / lw)), smoothstep(0.86, 0.97, l4 / lw)) * uDetK;\n" +
        "  rodada = clamp(l0 / l2, 0.7, 1.5); tono = clamp(l2 / lw, 0.8, 1.8); desnudo = smoothstep(1.05, 1.3, tono) * abierto;\n" +
        // camino: suelo desnudo claro; su dirección sale del gradiente de claridad a ~4 m (4 muestras), solo donde hace falta
        "  camino = smoothstep(1.04, 1.22, tono) * abierto;\n" +
        "  if (camino > 0.02 && cercaR > 0.01) { float dg = " + OP.dg + "; float lx1 = dot(texture2D(uOrt, uvO + vec2(dg, 0.0), uBias2 + 1.0).rgb, LM), lx0 = dot(texture2D(uOrt, uvO - vec2(dg, 0.0), uBias2 + 1.0).rgb, LM), ly1 = dot(texture2D(uOrt, uvO + " + OP.dy + ", uBias2 + 1.0).rgb, LM), ly0 = dot(texture2D(uOrt, uvO - " + OP.dy + ", uBias2 + 1.0).rgb, LM); vec2 gg = vec2(lx1 - lx0, ly1 - ly0); float gl = length(gg); coh = smoothstep(0.004, 0.03, gl); dirT = gl > 1e-4 ? vec2(-gg.y, gg.x) / gl : vec2(1.0, 0.0); } }\n" +
        "float g = texture2D(uG, vec2((vWP.x - uGBox.x) / uGBox.z, (uGBox.y + vWP.z) / uGBox.w)).r * 1.3 - 0.3;\n" +
        "float cov = clamp(clamp((g - " + S0 + ") / " + (V0 - S0).toFixed(2) + ", 0.0, 1.0) * ru.r * 1.6, 0.0, 1.0), vig = clamp((g - 0.30) / 0.30, 0.0, 1.0), nn = 0.8 + ru.g * 0.4, m = cov * 0.78 * uHierba * (1.0 - 0.9 * desnudo);\n" +
        "vec3 gr = vec3(0.66 - 0.36 * vig, 0.58 - 0.10 * vig, 0.34 - 0.17 * vig) * nn * (0.82 + 0.36 * dn(vec2(vWP.x * 14.0, vWP.z * 3.0) + vec2(dn(vWP.xz * 0.5) * 3.0, 0.0)) * (0.5 + 0.5 * cerca)) * (1.0 + 0.22 * (dn(vWP.xz * 0.6 + 4.0) - 0.5) * (1.0 - vig));\n" +
        "vec3 suelo = sc * (0.94 + ru.b * 0.1) * (1.0 - m) + gr * m;\n" +
        "float nM = dn(vWP.xz * 0.045), nm = dn(vWP.xz * 0.19 + 3.1), nf = dn(vWP.xz * 0.9 + 9.7), nu = dn(vWP.xz * 3.7 + 1.3), nuu = dn(vWP.xz * 13.0 + 5.9);\n" +
        // el detalle de la ortofoto: la rodada se refuerza en los caminos (la ortofoto la trae suave: está en el límite de resolución de 0,5 m)
        "suelo *= mix(1.0, clamp(pow(rodada, 1.15 + 2.4 * camino) * pow(tono, 0.9), 0.45, 1.9), abierto);\n" +
        // surcos de rodada sintéticos, orientados con el camino, con una fase que serpentea y se rompe (1,5 m entre surcos)
        "float aa = dot(lc, dirT), cc = dot(lc, vec2(-dirT.y, dirT.x)), ph = cc * 4.19 + 2.5 * dn(vec2(aa * 0.07, 1.7)) + 1.2 * dn(vec2(aa * 0.31, 8.1));\n" +
        "float gro = smoothstep(0.30, 0.92, cos(ph)) * (0.40 + 0.60 * dn(vec2(aa * 0.22, cc * 0.5))), ruts = gro * camino * coh * cercaR;\n" +
        "float estr = (dn(vec2(aa * 0.5, cc * 7.0)) - 0.5) * camino * cerca;\n" +
        "suelo *= (1.0 - 0.5 * ruts) * (1.0 + 0.55 * estr);\n" +
        // material de tierra: tinte cálido/frío a gran escala y luminancia en 4 octavas (la última solo cerca, para que no centellee a lo lejos)
        "suelo *= vec3(1.0 + 0.10 * (nM - 0.5) + 0.05 * (nm - 0.5), 1.0 + 0.03 * (nM - 0.5), 1.0 - 0.10 * (nM - 0.5) - 0.05 * (nm - 0.5)) * (0.86 + 0.28 * (nm * 0.5 + nf * 0.3 + nu * 0.2 * cerca + nuu * 0.1 * cercaM));\n" +
        // gravilla: granos claros y oscuros de ~10 cm en el suelo desnudo y los caminos, solo cerca
        "float grano = step(0.82, dh(floor(vWP.xz * 9.0))) * (dh(floor(vWP.xz * 9.0) + 3.3) - 0.35);\n" +
        "suelo *= 1.0 + grano * 0.55 * clamp(desnudo + camino + (1.0 - m) * 0.3, 0.0, 1.0) * cercaM;\n" +
        // hojarasca y suelo sombreado bajo los olivos (donde la ortofoto es copa o sombra)
        "float lit = (1.0 - abierto) * uDetK * step(0.5, uDet);\n" +
        "suelo = mix(suelo, vec3(0.30, 0.25, 0.18) * (0.72 + 0.55 * dn(vWP.xz * 5.0)) * (0.82 + 0.36 * nm), lit * 0.5 * (0.5 + 0.5 * cerca));\n" +
        "hSuelo = -0.055 * ruts + 0.014 * (nf - 0.5) * cerca + 0.007 * (nu - 0.5) * cercaM + 0.004 * grano * cercaM + 0.03 * (rodada - 1.0) * camino * cercaR;\n" +
        "diffuseColor.rgb *= sRGBTransferEOTF(vec4(max(suelo, vec3(0.0)), 1.0)).rgb;\n";   // todo lo de arriba son colores «como se ven» (las texturas van sin convertir): a lineal al entrar en la luz
      var fin =
        "vec2 un = vec2((vWP.x - uGBox.x) / uGBox.z, 1.0 - (uGBox.y + vWP.z) / uGBox.w);\n" +
        "vec4 nd = texture2D(uNdviMap, un); float dentro = step(0.0, un.x) * step(un.x, 1.0) * step(0.0, un.y) * step(un.y, 1.0);\n" +
        "gl_FragColor.rgb = mix(gl_FragColor.rgb, nd.rgb, 0.8 * nd.a * uNdviOn * dentro);\n" +
        "if (uDetDbg > 0.5) gl_FragColor.rgb = uDetDbg < 1.5 ? vec3(abierto) : uDetDbg < 2.5 ? vec3(clamp(tono - 0.5, 0.0, 1.0)) : uDetDbg < 3.5 ? vec3(clamp(rodada - 0.5, 0.0, 1.0)) : vec3(ruts, camino, coh);\n";
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying vec3 vVPz;\n#define vViewPosition vVPz\n" + cab + "void main() {")
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + color)
        .replace("gl_FragColor.rgb *= vSomb;", "if (uModoOrto > 0.5) gl_FragColor.rgb = texture2D(uOrt, " + OP.uvO + ").rgb * sRGBTransferOETF(vec4(uOrtoTint, 1.0)).rgb;\n float dd = dn(vWP.xz * 0.9) * 0.45 + dn(vWP.xz * 3.3) * 0.3 + dn(vWP.xz * 12.0) * 0.25;\n gl_FragColor.rgb *= (1.0 - (1.0 - (0.82 + 0.36 * dd)) * (1.0 - 0.6 * abierto)) * vSomb;")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n normal = pBump(-vViewPosition, normal, vec2(dFdx(hSuelo), dFdy(hSuelo)) * uBumpK * (1.0 - smoothstep(25.0, 90.0, length(vViewPosition))));")
        .replace("#include <dithering_fragment>", fin + "#include <dithering_fragment>");
    }

    function mosaico() {   // la textura del mosaico de 1 m (lo que aún no tiene datos): sin ella se vería negro
      if (UN.uMos.value || !Mundo.mosaico.img) return;
      mos = new THREE.Texture(Mundo.mosaico.img); mos.anisotropy = 4; mos.needsUpdate = true; UN.uMos.value = mos;
    }
    function material(u) {
      var m = new THREE.MeshLambertMaterial({}); m.color = matSuelo.color;   // el color (lluvia, luz) es uno solo para todo el relieve
      m.onBeforeCompile = function (sh) { parche(sh, u); };
      m.customProgramCacheKey = function () { return "terreno-3dtiles"; };   // un solo programa para todos los glb
      return m;
    }
    // un modelo recién cargado: su malla de terreno (la que lleva ortofoto; los olivos instanciados no se tocan) pasa a este sombreado
    function modelo(raiz, tile) {
      var b = tile && tile.boundingVolume && tile.boundingVolume.box; if (!b || !raiz) return;   // sin caja no se sabe dónde cae: se queda con su material
      var L = 2 * b[3], x0 = b[0] - b[3], y0 = b[1] - b[7], mt = L <= TS + 1e-6 ? Mundo.tesela(b[0], b[1]) : null;
      mosaico();
      raiz.traverse(function (o) {
        if (!o.isMesh || o.isInstancedMesh || !o.material || !o.material.map) return;
        var map = o.material.map, w = (map.image && map.image.width) || 256, uni = mt ? prepara(mt) : null;
        map.colorSpace = THREE.NoColorSpace; map.anisotropy = 4; map.needsUpdate = true;   // los valores tal cual (ADR-0016), el sombreador los pasa a lineal
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
    // cada 0,2 s: las texturas de la tesela del Mundo cuando llegan sus datos y el detalle del suelo abierto según la distancia (con histéresis del 50 %)
    function actualiza() {
      var ahora = performance.now(); if (ahora - tUlt < 200 || !vivos.length) return; tUlt = ahora;
      mosaico();
      var p = camera.position, dist = {};
      vivos.forEach(function (v) {
        var t = v.mt; if (!t) return;
        if (!(t.key in dist)) { prepara(t); dist[t.key] = Mundo.dist(t, p.x, p.y, p.z); if (dist[t.key] < U1) pideDetalle(t); }
        var d = dist[t.key]; v.u.uDet.value = t.detListo && (d < U1 || (v.u.uDet.value && d < U1 * 1.5)) ? 1 : 0;
      });
    }
    function libera() {   // si la escena 3D Tiles se apaga o falla
      vivos.forEach(function (v) { v.m.dispose(); }); vivos = [];
      if (mos) { if (UN.uMos.value === mos) UN.uMos.value = null; mos.dispose(); mos = null; }
    }
    function resumen() { return { glb: vivos.length, conTesela: vivos.filter(function (v) { return v.mt; }).length, conDetalle: vivos.filter(function (v) { return v.u.uDet.value; }).length }; }
    return { modelo: modelo, suelta: suelta, actualiza: actualiza, libera: libera, resumen: resumen, OP: OP };
  })();
