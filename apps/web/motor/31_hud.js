// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Hud
// Consume: 01_datos ($), 02_mundo (copas), 03_escena (lienzo, visor, camera, modo), 08_marcadores (capas), 09_camara (orb),
//   12_paseo (paseando, teclas), 14_historia (FINCA, aviso), 15_tiempo (meta, rumbo, esc), 16_vida (enQuad, quad, ponQuad, enDron, dron, ponDron),
//   24_pantalla (Menu), 29_vr (VRX, ficha), 32_ventanas (Ventanas), 33_ajustes (Ajustes), 34_movibles (Movibles)
// ===============================================================================
  // ---------- el HUD (doc/sistema/UX-FINCA-JUEGO.md §4.3): estado arriba a la izquierda (brújula, cómo te mueves, el tiempo), barra de iconos arriba a la
  // derecha, avisos arriba en el centro, «Pasear» y la atribución abajo en el centro. Es HTML y CSS: no toca triángulos ni llamadas de dibujo.
  // El selector de modo llama a lo que ya existía (btnPaseo, ponQuad, ponDron); el botón de VR (29_vr.js lo crea junto a #btnPantalla) se muda junto al selector.
  // Expone Hud.aviso(texto, ms), Hud.zonasProhibidas() (para 34_movibles.js) y Hud.modo().
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/ux_hud.test.js)
  var HudPuro = (function () {
    var MODOS = {
      aereo: { ico: "🛰", txt: "Vista aérea" }, pie: { ico: "🚶", txt: "A pie" }, quad: { ico: "🏍", txt: "Quad" }, dron: { ico: "🚁", txt: "Dron" }
    };
    // cómo te mueves ahora, de los indicadores del motor
    function modoDe(paseando, enQuad, enDron) { return !paseando ? "aereo" : enDron ? "dron" : enQuad ? "quad" : "pie"; }
    // rumbo de la cámara en grados desde el norte (el norte del mundo es −z; el este, +x), de 0 a 360, a partir de su dirección horizontal
    function rumboCamara(dx, dz) { var a = Math.atan2(dx, -dz) * 180 / Math.PI; return (a % 360 + 360) % 360; }
    // los rectángulos que no se tapan, en coordenadas del visor (sin los vacíos ni los ocultos: ancho o alto 0)
    function zonas(elems, base) {
      return elems.filter(function (z) { return z.r && z.r.width > 0 && z.r.height > 0; })
        .map(function (z) { return { id: z.id, x: z.r.left - base.left, y: z.r.top - base.top, w: z.r.width, h: z.r.height }; });
    }
    // controles táctiles (decisión 85): el ajuste «controles.tactil» manda (si / no); en automático, la pantalla con dedo (pointer: coarse)
    function tactil(ajuste, coarse) { return ajuste === "si" ? true : ajuste === "no" ? false : !!coarse; }
    function zurda(mano) { return mano === "zurda"; }
    // el mapa de teclas (decisión 84, §4.7): 1–6 ventanas, F1 ayuda, F pantalla completa, Inicio o 0 vista aérea, Intro pasear (en vista aérea), Esc como en
    // un juego. Las teclas de letra y número no hacen nada con el foco en un campo (WCAG 2.1.4); Intro sobre un botón es su clic; con Ctrl, Alt o Cmd, nada
    var VENT = { Digit1: "mapa", Digit2: "capas", Digit3: "tiempo", Digit4: "historia", Digit5: "gente", Digit6: "chat",
      Numpad1: "mapa", Numpad2: "capas", Numpad3: "tiempo", Numpad4: "historia", Numpad5: "gente", Numpad6: "chat" };
    function accionTecla(t, est) {
      if (t.ctrl || t.meta || t.alt) return null;
      if (t.code === "Escape") return "esc";
      if (est.campo) return null;
      if (t.code === "F1") return "v:ayuda";
      if (VENT[t.code]) return "v:" + VENT[t.code];
      if (t.code === "KeyF") return "pantalla";
      if (t.code === "Home" || t.code === "Digit0" || t.code === "Numpad0") return "aereo";
      if ((t.code === "Enter" || t.code === "NumpadEnter") && !est.paseando && !est.boton) return "pasear";
      return null;
    }
    // Esc cierra lo último abierto, en este orden; si no hay nada, abre el menú
    function ordenEsc(est) { return est.desplegable ? "desplegable" : est.ficha ? "ficha" : est.baliza ? "baliza" : est.ventana ? "ventana" : est.recorrido ? "recorrido" : "menu"; }
    return { MODOS: MODOS, modoDe: modoDe, rumboCamara: rumboCamara, zonas: zonas, tactil: tactil, zurda: zurda, accionTecla: accionTecla, ordenEsc: ordenEsc };
  })();
  // [puro:fin]

  var Hud = (function () {
    var cont = $("hudAvisos"), modoAct = "";
    function aviso(texto, ms) {
      if (!cont) return null;
      var d = document.createElement("div"); d.className = "cristal hud-aviso"; d.textContent = texto; cont.appendChild(d);
      while (cont.children.length > 3) cont.removeChild(cont.firstChild);   // como mucho tres a la vez
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, ms || 4000);
      return d;
    }
    function zonasProhibidas() {
      var base = visor.getBoundingClientRect();
      return HudPuro.zonas(["padMov", "padAcc", "hudBarra", "hudEstado", "bPasear"].map(function (id) { var e = $(id); return { id: id, r: e && e.getClientRects().length ? e.getBoundingClientRect() : null }; }), base);
    }

    // --- el selector de modo (Vista aérea / A pie / Quad / Dron)
    var bModo = $("hudModo"), menuModo = $("hudModoMenu");
    function abreModo(si) { if (!menuModo) return; menuModo.hidden = !si; bModo.setAttribute("aria-expanded", String(si)); if (si) { var a = menuModo.querySelector('[aria-checked="true"]') || menuModo.querySelector("button"); if (a) a.focus(); } }
    function ponModo(m) {
      if (m === "aereo") { if (paseando) $("btnPaseo").click(); return; }
      if (!paseando) $("btnPaseo").click();   // entrar a pie primero (al entrar, el paseo guarda el vehículo)
      if (m === "pie") { if (enQuad) ponQuad(false); if (enDron) ponDron(false); }
      else if (m === "quad") { if (!enQuad) ponQuad(true); }
      else if (m === "dron") { if (!enDron) ponDron(true); }
    }
    if (bModo && menuModo) {
      bModo.addEventListener("click", function () { abreModo(menuModo.hidden); });
      Array.prototype.forEach.call(menuModo.querySelectorAll("[data-modo]"), function (b, i, todos) {
        b.addEventListener("click", function () { abreModo(false); bModo.focus(); ponModo(b.getAttribute("data-modo")); });
        b.addEventListener("keydown", function (e) {   // patrón de menú: flechas arriba/abajo, Inicio, Fin; Esc lo cierra (31_hud: teclado)
          var n = todos.length, j = e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowUp" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
          if (j >= 0) { e.preventDefault(); e.stopPropagation(); todos[j].focus(); }
        });
      });
    }
    // --- «⋯»: en pantallas estrechas, los iconos que no caben
    var bMas = $("bMas"), hMas = $("hudMas");
    function abreMas(si) { if (!hMas) return; hMas.hidden = !si; bMas.setAttribute("aria-expanded", String(si)); }
    if (bMas && hMas) bMas.addEventListener("click", function () { abreMas(hMas.hidden); });
    // un toque fuera cierra los desplegables
    document.addEventListener("pointerdown", function (e) {
      if (menuModo && !menuModo.hidden && !menuModo.contains(e.target) && e.target !== bModo && !bModo.contains(e.target)) abreModo(false);
      if (hMas && !hMas.hidden && !hMas.contains(e.target) && e.target !== bMas) abreMas(false);
    }, true);
    function cierraDesplegable() {   // para Esc: devuelve true si había uno abierto
      if (menuModo && !menuModo.hidden) { abreModo(false); bModo.focus(); return true; }
      if (hMas && !hMas.hidden) { abreMas(false); bMas.focus(); return true; }
      return false;
    }

    // --- la barra: cada icono abre (o cierra) su ventana; el chat es flotante (34_movibles.js / 26_presencia.js)
    function alterna(id, desde) {
      abreMas(false);
      if (id === "chat") {   // el chat flotante de 26_presencia.js: minimizado (burbuja) → se abre; abierto → se minimiza
        document.dispatchEvent(new CustomEvent("gemelo:chat", { detail: { desde: desde || null } }));
        var raizC = $("presenciaGente"), burb = $("presenciaBurbuja");
        if (raizC && raizC.hidden && burb) burb.click();
        else if (raizC) { var bm = raizC.querySelector('button[aria-label="Minimizar el chat"]'); if (bm) bm.click(); }
        return;
      }
      if (typeof Ventanas !== "undefined" && Ventanas) { if (Ventanas.abierta() === id) Ventanas.cierra(); else Ventanas.abre(id, desde); }
    }
    Array.prototype.forEach.call(document.querySelectorAll("#hud [data-abre]"), function (b) {
      b.addEventListener("click", function () { alterna(b.getAttribute("data-abre"), b.closest("#hudMas") ? bMas : b); if (b.hasAttribute("data-pestana") && typeof Ventanas !== "undefined" && Ventanas) Ventanas.pestana(b.getAttribute("data-pestana")); });
    });
    var bPant = hMas && hMas.querySelector('[data-accion="pantalla"]'); if (bPant) bPant.addEventListener("click", function () { abreMas(false); $("btnPantalla").click(); });
    var chip = $("tIns"); if (chip) chip.addEventListener("click", function () { alterna("tiempo", chip); });

    // --- la brújula gira con la cámara; tocarla = mirar al norte
    var bru = $("norte"), aguja = $("hudAguja"), vDir = new THREE.Vector3(), rumboAnt = -1;
    if (bru) bru.addEventListener("click", function () {
      if (VRX.on) return;
      if (paseando) { if (enDron) dr.yaw = 0; else pp.ang = 0; } else orb.az = 0;   // en la órbita, con az = 0 la cámara apunta hacia −z (el norte)
    });

    // --- el botón de VR (si hay WebXR, 29_vr.js lo crea junto a #btnPantalla): se muda junto al selector de modo, siempre a la vista
    function mudaVR() {
      var b = $("btnVR"), fila = bModo && bModo.parentNode; if (!b || !fila || b.parentNode === fila) return;
      fila.insertBefore(b, menuModo); b.className = "boton hud-vr"; b.textContent = "🥽 VR"; b.setAttribute("aria-label", "Entrar en VR (gafas de realidad virtual)");
    }
    var barra = $("hudBarra"); if (barra && window.MutationObserver) new MutationObserver(mudaVR).observe(barra, { childList: true });

    // --- el estado del HUD, cuatro veces por segundo (barato: solo atributos cuando cambian)
    function ponAt(el, at, v) { if (el && el.getAttribute(at) !== v) el.setAttribute(at, v); }
    function refresca() {
      var m = HudPuro.modoDe(paseando, enQuad, enDron);
      if (m !== modoAct) {
        modoAct = m; var M = HudPuro.MODOS[m];
        if ($("hudModoIco")) $("hudModoIco").textContent = M.ico; if ($("hudModoTxt")) $("hudModoTxt").textContent = M.txt;
        if (bModo) bModo.setAttribute("aria-label", "Cómo te mueves: " + M.txt + ". Cambiar");
        if (menuModo) Array.prototype.forEach.call(menuModo.querySelectorAll("[data-modo]"), function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-modo") === m)); });
        ["aereo", "pie", "quad", "dron"].forEach(function (k) { visor.classList.toggle("modo-" + k, k === m); });
      }
      // gente y chat: solo en el mundo en red (26_presencia.js crea #presenciaGente al conectarse)
      var red = !!$("presenciaGente") || !!$("ventanaGenteCuerpo") && $("ventanaGenteCuerpo").children.length > 0;
      Array.prototype.forEach.call(document.querySelectorAll('#hud [data-abre="gente"], #hud [data-abre="chat"]'), function (b) { if (b.hidden === red) b.hidden = !red; });
      // la historia: sin recorrido para esta finca (genera_motor.mjs la oculta), sin icono
      var hi = $("historia"), sinHist = hi && getComputedStyle(hi).display === "none";
      Array.prototype.forEach.call(document.querySelectorAll('#hud [data-abre="historia"]'), function (b) { if (b.hidden !== !!sinHist) b.hidden = !!sinHist; });
      // la leyenda NDVI, abajo, solo con la capa o con las copas coloreadas
      var nh = $("ndviHud"), conNdvi = ($("cNdvi") && $("cNdvi").checked) || ($("cTinte") && $("cTinte").checked); if (nh && nh.hidden === !!conNdvi) nh.hidden = !conNdvi;
    }
    function refrescaBrujula() {
      if (!aguja || VRX.on) return;
      camera.getWorldDirection(vDir); if (Math.abs(vDir.x) + Math.abs(vDir.z) < 1e-4) return;
      var r = Math.round(HudPuro.rumboCamara(vDir.x, vDir.z)); if (r === rumboAnt) return; rumboAnt = r;
      aguja.style.transform = "rotate(" + (-r) + "deg)";
      ponAt(bru, "aria-label", "Brújula: miras al " + ["norte", "nordeste", "este", "sudeste", "sur", "suroeste", "oeste", "noroeste"][Math.round(r / 45) % 8] + ". Toca para mirar al norte");
    }
    // --- pulgares (U5): la cruceta y las acciones solo en pantallas táctiles (o con el ajuste), cruceta a la izquierda y acciones a la derecha;
    // «mano zurda» (Configuración, 33_ajustes.js: controles.tactil y controles.mano) las cambia de lado. Si 33_ajustes.js no está, automático y diestra.
    var mmCoarse = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
    function ajuste(k, def) { try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.lee) { var v = Ajustes.lee(k); if (v !== undefined && v !== null && v !== "") return v; } } catch (e) {} return def; }
    function aplicaPulgares() {   // los mismos atributos que pone 33_ajustes.js en <html> (data-tactil si/no, data-mano), por si no está
      var raiz = document.documentElement, hayAj = typeof Ajustes !== "undefined" && Ajustes && Ajustes.tactil;
      var t = hayAj ? !!Ajustes.tactil() : HudPuro.tactil(ajuste("controles.tactil", "auto"), mmCoarse && mmCoarse.matches), z = HudPuro.zurda(ajuste("controles.mano", "diestra"));
      var vt = t ? "si" : "no", vm = z ? "zurda" : "diestra";
      if (raiz.getAttribute("data-tactil") === vt && raiz.getAttribute("data-mano") === vm) return;
      raiz.setAttribute("data-tactil", vt); raiz.setAttribute("data-mano", vm);
      if (typeof Movibles !== "undefined" && Movibles && Movibles.revisa) setTimeout(function () { Movibles.revisa(); }, 0);   // apareció o se movió la cruceta
    }
    if (mmCoarse) { if (mmCoarse.addEventListener) mmCoarse.addEventListener("change", aplicaPulgares); else if (mmCoarse.addListener) mmCoarse.addListener(aplicaPulgares); }
    setTimeout(function () {   // tras montar todos los módulos: 33_ajustes.js va después de este
      try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.alCambiar) Ajustes.alCambiar(function (k) { if (!k || k === "controles.tactil" || k === "controles.mano") aplicaPulgares(); }); } catch (e) {}
      aplicaPulgares();
    }, 0);
    aplicaPulgares();

    // --- el teclado (U7)
    function visible(el) { return !!(el && !el.hidden && el.getClientRects().length); }
    function esc() {
      var V = typeof Ventanas !== "undefined" && Ventanas ? Ventanas : null, bal = $("baliza");
      var q = HudPuro.ordenEsc({ desplegable: (menuModo && !menuModo.hidden) || (hMas && !hMas.hidden), ficha: visible($("ficha")), baliza: visible(bal) && !!bal.querySelector(".cerrar-baliza"),
        ventana: !!(V && V.abierta()), recorrido: !!(V && V.recorrido()) });
      if (q === "desplegable") cierraDesplegable();
      else if (q === "ficha") { $("ficha").hidden = true; if (paseando) lienzo.focus({ preventScroll: true }); }
      else if (q === "baliza") bal.querySelector(".cerrar-baliza").click();
      else if (q === "ventana") V.cierra();
      else if (q === "recorrido") $("hFin").click();
      else if (typeof Menu !== "undefined" && Menu) Menu.abre();
    }
    window.addEventListener("keydown", function (e) {
      if (VRX.on || (typeof Menu !== "undefined" && Menu && Menu.abierto())) return;   // el menú es un <dialog>: Esc lo cierra él solo
      var el = e.target, t = el && el.tagName;
      var a = HudPuro.accionTecla({ code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey },
        { campo: t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || !!(el && el.isContentEditable), paseando: paseando, boton: t === "BUTTON" || t === "A" || t === "SUMMARY" });
      if (!a || (e.repeat && a !== "esc")) return;
      e.preventDefault();
      if (a === "esc") esc();
      else if (a.indexOf("v:") === 0) alterna(a.slice(2), null);
      else if (a === "pantalla") $("btnPantalla").click();
      else if (a === "aereo") { if (paseando) $("btnPaseo").click(); else $("reiniciar").click(); }
      else if (a === "pasear") $("btnPaseo").click();
    });

    setInterval(refresca, 250); setInterval(refrescaBrujula, 100); refresca(); mudaVR();
    return { aviso: aviso, zonasProhibidas: zonasProhibidas, modo: function () { return modoAct; }, cierraDesplegable: cierraDesplegable, alterna: alterna, ponModo: ponModo };
  })();

