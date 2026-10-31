// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Laminas
// Consume: 02c_componentes (Bus), 03_escena (lienzo, renderer, scene, camera, texColor, modo), 15_tiempo (rumbo, hace), 16_vida (mira),
//   24_pantalla (suave), 29_vr (VRX), 90_final (bucle)
// Nota: Servicio del núcleo (ADR-0023, C8): LaminasPuro y Laminas (un lienzo 2D como textura de un cartel en el mundo: colocación delante a la altura de los ojos, giro suave, cierre por distancia o al salir de VR, repintado solo si cambia la firma, liberado entero y alTocar(u, v) para el rayo y el gatillo). Sin reloj propio: lo mueve 90_final (Laminas.revisa) y 29_vr (Laminas.toca). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/laminas.test.js.
// ===============================================================================
  // ---------- las láminas (ADR-0023, C8; doc/sistema/COMPONENTES.md): un lienzo 2D como textura de un cartel en el mundo, anclado al mundo (no a la cabeza), a la
  // altura de los ojos y delante de la mirada, que se vuelve despacio hacia quien lo mira, se repinta SOLO si cambia lo que se ve, se cierra solo si te alejas
  // o sales de VR y se libera entero al cerrarlo. Es lo que antes era la lámina de la previsión del tiempo (35_fichas_tiempo.js), sacado como servicio del
  // núcleo para el siguiente (el juego en VR, las fichas de entidades). Quien la usa no crea mallas ni texturas: da el lienzo y qué pintar.
  //   Laminas.abre({ id, ancho, alto, pinta(cx, w, h, lam), firma?(lam), alTocar?(u, v, t), alCierra?(motivo), nombre?, w?, h?, pxPorM?, modo?, dist?, bajo?, cierraA?, sigue? })
  //     ancho, alto: metros del cartel · w, h: píxeles del lienzo (por defecto ancho·pxPorM, con pxPorM = 800)
  //     pinta: dibuja el lienzo entero (cx = contexto 2D, w × h px; lam = { id, modo, ancho, alto, w, h, rumbo() }, rumbo() = hacia dónde mira quien lo ve de
  //       frente, 0 = norte y 90 = este)
  //     firma: texto que resume lo que se ve; solo se repinta si cambia (sin firma, repinta(id) pinta siempre y revisa() nunca repinta)
  //     alTocar(u, v, t): el rayo y el gatillo de un mando lo tocan (29_vr.js llama a Laminas.toca(rayo)); u de izquierda a derecha y v de ARRIBA a abajo,
  //       los dos de 0 a 1; t = { x, y (px del lienzo), lam }. Devuelve false si no usa el toque (entonces el gatillo sigue con lo demás)
  //     alCierra(motivo): "cerrada" (a mano), "lejos", "sale-vr" o "reabierta" · cierraA: { vr: 40, pantalla: 60 } m de la cabeza · modo: "vr" | "pantalla"
  //       (por omisión, según VRX.on) · dist: m delante de la mirada ({ vr: 1.4, pantalla: 2.4 }) · bajo: m por debajo de los ojos ({ vr: 0.05, pantalla: 0.1 })
  //       · sigue: false para que no se vuelva hacia quien la mira · en: { x, y, z } (escena) para colgarla de un sitio del mundo en vez de ponerla delante de la mirada (se vuelve hacia quien la mira igual)
  //   Laminas.cierra(id, motivo?) → bool · Laminas.repinta(id, forzar?) → bool (¿pintó?) · Laminas.revisa(dt?) (el bucle la llama; sin dt, ahora mismo)
  //   Laminas.toca(rayo) → bool · Laminas.info(id) → { abierta, modo, pos, rumbo, pintadas, firma } · Laminas.hay(id) · Laminas.ids() · Laminas.cierraTodas(motivo)
  // Presupuesto (regla 6): por lámina abierta, UNA malla (una llamada de dibujo, 2 triángulos) y UNA textura w × h sin mipmaps (w·h·4 B); se crean al abrir y se
  // liberan (geometría, material, textura y lienzo) al cerrar. El lienzo solo se sube a la GPU si la firma cambia. Sin reloj propio: lo mueve el bucle (90_final).
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/laminas.test.js)
  var LaminasPuro = (function () {
    var LEJOS = { vr: 40, pantalla: 60 }, DIST = { vr: 1.4, pantalla: 2.4 }, BAJO = { vr: 0.05, pantalla: 0.1 }, PX_M = 800;
    // de la uv de three (v hacia arriba) a las coordenadas de la lámina: u de izquierda a derecha y v de arriba abajo (como el lienzo), y los píxeles
    function toque(uv, w, h) { var u = uv.x, v = 1 - uv.y; return { u: u, v: v, x: u * w, y: v * h }; }
    // el giro suave hacia quien mira: d = ángulo que falta (rad, −π…π). Empieza a girar pasados 8° (0,14 rad), acaba al llegar a ~1° (0,02), amortigua
    // (2,5/s) y no pasa de 60°/s (1,05 rad/s). Devuelve { girando, paso (rad) }.
    function giro(d, dt, girando) {
      if (Math.abs(d) > 0.14) girando = true; else if (Math.abs(d) < 0.02) girando = false;
      if (!girando) return { girando: false, paso: 0 };
      var paso = d * Math.min(1, dt * 2.5), tope = 1.05 * dt;
      return { girando: true, paso: Math.max(-tope, Math.min(tope, paso)) };
    }
    function medidas(o) {
      var pxm = o.pxPorM > 0 ? o.pxPorM : PX_M;
      return { w: Math.max(1, Math.round(o.w || o.ancho * pxm)), h: Math.max(1, Math.round(o.h || o.alto * pxm)) };
    }
    function valida(o) {
      var e = [];
      if (!o || typeof o !== "object") return ["la lámina no es un objeto"];
      if (typeof o.id !== "string" || !o.id) e.push("id: texto");
      if (!(o.ancho > 0) || !(o.alto > 0)) e.push("ancho y alto: metros > 0");
      if (typeof o.pinta !== "function") e.push("pinta: función");
      ["firma", "alTocar", "alCierra"].forEach(function (k) { if (o[k] !== undefined && typeof o[k] !== "function") e.push(k + ": función"); });
      return e;
    }
    return { LEJOS: LEJOS, DIST: DIST, BAJO: BAJO, PX_M: PX_M, toque: toque, giro: giro, medidas: medidas, valida: valida };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/laminas.test.js con un THREE de mentira, para contar lo que crea y lo que libera)
  var Laminas = (function () {
    var P = LaminasPuro, LS = {}, cuenta = { abiertas: 0, cerradas: 0, pintadas: 0 }, vC = new THREE.Vector3(), vD = new THREE.Vector3(), acum = 0, PERIODO = 0.5;
    function enVR() { return !!VRX.on; }
    function cabeza(v) { if (enVR()) return v.copy(VRX.cab); camera.updateMatrixWorld(); return v.setFromMatrixPosition(camera.matrixWorld); }
    function rumboDe(m) { return ((-m.rotation.y * 180 / Math.PI) % 360 + 360) % 360; }
    // se vuelve hacia la cabeza solo si se ha desviado más de 8°, a lo sumo a 60°/s y amortiguado: un cartel que se gira despacio, nunca la vista
    function gira(l) {
      var f = renderer.info.render.frame; if (f === l.fr) return; l.fr = f;   // una vez por fotograma (en VR se dibuja un ojo y luego el otro)
      var t = performance.now(), dt = Math.min(0.1, (t - l.t) / 1000); l.t = t;
      var h = cabeza(vC), m = l.m, obj = Math.atan2(h.x - m.position.x, h.z - m.position.z), d = obj - m.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      var g = P.giro(d, dt, l.girando); l.girando = g.girando;
      if (g.girando) { m.rotation.y += g.paso; m.updateMatrixWorld(); }
    }
    function pinta(l, forzar) {
      var o = l.o, f = null;
      if (o.firma) { f = String(o.firma(l.lam)); if (!forzar && f === l.firma) return false; }
      o.pinta(l.cx, l.w, l.h, l.lam); l.tex.needsUpdate = true; if (f !== null) l.firma = f; l.pintadas++; cuenta.pintadas++;
      return true;
    }
    function abre(o) {
      var e = P.valida(o);
      if (e.length) { try { console.error("[Laminas] lámina no válida (" + (o && o.id) + "): " + e.join("; ")); } catch (er) {} return false; }
      if (LS[o.id]) cierra(o.id, "reabierta");
      var modo = o.modo === "vr" || o.modo === "pantalla" ? o.modo : enVR() ? "vr" : "pantalla", md = P.medidas(o);
      var cv = document.createElement("canvas"); cv.width = md.w; cv.height = md.h;
      var tex = texColor(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      var geo = new THREE.PlaneGeometry(o.ancho, o.alto), mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, fog: false, toneMapped: false });
      var m = new THREE.Mesh(geo, mat); m.name = o.nombre || "lamina:" + o.id; m.renderOrder = 10;
      var h = cabeza(vC), g = camera.getWorldDirection(vD); g.y = 0; if (g.lengthSq() < 1e-6) g.set(0, 0, -1); g.normalize();
      var dist = o.dist && o.dist[modo] != null ? o.dist[modo] : P.DIST[modo], bajo = o.bajo && o.bajo[modo] != null ? o.bajo[modo] : P.BAJO[modo];   // a la altura de los ojos y delante de la mirada; luego se queda ahí
      m.position.set(h.x + g.x * dist, h.y - bajo, h.z + g.z * dist);
      if (o.en) m.position.set(o.en.x, o.en.y, o.en.z);   // colgada de un sitio del mundo (el olivo, P7f) en vez de delante de la mirada
      m.rotation.set(0, Math.atan2(h.x - m.position.x, h.z - m.position.z), 0); m.updateMatrixWorld();
      var l = { o: o, id: o.id, cv: cv, cx: cv.getContext("2d"), tex: tex, geo: geo, mat: mat, m: m, modo: modo, w: md.w, h: md.h, firma: "", fr: -1, t: performance.now(), girando: false, pintadas: 0 };
      l.lam = { id: o.id, modo: modo, ancho: o.ancho, alto: o.alto, w: md.w, h: md.h, rumbo: function () { return rumboDe(m); } };
      if (o.sigue !== false) m.onBeforeRender = function () { gira(l); };
      scene.add(m); LS[o.id] = l; cuenta.abiertas++;
      pinta(l, true);
      return true;
    }
    function cierra(id, motivo) {
      var l = LS[id]; if (!l) return false;
      delete LS[id]; scene.remove(l.m); l.m.onBeforeRender = function () {};
      l.geo.dispose(); l.mat.dispose(); l.tex.dispose(); l.cv.width = l.cv.height = 0;   // regla del repo: todo recurso de GPU se libera
      cuenta.cerradas++;
      if (l.o.alCierra) { try { l.o.alCierra(motivo || "cerrada"); } catch (e) { try { console.error("[Laminas] alCierra " + id, e); } catch (e2) {} } }
      return true;
    }
    function cierraTodas(motivo) { Object.keys(LS).forEach(function (id) { cierra(id, motivo); }); }
    function repinta(id, forzar) { var l = LS[id]; return l ? pinta(l, !!forzar || !l.o.firma) : false; }
    // el bucle la llama cada fotograma con su dt (cada 0,5 s hace el repaso) o sin dt (pruebas: ahora mismo): ¿sigue cerca? ¿cambió lo que se ve? (subir la textura cuesta)
    function revisa(dt) {
      if (dt !== undefined) { acum += dt; if (acum < PERIODO) return; acum = 0; }
      Object.keys(LS).forEach(function (id) {
        var l = LS[id]; if (!l) return;
        if (l.modo === "vr" && !enVR()) { cierra(id, "sale-vr"); return; }
        var h = cabeza(vC), lejos = (l.o.cierraA && l.o.cierraA[l.modo] != null) ? l.o.cierraA[l.modo] : P.LEJOS[l.modo];
        if (Math.hypot(h.x - l.m.position.x, h.z - l.m.position.z) > lejos) { cierra(id, "lejos"); return; }
        if (l.o.firma) pinta(l, false);
      });
    }
    // el gatillo de un mando (29_vr.js): rr = un THREE.Raycaster ya puesto sobre el rayo del mando. La lámina con alTocar más cercana que el rayo toque recibe (u, v).
    function toca(rr) {
      var mejor = null;
      Object.keys(LS).forEach(function (id) {
        var l = LS[id]; if (!l.o.alTocar) return;
        var ix = rr.intersectObject(l.m, false)[0]; if (!ix || !ix.uv) return;
        if (!mejor || ix.distance < mejor.d) mejor = { d: ix.distance, l: l, uv: ix.uv };
      });
      if (!mejor) return false;
      var t = P.toque(mejor.uv, mejor.l.w, mejor.l.h); t.lam = mejor.l.lam;
      try { return mejor.l.o.alTocar(t.u, t.v, t) !== false; } catch (e) { try { console.error("[Laminas] alTocar " + mejor.l.id, e); } catch (e2) {} return true; }
    }
    function info(id) {
      var l = LS[id]; if (!l) return { abierta: false, modo: "", pos: null, rumbo: null, pintadas: 0, firma: "" };
      return { abierta: true, modo: l.modo, pos: [l.m.position.x, l.m.position.y, l.m.position.z], rumbo: rumboDe(l.m), pintadas: l.pintadas, firma: l.firma, w: l.w, h: l.h };
    }
    Bus.on("vr:sale", function () { Object.keys(LS).forEach(function (id) { if (LS[id] && LS[id].modo === "vr") cierra(id, "sale-vr"); }); });
    return { abre: abre, cierra: cierra, cierraTodas: cierraTodas, repinta: repinta, revisa: revisa, toca: toca, info: info, hay: function (id) { return !!LS[id]; }, ids: function () { return Object.keys(LS); },
      cuenta: function () { return { abiertas: cuenta.abiertas, cerradas: cuenta.cerradas, pintadas: cuenta.pintadas, vivas: Object.keys(LS).length }; } };
  })();
  // [motor:fin]
