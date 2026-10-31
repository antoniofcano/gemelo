// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: NDV, ndviIdx, rampa, pintaNdvi, ndviRel
// Consume: 01_datos (D, $, b64, i16, ANCHO, ALTO), 02_mundo (tinte, ndLo, ndHi), 02c_componentes (Bus), 03_escena (modo), 05_nube (nube),
//   06_arboles (gArboles, gFollaje, gSombras), 08_marcadores (aplicaLuego), 15_tiempo (hace)
// ===============================================================================
  // ---------- NDVI de Sentinel-2 (10 m), con escala relativa a la parcela (como hace Vigía). Esto es el núcleo: los datos, la fecha del campo y la escala, que leen el
  // tinte de los árboles, la hierba, la estación y la VR. La capa que lo pinta sobre el terreno, su leyenda y su gráfica son el componente «capa-ndvi» (10b_capa_ndvi.js):
  // se entera por «ndvi:cambia»; sin él (?capandvi=0), el tinte de los árboles y la fecha siguen funcionando.
  function u8aI16(s) {   // el NDVI de 8 bits (0 = sin dato; 1..254 → de −0,2 a 1,0) se pasa a milésimas en Int16, que es lo que usa el resto
    var u = b64(s), d = new Int16Array(u.length); for (var i = 0; i < u.length; i++) d[i] = u[i] === 0 ? -32768 : Math.round(((u[i] - 1) / 253 * 1.2 - 0.2) * 1000); return d;
  }
  var NDV = D.ndvi ? { w: D.ndvi.w, h: D.ndvi.h, fechas: D.ndvi.fechas, media: D.ndvi.media, datos: D.ndvi.u8 ? u8aI16(D.ndvi.u8) : i16(D.ndvi.b64) } : null;
  var ndviIdx = NDV ? NDV.fechas.length - 1 : 0;
  function rampa(t) { // marrón rojizo -> amarillo -> verde
    t = Math.max(0, Math.min(1, t));
    var a = t < 0.5 ? [0.55, 0.29, 0.18] : [0.85, 0.78, 0.35], b = t < 0.5 ? [0.85, 0.78, 0.35] : [0.18, 0.49, 0.2], u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }
  function pintaNdvi() {   // la escala relativa de la fecha elegida (la usa ndviRel, también con la capa apagada: el tinte de los árboles); el dibujo, por «ndvi:cambia»
    if (!NDV) return;
    var n = NDV.w * NDV.h, off = ndviIdx * n, vals = [], i;
    for (i = 0; i < n; i++) { var v = NDV.datos[off + i]; if (v > -30000) vals.push(v / 1000); }
    vals.sort(function (a, b) { return a - b; });
    var lo = vals.length ? vals[Math.floor(vals.length * 0.05)] : 0, hi = vals.length ? vals[Math.floor(vals.length * 0.95)] : 1;
    ndLo = lo; ndHi = hi;
    Bus.emite("ndvi:cambia", { lo: lo, hi: hi });
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
  $("cTinte").addEventListener("change", function () { tinte = $("cTinte").checked; if (NDV) pintaNdvi(); aplicaLuego(); });
  if (NDV) { $("ndviSel").addEventListener("change", function () { if (tinte) aplicaLuego(); }); }
  if (NDV) { $("ndviSel").max = NDV.fechas.length - 1; $("ndviSel").value = ndviIdx; $("ndviSel").addEventListener("input", function (e) { ndviIdx = Number(e.target.value); pintaNdvi(); }); }
  $("cSolo").addEventListener("change", function () { var o = $("cSolo").checked; gArboles.visible = !o && modo === "gem"; gFollaje.visible = !o && modo === "gem"; gSombras.visible = !o && modo === "gem"; nube.visible = !o && modo === "nube"; });

