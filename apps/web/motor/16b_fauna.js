// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (copas, cIn), 02c_componentes (Componentes), 03_escena (scene, camera, exag), 07_follaje (matSombra, geoSombra),
//   12_paseo (paseando), 15_tiempo (nivelEn, cur), 16_vida (tVida, enQuad, gFauna, altSuelo, mira, actualizaVida), 17_minimapa (Minimapa)
// ===============================================================================

  // ---------- la fauna del olivar (componente «fauna-olivar», ADR-0023, C10 segunda tanda): las aves (dos bandadas que dan vueltas de día, ocho posadas que se
  // espantan) y los seis conejos que pastan y huyen. Antes vivían en 16_vida.js y actualizaVida() las movía; ahora solo se registra (fase «mundo»). Se enteran de
  // que empieza o acaba el paseo por «paseo:entra» / «paseo:sale» (los emite 16_vida.js al entrar y salir del paseo), preguntan si hay algo de lo que huir con
  // «perros:amenaza» (como antes) y responden a «fauna:conejo-cerca» (los perros buscan un conejo a quien perseguir). Pintan sus conejos en el minimapa con
  // Minimapa.capa. El grupo gFauna (la fauna que cuelga de él, incluidos los perros) y su casilla «Fauna» siguen en 16_vida.js. ?fauna=0 la apaga: ni aves ni conejos.
  var faunaSuelta = null;   // lo que libera el componente montado
  function FaunaMotor(n) {
    var matAla = new THREE.MeshLambertMaterial({ color: 0x302b2a, side: THREE.DoubleSide });
    var matConejoInst = new THREE.MeshLambertMaterial({ vertexColors: true });   // los conejos: una sola material, con el color por vértice (pelo, panza clara, orejas)
    // --- pájaros: el ave mira hacia -z. Cada ave es un Group SIN hijos (solo lleva la posición, el giro y la fase); se dibujan todas juntas
    // con dos mallas instanciadas (2 llamadas, antes 7 por ave): el cuerpo (una geometría fusionada con el color por vértice) y las alas
    // (2 por ave, con la bisagra del aleteo calculada por matriz cada fotograma, igual que giraba el pivote antes).
    // varias geometrías indexadas en una, con su color por vértice (partes = [[geometría, THREE.Color], …]); las libera. Sirve a las aves y a los conejos.
    function fusiona(partes) {
      var nv = 0, ni = 0; partes.forEach(function (p) { nv += p[0].attributes.position.count; ni += p[0].index.count; });
      var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint16Array(ni), o = 0, oi = 0;
      partes.forEach(function (p) {
        var g = p[0], n = g.attributes.position.count, c = p[1]; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        for (var k = 0; k < n; k++) { col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b; }
        for (var t = 0; t < g.index.count; t++) idx[oi + t] = g.index.array[t] + o;
        o += n; oi += g.index.count; g.dispose();
      });
      var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      return geo;
    }
    var NAVES = 22, geoAveCuerpo = (function () {   // cuerpo, vientre, cabeza, pico y cola en una sola geometría
      var partes = [], m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion();
      function parte(geo, hex, sx, sy, sz, x, y, z, rx) { m4.compose(new THREE.Vector3(x, y, z), rx ? q0.setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx) : q0.identity(), new THREE.Vector3(sx, sy, sz)); geo.applyMatrix4(m4); partes.push([geo, new THREE.Color(hex)]); }
      parte(new THREE.SphereGeometry(0.1, 10, 8), 0x4a3f33, 0.85, 0.8, 1.8, 0, 0, 0); parte(new THREE.SphereGeometry(0.1, 10, 8), 0xd9cdb4, 0.7, 0.45, 1.2, 0, -0.035, 0.02);
      parte(new THREE.SphereGeometry(0.065, 10, 8), 0x4a3f33, 1, 1, 1, 0, 0.03, -0.2); parte(new THREE.ConeGeometry(0.022, 0.08, 5), 0xd49a30, 1, 1, 1, 0, 0.025, -0.3, -Math.PI / 2);
      parte(new THREE.BoxGeometry(0.07, 0.012, 0.2), 0x4a3f33, 1, 1, 1, 0, 0.01, 0.27);
      return fusiona(partes);
    })();
    var geoAla = (function () { var g = new THREE.PlaneGeometry(0.44, 0.2); g.rotateX(-Math.PI / 2); g.translate(0.22, 0, 0); return g; })();   // el ala derecha; la izquierda es su espejo
    var matAveInst = new THREE.MeshLambertMaterial({ vertexColors: true });
    var mallaAveCuerpo = new THREE.InstancedMesh(geoAveCuerpo, matAveInst, NAVES), mallaAveAlas = new THREE.InstancedMesh(geoAla, matAla, NAVES * 2);
    [mallaAveCuerpo, mallaAveAlas].forEach(function (im) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; im.visible = false; gFauna.add(im); });
    mallaAveCuerpo.name = "aves"; mallaAveAlas.name = "aves-alas";
    var aves = [], tmpAlaM = new THREE.Matrix4(), tmpAlaA = new THREE.Matrix4(), tmpAlaQ = new THREE.Quaternion(), tmpAlaP = new THREE.Vector3(), tmpAlaS = new THREE.Vector3(), EJE_Z = new THREE.Vector3(0, 0, 1);
    // sl = la casilla (instancia) que ocupó la última vez que se empacó y cpx…can = lo que se empacó entonces: si no cambia, la matriz que ya está en la malla vale (AG-1.4b)
    function creaAve() { var g = new THREE.Group(); g.userData = { ang: 0, fase: Math.random() * 6.28, sl: -1, cpx: 0, cpy: 0, cpz: 0, crx: 0, cry: 0, crz: 0, csx: 0, csy: 0, csz: 0, can: 0 }; aves.push(g); return g; }
    function aleteo(g, quieta, rapido) { var u = g.userData; u.ang = quieta ? 0.05 : Math.sin(tVida * (rapido ? 22 : 15) + u.fase) * 0.85; }
    var empN = -1;   // cuántas aves se empacaron la vez anterior
    function empacaAves() {   // las aves visibles, juntas en las dos mallas (una vez por fotograma)
      var n = 0, sucio = false;
      for (var i = 0; i < aves.length; i++) {
        var g = aves[i], u = g.userData; if (!g.visible) { u.sl = -1; continue; }   // la que no se ve no se calcula, y pierde su casilla
        var p = g.position, r = g.rotation, sc = g.scale;
        // solo se recalcula la matriz del ave (y las de sus alas) si cambió algo desde la última vez que se empacó en esta misma casilla: las posadas, quietas, no cambian
        if (u.sl !== n || u.cpx !== p.x || u.cpy !== p.y || u.cpz !== p.z || u.crx !== r.x || u.cry !== r.y || u.crz !== r.z || u.csx !== sc.x || u.csy !== sc.y || u.csz !== sc.z || u.can !== u.ang) {
          u.sl = n; u.cpx = p.x; u.cpy = p.y; u.cpz = p.z; u.crx = r.x; u.cry = r.y; u.crz = r.z; u.csx = sc.x; u.csy = sc.y; u.csz = sc.z; u.can = u.ang; sucio = true;
          g.updateMatrix(); mallaAveCuerpo.setMatrixAt(n, g.matrix);
          for (var l = -1; l <= 1; l += 2) {   // l = -1 izquierda (espejo), 1 derecha; la bisagra gira l·(-ang) como antes (ai = +a, ad = -a)
            tmpAlaQ.setFromAxisAngle(EJE_Z, -l * u.ang); tmpAlaP.set(l * 0.05, 0.02, -0.02); tmpAlaS.set(l, 1, 1);
            tmpAlaA.compose(tmpAlaP, tmpAlaQ, tmpAlaS); tmpAlaM.multiplyMatrices(g.matrix, tmpAlaA); mallaAveAlas.setMatrixAt(n * 2 + (l < 0 ? 0 : 1), tmpAlaM);
          }
        }
        n++;
      }
      if (n !== empN) { empN = n; sucio = true; }
      mallaAveCuerpo.count = n; mallaAveAlas.count = n * 2; mallaAveCuerpo.visible = mallaAveAlas.visible = n > 0;   // vacía no se dibuja (three cuenta la llamada aunque no haya instancias)
      if (sucio) { mallaAveCuerpo.instanceMatrix.needsUpdate = true; mallaAveAlas.instanceMatrix.needsUpdate = true; }   // sin cambios, no se vuelve a subir el búfer
    }
    function empacaConejos() {   // los conejos visibles, juntos en las cuatro mallas (una vez por fotograma)
      var n = 0;
      for (var i = 0; i < conejos.length; i++) {
        var g = conejos[i]; if (!g.visible) continue;
        var u = g.userData, cab = u.cab, o0 = u.orejas[0], o1 = u.orejas[1];
        g.updateMatrix(); mallaConCuerpo.setMatrixAt(n, g.matrix); mallaConSombra.setMatrixAt(n, tmpConM.multiplyMatrices(g.matrix, matSombraCon));
        cab.updateMatrix(); mallaConCabeza.setMatrixAt(n, tmpConM.multiplyMatrices(g.matrix, cab.matrix));
        o0.updateMatrix(); mallaConOrejas.setMatrixAt(n * 2, tmpConM.multiplyMatrices(g.matrix, o0.matrix));
        o1.updateMatrix(); mallaConOrejas.setMatrixAt(n * 2 + 1, tmpConM.multiplyMatrices(g.matrix, o1.matrix));
        n++;
      }
      mallaConCuerpo.count = mallaConCabeza.count = mallaConSombra.count = n; mallaConOrejas.count = n * 2;
      for (var k = 0; k < mallasCon.length; k++) { mallasCon[k].visible = n > 0; mallasCon[k].instanceMatrix.needsUpdate = true; }   // vacías no se dibujan
    }
    function disposaConejos() { mallasCon.forEach(function (im) { im.dispose(); gFauna.remove(im); }); geoConCuerpo.dispose(); geoConCabeza.dispose(); geoConOreja.dispose(); matConejoInst.dispose(); }
    function disposaAves() { geoAveCuerpo.dispose(); geoAla.dispose(); matAveInst.dispose(); matAla.dispose(); mallaAveCuerpo.dispose(); mallaAveAlas.dispose(); gFauna.remove(mallaAveCuerpo); gFauna.remove(mallaAveAlas); }
    function escalaVista(g, base) { var d = camera.position.distanceTo(g.position); g.scale.setScalar(base * Math.max(1, Math.min(9, d / 60))); }
    var bandada = [], bC = [0, 0], bS = [0, 0], bHx = [0, 0], bHy = [0, 0], bRz = [0, 0], BANDADAS = [{ a: 320, b: 150, w: 0.11, h: 38, ph: 0 }, { a: 210, b: 260, w: -0.085, h: 55, ph: 2.4 }];
    BANDADAS.forEach(function (b, k) { for (var i = 0; i < 7; i++) { var g = creaAve(); g.userData.b = k; g.userData.of = [(Math.random() - 0.5) * 26, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 26]; g.userData.fx = 0.5 + Math.random(); bandada.push(g); } });
    var posadas = [];
    for (var ip = 0; ip < 8; ip++) { var av0 = creaAve(); av0.visible = false; av0.userData.est = "fuera"; av0.userData.t = 0; posadas.push(av0); }

    // --- conejos: cada conejo es un Group SIN hijos (solo lleva la posición y el giro) y su cabeza y sus dos orejas son Object3D sueltos (no cuelgan de
    // nada: solo llevan su pose local). Se dibujan los seis juntos con cuatro mallas instanciadas (4 llamadas, antes 6 por conejo): el cuerpo con la cola
    // (geometría fusionada con el color por vértice), la cabeza, las orejas (2 por conejo) y la sombra. La matriz de cada pieza es la del conejo por la suya local.
    var NCON = 6, CON_CAB_Y = 0.32;
    function esfCol(r, hex, sx, sy, sz, x, y, z) { var g = new THREE.SphereGeometry(r, 10, 8); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz))); return [g, new THREE.Color(hex)]; }
    var geoConCuerpo = fusiona([esfCol(0.2, 0x8b755a, 0.78, 0.74, 1.25, 0, 0.2, 0), esfCol(0.05, 0xece4d4, 1, 1, 1, 0, 0.23, 0.27)]);   // cuerpo y cola
    var geoConCabeza = fusiona([[new THREE.SphereGeometry(0.12, 10, 8), new THREE.Color(0x8b755a)]]);   // la escala (0,9, 0,9, 1) va en la matriz de la cabeza
    var geoConOreja = fusiona([[new THREE.BoxGeometry(0.035, 0.2, 0.02), new THREE.Color(0xa88f78)]]);
    var mallaConCuerpo = new THREE.InstancedMesh(geoConCuerpo, matConejoInst, NCON), mallaConCabeza = new THREE.InstancedMesh(geoConCabeza, matConejoInst, NCON),
      mallaConOrejas = new THREE.InstancedMesh(geoConOreja, matConejoInst, NCON * 2), mallaConSombra = new THREE.InstancedMesh(geoSombra, matSombra, NCON);
    var mallasCon = [mallaConCuerpo, mallaConCabeza, mallaConOrejas, mallaConSombra];
    mallaConCuerpo.name = "conejos"; mallaConCabeza.name = "conejos-cabeza"; mallaConOrejas.name = "conejos-orejas"; mallaConSombra.name = "conejos-sombra";
    mallasCon.forEach(function (im) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; im.visible = false; gFauna.add(im); });
    var matSombraCon = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.03, 0), new THREE.Quaternion(), new THREE.Vector3(0.8, 1, 0.8)), tmpConM = new THREE.Matrix4();
    function creaConejo() {
      var g = new THREE.Group(), cab = new THREE.Object3D(); cab.position.set(0, CON_CAB_Y, -0.25); cab.scale.set(0.9, 0.9, 1);
      var orejas = [-1, 1].map(function (l) { var o = new THREE.Object3D(); o.position.set(l * 0.045, 0.52, -0.25); return o; });
      g.userData = { cab: cab, orejas: orejas, est: "fuera", t: 0, x: 0, y: 0, dir: 0, fase: Math.random() * 6, ax: 1e30, ay: 1e30, cerca: [] }; g.visible = false; return g;
    }
    var conejos = []; for (var ic = 0; ic < NCON; ic++) conejos.push(creaConejo());
    // ¿la distancia (dx, dy) supera / no llega a r? Igual que Math.hypot(dx, dy) > r, pero sin hypot (lento) salvo en el filo del umbral, donde sí lo usa
    function mayorQue(dx, dy, r) { var s = dx * dx + dy * dy, r2 = r * r; if (s > r2 * 1.000001) return true; if (s < r2 * 0.999999) return false; return Math.hypot(dx, dy) > r; }
    function menorQue(dx, dy, r) { var s = dx * dx + dy * dy, r2 = r * r; if (s > r2 * 1.000001) return false; if (s < r2 * 0.999999) return true; return Math.hypot(dx, dy) < r; }
    // Los olivos contra los que choca un conejo. Antes se recorrían todas las copas por conejo y fotograma; ahora cada conejo guarda los olivos (en el orden de
    // siempre) que pueden empujarlo mientras no se aleje CERCA_M m del punto donde se hizo el recuento: los que están a CERCA_M + 0,5 m de ese punto, más, por
    // cadena, los que están a 1 m o menos de uno ya incluido (un empujón deja al conejo a 0,5 m de ese olivo; el siguiente que lo empuje está a ≤ 1 m del primero).
    // Con eso el resultado es idéntico al de recorrerlos todos.
    var CERCA_M = 4, olivas = copas.filter(function (c) { return c.oliv; }), incluido = new Uint8Array(olivas.length), pend = new Int32Array(olivas.length);
    function reconstruyeCerca(u, ax, ay) {
      var no = olivas.length, nc = 0, i, j, q, c, r = CERCA_M + 0.5 + 1e-6, L = u.cerca;
      incluido.fill(0);
      for (i = 0; i < no; i++) { c = olivas[i]; if (Math.abs(c.x - ax) <= r && Math.abs(c.y - ay) <= r) { incluido[i] = 1; pend[nc++] = i; } }
      for (q = 0; q < nc; q++) {
        var cq = olivas[pend[q]];
        for (j = 0; j < no; j++) { if (incluido[j]) continue; c = olivas[j]; if (Math.abs(c.x - cq.x) <= 1.000001 && Math.abs(c.y - cq.y) <= 1.000001) { incluido[j] = 1; pend[nc++] = j; } }
      }
      L.length = 0; for (i = 0; i < no; i++) if (incluido[i]) L.push(olivas[i]);
      u.ax = ax; u.ay = ay;
    }
    var lvFauna = { s: { alt: 0, az: 0 }, d: 0 };   // la altura del astro en actualizaFauna, el mismo objeto cada fotograma
    var amq = { x: 0, y: 0, res: null };   // la pregunta «perros:amenaza» de cada conejo, el mismo objeto cada vez (AG-1.4)
    function arbolCerca(rmin, rmax) { for (var k = 0; k < 50; k++) { var c = cIn[(Math.random() * cIn.length) | 0], d = Math.hypot(c.x - pp.x, c.y - pp.y); if (d >= rmin && d <= rmax) return c; } return null; }
    function nacePosada(av) {
      var c = arbolCerca(26, 70); if (!c) return false;
      var u = av.userData; u.est = "posada"; u.cx = c.x + (Math.random() - 0.5) * 0.8; u.cy = c.y + (Math.random() - 0.5) * 0.8; u.cz = c.h; u.fase = Math.random() * 6;
      av.position.set(u.cx, altSuelo(u.cx, u.cy) + c.h * exag + 0.32, -u.cy); av.rotation.y = Math.random() * 6.28; av.visible = true; aleteo(av, true); return true;
    }
    function naceConejo(co) {
      var c = arbolCerca(18, 55); if (!c) return false;
      var u = co.userData, a = Math.random() * 6.28; u.est = "pasta"; u.x = c.x + Math.cos(a) * (1.6 + Math.random() * 2); u.y = c.y + Math.sin(a) * (1.6 + Math.random() * 2); u.dir = Math.random() * 6.28; u.t = 1 + Math.random() * 2; co.visible = true; return true;
    }

      function actualizaFauna(dt) {
        var lv = nivelEn(cur.ms, lvFauna), dia = lv.d, lluviosa = cur.lluvia > 1.5, vuelan = dia > 0.12 && !lluviosa;
      // la bandada da vueltas sobre la finca, a la altura del terreno y con más prisa si hay viento
      if (vuelan) {   // lo que es igual para todas las aves de una bandada (el ángulo, su coseno y su seno, la orientación y la inclinación) se calcula una vez por bandada
        for (var kb = 0; kb < BANDADAS.length; kb++) {
          var bb = BANDADAS[kb], th = bb.ph + bb.w * tVida * (1 + cur.viento * 0.05);
          bC[kb] = Math.cos(th); bS[kb] = Math.sin(th); bHx[kb] = -bS[kb] * bb.a * bb.w; bHy[kb] = bC[kb] * bb.b * bb.w; bRz[kb] = Math.sign(bb.w) * -0.25;
        }
      }
      for (var ib = 0; ib < bandada.length; ib++) {
        var g = bandada[ib], u = g.userData, b = BANDADAS[u.b]; g.visible = vuelan;
        if (!vuelan) continue;
        var x = bC[u.b] * b.a + u.of[0], y = bS[u.b] * b.b + u.of[2];
        var alt = altSuelo(x, y) + b.h + u.of[1] + Math.sin(tVida * 0.9 * u.fx + u.fase) * 2.5;
        g.position.set(x, alt, -y); mira(g, bHx[u.b], -bHy[u.b]); g.rotation.z = bRz[u.b]; aleteo(g, false, false); escalaVista(g, 1);
      }
      if (!paseando) { empacaAves(); empacaConejos(); return; }
      var dq = enQuad ? 16 : 9;
      // aves posadas: salen volando si te acercas, suben y se alejan; luego otra ocupa su sitio
      for (var ip2 = 0; ip2 < posadas.length; ip2++) {
        var a = posadas[ip2]; u = a.userData;
        if (u.est === "posada") {
          var dpx = u.cx - pp.x, dpy = u.cy - pp.y; a.visible = vuelan || dia > 0.02; aleteo(a, true);
          if (menorQue(dpx, dpy, dq)) { u.est = "vuela"; u.t = 9; u.h = Math.atan2(u.cy - pp.y, u.cx - pp.x) + (Math.random() - 0.5) * 1.2; u.vy = 0; u.px = u.cx; u.py = u.cy; u.pz = a.position.y; }
          else if (mayorQue(dpx, dpy, 120)) nacePosada(a);
        } else if (u.est === "vuela") {
          u.t -= dt; u.px += Math.cos(u.h) * 8 * dt; u.py += Math.sin(u.h) * 8 * dt; u.pz += Math.min(3.2, 7 - (u.pz - altSuelo(u.px, u.py))) * dt * 0.8;
          a.position.set(u.px, u.pz, -u.py); mira(a, Math.cos(u.h), -Math.sin(u.h)); a.rotation.x = -0.25; aleteo(a, false, true); a.scale.setScalar(1);
          if (u.t <= 0) { a.visible = false; a.rotation.x = 0; u.est = "fuera"; u.t = 2 + Math.random() * 4; }
        } else { u.t -= dt; if (u.t <= 0) nacePosada(a); }
      }
      // conejos: pastan y dan saltitos entre los olivos; si te acercas, huyen
      for (var ic2 = 0; ic2 < conejos.length; ic2++) {
        var co = conejos[ic2]; u = co.userData;
        if (u.est === "fuera") { if (!naceConejo(co)) continue; }
        if (mayorQue(u.x - pp.x, u.y - pp.y, 120)) { u.est = "fuera"; co.visible = false; continue; }
        // la pregunta a los perros solo si aún no huye (si ya huye, su respuesta no se usaba): un solo objeto de pregunta reutilizado, no uno por conejo y fotograma
        var am = null; if (u.est !== "huye") { amq.x = u.x; amq.y = u.y; amq.res = null; n.emite("perros:amenaza", amq); am = amq.res; }
        if (am) { u.est = "huye"; u.t = 2 + Math.random() * 1.6; u.dir = Math.atan2(u.y - am.y, u.x - am.x) + (Math.random() - 0.5) * 1.0; }
        var vel = 0;
        if (u.est === "huye") { vel = 6.5; u.t -= dt; if (u.t <= 0) { u.est = "pasta"; u.t = 1.5 + Math.random() * 2; } }
        else { u.t -= dt; if (u.t <= 0) { u.dir = Math.random() * 6.28; u.t = 1.2 + Math.random() * 2.4; u.salta = Math.random() < 0.55; } vel = u.salta ? 0.9 : 0; }
        var nx = u.x + Math.cos(u.dir) * vel * dt, ny = u.y + Math.sin(u.dir) * vel * dt;
        // los olivos que lo empujan: solo los olivos de cerca (los de alrededor de donde estaba un rato antes), en el orden de siempre
        if (Math.abs(nx - u.ax) > CERCA_M || Math.abs(ny - u.ay) > CERCA_M) reconstruyeCerca(u, nx, ny);
        var cer = u.cerca;
        for (var i = 0; i < cer.length; i++) { var c = cer[i]; var ex = nx - c.x, ey = ny - c.y; if (ex * ex + ey * ey < 0.5 * 0.5) { var dd = Math.sqrt(ex * ex + ey * ey) || 0.001; nx = c.x + ex / dd * 0.5; ny = c.y + ey / dd * 0.5; } }
        var e = D.ext; u.x = Math.max(e[0] + 3, Math.min(e[2] - 3, nx)); u.y = Math.max(e[3] + 3, Math.min(e[1] - 3, ny));
        u.fase += dt * (vel > 3 ? 15 : vel > 0 ? 8 : 2);
        var salto = vel > 0 ? Math.abs(Math.sin(u.fase)) * (vel > 3 ? 0.3 : 0.1) : 0, sf13 = Math.abs(Math.sin(u.fase * 1.3));
        co.position.set(u.x, altSuelo(u.x, u.y) + salto, -u.y); co.rotation.y = Math.atan2(-Math.cos(u.dir), Math.sin(u.dir)); co.rotation.x = vel > 3 ? -Math.sin(u.fase) * 0.2 : 0;
        u.cab.position.y = 0.32 + (vel > 0 ? 0 : -sf13 * 0.07); u.cab.rotation.x = vel > 0 ? 0 : 0.5 * sf13;
        for (var k = 0; k < u.orejas.length; k++) u.orejas[k].rotation.x = vel > 3 ? 0.9 : (u.est === "huye" ? 0.5 : 0.05 * Math.sin(u.fase * 0.7 + k));
        co.visible = true;
      }
      empacaAves(); empacaConejos();
      }

    var disp = false;
    function liberaFauna() {
      if (disp) return; disp = true;
      disposaAves();
      disposaConejos();
    }
    faunaSuelta = liberaFauna;
    n.on("paseo:entra", function () {
      posadas.forEach(function (a) { a.userData.est = "fuera"; a.visible = false; }); conejos.forEach(function (c) { c.userData.est = "fuera"; c.visible = false; });
      posadas.forEach(nacePosada); conejos.forEach(naceConejo);
    });
    n.on("paseo:sale", function () { posadas.forEach(function (a) { a.userData.est = "fuera"; a.visible = false; }); conejos.forEach(function (c) { c.userData.est = "fuera"; c.visible = false; }); });
    n.on("fauna:conejo-cerca", function (q) {   // el conejo visible más cercano a (x, y) en un radio; lo rellena en res (el perro lo persigue y le cambia el estado)
      if (!q) return; var mejor = null, md = q.radio;
      conejos.forEach(function (c) { if (!c.visible || c.userData.est === "fuera") return; var u = c.userData, d = Math.hypot(u.x - q.x, u.y - q.y); if (d < md) { md = d; mejor = c; } });
      q.res = mejor;
    });
    // los conejos en el minimapa (antes los pintaba 17_minimapa.js): puntos crema, bajo los perros y los demás
    n.limpia(Minimapa.capa(function (c, X, Y) {
      c.fillStyle = "#f2dcb8"; conejos.forEach(function (co) { if (!co.visible) return; c.beginPath(); c.arc(X(co.userData.x), Y(co.userData.y), 2.2, 0, 6.283); c.fill(); });
    }, -20));
    return { actualiza: actualizaFauna, conejos: function () { return conejos; }, aves: function () { return aves; } };
  }
  Componentes.registra({
    id: "fauna-olivar", version: 1,
    consume: ["scene", "camera", "D", "copas", "cIn", "geoSombra", "matSombra", "paseando", "pp", "cur", "nivelEn", "tVida", "enQuad", "gFauna", "altSuelo", "mira", "exag", "Minimapa"],
    expone: [],
    eventos: { escucha: ["paseo:entra", "paseo:sale", "fauna:conejo-cerca"], emite: ["perros:amenaza"] },
    bandera: { defecto: true, url: "fauna" },
    presupuesto: { llamadas: 8, triangulos: 13000 },   // medido en Node (componentes_c10b.test.js) con todo a la vista: 6 llamadas (2 de aves y 4 de conejos, todo instanciado; antes 38) y 12.488 triángulos
    fases: { mundo: 0 },
    monta: function (n) { return FaunaMotor(n); },
    actualiza: { mundo: function (dt, t, api) { api.actualiza(dt); } },
    libera: function () { if (faunaSuelta) faunaSuelta(); faunaSuelta = null; }
  });
