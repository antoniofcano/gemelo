// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02c_componentes (Componentes), 03_escena (modo), 13_parcelas (parcelas), 13b_hazas (HazasPuro), 32b_capas (Capas)
// Nota: Componente «vista-familia» (U9; petición de Antonio, 2026-11-02): la vista simple para las familias. Solo se registra; nadie lo nombra. Con rol de familia (GET /api/sesion → rol distinto de oficina y admin) o ?vista=familia oculta el selector de modo (queda Gemelo), «Guardados» y «Desfase» de Capas y de Mapa y rotula «Copas del LiDAR» como «Olivos»; oficina, admin y sin sesión lo ven todo; ?vista=completa fuerza la vista completa y ?vista=0 apaga el componente. Presupuesto 0; libera() lo restaura todo. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/vista_familia.test.js.
// ===============================================================================
  // ---------- la vista simple para las familias (U9; petición de Antonio, 2026-11-02): «Capas y vista» y «Mapa y parcelas» están bien para la oficina, pero una
  // familia ve UNA sola vista del gemelo y UN solo interruptor de olivos; elegir entre OlivarTrack, LiDAR y desfase no le dice nada. Lo del NDVI se queda (da para
  // aprendizaje de la familia). Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra; sin él (?vista=0, o genera_motor.mjs --sin) el motor pinta lo mismo
  // que antes. No crea nada: solo OCULTA controles de la plantilla (display:none) y lo deshace todo en libera().
  //  · Para la familia: se oculta el selector de modo (queda «Gemelo», forzado), «Guardados en OlivarTrack» y «Desfase» de «Datos», «Guardados», «Desfase medio»
  //    y la nota del desfase del mapa; «Copas del LiDAR» se rotula «Olivos» (sigue siendo lo medido, y su pastilla «medido»). Se quedan Linde, NDVI y Ambiente.
  //  · Oficina y admin lo ven todo como hoy; sin servidor o sin sesión (fixture, pruebas, local), todo como hoy.
  //  · El rol lo da GET /api/sesion (campo «rol»: hogar, guia, corresponsal, oficina, admin; ya existe: no se añade ninguna ruta); mientras no llega, se ve lo de
  //    siempre. ?vista=completa fuerza la vista completa (pruebas) y ?vista=familia la de familia (sin esperar a la sesión).
  // Es presentación, no seguridad: la api sigue comprobando el rol en cada ruta; los datos ocultos no se protegen aquí. Presupuesto (regla 6): 0 llamadas, 0 triángulos.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/vista_familia.test.js)
  var VistaFamiliaPuro = (function () {
    var OFICIAL = ["oficina", "admin"];
    // qué se oculta para la familia: { id, sube } (sube: selector del ancestro que se esconde de verdad; "" = el propio elemento)
    var OCULTA = [
      { id: "tModo", sube: "" }, { id: "mNube", sube: ".modo" }, { id: "notaModo", sube: "" },
      { id: "cMarc", sube: "label" }, { id: "cDesf", sube: "label" },
      { id: "kMarc", sube: "div" }, { id: "kDes", sube: "div" }, { id: "notaDesfase", sube: "" }
    ];
    var ROTULOS = [{ id: "cCopas", sube: "label", antes: "Copas del LiDAR", ahora: "Olivos" }];
    var MODO = "mGem";
    // qué vista toca: ?vista=completa|familia manda; si no, solo con sesión de una familia (rol conocido y no oficial); sin rol (sin sesión), la completa
    function vista(busqueda, rol) {
      var m = /[?&]vista=([^&#]*)/.exec(busqueda || ""), v = m ? decodeURIComponent(m[1]).toLowerCase() : "";
      if (v === "completa" || v === "familia") return v;
      if (typeof rol !== "string" || !rol) return "completa";
      return OFICIAL.indexOf(rol) >= 0 ? "completa" : "familia";
    }
    function plan(v) { return v === "familia" ? { oculta: OCULTA, rotulos: ROTULOS, forzar: MODO } : { oculta: [], rotulos: [], forzar: null }; }
    return { vista: vista, plan: plan, OCULTA: OCULTA, ROTULOS: ROTULOS, MODO: MODO };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/vista_familia.test.js con un DOM de mentira)
  function VistaFamiliaMotor(n) {
    var P = VistaFamiliaPuro, API = HazasPuro.prefijoApi(location.search, D.base), busqueda = location.search;
    var guardado = [], rotulado = [], modoAntes = null, forzoModo = false, vivo = true, aplicada = "completa";
    function destino(d) { var e = document.getElementById(d.id); if (e && d.sube && e.closest) e = e.closest(d.sube); return e; }
    function oculta(d) {
      var e = destino(d); if (!e || guardado.some(function (g) { return g.e === e; })) return;
      guardado.push({ e: e, display: e.style.display }); e.style.display = "none";
    }
    function rotula(d) {
      var e = destino(d); if (!e || !e.childNodes) return;
      for (var i = 0; i < e.childNodes.length; i++) {
        var t = e.childNodes[i];
        if (t.nodeType === 3 && t.nodeValue.indexOf(d.antes) >= 0) { rotulado.push({ t: t, antes: t.nodeValue }); t.nodeValue = t.nodeValue.replace(d.antes, d.ahora); return; }
      }
    }
    function modoActual() { var ids = ["mNube", "mGem", "mOrto"]; for (var i = 0; i < ids.length; i++) { var b = document.getElementById(ids[i]); if (b && b.getAttribute("aria-pressed") === "true") return ids[i]; } return null; }
    function pulsa(id) { var b = document.getElementById(id); if (b && b.click) b.click(); }
    function deshaz() {
      guardado.splice(0).forEach(function (g) { g.e.style.display = g.display; });
      rotulado.splice(0).forEach(function (r) { r.t.nodeValue = r.antes; });
      if (forzoModo && modoAntes) pulsa(modoAntes);
      forzoModo = false; modoAntes = null; aplicada = "completa";
    }
    function pone(v) {
      if (!vivo || v === aplicada) return;
      deshaz();
      var p = P.plan(v);
      p.oculta.forEach(oculta); p.rotulos.forEach(rotula);
      if (p.forzar) { modoAntes = modoActual(); if (modoAntes !== p.forzar) { pulsa(p.forzar); forzoModo = true; } }
      aplicada = v;
    }
    // montaje: ?vista= manda; si no, con servidor se pregunta quién eres (GET /api/sesion, la cookie del mismo origen); sin servidor o sin sesión, la vista completa
    if (/[?&]vista=(completa|familia)(?:[&#]|$)/i.test(busqueda)) pone(P.vista(busqueda, null));
    else if (API) {
      Promise.resolve().then(function () { return fetch(API + "sesion", { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } }); })
        .then(function (r) { return r && r.status === 200 && r.json ? r.json() : null; })
        .then(function (j) { if (vivo && j && typeof j.rol === "string") pone(P.vista(busqueda, j.rol)); })
        .catch(function () {});
    }
    return {
      libera: function () { vivo = false; deshaz(); },
      estado: function () { return { vista: aplicada, ocultos: guardado.length, rotulados: rotulado.length, forzoModo: forzoModo }; }
    };
  }
  // [motor:fin]

  Componentes.registra({
    id: "vista-familia", version: 1,
    consume: ["HazasPuro"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true, url: "vista" },
    presupuesto: { llamadas: 0, triangulos: 0 },
    monta: function (n) { return VistaFamiliaMotor(n); },
    libera: function (api) { if (api) api.libera(); }
  });
