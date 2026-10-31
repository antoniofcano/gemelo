// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: TiempoPuro, ahoraMs, TM, calma, texBrillo, lluvia, uViento, uSombra, GLSL_SOMBRA, parcheTiempo, cur, meta, tMundo, ins, nivel,
//   actualizaTiempo, temaBarrera, colocaBarrera, pintaFondoTiempo, fmtHora, fmtClaveDia, num1, rumbo, esc, hace, objetivoMundoBase, aplicaMundo,
//   anuncia, TiempoVivo, lindes
// Consume: 01_datos (D, $, FOG0, FOG1), 02_mundo (suelo, copas), 02c_componentes (Bus, Pausa),
//   03_escena (visor, scene, camera, SRGB, LUZ_SOL, LUZ_CIELO, hemi, sol, texColor, colorVertSRGB, colorCss, exag, modo),
//   04d_sombreado_tiles (hash, matSuelo, matOrto), 05_nube (nube), 07_follaje (matHojaG, matHojaP, matCorteza), 08_marcadores (gLinde),
//   09_camara (objetivo), 13b_hazas (HazasPuro), 14_historia (marca, tabla, aviso), 16_vida (mira, quad, temaEstela, dron),
//   23_estacion (objetivoMundo), 24_pantalla (suave)
// Nota: Lee /api/tiempo (mismo origen) solo con D.base /teselas/… o ?api=; si no, el conector de claude.ai; si no, el tiempo simulado, dicho. Expone TiempoVivo (contratos/interfaces.json). El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/tiempo_motor.test.js.
// ===============================================================================
  // ---------- el tiempo: el mundo del gemelo simula el que publica Vigía
  // Qué entra y de dónde: la estación (medido) pone la temperatura y la humedad de «ahora»; la previsión (modelado, rejilla de ~5 km)
  // pone las nubes, el viento y la lluvia, porque el anemómetro de la estación está en duda para Vigía. El sol sale de la fecha y la hora.
  // Lo que se dibuja (nubes, lluvia, viento en la hierba y las copas) es ilustrativo: se pinta a partir de esos datos.
  // De dónde se lee (contratos/tiempo.md): 1) GET /api/tiempo del mismo origen, si la página la sirve el servidor (o ?api=); 2) si no,
  // 2) si no hay api o falla, el tiempo simulado de siempre, dicho. (El conector de claude.ai se quitó con la decisión 79.)
  // Expone TiempoVivo.lee() (lo que hay ahora, para otras piezas: fichas del tiempo, VR) y TiempoVivo.alCambiar(fn).
  // Los textos de Vigía son datos: se escapan al pintarlos y nunca se siguen. `dentroDeUmbrales` no se enseña: Vigía no autoriza tratamientos.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/tiempo_motor.test.js)
  var TiempoPuro = (function () {
    var ORIGENES = { vigia: 1, fixture: 1 };
    function n(v) { return typeof v === "number" && isFinite(v) ? v : null; }
    // el cielo, deducido de la nubosidad y la lluvia de la previsión y de la humedad: despejado, nubes, cubierto, lluvia o niebla
    function cielo(nub, lluvia, hr) {
      if (n(lluvia) != null && lluvia > 0.05) return "lluvia";
      if (n(hr) != null && hr >= 97 && (n(nub) == null || nub >= 80)) return "niebla";
      if (n(nub) == null) return null;
      return nub < 25 ? "despejado" : nub < 75 ? "nubes" : "cubierto";
    }
    // la hora de la previsión que contiene el momento (la última que ya empezó); −1 sin horas
    function horaIdx(horas, ms) {
      if (!horas || !horas.length) return -1;
      var i = 0; for (var k = 0; k < horas.length; k++) { if (Date.parse(horas[k].instante) <= ms) i = k; else break; } return i;
    }
    // ¿cumple lo esencial del contrato (contratos/tiempo.schema.json)? Lo demás se pinta con lo que haya (null = no está)
    function valida(r) {
      if (!r || typeof r !== "object" || r.version !== 1 || !ORIGENES[r.origen] || !Array.isArray(r.avisos)) return false;
      if (r.actual !== null && (typeof r.actual !== "object" || r.actual.naturaleza !== "medido" || !r.actual.estacion)) return false;
      if (r.prevision !== null && (typeof r.prevision !== "object" || r.prevision.naturaleza !== "modelado" || !Array.isArray(r.prevision.horas))) return false;
      if (r.prevision && r.prevision.horas.some(function (h) { return !h || !isFinite(Date.parse(h.instante)); })) return false;
      return true;
    }
    // de la respuesta de la api a la forma que pintan las fichas (la de Vigía: est y prev), sin nada que no esté en el contrato
    function aEstado(r) {
      var a = r.actual, p = r.prevision;
      var est = a ? { hayLectura: true, estacion: { id: a.estacion.id, distanciaKm: a.estacion.distanciaKm, advertencia: a.estacion.advertencia },
        temperatura: a.temperatura, humedadRelativa: a.humedadRelativa, viento: a.viento, racha: a.racha,
        direccionViento: { grados: a.direccion ? a.direccion.grados : null, advertencia: a.direccion ? a.direccion.advertencia : null },
        lluviaAcumulada: a.lluviaAcumulada, deltaT: a.deltaT, inhabilitados: a.inhabilitados || [], frescura: a.frescura || {} } : { hayLectura: false };
      var prev = p && p.horas.length ? { hayPrevision: true, ambito: p.ambito, frescura: p.frescura || {}, horas: p.horas.map(function (h) {
        return { instante: h.instante, temperatura: h.temperatura, humedadRelativa: h.humedadRelativa, viento: h.viento, racha: h.racha, direccion: h.direccion,
          nubosidad: h.nubosidad, lluvia: h.lluvia, probabilidadLluvia: h.probabilidadLluvia, deltaT: h.deltaT };
      }) } : { hayPrevision: false };
      return { est: est, prev: prev, avisos: r.avisos.map(function (x) { return { de: x.de, texto: String(x.texto) }; }), origen: r.origen, consultadoEn: r.consultadoEn };
    }
    // lo que expone TiempoVivo.lee(): el actual medido (con el cielo deducido de la hora de la previsión), las horas modeladas, la frescura y los avisos
    function vivo(origen, est, prev, avisos, ms) {
      var hs = prev && prev.hayPrevision && prev.horas ? prev.horas : [], i = horaIdx(hs, ms), h = i >= 0 ? hs[i] : null, e = est && est.hayLectura ? est : null;
      var f = (e && e.frescura) || (prev && prev.frescura) || {};
      return {
        origen: origen,
        actual: e ? {
          temperatura: n(e.temperatura), humedadRelativa: n(e.humedadRelativa), viento: n(e.viento), racha: n(e.racha),
          direccion: e.direccionViento ? n(e.direccionViento.grados) : null, lluvia: n(e.lluviaAcumulada),
          cielo: cielo(h ? h.nubosidad : null, h ? h.lluvia : null, n(e.humedadRelativa) != null ? e.humedadRelativa : (h ? h.humedadRelativa : null)),
          estacion: { id: e.estacion ? e.estacion.id || null : null, distanciaKm: e.estacion ? n(e.estacion.distanciaKm) : null }, naturaleza: "medido"
        } : null,
        horas: hs.map(function (x) {
          return { instante: x.instante, temperatura: n(x.temperatura), humedadRelativa: n(x.humedadRelativa), viento: n(x.viento), racha: n(x.racha), direccion: n(x.direccion),
            nubosidad: n(x.nubosidad), lluvia: n(x.lluvia), probabilidadLluvia: n(x.probabilidadLluvia), naturaleza: "modelado" };
        }),
        frescura: { generadoEn: f.generadoEn || null, horasDeAntiguedad: n(f.horasDeAntiguedad) },
        avisos: (avisos || []).map(function (x) { return typeof x === "string" ? x : String(x.texto); })
      };
    }
    // GET <prefijo>tiempo del mismo origen; nunca lanza: { ok, datos } o { ok: false, motivo }
    function lee(fetchFn, prefijo) {
      if (!prefijo || typeof fetchFn !== "function") return Promise.resolve({ ok: false, motivo: "sin_api" });
      return Promise.resolve().then(function () { return fetchFn(prefijo + "tiempo", { credentials: "same-origin", headers: { accept: "application/json" } }); })
        .then(function (r) {
          if (!r || !r.ok) return { ok: false, motivo: "http_" + (r ? r.status : 0) };
          return r.json().then(function (j) { return valida(j) ? { ok: true, datos: j } : { ok: false, motivo: "contrato" }; });
        })
        .catch(function () { return { ok: false, motivo: "red" }; });
    }
    // GET <prefijo>tiempo/historico?desde&hasta (contratos/tiempo-historico.schema.json); nunca lanza: { ok, datos } o { ok: false, motivo }
    function leeHistorico(fetchFn, prefijo, desde, hasta) {
      if (!prefijo || typeof fetchFn !== "function") return Promise.resolve({ ok: false, motivo: "sin_api" });
      return Promise.resolve().then(function () { return fetchFn(prefijo + "tiempo/historico?desde=" + encodeURIComponent(desde) + "&hasta=" + encodeURIComponent(hasta), { credentials: "same-origin", headers: { accept: "application/json" } }); })
        .then(function (r) {
          if (!r || !r.ok) return { ok: false, motivo: "http_" + (r ? r.status : 0) };
          return r.json().then(function (j) { return j && j.version === 1 && Array.isArray(j.fuentes) ? { ok: true, datos: j } : { ok: false, motivo: "contrato" }; });
        })
        .catch(function () { return { ok: false, motivo: "red" }; });
    }
    // La semana de la estación del tiempo (la misma que da la lectura de ahora; si no, la de Imarto, como siempre): { tmax, tmin, lluvia, dias, sin } o null si no hay cifras. Medido.
    function climaSemana(datos, idEstacion) {
      var fs = (datos && datos.fuentes) || [];
      var f = fs.filter(function (x) { return idEstacion && x.id === idEstacion; })[0] || fs.filter(function (x) { return /imarto/i.test(x.id || ""); })[0];
      if (!f || typeof f.temperaturaMaxima !== "number" || typeof f.temperaturaMinima !== "number") return null;
      return { tmax: f.temperaturaMaxima, tmin: f.temperaturaMinima, lluvia: typeof f.lluviaTotalMm === "number" ? f.lluviaTotalMm : 0, dias: f.dias, sin: f.diasSinDato };
    }
    var MOTIVOS = { sin_api: "esta página no tiene servidor del tiempo", http_401: "hace falta entrar con tu enlace", http_503: "el servidor no tiene el tiempo de Vigía ahora",
      contrato: "la respuesta del servidor no tiene la forma esperada", red: "no se pudo hablar con el servidor" };
    function motivo(m) { return MOTIVOS[m] || "el servidor respondió con un error (" + String(m).replace(/^http_/, "") + ")"; }
    return { cielo: cielo, horaIdx: horaIdx, valida: valida, aEstado: aEstado, vivo: vivo, lee: lee, leeHistorico: leeHistorico, climaSemana: climaSemana, motivo: motivo };
  })();
  // [puro:fin]
  // ?hora=HH[:MM] fija la hora del reloj del mundo (hoy, hora local; el sol, el día y la noche, y con ellos la vida: la bandada solo vuela de día); ?hora=AAAA-MM-DDTHH:MM, también la fecha. Para que las medidas no dependan del reloj de la máquina; sin el parámetro, Date.now().
  var HORA_FIJA = (function () {
    var m = /[?&]hora=([0-9T:.\-]+)/.exec(location.search); if (!m) return null; var v = m[1], r = /^(\d{1,2})(?::(\d{2}))?$/.exec(v), t;
    if (r) { t = new Date(); t.setHours(Number(r[1]), Number(r[2] || 0), 0, 0); t = t.getTime(); } else t = Date.parse(v);
    return isFinite(t) ? t : null;
  })();
  function ahoraMs() { return HORA_FIJA == null ? Date.now() : HORA_FIJA; }
  // origen: de dónde sale lo que se ve («vigia», «fixture» o «simulado»); avisos: los de la api (de Vigía o del gemelo), como datos
  var TM = { est: null, prev: null, his: null, modo: "ahora", idx: 0, ahoraIdx: 0, demo: "", jugando: false, origen: "simulado", avisos: [], api: null, oyentes: [] };
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
  var cur = { ms: ahoraMs(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 }, meta = { ms: ahoraMs(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 };
  var tMundo = 0, lluviaVis = 0, ins = { t: 1, txt: "" }, vFlecha = new THREE.Vector3();
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
    // la chapita del visor: hora, temperatura, nubes y viento, con la flecha de dónde viene el viento respecto a cómo miras
    ins.t += dt; if (ins.t > 0.25) {
      // la flecha apunta a DE DÓNDE VIENE el viento (como lo da Vigía y como las fichas del tiempo), respecto a hacia dónde mira la cámara
      // (vale en la vista aérea, a pie, en quad y en dron: se mira la cámara, no la órbita)
      ins.t = 0; camera.getWorldDirection(vFlecha); var lf = Math.hypot(vFlecha.x, vFlecha.z) || 1, fw = [vFlecha.x / lf, vFlecha.z / lf], rg = [-fw[1], fw[0]];
      var ang = Math.atan2(-vxS * rg[0] - vzS * rg[1], -vxS * fw[0] - vzS * fw[1]) * 180 / Math.PI;
      $("tFlecha").style.transform = "rotate(" + ang.toFixed(0) + "deg)"; $("tFlecha").style.opacity = cur.viento < 0.3 ? 0.25 : 1;
      // temperatura, cielo (deducido) y viento del momento que ves; «simulado» si no hay datos de Vigía (los efectos de ejemplo ya lo dicen en la ventana)
      var cie = TiempoPuro.cielo(meta.nub, meta.lluvia, meta.hr) || "cielo sin dato";
      var txt = fmtHora.format(new Date(cur.ms)) + " · " + num1(cur.temp, 0) + " °C · " + (cur.temp <= 0 ? "helada · " : "") + cie + " · " + (cur.viento < 0.3 ? "calma" : "viento del " + rumbo(cur.dir) + " " + num1(cur.viento, 1) + " m/s") +
        (TM.demo ? " · ejemplo" : TM.origen === "simulado" ? " · simulado" : TM.origen === "fixture" ? " · prueba" : "");
      if (txt !== ins.txt) {
        ins.txt = txt; $("tInsT").textContent = txt;
        $("tIns").setAttribute("aria-label", "El tiempo: " + txt + ". Abre la ventana del tiempo");
      }
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
  var fmtDia = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" });
  var fmtHora = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  var fmtClaveDia = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA });
  function num1(v, d) { return v == null ? "—" : Number(v).toLocaleString("es-ES", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
  function rumbo(g) { var n = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]; return n[Math.round(((g % 360) + 360) % 360 / 45) % 8]; }
  function tAviso(t, tipo) { var e = $("tEstado"); e.textContent = t; if (tipo) e.setAttribute("data-t", tipo); else e.removeAttribute("data-t"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hace(iso) { if (!iso) return ""; var h = (Date.now() - Date.parse(iso)) / 3600000; return h < 1 ? "hace " + Math.max(1, Math.round(h * 60)) + " min" : "hace " + num1(h, 1) + " h"; }

  function horaActual() { return TiempoPuro.horaIdx(TM.prev && TM.prev.horas, ahoraMs()); }   // la hora de la previsión que contiene el momento
  function objetivoMundoBase() {
    var h = TM.prev && TM.prev.horas, m = { ms: ahoraMs(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 };
    if (TM.demo && DEMOS[TM.demo]) { var D0 = DEMOS[TM.demo]; m.nub = D0.nub; m.lluvia = D0.lluvia; m.viento = D0.viento; m.dir = D0.dir; m.hr = D0.hr; m.temp = D0.temp; m.ms = TM.modo === "ahora" || !h ? ahoraMs() : Date.parse(h[TM.idx].instante); return m; }
    if (!h || !h.length) return m;
    var hh = h[Math.max(0, Math.min(h.length - 1, TM.idx))], e = TM.est;
    // la hora de la previsión (modelado) pone nubes, viento y lluvia; si a una hora le falta un dato, se queda el valor tranquilo de siempre (no se inventa otro)
    var ok = function (v) { return typeof v === "number" && isFinite(v); };
    if (ok(hh.nubosidad)) m.nub = hh.nubosidad; if (ok(hh.viento)) m.viento = hh.viento; if (ok(hh.direccion)) m.dir = hh.direccion; if (ok(hh.lluvia)) m.lluvia = hh.lluvia;
    if (ok(hh.humedadRelativa)) m.hr = hh.humedadRelativa; if (ok(hh.temperatura)) m.temp = hh.temperatura;
    // «ahora»: la temperatura y la humedad, las medidas en la estación. La lluvia medida es un acumulado (no dice si llueve ahora): la lluvia que se ve sale de la previsión
    if (TM.modo === "ahora") { m.ms = ahoraMs(); if (e && e.hayLectura) { if (ok(e.humedadRelativa)) m.hr = e.humedadRelativa; if (ok(e.temperatura)) m.temp = e.temperatura; } }
    else m.ms = Date.parse(hh.instante);
    return m;
  }
  function aplicaMundo() { var m = objetivoMundo(); Object.keys(m).forEach(function (c) { meta[c] = m[c]; }); }

  // --- las dos fichas
  function tarjetaEstacion() {
    var e = TM.est, c = $("tEst");
    if (!e || !e.hayLectura) {
      c.innerHTML = '<h3>Estación</h3><p class="nota">' + (e ? "Vigía no tiene lectura de la estación ahora mismo." : TM.origen === "simulado" ? "Sin datos de Vigía: el tiempo que ves es simulado." : "Sin leer todavía.") + "</p>" +
        (TM.avisos.length ? '<ul class="t-avisos">' + TM.avisos.map(function (a) { return "<li>" + (a.de === "vigia" ? "Vigía: " : "") + esc(a.texto) + "</li>"; }).join("") + "</ul>" : "");
      return;
    }
    var s = e.estacion || {}, f = e.frescura || {}, his = TM.his && (TM.his.porFuente || []).filter(function (x) { return x.id === s.id || /imarto/i.test(x.id || ""); })[0];
    var fil = function (k, v, u) { return "<div><dt>" + k + "</dt><dd>" + v + (u ? ' <small>' + u + "</small>" : "") + "</dd></div>"; };
    var dv = e.direccionViento || {};
    var h = '<h3>Estación ' + esc(s.id || "") + ' <span class="t-pill">medido</span></h3>' +
      '<p class="t-sub">Estación a ' + num1(s.distanciaKm, 1) + ' km (no está en la finca)' + (f.generadoEn ? ", " + hace(f.generadoEn) : ", sin hora de la medida") + "." + (f.datosDeMaqueta ? " <strong>Datos de maqueta.</strong>" : "") +
      (TM.origen === "fixture" ? " <strong>Datos de prueba sintéticos: no son de Vigía.</strong>" : "") + '</p>' +
      '<div class="t-grande"><span>' + num1(e.temperatura, 1) + '</span><small>°C</small></div><dl class="t-cifras">' +
      fil("Humedad", num1(e.humedadRelativa, 0), "%") + fil("Delta-T", num1(e.deltaT, 1), "°C") +
      fil("Lluvia acumulada", num1(e.lluviaAcumulada, 1), "mm") +
      fil("Viento", num1(e.viento, 1), "m/s") + fil("Racha", num1(e.racha, 1), "m/s") + fil("Dirección", dv.grados != null ? rumbo(dv.grados) + " " + esc(dv.grados) + "°" : "—", "") + '</dl>';
    // las advertencias son textos de Vigía: datos, escapados
    var adv = [s.advertencia, dv.advertencia].filter(function (x) { return x; });
    h += '<p class="t-aviso">' + (adv.length ? "Vigía advierte: " + adv.map(esc).join(" ") + " " : "") + "El viento que mueve el mundo sale de la previsión (modelado), no del anemómetro." +
      ((e.inhabilitados || []).length ? " Sin " + esc(e.inhabilitados.join(", ")) + "." : "") + "</p>";
    if (TM.avisos.length) h += '<ul class="t-avisos">' + TM.avisos.map(function (a) { return "<li>" + (a.de === "vigia" ? "Vigía: " : "") + esc(a.texto) + "</li>"; }).join("") + "</ul>";
    if (his) {
      h += '<h4>Últimos 7 días</h4><p class="t-sub">Máx. <strong>' + num1(his.temperaturaMaxima, 1) + '</strong> °C · mín. <strong>' + num1(his.temperaturaMinima, 1) + '</strong> °C · lluvia <strong>' + num1(his.lluviaTotalMm, 1) + '</strong> mm' + (his.diasConLluvia != null ? " en " + his.diasConLluvia + " día(s)" : "") +
        '. ' + (his.diasSinDato ? "Faltan datos de " + his.diasSinDato + " de " + (his.dias + his.diasSinDato) + " días." : "Sin días sin dato.") + "</p>";
    }
    c.innerHTML = h;
  }
  function resumenDias() {
    var hs = TM.prev.horas, por = {}, orden = [], v = function (x) { return typeof x === "number" && isFinite(x); };
    hs.forEach(function (x, i) {
      var k = fmtClaveDia.format(new Date(x.instante)); if (!por[k]) { por[k] = { k: k, ini: i, n: 0, t: [], nub: [], ll: 0, pr: 0, rf: null }; orden.push(k); }
      var d = por[k]; d.n++; if (v(x.temperatura)) d.t.push(x.temperatura); if (v(x.nubosidad)) d.nub.push(x.nubosidad); d.ll += v(x.lluvia) ? x.lluvia : 0;
      d.pr = Math.max(d.pr, v(x.probabilidadLluvia) ? x.probabilidadLluvia : 0); if (v(x.racha)) d.rf = Math.max(d.rf || 0, x.racha);
    });
    return orden.map(function (k) { return por[k]; }).filter(function (d) { return d.n >= 3; });
  }
  // «Próximas 72 h»: temperatura (con la nubosidad de fondo), lluvia y viento hora a hora, en un SVG a mano (sin librería); cada hora lleva su <title>
  function tarjetaPrevision() {
    var c = $("tPrev"), p = TM.prev;
    if (!p || !p.hayPrevision || !p.horas || !p.horas.length) { c.innerHTML = '<h3>Previsión · 72 horas</h3><p class="nota">' + (p ? "Vigía no tiene previsión ahora mismo." : TM.origen === "simulado" ? "Sin previsión de Vigía: el tiempo que ves es simulado." : "Sin leer todavía.") + "</p>"; return; }
    var hs = p.horas, n = hs.length, f = p.frescura || {}, dias = resumenDias(), W = 360, Hs = 150, x0g = 24, x1g = 352, yT0 = 10, yT1 = 70, yL = 96, yV0 = 104, yV1 = 130;
    var v = function (x) { return typeof x === "number" && isFinite(x); };
    var ts = hs.map(function (x) { return x.temperatura; }).filter(v), tmin = ts.length ? Math.floor(Math.min.apply(null, ts) - 1) : 0, tmax = ts.length ? Math.ceil(Math.max.apply(null, ts) + 1) : 1;
    var X = function (i) { return x0g + (x1g - x0g) * i / Math.max(1, n - 1); }, Y = function (t) { return yT1 - (yT1 - yT0) * (t - tmin) / (tmax - tmin); };
    // una línea que se corta donde falta el dato (no se inventa el tramo)
    var linea = function (val, y) { var d = "", sube = true; hs.forEach(function (x, i) { var q = val(x); if (!v(q)) { sube = true; return; } d += (sube ? "M" : "L") + X(i).toFixed(1) + "," + y(q).toFixed(1); sube = false; }); return d; };
    var lluviaMax = Math.max(0.5, Math.max.apply(null, hs.map(function (x) { return v(x.lluvia) ? x.lluvia : 0; })));
    var vMax = Math.max(5, Math.ceil(Math.max.apply(null, hs.map(function (x) { return Math.max(v(x.viento) ? x.viento : 0, v(x.racha) ? x.racha : 0); }))));
    var YV = function (w) { return yV1 - (yV1 - yV0) * w / vMax; };
    var nubes = "M" + X(0) + "," + yT1 + hs.map(function (x, i) { return "L" + X(i) + "," + (yT1 - (yT1 - yT0) * (v(x.nubosidad) ? x.nubosidad : 0) / 100 * 0.55); }).join("") + "L" + X(n - 1) + "," + yT1 + "Z";
    var bw = (x1g - x0g) / n, barras = hs.map(function (x, i) { var hgt = (v(x.lluvia) ? x.lluvia : 0) / lluviaMax * 22; return hgt > 0 ? '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (yL - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" fill="var(--lidar)"/>' : ""; }).join("");
    var seps = dias.slice(1).map(function (d) { return '<line x1="' + X(d.ini).toFixed(1) + '" x2="' + X(d.ini).toFixed(1) + '" y1="4" y2="' + yV1 + '" stroke="var(--line)" stroke-dasharray="3 3"/>'; }).join("");
    var etDias = dias.map(function (d, i) { var a = X(d.ini), b = X(i + 1 < dias.length ? dias[i + 1].ini : n - 1); return '<text x="' + ((a + b) / 2).toFixed(1) + '" y="' + (Hs - 2) + '" text-anchor="middle" fill="var(--muted)" font-size="9.5">' + esc(fmtDia.format(new Date(hs[d.ini].instante))) + "</text>"; }).join("");
    var horas = hs.map(function (x, i) {
      var ms = Date.parse(x.instante), t = fmtDia.format(new Date(ms)) + " " + fmtHora.format(new Date(ms)) + " · " + num1(x.temperatura, 1) + " °C · " + num1(x.nubosidad, 0) + " % nubes · lluvia " + num1(x.lluvia, 1) + " mm · viento " + num1(x.viento, 1) + " m/s" + (v(x.direccion) ? " del " + rumbo(x.direccion) : "") + ", racha " + num1(x.racha, 1);
      return '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + yV1 + '" fill="transparent"><title>' + esc(t) + "</title></rect>";
    }).join("");
    var marca = '<line id="tLinea" x1="0" x2="0" y1="2" y2="' + yV1 + '" stroke="var(--fg)" stroke-width="1.2"/>';
    var svg = '<svg viewBox="0 0 ' + W + " " + Hs + '" role="img" aria-label="Temperatura, nubosidad, lluvia y viento de las próximas 72 horas, hora a hora (previsión modelada)" class="t-graf">' +
      '<text x="2" y="' + (Y(tmax) + 3) + '" fill="var(--muted)" font-size="9.5">' + tmax + '°</text><text x="2" y="' + (Y(tmin) + 3) + '" fill="var(--muted)" font-size="9.5">' + tmin + '°</text>' +
      '<text x="2" y="' + (yV0 + 6) + '" fill="var(--muted)" font-size="8.5">' + vMax + '</text><text x="2" y="' + (yV1) + '" fill="var(--muted)" font-size="8.5">m/s</text>' +
      '<path d="' + nubes + '" fill="var(--muted)" opacity="0.22"/>' + seps + barras + '<line x1="' + x0g + '" x2="' + x1g + '" y1="' + yL + '" y2="' + yL + '" stroke="var(--line)"/>' +
      '<path d="' + linea(function (x) { return x.temperatura; }, Y) + '" fill="none" stroke="var(--guardado)" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="' + linea(function (x) { return x.racha; }, YV) + '" fill="none" stroke="var(--fg)" stroke-width="1" stroke-dasharray="2 2" opacity="0.6"/>' +
      '<path d="' + linea(function (x) { return x.viento; }, YV) + '" fill="none" stroke="var(--fg)" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<line x1="' + x0g + '" x2="' + x1g + '" y1="' + yV1 + '" y2="' + yV1 + '" stroke="var(--line)"/>' + etDias + marca + horas + "</svg>";
    var filas = dias.map(function (d, i) {
      var tn = d.t.length ? Math.min.apply(null, d.t) : null, tx = d.t.length ? Math.max.apply(null, d.t) : null, nm = d.nub.length ? d.nub.reduce(function (a, b) { return a + b; }, 0) / d.nub.length : null;
      var nom = i === 0 ? "Hoy" : i === 1 ? "Mañana" : fmtDia.format(new Date(hs[d.ini].instante));
      return "<tr><th scope=\"row\">" + esc(nom) + "</th><td>" + num1(tn, 0) + " – " + num1(tx, 0) + " °C</td><td>" + num1(nm, 0) + " % nubes</td><td>" + (d.ll > 0 ? num1(d.ll, 1) + " mm (" + num1(d.pr, 0) + " %)" : "sin lluvia") + "</td><td>racha " + num1(d.rf, 1) + " m/s</td></tr>";
    }).join("");
    c.innerHTML = '<h3>Previsión · 72 horas <span class="t-pill t-pill-m">modelado</span></h3><p class="t-sub">Una por finca, de una rejilla de ~5 km' + (f.generadoEn ? " · " + hace(f.generadoEn) : "") + "." + (f.datosDeMaqueta ? " <strong>Datos de maqueta.</strong>" : "") + (TM.origen === "fixture" ? " <strong>Datos de prueba sintéticos: no son de Vigía.</strong>" : "") + "</p>" + svg +
      '<p class="t-leyenda"><i style="background:var(--guardado)"></i>temperatura <i style="background:var(--muted);opacity:.4"></i>nubosidad <i style="background:var(--lidar)"></i>lluvia (mm/h) <i style="background:var(--fg)"></i>viento (punteado: racha). Toca o pasa por encima de una hora para ver sus cifras.</p>' +
      lineaHelada(hs) + '<table class="t-tabla"><tbody>' + filas + "</tbody></table>";
    marcaMomento();
  }
  function lineaHelada(hs) {
    var con = hs.filter(function (x) { return typeof x.temperatura === "number" && isFinite(x.temperatura); }); if (!con.length) return '<p class="t-sub">La previsión no trae temperaturas.</p>';
    var m = con.reduce(function (a, x) { return x.temperatura < a.temperatura ? x : a; }, con[0]), ms = Date.parse(m.instante), cuando = fmtDia.format(new Date(ms)) + " " + fmtHora.format(new Date(ms));
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
    $("tResumen").textContent = hh ? (TM.demo ? "" : "En el mundo: " + num1(hh.nubosidad, 0) + " % de nubes · viento " + num1(hh.viento, 1) + " m/s" + (hh.direccion != null ? " del " + rumbo(hh.direccion) : "") + " · " +
      (hh.lluvia > 0 ? "lluvia " + num1(hh.lluvia, 1) + " mm" : "sin lluvia") + " (previsión: modelado; las nubes, la lluvia y el viento que se ven, dibujados a partir de ella: ilustrativo)") : "";
  }
  function anuncia() { var v = TiempoVivo.lee(); TM.oyentes.slice().forEach(function (fn) { try { fn(v); } catch (e) {} }); }
  function aplicaDatos() {
    var h = TM.prev && TM.prev.horas, tiene = !!(h && h.length);
    $("tControl").hidden = !tiene; TM.ahoraIdx = Math.max(0, horaActual());
    if (tiene) { $("tMomento").max = h.length - 1; if (TM.modo === "ahora") TM.idx = TM.ahoraIdx; TM.idx = Math.min(TM.idx, h.length - 1); $("tMomento").value = TM.idx; }
    tarjetaEstacion(); tarjetaPrevision(); refrescaTiempo(); anuncia();
  }
  // Lo que ve el resto del motor (y otras piezas: fichas del tiempo, VR). Sin dentroDeUmbrales. Contrato: doc/sistema/CONTRATOS.md.
  // alCambiar(fn): fn recibe lo mismo que lee(); devuelve la función para darse de baja
  var TiempoVivo = (function () {
    function lee() {
      var sim = TM.origen === "simulado";
      return TiempoPuro.vivo(TM.origen, sim ? null : TM.est, sim ? null : TM.prev, sim ? [{ texto: "Tiempo simulado: no hay datos de Vigía." }] : TM.avisos, ahoraMs());
    }
    function alCambiar(fn) {
      if (typeof fn !== "function") return function () {};
      TM.oyentes.push(fn); return function () { var i = TM.oyentes.indexOf(fn); if (i >= 0) TM.oyentes.splice(i, 1); };
    }
    return { lee: lee, alCambiar: alCambiar };
  })();

  // --- de dónde se lee: la api del mismo origen; si no, simulado (y se dice)
  function tiempoSimulado(motivo) {
    TM.origen = "simulado"; TM.est = null; TM.prev = null; TM.his = null; TM.avisos = [];
    tAviso("Tiempo simulado: " + motivo + ". El cielo, el viento y la temperatura que ves no son los reales.", "parcial"); aplicaDatos();
  }
  async function leerApi(silencioso) {
    if (!silencioso) { $("tLeer").disabled = true; tAviso("Leyendo el tiempo de Vigía en el servidor…", ""); }
    var r = await TiempoPuro.lee(window.fetch ? window.fetch.bind(window) : null, TM.api);
    $("tLeer").disabled = false;
    if (!r.ok) return r;
    var s = TiempoPuro.aEstado(r.datos);
    TM.est = s.est; TM.prev = s.prev; TM.avisos = s.avisos; TM.origen = s.origen; TM.his = null;
    $("tLeer").hidden = false; $("tLeer").textContent = "Volver a leer";
    tAviso((s.origen === "fixture" ? "Datos de PRUEBA sintéticos (no son de Vigía), leídos " : "Tiempo de Vigía, leído por el servidor ") + hace(s.consultadoEn) +
      ". Estación: medido · previsión: modelado · lo dibujado (nubes, lluvia, viento): ilustrativo.", s.origen === "vigia" && !s.avisos.length ? "vivo" : "parcial");
    aplicaDatos(); return r;
  }
  async function leerTiempo() {
    if (!TM.api) return;
    var r = await leerApi(false); if (r.ok) return;
    if (TM.origen === "simulado") tiempoSimulado(TiempoPuro.motivo(r.motivo));
    else tAviso("No se ha podido volver a leer (" + TiempoPuro.motivo(r.motivo) + "): sigue la lectura anterior.", "error");
  }
  (function () {
    $("tMomento").addEventListener("input", function () { TM.idx = Number($("tMomento").value); TM.modo = TM.idx === TM.ahoraIdx ? "ahora" : "prevision"; refrescaTiempo(); });
    $("tAhora").addEventListener("click", function () { TM.demo = ""; $("tDemo").value = ""; TM.modo = "ahora"; TM.idx = TM.ahoraIdx; $("tMomento").value = TM.idx; refrescaTiempo(); });
    // «+6 h» y «Mañana a las 12:00» se quitaron (decisión 89): el deslizador «Momento» y «Ahora» bastan
    $("tDemo").addEventListener("change", function () { TM.demo = $("tDemo").value; refrescaTiempo(); });
    var reloj = null;
    $("tPlay").addEventListener("click", function () {
      TM.jugando = !TM.jugando; $("tPlay").textContent = TM.jugando ? "Pausa" : "Reproducir"; $("tPlay").setAttribute("aria-pressed", String(TM.jugando)); clearInterval(reloj);
      if (TM.jugando) reloj = setInterval(function () { var h = TM.prev && TM.prev.horas; if (!h) return; TM.idx = (TM.idx + 1) % h.length; TM.modo = "prevision"; $("tMomento").value = TM.idx; refrescaTiempo(); }, 700);
    });
    if (calma) $("tPlay").hidden = true;
    $("tLeer").addEventListener("click", leerTiempo);
    // la lámina de la previsión en el mundo: la pide por el Bus («prevision:alterna», la atiende el componente fichas-tiempo de 35_fichas_tiempo.js);
    // el botón solo se ve si alguien la atiende (si el componente está apagado o fuera del motor, no hay botón muerto)
    var vm = $("tVerMundo");
    if (vm) {
      vm.addEventListener("click", function () { Bus.emite("prevision:alterna"); });
      var veVm = function () { vm.hidden = !Bus.hay("prevision:alterna"); }; Bus.on("componentes:cambia", veVm); veVm();
    }
    new MutationObserver(pintaFondoTiempo).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintaFondoTiempo);
    pintaFondoTiempo(); tarjetaEstacion(); tarjetaPrevision();
    TM.api = typeof HazasPuro !== "undefined" ? HazasPuro.prefijoApi(location.search, D.base) : null;   // «/api/» si la página la sirve el servidor (o ?api=)
    if (window.__TIEMPO_PRUEBA) { TM.est = window.__TIEMPO_PRUEBA.est; TM.prev = window.__TIEMPO_PRUEBA.prev; TM.his = window.__TIEMPO_PRUEBA.his; TM.origen = "fixture"; aplicaDatos(); tAviso("Datos de prueba (solo en local).", "parcial"); return; }
    (TM.api ? leerApi(true) : Promise.resolve({ ok: false, motivo: "sin_api" })).then(function (r) {
      if (r.ok) {   // la api guarda lo de Vigía (10 min el actual, 1 h la previsión): pedirle cada 10 min no llega a Vigía más a menudo
        setInterval(function () { leerApi(true); }, 10 * 60000); return;
      }
      if (TM.api) $("tLeer").hidden = false;   // con servidor, se puede reintentar
      tiempoSimulado(TiempoPuro.motivo(r.motivo));
    });
  })();
  var lindes = D.parcelas.map(creaBarrera);


