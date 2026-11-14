// Las aves probables este mes (EV-1g «Biodiversidad B0»; MU5-n, A3-5: antes apps/web/motor/52_aves_mes.js, que queda como talón): una ventana con las especies de aves que GBIF registra
// en este mes en el recuadro de 10 km alrededor de la finca (contratos/biodiversidad.schema.json, v 1), y la fila «Aves del mes» del panel de VR (pestaña Mundo: 3 especies y «y X más»,
// con «deducido», nota, atribución y licencias). Es DEDUCIDO (regla 5): registros de ciencia ciudadana y de proyectos de seguimiento, NO lo observado en la finca; el grado de cada
// ave es «probable» y la ventana lo dice con la pastilla «deducido», la frase del contrato y la atribución con las licencias (solo CC0, CC BY y CC BY-SA: decisión 198; un fichero con
// otra licencia se rechaza entero).
// Los datos los prepara fuera tuberia/biodiversidad/gbif_aves.py y se publican junto al índice: el motor pide <D.base>biodiversidad.json (su mismo origen; nunca otro host). Sin servidor
// (sin D.base), sin el fichero, con un fichero que no cumple el contrato o sin especies de este mes: no se monta nada (ni icono ni ventana) y no se rompe nada. Lo que llega es dato:
// se valida con filas blanca y se pinta SIEMPRE como texto (textContent), nunca como HTML.
// Presupuesto (regla 6): nada en la escena 3D (DOM: una ventana y un icono). Sin geometría, sin texturas, sin llamadas de dibujo. La fila de VR se pinta en el lienzo que el panel ya
// tiene (2D, solo con el panel abierto y a la vista): ni textura, ni malla, ni llamada de dibujo propia (por diseño; sin medir).
// Componente de los mundos ["exterior"] (como los demás de la finca) con un libera() que suelta de verdad: la descarga en curso (AbortController), la ventana, el icono, la fila de VR,
// el observador de la ventana y la ayuda de depuración. Sin THREE ni escena: del legado recibe por argumento lo que necesita (D, fetch, Ventanas, Hud, PanelVR y el DOM).
import type { ContextoComponente, Manifiesto } from "../../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

export interface DepsAvesMes {
  /** el índice de la finca (base, biodiversidad) */
  D: T3;
  /** el fetch del navegador (solo al mismo origen); sin él no se monta nada */
  fetch: T3;
  /** 32_ventanas y 31_hud: la ventana «Aves probables este mes» y su icono; devuelven la función que los quita */
  Ventanas: { registra(id: string, d: T3): () => void };
  Hud: { icono(d: T3): () => void };
  /** 29_vr: el panel de VR (la fila «Aves del mes»); undefined si no está */
  PanelVR?: T3;
  document: T3;
  window: T3;
  /** el reloj (Date.now por defecto): las pruebas lo fijan */
  ahora?: () => number;
}

export const ID_AVES_MES = "aves-mes";

