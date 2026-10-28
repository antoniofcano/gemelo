// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: pant, TR, suave, iniciaTransicion, transEntrada, aterriza, iniciaSalida, transSalida
// Consume: 01_datos ($), 03_escena (visor, camera), 12_paseo (paseando, persona), 15_tiempo (hace), 16_vida (altSuelo), 20_sonido (snd, sPaso),
//   22_huellas (emitePolvo, sueloSeco), 25_perros (perrosLlegan), 29_vr (panel), 90_final (tamano)
// ===============================================================================
  // ---------- pantalla completa del visor (con botón para volver a la página) y la transición de la cámara entre el mapa y el paseo
  var pant = { on: false };
  function pantallaCompleta(v) {
    pant.on = v; visor.classList.toggle("pantalla", v); document.documentElement.classList.toggle("sin-scroll", v);
    var b = $("btnPantalla"); b.setAttribute("aria-pressed", String(v)); b.textContent = v ? "✕ Volver" : "⛶"; b.title = v ? "Volver a la página" : "Pantalla completa";
    // pantalla completa de verdad si el navegador la deja (en el iPhone no la hay para esto: queda la del propio visor, que ocupa toda la ventana)
    try {
      if (v && visor.requestFullscreen && !document.fullscreenElement) { var pr = visor.requestFullscreen(); if (pr && pr.catch) pr.catch(function () {}); }
      if (!v && document.fullscreenElement && document.exitFullscreen) { var pe = document.exitFullscreen(); if (pe && pe.catch) pe.catch(function () {}); }
    } catch (e) {}
    setTimeout(tamano, 60); setTimeout(tamano, 350);
  }
  (function () {
    $("btnPantalla").addEventListener("click", function () { pantallaCompleta(!pant.on); });
    document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && pant.on) pantallaCompleta(false); });
    window.addEventListener("keydown", function (e) { if (e.code === "Escape" && pant.on && !paseando) pantallaCompleta(false); }, true);   // en la fase de captura: el primer Escape sale del paseo y el segundo, de la pantalla completa
  })();

  // --- del mapa al paseo: la cámara baja volando desde donde estaba hasta detrás del muñequito, que cae desde el cielo y rebota al aterrizar
  var TR = { act: false, t: 0, dur: 2.3, desde: new THREE.Vector3(), qDesde: new THREE.Quaternion(), caida: 34, tCae: 1.35, aterrizo: false, sal: false, ts: 0, durS: 1.1, pS: new THREE.Vector3(), qS: new THREE.Quaternion() };
  var qObj = new THREE.Quaternion(), mLook = new THREE.Matrix4(), vArr = new THREE.Vector3(0, 1, 0);
  function suave(s) { s = Math.max(0, Math.min(1, s)); return s * s * (3 - 2 * s); }
  function iniciaTransicion() {   // se llama al entrar en el paseo, con la cámara todavía en la órbita
    TR.act = true; TR.t = 0; TR.aterrizo = false; TR.sal = false; TR.desde.copy(camera.position); TR.qDesde.copy(camera.quaternion);
    TR.dur = Math.max(1.6, Math.min(2.8, camera.position.distanceTo(new THREE.Vector3(pp.x, altSuelo(pp.x, pp.y), -pp.y)) / 260 + 1.5));
  }
  function transEntrada(dt) {   // después de que el paseo haya puesto su cámara y su muñequito
    if (!TR.act) return;
    TR.t += dt; var s = suave(TR.t / TR.dur);
    camera.position.lerpVectors(TR.desde, camera.position.clone(), s); qObj.copy(camera.quaternion); camera.quaternion.copy(TR.qDesde).slerp(qObj, s);
    var T = TR.tCae, y;
    if (TR.t < T) { var u = TR.t / T; y = TR.caida * (1 - u * u); }
    else { var tt = TR.t - T; y = 0.42 * Math.abs(Math.sin(tt * 9)) * Math.exp(-tt * 4.5); if (!TR.aterrizo) { TR.aterrizo = true; aterriza(); } }
    persona.position.y += y; persona.rotation.x = TR.t < T ? Math.sin(TR.t * 3) * 0.12 : 0;   // un poco de braceo en la caída
    if (TR.t > TR.dur + 0.6) { TR.act = false; persona.rotation.x = 0; }
  }
  function aterriza() {   // polvo y un golpe sordo; y los perros salen corriendo hacia ti
    perrosLlegan();
    var fx = Math.sin(pp.ang), fy = Math.cos(pp.ang);
    if (sueloSeco(pp.x, pp.y)) for (var i = 0; i < 16; i++) { var a = i / 16 * 6.283 + Math.random() * 0.4; emitePolvo(pp.x + Math.cos(a) * 0.3, pp.y + Math.sin(a) * 0.3, altSuelo(pp.x, pp.y) + 0.1, Math.cos(a) * (1.4 + Math.random()), 0.5 + Math.random() * 0.5, Math.sin(a) * (1.4 + Math.random()), 0.45 + Math.random() * 0.3, 0.9 + Math.random() * 0.5); }
    if (snd.ctx && snd.ctx.state === "running") { sPaso(0.2); setTimeout(function () { sPaso(0.12); }, 90); }
  }
  function iniciaSalida() {   // al salir del paseo la cámara vuelve sin salto a la órbita
    TR.sal = true; TR.ts = 0; TR.act = false; TR.pS.copy(camera.position); TR.qS.copy(camera.quaternion);
  }
  function transSalida(dt) {   // después de que la órbita haya puesto su cámara
    if (!TR.sal) return;
    TR.ts += dt; var s = suave(TR.ts / TR.durS);
    camera.position.lerpVectors(TR.pS, camera.position.clone(), s); qObj.copy(camera.quaternion); camera.quaternion.copy(TR.qS).slerp(qObj, s);
    if (TR.ts > TR.durS) TR.sal = false;
  }

  (function () {   // el botón de pasear del visor hace lo mismo que el del panel y guarda su texto
    var v = $("btnPaseoV"); if (!v) return; v.addEventListener("click", function () { $("btnPaseo").click(); });
    new MutationObserver(function () { var on = $("btnPaseo").getAttribute("aria-pressed") === "true"; v.setAttribute("aria-pressed", String(on)); v.textContent = on ? "✕ Salir del paseo" : "🚶 Pasear"; }).observe($("btnPaseo"), { attributes: true, attributeFilter: ["aria-pressed"] });
  })();

