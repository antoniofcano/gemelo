// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: mini, actualizaMinimapa
// Consume: 01_datos (D, $, ANCHO, ALTO), 02_mundo (Mundo, cIn), 12_paseo (paseando, persona), 13_parcelas (parcelas), 14_historia (aviso, carga),
//   15_tiempo (esc), 16_vida (enQuad, mira, conejos, quad, enDron, dron), 19_balizas (avisoBaliza, dibujaBalizasMini), 25_perros (dibujaPerrosMini),
//   26_presencia (Presencia), 34_movibles (Movibles), 90_final (cuadro)
// ===============================================================================
  // ---------- el minimapa del paseo: la ortofoto vista desde arriba con tú, tu rastro, el dron y los conejos (M o un toque cambia el zoom)
  var mini = { cv: $("mapita"), cerca: false, oculto: false, rastro: [], t: 0, pts: [], bal: [], sel: null }, MW = 240, MH = Math.round(MW * ALTO / ANCHO);
  // I1: con la presencia compartida, los demás que se ven (Presencia.puntos: de tu sala, con pose y sin bloquear) salen como puntos violeta (en quad, un
  // cuadrado; con el dron, un rombo). Un toque en un punto muestra su alias («toca otra vez para ir»); otro toque en 4 s te lleva con esa persona
  var SEL_T = 4, TOQUE = 14;
  (function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2); mini.cv.width = MW * dpr; mini.cv.height = MH * dpr; mini.cv.style.width = MW + "px"; mini.cv.style.height = MH + "px"; mini.dpr = dpr; mini.ctx = mini.cv.getContext("2d");
    function cambia() { mini.cerca = !mini.cerca; mini.t = 1; mini.cv.title = mini.cerca ? "Vista cercana: toca para ver toda la finca" : "Toda la finca: toca para acercar"; pintaZoom(); }
    mini.cv.addEventListener("click", function (e) {
      var r = mini.cv.getBoundingClientRect(), x = (e.clientX - r.left) * MW / (r.width || MW), y = (e.clientY - r.top) * MH / (r.height || MH), mejor = null, dm = TOQUE * TOQUE;
      mini.pts.forEach(function (p) { var d = (p.px - x) * (p.px - x) + (p.py - y) * (p.py - y); if (d < dm) { dm = d; mejor = p; } });
      if (!mejor) {   // I4: el rombo de una baliza abre su aviso («¿Ir a esta baliza?»); fuera de puntos y rombos, cambia el zoom, como siempre
        var bal = null, db = TOQUE * TOQUE;
        mini.bal.forEach(function (p) { var d = (p.px - x) * (p.px - x) + (p.py - y) * (p.py - y); if (d < db) { db = d; bal = p; } });
        mini.sel = null; if (bal) avisoBaliza(bal.k); else cambia(); return;
      }
      if (mini.sel && mini.sel.id === mejor.id && mini.sel.t > 0) { mini.sel = null; Presencia.irCon(mejor.id); }   // segundo toque: vamos
      else mini.sel = { id: mejor.id, t: SEL_T };
      mini.t = 1;
    });
    mini.cv.title = "Toda la finca: toca para acercar";
    // el minimapa es una ventana flotante y movible (34_movibles.js): una barra con el agarre ⠿, el zoom y plegar. Plegado deja solo la barra (así se vuelve a abrir
    // también con el dedo); M lo pliega y lo despliega en el paseo. La brújula (N ↑) ya no lo oculta. Se recuerda en este navegador (si el almacenamiento falla, solo dura la visita)
    try { mini.oculto = localStorage.getItem("gemelo.minimapa") === "oculto"; } catch (e) {}
    var bru = $("norte");
    if (bru) { bru.removeAttribute("aria-pressed"); bru.title = "Brújula: el norte, arriba"; }
    var mb = "font:inherit;color:inherit;background:none;border:0;min-width:44px;min-height:44px;cursor:pointer;padding:0;font-size:17px";
    function boton(txt, etiqueta, clase) { var b = document.createElement("button"); b.type = "button"; b.textContent = txt; b.setAttribute("aria-label", etiqueta); b.title = etiqueta; b.style.cssText = mb; if (clase) b.className = clase; return b; }
    var agarre = boton("⠿", "Mover el minimapa: flechas del teclado (Mayús, más deprisa; Inicio, a su sitio)", "agarre"), tit = document.createElement("strong"),
      bZoom = boton("🔍", "Acercar el mapa"), bPlega = boton("▾", "Plegar el minimapa"), asa = document.createElement("div");
    agarre.style.cursor = "grab"; agarre.style.color = "rgba(255,255,255,0.7)"; tit.textContent = "Mapa"; tit.style.cssText = "flex:1;font-size:13px;padding-right:6px";
    asa.className = "asa"; asa.style.cssText = "display:flex;align-items:center;gap:2px;padding-left:2px;cursor:grab"; [agarre, tit, bZoom, bPlega].forEach(function (e) { asa.appendChild(e); });
    var wrap = document.createElement("div"); wrap.id = "mapaFlotante"; wrap.hidden = true;
    wrap.style.cssText = "position:absolute;left:14px;top:48px;z-index:6;border-radius:10px;overflow:hidden;width:max-content;max-width:calc(100% - 28px);background:rgba(16,20,24,0.88);color:#fff;font:13px system-ui,sans-serif;border:1.5px solid rgba(255,255,255,0.25);box-shadow:0 4px 16px rgba(0,0,0,.28)";
    mini.cv.parentNode.insertBefore(wrap, mini.cv); wrap.appendChild(asa); wrap.appendChild(mini.cv);
    mini.cv.hidden = false; mini.cv.style.cssText += ";position:static;display:block;border:0;border-radius:0;box-shadow:none;max-width:none";
    mini.wrap = wrap;
    function pintaZoom() { bZoom.setAttribute("aria-pressed", String(mini.cerca)); bZoom.title = mini.cerca ? "Ver toda la finca" : "Acercar el mapa"; bZoom.setAttribute("aria-label", bZoom.title); }
    function pintaPlega() { mini.cv.hidden = mini.oculto; bPlega.textContent = mini.oculto ? "▸" : "▾"; bPlega.title = mini.oculto ? "Desplegar el minimapa (M)" : "Plegar el minimapa (M)"; bPlega.setAttribute("aria-label", bPlega.title); bPlega.setAttribute("aria-expanded", String(!mini.oculto)); }
    function plega(v) {
      mini.oculto = v; pintaPlega(); mini.t = 1;
      try { localStorage.setItem("gemelo.minimapa", mini.oculto ? "oculto" : "visible"); } catch (e) {}
      if (typeof Movibles !== "undefined" && Movibles) Movibles.revisa();   // al plegarse o desplegarse cambia de tamaño: que no pise nada
    }
    bZoom.addEventListener("click", cambia); bPlega.addEventListener("click", function () { plega(!mini.oculto); });
    pintaZoom(); pintaPlega();
    mini.plega = plega;
    // 34_movibles.js se carga después de este módulo: se engancha cuando ya está
    setTimeout(function () { if (typeof Movibles !== "undefined" && Movibles) mini.mov = Movibles.hazMovible(wrap, asa, "mapa", null, { defecto: function (d) { return d.tactil ? { x: d.W - d.mg.r - d.w - 10, y: d.mg.t + 64 } : { x: d.mg.l + 14, y: d.mg.t + 112 }; } }); }, 0);
    window.addEventListener("keydown", function (e) { if (!paseando || e.code !== "KeyM") return; var t = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return; plega(!mini.oculto); e.preventDefault(); });
  })();
  function actualizaMinimapa(dt) {
    var ver = paseando; mini.wrap.hidden = !ver;
    if (ver !== mini.ver) { mini.ver = ver; if (ver && mini.mov) mini.mov.coloca(); }   // al aparecer, a su sitio guardado (o el de partida), fuera de los controles
    if (!paseando) { mini.rastro.length = 0; return; }
    var u = mini.rastro[mini.rastro.length - 1];
    if (u && Math.hypot(u[0] - pp.x, u[1] - pp.y) > 25) mini.rastro.length = 0;   // un salto (ir con alguien): el rastro empieza de nuevo, sin una raya de lado a lado
    if (!u || Math.hypot(u[0] - pp.x, u[1] - pp.y) > 2.5) { mini.rastro.push([pp.x, pp.y]); if (mini.rastro.length > 240) mini.rastro.shift(); }
    if (mini.sel) { mini.sel.t -= dt; if (mini.sel.t <= 0) { mini.sel = null; mini.t = 1; } }
    mini.t += dt; if (mini.oculto || mini.t < 0.08) return; mini.t = 0;   // oculto: sigue el rastro, pero no se pinta
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
    dibujaBalizasMini(c, X, Y, mini.bal); dibujaPerrosMini(c, X, Y);
    // los demás (solo con la presencia compartida): violeta con borde blanco, distinto de tu flecha naranja; en vista cercana, con su alias al lado
    mini.pts.length = 0;
    if (Presencia.activo()) {
      var gente = Presencia.puntos(), etiq = [];
      c.lineWidth = 1.4; c.strokeStyle = "#ffffff"; c.fillStyle = "#b26bff";
      gente.forEach(function (g) {
        var px = X(g.x), py = Y(g.y); if (px < -4 || px > MW + 4 || py < -4 || py > MH + 4) return;
        mini.pts.push({ id: g.id, px: px, py: py });
        c.beginPath();
        if (g.modo === 1) c.rect(px - 4, py - 4, 8, 8);   // en quad
        else if (g.modo === 2) { c.moveTo(px, py - 5.5); c.lineTo(px + 5.5, py); c.lineTo(px, py + 5.5); c.lineTo(px - 5.5, py); c.closePath(); }   // con el dron
        else c.arc(px, py, 4, 0, 6.283);
        c.fill(); c.stroke();
        var sel = mini.sel && mini.sel.id === g.id;
        if (sel || mini.cerca) etiq.push({ t: sel ? g.alias + " · toca otra vez para ir" : g.alias, px: px, py: py, sel: sel });
      });
      if (mini.sel && !mini.pts.some(function (p) { return p.id === mini.sel.id; })) mini.sel = null;   // ya no se ve: se olvida
      c.font = "600 10px system-ui, sans-serif"; c.textBaseline = "middle";
      etiq.forEach(function (e) {
        var w = c.measureText(e.t).width + 8, ex = Math.max(2, Math.min(MW - w - 2, e.px + 7)), ey = Math.max(8, Math.min(MH - 8, e.py));
        c.fillStyle = e.sel ? "rgba(178,107,255,0.92)" : "rgba(16,20,24,0.72)"; c.fillRect(ex, ey - 7, w, 14);
        c.fillStyle = "#ffffff"; c.textAlign = "left"; c.fillText(e.t, ex + 4, ey + 0.5);
      });
      c.textBaseline = "alphabetic";
    }
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


