// La previsión del tiempo como lámina en el mundo (doc/sistema/UX-FINCA-JUEGO.md §4.11; MU5-n, A3-7b1: antes apps/web/motor/35_fichas_tiempo.js, que queda como talón): lo que en pantalla
// es la ventana Tiempo, en VR y en el paseo es una lámina diegética. Es del EXTERIOR: es la previsión del tiempo de la finca (Vigía, por TiempoVivo), con el viento orientado en el
// mundo del exterior. Componente «fichas-tiempo» de los mundos ["exterior"], con un libera() que cierra la lámina (geometría, material y textura, por Laminas); la tecla P, la fila del
// panel VR, la tapa, el aviso de la ventana Tiempo, la suscripción a TiempoVivo y window.__fichaTiempo los suelta el contexto del componente (n.limpia / n.on), como siempre.
// Código movido tal cual (solo se tipan parámetros y variables); lo que el legado reescribe o se monta antes entra por argumento («paseando», por getter).

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
  // rumbo de la lámina en pasos de 15°). Desde C8 la malla, la textura, la colocación, el giro, el cierre por distancia y el liberado son del servicio
  // Laminas (02d_laminas.js); este fichero solo dice qué se pinta y cuándo ha cambiado (la firma). Se abre con «Ver previsión» en la pestaña Mundo del panel VR, con la tecla P paseando, o con el evento
  // «prevision:alterna» del Bus (el botón de la ventana Tiempo).
  // Es el primer COMPONENTE del motor (ADR-0023, C3): se registra con Componentes.registra (al final del fichero) y usa los puntos de extensión (Teclas,
  // PanelVR.filas, PanelVR.tapa, Bus, Laminas); nadie lo nombra. Quitar este fichero del motor (genera_motor.mjs --sin) o apagarlo (?fichas=0) no rompe nada: el
  // botón de la ventana Tiempo se esconde (nadie escucha «prevision:alterna») y la pestaña Mundo del panel VR se queda sin su fila.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import { haceMinutos } from "../../nucleo/hace.ts";
import type { T } from "../comun/tipos.ts";

export const ID_FICHAS_TIEMPO = "fichas-tiempo";

/** Lo que el talón de 35 le da: THREE, las láminas (02d), las teclas (02c), el HUD (31), VRX y PanelVR (29), la cámara (03) y, de 15, el tiempo vivo, ahoraMs y nivel; por getter, «paseando» (12_paseo lo reescribe) */
export interface DepsFichasTiempo {
  THREE: T; Laminas: T; Teclas: T; Hud: T; VRX: T; PanelVR: T; camera: T; TiempoVivo: T; ahoraMs: () => number; nivel: (ms: number) => T; readonly paseando: boolean;
}


  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/fichas_tiempo.test.js)
