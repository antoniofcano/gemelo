// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (Mundo, suelo, cIn), 02c_componentes (Componentes), 03_escena (lienzo, scene, camera, texColor, exag),
//   08_marcadores (gLinde), 12_paseo (primera, entraPaseo), 13_parcelas (parcelas), 13b_hazas (Hazas), 14_historia (hist, lista, aviso),
//   15_tiempo (hace, lindes), 16_vida (mira), 23_estacion (EST, bbchEn, hoyMadrid), 29_vr (VRX, ficha)
// Nota: Componente «carteles-haza» (EV2-A6, ADR-0023; ADR-0014): como mucho 3 carteles de haza sobre la linde (los más cercanos, con histéresis) y un tablón en la entrada, con un pool de 3+1 mallas y lienzos de 512 × 320; solo nombre y datos medidos de la lista blanca de la ficha, cada uno con su procedencia; ?carteles=0 lo apaga; el trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/carteles.test.js.
// ===============================================================================
  // ---------- EV2-A6: carteles de haza en la linde y tablón en la entrada (ADR-0014, decisiones 12, 188 y 202; doc/sistema/COMPONENTES.md).
  // Sobre la linde de las hazas que tienes cerca cuelga un cartel con el NOMBRE de la haza (y el alias del hogar si lo deja ver) y solo lo que decidió Antonio (2026-11-05, club privado
  // «La Linde»): superficie y olivos contados con LiDAR (medido), la fenología del momento y, SOLO en recolección (octubre a enero, [SUPUESTO]), el % recogido (los dos de OlivarTrack,
  // con la procedencia que trae la ficha). Lo demás de la ficha (tratamientos, NDVI, olivos declarados, kilos, personas) no se pinta aunque la api lo mande: lo que no está en
  // CartelesPuro.contenido no sale. El tablón de la entrada: «Club La Linde», el nombre de la finca, hazas y olivos contados de toda la finca (medido) y la época del olivar hoy
  // (23_estacion.js: deducido si el calendario se ajusta con lo observado, ilustrativo si es el típico). La línea «Hoy en el olivar» (EV-3c) es el trabajo de la semana agregado por tipo, o el aviso principal del campo, que da /api/mundo/hoy por el evento «mundo:hoy» (53_mundo_hoy.js; esta pieza no pide nada), con su procedencia y «leído hace N h»; sin datos, no se pinta. En el lienzo solo caben dos pares dato + procedencia: prioridad hazas y olivos, hoy, época (la época, ilustrativa o deducida, cede ante un dato de hoy).
  //   · Como mucho MAX = 3 carteles a la vista (más el tablón): los de las hazas más cercanas (distancia a su linde), con histéresis (la que ya está se queda hasta que otra
  //     le gana por más del 20 %) y dentro de RADIO = 30 m (36 m los que ya estaban; más lejos, ni con 5,5 de escala llegaría a 1,5° por línea). Los carteles son un pool de 3 mallas y 3 lienzos de 512 × 320 creados UNA vez; al cambiar de haza se repinta el lienzo
  //     (solo si cambia su firma), nada se crea ni se libera. Al apagar el componente o quedarse sin hazas, se libera todo (geometría, materiales, texturas).
  //   · Mundo, no cabeza: cada cartel está en el punto de la linde más cercano a quien lo eligió, a ~1 m del suelo, y se vuelve hacia quien mira (solo el giro vertical). Crece
  //     con la distancia (escala = 0,14 × m, entre 1 y 5,5) para que cada línea no baje de 1,5° (topes de EV2-A0 en 02d_laminas.js; cifras propias, sin verificar en un casco).
  //   · Sin api de hazas (sin servidor, 401 o sin hazas en este mundo) no se crea nada y no se ve nada. ?carteles=0 (o el bloque «componentes» de la configuración del
  //     servidor) lo apaga; la casilla «Linde» del menú los esconde con las lindes.
  //   · Honestidad (regla 5): el cartel dice MEDIDO y su fuente; la linde es un límite de gestión dibujado por la oficina, no un deslinde, y el cartel lo dice en el pie.
  // Presupuesto (regla 6): 4 llamadas (3 carteles + el tablón), 8 triángulos, 4 texturas de 512 × 320 sin mipmaps (2,5 MB: 0,63 MB cada una). Material básico (multiview: sin GLSL propio).
  // Sin reloj propio: la fase «tarde» cada 0,5 s escoge y repinta; la fase «mundo» solo gira los carteles hacia quien mira.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/carteles.test.js)
  var CartelesPuro = (function () {
    var MAX = 3, RADIO = 30, HIST = 0.2, W = 512, H = 320, ANCHO_M = 2.4, ALTO_M = ANCHO_M * H / W, LEJOS_TABLON = 36, PAD = 14, COEF = 0.14, ESC_MAX = 5.5, LLAMADAS = MAX + 1;
    // px del lienzo: letra e interlineado de cada clase; todos los interlineados ≥ 44 px (a 4,7 mm/px y escala 1: 0,21 m)
    var LETRA = { titulo: 44, alias: 32, dato: 34, fuente: 30 }, LINEA = { titulo: 52, alias: 44, dato: 46, fuente: 44 };
    function num(v) { return typeof v === "number" && isFinite(v) && v >= 0; }
    function txt(s, max) { return typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""; }
    function n1(v, d) { return Number(v).toLocaleString("es-ES", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
    // el punto de una linde (anillos [[x, y]…]…, locales) más cercano a (x, y): { d, x, y }
    function masCerca(anillos, x, y) {
      var mej = { d: Infinity, x: 0, y: 0 };
      for (var r = 0; r < anillos.length; r++) {
        var an = anillos[r];
        for (var i = 0; i + 1 < an.length; i++) {
          var ax = an[i][0], ay = an[i][1], bx = an[i + 1][0], by = an[i + 1][1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
          var t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
          if (d < mej.d) { mej.d = d; mej.x = px; mej.y = py; }
        }
      }
      return mej;
    }
    function caja(anillos) {
      var c = [Infinity, Infinity, -Infinity, -Infinity];
      anillos.forEach(function (an) { an.forEach(function (q) { if (q[0] < c[0]) c[0] = q[0]; if (q[1] < c[1]) c[1] = q[1]; if (q[0] > c[2]) c[2] = q[0]; if (q[1] > c[3]) c[3] = q[1]; }); });
      return c;
    }
    function lejosDeCaja(c, x, y, r) { return x < c[0] - r || x > c[2] + r || y < c[1] - r || y > c[3] + r; }
    // quién se ve: cand = [{ id, d }] (d = m a su linde), actuales = [id | null] × MAX (lo que hay puesto en cada cartel). Devuelve la lista nueva de MAX ids o null: el que
    // ya estaba conserva su cartel (no salta de uno a otro) y cuenta con un 20 % de ventaja; el radio de los que ya estaban también se ensancha un 20 %.
    function escoge(cand, actuales) {
      var ya = {}, i;
      actuales.forEach(function (id) { if (id !== null && id !== undefined) ya[id] = true; });
      var v = cand.filter(function (c) { return num(c.d) && c.d <= RADIO * (ya[c.id] ? 1 + HIST : 1); })
        .map(function (c) { return { id: c.id, e: ya[c.id] ? c.d / (1 + HIST) : c.d }; });
      v.sort(function (a, b) { return a.e - b.e || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
      var top = v.slice(0, MAX), quedan = {}, out = [];
      top.forEach(function (c) { quedan[c.id] = true; });
      for (i = 0; i < MAX; i++) { var a = actuales[i]; if (a !== null && a !== undefined && quedan[a]) { out.push(a); delete quedan[a]; } else out.push(null); }
      var nuevos = top.filter(function (c) { return quedan[c.id]; });
      for (i = 0; i < MAX && nuevos.length; i++) if (out[i] === null) out[i] = nuevos.shift().id;
      return out;
    }
    // m de lado del cartel según la distancia (m): cada línea (≥ 44 px a 4,69 mm/px) ocupa ≥ 1,5° mientras escala ≥ 0,127 × dist; con 0,14 queda margen
    function escala(dist) { return Math.max(1, Math.min(ESC_MAX, COEF * dist)); }
    // ---- fechas y fenología (decisión de Antonio, 2026-11-05: la cartelería de «La Linde» lleva la fenología del momento y, solo en recolección, el % recogido)
    var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    function dia(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof s === "string" ? s : ""); return m ? Number(m[3]) + "-" + MESES[Number(m[2]) - 1] + "-" + m[1] : ""; }
    function ultimo(hs) { var u = null; (Array.isArray(hs) ? hs : []).forEach(function (e) { if (e && typeof e.fecha === "string" && num(e.bbch) && e.bbch <= 99 && (!u || e.fecha > u.fecha)) u = e; }); return u; }
    // BBCH del olivo → palabra de campo (escala BBCH: 51-59 botón floral, 60-69 floración, 70-79 fruto, 80-89 maduración); es lo que la ficha dice, solo traducido
    function fenologia(b) { return b < 10 ? "Reposo" : b < 50 ? "Brotación" : b < 60 ? "Botón floral" : b < 70 ? "En flor" : b < 80 ? "Cuajado" : b < 85 ? "Envero" : "Maduración"; }
    // [SUPUESTO] la campaña de recolección va de octubre a enero (calendario típico del olivar de Jaén); el cartel enseña el % recogido solo entonces. hoy = «AAAA-MM-DD»
    function recoleccion(hoy) { var m = /^\d{4}-(\d{2})-/.exec(typeof hoy === "string" ? hoy : ""); var n = m ? Number(m[1]) : 0; return n >= 10 || n === 1; }
    // ---- el contenido: SOLO la lista blanca (campo a campo). h = { nombre, es_mia }; f = la ficha pública de la api (o null); ctx = { hoy } (para saber si hay recolección).
    // → { titulo, alias, es_mia, datos: [{ txt, de }] } (de = su procedencia, siempre). Hay lugar para dos pares dato + procedencia en el lienzo: lo medido va junto en una línea
    // y lo de OlivarTrack (fenología y, solo en recolección, % recogido) en otra, con la procedencia que trae la ficha (datos_de). NO llevan fecha de tratamiento, NDVI ni olivos declarados.
    function contenido(h, f, ctx) {
      var o = { titulo: txt(h && h.nombre, 60) || "Haza", alias: "", es_mia: !!(h && h.es_mia), datos: [] };
      if (!f || typeof f !== "object") return o;
      if (!o.es_mia && typeof f.alias === "string" && txt(f.alias, 20)) o.alias = "Hogar visible como «" + txt(f.alias, 20) + "»";
      var area = num(f.superficie_ha) ? n1(f.superficie_ha, 2) + " ha" : "", ol = f.olivos && f.olivos.lidar, oli = ol && num(ol.n) && ol.naturaleza === "medido" ? n1(ol.n) + " olivos" : "";
      var fu = oli ? txt(ol.fuente, 40) || "LiDAR" : "";
      if (area && oli) o.datos.push({ txt: area + " · " + oli, de: "medido · linde y " + fu });
      else if (area) o.datos.push({ txt: "Superficie: " + area, de: "medida sobre la linde de la oficina" });
      else if (oli) o.datos.push({ txt: "Olivos contados: " + n1(ol.n), de: "medido · " + fu });
      var fe = ultimo(f.fenologia), av = ctx && recoleccion(ctx.hoy) ? f.avance : null, porc = av && num(av.pct) && av.pct <= 100 ? av.pct : null, partes = [];   // fuera de recolección ni se mira el avance
      if (fe) partes.push(fenologia(fe.bbch));
      if (porc !== null) partes.push(n1(porc) + " % recogido");
      if (partes.length) o.datos.push({ txt: partes.join(" · "), de: "OlivarTrack · leído " + (dia(f.datos_de) || dia(fe && fe.fecha) || "sin fecha") });
      return o;
    }
    function firma(c) { return JSON.stringify([c.titulo, c.alias, c.es_mia, c.datos.map(function (d) { return d.txt + "|" + d.de; })]); }
    // el nombre de la finca (el título de las gafas si lo hay; si no, el id con mayúscula)
    function nombreFinca(tituloVr, fincaId) {
      var t = txt(tituloVr, 40); if (t) return t;
      var s = txt(String(fincaId || "").replace(/[_-]+/g, " "), 40); return s ? s.charAt(0).toUpperCase() + s.slice(1) : "La finca";
    }
    // la época del olivar: estación del año (por el mes) y fase del ciclo (por el BBCH que da 23_estacion.js: calendario típico de Jaén, ajustado con lo observado si hay)
    function epoca(hoy, bbch, origen) {
      var m = /^\d{4}-(\d{2})-/.exec(typeof hoy === "string" ? hoy : ""); if (!m || !num(bbch)) return null;
      var n = Number(m[1]), est = n === 12 || n <= 2 ? "Invierno" : n <= 5 ? "Primavera" : n <= 8 ? "Verano" : "Otoño", b = Math.round(bbch);
      var fase = b < 10 ? "reposo del olivo" : b < 50 ? "crecen los brotes" : b < 60 ? "se forman las flores" : b < 70 ? "en plena floración" : b < 80 ? "cuaja y crece el fruto" : b < 83 ? "empieza el envero" : b < 85 ? "envero" : "maduración del fruto";
      var aj = /ajustado/.test(String(origen || ""));
      return { txt: est + ": " + fase, de: aj ? "deducido · calendario ajustado" : "ilustrativo · calendario típico" };
    }
    // el tablón de la entrada. ctx = { hazas, olivos, hoy, bbch, origen }: nº de hazas con linde y olivos contados con LiDAR de toda la finca (medidos; sin dato fiable no se pone) y la época de hoy.
    // «Hoy en el olivar» (EV-3c): ctx.campo = { txt, de, cuando } (la línea que emite 53_mundo_hoy.js: trabajo de la semana agregado, o el aviso principal) y ctx.ahora (ms). Con datos
    // válidos pasa por delante de la época (solo caben dos pares); sin ellos, hoy queda vacío y no se pinta.
    function haceHoy(iso, ahora) {
      var t = typeof iso === "string" ? Date.parse(iso) : NaN; if (!isFinite(t) || !num(ahora)) return "";
      var m = Math.max(1, Math.round((ahora - t) / 60000));
      return m < 90 ? "hace " + m + " min" : m < 36 * 60 ? "hace " + Math.round(m / 60) + " h" : "hace " + Math.round(m / 1440) + " días";
    }
    function lineaHoy(c, ahora) {
      if (!c || typeof c !== "object") return null;
      var t = txt(c.txt, 40), de = txt(c.de, 20); if (!t || !de) return null;
      var h = haceHoy(c.cuando, ahora);
      return { txt: t, de: de + " · " + (h ? "leído " + h : "sin fecha") };
    }
    function tablon(nombre, ctx) {
      var t = { titulo: "Club La Linde", alias: nombre, es_mia: false, tablon: true, datos: [], hoy: [] };   // hoy: entradas { txt, de } de «Hoy en el olivar»; vacío = no se muestra
      ctx = ctx || {};
      var nh = ctx.hazas > 0 ? Math.floor(ctx.hazas) : 0, no = ctx.olivos > 0 ? Math.floor(ctx.olivos) : 0;
      if (nh && no) t.datos.push({ txt: n1(nh) + (nh === 1 ? " haza" : " hazas") + " · " + n1(no) + " olivos", de: "medido · LiDAR 2024 y lindes" });
      else if (no) t.datos.push({ txt: n1(no) + " olivos contados", de: "medido · LiDAR 2024" });
      else if (nh) t.datos.push({ txt: n1(nh) + (nh === 1 ? " haza" : " hazas"), de: "lindes de la oficina" });
      var lh = lineaHoy(ctx.campo, ctx.ahora); if (lh) { t.hoy.push(lh); t.datos.push(lh); }
      var ep = epoca(ctx.hoy, ctx.bbch, ctx.origen); if (ep) t.datos.push(ep);
      t.datos = t.datos.slice(0, 2);   // el lienzo de 512 × 320 da para título, finca y dos pares; esto fija la prioridad
      return t;
    }
    // corta un texto en líneas de ancho px (medir(texto, px, negrita) → px), a lo sumo max (la última con «…»)
    function envuelve(texto, ancho, medir, px, negrita, max) {
      var pal = String(texto == null ? "" : texto).split(/\s+/).filter(Boolean), out = [], l = "";
      for (var i = 0; i < pal.length; i++) {
        var t = l ? l + " " + pal[i] : pal[i];
        if (l && medir(t, px, negrita) > ancho) { out.push(l); l = pal[i]; } else l = t;
      }
      if (l) out.push(l);
      if (out.length > max) { out = out.slice(0, max); var u = out[max - 1]; while (u.length > 1 && medir(u + "…", px, negrita) > ancho) u = u.slice(0, -1); out[max - 1] = u + "…"; }
      return out;
    }
    // la maqueta del lienzo: { w, h, bloques: [{ clase, texto, x, y, px, negrita }], interlineados: { clase: px } }. Los datos entran por pares (valor + procedencia): si no cabe
    // el par entero, no entra ni uno. El pie «linde de gestión, no deslinde» va solo en carteles de haza y solo si cabe.
    function maqueta(c, medir) {
      var ancho = W - 2 * PAD - 8, y = PAD, bl = [], lin = {};
      function ponLinea(clase, texto, negrita) { bl.push({ clase: clase, texto: texto, x: PAD + 8, y: y, px: LETRA[clase], negrita: !!negrita }); y += LINEA[clase]; lin[clase] = LINEA[clase]; }
      var tit = envuelve(c.titulo, ancho, medir, LETRA.titulo, true, c.datos.length ? 2 : 3);
      tit.forEach(function (l) { ponLinea("titulo", l, true); });
      if (c.alias) { var al = envuelve(c.alias, ancho, medir, LETRA.alias, false, 1); if (y + LINEA.alias + PAD <= H) ponLinea("alias", al[0], false); }
      c.datos.forEach(function (d) {
        var v = envuelve(d.txt, ancho, medir, LETRA.dato, true, 1), f = envuelve(d.de, ancho, medir, LETRA.fuente, false, 1);
        if (y + LINEA.dato + LINEA.fuente + PAD <= H) { ponLinea("dato", v[0], true); ponLinea("fuente", f[0], false); }
      });
      if (!c.tablon && y + LINEA.fuente + PAD <= H) ponLinea("fuente", envuelve("linde de gestión, no deslinde", ancho, medir, LETRA.fuente, false, 1)[0], false);
      return { w: W, h: H, bloques: bl, interlineados: lin, usado: y + PAD };
    }
    // la colocación: el punto de la linde (px, py locales), la altura del suelo g (escena) y la escala s → { x, y, z } del centro del cartel en la escena (z = −norte);
    // el borde de abajo queda 0,9 m sobre el suelo
    function coloca(px, py, g, s) { return { x: px, y: g + 0.9 + ALTO_M * s / 2, z: -py }; }
    // el tablón en la entrada [SUPUESTO: la entrada es donde empieza el paseo, el centro de la primera parcela (12_paseo.js: entraPaseo); sin parcelas, el centro de la finca]:
    // 5 m al este y 4 m al norte del centro, delante de quien aparece. → [x este, y norte] locales
    function entrada(pcs, ext) {
      var p = pcs && pcs[0] && pcs[0].centro;
      if (p && num(Math.abs(p[0])) && num(Math.abs(p[1]))) return [p[0] + 5, p[1] - 6 + 4 + 0];
      return ext ? [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2] : [0, 0];
    }
    // el giro (rad) de un cartel en (px, pz) para que su cara (+z) mire a la cabeza en (cx, cz)
    function mirando(cx, cz, px, pz) { return Math.atan2(cx - px, cz - pz); }
    return { MAX: MAX, RADIO: RADIO, HIST: HIST, W: W, H: H, ANCHO_M: ANCHO_M, ALTO_M: ALTO_M, LEJOS_TABLON: LEJOS_TABLON, LLAMADAS: LLAMADAS, LETRA: LETRA, LINEA: LINEA,
      masCerca: masCerca, caja: caja, lejosDeCaja: lejosDeCaja, escoge: escoge, escala: escala, contenido: contenido, firma: firma, nombreFinca: nombreFinca, tablon: tablon, lineaHoy: lineaHoy, epoca: epoca, fenologia: fenologia, recoleccion: recoleccion,
      envuelve: envuelve, maqueta: maqueta, coloca: coloca, entrada: entrada, mirando: mirando };
  })();
  // [puro:fin]
  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/carteles.test.js con un THREE, un Hazas y un lienzo de mentira)
  function CartelesMotor(n) {
    var P = CartelesPuro, vivo = true, grupo = null, geo = null, slots = [], tab = null, lins = [], campo = null, vC = new THREE.Vector3();
    var st = { carteles: 0, tablon: false, pintadas: 0, llamadas: 0, hazas: 0 };
    function cabeza() { if (VRX.on) return vC.copy(VRX.cab); camera.updateMatrixWorld(); return vC.setFromMatrixPosition(camera.matrixWorld); }
    function crea(nombre) {   // una malla con su lienzo: se crea UNA vez
      var cv = document.createElement("canvas"); cv.width = P.W; cv.height = P.H;
      var tex = texColor(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      var mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false });
      var m = new THREE.Mesh(geo, mat); m.name = nombre; m.renderOrder = 9; m.visible = false; m.raycast = function () {};   // la haza se escoge por el suelo (13b_hazas.js), no por el cartel
      grupo.add(m);
      return { mesh: m, mat: mat, tex: tex, cv: cv, cx: cv.getContext("2d"), id: null, firma: "", p: null, g: 0, s: 1 };
    }
    function monta() {
      if (grupo) return;
      grupo = new THREE.Group(); grupo.name = "carteles de haza"; geo = new THREE.PlaneGeometry(P.ANCHO_M, P.ALTO_M);
      for (var i = 0; i < P.MAX; i++) slots.push(crea("cartel " + (i + 1)));
      tab = crea("tablón de la entrada"); grupo.add; scene.add(grupo);
      st.llamadas = P.MAX + 1;
    }
    function liberaTodo() {
      if (!grupo) return;
      scene.remove(grupo);
      slots.concat(tab ? [tab] : []).forEach(function (s) { s.mesh.visible = false; s.mat.dispose(); s.tex.dispose(); s.cv.width = s.cv.height = 1; });
      if (geo) geo.dispose();
      grupo = null; geo = null; slots = []; tab = null; st.carteles = 0; st.tablon = false; st.llamadas = 0;
    }
    function medir(cx) { return function (t, px, neg) { cx.font = (neg ? "bold " : "") + px + "px system-ui, sans-serif"; return cx.measureText(t).width; }; }
    function pinta(s, c) {
      var cx = s.cx, m = P.maqueta(c, medir(cx)), ambar = c.es_mia;
      cx.clearRect(0, 0, P.W, P.H);
      cx.fillStyle = "#14201a"; cx.fillRect(0, 0, P.W, P.H);
      cx.fillStyle = ambar ? "#ffb020" : "#dfe6e0"; cx.fillRect(0, 0, 8, P.H);   // el borde: ámbar la tuya, blanco roto las demás (como las lindes)
      cx.textBaseline = "top"; cx.textAlign = "left";
      var col = { titulo: "#f4f1e6", alias: "#b9c8bd", dato: "#e9eef2", fuente: "#9db0a3" };
      m.bloques.forEach(function (b) { cx.font = (b.negrita ? "bold " : "") + b.px + "px system-ui, sans-serif"; cx.fillStyle = col[b.clase]; cx.fillText(b.texto, b.x, b.y); });
      s.tex.needsUpdate = true; st.pintadas++;
    }
    function repinta(s, c) { var f = P.firma(c); if (f === s.firma) return; s.firma = f; pinta(s, c); }
    function suelo3(x, y) { return suelo(x, y) * exag; }
    // el tablón: se coloca una vez en la entrada y se repinta solo si cambia su firma (la época cambia con los días, no por fotograma)
    function pintaTablon() {
      var hoy = hoyMadrid();
      repinta(tab, P.tablon(P.nombreFinca(D.titulo_vr, D.finca_id), { hazas: lins.length, olivos: cIn.length, hoy: hoy, bbch: bbchEn(hoy), origen: EST.origen, campo: campo, ahora: Date.now() }));
    }
    function ponTablon() {
      var q = P.entrada(D.parcelas, D.ext);
      tab.p = q; tab.g = suelo3(q[0], q[1]);
      pintaTablon(); st.tablon = true;
    }
    function rehaz() {   // las lindes se copian UNA vez al cambiar las hazas (no cada 0,5 s)
      lins = Hazas.lindes().map(function (l) { return { id: l.id, anillos: l.anillos, caja: P.caja(l.anillos) }; });
      st.hazas = lins.length;
      if (lins.length) { monta(); ponTablon(); } else { liberaTodo(); }
    }
    var gx = 0;
    function tarde() {
      if (!grupo) return;
      var h = cabeza(), x = h.x, y = -h.z, cand = [], i, ctx = { hoy: hoyMadrid() };
      grupo.visible = gLinde.visible;
      lins.forEach(function (l) {
        if (P.lejosDeCaja(l.caja, x, y, P.RADIO * (1 + P.HIST))) return;
        var q = P.masCerca(l.anillos, x, y); if (q.d <= P.RADIO * (1 + P.HIST)) cand.push({ id: l.id, d: q.d, q: q });
      });
      var nuevo = P.escoge(cand, slots.map(function (s) { return s.id; })), cuenta = 0;
      for (i = 0; i < slots.length; i++) {
        var s = slots[i], id = nuevo[i];
        if (id !== s.id) { s.id = id; s.firma = ""; s.p = null; }
        if (id === null || id === undefined) { s.mesh.visible = false; continue; }
        var d = Hazas.datos(id); if (!d) { s.id = null; s.mesh.visible = false; continue; }
        if (!s.p) { for (var k = 0; k < cand.length; k++) if (cand[k].id === id) s.p = [cand[k].q.x, cand[k].q.y]; if (!s.p) { s.mesh.visible = false; continue; } }
        s.g = suelo3(s.p[0], s.p[1]);
        repinta(s, P.contenido(d, d.ficha, ctx)); s.mesh.visible = true; cuenta++;
      }
      st.carteles = cuenta;
      if (tab && tab.p) { pintaTablon(); tab.g = suelo3(tab.p[0], tab.p[1]); tab.mesh.visible = Math.hypot(tab.p[0] - x, tab.p[1] - y) <= P.LEJOS_TABLON; }
    }
    function mundo() {
      if (!grupo || !grupo.visible) return;
      var h = cabeza();
      for (var i = 0; i <= slots.length; i++) {
        var s = i < slots.length ? slots[i] : tab;
        if (!s || !s.mesh.visible || !s.p) continue;
        var d = Math.hypot(s.p[0] - h.x, -s.p[1] - h.z), e = P.escala(d), c = P.coloca(s.p[0], s.p[1], s.g, e);
        s.mesh.position.set(c.x, c.y, c.z); s.mesh.scale.setScalar(e); s.mesh.rotation.y = P.mirando(h.x, h.z, c.x, c.z);
      }
    }
    n.on("hazas:cambia", function () { if (vivo) rehaz(); });
    n.on("mundo:hoy", function (d) { campo = d && d.linea && typeof d.linea === "object" ? d.linea : null; });   // lo repinta la fase «tarde» (solo si cambia la firma)
    if (Hazas.lindes().length) rehaz();
    window.__carteles = function () { return { carteles: st.carteles, tablon: st.tablon, pintadas: st.pintadas, llamadas: st.llamadas, hazas: st.hazas, ids: slots.map(function (s) { return s.id; }) }; };
    n.limpia(function () { try { delete window.__carteles; } catch (e) { window.__carteles = undefined; } });
    function libera() { vivo = false; liberaTodo(); }
    return { tarde: tarde, mundo: mundo, libera: libera, estado: function () { return st; } };
  }
  // [motor:fin]
  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?carteles=0 lo apaga; ?carteles=1 lo enciende.
  Componentes.registra({
    id: "carteles-haza", version: 1,
    consume: ["Hazas", "VRX", "gLinde", "cIn", "EST", "bbchEn", "hoyMadrid"],
    expone: [],
    eventos: { escucha: ["hazas:cambia", "mundo:hoy"], emite: [] },
    bandera: { defecto: true, url: "carteles" },
    // 3 carteles + el tablón: 4 mallas de un plano (4 llamadas, 8 triángulos; en VR sin multiview, una por ojo) y 4 texturas de 512 × 320 sin mipmaps (2,5 MB: 0,63 MB cada una)
    presupuesto: { llamadas: 4, triangulos: 8, texturasMB: 2.5 },
    fases: { mundo: 0, tarde: 0.5 },
    monta: function (n) { return CartelesMotor(n); },
    actualiza: { mundo: function (dt, t, api) { api.mundo(); }, tarde: function (dt, t, api) { api.tarde(); } },
    libera: function (api) { if (api) api.libera(); }
  });
