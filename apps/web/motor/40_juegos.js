// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02c_componentes (Bus, Pausa, ConfigPuro, Teclas, Componentes, Config), 03_escena (lienzo), 12_paseo (teclas),
//   29_vr (VRX), 31_hud (Hud), 32_ventanas (Ventanas), 90_final (bucle)
// Nota: Componente «juegos» (ADR-0023, C9a): el anfitrión de juegos casuales. Solo se registra; nadie lo nombra. Montado: icono y ventana «Juegos», tecla J, recoge los juegos por el Bus («juego:ofrece» / «juego:pide» / «juego:retira»), abre uno a pantalla completa con el mundo en pausa (Pausa de 02c; su fase «pausa») y guarda el récord (localStorage y, con servidor, /api/juegos/<id>/…). Publica window.__juegos (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js.
// ===============================================================================
  // ---------- el anfitrión de juegos (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md): recoge los juegos casuales que se le ofrecen por el Bus, los enseña
  // en la ventana «Juegos» (icono de la barra y tecla J), abre uno a pantalla completa sobre el mundo EN PAUSA (Pausa de 02c: el bucle sigue, pero el mundo no
  // avanza ni se pinta; solo corre la fase «pausa», que es la de aquí), lo cierra con Esc o con su botón y devuelve a quien juega donde estaba. Guarda el
  // récord: en el aparato (localStorage, con try/catch) y, si la página la sirve el servidor, el de la familia en la api (POST /api/juegos/<id>/partidas
  // y GET …/records; contrato en contratos/api.openapi.yaml). Solo el récord del propio hogar: nada de otras familias (lo decide Antonio: DECISIONS-PENDING).
  // Un juego es OTRO componente: se ofrece con «juego:ofrece» { id, titulo, descripcion, ayuda?, crea(ctx) → partida } (si llega antes que el anfitrión,
  // el anfitrión le pregunta con «juego:pide») y se retira con «juego:retira» { id }. ctx = { tela, mandos, epoca, semilla, reducido }; la partida da
  // redimensiona(w, h, dpr), actualiza(dt) → ¿repintar?, pinta(), tecla(code) → ¿usada?, pausa(si), pausada(), estado() { puntos, fin }, resultado()
  // { puntos, duracion_s } y libera(). El anfitrión pone la barra (título, puntos, récord, Pausa y Cerrar), el teclado (Esc y P son suyas) y el final.
  // Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. ?juegos=0 o la configuración del servidor (decisión 118) lo apagan: sin icono, sin ventana.
  // No hay juegos en VR todavía (C9b, tras C8): en VR no se abre y, si se entra en VR con un juego abierto, se cierra.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js)
  var JuegosPuro = (function () {
    var ID = /^[a-z][a-z0-9-]{1,31}$/;
    // un juego ofrecido: los errores (vacía si vale)
    function validaJuego(d) {
      var e = [];
      if (!d || typeof d !== "object") return ["el juego no es un objeto"];
      if (typeof d.id !== "string" || !ID.test(d.id)) e.push("id: minúsculas, cifras y guiones (2-32), empezando por letra");
      if (typeof d.titulo !== "string" || !d.titulo.trim()) e.push("titulo");
      if (typeof d.crea !== "function") e.push("crea: función");
      return e;
    }
    // el mejor de dos récords ({ puntos, duracion_s, fecha } o null)
    function mejor(a, b) { if (!a || !(a.puntos >= 0)) return b && b.puntos >= 0 ? b : null; if (!b || !(b.puntos >= 0)) return a; return b.puntos > a.puntos ? b : a; }
    function claveLocal(id) { return "gemelo.record." + id; }
    function leeLocal(almacen, id) {
      try { var v = almacen && almacen.getItem(claveLocal(id)); if (!v) return null; var j = JSON.parse(v); return j && typeof j.puntos === "number" && j.puntos >= 0 ? j : null; } catch (e) { return null; }
    }
    // guarda en el aparato si es mejor; devuelve { record, nuevo }
    function guardaLocal(almacen, id, res, fecha) {
      var antes = leeLocal(almacen, id), r = { puntos: res.puntos, duracion_s: res.duracion_s, fecha: fecha };
      if (antes && antes.puntos >= res.puntos) return { record: antes, nuevo: false };
      try { if (almacen) almacen.setItem(claveLocal(id), JSON.stringify(r)); } catch (e) {}
      return { record: r, nuevo: res.puntos > 0 };
    }
    function rutaPartidas(prefijo, id) { return prefijo ? prefijo + "juegos/" + encodeURIComponent(id) + "/partidas" : null; }
    function rutaRecords(prefijo, id) { return prefijo ? prefijo + "juegos/" + encodeURIComponent(id) + "/records" : null; }
    // una semilla por partida (o la de ?semilla=N, para las pruebas)
    function semilla(busqueda, ahora) { var m = /[?&]semilla=(\d{1,9})(?:[&#]|$)/.exec(busqueda || ""); return m ? Number(m[1]) : (Math.floor(ahora) % 2147483646) + 1; }
    function fmtDuracion(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), r = s % 60; return m ? m + " min " + r + " s" : r + " s"; }
    function fmtPuntos(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
    return { ID: ID, validaJuego: validaJuego, mejor: mejor, claveLocal: claveLocal, leeLocal: leeLocal, guardaLocal: guardaLocal, rutaPartidas: rutaPartidas,
      rutaRecords: rutaRecords, semilla: semilla, fmtDuracion: fmtDuracion, fmtPuntos: fmtPuntos };
  })();
  // [puro:fin]

  function JuegosMotor(n) {
    var JP = JuegosPuro, juegos = {}, orden = [], records = {}, cuerpo = null, abierto = null, mide = { n: 0, ms: 0, pintadas: 0 };
    var prefijo = ConfigPuro.prefijoApi(location.search, D && D.base);
    var almacen = null; try { almacen = window.localStorage; } catch (e) { almacen = null; }

    function el(tag, css, txt) { var x = document.createElement(tag); if (css) x.style.cssText = css; if (txt != null) x.textContent = txt; return x; }
    var BOTON = "min-height:48px;min-width:48px;padding:0 16px;border-radius:12px;border:2px solid rgba(255,255,255,0.5);background:rgba(255,255,255,0.14);color:#fff;font:600 17px system-ui,sans-serif;cursor:pointer";
    function recordDe(id) { var r = records[id] || {}; return { familia: r.familia || null, aparato: JP.leeLocal(almacen, id) }; }
    function textoRecord(id) {
      var r = recordDe(id);
      if (r.familia) return "Récord de la familia: " + JP.fmtPuntos(r.familia.puntos);
      if (r.aparato) return "Récord en este aparato: " + JP.fmtPuntos(r.aparato.puntos);
      return "Sin récord todavía";
    }
    // el récord de la familia (solo con servidor); sin servidor, sin sesión o sin red, queda el del aparato y no se dice nada en la consola
    function pideRecord(id) {
      var url = JP.rutaRecords(prefijo, id); if (!url || typeof fetch !== "function") return;
      fetch(url, { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" } }).then(function (r) { return r.status === 200 ? r.json() : null; })
        .then(function (j) { if (j && j.juego === id) { records[id] = { familia: j.record || null, partidas: j.partidas || 0 }; pintaLista(); pintaBarra(); } }).catch(function () {});
    }
    function guarda(id, res) {
      var loc = JP.guardaLocal(almacen, id, res, new Date().toISOString()), url = JP.rutaPartidas(prefijo, id);
      if (!url || typeof fetch !== "function") return Promise.resolve({ nuevo: loc.nuevo, donde: "aparato" });
      var antes = (records[id] && records[id].familia) || null;
      return fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ puntos: res.puntos, duracion_s: res.duracion_s }) })
        .then(function (r) { return r.status === 201 ? r.json() : null; })
        .then(function (j) {
          if (!j) return { nuevo: loc.nuevo, donde: "aparato" };
          records[id] = { familia: j.record || null, partidas: j.partidas || 0 }; pintaLista();
          return { nuevo: !!j.es_record && (!antes || res.puntos > antes.puntos), donde: "familia" };
        }).catch(function () { return { nuevo: loc.nuevo, donde: "aparato" }; });
    }

    // --- la ventana «Juegos»: una tarjeta por juego con su récord y «Jugar»
    function pintaLista() {
      if (!cuerpo) return;
      cuerpo.textContent = "";
      if (!orden.length) { cuerpo.appendChild(el("p", "margin:8px 0", "No hay juegos encendidos.")); return; }
      orden.forEach(function (id) {
        var d = juegos[id], t = el("div", "padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.15)");
        t.appendChild(el("h3", "margin:0 0 4px;font-size:18px", d.titulo));
        if (d.descripcion) t.appendChild(el("p", "margin:0 0 6px;font-size:16px;line-height:1.35", d.descripcion));
        var rec = el("p", "margin:0 0 8px;font-size:15px;opacity:.85", textoRecord(id)); rec.setAttribute("data-record", id); t.appendChild(rec);
        var b = el("button", BOTON, "Jugar"); b.type = "button"; b.setAttribute("data-juega", id); b.addEventListener("click", function () { abre(id); });
        t.appendChild(b); cuerpo.appendChild(t);
      });
      cuerpo.appendChild(el("p", "margin:10px 0 0;font-size:14px;opacity:.75", "El mundo se queda en pausa mientras juegas. Sin compras ni anuncios. " +
        (prefijo ? "El récord es el de tu familia; no se ve el de otras." : "El récord se guarda en este aparato.")));
    }

    // --- la partida a pantalla completa
    function pintaBarra() {
      if (!abierto) return;
      var est = abierto.partida.estado();
      abierto.puntos.textContent = JP.fmtPuntos(est.puntos) + " puntos";
      abierto.record.textContent = textoRecord(abierto.id);
      abierto.bPausa.textContent = abierto.partida.pausada() ? "Seguir" : "Pausa";
      abierto.bPausa.setAttribute("aria-pressed", abierto.partida.pausada() ? "true" : "false");
    }
    function medidas() {
      if (!abierto) return;
      var r = abierto.area.getBoundingClientRect();
      abierto.partida.redimensiona(r.width, r.height, window.devicePixelRatio || 1);
    }
    function nuevaPartida() {
      var a = abierto, d = juegos[a.id];
      if (a.partida) a.partida.libera();
      a.fin.hidden = true; a.guardado = false; a.mandos.textContent = "";
      var ep = null; try { var m = /[?&]epoca=([a-z]+)/.exec(location.search); ep = m ? m[1] : (Config.tablaEpocas(D.finca_id) ? Config.epocaDeFecha(Config.tablaEpocas(D.finca_id), new Date()) : null); } catch (e) { ep = null; }
      var reducido = false; try { reducido = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
      a.partida = d.crea({ tela: a.tela, mandos: a.mandos, epoca: ep, semilla: JP.semilla(location.search, Date.now()), reducido: reducido });
      medidas(); pintaBarra(); a.partida.pinta();
    }
    function abre(id) {
      if (abierto || !juegos[id] || (typeof VRX !== "undefined" && VRX.on)) return false;
      if (Ventanas.abierta()) Ventanas.cierra();
      var d = juegos[id], previo = document.activeElement;
      var capa = el("div", "position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:rgba(14,20,15,0.96);color:#fff;font:16px system-ui,sans-serif;" +
        "padding:max(8px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));box-sizing:border-box");
      capa.id = "juegoCapa"; capa.setAttribute("role", "dialog"); capa.setAttribute("aria-modal", "true"); capa.setAttribute("aria-label", d.titulo); capa.tabIndex = -1;
      var barra = el("div", "display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:52px");
      var titulo = el("h2", "margin:0;font-size:20px;flex:0 0 auto", d.titulo), puntos = el("span", "font-size:19px;font-weight:700;flex:0 0 auto"), record = el("span", "font-size:15px;opacity:.85;flex:1 1 auto");
      puntos.setAttribute("data-puntos", ""); puntos.setAttribute("aria-live", "off");
      var bPausa = el("button", BOTON, "Pausa"), bCerrar = el("button", BOTON + ";font-size:24px;padding:0 14px", "×");
      bPausa.type = "button"; bCerrar.type = "button"; bCerrar.setAttribute("aria-label", "Salir del juego y volver al olivar (Esc)"); bCerrar.title = "Volver al olivar · Esc";
      [titulo, puntos, record, bPausa, bCerrar].forEach(function (x) { barra.appendChild(x); });
      var area = el("div", "flex:1 1 auto;min-height:0;position:relative;display:flex;align-items:center;justify-content:center");
      var tela = el("canvas", "display:block;max-width:100%;max-height:100%"); tela.setAttribute("role", "img"); area.appendChild(tela);
      var mandos = el("div", "display:flex;gap:8px;justify-content:center;padding-top:8px;flex:0 0 auto");
      var ayuda = d.ayuda ? el("p", "margin:6px 0 0;font-size:14px;opacity:.75;text-align:center", d.ayuda) : null;
      var fin = el("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,14,10,0.82)"); fin.hidden = true;
      fin.setAttribute("role", "alertdialog"); fin.setAttribute("aria-live", "polite");
      area.appendChild(fin);
      capa.appendChild(barra); capa.appendChild(area); capa.appendChild(mandos); if (ayuda) capa.appendChild(ayuda);
      document.body.appendChild(capa);
      abierto = { id: id, capa: capa, area: area, lienzo: tela, mandos: mandos, fin: fin, puntos: puntos, record: record, bPausa: bPausa, previo: previo, partida: null, quitar: [], guardado: false };
      function on(x, ev, fn, op) { x.addEventListener(ev, fn, op); abierto.quitar.push(function () { x.removeEventListener(ev, fn, op); }); }
      on(bCerrar, "click", function () { cierra(); });
      on(bPausa, "click", function () { alternaPausa(); });
      // el teclado, mientras está abierto, es del juego: se coge en la fase de captura y no llega al paseo, al HUD ni a las otras teclas
      on(window, "keydown", function (ev) {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        ev.stopImmediatePropagation();
        if (ev.code === "Escape") { ev.preventDefault(); cierra(); return; }
        if (ev.code === "KeyP") { ev.preventDefault(); if (!ev.repeat) alternaPausa(); return; }
        var t = ev.target && ev.target.tagName;
        if (t === "BUTTON" && (ev.code === "Enter" || ev.code === "Space" || ev.code === "NumpadEnter")) return;   // Intro sobre un botón lo pulsa
        if (abierto.partida && !abierto.fin.hidden) return;
        if (abierto.partida && abierto.partida.tecla(ev.code)) ev.preventDefault();
      }, true);
      on(window, "resize", medidas);
      on(document, "visibilitychange", function () { if (document.hidden && abierto && abierto.partida && !abierto.partida.pausada() && !abierto.partida.estado().fin) alternaPausa(); });
      Pausa.pon("juegos");
      nuevaPartida();
      capa.focus({ preventScroll: true });
      if (!records[id]) pideRecord(id);
      return true;
    }
    function alternaPausa() { if (!abierto || !abierto.partida || abierto.partida.estado().fin) return; abierto.partida.pausa(!abierto.partida.pausada()); pintaBarra(); }
    function cierra() {
      if (!abierto) return false;
      var a = abierto; abierto = null;
      try { if (a.partida) a.partida.libera(); } catch (e) {}
      a.quitar.splice(0).forEach(function (fn) { try { fn(); } catch (e) {} });
      if (a.capa.parentNode) a.capa.parentNode.removeChild(a.capa);
      Pausa.quita("juegos");
      if (a.previo && a.previo.focus && document.contains(a.previo)) { try { a.previo.focus({ preventScroll: true }); } catch (e) {} }
      pintaLista();
      return true;
    }
    function acaba() {
      var a = abierto, res = a.partida.resultado(); a.guardado = true;
      a.fin.textContent = "";
      var c = el("div", "max-width:360px;margin:12px;padding:20px;border-radius:16px;background:#22301f;border:2px solid rgba(255,255,255,0.35);text-align:center");
      c.appendChild(el("h3", "margin:0 0 10px;font-size:24px", "Se acabó la partida"));
      c.appendChild(el("p", "margin:0 0 6px;font-size:22px;font-weight:700", JP.fmtPuntos(res.puntos) + " puntos"));
      c.appendChild(el("p", "margin:0 0 12px;font-size:16px;opacity:.85", "en " + JP.fmtDuracion(res.duracion_s)));
      var linea = el("p", "margin:0 0 16px;font-size:17px", "Guardando…"); c.appendChild(linea);
      var otra = el("button", BOTON + ";margin:4px", "Otra partida"), volver = el("button", BOTON + ";margin:4px", "Volver al olivar");
      otra.type = "button"; volver.type = "button"; otra.addEventListener("click", function () { if (abierto === a) nuevaPartida(); }); volver.addEventListener("click", function () { cierra(); });
      c.appendChild(otra); c.appendChild(volver); a.fin.appendChild(c); a.fin.hidden = false; otra.focus({ preventScroll: true });
      guarda(a.id, res).then(function (g) {
        linea.textContent = (g.nuevo ? "¡Récord nuevo! " : "") + textoRecord(a.id);
        if (abierto === a) pintaBarra();
      });
    }
    // la fase «pausa» (solo con el mundo en pausa): avanza la partida y la pinta si cambió
    function turno(dt) {
      if (!abierto || !abierto.partida) return;
      var t0 = performance.now(), p = abierto.partida;
      if (p.actualiza(dt)) { if (p.pinta()) mide.pintadas++; pintaBarra(); }
      if (p.estado().fin && !abierto.guardado) acaba();
      mide.n++; mide.ms += performance.now() - t0;
    }

    n.on("juego:ofrece", function (d) {
      var e = JP.validaJuego(d); if (e.length) { try { console.warn("[juegos] juego no válido: " + e.join("; ")); } catch (er) {} return; }
      if (!juegos[d.id]) orden.push(d.id);
      juegos[d.id] = d; pintaLista();
    });
    n.on("juego:retira", function (d) {
      var id = d && d.id; if (!juegos[id]) return;
      if (abierto && abierto.id === id) cierra();
      delete juegos[id]; orden = orden.filter(function (x) { return x !== id; }); pintaLista();
    });
    n.on("vr:entra", function () { cierra(); });
    n.limpia(Ventanas.registra("juegos", { titulo: "Juegos", construye: function (cu) { cuerpo = cu; pintaLista(); } }));
    // al abrir la ventana se pide el récord de la familia (solo con servidor)
    if (cuerpo && window.MutationObserver && cuerpo.parentNode) {
      var mo = new MutationObserver(function () { if (!cuerpo.parentNode.hidden) orden.forEach(pideRecord); });
      mo.observe(cuerpo.parentNode, { attributes: true, attributeFilter: ["hidden"] }); n.limpia(function () { mo.disconnect(); });
    }
    n.limpia(Hud.icono({ id: "juegos", ico: "🎲", txt: "Juegos", tecla: "J", prio: 2, ventana: "juegos" }));
    n.limpia(Teclas.registra("KeyJ", function () { if (typeof VRX !== "undefined" && VRX.on) return false; Hud.alterna("juegos", null); }, "juegos"));
    n.limpia(function () { cierra(); cuerpo = null; });
    window.__juegos = function () {
      return { juegos: orden.slice(), abierto: abierto ? abierto.id : null, pausaMundo: Pausa.activa(), estado: abierto && abierto.partida ? abierto.partida.estado() : null,
        msPorCuadro: mide.n ? mide.ms / mide.n : 0, cuadros: mide.n, pintadas: mide.pintadas, prefijo: prefijo, record: abierto ? recordDe(abierto.id) : null,
        reinicia: function () { mide.n = 0; mide.ms = 0; mide.pintadas = 0; } };
    };
    n.limpia(function () { try { delete window.__juegos; } catch (e) { window.__juegos = undefined; } });
    n.emite("juego:pide", {});
    return { abre: abre, cierra: cierra, turno: turno, abierto: function () { return abierto ? abierto.id : null; } };
  }

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?juegos=0 lo apaga; ?juegos=1 lo enciende.
  Componentes.registra({
    id: "juegos", version: 1,
    consume: ["Hud", "Ventanas", "Teclas", "VRX"],
    expone: [],
    eventos: { escucha: ["juego:ofrece", "juego:retira", "vr:entra"], emite: ["juego:pide"] },
    bandera: { defecto: true, url: "juegos" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // nada en la escena 3D: un canvas 2D por encima y el mundo en pausa (sin render) mientras se juega
    fases: { pausa: 0 },
    monta: function (n) { return JuegosMotor(n); },
    actualiza: { pausa: function (dt, t, api) { api.turno(dt); } },
    libera: function (api) { if (api) api.cierra(); }
  });
