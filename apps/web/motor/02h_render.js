// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Render, InfoDibujo
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- AG-3a / F1 (doc/sistema/MULTIVIEW.md §4, ADR-0031): qué renderizador y qué build, y la lectura de lo dibujado con la misma forma para los dos.
  // Hoy NO cambia nada: siempre el WebGLRenderer clásico (03_escena) y la build de pantalla (three 0.186.1). Lo que prepara:
  //   Render.pedido / Render.tipo   ?render=nuevo queda RESERVADO para el WebGPURenderer (F2-F5): se apunta y se avisa de que aún no existe; tipo sigue «clasico»
  //   Render.build                  «pantalla» (three) o «vr» (super-three, la build del Quest: apps/web/herramientas/builds.mjs); lo inyecta Vite (__GEMELO_BUILD__)
  //   Render.arranca(rd, fn)        el primer fotograma, tolerante a un `await rd.init()` futuro: el clásico no tiene init() y fn corre ya, como siempre
  //   InfoDibujo.lee(rd, o?)        { renderizador, fotograma, llamadas, triangulos, puntos, lineas, geometrias, texturas, programas } del clásico
  //                                 (info.render.calls, info.render.frame, info.programs = array) y del nuevo (info.render.drawCalls, info.frame,
  //                                 info.memory.programs = número). InfoDibujo.fotograma / .triangulos / .llamadas: lo mismo sin crear nada (por fotograma).
  // Ojo con las cifras: con multiview el nuevo cuenta UNA llamada por objeto para los dos ojos; el clásico, dos. Se rotulan por renderizador (MULTIVIEW §2.4).
  // Presupuesto (regla 6): no dibuja ni reserva nada.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/render_f1.test.js)
  var RenderPuro = (function () {
    var TIPOS = ["clasico", "nuevo"], BUILDS = ["pantalla", "vr"];
    function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
    // ?render=clasico|nuevo. hayNuevo: ¿esta build trae el WebGPURenderer? (hasta F2, no). Devuelve { pedido, tipo, advertencia }
    function eligeTipo(busqueda, hayNuevo) {
      var m = /[?&]render=([^&#]*)/.exec(typeof busqueda === "string" ? busqueda : ""), p = m ? decodeURIComponent(m[1]).toLowerCase() : "";
      if (!p) return { pedido: "", tipo: "clasico", advertencia: "" };
      if (TIPOS.indexOf(p) < 0) return { pedido: p, tipo: "clasico", advertencia: "?render=" + p + " no existe (clasico | nuevo): se usa el clásico" };
      if (p === "nuevo" && !hayNuevo) return { pedido: p, tipo: "clasico", advertencia: "?render=nuevo está reservado para el WebGPURenderer (ADR-0031, F2), que aún no existe en el motor: se usa el clásico" };
      return { pedido: p, tipo: p, advertencia: "" };
    }
    function buildDe(b) { return BUILDS.indexOf(b) >= 0 ? b : "pantalla"; }
    function esNuevo(info) { return !!(info && info.render && typeof info.render.drawCalls === "number"); }
    function fotograma(info) { if (!info) return 0; return esNuevo(info) ? num(info.frame) : num(info.render && info.render.frame); }
    function llamadas(info) { if (!info || !info.render) return 0; return esNuevo(info) ? num(info.render.drawCalls) : num(info.render.calls); }
    function triangulos(info) { return num(info && info.render && info.render.triangles); }
    // la misma forma para los dos renderizadores; o: objeto donde escribir (para no crear uno por llamada)
    function lee(info, o) {
      o = o || {};
      var r = (info && info.render) || {}, m = (info && info.memory) || {}, nuevo = esNuevo(info);
      o.renderizador = nuevo ? "nuevo" : "clasico";
      o.fotograma = fotograma(info);
      o.llamadas = llamadas(info);
      o.triangulos = num(r.triangles); o.puntos = num(r.points); o.lineas = num(r.lines);
      o.geometrias = num(m.geometries); o.texturas = num(m.textures);
      o.programas = nuevo ? num(m.programs) : info && info.programs && typeof info.programs.length === "number" ? info.programs.length : 0;
      return o;
    }
    // el primer fotograma: si el renderizador pide init() (el nuevo: render() lanza sin él) se espera; si no, fn corre ahora mismo, como siempre
    function arranca(rd, fn, alFallar) {
      if (!rd || typeof rd.init !== "function") { fn(); return null; }
      return Promise.resolve(rd.init()).then(function () { fn(); }, function (e) { if (alFallar) alFallar(e); else throw e; });
    }
    return { TIPOS: TIPOS, BUILDS: BUILDS, eligeTipo: eligeTipo, buildDe: buildDe, esNuevo: esNuevo, fotograma: fotograma, llamadas: llamadas, triangulos: triangulos, lee: lee, arranca: arranca };
  })();
  // [puro:fin]

  var Render = (function () {
    var e = RenderPuro.eligeTipo(typeof location !== "undefined" && location ? location.search : "", false);
    if (e.advertencia && typeof console !== "undefined") console.warn("render: " + e.advertencia);
    var b = RenderPuro.buildDe(typeof __GEMELO_BUILD__ !== "undefined" ? __GEMELO_BUILD__ : "pantalla");   // lo inyecta Vite (apps/web/vite.config.js)
    return {
      pedido: e.pedido, tipo: e.tipo, advertencia: e.advertencia, build: b,
      arranca: function (rd, fn) { return RenderPuro.arranca(rd, fn, function (err) { console.error("render: init() falló", err); }); }
    };
  })();

  var InfoDibujo = {
    lee: function (rd, o) { return RenderPuro.lee(rd && rd.info, o); },
    fotograma: function (rd) { return RenderPuro.fotograma(rd && rd.info); },
    llamadas: function (rd) { return RenderPuro.llamadas(rd && rd.info); },
    triangulos: function (rd) { return RenderPuro.triangulos(rd && rd.info); }
  };
