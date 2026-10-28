// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: actualizaMinimapa
// Consume: 01_datos (D, $, ANCHO, ALTO), 02_mundo (Mundo, cIn), 12_paseo (paseando), 13_parcelas (parcelas), 15_tiempo (esc),
//   16_vida (enQuad, mira, conejos, quad, enDron, dron), 19_balizas (dibujaBalizasMini), 25_perros (dibujaPerrosMini), 90_final (cuadro)
// ===============================================================================
  // ---------- el minimapa del paseo: la ortofoto vista desde arriba con tú, tu rastro, el dron y los conejos (M o un toque cambia el zoom)
  var mini = { cv: $("mapita"), cerca: false, rastro: [], t: 0 }, MW = 240, MH = Math.round(MW * ALTO / ANCHO);
  (function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2); mini.cv.width = MW * dpr; mini.cv.height = MH * dpr; mini.cv.style.width = MW + "px"; mini.cv.style.height = MH + "px"; mini.dpr = dpr; mini.ctx = mini.cv.getContext("2d");
    function cambia() { mini.cerca = !mini.cerca; mini.t = 1; mini.cv.title = mini.cerca ? "Vista cercana: toca para ver toda la finca" : "Toda la finca: toca para acercar"; }
    mini.cv.addEventListener("click", cambia); mini.cv.title = "Toda la finca: toca para acercar";
    window.addEventListener("keydown", function (e) { if (!paseando || e.code !== "KeyM") return; var t = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return; cambia(); e.preventDefault(); });
  })();
  function actualizaMinimapa(dt) {
    mini.cv.hidden = !paseando;
    if (!paseando) { mini.rastro.length = 0; return; }
    var u = mini.rastro[mini.rastro.length - 1];
    if (!u || Math.hypot(u[0] - pp.x, u[1] - pp.y) > 2.5) { mini.rastro.push([pp.x, pp.y]); if (mini.rastro.length > 240) mini.rastro.shift(); }
    mini.t += dt; if (mini.t < 0.08) return; mini.t = 0;
    var c = mini.ctx, k = mini.dpr, ancho = mini.cerca ? 150 : ANCHO, alto = ancho * ALTO / ANCHO, cx0 = mini.cerca ? pp.x : x0 + ANCHO / 2, cy0 = mini.cerca ? pp.y : yN - ALTO / 2;
    var vx0 = cx0 - ancho / 2, vy1 = cy0 + alto / 2, esc = MW / ancho;     // ventana del mapa: x este, y norte
    var X = function (x) { return (x - vx0) * esc; }, Y = function (y) { return (vy1 - y) * esc; };
    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, MW, MH);
    c.save(); c.beginPath(); c.rect(0, 0, MW, MH); c.clip();
    Mundo.pintaOrto(c, vx0, vy1, ancho, alto, MW, MH);
    c.fillStyle = "rgba(10,14,8,0.18)"; c.fillRect(0, 0, MW, MH);
    // las parcelas: contorno de luz
    c.lineWidth = 1.6; c.strokeStyle = "#40f0ff"; c.fillStyle = "rgba(64,240,255,0.08)";
    D.parcelas.forEach(function (pr) { c.beginPath(); pr.linde.forEach(function (q, i) { if (i) c.lineTo(X(q[0]), Y(q[1])); else c.moveTo(X(q[0]), Y(q[1])); }); c.closePath(); c.fill(); c.stroke(); });
    if (mini.cerca) { c.fillStyle = "rgba(140,190,90,0.9)"; cIn.forEach(function (o) { var px = X(o.x), py = Y(o.y); if (px > -3 && px < MW + 3 && py > -3 && py < MH + 3) { c.beginPath(); c.arc(px, py, 1.6, 0, 6.283); c.fill(); } }); }
    // tu rastro
    c.lineWidth = 2; c.strokeStyle = "rgba(255,154,46,0.9)"; c.beginPath(); mini.rastro.forEach(function (q, i) { if (i) c.lineTo(X(q[0]), Y(q[1])); else c.moveTo(X(q[0]), Y(q[1])); }); c.stroke();
    // conejos
    c.fillStyle = "#f2dcb8"; conejos.forEach(function (co) { if (!co.visible) return; c.beginPath(); c.arc(X(co.userData.x), Y(co.userData.y), 2.2, 0, 6.283); c.fill(); });
    dibujaBalizasMini(c, X, Y); dibujaPerrosMini(c, X, Y);
    // el dron, unido a ti con un hilo, y el cuadro de lo que ve
    if (enDron) {
      var dx = X(dr.x), dy = Y(dr.y); c.strokeStyle = "rgba(64,240,255,0.7)"; c.lineWidth = 1; c.beginPath(); c.moveTo(X(pp.x), Y(pp.y)); c.lineTo(dx, dy); c.stroke();
      c.save(); c.translate(dx, dy); c.rotate(dr.yaw); c.fillStyle = "#40f0ff"; c.strokeStyle = "#06222a"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -6); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    // tú: una flecha que mira hacia donde miras (el quad, más grande)
    c.save(); c.translate(X(pp.x), Y(pp.y)); c.rotate(pp.ang); var s = enQuad ? 1.25 : 1;
    c.fillStyle = "rgba(255,255,255,0.22)"; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 22 * s, -1.95, -1.19); c.closePath(); c.fill();   // el campo de visión
    c.fillStyle = "#ff7a1a"; c.strokeStyle = "#ffffff"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -8 * s); c.lineTo(6 * s, 6 * s); c.lineTo(0, 3 * s); c.lineTo(-6 * s, 6 * s); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.restore();
    c.fillStyle = "rgba(255,255,255,0.92)"; c.font = "600 11px system-ui, sans-serif"; c.textAlign = "center"; c.fillText("N", MW - 12, 14);
    c.font = "500 10px system-ui, sans-serif"; c.textAlign = "left"; c.fillStyle = "rgba(255,255,255,0.9)"; c.fillText(mini.cerca ? "150 m" : "finca", 7, MH - 7);
  }


