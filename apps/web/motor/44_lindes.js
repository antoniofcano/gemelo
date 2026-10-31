// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02_mundo (Mundo, suelo), 02c_componentes (Componentes), 03_escena (lienzo, exag), 08_marcadores (gLinde), 09_camara (elige),
//   13b_hazas (Hazas), 14_historia (lista), 15_tiempo (hace, lindes), 29_vr (ficha)
// Nota: Componente «lindes-hazas» (A4, ADR-0023; decisiones 12, 13, 95 y 139): la linde de las hazas pegada al relieve, la tuya destacada y las ajenas discretas, con LineSegments2/LineMaterial de three (import() al montarse; 2 llamadas, 6 triángulos por tramo, tope de 8.000 tramos). Solo se registra; nadie lo nombra. ?lindes=0 lo apaga. Lee Hazas.lindes() al oír «hazas:cambia»; da su línea de ?debug por «depura:lineas». Publica window.__lindes (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/lindes.test.js.
// ===============================================================================
  // ---------- la linde de las hazas en el mundo (A4, el «3c»; ADR-0014, decisiones 12, 13, 95 y 139): la de las tuyas destacada (ámbar, gruesa, opaca), las de
  // los demás hogares discretas (blanco roto, fina, medio transparente), pegadas al relieve. La linde es un DATO DIBUJADO POR LA OFICINA (decisión 12): un
  // límite de gestión, no un deslinde ni una medida; la ficha de la haza (13b_hazas.js) lo dice. Las hazas las trae 13b_hazas.js de la api (Hazas.lindes()
  // y el evento «hazas:cambia»); sin servidor o sin hazas, este componente no crea nada.
  // Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. ?lindes=0 (o la configuración del servidor) lo apaga: las hazas siguen (ficha, H, minimapa),
  // sin dibujo en el mundo. La casilla «Linde» del menú lo enciende y apaga a la vista (cuelga de gLinde).
  //
  // Técnica (regla 12: la de three): LineSegments2 + LineSegmentsGeometry + LineMaterial de three 0.186.1 (three/addons/lines), pedidos con import() al
  // montarse. Cada tramo es una instancia de 6 triángulos dibujada en espacio de pantalla con el ancho en píxeles: igual de legible de cerca que de lejos, en
  // WebGL2 y en las gafas, sin depender de gl.lineWidth (que en WebGL vale 1). UNA llamada para las propias y OTRA para las ajenas (2 en total).
  // Pegada al relieve: cada lado se parte en tramos de ≤ PASO_MIN m y, además, en cada borde de tesela (256 m), así que ningún tramo cruza de una tesela a otra
  // y cada vértice se sienta en el relieve de la CPU (suelo(), el mismo que usan la llegada y las balizas) a ALTURA m × exag. Al llegar relieve fino
  // (Mundo.alCargar) o al cambiar la exageración se reescriben las posiciones en el mismo búfer (fase «tarde», cada 0,5 s), sin crear memoria.
  // Sin parpadeo: no es coplanaria con el suelo (va ALTURA m por encima) y, además, el sombreador acerca cada vértice a la cámara una fracción de su distancia
  // (ESTILO.acerca: 0,4 % la propia, 0,2 % las ajenas) escalando su posición de cámara; eso no mueve nada en pantalla, solo la profundidad, y absorbe la
  // diferencia entre el relieve de la CPU y el del tileset a cualquier distancia (a 500 m, 2 m). La propia, más acercada, gana a la ajena donde coinciden;
  // los lados comunes (misma clave, a 1 cm) se dibujan una sola vez y, si uno es de una haza tuya, como propio.
  // Presupuesto (regla 6): 2 llamadas; 6 triángulos por tramo: 3 por metro de linde con el paso de 2 m más 6 por cada corte de tesela o vértice; tope de
  // MAX_SEG tramos (48.000 triángulos): con más linde, el paso crece hasta caber y, si ni así, se recortan primero las ajenas (estado().recortado).
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/lindes.test.js)
  var LindesPuro = (function () {
    var TRI_SEG = 6, PASO_MIN = 2, MAX_SEG = 8000, ALTURA = 0.2, VR_ANCHO = 1.5, EPS_T = 1e-9, JUNTA = 1e-3;
    // colores tal como se ven (sRGB; THREE.Color los pasa a lineal), ancho en píxeles CSS (en VR, × VR_ANCHO en píxeles del ojo) y acercamiento de profundidad
    var ESTILO = {
      propia: { color: 0xffb020, ancho: 4, opacidad: 1, acerca: 0.004 },
      ajena: { color: 0xe8ecf0, ancho: 2, opacidad: 0.6, acerca: 0.002 }
    };
    function largo(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
    function clave(a, b) {   // el lado sin sentido, a 1 cm: dos hazas que comparten lado lo dan con los mismos vértices (la oficina ajusta a vecinas)
      var p = Math.round(a[0] * 100) + "," + Math.round(a[1] * 100), q = Math.round(b[0] * 100) + "," + Math.round(b[1] * 100);
      return p < q ? p + "|" + q : q + "|" + p;
    }
    // hs: [{ es_mia, anillos: [[[x, y]…]…] }] (locales) → { propia: [[a, b]…], ajena: [[a, b]…] }: cada lado una vez (el de una haza tuya, como propio);
    // los anillos sin cerrar se cierran; los lados de menos de 1 mm se saltan
    function lados(hs) {
      var visto = {}, out = { propia: [], ajena: [] };
      [true, false].forEach(function (mia) {
        (hs || []).forEach(function (h) {
          if (!!h.es_mia !== mia) return;
          (h.anillos || []).forEach(function (an) {
            if (!an || an.length < 2) return;
            var n = an.length, cerrado = an[0][0] === an[n - 1][0] && an[0][1] === an[n - 1][1];
            for (var i = 0; i < (cerrado ? n - 1 : n); i++) {
              var a = an[i], b = an[(i + 1) % n];
              if (largo(a, b) < JUNTA) continue;
              var k = clave(a, b); if (visto[k]) continue; visto[k] = true;
              out[mia ? "propia" : "ajena"].push([a, b]);
            }
          });
        });
      });
      return out;
    }
    // los cortes de un lado a → b: parámetros t ∈ [0, 1] (0 y 1 incluidos, crecientes) con tramos de ≤ paso m y un corte en cada borde de tesela
    // (múltiplos de TS en UTM: x + ox, y + oy; ox, oy = centro_utm). Dos cortes a menos de 1 mm se funden.
    function cortes(a, b, paso, TS, ox, oy) {
      var L = largo(a, b), m = Math.max(1, Math.ceil(L / paso - EPS_T)), ts = [], s;
      for (s = 0; s <= m; s++) ts.push(s / m);
      if (TS > 0) {
        [[a[0] + ox, b[0] + ox], [a[1] + oy, b[1] + oy]].forEach(function (u) {
          if (u[0] === u[1]) return;
          var lo = Math.min(u[0], u[1]), hi = Math.max(u[0], u[1]);
          for (var g = Math.floor(lo / TS) + 1; g * TS < hi; g++) { var t = (g * TS - u[0]) / (u[1] - u[0]); if (t > 0 && t < 1) ts.push(t); }
        });
        ts.sort(function (p, q) { return p - q; });
      }
      var out = [ts[0]];
      for (s = 1; s < ts.length; s++) if ((ts[s] - out[out.length - 1]) * L >= JUNTA) out.push(ts[s]);
      if (out[out.length - 1] !== 1) out[out.length - 1] = 1;   // el último es siempre el final del lado (si se fundió con un corte de tesela a < 1 mm)
      return out;
    }
    function tramos(ls, paso, TS, ox, oy) { var n = 0; for (var i = 0; i < ls.length; i++) n += cortes(ls[i][0], ls[i][1], paso, TS, ox, oy).length - 1; return n; }
    function longitud(ls) { var L = 0; for (var i = 0; i < ls.length; i++) L += largo(ls[i][0], ls[i][1]); return L; }
    // el plan: el paso (≥ PASO_MIN) con el que todo cabe en maxSeg tramos y cuántos de cada grupo se dibujan (si ni con el paso más largo cabe, las ajenas
    // se recortan primero: las propias son las que importan). → { lados, paso, n: { propia, ajena }, total, recortado, longitud }
    function plan(hs, TS, ox, oy, maxSeg) {
      var ls = lados(hs), todos = ls.propia.concat(ls.ajena), L = longitud(todos), max = maxSeg || MAX_SEG;
      var paso = Math.max(PASO_MIN, L / (max * 0.9)), np = tramos(ls.propia, paso, TS, ox, oy), na = tramos(ls.ajena, paso, TS, ox, oy), it = 0;
      while (np + na > max && it < 40) { paso *= 1.25; np = tramos(ls.propia, paso, TS, ox, oy); na = tramos(ls.ajena, paso, TS, ox, oy); it++; }
      var recortado = np + na > max;
      if (recortado) { np = Math.min(np, max); na = Math.max(0, max - np); }
      return { lados: ls, paso: paso, n: { propia: np, ajena: na }, total: np + na, recortado: recortado, longitud: L };
    }
    // las posiciones de los tramos de una lista de lados: (x, (suelo + alto) × exag, −y) del principio y del final de cada tramo, 6 números por tramo (el formato
    // de LineSegmentsGeometry.setPositions). limite: como mucho tantos tramos. pos: si tiene el largo justo, se reescribe (repegar sin crear memoria).
    function escribe(ls, paso, TS, ox, oy, suelo, exag, alto, limite, pos) {
      var n = Math.min(tramos(ls, paso, TS, ox, oy), limite === undefined ? Infinity : limite), k = 0, i, s;
      pos = pos && pos.length === n * 6 ? pos : new Float32Array(n * 6);
      function punto(x, y) { pos[k++] = x; pos[k++] = (suelo(x, y) + alto) * exag; pos[k++] = -y; }
      for (i = 0; i < ls.length && k < n * 6; i++) {
        var a = ls[i][0], b = ls[i][1], ts = cortes(a, b, paso, TS, ox, oy), dx = b[0] - a[0], dy = b[1] - a[1];
        for (s = 0; s + 1 < ts.length && k < n * 6; s++) { punto(a[0] + dx * ts[s], a[1] + dy * ts[s]); punto(a[0] + dx * ts[s + 1], a[1] + dy * ts[s + 1]); }
      }
      return { pos: pos, n: n };
    }
    function triangulos(n) { return TRI_SEG * n; }
    // el ancho en píxeles y la resolución con que lo mide LineMaterial: en VR, el viewport de cada ojo (píxeles del ojo) y el ancho × VR_ANCHO
    function ancho(base, vr) { return vr ? base * VR_ANCHO : base; }
    // el acercamiento de profundidad en el sombreador de LineMaterial: tras las posiciones de cámara de los dos extremos del tramo, se escalan hacia el ojo.
    // Devuelve el sombreador cambiado, o el mismo si three cambió y no está la línea de referencia (entonces, sin acercar: se ve igual, con algo más de riesgo
    // de parpadeo donde el tileset sube sobre la linde)
    var ANCLA = "vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );";
    function conAcercamiento(vs) {
      if (typeof vs !== "string" || vs.indexOf(ANCLA) < 0) return vs;
      return vs.replace("uniform float linewidth;", "uniform float linewidth;\nuniform float uAcerca;").replace(ANCLA, ANCLA + "\n\t\t\tstart.xyz *= uAcerca; end.xyz *= uAcerca;");
    }
    return { TRI_SEG: TRI_SEG, PASO_MIN: PASO_MIN, MAX_SEG: MAX_SEG, ALTURA: ALTURA, VR_ANCHO: VR_ANCHO, ESTILO: ESTILO, ANCLA: ANCLA,
      clave: clave, lados: lados, cortes: cortes, tramos: tramos, longitud: longitud, plan: plan, escribe: escribe, triangulos: triangulos, ancho: ancho, conAcercamiento: conAcercamiento };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/lindes.test.js con un THREE, unas líneas y unas hazas de mentira)
  var lindesHazasAviso = { fn: null, puesto: false };   // Mundo.alCargar no tiene «quitar»: se engancha UNA vez y llama al montaje vivo, si lo hay
  function LindesMotor(n, cargaLib) {
    var P = LindesPuro, TS = Mundo.TS, OX = Mundo.cx, OY = Mundo.cy, vivo = true, L = null, grupo = null, mallas = {}, pl = null, sucio = false, exagHecha = -1;
    var st = { lib: "pidiendo", hazas: 0, tramos: { propia: 0, ajena: 0 }, triangulos: 0, llamadas: 0, paso: 0, longitud: 0, recortado: false, repegadas: 0, acerca: false };
    var vp = new THREE.Vector4();
    function vaciaLindes() {
      if (grupo) gLinde.remove(grupo);
      Object.keys(mallas).forEach(function (k) { mallas[k].geo.dispose(); mallas[k].mat.dispose(); });
      grupo = null; mallas = {}; pl = null;
      st.tramos = { propia: 0, ajena: 0 }; st.triangulos = 0; st.llamadas = 0; st.paso = 0; st.longitud = 0; st.recortado = false;
    }
    function acercaShader(sh) { var v = P.conAcercamiento(sh.vertexShader); st.acerca = v !== sh.vertexShader; sh.vertexShader = v; }
    // el ancho en píxeles lo mide LineMaterial con su «resolution»: fuera de VR, el viewport del lienzo (lo que hace LineSegments2); en VR, el de cada ojo
    // (la cámara de cada ojo trae su viewport), con el ancho algo mayor (no probado en unas gafas reales)
    function resolucion(o, base) {
      return function (r, escena, cam) {
        var u = o.material.uniforms, v = cam && cam.viewport;
        if (v && v.z > 0) { u.resolution.value.set(v.z, v.w); u.linewidth.value = P.ancho(base, true); }
        else { r.getViewport(vp); u.resolution.value.set(vp.z, vp.w); u.linewidth.value = P.ancho(base, false); }
      };
    }
    function construye() {
      vaciaLindes();
      var hs = Hazas.lindes(); st.hazas = hs.length;
      if (!L || !hs.length) return;
      pl = P.plan(hs, TS, OX, OY, P.MAX_SEG);
      grupo = new THREE.Group(); grupo.name = "linde de las hazas";
      ["propia", "ajena"].forEach(function (k) {
        if (!pl.n[k]) return;
        var e = P.ESTILO[k], w = P.escribe(pl.lados[k], pl.paso, TS, OX, OY, suelo, exag, P.ALTURA, pl.n[k]);
        var geo = new L.LineSegmentsGeometry(); geo.setPositions(w.pos);
        var mat = new L.LineMaterial({ color: e.color, linewidth: e.ancho, worldUnits: false, transparent: e.opacidad < 1, opacity: e.opacidad, depthWrite: e.opacidad >= 1 });
        mat.uniforms.uAcerca = { value: 1 - e.acerca };
        mat.onBeforeCompile = acercaShader; mat.customProgramCacheKey = function () { return "lindes-hazas-acerca"; };
        var o = new L.LineSegments2(geo, mat);
        o.name = k === "propia" ? "lindes propias" : "lindes ajenas"; o.renderOrder = k === "propia" ? 2 : 1;
        o.raycast = function () {};   // la haza se elige por el suelo (13b_hazas.js), no por la línea; y así ningún rayo sin cámara la pregunta
        o.onBeforeRender = resolucion(o, e.ancho);
        o.matrixAutoUpdate = false; o.updateMatrix();
        grupo.add(o); mallas[k] = { obj: o, geo: geo, mat: mat };
        st.tramos[k] = w.n;
      });
      gLinde.add(grupo);
      exagHecha = exag; sucio = false;
      st.triangulos = P.triangulos(st.tramos.propia + st.tramos.ajena); st.llamadas = Object.keys(mallas).length; st.paso = pl.paso; st.longitud = pl.longitud; st.recortado = pl.recortado;
    }
    // repegar al relieve: las mismas posiciones reescritas en el mismo búfer (el que LineSegmentsGeometry comparte entre instanceStart e instanceEnd)
    function repega() {
      Object.keys(mallas).forEach(function (k) {
        var g = mallas[k].geo, a = g.getAttribute("instanceStart"), buf = a.data;
        P.escribe(pl.lados[k], pl.paso, TS, OX, OY, suelo, exag, P.ALTURA, pl.n[k], buf.array);
        buf.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere();
      });
      exagHecha = exag; sucio = false; st.repegadas++;
    }
    function tarde() { if (pl && (sucio || exag !== exagHecha)) repega(); }
    lindesHazasAviso.fn = function () { sucio = true; };
    if (!lindesHazasAviso.puesto) { lindesHazasAviso.puesto = true; Mundo.alCargar(function () { if (lindesHazasAviso.fn) lindesHazasAviso.fn(); }); }
    n.on("hazas:cambia", function () { if (L) construye(); else st.hazas = Hazas.lindes().length; });
    n.on("depura:lineas", function (d) {
      if (d && d.lineas && st.llamadas) d.lineas.push("Lindes: " + st.llamadas + " llamadas · " + (st.tramos.propia + st.tramos.ajena) + " tramos · " + st.triangulos + " triángulos · paso " + st.paso.toFixed(1) + " m" + (st.recortado ? " · RECORTADAS" : ""));
    });
    cargaLib().then(function (m) { if (!vivo) return; L = m; st.lib = "lista"; construye(); }, function (e) { if (vivo) st.lib = "sin líneas: " + String(e && e.message || e).slice(0, 80); });
    function estado() { var o = {}; Object.keys(st).forEach(function (k) { o[k] = k === "tramos" ? { propia: st.tramos.propia, ajena: st.tramos.ajena } : st[k]; }); return o; }
    window.__lindes = function (que) { if (que === "libera") { Componentes.libera("lindes-hazas"); return null; } return estado(); };   // pruebas y ?debug
    n.limpia(function () { try { delete window.__lindes; } catch (e) { window.__lindes = undefined; } });
    function libera() { vivo = false; if (lindesHazasAviso.fn) lindesHazasAviso.fn = null; vaciaLindes(); }
    return { tarde: tarde, libera: libera, estado: estado };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?lindes=0 lo apaga; ?lindes=1 lo enciende.
  Componentes.registra({
    id: "lindes-hazas", version: 1,
    consume: ["Hazas", "gLinde"],
    expone: [],
    eventos: { escucha: ["hazas:cambia", "depura:lineas"], emite: [] },
    bandera: { defecto: true, url: "lindes" },
    // 2 llamadas (propias y ajenas, cada una una malla instanciada de three) y como mucho MAX_SEG tramos de 6 triángulos: 48.000 (con la linde de una
    // finca normal, unas decenas de miles menos: 3 por metro). Sin texturas.
    presupuesto: { llamadas: 2, triangulos: 48000 },
    fases: { tarde: 0.5 },
    monta: function (n) {
      return LindesMotor(n, function () {
        return Promise.all([import("three/addons/lines/LineSegments2.js"), import("three/addons/lines/LineSegmentsGeometry.js"), import("three/addons/lines/LineMaterial.js")])
          .then(function (m) { return { LineSegments2: m[0].LineSegments2, LineSegmentsGeometry: m[1].LineSegmentsGeometry, LineMaterial: m[2].LineMaterial }; });
      });
    },
    actualiza: { tarde: function (dt, t, api) { api.tarde(); } },
    libera: function (api) { if (api) api.libera(); }
  });
