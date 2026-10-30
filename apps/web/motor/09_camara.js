// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: objetivo, orb, camara, sensMirar, suelta, elige, pon
// Consume: 01_datos ($, fmt, DIST_MAX, DIST_INI), 02_mundo (orto, kcor), 02e_entidades (Usables), 03_escena (lienzo, camera, exag, modo),
//   05_nube (nube), 08_marcadores (aplica, capas, aplicaLuego), 12_paseo (paseando), 13_parcelas (parcelaSel, elegirParcela),
//   19_balizas (eligeBaliza, sueltaBaliza), 29_vr (ficha), 33_ajustes (Ajustes)
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
  var toquePaseo = null;   // en el paseo no se gira la vista con el dedo, pero un toque corto elige lo que haya debajo (olivo, baliza…)
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

  // un toque corto o un clic: elige lo que haya debajo (C7: Usables, 02e_entidades.js; cada tipo de cosa del mundo dice si está bajo el dedo y gana por
  // tipo y por cercanía); sobre nada, suelta lo elegido y cierra la ficha
  function elige(cx, cy) {
    if (eligeBaliza(cx, cy)) return;   // una baliza (columna de luz) tocada abre la ficha de su parcela
    sueltaBaliza();
    Usables.toque(cx, cy);
  }

  function pon(m) { modo = m; ["Nube", "Gem", "Orto"].forEach(function (n) { $("m" + n).setAttribute("aria-pressed", String((n === "Nube" && m === "nube") || (n === "Gem" && m === "gem") || (n === "Orto" && m === "orto"))); }); aplica(); }
  $("mNube").addEventListener("click", function () { pon("nube"); }); $("mGem").addEventListener("click", function () { pon("gem"); }); $("mOrto").addEventListener("click", function () { pon("orto"); });
  ["cLinde", "cCopas", "cMarc", "cDesf"].forEach(function (id) { $(id).addEventListener("change", capas); });
  $("exag").addEventListener("input", function (e) { exag = Number(e.target.value); $("exagV").textContent = fmt(exag, exag % 1 ? 2 : 0) + "×"; aplicaLuego(); });
  $("corr").addEventListener("input", function (e) { kcor = Number(e.target.value); $("corrV").textContent = fmt(kcor, kcor % 1 ? 2 : 0) + "×"; aplicaLuego(); });
  $("reiniciar").addEventListener("click", function () { elegirParcela(parcelaSel); });
