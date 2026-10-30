// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02_mundo (copas), 03_escena (visor, camera, modo), 09_camara (orb), 12_paseo (paseando), 14_historia (FINCA, aviso),
//   15_tiempo (rumbo), 16_vida (enQuad, quad, ponQuad, enDron, dron, ponDron), 29_vr (VRX), 32_ventanas (Ventanas)
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
    return { MODOS: MODOS, modoDe: modoDe, rumboCamara: rumboCamara, zonas: zonas };
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
      if (id === "chat") { document.dispatchEvent(new CustomEvent("gemelo:chat", { detail: { desde: desde || null } })); var ent = document.querySelector("#presenciaGente input[type=text]"); if (ent) ent.focus(); return; }
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
    setInterval(refresca, 250); setInterval(refrescaBrujula, 100); refresca(); mudaVR();
    return { aviso: aviso, zonasProhibidas: zonasProhibidas, modo: function () { return modoAct; }, cierraDesplegable: cierraDesplegable, alterna: alterna, ponModo: ponModo };
  })();

