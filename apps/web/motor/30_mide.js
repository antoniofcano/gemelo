// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $, DEPURA), 01a_aparato (Aparato), 02b_cola (Cola), 02c_componentes (Reparto, Bus, ConfigPuro, Componentes),
//   02f_xr_perillas (XrPerillas), 02h_render (Render), 03_escena (visor, renderer, modo, calidad), 04b_escena3d (Escena3D),
//   07ab_generados (Generados), 07b_arboles (Arboles), 08_marcadores (listo, capas), 12_paseo (persona), 14_historia (lista, rango),
//   15_tiempo (nivel, hace), 29_vr (VRX, panel, PanelVR, VR_PERFILES), 33_ajustes (Ajustes), 90_final (cuadro, bucle)
// ===============================================================================

  // ---------- medidor de fotogramas para la prueba en el aparato (T7a, doc/sistema/VR.md#medir-con-el-medidor). Componente «medidor-fotogramas» (ADR-0023, C10 tercera tanda; ?medidor=0 lo apaga). Sin &mide ni botón pulsado no hace nada: no escucha «cuadro:fin» y el bucle no paga nada.
  // Mide, durante N s (por defecto 60) y tras 3 s de calentamiento, el intervalo entre fotogramas (en VR, entre fotogramas XR) y el ms de JS de cada uno.
  // Es una medida del aparato donde se corre: en Chrome sin GPU (SwiftShader) los números no valen como fps (CLAUDE.md, regla 7).

  // [puro:inicio] — estadística y texto: sin THREE ni DOM; pruebas/guardianes/mide.test.js evalúa este trozo tal cual en Node
  var MideEst = (function () {
    var UMBRAL = 13.9, CALENTAMIENTO = 3;   // 13,9 ms = 72 Hz (ADR-0015, criterio 5)
    function ordena(a) { return a.slice().sort(function (x, y) { return x - y; }); }
    function mediana(o) { var n = o.length; if (!n) return 0; return n % 2 ? o[(n - 1) / 2] : (o[n / 2 - 1] + o[n / 2]) / 2; }
    function percentil(o, p) { var n = o.length; if (!n) return 0; return o[Math.min(n - 1, Math.max(0, Math.ceil(p / 100 * n) - 1))]; }   // rango más próximo
    function serie(v) { var o = ordena(v); return { mediana: mediana(o), p95: percentil(o, 95), p99: percentil(o, 99), peor: o.length ? o[o.length - 1] : 0 }; }
    // m = { t: [s desde que se armó], ms: [intervalo con el fotograma anterior], js: [ms de JS], oc: [1 si la pestaña estaba oculta], ll?: [llamadas de dibujo], tr?: [triángulos] }
    // (F0: rd = ms de renderer.render() dentro de js, opcional. Q0e: ll y tr son opcionales; una medida guardada de antes no los trae. Q0g: cz = bits de causa por fotograma, cq = ms de Cola y teselas; tambien opcionales)
    function calcula(m, calent, dur, umbral) {
      calent = calent == null ? CALENTAMIENTO : calent; umbral = umbral == null ? UMBRAL : umbral;
      var ms = [], js = [], rd = [], rs = [], ll = [], tr = [], cz = [], cq = [], bl = [], suma = [], otr = [], desc = { calentamiento: 0, ocultos: 0, despues: 0 }, i;
      for (i = 0; i < m.t.length; i++) {
        if (m.t[i] < calent) { desc.calentamiento++; continue; }
        if (dur != null && m.t[i] >= calent + dur) { desc.despues++; continue; }
        if (m.oc && m.oc[i]) { desc.ocultos++; continue; }
        ms.push(m.ms[i]); js.push(m.js[i]);
        if (m.rd) { rd.push(m.rd[i]); rs.push(Math.max(0, m.js[i] - m.rd[i])); }   // F0: de los ms de JS, los de renderer.render() y el resto
        if (m.bl && m.bl.length) {   // Q0h: el reparto del JS por bloque; la suma de bloques + render() + «otros» cuadra con el JS de cada fotograma
          var sm = 0, k; for (k = 0; k < m.bl.length; k++) { var v = m.bl[k][i] || 0; (bl[k] || (bl[k] = [])).push(v); sm += v; }
          suma.push(sm); otr.push(Math.max(0, m.js[i] - (m.rd ? m.rd[i] : 0) - sm));
        }
        if (m.ll) ll.push(m.ll[i]); if (m.tr) tr.push(m.tr[i]); if (m.cz) { cz.push(m.cz[i]); cq.push(m.cq ? m.cq[i] : 0); }
      }
      var sobre = 0; for (i = 0; i < ms.length; i++) if (ms[i] > umbral) sobre++;
      return { n: ms.length, ms: serie(ms), js: serie(js), rd: rd.length ? serie(rd) : null, resto: rs.length ? serie(rs) : null, ll: ll.length ? serie(ll) : null, tr: tr.length ? serie(tr) : null, causas: resumenCausas(ms, cz, cq, umbral), reparto: resumenReparto(m.bn, bl, suma, otr), sobre: sobre, pctSobre: ms.length ? 100 * sobre / ms.length : 0, umbral: umbral, descartados: desc };
    }
    // ---- Q0h: bl[k] = ms del bloque k en cada fotograma (ya filtrados como los demás); bn[k] su nombre. Los bloques salen ordenados por p95 (de mayor a menor); suma y otros, la suma de bloques y lo que sobra del JS
    function resumenReparto(bn, bl, suma, otr) {
      if (!bn || !bl.length || !suma.length) return null;
      var b = [], k; for (k = 0; k < bl.length; k++) { var s = serie(bl[k]); b.push({ nom: bn[k] || ("bloque " + k), mediana: s.mediana, p95: s.p95 }); }
      b.sort(function (x, y) { return y.p95 - x.p95 || y.mediana - x.mediana; });
      return { bloques: b, suma: serie(suma), otros: serie(otr) };
    }
    // ---- Q0g: la autopsia de los fotogramas lentos. Por fotograma se apunta UN entero (cz) con los bits de lo que se movio; el resumen cuenta, de los lentos, cuantos coinciden con cada causa.
    var BIT = { cola: 1, tesela: 2, lote: 4, tarea: 8, compila: 16, textura: 32 }, CAUSAS = ["cola", "tesela", "lote", "tarea", "compila", "textura"], UMBRAL_COLA = 1;   // la Cola cuenta si trabajo 1 ms o mas en el fotograma (sin contar la deuda «T» de las teselas, que va aparte)
    // dCola: ms de rebanadas de la Cola (sin «T»); dTesela: teselas que llegaron (load-model); dLote: lotes de olivos generados montados; dProg/dTex: programas compilados y texturas subidas
    function bits(dCola, dTesela, dLote, dProg, dTex) {
      return (dCola >= UMBRAL_COLA ? 1 : 0) | (dTesela > 0 ? 2 : 0) | (dLote > 0 ? 4 : 0) | (dProg > 0 ? 16 : 0) | (dTex > 0 ? 32 : 0);
    }
    // largas: tareas largas del navegador (longtask) como { fin: [ms, performance.now()], dur: [ms] }, en orden. Cada una se asigna al fotograma en cuyo intervalo (el que lo separa del anterior) acaba.
    // Pone el bit «tarea» en m.cz y devuelve cuantas cayeron en la ventana medida y cuanto sumaron. t0: performance.now() en el que m.t vale 0.
    function marcaLargas(m, t0, largas, calent, dur) {
      var r = { n: 0, ms: 0 }, i, k = 0, a = largas.fin, ini = t0 + (calent == null ? CALENTAMIENTO : calent) * 1000, fin = dur == null ? Infinity : ini + dur * 1000;
      for (i = 0; i < a.length; i++) if (a[i] >= ini && a[i] < fin) { r.n++; r.ms += largas.dur[i]; }
      if (!m.cz) return r;
      for (i = 0; i < m.t.length; i++) {
        var hasta = t0 + m.t[i] * 1000, desde = hasta - (m.ms[i] > 0 ? m.ms[i] : 0);
        while (k < a.length && a[k] <= desde) k++;
        if (m.ms[i] > 0 && k < a.length && a[k] <= hasta) m.cz[i] |= 8;
      }
      return r;
    }
    // ms, cz y cq (ms de Cola+teselas del fotograma) ya filtrados como los de calcula. null si la medida no trae causas (una de antes)
    function resumenCausas(ms, cz, cq, umbral) {
      if (!cz || !cz.length) return null;
      var r = { lentos: 0, cola: 0, tesela: 0, lote: 0, tarea: 0, compila: 0, textura: 0, sin: 0, colaMs: 0 }, i, j, cs = [];
      for (i = 0; i < ms.length; i++) {
        if (!(ms[i] > umbral)) continue;
        r.lentos++; if (!cz[i]) r.sin++;
        for (j = 0; j < 6; j++) if (cz[i] & (1 << j)) r[CAUSAS[j]]++;
        if (cq && cq[i] > 0) cs.push(cq[i]);
      }
      r.colaMs = cs.length ? mediana(ordena(cs)) : 0;   // mediana de lo que trabajaron Cola y teselas en los lentos en que trabajaron
      return r;
    }
    function lineaCausas(c, corto) {
      if (!c) return null;
      if (!c.lentos) return "Fotogramas lentos: ninguno";
      var d = [], et = corto ? ["cola", "tesela", "lote", "tarea", "prog", "tex"] : ["Cola", "teselas", "lote de olivos", "tarea larga", "programa nuevo", "textura nueva"];
      CAUSAS.forEach(function (k, i) { if (c[k]) d.push(et[i] + " " + c[k]); });
      d.push("sin causa " + c.sin);
      return (corto ? "Lentos " : "Fotogramas lentos ") + c.lentos + (corto ? ": " : " (pueden solaparse): ") + d.join(" · ") + (!corto && c.cola ? " · la Cola gastó " + f1(c.colaMs) + " ms (mediana)" : "");
    }
    function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
    // las líneas de la tarjeta (corto) o del texto para copiar (largo)
    function lineas(r, corto) {
      var L = [], e = r.est, vr = r.aparato.modo === "VR";
      L.push("Medida del gemelo · " + r.fecha);
      L.push("Aparato: " + r.aparato.modo + (corto ? "" : " · " + r.aparato.ua));
      L.push("Escena: " + r.escena + (r.banderas ? " · " + r.banderas : ""));
      var sobreTx = "Por encima de " + String(e.umbral).replace(".", ",") + " ms: " + e.sobre + " (" + f1(e.pctSobre) + " %)";
      L.push(corto ? e.n + " fotogramas en " + r.duracion + " s · " + e.sobre + " sobre " + String(e.umbral).replace(".", ",") + " ms (" + f1(e.pctSobre) + " %)" : e.n + " fotogramas en " + r.duracion + " s (tras " + r.calentamiento + " s de calentamiento)");
      L.push("Intervalo (ms): mediana " + f1(e.ms.mediana) + " · p95 " + f1(e.ms.p95) + " · p99 " + f1(e.ms.p99) + " · peor " + f1(e.ms.peor));
      if (!corto) L.push(sobreTx);   // en la tarjeta de VR va en la línea de los fotogramas (cabe en 14 líneas)
      var lc = lineaCausas(e.causas, corto); if (lc) L.push(lc);   // Q0g: que se movio en los fotogramas lentos
      L.push("JS por fotograma (ms): mediana " + f1(e.js.mediana) + " · p95 " + f1(e.js.p95) + " · peor " + f1(e.js.peor));
      if (e.rd && e.resto) {   // F0: el techo del multiview (doc/sistema/MULTIVIEW.md): cuánto del JS es renderer.render() y cuánto el resto del fotograma
        if (corto) L[L.length - 1] += " · render() " + f1(e.rd.mediana) + "/" + f1(e.rd.p95) + " · resto " + f1(e.resto.mediana) + "/" + f1(e.resto.p95);
        else { L.push("  de ellos, renderer.render() (ms): mediana " + f1(e.rd.mediana) + " · p95 " + f1(e.rd.p95) + " · peor " + f1(e.rd.peor)); L.push("  de ellos, el resto del JS (ms): mediana " + f1(e.resto.mediana) + " · p95 " + f1(e.resto.p95) + " · peor " + f1(e.resto.peor)); }
      }
      var rr = e.reparto;   // Q0h: de qué es el JS, por bloque
      if (rr && rr.bloques.length) {
        if (corto) { var t4 = [], j; for (j = 0; j < rr.bloques.length && j < 3; j++) t4.push(rr.bloques[j].nom.slice(0, 14) + " " + f1(rr.bloques[j].p95)); t4.push("otros " + f1(rr.otros.p95)); L.push("JS p95: " + t4.join(" · ")); }
        else {
          L.push("Reparto del JS por bloque (ms, mediana / p95; de mayor a menor p95):");
          rr.bloques.forEach(function (b, j) { if (j < 16 && (b.p95 >= 0.05 || j < 6)) L.push("  " + b.nom + ": " + f1(b.mediana) + " / " + f1(b.p95)); });
          L.push("  suma de los bloques: " + f1(rr.suma.mediana) + " / " + f1(rr.suma.p95) + (e.rd ? " · renderer.render(): " + f1(e.rd.mediana) + " / " + f1(e.rd.p95) : "") + " · otros (lo que no cuadra con el JS total): " + f1(rr.otros.mediana) + " / " + f1(rr.otros.p95));
        }
      }
      if (r.multiview) L.push(r.multiview);   // F0: la sonda («multiview: sí/no …»)
      if (r.nivel) {
        L.push("Nivel VR_PERFILES: al empezar " + r.nivel.ini + " · al terminar " + r.nivel.fin + " · cambios " + r.nivel.cambios.length);
        if (!corto) r.nivel.cambios.forEach(function (c) { L.push("  a los " + f1(c.t) + " s: " + c.de + " → " + c.a); });
      }
      if (r.perillas) L.push(r.perillas);   // Q0b: con qué perillas se midió (regla 7)
      if (r.olivos) L.push("Olivos al terminar: N0 " + r.olivos[0] + " · N1 " + r.olivos[1] + " · N2 " + r.olivos[2]);
      if (e.ll || e.tr || typeof r.olivosGen === "boolean" || r.personas != null) {   // Q0e: con qué se dibujó (para decir si manda la CPU o la GPU)
        var d = [];
        if (e.ll) d.push(Math.round(e.ll.mediana) + " llamadas"); if (e.tr) d.push(Math.round(e.tr.mediana) + " triángulos");
        if (typeof r.olivosGen === "boolean") d.push("olivos generados " + (r.olivosGen ? "sí" : "no")); if (r.personas != null) d.push("personas " + r.personas);
        L.push("Por fotograma (mediana): " + d.join(" · "));
      }
      if (!corto && r.largas) L.push("Tareas largas del navegador (≥ 50 ms) durante la medida: " + r.largas.n + (r.largas.n ? " (suman " + Math.round(r.largas.ms) + " ms)" : ""));
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
    // ---- PB9: lo que se manda a la oficina si la persona pulsa «Enviar esta medida a la oficina» (contratos/medidas.md). Nada personal: ni hogar, ni posición, ni IP,
    // ni el agente de usuario entero (solo la clase de aparato, el producto del navegador y su versión mayor).
    function aparatoDe(ua) { ua = String(ua || ""); return /OculusBrowser|Quest/i.test(ua) ? "quest" : /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? "movil" : "escritorio"; }
    function navegadorDe(ua) {
      ua = String(ua || "");
      var casos = [[/OculusBrowser\/(\d+)/, "Quest Browser"], [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"], [/Firefox\/(\d+)/, "Firefox"], [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"], [/Version\/(\d+)[\s\S]*Safari/, "Safari"]], i, m;
      for (i = 0; i < casos.length; i++) if ((m = casos[i][0].exec(ua))) return { nombre: casos[i][1], mayor: Math.min(999, Number(m[1])) };
      return { nombre: "otro", mayor: 0 };
    }
    function limpia(v, patron, por) { v = String(v == null ? "" : v); return patron.test(v) ? v : por; }
    function r2(v) { return Math.round(v * 100) / 100; }
    function entero(v, min, max) { v = Math.round(Number(v)); return isFinite(v) ? Math.max(min, Math.min(max, v)) : null; }
    // Q0e: el texto de las perillas sin el prefijo «VR: », solo con los caracteres que admite la api (el mismo patrón que contratos/medidas.schema.json) y de 80 como mucho; null si queda vacío
    function perillasLimpias(t) {
      t = String(t == null ? "" : t).replace(/^VR:\s*/, "").replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ ,.:;=()+_%·-]/g, "").replace(/\s+/g, " ").trim().slice(0, 80).trim();
      return t || null;
    }
    // x = { ua, finca, modo, version }; null si la medida no sirve (pocos fotogramas, cifras que no cuadran)
    function cuerpoEnvio(r, x) {
      if (!r || !r.est || !(r.est.n >= 10)) return null;
      var m = r.est.ms, nav = navegadorDe(x.ua), vr = !!(r.aparato && r.aparato.modo === "VR");
      var c = {
        aparato: aparatoDe(x.ua), navegador: nav.nombre, nav_mayor: nav.mayor, perfil: vr && r.nivel ? Math.max(-1, Math.min(9, r.nivel.fin | 0)) : -1,
        finca: limpia(x.finca, /^[A-Za-z0-9_-]{1,40}$/, "desconocida"), modo: limpia(x.modo, /^[A-Za-z0-9_-]{1,24}$/, "desconocido"), vr: vr,
        mediana_ms: r2(m.mediana), p95_ms: r2(m.p95), peor_ms: r2(m.peor), fotogramas: r.est.n, duracion_s: r.duracion | 0,
        version: limpia(x.version, /^[0-9A-Za-z.+-]{1,24}$/, "desconocida"), medida_en: r.fecha
      };
      if (!(c.mediana_ms <= c.p95_ms && c.p95_ms <= c.peor_ms) || c.peor_ms > 100000 || c.p95_ms > 10000 || c.duracion_s < 1 || c.duracion_s > 600) return null;
      // Q0e (contrato v2, todo opcional): por qué va como va. Lo que no se pudo medir no se manda. Nada que identifique a nadie: solo cifras, el texto de las perillas y un sí/no.
      var js = r.est.js;
      if (js && js.mediana >= 0 && js.mediana <= js.p95 && js.p95 <= 10000) { c.js_mediana_ms = r2(js.mediana); c.js_p95_ms = r2(js.p95); }
      if (vr && r.nivel) {
        var ni = entero(r.nivel.ini, -1, 9), nf = entero(r.nivel.fin, -1, 9);
        if (ni !== null) c.nivel_ini = ni; if (nf !== null) c.nivel_fin = nf;
        var pe = perillasLimpias(r.perillas); if (pe) c.perillas = pe;
      }
      if (typeof r.olivosGen === "boolean") c.olivos_gen = r.olivosGen;
      var ll = r.est.ll, tr = r.est.tr;
      if (ll) { var l = entero(ll.mediana, 0, 100000); if (l !== null) c.llamadas_med = l; }
      if (tr) { var t = entero(tr.mediana, 0, 100000000); if (t !== null) c.triangulos_med = t; }
      if (r.personas != null) { var pn = entero(r.personas, 0, 500); if (pn !== null) c.personas = pn; }
      return c;
    }
    return { resumenReparto: resumenReparto, BIT: BIT, bits: bits, marcaLargas: marcaLargas, resumenCausas: resumenCausas, lineaCausas: lineaCausas, UMBRAL: UMBRAL, CALENTAMIENTO: CALENTAMIENTO, calcula: calcula, serie: serie, percentil: percentil, mediana: mediana, lineas: lineas, texto: texto, resumeUA: resumeUA, aparatoDe: aparatoDe, navegadorDe: navegadorDe, cuerpoEnvio: cuerpoEnvio, perillasLimpias: perillasLimpias };
  })();
  // [puro:fin]

  var medSuelta = null;   // lo que libera el componente montado
  function MedidorMotor(n) {
    var N = 60, estado = "inactivo", tArma = 0, t0 = 0, m = null, prev = -1, nvPrev = -2, nivIni = null, cambios = [], modoIni = "", res = null, huboVisib = false, UI = null, pCola = 0, pMsT = 0, pNT = 0, pLo = 0, pProg = 0, pTex = 0, hayPrev = false, uCq = 0, largas = null, obsLargas = null, copiado = 0, tPinta = 0, envio = "";   // envio: "" | "enviando" | "ok" | "limite" | "mal"
    var CLAVE = "gemelo_mide";
    var api = { on: false, alTerminar: null };
    function contador() { return typeof Ajustes !== "undefined" && Ajustes ? Ajustes.lee("avanzado.contador") : DEPURA; }   // 33_ajustes.js se monta después: al cargar, solo ?debug
    function modoAhora() { return VRX.on ? "VR" : "pantalla"; }
    function nivelAhora() { return VRX.on ? VRX.nivel : null; }
    // Q0e: ganchos de pruebas del propio motor, sin dependencia nueva: __olivosGen() (07ab) y __presencia() (38). Solo un sí/no y un número; ninguna identidad.
    function olivosGenActivos() { try { var g = window.__olivosGen ? window.__olivosGen() : null; return g ? g.estado === "activo" : undefined; } catch (e) { return undefined; } }
    function personasVisibles() { try { var p = window.__presencia ? window.__presencia() : null; return p && p.activo ? Math.max(0, Math.min(500, Math.round(Number(p.vistos) || 0))) : 0; } catch (e) { return 0; } }
    function banderas() {
      var out = [], r = /[?&]([\w-]+)(?:=([\w.-]*))?/g, x;
      while ((x = r.exec(location.search))) if (/^(escena|olivos?|arbsc|tiles?|lod|calidad)$/.test(x[1])) out.push(x[1] + (x[2] != null ? "=" + x[2] : ""));
      return out.join(" ");
    }
    function arma(seg) { N = Math.max(1, Math.min(600, Number(seg) || 60)); estado = "esperando"; tArma = performance.now(); api.on = true; engancha(); ui(); pinta(); }
    function inicia(seg) {   // el botón: empieza ya, en el modo en que se esté (VR o pantalla)
      if (seg) N = Math.max(1, Math.min(600, Number(seg) || 60));
      empieza(performance.now());
    }
    function empieza(tIni) {
      t0 = tIni; m = { t: [], ms: [], js: [], rd: [], oc: [], ll: [], tr: [], cz: [], cq: [], bl: [], bn: [] }; Reparto.on = true; hayPrev = false; desobservaLargas(); largas = { fin: [], dur: [] }; observaLargas(); prev = -1; nvPrev = -2; nivIni = null; cambios = []; modoIni = modoAhora(); res = null; envio = ""; estado = "midiendo"; api.on = true; engancha();
      if (!huboVisib) { document.addEventListener("visibilitychange", alVisibilidad); huboVisib = true; }
      ui(); pinta();
      if (VRX.on) n.emite("medida:empieza");   // 29_vr.js: el panel no tapa la vista durante la medida
    }
    // el fotograma acaba: 90_final.js emite «cuadro:fin»; solo se escucha mientras está armado o midiendo (sin &mide ni botón pulsado el bucle no paga nada)
    var quitaCuadro = null;
    function engancha() { if (!quitaCuadro) quitaCuadro = n.on("cuadro:fin", function (d) { if (api.on) fotograma(d.t, d); }); }
    function desengancha() { if (quitaCuadro) { quitaCuadro(); quitaCuadro = null; } }
    function alVisibilidad() { prev = -1; }   // el intervalo que cruza un cambio de pestaña no es un fotograma
    // F0 (doc/sistema/MULTIVIEW.md): la sonda del multiview. Solo lee (extensiones del contexto y, con sesión, si una capa de proyección admite «texture-array»); no cambia el dibujo.
    // Se calcula una vez (y otra si hay sesión y antes no la había) y se guarda: ni por fotograma ni con reservas.
    var sonda = "", sondaConSesion = false;
    function sondaMultiview() {
      var ses = null, gl = null, p = [], ext, e2;
      try { ses = renderer.xr && renderer.xr.getSession ? renderer.xr.getSession() : null; } catch (e) { ses = null; }
      if (sonda && (sondaConSesion || !ses)) return sonda;
      try { gl = renderer.getContext(); } catch (e) { gl = null; }
      if (!gl || !gl.getExtension) { sonda = "multiview: no (sin contexto WebGL)"; return sonda; }
      ext = gl.getExtension("OVR_multiview2"); e2 = gl.getExtension("OCULUS_multiview");
      var fn = !!(e2 && typeof e2.framebufferTextureMultisampleMultiviewOVR === "function") || !!(ext && typeof ext.framebufferTextureMultiviewOVR === "function");
      p.push("OVR_multiview2 " + (ext ? "sí" : "no")); p.push("OCULUS_multiview " + (e2 ? "sí" : "no"));
      if (ext) { try { p.push("MAX_VIEWS " + gl.getParameter(ext.MAX_VIEWS_OVR)); } catch (e) {} }
      if (ext || e2) p.push("framebufferTexture…MultiviewOVR " + (fn ? "sí" : "no"));
      p.push("XRWebGLBinding " + (typeof XRWebGLBinding === "function" ? "sí" : "no"));
      p.push("createProjectionLayer " + (typeof XRWebGLBinding === "function" && XRWebGLBinding.prototype && typeof XRWebGLBinding.prototype.createProjectionLayer === "function" ? "sí" : "no"));
      if (ses) {
        var ta = "no";
        try { var capa = new XRWebGLBinding(ses, gl).createProjectionLayer({ textureType: "texture-array", colorFormat: gl.RGBA8, depthFormat: gl.DEPTH_COMPONENT24 }); ta = capa && capa.textureArrayLength != null ? "sí (" + capa.textureArrayLength + " capas)" : "sí"; } catch (e) { ta = "no (" + String(e && e.name || e).slice(0, 24) + ")"; }
        p.push("texture-array " + ta);
      } else p.push("texture-array: sin sesión VR");
      // F2a: en la build de VR (super-three), si se pidió (perilla xrmv, 02f) y si la sesión lo tiene encendido de verdad (renderer.xr.isMultiview); en la de pantalla, «build pantalla»
      var mv = XrPerillas.mv;
      if (!mv || !mv.existe) p.push("build " + Render.build + " (sin multiview)");
      else p.push("build vr · pedido " + (mv.activo ? "sí" : "no") + (ses ? " · en uso " + (renderer.xr && renderer.xr.isMultiview ? "sí" : "no") : ""));
      sondaConSesion = !!ses;
      sonda = "multiview: " + (ext || e2 ? "sí" : "no") + " · " + p.join(" · ");
      return sonda;
    }
    function fotograma(tIni, d) {   // una vez por fotograma, al final de cuadro() (90_final.js: «cuadro:fin»), y solo mientras está armado o midiendo
      var ahora = performance.now(), js = ahora - tIni, msRender = (d && d.r) || 0;
      if (estado === "esperando") {   // armado por &mide: empieza al entrar en VR, o en pantalla si no hay casco (WebXR sin soporte) a los 4 s
        if (VRX.on || (!VRX.soporta && !VRX.entrando && ahora - tArma > 4000)) empieza(tIni); else return;
      }
      if (estado !== "midiendo") return;
      // Q0f: si cambia de pantalla a VR (o al revés) a mitad, vuelve a empezar en el modo nuevo; así «Medir» en el mapa y luego entrar en VR da una medida de VR entera
      if (modoIni !== modoAhora()) { empieza(tIni); return; }
      var t = (tIni - t0) / 1000, nv = nivelAhora();
      if (t >= MideEst.CALENTAMIENTO && nivIni === null) nivIni = nv === null ? -1 : nv;
      if (nvPrev !== -2 && nv !== nvPrev && t >= MideEst.CALENTAMIENTO) cambios.push({ t: t - MideEst.CALENTAMIENTO, de: nvPrev === null ? -1 : nvPrev, a: nv === null ? -1 : nv });
      nvPrev = nv;
      var oculto = document.hidden && !renderer.xr.isPresenting, cz = causasDelFotograma();
      if (prev >= 0 || oculto) {
        var rr = (renderer.info && renderer.info.render) || {};   // Q0e: lo que costó dibujar este fotograma (el último render(): en VR three dibuja los dos ojos en uno)
        m.t.push(t); m.ms.push(prev >= 0 ? tIni - prev : 0); m.js.push(js); m.rd.push(msRender); m.oc.push(oculto ? 1 : 0); m.ll.push(rr.calls | 0); m.tr.push(rr.triangles | 0); m.cz.push(cz); m.cq.push(uCq); apuntaReparto(tIni);
      }
      prev = oculto ? -1 : tIni;
      if (t >= MideEst.CALENTAMIENTO + N) termina(); else if (UI && ahora - tPinta > 500) { tPinta = ahora; pinta(); }
    }
    // Q0g: tareas largas del navegador (PerformanceObserver «longtask», Chromium: tambien el Quest Browser). Las entrega el navegador a su ritmo; se asignan a los fotogramas al terminar la medida
    function observaLargas() {
      desobservaLargas();
      try {
        if (typeof PerformanceObserver !== "function" || !PerformanceObserver.supportedEntryTypes || PerformanceObserver.supportedEntryTypes.indexOf("longtask") < 0) return;
        obsLargas = new PerformanceObserver(function (l) { guardaLargas(l.getEntries()); });
        obsLargas.observe({ entryTypes: ["longtask"] });
      } catch (e) { obsLargas = null; }
    }
    function guardaLargas(a) { if (!largas) return; for (var i = 0; i < a.length; i++) { largas.fin.push(a[i].startTime + a[i].duration); largas.dur.push(a[i].duration); } }
    function desobservaLargas() { if (obsLargas) { try { guardaLargas(obsLargas.takeRecords()); obsLargas.disconnect(); } catch (e) {} obsLargas = null; } }
    // Q0g: lo que se movio en este fotograma, como un entero de bits (MideEst.bits) y SIN reservar: lee contadores (Cola.tot, Cola.est.T, Generados.lotes, renderer.info) y los resta de los de la ultima vez
    function causasDelFotograma() {
      var eT = Cola.est.T, msT = eT ? eT.ms : 0, nT = eT ? eT.n : 0, msC = Cola.tot.ms - msT, nl = Generados.lotes(), inf = renderer.info, pg = inf.programs ? inf.programs.length : 0, tx = inf.memory ? inf.memory.textures : 0, b = 0;
      uCq = 0;
      if (hayPrev) { b = MideEst.bits(msC - pCola, nT - pNT, nl - pLo, pg - pProg, tx - pTex); uCq = msC - pCola + (msT - pMsT); if (!(uCq > 0)) uCq = 0; }
      pCola = msC; pMsT = msT; pNT = nT; pLo = nl; pProg = pg; pTex = tx; hayPrev = true;
      return b;
    }
    // Q0h: los ms de cada bloque de este fotograma (Reparto, 02c; los llena cuadro() de 90_final.js solo mientras se mide). Un bloque que aparece tarde se rellena con ceros hacia atrás
    function apuntaReparto(tIni) {
      var R = Reparto, hay = R.t === tIni, k, a;
      for (k = 0; k < R.n; k++) {
        a = m.bl[k]; if (!a) { a = m.bl[k] = []; /* reserva-ok */ while (a.length < m.t.length - 1) a.push(0); m.bn[k] = R.nom[k]; }
        a.push(hay ? R.ms[k] : 0);
      }
      for (; k < m.bl.length; k++) m.bl[k].push(0);
    }
    function termina() {
      Reparto.on = false;
      desobservaLargas();
      var largasR = largas ? MideEst.marcaLargas(m, t0, largas, MideEst.CALENTAMIENTO, N) : null, e = MideEst.calcula(m, MideEst.CALENTAMIENTO, N), a = Arboles.resumen(), nv = nivelAhora(), avisos = [];
      if (modoIni !== modoAhora()) avisos.push("cambió de " + modoIni + " a " + modoAhora() + " durante la medida");
      if (e.n < 10) avisos.push("muy pocos fotogramas: la medida no sirve");
      res = {
        version: 1, fecha: new Date().toISOString().slice(0, 19) + "Z", aparato: { modo: modoIni, ua: MideEst.resumeUA(Aparato.agente()) },
        escena: Escena3D.resumen().estado === "sin" ? "sin" : "tiles", banderas: banderas(), duracion: N, calentamiento: MideEst.CALENTAMIENTO, est: e, largas: largasR,
        nivel: modoIni === "VR" ? { ini: nivIni === null ? -1 : nivIni, fin: nv === null ? -1 : nv, cambios: cambios } : null, olivos: [a.nivel0, a.nivel1, a.nivel2], avisos: avisos, perillas: modoIni === "VR" ? XrPerillas.linea() : "",
        multiview: sondaMultiview(), olivosGen: olivosGenActivos(), personas: personasVisibles()   // Q0e: con qué se dibujó (si los olivos generados estaban y cuánta gente se veía)
      };
      estado = "listo"; api.on = false; largas = null; desengancha(); prev = -1;
      if (huboVisib) { document.removeEventListener("visibilitychange", alVisibilidad); huboVisib = false; }
      guarda(); ui(); pinta();
      if (VRX.on) n.emite("medida:fin");   // 29_vr.js: la tarjeta con el resultado sobre el panel
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
    // PB9: manda la medida a la api SOLO a petición (el botón), al mismo origen (CLAUDE.md §5). Sin api (página sin servidor) no hay botón. Devuelve una promesa del estado.
    function prefijo() { try { return ConfigPuro.prefijoApi(location.search, D && D.base); } catch (e) { return null; } }
    function puedeEnviar() { return estado === "listo" && !!res && !!prefijo() && typeof fetch === "function" && envio !== "ok" && envio !== "enviando" && !!cuerpo(); }
    function cuerpo() {
      var ver = typeof __GEMELO_VERSION__ !== "undefined" ? __GEMELO_VERSION__ : "dev";   // lo inyecta Vite (apps/web/vite.config.js) desde VERSION
      return MideEst.cuerpoEnvio(res, { ua: Aparato.agente(), finca: D && D.finca_id, modo: modo, version: ver });
    }
    function envia() {
      var c = puedeEnviar() ? cuerpo() : null, pre = prefijo();
      if (!c || !pre) return Promise.resolve(envio);
      envio = "enviando"; pinta(); n.emite("medida:envio");
      return fetch(pre + "medidas", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(c) })
        .then(function (r) { envio = r.status === 201 ? "ok" : r.status === 429 ? "limite" : "mal"; }, function () { envio = "mal"; })
        .then(function () { pinta(); n.emite("medida:envio"); return envio; });
    }
    function textoEnvio() { return envio === "enviando" ? "Enviando…" : envio === "ok" ? "Enviada a la oficina" : envio === "limite" ? "Ya mandaste varias hoy" : envio === "mal" ? "No se pudo enviar" : "Enviar esta medida a la oficina"; }
    function copia() {
      if (!res) return;
      var tx = MideEst.texto(res);
      function notifica(ok) { copiado = ok ? 1 : 2; pinta(); setTimeout(function () { copiado = 0; pinta(); }, 2500); }
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(tx).then(function () { notifica(true); }, function () { alt(); }); return; } } catch (e) {}
      alt();
      function alt() {
        try { var ta = document.createElement("textarea"); ta.value = tx; ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.name = "copia-portapapeles"; ta.select(); var ok = document.execCommand("copy"); document.body.removeChild(ta); notifica(ok); } catch (e) { notifica(false); }
      }
    }
    // la caja de pantalla: junto al contador de ?debug (o sola si se arma con &mide sin ?debug)
    function ui() {
      if (UI || !(contador() || api.on || estado !== "inactivo")) return;
      UI = document.createElement("div"); UI.id = "mideCaja";
      UI.style.cssText = "position:absolute;right:8px;bottom:8px;z-index:30;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.78);color:#a8f0b0;padding:5px 7px;border-radius:5px;max-width:min(92%,430px)";
      var b1 = document.createElement("button"), b2 = document.createElement("button"), b3 = document.createElement("button"), pre = document.createElement("pre");
      b1.type = b2.type = b3.type = "button"; b1.id = "mideMide"; b2.id = "mideCopia"; b3.id = "mideEnvia";
      [b1, b2, b3].forEach(function (b) { b.style.cssText = "font:inherit;margin-right:6px;padding:3px 8px;border-radius:4px;border:1px solid #5a8a62;background:#1d2b20;color:#d6ffdc;cursor:pointer"; });
      b1.addEventListener("click", function () { inicia(); }); b2.addEventListener("click", copia); b3.addEventListener("click", envia); b3.hidden = true;
      b3.title = "Manda a la oficina solo cifras de esta medida: aparato y navegador, perfil, perillas de VR, milisegundos, llamadas y triángulos, si había olivos generados y cuántas personas se veían. Nada de tu hogar, tu posición ni tu IP.";
      pre.style.cssText = "margin:5px 0 0;white-space:pre-wrap;font:inherit"; pre.id = "mideTexto";
      UI.appendChild(b1); UI.appendChild(b2); UI.appendChild(b3); UI.appendChild(pre); visor.appendChild(UI); UI.b1 = b1; UI.b2 = b2; UI.b3 = b3; UI.pre = pre;
    }
    function pinta() {
      if (!UI) return;
      UI.b1.textContent = estado === "midiendo" ? "Midiendo…" : "Medir " + N + " s"; UI.b1.disabled = estado === "midiendo";
      UI.b2.textContent = copiado === 1 ? "Copiado" : copiado === 2 ? "No se pudo copiar" : "Copiar"; UI.b2.disabled = !res;
      UI.b3.hidden = !(estado === "listo" && res && prefijo() && cuerpo()); UI.b3.textContent = textoEnvio(); UI.b3.disabled = !puedeEnviar();
      UI.pre.textContent = res ? MideEst.texto(res) : (estado === "midiendo" ? linea().trim() : estado === "esperando" ? linea().trim() : "");
    }
    // Configuración → Avanzado: la caja sale o se esconde con el contador (armada por &mide o midiendo, se queda)
    api.muestra = function (on) { if (on) ui(); if (UI) UI.style.display = on || api.on || estado === "esperando" || estado === "midiendo" ? "" : "none"; };
    api.envia = envia; api.puedeEnviar = puedeEnviar; api.textoEnvio = textoEnvio; api.envio = function () { return envio; };
    api.sonda = sondaMultiview; api.arma = arma; api.inicia = inicia; api.cuadro = fotograma; api.linea = linea; api.copia = copia; api.historial = historial;
    api.resultado = function () { return res; }; api.estado = function () { return estado; }; api.segundos = function () { return N; };
    window.__mide = function () { return { estado: estado, n: N, resultado: res, texto: res ? MideEst.texto(res) : "", historial: historial() }; };
    // lo que antes llamaban a mano 28_depura (la línea del contador), 29_vr (la tarjeta de la medida) y 33_ajustes (Medir y la caja del contador) llega por el Bus
    n.on("depura:lineas", function (d) { var t = linea().replace(/\n$/, ""); if (t && d && d.lineas) d.lineas.push(t); });
    n.on("medida:estado", function (q) {   // 29_vr.js pregunta por lo que pinta la tarjeta del panel de VR
      if (q) q.res = { resultado: res, lineas: res ? MideEst.lineas(res, true) : [], puedeEnviar: puedeEnviar(), envio: envio, textoEnvio: textoEnvio() };
    });
    n.on("medida:envia", function () { envia(); });
    n.on("medida:inicia", function (d) { inicia(d && d.segundos); });
    n.on("medida:muestra", function (d) { api.muestra(!!(d && d.on)); });
    // la fila «Medida» de la pestaña Comodidad del panel de VR (solo con ?debug), que 29_vr.js ya no conoce
    n.limpia(PanelVR.filas("comodidad", { id: "multiview", orden: 55, alto: 88, visible: function () { return DEPURA; }, pinta: function (cx, y, W, h) { h.fila(sondaMultiview().replace(/^multiview: (sí|no).*?(?:en uso (sí|no))?$/, function (t, a, u) { return "Multiview: " + a + (u ? " · en uso " + u : ""); }), y); } }));   // F0: sí/no; el detalle va en el contador y en el informe
    n.limpia(PanelVR.filas("comodidad", { id: "mide", orden: 50, alto: 88, visible: function () { return DEPURA; }, pinta: function (cx, y, W, h) { h.fila("Medida", y); },
      botones: function (b, y) { b("mide", 420, y, 470, 64, "Medir " + N + " s", function () { inicia(); }, estado === "midiendo"); } }));
    var param = /[?&]mide(?:=(\d+))?(?=&|$)/.exec(location.search);
    if (param) arma(param[1] ? Number(param[1]) : 60); else if (contador()) ui();
    medSuelta = function () {   // libera: la caja del DOM, la escucha de la pestaña, el gancho de pruebas y lo que estaba midiendo
      Reparto.on = false; desengancha(); desobservaLargas(); if (huboVisib) { document.removeEventListener("visibilitychange", alVisibilidad); huboVisib = false; }
      if (UI && UI.parentNode) UI.parentNode.removeChild(UI);
      UI = null; api.on = false; estado = "inactivo"; res = null; m = null; try { delete window.__mide; } catch (e) { window.__mide = undefined; }
    };
    return api;
  }
  Componentes.registra({
    id: "medidor-fotogramas", version: 1,
    consume: ["Aparato", "Cola", "Generados", "visor", "renderer", "modo", "D", "DEPURA", "ConfigPuro", "Ajustes", "Arboles", "Escena3D", "VRX", "PanelVR", "XrPerillas", "Render", "Reparto"],
    expone: [],
    eventos: { escucha: ["cuadro:fin", "depura:lineas", "medida:estado", "medida:envia", "medida:inicia", "medida:muestra"], emite: ["medida:empieza", "medida:envio", "medida:fin"] },
    bandera: { defecto: true, url: "medidor" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // no dibuja nada en la escena: solo una caja de DOM (con ?debug, &mide o el botón de Configuración → Avanzado)
    fases: {},
    monta: function (n) { return MedidorMotor(n); },
    actualiza: {},
    libera: function () { if (medSuelta) medSuelta(); medSuelta = null; }
  });
