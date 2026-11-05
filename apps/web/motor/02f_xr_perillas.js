// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: XrPerillas
// Consume: 03_escena (lienzo, renderer), 08_marcadores (aplica), 14_historia (hist, tabla, rango), 15_tiempo (nivel, hace, anuncia),
//   29_vr (VR_PERFILES)
// ===============================================================================
  // ---------- perillas de rendimiento VR por URL (Q0b; doc/sistema/VR.md#perillas-de-rendimiento-por-url). Para probar en el casco sin recompilar:
  //   ?xrfov=0..1 (foveación; defecto 1) · ?xrescala=0.5..1.5 (framebufferScaleFactor; defecto 0,9) · ?xrhz=72|80|90|120 (frecuencia pedida; defecto 72, solo si el casco la anuncia)
  //   ?xraa=0|1 (MSAA del lienzo; defecto 1; se lee antes de crear el renderer) · ?xrnivel=0..3 (fija un VR_PERFILES y APAGA el controlador adaptativo)
  //   ?xrnear=0.05..0.3 (plano cercano de la cámara en VR; defecto 0,1) · ?xrjs=4..16 (umbral de ms de JS por fotograma con que el controlador adaptativo baja de nivel; defecto 8, AG-2.3)
  //   ?xrjssube=2..10 (Q0c-b: ms de JS por debajo de los que el controlador SUBE de nivel; defecto 5) · ?xrestable=2..120 (Q0c-b: segundos seguidos por debajo de eso antes de subir; defecto 10)
  //   ?xrmv=0|1 (F2a, doc/sistema/MULTIVIEW.md: multiview de super-three, `multiviewStereo`; SOLO existe en la build de VR, con defecto 1 (URL, luego el ajuste «vr.multiview», luego 1); en la de pantalla
  //   se ignora y se dice; se lee antes de crear el renderer, como xraa)
  //   ?xrtri=0|20000..2000000 (Q0k: tope de triángulos del tileset en VR; 0 apaga el lazo; sin ella, el tri de cada nivel) · ?xrtrierr=16..256 (Q0k: error máximo del tileset, px; defecto 128)
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
    // F2a: ?xrmv=0|1. build: «pantalla» o «vr» (la de 02h_render). Solo la build «vr» (super-three) tiene multiview; en la de pantalla no existe y la perilla se ignora.
    // → { existe, activo (¿se pide multiviewStereo al crear el renderer?), pedido ("0" | "1" | null), ignorado: { param, valor, motivo } | null }
    // ajuste: el guardado de Configuración → Comodidad VR («vr.multiview», true/false) o undefined. Orden de mando: la URL, luego el ajuste, luego encendido. En la build de pantalla no existe y se ignora.
    // origen (solo en la build de VR): "url" | "ajuste" | "defecto"
    function multiview(busqueda, build, ajuste) {
      var t = cruda(String(busqueda || ""), "xrmv"), existe = build === "vr", r = { existe: existe, activo: existe, pedido: null, ignorado: null };
      if (existe) r.origen = "defecto";
      if (t !== null) {
        if (!existe) { r.ignorado = { param: "xrmv", valor: t, motivo: "solo existe en la build de VR (esta es «" + (build || "pantalla") + "»)" }; return r; }
        if (t === "0" || t === "1") { r.pedido = t; r.activo = t === "1"; r.origen = "url"; return r; }
        r.ignorado = { param: "xrmv", valor: t, motivo: "solo vale 0 o 1" };
      }
      if (existe && ajuste === false) { r.activo = false; r.origen = "ajuste"; }
      return r;
    }
    // Q0c-b: las perillas de la histéresis del controlador (la de bajar es xrjs) y ?xrgente (Q0c-c). → { sube, estable, gente } (null = no pedida) e ignorados, como lee()
    var LIMC = { sube: [2, 10], estable: [2, 120], gente: [2, 64] }, DEFC = { sube: 5, estable: 10, gente: 8 };   // gente (?xrgente=): a partir de cuántas personas a la vista el controlador baja un escalón con antelación (Q0c-c; [PROPUESTA] sin medir en gafas)
    function leeControl(busqueda) {
      var q = String(busqueda || ""), r = { sube: null, estable: null, gente: null, ignorados: [] };
      [["xrjssube", "sube"], ["xrestable", "estable"], ["xrgente", "gente"]].forEach(function (par) {
        var t = cruda(q, par[0]); if (t === null) return;
        var v = num(t); if (!isFinite(v)) { r.ignorados.push({ param: par[0], valor: t, motivo: "no es un número" }); return; }
        var a = LIMC[par[1]][0], b = LIMC[par[1]][1], c = Math.min(b, Math.max(a, v));
        if (c !== v) r.ignorados.push({ param: par[0], valor: t, motivo: "fuera de rango (" + a + " a " + b + "), recortado a " + c });
        r[par[1]] = c;
      });
      return r;
    }
    // Q0k: el tope de triángulos del tileset en VR (02l_tope_tiles.js, 04b). ?xrtri=0 apaga el lazo; ?xrtri=N (20000 a 2000000) fija el tope en N triángulos
    // en todos los niveles (sin ella, el `tri` del nivel, VR_PERFILES[n].tri); ?xrtrierr=16..256 el error máximo (px) al que puede subir (defecto 128).
    // → { tri, err } (null = no pedida) e ignorados, como lee()
    var LIMT = { tri: [20000, 2000000], err: [16, 256] }, DEFT = { err: 128 };
    function leeTiles(busqueda) {
      var q = String(busqueda || ""), r = { tri: null, err: null, ignorados: [] };
      [["xrtri", "tri"], ["xrtrierr", "err"]].forEach(function (par) {
        var t = cruda(q, par[0]); if (t === null) return;
        var v = num(t); if (!isFinite(v)) { r.ignorados.push({ param: par[0], valor: t, motivo: "no es un número" }); return; }
        if (par[1] === "tri" && v === 0) { r.tri = 0; return; }   // 0: el lazo apagado
        var a = LIMT[par[1]][0], b = LIMT[par[1]][1], c = Math.min(b, Math.max(a, Math.round(v)));
        if (c !== v) r.ignorados.push({ param: par[0], valor: t, motivo: "fuera de rango (" + (par[1] === "tri" ? "0 o " : "") + a + " a " + b + "), recortado a " + c });
        r[par[1]] = c;
      });
      return r;
    }
    function coma(v) { return String(v).replace(".", ","); }
    // e.mv (F2a): solo en la build de VR: «multiview sí» (pedido y en uso), «multiview pedido, no en uso» (el casco no dio OCULUS_multiview o la capa de proyección),
    // «multiview pedido» (aún sin sesión) o «multiview no (xrmv=0)». En la de pantalla e.mv no existe y la línea es la de siempre.
    function textoMv(mv) {
      if (!mv || !mv.existe) return "";
      if (!mv.activo) return " · multiview no (" + (mv.origen === "ajuste" ? "ajuste" : "xrmv=0") + ")";
      return " · multiview " + (mv.enUso === true ? "sí" : mv.enUso === false ? "pedido, no en uso" : "pedido");
    }
    // «VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto · near 0,1 · umbral JS 8 ms» (y «ignorado: …» por cada perilla descartada o recortada)
    function linea(e) {
      var s = "VR: fov " + coma(e.fov) + " · escala " + coma(e.escala) + " · " + (e.hz != null ? e.hz + " Hz" : "Hz sin cambiar") + " · MSAA " + (e.aa ? "sí" : "no") + textoMv(e.mv) + " · nivel " + (e.nivel != null ? e.nivel + " fijo" : "auto") + " · near " + coma(e.near != null ? e.near : DEF.near) + " · umbral JS " + coma(e.js != null ? e.js : DEF.js) + " ms";
      if (e.ignorados && e.ignorados.length) s += " · ignorado: " + e.ignorados.map(function (i) { return i.param + "=" + i.valor + " (" + i.motivo + ")"; }).join("; ");
      return s;
    }
    return { lee: lee, leeControl: leeControl, LIMC: LIMC, DEFC: DEFC, leeTiles: leeTiles, LIMT: LIMT, DEFT: DEFT, plan: plan, linea: linea, multiview: multiview, LIM: LIM, HZ: HZ, DEF: DEF };
  })();
  // [puro:fin]

  // [motor:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/xr_perillas.test.js con un renderer y una sesión de mentira)
  // El estado: el arranque lo lee UNA vez (aa hace falta antes de crear el renderer) y 29_vr.js sustituye `efectivas` por el plan real al entrar en VR (con las frecuencias del casco).
  var XrPerillas = (function () {
    var q = typeof location !== "undefined" ? location.search : "", p = XrPerillasPuro.lee(q, null);
    var X = { pedidas: p, aa: p.aa != null ? p.aa : XrPerillasPuro.DEF.aa, efectivas: XrPerillasPuro.plan(p, null), entro: false };
    X.defJs = XrPerillasPuro.DEF.js; X.configJs = null;   // 29_vr deja en configJs el de la configuración (escalera.vrJsMs) cuando llega
    X.js = function () { return p.js != null ? p.js : (X.configJs != null ? X.configJs : X.defJs); };   // el umbral del controlador adaptativo: URL (?xrjs=) > configuración > 8 ms del código
    // Q0c-b: la histéresis. Umbral de bajar = js() (arriba); de subir y segundos estables: URL > el valor de la tabla por aparato que 29_vr deja en `tablaSube` > defecto
    X.control = XrPerillasPuro.leeControl(q); X.tablaSube = null;
    X.jsSube = function () { return X.control.sube != null ? X.control.sube : (X.tablaSube != null ? X.tablaSube : XrPerillasPuro.DEFC.sube); };
    X.estable = function () { return X.control.estable != null ? X.control.estable : XrPerillasPuro.DEFC.estable; };
    X.gente = function () { return X.control.gente != null ? X.control.gente : XrPerillasPuro.DEFC.gente; };   // Q0c-c: ?xrgente= > defecto (8)
    // F2a: el multiview, decidido UNA vez con la build (03_escena lo pide antes de crear el renderer: multiviewStereo va en el constructor). Sin llamar, null
    X.mv = null;
    // el ajuste «vr.multiview» se lee aquí, una vez (33_ajustes se monta después; mismo patrón que 04f con «vista.suelo»)
    function ajusteMv() { try { var s = window.localStorage.getItem("gemelo.ajustes.vr.multiview"); return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } }
    X.multiview = function (build) { if (!X.mv) X.mv = XrPerillasPuro.multiview(q, build, ajusteMv()); return X.mv; };
    X.mvEnUso = function (renderer) { if (X.mv && X.mv.existe) X.mv.enUso = !!(renderer && renderer.xr && renderer.xr.isMultiview); };   // 29_vr, con la sesión ya puesta (super-three: xr.isMultiview)
    // Q0k: el tope del tileset (04b lo pide al cambiar de nivel): 0 = lazo apagado; si no, ?xrtri= o el tri del nivel. errMax: ?xrtrierr= o 128 px
    X.tiles = XrPerillasPuro.leeTiles(q); X.lineaTiles = null;   // 04b deja en lineaTiles una función que da su trozo de la línea («tileset … tri · error … px»), "" fuera de VR
    X.topeTiles = function (triNivel) { var t = X.tiles.tri; return t === 0 ? 0 : t != null ? t : (triNivel > 0 ? triNivel : 0); };
    X.errMaxTiles = function () { return X.tiles.err != null ? X.tiles.err : XrPerillasPuro.DEFT.err; };
    X.fijo = function () { return X.efectivas.nivel != null; };   // ?xrnivel=: el controlador adaptativo no actúa
    X.antes = function (renderer) { renderer.xr.setFoveation(X.efectivas.fov); };   // antes de setSession: three la aplica a la capa al crearla (proyección o base)
    X.despues = function (ses) {   // con la sesión ya abierta se conocen las frecuencias del casco: el plan real sustituye al previo
      var so = { frameRates: ses && ses.supportedFrameRates || null }; X.entro = true; X.efectivas = XrPerillasPuro.plan(XrPerillasPuro.lee(q, so), so);
      try { var capa = ses && ses.renderState && ses.renderState.baseLayer; if (capa && "fixedFoveation" in capa) capa.fixedFoveation = X.efectivas.fov; } catch (e) {}
      try { if (X.efectivas.hz != null && ses && ses.updateTargetFrameRate) ses.updateTargetFrameRate(X.efectivas.hz); } catch (e) {}
    };
    X.linea = function () {
      var e = X.efectivas, ig = (X.mv && X.mv.ignorado ? e.ignorados.concat([X.mv.ignorado]) : e.ignorados).concat(X.tiles.ignorados), t = X.lineaTiles ? X.lineaTiles() : "";
      return XrPerillasPuro.linea({ fov: e.fov, escala: e.escala, hz: e.hz, aa: X.aa, mv: X.mv, nivel: e.nivel, near: e.near, js: X.js(), ignorados: ig }) + (t ? " · " + t : "");   // Q0k: el tileset, al final
    };
    return X;
  })();
  // [motor:fin]
