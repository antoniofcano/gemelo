// El tiempo del exterior, lo PURO (sin THREE ni DOM): MU5-n (A3-4), antes la cabeza de apps/web/motor/15_tiempo.js (el trozo [puro:inicio]…[puro:fin], el
// nivel del sol [nivel:inicio]…[nivel:fin], el reloj del mundo y los formatos). El código es el de siempre, movido. Lo evalúan en Node, sin navegador,
// pruebas/guardianes/tiempo_motor.test.js (TiempoPuro contra contratos/tiempo-ejemplo.json), fauna_equivalencia.test.js (el nivel del sol, bit a bit
// contra la copia de antes de AG-1.4b) y tiempo-puro.test.ts (el reloj, de forma pura).
// Qué entra y de dónde: la estación (medido) pone la temperatura y la humedad de «ahora»; la previsión (modelado, rejilla de ~5 km) pone las nubes, el viento
// y la lluvia, porque el anemómetro de la estación está en duda para Vigía. El sol sale de la fecha y la hora. Los textos de Vigía son datos: se escapan al
// pintarlos y nunca se siguen. `dentroDeUmbrales` no se enseña: Vigía no autoriza tratamientos.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

// [puro:inicio] (sin THREE ni DOM)
export var TiempoPuro = (function () {
  var ORIGENES: A = { vigia: 1, fixture: 1 };
  function n(v: A): A { return typeof v === "number" && isFinite(v) ? v : null; }
  // el cielo, deducido de la nubosidad y la lluvia de la previsión y de la humedad: despejado, nubes, cubierto, lluvia o niebla
  function cielo(nub: A, lluvia: A, hr: A): A {
    if (n(lluvia) != null && lluvia > 0.05) return "lluvia";
    if (n(hr) != null && hr >= 97 && (n(nub) == null || nub >= 80)) return "niebla";
    if (n(nub) == null) return null;
    return nub < 25 ? "despejado" : nub < 75 ? "nubes" : "cubierto";
  }
  // la hora de la previsión que contiene el momento (la última que ya empezó); −1 sin horas
  function horaIdx(horas: A, ms: A): number {
    if (!horas || !horas.length) return -1;
    var i = 0; for (var k = 0; k < horas.length; k++) { if (Date.parse(horas[k].instante) <= ms) i = k; else break; } return i;
  }
  // ¿cumple lo esencial del contrato (contratos/tiempo.schema.json)? Lo demás se pinta con lo que haya (null = no está)
  function valida(r: A): boolean {
    if (!r || typeof r !== "object" || r.version !== 1 || !ORIGENES[r.origen] || !Array.isArray(r.avisos)) return false;
    if (r.actual !== null && (typeof r.actual !== "object" || r.actual.naturaleza !== "medido" || !r.actual.estacion)) return false;
    if (r.prevision !== null && (typeof r.prevision !== "object" || r.prevision.naturaleza !== "modelado" || !Array.isArray(r.prevision.horas))) return false;
    if (r.prevision && r.prevision.horas.some(function (h: A) { return !h || !isFinite(Date.parse(h.instante)); })) return false;
    return true;
  }
  // de la respuesta de la api a la forma que pintan las fichas (la de Vigía: est y prev), sin nada que no esté en el contrato
  function aEstado(r: A): A {
    var a = r.actual, p = r.prevision;
    var est = a ? { hayLectura: true, estacion: { id: a.estacion.id, distanciaKm: a.estacion.distanciaKm, advertencia: a.estacion.advertencia },
      temperatura: a.temperatura, humedadRelativa: a.humedadRelativa, viento: a.viento, racha: a.racha,
      direccionViento: { grados: a.direccion ? a.direccion.grados : null, advertencia: a.direccion ? a.direccion.advertencia : null },
      lluviaAcumulada: a.lluviaAcumulada, deltaT: a.deltaT, inhabilitados: a.inhabilitados || [], frescura: a.frescura || {} } : { hayLectura: false };
    var prev = p && p.horas.length ? { hayPrevision: true, ambito: p.ambito, frescura: p.frescura || {}, horas: p.horas.map(function (h: A) {
      return { instante: h.instante, temperatura: h.temperatura, humedadRelativa: h.humedadRelativa, viento: h.viento, racha: h.racha, direccion: h.direccion,
        nubosidad: h.nubosidad, lluvia: h.lluvia, probabilidadLluvia: h.probabilidadLluvia, deltaT: h.deltaT };
    }) } : { hayPrevision: false };
    return { est: est, prev: prev, avisos: r.avisos.map(function (x: A) { return { de: x.de, texto: String(x.texto) }; }), origen: r.origen, consultadoEn: r.consultadoEn };
  }
  // lo que expone TiempoVivo.lee(): el actual medido (con el cielo deducido de la hora de la previsión), las horas modeladas, la frescura y los avisos
  function vivo(origen: A, est: A, prev: A, avisos: A, ms: A): A {
    var hs = prev && prev.hayPrevision && prev.horas ? prev.horas : [], i = horaIdx(hs, ms), h = i >= 0 ? hs[i] : null, e = est && est.hayLectura ? est : null;
    var f = (e && e.frescura) || (prev && prev.frescura) || {};
    return {
      origen: origen,
      actual: e ? {
        temperatura: n(e.temperatura), humedadRelativa: n(e.humedadRelativa), viento: n(e.viento), racha: n(e.racha),
        direccion: e.direccionViento ? n(e.direccionViento.grados) : null, lluvia: n(e.lluviaAcumulada),
        cielo: cielo(h ? h.nubosidad : null, h ? h.lluvia : null, n(e.humedadRelativa) != null ? e.humedadRelativa : (h ? h.humedadRelativa : null)),
        estacion: { id: e.estacion ? e.estacion.id || null : null, distanciaKm: e.estacion ? n(e.estacion.distanciaKm) : null }, naturaleza: "medido"
      } : null,
      horas: hs.map(function (x: A) {
        return { instante: x.instante, temperatura: n(x.temperatura), humedadRelativa: n(x.humedadRelativa), viento: n(x.viento), racha: n(x.racha), direccion: n(x.direccion),
          nubosidad: n(x.nubosidad), lluvia: n(x.lluvia), probabilidadLluvia: n(x.probabilidadLluvia), naturaleza: "modelado" };
      }),
      frescura: { generadoEn: f.generadoEn || null, horasDeAntiguedad: n(f.horasDeAntiguedad) },
      avisos: (avisos || []).map(function (x: A) { return typeof x === "string" ? x : String(x.texto); })
    };
  }
  // GET <prefijo>tiempo del mismo origen; nunca lanza: { ok, datos } o { ok: false, motivo }
  function lee(fetchFn: A, prefijo: A): Promise<A> {
    if (!prefijo || typeof fetchFn !== "function") return Promise.resolve({ ok: false, motivo: "sin_api" });
    return Promise.resolve().then(function () { return fetchFn(prefijo + "tiempo", { credentials: "same-origin", headers: { accept: "application/json" } }); })
      .then(function (r: A) {
        if (!r || !r.ok) return { ok: false, motivo: "http_" + (r ? r.status : 0) };
        return r.json().then(function (j: A) { return valida(j) ? { ok: true, datos: j } : { ok: false, motivo: "contrato" }; });
      })
      .catch(function () { return { ok: false, motivo: "red" }; });
  }
  // GET <prefijo>tiempo/historico?desde&hasta (contratos/tiempo-historico.schema.json); nunca lanza: { ok, datos } o { ok: false, motivo }
  function leeHistorico(fetchFn: A, prefijo: A, desde: A, hasta: A): Promise<A> {
    if (!prefijo || typeof fetchFn !== "function") return Promise.resolve({ ok: false, motivo: "sin_api" });
    return Promise.resolve().then(function () { return fetchFn(prefijo + "tiempo/historico?desde=" + encodeURIComponent(desde) + "&hasta=" + encodeURIComponent(hasta), { credentials: "same-origin", headers: { accept: "application/json" } }); })
      .then(function (r: A) {
        if (!r || !r.ok) return { ok: false, motivo: "http_" + (r ? r.status : 0) };
        return r.json().then(function (j: A) { return j && j.version === 1 && Array.isArray(j.fuentes) ? { ok: true, datos: j } : { ok: false, motivo: "contrato" }; });
      })
      .catch(function () { return { ok: false, motivo: "red" }; });
  }
  // La semana de la estación del tiempo (la misma que da la lectura de ahora; si no, la de Imarto, como siempre): { tmax, tmin, lluvia, dias, sin } o null si no hay cifras. Medido.
  function climaSemana(datos: A, idEstacion: A): A {
    var fs = (datos && datos.fuentes) || [];
    var f = fs.filter(function (x: A) { return idEstacion && x.id === idEstacion; })[0] || fs.filter(function (x: A) { return /imarto/i.test(x.id || ""); })[0];
    if (!f || typeof f.temperaturaMaxima !== "number" || typeof f.temperaturaMinima !== "number") return null;
    return { tmax: f.temperaturaMaxima, tmin: f.temperaturaMinima, lluvia: typeof f.lluviaTotalMm === "number" ? f.lluviaTotalMm : 0, dias: f.dias, sin: f.diasSinDato };
  }
  var MOTIVOS: A = { sin_api: "esta página no tiene servidor del tiempo", http_401: "hace falta entrar con tu enlace", http_503: "el servidor no tiene el tiempo de Vigía ahora",
    contrato: "la respuesta del servidor no tiene la forma esperada", red: "no se pudo hablar con el servidor" };
  function motivo(m: A): string { return MOTIVOS[m] || "el servidor respondió con un error (" + String(m).replace(/^http_/, "") + ")"; }
  // Un paso de hora (±1) del reloj del mundo, con la misma regla que el deslizador «Momento» y el botón «Ahora»: con previsión mueve el índice de hora y, si cae en la hora
  // de ahora, vuelve al modo «ahora» (el reloj real); sin previsión no hay deslizador, así que el paso es un desfase de horas enteras (tope ±12 h) y a 0 se vuelve a «ahora».
  // e = { idx, modo, ahoraIdx, corrimientoH }, n = horas de previsión (0 si no hay), d = ±1 → { idx, modo, corrimientoH }. Es el reloj de cada visitante: no se comparte.
  function pasoMomento(e: A, d: A, n: A): A {
    var s = d < 0 ? -1 : 1;
    if (n > 0) { var i = Math.max(0, Math.min(n - 1, e.idx + s)); return { idx: i, modo: i === e.ahoraIdx ? "ahora" : "prevision", corrimientoH: 0 }; }
    var f = Math.max(-12, Math.min(12, (e.corrimientoH || 0) + s)); return { idx: e.idx, modo: f === 0 ? "ahora" : "prevision", corrimientoH: f };
  }
  // L8-05 (auditoría de noviembre de 2026, MU5-n A3-4): lo que dice la chapita del visor de DE DÓNDE sale lo que se ve. Con la estación de otra fecha (el selector
  // NDVI, 23_estacion.js: EST.activa) el sol es el de ese día y el clima se reconstruye de la semana de la estación (o es el de hoy): no es una medida de ese momento,
  // así que se rotula «estimado», como ya decía su tarjeta. Los ejemplos ganan (ya lo dicen en la ventana); después, lo simulado y la prueba, como siempre.
  function rotuloOrigen(demo: A, origen: A, estimado: A): string {
    return demo ? " · ejemplo" : estimado ? " · estimado" : origen === "simulado" ? " · simulado" : origen === "fixture" ? " · prueba" : "";
  }
  return { cielo: cielo, horaIdx: horaIdx, pasoMomento: pasoMomento, valida: valida, aEstado: aEstado, vivo: vivo, lee: lee, leeHistorico: leeHistorico, climaSemana: climaSemana, motivo: motivo, rotuloOrigen: rotuloOrigen };
})();
// [puro:fin]

