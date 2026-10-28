// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: NDV, ndviIdx, rampa, pintaNdvi, ndviRel
// Consume: 01_datos (D, $, fmt, b64, i16, ANCHO, ALTO), 02_mundo (tinte, ndLo, ndHi), 03_escena (modo), 04_terreno (terreno), 05_nube (nube),
//   06_arboles (gArboles, gFollaje, gSombras), 08_marcadores (aplicaLuego), 14_historia (rango), 15_tiempo (hace)
// ===============================================================================
  // ---------- NDVI de Sentinel-2 (10 m) sobre el terreno, con escala relativa a la parcela (como hace Vigía)
  function u8aI16(s) {   // el NDVI de 8 bits (0 = sin dato; 1..254 → de −0,2 a 1,0) se pasa a milésimas en Int16, que es lo que usa el resto
    var u = b64(s), d = new Int16Array(u.length); for (var i = 0; i < u.length; i++) d[i] = u[i] === 0 ? -32768 : Math.round(((u[i] - 1) / 253 * 1.2 - 0.2) * 1000); return d;
  }
  var NDV = D.ndvi ? { w: D.ndvi.w, h: D.ndvi.h, fechas: D.ndvi.fechas, media: D.ndvi.media, datos: D.ndvi.u8 ? u8aI16(D.ndvi.u8) : i16(D.ndvi.b64) } : null;
  var ndviIdx = NDV ? NDV.fechas.length - 1 : 0, ndviTex = null;
  var capaNdvi = { v: false, set visible(x) { this.v = !!x; UN.uNdviOn.value = x ? 1 : 0; }, get visible() { return this.v; } };   // la capa NDVI vive en el sombreador del terreno
  function rampa(t) { // marrón rojizo -> amarillo -> verde
    t = Math.max(0, Math.min(1, t));
    var a = t < 0.5 ? [0.55, 0.29, 0.18] : [0.85, 0.78, 0.35], b = t < 0.5 ? [0.85, 0.78, 0.35] : [0.18, 0.49, 0.2], u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }
  function pintaNdvi() {
    if (!NDV) return;
    var n = NDV.w * NDV.h, off = ndviIdx * n, vals = [], i;
    for (i = 0; i < n; i++) { var v = NDV.datos[off + i]; if (v > -30000) vals.push(v / 1000); }
    vals.sort(function (a, b) { return a - b; });
    var lo = vals.length ? vals[Math.floor(vals.length * 0.05)] : 0, hi = vals.length ? vals[Math.floor(vals.length * 0.95)] : 1, rango = Math.max(hi - lo, 0.02);
    ndLo = lo; ndHi = hi;
    var cv = document.createElement("canvas"); cv.width = NDV.w; cv.height = NDV.h; var cx = cv.getContext("2d"), im = cx.createImageData(NDV.w, NDV.h);
    for (i = 0; i < n; i++) {
      var q = NDV.datos[off + i], c = q > -30000 ? rampa((q / 1000 - lo) / rango) : [0.5, 0.5, 0.5];
      im.data[i * 4] = c[0] * 255; im.data[i * 4 + 1] = c[1] * 255; im.data[i * 4 + 2] = c[2] * 255; im.data[i * 4 + 3] = q > -30000 ? 255 : 0;
    }
    cx.putImageData(im, 0, 0);
    if (ndviTex) ndviTex.dispose();
    ndviTex = new THREE.CanvasTexture(cv); ndviTex.magFilter = THREE.LinearFilter; ndviTex.minFilter = THREE.LinearFilter; ndviTex.generateMipmaps = false;
    UN.uNdviMap.value = ndviTex;
    $("ndviFecha").textContent = NDV.fechas[ndviIdx].split("-").reverse().join("/");
    $("ndviRango").textContent = "medio " + fmt(NDV.media[ndviIdx], 2) + " · escala de " + fmt(lo, 2) + " a " + fmt(hi, 2);
    chispa();
  }
  function ndviRel(x, y) {
    if (!NDV) return 0.5;
    var u = (x - x0) / ANCHO * NDV.w - 0.5, v = (yN - y) / ALTO * NDV.h - 0.5;
    u = Math.max(0, Math.min(NDV.w - 1.001, u)); v = Math.max(0, Math.min(NDV.h - 1.001, v));
    var iu = Math.floor(u), iv = Math.floor(v), tu = u - iu, tv = v - iv, off = ndviIdx * NDV.w * NDV.h, w = NDV.w, vals = [], i;
    var q = [NDV.datos[off + iv * w + iu], NDV.datos[off + iv * w + iu + 1], NDV.datos[off + (iv + 1) * w + iu], NDV.datos[off + (iv + 1) * w + iu + 1]];
    for (i = 0; i < 4; i++) if (q[i] <= -30000) return 0.5;
    var val = ((q[0] * (1 - tu) + q[1] * tu) * (1 - tv) + (q[2] * (1 - tu) + q[3] * tu) * tv) / 1000;
    return (val - ndLo) / Math.max(ndHi - ndLo, 0.02);
  }
  function chispa() { // evolución del NDVI medio de la ventana en el último año
    var W2 = 250, H2 = 46, m = NDV.media, mn = Math.min.apply(null, m), mx = Math.max.apply(null, m), r = Math.max(mx - mn, 0.02), n = m.length, p = [], i;
    for (i = 0; i < n; i++) p.push((6 + i / (n - 1) * (W2 - 12)).toFixed(1) + "," + (H2 - 6 - (m[i] - mn) / r * (H2 - 14)).toFixed(1));
    var cxp = 6 + ndviIdx / (n - 1) * (W2 - 12), cyp = H2 - 6 - (m[ndviIdx] - mn) / r * (H2 - 14);
    $("chispa").innerHTML = '<svg viewBox="0 0 ' + W2 + " " + H2 + '" role="img" aria-label="Evolución del NDVI medio en el último año"><polyline points="' + p.join(" ") + '" fill="none" stroke="var(--olivo)" stroke-width="1.6"/><line x1="' + cxp + '" x2="' + cxp + '" y1="2" y2="' + (H2 - 2) + '" stroke="var(--guardado)" stroke-width="1.2"/><circle cx="' + cxp + '" cy="' + cyp + '" r="3.4" fill="var(--guardado)"/></svg>';
  }
  $("cTinte").addEventListener("change", function () { tinte = $("cTinte").checked; if (NDV) pintaNdvi(); aplicaLuego(); });
  if (NDV) { $("ndviSel").addEventListener("change", function () { if (tinte) aplicaLuego(); }); }
  if (NDV) { $("ndviSel").max = NDV.fechas.length - 1; $("ndviSel").value = ndviIdx; $("ndviSel").addEventListener("input", function (e) { ndviIdx = Number(e.target.value); pintaNdvi(); }); }
  $("cNdvi").addEventListener("change", function () { capaNdvi.visible = $("cNdvi").checked; $("bNdvi").hidden = !$("cNdvi").checked; if (capaNdvi.visible) pintaNdvi(); });
  $("cSolo").addEventListener("change", function () { var o = $("cSolo").checked; gArboles.visible = !o && modo === "gem"; gFollaje.visible = !o && modo === "gem"; gSombras.visible = !o && modo === "gem"; nube.visible = !o && modo === "nube"; });

