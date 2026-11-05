// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Materiales
// Consume: 02_mundo (copas), 02f_xr_perillas (XrPerillas), 02h_render (Render), 15_tiempo (hace), 16_vida (quita), 24_pantalla (suave)
// ===============================================================================
  // ---------- AG-3a / F1 (doc/sistema/MULTIVIEW.md §4, ADR-0031): la fábrica ÚNICA de los materiales propios del motor.
  // Todo sombreador propio pasa por aquí: los ShaderMaterial y los materiales de three con su parche (onBeforeCompile). Hoy devuelve EXACTAMENTE lo de siempre
  // (el mismo material, la misma función de parche: three usa su texto como clave del programa, así que no se envuelve). Lo que prepara es el punto donde,
  // más adelante (F4), la build de pantalla con el renderizador nuevo dará la versión TSL de cada uno, por su nombre:
  //   Materiales.parchea(mat, nombre, fn, clave?)            mat.onBeforeCompile = fn (y la clave de programa, si se da); devuelve mat
  //   Materiales.encadena(mat, nombre, fn, clave, propia?)   fn DESPUÉS del parche que ya tenga mat, con su clave combinada: la de apps/web/olivo/materiales.js
  //                                                          (07ab le pasa la de la biblioteca; sin ella, la copia de abajo, mismo contrato: lo prueba materiales_f1.test.js)
  //   Materiales.sombreador(nombre, opciones)                new THREE.ShaderMaterial(opciones)
  //   Materiales.nuevo(nombre, fabrica)                      (F4) registra la versión TSL: fabrica(mat | opciones) → NodeMaterial; solo se usa con Render.tipo «nuevo»
  //   Materiales.inventario()                                { nombre: { tipo, n } } de lo que ha pasado por aquí (pruebas y ?debug)
  //   Materiales.recorte(mat)                                AG-2.1: un material de recorte alfa (alphaTest > 0, cara de color; NUNCA los de sombra) pasa a alphaToCoverage si ?a2c lo deja y hay MSAA; devuelve mat
  //   Materiales.recortes(activo)                            enciende o apaga el alphaToCoverage de todos los que pasaron por recorte() (07ac lo apaga mientras hornea en un blanco sin MSAA)
  //   Materiales.a2c / Materiales.eligeA2c(busqueda, msaa)   el estado { pedido, activo, msaa, motivo, advertencia, n } y su parte pura (lo prueba pruebas/guardianes/a2c.test.js)
  //   ?a2c=0|1 (defecto 0, apagado; el ajuste «vista.a2c» de Configuración lo enciende; orden: URL, ajuste, apagado): 1 = alphaToCoverage donde hay MSAA (XrPerillas.aa; la perilla de MSAA de 02f lo quita); 0 = el alphaTest de siempre. Se conserva el umbral original del alphaTest (el
  //   recorte no se mueve: three suaviza con smoothstep(alphaTest, alphaTest + fwidth(a), a) y descarta lo del todo transparente, así que sigue sin escribirse profundidad ahí)
  // El guardián pruebas/guardianes/materiales_f1.test.js cuenta los onBeforeCompile y new THREE.ShaderMaterial que quedan FUERA de este módulo y solo deja que bajen.
  // Presupuesto (regla 6): no dibuja ni reserva nada; cada material lo libera quien lo pidió, como siempre.
  var Materiales = (function () {
    var usados = {}, nuevos = {};
    function apunta(nombre, tipo) {
      if (typeof nombre !== "string" || !nombre) throw new Error("Materiales: falta el nombre del material");
      var u = usados[nombre]; if (!u) u = usados[nombre] = { tipo: tipo, n: 0 };
      u.n++;
    }
    // la versión del renderizador nuevo, si existe y es el que corre (hasta F4, nunca)
    function version(nombre) { return Render.tipo === "nuevo" && nuevos[nombre] ? nuevos[nombre] : null; }
    function parchea(mat, nombre, fn, clave) {
      apunta(nombre, "parche");
      var n = version(nombre); if (n) return n(mat);
      mat.onBeforeCompile = fn;
      if (typeof clave === "string") mat.customProgramCacheKey = function () { return clave; };
      return mat;
    }
    // el mismo contrato que encadena() de apps/web/olivo/materiales.js (la biblioteca la importa el motor solo con ?olivos=gen: aquí no se puede importar)
    function encadenaPropia(mat, fn, clave) {
      var previo = mat.onBeforeCompile, clavePrevia = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : function () { return ""; };
      mat.onBeforeCompile = function (sh, r) { if (previo) previo.call(this, sh, r); fn.call(this, sh, r); };
      mat.customProgramCacheKey = function () { return clavePrevia() + "|" + (clave || fn.toString().length); };
      return mat;
    }
    function encadena(mat, nombre, fn, clave, propia) {
      apunta(nombre, "encadena");
      var n = version(nombre); if (n) return n(mat);
      return (propia || encadenaPropia)(mat, fn, clave);
    }
    function sombreador(nombre, opciones) {
      apunta(nombre, "sombreador");
      var n = version(nombre); if (n) return n(opciones);
      return new THREE.ShaderMaterial(opciones);
    }
    // ---- AG-2.1: alphaToCoverage para los recortes alfa (doc/sistema/ALPHA-A-COBERTURA.md)
    // ajuste: el guardado de Configuración → Vista («vista.a2c», true/false) o undefined. Orden de mando: la URL (?a2c=0|1), luego el ajuste, luego APAGADO (las copas de cerca salían
    // blanquecinas con el recorte suave; se enciende a petición). origen: "url" | "ajuste" | "defecto"
    function eligeA2c(busqueda, msaa, ajuste) {
      var q = typeof busqueda === "string" ? busqueda : "", m = /[?&]a2c=([^&#]*)/.exec(q), r = { pedido: "", activo: false, msaa: msaa !== false, motivo: "", advertencia: "", origen: "defecto" };
      if (m) { var v = decodeURIComponent(m[1]); r.pedido = v; if (v === "0" || v === "1") { r.activo = v === "1"; r.origen = "url"; } else r.advertencia = "?a2c=" + v + " solo vale 0 o 1: se usa " + (ajuste === true ? "el ajuste" : "apagado"); }
      if (r.origen === "defecto" && ajuste === true) { r.activo = true; r.origen = "ajuste"; }
      if (r.activo && !r.msaa) { r.activo = false; r.motivo = "sin MSAA (perilla de 02f): alphaToCoverage no hace nada y se deja el alphaTest"; }
      else if (!r.activo) r.motivo = r.origen === "url" ? "?a2c=0: el alphaTest de siempre" : "apagado por defecto: el alphaTest de siempre (se enciende en Configuración → Vista o con ?a2c=1)";
      return r;
    }
    function ajusteGuardado(clave) { try { var s = window.localStorage.getItem("gemelo.ajustes." + clave); return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } }   // se lee UNA vez (33_ajustes se monta después; mismo patrón que 04f)
    var a2c = eligeA2c(typeof location !== "undefined" && location ? location.search : "", typeof XrPerillas !== "undefined" && XrPerillas ? XrPerillas.aa : true, ajusteGuardado("vista.a2c")), recortados = [];
    a2c.n = 0;
    if (a2c.advertencia && typeof console !== "undefined") console.warn("a2c: " + a2c.advertencia);
    function recorte(mat) {
      if (!mat || !(mat.alphaTest > 0) || mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial) return mat;   // las sombras no tienen MSAA: siguen con alphaTest
      recortados.push(mat); a2c.n = recortados.length;
      if (a2c.activo) mat.alphaToCoverage = true;
      return mat;
    }
    function recortes(activo) {
      var on = !!activo && a2c.activo;
      recortados.forEach(function (m) { if (m.alphaToCoverage !== on) { m.alphaToCoverage = on; m.needsUpdate = true; } });
    }
    function nuevo(nombre, fabrica) { nuevos[nombre] = fabrica; }
    function inventario() { var o = {}; Object.keys(usados).forEach(function (k) { o[k] = { tipo: usados[k].tipo, n: usados[k].n }; }); return o; }
    return { parchea: parchea, encadena: encadena, sombreador: sombreador, nuevo: nuevo, inventario: inventario, a2c: a2c, eligeA2c: eligeA2c, recorte: recorte, recortes: recortes };
  })();
