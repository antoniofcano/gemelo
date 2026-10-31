// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($, fmt), 02c_componentes (Componentes), 10_ndvi (NDV, ndviIdx, rampa, pintaNdvi)
// ===============================================================================

  // ---------- la capa de vigor (componente «capa-ndvi», ADR-0023, C10 cuarta tanda): el NDVI de la fecha elegida pintado sobre el terreno, con su leyenda y su gráfica
  // anual. Antes vivía en 10_ndvi.js; ese fichero conserva los datos, la fecha y la escala (pintaNdvi), que el resto del motor lee, y avisa con «ndvi:cambia». La textura
  // la lee el sombreador del terreno (04d) por sus uniformes uNdviOn y uNdviMap, que siguen siendo del núcleo. ?capandvi=0 la apaga: el terreno no se tiñe, y las casillas
  // siguen en el menú (la casilla «Vigor» queda sin efecto, como las de otros componentes apagados; «Copas coloreadas por NDVI» funciona igual).
  var ndviSuelta = null;   // lo que libera el componente montado
  function CapaNdviMotor(n) {
    var tex = null, cas = $("cNdvi"), disp = false;
    function chispa() {   // evolución del NDVI medio de la ventana en el último año
      var W2 = 250, H2 = 46, m = NDV.media, mn = Math.min.apply(null, m), mx = Math.max.apply(null, m), r = Math.max(mx - mn, 0.02), k = m.length, p = [], i;
      for (i = 0; i < k; i++) p.push((6 + i / (k - 1) * (W2 - 12)).toFixed(1) + "," + (H2 - 6 - (m[i] - mn) / r * (H2 - 14)).toFixed(1));
      var cxp = 6 + ndviIdx / (k - 1) * (W2 - 12), cyp = H2 - 6 - (m[ndviIdx] - mn) / r * (H2 - 14);
      $("chispa").innerHTML = '<svg viewBox="0 0 ' + W2 + " " + H2 + '" role="img" aria-label="Evolución del NDVI medio en el último año"><polyline points="' + p.join(" ") + '" fill="none" stroke="var(--olivo)" stroke-width="1.6"/><line x1="' + cxp + '" x2="' + cxp + '" y1="2" y2="' + (H2 - 2) + '" stroke="var(--guardado)" stroke-width="1.2"/><circle cx="' + cxp + '" cy="' + cyp + '" r="3.4" fill="var(--guardado)"/></svg>';
    }
    function pinta(d) {   // la fecha o la escala cambiaron (pintaNdvi de 10_ndvi.js): rehace la textura, la leyenda y la gráfica
      var k = NDV.w * NDV.h, off = ndviIdx * k, lo = d.lo, hi = d.hi, ancho = Math.max(hi - lo, 0.02), i;
      var cv = document.createElement("canvas"); cv.width = NDV.w; cv.height = NDV.h; var cx = cv.getContext("2d"), im = cx.createImageData(NDV.w, NDV.h);
      for (i = 0; i < k; i++) {
        var q = NDV.datos[off + i], c = q > -30000 ? rampa((q / 1000 - lo) / ancho) : [0.5, 0.5, 0.5];
        im.data[i * 4] = c[0] * 255; im.data[i * 4 + 1] = c[1] * 255; im.data[i * 4 + 2] = c[2] * 255; im.data[i * 4 + 3] = q > -30000 ? 255 : 0;
      }
      cx.putImageData(im, 0, 0);
      if (tex) tex.dispose();
      tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      UN.uNdviMap.value = tex;
      $("ndviFecha").textContent = NDV.fechas[ndviIdx].split("-").reverse().join("/");
      $("ndviRango").textContent = "medio " + fmt(NDV.media[ndviIdx], 2) + " · escala de " + fmt(lo, 2) + " a " + fmt(hi, 2);
      chispa();
    }
    function casilla() { var si = cas.checked; UN.uNdviOn.value = si ? 1 : 0; $("bNdvi").hidden = !si; if (si) pintaNdvi(); }
    n.on("ndvi:cambia", pinta);
    cas.addEventListener("change", casilla);
    n.limpia(function () { cas.removeEventListener("change", casilla); });
    if (cas.checked) casilla();   // montado tarde (la configuración del servidor, a mano), con la casilla ya marcada
    ndviSuelta = function () {
      if (disp) return; disp = true;
      UN.uNdviOn.value = 0; UN.uNdviMap.value = null; $("bNdvi").hidden = true;
      if (tex) tex.dispose(); tex = null;
    };
    return { textura: function () { return tex; } };
  }
  Componentes.registra({
    id: "capa-ndvi", version: 1,
    consume: ["NDV", "ndviIdx", "rampa", "pintaNdvi", "fmt", "UN"],
    expone: [],
    eventos: { escucha: ["ndvi:cambia"], emite: [] },
    bandera: { defecto: true, url: "capandvi" },
    presupuesto: { llamadas: 0, triangulos: 0, texturasMB: 1 },   // no añade mallas: la dibuja el sombreador del terreno. [SUPUESTO] 1 MB = textura RGBA de hasta 500 × 500 celdas de 10 m (5 km de lado), sin mipmaps; la rejilla de la maqueta, medida en componentes_c10d.test.js
    fases: {},
    monta: function (n) { return CapaNdviMotor(n); },
    actualiza: {},
    libera: function () { if (ndviSuelta) ndviSuelta(); ndviSuelta = null; }
  });
