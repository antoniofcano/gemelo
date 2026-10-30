// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: EST, construyeFrutosLista, objetivoMundo, actualizaOlivo
// Consume: 01_datos ($), 02_mundo (suelo, copas), 03_escena (renderer, SRGB, sol, modo), 04d_sombreado_tiles (hash), 06_arboles (gFollaje),
//   07_follaje (matHojaG, matHojaP), 10_ndvi (NDV, ndviIdx), 13_parcelas (parcelas), 14_historia (aviso),
//   15_tiempo (lluvia, cargaT, fmtHora, fmtClaveDia, num1, esc, objetivoMundoBase, aplicaMundo)
// Nota: Publica además window.__otDebug (depuración del olivo estacional).
// ===============================================================================
  // ---------- el olivo estacional: la fecha de la estación (el deslizador de la hierba) manda en el sol, el clima, el color de la copa y la fenología
  // Fenología: calendario típico del olivar de Jaén (BBCH según el día del año) ajustado con lo que se ha observado en OlivarTrack.
  // Copa: NDVI de la copa de esa fecha (la recta NDVI = a + b·f del suelo, con la copa a + b). Clima: máximas, mínimas y lluvia de esa semana en la estación de Vigía.
  var EST = { activa: false, deltaMs: 0, clima: null, estado: "", cache: {}, desfase: 0, origen: "", timer: null };
  var BBCH_ANCLAS = [[1, 89], [30, 89], [31, 0], [60, 9], [100, 15], [115, 51], [130, 59], [142, 65], [160, 69], [175, 71], [240, 75], [270, 79], [290, 81], [320, 85], [350, 89], [366, 89]];
  function diaDelAnio(iso) { var d = new Date(iso + "T12:00:00Z"), i = Date.UTC(d.getUTCFullYear(), 0, 0); return Math.round((d.getTime() - i) / 86400000); }
  function bbchModelo(doy) {
    var d = ((doy - 1) % 366 + 366) % 366 + 1;
    for (var i = 1; i < BBCH_ANCLAS.length; i++) { var a = BBCH_ANCLAS[i - 1], b = BBCH_ANCLAS[i]; if (d <= b[0]) return a[1] + (b[1] - a[1]) * (d - a[0]) / Math.max(1e-9, b[0] - a[0]); }
    return 89;
  }
  function textoBBCH(b) { b = Math.round(b); return b < 10 ? "reposo y brotación" : b < 50 ? "crecimiento de los brotes" : b < 60 ? "inflorescencias" : b < 70 ? "floración" : b < 80 ? "cuajado y crecimiento del fruto" : "envero y maduración"; }
  function calibraFenologia() {   // se desplaza el calendario para que case con lo observado: mediana de (día en que el calendario da ese BBCH − día en que se observó)
    var regs = []; parcelas.forEach(function (p) { var d = OT && OT.parcelas && OT.parcelas[p.id]; (d && d.fenologia || []).forEach(function (f) { if (f.bbch != null && f.fecha) regs.push(f); }); });
    if (!regs.length) { EST.desfase = 0; EST.origen = "calendario típico, sin observaciones que lo ajusten"; return; }
    var ds = regs.map(function (f) { var dr = diaDelAnio(f.fecha), mejor = dr, md = 1e9; for (var k = Math.max(1, dr - 60); k <= Math.min(366, dr + 60); k++) { var e = Math.abs(bbchModelo(k) - f.bbch); if (e < md) { md = e; mejor = k; } } return mejor - dr; }).sort(function (a, b) { return a - b; });
    EST.desfase = ds[Math.floor(ds.length / 2)]; var u = regs.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); })[0];
    EST.origen = "calendario típico ajustado con tu fenología (BBCH " + u.bbch + " el " + String(u.fecha).slice(8, 10) + "/" + String(u.fecha).slice(5, 7) + ", " + (EST.desfase === 0 ? "sin desfase" : (EST.desfase > 0 ? "adelanto de " : "retraso de ") + Math.abs(EST.desfase) + " días") + ")";
  }
  function bbchEn(iso) { return bbchModelo(diaDelAnio(iso) + EST.desfase); }
  function copaSerie() {   // NDVI de la copa de cada fecha: a + b cuando la recta es fiable; si no, se interpola entre las vecinas
    var n = NDV.fechas.length, v = [], ok = [];
    for (var i = 0; i < n; i++) { var fiable = SN && SN.b[i] >= 0.1; ok.push(fiable); v.push(fiable ? SN.a[i] + SN.b[i] : null); }
    for (var j = 0; j < n; j++) if (v[j] == null) { var l = j - 1, r = j + 1; while (l >= 0 && v[l] == null) l--; while (r < n && v[r] == null) r++; v[j] = l >= 0 && r < n ? v[l] + (v[r] - v[l]) * (j - l) / (r - l) : (l >= 0 ? v[l] : (r < n ? v[r] : 0.7)); }
    return v;
  }
  var COPA = NDV && SN ? copaSerie() : [], COPA_MIN = 0.56, COPA_MAX = 0.84;
  function vigorCopa(i) { return COPA.length ? Math.max(0, Math.min(1, (COPA[i] - COPA_MIN) / (COPA_MAX - COPA_MIN))) : 0.6; }

  // --- flores y aceitunas: puntos sobre las copas que cambian con el BBCH (cada uno madura a su ritmo)
  var uFruto = { uBBCH: { value: 0 }, uEsc: { value: 1000 }, uLuz: { value: new THREE.Color(1, 1, 1) } };
  var matFruto = new THREE.ShaderMaterial({
    uniforms: uFruto,
    vertexShader: "attribute float aR; attribute float aS; uniform float uBBCH; uniform float uEsc; varying vec3 vCol;\n" +
      "void main(){ float b = uBBCH + (aR - 0.5) * 7.0; float tam = 0.0; vec3 col = vec3(1.0);\n" +
      "if (b >= 58.0 && b < 70.5) { float dens = smoothstep(58.0, 62.0, b) * (1.0 - smoothstep(66.0, 70.5, b)) * 0.8; if (aS < dens) { tam = 0.5; col = vec3(0.97, 0.95, 0.86); } }\n" +
      "else if (b >= 70.5 && b < 91.0) { if (aS < 0.55) { tam = mix(0.25, 0.7, clamp((b - 71.0) / 8.0, 0.0, 1.0)); vec3 verde = vec3(0.5, 0.64, 0.2); vec3 violeta = vec3(0.5, 0.2, 0.38); vec3 negro = vec3(0.17, 0.1, 0.19); col = mix(verde, violeta, smoothstep(80.0, 85.0, b)); col = mix(col, negro, smoothstep(85.0, 90.0, b)); } }\n" +
      "vCol = col; vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.z += 1.0;\n" +
      "if (tam <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; } else { gl_Position = projectionMatrix * mv; gl_PointSize = tam * uEsc / max(0.5, -mv.z); } }",
    fragmentShader: "uniform vec3 uLuz; varying vec3 vCol; void main(){ vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d); if (r2 > 0.25) discard; float brillo = smoothstep(0.07, 0.0, length(d - vec2(-0.12, 0.12))); gl_FragColor = vec4(sRGBTransferEOTF(vec4(vCol, 1.0)).rgb * uLuz * (0.82 + 0.4 * (0.25 - r2)) + brillo * 0.3 * uLuz, 1.0);\n#include <colorspace_fragment>\n}"
  });
  function construyeFrutosLista(grupo) {   // las flores y aceitunas de un grupo de olivos (una de cada cuatro hojas)
    var pos = [], aR = [], aS = [], k = 0;
    grupo.children.filter(function (o) { return o.material === matHojaG || o.material === matHojaP; }).forEach(function (o) { var a = o.geometry.attributes.position.array; for (var i = 0; i < a.length; i += 12) { pos.push(a[i], a[i + 1], a[i + 2]); aR.push(hash(k * 7.13)); aS.push(hash(k * 3.71 + 9)); k++; } });
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("aR", new THREE.Float32BufferAttribute(aR, 1)); g.setAttribute("aS", new THREE.Float32BufferAttribute(aS, 1)); g.computeBoundingSphere();
    var p = new THREE.Points(g, matFruto); p.frustumCulled = false; grupo.add(p);
  }

  // --- la fecha manda: sol, clima y fenología
  function hoyMadrid() { return fmtClaveDia.format(new Date()); }
  function fechaEstacion() { return NDV ? NDV.fechas[ndviIdx] : hoyMadrid(); }
  function pideClima(iso) {
    if (EST.cache[iso] !== undefined) { EST.clima = EST.cache[iso]; EST.estado = EST.clima ? "" : "sin dato de la estación esa semana"; pintaEstacion(); return; }
    function fin(c, msg) { EST.cache[iso] = c; if (fechaEstacion() === iso) { EST.clima = c; EST.estado = c ? "" : msg; pintaEstacion(); } }
    if (window.__TIEMPO_PRUEBA && window.__TIEMPO_PRUEBA.semana) { fin(window.__TIEMPO_PRUEBA.semana, ""); return; }
    if (!TM.mcp) { EST.clima = null; EST.estado = "sin conexión con Vigía: el clima del mundo sigue siendo el de hoy"; pintaEstacion(); return; }
    EST.estado = "leyendo el clima de esa semana en Vigía…"; EST.clima = null; pintaEstacion();
    var d1 = new Date(iso + "T12:00:00Z"), d0 = new Date(d1.getTime() - 6 * 86400000), ymd = function (d) { return d.toISOString().slice(0, 10); };
    TM.mcp.callTool("Vigia", "historico_meteo", { desde: ymd(d0), hasta: ymd(d1) }, { cache: true }).then(function (r) {
      var p = cargaT(r), f = p && (p.porFuente || []).filter(function (x) { return /imarto/i.test(x.id || ""); })[0];
      if (f && f.temperaturaMaxima != null && f.temperaturaMinima != null) fin({ tmax: f.temperaturaMaxima, tmin: f.temperaturaMinima, lluvia: f.lluviaTotalMm || 0, dias: f.dias, sin: f.diasSinDato }, ""); else fin(null, "la estación no tiene datos de esa semana");
    }).catch(function () { fin(null, "no se pudo leer el clima de esa semana"); });
  }
  function actualizaEstacion() {
    EST.activa = !!NDV && ndviIdx !== NDV.fechas.length - 1;
    var iso = fechaEstacion(); EST.deltaMs = EST.activa ? Date.parse(iso + "T00:00:00Z") - Date.parse(hoyMadrid() + "T00:00:00Z") : 0;
    if (EST.activa) { clearTimeout(EST.timer); EST.timer = setTimeout(function () { pideClima(iso); }, 450); } else { EST.clima = null; EST.estado = ""; }
    pintaEstacion(); if (typeof aplicaMundo === "function") aplicaMundo();
  }
  function objetivoMundo() {   // en la estación de otra fecha: el sol de ese día a la hora de ahora y, si hay dato, su temperatura
    var m = objetivoMundoBase(); if (!EST || !EST.activa || TM.demo) return m;
    m.ms += EST.deltaMs;
    if (EST.clima) { var hl = parseInt(fmtHora.format(new Date(m.ms)).slice(0, 2), 10), f = 0.5 + 0.5 * Math.cos(2 * Math.PI * (hl - 15) / 24); m.temp = EST.clima.tmin + (EST.clima.tmax - EST.clima.tmin) * f; m.hr = 75 - 40 * f; m.lluvia = 0; m.nub = 20; m.viento = 1.5; m.dir = 270; }
    return m;
  }
  function pintaEstacion() {
    var c = $("tEstac"); if (!c || !NDV) return;
    var iso = fechaEstacion(), bb = bbchEn(iso), v = vigorCopa(ndviIdx), a = SN ? SN.a[ndviIdx] : null, f = iso.split("-").reverse().join("/");
    var h = '<h3>El olivo en esta fecha <span class="t-pill t-pill-m">estimado</span></h3><p class="t-sub">' + (EST.activa ? "Estación del " + f + " (no es hoy). " : "Imagen más reciente: " + f + " (hoy se usa el tiempo real). ") + '<button type="button" class="h-btn" id="tHoy"' + (EST.activa ? "" : " hidden") + ">Volver a hoy</button></p>";
    h += '<dl class="t-cifras"><div><dt>Fenología (BBCH)</dt><dd>' + Math.round(bb) + ' <small>' + esc(textoBBCH(bb)) + '</small></dd></div><div><dt>NDVI de la copa</dt><dd>' + (COPA.length ? num1(COPA[ndviIdx], 2) : "—") + ' <small>' + (v > 0.66 ? "vigorosa" : v > 0.33 ? "normal" : "apagada") + '</small></dd></div><div><dt>NDVI del suelo</dt><dd>' + (a != null ? num1(a, 2) : "—") + '</dd></div></dl>';
    h += '<p class="t-sub">' + esc(EST.origen) + ".</p>";
    if (EST.activa) {
      if (EST.clima) h += '<p class="t-sub">Clima de esa semana (estación de Vigía): máx. <strong>' + num1(EST.clima.tmax, 1) + '</strong> °C · mín. <strong>' + num1(EST.clima.tmin, 1) + '</strong> °C · lluvia <strong>' + num1(EST.clima.lluvia, 1) + "</strong> mm" + (EST.clima.tmin <= 0 ? " · <strong>semana con helada</strong>" : "") + (EST.clima.lluvia >= 12 ? " · el arroyo lleva agua" : "") + ".</p>";
      else if (EST.estado) h += '<p class="t-sub">' + esc(EST.estado) + ".</p>";
    }
    if (modo !== "gem") h += '<p class="t-aviso">Las flores y las aceitunas solo se ven en el modo «Gemelo» (copas en 3D). <button type="button" class="h-btn" id="tVerGem">Ver en Gemelo</button></p>';
    h += '<p class="t-sub">Flores y aceitunas son ilustrativas: la etapa sale de un calendario típico, el color de la copa del NDVI y el clima de la estación; no hay conteo de frutos.</p>';
    c.innerHTML = h; var vg = $("tVerGem"); if (vg) vg.addEventListener("click", function () { $("mGem").click(); }); var b = $("tHoy"); if (b) b.addEventListener("click", function () { var s = $("hSel"); s.value = NDV.fechas.length - 1; s.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  var tonoO = new THREE.Color(1, 1, 1);
  function actualizaOlivo(dt) {
    if (!NDV) return;
    var iso = fechaEstacion(), bb = bbchEn(iso), v = vigorCopa(ndviIdx), brote = Math.max(0, 1 - Math.abs(bb - 15) / 7) * (bb >= 9 && bb < 30 ? 1 : 0), reposo = bb < 9 || (bb >= 89 && diaDelAnio(iso) < 35) ? 0.04 : 0;
    var vig = 0.9 + 0.2 * v;   // copa apagada: más pardo y más oscura; vigorosa: más verde
    tonoO.setRGB((1.06 - 0.1 * v) * (1 + 0.04 * brote) * (1 - reposo), vig * (1 + 0.12 * brote) * (1 - reposo), (0.96 + 0.06 * v) * (1 - 0.12 * brote) * (1 - reposo), SRGB);
    matHojaG.color.multiply(tonoO); matHojaP.color.multiply(tonoO);
    uFruto.uBBCH.value = bb; uFruto.uEsc.value = renderer.domElement.height * 0.5; uFruto.uLuz.value.copy(matHojaG.color);
  }
  window.__otDebug = function () { var o = gFollaje.children.length ? gFollaje.children[gFollaje.children.length - 1].children.slice(-1)[0] : null; return { hijos: gFollaje.children.length, puntos: o && o.geometry && o.geometry.attributes.position ? o.geometry.attributes.position.count : -1, bbch: uFruto.uBBCH.value, esc: uFruto.uEsc.value, visible: gFollaje.visible, tipo: o && o.type }; };
  calibraFenologia();
  (function () {
    var h = $("hSel"); if (h) h.addEventListener("input", function () { actualizaEstacion(); });
    ["mNube", "mGem", "mOrto"].forEach(function (id) { var b = $(id); if (b) b.addEventListener("click", function () { setTimeout(pintaEstacion, 0); }); });
    pintaEstacion();
  })();


