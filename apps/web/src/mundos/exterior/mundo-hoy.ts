// El mundo de hoy (EV-3a; contratos/mundo-hoy.md, v 1; MU5-n, A3-7b1: antes apps/web/motor/53_mundo_hoy.js, que queda como talón): con servidor, el motor pide GET /api/mundo/hoy (su
// mismo origen; nunca otro host) al montar y cada 10 minutos, y lo enseña donde ya se consulta el día: la tarjeta «Hoy en el campo» en «Tiempo y estación → Ahora» (el día y la hora de
// Madrid, los avisos del campo, mañana según la previsión, la fenología anotada, el trabajo de la semana y qué fuente falta) y, al llegar, el primer aviso en el HUD (unos segundos).
// Es del EXTERIOR: habla de las parcelas de la finca (D.parcelas), de su previsión y de su trabajo de campo, y cuelga su tarjeta en el panel del tiempo del exterior. Componente
// «mundo-hoy» de los mundos ["exterior"], con un libera() que suelta de verdad: el reloj de 10 min, la petición en vuelo (AbortController), la tarjeta del DOM, y lo que llegue tarde no
// se pinta. Cada línea lleva su pastilla (medido / modelado / deducido) y de cuándo es el dato. Lo que llega es DATO: se valida y se pinta SIEMPRE con textContent, nunca como
// código de la página; las parcelas de OlivarTrack se nombran con el índice de la finca (D.parcelas) y, si no están, se dice el id. Vigía no autoriza tratamientos: la frase de sus
// avisos la pone la api (fija) y aquí no se añade nada. Sin servidor no se pide nada (ni un 404 en la consola). Presupuesto (regla 6): nada en la escena 3D (una tarjeta del DOM).
// Código movido tal cual (solo se tipan parámetros y variables), salvo L8-12: «Mañana» se busca por su fecha, no por su posición en la lista.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { T } from "../comun/tipos.ts";
import { HazasPuro } from "./hazas.ts";

export const ID_MUNDO_HOY = "mundo-hoy";

/** Lo que el talón de 53 le da: el índice de la finca (D), $ (getElementById) y, por getter (31_hud se monta antes pero se pide al usarlo), el HUD */
export interface DepsMundoHoy { D: T; $: (id: string) => T; readonly Hud: T }


  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/mundo_hoy.test.js)
