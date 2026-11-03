// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: XrPerillas
// Consume: 03_escena (lienzo, renderer), 08_marcadores (aplica), 14_historia (rango), 15_tiempo (nivel, hace, anuncia), 29_vr (VR_PERFILES)
// ===============================================================================
  // ---------- perillas de rendimiento VR por URL (Q0b; doc/sistema/VR.md#perillas-de-rendimiento-por-url). Para probar en el casco sin recompilar:
  //   ?xrfov=0..1 (foveación; defecto 1) · ?xrescala=0.5..1.5 (framebufferScaleFactor; defecto 0,9) · ?xrhz=72|80|90|120 (frecuencia pedida; defecto 72, solo si el casco la anuncia)
  //   ?xraa=0|1 (MSAA del lienzo; defecto 1; se lee antes de crear el renderer) · ?xrnivel=0..3 (fija un VR_PERFILES y APAGA el controlador adaptativo)
  //   ?xrnear=0.05..0.3 (plano cercano de la cámara en VR; defecto 0,1) · ?xrjs=4..16 (umbral de ms de JS por fotograma con que el controlador adaptativo baja de nivel; defecto 8, AG-2.3)
  // Sin ninguna, nada cambia. Es el ÚNICO sitio que lee estas banderas de la URL. Presupuesto (regla 6): no dibuja ni reserva nada.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/xr_perillas.test.js)
  var XrPerillasPuro = (function () {
    var LIM = { fov: [0, 1], escala: [0.5, 1.5], nivel: [0, 3], near: [0.05, 0.3], js: [4, 16] }, HZ = [72, 80, 90, 120], DEF = { fov: 1, escala: 0.9, hz: 72, aa: true, near: 0.1, js: 8 };
    function cruda(q, k) { var m = new RegExp("[?&]" + k + "=([^&#]*)").exec(q); return m ? decodeURIComponent(m[1]) : null; }
    function num(t) { if (t == null || String(t).trim() === "") return NaN; return Number(String(t).replace(",", ".")); }
    // busqueda = location.search · soporte = { frameRates: [..] } del casco (o null si aún no hay sesión)
    // → { fov, escala, hz, aa, nivel, near, js } (null = no pedida) e ignorados: [{ param, valor, motivo }] (lo recortado también se anota, con el valor recortado)
    function lee(busqueda, soporte) {
      var q = String(busqueda || ""), r = { fov: null, escala: null, hz: null, aa: null, nivel: null, near: null, js: null, ignorados: [] };
      function rango(k, nombre, entero) {
        var t = cruda(q, k); if (t === null) return;
        var v = num(t); if (!isFinite(v)) { r.ignorados.push({ param: k, valor: t, motivo: "no es un número" }); return; }
        var a = LIM[nombre][0], b = LIM[nombre][1], c = entero ? Math.round(v) : v;
        c = Math.min(b, Math.max(a, c));
        if (c !== v) r.ignorados.push({ param: k, valor: t, motivo: "fuera de rango (" + a + " a " + b + (entero ? ", entero" : "") + "), recortado a " + c });
        r[nombre] = c;
      }
      rango("xrfov", "fov"); rango("xrescala", "escala"); rango("xrnivel", "nivel", true); rango("xrnear", "near"); rango("xrjs", "js");
      var h = cruda(q, "xrhz");
      if (h !== null) {
        var hv = num(h), fr = soporte ? soporte.frameRates : null;
        if (HZ.indexOf(hv) < 0) r.ignorados.push({ param: "xrhz", valor: h, motivo: "no es 72, 80, 90 ni 120" });
        else if (soporte && (!fr || Array.prototype.indexOf.call(fr, hv) < 0)) r.ignorados.push({ param: "xrhz", valor: h, motivo: "no soportado por el casco (anuncia " + (fr ? Array.prototype.join.call(fr, ", ") : "nada") + "); se deja la que haya" });
        else r.hz = hv;
      }
      var a = cruda(q, "xraa");
      if (a !== null) { if (a === "0" || a === "1") r.aa = a === "1"; else r.ignorados.push({ param: "xraa", valor: a, motivo: "solo vale 0 o 1" }); }
      return r;
    }
    // lo que se aplica de verdad: los valores de siempre donde no se pidió nada. hz null = no se pide ninguna (el casco no admite ni la de siempre)
    function plan(p, soporte) {
      var fr = soporte && soporte.frameRates, hz = p.hz != null ? p.hz : (fr && Array.prototype.indexOf.call(fr, DEF.hz) >= 0 ? DEF.hz : (soporte ? null : DEF.hz));
      return { fov: p.fov != null ? p.fov : DEF.fov, escala: p.escala != null ? p.escala : DEF.escala, hz: hz, aa: p.aa != null ? p.aa : DEF.aa,
        nivel: p.nivel, near: p.near != null ? p.near : DEF.near, js: p.js != null ? p.js : DEF.js, tocadas: ["fov", "escala", "hz", "aa", "nivel", "near", "js"].filter(function (k) { return p[k] != null; }), ignorados: p.ignorados.slice() };
    }
    function coma(v) { return String(v).replace(".", ","); }
    // «VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto · near 0,1 · umbral JS 8 ms» (y «ignorado: …» por cada perilla descartada o recortada)
    function linea(e) {
      var s = "VR: fov " + coma(e.fov) + " · escala " + coma(e.escala) + " · " + (e.hz != null ? e.hz + " Hz" : "Hz sin cambiar") + " · MSAA " + (e.aa ? "sí" : "no") + " · nivel " + (e.nivel != null ? e.nivel + " fijo" : "auto") + " · near " + coma(e.near != null ? e.near : DEF.near) + " · umbral JS " + coma(e.js != null ? e.js : DEF.js) + " ms";
      if (e.ignorados && e.ignorados.length) s += " · ignorado: " + e.ignorados.map(function (i) { return i.param + "=" + i.valor + " (" + i.motivo + ")"; }).join("; ");
      return s;
    }
    return { lee: lee, plan: plan, linea: linea, LIM: LIM, HZ: HZ, DEF: DEF };
  })();
  // [puro:fin]

  // [motor:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/xr_perillas.test.js con un renderer y una sesión de mentira)
  // El estado: el arranque lo lee UNA vez (aa hace falta antes de crear el renderer) y 29_vr.js sustituye `efectivas` por el plan real al entrar en VR (con las frecuencias del casco).
  var XrPerillas = (function () {
    var q = typeof location !== "undefined" ? location.search : "", p = XrPerillasPuro.lee(q, null);
    var X = { pedidas: p, aa: p.aa != null ? p.aa : XrPerillasPuro.DEF.aa, efectivas: XrPerillasPuro.plan(p, null), entro: false };
    X.defJs = XrPerillasPuro.DEF.js; X.configJs = null;   // 29_vr deja en configJs el de la configuración (escalera.vrJsMs) cuando llega
    X.js = function () { return p.js != null ? p.js : (X.configJs != null ? X.configJs : X.defJs); };   // el umbral del controlador adaptativo: URL (?xrjs=) > configuración > 8 ms del código
    X.fijo = function () { return X.efectivas.nivel != null; };   // ?xrnivel=: el controlador adaptativo no actúa
    X.antes = function (renderer) { renderer.xr.setFoveation(X.efectivas.fov); };   // antes de setSession: three la aplica a la capa al crearla (proyección o base)
    X.despues = function (ses) {   // con la sesión ya abierta se conocen las frecuencias del casco: el plan real sustituye al previo
      var so = { frameRates: ses && ses.supportedFrameRates || null }; X.entro = true; X.efectivas = XrPerillasPuro.plan(XrPerillasPuro.lee(q, so), so);
      try { var capa = ses && ses.renderState && ses.renderState.baseLayer; if (capa && "fixedFoveation" in capa) capa.fixedFoveation = X.efectivas.fov; } catch (e) {}
      try { if (X.efectivas.hz != null && ses && ses.updateTargetFrameRate) ses.updateTargetFrameRate(X.efectivas.hz); } catch (e) {}
    };
    X.linea = function () { var e = X.efectivas; return XrPerillasPuro.linea({ fov: e.fov, escala: e.escala, hz: e.hz, aa: X.aa, nivel: e.nivel, near: e.near, js: X.js(), ignorados: e.ignorados }); };
    return X;
  })();
  // [motor:fin]
