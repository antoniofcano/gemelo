// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: ComponentesPuro, Reparto, Bus, Pausa, ConfigPuro, Teclas, Componentes, Config
// Consume: 01_datos (D), 08_marcadores (listo), 09_camara (pon), 16_vida (quita)
// Nota: Núcleo de componentes (ADR-0023): ComponentesPuro, Bus (catálogo en contratos/eventos.json), Teclas, Componentes (registro, encendido URL > servidor > defecto, fases del bucle, filtro por mundo) y Config (GET /api/config del mismo origen al cargar, solo con D.base /teselas/… o ?api=; caída al código; contratos/config.schema.json). ComponentesPuro y Componentes viven en apps/web/src/nucleo/componentes.ts (MU2-5; el módulo los crea con Nucleo.creaComponentes y conserva Bus, Reparto, Pausa, Teclas y Config): no es un talón completo. Publica además window.__componentes y window.__config (pruebas y ?debug). El trozo [puro:…] (ConfigPuro) lo evalúan en Node pruebas/guardianes/config_motor.test.js y oficina_olivos.test.js; el Bus, componentes.test.js.
// ===============================================================================
  // ---------- núcleo de componentes (ADR-0023, doc/sistema/COMPONENTES.md §3): el registro, el bus de eventos y las teclas.
  // Un componente es un fichero de apps/web/motor/ que en su primer nivel solo define su lógica pura y llama a Componentes.registra({ … }). Nada se
  // monta al registrarse: Componentes.arranca() (en 90_final.js, cuando ya están todos los ficheros) decide quién se enciende (URL > configuración del
  // servidor > defecto del manifiesto), los monta en orden de dependencias y, desde entonces, el bucle llama a sus fases sin nombrarlos:
  //   «mundo» cada fotograma, tras la cámara · «tarde» a su ritmo (fases: { tarde: 0.5 } = cada 0,5 s, repartidos entre fotogramas), antes de la Cola ·
  //   «trasRender» después de pintar · «pausa» SOLO con el mundo en pausa (Pausa, abajo: un juego a pantalla completa), y entonces es lo único que corre.
  // En VR el bucle lo lleva la sesión y las fases siguen (la pausa no se aplica en VR); con la página oculta, el navegador para el bucle y con él las fases.
  // Quitar un componente (apagarlo o no montarlo en el motor: genera_motor.mjs --sin) no rompe a nadie: los demás le hablan por el Bus o por
  // Componentes.api(id), que devuelve null si no está. Lo que un componente engancha con n.on / n.limpia se suelta solo al liberarlo.
  // Catálogo de eventos: contratos/eventos.json. La configuración del servidor (GET /api/config, C6/OF6: contratos/config.schema.json) la pide Config al
  // cargar (abajo); su bloque «componentes» entra por Componentes.configura y sus parámetros de la escalera y épocas, por Config.param / Config.tablaEpocas.
  // [puro:inicio] (sin DOM ni THREE: lo evalúan en Node pruebas/guardianes/config_motor.test.js y oficina_olivos.test.js, con el Nucleo de verdad)
  // ComponentesPuro (validar el manifiesto, ordenar, encender, el filtro por mundo) pasó a TypeScript (MU2-5): apps/web/src/nucleo/componentes.ts
  var ComponentesPuro = Nucleo.ComponentesPuro;

  // Q0h: el reparto del JS por bloque dentro del fotograma. Sin medir (Reparto.on falso) el bucle no lee el reloj ni toca nada: cada medición es «if (rp) q = Reparto.pasa(bloque, q)» con rp leído una vez por fotograma.
  // Midiendo (30_mide.js lo enciende), pasa() suma al bloque los ms desde la marca anterior en un Float64Array preasignado (sin reservas por fotograma). Los bloques se dan de alta una vez (reg) al montar o la primera vez que se miden.
  var Reparto = (function () {
    var MAX = 64, ms = new Float64Array(MAX), nom = [], r = { on: false, t: -1, ms: ms, nom: nom, n: 0, MAX: MAX, reg: reg, ini: ini, pasa: pasa };
    function reg(nombre) { var i = nom.indexOf(nombre); if (i >= 0) return i; if (nom.length >= MAX) return MAX - 1; nom.push(nombre); r.n = nom.length; return nom.length - 1; }
    function ini(t) { for (var i = 0; i < MAX; i++) ms[i] = 0; r.t = t; return performance.now(); }
    function pasa(i, q) { var a = performance.now(); ms[i] += a - q; return a; }
    return r;
  })();

  // el bus de eventos: Bus.on(evento, fn) → quita; Bus.emite(evento, datos); Bus.hay(evento) (¿alguien escucha?). Nombres «dominio:accion», todos en contratos/eventos.json
  var Bus = (function () {
    // AG-1.4c: la lista de oyentes de un evento es INMUTABLE: dar de alta o de baja (raro) crea una lista nueva; emitir (a cada fotograma, a veces) recorre la lista que
    // había al empezar sin copiarla ni crear cierres. Es la misma semántica de antes (copia al emitir): quien se da de baja durante la emisión la recibe aún; quien se
    // da de alta durante ella, no hasta la siguiente; un oyente que falla no impide a los demás.
    var oy = {};
    function on(ev, fn) {
      if (typeof fn !== "function") return function () {};
      var n = (oy[ev] || []).slice(); n.push(fn); oy[ev] = n;
      return function () { var l = oy[ev], i = l ? l.indexOf(fn) : -1; if (i >= 0) { var m = l.slice(); m.splice(i, 1); oy[ev] = m; } };
    }
    function avisaFallo(ev, e) { try { console.error("[Bus] " + ev, e); } catch (e2) {} }
    function emite(ev, datos) {
      var l = oy[ev]; if (!l || !l.length) return 0;
      for (var i = 0, fn; i < l.length; i++) { fn = l[i]; try { fn(datos); } catch (e) { avisaFallo(ev, e); } }   // fn suelta: sin «this» (como el forEach de antes)
      return oy[ev].length;   // los que hay al terminar (la lista es la de ahora, no la de antes de emitir)
    }
    function hay(ev) { return !!(oy[ev] && oy[ev].length); }
    return { on: on, emite: emite, hay: hay };
  })();

  // el mundo en pausa (C9a): mientras alguien la pide (Pausa.pon(quien)), el bucle de 90_final.js no avanza el mundo ni lo pinta: solo corre la fase «pausa» de
  // los componentes (un juego a pantalla completa) y el contador de ?debug. El reloj del mundo, la fauna, la carga de teselas y la Cola se quedan quietos donde
  // estaban; al quitarla, todo sigue (el primer dt va recortado a 0,1 s como siempre). No se aplica en VR. Emite «mundo:pausa» al entrar y al salir.
  var Pausa = (function () {
    var quien = {}, n = 0;
    function pon(id) { id = String(id || "?"); if (quien[id]) return false; quien[id] = true; n++; if (n === 1) Bus.emite("mundo:pausa", { activa: true }); return true; }
    function quita(id) { id = String(id || "?"); if (!quien[id]) return false; delete quien[id]; n--; if (n === 0) Bus.emite("mundo:pausa", { activa: false }); return true; }
    function activa() { return n > 0; }
    return { pon: pon, quita: quita, activa: activa, quien: function () { return Object.keys(quien); } };
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
      "escalera.fraccionE0Gafas": [0, 0.5], "escalera.factorCopa": [0.5, 1.5], "escalera.vrJsMs": [4, 16]
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

  // el registro de componentes y su ciclo de vida (MU2-5): migrados a TypeScript, en apps/web/src/nucleo/componentes.ts (creaComponentes), con el filtro
  // por mundo («mundos» en el manifiesto; «mundo:entra» y «mundo:sale» del Bus). De aquí recibe el Bus, el Reparto, el reloj, la URL, el documento y la consola.
  var Componentes = Nucleo.creaComponentes({
    bus: Bus,
    reparto: Reparto,
    ahora: function () { return performance.now(); },
    busqueda: function () { return (typeof location !== "undefined" && location.search) || ""; },
    documento: typeof document !== "undefined" ? document : null,
    consola: typeof console !== "undefined" ? console : null
  });
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
