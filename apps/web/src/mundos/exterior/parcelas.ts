// Parcelas: el selector (fincas y parcelas), las cifras de «Lo medido» y la ficha del suelo de cada una (MU5-n, A3-7b1: antes apps/web/motor/13_parcelas.js, que queda como talón).
// Es del EXTERIOR: las parcelas, las fincas y las cifras (copas del LiDAR, marcas, desfase) son de la finca que se ve desde el aire, y elegir una mueve la cámara orbital a su centro.
// Componente «selector-parcelas» de los mundos ["exterior"], con un libera() que suelta de verdad: las escuchas de los chips y del selector de calidad, los nodos que crea (los chips
// fijos y el selector de fincas), los chips de la finca elegida, el aplazado de la unidad guardada y la suscripción a Configuración (Superficie en ha o m²).
// Código movido tal cual (solo se tipan parámetros y variables); lo elegido (fincaSel y parcelaSel, que leen 09 y 12) se pide con parcelaSel() y fincaSel(); Ajustes (33, que se
// monta después) entra por getter. Hallazgos de la auditoría arreglados al moverlo (sin cambio de lo que se ve): el nombre de la parcela se escapa al pintar la ficha del suelo (L9-03, mismo
// vector que la historia) y la ficha no falla si la parcela trae una sola profundidad (L3-18). Lo que cambiaría el rótulo (la fecha de la consulta del ISRIC está escrita a mano, «Desfase medio» es
// una mediana, «declaradas») queda apuntado para el banco.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import { creaSoltador } from "../../nucleo/soltador.ts";
import type { T } from "../comun/tipos.ts";
import { esc } from "./tiempo-puro.ts";

export const ID_PARCELAS = "selector-parcelas";

/** Lo que el talón de 13 le da: los datos y utilidades de 01 (D, $, tinta, fmt, DIST_INI), el mundo (02: suelo, copas, cIn, marc, med), Estado (03), aplicaLuego (08) y la cámara orbital (09: objetivo, orb);
 *  por getter, Ajustes (33 se monta después). Lo elegido (fincaSel y parcelaSel) lo piden 09 y 12 por Parcelas.parcelaSel() y Parcelas.fincaSel() */
export interface DepsParcelas {
  D: T; $: (id: string) => T; tinta: (raiz: T) => void; fmt: (n: number, d?: number) => string; DIST_INI: number;
  suelo: (x: number, y: number) => number; copas: T; cIn: T; marc: T; med: (a: number[]) => number; Estado: T; aplicaLuego: () => void; objetivo: T; orb: T;
  readonly Ajustes: T; documento?: T;
}

/** L3-07: hectáreas CALCULADAS sobre un polígono (fórmula del topógrafo; x, y en metros locales). Es la cifra que el gemelo mide sobre el linde que le llega, distinta de las «ha declaradas» de OlivarTrack */
export function areaHaLinde(linde: ReadonlyArray<ReadonlyArray<number>> | null | undefined): number {
  if (!linde || linde.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < linde.length; i++) { const a = linde[i] as ReadonlyArray<number>, b = linde[(i + 1) % linde.length] as ReadonlyArray<number>; s += (a[0] as number) * (b[1] as number) - (b[0] as number) * (a[1] as number); }
  return Math.abs(s) / 2 / 10000;
}