// [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/aves_mes.test.js)
export const AvesMesPuro = (function () {
  var LICENCIAS: any = { CC0_1_0: "CC0", CC_BY_4_0: "CC BY 4.0", CC_BY_SA_4_0: "CC BY-SA 4.0" };   // las únicas admitidas (decisión 198)
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var NIVEL = "probable", NOTA = "Deducido de los registros de GBIF en 10 km a la redonda; no se ha observado en la finca.";
  var MAX_ESPECIES = 3000, MAX_FUENTES = 500, HUSO = "Europe/Madrid";
  // solo si el índice de la finca dice que el fichero está publicado (indice.biodiversidad, lo escribe gbif_aves.py): sin él no se pide nada (ni un 404 en la consola)
  function rutaDatos(base: any, fichero: any) { return typeof base === "string" && base && typeof fichero === "string" && /^[a-z0-9_-]+.json$/.test(fichero) ? base + fichero : null; }
  function txt(s: any, max?: any) { return typeof s === "string" && s.trim() ? s.trim().slice(0, max || 300) : null; }
  function ent(v: any, max?: any) { return typeof v === "number" && isFinite(v) && v >= 0 && v === Math.floor(v) && v <= (max || 1e9) ? v : null; }
  // filas blanca del contrato: devuelve { atribucion, generado, anios, cuadroKm, sintetico, fuentes, especies } o null si no cumple (versión, origen, grupo, licencias)
  function valida(j: any) {
    if (!j || typeof j !== "object" || j.v !== 1 || j.origen !== "gbif" || j.grupo !== "aves" || !Array.isArray(j.fuentes) || !Array.isArray(j.especies)) return null;
    if (j.fuentes.length > MAX_FUENTES || j.especies.length > MAX_ESPECIES) return null;
    var atr = txt(j.atribucion, 600); if (!atr) return null;
    var fuentes = [];
    for (var i = 0; i < j.fuentes.length; i++) {
      var f = j.fuentes[i], ls = f && Array.isArray(f.licencias) ? f.licencias : null;
      if (!ls || !ls.length || !txt(f.titulo)) return null;
      for (var k = 0; k < ls.length; k++) if (!Object.prototype.hasOwnProperty.call(LICENCIAS, ls[k])) return null;   // una licencia fuera de la filas (NC…): el fichero entero no vale
      fuentes.push({ titulo: txt(f.titulo), doi: txt(f.doi, 120), cita: txt(f.cita, 600), licencias: ls.slice(), registros: ent(f.registros) || 0 });
    }
    var esp = [];
    for (var e = 0; e < j.especies.length; e++) {
      var s = j.especies[e]; if (!s || !txt(s.nombre_cientifico) || !Array.isArray(s.meses) || s.meses.length !== 12) continue;
      var ms = [], ok = true;
      for (var m = 0; m < 12; m++) { var n = ent(s.meses[m] && s.meses[m].n), a = ent(s.meses[m] && s.meses[m].anios, 200); if (n === null || a === null) { ok = false; break; } ms.push({ n: n, anios: a }); }
      if (ok) esp.push({ cientifico: txt(s.nombre_cientifico, 120), comun: txt(s.nombre_comun, 120), meses: ms });
    }
    var an = j.anios && ent(j.anios.desde) !== null && ent(j.anios.hasta) !== null ? { desde: j.anios.desde, hasta: j.anios.hasta } : null;
    return { atribucion: atr, generado: txt(j.generado, 10), anios: an, cuadroKm: typeof j.cuadro_km === "number" && j.cuadro_km > 0 ? j.cuadro_km : 10, sintetico: j.sintetico === true, fuentes: fuentes, especies: esp };
  }
  // mes 1-12 en la hora de Madrid
  var fMes = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("en-US", { timeZone: HUSO, month: "numeric" }) : null;
  function mesDe(ms: any) { var m = fMes ? Number(fMes.format(new Date(ms))) : new Date(ms).getUTCMonth() + 1; return m >= 1 && m <= 12 ? m : 1; }
  // las probables del mes: con registros en al menos `minAnios` años distintos y `minRegistros` en total; las más registradas primero (desempata el nombre)
  function probables(d: any, mes: any, opts?: any) {
    var o = opts || {}, minA = o.minAnios == null ? 2 : o.minAnios, minN = o.minRegistros == null ? 3 : o.minRegistros, max = o.max == null ? 12 : o.max;
    if (!d || !(mes >= 1 && mes <= 12)) return [];
    return d.especies.map(function (s: any) { var c = s.meses[mes - 1]; return { nombre: s.comun || s.cientifico, cientifico: s.cientifico, n: c.n, anios: c.anios, grado: NIVEL }; })
      .filter(function (x: any) { return x.anios >= minA && x.n >= minN; })
      .sort(function (a: any, b: any) { return b.n - a.n || (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0); }).slice(0, max);
  }
  function licenciasTxt(d: any) { var s: any = {}; d.fuentes.forEach(function (f: any) { f.licencias.forEach(function (l: any) { s[l] = 1; }); }); return Object.keys(s).sort().map(function (l: any) { return LICENCIAS[l]; }).join(", "); }
  // todo lo que enseña la ventana (texto llano): título, grado, nota, filas, atribución, licencias y fuentes; null si no hay nada que enseñar este mes
  function contenido(d: any, mes: any) {
    var l = probables(d, mes); if (!d || !l.length) return null;
    return { titulo: "Aves probables en " + MESES[mes - 1], grado: NIVEL, procedencia: "deducido", nota: NOTA, sintetico: d.sintetico,
      advertencia: d.sintetico ? "Datos de ejemplo (sintéticos): no son reales." : null,
      filas: l.map(function (x: any) { return { nombre: x.nombre, cientifico: x.cientifico === x.nombre ? null : x.cientifico, detalle: x.n + " registros en " + x.anios + (x.anios === 1 ? " año" : " años") }; }),
      atribucion: d.atribucion, licencias: licenciasTxt(d), anios: d.anios ? d.anios.desde + "–" + d.anios.hasta : null, generado: d.generado,
      fuentes: d.fuentes.map(function (f: any) { return f.titulo + (f.doi ? " · doi:" + f.doi : "") + " · " + f.licencias.map(function (x: any) { return LICENCIAS[x]; }).join(", "); }) };
  }
  // la fila del panel de VR (pestaña Info): lo mismo que la ventana (mismas probables, misma nota, atribución y licencias) en pocas líneas legibles en el lienzo:
  // las `max` primeras (3) y «y X más»; null si no hay datos o no hay aves este mes (la fila no sale). Texto llano; nada de cálculo propio: sale de contenido().
  function filaVR(d: any, mes: any, max?: any) {
    var c = contenido(d, mes); if (!c) return null;
    var tope = max == null ? 3 : max, n = c.filas.length;
    // las licencias van primero en `fuente`: si la atribución no cabe en dos líneas, lo que se recorta es su cola
    return { titulo: "Aves del mes", cab: "Probables en " + MESES[mes - 1] + " · deducido · nivel " + c.grado,
      nombres: c.filas.slice(0, tope).map(function (f: any) { return f.nombre; }), mas: n > tope ? n - tope : 0,
      nota: (c.advertencia ? c.advertencia + " " : "") + c.nota, fuente: "Licencias: " + c.licencias + ". Fuente: " + c.atribucion, sintetico: c.sintetico };
  }
  return { LICENCIAS: LICENCIAS, MESES: MESES, NIVEL: NIVEL, NOTA: NOTA, rutaDatos: rutaDatos, valida: valida, mesDe: mesDe, probables: probables, licenciasTxt: licenciasTxt, contenido: contenido, filaVR: filaVR };
})();
// [puro:fin]

