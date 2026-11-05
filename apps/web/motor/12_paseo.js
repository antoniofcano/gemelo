// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: paseando, persona, teclas, primera, pp, camPos, PalancaPuro, ponPalanca, giraPalanca, entraPaseo, salePaseo, actualizaPaseo
// Consume: 01_datos (D, $), 02_mundo (suelo, copaAlta, copas), 03_escena (lienzo, visor, scene, camera, exag, modo), 06_arboles (tronco),
//   08_marcadores (aplica, pendiente), 09_camara (sensMirar), 12c_ir_a (IrA), 13_parcelas (fincas, fincaSel, parcelaSel),
//   16_vida (enQuad, mira, quad, velPaseo, giroPaseo, ponQuad, vidaPaseo, enDron, dron, ponDron, cicloVista, dronMando, camaraDron, vidaEntra, vidaSale),
//   24_pantalla (iniciaTransicion, iniciaSalida), 29_vr (ficha), 33_ajustes (Ajustes)
// ===============================================================================

  // ---------- paseo: una persona que camina por el olivar (flechas o WASD; Mayús corre; V cambia de cámara)
  var paseando = false, persona = null, teclas = {}, primera = false, pp = { x: 0, y: 0, ang: 0, paso: 0 }, camPos = new THREE.Vector3();
  // AV2 (decisión 133): «Altura de la vista» en Configuración (vista.altura): de pie (ojos a 1,62 m, como siempre) o sentado (1,20 m); independiente del avatar. Sin Configuración, de pie.
  var OJOS_PIE = 1.62, OJOS_SENTADO = 1.2;
  function alturaOjos() { return typeof Ajustes !== "undefined" && Ajustes.lee && Ajustes.lee("vista.altura") === "sentado" ? OJOS_SENTADO : OJOS_PIE; }
  function creaPersona() {
    var g = new THREE.Group(), mt = function (c) { return new THREE.MeshLambertMaterial({ color: c }); };
    var piel = mt(0xd6a27a), camisa = mt(0xe28a1c), pant = mt(0x37455c), gorra = mt(0x2e5d34);
    function caja(w, h, d, m, x, y, z) { var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); g.add(me); }
    function miembro(w, h, d, m, px, py, pz) { var pv = new THREE.Group(); pv.position.set(px, py, pz); var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.y = -h / 2; pv.add(me); g.add(pv); return pv; }
    caja(0.46, 0.62, 0.25, camisa, 0, 1.17, 0);
    var cab = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), piel); cab.position.set(0, 1.6, 0); g.add(cab);
    var gor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.08, 14), gorra); gor.position.set(0, 1.72, 0); g.add(gor);
    caja(0.2, 0.025, 0.12, gorra, 0, 1.69, -0.15);
    g.userData = { pi: miembro(0.17, 0.86, 0.2, pant, -0.12, 0.86, 0), pd: miembro(0.17, 0.86, 0.2, pant, 0.12, 0.86, 0), bi: miembro(0.11, 0.58, 0.12, camisa, -0.3, 1.46, 0), bd: miembro(0.11, 0.58, 0.12, camisa, 0.3, 1.46, 0) };
    return g;
  }
  // ---------- la palanca (EV2-B1, doc/sistema/VIABILIDAD-INTERACCION.md §B): lo puro para andar con un pulgar, sin THREE ni DOM (lo evalúa en Node pruebas/guardianes/palanca.test.js).
  // Una palanca da un vector (x a la derecha, y hacia delante, de −1 a 1 sobre su radio). Aquí se vuelve «cuánto avanzo, cuánto me desplazo de lado»:
  // zona muerta del 15 % (el pulgar tiembla), después velocidad proporcional al desplazamiento (0 en el borde de la zona muerta, 1 al saturar el radio)
  // y la dirección es la del dedo relativa a la cámara de seguimiento, que va siempre detrás del paseante (mira hacia pp.ang).
  // [puro:inicio]
  var PalancaPuro = (function () {
    var ZONA_MUERTA = 0.15;
    // x, y: vector de la palanca (y > 0 = empujar hacia delante). Devuelve { fuerza 0..1, av −1..1 (avance), lat −1..1 (a la derecha) }
    function lee(x, y) {
      x = +x || 0; y = +y || 0;
      var m = Math.sqrt(x * x + y * y); if (!(m > ZONA_MUERTA)) return { fuerza: 0, av: 0, lat: 0 };
      var f = Math.min(1, (m - ZONA_MUERTA) / (1 - ZONA_MUERTA));   // proporcional: continuo en el borde de la zona muerta y saturado en 1
      return { fuerza: f, av: y / m * f, lat: x / m * f };
    }
    // el paso en el mundo (x al este, y al norte) mirando hacia ang (rad; 0 = norte, crece hacia el este): av al frente, lat a la derecha
    function mundo(av, lat, ang) { var s = Math.sin(ang), c = Math.cos(ang); return { x: av * s + lat * c, y: av * c - lat * s }; }
    // giro al arrastrar la otra mitad: píxeles → radianes, con la sensibilidad de Configuración (la de la órbita: 0,006 rad/px)
    function giro(dxPx, sens) { return (+dxPx || 0) * 0.006 * (+sens > 0 ? +sens : 1); }
    // ¿se enciende la palanca? tactil: ¿pantalla táctil? (Ajustes.tactil); ajuste: «controles.palanca»; busqueda: location.search.
    // Encendida por defecto en táctil; ?palanca=0 la apaga y ?palanca=1 la fuerza (para probar con ratón); en escritorio sin táctil, nada.
    function activa(tactil, ajuste, busqueda) {
      var m = /[?&]palanca=([01])(?![0-9A-Za-z])/.exec(busqueda || "");
      if (m) return m[1] === "1";
      return !!tactil && ajuste !== false;
    }
    return { ZONA_MUERTA: ZONA_MUERTA, lee: lee, mundo: mundo, giro: giro, activa: activa };
  })();
  // [puro:fin]
  // lo que la palanca (34b_palanca.js) deja y actualizaPaseo lee: mandoPalanca.av / mandoPalanca.lat (−1..1) y el giro pendiente (rad). Sin palanca, todo a 0 y el paseo no cambia.
  var mandoPalanca = { av: 0, lat: 0, giro: 0 };
  function ponPalanca(av, lat) { mandoPalanca.av = +av || 0; mandoPalanca.lat = +lat || 0; }
  function giraPalanca(rad) { mandoPalanca.giro += +rad || 0; }
  persona = creaPersona(); persona.visible = false; scene.add(persona);
  function entraPaseo() {
    paseando = true; primera = false;
    var pr0 = D.parcelas[parcelaSel >= 0 ? parcelaSel : (fincaSel >= 0 ? fincas[fincaSel].parcelas[0] : 0)]; pp.x = pr0.centro[0]; pp.y = pr0.centro[1] - 6; pp.ang = 0;
    persona.visible = true; $("btnPaseo").setAttribute("aria-pressed", "true");   // el botón «Pasear» se esconde al pasear: se sale con Inicio o el selector de modo (31_hud.js)
    visor.classList.add("paseo"); $("ayudaPaseo").hidden = false; $("ayuda").hidden = true; $("ficha").hidden = true; lienzo.tabIndex = 0; lienzo.focus({ preventScroll: true });
    camPos.set(pp.x, 5, -pp.y + 5); vidaEntra(); iniciaTransicion();
  }
  function salePaseo() {
    paseando = false; IrA.cancela(); persona.visible = false; teclas = {}; ponPalanca(0, 0); mandoPalanca.giro = 0; vidaSale(); iniciaSalida(); $("btnPaseo").setAttribute("aria-pressed", "false");
    visor.classList.remove("paseo"); $("ayudaPaseo").hidden = true; $("ayuda").hidden = false;
  }
  $("btnPaseo").addEventListener("click", function () { if (paseando) salePaseo(); else entraPaseo(); });
  var MAPA = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ShiftLeft: "run", ShiftRight: "run", Space: "sube", KeyC: "baja" };
  window.addEventListener("keydown", function (e) {
    if (!paseando) return; var t = e.target && e.target.tagName;
    if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
    // Esc ya no sale del paseo (decisión 84): cierra lo último abierto o abre el menú (31_hud.js); a la vista aérea se vuelve con Inicio o 0
    if (e.code === "KeyV") { cicloVista(); return; }
    if (e.code === "KeyQ") { ponQuad(!enQuad); return; }
    if (e.code === "KeyE") { ponDron(!enDron); return; }
    if (MAPA[e.code]) { teclas[MAPA[e.code]] = true; e.preventDefault(); }
  });
  window.addEventListener("keyup", function (e) { if (MAPA[e.code]) teclas[MAPA[e.code]] = false; });
  ["up", "down", "left", "right"].forEach(function (d) {
    var b = $("pad-" + d); if (!b) return;
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); teclas[d] = true; b.setPointerCapture(e.pointerId); });
    // soltar en todos los casos: al levantar el dedo, si el navegador cancela el gesto o pierde el dedo (en móvil, una selección de texto
    // o el menú de pulsación larga se comían el pointerup y el paseante seguía andando solo)
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { b.addEventListener(ev, function () { teclas[d] = false; }); });
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    b.addEventListener("selectstart", function (e) { e.preventDefault(); });
  });
  // si la página pierde el foco (otra app, otra pestaña, una llamada) se sueltan todas las teclas y botones
  function sueltaTodo() { ["up", "down", "left", "right"].forEach(function (d) { teclas[d] = false; }); ponPalanca(0, 0); }
  window.addEventListener("blur", sueltaTodo);
  document.addEventListener("visibilitychange", function () { if (document.hidden) sueltaTodo(); });
  $("padRun").addEventListener("click", function () { teclas.run = !teclas.run; $("padRun").setAttribute("aria-pressed", String(!!teclas.run)); });
  $("padCam").addEventListener("click", function () { cicloVista(); });
  function actualizaPaseo(dt) {
    var irA = IrA.paso(dt, !!(teclas.up || teclas.down || teclas.left || teclas.right || mandoPalanca.av || mandoPalanca.lat || mandoPalanca.giro));   // «tocar para ir andando» (12c_ir_a.js): null sin destino o si algo del usuario lo cancela
    var av = (teclas.up ? 1 : 0) - (teclas.down ? 1 : 0), gi = (teclas.right ? 1 : 0) - (teclas.left ? 1 : 0);
    var lat = 0;   // paso lateral de la palanca (solo a pie; en quad y dron el lado de la palanca gira, como la cruceta)
    if (mandoPalanca.av || mandoPalanca.lat) { av = Math.max(-1, Math.min(1, av + mandoPalanca.av)); if (enQuad || enDron) gi = Math.max(-1, Math.min(1, gi + mandoPalanca.lat)); else lat = mandoPalanca.lat; }
    if (mandoPalanca.giro) { pp.ang += mandoPalanca.giro; mandoPalanca.giro = 0; }   // arrastrar la otra mitad: mirar
    if (irA) { av = irA.av; pp.ang = irA.ang; }   // camina hacia el punto tocado: gira y avanza; la velocidad, los troncos y el borde son los de siempre
    if (TR.act && TR.t < TR.tCae + 0.25) { av = 0; gi = 0; lat = 0; }   // quieto mientras cae
    if (enDron) { dronMando(av, gi, dt); av = 0; gi = 0; }
    var vel = velPaseo(av, dt);
    pp.ang += gi * dt * giroPaseo(vel) * sensMirar().k;   // la sensibilidad de Configuración → Controles también gira al paseante (09_camara.js); el eje vertical no aplica
    var nx = pp.x + Math.sin(pp.ang) * vel * dt, ny = pp.y + Math.cos(pp.ang) * vel * dt;
    if (lat) { var pl = PalancaPuro.mundo(0, lat * (teclas.run ? 4.3 : 1.7) * 0.8, pp.ang); nx += pl.x * dt; ny += pl.y * dt; }
    // los troncos no se atraviesan: se empuja fuera del círculo de cada tronco
    var RC = enQuad ? 1.05 : 0.55;
    for (var i = 0; i < copas.length; i++) {
      var c = copas[i]; if (!c.oliv) continue; var dx = nx - c.x, dy = ny - c.y, d2 = dx * dx + dy * dy;
      if (d2 < RC * RC) { var d = Math.sqrt(d2) || 0.001; nx = c.x + dx / d * RC; ny = c.y + dy / d * RC; }
    }
    var e = D.ext; nx = Math.max(e[0] + 3, Math.min(e[2] - 3, nx)); ny = Math.max(e[3] + 3, Math.min(e[1] - 3, ny));
    pp.x = nx; pp.y = ny; pp.paso += Math.abs(vel) * dt * 3.4;
    var mov = Math.min(1, Math.abs(vel) / 1.7), sw = Math.sin(pp.paso) * 0.75 * mov, ud = persona.userData;
    ud.pi.rotation.x = sw; ud.pd.rotation.x = -sw; ud.bi.rotation.x = -sw * 0.8; ud.bd.rotation.x = sw * 0.8;
    var gy = suelo(pp.x, pp.y) * exag;
    persona.position.set(pp.x, gy + Math.abs(Math.sin(pp.paso)) * 0.03 * mov, -pp.y); persona.rotation.y = -pp.ang; persona.visible = !primera; vidaPaseo(dt, gy, vel);
    var fx = Math.sin(pp.ang), fz = -Math.cos(pp.ang);
    if (camaraDron(dt, gy)) { }
    else if (primera) { var oj = alturaOjos(); camera.position.set(pp.x, gy + oj, -pp.y); camera.lookAt(pp.x + fx * 10, gy + oj - 0.17, -pp.y + fz * 10); }
    else {
      var DC = enQuad ? 7.2 : 4.4;
      // la cámara no se mete en las copas: se recorre el tramo cabeza → cámara cada 25 cm y, si entra en una copa (altura medida del LiDAR,
      // copaAlta), se acerca hasta justo antes (mínimo 1,2 m); así no se ve el olivo «por dentro» con aceitunas y hojas gigantes
      var cabY = gy + 1.5, finY = gy + 2.3, DMIN = 1.2;
      for (var s = 0.6; s <= DC; s += 0.25) {
        var sx = pp.x - Math.sin(pp.ang) * s, sy = pp.y - Math.cos(pp.ang) * s, hc = copaAlta(sx, sy);
        if (hc > 0.8 && cabY + (finY - cabY) * s / DC < suelo(sx, sy) * exag + hc + 0.3) { DC = Math.max(DMIN, s - 0.35); break; }
      }
      var objx = pp.x - fx * DC, objz = -pp.y - fz * DC, objy = Math.max(gy + 2.3, suelo(objx, -objz) * exag + 1.2);
      camPos.x += (objx - camPos.x) * Math.min(1, dt * 5); camPos.z += (objz - camPos.z) * Math.min(1, dt * 5); camPos.y += (objy - camPos.y) * Math.min(1, dt * 5);
      camera.position.copy(camPos); camera.lookAt(pp.x + fx * 1.5, gy + 1.3, -pp.y + fz * 1.5);
    }
  }


