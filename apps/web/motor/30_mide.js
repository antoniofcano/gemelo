// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: MideEst, Mide
// Consume: 01_datos ($, DEPURA, ESC3D), 03_escena (visor, renderer, modo, calidad), 07b_arboles (Arboles), 08_marcadores (listo),
//   14_historia (lista, rango), 15_tiempo (nivel, esc, hace), 16_vida (mira), 29_vr (VRX, vrMideEmpieza, vrMideFin, VR_PERFILES),
//   90_final (cuadro, bucle)
// ===============================================================================

  // ---------- medidor de fotogramas para la prueba en el aparato (T7a, doc/sistema/VR.md#medir-con-el-medidor). Sin &mide ni botón pulsado no hace nada: Mide.on es falso y el bucle ni lo mira.
  // Mide, durante N s (por defecto 60) y tras 3 s de calentamiento, el intervalo entre fotogramas (en VR, entre fotogramas XR) y el ms de JS de cada uno.
  // Es una medida del aparato donde se corre: en Chrome sin GPU (SwiftShader) los números no valen como fps (CLAUDE.md, regla 7).

  // [puro:inicio] — estadística y texto: sin THREE ni DOM; pruebas/guardianes/mide.test.js evalúa este trozo tal cual en Node
  var MideEst = (function () {
    var UMBRAL = 13.9, CALENTAMIENTO = 3;   // 13,9 ms = 72 Hz (ADR-0015, criterio 5)
    function ordena(a) { return a.slice().sort(function (x, y) { return x - y; }); }
    function mediana(o) { var n = o.length; if (!n) return 0; return n % 2 ? o[(n - 1) / 2] : (o[n / 2 - 1] + o[n / 2]) / 2; }
    function percentil(o, p) { var n = o.length; if (!n) return 0; return o[Math.min(n - 1, Math.max(0, Math.ceil(p / 100 * n) - 1))]; }   // rango más próximo
    function serie(v) { var o = ordena(v); return { mediana: mediana(o), p95: percentil(o, 95), p99: percentil(o, 99), peor: o.length ? o[o.length - 1] : 0 }; }
    // m = { t: [s desde que se armó], ms: [intervalo con el fotograma anterior], js: [ms de JS], oc: [1 si la pestaña estaba oculta] }
    function calcula(m, calent, dur, umbral) {
      calent = calent == null ? CALENTAMIENTO : calent; umbral = umbral == null ? UMBRAL : umbral;
      var ms = [], js = [], desc = { calentamiento: 0, ocultos: 0, despues: 0 }, i;
      for (i = 0; i < m.t.length; i++) {
        if (m.t[i] < calent) { desc.calentamiento++; continue; }
        if (dur != null && m.t[i] >= calent + dur) { desc.despues++; continue; }
        if (m.oc && m.oc[i]) { desc.ocultos++; continue; }
        ms.push(m.ms[i]); js.push(m.js[i]);
      }
      var sobre = 0; for (i = 0; i < ms.length; i++) if (ms[i] > umbral) sobre++;
      return { n: ms.length, ms: serie(ms), js: serie(js), sobre: sobre, pctSobre: ms.length ? 100 * sobre / ms.length : 0, umbral: umbral, descartados: desc };
    }
    function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
    // las líneas de la tarjeta (corto) o del texto para copiar (largo)
    function lineas(r, corto) {
      var L = [], e = r.est, vr = r.aparato.modo === "VR";
      L.push("Medida del gemelo · " + r.fecha);
      L.push("Aparato: " + r.aparato.modo + (corto ? "" : " · " + r.aparato.ua));
      L.push("Escena: " + r.escena + (r.banderas ? " · " + r.banderas : ""));
      L.push(e.n + " fotogramas en " + r.duracion + " s (tras " + r.calentamiento + " s de calentamiento)");
      L.push("Intervalo (ms): mediana " + f1(e.ms.mediana) + " · p95 " + f1(e.ms.p95) + " · p99 " + f1(e.ms.p99) + " · peor " + f1(e.ms.peor));
      L.push("Por encima de " + String(e.umbral).replace(".", ",") + " ms: " + e.sobre + " (" + f1(e.pctSobre) + " %)");
      L.push("JS por fotograma (ms): mediana " + f1(e.js.mediana) + " · p95 " + f1(e.js.p95) + " · peor " + f1(e.js.peor));
      if (r.nivel) {
        L.push("Nivel VR_PERFILES: al empezar " + r.nivel.ini + " · al terminar " + r.nivel.fin + " · cambios " + r.nivel.cambios.length);
        if (!corto) r.nivel.cambios.forEach(function (c) { L.push("  a los " + f1(c.t) + " s: " + c.de + " → " + c.a); });
      }
      if (r.olivos) L.push("Olivos al terminar: N0 " + r.olivos[0] + " · N1 " + r.olivos[1] + " · N2 " + r.olivos[2]);
      if (vr && e.n) L.push("p95 ≤ 13,9 ms (criterio 5 de ADR-0015): " + (e.ms.p95 <= 13.9 ? "sí" : "no"));
      if (e.descartados.ocultos) L.push("Descartados por pestaña oculta: " + e.descartados.ocultos);
      if (r.avisos && r.avisos.length) r.avisos.forEach(function (a) { L.push("Aviso: " + a); });
      return L;
    }
    function texto(r) { return lineas(r, false).join("\n"); }
    // resumen del navegador sin datos personales: solo producto y versión de motor, sistema y modelo de casco
    function resumeUA(ua) {
      var m = String(ua || "").match(/(OculusBrowser\/[\d.]+|Chrome\/\d+|Firefox\/\d+|Version\/[\d.]+|Android \d+|Windows NT [\d.]+|Mac OS X|iPhone OS|Linux|Quest ?\w*)/g);
      return m ? m.filter(function (x, i) { return m.indexOf(x) === i; }).join(", ") : "n/d";
    }
    return { UMBRAL: UMBRAL, CALENTAMIENTO: CALENTAMIENTO, calcula: calcula, serie: serie, percentil: percentil, mediana: mediana, lineas: lineas, texto: texto, resumeUA: resumeUA };
  })();
  // [puro:fin]

  var Mide = (function () {
    var N = 60, estado = "inactivo", tArma = 0, t0 = 0, m = null, prev = -1, nvPrev = -2, nivIni = null, cambios = [], modoIni = "", res = null, huboVisib = false, UI = null, copiado = 0, tPinta = 0;
    var CLAVE = "gemelo_mide";
    var api = { on: false, alTerminar: null };
    function modoAhora() { return VRX.on ? "VR" : "pantalla"; }
    function nivelAhora() { return VRX.on ? VRX.nivel : null; }
    function banderas() {
      var out = [], r = /[?&]([\w-]+)(?:=([\w.-]*))?/g, x;
      while ((x = r.exec(location.search))) if (/^(escena|olivos?|arbsc|tiles?|lod|calidad)$/.test(x[1])) out.push(x[1] + (x[2] != null ? "=" + x[2] : ""));
      return out.join(" ");
    }
    function arma(n) { N = Math.max(1, Math.min(600, Number(n) || 60)); estado = "esperando"; tArma = performance.now(); api.on = true; ui(); pinta(); }
    function inicia(n) {   // el botón: empieza ya, en el modo en que se esté (VR o pantalla)
      if (n) N = Math.max(1, Math.min(600, Number(n) || 60));
      empieza(performance.now());
    }
    function empieza(tIni) {
      t0 = tIni; m = { t: [], ms: [], js: [], oc: [] }; prev = -1; nvPrev = -2; nivIni = null; cambios = []; modoIni = modoAhora(); res = null; estado = "midiendo"; api.on = true;
      if (!huboVisib) { document.addEventListener("visibilitychange", alVisibilidad); huboVisib = true; }
      ui(); pinta();
      if (VRX.on && typeof vrMideEmpieza === "function") vrMideEmpieza();
    }
    function alVisibilidad() { prev = -1; }   // el intervalo que cruza un cambio de pestaña no es un fotograma
    function cuadro(tIni) {   // una vez por fotograma, al final de cuadro() (90_final.js), solo si Mide.on
      var ahora = performance.now(), js = ahora - tIni;
      if (estado === "esperando") {   // armado por &mide: empieza al entrar en VR, o en pantalla si no hay casco (WebXR sin soporte) a los 4 s
        if (VRX.on || (!VRX.soporta && !VRX.entrando && ahora - tArma > 4000)) empieza(tIni); else return;
      }
      if (estado !== "midiendo") return;
      var t = (tIni - t0) / 1000, nv = nivelAhora();
      if (t >= MideEst.CALENTAMIENTO && nivIni === null) nivIni = nv === null ? -1 : nv;
      if (nvPrev !== -2 && nv !== nvPrev && t >= MideEst.CALENTAMIENTO) cambios.push({ t: t - MideEst.CALENTAMIENTO, de: nvPrev === null ? -1 : nvPrev, a: nv === null ? -1 : nv });
      nvPrev = nv;
      var oculto = document.hidden && !renderer.xr.isPresenting;
      if (prev >= 0 || oculto) { m.t.push(t); m.ms.push(prev >= 0 ? tIni - prev : 0); m.js.push(js); m.oc.push(oculto ? 1 : 0); }
      prev = oculto ? -1 : tIni;
      if (t >= MideEst.CALENTAMIENTO + N) termina(); else if (UI && ahora - tPinta > 500) { tPinta = ahora; pinta(); }
    }
    function termina() {
      var e = MideEst.calcula(m, MideEst.CALENTAMIENTO, N), a = Arboles.resumen(), nv = nivelAhora(), avisos = [];
      if (modoIni !== modoAhora()) avisos.push("cambió de " + modoIni + " a " + modoAhora() + " durante la medida");
      if (e.n < 10) avisos.push("muy pocos fotogramas: la medida no sirve");
      var esc = /[?&]escena=([\w-]+)/.exec(location.search);
      res = {
        version: 1, fecha: new Date().toISOString().slice(0, 19) + "Z", aparato: { modo: modoIni, ua: MideEst.resumeUA(navigator.userAgent) },
        escena: esc ? esc[1] : (ESC3D.activa ? "tiles" : "clasica") + " (por defecto)", banderas: banderas(), duracion: N, calentamiento: MideEst.CALENTAMIENTO, est: e,
        nivel: modoIni === "VR" ? { ini: nivIni === null ? -1 : nivIni, fin: nv === null ? -1 : nv, cambios: cambios } : null, olivos: [a.nivel0, a.nivel1, a.nivel2], avisos: avisos
      };
      estado = "listo"; api.on = false; prev = -1;
      if (huboVisib) { document.removeEventListener("visibilitychange", alVisibilidad); huboVisib = false; }
      guarda(); ui(); pinta();
      if (typeof vrMideFin === "function" && VRX.on) vrMideFin();
    }
    function guarda() {
      try {
        var l = JSON.parse(localStorage.getItem(CLAVE) || "[]"); if (!Array.isArray(l)) l = [];
        l.push(res); localStorage.setItem(CLAVE, JSON.stringify(l.slice(-10)));
      } catch (e) {}
    }
    function historial() { try { var l = JSON.parse(localStorage.getItem(CLAVE) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    function linea() {   // una línea para el contador de ?debug
      if (estado === "inactivo") return "";
      if (estado === "esperando") return "medida: esperando (entra en VR o pulsa «Medir»)\n";
      if (estado === "midiendo") { var t = (performance.now() - t0) / 1000; return "medida: " + (t < MideEst.CALENTAMIENTO ? "calentando " + t.toFixed(0) + "/" + MideEst.CALENTAMIENTO + " s" : "midiendo " + Math.min(N, t - MideEst.CALENTAMIENTO).toFixed(0) + "/" + N + " s") + "\n"; }
      return "medida lista (p95 " + res.est.ms.p95.toFixed(1) + " ms)\n";
    }
    function copia() {
      if (!res) return;
      var tx = MideEst.texto(res);
      function notifica(ok) { copiado = ok ? 1 : 2; pinta(); setTimeout(function () { copiado = 0; pinta(); }, 2500); }
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(tx).then(function () { notifica(true); }, function () { alt(); }); return; } } catch (e) {}
      alt();
      function alt() {
        try { var ta = document.createElement("textarea"); ta.value = tx; ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); document.body.removeChild(ta); notifica(ok); } catch (e) { notifica(false); }
      }
    }
    // la caja de pantalla: junto al contador de ?debug (o sola si se arma con &mide sin ?debug)
    function ui() {
      if (UI || !(DEPURA || api.on || estado !== "inactivo")) return;
      UI = document.createElement("div"); UI.id = "mideCaja";
      UI.style.cssText = "position:absolute;right:8px;bottom:8px;z-index:30;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.78);color:#a8f0b0;padding:5px 7px;border-radius:5px;max-width:min(92%,430px)";
      var b1 = document.createElement("button"), b2 = document.createElement("button"), pre = document.createElement("pre");
      b1.type = b2.type = "button"; b1.id = "mideMide"; b2.id = "mideCopia";
      [b1, b2].forEach(function (b) { b.style.cssText = "font:inherit;margin-right:6px;padding:3px 8px;border-radius:4px;border:1px solid #5a8a62;background:#1d2b20;color:#d6ffdc;cursor:pointer"; });
      b1.addEventListener("click", function () { inicia(); }); b2.addEventListener("click", copia);
      pre.style.cssText = "margin:5px 0 0;white-space:pre-wrap;font:inherit"; pre.id = "mideTexto";
      UI.appendChild(b1); UI.appendChild(b2); UI.appendChild(pre); visor.appendChild(UI); UI.b1 = b1; UI.b2 = b2; UI.pre = pre;
    }
    function pinta() {
      if (!UI) return;
      UI.b1.textContent = estado === "midiendo" ? "Midiendo…" : "Medir " + N + " s"; UI.b1.disabled = estado === "midiendo";
      UI.b2.textContent = copiado === 1 ? "Copiado" : copiado === 2 ? "No se pudo copiar" : "Copiar"; UI.b2.disabled = !res;
      UI.pre.textContent = res ? MideEst.texto(res) : (estado === "midiendo" ? linea().trim() : estado === "esperando" ? linea().trim() : "");
    }
    api.arma = arma; api.inicia = inicia; api.cuadro = cuadro; api.linea = linea; api.copia = copia; api.historial = historial;
    api.resultado = function () { return res; }; api.estado = function () { return estado; }; api.segundos = function () { return N; };
    window.__mide = function () { return { estado: estado, n: N, resultado: res, texto: res ? MideEst.texto(res) : "", historial: historial() }; };
    var param = /[?&]mide(?:=(\d+))?(?=&|$)/.exec(location.search);
    if (param) arma(param[1] ? Number(param[1]) : 60); else if (DEPURA) ui();
    return api;
  })();
