// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Ajustes
// Consume: 01_datos ($, fmt), 02_mundo (copas), 03_escena (renderer, exag, modo, calidad), 08_marcadores (listo, aplica), 09_camara (pon),
//   12_paseo (persona), 14_historia (FINCA, lista, rango), 20_sonido (iniciaSonido), 24_pantalla (suave), 26_presencia (Chat), 29_vr (panel),
//   30_mide (Mide), 31_hud (Hud), 34_movibles (Movibles), 90_final (tamano, bucle)
// ===============================================================================
// ===== CONTRATO DEL MÓDULO =====
// ===============================================================================

  // ---------- Configuración (UX-FINCA-JUEGO §4.5): los ajustes de la persona, guardados en localStorage (prefijo gemelo.ajustes.) con try/catch (si falla, duran la visita).
  // Una URL manda sobre el ajuste (?debug, &mide=). La UI se pinta por JS en #menuAjustes (lo crea la plantilla); si no existe y hay un <dialog id="menu">, se crea un <section> de respaldo.
  // Los módulos que dependen de un ajuste lo LEEN (Ajustes.lee) o se suscriben (Ajustes.alCambiar); aquí solo se aplica lo que no tiene dueño: los controles de la página,
  // atributos data-* en <html> para el CSS (contraste, movimiento, mano, brújula, unidades, táctil) y el texto.

  // [puro:inicio] — esquema, validación, guardado y precedencia de la URL: sin DOM; pruebas/guardianes/ajustes.test.js evalúa este trozo tal cual en Node
  var AjustesPuro = (function () {
    var PREFIJO = "gemelo.ajustes.";
    function bool(def) { return { tipo: "bool", def: def }; }
    function num(def, min, max, paso) { return { tipo: "num", def: def, min: min, max: max, paso: paso }; }
    function opc(def, ops) { return { tipo: "opc", def: def, ops: ops }; }
    var ESQUEMA = {
      "graficos.calidad": opc("auto", ["auto", "0", "1", "2"]), "graficos.ahorro": bool(false),
      "vista.exag": num(1, 1, 3, 0.25), "vista.corr": num(1, 0, 1.5, 0.25), "vista.brujula": bool(true), "vista.unidades": opc("ha", ["ha", "m2"]),
      "sonido.activo": bool(true), "sonido.volumen": num(80, 0, 100, 5),
      "controles.tactil": opc("auto", ["auto", "si", "no"]), "controles.mano": opc("diestra", ["diestra", "zurda"]), "controles.sens": num(1, 0.4, 2, 0.2), "controles.invertir": bool(false),
      "vr.giro": opc("30", ["15", "30", "45", "60"]), "vr.vineta": opc("suave", ["suave", "fuerte", "no"]), "vr.vuelo": bool(false), "vr.postura": opc("pie", ["pie", "sentado"]),
      "acc.texto": num(100, 100, 200, 25), "acc.contraste": bool(false), "acc.movimiento": opc("sistema", ["sistema", "reducido", "normal"]),
      "avanzado.contador": bool(false)
    };
    // lo que fuerza la URL (clave del ajuste → expresión sobre location.search); la URL manda y no se guarda
    var URL_MANDA = { "avanzado.contador": /[?&]debug\b/ };
    // un valor o el defecto: nunca lanza ni deja pasar un valor fuera de rango (un localStorage manipulado o de otra versión)
    function valida(clave, v) {
      var e = ESQUEMA[clave]; if (!e) return undefined;
      if (e.tipo === "bool") return typeof v === "boolean" ? v : e.def;
      if (e.tipo === "num") { if (typeof v !== "number" || !isFinite(v)) return e.def; return Math.min(e.max, Math.max(e.min, v)); }
      return typeof v === "string" && e.ops.indexOf(v) >= 0 ? v : e.def;
    }
    function esValido(clave, v) { var e = ESQUEMA[clave]; if (!e) return false; return valida(clave, v) === v || (e.tipo === "num" && typeof v === "number" && isFinite(v)); }
    // el almacén: algo con getItem/setItem/removeItem (localStorage). Si falla (modo privado, bloqueado), se cae a la memoria de la visita
    function crea(almacen, busqueda) {
      var mem = {}, oyentes = [];
      function rd(clave) {
        try { if (almacen) { var s = almacen.getItem(PREFIJO + clave); if (s != null) return JSON.parse(s); } } catch (e) {}
        return Object.prototype.hasOwnProperty.call(mem, clave) ? mem[clave] : undefined;
      }
      function wr(clave, v) { mem[clave] = v; try { if (almacen) almacen.setItem(PREFIJO + clave, JSON.stringify(v)); } catch (e) {} }
      function rm(clave) { delete mem[clave]; try { if (almacen) almacen.removeItem(PREFIJO + clave); } catch (e) {} }
      function forzado(clave) { return URL_MANDA[clave] && URL_MANDA[clave].test(busqueda || "") ? true : undefined; }
      function guardado(clave) { var v = rd(clave); return v === undefined ? ESQUEMA[clave] && ESQUEMA[clave].def : valida(clave, v); }
      function lee(clave) { if (!ESQUEMA[clave]) return undefined; var f = forzado(clave); return f !== undefined ? f : guardado(clave); }
      function avisa(clave, v, antes) { oyentes.slice().forEach(function (fn) { try { fn(clave, v, antes); } catch (e) {} }); }
      function pon(clave, v) {
        if (!ESQUEMA[clave]) return false;
        if (!esValido(clave, v)) return false;
        v = valida(clave, v); var antes = lee(clave), g = guardado(clave);
        if (v === ESQUEMA[clave].def) rm(clave); else wr(clave, v);
        if (g !== v || antes !== lee(clave)) avisa(clave, lee(clave), antes);
        return true;
      }
      function restablece() { Object.keys(ESQUEMA).forEach(function (k) { var antes = lee(k); rm(k); if (lee(k) !== antes) avisa(k, lee(k), antes); }); }
      function alCambiar(fn) { if (typeof fn === "function") oyentes.push(fn); return function () { var i = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1); }; }
      return { lee: lee, pon: pon, alCambiar: alCambiar, restablece: restablece, defecto: function (c) { return ESQUEMA[c] && ESQUEMA[c].def; }, forzado: forzado, claves: function () { return Object.keys(ESQUEMA); } };
    }
    // superficie en hectáreas o metros cuadrados (decisión de Configuración → Vista); fmt: formateador (n, decimales) → texto
    function superficie(ha, unidades, fmt) { return unidades === "m2" ? fmt(Math.round(ha * 10000), 0) + " m²" : fmt(ha, 1) + " ha"; }
    return { PREFIJO: PREFIJO, ESQUEMA: ESQUEMA, valida: valida, crea: crea, superficie: superficie };
  })();
  // [puro:fin]

  var Ajustes = (function () {
    var almacen = null; try { almacen = window.localStorage; } catch (e) { almacen = null; }
    var api = AjustesPuro.crea(almacen, location.search), E = AjustesPuro.ESQUEMA, raiz = document.documentElement;
    function movimientoReducido() { var m = api.lee("acc.movimiento"); if (m === "sistema") return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); return m === "reducido"; }
    function tactil() { var t = api.lee("controles.tactil"); if (t === "auto") return !!(window.matchMedia && matchMedia("(pointer: coarse)").matches); return t === "si"; }
    api.movimientoReducido = movimientoReducido; api.tactil = tactil;
    api.superficie = function (ha) { return AjustesPuro.superficie(ha, api.lee("vista.unidades"), fmt); };
    // calidad de los olivos: null = automática (la escala adaptativa de 07b manda); si no, la escala que se fija. 07b la lee con Ajustes.escalaArboles() (ver el informe de U4)
    api.escalaArboles = function () { var c = api.lee("graficos.calidad"); return c === "auto" ? null : { "0": 0.7, "1": 1, "2": 1.6 }[c]; };
    api.esquema = E;

    // ----- aplicar: lo que no tiene otro dueño
    var estilo = null;
    function css() {
      if (estilo) return; estilo = document.createElement("style"); estilo.id = "ajustesEstilo";
      estilo.textContent =
        ":root[data-movimiento=\"reducido\"] *, :root[data-movimiento=\"reducido\"] *::before, :root[data-movimiento=\"reducido\"] *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }\n" +
        ":root[data-contraste=\"alto\"] { --fg: #000; --muted: #1a1a1a; --line: #000; }\n" +
        ":root[data-contraste=\"alto\"] :is(#hud, #hudBarra, #hudEstado) :is(button, a, .chip) { background: #000 !important; color: #fff !important; border: 2px solid #fff !important; }\n" +
        ":root[data-contraste=\"alto\"] :is(#hud, #hudBarra, #hudEstado) { text-shadow: none; }\n" +
        ":root[data-brujula=\"no\"] :is(#bBrujula, #hudBrujula) { display: none !important; }\n" +
        ":root[data-texto=\"mayor\"] body { font-size: calc(14px * var(--escala-texto, 1)); }\n" +
        ".ajustes .aj-pestanas { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 12px; }\n" +
        ".ajustes .aj-pestanas [role=\"tab\"] { min-height: 44px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit; font: inherit; cursor: pointer; }\n" +
        ".ajustes .aj-pestanas [aria-selected=\"true\"] { background: var(--olivo); color: #fff; border-color: var(--olivo); }\n" +
        ".ajustes .aj-op { margin: 0 0 14px; } .ajustes fieldset { border: 0; padding: 0; margin: 0; } .ajustes legend { font-weight: 600; padding: 0; margin-bottom: 4px; }\n" +
        ".ajustes label.aj-fila { display: flex; align-items: center; gap: 10px; min-height: 44px; cursor: pointer; } .ajustes label.aj-fila input { width: 20px; height: 20px; accent-color: var(--olivo); flex: none; }\n" +
        ".ajustes .aj-rango { display: grid; gap: 4px; } .ajustes .aj-rango input[type=range] { width: 100%; min-height: 32px; accent-color: var(--olivo); }\n" +
        ".ajustes .aj-nota { margin: 4px 0 0; font-size: .86em; color: var(--muted); } .ajustes button.aj-boton { min-height: 44px; padding: 6px 14px; margin: 0 8px 8px 0; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit; font: inherit; cursor: pointer; } .ajustes button.aj-boton:disabled { opacity: .5; cursor: default; }\n";
      document.head.appendChild(estilo);
    }
    function ligaControl(id, clave, evento) {   // un control que ya existe en la página (relieve, corrección) y el ajuste se mantienen iguales en las dos direcciones
      var el = $(id); if (!el) return;
      el.addEventListener(evento, function () { if (Number(el.value) !== api.lee(clave)) api.pon(clave, Number(el.value)); });
    }
    function empujaControl(id, valor, evento) {
      var el = $(id); if (!el || Number(el.value) === Number(valor)) return;
      el.value = String(valor); el.dispatchEvent(new Event(evento, { bubbles: true }));
    }
    var aplicaPor = {
      "graficos.calidad": function (v) {   // el selector de calidad del follaje (13_parcelas lo escucha); «Automática» deja la Media, que es la de siempre
        var s = $("calidad"), val = v === "auto" ? "1" : v; if (!s || s.value === val) return; s.value = val; s.dispatchEvent(new Event("change", { bubbles: true }));
      },
      "graficos.ahorro": function (v) {   // menos píxeles (resolución 1×) y el bucle a ~30 fotogramas/s (90_final lee el ajuste)
        if (typeof renderer === "undefined") return;
        var pr = v ? 1 : Math.min(window.devicePixelRatio || 1, 2); if (renderer.getPixelRatio() === pr) return;
        renderer.setPixelRatio(pr); if (typeof tamano === "function") tamano();
      },
      "vista.exag": function (v) { empujaControl("exag", v, "input"); },
      "vista.corr": function (v) { empujaControl("corr", v, "input"); },
      "vista.brujula": function (v) { raiz.setAttribute("data-brujula", v ? "si" : "no"); },
      "vista.unidades": function (v) { raiz.setAttribute("data-unidades", v); },
      "sonido.activo": function (v) {   // un solo interruptor: la casilla vieja de Capas y el 🔊 se quitan (decisión 89); #cSonido queda oculta y sincronizada porque el panel VR la lee
        var c = $("cSonido"); if (c && c.checked !== v) c.checked = v;
        if (v && typeof iniciaSonido === "function" && started) iniciaSonido();
      },
      "controles.tactil": function () { raiz.setAttribute("data-tactil", tactil() ? "si" : "no"); },
      "controles.mano": function (v) { raiz.setAttribute("data-mano", v); },
      "acc.texto": function (v) { raiz.style.setProperty("--escala-texto", String(v / 100)); raiz.setAttribute("data-texto", v > 100 ? "mayor" : "normal"); },
      "acc.contraste": function (v) { raiz.setAttribute("data-contraste", v ? "alto" : "normal"); },
      "acc.movimiento": function () { raiz.setAttribute("data-movimiento", movimientoReducido() ? "reducido" : "normal"); },
      "avanzado.contador": function () { if (typeof Mide !== "undefined" && Mide.muestra) Mide.muestra(!!api.lee("avanzado.contador")); }
    };
    var started = false;   // el audio solo arranca con un gesto: el primer cambio hecho por la persona
    function aplica(clave) { var f = aplicaPor[clave]; if (f) { try { f(api.lee(clave)); } catch (e) {} } }

    // ----- la interfaz de Configuración (pestañas ARIA dentro de #menuAjustes)
    var PESTANAS = [
      { id: "graficos", t: "Gráficos", campos: [
        { k: "graficos.calidad", t: "Calidad", ops: [["auto", "Automática (recomendada)"], ["0", "Baja"], ["1", "Media"], ["2", "Alta"]], nota: "Automática ajusta sola cuántos olivos se dibujan al detalle según lo que aguante el aparato; Baja, Media y Alta la fijan. Es el selector «Calidad del follaje» de siempre." },
        { k: "graficos.ahorro", t: "Ahorro de batería (resolución 1× y unos 30 fotogramas por segundo)" } ] },
      { id: "vista", t: "Vista", campos: [
        { k: "vista.exag", t: "Relieve exagerado", fmt: function (v) { return fmt(v, v % 1 ? 2 : 0) + "×"; } },
        { k: "vista.corr", t: "Corrección de la ortofoto", fmt: function (v) { return fmt(v, v % 1 ? 2 : 0) + "×"; }, nota: "Ajuste medido en la finca (las copas se ven desplazadas al este según su altura); no es una ortorrectificación." },
        { k: "vista.brujula", t: "Mostrar la brújula" },
        { k: "vista.unidades", t: "Superficie en", ops: [["ha", "hectáreas"], ["m2", "metros cuadrados"]] } ] },
      { id: "sonido", t: "Sonido", campos: [
        { k: "sonido.activo", t: "Sonido ambiente (pájaros, pasos, viento)" },
        { k: "sonido.volumen", t: "Volumen", fmt: function (v) { return v + " %"; } } ] },
      { id: "controles", t: "Controles", campos: [
        { k: "controles.tactil", t: "Controles táctiles", ops: [["auto", "Automático"], ["si", "Siempre"], ["no", "Nunca"]], nota: "Automático: solo con pantalla táctil." },
        { k: "controles.mano", t: "Mano", ops: [["diestra", "Diestra (cruceta a la izquierda)"], ["zurda", "Zurda (cruceta a la derecha)"]] },
        { k: "controles.sens", t: "Sensibilidad al mirar", fmt: function (v) { return fmt(v, 1) + "×"; } },
        { k: "controles.invertir", t: "Invertir el eje vertical al mirar" } ] },
      { id: "vr", t: "Comodidad VR", nota: "Se aplica en las gafas. Nada de esto está probado en unas Quest.", campos: [
        { k: "vr.giro", t: "Giro", ops: [["15", "A saltos de 15°"], ["30", "A saltos de 30°"], ["45", "A saltos de 45°"], ["60", "A saltos de 60°"]] },
        { k: "vr.vineta", t: "Viñeta", ops: [["suave", "Suave"], ["fuerte", "Fuerte"], ["no", "Apagada"]] },
        { k: "vr.vuelo", t: "Permitir vuelo (A) y mirador (B)" },
        { k: "vr.postura", t: "Postura", ops: [["pie", "De pie"], ["sentado", "Sentado"]] } ] },
      { id: "acc", t: "Accesibilidad", campos: [
        { k: "acc.texto", t: "Tamaño del texto", fmt: function (v) { return v + " %"; } },
        { k: "acc.contraste", t: "Alto contraste en el HUD" },
        { k: "acc.movimiento", t: "Movimiento", ops: [["sistema", "Como el sistema"], ["reducido", "Reducido"], ["normal", "Normal"]], nota: "Reducido: sin animaciones del HUD ni transiciones largas." } ] },
      { id: "avanzado", t: "Avanzado", campos: [
        { k: "avanzado.contador", t: "Contador de rendimiento (lo mismo que ?debug)", nota: "Los fps solo valen en un aparato real; en Chrome sin GPU no son fps de nada." },
        { boton: "Medir 60 s", id: "ajMedir", solo: "contador", nota: "El medidor solo está con el contador encendido (o con &mide=N en la URL)." },
        { boton: "Devolver el chat y el mapa a su sitio", id: "ajRecoloca" },
        { boton: "Restablecer toda la configuración", id: "ajReinicia" } ] }
    ];

    function recoloca() {   // chat, burbuja y mapa de vuelta a su sitio (UB: Movibles); si aún no está, se borran las posiciones guardadas
      var hecho = false;
      try { if (typeof Movibles !== "undefined" && Movibles) {
        if (typeof Movibles.devuelve === "function") { Movibles.devuelve(); hecho = true; }
        else if (typeof Movibles.restablece === "function") { Movibles.restablece(); hecho = true; }
      } } catch (e) {}
      if (!hecho) { try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("gemelo.chat.pos.") === 0 || k.indexOf("gemelo.mapa.pos.") === 0) localStorage.removeItem(k); }); } catch (e) {} }
      try { if (typeof Movibles !== "undefined" && Movibles && typeof Movibles.revisa === "function") Movibles.revisa(); } catch (e) {}
      try { if (typeof Hud !== "undefined" && Hud && Hud.aviso) Hud.aviso("Chat y mapa en su sitio", 2500); } catch (e) {}
    }
    var ACCIONES = {
      ajMedir: function () { if (typeof Mide !== "undefined" && Mide.inicia) { var d = $("menu"); try { if (d && d.close) d.close(); } catch (e) {} Mide.inicia(60); } },
      ajRecoloca: recoloca,
      ajReinicia: function () { api.restablece(); try { if (typeof Hud !== "undefined" && Hud && Hud.aviso) Hud.aviso("Configuración restablecida", 2500); } catch (e) {} }
    };

    var cont = null, hojas = {};   // los controles pintados, por clave
    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function pintaCampo(c, panel) {
      var d = el("div", "aj-op");
      if (c.boton) {
        var b = el("button", "aj-boton", c.boton); b.type = "button"; b.id = c.id; b.addEventListener("click", ACCIONES[c.id]); d.appendChild(b); hojas[c.id] = { boton: b, solo: c.solo };
      } else if (c.ops) {
        var f = el("fieldset"), lg = el("legend", null, c.t); f.appendChild(lg); hojas[c.k] = { radios: [] };
        c.ops.forEach(function (o) {
          var l = el("label", "aj-fila"), i = el("input"); i.type = "radio"; i.name = "aj-" + c.k; i.value = o[0]; i.setAttribute("data-aj", c.k);
          l.appendChild(i); l.appendChild(document.createTextNode(o[1])); f.appendChild(l); hojas[c.k].radios.push(i);
        });
        d.appendChild(f);
      } else if (E[c.k].tipo === "bool") {
        var l2 = el("label", "aj-fila"), i2 = el("input"); i2.type = "checkbox"; i2.setAttribute("data-aj", c.k); l2.appendChild(i2); l2.appendChild(document.createTextNode(c.t)); d.appendChild(l2); hojas[c.k] = { casilla: i2 };
      } else {
        var w = el("div", "aj-rango"), fila = el("div"), lb = el("label", null, c.t), sp = el("strong"), r = el("input");
        r.type = "range"; r.min = E[c.k].min; r.max = E[c.k].max; r.step = E[c.k].paso; r.id = "aj-r-" + c.k; r.setAttribute("data-aj", c.k); lb.htmlFor = r.id; fila.style.cssText = "display:flex;justify-content:space-between;gap:8px";
        sp.style.marginLeft = "auto"; fila.appendChild(lb); fila.appendChild(sp); w.appendChild(fila); w.appendChild(r); d.appendChild(w); hojas[c.k] = { rango: r, valor: sp, fmt: c.fmt };
      }
      if (c.nota) d.appendChild(el("p", "aj-nota", c.nota));
      if (c.k && E[c.k] && Object.keys(URL_FUERZA).indexOf(c.k) >= 0) { var nu = el("p", "aj-nota", "Lo fuerza la dirección de la página (?debug)."); nu.hidden = true; d.appendChild(nu); hojas[c.k].urlNota = nu; }
      panel.appendChild(d);
    }
    var URL_FUERZA = { "avanzado.contador": 1 };
    function pinta() {   // los controles reflejan los ajustes
      Object.keys(hojas).forEach(function (k) {
        var h = hojas[k], v = api.lee(k), forz = api.forzado(k) !== undefined;
        if (h.radios) h.radios.forEach(function (r) { r.checked = String(v) === r.value; });
        if (h.casilla) { h.casilla.checked = !!v; h.casilla.disabled = forz; }
        if (h.rango) { h.rango.value = String(v); h.valor.textContent = h.fmt ? h.fmt(v) : String(v); }
        if (h.urlNota) h.urlNota.hidden = !forz;
        if (h.boton && h.solo === "contador") { var on = !!api.lee("avanzado.contador") || /[?&]mide\b/.test(location.search); h.boton.disabled = !on; }
      });
    }
    function seleccionaPestana(id, enfoca) {
      PESTANAS.forEach(function (p) {
        var t = document.getElementById("aj-t-" + p.id), q = document.getElementById("aj-p-" + p.id), s = p.id === id;
        t.setAttribute("aria-selected", String(s)); t.tabIndex = s ? 0 : -1; q.hidden = !s; if (s && enfoca) t.focus();
      });
    }
    function construye() {
      var host = document.getElementById("menuAjustes");
      if (!host) { var dlg = document.getElementById("menu"); if (!dlg || dlg.tagName !== "DIALOG") return; host = document.createElement("section"); host.id = "menuAjustes"; host.setAttribute("aria-label", "Configuración"); dlg.appendChild(host); }
      if (host.getAttribute("data-ajustes") === "listo") return; host.setAttribute("data-ajustes", "listo"); host.classList.add("ajustes"); cont = host; css();
      var lista = el("div", "aj-pestanas"); lista.setAttribute("role", "tablist"); lista.setAttribute("aria-label", "Configuración");
      host.appendChild(lista);
      PESTANAS.forEach(function (p, n) {
        var t = el("button", null, p.t); t.type = "button"; t.id = "aj-t-" + p.id; t.setAttribute("role", "tab"); t.setAttribute("aria-controls", "aj-p-" + p.id); t.setAttribute("aria-selected", "false"); t.tabIndex = -1;
        t.addEventListener("click", function () { seleccionaPestana(p.id, false); });
        t.addEventListener("keydown", function (e) {
          var m = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key], d = null;
          if (m) d = (n + m + PESTANAS.length) % PESTANAS.length; else if (e.key === "Home") d = 0; else if (e.key === "End") d = PESTANAS.length - 1;
          if (d !== null) { e.preventDefault(); seleccionaPestana(PESTANAS[d].id, true); }
        });
        lista.appendChild(t);
        var q = el("div"); q.id = "aj-p-" + p.id; q.setAttribute("role", "tabpanel"); q.setAttribute("aria-labelledby", t.id); q.hidden = true;
        q.appendChild(el("h3", null, p.t)); if (p.nota) q.appendChild(el("p", "aj-nota", p.nota));
        p.campos.forEach(function (c) { pintaCampo(c, q); });
        host.appendChild(q);
      });
      host.addEventListener("change", function (e) { var i = e.target, k = i.getAttribute && i.getAttribute("data-aj"); if (!k) return; started = true; api.pon(k, E[k].tipo === "bool" ? i.checked : E[k].tipo === "num" ? Number(i.value) : i.value); });
      host.addEventListener("input", function (e) { var i = e.target, k = i.getAttribute && i.getAttribute("data-aj"); if (!k || i.type !== "range") return; started = true; api.pon(k, Number(i.value)); });
      seleccionaPestana(PESTANAS[0].id, false); pinta();
    }

    // ----- arranque
    var textoBtn = $("btnSonido"); if (textoBtn && textoBtn.parentNode) textoBtn.parentNode.removeChild(textoBtn);   // el 🔊 duplicado (decisión 89)
    var cs = $("cSonido"); if (cs) { cs.addEventListener("change", function () { api.pon("sonido.activo", cs.checked); }); var lab = cs.closest && cs.closest("label"); if (lab) lab.hidden = true; }
    ligaControl("exag", "vista.exag", "input"); ligaControl("corr", "vista.corr", "input");
    api.alCambiar(function (clave) { aplica(clave); pinta(); });
    if (window.matchMedia) { try { matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", function () { aplica("acc.movimiento"); }); matchMedia("(pointer: coarse)").addEventListener("change", function () { aplica("controles.tactil"); }); } catch (e) {} }
    api.claves().forEach(aplica);
    api.pinta = function () { construye(); pinta(); };   // por si el menú se crea después
    construye();
    return api;
  })();
