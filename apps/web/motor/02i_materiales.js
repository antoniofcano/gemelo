// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Materiales
// Consume: 02h_render (Render)
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
    function nuevo(nombre, fabrica) { nuevos[nombre] = fabrica; }
    function inventario() { var o = {}; Object.keys(usados).forEach(function (k) { o[k] = { tipo: usados[k].tipo, n: usados[k].n }; }); return o; }
    return { parchea: parchea, encadena: encadena, sombreador: sombreador, nuevo: nuevo, inventario: inventario };
  })();
