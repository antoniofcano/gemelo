// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: parcelas, fincas, fincaSel, parcelaSel, claseUsda, elegirParcela, elegirFinca
// Consume: 01_datos (D, $, fmt, DIST_INI), 02_mundo (suelo, copas, cIn, marc, med), 03_escena (exag, modo, calidad), 08_marcadores (aplicaLuego),
//   09_camara (objetivo, orb), 14_historia (tabla, nMarc)
// ===============================================================================
  // ---------- parcelas: selector, cifras y suelo de cada una
  var parcelas = D.parcelas, fincas = D.fincas || [], fincaSel = -1, parcelaSel = -1, vistaIni = { x: 0, y: 12, z: 0, dist: DIST_INI };
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
    var enF = function (p) { return fincaSel < 0 || (parcelas[p] && parcelas[p].finca === fincaSel); };
    var ci = cIn.filter(function (c) { return k < 0 ? enF(c.parc) : c.parc === k; }), mm = marc.filter(function (m) { return k < 0 ? enF(m.parc) : m.parc === k; }), ee = mm.filter(function (m) { return m.par >= 0; });
    var dx = ee.map(function (m) { return m.x - copas[m.par].x; }), dy = ee.map(function (m) { return m.y - copas[m.par].y; });
    $("tMedido").textContent = "Lo medido · " + (k >= 0 ? parcelas[k].nombre : fincaSel >= 0 ? fincas[fincaSel].nombre : fincas.length > 1 ? "toda la explotación" : "toda la finca");
    $("kCopas").textContent = fmt(ci.length); $("kMarc").textContent = fmt(mm.length);
    $("kAlt").textContent = fmt(med(ci.map(function (c) { return c.h; })), 1) + " m"; $("kDes").textContent = fmt(Math.hypot(med(dx), med(dy)), 1) + " m";
    $("nCopas").textContent = fmt(cIn.length); $("nMarc").textContent = fmt(marc.length);
  }
  function elegirParcela(k) {
    parcelaSel = k; if (k >= 0 && fincas.length > 1) fincaSel = parcelas[k].finca;
    pintaChips();
    estadisticas(k); pintaSuelo(k);
    if (k < 0 && fincaSel >= 0) { var vf = vistaDeFinca(fincaSel); vistaIni = { x: vf.x, y: suelo(vf.x, -vf.z) * exag, z: vf.z, dist: vf.dist }; }
    else if (k < 0) { vistaIni = { x: 0, y: 12, z: 0, dist: DIST_INI }; }
    else { var pr = parcelas[k]; vistaIni = { x: pr.centro[0], y: suelo(pr.centro[0], pr.centro[1]) * exag, z: -pr.centro[1], dist: Math.max(110, Math.sqrt(pr.ha) * 95) }; }
    orb.dist = vistaIni.dist; orb.el = k < 0 ? 0.62 : 0.7; objetivo.set(vistaIni.x, vistaIni.y, vistaIni.z);
  }
  function vistaDeFinca(f) {   // el centro y la distancia para encuadrar todas las parcelas de una finca
    var xs = [], ys = []; fincas[f].parcelas.forEach(function (k) { parcelas[k].linde.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
    var a = Math.min.apply(null, xs), b = Math.max.apply(null, xs), c = Math.min.apply(null, ys), d = Math.max.apply(null, ys);
    return { x: (a + b) / 2, z: -(c + d) / 2, dist: Math.max(260, Math.hypot(b - a, d - c) * 1.15) };
  }
  function elegirFinca(f) { fincaSel = f; elegirParcela(-1); }
  function pintaChips() {   // dos niveles cuando hay varias fincas: primero las fincas y, de la elegida, sus parcelas
    var cf = $("chipsFincas"), cp = $("chips"); if (!cf) { var kk = parcelaSel; Array.prototype.forEach.call(cp.children, function (b) { b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-k")) === kk)); }); return; }
    Array.prototype.forEach.call(cf.children, function (b) { var f = Number(b.getAttribute("data-f")); b.setAttribute("aria-pressed", String(f === fincaSel)); });
    cp.innerHTML = ""; $("tParcelasFinca").textContent = fincaSel >= 0 ? "Parcelas de " + fincas[fincaSel].nombre : "Elige una finca para ver sus parcelas"; cp.hidden = fincaSel < 0;
    if (fincaSel >= 0) fincas[fincaSel].parcelas.forEach(function (k) {
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.setAttribute("data-k", k); b.setAttribute("aria-pressed", String(k === parcelaSel)); b.textContent = parcelas[k].nombre + " · " + fmt(parcelas[k].ha, 1) + " ha" + (parcelas[k].pasto ? " (pasto)" : ""); b.addEventListener("click", function () { elegirParcela(k); }); cp.appendChild(b);
    });
  }
  (function () {
    if (fincas.length > 1) {   // selector de dos niveles (fincas → parcelas)
      var cp0 = $("chips"), cf = document.createElement("div"); cf.id = "chipsFincas"; cf.className = "chips"; cf.setAttribute("role", "group"); cf.setAttribute("aria-label", "Finca a mostrar");
      var tf = document.createElement("p"); tf.id = "tParcelasFinca"; tf.className = "nota"; tf.style.margin = "10px 0 6px"; cp0.parentNode.insertBefore(cf, cp0); cp0.parentNode.insertBefore(tf, cp0);
      var chipF = function (txt, f) { var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.setAttribute("data-f", f); b.setAttribute("aria-pressed", "false"); b.textContent = txt; b.addEventListener("click", function () { if (f < 0) { fincaSel = -1; elegirParcela(-1); } else elegirFinca(f); }); cf.appendChild(b); };
      chipF("Toda la explotación", -1); fincas.forEach(function (f, i) { chipF(f.nombre + " · " + fmt(f.ha, 0) + " ha · " + fmt(f.olivos) + " olivos", i); });
      $("calidad").addEventListener("change", function () { calidad = Number($("calidad").value); if (modo === "gem") aplicaLuego(); });
      return;
    }
    var cont = $("chips"), chip = function (txt, k) { var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.setAttribute("data-k", k); b.setAttribute("aria-pressed", "false"); b.textContent = txt; b.addEventListener("click", function () { elegirParcela(k); }); cont.appendChild(b); };
    chip("Toda la finca", -1); parcelas.forEach(function (pr, k) { chip(pr.nombre + " · " + fmt(pr.ha, 1) + " ha", k); });
    $("calidad").addEventListener("change", function () { calidad = Number($("calidad").value); if (modo === "gem") aplicaLuego(); });
  })();
  elegirParcela(-1);


