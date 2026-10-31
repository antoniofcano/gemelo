// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (copas, cIn), 02c_componentes (Componentes), 03_escena (scene, camera, exag), 07_follaje (matSombra, geoSombra),
//   12_paseo (paseando), 15_tiempo (cur, nivel), 16_vida (tVida, enQuad, gFauna, esfera, altSuelo, mira, actualizaVida), 17_minimapa (Minimapa)
// ===============================================================================
  // ---------- la fauna del olivar (componente «fauna-olivar», ADR-0023, C10 segunda tanda): las aves (dos bandadas que dan vueltas de día, ocho posadas que se
  // espantan) y los seis conejos que pastan y huyen. Antes vivían en 16_vida.js y actualizaVida() las movía; ahora solo se registra (fase «mundo»). Se enteran de
  // que empieza o acaba el paseo por «paseo:entra» / «paseo:sale» (los emite 16_vida.js al entrar y salir del paseo), preguntan si hay algo de lo que huir con
  // «perros:amenaza» (como antes) y responden a «fauna:conejo-cerca» (los perros buscan un conejo a quien perseguir). Pintan sus conejos en el minimapa con
  // Minimapa.capa. El grupo gFauna (la fauna que cuelga de él, incluidos los perros) y su casilla «Fauna» siguen en 16_vida.js. ?fauna=0 la apaga: ni aves ni conejos.
  var faunaSuelta = null;   // lo que libera el componente montado
  function FaunaMotor(n) {
    var matAla = new THREE.MeshLambertMaterial({ color: 0x302b2a, side: THREE.DoubleSide });
    var matConejo = new THREE.MeshLambertMaterial({ color: 0x8b755a }), matConejoB = new THREE.MeshLambertMaterial({ color: 0xece4d4 }), matOreja = new THREE.MeshLambertMaterial({ color: 0xa88f78 });
    // --- pájaros: el ave mira hacia -z. Cada ave es un Group SIN hijos (solo lleva la posición, el giro y la fase); se dibujan todas juntas
    // con dos mallas instanciadas (2 llamadas, antes 7 por ave): el cuerpo (una geometría fusionada con el color por vértice) y las alas
    // (2 por ave, con la bisagra del aleteo calculada por matriz cada fotograma, igual que giraba el pivote antes).
    var NAVES = 22, geoAveCuerpo = (function () {   // cuerpo, vientre, cabeza, pico y cola en una sola geometría
      var partes = [], m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion();
      function parte(geo, hex, sx, sy, sz, x, y, z, rx) { m4.compose(new THREE.Vector3(x, y, z), rx ? q0.setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx) : q0.identity(), new THREE.Vector3(sx, sy, sz)); geo.applyMatrix4(m4); partes.push([geo, new THREE.Color(hex)]); }
      parte(new THREE.SphereGeometry(0.1, 10, 8), 0x4a3f33, 0.85, 0.8, 1.8, 0, 0, 0); parte(new THREE.SphereGeometry(0.1, 10, 8), 0xd9cdb4, 0.7, 0.45, 1.2, 0, -0.035, 0.02);
      parte(new THREE.SphereGeometry(0.065, 10, 8), 0x4a3f33, 1, 1, 1, 0, 0.03, -0.2); parte(new THREE.ConeGeometry(0.022, 0.08, 5), 0xd49a30, 1, 1, 1, 0, 0.025, -0.3, -Math.PI / 2);
      parte(new THREE.BoxGeometry(0.07, 0.012, 0.2), 0x4a3f33, 1, 1, 1, 0, 0.01, 0.27);
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
    })();
    var geoAla = (function () { var g = new THREE.PlaneGeometry(0.44, 0.2); g.rotateX(-Math.PI / 2); g.translate(0.22, 0, 0); return g; })();   // el ala derecha; la izquierda es su espejo
    var matAveInst = new THREE.MeshLambertMaterial({ vertexColors: true });
    var mallaAveCuerpo = new THREE.InstancedMesh(geoAveCuerpo, matAveInst, NAVES), mallaAveAlas = new THREE.InstancedMesh(geoAla, matAla, NAVES * 2);
    [mallaAveCuerpo, mallaAveAlas].forEach(function (im) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; im.visible = false; gFauna.add(im); });
    mallaAveCuerpo.name = "aves"; mallaAveAlas.name = "aves-alas";
    var aves = [], tmpAlaM = new THREE.Matrix4(), tmpAlaA = new THREE.Matrix4(), tmpAlaQ = new THREE.Quaternion(), tmpAlaP = new THREE.Vector3(), tmpAlaS = new THREE.Vector3(), EJE_Z = new THREE.Vector3(0, 0, 1);
    function creaAve() { var g = new THREE.Group(); g.userData = { ang: 0, fase: Math.random() * 6.28 }; aves.push(g); return g; }
    function aleteo(g, quieta, rapido) { var u = g.userData; u.ang = quieta ? 0.05 : Math.sin(tVida * (rapido ? 22 : 15) + u.fase) * 0.85; }
    function empacaAves() {   // las aves visibles, juntas en las dos mallas (una vez por fotograma)
      var n = 0;
      for (var i = 0; i < aves.length; i++) {
        var g = aves[i]; if (!g.visible) continue;
        g.updateMatrix(); mallaAveCuerpo.setMatrixAt(n, g.matrix);
        for (var l = -1; l <= 1; l += 2) {   // l = -1 izquierda (espejo), 1 derecha; la bisagra gira l·(-ang) como antes (ai = +a, ad = -a)
          tmpAlaQ.setFromAxisAngle(EJE_Z, -l * g.userData.ang); tmpAlaP.set(l * 0.05, 0.02, -0.02); tmpAlaS.set(l, 1, 1);
          tmpAlaA.compose(tmpAlaP, tmpAlaQ, tmpAlaS); tmpAlaM.multiplyMatrices(g.matrix, tmpAlaA); mallaAveAlas.setMatrixAt(n * 2 + (l < 0 ? 0 : 1), tmpAlaM);
        }
        n++;
      }
      mallaAveCuerpo.count = n; mallaAveAlas.count = n * 2; mallaAveCuerpo.visible = mallaAveAlas.visible = n > 0;   // vacía no se dibuja (three cuenta la llamada aunque no haya instancias)
      mallaAveCuerpo.instanceMatrix.needsUpdate = true; mallaAveAlas.instanceMatrix.needsUpdate = true;
    }
    function disposaAves() { geoAveCuerpo.dispose(); geoAla.dispose(); matAveInst.dispose(); matAla.dispose(); mallaAveCuerpo.dispose(); mallaAveAlas.dispose(); gFauna.remove(mallaAveCuerpo); gFauna.remove(mallaAveAlas); }
    function escalaVista(g, base) { var d = camera.position.distanceTo(g.position); g.scale.setScalar(base * Math.max(1, Math.min(9, d / 60))); }
    var bandada = [], BANDADAS = [{ a: 320, b: 150, w: 0.11, h: 38, ph: 0 }, { a: 210, b: 260, w: -0.085, h: 55, ph: 2.4 }];
    BANDADAS.forEach(function (b, k) { for (var i = 0; i < 7; i++) { var g = creaAve(); g.userData.b = k; g.userData.of = [(Math.random() - 0.5) * 26, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 26]; g.userData.fx = 0.5 + Math.random(); bandada.push(g); } });
    var posadas = [];
    for (var ip = 0; ip < 8; ip++) { var av0 = creaAve(); av0.visible = false; av0.userData.est = "fuera"; av0.userData.t = 0; posadas.push(av0); }

    // --- conejos
    function creaConejo() {
      var g = new THREE.Group();
      esfera(0.2, matConejo, 0.78, 0.74, 1.25, 0, 0.2, 0, g); var cab = esfera(0.12, matConejo, 0.9, 0.9, 1, 0, 0.32, -0.25, g);
      esfera(0.05, matConejoB, 1, 1, 1, 0, 0.23, 0.27, g);
      var orejas = [-1, 1].map(function (l) { var o = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.02), matOreja); o.position.set(l * 0.045, 0.52, -0.25); g.add(o); return o; });
      var sb = new THREE.Mesh(geoSombra, matSombra); sb.scale.set(0.8, 1, 0.8); sb.position.y = 0.03; g.add(sb);
      g.userData = { cab: cab, orejas: orejas, est: "fuera", t: 0, x: 0, y: 0, dir: 0, fase: Math.random() * 6 }; g.visible = false; gFauna.add(g); return g;
    }
    var conejos = []; for (var ic = 0; ic < 6; ic++) conejos.push(creaConejo());
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
        var lv = nivel(cur.ms), dia = lv.d, lluviosa = cur.lluvia > 1.5, vuelan = dia > 0.12 && !lluviosa;
      // la bandada da vueltas sobre la finca, a la altura del terreno y con más prisa si hay viento
      bandada.forEach(function (g) {
        var u = g.userData, b = BANDADAS[u.b]; g.visible = vuelan;
        if (!vuelan) return;
        var th = b.ph + b.w * tVida * (1 + cur.viento * 0.05), x = Math.cos(th) * b.a + u.of[0], y = Math.sin(th) * b.b + u.of[2], hx = -Math.sin(th) * b.a * b.w, hy = Math.cos(th) * b.b * b.w;
        var alt = altSuelo(x, y) + b.h + u.of[1] + Math.sin(tVida * 0.9 * u.fx + u.fase) * 2.5;
        g.position.set(x, alt, -y); mira(g, hx, -hy); g.rotation.z = Math.sign(b.w) * -0.25; aleteo(g, false, false); escalaVista(g, 1);
      });
      if (!paseando) { empacaAves(); return; }
      var dq = enQuad ? 16 : 9;
      // aves posadas: salen volando si te acercas, suben y se alejan; luego otra ocupa su sitio
      posadas.forEach(function (a) {
        var u = a.userData;
        if (u.est === "posada") {
          var d = Math.hypot(u.cx - pp.x, u.cy - pp.y); a.visible = vuelan || dia > 0.02; aleteo(a, true);
          if (d < dq) { u.est = "vuela"; u.t = 9; u.h = Math.atan2(u.cy - pp.y, u.cx - pp.x) + (Math.random() - 0.5) * 1.2; u.vy = 0; u.px = u.cx; u.py = u.cy; u.pz = a.position.y; }
          else if (d > 120) nacePosada(a);
        } else if (u.est === "vuela") {
          u.t -= dt; u.px += Math.cos(u.h) * 8 * dt; u.py += Math.sin(u.h) * 8 * dt; u.pz += Math.min(3.2, 7 - (u.pz - altSuelo(u.px, u.py))) * dt * 0.8;
          a.position.set(u.px, u.pz, -u.py); mira(a, Math.cos(u.h), -Math.sin(u.h)); a.rotation.x = -0.25; aleteo(a, false, true); a.scale.setScalar(1);
          if (u.t <= 0) { a.visible = false; a.rotation.x = 0; u.est = "fuera"; u.t = 2 + Math.random() * 4; }
        } else { u.t -= dt; if (u.t <= 0) nacePosada(a); }
      });
      // conejos: pastan y dan saltitos entre los olivos; si te acercas, huyen
      conejos.forEach(function (co) {
        var u = co.userData;
        if (u.est === "fuera") { if (!naceConejo(co)) return; }
        var d = Math.hypot(u.x - pp.x, u.y - pp.y);
        if (d > 120) { u.est = "fuera"; co.visible = false; return; }
        var amq = { x: u.x, y: u.y, res: null }; n.emite("perros:amenaza", amq); var am = amq.res; if (u.est !== "huye" && am) { u.est = "huye"; u.t = 2 + Math.random() * 1.6; u.dir = Math.atan2(u.y - am.y, u.x - am.x) + (Math.random() - 0.5) * 1.0; }
        var vel = 0;
        if (u.est === "huye") { vel = 6.5; u.t -= dt; if (u.t <= 0) { u.est = "pasta"; u.t = 1.5 + Math.random() * 2; } }
        else { u.t -= dt; if (u.t <= 0) { u.dir = Math.random() * 6.28; u.t = 1.2 + Math.random() * 2.4; u.salta = Math.random() < 0.55; } vel = u.salta ? 0.9 : 0; }
        var nx = u.x + Math.cos(u.dir) * vel * dt, ny = u.y + Math.sin(u.dir) * vel * dt;
        for (var i = 0; i < copas.length; i++) { var c = copas[i]; if (!c.oliv) continue; var ex = nx - c.x, ey = ny - c.y; if (ex * ex + ey * ey < 0.5 * 0.5) { var dd = Math.sqrt(ex * ex + ey * ey) || 0.001; nx = c.x + ex / dd * 0.5; ny = c.y + ey / dd * 0.5; } }
        var e = D.ext; u.x = Math.max(e[0] + 3, Math.min(e[2] - 3, nx)); u.y = Math.max(e[3] + 3, Math.min(e[1] - 3, ny));
        u.fase += dt * (vel > 3 ? 15 : vel > 0 ? 8 : 2);
        var salto = vel > 0 ? Math.abs(Math.sin(u.fase)) * (vel > 3 ? 0.3 : 0.1) : 0;
        co.position.set(u.x, altSuelo(u.x, u.y) + salto, -u.y); co.rotation.y = Math.atan2(-Math.cos(u.dir), Math.sin(u.dir)); co.rotation.x = vel > 3 ? -Math.sin(u.fase) * 0.2 : 0;
        u.cab.position.y = 0.32 + (vel > 0 ? 0 : -Math.abs(Math.sin(u.fase * 1.3)) * 0.07); u.cab.rotation.x = vel > 0 ? 0 : 0.5 * Math.abs(Math.sin(u.fase * 1.3));
        u.orejas.forEach(function (o, k) { o.rotation.x = vel > 3 ? 0.9 : (u.est === "huye" ? 0.5 : 0.05 * Math.sin(u.fase * 0.7 + k)); });
        co.visible = true;
      });
      empacaAves();
      }

    var disp = false;
    function liberaFauna() {
      if (disp) return; disp = true;
      disposaAves();
      conejos.forEach(function (c) {
        gFauna.remove(c);
        c.traverse(function (o) { if (o.isMesh && o.geometry !== geoSombra) o.geometry.dispose(); });
      });
      [matConejo, matConejoB, matOreja].forEach(function (m) { m.dispose(); });
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
    consume: ["scene", "camera", "D", "copas", "cIn", "geoSombra", "matSombra", "paseando", "pp", "cur", "nivel", "tVida", "enQuad", "gFauna", "altSuelo", "esfera", "mira", "exag", "Minimapa"],
    expone: [],
    eventos: { escucha: ["paseo:entra", "paseo:sale", "fauna:conejo-cerca"], emite: ["perros:amenaza"] },
    bandera: { defecto: true, url: "fauna" },
    presupuesto: { llamadas: 40, triangulos: 13000 },   // medido en Node (componentes_c10b.test.js) con todo a la vista: 38 llamadas (2 de aves instanciadas, 6 conejos de 5 mallas y sombra) y 12.488 triángulos
    fases: { mundo: 0 },
    monta: function (n) { return FaunaMotor(n); },
    actualiza: { mundo: function (dt, t, api) { api.actualiza(dt); } },
    libera: function () { if (faunaSuelta) faunaSuelta(); faunaSuelta = null; }
  });
