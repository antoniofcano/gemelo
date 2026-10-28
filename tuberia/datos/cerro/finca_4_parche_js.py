"""Convierte la plantilla de una parcela en la plantilla de la finca (varias parcelas). Parte de gemelo_plantilla2_js.html y escribe gemelo_finca_js.html."""
import os
R = __import__("os").environ.get("GEMELO_DATOS", "datos")
s = open(os.path.join(R, "gemelo_plantilla2_js.html"), encoding="utf-8").read()
def c(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b, 1)

# suelo en rejilla de 2 m
c("""    var ix = Math.max(0, Math.min(D.suelo.w - 1, Math.floor((x - x0)))), iy = Math.max(0, Math.min(D.suelo.h - 1, Math.floor(yN - y)));""",
  """    var rs = D.suelo.res, ix = Math.max(0, Math.min(D.suelo.w - 1, Math.floor((x - x0) / rs))), iy = Math.max(0, Math.min(D.suelo.h - 1, Math.floor((yN - y) / rs)));""")

# copas y marcados: la parcela a la que pertenecen
c("dentro: c[4] === 1, oliv:", "dentro: c[4] > 0, parc: c[4] - 1, oliv:")
c("return { i: i, x: m[0], y: m[1], par: m[2] }; });", "return { i: i, x: m[0], y: m[1], par: m[2], parc: m[3] }; });")
a = s.index("  var emp = marc.filter")
b = s.index('  $("kDes").textContent') ; b = s.index("\n", b) + 1
c(s[a:b], """  var med = function (a) { var s = a.slice().sort(function (p, q) { return p - q; }); return s.length ? s[Math.floor(s.length / 2)] : 0; };
""")

# escena más grande
c("camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);", "camera = new THREE.PerspectiveCamera(42, 1, 0.5, 5000);")
c("scene.fog = new THREE.Fog(c, 420, 1000);", "scene.fog = new THREE.Fog(c, 900, 2600);")

# lindes de todas las parcelas
c("""  var lindeGeo = new THREE.BufferGeometry(), lp = []; D.linde.concat([D.linde[0]]).forEach(function (p) { lp.push(new THREE.Vector3(p[0], 0, -p[1])); });
  lindeGeo.setFromPoints(lp); gLinde.add(new THREE.Line(lindeGeo, new THREE.LineBasicMaterial({ color: 0xffffff })));""",
  """  var lindes = D.parcelas.map(function (pr) {
    var g = new THREE.BufferGeometry(), pts = pr.linde.concat([pr.linde[0]]).map(function (p) { return new THREE.Vector3(p[0], 0, -p[1]); });
    g.setFromPoints(pts); gLinde.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff }))); return g;
  });""")
c("""    var p = lindeGeo.attributes.position;
    D.linde.concat([D.linde[0]]).forEach(function (q, i) { p.setXYZ(i, q[0], (suelo(q[0], q[1]) + 0.4) * exag, -q[1]); }); p.needsUpdate = true;""",
  """    D.parcelas.forEach(function (pr, k) {
      var p = lindes[k].attributes.position;
      pr.linde.concat([pr.linde[0]]).forEach(function (q, i) { p.setXYZ(i, q[0], (suelo(q[0], q[1]) + 0.4) * exag, -q[1]); }); p.needsUpdate = true;
    });""")

# cámara inicial para la finca entera
c("objetivo = new THREE.Vector3(0, 8, 0), orb = { az: -0.6, el: 0.72, dist: 330 }", "objetivo = new THREE.Vector3(0, 12, 0), orb = { az: -0.55, el: 0.62, dist: 700 }")
c('$("reiniciar").addEventListener("click", function () { orb.az = orbIni.az; orb.el = orbIni.el; orb.dist = orbIni.dist; objetivo.set(0, 8, 0); });',
  '$("reiniciar").addEventListener("click", function () { elegirParcela(parcelaSel); });')

