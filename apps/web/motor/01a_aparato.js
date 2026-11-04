// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Aparato
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- AG-0.3: UNA sola detección del aparato (doc/sistema/COMPONENTES.md#aparato, doc/sistema/VR.md#que-clase-ve-cada-aparato).
  // Antes, ocho ficheros leían navigator.userAgent cada uno con su regla (y 07b_arboles no reconocía las Quest). Ahora este es el ÚNICO sitio del motor
  // que lee navigator.userAgent / deviceMemory / hardwareConcurrency / maxTouchPoints (lo vigila pruebas/guardianes/aparato.test.js); el resto pregunta:
  //   Aparato.clase()        "escritorio" | "movil" | "quest" (por el agente y, para el iPad que dice ser un Mac, por el táctil)
  //   Aparato.modelo()       "quest-2" | "quest-3" | "quest-3s" | "quest-pro" si el agente lo declara; "" si no (no se inventa)
  //   Aparato.vr()           ¿sesión inmersiva ahora? (necesita Aparato.enlaza, que lo enlaza 03_escena)
  //   Aparato.capacidades()  lo MEDIDO en este aparato (WebGL2, extensiones, MSAA máximo, textura máxima, memoria, núcleos, táctil); null = «no medido»
  //   Aparato.politica()     la política por clase (MEJORAS-TECNICAS.md): qué presupuesto y qué extras corresponden; los valores son los que el motor ya usaba
  //   Aparato.linea()        la línea de ?debug; window.__aparato() el estado para la telemetría (sin el agente completo: no identifica a nadie)
  //   Aparato.agente()       el agente de usuario en bruto, SOLO para la medida que el usuario decide enviar (30_mide); no para decidir nada
  //   Aparato.pon(clase, o)  SOLO PARA PRUEBAS: fuerza clase (y { modelo, memoria, vr }); Aparato.pon(null) lo deshace. Las pruebas que simulan navigator usan esto
  // Todo es tolerante: sin navigator, sin WebGL o con un agente raro o vacío no lanza y cae a «escritorio». Presupuesto (regla 6): no dibuja ni reserva nada.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/aparato.test.js)
  var AparatoPuro = (function () {
    var CLASES = ["escritorio", "movil", "quest"];
    var NOMBRES = { "quest-2": "Quest 2", "quest-3": "Quest 3", "quest-3s": "Quest 3S", "quest-pro": "Quest Pro" };
    var EXTENSIONES = { astc: "WEBGL_compressed_texture_astc", etc: "WEBGL_compressed_texture_etc", s3tc: "WEBGL_compressed_texture_s3tc", multiview: "OVR_multiview2" };
    function texto(v) { return typeof v === "string" ? v : ""; }
    function numero(v) { return typeof v === "number" && isFinite(v) ? v : null; }
    function modeloQuest(ua) {
      var m = /Quest ?(Pro|3S|3|2)\b/i.exec(texto(ua)); if (!m) return "";
      return "quest-" + m[1].toLowerCase();
    }
    // agente: cadena; tactil: navigator.maxTouchPoints; memoria: navigator.deviceMemory (GB, redondeada por el navegador). Devuelve { clase, modelo, memoriaBaja }
    function clasifica(agente, tactil, memoria) {
      var ua = texto(agente), t = numero(tactil) || 0, mem = numero(memoria), clase = "escritorio", modelo = "";
      if (/OculusBrowser|Quest/i.test(ua)) { clase = "quest"; modelo = modeloQuest(ua); }
      else if (/VisionOS|Vision ?Pro/i.test(ua)) clase = "escritorio";
      else if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) clase = "movil";
      else if (/Macintosh/.test(ua) && t > 1) clase = "movil";   // el iPad de Safari dice ser un Mac; un Mac no tiene pantalla táctil
      return { clase: clase, modelo: modelo, memoriaBaja: mem !== null && mem > 0 && mem <= 4 };
    }
    // La política por clase. Los valores que el motor ya usaba se mantienen: ortoMax (02_mundo), cacheMemMB (07ab_generados), olivosLigero (07b_arboles: el presupuesto
    // «de móvil»; en VR manda el perfil de las gafas). «ligero» = lo que el motor llamaba «móvil»: móvil, gafas o poca memoria (≤ 4 GB).
    // Los campos marcados (previsto) son la intención de MEJORAS-TECNICAS.md para AG-2.x: hoy nadie los consume.
    function politica(clase, memoriaBaja, caps) {
      var ligero = clase !== "escritorio" || !!memoriaBaja, deEsc = clase === "escritorio", msaa = caps && numero(caps.msaa) ? caps.msaa : 0;
      return {
        clase: clase, ligero: ligero,
        perfilOlivos: clase === "quest" ? "gafas" : ligero ? "movil" : "escritorio",   // de dónde sale el tope de triángulos: 550 k escritorio, el de móvil, el perfil de las gafas
        olivosLigero: ligero,                  // 07b_arboles: ¿tope «de móvil» fuera de VR?
        ortoMax: ligero ? 8 : 20,              // 02_mundo: ortofotos decodificadas a la vez
        cacheMemMB: ligero ? 60 : 150,         // 07ab_generados: caché de recetas en memoria fuera de VR
        cacheMemVrMB: 60,                      // ... y en VR
        // AG-1.5: tope de ms por fotograma para TODO lo que carga a rebanadas (la cola de trabajos de 02b, los olivos generados y lo que el tileset gastó
        // en el motor el fotograma anterior, la «deuda»). 07b_arboles recorta con él su presupuesto de siempre (3-12 ms según falten olivos y vaya holgado): escritorio
        // 12 = sin recorte (el máximo que ya daba); ligero 6 (60 Hz: ~1/3 de 16,7 ms); en VR 3 (72 Hz: ~1/5 de 13,9 ms, con la mediana de JS medida
        // en un Quest de 6,9-7,5 ms). [SUPUESTO] valores de partida sin medir en un aparato: se ajustan con ?debug&mide=60 en el Quest (doc del encargo)
        cargaMs: ligero ? 6 : 12, cargaMsVr: 3,
        // AG-1.5: teselas del tileset que la librería de 3D Tiles analiza a la vez (parseQueue.maxJobs; la librería trae 5): menos en móvil y en VR para que
        // no lleguen varias juntas al mismo fotograma (cada una dispara load-model y su subida a la GPU). [SUPUESTO] sin medir en un aparato
        tilesParse: ligero ? 3 : 5, tilesParseVr: 2,
        postprocesado: deEsc,                    // (previsto) solo escritorio
        sombras: deEsc ? "normales" : "cortas",  // (previsto) cortas en móvil y gafas
        relieveFino: clase !== "quest",        // (previsto) las gafas ya lo bajan por perfil
        alphaToCoverage: msaa >= 4,            // (previsto) solo con MSAA de verdad
        toneMapping: deEsc                       // (previsto) solo escritorio
      };
    }
    // lo medido en un contexto WebGL (gl) y en navigator (nv); cada cosa que no se puede medir queda null, nunca inventada
    function capacidadesDe(gl, nv) {
      nv = nv || {};
      var c = { webgl2: null, msaa: null, maxTextura: null, astc: null, etc: null, s3tc: null, multiview: null,
        memoria: numero(nv.deviceMemory), nucleos: numero(nv.hardwareConcurrency), tactil: numero(nv.maxTouchPoints) === null ? null : nv.maxTouchPoints > 0 };
      if (!gl) return c;
      try {
        c.webgl2 = typeof gl.getInternalformatParameter === "function";
        if (c.webgl2 && gl.MAX_SAMPLES) c.msaa = numero(gl.getParameter(gl.MAX_SAMPLES));
        if (gl.MAX_TEXTURE_SIZE) c.maxTextura = numero(gl.getParameter(gl.MAX_TEXTURE_SIZE));
        var ex = typeof gl.getSupportedExtensions === "function" ? gl.getSupportedExtensions() || [] : null;
        if (ex) Object.keys(EXTENSIONES).forEach(function (k) { c[k] = ex.indexOf(EXTENSIONES[k]) >= 0; });
      } catch (e) { /* el contexto se perdió: lo que quedó sin medir queda null */ }
      return c;
    }
    function sino(v) { return v === null || v === undefined ? "?" : v ? "sí" : "no"; }
    // «Aparato: Quest 3 · VR · MSAA 4 · ASTC sí»
    function linea(e) {
      e = e || {}; var c = e.capacidades || {}, n = NOMBRES[e.modelo] || (e.clase === "quest" ? "Quest" : e.clase === "movil" ? "Móvil" : "Escritorio");
      return "Aparato: " + n + (e.vr ? " · VR" : "") + " · MSAA " + (c.msaa === null || c.msaa === undefined ? "?" : c.msaa) + " · ASTC " + sino(c.astc);
    }
    return { CLASES: CLASES, NOMBRES: NOMBRES, EXTENSIONES: EXTENSIONES, clasifica: clasifica, modeloQuest: modeloQuest, politica: politica, capacidadesDe: capacidadesDe, linea: linea };
  })();
  // [puro:fin]

  var Aparato = (function () {
    var nv = typeof navigator !== "undefined" && navigator ? navigator : {};
    var enlace = { vr: null, gl: null, sesion: null }, forzado = null, base = null, caps = null;
    function lee() { if (!base) base = AparatoPuro.clasifica(nv.userAgent, nv.maxTouchPoints, nv.deviceMemory); return base; }
    function actual() { return forzado ? { clase: forzado.clase, modelo: forzado.modelo, memoriaBaja: forzado.memoriaBaja } : lee(); }
    function clase() { return actual().clase; }
    function modelo() { return actual().modelo; }
    function vr() {
      if (forzado && forzado.vr !== null) return forzado.vr;
      try { return !!(enlace.vr && enlace.vr()); } catch (e) { return false; }
    }
    function gl() { try { return enlace.gl ? enlace.gl() : null; } catch (e) { return null; } }
    // lo medido: se completa cuando hay contexto (tras 03_escena) y, dentro de una sesión inmersiva, con lo que declara la sesión (frecuencia, mezcla)
    function capacidades() {
      var g = gl(), c;
      if (caps && (caps.gl === g)) c = caps.c; else { c = AparatoPuro.capacidadesDe(g, nv); caps = { gl: g, c: c }; }
      var r = Object.assign({}, c);
      if (forzado && forzado.memoria !== undefined) r.memoria = forzado.memoria;
      r.vr = null;
      if (vr()) {
        try {
          var s = enlace.sesion ? enlace.sesion() : null, at = g && g.getContextAttributes ? g.getContextAttributes() : null;
          r.vr = { frecuencia: s && typeof s.frameRate === "number" ? s.frameRate : null, mezcla: s && s.environmentBlendMode ? s.environmentBlendMode : null, msaaContexto: at ? !!at.antialias : null };
        } catch (e) { r.vr = { frecuencia: null, mezcla: null, msaaContexto: null }; }
      }
      return r;
    }
    function politica() { var a = actual(); return AparatoPuro.politica(a.clase, a.memoriaBaja, capacidades()); }
    function linea() { return AparatoPuro.linea({ clase: clase(), modelo: modelo(), vr: vr(), capacidades: capacidades() }); }
    function agente() { return typeof nv.userAgent === "string" ? nv.userAgent : ""; }
    // 03_escena enlaza el renderizador: { vr: () => bool, gl: () => contexto, sesion: () => XRSession|null }
    function enlaza(o) { enlace = { vr: (o && o.vr) || null, gl: (o && o.gl) || null, sesion: (o && o.sesion) || null }; caps = null; }
    // SOLO PARA PRUEBAS (doc/sistema/COMPONENTES.md#aparato): Aparato.pon("quest", { modelo: "quest-3", memoria: 8, vr: true }); Aparato.pon(null) lo deshace
    function fuerza(c, o) {
      if (c === null || c === undefined) { forzado = null; return; }
      if (AparatoPuro.CLASES.indexOf(c) < 0) return;
      o = o || {}; var mem = typeof o.memoria === "number" ? o.memoria : undefined;
      forzado = { clase: c, modelo: texto2(o.modelo), memoriaBaja: mem !== undefined && mem > 0 && mem <= 4, memoria: mem, vr: typeof o.vr === "boolean" ? o.vr : null };
    }
    function texto2(v) { return typeof v === "string" ? v : ""; }
    // el estado para la telemetría y para ?debug: clase, modelo, capacidades y política. NUNCA el agente completo
    function estado() { return { clase: clase(), modelo: modelo(), vr: vr(), capacidades: capacidades(), politica: politica(), linea: linea() }; }
    if (typeof window !== "undefined" && window) window.__aparato = estado;
    var api = { clase: clase, modelo: modelo, vr: vr, capacidades: capacidades, politica: politica, linea: linea, agente: agente, enlaza: enlaza, estado: estado };
    api.pon = fuerza;   // solo pruebas
    return api;
  })();

