// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: objetivo, orb, camara, sensMirar, suelta, eligeCopa, pon
// Consume: 01_datos (D, $, fmt, DIST_MAX, DIST_INI), 02_mundo (suelo, orto, kcor, copas, marc), 03_escena (lienzo, camera, exag, modo),
//   05_nube (nube), 07ab_generados (Generados), 08_marcadores (aplica, capas, aplicaLuego), 12_paseo (paseando),
//   13_parcelas (parcelas, parcelaSel, elegirParcela), 19_balizas (eligeBaliza, sueltaBaliza), 29_vr (ficha), 33_ajustes (Ajustes)
// ===============================================================================

  // cámara orbital
  var objetivo = new THREE.Vector3(0, 12, 0), orb = { az: -0.55, el: 0.62, dist: DIST_INI }, orbIni = JSON.parse(JSON.stringify(orb));
  function camara() { var ce = Math.cos(orb.el), se = Math.sin(orb.el); camera.position.set(objetivo.x + orb.dist * ce * Math.sin(orb.az), objetivo.y + orb.dist * se, objetivo.z + orb.dist * ce * Math.cos(orb.az)); camera.lookAt(objetivo); }
  // Configuración → Controles (33_ajustes.js): sensibilidad al mirar y eje vertical invertido; sin 33_ajustes.js, 1× y sin invertir
  function sensMirar() {
    var k = 1, y = 1;
    try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.lee) { k = Number(Ajustes.lee("controles.sens")) || 1; y = Ajustes.lee("controles.invertir") ? -1 : 1; } } catch (e) {}
    return { k: k, y: y };
  }
  var punteros = {}, movido = 0;
  var toquePaseo = null;   // en el paseo no se gira la vista con el dedo, pero un toque corto elige olivo o baliza
  lienzo.addEventListener("pointerdown", function (e) {
    if (paseando) { toquePaseo = { x: e.clientX, y: e.clientY, t: performance.now() }; return; }
    lienzo.setPointerCapture(e.pointerId); punteros[e.pointerId] = { x: e.clientX, y: e.clientY }; movido = 0; });
  lienzo.addEventListener("pointermove", function (e) {
    if (paseando) return;
    var p = punteros[e.pointerId]; if (!p) return;
    var ids = Object.keys(punteros), dx = e.clientX - p.x, dy = e.clientY - p.y; movido += Math.abs(dx) + Math.abs(dy);
    if (ids.length === 1) { if (e.shiftKey || e.buttons === 2) pan(dx, dy); else { var se = sensMirar(); orb.az -= dx * 0.006 * se.k; orb.el = Math.max(0.08, Math.min(1.5, orb.el + dy * 0.006 * se.k * se.y)); } }
    else if (ids.length === 2) { var o = punteros[ids.filter(function (i) { return i != e.pointerId; })[0]]; var antes = Math.hypot(p.x - o.x, p.y - o.y), ahora = Math.hypot(e.clientX - o.x, e.clientY - o.y); orb.dist = Math.max(30, Math.min(DIST_MAX, orb.dist * (antes / Math.max(ahora, 1)))); pan(dx / 2, dy / 2); }
    p.x = e.clientX; p.y = e.clientY;
  });
  function suelta(e) {
    if (paseando) { var q = toquePaseo; toquePaseo = null; if (q && e.type === "pointerup" && Math.hypot(e.clientX - q.x, e.clientY - q.y) < 10 && performance.now() - q.t < 600) elige(e.clientX, e.clientY); return; }
    var tocar = Object.keys(punteros).length === 1 && movido < 6; delete punteros[e.pointerId]; if (tocar && e.type === "pointerup") elige(e.clientX, e.clientY); }
  lienzo.addEventListener("pointerup", suelta); lienzo.addEventListener("pointercancel", suelta); lienzo.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  lienzo.addEventListener("wheel", function (e) { e.preventDefault(); if (paseando) return; orb.dist = Math.max(30, Math.min(DIST_MAX, orb.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });
  function pan(dx, dy) { var f = orb.dist * 0.0016, rx = Math.cos(orb.az), rz = -Math.sin(orb.az); objetivo.x -= dx * f * rx; objetivo.z -= dx * f * rz; objetivo.x += dy * f * Math.sin(orb.az); objetivo.z += dy * f * Math.cos(orb.az); }

  function elige(cx, cy) {
    if (eligeBaliza(cx, cy)) return;   // una baliza (columna de luz) tocada abre la ficha de su parcela
    sueltaBaliza();
    var r = lienzo.getBoundingClientRect(), best = null, bd = 26, v = new THREE.Vector3();
    copas.forEach(function (c) {
      if (!c.oliv) return;
      v.set(c.x, (suelo(c.x, c.y) + c.h * 0.7) * exag, -c.y).project(camera); if (v.z > 1) return;
      var sx = (v.x * 0.5 + 0.5) * r.width + r.left, sy = (-v.y * 0.5 + 0.5) * r.height + r.top, d = Math.hypot(sx - cx, sy - cy); if (d < bd) { bd = d; best = c; }
    });
    if (!best) { $("ficha").hidden = true; return; }
    eligeCopa(best);
  }
  function rotuloGenerado(i) {   // decisión 34: si el olivo se dibuja generado (?olivos=gen), se dice que su forma es ilustrativa y si su id es provisional
    var r = Generados.rotulo(i); if (!r) return "";
    return "<dt>Forma</dt><dd>ilustrativa con medidas del LiDAR" + (r.lejano ? " (lejano)" : r.variante ? " (variante)" : r.niv && Generados.escalera() ? " (propio)" : "") + "</dd>" + (r.provisional ? "<dt>Id</dt><dd>provisional (aún no viene del censo)</dd>" : "");
  }
  function eligeCopa(best) {
    var f = $("ficha");
    var m = marc.filter(function (q) { return q.par === best.i; })[0], rm = best.perfil.reduce(function (a, b) { return a + b; }, 0) / 8;
    $("fichaTitulo").textContent = "Olivo " + (best.i + 1);
    $("fichaDatos").innerHTML = "<dt>Parcela</dt><dd>" + (best.dentro ? parcelas[best.parc].nombre : "fuera de las parcelas") + "</dd><dt>Altura</dt><dd>" + fmt(best.h, 1) + " m</dd><dt>Radio de copa</dt><dd>" + fmt(rm, 1) + " m</dd>" +
      "<dt>Guardado en OlivarTrack</dt><dd>" + (best.dentro ? (m ? "sí" : "no") : "fuera de esta parcela") + "</dd>" + (m ? "<dt>Desfase</dt><dd>" + fmt(Math.hypot(m.x - best.x, m.y - best.y), 1) + " m</dd>" : "") +
      "<dt>Pies del olivo</dt><dd>2–3, lo habitual (no medido)</dd>" + rotuloGenerado(best.i) + "<dt>UTM 30 (ETRS89)</dt><dd>" + fmt(D.centro_utm[0] + best.x) + ", " + fmt(D.centro_utm[1] + best.y) + "</dd>";
    f.hidden = false;
  }
  $("cerrarFicha").addEventListener("click", function () { $("ficha").hidden = true; });

  function pon(m) { modo = m; ["Nube", "Gem", "Orto"].forEach(function (n) { $("m" + n).setAttribute("aria-pressed", String((n === "Nube" && m === "nube") || (n === "Gem" && m === "gem") || (n === "Orto" && m === "orto"))); }); aplica(); }
  $("mNube").addEventListener("click", function () { pon("nube"); }); $("mGem").addEventListener("click", function () { pon("gem"); }); $("mOrto").addEventListener("click", function () { pon("orto"); });
  ["cLinde", "cCopas", "cMarc", "cDesf"].forEach(function (id) { $(id).addEventListener("change", capas); });
  $("exag").addEventListener("input", function (e) { exag = Number(e.target.value); $("exagV").textContent = fmt(exag, exag % 1 ? 2 : 0) + "×"; aplicaLuego(); });
  $("corr").addEventListener("input", function (e) { kcor = Number(e.target.value); $("corrV").textContent = fmt(kcor, kcor % 1 ? 2 : 0) + "×"; aplicaLuego(); });
  $("reiniciar").addEventListener("click", function () { elegirParcela(parcelaSel); });
