// Las fichas del tiempo en el panel (la de la estación, medido, y la de la previsión de 72 h, modelado), el «Momento que ves» y de dónde se lee el tiempo:
// GET /api/tiempo del mismo origen (contratos/tiempo.md), si la página la sirve el servidor (o ?api=); si no, o si falla, el tiempo simulado de siempre, dicho.
// (El conector de claude.ai se quitó con la decisión 79.) MU5-n (A3-4): antes en apps/web/motor/15_tiempo.js; el código es el de siempre, movido.
// L2-11 (auditoría de noviembre de 2026): sus relojes (la relectura cada 10 min y «Reproducir») y sus escuchas (los controles del panel, el tema, el Bus)
// se apuntan al montarse y libera() los para y los quita todos. Los textos de Vigía son datos: se escapan al pintarlos y nunca se siguen.

import { esc, hace, num1, rumbo } from "./tiempo-puro.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsFichasTiempo {
  /** document.getElementById */
  $: (id: string) => A;
  TiempoPuro: A;
  /** el estado del tiempo (tiempo.ts) */
  TM: A;
  /** los formatos de la zona de la finca y los efectos de ejemplo */
  fmtDia: A; fmtHora: A; fmtClaveDia: A; DEMOS: A;
  /** el reloj del mundo y el de la máquina */
  ahoraMs: () => number;
  reloj: () => number;
  /** lo que tiende el mundo a enseñar (tiempo.ts: aplicaMundo) y lo que expone TiempoVivo.lee() */
  aplicaMundo: () => void;
  vivo: () => A;
  /** la hora (de la zona de la finca) a la que tiende el mundo */
  horaMundoTexto: () => string;
  /** la lámina de la previsión en el mundo (por el Bus, en tiempo.ts): pedirla, si alguien la atiende y avisar cuando cambian los componentes (devuelve la baja) */
  previsionEnMundo: { alterna(): void; hay(): boolean; alCambiar(fn: () => void): A };
  /** el prefijo de la api («/api/» si la página la sirve el servidor, o ?api=; null si no): HazasPuro.prefijoApi(location.search, D.base) */
  prefijoApi: () => A;
  /** window.fetch (con su window) o null */
  red: () => A;
  /** window.__TIEMPO_PRUEBA (solo en local) o null */
  prueba: () => A;
  /** L6-03: «Movimiento: Reducido» al crearse (sin «Reproducir»); después lo cambia calma(v) */
  calma: boolean;
  /** los relojes y las escuchas del navegador; libera() los suelta */
  temporizador: { setInterval(fn: () => void, ms: number): A; clearInterval(id: A): void };
  /** el tema: MutationObserver de data-theme y prefers-color-scheme (devuelve cómo quitarlo); repinta el fondo y la barrera */
  alCambiarTema: (fn: () => void) => () => void;
  pintaFondoTiempo: () => void;
}

