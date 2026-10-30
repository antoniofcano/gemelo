// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Bus, Teclas, Componentes
// Consume: 01_datos ($), 02b_cola (Cola), 09_camara (suelta), 12_paseo (teclas), 14_historia (lista), 15_tiempo (nivel, hace), 16_vida (quita),
//   28_depura (dep), 90_final (bucle)
// Nota: Núcleo de componentes (ADR-0023): ComponentesPuro, Bus (catálogo en contratos/eventos.json), Teclas y Componentes (registro, encendido URL > servidor > defecto, fases del bucle). Publica además window.__componentes (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/componentes.test.js.
// ===============================================================================
  // ---------- núcleo de componentes (ADR-0023, doc/sistema/COMPONENTES.md §3): el registro, el bus de eventos y las teclas.
  // Un componente es un fichero de apps/web/motor/ que en su primer nivel solo define su lógica pura y llama a Componentes.registra({ … }). Nada se
  // monta al registrarse: Componentes.arranca() (en 90_final.js, cuando ya están todos los ficheros) decide quién se enciende (URL > configuración del
  // servidor > defecto del manifiesto), los monta en orden de dependencias y, desde entonces, el bucle llama a sus fases sin nombrarlos:
  //   «mundo» cada fotograma, tras la cámara · «tarde» a su ritmo (fases: { tarde: 0.5 } = cada 0,5 s, repartidos entre fotogramas), antes de la Cola ·
  //   «trasRender» después de pintar. En VR el bucle lo lleva la sesión y las fases siguen; con la página oculta, el navegador para el bucle y con él las fases.
  // Quitar un componente (apagarlo o no montarlo en el motor: genera_motor.mjs --sin) no rompe a nadie: los demás le hablan por el Bus o por
  // Componentes.api(id), que devuelve null si no está. Lo que un componente engancha con n.on / n.limpia se suelta solo al liberarlo.
  // Catálogo de eventos: contratos/eventos.json; bloque «componentes» de la configuración del servidor: contratos/config.schema.json.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/componentes.test.js)
  var ComponentesPuro = (function () {
    var FASES = ["mundo", "tarde", "trasRender"];
    var ID = /^[a-z][a-z0-9-]*$/, URLN = /^[a-z][a-z0-9]*$/;
    function esLista(v) { return Array.isArray(v) && v.every(function (x) { return typeof x === "string" && x.length > 0; }); }
    function num(v) { return typeof v === "number" && isFinite(v) && v >= 0; }
    // el manifiesto: devuelve la lista de errores (vacía si vale)
    function valida(d) {
      var e = [];
      if (!d || typeof d !== "object") return ["el manifiesto no es un objeto"];
      if (typeof d.id !== "string" || !ID.test(d.id)) e.push("id: minúsculas, cifras y guiones, empezando por letra");
      if (d.version !== undefined && !(Number.isInteger(d.version) && d.version >= 1)) e.push("version: entero ≥ 1");
      ["consume", "expone"].forEach(function (k) { if (!esLista(d[k])) e.push(k + ": lista de nombres (puede ser vacía)"); });
      var ev = d.eventos;
      if (!ev || typeof ev !== "object" || !esLista(ev.escucha || []) || !esLista(ev.emite || [])) e.push("eventos: { escucha: [...], emite: [...] }");
      var b = d.bandera;
      if (!b || typeof b !== "object" || typeof b.defecto !== "boolean") e.push("bandera: { defecto: true|false, url?: nombre }");
      else if (b.url !== undefined && (typeof b.url !== "string" || !URLN.test(b.url))) e.push("bandera.url: minúsculas y cifras");
      var p = d.presupuesto;
      if (!p || typeof p !== "object" || !num(p.llamadas) || !num(p.triangulos) || (p.texturasMB !== undefined && !num(p.texturasMB))) e.push("presupuesto: { llamadas, triangulos, texturasMB? } ≥ 0 (regla 6)");
      var f = d.fases || {}, a = d.actualiza || {};
      if (typeof f !== "object") e.push("fases: objeto");
      Object.keys(f).forEach(function (k) {
        if (FASES.indexOf(k) < 0) e.push("fases." + k + ": fase desconocida (hay " + FASES.join(", ") + ")");
        else if (!num(f[k])) e.push("fases." + k + ": segundos ≥ 0 (0 = cada fotograma)");
        if (typeof a[k] !== "function") e.push("actualiza." + k + ": falta la función de la fase");
      });
      Object.keys(a).forEach(function (k) { if (!(k in f)) e.push("actualiza." + k + ": fase no declarada en fases"); });
      if (typeof d.monta !== "function") e.push("monta: función");
      if (typeof d.libera !== "function") e.push("libera: función (obligatoria: todo recurso se suelta)");
      if (d.cultivo !== undefined && !(typeof d.cultivo === "string" || esLista(d.cultivo))) e.push("cultivo: nombre o lista");
      return e;
    }
    // el orden de montaje: quien consume lo que otro expone va después. Devuelve { orden: [ids], ciclos: [[ids]] } (con ciclos, esos no se ordenan)
    function orden(defs) {
      var quien = {}, ids = defs.map(function (d) { return d.id; }), dep = {};
      defs.forEach(function (d) { (d.expone || []).forEach(function (n) { quien[n] = d.id; }); });
      defs.forEach(function (d) { dep[d.id] = (d.consume || []).map(function (n) { return quien[n]; }).filter(function (q) { return q && q !== d.id; }); });
      var out = [], estado = {}, ciclos = [];
      function visita(id, pila) {
        if (estado[id] === 2) return; if (estado[id] === 1) { ciclos.push(pila.slice(pila.indexOf(id)).concat(id)); return; }
        estado[id] = 1; pila.push(id); dep[id].forEach(function (q) { visita(q, pila); }); pila.pop(); estado[id] = 2; out.push(id);
      }
      ids.forEach(function (id) { visita(id, []); });
      return { orden: out, ciclos: ciclos, depende: dep };
    }
    // ?<nombre>=0|no|false|off apaga; =1|si|sí|true|on (o sin valor) enciende; si no está, undefined
    function valorUrl(busqueda, nombre) {
      if (!nombre) return undefined;
      var m = new RegExp("[?&]" + nombre + "(?:=([^&#]*))?(?:[&#]|$)").exec(busqueda || ""); if (!m) return undefined;
      var v = decodeURIComponent(m[1] || "").toLowerCase();
      return v === "" || v === "1" || v === "si" || v === "sí" || v === "true" || v === "on" ? true : v === "0" || v === "no" || v === "false" || v === "off" ? false : undefined;
    }
    // ¿encendido? precedencia: URL > servidor (bloque «componentes» de la configuración) > defecto del manifiesto
    function encendido(d, busqueda, servidor) {
      var u = valorUrl(busqueda, d.bandera && d.bandera.url);
      if (u !== undefined) return { activo: u, origen: "url" };
      var s = servidor && servidor[d.id];
      if (s && typeof s.activo === "boolean") return { activo: s.activo, origen: "servidor" };
      return { activo: !!(d.bandera && d.bandera.defecto), origen: "defecto" };
    }
    // el bloque «componentes» de la configuración (contratos/config.schema.json): { "<id>": { activo: bool, parametros?: {} } }
    function validaConfig(c) {
      var e = [];
      if (!c || typeof c !== "object" || Array.isArray(c)) return ["componentes: objeto { id: { activo, parametros? } }"];
      Object.keys(c).forEach(function (id) {
        var x = c[id];
        if (!ID.test(id)) e.push(id + ": id no válido");
        if (!x || typeof x !== "object" || typeof x.activo !== "boolean") e.push(id + ": falta activo (true|false)");
        else Object.keys(x).forEach(function (k) { if (k !== "activo" && k !== "parametros") e.push(id + "." + k + ": campo desconocido"); });
        if (x && x.parametros !== undefined && (typeof x.parametros !== "object" || x.parametros === null || Array.isArray(x.parametros))) e.push(id + ".parametros: objeto");
      });
      return e;
    }
    // cuándo toca una fase con periodo: acumula dt; devuelve el dt acumulado si toca (y lo pone a cero) o −1
    function toca(est, periodo, dt) { est.acum += dt; if (est.acum < periodo) return -1; var a = est.acum; est.acum = 0; return a; }
    return { FASES: FASES, valida: valida, orden: orden, valorUrl: valorUrl, encendido: encendido, validaConfig: validaConfig, toca: toca };
  })();

  // el bus de eventos: Bus.on(evento, fn) → quita; Bus.emite(evento, datos); Bus.hay(evento) (¿alguien escucha?). Nombres «dominio:accion», todos en contratos/eventos.json
  var Bus = (function () {
    var oy = {};
    function on(ev, fn) {
      if (typeof fn !== "function") return function () {};
      (oy[ev] = oy[ev] || []).push(fn);
      return function () { var l = oy[ev], i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); };
    }
    function emite(ev, datos) {
      var l = oy[ev]; if (!l || !l.length) return 0;
      l.slice().forEach(function (fn) { try { fn(datos); } catch (e) { try { console.error("[Bus] " + ev, e); } catch (e2) {} } });
      return l.length;
    }
    function hay(ev) { return !!(oy[ev] && oy[ev].length); }
    return { on: on, emite: emite, hay: hay };
  })();
  // [puro:fin]

  // las teclas de los componentes (una sola escucha en la ventana): Teclas.registra(codigo, fn, dueño) → quita. Como las del HUD: nada con el foco en un
  // campo, con Ctrl/Alt/Cmd ni al repetir. fn(e) devuelve false si no la ha usado (entonces no se anula lo del navegador). Las teclas que ya usan los
  // módulos de siempre están reservadas: registrar una de ellas, o una ya registrada, devuelve null y no hace nada (dos dueños para una tecla, nunca).
  var Teclas = (function () {
    var RESERVADAS = {
      Escape: "31_hud", F1: "31_hud", KeyF: "31_hud", Home: "31_hud", Enter: "31_hud", NumpadEnter: "31_hud",
      ArrowUp: "12_paseo", ArrowDown: "12_paseo", ArrowLeft: "12_paseo", ArrowRight: "12_paseo", KeyW: "12_paseo", KeyA: "12_paseo", KeyS: "12_paseo", KeyD: "12_paseo",
      ShiftLeft: "12_paseo", ShiftRight: "12_paseo", Space: "12_paseo", KeyC: "12_paseo", KeyV: "12_paseo", KeyQ: "12_paseo", KeyE: "12_paseo",
      KeyL: "12b_llegada", KeyH: "13b_hazas", KeyM: "17_minimapa"
    };
    for (var i = 0; i <= 6; i++) { RESERVADAS["Digit" + i] = "31_hud"; RESERVADAS["Numpad" + i] = "31_hud"; }
    var mapa = {}, escuchando = false;
    function campo(el) { var t = el && el.tagName; return t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || !!(el && el.isContentEditable); }
    function alPulsar(e) {
      var r = mapa[e.code]; if (!r || e.ctrlKey || e.metaKey || e.altKey || e.repeat || campo(e.target)) return;
      var usada; try { usada = r.fn(e); } catch (er) { try { console.error("[Teclas] " + e.code, er); } catch (e2) {} }
      if (usada !== false) e.preventDefault();
    }
    function registra(codigo, fn, dueno) {
      if (typeof fn !== "function" || RESERVADAS[codigo] || mapa[codigo]) return null;
      mapa[codigo] = { fn: fn, dueno: dueno || "" };
      if (!escuchando) { window.addEventListener("keydown", alPulsar); escuchando = true; }
      var r = mapa[codigo];
      return function () { if (mapa[codigo] === r) delete mapa[codigo]; };
    }
    function dueno(codigo) { return RESERVADAS[codigo] || (mapa[codigo] && (mapa[codigo].dueno || "?")) || null; }
    return { registra: registra, dueno: dueno, RESERVADAS: RESERVADAS };
  })();

  var Componentes = (function () {
    var P = ComponentesPuro, defs = [], C = {}, ordenIds = [], arrancado = false, servidor = null, busqueda = "";
    function registra(def) {
      var e = P.valida(def);
      if (!e.length && C[def.id]) e = ["id repetido: " + def.id];
      if (e.length) { try { console.error("[Componentes] manifiesto no válido (" + (def && def.id) + "): " + e.join("; ")); } catch (er) {} return false; }
      defs.push(def); C[def.id] = { def: def, activo: false, api: null, motivo: "sin arrancar", origen: "", limpia: [], est: {}, n: 0 };
      if (arrancado) { ordena(); decide(def.id); }   // un componente que llega tarde (import() perezoso) se monta al registrarse
      return true;
    }
    function ordena() { var o = P.orden(defs); ordenIds = o.orden; o.ciclos.forEach(function (c) { c.forEach(function (id) { if (C[id]) C[id].ciclo = c.join(" → "); }); }); }
    // el contexto que recibe monta(n): lo que se engancha por aquí se suelta solo al liberar
    function contexto(c) {
      var n = {
        id: c.def.id,
        parametros: (servidor && servidor[c.def.id] && servidor[c.def.id].parametros) || {},
        limpia: function (fn) { if (typeof fn === "function") c.limpia.push(fn); return fn; },
        on: function (ev, fn) { return n.limpia(Bus.on(ev, fn)); },
        emite: function (ev, datos) { return Bus.emite(ev, datos); },
        api: api
      };
      return n;
    }
    function dependencias(c) {   // los componentes de los que consume (por su expone) y que no están montados
      var falta = [];
      (c.def.consume || []).forEach(function (nm) { defs.forEach(function (d) { if (d.id !== c.def.id && d.expone.indexOf(nm) >= 0 && !(C[d.id] && C[d.id].activo)) falta.push(d.id); }); });
      return falta;
    }
    function monta(id) {
      var c = C[id]; if (!c || c.activo) return !!(c && c.activo);
      if (c.ciclo) { c.motivo = "ciclo: " + c.ciclo; return false; }
      var falta = dependencias(c); if (falta.length) { c.motivo = "falta " + falta.join(", "); return false; }
      var n = contexto(c);
      try {
        var r = c.def.monta(n);
        c.api = r && typeof r === "object" ? r : {}; c.activo = true; c.motivo = ""; c.n++;
        var fs = c.def.fases || {}, k = ordenIds.indexOf(id);
        Object.keys(fs).forEach(function (f) { c.est[f] = { acum: fs[f] > 0 ? fs[f] * ((k + 1) % 4) / 4 : 0 }; });   // repartir los «tarde» entre fotogramas
      } catch (e) {
        c.limpia.splice(0).forEach(function (fn) { try { fn(); } catch (e2) {} });
        c.motivo = "error al montar: " + (e && e.message || e); try { console.error("[Componentes] " + id, e); } catch (e2) {}
        return false;
      }
      Bus.emite("componentes:cambia", { id: id, activo: true });
      return true;
    }
    function libera(id, motivo) {
      var c = C[id]; if (!c || !c.activo) return false;
      // primero, los que dependen de este
      defs.forEach(function (d) { if (d.id !== id && C[d.id].activo && (d.consume || []).some(function (nm) { return c.def.expone.indexOf(nm) >= 0; })) libera(d.id, "sin " + id); });
      try { c.def.libera(c.api); } catch (e) { try { console.error("[Componentes] libera " + id, e); } catch (e2) {} }
      c.limpia.splice(0).reverse().forEach(function (fn) { try { fn(); } catch (e) {} });
      c.activo = false; c.api = null; c.motivo = motivo || "apagado";
      Bus.emite("componentes:cambia", { id: id, activo: false });
      return true;
    }
    function decide(id) {
      var c = C[id], q = P.encendido(c.def, busqueda, servidor); c.origen = q.origen;
      if (q.activo) monta(id); else if (c.activo) libera(id, "apagado (" + q.origen + ")"); else c.motivo = "apagado (" + q.origen + ")";
    }
    function leeConfigPagina() {   // si la página trae <script type="application/json" id="config"> (el servidor puede dejarla ahí), su bloque «componentes»
      try { var el = document.getElementById("config"); if (el && el.textContent.trim()) { var j = JSON.parse(el.textContent); return j && j.componentes; } } catch (e) {}
      return null;
    }
    function configura(bloque) {   // el bloque «componentes» de /api/config (C6) o de la página; enciende y apaga en caliente (la URL sigue mandando)
      var e = P.validaConfig(bloque);
      if (e.length) { try { console.warn("[Componentes] configuración no válida: " + e.join("; ")); } catch (er) {} return false; }
      servidor = bloque;
      if (arrancado) ordenIds.forEach(decide);
      return true;
    }
    function arranca() {
      if (arrancado) return; arrancado = true; busqueda = (typeof location !== "undefined" && location.search) || "";
      var cfg = leeConfigPagina(); if (cfg) configura(cfg);
      ordena(); ordenIds.forEach(decide);
    }
    // el bucle (90_final.js): una fase para todos los encendidos, en orden de dependencias. Un componente que falla en su fase se apaga (y lo dice) para no
    // romper el fotograma de los demás
    function actualiza(fase, dt, t) {
      for (var i = 0; i < ordenIds.length; i++) {
        var c = C[ordenIds[i]]; if (!c.activo) continue;
        var fn = c.def.actualiza && c.def.actualiza[fase]; if (!fn) continue;
        var per = c.def.fases[fase], d = dt;
        if (per > 0) { d = P.toca(c.est[fase], per, dt); if (d < 0) continue; }
        try { fn(d, t, c.api); } catch (e) { try { console.error("[Componentes] " + c.def.id + " en «" + fase + "»", e); } catch (e2) {} libera(c.def.id, "error en «" + fase + "»: " + (e && e.message || e)); }
      }
    }
    function api(id) { var c = C[id]; return c && c.activo ? c.api : null; }
    function activo(id) { return !!(C[id] && C[id].activo); }
    function enciende(id, si) { var c = C[id]; if (!c) return false; return si ? monta(id) : libera(id, "apagado a mano"); }
    function resumen() {
      return (ordenIds.length ? ordenIds : defs.map(function (d) { return d.id; })).map(function (id) {
        var c = C[id], d = c.def;
        return { id: id, activo: c.activo, origen: c.origen, motivo: c.motivo, montajes: c.n, fases: Object.keys(d.fases || {}), presupuesto: d.presupuesto, cultivo: d.cultivo || null };
      });
    }
    return { registra: registra, arranca: arranca, actualiza: actualiza, configura: configura, api: api, activo: activo, enciende: enciende, libera: function (id) { return libera(id, "apagado a mano"); }, resumen: resumen };
  })();
  window.__componentes = function () { return Componentes.resumen(); };   // pruebas
