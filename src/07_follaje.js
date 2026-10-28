
  // follaje: cada punto LiDAR de copa es un montoncito de hojas plateadas (sprites con textura propia)
  function texturaHojas() {
    var cv = document.createElement("canvas"); cv.width = cv.height = 128; var x = cv.getContext("2d"), seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    x.translate(64, 64); x.lineCap = "round";
    for (var r = 0; r < 7; r++) {            // ramillas claras que cruzan el sprite
      var ang = rnd() * 6.283, l = 26 + rnd() * 30; x.strokeStyle = "rgba(205,195,160,0.95)"; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(Math.cos(ang) * 4, Math.sin(ang) * 4); x.lineTo(Math.cos(ang) * l, Math.sin(ang) * l); x.stroke();
      for (var h = 0; h < 5; h++) {         // hojas a pares a lo largo de la ramilla
        var d = 6 + h * (l / 6), bx = Math.cos(ang) * d, by = Math.sin(ang) * d;
        for (var lado = -1; lado <= 1; lado += 2) {
          var rot = ang + lado * (0.55 + rnd() * 0.5), len = 17 + rnd() * 13, wd = 2.4 + rnd() * 1.8, pale = rnd() < 0.42, t = pale ? 215 + rnd() * 35 : 95 + rnd() * 45;
          x.save(); x.translate(bx, by); x.rotate(rot);
          x.fillStyle = "rgb(" + Math.round(t * (pale ? 0.97 : 0.8)) + "," + Math.round(t) + "," + Math.round(t * (pale ? 0.9 : 0.72)) + ")";
          x.beginPath(); x.ellipse(len / 2, 0, len / 2, wd, 0, 0, 6.283); x.fill();
          x.strokeStyle = pale ? "rgba(120,125,100,0.5)" : "rgba(40,50,30,0.6)"; x.lineWidth = 0.6; x.beginPath(); x.moveTo(1, 0); x.lineTo(len - 2, 0); x.stroke(); x.restore();
        }
      }
    }
    var tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = true; return tex;
  }
  var texHojas = texturaHojas();
  var matHojaG = new THREE.PointsMaterial({ size: 3.1, map: texHojas, alphaTest: 0.4, vertexColors: true, sizeAttenuation: true, transparent: false });
  var matHojaP = new THREE.PointsMaterial({ size: 1.7, map: texHojas, alphaTest: 0.4, vertexColors: true, sizeAttenuation: true, transparent: false });
  var matCorteza = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, sizeAttenuation: true });
  function texturaSombra() {
    var cv = document.createElement("canvas"); cv.width = cv.height = 64; var x = cv.getContext("2d"), g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(20,18,10,0.55)"); g.addColorStop(0.65, "rgba(20,18,10,0.32)"); g.addColorStop(1, "rgba(20,18,10,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
  }
  var matSombra = new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  var geoSombra = new THREE.PlaneGeometry(1, 1); geoSombra.rotateX(-Math.PI / 2);
  function* follajeG(arr, P, grupo) {   // hojas, relleno y frutos de una lista de olivos y de los puntos LiDAR que caen en ellos (P: x, y, z, h, b, n)
    var gp = [], gc = [], pp = [], pc = [], bp = [], bc = [], c3 = [0, 0, 0], r = 1;
    function azar() { r = (r * 16807) % 2147483647; return r / 2147483647 - 0.5; }
    for (var q = 0; q < P.n; q++) {
      if (q % 2500 === 2499) yield;
      var x = P.x[q], y = P.y[q], z = P.z[q], h = P.h[q];
      if (P.b[q]) { var tb = 0.30 + 0.12 * hash(q); bp.push(x, z * exag, -y); bc.push(0.46 * tb * 1.8, 0.38 * tb * 1.8, 0.30 * tb * 1.8); continue; }
      if (h < 0.7) continue;
      colorEn(x, y, h, c3); aviva(c3, x, y);
      var cop = copaAlta(x, y), rel = cop > 0.5 ? Math.min(1, h / cop) : 1, luz = 0.85 + 0.42 * rel;
      var n = calidad === 2 ? ((q % 3 === 0) ? 1 : 2) : calidad === 1 ? ((q % 3 === 0) ? 1 : 0) : 0;  // más montoncitos por punto: la copa se cierra
      for (var k = 0; k < n + 1; k++) {
        var jx = azar() * 0.7, jy = azar() * 0.7, jz = azar() * 1.1 - (k ? 0.15 : 0);
        var tono = 0.88 + 0.28 * hash(q * 5 + k), col = [c3[0] * luz * tono, c3[1] * luz * tono, c3[2] * luz * tono];
        var xx = x + jx, yy = y + jy, zz = Math.max(z + jz, 0.6 + suelo(x, y)) * exag;
        if (k === 0 && q % 2 === 0) { gp.push(xx, zz, -yy); gc.push(col[0], col[1], col[2]); } else { pp.push(xx, zz, -yy); pc.push(col[0], col[1], col[2]); }
      }
    }
    for (var ai = 0; ai < arr.length; ai++) {
      var t = arr[ai], n = t.i;
      if (ai % 6 === 5) yield;
      var ht = Math.min(1.5, Math.max(0.9, t.h * 0.3)), cb = ht + 0.1, top = Math.max(t.h, cb + 1.4), gz = suelo(t.x, t.y);
      var relleno = calidad === 2 ? 48 : calidad === 1 ? 22 : 0;
      for (var k = 0; k < relleno; k++) {
        var th = (hash(n * 97 + k) * 6.283), rr = radioEn(t.perfil, th), u = Math.sqrt(hash(n * 131 + k * 3 + 1)) * 0.88, rad = u * rr;
        var domo = Math.sqrt(Math.max(0, 1 - u * u)), yy = cb + (top - cb) * (0.18 + 0.78 * domo) - hash(n * 53 + k * 7) * 0.9;
        var xx = t.x + Math.cos(th) * rad, zz = t.y + Math.sin(th) * rad, hh = Math.max(0.8, yy);
        colorEn(xx, zz, hh, c3); aviva(c3, xx, zz);
        var luz2 = 0.70 + 0.35 * (yy - cb) / Math.max(top - cb, 1), tono = 0.85 + 0.3 * hash(n * 17 + k);
        (k % 3 === 0 ? gp : pp).push(xx, (gz + yy) * exag, -zz);
        (k % 3 === 0 ? gc : pc).push(c3[0] * luz2 * tono, c3[1] * luz2 * tono, c3[2] * luz2 * tono);
      }
    }
    function pts(pos, col, mat) { var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere(); return new THREE.Points(g, mat); }
    grupo.add(pts(gp, gc, matHojaG)); grupo.add(pts(pp, pc, matHojaP)); grupo.add(pts(bp, bc, matCorteza)); construyeFrutosLista(grupo);
  }
  function construyeSombras() {   // sombras suaves bajo cada copa (una malla instanciada para todos los olivos)
    while (gSombras.children.length) { gSombras.children.pop(); }
    var inst = new THREE.InstancedMesh(geoSombra, matSombra, copas.length + 1), tm = new THREE.Object3D(), n2 = 0;
    copas.forEach(function (t) { if (!t.oliv) return; var rm = t.perfil.reduce(function (a, b) { return a + b; }, 0) / 8; tm.position.set(t.x + 0.4, (suelo(t.x, t.y) + 0.06) * exag, -t.y - 0.1); tm.scale.set(rm * 2.5, 1, rm * 2.5); tm.updateMatrix(); inst.setMatrixAt(n2++, tm.matrix); });
    inst.count = n2; inst.instanceMatrix.needsUpdate = true; gSombras.add(inst); instSombra = inst; sombrasSol(true);
  }
