  // ---------- las balizas: una por parcela, con lo que OlivarTrack sabe de ella; en el paseo, al acercarte, sale su ficha
  // Los datos son los de la historia (instantánea embebida, o la lectura en vivo por el MCP si se ha pulsado «Leer de OlivarTrack»).
  var gBal = new THREE.Group(); scene.add(gBal);
  var COLB = { alerta: 0xff4d3d, abierta: 0xffb02e, hecha: 0x35d07f, nada: 0x9aa4ad };
  var uBaliza = { uT: { value: 0 } };
  var BAL = parcelas.map(function (pr, k) {
    var col = new THREE.Color(COLB.nada), g = new THREE.Group();
    var mat = new THREE.ShaderMaterial({
      uniforms: { uT: uBaliza.uT, uColor: { value: col }, uPulso: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: "varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uT; uniform vec3 uColor; uniform float uPulso; varying float vY;\n" +
        "void main(){ float t = clamp(vY / 26.0 + 0.5, 0.0, 1.0); float a = (0.42 * (1.0 - t) + 0.04) * (0.8 + 0.2 * sin(uT * 3.0 + uPulso * 6.0 * t)) * (1.0 + uPulso * 0.5 * sin(uT * 7.0)); gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.7)); }"
    });
    var col3 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 26, 14, 1, true), mat); col3.position.y = 13; g.add(col3);
    var rombo = new THREE.Mesh(new THREE.OctahedronGeometry(1.05), new THREE.MeshBasicMaterial({ color: col, fog: false })); rombo.position.y = 27.5; g.add(rombo);
    var anillo = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.2, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false })); anillo.rotation.x = -Math.PI / 2; anillo.position.y = 0.2; g.add(anillo);
    g.userData = { k: k, mat: mat, col: col, rombo: rombo, anillo: anillo, estado: "nada", visita: false };
    gBal.add(g); return g;
  });
  var balCerca = -1, balVisitas = 0, balSig = "";
  function nombreParcelaIA(x) { return String(x || "").toLowerCase(); }
  function vigiaMarca(pr) {
    var v = VIVO && VIVO.vigia; if (!v) return null; var m = nombreParcelaIA(pr.nombre);
    var r = v.filter(function (x) { var n = nombreParcelaIA(x.parcela); return n && (n === m || n.indexOf(m) >= 0 || m.indexOf(n) >= 0); }); return r.length ? r[0] : null;
  }
  function datosBal(k) {
    var pr = parcelas[k], d = (OT && OT.parcelas && OT.parcelas[pr.id]) || { tareas: [], fenologia: [] }, vg = vigiaMarca(pr);
    var abiertas = (d.tareas || []).filter(function (t) { return t.estado !== "completado" && t.estado !== "cancelado" && t.estado !== "anulado"; });
    var hechas = (d.tareas || []).filter(function (t) { return t.estado === "completado"; }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
    var estado = vg ? "alerta" : abiertas.length ? "abierta" : hechas.length ? "hecha" : "nada";
    return { pr: pr, abiertas: abiertas, hechas: hechas, fen: (d.fenologia || []).slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); })[0] || null, vg: vg, estado: estado };
  }
  function refrescaBalizas() {
    BAL.forEach(function (g) {
      var u = g.userData, d = datosBal(u.k); u.estado = d.estado; u.col.setHex(COLB[d.estado]); u.rombo.material.color.setHex(COLB[d.estado]); u.anillo.material.color.setHex(COLB[d.estado]); u.mat.uniforms.uPulso.value = d.estado === "alerta" ? 1 : 0;
    });
  }
  function colocaBalizas() { BAL.forEach(function (g) { var pr = parcelas[g.userData.k]; g.position.set(pr.centro[0], suelo(pr.centro[0], pr.centro[1]) * exag, -pr.centro[1]); }); refrescaBalizas(); }
  var BBCH_TXT = { 7: "desarrollo del fruto", 8: "maduración del fruto", 6: "floración", 5: "aparición de la inflorescencia", 1: "desarrollo de las hojas", 0: "reposo y brotación", 9: "senescencia y reposo" };
  function fichaBal(k) {
    var d = datosBal(k), pr = d.pr, h = "";
    var pill = { alerta: ["Vigía pide una mirada", "var(--guardado)"], abierta: ["Hay tareas abiertas", "var(--guardado)"], hecha: ["Sin tareas abiertas", "var(--olivo)"], nada: ["Sin datos de tareas", "var(--muted)"] }[d.estado];
    h += '<div class="b-cab"><strong>' + esc(pr.nombre) + '</strong><span class="b-pill" style="--c:' + pill[1] + '">' + pill[0] + "</span></div>";
    h += '<p class="b-sub">' + num1(pr.ha, 1) + " ha</p>";
    if (d.vg) h += '<p class="b-aviso">Vigía marca esta parcela hoy (' + esc(d.vg.gravedad || "pide una mirada") + "). Es relativo y sin calibrar: sirve para decidir dónde mirar, no para decir que algo está enfermo.</p>";
    if (d.abiertas.length) h += "<h4>Abiertas</h4><ul>" + d.abiertas.slice(0, 3).map(function (t) { return "<li>" + esc(t.titulo) + ' <span class="b-n">' + (t.avance != null ? num1(t.avance, 0) + " %" : t.estado) + "</span></li>"; }).join("") + "</ul>";
    if (d.hechas.length) h += "<h4>Hecho hace poco</h4><ul>" + d.hechas.slice(0, 2).map(function (t) { return "<li>" + esc(t.titulo) + ' <span class="b-n">' + esc(String(t.fecha).slice(8, 10) + "/" + String(t.fecha).slice(5, 7)) + (t.andados != null && t.objetivo ? " · " + t.andados + " de " + t.objetivo + " olivos" : "") + "</span></li>"; }).join("") + "</ul>";
    if (d.fen) h += '<h4>Fenología</h4><p class="b-sub">BBCH ' + d.fen.bbch + " · " + (BBCH_TXT[Math.floor(d.fen.bbch / 10)] || "") + " · " + esc(String(d.fen.fecha).slice(8, 10) + "/" + String(d.fen.fecha).slice(5, 7)) + "</p>";
    var fch = OT && OT.fecha_consulta ? String(OT.fecha_consulta).slice(8, 10) + "/" + String(OT.fecha_consulta).slice(5, 7) : "?", fuente = OT && OT.fuente === "vivo" ? "OlivarTrack, leído en vivo el " + fch : "OlivarTrack, instantánea del " + fch;
    h += '<p class="b-pie">' + fuente + " · balizas visitadas " + balVisitas + " de " + BAL.length + (balVisitas === BAL.length ? " · inspección completa" : "") + "</p>";
    return h;
  }
  function dibujaBalizasMini(c, X, Y) {
    BAL.forEach(function (g) {
      var pr = parcelas[g.userData.k], x = X(pr.centro[0]), y = Y(pr.centro[1]);
      c.fillStyle = "#" + ("000000" + COLB[g.userData.estado].toString(16)).slice(-6); c.strokeStyle = "#101418"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 4.5, y); c.lineTo(x, y + 6); c.lineTo(x - 4.5, y); c.closePath(); c.fill(); c.stroke();
      if (g.userData.visita) { c.strokeStyle = "#ffffff"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x - 0.5, y + 2); c.lineTo(x + 2.5, y - 2); c.stroke(); }
    });
  }
  var tBal = 0, ultFicha = -2;
  function actualizaBalizas(dt) {
    uBaliza.uT.value = tVida; tBal += dt;
    var firma = (OT && OT.fecha_consulta) + "|" + (OT === D.ot ? "i" : "v") + "|" + (VIVO ? (VIVO.vigia ? VIVO.vigia.length : "x") : "n");
    if (firma !== balSig) { balSig = firma; refrescaBalizas(); ultFicha = -2; }
    BAL.forEach(function (g, i) {
      var u = g.userData; u.rombo.rotation.y += dt * 1.4; u.rombo.position.y = 27.5 + Math.sin(tVida * 1.8 + i) * 0.5;
      u.anillo.scale.setScalar(1 + 0.12 * Math.sin(tVida * 3 + i * 2)); g.visible = true;
    });
    if (!paseando) { $("baliza").hidden = true; balCerca = -1; return; }
    if (TR.act && TR.t < TR.tCae + 0.4) { $("baliza").hidden = true; return; }   // la ficha espera a que el muñequito aterrice
    var mejor = -1, md = 1e9; BAL.forEach(function (g, i) { var pr = parcelas[g.userData.k], d = Math.hypot(pr.centro[0] - (enDron ? dr.x : pp.x), pr.centro[1] - (enDron ? dr.y : pp.y)); if (d < md) { md = d; mejor = i; } });
    var dentro = mejor >= 0 && md < 17;
    if (dentro) {
      if (!BAL[mejor].userData.visita) { BAL[mejor].userData.visita = true; balVisitas = BAL.filter(function (g) { return g.userData.visita; }).length; if (typeof sonidoBaliza === "function") sonidoBaliza(balVisitas === BAL.length); ultFicha = -2; }
      if (mejor !== ultFicha || tBal > 2) { tBal = 0; ultFicha = mejor; $("baliza").innerHTML = fichaBal(BAL[mejor].userData.k); }
      $("baliza").hidden = false; balCerca = mejor;
    } else { $("baliza").hidden = true; balCerca = -1; ultFicha = -2; }
  }


