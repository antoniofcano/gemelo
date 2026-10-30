// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: ladrido, perrosLlegan, amenazaConejo, actualizaPerros, dibujaPerrosMini
// Consume: 01_datos (D), 02_mundo (copas), 02c_componentes (Bus), 03_escena (camera, texColor), 04d_sombreado_tiles (hash),
//   07_follaje (matSombra, geoSombra), 12_paseo (paseando), 15_tiempo (esc),
//   16_vida (tVida, enQuad, gFauna, altSuelo, mira, conejos, quad, enDron, dron), 22_huellas (pendienteRumbo, emitePolvo, sueloSeco),
//   24_pantalla (aterriza)
// Nota: Publica además window.__perrosDebug (depuración).
// ===============================================================================
  // ---------- los perros del paseo: una dálmata adulta y un cruce de dálmata y mastín (rubio y sin manchas). Te siguen, exploran, persiguen conejos y vuelven a tu lado.
  var gPerros = new THREE.Group(); gFauna.add(gPerros);
  function texDalmata() {
    var cv = document.createElement("canvas"); cv.width = 256; cv.height = 128; var x = cv.getContext("2d"); x.fillStyle = "#f4f1ea"; x.fillRect(0, 0, 256, 128);
    for (var i = 0; i < 95; i++) { var r = 2.5 + 7 * hash(i * 3.7), px = 256 * hash(i * 5.1 + 2), py = 128 * hash(i * 9.3 + 7); x.fillStyle = hash(i * 1.9) < 0.12 ? "#5a3b2a" : "#1d1b1c"; x.beginPath(); x.ellipse(px, py, r, r * (0.7 + 0.5 * hash(i * 2.2)), hash(i) * 3, 0, 6.283); x.fill(); }
    var t = texColor(new THREE.CanvasTexture(cv)); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  var texD = texDalmata(), matNegroP = new THREE.MeshLambertMaterial({ color: 0x17151a });
  function creaPerro(tipo) {
    var dal = tipo === "dalmata", esc = dal ? 1 : 1.22, g = new THREE.Group(), cuerpo = new THREE.Group(); g.add(cuerpo);
    var mp = dal ? new THREE.MeshLambertMaterial({ map: texD }) : new THREE.MeshLambertMaterial({ color: 0xd9ac5c }), mo = dal ? new THREE.MeshLambertMaterial({ map: texD }) : new THREE.MeshLambertMaterial({ color: 0xb98a47 });
    function caja(w, h, d, m, x, y, z, padre) { var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); (padre || cuerpo).add(me); return me; }
    var anch = dal ? 1 : 1.18;
    caja(0.27 * anch, 0.29, 0.62, mp, 0, 0.55, 0.02); caja(0.29 * anch, 0.33, 0.27, mp, 0, 0.56, -0.2);
    var cuello = caja(0.15 * anch, 0.22, 0.2, mp, 0, 0.7, -0.38); cuello.rotation.x = -0.55;
    var cab = new THREE.Group(); cab.position.set(0, 0.79, -0.43); cuerpo.add(cab);
    caja(0.17 * anch, 0.16, 0.2, mp, 0, 0, -0.09, cab); caja((dal ? 0.1 : 0.13) * anch, dal ? 0.09 : 0.11, dal ? 0.15 : 0.13, mp, 0, -0.04, -0.24, cab); caja(0.05, 0.04, 0.04, matNegroP, 0, -0.01, -0.31, cab);
    [-1, 1].forEach(function (s) { var o = caja(0.045, dal ? 0.12 : 0.15, 0.09, mo, s * 0.09 * anch, 0.0, -0.05, cab); o.rotation.z = s * 0.35; caja(0.03, 0.03, 0.02, matNegroP, s * 0.05, 0.035, -0.19, cab); });
    var cola = new THREE.Group(); cola.position.set(0, 0.64, 0.32); cuerpo.add(cola); var c1 = caja(0.045, 0.045, 0.36, mp, 0, 0.1, 0.15, cola); c1.rotation.x = 0.75;
    var patas = [[-1, -0.2], [1, -0.2], [-1, 0.22], [1, 0.22]].map(function (q) {
      var pv = new THREE.Group(); pv.position.set(q[0] * 0.1 * anch, 0.45, q[1]); cuerpo.add(pv); caja(0.07, 0.46, 0.07, mp, 0, -0.23, 0, pv); caja(0.08, 0.05, 0.11, mp, 0, -0.46, -0.02, pv); return pv;
    });
    var sb = new THREE.Mesh(geoSombra, matSombra); sb.scale.set(0.9 * esc, 1, 1.4 * esc); sb.position.y = 0.03; g.add(sb);
    g.scale.setScalar(esc); g.visible = false; g.userData = { cuerpo: cuerpo, cab: cab, cola: cola, patas: patas }; gPerros.add(g); return g;
  }
  var PERROS = [
    { malla: creaPerro("dalmata"), nombre: "Olivia", vmax: 7.6, trote: 3.4, lado: 1, ladra: 0.28, color: "#f4f1ea" },
    { malla: creaPerro("cruce"), nombre: "Antoñin", vmax: 6.3, trote: 3.0, lado: -1, ladra: 0.16, color: "#d9ac5c" }
  ];
  function etiquetaNombre(txt) {   // el nombre flota sobre la cabeza y se lee a cierta distancia
    var cv = document.createElement("canvas"); cv.width = 256; cv.height = 72; var x = cv.getContext("2d"); x.font = "600 40px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = 8; x.lineJoin = "round"; x.strokeStyle = "rgba(20,24,16,0.85)"; x.strokeText(txt, 128, 38); x.fillStyle = "#ffffff"; x.fillText(txt, 128, 38);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texColor(new THREE.CanvasTexture(cv)), transparent: true, depthTest: false, depthWrite: false, fog: false })); sp.renderOrder = 9; sp.visible = false; gPerros.add(sp); return sp;
  }
  PERROS.forEach(function (d) { d.tag = etiquetaNombre(d.nombre); d.alto = d.nombre === "Olivia" ? 1.3 : 1.55; });
  PERROS.forEach(function (d, i) { d.x = 0; d.y = 0; d.ang = 0; d.v = 0; d.est = "fuera"; d.t = 0; d.fase = Math.random() * 6; d.obj = null; d.pit = 0; d.rol = 0; d.sentado = 0; d.ult = 0; d.idx = i; d.parado = 0; d.excit = 0; });
  var jugador = { x: 0, y: 0, v: 0, quieto: 0 }, jugAnt = null;
  function angCorto(a, b) { var d = (b - a) % 6.2832; if (d > 3.1416) d -= 6.2832; if (d < -3.1416) d += 6.2832; return d; }
  function ladrido(d) { Bus.emite("sonido:ladrido", { grave: d.idx === 1 }); }   // guau-guau: lo sintetiza quien atienda el evento (el sonido); sin él, calla
  function perrosLlegan() {   // cuando el muñequito aterriza, los perros salen de entre los olivos corriendo hacia él
    PERROS.forEach(function (d, i) { var a = (i ? 2.4 : 0.7) + Math.random() * 0.8; d.x = pp.x + Math.cos(a) * 24; d.y = pp.y + Math.sin(a) * 24; d.ang = Math.atan2(pp.y - d.y, pp.x - d.x); d.v = 0; d.est = "viene"; d.t = 0; d.obj = null; d.malla.visible = true; });
    setTimeout(function () { if (paseando && PERROS[0].est === "viene") ladrido(PERROS[0]); }, 900);
  }
  function conejoCerca(d, radio) {
    var mejor = null, md = radio; conejos.forEach(function (c) { if (!c.visible || c.userData.est === "fuera") return; var u = c.userData, q = Math.hypot(u.x - d.x, u.y - d.y); if (q < md) { md = q; mejor = c; } }); return mejor;
  }
  function distPerroMasCerca(x, y) { var m = 1e9; PERROS.forEach(function (d) { if (d.malla.visible) m = Math.min(m, Math.hypot(d.x - x, d.y - y)); }); return m; }
  function amenazaConejo(x, y) {   // un conejo huye de ti (más lejos si vas en quad) y de los perros que van deprisa
    var dj = Math.hypot(x - pp.x, y - pp.y); if (dj < (enQuad ? 17 : 8.5)) return { x: pp.x, y: pp.y };
    for (var i = 0; i < PERROS.length; i++) { var d = PERROS[i]; if (!d.malla.visible) continue; var q = Math.hypot(x - d.x, y - d.y); if (q < (d.v > 2.5 ? 9 : 3.5)) return { x: d.x, y: d.y }; }
    return null;
  }
  function actualizaPerros(dt) {
    if (!paseando) { PERROS.forEach(function (d) { d.malla.visible = false; d.tag.visible = false; d.est = "fuera"; }); jugAnt = null; return; }
    var vj = jugAnt ? Math.hypot(pp.x - jugAnt[0], pp.y - jugAnt[1]) / Math.max(dt, 1e-3) : 0; jugAnt = [pp.x, pp.y]; jugador.v += (vj - jugador.v) * Math.min(1, dt * 5); jugador.quieto = jugador.v < 0.25 ? jugador.quieto + dt : 0;
    var fx = Math.sin(pp.ang), fy = Math.cos(pp.ang), rx = Math.cos(pp.ang), ry = -Math.sin(pp.ang), e = D.ext, rad = Math.PI / 180;
    PERROS.forEach(function (d, k) {
      if (d.est === "fuera") return;
      d.t -= dt; d.ult -= dt; var dj = Math.hypot(pp.x - d.x, pp.y - d.y), vmax = d.vmax * (enQuad ? 1.25 : 1), destX = pp.x, destY = pp.y, vel = 0, mira = false;
      // las decisiones
      if (enDron && d.est !== "viene" && dj < 14) { d.est = "mira"; d.t = 1; }
      else if (d.est === "mira" && !enDron) { d.est = "viene"; }
      else if (d.est === "sigue") {
        if (dj > 17) d.est = "viene";
        else if (jugador.quieto > 5 && dj < 5) { d.est = "descansa"; d.t = 6 + Math.random() * 8; }
        else if (d.t <= 0) { var cj = conejoCerca(d, 26); if (cj && Math.random() < 0.65) { d.est = "persigue"; d.obj = cj; d.t = 6.5; if (Math.random() < d.ladra * 3) ladrido(d); } else { var a = Math.random() * 6.283, r = 5 + Math.random() * 6; d.obj = { x: pp.x + Math.cos(a) * r, y: pp.y + Math.sin(a) * r }; d.est = "explora"; d.t = 7; } }
      } else if (d.est === "explora") { if (dj > 22 || d.t <= 0) d.est = "viene"; else if (Math.hypot(d.obj.x - d.x, d.obj.y - d.y) < 1.2) { d.est = "olfatea"; d.t = 1.6 + Math.random(); } }
      else if (d.est === "olfatea") { if (d.t <= 0) { d.est = "sigue"; d.t = 3 + Math.random() * 5; } }
      else if (d.est === "persigue") {
        var u = d.obj && d.obj.userData; if (!u || !d.obj.visible || u.est === "fuera" || d.t <= 0 || dj > 32) { d.est = "viene"; }
        else if (Math.hypot(u.x - d.x, u.y - d.y) < 1.15) { d.est = "frustra"; d.t = 0.9; u.est = "huye"; u.t = 2.2; u.dir += (Math.random() < 0.5 ? 1 : -1) * 1.6; }   // por los pelos: el conejo se escurre
      } else if (d.est === "frustra") { if (d.t <= 0) d.est = "viene"; }
      else if (d.est === "viene") { if (dj < 3.6) { d.est = "sigue"; d.t = 3 + Math.random() * 5; } }
      else if (d.est === "descansa") { if (jugador.v > 0.5 || dj > 6.5 || d.t <= 0) { d.est = "sigue"; d.t = 2; } }
      // adónde van y a qué velocidad
      if (d.est === "viene") { vel = Math.min(vmax, 1.7 * dj + 1); }
      else if (d.est === "sigue") { destX = pp.x + fx * 1.6 + rx * 2.7 * d.lado; destY = pp.y + fy * 1.6 + ry * 2.7 * d.lado; var dd = Math.hypot(destX - d.x, destY - d.y); vel = dd < 0.9 ? 0 : Math.min(d.trote + jugador.v * 0.9, vmax, 1.6 * dd + 0.6); }
      else if (d.est === "explora") { destX = d.obj.x; destY = d.obj.y; vel = d.trote * 1.2; }
      else if (d.est === "persigue" && d.obj) { destX = d.obj.userData.x; destY = d.obj.userData.y; vel = vmax; }
      else if (d.est === "frustra") { vel = Math.max(0, d.v - 9 * dt); destX = d.x + Math.cos(d.ang); destY = d.y + Math.sin(d.ang); }
      else { vel = 0; mira = true; }
      // el giro y el movimiento
      if (vel > 0.05) { var objAng = Math.atan2(destY - d.y, destX - d.x); d.ang += angCorto(d.ang, objAng) * Math.min(1, dt * (vel > 4 ? 6 : 9)); }
      var pend = pendienteRumbo(d.x, d.y, Math.PI / 2 - d.ang)[0]; var fac = Math.max(0.5, Math.min(1.2, 1 - 0.9 * pend));
      d.v += (vel * fac - d.v) * Math.min(1, dt * (vel > d.v ? 4 : 7));
      var nx = d.x + Math.cos(d.ang) * d.v * dt, ny = d.y + Math.sin(d.ang) * d.v * dt;
      for (var i = 0; i < copas.length; i++) { var c = copas[i]; if (!c.oliv) continue; var ex = nx - c.x, ey = ny - c.y; if (ex * ex + ey * ey < 0.5 * 0.5) { var dn = Math.sqrt(ex * ex + ey * ey) || 0.001; nx = c.x + ex / dn * 0.5; ny = c.y + ey / dn * 0.5; } }
      d.x = Math.max(e[0] + 3, Math.min(e[2] - 3, nx)); d.y = Math.max(e[3] + 3, Math.min(e[1] - 3, ny));
      // el cuerpo: zancada, inclinación con el terreno, cola y cabeza
      var m = d.malla, u2 = m.userData, ang2 = Math.PI / 2 - d.ang, gy = altSuelo(d.x, d.y), pe = pendienteRumbo(d.x, d.y, ang2), sp = Math.min(1, d.v / 5.5);
      d.fase += dt * (4 + d.v * 2.1); d.pit += (Math.atan(pe[0]) - d.pit) * Math.min(1, dt * 7); d.rol += (Math.atan(pe[1]) - d.rol) * Math.min(1, dt * 7);
      d.sentado += ((d.est === "descansa" || d.est === "mira" ? 1 : 0) - d.sentado) * Math.min(1, dt * 4);
      var ampl = 0.95 * sp, g1 = Math.sin(d.fase) * ampl, g2 = Math.sin(d.fase + 0.55) * ampl, g3 = Math.sin(d.fase + 3.3) * ampl, g4 = Math.sin(d.fase + 3.85) * ampl, sen = d.sentado;
      u2.patas[0].rotation.x = g1 * (1 - sen); u2.patas[1].rotation.x = g2 * (1 - sen); u2.patas[2].rotation.x = g3 * (1 - sen) - 1.15 * sen; u2.patas[3].rotation.x = g4 * (1 - sen) - 1.15 * sen;
      u2.cuerpo.rotation.x = -0.5 * sen + Math.sin(d.fase * 2) * 0.05 * sp; u2.cuerpo.position.y = -0.2 * sen + Math.abs(Math.sin(d.fase)) * 0.05 * sp;
      d.excit += (((d.est === "persigue" || d.est === "viene" || d.est === "frustra" || dj < 5) ? 1 : 0.35) - d.excit) * Math.min(1, dt * 3);
      u2.cola.rotation.y = Math.sin(tVida * 15 + k * 2) * 0.55 * d.excit; u2.cola.rotation.x = d.est === "persigue" ? -0.5 : sp > 0.5 ? -0.25 : 0.2;
      u2.cab.rotation.x = d.est === "olfatea" ? 0.55 + Math.sin(tVida * 5) * 0.12 : d.est === "mira" ? -0.7 : d.est === "persigue" ? 0.08 : Math.sin(tVida * 1.2 + k) * 0.06;
      u2.cab.rotation.y = mira && d.est !== "mira" ? Math.sin(tVida * 0.8 + k * 3) * 0.5 : 0;
      d.tag.position.set(d.x, gy + d.alto, -d.y); var dc = camera.position.distanceTo(d.tag.position), es = Math.max(1, dc / 8); d.tag.scale.set(1.45 * es, 0.41 * es, 1); d.tag.material.opacity = Math.max(0, Math.min(1, (28 - dc) / 8)); d.tag.visible = m.visible && dc < 28;
      m.position.set(d.x, gy + 0.02, -d.y); m.rotation.set(d.pit, d.ang - Math.PI / 2, d.rol, "YXZ");
      // polvo al arrancar fuerte y al ladrar cuando mira el dron
      if (d.v > 5 && sueloSeco(d.x, d.y) && Math.random() < dt * 9) emitePolvo(d.x - Math.cos(d.ang) * 0.5, d.y - Math.sin(d.ang) * 0.5, gy + 0.1, -Math.cos(d.ang) * 0.6, 0.5, -Math.sin(d.ang) * 0.6, 0.35, 0.8);
      if (d.est === "mira" && d.ult <= 0 && Math.random() < dt * 0.25) { d.ult = 4; ladrido(d); }
    });
  }
  function dibujaPerrosMini(c, X, Y) {
    PERROS.forEach(function (d) { if (!d.malla.visible || d.est === "fuera") return; c.fillStyle = d.color; c.strokeStyle = "#101418"; c.lineWidth = 1.4; c.beginPath(); c.arc(X(d.x), Y(d.y), 3.3, 0, 6.283); c.fill(); c.stroke(); });
  }
  window.__perrosDebug = function () { return PERROS.map(function (d) { return { n: d.nombre, est: d.est, v: +d.v.toFixed(1), dj: +Math.hypot(pp.x - d.x, pp.y - d.y).toFixed(1), vis: d.malla.visible }; }); };