export function creaParcelas(dp: DepsParcelas) {
  var D: T = dp.D, $ = dp.$, tinta = dp.tinta, fmt = dp.fmt, DIST_INI = dp.DIST_INI, suelo = dp.suelo, copas: T = dp.copas, cIn: T = dp.cIn, marc: T = dp.marc, med = dp.med, Estado: T = dp.Estado;
  var aplicaLuego = dp.aplicaLuego, objetivo: T = dp.objetivo, orb: T = dp.orb, document: T = dp.documento || globalThis.document;
  var suel = creaSoltador();   // A3-7b1: lo que se engancha a la página se apunta aquí y se suelta en libera()
  var din: Array<() => void> = [];   // las escuchas de los chips de la finca elegida, que se rehacen cada vez que se elige otra finca

  var parcelas = D.parcelas, fincas = D.fincas || [], fincaSel = -1, parcelaSel = -1, vistaIni: T = { x: 0, y: 12, z: 0, dist: DIST_INI };
  // «Superficie en» ha o m² (Configuración → Vista, 33_ajustes.js: Ajustes.superficie); sin 33_ajustes.js, en hectáreas como siempre
  function sup(ha?: T) { try { if (dp.Ajustes && dp.Ajustes.superficie) return dp.Ajustes.superficie(ha); } catch (e: T) {} return fmt(ha, 1) + " ha"; }
  function claseUsda(a?: T, l?: T, c?: T) {
    if (c >= 40 && a <= 45 && l < 40) return "arcilloso"; if (c >= 40 && l >= 40) return "arcillo limoso"; if (c >= 35 && a > 45) return "arcillo arenoso";
    if (c >= 27 && c < 40 && a > 20 && a <= 45) return "franco arcilloso"; if (c >= 27 && c < 40 && a <= 20) return "franco arcillo limoso";
    if (c >= 20 && c < 35 && l < 28 && a > 45) return "franco arcillo arenoso"; if (l >= 80 && c < 12) return "limoso";
    if ((l >= 50 && c >= 12 && c < 27) || (l >= 50 && l < 80 && c < 12)) return "franco limoso"; if (c >= 7 && c < 27 && l >= 28 && l < 50 && a <= 52) return "franco";
    if (a >= 85 && l + 1.5 * c < 15) return "arenoso"; return "franco arenoso";
  }
  function pintaSuelo(k?: T) {
    var cu = $("sueloCuerpo"), pr = k >= 0 ? parcelas[k] : null;
    if (!pr) { cu.innerHTML = '<p class="nota">Elige una parcela arriba para ver la caracterización de su suelo.</p>'; return; }
    if (!pr.suelo) { cu.innerHTML = '<p class="nota">Sin datos de SoilGrids para esta parcela.</p>'; return; }
    var f = pr.suelo, clases: T = {}; f.forEach(function (r?: T) { clases[claseUsda(r.a, r.l, r.c)] = 1; });
    var h = '<p class="sg-clase">' + esc(pr.nombre) + ' · textura <strong>' + Object.keys(clases).join(" / ") + '</strong></p>' +
      '<div class="sg-leyenda"><span><i class="c-arena"></i>arena</span><span><i class="c-limo"></i>limo</span><span><i class="c-arcilla"></i>arcilla (%)</span></div>';
    f.forEach(function (r?: T) {
      h += '<div class="sg-fila"><span class="sg-prof">' + r.p + ' cm</span><span class="sg-barra" role="img" aria-label="arena ' + fmt(r.a) + ' %, limo ' + fmt(r.l) + ' %, arcilla ' + fmt(r.c) + ' %"><i class="c-arena" data-ancho="' + r.a.toFixed(1) + '"></i><i class="c-limo" data-ancho="' + r.l.toFixed(1) + '"></i><i class="c-arcilla" data-ancho="' + r.c.toFixed(1) + '"></i></span><span class="sg-num">' + fmt(r.c) + ' %</span></div>';
    });
    h += '<table class="sg-tabla"><thead><tr><th>cm</th><th>pH</th><th>MO %</th><th>CIC</th></tr></thead><tbody>';
    f.forEach(function (r?: T) { h += '<tr><td>' + r.p + '</td><td>' + fmt(r.ph, 1) + '</td><td>' + fmt(r.mo, 1) + '</td><td>' + fmt(r.cec) + '</td></tr>'; });
    h += '</tbody></table><p class="nota">' + (f[1] ? 'Densidad ' + fmt(f[1].dens, 2) + ' kg/dm³ y ' + fmt(f[1].pedr) + ' % de elementos gruesos a 5-15 cm. ' : '') + 'CIC en cmol(c)/kg. MO = carbono orgánico × 1,724.</p>' +
      '<p class="nota sep6">Modelo del ISRIC a 250 m' + fechaSuelo() + ': un valor por parcela, no un mapa dentro de ella. Las parcelas cercanas pueden compartir celda y por tanto valores casi iguales. No hay analítica de suelo propia con la que contrastarlo.</p>';
    cu.innerHTML = h; tinta(cu);
  }
  /** L3-18: «, consultado el D-MM-AAAA» solo si el índice trae la fecha (textos.suelo_consulta); antes estaba escrita a mano («25-oct-2026») para todas las fincas */
  function fechaSuelo(): string { const f = D.textos && D.textos.suelo_consulta, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof f === "string" ? f : ""); return m ? ", consultado el " + m[3] + "/" + m[2] + "/" + m[1] : ""; }
  function estadisticas(k?: T) {
    var enF = function (p?: T) { return fincaSel < 0 || (parcelas[p] && parcelas[p].finca === fincaSel); };
    var ci = cIn.filter(function (c?: T) { return k < 0 ? enF(c.parc) : c.parc === k; }), mm = marc.filter(function (m?: T) { return k < 0 ? enF(m.parc) : m.parc === k; }), ee = mm.filter(function (m?: T) { return m.par >= 0; });
    var dx = ee.map(function (m?: T) { return m.x - copas[m.par].x; }), dy = ee.map(function (m?: T) { return m.y - copas[m.par].y; });
    $("tMedido").textContent = "Lo medido · " + (k >= 0 ? parcelas[k].nombre : fincaSel >= 0 ? fincas[fincaSel].nombre : fincas.length > 1 ? "toda la explotación" : "toda la finca");
    $("kCopas").textContent = fmt(ci.length); $("kMarc").textContent = fmt(mm.length);
    $("kAlt").textContent = fmt(med(ci.map(function (c?: T) { return c.h; })), 1) + " m"; $("kDes").textContent = fmt(Math.hypot(med(dx), med(dy)), 1) + " m";
    $("nMarc").textContent = fmt(marc.length);
    const eSup = $("kSup");   // L3-07: las hectáreas calculadas sobre el linde (sin linde en el índice, no se inventa nada: «–»)
    if (eSup) { const sel = k >= 0 ? [parcelas[k]] : parcelas.filter(function (p?: T) { return fincaSel < 0 || p.finca === fincaSel; }), conLinde = sel.filter(function (p?: T) { return p && p.linde && p.linde.length >= 3; }); eSup.textContent = conLinde.length ? fmt(conLinde.reduce(function (a?: T, p?: T) { return a + areaHaLinde(p.linde); }, 0), 1) + " ha" : "–"; }
  }
  function elegirParcela(k?: T) {
    parcelaSel = k; if (k >= 0 && fincas.length > 1) fincaSel = parcelas[k].finca;
    pintaChips();
    estadisticas(k); pintaSuelo(k);
    if (k < 0 && fincaSel >= 0) { var vf = vistaDeFinca(fincaSel); vistaIni = { x: vf.x, y: suelo(vf.x, -vf.z) * Estado.exag, z: vf.z, dist: vf.dist }; }
    else if (k < 0) { vistaIni = { x: 0, y: 12, z: 0, dist: DIST_INI }; }
    else { var pr = parcelas[k]; vistaIni = { x: pr.centro[0], y: suelo(pr.centro[0], pr.centro[1]) * Estado.exag, z: -pr.centro[1], dist: Math.max(110, Math.sqrt(pr.ha) * 95) }; }
    orb.dist = vistaIni.dist; orb.el = k < 0 ? 0.62 : 0.7; objetivo.set(vistaIni.x, vistaIni.y, vistaIni.z);
  }
  function vistaDeFinca(f?: T) {   // el centro y la distancia para encuadrar todas las parcelas de una finca
    var xs: T = [], ys: T = []; fincas[f].parcelas.forEach(function (k?: T) { parcelas[k].linde.forEach(function (q?: T) { xs.push(q[0]); ys.push(q[1]); }); });
    var a = Math.min.apply(null, xs), b = Math.max.apply(null, xs), c = Math.min.apply(null, ys), d = Math.max.apply(null, ys);
    return { x: (a + b) / 2, z: -(c + d) / 2, dist: Math.max(260, Math.hypot(b - a, d - c) * 1.15) };
  }
  function elegirFinca(f?: T) { fincaSel = f; elegirParcela(-1); }
  function pintaChips() {   // dos niveles cuando hay varias fincas: primero las fincas y, de la elegida, sus parcelas
    var cf = $("chipsFincas"), cp = $("chips"); if (!cf) { var kk = parcelaSel; Array.prototype.forEach.call(cp.children, function (b?: T) { b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-k")) === kk)); }); return; }
    Array.prototype.forEach.call(cf.children, function (b?: T) { var f = Number(b.getAttribute("data-f")); b.setAttribute("aria-pressed", String(f === fincaSel)); });
    din.splice(0).forEach(function (f?: T) { f(); }); cp.innerHTML = ""; $("tParcelasFinca").textContent = fincaSel >= 0 ? "Parcelas de " + fincas[fincaSel].nombre : "Elige una finca para ver sus parcelas"; cp.hidden = fincaSel < 0;
    if (fincaSel >= 0) fincas[fincaSel].parcelas.forEach(function (k?: T) {
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.setAttribute("data-k", k); b.setAttribute("aria-pressed", String(k === parcelaSel)); b.textContent = parcelas[k].nombre + " · " + sup(parcelas[k].ha) + (parcelas[k].pasto ? " (pasto)" : ""); var fn = function () { elegirParcela(k); }; b.addEventListener("click", fn); din.push(function () { b.removeEventListener("click", fn); }); cp.appendChild(b);
    });
  }
  (function () {
    if (fincas.length > 1) {   // selector de dos niveles (fincas → parcelas)
      var cp0 = $("chips"), cf = document.createElement("div"); cf.id = "chipsFincas"; cf.className = "chips"; cf.setAttribute("role", "group"); cf.setAttribute("aria-label", "Finca a mostrar");
      var tf = document.createElement("p"); tf.id = "tParcelasFinca"; tf.className = "nota"; tf.style.margin = "10px 0 6px"; cp0.parentNode.insertBefore(cf, cp0); cp0.parentNode.insertBefore(tf, cp0); suel.nodo(cf); suel.nodo(tf);
      var chipF = function (txt?: T, f?: T) { var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.setAttribute("data-f", f); b.setAttribute("aria-pressed", "false"); b.textContent = txt; suel.escucha(b, "click", function () { if (f < 0) { fincaSel = -1; elegirParcela(-1); } else elegirFinca(f); }); cf.appendChild(b); };
      chipF("Toda la explotación", -1); fincas.forEach(function (f?: T, i?: T) { chipF(f.nombre + " · " + fmt(f.ha, 0) + " ha declaradas · " + fmt(f.olivos) + " olivos declarados", i); });
      suel.escucha($("calidad"), "change", function () { Estado.calidad = Number($("calidad").value); if (Estado.modo === "gem") aplicaLuego(); });
      return;
    }
    var cont = $("chips"), chip = function (txt?: T, k?: T) { var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.setAttribute("data-k", k); b.setAttribute("aria-pressed", "false"); b.textContent = txt; suel.escucha(b, "click", function () { elegirParcela(k); }); suel.nodo(b); cont.appendChild(b); };
    chip("Toda la finca", -1); parcelas.forEach(function (pr?: T, k?: T) { chip(pr.nombre + " · " + sup(pr.ha), k); });
    suel.escucha($("calidad"), "change", function () { Estado.calidad = Number($("calidad").value); if (Estado.modo === "gem") aplicaLuego(); });
  })();
  elegirParcela(-1);
  suel.espera(setTimeout(function () {   // la unidad guardada y, al cambiarla, los textos de las fichas de parcela (33_ajustes.js va después de este módulo)
    function reescribe() { Array.prototype.forEach.call($("chips").children, function (b?: T) { var k2 = Number(b.getAttribute("data-k")); if (k2 >= 0 && parcelas[k2]) b.textContent = parcelas[k2].nombre + " · " + sup(parcelas[k2].ha) + (fincas.length > 1 && parcelas[k2].pasto ? " (pasto)" : ""); }); }
    reescribe();
    try { if (dp.Ajustes && dp.Ajustes.alCambiar) suel.quita(dp.Ajustes.alCambiar(function (k?: T) { if (!k || k === "vista.unidades") reescribe(); })); } catch (e: T) {}
  }, 0));
  // A3-7b1: libera() suelta las escuchas (chips fijos, selector de calidad), los nodos que creó, el aplazado de la unidad y la suscripción a Configuración, y vacía los chips de la finca elegida
  function libera() {
    suel.suelta(); din.splice(0).forEach(function (f?: T) { f(); });
    var cp: T = $("chips"); if (cp) while (cp.firstChild) cp.removeChild(cp.firstChild);
  }
  return { parcelas: parcelas, fincas: fincas, claseUsda: claseUsda, elegirParcela: elegirParcela, elegirFinca: elegirFinca, parcelaSel: function () { return parcelaSel; }, fincaSel: function () { return fincaSel; }, libera: libera };
}
export type Parcelas = ReturnType<typeof creaParcelas>;

/** El manifiesto del componente «selector-parcelas» (ADR-0023): solo ciclo de vida (sin fases). El objeto ya existe antes de que se monte (09, 12, 14 y 29 lo usan desde el arranque), así que monta()
 *  devuelve ese mismo objeto y libera() llama a su libera(). */
export function manifiestoParcelas(api: { libera(): void }): Manifiesto {
  return {
    id: ID_PARCELAS, version: 1, consume: ["Ajustes"], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: ["exterior"], dom: ["#ventanaMapa", "[data-abre=\"mapa\"]"],   // A3-8b: la ventana «Mapa y parcelas» (sus chips) y sus iconos, escondidos fuera del exterior
    monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
