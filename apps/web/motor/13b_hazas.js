// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Hazas
// Consume: 01_datos (D, $), 02_mundo (Mundo, suelo), 03_escena (lienzo, camera, SRGB, exag), 08_marcadores (gLinde), 09_camara (objetivo),
//   12_paseo (paseando), 13_parcelas (parcelas), 29_vr (ficha)
// Nota: Sin D.base /teselas/… ni ?api= no pide nada ni crea nada; el trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/hazas.test.js.
// ===============================================================================
  // ---------- las hazas en el mundo (F1, el «3c»): sus límites dibujados sobre el suelo y, al tocar una, su ficha pública (ADR-0014, contratos/haza.schema.json).
  // Solo habla con la api cuando la página la sirve el servidor (D.base empieza por /teselas/: la web y las teselas van tras la sesión) o con ?api=<prefijo>
  // relativo del mismo origen (pruebas). En la salida artefacto, el fixture o sin api no pide nada, no crea nada y no escribe en la consola: el motor dibuja
  // exactamente lo mismo que sin este módulo. Si la api contesta 401, otro error o algo que no cumple el contrato, tampoco se dibuja nada.
  // La linde de cada haza la dibuja la oficina (decisión 12): es un límite de gestión, no un deslinde. Nunca se pide ni se muestra el titular (solo el alias que el hogar deja ver).

  // [puro:inicio] — validación del GeoJSON, coordenadas, geometría de la linde y filas de la ficha: sin THREE ni DOM; lo evalúa en Node pruebas/guardianes/hazas.test.js
  var HazasPuro = (function () {
    var MAX_HAZAS = 2000, MAX_VERT = 200000, CLAVES_COL = ["type", "srs", "features"], CLAVES_F = ["type", "id", "geometry", "properties"], CLAVES_P = ["codigo", "nombre", "finca", "es_mia"];
    function esObj(o) { return o !== null && typeof o === "object" && !Array.isArray(o); }
    function soloClaves(o, permitidas, req) {   // como additionalProperties: false + required
      var k = Object.keys(o), i;
      for (i = 0; i < k.length; i++) if (permitidas.indexOf(k[i]) < 0) return "clave no permitida: " + k[i];
      for (i = 0; i < req.length; i++) if (!(req[i] in o)) return "falta " + req[i];
      return null;
    }
    function num(v) { return typeof v === "number" && isFinite(v); }
    // GET /api/hazas (contratos/api.openapi.yaml, Hazas) → { hazas: [{ id, codigo, nombre, finca, es_mia, poligonos: [[anillo UTM [[x, y]…]…]…] }], error }
    // El motor pide srs=25830 y solo acepta EPSG:25830 (UTM 30N, el del mundo). Lo que no cumple, entero fuera: no se adivina.
    function validaColeccion(c) {
      var mal = function (m) { return { hazas: [], error: m }; };
      if (!esObj(c)) return mal("no es un objeto");
      var e = soloClaves(c, CLAVES_COL, CLAVES_COL); if (e) return mal(e);
      if (c.type !== "FeatureCollection") return mal("type no es FeatureCollection");
      if (c.srs !== "EPSG:25830") return mal("srs no es EPSG:25830");
      if (!Array.isArray(c.features)) return mal("features no es un array");
      if (c.features.length > MAX_HAZAS) return mal("demasiadas hazas");
      var out = [], nv = 0;
      for (var i = 0; i < c.features.length; i++) {
        var f = c.features[i], donde = "features[" + i + "]: ";
        if (!esObj(f)) return mal(donde + "no es un objeto");
        e = soloClaves(f, CLAVES_F, CLAVES_F); if (e) return mal(donde + e);
        if (f.type !== "Feature") return mal(donde + "type no es Feature");
        if (typeof f.id !== "number" || Math.floor(f.id) !== f.id) return mal(donde + "id no es entero");
        var p = f.properties; if (!esObj(p)) return mal(donde + "properties no es un objeto");
        e = soloClaves(p, CLAVES_P, CLAVES_P); if (e) return mal(donde + "properties: " + e);
        if (typeof p.codigo !== "string" || typeof p.nombre !== "string" || typeof p.finca !== "string" || typeof p.es_mia !== "boolean") return mal(donde + "properties: tipo no válido");
        var g = f.geometry; if (!esObj(g) || g.type !== "MultiPolygon" || !Array.isArray(g.coordinates)) return mal(donde + "geometry no es un MultiPolygon");
        var polis = [];
        for (var a = 0; a < g.coordinates.length; a++) {
          var pol = g.coordinates[a]; if (!Array.isArray(pol)) return mal(donde + "polígono no válido");
          var anillos = [];
          for (var b = 0; b < pol.length; b++) {
            var an = pol[b]; if (!Array.isArray(an) || an.length < 4) return mal(donde + "anillo con menos de 4 vértices");
            for (var v = 0; v < an.length; v++) if (!Array.isArray(an[v]) || an[v].length < 2 || !num(an[v][0]) || !num(an[v][1])) return mal(donde + "vértice no válido");
            nv += an.length; if (nv > MAX_VERT) return mal("demasiados vértices");
            anillos.push(an);
          }
          if (anillos.length) polis.push(anillos);
        }
        out.push({ id: f.id, codigo: p.codigo, nombre: p.nombre, finca: p.finca, es_mia: p.es_mia, poligonos: polis });
      }
      return { hazas: out, error: null };
    }
    // UTM 30N (EPSG:25830) → coordenadas del mundo: metros relativos a centro_utm (x al este, y al norte; en la escena, z = −y)
    function aLocal(p, cx, cy) { return [p[0] - cx, p[1] - cy]; }
    function anillosLocales(h, cx, cy) {
      var out = [];
      h.poligonos.forEach(function (pol) { pol.forEach(function (an) { out.push(an.map(function (q) { return aLocal(q, cx, cy); })); }); });
      return out;
    }
    // ¿cae alguna parte de la haza dentro de la caja del mundo (ext = [x0, yN, x1, yS], local) con un margen? Lo de fuera no se dibuja.
    function enElMundo(anillos, ext, margen) {
      for (var i = 0; i < anillos.length; i++) for (var j = 0; j < anillos[i].length; j++) {
        var q = anillos[i][j]; if (q[0] >= ext[0] - margen && q[0] <= ext[2] + margen && q[1] >= ext[3] - margen && q[1] <= ext[1] + margen) return true;
      }
      return false;
    }
    // par-impar sobre todos los anillos del polígono: un agujero (anillo interior) queda fuera
    function dentroPoligono(x, y, pol) {
      var den = false;
      for (var r = 0; r < pol.length; r++) {
        var an = pol[r];
        for (var i = 0, j = an.length - 1; i < an.length; j = i++) {
          var xi = an[i][0], yi = an[i][1], xj = an[j][0], yj = an[j][1];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) den = !den;
        }
      }
      return den;
    }
    // la haza (de una hs de { poligonosLoc }) en la que cae el punto local (x, y), o −1
    function hazaEn(x, y, hs) {
      for (var k = 0; k < hs.length; k++) for (var p = 0; p < hs[k].poligonosLoc.length; p++) if (dentroPoligono(x, y, hs[k].poligonosLoc[p])) return k;
      return -1;
    }
    // la linde de cada haza como segmentos de línea pegados al suelo: cada lado se parte en tramos de ≤ paso metros y cada punto va a (suelo + alto) × exag.
    // hs: [{ anillos: [[x, y]…]…, color: [r, g, b] lineal }]; suelo(x, y) en metros. Devuelve { pos: Float32Array, col: Float32Array, n } (n vértices).
    function cuentaVertices(hs, paso) {
      var n = 0;
      hs.forEach(function (h) { h.anillos.forEach(function (an) { for (var i = 0; i + 1 < an.length; i++) n += 2 * Math.max(1, Math.ceil(Math.hypot(an[i + 1][0] - an[i][0], an[i + 1][1] - an[i][1]) / paso)); }); });
      return n;
    }
    function segmentos(hs, suelo, exag, paso, alto, pos, col) {
      var n = cuentaVertices(hs, paso), k = 0;
      pos = pos && pos.length === n * 3 ? pos : new Float32Array(n * 3); col = col && col.length === n * 3 ? col : new Float32Array(n * 3);
      function escribe(x, y, c) { pos[k * 3] = x; pos[k * 3 + 1] = (suelo(x, y) + alto) * exag; pos[k * 3 + 2] = -y; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; k++; }
      hs.forEach(function (h) {
        h.anillos.forEach(function (an) {
          for (var i = 0; i + 1 < an.length; i++) {
            var a = an[i], b = an[i + 1], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / paso));
            for (var s = 0; s < m; s++) { var t0 = s / m, t1 = (s + 1) / m; escribe(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, h.color); escribe(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, h.color); }
          }
        });
      });
      return { pos: pos, col: col, n: n };
    }
    // del toque al suelo: avanza por el rayo (origen o, dirección d unitaria, en la escena) hasta pasar bajo alturaEn(x, z) y afina por bisección.
    // Devuelve el punto local [x, y] (y = −z) o null si el rayo no toca el suelo antes de tMax.
    function rayoSuelo(o, d, alturaEn, tMax) {
      var tA = 0, t = 0, bajo = function (tt) { var x = o[0] + d[0] * tt, y = o[1] + d[1] * tt, z = o[2] + d[2] * tt; return y <= alturaEn(x, z); };
      if (bajo(0)) return null;
      while (t < tMax) {
        tA = t; t += Math.max(1, t * 0.01);
        if (bajo(t)) {
          var lo = tA, hi = t; for (var i = 0; i < 24; i++) { var m = (lo + hi) / 2; if (bajo(m)) hi = m; else lo = m; }
          return [o[0] + d[0] * hi, -(o[2] + d[2] * hi)];
        }
      }
      return null;
    }
    // ---- la ficha: SOLO la hs blanca de contratos/haza.schema.json, campo a campo, cada dato con su procedencia y su fecha.
    // Lo que no está aquí no se enseña aunque llegue (titular, kilos, personas, GPS, texto libre: la api ya no los manda, ADR-0014).
    var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    function fecha(s) {   // «2026-10-01» o una fecha-hora ISO → «1-oct-2026» (la hora, si la hay, en la zona del navegador)
      if (typeof s !== "string") return "sin fecha";
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (m) return Number(m[3]) + "-" + MESES[Number(m[2]) - 1] + "-" + m[1];
      var d = new Date(s); if (isNaN(d.getTime())) return "sin fecha";
      return d.getDate() + "-" + MESES[d.getMonth()] + "-" + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }
    function n1(v, d) { return Number(v).toLocaleString("es-ES", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
    function ultimo(hs) { var u = null; (Array.isArray(hs) ? hs : []).forEach(function (e) { if (e && typeof e.fecha === "string" && (!u || e.fecha > u.fecha)) u = e; }); return u; }
    var AVISOS = { ot_sin_sincronia: "aún no se ha leído OlivarTrack", ot_truncado: "una lectura de OlivarTrack llegó cortada", ot_parcial: "una lectura de OlivarTrack llegó incompleta", ot_error: "una lectura de OlivarTrack falló" };
    var TIPOS = { fitosanitario: "fitosanitario", nutricion: "nutrición", corrector: "corrector", otro: "otro" };
    var ANALITICA = { suelo: "de suelo", foliar: "foliar", agua: "de agua", otra: "otra" };
    // ficha (GET /api/hazas/{id}) → { titulo, quien, filas: [{ k, v, de }], alerta }   (de = procedencia y fecha; textos ya hechos, sin HTML)
    function fichaFilas(f) {
      var filas = [], ot = "OlivarTrack · leído el " + fecha(f.datos_de);
      var quien = f.es_mia ? "Tu haza." : "Haza de otro hogar. Ves sus datos públicos; no quién es su titular.";
      if (!f.es_mia && typeof f.alias === "string" && f.alias) quien += " El hogar se muestra como «" + f.alias + "».";
      if (num(f.superficie_ha)) filas.push({ k: "Superficie", v: n1(f.superficie_ha, 2) + " ha", de: "medida sobre la linde que dibuja la oficina" });
      var ol = f.olivos || {};
      if (ol.lidar && num(ol.lidar.n)) filas.push({ k: "Olivos contados", v: n1(ol.lidar.n), de: "medido · " + (ol.lidar.fuente || "LiDAR") });
      if (ol.declarado) filas.push({ k: "Olivos declarados", v: num(ol.declarado.n) ? n1(ol.declarado.n) : "sin dato", de: "declarado" + (ol.declarado.fuente ? " · " + ol.declarado.fuente : "") });
      var nd = f.ndvi_relativo;
      filas.push(nd && num(nd.valor) ? { k: "Vigor (NDVI)", v: (nd.valor > 0 ? "+" : "") + n1(nd.valor, 2) + " frente al resto de la finca", de: "relativo, sin calibrar · " + (nd.fuente || "Sentinel-2") + " · " + fecha(nd.fecha) } : { k: "Vigor (NDVI)", v: "sin dato", de: "Sentinel-2" });
      var tr = ultimo(f.tratamientos);
      if (tr) {
        var comp = (Array.isArray(tr.componentes) ? tr.componentes : []).map(function (c) { return (TIPOS[c.tipo] || "otro") + (typeof c.producto === "string" ? ": " + c.producto : ""); });
        filas.push({ k: "Último tratamiento", v: fecha(tr.fecha) + (comp.length ? " · " + comp.join(", ") : "") + (num(tr.plazo_seguridad_dias) ? " · plazo de seguridad " + n1(tr.plazo_seguridad_dias) + " d" : ""), de: ot });
      } else filas.push({ k: "Último tratamiento", v: "ninguno registrado", de: ot });
      var fe = ultimo(f.fenologia);
      filas.push({ k: "Fenología", v: fe && num(fe.bbch) ? "BBCH " + fe.bbch + " · " + fecha(fe.fecha) : "sin dato", de: ot });
      var an = ultimo(f.analiticas);
      filas.push({ k: "Última analítica", v: an ? (ANALITICA[an.tipo] || "otra") + " · " + fecha(an.fecha) : "ninguna registrada", de: ot });
      var av = f.avance || {};
      filas.push({ k: "Recogido", v: num(av.pct) ? n1(av.pct) + " % (" + n1(av.parcelas_con_dato) + " de " + n1(av.parcelas) + " parcelas con aforo)" : "sin aforo con que comparar", de: "OlivarTrack, solo el porcentaje · " + fecha(av.fecha) });
      filas.push({ k: "Troncos y ramas", v: "los del dibujo", de: "ilustrativo: el LiDAR mide la copa, no los pies" });
      var avisos = (Array.isArray(f.avisos) ? f.avisos : []).map(function (a) { return AVISOS[a]; }).filter(Boolean);
      var alerta = f.completo === false || avisos.length ? "Ficha incompleta" + (avisos.length ? ": " + avisos.join("; ") : "") + ". No se sacan totales." : "";
      return { titulo: (typeof f.nombre === "string" ? f.nombre : "Haza") + (typeof f.codigo === "string" ? " · " + f.codigo : ""), quien: quien, filas: filas, alerta: alerta };
    }
    // ?api=<prefijo> (pruebas): solo una ruta relativa del mismo origen que acaba en «/»; si no, el del servidor cuando D.base es /teselas/…; si no, ninguno
    function prefijoApi(busqueda, base) {
      var m = /[?&]api=([^&#]*)/.exec(busqueda || "");
      if (m) { var p = decodeURIComponent(m[1]); return /^\/?[A-Za-z0-9_\-.][A-Za-z0-9_\-./]*\/$/.test(p) && p.indexOf("//") < 0 && p.indexOf("..") < 0 ? p : null; }
      return /^\/teselas\//.test(base || "") ? "/api/" : null;
    }
    return { validaColeccion: validaColeccion, aLocal: aLocal, anillosLocales: anillosLocales, enElMundo: enElMundo, dentroPoligono: dentroPoligono, hazaEn: hazaEn,
      cuentaVertices: cuentaVertices, segmentos: segmentos, rayoSuelo: rayoSuelo, fecha: fecha, fichaFilas: fichaFilas, prefijoApi: prefijoApi };
  })();
  // [puro:fin]

  var Hazas = (function () {
    var P = HazasPuro, API = P.prefijoApi(location.search, D.base), PASO = 2, ALTURA = 0.45;
    var st = { activo: false, n: 0, propias: 0, vertices: 0, error: null };
    var hz = [], linea = null, geo = null, mat = null, sucio = false, tSucio = 0, exagHecha = -1, pide = 0, cache = {};
    // colores «tal como se ven» (sRGB) pasados a lineal: la propia en ámbar, las ajenas en blanco roto (se distinguen también por luminancia)
    function lin(hex) { var c = new THREE.Color(); c.setHex(hex, SRGB); return [c.r, c.g, c.b]; }
    function trae(url) {
      return fetch(url, { credentials: "same-origin", headers: { accept: "application/geo+json, application/json" } }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
    }
    function monta(col) {
      var v = P.validaColeccion(col); if (v.error) { st.error = "no cumple el contrato: " + v.error; return; }
      var fid = D.finca_id, cx = D.centro_utm[0], cy = D.centro_utm[1], C_MIA = lin(0xffb020), C_OTRA = lin(0xe8ecf0);
      hz = v.hazas.filter(function (h) { return !fid || h.finca === fid; }).map(function (h) {
        var an = P.anillosLocales(h, cx, cy);
        return { id: h.id, codigo: h.codigo, nombre: h.nombre, es_mia: h.es_mia, anillos: an, color: h.es_mia ? C_MIA : C_OTRA,
          poligonosLoc: h.poligonos.map(function (pol) { return pol.map(function (r) { return r.map(function (q) { return P.aLocal(q, cx, cy); }); }); }) };
      }).filter(function (h) { return P.enElMundo(h.anillos, D.ext, 50); });
      st.n = hz.length; st.propias = hz.filter(function (h) { return h.es_mia; }).length;
      if (!hz.length) return;
      var s = P.segmentos(hz, suelo, exag, PASO, ALTURA);
      geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(s.pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(s.col, 3)); geo.computeBoundingSphere();
      mat = new THREE.LineBasicMaterial({ vertexColors: true });
      linea = new THREE.LineSegments(geo, mat); linea.name = "linde de las hazas"; gLinde.add(linea);   // la casilla «Linde» del menú la enciende y apaga
      st.vertices = s.n; st.activo = true; exagHecha = exag;
      Mundo.alCargar(function () { sucio = true; });   // llega relieve fino: se vuelven a pegar al suelo (en actualiza, sin prisa)
      engancha();
    }
    function repega() {
      var pa = geo.getAttribute("position"), ca = geo.getAttribute("color");
      P.segmentos(hz, suelo, exag, PASO, ALTURA, pa.array, ca.array); pa.needsUpdate = true; geo.computeBoundingSphere(); exagHecha = exag;
    }
    function actualiza(dt) {
      if (!st.activo) return;
      if (exag !== exagHecha) sucio = true;
      if (sucio) { tSucio += dt; if (tSucio > 0.5) { tSucio = 0; sucio = false; repega(); } }
    }
    // ---- la ficha (se usa el mismo recuadro #ficha que la del olivo; se escribe con textContent, nunca HTML de la red)
    var fichaDe = null;   // id de la haza cuya ficha está en el recuadro, o null si enseña otra cosa
    function pintaFicha(h, f, msg) {
      var cu = $("fichaDatos"); $("fichaTitulo").textContent = f ? P.fichaFilas(f).titulo : h.nombre + " · " + h.codigo; cu.textContent = "";
      var linea2 = function (k, v, de) {
        var dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v;
        if (de) { var s = document.createElement("small"); s.style.display = "block"; s.style.color = "var(--muted)"; s.textContent = de; dd.appendChild(s); }
        cu.appendChild(dt); cu.appendChild(dd);
      };
      if (!f) { linea2("Haza", h.es_mia ? "la tuya" : "de otro hogar", ""); linea2("Ficha", msg, ""); }
      else {
        var r = P.fichaFilas(f); linea2("Haza", r.quien, "linde dibujada por la oficina");
        r.filas.forEach(function (q) { linea2(q.k, q.v, q.de); }); if (r.alerta) linea2("Aviso", r.alerta, "");
      }
      $("ficha").hidden = false;
    }
    function abre(k) {
      var h = hz[k], yo = ++pide; fichaDe = h.id;
      var c = cache[h.id]; if (c && performance.now() - c.t < 60000) { pintaFicha(h, c.f); return; }
      pintaFicha(h, null, "leyendo…");
      trae(API + "hazas/" + encodeURIComponent(h.id)).then(function (f) {
        if (yo !== pide || !f || typeof f !== "object") return; cache[h.id] = { t: performance.now(), f: f }; pintaFicha(h, f);
      }).catch(function () { if (yo === pide) pintaFicha(h, null, "no se ha podido leer (sin sesión o sin conexión)"); });
    }
    function otraCosa() { pide++; fichaDe = null; }   // la ficha pasa a otra cosa (un olivo, cerrarla): una respuesta tardía ya no la pisa
    function sinHaza(msg) { otraCosa(); $("fichaTitulo").textContent = "Hazas"; var cu = $("fichaDatos"); cu.textContent = ""; var dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = "Aquí"; dd.textContent = msg; cu.appendChild(dt); cu.appendChild(dd); $("ficha").hidden = false; }
    // ---- tocar: un toque corto (< 6 px, un dedo) en la órbita que no ha elegido un olivo (09_camara decide antes) abre la haza bajo el dedo
    var dedos = {}, mov = 0, antes = { oculta: true, titulo: "" }, rayoH = null, ndc = null;
    function alturaEscena(x, z) { return suelo(x, -z) * exag; }
    function bajoDedo(cx2, cy2) {
      var r = lienzo.getBoundingClientRect(); ndc.set((cx2 - r.left) / r.width * 2 - 1, -(cy2 - r.top) / r.height * 2 + 1); rayoH.setFromCamera(ndc, camera);
      var o = rayoH.ray.origin, d = rayoH.ray.direction, q = P.rayoSuelo([o.x, o.y, o.z], [d.x, d.y, d.z], alturaEscena, camera.far);
      return q ? P.hazaEn(q[0], q[1], hz) : -1;
    }
    function engancha() {
      rayoH = new THREE.Raycaster(); ndc = new THREE.Vector2();
      lienzo.addEventListener("pointerdown", function (e) { dedos[e.pointerId] = { x: e.clientX, y: e.clientY }; if (Object.keys(dedos).length === 1) mov = 0; });
      lienzo.addEventListener("pointermove", function (e) { var p = dedos[e.pointerId]; if (!p) return; mov += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); p.x = e.clientX; p.y = e.clientY; });
      var suelta2 = function (e) {
        var uno = Object.keys(dedos).length === 1; delete dedos[e.pointerId];
        if (e.type !== "pointerup" || !uno || mov >= 6 || paseando || !st.activo) return;
        var olivo = !$("ficha").hidden && (fichaDe === null || antes.oculta || $("fichaTitulo").textContent !== antes.titulo);
        if (olivo) { otraCosa(); return; }   // 09_camara ha elegido un olivo con este toque (o enseña el suyo): manda el olivo
        var k = bajoDedo(e.clientX, e.clientY); if (k >= 0) abre(k); else if (fichaDe !== null) { otraCosa(); $("ficha").hidden = true; }
      };
      // en la fase de captura (antes que 09_camara): cómo estaba la ficha, para saber después si el toque ha elegido un olivo
      window.addEventListener("pointerup", function () { antes.oculta = $("ficha").hidden; antes.titulo = $("fichaTitulo").textContent; }, true);
      lienzo.addEventListener("pointerup", suelta2); lienzo.addEventListener("pointercancel", suelta2);
      $("cerrarFicha").addEventListener("click", otraCosa);
      // H (UX §5.2): la ficha de la haza en la que estás (en el paseo, donde andas; en la órbita, la del punto al que miras)
      window.addEventListener("keydown", function (e) {
        if (e.code !== "KeyH" || !st.activo || e.ctrlKey || e.metaKey || e.altKey) return; var t = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
        var x = paseando ? pp.x : objetivo.x, y = paseando ? pp.y : -objetivo.z, k = P.hazaEn(x, y, hz);
        if (k >= 0) abre(k); else sinHaza("No estás dentro de ninguna haza.");
      });
    }
    function libera() {
      if (linea) { gLinde.remove(linea); geo.dispose(); mat.dispose(); }
      linea = null; geo = null; mat = null; hz = []; st.activo = false; st.vertices = 0;
    }
    if (API) {
      var fq = typeof D.finca_id === "string" && /^[a-z0-9_-]{1,32}$/.test(D.finca_id) ? "&finca=" + D.finca_id : "";
      trae(API + "hazas?srs=25830" + fq).then(monta).catch(function (e) { st.error = String(e && e.message || e); });   // sin sesión, sin api o sin red: no se dibuja nada, y en silencio
    }
    function estado() { var e = { api: !!API }; Object.keys(st).forEach(function (k) { e[k] = st[k]; }); return e; }   // para ?debug y las pruebas
    return { actualiza: actualiza, estado: estado, libera: libera };
  })();