/** la comarca, a ~10 km (decisión 219): basta para el sol y la luna y no sitúa la finca */
export var LAT = 37.7, LON = -4.0, ZONA = "Europe/Madrid";

/** Los efectos de ejemplo de la ventana del tiempo (ilustrativos; la chapita dice «ejemplo»). */
export var DEMOS: A = {
  lluvia: { nub: 96, lluvia: 6, viento: 5.5, dir: 225, hr: 88, temp: 12, etiqueta: "Lluvia de ejemplo" },
  viento: { nub: 35, lluvia: 0, viento: 13, dir: 300, hr: 30, temp: 18, etiqueta: "Viento fuerte de ejemplo" },
  niebla: { nub: 100, lluvia: 0, viento: 0.3, dir: 90, hr: 99, temp: 6, etiqueta: "Niebla de ejemplo" },
  helada: { nub: 4, lluvia: 0, viento: 0.4, dir: 0, hr: 86, temp: -3, etiqueta: "Helada de ejemplo" }
};

// --- posición del sol (algoritmo astronómico simple, suficiente para dibujarlo)
// [nivel:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/fauna_equivalencia.test.js, junto a la copia del código anterior)
// posSolEn escribe en `s` ({ alt, az }) la posición del sol (antes posSol la devolvía en un objeto nuevo). nivelEn(ms, salida) es nivel(ms) sin reservar: `salida` es un
// objeto { s: { alt, az }, d } que pone el llamador una sola vez (AG-1.4b). Varios módulos piden el nivel con el mismo cur.ms en el mismo fotograma
// (el tiempo, la fauna, el quad o el dron, el paisaje, el sonido, las huellas): se recuerda la última posición del sol, así la trigonometría se hace una vez
// por valor de ms y no una por llamada (el resultado es el mismo, bit a bit: se copia lo que ya se calculó).
// MU5-n: el recuerdo es de cada nivel creado (antes, del módulo); la función se basta sola (sin nada de fuera) para que las pruebas de Node la evalúen por su texto.
export function creaNivelSol(LAT: number, LON: number) {
  function posSolEn(ms: number, s: { alt: number; az: number }) {
    var rad = Math.PI / 180, n = ms / 86400000 + 2440587.5 - 2451545.0;
    var L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
    var lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), de = Math.asin(Math.sin(eps) * Math.sin(lam));
    var gmst = (280.46061837 + 360.98564736629 * n) % 360, Hh = (gmst + LON) * rad - ra, fi = LAT * rad;
    var alt = Math.asin(Math.sin(fi) * Math.sin(de) + Math.cos(fi) * Math.cos(de) * Math.cos(Hh));
    var az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(fi) - Math.tan(de) * Math.cos(fi)) + Math.PI;
    s.alt = alt; s.az = az; return s;
  }
  var nvMs = NaN, nvAlt = 0, nvAz = 0, nvD = 0, nvSol = { alt: 0, az: 0 };
  function nivelEn(ms: number, salida: { s: { alt: number; az: number }; d: number }) {
    if (ms !== nvMs) { posSolEn(ms, nvSol); nvAlt = nvSol.alt; nvAz = nvSol.az; nvD = Math.max(0, Math.min(1, (Math.sin(nvAlt) + 0.1) / 0.45)); nvMs = ms; }
    salida.s.alt = nvAlt; salida.s.az = nvAz; salida.d = nvD; return salida;
  }
  function nivel(ms: number) { return nivelEn(ms, { s: { alt: 0, az: 0 }, d: 0 }); }   // la de siempre (reserva el resultado); lo que corre por fotograma usa nivelEn
  return { posSolEn: posSolEn, nivelEn: nivelEn, nivel: nivel };
}
// [nivel:fin]
export type NivelSol = ReturnType<typeof creaNivelSol>;