// [motor:inicio]
/** Monta la ventana, el icono y la fila de VR; null si no hay servidor ni fichero publicado. `libera()` lo suelta todo (una sola vez). */
export function creaAvesMes(d: DepsAvesMes, n: ContextoComponente) {
  const D = d.D, fetch = d.fetch, Ventanas = d.Ventanas, Hud = d.Hud, PanelVR = d.PanelVR, document = d.document, window = d.window;
  const ahora = d.ahora || Date.now;
  // lo que se engancha (la ventana, el icono, la fila de VR, el observador, la ayuda de depuración) se suelta con libera(), una sola vez y a la inversa
  const sueltas: (() => void)[] = []; let suelto = false;
  function limpia<F>(f: F): F { if (typeof f === "function") sueltas.push(f as unknown as () => void); return f; }
  function libera(): void {
    if (suelto) return; suelto = true;
    while (sueltas.length) { const f = sueltas.pop() as () => void; try { f(); } catch (e) { /* una que falla no impide soltar las demás */ } }
  }
  n.limpia(libera);   // el contexto del componente también la llama al liberarlo (idempotente)
  var P = AvesMesPuro, ruta = P.rutaDatos(D && D.base, D && D.biodiversidad);
  if (!ruta || typeof fetch !== "function") return null;   // sin servidor no hay fichero publicado: ni icono ni ventana
  var aborta = typeof AbortController === "function" ? new AbortController() : null;   // libera() corta la descarga si aún no ha llegado
  var vivo = true, datos: any = null, cuerpo: any = null, mesPintado = 0;
  limpia(function () { vivo = false; if (aborta) aborta.abort(); });
  function el(tag: any, css?: any, txt?: any) { var x = document.createElement(tag); if (css) x.style.cssText = css; if (txt != null) x.textContent = txt; return x; }
  function pinta() {
    if (!cuerpo || !datos) return;
    var mes = P.mesDe(ahora()), f = P.contenido(datos, mes);
    while (cuerpo.firstChild) cuerpo.removeChild(cuerpo.firstChild);
    mesPintado = mes;
    if (!f) { cuerpo.appendChild(el("p", "margin:0", "Sin registros de aves suficientes para este mes.")); return; }
    var cab = el("p", "margin:0 0 8px"), pill = el("span", "", "deducido"); pill.className = "pill p-deducido";
    cab.appendChild(pill); cab.appendChild(document.createTextNode(" Nivel " + f.grado + " · " + f.nota)); cuerpo.appendChild(cab);
    if (f.advertencia) cuerpo.appendChild(el("p", "margin:0 0 8px;font-weight:600", f.advertencia));
    var ul = el("ul", "margin:0 0 10px;padding-left:18px");
    f.filas.forEach(function (x: any) {
      var li = el("li", "margin:2px 0"); li.appendChild(el("strong", "", x.nombre));
      li.appendChild(document.createTextNode((x.cientifico ? " (" + x.cientifico + ")" : "") + " · " + x.detalle)); ul.appendChild(li);
    });
    cuerpo.appendChild(ul);
    var pie = el("div", "font-size:.75rem;opacity:0.85;line-height:1.4");
    pie.appendChild(el("p", "margin:0 0 4px", f.atribucion));
    pie.appendChild(el("p", "margin:0 0 4px", "Licencias: " + f.licencias + (f.anios ? " · años " + f.anios : "") + (f.generado ? " · descargado el " + f.generado : "")));
    var det = el("details", ""); det.appendChild(el("summary", "cursor:pointer", "Conjuntos de datos (" + f.fuentes.length + ")"));
    f.fuentes.slice(0, 40).forEach(function (s: any) { det.appendChild(el("p", "margin:2px 0", s)); });
    pie.appendChild(det); cuerpo.appendChild(pie);
  }
  fetch(ruta, { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" }, signal: aborta ? aborta.signal : undefined })
    .then(function (r: any) { return r.status === 200 ? r.json() : null; })
    .then(function (j: any) {
      if (!vivo) return;
      var d = P.valida(j); if (!d || !P.probables(d, P.mesDe(ahora())).length) return;   // sin datos o sin aves de este mes: nada
      datos = d;
      limpia(Ventanas.registra("aves", { titulo: "Aves probables este mes", construye: function (cu: any) { cuerpo = cu; pinta(); } }));
      limpia(Hud.icono({ id: "aves", ico: "🐦", txt: "Aves del mes", prio: 2, ventana: "aves" }));
      limpia(function () { cuerpo = null; });
      if (cuerpo && window.MutationObserver && cuerpo.parentNode) {   // al abrir la ventana, si cambió el mes, se repinta
        var mo = new MutationObserver(function () { if (!cuerpo.parentNode.hidden && P.mesDe(ahora()) !== mesPintado) pinta(); });
        mo.observe(cuerpo.parentNode, { attributes: true, attributeFilter: ["hidden"] }); limpia(function () { mo.disconnect(); });
      }
      // EV-1g, la fila «Aves del mes» del panel de VR (pestaña Info): lo mismo que la ventana, en pocas líneas (3 especies y «y X más»), con «deducido», la nota de que no
      // se ha observado en la finca, la atribución y las licencias. Nada que pulsar; sin datos o sin aves este mes no sale. Solo texto en el lienzo del panel (sin textura propia).
      if (typeof PanelVR !== "undefined" && PanelVR.filas) {
        var vistaVR = function () { return P.filaVR(datos, P.mesDe(ahora())); };
        limpia(PanelVR.filas("info", { id: "aves", orden: 80, alto: 220, visible: function () { return !!vistaVR(); },
          pinta: function (cx: any, y: any, W: any, h: any) {
            var v = vistaVR(); h.fila(v ? v.titulo : "Aves del mes", y); if (!v) return;
            cx.textAlign = "left"; cx.textBaseline = "alphabetic";
            function ajusta(t: any, ancho: any) { var r = t; while (cx.measureText(r).width > ancho && r.length > 6) r = r.slice(0, -2); return r === t ? r : r.trim() + "…"; }
            function envuelve(t: any, ancho: any, max: any) {   // hasta `max` líneas; lo que sobra acaba en «…»
              var pal = t.split(" "), ls = [], l = "";
              for (var i = 0; i < pal.length; i++) { var q = l ? l + " " + pal[i] : pal[i]; if (cx.measureText(q).width > ancho && l) { ls.push(l); l = pal[i]; } else l = q; }
              if (l) ls.push(l);
              if (ls.length > max) { ls = ls.slice(0, max); ls[max - 1] = ajusta(ls[max - 1] + "…", ancho); }
              return ls;
            }
            cx.fillStyle = "#ffe9a8"; cx.font = "700 22px system-ui, sans-serif"; cx.fillText(ajusta(v.cab, 944), 40, y + 66);
            cx.fillStyle = "#ffffff"; cx.font = "700 26px system-ui, sans-serif";   // una sola línea: «A, B, C y X más»; si no cabe, pasan nombres al «y X más»
            var nom = v.nombres.slice(), mas = v.mas, linea = function () { return nom.join(", ") + (mas ? " y " + mas + " más" : ""); };
            while (nom.length > 1 && cx.measureText(linea()).width > 944) { nom.pop(); mas++; }
            cx.fillText(ajusta(linea(), 944), 40, y + 100);
            cx.fillStyle = "#cfdccb"; cx.font = "600 21px system-ui, sans-serif";
            envuelve(v.nota, 944, 2).forEach(function (t: any, i: any) { cx.fillText(t, 40, y + 132 + i * 24); });
            envuelve(v.fuente, 944, 2).forEach(function (t: any, i: any) { cx.fillText(t, 40, y + 186 + i * 24); });   // hasta y + 210: dentro del alto de 220
          },
          firma: function () { var v = vistaVR(); return v ? v.cab + "|" + v.nombres.join("/") + "|" + v.mas : ""; },
          debug: function () { return { aves: vistaVR() }; } }));
      }
      window.__avesMes = function () { return { mes: mesPintado, contenido: P.contenido(datos, mesPintado || P.mesDe(ahora())) }; };   // pruebas y ?debug
      limpia(function () { try { delete window.__avesMes; } catch (e) { window.__avesMes = undefined; } });
    }).catch(function () {});   // sin red, JSON roto, lo que sea: nada
  return { datos: function () { return datos; }, libera: libera };
}
export type AvesMes = NonNullable<ReturnType<typeof creaAvesMes>>;
// [motor:fin]

/** El manifiesto del componente «aves-mes» (el mismo de siempre, ahora de los mundos ["exterior"]): lo registra el talón de 52 con Componentes.registra. ?aves=0 lo apaga; ?aves=1 lo enciende. */
export function manifiestoAvesMes(d: DepsAvesMes): Manifiesto {
  return {
    id: ID_AVES_MES, version: 1,
    consume: ["D", "Hud", "Ventanas", "PanelVR"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true, url: "aves" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // DOM: una ventana y un icono; nada en la escena 3D
    fases: {},
    mundos: ["exterior"],
    dom: ["#ventana-aves", "[data-abre=\"aves\"]"],   // A3-8b: su ventana y sus iconos, escondidos fuera del exterior (COMPONENTES §3.2)
    monta: function (n) { return creaAvesMes(d, n); },
    libera: function (api) { if (api) (api as AvesMes).libera(); }
  };
}
