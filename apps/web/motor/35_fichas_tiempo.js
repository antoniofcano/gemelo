// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: FichasTiempoPuro, FichasTiempo
// Consume: 01_datos (D, $), 02_mundo (Mundo), 03_escena (visor, renderer, scene, camera, sol, texColor, modo), 12_paseo (paseando),
//   14_historia (FINCA, marca, aviso), 15_tiempo (ahoraMs, calma, lluvia, nivel, rumbo, hace), 16_vida (mira), 29_vr (VRX, panel), 31_hud (Hud)
// Nota: Publica además window.__fichaTiempo (pruebas) y escucha el evento «gemelo:prevision-mundo». Lee TiempoVivo si el motor lo expone; si no, un respaldo simulado. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/fichas_tiempo.test.js.
// ===============================================================================
  // ---------- la previsión del tiempo como lámina en el mundo (doc/sistema/UX-FINCA-JUEGO.md §4.11): lo que en pantalla es la ventana Tiempo, en VR y en el
  // paseo es una lámina diegética: un cartel de 1,3 × 0,89 m anclado al mundo (no a la cabeza), a la altura de los ojos, que se vuelve despacio hacia quien
  // la mira. Dentro: «Ahora» (medido en la estación, que no está en la finca) y las próximas horas por bloques de 3 h y luego por días (modelado), con el
  // cielo dibujado a mano en el canvas (sin fuentes de emoji: sale igual en las Quest), la temperatura, la probabilidad y los mm de lluvia y el viento
  // con una flecha que apunta DE DÓNDE VIENE, orientada en el mundo: arriba en la lámina = hacia donde miras a través de ella.
  // Datos: TiempoVivo.lee() (el motor la expone cuando conecta /api/tiempo de Vigía); si no está o no trae nada, un respaldo sintético con la misma forma
  // y origen «simulado» (rotulado «no es el tiempo real»; ningún valor de la explotación). Nada de dentroDeUmbrales ni de tratamientos: la lámina no dice
  // si se puede tratar (regla 1 de Vigía).
  // Presupuesto (regla 6): una malla (una llamada de dibujo), una textura de 1024 × 704 sin mipmaps (2,9 MB); se crea al abrirla, se libera entera
  // (geometría, material, textura) al cerrarla, y el canvas solo se repinta si cambia lo que se ve (datos, minuto de «hace N min», hora del bloque o el
  // rumbo de la lámina en pasos de 15°). Se abre con «Ver previsión» en la pestaña Mundo del panel VR, con la tecla P paseando, o con el evento
  // «gemelo:prevision-mundo» (para que la ventana Tiempo pueda ofrecer un botón).
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/fichas_tiempo.test.js)
  var FichasTiempoPuro = (function () {
    var HUSO = "Europe/Madrid", W = 1024, H = 704, PW = 1.3;
    var fDia = new Intl.DateTimeFormat("sv-SE", { timeZone: HUSO }), fH = new Intl.DateTimeFormat("es-ES", { timeZone: HUSO, hour: "2-digit", hourCycle: "h23" });
    var fSem = new Intl.DateTimeFormat("es-ES", { timeZone: HUSO, weekday: "long" });
    function diaDe(ms) { return fDia.format(new Date(ms)); }
    function horaDe(ms) { return Number(fH.format(new Date(ms))) % 24; }
    function n(v, d) { if (v == null || !isFinite(v)) return "–"; var t = Number(v).toFixed(d || 0); if (/^-0(,0*)?$/.test(t.replace(".", ","))) t = t.slice(1); return t.replace(".", ","); }
    var RUMBOS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    function rumboTxt(g) { return RUMBOS[Math.round((((g % 360) + 360) % 360) / 45) % 8]; }
    function norm(g) { return ((g % 360) + 360) % 360; }

    // --- el cielo: siete claves, de la nubosidad, la lluvia, su probabilidad, la humedad y el viento (o de «cielo» si TiempoVivo ya la trae)
    var CIELOS = { despejado: "Despejado", intervalos: "Intervalos", nuboso: "Nuboso", cubierto: "Cubierto", llovizna: "Llovizna", lluvia: "Lluvia", niebla: "Niebla" };
    function cielo(h) {
      h = h || {};
      if (typeof h.cielo === "string" && CIELOS[h.cielo]) return h.cielo;
      var nub = Number(h.nubosidad) || 0, ll = Number(h.lluvia) || 0, pr = Number(h.probabilidadLluvia) || 0, hr = Number(h.humedadRelativa) || 0, v = h.viento == null ? 3 : Number(h.viento);
      if (ll >= 0.5 || (ll >= 0.2 && pr >= 60)) return "lluvia";
      if (ll > 0.05 || pr >= 50) return "llovizna";
      if (hr >= 97 && v < 1.5 && nub >= 80) return "niebla";
      return nub < 20 ? "despejado" : nub < 55 ? "intervalos" : nub < 85 ? "nuboso" : "cubierto";
    }
    // de noche (sin sol), luna en vez de sol; sin la función del motor, de 8 a 19 h es de día
    function esNoche(ms, opts) { if (opts && typeof opts.noche === "function") return !!opts.noche(ms); var h = horaDe(ms); return h < 8 || h >= 20; }

    // --- la flecha del viento: ángulo en la lámina (radianes, horario desde «arriba») de una flecha que apunta DE DÓNDE VIENE el viento (dir, grados
    // desde el norte real del gemelo, como lo da Vigía), con «arriba» = el rumbo hacia el que se mira a través de la lámina. El rumbo va en pasos de 15°.
    function cuantiza(g, paso) { paso = paso || 15; return norm(Math.round(norm(g) / paso) * paso); }
    function flechaAng(dir, rumboVista) { var a = norm(dir - cuantiza(rumboVista || 0)); if (a > 180) a -= 360; return a * Math.PI / 180; }

    // --- de las horas de la previsión a tarjetas: hoy, bloques de 3 h desde la hora en curso (como mucho 3); después, días enteros (≥ 12 horas)
    function agrega(hs) {
      var t = hs.map(function (x) { return Number(x.temperatura); }).filter(isFinite), sx = 0, sz = 0, vs = 0, nub = 0, hr = 0, ll = 0, pr = 0, ra = 0;
      hs.forEach(function (x) {
        var v = Math.max(0.1, Number(x.viento) || 0), d = (Number(x.direccion) || 0) * Math.PI / 180;
        sx += Math.sin(d) * v; sz += Math.cos(d) * v; vs += Number(x.viento) || 0; nub += Number(x.nubosidad) || 0; hr += Number(x.humedadRelativa) || 0;
        ll += Number(x.lluvia) || 0; pr = Math.max(pr, Number(x.probabilidadLluvia) || 0); ra = Math.max(ra, Number(x.racha) || 0);
      });
      var k = hs.length || 1;
      return { tmin: t.length ? Math.min.apply(null, t) : null, tmax: t.length ? Math.max.apply(null, t) : null, tmed: t.length ? t.reduce(function (a, b) { return a + b; }, 0) / t.length : null,
        viento: vs / k, racha: ra, direccion: norm(Math.atan2(sx, sz) * 180 / Math.PI), nubosidad: nub / k, humedadRelativa: hr / k, lluvia: ll, probabilidadLluvia: pr };
    }
    function tarjetas(horas, ahora, opts) {
      var max = (opts && opts.max) || 6, hs = (horas || []).map(function (x) { return { h: x, ms: Date.parse(x.instante) }; }).filter(function (x) { return isFinite(x.ms); }).sort(function (a, b) { return a.ms - b.ms; });
      var i0 = -1; for (var i = 0; i < hs.length; i++) { if (hs[i].ms <= ahora) i0 = i; else break; }
      if (i0 < 0) i0 = 0; hs = hs.slice(i0);
      if (!hs.length) return [];
      var hoy = diaDe(ahora), out = [], k = 0;
      while (k < hs.length && out.length < Math.min(3, max) && diaDe(hs[k].ms) === hoy) {
        var bl = []; while (bl.length < 3 && k < hs.length && diaDe(hs[k].ms) === hoy) bl.push(hs[k++]);
        var a = agrega(bl.map(function (x) { return x.h; })), h0 = horaDe(bl[0].ms), h1 = horaDe(bl[bl.length - 1].ms) + 1;
        a.tipo = "bloque"; a.etiqueta = h0 + "–" + (h1 === 24 ? 24 : h1) + " h"; a.ms = bl[0].ms; a.noche = esNoche(bl[Math.floor(bl.length / 2)].ms, opts);
        out.push(a);
      }
      var dias = [], por = {};
      hs.forEach(function (x) { var d = diaDe(x.ms); if (d === hoy) return; if (!por[d]) { por[d] = []; dias.push(d); } por[d].push(x); });
      var manana = diaDe(Date.parse(hoy + "T12:00:00Z") + 86400000);
      dias.forEach(function (d) {
        if (out.length >= max || por[d].length < 12) return;
        var diurnas = por[d].filter(function (x) { var h = horaDe(x.ms); return h >= 8 && h < 20; });
        var a = agrega(por[d].map(function (x) { return x.h; })), c = agrega((diurnas.length ? diurnas : por[d]).map(function (x) { return x.h; }));
        a.nubosidad = c.nubosidad; a.humedadRelativa = c.humedadRelativa; a.viento = c.viento; a.direccion = c.direccion;   // el cielo y el viento del día, los de las horas de luz
        var s = fSem.format(new Date(por[d][0].ms));
        a.tipo = "dia"; a.etiqueta = d === manana ? "Mañana" : s.charAt(0).toUpperCase() + s.slice(1); a.ms = por[d][0].ms; a.noche = false;
        out.push(a);
      });
      out.forEach(function (a) { a.cielo = cielo(a); a.naturaleza = "modelado"; });
      return out;
    }

    // --- cuánto hace: «hace 25 min», «hace 3 h», «hace 2 días» (de frescura.generadoEn o, si no, horasDeAntiguedad)
    function haceTxt(fr, ahora) {
      if (!fr) return ""; var h = fr.generadoEn ? (ahora - Date.parse(fr.generadoEn)) / 3600000 : Number(fr.horasDeAntiguedad);
      if (!isFinite(h)) return ""; if (h < 0) h = 0;
      return h < 1 ? "hace " + Math.max(1, Math.round(h * 60)) + " min" : h < 48 ? "hace " + Math.round(h) + " h" : "hace " + Math.round(h / 24) + " días";
    }
    var ORIGEN = { vigia: { txt: "Vigía", fondo: "#1d5f6b" }, fixture: { txt: "datos de prueba", fondo: "#4a5560" }, simulado: { txt: "SIMULADO · no es el tiempo real", fondo: "#8a5a12" } };
    function origenDe(o) { return ORIGEN[o] ? o : "simulado"; }
    // fuera: lo que suene a tratamiento (dentroDeUmbrales, «se puede tratar»): la lámina no lo cuenta
    function avisosLimpios(av) { return (av || []).map(String).filter(function (t) { return t && !/umbral|trata(r|miento)|atomizador|pulveriz/i.test(t); }); }

    // --- la hora en curso de la previsión (para el viento y el cielo de «Ahora»: el anemómetro de la estación está descartado por Vigía)
    function horaEnCurso(horas, ahora) {
      var hs = (horas || []).filter(function (x) { return isFinite(Date.parse(x.instante)); }).sort(function (a, b) { return Date.parse(a.instante) - Date.parse(b.instante); }), r = null;
      for (var i = 0; i < hs.length; i++) { if (Date.parse(hs[i].instante) <= ahora) r = hs[i]; else break; }
      return r || hs[0] || null;
    }
    function ahoraDe(d, ahora, opts) {
      var o = origenDe(d.origen), a = d.actual, hc = horaEnCurso(d.horas, ahora), sim = o === "simulado";
      var r = { medido: !!a, temp: a ? a.temperatura : hc ? hc.temperatura : null, hr: a ? a.humedadRelativa : hc ? hc.humedadRelativa : null, lluvia: a ? a.lluvia : hc ? hc.lluvia : null,
        viento: hc ? hc.viento : a ? a.viento : null, direccion: hc ? hc.direccion : a ? a.direccion : null, vientoDe: hc ? "previsión" : "estación", noche: esNoche(ahora, opts) };
      r.cielo = a && typeof a.cielo === "string" && CIELOS[a.cielo] ? a.cielo : cielo(hc || a || {});
      var est = a && a.estacion, km = est && est.distanciaKm != null && isFinite(est.distanciaKm) ? n(est.distanciaKm, 1) : null;
      r.etiqueta = sim ? "simulado" : a ? "medido" : "modelado";
      r.donde = sim ? "estación simulada" : a ? (km ? "estación a " + km + " km" : "estación de Vigía") : "sin lectura de la estación";
      r.cuando = haceTxt(d.frescura, ahora);
      return r;
    }

    // --- la maqueta: qué va dónde en el canvas (1024 × 704 px sobre 1,3 m: 788 px por metro). Todo lo que se pinta sale de aquí; la firma decide si se repinta.
    var FUENTE_MIN = 24;
    function maqueta(d, opts) {
      opts = opts || {}; d = d || {};
      var ahora = opts.ahora != null ? opts.ahora : Date.now(), rv = cuantiza(opts.rumboVista || 0), o = origenDe(d.origen), sim = o === "simulado";
      var ah = ahoraDe(d, ahora, opts), ts = tarjetas(d.horas, ahora, opts), cards = [];
      ah.flecha = ah.viento != null && ah.direccion != null ? flechaAng(ah.direccion, rv) : null;
      ts.forEach(function (t, i) {
        var col = i % 3, fil = Math.floor(i / 3);
        cards.push({ x: 376 + col * 212, y: 116 + fil * 238, w: 200, h: 226, etiqueta: t.etiqueta, tipo: t.tipo, cielo: t.cielo, noche: t.noche,
          temp: t.tipo === "dia" ? n(t.tmin) + " / " + n(t.tmax) + "°" : n(t.tmed) + "°",
          lluvia: t.lluvia >= 0.05 ? n(t.probabilidadLluvia) + " % · " + n(t.lluvia, 1) + " mm" : t.probabilidadLluvia >= 10 ? n(t.probabilidadLluvia) + " % · 0 mm" : "sin lluvia",
          viento: t.viento < 0.3 ? "calma" : rumboTxt(t.direccion) + " " + n(t.viento) + " m/s", flecha: t.viento < 0.3 ? null : flechaAng(t.direccion, rv) });
      });
      var fr = d.frescura || {}, av = avisosLimpios(d.avisos);
      var pie = sim ? ["Tiempo simulado para probar la lámina:", "no viene de Vigía ni es el tiempo de la finca."] :
        [ah.medido ? "Medido: " + ah.donde + " (fuera de la finca)" + (ah.cuando ? ", " + ah.cuando : "") + "." : "Sin lectura de la estación.",
          "Modelado: previsión por finca, rejilla de ~5 km" + (haceTxt(fr, ahora) ? ", " + haceTxt(fr, ahora) : "") + "."];
      pie.push("Flecha: de dónde viene el viento · arriba = hacia donde miras", av.length ? "Aviso: " + av[0] : "");
      var m = { W: W, H: H, PW: PW, PH: PW * H / W, origen: o, origenTxt: ORIGEN[o].txt, origenFondo: ORIGEN[o].fondo, rumbo: rv, titulo: "El tiempo en la finca",
        subAhora: "Ahora · " + ah.etiqueta, subPrev: sim ? "Próximas horas y días · simulado" : "Próximas horas y días · modelado",
        ahora: Object.assign({ x: 24, y: 116, w: 336, h: 464 }, ah, { tempTxt: n(ah.temp) + "°", hrTxt: "Humedad " + n(ah.hr) + " %", lluviaTxt: "Lluvia " + n(ah.lluvia, 1) + " mm",
          vientoTxt: ah.viento == null ? "viento –" : ah.viento < 0.3 ? "calma" : rumboTxt(ah.direccion) + " · " + n(ah.viento) + " m/s", cieloTxt: CIELOS[ah.cielo] }),
        tarjetas: cards, pie: pie, avisos: av };
      m.firma = JSON.stringify([o, rv, m.ahora.tempTxt, m.ahora.hrTxt, m.ahora.lluviaTxt, m.ahora.vientoTxt, m.ahora.cielo, m.ahora.noche, m.ahora.flecha, m.ahora.donde, m.ahora.cuando,
        cards.map(function (c) { return [c.etiqueta, c.cielo, c.noche, c.temp, c.lluvia, c.viento, c.flecha]; }), pie]);
      return m;
    }
    // el resumen grande del panel VR (pestaña Mundo): icono, temperatura, cielo, viento y lluvia de las próximas 3 h, y su etiqueta
    function resumen(d, opts) {
      opts = opts || {}; d = d || {};
      var ahora = opts.ahora != null ? opts.ahora : Date.now(), ah = ahoraDe(d, ahora, opts), t = tarjetas(d.horas, ahora, { max: 1, noche: opts.noche })[0], rv = cuantiza(opts.rumboVista || 0);
      var r = { origen: origenDe(d.origen), cielo: ah.cielo, noche: ah.noche, temp: n(ah.temp) + " °C", cieloTxt: CIELOS[ah.cielo],
        viento: (ah.viento == null ? "Viento –" : ah.viento < 0.3 ? "Viento en calma" : "Viento del " + rumboTxt(ah.direccion) + " · " + n(ah.viento) + " m/s") + (ah.vientoDe === "previsión" ? " (previsión)" : ""),
        flecha: ah.viento != null && ah.viento >= 0.3 ? flechaAng(ah.direccion, rv) : null,
        lluvia: t ? "Próximas 3 h: " + (t.lluvia >= 0.05 ? n(t.probabilidadLluvia) + " % · " + n(t.lluvia, 1) + " mm" : "sin lluvia") : "Sin previsión",
        etiqueta: ah.etiqueta + " · " + ah.donde + (ah.cuando ? " · " + ah.cuando : "") };
      r.firma = JSON.stringify([r.origen, r.cielo, r.noche, r.temp, r.viento, r.flecha, r.lluvia, r.etiqueta]);
      return r;
    }

    // --- respaldo sintético (origen «simulado»): la forma de TiempoVivo.lee() con valores inventados que no son de ninguna finca
    function respaldo(ahora) {
      var h0 = Math.floor(ahora / 3600000) * 3600000, horas = [];
      for (var i = 0; i < 72; i++) {
        var ms = h0 + i * 3600000, hl = horaDe(ms), dia = Math.floor(i / 24), f = Math.sin((hl - 9) / 24 * 2 * Math.PI);
        var ll = dia === 1 && hl >= 14 && hl <= 18 ? 0.4 + 0.3 * (hl % 2) : 0, nub = Math.max(0, Math.min(100, 30 + 25 * Math.sin(i / 9) + (ll ? 50 : 0)));
        horas.push({ instante: new Date(ms).toISOString(), temperatura: Math.round((15 + 7 * f - dia) * 10) / 10, humedadRelativa: Math.round(60 - 20 * f + (ll ? 25 : 0)),
          viento: Math.round((2.5 + 1.5 * Math.sin(i / 7)) * 10) / 10, racha: Math.round((4.5 + 2 * Math.sin(i / 7)) * 10) / 10, direccion: Math.round(norm(250 + 40 * Math.sin(i / 11))),
          nubosidad: Math.round(nub), lluvia: ll, probabilidadLluvia: ll ? 70 : dia === 1 && hl >= 11 && hl < 20 ? 30 : 5, naturaleza: "modelado" });
      }
      var a = horas[0];
      return { origen: "simulado", actual: { temperatura: a.temperatura, humedadRelativa: a.humedadRelativa, viento: a.viento, racha: a.racha, direccion: a.direccion, lluvia: 0, cielo: null,
        estacion: { id: "simulada", distanciaKm: null }, naturaleza: "medido" }, horas: horas, frescura: { generadoEn: new Date(h0).toISOString(), horasDeAntiguedad: (ahora - h0) / 3600000 },
        avisos: ["Tiempo simulado: este visor no tiene lectura de Vigía."] };
    }

    // --- el dibujo (solo la API 2D del canvas: rectángulos, arcos, líneas y texto; ningún carácter de emoji)
    function rr(cx, x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
    function disco(cx, x, y, r, c) { cx.fillStyle = c; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); }
    function dibSol(cx, x, y, r) {
      cx.strokeStyle = "#ffc94a"; cx.lineWidth = Math.max(2, r * 0.2); cx.lineCap = "round";
      for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; cx.beginPath(); cx.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); cx.lineTo(x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 1.7); cx.stroke(); }
      disco(cx, x, y, r, "#ffc94a");
    }
    function luna(cx, x, y, r, fondo) { disco(cx, x, y, r, "#ece6c4"); disco(cx, x + r * 0.45, y - r * 0.3, r * 0.82, fondo); }
    function dibNube(cx, x, y, w, c) {   // centro (x, y) de la base; w de ancho
      cx.fillStyle = c; rr(cx, x - w * 0.46, y - w * 0.16, w * 0.92, w * 0.3, w * 0.15); cx.fill();
      disco(cx, x - w * 0.18, y - w * 0.16, w * 0.2, c); disco(cx, x + w * 0.08, y - w * 0.22, w * 0.27, c); disco(cx, x + w * 0.3, y - w * 0.08, w * 0.16, c);
    }
    function gotas(cx, x, y, w, nG, largo) {
      cx.strokeStyle = "#7fc8ff"; cx.lineWidth = Math.max(2, w * 0.05); cx.lineCap = "round";
      for (var k = 0; k < nG; k++) { var gx = x - w * 0.32 + k * (w * 0.64 / Math.max(1, nG - 1)); cx.beginPath(); cx.moveTo(gx, y); cx.lineTo(gx - largo * 0.35, y + largo); cx.stroke(); }
    }
    // el icono del cielo, centrado en (x, y) y de s px de lado; fondo = color sobre el que va (para recortar la luna)
    function icono(cx, clave, noche, x, y, s, fondo) {
      fondo = fondo || "#1b232a"; cx.save();
      var astro = function (ax, ay, r) { if (noche) luna(cx, ax, ay, r, fondo); else dibSol(cx, ax, ay, r); };
      if (clave === "despejado") astro(x, y, s * 0.24);
      else if (clave === "intervalos") { astro(x - s * 0.16, y - s * 0.14, s * 0.17); dibNube(cx, x + s * 0.06, y + s * 0.2, s * 0.72, "#e6edf2"); }
      else if (clave === "nuboso") { dibNube(cx, x + s * 0.12, y + s * 0.02, s * 0.6, "#8f9ca6"); dibNube(cx, x - s * 0.04, y + s * 0.22, s * 0.8, "#dbe3e9"); }
      else if (clave === "cubierto") { dibNube(cx, x + s * 0.12, y + s * 0.02, s * 0.62, "#6f7c86"); dibNube(cx, x - s * 0.04, y + s * 0.22, s * 0.84, "#a9b5be"); }
      else if (clave === "llovizna") { dibNube(cx, x, y + s * 0.04, s * 0.8, "#b3bfc8"); gotas(cx, x, y + s * 0.2, s * 0.7, 3, s * 0.14); }
      else if (clave === "lluvia") { dibNube(cx, x, y + s * 0.02, s * 0.84, "#7f8c96"); gotas(cx, x, y + s * 0.18, s * 0.8, 5, s * 0.26); }
      else if (clave === "niebla") {
        dibNube(cx, x, y - s * 0.04, s * 0.62, "#a9b5be"); cx.strokeStyle = "#c9d5dc"; cx.lineWidth = Math.max(2, s * 0.06); cx.lineCap = "round";
        for (var k = 0; k < 3; k++) { cx.beginPath(); cx.moveTo(x - s * 0.4 + k * s * 0.06, y + s * 0.16 + k * s * 0.12); cx.lineTo(x + s * 0.4 - k * s * 0.04, y + s * 0.16 + k * s * 0.12); cx.stroke(); }
      }
      cx.restore();
    }
    // la flecha del viento en (x, y), radio r, ángulo ang (de flechaAng); sin ang, un círculo de calma. Con norte (el rumbo de la vista), una marca N en el aro.
    function flecha(cx, x, y, r, ang, rumboVista) {
      cx.save(); cx.strokeStyle = "#6f808c"; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.stroke();
      if (rumboVista != null) { var an = -rumboVista * Math.PI / 180; disco(cx, x + Math.sin(an) * r, y - Math.cos(an) * r, Math.max(3, r * 0.16), "#e9eef2"); }
      if (ang == null) { disco(cx, x, y, Math.max(3, r * 0.22), "#9fb1bd"); cx.restore(); return; }
      var sx = Math.sin(ang), sy = -Math.cos(ang), px = x + sx * r * 0.88, py = y + sy * r * 0.88;
      cx.strokeStyle = "#7fe3ff"; cx.fillStyle = "#7fe3ff"; cx.lineWidth = Math.max(3, r * 0.16); cx.lineCap = "round";
      cx.beginPath(); cx.moveTo(x - sx * r * 0.7, y - sy * r * 0.7); cx.lineTo(x + sx * r * 0.35, y + sy * r * 0.35); cx.stroke();
      cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px - sx * r * 0.62 - sy * r * 0.42, py - sy * r * 0.62 + sx * r * 0.42); cx.lineTo(px - sx * r * 0.62 + sy * r * 0.42, py - sy * r * 0.62 - sx * r * 0.42); cx.closePath(); cx.fill();
      cx.restore();
    }
    function ajusta(cx, t, ancho) { t = String(t); if (cx.measureText(t).width <= ancho) return t; while (t.length > 2 && cx.measureText(t + "…").width > ancho) t = t.slice(0, -1); return t + "…"; }
    function texto(cx, t, x, y, fuente, color, alin, ancho) { cx.font = fuente; cx.fillStyle = color; cx.textAlign = alin || "left"; cx.textBaseline = "middle"; cx.fillText(ancho ? ajusta(cx, t, ancho) : t, x, y); }
    var SANS = "system-ui, sans-serif", FONDO = "#0e1216", TARJ = "#1b232a";
    function dibuja(cx, m) {
      cx.clearRect(0, 0, m.W, m.H);
      cx.fillStyle = FONDO; rr(cx, 0, 0, m.W, m.H, 28); cx.fill();
      texto(cx, m.titulo, 32, 40, "bold 40px " + SANS, "#ffffff", "left", 420);
      cx.font = "bold 26px " + SANS; var bw = Math.min(540, cx.measureText(m.origenTxt).width + 36);
      cx.fillStyle = m.origenFondo; rr(cx, m.W - 24 - bw, 18, bw, 46, 23); cx.fill(); texto(cx, m.origenTxt, m.W - 24 - bw / 2, 42, "bold 26px " + SANS, "#ffffff", "center", bw - 24);
      texto(cx, m.subAhora, 32, 94, "bold 26px " + SANS, m.ahora.etiqueta === "medido" ? "#8fe3a8" : "#ffd28a", "left", 330);
      texto(cx, m.subPrev, 384, 94, "bold 26px " + SANS, m.origen === "simulado" ? "#ffd28a" : "#9fd3ff", "left", 616);
      var a = m.ahora;   // «Ahora»
      cx.fillStyle = TARJ; rr(cx, a.x, a.y, a.w, a.h, 20); cx.fill();
      icono(cx, a.cielo, a.noche, a.x + 88, a.y + 84, 128, TARJ);
      texto(cx, a.tempTxt, a.x + 252, a.y + 84, "bold 84px " + SANS, "#ffffff", "center", 160);
      texto(cx, a.cieloTxt, a.x + a.w / 2, a.y + 172, "30px " + SANS, "#dbe6ec", "center", a.w - 32);
      texto(cx, a.hrTxt, a.x + 24, a.y + 222, "28px " + SANS, "#c9d5dc", "left", a.w - 48);
      texto(cx, a.lluviaTxt, a.x + 24, a.y + 262, "28px " + SANS, "#c9d5dc", "left", a.w - 48);
      flecha(cx, a.x + 52, a.y + 318, 28, a.flecha, m.rumbo);
      texto(cx, a.vientoTxt, a.x + 96, a.y + 318, "bold 30px " + SANS, "#ffffff", "left", a.w - 112);
      texto(cx, "de la " + a.vientoDe, a.x + 96, a.y + 352, "24px " + SANS, "#9fb1bd", "left", a.w - 112);
      texto(cx, a.donde, a.x + 24, a.y + 404, "26px " + SANS, "#c9d5dc", "left", a.w - 48);
      texto(cx, a.cuando, a.x + 24, a.y + 438, "26px " + SANS, "#9fb1bd", "left", a.w - 48);
      if (!m.tarjetas.length) texto(cx, "Sin previsión", 384 + 300, 340, "30px " + SANS, "#c9d5dc", "center", 600);
      m.tarjetas.forEach(function (c) {
        cx.fillStyle = TARJ; rr(cx, c.x, c.y, c.w, c.h, 18); cx.fill();
        var mx = c.x + c.w / 2;
        texto(cx, c.etiqueta, mx, c.y + 28, "bold 30px " + SANS, "#ffffff", "center", c.w - 16);
        icono(cx, c.cielo, c.noche, mx, c.y + 82, 76, TARJ);
        texto(cx, c.temp, mx, c.y + 140, "bold " + (c.tipo === "dia" ? 36 : 40) + "px " + SANS, "#ffffff", "center", c.w - 16);
        texto(cx, c.lluvia, mx, c.y + 174, "24px " + SANS, c.lluvia === "sin lluvia" ? "#9fb1bd" : "#9fd3ff", "center", c.w - 12);
        flecha(cx, c.x + 30, c.y + 204, 15, c.flecha, null);
        texto(cx, c.viento, c.x + 54, c.y + 204, "24px " + SANS, "#dbe6ec", "left", c.w - 62);
      });
      m.pie.forEach(function (t, i) { if (t) texto(cx, t, 32, 600 + i * 28, "24px " + SANS, /^Aviso/.test(t) ? "#ffd28a" : "#9fb1bd", "left", m.W - 64); });
    }
    return { W: W, H: H, PW: PW, FUENTE_MIN: FUENTE_MIN, CIELOS: CIELOS, cielo: cielo, cuantiza: cuantiza, flechaAng: flechaAng, tarjetas: tarjetas, haceTxt: haceTxt,
      avisosLimpios: avisosLimpios, maqueta: maqueta, resumen: resumen, respaldo: respaldo, dibuja: dibuja, icono: icono, flecha: flecha, rumboTxt: rumboTxt };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/fichas_tiempo.test.js con un THREE de mentira, para contar lo que crea y lo que libera)
  var FichasTiempo = (function () {
    var P = FichasTiempoPuro, L = null, cuenta = { pintadas: 0, abiertas: 0, cerradas: 0 }, vC = new THREE.Vector3(), vD = new THREE.Vector3();
    var LEJOS = { vr: 40, pantalla: 60 };   // si la cabeza se aleja más (te teletransportas, vuelas), la lámina se cierra y se libera
    function datos() {
      try { if (typeof TiempoVivo !== "undefined" && TiempoVivo && TiempoVivo.lee) { var d = TiempoVivo.lee(); if (d && (d.actual || (d.horas && d.horas.length))) return d; } } catch (e) {}
      return P.respaldo(ahoraMs());
    }
    function deNoche(ms) { try { return nivel(ms).d < 0.2; } catch (e) { return false; } }
    function cabeza(v) { if (VRX.on) return v.copy(VRX.cab); camera.updateMatrixWorld(); return v.setFromMatrixPosition(camera.matrixWorld); }
    function rumboDe(m) { return ((-m.rotation.y * 180 / Math.PI) % 360 + 360) % 360; }   // hacia dónde mira quien la ve de frente (0 = norte, 90 = este)
    // se vuelve hacia la cabeza solo si se ha desviado más de 8°, a lo sumo a 60°/s y amortiguado: un cartel que se gira despacio, nunca la vista
    function gira() {
      if (!L) return;
      var f = renderer.info.render.frame; if (f === L.fr) return; L.fr = f;   // una vez por fotograma (en VR se dibuja un ojo y luego el otro)
      var t = performance.now(), dt = Math.min(0.1, (t - L.t) / 1000); L.t = t;
      var h = cabeza(vC), m = L.m, obj = Math.atan2(h.x - m.position.x, h.z - m.position.z), d = obj - m.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 0.14) L.girando = true; else if (Math.abs(d) < 0.02) L.girando = false;
      if (!L.girando) return;
      var paso = d * Math.min(1, dt * 2.5), tope = 1.05 * dt; paso = Math.max(-tope, Math.min(tope, paso));
      m.rotation.y += paso; m.updateMatrixWorld();
    }
    function pinta(forzar) {
      if (!L) return false;
      var m = P.maqueta(datos(), { ahora: ahoraMs(), rumboVista: rumboDe(L.m), noche: deNoche });
      if (!forzar && m.firma === L.firma) return false;
      P.dibuja(L.cx, m); L.tex.needsUpdate = true; L.firma = m.firma; L.origen = m.origen; cuenta.pintadas++;
      return true;
    }
    function abre(forma) {
      var modoL = forma === "vr" || (forma !== "pantalla" && VRX.on) ? "vr" : "pantalla";
      if (L) cierra();
      var cv = document.createElement("canvas"); cv.width = P.W; cv.height = P.H;
      var tex = texColor(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      var geo = new THREE.PlaneGeometry(P.PW, P.PW * P.H / P.W), mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, fog: false, toneMapped: false });
      var m = new THREE.Mesh(geo, mat); m.name = "fichaTiempo"; m.renderOrder = 10;
      var h = cabeza(vC), g = camera.getWorldDirection(vD); g.y = 0; if (g.lengthSq() < 1e-6) g.set(0, 0, -1); g.normalize();
      var dist = modoL === "vr" ? 1.4 : 2.4;   // a la altura de los ojos y delante de la mirada; luego se queda ahí
      m.position.set(h.x + g.x * dist, h.y - (modoL === "vr" ? 0.05 : 0.1), h.z + g.z * dist);
      m.rotation.set(0, Math.atan2(h.x - m.position.x, h.z - m.position.z), 0); m.updateMatrixWorld();
      m.onBeforeRender = gira;
      scene.add(m);
      L = { cv: cv, cx: cv.getContext("2d"), tex: tex, geo: geo, mat: mat, m: m, modo: modoL, firma: "", fr: -1, t: performance.now(), girando: false, tRev: 0, origen: "" };
      cuenta.abiertas++; pinta(true);
      return true;
    }
    function cierra() {
      if (!L) return false;
      scene.remove(L.m); L.m.onBeforeRender = function () {};
      L.geo.dispose(); L.mat.dispose(); L.tex.dispose(); L.cv.width = L.cv.height = 0;   // regla del repo: todo recurso de GPU se libera
      L = null; cuenta.cerradas++; return true;
    }
    // dos veces por segundo con la lámina abierta: ¿sigue cerca? ¿cambió lo que se ve? (repintar solo entonces: subir la textura cuesta)
    function revisa() {
      if (!L) return;
      if (L.modo === "vr" && !VRX.on) { cierra(); return; }
      var h = cabeza(vC), d = Math.hypot(h.x - L.m.position.x, h.z - L.m.position.z);
      if (d > LEJOS[L.modo]) { cierra(); return; }
      pinta(false);
    }
    function alterna(forma) { return L ? (cierra(), false) : abre(forma); }
    function resumen() {
      return { abierta: !!L, modo: L ? L.modo : "", origen: L ? L.origen : "", pintadas: cuenta.pintadas, abiertas: cuenta.abiertas, cerradas: cuenta.cerradas,
        pos: L ? [L.m.position.x, L.m.position.y, L.m.position.z] : null, rumbo: L ? P.cuantiza(rumboDe(L.m)) : null, tam: [P.W, P.H, P.PW, P.PW * P.H / P.W] };
    }
    // para el panel VR (29_vr.js): el resumen grande del tiempo, con la flecha según el rumbo dado
    function panelResumen(rumboVista) { return P.resumen(datos(), { ahora: ahoraMs(), rumboVista: rumboVista || 0, noche: deNoche }); }
    setInterval(revisa, 500);
    setTimeout(function () {   // tras montar todos los módulos: si el motor expone TiempoVivo, cada cambio de datos repinta (si está abierta)
      try { if (typeof TiempoVivo !== "undefined" && TiempoVivo && TiempoVivo.alCambiar) TiempoVivo.alCambiar(function () { if (L) pinta(false); }); } catch (e) {}
    }, 0);
    // en pantalla: P la abre o la cierra paseando (con el foco en el mundo, sin Ctrl/Alt/Cmd); en vista aérea, un aviso (a cientos de metros no se lee)
    window.addEventListener("keydown", function (e) {
      if (VRX.on || e.code !== "KeyP" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      var el = e.target, tg = el && el.tagName; if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA" || (el && el.isContentEditable)) return;
      e.preventDefault();
      if (!paseando && !L) { try { Hud.aviso("La previsión en el mundo sale paseando (Intro). En vista aérea, la ventana Tiempo (3).", 4000); } catch (e2) {} return; }
      alterna("pantalla");
    });
    // el gancho para la ventana Tiempo (o quien sea): document.dispatchEvent(new CustomEvent("gemelo:prevision-mundo", { detail: { abre: true|false } }))
    document.addEventListener("gemelo:prevision-mundo", function (e) {
      var q = e && e.detail && e.detail.abre;
      if (q === true) abre(VRX.on ? "vr" : "pantalla"); else if (q === false) cierra(); else alterna(VRX.on ? "vr" : "pantalla");
    });
    window.__fichaTiempo = function (accion) { if (accion === "abre") abre(); else if (accion === "cierra") cierra(); return resumen(); };   // pruebas
    return { abre: abre, cierra: cierra, alterna: alterna, abierta: function () { return !!L; }, resumen: resumen, panelResumen: panelResumen, revisa: revisa };
  })();
  // [motor:fin]
