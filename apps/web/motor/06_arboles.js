// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: gArboles, gFollaje, gSombras, tronco, matTronco, radioEn, arbolesG
// Consume: 02_mundo (suelo, aviva, colorEn, copas), 03_escena (scene, colorVertSRGB, exag, modo), 04_terreno (hash), 07b_arboles (Arboles),
//   14_historia (lista), 15_tiempo (nivel)
// ===============================================================================
  // ---------- los olivos del modo Gemelo: copa con la forma real medida (8 radios) y tronco debajo (nivel 0, por celdas de 64 m; ver Arboles)
  var gArboles = new THREE.Group(), gFollaje = gArboles, gSombras = new THREE.Group(); scene.add(gArboles); scene.add(gSombras);   // gFollaje es el mismo grupo: las celdas de nivel 0 llevan copa, tronco, hojas y frutos
  var matCopa = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), matTronco = new THREE.MeshLambertMaterial({ vertexColors: true });
  matCopa.onBeforeCompile = matTronco.onBeforeCompile = colorVertSRGB;   // el color por vértice está escrito en sRGB (03_escena)
  var KSEG = 20, RING = 9;
  function radioEn(perfil, ang) { // ang en rad (0 = este, antihorario); interpolación circular
    var f = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 8, i0 = Math.floor(f) % 8, i1 = (i0 + 1) % 8, t = f - Math.floor(f);
    return perfil[i0] * (1 - t) + perfil[i1] * t;
  }
  function* arbolesG(arr) {   // copas y troncos de una lista de olivos, en dos mallas (a rebanadas: cada 5 olivos cede el turno a la cola)
    var cp = [], cc = [], ci = [], tp = [], tc = [], ti = [], vo = 0, vt = 0, c3 = [0, 0, 0];
    for (var ai = 0; ai < arr.length; ai++) {
      var t = arr[ai], n = t.i;
      var gz = suelo(t.x, t.y), ht = Math.min(1.5, Math.max(0.9, t.h * 0.3)), cb = ht + 0.1, top = Math.max(t.h, cb + 1.4);
      var lean = (hash(n + 11) - 0.5) * 0.25, az = hash(n + 5) * 6.28;
      // tronco y ramas gruesas hacia la copa (olivo en vaso): tubos cónicos con vaivén
      var topeC = gz + cb + (top - cb) * 0.30, rmed = t.perfil.reduce(function (p, q) { return p + q; }, 0) / 8;
      function tubo(pts, r0, r1, sem) {
        var NS = pts.length - 1, RS = 6;
        for (var i = 0; i <= NS; i++) {
          var f = i / NS, rr = r0 + (r1 - r0) * f;
          for (var a3 = 0; a3 < RS; a3++) {
            var an = a3 / RS * 6.283 + sem, wob = 1 + 0.14 * Math.sin(an * 3 + sem * 5 + i);
            tp.push(pts[i][0] + Math.cos(an) * rr * wob, pts[i][1] * exag, -(pts[i][2] + Math.sin(an) * rr * wob));
            var m = 0.30 + 0.12 * hash(sem * 31 + i * 7 + a3);
            tc.push(0.50 * m * 1.7, 0.43 * m * 1.7, 0.36 * m * 1.7);
          }
        }
        for (var i2 = 0; i2 < NS; i2++) for (var a4 = 0; a4 < RS; a4++) {
          var A = vt + i2 * RS + a4, B = vt + i2 * RS + (a4 + 1) % RS, C = A + RS, Dd = B + RS; ti.push(A, B, C, B, Dd, C);
        }
        vt += (NS + 1) * RS;
      }
      // olivo en vaso (fotos de referencia): base ensanchada, 2-3 troncos que se abren casi desde el suelo y ramas gruesas
      var bx = t.x + Math.cos(az) * lean * 0.5, by = t.y + Math.sin(az) * lean * 0.5, nt = 2 + (hash(n + 4) > 0.45 ? 1 : 0), rtr = 0.20 + 0.05 * Math.min(1, t.h / 5);
      tubo([[bx, gz - 0.05, by], [bx, gz + 0.18, by], [bx, gz + 0.45, by]], rtr * 2.1, rtr * 1.35, n + 50);   // base acampanada
      for (var st = 0; st < nt; st++) {
        var sa = az + st / nt * 6.283 + (hash(n * 11 + st) - 0.5) * 0.7, out = rmed * (0.16 + 0.07 * hash(n * 5 + st)), ex0 = bx + Math.cos(sa) * out, ey0 = by + Math.sin(sa) * out;
        var tronco2 = [];
        for (var q4 = 0; q4 <= 5; q4++) {
          var f4 = q4 / 5, c4 = f4 * f4;
          tronco2.push([bx + (ex0 - bx) * c4 + 0.07 * Math.sin(q4 * 2.2 + st + n), gz + 0.4 + (ht + 0.55 - 0.4) * f4, by + (ey0 - by) * c4 + 0.07 * Math.cos(q4 * 2.2 + st * 2 + n)]);
        }
        tubo(tronco2, rtr * 1.15, rtr * 0.8, n * 7 + st + 60);
        for (var rm2 = 0; rm2 < 2; rm2++) {                                    // dos ramas gruesas por tronco
          var ra = sa + (rm2 ? 0.55 : -0.55) + (hash(n * 5 + rm2 + st) - 0.5) * 0.5, alc = rmed * (0.34 + 0.18 * hash(n * 3 + rm2 * 7 + st)), ex = ex0 + Math.cos(ra) * alc, ey = ey0 + Math.sin(ra) * alc;
          var ez = gz + cb + (top - cb) * (0.18 + 0.28 * hash(n * 9 + rm2 + st * 3)), y0 = gz + ht + 0.55, rama = [];
          for (var q3 = 0; q3 <= 5; q3++) {
            var f3 = q3 / 5, curv = Math.sin(f3 * 1.45), ar = f3 * (0.35 + 0.65 * f3);
            rama.push([ex0 + (ex - ex0) * ar + 0.06 * Math.sin(q3 * 3 + rm2 + st), y0 + (ez - y0) * curv, ey0 + (ey - ey0) * ar + 0.06 * Math.cos(q3 * 3 + n + st)]);
          }
          tubo(rama, rtr * 0.78, rtr * 0.28, n * 13 + st * 3 + rm2 + 90);
        }
      }
      // copa: casquete + cuerpo con radio por dirección
      var base = vo;
      for (var rg = 0; rg <= RING; rg++) {
        var ph = rg / RING * 2.75, sn = Math.sin(ph), tt = (1 + Math.cos(ph)) / 2;
        for (var sg = 0; sg < KSEG; sg++) {
          var th = sg / KSEG * 6.283, rr = radioEn(t.perfil, th);
          var bump = 1 + 0.16 * Math.sin(th * 3 + n) * Math.sin(ph * 2 + n * 0.7) + 0.08 * (hash(n * 13 + sg + rg * 31) - 0.5);
          var rho = rr * Math.pow(sn, 0.72) * bump * 0.5;
          var wx = t.x + Math.cos(th) * rho, wy = t.y + Math.sin(th) * rho;
          var hy = cb + (top - cb) * Math.pow(tt, 0.85) * 0.80 + 0.18 * Math.sin(th * 5 + rg + n) * sn;
          cp.push(wx, (gz + hy) * exag, -wy);
          colorEn(wx, wy, hy, c3); aviva(c3, wx, wy);
          var up = 0.78 + 0.28 * Math.cos(ph) , gr = 0.9 + 0.2 * hash(n * 3 + sg * 5 + rg);
          var sombra = rg > RING * 0.62 ? 0.38 : 0.62;
          var vf = (0.8 + 0.4 * hash(n * 3 + sg + rg * 5)) * sombra * up; cc.push(0.15 * vf * 1.6, 0.20 * vf * 1.6, 0.11 * vf * 1.6);
        }
      }
      for (var rg2 = 0; rg2 < RING; rg2++) for (var sg2 = 0; sg2 < KSEG; sg2++) {
        var a0 = base + rg2 * KSEG + sg2, b0 = base + rg2 * KSEG + (sg2 + 1) % KSEG, c0 = a0 + KSEG, d0 = b0 + KSEG;
        ci.push(a0, c0, b0, b0, c0, d0);
      }
      vo += (RING + 1) * KSEG;
      if (ai % 5 === 4) yield;
    }
    var g1 = new THREE.BufferGeometry(); g1.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3)); g1.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3)); g1.setIndex(ci); g1.computeVertexNormals();
    var g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3)); g2.setAttribute("color", new THREE.Float32BufferAttribute(tc, 3)); g2.setIndex(ti); g2.computeVertexNormals();
    return [new THREE.Mesh(g1, matCopa), new THREE.Mesh(g2, matTronco)];
  }
