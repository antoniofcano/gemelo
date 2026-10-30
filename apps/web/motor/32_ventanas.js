// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Ventanas
// Consume: 01_datos ($), 03_escena (lienzo, visor), 08_marcadores (capas), 12_paseo (paseando, persona), 14_historia (FINCA, lista),
//   22_huellas (hSig), 29_vr (panel), 34_movibles (Movibles)
// ===============================================================================
  // ---------- las ventanas (doc/sistema/UX-FINCA-JUEGO.md §4.4, decisión 87): una grande a la vez, no modales (el mundo sigue vivo y se puede andar con el
  // teclado). Lateral bajo la barra en escritorio; hoja inferior (≤ 72 % del alto) en móvil vertical, que esconde la cruceta; lateral alto en móvil horizontal,
  // que esconde solo las acciones. Al abrir, el foco va al título; al cerrar, vuelve a quien la abrió.
  // Los nodos de antes se movieron dentro de las ventanas en la plantilla (13_parcelas.js, 15_tiempo.js, 14_historia.js y 10_ndvi.js no cambian).
  // Historia: al empezar el recorrido, la ventana se cierra y la escena sigue en una tarjeta arriba (#tarjetaRecorrido), como un registro de misiones.
  // Gente: el contenedor es #ventanaGente; si 26_presencia.js no lo rellena, al abrirla se mete dentro su panel de hoy (#presenciaGente) y al cerrarla vuelve.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/ux_ventanas.test.js)
  var VentanasPuro = (function () {
    var IDS = { mapa: "ventanaMapa", capas: "ventanaCapas", tiempo: "ventanaTiempo", historia: "ventanaHistoria", gente: "ventanaGente", ayuda: "ventanaAyuda" };
    // la forma de la ventana según el tamaño del visor (los mismos cortes que la barra: ≤ 560 px de ancho o ≤ 460 de alto)
    function forma(ancho, alto) { return ancho <= 560 ? "hoja" : alto <= 460 ? "alto" : "lateral"; }
    // la pestaña siguiente con el patrón ARIA (flechas, Inicio, Fin); −1 si la tecla no es de pestañas
    function pestanaSig(tecla, i, n) {
      return tecla === "ArrowRight" || tecla === "ArrowDown" ? (i + 1) % n : tecla === "ArrowLeft" || tecla === "ArrowUp" ? (i + n - 1) % n : tecla === "Home" ? 0 : tecla === "End" ? n - 1 : -1;
    }
    return { IDS: IDS, forma: forma, pestanaSig: pestanaSig };
  })();
  // [puro:fin]

  var Ventanas = (function () {
    var actual = null, vuelta = null, gente = { nodo: null, padre: null, sig: null };
    function el(id) { return $(VentanasPuro.IDS[id] || ""); }
    function marcaIconos(id, si) { Array.prototype.forEach.call(document.querySelectorAll('#hud [data-abre="' + id + '"][aria-expanded]'), function (b) { b.setAttribute("aria-expanded", String(si)); }); }
    function revisaFlotantes() { if (typeof Movibles !== "undefined" && Movibles && Movibles.revisa) setTimeout(function () { Movibles.revisa(); }, 0); }
    function formaVisor() {
      var f = VentanasPuro.forma(visor.clientWidth, visor.clientHeight);
      ["hoja", "alto", "lateral"].forEach(function (k) { visor.classList.toggle("forma-" + k, k === f); });
      visor.classList.toggle("con-ventana", !!actual); visor.classList.toggle("con-hoja", !!actual && f === "hoja"); visor.classList.toggle("con-lateral", !!actual && f === "alto");
    }
    function meteGente() {   // si nadie ha rellenado #ventanaGente, el panel de la presencia entra mientras está abierta
      var cu = $("ventanaGenteCuerpo"), pg = $("presenciaGente");
      if (!cu || !pg || cu.contains(pg) || cu.children.length) return;
      gente.nodo = pg; gente.padre = pg.parentNode; gente.sig = pg.nextSibling; cu.appendChild(pg);
    }
    function sacaGente() {
      var g = gente; if (!g.nodo || !g.padre) return;
      if (document.contains(g.padre)) g.padre.insertBefore(g.nodo, g.sig && g.sig.parentNode === g.padre ? g.sig : null);
      gente.nodo = gente.padre = gente.sig = null;
    }
    function abre(id, desde) {
      var v = el(id); if (!v) return false;
      if (actual === id) { var t0 = v.querySelector("h2"); if (t0) t0.focus({ preventScroll: true }); return true; }
      if (actual) cierra(true);
      vuelta = desde || (document.activeElement !== document.body ? document.activeElement : null);
      actual = id; if (id === "gente") meteGente();
      v.hidden = false; marcaIconos(id, true); formaVisor();
      var t = v.querySelector("h2"); if (t) t.focus({ preventScroll: true });
      revisaFlotantes(); return true;
    }
    function cierra(sinFoco) {
      if (!actual) return false;
      var v = el(actual); if (v) v.hidden = true; marcaIconos(actual, false);
      if (actual === "gente") sacaGente();
      actual = null; formaVisor();
      var b = vuelta; vuelta = null;
      if (!sinFoco && b && b.focus && document.contains(b) && b.getClientRects().length) b.focus({ preventScroll: true });
      else if (!sinFoco && paseando) lienzo.focus({ preventScroll: true });
      revisaFlotantes(); return true;
    }
    // pestañas dentro de una ventana (Tiempo: Ahora / Próximas 72 h / El olivo)
    function eligePestana(t, foco) {
      var lista = t.closest('[role="tablist"]'); if (!lista) return;
      Array.prototype.forEach.call(lista.querySelectorAll('[role="tab"]'), function (p) { var si = p === t; p.setAttribute("aria-selected", String(si)); p.tabIndex = si ? 0 : -1; var pnl = $(p.getAttribute("aria-controls")); if (pnl) pnl.hidden = !si; });
      if (foco) t.focus();
    }
    function pestana(nombre) { var t = document.querySelector('.ventana [role="tab"][data-pestana="' + nombre + '"]'); if (t) eligePestana(t, false); }
    Array.prototype.forEach.call(document.querySelectorAll('.ventana [role="tablist"]'), function (lista) {
      var tabs = Array.prototype.slice.call(lista.querySelectorAll('[role="tab"]'));
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { eligePestana(t, false); });
        t.addEventListener("keydown", function (e) { var j = VentanasPuro.pestanaSig(e.key, i, tabs.length); if (j < 0) return; e.preventDefault(); e.stopPropagation(); eligePestana(tabs[j], true); });
      });
    });
    // la × de cada ventana; y en una ventana, escribir o usar sus controles no mueve al paseante (las flechas mueven un deslizador, no a la persona)
    Array.prototype.forEach.call(document.querySelectorAll(".ventana"), function (v) {
      Array.prototype.forEach.call(v.querySelectorAll("[data-cierra]"), function (b) { b.addEventListener("click", function () { cierra(); }); });
      v.addEventListener("keydown", function (e) { var t = e.target && e.target.tagName; if ((t === "INPUT" || t === "SELECT" || t === "TEXTAREA") && e.key !== "Escape") e.stopPropagation(); });
    });

    // --- el recorrido de la historia en su tarjeta: 14_historia.js enseña y esconde #hCuerpo; aquí se muda de la ventana a la tarjeta y vuelve
    var hc = $("hCuerpo"), tarjeta = $("tarjetaRecorrido"), casaH = hc && hc.parentNode;
    function mudaRecorrido() {
      if (!hc || !tarjeta) return;
      if (!hc.hidden && hc.parentNode !== tarjeta) { if (actual === "historia") cierra(true); tarjeta.appendChild(hc); tarjeta.hidden = false; if ($("hSig")) $("hSig").focus({ preventScroll: true }); revisaFlotantes(); }
      else if (hc.hidden && hc.parentNode === tarjeta) { casaH.appendChild(hc); tarjeta.hidden = true; revisaFlotantes(); }
    }
    if (hc && window.MutationObserver) new MutationObserver(mudaRecorrido).observe(hc, { attributes: true, attributeFilter: ["hidden"] });
    var rc = $("recCerrar"); if (rc) rc.addEventListener("click", function () { $("hFin").click(); });

    window.addEventListener("resize", formaVisor); formaVisor();
    return {
      abre: abre, cierra: function () { return cierra(false); }, abierta: function () { return actual; }, pestana: pestana,
      recorrido: function () { return !!(tarjeta && !tarjeta.hidden); }
    };
  })();