// --- los formatos (de la zona de la finca) y los textos
export function creaFormatos(zona: string) {
  return {
    fmtDia: new Intl.DateTimeFormat("es-ES", { timeZone: zona, weekday: "short", day: "numeric", month: "short" }),
    fmtHora: new Intl.DateTimeFormat("es-ES", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    fmtClaveDia: new Intl.DateTimeFormat("sv-SE", { timeZone: zona })
  };
}
export type Formatos = ReturnType<typeof creaFormatos>;
export function num1(v: A, d?: A): string { return v == null ? "—" : Number(v).toLocaleString("es-ES", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
export function rumbo(g: number): string { var n = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]; return n[Math.round(((g % 360) + 360) % 360 / 45) % 8] as string; }
export function esc(s: A): string { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as A)[c]; }); }
/** «hace N min» o «hace N h» desde iso, con el reloj que se dé (Date.now por defecto) */
export function hace(iso: A, ahora?: () => number): string { if (!iso) return ""; var h = ((ahora ? ahora() : Date.now()) - Date.parse(iso)) / 3600000; return h < 1 ? "hace " + Math.max(1, Math.round(h * 60)) + " min" : "hace " + num1(h, 1) + " h"; }

// --- el reloj del mundo
// ?hora=HH[:MM] fija la hora del reloj del mundo (hoy, hora local; el sol, el día y la noche, y con ellos la vida: la bandada solo vuela de día); ?hora=AAAA-MM-DDTHH:MM, también la fecha.
// Para que las medidas no dependan del reloj de la máquina; sin el parámetro, Date.now(). ?fecha=AAAA-MM-DD (sin ?hora=): el mundo en ese día a la hora de ahora, con el reloj
// corriendo (la estación del olivo y el sol de ese día). Sin los dos, el día real (EV-3a).
// busqueda = location.search; fmtClaveDia = el formato «AAAA-MM-DD» de la zona; ahora = el reloj de la máquina (Date.now; las pruebas ponen el suyo).
export function creaReloj(busqueda: string, fmtClaveDia: { format(d: Date): string }, ahora?: () => number) {
  var reloj = ahora || Date.now, q = busqueda || "";
  var HORA_FIJA = (function () {
    var m = /[?&]hora=([0-9T:.\-]+)/.exec(q); if (!m) return null; var v = m[1] as string, r = /^(\d{1,2})(?::(\d{2}))?$/.exec(v), t: A;
    if (r) { t = new Date(reloj()); t.setHours(Number(r[1]), Number(r[2] || 0), 0, 0); t = t.getTime(); } else t = Date.parse(v);
    return isFinite(t) ? t : null;
  })();
  var FECHA_FIJA = (function () { var m = /[?&]fecha=(\d{4}-\d{2}-\d{2})(?:&|$)/.exec(q); return m && isFinite(Date.parse(m[1] + "T12:00:00Z")) ? m[1] as string : null; })(), desfaseFecha: number | null = null;
  function ahoraMs(): number {
    if (HORA_FIJA != null) return HORA_FIJA;
    if (!FECHA_FIJA) return reloj();
    if (desfaseFecha === null) {
      var ya = reloj();
      desfaseFecha = Date.parse(FECHA_FIJA + "T12:00:00Z") - Date.parse(fmtClaveDia.format(new Date(ya)) + "T12:00:00Z");   // días enteros: la hora sigue siendo la de ahora
      // el cambio de hora (UTC+1 ↔ UTC+2) puede sacar de ese día su hora inicial o final: se corrige de hora en hora (como mucho dos pasos)
      for (var k = 0; k < 2 && fmtClaveDia.format(new Date(ya + desfaseFecha)) > FECHA_FIJA; k++) desfaseFecha -= 3600000;
      for (k = 0; k < 2 && fmtClaveDia.format(new Date(ya + desfaseFecha)) < FECHA_FIJA; k++) desfaseFecha += 3600000;
    }
    return reloj() + desfaseFecha;
  }
  return { ahoraMs: ahoraMs, horaFija: HORA_FIJA, fechaFija: FECHA_FIJA };
}
export type RelojMundo = ReturnType<typeof creaReloj>;
