// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: SueloFotosPuro, SueloFotos
// Consume: 01a_aparato (Aparato), 02_mundo (Mundo, suelo, copas), 02b_cola (Cola)
// ===============================================================================
  // ---------- EV-1s: el suelo de cerca con texturas de fotos de la finca (?suelo=fotos; APAGADO por defecto y, en VR, apagado salvo ?sueloVR=1)
  // Siete clases de textura repetible (tuberia/suelo/construye.mjs; apps/web/public/suelo/, con su LICENCIA.md) en UNA textura en array (DataArrayTexture:
  // un solo muestreador más en el sombreado del relieve): calle con picado, hojarasca seca, tierra con grava, compost, ruedo, camino y piedra. Donde
  // hay varias fotos de una clase, 2-3 variantes (13 niveles en total): la repetición estocástica escoge variante por celda, sin lecturas de más.
  // Naturaleza (regla 5): el COLOR sigue saliendo de la ortofoto (medido); la textura solo lo MODULA alrededor de 1 (byte/127,5) y es ILUSTRATIVA;
  // la CLASE de cada punto es DEDUCIDA con reglas simples, porque no hay un mapa medido de dónde hay calle, hojarasca o compost:
  //   - ruedo: dentro del radio de la copa (radio medio de los 8 medidos × 1,15 + 0,5 m [SUPUESTO]), por un campo de distancias por tesela (uRue);
  //   - hojarasca densa: un anillo en el borde de esa copa y manchas dentro del ruedo;
  //   - camino: el «camino» que ya deduce 04d de la ortofoto (suelo desnudo claro y alargado);
  //   - tierra con grava: el suelo desnudo de la ortofoto que no es camino;
  //   - compost: suelo abierto más OSCURO que su entorno en la ortofoto (no se sabe dónde se aporta: es la regla más débil, dicha);
  //   - calle: el resto; piedras sueltas: calcomanías por celdas de 0,9 m, más en la tierra, el ruedo y el camino.
  // Repetición estocástica (técnica 3 de Quilez, «texture variation», con el índice sacado de un ruido procedimental en vez de otra textura) y
  // mezcla que conserva la varianza; cada lectura toma la variante de su celda; fundido por distancia de 12 a 40 m (más allá, ni una lectura: lo de siempre). Presupuesto: SueloFotosPuro.presupuesto().
  // Sin la bandera este módulo no carga nada, no crea texturas y 04d no cambia ni una letra de su sombreador.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/suelo_fotos.test.js)
  var SueloFotosPuro = (function () {
    var CLASES = ["calle", "hojarasca", "tierra_grava", "compost", "ruedo", "camino", "piedra"];   // el orden ES el de los niveles del array (y el de tuberia/suelo/recetas.json)
    var METROS = [1.4, 1.3, 0.9, 0.85, 0.6, 0.5, 0.35];   // lado en el suelo de cada textura [SUPUESTO: las fotos no llevan referencia de escala]
    var VARIANTES = [2, 3, 1, 1, 1, 2, 3];   // fotos por clase (la principal y sus variantes de tuberia/suelo/recetas.json): niveles seguidos en el array
    var BASE = [], CAPAS = 0; for (var c0 = 0; c0 < CLASES.length; c0++) { BASE.push(CAPAS); CAPAS += VARIANTES[c0]; }
    // 768 px en escritorio y 384 en móvil y gafas (no 1024 y 512): con las variantes, 13 niveles en casi la memoria de los 7 de antes (presupuesto())
    var PX = [768, 384];
    var FUNDIDO = [12, 40], RUE_M = 6, RUE_GN = 128;   // fundido (m); el campo del ruedo guarda la distancia al borde de la copa en ±6 m, a 2 m por celda
    // ajuste: el guardado de Configuración → Vista («vista.suelo», true/false) o undefined; la URL manda (?suelo=fotos enciende, ?suelo=0 apaga)
    function decide(busqueda, clase, ajuste) {
      var q = busqueda || "", mp = /[?&]sueloPx=(384|768)(?![^&#])/.exec(q);
      var url = /[?&]suelo=fotos(?![^&#])/.test(q) ? true : /[?&]suelo=(0|no)(?![^&#])/.test(q) ? false : undefined;
      return { activo: url !== undefined ? url : ajuste === true, px: mp ? Number(mp[1]) : clase === "escritorio" ? PX[0] : PX[1], vr: /[?&]sueloVR=1(?![^&#])/.test(q) };
    }
    // un elemento por lámina del array, en su orden: las variantes de cada clase, seguidas (la 0, la principal, <clase>_<px>; las demás, <clase>_v<k>_<px>)
    function ficheros(px) {
      var o = []; for (var i = 0; i < CLASES.length; i++) for (var k = 0; k < VARIANTES[i]; k++) {
        var n = "suelo/" + CLASES[i] + (k ? "_v" + k : "") + "_" + px; o.push({ clase: CLASES[i], variante: k, capa: BASE[i] + k, color: n + ".webp", relieve: n + "_relieve.webp" });
      }
      return o;
    }
    // memoria en la tarjeta gráfica: RGBA8 × niveles, con mipmaps (×4/3); la copia pasajera de la CPU (sin mipmaps); y el campo del ruedo: 1 byte por celda y tesela
    function presupuesto(px) {
      var bytesTex = px * px * 4 * CAPAS * 4 / 3;
      return { niveles: CAPAS, texturaBytes: bytesTex, texturaMB: Math.round(bytesTex / 1048576 * 10) / 10, cpuMB: Math.round(px * px * 4 * CAPAS / 1048576 * 10) / 10,
        ruedoBytesPorTesela: RUE_GN * RUE_GN, muestreadores: 2, llamadas: 0, triangulos: 0,
        // lecturas de textura por píxel del suelo: 1 del campo del ruedo + 2 por clase (repetición estocástica) × las 2 clases que más pesan + 1 si cae en una piedra
        // (las variantes no añaden ninguna: cada lectura va a la lámina de la variante de su celda)
        muestreos: { lejos: 0, tipico: 3, maximo: 6 } };
    }
    // el campo del ruedo de una tesela (pura): GN×GN bytes, fila 0 al sur; valor = (distancia al borde de la copa + 6 m) / 12 m · 255 (255 = lejos)
    function campoRuedo(cps, ox, oy, TS, GN) {
      var out = new Uint8Array(GN * GN).fill(255), sc = TS / GN, k, i, j;
      for (k = 0; k < cps.length; k++) {
        var c = cps[k]; if (!c.oliv) continue;
        var rm = 0; for (var q = 0; q < 8; q++) rm += c.perfil[q]; rm /= 8;
        var R = rm * 1.15 + 0.5, A = R + RUE_M; if (c.x < ox - A || c.x > ox + TS + A || c.y < oy - A || c.y > oy + TS + A) continue;
        var i0 = Math.max(0, Math.floor((c.x - ox - A) / sc)), i1 = Math.min(GN - 1, Math.floor((c.x - ox + A) / sc)), j0 = Math.max(0, Math.floor((c.y - oy - A) / sc)), j1 = Math.min(GN - 1, Math.floor((c.y - oy + A) / sc));
        for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) {
          var dx = ox + (i + 0.5) * sc - c.x, dy = oy + (j + 0.5) * sc - c.y, d = Math.sqrt(dx * dx + dy * dy) - R;
          var v = Math.max(0, Math.min(255, Math.round((d + RUE_M) / (2 * RUE_M) * 255))); if (v < out[j * GN + i]) out[j * GN + i] = v;
        }
      }
      return out;
    }
    function f1(v) { var s = String(v); return s.indexOf(".") < 0 ? s + ".0" : s; }
    // el GLSL que se añade al sombreado del relieve de 04d (solo con la bandera). cab: cabecera; pre: antes de la gravilla; color: antes de pasar a lineal
    function glsl(TS) {
      var cab = "uniform highp sampler2DArray uFot; uniform float uFotK; uniform sampler2D uRue;\n" +
        "const float FOT_M[" + CLASES.length + "] = float[" + CLASES.length + "](" + METROS.map(f1).join(", ") + ");\n" +
        "const float FOT_B[" + CLASES.length + "] = float[" + CLASES.length + "](" + BASE.map(f1).join(", ") + ");\n" +   // lámina inicial de cada clase
        "const float FOT_N[" + CLASES.length + "] = float[" + CLASES.length + "](" + VARIANTES.map(f1).join(", ") + ");\n" +   // y cuántas variantes tiene
        "float fotNiv(int c, float i){ return FOT_B[c] + mod(i, FOT_N[c]); }\n" +   // la lámina de la variante de la celda i (entera, ≥ 0): se turnan, ninguna sobra
        // repetición estocástica: dos lecturas con desplazamientos que cambian a saltos según un ruido; el salto cae donde la mezcla ya pasó del todo
        // a la otra lectura, así que no se ve; las derivadas se dan a mano (textureGrad) para que el desplazamiento no rompa los mipmaps. Cada celda
        // del ruido (i) escoge también la variante (otra foto de la clase; la de i y la de i + 1, siempre distintas), que salta donde salta el desplazamiento
        "vec4 fotVar(float capa, vec2 p, vec2 gx, vec2 gy){ float k = dn(p * 0.37 + capa * 3.7) * 6.0, i = floor(k), f = fract(k); int c = int(capa + 0.5);\n" +
        "  vec2 oa = fract(sin(vec2(3.1, 7.7) * (i + capa)) * 43.7), ob = fract(sin(vec2(3.1, 7.7) * (i + 1.0 + capa)) * 43.7);\n" +
        "  float na = fotNiv(c, i), nb = fotNiv(c, i + 1.0);\n" +
        "  vec4 a = textureGrad(uFot, vec3(p + oa, na), gx, gy), b = textureGrad(uFot, vec3(p + ob, nb), gx, gy); float t = smoothstep(0.2, 0.8, f);\n" +
        "  return 0.5 + (mix(a, b, t) - 0.5) / sqrt(t * t + (1.0 - t) * (1.0 - t)); }\n" +
        "vec4 fotCapa(float capa, vec2 pw, vec2 dx, vec2 dy){ float m = FOT_M[int(capa + 0.5)]; return fotVar(capa, pw / m, dx / m, dy / m); }\n";
      var pre = "float fotA = uFotK * (1.0 - smoothstep(" + f1(FUNDIDO[0]) + ", " + f1(FUNDIDO[1]) + ", dc)); vec2 fdx = dFdx(vWP.xz) * vec2(1.0, -1.0), fdy = dFdy(vWP.xz) * vec2(1.0, -1.0);\n";
      var color =
        "if (fotA > 0.003) { vec2 pw = vec2(vWP.x, -vWP.z);\n" +
        "  float dR = texture2D(uRue, lc / " + f1(TS) + ").r * " + f1(2 * RUE_M) + " - " + f1(RUE_M) + ", fnA = dn(pw * 0.55 + 1.7), fnB = dn(pw * 1.9 + 5.3);\n" +
        // los pesos de clase (DEDUCIDOS; ver la cabecera del módulo)
        "  float wRue = 1.0 - smoothstep(-0.8, 0.4, dR + 1.6 * (fnA - 0.5));\n" +
        "  float wHoj = clamp(1.0 - smoothstep(0.4, 1.6, abs(dR + 0.5 + 1.2 * (fnB - 0.5))) + wRue * 0.7 * smoothstep(0.55, 0.8, fnB), 0.0, 1.0) * (0.35 + 0.65 * (1.0 - camino));\n" +
        "  float fuera = 1.0 - max(wRue, wHoj), wCam = camino * fuera, wCom = abierto * (1.0 - smoothstep(0.86, 0.98, tono)) * (1.0 - camino) * fuera, wTie = desnudo * (1.0 - camino) * fuera;\n" +
        "  float w[6]; w[0] = max(0.0, fuera - wCam - wCom - wTie) + 0.03; w[1] = wHoj; w[2] = wTie; w[3] = wCom; w[4] = wRue * (1.0 - wHoj); w[5] = wCam;\n" +
        // solo las dos clases que más pesan (tope de lecturas), mezcladas conservando la varianza
        "  float b1 = -1.0, b2 = -1.0, c1 = 0.0, c2 = 0.0; for (int q = 0; q < 6; q++) { float v = w[q]; if (v > b1) { b2 = b1; c2 = c1; b1 = v; c1 = float(q); } else if (v > b2) { b2 = v; c2 = float(q); } }\n" +
        "  vec4 tx = fotCapa(c1, pw, fdx, fdy); float t2 = b2 / max(b1 + b2, 1e-4);\n" +
        "  if (t2 > 0.03) { tx = 0.5 + (mix(tx, fotCapa(c2, pw, fdx, fdy), t2) - 0.5) / sqrt(t2 * t2 + (1.0 - t2) * (1.0 - t2)); }\n" +
        "  suelo *= mix(vec3(1.0), tx.rgb * 2.0, fotA); hSuelo += fotA * 0.012 * (tx.a - 0.5);\n" +
        // piedras sueltas (calcomanías de caliza, ilustrativas): una por celda de 0,9 m con cierta probabilidad, elipse girada con el borde roto
        "  vec2 ce = floor(pw / 0.9), fr = pw - ce * 0.9; float pr = 0.03 + 0.12 * (wTie + wCam + w[4]);\n" +
        "  if (dh(ce + 17.3) < pr) { vec2 c0 = (vec2(dh(ce + 3.1), dh(ce + 8.9)) * 0.5 + 0.25) * 0.9; float rr = 0.06 + 0.18 * dh(ce + 5.5), an = dh(ce + 1.1) * 6.2832; vec2 dd = fr - c0; dd = vec2(cos(an) * dd.x - sin(an) * dd.y, sin(an) * dd.x + cos(an) * dd.y); dd.y *= 1.6;\n" +
        "    float esP = 1.0 - smoothstep(0.8, 1.0, length(dd) / rr + 0.35 * (dn(pw * 9.0) - 0.5));\n" +
        "    if (esP > 0.0) { vec4 tp = textureGrad(uFot, vec3(pw / FOT_M[6] + ce * 0.37, fotNiv(6, floor(dh(ce + 2.9) * 6.0))), fdx / FOT_M[6], fdy / FOT_M[6]); suelo = mix(suelo, mix(suelo, vec3(0.70, 0.66, 0.60), 0.55) * tp.rgb * 2.0, esP * fotA); hSuelo += fotA * esP * (0.02 + 0.015 * (tp.a - 0.5)); } }\n" +
        "}\n";
      return { cab: cab, pre: pre, color: color };
    }
    // pone el GLSL a las cadenas de 04d; si un ancla falta (alguien cambió 04d), falla en vez de quedarse a medias
    var ANCLAS = { pre: "float grano =", grano: "(1.0 - m) * 0.3, 0.0, 1.0) * cercaM;", color: "diffuseColor.rgb *= sRGBTransferEOTF(" };
    function parcheGlsl(cab, color, TS) {
      var g = glsl(TS);
      Object.keys(ANCLAS).forEach(function (k) { if (color.split(ANCLAS[k]).length !== 2) throw new Error("04f_suelo_fotos: el ancla «" + ANCLAS[k] + "» no está una vez en el sombreado de 04d"); });
      return { cab: cab + g.cab, color: color.replace(ANCLAS.pre, g.pre + ANCLAS.pre).replace(ANCLAS.grano, "(1.0 - m) * 0.3, 0.0, 1.0) * cercaM * (1.0 - fotA);").replace(ANCLAS.color, g.color + ANCLAS.color) };
    }
    return { CLASES: CLASES, METROS: METROS, VARIANTES: VARIANTES, BASE: BASE, CAPAS: CAPAS, PX: PX, FUNDIDO: FUNDIDO, RUE_GN: RUE_GN, decide: decide, ficheros: ficheros, presupuesto: presupuesto, campoRuedo: campoRuedo, glsl: glsl, parcheGlsl: parcheGlsl };
  })();
  // [puro:fin]
  var SueloFotos = (function () {
    var P = SueloFotosPuro, cfg = P.decide(typeof location !== "undefined" ? location.search : "", Aparato.clase(), (function () { try { var s = window.localStorage.getItem("gemelo.ajustes.vista.suelo"); return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } })()), U = { uFot: { value: null }, uFotK: { value: 0 } };
    var tex = null, hecho = false, neutro = null, campos = [];
    function rueNeutro() {   // sin tesela del Mundo (o antes de calcular su campo): lejos de toda copa
      if (!neutro) { neutro = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType); neutro.needsUpdate = true; }
      return neutro;
    }
    function campo(t) {   // el campo del ruedo de una tesela del Mundo (una vez; 1 byte por celda de 2 m)
      var GN = P.RUE_GN, d = P.campoRuedo(copas, t.ox, t.oy, Mundo.TS, GN), tx = new THREE.DataTexture(d, GN, GN, THREE.RedFormat, THREE.UnsignedByteType);
      tx.magFilter = tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false; tx.needsUpdate = true; campos.push(tx); return tx;
    }
    // las 13 parejas color + relieve (una por lámina): se piden todas (mismo origen) y, cuando han llegado, se decodifican a píxeles y se juntan en una
    // textura en array en la cola, media lámina por rebanada y con la prioridad más baja (después de las teselas)
    function img(src) { return new Promise(function (ok, mal) { var im = new Image(); im.decoding = "async"; im.onload = function () { ok(im); }; im.onerror = function () { mal(new Error("no se pudo leer " + src)); }; im.src = src; }); }
    function* juntaG(L, ims) {
      var px = cfg.px, datos = new Uint8Array(px * px * 4 * L.length), cv = document.createElement("canvas"); cv.width = cv.height = px;
      var cx = cv.getContext("2d", { willReadFrequently: true });
      for (var k = 0; k < L.length; k++) {
        cx.clearRect(0, 0, px, px); cx.drawImage(ims[2 * k], 0, 0, px, px); var a = cx.getImageData(0, 0, px, px).data; yield;
        cx.clearRect(0, 0, px, px); cx.drawImage(ims[2 * k + 1], 0, 0, px, px); var b = cx.getImageData(0, 0, px, px).data, o = k * px * px * 4;
        for (var i = 0, n = px * px; i < n; i++) { datos[o + i * 4] = a[i * 4]; datos[o + i * 4 + 1] = a[i * 4 + 1]; datos[o + i * 4 + 2] = a[i * 4 + 2]; datos[o + i * 4 + 3] = b[i * 4]; }
        yield;
      }
      var t = new THREE.DataArrayTexture(datos, px, px, L.length);   // valores tal cual (factores, no colores): sin espacio de color
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
      t.onUpdate = function () { t.image.data = null; };   // ya en la tarjeta gráfica: fuera la copia de la CPU (29,3 MB a 768, 7,3 MB a 384: presupuesto().cpuMB)
      return t;
    }
    var pedido = false;
    function carga() {
      if (!cfg.activo || pedido) return; pedido = true;
      var L = P.ficheros(cfg.px), srcs = []; L.forEach(function (f) { srcs.push(f.color, f.relieve); });
      Promise.all(srcs.map(img)).then(function (ims) {
        Cola.add("SF", 1e9, juntaG(L, ims), function (t) { tex = t; U.uFot.value = t; hecho = true; });
      }, function (e) { console.warn("suelo=fotos: " + e.message + "; el suelo sigue como siempre"); });
    }
    // cada 0,2 s (desde 04d): encendido si ya cargó y, en VR, solo con ?sueloVR=1 (hasta medir en el Quest)
    function actualiza() { if (!cfg.activo) return; carga(); U.uFotK.value = hecho && (cfg.vr || !Aparato.vr()) ? 1 : 0; }
    function libera() {
      if (tex) { tex.dispose(); tex = null; U.uFot.value = null; } hecho = false; pedido = false; U.uFotK.value = 0;
      campos.forEach(function (t) { t.dispose(); }); campos = []; if (neutro) { neutro.dispose(); neutro = null; }
    }
    function resumen() { var b = P.presupuesto(cfg.px); return { activo: cfg.activo, px: cfg.px, vr: cfg.vr, hecho: hecho, encendido: U.uFotK.value > 0, texturaMB: b.texturaMB, campos: campos.length }; }
    return { activo: cfg.activo, U: U, rueNeutro: rueNeutro, campo: campo, actualiza: actualiza, libera: libera, resumen: resumen };
  })();
