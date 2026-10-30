// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: TR, suave, iniciaTransicion, transEntrada, aterriza, iniciaSalida, transSalida
// Consume: 01_datos ($), 03_escena (visor, camera), 12_paseo (paseando, persona), 16_vida (altSuelo), 20_sonido (snd, sPaso),
//   22_huellas (emitePolvo, sueloSeco), 25_perros (perrosLlegan)
// ===============================================================================
  // ---------- la página ES el visor (decisión 83): el menú (☰ o Esc) y la pantalla completa de verdad
  // El menú es un <dialog> nativo y modal: atrapa el foco y Esc lo cierra solo. Pestañas con el patrón ARIA (flechas, Inicio, Fin).
  // Configuración la rellena 33_ajustes.js (#menuAjustes); Créditos y «Acerca de la finca» vienen escritos en la plantilla.
  var Menu = (function () {
    var dlg = $("menu"), pestanas = dlg ? Array.prototype.slice.call(dlg.querySelectorAll('#menuPestanas [role="tab"]')) : [], vuelta = null;
    var NOMBRE = { ajustes: "menuPestAjustes", creditos: "menuPestCreditos", finca: "menuPestFinca" };
    function eligePest(t, foco) {
      pestanas.forEach(function (p) { var si = p === t; p.setAttribute("aria-selected", String(si)); p.tabIndex = si ? 0 : -1; var pnl = $(p.getAttribute("aria-controls")); if (pnl) pnl.hidden = !si; });
      if (foco) t.focus();
    }
    function abre(cual) {
      if (!dlg) return;
      if (!dlg.open) { vuelta = document.activeElement; try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
      var t = $(NOMBRE[cual] || "") || pestanas.filter(function (p) { return p.getAttribute("aria-selected") === "true"; })[0] || pestanas[0];
      if (t) eligePest(t, true);
    }
    function cierra() { if (dlg && dlg.open) dlg.close(); }
    if (dlg) {
      pestanas.forEach(function (p, i) {
        p.addEventListener("click", function () { eligePest(p, false); });
        p.addEventListener("keydown", function (e) {
          var k = e.key, n = pestanas.length, j = k === "ArrowDown" || k === "ArrowRight" ? (i + 1) % n : k === "ArrowUp" || k === "ArrowLeft" ? (i + n - 1) % n : k === "Home" ? 0 : k === "End" ? n - 1 : -1;
          if (j < 0) return; e.preventDefault(); e.stopPropagation(); eligePest(pestanas[j], true);
        });
      });
      dlg.addEventListener("keydown", function (e) { if (e.key !== "Escape") e.stopPropagation(); });   // dentro del menú, pulsar no mueve al paseante
      dlg.addEventListener("close", function () { if (vuelta && vuelta.focus && document.contains(vuelta)) vuelta.focus({ preventScroll: true }); vuelta = null; });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) cierra(); });   // un toque fuera de la caja (en el fondo) cierra
      var bv = $("menuVolver"); if (bv) bv.addEventListener("click", cierra);
      var ba = $("menuAereo"); if (ba) ba.addEventListener("click", function () { cierra(); if (paseando) $("btnPaseo").click(); });
      var bm = $("bMenu"); if (bm) bm.addEventListener("click", function () { abre(); });
      var at = $("hudAtrib"); if (at) at.addEventListener("click", function () { abre("creditos"); });
    }
    return { abre: abre, cierra: cierra, abierto: function () { return !!(dlg && dlg.open); } };
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
