// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Llegada
// Consume: 01_datos (D, $), 02_mundo (suelo, copas), 03_escena (lienzo, visor, scene, camera, exag), 12_paseo (paseando, camPos, entraPaseo),
//   16_vida (enDron, ponDron), 24_pantalla (Pantalla), 29_vr (VRX, vrFundido, vrAparece)
// Nota: Publica además window.__llegada (pruebas). El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/llegada.test.js.
// ===============================================================================
  // ---------- la llegada: el anillo en el suelo adonde quieres ir y el salto hasta él (de pie, fuera de troncos, a la altura del suelo, andando).
  // Una sola pieza para la VR y la pantalla:
  //   · VR (29_vr.js), volando o en el mirador: palanca derecha ↑ mantenida = rayo recto del mando al suelo y anillo; al soltar, fundido y de pie en el anillo.
  //   · Pantalla (con el Dron de 16_vida.js): un clic o un toque corto en el suelo pone el anillo (otro lo mueve; arrastrar no lo pone); «Aterrizar aquí»,
  //     Intro o L te deja de pie en él con un fundido corto; sin anillo, aterrizar guarda el Dron como siempre.
  // El suelo es el de la CPU (suelo()·exag), no el relieve dibujado del tileset. Nada se mueve sin que el usuario lo pida y el salto va con fundido (~0,3 s), nunca con vuelo de cámara.
  // aparece(x, y, ang) y ve(x, y, ang) (con fundido) los puede usar cualquier otro módulo para «aparecer en (x, y) mirando a ang» (p. ej. ir con otro visitante).
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/llegada.test.js)
  var LlegadaPuro = (function () {
    var MAX = 2500, MARGEN = 3, TOQUE_MS = 400, TOQUE_PX = { mouse: 6, pen: 8, touch: 12 };
    // ¿(x, z) de la escena (z = −norte) dentro de D.ext = [x0, yNorte, x1, ySur], con 3 m de margen (como el paseo y el teletransporte a pie)?
    function dentro(x, z, e) { var y = -z; return x >= e[0] + MARGEN && x <= e[2] - MARGEN && y >= e[3] + MARGEN && y <= e[1] - MARGEN; }
    // rayo (origen o, dirección d) contra el suelo alto(x, z) (m de la escena, ya con exageración). Avanza a pasos de la mitad de la altura que le queda
    // (0,5–25 m) y afina con bisección. Devuelve { x, y, z, dist } o null si apunta hacia arriba, no toca suelo en `max` m o cae fuera de la finca.
    function rayoSuelo(o, d, alto, ext, max) {
      var l = Math.hypot(d.x, d.y, d.z); if (!(l > 0)) return null;
      var dx = d.x / l, dy = d.y / l, dz = d.z / l; max = max || MAX;
      if (dy > -0.02) return null;
      var t = 0, prev = 0, h = o.y - alto(o.x, o.z);
      if (!(h > 0)) return null;
      while (t < max) {
        prev = t; t = Math.min(max, t + Math.max(0.5, Math.min(25, h * 0.5)));
        h = o.y + dy * t - alto(o.x + dx * t, o.z + dz * t);
        if (h <= 0) {
          var a = prev, b = t;
          for (var k = 0; k < 16; k++) { var m = (a + b) / 2; if (o.y + dy * m - alto(o.x + dx * m, o.z + dz * m) > 0) a = m; else b = m; }
          var tt = (a + b) / 2, px = o.x + dx * tt, pz = o.z + dz * tt;
          return dentro(px, pz, ext) ? { x: px, y: alto(px, pz), z: pz, dist: tt } : null;
        }
      }
      return null;
    }
    // ¿el punto p está a la vista desde c mirando hacia `mirada`? (sin anillo por detrás del usuario: ángulo con la mirada menor de ~96°)
    function delante(c, mirada, p) {
      var vx = p.x - c.x, vy = p.y - c.y, vz = p.z - c.z, l = Math.hypot(vx, vy, vz), lm = Math.hypot(mirada.x, mirada.y, mirada.z);
      if (!(l > 0) || !(lm > 0)) return true;
      return (vx * mirada.x + vy * mirada.y + vz * mirada.z) / (l * lm) > -0.1;
    }
    // radio del anillo (m) según la distancia a quien observa: ~1,4° de ángulo, entre 0,4 y 30 m (se ve desde el aire y no tapa de cerca)
    function radioMarca(dist) { return Math.max(0.4, Math.min(30, dist * 0.025)); }
    // aparta (x, z) de los troncos de olivo (copas: { x, y = norte, oliv }) a r m (0,55, como al andar)
    function fueraDeTroncos(x, z, copas, r) {
      r = r || 0.55; var r2 = r * r;
      for (var i = 0; i < copas.length; i++) {
        var c = copas[i]; if (!c.oliv) continue; var ex = x - c.x, ez = z + c.y, d2 = ex * ex + ez * ez;
        if (d2 < r2) { if (d2 === 0) { ex = 1; ez = 0; d2 = 1; } var dl = Math.sqrt(d2); x = c.x + ex / dl * r; z = -c.y + ez / dl * r; }
      }
      return { x: x, z: z };
    }
    // ¿un clic/toque (y no un arrastre ni una pulsación larga)? mov: lo más lejos (px) que se fue el puntero desde que bajó; ms: lo que duró
    function esToque(mov, ms, tipo) { return mov <= (TOQUE_PX[tipo] || TOQUE_PX.mouse) && ms <= TOQUE_MS; }
    return { rayoSuelo: rayoSuelo, delante: delante, radioMarca: radioMarca, fueraDeTroncos: fueraDeTroncos, dentro: dentro, esToque: esToque, MAX: MAX, TOQUE_MS: TOQUE_MS, TOQUE_PX: TOQUE_PX };
  })();
  // [puro:fin]
  var Llegada = (function () {
    var COLOR = 0xffc94a;   // ámbar: distinto del anillo cian que señala la sombra del Dron y de la parábola del teletransporte a pie
    var anillo = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLOR, fog: false, transparent: true, forceSinglePass: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    anillo.visible = false; anillo.renderOrder = 5; scene.add(anillo);
    var p = null, radio = 0, n = 0, ultimo = null, ocupado = false, rayo = new THREE.Raycaster(), ndc = new THREE.Vector2();
    var alto = function (x, z) { return suelo(x, -z) * exag; };
    // el velo de la pantalla (fuera de VR): un negro que se funde en 0,15 s, salta y se aclara en otros 0,15 s
    var velo = document.createElement("div"); velo.setAttribute("aria-hidden", "true");
    velo.style.cssText = "position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .15s linear;z-index:5";
    if (visor) visor.appendChild(velo);
    function coloca(desde) {
      anillo.visible = !!p; if (!p) return;
      radio = LlegadaPuro.radioMarca(Math.hypot(p.x - desde.x, p.y - desde.y, p.z - desde.z)); anillo.scale.setScalar(radio); anillo.position.set(p.x, p.y + 0.08 + radio * 0.02, p.z);
    }
    // apunta un rayo (o, d) al suelo; con `mirada`, descarta lo que cae por detrás de quien observa desde `desde`. Pone (o borra) el anillo y devuelve el punto o null
    function apunta(o, d, desde, mirada) {
      var q = LlegadaPuro.rayoSuelo(o, d, alto, D.ext);
      if (q && mirada && !LlegadaPuro.delante(desde, mirada, q)) q = null;
      p = q; coloca(desde); return q;
    }
    // desde la pantalla: el rayo de la cámara por el píxel (cx, cy) del lienzo
    function apuntaPantalla(cx, cy) {
      var r = lienzo.getBoundingClientRect(); if (!r.width || !r.height) return null;
      ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); camera.updateMatrixWorld(); rayo.setFromCamera(ndc, camera);
      var q = LlegadaPuro.rayoSuelo(rayo.ray.origin, rayo.ray.direction, alto, D.ext);
      if (q) { p = q; coloca(camera.position); }   // un toque fuera de la finca o al cielo no borra el anillo que ya había
      return q;
    }
    function borra() { p = null; anillo.visible = false; }
    function fundePantalla(fn) {
      if (ocupado) return false; ocupado = true; velo.style.opacity = "1";
      setTimeout(function () { try { fn(); } finally { velo.style.opacity = "0"; setTimeout(function () { ocupado = false; }, 160); } }, 160);
      return true;
    }
    function funde(fn) { return VRX.on ? vrFundido(fn) : fundePantalla(fn); }
    // aparecer de pie en (x, y) del mundo (y = norte), fuera de troncos y dentro de la finca, mirando a ang (ángulo del paseo: 0 = norte; si se omite, se conserva)
    function aparece(x, y, ang) {
      var e = D.ext; x = Math.max(e[0] + 3, Math.min(e[2] - 3, x)); y = Math.max(e[3] + 3, Math.min(e[1] - 3, y));
      var f = LlegadaPuro.fueraDeTroncos(x, -y, copas); x = f.x; y = -f.z; n++; ultimo = [x, y];
      if (VRX.on) { vrAparece(x, y, ang); return; }
      if (!paseando) entraPaseo();
      if (enDron) ponDron(false);
      pp.x = x; pp.y = y; if (ang !== undefined && ang !== null) pp.ang = ang;
      var gy = suelo(x, y) * exag, fx = Math.sin(pp.ang), fy = Math.cos(pp.ang);
      camPos.set(x - fx * 4.4, gy + 2.3, -(y - fy * 4.4));   // la cámara de seguimiento ya detrás, sin recorrer el camino
    }
    function ve(x, y, ang) { return funde(function () { aparece(x, y, ang); }); }
    // al anillo (si lo hay): fundido y de pie en él
    function alAnillo() { if (!p) return false; var q = p; borra(); return ve(q.x, -q.z); }
    // --- la pantalla con el Dron: clic o toque corto en el suelo = anillo; «Aterrizar aquí» / Intro / L
    var boton = $("padAterriza");
    function rotula() { if (!boton) return; boton.textContent = p ? "Aterrizar aquí" : "Aterrizar"; boton.setAttribute("aria-label", p ? "Aterrizar en el anillo marcado" : "Aterrizar: guardar el Dron donde estás"); }
    function conDron(on) { borra(); if (boton) boton.hidden = !on; rotula(); }
    function aterrizaConDron() { if (!enDron) return; if (p) alAnillo(); else ponDron(false); }
    function porFotograma() { if (p && !VRX.on) coloca(camera.position); }
    var toque = null;
    lienzo.addEventListener("pointerdown", function (e) {
      if (!paseando || !enDron || VRX.on) { toque = null; return; }
      toque = toque ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), tipo: e.pointerType, mov: 0 };   // un segundo dedo: es un gesto, no un toque
    });
    lienzo.addEventListener("pointermove", function (e) { if (toque && e.pointerId === toque.id) toque.mov = Math.max(toque.mov, Math.hypot(e.clientX - toque.x, e.clientY - toque.y)); });
    lienzo.addEventListener("pointerup", function (e) {
      if (!toque || e.pointerId !== toque.id) return; var t = toque; toque = null;
      t.mov = Math.max(t.mov, Math.hypot(e.clientX - t.x, e.clientY - t.y));
      if (enDron && LlegadaPuro.esToque(t.mov, performance.now() - t.t, t.tipo) && apuntaPantalla(e.clientX, e.clientY)) rotula();
    });
    lienzo.addEventListener("pointercancel", function () { toque = null; });
    if (boton) boton.addEventListener("click", aterrizaConDron);
    window.addEventListener("keydown", function (e) {
      if (!paseando || !enDron || VRX.on || (e.code !== "Enter" && e.code !== "NumpadEnter" && e.code !== "KeyL")) return;
      var t = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || t === "BUTTON" || t === "A") return;   // Intro sobre un botón es su clic
      e.preventDefault(); aterrizaConDron();
    });
    window.__llegada = function () { return { punto: p ? [p.x, p.y, p.z] : null, radio: radio, visible: anillo.visible, ultimo: ultimo, n: n, fundiendo: ocupado, paseando: paseando, enDron: enDron, pp: [pp.x, pp.y, pp.ang], boton: boton ? { hidden: boton.hidden, texto: boton.textContent } : null }; };
    return { anillo: anillo, apunta: apunta, apuntaPantalla: apuntaPantalla, borra: borra, punto: function () { return p; }, aparece: aparece, ve: ve, alAnillo: alAnillo, funde: funde, conDron: conDron, porFotograma: porFotograma, aterrizaConDron: aterrizaConDron };
  })();