export var MundoHoyPuro: T = (function () {
    var PILL: T = { medido: "p-medido", modelado: "p-modelo", deducido: "p-deducido" };
    var FUENTE: T = { olivartrack: "OlivarTrack", vigia: "Vigía", gemelo: "el gemelo" };
    var TIPOS: T = { recogida: 1, helada: 1, lluvia: 1, fenologia: 1, mirada: 1 };
    var DIA = /^\d{4}-\d{2}-\d{2}$/;
    function esObj(v?: T) { return !!v && typeof v === "object" && !Array.isArray(v); }
    function txt(v?: T, max?: T) { return typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max || 400) : null; }
    function fuenteOk(f?: T) { return esObj(f) && typeof f.encendida === "boolean" && typeof f.disponible === "boolean"; }
    // lo esencial del contrato (contratos/mundo-hoy.schema.json); lo demás se pinta con lo que haya. null si no vale
    function valida(j?: T) {
      if (!esObj(j) || j.version !== 1 || !esObj(j.ahora) || !DIA.test(String(j.ahora.fecha)) || !/^\d{2}:\d{2}$/.test(String(j.ahora.hora))) return null;
      if (!esObj(j.fuentes) || !fuenteOk(j.fuentes.olivartrack) || !fuenteOk(j.fuentes.vigia) || !Array.isArray(j.avisos) || !Array.isArray(j.notas)) return null;
      var avisos = j.avisos.filter(function (a?: T) { return esObj(a) && TIPOS[a.tipo] && txt(a.texto) && Array.isArray(a.parcelas); }).slice(0, 10);
      return { ahora: j.ahora, fuentes: j.fuentes, tiempo: esObj(j.tiempo) ? j.tiempo : null, fenologia: esObj(j.fenologia) ? j.fenologia : null,
        trabajoSemana: esObj(j.trabajoSemana) ? j.trabajoSemana : null, miradas: esObj(j.miradas) ? j.miradas : null, avisos: avisos,
        notas: j.notas.filter(function (n?: T) { return esObj(n) && txt(n.texto); }).slice(0, 20), completo: j.completo === true };
    }
    // GET <prefijo>mundo/hoy del mismo origen; nunca lanza: { ok, datos } o { ok: false, motivo }
    function lee(fetchFn?: T, prefijo?: T) {
      if (!prefijo || typeof fetchFn !== "function") return Promise.resolve({ ok: false, motivo: "sin_api" });
      return Promise.resolve().then(function () { return fetchFn(prefijo + "mundo/hoy", { credentials: "same-origin", headers: { accept: "application/json" } }); })
        .then(function (r?: T) {
          if (!r || r.status !== 200 || !r.json) return { ok: false, motivo: "http_" + (r ? r.status : 0) };
          return r.json().then(function (j?: T) { var v = valida(j); return v ? { ok: true, datos: v } : { ok: false, motivo: "contrato" }; });
        })
        .catch(function () { return { ok: false, motivo: "red" }; });
    }
    // «hace N min / h / días» desde un instante ISO (o «» si no hay)
    function haceTxt(iso?: T, ahora?: T) {
      var t = typeof iso === "string" ? Date.parse(iso) : NaN; if (!isFinite(t)) return "";
      var m = Math.max(1, Math.round((ahora - t) / 60000));
      return m < 90 ? "hace " + m + " min" : m < 36 * 60 ? "hace " + Math.round(m / 60) + " h" : "hace " + Math.round(m / 1440) + " días";
    }
    function fechaCorta(d?: T) { return typeof d === "string" && DIA.test(d) ? d.slice(8, 10) + "/" + d.slice(5, 7) : ""; }
    // el nombre de una parcela de OlivarTrack según el índice de la finca (D.parcelas: { id, nombre }); si no está, el id tal cual
    function nombre(id?: T, indice?: T) {
      var p = (indice || []).filter(function (x?: T) { return x && x.id === id; })[0];
      return txt(p && p.nombre, 80) || txt(id, 80) || "";
    }
    // L8-12: «mañana» es el día siguiente a r.ahora.fecha, buscado por su fecha (la api quita los días sin horas: dias[1] podía ser pasado mañana); sin él, no hay línea
    function diaDeManana(dias?: T, hoy?: T) {
      if (!DIA.test(String(hoy))) return null;
      var m = new Date(Date.parse(hoy + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
      return dias.filter(function (d?: T) { return d && d.fecha === m; })[0] || null;
    }
    function cifra(x?: T) { return typeof x === "number" && isFinite(x) ? String(Math.round(x * 10) / 10).replace(".", ",") : "—"; }
    // Las líneas de la ficha: { texto, pill (clase de procedencia o null), etiqueta, cuando, clase }. Todo texto: quien pinta usa textContent.
    function lineas(r?: T, ahora?: T, indice?: T) {
      var out: T = [], f = r.fuentes;
      r.avisos.forEach(function (a?: T) {
        var ps = a.parcelas.map(function (id?: T) { return a.tipo === "mirada" ? txt(id, 80) : nombre(id, indice); }).filter(Boolean);
        out.push({ texto: txt(a.texto) + (ps.length ? " " + (a.tipo === "mirada" ? "Parcelas según Vigía" : "Parcelas") + ": " + ps.slice(0, 8).join(", ") + (ps.length > 8 ? " y " + (ps.length - 8) + " más" : "") + "." : ""),
          pill: PILL.deducido, etiqueta: "deducido", clase: "aviso",
          cuando: "de " + FUENTE[a.de] + " (" + (a.basadoEn === "modelado" ? "previsión, modelado" : "registrado") + ")" + (haceTxt(a.consultadoEn, ahora) ? ", " + haceTxt(a.consultadoEn, ahora) : "") + (a.completo === false ? "; lectura incompleta" : "") });
      });
      var pc = r.tiempo && r.tiempo.previsionCorta, man = pc && Array.isArray(pc.dias) ? diaDeManana(pc.dias, r.ahora.fecha) : null;
      if (man) out.push({ texto: "Mañana (" + fechaCorta(man.fecha) + "): máx. " + cifra(man.tmax) + " °C · mín. " + cifra(man.tmin) + " °C · lluvia " + cifra(man.lluviaMm) + " mm" + (typeof man.probabilidadLluviaMax === "number" ? " (hasta el " + Math.round(man.probabilidadLluviaMax) + " %)" : "") + ".",
        pill: PILL.modelado, etiqueta: "modelado", clase: "", cuando: "previsión de Vigía" + (haceTxt(pc.consultadoEn, ahora) ? ", " + haceTxt(pc.consultadoEn, ahora) : "") });
      var fe = r.fenologia;
      if (fe && Array.isArray(fe.parcelas) && fe.parcelas.length) {
        var u = fe.parcelas.slice().sort(function (a?: T, b?: T) { return String(b.fecha).localeCompare(String(a.fecha)); })[0];
        out.push({ texto: "Fenología anotada en " + fe.parcelas.length + (fe.parcelas.length === 1 ? " parcela" : " parcelas") + "; la última, " + txt(u.etapa, 60) + " (BBCH " + u.bbch + ") el " + fechaCorta(u.fecha) + " en " + nombre(u.parcela, indice) + ".",
          pill: PILL.medido, etiqueta: "medido", clase: "", cuando: "de OlivarTrack" + (haceTxt(fe.consultadoEn || fe.leidoEn, ahora) ? ", " + haceTxt(fe.consultadoEn || fe.leidoEn, ahora) : "") + (fe.completo ? "" : "; lectura incompleta") });
      }
      var w = r.trabajoSemana;
      if (w && Array.isArray(w.porFinca)) {
        var sabe = w.porFinca.every(function (x?: T) { return typeof x.enCurso === "number" && typeof x.hechas === "number"; });
        var c = 0, h = 0; w.porFinca.forEach(function (x?: T) { c += x.enCurso || 0; h += x.hechas || 0; });
        out.push({ texto: !w.porFinca.length ? "Esta semana no hay trabajo anotado en OlivarTrack." : sabe ? "Esta semana en el campo: " + c + (c === 1 ? " tarea en curso" : " tareas en curso") + " y " + h + (h === 1 ? " terminada" : " terminadas") + " (por parcela y tipo, nunca por persona)."
          : "Esta semana hay trabajo anotado en el campo, pero OlivarTrack avisa de que la lista no está completa: no se dan totales.",
          pill: PILL.medido, etiqueta: "medido", clase: "", cuando: "de OlivarTrack" + (haceTxt(w.consultadoEn || w.leidoEn, ahora) ? ", " + haceTxt(w.consultadoEn || w.leidoEn, ahora) : "") });
      }
      ["olivartrack", "vigia"].forEach(function (k?: T) {
        var x = f[k]; if (x.disponible) return;
        out.push({ texto: FUENTE[k] + (x.encendida ? ": no ha respondido y no hay una lectura reciente." : ": este servidor no lo lee ahora."), pill: null, etiqueta: "", clase: "falta", cuando: "" });
      });
      r.notas.slice(0, 5).forEach(function (n?: T) { out.push({ texto: txt(n.texto), pill: null, etiqueta: "", clase: "nota", cuando: FUENTE[n.de] ? "lo dice " + FUENTE[n.de] : "" }); });
      return out;
    }
    function cabecera(r?: T) {
      var a = r.ahora, d = String(a.fecha);
      return "Hoy, " + d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) + " · " + a.hora + " en la finca (hora de Madrid) · " + (txt(a.estacionDelAnio, 20) || "");
    }
    // lo que sale en el HUD al llegar: el primer aviso, tal cual (o null)
    function hud(r?: T) { return r.avisos.length ? txt(r.avisos[0].texto, 200) : null; }
    // «Hoy en el olivar» del tablón de La Linde (EV-3c, 44b_carteles.js): UNA línea corta { txt, de, cuando } con el trabajo de la semana agregado por tipo (nunca por persona ni por
    // parcela) o, si no hay, el aviso principal del campo (su titular fijo, nunca el texto de la api). null si la lectura no está completa o no hay nada que decir: entonces no se pinta.
    var TITULAR: T = { recogida: "Hoy se recoge", helada: "Puede helar mañana", lluvia: "Lluvia en la previsión", fenologia: "Fenología anotada" };
    function tablon(r?: T) {
      if (!r || r.completo !== true) return null;
      var w = r.trabajoSemana;
      if (w && w.completo === true && Array.isArray(w.porParcela)) {
        var por: T = {}, ok = true;
        w.porParcela.forEach(function (p?: T) {
          [p && p.enCurso, p && p.hechas].forEach(function (lst?: T) {
            if (!Array.isArray(lst)) { ok = false; return; }
            lst.forEach(function (x?: T) { var t = esObj(x) ? txt(x.tipo, 14) : null; if (!t || typeof x.n !== "number" || !isFinite(x.n) || x.n < 0) { ok = false; return; } por[t] = (por[t] || 0) + x.n; });
          });
        });
        var ks = Object.keys(por).filter(function (k?: T) { return por[k] > 0; }).sort(function (a?: T, b?: T) { return por[b] - por[a] || (a < b ? -1 : 1); }), tot = 0;
        ks.forEach(function (k?: T) { tot += por[k]; });
        if (ok && tot > 0) {
          var t = "Semana: " + ks.map(function (k?: T) { return k + " " + por[k]; }).join(", ");   // si no caben todos los tipos en el lienzo, el total (no se enseña un trozo como si fuera todo)
          if (t.length > 23) t = "Semana: " + tot + (tot === 1 ? " tarea" : " tareas");
          return { txt: t, de: "OlivarTrack", cuando: typeof (w.consultadoEn || w.leidoEn) === "string" ? (w.consultadoEn || w.leidoEn) : null };
        }
      }
      var a = r.avisos.filter(function (x?: T) { return TITULAR[x.tipo] && x.completo !== false && FUENTE[x.de]; })[0];
      return a ? { txt: TITULAR[a.tipo], de: FUENTE[a.de], cuando: typeof a.consultadoEn === "string" ? a.consultadoEn : null } : null;
    }
    // F4b/W1 (54_trabajo_hoy.js): los ids de las parcelas con alguna tarea EN CURSO (nunca quién ni cuántas personas), solo con la lectura completa; null si no hay ninguna o no se sabe
    function trabajo(r?: T) {
      var w = r && r.completo === true ? r.trabajoSemana : null;
      if (!w || w.completo !== true || !Array.isArray(w.porParcela)) return null;
      var ids: T = [];
      w.porParcela.forEach(function (p?: T) {
        if (!esObj(p) || typeof p.parcela !== "string" || !Array.isArray(p.enCurso)) return;
        var n = 0; p.enCurso.forEach(function (x?: T) { if (esObj(x) && typeof x.n === "number" && isFinite(x.n) && x.n > 0) n += x.n; });
        if (n > 0 && ids.indexOf(p.parcela) < 0) ids.push(p.parcela);
      });
      return ids.length ? { parcelas: ids, cuando: typeof (w.consultadoEn || w.leidoEn) === "string" ? (w.consultadoEn || w.leidoEn) : null } : null;
    }
    return { valida: valida, lee: lee, haceTxt: haceTxt, nombre: nombre, lineas: lineas, cabecera: cabecera, hud: hud, tablon: tablon, trabajo: trabajo };
  })();
  // [puro:fin]