export function creaFichasTiempo(d: DepsFichasTiempo) {
  var $ = d.$, TiempoPuro = d.TiempoPuro, TM = d.TM, fmtDia = d.fmtDia, fmtHora = d.fmtHora, fmtClaveDia = d.fmtClaveDia, DEMOS = d.DEMOS, ahoraMs = d.ahoraMs, PM = d.previsionEnMundo;
  var bajas: (() => void)[] = [], relojes: A[] = [], suelto = false;
  function escucha(el: A, ev: string, fn: A): void { if (!el) return; el.addEventListener(ev, fn); bajas.push(function () { el.removeEventListener(ev, fn); }); }
  function cada(fn: () => void, ms: number): A { var id = d.temporizador.setInterval(fn, ms); relojes.push(id); return id; }
  function haceR(iso: A): string { return hace(iso, d.reloj); }

  function tAviso(t: string, tipo: string): void { var e = $("tEstado"); e.textContent = t; if (tipo) e.setAttribute("data-t", tipo); else e.removeAttribute("data-t"); }
  function horaActual(): number { return TiempoPuro.horaIdx(TM.prev && TM.prev.horas, ahoraMs()); }   // la hora de la previsión que contiene el momento
  // El paso de hora de VR (h− / h+): mueve el reloj del mundo como el deslizador «Momento» (ver TiempoPuro.pasoMomento) y con él la luz; devuelve la hora que se ve
  function pasoHoraMundo(dd: number): string {
    var h = TM.prev && TM.prev.horas, r = TiempoPuro.pasoMomento({ idx: TM.idx, modo: TM.modo, ahoraIdx: TM.ahoraIdx, corrimientoH: TM.corrimientoH }, dd, h ? h.length : 0);
    TM.demo = ""; if ($("tDemo")) $("tDemo").value = ""; TM.idx = r.idx; TM.modo = r.modo; TM.corrimientoH = r.corrimientoH; if (h && h.length) $("tMomento").value = TM.idx;
    refrescaTiempo(); return d.horaMundoTexto();
  }

  // --- las dos fichas
  function tarjetaEstacion(): void {
    var e = TM.est, c = $("tEst");
    if (!e || !e.hayLectura) {
      c.innerHTML = '<h3>Estación</h3><p class="nota">' + (e ? "Vigía no tiene lectura de la estación ahora mismo." : TM.origen === "simulado" ? "Sin datos de Vigía: el tiempo que ves es simulado." : "Sin leer todavía.") + "</p>" +
        (TM.avisos.length ? '<ul class="t-avisos">' + TM.avisos.map(function (a: A) { return "<li>" + (a.de === "vigia" ? "Vigía: " : "") + esc(a.texto) + "</li>"; }).join("") + "</ul>" : "");
      return;
    }
    var s = e.estacion || {}, f = e.frescura || {}, his = TM.his && (TM.his.porFuente || []).filter(function (x: A) { return x.id === s.id || /imarto/i.test(x.id || ""); })[0];
    var fil = function (k: A, v: A, u: A) { return "<div><dt>" + k + "</dt><dd>" + v + (u ? ' <small>' + u + "</small>" : "") + "</dd></div>"; };
    var dv = e.direccionViento || {};
    var h = '<h3>Estación ' + esc(s.id || "") + ' <span class="t-pill">medido</span></h3>' +
      '<p class="t-sub">Estación a ' + num1(s.distanciaKm, 1) + ' km (no está en la finca)' + (f.generadoEn ? ", " + haceR(f.generadoEn) : ", sin hora de la medida") + "." + (f.datosDeMaqueta ? " <strong>Datos de maqueta.</strong>" : "") +
      (TM.origen === "fixture" ? " <strong>Datos de prueba sintéticos: no son de Vigía.</strong>" : "") + '</p>' +
      '<div class="t-grande"><span>' + num1(e.temperatura, 1) + '</span><small>°C</small></div><dl class="t-cifras">' +
      fil("Humedad", num1(e.humedadRelativa, 0), "%") + fil("Delta-T", num1(e.deltaT, 1), "°C") +
      fil("Lluvia acumulada", num1(e.lluviaAcumulada, 1), "mm") +
      fil("Viento", num1(e.viento, 1), "m/s") + fil("Racha", num1(e.racha, 1), "m/s") + fil("Dirección", dv.grados != null ? rumbo(dv.grados) + " " + esc(dv.grados) + "°" : "—", "") + '</dl>';
    // las advertencias son textos de Vigía: datos, escapados
    var adv = [s.advertencia, dv.advertencia].filter(function (x: A) { return x; });
    h += '<p class="t-aviso">' + (adv.length ? "Vigía advierte: " + adv.map(esc).join(" ") + " " : "") + "El viento que mueve el mundo sale de la previsión (modelado), no del anemómetro." +
      ((e.inhabilitados || []).length ? " Sin " + esc(e.inhabilitados.join(", ")) + "." : "") + "</p>";
    if (TM.avisos.length) h += '<ul class="t-avisos">' + TM.avisos.map(function (a: A) { return "<li>" + (a.de === "vigia" ? "Vigía: " : "") + esc(a.texto) + "</li>"; }).join("") + "</ul>";
    if (his) {
      h += '<h4>Últimos 7 días</h4><p class="t-sub">Máx. <strong>' + num1(his.temperaturaMaxima, 1) + '</strong> °C · mín. <strong>' + num1(his.temperaturaMinima, 1) + '</strong> °C · lluvia <strong>' + num1(his.lluviaTotalMm, 1) + '</strong> mm' + (his.diasConLluvia != null ? " en " + his.diasConLluvia + " día(s)" : "") +
        '. ' + (his.diasSinDato ? "Faltan datos de " + his.diasSinDato + " de " + (his.dias + his.diasSinDato) + " días." : "Sin días sin dato.") + "</p>";
    }
    c.innerHTML = h;
  }
  function resumenDias(): A[] {
    var hs = TM.prev.horas, por: A = {}, orden: A[] = [], v = function (x: A) { return typeof x === "number" && isFinite(x); };
    hs.forEach(function (x: A, i: number) {
      var k = fmtClaveDia.format(new Date(x.instante)); if (!por[k]) { por[k] = { k: k, ini: i, n: 0, t: [], nub: [], ll: 0, pr: 0, rf: null }; orden.push(k); }
      var dd = por[k]; dd.n++; if (v(x.temperatura)) dd.t.push(x.temperatura); if (v(x.nubosidad)) dd.nub.push(x.nubosidad); dd.ll += v(x.lluvia) ? x.lluvia : 0;
      dd.pr = Math.max(dd.pr, v(x.probabilidadLluvia) ? x.probabilidadLluvia : 0); if (v(x.racha)) dd.rf = Math.max(dd.rf || 0, x.racha);
    });
    return orden.map(function (k: A) { return por[k]; }).filter(function (dd: A) { return dd.n >= 3; });
  }
  // «Próximas 72 h»: temperatura (con la nubosidad de fondo), lluvia y viento hora a hora, en un SVG a mano (sin librería); cada hora lleva su <title>
  function tarjetaPrevision(): void {
    var c = $("tPrev"), p = TM.prev;
    if (!p || !p.hayPrevision || !p.horas || !p.horas.length) { c.innerHTML = '<h3>Previsión · 72 horas</h3><p class="nota">' + (p ? "Vigía no tiene previsión ahora mismo." : TM.origen === "simulado" ? "Sin previsión de Vigía: el tiempo que ves es simulado." : "Sin leer todavía.") + "</p>"; return; }
    var hs = p.horas, n = hs.length, f = p.frescura || {}, dias = resumenDias(), W = 360, Hs = 150, x0g = 24, x1g = 352, yT0 = 10, yT1 = 70, yL = 96, yV0 = 104, yV1 = 130;
    var v = function (x: A) { return typeof x === "number" && isFinite(x); };
    var ts = hs.map(function (x: A) { return x.temperatura; }).filter(v), tmin = ts.length ? Math.floor(Math.min.apply(null, ts) - 1) : 0, tmax = ts.length ? Math.ceil(Math.max.apply(null, ts) + 1) : 1;
    var X = function (i: number) { return x0g + (x1g - x0g) * i / Math.max(1, n - 1); }, Y = function (t: number) { return yT1 - (yT1 - yT0) * (t - tmin) / (tmax - tmin); };
    // una línea que se corta donde falta el dato (no se inventa el tramo)
    var linea = function (val: A, y: A) { var dd = "", sube = true; hs.forEach(function (x: A, i: number) { var q = val(x); if (!v(q)) { sube = true; return; } dd += (sube ? "M" : "L") + X(i).toFixed(1) + "," + y(q).toFixed(1); sube = false; }); return dd; };
    var lluviaMax = Math.max(0.5, Math.max.apply(null, hs.map(function (x: A) { return v(x.lluvia) ? x.lluvia : 0; })));
    var vMax = Math.max(5, Math.ceil(Math.max.apply(null, hs.map(function (x: A) { return Math.max(v(x.viento) ? x.viento : 0, v(x.racha) ? x.racha : 0); }))));
    var YV = function (w: number) { return yV1 - (yV1 - yV0) * w / vMax; };
    var nubes = "M" + X(0) + "," + yT1 + hs.map(function (x: A, i: number) { return "L" + X(i) + "," + (yT1 - (yT1 - yT0) * (v(x.nubosidad) ? x.nubosidad : 0) / 100 * 0.55); }).join("") + "L" + X(n - 1) + "," + yT1 + "Z";
    var bw = (x1g - x0g) / n, barras = hs.map(function (x: A, i: number) { var hgt = (v(x.lluvia) ? x.lluvia : 0) / lluviaMax * 22; return hgt > 0 ? '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (yL - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" fill="var(--lidar)"/>' : ""; }).join("");
    var seps = dias.slice(1).map(function (dd: A) { return '<line x1="' + X(dd.ini).toFixed(1) + '" x2="' + X(dd.ini).toFixed(1) + '" y1="4" y2="' + yV1 + '" stroke="var(--line)" stroke-dasharray="3 3"/>'; }).join("");
    var etDias = dias.map(function (dd: A, i: number) { var a = X(dd.ini), b = X(i + 1 < dias.length ? dias[i + 1].ini : n - 1); return '<text x="' + ((a + b) / 2).toFixed(1) + '" y="' + (Hs - 2) + '" text-anchor="middle" fill="var(--muted)" font-size="9.5">' + esc(fmtDia.format(new Date(hs[dd.ini].instante))) + "</text>"; }).join("");
    var horas = hs.map(function (x: A, i: number) {
      var ms = Date.parse(x.instante), t = fmtDia.format(new Date(ms)) + " " + fmtHora.format(new Date(ms)) + " · " + num1(x.temperatura, 1) + " °C · " + num1(x.nubosidad, 0) + " % nubes · lluvia " + num1(x.lluvia, 1) + " mm · viento " + num1(x.viento, 1) + " m/s" + (v(x.direccion) ? " del " + rumbo(x.direccion) : "") + ", racha " + num1(x.racha, 1);
      return '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + yV1 + '" fill="transparent"><title>' + esc(t) + "</title></rect>";
    }).join("");
    var marca = '<line id="tLinea" x1="0" x2="0" y1="2" y2="' + yV1 + '" stroke="var(--fg)" stroke-width="1.2"/>';
    var svg = '<svg viewBox="0 0 ' + W + " " + Hs + '" role="img" aria-label="Temperatura, nubosidad, lluvia y viento de las próximas 72 horas, hora a hora (previsión modelada)" class="t-graf">' +
      '<text x="2" y="' + (Y(tmax) + 3) + '" fill="var(--muted)" font-size="9.5">' + tmax + '°</text><text x="2" y="' + (Y(tmin) + 3) + '" fill="var(--muted)" font-size="9.5">' + tmin + '°</text>' +
      '<text x="2" y="' + (yV0 + 6) + '" fill="var(--muted)" font-size="8.5">' + vMax + '</text><text x="2" y="' + (yV1) + '" fill="var(--muted)" font-size="8.5">m/s</text>' +
      '<path d="' + nubes + '" fill="var(--muted)" opacity="0.22"/>' + seps + barras + '<line x1="' + x0g + '" x2="' + x1g + '" y1="' + yL + '" y2="' + yL + '" stroke="var(--line)"/>' +
      '<path d="' + linea(function (x: A) { return x.temperatura; }, Y) + '" fill="none" stroke="var(--guardado)" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="' + linea(function (x: A) { return x.racha; }, YV) + '" fill="none" stroke="var(--fg)" stroke-width="1" stroke-dasharray="2 2" opacity="0.6"/>' +
      '<path d="' + linea(function (x: A) { return x.viento; }, YV) + '" fill="none" stroke="var(--fg)" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<line x1="' + x0g + '" x2="' + x1g + '" y1="' + yV1 + '" y2="' + yV1 + '" stroke="var(--line)"/>' + etDias + marca + horas + "</svg>";
    var filas = dias.map(function (dd: A, i: number) {
      var tn = dd.t.length ? Math.min.apply(null, dd.t) : null, tx = dd.t.length ? Math.max.apply(null, dd.t) : null, nm = dd.nub.length ? dd.nub.reduce(function (a: number, b: number) { return a + b; }, 0) / dd.nub.length : null;
      var nom = i === 0 ? "Hoy" : i === 1 ? "Mañana" : fmtDia.format(new Date(hs[dd.ini].instante));
      return "<tr><th scope=\"row\">" + esc(nom) + "</th><td>" + num1(tn, 0) + " – " + num1(tx, 0) + " °C</td><td>" + num1(nm, 0) + " % nubes</td><td>" + (dd.ll > 0 ? num1(dd.ll, 1) + " mm (" + num1(dd.pr, 0) + " %)" : "sin lluvia") + "</td><td>racha " + num1(dd.rf, 1) + " m/s</td></tr>";
    }).join("");
    c.innerHTML = '<h3>Previsión · 72 horas <span class="t-pill t-pill-m">modelado</span></h3><p class="t-sub">Una por finca, de una rejilla de ~5 km' + (f.generadoEn ? " · " + haceR(f.generadoEn) : "") + "." + (f.datosDeMaqueta ? " <strong>Datos de maqueta.</strong>" : "") + (TM.origen === "fixture" ? " <strong>Datos de prueba sintéticos: no son de Vigía.</strong>" : "") + "</p>" + svg +
      '<p class="t-leyenda"><i class="l-temp"></i>temperatura <i class="l-nubes"></i>nubosidad <i class="l-lluvia"></i>lluvia (mm/h) <i class="l-viento"></i>viento (punteado: racha). Toca o pasa por encima de una hora para ver sus cifras.</p>' +
      lineaHelada(hs) + '<table class="t-tabla"><tbody>' + filas + "</tbody></table>";
    marcaMomento();
  }
  function lineaHelada(hs: A[]): string {
    var con = hs.filter(function (x: A) { return typeof x.temperatura === "number" && isFinite(x.temperatura); }); if (!con.length) return '<p class="t-sub">La previsión no trae temperaturas.</p>';
    var m = con.reduce(function (a: A, x: A) { return x.temperatura < a.temperatura ? x : a; }, con[0]), ms = Date.parse(m.instante), cuando = fmtDia.format(new Date(ms)) + " " + fmtHora.format(new Date(ms));
    return m.temperatura <= 0 ? '<p class="t-aviso">Helada prevista: mínima de ' + num1(m.temperatura, 1) + " °C el " + esc(cuando) + ".</p>"
      : '<p class="t-sub">Sin heladas previstas: la mínima de las 72 h es ' + num1(m.temperatura, 1) + " °C (" + esc(cuando) + ").</p>";
  }
  function marcaMomento(): void {
    var l = $("tLinea"), n = TM.prev && TM.prev.horas ? TM.prev.horas.length : 0; if (!l || !n) return;
    var x = 24 + (352 - 24) * TM.idx / (n - 1); l.setAttribute("x1", x); l.setAttribute("x2", x);
  }
  function textoMomento(): string {
    var h = TM.prev && TM.prev.horas; if (!h) return "";
    if (TM.demo) return DEMOS[TM.demo].etiqueta + " · simulación, no es el tiempo real";
    var ms = Date.parse(h[TM.idx].instante), nombre = fmtDia.format(new Date(ms)) + " · " + fmtHora.format(new Date(ms));
    return TM.modo === "ahora" ? "Ahora · " + fmtDia.format(new Date(d.reloj())) + " · " + fmtHora.format(new Date(d.reloj())) : "Previsión · " + nombre;
  }
  function refrescaTiempo(): void {
    $("tMomentoV").textContent = textoMomento(); d.aplicaMundo(); marcaMomento();
    $("tAhora").setAttribute("aria-pressed", String(TM.modo === "ahora" && !TM.demo));
    var h = TM.prev && TM.prev.horas, hh = h && h[TM.idx];
    $("tResumen").textContent = hh ? (TM.demo ? "" : "En el mundo: " + num1(hh.nubosidad, 0) + " % de nubes · viento " + num1(hh.viento, 1) + " m/s" + (hh.direccion != null ? " del " + rumbo(hh.direccion) : "") + " · " +
      (hh.lluvia > 0 ? "lluvia " + num1(hh.lluvia, 1) + " mm" : "sin lluvia") + " (previsión: modelado; las nubes, la lluvia y el viento que se ven, dibujados a partir de ella: ilustrativo)") : "";
  }
  function anuncia(): void { var v = d.vivo(); TM.oyentes.slice().forEach(function (fn: A) { try { fn(v); } catch (e) { /* un oyente que falla no para a los demás */ } }); }
  function aplicaDatos(): void {
    var h = TM.prev && TM.prev.horas, tiene = !!(h && h.length);
    $("tControl").hidden = !tiene; TM.ahoraIdx = Math.max(0, horaActual());
    if (tiene) { $("tMomento").max = h.length - 1; if (TM.modo === "ahora") TM.idx = TM.ahoraIdx; TM.idx = Math.min(TM.idx, h.length - 1); $("tMomento").value = TM.idx; }
    tarjetaEstacion(); tarjetaPrevision(); refrescaTiempo(); anuncia();
  }

  // --- de dónde se lee: la api del mismo origen; si no, simulado (y se dice)
  function tiempoSimulado(motivo: string): void {
    TM.origen = "simulado"; TM.est = null; TM.prev = null; TM.his = null; TM.avisos = [];
    tAviso("Tiempo simulado: " + motivo + ". El cielo, el viento y la temperatura que ves no son los reales.", "parcial"); aplicaDatos();
  }
  async function leerApi(silencioso: boolean): Promise<A> {
    if (!silencioso) { $("tLeer").disabled = true; tAviso("Leyendo el tiempo de Vigía en el servidor…", ""); }
    var r = await TiempoPuro.lee(d.red(), TM.api);
    if (suelto) return r;   // L2-11: lo que llega tras libera() se tira
    $("tLeer").disabled = false;
    if (!r.ok) return r;
    var s = TiempoPuro.aEstado(r.datos);
    TM.est = s.est; TM.prev = s.prev; TM.avisos = s.avisos; TM.origen = s.origen; TM.his = null;
    $("tLeer").hidden = false; $("tLeer").textContent = "Volver a leer";
    tAviso((s.origen === "fixture" ? "Datos de PRUEBA sintéticos (no son de Vigía), leídos " : "Tiempo de Vigía, leído por el servidor ") + haceR(s.consultadoEn) +
      ". Estación: medido · previsión: modelado · lo dibujado (nubes, lluvia, viento): ilustrativo.", s.origen === "vigia" && !s.avisos.length ? "vivo" : "parcial");
    aplicaDatos(); return r;
  }
  async function leerTiempo(): Promise<void> {
    if (!TM.api) return;
    var r = await leerApi(false); if (r.ok || suelto) return;
    if (TM.origen === "simulado") tiempoSimulado(TiempoPuro.motivo(r.motivo));
    else tAviso("No se ha podido volver a leer (" + TiempoPuro.motivo(r.motivo) + "): sigue la lectura anterior.", "error");
  }
  var reloj: A = null;
  /** apunta las escuchas y los relojes, pinta las fichas y lee el tiempo (lo que hacía 15_tiempo.js al cargarse); devuelve la lectura en curso */
  function monta(): Promise<A> {
    escucha($("tMomento"), "input", function () { TM.idx = Number($("tMomento").value); TM.modo = TM.idx === TM.ahoraIdx ? "ahora" : "prevision"; refrescaTiempo(); });
    escucha($("tAhora"), "click", function () { TM.demo = ""; $("tDemo").value = ""; TM.modo = "ahora"; TM.idx = TM.ahoraIdx; TM.corrimientoH = 0; $("tMomento").value = TM.idx; refrescaTiempo(); });
    // «+6 h» y «Mañana a las 12:00» se quitaron (decisión 89): el deslizador «Momento» y «Ahora» bastan
    escucha($("tDemo"), "change", function () { TM.demo = $("tDemo").value; refrescaTiempo(); });
    escucha($("tPlay"), "click", function () { juega(!TM.jugando); });
    calma(calmaYa);
    escucha($("tLeer"), "click", leerTiempo);
    // la lámina de la previsión en el mundo: la pide por el Bus («prevision:alterna», la atiende el componente fichas-tiempo de 35_fichas_tiempo.js);
    // el botón solo se ve si alguien la atiende (si el componente está apagado o fuera del motor, no hay botón muerto)
    var vm = $("tVerMundo");
    if (vm) {
      escucha(vm, "click", function () { PM.alterna(); });
      var veVm = function () { vm.hidden = !PM.hay(); }; var baja = PM.alCambiar(veVm); if (typeof baja === "function") bajas.push(baja); veVm();
    }
    bajas.push(d.alCambiarTema(d.pintaFondoTiempo));
    d.pintaFondoTiempo(); tarjetaEstacion(); tarjetaPrevision();
    TM.api = d.prefijoApi();   // «/api/» si la página la sirve el servidor (o ?api=)
    var P = d.prueba();
    if (P) { TM.est = P.est; TM.prev = P.prev; TM.his = P.his; TM.origen = "fixture"; aplicaDatos(); tAviso("Datos de prueba (solo en local).", "parcial"); return Promise.resolve({ ok: true, prueba: true }); }
    return (TM.api ? leerApi(true) : Promise.resolve({ ok: false, motivo: "sin_api" })).then(function (r: A) {
      if (suelto) return r;
      if (r.ok) {   // la api guarda lo de Vigía (10 min el actual, 1 h la previsión): pedirle cada 10 min no llega a Vigía más a menudo
        cada(function () { leerApi(true); }, 10 * 60000); return r;
      }
      if (TM.api) $("tLeer").hidden = false;   // con servidor, se puede reintentar
      tiempoSimulado(TiempoPuro.motivo(r.motivo));
      return r;
    });
  }
  // «Reproducir» la previsión: un reloj que avanza la hora cada 700 ms (sin él con «Movimiento: Reducido»)
  var calmaYa = !!d.calma;
  function juega(si: boolean): void {
    TM.jugando = si; var b = $("tPlay"); if (b) { b.textContent = si ? "Pausa" : "Reproducir"; b.setAttribute("aria-pressed", String(si)); }
    if (reloj !== null) { d.temporizador.clearInterval(reloj); var i = relojes.indexOf(reloj); if (i >= 0) relojes.splice(i, 1); reloj = null; }
    if (si) reloj = cada(function () { var h = TM.prev && TM.prev.horas; if (!h) return; TM.idx = (TM.idx + 1) % h.length; TM.modo = "prevision"; $("tMomento").value = TM.idx; refrescaTiempo(); }, 700);
  }
  /** L6-03: «Movimiento: Reducido» (o el sistema) quita «Reproducir» y, si estaba reproduciendo, lo para donde está; «Normal» lo devuelve */
  function calma(v: boolean): void {
    calmaYa = !!v; var b = $("tPlay"); if (b) b.hidden = calmaYa;
    if (calmaYa && TM.jugando && !suelto) juega(false);
  }
  /** L2-11: para los relojes (la relectura cada 10 min y «Reproducir») y quita todas las escuchas (los controles, el tema, el Bus); lo que llegue después se tira */
  function libera(): number {
    if (suelto) return 0;
    suelto = true;
    var n = relojes.length + bajas.length;
    relojes.forEach(function (id: A) { d.temporizador.clearInterval(id); }); relojes.length = 0; reloj = null;
    bajas.splice(0).forEach(function (f) { try { f(); } catch (e) { /* una baja que falla no para a las demás */ } });
    TM.jugando = false;
    return n;
  }
  return {
    tarjetaEstacion: tarjetaEstacion, tarjetaPrevision: tarjetaPrevision, refrescaTiempo: refrescaTiempo, aplicaDatos: aplicaDatos, pasoHoraMundo: pasoHoraMundo,
    leerApi: leerApi, leerTiempo: leerTiempo, tiempoSimulado: tiempoSimulado, monta: monta, libera: libera, calma: calma,
    /** cuántos relojes y escuchas siguen apuntados (para la prueba de L2-11) */
    vivos: function (): { relojes: number; escuchas: number } { return { relojes: relojes.length, escuchas: bajas.length }; }
  };
}
export type FichasTiempo = ReturnType<typeof creaFichasTiempo>;
