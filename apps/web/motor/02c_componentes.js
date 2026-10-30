// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Bus, Teclas, Componentes, Config
// Consume: 01_datos (D, $), 02b_cola (Cola), 08_marcadores (listo), 09_camara (suelta), 12_paseo (teclas), 14_historia (tabla, lista),
//   15_tiempo (nivel, hace), 16_vida (quita), 28_depura (dep), 90_final (bucle)
// Nota: Núcleo de componentes (ADR-0023): ComponentesPuro, Bus (catálogo en contratos/eventos.json), Teclas, Componentes (registro, encendido URL > servidor > defecto, fases del bucle) y Config (GET /api/config del mismo origen al cargar, solo con D.base /teselas/… o ?api=; caída al código; contratos/config.schema.json). Publica además window.__componentes y window.__config (pruebas y ?debug). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/componentes.test.js.
// ===============================================================================
  // ---------- núcleo de componentes (ADR-0023, doc/sistema/COMPONENTES.md §3): el registro, el bus de eventos y las teclas.
  // Un componente es un fichero de apps/web/motor/ que en su primer nivel solo define su lógica pura y llama a Componentes.registra({ … }). Nada se
  // monta al registrarse: Componentes.arranca() (en 90_final.js, cuando ya están todos los ficheros) decide quién se enciende (URL > configuración del
  // servidor > defecto del manifiesto), los monta en orden de dependencias y, desde entonces, el bucle llama a sus fases sin nombrarlos:
  //   «mundo» cada fotograma, tras la cámara · «tarde» a su ritmo (fases: { tarde: 0.5 } = cada 0,5 s, repartidos entre fotogramas), antes de la Cola ·
  //   «trasRender» después de pintar. En VR el bucle lo lleva la sesión y las fases siguen; con la página oculta, el navegador para el bucle y con él las fases.
  // Quitar un componente (apagarlo o no montarlo en el motor: genera_motor.mjs --sin) no rompe a nadie: los demás le hablan por el Bus o por
  // Componentes.api(id), que devuelve null si no está. Lo que un componente engancha con n.on / n.limpia se suelta solo al liberarlo.
  // Catálogo de eventos: contratos/eventos.json. La configuración del servidor (GET /api/config, C6/OF6: contratos/config.schema.json) la pide Config al
  // cargar (abajo); su bloque «componentes» entra por Componentes.configura y sus parámetros de la escalera y épocas, por Config.param / Config.tablaEpocas.
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

  // la configuración versionada del servidor (C6 y OF6; contratos/config.schema.json): GET /api/config del mismo origen, con caída a lo del código.
  // Precedencia de cada parámetro: URL (pruebas) > configuración > código; el motor RECORTA cada valor a sus límites aunque la api ya los haya
  // validado, y los presupuestos de gafas solo pueden bajar respecto al código. La respuesta se espera como mucho ESPERA ms al arrancar: si llega
  // tarde, se ignora (nada cambia en caliente con alguien dentro); sin servidor, con 401/404/503, sin red o con una respuesta rara, los defectos, sin
  // avisar en consola (las pruebas cuentan los errores).
  var ConfigPuro = (function () {
    var ESPERA = 2000;
    // los límites de contratos/config.schema.json (pruebas/guardianes/config_motor.test.js comprueba que son los mismos): [mín, máx, entero?, soloBaja?]
    var LIMITES = {
      "escalera.umbralesPx.e0": [300, 2000], "escalera.umbralesPx.e1": [100, 1000], "escalera.umbralesPx.e2": [30, 400],
      "escalera.bandaM": [0, 3], "escalera.histeresis": [0.03, 0.2],
      "escalera.maxPropios": [1, 8, true], "escalera.maxPropiosGafas": [1, 4, true], "escalera.maxVariantes": [0, 64, true],
      "escalera.triangulos.escritorio": [300000, 700000, true], "escalera.triangulos.movil": [120000, 300000, true],
      "escalera.triangulos.gafas": [50000, 380000, true, true],
      "escalera.fraccionE0Gafas": [0, 0.5], "escalera.factorCopa": [0.5, 1.5]
    };
    var EPOCAS = ["reposo", "boton", "flor", "cuajado", "verde", "envero", "madura"];
    function esObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
    // el valor de una ruta «a.b.c» (o «a.b.2» en una lista); undefined si no está
    function busca(cfg, ruta) {
      var v = cfg; ruta.split(".").forEach(function (k) { v = v !== null && typeof v === "object" ? v[k] : undefined; });
      return v;
    }
    // recorta un valor de la configuración a sus límites (ruta sin el índice: «escalera.triangulos.gafas.1» usa los de «…gafas»); undefined si no es número
    function recorta(ruta, v, codigo) {
      var L = LIMITES[ruta] || LIMITES[ruta.replace(/\.\d+$/, "")];
      if (!L || typeof v !== "number" || !isFinite(v)) return undefined;
      v = Math.min(L[1], Math.max(L[0], v)); if (L[2]) v = Math.round(v);
      if (L[3] && typeof codigo === "number" && isFinite(codigo)) v = Math.min(v, codigo);
      return v;
    }
    // un parámetro: { v, origen: "url" | "config" | "codigo" }. url: lo que dio la URL (undefined o null si nada; la URL ya trae sus propios topes)
    function param(cfg, ruta, codigo, url) {
      if (url !== undefined && url !== null && !(typeof url === "number" && isNaN(url))) return { v: url, origen: "url" };
      var c = cfg ? recorta(ruta, busca(cfg, ruta), codigo) : undefined;
      return c !== undefined ? { v: c, origen: "config" } : { v: codigo, origen: "codigo" };
    }
    // los tres umbrales van juntos: con e1 ≤ e0 / 1,5 y e2 ≤ e1 / 1,5 (tras recortar) o ninguno
    function umbrales(cfg, codigo, url) {
      if (url) return { v: url, origen: "url" };
      var u = cfg ? busca(cfg, "escalera.umbralesPx") : undefined;
      if (!esObj(u)) return { v: codigo, origen: "codigo" };
      var e = ["e0", "e1", "e2"].map(function (k) { return recorta("escalera.umbralesPx." + k, u[k]); });
      if (e.some(function (x) { return x === undefined; }) || e[1] > e[0] / 1.5 || e[2] > e[1] / 1.5) return { v: codigo, origen: "codigo", motivo: "umbrales de la configuración incoherentes" };
      return { v: e, origen: "config" };
    }
    // las épocas (como apps/web/olivo/epocas.js): «MM-DD» en UTC, ventanas con ambos extremos dentro; si desde > hasta, cruza el fin de año
    function mmdd(f) { var d = f instanceof Date ? f : new Date(f); return ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2); }
    function dentro(m, v) { return v.desde <= v.hasta ? m >= v.desde && m <= v.hasta : m >= v.desde || m <= v.hasta; }
    function validaTabla(t) {
      if (!esObj(t)) return ["la tabla no es un objeto"];
      var err = EPOCAS.filter(function (e) { return !esObj(t[e]) || typeof t[e].desde !== "string" || typeof t[e].hasta !== "string"; }).map(function (e) { return "falta la época " + e; });
      if (err.length) return err;
      for (var d = 0; d < 366; d++) {
        var m = mmdd(new Date(Date.UTC(2024, 0, 1 + d))), n = EPOCAS.filter(function (e) { return dentro(m, t[e]); }).length;
        if (n !== 1) err.push(m + (n ? ": en varias épocas" : ": sin época"));
      }
      return err.slice(0, 10);
    }
    // la tabla de épocas de una finca (la suya o la común), solo si cubre los 366 días con una época por día; si no, null
    function tablaEpocas(cfg, finca) {
      var ep = cfg && cfg.epocas; if (!esObj(ep)) return null;
      var t = (esObj(ep.fincas) && ep.fincas[finca]) || ep.comun;
      return validaTabla(t).length ? null : t;
    }
    function epocaDeFecha(t, fecha) { var m = mmdd(fecha); for (var i = 0; i < EPOCAS.length; i++) if (dentro(m, t[EPOCAS[i]])) return EPOCAS[i]; return null; }
    // de dónde pedirla: ?api=<prefijo> (pruebas; ruta relativa del mismo origen acabada en «/») o «/api/» si la página la sirve el servidor (D.base /teselas/…)
    function prefijoApi(busqueda, base) {
      var m = /[?&]api=([^&#]*)/.exec(busqueda || "");
      if (m) { var p = decodeURIComponent(m[1]); return /^\/?[A-Za-z0-9_\-.][A-Za-z0-9_\-./]*\/$/.test(p) && p.indexOf("//") < 0 && p.indexOf("..") < 0 ? p : null; }
      return /^\/teselas\//.test(base || "") ? "/api/" : null;
    }
    // la forma mínima de la respuesta { version, estado, config: { v: 1, … } }; lo fino (límites) se recorta al usarlo
    function validaRespuesta(j) {
      if (!esObj(j) || !esObj(j.config) || j.config.v !== 1) return "la respuesta no trae config v1";
      var c = j.config;
      if (c.componentes !== undefined && ComponentesPuro.validaConfig(c.componentes).length) return "componentes no válidos";
      if (c.escalera !== undefined && !esObj(c.escalera)) return "escalera no es un objeto";
      if (c.epocas !== undefined && !esObj(c.epocas)) return "epocas no es un objeto";
      return "";
    }
    /** pide la configuración: o = { fetch, prefijo, espera?, ahora? } → Promise de { cfg (o null), estado: { origen, version?, estadoVersion?, motivo?, ms? } }.
     *  Nunca falla ni escribe en la consola. */
    function lee(o) {
      var ahora = o.ahora || Date.now, t0 = ahora();
      if (!o.prefijo || typeof o.fetch !== "function") return Promise.resolve({ cfg: null, estado: { origen: "codigo", motivo: "sin servidor" } });
      var pide = Promise.resolve().then(function () {
        return o.fetch(o.prefijo + "config", { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" } });
      }).then(function (r) {
        if (!r || r.status !== 200) return { cfg: null, estado: { origen: "codigo", motivo: "http " + (r ? r.status : "?") } };
        return r.json().then(function (j) {
          var mal = validaRespuesta(j);
          if (mal) return { cfg: null, estado: { origen: "codigo", motivo: mal } };
          return { cfg: j.config, estado: { origen: j.version ? "servidor" : "codigo", motivo: j.version ? "" : "sin versión publicada", version: j.version || null, estadoVersion: j.estado || null } };
        });
      }).catch(function () { return { cfg: null, estado: { origen: "codigo", motivo: "sin red o respuesta ilegible" } }; });
      var reloj = null, espera = new Promise(function (res) { reloj = setTimeout(function () { res({ cfg: null, estado: { origen: "codigo", motivo: "tarde (más de " + (o.espera || ESPERA) + " ms)" }, tarde: true }); }, o.espera || ESPERA); });
      return Promise.race([pide, espera]).then(function (r) { clearTimeout(reloj); r.estado.ms = Math.round(ahora() - t0); return r; });
    }
    return { ESPERA: ESPERA, LIMITES: LIMITES, EPOCAS: EPOCAS, busca: busca, recorta: recorta, param: param, umbrales: umbrales, validaTabla: validaTabla, tablaEpocas: tablaEpocas,
      epocaDeFecha: epocaDeFecha, prefijoApi: prefijoApi, validaRespuesta: validaRespuesta, lee: lee };
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

  // la configuración del servidor, pedida UNA vez al cargar (ConfigPuro.lee): Config.listo (promesa que nunca falla, con la configuración o null),
  // Config.al(fn) (fn(cfg) al llegar, o ya si llegó), Config.param(ruta, código, url) y Config.umbrales(código, url) para los parámetros (la escalera:
  // 01_datos, 07ab, 07b; los perfiles VR: 29_vr), Config.tablaEpocas(finca) y Config.estado() (lo enseña ?debug con window.__config). Su bloque
  // «componentes» va a Componentes.configura.
  var Config = (function () {
    var P = ConfigPuro, cfg = null, est = { origen: "codigo", motivo: "pidiendo" }, hecho = false, esperan = [], usados = {};
    var listo = P.lee({ fetch: typeof fetch === "function" ? function (u, o) { return fetch(u, o); } : null,
      prefijo: P.prefijoApi(typeof location !== "undefined" ? location.search : "", typeof D !== "undefined" && D ? D.base : "") }).then(function (r) {
      cfg = r.cfg; est = r.estado; hecho = true;
      if (cfg && cfg.componentes) Componentes.configura(cfg.componentes);
      esperan.splice(0).forEach(function (fn) { try { fn(cfg); } catch (e) { try { console.error("[Config]", e); } catch (e2) {} } });
      return cfg;
    });
    function al(fn) { if (hecho) fn(cfg); else esperan.push(fn); }
    function param(ruta, codigo, url) { var r = P.param(cfg, ruta, codigo, url); usados[ruta] = { v: r.v, origen: r.origen }; return r.v; }
    function umbrales(codigo, url) { var r = P.umbrales(cfg, codigo, url); usados["escalera.umbralesPx"] = r; return r.v; }
    function tablaEpocas(finca) { return P.tablaEpocas(cfg, finca); }
    function estado() { return Object.assign({ hecho: hecho, usados: usados }, est); }
    return { listo: listo, al: al, param: param, umbrales: umbrales, tablaEpocas: tablaEpocas, epocaDeFecha: P.epocaDeFecha, estado: estado };
  })();
  window.__config = function () { return Config.estado(); };   // ?debug y pruebas
