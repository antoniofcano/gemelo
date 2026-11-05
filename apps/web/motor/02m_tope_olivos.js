// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: TopeOlivos
// Consume: 02l_tope_tiles (TopeTilesPuro), 14_historia (hist, rango), 15_tiempo (nivel, hace), 29_vr (VR_PERFILES)
// ===============================================================================
  // ---------- Q0n: los olivos que dibuja el propio motor (07b: nivel 0 de siempre, niveles 1 y 2; 07ab: generados; 07ac: lejanos de la escalera)
  // también respetan el tope de triángulos de cada nivel de VR (doc/sistema/VR.md#tope-de-triángulos-de-los-olivos-del-motor-q0n).
  // Q0k (02l) puso el tope al tileset (relieve + sus olivos instanciados); los del motor iban encima: en el Quest, en el nivel 3, se dibujaba más
  // de lo que permite VR_PERFILES[3].tri (MEDIDAS.md, 2026-11-05). El reparto, con T el tope del nivel (o ?xrtri=N):
  //   · los olivos del motor tienen una RESERVA = FR × T (FR = 0,3 por defecto; ?xrolivos=0.1..0.7 la cambia; ?xrolivos=0 apaga Q0n);
  //   · el tileset recibe T − lo que OCUPAN los olivos del motor (su pico de los últimos RETEN_S s, redondeado hacia arriba a pasos de CUANTO × T,
  //     y nunca más que la reserva): si los olivos del motor no gastan, el relieve no pierde detalle por ellos;
  //   · si los olivos del motor pasan de su reserva, un FACTOR f (1 → F_MIN) baja su presupuesto: cuántos olivos de nivel 0 (× f) y su radio
  //     (× √f), el presupuesto de los generados y el de los niveles 1 y 2 (reserva × f). El factor lo lleva el MISMO lazo de Q0k (TopeTilesPuro.paso,
  //     regla 12) con eBase = 1 y errMax = 1 / F_MIN: f = 1 / «error». Así hereda su histéresis (0,5 s por encima para bajar, 3 s por debajo del 75 %
  //     para subir), su guarda tras cada cambio (1,5 s; 4 s mientras se construyen celdas o lotes) y su memoria por paso (no vuelve a un paso que
  //     no cabía hace poco en el mismo sitio): no parpadea.
  // ?xrtri=0 (02f) apaga también esto (tope 0). Fuera de VR no corre nada: f = 1, sin reserva, y 07b reparte como siempre.
  // Las cifras (FR, F_MIN, RETEN_S, CUANTO) son de partida, SIN medir en el Quest.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/tope_olivos.test.js, junto con el trozo puro de 02l)
  var TopeOlivosPuro = (function () {
    var DEF = { FR: 0.3, FR_MIN: 0.1, FR_MAX: 0.7, F_MIN: 0.25, RETEN_S: 5, CUANTO: 0.05 };
    // ?xrolivos=: null (no pedida: FR), 0 (apagado) o la fracción recortada a [FR_MIN, FR_MAX]; ignorados como los de 02f
    function lee(busqueda) {
      var r = { fr: null, ignorados: [] }, m = /[?&]xrolivos=([^&#]*)/.exec(String(busqueda || ""));
      if (!m) return r;
      var t = decodeURIComponent(m[1]), v = Number(String(t).replace(",", "."));
      if (t === "" || !isFinite(v)) { r.ignorados.push({ param: "xrolivos", valor: t, motivo: "no es un número" }); return r; }
      if (v === 0) { r.fr = 0; return r; }
      var c = Math.min(DEF.FR_MAX, Math.max(DEF.FR_MIN, v));
      if (c !== v) r.ignorados.push({ param: "xrolivos", valor: t, motivo: "fuera de rango (0 o " + DEF.FR_MIN + " a " + DEF.FR_MAX + "), recortado a " + c });
      r.fr = c; return r;
    }
    function fraccion(fr) { return fr === 0 ? 0 : fr > 0 ? fr : DEF.FR; }
    function reserva(tope, fr) { var f = fraccion(fr); return tope > 0 && f > 0 ? Math.round(tope * f) : 0; }
    function nuevo() { return { lazo: TopeTilesPuro.nuevo(), activo: false, f: 1, tope: 0, reserva: 0, tri: 0, pico: 0, tRet: 0, ocupa: 0 }; }
    var mm = { dt: 0, tri: 0, tope: 0, eBase: 1, errMax: 1 / DEF.F_MIN, cargando: false, x: 0, z: 0 };   // un solo objeto: paso() no reserva
    // s: el estado (nuevo()). m: { dt (s), tri (los de los olivos del motor ahora), tope (T del nivel; 0 o falta = apagado), fr (null, 0 o fracción),
    // cargando (¿celdas o lotes por construir?), x, z (la cabeza, m) } → el factor f (1 = sin recorte)
    function paso(s, m) {
      var R = reserva(m.tope, m.fr);
      if (!(R > 0)) { s.activo = false; s.f = 1; s.tope = 0; s.reserva = 0; s.tri = m.tri || 0; s.pico = 0; s.tRet = 0; s.ocupa = 0; mm.tope = 0; TopeTilesPuro.paso(s.lazo, mm); return 1; }
      var dt = m.dt > 0 ? m.dt : 0, tri = m.tri > 0 ? m.tri : 0;
      if (s.tope !== m.tope) { s.lazo.mem.length = 0; s.lazo.tSobre = 0; s.lazo.tBajo = 0; }   // otro nivel (otro tope): lo aprendido por paso no vale; el factor se queda
      s.activo = true; s.tope = m.tope; s.reserva = R; s.tri = tri;
      mm.dt = dt; mm.tri = tri; mm.tope = R; mm.cargando = !!m.cargando; mm.x = m.x; mm.z = m.z;
      s.f = 1 / TopeTilesPuro.paso(s.lazo, mm);
      // lo que ocupan: el pico de los últimos RETEN_S s (sube al momento, baja cuando lleva RETEN_S s sin repetirse), en pasos de CUANTO × T
      if (tri >= s.pico) { s.pico = tri; s.tRet = 0; } else { s.tRet += dt; if (s.tRet >= DEF.RETEN_S) { s.pico = tri; s.tRet = 0; } }
      var q = DEF.CUANTO * m.tope;
      s.ocupa = Math.min(R, Math.ceil(s.pico / q - 1e-9) * q);
      return s.f;
    }
    // el tope que le queda al tileset (02l, por 04b); con Q0n apagado o fuera de VR, el mismo
    function parteTiles(s, tope) { return tope > 0 && s.activo ? Math.max(0, tope - s.ocupa) : tope; }
    // el presupuesto de los olivos del motor (reserva × f); Infinity si no hay tope (07b reparte como siempre)
    function presupuesto(s) { return s.activo ? s.reserva * s.f : Infinity; }
    function k(n) { return Math.round((n || 0) / 1000) + " k"; }
    function coma(v) { return String(v).replace(".", ","); }
    // la parte de la línea de ?debug y del medidor: «olivos 35 k / 39 k tri · ×0,64 (lazo 2/7)»; apagado con xrolivos=0; "" sin tope
    function linea(s, extra) {
      extra = extra || {};
      if (extra.apagado) return "olivos del motor " + k(extra.tri) + " tri (sin tope: xrolivos=0)";
      if (!s.activo) return "";
      var L = s.lazo;
      return "olivos " + k(s.tri) + " / " + k(s.reserva) + " tri · ×" + coma(Math.round(s.f * 100) / 100) + " (lazo " + L.k + "/" + L.K + (L.saturado ? ", saturado" : "") + ")";
    }
    return { DEF: DEF, lee: lee, fraccion: fraccion, reserva: reserva, nuevo: nuevo, paso: paso, parteTiles: parteTiles, presupuesto: presupuesto, linea: linea };
  })();
  // [puro:fin]

  // ---------- el estado compartido: 07b lo mueve (paso, cada TopeTilesPuro.DEF.MUESTRA s en VR, con los triángulos de sus olivos) y 04b lee la parte
  // del tileset (parteTiles) y la línea. Fuera de VR (apaga, al salir) todo vuelve a f = 1 sin reserva.
  var TopeOlivos = (function () {
    var P = TopeOlivosPuro.lee(typeof location !== "undefined" ? location.search : ""), s = TopeOlivosPuro.nuevo();
    var m = { dt: 0, tri: 0, tope: 0, fr: P.fr, cargando: false, x: 0, z: 0 };
    // → true si el factor cambió (07b vuelve a repartir)
    function paso(dt, tri, tope, cargando, x, z) {
      var f0 = s.f; m.dt = dt; m.tri = tri; m.tope = tope; m.cargando = cargando; m.x = x; m.z = z;
      return TopeOlivosPuro.paso(s, m) !== f0;
    }
    function apaga() { m.dt = 0; m.tri = 0; m.tope = 0; TopeOlivosPuro.paso(s, m); }
    return {
      paso: paso, apaga: apaga, estado: s, ignorados: P.ignorados,
      apagado: function () { return P.fr === 0; },
      activo: function () { return s.activo; },
      factor: function () { return s.f; },
      presupuesto: function () { return TopeOlivosPuro.presupuesto(s); },
      parteTiles: function (tope) { return TopeOlivosPuro.parteTiles(s, tope); },
      linea: function () { return P.fr === 0 && s.tri > 0 ? TopeOlivosPuro.linea(s, { apagado: true, tri: s.tri }) : TopeOlivosPuro.linea(s); },   // apagado: s.tri lo deja paso() igual
      resumen: function () { var L = s.lazo; return { activo: s.activo, tope: s.tope, reserva: s.reserva, tri: s.tri, ocupa: s.ocupa, factor: +s.f.toFixed(3), k: L.k, K: L.K, saturado: L.saturado, cambios: L.cambios, recortes: L.subidas, alivios: L.bajadas }; }
    };
  })();
