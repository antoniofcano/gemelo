// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02c_componentes (Componentes), 03_escena (lienzo), 12_paseo (persona), 13_parcelas (parcelas), 13b_hazas (HazasPuro),
//   14_historia (marca, lista, aviso), 15_tiempo (lluvia, hace), 29_vr (ficha), 31_hud (Hud)
// Nota: Componente «mundo-hoy» (EV-3a, contratos/mundo-hoy.md): solo se registra; nadie lo nombra. Con D.base /teselas/… o ?api= pide GET /api/mundo/hoy (mismo origen) al montar y cada 10 min y pinta la tarjeta «Hoy en el campo» en Tiempo y estación → Ahora (textContent) y el primer aviso en el HUD; sin servidor no pide nada. De lo que la derivación cree que consume, solo D, $, Componentes, HazasPuro y Hud son usos: persona, parcelas, marca, lista, aviso, lluvia, hace y ficha son palabras de sus textos. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/mundo_hoy.test.js.
// ===============================================================================
  // ---------- el mundo de hoy (EV-3a; contratos/mundo-hoy.md, v 1): con servidor, el motor pide GET /api/mundo/hoy (su mismo origen; nunca otro host) al montar
  // y cada 10 minutos, y lo enseña donde ya se consulta el día: la tarjeta «Hoy en el campo» en «Tiempo y estación → Ahora» (el día y la hora de Madrid, los avisos
  // del campo, mañana según la previsión, la fenología anotada, el trabajo de la semana y qué fuente falta) y, al llegar, el primer aviso en el HUD (unos segundos).
  // Cada línea lleva su pastilla (medido / modelado / deducido) y de cuándo es el dato. Lo que llega es DATO: se valida y se pinta SIEMPRE con textContent, nunca
  // como HTML; las parcelas de OlivarTrack se nombran con el índice de la finca (D.parcelas) y, si no están, se dice el id. Vigía no autoriza tratamientos: la
  // frase de sus avisos la pone la api (fija) y aquí no se añade nada. Sin servidor no se pide nada (ni un 404 en la consola); la api responde siempre 200 y, con
  // las fuentes apagadas, la ficha lo dice. El reloj del mundo ya arranca en la hora real (15_tiempo.js) y la estación del olivo en el día de hoy (23_estacion.js).
  // Presupuesto (regla 6): nada en la escena 3D (DOM: una tarjeta). Sin geometría, sin texturas, sin llamadas de dibujo.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/mundo_hoy.test.js)
  var MundoHoyPuro = (function () {
    var PILL = { medido: "p-medido", modelado: "p-modelo", deducido: "p-deducido" };
    var FUENTE = { olivartrack: "OlivarTrack", vigia: "Vigía", gemelo: "el gemelo" };
    var TIPOS = { recogida: 1, helada: 1, lluvia: 1, fenologia: 1, mirada: 1 };
    var DIA = /^\d{4}-\d{2}-\d{2}$/;
    function esObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
    function txt(v, max) { return typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max || 400) : null; }
    function fuenteOk(f) { return esObj(f) && typeof f.encendida === "boolean" && typeof f.disponible === "boolean"; }
    // lo esencial del contrato (contratos/mundo-hoy.schema.json); lo demás se pinta con lo que haya. null si no vale
    function valida(j) {
      if (!esObj(j) || j.version !== 1 || !esObj(j.ahora) || !DIA.test(String(j.ahora.fecha)) || !/^\d{2}:\d{2}$/.test(String(j.ahora.hora))) return null;
      if (!esObj(j.fuentes) || !fuenteOk(j.fuentes.olivartrack) || !fuenteOk(j.fuentes.vigia) || !Array.isArray(j.avisos) || !Array.isArray(j.notas)) return null;
      var avisos = j.avisos.filter(function (a) { return esObj(a) && TIPOS[a.tipo] && txt(a.texto) && Array.isArray(a.parcelas); }).slice(0, 10);
      return { ahora: j.ahora, fuentes: j.fuentes, tiempo: esObj(j.tiempo) ? j.tiempo : null, fenologia: esObj(j.fenologia) ? j.fenologia : null,
        trabajoSemana: esObj(j.trabajoSemana) ? j.trabajoSemana : null, miradas: esObj(j.miradas) ? j.miradas : null, avisos: avisos,
        notas: j.notas.filter(function (n) { return esObj(n) && txt(n.texto); }).slice(0, 20), completo: j.completo === true };
    }
    // GET <prefijo>mundo/hoy del mismo origen; nunca lanza: { ok, datos } o { ok: false, motivo }
    function lee(fetchFn, prefijo) {
      if (!prefijo || typeof fetchFn !== "function") return Promise.resolve({ ok: false, motivo: "sin_api" });
      return Promise.resolve().then(function () { return fetchFn(prefijo + "mundo/hoy", { credentials: "same-origin", headers: { accept: "application/json" } }); })
        .then(function (r) {
          if (!r || r.status !== 200 || !r.json) return { ok: false, motivo: "http_" + (r ? r.status : 0) };
          return r.json().then(function (j) { var v = valida(j); return v ? { ok: true, datos: v } : { ok: false, motivo: "contrato" }; });
        })
        .catch(function () { return { ok: false, motivo: "red" }; });
    }
    // «hace N min / h / días» desde un instante ISO (o «» si no hay)
    function haceTxt(iso, ahora) {
      var t = typeof iso === "string" ? Date.parse(iso) : NaN; if (!isFinite(t)) return "";
      var m = Math.max(1, Math.round((ahora - t) / 60000));
      return m < 90 ? "hace " + m + " min" : m < 36 * 60 ? "hace " + Math.round(m / 60) + " h" : "hace " + Math.round(m / 1440) + " días";
    }
    function fechaCorta(d) { return typeof d === "string" && DIA.test(d) ? d.slice(8, 10) + "/" + d.slice(5, 7) : ""; }
    // el nombre de una parcela de OlivarTrack según el índice de la finca (D.parcelas: { id, nombre }); si no está, el id tal cual
    function nombre(id, indice) {
      var p = (indice || []).filter(function (x) { return x && x.id === id; })[0];
      return txt(p && p.nombre, 80) || txt(id, 80) || "";
    }
    function cifra(x) { return typeof x === "number" && isFinite(x) ? String(Math.round(x * 10) / 10).replace(".", ",") : "—"; }
    // Las líneas de la ficha: { texto, pill (clase de procedencia o null), etiqueta, cuando, clase }. Todo texto: quien pinta usa textContent.
    function lineas(r, ahora, indice) {
      var out = [], f = r.fuentes;
      r.avisos.forEach(function (a) {
        var ps = a.parcelas.map(function (id) { return a.tipo === "mirada" ? txt(id, 80) : nombre(id, indice); }).filter(Boolean);
        out.push({ texto: txt(a.texto) + (ps.length ? " " + (a.tipo === "mirada" ? "Parcelas según Vigía" : "Parcelas") + ": " + ps.slice(0, 8).join(", ") + (ps.length > 8 ? " y " + (ps.length - 8) + " más" : "") + "." : ""),
          pill: PILL.deducido, etiqueta: "deducido", clase: "aviso",
          cuando: "de " + FUENTE[a.de] + " (" + (a.basadoEn === "modelado" ? "previsión, modelado" : "registrado") + ")" + (haceTxt(a.consultadoEn, ahora) ? ", " + haceTxt(a.consultadoEn, ahora) : "") + (a.completo === false ? "; lectura incompleta" : "") });
      });
      var pc = r.tiempo && r.tiempo.previsionCorta, man = pc && Array.isArray(pc.dias) ? pc.dias[1] || null : null;
      if (man) out.push({ texto: "Mañana (" + fechaCorta(man.fecha) + "): máx. " + cifra(man.tmax) + " °C · mín. " + cifra(man.tmin) + " °C · lluvia " + cifra(man.lluviaMm) + " mm" + (typeof man.probabilidadLluviaMax === "number" ? " (hasta el " + Math.round(man.probabilidadLluviaMax) + " %)" : "") + ".",
        pill: PILL.modelado, etiqueta: "modelado", clase: "", cuando: "previsión de Vigía" + (haceTxt(pc.consultadoEn, ahora) ? ", " + haceTxt(pc.consultadoEn, ahora) : "") });
      var fe = r.fenologia;
      if (fe && Array.isArray(fe.parcelas) && fe.parcelas.length) {
        var u = fe.parcelas.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); })[0];
        out.push({ texto: "Fenología anotada en " + fe.parcelas.length + (fe.parcelas.length === 1 ? " parcela" : " parcelas") + "; la última, " + txt(u.etapa, 60) + " (BBCH " + u.bbch + ") el " + fechaCorta(u.fecha) + " en " + nombre(u.parcela, indice) + ".",
          pill: PILL.medido, etiqueta: "medido", clase: "", cuando: "de OlivarTrack" + (haceTxt(fe.consultadoEn || fe.leidoEn, ahora) ? ", " + haceTxt(fe.consultadoEn || fe.leidoEn, ahora) : "") + (fe.completo ? "" : "; lectura incompleta") });
      }
      var w = r.trabajoSemana;
      if (w && Array.isArray(w.porFinca)) {
        var sabe = w.porFinca.every(function (x) { return typeof x.enCurso === "number" && typeof x.hechas === "number"; });
        var c = 0, h = 0; w.porFinca.forEach(function (x) { c += x.enCurso || 0; h += x.hechas || 0; });
        out.push({ texto: !w.porFinca.length ? "Esta semana no hay trabajo anotado en OlivarTrack." : sabe ? "Esta semana en el campo: " + c + (c === 1 ? " tarea en curso" : " tareas en curso") + " y " + h + (h === 1 ? " terminada" : " terminadas") + " (por parcela y tipo, nunca por persona)."
          : "Esta semana hay trabajo anotado en el campo, pero OlivarTrack avisa de que la lista no está completa: no se dan totales.",
          pill: PILL.medido, etiqueta: "medido", clase: "", cuando: "de OlivarTrack" + (haceTxt(w.consultadoEn || w.leidoEn, ahora) ? ", " + haceTxt(w.consultadoEn || w.leidoEn, ahora) : "") });
      }
      ["olivartrack", "vigia"].forEach(function (k) {
        var x = f[k]; if (x.disponible) return;
        out.push({ texto: FUENTE[k] + (x.encendida ? ": no ha respondido y no hay una lectura reciente." : ": este servidor no lo lee ahora."), pill: null, etiqueta: "", clase: "falta", cuando: "" });
      });
      r.notas.slice(0, 5).forEach(function (n) { out.push({ texto: txt(n.texto), pill: null, etiqueta: "", clase: "nota", cuando: FUENTE[n.de] ? "lo dice " + FUENTE[n.de] : "" }); });
      return out;
    }
    function cabecera(r) {
      var a = r.ahora, d = String(a.fecha);
      return "Hoy, " + d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) + " · " + a.hora + " en la finca (hora de Madrid) · " + (txt(a.estacionDelAnio, 20) || "");
    }
    // lo que sale en el HUD al llegar: el primer aviso, tal cual (o null)
    function hud(r) { return r.avisos.length ? txt(r.avisos[0].texto, 200) : null; }
    // «Hoy en el olivar» del tablón de La Linde (EV-3c, 44b_carteles.js): UNA línea corta { txt, de, cuando } con el trabajo de la semana agregado por tipo (nunca por persona ni por
    // parcela) o, si no hay, el aviso principal del campo (su titular fijo, nunca el texto de la api). null si la lectura no está completa o no hay nada que decir: entonces no se pinta.
    var TITULAR = { recogida: "Hoy se recoge", helada: "Puede helar mañana", lluvia: "Lluvia en la previsión", fenologia: "Fenología anotada" };
    function tablon(r) {
      if (!r || r.completo !== true) return null;
      var w = r.trabajoSemana;
      if (w && w.completo === true && Array.isArray(w.porParcela)) {
        var por = {}, ok = true;
        w.porParcela.forEach(function (p) {
          [p && p.enCurso, p && p.hechas].forEach(function (lst) {
            if (!Array.isArray(lst)) { ok = false; return; }
            lst.forEach(function (x) { var t = esObj(x) ? txt(x.tipo, 14) : null; if (!t || typeof x.n !== "number" || !isFinite(x.n) || x.n < 0) { ok = false; return; } por[t] = (por[t] || 0) + x.n; });
          });
        });
        var ks = Object.keys(por).filter(function (k) { return por[k] > 0; }).sort(function (a, b) { return por[b] - por[a] || (a < b ? -1 : 1); }), tot = 0;
        ks.forEach(function (k) { tot += por[k]; });
        if (ok && tot > 0) {
          var t = "Semana: " + ks.map(function (k) { return k + " " + por[k]; }).join(", ");   // si no caben todos los tipos en el lienzo, el total (no se enseña un trozo como si fuera todo)
          if (t.length > 23) t = "Semana: " + tot + (tot === 1 ? " tarea" : " tareas");
          return { txt: t, de: "OlivarTrack", cuando: typeof (w.consultadoEn || w.leidoEn) === "string" ? (w.consultadoEn || w.leidoEn) : null };
        }
      }
      var a = r.avisos.filter(function (x) { return TITULAR[x.tipo] && x.completo !== false && FUENTE[x.de]; })[0];
      return a ? { txt: TITULAR[a.tipo], de: FUENTE[a.de], cuando: typeof a.consultadoEn === "string" ? a.consultadoEn : null } : null;
    }
    return { valida: valida, lee: lee, haceTxt: haceTxt, nombre: nombre, lineas: lineas, cabecera: cabecera, hud: hud, tablon: tablon };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/mundo_hoy.test.js con un DOM y un fetch de mentira)
  function MundoHoyMotor(n) {
    var P = MundoHoyPuro, API = HazasPuro.prefijoApi(location.search, D.base);
    var vivo = true, reloj = null, art = null, ultimo = null, avisado = false;
    if (!API) return { libera: function () {}, estado: function () { return { datos: null, motivo: "sin_api" }; } };
    function el(tag, clase, texto) { var e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }
    function pinta(r) {
      while (art.firstChild) art.removeChild(art.firstChild);
      var h = el("h3", null, "Hoy en el campo ");
      h.appendChild(el("span", "t-pill", r.completo ? "al día" : "en parte"));
      art.appendChild(h);
      art.appendChild(el("p", "t-sub", P.cabecera(r)));
      var ul = el("ul", "t-avisos");
      P.lineas(r, Date.now(), D.parcelas).forEach(function (l) {
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
      P.lee(window.fetch ? window.fetch.bind(window) : null, API).then(function (x) {
        if (!vivo) return;
        if (!x.ok) { if (!ultimo) art.hidden = true; return; }   // sin sesión o la api no contesta: no se enseña nada (y se queda lo último)
        ultimo = x.datos; pinta(x.datos);
        if (n && n.emite) n.emite("mundo:hoy", { linea: P.tablon(x.datos) });   // EV-3c: el tablón de la entrada (44b_carteles.js) pinta esta línea; null = nada que decir
        var t = P.hud(x.datos);
        if (t && !avisado && typeof Hud !== "undefined" && Hud.aviso) { avisado = true; Hud.aviso(t, 6000); }
      });
    }
    art = el("article", "t-card"); art.id = "tHoyCampo"; art.setAttribute("aria-label", "Hoy en el campo"); art.hidden = true;
    var caja = $("tPanAhora"), est = $("tEst");
    if (caja) caja.insertBefore(art, est && est.parentNode === caja ? est : null);
    lee();
    reloj = setInterval(lee, 10 * 60000);   // la api guarda lo de fuera (de 10 min a 1 h): pedirle cada 10 min no llega a las fuentes más a menudo
    return {
      libera: function () { vivo = false; clearInterval(reloj); if (art && art.parentNode) art.parentNode.removeChild(art); },
      estado: function () { return { datos: ultimo, visible: !!art && !art.hidden }; }
    };
  }
  // [motor:fin]

  Componentes.registra({
    id: "mundo-hoy", version: 1,
    consume: ["HazasPuro", "Hud"],
    expone: [],
    eventos: { escucha: [], emite: ["mundo:hoy"] },
    bandera: { defecto: true, url: "mundohoy" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // DOM: una tarjeta en Tiempo y estación; nada en la escena 3D
    monta: function (n) { return MundoHoyMotor(n); },
    libera: function (api) { if (api) api.libera(); }
  });
