// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Arboles
// Consume: 01_datos (FACTOR_R8), 02_mundo (Mundo, suelo, copaAlta, kcor, tinte, aviva, copas), 02b_cola (Cola),
//   03_escena (renderer, camera, exag, modo, calidad), 04_terreno (hash), 04c_olivos_tiles (OlivosTiles), 05_nube (ALTO_MAX, nube),
//   06_arboles (gArboles, tronco, arbolesG), 07_follaje (follajeG, construyeSombras), 07a_catalogo (Catalogo), 07ab_generados (Generados),
//   09_camara (objetivo, orb), 10_ndvi (ndviIdx), 12_paseo (paseando), 15_tiempo (nivel, esc, hace), 16_vida (mira)
// ===============================================================================
  // ---------- los olivos del modo Gemelo con tres niveles de detalle: el coste de dibujo no crece con la superficie de la finca
  // Nivel 0: celdas de 64 m con el modelo completo (copa medida, troncos, hojas, flores y aceitunas) alrededor de lo que se mira (o de quien pasea), hasta MAX0 olivos.
  // Nivel 1: olivos instanciados de ~170 triángulos con silueta de olivo: copa en vaso, lobulada y más ancha que alta (radios medidos, orientada según su eje largo), abierta por debajo, y tronco de 2 o 3 pies.
  // Nivel 2: una masa de ~30 triángulos por olivo, con la misma silueta rota por el sombreador. Más lejos no se dibuja el árbol: ya está en la ortofoto del suelo.
  // Las celdas siguen la cuadrícula UTM de las teselas (4 × 4 celdas por tesela), así que los puntos LiDAR de una celda están todos en una sola tesela.
  // Para que los árboles buenos aparezcan pronto: se mide el tiempo por fotograma (el tope de olivos y el radio de nivel 0 crecen si el aparato va sobrado y bajan si va justo),
  // las celdas se construyen por delante de quien se mueve y, en modo Nube, se «precargan» las de alrededor para que pulsar «Gemelo» no espere.
  var Arboles = (function () {
    var version = 0, CEL = 64, MAX0 = 450, MAX1 = 3000, MAX2 = 16000, U1 = 460, U2 = 1600, TOPE_TRI = 550000, TRI0 = 800, TRI1 = 170, TRI2 = 30, NP1 = Catalogo.variantes(Catalogo.SIN, 1), NP2 = Catalogo.variantes(Catalogo.SIN, 2);
    var olivos = copas.filter(function (c) { return c.oliv; }), celdas = {}, ultima = { x: 1e9, y: 1e9, z: 1e9, fx: 0, fz: 0, tms: 0, exag: -1, k: "" }, t = 0, sucio = true, nL0 = 0, n1 = 0, n2 = 0, faltan = 0, nPre = 0, triEst = 0;
    var cx = Mundo.cx, cy = Mundo.cy, m4 = new THREE.Matrix4(), c3 = [0, 0, 0], vel = { x: 0, z: 0 };
    var vrP = null, TOPE_TRI0 = TOPE_TRI;   // perfil de las gafas VR (29_vr.js): menos olivos de nivel 0, radio más corto y menos triángulos
    // el aparato: escala (0,7–2,5) de cuántos olivos de nivel 0 se pagan; sube si los fotogramas van holgados y baja si van justos (?arbsc=1 la fija).
    // Por encima de 1,6 solo con fotogramas muy holgados (< 16 ms): un aparato sobrado ve olivos detallados más lejos (radio hasta ~330 m en órbita).
    var fijaSc = /[?&]arbsc=([0-9.]+)/.exec(location.search), esc = fijaSc ? Number(fijaSc[1]) : 1, emaDt = 0.017, claveDib = "";
    function claveActual() { return exag + "|" + calidad + "|" + kcor + "|" + tinte + "|" + ndviIdx; }   // lo que está pegado a la geometría de una celda de nivel 0: si cambia, la celda se rehace

    // ----- las formas de los niveles 1 y 2 las da el catálogo (07a_catalogo.js): el tipo −1 son las de siempre, 4 variantes en L1 (copa + tronco) y 2 en L2
    function instancias(geo, mat, cap, color) { var m = new THREE.InstancedMesh(geo, mat, cap); if (color) m.setColorAt(0, new THREE.Color(1, 1, 1)); m.frustumCulled = false; m.count = 0; gArboles.add(m); return m; }
    var iCopa1 = [], iTron1 = [], iCopa2 = [], p, pz;
    for (p = 0; p < NP1; p++) { pz = Catalogo.geometria(Catalogo.SIN, 1, p); iCopa1.push(instancias(pz[0].geo, pz[0].mat, MAX1, true)); iTron1.push(instancias(pz[1].geo, pz[1].mat, MAX1, false)); }
    for (p = 0; p < NP2; p++) { pz = Catalogo.geometria(Catalogo.SIN, 2, p); iCopa2.push(instancias(pz[0].geo, pz[0].mat, MAX2, true)); }
    // los olivos-tipo de un catálogo cargado (ADR-0012): un juego de mallas instanciadas por tipo (una por pieza y nivel); vacío mientras no haya catálogo,
    // y entonces cada olivo, con o sin tipo en el registro, se dibuja como el tipo −1 (lo de siempre). El nivel 0 sigue siendo la copa medida de cada árbol.
    var extra = {};
    function montaTipos() {
      Object.keys(extra).forEach(function (t) { extra[t].m1.concat(extra[t].m2).forEach(function (m) { gArboles.remove(m); if (m.dispose) m.dispose(); }); });
      extra = {};
      Catalogo.tipos().forEach(function (t) {
        if (t === Catalogo.SIN) return;
        var mk = function (nivel, cap) { return Catalogo.geometria(t, nivel, 0).map(function (q) { return instancias(q.geo, q.mat, cap, q.pieza === "copa"); }); };
        extra[t] = { m1: mk(1, MAX1), m2: mk(2, MAX2), caja: Catalogo.info(t).caja, n1: 0, n2: 0 };
      });
      sucio = true;
    }
    Catalogo.alCambiar(montaTipos);
    function colocaModelo(X, c, l1, gz, tc) {   // un modelo del catálogo: pivote en la base del tronco y en metros; se estira a la altura y a los ejes de la copa medida
      var B = X.caja, sx = c.rx / B.rx, sz = c.rz / B.rz, sy = Math.max(c.h, 1) / B.alto * exag, cs = Math.cos(c.ang), sn = Math.sin(c.ang), e = m4.elements;
      e[0] = cs * sx; e[1] = 0; e[2] = -sn * sx; e[3] = 0; e[4] = 0; e[5] = sy; e[6] = 0; e[7] = 0; e[8] = sn * sz; e[9] = 0; e[10] = cs * sz; e[11] = 0; e[12] = c.x; e[13] = gz; e[14] = -c.y; e[15] = 1;
      var ms = l1 ? X.m1 : X.m2, n = l1 ? X.n1++ : X.n2++;
      ms.forEach(function (m) { m.setMatrixAt(n, m4); if (m.instanceColor) m.setColorAt(n, tc); });
    }

    // registro: celda, altura del suelo, forma y color de cada olivo (del mosaico: sirve de lejos)
    function clave(i, j) { return i * 100000 + j; }
    var listo0 = false;
    function inicia() {
      listo0 = true;
      olivos.forEach(function (c) {
        c.gz = suelo(c.x, c.y); c.rm = c.perfil.reduce(function (a, b) { return a + b; }, 0) / 8; var ci = Math.floor((c.x + cx) / CEL), cj = Math.floor((c.y + cy) / CEL), k = clave(ci, cj);
        c.cel = celdas[k] || (celdas[k] = { k: k, i: ci, j: cj, x0: ci * CEL - cx, y0: cj * CEL - cy, arr: [], g: null, sucia: true, visto: 0, en: false, pre: false, enAntes: false, prio: 0, ts: Mundo.tesela(ci * CEL - cx + CEL / 2, cj * CEL - cy + CEL / 2) });
        c.cel.arr.push(c);
        Mundo.ortoGrueso(c.x, c.y, c3); c.cr = c3[0]; c.cg = c3[1]; c.cb = c3[2];
        // la silueta: el eje largo de la copa medida (pares de radios opuestos) y su perpendicular; semiejes = r8 × FACTOR_R8 (01_datos.js; hoy 0,5)
        var P = c.perfil, L = [0, 1, 2, 3].map(function (q) { return (P[q] + P[q + 4]) / 2; }), im = 0; for (var q2 = 1; q2 < 4; q2++) if (L[q2] > L[im]) im = q2;
        c.ang = im * Math.PI / 4; c.rx = Math.max(0.6, L[im] * FACTOR_R8); c.rz = Math.max(0.6, L[(im + 2) % 4] * FACTOR_R8); c.pr = Math.min(NP1 - 1, Math.floor(hash(c.i * 7.7 + 1) * NP1)); c.vf = 0.88 + 0.26 * hash(c.i * 3.7);
      });
    }
    function libera(g) { g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    // los puntos LiDAR de una celda: se reparten una vez por tesela en un mapa de celda → índices (a rebanadas)
    function* binsG(ts) {
      if (ts.bins) return; var A = ts.pts, b = {};
      for (var q = 0; q < A.length; q += 3) { var k = clave(Math.floor((ts.ox + A[q] / 100 + cx) / CEL), Math.floor((ts.oy + A[q + 1] / 100 + cy) / CEL)); (b[k] || (b[k] = [])).push(q); if (q % 60000 === 59997) yield; }
      ts.bins = b;
    }
    function* puntosCeldaG(cel) {
      var ts = cel.ts, P = { x: [], y: [], z: [], h: [], b: [], n: 0 }; if (!ts || !ts.pts) return P;
      while (!ts.bins) { if (!Cola.hay("B" + ts.key)) Cola.add("B" + ts.key, cel.prio - 1, binsG(ts)); yield; }
      var L = ts.bins[cel.k] || [], A2 = ts.pts;
      for (var i = 0; i < L.length; i++) {
        var q2 = L[i], px = ts.ox + A2[q2] / 100, py = ts.oy + A2[q2 + 1] / 100, pz = A2[q2 + 2] / 100, h = pz - suelo(px, py);
        if (i % 4000 === 3999) yield;
        if (h > ALTO_MAX) continue;
        P.x.push(px); P.y.push(py); P.z.push(pz); P.h.push(h); P.b.push(h < 2.0 && copaAlta(px, py) > 2.6 ? 1 : 0); P.n++;
      }
      return P;
    }
    function* celdaG(cel) {   // el nivel 0 de una celda: puntos, copas y troncos, hojas y frutos
      if (cel.ts) yield* Mundo.aseguraOrto(cel.ts);
      var P = yield* puntosCeldaG(cel), ms = yield* arbolesG(cel.arr), g = new THREE.Group();
      ms.forEach(function (m) { g.add(m); });
      yield* follajeG(cel.arr, P, g);
      return g;
    }
    function encolaCelda(cel) {
      var kd = claveActual();
      Cola.add("C" + cel.k, cel.prio, celdaG(cel), function (g) {
        if (cel.g) { gArboles.remove(cel.g); libera(cel.g); }
        cel.g = g; g.visible = false; gArboles.add(g); cel.kd = kd; cel.sucia = kd !== claveActual(); sucio = true;
      });
    }
    function quitaCelda(cel) { Cola.cancela("C" + cel.k); if (cel.g) { gArboles.remove(cel.g); libera(cel.g); cel.g = null; } cel.sucia = true; }
    // distancia horizontal del foco (el punto que se mira, o quien pasea) al borde de la celda, con un adelanto hacia donde se va
    function distFoco(cel, fx, fz) {
      var mx = cel.x0 + CEL / 2, mz = -(cel.y0 + CEL / 2), dx = Math.max(0, Math.abs(fx - mx) - CEL / 2), dz = Math.max(0, Math.abs(fz - mz) - CEL / 2), d = Math.sqrt(dx * dx + dz * dz), sp = Math.hypot(vel.x, vel.z);
      if (sp > 0.8) { var ux = (mx - fx), uz = (mz - fz), l = Math.hypot(ux, uz) || 1, ahead = (ux * vel.x + uz * vel.z) / (l * sp); d -= 42 * ahead * Math.min(1, sp / 4); }
      return Math.max(0, d);
    }
    function radioNivel0() { return paseando ? 112 * Math.sqrt(esc) * (vrP ? vrP.r : 1) : orb.dist < 520 ? Math.min(210, 40 + orb.dist * 0.5) * Math.sqrt(esc) : 0; }
    function radioPre() { return paseando ? 175 : orb.dist < 1100 ? 190 : 0; }

    function reclasifica() {
      var cam = camera.position, vis = gArboles.visible, ahora = performance.now(), R0 = vis ? radioNivel0() : 0, RP = radioPre(), todas = Object.keys(celdas).map(function (k) { return celdas[k]; });
      var fx = paseando ? cam.x : objetivo.x, fz = paseando ? cam.z : objetivo.z, dts = (ahora - ultima.tms) / 1000;
      if (ultima.tms && dts > 0.05 && dts < 3) { vel.x = 0.55 * vel.x + 0.45 * (fx - ultima.fx) / dts; vel.z = 0.55 * vel.z + 0.45 * (fz - ultima.fz) / dts; } else if (!ultima.tms || dts >= 3) { vel.x = vel.z = 0; }
      ultima.fx = fx; ultima.fz = fz; ultima.tms = ahora;
      // ?escena=tiles (04c_olivos_tiles.js): los olivos de media y larga distancia los dibuja el tileset y sus triángulos cuentan en el tope
      var TIL = OlivosTiles.dibuja(), triTil = TIL ? OlivosTiles.triangulos() : 0;
      // el foco de los generados, paseando, es quien pasea (pp), no la cámara: la cámara va detrás y, al girar en el sitio, describe un círculo
      // que cambiaba el plan y rehacía el lote (Antonio, en el móvil: «si giras sin moverte llega a desaparecer»)
      var GEN = Generados.actualiza(paseando ? pp.x : fx, paseando ? -pp.y : fz, Math.max(0, TOPE_TRI - triTil), olivos, esc);   // ?olivos=gen (07ab): dentro de su radio, el nivel 0 de siempre se apaga; sin la bandera, radio 0
      // el aparato manda: sube o baja la escala según el tiempo por fotograma medido
      if (!fijaSc) {
        // por encima de 1,6 solo si además el fotograma va por debajo de 1,4 M triángulos; si pasa del techo de diseño (1,7 M, ADR-0002), baja
        var triFot = renderer.info.render.triangles, techo = emaDt < 0.016 && triFot < 1400000 ? 2.5 : 1.6;
        if (triFot > 1700000 && esc > 1.6) esc = Math.max(1.6, esc - 0.10);
        else if (emaDt < 0.020) esc = Math.min(Math.max(techo, esc > 1.6 ? esc : 0), esc + 0.05);
        else if (emaDt > 0.030) esc = Math.max(0.7, esc - 0.10);
      }
      var tope0 = MAX0 * esc * (vrP ? vrP.n : 1);
      // 1) celdas de nivel 0 (las que se ven) y de precarga (las de alrededor y las de delante, que se construyen sin enseñarse)
      var bajo = !paseando && cam.y - suelo(cam.x, -cam.z) * exag < 45, RC = 95 * Math.sqrt(esc);   // con la cámara a ras de suelo se ve hasta lejos: también cuentan las celdas de su alrededor
      todas.forEach(function (c) { c.d = distFoco(c, fx, fz); if (bajo && R0 > 0) c.d = Math.min(c.d, distFoco(c, cam.x, cam.z) * R0 / RC); c.enAntes = c.en; c.en = false; c.pre = false; });
      var ok = todas.filter(function (c) { return c.ts && c.ts.estado === 2; }).sort(function (a, b) { return a.d - b.d; }), tot = 0, totP = 0;
      ok.forEach(function (c) {
        var lim = c.enAntes ? R0 * 1.15 : R0;
        if (vis && c.d < lim && !(c.d < GEN.radio) && (tot + c.arr.length <= tope0 || tot === 0)) { c.en = true; tot += c.arr.length; }
        else if (c.d < RP && totP + tot + c.arr.length <= tope0 * 1.6) { c.pre = true; totP += c.arr.length; }
      });
      faltan = 0; nPre = 0;
      todas.forEach(function (c) {
        if (c.en || c.pre) {
          c.visto = ahora; if (c.pre) nPre++;
          c.prio = c.en ? c.d : c.d + 300;
          if (!c.g || c.sucia) { if (c.en) faltan++; encolaCelda(c); }
        } else { if (Cola.hay("C" + c.k)) Cola.cancela("C" + c.k); if (c.g && ahora - c.visto > 8000) quitaCelda(c); }
        if (c.g) c.g.visible = c.en && !c.sucia;   // mientras se rehace, los olivos de esa celda se ven en los niveles 1 y 2
      });
      // 2) el resto, por distancia: nivel 1 (los más cercanos) y nivel 2; los de una celda de nivel 0 ya construida y visible no se repiten
      var rest = [], tri0 = 0, cerca = []; nL0 = 0;
      if (vis) olivos.forEach(function (c) {
        if (c.cel.en && c.cel.g && c.cel.g.visible) { nL0++; cerca.push(c.i); return; }
        if (GEN.tiene(c.i)) { cerca.push(c.i); return; }   // lo dibuja Generados
        if (TIL) return;   // lo dibuja el tileset
        var dx = c.x - cam.x, dz = -c.y - cam.z, dy = Math.max(0, cam.y - c.gz * exag); c.d = Math.sqrt(dx * dx + dz * dz + dy * dy); if (c.d < U2) rest.push(c);
      });
      if (TIL) { OlivosTiles.cerca(cerca); triTil = OlivosTiles.triangulos(); }   // la máscara: los de cerca no se dibujan también en el tileset
      tri0 = nL0 * TRI0 + GEN.tri; rest.sort(function (a, b) { return a.d - b.d; });
      var tope1 = Math.max(500, Math.min(MAX1, Math.floor((TOPE_TRI - tri0 - TRI2 * Math.min(MAX2, rest.length)) / TRI1)));
      var cnt1 = [], cnt2 = [], a1 = 0, a2 = 0, tc = new THREE.Color(), mm = m4, e = mm.elements, i, k;
      for (k = 0; k < NP1; k++) cnt1.push(0); for (k = 0; k < NP2; k++) cnt2.push(0);
      for (k in extra) extra[k].n1 = extra[k].n2 = 0;
      for (i = 0; i < rest.length; i++) {
        var c = rest[i], ht = Math.min(1.5, Math.max(0.9, c.h * 0.3)), cb = ht + 0.1, top = Math.max(c.h, cb + 1.4), gz = c.gz * exag, H = (top - cb) * 0.82 * exag, cs = Math.cos(c.ang), sn = Math.sin(c.ang);
        var l1 = a1 < tope1 && c.d < U1;
        if (!l1 && a2 >= MAX2) continue;
        c3[0] = c.cr; c3[1] = c.cg; c3[2] = c.cb; aviva(c3, c.x, c.y);   // el tinte NDVI, si está activo, también llega de lejos
        tc.setRGB(c3[0] * 0.74 * c.vf, c3[1] * 0.88 * c.vf, c3[2] * 0.64 * c.vf);   // un verde plateado algo distinto en cada olivo
        var X = c.tipo !== -1 ? extra[c.tipo] : null;   // olivo con un tipo del catálogo cargado (y piezas en este nivel); si no, el de siempre
        if (X && (l1 ? X.m1 : X.m2).length) { colocaModelo(X, c, l1, gz, tc); if (l1) a1++; else a2++; continue; }
        var sx = c.rx, sz = c.rz;
        e[0] = cs * sx; e[1] = 0; e[2] = -sn * sx; e[3] = 0; e[4] = 0; e[5] = H; e[6] = 0; e[7] = 0; e[8] = sn * sz; e[9] = 0; e[10] = cs * sz; e[11] = 0; e[12] = c.x; e[13] = gz + cb * exag; e[14] = -c.y; e[15] = 1;
        if (l1) {
          var q = c.pr, n = cnt1[q]++; a1++; iCopa1[q].setMatrixAt(n, mm); iCopa1[q].setColorAt(n, tc);
          e[0] = cs; e[2] = -sn; e[5] = (cb + 0.35) * exag; e[8] = sn; e[10] = cs; iTron1[q].setMatrixAt(n, mm);
        } else { var q2 = c.pr % NP2, n2b = cnt2[q2]++; a2++; iCopa2[q2].setMatrixAt(n2b, mm); iCopa2[q2].setColorAt(n2b, tc); }
      }
      for (k = 0; k < NP1; k++) { iCopa1[k].count = iTron1[k].count = cnt1[k]; iCopa1[k].instanceMatrix.needsUpdate = iTron1[k].instanceMatrix.needsUpdate = true; if (iCopa1[k].instanceColor) iCopa1[k].instanceColor.needsUpdate = true; }
      for (k = 0; k < NP2; k++) { iCopa2[k].count = cnt2[k]; iCopa2[k].instanceMatrix.needsUpdate = true; if (iCopa2[k].instanceColor) iCopa2[k].instanceColor.needsUpdate = true; }
      for (k in extra) [[extra[k].m1, extra[k].n1], [extra[k].m2, extra[k].n2]].forEach(function (mn) { mn[0].forEach(function (m) { m.count = mn[1]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }); });
      n1 = a1; n2 = a2; triEst = tri0 + a1 * TRI1 + a2 * TRI2 + triTil;
      ultima.x = cam.x; ultima.y = cam.y; ultima.z = cam.z; ultima.exag = exag; ultima.k = tinte + "|" + ndviIdx + "|" + kcor; sucio = false;
    }
    function tileCargada(ts) {   // llegaron los datos de una tesela: la altura de sus olivos pasa del relieve grueso al fino
      Object.keys(celdas).forEach(function (k) { var c = celdas[k]; if (c.ts !== ts) return; c.arr.forEach(function (o) { o.gz = suelo(o.x, o.y); }); c.sucia = true; }); sucio = true;
    }
    function refresca() {   // cambió algo que afecta a todos (exageración, calidad, corrección de la ortofoto, tinte): las celdas se reconstruyen poco a poco; si no cambió nada (p. ej. pulsar «Gemelo»), no se toca lo ya construido
      var kd = claveActual(); sucio = true; construyeSombras(); if (kd === claveDib) return;
      claveDib = kd; Object.keys(celdas).forEach(function (k) { var c = celdas[k]; Cola.cancela("C" + k); if (c.g && c.kd !== kd) c.sucia = true; });
    }
    function actualiza(dt, forzar) {
      if (!listo0) return;
      // ?olivos=gen: los generados avanzan su cola propia (con una parte del presupuesto de la Cola: la mitad, el 30 % si faltan celdas de nivel 0, y todo
      // si la Cola no tiene nada) y su fundido; al colocar un lote o acabar el fundido, se reparte de nuevo. Sin la bandera, no hace nada y no gasta
      if (Generados.paso(dt, presupuestoBase() * (!Cola.pendientes() ? 1 : faltan > 0 ? 0.3 : 0.5))) sucio = true;
      emaDt += (Math.min(dt, 0.1) - emaDt) * 0.04;
      var vis = gArboles.visible; if (!vis && modo !== "nube") return;   // en modo Ortofoto no hay árboles; en modo Nube se precargan los de alrededor
      t += dt;
      var cam = camera.position, umbral = paseando ? 2.5 : 6, mueve = Math.hypot(cam.x - ultima.x, cam.y - ultima.y, cam.z - ultima.z) > umbral, k = tinte + "|" + ndviIdx + "|" + kcor;
      if (forzar || sucio || ultima.exag !== exag || ultima.k !== k || (mueve && t > 0.25) || t > (paseando ? 0.7 : 1.5)) { t = 0; reclasifica(); }
    }
    function presupuesto() { return Math.max(0.5, presupuestoBase() - Generados.gastado()); }   // lo que ya gastaron los generados este fotograma, se descuenta
    function presupuestoBase() {   // ms por fotograma para la cola: más si faltan olivos de nivel 0 en lo que se ve y el aparato va holgado
      var justo = emaDt > 0.034; if (faltan > 0 && !justo) return paseando ? 8 : 12; return justo ? (paseando ? 3 : 4.5) : (paseando ? 3.5 : 6);
    }
    function perfil(p) { vrP = p || null; TOPE_TRI = p ? p.tri : TOPE_TRI0; sucio = true; }
    function resumen() { return { olivos: olivos.length, nivel0: nL0, nivel1: n1, nivel2: n2, celdas: Object.keys(celdas).length, construidas: Object.keys(celdas).filter(function (k) { return celdas[k].g; }).length, faltan: faltan, precarga: nPre, esc: +esc.toFixed(2), triEst: triEst, tiles: OlivosTiles.dibuja(), emaMs: +(emaDt * 1000).toFixed(1) }; }
    return { perfil: perfil, inicia: inicia, tileCargada: tileCargada, refresca: refresca, actualiza: actualiza, presupuesto: presupuesto, resumen: resumen, celdas: celdas };
  })();
