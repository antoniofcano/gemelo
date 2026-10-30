// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02_mundo (Mundo), 02c_componentes (ConfigPuro, Componentes), 03_escena (lienzo, modo), 12_paseo (persona),
//   14_historia (lista), 29_vr (panel, PanelVR), 31_hud (Hud), 32_ventanas (Ventanas)
// Nota: Componente «agenda» (OF11c, ADR-0023; decisiones 145-148): la agenda de la finca dentro del mundo. Solo se registra; nadie lo nombra. Montado (solo con servidor): icono y ventana «Agenda» con los próximos eventos, plazas libres, tu estado (apuntados / en espera) y, solo si la api dice puede_inscribirse, apuntarse o borrarse con el número de personas (1-10); en VR, una fila en la pestaña Mundo del panel que lista los próximos y dice «Apúntate desde el móvil o el ordenador» (nadie se apunta desde las gafas). Todo lo de la api es dato: lista blanca y textContent / fillText. Publica window.__agenda (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/agenda_mundo.test.js.
// ===============================================================================
  // ---------- la agenda dentro del mundo (OF11c; decisiones 145-148, doc/sistema/OFICINA.md §7): los próximos eventos de la finca, con sus plazas, tu estado
  // (apuntados / en espera) y, solo para la titular con su enlace, apuntarse o borrarse con el número de personas (1 a 10). La api ya existe (OF11/OF11b):
  // GET /api/agenda, POST y DELETE /api/agenda/:id/inscripcion (contratos/api.openapi.yaml); aquí no se decide nada, solo se enseña y se pide. Una sesión de gafas
  // vinculadas llega con `puede_inscribirse: false` y la api rechaza (403 solo_titular) cualquier intento: el cliente además no ofrece el botón.
  // Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. ?agenda=0 o la configuración del servidor lo apagan: sin icono, sin ventana, sin fila en VR.
  // Sin servidor (sin D.base /teselas/… ni ?api=) no se monta nada: no hay agenda que enseñar. Lo que llega de la api es dato: se valida con lista blanca y se
  // pinta SIEMPRE como texto (textContent y fillText), nunca como HTML.
  // En VR (decisión 146): una fila «Agenda» en la pestaña Mundo del panel con los próximos (fecha, título, plazas) y la frase «Apúntate desde el móvil o el
  // ordenador»: en VR no se apunta nadie, ni siquiera la titular (el panel no tiene teclado ni selector cómodo, y el enlace de gafas no es el de la titular).
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/agenda_mundo.test.js)
  var AgendaPuro = (function () {
    var MAX_EVENTOS = 50, MAX_PERSONAS = 10, TEXTO_VR = "Apúntate desde el móvil o el ordenador";
    var DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
    var TIPOS = { guiada: "Visita guiada", libre: "Visita libre", recoleccion: "Cosecha abierta", cata: "Cata", taller: "Taller", directo: "Directo", evento: "Evento" };
    function dos(n) { return ("0" + n).slice(-2); }
    function corta(s, max) { var c = Array.from(String(s)); return c.length > max ? c.slice(0, max - 1).join("").trim() + "…" : String(s); }
    function rutaAgenda(prefijo) { return prefijo ? prefijo + "agenda" : null; }
    function rutaInscripcion(prefijo, id) { return prefijo && Number.isInteger(id) && id >= 1 ? prefijo + "agenda/" + id + "/inscripcion" : null; }
    // número de personas del selector: entero de 1 a 10, o null
    function personas(v) { var n = /^\d{1,2}$/.test(String(v)) ? Number(v) : NaN; return Number.isInteger(n) && n >= 1 && n <= MAX_PERSONAS ? n : null; }
    // la respuesta de GET /api/agenda con lista blanca → { puede, eventos: [{ id, titulo, tipo, lugar, haza, descripcion, presencial, empieza (ms), plazas, libres,
    // abierta, mia: { estado, personas } | null }] } o null si no es lo esperado. Lo que no cuadra, fuera; lo de más (guía, creador…) no pasa.
    function valida(j) {
      if (!j || typeof j !== "object" || typeof j.puede_inscribirse !== "boolean" || !Array.isArray(j.eventos)) return null;
      var ev = [], vistos = {};
      for (var i = 0; i < j.eventos.length && ev.length < MAX_EVENTOS; i++) {
        var e = j.eventos[i]; if (!e || typeof e !== "object") continue;
        var t = typeof e.empieza_en === "string" ? Date.parse(e.empieza_en) : NaN;
        if (!Number.isInteger(e.id) || e.id < 1 || vistos[e.id] || typeof e.titulo !== "string" || !e.titulo.trim() || !isFinite(t)) continue;
        var plazas = e.plazas === null || e.plazas === undefined ? null : (Number.isInteger(e.plazas) && e.plazas >= 1 ? e.plazas : undefined);
        var libres = e.plazas_libres === null || e.plazas_libres === undefined ? null : (Number.isInteger(e.plazas_libres) && e.plazas_libres >= 0 ? e.plazas_libres : undefined);
        if (plazas === undefined || libres === undefined) continue;
        var mia = null;
        if (e.mia) { if ((e.mia.estado !== "apuntado" && e.mia.estado !== "en_espera") || personas(e.mia.personas) === null) continue; mia = { estado: e.mia.estado, personas: e.mia.personas }; }
        vistos[e.id] = true;
        ev.push({ id: e.id, titulo: corta(e.titulo.trim(), 120), tipo: Object.prototype.hasOwnProperty.call(TIPOS, e.tipo) ? e.tipo : "evento",
          lugar: typeof e.lugar === "string" && e.lugar.trim() ? corta(e.lugar.trim(), 120) : null, haza: typeof e.haza === "string" ? corta(e.haza, 20) : null,
          descripcion: typeof e.descripcion === "string" && e.descripcion.trim() ? corta(e.descripcion.trim(), 600) : null, presencial: e.presencial === true,
          empieza: t, plazas: plazas, libres: libres, abierta: e.inscripcion_abierta === true, mia: mia });
      }
      ev.sort(function (a, b) { return a.empieza - b.empieza || a.id - b.id; });
      return { puede: j.puede_inscribirse, eventos: ev };
    }
    // los que aún no han empezado (la lista puede haber envejecido desde que se pidió)
    function proximos(eventos, ahora) { return eventos.filter(function (e) { return e.empieza > ahora; }); }
    // «sáb 02/11, 18:30» en la hora del aparato
    function cuando(ms) { var d = new Date(ms); return DIAS[d.getDay()] + " " + dos(d.getDate()) + "/" + dos(d.getMonth() + 1) + ", " + dos(d.getHours()) + ":" + dos(d.getMinutes()); }
    function textoTipo(e) { return TIPOS[e.tipo] + (e.presencial ? " · presencial" : " · en el mundo"); }
    function textoPlazas(e) {
      if (e.plazas === null) return "Sin aforo";
      if (e.libres === 0) return "Completo: se apunta a la lista de espera";
      return e.libres === 1 ? "Queda 1 plaza" : "Quedan " + e.libres + " plazas";
    }
    function textoMia(m) {
      if (!m) return "";
      var p = m.personas + (m.personas === 1 ? " persona" : " personas");
      return m.estado === "apuntado" ? "Estáis apuntados (" + p + ")" : "En lista de espera (" + p + ")";
    }
    // qué se ofrece en una tarjeta (solo la titular con su enlace)
    function ofrece(e, puede) { return { apuntar: !!puede && e.abierta && !e.mia, borrar: !!puede && !!e.mia }; }
    // el texto de un fallo al apuntar o borrar: el de la api si lo trae (ya es una frase para la persona), si no uno por código
    function textoError(status, cuerpo) {
      var m = cuerpo && typeof cuerpo === "object" && typeof cuerpo.mensaje === "string" && cuerpo.mensaje.trim() ? corta(cuerpo.mensaje.trim(), 240) : null;
      if (m) return m;
      if (status === 401) return "Tu sesión ha caducado. Vuelve a entrar con tu enlace.";
      if (status === 403) return "Solo la titular, con su enlace, puede apuntar a la familia.";
      if (status === 404) return "Ese evento ya no está.";
      if (status === 409) return "La inscripción de este evento está cerrada o ya estabais apuntados.";
      if (status === 429) return "Demasiados intentos seguidos. Espera un poco.";
      return "No se ha podido hacer. Prueba otra vez en un rato.";
    }
    // lo que se pinta en la lámina del panel VR: como mucho `max` próximos, con su fecha, título y plazas; nada de botones
    function filasVR(datos, ahora, max) {
      if (!datos) return null;
      var l = proximos(datos.eventos, ahora).slice(0, max).map(function (e) {
        return { t: cuando(e.empieza) + " · " + e.titulo, s: textoPlazas(e) + (e.mia ? " · " + textoMia(e.mia) : "") };
      });
      return { filas: l, vacia: !l.length, nota: TEXTO_VR };
    }
    return { MAX_PERSONAS: MAX_PERSONAS, TEXTO_VR: TEXTO_VR, rutaAgenda: rutaAgenda, rutaInscripcion: rutaInscripcion, personas: personas, valida: valida, proximos: proximos, cuando: cuando,
      textoTipo: textoTipo, textoPlazas: textoPlazas, textoMia: textoMia, ofrece: ofrece, textoError: textoError, filasVR: filasVR };
  })();
  // [puro:fin]

  function AgendaMotor(n) {
    var AP = AgendaPuro, prefijo = ConfigPuro.prefijoApi(location.search, D && D.base);
    if (!prefijo || typeof fetch !== "function") return null;   // sin servidor no hay agenda: ni icono ni ventana
    var datos = null, estado = "sin-pedir", cuerpo = null, nota = "", pidiendo = null, hechas = 0, enVuelo = false;

    function el(tag, css, txt) { var x = document.createElement(tag); if (css) x.style.cssText = css; if (txt != null) x.textContent = txt; return x; }
    var BOTON = "min-height:44px;min-width:44px;padding:0 14px;border-radius:10px;border:1px solid currentColor;background:rgba(255,255,255,0.12);color:inherit;font:600 15px system-ui,sans-serif;cursor:pointer";
    function parse(r) { return r.json().then(function (j) { return j; }, function () { return null; }); }

    // pide la agenda (si ya hay una petición en vuelo, reusa esa); sin sesión, sin red o con una respuesta rara, estado «error»/«sin-sesion» y no se rompe nada
    function carga() {
      if (pidiendo) return pidiendo;
      estado = datos ? estado : "cargando"; pinta();
      pidiendo = fetch(AP.rutaAgenda(prefijo), { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" } })
        .then(function (r) { return r.status === 200 ? parse(r) : (estado = r.status === 401 ? "sin-sesion" : "error", null); })
        .then(function (j) {
          if (j === null) { if (estado === "cargando") estado = "error"; return; }
          var d = AP.valida(j); if (!d) { estado = "error"; return; }
          datos = d; estado = "ok"; hechas++; n.emite("agenda:cambia", { proximos: AP.proximos(d.eventos, Date.now()).length, puede_inscribirse: d.puede });
        }).catch(function () { estado = datos ? "ok" : "error"; })
        .then(function () { pidiendo = null; pinta(); if (typeof PanelVR !== "undefined") PanelVR.repinta(); });
      return pidiendo;
    }

    // apuntarse (personas) o borrarse (null): una sola petición a la vez; al acabar, recarga la lista (la verdad es la del servidor)
    function manda(e, personas) {
      var url = AP.rutaInscripcion(prefijo, e.id); if (!url || enVuelo) return Promise.resolve(false);
      enVuelo = true; nota = personas === null ? "Borrando…" : "Apuntando…"; pinta();
      var op = personas === null ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ personas: personas }) };
      return fetch(url, { method: op.method, credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: op.body })
        .then(function (r) {
          if (r.status === 201 || r.status === 204) return parse(r).then(function (j) {
            nota = personas === null ? "Os habéis borrado de «" + e.titulo + "»." : (j && j.estado === "en_espera" ? "Quedáis en la lista de espera de «" + e.titulo + "»." : "¡Apuntados a «" + e.titulo + "»!"); return true;
          });
          return parse(r).then(function (j) { nota = AP.textoError(r.status, j); return false; });
        }).catch(function () { nota = AP.textoError(0, null); return false; })
        .then(function (ok) { enVuelo = false; return carga().then(function () { return ok; }); });
    }

    // --- la ventana «Agenda»
    function tarjeta(e, puede) {
      var t = el("div", "padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.15)"), o = AP.ofrece(e, puede);
      t.setAttribute("data-evento", String(e.id));
      t.appendChild(el("h3", "margin:0 0 2px;font-size:17px", e.titulo));
      t.appendChild(el("p", "margin:0;font-size:15px;opacity:.9", AP.cuando(e.empieza) + " · " + AP.textoTipo(e)));
      if (e.lugar || e.haza) t.appendChild(el("p", "margin:2px 0 0;font-size:14px;opacity:.8", (e.lugar || "") + (e.lugar && e.haza ? " · " : "") + (e.haza ? "haza " + e.haza : "")));
      if (e.descripcion) t.appendChild(el("p", "margin:4px 0 0;font-size:14px;line-height:1.35;opacity:.85", e.descripcion));
      var pl = el("p", "margin:4px 0 0;font-size:15px;font-weight:600", AP.textoPlazas(e) + (e.abierta ? "" : " · inscripción cerrada")); pl.setAttribute("data-plazas", ""); t.appendChild(pl);
      if (e.mia) { var m = el("p", "margin:2px 0 0;font-size:15px;font-weight:700;color:#ffe9a8", AP.textoMia(e.mia)); m.setAttribute("data-mia", ""); t.appendChild(m); }
      if (o.apuntar) {
        var fila = el("div", "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px");
        var etq = el("label", "font-size:15px", "Personas"), sel = el("select", "min-height:44px;font:inherit;padding:0 8px;border-radius:8px"), b = el("button", BOTON, e.libres === 0 ? "Ponernos en la lista de espera" : "Apuntarnos");
        sel.id = "agenda-personas-" + e.id; etq.htmlFor = sel.id;
        for (var i = 1; i <= AP.MAX_PERSONAS; i++) { var op = el("option", null, String(i)); op.value = String(i); sel.appendChild(op); }
        sel.value = "2"; b.type = "button"; b.setAttribute("data-apunta", String(e.id));
        b.addEventListener("click", function () { var p = AP.personas(sel.value); if (p === null) { nota = "Elige entre 1 y 10 personas."; pinta(); return; } manda(e, p); });
        fila.appendChild(etq); fila.appendChild(sel); fila.appendChild(b); t.appendChild(fila);
      }
      if (o.borrar) {
        var bb = el("button", BOTON + ";margin-top:8px", "Borrarnos"); bb.type = "button"; bb.setAttribute("data-borra", String(e.id));
        bb.addEventListener("click", function () { manda(e, null); }); t.appendChild(bb);
      }
      return t;
    }
    function pinta() {
      if (!cuerpo) return;
      cuerpo.textContent = "";
      if (estado === "sin-sesion") { cuerpo.appendChild(el("p", "margin:8px 0", "Entra con tu enlace para ver la agenda.")); return; }
      if (!datos) { cuerpo.appendChild(el("p", "margin:8px 0", estado === "error" ? "No se ha podido cargar la agenda. Vuelve a abrirla en un rato." : "Cargando la agenda…")); return; }
      var l = AP.proximos(datos.eventos, Date.now());
      if (!l.length) cuerpo.appendChild(el("p", "margin:8px 0", "No hay eventos próximos."));
      else l.forEach(function (e) { cuerpo.appendChild(tarjeta(e, datos.puede)); });
      if (nota) { var a = el("p", "margin:10px 0 0;font-size:15px;font-weight:600", nota); a.setAttribute("role", "status"); a.setAttribute("aria-live", "polite"); a.setAttribute("data-nota", ""); cuerpo.appendChild(a); }
      if (!datos.puede) cuerpo.appendChild(el("p", "margin:10px 0 0;font-size:14px;opacity:.8", AP.TEXTO_VR + ": solo la titular, con su enlace, apunta a la familia."));
      else cuerpo.appendChild(el("p", "margin:10px 0 0;font-size:14px;opacity:.75", "Podéis cambiar el número de personas borrándoos y volviendo a apuntaros. Si no cabéis, quedáis en la lista de espera."));
    }

    // --- la fila «Agenda» del panel VR (pestaña Mundo): los próximos y dónde apuntarse; nada que pulsar
    function vistaVR() { return datos ? AP.filasVR(datos, Date.now(), 3) : null; }
    if (typeof PanelVR !== "undefined") {
      n.limpia(PanelVR.filas("mundo", { id: "agenda", orden: 70, alto: 290, visible: function () { return !!datos; },
        pinta: function (cx, y, W, h) {
          var v = vistaVR(); h.fila("Agenda", y); if (!v) return;
          cx.textAlign = "left"; cx.textBaseline = "alphabetic";
          function ajusta(txt, ancho) { var s = txt; while (cx.measureText(s).width > ancho && s.length > 6) s = s.slice(0, -2); return s === txt ? s : s.trim() + "…"; }
          var yy = y + 26;
          if (v.vacia) { cx.fillStyle = "#e8eee4"; cx.font = "600 24px system-ui, sans-serif"; cx.fillText("No hay eventos próximos", 420, yy); yy += 40; }
          v.filas.forEach(function (f) {
            cx.fillStyle = "#ffffff"; cx.font = "700 24px system-ui, sans-serif"; cx.fillText(ajusta(f.t, 590), 420, yy);
            cx.fillStyle = "#cfdccb"; cx.font = "600 21px system-ui, sans-serif"; cx.fillText(ajusta(f.s, 590), 420, yy + 28); yy += 62;
          });
          cx.fillStyle = "#ffe9a8"; cx.font = "700 24px system-ui, sans-serif"; cx.fillText(v.nota, 40, y + 270);
        },
        firma: function () { var v = vistaVR(); return v ? v.filas.map(function (f) { return f.t + "|" + f.s; }).join("/") + "|" + v.vacia : ""; },
        debug: function () { return { agenda: vistaVR() }; } }));
      n.on("vr:entra", function () { carga(); });   // al ponerse las gafas se refresca (no hay otro momento: el panel no tiene botón de recargar)
    }
    n.limpia(Ventanas.registra("agenda", { titulo: "Agenda", construye: function (cu) { cuerpo = cu; pinta(); } }));
    if (cuerpo && window.MutationObserver && cuerpo.parentNode) {   // al abrir la ventana se pide la agenda
      var mo = new MutationObserver(function () { if (!cuerpo.parentNode.hidden) carga(); });
      mo.observe(cuerpo.parentNode, { attributes: true, attributeFilter: ["hidden"] }); n.limpia(function () { mo.disconnect(); });
    }
    n.limpia(Hud.icono({ id: "agenda", ico: "📅", txt: "Agenda", prio: 2, ventana: "agenda" }));
    n.limpia(function () { cuerpo = null; });
    window.__agenda = function () {
      return { estado: estado, datos: datos, prefijo: prefijo, hechas: hechas, nota: nota, vr: vistaVR(), carga: carga, manda: function (id, p) { var e = datos && datos.eventos.filter(function (x) { return x.id === id; })[0]; return e ? manda(e, p) : Promise.resolve(false); } };
    };
    n.limpia(function () { try { delete window.__agenda; } catch (e) { window.__agenda = undefined; } });
    return { carga: carga, manda: manda, datos: function () { return datos; } };
  }

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?agenda=0 lo apaga; ?agenda=1 lo enciende.
  Componentes.registra({
    id: "agenda", version: 1,
    consume: ["Hud", "Ventanas", "PanelVR"],
    expone: [],
    eventos: { escucha: ["vr:entra"], emite: ["agenda:cambia"] },
    bandera: { defecto: true, url: "agenda" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // DOM y una fila de texto en el panel VR (su lienzo ya existe): nada en la escena 3D
    fases: {},
    monta: function (n) { return AgendaMotor(n); },
    libera: function (api) {}
  });
