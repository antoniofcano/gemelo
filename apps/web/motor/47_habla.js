// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02c_componentes (Teclas, Componentes), 02d_laminas (Laminas), 03_escena (visor, modo), 09_camara (suelta),
//   12_paseo (persona, teclas), 14_historia (aviso), 15_tiempo (hace), 16_vida (quita), 29_vr (VRX, panel, PanelVR), 33_ajustes (Ajustes)
// Nota: Componente «habla-guiada» (F3e, ADR-0026; decisiones 157-162): la interacción de la voz en la visita guiada, solo dentro de una sala guiada y con papel. «Hablar» con botón (≥ 44 px; 56 en el navegador de Quest), tecla T y, en VR, el gatillo izquierdo (VRX.voz, que 29_vr.js lee cada fotograma), en dos modos según el ajuste «Hablar» de Configuración: pulsar para abrir y cerrar (por defecto) o mantener pulsado (familias; el guía siempre pulsa y abre su micro con el primer gesto, una vez). Sin la palabra, «Levantar la mano» / «Bajar la mano» por la api de F3c y «Estás 2.º en la cola» (la cola, de la api «Guiada» de 46). El micro siempre con icono y texto en una región aria-live; «Silenciarme» siempre a mano; el aviso de que con el micro abierto el sonido no es espacial y la casilla «Llevo auriculares» (Voz.auriculares). En VR, una lámina de 3 s al abrir o cerrar, una fila del panel («Ir a») y un pulso del mando. Emite «habla:micro» y «habla:mano»; escucha «voz:estado», «guiada:palabra» y «depura:lineas». ?habla=0 lo apaga. Publica window.__habla (pruebas). Todo con textContent. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/habla.test.js.
// ===============================================================================
  // ---------- hablar en la visita guiada (F3e; ADR-0026, decisiones 157-162; COMPONENTES §F3e).
  // Componente «habla-guiada» (ADR-0023; ?habla=0 lo apaga): la interacción de la voz. Por qué un módulo nuevo y no dentro de 46_guiada.js: 46 es la
  // moderación (el guía, la palabra, el cierre), esto es lo que hace cada persona con SU micrófono, y su lógica (modos, estados, textos) se prueba aparte.
  // No habla con LiveKit ni toca permisos: abre y cierra el micro con Voz.abre/cierra (45_voz.js, que exige permiso y gesto) y levanta o baja la mano por la
  // api de F3c (POST/DELETE /api/presencia/guiadas/:evento/mano). Quién eres, el evento y la cola los lee de «visita-guiada» (46_guiada.js, api «Guiada»).
  //  · SOLO dentro de una sala guiada y con papel (guía, oficina o familia); montado y fuera de ella, no crea nada.
  //  · «Hablar» (decisión 158): con permiso (el guía siempre; la familia, mientras tiene la palabra), un botón en pantalla (táctil ≥ 44 px, 56 en el navegador
  //    de Quest), la tecla T y, en VR, el gatillo IZQUIERDO. Dos modos, un ajuste en Configuración («Hablar»): «pulsar» (abre y cierra, por defecto) y «mantener»
  //    (abre mientras se aprieta; para las familias; el guía siempre pulsa). Sin la palabra, en su lugar «Levantar la mano» / «Bajar la mano» y «Estás 2.º en la
  //    cola». Nada abre el micro sin un gesto (lo comprueba Voz.abre); el guía lo abre solo con el primer gesto de la sala (una vez; si se silencia, no se reabre).
  //  · EL MICRO SE VE: una línea con icono y TEXTO («Micrófono abierto: te oyen», «cerrado», «sin permiso», «el navegador no deja») en una región aria-live; nunca
  //    solo color. «Silenciarme» siempre a mano (el mismo botón en pulsar; uno aparte en mantener; la tecla T; el gatillo). En VR, una lámina de 3 s al abrir o
  //    cerrar, una fila del panel («Ir a») y un pulso corto del mando (si lo tiene).
  //  · EL AVISO DEL ECO (decisión 160): con el micro abierto y sin «Llevo auriculares», «Con el micrófono abierto el sonido no es espacial; con auriculares sí».
  //    La casilla llama a Voz.auriculares(): no se guarda (quien se quita los auriculares tiene que poder decirlo al momento).
  //  · 29_vr.js le da el gatillo izquierdo (VRX.voz: toma() y mando()): mientras sea el micro, no pulsa nada con el rayo; la mano derecha sigue con el panel.
  // Todo con textContent; lo que llega de la sala es dato (46 ya lo valida). Sin grabación. Presupuesto: DOM; en VR, 1 llamada y 2 triángulos solo durante los 3 s de la lámina.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/habla.test.js)
  var HablaPuro = (function () {
    var MODOS = ["pulsar", "mantener"], DEFECTO = "pulsar", SALA = /^guiada-([1-9][0-9]{0,9})$/, MANO_MS = 3000, AVISO_S = 3, MENSAJE_S = 6;
    var AVISO_ESPACIAL = "Con el micrófono abierto el sonido no es espacial; con auriculares sí.";
    function modo(v) { return MODOS.indexOf(v) >= 0 ? v : DEFECTO; }
    function evento(sala) { var m = typeof sala === "string" ? SALA.exec(sala) : null; return m ? Number(m[1]) : null; }
    function modera(papel) { return papel === "guia" || papel === "oficina"; }
    function ordinal(n) { return n + ".º"; }
    // el puesto (1 = la siguiente) de esta identidad en la cola de manos que da 46 (en orden de llegada), o null
    function puestoDe(manos, yo) { var i = Array.isArray(manos) && typeof yo === "string" && yo ? manos.indexOf(yo) : -1; return i >= 0 ? i + 1 : null; }
    function textoCola(puesto) { return typeof puesto === "number" && puesto >= 1 ? "Estás " + ordinal(Math.floor(puesto)) + " en la cola." : "Tienes la mano levantada."; }
    // el micro, con icono y TEXTO: e = { papel, puede, micro (cerrado|abriendo|abierto), motivo } → { clave, icono, texto }
    function textoMicro(e) {
      if (e.micro === "abierto") return { clave: "abierto", icono: "🎙", texto: "Micrófono abierto: te oyen." };
      if (e.micro === "abriendo") return { clave: "abriendo", icono: "⏳", texto: "Abriendo el micrófono…" };
      if (e.motivo === "micro_denegado") return { clave: "denegado", icono: "🚫", texto: "El navegador no deja usar el micrófono: permítelo en los ajustes del sitio." };
      if (e.motivo === "sin_micro") return { clave: "sin_micro", icono: "🚫", texto: "No se encuentra ningún micrófono." };
      if (e.motivo === "error_micro") return { clave: "error", icono: "🚫", texto: "No se pudo abrir el micrófono." };
      if (!e.puede) return { clave: "sin_permiso", icono: "🚫", texto: e.papel === "familia" ? "Micrófono cerrado: no tienes la palabra." : "Micrófono sin permiso." };
      return { clave: "cerrado", icono: "🔇", texto: "Micrófono cerrado: no te oyen." };
    }
    // lo que se enseña: e = { guiada, papel, puede, micro, motivo, auriculares, mano (¿la tienes levantada?), puesto (n | null), ocupado (¿una petición en vuelo?) }, m = modo
    function vista(e, m) {
      m = modo(m);
      if (!e || !e.guiada || ["guia", "oficina", "familia"].indexOf(e.papel) < 0) return { visible: false, micro: null, primaria: { accion: "ninguna", texto: "", aria: "", off: true }, silenciar: false, cola: "", auric: false, aviso: "" };
      var abierto = e.micro !== "cerrado", mant = m === "mantener" && !modera(e.papel), t = textoMicro(e), p;
      if (e.puede || abierto) {
        p = abierto
          ? { accion: "micro", texto: mant ? "Hablando · suelta para callar" : "Silenciarme", aria: mant ? "Hablando: suelta para silenciar tu micrófono" : "Silenciar mi micrófono" }
          : { accion: "micro", texto: mant ? "Mantén pulsado para hablar" : "Hablar", aria: mant ? "Mantén pulsado para hablar" : "Hablar: abrir mi micrófono" };
        p.off = e.micro === "abriendo" && !mant;
      } else if (e.papel === "familia") {
        p = e.mano ? { accion: "bajar", texto: "Bajar la mano", aria: "Bajar la mano", off: !!e.ocupado } : { accion: "levantar", texto: "Levantar la mano", aria: "Levantar la mano para pedir la palabra", off: !!e.ocupado };
      } else p = { accion: "ninguna", texto: "Sin permiso de micrófono", aria: "Sin permiso de micrófono", off: true };
      return { visible: true, micro: t, primaria: p, silenciar: abierto && p.accion === "micro" && mant,
        cola: e.papel === "familia" && !e.puede && e.mano ? textoCola(e.puesto) : "", auric: !!e.puede || abierto, aviso: abierto && !e.auriculares ? AVISO_ESPACIAL : "" };
    }
    // un gesto sobre el botón, la tecla o el gatillo: o = { modo, papel, tipo ("baja" | "suelta"), micro, sosten (¿lo abrió este mismo gesto, aún apretado?) }
    // → { accion: "abre" | "cierra" | "nada", sosten }. «baja» alterna (abre si está cerrado; si no, cierra); en mantener, «suelta» cierra lo que abrió «baja»
    function entrada(o) {
      var mant = modo(o.modo) === "mantener" && !modera(o.papel);
      if (o.tipo === "baja") return o.micro === "cerrado" ? { accion: "abre", sosten: mant } : { accion: "cierra", sosten: false };
      if (o.tipo === "suelta" && mant && o.sosten) return { accion: o.micro === "cerrado" ? "nada" : "cierra", sosten: false };
      return { accion: "nada", sosten: !!o.sosten && o.tipo !== "suelta" };
    }
    // ¿se puede usar esto como micro ahora (la tecla y el gatillo lo respetan)?
    function activo(v) { return !!(v && v.visible && v.primaria.accion === "micro"); }
    // el texto único de la región aria-live: el micro y, si hay, la cola
    function textoEstado(v) { return v && v.visible ? v.micro.texto + (v.cola ? " " + v.cola : "") : ""; }
    return { MODOS: MODOS, DEFECTO: DEFECTO, MANO_MS: MANO_MS, AVISO_S: AVISO_S, MENSAJE_S: MENSAJE_S, AVISO_ESPACIAL: AVISO_ESPACIAL, modo: modo, evento: evento, modera: modera, ordinal: ordinal, puestoDe: puestoDe,
      textoCola: textoCola, textoMicro: textoMicro, vista: vista, entrada: entrada, activo: activo, textoEstado: textoEstado };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa en Node pruebas/guardianes/habla.test.js con un DOM, una voz y una guiada de mentira)
  function HablaMotor(n, Vz, Gd) {
    var H = HablaPuro, modoAj = H.DEFECTO, v = null, ult = "", mensaje = "", tMsg = 0, puntero = false, sosten = "", pulsa = null, pidiendo = false, manoSup = null, ultMicro = "cerrado", autoEv = null, vivo = true, tLam = 0;
    var caja = null, estadoEl = null, icoEl = null, txtEl = null, boton = null, silencio = null, casilla = null, avisoEl = null, quitaFila = null, abriendoP = null;
    var est = { aperturas: 0, cierres: 0, manos: 0, errores: 0, teclas: 0, gatillos: 0, autos: 0 }, LAM = "habla-micro";
    function el(tag, props, hijos) { var e = document.createElement(tag); if (props) Object.keys(props).forEach(function (k) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
    function vr() { return !!(VRX && VRX.on); }
    function px() { return typeof navigator !== "undefined" && /OculusBrowser|Quest/i.test(navigator.userAgent || "") ? 56 : 44; }

    // ---- lo que se sabe: de la voz (permiso, micro, papel, sala) y de la guiada (quién eres y la cola)
    function lee() {
      var s = Vz ? Vz.estado() : null, g = Gd ? Gd.estado() : null;
      if (!s) return { guiada: false, papel: "", puede: false, micro: "cerrado", motivo: "", auriculares: false, mano: false, puesto: null, ocupado: false, evento: null };
      var puesto = g && g.evento === H.evento(s.sala) ? H.puestoDe(g.manos, g.yo) : null, dicho = manoSup && Date.now() < manoSup.hasta ? manoSup : null;
      // la api acaba de contestar y el atributo «mano» aún no ha llegado por la sala: durante 3 s vale lo que dijo la api
      if (dicho) puesto = dicho.v ? (puesto !== null ? puesto : dicho.puesto || null) : null;
      return { guiada: !!s.guiada, papel: s.papel, puede: !!s.puede, micro: s.micro, motivo: s.motivo || "", auriculares: !!s.auriculares, mano: dicho ? dicho.v : puesto !== null,
        puesto: puesto, ocupado: pidiendo, evento: H.evento(s.sala) };
    }
    function vista() { var e = lee(); return { e: e, v: H.vista(e, modoAj) }; }

    // ---- el micro: abrir y cerrar (Voz exige el permiso y el gesto; aquí solo se pide)
    function abre(fuente) {
      if (!Vz) return Promise.resolve(false);
      var w = vista(); if (w.e.papel === "guia") autoEv = w.e.evento;   // si ya lo abrió él, no hay que abrirlo solo
      est.aperturas++; n.emite("habla:micro", { accion: "abre", fuente: fuente, modo: modoAj });
      abriendoP = Vz.abre(); var p = abriendoP; p.then(function () { if (abriendoP === p) abriendoP = null; }, function () { if (abriendoP === p) abriendoP = null; });
      return p;
    }
    function cierra(fuente) {
      if (!Vz) return Promise.resolve(true);
      est.cierres++; n.emite("habla:micro", { accion: "cierra", fuente: fuente, modo: modoAj });
      var w = vista(); if (w.e.papel === "guia") autoEv = w.e.evento;   // quien se silencia no se reabre solo
      // soltado (o pulsado de nuevo) mientras se abría: se cierra en cuanto abra, para que la apertura que viene detrás no lo deje abierto
      if (abriendoP) return abriendoP.then(function () { return Vz.cierra(); }, function () { return Vz.cierra(); });
      return Vz.cierra();
    }
    // un gesto (botón, tecla, gatillo, panel): pasa por la lógica pura, que decide si abre, cierra o nada
    function gesto(tipo, fuente) {
      var w = vista(); if (!H.activo(w.v)) return false;
      var r = H.entrada({ modo: modoAj, papel: w.e.papel, tipo: tipo, micro: w.e.micro, sosten: sosten === fuente });
      if (r.accion === "abre") { sosten = r.sosten ? fuente : ""; abre(fuente); }
      else if (r.accion === "cierra") { sosten = ""; cierra(fuente); }
      else if (tipo === "suelta" && sosten === fuente) sosten = "";
      pinta(); return r.accion !== "nada";
    }
    function alterna(fuente) { return gesto("baja", fuente); }

    // ---- la mano (api de F3c); el estado de verdad llega por el atributo «mano» que pone la api
    function pideMano(levantar) {
      var w = vista(), ev = w.e.evento; if (ev === null || pidiendo) return Promise.resolve(false);
      pidiendo = true; pinta();
      return fetch("/api/presencia/guiadas/" + ev + "/mano", { method: levantar ? "POST" : "DELETE", credentials: "same-origin", headers: { accept: "application/json" } }).then(function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) { var er = new Error(j && typeof j.mensaje === "string" && j.mensaje ? j.mensaje : "La api respondió " + r.status + "."); throw er; }
          return j;
        });
      }).then(function (j) {
        est.manos++; manoSup = { v: levantar, hasta: Date.now() + H.MANO_MS };
        var puesto = j && typeof j.puesto === "number" ? j.puesto : null;
        if (levantar && puesto !== null) manoSup.puesto = puesto;
        n.emite("habla:mano", { accion: levantar ? "levanta" : "baja", ok: true, puesto: puesto });
        pidiendo = false; msg(levantar ? "Mano levantada." : "Mano bajada."); return true;
      }, function (er) {
        est.errores++; pidiendo = false; n.emite("habla:mano", { accion: levantar ? "levanta" : "baja", ok: false, puesto: null }); msg(er && er.message ? er.message : "No se pudo."); return false;
      });
    }

    // ---- la pantalla: una caja arriba, bajo la tira de la palabra de 46 (no tapa los mandos táctiles de abajo)
    var CSS_BTN = "font:600 15px/1.2 system-ui,sans-serif;color:#fff;border-radius:999px;padding:8px 16px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.7);touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;margin:2px 4px";
    function monta() {
      if (caja) return;
      var h = px();
      caja = el("div", { id: "hablaCaja", role: "group", "aria-label": "Micrófono de la visita guiada", hidden: true,
        style: "position:absolute;left:50%;top:50px;transform:translateX(-50%);z-index:31;width:max-content;max-width:min(440px,calc(100% - 24px));padding:8px 10px;border-radius:16px;background:rgba(16,20,24,0.92);color:#fff;font:14px/1.4 system-ui,sans-serif;box-sizing:border-box;text-align:center" });
      icoEl = el("span", { "aria-hidden": "true", style: "margin-right:6px" }); txtEl = el("span");
      estadoEl = el("div", { id: "hablaEstado", role: "status", "aria-live": "polite", "aria-atomic": "true", style: "font-weight:600;margin:0 0 4px" }, [icoEl, txtEl]);
      boton = el("button", { id: "hablaBoton", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, ["Hablar"]);
      silencio = el("button", { id: "hablaSilencio", type: "button", hidden: true, "aria-label": "Silenciar mi micrófono", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px;background:rgba(229,72,77,0.18);border-color:rgba(229,72,77,0.8)" }, ["Silenciarme"]);
      casilla = el("input", { id: "hablaAuric", type: "checkbox", style: "width:" + Math.round(h * 0.5) + "px;height:" + Math.round(h * 0.5) + "px;margin:0 8px 0 0;vertical-align:middle" });
      var etiqueta = el("label", { id: "hablaAuricEt", style: "display:inline-flex;align-items:center;min-height:" + h + "px;cursor:pointer;margin:0 4px", hidden: true }, [casilla, "Llevo auriculares"]);
      avisoEl = el("p", { id: "hablaAviso", style: "margin:4px 0 0;font-size:13px;opacity:0.9", hidden: true });
      var fila = el("div", { style: "display:flex;flex-wrap:wrap;justify-content:center;align-items:center" }, [boton, silencio, etiqueta]);
      caja.appendChild(estadoEl); caja.appendChild(fila); caja.appendChild(avisoEl);
      caja._et = etiqueta;
      (visor || document.body).appendChild(caja);
      // el botón: pulsar = clic; mantener = apretar y soltar (el puntero), o la barra y Intro mantenidas
      boton.addEventListener("pointerdown", function (e) { if (modoAj === "mantener" && esMicro()) { puntero = true; if (e.preventDefault) e.preventDefault(); gesto("baja", "boton"); } else if (esMano()) { /* el clic */ } });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (nm) { boton.addEventListener(nm, function () { if (puntero) { puntero = false; gesto("suelta", "boton"); } }); });
      boton.addEventListener("contextmenu", function (e) { if (e.preventDefault) e.preventDefault(); });
      boton.addEventListener("keydown", function (e) { if ((e.code === "Space" || e.code === "Enter") && modoAj === "mantener" && esMicro()) { if (e.preventDefault) e.preventDefault(); if (!e.repeat) gesto("baja", "boton"); } });
      boton.addEventListener("keyup", function (e) { if ((e.code === "Space" || e.code === "Enter") && sosten === "boton") { if (e.preventDefault) e.preventDefault(); gesto("suelta", "boton"); } });
      boton.addEventListener("click", function () {
        var w = vista(), a = w.v.primaria.accion;
        if (a === "levantar") pideMano(true); else if (a === "bajar") pideMano(false);
        else if (a === "micro" && !(modoAj === "mantener" && !H.modera(w.e.papel))) alterna("boton");   // en mantener lo hacen apretar y soltar
      });
      silencio.addEventListener("click", function () { if (vista().e.micro !== "cerrado") { sosten = ""; cierra("boton"); pinta(); } });
      casilla.addEventListener("change", function () { if (Vz) Vz.auriculares(!!casilla.checked); pinta(); });
    }
    function esMicro() { return H.activo(vista().v); }
    function esMano() { var a = vista().v.primaria.accion; return a === "levantar" || a === "bajar"; }
    function msg(t) { mensaje = t || ""; tMsg = H.MENSAJE_S; ult = ""; pinta(); }
    function pinta() {
      var w = vista(); v = w;
      if (!w.v.visible) { if (caja) caja.hidden = true; ult = ""; mensaje = ""; return; }
      monta();
      var t = H.textoEstado(w.v) + (mensaje ? " " + mensaje : ""), k = JSON.stringify([t, w.v.primaria, w.v.silenciar, w.v.auric, w.v.aviso, w.e.auriculares, vr()]);
      if (k === ult) return; ult = k;
      caja.hidden = vr();
      icoEl.textContent = w.v.micro.icono; txtEl.textContent = t;
      boton.textContent = w.v.primaria.texto; boton.disabled = !!w.v.primaria.off; boton.setAttribute("aria-label", w.v.primaria.aria);
      boton.title = w.v.primaria.accion === "micro" ? w.v.primaria.texto + " (tecla T)" : w.v.primaria.texto;
      boton.setAttribute("aria-keyshortcuts", w.v.primaria.accion === "micro" ? "T" : "");
      silencio.hidden = !w.v.silenciar; caja._et.hidden = !w.v.auric; casilla.checked = !!w.e.auriculares;
      avisoEl.textContent = w.v.aviso; avisoEl.hidden = !w.v.aviso;
      if (typeof PanelVR !== "undefined" && PanelVR.repinta) PanelVR.repinta();
      registraAjuste();
    }

    // ---- las teclas: T (Teclas la reserva y la suelta con el foco en un campo); en mantener, el soltar se oye aparte
    var quitaT = (typeof Teclas !== "undefined" && Teclas.registra) ? Teclas.registra("KeyT", function () {
      if (vr() || !esMicro()) return false;
      est.teclas++; gesto("baja", "tecla");
    }, "habla") : null;
    if (quitaT) n.limpia(quitaT);
    function alSoltarT(e) { if (e && e.code === "KeyT" && sosten === "tecla") gesto("suelta", "tecla"); }
    window.addEventListener("keyup", alSoltarT); n.limpia(function () { window.removeEventListener("keyup", alSoltarT); });

    // ---- el guía abre su micro con el primer gesto de la sala (una vez por visita; si lo silencia, no se reabre solo)
    function dentroDeCaja(x) { for (var i = 0; x && i < 12; i++, x = x.parentNode) if (x === caja) return true; return false; }
    function autoGuia(e) {
      var w = vista(); if (!w.v.visible || w.e.papel !== "guia" || !w.e.puede || w.e.micro !== "cerrado" || w.e.evento === autoEv || w.e.motivo) return;
      if (e && dentroDeCaja(e.target)) return;   // si pulsa el botón del micro, que mande el botón
      autoEv = w.e.evento; est.autos++; abre("auto");
    }
    ["pointerdown", "keydown"].forEach(function (nm) { window.addEventListener(nm, autoGuia, { passive: true }); n.limpia(function () { window.removeEventListener(nm, autoGuia); }); });

    // ---- VR: el gatillo izquierdo (29_vr.js llama a VRX.voz.mando cada fotograma con el estado del gatillo y una función de pulso del mando)
    var gatilloAntes = false;
    var gancho = {
      toma: function () { return vr() && esMicro(); },
      mando: function (abajo, pulso) {
        pulsa = pulso || pulsa;
        if (abajo === gatilloAntes) return; gatilloAntes = abajo;
        if (!esMicro()) return;
        est.gatillos++; gesto(abajo ? "baja" : "suelta", "gatillo");
      }
    };
    if (typeof VRX !== "undefined" && VRX) VRX.voz = gancho;
    function pulso(f, ms) { try { if (pulsa) pulsa(f, ms); } catch (e) {} }

    // ---- VR: la lámina de 3 s al abrir o cerrar y la fila del panel
    function laminaVR(texto, abierto) {
      if (!vr() || typeof Laminas === "undefined") return;
      tLam = H.AVISO_S;
      var o = { id: LAM, ancho: 0.8, alto: 0.2, w: 640, h: 160, firma: function () { return texto; },
        pinta: function (cx, w, h) { cx.fillStyle = "rgba(16,20,24,0.95)"; cx.fillRect(0, 0, w, h); cx.fillStyle = abierto ? "#ffd58a" : "#ffffff"; cx.font = "600 38px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.fillText(texto, 28, h / 2); } };
      if (Laminas.hay(LAM)) Laminas.cierra(LAM, "reabierta");
      Laminas.abre(o);
    }
    if (typeof PanelVR !== "undefined" && PanelVR.filas) {
      quitaFila = PanelVR.filas("ira", { id: "habla", orden: 6, alto: 230, visible: function () { return !!(v && v.v.visible); },
        firma: function () { var w = vista(); return JSON.stringify([H.textoEstado(w.v), w.v.primaria.texto, w.e.auriculares, w.v.aviso]); },
        pinta: function (cx, y, W) {
          var w = vista(); cx.fillStyle = "#ffffff"; cx.font = "600 34px system-ui, sans-serif"; cx.textBaseline = "top"; cx.fillText("Micrófono", 40, y + 6);
          cx.font = "28px system-ui, sans-serif"; cx.fillText(w.v.micro ? w.v.micro.icono + " " + w.v.micro.texto : "", 40, y + 50, W - 80);
          cx.fillStyle = "rgba(255,255,255,0.75)"; cx.font = "24px system-ui, sans-serif";
          cx.fillText(w.v.cola || w.v.aviso || "Gatillo izquierdo: " + (modoAj === "mantener" && !H.modera(w.e.papel) ? "mantener para hablar" : "abrir y cerrar"), 40, y + 88, W - 80);
        },
        botones: function (b, y) {
          var w = vista(), a = w.v.primaria.accion;
          b("hMic", 40, y + 140, 520, 64, w.v.primaria.texto.replace("Mantén pulsado para hablar", "Hablar").replace("Hablando · suelta para callar", "Silenciarme"), function () {
            var x = vista().v.primaria.accion; if (x === "levantar") pideMano(true); else if (x === "bajar") pideMano(false); else if (x === "micro") alterna("panel");
          }, w.e.micro !== "cerrado");
          if (w.v.auric) b("hAur", 580, y + 140, 404, 64, "Auriculares: " + (w.e.auriculares ? "sí" : "no"), function () { if (Vz) Vz.auriculares(!vista().e.auriculares); pinta(); }, w.e.auriculares);
        },
        debug: function () { return { habla: estado() }; } });
      n.limpia(quitaFila);
    }

    // ---- el ajuste «Hablar» en Configuración (Ajustes.registra): su pestaña aparece al estar por primera vez en una visita guiada (no hay que ensuciar la
    // Configuración de quien nunca entra en una); lo guardado se aplica al registrarse
    var quitaAj = null;
    function registraAjuste() {
      if (quitaAj || typeof Ajustes === "undefined" || !Ajustes.registra) return;
      quitaAj = function () {};   // marca «registrado» antes: aplica llama a pinta, que volvería aquí
      var q = Ajustes.registra("habla", { modo: { tipo: "opc", def: H.DEFECTO, ops: H.MODOS.slice() } },
        { id: "habla", t: "Hablar", campos: [{ k: "modo", t: "Micrófono en la visita guiada", ops: [["pulsar", "Pulsar para abrir y pulsar para cerrar"], ["mantener", "Mantener pulsado para hablar"]],
          nota: "Solo para las familias cuando tienen la palabra; el guía siempre abre y cierra. Se usa con el botón «Hablar», la tecla T y, en VR, el gatillo izquierdo." }] },
        function (k, val) { if (k === "habla.modo") { modoAj = H.modo(val); if (modoAj !== "mantener" && sosten) { sosten = ""; } ult = ""; if (vivo) pinta(); } });
      if (q) { quitaAj = q; n.limpia(q); }
    }
    n.on("voz:estado", function () { if (vivo) alVoz(); });
    n.on("guiada:palabra", function () { if (vivo) pinta(); });
    n.on("depura:lineas", function (d) { if (v && v.v.visible && d && d.lineas) d.lineas.push("habla · micro " + v.e.micro + " · modo " + modoAj + (v.e.mano ? " · mano" + (v.e.puesto ? " " + v.e.puesto : "") : "")); });
    function alVoz() {
      var w = vista(), m = w.e.micro === "abierto" ? "abierto" : "cerrado";
      if (m !== ultMicro) {
        ultMicro = m;
        if (vr() && w.v.visible) { pulso(m === "abierto" ? 0.4 : 0.2, m === "abierto" ? 30 : 15); laminaVR(m === "abierto" ? "Micrófono abierto" : "Micrófono cerrado", m === "abierto"); }
        if (m === "cerrado" && sosten) sosten = "";
      }
      pinta();
    }

    // ---- fase «tarde» (cada 0,25 s): la cola cambia sin que nadie avise, la lámina de VR se cierra, el guía en VR abre solo, un «mantener» huérfano se suelta
    function tarde(dt) {
      if (tMsg > 0) { tMsg -= dt; if (tMsg <= 0) { mensaje = ""; ult = ""; } }
      pinta();
      if (tLam > 0) { tLam -= dt; if (tLam <= 0 && typeof Laminas !== "undefined" && Laminas.hay(LAM)) Laminas.cierra(LAM, "cerrada"); }
      if (sosten === "gatillo" && !vr()) { gatilloAntes = false; gesto("suelta", "gatillo"); }
      if (vr()) autoGuia(null);
    }
    function estado() {
      var w = vista();
      return { visible: w.v.visible, modo: modoAj, micro: w.e.micro, papel: w.e.papel, puede: w.e.puede, accion: w.v.primaria.accion, texto: w.v.primaria.texto, estado: H.textoEstado(w.v), cola: w.v.cola,
        puesto: w.e.puesto, mano: w.e.mano, aviso: w.v.aviso, sosten: sosten, silenciar: w.v.silenciar, auriculares: w.e.auriculares, boton: px(), aperturas: est.aperturas, cierres: est.cierres,
        manos: est.manos, errores: est.errores, teclas: est.teclas, gatillos: est.gatillos, autos: est.autos, teclaT: !!quitaT };
    }
    function libera() {
      vivo = false; sosten = "";
      if (Laminas && Laminas.hay && Laminas.hay(LAM)) Laminas.cierra(LAM, "cerrada");
      if (typeof VRX !== "undefined" && VRX && VRX.voz === gancho) VRX.voz = null;
      if (caja && caja.parentNode) caja.parentNode.removeChild(caja); caja = estadoEl = icoEl = txtEl = boton = silencio = casilla = avisoEl = null;
      if (window.__habla === api) window.__habla = undefined;
    }
    // gancho de pruebas: el estado; «hablar» (alterna), «mano» (true | false), «tecla», «gatillo» (true | false), «modo» (pulsar | mantener)
    function api(a, arg) {
      if (a === "hablar") return alterna("boton"); if (a === "mano") return pideMano(arg !== false);
      if (a === "gatillo") { gancho.mando(!!arg, null); return estado(); }
      if (a === "modo") { modoAj = H.modo(arg); ult = ""; pinta(); return estado(); }
      return estado();
    }
    window.__habla = api;
    return { tarde: tarde, libera: libera, estado: estado };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?habla=0 lo apaga. Consume la voz (Voz.abre/cierra/estado/auriculares)
  // y la guiada (su api «Guiada»: quién eres y la cola); sin ellas no se monta. Montado y fuera de una sala guiada, no crea nada.
  Componentes.registra({
    id: "habla-guiada", version: 1,
    consume: ["Voz", "Guiada", "Ajustes", "Teclas", "PanelVR", "VRX", "Laminas"],
    expone: [],
    eventos: { escucha: ["voz:estado", "guiada:palabra", "depura:lineas"], emite: ["habla:micro", "habla:mano"] },
    bandera: { defecto: true, url: "habla" },
    // DOM en pantalla (0 llamadas); en VR, la lámina de 3 s al abrir o cerrar el micro (1 llamada, 2 triángulos, una textura de 640 × 160 sin mipmaps: ≈ 0,4 MB, solo mientras se ve)
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 0.4 },
    fases: { tarde: 0.25 },
    monta: function (n) { return HablaMotor(n, n.api("voz-guiada"), n.api("visita-guiada")); },
    actualiza: { tarde: function (dt, t, api) { api.tarde(dt); } },
    libera: function (api) { if (api) api.libera(); }
  });
