// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: HudPersonalPuro
// Consume: 01_datos ($), 02c_componentes (Bus), 02e_entidades (Usables), 03_escena (modo), 09_camara (objetivo), 12_paseo (paseando),
//   13b_hazas (Hazas), 15_tiempo (horaMundoTexto), 29_vr (ficha), 31_hud (Hud)
// ===============================================================================
  // ---------- lo tuyo en pantalla (EV2-A4, doc/sistema/VIABILIDAD-INTERACCION.md): «hora · tu haza · hablar · volver» juntos, bajo el tiempo del HUD.
  // Es HTML (#hudPersonal en plantilla.html, clases en plantilla.css): 0 llamadas de dibujo y 0 estilos en línea. No reinventa nada: la hora es la del mundo
  // (15_tiempo.js), la haza es la de 13b_hazas.js (la misma ficha que la tecla H), hablar es el micrófono de 47_habla.js (por el Bus, «habla:alterna») y
  // volver es lo que ya hacen Inicio y 0 (Hud.alInicio). Se oculta con el ajuste «Mostrar hora, tu haza, hablar y volver» (vista.personal, 33_ajustes.js).
  // En VR no se ve (el HUD es de pantalla); su equivalente en la muñeca es EV2-A3, aparte.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/ux_hud_personal.test.js)
  var HudPersonalPuro = (function () {
    // la hora del mundo, "HH:MM" (si no, un guion: ni se inventa ni se rompe)
    function hora(txt) {
      var ok = typeof txt === "string" && /^[0-2][0-9]:[0-5][0-9]$/.test(txt), t = ok ? txt : "--:--";
      return { texto: t, nombre: ok ? "Hora del mundo: " + t + ". Abre el tiempo" : "Hora del mundo: sin dato. Abre el tiempo" };
    }
    // tu haza: h = { id, es_mia } de la haza donde estás, o null; hay = ¿se han leído hazas? (sin ellas, el botón no sale)
    function haza(h, hay) {
      if (!hay) return { visible: false, texto: "", nombre: "Tu haza" };
      if (!h) return { visible: true, texto: "Sin haza", nombre: "Sin haza: no estás dentro de ninguna haza. Avisa de ello" };
      return h.es_mia ? { visible: true, texto: "Tu haza", nombre: "Tu haza: estás en una haza tuya. Ver su ficha" }
        : { visible: true, texto: "Otra haza", nombre: "Otra haza: de otro hogar. Ver su ficha" };
    }
    // hablar: e = el estado de la voz ("voz:estado": dentro, guiada, puede, micro) o null. Solo sale dentro de una visita guiada y con permiso de hablar
    function hablar(e) {
      var vis = !!(e && e.dentro && e.guiada && e.puede), micro = e && typeof e.micro === "string" ? e.micro : "cerrado";
      if (!vis) return { visible: false, texto: "Hablar", nombre: "Hablar", pulsado: false };
      if (micro === "abriendo") return { visible: true, texto: "Abriendo…", nombre: "Abriendo…: el micrófono se está abriendo", pulsado: true };
      if (micro !== "cerrado") return { visible: true, texto: "Callar", nombre: "Callar: cerrar el micrófono", pulsado: true };
      return { visible: true, texto: "Hablar", nombre: "Hablar: abrir el micrófono", pulsado: false };
    }
    // volver: a la vista aérea; ya en ella, al inicio de la órbita (lo mismo que Inicio y 0)
    function volver(modo) { return { texto: "Volver", nombre: modo === "aereo" ? "Volver al inicio de la vista aérea" : "Volver a la vista aérea" }; }
    return { hora: hora, haza: haza, hablar: hablar, volver: volver };
  })();
  // [puro:fin]

  (function () {
    var cont = $("hudPersonal"); if (!cont) return;
    var bHora = $("hpHora"), bHaza = $("hpHaza"), bHablar = $("hpHablar"), bVolver = $("hpVolver");
    var tHora = $("hpHoraT"), tHaza = $("hpHazaT"), tHablar = $("hpHablarT"), voz = null;
    function ponTxt(el, t) { if (el && el.textContent !== t) el.textContent = t; }
    function ponAt(el, at, v) { if (el && el.getAttribute(at) !== v) el.setAttribute(at, v); }
    function hazaAqui() {   // donde estás: al pasear, donde andas; en la órbita, el punto al que miras (como la tecla H de 13b_hazas.js)
      try { return paseando ? Hazas.enPunto(pp.x, pp.y) : Hazas.enPunto(objetivo.x, -objetivo.z); } catch (e) { return null; }
    }
    function refresca() {
      var h = HudPersonalPuro.hora(horaMundoTexto());
      ponTxt(tHora, h.texto); ponAt(bHora, "aria-label", h.nombre);
      var hay = false; try { hay = !!Hazas.estado().activo; } catch (e) {}
      var z = HudPersonalPuro.haza(hay ? hazaAqui() : null, hay);
      if (bHaza.hidden === z.visible) bHaza.hidden = !z.visible;
      ponTxt(tHaza, z.texto); ponAt(bHaza, "aria-label", z.nombre);
      var hb = HudPersonalPuro.hablar(voz);
      if (bHablar.hidden === hb.visible) bHablar.hidden = !hb.visible;
      ponTxt(tHablar, hb.texto); ponAt(bHablar, "aria-label", hb.nombre); ponAt(bHablar, "aria-pressed", String(hb.pulsado));
      ponAt(bVolver, "aria-label", HudPersonalPuro.volver(Hud.modo()).nombre);
    }
    bHora.addEventListener("click", function () { Hud.alterna("tiempo", bHora); });
    bHaza.addEventListener("click", function () {   // lo mismo que la tecla H
      var q = hazaAqui();
      if (q) Usables.elige("haza:" + q.id, "tecla"); else Usables.mensaje("Hazas", [{ k: "Aquí", v: "No estás dentro de ninguna haza." }]);
    });
    bHablar.addEventListener("click", function () { Bus.emite("habla:alterna", {}); });
    bVolver.addEventListener("click", function () { Hud.alInicio(); });
    Bus.on("voz:estado", function (e) { voz = e || null; refresca(); });
    setInterval(refresca, 500); refresca();
  })();

