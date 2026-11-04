// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: LaminasPuro, Laminas
// Consume: 02c_componentes (Bus), 03_escena (lienzo, renderer, scene, camera, texColor, modo), 08_marcadores (capas), 15_tiempo (rumbo, hace),
//   16_vida (mira), 24_pantalla (suave), 29_vr (VRX, panel), 90_final (bucle)
// Nota: Servicio del núcleo (ADR-0023, C8): LaminasPuro y Laminas (un lienzo 2D como textura de un cartel en el mundo: colocación delante a la altura de los ojos, giro suave, cierre por distancia o al salir de VR, repintado solo si cambia la firma, liberado entero y alTocar(u, v) para el rayo y el gatillo). Sin reloj propio: lo mueve 90_final (Laminas.revisa) y 29_vr (Laminas.toca). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/laminas.test.js.
// ===============================================================================
  // ---------- las láminas (ADR-0023, C8; doc/sistema/COMPONENTES.md): un lienzo 2D como textura de un cartel en el mundo, anclado al mundo (no a la cabeza), a la
  // altura de los ojos y delante de la mirada, que se vuelve despacio hacia quien lo mira, se repinta SOLO si cambia lo que se ve, se cierra solo si te alejas
  // o sales de VR y se libera entero al cerrarlo. Es lo que antes era la lámina de la previsión del tiempo (35_fichas_tiempo.js), sacado como servicio del
  // núcleo para el siguiente (el juego en VR, las fichas de entidades). Quien la usa no crea mallas ni texturas: da el lienzo y qué pintar.
  //   Laminas.abre({ id, ancho, alto, pinta(cx, w, h, lam), firma?(lam), alTocar?(u, v, t), alApuntar?(u, v, t), alCierra?(motivo), nombre?, w?, h?, pxPorM?, modo?, dist?, bajo?, cierraA?, sigue?, en?, encima? })
  //     ancho, alto: metros del cartel · w, h: píxeles del lienzo (por defecto ancho·pxPorM, con pxPorM = 800)
  //     pinta: dibuja el lienzo entero (cx = contexto 2D, w × h px; lam = { id, modo, ancho, alto, w, h, rumbo() }, rumbo() = hacia dónde mira quien lo ve de
  //       frente, 0 = norte y 90 = este)
  //     firma: texto que resume lo que se ve; solo se repinta si cambia (sin firma, repinta(id) pinta siempre y revisa() nunca repinta)
  //     alTocar(u, v, t): el rayo y el gatillo de un mando lo tocan (29_vr.js llama a Laminas.toca(rayo)); u de izquierda a derecha y v de ARRIBA a abajo,
  //       los dos de 0 a 1; t = { x, y (px del lienzo), lam }. Devuelve false si no usa el toque (entonces el gatillo sigue con lo demás)
  //     alCierra(motivo): "cerrada" (a mano), "lejos", "sale-vr" o "reabierta" · cierraA: { vr: 40, pantalla: 60 } m de la cabeza · modo: "vr" | "pantalla"
  //       (por omisión, según VRX.on) · dist: m delante de la mirada ({ vr: 1.4, pantalla: 2.4 }) · bajo: m por debajo de los ojos ({ vr: 0.05, pantalla: 0.1 })
  //       · sigue: false para que no se vuelva hacia quien la mira · en: { x, y, z } (escena) para colgarla de un sitio del mundo en vez de ponerla delante de la mirada (se vuelve hacia quien la mira igual)
  //       · encima: true para pintarla por encima de todo (sin prueba de profundidad, transparente y con renderOrder 998, como el panel VR): las hojas de una copa no la tapan
  //     alApuntar(u, v, t): el rayo de un mando pasa por ella (29_vr.js llama a Laminas.apunta(rayo) cada fotograma, solo con ?ui=capas); t = null cuando deja de pasar
  //   Laminas.cierra(id, motivo?) → bool · Laminas.repinta(id, forzar?) → bool (¿pintó?) · Laminas.revisa(dt?) (el bucle la llama; sin dt, ahora mismo)
  //   Laminas.toca(rayo) → bool · Laminas.apunta(rayo) → id apuntado o null · Laminas.info(id) → { abierta, modo, pos, rumbo, pintadas, firma } · Laminas.hay(id) · Laminas.ids() · Laminas.cierraTodas(motivo)
  //   Laminas.bajoRayo(rayo) → { id, distancia, pos, rotY } | null · Laminas.mueve(id, x, y, z, rotY) → bool (VR-L1: agarrarla con el grip y dejarla en otro sitio, 29_vr.js)
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
      ["firma", "alTocar", "alApuntar", "alCierra"].forEach(function (k) { if (o[k] !== undefined && typeof o[k] !== "function") e.push(k + ": función"); });
      return e;
    }
    // EV2-A0: los topes angulares de lo que se lee y se pulsa en una lámina VR (doc/sistema/VIABILIDAD-INTERACCION.md §A.2). Son CIFRAS PROPIAS DEL GEMELO,
    // no verificadas en la guía de Meta ni en la de Apple ni en un casco: texto ≥ 1,5° por línea (el interlineado, no la altura de la x), objetivos ≥ 2,5°
    // por su lado menor y ≥ 12 mm entre botones vistos a 1 m (12 mm a 1 m = 0,69°). grados(mm, m): ángulo que ocupa un tamaño a una distancia.
    var TOPES = { textoGrados: 1.5, objetivoGrados: 2.5, huecoMmA1m: 12 };
    function grados(mm, dist) { return 2 * Math.atan(mm / 2000 / dist) * 180 / Math.PI; }
    function hueco(a, b) {   // px entre dos rectángulos { x, y, w, h } (0 si se tocan o se pisan)
      var dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)), dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
      return Math.hypot(dx, dy);
    }
    // p = { mmPorPx, dist (m de la cabeza), lineas: { nombre: px de interlineado }, botones: [{ x, y, w, h }] px } → { texto: { nombre: ° }, textoMin, objetivoMin,
    // huecoMin (mm equivalentes a 1 m; null con menos de dos botones), fallos: [texto] } contra TOPES (o los topes que se pasen)
    function legible(p, topes) {
      var T = topes || TOPES, r = { texto: {}, textoMin: null, objetivoMin: null, huecoMin: null, fallos: [] }, L = p.lineas || {}, B = p.botones || [];
      Object.keys(L).forEach(function (k) { var g = grados(L[k] * p.mmPorPx, p.dist); r.texto[k] = g; if (r.textoMin === null || g < r.textoMin) r.textoMin = g; if (g < T.textoGrados) r.fallos.push("texto «" + k + "» " + g.toFixed(2) + "° < " + T.textoGrados + "°"); });
      B.forEach(function (b, i) {
        var g = grados(Math.min(b.w, b.h) * p.mmPorPx, p.dist); if (r.objetivoMin === null || g < r.objetivoMin) r.objetivoMin = g;
        if (g < T.objetivoGrados) r.fallos.push("botón " + (b.id || i) + " " + g.toFixed(2) + "° < " + T.objetivoGrados + "°");
        for (var j = i + 1; j < B.length; j++) { var mm = hueco(b, B[j]) * p.mmPorPx / p.dist; if (r.huecoMin === null || mm < r.huecoMin) r.huecoMin = mm; if (mm < T.huecoMmA1m) r.fallos.push("hueco " + (b.id || i) + "–" + (B[j].id || j) + " " + mm.toFixed(1) + " mm a 1 m < " + T.huecoMmA1m); }
      });
      return r;
    }
    // ---- VR-L1: dónde nace una lámina y cómo se agarra (lo usan Laminas.abre, el panel y las fichas de 29_vr.js y las fichas del mundo; un solo sitio).
    // ang(a): el ángulo llevado a −π…π. rotaY(x, z, a): (x, z) girado a radianes en torno al eje vertical, como Vector3.applyAxisAngle((0, 1, 0), a) de three.
    function ang(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
    function rotaY(x, z, a) { var c = Math.cos(a), s = Math.sin(a); return { x: x * c + z * s, z: -x * s + z * c }; }
    // miradaH(q, yaw): hacia dónde mira la cabeza en horizontal, en el mundo ({ x, z } de largo 1). q = la orientación de la cabeza DENTRO del rig
    // ({ x, y, z, w }: la de la pose del XRFrame, o camera.quaternion recién pintado) y yaw = el giro del rig (rad). Mirando casi en vertical (a menos de ~6°)
    // el «adelante» no tiene dirección horizontal: vale la de la coronilla (mirando abajo) o la de la nuca (mirando arriba). Sin nada, el norte (−z).
    function miradaH(q, yaw) {
      var x = q && isFinite(q.x) ? q.x : 0, y = q && isFinite(q.y) ? q.y : 0, z = q && isFinite(q.z) ? q.z : 0, w = q && isFinite(q.w) ? q.w : 1;
      var fx = -2 * (x * z + w * y), fy = -2 * (y * z - w * x), fz = -(1 - 2 * (x * x + y * y));   // q · (0, 0, −1)
      if (fx * fx + fz * fz < 0.01) { var sg = fy < 0 ? 1 : -1; fx = 2 * (x * y - w * z) * sg; fz = 2 * (y * z + w * x) * sg; }   // q · (0, 1, 0)
      if (fx * fx + fz * fz < 1e-10) { fx = 0; fz = -1; }
      var r = rotaY(fx, fz, yaw || 0), l = Math.hypot(r.x, r.z);
      return { x: r.x / l, z: r.z / l };
    }
    // mirando(cab, p): el giro (rotation.y) de una lámina en p para que su cara (+z del plano) mire a la cabeza
    function mirando(cab, p) { return Math.atan2(cab.x - p.x, cab.z - p.z); }
    // nace(cab, mira, dist, dy): la lámina nace CENTRADA en la mirada horizontal, a dist m delante de la cabeza y dy m por encima de los ojos (negativo: debajo),
    // mirando a la cabeza. → { x, y, z, rotY }
    function nace(cab, mira, dist, dy) {
      var p = { x: cab.x + mira.x * dist, y: cab.y + (dy || 0), z: cab.z + mira.z * dist };
      p.rotY = mirando(cab, p); return p;
    }
    // desvio(cab, p, mira): cuánto se aparta (rad, 0…π) la lámina en p de la mirada horizontal, vista desde la cabeza
    function desvio(cab, p, mira) { return Math.abs(ang(Math.atan2(p.x - cab.x, p.z - cab.z) - Math.atan2(mira.x, mira.z))); }
    // agarrar con el grip: agarra(o, d, t, c, rotY, cab) al apretarlo, con el rayo del mando (origen o, dirección d de largo 1) que toca la lámina a t m, su
    // centro c y su giro; arrastra(a, o, d, cab, prev?, dt?) cada fotograma mientras se aprieta: el punto agarrado sigue al rayo a la MISMA distancia del mando
    // (sin saltos), la lámina guarda dónde se la agarró y mira siempre a la cabeza; entre AGARRE.dmin y AGARRE.dmax m de la cabeza (en horizontal); con prev
    // y dt, se suaviza (AGARRE.suave /s) para que el temblor del mando no la haga vibrar. Al soltar, quien la mueve la deja donde quedó.
    var AGARRE = { dmin: 0.35, dmax: 4, suave: 18 };
    function agarra(o, d, t, c, rotY, cab) {
      var hx = o.x + d.x * t, hy = o.y + d.y * t, hz = o.z + d.z * t, l = rotaY(c.x - hx, c.z - hz, -rotY);
      return { t: t, lx: l.x, ly: c.y - hy, lz: l.z, dr: ang(rotY - Math.atan2(cab.x - hx, cab.z - hz)) };
    }
    function arrastra(a, o, d, cab, prev, dt) {
      var hx = o.x + d.x * a.t, hy = o.y + d.y * a.t, hz = o.z + d.z * a.t, w = rotaY(a.lx, a.lz, Math.atan2(cab.x - hx, cab.z - hz) + a.dr);
      var p = { x: hx + w.x, y: hy + a.ly, z: hz + w.z }, dx = p.x - cab.x, dz = p.z - cab.z, dh = Math.hypot(dx, dz);
      if (dh > 1e-6 && (dh < AGARRE.dmin || dh > AGARRE.dmax)) { var k = Math.max(AGARRE.dmin, Math.min(AGARRE.dmax, dh)) / dh; p.x = cab.x + dx * k; p.z = cab.z + dz * k; }
      if (prev && dt > 0) { var s = Math.min(1, dt * AGARRE.suave); p.x = prev.x + (p.x - prev.x) * s; p.y = prev.y + (p.y - prev.y) * s; p.z = prev.z + (p.z - prev.z) * s; }
      p.rotY = mirando(cab, p); return p;
    }
    return { LEJOS: LEJOS, DIST: DIST, BAJO: BAJO, PX_M: PX_M, TOPES: TOPES, toque: toque, giro: giro, medidas: medidas, valida: valida, grados: grados, hueco: hueco, legible: legible,
      ang: ang, rotaY: rotaY, miradaH: miradaH, mirando: mirando, nace: nace, desvio: desvio, AGARRE: AGARRE, agarra: agarra, arrastra: arrastra };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/laminas.test.js con un THREE de mentira, para contar lo que crea y lo que libera)
  var Laminas = (function () {
    var P = LaminasPuro, LS = {}, cuenta = { abiertas: 0, cerradas: 0, pintadas: 0 }, vC = new THREE.Vector3(), vD = new THREE.Vector3(), acum = 0, PERIODO = 0.5;
    function enVR() { return !!VRX.on; }
    function cabeza(v) { if (enVR()) return v.copy(VRX.cab); camera.updateMatrixWorld(); return v.setFromMatrixPosition(camera.matrixWorld); }
    // hacia dónde se mira, en horizontal: en VR, VRX.mira (la pose de la cabeza del XRFrame girada por el rig; la calcula 29_vr.js al leer la cabeza). NO camera.getWorldDirection:
    // en VR, tras mover el paseo (12_paseo.js) la cámara lleva la posición del mundo como si fuera local al rig y su lookAt apunta a cualquier parte (VR-L1)
    function mirada(v) {
      if (enVR() && VRX.mira) return { x: VRX.mira.x, z: VRX.mira.z };
      var g = camera.getWorldDirection(v); g.y = 0; if (g.lengthSq() < 1e-6) g.set(0, 0, -1); g.normalize(); return { x: g.x, z: g.z };
    }
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
      var geo = new THREE.PlaneGeometry(o.ancho, o.alto), mat = new THREE.MeshBasicMaterial(o.encima ? { map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false } : { map: tex, alphaTest: 0.5, fog: false, toneMapped: false });
      var m = new THREE.Mesh(geo, mat); m.name = o.nombre || "lamina:" + o.id; m.renderOrder = o.encima ? 998 : 10;
      var h = cabeza(vC), g = mirada(vD);
      var dist = o.dist && o.dist[modo] != null ? o.dist[modo] : P.DIST[modo], bajo = o.bajo && o.bajo[modo] != null ? o.bajo[modo] : P.BAJO[modo];   // a la altura de los ojos y delante de la mirada; luego se queda ahí
      var n = P.nace(h, g, dist, -bajo); m.position.set(n.x, n.y, n.z);   // VR-L1: el mismo punto de nacer que el panel y las fichas de 29_vr.js
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
    // el rayo de un mando cada fotograma (29_vr.js, solo con ?ui=capas): la lámina con alApuntar más cercana que toca recibe (u, v, t); la que deja de
    // tocar recibe una vez alApuntar(null, null, null). Solo mira las que tienen alApuntar (sin ellas, no lanza ningún rayo)
    function apunta(rr) {
      var mejor = null, ids = Object.keys(LS);
      ids.forEach(function (id) {
        var l = LS[id]; if (!l.o.alApuntar || !rr) return;
        var ix = rr.intersectObject(l.m, false)[0]; if (!ix || !ix.uv) return;
        if (!mejor || ix.distance < mejor.d) mejor = { d: ix.distance, l: l, uv: ix.uv };
      });
      ids.forEach(function (id) {
        var l = LS[id]; if (!l || !l.o.alApuntar) return;
        var t = null;
        if (mejor && mejor.l === l) { t = P.toque(mejor.uv, l.w, l.h); t.lam = l.lam; l.apuntada = true; }
        else if (l.apuntada) l.apuntada = false; else return;
        try { if (t) l.o.alApuntar(t.u, t.v, t); else l.o.alApuntar(null, null, null); } catch (e) { try { console.error("[Laminas] alApuntar " + id, e); } catch (e2) {} }
      });
      return mejor ? mejor.l.id : null;
    }
    // VR-L1, agarrar con el grip (29_vr.js): bajoRayo(rayo) → la lámina más cercana que toca el rayo { id, distancia, pos, rotY } o null (todas, tengan
    // alTocar o no); mueve(id, x, y, z, rotY) la deja ahí (queda anclada en el mundo, como al nacer) → bool
    function bajoRayo(rr) {
      var mejor = null;
      Object.keys(LS).forEach(function (id) {
        var l = LS[id], ix = rr ? rr.intersectObject(l.m, false)[0] : null; if (!ix) return;
        if (!mejor || ix.distance < mejor.distancia) mejor = { id: id, distancia: ix.distance, pos: [l.m.position.x, l.m.position.y, l.m.position.z], rotY: l.m.rotation.y };
      });
      return mejor;
    }
    function mueve(id, x, y, z, rotY) {
      var l = LS[id]; if (!l || !isFinite(x) || !isFinite(y) || !isFinite(z)) return false;
      l.m.position.set(x, y, z); if (isFinite(rotY)) l.m.rotation.set(0, rotY, 0); l.girando = false; l.m.updateMatrixWorld();
      return true;
    }
    function info(id) {
      var l = LS[id]; if (!l) return { abierta: false, modo: "", pos: null, rumbo: null, pintadas: 0, firma: "" };
      return { abierta: true, modo: l.modo, pos: [l.m.position.x, l.m.position.y, l.m.position.z], rumbo: rumboDe(l.m), pintadas: l.pintadas, firma: l.firma, w: l.w, h: l.h };
    }
    Bus.on("vr:sale", function () { Object.keys(LS).forEach(function (id) { if (LS[id] && LS[id].modo === "vr") cierra(id, "sale-vr"); }); });
    return { abre: abre, cierra: cierra, cierraTodas: cierraTodas, repinta: repinta, revisa: revisa, toca: toca, apunta: apunta, info: info, bajoRayo: bajoRayo, mueve: mueve, hay: function (id) { return !!LS[id]; }, ids: function () { return Object.keys(LS); },
      cuenta: function () { return { abiertas: cuenta.abiertas, cerradas: cuenta.cerradas, pintadas: cuenta.pintadas, vivas: Object.keys(LS).length }; } };
  })();
  // [motor:fin]