# paseo: empieza en la parcela elegida
a = s.index("    var cx0 = 0, cy0 = 0;")
b = s.index("pp.ang = 0;", a) + len("pp.ang = 0;")
c(s[a:b], "    var pr0 = D.parcelas[parcelaSel >= 0 ? parcelaSel : 0]; pp.x = pr0.centro[0]; pp.y = pr0.centro[1] - 6; pp.ang = 0;")

c("construyeFollaje(); } marcadores();", "construyeFollaje(); } marcadores(); if (avTipo) pintaAvance(avTipo);")

# calidad del follaje (rendimiento con tantos árboles)
c("      var n = (q % 3 === 0) ? 1 : 2;  // más montoncitos por punto: la copa se cierra",
  "      var n = calidad === 2 ? ((q % 3 === 0) ? 1 : 2) : calidad === 1 ? ((q % 3 === 0) ? 1 : 0) : 0;  // más montoncitos por punto: la copa se cierra")
c("      for (var k = 0; k < 48; k++) {\n        var th = (hash(n * 97 + k) * 6.283)", "      var relleno = calidad === 2 ? 48 : calidad === 1 ? 22 : 0;\n      for (var k = 0; k < relleno; k++) {\n        var th = (hash(n * 97 + k) * 6.283)")
c("  var exag = 1, modo = \"nube\";", "  var exag = 1, modo = \"nube\", calidad = 1;")

# ficha: la parcela
c('"<dt>Altura</dt><dd>" + fmt(best.h, 1) + " m</dd>', '"<dt>Parcela</dt><dd>" + (best.dentro ? parcelas[best.parc].nombre : "fuera de las parcelas") + "</dd><dt>Altura</dt><dd>" + fmt(best.h, 1) + " m</dd>')

