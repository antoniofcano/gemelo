// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Usables
// Consume: 01_datos ($), 02_mundo (suelo, copas), 02c_componentes (Bus), 03_escena (lienzo, scene, modo), 09_camara (suelta, elige),
//   12_paseo (paseando, persona, primera), 14_historia (lista), 16_vida (quita, quad, enDron, dron), 29_vr (VRX, ficha)
// Nota: Servicio del núcleo (ADR-0023, C7): EntidadesPuro, Entidades (registro de tipos de cosas del mundo con id estable; cada módulo registra su tipo y responde por sus cosas) y Usables (la selección única para toque, clic, rayo VR y cercanía, la ficha común #ficha, el anillo de resaltado y los eventos usable:*). Publica además window.__usables (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/entidades.test.js.
// ===============================================================================
  // ---------- entidades y usables (ADR-0023, C7; doc/sistema/COMPONENTES.md §6): las cosas del mundo con un id estable y UNA sola forma de elegirlas.
  // Entidades: un registro de TIPOS, no de objetos. Cada módulo que tiene cosas en el mundo registra su tipo (olivo, baliza, haza, persona…) y responde
  // por ellas: el registro no copia sus datos (miles de copas siguen en su array), solo sabe a quién preguntar por un id. Ids: «tipo:resto», p. ej.
  // olivo:<finca>:<copas_id> (ADR-0012), baliza:<parcela>, haza:<id>, persona:<id>.
  //   Entidades.registra({ tipo, dueno, prioridad, fondo?, ficha(id, modo), pantalla?(cx, cy, rect), rayo?(raycaster), cerca?(x, y), radioCerca?,
  //     pos?(id) → {x, y, z} (escena), radio?(id) → m, existe?(id), lista?() → [{ id, … }], muestra?(id, modo) → true si la enseña él (su propio recuadro),
  //     abierta?() → id que tiene abierto por su cuenta (la baliza, por cercanía), cierra?(id), suelta?(), sinAnillo?: true }) → quita
  //     pantalla: el toque o el clic en (cx, cy) px de la ventana → { id, s } (s: 0 = de lleno … 1 = en el borde de su tolerancia) o null
  //     rayo: el rayo de un mando (THREE.Raycaster) → { id, t (m por el rayo), s } o null · cerca: quien pasea en (x este, y norte) → { id, d (m) } o null
  //     ficha(id, modo) → { titulo, filas?: [{ k, v, de? }], lineas?, color?, destacado?, gente?, pie?, acciones?: [{ id, txt, fn }] } (texto llano, nunca HTML)
  // Usables: la selección única para el toque y el clic (09_camara), el rayo y el gatillo (29_vr) y la cercanía al pasear. Gana, al tocar, el tipo de más
  // prioridad y dentro de él el más de lleno; con el rayo, el primero por el rayo (a menos de 0,5 m, el de más prioridad); los de fondo (la haza: el suelo
  // bajo el dedo) solo si no hay otro. Una ficha común: en pantalla el recuadro #ficha de siempre (título, pares y botones de acción); en VR la pinta quien
  // se registre como presentador (29_vr, en sus láminas). Resaltado común: un anillo al pie de lo elegido (1 llamada, 80 triángulos, solo mientras hay algo
  // elegido; se crea la primera vez y se libera con Usables.libera). Eventos en el Bus: usable:elige, usable:suelta, usable:usa, usable:cerca.
  // Presupuesto (regla 6): nada por fotograma salvo la cercanía (paseando: una distancia por cosa de los tipos con cerca, hoy las balizas) y recolocar el
  // anillo si está visible; ni un raycast por fotograma (el toque proyecta o lanza un rayo solo al tocar; el rayo de VR, solo al apretar el gatillo).
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/entidades.test.js)
  var EntidadesPuro = (function () {
    var TIPO = /^[a-z][a-z0-9-]*$/, OPC = ["pantalla", "rayo", "cerca", "pos", "radio", "existe", "lista", "muestra", "abierta", "cierra", "suelta"];
    function id(tipo) { return [tipo].concat(Array.prototype.slice.call(arguments, 1).map(String)).join(":"); }
    function tipoDe(x) { var s = String(x == null ? "" : x), i = s.indexOf(":"); return i > 0 ? s.slice(0, i) : ""; }
    function resto(x) { var s = String(x == null ? "" : x), i = s.indexOf(":"); return i > 0 ? s.slice(i + 1) : ""; }
    // la definición de un tipo: la lista de errores (vacía si vale)
    function valida(d) {
      if (!d || typeof d !== "object") return ["la definición no es un objeto"];
      var e = [];
      if (typeof d.tipo !== "string" || !TIPO.test(d.tipo)) e.push("tipo: minúsculas, cifras y guiones, empezando por letra");
      if (typeof d.dueno !== "string" || !d.dueno) e.push("dueno: el módulo que la gestiona");
      if (typeof d.prioridad !== "number" || !isFinite(d.prioridad)) e.push("prioridad: número (al tocar, gana la mayor)");
      if (typeof d.ficha !== "function") e.push("ficha(id, modo): función");
      OPC.forEach(function (k) { if (d[k] !== undefined && typeof d[k] !== "function") e.push(k + ": función"); });
      if (d.cerca && !(typeof d.radioCerca === "number" && d.radioCerca > 0)) e.push("radioCerca: metros > 0 (con cerca)");
      if (!d.pantalla && !d.rayo && !d.cerca && !d.lista) e.push("ni pantalla, ni rayo, ni cerca, ni lista: nadie podría llegar a ella");
      return e;
    }
    // el que gana entre candidatos [{ id, prioridad, fondo, s, t }]; como = "toque" (pantalla) o "rayo" (VR). null si no hay ninguno
    function gana(cands, como) {
      var l = (cands || []).filter(function (c) { return c && typeof c.id === "string" && c.id; }), delante = l.filter(function (c) { return !c.fondo; });
      if (delante.length) l = delante;
      if (!l.length) return null;
      if (como === "rayo") {   // el primero por el rayo; lo que está a menos de 0,5 m de él cuenta como «a la vez» y decide la prioridad
        var t0 = Math.min.apply(null, l.map(function (c) { return c.t || 0; }));
        l = l.filter(function (c) { return (c.t || 0) < t0 + 0.5; });
      }
      var m = l[0];
      for (var i = 1; i < l.length; i++) {
        var c = l[i], dp = (c.prioridad || 0) - (m.prioridad || 0), ds = (c.s || 0) - (m.s || 0), dt = (c.t || 0) - (m.t || 0);
        if (dp > 0 || (dp === 0 && (ds < 0 || (ds === 0 && (dt < 0 || (dt === 0 && c.id < m.id)))))) m = c;
      }
      return m;
    }
    // la cercanía: de [{ id, d, radio }] el más cerca dentro de su radio (d < radio), o null
    function cercano(cands) {
      var m = null;
      (cands || []).forEach(function (c) { if (c && typeof c.id === "string" && c.d >= 0 && c.d < c.radio && (!m || c.d < m.d)) m = c; });
      return m;
    }
    // las dos líneas de una ficha sin «lineas» propias para una lámina pequeña (VR): «k: v» de tres en tres, como la ficha del olivo de siempre
    function lineas(f) {
      if (f && Array.isArray(f.lineas)) return f.lineas.slice();
      var p = (f && f.filas || []).map(function (q) { return q.k + ": " + q.v; });
      return [p.slice(0, 3).join(" · "), p.slice(3).join(" · ")];
    }
    return { TIPO: TIPO, id: id, tipoDe: tipoDe, resto: resto, valida: valida, gana: gana, cercano: cercano, lineas: lineas };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/entidades.test.js con un DOM y un THREE de mentira)
  var Entidades = (function () {
    var P = EntidadesPuro, defs = {}, orden = [];
    function falla(t, e) { try { console.error("[Entidades] " + t, e); } catch (e2) {} }
    // registra un tipo; devuelve la función que lo quita (null si la definición no vale o el tipo ya tiene dueño: dos dueños para un tipo, nunca)
    function registra(d) {
      var e = P.valida(d);
      if (e.length) { falla((d && d.tipo) + ": " + e.join("; ")); return null; }
      if (defs[d.tipo]) { falla(d.tipo + ": ya lo gestiona " + defs[d.tipo].dueno); return null; }
      defs[d.tipo] = d; orden.push(d.tipo);
      return function () {
        if (defs[d.tipo] !== d) return;
        delete defs[d.tipo]; orden.splice(orden.indexOf(d.tipo), 1);
        Usables.olvida(d.tipo);   // si lo elegido era de este tipo, se suelta
      };
    }
    function de(x) { return defs[P.tipoDe(x)] || null; }
    function tipo(t) { return defs[t] || null; }
    function tipos() { return orden.slice(); }
    function existe(x) { var d = de(x); if (!d) return false; try { return d.existe ? !!d.existe(x) : true; } catch (e) { falla(x, e); return false; } }
    function fichaDe(x, modo) {
      var d = de(x), f = null; if (!d) return null;
      try { f = d.ficha(x, modo || "pantalla"); } catch (e) { falla(x, e); }
      if (!f) return null;
      f.id = x; f.tipo = d.tipo; return f;
    }
    function pos(x) { var d = de(x); try { return d && d.pos ? d.pos(x) || null : null; } catch (e) { falla(x, e); return null; } }
    function listaTipo(t) { var d = defs[t]; if (!d) return null; try { return d.lista ? d.lista() || [] : []; } catch (e) { falla(t, e); return []; } }   // null: no hay ese tipo
    // pregunta a cada tipo que sepa (metodo = "pantalla", "rayo" o "cerca") y junta sus respuestas como candidatos de EntidadesPuro.gana / cercano
    function candidatos(metodo, a, b, c) {
      var out = [];
      orden.forEach(function (t) {
        var d = defs[t], r; if (typeof d[metodo] !== "function") return;
        try { r = d[metodo](a, b, c); } catch (e) { falla(t + "." + metodo, e); return; }
        if (!r) return;
        (Array.isArray(r) ? r : [r]).forEach(function (q) {
          if (q && typeof q.id === "string" && P.tipoDe(q.id) === t) out.push({ id: q.id, tipo: t, prioridad: d.prioridad, fondo: !!d.fondo, s: +q.s || 0, t: +q.t || 0, d: q.d, radio: d.radioCerca });
        });
      });
      return out;
    }
    function resumen() { return orden.map(function (t) { var d = defs[t]; return { tipo: t, dueno: d.dueno, prioridad: d.prioridad, fondo: !!d.fondo, toque: !!d.pantalla, rayo: !!d.rayo, cerca: !!d.cerca }; }); }
    return { registra: registra, de: de, tipo: tipo, tipos: tipos, existe: existe, ficha: fichaDe, pos: pos, lista: listaTipo, candidatos: candidatos, resumen: resumen };
  })();

  var Usables = (function () {
    var P = EntidadesPuro, actual = null, como = "", conAcciones = false, enFicha = null, cerca = null, presentadores = {}, anillo = null, quitaX = null;
    function modoVista() { return typeof VRX !== "undefined" && VRX && VRX.on ? "vr" : "pantalla"; }
    // ---- la ficha común en pantalla: el recuadro #ficha de siempre (título, pares <dt>/<dd> y, si la ficha trae acciones, sus botones debajo); textContent, nunca HTML
    function engancha() {
      if (quitaX) return; var x = $("cerrarFicha"); if (!x) return;
      quitaX = function () { if (enFicha && enFicha === actual) cierra(actual, "cerrada"); enFicha = null; var f = $("ficha"); if (f) f.hidden = true; };
      x.addEventListener("click", quitaX);
    }
    function botonesPantalla(caja, acciones) {
      var ac = $("fichaAcciones");
      if (!acciones || !acciones.length) { if (ac) ac.hidden = true; return; }
      if (!ac) {
        ac = document.createElement("div"); ac.id = "fichaAcciones"; ac.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"; caja.appendChild(ac);
        ac.addEventListener("click", function (e) { var b = e.target && e.target.closest && e.target.closest("button[data-accion]"); if (b && enFicha) usa(enFicha, b.getAttribute("data-accion")); });
      }
      ac.textContent = "";
      acciones.forEach(function (a) {
        var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-accion", a.id); b.textContent = a.txt;
        b.style.cssText = "font:inherit;color:inherit;min-height:44px;min-width:44px;padding:6px 12px;border-radius:8px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.55)";
        ac.appendChild(b);
      });
      ac.hidden = false;
    }
    function pintaPantalla(f) {
      var caja = $("ficha"), dl = $("fichaDatos"); if (!caja || !dl) return;
      engancha();
      $("fichaTitulo").textContent = f.titulo || ""; dl.textContent = "";
      (f.filas || []).forEach(function (q) {
        var dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = q.k; dd.textContent = q.v;
        if (q.de) { var s = document.createElement("small"); s.style.display = "block"; s.style.color = "var(--muted)"; s.textContent = q.de; dd.appendChild(s); }
        dl.appendChild(dt); dl.appendChild(dd);
      });
      botonesPantalla(caja, f.acciones);
      caja.hidden = false;
    }
    // presentador(modo, fn): quién pinta la ficha en ese modo (29_vr registra el de "vr"); fn(ficha). Devuelve la función que lo quita
    function presentador(m, fn) { if (typeof fn !== "function") return function () {}; presentadores[m] = fn; return function () { if (presentadores[m] === fn) delete presentadores[m]; }; }
    function muestra(x) {
      var d = Entidades.de(x), m = modoVista(), propio = false; if (!d) return false;
      if (d.muestra) { try { propio = d.muestra(x, m) === true; } catch (e) { try { console.error("[Usables] " + x, e); } catch (e2) {} } }
      if (propio) { conAcciones = false; return true; }   // la enseña él (la baliza, en su propio recuadro)
      var f = Entidades.ficha(x, m); if (!f) return false;
      conAcciones = !!(f.acciones && f.acciones.length);
      if (m === "vr") { if (presentadores.vr) presentadores.vr(f); }
      else { enFicha = x; pintaPantalla(f); }
      return true;
    }
    // ---- elegir y soltar
    function eligeU(x, comoE) {
      var d = Entidades.de(x); if (!d || !Entidades.existe(x)) return false;
      if (actual && actual !== x) avisaSuelta(actual, "otra");
      actual = x; como = comoE || "codigo";
      Bus.emite("usable:elige", { id: x, tipo: d.tipo, como: como });
      muestra(x); resalteU(); return true;
    }
    function avisaSuelta(x, motivo) { var d = Entidades.de(x); if (d && d.suelta) { try { d.suelta(x); } catch (e) {} } Bus.emite("usable:suelta", { id: x, motivo: motivo }); }
    // el toque o el clic en (cx, cy): lo que hay debajo se elige; si no hay nada, se suelta lo elegido y se cierra la ficha
    function toque(cx, cy) {
      var r = typeof lienzo !== "undefined" && lienzo ? lienzo.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
      var g = P.gana(Entidades.candidatos("pantalla", cx, cy, r), "toque");
      if (!g) { sueltaU("nada"); return null; }
      eligeU(g.id, "toque"); return g.id;
    }
    // el rayo de un mando y su gatillo (VR): lo primero que toca se elige; sin nada, no se suelta lo que haya (apretar al aire no cierra fichas)
    function rayo(rr) { var g = P.gana(Entidades.candidatos("rayo", rr), "rayo"); if (!g) return null; eligeU(g.id, "rayo"); return g.id; }
    // soltar: lo elegido deja de estarlo, todos los tipos sueltan lo que tuvieran forzado (la baliza vuelve a la de cercanía) y la ficha común se cierra
    function sueltaU(motivo) {
      Entidades.tipos().forEach(function (t) { var d = Entidades.tipo(t); if (d.suelta && (!actual || P.tipoDe(actual) !== t)) { try { d.suelta(null); } catch (e) {} } });
      if (actual) { var a = actual; actual = null; avisaSuelta(a, motivo || "suelta"); }
      conAcciones = false; enFicha = null; var f = typeof $ === "function" && $("ficha"); if (f) f.hidden = true;
      resalteU();
    }
    // cerrar la ficha de x (su «Cerrar» o la ×): su tipo la cierra si tiene recuadro propio y, si era lo elegido, deja de estarlo
    function cierra(x, motivo) {
      var d = Entidades.de(x); if (d && d.cierra) { try { d.cierra(x); } catch (e) {} }
      if (x && x === actual) { actual = null; conAcciones = false; Bus.emite("usable:suelta", { id: x, motivo: motivo || "cerrada" }); }
      resalteU(); return true;
    }
    // la ficha de x ha cambiado (la de la haza llega de la api): si está a la vista, se repinta
    function refresca(x) {
      if (modoVista() === "pantalla") { if (enFicha === x && !$("ficha").hidden) muestra(x); }
      else if (x === actual && !conAcciones) muestra(x);
    }
    // una acción de la ficha de x («Ir a esta baliza», «Ir con»…): true si se hizo
    function usa(x, accion) {
      var f = Entidades.ficha(x, modoVista()), a = f && (f.acciones || []).filter(function (q) { return q.id === accion; })[0], r;
      if (!a || typeof a.fn !== "function") return false;
      try { r = a.fn(); } catch (e) { try { console.error("[Usables] " + x + " " + accion, e); } catch (e2) {} return false; }
      if (r === false) return false;
      Bus.emite("usable:usa", { id: x, accion: accion }); return true;
    }
    // una ficha sin entidad (la tecla H fuera de toda haza): en pantalla, en el recuadro común
    function mensaje(titulo, filas) { if (actual) { var a = actual; actual = null; avisaSuelta(a, "otra"); } conAcciones = false; enFicha = null; pintaPantalla({ titulo: titulo, filas: filas }); resalteU(); }
    // la ficha con acciones que hay que tener a la vista (VR): la elegida si trae acciones y no tiene recuadro propio, o la que un tipo tiene abierta por su
    // cuenta (la baliza a menos de 17 m). null si ninguna
    function abierta() {
      if (actual && conAcciones && Entidades.existe(actual)) return actual;
      var ts = Entidades.tipos();
      for (var i = 0; i < ts.length; i++) { var d = Entidades.tipo(ts[i]), x = null; if (!d.abierta) continue; try { x = d.abierta(); } catch (e) {} if (x) return x; }
      return null;
    }
    // ---- la cercanía, al pasear (a pie, en quad, con el dron, en VR): lo más cerca dentro del radio de su tipo (hoy, la baliza a menos de 17 m)
    function dondeEstoy() {
      if (typeof paseando === "undefined" || !paseando) return null;
      if (typeof enDron !== "undefined" && enDron && typeof dr !== "undefined") return { x: dr.x, y: dr.y };
      return typeof pp !== "undefined" ? { x: pp.x, y: pp.y } : null;
    }
    function actualiza() {
      var p = dondeEstoy(), c = p ? P.cercano(Entidades.candidatos("cerca", p.x, p.y)) : null, antes = cerca ? cerca.id : null;
      cerca = c ? { id: c.id, d: c.d } : null;
      if ((c ? c.id : null) !== antes) Bus.emite("usable:cerca", { id: c ? c.id : null });
      if (anillo && anillo.visible) colocaAnillo();
    }
    function cercano() { return cerca ? { id: cerca.id, d: cerca.d } : null; }
    // ---- el resaltado común: un anillo en el suelo, al pie de lo elegido (los tipos que ya se ven solos, como la baliza, llevan sinAnillo: true)
    function colocaAnillo() {
      var d = actual && Entidades.de(actual), p = d && !d.sinAnillo ? Entidades.pos(actual) : null;
      if (!p) { anillo.visible = false; return false; }
      var r = 1.2; if (d.radio) { try { r = Math.max(0.4, +d.radio(actual) || 1.2); } catch (e) {} }
      anillo.position.set(p.x, p.y + 0.15, p.z); anillo.scale.set(r, r, r); anillo.visible = true; return true;
    }
    function resalteU() {
      if (!actual) { if (anillo) anillo.visible = false; return; }
      var d = Entidades.de(actual); if (!d || d.sinAnillo || !d.pos) { if (anillo) anillo.visible = false; return; }
      if (!anillo) {
        var g = new THREE.RingGeometry(0.86, 1, 40); g.rotateX(-Math.PI / 2);
        anillo = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x40f0ff, transparent: true, opacity: 0.85, depthWrite: false, fog: false, forceSinglePass: true }));
        anillo.name = "resaltado"; anillo.renderOrder = 5; anillo.frustumCulled = false; scene.add(anillo);
      }
      colocaAnillo();
    }
    // un tipo se ha quitado del registro: si lo elegido era suyo, se suelta (sin preguntarle: ya no está)
    function olvida(t) { if (actual && P.tipoDe(actual) === t) { var a = actual; actual = null; conAcciones = false; Bus.emite("usable:suelta", { id: a, motivo: "quitada" }); if (enFicha === a) { enFicha = null; var f = $("ficha"); if (f) f.hidden = true; } resalteU(); } if (cerca && P.tipoDe(cerca.id) === t) cerca = null; }
    function libera() { if (anillo) { scene.remove(anillo); anillo.geometry.dispose(); anillo.material.dispose(); anillo = null; } }
    function estado() { return { actual: actual, como: como, conAcciones: conAcciones, enFicha: enFicha, cerca: cercano(), anillo: !!(anillo && anillo.visible), tipos: Entidades.resumen() }; }
    function elegido() { return actual; }
    return { toque: toque, rayo: rayo, elige: eligeU, suelta: sueltaU, cierra: cierra, refresca: refresca, usa: usa, mensaje: mensaje, abierta: abierta, elegido: elegido,
      actualiza: actualiza, cercano: cercano, presentador: presentador, olvida: olvida, libera: libera, estado: estado };
  })();
  // [motor:fin]
  window.__usables = function () { return Usables.estado(); };   // pruebas y ?debug