export var FichasTiempoPuro: T = (function () {
    var HUSO = "Europe/Madrid", W = 1024, H = 704, PW = 1.3;
    var fDia = new Intl.DateTimeFormat("sv-SE", { timeZone: HUSO }), fH = new Intl.DateTimeFormat("es-ES", { timeZone: HUSO, hour: "2-digit", hourCycle: "h23" });
    var fSem = new Intl.DateTimeFormat("es-ES", { timeZone: HUSO, weekday: "long" });
    function diaDe(ms?: T) { return fDia.format(new Date(ms)); }
    function horaDe(ms?: T) { return Number(fH.format(new Date(ms))) % 24; }
    function n(v?: T, d?: T) { if (v == null || !isFinite(v)) return "–"; var t = Number(v).toFixed(d || 0); if (/^-0(,0*)?$/.test(t.replace(".", ","))) t = t.slice(1); return t.replace(".", ","); }
    var RUMBOS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    function rumboTxt(g?: T) { return RUMBOS[Math.round((((g % 360) + 360) % 360) / 45) % 8]; }
    function norm(g?: T) { return ((g % 360) + 360) % 360; }

    // --- el cielo: siete claves, de la nubosidad, la lluvia, su probabilidad, la humedad y el viento (o de «cielo» si TiempoVivo ya la trae)
    var CIELOS: T = { despejado: "Despejado", intervalos: "Intervalos", nuboso: "Nuboso", cubierto: "Cubierto", llovizna: "Llovizna", lluvia: "Lluvia", niebla: "Niebla" };
    function cielo(h?: T) {
      h = h || {};
      if (typeof h.cielo === "string" && CIELOS[h.cielo]) return h.cielo;
      var nub = Number(h.nubosidad) || 0, ll = Number(h.lluvia) || 0, pr = Number(h.probabilidadLluvia) || 0, hr = Number(h.humedadRelativa) || 0, v = h.viento == null ? 3 : Number(h.viento);
      if (ll >= 0.5 || (ll >= 0.2 && pr >= 60)) return "lluvia";
      if (ll > 0.05 || pr >= 50) return "llovizna";
      if (hr >= 97 && v < 1.5 && nub >= 80) return "niebla";
      return nub < 20 ? "despejado" : nub < 55 ? "intervalos" : nub < 85 ? "nuboso" : "cubierto";
    }
    // de noche (sin sol), luna en vez de sol; sin la función del motor, de 8 a 19 h es de día
    function esNoche(ms?: T, opts?: T) { if (opts && typeof opts.noche === "function") return !!opts.noche(ms); var h = horaDe(ms); return h < 8 || h >= 20; }

    // --- la flecha del viento: ángulo en la lámina (radianes, horario desde «arriba») de una flecha que apunta DE DÓNDE VIENE el viento (dir, grados
    // desde el norte real del gemelo, como lo da Vigía), con «arriba» = el rumbo hacia el que se mira a través de la lámina. El rumbo va en pasos de 15°.
    function cuantiza(g?: T, paso?: T) { paso = paso || 15; return norm(Math.round(norm(g) / paso) * paso); }
    function flechaAng(dir?: T, rumboVista?: T) { var a = norm(dir - cuantiza(rumboVista || 0)); if (a > 180) a -= 360; return a * Math.PI / 180; }

    // --- de las horas de la previsión a tarjetas: hoy, bloques de 3 h desde la hora en curso (como mucho 3); después, días enteros (≥ 12 horas)
    function agrega(hs?: T) {
      var t = hs.map(function (x?: T) { return Number(x.temperatura); }).filter(isFinite), sx = 0, sz = 0, vs = 0, nub = 0, hr = 0, ll = 0, pr = 0, ra = 0;
      hs.forEach(function (x?: T) {
        var v = Math.max(0.1, Number(x.viento) || 0), d = (Number(x.direccion) || 0) * Math.PI / 180;
        sx += Math.sin(d) * v; sz += Math.cos(d) * v; vs += Number(x.viento) || 0; nub += Number(x.nubosidad) || 0; hr += Number(x.humedadRelativa) || 0;
        ll += Number(x.lluvia) || 0; pr = Math.max(pr, Number(x.probabilidadLluvia) || 0); ra = Math.max(ra, Number(x.racha) || 0);
      });
      var k = hs.length || 1;
      return { tmin: t.length ? Math.min.apply(null, t) : null, tmax: t.length ? Math.max.apply(null, t) : null, tmed: t.length ? t.reduce(function (a?: T, b?: T) { return a + b; }, 0) / t.length : null,
        viento: vs / k, racha: ra, direccion: norm(Math.atan2(sx, sz) * 180 / Math.PI), nubosidad: nub / k, humedadRelativa: hr / k, lluvia: ll, probabilidadLluvia: pr };
    }
    function tarjetas(horas?: T, ahora?: T, opts?: T) {
      var max = (opts && opts.max) || 6, hs = (horas || []).map(function (x?: T) { return { h: x, ms: Date.parse(x.instante) }; }).filter(function (x?: T) { return isFinite(x.ms); }).sort(function (a?: T, b?: T) { return a.ms - b.ms; });
      var i0 = -1; for (var i = 0; i < hs.length; i++) { if (hs[i].ms <= ahora) i0 = i; else break; }
      if (i0 < 0) i0 = 0; hs = hs.slice(i0);
      if (!hs.length) return [];
      var hoy = diaDe(ahora), out: T = [], k = 0;
      while (k < hs.length && out.length < Math.min(3, max) && diaDe(hs[k].ms) === hoy) {
        var bl: T = []; while (bl.length < 3 && k < hs.length && diaDe(hs[k].ms) === hoy) bl.push(hs[k++]);
        var a: T = agrega(bl.map(function (x?: T) { return x.h; })), h0 = horaDe(bl[0].ms), h1 = horaDe(bl[bl.length - 1].ms) + 1;
        a.tipo = "bloque"; a.etiqueta = h0 + "–" + (h1 === 24 ? 24 : h1) + " h"; a.ms = bl[0].ms; a.noche = esNoche(bl[Math.floor(bl.length / 2)].ms, opts);
        out.push(a);
      }
      var dias: T = [], por: T = {};
      hs.forEach(function (x?: T) { var d = diaDe(x.ms); if (d === hoy) return; if (!por[d]) { por[d] = []; dias.push(d); } por[d].push(x); });
      var manana = diaDe(Date.parse(hoy + "T12:00:00Z") + 86400000);
      dias.forEach(function (d?: T) {
        if (out.length >= max || por[d].length < 12) return;
        var diurnas = por[d].filter(function (x?: T) { var h = horaDe(x.ms); return h >= 8 && h < 20; });
        var a: T = agrega(por[d].map(function (x?: T) { return x.h; })), c = agrega((diurnas.length ? diurnas : por[d]).map(function (x?: T) { return x.h; }));
        a.nubosidad = c.nubosidad; a.humedadRelativa = c.humedadRelativa; a.viento = c.viento; a.direccion = c.direccion;   // el cielo y el viento del día, los de las horas de luz
        var s = fSem.format(new Date(por[d][0].ms));
        a.tipo = "dia"; a.etiqueta = d === manana ? "Mañana" : s.charAt(0).toUpperCase() + s.slice(1); a.ms = por[d][0].ms; a.noche = false;
        out.push(a);
      });
      out.forEach(function (a?: T) { a.cielo = cielo(a); a.naturaleza = "modelado"; });
      return out;
    }

    // --- cuánto hace: «hace 25 min», «hace 3 h», «hace 2 días» (de frescura.generadoEn o, si no, horasDeAntiguedad)
    function haceTxt(fr?: T, ahora?: T) {
      if (!fr) return ""; var h = fr.generadoEn ? (ahora - Date.parse(fr.generadoEn)) / 3600000 : Number(fr.horasDeAntiguedad);
      return haceMinutos(Math.max(0, h) * 60);   // L3-22: la regla única (nucleo/hace.ts): antes, horas hasta 48 h
    }
    var ORIGEN: T = { vigia: { txt: "Vigía", fondo: "#1d5f6b" }, fixture: { txt: "datos de prueba", fondo: "#4a5560" }, simulado: { txt: "SIMULADO · no es el tiempo real", fondo: "#8a5a12" } };
    function origenDe(o?: T) { return ORIGEN[o] ? o : "simulado"; }
    // fuera: lo que suene a tratamiento (dentroDeUmbrales, «se puede tratar»): la lámina no lo cuenta
    function avisosLimpios(av?: T) { return (av || []).map(String).filter(function (t?: T) { return t && !/umbral|trata(r|miento)|atomizador|pulveriz/i.test(t); }); }

    // --- la hora en curso de la previsión (para el viento y el cielo de «Ahora»: el anemómetro de la estación está descartado por Vigía)
    function horaEnCurso(horas?: T, ahora?: T) {
      var hs = (horas || []).filter(function (x?: T) { return isFinite(Date.parse(x.instante)); }).sort(function (a?: T, b?: T) { return Date.parse(a.instante) - Date.parse(b.instante); }), r: T = null;
      for (var i = 0; i < hs.length; i++) { if (Date.parse(hs[i].instante) <= ahora) r = hs[i]; else break; }
      return r || hs[0] || null;
    }
    function ahoraDe(d?: T, ahora?: T, opts?: T) {
      var o = origenDe(d.origen), a = d.actual, hc = horaEnCurso(d.horas, ahora), sim = o === "simulado";
      var r: T = { medido: !!a, temp: a ? a.temperatura : hc ? hc.temperatura : null, hr: a ? a.humedadRelativa : hc ? hc.humedadRelativa : null, lluvia: a ? a.lluvia : hc ? hc.lluvia : null,
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
    function maqueta(d?: T, opts?: T) {
      opts = opts || {}; d = d || {};
      var ahora = opts.ahora != null ? opts.ahora : Date.now(), rv = cuantiza(opts.rumboVista || 0), o = origenDe(d.origen), sim = o === "simulado";
      var ah = ahoraDe(d, ahora, opts), ts = tarjetas(d.horas, ahora, opts), cards: T = [];
      ah.flecha = ah.viento != null && ah.direccion != null ? flechaAng(ah.direccion, rv) : null;
      ts.forEach(function (t?: T, i?: T) {
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
      var m: T = { W: W, H: H, PW: PW, PH: PW * H / W, origen: o, origenTxt: ORIGEN[o].txt, origenFondo: ORIGEN[o].fondo, rumbo: rv, titulo: "El tiempo en la finca",
        subAhora: "Ahora · " + ah.etiqueta, subPrev: sim ? "Próximas horas y días · simulado" : "Próximas horas y días · modelado",
        ahora: Object.assign({ x: 24, y: 116, w: 336, h: 464 }, ah, { tempTxt: n(ah.temp) + "°", hrTxt: "Humedad " + n(ah.hr) + " %", lluviaTxt: "Lluvia " + n(ah.lluvia, 1) + " mm",
          vientoTxt: ah.viento == null ? "viento –" : ah.viento < 0.3 ? "calma" : rumboTxt(ah.direccion) + " · " + n(ah.viento) + " m/s", cieloTxt: CIELOS[ah.cielo] }),
        tarjetas: cards, pie: pie, avisos: av };
      m.firma = JSON.stringify([o, rv, m.ahora.tempTxt, m.ahora.hrTxt, m.ahora.lluviaTxt, m.ahora.vientoTxt, m.ahora.cielo, m.ahora.noche, m.ahora.flecha, m.ahora.donde, m.ahora.cuando,
        cards.map(function (c?: T) { return [c.etiqueta, c.cielo, c.noche, c.temp, c.lluvia, c.viento, c.flecha]; }), pie]);
      return m;
    }
    // el resumen grande del panel VR (pestaña Mundo): icono, temperatura, cielo, viento y lluvia de las próximas 3 h, y su etiqueta
    function resumen(d?: T, opts?: T) {
      opts = opts || {}; d = d || {};
      var ahora = opts.ahora != null ? opts.ahora : Date.now(), ah = ahoraDe(d, ahora, opts), t = tarjetas(d.horas, ahora, { max: 1, noche: opts.noche })[0], rv = cuantiza(opts.rumboVista || 0);
      var r: T = { origen: origenDe(d.origen), cielo: ah.cielo, noche: ah.noche, temp: n(ah.temp) + " °C", cieloTxt: CIELOS[ah.cielo],
        viento: (ah.viento == null ? "Viento –" : ah.viento < 0.3 ? "Viento en calma" : "Viento del " + rumboTxt(ah.direccion) + " · " + n(ah.viento) + " m/s") + (ah.vientoDe === "previsión" ? " (previsión)" : ""),
        flecha: ah.viento != null && ah.viento >= 0.3 ? flechaAng(ah.direccion, rv) : null,
        lluvia: t ? "Próximas 3 h: " + (t.lluvia >= 0.05 ? n(t.probabilidadLluvia) + " % · " + n(t.lluvia, 1) + " mm" : "sin lluvia") : "Sin previsión",
        etiqueta: ah.etiqueta + " · " + ah.donde + (ah.cuando ? " · " + ah.cuando : "") };
      r.firma = JSON.stringify([r.origen, r.cielo, r.noche, r.temp, r.viento, r.flecha, r.lluvia, r.etiqueta]);
      return r;
    }

    // --- respaldo sintético (origen «simulado»): la forma de TiempoVivo.lee() con valores inventados que no son de ninguna finca
    function respaldo(ahora?: T) {
      var h0 = Math.floor(ahora / 3600000) * 3600000, horas: T = [];
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
    function rr(cx?: T, x?: T, y?: T, w?: T, h?: T, r?: T) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
    function disco(cx?: T, x?: T, y?: T, r?: T, c?: T) { cx.fillStyle = c; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); }
    function dibSol(cx?: T, x?: T, y?: T, r?: T) {
      cx.strokeStyle = "#ffc94a"; cx.lineWidth = Math.max(2, r * 0.2); cx.lineCap = "round";
      for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; cx.beginPath(); cx.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); cx.lineTo(x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 1.7); cx.stroke(); }
      disco(cx, x, y, r, "#ffc94a");
    }
    function luna(cx?: T, x?: T, y?: T, r?: T, fondo?: T) { disco(cx, x, y, r, "#ece6c4"); disco(cx, x + r * 0.45, y - r * 0.3, r * 0.82, fondo); }
    function dibNube(cx?: T, x?: T, y?: T, w?: T, c?: T) {   // centro (x, y) de la base; w de ancho
      cx.fillStyle = c; rr(cx, x - w * 0.46, y - w * 0.16, w * 0.92, w * 0.3, w * 0.15); cx.fill();
      disco(cx, x - w * 0.18, y - w * 0.16, w * 0.2, c); disco(cx, x + w * 0.08, y - w * 0.22, w * 0.27, c); disco(cx, x + w * 0.3, y - w * 0.08, w * 0.16, c);
    }
    function gotas(cx?: T, x?: T, y?: T, w?: T, nG?: T, largo?: T) {
      cx.strokeStyle = "#7fc8ff"; cx.lineWidth = Math.max(2, w * 0.05); cx.lineCap = "round";
      for (var k = 0; k < nG; k++) { var gx = x - w * 0.32 + k * (w * 0.64 / Math.max(1, nG - 1)); cx.beginPath(); cx.moveTo(gx, y); cx.lineTo(gx - largo * 0.35, y + largo); cx.stroke(); }
    }
    // el icono del cielo, centrado en (x, y) y de s px de lado; fondo = color sobre el que va (para recortar la luna)
    function icono(cx?: T, clave?: T, noche?: T, x?: T, y?: T, s?: T, fondo?: T) {
      fondo = fondo || "#1b232a"; cx.save();
      var astro = function (ax?: T, ay?: T, r?: T) { if (noche) luna(cx, ax, ay, r, fondo); else dibSol(cx, ax, ay, r); };
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
    function flecha(cx?: T, x?: T, y?: T, r?: T, ang?: T, rumboVista?: T) {
      cx.save(); cx.strokeStyle = "#6f808c"; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.stroke();
      if (rumboVista != null) { var an = -rumboVista * Math.PI / 180; disco(cx, x + Math.sin(an) * r, y - Math.cos(an) * r, Math.max(3, r * 0.16), "#e9eef2"); }
      if (ang == null) { disco(cx, x, y, Math.max(3, r * 0.22), "#9fb1bd"); cx.restore(); return; }
      var sx = Math.sin(ang), sy = -Math.cos(ang), px = x + sx * r * 0.88, py = y + sy * r * 0.88;
      cx.strokeStyle = "#7fe3ff"; cx.fillStyle = "#7fe3ff"; cx.lineWidth = Math.max(3, r * 0.16); cx.lineCap = "round";
      cx.beginPath(); cx.moveTo(x - sx * r * 0.7, y - sy * r * 0.7); cx.lineTo(x + sx * r * 0.35, y + sy * r * 0.35); cx.stroke();
      cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px - sx * r * 0.62 - sy * r * 0.42, py - sy * r * 0.62 + sx * r * 0.42); cx.lineTo(px - sx * r * 0.62 + sy * r * 0.42, py - sy * r * 0.62 - sx * r * 0.42); cx.closePath(); cx.fill();
      cx.restore();
    }
    function ajusta(cx?: T, t?: T, ancho?: T) { t = String(t); if (cx.measureText(t).width <= ancho) return t; while (t.length > 2 && cx.measureText(t + "…").width > ancho) t = t.slice(0, -1); return t + "…"; }
    function texto(cx?: T, t?: T, x?: T, y?: T, fuente?: T, color?: T, alin?: T, ancho?: T) { cx.font = fuente; cx.fillStyle = color; cx.textAlign = alin || "left"; cx.textBaseline = "middle"; cx.fillText(ancho ? ajusta(cx, t, ancho) : t, x, y); }
    var SANS = "system-ui, sans-serif", FONDO = "#0e1216", TARJ = "#1b232a";
    function dibuja(cx?: T, m?: T) {
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
      m.tarjetas.forEach(function (c?: T) {
        cx.fillStyle = TARJ; rr(cx, c.x, c.y, c.w, c.h, 18); cx.fill();
        var mx = c.x + c.w / 2;
        texto(cx, c.etiqueta, mx, c.y + 28, "bold 30px " + SANS, "#ffffff", "center", c.w - 16);
        icono(cx, c.cielo, c.noche, mx, c.y + 82, 76, TARJ);
        texto(cx, c.temp, mx, c.y + 140, "bold " + (c.tipo === "dia" ? 36 : 40) + "px " + SANS, "#ffffff", "center", c.w - 16);
        texto(cx, c.lluvia, mx, c.y + 174, "24px " + SANS, c.lluvia === "sin lluvia" ? "#9fb1bd" : "#9fd3ff", "center", c.w - 12);
        flecha(cx, c.x + 30, c.y + 204, 15, c.flecha, null);
        texto(cx, c.viento, c.x + 54, c.y + 204, "24px " + SANS, "#dbe6ec", "left", c.w - 62);
      });
      m.pie.forEach(function (t?: T, i?: T) { if (t) texto(cx, t, 32, 600 + i * 28, "24px " + SANS, /^Aviso/.test(t) ? "#ffd28a" : "#9fb1bd", "left", m.W - 64); });
    }
    return { W: W, H: H, PW: PW, FUENTE_MIN: FUENTE_MIN, CIELOS: CIELOS, cielo: cielo, cuantiza: cuantiza, flechaAng: flechaAng, tarjetas: tarjetas, haceTxt: haceTxt,
      avisosLimpios: avisosLimpios, maqueta: maqueta, resumen: resumen, respaldo: respaldo, dibuja: dibuja, icono: icono, flecha: flecha, rumboTxt: rumboTxt };
  })();
  // [puro:fin]

export function manifiestoFichasTiempo(dp: DepsFichasTiempo): Manifiesto {

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/fichas_tiempo.test.js con un THREE de mentira, para contar lo que crea y lo que libera)
  // FichasTiempoMotor(n): lo que monta el componente (n = el contexto de Componentes: n.on y n.limpia se sueltan solos al liberarlo). Engancha la tecla P
  // (Teclas), la fila del tiempo del panel VR (PanelVR.filas) y el aviso de la ventana Tiempo (evento «prevision:alterna» del Bus); no crea nada de GPU
  // hasta que se abre la lámina. libera() la cierra y suelta lo suyo.
  function FichasTiempoMotor(n?: T) {
    var P = FichasTiempoPuro, ID = "fichas-tiempo", cuenta: T = { pintadas: 0, abiertas: 0, cerradas: 0 }, mq: T = null, origenL = "", vD = new dp.THREE.Vector3();
    function datos() {
      try { if (typeof dp.TiempoVivo !== "undefined" && dp.TiempoVivo && dp.TiempoVivo.lee) { var d = dp.TiempoVivo.lee(); if (d && (d.actual || (d.horas && d.horas.length))) return d; } } catch (e: T) {}
      return P.respaldo(dp.ahoraMs());
    }
    function deNoche(ms?: T) { try { return dp.nivel(ms).d < 0.2; } catch (e: T) { return false; } }
    function enVR() { return !!dp.VRX.on; }
    // la lámina es de Laminas (02d_laminas.js: colocación, giro, cierre por distancia y al salir de VR, liberado, repintado solo si cambia la firma); aquí, solo qué se pinta
    var LAMINA: T = { id: ID, nombre: "fichaTiempo", ancho: P.PW, alto: P.PW * P.H / P.W, w: P.W, h: P.H,
      firma: function (lam?: T) { mq = P.maqueta(datos(), { ahora: dp.ahoraMs(), rumboVista: lam.rumbo(), noche: deNoche }); return mq.firma; },
      pinta: function (cx?: T) { P.dibuja(cx, mq); origenL = mq.origen; cuenta.pintadas++; },
      alCierra: function () { cuenta.cerradas++; dp.PanelVR.repinta(); } };
    function abre(forma?: T) {
      var modoL = forma === "vr" || (forma !== "pantalla" && enVR()) ? "vr" : "pantalla";
      if (!dp.Laminas.abre(Object.assign({ modo: modoL }, LAMINA))) return false;
      cuenta.abiertas++; dp.PanelVR.repinta();
      return true;
    }
    function cierra() { return dp.Laminas.cierra(ID); }
    function abierta() { return dp.Laminas.hay(ID); }
    function alterna(forma?: T) { return abierta() ? (cierra(), false) : abre(forma); }
    function resumen() {
      var i = dp.Laminas.info(ID);
      return { abierta: i.abierta, modo: i.modo, origen: i.abierta ? origenL : "", pintadas: cuenta.pintadas, abiertas: cuenta.abiertas, cerradas: cuenta.cerradas,
        pos: i.pos, rumbo: i.abierta ? P.cuantiza(i.rumbo) : null, tam: [P.W, P.H, P.PW, P.PW * P.H / P.W] };
    }
    // el resumen grande del panel VR: icono, temperatura, cielo, viento con su flecha según el rumbo dado y lluvia de las próximas 3 h
    function panelResumen(rumboVista?: T) { return P.resumen(datos(), { ahora: dp.ahoraMs(), rumboVista: rumboVista || 0, noche: deNoche }); }

    // --- la fila del tiempo en la pestaña Mundo del panel VR (doc/sistema/UX-FINCA-JUEGO.md §4.11): 944 × 236 px (92 × 23 cm en el panel de 1 m) con el
    // resumen (etiqueta medido / modelado / simulado) y «Ver previsión» (72 px de alto), que saca la lámina delante, anclada al mundo, y cierra el panel para
    // verla (Y lo vuelve a abrir). Va en Mundo y no en una cuarta pestaña: el tiempo es cómo está el mundo, como la hora y la fecha.
    var ultimo: T = null;
    function resPanel() { try { return panelResumen(dp.PanelVR.rumbo()); } catch (e: T) { return null; } }
    function pintaFila(cx?: T, y?: T) {
      var r = ultimo = resPanel(); if (!r) return;
      var F = P, sim = r.origen === "simulado", et = sim ? "simulado · no es el tiempo real" : r.etiqueta;
      cx.fillStyle = "#1b232a"; rrPanel(cx, 40, y, 944, 236, 18); cx.fill();
      cx.textBaseline = "middle"; cx.textAlign = "left"; cx.fillStyle = "#e9eef2"; cx.font = "bold 30px system-ui, sans-serif"; cx.fillText("Tiempo", 60, y + 34);
      cx.textAlign = "right"; cx.font = "22px system-ui, sans-serif"; cx.fillStyle = sim ? "#ffd28a" : "#9fb1bd"; while (cx.measureText(et).width > 720 && et.length > 4) et = et.slice(0, -2); cx.fillText(et, 964, y + 34);
      F.icono(cx, r.cielo, r.noche, 128, y + 136, 120, "#1b232a");
      cx.textAlign = "left"; cx.fillStyle = "#ffffff"; cx.font = "bold 64px system-ui, sans-serif"; cx.fillText(r.temp, 210, y + 110);
      cx.font = "28px system-ui, sans-serif"; cx.fillStyle = "#dbe6ec"; cx.fillText(r.cieloTxt, 210, y + 170);
      F.flecha(cx, 548, y + 80, 22, r.flecha, F.cuantiza(dp.PanelVR.rumbo()));
      var vt = r.viento; cx.font = "bold 26px system-ui, sans-serif"; cx.fillStyle = "#ffffff"; while (cx.measureText(vt).width > 390 && vt.length > 4) vt = vt.slice(0, -2); cx.fillText(vt, 584, y + 80);
      cx.font = "26px system-ui, sans-serif"; cx.fillStyle = "#9fd3ff"; cx.fillText(r.lluvia, 524, y + 120);
    }
    function rrPanel(cx?: T, x?: T, y?: T, w?: T, h?: T, r?: T) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
    function botonVR() { if (abierta()) cierra(); else { abre("vr"); dp.PanelVR.cierra(); } }
    n.limpia(dp.PanelVR.filas("mundo", { id: "tiempo", orden: 40, alto: 236,
      botones: function (b?: T, y?: T) { var ft = abierta(); b("tiempo", 520, y + 144, 444, 72, ft ? "Quitar la previsión" : "Ver previsión", botonVR, ft); },
      pinta: function (cx?: T, y?: T) { pintaFila(cx, y); },
      firma: function () { var r = resPanel(); return r ? r.firma + (abierta() ? "|1" : "|0") : ""; },   // el tiempo: datos, minuto o rumbo; y si la lámina está abierta
      debug: function () { return { tiempo: ultimo ? { temp: ultimo.temp, cielo: ultimo.cielo, origen: ultimo.origen, etiqueta: ultimo.etiqueta } : null, fichaTiempo: resumen() }; } }));
    // ¿está la lámina a menos de 4 m y a menos de 45° de la mirada? Entonces la ficha de la baliza (que se pinta encima) espera
    n.limpia(dp.PanelVR.tapa(function () {
      var i = dp.Laminas.info(ID); if (!i.abierta || !enVR()) return false;
      var p = i.pos, h = dp.VRX.cab, g = dp.VRX.mira || dp.camera.getWorldDirection(vD), dx = p[0] - h.x, dz = p[2] - h.z, d = Math.hypot(dx, dz), gl = Math.hypot(g.x, g.z) || 1;
      return d < 4 && (dx * g.x + dz * g.z) / (d * gl || 1) > 0.707;
    }));

    // --- los datos: si el motor expone TiempoVivo, cada cambio repinta (si está abierta)
    try { if (typeof dp.TiempoVivo !== "undefined" && dp.TiempoVivo && dp.TiempoVivo.alCambiar) n.limpia(dp.TiempoVivo.alCambiar(function () { dp.Laminas.repinta(ID); })); } catch (e: T) {}
    // --- en pantalla: P la abre o la cierra paseando (Teclas: no con el foco en un campo ni con Ctrl/Alt/Cmd); en vista aérea, un aviso (a cientos de metros no se lee)
    n.limpia(dp.Teclas.registra("KeyP", function () {
      if (enVR()) return false;
      if (!dp.paseando && !abierta()) { try { dp.Hud.aviso("La previsión en el mundo sale dp.paseando (Intro). En vista aérea, la ventana Tiempo (3).", 4000); } catch (e2: T) {} return; }
      alterna("pantalla");
    }, n.id));
    // --- el botón de la ventana Tiempo (15_tiempo.js) emite «prevision:alterna» ({ abre: true|false } o nada para alternar); salir de VR la cierra Laminas
    n.on("prevision:alterna", function (d?: T) {
      var q = d && d.abre;
      if (q === true) abre(enVR() ? "vr" : "pantalla"); else if (q === false) cierra(); else alterna(enVR() ? "vr" : "pantalla");
    });
    window.__fichaTiempo = function (accion?: T) { if (accion === "abre") abre(); else if (accion === "cierra") cierra(); return resumen(); };   // pruebas
    n.limpia(function () { delete window.__fichaTiempo; });
    return { abre: abre, cierra: cierra, alterna: alterna, abierta: abierta, resumen: resumen, panelResumen: panelResumen, revisa: function () { dp.Laminas.revisa(); } };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?fichas=0 la apaga; ?fichas=1 la enciende.
  return {
    id: "fichas-tiempo", version: 1,
    consume: ["TiempoVivo", "Hud", "PanelVR", "Teclas", "VRX", "Paseo", "ahoraMs", "nivel"],   // Laminas, Teclas y Bus son del núcleo
    expone: ["FichasTiempo"],
    eventos: { escucha: ["prevision:alterna"], emite: [] },
    bandera: { defecto: true, url: "fichas" },
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 3 },   // una malla de 2 triángulos y una textura de 1024 × 704 sin mipmaps (2,9 MB), solo con la lámina abierta
    mundos: ["exterior"],
    dom: ["#ventanaTiempo", "[data-abre=\"tiempo\"]"],   // A3-8b: la ventana «Tiempo y estación» y sus iconos, escondidos fuera del exterior (COMPONENTES §3.2)
    monta: function (n?: T) { return FichasTiempoMotor(n); },
    libera: function (api?: T) { if (api) api.cierra(); }
  };
}