export function manifiestoMundoHoy(dp: DepsMundoHoy): Manifiesto {
  var D: T = dp.D, $ = dp.$;

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/mundo_hoy.test.js con un DOM y un fetch de mentira)
  function MundoHoyMotor(n?: T) {
    var P = MundoHoyPuro, API = HazasPuro.prefijoApi(location.search, D.base);
    var vivo = true, reloj: T = null, art: T = null, ultimo: T = null, avisado = false, ctl = new AbortController();   // A3-7b1: libera() corta la petición en vuelo
    // la misma fetch de la ventana, con la señal de este montaje (HazasPuro.lee la pide como función)
    function traer(url?: T, op?: T) { return window.fetch(url, Object.assign({}, op, { signal: ctl.signal })); }
    if (!API) return { libera: function () {}, estado: function () { return { datos: null, motivo: "sin_api" }; } };
    function el(tag?: T, clase?: T, texto?: T) { var e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }
    function pinta(r?: T) {
      while (art.firstChild) art.removeChild(art.firstChild);
      var h = el("h3", null, "Hoy en el campo ");
      h.appendChild(el("span", "t-pill", r.completo ? "al día" : "en parte"));
      art.appendChild(h);
      art.appendChild(el("p", "t-sub", P.cabecera(r)));
      var ul = el("ul", "t-avisos");
      P.lineas(r, Date.now(), D.parcelas).forEach(function (l?: T) {
        var li = el("li", l.clase ? "hoy-" + l.clase : null);
        if (l.pill) { li.appendChild(el("span", "pill " + l.pill, l.etiqueta)); li.appendChild(document.createTextNode(" ")); }
        li.appendChild(document.createTextNode(l.texto));
        if (l.cuando) { li.appendChild(document.createTextNode(" ")); li.appendChild(el("small", null, "(" + l.cuando + ")")); }
        ul.appendChild(li);
      });
      art.appendChild(ul);
      art.appendChild(el("p", "t-sub", "Los avisos los redacta el gemelo a partir de OlivarTrack y Vigía. Lo que marca Vigía sirve para decidir dónde mirar; no autoriza tratamientos."));
      art.hidden = false;
    }
    function lee() {
      P.lee(typeof window.fetch === "function" ? traer : null, API).then(function (x?: T) {
        if (!vivo) return;
        if (!x.ok) { if (!ultimo) art.hidden = true; return; }   // sin sesión o la api no contesta: no se enseña nada (y se queda lo último)
        ultimo = x.datos; pinta(x.datos);
        if (n && n.emite) n.emite("mundo:hoy", { linea: P.tablon(x.datos), trabajo: P.trabajo(x.datos) });   // EV-3c: el tablón de la entrada (44b_carteles.js) pinta esta línea; null = nada que decir
        var t = P.hud(x.datos);
        if (t && !avisado && typeof dp.Hud !== "undefined" && dp.Hud.aviso) { avisado = true; dp.Hud.aviso(t, 6000); }
      });
    }
    art = el("article", "t-card"); art.id = "tHoyCampo"; art.setAttribute("aria-label", "Hoy en el campo"); art.hidden = true;
    var caja = $("tPanAhora"), est = $("tEst");
    if (caja) caja.insertBefore(art, est && est.parentNode === caja ? est : null);
    lee();
    reloj = setInterval(lee, 10 * 60000);   // la api guarda lo de fuera (de 10 min a 1 h): pedirle cada 10 min no llega a las fuentes más a menudo
    return {
      libera: function () { vivo = false; ctl.abort(); clearInterval(reloj); if (art && art.parentNode) art.parentNode.removeChild(art); },
      estado: function () { return { datos: ultimo, visible: !!art && !art.hidden }; }
    };
  }
  // [motor:fin]

  return {
    id: "mundo-hoy", version: 1,   // el id literal: lo lee el guardián de 53
    consume: ["HazasPuro", "Hud"],
    expone: [],
    eventos: { escucha: [], emite: ["mundo:hoy"] },
    bandera: { defecto: true, url: "mundohoy" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // DOM: una tarjeta en Tiempo y estación; nada en la escena 3D
    mundos: ["exterior"],
    monta: function (n?: T) { return MundoHoyMotor(n); },
    libera: function (api?: T) { if (api) (api as { libera(): void }).libera(); }
  };
}