# selector de parcelas, estadísticas por parcela y ficha de suelo
bloque = '''
  // ---------- parcelas: selector, cifras y suelo de cada una
  var parcelas = D.parcelas, parcelaSel = -1, vistaIni = { x: 0, y: 12, z: 0, dist: 700 };
  function claseUsda(a, l, c) {
    if (c >= 40 && a <= 45 && l < 40) return "arcilloso"; if (c >= 40 && l >= 40) return "arcillo limoso"; if (c >= 35 && a > 45) return "arcillo arenoso";
    if (c >= 27 && c < 40 && a > 20 && a <= 45) return "franco arcilloso"; if (c >= 27 && c < 40 && a <= 20) return "franco arcillo limoso";
    if (c >= 20 && c < 35 && l < 28 && a > 45) return "franco arcillo arenoso"; if (l >= 80 && c < 12) return "limoso";
    if ((l >= 50 && c >= 12 && c < 27) || (l >= 50 && l < 80 && c < 12)) return "franco limoso"; if (c >= 7 && c < 27 && l >= 28 && l < 50 && a <= 52) return "franco";
    if (a >= 85 && l + 1.5 * c < 15) return "arenoso"; return "franco arenoso";
  }
  function pintaSuelo(k) {
    var cu = $("sueloCuerpo"), pr = k >= 0 ? parcelas[k] : null;
    if (!pr) { cu.innerHTML = '<p class="nota">Elige una parcela arriba para ver la caracterización de su suelo.</p>'; return; }
    if (!pr.suelo) { cu.innerHTML = '<p class="nota">Sin datos de SoilGrids para esta parcela.</p>'; return; }
    var f = pr.suelo, clases = {}; f.forEach(function (r) { clases[claseUsda(r.a, r.l, r.c)] = 1; });
    var h = '<p class="sg-clase">' + pr.nombre + ' · textura <strong>' + Object.keys(clases).join(" / ") + '</strong></p>' +
      '<div class="sg-leyenda"><span><i style="background:var(--arena)"></i>arena</span><span><i style="background:var(--limo)"></i>limo</span><span><i style="background:var(--arcilla)"></i>arcilla (%)</span></div>';
    f.forEach(function (r) {
      h += '<div class="sg-fila"><span class="sg-prof">' + r.p + ' cm</span><span class="sg-barra" role="img" aria-label="arena ' + fmt(r.a) + ' %, limo ' + fmt(r.l) + ' %, arcilla ' + fmt(r.c) + ' %"><i style="width:' + r.a.toFixed(1) + '%;background:var(--arena)"></i><i style="width:' + r.l.toFixed(1) + '%;background:var(--limo)"></i><i style="width:' + r.c.toFixed(1) + '%;background:var(--arcilla)"></i></span><span class="sg-num">' + fmt(r.c) + ' %</span></div>';
    });
    h += '<table class="sg-tabla"><thead><tr><th>cm</th><th>pH</th><th>MO %</th><th>CIC</th></tr></thead><tbody>';
    f.forEach(function (r) { h += '<tr><td>' + r.p + '</td><td>' + fmt(r.ph, 1) + '</td><td>' + fmt(r.mo, 1) + '</td><td>' + fmt(r.cec) + '</td></tr>'; });
    h += '</tbody></table><p class="nota">Densidad ' + fmt(f[1].dens, 2) + ' kg/dm³ y ' + fmt(f[1].pedr) + ' % de elementos gruesos a 5-15 cm. CIC en cmol(c)/kg. MO = carbono orgánico × 1,724.</p>' +
      '<p class="nota" style="margin-top:6px">Modelo del ISRIC a 250 m, consultado el 25-oct-2026: un valor por parcela, no un mapa dentro de ella. Las parcelas cercanas pueden compartir celda y por tanto valores casi iguales. No hay analítica de suelo propia con la que contrastarlo.</p>';
    cu.innerHTML = h;
  }
  function estadisticas(k) {
    var ci = cIn.filter(function (c) { return k < 0 || c.parc === k; }), mm = marc.filter(function (m) { return k < 0 || m.parc === k; }), ee = mm.filter(function (m) { return m.par >= 0; });
    var dx = ee.map(function (m) { return m.x - copas[m.par].x; }), dy = ee.map(function (m) { return m.y - copas[m.par].y; });
    $("tMedido").textContent = "Lo medido · " + (k < 0 ? "toda la finca" : parcelas[k].nombre);
    $("kCopas").textContent = fmt(ci.length); $("kMarc").textContent = fmt(mm.length);
    $("kAlt").textContent = fmt(med(ci.map(function (c) { return c.h; })), 1) + " m"; $("kDes").textContent = fmt(Math.hypot(med(dx), med(dy)), 1) + " m";
    $("nCopas").textContent = fmt(cIn.length); $("nMarc").textContent = fmt(marc.length);
  }
  function elegirParcela(k) {
    parcelaSel = k; var chips = $("chips").children;
    for (var i = 0; i < chips.length; i++) chips[i].setAttribute("aria-pressed", String(Number(chips[i].getAttribute("data-k")) === k));
    estadisticas(k); pintaSuelo(k);
    if (k < 0) { vistaIni = { x: 0, y: 12, z: 0, dist: 700 }; }
    else { var pr = parcelas[k]; vistaIni = { x: pr.centro[0], y: suelo(pr.centro[0], pr.centro[1]) * exag, z: -pr.centro[1], dist: Math.max(110, Math.sqrt(pr.ha) * 95) }; }
    orb.dist = vistaIni.dist; orb.el = k < 0 ? 0.62 : 0.7; objetivo.set(vistaIni.x, vistaIni.y, vistaIni.z);
  }
  (function () {
    var cont = $("chips"), chip = function (txt, k) { var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.setAttribute("data-k", k); b.setAttribute("aria-pressed", "false"); b.textContent = txt; b.addEventListener("click", function () { elegirParcela(k); }); cont.appendChild(b); };
    chip("Toda la finca", -1); parcelas.forEach(function (pr, k) { chip(pr.nombre + " · " + fmt(pr.ha, 1) + " ha", k); });
    $("calidad").addEventListener("change", function () { calidad = Number($("calidad").value); if (modo === "gem") aplicaLuego(); });
  })();
  elegirParcela(-1);
'''
c("  function tamano() {", bloque + "\n  function tamano() {")
open(os.path.join(R, "gemelo_finca_js.html"), "w", encoding="utf-8").write(s)
print("js finca ok")
